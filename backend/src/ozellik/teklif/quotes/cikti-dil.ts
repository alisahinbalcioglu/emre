/**
 * CIKTI DILI — SABIT METINLER (13.08).
 *
 * ── NEDEN AI YOK ───────────────────────────────────────────────────────────
 * Kolon basliklari ("Malzeme Adı", "Genel Toplam") ve birim kisaltmalari
 * ("mt", "ad") DEGISKEN METIN DEGILDIR: ilkini bu dosya uretir, ikincisi
 * kapali bir kumedir. Bunlari `Translation` onbellegine ya da modele sormak
 * uc ayri zarar uretirdi:
 *   1) PARA — her teklifte tekrar tekrar token harcanirdi.
 *   2) KARARSIZLIK — model "Miktar"i bir teklifte "Quantity", digerinde
 *      "Amount" cevirebilir; ayni musteriye giden iki dosya farkli olurdu.
 *   3) OLCU — "mt" ceviri katmaninda DOKUNULMAZ sayiliyor (olcu soz dagari),
 *      yani modele zaten hic gitmiyor; oraya zorlamak dokunulmazlik kuralini
 *      delmek olurdu.
 * Sabit eslesme deterministiktir: ayni girdi her zaman ayni cikti.
 *
 * ── BILINMEYEN DEGER OLDUGU GIBI KALIR ─────────────────────────────────────
 * Sozlukte olmayan bir birim UYDURULMAZ. Kullanicinin kesif dosyasindan gelen
 * "vrs", "kalem", "poz" gibi bir deger Turkce kalir — yanlis bir Ingilizce
 * karsilik, cevrilmemis birakmaktan DAHA kotudur: musteri onu okur ve yanlis
 * anlar, kimse de fark etmez.
 */

/** Standart cikti kolon basliklari — Turkce cikti ile AYNI SIRADA. */
export const STANDART_KOLONLAR_EN = [
  'No.', 'Description', 'Quantity', 'Unit',
  'Material Unit Price', 'Material Total',
  'Labour Unit Price', 'Labour Total', 'Grand Total',
];

/** Ozet sayfasi basliklari. */
export const OZET_KOLONLAR_EN = ['Sheet', 'Material Total', 'Labour Total', 'Grand Total'];

/** Ozet sayfasindaki diger sabit metinler. */
export const CIKTI_METINLERI_EN: Record<string, string> = {
  'Sayfa': 'Sheet',
  'Malz. Toplam': 'Material Total',
  'İşç. Toplam': 'Labour Total',
  'Genel Toplam': 'Grand Total',
  'TOPLAM': 'TOTAL',
  'Özet': 'Summary',
  'ÖZET': 'SUMMARY',
};

/**
 * BIRIM KISALTMALARI — kapali kume.
 *
 * ⚠ Anahtarlar `toLocaleLowerCase('tr-TR')` ile normalize edilmis halde
 * yazilir. Turkce kucultme locale'siz yapilirsa "İ" → "i̇" (birlesik nokta)
 * olur ve eslesme SESSIZCE kacar — bu projede daha once yasanmis bir hata.
 */
const BIRIM_EN: Record<string, string> = {
  // uzunluk
  'mt': 'm', 'm': 'm', 'metre': 'm', 'mtul': 'm', 'm.tül': 'm', 'mtul.': 'm',
  'cm': 'cm', 'mm': 'mm', 'km': 'km',
  // alan / hacim
  'm2': 'm²', 'm²': 'm²', "m'2": 'm²', 'metrekare': 'm²',
  'm3': 'm³', 'm³': 'm³', "m'3": 'm³', 'metreküp': 'm³',
  // adet aileleri
  'ad': 'pcs', 'ad.': 'pcs', 'adet': 'pcs', 'ade': 'pcs',
  'set': 'set', 'takım': 'set', 'takim': 'set', 'tk': 'set',
  'çift': 'pair', 'cift': 'pair',
  'paket': 'pack', 'pk': 'pack',
  'rulo': 'roll', 'top': 'roll',
  'boy': 'length',
  // agirlik / hacim
  'kg': 'kg', 'ton': 'ton', 'gr': 'g', 'g': 'g',
  'lt': 'L', 'litre': 'L', 'l': 'L',
  // zaman / isgucu
  'saat': 'hour', 'sa': 'hour', 'gün': 'day', 'gun': 'day',
  'ay': 'month', 'yıl': 'year', 'yil': 'year',
  // toplu
  'ls': 'lump sum', 'götürü': 'lump sum', 'goturu': 'lump sum',
};

/**
 * Birim degerini Ingilizce karsiligina cevirir.
 * Sozlukte YOKSA deger OLDUGU GIBI doner (uydurma yapilmaz).
 */
export function birimCevir(ham: unknown, dil: string | undefined): string {
  const metin = String(ham ?? '').trim();
  if (dil !== 'en' || !metin) return metin;
  const anahtar = metin.toLocaleLowerCase('tr-TR');
  return BIRIM_EN[anahtar] ?? metin;
}

/** Sabit cikti metnini cevirir; sozlukte yoksa oldugu gibi doner. */
export function ciktiMetni(ham: string, dil: string | undefined): string {
  if (dil !== 'en') return ham;
  return CIKTI_METINLERI_EN[ham] ?? ham;
}
