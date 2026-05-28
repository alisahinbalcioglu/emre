/**
 * Heuristic Unit Detection + Normalization Layer (PRD).
 *
 * ADIM 1: detectDrawingUnit — segment ham uzunluklarinin MEDYANINA gore birim tahmini.
 * ADIM 2: normalizeToMeters — ham uzunlugu kesin olarak metre'ye cevirir.
 *
 * NOT (kanit): Medyan-heuristic CAD'de cok sayida kisa segment (armatur/hatch)
 * yuzunden dusuk medyan verip yanlis tahmin edebilir. Bu yuzden ADIM 3'teki
 * kullanici override (selectedUnit dropdown) guvenlik agidir.
 */

export type DrawingUnit = 'mm' | 'cm' | 'm';

/** Ham uzunlugu (rawLength) selectedUnit'e gore METRE'ye cevirir. Metrajin tek gercegi. */
export function normalizeToMeters(rawLength: number, selectedUnit: DrawingUnit | string): number {
  if (selectedUnit === 'mm') {
    return rawLength / 1000;
  } else if (selectedUnit === 'cm') {
    return rawLength / 100;
  } else if (selectedUnit === 'm') {
    return rawLength / 1;
  } else {
    return rawLength; // Fallback (tanimsiz birim)
  }
}

/** Medyan-heuristic ile cizim birimini tahmin eder (PRD ADIM 1).
 *   median > 800        -> 'mm'
 *   15 < median <= 800  -> 'cm'
 *   median <= 15        -> 'm'
 *  Bos dizi -> 'mm' (en yaygin CAD birimi, guvenli default). */
export function detectDrawingUnit(rawLengths: number[]): DrawingUnit {
  const valid = rawLengths.filter((l) => Number.isFinite(l) && l > 0).sort((a, b) => a - b);
  if (valid.length === 0) return 'mm';
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
  if (median > 800) return 'mm';
  if (median > 15) return 'cm';
  return 'm';
}
