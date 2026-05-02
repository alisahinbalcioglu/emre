/**
 * AutoCAD ACI (Autodesk Color Index) -> CSS hex string.
 * Standard AutoCAD palette, 256 renk + BYLAYER (256) + BYBLOCK (0).
 *
 * Bizde sadece sik kullanilan ilk 16 renk + bg-aware varyantlar.
 * 7 (white) DWG'lerde "BYLAYER default white" anlamina gelir; bizim koyu
 * arka planda beyaz cok parlak — yari saydam slate-300 kullaniyoruz.
 */

const ACI_PALETTE: Record<number, string> = {
  0: '#94a3b8',   // BYBLOCK fallback
  1: '#ef4444',   // red
  2: '#fbbf24',   // yellow
  3: '#22c55e',   // green
  4: '#22d3ee',   // cyan
  5: '#3b82f6',   // blue
  6: '#a855f7',   // magenta
  7: '#cbd5e1',   // white -> slate-300 (koyu bg uyumlu)
  8: '#64748b',   // dark gray
  9: '#94a3b8',   // light gray
  10: '#f87171',  // red light
  11: '#dc2626',  // red dark
  12: '#fbbf24',  // yellow
  13: '#facc15',  // yellow alt
  14: '#16a34a',  // green dark
  15: '#22d3ee',  // cyan
  256: '#cbd5e1', // BYLAYER default
};

export function aciToColor(aci: number): string {
  return ACI_PALETTE[aci] ?? '#94a3b8';
}
