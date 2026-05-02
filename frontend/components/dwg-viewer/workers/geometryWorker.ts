/**
 * Geometry Worker — DXF parse, RBush spatial index, hit-test, viewport culling.
 * Off main thread; UI freeze yok.
 *
 * Dahili state:
 *   - tree: RBush spatial index (bbox + canonical_entity_id)
 *   - entities: Map<canonical_entity_id, Entity> — full data
 *   - blockGroups: Map<parent_block_id, canonical_entity_id[]> — equipment selection
 *   - hiddenLayers: Set<string>
 *   - isolatedLayer: string | null
 *
 * API: postMessage tabanli typed RPC (bkz workers/types.ts).
 */

/// <reference lib="webworker" />

import RBush from 'rbush';
import type {
  GeometryResult,
  GeometryLine,
  GeometryCircle,
  GeometryArc,
  GeometryInsert,
  GeometryText,
  EntityRef,
  EntityType,
  PickResult,
} from '../types';
import type { WorkerRequest, WorkerResponse } from './types';

interface IndexEntry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

type EntityData =
  | { type: 'line'; data: GeometryLine; index: number }
  | { type: 'circle'; data: GeometryCircle; index: number }
  | { type: 'arc'; data: GeometryArc; index: number }
  | { type: 'insert'; data: GeometryInsert; index: number }
  | { type: 'text'; data: GeometryText; index: number };

interface Entity {
  ref: EntityRef;
  payload: EntityData;
}

// ─── Worker state ────────────────────────────────────────────────────
const tree = new RBush<IndexEntry>(16);
let entities: Map<string, Entity> = new Map();
let blockGroups: Map<string, string[]> = new Map();
let hiddenLayers: Set<string> = new Set();
let isolatedLayer: string | null = null;
let layerNames: string[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────

/** Layer visibility filter — hidden veya isolate dışı layer'lar gizli. */
function isLayerVisible(layer: string): boolean {
  if (isolatedLayer !== null) return layer === isolatedLayer;
  return !hiddenLayers.has(layer);
}

/** Type prefix'ten array index parse: "line.42" → 42 */
function parseId(id: string): number | null {
  const dotIdx = id.indexOf('.');
  if (dotIdx < 0) return null;
  const n = Number(id.slice(dotIdx + 1));
  return Number.isFinite(n) ? n : null;
}

/** Index'i RBush'tan ve map'ten temizle, blockGroups'tan da. */
function clearAll() {
  tree.clear();
  entities.clear();
  blockGroups.clear();
  hiddenLayers = new Set();
  isolatedLayer = null;
  layerNames = [];
}

// ─── Hit-test geometri matematigi ─────────────────────────────────────

/** Nokta -> segment mesafesi (clamp'li orthogonal projeksiyon). */
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Nokta -> CIRCLE: ring distance, dolu cember icinde 0. */
function distanceToCircle(
  px: number, py: number, c: GeometryCircle, tol: number,
): number | null {
  const [cx, cy] = c.center;
  const distToCenter = Math.hypot(px - cx, py - cy);
  if (distToCenter <= c.radius) return 0; // ic = sembol secimi
  const ringDist = distToCenter - c.radius;
  return ringDist <= tol ? ringDist : null;
}

/** Nokta -> ARC: cevreden mesafe + acisal range. */
function distanceToArc(
  px: number, py: number, a: GeometryArc, tol: number,
): number | null {
  const [cx, cy] = a.center;
  const dx = px - cx;
  const dy = py - cy;
  const distToCenter = Math.hypot(dx, dy);
  const ringDist = Math.abs(distToCenter - a.radius);
  if (ringDist > tol) return null;

  const angDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const sa = ((a.start_angle % 360) + 360) % 360;
  const ea = ((a.end_angle % 360) + 360) % 360;
  const inRange = sa <= ea ? (angDeg >= sa && angDeg <= ea) : (angDeg >= sa || angDeg <= ea);
  return inRange ? ringDist : null;
}

/** Bbox'a olan en kisa mesafe (cikinti varsa). 0 = icinde. */
function distanceToBbox(
  px: number, py: number, b: [number, number, number, number],
): number {
  const [minX, minY, maxX, maxY] = b;
  const dx = px < minX ? minX - px : px > maxX ? px - maxX : 0;
  const dy = py < minY ? minY - py : py > maxY ? py - maxY : 0;
  return Math.hypot(dx, dy);
}

/** Tip-bazli kesin mesafe — bbox aday'i icin gercek hit kontrolu. */
function exactDistance(
  px: number, py: number, ent: Entity, tol: number,
): number | null {
  switch (ent.payload.type) {
    case 'line': {
      const ln = ent.payload.data;
      const [x1, y1, x2, y2] = ln.coords;
      const d = pointToSegmentDistance(px, py, x1, y1, x2, y2);
      return d <= tol ? d : null;
    }
    case 'circle':
      return distanceToCircle(px, py, ent.payload.data, tol);
    case 'arc':
      return distanceToArc(px, py, ent.payload.data, tol);
    case 'insert':
    case 'text':
      // INSERT/TEXT bbox-bazli; bbox icindeyse 0, kenardan tol icindeyse mesafe
      const d = distanceToBbox(px, py, ent.ref.bbox);
      return d <= tol ? d : null;
  }
}

/** Tip oncelikleri — ayni nokta'da cakisma → ekipman > sembol > yay > metin > segment > cizgi */
const TYPE_PRIORITY: Record<EntityType, number> = {
  insert: 100,
  circle: 90,
  arc: 80,
  text: 70,
  line: 50,
};

// ─── Public API ──────────────────────────────────────────────────────

function load(geometry: GeometryResult): { layerNames: string[]; entityCount: number } {
  clearAll();

  const refs = geometry.entity_index ?? [];
  const insertEntries: IndexEntry[] = [];

  for (const ref of refs) {
    const idx = parseId(ref.canonical_entity_id);
    if (idx === null) continue;

    let payload: EntityData | null = null;
    switch (ref.type) {
      case 'line':
        if (geometry.lines[idx]) payload = { type: 'line', data: geometry.lines[idx], index: idx };
        break;
      case 'circle':
        if (geometry.circles[idx]) payload = { type: 'circle', data: geometry.circles[idx], index: idx };
        break;
      case 'arc':
        if (geometry.arcs[idx]) payload = { type: 'arc', data: geometry.arcs[idx], index: idx };
        break;
      case 'insert':
        if (geometry.inserts[idx]) payload = { type: 'insert', data: geometry.inserts[idx], index: idx };
        break;
      case 'text':
        if (geometry.texts[idx]) payload = { type: 'text', data: geometry.texts[idx], index: idx };
        break;
    }
    if (!payload) continue;

    const entity: Entity = { ref, payload };
    entities.set(ref.canonical_entity_id, entity);

    insertEntries.push({
      minX: ref.bbox[0],
      minY: ref.bbox[1],
      maxX: ref.bbox[2],
      maxY: ref.bbox[3],
      id: ref.canonical_entity_id,
    });

    // Block group registry — equipment butunsel selection icin
    if (ref.parent_block_id) {
      let arr = blockGroups.get(ref.parent_block_id);
      if (!arr) {
        arr = [];
        blockGroups.set(ref.parent_block_id, arr);
      }
      arr.push(ref.canonical_entity_id);
    }
  }

  // Bulk insert — tek seferde optimal RBush packing
  if (insertEntries.length > 0) tree.load(insertEntries);

  layerNames = Object.keys(geometry.layer_colors ?? {});
  return { layerNames, entityCount: insertEntries.length };
}

/** Viewport bbox'i icindeki gorunur entity id'leri.
 *  Hidden + isolated filter uygulanir. R-Tree culling icin.
 */
function queryViewport(bbox: [number, number, number, number]): string[] {
  const [minX, minY, maxX, maxY] = bbox;
  const candidates = tree.search({ minX, minY, maxX, maxY });
  const visible: string[] = [];
  for (const c of candidates) {
    const ent = entities.get(c.id);
    if (!ent) continue;
    if (!isLayerVisible(ent.ref.layer_name)) continue;
    visible.push(c.id);
  }
  return visible;
}

/** Tikla noktasinda en yakin entity. Bbox sorgu + exact-test + priority tie-break. */
function pick(worldX: number, worldY: number, zoom: number): PickResult | null {
  if (entities.size === 0) return null;
  const safeZoom = zoom > 1e-8 ? zoom : 1;
  const tolWorld = 8 / safeZoom; // 8 ekran piksel toleransi

  // 1) Bbox sorgu
  const candidates = tree.search({
    minX: worldX - tolWorld,
    minY: worldY - tolWorld,
    maxX: worldX + tolWorld,
    maxY: worldY + tolWorld,
  });
  if (candidates.length === 0) return null;

  // 2) Exact-test + priority tie-break
  let best: Entity | null = null;
  let bestDist = Infinity;
  let bestPriority = -1;
  const epsilon = tolWorld * 0.25;

  for (const c of candidates) {
    const ent = entities.get(c.id);
    if (!ent) continue;
    if (!isLayerVisible(ent.ref.layer_name)) continue;

    const dist = exactDistance(worldX, worldY, ent, tolWorld);
    if (dist === null) continue;

    const priority = TYPE_PRIORITY[ent.ref.type];
    if (dist + epsilon < bestDist) {
      best = ent;
      bestDist = dist;
      bestPriority = priority;
    } else if (Math.abs(dist - bestDist) <= epsilon && priority > bestPriority) {
      best = ent;
      bestDist = dist;
      bestPriority = priority;
    }
  }

  if (!best) return null;

  // 3) Equipment grouping — parent_block_id varsa tum kardesleri don
  const groupIds = best.ref.parent_block_id
    ? (blockGroups.get(best.ref.parent_block_id) ?? [best.ref.canonical_entity_id])
    : [best.ref.canonical_entity_id];

  return {
    canonical_entity_id: best.ref.canonical_entity_id,
    type: best.ref.type,
    layer_name: best.ref.layer_name,
    group_entity_ids: groupIds,
    distance: bestDist,
  };
}

/** parent_block_id'ye gore ilgili tum entity'leri don.
 *  Selected highlight kalici (pan/zoom sirasinda) gosterilirken kullanilir. */
function getRelated(parentBlockId: string): string[] {
  return blockGroups.get(parentBlockId) ?? [];
}

// ─── Message handler ─────────────────────────────────────────────────

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    let res: WorkerResponse;
    switch (req.kind) {
      case 'load': {
        const r = load(req.geometry);
        res = { id: req.id, kind: 'loaded', layerNames: r.layerNames, entityCount: r.entityCount };
        break;
      }
      case 'queryViewport': {
        const ids = queryViewport(req.bbox);
        res = { id: req.id, kind: 'visibleIds', ids };
        break;
      }
      case 'pick': {
        const result = pick(req.worldX, req.worldY, req.zoom);
        res = { id: req.id, kind: 'pickResult', result };
        break;
      }
      case 'setHidden': {
        hiddenLayers = new Set(req.layers);
        res = { id: req.id, kind: 'ack' };
        break;
      }
      case 'setIsolated': {
        isolatedLayer = req.layer;
        res = { id: req.id, kind: 'ack' };
        break;
      }
      case 'getRelated': {
        const ids = getRelated(req.parentBlockId);
        res = { id: req.id, kind: 'related', ids };
        break;
      }
    }
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errResponse: WorkerResponse = { id: req.id, kind: 'error', message };
    (self as unknown as Worker).postMessage(errResponse);
  }
});

// TypeScript Worker tipinde 'self' DedicatedWorkerGlobalScope; export {} ile module yap.
export {};
