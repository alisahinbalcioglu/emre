'use client';

/**
 * Sag panel — aktif layer konfigurasyonu + "Metraj Hesapla" butonu.
 */

import React from 'react';
import { Loader2, Layers, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LayerConfig } from './types';

interface LayerInfoSidebarProps {
  selectedLayer: string | null;
  config: LayerConfig | null;
  useAiDiameter: boolean;
  calculating: boolean;
  onChangeConfig: (patch: Partial<LayerConfig>) => void;
  onToggleAi: (v: boolean) => void;
  onCalculate: () => void;
  onClearSelection: () => void;
  /** Secili layer'i cizimden gizle (LayerVisibilityPanel toggle ile ayni). */
  onHideLayer?: () => void;
}

export default function LayerInfoSidebar({
  selectedLayer,
  config,
  useAiDiameter,
  calculating,
  onChangeConfig,
  onToggleAi,
  onCalculate,
  onClearSelection,
  onHideLayer,
}: LayerInfoSidebarProps) {
  if (!selectedLayer) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
        <Layers className="mx-auto h-5 w-5 text-slate-300" />
        <p className="mt-2 text-xs text-muted-foreground">
          Çizimde bir <strong>boru</strong> layer&apos;ına tıklayın.
          <br />Seçilen layer burada ayarlanır ve metrajı hesaplanır.
        </p>
      </div>
    );
  }

  const c = config ?? { hatIsmi: '', materialType: '', defaultDiameter: '' };

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

      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-slate-600">
          Varsayılan Çap <span className="text-slate-400">(ops.)</span>
        </label>
        <input
          type="text"
          value={c.defaultDiameter}
          onChange={(e) => onChangeConfig({ defaultDiameter: e.target.value })}
          placeholder='örn: 6", DN150'
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none"
        />
        <p className="mt-1 text-[10px] text-slate-500">AI&apos;nın atayamadığı segment&apos;ler bu çapla doldurulur.</p>
      </div>

      <label className="mb-3 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50/60 px-2.5 py-1.5 cursor-pointer hover:bg-purple-50">
        <input
          type="checkbox"
          checked={useAiDiameter}
          onChange={(e) => onToggleAi(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
        />
        <div className="flex-1">
          <p className="text-[11px] font-medium text-purple-900">AI ile çap ata</p>
          <p className="text-[10px] text-purple-700 leading-relaxed">Her segmente Claude ~0.3-1 TL, 5-60 sn</p>
        </div>
      </label>

      <button
        onClick={onCalculate}
        disabled={calculating}
        className={cn(
          'w-full rounded-lg px-3 py-2 text-sm font-medium transition-all',
          calculating
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        {calculating ? (
          <span className="flex items-center justify-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Hesaplanıyor...
          </span>
        ) : 'Bu Layer\'ı Hesapla'}
      </button>
    </div>
  );
}
