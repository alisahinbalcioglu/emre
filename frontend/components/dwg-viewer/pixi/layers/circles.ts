/**
 * Circles layer — geometry.circles (sprinkler kafaları, sembol çemberleri).
 *
 * Renk kuralı:
 *   - sprinklerLayers içinde ise: turkuaz (#22d3ee), stroke 1.6
 *   - diğer: gri (#94a3b8), stroke 0.8
 *
 * Etkileşim: onCircleClick verilmişse tıklanabilir — drag olduysa yutulur.
 */

import { Container, Graphics } from 'pixi.js';
import type { GeometryCircle, GeometryResult } from '../../types';
import { cssToHex } from '../color';

export interface CirclesUpdateOpts {
  geometry: GeometryResult | null;
  sprinklerLayers?: Set<string>;
}

export interface CirclesHandle {
  update(opts: CirclesUpdateOpts): void;
  destroy(): void;
}

const COLOR_SPRINKLER = cssToHex('#22d3ee');
const COLOR_NORMAL = cssToHex('#94a3b8');
const WIDTH_SPRINKLER = 1.6;
const WIDTH_NORMAL = 0.8;

export function createCircles(
  parent: Container,
  onCircleClickRef: () => ((c: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void) | undefined,
  wasDraggedRef: () => boolean,
): CirclesHandle {
  /** İki Graphics: biri sprinkler, biri normal — batch */
  let gSprinkler: Graphics | null = null;
  let gNormal: Graphics | null = null;
  /** Her circle için ayrı hit graphic (tıklanabilir) */
  let hitGraphics: Graphics[] = [];

  function clearAll() {
    gSprinkler?.destroy();
    gNormal?.destroy();
    gSprinkler = null;
    gNormal = null;
    for (const h of hitGraphics) h.destroy();
    hitGraphics = [];
  }

  function update(opts: CirclesUpdateOpts) {
    clearAll();
    const circles = opts.geometry?.circles;
    if (!circles || circles.length === 0) return;

    const sprinklerSet = opts.sprinklerLayers;
    const hasClick = !!onCircleClickRef();

    gSprinkler = new Graphics();
    gSprinkler.label = 'circles-sprinkler';
    gSprinkler.eventMode = 'passive';
    parent.addChild(gSprinkler);

    gNormal = new Graphics();
    gNormal.label = 'circles-normal';
    gNormal.eventMode = 'passive';
    parent.addChild(gNormal);

    const sprinklerList: GeometryCircle[] = [];
    const normalList: GeometryCircle[] = [];
    for (const c of circles) {
      if (sprinklerSet?.has(c.layer)) sprinklerList.push(c);
      else normalList.push(c);
    }

    for (const c of sprinklerList) {
      gSprinkler.circle(c.center[0], c.center[1], c.radius);
    }
    gSprinkler.stroke({ width: WIDTH_SPRINKLER, color: COLOR_SPRINKLER, pixelLine: true });

    for (const c of normalList) {
      gNormal.circle(c.center[0], c.center[1], c.radius);
    }
    gNormal.stroke({ width: WIDTH_NORMAL, color: COLOR_NORMAL, pixelLine: true });

    // Hit-test — her circle ayrı (tıklama bağlamı için)
    if (hasClick) {
      for (const c of circles) {
        const h = new Graphics();
        h.label = `hit-circle-${c.circle_index}`;
        h.circle(c.center[0], c.center[1], c.radius);
        h.fill({ color: 0xffffff, alpha: 0.001 }); // hit area
        h.eventMode = 'static';
        h.cursor = 'pointer';
        h.on('pointertap', () => {
          if (wasDraggedRef()) return;
          const cb = onCircleClickRef();
          cb?.({
            layer: c.layer,
            circleIndex: c.circle_index,
            center: c.center,
            radius: c.radius,
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
