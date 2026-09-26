/**
 * GORUNUM KUTUSU (26.09.2026) — acilista ve "Tumunu sigdir"da kameranin
 * cercevesi: cizimin ASIL govdesi, uzakta kalmis birkac sapkin nesne DEGIL.
 *
 * Motorun `bounds`u butun varliklarin ham min/maks'idir; birkac uzak nesne
 * kutuyu cizimin binlerce katina cikarir ve proje acilista uzakta bir nokta
 * olarak gorunur (bazen hic gorunmez). Olculdu:
 *  - canli proje (A-sihhi): 143.724 noktanin 43'u — hepsi INSERT capasi, 3'u
 *    '0' katmaninda -445 milyonda — ham kutuyu cizimin 7.655 katina sisiriyordu;
 *  - Marina (ikinci aile): sayisal adli katmanlarda 63 milyon genisliginde bir
 *    cizgi seridi, ham kutu cizimin 1.395 kati.
 *
 * KURAL: kutuya yalniz sahnenin CIZDIGI varliklar girer — cizgi uclari, yazi
 * konumu, daire/yay merkezi (+ yaricap). INSERT capasi GIRMEZ: sahne capayi
 * cizmez (blok icerigini motor cizgiye acar); tabani 0,0'da kalmis bloklar
 * sayica cok olsa bile kutuyu cekemez. Her eksende noktalarin %2-%98 dilimi
 * CEKIRDEKtir; cekirdege en buyuk kenari kadar yakin her nokta cizime dahildir
 * (kenardaki antet, cerceve, lejant kirpilmaz), daha uzagi sapkindir. Sapkin
 * yoksa sonuc cizilen varliklarin tam kutusudur. Sonlu olmayan koordinat —
 * motor NaN ve ±∞'u JSON'da null yollar — hic sayilmaz (0 SAYILMAZ).
 *
 * SINIR: bir eksenin bir ucunda sapkinlar noktalarin yaklasik %2'sini asarsa
 * cekirdege girer ve kutu onlari da kapsar — bugunku davranis, daha kotu degil
 * (olculen iki dosyada oran %0,03 ve %1,3). Uzak ama MESRU kucuk bir pafta
 * (noktalarin %2'sinden azi) acilista ve "Tumunu sigdir"da gorunmez; kullanici
 * uzaklasarak bulur. Cekirdegin en buyuk kenarindan buyuk yaricapli dairenin
 * yalniz merkezi kutuya girer (anlamsiz yaricap kutuyu sisiremez).
 */
import type { GeometryResult } from './types';

export type Kutu = [number, number, number, number];

/** Her eksende alt ve ust uctan dislanan nokta orani. */
export const CEKIRDEK_DILIMI = 0.02;
/** Cekirdegin en buyuk kenarinin bu kati kadar yakin nokta cizime dahildir. */
export const PAY_KATI = 1;
/** Yuzdelik icin en cok bu kadar VARLIK orneklenir (cizginin iki ucu birlikte). */
const ORNEK_SINIRI = 100_000;

export function gorunumKutusu(g: GeometryResult): Kutu {
  const ham = g.bounds;
  const L = g.lines ?? [];
  const T = g.texts ?? [];
  const C = g.circles ?? [];
  const A = g.arcs ?? [];

  // 1) Ornek: her `adim`inci VARLIK. Nokta basina adimlamak adim cift olunca
  //    yalniz cizgi BASLANGICLARINI seciyordu (kod incelemesi 26.09).
  const adim = Math.max(1, Math.ceil((L.length + T.length + C.length + A.length) / ORNEK_SINIRI));
  const xs: number[] = [];
  const ys: number[] = [];
  const ornek = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  };
  for (let i = 0; i < L.length; i += adim) {
    const c = L[i].coords;
    ornek(c[0], c[1]);
    ornek(c[2], c[3]);
  }
  for (let i = 0; i < T.length; i += adim) if (T[i].position) ornek(T[i].position[0], T[i].position[1]);
  for (let i = 0; i < C.length; i += adim) if (C[i].center) ornek(C[i].center[0], C[i].center[1]);
  for (let i = 0; i < A.length; i += adim) if (A[i].center) ornek(A[i].center[0], A[i].center[1]);
  if (xs.length === 0) return ham;

  const sx = Float64Array.from(xs).sort();
  const sy = Float64Array.from(ys).sort();
  const dilim = (a: Float64Array, f: number) => a[Math.round(f * (a.length - 1))];
  const c0x = dilim(sx, CEKIRDEK_DILIMI);
  const c0y = dilim(sy, CEKIRDEK_DILIMI);
  const c1x = dilim(sx, 1 - CEKIRDEK_DILIMI);
  const c1y = dilim(sy, 1 - CEKIRDEK_DILIMI);
  // Cekirdek tek noktaysa pay 0: kutu o nokta olur (sifir boyutu zoomToBounds
  // karsilar). Ham kutuya DONULMEZ — ham kutu tam da sapkinlari tasir.
  const pay = PAY_KATI * Math.max(c1x - c0x, c1y - c0y);
  const bx0 = c0x - pay;
  const by0 = c0y - pay;
  const bx1 = c1x + pay;
  const by1 = c1y + pay;

  // 2) Kesin gecis: BUTUN varliklar, geri cagrisiz siki dongu (1,5 M cizgi).
  //    Motor NaN ve ±∞'u JSON'da null yollar (main.py `_json_safe`); null, >= ve
  //    <= karsilastirmasinda 0 sayilir — once tipi denetlenir (kod incelemesi
  //    26.09). Bellekteki NaN ve ±∞ araliga zaten girmez.
  let mnx = Infinity;
  let mny = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  for (let i = 0; i < L.length; i++) {
    const c = L[i].coords;
    const x1 = c[0];
    const y1 = c[1];
    const x2 = c[2];
    const y2 = c[3];
    if (typeof x1 === 'number' && typeof y1 === 'number' && x1 >= bx0 && x1 <= bx1 && y1 >= by0 && y1 <= by1) {
      if (x1 < mnx) mnx = x1;
      if (x1 > mxx) mxx = x1;
      if (y1 < mny) mny = y1;
      if (y1 > mxy) mxy = y1;
    }
    if (typeof x2 === 'number' && typeof y2 === 'number' && x2 >= bx0 && x2 <= bx1 && y2 >= by0 && y2 <= by1) {
      if (x2 < mnx) mnx = x2;
      if (x2 > mxx) mxx = x2;
      if (y2 < mny) mny = y2;
      if (y2 > mxy) mxy = y2;
    }
  }
  const nokta = (x: number, y: number, r: number) => {
    if (typeof x !== 'number' || typeof y !== 'number') return; // telden gelen null
    if (!(x >= bx0 && x <= bx1 && y >= by0 && y <= by1)) return; // sapkin
    const rr = r > 0 && r <= pay ? r : 0; // anlamsiz buyuk yaricap kutuyu sisiremez
    if (x - rr < mnx) mnx = x - rr;
    if (x + rr > mxx) mxx = x + rr;
    if (y - rr < mny) mny = y - rr;
    if (y + rr > mxy) mxy = y + rr;
  };
  for (const t of T) if (t.position) nokta(t.position[0], t.position[1], 0);
  for (const d of C) if (d.center) nokta(d.center[0], d.center[1], d.radius);
  for (const d of A) if (d.center) nokta(d.center[0], d.center[1], d.radius);
  return Number.isFinite(mnx) ? [mnx, mny, mxx, mxy] : ham;
}
