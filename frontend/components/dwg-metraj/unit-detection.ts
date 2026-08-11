/**
 * Birim donusturucu.
 *
 * Birim artik backend'de OTOMATIK tespit edilir (Python: unit_detect.py —
 * antet pafta olcusu + "ÖLÇEK 1/N" metni kesisimi). Bu dosya yalnizca
 * matematiksel donusturucudur; burada TAHMIN YAPILMAZ.
 *
 * NOT: Eski detectDrawingUnit (medyan-heuristic) SILINDI — CAD'de cok kisa
 * segment yuzunden medyan yanlis birim tahmin ediyordu.
 */

export type DrawingUnit = 'mm' | 'cm' | 'dm' | 'm' | 'inch' | 'ft';

/** 1 metrenin secilen birimdeki karsiligi (TEK GERCEK KAYNAK).
 *
 *  'dm' EKLENDI: gercek bir yangin projesinde ($INSUNITS "mm" derken) cizim
 *  DESIMETRE cizilmisti. Tablo eksikken normalizeToMeters bu birimi taniyamiyor
 *  ve asagidaki sessiz fallback yuzunden metraj 100x yanlis cikiyordu. */
export const UNIT_SCALE_TO_METER: Record<DrawingUnit, number> = {
  m: 1,
  dm: 10,
  cm: 100,
  mm: 1000,
  inch: 39.37007874015748,
  ft: 3.280839895013123,
};

/** Backend'in dondurdugu `scale` (metre / cizim birimi) -> birim etiketi. */
export function unitLabelFromScale(scale: number): DrawingUnit | null {
  const eslesme: [DrawingUnit, number][] = [
    ['mm', 0.001], ['cm', 0.01], ['dm', 0.1], ['m', 1],
    ['inch', 0.0254], ['ft', 0.3048],
  ];
  for (const [label, meters] of eslesme) {
    if (Math.abs(scale - meters) / meters < 1e-6) return label;
  }
  return null;
}

/** Ham uzunlugu METRE'ye cevirir. Metrajin tek gercegi.
 *
 *  SESSIZ FALLBACK KALDIRILDI: onceki surum bilinmeyen birimde ham degeri
 *  AYNEN donduruyordu. 'dm' tabloda olmadigi icin bu, 1286 m yerine 12867
 *  (ham birim) yazmak demekti — hicbir uyari vermeden. Artik bilinmeyen birim
 *  gurultulu bir sekilde raporlanir ve donusum yapilmadigini cagiran bilir. */
export function normalizeToMeters(rawLength: number, selectedUnit: DrawingUnit | string): number {
  const divisor = UNIT_SCALE_TO_METER[selectedUnit as DrawingUnit];
  if (!divisor) {
    console.error(
      `[birim] Tanınmayan çizim birimi: "${selectedUnit}". Metraj dönüştürülemedi — ` +
      `ham değer döndürülüyor (${rawLength}). Desteklenen: ${Object.keys(UNIT_SCALE_TO_METER).join(', ')}`,
    );
    return rawLength;
  }
  return rawLength / divisor;
}

/** Cap-text arama yaricapi (CAD world unit). "Gercek 2 metre" sinirini secilen
 *  birimin world-unit karsiligina cevirir: mm->2000, cm->200, dm->20, m->2. */
export function searchRadiusForUnit(selectedUnit: DrawingUnit | string): number {
  const mult = UNIT_SCALE_TO_METER[selectedUnit as DrawingUnit];
  if (!mult) {
    console.error(`[birim] Tanınmayan çizim birimi: "${selectedUnit}" — arama yarıçapı mm varsayıldı`);
    return 2000;
  }
  return 2.0 * mult;
}
