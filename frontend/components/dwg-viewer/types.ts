/**
 * DWG SVG Viewer — tip tanimlari.
 * Backend /geometry/{file_id} endpoint'inden gelen veriyi modeller.
 */

export interface GeometryLine {
  layer: string;
  color: number;   // AutoCAD color index (ACI); 256 = BYLAYER
  coords: [number, number, number, number];  // [x1, y1, x2, y2]
}

/**
 * INSERT entity — ekipman/sembol (sprinkler, vana, pompa, vs.)
 * Backend geometry.py'dan gelir.
 */
export interface GeometryInsert {
  insert_index: number;
  layer: string;
  color: number;
  insert_name: string;
  position: [number, number];
  rotation: number;
  scale: [number, number];
}

/** TEXT / MTEXT — cap etiketleri, olcu, not, vs. */
export interface GeometryText {
  text: string;
  layer: string;
  color: number;
  position: [number, number];
  height: number;
  rotation: number;
}

/** CIRCLE entity — sprinkler kafa, sembol cember, vs. */
export interface GeometryCircle {
  circle_index: number;
  layer: string;
  color: number;
  center: [number, number];
  radius: number;
}

export interface GeometryResult {
  lines: GeometryLine[];
  inserts: GeometryInsert[];
  texts: GeometryText[];
  circles: GeometryCircle[];
  bounds: [number, number, number, number];  // [minX, minY, maxX, maxY]
  layer_colors: Record<string, number>;
}

/**
 * Edge-level segment — her pipe-run (chain) ayri, cap bilgisiyle.
 * /parse endpoint'inin donusundeki edge_segments alanindan gelir.
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

export interface Viewport {
  /** Pan: calisma koordinatinda kaydirma miktari */
  panX: number;
  panY: number;
  /** Zoom: 1 = orijinal, 2 = 2x yakinlasmis */
  zoom: number;
}
