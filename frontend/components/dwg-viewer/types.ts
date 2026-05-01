/**
 * DWG Viewer — saf gorunru tipleri.
 * Backend /geometry/{file_id} endpoint'inden gelen geometri verisini modeller.
 *
 * NOT: `EdgeSegment` (boru/cap hesabi data tipi) bu dosyada DEGIL —
 * `dwg-metraj/types.ts`'te yasar. Bu dosya sadece "ne goruyor" geometrisi.
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

/** ARC entity — yariciap yay (sprinkler/vana sembollerinde sik kullanilir). */
export interface GeometryArc {
  layer: string;
  color: number;
  center: [number, number];
  radius: number;
  /** DXF konvensyonu: x-eksenin saat yonune ters, derece. */
  start_angle: number;
  end_angle: number;
}

export interface GeometryResult {
  lines: GeometryLine[];
  inserts: GeometryInsert[];
  texts: GeometryText[];
  circles: GeometryCircle[];
  arcs: GeometryArc[];
  bounds: [number, number, number, number];  // [minX, minY, maxX, maxY]
  layer_colors: Record<string, number>;
}

export interface Viewport {
  /** Pan: calisma koordinatinda kaydirma miktari */
  panX: number;
  panY: number;
  /** Zoom: 1 = orijinal, 2 = 2x yakinlasmis */
  zoom: number;
}
