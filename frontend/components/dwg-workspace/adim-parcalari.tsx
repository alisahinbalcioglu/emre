'use client';

/**
 * Adim panelinin ortak kucuk parcalari (25.09 tasarimi).
 * Renkler Ekip ve Hesabim tasarimlariyla ayni: lacivert #0F172A, kenarlik
 * #E5E7EB, uyari #FFFBEB / #92400E, basari #F0FDF4 / #166534.
 */

import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';

export type RozetDurumu = 'aktif' | 'tamam' | 'bekliyor';

/** Adim numarasi: aktif = dolu lacivert, tamam = yesil tik, bekliyor = gri halka. */
export function AdimRozeti({ no, durum }: { no: number; durum: RozetDurumu }) {
  if (durum === 'tamam') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-white">
        <Check className="h-[13px] w-[13px]" strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{no}. adım tamamlandı</span>
      </span>
    );
  }
  if (durum === 'aktif') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-xs font-bold text-white">
        {no}
      </span>
    );
  }
  return (
    <span className="box-border flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#cbd5e1] text-xs font-semibold text-[#9ca3af]">
      {no}
    </span>
  );
}

/** Turuncu uyari satiri — "Çizim birimi değişti; …" + istege bagli dugme. */
export function UyariSatiri({
  metin,
  dugme,
  onDugme,
  dugmeKapali = false,
}: {
  metin: React.ReactNode;
  dugme?: string;
  onDugme?: () => void;
  dugmeKapali?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-x-2.5 gap-y-1.5 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-xs leading-normal text-[#92400e]">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{metin}</span>
      {dugme && onDugme && (
        <button
          type="button"
          onClick={onDugme}
          disabled={dugmeKapali}
          className="ml-auto h-7 shrink-0 rounded-md border border-[#f59e0b] bg-white px-2.5 text-xs font-semibold text-[#92400e] hover:bg-[#fef3c7] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dugme}
        </button>
      )}
    </div>
  );
}

/** "245,9 m" — Turkce, bir ondalik. */
export function metre(n: number): string {
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

/** "1.234" — sayac ve adetler Turkce binlik ayraciyla (baslikla ayni). */
export function adet(n: number): string {
  return n.toLocaleString('tr-TR');
}

/**
 * ARIA radyo grubu klavye sozlesmesi (25.09 inceleme: her secenek ayri Tab
 * duragiydi, ok tuslari calismiyordu). Gruba `onKeyDown` olarak verilir;
 * seceneklerde `tabIndex={secili ? 0 : -1}` kullanilir. Oklar secimi
 * degistirir ve odagi yeni secenege tasir (sonda basa doner).
 */
export function radyoOkTusu<T>(
  e: React.KeyboardEvent<HTMLElement>,
  secenekler: readonly T[],
  secili: T,
  sec: (deger: T) => void,
): void {
  const ileri = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  const geri = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
  if (!ileri && !geri) return;
  e.preventDefault();
  const i = Math.max(0, secenekler.indexOf(secili));
  const yeni = (i + (ileri ? 1 : -1) + secenekler.length) % secenekler.length;
  sec(secenekler[yeni]);
  const grup = e.currentTarget;
  const radyolar = grup.querySelectorAll<HTMLElement>('[role="radio"]');
  radyolar[yeni]?.focus();
}
