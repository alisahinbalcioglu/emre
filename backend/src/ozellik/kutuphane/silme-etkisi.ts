/**
 * SILME ETKISI — "ne kaybedecegim?" sorusunun TEK semasi (A-1, 04.08)
 *
 * Iki salt-okuma ucu bu semayi doner:
 *   GET /api/admin/price-lists/:id/silme-etkisi   → etki: 'bag-kopar'
 *   GET /api/brands/:id/silme-etkisi              → etki: 'satir-silinir'
 *
 * ── ★ NEDEN TEK SAYI YETMIYOR: IKI YOL, IKI FARKLI GERCEK ────────────────
 * Ayni "N kutuphane satiri etkilenir" cumlesi iki yolda AYNI SEYI ANLATMAZ:
 *
 *   MARKA silme  (brands.service.ts `remove`)
 *     Servis icinde ELLE `userLibrary.deleteMany({ where: { brandId } })`
 *     kosuyor. Satirlar GERCEKTEN olur; iskonto/ozel fiyat da onlarla gider
 *     ve hicbir yerden geri gelmez.                    → etki: 'satir-silinir'
 *
 *   FIYAT LISTESI silme  (admin.service.ts `deletePriceList`)
 *     B isinden (04.08) sonra hicbir kutuphane satiri OLMEZ. Zincir:
 *       priceList.delete
 *         → ProductIndex        CASCADE   (indeks satirlari silinir)
 *         → UserLibrary.productIndexId    SET NULL  (satir YASAR)
 *         → UserLibrary.sourcePriceListId SET NULL  (satir YASAR)
 *     Satir yasar, discountRate/customPrice AYNEN durur; kaybedilen sey
 *     urun YAPISINA olan bagdir (satir "yapisiz" kalir, eslestirme motoru
 *     matching.service `manuelUrunIndeksle` ile satir metninden cikarim
 *     yapmaya duser — calisir ama urun tablosu kalitesinde DEGIL).
 *                                                      → etki: 'bag-kopar'
 *
 * Bu ayrim SUS PAYI DEGIL, olculmus gercektir: `test/a1-silme-etkisi-test.ts`
 * A0-a..A0-e canli DB'de fiyat listesini siler ve satirin yasadigini,
 * iskontonun durdugunu, bagin koptugunu tek tek olcer. Ekranda gosterilen
 * cumle bu alandan turer (frontend `lib/silme-onay-metni.ts`), boylece
 * "116 satir silinecek" gibi YANLIS bir vaat uretilemez.
 *
 * ⚠ Bu alan bir GORUNUM etiketi degil, DAVRANIS iddiasidir. FK kurallari
 * degisirse (ornegin productIndexId geri Cascade olursa) A0 kirmizi yanar;
 * o zaman duzeltilecek yer ekran metni degil BURASIDIR.
 */
export type SilmeEtkiTuru =
  /** Kutuphane satirlari GERCEKTEN silinir — ekonomi geri getirilemez. */
  | 'satir-silinir'
  /** Kutuphane satirlari yasar; yalniz urun/kaynak bagi kopar. */
  | 'bag-kopar';

export interface SilmeEtkisi {
  /** Silinecek nesnenin adi (marka adi ya da fiyat listesi adi). */
  ad: string;
  etki: SilmeEtkiTuru;
  /** Etkilenen UserLibrary satiri — TUM kullanicilar (capraz-tenant). */
  ulSatiri: number;
  /** Bunlarin discountRate > 0 olani. */
  iskontoluSatir: number;
  /** Bunlarin customPrice DOLU olani. */
  ozelFiyatliSatir: number;
  /** Etkilenen farkli kullanici sayisi. */
  etkilenenKullanici: number;
}

/**
 * "Ekonomi tasiyan satir" tanimi — TEK YERDE.
 * Iskonto (discountRate) ve ozel fiyat (customPrice) kullanicinin PAZARLIKLA
 * elde ettigi veridir. Sayim ucu, 409 on kontrolu ve ekran metni ayni tanimi
 * kullanmak ZORUNDA; ayri ayri yazilirsa uc "0 ekonomi" derken kapi 409
 * atabilir (ya da tersi) ve kullanici yanlis bilgilendirilir.
 */
export const EKONOMI_TASIYAN = [
  { discountRate: { gt: 0 } },
  { customPrice: { not: null } },
];

/** Etki ozetinde ekonomi tasiyan satir var mi? */
export function ekonomiVar(e: SilmeEtkisi): boolean {
  return e.iskontoluSatir > 0 || e.ozelFiyatliSatir > 0;
}
