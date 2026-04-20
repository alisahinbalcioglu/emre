'use client';

/**
 * Cap duzenleme popup — edge segment'e tiklaninca acilir.
 * Kullanici standart caplardan secer veya ozel deger girer.
 * Tamamen izole — dwg-viewer klasoru disindaki hic bir sey ile bagi yoktur.
 */

import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { EdgeSegment } from './types';

const STANDARD_DIAMETERS = [
  '1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"',
  '2"', '2 1/2"', '3"', '4"', '5"', '6"', '8"',
];

interface DiameterEditPopupProps {
  segment: EdgeSegment;
  onCancel: () => void;
  onSave: (segmentId: number, newDiameter: string) => void;
}

export default function DiameterEditPopup({ segment, onCancel, onSave }: DiameterEditPopupProps) {
  const [selected, setSelected] = useState(segment.diameter || '');
  const [custom, setCustom] = useState('');

  const handleSave = () => {
    const final = custom.trim() || selected;
    if (!final) return;
    onSave(segment.segment_id, final);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Çap Düzenle</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {segment.layer} · segment #{segment.segment_id} · {segment.length.toFixed(2)} m
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700"
            title="İptal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">Mevcut</p>
          <p className="text-sm font-mono text-slate-800">
            {segment.diameter || 'Belirtilmemis'}
          </p>
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-slate-600">Standart çaplardan seç</p>
          <div className="grid grid-cols-4 gap-1.5">
            {STANDARD_DIAMETERS.map((d) => (
              <button
                key={d}
                onClick={() => { setSelected(d); setCustom(''); }}
                className={
                  'rounded-lg border py-1.5 text-xs font-mono transition-colors ' +
                  (selected === d && !custom
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-400')
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-slate-600">veya özel değer gir</p>
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder='örn: Ø50, DN65, 1 3/8"'
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={!custom.trim() && !selected}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4" />
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
