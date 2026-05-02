/**
 * Circles layer — geometry.circles (sprinkler kafaları, sembol çemberleri).
 *
 * SADECE GORSEL — hit-test merkezi RBush (pixi/hitTest.ts) ile yapilir.
 *
 * Renk kuralı:
 *   - sprinklerLayers içinde ise: turkuaz (#22d3ee), stroke 1.6
 *   - diğer: gri (#94a3b8), stroke 0.8
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

export function createCircles(parent: Container): CirclesHandle {
  /** Iki Graphics: biri sprinkler, biri normal — batch */
  let gSprinkler: Graphics | null = null;
  let gNormal: Graphics | null = null;

  function clearAll() {
    gSprinkler?.destroy();
    gNormal?.destroy();
    gSprinkler = null;
    gNormal = null;
  }

  function update(opts: CirclesUpdateOpts) {
    clearAll();
    const circles = opts.geometry?.circles;
    if (!circles || circles.length === 0) return;

    const sprinklerSet = opts.sprinklerLayers;

    gSprinkler = new Graphics();
    gSprinkler.label = 'circles-sprinkler';
    parent.addChild(gSprinkler);

    gNormal = new Graphics();
    gNormal.label = 'circles-normal';
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
  }

  function destroy() {
    clearAll();
  }

  return { update, destroy };
}
