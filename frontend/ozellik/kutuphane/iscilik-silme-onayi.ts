/**
 * İŞÇİLİK SİLME ONAYLARI — SAYILI (P4b Parti 3, LOW-4, 05.10.2026).
 *
 * İkiz sayfa (malzeme kütüphanesi `deleteActiveList`) liste silmede içindeki
 * satır sayısını söylüyordu; işçilik firma sayfası yalnız "Bu fiyat listesi
 * silinsin mi?" diye soruyordu. Oysa liste silinince fiyat satırları da gider
 * (`LaborPrice.priceList` onDelete CASCADE, göç 20261004120000) — firma
 * silinince listeleri ve tüm fiyat satırları (ikisi de firmaya CASCADE).
 *
 * Sayılar sunucunun `_count` alanından (sekme / firma kartı zaten gösteriyor);
 * bilinmiyorsa UYDURULMAZ.
 */
import type { ConfirmOptions } from '../../ortak/hooks/use-confirm';

const sayi = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);

/** Firma sayfasında "Listeyi Sil". */
export function iscilikListesiSilmeOnayi(ad: string, fiyatSatiri: number | null | undefined): ConfirmOptions {
  const n = sayi(fiyatSatiri);
  return {
    title: ad.trim() ? `"${ad.trim()}" fiyat listesi silinsin mi?` : 'Fiyat listesi silinsin mi?',
    description: n === null
      ? 'Listedeki tüm kalemler fiyatları ve iskontolarıyla silinir; geri alınamaz.'
      : n === 0
        ? 'Listede kalem yok; yalnız liste silinir.'
        : `Listedeki ${n} kalem fiyatı ve iskontosuyla silinir; geri alınamaz.`,
    confirmText: 'Sil',
  };
}

/** Firmalar sayfasında firma silme. */
export function iscilikFirmasiSilmeOnayi(
  ad: string, listeSayisi: number | null | undefined, fiyatSatiri: number | null | undefined,
): ConfirmOptions {
  const l = sayi(listeSayisi);
  const f = sayi(fiyatSatiri);
  return {
    title: ad.trim() ? `"${ad.trim()}" silinsin mi?` : 'Firma silinsin mi?',
    description: l === null || f === null
      ? 'Firmanın tüm fiyat listeleri ve fiyatları da silinir; geri alınamaz.'
      : l === 0 && f === 0
        ? 'Firmanın fiyat listesi yok; yalnız firma silinir.'
        : `${l} fiyat listesi ve ${f} kalem fiyatı da silinir; geri alınamaz.`,
    confirmText: 'Sil',
  };
}
