/**
 * ETIKET AKTARIMI — yeniden ayrilan bir layer'in cap etiketlerini GEOMETRIYLE
 * yeni parcalara tasir (saf; React'siz; test edilir).
 *
 * NEDEN (25.09 tasarimi: "birim degisince cap etiketleri korunur"): o ana dek
 * birim degisince hesaplanan layer'lar TAMAMEN dusuruluyordu; 💧 isareti
 * sonradan degisince de yeniden hesap tum etiketleri siliyordu (onay
 * penceresiyle). Etiket ise saatlerce suren elle emek.
 *
 * NEDEN segment_id ile DEGIL:
 *  - Motor her ayirmada parcalari 1'den numaralar; birim ya da 💧 degisince
 *    parca sayisi ve sirasi degisir (sprinkler'da bolunme, birlesme).
 *  - Motorun dugum toleransi BIRIME BAGLI (`pipe_segments._compute_tolerances`)
 *    ve parca uclari dugum izgarasina yuvarlanir: ayni boru yeni birimde
 *    tolerans kadar KAYMIS koordinatla gelir. Birebir koordinat eslesmesi de
 *    bu yuzden tutmaz.
 *
 * KURAL (her yeni parca icin):
 *  1. Parcanin IC kismindan yogun ornek alinir (uclardan `pay` kadar iceride —
 *     T noktasinda bulusan komsular karismasin; aralik pay/2, en cok 1024).
 *  2. Her ornek icin ayni layer'in ESKI parcalarindan, `pay` icinde kalan ve
 *     yonu HIZALI olanlarin en yakini secilir (branşman capraz gelir, hizali
 *     degildir; kisa kenarda yon gurultulu oldugu icin hiza aranmaz).
 *  3. En yakinin yaninda FARKLI etiketli baska bir eski parca da (d + 0,2·pay)
 *     icindeyse ornek BELIRSIZDIR (ust uste ikiz / by-pass borular).
 *  4. Butun ornekler kapsaniyor, hicbiri belirsiz degil ve hepsi AYNI, dolu
 *     etikete dusuyorsa etiket tasinir. Aksi halde parca capsiz kalir —
 *     yanlis cap tasimak, cap tasimamaktan kotudur (kullanici yeniden atar,
 *     sayisi bildirimde yazilir).
 */
import RBush from 'rbush';
import type { EdgeSegment } from '../dwg-metraj/types';
import { isUnassignedDiameter } from '../dwg-metraj/constants';
import { canonicalizeDiameter } from '../dwg-metraj/diameter-colors';

type Nokta = readonly [number, number];

/** Segmentin cizilen yolu — viewer ve mekansal indeksle AYNI kural:
 *  2 noktadan az polyline yok sayilir, uc koordinatlarina dusulur. */
export function segmentYolu(s: Pick<EdgeSegment, 'coords' | 'polyline'>): Nokta[] {
  if (s.polyline && s.polyline.length >= 2) return s.polyline as Nokta[];
  return [[s.coords[0], s.coords[1]], [s.coords[2], s.coords[3]]];
}

/**
 * Motorun dugum toleransi (cizim biriminde) — `pipe_segments._compute_tolerances`
 * ile AYNI formul: `max(1, min(0,05/S, kosegen·0,001))`. `kosegen` = boru
 * LAYER'inin kendi sinir kutusu (motor da yalniz secili layer'in kenarlarindan
 * hesaplar). Motorun p10 kelepcesi toleransi yalniz KUCULTUR; burada yok
 * sayilir, sonuc ust sinirdir.
 *
 * ⚠ 25.09 inceleme olcumu: once TUM cizimin kosegeni kullaniliyordu. Cok
 * sayfali cizimde (2 km model uzayi) pay 3000 birime cikti; 150 mm arayla iki
 * paralel boru belirsiz sayildi ve 50 000 etiketin HEPSI kayboldu.
 */
export function dugumToleransi(scale: number | undefined, kosegen: number): number {
  const kosegenSiniri = Number.isFinite(kosegen) && kosegen > 0 ? kosegen * 0.001 : 0;
  const birimSiniri = scale !== undefined && scale > 0 ? 0.05 / scale : Infinity;
  return Math.max(1, Math.min(birimSiniri, kosegenSiniri));
}

/** Arama payi: eski ve yeni parcalamanin uclari AYRI ayri (kendi birimlerinin
 *  toleransi kadar) kayabilir; en kotu durumda aradaki fark iki toleransin
 *  toplamidir → buyugunun 2 kati. */
export function aktarimPayi(eskiScale: number | undefined, yeniScale: number | undefined, kosegen: number): number {
  return 2 * Math.max(dugumToleransi(eskiScale, kosegen), dugumToleransi(yeniScale, kosegen));
}

/** Segment kumelerinin (eski ∪ yeni) ortak sinir kutusu kosegeni. */
export function segmentKosegeni(...kumeler: ReadonlyArray<readonly EdgeSegment[]>): number {
  let mnx = Infinity;
  let mny = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  for (const segmentler of kumeler) {
    for (const s of segmentler) {
      for (const [x, y] of segmentYolu(s)) {
        if (x < mnx) mnx = x;
        if (y < mny) mny = y;
        if (x > mxx) mxx = x;
        if (y > mxy) mxy = y;
      }
    }
  }
  return Number.isFinite(mnx) ? Math.hypot(mxx - mnx, mxy - mny) : 0;
}

interface KenarKaydi {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Eski segment dizisindeki sira. */
  eski: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Birim yon vektoru (uzunluk 0 ise 0,0). */
  ux: number;
  uy: number;
  uzunluk: number;
}

/** Yon hizasi esigi: 35° — Y-branşman (≥45°) elenir, cizim gurultusu gecer. */
const COS_HIZA = Math.cos((35 * Math.PI) / 180);
/** Iki eski parca bu fark icindeyse ornek belirsizdir (pay'in orani). */
const BELIRSIZLIK_ORANI = 0.2;
/** Parca basina en cok ornek — cok uzun borularda sure sinirli kalsin. */
const ORNEK_SINIRI = 1024;

export interface AktarimSonucu {
  segmentler: EdgeSegment[];
  /** Capi tasinan parca sayisi. */
  aktarilan: number;
  /** Capli eski geometriye oturdugu halde CAPSIZ kalan parca (cakisma,
   *  belirsizlik ya da kismen yeni geometri) — kullanici yeniden atamali. */
  yenidenEtiketlenecek: number;
  /** Sonucta capsiz kalan toplam parca (eskiden de capsiz olanlar dahil). */
  capsiz: number;
}

/** Noktanin kenara (dogru parcasi) uzakligi. */
function kenarUzakligi(x: number, y: number, k: KenarKaydi): number {
  const dx = k.bx - k.ax;
  const dy = k.by - k.ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-18) return Math.hypot(x - k.ax, y - k.ay);
  let t = ((x - k.ax) * dx + (y - k.ay) * dy) / l2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(x - (k.ax + t * dx), y - (k.ay + t * dy));
}

/** Yol boyunca ornek konumlari (yay uzunlugu). */
function ornekKonumlari(uzunluk: number, pay: number): number[] {
  if (uzunluk <= 2 * pay) return [0.25 * uzunluk, 0.5 * uzunluk, 0.75 * uzunluk];
  const bas = pay;
  const son = uzunluk - pay;
  const adet = Math.min(ORNEK_SINIRI, Math.max(3, Math.ceil((son - bas) / (pay / 2)) + 1));
  const out: number[] = [];
  for (let i = 0; i < adet; i++) out.push(bas + ((son - bas) * i) / (adet - 1));
  return out;
}

interface YolOrnegi {
  x: number;
  y: number;
  ux: number;
  uy: number;
  /** Ornegin dustugu kenarin uzunlugu — kisa kenarda yon guvenilmez. */
  kenar: number;
}

/** Artan konumlar icin yol uzerindeki noktalar (tek gecis). */
function yolOrnekleri(yol: Nokta[], konumlar: number[]): YolOrnegi[] {
  const out: YolOrnegi[] = [];
  let k = 0;
  let bas = 0; // k. kenarin baslangicindaki birikmis uzunluk
  for (const s of konumlar) {
    while (k < yol.length - 1) {
      const l = Math.hypot(yol[k + 1][0] - yol[k][0], yol[k + 1][1] - yol[k][1]);
      if (s <= bas + l || k === yol.length - 2) {
        const t = l > 0 ? Math.min(1, Math.max(0, (s - bas) / l)) : 0;
        out.push({
          x: yol[k][0] + (yol[k + 1][0] - yol[k][0]) * t,
          y: yol[k][1] + (yol[k + 1][1] - yol[k][1]) * t,
          ux: l > 0 ? (yol[k + 1][0] - yol[k][0]) / l : 0,
          uy: l > 0 ? (yol[k + 1][1] - yol[k][1]) / l : 0,
          kenar: l,
        });
        break;
      }
      bas += l;
      k += 1;
    }
  }
  return out;
}

function yolUzunlugu(yol: Nokta[]): number {
  let t = 0;
  for (let i = 0; i < yol.length - 1; i++) t += Math.hypot(yol[i + 1][0] - yol[i][0], yol[i + 1][1] - yol[i][1]);
  return t;
}

/** Tek yeni parcanin karari: tasinacak cap ('' = yok) ve etiket kaybi var mi. */
function parcaKarari(
  seg: EdgeSegment,
  agac: RBush<KenarKaydi>,
  etiketler: string[],
  pay: number,
): { cap: string; kayip: boolean } {
  const yol = segmentYolu(seg);
  const uzunluk = yolUzunlugu(yol);
  if (!(uzunluk > 0)) return { cap: '', kayip: false };

  const gorulen = new Set<string>();
  let etiketliGoruldu = false;
  let kapsanmayan = false;
  let belirsiz = false;

  for (const o of yolOrnekleri(yol, ornekKonumlari(uzunluk, pay))) {
    const adaylar = agac.search({ minX: o.x - pay, minY: o.y - pay, maxX: o.x + pay, maxY: o.y + pay });
    // Eski parca basina, hizali kenarlarinin en kucuk uzakligi
    const enYakin = new Map<number, number>();
    for (const k of adaylar) {
      const yonGuvenilir = k.uzunluk > pay && o.kenar > pay;
      if (yonGuvenilir && Math.abs(o.ux * k.ux + o.uy * k.uy) < COS_HIZA) continue;
      const d = kenarUzakligi(o.x, o.y, k);
      if (d > pay) continue;
      const onceki = enYakin.get(k.eski);
      if (onceki === undefined || d < onceki) enYakin.set(k.eski, d);
    }
    if (enYakin.size === 0) {
      kapsanmayan = true;
      continue;
    }
    let enI = -1;
    let enD = Infinity;
    enYakin.forEach((d, i) => {
      if (d < enD) {
        enD = d;
        enI = i;
      }
    });
    const etiket = etiketler[enI];
    enYakin.forEach((d, i) => {
      if (i !== enI && etiketler[i] !== etiket && d <= enD + BELIRSIZLIK_ORANI * pay) belirsiz = true;
    });
    if (etiket) etiketliGoruldu = true;
    gorulen.add(etiket);
  }

  const tek = gorulen.size === 1 ? Array.from(gorulen)[0] : '';
  if (tek && !kapsanmayan && !belirsiz) return { cap: tek, kayip: false };
  return { cap: '', kayip: etiketliGoruldu };
}

/**
 * Eski parcalarin (ayni layer) cap etiketlerini yeni parcalara tasir.
 * `pay`: `aktarimPayi(cizimKosegeni)`. Girdi dizileri DEGISTIRILMEZ.
 */
export function etiketleriAktar(
  eski: readonly EdgeSegment[],
  yeni: readonly EdgeSegment[],
  pay: number,
): AktarimSonucu {
  const p = Number.isFinite(pay) && pay > 0 ? pay : 1;
  const agac = new RBush<KenarKaydi>();
  const kayitlar: KenarKaydi[] = [];
  eski.forEach((s, i) => {
    const yol = segmentYolu(s);
    for (let k = 0; k < yol.length - 1; k++) {
      const [ax, ay] = yol[k];
      const [bx, by] = yol[k + 1];
      const l = Math.hypot(bx - ax, by - ay);
      kayitlar.push({
        minX: Math.min(ax, bx),
        minY: Math.min(ay, by),
        maxX: Math.max(ax, bx),
        maxY: Math.max(ay, by),
        eski: i,
        ax,
        ay,
        bx,
        by,
        ux: l > 0 ? (bx - ax) / l : 0,
        uy: l > 0 ? (by - ay) / l : 0,
        uzunluk: l,
      });
    }
  });
  agac.load(kayitlar);
  const etiketler = eski.map((s) => (isUnassignedDiameter(s.diameter) ? '' : canonicalizeDiameter(s.diameter)));

  let aktarilan = 0;
  let yenidenEtiketlenecek = 0;
  let capsiz = 0;
  const segmentler = yeni.map((seg) => {
    const karar = parcaKarari(seg, agac, etiketler, p);
    if (karar.cap) {
      aktarilan += 1;
      return { ...seg, diameter: karar.cap };
    }
    capsiz += 1;
    if (karar.kayip) yenidenEtiketlenecek += 1;
    return isUnassignedDiameter(seg.diameter) ? seg : { ...seg, diameter: '' };
  });
  return { segmentler, aktarilan, yenidenEtiketlenecek, capsiz };
}
