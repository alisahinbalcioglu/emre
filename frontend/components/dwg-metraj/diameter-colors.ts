/**
 * Cap → renk esleme. Cizgileri capa gore renklendiren palet.
 * Renkler koyu arka plan (#0b1220) uzerinde iyi okunur.
 *
 * Bu dosya boru/cap hesabi (metraj) domain'ine ait. Viewer (dwg-viewer)
 * calculatedEdges katmaninda buradan import eder — gorunru renkleri metraj
 * verisinden uretilir.
 */

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

/** Numeric cap -> palette index. Inch (1/2", 1 1/4") cinsindeyse mm'e cevirir. */
function diameterToNumeric(d: string): number | null {
  const s = d.trim();
  // Ø50, DN150 -> 50, 150
  const mDirect = s.match(/(?:Ø|Ø|DN|dn|d)?\s*(\d{1,3})(?!\d)/);
  if (mDirect) {
    const n = parseInt(mDirect[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Inch -> mm (yaklasik nominal): 1/2"=15, 3/4"=20, 1"=25, 1 1/4"=32...
  const inchMap: Record<string, number> = {
    '1/2': 15, '3/4': 20, '1': 25, '1 1/4': 32, '1 1/2': 40,
    '2': 50, '2 1/2': 65, '3': 80, '4': 100, '5': 125, '6': 150, '8': 200,
  };
  const noQuote = s.replace(/["″]/g, '').trim();
  if (inchMap[noQuote] !== undefined) return inchMap[noQuote];
  // Unicode kesir: ½=15 (1/2"), 2½=65 (2 1/2"), 1½=40, 1¼=32
  const fracMap: Record<string, number> = { '½': 15, '¼': 8, '¾': 20 };
  const fracMatch = s.match(/^(\d*)\s*([½¼¾])/);
  if (fracMatch) {
    const whole = fracMatch[1] ? parseInt(fracMatch[1], 10) : 0;
    const fracMm = fracMap[fracMatch[2]] ?? 0;
    // 2½ -> 2"+1/2" = 65mm nominal; basit: whole*25 + fracMm
    const mm = whole * 25 + fracMm;
    if (mm > 0) return mm;
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
 * Bos veya "Belirtilmemis" ise nötr gri (uyari yerine).
 * Ø50, DN50, 50, 2" hepsi AYNI renge denk gelir (nominal mm bazli).
 */
export function diameterToColor(diameter: string): string {
  if (!diameter || diameter === 'Belirtilmemis') {
    return '#64748b'; // slate-500 nötr gri — atanmamis cap dikkati ana renklerle bozmasin
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
    label: d || 'Belirtilmemis',
  }));
}
