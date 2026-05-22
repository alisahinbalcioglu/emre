'use client';

/**
 * DiameterLegendPanel — sag panelde her benzersiz cap icin renk kupü +
 * uzunluk + segment sayisi gosteren legend.
 *
 * PRD §3: "Cikartilan metraj listesi caplara gore gruplanarak ekrana
 * basilir. Her cap grubunun yanina/arkaplanina, Canvas'taki borularla
 * birebir AYNI renk kodu eklenir (legend mantigi)."
 *
 * MetrajSummaryPanel ayri kalir (layer-bazli ozet). Bu panel cross-layer
 * cap aggregate'i. Cap dogru atanmis mi gorsel kontrol icin merkez bilesendir.
 */

import React, { useMemo } from 'react';
import { Palette } from 'lucide-react';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import type { CalculatedLayer, DiameterLegendEntry } from './types';
import { buildLegendEntries } from './types';

interface DiameterLegendPanelProps {
  calculatedLayers: Record<string, CalculatedLayer>;
  /** Save sonra cap renkleri kapatildi mi — kapaliysa legend "renkler kaldirildi" badge'i goster */
  diameterColorsActive?: boolean;
  className?: string;
}

export default function DiameterLegendPanel({
  calculatedLayers,
  diameterColorsActive = true,
  className = '',
}: DiameterLegendPanelProps) {
  const entries: DiameterLegendEntry[] = useMemo(
    () => buildLegendEntries(calculatedLayers, diameterToColor),
    [calculatedLayers],
  );

  if (entries.length === 0) {
    return null;  // hesaplanmis layer yoksa hic gosterme
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <Palette className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-800">Cap Renkleri</h3>
        {!diameterColorsActive && (
          <span
            className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            title="Kaydet sonrasi: cap renkleri kaldirildi, cizimde layer orijinal rengine donduruldu"
          >
            renkler kapatildi
          </span>
        )}
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div
            key={e.diameter}
            className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50"
            title={`Layer'lar: ${e.layers.join(', ')}`}
          >
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-slate-300 shadow-sm"
              style={{ backgroundColor: e.color }}
            />
            <span className="min-w-0 flex-1 truncate font-mono font-semibold text-slate-800">
              {e.diameter}
            </span>
            <span className="font-mono tabular-nums text-slate-600">
              {e.totalLength.toFixed(1)} m
            </span>
            <span className="font-mono tabular-nums text-[10px] text-slate-500">
              ({e.segmentCount})
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Her renk bir capi temsil eder. Cizimdeki renklerle eslesir.
      </p>
    </div>
  );
}
