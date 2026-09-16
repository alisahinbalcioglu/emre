import { denemeSatiri, type PaketSurumu } from './paket-bicim';

/**
 * Abonelik kartındaki deneme satırı (Faz 6.12a). Metin ve karar `denemeSatiri`
 * saf fonksiyonunda; bu bileşen yalnız tonu renge çevirir. Hook yok, istemci
 * bileşeni içinde de sunucuda da aynı çıktıyı verir (vitest render eder).
 */
const TON_SINIFI = {
  olumlu: 'text-emerald-700',
  bilgi: 'text-slate-600',
  uyari: 'text-amber-700',
} as const;

export function DenemeSatiri({
  surum,
}: {
  surum: Pick<PaketSurumu, 'denemeGunu' | 'denemeHakki' | 'denemeGerekcesi'>;
}) {
  const satir = denemeSatiri(surum);
  if (!satir) return null;
  return (
    <p className={`mt-1 text-xs ${TON_SINIFI[satir.ton]}`} data-deneme-tonu={satir.ton}>
      {satir.metin}
    </p>
  );
}
