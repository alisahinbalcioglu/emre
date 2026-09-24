'use client';

/**
 * HESABIM › EKİP ERİŞİMİM — dört izin satırının ÇİZİMİ (23.09.2026, tasarım ekran 6).
 *
 * Yalnız çizer, karar vermez: satırlar `izinSatirlari`ndan (metin ve sıra Ekip &
 * İzinler sözlüğünden), simgeler `IZIN_SIMGELERI`nden, rozet renkleri Ekip'teki
 * üye etiketiyle AYNI sabitlerden gelir. `satirlar === null` (sunucu listeyi
 * söylemedi) → HİÇBİR ŞEY çizilmez.
 *
 * ⚠ YALNIZ GÖRELİ İMPORT: vitest bu depoda `@/` çözmüyor. Bileşen
 * `hesabim.test.ts`te `renderToStaticMarkup` ile GERÇEKTEN çizilir ve görünen
 * metni ölçülür; kaynağı regex'le okumak, bir ifadenin yanına eklenen sözcüğü
 * (`{s.baslik} izni`) kaçırıyordu (kod incelemesi ölçtü).
 */
import { Check, Lock } from 'lucide-react';
import type { IzinSatiri } from '../../firma/ekip/izin-metinleri';
import { IZIN_SIMGELERI } from '../../firma/ekip/izin-simgeleri';
import { IZIN_ROZETI_ACIK, IZIN_ROZETI_KAPALI } from '../../firma/ekip/ekip-parcalari';

const ROZET =
  'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium';

export function IzinDurumListesi({
  satirlar,
  etiketId,
}: {
  satirlar: readonly IzinSatiri[] | null;
  /** Listenin erişilebilir adı: kartın giriş cümlesinin `id`si. */
  etiketId: string;
}) {
  if (!satirlar) return null;
  return (
    <ul
      aria-labelledby={etiketId}
      className="mt-4 divide-y divide-[#eef0f3] overflow-hidden rounded-[10px] border border-[#eef0f3]"
    >
      {satirlar.map((s) => {
        const Simge = IZIN_SIMGELERI[s.anahtar];
        return (
          <li key={s.anahtar} className="flex items-center gap-3 px-4 py-3">
            <div
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
            >
              <Simge className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{s.baslik}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{s.aciklama}</p>
            </div>
            <span className={`${ROZET} ${s.acik ? IZIN_ROZETI_ACIK : IZIN_ROZETI_KAPALI}`}>
              {s.acik ? <Check className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
              {s.acik ? 'Açık' : 'Kapalı'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
