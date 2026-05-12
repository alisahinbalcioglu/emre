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

/** Layer-level metraj agregesi (1 layer = N pipe segmenti). */
export interface PipeSegment {
  segment_id: number;
  layer: string;
  length: number;
  line_count: number;
  material_type?: string;
  diameter?: string;
}

export interface LayerMetraj {
  layer: string;
  length: number;
  line_count: number;
  hat_tipi?: string;
  segments?: PipeSegment[];
}

/** DWG'den seçilmiş ekipman (kombi, pompa vs.) — kütüphane referansli
 *  veya manuel girilmis. Çıktıda boru/segmentlerden ayri bir bölümde gösterilir. */
export interface MetrajEquipment {
  name: string;                          // örn. "Kombi Yogusmali 24kW"
  brandName?: string | null;
  unit: string;                          // "adet", "set"
  quantity: number;                      // toplam adet
  unitPrice?: number | null;             // ₺ — kütüphaneden geldiyse
  totalPrice?: number | null;            // quantity × unitPrice
  specs?: Record<string, string> | null; // {Güç: "24 kW", Kapasite: "100 m³/h"}
  layer: string;                         // DWG layer (gruplama için)
  libraryItemId?: string | null;         // kaynak ekipman kayıt id
}

export interface MetrajResult {
  layers: LayerMetraj[];
  total_length: number;
  total_layers: number;
  warnings: string[];
  /** Ekipman listesi — workspace'te kütüphaneden/manuel işaretlenmiş INSERT'ler.
   *  Quotes/Excel/PDF ihracatları structured data buradan okur. */
  equipments?: MetrajEquipment[];
}
