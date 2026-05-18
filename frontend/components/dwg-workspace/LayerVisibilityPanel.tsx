'use client';

/**
 * Layer paneli — tüm layer'ları her biri ayrı satır olarak listeler.
 *
 * Üç tıklanır alan (her biri bağımsız):
 *  - 👁️ Göz ikonu       → görünürlük (hidden = canvas'tan tamamen kaldır)
 *  - 💡 Işık ikonu      → odak (dimmed = %25 opacity gri, tıklanamaz)
 *  - Sağ alan (ad)       → seç + çap girme popup'ını aç
 *
 * Kural: Hidden layer hiç çizilmez. Dimmed layer çizilir ama referans amaçlıdır,
 * hover/click yutmaz. Hidden ile Dimmed bağımsız — biri true diğeri false olabilir.
 *
 * Hesaplanmış layer'lar yeşil noktayla işaretlenir; default çapı atanmış
 * layer'ların yanında çap rozeti gösterilir.
 */

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Lightbulb, LightbulbOff, Layers, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayerVisibilityPanelProps {
  availableLayers: string[];
  hiddenLayers: string[];
  dimmedLayers: string[];
  selectedLayer?: string | null;
  /** Hesaplanmış layer ad seti — yeşil işaret göstermek için */
  calculatedLayers?: Set<string>;
  /** Layer -> atanmış çap haritası (defaultDiameter) — rozet göstermek için */
  layerDiameters?: Record<string, string>;
  onToggle: (layer: string) => void;
  onToggleDimmed: (layer: string) => void;
  onShowAll: () => void;
  onShowAllDimmed: () => void;
  /** Layer adına tıklanırsa: seç + çap popup'ını aç. clientX/Y popup pozisyonu için. */
  onLayerSelect?: (layer: string, screenX: number, screenY: number) => void;
}

export default function LayerVisibilityPanel({
  availableLayers,
  hiddenLayers,
  dimmedLayers,
  selectedLayer,
  calculatedLayers,
  layerDiameters,
  onToggle,
  onToggleDimmed,
  onShowAll,
  onShowAllDimmed,
  onLayerSelect,
}: LayerVisibilityPanelProps) {
  const [open, setOpen] = useState(true);

  const hiddenSet = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const dimmedSet = useMemo(() => new Set(dimmedLayers), [dimmedLayers]);
  const sortedLayers = useMemo(
    () => [...availableLayers].sort((a, b) => a.localeCompare(b)),
    [availableLayers],
  );

  if (availableLayers.length === 0) return null;

  const hiddenCount = hiddenLayers.length;
  const dimmedCount = dimmedLayers.length;

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-b px-3 py-2.5 bg-blue-50 hover:bg-blue-100 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-blue-600" />
        ) : (
          <ChevronRight className="h-4 w-4 text-blue-600" />
        )}
        <Layers className="h-4 w-4 text-blue-600" />
        <h4 className="text-sm font-semibold text-blue-900">Layer Listesi</h4>
        <span className="ml-auto text-[11px] font-medium text-blue-700">
          {availableLayers.length} layer
        </span>
      </button>

      {open && (
        <div>
          <div className="border-b bg-slate-50/50 px-3 py-1.5">
            <p className="text-[10px] text-slate-500">
              <span className="font-mono">👁️</span> Göz: gizle/göster · <span className="font-mono">💡</span> Işık: solgunlaş/parlat (tıklanamaz) · <span className="font-mono">Ad</span>: seç + çap gir
            </p>
          </div>

          {(hiddenCount > 0 || dimmedCount > 0) && (
            <div className="flex flex-wrap gap-3 border-b bg-amber-50/30 px-3 py-1.5">
              {hiddenCount > 0 && (
                <button
                  onClick={onShowAll}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800 underline"
                >
                  Gizliyi Aç ({hiddenCount})
                </button>
              )}
              {dimmedCount > 0 && (
                <button
                  onClick={onShowAllDimmed}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800 underline"
                >
                  Soluğu Parlat ({dimmedCount})
                </button>
              )}
            </div>
          )}

          <ul className="max-h-[50vh] overflow-y-auto py-1">
            {sortedLayers.map((layer) => {
              const isHidden = hiddenSet.has(layer);
              const isDimmed = dimmedSet.has(layer);
              const isSelected = selectedLayer === layer;
              const isCalculated = calculatedLayers?.has(layer) ?? false;
              const assignedDiameter = layerDiameters?.[layer];
              return (
                <li key={layer}>
                  <div
                    className={cn(
                      'group flex w-full items-center gap-1 px-2 transition-colors',
                      isSelected && 'bg-blue-100',
                      !isSelected && 'hover:bg-blue-50',
                      isHidden && !isSelected && 'bg-slate-50',
                    )}
                  >
                    {/* Göz ikonu — gizle/göster */}
                    <button
                      type="button"
                      onClick={() => onToggle(layer)}
                      className="shrink-0 rounded p-1.5 hover:bg-blue-100"
                      title={isHidden ? 'Goster' : 'Gizle'}
                    >
                      {isHidden ? (
                        <EyeOff className="h-4 w-4 text-slate-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-blue-600" />
                      )}
                    </button>

                    {/* Işık ikonu — odaklan/soluklaştır */}
                    <button
                      type="button"
                      onClick={() => onToggleDimmed(layer)}
                      className="shrink-0 rounded p-1.5 hover:bg-amber-100"
                      title={isDimmed ? 'Parlat (etkilesime ac)' : 'Soluklastir (referans yap)'}
                      disabled={isHidden}
                    >
                      {isDimmed ? (
                        <LightbulbOff className="h-4 w-4 text-slate-400" />
                      ) : (
                        <Lightbulb className={cn('h-4 w-4', isHidden ? 'text-slate-300' : 'text-amber-500')} />
                      )}
                    </button>

                    {/* Sağ: layer adı + rozet — seç + popup aç */}
                    <button
                      type="button"
                      onClick={(e) => onLayerSelect?.(layer, e.clientX, e.clientY)}
                      className={cn(
                        'flex flex-1 items-center gap-2 px-1 py-2 text-left text-xs min-w-0',
                        'cursor-pointer',
                      )}
                      title="Tikla → cap gir"
                    >
                      {isCalculated && (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                      )}
                      <span
                        className={cn(
                          'truncate',
                          isHidden && 'text-slate-400 line-through',
                          isDimmed && !isHidden && 'text-slate-400 italic',
                          !isHidden && !isDimmed && 'text-slate-800 font-medium',
                          isSelected && 'text-blue-900',
                        )}
                      >
                        {layer}
                      </span>
                      {assignedDiameter && (
                        <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-mono text-amber-800 border border-amber-200">
                          {assignedDiameter}
                        </span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
