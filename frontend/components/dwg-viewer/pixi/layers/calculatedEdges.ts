/**
 * Calculated edges layer — /parse sonucundaki edge_segments'i çap bazlı
 * renklerle çizer.
 *
 * SADECE GORSEL — hit-test merkezi RBush (pixi/hitTest.ts) ile yapilir.
 *
 * Performans: Her çap için tek PIXI.Graphics (batched). polyline varsa
 * gerçek L/Z/U şekli, yoksa iki-uç line.
 */

import { Container, Graphics } from 'pixi.js';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { diameterToPixiColor } from '../color';

export interface CalculatedEdgesUpdateOpts {
  calculatedEdgesByLayer: Record<string, EdgeSegment[]> | undefined;
}

export interface CalculatedEdgesHandle {
  update(opts: CalculatedEdgesUpdateOpts): void;
  destroy(): void;
}

const EDGE_STROKE_WIDTH = 1.8;

export function createCalculatedEdges(parent: Container): CalculatedEdgesHandle {
  /** Görünür çizgiler: her çap için tek Graphics */
  const diameterGraphics = new Map<string, Graphics>();

  function clearAll() {
    diameterGraphics.forEach((g) => g.destroy());
    diameterGraphics.clear();
  }

  function drawSegmentPath(g: Graphics, seg: EdgeSegment) {
    const hasPolyline = Array.isArray(seg.polyline) && seg.polyline.length >= 2;
    if (hasPolyline) {
      const pts = seg.polyline!;
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i][0], pts[i][1]);
      }
    } else {
      const [x1, y1, x2, y2] = seg.coords;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
  }

  function update(opts: CalculatedEdgesUpdateOpts) {
    clearAll();
    const map = opts.calculatedEdgesByLayer;
    if (!map) return;

    // Segmentleri çap bazında grupla
    const byDiameter = new Map<string, EdgeSegment[]>();
    for (const segs of Object.values(map)) {
      for (const s of segs) {
        const key = s.diameter || 'Belirtilmemis';
        let arr = byDiameter.get(key);
        if (!arr) {
          arr = [];
          byDiameter.set(key, arr);
        }
        arr.push(s);
      }
    }

    // Görünür çizgiler — her çap tek Graphics
    byDiameter.forEach((segs, diameter) => {
      const g = new Graphics();
      g.label = `edges-${diameter}`;
      parent.addChild(g);
      diameterGraphics.set(diameter, g);

      const color = diameterToPixiColor(diameter);
      segs.forEach((seg) => drawSegmentPath(g, seg));
      g.stroke({ width: EDGE_STROKE_WIDTH, color, pixelLine: true });
    });
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
