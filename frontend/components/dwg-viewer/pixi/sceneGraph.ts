/**
 * Sahne grafigi — pixi-viewport + alt katmanlar.
 *
 * Hierarchy:
 *   stage
 *     viewport (pixi-viewport — pan/zoom, screen <-> world transform)
 *       lineLayer       — geometry.lines (per-DWG-layer)
 *       arcLayer        — geometry.arcs
 *       circleLayer     — geometry.circles
 *       insertLayer     — INSERT markers (marked equipment)
 *       calculatedEdges — boru segmentleri (cap-bazli renkli)
 *       textLayer       — TEXT/MTEXT (LOD)
 *       highlightLayer  — secili entity vurgusu (en ust)
 *
 * Y-flip stratejisi: pixi-viewport'la temiz calismak icin world-level flip
 * YOK. Render-time'da her koordinat `y → -y` cevriliyor (bkz lineRenderer
 * vb dosyalardaki yScreen helper'lari). Boylece viewport.getVisibleBounds()
 * direkt DWG coord'larina map'lenir (Y dahil) — sadece tek noktada negation.
 *
 * R-Tree culling: viewport bounds'i DWG koordinatina cevrilir, Worker'a
 * sorulur, donen visible ID'ler renderer'lara feed edilir.
 */

import { Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Application } from 'pixi.js';

export interface SceneLayers {
  viewport: Viewport;
  lineLayer: Container;
  arcLayer: Container;
  circleLayer: Container;
  insertLayer: Container;
  calculatedEdgesLayer: Container;
  textLayer: Container;
  highlightLayer: Container;
}

export function createScene(app: Application): SceneLayers {
  const viewport = new Viewport({
    screenWidth: app.screen.width,
    screenHeight: app.screen.height,
    worldWidth: 1_000_000,
    worldHeight: 1_000_000,
    events: app.renderer.events,
    passiveWheel: false,
  });

  // AutoCAD-vari pan/zoom — sol+orta tus drag, wheel zoom, pinch
  viewport
    .drag({ mouseButtons: 'left-middle' })
    .pinch()
    .wheel({ smooth: 4 })
    .decelerate({ friction: 0.92 });

  app.stage.addChild(viewport);

  // Alt katmanlar — z-order alttan uste, etkilesim YOK (hit-test merkezi)
  const layers: Array<[Container, string]> = [
    [new Container(), 'lineLayer'],
    [new Container(), 'arcLayer'],
    [new Container(), 'circleLayer'],
    [new Container(), 'insertLayer'],
    [new Container(), 'calculatedEdgesLayer'],
    [new Container(), 'textLayer'],
    [new Container(), 'highlightLayer'],
  ];
  for (const [c, label] of layers) {
    c.label = label;
    c.eventMode = 'none';
    viewport.addChild(c);
  }

  return {
    viewport,
    lineLayer: layers[0][0],
    arcLayer: layers[1][0],
    circleLayer: layers[2][0],
    insertLayer: layers[3][0],
    calculatedEdgesLayer: layers[4][0],
    textLayer: layers[5][0],
    highlightLayer: layers[6][0],
  };
}

/** Viewport'u DWG bounds'una sigdir.
 *  DWG bounds Y-up, pixi-viewport Y-down — center.y'yi negate ediyoruz. */
export function fitViewportToBounds(
  viewport: Viewport,
  bounds: [number, number, number, number],
  padding: number = 0.92,
): void {
  const [minX, minY, maxX, maxY] = bounds;
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return;

  const scaleX = viewport.screenWidth / w;
  const scaleY = viewport.screenHeight / h;
  const zoom = Math.min(scaleX, scaleY) * padding;
  if (!Number.isFinite(zoom) || zoom < 1e-9) return;

  viewport.setZoom(zoom, true);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  viewport.moveCenter(cx, -cy);
}

/** Viewport'un mevcut visible bbox'ini DWG koordinatlarinda ver.
 *  pixi-viewport getVisibleBounds() Y-down screen-aligned doner; biz Y-up
 *  DWG'ye cevirir, R-Tree'ye boyle sorarız. */
export function getViewportDwgBounds(viewport: Viewport): [number, number, number, number] {
  const r = viewport.getVisibleBounds();
  // r: { x, y, width, height } screen-aligned (Y-down)
  // DWG: Y-up, dolayisiyla minY/maxY ters
  const minX = r.x;
  const maxX = r.x + r.width;
  // Screen Y (down) → DWG Y (up): negation, sira da ters
  const minY = -(r.y + r.height);
  const maxY = -r.y;
  return [minX, minY, maxX, maxY];
}

/** DWG screen → DWG world (Y-flip). Viewport.toWorld + Y negate. */
export function viewportToDwg(
  viewport: Viewport,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const w = viewport.toWorld(screenX, screenY);
  return { x: w.x, y: -w.y };
}

/** DWG → render coord (Y-negate). Render fonksiyonlarinda kullanilir. */
export function yToScreen(yDwg: number): number {
  return -yDwg;
}
