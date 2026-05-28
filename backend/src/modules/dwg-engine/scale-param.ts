/**
 * Frontend'den gelen `scale` query parametresini Python engine'e iletilecek
 * degere cevirir.
 *
 * KRITIK: Auto-mode'da frontend `scale` parametresini HIC gondermez (undefined).
 * Bu durumda Python'a da scale GONDERILMEMELI (undefined) ki Python
 * `scale is None` dalina girip $INSUNITS + bound geometri ile OTOMATIK birim
 * tespiti yapsin. Eski kod `parseFloat(scale || '0.001') || 0.001` ile
 * undefined'i 0.001'e zorluyordu -> auto-detect hic calismiyordu (mm sanardi).
 *
 * @returns gecerli pozitif sayi (manuel override) VEYA undefined (Auto -> backend auto-detect)
 */
export function resolveScaleParam(raw?: string): number | undefined {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return undefined; // Auto -> Python auto-detect etsin
  }
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined; // gecersiz -> auto-detect (mm'e zorlama, guvenli)
  }
  return n;
}
