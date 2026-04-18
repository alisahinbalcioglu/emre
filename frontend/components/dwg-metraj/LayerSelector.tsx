'use client';

import React, { useState, useMemo } from 'react';
import { Layers, X, Eye, EyeOff, Sparkles, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Tipler ──

export type LayerRole = 'ignore' | 'pipe' | 'sprinkler';

export interface LayerInfo {
  layer: string;
  entity_count: number;
  /** INSERT (block reference) sayisi — genelde sprinkler/sembol layer'larini ayirt eder. */
  insert_count?: number;
  /** Backend'in onerdigi rol — UI ilk acildigin da bu pre-selected gelir. */
  suggested_role?: LayerRole;
}

export interface LayerSelection {
  layer: string;
  /** Kullanicinin layer icin belirledigi rol:
   *  - 'ignore': hesaba katilma
   *  - 'pipe': metraj hesabi icin boru layer'i
   *  - 'sprinkler': INSERT konumlari her sprinkler bir dal ayirici */
  role: LayerRole;
  hatIsmi: string;
  materialType: string; // "Siyah Boru", "HDPE", "PPR-C", vb. (bos = otomatik)
}

interface LayerSelectorProps {
  layers: LayerInfo[];
  fileName: string;
  onConfirm: (selections: LayerSelection[]) => void;
  onCancel: () => void;
}

// ── Rol buton ayarlari ──

const ROLE_OPTS: { value: LayerRole; label: string; color: string; Icon: typeof Eye }[] = [
  { value: 'ignore', label: 'Yoksay', color: 'slate', Icon: EyeOff },
  { value: 'pipe', label: 'Boru', color: 'blue', Icon: Waves },
  { value: 'sprinkler', label: 'Sprinkler', color: 'amber', Icon: Sparkles },
];

// ── Komponent ──

export default function LayerSelector({ layers, fileName, onConfirm, onCancel }: LayerSelectorProps) {
  const [selections, setSelections] = useState<LayerSelection[]>(() =>
    layers.map((l) => ({
      layer: l.layer,
      role: (l.suggested_role ?? 'ignore') as LayerRole,
      hatIsmi: '',
      materialType: '',
    })),
  );

  const pipeCount = useMemo(() => selections.filter((s) => s.role === 'pipe').length, [selections]);
  const sprinklerCount = useMemo(() => selections.filter((s) => s.role === 'sprinkler').length, [selections]);

  const setRole = (layer: string, role: LayerRole) => {
    setSelections((prev) =>
      prev.map((s) => (s.layer === layer ? { ...s, role } : s)),
    );
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
    if (pipeCount === 0) return;
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
      </div>

      {/* Bilgilendirme */}
      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
        <p className="text-[11px] text-blue-700 leading-relaxed">
          <strong>Rol kolonu:</strong> Her layer icin 3 secenek — <em>Yoksay</em> (gri), <em>Boru</em> (mavi), <em>Sprinkler</em> (amber).
          Sistem otomatik oneride bulunur; sprinkler adaylari amber Sprinkler seceneginde pre-selected gelir.
          Yanlis tespit varsa tek tikla degistirebilirsin. En az <strong>1 boru layer</strong> secmelisin.
        </p>
      </div>

      {/* Layer Tablosu */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-64">Rol</th>
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
            {selections.map((sel) => {
              const rowBg =
                sel.role === 'pipe' ? 'bg-blue-50/40 hover:bg-blue-50'
                : sel.role === 'sprinkler' ? 'bg-amber-50/40 hover:bg-amber-50'
                : 'hover:bg-slate-50/50';
              const isActive = sel.role !== 'ignore';
              return (
                <tr
                  key={sel.layer}
                  className={cn('border-b border-slate-100 last:border-0 transition-colors', rowBg)}
                >
                  {/* Rol — 3-state segment toggle */}
                  <td className="px-4 py-2">
                    <div className="inline-flex rounded-lg border bg-white p-0.5">
                      {ROLE_OPTS.map(({ value, label, color, Icon }) => {
                        const active = sel.role === value;
                        const activeClass =
                          color === 'blue' ? 'bg-blue-600 text-white'
                          : color === 'amber' ? 'bg-amber-500 text-white'
                          : 'bg-slate-400 text-white';
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setRole(sel.layer, value)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                              active ? activeClass : 'text-slate-500 hover:bg-slate-50',
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* Layer Adi */}
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'text-[13px] font-medium',
                      isActive ? 'text-slate-900' : 'text-slate-500',
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

                  {/* Hat Ismi — sadece boru rol'unde aktif */}
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={sel.hatIsmi}
                      onChange={(e) => changeHatIsmi(sel.layer, e.target.value)}
                      disabled={sel.role !== 'pipe'}
                      placeholder={sel.role === 'pipe' ? 'orn: Yangin Hidrant Hatti' : ''}
                      className={cn(
                        'w-full rounded-lg border bg-white px-3 py-1.5 text-xs outline-none transition-all',
                        sel.role === 'pipe'
                          ? 'border-blue-200 text-slate-700 placeholder:text-slate-300 hover:border-blue-300 focus:border-blue-400'
                          : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50',
                      )}
                    />
                  </td>

                  {/* Malzeme Tipi — serbest text input (sadece boru rol'unde aktif) */}
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={sel.materialType}
                      onChange={(e) => changeMaterialType(sel.layer, e.target.value)}
                      disabled={sel.role !== 'pipe'}
                      placeholder={sel.role === 'pipe' ? 'orn: Siyah Boru / HDPE / PPR-C' : ''}
                      className={cn(
                        'w-full rounded-lg border bg-white px-3 py-1.5 text-xs outline-none transition-all',
                        sel.role === 'pipe'
                          ? 'border-blue-200 text-slate-700 placeholder:text-slate-300 hover:border-blue-300 focus:border-blue-400'
                          : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50',
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Alt Bar */}
      <div className="mt-4 flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <div className="text-sm">
          <span className={cn('font-semibold', pipeCount > 0 ? 'text-blue-600' : 'text-slate-400')}>
            {pipeCount}
          </span>
          <span className="text-slate-500 ml-1">boru</span>
          <span className="mx-2 text-slate-300">·</span>
          <span className={cn('font-semibold', sprinklerCount > 0 ? 'text-amber-600' : 'text-slate-400')}>
            {sprinklerCount}
          </span>
          <span className="text-slate-500 ml-1">sprinkler</span>
          <span className="text-slate-400 ml-2">/ {layers.length}</span>
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
            disabled={pipeCount === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all',
              pipeCount > 0
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
