'use client';

import { useEffect, useState } from 'react';
import { fittingIpucuKapatildiMi, fittingIpucunuKaliciKapat } from './fitting-ipucu';

/**
 * FITTING IPUCU SERIDI (30.09.2026) — kural `fitting-ipucu.ts`te.
 * Yeri: quotes/new/page.tsx, "Birim fiyat: … Ctrl+C" indigo seridinin
 * hemen alti, ayni kosulla. Anlattigi komut ExcelGrid sag tik menusundedir
 * (`fitting-menu-ekle`) — komut kalkarsa bu serit de kalkmali.
 */
export function FittingIpucu({ kullanildi = false }: { kullanildi?: boolean }) {
  // SSR'de depo yok: KAPALI baslar, mount'tan sonra acilir (hydration uyumu).
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    setGorunur(!kullanildi && !fittingIpucuKapatildiMi());
  }, [kullanildi]);

  if (!gorunur) return null;

  return (
    <div
      data-testid="fitting-ipucu"
      className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-900"
    >
      {/* flex-wrap YOK: dar ekranda × alt satira dusuyordu; Σ ve × flex-none */}
      <span className="flex-none pt-px font-semibold text-amber-600">Σ</span>
      <span className="min-w-0 flex-1">
        <b className="font-semibold">Fitting bedeli ekleyebilirsiniz:</b> satıra sağ tıklayın →{' '}
        “Fitting bedeli satırı ekle”. Seçtiğiniz satırların yüzdesi kadar kalem eklenir.{' '}
        <span className="text-amber-700/70">Kısayol: Birim hücresine % yazın.</span>
      </span>
      <button
        type="button"
        onClick={() => {
          fittingIpucunuKaliciKapat();
          setGorunur(false);
        }}
        title="Bir daha gösterme"
        aria-label="İpucunu kapat, bir daha gösterme"
        className="-mr-1 flex h-5 w-5 flex-none items-center justify-center rounded text-amber-500 transition-colors hover:bg-amber-200 hover:text-amber-800"
      >
        ×
      </button>
    </div>
  );
}
