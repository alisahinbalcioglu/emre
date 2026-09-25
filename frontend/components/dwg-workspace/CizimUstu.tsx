'use client';

/**
 * Cizimin ustundeki kucuk katmanlar (25.09 tasarimi):
 *  - IpucuHapi: sag ustte, her adimda ne yapilacagini tek cumleyle soyler.
 *  - DurumBildirimi: alt ortada ~4,5 sn; buyuk islemlerde "Geri al" baglantisi.
 *  - CizimLejanti: Adim 2'de sag altta (Çapsız parça / T noktası).
 * Hapi ve lejant fareyi YUTMAZ (pointer-events-none) — altlarindaki cizim
 * yakinlastirilabilir, tiklanabilir kalir.
 */

import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Ipucu } from './adim-durumu';
import { CAPSIZ_RENGI } from '../dwg-metraj/diameter-colors';

/** Konumu calisma alanindaki ust katman kabi verir: arac cubuguyla ayni
 *  satirda saga yaslanir, sigmazsa ALT satira iner (ust uste binmez). */
export function IpucuHapi({ ipucu }: { ipucu: Ipucu }) {
  return (
    <div
      className="pointer-events-none ml-auto flex min-h-9 min-w-0 max-w-[560px] items-center gap-2.5 rounded-[18px] border border-[#334155] bg-[rgba(15,23,42,0.92)] px-3.5 py-1.5 text-[13px] leading-snug text-[#f8fafc] max-md:hidden"
    >
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ipucu.renk }} />
      {/* Dar cizimde tek satira sigmazsa ikinci satira iner — kesilen ipucu
          ("… ile d…") yol gostermez. */}
      <span className="min-w-0">
        <span className="font-semibold">{ipucu.vurgu}</span>
        {ipucu.metin ? <> — {ipucu.metin}</> : null}
      </span>
      {ipucu.esc && (
        <span className="shrink-0 rounded border border-[#475569] px-1.5 text-[11px] text-[#94a3b8]">Esc</span>
      )}
    </div>
  );
}

export interface Bildirim {
  id: number;
  metin: string;
}

const GORUNME_SURESI = 4500;

/**
 * Bildirim ~4,5 sn gorunur; "Geri al" yalniz islem hala gecmisin
 * tepesindeyse cizilir (sonradan yapilan islemi geri almasin).
 *
 * 25.09 inceleme:
 *  - canli bolge (`role="status"`) HEP DOM'dadir; icerikle birlikte eklenen
 *    bolgeyi ekran okuyucular okumayabilir;
 *  - fare ustundeyken / odaktayken sure DURUR ("Geri al"a yetismek icin);
 *  - Katmanlar paneli aciksa bildirim panelin SAGINDAKI bosluga ortalanir
 *    (panelin alt dugmelerini ortuyordu).
 */
export function DurumBildirimi({
  bildirim,
  geriAlinabilir,
  panelAcik = false,
  onGeriAl,
  onKapan,
}: {
  bildirim: Bildirim | null;
  geriAlinabilir: boolean;
  panelAcik?: boolean;
  onGeriAl: () => void;
  onKapan: () => void;
}) {
  const [duraklatildi, setDuraklatildi] = useState(false);
  const bildirimId = bildirim?.id ?? null;

  useEffect(() => {
    setDuraklatildi(false);
  }, [bildirimId]);

  useEffect(() => {
    if (bildirimId === null || duraklatildi) return undefined;
    const t = setTimeout(onKapan, GORUNME_SURESI);
    return () => clearTimeout(t);
  }, [bildirimId, duraklatildi, onKapan]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute bottom-11 z-20 flex justify-center ${panelAcik ? 'left-[min(344px,50%)] right-3.5' : 'inset-x-4'}`}
    >
      {bildirim && (
        <div
          onMouseEnter={() => setDuraklatildi(true)}
          onMouseLeave={() => setDuraklatildi(false)}
          onFocus={() => setDuraklatildi(true)}
          onBlur={() => setDuraklatildi(false)}
          className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-[10px] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0f172a] shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        >
          <Check className="h-4 w-4 shrink-0 text-[#16a34a]" strokeWidth={2.5} aria-hidden="true" />
          <span className="min-w-0">{bildirim.metin}</span>
          {geriAlinabilir && (
            <button
              type="button"
              onClick={onGeriAl}
              className="ml-1 shrink-0 text-[13px] font-semibold text-[#1d4ed8] underline"
            >
              Geri al
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CizimLejanti() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-3.5 text-xs text-[#cbd5e1]">
      <span className="flex items-center gap-1.5">
        <svg width="16" height="4" aria-hidden="true">
          <line x1="0" y1="2" x2="16" y2="2" stroke={CAPSIZ_RENGI} strokeWidth="3" strokeDasharray="5 3" />
        </svg>
        Çapsız parça
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="box-border h-[9px] w-[9px] rounded-full border-[1.6px] border-[#e2e8f0]" />
        T noktası
      </span>
    </div>
  );
}
