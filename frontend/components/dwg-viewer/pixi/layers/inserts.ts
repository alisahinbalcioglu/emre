/**
 * Inserts layer — geometry.inserts (ekipman noktaları: vana, pompa, sprinkler
 * INSERT blokları, vs.)
 *
 * Mimari notu: Backend artik block geometrisini world-space'e expand ediyor
 * (LINE/CIRCLE/ARC). Yani sprinkler sembolu, vana profili, kollektor T'si
 * gercek sekliyle background katmanlarinda goruluyor. Bu katmanin gorsel
 * rolu silikleşti — sadece "isaretli ekipman" turuncu nokta olarak vurgulanir;
 * normal INSERT'ler icin hit-target gorunmez kalir (kullanici tikla → popup).
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
const RADIUS_NORMAL = 2;       // sadece hit-area boyutu icin referans
const HIT_RADIUS_MIN = 4;      // tikla kolayligi icin alt limit

export function createInserts(
  parent: Container,
  onInsertClickRef: () => ((args: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void) | undefined,
  wasDraggedRef: () => boolean,
): InsertsHandle {
  let gMarked: Graphics | null = null;
  let hitGraphics: Graphics[] = [];

  function clearAll() {
    gMarked?.destroy();
    gMarked = null;
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

    const markedList: GeometryInsert[] = [];
    for (const ins of inserts) {
      const key = `${ins.layer}:${ins.insert_index}`;
      if (marked?.has(key)) markedList.push(ins);
    }

    // Sadece kullanicinin işaretledigi ekipmanlar gorsel olarak vurgulanir.
    // Normal INSERT'lerin gorseli backgroundLines/circles/arcs/texts katmanlarinda
    // (block expansion ile) zaten cizildiginden burada nokta cizilmiyor.
    for (const ins of markedList) {
      gMarked.circle(ins.position[0], ins.position[1], RADIUS_MARKED);
    }
    gMarked.fill({ color: COLOR_MARKED });
    gMarked.stroke({ width: 0.5, color: 0xffffff });

    // Hit-test her INSERT icin (gorunmeyen ama tiklanabilir alan).
    if (hasClick) {
      for (const ins of inserts) {
        const key = `${ins.layer}:${ins.insert_index}`;
        const isMarked = marked?.has(key);
        const r = isMarked ? RADIUS_MARKED : RADIUS_NORMAL;
        const hitRadius = Math.max(r + 2, HIT_RADIUS_MIN);
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
