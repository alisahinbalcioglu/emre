/**
 * Line renderer — per-DWG-layer Pixi.Graphics, batched, R-Tree culling-aware.
 *
 * Mimari:
 *   - Her DWG layer'i icin TEK Pixi.Graphics. Tum line'lari tek path'te.
 *   - Pixi v8 internal batcher GPU draw call'lari otomatik birlestirir.
 *   - Visibility: Worker'dan gelen visible ID set'ine gore Graphics yeniden
 *     cizilir (clear + path). RAF-debounced; pan'da her frame yapilmaz.
 *   - Layer hide/isolate: Graphics.visible = false (zero redraw).
 *   - Highlight: ayri Graphics (highlight layer'da), selectedEntityIds'a gore.
 *
 * Y-flip: yToScreen(y) ile her vertex render-time'da -y'ye cevrilir.
 */

import { Container, Graphics } from 'pixi.js';
import type { GeometryLine } from '../types';
import { yToScreen } from './sceneGraph';
import { aciToPixiColor, cssToHex } from './color';

export interface LineRendererOpts {
  /** Tum line'lar (geometry.lines), index erisimi icin. */
  lines: GeometryLine[];
  /** Layer ACI renkleri (geometry.layer_colors). */
  layerColors: Record<string, number>;
  /** Calculated edge'i olan layer'lar — bg'da cizilmez (boru ayri katmanda). */
  skipLayers?: Set<string>;
}

export interface LineRendererHandle {
  /** Visible ID set'i (line.42 gibi) ile tum layer Graphics'lerini guncelle. */
  setVisibleIds(ids: Set<string>): void;
  /** Layer'in goruntusunu toggle et (Graphics.visible). 0 redraw. */
  setLayerVisibility(layer: string, visible: boolean): void;
  /** Tum visible state'i guncelle (isolate/showAll sonrasi). */
  applyLayerVisibility(isVisible: (layer: string) => boolean): void;
  destroy(): void;
}

const COLOR_PASSIVE = cssToHex('#94a3b8');

export function createLineRenderer(
  parent: Container,
  opts: LineRendererOpts,
): LineRendererHandle {
  const { lines, layerColors, skipLayers } = opts;
  /** layerName -> Graphics. */
  const layerGraphics = new Map<string, Graphics>();
  /** layerName -> bu layer'a ait line index'leri (idx in `lines` array). */
  const layerLineIndices = new Map<string, number[]>();

  // Index lines by layer (one-time)
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (skipLayers?.has(ln.layer)) continue;
    let arr = layerLineIndices.get(ln.layer);
    if (!arr) {
      arr = [];
      layerLineIndices.set(ln.layer, arr);
    }
    arr.push(i);
  }

  // Initialize Graphics per layer
  layerLineIndices.forEach((_, layer) => {
    const g = new Graphics();
    g.label = `line-${layer}`;
    parent.addChild(g);
    layerGraphics.set(layer, g);
  });

  /** Render a layer's line set into its Graphics. visibleIndices subset. */
  function renderLayer(layer: string, visibleIndices: number[]) {
    const g = layerGraphics.get(layer);
    if (!g) return;
    g.clear();
    if (visibleIndices.length === 0) return;
    for (const idx of visibleIndices) {
      const ln = lines[idx];
      if (!ln) continue;
      const [x1, y1, x2, y2] = ln.coords;
      g.moveTo(x1, yToScreen(y1));
      g.lineTo(x2, yToScreen(y2));
    }
    const aci = layerColors[layer] ?? 7;
    const color = aci > 0 && aci !== 256 ? aciToPixiColor(aci) : COLOR_PASSIVE;
    // pixelLine kaldirildi (v8.18 shader bug). Width sabit world unit;
    // zoom degisikliginde stroke'i scale eder ama hatasiz render.
    g.stroke({ width: 1, color });
  }

  function setVisibleIds(visibleIds: Set<string>) {
    // Group visible IDs by layer
    const visiblePerLayer = new Map<string, number[]>();
    visibleIds.forEach((id) => {
      if (!id.startsWith('line.')) return;
      const idx = Number(id.slice(5));
      if (!Number.isFinite(idx)) return;
      const ln = lines[idx];
      if (!ln) return;
      if (skipLayers?.has(ln.layer)) return;
      let arr = visiblePerLayer.get(ln.layer);
      if (!arr) {
        arr = [];
        visiblePerLayer.set(ln.layer, arr);
      }
      arr.push(idx);
    });
    // Render per layer; layer'da visible yoksa Graphics bos kalir
    layerGraphics.forEach((_, layer) => {
      renderLayer(layer, visiblePerLayer.get(layer) ?? []);
    });
  }

  function setLayerVisibility(layer: string, visible: boolean) {
    const g = layerGraphics.get(layer);
    if (g) g.visible = visible;
  }

  function applyLayerVisibility(isVisible: (layer: string) => boolean) {
    layerGraphics.forEach((g, layer) => {
      g.visible = isVisible(layer);
    });
  }

  function destroy() {
    layerGraphics.forEach((g) => g.destroy());
    layerGraphics.clear();
    layerLineIndices.clear();
  }

  return { setVisibleIds, setLayerVisibility, applyLayerVisibility, destroy };
}
