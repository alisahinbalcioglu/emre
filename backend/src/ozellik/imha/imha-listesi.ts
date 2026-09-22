/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VERI IMHASI — SILME LISTESI (plan 5.8 · §5.1). ELLE YAZILIR, DONGUYLE DEGIL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  BU DOSYA NEDEN VAR: on olcum iki tuzak buldu, ikisi de "sessiz eksik imha"
 *  uretir — yani hicbir hata vermeden "imha edildi" der ve veri KALIR.
 *
 *  TUZAK 1 — ADI YANILTAN KOLON. `LaborPriceList.firmaId` ve
 *    `LaborPrice.firmaId` `Firma`ya DEGIL `LaborFirm`e isaret eder
 *    (schema: `firma LaborFirm @relation(fields: [firmaId] ...)`).
 *    "firmaId kolonu olan her tabloyu `deleteMany({ where: { firmaId } })`
 *    ile gez" diye yazilan bir dongu bu iki tabloda uuid'ler cakismayacagi
 *    icin SIFIR satir siler ve kimse fark etmez. Bu yuzden her kuralin
 *    `kolon`u ve `eksen`i ACIKCA yazilidir.
 *
 *  TUZAK 2 — CASCADE HIC TETIKLENMEZ. On olcum "User'a bagli 11 FK'nin 11'i
 *    de CASCADE" dedi; DOGRU ama bu imhada ISE YARAMAZ, cunku bu imha
 *    `user.delete()` ve `firma.delete()` CAGIRMAZ:
 *      · §5.3 hesap SATIRININ kalmasini sart kosuyor (tekliflerdeki
 *        "Hazirlayan" bagi kirilmasin),
 *      · §5.2 firma satirinin ve kimliginin kalmasini sart kosuyor
 *        (Abonelik/FirmaDavet/FirmaKimlikSaglayici RESTRICT zaten
 *        `firma.delete()`i P2003 ile reddediyor),
 *      · depo kurali da ayni: `uyelik.servisi.ts` "`user.delete` DEGIL".
 *    Sonuc: CASCADE'e guvenen bir imha HICBIR SEY silmez. 11 cocugun ve
 *    onlarin cocuklarinin HEPSI bu listede ACIKCA yazilidir.
 *
 *  TUZAK 3 — NULL = HAVUZ/SEED. `PriceList`/`ProductIndex`te
 *    `ownerUserId`+`ownerFirmaId` ikisi de null ise satir PLATFORM HAVUZUNA
 *    aittir; `TerminologyAlias`/`BrandMaterialType`te `userId` null ise satir
 *    SEED'dir. Suzgecler NULL'u ASLA eslemez — `{ in: [...] }` ve
 *    `{ equals: <deger> }` null satiri getirmez, `firmaId: null` gibi bir
 *    kural bu dosyada YOKTUR.
 *
 *  KAPSAYICILIK KAPISI (§5.1): semadaki HER model ya `SILINECEKLER`de ya
 *  `SILINMEZLER`de olmak ZORUNDA. Yarin semaya eklenen bir tablo ikisine de
 *  yazilmazsa `test:imha` KIRMIZIYA doner (`kapsamDisiModeller`). Aksi halde
 *  yeni tablo sessizce imhanin disinda kalir.
 *
 *  ⚠ BU DOSYADA PRISMA/NEST IMPORT'U YOKTUR: saf veri + saf fonksiyon.
 *    Testin DB'siz kosabilmesi ve listenin gozle okunabilir kalmasi icin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Silmenin HANGI kimlige gore kapsandigi. Her kuralin bir ekseni vardir;
 * eksensiz kural YOKTUR (test bunu denetler) — eksensiz bir `deleteMany`
 * BASKA firmanin satirini silerdi.
 */
export type Eksen =
  /** `kolon` = imha edilen `Firma.id`. */
  | 'firma'
  /** `kolon` ∈ firmadaki kullanicilarin `User.id` kumesi. */
  | 'kullanici'
  /** `kolon` ∈ firmanin `LaborFirm.id` kumesi. ⚠ TUZAK 1 — `Firma.id` DEGIL. */
  | 'iscilikFirmasi'
  /** `kolon` ∈ firmanin `UserLibrary.id` kumesi (FK yok, oksuz kalirdi). */
  | 'kutuphaneSatiri'
  /** `kolon` ∈ firmanin `Quote.id` kumesi. */
  | 'teklif'
  /** `kolon` ∈ firmanin `FirmaKimlikSaglayici.id` kumesi. */
  | 'kimlikSaglayici'
  /** `kolon` ∈ firmanin `LaborPriceList.id` kumesi. */
  | 'iscilikFiyatListesi';

export interface SilmeKurali {
  /** Prisma model adi (sema ile BIREBIR — kapsayicilik kapisi buna bakar). */
  readonly model: string;
  /** Prisma istemcisindeki erisimci (ilk harf kucuk). */
  readonly erisimci: string;
  /** Hangi kolonla kapsanacagi. */
  readonly kolon: string;
  readonly eksen: Eksen;
  /**
   * Yalnizca `eksen: 'kullanici'` olan, kullanicinin KENDI satirlarini tutan
   * tablolarda: `firmaId` bos kalmis MIRAS satirlari da al. (ADIM 1 gecisi
   * once `firmaId`siz yaziyordu; yalniz `firmaId` ile suzmek o satirlari
   * SESSIZCE birakirdi.) Kullanici imha edilen firmanin uyesi oldugu icin
   * baska firmanin satirina dokunmaz.
   */
  readonly mirasFirmasizDaAl?: true;
  /**
   * `mirasFirmasizDaAl` ikinci kolunda kullanilacak KULLANICI kolonu.
   * Varsayilan `userId`; `PriceList`/`ProductIndex`te ad `ownerUserId`dir.
   * ⚠ Yanlis ad yazilirsa Prisma bilinmeyen alan diye FIRLATIR (sessiz
   *   gecmez) — ama dogru ad yazilmazsa MIRAS satirlar SESSIZCE kalirdi.
   */
  readonly mirasKullaniciKolonu?: string;
  /** Neden silindigi — gozle okunan gerekce. */
  readonly neden: string;
}

export interface KorumaKurali {
  readonly model: string;
  /** Neden SILINMEDIGI. Bos gerekce kabul edilmez (test denetler). */
  readonly neden: string;
  /**
   * Kisisel veri tasiyor mu? Tasiyorsa aydinlatma metninde ADIYLA istisna
   * olarak yazilmak zorunda — "tum kisisel verileriniz silindi" denemez.
   */
  readonly kisiselVeriTasir?: true;
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  SILINECEKLER — SIRA ONEMLI: YAPRAKTAN KOKE.
 * ───────────────────────────────────────────────────────────────────────────
 *  Sira neden onemli: bazi FK'ler `SetNull` (or. `Quote.formatId`,
 *  `LaborPrice.priceListId`, `UserLibrary.libraryListId`). Ust satiri once
 *  silersek DB alt satirin kolonunu null'lar — sonuc yine silinir ama
 *  SAYILAR yaniltici olur. Yapraktan koke gidince her `deleteMany` gercek
 *  sayisini dondurur ve denetim kaydi (§5.6) dogru olur.
 */
export const SILINECEKLER: readonly SilmeKurali[] = [
  // ── Teklif agaci (yaprak → kok) ───────────────────────────────────────────
  {
    model: 'QuoteExport',
    erisimci: 'quoteExport',
    kolon: 'quoteId',
    eksen: 'teklif',
    neden:
      'Uretilen Excel ciktisi (`xlsxBytes` ikili) + `overridesSnapshot`. ' +
      'Quote CASCADE cocugu ama `quote.delete` cagirilmadigi icin ELLE.',
  },
  {
    model: 'QuoteItem',
    erisimci: 'quoteItem',
    kolon: 'quoteId',
    eksen: 'teklif',
    neden: 'Teklif kalemleri (malzeme adi, miktar, fiyat). Quote CASCADE cocugu.',
  },
  {
    model: 'Quote',
    erisimci: 'quote',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden:
      'Teklifin kendisi: `sheets` (butun grid) + `originalFile` (yuklenen ' +
      'Excel, ikili) + musteri/proje adi. §5.2 birinci kalem.',
  },
  {
    model: 'QuoteFormat',
    erisimci: 'quoteFormat',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden:
      'Teklif formati: `fileBytes` (musterinin antetli sablonu, ikili) + ' +
      '`mapping`. §5.2 "teklif formatlari".',
  },

  // ── Kutuphane ─────────────────────────────────────────────────────────────
  {
    model: 'KutuphaneOzelFiyatYedegi',
    erisimci: 'kutuphaneOzelFiyatYedegi',
    kolon: 'userLibraryId',
    eksen: 'kutuphaneSatiri',
    neden:
      'Ozel fiyat izi. `userLibraryId` @id ama FK YOK ("kutuphane satiri ' +
      'silinse de iz kalir") — kutuphane silinince OKSUZ kalir, ELLE gider.',
  },
  {
    model: 'UserLibrary',
    erisimci: 'userLibrary',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden: 'Kutuphane satirlari: fiyat, iskonto, `specs`. §5.2 "kutuphane".',
  },
  {
    model: 'LibraryList',
    erisimci: 'libraryList',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden: 'Kutuphane listeleri (sekmeler).',
  },
  {
    model: 'UserBrandLibrary',
    erisimci: 'userBrandLibrary',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden: 'Marka kutuphanesi uyeligi + `sheets` (ham yuklenen tablo).',
  },
  {
    model: 'PriceList',
    erisimci: 'priceList',
    kolon: 'ownerFirmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    mirasKullaniciKolonu: 'ownerUserId',
    neden:
      'Firmanin KENDI fiyat listeleri. ⚠ `ownerFirmaId`+`ownerUserId` ikisi ' +
      'de null = PLATFORM HAVUZU; miras kolu `ownerUserId`nin firmanin ' +
      'kullanicilarindan BIRI olmasini sart kostugu icin havuz KORUNUR.',
  },
  {
    model: 'ProductIndex',
    erisimci: 'productIndex',
    kolon: 'ownerFirmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    mirasKullaniciKolonu: 'ownerUserId',
    neden:
      'Firmanin KENDI urun indeksi (`extra` ham satir). ⚠ ikisi de null = ' +
      'HAVUZ; miras kolu `ownerUserId` sart kostugu icin havuz korunur.',
  },

  // ── Iscilik (TUZAK 1: eksen `LaborFirm.id`) ──────────────────────────────
  {
    model: 'LaborPrice',
    erisimci: 'laborPrice',
    kolon: 'firmaId',
    eksen: 'iscilikFirmasi',
    neden:
      '⚠ TUZAK 1: `LaborPrice.firmaId` → `LaborFirm.id`. `Firma.id` ile ' +
      'suzulurse SIFIR satir siler. Firmanin iscilik birim fiyatlari.',
  },
  {
    model: 'LaborPriceList',
    erisimci: 'laborPriceList',
    kolon: 'firmaId',
    eksen: 'iscilikFirmasi',
    neden:
      '⚠ TUZAK 1: `LaborPriceList.firmaId` → `LaborFirm.id`. ' +
      '`sheets` = yuklenen iscilik fiyat listesinin ham tablosu.',
  },
  {
    model: 'LaborFirm',
    erisimci: 'laborFirm',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden: 'Firmanin tanimladigi iscilik firmalari. §5.2 "iscilik firmalari".',
  },

  // ── Eslestirme hafizasi / sozluk (kullanici ekseni) ──────────────────────
  {
    model: 'EslesmeHafizasi',
    erisimci: 'eslesmeHafizasi',
    kolon: 'userId',
    eksen: 'kullanici',
    neden:
      'Kisinin secim gecmisi (hangi imzaya hangi urunu sectigi). FK YOK. ' +
      '`firmaId` mirasta bos olabilir, bu yuzden eksen KULLANICI.',
  },
  {
    model: 'TerminologyAlias',
    erisimci: 'terminologyAlias',
    kolon: 'userId',
    eksen: 'kullanici',
    neden:
      'Kullanicinin ekledigi terim esleme. ⚠ `userId` null = SEED; ' +
      '`{ in: [...] }` null eslemez, seed satirlari KORUNUR.',
  },
  {
    model: 'BrandMaterialType',
    erisimci: 'brandMaterialType',
    kolon: 'userId',
    eksen: 'kullanici',
    neden:
      'Kullanicinin ekledigi marka-malzeme tipi kurali. ⚠ `userId` null = ' +
      'SEED, korunur.',
  },

  // ── Ceviri (firma katmani) ────────────────────────────────────────────────
  {
    model: 'CeviriDuzeltmesi',
    erisimci: 'ceviriDuzeltmesi',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'FIRMA katmani ceviri duzeltmeleri (§5.2). ORTAK katman `Translation` ' +
      'tablosudur ve firma alani YOKTUR — dokunulmaz.',
  },
  {
    model: 'CeviriDuzeltmeOlayi',
    erisimci: 'ceviriDuzeltmeOlayi',
    kolon: 'firmaId',
    eksen: 'firma',
    neden: 'Duzeltme denetim izi: `kullaniciEposta` anlik kopyasi tasir.',
  },
  {
    model: 'CeviriTuketimi',
    erisimci: 'ceviriTuketimi',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'Ceviri kota tuketimi: `icerikOzeti` musterinin teklif satirlarindan ' +
      'turetilir. Kota fatura kaydi DEGIL — abonelik satiri ayri durur.',
  },

  // ── AI / DWG ──────────────────────────────────────────────────────────────
  {
    model: 'AiUsageLog',
    erisimci: 'aiUsageLog',
    kolon: 'firmaId',
    eksen: 'firma',
    mirasFirmasizDaAl: true,
    neden:
      'AI kullanim kaydi (maliyet + hata mesaji). FK yoklugu semada BILEREK ' +
      'yazili; ELLE silinir.',
  },
  {
    model: 'DwgDosya',
    erisimci: 'dwgDosya',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'Yuklenen DWG/DXF sahiplik kaydi. ⚠ BILINEN SINIR: motordaki ' +
      '`dwg_cache` diskteki dosyayi TTL (24 sa) disinda silecek bir UC YOK; ' +
      'satir gider, dosya TTL ile gider (t.22 ayri tur).',
  },

  // ── Kurumsal giris / davet (firma ekseni) ────────────────────────────────
  {
    model: 'DogrulanmisAlanAdi',
    erisimci: 'dogrulanmisAlanAdi',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'Kanitlanmis alan adi. `saglayiciId` CASCADE zinciri var ama ' +
      '`firmaId` FK\'siz; saglayici silinmeden ONCE elle silinir ki SAYI dogru olsun.',
  },
  {
    model: 'FirmaKimlikSaglayici',
    erisimci: 'firmaKimlikSaglayici',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'Kurumsal giris ayari: sifreli istemci sirri + alan adi. Firma bittiyse ' +
      'ayar da biter. (`Firma`ya RESTRICT — ama Firma SATIRI silinmiyor.)',
  },
  {
    model: 'SsoAkisi',
    erisimci: 'ssoAkisi',
    kolon: 'saglayiciId',
    eksen: 'kimlikSaglayici',
    neden:
      '`dogrulanmisKimlik` Json = kisisel veri. FK YOK (`saglayiciId` ve ' +
      '`baslatanUserId` ikisi de) — saglayici silinince OKSUZ kalirdi.',
  },
  {
    model: 'SsoAkisi',
    erisimci: 'ssoAkisi',
    kolon: 'baslatanUserId',
    eksen: 'kullanici',
    neden:
      'IKINCI KOL: firmanin kullanicisi BASKA bir saglayiciyla akis ' +
      'baslatmis olabilir; yalniz `saglayiciId` ile suzmek o satirlari ' +
      '(`dogrulanmisKimlik` Json = kisisel veri) SESSIZCE birakirdi.',
  },
  {
    model: 'KullaniciDisKimlik',
    erisimci: 'kullaniciDisKimlik',
    kolon: 'userId',
    eksen: 'kullanici',
    neden:
      '`epostaAnlik` = kurumsal e-posta kopyasi. User CASCADE cocugu ama ' +
      '`user.delete` cagirilmiyor → ELLE. Kalirsa anonimlesmis hesap ' +
      'kurumsal girisle GERI ACILIRDI.',
  },
  {
    model: 'FirmaDavet',
    erisimci: 'firmaDavet',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'Davetler `eposta` + `davetEdenEposta` tasir (kisisel veri) ve firma ' +
      'bittikten sonra kabul edilebilir bir davet kalmamali.',
  },
  {
    model: 'FirmaOlayi',
    erisimci: 'firmaOlayi',
    kolon: 'firmaId',
    eksen: 'firma',
    neden:
      'Firmanin KENDI ekip olay gunlugu: `aktorEposta`/`hedefEposta` tasir. ' +
      '§5.5 "yonetici kayitlari" DEGIL (o `YoneticiOlayi`); firma bitince ' +
      'saklanmasinda mesru menfaat kalmaz.',
  },

  // ── Kisi ekseni: oturum/dogrulama artiklari ──────────────────────────────
  {
    model: 'PasswordResetToken',
    erisimci: 'passwordResetToken',
    kolon: 'userId',
    eksen: 'kullanici',
    neden: 'Parola sifirlama tokenlari. User CASCADE cocugu → ELLE.',
  },
  {
    model: 'EmailVerificationToken',
    erisimci: 'emailVerificationToken',
    kolon: 'userId',
    eksen: 'kullanici',
    neden: 'E-posta dogrulama tokenlari. User CASCADE cocugu → ELLE.',
  },
  {
    model: 'MfaKurtarmaKodu',
    erisimci: 'mfaKurtarmaKodu',
    kolon: 'userId',
    eksen: 'kullanici',
    neden: 'Iki adimli giris kurtarma kodu ozetleri. User CASCADE cocugu → ELLE.',
  },
  {
    model: 'UserSubscription',
    erisimci: 'userSubscription',
    kolon: 'userId',
    eksen: 'kullanici',
    neden:
      'MIRAS kisi bazli paket atamasi (`Abonelik` DEGIL — fatura zinciri ' +
      'orada). User CASCADE cocugu → ELLE.',
  },
];

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  SILINMEZLER — §5.5 + platform/havuz verisi + bilinen sinirlar.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const SILINMEZLER: readonly KorumaKurali[] = [
  // ── §5.5 — yasal saklama ────────────────────────────────────────────────
  {
    model: 'Fatura',
    neden:
      '§5.5 yasal saklama (VUK). K4 ile fatura musteri bilgisinin KENDI ' +
      'kopyasini tasir; firma satiri bosalsa da fatura tam okunur.',
    kisiselVeriTasir: true,
  },
  {
    model: 'HavaleOdemesi',
    neden: '§5.5 odeme kaydi — yasal saklama.',
  },
  {
    model: 'Abonelik',
    neden:
      '§5.5 abonelik kaydi. Ayrica `Firma`ya RESTRICT: fatura zinciri bu ' +
      'satiri kilitler, silinemez de.',
  },
  {
    model: 'AbonelikOlayi',
    neden: '§5.5 abonelik durum gecmisi (denetim) — yasal/ispat izi.',
  },
  {
    model: 'AbonelikBaslatma',
    neden:
      '§5.5 abonelik kaydi. `sozlesmeOnayiZamani` + `sozlesmeSurumu` = ' +
      'MESAFELI SATIS SOZLESMESI onay izi (hangi metin, ne zaman); ayrica ' +
      '`DenemeKullanimi.abonelikBaslatmaId` buna isaret eder — silinirse ' +
      'deneme izinin ikinci ayagi korlesir.',
    kisiselVeriTasir: true,
  },
  {
    model: 'DenemeKullanimi',
    neden:
      '⛔ §5.5 DENEME HAKKI IZI. Semanin kendi cumlesi: "hesap kapatma ya da ' +
      'ileride veri imhasi bu satiri SILMEMELI". Silinirse kapatip ayni ' +
      'adresle kaydolan YENI deneme alir. ⚠ "SONSUZA DEK" DEMEK DEGIL: bu ' +
      'liste FIRMA/UYE eksenidir. Ayri bir YAS ekseni 2 yildan eski ' +
      'satirlari siler (`saklama-sureleri.ts` · `ImhaServisi.' +
      'eskiDenemeKayitlariniSil`); Gizlilik Politikasi"ndaki sure odur.',
    kisiselVeriTasir: true,
  },
  {
    model: 'YoneticiOlayi',
    neden:
      '§5.5 yonetici islem kayitlari. Imhanin KENDI denetim kaydi da (§5.6) ' +
      'buraya yazilir — kendi kanitini silen bir imha denetlenemez.',
    kisiselVeriTasir: true,
  },
  {
    model: 'WebhookOlayi',
    neden:
      'BILINEN SINIR: firma/kullanici kolonu YOK, yalniz `abonelikKodu`/' +
      '`musteriKodu`. Firma ekseninde ADIYLA bulunamaz. Ayrica odeme ' +
      'saglayicisinin ham govdesi = odeme ispati (§5.5).',
    kisiselVeriTasir: true,
  },

  // ── Platform / havuz verisi — musteriye ait DEGIL ───────────────────────
  {
    model: 'Brand',
    neden: 'GLOBAL marka havuzu; sahiplik `UserBrandLibrary` ile ifade edilir.',
  },
  {
    model: 'Material',
    neden: 'GLOBAL malzeme havuzu (`name @unique`), musteriye ait degil.',
  },
  {
    model: 'MaterialPrice',
    neden:
      'Havuz fiyati. Firmaya ait `PriceList` silinince `priceListId` CASCADE ' +
      'ile zaten gider; havuz listelerininki KALIR.',
  },
  {
    model: 'LaborItem',
    neden:
      'GLOBAL iscilik kalemi katalogu (`isGlobal`), firma/kullanici kolonu YOK.',
  },
  {
    model: 'Paket',
    neden: 'Satis paketi tanimi — platform verisi.',
  },
  {
    model: 'PaketSurumu',
    neden: 'Paket surumu (fiyat/kota) — platform verisi, faturalar buna baglidir.',
  },
  {
    model: 'SystemSettings',
    neden: 'Sistem ayarlari — firma/kullanici kolonu YOK.',
  },
  {
    model: 'Translation',
    neden:
      'BILINEN SINIR: ORTAK ceviri onbellegi; firma/kullanici alani YOK. ' +
      'Icine giren metinler musterinin malzeme adlari olabilir — "her sey ' +
      'silindi" denemez, aydinlatma metninde sinir olarak yazilir.',
  },

  // ── Satiri KALAN ama ALANLARI bosalan iki tablo ─────────────────────────
  {
    model: 'Firma',
    neden:
      'SATIR ve KIMLIK KALIR (§5.2): Abonelik/FirmaDavet/FirmaKimlikSaglayici ' +
      'RESTRICT `firma.delete()`i zaten reddeder ve fatura zinciri kopardi. ' +
      'Bunun yerine KIMLIK ALANLARI bosaltilir (bkz. FIRMA_BOSALTILACAK_ALANLAR).',
    kisiselVeriTasir: true,
  },
  {
    model: 'User',
    neden:
      'SATIR KALIR (§5.3): tekliflerdeki "Hazirlayan" bagi kirilmasin ve ' +
      'denetim/fatura kayitlarindaki `hedefKullaniciId` oksuz kalmasin. ' +
      'Bunun yerine KISISEL ALANLAR anonimlesir (KULLANICI_ANONIM_ALANLARI).',
    kisiselVeriTasir: true,
  },
];

/**
 * §5.2 — `Firma` satirinda BOSALTILACAK kimlik/iletisim alanlari.
 * Satir ve `id` kalir; bu alanlar null olur. K4 sayesinde faturalar
 * kendi kopyalarini tasidigi icin bozulmaz.
 */
export const FIRMA_BOSALTILACAK_ALANLAR = [
  'unvan',
  'yetkiliEposta',
  'faturaEposta',
  'vergiNo',
  'vergiDairesi',
  'tcKimlikNo',
  'faturaAdresi',
  'il',
  'ilce',
  'telefon',
  'logoBytes',
  'logoMime',
] as const;

/**
 * ⚠ `Firma.ad` ZORUNLU (`String`, opsiyonel degil) — null'lanamaz.
 * `FIRMA_BOSALTILACAK_ALANLAR`a konulsaydi Prisma calisma aninda reddeder,
 * imha transaction'i her gece geri alinir ve hicbir firma imha EDILMEZDI.
 * Bu yuzden ad NULL degil, tanimlayici olmayan sabit bir degere cekilir.
 */
export const FIRMA_IMHA_ADI = 'Imha edilmis firma';

/**
 * §5.3 — `User` satirinda anonimlesecek kisisel alanlar (e-posta HARIC;
 * e-posta benzersiz oldugu icin null degil CAKISMAYAN BIR DEGER alir).
 *
 * ⚠ `kapatilanEposta` ATLANMAZ: hesap kapatma orijinal adresi oraya TASIYOR.
 *   Yalniz `email`i anonimlestiren bir imha, adresi ikinci kolonda birakirdi.
 * ⚠ TOTP sirri ve kurtarma kodu da gider: anonimlesmis hesapta ikinci faktor
 *   sirri tutmanin mesru menfaati yoktur.
 */
export const KULLANICI_ANONIM_ALANLARI = [
  'ad',
  'soyad',
  'telefon',
  'kapatilanEposta',
  // ⚠ OLCULDU: sema'da `mfaSecret` DIYE BIR KOLON YOK. Gercek adlar bunlar;
  //   yanlis ad yazilsaydi Prisma calisma aninda patlar, imha YARIDA kalirdi.
  'mfaSirriSifreli',
  'mfaBekleyenSirSifreli',
] as const;

/** Anonimlestirilen hesabin e-posta bicimi. RFC 2606 `.invalid` TLD'si. */
export function imhaEpostasi(userId: string): string {
  return `imha-${userId}@metapricex.invalid`;
}

/**
 * KAPSAYICILIK KAPISI (§5.1 · kabul 4).
 * Semadaki model adlarini alir; listelenmemis olanlari dondurur.
 * Bos dizi = her tablo bir karara baglanmis demektir.
 */
export function kapsamDisiModeller(semaModelleri: readonly string[]): string[] {
  const karara = new Set<string>([
    ...SILINECEKLER.map((k) => k.model),
    ...SILINMEZLER.map((k) => k.model),
  ]);
  return semaModelleri.filter((m) => !karara.has(m)).sort();
}

/** Ters yon: listede olup semada OLMAYAN model (bayat kayit / yazim hatasi). */
export function semadaOlmayanKayitlar(semaModelleri: readonly string[]): string[] {
  const sema = new Set(semaModelleri);
  return [
    ...SILINECEKLER.map((k) => k.model),
    ...SILINMEZLER.map((k) => k.model),
  ]
    .filter((m) => !sema.has(m))
    .sort();
}

/** Ayni model hem silme hem koruma listesinde olamaz. */
export function cakisanModeller(): string[] {
  const silinen = new Set(SILINECEKLER.map((k) => k.model));
  return SILINMEZLER.map((k) => k.model)
    .filter((m) => silinen.has(m))
    .sort();
}
