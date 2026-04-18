'use client';

import React, { useState, useMemo } from 'react';
import { Layers, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Tipler ──

export interface LayerInfo {
  layer: string;
  entity_count: number;
  /** INSERT (block reference) sayisi — genelde sprinkler/sembol layer'larini ayirt eder. */
  insert_count?: number;
}

export interface LayerSelection {
  layer: string;
  selected: boolean;
  /** Hat ismi — bos olabilir. Icinde "sprink"/"upright"/"pendant"/"sidewall"
   *  keyword'u gecerse backend o layer'i sprinkler layer olarak isler
   *  (INSERT'leri boru edge'ini keser, her sprinkler bir dal ayirici). */
  hatIsmi: string;
  materialType: string; // "Siyah Boru", "HDPE", "PPR-C", vb. (bos = otomatik)
}

interface LayerSelectorProps {
  layers: LayerInfo[];
  fileName: string;
  onConfirm: (selections: LayerSelection[]) => void;
  onCancel: () => void;
}

// ── Komponent ──

export default function LayerSelector({ layers, fileName, onConfirm, onCancel }: LayerSelectorProps) {
  const [selections, setSelections] = useState<LayerSelection[]>(() =>
    layers.map((l) => ({
      layer: l.layer,
      selected: false,
      hatIsmi: '',
      materialType: '',
    })),
  );

  const selectedCount = useMemo(() => selections.filter((s) => s.selected).length, [selections]);

  const toggleSelect = (layer: string) => {
    setSelections((prev) =>
      prev.map((s) => (s.layer === layer ? { ...s, selected: !s.selected } : s)),
    );
  };

  const toggleAll = (selectAll: boolean) => {
    setSelections((prev) => prev.map((s) => ({ ...s, selected: selectAll })));
  };

  const changeHatIsmi = (layer: string, hatIsmi: string) => {
    setSelections((prev) =>
      prev.map((s) => (s.layer === layer ? { ...s, hatIsmi } : s)),
    );
  };

  const changeMaterialType = (layer: string, materialType: string) => {
    setSelections((prev) =>
      prev.map((s) => (s.layer === layer ? { ...s, materialType } : s)),
    );
  };

  const handleConfirm = () => {
    const selected = selections.filter((s) => s.selected);
    if (selected.length === 0) return;
    onConfirm(selections);
  };

  const entityCountMap = useMemo(() => {
    const map: Record<string, { line: number; block: number }> = {};
    for (const l of layers) {
      map[l.layer] = { line: l.entity_count, block: l.insert_count ?? 0 };
    }
    return map;
  }, [layers]);

  return (
    <div>
      {/* Baslik */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
            <Layers className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Layer Secimi</h3>
            <p className="text-xs text-muted-foreground">
              {layers.length} layer tespit edildi — {fileName}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => toggleAll(true)}
            className="rounded-lg border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Tumunu Sec
          </button>
          <button
            onClick={() => toggleAll(false)}
            className="rounded-lg border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Temizle
          </button>
        </div>
      </div>

      {/* Bilgilendirme */}
      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
        <p className="text-[11px] text-blue-700 leading-relaxed">
          <strong>Boru layer:</strong> Sol &quot;Sec&quot; kutusunu isaretle, hat ismi ver (orn: &quot;Yangin Hidrant Hatti&quot;).
          <br />
          <strong>Sprinkler layer:</strong> Entity kolonunda
          <span className="mx-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">▣</span>
          rozetli layer'lar INSERT block icerir (sprinkler adayi). Boylesinin
          <strong> Hat Ismi</strong> alanina
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">sprinkler</code>
          (veya <code className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">upright</code>/<code className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">pendant</code>) yazarsan,
          borular her sprinkler noktasinda bolunur. &quot;Sec&quot; isaretlemen gerekmez.
        </p>
      </div>

      {/* Layer Tablosu */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-10">Sec</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Layer Adi</th>
              <th
                className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 w-28"
                title="Cizgi (LINE/POLYLINE) + Block (INSERT) sayisi"
              >
                Entity
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-56">Hat Ismi (opsiyonel)</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-44">Malzeme Tipi</th>
            </tr>
          </thead>
          <tbody>
            {selections.map((sel) => (
              <tr
                key={sel.layer}
                className={cn(
                  'border-b border-slate-100 last:border-0 transition-colors cursor-pointer',
                  sel.selected
                    ? 'bg-blue-50/50 hover:bg-blue-50'
                    : 'hover:bg-slate-50/50',
                )}
                onClick={() => toggleSelect(sel.layer)}
              >
                {/* Checkbox */}
                <td className="px-4 py-2.5">
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border-2 transition-all',
                      sel.selected
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-slate-300 bg-white',
                    )}
                  >
                    {sel.selected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </td>

                {/* Layer Adi */}
                <td className="px-4 py-2.5">
                  <span className={cn(
                    'text-[13px] font-medium',
                    sel.selected ? 'text-slate-900' : 'text-slate-500',
                  )}>
                    {sel.layer}
                  </span>
                </td>

                {/* Entity Sayisi — cizgi + block ayri gosterilir */}
                <td className="px-4 py-2.5 text-right">
                  {(() => {
                    const c = entityCountMap[sel.layer] ?? { line: 0, block: 0 };
                    return (
                      <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
                        {c.line > 0 && (
                          <span className="text-slate-500" title="Cizgi (boru)">{c.line}</span>
                        )}
                        {c.block > 0 && (
                          <span
                            className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                            title="INSERT block (sprinkler/sembol)"
                          >
                            {c.block}▣
                          </span>
                        )}
                        {c.line === 0 && c.block === 0 && (
                          <span className="text-slate-300">0</span>
                        )}
                      </span>
                    );
                  })()}
                </td>

                {/* Hat Ismi — text input. "sprinkler"/"upright"/"pendant"
                    yazilirsa backend o layer'i sprinkler layer olarak algilar. */}
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={sel.hatIsmi}
                    onChange={(e) => changeHatIsmi(sel.layer, e.target.value)}
                    disabled={!sel.selected}
                    placeholder={sel.selected ? 'orn: Yangin Hidrant Hatti / sprinkler' : ''}
                    className={cn(
                      'w-full rounded-lg border bg-white px-3 py-1.5 text-xs outline-none transition-all',
                      sel.selected
                        ? 'border-blue-200 text-slate-700 placeholder:text-slate-300 hover:border-blue-300 focus:border-blue-400'
                        : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50',
                    )}
                  />
                </td>

                {/* Malzeme Tipi — serbest text input */}
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={sel.materialType}
                    onChange={(e) => changeMaterialType(sel.layer, e.target.value)}
                    disabled={!sel.selected}
                    placeholder={sel.selected ? 'orn: Siyah Boru / HDPE / PPR-C' : ''}
                    className={cn(
                      'w-full rounded-lg border bg-white px-3 py-1.5 text-xs outline-none transition-all',
                      sel.selected
                        ? 'border-blue-200 text-slate-700 placeholder:text-slate-300 hover:border-blue-300 focus:border-blue-400'
                        : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50',
                    )}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alt Bar */}
      <div className="mt-4 flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <div className="text-sm">
          <span className={cn(
            'font-semibold',
            selectedCount > 0 ? 'text-blue-600' : 'text-slate-400',
          )}>
            {selectedCount}
          </span>
          <span className="text-slate-500 ml-1">
            / {layers.length} layer secildi
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <X className="mr-1.5 inline h-3.5 w-3.5" />
            Iptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all',
              selectedCount > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            )}
          >
            Metraj Hesapla
          </button>
        </div>
      </div>
    </div>
  );
}
