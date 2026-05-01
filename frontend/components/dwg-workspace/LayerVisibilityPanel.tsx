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
  const [open, setOpen] = useState(false);

  const hiddenSet = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const sortedLayers = useMemo(
    () => [...availableLayers].sort((a, b) => a.localeCompare(b)),
    [availableLayers],
  );

  if (availableLayers.length === 0) return null;

  const hiddenCount = hiddenLayers.length;

  return (
    <div className="rounded-xl border bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-b px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        )}
        <Layers className="h-3.5 w-3.5 text-slate-500" />
        <h4 className="text-xs font-semibold text-slate-700">Layer Goruntusu</h4>
        <span className="ml-auto text-[10px] text-slate-500">
          {hiddenCount > 0 ? `${hiddenCount}/${availableLayers.length} gizli` : `${availableLayers.length} layer`}
        </span>
      </button>

      {open && (
        <div>
          {hiddenCount > 0 && (
            <div className="border-b px-3 py-1.5">
              <button
                onClick={onShowAll}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
              >
                Tumunu Goster ({hiddenCount} gizli)
              </button>
            </div>
          )}

          <ul className="max-h-[40vh] overflow-y-auto py-1">
            {sortedLayers.map((layer) => {
              const isHidden = hiddenSet.has(layer);
              return (
                <li key={layer}>
                  <button
                    onClick={() => onToggle(layer)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors',
                      isHidden && 'opacity-50',
                    )}
                    title={isHidden ? 'Goster' : 'Gizle'}
                  >
                    {isHidden ? (
                      <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    )}
                    <span className={cn('truncate', isHidden ? 'text-slate-400' : 'text-slate-700')}>
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
