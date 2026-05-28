/**
 * Frontend'den gelen `scale` query parametresini Python engine'e iletilecek
 * degere cevirir.
 *
 * BIRIM = KULLANICI SORUMLULUGU (TAHMIN YOK). Sistem birimi asla tahmin etmez;
 * kullanici UI dropdown'dan secer (default mm). scale gelmezse/gecersizse mm
 * (0.001) varsayilan kullanilir. Auto-detect mantigi KALDIRILDI (eskiden
 * undefined -> backend auto-detect idi).
 *
 * @returns gecerli pozitif scale carpani (mm=0.001, cm=0.01, m=1.0)
 */
const DEFAULT_SCALE_MM = 0.001;

export function resolveScaleParam(raw?: string): number {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return DEFAULT_SCALE_MM; // birim secilmedi -> mm varsayilan
  }
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_SCALE_MM; // gecersiz -> mm varsayilan
  }
  return n;
}
