/**
 * Birim donusturucu (deterministik — TAHMIN YOK).
 *
 * Sistem cizim birimini ASLA tahmin etmez. Birim tamamen kullanici
 * sorumlulugundadir (UI dropdown -> selectedUnit). Bu dosya sadece
 * matematiksel donusturucu olarak calisir.
 *
 * NOT: Eski detectDrawingUnit (medyan-heuristic) ve auto-detect mantiklari
 * SILINDI — CAD'de cok kisa segment yuzunden medyan yanlis birim tahmin
 * ediyordu (kanit: PIS SU medyan 19->cm, tum cizim 3->m; gercek mm).
 */

export type DrawingUnit = 'mm' | 'cm' | 'm';

/** 1 metrenin secilen birimdeki matematiksel karsiligi (TEK GERCEK KAYNAK). */
export const UNIT_SCALE_TO_METER: Record<DrawingUnit, number> = {
  m: 1,
  cm: 100,
  mm: 1000,
};

/** Ham uzunlugu (rawLength) selectedUnit'e gore METRE'ye cevirir. Metrajin tek gercegi.
 *  Metraj (metre) = rawLength / UNIT_SCALE_TO_METER[selectedUnit]. */
export function normalizeToMeters(rawLength: number, selectedUnit: DrawingUnit | string): number {
  const divisor = UNIT_SCALE_TO_METER[selectedUnit as DrawingUnit];
  if (!divisor) return rawLength; // tanimsiz birim -> fallback (ham deger)
  return rawLength / divisor;
}

/** Cap-text arama yaricapi (CAD world unit). "Gercek 2 metre" sinirini secilen
 *  birimin world-unit karsiligina cevirir: mm->2000, cm->200, m->2. */
export function searchRadiusForUnit(selectedUnit: DrawingUnit | string): number {
  const mult = UNIT_SCALE_TO_METER[selectedUnit as DrawingUnit];
  if (!mult) return 2000; // fallback: mm varsayimi
  return 2.0 * mult;
}
