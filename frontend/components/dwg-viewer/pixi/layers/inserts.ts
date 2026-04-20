/**
 * Inserts layer — geometry.inserts (ekipman noktaları: vana, pompa, sprinkler
 * INSERT blokları, vs.)
 *
 * Render: küçük daire (r=2, işaretli için 3.5 + beyaz kontür).
 * Renk: işaretli ise turuncu (#f97316), değilse gri (#64748b).
 *
 * Etkileşim: onInsertClick → ekipman popup aç.
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
const COLOR_NORMAL = cssToHex('#64748b');
const RADIUS_MARKED = 3.5;
const RADIUS_NORMAL = 2;

export function createInserts(
  parent: Container,
  onInsertClickRef: () => ((args: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void) | undefined,
  wasDraggedRef: () => boolean,
): InsertsHandle {
  let gMarked: Graphics | null = null;
  let gNormal: Graphics | null = null;
  let hitGraphics: Graphics[] = [];

  function clearAll() {
    gMarked?.destroy();
    gNormal?.destroy();
    gMarked = null;
    gNormal = null;
    for (const h of hitGraphics) h.destroy();
    hitGraphics = [];
  }

  function update(opts: InsertsUpdateOpts) {
    clearAll();
    const inserts = opts.geometry?.inserts;
    if (!inserts || inserts.length === 0) return;

    const marked = opts.markedEquipmentKeys;
    const hasClick = !!onInsertClickRef();

    gMarked = new Graphics();
    gMarked.label = 'inserts-marked';
    gMarked.eventMode = 'passive';
    parent.addChild(gMarked);

    gNormal = new Graphics();
    gNormal.label = 'inserts-normal';
    gNormal.eventMode = 'passive';
    parent.addChild(gNormal);

    const markedList: GeometryInsert[] = [];
    const normalList: GeometryInsert[] = [];
    for (const ins of inserts) {
      const key = `${ins.layer}:${ins.insert_index}`;
      if (marked?.has(key)) markedList.push(ins);
      else normalList.push(ins);
    }

    for (const ins of markedList) {
      gMarked.circle(ins.position[0], ins.position[1], RADIUS_MARKED);
    }
    gMarked.fill({ color: COLOR_MARKED });
    gMarked.stroke({ width: 0.5, color: 0xffffff, pixelLine: true });

    for (const ins of normalList) {
      gNormal.circle(ins.position[0], ins.position[1], RADIUS_NORMAL);
    }
    gNormal.fill({ color: COLOR_NORMAL });

    // Hit-test per insert
    if (hasClick) {
      for (const ins of inserts) {
        const key = `${ins.layer}:${ins.insert_index}`;
        const isMarked = marked?.has(key);
        const r = isMarked ? RADIUS_MARKED : RADIUS_NORMAL;
        // Tıklama kolaylığı için hit alanı biraz geniş
        const hitRadius = Math.max(r + 2, 4);
        const h = new Graphics();
        h.label = `hit-ins-${ins.insert_index}`;
        h.circle(ins.position[0], ins.position[1], hitRadius);
        h.fill({ color: 0xffffff, alpha: 0.001 });
        h.eventMode = 'static';
        h.cursor = 'pointer';
        h.on('pointertap', () => {
          if (wasDraggedRef()) return;
          const cb = onInsertClickRef();
          cb?.({
            layer: ins.layer,
            insertIndex: ins.insert_index,
            insertName: ins.insert_name,
            position: ins.position,
          });
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
