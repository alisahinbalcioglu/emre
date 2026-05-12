'use client';

/**
 * Çizim üzerinde tıklanan layer için inline çap girme popup'ı.
 *
 * Kullanım: Kullanıcı canvas'ta bir boru çizgisine tıklar → bu popup
 * tıklama konumunda açılır. Hızlı seçim için 5 yaygın çap butonu
 * (Ø20, Ø25, Ø50, Ø100, Ø160) + manuel input. "Uygula" basınca
 * o layer'ın defaultDiameter'ı güncellenir, "Hesapla" sonrası bu
 * değer tüm boru segmentlerine atanır.
 *
 * AutoCAD-vari workflow: tıkla → çapı yaz → enter. Sidebar'a gitmeden.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';

const QUICK_DIAMETERS = ['Ø20', 'Ø25', 'Ø32', 'Ø40', 'Ø50', 'Ø63', 'Ø75', 'Ø100', 'Ø125', 'Ø160'];

export interface DiameterPromptPopupProps {
  /** Tıklanan layer adı (popup başlığında gösterilir). */
  layer: string;
  /** Mevcut çap (varsa) — düzenlemek için. */
  currentDiameter?: string;
  /** Ekran koordinatları (popup nereye açılacak). */
  x: number;
  y: number;
  /** Hat ismi (varsa) — bilgi olarak göster. */
  hatIsmi?: string;
  /** Çap uygulandı — state'e yaz, popup'i kapat. */
  onApply: (diameter: string) => void;
  /** Popup'i kapat (X butonu / dışına tıklama / Esc). */
  onClose: () => void;
}

export default function DiameterPromptPopup({
  layer,
  currentDiameter,
  x,
  y,
  hatIsmi,
  onApply,
  onClose,
}: DiameterPromptPopupProps) {
  const [value, setValue] = useState(currentDiameter ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Açılınca input'a otomatik focus
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Esc → kapat, Enter → uygula
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && value.trim()) {
        e.preventDefault();
        onApply(value.trim());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [value, onApply, onClose]);

  // Dışına tıklayınca kapat
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // setTimeout: aynı pointerdown'un kapatmasını engelle
    const t = setTimeout(() => {
      window.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Pozisyon — sayfa kenarlarından taşmasın
  const w = 320;
  const h = 230;
  const adjX = typeof window !== 'undefined' && x + w > window.innerWidth ? x - w : x + 10;
  const adjY = typeof window !== 'undefined' && y + h > window.innerHeight ? y - h : y + 10;

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-sm"
      style={{ left: adjX, top: adjY, width: w }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Çap Ata</span>
          <span className="text-xs font-medium text-slate-100 truncate max-w-[230px]" title={layer}>
            {layer}
          </span>
          {hatIsmi && (
            <span className="text-[10px] text-slate-400 truncate max-w-[230px]">{hatIsmi}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
          aria-label="Kapat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Quick buttons (yaygın çaplar) */}
      <div className="px-3 pt-3">
        <div className="text-[10px] text-slate-500 mb-1.5">Hızlı seçim</div>
        <div className="grid grid-cols-5 gap-1">
          {QUICK_DIAMETERS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setValue(d);
                onApply(d);
              }}
              className={`rounded px-2 py-1 text-[11px] font-mono transition-colors ${
                value === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Custom input */}
      <div className="px-3 pt-3 pb-3">
        <div className="text-[10px] text-slate-500 mb-1.5">Veya manuel gir</div>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ör: Ø80, DN50, 2&quot;"
            className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => onApply(value.trim())}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
          >
            <Check className="h-3 w-3" />
            Uygula
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono">Enter</kbd> uygula ·{' '}
          <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono">Esc</kbd> iptal
        </p>
      </div>
    </div>
  );
}
