/**
 * World container — pan/zoom transform bu container'a uygulanır.
 * Tüm çizim katmanları (lines, edges, circles, inserts, texts) bunun altına eklenir.
 *
 * Y-flip: DWG koordinat sistemi Y↑, canvas Y↓. `scale.y = -zoom` ile ters çeviriyoruz.
 * useViewport hook'undan gelen panX/panY/zoom değerleri applyViewport ile aktarılır.
 */

import { Container } from 'pixi.js';

export interface WorldLayers {
  world: Container;
  /** Arka plan grid (en altta, AutoCAD-vari kareli zemin). */
  grid: Container;
  backgroundLines: Container;
  calculatedEdges: Container;
  /** Block icinden gelen yariciap yaylar — circles ile ayni stil, daha alt z. */
  arcs: Container;
  circles: Container;
  inserts: Container;
  texts: Container;
}

/**
 * Root world + sabit z-sıralı alt katmanlar.
 * Her katman kendi içeriğini yönetir; silip yeniden çizmek bağımsız olur.
 */
export function createWorld(): WorldLayers {
  const world = new Container();
  world.label = 'world';
  world.eventMode = 'static';
  world.sortableChildren = false;

  // ─── Alt katmanlar: 'passive' — etkilesim yok ama event traversal kalir.
  // Hit-test RBush + pickEntityAt ile yapilir (world.eventMode='static' tek
  // pointertap'i alir). 'passive' guvenli kalir cunku alt katmanlarda zaten
  // 'static' child yok — dispatch dogal olarak world'e cikar.

  const grid = new Container();
  grid.label = 'grid';
  grid.eventMode = 'none';

  const backgroundLines = new Container();
  backgroundLines.label = 'backgroundLines';
  backgroundLines.eventMode = 'passive';

  const calculatedEdges = new Container();
  calculatedEdges.label = 'calculatedEdges';
  calculatedEdges.eventMode = 'passive';

  const arcs = new Container();
  arcs.label = 'arcs';
  arcs.eventMode = 'passive';

  const circles = new Container();
  circles.label = 'circles';
  circles.eventMode = 'passive';

  const inserts = new Container();
  inserts.label = 'inserts';
  inserts.eventMode = 'passive';

  const texts = new Container();
  texts.label = 'texts';
  texts.eventMode = 'none';

  // Render sırası (alttan üste): grid → background → calculatedEdges → arcs → circles → inserts → texts
  world.addChild(grid);
  world.addChild(backgroundLines);
  world.addChild(calculatedEdges);
  world.addChild(arcs);
  world.addChild(circles);
  world.addChild(inserts);
  world.addChild(texts);

  return { world, grid, backgroundLines, calculatedEdges, arcs, circles, inserts, texts };
}

/**
 * useViewport state'ini (panX, panY, zoom) world container'a uygular.
 * Y-flip: scale.y negatif — DWG Y↑ → canvas Y↓.
 */
export function applyViewport(world: Container, panX: number, panY: number, zoom: number): void {
  world.position.set(panX, panY);
  world.scale.set(zoom, -zoom);
}
