'use client';

/**
 * Katmanlar paneli (25.09 tasarimi, ekran 4) — projedeki butun layer'lar.
 * Cizimin sol ustunde, cizimin ustunde acilir.
 *
 * Sira: baslik ("Katmanlar 163") · dort maddelik gosterge · arama ·
 * Tümü / Görünen / Gizli süzgeci · liste · toplu islemler.
 * Satir: göz (göster/gizle) · renk · ad (tıkla = boru layer'ı olarak seç) ·
 * çizgi sayısı · soluklaştır · sprinkler.
 *
 * Gizle / soluklastir / 💧 GORUNUM tercihidir — geri alma gecmisine yazilmaz;
 * ayni dugme eski haline dondurur.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Droplet,
  Eye,
  EyeOff,
  Layers,
  MousePointerClick,
  Search,
  Sun,
  SunDim,
  X,
} from 'lucide-react';
import { katmanlariSuz, type KatmanOzeti, type KatmanSuzgeci } from './boru-adaylari';
import { radyoOkTusu } from './adim-parcalari';

export type KatmanHesapDurumu = 'onayli' | 'hesaplandi' | 'bayat';

export interface KatmanlarPaneliProps {
  katmanlar: KatmanOzeti[];
  gizliler: ReadonlySet<string>;
  solukler: ReadonlySet<string>;
  sprinklerlar: ReadonlySet<string>;
  seciliLayer: string | null;
  hesapDurumu: Readonly<Record<string, KatmanHesapDurumu>>;
  onKapat: () => void;
  onGizle: (ad: string) => void;
  onSoluklastir: (ad: string) => void;
  onSprinkler: (ad: string) => void;
  onSec: (ad: string) => void;
  onTumunuGoster: () => void;
  onYalnizBoru: () => void;
}

const SUZGECLER: { deger: KatmanSuzgeci; ad: string }[] = [
  { deger: 'tumu', ad: 'Tümü' },
  { deger: 'gorunen', ad: 'Görünen' },
  { deger: 'gizli', ad: 'Gizli' },
];

const DURUM_IPUCU: Record<KatmanHesapDurumu, string> = {
  onayli: 'Metrajı onaylı',
  hesaplandi: 'Parçalara ayrıldı',
  bayat: 'Yeniden ayrılmalı',
};

/** Hesap durumu yalniz renkle ayrilmaz (renk korlugu): her durumun kendi
 *  simgesi ve okunur adi var. */
function DurumSimgesi({ durum }: { durum: KatmanHesapDurumu }) {
  const ortak = { role: 'img', 'aria-label': DURUM_IPUCU[durum] } as const;
  if (durum === 'onayli') {
    return <CheckCircle2 {...ortak} className="h-3.5 w-3.5 shrink-0 text-[#16a34a]"><title>{DURUM_IPUCU[durum]}</title></CheckCircle2>;
  }
  if (durum === 'bayat') {
    return <AlertTriangle {...ortak} className="h-3.5 w-3.5 shrink-0 text-[#d97706]"><title>{DURUM_IPUCU[durum]}</title></AlertTriangle>;
  }
  return <CircleDot {...ortak} className="h-3.5 w-3.5 shrink-0 text-[#64748b]"><title>{DURUM_IPUCU[durum]}</title></CircleDot>;
}

export default function KatmanlarPaneli(p: KatmanlarPaneliProps) {
  const [sorgu, setSorgu] = useState('');
  const [suzgec, setSuzgec] = useState<KatmanSuzgeci>('tumu');
  const liste = useMemo(
    () => katmanlariSuz(p.katmanlar, sorgu, suzgec, p.gizliler),
    [p.katmanlar, sorgu, suzgec, p.gizliler],
  );
  const gizliSayisi = p.gizliler.size;

  // Odak: acilinca arama kutusuna; kapaninca paneli acan ogeye doner
  // (25.09 inceleme: kapaninca odak <body>'ye dusuyordu).
  const aramaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onceki = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
    aramaRef.current?.focus();
    return () => {
      if (onceki && typeof document !== 'undefined' && document.contains(onceki)) onceki.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-labelledby="katman-baslik"
      className="pointer-events-auto flex min-h-0 w-[316px] max-w-full flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center gap-2 px-3.5 pb-2 pl-3.5 pr-2.5 pt-3">
        <Layers className="h-[17px] w-[17px] text-[#1d4ed8]" aria-hidden="true" />
        <h2 id="katman-baslik" className="m-0 flex-1 text-sm font-semibold text-[#111827]">
          Katmanlar <span className="font-medium text-[#6b7280]">{p.katmanlar.length.toLocaleString('tr-TR')}</span>
        </h2>
        <button
          type="button"
          aria-label="Kapat"
          onClick={p.onKapat}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#6b7280] hover:bg-slate-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 px-3.5 pb-2.5 text-[11px] text-[#4b5563]">
        <span className="flex items-center gap-1.5"><Eye className="h-[13px] w-[13px]" aria-hidden="true" />Göster / gizle</span>
        <span className="flex items-center gap-1.5"><Sun className="h-[13px] w-[13px]" aria-hidden="true" />Soluklaştır</span>
        <span className="flex items-center gap-1.5"><Droplet className="h-[13px] w-[13px]" aria-hidden="true" />Sprinkler işaretle</span>
        <span className="flex items-center gap-1.5"><MousePointerClick className="h-[13px] w-[13px]" aria-hidden="true" />Ada tıkla: boru seç</span>
      </div>

      <div className="relative px-3 pb-2">
        <Search className="pointer-events-none absolute left-[23px] top-2.5 h-[15px] w-[15px] text-[#9ca3af]" aria-hidden="true" />
        <label htmlFor="katman-ara" className="sr-only">Katman ara</label>
        <input
          ref={aramaRef}
          id="katman-ara"
          type="text"
          value={sorgu}
          onChange={(e) => setSorgu(e.target.value)}
          placeholder="Katman ara"
          className="h-[34px] w-full rounded-lg border border-[#d1d5db] bg-white pl-[34px] pr-3 text-[13px] text-[#111827] outline-none focus:border-[#60a5fa]"
        />
      </div>

      <div
        role="radiogroup"
        aria-label="Katman süzgeci"
        onKeyDown={(e) => radyoOkTusu(e, SUZGECLER.map((s) => s.deger), suzgec, setSuzgec)}
        className="mx-3 mb-1.5 grid grid-cols-3 gap-0.5 rounded-lg bg-[#f1f5f9] p-[3px]"
      >
        {SUZGECLER.map((s) => {
          const aktif = suzgec === s.deger;
          return (
            <button
              key={s.deger}
              type="button"
              role="radio"
              aria-checked={aktif}
              tabIndex={aktif ? 0 : -1}
              onClick={() => setSuzgec(s.deger)}
              className={
                'h-7 rounded-md text-xs ' +
                (aktif
                  ? 'bg-white font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.12)]'
                  : 'font-medium text-[#4b5563] hover:text-[#111827]')
              }
            >
              {s.deger === 'gizli' ? `${s.ad} (${gizliSayisi})` : s.ad}
            </button>
          );
        })}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 pt-0.5">
        {liste.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-[#6b7280]">
            {sorgu ? 'Aramaya uyan katman yok.' : suzgec === 'gizli' ? 'Gizli katman yok.' : 'Katman yok.'}
          </li>
        )}
        {liste.map((k) => {
          const gizli = p.gizliler.has(k.ad);
          const soluk = p.solukler.has(k.ad);
          const sprinkler = p.sprinklerlar.has(k.ad);
          const secili = p.seciliLayer === k.ad;
          const durum = p.hesapDurumu[k.ad];
          // Secili boru layer'i gizlenemez / soluklastirilamaz: Adim 2'de
          // parcalari cizilmez ve tiklanamaz olurdu (geri acmak serbest).
          const gizleKilitli = secili && !gizli;
          const solukKilitli = secili && !soluk;
          return (
            <li
              key={k.ad}
              className={`flex h-9 items-center gap-1 rounded-lg px-1 ${secili ? 'bg-[#eff6ff]' : ''}`}
            >
              <button
                type="button"
                aria-label={gizli ? `${k.ad} göster` : `${k.ad} gizle`}
                title={gizleKilitli ? "Seçili boru layer'ı gizlenemez — önce Değiştir" : gizli ? 'Göster' : 'Gizle'}
                disabled={gizleKilitli}
                onClick={() => p.onGizle(k.ad)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${gizli ? 'text-[#9ca3af]' : 'text-[#334155]'}`}
              >
                {gizli ? <EyeOff className="h-[15px] w-[15px]" aria-hidden="true" /> : <Eye className="h-[15px] w-[15px]" aria-hidden="true" />}
              </button>
              <span
                aria-hidden="true"
                className="mx-1 h-[9px] w-[9px] shrink-0 rounded-[3px]"
                style={{ backgroundColor: k.renk, opacity: gizli ? 0.35 : 1 }}
              />
              <button
                type="button"
                onClick={() => p.onSec(k.ad)}
                title={`${k.ad} — boru layer'ı olarak seç`}
                className={
                  'min-w-0 flex-1 truncate p-0 text-left text-[13px] font-medium ' +
                  (gizli ? 'text-[#9ca3af]' : soluk ? 'text-[#6b7280]' : 'text-[#111827]')
                }
              >
                {k.ad}
              </button>
              {durum && !secili && <DurumSimgesi durum={durum} />}
              {secili && (
                <span className="shrink-0 rounded-full bg-[#dbeafe] px-1.5 text-[10px] font-bold leading-[18px] text-[#1d4ed8]">BORU</span>
              )}
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-[#6b7280]">
                {k.cizgi.toLocaleString('tr-TR')}
              </span>
              <button
                type="button"
                aria-label={soluk ? `${k.ad} parlat` : `${k.ad} soluklaştır`}
                aria-pressed={soluk}
                title={solukKilitli ? "Seçili boru layer'ı soluklaştırılamaz" : soluk ? 'Parlat' : 'Soluklaştır'}
                disabled={solukKilitli}
                onClick={() => p.onSoluklastir(k.ad)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 ${soluk ? 'bg-[#fef3c7] text-[#b45309]' : 'text-[#9ca3af] hover:bg-slate-100 disabled:hover:bg-transparent'}`}
              >
                {soluk ? <SunDim className="h-[15px] w-[15px]" aria-hidden="true" /> : <Sun className="h-[15px] w-[15px]" aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-label={sprinkler ? `${k.ad} sprinkler işaretini kaldır` : `${k.ad} sprinkler olarak işaretle`}
                aria-pressed={sprinkler}
                title={sprinkler ? 'Sprinkler işaretini kaldır' : 'Sprinkler olarak işaretle'}
                onClick={() => p.onSprinkler(k.ad)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${sprinkler ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'text-[#9ca3af] hover:bg-slate-100'}`}
              >
                <Droplet className="h-[15px] w-[15px]" fill={sprinkler ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between gap-2 border-t border-[#eef0f3] px-3 py-2">
        <button
          type="button"
          onClick={p.onTumunuGoster}
          title="Gizli ve soluk tüm katmanları normale döndürür"
          className="h-[30px] shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-[#1d4ed8] hover:bg-[#eff6ff]"
        >
          Tümünü göster
        </button>
        <button
          type="button"
          onClick={p.onYalnizBoru}
          disabled={!p.seciliLayer}
          title={p.seciliLayer ? `Yalnız “${p.seciliLayer}” görünür kalır` : "Önce bir boru layer'ı seçin"}
          className="h-[30px] shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-[#1d4ed8] hover:bg-[#eff6ff] disabled:cursor-not-allowed disabled:text-[#9ca3af] disabled:hover:bg-transparent"
        >
          Yalnız boruyu göster
        </button>
      </div>
    </div>
  );
}
