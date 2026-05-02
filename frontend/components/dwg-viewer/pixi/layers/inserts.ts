/**
 * Inserts layer — geometry.inserts (ekipman noktaları: vana, pompa, sprinkler
 * INSERT blokları, vs.)
 *
 * SADECE GORSEL — hit-test merkezi RBush (pixi/hitTest.ts) ile yapilir.
 *
 * Mimari notu: Backend artik block geometrisini world-space'e expand ediyor
 * (LINE/CIRCLE/ARC). Yani sprinkler sembolu, vana profili, kollektor T'si
 * gercek sekliyle background katmanlarinda goruluyor. Bu katmanin gorsel
 * rolu silikleşti — sadece "isaretli ekipman" turuncu nokta olarak vurgulanir.
 */

import { Container, Graphics } from 'pixi.js';
import type { GeometryInsert, GeometryResult } from '../../types';
import { cssToHex } from '../color';

export interface InsertsUpdateOpts {
  geometry: GeometryResult | null;
  markedEquipmentKeys?: Set<string>;
}

export interface InsertsHandle {
  update(opts: InsertsUpdateOpts): void;
  destroy(): void;
}

const COLOR_MARKED = cssToHex('#f97316');
const RADIUS_MARKED = 3.5;

export function createInserts(parent: Container): InsertsHandle {
  let gMarked: Graphics | null = null;

  function clearAll() {
    gMarked?.destroy();
    gMarked = null;
  }

  function update(opts: InsertsUpdateOpts) {
    clearAll();
    const inserts = opts.geometry?.inserts;
    if (!inserts || inserts.length === 0) return;

    const marked = opts.markedEquipmentKeys;

    gMarked = new Graphics();
    gMarked.label = 'inserts-marked';
    parent.addChild(gMarked);

    const markedList: GeometryInsert[] = [];
    for (const ins of inserts) {
      const key = `${ins.layer}:${ins.insert_index}`;
      if (marked?.has(key)) markedList.push(ins);
    }

    // Sadece kullanicinin işaretledigi ekipmanlar gorsel olarak vurgulanir.
    for (const ins of markedList) {
      gMarked.circle(ins.position[0], ins.position[1], RADIUS_MARKED);
    }
    gMarked.fill({ color: COLOR_MARKED });
    gMarked.stroke({ width: 0.5, color: 0xffffff, pixelLine: true });
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
