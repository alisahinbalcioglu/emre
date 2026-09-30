/**
 * FITTING IPUCU KURALI (30.09.2026)
 *
 * Teklif gridinin ustundeki tek satirlik "Fitting bedeli ekleyebilirsiniz"
 * seridi ne zaman gorunur. Iki kalici kapanma yolu var:
 *   · kullanici × ile kapatti  → tarayicida `mpx.ipucu.fitting` = 'kapali'
 *   · teklifte zaten fitting satiri var → ogrenmis, gosterilmez
 *
 * Kalicilik yalniz bu tarayicida (cihaz degisince bir kez daha gorunur).
 * Depolama erisimi gizli sekmede / site verisi kapaliyken hata firlatabilir:
 * okuma "kapali degil", yazma sessizce yalniz bu oturumu kapatir.
 */

export const FITTING_IPUCU_ANAHTARI = 'mpx.ipucu.fitting';
const KAPALI = 'kapali';

type Depo = Pick<Storage, 'getItem' | 'setItem'>;

function depo(): Depo | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function fittingIpucuKapatildiMi(d: Depo | null = depo()): boolean {
  try {
    return d?.getItem(FITTING_IPUCU_ANAHTARI) === KAPALI;
  } catch {
    return false;
  }
}

export function fittingIpucunuKaliciKapat(d: Depo | null = depo()): void {
  try {
    d?.setItem(FITTING_IPUCU_ANAHTARI, KAPALI);
  } catch {
    /* kalici olmaz — serit bu oturumda yine kapanir */
  }
}

/** Sayfalardan herhangi birinde bag kurulmus (`_fitting`) satir var mi? */
export function teklifteFittingVarMi(
  sayfalar: Record<string | number, ReadonlyArray<Record<string, any> | null | undefined> | undefined>,
): boolean {
  return Object.values(sayfalar).some((rows) => Array.isArray(rows) && rows.some((r) => !!r?._fitting));
}
