/**
 * dwg-diameter-engine — algoritma destekli boru caplandirma modulu.
 *
 * Bu klasor: proximity (en yakin text -> cap) trigger, save sonra orijinal
 * renge donus state'i, ve cap-renk legend paneli.
 *
 * Mevcut dwg-workspace + dwg-viewer'a MINIMUM dokunulur (sadece prop'lar
 * ve hook tuketimi). Tum algoritma + UX yeni mantigi BURADA yasar.
 */

import type { EdgeSegment } from '@/components/dwg-metraj/types';
import type { MetrajResult } from '@/components/dwg-metraj/types';
import type { CalculatedLayer } from '@/components/dwg-workspace/types';
import { canonicalizeDiameter } from '@/components/dwg-metraj/diameter-colors';

/** /parse response'unda gelen proximity warning'leri parse etmek icin */
export interface ProximitySummary {
  layer: string;
  assignedCount: number;
  totalSegments: number;
  textPoolSize: number;
  warnings: string[];
}

/** useProximityCalc'in onResult callback'i icin pay load */
export interface ProximityCalcResult {
  layer: string;
  calculated: CalculatedLayer;
  raw: MetrajResult;
  summary?: ProximitySummary;
}

/** Legend panelinde her cap satiri icin gosterilen aggregate veri */
export interface DiameterLegendEntry {
  diameter: string;       // "Ø50", "1 1/4\"", "Belirtilmemis", vb.
  color: string;          // diameterToColor sonucu
  totalLength: number;    // metre
  segmentCount: number;
  layers: string[];       // bu cap'e sahip layer'lar (multi-layer uniqueness)
}

/** Tum hesaplanmis layer'lardan legend entry'leri turet.
 *  Cap key'i canonical form'a indirilir — '1 1/4"' ve '1¼"' tek satirda toplanir.
 */
export function buildLegendEntries(
  calculatedLayers: Record<string, CalculatedLayer>,
  diameterToColor: (d: string) => string,
): DiameterLegendEntry[] {
  const byDia = new Map<string, DiameterLegendEntry>();
  for (const cl of Object.values(calculatedLayers)) {
    for (const seg of cl.edgeSegments) {
      const raw = seg.diameter || 'Belirtilmemis';
      const key = raw === 'Belirtilmemis' ? raw : canonicalizeDiameter(raw);
      let entry = byDia.get(key);
      if (!entry) {
        entry = {
          diameter: key,
          color: diameterToColor(key),
          totalLength: 0,
          segmentCount: 0,
          layers: [],
        };
        byDia.set(key, entry);
      }
      entry.totalLength += seg.length || 0;
      entry.segmentCount += 1;
      if (!entry.layers.includes(cl.layer)) entry.layers.push(cl.layer);
    }
  }
  return Array.from(byDia.values()).sort((a, b) => b.totalLength - a.totalLength);
}

/** Re-exports for convenience */
export type { EdgeSegment, MetrajResult, CalculatedLayer };
