'use client';

/**
 * KİMLİK EKRANLARININ ORTAK KABUĞU (Faz 3).
 *
 * Giriş ve Kayıt ekranları bu kabuğu KOPYALAYARAK büyüdü ve 16–17.08'de tam
 * olarak bu yüzden ayrıştı (biri yenilendi, diğeri eski shadcn kartında ve
 * İngilizce kaldı). Faz 3 üç ekran daha ekliyor — beş kopya, beş ayrı kader
 * demekti. Kabuk artık TEK yerde.
 */

import Link from 'next/link';

export function KimlikKabugu({
  baslik,
  aciklama,
  children,
  altBaglanti,
}: {
  baslik: string;
  aciklama?: string;
  children: React.ReactNode;
  altBaglanti?: { metin: string; baglantiMetni: string; href: string };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      {/* Marka bloğu — kartın DIŞINDA (giriş ekranıyla birebir) */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/30">
          M
        </div>
        <h1 className="flex items-center gap-0.5 text-2xl font-extrabold tracking-tight text-slate-900">
          MetaPrice<span className="text-blue-600">X</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">Teklif ve metraj yönetim merkeziniz</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">{baslik}</h2>
        {aciklama && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{aciklama}</p>}
        <div className="mt-5">{children}</div>

        {altBaglanti && (
          <div className="mt-6 text-center text-xs text-slate-500">
            {altBaglanti.metin}{' '}
            <Link href={altBaglanti.href} className="font-bold text-blue-600 hover:text-blue-700">
              {altBaglanti.baglantiMetni}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** Giriş ekranındakiyle aynı birincil düğme. */
export function KimlikDugmesi({
  yukleniyor,
  children,
}: {
  yukleniyor: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={yukleniyor}
      className="mt-2 w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
