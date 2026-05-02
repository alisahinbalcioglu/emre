/**
 * Texts layer — TEXT/MTEXT etiketleri (çap notları, ölçü, başlık).
 *
 * SADECE GORSEL — hit-test merkezi RBush (pixi/hitTest.ts) ile yapilir.
 *
 * LOD (Level of Detail):
 *   - Zoom < 0.3: hiç render etme (binlerce text memory yemesin)
 *   - Zoom >= 0.3: tüm text'leri render et
 *
 * Y-flip: world scale.y negatif olduğu için text ters döner; lokal scale.y=-1
 * ile geri çeviririz (SVG'deki `scale(1 -1)` muadili).
 */

import { Container, Text, TextStyle } from 'pixi.js';
import type { GeometryResult } from '../../types';
import { cssToHex } from '../color';

export interface TextsUpdateOpts {
  geometry: GeometryResult | null;
  /** Mevcut zoom seviyesi — LOD kararı için */
  zoom: number;
}

export interface TextsHandle {
  update(opts: TextsUpdateOpts): void;
  destroy(): void;
}

const COLOR_AMBER = cssToHex('#fbbf24');
const LOD_THRESHOLD = 0.3;
/** Çok zoom'da bile maksimum 1500 text render — memory güvencesi */
const MAX_TEXT_RENDER = 1500;

export function createTexts(parent: Container): TextsHandle {
  let sprites: Text[] = [];
  let lastSignature = '';

  function clearAll() {
    for (const s of sprites) s.destroy();
    sprites = [];
  }

  function update(opts: TextsUpdateOpts) {
    const { geometry, zoom } = opts;
    const lodVisible = zoom >= LOD_THRESHOLD;

    // Cache: aynı geometry + aynı LOD → rebuild etme
    const sig = `${geometry?.texts?.length ?? 0}|${lodVisible ? '1' : '0'}`;
    if (sig === lastSignature) return;
    lastSignature = sig;

    clearAll();

    if (!geometry || !lodVisible) return;
    const texts = geometry.texts;
    if (!texts || texts.length === 0) return;

    const limit = Math.min(texts.length, MAX_TEXT_RENDER);
    for (let i = 0; i < limit; i++) {
      const t = texts[i];
      if (!t.text) continue;
      const style = new TextStyle({
        fill: COLOR_AMBER,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: Math.max(t.height, 1),
      });
      const sprite = new Text({ text: t.text, style });
      sprite.position.set(t.position[0], t.position[1]);
      sprite.scale.set(1, -1);
      if (t.rotation) {
        sprite.rotation = (-t.rotation * Math.PI) / 180;
      }
      parent.addChild(sprite);
      sprites.push(sprite);
    }
  }

  function destroy() {
    clearAll();
    lastSignature = '';
  }

  return { update, destroy };
}
