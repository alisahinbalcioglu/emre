'use client';

/**
 * Sag panel — aktif layer info + opsiyonel "Varsayilan Cap" toplu apply.
 *
 * "Bu Layer'i Hesapla" butonu KALDIRILDI — layer'a tiklayinca otomatik
 * hesaplama tetikleniyor (DwgProjectWorkspace.handleLineClick / onLayerSelect).
 *
 * Asil cap atama akisi:
 *  - Hesaplanmis layer'da bir segmente tikla -> DiameterEditPopup (segment-level)
 *  - Veya buradan "Varsayilan Cap" gir + Uygula -> tum BOS segmentlere apply
 */

import React from 'react';
import { Loader2, Layers, EyeOff, Check, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LayerConfig, CalculatedLayer } from './types';
import { canonicalizeDiameter } from '@/components/dwg-metraj/diameter-colors';

interface LayerInfoSidebarProps {
  selectedLayer: string | null;
  config: LayerConfig | null;
  /** Hesaplanmis layer bilgisi — varsa segment count + Uygula etkin. */
  calculatedLayer: CalculatedLayer | null;
  /** Backend /parse devam ediyor — spinner goster. */
  calculating: boolean;
  onChangeConfig: (patch: Partial<LayerConfig>) => void;
  /** "Varsayilan Cap" gir + Uygula: layer'daki bos segmentlere apply. */
  onApplyDefaultDiameter: (diameter: string) => void;
  onClearSelection: () => void;
  /** Secili layer'i cizimden gizle (LayerVisibilityPanel toggle ile ayni). */
  onHideLayer?: () => void;
  /** "Hesapla" butonu — secili layer icin /parse tetikle. */
  onCalculate?: (layer: string) => void;
}

export default function LayerInfoSidebar({
  selectedLayer,
  config,
  calculatedLayer,
  calculating,
  onChangeConfig,
  onApplyDefaultDiameter,
  onClearSelection,
  onHideLayer,
  onCalculate,
}: LayerInfoSidebarProps) {
  if (!selectedLayer) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
        <Layers className="mx-auto h-5 w-5 text-slate-300" />
        <p className="mt-2 text-xs text-muted-foreground">
          Çizimde bir <strong>boru</strong> layer&apos;ına tıklayın.
          <br />T noktalarinda otomatik bölünür, sonra her segmente ayrı cap atayabilirsiniz.
        </p>
      </div>
    );
  }

  const c = config ?? { hatIsmi: '', materialType: '', defaultDiameter: '' };

  // Hesaplanmis layer'da bos segment sayisi
  const emptySegmentCount = calculatedLayer
    ? calculatedLayer.edgeSegments.filter((es) => !es.diameter || es.diameter === 'Belirtilmemis').length
    : 0;

  const handleApply = () => {
    const raw = c.defaultDiameter.trim();
    if (!raw) return;
    onApplyDefaultDiameter(canonicalizeDiameter(raw));
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-[11px] font-medium text-blue-900 uppercase tracking-wide">Seçili Layer</span>
        </div>
        <div className="flex items-center gap-2">
          {onHideLayer && (
            <button
              onClick={onHideLayer}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-600 hover:text-red-600 hover:underline"
              title="Bu layer'i cizimden gizle"
            >
              <EyeOff className="h-3 w-3" />
              Layer&apos;i Gizle
            </button>
          )}
          <button
            onClick={onClearSelection}
            className="text-[10px] text-blue-600 hover:underline"
          >
            Seçimi kaldır
          </button>
        </div>
      </div>
      <p className="mb-3 break-all text-sm font-semibold text-slate-800">{selectedLayer}</p>

      {/* Hesaplama durumu */}
      {calculating && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-100/60 px-2.5 py-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          <span className="text-[11px] font-medium text-blue-900">Hesaplanıyor (~15-60sn)</span>
        </div>
      )}
      {calculatedLayer && !calculating && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5">
          <p className="text-[11px] font-medium text-emerald-900">
            ✓ Hesaplandı — {calculatedLayer.edgeSegments.length} segment, {calculatedLayer.totalLength.toFixed(2)} m
          </p>
          <p className="text-[10px] text-emerald-700">
            {calculatedLayer.junctionPoints.length} T-noktası tespit edildi.
            {emptySegmentCount > 0 && ` ${emptySegmentCount} segment çapsız.`}
          </p>
        </div>
      )}

      {/* HESAPLA BUTONU — yeni: kullanici kontrol, otomatik degil */}
      {!calculatedLayer && !calculating && onCalculate && (
        <button
          onClick={() => onCalculate(selectedLayer)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Calculator className="h-4 w-4" />
          Bu Layer&apos;ı Hesapla
        </button>
      )}

      <div className="mb-2.5">
        <label className="mb-1 block text-[11px] font-medium text-slate-600">Hat İsmi</label>
        <input
          type="text"
          value={c.hatIsmi}
          onChange={(e) => onChangeConfig({ hatIsmi: e.target.value })}
          placeholder="örn: Yangın Hidrant Hattı"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        />
      </div>

      <div className="mb-2.5">
        <label className="mb-1 block text-[11px] font-medium text-slate-600">Malzeme Tipi</label>
        <input
          type="text"
          value={c.materialType}
          onChange={(e) => onChangeConfig({ materialType: e.target.value })}
          placeholder="örn: Siyah Boru / HDPE"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        />
      </div>

      <div className="mb-2">
        <label className="mb-1 block text-[11px] font-medium text-slate-600">
          Varsayılan Çap <span className="text-slate-400">(toplu apply)</span>
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={c.defaultDiameter}
            onChange={(e) => onChangeConfig({ defaultDiameter: e.target.value })}
            placeholder='örn: 6", DN150'
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={!c.defaultDiameter.trim() || !calculatedLayer || emptySegmentCount === 0}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              c.defaultDiameter.trim() && calculatedLayer && emptySegmentCount > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            )}
            title={
              !calculatedLayer
                ? 'Önce layer hesaplanmalı (çizimde boruya tıklayın)'
                : emptySegmentCount === 0
                  ? 'Tüm segmentler çaplı, uygulanacak boş segment yok'
                  : `${emptySegmentCount} boş segmente uygula`
            }
          >
            <Check className="h-3 w-3" />
            Uygula
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {calculatedLayer
            ? `Layer'ın ${emptySegmentCount} boş segmentine apply. Tek tek atanmış segment'ler korunur.`
            : 'Layer hesaplandıktan sonra etkinleşir. Tek tek atama için segmente tıklayın.'}
        </p>
      </div>
    </div>
  );
}
