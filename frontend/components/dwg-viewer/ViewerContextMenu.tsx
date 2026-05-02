'use client';

/**
 * AutoCAD-vari right-click context menu.
 *
 * Tetikleyici: DxfPixiViewer'da pointerdown (button=2) → world coord →
 * Worker.pick(x,y,zoom) → entity (varsa) + screen coord → setContextMenu(...)
 *
 * Aksiyonlar:
 *   - Hide Layer (LAYER_NAME)
 *   - Isolate Layer (LAYER_NAME)
 *   - (separator)
 *   - Show All Layers
 *   - (separator)
 *   - Properties (entity bilgisi popup, opsiyonel)
 *
 * Klavye kisayollari (DxfPixiViewer'da useViewerKeyboard ile):
 *   H = Hide last clicked layer
 *   I = Isolate last clicked layer
 *   A = Show All
 *   Esc = Clear selection / close menu
 */

import React, { useEffect, useRef } from 'react';
import { EyeOff, Filter, Eye, Info } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  separator?: boolean;
}

export interface ViewerContextMenuProps {
  x: number;
  y: number;
  layerName: string | null;       // Tikla edilen entity'nin layer'i
  entityType?: string;             // line | circle | insert ...
  hasIsolation: boolean;           // isolatedLayer aktif mi (UI hint icin)
  onHideLayer: (layer: string) => void;
  onIsolateLayer: (layer: string) => void;
  onShowAll: () => void;
  onProperties?: () => void;
  onClose: () => void;
}

export default function ViewerContextMenu({
  x, y, layerName, entityType, hasIsolation,
  onHideLayer, onIsolateLayer, onShowAll, onProperties, onClose,
}: ViewerContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Disariya tikla → kapat
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // setTimeout: aynı pointerdown event'i kapatmasin diye 1 frame ertele
    const t = setTimeout(() => {
      window.addEventListener('mousedown', handler);
      window.addEventListener('contextmenu', handler);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('contextmenu', handler);
    };
  }, [onClose]);

  // Esc ile kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const items: ContextMenuItem[] = [];

  if (layerName) {
    items.push({
      label: `Layer'i Gizle (${layerName})`,
      icon: <EyeOff className="h-3.5 w-3.5" />,
      onClick: () => { onHideLayer(layerName); onClose(); },
    });
    items.push({
      label: `Layer'i Izole Et (${layerName})`,
      icon: <Filter className="h-3.5 w-3.5" />,
      onClick: () => { onIsolateLayer(layerName); onClose(); },
    });
    items.push({ label: '', onClick: () => {}, separator: true });
  }

  items.push({
    label: 'Tum Layer\'lari Goster',
    icon: <Eye className="h-3.5 w-3.5" />,
    onClick: () => { onShowAll(); onClose(); },
  });

  if (onProperties && layerName) {
    items.push({ label: '', onClick: () => {}, separator: true });
    items.push({
      label: 'Ozellikler',
      icon: <Info className="h-3.5 w-3.5" />,
      onClick: () => { onProperties(); onClose(); },
    });
  }

  // Sayfa kenarlarindan tasmamak icin pozisyonu ayarla
  const menuWidth = 240;
  const menuHeight = items.length * 32 + 8;
  const adjX = typeof window !== 'undefined' && x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjY = typeof window !== 'undefined' && y + menuHeight > window.innerHeight ? y - menuHeight : y;

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-md border border-slate-700 bg-slate-900 shadow-lg py-1 text-xs text-slate-100 min-w-[200px]"
      style={{ left: adjX, top: adjY, width: menuWidth }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) =>
        item.separator ? (
          <div key={idx} className="my-1 border-t border-slate-700" />
        ) : (
          <button
            key={idx}
            type="button"
            onClick={item.onClick}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-700 transition-colors"
          >
            {item.icon}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        )
      )}
      {hasIsolation && (
        <div className="border-t border-slate-700 mt-1 px-3 py-1 text-[10px] text-amber-400">
          Layer izolasyonu aktif
        </div>
      )}
      {entityType && (
        <div className="border-t border-slate-700 mt-1 px-3 py-1 text-[10px] text-slate-500">
          {entityType.toUpperCase()}
        </div>
      )}
    </div>
  );
}
