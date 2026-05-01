/**
 * DWG Project Workspace — tip tanimlari.
 * Tamamen izole klasor (components/dwg-workspace/) — disa bagimli degil.
 */

import type { EdgeSegment } from '@/components/dwg-metraj';

/** Bir layer icin kullanici tarafindan girilmis konfigurasyon. */
export interface LayerConfig {
  hatIsmi: string;           // "Yangin Hidrant Hatti" vs.
  materialType: string;      // "Siyah Boru" vs.
  defaultDiameter: string;   // "6\"" — AI'nin bulamadigi segment'ler icin fallback
}

/** Bir layer icin hesaplanmis metraj sonucu (edge_segments + toplam). */
export interface CalculatedLayer {
  layer: string;
  hatIsmi: string;
  materialType: string;
  defaultDiameter: string;
  edgeSegments: EdgeSegment[];
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
  userLabel: string;        // kullanicinin girdigi malzeme adi
  unit: string;             // "adet" default, "set", "m" vs.
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

  // Sprinkler layer secimi — kullanici viewer'da bir sembole tiklar → lastClickedLayer,
  // sonra "Sprinkler yap" butonu ile sprinklerLayers'a aktarilir
  sprinklerLayers: string[];
  /** Kullanicinin en son tikladigi layer (herhangi entity tipi) — sprinkler secimi aday */
  lastClickedLayer: string | null;

  // AI toggle
  useAiDiameter: boolean;

  /** Kullanicinin "goz" ikonuyla gizledigi layer'lar — viewer'da hicbir
   *  katmanda (background, circles, arcs, inserts, texts) cizilmez. Sadece
   *  gorsel filtre, hesaplanmis metrajlari ve config'i etkilemez. */
  hiddenLayers: string[];

  /** Backend auto_detect_sprinklers'un bulduğu sprinkler INSERT sayisi.
   *  Bilgilendirme amacli (info satirinda gosterilir). undefined = henuz
   *  parse calismadi. */
  aiDetectedSprinklerCount?: number;
}
