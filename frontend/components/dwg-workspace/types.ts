/**
 * DWG Project Workspace — tip tanimlari.
 * Tamamen izole klasor (components/dwg-workspace/) — disa bagimli degil.
 */

import type { EdgeSegment } from '@/components/dwg-metraj';

/** Bir layer icin kullanici tarafindan girilmis konfigurasyon. */
export interface LayerConfig {
  hatIsmi: string;           // "Yangin Hidrant Hatti" vs.
  materialType: string;      // "Siyah Boru" vs.
  defaultDiameter: string;   // "6\"" — layer-level default cap (tum segment'lere uygulanir)
}

/** Bir layer icin hesaplanmis metraj sonucu (edge_segments + toplam). */
export interface CalculatedLayer {
  layer: string;
  hatIsmi: string;
  materialType: string;
  defaultDiameter: string;
  edgeSegments: EdgeSegment[];
  /** T-junction noktalari [x, y] — backend pipe_segments'ten. Canvas2D'de marker icin. */
  junctionPoints: [number, number][];
  totalLength: number;
  computedAt: number;  // timestamp — sirayla gosterim icin
}

/** Kullanicinin tiklayip isaretledigi bir ekipman (INSERT). */
export interface MarkedEquipment {
  key: string;              // "layer:insert_index" — unique
  insertIndex: number;      // GeometryInsert'ten
  layer: string;
  insertName: string;       // DWG block adi (ornek: "SPRINKLER_BLOCK")
  position: [number, number];
  userLabel: string;        // kullanicinin girdigi malzeme adi (kütüphaneden ise: materialName)
  unit: string;             // "adet" default, "set", "m" vs.
  // Kütüphaneden seçildiyse: ekipman kataloğundaki kayıt referansı +
  // o kaydın spec (güç/kapasite vs.) ve birim fiyatı. Manuel girilen
  // ekipmanlarda hepsi null.
  libraryItemId?: string | null;
  brandName?: string | null;
  unitPrice?: number | null;        // ₺
  specs?: Record<string, string> | null;
}

/** Workspace'in genel state'i. */
export interface WorkspaceState {
  fileId: string;
  scale: number;

  // Seçim akisi
  selectedLayer: string | null;                 // su an aktif olan (form dolduruluyor)
  layerConfigs: Record<string, LayerConfig>;    // layer -> config
  calculatedLayers: Record<string, CalculatedLayer>;  // hesaplanmis layer'lar

  // Ekipman akisi
  markedEquipments: Record<string, MarkedEquipment>;
  editingEquipmentKey: string | null;

  // Sprinkler olarak isaretli layer'lar — LayerVisibilityPanel'de damla ikonu ile toggle
  sprinklerLayers: string[];

  /** Kullanicinin "goz" ikonuyla gizledigi layer'lar — viewer'da hicbir
   *  katmanda (background, circles, arcs, inserts, texts) cizilmez. Sadece
   *  gorsel filtre, hesaplanmis metrajlari ve config'i etkilemez. */
  hiddenLayers: string[];

  /** Kullanicinin "isik" ikonuyla soluklastirdigi layer'lar — viewer'da
   *  cizilir ama gri tonda + %25 opacity. Tiklanamaz/secilemez (referans
   *  amacli). Hesaplanmis metrajlari ve config'i etkilemez. */
  dimmedLayers: string[];

}
