// Plain-array reimplementation of ExcelGrid.tsx buildMaterialContext.
// Kept in sync with ExcelGrid.tsx — used by cross-sheet bulk match where
// AG-Grid api is not available (multi-sheet bulk fiyatlandirma).

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

export function buildMaterialContextFromArray(
  rows: ExcelRowData[],
  rowIdx: number,
  roles: ColumnRoles,
): string {
  const nameField = roles.nameField;
  const noField = roles.noField;
  const brandField = roles.brandField;
  if (!nameField) return '';

  const current = rows[rowIdx];
  if (!current) return '';
  const currentName = String(current[nameField] ?? '').trim();
  if (!currentName) return '';
  if (!noField) return currentName;

  let foundParent: string | null = null;
  for (let i = rowIdx - 1; i >= 0; i--) {
    const prev = rows[i];
    if (!prev) continue;
    if (prev._isDataRow) continue;

    const prevNo = String(prev[noField] ?? '').trim();
    const prevName = String(prev[nameField] ?? '').trim();
    const prevBrand = brandField ? String(prev[brandField] ?? '').trim() : '';
    if (prevBrand.length > 0) continue;
    if (prevNo.length > 0 && prevName.length > 2) {
      foundParent = prevName;
      break;
    }
  }

  if (!foundParent) return currentName;

  const fullName = `${foundParent} ${currentName}`;
  const currentCap = extractCapFromText(currentName);
  const fullCap = extractCapFromText(fullName);
  const parentCap = extractCapFromText(foundParent);

  if (parentCap && currentCap && parentCap !== currentCap) {
    console.warn(`[buildMaterialContextFromArray] Cap mismatch, using currentName only`);
    return currentName;
  }
  if (currentCap && fullCap && currentCap !== fullCap) {
    console.warn(`[buildMaterialContextFromArray] Full cap mismatch, using currentName only`);
    return currentName;
  }
  return fullName;
}
