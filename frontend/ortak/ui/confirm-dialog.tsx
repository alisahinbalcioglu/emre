'use client';

// ── Onay popover renderer (layout'ta bir kez) ──
// use-confirm.ts singleton state'ini dinler; son tıklama koordinatında
// şık bir onay kartı açar. Ekran kenarına taşmayı önler, Esc/Enter destekler,
// dışarı tıklama = vazgeç.

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useConfirmController } from '@/ortak/hooks/use-confirm';
import { cn } from '@/ortak/lib/utils';

const CARD_W = 300; // px — clamp hesabı için
const MARGIN = 12;

export function ConfirmRoot() {
  const { open, x, y, id, opts, onConfirm, onCancel } = useConfirmController();
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // S1: `opts.input` verildiyse kart bir DEĞER kutusu gösterir. Kutunun
  // metni hem state'te (çizim için) hem ref'te (klavye dinleyicisi kapanış
  // anında güncel değeri okusun diye) tutulur.
  const girisVar = !!opts.input;
  const [deger, setDeger] = React.useState('');
  const degerRef = React.useRef('');
  const yaz = React.useCallback((v: string) => { setDeger(v); degerRef.current = v; }, []);

  // Her YENİ açılışta kutuyu başlangıç değerine döndür. Ölçüt `id`: aynı
  // metinle iki kez sorulduğunda `opts` eşit görünür, `id` görünmez.
  React.useEffect(() => {
    yaz(opts.input?.baslangic ?? '');
  }, [id, opts, yaz]);

  // Klavye: Esc → vazgeç, Enter → onayla. Açılınca odak: kutu varsa kutuya
  // (metin seçili), yoksa onay butonuna.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm(degerRef.current); }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      if (girisVar) { inputRef.current?.focus(); inputRef.current?.select(); }
      else confirmBtnRef.current?.focus();
    }, 0);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, girisVar, onConfirm, onCancel]);

  if (!open) return null;

  // Kartı tıklama noktasının yanına yerleştir, ekran içinde tut.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(Math.max(MARGIN, x - CARD_W / 2), vw - CARD_W - MARGIN);
  // Değer kutusu kartı ~50px uzatır — yer hesabı bunu bilmezse kutu ekranın
  // altından taşardı.
  const kartY = girisVar ? 210 : 160;
  const openUp = y > vh - (kartY + 20); // altta yer yoksa yukarı aç
  const top = openUp ? undefined : Math.min(y + 12, vh - kartY);
  const bottom = openUp ? vh - y + 12 : undefined;

  return (
    <div className="fixed inset-0 z-[100]" aria-hidden={false}>
      {/* Dışarı tıklama = vazgeç (görünmez katman, arka planı karartmaz) */}
      <div className="absolute inset-0" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ left, top, bottom, width: CARD_W }}
        className={cn(
          'absolute rounded-xl border bg-white p-4 shadow-2xl',
          'dark:bg-zinc-900 dark:border-zinc-700',
          'duration-150 animate-in fade-in-0 zoom-in-95',
          openUp ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1',
        )}
      >
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            {opts.title && (
              <p className="mb-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {opts.title}
              </p>
            )}
            <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-300">
              {opts.description}
            </p>
            {/* S1 — DEĞER KUTUSU. Görsel dil `ExcelGrid.tsx`'teki çalışan
                iskonto girişinden alındı (indigo kenarlık, sağa dayalı,
                küçük punto) — yeni bir tasarım uydurulmadı. */}
            {girisVar && (
              <input
                ref={inputRef}
                type={opts.input?.tip ?? 'text'}
                value={deger}
                onChange={(e) => yaz(e.target.value)}
                placeholder={opts.input?.yerTutucu}
                className="mt-2 h-7 w-full rounded border border-indigo-300 bg-white px-2 text-right text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            )}
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {opts.cancelText ?? 'Vazgeç'}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => onConfirm(deger)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            {opts.confirmText ?? 'Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}
