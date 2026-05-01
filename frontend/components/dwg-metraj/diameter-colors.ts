/**
 * Cap → renk esleme. Cizgileri capa gore renklendiren palet.
 * Renkler koyu arka plan (#0b1220) uzerinde iyi okunur.
 *
 * Bu dosya boru/cap hesabi (metraj) domain'ine ait. Viewer (dwg-viewer)
 * calculatedEdges katmaninda buradan import eder — gorunru renkleri metraj
 * verisinden uretilir.
 */

// Sik kullanilan caplar icin sabit renkler — hep ayni caplar ayni renkte gorunsun
const DIAMETER_COLORS: Record<string, string> = {
  '1/2"':    '#fbbf24', // amber
  '3/4"':    '#f59e0b', // koyu amber
  '1"':      '#60a5fa', // mavi
  '1 1/4"':  '#34d399', // yesil
  '1 1/2"':  '#a78bfa', // mor
  '2"':      '#f472b6', // pembe
  '2 1/2"':  '#22d3ee', // cyan
  '3"':      '#fb923c', // turuncu
  '4"':      '#f87171', // kirmizi
  '5"':      '#fbbf24',
  '6"':      '#ef4444', // parlak kirmizi
  '8"':      '#dc2626',
};

/** Rastgele caplar icin uretilmis renkler */
function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

/**
 * Cap string'inden renk don.
 * Bos veya "Belirtilmemis" ise kirmizi-gri (uyari) renk.
 */
export function diameterToColor(diameter: string): string {
  if (!diameter || diameter === 'Belirtilmemis') {
    return '#ef4444'; // parlak kirmizi — dikkat cekici
  }
  const normalized = diameter.trim();
  if (DIAMETER_COLORS[normalized]) return DIAMETER_COLORS[normalized];

  // Metric capları (Ø50, DN100) icin de renk ver
  if (normalized.match(/Ø\d+|DN\d+/i)) {
    return hashColor(normalized);
  }

  return hashColor(normalized);
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
