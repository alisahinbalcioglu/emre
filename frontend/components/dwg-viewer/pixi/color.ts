/**
 * Renk yardimcilari — AutoCAD ACI (color index) -> Pixi number conversion.
 */

import { aciToColor } from '../aci-colors';

/** AutoCAD ACI -> 0xRRGGBB. */
export function aciToPixiColor(aci: number): number {
  const css = aciToColor(aci);  // "#RRGGBB"
  return cssToHex(css);
}

/** "#RRGGBB" or "#RGB" -> 0xRRGGBB number. */
export function cssToHex(css: string): number {
  if (!css) return 0xffffff;
  let s = css.startsWith('#') ? css.slice(1) : css;
  if (s.length === 3) {
    s = s.split('').map((c) => c + c).join('');
  }
  return parseInt(s, 16) || 0xffffff;
}

/** Cap (Ø50, DN100, ...) -> renk. Pixi viewer/metraj ortak palette'i icin. */
export function diameterToPixiColor(diameter: string): number {
  // diameter-colors.ts modulu metraj'da yasiyor (cap/boru ekosistemi).
  // Viewer ozel paletini burada tutuyoruz — iki tarafi ayri tutmak icin.
  // Phase 1c.2: calculatedEdges renderer kendi palette'ini cagiriyor zaten.
  // Bu fonksiyon fallback — direkt gri.
  return 0x94a3b8;
}
