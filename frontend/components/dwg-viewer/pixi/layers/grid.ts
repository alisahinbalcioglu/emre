/**
 * Arka plan grid layer — AutoCAD klasik kareli zemin.
 *
 * Iki kademeli:
 *   - Minor (10 birim): #1e293b slate-800, ince (sadece zoom >= 0.5)
 *   - Major (100 birim): #334155 slate-700, biraz daha kalin (zoom >= 0.05)
 *
 * Zoom-aware width: stroke kalinligi `1 / zoom` ile dunya birimine cevrilir
 * → ekranda her zaman 1 piksel goruntu (backgroundLines ile ayni mantik).
 *
 * Grid bounds: DWG'nin bounds'una gore çizilir. Çok cok zoom-out edilince
 * grid kaybolur (zoom < 0.05) cunku ekran cok kucuk grid hucresi gorur.
 */

import { Container, Graphics } from 'pixi.js';
import { cssToHex } from '../color';

export interface GridUpdateOpts {
  /** Dunya space bounds [minX, minY, maxX, maxY] — DWG'nin bbox'i. */
  bounds: [number, number, number, number] | null;
  /** Mevcut zoom (world.scale.x). LOD ve width hesabi icin kullanilir. */
  zoom: number;
  /** Goruntu acik mi? Kullanici toolbar'dan toggle edebilir. */
  visible: boolean;
}

export interface GridHandle {
  update(opts: GridUpdateOpts): void;
  destroy(): void;
}

const COLOR_MINOR = cssToHex('#1e293b'); // slate-800
const COLOR_MAJOR = cssToHex('#334155'); // slate-700
const MINOR_STEP = 10;
const MAJOR_STEP = 100;

export function createGrid(parent: Container): GridHandle {
  const minorG = new Graphics();
  minorG.label = 'grid-minor';
  minorG.eventMode = 'none';
  parent.addChild(minorG);

  const majorG = new Graphics();
  majorG.label = 'grid-major';
  majorG.eventMode = 'none';
  parent.addChild(majorG);

  function update(opts: GridUpdateOpts) {
    minorG.clear();
    majorG.clear();

    if (!opts.visible || !opts.bounds) return;
    const z = opts.zoom;
    if (!Number.isFinite(z) || z < 0.05) return; // cok zoom-out → grid kapali

    const [minX, minY, maxX, maxY] = opts.bounds;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    // Cok buyuk DWG'lerde grid line sayisi patlamasin: hucre sayisi 500'u
    // gecerse step otomatik 10x buyutulur. Tipik mimari plan 30K x 5K → 300x50
    // major hucre, OK. Mega site planlari (1M x 1M) icin step otomatik artar.
    let minorStep = MINOR_STEP;
    let majorStep = MAJOR_STEP;
    while (w / majorStep > 500) {
      minorStep *= 10;
      majorStep *= 10;
    }

    const showMinor = z >= 0.5;
    const minorWidth = 1 / z; // 1 piksel ekran kalinligi
    const majorWidth = 1.2 / z;

    // Minor grid (sadece yakin zoom)
    if (showMinor) {
      const xs = Math.floor(minX / minorStep) * minorStep;
      for (let x = xs; x <= maxX; x += minorStep) {
        if (x % majorStep === 0) continue; // major ile cakisan satirlari atla
        minorG.moveTo(x, minY).lineTo(x, maxY);
      }
      const ys = Math.floor(minY / minorStep) * minorStep;
      for (let y = ys; y <= maxY; y += minorStep) {
        if (y % majorStep === 0) continue;
        minorG.moveTo(minX, y).lineTo(maxX, y);
      }
      minorG.stroke({ width: minorWidth, color: COLOR_MINOR, alpha: 1 });
    }

    // Major grid (her zoom'da goster)
    const xsM = Math.floor(minX / majorStep) * majorStep;
    for (let x = xsM; x <= maxX; x += majorStep) {
      majorG.moveTo(x, minY).lineTo(x, maxY);
    }
    const ysM = Math.floor(minY / majorStep) * majorStep;
    for (let y = ysM; y <= maxY; y += majorStep) {
      majorG.moveTo(minX, y).lineTo(maxX, y);
    }
    majorG.stroke({ width: majorWidth, color: COLOR_MAJOR, alpha: 1 });
  }

  function destroy() {
    minorG.destroy();
    majorG.destroy();
  }

  return { update, destroy };
}
