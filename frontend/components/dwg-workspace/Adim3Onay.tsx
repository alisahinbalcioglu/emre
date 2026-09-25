'use client';

/**
 * Adim 3 — Metraji onaylayin (25.09 tasarimi). Panelin altinda SABIT durur.
 *
 *  bekliyor     : gri baslik + "Çaplar atandıktan sonra …"
 *  onayla       : toplam metraj + capsiz notu + "a-yağmur metrajını onayla"
 *  onayli       : yesil "Onaylandı · fiyatlandırmaya hazır" + "Geri al"
 *                 ("Geri al" ONAYI kaldirir — genel geri al degil).
 *  onayli-bayat : turuncu "Onaylı, ama çizim birimi değişti — teklife girmez"
 *                 + "Yeniden ayır" (25.09 inceleme: burada "hazır" yaziyordu,
 *                 baslik "0/1 onaylı" diyordu).
 *
 * Capsiz parcanin teklifteki adi "Belirtilmemiş"tir (quotes/new, metrajdan
 * teklife gecis); tasarimdaki "Çapı belirlenemeyen" ifadesi teklifte yok —
 * kullanici teklifte gorecegi kelimeyi burada da gormeli.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Adim3Durumu } from './adim-durumu';
import { AdimRozeti, metre } from './adim-parcalari';

export interface Adim3Props {
  durum: Adim3Durumu;
  layer: string | null;
  toplamMetre: number;
  capsiz: number;
  /** Onay dugmesi neden kapali (`null` = acik). */
  engel: string | null;
  /** Parcalara ayirma suruyor — "Yeniden ayır" kapali. */
  ayriliyor: boolean;
  onOnayla: () => void;
  onOnayiKaldir: () => void;
  onYenidenAyir: () => void;
}

const BASLIK_ID = 'adim3-baslik';

export default function Adim3Onay(p: Adim3Props) {
  if (p.durum === 'bekliyor') {
    return (
      <section aria-labelledby={BASLIK_ID} className="shrink-0 border-t border-[#eef0f3] bg-[#fafafa] px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-2.5">
          <AdimRozeti no={3} durum="bekliyor" />
          <h2 id={BASLIK_ID} className="m-0 flex-1 text-[15px] font-semibold text-[#9ca3af]">Metrajı onaylayın</h2>
        </div>
        <div className="ml-[34px] mt-1 text-xs text-[#6b7280]">
          Çaplar atandıktan sonra metrajı onaylayıp fiyatlandırmaya geçersiniz.
        </div>
      </section>
    );
  }

  const onayli = p.durum === 'onayli' || p.durum === 'onayli-bayat';
  return (
    <section aria-labelledby={BASLIK_ID} className="shrink-0 border-t border-[#eef0f3] bg-[#fafafa] px-4 pb-4 pt-3.5">
      <div className="flex items-center gap-2.5">
        <AdimRozeti no={3} durum={onayli ? 'tamam' : 'aktif'} />
        <h2 id={BASLIK_ID} className="m-0 flex-1 text-[15px] font-semibold text-[#111827]">Metrajı onaylayın</h2>
        <span className="text-xl font-semibold tracking-[-0.01em] text-[#111827]">{metre(p.toplamMetre)}</span>
      </div>
      {p.durum === 'onayli' && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2.5">
          <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[#16a34a]" aria-hidden="true" />
          <span className="flex-1 text-[13px] font-semibold text-[#166534]">Onaylandı · fiyatlandırmaya hazır</span>
          <button
            type="button"
            onClick={p.onOnayiKaldir}
            aria-label="Onayı geri al"
            title="Onayı kaldırır; çapları düzeltip yeniden onaylayabilirsiniz"
            className="h-7 shrink-0 px-1.5 text-xs font-semibold text-[#1d4ed8] hover:underline"
          >
            Geri al
          </button>
        </div>
      )}
      {p.durum === 'onayli-bayat' && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d97706]" aria-hidden="true" />
          <span className="flex-1 text-[13px] leading-snug text-[#92400e]">
            <strong className="font-semibold">Onaylı, ama çizim birimi değişti</strong> — teklife girmez. Önce yeni birimle yeniden ayırın; çap etiketleri korunur.
          </span>
          <button
            type="button"
            onClick={p.onYenidenAyir}
            disabled={p.ayriliyor}
            className="h-7 shrink-0 rounded-md border border-[#fcd34d] bg-white px-2 text-xs font-semibold text-[#92400e] hover:bg-[#fef3c7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Yeniden ayır
          </button>
        </div>
      )}
      {p.durum === 'onayla' && (
        <>
          <div className="ml-[34px] mt-1 text-xs leading-normal text-[#6b7280]">
            {p.capsiz > 0
              ? `Çapsız ${p.capsiz.toLocaleString('tr-TR')} parça teklife “Belirtilmemiş” olarak geçer.`
              : 'Bütün parçaların çapı var.'}
          </div>
          {/* Uzun layer adi kesilse de fiil ("metrajını onayla") gorunur kalir. */}
          <button
            type="button"
            onClick={p.onOnayla}
            disabled={!!p.engel}
            title={p.engel ?? `${p.layer} metrajını onayla`}
            className="mt-3 flex h-10 w-full items-center justify-center rounded-lg bg-[#0f172a] px-3 text-sm font-semibold text-white hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:bg-[#e5e7eb] disabled:text-[#6b7280]"
          >
            <span className="min-w-0 truncate">{p.layer}</span>
            <span className="shrink-0 whitespace-pre"> metrajını onayla</span>
          </button>
          {p.engel && <div className="mt-1.5 text-xs text-[#92400e]">{p.engel}</div>}
        </>
      )}
    </section>
  );
}
