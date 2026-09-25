'use client';

/**
 * Adim 2 — Cap atayin (25.09 tasarimi, ekran 3).
 *
 * Ilerleme cubugu ("Çap verilen parçalar 7 / 16"), capsiz sayisi + metresi,
 * "Çapsızları göster" (capli parcalar solar), arama + Ekle TEK kutu, malzemeye
 * gore gruplu cap listesi (PVC · HDPE · PPR-C · Çelik / siyah boru · Diğer).
 *
 * Tasarimda olmayan ama bugun calisan, KORUNANLAR:
 *  - "N çapsız parçaya X uygula" (toplu atama; tek geri alinabilir adim),
 *  - satirdaki hedef simgesi: o capin parcalari arasinda cizimde gezinme,
 *  - motorun olctugu sprinkler ipucu (💧 isaretsizken boru ustunde sembol).
 */

import React from 'react';
import { Check, Crosshair, Eye, Plus, Search, X } from 'lucide-react';
import type { CapGrubu, CapIlerlemesi, CapSatiri } from './cap-gruplari';
import { adet, AdimRozeti, metre, UyariSatiri } from './adim-parcalari';
import { CAPSIZ_RENGI } from '../dwg-metraj/diameter-colors';

export interface Adim2Props {
  acik: boolean;
  ilerleme: CapIlerlemesi;
  gruplar: CapGrubu[];
  sorgu: string;
  onSorgu: (s: string) => void;
  /** Aktif kalemin kanonik capi. */
  aktifCap: string | null;
  capsizOdak: boolean;
  onCapsizOdak: () => void;
  onCapSec: (satir: CapSatiri) => void;
  onEkle: () => void;
  onKalemSil: (kalemId: string) => void;
  /** Cizimde o capin (''=capsiz) siradaki parcasina git. */
  onGoster: (cap: string) => void;
  gosterilen: { cap: string; sira: number; toplam: number } | null;
  onTopluAta: () => void;
  sprinklerIpucu: { layer: string; on_pipe: number } | null;
  onKatmanlariAc: () => void;
  onayli: boolean;
}

function Satir({
  s,
  aktif,
  gosterilen,
  onSec,
  onGoster,
  onSil,
}: {
  s: CapSatiri;
  aktif: boolean;
  gosterilen: { cap: string; sira: number; toplam: number } | null;
  onSec: () => void;
  onGoster: () => void;
  onSil: (() => void) | null;
}) {
  const gezinme = gosterilen && gosterilen.cap === s.cap ? `${adet(gosterilen.sira + 1)}/${adet(gosterilen.toplam)}` : null;
  return (
    <li className={`group flex h-[38px] items-center rounded-lg ${aktif ? 'bg-[#eff6ff] shadow-[inset_0_0_0_1px_#bfdbfe]' : 'hover:bg-slate-50'}`}>
      <button
        type="button"
        aria-pressed={aktif}
        onClick={onSec}
        title={aktif ? 'Seçili çap — kapatmak için tekrar tıklayın (Esc)' : s.kalemId ? 'Bu çapı seç' : 'Bu çap parçalarda var — seçince listeye eklenir'}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left"
      >
        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.renk }} />
        <span className={`min-w-0 flex-1 truncate text-[13px] text-[#111827] ${aktif ? 'font-semibold' : 'font-medium'}`}>
          {s.cap}
        </span>
        <span className={`shrink-0 text-xs tabular-nums ${aktif ? 'text-[#1d4ed8]' : 'text-[#6b7280]'}`}>
          {gezinme ?? (s.parca > 0 ? `${metre(s.metre)} · ${adet(s.parca)}` : '—')}
        </span>
        {aktif
          ? <Check className="h-[15px] w-[15px] shrink-0 text-[#2563eb]" strokeWidth={2.5} aria-hidden="true" />
          : <span className="w-[15px] shrink-0" />}
      </button>
      {s.parca > 0 && (
        <button
          type="button"
          onClick={onGoster}
          aria-label={`${s.cap} parçalarını çizimde göster`}
          title="Çizimde göster (tekrar tıklayınca sıradaki parça)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#94a3b8] opacity-0 hover:bg-white hover:text-[#1d4ed8] focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {onSil && (
        <button
          type="button"
          onClick={onSil}
          aria-label={`${s.cap} kalemini listeden kaldır`}
          title="Listeden kaldır (parçalardaki çap değişmez)"
          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#94a3b8] opacity-0 hover:bg-white hover:text-[#b91c1c] focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export default function Adim2CapAta(p: Adim2Props) {
  if (!p.acik) {
    return (
      <section aria-labelledby="adim2" className="p-4">
        <div className="flex items-center gap-2.5">
          <AdimRozeti no={2} durum="bekliyor" />
          <h2 id="adim2" className="m-0 text-[15px] font-semibold text-[#9ca3af]">Çap atayın</h2>
        </div>
        <p className="ml-[34px] mt-1.5 text-xs text-[#6b7280]">Layer&apos;ı parçalara ayırdıktan sonra açılır.</p>
      </section>
    );
  }

  const { toplam, capli, capsiz, capsizMetre } = p.ilerleme;
  const oran = toplam > 0 ? Math.round((capli / toplam) * 100) : 0;
  const bos = p.gruplar.length === 0;

  return (
    <section aria-labelledby="adim2" className="p-4">
      <div className="flex items-center gap-2.5">
        <AdimRozeti no={2} durum="aktif" />
        <h2 id="adim2" className="m-0 text-[15px] font-semibold text-[#111827]">Çap atayın</h2>
      </div>
      <p className="ml-[34px] mt-2 text-[13px] leading-normal text-[#4b5563]">
        Listeden bir çap seçin, sonra çizimde o çaptaki parçalara tıklayın.
      </p>

      <div className="ml-[34px] mt-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold text-[#111827]">Çap verilen parçalar</span>
          <span className="text-[#4b5563]"><b className="text-[#111827]">{adet(capli)}</b> / {adet(toplam)}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={toplam}
          aria-valuenow={capli}
          aria-label="Çap verilen parçalar"
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1f5f9]"
        >
          <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${oran}%` }} />
        </div>
        {capsiz > 0 ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => p.onGoster('')}
              title="Çizimde çapsız parçaları tek tek göster"
              className="flex min-w-0 items-center gap-2 text-left text-xs text-[#92400e] hover:underline"
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CAPSIZ_RENGI }} />
              {adet(capsiz)} parça çapsız · {metre(capsizMetre)}
              {p.gosterilen && p.gosterilen.cap === '' ? ` (${adet(p.gosterilen.sira + 1)}/${adet(p.gosterilen.toplam)})` : ''}
            </button>
            <button
              type="button"
              aria-pressed={p.capsizOdak}
              onClick={p.onCapsizOdak}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold ${p.capsizOdak ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'text-[#1d4ed8] hover:bg-[#eff6ff]'}`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Çapsızları göster
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-xs text-[#166534]">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            Bütün parçalara çap verildi.
          </div>
        )}
        {p.aktifCap && capsiz > 0 && (
          <button
            type="button"
            onClick={p.onTopluAta}
            className="mt-1.5 text-left text-xs font-semibold text-[#1d4ed8] hover:underline"
          >
            {adet(capsiz)} çapsız parçanın hepsine {p.aktifCap} ver
          </button>
        )}
        {p.onayli && (
          <p className="mt-2 text-xs text-[#6b7280]">Metraj onaylı — bir parçanın çapını değiştirirseniz onay kalkar.</p>
        )}
      </div>

      {p.sprinklerIpucu && (
        <div className="ml-[34px]">
          <UyariSatiri
            metin={
              <>
                “{p.sprinklerIpucu.layer}” katmanında {p.sprinklerIpucu.on_pipe} sembol boruların üstünde.
                Sprinkler ise Katmanlar&apos;dan 💧 ile işaretleyip yeniden ayırın — borular sprinkler
                noktalarında bölünür.
              </>
            }
            dugme="Katmanlar"
            onDugme={p.onKatmanlariAc}
          />
        </div>
      )}

      <div className="mb-1.5 mt-3.5 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-[11px] top-[11px] h-[15px] w-[15px] text-[#9ca3af]" aria-hidden="true" />
          <label htmlFor="cap-ara" className="sr-only">Çap ara ya da ekle</label>
          <input
            id="cap-ara"
            type="text"
            value={p.sorgu}
            onChange={(e) => p.onSorgu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && p.sorgu.trim()) {
                e.preventDefault();
                p.onEkle();
              }
            }}
            placeholder='Çap ara ya da ekle: Ø50, DN100, 2"'
            className="h-9 w-full rounded-lg border border-[#d1d5db] bg-white pl-[34px] pr-3 text-[13px] text-[#111827] outline-none focus:border-[#60a5fa]"
          />
        </div>
        <button
          type="button"
          onClick={p.onEkle}
          disabled={!p.sorgu.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-semibold text-[#111827] hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-[#9ca3af]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Ekle
        </button>
      </div>

      {bos ? (
        <p className="px-2.5 py-3 text-xs text-[#6b7280]">
          {p.sorgu.trim()
            ? `“${p.sorgu.trim()}” listede yok — “Ekle” ile ekleyin.`
            : 'Henüz çap yok. Kutuya çapı malzemesiyle yazıp ekleyin (örn. Ø110 PVC BORU).'}
        </p>
      ) : (
        <div role="group" aria-label="Çap kalemleri">
          {p.gruplar.map((g) => (
            <div key={g.grup ?? 'hepsi'}>
              {g.grup && (
                <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7280]">
                  {g.grup}
                </div>
              )}
              <ul>
                {g.satirlar.map((s) => (
                  <Satir
                    key={s.cap}
                    s={s}
                    aktif={p.aktifCap === s.cap}
                    gosterilen={p.gosterilen}
                    onSec={() => p.onCapSec(s)}
                    onGoster={() => p.onGoster(s.cap)}
                    onSil={s.kalemId ? () => p.onKalemSil(s.kalemId as string) : null}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
