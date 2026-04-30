'use client';

/**
 * Sag-tik context menu — viewer içerisinde tetiklenir.
 *
 * Davranis:
 *   - Boş alana sag-tik   → "Fit to screen", "Reset view", "Grid toggle"
 *   - (Ileride) Layer'a sag-tik → "Boru olarak isaretle", "Sprinkler" vb.
 *
 * Backdrop click veya Esc ile kapanir.
 */

import { useEffect, useRef } from 'react';
import { Maximize2, RotateCcw, Grid3x3 } from 'lucide-react';

export interface ViewerContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  /** Disabled olursa gri gosterilir, tiklama yutulur. */
  disabled?: boolean;
  /** Bolge ayraci icin true (ozel, label gozardi edilir). */
  separator?: boolean;
}

interface ViewerContextMenuProps {
  /** Ekran-uzayinda menunun konumu (clientX/Y). */
  x: number;
  y: number;
  items: ViewerContextMenuItem[];
  onClose: () => void;
}

export function ViewerContextMenu({ x, y, items, onClose }: ViewerContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Menu acilince odaklan ki Esc/blur calissin
  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Esc ile kapan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Ekran disindan tasmasin — saga/asagi tasarsa pozisyonu ayarla
  // (Basit clamp; menu ~180x200 px varsayalim).
  const W = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const H = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const MENU_W = 200;
  const MENU_H = items.length * 32 + 16;
  const clampedX = Math.min(x, W - MENU_W - 8);
  const clampedY = Math.min(y, H - MENU_H - 8);

  return (
    <>
      {/* Backdrop — disariya tiklayinca kapansin */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      {/* Menu */}
      <div
        ref={ref}
        tabIndex={-1}
        role="menu"
        className="fixed z-50 min-w-[180px] rounded-md border border-slate-700 bg-slate-900/95 backdrop-blur-sm py-1 shadow-xl outline-none"
        style={{ left: clampedX, top: clampedY }}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={`sep-${i}`} className="my-1 h-px bg-slate-700" />;
          }
          return (
            <button
              key={`${item.label}-${i}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) {
                  item.onSelect();
                  onClose();
                }
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                item.disabled
                  ? 'text-slate-500 cursor-not-allowed'
                  : 'text-slate-200 hover:bg-slate-800 cursor-pointer'
              }`}
            >
              {item.icon && <span className="flex h-3.5 w-3.5 items-center justify-center text-slate-400">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Default viewer aksiyonlarini (fit/reset/grid) saran factory — tipik
 * "bos alana sag-tik" senaryosu.
 */
export function buildDefaultMenuItems(opts: {
  onFit: () => void;
  onReset?: () => void;
  gridVisible?: boolean;
  onGridToggle?: () => void;
}): ViewerContextMenuItem[] {
  const items: ViewerContextMenuItem[] = [
    { label: 'Ekrana Sigdir (F)', icon: <Maximize2 className="h-3.5 w-3.5" />, onSelect: opts.onFit },
  ];
  if (opts.onReset) {
    items.push({ label: 'Goruntumu Sifirla', icon: <RotateCcw className="h-3.5 w-3.5" />, onSelect: opts.onReset });
  }
  if (typeof opts.gridVisible === 'boolean' && opts.onGridToggle) {
    items.push({ separator: true, label: '', onSelect: () => {} });
    items.push({
      label: opts.gridVisible ? 'Grid Kapat (G)' : 'Grid Ac (G)',
      icon: <Grid3x3 className="h-3.5 w-3.5" />,
      onSelect: opts.onGridToggle,
    });
  }
  return items;
}

export default ViewerContextMenu;
