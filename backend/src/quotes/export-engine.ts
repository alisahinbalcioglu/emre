// ════════════════════════════════════════════════════════════════════
// PROFESYONEL TEKLIF CIKTISI MOTORU (PRD Teklif Formatim v2.1) — SAF, DB YOK
//
// MIMARI v2 (kullanici karari 20.07 — "yuklendigim dosya birebir cikmali,
// is sayfalari TEK TUSLA yer degistirmeli"):
//   TABAN = FORMAT workbook'unun KENDISI (ExcelJS load → kapak GORSELLERI,
//   sartlar, kur sayfasi vb. NATIF korunur — hucre kopyasi resim tasiyamaz,
//   kullanicinin kapagi tamamen logoydu). 'liste' rollu sayfalar (eski is
//   sayfalari) SILINIR; teklifin liste sayfalari MUSTERI workbook'undan
//   fiyatlari yazilmis halde ayni KONUMA kopyalanir.
// T6: fiyatsiz hucre HIC yazilmaz (0 asla).
// T7: tutar hucreleri CANLI FORMUL (=miktar*birim); icmal/genel toplam
//     formullu (SUM parcalari SON sayfa adlariyla kurulur).
// Test: test/export-format-test.ts
// ════════════════════════════════════════════════════════════════════
import * as ExcelJS from 'exceljs';
import {
  fillPlaceholders, applyOverrides, KOLON_HARF, sayfaRolleriTahminEt,
  FillContext, SekmeOzet, YerTutucu, ExportOverrides, SheetRoles,
} from '../quote-formats/format-engine';

/** TR-bilinçli sayi parse (Bulgu B7/B8 siniri): "1.234,56" → 1234.56,
 *  "87,5" → 87.5, "313" → 313. Grid hucreleri metin tasiyabilir. */
const sayi = (v: any): number => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).replace(/[₺$€\s]/g, '').trim();
  if (s === '') return 0;
  const virgul = s.includes(',');
  const nokta = s.includes('.');
  if (virgul && nokta) s = s.replace(/\./g, '').replace(',', '.'); // TR: nokta binlik
  else if (virgul) s = s.replace(',', '.');
  const n = parseFloat(s);
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

/** Fiyat yazimindan donen HAM sekme bilgisi — SUM formulu SONRADAN
 *  (kopya sonrasi SON sayfa adiyla) kurulur. */
export interface SekmeBilgi {
  wsName: string;
  matCol: number | null;
  labCol: number | null;
  ilkVeri: number;
  sonVeri: number;
  matDeger: number;
  labDeger: number;
}

/**
 * Musteri workbook'una fiyatlari yazar (IN-PLACE) ve sekme bilgisi doner.
 *
 * BULGU FIX (20.07): eski generateExcel yalniz colN rollerini yaziyordu —
 * fixedSchema sayfalarin sistem alanlari (_matBirim vb.) SESSIZCE dusuyordu.
 * Artik colN olmayan fiyat rolleri sayfanin SAGINA yeni kolon olarak eklenir
 * (baslik + degerler); orijinal hucrelere DOKUNULMAZ → T1 diff yine gecer.
 */
export function writePricesToWorkbook(
  wb: ExcelJS.Workbook,
  sheetsArr: SheetJson[],
): SekmeBilgi[] {
  const ozetler: SekmeBilgi[] = [];

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

      // T7: tutar = miktar × birim CANLI FORMUL — ama YALNIZ orijinaldeki
      // miktar hucresi GERCEKTEN SAYISALSA (Bulgu B8: metin miktar × formul
      // = #VALUE riski; metinse tutar DUZ SAYI yazilir — "dolu ve sayisal").
      const qtyHucreSayisal = qtyCol
        ? typeof ws.getCell(excelRow, qtyCol).value === 'number'
        : false;
      if (matTotCol && matTot > 0) {
        ws.getCell(excelRow, matTotCol).value =
          qtyCol && matUnitCol && qtyHucreSayisal && qty > 0 && matUnit > 0
            ? ({ formula: `${KOLON_HARF(qtyCol)}${excelRow}*${KOLON_HARF(matUnitCol)}${excelRow}`, result: matTot } as any)
            : matTot;
      }
      if (labTotCol && labTot > 0) {
        ws.getCell(excelRow, labTotCol).value =
          qtyCol && labUnitCol && qtyHucreSayisal && qty > 0 && labUnit > 0
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

    ozetler.push({
      wsName: ws.name,
      matCol: matTotCol,
      labCol: labTotCol,
      ilkVeri,
      sonVeri,
      matDeger: matToplam,
      labDeger: labToplam,
    });
  }

  return ozetler;
}

/** SekmeBilgi + SON sayfa adi → icmal SUM formullu SekmeOzet (T5/T7). */
export function sekmeOzetiKur(b: SekmeBilgi, sonAd: string): SekmeOzet {
  const aralik = (col: number | null): string | null =>
    col && b.ilkVeri && b.sonVeri
      ? `SUM(${sayfaRef(sonAd)}!${KOLON_HARF(col)}${b.ilkVeri}:${KOLON_HARF(col)}${b.sonVeri})`
      : null;
  return {
    name: sonAd,
    matFormul: aralik(b.matCol),
    labFormul: aralik(b.labCol),
    matDeger: b.matDeger,
    labDeger: b.labDeger,
  };
}

// NOT (Bulgu Raporu 21.07, B1-B9 → kok neden): grid state'inden workbook
// ureten `buildListWorkbookFromSheets` SILINDI. Iki yol yan yana kalmaz —
// cikti YALNIZ iki gercek kaynaktan kurulur: format workbook'u (taban) +
// musterinin ORIJINAL workbook kopyasi (liste sayfalari). Orijinal dosya
// olmayan teklif DISA AKTARILAMAZ (acik hata; sessiz sahte cikti YASAK).

/** Format sayfasini hedef workbook'a hucre-hucre kopyalar (deger+stil+
 *  merge+kolon genisligi+satir yuksekligi). Ad cakisirsa " (Format)" eki. */
export function kopyalaSayfa(
  kaynak: ExcelJS.Worksheet,
  hedef: ExcelJS.Workbook,
): ExcelJS.Worksheet {
  let ad = kaynak.name;
  if (hedef.worksheets.some((w) => w.name === ad)) ad = `${ad} (2)`.slice(0, 31);
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

/** Sayfalari verilen AD SIRASINA gore dizer. ExcelJS worksheets getter'i
 *  orderNo'ya gore SIRALAR (doc/workbook.js:123) — dizi manipulasyonu degil
 *  orderNo atamasi gerekir (testte kanitlandi). Listede olmayanlar sona. */
export function sayfalariSirala(wb: ExcelJS.Workbook, adSirasi: string[]): void {
  const hepsi: any[] = ((wb as any)._worksheets as any[]).filter(Boolean);
  const sirali = adSirasi
    .map((a) => hepsi.find((w: any) => w.name === a))
    .filter(Boolean);
  const kalan = hepsi
    .filter((w: any) => !sirali.includes(w))
    .sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
  let sira = 1;
  for (const w of [...sirali, ...kalan]) w.orderNo = sira++;
}

export interface ExportGirdisi {
  /** Musterinin ORIJINAL Excel'i — ZORUNLU (Bulgu Raporu: grid'den uretim
   *  silindi; dosya yoksa cikti YOK, acik hata verilir). */
  originalFile: Buffer;
  sheetsArr: SheetJson[];
  formatWb: ExcelJS.Workbook;
  /** Format sayfa rolleri (mapping.sheetRoles); verilmezse sezgisel tahmin.
   *  'liste' sayfalari SILINIR ve teklif sayfalari o konuma girer. */
  sheetRoles?: SheetRoles | null;
  ctxTemel: Omit<FillContext, 'sekmeler'>;
  overrides?: ExportOverrides | null;
}

export interface ExportSonucu {
  wb: ExcelJS.Workbook;
  sekmeler: SekmeOzet[];
  /** Otomatik doldurulan hucreler (T14 haritasi) */
  dolan: YerTutucu[];
  /** Formatin SABIT sayfalari (onizlemede duzenlenebilir olanlar) */
  formatSayfalari: string[];
  /** Ciktiya giren teklif liste sayfalarinin SON adlari */
  listeSayfalari: string[];
}

/**
 * TAM CIKTI KURUCUSU — MIMARI v2 (kullanici karari 20.07):
 *  1. TABAN = FORMAT workbook (gorseller/sartlar/kur sayfasi NATIF korunur)
 *  2. 'liste' rollu sayfalar (eski is sayfalari) SILINIR — konum not edilir
 *  3. Teklifin liste sayfalari musteri wb'sinde FIYATLARI YAZILIP (T6/T7)
 *     tabana kopyalanir, silinen yuvanin KONUMUNA yerlesir
 *  4. Yer tutucular doldurulur (T4/T5) + teklif override'lari (T13/T14)
 */
export async function buildExportWorkbook(g: ExportGirdisi): Promise<ExportSonucu> {
  // ── 1. Taban: format dosyasinin kendisi ──
  const wb = g.formatWb;
  const roller = g.sheetRoles ?? sayfaRolleriTahminEt(wb);

  // Orijinal sayfa sirasi (silmeden ONCE) — yuva konumu icin
  const orijinalSira = wb.worksheets.map((w) => w.name);

  // ── 2. Liste yuvalarini sil ──
  const silinecek = wb.worksheets.filter((w) => roller[w.name] === 'liste');
  for (const w of silinecek) wb.removeWorksheet(w.id);
  const formatSayfalari = wb.worksheets.map((w) => w.name); // kalan = sabit

  // ── 3. Teklif liste sayfalari: ORIJINAL musteri wb kopyasi + fiyat yaz ──
  // (Bulgu Raporu kok neden: grid'den uretim SILINDI — tek yol budur.)
  if (!g.originalFile || g.originalFile.length === 0) {
    throw new Error('ORIJINAL_DOSYA_YOK');
  }
  const musteriWb = new ExcelJS.Workbook();
  await musteriWb.xlsx.load(g.originalFile as any);
  const bilgiler = writePricesToWorkbook(musteriWb, g.sheetsArr);

  const listeSayfalari: string[] = [];
  const sekmeler: SekmeOzet[] = [];
  for (const b of bilgiler) {
    const kaynakWs = musteriWb.getWorksheet(b.wsName);
    if (!kaynakWs) continue;
    const yeni = kopyalaSayfa(kaynakWs, wb);
    listeSayfalari.push(yeni.name);
    // SUM formulleri SON (kopyadaki) sayfa adiyla kurulur (ad cakismasi
    // " (2)" eki alabilir — formul her kosulda dogru sayfaya bakar)
    sekmeler.push(sekmeOzetiKur(b, yeni.name));
  }

  // ── Sira: ilk liste-yuvasinin konumuna teklif sayfalari girer ──
  const hedefSira: string[] = [];
  let listelerEklendi = false;
  for (const ad of orijinalSira) {
    if (roller[ad] === 'liste') {
      if (!listelerEklendi) { hedefSira.push(...listeSayfalari); listelerEklendi = true; }
      continue; // eski is sayfasi ciktida yok
    }
    hedefSira.push(ad);
  }
  if (!listelerEklendi) hedefSira.push(...listeSayfalari); // yuva yoksa sona
  sayfalariSirala(wb, hedefSira);

  // ── 4. Doldur + teklif katmani ──
  const dolan = fillPlaceholders(wb, { ...g.ctxTemel, sekmeler });
  applyOverrides(wb, g.overrides);

  return { wb, sekmeler, dolan, formatSayfalari, listeSayfalari };
}
