'use client';

/**
 * useEntityIndex — Geometry verisini RBush spatial index + Entity Map'e cevirir.
 *
 * Mimari:
 *   - RBush: { minX, minY, maxX, maxY, id } kayitlarini O(log n) sorgulanabilir agacta tutar.
 *     28K kayit icin tek pointertap'ta arama ~1ms.
 *   - Entity Map: id → { type, layer, data } — RBush sorgu sonucu donen id'lerden
 *     full entity'i lookup eder; exact-test ve dispatcher icin kullanilir.
 *
 * Tek kaynak: backend'in `geometry.entity_index` listesi (LINE/CIRCLE/ARC/INSERT/TEXT).
 * Calculated edges (boru segmentleri) icin ayri bir layer eklenir — id ön-eki "S:".
 */

import { useMemo } from 'react';
import RBush from 'rbush';
import type {
  EntityType,
  GeometryResult,
  GeometryLine,
  GeometryCircle,
  GeometryArc,
  GeometryInsert,
  GeometryText,
} from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';

/** RBush kaydi — sadece bbox + id (hit-test sirasinda lookup icin). */
export interface IndexEntry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

/** Full entity payload — exact-test + dispatch icin. `data` type'a gore degisir. */
export type EntityData =
  | { type: 'line'; data: GeometryLine; index: number }
  | { type: 'circle'; data: GeometryCircle; index: number }
  | { type: 'arc'; data: GeometryArc; index: number }
  | { type: 'insert'; data: GeometryInsert; index: number }
  | { type: 'text'; data: GeometryText; index: number }
  | { type: 'segment'; data: EdgeSegment; index: number };

export interface Entity {
  id: string;
  type: EntityType | 'segment';
  layer: string;
  bbox: [number, number, number, number];
  /** Type-specific payload — exact-test geometri matematigi bunu kullanir. */
  payload: EntityData;
}

export interface EntityIndex {
  tree: RBush<IndexEntry>;
  map: Map<string, Entity>;
  size: number;
}

/** Bos index — geometry yokken kullanilir. */
function emptyIndex(): EntityIndex {
  return { tree: new RBush<IndexEntry>(), map: new Map(), size: 0 };
}

function bboxFromCoords(coords: [number, number, number, number]): [number, number, number, number] {
  const [x1, y1, x2, y2] = coords;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/**
 * Geometry + edge segments → RBush + Entity Map.
 *
 * Memoized: geometry/edgeSegments referansi degismedikce yeniden kurulmaz.
 * Bulk insert (`tree.load`) tek seferde optimal — 28K obje ~30ms.
 */
export function useEntityIndex(
  geometry: GeometryResult | null,
  edgeSegments: EdgeSegment[] | undefined,
): EntityIndex {
  return useMemo(() => {
    if (!geometry && (!edgeSegments || edgeSegments.length === 0)) {
      return emptyIndex();
    }

    const entries: IndexEntry[] = [];
    const map = new Map<string, Entity>();

    // ─── geometry.entity_index → RBush + Map ────────────────────────────
    if (geometry?.entity_index?.length) {
      for (const ref of geometry.entity_index) {
        const [minX, minY, maxX, maxY] = ref.bbox;
        entries.push({ minX, minY, maxX, maxY, id: ref.id });

        // Type prefix'ten array index parse et: "L:42" → 42
        const colonIdx = ref.id.indexOf(':');
        if (colonIdx < 0) continue;
        const idx = Number(ref.id.slice(colonIdx + 1));
        if (!Number.isFinite(idx)) continue;

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

        map.set(ref.id, {
          id: ref.id,
          type: ref.type,
          layer: ref.layer,
          bbox: ref.bbox,
          payload,
        });
      }
    }

    // ─── edge segments (cap-bazli boru parcalari) → ek index ────────────
    // Calculated edges /parse cikti, `geometry.entity_index` icinde DEGIL —
    // ayri pipeline. Frontend acisindan RBush'a ayni sekilde eklenir.
    if (edgeSegments && edgeSegments.length > 0) {
      for (let i = 0; i < edgeSegments.length; i++) {
        const seg = edgeSegments[i];
        // Polyline varsa onun bbox'i, yoksa coords (iki uc)
        let bbox: [number, number, number, number];
        if (seg.polyline && seg.polyline.length >= 2) {
          let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
          for (const [x, y] of seg.polyline) {
            if (x < mnx) mnx = x;
            if (y < mny) mny = y;
            if (x > mxx) mxx = x;
            if (y > mxy) mxy = y;
          }
          bbox = [mnx, mny, mxx, mxy];
        } else if (seg.coords && seg.coords.length === 4) {
          bbox = bboxFromCoords(seg.coords as [number, number, number, number]);
        } else {
          continue;
        }

        const id = `S:${seg.segment_id}`;
        entries.push({ minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3], id });
        map.set(id, {
          id,
          type: 'segment',
          layer: seg.layer,
          bbox,
          payload: { type: 'segment', data: seg, index: i },
        });
      }
    }

    const tree = new RBush<IndexEntry>(16);
    if (entries.length > 0) {
      tree.load(entries); // bulk insert — packing optimal
    }

    return { tree, map, size: entries.length };
  }, [geometry, edgeSegments]);
}
