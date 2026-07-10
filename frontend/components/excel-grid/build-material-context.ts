// Plain-array reimplementation of ExcelGrid.tsx buildMaterialContext.
// Kept in sync with ExcelGrid.tsx — used by cross-sheet bulk match where
// AG-Grid api is not available (multi-sheet bulk fiyatlandirma).
//
// PRD v1.1 §4 (Baslik Tabanli Baglam Mirasi):
//   H1/H2: baslik adayinda miktar bos (birim/miktar sinyali)
//   H4: olcu iceren satir (DN/inc/mm) baslik OLAMAZ — atlanir, yukari devam
//   C1: satir yetimse (yalniz cap/sinif/kod) aktif baslik one eklenir
//   C2: en yakin baslik kazanir (yukari yuruyus ilk bulusta durur)
//   C3: satir kendi kendine yeterliyse baslik EKLENMEZ
//   C6 (ust baslik ikincil sinyali) v1'de bilerek yok — en yakin baslik esas.

import type { ExcelRowData, ColumnRoles } from './types';

const INCH_TO_DN: Record<string, string> = {
  '1/2': 'dn15', '3/4': 'dn20', '1': 'dn25', '1 1/4': 'dn32',
  '1 1/2': 'dn40', '2': 'dn50', '2 1/2': 'dn65', '3': 'dn80',
  '4': 'dn100', '5': 'dn125', '6': 'dn150', '8': 'dn200',
};

function extractCapFromText(text: string): string | null {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/[""]/g, '"').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/¼/g, '1/4');
  const dnMatches = Array.from(normalized.matchAll(/dn\s*(\d+)/gi));
  if (dnMatches.length > 0) {
    const last = dnMatches[dnMatches.length - 1];
    return `dn${last[1]}`;
  }
  const matches: { value: string; index: number }[] = [];
  const compound = /(\d+\s+\d+\/\d+)["'`]?/g;
  let m: RegExpExecArray | null;
  while ((m = compound.exec(normalized)) !== null) matches.push({ value: m[1].replace(/\s+/g, ' '), index: m.index });
  const fraction = /(?<!\d\s)(\d+\/\d+)["'`]?/g;
  while ((m = fraction.exec(normalized)) !== null) matches.push({ value: m[1], index: m.index });
  const integer = /(\d+)["'`]/g;
  while ((m = integer.exec(normalized)) !== null) matches.push({ value: m[1], index: m.index });
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.index - a.index);
  return INCH_TO_DN[matches[0].value] ?? null;
}

/** H4: metin HERHANGI bir olcu ifadesi iceriyor mu? (DN, Ø, inc, mm, kesir, NNxN) */
export function hasSizeExpression(text: string): boolean {
  const t = text.toLowerCase().replace(/'{2}/g, '"').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/¼/g, '1/4');
  return /dn[\s-]*\d|[øØ]\s*\d|\d\s*(mm|inch|inc|inç)\b|\d\s*["']|\d+\/\d+|\bd\d{2,3}\b|\d{2,3}\s*x\s*\d/.test(t);
}

/** Malzeme TIPI kelimesi (boru/vana/dolap...) — C3 kendi-kendine-yeterlilik sinyali */
const TYPE_WORD_RE = /boru|pipe|vana|valve|valf|dirsek|elbow|reduksiyon|redüksiyon|tee|\bte\b|manşon|manson|coupling|flanş|flans|flange|izolasyon|insulation|pompa|pump|radyat|kombi|klozet|lavabo|batarya|musluk|kablo|pano|sigorta|kazan|dolap|dolab|sayaç|sayac|kolektör|kolektor|hidrofor|eşanjör|esanjor|vantilatör|klima|fan\b|anahtar|priz|sprinkler\b|sprink\b/i;

/**
 * C1/C3: satir yetim mi? Yetim = yalniz cap/sinif/kod tasiyor ("DN 25", "Ø32",
 * "1 1/4\"", "PN25"). Tip kelimesi iceren veya olcu disinda anlamli uzunlukta
 * metni olan satir KENDI KENDINE YETERLIDIR — baslik eklenmez.
 */
export function isSelfSufficientRow(text: string): boolean {
  if (TYPE_WORD_RE.test(text)) return true;
  // Olcu/PN ifadelerini soy, kalan harf sayisina bak
  const stripped = text
    .toLowerCase()
    .replace(/'{2}/g, '"')
    .replace(/dn[\s-]*\d+/g, ' ')
    .replace(/pn\s*\d+/g, ' ')
    .replace(/[øØ]\s*\d+/g, ' ')
    .replace(/\d+\s*(mm|inch|inc|inç)\b/g, ' ')
    .replace(/\d+\s+\d+\/\d+/g, ' ')
    .replace(/\d+\/\d+/g, ' ')
    .replace(/\d+\s*["']*/g, ' ')
    .replace(/[^a-zçğıöşü]/gi, '');
  return stripped.length >= 12;
}

/**
 * Yukari yuruyerek EN YAKIN baslik satirini bulur (C2).
 * Baslik adayi: _isDataRow=false + isim dolu + marka BOS + olcu ICERMIYOR (H4)
 * + (noField dolu VEYA miktar bos — H1/H2 sinyali).
 */
export function findHeaderAbove(
  rows: ExcelRowData[],
  rowIdx: number,
  roles: ColumnRoles,
): string | null {
  const { nameField, noField, brandField, quantityField } = roles;
  if (!nameField) return null;
  for (let i = rowIdx - 1; i >= 0; i--) {
    const prev = rows[i];
    if (!prev) continue;
    if (prev._isDataRow) continue; // data satirlari baslik olamaz, yukari devam

    const prevName = String(prev[nameField] ?? '').trim();
    if (prevName.length <= 2) continue;
    const prevBrand = brandField ? String(prev[brandField] ?? '').trim() : '';
    if (prevBrand.length > 0) continue; // marka dolu = malzeme satiri, atla
    if (hasSizeExpression(prevName)) continue; // H4: olculu satir baslik degil

    const prevNo = noField ? String(prev[noField] ?? '').trim() : '';
    const prevQty = quantityField ? String(prev[quantityField] ?? '').trim() : '';
    const headerish = prevNo.length > 0 || prevQty === '' || prevQty === '0';
    if (headerish) return prevName;
  }
  return null;
}

export interface MaterialContextResult {
  /** Eslestirmeye gidecek metin (baslik + satir veya yalniz satir) */
  name: string;
  /** One eklenen baslik (S4 sozluk ogrenme onerisi icin) — eklenmediyse null */
  header: string | null;
}

export function buildMaterialContextDetailedFromArray(
  rows: ExcelRowData[],
  rowIdx: number,
  roles: ColumnRoles,
): MaterialContextResult {
  const nameField = roles.nameField;
  if (!nameField) return { name: '', header: null };

  const current = rows[rowIdx];
  if (!current) return { name: '', header: null };
  const currentName = String(current[nameField] ?? '').trim();
  if (!currentName) return { name: '', header: null };

  // C3: satir kendi kendine yeterliyse baslik EKLEME
  if (isSelfSufficientRow(currentName)) return { name: currentName, header: null };

  const foundParent = findHeaderAbove(rows, rowIdx, roles);
  if (!foundParent) return { name: currentName, header: null };

  const fullName = `${foundParent} ${currentName}`;
  const currentCap = extractCapFromText(currentName);
  const fullCap = extractCapFromText(fullName);
  const parentCap = extractCapFromText(foundParent);

  // KATMAN 1 SAVUNMA: cap sanity — baslik farkli cap iceriyorsa ekleme
  if (parentCap && currentCap && parentCap !== currentCap) {
    console.warn(`[buildMaterialContextFromArray] Cap mismatch, using currentName only`);
    return { name: currentName, header: null };
  }
  if (currentCap && fullCap && currentCap !== fullCap) {
    console.warn(`[buildMaterialContextFromArray] Full cap mismatch, using currentName only`);
    return { name: currentName, header: null };
  }
  return { name: fullName, header: foundParent };
}

/** Eski imza — mevcut cagiranlar icin (string doner). */
export function buildMaterialContextFromArray(
  rows: ExcelRowData[],
  rowIdx: number,
  roles: ColumnRoles,
): string {
  return buildMaterialContextDetailedFromArray(rows, rowIdx, roles).name;
}
