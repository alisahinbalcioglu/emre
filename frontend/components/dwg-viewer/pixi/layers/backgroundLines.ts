/**
 * Background lines layer — geometry.lines'ı layer bazlı tek PIXI.Graphics
 * olarak render eder. Sadece GORSEL — hit-test merkezi RBush
 * (pixi/hitTest.ts) ile yapilir, bu katmanin etkilesimi yoktur.
 *
 * Performans: 15K+ LINE'ı N layer × 1 Graphics ile çizer (tipik 20-80 Graphics).
 *
 * Stil:
 *   - `selectedLayer`: mavi, kalın stroke (renk override)
 *   - `highlightLayer`: kendi ACI rengi, diğerleri silik (alpha 0.3)
 *   - Default: layer ACI rengi
 */

import { Container, Graphics } from 'pixi.js';
import type { GeometryResult } from '../../types';
import { aciToPixiColor, cssToHex } from '../color';

export interface BackgroundLinesUpdateOpts {
  geometry: GeometryResult | null;
  selectedLayer?: string | null;
  highlightLayer?: string;
  /** Hesaplanmış edge'i olan layer'lar — bunlar background'da çizilmez (renkli
   *  edge katmanı zaten gösterecek). */
  skipLayers?: Set<string>;
  /** World container'in mevcut zoom'u — width hesabi icin (zoom-aware stroke).
   *  PixiJS v8'de pixelLine: true asiri kucuk zoom'da (~0.005) bug olabiliyor;
   *  zoom-aware width kendimiz hesapliyoruz: dunya_width = ekran_piksel / zoom. */
  zoom?: number;
}

export interface BackgroundLinesHandle {
  update(opts: BackgroundLinesUpdateOpts): void;
  destroy(): void;
}

const COLOR_SELECTED = cssToHex('#60a5fa');
const COLOR_PASSIVE = cssToHex('#94a3b8');
const ALPHA_DIM = 0.3;

export function createBackgroundLines(parent: Container): BackgroundLinesHandle {
  /** Gorunur cizgiler — layer basi tek Graphics. Etkilesim yok (eventMode 'none'
   *  parent container'da set edildi — world.ts). */
  const layerGraphics = new Map<string, Graphics>();

  function clearAll() {
    layerGraphics.forEach((g) => g.destroy());
    layerGraphics.clear();
  }

  function update(opts: BackgroundLinesUpdateOpts) {
    const { geometry, selectedLayer, highlightLayer, skipLayers, zoom } = opts;
    const safeZoom = zoom && zoom > 1e-8 ? zoom : 1;
    const widthFor = (screenPx: number) => screenPx / safeZoom;

    if (!geometry) {
      clearAll();
      return;
    }

    // Layer bazlı line gruplaması
    const groups = new Map<string, Array<[number, number, number, number]>>();
    const layerColors = geometry.layer_colors || {};
    for (const ln of geometry.lines) {
      if (skipLayers?.has(ln.layer)) continue;
      let arr = groups.get(ln.layer);
      if (!arr) {
        arr = [];
        groups.set(ln.layer, arr);
      }
      arr.push(ln.coords);
    }

    // Silinen layer'ları temizle
    const toDelete: string[] = [];
    layerGraphics.forEach((g, layer) => {
      if (!groups.has(layer)) {
        g.destroy();
        toDelete.push(layer);
      }
    });
    toDelete.forEach((l) => layerGraphics.delete(l));

    const hasHighlight = !!highlightLayer;

    groups.forEach((coordsList, layer) => {
      let g = layerGraphics.get(layer);
      if (!g) {
        g = new Graphics();
        g.label = `bg-${layer}`;
        // eventMode parent'tan miras (none) — etkilesim yok
        parent.addChild(g);
        layerGraphics.set(layer, g);
      } else {
        g.clear();
      }

      for (const [x1, y1, x2, y2] of coordsList) {
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }

      const isSelected = selectedLayer === layer;
      const isHighlighted = highlightLayer === layer;
      let color: number;
      let width: number;
      let alpha: number;

      if (isSelected) {
        color = COLOR_SELECTED;
        width = widthFor(3);
        alpha = 1;
      } else if (hasHighlight) {
        const aci = layerColors[layer] ?? 7;
        color = isHighlighted ? aciToPixiColor(aci) : COLOR_PASSIVE;
        width = widthFor(isHighlighted ? 3 : 1.5);
        alpha = isHighlighted ? 1 : ALPHA_DIM;
      } else {
        const aci = layerColors[layer] ?? 7;
        color = aciToPixiColor(aci);
        width = widthFor(1.5);
        alpha = 1;
      }

      g.stroke({ width, color, alpha });
    });
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
