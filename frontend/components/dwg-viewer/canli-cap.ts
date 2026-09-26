/**
 * Bilgi kutusunun cap/miras satiri — CANLI kaynak (25.09 sabit kutu vakasi).
 *
 * VAKA: boru segmentine tiklaninca viewer hedefin o anki FOTOGRAFINI
 * (`selectedLine`) sabitler, SONRA `onSegmentClick` cagirir; aktif cap
 * kalemi o tiklamayla capi yazar (ayni kaleme tekrar tik = siler). Sabit
 * kutu fotografi gosterdigi icin atamadan sonra "Cap" satiri cikmiyor,
 * geri almadan sonra eski cap kaliyordu — Esc'e ya da yeni tiklamaya dek.
 * Kalem yokken tik da kutuyu sabitler; sonra "bos segmentlere uygula" capi
 * degistirirse ayni bayatlik. Hover durumu da ayni varligi korurken eski
 * nesneyi tutar (bkz. `setHovered(prev => ...)`).
 *
 * KURAL: cap ve miras bilgisi fotograftan DEGIL, guncel segment dizisinden
 * okunur — `computeHovered` ile ayni kaynak ve ayni bicim. Uzunluk da canli:
 * birim degisince (yeniden ayirma bitene dek) calisma alani ayni parcalari
 * YENI birimle cizer; fotograftaki uzunluk eski birimin sayisidir (25.09 canli).
 *
 * ⚠ INDEX TEK BASINA KIMLIK DEGIL: onaylanan layer'in segmentleri diziden
 * duser (`capRenkliGorunur`), onayi kaldirilinca dizinin BASINA doner;
 * fotograftaki index o zaman BASKA bir segmenti gosterir. Aday ancak ayni
 * layer + ayni uc koordinatlari + ayni cizgi (polyline) ise kabul edilir;
 * index kaymissa dizide TEK eslesme aranir (uc noktalari ayni by-pass
 * ikizleri karismasin). Bulunamazsa kural fotografi aynen dondurur ve viewer
 * sabit secimi kaldirir (`sabitSecimGecersiz`) — baska segmentin ya da
 * onaydan once kalan bayat capi gostermek, hic gostermemekten kotudur.
 */
import type { EdgeSegment } from '../dwg-metraj/types';

type Cizgi = ReadonlyArray<readonly [number, number]>;

/** Bilgi kutusuna giden varligin bu kuralin ilgilendigi alanlari. */
export interface CapliVarlik {
  type: string;
  layer: string;
  index: number;
  coords: [number, number, number, number];
  polyline?: Cizgi;
  diameter?: string;
  isInherited?: boolean;
  /** Metre — bilgi kutusundaki "Parça: 12,3 m". */
  length?: number;
}

/** Mekansal indeksle ayni kural: 2 noktadan az polyline YOK sayilir
 *  (`DxfCanvasViewer` indeksi o segmenti polyline'siz kaydeder). */
const cizgi = (p: Cizgi | undefined): Cizgi | undefined => (p && p.length >= 2 ? p : undefined);

function ayniCizgi(a: Cizgi | undefined, b: Cizgi | undefined): boolean {
  const x = cizgi(a);
  const y = cizgi(b);
  if (!x || !y) return !x && !y;
  if (x.length !== y.length) return false;
  return x.every((n, i) => n[0] === y[i][0] && n[1] === y[i][1]);
}

function ayniSegment(v: CapliVarlik, s: EdgeSegment): boolean {
  return s.layer === v.layer
    && s.coords[0] === v.coords[0] && s.coords[1] === v.coords[1]
    && s.coords[2] === v.coords[2] && s.coords[3] === v.coords[3]
    && ayniCizgi(v.polyline, s.polyline);
}

/** Fotograftaki edge'in guncel dizideki karsiligi; yoksa ya da hangisi
 *  oldugu bilinemiyorsa (birden cok ikiz) `undefined`. */
export function canliSegmentiBul(
  varlik: CapliVarlik,
  segmentler: readonly EdgeSegment[] | null | undefined,
): EdgeSegment | undefined {
  if (!segmentler) return undefined;
  const aday = segmentler[varlik.index];
  if (aday && ayniSegment(varlik, aday)) return aday;
  let bulunan: EdgeSegment | undefined;
  for (const s of segmentler) {
    if (!ayniSegment(varlik, s)) continue;
    if (bulunan) return undefined;
    bulunan = s;
  }
  return bulunan;
}

/** Varligin cap/miras alanlarini guncel segmentten doldurur. Edge degilse ya
 *  da segment bulunamazsa varlik aynen doner. */
export function canliCapliVarlik<T extends CapliVarlik>(
  varlik: T,
  segmentler: readonly EdgeSegment[] | null | undefined,
): T {
  if (varlik.type !== 'edge') return varlik;
  const canli = canliSegmentiBul(varlik, segmentler);
  if (!canli) return varlik;
  return { ...varlik, diameter: canli.diameter || undefined, isInherited: canli.is_inherited || false, length: canli.length };
}

/** Sabit secim artik gecersiz mi: edge'in segmenti viewer dizisinde yok
 *  (layer onaylandi, yeniden hesaplandi ya da ikizler ayirt edilemiyor). */
export function sabitSecimGecersiz(
  secim: CapliVarlik | null | undefined,
  segmentler: readonly EdgeSegment[] | null | undefined,
): boolean {
  return !!secim && secim.type === 'edge' && !canliSegmentiBul(secim, segmentler);
}
