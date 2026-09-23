'use client';

/**
 * HESABIM — ORTAK KART PARÇALARI (23.09.2026, Emre'nin tasarımı).
 *
 * Tasarımın görsel kuralları TEK yerde: beyaz kart, 12 px köşe, `#e5e7eb`
 * kenarlık; kaydet alanı kartın altında açık gri (`#fafafa`) şeritte ve sağa
 * hizalı; ana düğme `#0f172a`, ikincil düğme beyaz ve kenarlıklı, tehlikeli
 * işlem kırmızı çerçeveli (`#fecaca` / `#dc2626`). Sekmeler sınıfları buradan
 * alır; her sekme kendi kopyasını tutsaydı biri güncellenip öteki geride
 * kalırdı.
 */
import type { ReactNode } from 'react';
import { cn } from '@/ortak/lib/utils';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';

const DUGME_TABANI =
  'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const ANA_DUGME = cn(
  DUGME_TABANI,
  'bg-slate-900 px-4 text-white hover:bg-slate-800 focus-visible:ring-slate-900/40',
);

export const IKINCIL_DUGME = cn(
  DUGME_TABANI,
  'border border-gray-200 bg-white px-3.5 text-gray-900 hover:bg-gray-50 focus-visible:ring-slate-900/30',
);

export const TEHLIKE_DUGME = cn(
  DUGME_TABANI,
  'border border-red-200 bg-white px-3.5 text-red-600 hover:bg-red-50 focus-visible:ring-red-600/30',
);

export const GIRDI =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10';

export const SALT_OKUNUR_GIRDI =
  'h-10 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600 focus:outline-none';

/** İki sütunlu alan ızgarası (telefonda tek sütun). */
export const IZGARA = 'mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2';

/** Bir işlemin kullanıcıya söylenen sonucu. */
export type IslemDurumu = { tur: 'basari' | 'hata'; metin: string };

/**
 * Sunucu hatasının ekran metni. `kimlikHataMetni` kodları Türkçeye çevirir;
 * burada yalnız ValidationPipe'ın DİZİ hâlindeki `message`i eklenir. O dizi
 * eskiden JSX'e olduğu gibi basılıyor ve cümleler boşluksuz yapışıyordu.
 */
export function hataMetni(hata: unknown, yedek: string): string {
  const mesaj = (hata as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(mesaj) && mesaj.length > 0) return mesaj.join(' ');
  return kimlikHataMetni(hata, yedek);
}

export function DurumMetni({ durum, className }: { durum: IslemDurumu | null; className?: string }) {
  if (!durum) return null;
  return (
    <p
      role={durum.tur === 'hata' ? 'alert' : 'status'}
      className={cn('text-[13px]', durum.tur === 'hata' ? 'text-red-600' : 'text-emerald-700', className)}
    >
      {durum.metin}
    </p>
  );
}

/**
 * Kart. `serit` verilirse gövdenin altına kaydet şeridi çizilir; form kartı
 * `<form>` içine alınır ki şeritteki düğme formu göndersin.
 */
export function Kart({
  id,
  baslik,
  aciklama,
  tehlike = false,
  serit,
  children,
}: {
  id: string;
  baslik: ReactNode;
  aciklama?: ReactNode;
  tehlike?: boolean;
  serit?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-baslik`}
      className={cn(
        'overflow-hidden rounded-xl border bg-white',
        tehlike ? 'border-red-200' : 'border-gray-200',
      )}
    >
      <div className="p-6">
        <h2
          id={`${id}-baslik`}
          className={cn('text-base font-semibold', tehlike ? 'text-red-700' : 'text-gray-900')}
        >
          {baslik}
        </h2>
        {aciklama && <p className="mt-1 text-[13px] leading-normal text-gray-500">{aciklama}</p>}
        {children}
      </div>
      {serit}
    </section>
  );
}

/** Kartın altındaki kaydet şeridi: solda sonuç, sağda düğme. */
export function KaydetSeridi({ durum, children }: { durum: IslemDurumu | null; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-[#eef0f3] bg-neutral-50 px-6 py-3">
      <DurumMetni durum={durum} className="mr-auto" />
      {children}
    </div>
  );
}

/** Etiket + alan (+ alt ipucu). `genis` iki sütunu kaplar. */
export function Alan({
  id,
  etiket,
  ipucu,
  genis = false,
  children,
}: {
  id: string;
  etiket: string;
  ipucu?: ReactNode;
  genis?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={genis ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-gray-900">
        {etiket}
      </label>
      {children}
      {ipucu && <p className="mt-1.5 text-xs text-gray-500">{ipucu}</p>}
    </div>
  );
}

/** Tek satırlık kart: solda başlık ve açıklama, sağda eylem. */
export function SatirKarti({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-6 py-[18px]">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-900">{baslik}</h2>
        <div className="mt-0.5 text-[13px] text-gray-500">{aciklama}</div>
      </div>
      {children}
    </section>
  );
}
