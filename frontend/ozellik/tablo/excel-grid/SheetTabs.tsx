'use client';

import React from 'react';

export interface SheetTabInfo {
  name: string;
  index: number;
  isEmpty?: boolean;
  discipline?: 'mechanical' | 'electrical' | null;
}

interface SheetTabsProps {
  sheets: SheetTabInfo[];
  activeIndex: number;
  onChange: (index: number) => void;
  onDisciplineChange?: (sheetIndex: number, discipline: 'mechanical' | 'electrical') => void;
  matchCounts?: Record<number, { total: number; matched: number }>;
  // Hangi disiplinlere izin var (capability)
  allowedDisciplines?: { mechanical: boolean; electrical: boolean };
}

export function SheetTabs({
  sheets,
  activeIndex,
  onChange,
  onDisciplineChange,
  matchCounts,
  allowedDisciplines,
}: SheetTabsProps) {
  const visible = sheets.filter((s) => !s.isEmpty);
  if (visible.length === 0) return null;

  function toggleDiscipline(e: React.MouseEvent, sheet: SheetTabInfo) {
    e.stopPropagation();
    if (!onDisciplineChange) return;
    const current = sheet.discipline;
    // Toggle: mechanical -> electrical -> mechanical
    let next: 'mechanical' | 'electrical' = current === 'mechanical' ? 'electrical' : 'mechanical';
    // Capability filter
    if (allowedDisciplines) {
      if (next === 'mechanical' && !allowedDisciplines.mechanical && allowedDisciplines.electrical) next = 'electrical';
      if (next === 'electrical' && !allowedDisciplines.electrical && allowedDisciplines.mechanical) next = 'mechanical';
    }
    onDisciplineChange(sheet.index, next);
  }

  return (
    <div className="flex items-stretch gap-1 bg-gray-100 border-t border-gray-300 px-2 py-1 overflow-x-auto sticky bottom-0 z-10">
      {visible.map((sheet) => {
        const active = sheet.index === activeIndex;
        const count = matchCounts?.[sheet.index];
        const discIcon = sheet.discipline === 'mechanical' ? '🔧' : sheet.discipline === 'electrical' ? '⚡' : '?';
        const discTitle = sheet.discipline === 'mechanical'
          ? 'Mekanik (degistirmek icin tikla)'
          : sheet.discipline === 'electrical'
            ? 'Elektrik (degistirmek icin tikla)'
            : 'Disiplin tespit edilemedi (sec)';
        return (
          <button
            key={sheet.index}
            type="button"
            onClick={() => onChange(sheet.index)}
            className={[
              'px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-t transition-colors border flex items-center gap-1.5',
              active
                ? 'bg-white border-gray-300 border-b-transparent text-blue-600 border-t-2 border-t-blue-500'
                : 'bg-gray-50 border-transparent text-gray-600 hover:bg-gray-200',
            ].join(' ')}
            title={sheet.name}
          >
            {onDisciplineChange ? (
              <span
                role="button"
                onClick={(e) => toggleDiscipline(e, sheet)}
                title={discTitle}
                className={[
                  'inline-flex items-center justify-center text-xs px-1 rounded',
                  sheet.discipline === 'mechanical'
                    ? 'bg-blue-100 text-blue-700'
                    : sheet.discipline === 'electrical'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-200 text-gray-500',
                ].join(' ')}
              >
                {discIcon}
              </span>
            ) : null}
            <span>{sheet.name}</span>
            {count && (
              <span
                className={[
                  'text-[10px] px-1.5 py-0.5 rounded',
                  count.matched === count.total
                    ? 'bg-green-100 text-green-700'
                    : count.matched > 0
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-200 text-gray-500',
                ].join(' ')}
              >
                {count.matched}/{count.total}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
