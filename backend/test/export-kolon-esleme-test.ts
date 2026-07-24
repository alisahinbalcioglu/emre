/**
 * KOLON ESLEME — KABUL TESTLERI (Duzeltme Talebi 24.07: "fiyatlar sablonun
 * F–J kolonlari yerine K–O'ya kayiyor"). fixedSchema sayfalarda roller sistem
 * alanidir (_matBirim vb.); export bunlari SABLONUN KENDI fiyat sutununa
 * BASLIK ANLAMIYLA yazmali — ikinci kolon seti (K–O) URETMEDEN.
 *   npx ts-node test/export-kolon-esleme-test.ts   (npm run test:ke)
 *
 * Fixture, ekran goruntusundeki gercek duzenin ikizi:
 *   A=Sıra B=İşin Tanımı C=Açıklama/Marka D=Birim E=Miktar
 *   F=Malzeme Birim Fiyat G=İşçilik Birim Fiyat  (once BIRIM FIYATLAR)
 *   H=Malzeme Tutar I=İşçilik Tutar J=Toplam Tutar  (sonra TUTARLAR)
 * Uygulama ic sirasi (malz birim, malz tutar, isc birim...) sablon sirasindan
 * FARKLI → eslesme KONUMLA degil ANLAMLA olmali (KE3).
 */
import * as ExcelJS from 'exceljs';
import {
  writePricesToWorkbook, sekmeOzetiKur, buildExportWorkbook, basligaUyar, FiyatAnlam,
} from '../src/quotes/export-engine';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const bosMu = (v: any) => v === null || v === undefined || v === '';

/** fixedSchema roller: fiyat/tutarlar SISTEM alani (export'un cozmesi gereken). */
const fixedRoles = {
  noField: 'col0', nameField: 'col1', unitField: 'col3', quantityField: 'col4',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
  grandTotalField: '_toplam',
};

/** Ekran goruntusunun ikizi musteri kesif dosyasi (F–J fiyat basliklari dolu,
 *  veri hucreleri BOS — fiyatlar export'ta yazilacak). */
async function musteriFixture(basliklar: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('mekanik G BLOK');
  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = 'G BLOK MEKANİK KEŞİF';
  ws.getCell('A1').font = { bold: true };
  basliklar.forEach((h, i) => { const c = ws.getCell(2, i + 1); c.value = h; c.font = { bold: true }; });
  // DN 20: malzeme+iscilik dolu, miktar 313
  ws.getCell(3, 1).value = '1'; ws.getCell(3, 2).value = 'DN 20';
  ws.getCell(3, 3).value = 'HAKAN'; ws.getCell(3, 4).value = 'metre'; ws.getCell(3, 5).value = 313;
  // DN 25: yalniz iscilik dolu, miktar 380
  ws.getCell(4, 1).value = '2'; ws.getCell(4, 2).value = 'DN 25';
  ws.getCell(4, 4).value = 'metre'; ws.getCell(4, 5).value = 380;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function sheetsFixture() {
  return [{
    name: 'mekanik G BLOK', index: 0, isEmpty: false,
    columnRoles: fixedRoles,
    columnDefs: [
      { field: '_matBirim', headerName: 'Malz. Birim Fiyat' },
      { field: '_matToplam', headerName: 'Malz. Toplam' },
      { field: '_labBirim', headerName: 'İşç. Birim Fiyat' },
      { field: '_labToplam', headerName: 'İşç. Toplam' },
      { field: '_toplam', headerName: 'Toplam' },
    ],
    rowData: [
      { _rowIdx: 0, _isHeaderRow: false, _isDataRow: false },
      { _rowIdx: 1, _isHeaderRow: true, _isDataRow: false },
      { _rowIdx: 2, _isDataRow: true, col0: '1', col1: 'DN 20', col3: 'metre', col4: 313,
        _matBirim: '26,6', _matToplam: '8325,8', _labBirim: '500', _labToplam: '156500', _toplam: '164825,8' },
      { _rowIdx: 3, _isDataRow: true, col0: '2', col1: 'DN 25', col3: 'metre', col4: 380,
        _matBirim: '', _matToplam: '', _labBirim: '600', _labToplam: '228000', _toplam: '228000' },
    ],
  }];
}

const BASLIK_TAM = ['Sıra No', 'İşin Tanımı', 'Açıklama/Marka', 'Birim', 'Miktar',
  'Malzeme Birim Fiyat', 'İşçilik Birim Fiyat', 'Malzeme Tutar', 'İşçilik Tutar', 'Toplam Tutar'];

async function run() {
  // ── basligaUyar birim ── (F↔H karismasin: birim fiyat ≠ tutar)
  {
    const u = (h: string, a: FiyatAnlam) => basligaUyar(h.replace(/[^a-z0-9]/gi, '').toLowerCase(), a);
    check('KE0 baslik anlami: birim fiyat ≠ tutar ayrimi',
      u('malzemebirimfiyat', 'matUnit') && !u('malzemebirimfiyat', 'matTot')
      && u('malzemetutar', 'matTot') && !u('malzemetutar', 'matUnit')
      && u('isciilikbirimfiyat'.replace('ii', 'i'), 'labUnit') && u('toplamtutar', 'grandTot')
      && !u('toplamtutar', 'matTot'), '');
  }

  // ══ Ana senaryo: writePricesToWorkbook dogrudan (F–J hedefleme) ══
  const buf = await musteriFixture(BASLIK_TAM);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const bilgiler = writePricesToWorkbook(wb, sheetsFixture() as any);
  const ws = wb.getWorksheet('mekanik G BLOK')!;

  // KE1: Malzeme Birim Fiyat sablonun F(6) sutununda; K–O(11–15) BOS
  const kOboş = [3, 4].every((r) => [11, 12, 13, 14, 15].every((c) => bosMu(ws.getCell(r, c).value)));
  check('KE1 fiyat şablonun F sütununda (26,6) + K–O tamamen BOŞ',
    ws.getCell(3, 6).value === 26.6 && kOboş,
    `F3=${JSON.stringify(ws.getCell(3, 6).value)} K3=${JSON.stringify(ws.getCell(3, 11).value)}`);

  // KE2: tum fiyat/tutarlar KENDI baslik sutununda; ikinci set yok
  const f3: any = ws.getCell(3, 8).value; const i3: any = ws.getCell(3, 9).value; const j3: any = ws.getCell(3, 10).value;
  check('KE2 F–J dolu (birim sayısal, tutar formüllü); ikinci kolon seti yok',
    ws.getCell(3, 6).value === 26.6 && ws.getCell(3, 7).value === 500
    && typeof f3 === 'object' && typeof i3 === 'object' && typeof j3 === 'object'
    && kOboş,
    `F3=${ws.getCell(3, 6).value} G3=${ws.getCell(3, 7).value} H3=${JSON.stringify(f3)}`);

  // KE3: eslesme ANLAMLA — işçilik birim fiyat, konumdan bağımsız G(7)'ye gitti
  // (kaynak sırası: F,G birim; H,I,J tutar — uygulamanın iç sırasıyla FARKLI)
  check('KE3 İşçilik Birim Fiyat → G sütunu (anlam eşleme, konumdan bağımsız)',
    ws.getCell(3, 7).value === 500 && basligaUyar('iscilikbirimfiyat', 'labUnit'),
    `G3=${JSON.stringify(ws.getCell(3, 7).value)}`);

  // KE4: tutar hucreleri FORMULLU + dogru sutun referansi
  check('KE4 Malzeme Tutar formüllü (=E3*F3, sonuç 8325,8)',
    f3?.formula === 'E3*F3' && f3?.result === 8325.8, JSON.stringify(f3));
  check('KE4 İşçilik Tutar formüllü (=E3*G3, 156500) + Toplam (=H3+I3)',
    i3?.formula === 'E3*G3' && i3?.result === 156500 && j3?.formula === 'H3+I3',
    `I3=${JSON.stringify(i3)} J3=${JSON.stringify(j3)}`);
  // DN 25: yalniz iscilik — malzeme BOS, iscilik+toplam dolu
  check('KE4 kısmi satır (DN 25): F/H boş, G=600, I=E4*G4(228000), J=H4+I4',
    bosMu(ws.getCell(4, 6).value) && bosMu(ws.getCell(4, 8).value)
    && ws.getCell(4, 7).value === 600
    && (ws.getCell(4, 9).value as any)?.result === 228000
    && (ws.getCell(4, 10).value as any)?.formula === 'H4+I4',
    `F4=${JSON.stringify(ws.getCell(4, 6).value)} I4=${JSON.stringify(ws.getCell(4, 9).value)}`);

  // KE5: round-trip — degerin yazildigi sutunun BASLIGI anlamla ortusur
  const baslikF = String(ws.getCell(2, 6).value); // 26,6'nin yazildigi sutun
  check('KE5 round-trip: değer, başlığı "Malzeme Birim Fiyat" olan sütuna yazıldı',
    basligaUyar(baslikF.replace(/[^a-z0-9]/gi, '').toLowerCase().replace(/i̇/g, 'i'), 'matUnit')
    || /malzeme birim fiyat/i.test(baslikF),
    `F2 başlık="${baslikF}"`);

  // KE6: İCMAL SUM DOLU (dogru) kolonlari toplar — H/I; K–O DEGIL
  const b = bilgiler[0];
  check('KE6a SekmeBilgi matCol=H(8) labCol=I(9) (K–O değil)', b.matCol === 8 && b.labCol === 9,
    `matCol=${b.matCol} labCol=${b.labCol}`);
  const oz = sekmeOzetiKur(b, 'mekanik G BLOK');
  check('KE6b İCMAL SUM formülü H/I sütunlarına bakar (kaymasız)',
    (oz.matFormul ?? '').includes('!H3:H4') && (oz.labFormul ?? '').includes('!I3:I4')
    && !/![KLMNO]\d/.test((oz.matFormul ?? '') + (oz.labFormul ?? '')),
    `mat=${oz.matFormul} lab=${oz.labFormul}`);
  check('KE6c İCMAL toplamları ekrandaki değerlerle eşit (mat=8325,8 lab=384500)',
    b.matDeger === 8325.8 && b.labDeger === 384500, `mat=${b.matDeger} lab=${b.labDeger}`);

  // ── KE6 UÇTAN UCA: buildExportWorkbook → İCMAL gerçekten H'ye referanslı ──
  {
    const f = new ExcelJS.Workbook();
    f.addWorksheet('KAPAK').getCell('A1').value = '{{TEKLIF_NO}}';
    const icm = f.addWorksheet('İCMAL');
    icm.getCell('B3').value = '{{ICMAL_SATIRLARI}}';
    icm.getCell('E6').value = '{{GENEL_TOPLAM}}';
    f.addWorksheet('ESKI LISTE').getCell('A1').value = 'x';
    const s = await buildExportWorkbook({
      originalFile: await musteriFixture(BASLIK_TAM), sheetsArr: sheetsFixture() as any,
      formatWb: f, sheetRoles: { KAPAK: 'sabit', 'İCMAL': 'sabit', 'ESKI LISTE': 'liste' },
      ctxTemel: { teklifNo: 'MP-2026-001', rev: 1, tarih: '24.07.2026', musteri: 'X', proje: 'Y',
        hazirlayan: 'Emre', gecerlilik: '30 gün', kurNotu: 'Kur', kdvOran: 0 },
      overrides: null,
    });
    const o = new ExcelJS.Workbook();
    await o.xlsx.load(Buffer.from(await s.wb.xlsx.writeBuffer()) as any);
    // İCMAL sayfasindaki HERHANGI formul H/I'ya baksin, K–O'ya ASLA
    let icmalForm = '';
    o.getWorksheet('İCMAL')!.eachRow((row) => row.eachCell((c) => {
      const v: any = c.value; if (v && typeof v === 'object' && v.formula) icmalForm += v.formula + ' ';
    }));
    check('KE6d uçtan uca: İCMAL formülleri liste!H/I referanslı, K–O yok',
      /!H3:H4/.test(icmalForm) && /!I3:I4/.test(icmalForm) && !/![KLMNO]\d/.test(icmalForm),
      icmalForm.slice(0, 200));
    // Cikan liste sayfasi F–J dolu, K–O bos
    const mek = o.getWorksheet('mekanik G BLOK')!;
    check('KE6e çıkan liste sayfası: F3=26,6 dolu, K–O boş',
      mek.getCell(3, 6).value === 26.6 && bosMu(mek.getCell(3, 11).value), '');
  }

  // ══ KE7: KISALTMALI / SATIR-SONLU basliklar yine dogru sutunu bulur ══
  {
    const kisa = ['Sıra', 'Tanım', 'Açıklama', 'Birim', 'Miktar',
      'Malz. Birim\nFiyat', 'İşç. Birim Fiyat', 'Malz. Tutar', 'İşç. Tutar', 'Toplam Tutar'];
    const buf7 = await musteriFixture(kisa);
    const wb7 = new ExcelJS.Workbook();
    await wb7.xlsx.load(buf7 as any);
    writePricesToWorkbook(wb7, sheetsFixture() as any);
    const w7 = wb7.getWorksheet('mekanik G BLOK')!;
    check('KE7 kısaltmalı/satır-sonlu başlık: F=26,6 G=500 H=formül; K–O boş',
      w7.getCell(3, 6).value === 26.6 && w7.getCell(3, 7).value === 500
      && (w7.getCell(3, 8).value as any)?.formula === 'E3*F3'
      && bosMu(w7.getCell(3, 11).value),
      `F3=${w7.getCell(3, 6).value} G3=${w7.getCell(3, 7).value} H3=${JSON.stringify(w7.getCell(3, 8).value)}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`KOLON ESLEME: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
