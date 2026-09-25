'use client';

/**
 * DWG Analiz calisma basligi (25.09 tasarimi): geri, dosya adi + sayaclar,
 * "Birim: dm" (pencere acar), "Yeni DWG", "Fiyatlandırmaya geç".
 * Fiyatlandirma dugmesi pasifken ipucu NEDENINI soyler (`fiyatlandirmaEngeli`):
 * onay yok / onayli ama birimi degismis / ayirma suruyor.
 */

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronLeft, File, Ruler, Upload } from 'lucide-react';

const sayi = (n: number) => n.toLocaleString('tr-TR');

export interface CalismaBasligiProps {
  dosyaAdi: string;
  sayaclar: { layer: number; cizgi: number; blok: number } | null;
  /** "2/3 onaylı" — hesaplanan layer varsa. */
  onayOzeti: { onayli: number; toplam: number } | null;
  birimKisa: string;
  /** Yesil (guvenilir tespit / elle) ya da turuncu (dogrulanmali). */
  birimDogrulanmali: boolean;
  birimAcik: boolean;
  onBirimTikla: () => void;
  /** Birim penceresi — dugmenin altinda acilir. */
  birimPenceresi?: React.ReactNode;
  onYeniDwg: () => void;
  /** Fiyatlandirma neden kapali? `null` = acik. */
  fiyatlandirmaEngeli: string | null;
  onFiyatlandirmayaGec: () => void;
}

export default function CalismaBasligi({
  dosyaAdi,
  sayaclar,
  onayOzeti,
  birimKisa,
  birimDogrulanmali,
  birimAcik,
  onBirimTikla,
  birimPenceresi,
  onYeniDwg,
  fiyatlandirmaEngeli,
  onFiyatlandirmayaGec,
}: CalismaBasligiProps) {
  const altSatir = [
    sayaclar ? `${sayi(sayaclar.layer)} layer · ${sayi(sayaclar.cizgi)} çizgi · ${sayi(sayaclar.blok)} blok` : 'Çizim yükleniyor…',
    onayOzeti && onayOzeti.toplam > 0 ? `${sayi(onayOzeti.onayli)}/${sayi(onayOzeti.toplam)} onaylı` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
      <Link
        href="/quotes"
        aria-label="Geri"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#374151] hover:bg-slate-50"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      {/* Dar ekranda dosya adi en az ~200px yer ister; sigmazsa dugmeler alt
          satira iner (ad ezilip "…" olmasin, sayfa yatay kaymasin). */}
      <div className="flex min-w-[min(100%,200px)] flex-1 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eff6ff] text-[#1d4ed8]">
          <File className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-[-0.01em] text-[#111827]" title={dosyaAdi}>
            {dosyaAdi}
          </h1>
          <div className="mt-0.5 truncate text-xs text-[#6b7280]">{altSatir}</div>
        </div>
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={onBirimTikla}
            aria-expanded={birimAcik}
            aria-haspopup="dialog"
            className={
              'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold ' +
              (birimDogrulanmali
                ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
                : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]')
            }
          >
            <Ruler className="h-[15px] w-[15px]" aria-hidden="true" />
            Birim: {birimKisa}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {birimPenceresi}
        </div>
        <button
          type="button"
          onClick={onYeniDwg}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-[#111827] hover:bg-slate-50"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Yeni DWG
        </button>
        <button
          type="button"
          onClick={onFiyatlandirmayaGec}
          disabled={!!fiyatlandirmaEngeli}
          title={fiyatlandirmaEngeli ?? 'Onaylanan metrajlarla fiyatlandırmaya geç'}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0f172a] px-4 text-[13px] font-semibold text-white hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:bg-[#e5e7eb] disabled:text-[#6b7280]"
        >
          Fiyatlandırmaya geç
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
