'use client';

import { useState, type ReactNode } from 'react';
import { Check, CircleCheck, Copy, Info, TriangleAlert, X } from 'lucide-react';
import { DURUM_ROZETI, type SaglayiciDurumu } from './kurumsal-giris-metinleri';

/**
 * 23.09.2026 — Kurumsal giriş sayfasının görsel parçaları (Ekip sayfasının
 * ikinci tasarımıyla aynı dil: beyaz kart, 12 px köşe, `#e5e7eb` kenarlık,
 * açık zeminli alanlar, lucide). KARAR VERMEZ: durum sunucudan gelir.
 */

const ROZET_RENGI: Record<SaglayiciDurumu, string> = {
  TASLAK: 'bg-gray-100 text-gray-700',
  DOGRULANDI: 'bg-[#eff6ff] text-[#1d4ed8]',
  ETKIN: 'bg-[#f0fdf4] text-[#166534]',
  KAPALI: 'bg-slate-100 text-slate-600',
};

export function DurumRozeti({ durum }: { durum: SaglayiciDurumu }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${ROZET_RENGI[durum]}`}
    >
      {DURUM_ROZETI[durum].etiket}
    </span>
  );
}

/** Beyaz kart + başlık şeridi (Ekip sayfasındaki "Üyeler" kartıyla aynı iskelet). */
export function Kart({
  baslik,
  aciklama,
  sag,
  tehlike = false,
  children,
}: {
  baslik: string;
  aciklama?: ReactNode;
  sag?: ReactNode;
  tehlike?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white ${tehlike ? 'border-red-100' : 'border-[#e5e7eb]'}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#eef0f3] px-5 py-4">
        <div className="min-w-0">
          <h2 className={`text-[15px] font-semibold ${tehlike ? 'text-red-700' : 'text-gray-900'}`}>{baslik}</h2>
          {aciklama && <p className="mt-1 text-xs leading-normal text-gray-500">{aciklama}</p>}
        </div>
        {sag}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Üç adımlı kurulum ilerlemesi: tamamlanan adım yeşil tik, sıradaki koyu. */
export function KurulumIlerlemesi({ adimlar }: { adimlar: { ad: string; tamam: boolean }[] }) {
  const siradaki = adimlar.findIndex((a) => !a.tamam);
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {adimlar.map((a, i) => (
        <li key={a.ad} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              a.tamam
                ? 'bg-[#f0fdf4] text-[#166534]'
                : i === siradaki
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-gray-100 text-gray-500'
            }`}
          >
            {a.tamam ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
          </span>
          <span className={`text-[13px] ${a.tamam || i === siradaki ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
            {a.ad}
            <span className="sr-only">{a.tamam ? ' — tamam' : ' — bekliyor'}</span>
          </span>
          {i < adimlar.length - 1 && <span aria-hidden="true" className="h-px w-6 bg-[#e5e7eb]" />}
        </li>
      ))}
    </ol>
  );
}

/** Etiket + alan + yardım metni. */
export function Alan({
  etiket,
  htmlFor,
  yardim,
  children,
}: {
  etiket: string;
  htmlFor: string;
  yardim?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-gray-900">
        {etiket}
      </label>
      {children}
      {yardim && <p className="mt-1.5 text-xs text-gray-500">{yardim}</p>}
    </div>
  );
}

/** Ekip davet penceresindeki alanla aynı görünüm. */
export const ALAN_SINIFI =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 ' +
  'focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50';

/**
 * Salt okunur değer + "Kopyala". Pano erişimi yoksa (izin/eski tarayıcı)
 * alan seçili bırakılır — kullanıcı Ctrl+C ile alır, sessizce başarısız olmaz.
 */
export function KopyalanabilirDeger({ deger, onKopyalandi }: { deger: string; onKopyalandi: () => void }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  async function kopyala(alan: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(deger);
      setKopyalandi(true);
      onKopyalandi();
      window.setTimeout(() => setKopyalandi(false), 2000);
    } catch (e) {
      console.warn('[kurumsal-giris] panoya yazılamadı, alan seçili bırakıldı:', e);
      alan?.select();
    }
  }
  return (
    <div className="flex gap-2">
      <input
        id="donus-adresi"
        readOnly
        value={deger}
        onFocus={(e) => e.currentTarget.select()}
        className={`${ALAN_SINIFI} font-mono text-[13px]`}
      />
      <button
        type="button"
        onClick={(e) => void kopyala(e.currentTarget.previousElementSibling as HTMLInputElement | null)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50"
      >
        {kopyalandi ? <Check className="h-4 w-4 text-[#166534]" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
      </button>
    </div>
  );
}

/** Başlık + açıklama (+ uyarı) solda, anahtar sağda. */
export function AyarSatiri({
  baslik,
  aciklama,
  uyari,
  children,
}: {
  baslik: string;
  aciklama: string;
  uyari?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-900">{baslik}</div>
        <p className="mt-0.5 text-xs leading-normal text-gray-500">{aciklama}</p>
        {uyari && <p className="mt-1.5 text-xs font-medium text-amber-700">{uyari}</p>}
      </div>
      {children}
    </div>
  );
}

export type Sonuc = { ton: 'basari' | 'uyari' | 'hata'; metin: string };

const SERIT_RENGI: Record<Sonuc['ton'], string> = {
  basari: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]',
  uyari: 'border-amber-200 bg-[#fffbeb] text-[#92400e]',
  hata: 'border-red-200 bg-red-50 text-red-700',
};

/** Sağlayıcıdan dönüşün sonucu — kalıcı, kapatılabilir şerit. */
export function SonucSeridi({ sonuc, onKapat }: { sonuc: Sonuc; onKapat: () => void }) {
  const Simge = sonuc.ton === 'basari' ? CircleCheck : sonuc.ton === 'uyari' ? Info : TriangleAlert;
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${SERIT_RENGI[sonuc.ton]}`}>
      <Simge className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">{sonuc.metin}</p>
      <button type="button" aria-label="Kapat" onClick={onKapat} className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
