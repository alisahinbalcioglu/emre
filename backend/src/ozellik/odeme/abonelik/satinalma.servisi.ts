import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AbonelikBaslatmaDurumu,
  AbonelikDurumu,
  OdemeYontemi,
} from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { IyzicoClient, IyzicoHatasi } from '../iyzico/iyzico.client';
import { AbonelikServisi } from './abonelik.servisi';
import { kartAboneligiKapaliMi } from './kart-kapatma';
import { ceviriKotasiCoz } from './ceviri-kotasi';
import { DenemeKarari } from './deneme-hakki';
import { DenemeHakkiServisi } from './deneme-hakki.servisi';
import {
  KART_ABONELIGI_ACIK_MESAJI,
  yeniAbonelikEngeli,
  yeniAbonelikEngelliMi,
} from './paket-degisimi';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { iptalOnayiEpostasi } from '../eposta/musteri-epostalari';
import { HUKUKI_METIN_SURUMU } from '../../../altyapi/auth/hukuki-surum';

// Tanim deneme-hakki.ts'e tasindi (dairesel import onlemi, bkz. oradaki not);
// mevcut import yollari (test/satinalma-yolu-test.ts) bozulmasin diye buradan
// da disa acilir.
export { MIRAS_ONEKI, mirasPaketiMi } from './deneme-hakki';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SATIN ALMA — kart aboneliginin BASLATILMASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA GELEN PAKETTE YOKTU. Olculmus eksik:
 *
 *  `IyzicoClient` uzerinde `abonelikBaslat`, `formSonucu`,
 *  `kartGuncellemeSayfasi`, `abonelikIptal` ve `paketDegistir` metotlari
 *  TANIMLIYDI ama HICBIRININ CAGRI YERI YOKTU (olculdu: 5 metot × 0 cagri).
 *  Ayni sekilde `Abonelik.iyzicoAbonelikKodu` alani 8 yerde OKUNUYOR, hicbir
 *  yerde YAZILMIYORDU; `prisma.abonelik.create` yalnizca HAVALE yolunda
 *  geciyordu.
 *
 *  Sonuc: paket, abonelik VAR OLDUKTAN SONRASINI eksiksiz yonetiyordu
 *  (webhook, dunning, mutabakat, fatura) ama aboneligi ACAN yol yoktu.
 *  Kart ile kimse abone OLAMAZ, her webhook eslesmeyen abonelik kodu ile
 *  gelip yutulurdu. OKUBENI.md'nin "entegrasyonun kurulu oldugu varsayiliyor"
 *  cumlesi bu depoda TUTMUYOR — kurulu degildi.
 *
 *  ── DONUSUN GUVENILMEZLIGI ──────────────────────────────────────────────
 *  iyzico donus adresine yalnizca opak bir `token` POST eder ve bu POST'un
 *  imzasi dokumante EDILMEMISTIR. Bu yuzden:
 *    1. Donus govdesine ASLA guvenilmez — sadece "git ve sor" tetigidir.
 *    2. Gercek sonuc `formSonucu(token)` ile iyzico'dan SORULUR.
 *    3. token→firma baglantisi bizim `AbonelikBaslatma` tablomuzdan gelir;
 *       istekle gelen firmaId'ye guvenilmez.
 *
 *  ── ODEDI AMA ERISIM ACILMADI (kurtarma) ───────────────────────────────
 *  Musteri karti girip tahsilat gectikten SONRA sekmeyi kapatirsa donus hic
 *  gelmez. O hâlde abonelik satiri acilmaz, webhook eslesmeyen kodla gelip
 *  yutulur ve musteri ODEDIGI HALDE erisim ALAMAZ.
 *  `bekleyenNiyetleriTara` bu dongunun panzehiridir: donusu gelmemis
 *  niyetleri iyzico'ya sorar ve tahsilat gectiyse aboneligi SUNUCU TARAFINDA
 *  acar. Erisim, musterinin tarayicisini acik tutmasina bagli DEGILDIR.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * Webhook gecikme tamponu (gun).
 *
 * ⚠ OLCULEN KENAR DURUM: deneme 30 gunse iyzico TAM 30. gunde tahsilat
 * yapar. Erisimimiz de tam 30. gunde bitiyorsa, webhook birkac dakika
 * gecikirse `ErisimServisi` "deneme suresi doldu" der ve PARASINI ODEMIS
 * musteriyi kapida birakir. iyzico webhook'u 2xx alana kadar 15 dakikada
 * bir dener; surec yeniden baslarsa dakikalik emniyet taramasi devreye
 * girene kadar gecikme uzayabilir.
 *
 * Iki yon de tartildi: odeme GERCEKTEN basarisizsa musteri 2 gun fazladan
 * erisir — sinirli ve kabul edilebilir. Tersi (odeyene kapiyi kapatmak)
 * destek talebi ve guven kaybi uretir.
 */
export const TAMPON_GUN = 2;

/**
 * Erisim bitisini ve GERCEK deneme bitisini hesaplar. SAF fonksiyon —
 * DB'siz test edilebilsin diye disari alindi (metin denetimi degil
 * DAVRANIS olculebilsin).
 *
 * ⚠ IKI TARIH AYRIDIR ve ayni degere baglanmamalidir:
 *   erisimSonu  → teknik emniyet payi TASIR (tampon dahil)
 *   denemeSonu  → kullaniciya GOSTERILEN ve iyzico'nun tahsilat yapacagi
 *                 tarih; tamponsuz. Ikisi birlesirse ekran "2 gun daha
 *                 deneme var" yalanini soyler.
 */
export function donemTarihleriHesapla(
  simdi: Date,
  denemeGunu: number,
): { erisimSonu: Date; denemeSonu: Date | null } {
  const temelGun = denemeGunu > 0 ? denemeGunu : 31;
  const erisimSonu = new Date(
    simdi.getTime() + (temelGun + TAMPON_GUN) * 86_400_000,
  );
  const denemeSonu =
    denemeGunu > 0
      ? new Date(simdi.getTime() + denemeGunu * 86_400_000)
      : null;
  return { erisimSonu, denemeSonu };
}

// `yeniAbonelikEngelliMi` paket-degisimi.ts'e TASINDI (23.09): satin alma
// kapisi ile paket degisim kapisi AYNI kurali okumak zorunda. Mevcut import
// yollari bozulmasin diye buradan da disa acilir.
export { yeniAbonelikEngelliMi };

/**
 * ⚠ CIFT ABONELIK (olcum 15.09, curutucu bulgusu): ayni firma iki odeme formu
 * acip IKISINI de tamamlarsa iki iyzico aboneligi olusur. Eski kod ikinci
 * sonuclandirmada `iyzicoAbonelikKodu` ve `iyzicoKokKodu`yu EZIYORDU: ilk
 * iyzico aboneligi sahipsiz kalir, webhook'lari "bilinmeyen abonelik kodu"
 * diye yutulur ve kart HER AY cekilmeye devam eder. `baslat` kapisi bunu
 * yakalayamaz — iki form da abonelik yokken acilir.
 *
 * SAF: firmanin engelleyici bir aboneligi BASKA bir iyzico koduyla zaten
 * varsa bu sonuclandirma ikinci aboneliktir. Ayni kod = ayni niyetin
 * yeniden sonuclandirilmasi (kurtarma taramasi), ikinci degil.
 */
export function ikinciAbonelikMi(
  mevcut:
    | (Parameters<typeof yeniAbonelikEngelliMi>[0] & {
        iyzicoAbonelikKodu: string | null;
      })
    | null,
  yeniKod: string,
): boolean {
  return (
    yeniAbonelikEngelliMi(mevcut) &&
    !!mevcut!.iyzicoAbonelikKodu &&
    mevcut!.iyzicoAbonelikKodu !== yeniKod
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PLAN SECIMI — deneme hakki kararinin iyzico planina cevrilmesi (6.12a)
 * ═══════════════════════════════════════════════════════════════════════════
 * SAF. Deneme gunu iyzico'da PLANA yazilidir; abonelik baslatma istegi deneme
 * alani tasimaz. Yani hakki olmayan firmaya "yerelde AKTIF yaz" YETMEZ — iyzico
 * denemeli planla 30 gun cekmez, musteri 30. gunden once iptal eder.
 *
 *   surum denemesiz            → ana plan (zaten denemesiz), deneme 0
 *   hak var                    → ana (denemeli) plan, surumun deneme gunu
 *   e-posta dogrulanmamis      → plan YOK: gerekceli red (K-P4)
 *   hak yok, ikiz plan var     → denemesiz ikiz plan, deneme 0
 *   hak yok, ikiz plan YOK     → plan YOK: KAPALI HATA (K-P2)
 *
 * ⚠ SON DAL ASLA ana plana DUSMEZ: "ikiz plan yoksa denemeli olsun" demek
 * acigi SESSIZCE geri acmaktir. Satis durur ama gunluge hata yazilir ve
 * musteri gerekceli mesaj gorur.
 */
export type PlanSecimi =
  | { tur: 'plan'; planKodu: string; denemeGunu: number; denemeHakki: boolean }
  | { tur: 'eposta-dogrulanmadi' }
  | { tur: 'denemesiz-plan-yok' };

export function planSec(
  surum: {
    iyzicoPlanKodu: string;
    iyzicoDenemesizPlanKodu: string | null;
    denemeGunu: number;
  },
  karar: Pick<DenemeKarari, 'hak' | 'gerekce'>,
): PlanSecimi {
  if (!(surum.denemeGunu > 0)) {
    return { tur: 'plan', planKodu: surum.iyzicoPlanKodu, denemeGunu: 0, denemeHakki: false };
  }
  if (karar.hak) {
    return {
      tur: 'plan',
      planKodu: surum.iyzicoPlanKodu,
      denemeGunu: surum.denemeGunu,
      denemeHakki: true,
    };
  }
  if (karar.gerekce === 'eposta-dogrulanmadi') return { tur: 'eposta-dogrulanmadi' };
  if (!surum.iyzicoDenemesizPlanKodu) return { tur: 'denemesiz-plan-yok' };
  return {
    tur: 'plan',
    planKodu: surum.iyzicoDenemesizPlanKodu,
    denemeGunu: 0,
    denemeHakki: false,
  };
}

/** Deneme reddi ve kapali hata metinleri — on yuz `message`i aynen gosterir. */
export const DENEME_EPOSTA_DOGRULANMADI_MESAJI =
  'Ücretsiz deneme için önce e-posta adresinizi doğrulayın. Doğrulama bağlantısı ' +
  'kayıt olurken e-posta adresinize gönderildi; bulamazsanız sayfanın üstündeki ' +
  'şeritten yeniden isteyebilirsiniz.';
export const DENEMESIZ_PLAN_YOK_MESAJI =
  'Bu paket şu an satın alınamıyor. Lütfen kısa süre sonra yeniden deneyin ya da ' +
  'bizimle iletişime geçin.';

/**
 * iyzico'nun abonelik formu icin ZORUNLU tuttugu fatura kimligi alanlari.
 * `postaKodu` bilerek YOK — iyzico'da opsiyonel.
 */
export const ZORUNLU_MUSTERI_ALANLARI = [
  'ad',
  'soyad',
  'eposta',
  'telefon',
  'kimlikNo',
  'sehir',
  'adres',
] as const;

/**
 * Telefonu iyzico'nun bekledigi bicime cevirir. SAF fonksiyon.
 *
 * ⚠ 02.09'da canli turda musteri `05330983663` yazdi — Turkiye'de insanlarin
 * telefonu yazma bicimi budur. iyzico `gsmNumber` alaninda ULKE KODLU bicim
 * bekler (`+905330983663`). Kullaniciya "basina +90 koyun" demek yerine
 * donusumu BIZ yapariz: form kurallariyla ugrasmak musterinin isi degil.
 *
 * Bicimler:
 *   "0533 098 36 63" / "(0533) 098-3663" → +905330983663  (bosluk/tire/parantez atilir)
 *   "05330983663"                        → +905330983663
 *   "5330983663"                         → +905330983663
 *   "00905330983663"                     → +905330983663
 *   "+905330983663"                       → oldugu gibi
 *
 * ⚠ TANIMADIGI bicimi BOZMAZ, aynen doner: yurt disi numarasi ya da
 * beklenmedik uzunlukta bir giris "duzeltiliyorum" diye SAKATLANMAMALI.
 * Reddetme karari uzak uca aittir; bizim isimiz tahmin etmek degil.
 */
export function telefonuNormalize(ham: string): string {
  const temiz = (ham ?? '').replace(/[\s()\-.]/g, '');
  if (!temiz) return ham;

  if (temiz.startsWith('+')) return temiz;
  if (temiz.startsWith('00')) return `+${temiz.slice(2)}`;
  // 0 + 10 hane (0533...) → yerel yazim
  if (/^0\d{10}$/.test(temiz)) return `+90${temiz.slice(1)}`;
  // 10 hane, 5 ile baslar (533...) → bastaki sifir da yazilmamis
  if (/^5\d{9}$/.test(temiz)) return `+90${temiz}`;
  // 90 + 10 hane (90533...) → ulke kodu var ama + yok
  if (/^90\d{10}$/.test(temiz)) return `+${temiz}`;

  return ham;
}

/**
 * Eksik/bos fatura alanlarinin adlarini doner. SAF fonksiyon — govde hic
 * gelmemis olabilir (`undefined`), o durumda TUM alanlar eksiktir.
 *
 * ⚠ Bosluk-only degerler de EKSIK sayilir: `"   "` iyzico'ya gonderilirse
 * uzak uc reddeder ve hata musteriye "odeme baslatilamadi" diye doner —
 * yani kapiyi burada kurmak, hatayi anlasilir yerde tutar.
 */
export function eksikMusteriAlanlari(
  musteri: Record<string, unknown> | null | undefined,
): string[] {
  if (!musteri || typeof musteri !== 'object')
    return [...ZORUNLU_MUSTERI_ALANLARI];
  return ZORUNLU_MUSTERI_ALANLARI.filter((alan) => {
    const deger = musteri[alan];
    return typeof deger !== 'string' || deger.trim() === '';
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   T47 (22.09.2026) — SAHIS mi TUZEL mi · FATURA KIMLIGI SATIN ALMADA TOPLANIR
   ═══════════════════════════════════════════════════════════════════════════

   OLCULEN KUSUR (bu dosya, eski satir 530-560):
   Musteri odeme formunda kimlik numarasini ZATEN giriyordu (`kimlikNo`,
   `ZORUNLU_MUSTERI_ALANLARI` icinde) ve iyzico'ya `identityNumber` olarak
   gonderiliyordu — ama `prisma.firma.update` yalnizca unvan / yetkiliEposta /
   faturaAdresi / il / telefon yaziyordu. `tcKimlikNo`, `vergiNo` ve
   `vergiDairesi` HICBIR odeme yolundan yazilmiyordu; tum depoda o uc alani
   yazan TEK yer profil formuydu (`firma.servisi.guncelle`).

   Sonuc zinciri: K4 fatura kopyasi (`faturaMusteriKopyasiCikar`) bos vergi
   kimligi kopyaliyor -> `kopyadanMusteri` o ucluyu `?? undefined` ile geciyor
   -> muhasebe saglayicisina `tax_number: undefined` gidiyor -> fatura VERGI
   KIMLIGI OLMADAN kesiliyor. VUK md. 230 musterinin vergi dairesi ve hesap
   numarasini (ya da gercek kisi icin TCKN'yi) SART KOSAR.

   ⚠ Bu, 08.09'da olculen `Firma.telefon` kusurunun BIREBIR IKIZIDIR: ayni
   `update`, ayni alan listesi. Telefon duzeltildi, kimlik numarasi gozden
   kacti — "ikizi unutma" dersinin uc ay sonraki tekrari.

   COZUM (satin almayi KAPATMADAN):
     1. Kimlik numarasi HANE SAYISINA gore dogru kolona yazilir
        (11 -> tcKimlikNo, degilse -> vergiNo). `??` semantigi korunur:
        yoneticinin/profilin girdigi deger EZILMEZ.
     2. Sahis olmayan (TCKN olmayan) musteriden VERGI DAIRESI de ISTENIR —
        odeme formunda, KART GIRILMEDEN ONCE. Kapi odemeyi engellemez, eksigi
        ONCEDEN toplatir: musterinin parasi cekildikten sonra "fatura
        kesilemiyor" demek en kotu haldir.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Musterinin girdigi numaranin hangi BELGE oldugu. */
export type KimlikTuru = 'tckn' | 'vkn' | 'bilinmiyor';

/**
 * SAF — hane sayisindan belge turunu soyler. On yuz ikizi:
 * `frontend/ozellik/odeme/fatura-kimligi.ts` → `kimlikTuru`.
 *
 * ⚠ SAGLAMA HANESI DOGRULAMASI BILEREK YOK. Amac numaranin gecerli olup
 * olmadigini bilmek degil, HANGI BELGEYI istemek gerektigini bilmek: 11 hane
 * gercek kisi (e-Arsiv, vergi dairesi gerekmez), 10 hane tuzel kisi (VKN +
 * vergi dairesi). Gecerlilik kararini iyzico ve muhasebe saglayicisi verir;
 * burada kati bir dogrulama, gecerli musteriyi odeyemez hale getirirdi.
 */
export function kimlikTuru(kimlikNo: string | null | undefined): KimlikTuru {
  const haneler = (kimlikNo ?? '').replace(/\D/g, '');
  if (haneler.length === 11) return 'tckn';
  if (haneler.length === 10) return 'vkn';
  return 'bilinmiyor';
}

/**
 * SAF — bu satin almada vergi dairesi SORULMALI mi?
 *
 * ⚠ `!== 'tckn'`, `=== 'vkn'` DEGIL. Hane sayisi ne 10 ne 11 ise elimizde
 * gecerli bir SAHIS kimligi YOKTUR; fatura ancak vergi dairesi + numara ile
 * kesilebilir. `=== 'vkn'` yazmak yarim numarayi kapidan gecirir ve eksik
 * bilgi ancak kesim aninda — musterinin parasi cekildikten SONRA — cikardi.
 */
export function vergiDairesiGerekli(
  musteri: { kimlikNo?: string | null } | null | undefined,
): boolean {
  const ham = (musteri?.kimlikNo ?? '').trim();
  if (!ham) return false;
  return kimlikTuru(ham) !== 'tckn';
}

/** Kapiya takilan musteriye gosterilen metin — on yuz `message`i aynen basar. */
export const VERGI_DAIRESI_GEREKLI_MESAJI =
  'Sirket adina fatura icin vergi dairesi gerekli. Fatura formundaki "Vergi ' +
  'dairesi" alanini doldurun; sahis olarak aliyorsaniz kimlik alanina 11 ' +
  'haneli T.C. kimlik numaranizi girin.';

/**
 * SAF — odeme formundaki kimlik bilgisini `Firma` KOLONLARINA esler.
 *
 * `undefined` donen alan "DOKUNMA" demektir (Prisma `update` sozlesmesi):
 * cagiran taraf `mevcut ?? bundan gelen` yazar, boylece profilden ya da
 * yoneticiden gelen deger ASLA ezilmez.
 */
export function faturaKimligiAlanlari(musteri: {
  kimlikNo?: string | null;
  vergiDairesi?: string | null;
}): { tcKimlikNo?: string; vergiNo?: string; vergiDairesi?: string } {
  const ham = (musteri.kimlikNo ?? '').trim();
  const vd = (musteri.vergiDairesi ?? '').trim();
  const cikti: { tcKimlikNo?: string; vergiNo?: string; vergiDairesi?: string } = {};
  if (ham) {
    // ⚠ 'bilinmiyor' da `vergiNo`ya yazilir, `tcKimlikNo`ya DEGIL: `tcKimlikNo`
    // uyeden GIZLENEN kisisel veri kolonudur (`firma-maskele.ts`) ve teklif
    // antedinde BASILMAZ. Turu bilinmeyen bir numarayi oraya yazmak, kisisel
    // veri olmayan bir degeri kisisel veri muamelesine sokar; tersi ise
    // gercek bir TCKN'yi antette basardi — bu yon yanlisin ucuz olani.
    if (kimlikTuru(ham) === 'tckn') cikti.tcKimlikNo = ham;
    else cikti.vergiNo = ham;
  }
  if (vd) cikti.vergiDairesi = vd;
  return cikti;
}

@Injectable()
export class SatinAlmaServisi {
  private readonly logger = new Logger(SatinAlmaServisi.name);
  private readonly uygulamaUrl: string;
  /** Kota tablosunda bulunamayıp uyarısı yazılmış paket kodları. */
  private readonly uyarilanPaketler = new Set<string>();

  /** Bir niyeti kac kez sorarsak vazgecerz. */
  private readonly AZAMI_DENEME = 5;

  /**
   * Firma basina SONUCLANDIRMA sirasi (6.12a, cift abonelik korumasi).
   * Donus POST'u ile kurtarma taramasi ayni firmanin iki niyetini AYNI ANDA
   * sonuclandirirsa ikisi de "abonelik yok / suresi gecmis" okuyup ikisi de
   * yazar — `ikinciAbonelikMi` kapisi yarisi kaybeder. Sira bunu kapatir.
   * ⚠ SUREC ICI: tek backend ornegi varsayimi (webhook.isleyici.ts ile ayni
   * not). Birden cok ornekte firma basina `pg_advisory_xact_lock` gerekir.
   */
  private readonly firmaSirasi = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
    private readonly abonelik: AbonelikServisi,
    config: ConfigService,
    private readonly denemeHakki: DenemeHakkiServisi,
    // FAZ 6.4: satin alma sonrasi "kalici veri saklayicisi" maili. OLCULDU
    // (16.09): kart yolunda musteriye HICBIR e-posta gitmiyordu — e-posta
    // gonderen tek odeme yolu HAVALE idi (havale.servisi.ts:256).
    private readonly eposta: EpostaServisi,
  ) {
    this.uygulamaUrl =
      config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

  /** `is`i ayni firmanin onceki isi bittikten sonra kosar (hata sirayi kirmaz). */
  private async firmaSirasiyla<T>(firmaId: string, is: () => Promise<T>): Promise<T> {
    const onceki = this.firmaSirasi.get(firmaId) ?? Promise.resolve();
    const bu = onceki.catch(() => undefined).then(is);
    const kuyrukSonu = bu.catch(() => undefined);
    this.firmaSirasi.set(firmaId, kuyrukSonu);
    try {
      return await bu;
    } finally {
      if (this.firmaSirasi.get(firmaId) === kuyrukSonu) this.firmaSirasi.delete(firmaId);
    }
  }

  // ── Satisa acik paketler ────────────────────────────────────────────────
  /**
   * Fiyat sayfasinin kaynagi. Her paketin YALNIZCA satistaki en guncel
   * surumu doner — eski surumler mevcut abonelerde yasar ama satilmaz.
   */
  async satistakiPaketler() {
    const paketler = await this.prisma.paket.findMany({
      where: { aktif: true },
      orderBy: { sira: 'asc' },
      include: {
        surumler: {
          where: { satistaMi: true },
          orderBy: { surumNo: 'desc' },
          take: 1,
        },
      },
    });

    return paketler
      .filter((p) => p.surumler.length > 0)
      .map((p) => {
        const s = p.surumler[0];
        // Faz 6 (13.09): kota TEK KAYNAKTAN (ceviri-kotasi.ts) — fiyat sayfası
        // da abonelik sayfası da rakamı buradan okur, kendisi yazmaz.
        const kota = ceviriKotasiCoz({ seviye: p.seviye, kapsam: p.kapsam });
        // Paket kodu başına BİR KEZ: girişsiz fiyat ucu sık çağrılır, aynı uyarı
        // her istekte yazılırsa günlük gürültüye boğulur ve asıl uyarı kaybolur.
        if (!kota.eslendi && !this.uyarilanPaketler.has(p.kod)) {
          this.uyarilanPaketler.add(p.kod);
          this.logger.warn(
            `Paket ${p.kod} (${p.seviye}/${p.kapsam}) ceviri kota tablosunda YOK — en dusuk kotaya dusuruldu`,
          );
        }
        return {
          paketId: p.id,
          kod: p.kod,
          ad: p.ad,
          aciklama: p.aciklama,
          kapsam: p.kapsam,
          seviye: p.seviye,
          kullaniciHakki: p.kullaniciHakki,
          aylikTeklifHakki: p.aylikTeklifHakki,
          dwgAktif: p.dwgAktif,
          ceviriKotasi: { satir: kota.satir, dosya: kota.dosya },
          surum: {
            paketSurumuId: s.id,
            // Decimal → string: para JS float'ina DUSURULMEZ (P2 turu dersi).
            // SOZLESME tutari — karttan cekilen, faturaya yazilan (TL, KDV dahil).
            tutar: s.tutar.toFixed(2),
            paraBirimi: s.paraBirimi,
            // VITRIN (capa) — yalnizca gosterim. Hicbir tahsilat/fatura
            // bunu okumaz; on yuz buyuk puntoyla bunu, altinda sozlesme
            // tutarini gosterir. null ise ekran yalniz TL gosterir.
            referansTutar: s.referansTutar ? s.referansTutar.toFixed(2) : null,
            referansParaBirimi: s.referansParaBirimi,
            periyot: s.periyot,
            periyotAdedi: s.periyotAdedi,
            denemeGunu: s.denemeGunu,
          },
        };
      });
  }

  // ── 1. Kart aboneligini baslat ──────────────────────────────────────────
  /**
   * iyzico'nun barindirilan formunu acar ve niyeti kaydeder.
   *
   * DIKKAT: abonelikte 3D Secure YOKTUR (iyzico TR dokumani: "Abonelik
   * islemlerinde ilk islem dahil, tum islemler NON3D olarak
   * gerceklestirilmektedir."). Donen `checkoutFormContent` yalnizca kart
   * toplama arayuzudur; mdStatus / 3DS callback beklemeyin.
   */
  async baslat(p: {
    firmaId: string;
    kullaniciId: string;
    paketSurumuId: string;
    musteri: {
      ad: string;
      soyad: string;
      eposta: string;
      telefon: string;
      kimlikNo: string;
      sehir: string;
      adres: string;
      postaKodu?: string;
      /**
       * T47: KOSULLU ZORUNLU — `vergiDairesiGerekli` dogruysa dolu olmali.
       * `ZORUNLU_MUSTERI_ALANLARI` icinde DEGIL: o liste iyzico'nun
       * sozlesmesidir ve on yuz ikiziyle BIREBIR esit kalmak zorundadir
       * (`satinalma-yolu-test.ts` P7). Vergi dairesi iyzico'ya HIC gitmez;
       * yalniz `Firma`ya yazilir ve oradan fatura kopyasina gecer.
       */
      vergiDairesi?: string;
    };
    /**
     * FAZ 6.4 (16.09): on bilgilendirme formu + mesafeli satis sozlesmesi
     * onayi. Uc tarafinda `@Equals(true)` ile ZORUNLU; burada da ikinci kez
     * bakilir cunku bu servis TEK bir ucun ardinda degil — servisi baska bir
     * yerden cagiran kod onay kapisini atlarsa iyzico formu onaysiz acilirdi.
     */
    sozlesmeOnayi?: boolean;
  }) {
    // ⚠ ONAY KAPISI ILK SIRADA: iyzico'ya HICBIR istek gitmeden once.
    // Reddedilen istek yan etki birakmaz (deneme hakki kapisiyla ayni kural).
    if (p.sozlesmeOnayi !== true) {
      throw new BadRequestException(
        'Devam edebilmek için Ön Bilgilendirme Formu ve Mesafeli Satış ' +
          'Sözleşmesi onayını işaretlemelisiniz.',
      );
    }
    const surum = await this.prisma.paketSurumu.findUnique({
      where: { id: p.paketSurumuId },
      include: { paket: true },
    });
    if (!surum) throw new NotFoundException('Paket surumu bulunamadi');
    if (!surum.satistaMi)
      throw new BadRequestException('Bu paket surumu satista degil');

    // ── FATURA KIMLIGI KAPISI ────────────────────────────────────────────
    // ⚠ 02.09'DA OLCULDU: bu kapi YOKTU ve uc, gelen govdeyi kosulsuz
    // dereference ediyordu (`p.musteri.ad`). `@Body()` bir SATIR-ICI TIP
    // LITERALI oldugu icin global ValidationPipe devreye GIRMEZ (metatype
    // = Object), yani eksik govde 400 ile erken durmaz: TypeError firlar ve
    // Nest varsayilani `500 Internal server error` doner. On yuz de tam o
    // alani okudugu icin musteri "Odeme baslatilamadi" gorurdu.
    //
    // Ayrica on yuzdeki yorum "eksikse sunucu aciklayici hata doner"
    // diyordu — YANLIS. Yorum kanit degildir; kapiyi kodla kuruyoruz.
    const eksik = eksikMusteriAlanlari(p.musteri);
    if (eksik.length) {
      throw new BadRequestException(
        `Fatura bilgileri eksik: ${eksik.join(', ')}. ` +
          'Odeme sayfasindaki fatura formunu doldurun.',
      );
    }

    // ── T47: SAHIS mi TUZEL mi — VERGI DAIRESI KAPISI ────────────────────
    // ⚠ BU KAPI ODEMEYI ENGELLEMEZ, EKSIGI ONCEDEN TOPLATIR. Fark onemli:
    // kart bilgisi HENUZ girilmedi, iyzico'ya HIC istek gitmedi, hicbir yan
    // etki yazilmadi. Musteri alani doldurup ayni dugmeye basiyor.
    //
    // Olculdu (22.09): vergi dairesi hicbir odeme yolunda SORULMUYORDU ve
    // `Firma.vergiDairesi`yi yazan tek yol profil formuydu. Sirket adina alan
    // musterinin faturasi vergi dairesiz kesiliyordu — VUK md. 230 sart kosar.
    //
    // ⚠ On yuzde ikizi var (`fatura-kimligi.ts` → `eksikAlanlar`), ama kapi
    // BURADA da duruyor: `@Body()` bu uctan bir SATIR-ICI TIP LITERALI olarak
    // gecer (`abonelik-basla.dto.ts` `musteri: @IsObject()`), yani icerigi
    // ValidationPipe dogrulamaz. Istegi elle atan biri on yuzu HIC gormez.
    if (vergiDairesiGerekli(p.musteri) && !(p.musteri.vergiDairesi ?? '').trim()) {
      throw new BadRequestException({
        kod: 'VERGI_DAIRESI_GEREKLI',
        message: VERGI_DAIRESI_GEREKLI_MESAJI,
      });
    }

    // Zaten SAGLIKLI bir aboneligi olan firma yeniden satin alamaz —
    // paket degisimi ayri bir yoldur (`PaketDegisimiServisi.degistir`, 23.09).
    // Bu kapi olmazsa ayni firmaya iyzico'da IKI abonelik acilir ve iki kez
    // tahsilat yapilir.
    //
    // ⚠ MIRAS SATIRI MUAF. ADIM 2 gocu (migration 20260828100000, satir
    // 361-383) HER mevcut firmaya `miras-core`/`miras-pro` paketiyle
    // `AKTIF` + 365 gunluk bir satir yazdi — bu bir TAHSILATI temsil etmez,
    // goc emniyetidir (tutar 0, `satistaMi=false`). Muafiyet olmadan bu
    // satir kapiya takilir ve MEVCUT MUSTERILERIN HICBIRI odeme yapamaz.
    //
    // Ikinci abonelik riski YOK: `Abonelik.firmaId` @unique, ve
    // `aboneligiAcVeyaGuncelle` mevcut satiri UPDATE eder — miras satiri
    // gercek paketle uzerine yazilir.
    const mevcut = await this.prisma.abonelik.findUnique({
      where: { firmaId: p.firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    const engel = yeniAbonelikEngeli(mevcut);
    if (engel === 'KART_ABONELIGI_ACIK') {
      // ⚠ 24.09 — CIFT CEKIM KORUMASI: satir SONA_ERDI/ASKIDA ama iyzico'daki
      // kart aboneligi hala ACIK (bkz. paket-degisimi.ts →
      // `iyzicoAboneligiAcikMi`). Yeni abonelik eskisini sahipsiz birakir,
      // iyzico ikisinden de ceker. Form ACILMADAN reddedilir.
      throw new BadRequestException({
        kod: 'KART_ABONELIGI_ACIK',
        message: KART_ABONELIGI_ACIK_MESAJI,
      });
    }
    if (engel) {
      // ⚠ 23.09'a kadar bu mesaj OLMAYAN bir yolu gosteriyordu ("yukseltme
      // yolu"). Yol artik var: abonelik sayfasindaki kartin "Bu pakete gec"
      // dugmesi (`POST /abonelik/degistir`).
      throw new BadRequestException({
        kod: 'ABONELIK_ZATEN_VAR',
        message:
          'Firmanızın zaten etkin bir aboneliği var. Paketinizi değiştirmek için ' +
          'abonelik sayfasında istediğiniz paketin "Bu pakete geç" düğmesini kullanın.',
      });
    }

    // ── DENEME HAKKI → PLAN (FAZ 6.12a) ──────────────────────────────────
    // ⚠ OLCULDU (15.09): deneme karari yalniz `surum.denemeGunu`ndan veriliyor,
    // iyzico'ya her seferinde AYNI denemeli plan gidiyordu. Ayni firma iptal
    // edip, hesap kapatip ayni e-postayla, yeni e-posta + ayni telefonla ya da
    // e-postanin buyuk harfli bicimiyle 30 gunu tekrar tekrar aliyordu.
    // Karar firma YAZILMADAN ve iyzico'ya GIDILMEDEN verilir: reddedilen istek
    // yan etki birakmaz.
    const karar = await this.denemeHakki.karar({
      firmaId: p.firmaId,
      kullaniciId: p.kullaniciId,
      formEposta: p.musteri.eposta,
      telefon: p.musteri.telefon,
    });
    const secim = planSec(surum, karar);
    if (secim.tur === 'eposta-dogrulanmadi') {
      throw new ForbiddenException({
        kod: 'DENEME_EPOSTA_DOGRULANMADI',
        message: DENEME_EPOSTA_DOGRULANMADI_MESAJI,
      });
    }
    if (secim.tur === 'denemesiz-plan-yok') {
      this.logger.error(
        `DENEMESIZ IKIZ PLAN YOK: surum=${surum.id} paket=${surum.paket.kod} — deneme ` +
          'hakki olmayan satin alma durduruldu. paketleri-kur.ts --denemesiz-ikiz ile kurun.',
      );
      throw new ServiceUnavailableException({
        kod: 'DENEMESIZ_PLAN_YOK',
        message: DENEMESIZ_PLAN_YOK_MESAJI,
      });
    }

    // ── FATURA KIMLIGINI FIRMAYA YAZ ─────────────────────────────────────
    // `fatura.servisi` faturayi FIRMA satirindan uretir; bu alanlar bosken
    // her fatura ELLE_MUDAHALE'ye duser. Musteri bilgiyi zaten burada
    // giriyor — atmak, gelecek ayin tamamini elle isleme sokar.
    //
    // ⚠ YALNIZ BOS ALANLAR doldurulur (`??`): yonetici elle girdiyse ya da
    // e-fatura entegrasyonundan geldiyse ustune YAZILMAZ.
    const firma = await this.prisma.firma.findUnique({
      where: { id: p.firmaId },
      select: {
        unvan: true, yetkiliEposta: true, faturaAdresi: true, il: true,
        // FAZ 4.1: yeni alan — asagidaki `??` icin mevcut deger okunmali,
        // yoksa her satin alma kullanicinin profilden girdigi telefonu EZERDI.
        telefon: true,
        // T47: ayni `??` gerekcesi — bu uc alan da okunmadan yazilirsa
        // profilden/yoneticiden gelen vergi kimligi her satin almada EZILIR.
        tcKimlikNo: true, vergiNo: true, vergiDairesi: true,
      },
    });
    // T47: odeme formundaki kimlik numarasini DOGRU KOLONA esler. Bu cagri
    // olmadan `kimlikNo` yalniz iyzico'ya gidiyor ve DB'ye HIC yazilmiyordu.
    const kimlik = faturaKimligiAlanlari(p.musteri);
    await this.prisma.firma.update({
      where: { id: p.firmaId },
      data: {
        unvan: firma?.unvan ?? `${p.musteri.ad} ${p.musteri.soyad}`.trim(),
        yetkiliEposta: firma?.yetkiliEposta ?? p.musteri.eposta,
        faturaAdresi: firma?.faturaAdresi ?? p.musteri.adres,
        il: firma?.il ?? p.musteri.sehir,
        // ── FAZ 4.1 (08.09 olcumu): TELEFON ARTIK ATILMIYOR ──────────────
        // Telefon `ZORUNLU_MUSTERI_ALANLARI` icinde, yani her satin almada
        // musteriden ISTENIYOR ve iyzico'ya gonderiliyordu — ama `Firma`da
        // alan olmadigi icin DB'ye hic yazilmiyordu. Sonuc: odeme formu her
        // seferinde sifirdan doldurtuluyordu ve on yuz bunu iki ayri yerde
        // gerekce olarak yazmisti ("`Firma` semasinda telefon alani hic yok",
        // abonelik/page.tsx:74 ve :113). Alan eklendi, `??` semantigi KORUNDU:
        // kullanici profilden girdiyse odeme akisi ustune YAZMAZ.
        //
        // ⚠ HAM YAZILIYOR, `telefonuNormalize` UYGULANMIYOR — bilincli.
        // O fonksiyon iyzico'nun TEL BICIMI icindir (`+905330983663`) ve
        // yalniz gonderim aninda, `gsmNumber` alaninda uygulanir (:385).
        // `Firma.telefon` ise bir GORUNUM alanidir: faturada ve teklif
        // antedinde basilir, ayrica profil formundan serbest metin olarak
        // duzenlenebilir. Buraya tel bicimini yazmak antette
        // "+905330983663" gosterirdi ve ayni kolonda iki bicim olusurdu
        // (odemeden gelen normalize, formdan gelen ham).
        telefon: firma?.telefon ?? p.musteri.telefon,
        // ── T47 (22.09 olcumu): VERGI KIMLIGI ARTIK ATILMIYOR ────────────
        // `kimlikNo` `ZORUNLU_MUSTERI_ALANLARI` icinde, yani HER satin almada
        // musteriden isteniyor ve iyzico'ya `identityNumber` olarak
        // gonderiliyordu — ama DB'ye hic yazilmadan atiliyordu. `Firma`daki
        // uc kolonu (tcKimlikNo/vergiNo/vergiDairesi) yazan TEK yol profil
        // formuydu; kimse oraya girmezse her fatura vergi kimligi OLMADAN
        // kesiliyordu. Telefon kusurunun (FAZ 4.1) birebir ikizi.
        //
        // ⚠ `undefined` = "DOKUNMA" (Prisma sozlesmesi). `firma?.X ?? kimlik.X`
        // ikisi de bossa `undefined` kalir; `null` YAZILMAZ — bos bir odeme
        // formu alani kayitli vergi numarasini SILMEMELI.
        tcKimlikNo: firma?.tcKimlikNo ?? kimlik.tcKimlikNo,
        vergiNo: firma?.vergiNo ?? kimlik.vergiNo,
        vergiDairesi: firma?.vergiDairesi ?? kimlik.vergiDairesi,
      },
    });

    const sonuc = await this.iyzico.abonelikBaslat({
      // 6.12a: denemeli ya da denemesiz ikiz — `planSec` karari.
      planKodu: secim.planKodu,
      // ⚠ 06.09'DA OLCULDU — DONUS ADRESI ON YUZ SAYFASI OLAMAZ.
      // iyzico token'i POST GOVDESINDE gonderiyor (bu dosyanin basindaki
      // not da boyle diyor). Tarayici POST ile bir Next.js sayfasina
      // dustugunde istemci JavaScript'i govdeyi OKUYAMAZ — sayfa
      // `window.location.search`e bakiyordu ve token HER ZAMAN bos
      // geliyordu. Musteri odemesini yaptiktan sonra "Odeme bilgisi
      // bulunamadi" goruyordu.
      //
      // Artik POST'u SUNUCU karsiliyor; islemi bitirip tarayiciyi sonuc
      // sayfasina yonlendiriyor. API ayni origin'de servis ediliyor
      // (`NEXT_PUBLIC_API_URL: https://DOMAIN/api`) — yeni ortam
      // degiskeni gerekmiyor.
      donusUrl: `${this.uygulamaUrl}/api/abonelik/iyzico-donus`,
      musteri: {
        name: p.musteri.ad,
        surname: p.musteri.soyad,
        email: p.musteri.eposta,
        // ⚠ Yerel yazim (`05330983663`) iyzico tarafinda gecerli DEGIL.
        gsmNumber: telefonuNormalize(p.musteri.telefon),
        identityNumber: p.musteri.kimlikNo,
        billingAddress: {
          contactName: `${p.musteri.ad} ${p.musteri.soyad}`,
          city: p.musteri.sehir,
          country: 'Turkiye',
          address: p.musteri.adres,
          zipCode: p.musteri.postaKodu,
        },
      },
    });

    await this.prisma.abonelikBaslatma.create({
      data: {
        token: sonuc.token,
        firmaId: p.firmaId,
        paketSurumuId: surum.id,
        olusturanId: p.kullaniciId,
        // 6.12a: karar ve anahtarlar SIMDI dondurulur; sonuclandirma (donus ya
        // da kurtarma taramasi) form verisini goremez, yalniz bunlari okur.
        denemeGunu: secim.denemeGunu,
        planKodu: secim.planKodu,
        epostaNormal: karar.anahtarlar.epostaNormal,
        formEpostaNormal: karar.anahtarlar.formEpostaNormal,
        telefonNormal: karar.anahtarlar.telefonNormal,
        // ── FAZ 6.4: ONAYIN IZI ────────────────────────────────────────────
        // Bir onay kaydinin degeri "onayladi" bilgisinde degil, HANGI METNI
        // ve NE ZAMAN onayladigi bilgisindedir (5.3 kayit onayiyla ayni
        // gerekce). Zaman SUNUCUDA damgalanir; surum backend sabitinden
        // okunur — on yuzun gonderdigi surume guvenmek, istegi elle atan
        // birine "hangi metni onayladigimi ben soylerim" imkani verirdi.
        sozlesmeOnayiZamani: new Date(),
        sozlesmeSurumu: HUKUKI_METIN_SURUMU,
      },
    });

    // ── TESHIS: iyzico formu HANGI KIPTE cizilecek? ──────────────────────
    // 03.09'da kart formu DAR BIR POPUP olarak cizildi. Kip, sayfada
    // `id="iyzipay-checkout-form"` tasiyan bir kap olup olmamasina bagli:
    // varsa sayfaya GOMULUR (responsive), yoksa iyzico kendi modalini acar.
    // On yuz kabi kosullu ekliyor (`kabiEkle`) ama iyzico'nun DONEN icerikte
    // kabi zaten gonderip gondermedigini OLCMEDIK — bu satir onu soyler.
    // Icerigin KENDISI gunluge YAZILMAZ: token tasiyor.
    const icerik = sonuc.checkoutFormContent ?? '';
    this.logger.log(
      `iyzico form kipi — uzunluk=${icerik.length} ` +
        `kap=${/id\s*=\s*["']iyzipay-checkout-form["']/i.test(icerik) ? 'VAR' : 'YOK'} ` +
        `sinif=${/class\s*=\s*["']([^"']*)["']/i.exec(icerik)?.[1] ?? '-'}`,
    );

    return {
      token: sonuc.token,
      formIcerigi: sonuc.checkoutFormContent,
      gecerlilikSonu: sonuc.tokenExpireTime,
      // 6.12a: paket kartinda "deneme var" gorunup formdaki telefon/e-posta
      // eslestiyse karar burada degisir. Odeme ekrani bunu okuyup karti
      // girmeden ONCE "ilk ay simdi alinir" notunu gosterir (sessiz dal yok).
      denemeHakki: secim.denemeHakki,
      denemeGunu: secim.denemeGunu,
    };
  }

  // ── 2. Form donusu ──────────────────────────────────────────────────────
  /**
   * Donus sayfasindan cagrilir. `token` disinda HICBIR sey istekten alinmaz;
   * firma ve paket bilgisi niyet kaydindan okunur.
   *
   * @param firmaId Cagiran oturumun firmasi — niyetle ESLESMELI. Eslesmezse
   *   baskasinin token'iyla kendine abonelik acma yolu kapanir.
   *
   * ⚠ 24.09 — YANIT YALNIZ `durum` TASIR (guvenlik incelemesi). Eskiden iyzico
   * abonelik kodunu (`abonelikKodu`) ve ic kimligi de donduruyordu; on yuz
   * yalniz `durum` okur (`app/(protected)/abonelik/donus/page.tsx`). Kod,
   * webhook ucuna sahte tahsilat govdesi kurmanin on kosuludur (uc acik, imza
   * zorunlu degil). Ic cagiranlar (`donusIyzicodan`, kurtarma taramasi)
   * `niyetiSonuclandir`in tam sonucunu okumaya devam eder.
   * Kapi: `test:webhook-tahsilat-dogrulama` D.
   */
  async donus(token: string, firmaId: string): Promise<{ durum: AbonelikBaslatmaDurumu }> {
    const niyet = await this.prisma.abonelikBaslatma.findUnique({
      where: { token },
    });
    if (!niyet) throw new NotFoundException('Satin alma kaydi bulunamadi');
    if (niyet.firmaId !== firmaId) {
      // Baska bir firmanin token'i. Sessizce 404 — varligini dogrulamayiz.
      throw new NotFoundException('Satin alma kaydi bulunamadi');
    }
    if (niyet.durum === AbonelikBaslatmaDurumu.TAMAMLANDI) {
      return { durum: niyet.durum };
    }

    const sonuc = await this.niyetiSonuclandir(niyet.id, niyet.firmaId);
    return { durum: sonuc.durum };
  }

  /**
   * iyzico'nun DONUS POST'undan cagrilir — OTURUM YOKTUR.
   *
   * ⚠ JWT beklenemez: bu POST iyzico'nun alan adindan gelir, yani
   * CAPRAZ-SITE bir istektir ve `SameSite=Lax` cerezler gonderilmez.
   * Kimlik dogrulamasi TOKEN'IN KENDISIDIR: opak, tek kullanimlik ve
   * hangi firmaya ait oldugu BIZIM `AbonelikBaslatma` tablomuzda yazili
   * (dosya basindaki not: "token→firma baglantisi bizim tablomuzdan gelir;
   * istekle gelen firmaId'ye guvenilmez").
   *
   * Sonuc iyzico'ya SORULARAK belirlenir; donen govdeye guvenilmez.
   */
  async donusIyzicodan(token: string): Promise<'tamam' | 'bekliyor' | 'hata'> {
    if (!token) {
      this.logger.warn('iyzico donusu TOKENSIZ geldi');
      return 'hata';
    }
    const niyet = await this.prisma.abonelikBaslatma.findUnique({
      where: { token },
    });
    if (!niyet) {
      // Bilinmeyen token: varligini dogrulamayiz, sessizce hata.
      this.logger.warn('iyzico donusu BILINMEYEN token ile geldi');
      return 'hata';
    }
    if (niyet.durum === AbonelikBaslatmaDurumu.TAMAMLANDI) return 'tamam';

    try {
      const sonuc = await this.niyetiSonuclandir(niyet.id, niyet.firmaId);
      if (sonuc?.durum === AbonelikBaslatmaDurumu.TAMAMLANDI) return 'tamam';
      // 6.12a: ikinci abonelik engellendi (BASARISIZ) — "bekliyor" demek
      // musteriyi olmayacak bir acilisi beklemeye birakirdi.
      if (sonuc?.durum === AbonelikBaslatmaDurumu.BASARISIZ) return 'hata';
      return 'bekliyor';
    } catch (e) {
      // ⚠ HATA YUTULMAZ ama musteriye "odemen kayboldu" DENMEZ: tahsilat
      // gecmis olabilir ve 10 dakikalik kurtarma taramasi (`bekleyenNiyetleriTara`)
      // ayni niyeti yeniden sorar. Dogru mesaj "bekliyor".
      this.logger.error(
        `iyzico donusu sonuclandirilamadi (niyet=${niyet.id}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return 'bekliyor';
    }
  }

  /**
   * Niyeti iyzico'ya sorup sonuclandirir. Hem donus yolundan hem kurtarma
   * taramasindan cagrilir — TEK yol, iki tetikleyici.
   */
  /**
   * "Aboneliginiz basladi" maili — onaylanan hukuki metnin SURUMUNU ve
   * adresini tasir (Faz 6.4).
   *
   * ⚠ Surum NIYET KAYDINDAN okunur, bugunku sabitten DEGIL: musteri o gun
   * hangi metni onayladiysa mailde o yazmali. Eski kayitlarda alan null
   * olabilir — o zaman surum cumlesi HIC BASILMAZ (uydurma yok).
   */
  private async aboneligiBasladiMailiGonder(niyet: {
    firmaId: string;
    sozlesmeSurumu: string | null;
  }): Promise<void> {
    const firma = await this.prisma.firma.findUnique({
      where: { id: niyet.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    const adres = firma?.faturaEposta ?? firma?.yetkiliEposta;
    if (!adres) {
      this.logger.warn(
        `Abonelik basladi maili ATLANDI: firma ${niyet.firmaId} icin adres yok`,
      );
      return;
    }
    const paragraflar = [
      `${firma?.ad ?? 'Firmaniz'} icin aboneliginiz basladi. Paketinizi ve ` +
        'abonelik bilgilerinizi uygulamadan gorebilirsiniz.',
      'Satin alma adiminda onayladiginiz On Bilgilendirme Formu ve Mesafeli ' +
        `Satis Sozlesmesi su adreste yayinda: ${this.uygulamaUrl}/mesafeli-satis`,
    ];
    if (niyet.sozlesmeSurumu) {
      paragraflar.push(`Onayladiginiz metin surumu: ${niyet.sozlesmeSurumu}`);
    }
    paragraflar.push('Iyi calismalar.');
    await this.eposta.gonder({
      kime: adres,
      konu: 'MetaPriceX — aboneliginiz basladi',
      baslik: 'Aboneliginiz basladi',
      paragraflar,
      dugme: { etiket: 'Uygulamaya git', url: this.uygulamaUrl },
    });
  }

  private async niyetiSonuclandir(niyetId: string, firmaId: string) {
    return this.firmaSirasiyla(firmaId, () => this.niyetiSonuclandirSirayla(niyetId));
  }

  private async niyetiSonuclandirSirayla(niyetId: string) {
    const niyet = await this.prisma.abonelikBaslatma.findUniqueOrThrow({
      where: { id: niyetId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    // Sirada beklerken baska tetikleyici (donus / tarama) bitirmis olabilir.
    if (
      niyet.durum === AbonelikBaslatmaDurumu.TAMAMLANDI ||
      niyet.durum === AbonelikBaslatmaDurumu.BASARISIZ
    ) {
      return { durum: niyet.durum, abonelikKodu: niyet.iyzicoAbonelikKodu };
    }

    let sonuc: Awaited<ReturnType<IyzicoClient['formSonucu']>>;
    try {
      sonuc = await this.iyzico.formSonucu(niyet.token);
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      await this.prisma.abonelikBaslatma.update({
        where: { id: niyetId },
        data: {
          denemeSayisi: { increment: 1 },
          sonKontrol: new Date(),
          hata: mesaj,
        },
      });
      throw e;
    }

    // iyzico abonelik acmadiysa odeme gecmemistir.
    if (!sonuc?.referenceCode) {
      await this.prisma.abonelikBaslatma.update({
        where: { id: niyetId },
        data: {
          denemeSayisi: { increment: 1 },
          sonKontrol: new Date(),
          hata: 'iyzico abonelik kodu dondurmedi',
        },
      });
      return { durum: AbonelikBaslatmaDurumu.BEKLIYOR, abonelikKodu: null };
    }

    // ── 6.12a: DENEME GUNU NIYETTEN ──────────────────────────────────────
    // ⚠ `paketSurumu.denemeGunu` DEGIL: surumde 30 gun yazsa bile hakki
    // olmayan firmaya denemesiz plan gonderildi. Surumden okumak DENEME
    // yazip denemesiz planda odeme alan musteriyi 30 gun "deneme" gosterirdi.
    // NULL = niyet bu alan eklenmeden ONCE acildi; o kod her zaman surumun
    // denemeli planini gonderiyordu, surumden okumak o satir icin DOGRUDUR.
    const denemeGunu = niyet.denemeGunu ?? niyet.paketSurumu.denemeGunu;

    if (niyet.planKodu && sonuc.pricingPlanReferenceCode && sonuc.pricingPlanReferenceCode !== niyet.planKodu) {
      // Tani: iyzico gonderdigimiz plandan baska plan bildirdi. Karar
      // degismez (gonderdigimize guveniriz) ama sessiz de gecilmez.
      this.logger.error(
        `PLAN UYUSMAZLIGI: niyet=${niyet.id} gonderilen=${niyet.planKodu} ` +
          `iyzico=${sonuc.pricingPlanReferenceCode} (deneme gunu ${denemeGunu})`,
      );
    }

    // ── 6.12a: CIFT ABONELIK KORUMASI (bkz. `ikinciAbonelikMi`) ──────────
    const mevcut = await this.prisma.abonelik.findUnique({
      where: { firmaId: niyet.firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });
    if (mevcut && ikinciAbonelikMi(mevcut, sonuc.referenceCode)) {
      return this.ikinciAboneligiEngelle(niyet, mevcut, sonuc.referenceCode, denemeGunu);
    }

    const abonelik = await this.aboneligiAcVeyaGuncelle({
      firmaId: niyet.firmaId,
      paketSurumuId: niyet.paketSurumuId,
      iyzicoAbonelikKodu: sonuc.referenceCode,
      iyzicoMusteriKodu: sonuc.customerReferenceCode,
      iyzicoDurum: sonuc.subscriptionStatus,
      denemeGunu,
    });

    // ── §4.6 (plan 5.8): ODEME GECTI → KAPALI HESAP GERI ACILIR ──────────
    // Kapatilan hesabin 30 gun icinde geri donmesinin TEK yolu budur: giris
    // yapar, "Paket sec" der, odeme gecer ve `deletedAt`/`imhaTarihi`/
    // `kapatmaNedeni` temizlenir. Son sahip kapattigi icin durdurulmus
    // (`firmaKapandi`) uyeler KENDILIGINDEN doner; `ekiptenCikarildi` olanlar
    // DONMEZ. Karar TEK YERDE: `AbonelikServisi.firmayiGeriAc`.
    //
    // ⚠ SIRA: aboneligin acilmasindan SONRA. Tersi olsaydi abonelik acilirken
    // bir hata olsa hesap ODEMESIZ acilmis olurdu.
    // ⚠ HATA TAHSILATI DUSURMEZ: parasi alinmis musterinin niyeti BEKLIYOR
    // kalirsa kurtarma taramasi yeniden sonuclandirir ve geri acma idempotent
    // oldugu icin ikinci kez zarar vermez. Ama SESSIZ degil — gunluge yazilir.
    await this.abonelik
      .firmayiGeriAc(niyet.firmaId, {
        aktor: 'sistem',
        aciklama: `Paket satin alindi (iyzico ${sonuc.referenceCode})`,
        abonelikId: abonelik.id,
      })
      .catch((e) =>
        this.logger.error(
          `Hesap geri acilamadi (firma=${niyet.firmaId} niyet=${niyet.id}): ` +
            `${e instanceof Error ? e.message : String(e)}`,
        ),
      );

    // ── 6.12a: DENEME KULLANIM KAYDI ─────────────────────────────────────
    // TAMAMLANDI damgasindan ONCE: surec ikisinin arasinda olurse niyet
    // BEKLIYOR kalir, kurtarma taramasi yeniden sonuclandirir ve upsert
    // ayni satiri ikinci kez YAZMAZ (abonelikBaslatmaId @unique). Tersi sira
    // "tamamlandi ama kayit yok" birakirdi — tam da kapatilan acik.
    if (denemeGunu > 0) {
      await this.prisma.denemeKullanimi.upsert({
        where: { abonelikBaslatmaId: niyet.id },
        create: {
          firmaId: niyet.firmaId,
          kullaniciId: niyet.olusturanId,
          abonelikBaslatmaId: niyet.id,
          epostaNormal: niyet.epostaNormal,
          formEpostaNormal: niyet.formEpostaNormal,
          telefonNormal: niyet.telefonNormal,
          iyzicoMusteriKodu: sonuc.customerReferenceCode ?? null,
          kaynak: 'deneme',
        },
        update: {},
      });
    }

    // ── FAZ 6.4: ONAYLANAN METNIN MUSTERIYE ILETILMESI ───────────────────
    // Mesafeli satista on bilgilendirme ve sozlesmenin "kalici veri
    // saklayicisi" ile iletilmesi beklenir; ekranda gosterip gecmek zayif
    // kalir. Mail ONAYLANAN SURUMU yazar ve metne baglanti verir.
    //
    // ⚠ KRITIK DEGIL: `gonder` (gonderKritik DEGIL) ve hata YUTULUR —
    // posta sunucusu dustu diye tahsilati alinmis bir abonelik yarim
    // birakilamaz. Ama SESSIZ degil: hata gunluge yazilir.
    await this.aboneligiBasladiMailiGonder(niyet).catch((e) =>
      this.logger.error(`Abonelik basladi maili gonderilemedi (niyet ${niyet.id}): ${e}`),
    );

    await this.prisma.abonelikBaslatma.update({
      where: { id: niyetId },
      data: {
        durum: AbonelikBaslatmaDurumu.TAMAMLANDI,
        iyzicoAbonelikKodu: sonuc.referenceCode,
        sonuclandi: new Date(),
        sonKontrol: new Date(),
        hata: null,
      },
    });

    this.logger.log(
      `Abonelik acildi: firma=${niyet.firmaId} paket=${niyet.paketSurumu.paket.kod} ` +
        `iyzico=${sonuc.referenceCode}`,
    );

    return {
      durum: AbonelikBaslatmaDurumu.TAMAMLANDI,
      abonelikKodu: sonuc.referenceCode,
      abonelikId: abonelik.id,
    };
  }

  /**
   * 6.12a — ikinci aboneligi DURDURUR, mevcut aboneligin USTUNE YAZMAZ.
   *
   * Sira bilincli: once iyzico'da iptal. Iptal basarisizsa niyet BEKLIYOR
   * kalir ve hata FIRLATILIR — kurtarma taramasi yeniden dener; "engellendi"
   * damgasi, iyzico'da hala cekim yapan bir aboneligin ustune yazilmaz.
   * ⚠ Denemesiz planda iyzico ilk ayi form aninda cekmis olabilir: iptal
   * sonraki cekimleri durdurur, alinmis tutari IADE ETMEZ — gunluk ve olay
   * kaydi bunu yoneticiye soyler.
   */
  private async ikinciAboneligiEngelle(
    niyet: { id: string; firmaId: string; planKodu: string | null },
    mevcut: { id: string; durum: AbonelikDurumu; iyzicoAbonelikKodu: string | null },
    yeniKod: string,
    denemeGunu: number,
  ) {
    try {
      await this.iyzico.abonelikIptal(yeniKod);
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      await this.prisma.abonelikBaslatma.update({
        where: { id: niyet.id },
        data: {
          denemeSayisi: { increment: 1 },
          sonKontrol: new Date(),
          hata: `Ikinci abonelik iyzico'da iptal edilemedi: ${mesaj}`,
        },
      });
      this.logger.error(
        `CIFT ABONELIK IPTAL EDILEMEDI: firma=${niyet.firmaId} mevcut=${mevcut.iyzicoAbonelikKodu} ` +
          `ikinci=${yeniKod} — kurtarma taramasi yeniden deneyecek; surerse ELLE IPTAL: ${mesaj}`,
      );
      throw e;
    }

    const simdi = new Date();
    await this.prisma.abonelikBaslatma.update({
      where: { id: niyet.id },
      data: {
        durum: AbonelikBaslatmaDurumu.BASARISIZ,
        iyzicoAbonelikKodu: yeniKod,
        sonuclandi: simdi,
        sonKontrol: simdi,
        hata:
          `Firmanin etkin aboneligi (${mevcut.iyzicoAbonelikKodu}) varken ikinci odeme formu ` +
          'tamamlandi; ikinci iyzico aboneligi iptal edildi.',
      },
    });
    await this.prisma.abonelikOlayi.create({
      data: {
        abonelikId: mevcut.id,
        tip: 'abonelik.cift.engellendi',
        oncekiDurum: mevcut.durum,
        yeniDurum: mevcut.durum,
        aciklama:
          denemeGunu > 0
            ? 'Ikinci odeme formu tamamlandi; ikinci iyzico aboneligi deneme icinde iptal edildi (tahsilat yok).'
            : 'Ikinci odeme formu tamamlandi; ikinci iyzico aboneligi iptal edildi. Denemesiz planda ilk ay cekilmis olabilir — iade kontrol edilmeli.',
        veri: {
          niyetId: niyet.id,
          iptalEdilenKod: yeniKod,
          planKodu: niyet.planKodu,
          denemeGunu,
        },
        aktor: 'sistem',
      },
    });
    this.logger.error(
      `CIFT ABONELIK ENGELLENDI: firma=${niyet.firmaId} mevcut=${mevcut.iyzicoAbonelikKodu} ` +
        `iptal edilen=${yeniKod}` +
        (denemeGunu > 0 ? '' : ' — denemesiz plan: ilk ay cekilmis olabilir, IADE KONTROL EDILMELI'),
    );
    return { durum: AbonelikBaslatmaDurumu.BASARISIZ, abonelikKodu: null };
  }

  /**
   * Aboneligi acar; firma daha once abone olup birakmissa AYNI satiri
   * gunceller (firmaId @unique oldugu icin ikinci satir zaten acilamaz).
   */
  private async aboneligiAcVeyaGuncelle(p: {
    firmaId: string;
    paketSurumuId: string;
    iyzicoAbonelikKodu: string;
    iyzicoMusteriKodu?: string;
    iyzicoDurum?: string;
    denemeGunu: number;
  }) {
    const simdi = new Date();
    // Donem tarihleri SAF fonksiyondan gelir (donemTarihleriHesapla) —
    // boylece tampon ve deneme bitisi DB'siz, davranis duzeyinde
    // olculebilir. Kesin donem sonu ilk basarili tahsilat webhook'unda
    // iyzico'dan gelir; burasi KOPRU degerdir. Webhook onu yalniz
    // `kopruErisimSonu` ile isaretlendiyse ve hala yerindeyse duzeltir
    // (asagidaki not + abonelik.servisi `tahsilatBasarili`).
    const { erisimSonu, denemeSonu } = donemTarihleriHesapla(
      simdi,
      p.denemeGunu,
    );

    const mevcut = await this.prisma.abonelik.findUnique({
      where: { firmaId: p.firmaId },
    });

    const durum =
      p.denemeGunu > 0 ? AbonelikDurumu.DENEME : AbonelikDurumu.AKTIF;

    if (!mevcut) {
      return this.prisma.abonelik.create({
        data: {
          firmaId: p.firmaId,
          paketSurumuId: p.paketSurumuId,
          durum,
          erisimSonu,
          denemeSonu,
          // Ilk abonelik: korunacak erisim YOK, `erisimSonu` saf koprudur.
          kopruErisimSonu: erisimSonu,
          odemeYontemi: OdemeYontemi.KART,
          iyzicoAbonelikKodu: p.iyzicoAbonelikKodu,
          // ILK abonelikte kod KENDISI kokUdur. Plan degisiminde
          // `iyzicoAbonelikKodu` degisir ama bu SABIT kalir — webhook
          // eslemesi zincir kokuyle yapilir (abonelik.servisi:aboneligiKodlaBul).
          iyzicoKokKodu: p.iyzicoAbonelikKodu,
          iyzicoMusteriKodu: p.iyzicoMusteriKodu,
          iyzicoDurum: p.iyzicoDurum,
          iyzicoSonKontrol: simdi,
        },
      });
    }

    // Geri donen musteri: satir yeniden canlandirilir, dunning sayaclari
    // sifirlanir (eski basarisizlik yeni abonelige tasinmaz).
    //
    // ⚠ ERISIM ASLA KISALTILMAZ — 02.09'da olculdu.
    // Burasi `erisimSonu`yu KOSULSUZ eziyordu. Satin alma yolu miras
    // satirlarina acilinca (ayni gun, `mirasPaketiMi` muafiyeti) bu
    // sessiz bir CEZAYA donustu: goc satiri 365 gunluk erisim tasiyor;
    // musteri BUGUN odeseydi `erisimSonu` `simdi+32 gune` duser ve
    // ~332 gun BUHARLASIRDI. Yani ODEMEK, ODEMEMEKTEN KOTU olurdu.
    //
    // Ayni kural miras disinda da dogrudur: zaten verilmis erisimi, kisi
    // PARA ODEDIGI ICIN geri almak hicbir senaryoda savunulabilir degil.
    // Suresi gecmis satirda `mevcut.erisimSonu` gecmistedir, yeni tarih
    // kazanir — geri donen musteri yolu AYNEN calisir.
    //
    // ⚠ 24.09 — BU KURAL TEK BASINA YETMIYORDU. Buradaki eski not "ikizi
    // `erisimiUzat` zaten boyle, yani webhook yolu koruyor" diyordu: YANLISTI.
    // `erisimiUzat` yalniz HAVALE yoludur. KART tahsilat webhook'u
    // (`AbonelikServisi.tahsilatBasarili`) guncel uctan gelen sipariste
    // `erisimSonu`nu iyzico'nun `endPeriod`una yaziyordu (bu dosyanin kopru
    // tamponunu duzeltmek icin) ve burada korunan 365 gun ILK TAHSILATTA
    // yine siliniyordu — miras firma deneme almaz (deneme-hakki.servisi),
    // o tahsilat satin almadan dakikalar sonra gelir.
    //
    // Koruma artik iki uctaki TEK alana baglidir: `kopruErisimSonu` yalniz
    // buranin KOPRU degerini tasir, webhook YALNIZ `erisimSonu` hala o
    // degerse kisaltir. Kopru yalniz erisimi BITMIS (ya da hic olmayan)
    // satirda yazilir; erisimi SUREN satirda NULL — korunan tarih kopru
    // degildir, webhook onu yalniz uzatabilir. Bedeli (bilincli): suren
    // erisim kopruden KISAYSA (ornegin 5 gun kalmis) musteri kopruyu tasir —
    // en fazla kopru ile iyzico donemi farki kadar (31+2 gun − bir ay; takvim
    // ayiysa Subat'ta 5 gun) fazla erisim. Tersi, verilmis erisimi kesmek
    // olurdu. ⚠ NULL da ACIKCA yazilir: onceki satin almadan kalan bayat
    // kopru, bugunku korunan tarihi "kopru" gosteremez.
    //
    // ⚠ AYNI ABONELIGIN YENIDEN SONUCLANDIRILMASI (kurtarma taramasi / ikinci
    // donus POST'u: ilk cagri satiri yazdi, niyet TAMAMLANDI damgasi yemeden
    // hata verdi). Satirdaki erisim ve kopru BU satin almanin ilk cagrisinin
    // — ya da onu duzelten webhook'un — degeridir, "suren erisim" DEGIL: oldugu
    // gibi kalir. Aksi halde ikinci cagri kendi koprusunu NULL'lar ya da
    // webhook'un duzelttigi donem sonunu yeni bir kopruyle ezerdi (24.09
    // inceleme bulgusu). Yeni satin alma HER ZAMAN yeni iyzico kodu tasir.
    const ayniAbonelik = mevcut.iyzicoAbonelikKodu === p.iyzicoAbonelikKodu;
    const korunanErisimSonu = ayniAbonelik
      ? mevcut.erisimSonu
      : mevcut.erisimSonu > erisimSonu ? mevcut.erisimSonu : erisimSonu;
    const erisimSuruyordu = mevcut.erisimSonu.getTime() > simdi.getTime();
    const kopruErisimSonu = ayniAbonelik
      ? mevcut.kopruErisimSonu
      : erisimSuruyordu ? null : erisimSonu;

    const guncel = await this.prisma.abonelik.update({
      where: { id: mevcut.id },
      data: {
        paketSurumuId: p.paketSurumuId,
        durum,
        erisimSonu: korunanErisimSonu,
        kopruErisimSonu,
        denemeSonu,
        odemeYontemi: OdemeYontemi.KART,
        iyzicoAbonelikKodu: p.iyzicoAbonelikKodu,
          // ILK abonelikte kod KENDISI kokUdur. Plan degisiminde
          // `iyzicoAbonelikKodu` degisir ama bu SABIT kalir — webhook
          // eslemesi zincir kokuyle yapilir (abonelik.servisi:aboneligiKodlaBul).
          iyzicoKokKodu: p.iyzicoAbonelikKodu,
        iyzicoMusteriKodu: p.iyzicoMusteriKodu,
        iyzicoDurum: p.iyzicoDurum,
        iyzicoSonKontrol: simdi,
        ilkBasarisizlik: null,
        denemeSayisi: 0,
        sonDeneme: null,
        kisitlandi: null,
        iptalTalebi: null,
        iptalNedeni: null,
        // ⚠ 23.09 — ESKI ABONELIGIN PLANLI GECISI YENISINE TASINMAZ. Yeni
        // satin alma `paketSurumuId`yi yaziyor; eski bir dusurme plani
        // kalsaydi 10 dakikalik tarama onu YENI aboneligin ustune uygular ve
        // musterinin az once satin aldigi paketi sessizce degistirirdi.
        planliPaketSurumuId: null,
        paketGecisTarihi: null,
        odenenPaketSurumuId: null,
      },
    });

    await this.prisma.abonelikOlayi.create({
      data: {
        abonelikId: guncel.id,
        tip: 'abonelik.yeniden.acildi',
        oncekiDurum: mevcut.durum,
        yeniDurum: durum,
        aciklama: 'Kart ile yeniden abone olundu',
        // 24.09: korunan erisim olay kaydindan OKUNABILSIN. Bu alanlar
        // olmadan "odeme erisimi kisaltti mi" sorusu canlida ancak goc aninin
        // 365 gun sonrasi hesaplanarak olculebildi (yalniz miras icin).
        veri: {
          oncekiErisimSonu: mevcut.erisimSonu.toISOString(),
          erisimSonu: korunanErisimSonu.toISOString(),
          kopruErisimSonu: kopruErisimSonu?.toISOString() ?? null,
        },
        aktor: 'sistem',
      },
    });

    return guncel;
  }

  // ── 3. Kart guncelleme sayfasi ──────────────────────────────────────────
  async kartGuncellemeFormu(firmaId: string) {
    const ab = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    if (!ab?.iyzicoAbonelikKodu) {
      throw new BadRequestException(
        'Kart guncelleme yalnizca kart ile odenen aboneliklerde gecerlidir.',
      );
    }
    const sonuc = await this.iyzico.kartGuncellemeSayfasi(
      ab.iyzicoAbonelikKodu,
      `${this.uygulamaUrl}/abonelik/kart-donus`,
    );
    return {
      token: sonuc.token,
      formIcerigi: sonuc.checkoutFormContent,
      gecerlilikSonu: sonuc.tokenExpireTime,
    };
  }

  // ── 4. Iptal ────────────────────────────────────────────────────────────
  /**
   * Musteri iptali. Erisim DONEM SONUNA KADAR SURER (erisimSonu'na
   * dokunulmaz) — odenmis donemi geri almak sozlesmeye aykiri olurdu.
   */
  async iptalEt(
    firmaId: string,
    kullaniciId: string,
    neden?: string,
    /**
     * 25.09 — iptal onayı e-postası YALNIZ müşterinin kendi isteğinde
     * (`AbonelikController.iptal`). Hesap kapatmanın kendi e-postası var,
     * yönetici silmede müşteriye yazılmaz — ikisi bayrağı VERMEZ.
     */
    s: { musteriyeBildir?: boolean } = {},
  ) {
    const ab = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    if (!ab) throw new NotFoundException('Abonelik bulunamadi');
    const simdi = new Date();

    let iptalEdilenUc = ab.iyzicoAbonelikKodu;
    // ⚠ 24.09 — BİLİNEN KAPALI kart aboneliğine iyzico'ya GİDİLMEZ
    // (`kartAboneligiKapaliMi`, havale onayının iptaliyle TEK kural). Havaleye
    // geçen müşterinin kart aboneliği onayda kapatılır ve kodu satırda kalır;
    // ikinci iptal iyzico'da hata döner, bu yol FIRLATIP müşteri iptalini,
    // hesap kapatmayı ve yönetici silmeyi düşürüyordu (inceleme YÜKSEK-1).
    if (ab.iyzicoAbonelikKodu && !kartAboneligiKapaliMi(ab)) {
      try {
        await this.iyzico.abonelikIptal(ab.iyzicoAbonelikKodu);
      } catch (e) {
        // ⚠ 23.09 (inceleme bulgusu 1) — 201403 "iptal edilemez": kayitli uc
        // iyzico'da UPGRADED olabilir (yaniti kaybolan bir paket degisimi yeni
        // bir uc uretti, yerele yazilamadi). IPTAL BIR TUKETICI HAKKIDIR ve
        // bizim kaydimizin bayatligina takilamaz: canli uc bulunur, O iptal
        // edilir ve kaydedilir. Canli uc bulunamazsa asil hata AYNEN atilir
        // (sessiz basari yok).
        if (!(e instanceof IyzicoHatasi) || e.kod !== '201403') throw e;
        const canli = await this.abonelik.canliUcuBul(ab).catch(() => null);
        if (!canli || canli.referenceCode === ab.iyzicoAbonelikKodu) throw e;
        await this.iyzico.abonelikIptal(canli.referenceCode);
        iptalEdilenUc = canli.referenceCode;
        this.logger.warn(
          `Iptal: kayitli uc ${ab.iyzicoAbonelikKodu} bayatti (201403); canli uc ` +
            `${canli.referenceCode} bulundu ve iptal edildi (firma ${firmaId})`,
        );
      }
      // ⚠ 24.09 — iyzico'da iptal BASARILI oldu (basarisiz olsaydi yukarida
      // atilirdi): bildigimiz durum artik CANCELED ve HEMEN yazilir — asagidaki
      // `durumDegistir` bu satirda patlasa bile (SONA_ERDI/ASKIDA → IPTAL
      // gecersiz; hesap kapatma ve yonetici silme bu satirlara da gelir).
      // Yazilmasaydi alan gece mutabakatina kadar bayat 'ACTIVE' kalir ve satin
      // alma kapisi geri donen musteriyi YANLISLIKLA reddederdi
      // (`iyzicoAboneligiAcikMi`) — hesap kapatip 30 gun icinde geri donmenin
      // TEK yolu satin almadir.
      await this.prisma.abonelik.update({
        where: { id: ab.id },
        data: { iyzicoDurum: 'CANCELED' },
      });
    }

    await this.abonelik.durumDegistir(ab.id, AbonelikDurumu.IPTAL, {
      aciklama: neden ?? 'Musteri talebi',
      aktor: kullaniciId,
    });

    // ⚠ 23.09 (inceleme bulgusu 2) — YUKSELTME + IPTAL ISTISMARI. Yukseltme
    // ozellikleri HEMEN verir, yeni ucret DONEM SONUNDA baslar; iptal o yeni
    // ucreti HIC baslatmaz. Etkin paket ust pakette kalsaydi firma odemedigi
    // paketi donem sonuna kadar kullanirdi — ve her ay "Basic al → MEP'e gec
    // → iptal et" ile SUREKLI. Iptal odenmis donemin sonuna kadar erisimi
    // korur: ODENMIS paketle. Yeni ucret basladiktan sonra (tarih gectiyse)
    // ust paket zaten odenmistir, geri alinmaz.
    const yukseltmeGeriAlinir =
      !!ab.odenenPaketSurumuId &&
      !!ab.paketGecisTarihi &&
      ab.paketGecisTarihi.getTime() > simdi.getTime() &&
      ab.odenenPaketSurumuId !== ab.paketSurumuId;

    // ⚠ 25.09 — KOŞULLU: okuduğumuz `iptalTalebi` hâlâ yerindeyse yazılır.
    // Aynı iptali eşzamanlı iki istek (çift tık) okursa yalnız biri yazar;
    // e-posta onun kararıdır (TAM BİR KEZ). Sıralı ikinci istek satırı zaten
    // IPTAL okur: yazım eskisi gibi olur, e-posta gitmez.
    const iptalYazimi = await this.prisma.abonelik.updateMany({
      where: { id: ab.id, iptalTalebi: ab.iptalTalebi },
      data: {
        iptalTalebi: simdi,
        iptalNedeni: neden ?? null,
        ...(iptalEdilenUc && iptalEdilenUc !== ab.iyzicoAbonelikKodu
          ? {
              iyzicoAbonelikKodu: iptalEdilenUc,
              iyzicoKokKodu: ab.iyzicoKokKodu ?? ab.iyzicoAbonelikKodu,
            }
          : {}),
        ...(yukseltmeGeriAlinir ? { paketSurumuId: ab.odenenPaketSurumuId! } : {}),
        // ⚠ 23.09 — IPTAL PLANLI GECISI DE BITIRIR. iyzico'da bekleyen uc
        // (yeni plan) yukarida iptal edildi; yerelde dusurme plani kalsaydi
        // tarama donem sonunda iptal edilmis bir aboneligin paketini
        // degistirir ve olay kaydina "paket degisti" yazardi.
        planliPaketSurumuId: null,
        paketGecisTarihi: null,
        odenenPaketSurumuId: null,
      },
    });

    // Yazımı KAYBEDEN eşzamanlı istek olay yazmaz (kazanan yazdı; inceleme L11).
    if (yukseltmeGeriAlinir && iptalYazimi.count === 1) {
      await this.prisma.abonelikOlayi.create({
        data: {
          abonelikId: ab.id,
          tip: 'paket.geri.alindi',
          oncekiDurum: AbonelikDurumu.IPTAL,
          yeniDurum: AbonelikDurumu.IPTAL,
          aciklama:
            'Yükseltmenin yeni ücreti başlamadan abonelik iptal edildi; etkin paket, ' +
            'dönemi ödenmiş pakete döndü.',
          veri: {
            yukseltilenPaketSurumuId: ab.paketSurumuId,
            odenenPaketSurumuId: ab.odenenPaketSurumuId,
            gecisTarihi: ab.paketGecisTarihi!.toISOString(),
          },
          aktor: kullaniciId,
        },
      });
    }

    const ilkIptal = ab.durum !== AbonelikDurumu.IPTAL && iptalYazimi.count === 1;
    if (s.musteriyeBildir && ilkIptal) {
      await this.iptalOnayiGonder(ab, yukseltmeGeriAlinir, simdi).catch((e) =>
        this.logger.error(
          `Iptal onayi e-postasi gonderilemedi (firma ${firmaId}): ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }

    return { durum: AbonelikDurumu.IPTAL, erisimSonu: ab.erisimSonu };
  }

  /**
   * "Aboneliginiz iptal edildi" — metin `musteri-epostalari.ts`. Paket adi
   * iptalden SONRAKI satirdan okunur: yukseltme geri alindiysa etkin paket
   * artik odenmis pakettir.
   */
  private async iptalOnayiGonder(
    ab: {
      id: string;
      firmaId: string;
      durum: AbonelikDurumu;
      erisimSonu: Date;
      denemeSonu: Date | null;
      odemeYontemi: OdemeYontemi;
    },
    yukseltmeGeriAlindi: boolean,
    simdi: Date,
  ): Promise<void> {
    const firma = await this.prisma.firma.findUnique({
      where: { id: ab.firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    const kime = firma?.faturaEposta ?? firma?.yetkiliEposta;
    if (!firma || !kime) {
      this.logger.warn(`Iptal onayi ATLANDI: firma ${ab.firmaId} icin adres yok`);
      return;
    }
    const guncel = await this.prisma.abonelik.findUnique({
      where: { id: ab.id },
      select: { paketSurumu: { select: { paket: { select: { ad: true } } } } },
    });
    const paketAdi = guncel?.paketSurumu?.paket?.ad ?? 'MetaPriceX';
    // DENEME TARIHE GORE (`yonetici-islemi.ts` H1 ile ayni okuma): gece
    // mutabakati deneme satirini AKTIF'e cekebiliyordu; etiket tek basina
    // "ilk cekim yapildi" demez.
    const denemede =
      ab.durum === AbonelikDurumu.DENEME || (!!ab.denemeSonu && ab.denemeSonu.getTime() > simdi.getTime());
    // Son tahsilat alinamadi: `erisimSonu` basarisiz yenilemenin (GECMIS)
    // tarihidir — "odenmis doneminiz surer" YAZILAMAZ (inceleme M2).
    const odenmemis =
      ab.durum === AbonelikDurumu.ODEME_BEKLIYOR || ab.durum === AbonelikDurumu.KISITLI;
    const bitis = denemede ? (ab.denemeSonu ?? ab.erisimSonu) : ab.erisimSonu;
    await this.eposta.gonder({
      kime,
      ...iptalOnayiEpostasi({
        firmaAdi: firma.ad,
        paketAdi,
        bitis,
        hal: denemede ? 'deneme' : odenmemis ? 'odenmemis' : 'odenmis',
        kartli: ab.odemeYontemi === OdemeYontemi.KART,
        erisimSuruyor: bitis.getTime() > simdi.getTime(),
        geriDonulenPaketAdi: yukseltmeGeriAlindi ? paketAdi : null,
        uygulamaUrl: this.uygulamaUrl,
      }),
    });
  }

  // ── 5. Kurtarma taramasi ────────────────────────────────────────────────
  /**
   * "Odedi ama erisim acilmadi" dongusunun panzehiri. Bkz. sinif basligi.
   *
   * 10 dakikada bir: donusu gelmemis, 5 dakikadan eski niyetleri iyzico'ya
   * sorar. Tahsilat gectiyse aboneligi acar.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async bekleyenNiyetleriTara(): Promise<void> {
    const bes = new Date(Date.now() - 5 * 60_000);
    const bekleyenler = await this.prisma.abonelikBaslatma.findMany({
      where: {
        durum: AbonelikBaslatmaDurumu.BEKLIYOR,
        olusturuldu: { lt: bes },
        denemeSayisi: { lt: this.AZAMI_DENEME },
      },
      orderBy: { olusturuldu: 'asc' },
      take: 50,
    });

    for (const n of bekleyenler) {
      try {
        await this.niyetiSonuclandir(n.id, n.firmaId);
      } catch (e) {
        this.logger.warn(
          `Niyet ${n.id} sonuclandirilamadi: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    // Denemesi tukenmis niyetleri kapat — sonsuz kuyruk birikmesin.
    const tukenmis = await this.prisma.abonelikBaslatma.updateMany({
      where: {
        durum: AbonelikBaslatmaDurumu.BEKLIYOR,
        denemeSayisi: { gte: this.AZAMI_DENEME },
      },
      data: { durum: AbonelikBaslatmaDurumu.VAZGECILDI },
    });
    if (tukenmis.count > 0) {
      this.logger.warn(
        `${tukenmis.count} satin alma niyeti denemesi tukendigi icin kapatildi.`,
      );
    }
  }
}
