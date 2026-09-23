import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu } from '@prisma/client';
import {
  kapaliHesapMetni,
  type KapaliHesapDurumu,
} from '../../../altyapi/auth/kapali-hesap';
import { abonelikErisimi } from '../../../altyapi/auth/abonelik-erisim';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Erişim kararı — tek doğru kaynak
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  "Bu firma şu an ne yapabilir?" sorusunun cevabı YALNIZCA burada verilir.
 *  iyzico'ya sorulmaz; iyzico'nun durumu bizim tablomuzu günceller, kararı
 *  bizim tablomuz verir. Sebebi basit: iyzico'ya giden her istek gecikme ve
 *  arıza noktasıdır, üstelik havale ile ödeyen firmaların iyzico'da kaydı
 *  bile yoktur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Ürün içindeki yetenekler. Kısıtlı modda hangilerinin kapanacağını belirler. */
export enum Yetenek {
  TEKLIF_GORUNTULE = 'teklif.goruntule',
  TEKLIF_OLUSTUR = 'teklif.olustur',
  TEKLIF_DUZENLE = 'teklif.duzenle',
  EXCEL_YUKLE = 'excel.yukle',
  DWG_YUKLE = 'dwg.yukle',
  CIKTI_INDIR = 'cikti.indir', // fiyatlı Excel / teklif formatı
  KUTUPHANE_GORUNTULE = 'kutuphane.goruntule',
  KUTUPHANE_DUZENLE = 'kutuphane.duzenle',
  KULLANICI_DAVET = 'kullanici.davet',
  ABONELIK_YONET = 'abonelik.yonet', // her zaman açık — ödeme sayfası
  // ⚠ KISITLI_MODDA_ACIK'e EKLENMEZ: bu uç her çağrıda Anthropic/OpenRouter'a
  // GERÇEK para harcar. Ödemesi duran bir firmaya masraf üretmeye devam etmek,
  // kapatılmak istenen gelir hatasının ta kendisidir.
  AI_ANALIZ = 'ai.analiz',
  // ⚠ Faz 6.8 (14.09): İngilizce çeviri. AI_ANALIZ ile aynı gerekçe —
  // KISITLI_MODDA_ACIK'e EKLENMEZ. Kota ayrıca `CeviriKotaServisi`nde sayılır;
  // bu yetenek yalnız "aboneliği yürüyor mu" sorusunu sorar.
  CEVIRI = 'ceviri',
}

/**
 * Salt-okunur modda AÇIK kalanlar.
 *
 * Tasarım kararı: veriyi göstermeye devam ediyoruz, değer üretmeyi
 * durduruyoruz. Müşterinin hazırladığı teklifleri rehin almak, ödeme
 * yaptırmaktan çok öfke üretir; ama yeni teklif çıkaramamak gerçek bir
 * baskıdır. Çıktı indirmeyi de kapatıyoruz — asıl değer orada.
 */
const KISITLI_MODDA_ACIK: ReadonlySet<Yetenek> = new Set([
  Yetenek.TEKLIF_GORUNTULE,
  Yetenek.KUTUPHANE_GORUNTULE,
  Yetenek.ABONELIK_YONET,
]);

/** Askıdayken yalnızca ödeme sayfası. */
const ASKIDA_ACIK: ReadonlySet<Yetenek> = new Set([Yetenek.ABONELIK_YONET]);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAPATILMIŞ HESAPTA AÇIK KALANLAR (22.09.2026 — Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre'nin cümlesi: **"kaydedilmiş tekliflerini görebilecek, indirebilecek,
 *  girebilecek ancak işlem yapamayacak."** Kütüphane için de aynısı:
 *  "görünsün ama orada da işlem yapamasın."
 *
 *  ⚠ NEDEN AYRI BİR KÜME — `KISITLI_MODDA_ACIK` YETMEZ. İkisi farklı iki
 *  durum ve farklı iki amaç güder:
 *   · KISITLI (ödemesi geciken firma) → amaç BASKI. `CIKTI_INDIR` bilerek
 *     KAPALI: "asıl değer orada" (yukarıdaki gerekçe). Müşteri hâlâ
 *     müşteridir, ödemeye ikna edilmeye çalışılır.
 *   · KAPALI (hesabını kendi kapatmış) → amaç BASKI DEĞİL. Kişi zaten
 *     ayrılmaya karar verdi; 30 günlük pencerede yapabileceği tek şey
 *     emeğini yanına almak. O çıktıyı vermemek baskı değil, veriyi rehin
 *     almaktır — üstelik KVKK indirmesi zaten aynı veriyi veriyor, yani
 *     kapatmak korumaz, sadece zorlaştırır.
 *
 *  ⚠ `CIKTI_INDIR` taşıyan UÇLARIN HEPSİ OKUMA — ölçüldü (22.09):
 *  `quotes` üçü (export, export-priced, exports/:rev) ve `quote-formats`
 *  üçü (sample, preview, preview-pdf). Hiçbiri teklifi DEĞİŞTİRMEZ.
 *
 *  ⚠ YAZMA YETENEKLERİ BURAYA ASLA EKLENMEZ: `TEKLIF_OLUSTUR`,
 *  `TEKLIF_DUZENLE`, `KUTUPHANE_DUZENLE`, `EXCEL_YUKLE`, `DWG_YUKLE`,
 *  `AI_ANALIZ`, `CEVIRI`. "İşlem yapamayacak" cümlesinin karşılığı budur.
 *  Ayrıca bu küme TEK BAŞINA kapı değildir: uç ayrıca `@KapaliHesapIzinli`
 *  taşımalı (`JwtAuthGuard`). İki kapı da geçilmeden çağrı olmaz.
 */
export const KAPALI_HESAPTA_ACIK: ReadonlySet<Yetenek> = new Set([
  Yetenek.TEKLIF_GORUNTULE,
  Yetenek.KUTUPHANE_GORUNTULE,
  Yetenek.CIKTI_INDIR,
  Yetenek.ABONELIK_YONET,
]);

export interface ErisimKarari {
  erisimVar: boolean;
  saltOkunur: boolean;
  /**
   * VİTRİN (23.09.2026 — Emre kararı): aboneliği HİÇ OLMAMIŞ firma, yani
   * yeni açılmış hesap. Emre'nin cümlesi: "ana sayfa her şey açılsın,
   * kullanıcının önüne gelsin; kullanıcı paket seçsin (kart bilgisini
   * girip), ödeme 30 günün sonunda çekilsin." Karar: "yalnızca gezsin".
   *
   * ⚠ BU BAYRAK SUNUCUDA HİÇBİR YETENEK AÇMAZ. `erisimVar` FALSE kalır ve
   *   `yetenekKararla` vitrini ASKIDA_ACIK kümesine düşürür (yalnız
   *   `ABONELIK_YONET`). Gezilen sayfalar zaten yeteneksiz uçlardan
   *   beslenir (teklif listesi, pano sayaçları, havuz markaları, ekip
   *   listesi); bayrak yalnız ön yüze "duvar çizme, uygulamayı gezdir" der.
   *
   * ⚠ Alan YOKSA (`undefined`) vitrin DEĞİLDİR — fail-closed: eski ya da
   *   dalı unutan bir karar duvarı geri getirir, erişim açmaz.
   *
   * ⚠ Süresi biten / askıya alınan / kapatılan hesap vitrin DEĞİLDİR
   *   (Emre: "süresi biten eski aboneler bu işin dışında"). Bayrak yalnız
   *   `karar()`ın ABONELİK SATIRI YOK dalında yazılır.
   */
  vitrin?: boolean;
  durum: AbonelikDurumu;
  /** Kullanıcıya gösterilecek uyarı — null ise uyarı yok. */
  uyari: {
    seviye: 'bilgi' | 'uyari' | 'kritik';
    baslik: string;
    metin: string;
    eylem?: { etiket: string; yol: string };
  } | null;
  /** Deneme ya da tolerans süresinin bitmesine kaç gün kaldı. */
  kalanGun: number | null;
  paketKodu: string;
  kullaniciHakki: number;
  dwgAktif: boolean;
  /**
   * 23.09 — BU DONEM icin yapilmis paket degisimi (gecis tarihi GELECEKTE).
   *   `planliPaket` dolu → dusurme/yatay: `tarih`te o pakete gecilecek.
   *   `planliPaket` null → yukseltme: ozellikler acildi, yeni ucret `tarih`ten.
   * Gecis gerceklesince (ya da degisim yoksa) `null`. ⚠ Istege bagli yalniz
   * eski test fikstorleri derlensin diye; `karar`/`kapaliKarar` HER dalda yazar.
   */
  paketGecisi?: { tarih: string; planliPaket: { kod: string; ad: string } | null } | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HAVUZ FİYATI KİME GÖRÜNÜR (23.09.2026 — Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre: paketsiz kullanıcı Malzeme Havuzu'nda "markalar ve ürünler
 *  görünsün, FİYATLAR PAKETLE AÇILSIN" — kataloğun genişliği görünür ama
 *  asıl değer olan fiyat bedava verilmez.
 *
 *  KURAL: fiyat, erişimi YÜRÜYEN firmaya görünür (`erisimVar`). Bu, satın
 *  alınan paketin kendisidir: DENEME, AKTİF, tolerans (ODEME_BEKLIYOR),
 *  salt-okunur (KISITLI — ödemesi geciken müşteri, kataloğu görmeye devam
 *  eder) ve ödenmiş dönemi süren İPTAL. Vitrin, askı ve süresi dolmuş satır
 *  GÖRMEZ. (Kapatılmış hesap bu uca hiç ULAŞAMAZ: uç `@KapaliHesapIzinli`
 *  taşımaz, `JwtAuthGuard` 403 `HESAP_KAPALI` döner.)
 *
 *  ⚠ YÖNETİCİ HER ZAMAN görür: havuzu o yükler ve denetler; kendi
 *    firmasının paketi olmasa da listeyi doğrulayabilmeli.
 *
 *  ⚠ YALNIZ HAVUZ listesine uygulanır. Firmanın KENDİ listesi (Kütüphanem,
 *    `ownerUserId` dolu) firmanın ticari verisidir ve hiçbir durumda
 *    gizlenmez — "verinizi rehin almıyoruz". Ayrım `brands.service.ts`
 *    `getPriceListMaterials`te.
 *
 *  ⚠ NEDEN GEREKLİ (ölçüldü, 23.09): `GET /brands/price-lists/:id/materials`
 *    `@GerekliYetenek` TAŞIMIYOR — `ErisimGuard` yeteneksiz ucu geçirir.
 *    Yani paketsiz hesap havuz fiyatlarını API'den BUGÜN de alabiliyordu;
 *    ekranı yalnız kabuktaki duvar gizliyordu. Vitrin duvarı kaldırınca
 *    kural sunucuda uygulanmak ZORUNDA.
 */
export function havuzFiyatiGorunurMu(
  karar: Pick<ErisimKarari, 'erisimVar'> | null | undefined,
  rol?: string | null,
): boolean {
  if (rol === 'admin') return true;
  return karar?.erisimVar === true;
}

@Injectable()
export class ErisimServisi {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bu firmanın kullanıcısı HAVUZ fiyatını görür mü? Kural saf
   * `havuzFiyatiGorunurMu`da; burası yalnız kararı getirir.
   */
  async havuzFiyatiGorunurMu(firmaId: string, rol?: string | null): Promise<boolean> {
    return havuzFiyatiGorunurMu(await this.karar(firmaId), rol);
  }

  private gunFarki(hedef: Date, simdi: Date): number {
    return Math.ceil((hedef.getTime() - simdi.getTime()) / 86_400_000);
  }

  /**
   * Firmanın güncel erişim durumunu döndürür.
   *
   * Not: `erisimSonu` geçmişse durum ne olursa olsun erişim kapanır.
   * Bu, bir zamanlanmış işin geç çalışması hâlinde bile ücretsiz
   * kullanımı engelleyen ikinci bir emniyet kemeridir.
   */
  async karar(firmaId: string, simdi = new Date()): Promise<ErisimKarari> {
    const ab = await this.prisma.abonelik.findUnique({
      where: { firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });

    if (!ab) {
      // ── VİTRİN (23.09.2026) ─────────────────────────────────────────────
      // Abonelik satırı HİÇ YOK = hiç paket seçmemiş (yeni) firma. Satır
      // yalnız satın alma ve havale yollarında açılır; süresi biten satır
      // SİLİNMEZ, `SONA_ERDI` olarak durur — yani bu dal eski aboneyi
      // KAPSAMAZ. Erişim yine KAPALI (`erisimVar: false`); `vitrin` yalnız
      // ön yüze "duvar çizme, gezdir" der. Uyarı KIRMIZI değil BİLGİ: yeni
      // kullanıcı bir şey kaybetmedi, henüz başlamadı. Deneme satırı
      // ("30 gün ücretsiz…") burada YAZILMAZ: deneme hakkı kişiye bağlıdır
      // (firma + e-posta + doğrulama), bu karar firma ekseninde verilir —
      // ön yüz satırı `/abonelik/paketler`in firma+kişi kararından kurar.
      return {
        erisimVar: false,
        saltOkunur: false,
        vitrin: true,
        durum: AbonelikDurumu.SONA_ERDI,
        uyari: {
          seviye: 'bilgi',
          baslik: 'Paketinizi seçin',
          metin: 'Uygulamayı gezebilirsiniz; teklif hazırlamak için bir paket seçin.',
          eylem: { etiket: 'Paket seç', yol: '/abonelik' },
        },
        kalanGun: null,
        paketKodu: '',
        kullaniciHakki: 0,
        dwgAktif: false,
        paketGecisi: null,
      };
    }

    const paket = ab.paketSurumu.paket;
    const temel = {
      durum: ab.durum,
      paketKodu: paket.kod,
      kullaniciHakki: paket.kullaniciHakki,
      dwgAktif: paket.dwgAktif,
      // Asagidaki HER dal `...temel` yayar — alan tek yerde hesaplanir.
      paketGecisi: await this.paketGecisiOzeti(ab, simdi),
    };

    const suresiDoldu = ab.erisimSonu.getTime() <= simdi.getTime();

    // ── ERISIM/SALT-OKUNUR KARARI SAF CEKIRDEKTEN (2.13) ─────────────────
    // ⚠ Bu iki alan artik BURADA HESAPLANMAZ. Ayni yuklemi `TierGuard` ve
    // `/auth/me` yetenekleri de okuyor; tek kaynak `abonelik-erisim.ts`.
    // Asagidaki dallar yalnizca MESAJ ve `kalanGun` uretir.
    const e = abonelikErisimi({ durum: ab.durum, erisimSonu: ab.erisimSonu }, simdi);

    switch (ab.durum) {
      case AbonelikDurumu.DENEME: {
        if (suresiDoldu) {
          return {
            ...temel,
            erisimVar: e.erisimVar,
            saltOkunur: e.saltOkunur,
            kalanGun: 0,
            uyari: {
              seviye: 'kritik',
              baslik: 'Deneme süreniz doldu',
              metin:
                'Tekliflerinize erişmeye devam etmek için bir paket seçin. ' +
                'Verileriniz duruyor, silinmedi.',
              eylem: { etiket: 'Paket seç', yol: '/abonelik' },
            },
          };
        }
        const kalan = this.gunFarki(ab.erisimSonu, simdi);
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: kalan,
          uyari:
            kalan <= 5
              ? {
                  seviye: kalan <= 2 ? 'uyari' : 'bilgi',
                  baslik: `Deneme sürenizin bitmesine ${kalan} gün kaldı`,
                  metin: 'Kesintisiz devam etmek için paketinizi seçebilirsiniz.',
                  eylem: { etiket: 'Paket seç', yol: '/abonelik' },
                }
              : null,
        };
      }

      case AbonelikDurumu.AKTIF:
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: null,
          uyari: suresiDoldu
            ? {
                seviye: 'uyari',
                baslik: 'Abonelik döneminiz doğrulanıyor',
                metin:
                  'Ödemeniz kontrol ediliyor. Sorun sürerse bizimle ' +
                  'iletişime geçin.',
              }
            : null,
        };

      case AbonelikDurumu.ODEME_BEKLIYOR: {
        // Tolerans süresi: erişim tam açık ama uyarı görünür.
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: ab.kisitlandi ? null : this.gunFarki(ab.erisimSonu, simdi),
          uyari: {
            seviye: 'uyari',
            baslik: 'Ödemeniz alınamadı',
            metin:
              'Kayıtlı kartınızdan tahsilat yapılamadı. Kartınızı ' +
              'güncellerseniz kesinti yaşamazsınız.',
            eylem: { etiket: 'Kartı güncelle', yol: '/abonelik/kart' },
          },
        };
      }

      case AbonelikDurumu.KISITLI:
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: null,
          uyari: {
            seviye: 'kritik',
            baslik: 'Hesabınız salt-okunur modda',
            metin:
              'Mevcut tekliflerinizi görebilirsiniz, ancak yeni teklif ' +
              'oluşturma ve çıktı indirme kapalı. Ödemenizi tamamladığınızda ' +
              'anında açılır.',
            eylem: { etiket: 'Ödemeyi tamamla', yol: '/abonelik/kart' },
          },
        };

      case AbonelikDurumu.ASKIDA:
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: null,
          uyari: {
            seviye: 'kritik',
            baslik: 'Aboneliğiniz askıya alındı',
            metin:
              'Verileriniz duruyor. Ödemenizi tamamladığınızda hesabınız ' +
              'olduğu gibi geri açılır.',
            eylem: { etiket: 'Ödemeyi tamamla', yol: '/abonelik/kart' },
          },
        };

      case AbonelikDurumu.IPTAL: {
        // İptal edildi ama ödenmiş dönem sürüyor — sonuna kadar tam erişim.
        const kalan = this.gunFarki(ab.erisimSonu, simdi);
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: Math.max(0, kalan),
          uyari: {
            seviye: 'bilgi',
            baslik: `Aboneliğiniz ${kalan > 0 ? `${kalan} gün sonra` : 'bugün'} sona eriyor`,
            metin: 'İsterseniz bu tarihe kadar aboneliğinizi geri alabilirsiniz.',
            eylem: { etiket: 'Aboneliği sürdür', yol: '/abonelik' },
          },
        };
      }

      case AbonelikDurumu.SONA_ERDI:
      default:
        return {
          ...temel,
          erisimVar: e.erisimVar,
          saltOkunur: e.saltOkunur,
          kalanGun: null,
          uyari: {
            seviye: 'kritik',
            baslik: 'Aboneliğiniz sona erdi',
            metin: 'Verileriniz saklanıyor. Yeni bir paket seçerek devam edebilirsiniz.',
            eylem: { etiket: 'Paket seç', yol: '/abonelik' },
          },
        };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  PLAN 5.8 §4.5 — KAPATILMIS HESAP: MEVCUT "ASKIDA" KIPI
   * ═══════════════════════════════════════════════════════════════════════
   *
   *  Emre'nin talimati acikti: "mevcut **askıda** kipini kullanın. Yeni bir
   *  kip icat etmeyin." Burada YENI BIR KIP YOK — donen karar
   *  `AbonelikDurumu.ASKIDA` dalinin (yukarida, 212-226) sekliyle BIREBIR
   *  ayni: `erisimVar: false`, `saltOkunur: false`. `yetenekKararla` o iki
   *  degeri okuyup `ASKIDA_ACIK` kumesine duser ve yalnizca
   *  `ABONELIK_YONET` gecer ("Askidayken yalnizca odeme sayfasi").
   *  Degisen TEK sey UYARI METNIDIR: musteri "odemeniz alinamadi" degil
   *  "hesabiniz kapatildi, verileriniz su tarihte silinecek" gormeli.
   *
   *  ⚠ NEDEN FIRMA EKSENI (`karar`) KULLANILAMAZ — OLCULDU: hesap
   *  kapatildiginda abonelik IPTAL edilir (`hesap.servisi.ts`,
   *  `ayrilmaKarari.abonelikIptal`) ve `IPTAL` dali odenmis donem bitene
   *  kadar `erisimVar: !suresiDoldu` = **true** doner. Yani firmaya sormak,
   *  kapali hesaba 30 gun boyunca TAM ERISIM verirdi.
   *
   *  ⚠ ABONELIK SATIRI HIC OKUNMAZ (sorgu YOK): karar hesabin kapali
   *  olmasindan gelir, aboneligin durumu bu karari degistiremez.
   *  `paketKodu`/`kullaniciHakki`/`dwgAktif` bu yuzden bos/sifirdir — ekran
   *  zaten paket rozeti degil, geri donus ekrani cizer.
   */
  kapaliKarar(durum: KapaliHesapDurumu, simdi = new Date()): ErisimKarari {
    return {
      erisimVar: false,
      saltOkunur: false,
      durum: AbonelikDurumu.ASKIDA,
      // Imha tarihi bilinmiyorsa `null` — ekran tarihsiz cumleyi yazar.
      // ⚠ `Math.max(0, …)`: tarih gecmisse "-3 gun kaldi" yazdirmayiz.
      kalanGun: durum.imhaTarihi
        ? Math.max(0, this.gunFarki(durum.imhaTarihi, simdi))
        : null,
      uyari: {
        seviye: 'kritik',
        baslik: kapaliHesapMetni(durum),
        metin:
          durum.tip === 'firma'
            ? 'Verilerinizi bu süre içinde indirebilirsiniz.'
            : 'Hesabınızı geri açmak için bir paket seçin; verileriniz ' +
              'olduğu gibi geri gelir.',
        // ⚠ Firmasi kapanan UYE paket secemez (K2: firmayi SAHIBI geri
        // acar). Ona "Paket sec" dugmesi gostermek calismayan bir soz olurdu.
        eylem:
          durum.tip === 'firma'
            ? undefined
            : { etiket: 'Paket seç', yol: '/abonelik' },
      },
      paketKodu: '',
      kullaniciHakki: 0,
      dwgAktif: false,
      paketGecisi: null,
    };
  }

  /**
   * 23.09 — bekleyen paket degisiminin ekran ozeti.
   *
   * ⚠ EK SORGU YALNIZ DUSURME BEKLERKEN: `karar` her kapili istekte kosar
   * (ErisimGuard). Planli paket nadirdir; onu her istekte `include` etmek
   * tum firmalara iki sorgu eklerdi. Tarih gecmisse / yoksa sorgu YOK.
   */
  private async paketGecisiOzeti(
    ab: { paketGecisTarihi: Date | null; planliPaketSurumuId: string | null },
    simdi: Date,
  ): Promise<ErisimKarari['paketGecisi']> {
    if (!ab.paketGecisTarihi || ab.paketGecisTarihi.getTime() <= simdi.getTime()) return null;
    const tarih = ab.paketGecisTarihi.toISOString();
    if (!ab.planliPaketSurumuId) return { tarih, planliPaket: null };
    const s = await this.prisma.paketSurumu.findUnique({
      where: { id: ab.planliPaketSurumuId },
      select: { paket: { select: { kod: true, ad: true } } },
    });
    return { tarih, planliPaket: s ? { kod: s.paket.kod, ad: s.paket.ad } : null };
  }

  /** Tek bir yeteneğin şu an açık olup olmadığını söyler. */
  async yetenekAcikMi(firmaId: string, yetenek: Yetenek): Promise<boolean> {
    const k = await this.karar(firmaId);
    return this.yetenekKararla(k, yetenek);
  }

  /** Karar nesnesi elinizdeyse tekrar sorgu atmadan değerlendirin. */
  yetenekKararla(k: ErisimKarari, yetenek: Yetenek): boolean {
    if (yetenek === Yetenek.ABONELIK_YONET) return true; // her zaman açık
    if (!k.erisimVar) return ASKIDA_ACIK.has(yetenek);
    if (k.saltOkunur) return KISITLI_MODDA_ACIK.has(yetenek);
    if (yetenek === Yetenek.DWG_YUKLE && !k.dwgAktif) return false;
    return true;
  }
}
