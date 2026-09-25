'use client';

/**
 * "Birim: dm" dugmesinin penceresi (25.09 tasarimi, ekran 5).
 *
 * Sira: otomatik tespit kutusu → "1 çizim birimi = 10 cm" → birim secimi →
 * kapanabilir "Teknik ayrıntılar" (motorun kanit satirlari) → uyari →
 * Vazgeç / Kaydet. Kaydet'ten sonra calisma alani bayat layer'lari yeniden
 * ayirir; cap etiketleri geometriyle aktarilir (etiket-aktarimi.ts).
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react';
import { BIRIMLER, birimBul, guvenAciklamasi, guvenilirMi } from './birimler';
import { radyoOkTusu } from './adim-parcalari';

export interface BirimTespiti {
  scale: number;
  label: string;
  confidence: string;
  method: string;
  evidence: string[];
}

export interface BirimPenceresiProps {
  scale: number;
  tespit: BirimTespiti | null;
  /** Kullanici birimi elle secmis mi (otomatik tespiti ezmis)? */
  elle: boolean;
  /** Parcalara ayirma surerken birim degistirilemez. */
  kilitli: boolean;
  /** Tespit zayif ve kullanici henuz onaylamadi: ayni birimle "Kaydet"
   *  de gecerlidir (birimi dogruladim — dugme yesile doner). */
  dogrulanmali: boolean;
  onKapat: () => void;
  onKaydet: (scale: number) => void;
}

export default function BirimPenceresi({ scale, tespit, elle, kilitli, dogrulanmali, onKapat, onKaydet }: BirimPenceresiProps) {
  const [secim, setSecim] = useState(scale);
  const [ayrintiAcik, setAyrintiAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);
  const birimGrubuRef = useRef<HTMLDivElement>(null);

  // Odak: acilinca secili birime; kapaninca pencereyi acan dugmeye doner
  // (25.09 inceleme: kapaninca odak <body>'ye dusuyordu).
  useEffect(() => {
    const onceki = document.activeElement as HTMLElement | null;
    birimGrubuRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
    return () => {
      if (onceki && document.contains(onceki)) onceki.focus();
    };
  }, []);

  // Disari tiklayinca kapanir (dugme kendi aciklik durumunu yonetir).
  useEffect(() => {
    const disari = (e: MouseEvent) => {
      const kutu = kutuRef.current;
      if (!kutu || kutu.contains(e.target as Node)) return;
      const hedef = e.target as HTMLElement | null;
      if (hedef?.closest('[aria-haspopup="dialog"]')) return;
      onKapat();
    };
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, [onKapat]);

  const secili = birimBul(secim);
  const seciliSira = secili ? BIRIMLER.indexOf(secili) : -1;
  const tespitBirimi = tespit ? birimBul(tespit.scale) : null;
  const degisti = Math.abs(secim - scale) / scale > 1e-6;

  let kutu: React.ReactNode;
  if (elle) {
    kutu = (
      <div className="mt-3 rounded-[10px] bg-[#f8fafc] p-3">
        <div className="text-[13px] font-semibold text-[#334155]">
          Elle seçildi: {birimBul(scale)?.ad ?? scale} ({birimBul(scale)?.kisa ?? ''})
        </div>
        <div className="mt-0.5 text-xs text-[#64748b]">
          {tespitBirimi ? `Otomatik tespit: ${tespitBirimi.ad} (${tespitBirimi.kisa})` : 'Otomatik tespit bilgisi yok.'}
        </div>
      </div>
    );
  } else if (tespit && guvenilirMi(tespit.confidence)) {
    kutu = (
      <div className="mt-3 flex gap-2.5 rounded-[10px] bg-[#f0fdf4] p-3">
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[#16a34a]" aria-hidden="true" />
        <div>
          <div className="text-[13px] font-semibold text-[#166534]">
            Otomatik bulundu: {tespitBirimi?.ad ?? tespit.label} ({tespitBirimi?.kisa ?? tespit.label})
          </div>
          <div className="mt-0.5 text-xs text-[#15803d]">{guvenAciklamasi(tespit.confidence)}</div>
        </div>
      </div>
    );
  } else {
    kutu = (
      <div className="mt-3 flex gap-2.5 rounded-[10px] bg-[#fffbeb] p-3">
        <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-[#b45309]" aria-hidden="true" />
        <div>
          <div className="text-[13px] font-semibold text-[#92400e]">
            {tespit
              ? `Otomatik tahmin: ${tespitBirimi?.ad ?? tespit.label} (${tespitBirimi?.kisa ?? tespit.label})`
              : 'Çizim birimi doğrulanamadı'}
          </div>
          <div className="mt-0.5 text-xs text-[#92400e]">
            {tespit ? guvenAciklamasi(tespit.confidence) : 'Sunucu bu dosya için birim bilgisi vermedi — doğru birimi seçin.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={kutuRef}
      role="dialog"
      aria-labelledby="birim-baslik"
      className="absolute right-0 top-11 z-[60] w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-[#e5e7eb] bg-white p-[18px] shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
    >
      <div className="flex items-center justify-between">
        <h2 id="birim-baslik" className="m-0 text-[15px] font-semibold text-[#111827]">Çizim birimi</h2>
        <button
          type="button"
          aria-label="Kapat"
          onClick={onKapat}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#6b7280] hover:bg-slate-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {kutu}
      <p className="mt-3 text-[13px] leading-normal text-[#4b5563]">
        1 çizim birimi = {secili?.karsilik ?? `${secim} m`}. Boru uzunlukları bu birimle metreye çevrilir.
      </p>
      <div
        ref={birimGrubuRef}
        role="radiogroup"
        aria-label="Çizim birimi"
        onKeyDown={(e) => radyoOkTusu(e, BIRIMLER.map((b) => b.scale), secili?.scale ?? secim, setSecim)}
        className="mt-3 grid grid-cols-6 gap-0.5 rounded-lg bg-[#f1f5f9] p-[3px]"
      >
        {BIRIMLER.map((b, i) => {
          const aktif = i === seciliSira;
          // Tabloda olmayan birimde (×0.5) ilk secenek Tab duragidir.
          const durak = aktif || (seciliSira < 0 && i === 0);
          return (
            <button
              key={b.kisa}
              type="button"
              role="radio"
              aria-checked={aktif}
              tabIndex={durak ? 0 : -1}
              onClick={() => setSecim(b.scale)}
              title={`${b.ad} — 1 çizim birimi = ${b.karsilik}`}
              className={
                'h-8 rounded-md text-[13px] ' +
                (aktif
                  ? 'bg-white font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.12)]'
                  : 'font-medium text-[#4b5563] hover:text-[#111827]')
              }
            >
              {b.kisa}
            </button>
          );
        })}
      </div>
      {tespit && (tespit.evidence.length > 0 || tespit.method) && (
        <>
          <button
            type="button"
            aria-expanded={ayrintiAcik}
            onClick={() => setAyrintiAcik((v) => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#374151]"
          >
            {ayrintiAcik
              ? <ChevronDown className="h-[13px] w-[13px]" aria-hidden="true" />
              : <ChevronRight className="h-[13px] w-[13px]" aria-hidden="true" />}
            Teknik ayrıntılar
          </button>
          {ayrintiAcik && (
            <div className="mt-2 rounded-lg bg-[#f8fafc] px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-[#475569]">
              {tespit.evidence.map((k, i) => (
                <div key={i}>{k}</div>
              ))}
              {tespit.method && <div>Yöntem: {tespit.method}</div>}
            </div>
          )}
        </>
      )}
      <div className="mt-3 flex gap-2 text-xs leading-normal text-[#92400e]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Birimi değiştirirseniz hesaplanan layer&apos;lar yeniden parçalara ayrılır; çap etiketleri korunur.
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onKapat}
          className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-[#111827] hover:bg-slate-50"
        >
          Vazgeç
        </button>
        <button
          type="button"
          disabled={(!degisti && !dogrulanmali) || kilitli}
          onClick={() => onKaydet(secim)}
          title={kilitli ? 'Parçalara ayırma sürerken birim değiştirilemez' : undefined}
          className="h-9 rounded-lg bg-[#0f172a] px-4 text-[13px] font-semibold text-white hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:bg-[#e5e7eb] disabled:text-[#6b7280]"
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}
