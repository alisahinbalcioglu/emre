/**
 * dwg-diameter-engine — layer hesaplama modulu tipleri.
 *
 * Bu klasor: saf geometri/uzunluk hesabi tetigi (useLayerCalc) ve kaydet
 * sonrasi orijinal renge donus bayragi (useOriginalColorState). Otomatik cap
 * atama (proximity) motoru KALDIRILDI — cap atamasi kullanicinin isidir
 * (dwg-workspace Adim 2 + dwg-tagging kalemleri).
 *
 * 25.09: capraz-layer cap lejanti (buildLegendEntries / DiameterLegendPanel)
 * kaldirildi; secili layer'in metrajli cap listesi dwg-workspace/cap-gruplari.ts.
 */

import type { EdgeSegment } from '@/components/dwg-metraj/types';
import type { MetrajResult } from '@/components/dwg-metraj/types';
import type { CalculatedLayer } from '@/components/dwg-workspace/types';

/** useLayerCalc'in onResult callback payload'i.
 *  (Eski ProximitySummary/ProximityCalcResult tipleri otomatik cap atama
 *   motoruyla birlikte silindi — operasyon Faz 2 temizligi.) */
export interface LayerCalcResult {
  layer: string;
  calculated: CalculatedLayer;
  raw: MetrajResult;
}

/** Re-exports for convenience */
export type { EdgeSegment, MetrajResult, CalculatedLayer };
