'use client';

/**
 * DiameterLegendPanel — sag panelde her benzersiz cap icin renk kupü +
 * uzunluk + segment sayisi gosteren legend.
 *
 * PRD §3: "Cikartilan metraj listesi caplara gore gruplanarak ekrana
 * basilir. Her cap grubunun yanina/arkaplanina, Canvas'taki borularla
 * birebir AYNI renk kodu eklenir (legend mantigi)."
 *
 * INTERAKSIYON: bir cap satirina tikla -> cizimde o cap'in segment'leri
 * arasinda cycle (zoom + cap-rengi halo). Tekrar ayni cap'e tikla -> bir
 * sonraki segmente atla. Aktif satir mor cerceveyle isaretlenir, sag tarafta
 * "1/15" gibi pozisyon counter'i ve "kapat" carpi cikar.
 *
 * MetrajSummaryPanel ayri kalir (layer-bazli ozet). Bu panel cross-layer
 * cap aggregate'i. Cap dogru atanmis mi gorsel kontrol icin merkez bilesendir.
 */

import React, { useMemo } from 'react';
import { Palette, X } from 'lucide-react';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import type { CalculatedLayer, DiameterLegendEntry } from './types';
import { buildLegendEntries } from './types';

interface DiameterLegendPanelProps {
  calculatedLayers: Record<string, CalculatedLayer>;
  /** Save sonra cap renkleri kapatildi mi — kapaliysa legend "renkler kaldirildi" badge'i goster */
  diameterColorsActive?: boolean;
  /** Aktif (cycle modunda) cap key — null ise hicbir satir secili degil. */
  activeDiameter?: string | null;
  /** Aktif cap icin gecerli segment index (0-based). */
  activeIndex?: number;
  /** Aktif cap icin toplam segment sayisi (gosterim icin: "3/15"). */
  activeCount?: number;
  /** Satir tiklamasi — parent cycle index'i ilerletir veya yeni cap secer. */
  onDiameterClick?: (diameter: string) => void;
  /** Sag-ust kapat carpi — aktif cap'i temizler. */
  onClearActive?: () => void;
  className?: string;
}

export default function DiameterLegendPanel({
  calculatedLayers,
  diameterColorsActive = true,
  activeDiameter = null,
  activeIndex = 0,
  activeCount = 0,
  onDiameterClick,
  onClearActive,
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
        {activeDiameter && (
          <button
            type="button"
            onClick={onClearActive}
            className="ml-auto flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
            title="Aktif cap secimini temizle (Esc)"
          >
            <X className="h-3 w-3" />
            kapat
          </button>
        )}
        {!activeDiameter && !diameterColorsActive && (
          <span
            className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            title="Kaydet sonrasi: cap renkleri kaldirildi, cizimde layer orijinal rengine donduruldu"
          >
            renkler kapatildi
          </span>
        )}
      </div>
      <div className="space-y-1">
        {entries.map((e) => {
          const isActive = activeDiameter === e.diameter;
          const clickable = !!onDiameterClick && e.segmentCount > 0;
          return (
            <button
              key={e.diameter}
              type="button"
              onClick={() => clickable && onDiameterClick(e.diameter)}
              disabled={!clickable}
              className={[
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors',
                isActive
                  ? 'bg-violet-100 ring-1 ring-violet-400'
                  : clickable
                    ? 'hover:bg-slate-50 cursor-pointer'
                    : 'cursor-default',
              ].join(' ')}
              title={
                clickable
                  ? `Layer'lar: ${e.layers.join(', ')}\nTikla -> cizimde o cap'in segment'lerini gez`
                  : `Layer'lar: ${e.layers.join(', ')}`
              }
            >
              <span
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-slate-300 shadow-sm"
                style={{ backgroundColor: e.color }}
              />
              <span className="min-w-0 flex-1 truncate text-left font-mono font-semibold text-slate-800">
                {e.diameter}
              </span>
              {isActive && activeCount > 0 && (
                <span className="rounded bg-violet-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-violet-900">
                  {Math.min(activeIndex, activeCount - 1) + 1}/{activeCount}
                </span>
              )}
              <span className="font-mono tabular-nums text-slate-600">
                {e.totalLength.toFixed(1)} m
              </span>
              <span className="font-mono tabular-nums text-[10px] text-slate-500">
                ({e.segmentCount})
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        {activeDiameter
          ? 'Tekrar tikla -> sonraki segmente atla. Esc / kapat -> seti birak.'
          : 'Cap satirina tikla -> cizimde o cap nerede oldugunu gor.'}
      </p>
    </div>
  );
}
