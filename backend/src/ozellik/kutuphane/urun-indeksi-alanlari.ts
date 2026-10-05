import type { ProductIndexFields } from '../eslestirme/matching/index/product-index';

/**
 * ProductIndex'in TURETILMIS alanlari (ham kolonlardan `buildProductIndex` /
 * `rebuildIndexFields` uretir) — P4b C7, 05.10.2026.
 *
 * ProductIndex'e turetilmis alan yazan HER yol bu listeyi yazar:
 *  · `admin/admin.service.ts` — yonetici ice aktarimi (iki upsert) ve
 *    yeniden indeksleme (`reindexProducts`);
 *  · `library/library.service.ts` — manuel urun olusturma
 *    (`insertLibraryRows`) ve sahipli urunun yeniden adlandirilmasi
 *    (`saveBrandSheets`).
 * Biri alan ekleyip digeri unutursa indeks yari bayat kalir (ad yeni, aile
 * eski) — manuel olusturma S4/S5'in `malzemeler`/`aileZayif` alanlarini
 * gercekten atliyordu (05.10'a dek).
 *
 * rowKey BILEREK YOK (P9d): '#2' sonekli mukerrerler ezilmesin; (priceListId,
 * rowKey) urunun kimligi — yeniden adlandirma onu DEGISTIRMEZ.
 */
export function turetilmisIndeksAlanlari(f: Omit<ProductIndexFields, 'rowKey'>) {
  return {
    adSlug: f.adSlug, adBucket: f.adBucket, adTokens: f.adTokens,
    cinsNorm: f.cinsNorm, cinsTokens: f.cinsTokens,
    baglantiNorm: f.baglantiNorm, baglantiTokens: f.baglantiTokens,
    sizeClass: f.sizeClass, capTags: f.capTags, capNorm: f.capNorm,
    malzemeler: f.malzemeler, aileZayif: f.aileZayif,
    boyTag: f.boyTag, displayName: f.displayName,
    belirsiz: f.belirsiz, indexVersion: f.indexVersion,
  };
}
