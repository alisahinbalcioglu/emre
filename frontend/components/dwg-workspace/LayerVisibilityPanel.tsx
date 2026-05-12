'use client';

/**
 * Layer paneli — tüm layer'ları her biri ayrı satır olarak listeler.
 *
 * İki tıklanır alan:
 *  - Sol göz ikonu      → layer'ı gizle/göster (sadece görsel filtre)
 *  - Sağ alan (ad)      → layer'ı seç + çap girme popup'ını aç
 *
 * Hesaplanmış layer'lar yeşil noktayla işaretlenir; default çapı atanmış
 * layer'ların yanında çap rozeti gösterilir.
 */

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Layers, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayerVisibilityPanelProps {
  availableLayers: string[];
  hiddenLayers: string[];
  selectedLayer?: string | null;
  /** Hesaplanmış layer ad seti — yeşil işaret göstermek için */
  calculatedLayers?: Set<string>;
  /** Layer -> atanmış çap haritası (defaultDiameter) — rozet göstermek için */
  layerDiameters?: Record<string, string>;
  onToggle: (layer: string) => void;
  onShowAll: () => void;
  /** Layer adına tıklanırsa: seç + çap popup'ını aç. clientX/Y popup pozisyonu için. */
  onLayerSelect?: (layer: string, screenX: number, screenY: number) => void;
}

export default function LayerVisibilityPanel({
  availableLayers,
  hiddenLayers,
  selectedLayer,
  calculatedLayers,
  layerDiameters,
  onToggle,
  onShowAll,
  onLayerSelect,
}: LayerVisibilityPanelProps) {
  const [open, setOpen] = useState(true);

  const hiddenSet = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const sortedLayers = useMemo(
    () => [...availableLayers].sort((a, b) => a.localeCompare(b)),
    [availableLayers],
  );

  if (availableLayers.length === 0) return null;

  const hiddenCount = hiddenLayers.length;

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
          {hiddenCount > 0 ? `${hiddenCount}/${availableLayers.length} gizli` : `${availableLayers.length} layer`}
        </span>
      </button>

      {open && (
        <div>
          <div className="border-b bg-slate-50/50 px-3 py-1.5">
            <p className="text-[10px] text-slate-500">
              Layer adına tıkla → seç + çap gir · Göz ikonuna tıkla → gizle/göster
            </p>
          </div>

          {hiddenCount > 0 && (
            <div className="border-b px-3 py-1.5">
              <button
                onClick={onShowAll}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 underline"
              >
                Tumunu Goster ({hiddenCount} gizli)
              </button>
            </div>
          )}

          <ul className="max-h-[50vh] overflow-y-auto py-1">
            {sortedLayers.map((layer) => {
              const isHidden = hiddenSet.has(layer);
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
                    {/* Sol: göz ikonu — gizle/göster */}
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
                          isHidden ? 'text-slate-400 line-through' : 'text-slate-800 font-medium',
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
