/**
 * Arcs layer — geometry.arcs (yariciap yaylar; sprinkler/vana/kollektor
 * sembollerinin kavisli kisimlari, kanalcik baglantilari).
 *
 * DXF konvensyonu: start/end_angle derece, x-ekseninden saat yonune ters.
 * PixiJS Graphics.arc() radyan ister. Y-flip world.scale.y=-1 ile yapildigindan
 * default counterclockwise=false bekleneni verir (DXF CCW → ekran CCW).
 *
 * Renk: gri (#94a3b8), stroke 0.8 — circles ile ayni stil.
 */

import { Container, Graphics } from 'pixi.js';
import type { GeometryResult } from '../../types';
import { cssToHex } from '../color';

export interface ArcsUpdateOpts {
  geometry: GeometryResult | null;
}

export interface ArcsHandle {
  update(opts: ArcsUpdateOpts): void;
  destroy(): void;
}

const COLOR_NORMAL = cssToHex('#94a3b8');
const WIDTH_NORMAL = 0.8;

export function createArcs(parent: Container): ArcsHandle {
  let g: Graphics | null = null;

  function clearAll() {
    g?.destroy();
    g = null;
  }

  function update(opts: ArcsUpdateOpts) {
    clearAll();
    const arcList = opts.geometry?.arcs;
    if (!arcList || arcList.length === 0) return;

    g = new Graphics();
    g.label = 'arcs-normal';
    g.eventMode = 'passive';
    parent.addChild(g);

    for (const a of arcList) {
      // DXF: derece → PixiJS arc: radyan
      const sa = (a.start_angle * Math.PI) / 180;
      const ea = (a.end_angle * Math.PI) / 180;
      // DXF arc her zaman CCW (start → end). PixiJS default CW. Dunya
      // Y-flip ile cizildiginden default CW → ekranda CCW olur.
      g.moveTo(
        a.center[0] + a.radius * Math.cos(sa),
        a.center[1] + a.radius * Math.sin(sa),
      );
      g.arc(a.center[0], a.center[1], a.radius, sa, ea);
    }
    g.stroke({ width: WIDTH_NORMAL, color: COLOR_NORMAL, pixelLine: true });
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
