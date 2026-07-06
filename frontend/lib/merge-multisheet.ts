/**
 * merge-multisheet — Excel yeniden yuklemede VERI KORUMA (PRD).
 *
 * Sorun: yeni Excel yuklenince setMultiSheet(incoming) mevcut grid state'ini
 * TAMAMEN eziyordu — kullanicinin girdigi kar marjlari, marka secimleri ve
 * fiyatlar kayboluyordu.
 *
 * Cozum: sheet'ler ada gore, satirlar "poz no + is tanimi" anahtarina gore
 * eslestirilir:
 *   - ESLESEN satir: dosyadan gelen kaynak hucreler guncellenir; kullanicinin
 *     sistem alanlari (_malzKar, _marka, _firma, kar'li fiyatlar...) ve dolu
 *     fiyat hucreleri AYNEN KORUNUR.
 *   - YENI satir: tabloya eklenir.
 *   - SADECE ESKIDE olan satir (kullanici manuel eklemis / eski dosyada var):
 *     SILINMEZ, sheet sonuna korunarak tasinir.
 *   - Kullanicinin context-menu ile ekledigi OZEL SUTUNLAR columnDefs'te korunur.
 * Tum sheet'ler islenir (multi-sheet) — yeni sheet eklenir, eski sheet durur.
 */

import type {
  MultiSheetData, SheetData, ExcelRowData, ColumnRoles, ExcelColumnDef,
} from '@/components/excel-grid/types';

/** Kullanici emegi tasiyan alanlar — merge'de HER ZAMAN eski satirdan korunur. */
const SYSTEM_FIELDS = [
  '_malzKar', '_iscKar', '_marka', '_firma',
  '_matNetPrice', '_labNetPrice', '_candidates', '_draftDiscount',
] as const;

export interface MergeStats {
  matchedRows: number;
  newRows: number;
  preservedRows: number; // yalniz eski dosyada olan, sona tasinan
  newSheets: number;
}

function rowKey(row: ExcelRowData, roles: ColumnRoles): string {
  const no = roles.noField ? String(row[roles.noField] ?? '').trim().toLowerCase() : '';
  const name = roles.nameField ? String(row[roles.nameField] ?? '').trim().toLowerCase() : '';
  if (!no && !name) return '';
  return `${no}|${name}`;
}

/** Fiyat rol alanlari — eski satirda DOLU ise korunur (kullanici/eslestirme emegi). */
function priceFields(roles: ColumnRoles): string[] {
  return [
    roles.materialUnitPriceField, roles.materialTotalField,
    roles.laborUnitPriceField, roles.laborTotalField,
    roles.grandUnitPriceField, roles.grandTotalField,
  ].filter(Boolean) as string[];
}

function mergeSheetRows(
  prevRows: ExcelRowData[],
  incoming: SheetData,
  prevDefs: ExcelColumnDef[],
  stats: MergeStats,
): { rows: ExcelRowData[]; columnDefs: ExcelColumnDef[] } {
  const roles = incoming.columnRoles ?? {};
  const pFields = priceFields(roles);

  // Eski data satirlarini anahtarla
  const prevByKey = new Map<string, ExcelRowData>();
  for (const r of prevRows) {
    if (!r._isDataRow || r._isSpareRow || r._isGroupRow) continue;
    const k = rowKey(r, roles);
    if (k && !prevByKey.has(k)) prevByKey.set(k, r);
  }

  const consumed = new Set<ExcelRowData>();
  const merged: ExcelRowData[] = [];
  let idx = 0;

  for (const inc of incoming.rowData ?? []) {
    if (!inc._isDataRow) {
      // Baslik/grup satirlari dosyadan aynen gelir
      merged.push({ ...inc, _rowIdx: idx++ });
      continue;
    }
    const k = rowKey(inc, roles);
    const prev = k ? prevByKey.get(k) : undefined;
    if (prev && !consumed.has(prev)) {
      consumed.add(prev);
      stats.matchedRows++;
      // Taban: yeni dosya satiri (kaynak hucreler guncel — miktar/birim/ad)
      const out: ExcelRowData = { ...prev, ...inc, _rowIdx: idx++ };
      // Sistem alanlari eski satirdan geri yaz (kullanici emegi)
      for (const f of SYSTEM_FIELDS) {
        if (prev[f] !== undefined) (out as any)[f] = prev[f];
      }
      // Dolu fiyat hucreleri eski satirdan korunur (dosya fiyat tasimiyor;
      // stripPrices'li prepare bos gonderir — bosla ezme!)
      for (const f of pFields) {
        const prevVal = String(prev[f] ?? '').trim();
        if (prevVal !== '' && parseFloat(prevVal.replace(',', '.')) !== 0) {
          out[f] = prev[f];
        }
      }
      // Kullanicinin ozel sutunlarindaki degerler (incoming'de alan yok) —
      // spread sirasi geregi zaten prev'den geliyor ✓
      merged.push(out);
    } else {
      stats.newRows++;
      merged.push({ ...inc, _rowIdx: idx++ });
    }
  }

  // Yalniz eskide kalan satirlar — KAYBETME, sona tasi
  for (const r of prevRows) {
    if (!r._isDataRow || r._isSpareRow || r._isGroupRow) continue;
    if (consumed.has(r)) continue;
    const k = rowKey(r, roles);
    if (k && prevByKey.get(k) === r && !consumed.has(r)) {
      stats.preservedRows++;
      merged.push({ ...r, _rowIdx: idx++ });
    }
  }

  // Sutunlar: dosyanin yapisi taban + kullanicinin ekledigi ozel sutunlar
  const incFields = new Set((incoming.columnDefs ?? []).map((c) => c.field));
  const extraDefs = prevDefs.filter((c) => !incFields.has(c.field));
  const columnDefs = [...(incoming.columnDefs ?? []), ...extraDefs];

  return { rows: merged, columnDefs };
}

export function mergeMultiSheet(
  prev: MultiSheetData | null,
  prevLive: Record<number, ExcelRowData[]>,
  incoming: MultiSheetData,
): { merged: MultiSheetData; live: Record<number, ExcelRowData[]>; stats: MergeStats } {
  const stats: MergeStats = { matchedRows: 0, newRows: 0, preservedRows: 0, newSheets: 0 };

  if (!prev || !prev.sheets?.length) {
    const live: Record<number, ExcelRowData[]> = {};
    incoming.sheets.forEach((s) => { live[s.index] = s.rowData; });
    stats.newSheets = incoming.sheets.length;
    stats.newRows = incoming.sheets.reduce(
      (n, s) => n + (s.rowData?.filter((r) => r._isDataRow).length ?? 0), 0,
    );
    return { merged: incoming, live, stats };
  }

  const prevByName = new Map<string, SheetData>();
  for (const s of prev.sheets) prevByName.set(s.name, s);

  const outSheets: SheetData[] = [];
  const live: Record<number, ExcelRowData[]> = {};
  const usedPrev = new Set<string>();
  let nextIndex = 0;

  for (const incSheet of incoming.sheets) {
    const prevSheet = prevByName.get(incSheet.name);
    const index = nextIndex++;
    if (!prevSheet) {
      stats.newSheets++;
      const s = { ...incSheet, index };
      outSheets.push(s);
      live[index] = s.rowData;
      continue;
    }
    usedPrev.add(prevSheet.name);
    const prevRows = prevLive[prevSheet.index] ?? prevSheet.rowData ?? [];
    const { rows, columnDefs } = mergeSheetRows(prevRows, incSheet, prevSheet.columnDefs ?? [], stats);
    const s: SheetData = { ...incSheet, index, columnDefs, rowData: rows };
    outSheets.push(s);
    live[index] = rows;
  }

  // Yalniz eski dosyada olan sheet'ler — aynen korunur
  for (const s of prev.sheets) {
    if (usedPrev.has(s.name)) continue;
    const index = nextIndex++;
    const rows = prevLive[s.index] ?? s.rowData ?? [];
    outSheets.push({ ...s, index, rowData: rows });
    live[index] = rows;
  }

  return {
    merged: { sheets: outSheets, brands: incoming.brands ?? prev.brands },
    live,
    stats,
  };
}
