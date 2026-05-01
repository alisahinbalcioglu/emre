'use client';

/**
 * Layer goruntusu paneli — kullaniciya tum layer'lari listeler ve goz ikonu
 * ile her birini gosterip gizleyebilmesini saglar.
 *
 * Sadece gorsel filtre — hesaplanmis metraj, config veya secim etkilenmez.
 * Cizimde 50+ layer olan projelerde gereksiz katmanlari kapatip ilgilendigi
 * sisteme odaklanmak istedigi durum icin.
 */

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayerVisibilityPanelProps {
  availableLayers: string[];
  hiddenLayers: string[];
  onToggle: (layer: string) => void;
  onShowAll: () => void;
}

export default function LayerVisibilityPanel({
  availableLayers,
  hiddenLayers,
  onToggle,
  onShowAll,
}: LayerVisibilityPanelProps) {
  // Default acik — kullanicinin goz ikonu kesfetmesi icin gorunur baslar.
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
        <h4 className="text-sm font-semibold text-blue-900">Layer Goruntusu</h4>
        <span className="ml-auto text-[11px] font-medium text-blue-700">
          {hiddenCount > 0 ? `${hiddenCount}/${availableLayers.length} gizli` : `${availableLayers.length} layer`}
        </span>
      </button>

      {open && (
        <div>
          {/* Yardim ipucu — kullanici layer satirina tikla → gizle/goster */}
          <div className="border-b bg-slate-50/50 px-3 py-1.5">
            <p className="text-[10px] text-slate-500">
              Layer satirina tikla → gizle/goster. Tum cizimler/sembollar etkilenir.
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
              return (
                <li key={layer}>
                  <button
                    onClick={() => onToggle(layer)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                      'hover:bg-blue-50 cursor-pointer',
                      isHidden && 'bg-slate-50',
                    )}
                    title={isHidden ? 'Tikla → Goster' : 'Tikla → Gizle'}
                  >
                    {isHidden ? (
                      <EyeOff className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <Eye className="h-4 w-4 shrink-0 text-blue-600" />
                    )}
                    <span className={cn('truncate', isHidden ? 'text-slate-400 line-through' : 'text-slate-800 font-medium')}>
                      {layer}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
