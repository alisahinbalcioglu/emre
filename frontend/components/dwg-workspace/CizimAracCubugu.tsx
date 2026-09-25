'use client';

/**
 * Cizimin sol ustundeki arac cubugu (25.09 tasarimi):
 *   Katmanlar | yakinlastir · uzaklastir · sigdir | [Adim 2: cap silgisi] geri al · yinele
 *
 * Geri al / Yinele HER ADIMDA gorunur; yapilacak islem yoksa pasif ve soluk.
 * Cubuk tuvalin KARDESIDIR (icinde degil): eskiden cubuga tiklama tuvale de
 * gidiyor, altindaki cizgiyi secebiliyordu. Konumu calisma alanindaki ust
 * katman kabi verir (ipucu hapiyla ayni satir, sigmazsa hap alta iner).
 * `role="group"`: ARIA toolbar ok tuslu gezinme vaat eder; burada her dugme
 * ayri Tab duragidir.
 */

import React from 'react';
import { Eraser, Layers, Maximize, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';

export interface CizimAracCubuguProps {
  katmanlarAcik: boolean;
  gizliSayisi: number;
  onKatmanlar: () => void;
  onYakinlas: () => void;
  onUzaklas: () => void;
  onSigdir: () => void;
  /** Cap silgisi yalniz Adim 2'de. */
  silgiGoster: boolean;
  silgiAcik: boolean;
  onSilgi: () => void;
  /** Geri alinacak islemin adi; `null` = yok (dugme pasif). */
  geriEtiketi: string | null;
  ileriEtiketi: string | null;
  /** Parcalara ayirma surerken gecmis kilitli. */
  gecmisKilitli: boolean;
  onGeriAl: () => void;
  onYinele: () => void;
}

const IKON = 'flex h-[34px] w-[34px] items-center justify-center rounded-[7px]';
const AYRAC = <span aria-hidden="true" className="mx-1 h-5 w-px bg-[#334155]" />;

export default function CizimAracCubugu(p: CizimAracCubuguProps) {
  const geriAcik = !!p.geriEtiketi && !p.gecmisKilitli;
  const ileriAcik = !!p.ileriEtiketi && !p.gecmisKilitli;
  return (
    <div
      role="group"
      aria-label="Çizim araçları"
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-0.5 rounded-[10px] border border-[#1e293b] bg-[rgba(15,23,42,0.92)] p-1"
    >
      <button
        type="button"
        aria-expanded={p.katmanlarAcik}
        aria-haspopup="dialog"
        onClick={p.onKatmanlar}
        className={
          'flex h-[34px] items-center gap-2 rounded-[7px] pl-2.5 pr-3 text-[13px] font-semibold ' +
          (p.katmanlarAcik ? 'bg-white text-[#0f172a]' : 'text-[#e2e8f0] hover:bg-[#1e293b]')
        }
      >
        <Layers className="h-[17px] w-[17px]" aria-hidden="true" />
        Katmanlar
        {!p.katmanlarAcik && p.gizliSayisi > 0 && (
          <span className="rounded-full bg-[#334155] px-1.5 text-[11px] font-semibold text-[#cbd5e1]">
            {p.gizliSayisi} gizli
          </span>
        )}
      </button>
      {AYRAC}
      <button type="button" aria-label="Yakınlaştır" title="Yakınlaştır" onClick={p.onYakinlas} className={`${IKON} text-[#cbd5e1] hover:bg-[#1e293b]`}>
        <ZoomIn className="h-[17px] w-[17px]" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Uzaklaştır" title="Uzaklaştır" onClick={p.onUzaklas} className={`${IKON} text-[#cbd5e1] hover:bg-[#1e293b]`}>
        <ZoomOut className="h-[17px] w-[17px]" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Tümünü sığdır" title="Tümünü sığdır" onClick={p.onSigdir} className={`${IKON} text-[#cbd5e1] hover:bg-[#1e293b]`}>
        <Maximize className="h-[17px] w-[17px]" aria-hidden="true" />
      </button>
      {AYRAC}
      {p.silgiGoster && (
        <button
          type="button"
          aria-label="Çap silgisi"
          aria-pressed={p.silgiAcik}
          title={p.silgiAcik ? 'Çap silgisi açık — parçaya tıklayınca çapı kalkar (Esc ile kapanır)' : 'Çap silgisi'}
          onClick={p.onSilgi}
          className={`${IKON} ${p.silgiAcik ? 'bg-[#f59e0b] text-[#0f172a]' : 'text-[#cbd5e1] hover:bg-[#1e293b]'}`}
        >
          <Eraser className="h-[17px] w-[17px]" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        aria-label="Geri al"
        disabled={!geriAcik}
        title={geriAcik ? `Geri al: ${p.geriEtiketi} (Ctrl+Z)` : 'Geri alınacak işlem yok'}
        onClick={p.onGeriAl}
        className={`${IKON} ${geriAcik ? 'text-[#cbd5e1] hover:bg-[#1e293b]' : 'cursor-default text-[#475569]'}`}
      >
        <Undo2 className="h-[17px] w-[17px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Yinele"
        disabled={!ileriAcik}
        title={ileriAcik ? `Yinele: ${p.ileriEtiketi} (Ctrl+Y)` : 'Yinelenecek işlem yok'}
        onClick={p.onYinele}
        className={`${IKON} ${ileriAcik ? 'text-[#cbd5e1] hover:bg-[#1e293b]' : 'cursor-default text-[#475569]'}`}
      >
        <Redo2 className="h-[17px] w-[17px]" aria-hidden="true" />
      </button>
    </div>
  );
}
