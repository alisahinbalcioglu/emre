/**
 * KE15-KE21 — IKI KATMANLI BASLIK KOLON HARITASI (PRD Kesin Cozum 29.07)
 *
 * Kanit dosyasi: "ŞAHİNKUL KEŞİF ÖZETİ 251224 R1" (test-fixtures/e2e/).
 * Sablon basligi IKI SATIR + yatay merge:
 *   R3:  B..F tekil | G3:H3 "MALZEME" | I3:J3 "İŞÇİLİK" | K3:L3 "TOPLAM"
 *   R4:  B..F tekil | G4 "BİRİM FİYAT" H4 "TUTAR" | I4 "BİRİM FİYAT" J4 "TUTAR" | K4/L4 ayni
 * Alt baslik adlari TEKRARLI (uc kez "BİRİM FİYAT") — ayrim YALNIZ ebeveyn
 * grupla yapilabilir.
 *
 * FAZ 0 kok neden (test-fixtures/regression/FAZ0_KOK_NEDEN_RAPORU.md §B):
 * export basligi yalniz _isHeaderRow satirlarindan okuyor, alt baslik satiri
 * o isareti tasimadigi icin G kolonunun basligi "MALZEME" olarak kaliyor →
 * basligaUyar('malzeme','matUnit')=false → KF2 kolon-ekleme dali → M/N.
 *
 * Kosum: npx ts-node test/iki-katmanli-baslik-test.ts   (npm run test:kb)
 */
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { writePricesToWorkbook, basligaUyar } from '../src/quotes/export-engine';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const bosMu = (v: any) => v === null || v === undefined || v === '';
const KOL = (n: number) => { let s = ''; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const oku = (ad: string) => fs.readFileSync(`../test-fixtures/e2e/${ad}`);

/** SAHINKUL basligiyla BIREBIR ikiz fixture (merge'li iki katmanli). */
function ikiKatmanliFixture(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SIHHİ');
  // R2: sayfa basligi (B2:L2 merge) — gurultu katmani
  ws.getCell(2, 2).value = 'ŞAHİNKUL FABRİKA\nSıhhi Tesisat\nKeşif Özeti';
  ws.mergeCells(2, 2, 2, 12);
  // R3: grup basliklari (yatay merge)
  ws.getCell(3, 2).value = 'SIRA\nNO'; ws.getCell(3, 3).value = 'CİNSİ TANIMI';
  ws.getCell(3, 4).value = 'MARKASI'; ws.getCell(3, 5).value = 'MİKTAR'; ws.getCell(3, 6).value = 'BİRİM';
  ws.getCell(3, 7).value = 'MALZEME'; ws.getCell(3, 9).value = 'İŞÇİLİK'; ws.getCell(3, 11).value = 'TOPLAM';
  // R4: alt basliklar (TEKRARLI adlar)
  ws.getCell(4, 7).value = 'BİRİM FİYAT'; ws.getCell(4, 8).value = 'TUTAR';
  ws.getCell(4, 9).value = 'BİRİM FİYAT'; ws.getCell(4, 10).value = 'TUTAR';
  ws.getCell(4, 11).value = 'BİRİM FİYAT'; ws.getCell(4, 12).value = 'TUTAR';
  // dikey merge (B3:B4 … F3:F4) + yatay grup merge
  for (let c = 2; c <= 6; c++) ws.mergeCells(3, c, 4, c);
  ws.mergeCells(3, 7, 3, 8); ws.mergeCells(3, 9, 3, 10); ws.mergeCells(3, 11, 3, 12);
  // R5: GALVANİZ ÇELİK BORU grup basligi (no dolu, miktar bos)
  ws.getCell(5, 2).value = 27; ws.getCell(5, 3).value = 'GALVANİZ ÇELİK BORU';
  // R6-R7: veri satirlari (musterinin KENDI iscilik fiyatlari dolu)
  ws.getCell(6, 3).value = '½"'; ws.getCell(6, 5).value = 6; ws.getCell(6, 6).value = 'mt.';
  ws.getCell(6, 9).value = 550; ws.getCell(6, 10).value = 3300;
  ws.getCell(7, 3).value = '¾"'; ws.getCell(7, 5).value = 565; ws.getCell(7, 6).value = 'mt.';
  ws.getCell(7, 9).value = 600; ws.getCell(7, 10).value = 339000;
  return wb;
}

/** Grid tarafinin urettigi sheet JSON'u — fixedSchema sistem alanlariyla. */
function sheetsFixture(): any[] {
  return [{
    name: 'SIHHİ', index: 0, isEmpty: false,
    // Fixture Excel B kolonundan başlıyor (A boş) — gerçek ŞAHİNKUL gibi.
    // colOffset olmadan colN→Excel çevrimi bir kolon sola kayar.
    colOffset: 1,
    // KG9 sonrası GERÇEK parse çıktısı: fiyat rolleri dosyanın KENDİ
    // kolonlarına bağlı (G=col5, H=col6, I=col7, J=col8, K=col9, L=col10 —
    // grid col0 = Excel B). Sistem alanı (_matBirim) yalnız dosyada karşılığı
    // olmayan roller için kullanılır.
    columnRoles: {
      noField: 'col0', nameField: 'col1', brandField: 'col2', quantityField: 'col3', unitField: 'col4',
      materialUnitPriceField: 'col5', materialTotalField: 'col6',
      laborUnitPriceField: 'col7', laborTotalField: 'col8',
      grandUnitPriceField: 'col9', grandTotalField: 'col10',
    },
    columnDefs: [],
    // ÖNEMLİ: _isHeaderRow bayrakları GERÇEK parse çıktısıyla birebir
    // (ölçüm 29.07): R1/R2/R3 işaretli, **R4 (alt başlık) İŞARETSİZ**.
    // Fixture'ı "doğru" işaretlemek kök nedeni gizler — test yeşil, gerçek kırık.
    rowData: [
      { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false },
      { _rowIdx: 1, _isHeaderRow: true, _isDataRow: false },  // R2 sayfa basligi
      { _rowIdx: 2, _isHeaderRow: true, _isDataRow: false },  // R3 grup basligi
      { _rowIdx: 3, _isHeaderRow: false, _isDataRow: false }, // R4 alt baslik ← parse İŞARETLEMİYOR
      { _rowIdx: 4, _isDataRow: false, col0: 27, col1: 'GALVANİZ ÇELİK BORU' },
      // Fiyatlar rol alanlarına (dosyanın kolonlarına) yazılır; müşterinin
      // KENDİ işçilik fiyatları (col7/col8) dosyadan gelmiş halde durur.
      { _rowIdx: 5, _isDataRow: true, col1: '½"', col3: 6, col4: 'mt.', col5: '52.4', col6: '314.4', col7: '550', col8: '3300' },
      { _rowIdx: 6, _isDataRow: true, col1: '¾"', col3: 565, col4: 'mt.', col5: '65.9', col6: '37233.5', col7: '600', col8: '339000' },
    ],
  }];
}

async function run() {
  console.log('\n══════ KE15-KE21: IKI KATMANLI BASLIK ══════\n');

  // ── KE15: iki katmanli baslik anlamsal anahtarlara cozulur ────────────
  {
    const wb = ikiKatmanliFixture();
    const sheets = sheetsFixture();
    writePricesToWorkbook(wb, sheets);
    const ws = wb.getWorksheet('SIHHİ')!;

    check('KE15 MALZEME.BİRİM_FİYAT = G (şablonun kendi kolonu, R6)',
      ws.getCell(6, 7).value === 52.4,
      `G6=${JSON.stringify(ws.getCell(6, 7).value)} (M6=${JSON.stringify(ws.getCell(6, 13).value)})`);
    check('KE15b MALZEME.TUTAR = H (formül veya değer, R6)',
      !bosMu(ws.getCell(6, 8).value),
      `H6=${JSON.stringify(ws.getCell(6, 8).value)}`);
    check('KE15c ikinci satır da aynı kolonlara yazıldı (G7=65,9)',
      ws.getCell(7, 7).value === 65.9,
      `G7=${JSON.stringify(ws.getCell(7, 7).value)}`);
  }

  // ── KE16: anlamsal eslesme varken kolon EKLENMEZ ──────────────────────
  {
    const wb = ikiKatmanliFixture();
    writePricesToWorkbook(wb, sheetsFixture());
    const ws = wb.getWorksheet('SIHHİ')!;
    const eklenen: string[] = [];
    for (let c = 13; c <= 20; c++) {
      for (const hr of [3, 4]) {
        const v = ws.getCell(hr, c).value;
        if (!bosMu(v)) eklenen.push(`${KOL(c)}${hr}="${String(v).slice(0, 20)}"`);
      }
    }
    check('KE16 şablon dışına kolon EKLENMEDİ (M+ başlıkları boş)',
      eklenen.length === 0, eklenen.join(' '));
  }

  // ── KE18: sistem sablona FORMUL ICAT ETMEZ ────────────────────────────
  {
    const wb = ikiKatmanliFixture();
    writePricesToWorkbook(wb, sheetsFixture());
    const ws = wb.getWorksheet('SIHHİ')!;
    const icatFormuller: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const v: any = cell.value;
        if (v && typeof v === 'object' && v.formula) {
          // eklenen kolona (M=13 ve sonrasi) referans veren formul YASAK
          if (/\b[M-Z]\d+/.test(String(v.formula))) icatFormuller.push(`${KOL(cn)}${rn}: =${v.formula}`);
        }
      });
    });
    check('KE18 eklenen-kolona referanslı sistem formülü YOK (=E108*M108 yasağı)',
      icatFormuller.length === 0, icatFormuller.slice(0, 3).join(' · '));
  }

  // ── KE19: uretilen dosya BOZUK OLMAZ (round-trip okunur) ──────────────
  {
    const wb = ikiKatmanliFixture();
    writePricesToWorkbook(wb, sheetsFixture());
    let hata = ''; let tekrarOkundu = false; let sayfaSayisi = 0;
    try {
      const buf = await wb.xlsx.writeBuffer();
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(buf as any);
      sayfaSayisi = wb2.worksheets.length;
      tekrarOkundu = !!wb2.getWorksheet('SIHHİ');
    } catch (e: any) { hata = e?.message ?? 'bilinmeyen'; }
    check('KE19 export edilen dosya bağımsız round-trip ile okunur (yapı sağlam)',
      hata === '' && tekrarOkundu && sayfaSayisi === 1,
      hata || `sayfa=${sayfaSayisi} okundu=${tekrarOkundu}`);
  }

  // ── KE20: basligaUyar sozlesmesi (kok neden dokumu) ───────────────────
  {
    const basNorm = (v: string) => v
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/Ş/g, 's').replace(/ş/g, 's').replace(/Ç/g, 'c').replace(/ç/g, 'c')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    check('KE20 "MALZEME BİRİM FİYAT" → matUnit (üst+alt birleşik doğru çalışıyor)',
      basligaUyar(basNorm('MALZEME BİRİM FİYAT'), 'matUnit') === true, '');
    check('KE20b "İŞÇİLİK BİRİM FİYAT" → labUnit',
      basligaUyar(basNorm('İŞÇİLİK BİRİM FİYAT'), 'labUnit') === true, '');
    check('KE20c YALNIZ "MALZEME" → matUnit OLMAZ (kök neden: alt satır okunmuyor)',
      basligaUyar(basNorm('MALZEME'), 'matUnit') === false, '');
  }

  // ── KE21: GERCEK SAHINKUL dosyasi — fazladan kolon yok diff testi ─────
  {
    const dosyaAdi = 'ŞAHİNKUL KEŞİF ÖZETİ 251224 R1 - LİNTU MÜHENDİSLİK.xlsx';
    let hata = ''; let eklenenKolon: string[] = []; let gDolu = false;
    try {
      const { ExcelGridService } = require('../src/modules/excel-grid/excel-grid.service');
      const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
      const buf = oku(dosyaAdi);
      const res = await svc.prepare(buf, { fixedSchema: true });
      const sh = res.sheets.find((s: any) => s.name === 'SIHHİ');
      // GALVANİZ ÇELİK BORU grubuna fiyat yaz (kullanicinin senaryosu)
      const FIYAT: Record<number, number> = { 107: 52.4, 108: 65.9, 109: 92.3 };
      const bfAlan = sh.columnRoles.materialUnitPriceField;
      const totAlan = sh.columnRoles.materialTotalField;
      for (const r of sh.rowData ?? []) {
        if (FIYAT[r._rowIdx]) {
          // Fiyat, grid'in ROL alanına yazılır (frontend de böyle yapar)
          r[bfAlan] = String(FIYAT[r._rowIdx]);
          const mik = parseFloat(String(r[sh.columnRoles.quantityField] ?? '')) || 0;
          r[totAlan] = (FIYAT[r._rowIdx] * mik).toFixed(1);
        }
      }
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      writePricesToWorkbook(wb, res.sheets);
      const ws = wb.getWorksheet('SIHHİ')!;
      // sablonun KENDI malzeme birim fiyat kolonu (G=7) dolu mu?
      gDolu = ws.getCell(108, 7).value === 52.4;
      // M+ (13+) baslik satirlarinda yeni kolon var mi?
      for (let c = 13; c <= 20; c++) {
        for (const hr of [3, 4]) {
          const v = ws.getCell(hr, c).value;
          if (!bosMu(v)) eklenenKolon.push(`${KOL(c)}${hr}="${String(v).slice(0, 18)}"`);
        }
      }
    } catch (e: any) { hata = e?.message ?? 'hata'; }
    check('KE21 GERÇEK ŞAHİNKUL: malzeme fiyatı şablonun G kolonuna yazıldı',
      hata === '' && gDolu, hata || 'G108 ≠ 52,4');
    check('KE21b GERÇEK ŞAHİNKUL: şablon dışına kolon eklenmedi',
      hata === '' && eklenenKolon.length === 0, hata || eklenenKolon.join(' '));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`IKI KATMANLI BASLIK: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
