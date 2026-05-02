/**
 * DWG Viewer 2.0 — saf gorunru tipleri.
 * Backend /geometry/{file_id} endpoint'inden gelen geometri verisi.
 *
 * Phase 1b PRD-uyumlu naming:
 *   - canonical_entity_id (id formati: "line.42", "circle.7", ...)
 *   - layer_name
 *   - parent_block_id (block sub-entity'lerinde dolu)
 *
 * NOT: `EdgeSegment` (boru/cap data tipi) bu dosyada DEGIL —
 * `dwg-metraj/types.ts`'te yasar. Bu dosya sadece "ne goruyor" geometrisi.
 */

export interface GeometryLine {
  layer: string;
  color: number;   // ACI; 256 = BYLAYER
  coords: [number, number, number, number];  // [x1, y1, x2, y2]
  /** Block expansion'dan gelen sub-entity ise parent INSERT'in canonical id'si.
   *  Equipment butunsel selection: ayni parent_block_id'li tum entity'ler
   *  birlikte highlight edilir. */
  parent_block_id: string | null;
}

export interface GeometryInsert {
  insert_index: number;
  layer: string;
  color: number;
  insert_name: string;
  position: [number, number];
  rotation: number;
  scale: [number, number];
}

export interface GeometryText {
  text: string;
  layer: string;
  color: number;
  position: [number, number];
  height: number;
  rotation: number;
  parent_block_id: string | null;
}

export interface GeometryCircle {
  circle_index: number;
  layer: string;
  color: number;
  center: [number, number];
  radius: number;
  parent_block_id: string | null;
}

export interface GeometryArc {
  arc_index: number;
  layer: string;
  color: number;
  center: [number, number];
  radius: number;
  start_angle: number;  // derece
  end_angle: number;
  parent_block_id: string | null;
}

/** Entity tipi (PRD canonical_entity_id prefix'leri ile birebir). */
export type EntityType = 'line' | 'circle' | 'arc' | 'insert' | 'text';

/**
 * RBush spatial index payload — backend'in entity_index listesindeki her kayit.
 * Frontend bunu RBush.load() ile bulk insert eder, hit-test + viewport culling
 * icin tek kaynak.
 */
export interface EntityRef {
  canonical_entity_id: string;
  type: EntityType;
  layer_name: string;
  bbox: [number, number, number, number];
  parent_block_id: string | null;
}

export interface GeometryResult {
  lines: GeometryLine[];
  inserts: GeometryInsert[];
  texts: GeometryText[];
  circles: GeometryCircle[];
  arcs: GeometryArc[];
  bounds: [number, number, number, number];
  layer_colors: Record<string, number>;
  entity_index: EntityRef[];
}

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

/**
 * Hit-test sonucu — Worker'dan main thread'e doner.
 * canonical_entity_id ile ana array'lerden full entity verisi cekilebilir.
 */
export interface PickResult {
  canonical_entity_id: string;
  type: EntityType;
  layer_name: string;
  /** Equipment butunsel selection: bu entity bir block'a aitse, ayni grupta
   *  olan TUM entity id'leri. Tek-line click ise [entity.id] doner. */
  group_entity_ids: string[];
  /** Hit pozisyonundaki tikla mesafesi (world units) — debug ve tie-break icin. */
  distance: number;
}
