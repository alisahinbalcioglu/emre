/**
 * A-1 — SILME ONAY METNI (karar fonksiyonu)
 *
 * NEDEN AYRI DOSYA: onay metni iki sayfanin JSX'ine gomuluydu ve jsdom
 * kurulu olmadigi icin test edilemiyordu. `lib/indeks-sagligi.ts` ile ayni
 * desen — bu bir refactor DEGIL, test edilebilirlik icin en kucuk ayirma:
 * "kullaniciya hangi cumle gosterilir" sorusunun cevabi saf fonksiyona alindi.
 *
 * ── ★ ISIN CEKIRDEGI: IKI YOL, IKI FARKLI GERCEK ────────────────────────
 * Backend `src/ozellik/kutuphane/silme-etkisi.ts` iki uc icin TEK sema
 * doner, ama `etki` alani iki AYRI davranisi ayirir:
 *
 *   'satir-silinir'  MARKA silme. `brands.service.remove` elle
 *                    `userLibrary.deleteMany({ brandId })` kosar. Satirlar
 *                    GERCEKTEN olur, iskonto/ozel fiyat onlarla gider ve
 *                    HICBIR YERDEN geri gelmez.
 *
 *   'bag-kopar'      FIYAT LISTESI silme. B isinden (04.08) sonra hicbir
 *                    kutuphane satiri olmez: productIndexId ve
 *                    sourcePriceListId SET NULL'a duser, satir yasar,
 *                    discountRate/customPrice AYNEN durur. Kaybedilen sey
 *                    urun YAPISINA olan bagdir.
 *
 * Bu ayrim tahmin degil, olcum: `backend/test/a1-silme-etkisi-test.ts`
 * A0-a..A0-e canli DB'de fiyat listesini siler ve satirin yasadigini,
 * iskontonun durdugunu, bagin koptugunu tek tek olcer.
 *
 * ⚠ BU DOSYANIN VAR OLMA SEBEBI: eski ekran metinleri YANLISTI.
 * `admin/brands/page.tsx:237` fiyat listesi icin yalniz "Icindeki tum baz
 * fiyatlar silinecek." diyordu — kutuphaneden HIC bahsetmiyordu.
 * `materials/[brandId]/page.tsx:262` ise ciplak bir onay cumlesiydi.
 * Duzeltirken ters yone dusmek de kolaydi: "N kutuphane satiri silinecek"
 * demek B'den sonra YANLIS olurdu. Metin ne fazla korkutur ne az soyler —
 * ne oluyorsa onu yazar.
 */

export type SilmeEtkiTuru = 'satir-silinir' | 'bag-kopar';

/** Backend `GET .../silme-etkisi` yanitinin semasi (birebir). */
export type SilmeEtkisi = {
  ad: string;
  etki: SilmeEtkiTuru;
  ulSatiri: number;
  iskontoluSatir: number;
  ozelFiyatliSatir: number;
  etkilenenKullanici: number;
};

export type OnayMetni = {
  title: string;
  description: string;
  /** Etkilenen satirlarda iskonto/ozel fiyat var mi — cagiran taraf
   *  sert onay (ornegin ikinci tiklama) istemek isterse diye ayri alan. */
  ekonomiVar: boolean;
  /**
   * ★ Kullaniciya GERCEK sayilar gosterildi mi?
   *
   * Onay ancak gorulen bilgiye dayaniyorsa gecerlidir. Uc cagrilamadiysa
   * kullanici hicbir rakam gormeden "Onayla"ya basar — bu bilgilendirilmis
   * onay DEGILDIR. Sayfalar bu bayrak false iken `?onaylandi=true`
   * GONDERMEZ; backend'in 409'u devreye girer ve hata metnindeki gercek
   * rakamlar ekrana duser. Yani ucun cokmesi korumayi zayiflatmaz, tersine
   * ikinci savunma katmanini devreye sokar.
   *
   * ⚠ "Etkilenen satir 0" ile "olculemedi" AYRI seylerdir: bos listede olcum
   * YAPILMISTIR, bayrak true kalir ve gereksiz 409 uretilmez.
   */
  bilgilendirilmisOnay: boolean;
};

export type OnayGirdisi = {
  tur: 'marka' | 'liste';
  /** Nesnenin adi — uc cagrilamadiginda da baslik dogru yazilsin diye
   *  `etki.ad`'dan BAGIMSIZ gecirilir. */
  ad: string;
  /** Uc yanitı; cagri basarisizsa null. */
  etki: SilmeEtkisi | null;
};

/** Nesne turune gore sabit ilk cumle — silmenin HER KOSULDA yaptigi sey. */
const TUR_METNI: Record<OnayGirdisi['tur'], { baslik: (ad: string) => string; temel: string }> = {
  marka: {
    baslik: (ad) => `"${ad}" markası silinsin mi?`,
    temel: 'Markanın tüm fiyat listeleri ve havuz fiyatları silinecek',
  },
  liste: {
    baslik: (ad) => `"${ad}" listesi silinsin mi?`,
    temel: 'Listedeki tüm baz fiyatlar ve ürün indeksi silinecek',
  },
};

/** "2 iskonto, 1 özel fiyat" — yalniz SIFIR OLMAYAN kirilimi yazar. */
function ekonomiOzeti(e: SilmeEtkisi): string {
  const parcalar: string[] = [];
  if (e.iskontoluSatir > 0) parcalar.push(`${e.iskontoluSatir} iskonto`);
  if (e.ozelFiyatliSatir > 0) parcalar.push(`${e.ozelFiyatliSatir} özel fiyat`);
  return parcalar.join(', ');
}

/**
 * Silme onayinda gosterilecek baslik ve aciklamayi uretir.
 *
 * Kurallar (hepsi `lib/silme-onay-metni.test.ts`'te ayri ayri sinanir):
 *  1. Etki hesaplanamadiysa (uc 4xx/5xx) SAYI UYDURULMAZ — durumun
 *     bilinmedigi acikca yazilir.
 *  2. Hicbir kutuphane satiri etkilenmiyorsa kutuphaneden HIC bahsedilmez
 *     (bos korku uretmek, yanlis rakam uretmek kadar zararli).
 *  3. 'satir-silinir' → "SİLİNECEK" + ekonomi varsa "geri getirilemez".
 *  4. 'bag-kopar'     → "SİLİNMEZ" + "bağı kopar" + ekonomi "korunur".
 */
export function silmeOnayMetni({ tur, ad, etki }: OnayGirdisi): OnayMetni {
  const { baslik, temel } = TUR_METNI[tur];
  const title = baslik(ad);

  // 1. Uc cagrilamadi — sessiz kalmak da sayi uydurmak da yanlis.
  if (!etki) {
    return {
      title,
      description: `${temel}. Kullanıcı kütüphanelerine etkisi hesaplanamadı — ` +
        `devam etmeden önce bunu göz önünde bulundurun.`,
      ekonomiVar: false,
      bilgilendirilmisOnay: false,
    };
  }

  const ekonomi = etki.iskontoluSatir > 0 || etki.ozelFiyatliSatir > 0;

  // 2. Kutuphane hic etkilenmiyor.
  if (etki.ulSatiri <= 0) {
    return {
      title,
      description: `${temel}. Kullanıcı kütüphaneleri etkilenmiyor.`,
      ekonomiVar: false,
      bilgilendirilmisOnay: true,
    };
  }

  const kimin = `${etki.ulSatiri} kütüphane satırı (${etki.etkilenenKullanici} kullanıcıya ait)`;
  const ozet = ekonomiOzeti(etki);

  // 3. Satirlar gercekten olur (marka yolu).
  if (etki.etki === 'satir-silinir') {
    const ekonomiCumlesi = ekonomi
      ? ` Bunların ${ozet} bilgisi var ve bu bilgi geri getirilemez.`
      : '';
    return {
      title,
      description: `${temel}. Ayrıca ${kimin} SİLİNECEK.${ekonomiCumlesi}`,
      ekonomiVar: ekonomi,
      bilgilendirilmisOnay: true,
    };
  }

  // 4. Satirlar yasar, yalniz bag kopar (fiyat listesi yolu).
  // "SİLİNMEZ" bilerek ONCE geliyor: admin'in ilk okudugu sey, en cok merak
  // ettigi sorunun cevabi olsun.
  const ekonomiCumlesi = ekonomi
    ? ` Girilmiş fiyatlar (${ozet}) korunur.`
    : ' Girilmiş fiyat bilgisi yok, korunacak veri bulunmuyor.';
  return {
    title,
    description: `${temel}. ${kimin} SİLİNMEZ, ancak ürün bağı kopar —` +
      ` eşleştirme bu satırlar için ürün tablosu yerine satır metnine düşer.${ekonomiCumlesi}`,
    ekonomiVar: ekonomi,
    bilgilendirilmisOnay: true,
  };
}
