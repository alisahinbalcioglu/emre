/**
 * Adim 2 "Cap atayin" listesi (saf; test edilir).
 *
 * Satirlar = kullanicinin cap kalemleri ∪ secili layer'da ATANMIS caplar
 * (kalemi silinmis ama parcada duran cap da listede gorunur; tiklayinca
 * yeniden kalem olur). Her satirda o layer'daki metraj ve parca sayisi.
 *
 * MALZEME GRUBU: kalem metni teklifte de "Cap + Cins" diye ikiye ayrilir
 * ("Ø110 PVC BORU" → Çapı=Ø110, Malzeme Cinsi=PVC BORU; `parseMaterialText`,
 * quotes/new). Gruplama AYNI ayristiriciyla cinsten yapilir — iki ekran ayni
 * metni farkli okumasin.
 */
import type { EdgeSegment } from '../dwg-metraj/types';
import { isUnassignedDiameter } from '../dwg-metraj/constants';
import { canonicalizeDiameter, diameterToColor, diameterToNumeric } from '../dwg-metraj/diameter-colors';
import { parseMaterialText } from '../../ozellik/tablo/parse-material-text';
import { turkceKatla } from './boru-adaylari';

export type MalzemeGrubu = 'PVC' | 'HDPE' | 'PPR-C' | 'Çelik / siyah boru' | 'Diğer';

export const GRUP_SIRASI: readonly MalzemeGrubu[] = ['PVC', 'HDPE', 'PPR-C', 'Çelik / siyah boru', 'Diğer'];

export function malzemeGrubu(etiket: string): MalzemeGrubu {
  const { cins } = parseMaterialText(etiket);
  const k = turkceKatla(cins || etiket);
  if (/\bpvc\b/.test(k)) return 'PVC';
  if (/\bhdpe\b|\bpe-?hd\b|\bpe ?100\b|\bpe ?80\b/.test(k)) return 'HDPE';
  if (/\bpp-?r(-?c)?\b|\bpprc\b/.test(k)) return 'PPR-C';
  if (/celik|siyah|galvaniz|dikissiz/.test(k)) return 'Çelik / siyah boru';
  return 'Diğer';
}

/** Nominal cap (mm) — satir sirasi; cap cinsten ayrilarak okunur
 *  ('1" SİYAH BORU' → '1"' → 25 mm). Okunamazsa null (sona). */
export function nominalCap(etiket: string): number | null {
  const { cap } = parseMaterialText(etiket);
  return diameterToNumeric(cap || etiket);
}

export interface CapKalemi {
  id: string;
  diameter: string;
}

export interface CapSatiri {
  /** Kanonik cap metni (kalem metni). */
  cap: string;
  renk: string;
  /** Secili layer'da bu capa atanmis toplam metre. */
  metre: number;
  parca: number;
  /** Cap kalemi kimligi; `null` = kalemi yok, yalniz parcada duruyor. */
  kalemId: string | null;
  grup: MalzemeGrubu;
}

function sirala(a: CapSatiri, b: CapSatiri): number {
  const ga = GRUP_SIRASI.indexOf(a.grup);
  const gb = GRUP_SIRASI.indexOf(b.grup);
  if (ga !== gb) return ga - gb;
  const na = nominalCap(a.cap);
  const nb = nominalCap(b.cap);
  if (na !== nb) {
    if (na === null) return 1;
    if (nb === null) return -1;
    return na - nb;
  }
  return a.cap.localeCompare(b.cap, 'tr');
}

/** Liste satirlari: kalemler + layer'daki kalemsiz caplar, gruplu ve sirali. */
export function capSatirlari(kalemler: readonly CapKalemi[], segmentler: readonly EdgeSegment[]): CapSatiri[] {
  const toplam = new Map<string, { metre: number; parca: number }>();
  // Ham cap metni → kanonik: bir layer'da yalniz birkac farkli deger var.
  // 25.09 inceleme olcumu: 50 000 parcada her tikta 150–185 ms kanoniklestirme.
  const kanonik = new Map<string, string>();
  for (const s of segmentler) {
    if (isUnassignedDiameter(s.diameter)) continue;
    let k = kanonik.get(s.diameter);
    if (k === undefined) {
      k = canonicalizeDiameter(s.diameter);
      kanonik.set(s.diameter, k);
    }
    const t = toplam.get(k) ?? { metre: 0, parca: 0 };
    toplam.set(k, { metre: t.metre + (s.length || 0), parca: t.parca + 1 });
  }
  const satirlar: CapSatiri[] = [];
  const gorulen = new Set<string>();
  for (const kalem of kalemler) {
    const cap = canonicalizeDiameter(kalem.diameter);
    if (!cap || gorulen.has(cap)) continue;
    gorulen.add(cap);
    const t = toplam.get(cap) ?? { metre: 0, parca: 0 };
    satirlar.push({ cap, renk: diameterToColor(cap), metre: t.metre, parca: t.parca, kalemId: kalem.id, grup: malzemeGrubu(cap) });
  }
  toplam.forEach((t, cap) => {
    if (gorulen.has(cap)) return;
    satirlar.push({ cap, renk: diameterToColor(cap), metre: t.metre, parca: t.parca, kalemId: null, grup: malzemeGrubu(cap) });
  });
  return satirlar.sort(sirala);
}

export interface CapGrubu {
  /** `null` = baslik cizilmez (tum satirlar "Diğer" ise gruplama anlamsiz). */
  grup: MalzemeGrubu | null;
  satirlar: CapSatiri[];
}

/** Sirali satirlari gruplar. Hepsi "Diğer"se tek, basliksiz grup. */
export function capGruplari(satirlar: readonly CapSatiri[]): CapGrubu[] {
  if (satirlar.length === 0) return [];
  if (satirlar.every((s) => s.grup === 'Diğer')) return [{ grup: null, satirlar: [...satirlar] }];
  const out: CapGrubu[] = [];
  for (const s of satirlar) {
    const son = out[out.length - 1];
    if (son && son.grup === s.grup) son.satirlar.push(s);
    else out.push({ grup: s.grup, satirlar: [s] });
  }
  return out;
}

/** Arama kutusu (Turkce katlamali, bozuk kodlamaya dayanikli). */
export function capAra(satirlar: readonly CapSatiri[], sorgu: string): CapSatiri[] {
  const q = turkceKatla(sorgu.trim());
  if (!q) return [...satirlar];
  return satirlar.filter((s) => turkceKatla(s.cap).includes(q));
}

export interface CapIlerlemesi {
  toplam: number;
  capli: number;
  capsiz: number;
  toplamMetre: number;
  capsizMetre: number;
}

/** "Çap verilen parçalar 7 / 16" + "9 parça çapsız · 130,5 m". */
export function capIlerlemesi(segmentler: readonly EdgeSegment[]): CapIlerlemesi {
  let capli = 0;
  let toplamMetre = 0;
  let capsizMetre = 0;
  for (const s of segmentler) {
    const m = s.length || 0;
    toplamMetre += m;
    if (isUnassignedDiameter(s.diameter)) capsizMetre += m;
    else capli += 1;
  }
  return { toplam: segmentler.length, capli, capsiz: segmentler.length - capli, toplamMetre, capsizMetre };
}

/**
 * Cap satirindan cizimde gezinme — odak PARCA NUMARASIYLA tutulur, dizi
 * indeksiyle DEGIL. 25.09 inceleme (iki inceleyici ayri ayri buldu): odak
 * indeksle tutuluyordu; kullanici o capin baska bir parcasini etiketleyince
 * liste kisaliyor, ayni indeks baska parcaya dusuyor ve kamera oraya
 * zipliyordu ("saklanan index kimlik degildir" dersi).
 *
 * `kimlikler`: o capin parcalarinin numaralari, ARTAN sirada.
 * Siradaki parca: odak listedeyse bir sonraki (sonda basa doner); odak
 * listeden cikmissa (etiketlendi) numarasi ondan buyuk ilk parca — tur
 * kaldigi yerden surer.
 */
export function sonrakiParca(kimlikler: readonly number[], odak: number | null): number | null {
  if (kimlikler.length === 0) return null;
  if (odak === null) return kimlikler[0];
  const i = kimlikler.indexOf(odak);
  if (i >= 0) return kimlikler[(i + 1) % kimlikler.length];
  for (const k of kimlikler) if (k > odak) return k;
  return kimlikler[0];
}

/** Satirdaki "3/9" gosterimi; odak artik listede degilse (etiketlendi) null. */
export function gezinmeKonumu(
  kimlikler: readonly number[],
  odak: number | null,
): { sira: number; toplam: number } | null {
  if (odak === null) return null;
  const i = kimlikler.indexOf(odak);
  return i < 0 ? null : { sira: i, toplam: kimlikler.length };
}
