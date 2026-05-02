/**
 * Background lines layer — geometry.lines'ı layer bazlı tek PIXI.Graphics
 * olarak render eder.
 *
 * Performans: 15K+ LINE'ı N layer × 1 Graphics ile çizer (tipik 20-80 Graphics).
 * SVG'de her line ayrı DOM node iken burada tek batched draw call.
 *
 * Etkileşim:
 *   - `selectedLayer`: mavi, kalın stroke (renk override)
 *   - `highlightLayer`: kendi ACI rengi, diğerleri silik (alpha 0.3)
 *   - Layer'a tıklama: onLineClick callback (drag olduysa yutulur)
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
// Eski #475569 koyu slate idi, viewer arka plani (#0b1220) ile kontrasti
// cok dusuk oldugu icin layer "0" gibi cizimler "bos ekran" gibi goruluyordu.
const COLOR_PASSIVE = cssToHex('#94a3b8');
const ALPHA_DIM = 0.3;

/**
 * Parent container'a layer bazlı Graphics'ler ekler ve değişimleri yönetir.
 * onLineClickRef: her tıklamada parent'ın güncel callback'ine erişmek için
 * fonksiyon — closure eskime sorunu yok.
 */
export function createBackgroundLines(
  parent: Container,
  onLineClickRef: () => ((args: { layer: string; index: number; shiftKey: boolean }) => void) | undefined,
  wasDraggedRef: () => boolean,
): BackgroundLinesHandle {
  const layerGraphics = new Map<string, Graphics>();

  function clearAll() {
    layerGraphics.forEach((g) => g.destroy());
    layerGraphics.clear();
  }

  function update(opts: BackgroundLinesUpdateOpts) {
    const { geometry, selectedLayer, highlightLayer, skipLayers, zoom } = opts;
    // zoom yoksa fallback 1; world transform asla 0 olmamali ama defensive.
    const safeZoom = zoom && zoom > 1e-8 ? zoom : 1;
    // Ekran piksel cinsinden istenen kalinligi dunya birimine cevir:
    // dunya_width = ekran_pixel_kalinligi / zoom.
    // Boylece world.scale ile carpildiginda tam istenen ekran piksel olur.
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

    // Layer Graphics'leri oluştur/güncelle
    groups.forEach((coordsList, layer) => {
      let g = layerGraphics.get(layer);
      if (!g) {
        g = new Graphics();
        g.label = `bg-${layer}`;
        parent.addChild(g);
        layerGraphics.set(layer, g);
      } else {
        g.clear();
      }

      // Çizim
      for (const [x1, y1, x2, y2] of coordsList) {
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }

      // Renk/stil
      const isSelected = selectedLayer === layer;
      const isHighlighted = highlightLayer === layer;
      let color: number;
      let width: number;
      let alpha: number;

      if (isSelected) {
        color = COLOR_SELECTED;
        width = widthFor(3); // 3 ekran pikseli kalin
        alpha = 1;
      } else if (hasHighlight) {
        // Highlight modu: sadece highlightLayer normal, diğerleri silik
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

      // Width'i kendimiz zoom-aware hesapliyoruz; pixelLine bayragini KALDIRDIK
      // cunku PixiJS v8.18'de extreme zoom-out (~0.005) icin tutarsiz davraniyor.
      g.stroke({ width, color, alpha });

      // Tıklama — onLineClick varsa tıklanabilir
      const callbackExists = !!onLineClickRef();
      if (callbackExists) {
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.removeAllListeners('pointertap');
        g.on('pointertap', (event) => {
          if (wasDraggedRef()) return;
          const cb = onLineClickRef();
          // PixiJS FederatedPointerEvent shiftKey'i direkt expose eder.
          // Shift+click = layer gizle/goster (workspace handler'inda dallanir).
          cb?.({ layer, index: 0, shiftKey: !!event.shiftKey });
        });
      } else {
        g.eventMode = 'passive';
        g.cursor = 'default';
        g.removeAllListeners('pointertap');
      }
    });
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
