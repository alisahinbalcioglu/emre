/**
 * Cap → renk esleme. Cizgileri capa gore renklendiren palet.
 * Renkler koyu arka plan (#0b1220) uzerinde iyi okunur.
 *
 * Bu dosya boru/cap hesabi (metraj) domain'ine ait. Viewer (dwg-viewer)
 * calculatedEdges katmaninda buradan import eder — gorunru renkleri metraj
 * verisinden uretilir.
 */
import { isUnassignedDiameter, diameterDisplayLabel, UNASSIGNED_LABEL } from './constants';

/**
 * 12 belirgin renk — Tailwind 500-level, rainbow sirali, birbirine kontrast.
 * Numeric cap-size'a gore index: kucuk -> kirmizi, buyuk -> magenta sirasinda
 * konumlanir (mantikli gorsel sıralama, soguk renk = kucuk cap degil).
 */
const PALETTE_12 = [
  '#ef4444', // 0  red-500     — kirmizi
  '#f97316', // 1  orange-500  — turuncu
  '#eab308', // 2  yellow-500  — sari
  '#84cc16', // 3  lime-500    — limon
  '#22c55e', // 4  green-500   — yesil
  '#14b8a6', // 5  teal-500    — turkuaz
  '#06b6d4', // 6  cyan-500    — camgobegi
  '#3b82f6', // 7  blue-500    — mavi
  '#6366f1', // 8  indigo-500  — indigo
  '#8b5cf6', // 9  violet-500  — menekse
  '#d946ef', // 10 fuchsia-500 — fusya
  '#ec4899', // 11 pink-500    — pembe
];

/** Numeric cap -> palette index. Inch (1/2", 1 1/4") cinsindeyse mm'e cevirir.
 *  KRITIK SIRA: kompleks pattern (inch, kesir) ONCE, basit (Ø/DN) SONRA.
 *  Aksi takdirde '2 1/2"' -> '2' rakami leftmost match olur -> 2mm yanlis sonuc.
 */
function diameterToNumeric(d: string): number | null {
  const s = d.trim();

  // 1) INCH map ONCE — "2 1/2\"", "1 1/4\"", "1/2\"" gibi tam string eslesmesi
  const inchMap: Record<string, number> = {
    '1/2': 15, '3/4': 20, '1': 25, '1 1/4': 32, '1 1/2': 40,
    '2': 50, '2 1/2': 65, '3': 80, '4': 100, '5': 125, '6': 150, '8': 200,
  };
  const noQuote = s.replace(/["″]/g, '').trim();
  if (inchMap[noQuote] !== undefined) return inchMap[noQuote];

  // 2) Unicode kesir: ½=15 (1/2"), 2½=65 (2 1/2"), 1½=40, 1¼=32
  const fracMap: Record<string, number> = { '½': 15, '¼': 8, '¾': 20 };
  const fracMatch = s.match(/^(\d*)\s*([½¼¾])/);
  if (fracMatch) {
    const whole = fracMatch[1] ? parseInt(fracMatch[1], 10) : 0;
    const fracMm = fracMap[fracMatch[2]] ?? 0;
    const mm = whole * 25 + fracMm;
    if (mm > 0) return mm;
  }

  // 3) Ø/DN prefix ZORUNLU (yoksa "2 1/2"" '2'ye dusurmesin)
  //    "Ø200" -> 200, "DN150" -> 150, "dn50" -> 50
  const mPrefix = s.match(/(?:[ØØ]|[Dd][Nn])\s*(\d{1,3})/);
  if (mPrefix) {
    const n = parseInt(mPrefix[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // 4) mm suffix: "50mm", "100 mm"
  const mMm = s.match(/(\d{1,3})\s*(?:mm|MM)\b/);
  if (mMm) {
    const n = parseInt(mMm[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

/** Numeric mm -> palette index (0-11). Standart cap aralıklarına göre bucket. */
function numericToPaletteIndex(mm: number): number {
  // 12 bucket: <=15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, >=200
  const buckets = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200];
  for (let i = 0; i < buckets.length; i++) {
    if (mm <= buckets[i]) return i;
  }
  return buckets.length - 1;
}

/** Bilinmeyen string'ler icin: hash -> palette index (12 net renk, cakisma az). */
function hashToPaletteIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % PALETTE_12.length;
}

/**
 * Cap string'inden renk don.
 * Atanmamis (bos, 'Belirtilmemis', UNASSIGNED_LABEL) -> notr gri.
 * O50, DN50, 50, 2" hepsi AYNI renge denk gelir (nominal mm bazli).
 */
export function diameterToColor(diameter: string): string {
  if (isUnassignedDiameter(diameter) || diameter === UNASSIGNED_LABEL) {
    return '#64748b'; // slate-500 notr gri — atanmamis cap dikkati ana renklerle bozmasin
  }
  const normalized = diameter.trim();
  const mm = diameterToNumeric(normalized);
  if (mm !== null) {
    return PALETTE_12[numericToPaletteIndex(mm)];
  }
  // Numeric'e cevrilemeyenler: hash ile palette'ten birine sabitle
  return PALETTE_12[hashToPaletteIndex(normalized)];
}

/** Tum unique cap'lar icin renk paleti liste olarak don (legend icin) */
export function buildDiameterPalette(diameters: string[]): Array<{ diameter: string; color: string; label: string }> {
  const uniq = Array.from(new Set(diameters));
  return uniq.map((d) => ({
    diameter: d,
    color: diameterToColor(d),
    label: diameterDisplayLabel(d),
  }));
}

/**
 * Cap text'ini canonical form'a getir. Backend'deki `_canonicalize_cap` ile
 * AYNI kurallari uygular — frontend'de manuel kullanici input'larini
 * (DiameterEditPopup, default diameter input) ayni string'e indirir ki
 * legend'da '1¼"' ve '1 1/4"' tek satira birlessin.
 *
 * Idempotent: tekrar uygulanabilir, ayni sonucu doner.
 *
 * Ornekler:
 *   '1 1/4"'  → '1¼"'
 *   '1¼″'     → '1¼"'      (Unicode prime → ASCII)
 *   "1¼''"    → '1¼"'      (iki tek-tirnak → ASCII)
 *   'dn 150'  → 'DN150'
 *   '50 MM'   → '50mm'
 *   'Ø 200'   → 'Ø200'
 */
const ASCII_FRAC_TO_UNICODE: Record<string, string> = {
  '1/2': '½',
  '1/4': '¼',
  '3/4': '¾',
};

export function canonicalizeDiameter(s: string): string {
  if (!s) return '';
  let out = s.trim();
  // Quote varyantlari → ASCII "
  out = out.replace(/″/g, '"').replace(/''/g, '"');
  // DN normalize: 'dn 150', 'Dn150' → 'DN150'  (oncesinde harf yoksa)
  out = out.replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])[Dd][Nn]\s*(\d+)/g, (_m, n) => `DN${n}`);
  // Ø: 'Ø 200' → 'Ø200'
  out = out.replace(/[ØØ]\s*/g, 'Ø');
  // mm: '50 MM', '50 mm' → '50mm'
  out = out.replace(/(\d+)\s*[Mm][Mm]\b/g, (_m, n) => `${n}mm`);
  // Mixed kesir: '1 1/4' → '1¼'
  out = out.replace(/(\d+)\s+(\d+)\/(\d+)/g, (m, whole, num, den) => {
    const u = ASCII_FRAC_TO_UNICODE[`${num}/${den}`];
    return u ? `${whole}${u}` : m;
  });
  // Standalone kesir: '1/4' → '¼' (oncesinde rakam yok)
  out = out.replace(/(?<!\d)(\d+)\/(\d+)(?!\d)/g, (m, num, den) => {
    const u = ASCII_FRAC_TO_UNICODE[`${num}/${den}`];
    return u ?? m;
  });
  // Coklu bosluk → tek bosluk
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}
