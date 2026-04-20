/**
 * AutoCAD Color Index (ACI) → CSS renk eslestirmesi.
 * Sadece sik kullanilan ilk 256 renk. BYLAYER (256) cagiranin default rengine dusulur.
 */

const ACI_PALETTE: Record<number, string> = {
  0: '#000000',   // BYBLOCK
  1: '#ff0000',   // kirmizi
  2: '#ffff00',   // sari
  3: '#00ff00',   // yesil
  4: '#00ffff',   // cyan
  5: '#0000ff',   // mavi
  6: '#ff00ff',   // magenta
  7: '#000000',   // siyah/beyaz (arka plana gore)
  8: '#808080',   // koyu gri
  9: '#c0c0c0',   // acik gri
  // 10-249 ara tonlar; basitlestirmek icin donguyle uretilir asagida
  250: '#333333',
  251: '#464646',
  252: '#5a5a5a',
  253: '#6e6e6e',
  254: '#828282',
  255: '#ffffff',
};

/**
 * AutoCAD color index'i CSS hex'e cevir.
 * Bilinmiyor veya BYLAYER (256) ise fallback renk donulur.
 */
export function aciToColor(aci: number, fallback: string = '#334155'): string {
  if (aci === 256 || aci === 0) return fallback;
  if (ACI_PALETTE[aci]) return ACI_PALETTE[aci];
  // Orta renkler icin basit bir hash — HSL ile cesitlilik yarat
  const hue = (aci * 137) % 360;  // altin oran ile iyi dagilim
  return `hsl(${hue}, 70%, 45%)`;
}
