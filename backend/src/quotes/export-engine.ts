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

/** K-C (S3, EMO AYVAZ): TL deger yabanci para etiketli hucreye basilamaz —
 *  hedef hucre bicimi USD/EUR ise TL'ye cevrilir ("558,20USD" yaniltmasi). */
const tlBicimiDuzelt = (cell: ExcelJS.Cell) => {
  const f = String(cell.numFmt ?? '');
  if (f && /USD|EUR|GBP|\$|€|£/i.test(f) && !/TL|₺/i.test(f)) cell.numFmt = '#,##0.00" TL"';
};

/** K-D (S4): sayfadaki formul-hata (cached #DEĞER!/#REF!/#AD?) hucre sayisi.
 *  Yazim oncesi/sonrasi karsilastirilir — yazim hata sayisini ARTIRAMAZ. */
const hataSay = (ws: ExcelJS.Worksheet): number => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
    const v: any = cell.value;
    if (v && typeof v === 'object'
        && (v.error || (v.result && typeof v.result === 'object' && v.result.error))) n++;
  }));
  return n;
};

/** TR-bilincli baslik normalizasyonu: harf-disi karakter at, kucult, TR
 *  harfleri katla. "Malz. Birim\nFiyat" → "malzbirimfiyat". */
const basNorm = (v: any): string =>
  String(v ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's').replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g').replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/** ExcelJS hucre degerinden duz metin (richText/formul-sonuc/duz). */
const hucreDeger = (v: any): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t?.text ?? '').join('');
    if (v.formula !== undefined) return String(v.result ?? '');
    if (v.text !== undefined) return String(v.text);
    return '';
  }
  return String(v);
};

/** Bir fiyat/tutar kolonunun ANLAMI — sistem alanini (fixedSchema) musteri
 *  workbook'unun KENDI basligina eslemek icin (Duzeltme Talebi 24.07). */
export type FiyatAnlam = 'matUnit' | 'matTot' | 'labUnit' | 'labTot' | 'grandUnit' | 'grandTot';

/** Normalize edilmis baslik verilen anlama uyar mi? Toleransli (KE3/KE7):
 *  "Malz."="Malzeme", "İşç."="İşçilik", "Bir. Fiyat"="Birim Fiyat". Birim
 *  fiyat ≠ tutar ayrimi kritik (aksi halde F↔H karisir). */
export function basligaUyar(hn: string, anlam: FiyatAnlam): boolean {
  const malz = hn.includes('malz');
  const isc = hn.includes('isc');
  const birimFiyat = hn.includes('bir') && hn.includes('fiyat');
  const tutar = hn.includes('tutar') || hn.includes('toplam');
  switch (anlam) {
    case 'matUnit': return malz && birimFiyat;
    case 'matTot': return malz && tutar && !birimFiyat;
    case 'labUnit': return isc && birimFiyat;
    case 'labTot': return isc && tutar && !birimFiyat;
    case 'grandUnit': return !malz && !isc && birimFiyat;
    case 'grandTot': return !malz && !isc && tutar && !birimFiyat;
  }
}

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
  /** KF6 self-check: uygulamada dolu (>0) fiyat/tutar hucre sayisi */
  beklenen: number;
  /** KF6 self-check: dosyaya GERCEKTEN yazilan hucre sayisi */
  yazilan: number;
  /** K-D (KG5): yazimla ARTAN formul-hata sayisi (0 olmali) */
  hataArtisi: number;
}

/**
 * Musteri workbook'una fiyatlari yazar (IN-PLACE) ve sekme bilgisi doner.
 *
 * KOLON HEDEFI (Duzeltme Talepleri 24-27.07 — kayma/fazla-kolon/veri-kaybi):
 *  - colN rol → import'un okudugu KONUMA geri yazilir (round-trip, KE5).
 *  - Sistem alani (fixedSchema _matBirim vb.) → sablonun KENDI fiyat sutunu
 *    BASLIK ANLAMIYLA bulunur (F–J), degeri oraya yazar. Konumdan bagimsiz
 *    (KE3). Ikinci kolon seti (eski K–O davranisi) URETILMEZ.
 *  - VERI KAYBI YASAK (KF1/KF2, Aksa_Göynük vakasi): eslesen kolon YOK ama
 *    yazilacak DOLU veri VARSA kolon sablonun sag ucuna basligiyla EKLENIR
 *    ve doldurulur — uygulamada gorunen hicbir fiyat ciktida kaybolmaz.
 *  - Veri de yoksa kolon EKLENMEZ (KE8/KF3 — UYMZ: verisiz Isc. basliklari
 *    dayatilmaz). Turetilmis Toplam (grandUnit/grandTot) yalniz sablonda
 *    basligi VARSA yazilir; asla eklenmez (KE11 — bilesenleri zaten yazili).
 *  - KF6 self-check: beklenen (uygulamada dolu) / yazilan hucre sayaclari
 *    SekmeBilgi'de doner; uyusmazlik cagirana gorunur uyari tasitir.
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

    // KF2 on-taramasi: bu rolde EN AZ BIR data satirinda dolu (>0) deger
    // var mi? Kolon-ekleme karari yalniz DOLU veri icin verilir.
    const rolDolu = (field?: string): boolean => {
      if (!field) return false;
      for (const row of rowData) {
        if (row?._isDataRow && sayi(row[field]) > 0) return true;
      }
      return false;
    };

    // Baslik satiri: rowData'daki SON _isHeaderRow (excel 1-based = ri+1); yoksa 1
    let headerRow = 1;
    for (let ri = 0; ri < rowData.length; ri++) {
      if (rowData[ri]?._isHeaderRow) headerRow = ri + 1;
      if (rowData[ri]?._isDataRow) break;
    }

    // TUM baslik satirlari (excel 1-based) — cok satirli/kismi baslik destegi
    const headerRows: number[] = [];
    for (let ri = 0; ri < rowData.length; ri++) {
      if (rowData[ri]?._isDataRow) break;
      if (rowData[ri]?._isHeaderRow) headerRows.push(ri + 1);
    }
    if (headerRows.length === 0) headerRows.push(headerRow);

    // ── Musteri workbook'unun KENDI basligindan hedef kolonu coz (KE1-KE7) ──
    // Duzeltme Talebi 24.07: eski davranis (sistem alanini SAGA ek kolon
    // yapmak) fiyatlari K–O'ya kaydiriyordu. Dogrusu: fiyat, sablonun mevcut
    // fiyat sutununa (F–J) BASLIK ANLAMIYLA yazilir; ikinci kolon seti YOK.
    const enSonKolon = Math.max(ws.columnCount || 0, ws.actualColumnCount || 0);
    const kullanilanKolon = new Set<number>();
    const kolonBasligi = (c: number): string =>
      headerRows.map((hr) => hucreDeger(ws.getCell(hr, c).value)).join(' ');
    const basligaGoreKolon = (anlam: FiyatAnlam): number | null => {
      for (let c = 1; c <= enSonKolon; c++) {
        if (kullanilanKolon.has(c)) continue;
        if (basligaUyar(basNorm(kolonBasligi(c)), anlam)) { kullanilanKolon.add(c); return c; }
      }
      return null;
    };

    // ── field → 1-based kolon ──
    // KF2 ekleme ucu: BASLIK satirindaki SON DOLU kolonun sagi. Aksa tuzagi:
    // ws.columnCount 119 donebilir (stil tanimli BOS kolonlar) — ona gore
    // eklemek fiyatlari DT120 gibi gorunmez uca atar. Baslik ekseni otorite.
    let baslikSonDolu = 0;
    for (const hr of headerRows) {
      ws.getRow(hr).eachCell({ includeEmpty: false }, (cell, cn) => {
        if (String(hucreDeger(cell.value)).trim() !== '' && cn > baslikSonDolu) baslikSonDolu = cn;
      });
    }
    let nextCol = (baslikSonDolu || enSonKolon) + 1;
    // Guvenlik: hedef kolonda baslik doluysa (teorik cakisma) bir sag kay
    const bosBaslikKolonu = (): number => {
      while (headerRows.some((hr) => String(hucreDeger(ws.getCell(hr, nextCol).value)).trim() !== '')) nextCol++;
      return nextCol++;
    };
    const fieldToCol: Record<string, number> = {};
    const kolonAta = (
      field: string | undefined, fallbackBaslik: string,
      anlam?: FiyatAnlam, ekleYasak?: boolean,
    ): number | null => {
      if (!field) return null;
      if (fieldToCol[field]) return fieldToCol[field];
      // colN: import'un okudugu kolona GERI yaz (round-trip — KE5)
      if (field.startsWith('col')) {
        const idx = parseInt(field.replace('col', ''), 10);
        if (!isNaN(idx)) { const col = idx + 1; fieldToCol[field] = col; kullanilanKolon.add(col); return col; }
      }
      // Sistem alani (fixedSchema): sablonun KENDI fiyat sutununu bul
      // (baslik anlamiyla — konumdan bagimsiz, KE1/KE3/KE7).
      if (anlam) {
        const bulunan = basligaGoreKolon(anlam);
        if (bulunan) { fieldToCol[field] = bulunan; return bulunan; }
      }
      // KF2 (VERI KAYBI YASAK — Aksa_Göynük): eslesen kolon YOK ama DOLU
      // veri VAR → kolon sag uca basligiyla eklenir. Veri yoksa EKLENMEZ
      // (KE8/KF3 — UYMZ). Turetilmis Toplam icin ekleme HER KOSULDA yasak
      // (KE11 — ekleYasak).
      if (!ekleYasak && rolDolu(field)) {
        const col = bosBaslikKolonu();
        fieldToCol[field] = col;
        kullanilanKolon.add(col);
        const hCell = ws.getCell(headerRow, col);
        hCell.value = headerText(field, fallbackBaslik);
        hCell.font = { bold: true };
        return col;
      }
      return null;
    };

    const qtyCol = roles.quantityField && roles.quantityField.startsWith('col')
      ? kolonAta(roles.quantityField, 'Miktar')
      : null; // miktar SISTEM alaniysa orijinalde yok → formul kurulamaz
    // K-B (EMO, S1b): BİRİM kolonu — bazi dosyalarda MİKTAR/BİRİM basliklari
    // TERS (MİKTAR altinda 'mt', BİRİM altinda 70). Satir duzeyinde sayisal
    // olan hucre miktar kabul edilir (asagida etkinQty).
    const unitColIdx = roles.unitField && roles.unitField.startsWith('col')
      ? parseInt(roles.unitField.replace('col', ''), 10)
      : NaN;
    const unitCol = !isNaN(unitColIdx) ? unitColIdx + 1 : null;
    const matUnitCol = kolonAta(roles.materialUnitPriceField, 'Malz. Birim Fiyat', 'matUnit');
    const matTotCol = kolonAta(roles.materialTotalField, 'Malz. Toplam', 'matTot');
    const labUnitCol = kolonAta(roles.laborUnitPriceField, 'İşç. Birim Fiyat', 'labUnit');
    const labTotCol = kolonAta(roles.laborTotalField, 'İşç. Toplam', 'labTot');
    const grandUnitCol = kolonAta(roles.grandUnitPriceField, 'Toplam Birim', 'grandUnit', true);
    const grandTotCol = kolonAta(roles.grandTotalField, 'Toplam Tutar', 'grandTot', true);

    // ── K-D (S4): yazim ONCESI hata sayimi ──
    const hataOnce = hataSay(ws);

    // ── K-A (S2, EMO AYVAZ — HAYALET FIYAT YASAK) ──────────────────────
    // Onceden fiyatli kaynak dosyada hedef fiyat kolonlarindaki ESKI
    // deger/formuller DATA satirlarinda TEMIZLENIR; cikti YALNIZ uygulama
    // grid'indeki degerleri tasir (grid ↔ cikti birebir). Toplam/ara-toplam
    // satirlari (_isDataRow degil) DOKUNULMAZ — sablonun SUM'lari korunur.
    const hedefKolonlar = [matUnitCol, matTotCol, labUnitCol, labTotCol, grandUnitCol, grandTotCol]
      .filter((c): c is number => !!c);
    if (hedefKolonlar.length > 0) {
      for (let ri = 0; ri < rowData.length; ri++) {
        if (!rowData[ri]?._isDataRow) continue;
        for (const c of hedefKolonlar) ws.getCell(ri + 1, c).value = null;
      }
    }

    let ilkVeri = 0; let sonVeri = 0;
    let matToplam = 0; let labToplam = 0;
    // KF6 self-check sayaclari — grand* turetilmis oldugundan sayilmaz
    // (bilesenleri matUnit/matTot/labUnit/labTot zaten sayiliyor).
    let beklenen = 0; let yazilan = 0;

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

      if (matUnit > 0) beklenen++;
      if (matTot > 0) beklenen++;
      if (labUnit > 0) beklenen++;
      if (labTot > 0) beklenen++;

      // T6: yalniz >0 degerler yazilir — fiyatsiz satir BOS kalir, 0 ASLA.
      // K-C: yazilan her hucrede yabanci para bicimi TL'ye duzeltilir.
      const yaz = (col: number, deger: any) => {
        const cell = ws.getCell(excelRow, col);
        cell.value = deger;
        tlBicimiDuzelt(cell);
        return cell;
      };
      if (matUnitCol && matUnit > 0) { yaz(matUnitCol, matUnit); yazilan++; }
      if (labUnitCol && labUnit > 0) { yaz(labUnitCol, labUnit); yazilan++; }
      if (grandUnitCol && grandUnit > 0) yaz(grandUnitCol, grandUnit);

      // K-B (S1, EMO): ETKIN MIKTAR — quantityField hucresi sayisal degilse
      // (MİKTAR/BİRİM basliklari TERS dosyalar: MİKTAR altinda 'mt') BİRİM
      // kolonundaki SAYISAL deger miktar kabul edilir. Ikisi de degilse
      // formul kurulmaz (Bulgu B8: metin × formul = #VALUE riski).
      const qtyHucre = qtyCol ? ws.getCell(excelRow, qtyCol).value : null;
      const unitHucre = unitCol ? ws.getCell(excelRow, unitCol).value : null;
      let etkinQtyCol: number | null = null;
      let etkinQty = 0;
      if (typeof qtyHucre === 'number' && qtyHucre > 0) { etkinQtyCol = qtyCol; etkinQty = qtyHucre; }
      else if (typeof unitHucre === 'number' && unitHucre > 0) { etkinQtyCol = unitCol; etkinQty = unitHucre; }
      else if (qty > 0) etkinQty = qty; // grid degeri (formulsuz hesap icin)

      // K-B: birim fiyat YAZILAN satirda toplam MUTLAKA yazilir — eski/stale
      // toplam (EMO: 798 = eski birimin kalintisi) ASLA birakilmaz. App
      // toplami hesaplayamamissa (S1b) miktar × birim'den TURETILIR.
      const matTotYaz = matTot > 0 ? matTot
        : matUnit > 0 && etkinQty > 0 ? Math.round(matUnit * etkinQty * 100) / 100 : 0;
      const labTotYaz = labTot > 0 ? labTot
        : labUnit > 0 && etkinQty > 0 ? Math.round(labUnit * etkinQty * 100) / 100 : 0;
      matToplam += matTotYaz - matTot; // İCMAL turetilen toplami da gorur
      labToplam += labTotYaz - labTot;

      if (matTotCol && matTotYaz > 0) {
        yaz(matTotCol,
          etkinQtyCol && matUnitCol && matUnit > 0
            ? ({ formula: `${KOLON_HARF(etkinQtyCol)}${excelRow}*${KOLON_HARF(matUnitCol)}${excelRow}`, result: matTotYaz } as any)
            : matTotYaz);
        yazilan++;
      }
      if (labTotCol && labTotYaz > 0) {
        yaz(labTotCol,
          etkinQtyCol && labUnitCol && labUnit > 0
            ? ({ formula: `${KOLON_HARF(etkinQtyCol)}${excelRow}*${KOLON_HARF(labUnitCol)}${excelRow}`, result: labTotYaz } as any)
            : labTotYaz);
        yazilan++;
      }
      const grandYaz = grandTot > 0 ? grandTot : Math.round((matTotYaz + labTotYaz) * 100) / 100;
      if (grandTotCol && grandYaz > 0) {
        yaz(grandTotCol,
          matTotCol && labTotCol && (matTotYaz > 0 || labTotYaz > 0)
            ? ({ formula: `${KOLON_HARF(matTotCol)}${excelRow}+${KOLON_HARF(labTotCol)}${excelRow}`, result: grandYaz } as any)
            : grandYaz);
      }
    }

    // K-D (KG5): yazim sonrasi hata sayisi ONCEKINE gore artamaz
    const hataArtisi = Math.max(0, hataSay(ws) - hataOnce);
    if (hataArtisi > 0) {
      console.warn(`[Export] ⚠ K-D: "${ws.name}" sayfasinda yazim ${hataArtisi} formul hatasi URETTI`);
    }

    ozetler.push({
      wsName: ws.name,
      matCol: matTotCol,
      labCol: labTotCol,
      ilkVeri,
      sonVeri,
      matDeger: matToplam,
      labDeger: labToplam,
      beklenen,
      yazilan,
      hataArtisi,
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
  /** KF6 self-check: dosyaya yazilamayan dolu deger sayisi (0 = kayip yok) */
  eksikDeger: number;
  /** K-D (KG5): yazimla artan formul-hata sayisi (0 olmali) */
  hataArtisi: number;
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
  // KF6 self-check: yazilamayan dolu deger — sessiz veri kaybi YASAK,
  // cagiran (controller) kullaniciya gorunur uyari tasir.
  const eksikDeger = bilgiler.reduce((a, b) => a + Math.max(0, b.beklenen - b.yazilan), 0);
  if (eksikDeger > 0) {
    console.warn(`[Export] ⚠ SELF-CHECK: ${eksikDeger} dolu fiyat degeri dosyaya YAZILAMADI`);
  }
  const hataArtisi = bilgiler.reduce((a, b) => a + (b.hataArtisi ?? 0), 0);

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

  return { wb, sekmeler, dolan, formatSayfalari, listeSayfalari, eksikDeger, hataArtisi };
}
