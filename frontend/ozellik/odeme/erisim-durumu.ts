/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERISIM DURUMU — on yuz tarafi (saf mantik, React YOK)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Sunucudaki `ErisimServisi` kararinin on yuzdeki karsiligi. Karar SUNUCUDA
 *  verilir; burasi yalnizca o karari EKRANA cevirir.
 *
 *  ⚠ BU DOSYA KAPI DEGILDIR. On yuzde butonu gizlemek KAPATMAK DEGILDIR:
 *  uclar dogrudan cagrilabilir. Gercek kapi `ErisimGuard`tadir (backend).
 *  Buradaki mantik yalnizca KULLANICIYA NEDEN oldugunu anlatmak ve bosuna
 *  tiklatmamak icindir.
 *
 *  React'ten AYRI tutuldu ki DOM olmadan test edilebilsin — kisitli modun
 *  hangi durumda neyi kapattigi, bilesen render etmeden olculur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AbonelikDurumu =
  | 'DENEME'
  | 'AKTIF'
  | 'ODEME_BEKLIYOR'
  | 'KISITLI'
  | 'ASKIDA'
  | 'IPTAL'
  | 'SONA_ERDI';

export interface ErisimUyarisi {
  seviye: 'bilgi' | 'uyari' | 'kritik';
  baslik: string;
  metin: string;
  eylem?: { etiket: string; yol: string };
}

/** Sunucudan (`GET /auth/me` → `erisim`) gelen karar nesnesi. */
export interface ErisimKarari {
  erisimVar: boolean;
  saltOkunur: boolean;
  /**
   * 23.09.2026 — VİTRİN: aboneliği HİÇ olmamış (yeni) firma. Sunucu yalnız
   * "abonelik satırı yok" dalında yazar (`erisim.servisi.ts`); erişim yine
   * KAPALIDIR, bayrak yalnız "duvar çizme, gezdir" der. Alan yoksa vitrin
   * DEĞİLDİR (eski sunucu → eski duvar; güvenli yön).
   */
  vitrin?: boolean;
  durum: AbonelikDurumu;
  uyari: ErisimUyarisi | null;
  kalanGun: number | null;
  paketKodu: string;
  kullaniciHakki: number;
  dwgAktif: boolean;
}

/** Urun icindeki yetenekler — backend'deki `Yetenek` enum'unun aynisi. */
export enum Yetenek {
  TEKLIF_GORUNTULE = 'teklif.goruntule',
  TEKLIF_OLUSTUR = 'teklif.olustur',
  TEKLIF_DUZENLE = 'teklif.duzenle',
  EXCEL_YUKLE = 'excel.yukle',
  DWG_YUKLE = 'dwg.yukle',
  CIKTI_INDIR = 'cikti.indir',
  KUTUPHANE_GORUNTULE = 'kutuphane.goruntule',
  KUTUPHANE_DUZENLE = 'kutuphane.duzenle',
  KULLANICI_DAVET = 'kullanici.davet',
  ABONELIK_YONET = 'abonelik.yonet',
  // Backend ikizi: KISITLI_MODDA_ACIK'e girmez (para harcayan uç).
  AI_ANALIZ = 'ai.analiz',
  // Backend ikizi (Faz 6.8): İngilizce çeviri — o da para harcar, kısıtlı modda kapalı.
  CEVIRI = 'ceviri',
}

/**
 * Salt-okunur modda ACIK kalanlar.
 * ⚠ Backend'deki `KISITLI_MODDA_ACIK` ile BIREBIR AYNI olmali; ayrisirsa
 * kullanici acik gorunen bir dugmeye basip 403 yer. Test bu esligi olcer.
 */
const KISITLI_MODDA_ACIK: ReadonlySet<Yetenek> = new Set([
  Yetenek.TEKLIF_GORUNTULE,
  Yetenek.KUTUPHANE_GORUNTULE,
  Yetenek.ABONELIK_YONET,
]);

const ASKIDA_ACIK: ReadonlySet<Yetenek> = new Set([Yetenek.ABONELIK_YONET]);

/**
 * Bir yetenegin su an acik olup olmadigini soyler.
 *
 * ⚠ KILITLENME YASAGI: `ABONELIK_YONET` HER durumda acik doner. Kapanirsa
 * askidaki firma odeme sayfasina giremez, odeyemez ve askidan CIKAMAZ.
 */
export function yetenekAcikMi(
  karar: ErisimKarari | null,
  yetenek: Yetenek,
): boolean {
  if (yetenek === Yetenek.ABONELIK_YONET) return true;
  // Karar HENUZ YUKLENMEDIYSE kapatma: /auth/me donmeden once her seyi
  // kilitlemek, sayfa her acilisinda bir anlik "erisiminiz yok" yanip
  // sonmesi demektir. Sunucu zaten gercek kapidir.
  if (!karar) return true;
  if (!karar.erisimVar) return ASKIDA_ACIK.has(yetenek);
  if (karar.saltOkunur) return KISITLI_MODDA_ACIK.has(yetenek);
  if (yetenek === Yetenek.DWG_YUKLE && !karar.dwgAktif) return false;
  return true;
}

/** Serit gosterilmeli mi? (uyari yoksa gosterilmez) */
export function seritGosterilsinMi(karar: ErisimKarari | null): boolean {
  return !!karar?.uyari;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERISIM TAMAMEN KAPALIYKEN ACIK KALAN YOLLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ KILITLENME YASAGI (`yetenekAcikMi`daki ABONELIK_YONET kuralinin yol
 *  karsiligi): `/abonelik` kapanirsa kullanici odeyemez ve kapali durumdan
 *  CIKAMAZ. `/profile` kapanirsa KVKK haklari (verilerimi indir, hesabimi
 *  kapat) odeme durumuna baglanmis olurdu — `koltuk-durduruldu/page.tsx`
 *  ayni gerekceyle o iki ucu `@KoltukDisiIzinli` yapiyor; odeme kapisinda
 *  da ayni sey gecerli.
 *
 *  ⚠ LISTE "CALISAN SAYFALAR" DEGIL, "CIKIS YOLLARI"dir. Yeni bir sayfa
 *  eklendiginde listeye yazilmayi UNUTMAK, o sayfada kirmizi hata degil
 *  "paket secin" ekrani gosterir — gurultusuz ve guvenli yon. Ters yon
 *  (varsayilan olarak acmak) unutuldugunda bu turun kusurunu geri getirir.
 */
const DURDURULMAYAN_YOL = /^\/(abonelik|profile|koltuk-durduruldu)(\/|$)/;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KAPATILMIS HESABIN SALT-OKUNUR YOLLARI (22.09.2026 — Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre: "kaydedilmiş tekliflerini görebilecek, indirebilecek, girebilecek
 *  ancak işlem yapamayacak." Kütüphane için de aynısı.
 *
 *  ⚠ NEDEN AYRI BİR LİSTE — `DURDURULMAYAN_YOL` yetmez. O liste ÖDEMESİ
 *  olmayan HERKES için geçerli; oraya `/quotes` eklemek, hiç paket almamış
 *  bir hesabın da teklif ekranını açabilmesi demek olurdu. Kapatılmış hesap
 *  farklı: o kişi bu veriyi ZATEN üretmiş ve 30 günlük pencerede yalnız
 *  emeğini yanına alıyor.
 *
 *  ⚠ BU BİR KAPI DEĞİL. Gerçek kapı sunucudadır (`@KapaliHesapIzinli` +
 *  `KAPALI_HESAPTA_ACIK`). Buradaki liste yalnız "içeriği durdurma" kararı
 *  verir; listeye fazladan bir yol yazmak veri açmaz, yalnız kullanıcıya
 *  boş/403 bir sayfa gösterir.
 */
const KAPALI_HESABIN_OKUYABILECEGI_YOL =
  /^\/(dashboard|quotes|library|quote-formats)(\/|$)/;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VİTRİN — PAKETSİZ YENİ HESABIN GEZEBİLDİĞİ YOLLAR (23.09.2026 — Emre)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre: "ana sayfa her şey açılsın, kullanıcının önüne gelsin; kullanıcı
 *  paket seçsin (kart bilgisini girip), ödeme 30 günün sonunda çekilsin."
 *  Karar: "yalnızca gezsin" — bir işe başlamak için paket seçer.
 *
 *  ⚠ LİSTE ÖLÇÜYLE SEÇİLDİ: buradaki her sayfa YÜKLENİRKEN yalnız yetenek
 *    TAŞIMAYAN uçlara gider — pano `GET /panel/ozet` + `GET /quotes`, teklif
 *    listesi `GET /quotes`, Malzeme Havuzu `GET /brands*`, Ekip
 *    `GET /firma/uyeler`; Kütüphanem ana sayfası hiç istek atmaz. Vitrin
 *    sunucuda HİÇBİR yetenek açmaz; yüklenirken yetenekli uca giden bir
 *    sayfayı buraya eklemek o sayfada 403 kırmızı bildirimini geri getirir
 *    (22.09'da kabuğa taşınan kusur).
 *
 *  ⚠ `/quotes`, `/library`, `/firma/ekip` TAM EŞLEŞİR: `/quotes/new` teklif
 *    HAZIRLAR (iş) ve `/library/...` alt sayfaları yetenekli uçlardan
 *    yüklenir. Kurumsal giriş ayarı (`/firma/ekip/kurumsal-giris`) yeteneksiz
 *    uçtan yüklenir ama bir AYAR/İŞ sayfasıdır; vitrinde kart görmesi ÜRÜN
 *    tercihidir (inceleme S1, 24.09 — önceki gerekçe yanlıştı). `/materials`,
 *    `/abonelik`, `/profile`, `/koltuk-durduruldu` alt yollarıyla açıktır.
 *
 *  ⚠ LİSTEDE OLMAYAN HER YOL (bilinmeyen yeni sayfa DAHİL) içerik yerine
 *    "bu bölüm paket seçince açılır" kartını görür — güvenli yön. Tersi
 *    (varsayılan açık) unutulan her yeni sayfada kırmızı hata üretirdi.
 */
const VITRINDE_GEZILEBILIR_TAM_YOL = /^\/(dashboard|quotes|library|firma\/ekip)$/;
const VITRINDE_GEZILEBILIR_ONEK_YOL = /^\/(materials|abonelik|profile|koltuk-durduruldu)(\/|$)/;

/**
 * Paketsiz YENİ hesap (vitrin) mı? İş başlatan düğmeler bunu okuyup işlem
 * yerine paket penceresini açar.
 *
 * ⚠ `erisimVar` AYRICA sınanır: bayrak açık bir kararda gelirse (sunucu bunu
 * yapmaz) vitrin SAYILMAZ — aksi halde ödemiş müşterinin düğmeleri pencereye
 * dönerdi. Yanlış yön "vitrin değil"dir.
 */
export function vitrinMi(karar: ErisimKarari | null | undefined): boolean {
  return karar?.vitrin === true && karar.erisimVar !== true;
}

/** Vitrinde bu yolun sayfası gezilebilir mi? (liste yukarıda, gerekçesiyle) */
export function vitrindeGezilebilirMi(yol: string): boolean {
  return VITRINDE_GEZILEBILIR_TAM_YOL.test(yol) || VITRINDE_GEZILEBILIR_ONEK_YOL.test(yol);
}

/**
 * Sayfa içeriği yerine "paket seçince açılır" kartı mı çizilmeli?
 * Yalnız vitrinde ve gezilemeyen yolda `true`. Kart çizilince sayfa HİÇ mount
 * olmaz → yüklenirken yetenekli uca gidecek istekler YOLA ÇIKMAZ.
 */
export function vitrinKartiGosterilsinMi(karar: ErisimKarari | null, yol: string): boolean {
  return vitrinMi(karar) && !vitrindeGezilebilirMi(yol);
}

/**
 * Sayfa icerigi yerine "erisiminiz kapali" ekrani mi cizilmeli?
 *
 *  ── NEDEN SAYFA SAYFA DEGIL, KABUKTA ────────────────────────────────────
 *  OLCULDU (22.09.2026): 19 korumali sayfanin 18'i sunucunun 403
 *  `ABONELIK_KISITLI` yanitini GENEL hata sanip "Veriler yuklenirken bir
 *  hata olustu" kirmizi bildirimi basiyordu. Yalniz `/labor` ayirt ediyordu.
 *  Sayfa sayfa duzeltmek, eklenmeyi unutulan her yeni sayfada ayni kusuru
 *  geri getirir — `AbonelikSeridi`nin kabukta durma gerekcesiyle AYNI.
 *
 *  ⚠ `erisimVar` TRUE iken DURDURMAZ — `saltOkunur` (KISITLI) DAHIL.
 *  Kisitli firma tekliflerini ve kutuphanesini GOREBILIR; yalniz yazma
 *  uclari 403 doner. Onu da durdurmak, urunun "verinizi rehin almiyoruz"
 *  sozunu bozardi (`erisim.servisi.ts` KISITLI_MODDA_ACIK gerekcesi).
 *
 *  ⚠ `karar === null` DURDURMAZ: karar ya HENUZ YUKLENMEDI ya da hesap
 *  firmasiz. Ikisinde de kilitlemek, gercek kapi olmayan bir yerde
 *  (on yuz) kullaniciyi bilgisizce disari atmak olurdu. Gercek kapi
 *  sunucudadir (`ErisimGuard`).
 */
export function icerikDurdurulsunMu(
  karar: ErisimKarari | null,
  yol: string,
  hesapKapali = false,
): boolean {
  if (!karar) return false;
  if (karar.erisimVar) return false;
  // 23.09.2026 — VİTRİN DUVAR GÖRMEZ (Emre: "ana sayfa her şey açılsın,
  // kullanıcının önüne gelsin"). Gezilemeyen bölümde içerik yine değişir
  // ama DUVARLA değil "paket seçince açılır" kartıyla — o karar AYRI
  // (`vitrinKartiGosterilsinMi`), çünkü kart duvar değildir: şerit de durur.
  // ⚠ Bu satır `false` döndüğü için `AbonelikSeridi` vitrinde HER sayfada
  //   çizilir (şeridin "içerik durdurulduysa sus" kuralı buradan okur).
  if (vitrinMi(karar)) return false;
  // 22.09: kapatilmis hesap tekliflerini/kutuphanesini OKUYABILIR. Bu dal
  // olmasaydi `erisimVar: false` (kapatma aboneligi iptal eder) yuzunden
  // `/quotes` icerigi "paket secin" ekraniyla degistirilir, Emre'nin
  // "gorebilecek, girebilecek" karari on yuzde SESSIZCE olurdu.
  if (hesapKapali && KAPALI_HESABIN_OKUYABILECEGI_YOL.test(yol)) return false;
  return !DURDURULMAYAN_YOL.test(yol);
}

/** Serit rengi/vurgusu — seviyeden turetilir. */
export function seritSinifi(seviye: ErisimUyarisi['seviye']): string {
  switch (seviye) {
    case 'kritik':
      return 'border-red-200 bg-red-50 text-red-900';
    case 'uyari':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-900';
  }
}
