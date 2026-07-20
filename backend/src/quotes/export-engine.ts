// ════════════════════════════════════════════════════════════════════
// PROFESYONEL TEKLIF CIKTISI MOTORU (PRD Teklif Formatim v2.1) — SAF, DB YOK
//
// T1: cikti TABANI musteri workbook'unun KENDISIDIR (ExcelJS load — stil/
//     merge/satir NATIF korunur); yalniz fiyat/tutar hucreleri yazilir.
// T6: fiyatsiz hucre HIC yazilmaz (0 asla).
// T7: tutar hucreleri CANLI FORMUL (=miktar*birim); icmal/genel toplam
//     formullu (format-engine SUM parcalarini buradan alir).
// Kapak/icmal format workbook'undan hucre-hucre kopyalanir ve BASA alinir.
// Test: test/export-format-test.ts
// ════════════════════════════════════════════════════════════════════
import * as ExcelJS from 'exceljs';
import {
  fillPlaceholders, applyOverrides, KOLON_HARF,
  FillContext, SekmeOzet, YerTutucu, ExportOverrides,
} from '../quote-formats/format-engine';

const sayi = (v: any): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

/** Formul icindeki sayfa adi: tek tirnak kacisli */
const sayfaRef = (name: string) => `'${name.replace(/'/g, "''")}'`;

interface SheetJson {
  name?: string;
  index?: number;
  isEmpty?: boolean;
  headerEndRow?: number;
  columnDefs?: Array<{ field: string; headerName?: string }>;
  columnRoles?: Record<string, string | undefined>;
  rowData?: Array<Record<string, any>>;
}

/**
 * Musteri workbook'una fiyatlari yazar (IN-PLACE) ve sekme ozetlerini doner.
 *
 * BULGU FIX (20.07): eski generateExcel yalniz colN rollerini yaziyordu —
 * fixedSchema sayfalarin sistem alanlari (_matBirim vb.) SESSIZCE dusuyordu.
 * Artik colN olmayan fiyat rolleri sayfanin SAGINA yeni kolon olarak eklenir
 * (baslik + degerler); orijinal hucrelere DOKUNULMAZ → T1 diff yine gecer.
 */
export function writePricesToWorkbook(
  wb: ExcelJS.Workbook,
  sheetsArr: SheetJson[],
): SekmeOzet[] {
  const ozetler: SekmeOzet[] = [];

  for (let si = 0; si < sheetsArr.length; si++) {
    const sheetData = sheetsArr[si];
    if (!sheetData || sheetData.isEmpty) continue;
    const ws = wb.worksheets[si];
    if (!ws) continue;

    const roles = sheetData.columnRoles ?? {};
    const rowData = sheetData.rowData ?? [];
    const defs = sheetData.columnDefs ?? [];
    const headerText = (field: string, fallback: string) =>
      defs.find((d) => d.field === field)?.headerName?.trim() || fallback;

    // Baslik satiri: rowData'daki SON _isHeaderRow (excel 1-based = ri+1); yoksa 1
    let headerRow = 1;
    for (let ri = 0; ri < rowData.length; ri++) {
      if (rowData[ri]?._isHeaderRow) headerRow = ri + 1;
      if (rowData[ri]?._isDataRow) break;
    }

    // ── field → 1-based kolon; colN degilse SAGA yeni kolon ekle ──
    let nextCol = Math.max(ws.columnCount || 0, ws.actualColumnCount || 0) + 1;
    const fieldToCol: Record<string, number> = {};
    const kolonAta = (field: string | undefined, fallbackBaslik: string): number | null => {
      if (!field) return null;
      if (fieldToCol[field]) return fieldToCol[field];
      if (field.startsWith('col')) {
        const idx = parseInt(field.replace('col', ''), 10);
        if (!isNaN(idx)) { fieldToCol[field] = idx + 1; return idx + 1; }
      }
      // Sistem alani (fixedSchema) → yeni kolon (bulgu fix'i)
      const col = nextCol++;
      fieldToCol[field] = col;
      const hCell = ws.getCell(headerRow, col);
      hCell.value = headerText(field, fallbackBaslik);
      hCell.font = { bold: true };
      return col;
    };

    const qtyCol = roles.quantityField && roles.quantityField.startsWith('col')
      ? kolonAta(roles.quantityField, 'Miktar')
      : null; // miktar SISTEM alaniysa orijinalde yok → formul kurulamaz
    const matUnitCol = kolonAta(roles.materialUnitPriceField, 'Malz. Birim Fiyat');
    const matTotCol = kolonAta(roles.materialTotalField, 'Malz. Toplam');
    const labUnitCol = kolonAta(roles.laborUnitPriceField, 'İşç. Birim Fiyat');
    const labTotCol = kolonAta(roles.laborTotalField, 'İşç. Toplam');
    const grandUnitCol = kolonAta(roles.grandUnitPriceField, 'Toplam Birim');
    const grandTotCol = kolonAta(roles.grandTotalField, 'Toplam Tutar');

    let ilkVeri = 0; let sonVeri = 0;
    let matToplam = 0; let labToplam = 0;

    for (let ri = 0; ri < rowData.length; ri++) {
      const row = rowData[ri];
      if (!row || !row._isDataRow) continue;
      const excelRow = ri + 1;
      if (!ilkVeri) ilkVeri = excelRow;
      sonVeri = excelRow;

      const qty = roles.quantityField ? sayi(row[roles.quantityField]) : 0;
      const matUnit = roles.materialUnitPriceField ? sayi(row[roles.materialUnitPriceField]) : 0;
      const matTot = roles.materialTotalField ? sayi(row[roles.materialTotalField]) : 0;
      const labUnit = roles.laborUnitPriceField ? sayi(row[roles.laborUnitPriceField]) : 0;
      const labTot = roles.laborTotalField ? sayi(row[roles.laborTotalField]) : 0;
      const grandUnit = roles.grandUnitPriceField ? sayi(row[roles.grandUnitPriceField]) : 0;
      const grandTot = roles.grandTotalField ? sayi(row[roles.grandTotalField]) : 0;

      matToplam += matTot;
      labToplam += labTot;

      // T6: yalniz >0 degerler yazilir — fiyatsiz satir BOS kalir, 0 ASLA.
      if (matUnitCol && matUnit > 0) ws.getCell(excelRow, matUnitCol).value = matUnit;
      if (labUnitCol && labUnit > 0) ws.getCell(excelRow, labUnitCol).value = labUnit;
      if (grandUnitCol && grandUnit > 0) ws.getCell(excelRow, grandUnitCol).value = grandUnit;

      // T7: tutar = miktar × birim CANLI FORMUL (miktar kolonu biliniyorsa)
      if (matTotCol && matTot > 0) {
        ws.getCell(excelRow, matTotCol).value =
          qtyCol && matUnitCol && qty > 0 && matUnit > 0
            ? ({ formula: `${KOLON_HARF(qtyCol)}${excelRow}*${KOLON_HARF(matUnitCol)}${excelRow}`, result: matTot } as any)
            : matTot;
      }
      if (labTotCol && labTot > 0) {
        ws.getCell(excelRow, labTotCol).value =
          qtyCol && labUnitCol && qty > 0 && labUnit > 0
            ? ({ formula: `${KOLON_HARF(qtyCol)}${excelRow}*${KOLON_HARF(labUnitCol)}${excelRow}`, result: labTot } as any)
            : labTot;
      }
      if (grandTotCol && grandTot > 0) {
        ws.getCell(excelRow, grandTotCol).value =
          matTotCol && labTotCol && (matTot > 0 || labTot > 0)
            ? ({ formula: `${KOLON_HARF(matTotCol)}${excelRow}+${KOLON_HARF(labTotCol)}${excelRow}`, result: grandTot } as any)
            : grandTot;
      }
    }

    const aralik = (col: number | null): string | null =>
      col && ilkVeri && sonVeri
        ? `SUM(${sayfaRef(ws.name)}!${KOLON_HARF(col)}${ilkVeri}:${KOLON_HARF(col)}${sonVeri})`
        : null;

    ozetler.push({
      name: ws.name,
      matFormul: aralik(matTotCol),
      labFormul: aralik(labTotCol),
      matDeger: matToplam,
      labDeger: labToplam,
    });
  }

  return ozetler;
}

/**
 * Orijinal dosya YOKSA (eski/DWG teklifler): liste sayfalarini sheets
 * JSON'dan ExcelJS ile kur (gorunur kolonlar + fiyat kolonlari; sistem/ic
 * alanlar HARIC — T2). Donen wb ayni akista kullanilir.
 */
export function buildListWorkbookFromSheets(sheetsArr: SheetJson[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const GIZLI = new Set(['_malzKar', '_marka', '_iscKar', '_firma']);
  for (const s of sheetsArr) {
    const ws = wb.addWorksheet((s.name ?? 'Sayfa').slice(0, 31) || 'Sayfa');
    if (s.isEmpty) continue;
    const defs = (s.columnDefs ?? []).filter(
      (d) => d.field && !GIZLI.has(d.field) && (!d.field.startsWith('_') ||
        Object.values(s.columnRoles ?? {}).includes(d.field)),
    );
    defs.forEach((d, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = d.headerName ?? '';
      c.font = { bold: true };
    });
    const rows = s.rowData ?? [];
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row) continue;
      defs.forEach((d, i) => {
        const v = row[d.field];
        if (v !== undefined && v !== null && v !== '') {
          ws.getCell(ri + 2, i + 1).value = typeof v === 'number' ? v : String(v);
        }
      });
    }
  }
  return wb;
}

/** Format sayfasini hedef workbook'a hucre-hucre kopyalar (deger+stil+
 *  merge+kolon genisligi+satir yuksekligi). Ad cakisirsa " (Format)" eki. */
export function kopyalaSayfa(
  kaynak: ExcelJS.Worksheet,
  hedef: ExcelJS.Workbook,
): ExcelJS.Worksheet {
  let ad = kaynak.name;
  if (hedef.worksheets.some((w) => w.name === ad)) ad = `${ad} (Format)`.slice(0, 31);
  const ws = hedef.addWorksheet(ad);

  const kolonSayisi = Math.max(kaynak.columnCount || 1, 1);
  for (let c = 1; c <= kolonSayisi; c++) {
    const src = kaynak.getColumn(c);
    if (src.width) ws.getColumn(c).width = src.width;
    if (src.hidden) ws.getColumn(c).hidden = true;
  }
  kaynak.eachRow({ includeEmpty: true }, (row, rn) => {
    const dRow = ws.getRow(rn);
    if (row.height) dRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, cn) => {
      const d = dRow.getCell(cn);
      d.value = cell.value as any;
      d.style = JSON.parse(JSON.stringify(cell.style ?? {}));
    });
  });
  for (const m of (kaynak.model?.merges ?? []) as string[]) {
    try { ws.mergeCells(m); } catch { /* cakisan merge atlanir */ }
  }
  return ws;
}

/** Verilen adli sayfalari workbook sirasinin BASINA alir.
 *  ExcelJS worksheets getter'i orderNo'ya gore SIRALAR (doc/workbook.js:123)
 *  — dizi manipulasyonu degil orderNo atamasi gerekir (testte kanitlandi). */
export function sayfalariBasaAl(wb: ExcelJS.Workbook, adlar: string[]): void {
  const hepsi: any[] = ((wb as any)._worksheets as any[]).filter(Boolean);
  const on = adlar
    .map((a) => hepsi.find((w: any) => w.name === a))
    .filter(Boolean);
  const kalan = hepsi
    .filter((w: any) => !on.includes(w))
    .sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
  let sira = 1;
  for (const w of [...on, ...kalan]) w.orderNo = sira++;
}

export interface ExportGirdisi {
  originalFile: Buffer | null;
  sheetsArr: SheetJson[];
  formatWb: ExcelJS.Workbook;
  ctxTemel: Omit<FillContext, 'sekmeler'>;
  overrides?: ExportOverrides | null;
}

export interface ExportSonucu {
  wb: ExcelJS.Workbook;
  sekmeler: SekmeOzet[];
  /** Otomatik doldurulan hucreler (T14 haritasi) */
  dolan: YerTutucu[];
  /** Basa alinan kapak/icmal sayfa adlari */
  formatSayfalari: string[];
}

/**
 * TAM CIKTI KURUCUSU — uc adim (PRD §3):
 *  1. Taban: musteri wb (T1) veya sheets JSON'dan kurulum (geri dusus)
 *  2. Fiyatlar formullu yazilir (T6/T7) → sekme ozetleri
 *  3. Format kapak/icmal kopyalanir + doldurulur (T4/T5) + override (T13/T14)
 */
export async function buildExportWorkbook(g: ExportGirdisi): Promise<ExportSonucu> {
  let wb: ExcelJS.Workbook;
  if (g.originalFile) {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(g.originalFile as any);
  } else {
    wb = buildListWorkbookFromSheets(g.sheetsArr);
  }

  const sekmeler = writePricesToWorkbook(wb, g.sheetsArr);

  const formatSayfalari: string[] = [];
  for (const ws of g.formatWb.worksheets) {
    formatSayfalari.push(kopyalaSayfa(ws, wb).name);
  }
  sayfalariBasaAl(wb, formatSayfalari);

  const dolan = fillPlaceholders(wb, { ...g.ctxTemel, sekmeler });
  applyOverrides(wb, g.overrides);

  return { wb, sekmeler, dolan, formatSayfalari };
}
