'use client';

import Link from 'next/link';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { seritGosterilsinMi, seritSinifi } from './erisim-durumu';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONELIK SERIDI — kabuk genelinde tek uyari noktasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Sunucunun `ErisimServisi.karar()` ciktisindaki `uyari` nesnesini oldugu
 *  gibi gosterir: seviye, baslik, metin ve tiklanabilir eylem HAZIR gelir.
 *  Metin BURADA URETILMEZ — kullaniciya ne yazilacagi tek yerde (sunucuda)
 *  karar verilir, yoksa iki yer ayrisir ve ekran gercegi soylemez.
 *
 *  ── NEDEN KABUKTA, SAYFALARDA DEGIL ────────────────────────────────────
 *  Deneme suresi bitmek uzere olan ya da odemesi geciken bir kullanici,
 *  uyariyi HANGI sayfada olursa olsun gormelidir. Sayfa sayfa eklemek
 *  demek, eklenmeyi unutulan her sayfada kullanicinin habersiz kalmasi
 *  demektir — ki dunning merdiveni sessizce ilerleyip hesabi kisitlar.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AbonelikSeridi() {
  const { erisim } = useCapabilities();

  if (!seritGosterilsinMi(erisim)) return null;
  const uyari = erisim!.uyari!;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-8 py-2.5 text-sm ${seritSinifi(uyari.seviye)}`}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-semibold">{uyari.baslik}</span>
        <span className="opacity-90">{uyari.metin}</span>
      </div>

      {uyari.eylem && (
        <Link
          href={uyari.eylem.yol}
          className="shrink-0 rounded-md border border-current/30 bg-white/60 px-3 py-1 text-xs font-semibold hover:bg-white"
        >
          {uyari.eylem.etiket}
        </Link>
      )}
    </div>
  );
}
