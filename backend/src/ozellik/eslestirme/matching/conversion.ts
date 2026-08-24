// ────────────────────────────────────────────
// Cap Cevrim Motoru (PRD v1.1 §6-§7)
// Celik: DN ↔ inc (DN25 = 1")
// PPR/HDPE (plastic): DN = dis cap mm ↔ inc (DN32 = 32mm = 1")
//
// KRITIK FARK: ayni "DN 32" celikte 1 1/4" urunune, PPR'de 32mm = 1"
// urunune gider. Bu yuzden cevrimden ONCE malzeme sinifi (SizeClass)
// belirlenmis olmali. Sinif bilinmiyorsa iki yorum BIRLIKTE doner
// (ambiguous=true) — sessizce tek birine karar verilmez (P4).
// ────────────────────────────────────────────

import { normalizeText } from './normalizer';

export type SizeClass = 'steel' | 'plastic' | 'unknown';

/** Kaynak gosterim — cevrim tablosu secimi icin sart (PPR'de DN≠inc-DN). */
export interface SizeInfo {
  source: 'dn' | 'inch' | 'mm';
  /** dn → DN numarasi; inch → ondalik inc (1.25); mm → dis cap mm */
  value: number;
  /** Kullaniciya gosterilecek ham hali ("DN 25", "1 1/4\"", "32 mm") */
  display: string;
}

export interface SizeEquivalents {
  /** Kutuphane adayinin tasiyabilecegi cap tag'lerinden HERHANGI biri yeterli */
  tags: string[];
  /** U2 seffaf cevrim rozeti: "DN 25 → 1\" (çelik)" — cevrim yapilmadiysa null */
  rozet: string | null;
  /** D5: cevrim tablosunda olmayan deger — dusuk guvenli birak */
  noConversion: boolean;
  /** P4: celik/plastik yorumlari FARKLI urunlere gidiyor — otomatik 'high' verme */
  ambiguous: boolean;
}

// ────────────────────────────────────────────
// CELIK: DN ↔ inc (PRD §6.2 — DN15..DN400)
// ────────────────────────────────────────────

interface SteelRow { dn: number; inchDisplay: string; inchDecimal: number }

export const STEEL_TABLE: SteelRow[] = [
  { dn: 15, inchDisplay: '1/2"', inchDecimal: 0.5 },
  { dn: 20, inchDisplay: '3/4"', inchDecimal: 0.75 },
  { dn: 25, inchDisplay: '1"', inchDecimal: 1 },
  { dn: 32, inchDisplay: '1 1/4"', inchDecimal: 1.25 },
  { dn: 40, inchDisplay: '1 1/2"', inchDecimal: 1.5 },
  { dn: 50, inchDisplay: '2"', inchDecimal: 2 },
  { dn: 65, inchDisplay: '2 1/2"', inchDecimal: 2.5 },
  { dn: 80, inchDisplay: '3"', inchDecimal: 3 },
  { dn: 100, inchDisplay: '4"', inchDecimal: 4 },
  { dn: 125, inchDisplay: '5"', inchDecimal: 5 },
  { dn: 150, inchDisplay: '6"', inchDecimal: 6 },
  { dn: 200, inchDisplay: '8"', inchDecimal: 8 },
  { dn: 250, inchDisplay: '10"', inchDecimal: 10 },
  { dn: 300, inchDisplay: '12"', inchDecimal: 12 },
  { dn: 350, inchDisplay: '14"', inchDecimal: 14 },
  { dn: 400, inchDisplay: '16"', inchDecimal: 16 },
];

const STEEL_BY_DN = new Map(STEEL_TABLE.map((r) => [r.dn, r]));
const STEEL_BY_INCH = new Map(STEEL_TABLE.map((r) => [r.inchDecimal, r]));

// ────────────────────────────────────────────
// PPR/HDPE: liste-DN = dis cap mm ↔ inc (PRD §7.2)
// HDPE PE100 de ayni mm mantigi (hidrant hatti vb.)
// ────────────────────────────────────────────

interface PprRow { mm: number; inchDisplay: string; inchDecimal: number }

export const PPR_TABLE: PprRow[] = [
  { mm: 20, inchDisplay: '1/2"', inchDecimal: 0.5 },
  { mm: 25, inchDisplay: '3/4"', inchDecimal: 0.75 },
  { mm: 32, inchDisplay: '1"', inchDecimal: 1 },
  { mm: 40, inchDisplay: '1 1/4"', inchDecimal: 1.25 },
  { mm: 50, inchDisplay: '1 1/2"', inchDecimal: 1.5 },
  { mm: 63, inchDisplay: '2"', inchDecimal: 2 },
  { mm: 75, inchDisplay: '2 1/2"', inchDecimal: 2.5 },
  { mm: 90, inchDisplay: '3"', inchDecimal: 3 },
  { mm: 110, inchDisplay: '4"', inchDecimal: 4 },
  { mm: 125, inchDisplay: '5"', inchDecimal: 5 },
  { mm: 160, inchDisplay: '6"', inchDecimal: 6 },
];

const PPR_BY_MM = new Map(PPR_TABLE.map((r) => [r.mm, r]));
const PPR_BY_INCH = new Map(PPR_TABLE.map((r) => [r.inchDecimal, r]));

/** Nominal mm dis cap → celik DN tag'i. normalizer.MM_TO_DN ile ayni mantik:
 *  kutuphane plastik urunleri "110mm" yazinca extractDiameter dn100 uretir —
 *  esdegerlik kumesi o tag'i de icermeli ki mevcut kutuphane tag'leri eslessin. */
const NOMINAL_MM_TO_DN: Record<number, string> = {
  // 22/28/35: YUVARLANMIS ticari OD — izolasyon ic capi boru dis capini izler,
  // kataloglar 21,3/26,9/33,7 yerine 22/28/35 yazar (ODE R-Flex 24.08 canli
  // olcum: "22 mm" od-22'ye dusuyor, teklifin 1/2''=dn15'iyle bulusamiyordu.
  // 42/48/60/76/89/114 steelOdToDn ±0,5 toleransiyla ZATEN tutuyordu — yalniz
  // kucuk uc eksikti). normalizer.MM_TO_DN bu tablonun IKIZIDIR.
  15: 'dn15', 20: 'dn20', 21: 'dn15', 22: 'dn15', 25: 'dn25', 27: 'dn20', 28: 'dn20', 32: 'dn32', 34: 'dn25', 35: 'dn25',
  40: 'dn40', 42: 'dn32', 48: 'dn40', 50: 'dn50', 60: 'dn50', 65: 'dn65', 76: 'dn65',
  80: 'dn80', 89: 'dn80', 100: 'dn100', 110: 'dn100', 114: 'dn100',
  125: 'dn125', 140: 'dn125', 150: 'dn150', 160: 'dn150', 168: 'dn150',
  200: 'dn200', 219: 'dn200', 250: 'dn250', 273: 'dn250', 300: 'dn300', 323: 'dn300',
};

/** Celik DIS CAP mm → DN (SORUN 15, LİNTU dogalgaz vakasi 27.07).
 *  Standart (EN 10220) + bilinen ALTERNATIF OD'ler (PE kapli/DIN 30670
 *  listeleri 26,7 · 33,4 · 42,2 · 73,0 · 141,3 · 168,3 · 273,1 yazar).
 *  Arama ±0,5 mm TOLERANSLIDIR (steelOdToDn). */
const STEEL_OD_SERIES: Array<{ od: number; dn: number }> = [
  { od: 21.3, dn: 15 },
  { od: 26.9, dn: 20 }, { od: 26.7, dn: 20 },
  { od: 33.7, dn: 25 }, { od: 33.4, dn: 25 },
  { od: 42.4, dn: 32 }, { od: 42.2, dn: 32 },
  { od: 48.3, dn: 40 },
  { od: 60.3, dn: 50 },
  { od: 76.1, dn: 65 }, { od: 73.0, dn: 65 },
  { od: 88.9, dn: 80 },
  { od: 114.3, dn: 100 },
  { od: 139.7, dn: 125 }, { od: 141.3, dn: 125 },
  { od: 168.3, dn: 150 }, { od: 165.1, dn: 150 },
  { od: 219.1, dn: 200 },
  { od: 273.0, dn: 250 }, { od: 273.1, dn: 250 },
  { od: 323.9, dn: 300 },
];

/** Celik dis-cap mm → DN; ±0,5 mm tolerans (26,7≈26,9 vb.). Bulunamazsa null. */
export function steelOdToDn(mm: number): number | null {
  let best: { dn: number; fark: number } | null = null;
  for (const r of STEEL_OD_SERIES) {
    const fark = Math.abs(r.od - mm);
    if (fark <= 0.5 && (!best || fark < best.fark)) best = { dn: r.dn, fark };
  }
  return best?.dn ?? null;
}

// ────────────────────────────────────────────
// KAYNAK-FARKINDA OLCU AYRISTIRMA (D3/D4/P3)
// ────────────────────────────────────────────

/** Kesir metnini ondaliga cevir: "2 1/2" → 2.5, "3/4" → 0.75 */
function fractionToDecimal(whole: string | null, num: string, den: string): number {
  const w = whole ? parseInt(whole, 10) : 0;
  return w + parseInt(num, 10) / parseInt(den, 10);
}

/**
 * Metinden EN SONDAKI olcu ifadesini kaynak turuyle birlikte cikarir.
 * Taninanlar (PRD D3/D4/P3):
 *   DN:  "DN25", "DN 25", "dn-25"
 *   inc: 1", 1'', 1 inc/inch/inç, 1¼", 1 1/4", 1.25", 2 ½", ciplak kesir (1/2)
 *   mm:  "32 mm", "Ø32", "d32", "32x5.4" (cap x et — ilk sayi dis cap),
 *        "21.3mm" (celik dis capi)
 * Oncelik: DN > inc > mm (mevcut extractDiameter davranisiyla uyumlu).
 */
export function extractSizeInfo(text: string): SizeInfo | null {
  // Iki apostrof = inc isareti (kesif Excel'leri) — normalizer ile ayni kural
  const normalized = normalizeText(text).replace(/'{2}/g, '"');

  // 1) DN — tum eslesmelerden EN SONDAKI (gercek malzeme capi sonda olur)
  const dnMatches = Array.from(normalized.matchAll(/\bdn[\s-]*(\d{2,3})\b/g));
  if (dnMatches.length > 0) {
    const last = dnMatches[dnMatches.length - 1];
    const v = parseInt(last[1], 10);
    return { source: 'dn', value: v, display: `DN ${v}` };
  }

  // 2) INC — bilesik kesir / kesir / ondalik / tam sayi (isaret veya inc/inch)
  const inchHits: { dec: number; index: number; display: string }[] = [];
  let m: RegExpExecArray | null;

  // Bilesik kesir: 2 1/2 (isaret opsiyonel — kesir zaten inc demektir).
  // \b: tam-sayi parcasi HARF'e YAPISIK OLMAMALI — "P235TR1 3/4" grade son
  // rakami "1" bilesige kacip "1 3/4" (1.75") uretiyordu (denetim D3a bulgu).
  const compoundRe = /\b(\d+)\s+(\d+)\/(\d+)\s*(?:"|inch|inc\b)?/g;
  while ((m = compoundRe.exec(normalized)) !== null) {
    inchHits.push({ dec: fractionToDecimal(m[1], m[2], m[3]), index: m.index, display: `${m[1]} ${m[2]}/${m[3]}"` });
  }
  // PK7a — TIRELI bilesik kesir: "1-1/4" = 1 1/4" = 1,25". Yazim yaygin
  // (SAHINKUL listesi) ve eskiden bilesigi HIC tanimiyordu → fracRe devraliyor
  // ve 1-1/4" 0,25 cikiyordu (kullanicinin gordugu SD4 kusuru).
  //
  // KORUMA (kullanici karari "korumali duzelt"): tire ayraci YALNIZ tire
  // oncesi 1-3 basamakli KUCUK tam sayi icin gecerlidir. Iki kalip boyle
  // ayrilir:
  //     olcu      → "1-1/4"   · "2-1/2"      (tire oncesi kisa)
  //     urun kodu → "10217-1/2"              (tire oncesi uzun rakam dizisi)
  // `\b` zaten uzun dizinin ORTASINDAN yakalamayi engeller: "10217-" icinde
  // "17-" oncesinde kelime siniri yoktur. {1,3} ise bastan uzun diziyi eler.
  const compoundTireRe = /\b(\d{1,3})-(\d+)\/(\d+)\s*(?:"|inch|inc\b)?/g;
  while ((m = compoundTireRe.exec(normalized)) !== null) {
    const cakisma = inchHits.some((x) => Math.abs(x.index - m!.index) <= 5);
    if (cakisma) continue;
    inchHits.push({ dec: fractionToDecimal(m[1], m[2], m[3]), index: m.index, display: `${m[1]} ${m[2]}/${m[3]}"` });
  }
  // Tek kesir: 1/2, 3/4. Bilesigin parcasi olmadigi OVERLAP kontroluyle
  // saglanir (asagida ≤5 char) — eski (?<!\d\s) lookbehind'i grade rakami
  // bulasan "3/4"u da yanlislikla eliyordu; kaldirildi (overlap yeterli).
  const fracRe = /(\d+)\/(\d+)\s*(?:"|inch|inc\b)?/g;
  while ((m = fracRe.exec(normalized)) !== null) {
    const overlap = inchHits.some((x) => Math.abs(x.index - m!.index) <= 5);
    if (overlap) continue;
    // PK7b — URUN KODU KUYRUGU: "10217-1/2"deki "1/2" olcu DEGILDIR.
    // Kalip: kesirden hemen once tire ve tireden once 4+ basamakli rakam
    // dizisi. (3 basamaga kadar olani compoundTireRe zaten OLCU sayar; ikisi
    // ayni esikte bulusur, arada bosluk kalmaz.)
    if (/\d{4,}-$/.test(normalized.slice(0, m.index))) continue;
    inchHits.push({ dec: fractionToDecimal(null, m[1], m[2]), index: m.index, display: `${m[1]}/${m[2]}"` });
  }
  // Ondalik inc: 1.25" veya 1,25 inc — ISARET SART (yoksa 5.4 gibi et kalinligi karisir)
  const decRe = /(\d+)[.,](\d+)\s*(?:"|inch|inc\b)/g;
  while ((m = decRe.exec(normalized)) !== null) {
    inchHits.push({ dec: parseFloat(`${m[1]}.${m[2]}`), index: m.index, display: `${m[1]}.${m[2]}"` });
  }
  // Tam sayi inc: 2", 2 inc, 2 inch — ISARET/KELIME SART
  const intRe = /(\d+)\s*(?:"|inch\b|inc\b)/g;
  while ((m = intRe.exec(normalized)) !== null) {
    const overlap = inchHits.some((x) => x.index <= m!.index && m!.index <= x.index + 6);
    if (overlap) continue;
    inchHits.push({ dec: parseInt(m[1], 10), index: m.index, display: `${m[1]}"` });
  }
  if (inchHits.length > 0) {
    inchHits.sort((a, b) => b.index - a.index);
    const top = inchHits[0];
    return { source: 'inch', value: top.dec, display: top.display };
  }

  // 3) MM — ondalik celik dis capi, tam sayi mm, Ø, d-prefix, NNxN.N bileşik
  // Ondalik: "21.3mm" → celik dis capi (DN'e cevrilir — value DN degil mm'dir,
  // kaynagi 'mm' olarak isaretleriz; cevirici tabloda arar)
  const decMm = Array.from(normalized.matchAll(/(\d+[.,]\d+)\s*mm\b/g));
  if (decMm.length > 0) {
    // "Et" onekli mm = CIDAR KALINLIGI, cap DEGILDIR (denetim bulgu — yol-3
    // manuel/indekssiz satir: "Dış Cap 114.3mm Et 6.0mm"). Eskiden SON ondalik
    // mm alindigi icin ET secilir, yanlis cap uretilirdi. "et" onekli olanlari
    // eleyip dis capi tercih et; hicbiri kalmazsa (yalniz et yazan patolojik
    // metin) geri dusup son mm'yi al — kirilma yok.
    const disCap = decMm.filter((mm) => {
      const onek = normalized.slice(Math.max(0, (mm.index ?? 0) - 5), mm.index ?? 0);
      return !/\bet\b\s*$/.test(onek);
    });
    const secim = disCap.length > 0 ? disCap : decMm;
    const last = secim[secim.length - 1];
    const raw = last[1].replace(',', '.');
    return { source: 'mm', value: parseFloat(raw), display: `${raw} mm` };
  }
  const intMm = Array.from(normalized.matchAll(/(?<![\d.,])(\d{2,3})\s*mm\b/g));
  if (intMm.length > 0) {
    const v = parseInt(intMm[intMm.length - 1][1], 10);
    return { source: 'mm', value: v, display: `${v} mm` };
  }
  // Ø32 (mm'siz), d32 (P3) — toLowerCase 'Ø'yu 'ø'ye indirir
  const oMatch = normalized.match(/ø\s*(\d{2,3})\b/);
  if (oMatch) {
    const v = parseInt(oMatch[1], 10);
    return { source: 'mm', value: v, display: `Ø${v}` };
  }
  const dMatch = normalized.match(/\bd(\d{2,3})\b/);
  if (dMatch) {
    const v = parseInt(dMatch[1], 10);
    return { source: 'mm', value: v, display: `d${v}` };
  }
  // PANO 19: "Q" cap oneki (bazi kesifler Ø yerine Q yazar: "Q32 boru")
  const qMatch = normalized.match(/(?<![a-z0-9])q\s*(\d{2,3})\b/);
  if (qMatch) {
    const v = parseInt(qMatch[1], 10);
    return { source: 'mm', value: v, display: `Q${v}` };
  }
  // Bilesik: 32x5.4 (cap x et kalinligi) — ilk sayi dis cap (P3); et v1'de yok sayilir
  const compMatch = normalized.match(/(?<![\d.,])(\d{2,3})\s*x\s*\d+[.,]\d+\b/);
  if (compMatch) {
    const v = parseInt(compMatch[1], 10);
    return { source: 'mm', value: v, display: `${v} mm` };
  }

  // SON CARE — CIPLAK SAYI (SORUN 15): kutuphane CAP KOLONLARI birimsiz
  // yazar ("26,7" OD-mm · "1" inc). YALNIZ metnin TAMAMI tek sayiysa
  // (serbest metinde tetiklenmez): ≤16 → inc (cap kolonu inc geleneği,
  // DIAMETER_ORDER), >16 → mm (OD/nominal dis cap).
  const bare = normalized.trim().match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/);
  if (bare) {
    const v = parseFloat(`${bare[1]}.${bare[2] ?? '0'}`);
    if (v > 0 && v <= 16) return { source: 'inch', value: v, display: `${v}"` };
    if (v > 16) return { source: 'mm', value: v, display: `${String(v).replace('.', ',')} mm` };
  }

  return null;
}

/**
 * BILESIK / REDUKSIYON CAP IMZASI (18.07 canli — "3"x1" Dişli Mekanik Te").
 *
 * extractSizeInfo TEK olcu doner; reduksiyon fitting "3" x 1"" iki olcu tasir
 * ve line/urun HIZALANMIYORDU (line "3"x1"-DN80 x DN25" → DN25; urun "3" x 1""
 * → 3" → dn80). Bu fonksiyon capi REDUKSIYON AYIRICI ("x") uzerinden parcalar,
 * her parcanin kanonik DN etiketini toplar ve SIRALI KANONIK KUME (imza) uretir.
 * Iki notasyon ("3"" ve "DN80") ayni DN'e indirgenip DEDUP edilir.
 *
 * Eslesme: line VEYA urun bilesikse imzalar ESIT olmali (kume). Tekil caplarda
 * bilesik=false → cagiran mevcut capTags kesisimini kullanmaya devam eder.
 */
/**
 * REDUKSIYON AYIRICI — "x" VE olcu-sonrasi "-".
 *
 * ⚠ 14.08 canli olcumu (TRAKYA DOKUM "Inegal Te"): ayirici YALNIZ "x" idi.
 * Teklif "1 1/4\" x 1\" x 1 1/4\"" yazar (bilesik ✓) ama kutuphane ayni urunu
 * TIRE ile yazar: "1 1/4\"-1/2\"-1\"". Tire ayirici sayilmadigi icin urun
 * tarafi `bilesik: false` cikiyor ve TEK, ustelik YANLIS bir cap goruluyordu:
 *     "1 1/4\"-1/2\"-1\""  → ["dn15"]   (yalniz ortadaki)
 *     "1\"-1/2\"-1/2\""    → ["dn50"]   (2 inc — URUNDE HIC YOK)
 * Ikincisi sadece "bulunamadi" degil YANLIS BULMA riskiydi: 2" arayan bir
 * satir bu urunu aday gorebilirdi.
 *
 * ⚠ TIRE HER ZAMAN AYIRICI DEGILDIR: "1-1/4\"" = 1 1/4 inc (BILESIK KESIR,
 * PK7a). Ayrim olculebilir: ayirici tire olcunun ARDINDAN gelir, yani
 * kendinden once bir inc isareti (") vardir; bilesik kesirde tire'den once
 * RAKAM durur. Lookbehind bu ikisini kesin ayirir — "1-1/4\"" bolunmez.
 */
const REDUKSIYON_AYIRICI = /x|(?<=")\s*-/i;

export function capImzasi(text: string, cls: SizeClass): { imza: string[]; bilesik: boolean } {
  const norm = normalizeText(text).replace(/'{2}/g, '"');
  const dns = new Set<string>();
  for (const seg of norm.split(REDUKSIYON_AYIRICI)) {
    const info = extractSizeInfo(seg);
    if (!info) continue;
    const dn = sizeEquivalents(cls, info).tags.find((t) => /^dn\d+$/.test(t));
    dns.add(dn ?? `${info.source}:${Math.round(info.value * 100)}`);
  }
  return { imza: Array.from(dns).sort(), bilesik: dns.size >= 2 };
}

// ────────────────────────────────────────────
// SINIFA GORE ESDEGER TAG URETIMI
// ────────────────────────────────────────────

/** Plastik (PPR/HDPE/PE/PVC) icin mm degerinin kutuphanede gorulebilecek
 *  TUM tag bicimleri: od-32 (ciplak PE yolu), dn32 (MM_TO_DN kimligi),
 *  ve nominal celik-DN karsiligi (110mm → dn100 — kutuphane "110mm" boyle tag'lenir). */
function plasticTags(mm: number): string[] {
  const tags = new Set<string>([`od-${mm}`, `dn${mm}`]);
  const nominal = NOMINAL_MM_TO_DN[mm];
  if (nominal) tags.add(nominal);
  return Array.from(tags);
}

function steelEquivalents(info: SizeInfo): SizeEquivalents {
  if (info.source === 'dn') {
    const row = STEEL_BY_DN.get(info.value);
    if (!row) {
      // D5: tabloda yok (orn DN 90 celik) — cevrimsiz, dusuk guven
      return { tags: [`dn${info.value}`], rozet: null, noConversion: true, ambiguous: false };
    }
    return { tags: [`dn${info.value}`], rozet: `${info.display} → ${row.inchDisplay} (çelik)`, noConversion: false, ambiguous: false };
  }
  if (info.source === 'inch') {
    const row = STEEL_BY_INCH.get(info.value);
    if (!row) return { tags: [], rozet: null, noConversion: true, ambiguous: false };
    return { tags: [`dn${row.dn}`], rozet: `${info.display} → DN ${row.dn} (çelik)`, noConversion: false, ambiguous: false };
  }
  // mm: ONCE dis-cap serisi (±0,5 tolerans — 26,7/33,4 gibi alternatif
  // OD'ler dahil), sonra nominal tablo. (SORUN 15: PE kapli listelerin
  // OD-mm caplari inc/DN sorgularla ayni kanonik DN'de bulusur.)
  const viaOd = steelOdToDn(info.value);
  if (viaOd) {
    return { tags: [`dn${viaOd}`], rozet: `${info.display} → DN ${viaOd} (çelik)`, noConversion: false, ambiguous: false };
  }
  if (Number.isInteger(info.value)) {
    const nominal = NOMINAL_MM_TO_DN[info.value];
    if (nominal) return { tags: [nominal], rozet: `${info.display} → ${nominal.toUpperCase()} (çelik)`, noConversion: false, ambiguous: false };
  }
  return { tags: [`od-${Math.round(info.value)}`], rozet: null, noConversion: true, ambiguous: false };
}

/**
 * S7 — ROZET ETIKETI NOTRDUR.
 *
 * Bu tablo PPR icin yazildi ama `plastic` sinifinin TAMAMI (PVC, HDPE, PE,
 * PEX) ayni yoldan gecer: "DN 110 → 110 mm (PPR-mm)" bir PVC pis su borusunda
 * DUZ YANLIS bir etiketti. Cevrim motoru sinifi bilir, MALZEMEYI bilmez —
 * bilmedigi seyi soylemez. SAYILAR AYNEN KALIR (mm/inc karsiliklari dogruydu),
 * yalnizca isim notrlesir.
 */
const PLASTIK_ROZET = 'plastik-mm';

function plasticEquivalents(info: SizeInfo): SizeEquivalents {
  if (info.source === 'dn') {
    // PRD Temel kural: plastikte liste-DN = dis cap mm (DN 32 = 32 mm = 1")
    const mm = info.value;
    const row = PPR_BY_MM.get(mm);
    const rozet = row
      ? `${info.display} → ${mm} mm / ${row.inchDisplay} (${PLASTIK_ROZET})`
      : `${info.display} → ${mm} mm (${PLASTIK_ROZET})`;
    return { tags: plasticTags(mm), rozet, noConversion: false, ambiguous: false };
  }
  if (info.source === 'inch') {
    const row = PPR_BY_INCH.get(info.value);
    if (!row) return { tags: [], rozet: null, noConversion: true, ambiguous: false };
    return { tags: plasticTags(row.mm), rozet: `${info.display} → ${row.mm} mm (${PLASTIK_ROZET})`, noConversion: false, ambiguous: false };
  }
  // mm: dogrudan
  const mm = Math.round(info.value);
  return { tags: plasticTags(mm), rozet: null, noConversion: false, ambiguous: false };
}

/**
 * Sinifa gore esdeger cap tag kumesi.
 * unknown → iki yorumun BIRLESIMI + ambiguous isareti (yorumlar farkli urune
 * gidiyorsa). Cagiran taraf ambiguous=true iken asla 'high' vermez (P4).
 */
export function sizeEquivalents(cls: SizeClass, info: SizeInfo): SizeEquivalents {
  if (cls === 'steel') return steelEquivalents(info);
  if (cls === 'plastic') return plasticEquivalents(info);

  // unknown: union
  const steel = steelEquivalents(info);
  const plastic = plasticEquivalents(info);
  const tags = Array.from(new Set([...steel.tags, ...plastic.tags]));
  // DN ve inc kaynaklarinda iki yorum FARKLI fiziksel urune gider (DN 32:
  // celik 1 1/4" vs PPR 32mm=1"). Tag kumeleri ortusebilir (dn32 tag'i iki
  // anlamda da uretilir) — belirsizlik tag'e degil KAYNAGA baglidir.
  // mm kaynagi tek anlamli: mm = mm.
  const differs =
    info.source !== 'mm' && steel.tags.length > 0 && plastic.tags.length > 0;
  return {
    tags,
    rozet: null,
    noConversion: steel.noConversion && plastic.noConversion,
    ambiguous: differs,
  };
}

/** Tag listesindeki cap tag'lerini (dnNN / od-NN) ayiklar. */
export function isSizeTag(t: string): boolean {
  return /^dn\d+$/.test(t) || /^od-\d+$/.test(t);
}
