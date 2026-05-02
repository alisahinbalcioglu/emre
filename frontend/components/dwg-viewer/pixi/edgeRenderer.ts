/**
 * Calculated edges renderer — boru segmentleri (cap-bazli renkli).
 *
 * Data source: workspace'in edgeSegments prop'u (dwg-metraj package'ından
 * gelir). Bu DWG entity_index'ten BAGIMSIZ — /parse endpoint sonucu cap
 * atamasi ile birlikte gelen kalin renkli cizgiler.
 *
 * Mimari: cap bazinda batch (Pixi internal). Her cap = 1 Graphics.
 * Tıklama: workspace tarafından (DiameterEditPopup) handle edilir;
 * burada sadece gorsel render.
 */

import { Container, Graphics } from 'pixi.js';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { yToScreen } from './sceneGraph';
import { buildDiameterPalette } from '@/components/dwg-metraj/diameter-colors';

export interface EdgeRendererHandle {
  update(edgeSegments: EdgeSegment[] | undefined): void;
  destroy(): void;
}

export function createEdgeRenderer(parent: Container): EdgeRendererHandle {
  const diameterGraphics = new Map<string, Graphics>();

  function clearAll() {
    diameterGraphics.forEach((g) => g.destroy());
    diameterGraphics.clear();
  }

  function update(edgeSegments: EdgeSegment[] | undefined) {
    clearAll();
    if (!edgeSegments || edgeSegments.length === 0) return;

    // Cap palette — calismayan: workspace zaten kullaniyor; tutarli renk
    const palette = buildDiameterPalette(edgeSegments.map((s) => s.diameter));
    const colorMap = new Map<string, string>();
    for (const p of palette) colorMap.set(p.diameter, p.color);

    // Cap bazinda grupla
    const byDiameter = new Map<string, EdgeSegment[]>();
    for (const seg of edgeSegments) {
      const key = seg.diameter || 'Belirtilmemis';
      let arr = byDiameter.get(key);
      if (!arr) {
        arr = [];
        byDiameter.set(key, arr);
      }
      arr.push(seg);
    }

    byDiameter.forEach((segs, diameter) => {
      const g = new Graphics();
      g.label = `edges-${diameter}`;
      parent.addChild(g);
      diameterGraphics.set(diameter, g);

      const colorCss = colorMap.get(diameter) ?? '#94a3b8';
      const color = parseInt(colorCss.replace('#', ''), 16) || 0x94a3b8;

      for (const seg of segs) {
        const hasPolyline = Array.isArray(seg.polyline) && seg.polyline.length >= 2;
        if (hasPolyline) {
          const pts = seg.polyline!;
          g.moveTo(pts[0][0], yToScreen(pts[0][1]));
          for (let i = 1; i < pts.length; i++) {
            g.lineTo(pts[i][0], yToScreen(pts[i][1]));
          }
        } else {
          const [x1, y1, x2, y2] = seg.coords;
          g.moveTo(x1, yToScreen(y1));
          g.lineTo(x2, yToScreen(y2));
        }
      }
      g.stroke({ width: 1.8, color });
    });
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
