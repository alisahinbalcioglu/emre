/**
 * DWG Metraj — tip tanimlari (boru, cap, segment, edge).
 *
 * Bu dosya boru/cap hesabi domain'inin saf data tipleri. Gorunru tipleri
 * (GeometryLine, GeometryCircle vb.) `dwg-viewer/types.ts`'te yasar.
 */

/**
 * Edge-level segment — her pipe-run (chain) ayri, cap bilgisiyle.
 * `/parse` endpoint'inin donusundeki edge_segments alanindan gelir.
 */
export interface EdgeSegment {
  segment_id: number;
  layer: string;
  diameter: string;              // "1 1/4\"", "2\"", "Belirtilmemis", ""
  length: number;
  coords: [number, number, number, number];  // [x1, y1, x2, y2] — run'in iki ucu
  /** Chain'in sirali vertex listesi — L/Z/U sekilli borularin gercek sekli
   * (2+ nokta). Yoksa coords'a duseriz (tek edge line). */
  polyline?: [number, number][];
}
