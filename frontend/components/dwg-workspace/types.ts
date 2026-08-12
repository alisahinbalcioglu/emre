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
  /** Layer kullanici tarafindan onaylandi mi? Yeni hesaplandiginda false.
   *  "Onayla" butonu -> true. Onaylanmadan baska layer'a gecilemez (toast uyarisi). */
  approved: boolean;
  /** Onay zamani — fiyatlandirmaya giden layer/grup sirasi bundan kurulur
   *  (onay-revizyon.ts `onaySirasi`; eski tuketici buildExcelSheets 11.08'de
   *  kaldirilmisti) + audit. */
  approvedAt?: number;
  /** Hesap ANINDA motora gonderilen sprinkler isaretli layer'lar.
   *  Simdiki isaretlemeyle uyusmuyorsa hesap BAYATTIR (sprinkler-bayatlik.ts) —
   *  PANOVA vakasi: isaret hesaptan SONRA konunca bolme sessizce eksik kaldi. */
  sprinklerLayersUsed?: string[];
  /** Hesap hangi bolme moduyla yapildi. 't' = T noktalarinda bolme (varsayilan),
   *  'none' = bolme yok (entity = tek parca). Yeniden hesapta AYNEN korunur. */
  splitMode?: 't' | 'none';
}

/** Workspace'in genel state'i. */
export interface WorkspaceState {
  fileId: string;
  scale: number;

  // Seçim akisi
  selectedLayer: string | null;                 // su an aktif olan (form dolduruluyor)
  layerConfigs: Record<string, LayerConfig>;    // layer -> config
  calculatedLayers: Record<string, CalculatedLayer>;  // hesaplanmis layer'lar

  // NOT: `markedEquipments` / `editingEquipmentKey` alanlari 10.08'de
  // KALDIRILDI (ekipman isaretleme ozelligi cikarildi). Eski localStorage
  // kayitlarinda bu anahtarlar durabilir; `_loadState` spread ettigi icin
  // state'e sizarlar ama okuyan kimse kalmadigi icin zararsizdirlar.

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
