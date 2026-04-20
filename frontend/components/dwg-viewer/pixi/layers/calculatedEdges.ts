/**
 * Calculated edges layer — /parse sonucundaki edge_segments'i çap bazlı
 * renklerle çizer.
 *
 * Performans: Her çap için tek PIXI.Graphics (batched). polyline varsa
 * gerçek L/Z/U şekli, yoksa iki-uç line.
 *
 * Hit-test: Her edge için ayrı invisible Graphics (bbox-like wide stroke).
 * Sayı az (tipik 500-2000), SVG'deki mantıkla aynı — her birine pointertap.
 */

import { Container, Graphics } from 'pixi.js';
import type { EdgeSegment } from '../../types';
import { diameterToPixiColor } from '../color';

export interface CalculatedEdgesUpdateOpts {
  calculatedEdgesByLayer: Record<string, EdgeSegment[]> | undefined;
}

export interface CalculatedEdgesHandle {
  update(opts: CalculatedEdgesUpdateOpts): void;
  destroy(): void;
}

/** Edge çizgisinin "kalınlık" stroke'u (dünya koordinatında değil, pixel) */
const EDGE_STROKE_WIDTH = 1.8;
/** Hit-test için görünmez stroke kalınlığı (piksel — zoom'dan bağımsız) */
const HIT_STROKE_WIDTH = 10;

export function createCalculatedEdges(
  parent: Container,
  onSegmentClickRef: () => ((segment: EdgeSegment) => void) | undefined,
  wasDraggedRef: () => boolean,
): CalculatedEdgesHandle {
  /** Görünür çizgiler: her çap için tek Graphics */
  const diameterGraphics = new Map<string, Graphics>();
  /** Hit-test — her edge için ayrı Graphics (tıklama bağlamı lazım) */
  let hitGraphicsList: Graphics[] = [];

  function clearAll() {
    diameterGraphics.forEach((g) => g.destroy());
    diameterGraphics.clear();
    hitGraphicsList.forEach((h) => h.destroy());
    hitGraphicsList = [];
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

    const hasClickHandler = !!onSegmentClickRef();

    // Görünür çizgiler — her çap tek Graphics
    byDiameter.forEach((segs, diameter) => {
      const g = new Graphics();
      g.label = `edges-${diameter}`;
      g.eventMode = 'passive'; // tıklama hit-layer'dan gelir
      parent.addChild(g);
      diameterGraphics.set(diameter, g);

      const color = diameterToPixiColor(diameter);
      segs.forEach((seg) => drawSegmentPath(g, seg));
      g.stroke({ width: EDGE_STROKE_WIDTH, color, pixelLine: true });
    });

    // Hit-test layer — onSegmentClick varsa her edge ayrı
    if (hasClickHandler) {
      byDiameter.forEach((segs) => {
        segs.forEach((seg) => {
          const h = new Graphics();
          h.label = `hit-${seg.segment_id}`;
          drawSegmentPath(h, seg);
          // Görünmez ama kalın stroke → hit area olur
          h.stroke({ width: HIT_STROKE_WIDTH, color: 0xffffff, alpha: 0.001, pixelLine: true });
          h.eventMode = 'static';
          h.cursor = 'pointer';
          h.on('pointertap', () => {
            if (wasDraggedRef()) return;
            const cb = onSegmentClickRef();
            cb?.(seg);
          });
          parent.addChild(h);
          hitGraphicsList.push(h);
        });
      });
    }
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
