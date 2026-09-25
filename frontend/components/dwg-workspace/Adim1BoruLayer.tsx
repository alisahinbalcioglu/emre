'use client';

/**
 * Adim 1 — Boru layer'ini secin (25.09 tasarimi, ekran 1-2).
 *
 *  sec   : iki yol (cizimde tikla / Katmanlar listesi) + "Adına göre boru
 *          olabilecekler" cipleri + calisilan layer'lar (birden cok layer'da
 *          hangisinin onayli oldugu burada gorulur; tasarimda yoktu, eski
 *          "Hesaplanmış Metraj" panelinin gorevini alir).
 *  ayir  : mavi kart (ad, cizgi sayisi, Değiştir) + BOLME YONTEMI (Emre 25.09:
 *          "2 türlü segmentlerine ayırma yöntemimiz var") + "Parçalara ayır".
 *  tamam : tek satir ozet + "Ayırmayı kaldır" / "Değiştir"; birim ya da 💧
 *          degistiyse turuncu satir + "Yeniden ayır" (etiketler korunur).
 */

import React from 'react';
import { GitFork, Layers, Loader2, MousePointerClick, Scissors, Split } from 'lucide-react';
import type { CalculatedLayer } from './types';
import type { Adim1Durumu } from './adim-durumu';
import type { KatmanOzeti } from './boru-adaylari';
import { AdimRozeti, UyariSatiri, adet, metre, radyoOkTusu } from './adim-parcalari';

export interface CalisilanLayer {
  ad: string;
  renk: string;
  parca: number;
  /** "Bölmeden" ayrildi — parca yerine "hat" yazilir (Adim 1 ozetiyle ayni). */
  bolmeden: boolean;
  metre: number;
  capsiz: number;
  durum: 'onayli' | 'bekliyor' | 'bayat';
}

export interface Adim1Props {
  durum: Adim1Durumu;
  seciliLayer: string | null;
  layerRengi: string;
  /** Secili layer'in cizimdeki cizgi sayisi. */
  layerCizgi: number | null;
  hesap: CalculatedLayer | null;
  adaylar: KatmanOzeti[];
  katmanSayisi: number;
  calisilanlar: CalisilanLayer[];
  yontem: 't' | 'none';
  onYontem: (y: 't' | 'none') => void;
  /** Motor su an bir layer'i ayiriyor mu (hangisi)? */
  ayrilanLayer: string | null;
  /** Motorun uyguladigi yontem: "Bölmeden" ise "Hatlar çıkarılıyor…". */
  ayrilanYontem: 't' | 'none';
  birimBayat: boolean;
  sprinklerBayat: boolean;
  /** Birim degisimi sonrasi sirali yeniden ayirma ilerlemesi. */
  yenidenAyirma: { sira: number; toplam: number } | null;
  onSec: (ad: string) => void;
  onDegistir: () => void;
  onKatmanlariAc: () => void;
  onAyir: () => void;
  onAyirmayiKaldir: () => void;
  onYenidenAyir: () => void;
}

const YONTEMLER = [
  { deger: 't' as const, ad: 'T noktalarında böl' },
  { deger: 'none' as const, ad: 'Bölmeden' },
];

const DURUM_ROZETI: Record<CalisilanLayer['durum'], { metin: string; sinif: string }> = {
  onayli: { metin: 'Onaylı', sinif: 'bg-[#f0fdf4] text-[#166534]' },
  bekliyor: { metin: 'Onay bekliyor', sinif: 'bg-[#f1f5f9] text-[#475569]' },
  bayat: { metin: 'Yeniden ayrılmalı', sinif: 'bg-[#fffbeb] text-[#92400e]' },
};

function Ciplar({ adaylar, onSec }: { adaylar: KatmanOzeti[]; onSec: (ad: string) => void }) {
  if (adaylar.length === 0) return null;
  return (
    <>
      <div className="ml-[34px] mt-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7280]">
        Adına göre boru olabilecekler
      </div>
      <div className="ml-[34px] mt-2 flex flex-wrap gap-1.5">
        {adaylar.map((k) => (
          <button
            key={k.ad}
            type="button"
            onClick={() => onSec(k.ad)}
            className="inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-xs font-semibold text-[#111827] hover:border-[#bfdbfe] hover:bg-[#eff6ff]"
          >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: k.renk }} />
            <span className="truncate">{k.ad}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Calisilanlar({ liste, onSec }: { liste: CalisilanLayer[]; onSec: (ad: string) => void }) {
  if (liste.length === 0) return null;
  return (
    <>
      <div className="ml-[34px] mt-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7280]">
        Çalıştığınız layer&apos;lar
      </div>
      <ul className="ml-[34px] mt-1.5 space-y-1">
        {liste.map((c) => {
          const r = DURUM_ROZETI[c.durum];
          return (
            <li key={c.ad}>
              <button
                type="button"
                onClick={() => onSec(c.ad)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-[#e5e7eb] px-2.5 py-2 text-left hover:bg-slate-50"
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: c.renk }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[#111827]">{c.ad}</span>
                  <span className="block text-xs text-[#6b7280]">
                    {adet(c.parca)} {c.bolmeden ? 'hat' : 'parça'} · {metre(c.metre)}
                    {c.capsiz > 0 ? ` · ${adet(c.capsiz)} çapsız` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.sinif}`}>{r.metin}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function Adim1BoruLayer(p: Adim1Props) {
  const ayriliyor = !!p.ayrilanLayer && p.ayrilanLayer === p.seciliLayer;
  const baskasiAyriliyor = !!p.ayrilanLayer && p.ayrilanLayer !== p.seciliLayer;

  if (p.durum === 'sec') {
    return (
      <section aria-labelledby="adim1" className="border-b border-[#eef0f3] p-4">
        <div className="flex items-center gap-2.5">
          <AdimRozeti no={1} durum="aktif" />
          <h2 id="adim1" className="m-0 flex-1 text-[15px] font-semibold text-[#111827]">Boru layer&apos;ını seçin</h2>
        </div>
        <p className="ml-[34px] mt-2.5 text-[13px] leading-normal text-[#4b5563]">
          Metrajını çıkaracağınız boruların bulunduğu layer&apos;ı seçin. İki yolu var:
        </p>
        <div className="ml-[34px] mt-3 flex flex-col gap-2">
          <div className="flex gap-2.5 rounded-[10px] border border-[#e5e7eb] p-3">
            <MousePointerClick className="mt-px h-[18px] w-[18px] shrink-0 text-[#1d4ed8]" aria-hidden="true" />
            <div>
              <div className="text-[13px] font-semibold text-[#111827]">Çizimde bir boruya tıklayın</div>
              <div className="mt-0.5 text-xs text-[#6b7280]">Tıkladığınız çizginin layer&apos;ı seçilir.</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-[10px] border border-[#e5e7eb] p-3">
            <Layers className="h-[18px] w-[18px] shrink-0 text-[#1d4ed8]" aria-hidden="true" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-[#111827]">Katmanlar listesinden seçin</div>
              <div className="mt-0.5 text-xs text-[#6b7280]">
                Projedeki {p.katmanSayisi.toLocaleString('tr-TR')} layer; istemediklerinizi gizleyin.
              </div>
            </div>
            <button
              type="button"
              onClick={p.onKatmanlariAc}
              aria-label="Katmanlar listesini aç"
              className="h-[30px] rounded-[7px] border border-[#e5e7eb] bg-white px-2.5 text-xs font-semibold text-[#111827] hover:bg-slate-50"
            >
              Aç
            </button>
          </div>
        </div>
        <Ciplar adaylar={p.adaylar} onSec={p.onSec} />
        <Calisilanlar liste={p.calisilanlar} onSec={p.onSec} />
      </section>
    );
  }

  if (p.durum === 'ayir') {
    const bolmeden = p.yontem === 'none';
    return (
      <section aria-labelledby="adim1" className="border-b border-[#eef0f3] p-4">
        <div className="flex items-center gap-2.5">
          <AdimRozeti no={1} durum="aktif" />
          <h2 id="adim1" className="m-0 flex-1 text-[15px] font-semibold text-[#111827]">Boru layer&apos;ını seçin</h2>
        </div>
        <div className="ml-[34px] mt-3 flex items-center gap-2.5 rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] p-3">
          <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: p.layerRengi }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[#111827]">{p.seciliLayer}</div>
            <div className="mt-0.5 text-xs text-[#475569]">
              {p.layerCizgi !== null ? `${p.layerCizgi.toLocaleString('tr-TR')} çizgi · ` : ''}seçildi
            </div>
          </div>
          <button
            type="button"
            onClick={p.onDegistir}
            disabled={ayriliyor}
            className="h-7 px-1.5 text-xs font-semibold text-[#1d4ed8] disabled:text-[#9ca3af]"
          >
            Değiştir
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label="Bölme yöntemi"
          onKeyDown={(e) => { if (!ayriliyor) radyoOkTusu(e, YONTEMLER.map((y) => y.deger), p.yontem, p.onYontem); }}
          className="ml-[34px] mt-3 grid grid-cols-2 gap-0.5 rounded-lg bg-[#f1f5f9] p-[3px]"
        >
          {YONTEMLER.map((y) => {
            const aktif = p.yontem === y.deger;
            return (
              <button
                key={y.deger}
                type="button"
                role="radio"
                aria-checked={aktif}
                tabIndex={aktif ? 0 : -1}
                disabled={ayriliyor}
                onClick={() => p.onYontem(y.deger)}
                className={
                  'h-8 rounded-md text-xs ' +
                  (aktif
                    ? 'bg-white font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.12)]'
                    : 'font-medium text-[#4b5563] hover:text-[#111827]')
                }
              >
                {y.ad}
              </button>
            );
          })}
        </div>

        <div className="ml-[34px] mt-3 flex gap-2.5 text-xs leading-[1.55] text-[#4b5563]">
          {bolmeden ? (
            <>
              <Split className="mt-px h-4 w-4 shrink-0 text-[#475569]" aria-hidden="true" />
              <span>
                <b className="text-[#111827]">Bölme yok:</b> her çizgi baştan sona tek parça kalır; bir hattın
                tamamına tek tıkla çap verirsiniz.
              </span>
            </>
          ) : (
            <>
              <GitFork className="mt-px h-4 w-4 shrink-0 text-[#475569]" aria-hidden="true" />
              <span>
                Borular <b className="text-[#111827]">T noktalarından</b> (branşman noktaları) ayrı parçalara
                bölünür; 💧 işaretli sprinkler katmanı varsa sprinkler noktalarında da. Sonraki adımda her
                parçaya ayrı çap verirsiniz.
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={p.onAyir}
          disabled={ayriliyor || baskasiAyriliyor}
          className="ml-[34px] mt-3.5 flex h-10 w-[calc(100%-34px)] items-center justify-center gap-2 rounded-lg bg-[#0f172a] text-sm font-semibold text-white hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:bg-[#e5e7eb] disabled:text-[#6b7280]"
        >
          {ayriliyor ? (
            <><Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden="true" />{p.ayrilanYontem === 'none' ? 'Hatlar çıkarılıyor…' : 'Parçalara ayrılıyor…'}</>
          ) : bolmeden ? (
            <><Split className="h-[15px] w-[15px]" aria-hidden="true" />Hatları çıkar</>
          ) : (
            <><Scissors className="h-[15px] w-[15px]" aria-hidden="true" />Parçalara ayır</>
          )}
        </button>
        {baskasiAyriliyor && (
          <p className="ml-[34px] mt-2 text-xs text-[#6b7280]">“{p.ayrilanLayer}” ayrılıyor — bitince devam edebilirsiniz.</p>
        )}
      </section>
    );
  }

  // tamam
  const bolmeden = p.hesap?.splitMode === 'none';
  return (
    <section aria-labelledby="adim1" className="border-b border-[#eef0f3] p-4">
      <div className="flex items-center gap-2.5">
        <AdimRozeti no={1} durum="tamam" />
        <h2 id="adim1" className="m-0 flex-1 text-[15px] font-semibold text-[#111827]">Boru layer&apos;ı</h2>
        <button
          type="button"
          onClick={p.onAyirmayiKaldir}
          disabled={ayriliyor}
          className="h-7 px-1.5 text-xs font-semibold text-[#b91c1c] disabled:text-[#9ca3af]"
        >
          Ayırmayı kaldır
        </button>
        <button type="button" onClick={p.onDegistir} className="h-7 px-1.5 text-xs font-semibold text-[#1d4ed8]">
          Değiştir
        </button>
      </div>
      <div className="ml-[34px] mt-2.5 flex items-center gap-2.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.layerRengi }} />
        <span className="min-w-0 flex-1 text-[13px] text-[#111827]">
          <b className="break-all">{p.seciliLayer}</b>{' '}
          <span className="text-[#6b7280]">
            · {adet(p.hesap?.edgeSegments.length ?? 0)} {bolmeden ? 'hat · bölmeden' : 'parça'} · {metre(p.hesap?.totalLength ?? 0)}
          </span>
        </span>
      </div>
      {p.yenidenAyirma ? (
        <div className="ml-[34px] mt-3 flex items-center gap-2 text-xs text-[#475569]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Yeniden ayrılıyor: {p.yenidenAyirma.sira}/{p.yenidenAyirma.toplam}
        </div>
      ) : p.birimBayat ? (
        <div className="ml-[34px]">
          <UyariSatiri
            metin="Çizim birimi değişti; bu layer yeniden parçalara ayrılmalı. Çap etiketleri korunur."
            dugme="Yeniden ayır"
            onDugme={p.onYenidenAyir}
            dugmeKapali={!!p.ayrilanLayer}
          />
        </div>
      ) : p.sprinklerBayat ? (
        <div className="ml-[34px]">
          <UyariSatiri
            metin="Sprinkler işaretlemesi değişti; parça sınırları eski. Metraj doğru — yeniden ayırırsanız çap etiketleri korunur."
            dugme="Yeniden ayır"
            onDugme={p.onYenidenAyir}
            dugmeKapali={!!p.ayrilanLayer}
          />
        </div>
      ) : null}
    </section>
  );
}
