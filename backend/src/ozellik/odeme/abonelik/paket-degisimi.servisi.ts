import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AbonelikDurumu, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { HUKUKI_METIN_SURUMU } from '../../../altyapi/auth/hukuki-surum';
import {
  IyzicoClient,
  IyzicoHatasi,
  type IyzicoAbonelikDetayi,
  type IyzicoPaketDegisimYaniti,
} from '../iyzico/iyzico.client';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { AbonelikServisi } from './abonelik.servisi';
import { DENEMESIZ_PLAN_YOK_MESAJI, planSec } from './satinalma.servisi';
import {
  KILIT_EMNIYET_GUN,
  beklenenGecisTarihi,
  degisimCumlesi,
  gecisTarihiSec,
  paketDegisimYolu,
  paketHakKayiplari,
  type DegisimZamanlamasi,
  type PaketDegisimRedKodu,
} from './paket-degisimi';

/**
 * iyzico `201402` "Bu abonelik yükseltilemez" — 20.08'de UPGRADED (terminal)
 * uca yükseltme denenince ÖLÇÜLDÜ. Bizim kaydımızdaki uç bayatsa (önceki bir
 * değişimin yerel yazması kaybolmuşsa) tam olarak bu gelir: kesin red DEĞİL,
 * "zincirde senin bilmediğin bir uç var" demektir.
 */
const KAYITLI_UC_BAYAT = '201402';
const GUN_MS = 86_400_000;

/** `/abonelik/paketler` kartinin okudugu ozet — iyzico kodu TASIMAZ. */
export type DegisimOzeti =
  | { yol: 'satin-al' }
  | { yol: 'degistir'; zamanlama: DegisimZamanlamasi; beklenenTarih: string }
  | { yol: 'yok'; kod: PaketDegisimRedKodu; mesaj: string };

export interface DegisimSonucu {
  zamanlama: DegisimZamanlamasi;
  paketGecisTarihi: string;
  yeniPaket: { kod: string; ad: string };
  yeniTutar: string;
  mesaj: string;
  /** Kurtarmada bulunan degisim bu istekte secilen paket DEGIL (onceki, yaniti kaybolan). */
  oncekiDegisim: boolean;
}

export type AbonelikSatiri = Prisma.AbonelikGetPayload<{
  include: { paketSurumu: { include: { paket: true } } };
}>;
export type SurumSatiri = Prisma.PaketSurumuGetPayload<{ include: { paket: true } }>;

/** Basarili (ya da kurtarilmis) degisimin islemciye verilen ozeti. */
export interface SonucBaglami {
  firmaId: string;
  mevcut: AbonelikSatiri;
  hedef: SurumSatiri;
  zamanlama: DegisimZamanlamasi;
  gecis: Date;
  cumle: string;
  kurtarma: { iyzicoKodu: string | null; farkliDegisim: boolean } | null;
}

/**
 * ── DEGISIMI KIM YAPIYOR? (24.09.2026, A2) ─────────────────────────────────
 * Tek cekirdek (`degistirSirayla`), iki islemci: musteri (A1) ve yonetici
 * (A2). Emre: "tek yol" — ayni karar, ayni iyzico cagrisi, ayni kurtarma,
 * ayni olay tipi. Degisen yalniz: olayin izi (onay mi, yonetici mi), ek
 * denetim satiri ve bildirim.
 *
 * ⚠ Musteri islemcisi A1'in DEGERLERINI AYNEN uretir (aktor = kullanici,
 * onay izi olay verisinin SONUNDA, ayni e-posta) — A1 testleri degismeden
 * yesil kalmali.
 */
export interface DegisimIslemcisi {
  /**
   * Kuyrukta, TAZE satirla, A1 kararindan ONCE. Yonetici kurali burada
   * uygulanir — ekrandaki siniflandirmaya GUVENILMEZ. Reddetmek icin firlatir.
   */
  kontrol?: (b: { ab: AbonelikSatiri | null; yeni: SurumSatiri; simdi: Date }) => Promise<void>;
  /** iyzico'dan hemen ONCE (niyet denetimi). Firlatirsa iyzico'ya istek GITMEZ. */
  oncesi?: (b: { mevcut: AbonelikSatiri; yeni: SurumSatiri }) => Promise<void>;
  /**
   * Olay `veri`sinin SONUNA eklenecek iz. Baglam verilir: kurtarmada
   * kaydedilen degisim bu istegin DEGIL, oncekinin olabilir (atif ona gore).
   */
  olayEki: (simdi: Date, b: SonucBaglami) => Record<string, unknown>;
  /** Ana islemde ek yazim: firlatirsa degisimin YEREL yazimi da geri alinir. */
  txEki?: (tx: Prisma.TransactionClient, b: SonucBaglami) => Promise<void>;
  /** Basarili yazimdan sonra bildirim. Gonderim denendiyse `true`. */
  bildir: (b: SonucBaglami) => Promise<boolean>;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAKET DEGISIMI — uygulama (23.09.2026, yonetici paneli turu A1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Karar SAF modulde (`paket-degisimi.ts`); bu servis yalniz UYGULAR:
 *    1. Karar (ekranla ayni fonksiyon) — reddedilen istek iyzico'ya GITMEZ.
 *    2. iyzico `upgrade`, HER ZAMAN `NEXT_PERIOD` + deneme YOK.
 *    3. Yeni uc kodu + etkin/planli paket + gecis tarihi TEK islemde yazilir.
 *    4. Olay kaydi (onayin izi dahil) + musteriye e-posta.
 *
 *  ── SIRA: ONCE IYZICO, SONRA BIZ ─────────────────────────────────────────
 *  Tersi olsaydi iyzico reddettiginde yerelde "Pro'ya gecti" yazili kalir ve
 *  musteri odemedigi paketi kullanirdi. iyzico basarili + bizim yazma
 *  dustuyse: yeni uc webhook'ta zincirden bulunur (`aboneligiKodlaBul`
 *  3. kademe) ve paket ODENEN PLANA hizalanir (`odenenPaketeHizala`) — yani
 *  kurtarma yolu vardir; gunluge tum kodlar yazilir.
 *
 *  ── IKINCI DEGISIM ───────────────────────────────────────────────────────
 *  Bekleyen (henuz baslamamis) iyzico ucuna ikinci `upgrade` davranisi
 *  OLCULMEDI. Yanlis giderse iki plan ayni anda baslayabilir (cift cekim).
 *  Bu yuzden donem basina TEK degisim: `paketGecisTarihi` DOLU oldukca karar
 *  `DEGISIM_BEKLIYOR` der — tarih gecse bile, yeni ucun ilk basarili
 *  tahsilati gorulene kadar (inceleme bulgusu 4). Ayni anda iki istek
 *  gelirse firma sirasi ikisini sirayla kosar; ikincisi birincinin kilidini
 *  gorur.
 *
 *  ── BELIRSIZ SONUC (inceleme bulgusu 1) ──────────────────────────────────
 *  Ag hatasi / yaniti okunamayan cagri ve 201402 "kesin red" SAYILMAZ:
 *  iyzico degisimi yapmis olabilir. `canliUcuBul` ile SORULUR; degisim
 *  bulunursa yerele alinir, bulunamazsa musteriye "dogrulanamadi" denir —
 *  "degismedi" DEGIL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class PaketDegisimiServisi {
  private readonly logger = new Logger(PaketDegisimiServisi.name);
  private readonly uygulamaUrl: string;

  /** Firma basina sira (SatinAlmaServisi ile ayni desen; tek surec varsayimi). */
  private readonly firmaSirasi = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
    private readonly abonelik: AbonelikServisi,
    private readonly eposta: EpostaServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl = config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

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

  private aboneligiGetir(firmaId: string) {
    return this.prisma.abonelik.findUnique({
      where: { firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });
  }

  /**
   * Kart dugmeleri icin: bu firma verilen surumlerin her birine NASIL gecer?
   * Karar `degistir` ile AYNI saf fonksiyondan — ekran "gec" deyip sunucu
   * reddedemez (tersi de).
   */
  async yollar(firmaId: string, surumIdleri: string[], simdi = new Date()): Promise<Map<string, DegisimOzeti>> {
    const [ab, surumler] = await Promise.all([
      this.aboneligiGetir(firmaId),
      this.prisma.paketSurumu.findMany({
        where: { id: { in: surumIdleri } },
        include: { paket: true },
      }),
    ]);
    const sonuc = new Map<string, DegisimOzeti>();
    for (const s of surumler) {
      const y = paketDegisimYolu(ab, s, simdi);
      sonuc.set(
        s.id,
        y.yol === 'degistir'
          ? {
              yol: 'degistir',
              zamanlama: y.zamanlama,
              // `ab` burada kesin var (yol `degistir`).
              beklenenTarih: beklenenGecisTarihi(ab!, simdi).toISOString(),
            }
          : y,
      );
    }
    return sonuc;
  }

  async degistir(p: {
    firmaId: string;
    kullaniciId: string;
    paketSurumuId: string;
    sozlesmeOnayi?: boolean;
  }): Promise<DegisimSonucu> {
    // ⚠ ONAY KAPISI ILK SIRADA (DTO'da da var): servis tek bir ucun ardinda
    // olmayabilir — onaysiz cagri iyzico'ya HICBIR istek gondermeden durur.
    if (p.sozlesmeOnayi !== true) {
      throw new BadRequestException(
        'Devam edebilmek için Ön Bilgilendirme Formu ve Mesafeli Satış ' +
          'Sözleşmesi onayını işaretlemelisiniz.',
      );
    }
    const musteri: DegisimIslemcisi = {
      // ── ONAYIN IZI (satin almadaki 6.4 ile ayni) ──────────────
      // Zaman SUNUCUDA, surum BACKEND SABITINDEN: istemcinin
      // "hangi metni onayladim" beyanina guvenilmez.
      olayEki: (simdi) => ({
        sozlesmeOnayiZamani: simdi.toISOString(),
        sozlesmeSurumu: HUKUKI_METIN_SURUMU,
      }),
      bildir: (b) => this.degisimMailiGonder(b.firmaId, b.cumle),
    };
    const r = await this.firmaSirasiyla(p.firmaId, () => this.degistirSirayla(p, musteri));
    return r.sonuc;
  }

  private async degistirSirayla(
    p: {
      firmaId: string;
      /** Olay `aktor`u: musteri yolunda kullanici, yonetici yolunda yonetici. */
      kullaniciId: string;
      paketSurumuId: string;
    },
    islemci: DegisimIslemcisi,
  ): Promise<{ sonuc: DegisimSonucu; bildirildi: boolean }> {
    const simdi = new Date();
    const [ab, yeni] = await Promise.all([
      this.aboneligiGetir(p.firmaId),
      this.prisma.paketSurumu.findUnique({
        where: { id: p.paketSurumuId },
        include: { paket: true },
      }),
    ]);
    if (!yeni) throw new NotFoundException('Paket bulunamadı.');

    // Yonetici kurali (varsa) A1 kararindan ONCE ve TAZE satirla.
    await islemci.kontrol?.({ ab, yeni, simdi });

    const yol = paketDegisimYolu(ab, yeni, simdi);
    if (yol.yol === 'satin-al') {
      throw new BadRequestException({
        kod: 'SATIN_ALMA_YOLU',
        message: 'Etkin bir aboneliğiniz yok. Paketi seçip satın alarak başlayabilirsiniz.',
      });
    }
    if (yol.yol === 'yok') {
      throw new BadRequestException({ kod: yol.kod, message: yol.mesaj });
    }
    // `yol === 'degistir'` ise abonelik ve iyzico kodu kesin var.
    const mevcut = ab!;
    const eskiKod = mevcut.iyzicoAbonelikKodu!;

    // ── PLAN: DENEMESIZ ────────────────────────────────────────────────
    // Satin almadaki `planSec` kurali, "hak yok" ile: yeni planin deneme
    // gunu degisimde ASLA verilmez. Ikiz plan yoksa DENEMELI plana
    // DUSULMEZ (satin almayla ayni kapali hata) — iyzico `useTrial:false`
    // gorse bile denemeli plana gecis olculmedi, bedava ay riski alinmaz.
    const plan = planSec(yeni, { hak: false, gerekce: 'kullanildi' });
    if (plan.tur !== 'plan') {
      this.logger.error(
        `PAKET DEGISIMI DURDU — DENEMESIZ PLAN YOK: surum=${yeni.id} paket=${yeni.paket.kod}. ` +
          'paketleri-kur.ts --tek-urun (ya da --denemesiz-ikiz) ile kurun.',
      );
      throw new ServiceUnavailableException({
        kod: 'DENEMESIZ_PLAN_YOK',
        message: DENEMESIZ_PLAN_YOK_MESAJI,
      });
    }

    const onceki = { kod: mevcut.paketSurumu.paket.kod, ad: mevcut.paketSurumu.paket.ad };

    // `hedef` ve `zamanlama` KURTARMADA degisebilir: iyzico'da yaniti daha
    // once kaybolmus BASKA bir degisim bulunursa YERELE ALINAN odur (musteri
    // o plani odeyecek; baska bir seyi kaydetmek yalan olurdu).
    let hedef = yeni;
    let zamanlama = yol.zamanlama;
    let kurtarma: { iyzicoKodu: string | null; farkliDegisim: boolean } | null = null;

    // Yonetici yolunda NIYET DENETIMI: iyzico'ya gitmeden once yazilir;
    // yazilamazsa istek HIC GITMEZ (denetimsiz degisim olmasin).
    await islemci.oncesi?.({ mevcut, yeni });

    let yanit: IyzicoPaketDegisimYaniti;
    try {
      yanit = await this.iyzico.paketDegistir(eskiKod, {
        yeniPlanKodu: plan.planKodu,
        // ⚠ HER ZAMAN NEXT_PERIOD — `NOW` kist hesap yapmaz (20.08 olcumu).
        nezaman: 'NEXT_PERIOD',
        denemeUygula: false,
        tekrarSayisiniSifirla: false,
      });
    } catch (e) {
      const iyzicoKodu = e instanceof IyzicoHatasi ? e.kod ?? null : null;
      const mesaj = e instanceof Error ? e.message : String(e);
      // ── SONUC BELIRSIZ MI? (inceleme bulgusu 1) ───────────────────────
      // Acik bir iyzico hata kodu = KESIN RED (201402 HARIC). Ag/ayristirma
      // hatasi (kodsuz) ya da 201402 (kayitli uc iyzico'da ZATEN UPGRADED)
      // SONUCU BILINMEZ: iyzico degisimi yapmis, yanit kaybolmus olabilir.
      // Oyleyken "Paketiniz degismedi" demek YALAN olurdu: musteri yeniden
      // dener (201402), iptal edemez (201403) ve donem sonunda yeni plan
      // cekilir. Once iyzico'ya SORULUR (`canliUcuBul`).
      const belirsiz = !iyzicoKodu || iyzicoKodu === KAYITLI_UC_BAYAT;
      const dogrulama = belirsiz
        ? await this.sonucuDogrula(mevcut, eskiKod)
        : ({ durum: 'degismedi' } as const);

      if (dogrulama.durum === 'degismedi') {
        this.logger.error(
          `iyzico paket degisimi REDDETTI: firma=${p.firmaId} ${onceki.kod} → ${yeni.paket.kod} ` +
            `uc=${eskiKod} kod=${iyzicoKodu ?? '-'}: ${mesaj}`,
        );
        await this.abonelik
          .olayYaz(mevcut.id, 'paket.degisim.basarisiz', {
            aciklama: `${onceki.ad} → ${yeni.paket.ad}: iyzico değişimi kabul etmedi`,
            veri: { oncekiPaket: onceki.kod, hedefPaket: yeni.paket.kod, iyzicoKodu, iyzicoMesaji: mesaj },
            aktor: p.kullaniciId,
          })
          .catch(() => undefined);
        // ⚠ iyzico'nun ham metni musteriye GOSTERILMEZ (kart/abonelik ic
        // bilgisi tasiyabilir); gunlukte ve olay kaydinda tam hali var.
        throw new BadGatewayException({
          kod: 'SAGLAYICI_DEGISIM_HATASI',
          message:
            'Paket değişikliği ödeme sağlayıcısında tamamlanamadı. Paketiniz değişmedi; ' +
            'lütfen daha sonra yeniden deneyin.',
        });
      }

      // iyzico'da degisim VAR: hangi plan? Istenenle ayniysa bu istegin yaniti
      // kaybolmustur; degilse ONCEKI bir istegin yerel yazmasi kaybolmustur.
      let bulunanSurum: typeof yeni | null = null;
      if (dogrulama.durum === 'degisti') {
        bulunanSurum =
          dogrulama.uc.pricingPlanReferenceCode === plan.planKodu
            ? yeni
            : await this.prisma.paketSurumu.findFirst({
                where: {
                  OR: [
                    { iyzicoPlanKodu: dogrulama.uc.pricingPlanReferenceCode },
                    { iyzicoDenemesizPlanKodu: dogrulama.uc.pricingPlanReferenceCode },
                  ],
                },
                include: { paket: true },
              });
      }
      if (dogrulama.durum === 'belirsiz' || !bulunanSurum) {
        const neden =
          dogrulama.durum === 'belirsiz'
            ? dogrulama.neden
            : `bilinmeyen plan ${dogrulama.uc.pricingPlanReferenceCode}`;
        this.logger.error(
          `⚠ PAKET DEGISIMI BELIRSIZ: firma=${p.firmaId} ${onceki.kod} → ${yeni.paket.kod} ` +
            `uc=${eskiKod} iyzicoKodu=${iyzicoKodu ?? '-'} (${mesaj}) — dogrulama: ${neden}. ` +
            'Yenileme webhook\'u zinciri onaracak; YONETICI KONTROLU gerekebilir.',
        );
        await this.abonelik
          .olayYaz(mevcut.id, 'paket.degisim.belirsiz', {
            aciklama: `${onceki.ad} → ${yeni.paket.ad}: sonuç doğrulanamadı`,
            veri: { oncekiPaket: onceki.kod, hedefPaket: yeni.paket.kod, eskiIyzicoKodu: eskiKod, iyzicoKodu, iyzicoMesaji: mesaj, neden },
            aktor: p.kullaniciId,
          })
          .catch(() => undefined);
        throw new ServiceUnavailableException({
          kod: 'DEGISIM_DOGRULANAMADI',
          message:
            'Paket değişikliğinin sonucu şu an doğrulanamadı. Birkaç dakika sonra bu sayfayı ' +
            'yenileyip paketinizi kontrol edin; değişiklik görünmüyorsa yeniden deneyebilirsiniz.',
        });
      }

      hedef = bulunanSurum;
      zamanlama =
        paketHakKayiplari(mevcut.paketSurumu.paket, hedef.paket).length === 0 ? 'hemen' : 'donem-sonu';
      kurtarma = { iyzicoKodu, farkliDegisim: hedef.id !== yeni.id };
      const uc = (dogrulama as { uc: IyzicoAbonelikDetayi }).uc;
      yanit = {
        referenceCode: uc.referenceCode,
        parentReferenceCode: uc.parentReferenceCode,
        pricingPlanReferenceCode: uc.pricingPlanReferenceCode,
        subscriptionStatus: uc.subscriptionStatus,
        startDate: uc.startDate,
      };
      this.logger.warn(
        `Paket degisimi KURTARILDI: firma=${p.firmaId} iyzico yaniti alinamadi (${iyzicoKodu ?? 'ag'}), ` +
          `canli uc ${uc.referenceCode} (${hedef.paket.kod}) yerele aliniyor`,
      );
    }

    const yeniKod =
      typeof yanit?.referenceCode === 'string' && yanit.referenceCode.trim()
        ? yanit.referenceCode.trim()
        : null;
    const gecis = gecisTarihiSec(yanit?.startDate, mevcut, simdi);
    if (gecis.getTime() <= simdi.getTime()) {
      // NEXT_PERIOD'un gecmis bir baslangic bildirmesi beklenmez. Tarih yine
      // yazilir (planli gecis ilk taramada uygulanir) ama sessiz gecilmez.
      this.logger.error(
        `iyzico yeni planin baslangicini GECMIS bildirdi: firma=${p.firmaId} ` +
          `baslangic=${gecis.toISOString()} (NEXT_PERIOD istenmisti)`,
      );
    }

    const hemen = zamanlama === 'hemen';
    const hedefOzet = { kod: hedef.paket.kod, ad: hedef.paket.ad };
    const cumle =
      (kurtarma?.farkliDegisim
        ? 'Daha önce başlattığınız paket değişikliği ödeme sağlayıcısında tamamlanmıştı; ' +
          'kaydınız buna göre güncellendi. '
        : '') +
      degisimCumlesi({
        zamanlama,
        yeniPaketAdi: hedef.paket.ad,
        yeniTutar: hedef.tutar.toFixed(2),
        gecisTarihi: gecis,
      });
    const baglam: SonucBaglami = {
      firmaId: p.firmaId,
      mevcut,
      hedef,
      zamanlama,
      gecis,
      cumle,
      kurtarma,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        // ⚠ KOSULLU YAZIM (inceleme bulgusu M3, 24.09): iptal ve odeme yollari
        // bu kuyrugu KULLANMAZ. iyzico cagrisi surerken musteri iptal ederse
        // (`iptalEt` canli ucu bulur, iptal eder, planliyi ve kilidi siler,
        // IPTAL yazar) kosulsuz yazim IPTAL satirina planli dusurmeyi ve
        // kilidi GERI koyardi; 10 dk tarama da onu uygulardi. Satir okudugumuz
        // halde degilse (uc ayni, durum degistirilebilir, kilit yok) HICBIR
        // SEY yazilmaz — degisim iyzico'da olmus olabilir; asagidaki YARIM
        // gunlugu ve kurtarma yolu (201402/201403) onu bulur.
        const yazim = await tx.abonelik.updateMany({
          where: {
            id: mevcut.id,
            iyzicoAbonelikKodu: eskiKod,
            durum: { in: [AbonelikDurumu.AKTIF, AbonelikDurumu.DENEME] },
            paketGecisTarihi: null,
          },
          data: {
            // YUKSELTME: ozellikler HEMEN; donemi ODENMIS paket saklanir —
            // yeni ucret baslamadan iptal gelirse etkin paket ona doner
            // (inceleme bulgusu 2). DUSURME/YATAY: etkin paket AYNEN kalir,
            // gecis `planliGecisiUygula`da donem sonunda yazilir.
            ...(hemen
              ? {
                  paketSurumuId: hedef.id,
                  planliPaketSurumuId: null,
                  odenenPaketSurumuId: mevcut.paketSurumuId,
                }
              : { planliPaketSurumuId: hedef.id, odenenPaketSurumuId: null }),
            paketGecisTarihi: gecis,
            // Yeni UC. Kok SABIT kalir — webhook eslemesi ona dayanir.
            ...(yeniKod
              ? {
                  iyzicoAbonelikKodu: yeniKod,
                  iyzicoKokKodu: mevcut.iyzicoKokKodu ?? eskiKod,
                }
              : {}),
            ...(typeof yanit?.subscriptionStatus === 'string'
              ? { iyzicoDurum: yanit.subscriptionStatus }
              : {}),
            iyzicoSonKontrol: simdi,
          },
        });
        if (yazim.count !== 1) {
          throw new ConflictException({
            kod: 'ABONELIK_DEGISTI',
            message:
              'Abonelik bu işlem sırasında değişti (örneğin iptal edildi); paket değişikliği kaydedilmedi. ' +
              'Sayfayı yenileyip durumu kontrol edin.',
          });
        }
        await tx.abonelikOlayi.create({
          data: {
            abonelikId: mevcut.id,
            tip: hemen ? 'paket.degisti' : 'paket.degisim.planlandi',
            oncekiDurum: mevcut.durum,
            yeniDurum: mevcut.durum,
            aciklama: cumle,
            veri: {
              oncekiPaket: onceki.kod,
              yeniPaket: hedef.paket.kod,
              oncekiPaketSurumuId: mevcut.paketSurumuId,
              yeniPaketSurumuId: hedef.id,
              // Kurtarmada musterinin BU istekte sectigi paket baska olabilir.
              istenenPaketSurumuId: yeni.id,
              zamanlama,
              kayiplar: paketHakKayiplari(mevcut.paketSurumu.paket, hedef.paket),
              oncekiTutar: mevcut.paketSurumu.tutar.toFixed(2),
              yeniTutar: hedef.tutar.toFixed(2),
              paketGecisTarihi: gecis.toISOString(),
              eskiIyzicoKodu: eskiKod,
              yeniIyzicoKodu: yeniKod,
              iyzicoPlanKodu: yanit?.pricingPlanReferenceCode ?? plan.planKodu,
              kurtarma,
              // Musteri: onayin izi · yonetici: kim, neden (islemci).
              ...islemci.olayEki(simdi, baglam),
            },
            aktor: p.kullaniciId,
          },
        });
        await islemci.txEki?.(tx, baglam);
      });
    } catch (e) {
      // iyzico DEGISTI, biz yazamadik. Musteri yeniden denerse eski kod
      // artik terminal (UPGRADED) — iyzico 201402 doner ve yukaridaki
      // dogrulama yolu bu degisimi BULUP yerele alir (cift degisim olmaz).
      // Iptal de 201403'te canli ucu bulur. Son kurtarma: yenileme webhook'u.
      this.logger.error(
        `⚠ PAKET DEGISIMI YARIM: iyzico kabul etti ama yerel yazma DUSTU. firma=${p.firmaId} ` +
          `${onceki.kod} → ${hedef.paket.kod} eskiUc=${eskiKod} yeniUc=${yeniKod ?? '(yok)'} ` +
          `gecis=${gecis.toISOString()}: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }

    if (!yeniKod) {
      this.logger.error(
        `iyzico paket degisiminde YENI abonelik kodu DONDURMEDI: firma=${p.firmaId} eskiUc=${eskiKod}. ` +
          'Guncel uc webhook zincirinden onarilacak; iptal 201403 alirsa canli ucu arar.',
      );
    }
    this.logger.log(
      `Paket degisimi: firma=${p.firmaId} ${onceki.kod} → ${hedef.paket.kod} (${zamanlama}) ` +
        `gecis=${gecis.toISOString()} uc=${yeniKod ?? eskiKod}` +
        (kurtarma ? ` [KURTARMA${kurtarma.farkliDegisim ? ', onceki degisim' : ''}]` : ''),
    );

    // ── KALICI VERI SAKLAYICISI (6.4 ile ayni gerekce) ─────────────────
    // ⚠ KRITIK DEGIL: posta sunucusu dustu diye iyzico'da gerceklesmis bir
    // degisim geri alinamaz. Ama SESSIZ degil — gunluge yazilir.
    const bildirildi = await islemci.bildir(baglam).catch((e) => {
      this.logger.error(`Paket degisimi maili gonderilemedi (firma ${p.firmaId}): ${e}`);
      return false;
    });

    return {
      sonuc: {
        zamanlama,
        paketGecisTarihi: gecis.toISOString(),
        yeniPaket: hedefOzet,
        yeniTutar: hedef.tutar.toFixed(2),
        mesaj: cumle,
        oncekiDegisim: kurtarma?.farkliDegisim === true,
      },
      bildirildi,
    };
  }

  /**
   * Belirsiz sonuc (ag hatasi / 201402) sonrasi iyzico'ya SORAR.
   *   degismedi — kayitli uc hala canli: degisim OLMADI (kesin)
   *   degisti   — kayitli uc UPGRADED, canli cocuk bulundu
   *   belirsiz  — sorulamadi ya da cocuk bulunamadi (tahmin YOK)
   */
  private async sonucuDogrula(
    mevcut: { iyzicoAbonelikKodu: string | null; iyzicoKokKodu: string | null; iyzicoMusteriKodu: string | null },
    eskiKod: string,
  ): Promise<
    | { durum: 'degismedi' }
    | { durum: 'degisti'; uc: IyzicoAbonelikDetayi }
    | { durum: 'belirsiz'; neden: string }
  > {
    try {
      const canli = await this.abonelik.canliUcuBul(mevcut);
      if (!canli) return { durum: 'belirsiz', neden: 'canli uc bulunamadi' };
      if (canli.referenceCode === eskiKod) return { durum: 'degismedi' };
      return { durum: 'degisti', uc: canli };
    } catch (e) {
      return { durum: 'belirsiz', neden: `iyzico'ya sorulamadi: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  private async degisimMailiGonder(firmaId: string, cumle: string): Promise<boolean> {
    const firma = await this.prisma.firma.findUnique({
      where: { id: firmaId },
      select: { ad: true, faturaEposta: true, yetkiliEposta: true },
    });
    const adres = firma?.faturaEposta ?? firma?.yetkiliEposta;
    if (!adres) {
      this.logger.warn(`Paket degisimi maili ATLANDI: firma ${firmaId} icin adres yok`);
      return false;
    }
    await this.eposta.gonder({
      kime: adres,
      konu: 'MetaPriceX — paket değişikliğiniz',
      baslik: 'Paket değişikliğiniz alındı',
      paragraflar: [
        cumle,
        'Değişiklik adımında onayladığınız Ön Bilgilendirme Formu ve Mesafeli Satış ' +
          `Sözleşmesi şu adreste yayında: ${this.uygulamaUrl}/mesafeli-satis`,
        `Onayladığınız metin sürümü: ${HUKUKI_METIN_SURUMU}`,
        'İyi çalışmalar.',
      ],
      dugme: { etiket: 'Aboneliğimi gör', url: `${this.uygulamaUrl}/abonelik` },
    });
    return true;
  }

  /**
   * Islemciyle degisim — ⚠ ONAY KAPISI YOKTUR: kapi islemcinin `kontrol`undedir.
   * Musteri yolu `degistir()`den (sozlesme onayi), yonetici yolu
   * `YoneticiDusurmeServisi`nden (yonetici kurali) gecer. BASKA CAGIRAN EKLEMEYIN:
   * yeni bir yol once kendi kapisini `kontrol`e yazmali — tip bunu ZORLAR
   * (`kontrol` burada zorunlu; kapisiz bir islemci derlenmez).
   */
  islemciyleDegistir(
    p: { firmaId: string; kullaniciId: string; paketSurumuId: string },
    islemci: DegisimIslemcisi & { kontrol: NonNullable<DegisimIslemcisi['kontrol']> },
  ): Promise<{ sonuc: DegisimSonucu; bildirildi: boolean }> {
    return this.firmaSirasiyla(p.firmaId, () => this.degistirSirayla(p, islemci));
  }

  /**
   * 10 dakikalik tarama — iki is:
   *   1. Vadesi gelen PLANLI dusurmeler. ⚠ Webhook'a BAGLI DEGIL: yenileme
   *      cekimi basarisiz olsa da dusurme donem sonunda uygulanir (Emre:
   *      "dusurme donem sonunda"). Uygulayan TEK yer
   *      `AbonelikServisi.planliGecisiUygula`.
   *   2. KILIT EMNIYET SUPABI: degisim kilidi normalde yeni ucun ilk basarili
   *      tahsilatiyla (webhook) kalkar. Gecis tarihinden `KILIT_EMNIYET_GUN`
   *      sonra hala duruyorsa webhook kaybolmustur — musteri sonsuza dek
   *      kilitli kalmasin diye kilit acilir ve SESSIZ gecilmez (olay + gunluk).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async planliGecisleriTara(): Promise<void> {
    // ⚠ PARAMETRESIZ: zamanlayici (cron kutuphanesi) onTick'e kendi
    // argumanini gecirebilir; `simdi = new Date()` varsayilanli bir imza o
    // argumani TARIH sanar ve Prisma sorgusu patlardi. Saat burada alinir.
    await this.vadesiGelenGecisleriUygula(new Date());
  }

  async vadesiGelenGecisleriUygula(simdi: Date): Promise<{ gecis: number; kilit: number }> {
    const planlilar = await this.prisma.abonelik.findMany({
      where: { planliPaketSurumuId: { not: null }, paketGecisTarihi: { lte: simdi } },
      select: { id: true },
      orderBy: { paketGecisTarihi: 'asc' },
      take: 200,
    });
    let gecis = 0;
    for (const a of planlilar) {
      const oldu = await this.abonelik
        .planliGecisiUygula(a.id, { aktor: 'sistem', simdi })
        .catch((e) => {
          this.logger.error(
            `Planli gecis uygulanamadi (abonelik=${a.id}): ${e instanceof Error ? e.message : String(e)}`,
          );
          return false;
        });
      if (oldu) gecis++;
    }

    const esik = new Date(simdi.getTime() - KILIT_EMNIYET_GUN * GUN_MS);
    const takilanlar = await this.prisma.abonelik.findMany({
      where: { paketGecisTarihi: { lte: esik } },
      select: { id: true, paketGecisTarihi: true },
      orderBy: { paketGecisTarihi: 'asc' },
      take: 200,
    });
    let kilit = 0;
    for (const a of takilanlar) {
      const oldu = await this.abonelik
        .degisimKilidiniKaldir(a.id, { aktor: 'sistem' })
        .catch((e) => {
          this.logger.error(
            `Degisim kilidi acilamadi (abonelik=${a.id}): ${e instanceof Error ? e.message : String(e)}`,
          );
          return false;
        });
      if (!oldu) continue;
      kilit++;
      this.logger.warn(
        `Degisim kilidi EMNIYET suresiyle acildi: abonelik=${a.id} gecis=${a.paketGecisTarihi?.toISOString()} ` +
          `— yeni ucun tahsilat webhook'u ${KILIT_EMNIYET_GUN} gunde gelmedi`,
      );
      await this.abonelik
        .olayYaz(a.id, 'paket.degisim.kilit.zaman.asimi', {
          aciklama:
            `Yeni dönemin tahsilat bildirimi ${KILIT_EMNIYET_GUN} günde gelmedi; ` +
            'paket değişikliği kilidi emniyet süresiyle açıldı.',
          veri: { gecisTarihi: a.paketGecisTarihi?.toISOString() ?? null },
          aktor: 'sistem',
        })
        .catch(() => undefined);
    }

    if (gecis > 0 || kilit > 0) {
      this.logger.log(`Paket gecis taramasi: ${gecis} planli gecis, ${kilit} emniyet kilidi acildi`);
    }
    return { gecis, kilit };
  }
}
