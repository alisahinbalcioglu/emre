/**
 * Arcs layer — geometry.arcs (yariciap yaylar; sprinkler/vana/kollektor
 * sembollerinin kavisli kisimlari, kanalcik baglantilari).
 *
 * DXF konvensyonu: start/end_angle derece, x-ekseninden saat yonune ters.
 * PixiJS Graphics.arc() radyan ister. Y-flip world.scale.y=-1 ile yapildigindan
 * default counterclockwise=false bekleneni verir (DXF CCW → ekran CCW).
 *
 * Renk: gri (#94a3b8), stroke 0.8 — circles ile ayni stil.
 *
 * Tiklama: onLineClick callback'i tetiklenir — layer secimi (Shift+click ise
 * gizle/goster). Her arc icin invisible hit-target Graphics, dairenin tam
 * cevresinde 5px tolerance ile.
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
/** Hit-test tolerance — kullanici tikla buyuk yariciap'larda da rahatca isabet etsin. */
const HIT_TOLERANCE = 5;

export function createArcs(
  parent: Container,
  onLineClickRef: () => ((args: { layer: string; index: number; shiftKey: boolean }) => void) | undefined,
  wasDraggedRef: () => boolean,
): ArcsHandle {
  let g: Graphics | null = null;
  let hitGraphics: Graphics[] = [];

  function clearAll() {
    g?.destroy();
    g = null;
    for (const h of hitGraphics) h.destroy();
    hitGraphics = [];
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

    // Hit-test her arc icin (gorunmeyen ama tiklanabilir alan).
    // Yarim daire seklindeki stroke alani PixiJS hit-test'i ile zor — onun
    // yerine arc'in cizdigi yariciap cember alanini hit-zone olarak kullan.
    // Boyle bir circle ile arc cevresinde 5px tolerance ile tikla calisir.
    const hasClick = !!onLineClickRef();
    if (hasClick) {
      for (let i = 0; i < arcList.length; i++) {
        const a = arcList[i];
        const sa = (a.start_angle * Math.PI) / 180;
        const ea = (a.end_angle * Math.PI) / 180;
        const h = new Graphics();
        h.label = `hit-arc-${i}`;
        // Arc + tolerance — outer ring'i ciz, fill ile hit area yarat
        const outer = a.radius + HIT_TOLERANCE;
        const inner = Math.max(0, a.radius - HIT_TOLERANCE);
        // Yari donut alani: dis cember + ic cember (delik) → arc cevresi
        h.moveTo(
          a.center[0] + outer * Math.cos(sa),
          a.center[1] + outer * Math.sin(sa),
        );
        h.arc(a.center[0], a.center[1], outer, sa, ea);
        h.lineTo(
          a.center[0] + inner * Math.cos(ea),
          a.center[1] + inner * Math.sin(ea),
        );
        h.arc(a.center[0], a.center[1], inner, ea, sa, true);
        h.closePath();
        h.fill({ color: 0xffffff, alpha: 0.001 });
        h.eventMode = 'static';
        h.cursor = 'pointer';
        h.on('pointertap', (event) => {
          if (wasDraggedRef()) return;
          const cb = onLineClickRef();
          // Arc layer adi → onLineClick olarak rapor (workspace shift'i isler)
          cb?.({ layer: a.layer, index: 0, shiftKey: !!event.shiftKey });
        });
        parent.addChild(h);
        hitGraphics.push(h);
      }
    }
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
