/**
 * Symbol renderer — CIRCLE / ARC / INSERT marker / TEXT.
 *
 * Mimari:
 *   - Circles: per-DWG-layer Graphics; sprinkler layer'lar turkuaz, diger gri.
 *   - Arcs: tek Graphics (tum yaylar). Renk gri.
 *   - INSERT markers: SADECE markedEquipment turuncu nokta. Block icerigi
 *     zaten lineRenderer'da expand edilmis. Buradaki amac kullanici secimi.
 *   - Texts: PIXI.Text sprite'lari. LOD: zoom < 0.3'te render yok.
 *
 * Y-flip: render-time `yToScreen(y)` her vertex'te uygulanir.
 *
 * Visibility: Worker visible ID set'inden gelen culling. Layer visibility
 * (hidden/isolated): per-layer Graphics container'da `.visible = false`.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GeometryArc, GeometryCircle, GeometryInsert, GeometryText } from '../types';
import { yToScreen } from './sceneGraph';
import { cssToHex } from './color';

const COLOR_SPRINKLER = cssToHex('#22d3ee');
const COLOR_NORMAL = cssToHex('#94a3b8');
const COLOR_TEXT = cssToHex('#fbbf24');
const COLOR_MARKED_INSERT = cssToHex('#f97316');
const RADIUS_INSERT_MARKER = 3;
const LOD_TEXT_THRESHOLD = 0.3;
const MAX_TEXT_RENDER = 2000;

// ─── Circles ─────────────────────────────────────────────────────────

export interface CircleRendererOpts {
  circles: GeometryCircle[];
  sprinklerLayers?: Set<string>;
}

export interface CircleRendererHandle {
  setVisibleIds(ids: Set<string>): void;
  applyLayerVisibility(isVisible: (layer: string) => boolean): void;
  destroy(): void;
}

export function createCircleRenderer(
  parent: Container,
  opts: CircleRendererOpts,
): CircleRendererHandle {
  const { circles, sprinklerLayers } = opts;
  const layerGraphics = new Map<string, Graphics>();
  const layerCircleIndices = new Map<string, number[]>();

  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];
    let arr = layerCircleIndices.get(c.layer);
    if (!arr) {
      arr = [];
      layerCircleIndices.set(c.layer, arr);
    }
    arr.push(i);
  }
  layerCircleIndices.forEach((_, layer) => {
    const g = new Graphics();
    g.label = `circle-${layer}`;
    parent.addChild(g);
    layerGraphics.set(layer, g);
  });

  function renderLayer(layer: string, indices: number[]) {
    const g = layerGraphics.get(layer);
    if (!g) return;
    g.clear();
    if (indices.length === 0) return;
    for (const idx of indices) {
      const c = circles[idx];
      if (!c) continue;
      g.circle(c.center[0], yToScreen(c.center[1]), c.radius);
    }
    const isSprinkler = sprinklerLayers?.has(layer) ?? false;
    g.stroke({
      width: isSprinkler ? 1.6 : 0.8,
      color: isSprinkler ? COLOR_SPRINKLER : COLOR_NORMAL,
      // pixelLine kaldirildi (v8.18 shader bug)
    });
  }

  function setVisibleIds(visibleIds: Set<string>) {
    const visiblePerLayer = new Map<string, number[]>();
    visibleIds.forEach((id) => {
      if (!id.startsWith('circle.')) return;
      const idx = Number(id.slice(7));
      if (!Number.isFinite(idx)) return;
      const c = circles[idx];
      if (!c) return;
      let arr = visiblePerLayer.get(c.layer);
      if (!arr) {
        arr = [];
        visiblePerLayer.set(c.layer, arr);
      }
      arr.push(idx);
    });
    layerGraphics.forEach((_, layer) => {
      renderLayer(layer, visiblePerLayer.get(layer) ?? []);
    });
  }

  function applyLayerVisibility(isVisible: (layer: string) => boolean) {
    layerGraphics.forEach((g, layer) => { g.visible = isVisible(layer); });
  }

  function destroy() {
    layerGraphics.forEach((g) => g.destroy());
    layerGraphics.clear();
  }

  return { setVisibleIds, applyLayerVisibility, destroy };
}

// ─── Arcs ────────────────────────────────────────────────────────────

export interface ArcRendererOpts {
  arcs: GeometryArc[];
}

export interface ArcRendererHandle {
  setVisibleIds(ids: Set<string>): void;
  applyLayerVisibility(isVisible: (layer: string) => boolean): void;
  destroy(): void;
}

export function createArcRenderer(
  parent: Container,
  opts: ArcRendererOpts,
): ArcRendererHandle {
  const { arcs } = opts;
  const layerGraphics = new Map<string, Graphics>();
  const layerArcIndices = new Map<string, number[]>();

  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i];
    let arr = layerArcIndices.get(a.layer);
    if (!arr) {
      arr = [];
      layerArcIndices.set(a.layer, arr);
    }
    arr.push(i);
  }
  layerArcIndices.forEach((_, layer) => {
    const g = new Graphics();
    g.label = `arc-${layer}`;
    parent.addChild(g);
    layerGraphics.set(layer, g);
  });

  function renderLayer(layer: string, indices: number[]) {
    const g = layerGraphics.get(layer);
    if (!g) return;
    g.clear();
    if (indices.length === 0) return;
    for (const idx of indices) {
      const a = arcs[idx];
      if (!a) continue;
      // Y-flip: ARC center'ini cevir, acilari da ters cevirmek lazim cunku
      // Y-flip rotation yonunu degistirir. Pratikte: -start/-end ve swap.
      const sa = (-a.start_angle * Math.PI) / 180;
      const ea = (-a.end_angle * Math.PI) / 180;
      g.moveTo(a.center[0] + a.radius * Math.cos(ea), yToScreen(a.center[1]) + a.radius * Math.sin(ea));
      g.arc(a.center[0], yToScreen(a.center[1]), a.radius, ea, sa);
    }
    g.stroke({ width: 0.8, color: COLOR_NORMAL });
  }

  function setVisibleIds(visibleIds: Set<string>) {
    const visiblePerLayer = new Map<string, number[]>();
    visibleIds.forEach((id) => {
      if (!id.startsWith('arc.')) return;
      const idx = Number(id.slice(4));
      if (!Number.isFinite(idx)) return;
      const a = arcs[idx];
      if (!a) return;
      let arr = visiblePerLayer.get(a.layer);
      if (!arr) {
        arr = [];
        visiblePerLayer.set(a.layer, arr);
      }
      arr.push(idx);
    });
    layerGraphics.forEach((_, layer) => {
      renderLayer(layer, visiblePerLayer.get(layer) ?? []);
    });
  }

  function applyLayerVisibility(isVisible: (layer: string) => boolean) {
    layerGraphics.forEach((g, layer) => { g.visible = isVisible(layer); });
  }

  function destroy() {
    layerGraphics.forEach((g) => g.destroy());
    layerGraphics.clear();
  }

  return { setVisibleIds, applyLayerVisibility, destroy };
}

// ─── INSERT markers (sadece marked equipment turuncu nokta) ──────────

export interface InsertRendererOpts {
  inserts: GeometryInsert[];
}

export interface InsertRendererHandle {
  setMarkedKeys(keys: Set<string>): void;
  destroy(): void;
}

export function createInsertRenderer(
  parent: Container,
  opts: InsertRendererOpts,
): InsertRendererHandle {
  const { inserts } = opts;
  const g = new Graphics();
  g.label = 'inserts-marked';
  parent.addChild(g);

  function setMarkedKeys(keys: Set<string>) {
    g.clear();
    if (keys.size === 0) return;
    for (const ins of inserts) {
      const key = `${ins.layer}:${ins.insert_index}`;
      if (!keys.has(key)) continue;
      g.circle(ins.position[0], yToScreen(ins.position[1]), RADIUS_INSERT_MARKER);
    }
    g.fill({ color: COLOR_MARKED_INSERT });
    g.stroke({ width: 0.5, color: 0xffffff });
  }

  function destroy() {
    g.destroy();
  }

  return { setMarkedKeys, destroy };
}

// ─── Texts (LOD'lu) ───────────────────────────────────────────────────

export interface TextRendererOpts {
  texts: GeometryText[];
}

export interface TextRendererHandle {
  /** Zoom degisince LOD karari + text rebuild. */
  setZoom(zoom: number): void;
  applyLayerVisibility(isVisible: (layer: string) => boolean): void;
  destroy(): void;
}

export function createTextRenderer(
  parent: Container,
  opts: TextRendererOpts,
): TextRendererHandle {
  const { texts } = opts;
  let sprites: Array<{ sprite: Text; layer: string }> = [];
  let lastLodVisible: boolean | null = null;

  function clearAll() {
    for (const s of sprites) s.sprite.destroy();
    sprites = [];
  }

  function setZoom(zoom: number) {
    const lodVisible = zoom >= LOD_TEXT_THRESHOLD;
    if (lastLodVisible === lodVisible) return;
    lastLodVisible = lodVisible;
    clearAll();
    if (!lodVisible) return;

    const limit = Math.min(texts.length, MAX_TEXT_RENDER);
    for (let i = 0; i < limit; i++) {
      const t = texts[i];
      if (!t.text) continue;
      const style = new TextStyle({
        fill: COLOR_TEXT,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: Math.max(t.height, 1),
      });
      const sprite = new Text({ text: t.text, style });
      sprite.position.set(t.position[0], yToScreen(t.position[1]));
      // Y-flip text icin: sprite scale.y = -1 ile yazi dogru tarafa cevriliyor
      sprite.scale.set(1, -1);
      if (t.rotation) sprite.rotation = (-t.rotation * Math.PI) / 180;
      parent.addChild(sprite);
      sprites.push({ sprite, layer: t.layer });
    }
  }

  function applyLayerVisibility(isVisible: (layer: string) => boolean) {
    for (const s of sprites) s.sprite.visible = isVisible(s.layer);
  }

  function destroy() {
    clearAll();
  }

  return { setZoom, applyLayerVisibility, destroy };
}
