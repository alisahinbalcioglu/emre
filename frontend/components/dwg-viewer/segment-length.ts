/**
 * Hover tooltip uzunluk cozumleme — Auto-mode scale=0 bug'ina karsi.
 *
 * BUG: Auto-mode'da frontend `scale=0` (parametre backend'e gonderilmiyor,
 * backend $INSUNITS+geometri ile karar veriyor). computeEntityLength ham
 * koordinati `* scale` ile carptigi icin scale=0 -> tooltip "0.00 m".
 * Metraj paneli ise backend'in hazir `length` (metre) degerini okudugu icin
 * dogru gosteriyor. Bu yuzden edge segment'lerde de backend length'e guvenilir.
 */

export interface SegmentLengthInput {
  type: 'line' | 'edge';
  /** Backend'in hesapladigi metre uzunluk — sadece edge segment'lerde dolu. */
  length?: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
}

/** Ham geometriden uzunluk (scale uygulanir). Line segmentler icin — bunlarin
 *  backend metraj uzunlugu yoktur, ham DWG koordinatindan hesaplanir. */
export function computeEntityLength(
  entry: { coords: [number, number, number, number]; polyline?: Array<[number, number]> },
  scale: number,
): number {
  if (entry.polyline && entry.polyline.length >= 2) {
    let total = 0;
    for (let i = 0; i < entry.polyline.length - 1; i++) {
      total += Math.hypot(
        entry.polyline[i + 1][0] - entry.polyline[i][0],
        entry.polyline[i + 1][1] - entry.polyline[i][1],
      );
    }
    return total * scale;
  }
  const [x1, y1, x2, y2] = entry.coords;
  return Math.hypot(x2 - x1, y2 - y1) * scale;
}

/** Hover tooltip uzunlugu. Edge segment'lerde backend metre `length` gonderir;
 *  Auto-mode scale=0 olsa bile bu degere guvenilir. Line segment'lerde (ham
 *  geometri) backend length yok -> scale ile ham hesaba duser. */
export function resolveHoverLength(entry: SegmentLengthInput, scale: number): number {
  if (entry.type === 'edge' && typeof entry.length === 'number' && entry.length > 0) {
    return entry.length;
  }
  return computeEntityLength(entry, scale);
}
