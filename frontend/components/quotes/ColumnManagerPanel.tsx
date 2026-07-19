'use client';

// PRD v3.0 Bolum A1 — "Sutunlar" paneli: Excel-vari gizle/goster.
// GIZLE = yalniz gorsel (veri durur, toplama dahil kalir). KALDIR (A3) ayri.
// Kilitli sutunlar (NO + malzeme adi) gizlenemez — fiyat eslestirmesinin cipasi.

import { useEffect, useRef, useState } from 'react';
import { Columns3, Eye, EyeOff, Lock } from 'lucide-react';

export interface ColumnItem {
  field: string;
  headerName: string;
}

interface Props {
  columns: ColumnItem[];
  hidden: string[];
  locked: string[]; // gizlenemez (nameField + noField)
  onToggleHidden: (field: string) => void;
  onShowAll: () => void;
}

export default function ColumnManagerPanel({ columns, hidden, locked, onToggleHidden, onShowAll }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hiddenSet = new Set(hidden);
  const lockedSet = new Set(locked);
  const hiddenCount = columns.filter((c) => hiddenSet.has(c.field)).length;

  // disari tiklayinca kapat
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        title="Sütunları gizle/göster"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Sütunlar
        {hiddenCount > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
            {hiddenCount} gizli
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-64 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-700">Sütunlar</span>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={onShowAll}
                className="text-[11px] font-medium text-sky-600 hover:underline"
              >
                Tümünü göster
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {columns.map((c) => {
              const isLocked = lockedSet.has(c.field);
              const isHidden = hiddenSet.has(c.field);
              return (
                <button
                  key={c.field}
                  type="button"
                  disabled={isLocked}
                  onClick={() => onToggleHidden(c.field)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                    isLocked ? 'cursor-default text-slate-400' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title={isLocked ? 'Bu sütun gizlenemez (fiyat eşleştirme çıpası)' : isHidden ? 'Göster' : 'Gizle'}
                >
                  {isLocked ? (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  ) : isHidden ? (
                    <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                  )}
                  <span className={`flex-1 truncate ${isHidden ? 'text-slate-400 line-through' : ''}`}>
                    {c.headerName || c.field}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
