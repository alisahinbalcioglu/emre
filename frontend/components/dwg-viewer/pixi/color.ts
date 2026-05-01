/**
 * PixiJS renk dönüştürme katmanı.
 *
 * Mevcut `aciToColor` ve `diameterToColor` fonksiyonları CSS string
 * (hex veya HSL) döndürür — bunlar SVG için uygun ama PixiJS `Graphics`
 * API'si 0xRRGGBB sayısı ister. Bu dosya tek dönüştürme noktası.
 * Renk mantığını değiştirmiyoruz — sadece format adapter.
 */

import { aciToColor } from '../aci-colors';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';

/**
 * CSS renk string'ini ("#rrggbb", "#rgb", "hsl(h,s%,l%)", "rgb(r,g,b)")
 * PixiJS 0xRRGGBB sayısına çevirir.
 * Bilinmeyen format: beyaz (0xffffff) fallback.
 */
export function cssToHex(css: string): number {
  if (!css) return 0xffffff;
  const s = css.trim().toLowerCase();

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return (r << 16) | (g << 8) | b;
    }
    if (hex.length === 6) {
      return parseInt(hex, 16);
    }
    return 0xffffff;
  }

  const hslMatch = s.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const sat = parseFloat(hslMatch[2]) / 100;
    const lum = parseFloat(hslMatch[3]) / 100;
    return hslToHex(h, sat, lum);
  }

  const rgbMatch = s.match(/rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return (r << 16) | (g << 8) | b;
  }

  return 0xffffff;
}

/** HSL (hue 0-360, saturation 0-1, lightness 0-1) → 0xRRGGBB */
function hslToHex(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

/** ACI (AutoCAD Color Index) → PixiJS 0xRRGGBB */
export function aciToPixiColor(aci: number, fallback: string = '#334155'): number {
  return cssToHex(aciToColor(aci, fallback));
}

/** Çap string ("1 1/4\"", "Ø50", "Belirtilmemis") → PixiJS 0xRRGGBB */
export function diameterToPixiColor(diameter: string): number {
  return cssToHex(diameterToColor(diameter));
}
