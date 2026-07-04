'use client';

/**
 * Sag panel — secili layer bilgisi + iki aksiyon (UX #3 SADELESTIRME):
 *
 *   1. "Layer'i Segmentlerine Ayir" → /parse tetikler (saf geometri+uzunluk)
 *   2. "Hesaplamayi Tamamla"        → layer onaylanir, etiketleme ekrani sifirlanir
 *
 * ESKI form alanlari (Hat Ismi / Malzeme Tipi / Varsayilan Cap) SILINDI —
 * cap ve etiket bilgisi artik ustteki "Cap Kalemleri" (dwg-tagging) modulunden
 * geliyor; bu panel yalniz layer adi + durum + aksiyonlari gosterir.
 */

import React from 'react';
import { Loader2, Layers, EyeOff, CheckCircle2, Scissors } from 'lucide-react';
import type { CalculatedLayer } from './types';
import { isUnassignedDiameter } from '@/components/dwg-metraj/constants';

interface LayerInfoSidebarProps {
  selectedLayer: string | null;
  /** Hesaplanmis layer bilgisi — varsa durum + Tamamla butonu gosterilir. */
  calculatedLayer: CalculatedLayer | null;
  /** Backend /parse devam ediyor — spinner goster. */
  calculating: boolean;
  /** "Layer'i Segmentlerine Ayir" — secili layer icin /parse tetikle. */
  onCalculate: (layer: string) => void;
  /** "Hesaplamayi Tamamla" — layer'i onayla + etiketleme ekranini sifirla. */
  onComplete: (layer: string) => void;
  onClearSelection: () => void;
  /** Secili layer'i cizimden gizle (LayerVisibilityPanel toggle ile ayni). */
  onHideLayer?: () => void;
}

export default function LayerInfoSidebar({
  selectedLayer,
  calculatedLayer,
  calculating,
  onCalculate,
  onComplete,
  onClearSelection,
  onHideLayer,
}: LayerInfoSidebarProps) {
  if (!selectedLayer) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
        <Layers className="mx-auto h-5 w-5 text-slate-300" />
        <p className="mt-2 text-xs text-muted-foreground">
          Çizimde bir <strong>boru</strong> layer&apos;ına tıklayın.
          <br />T noktalarında otomatik bölünür, sonra Çap Kalemleri ile etiketlersiniz.
        </p>
      </div>
    );
  }

  const emptySegmentCount = calculatedLayer
    ? calculatedLayer.edgeSegments.filter((es) => isUnassignedDiameter(es.diameter)).length
    : 0;

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
              Layer&apos;ı Gizle
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
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-100/60 px-2.5 py-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          <span className="text-[11px] font-medium text-blue-900">Segmentlere ayrılıyor (~15-60sn)</span>
        </div>
      )}

      {calculatedLayer && !calculating && (
        <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5">
          <p className="text-[11px] font-medium text-emerald-900">
            ✓ {calculatedLayer.edgeSegments.length} segment · {calculatedLayer.totalLength.toFixed(2)} m
            · {calculatedLayer.junctionPoints.length} T-noktası
          </p>
          <p className="text-[10px] text-emerald-700">
            {calculatedLayer.approved
              ? 'Bu layer TAMAMLANDI (onaylı).'
              : emptySegmentCount > 0
                ? `${emptySegmentCount} segment çapsız (neon) — Çap Kalemi seçip tıklayın.`
                : 'Tüm segmentler etiketli — tamamlayabilirsiniz.'}
          </p>
        </div>
      )}

      {/* AKSIYON 1: Segmentlere ayir (henuz hesaplanmadiysa) */}
      {!calculatedLayer && !calculating && (
        <button
          onClick={() => onCalculate(selectedLayer)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Scissors className="h-4 w-4" />
          Layer&apos;ı Segmentlerine Ayır
        </button>
      )}

      {/* AKSIYON 2: Hesaplamayi tamamla (hesaplandi + henuz onaysiz) */}
      {calculatedLayer && !calculatedLayer.approved && !calculating && (
        <button
          onClick={() => onComplete(selectedLayer)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          title={emptySegmentCount > 0
            ? `${emptySegmentCount} çapsız segment var — onay sorusu çıkar`
            : 'Layer onaylanır, etiketleme ekranı yeni layer için sıfırlanır'}
        >
          <CheckCircle2 className="h-4 w-4" />
          Hesaplamayı Tamamla
          {emptySegmentCount > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold">
              {emptySegmentCount} çapsız
            </span>
          )}
        </button>
      )}
    </div>
  );
}
