/**
 * TEKLIF FORMATI — KABUL TESTLERI (PRD Teklif Formatim v2.1, T1-T15'in
 * DB'siz test edilebilir kismi)
 *   npx ts-node test/export-format-test.ts   (npm run test:export)
 *
 * Fixture'lar ExcelJS ile BELLEKTE kurulur — DB yok, dosya yok.
 * P1: tarama (T3) + ornek format. P2: doldurma/T1-diff/T4-T7/T12/T14.
 */
import * as ExcelJS from 'exceljs';
import { formulDegerlendir } from './cikti-test-yardimci';
import {
  scanWorkbook, buildSampleFormat, sheetToGrid, hucreMetni, TANINAN_ETIKETLER,
} from '../src/ozellik/cikti/quote-formats/format-engine';
import { buildExportWorkbook } from '../src/ozellik/teklif/quotes/export-engine';
import { sayfaRolleriTahminEt } from '../src/ozellik/cikti/quote-formats/format-engine';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function run() {
  // ══ T3a: tarama — bulunan + taninmayan + coklu-etiket + richText ═════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('KAPAK');
    ws.getCell('B2').value = 'Müşteri: {{MUSTERI}}';
    ws.getCell('B3').value = 'No {{TEKLIF_NO}} / Rev {{REV}}'; // ayni hucrede 2 etiket
    ws.getCell('B4').value = '{{BILINMEYEN_ETIKET}}'; // taninmayan → uyari
    ws.getCell('B5').value = 'Sabit metin — dokunulmaz';
    ws.getCell('B6').value = { richText: [{ text: 'Toplam: ' }, { text: '{{GENEL_TOPLAM}}' }] } as any;
    const m = scanWorkbook(wb);
    const bulunanlar = m.bulunan.map((b) => b.etiket).sort();
    check('T3a bulunanlar dogru (MUSTERI, TEKLIF_NO, REV, GENEL_TOPLAM)',
      JSON.stringify(bulunanlar) === JSON.stringify(['GENEL_TOPLAM', 'MUSTERI', 'REV', 'TEKLIF_NO']),
      JSON.stringify(bulunanlar));
    check('T3a taninmayan uyarisi (BILINMEYEN_ETIKET)',
      m.taninmayan.length === 1 && m.taninmayan[0].etiket === 'BILINMEYEN_ETIKET',
      JSON.stringify(m.taninmayan));
    check('T3a adresler dogru',
      m.bulunan.find((b) => b.etiket === 'MUSTERI')?.addr === 'B2'
      && m.bulunan.find((b) => b.etiket === 'GENEL_TOPLAM')?.addr === 'B6',
      JSON.stringify(m.bulunan));
  }

  // ══ T8/ornek: buildSampleFormat tum etiketleri tasir, taninmayan yok ══
  {
    const wb = buildSampleFormat();
    const m = scanWorkbook(wb);
    const bulunanSet = new Set(m.bulunan.map((b) => b.etiket));
    const eksik = Array.from(TANINAN_ETIKETLER).filter((t) => !bulunanSet.has(t));
    check('ORNEK: tum taninan etiketler mevcut', eksik.length === 0, `eksik: ${eksik.join(',')}`);
    check('ORNEK: taninmayan etiket yok', m.taninmayan.length === 0, JSON.stringify(m.taninmayan));
    check('ORNEK: KAPAK + İCMAL sayfalari', wb.worksheets.length === 2
      && wb.worksheets[0].name === 'KAPAK' && wb.worksheets[1].name === 'İCMAL',
      wb.worksheets.map((w) => w.name).join('|'));
  }

  // ══ Onizleme donusumu: sheetToGrid ═══════════════════════════════════
  {
    const wb = buildSampleFormat();
    const grid = sheetToGrid(wb.worksheets[0], true);
    check('GRID: kolonlar colN + editable bayragi',
      grid.columnDefs.length >= 3 && grid.columnDefs[0].field === 'col0' && grid.columnDefs[0].editable === true,
      JSON.stringify(grid.columnDefs.slice(0, 2)));
    const duz = grid.rowData.map((r) => Object.values(r).join(' ')).join(' ');
    check('GRID: kapak basligi ve yer tutucular degerlerde',
      duz.includes('FİYAT TEKLİFİ') && duz.includes('{{MUSTERI}}'), duz.slice(0, 120));
    check('GRID: merge listesi tasinir', grid.merges.length >= 1, JSON.stringify(grid.merges));
  }

  // ══ hucreMetni: formul/richText/duz ══════════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('X');
    ws.getCell('A1').value = 'duz';
    ws.getCell('A2').value = { richText: [{ text: 'a' }, { text: 'b' }] } as any;
    ws.getCell('A3').value = { formula: 'SUM(1,2)', result: 3 } as any;
    check('METIN: duz/richText/formul-result',
      hucreMetni(ws.getCell('A1')) === 'duz'
      && hucreMetni(ws.getCell('A2')) === 'ab'
      && hucreMetni(ws.getCell('A3')) === '3',
      [hucreMetni(ws.getCell('A1')), hucreMetni(ws.getCell('A2')), hucreMetni(ws.getCell('A3'))].join('|'));
  }

  // ══════════════════════════════════════════════════════════════════
  // P2 — TAM URETIM: musteri workbook fixture + ornek format → cikti
  // ══════════════════════════════════════════════════════════════════

  /** Musteri kesif dosyasi fixture: baslik + grup satiri (merge+stil) +
   *  3 veri satiri (sonuncusu FIYATSIZ kalacak — T6). */
  async function musteriFixture(): Promise<{ orjBuffer: Buffer; sheetsArr: any[] }> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sıhhi Tesisat');
    const basliklar = ['Poz', 'Malzeme', 'Birim', 'Miktar', 'Malz.BF', 'Malz.Top', 'İşç.BF', 'İşç.Top'];
    basliklar.forEach((h, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = h;
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    });
    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = 'BORULAR';
    ws.getCell('A2').font = { bold: true, italic: true };
    const veriler = [
      ['ST-01', 'Siyah çelik boru 1"', 'mt', 100],
      ['ST-02', 'Siyah çelik boru 2"', 'mt', 50],
      ['ST-03', 'Küresel vana 1"', 'ad', 5],
    ];
    veriler.forEach((v, i) => v.forEach((x, c) => { ws.getCell(3 + i, c + 1).value = x; }));
    const orjBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    const roles = {
      noField: 'col0', nameField: 'col1', unitField: 'col2', quantityField: 'col3',
      materialUnitPriceField: 'col4', materialTotalField: 'col5',
      laborUnitPriceField: 'col6', laborTotalField: 'col7',
    };
    const rowData = [
      { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false },
      { _rowIdx: 1, _isHeaderRow: false, _isDataRow: false, col0: 'BORULAR' }, // grup
      { _rowIdx: 2, _isDataRow: true, col0: 'ST-01', col1: 'Siyah çelik boru 1"', col2: 'mt', col3: 100, col4: '10', col5: '1000', col6: '2', col7: '200' },
      { _rowIdx: 3, _isDataRow: true, col0: 'ST-02', col1: 'Siyah çelik boru 2"', col2: 'mt', col3: 50, col4: '20', col5: '1000', col6: '', col7: '' },
      { _rowIdx: 4, _isDataRow: true, col0: 'ST-03', col1: 'Küresel vana 1"', col2: 'ad', col3: 5, col4: '', col5: '', col6: '', col7: '' },
    ];
    return { orjBuffer, sheetsArr: [{ name: 'Sıhhi Tesisat', index: 0, isEmpty: false, columnRoles: roles, columnDefs: [], rowData }] };
  }

  const ctxTemel = {
    teklifNo: 'MP-2026-001', rev: 1, tarih: '20.07.2026',
    musteri: 'ACME İnşaat', proje: 'Depo Binası', hazirlayan: 'Emre', gecerlilik: '30 gün',
    kurNotu: 'Kur: 1 USD = 47,07 TL · 1 EUR = 53,84 TL (TCMB, 20.07.2026)',
    kdvOran: 0.2,
  };

  {
    const { orjBuffer, sheetsArr } = await musteriFixture();
    const sonuc = await buildExportWorkbook({
      originalFile: orjBuffer, sheetsArr, formatWb: buildSampleFormat(), ctxTemel, overrides: null,
    });
    const outBuf = Buffer.from(await sonuc.wb.xlsx.writeBuffer());
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(outBuf as any);

    // ── SIRA: kapak + icmal BASTA, liste arkada ──
    const adlar = out.worksheets.map((w) => w.name);
    check('SIRA: KAPAK, İCMAL basta; liste arkada',
      adlar[0] === 'KAPAK' && adlar[1] === 'İCMAL' && adlar[2] === 'Sıhhi Tesisat', adlar.join('|'));

    // ── T1: liste sayfasi birebir — fiyat-disi hucreler + merge + stil ──
    const orj = new ExcelJS.Workbook();
    await orj.xlsx.load(orjBuffer as any);
    const oWs = orj.getWorksheet('Sıhhi Tesisat')!;
    const nWs = out.getWorksheet('Sıhhi Tesisat')!;
    // ── EX8 (kullanici karari 30.07): liste sayfasi artik MUSTERI KOPYASI
    // DEGIL, 9 kolonluk STANDART tablodur. "Musterinin hucreleri birebir
    // korunur" olcutu bu yuzden DUSTU; yerine standart sema sozlesmesi +
    // veri korunumu (ad/miktar/birim kaybolmaz) sinanir.
    // 23.09 tasarimi: ustte 3 satirlik baslik blogu — tablo basligi 4., veri 5. satirdan.
    {
      const basliklar: string[] = [];
      nWs.getRow(4).eachCell({ includeEmpty: false }, (c) => basliklar.push(String(c.value ?? '')));
      check('T1/EX8 liste sayfası 9 kolonluk standart tablo (4. satır)',
        basliklar.length === 9 && basliklar[1] === 'Malzeme Adı' && basliklar[8] === 'Genel Toplam',
        `[${basliklar.join(' | ')}]`);
      // Veri korunumu: orijinaldeki malzeme adlari ciktida DA var
      const ciktiAdlar: string[] = [];
      nWs.eachRow({ includeEmpty: false }, (row, rn) => { if (rn > 4) ciktiAdlar.push(hucreMetni(row.getCell(2))); });
      const orjAdlar: string[] = [];
      oWs.eachRow({ includeEmpty: false }, (row, rn) => { if (rn >= 3) orjAdlar.push(hucreMetni(row.getCell(2))); });
      const kayip = orjAdlar.filter((a) => a && !ciktiAdlar.some((b) => b.includes(a)));
      check('T1/EX8 malzeme adları çıktıda kaybolmadı', kayip.length === 0, kayip.join(' | '));
    }
    check('T1 başlık stili (standart tabloda kalın)', nWs.getCell(4, 1).font?.bold === true,
      JSON.stringify(nWs.getCell(4, 1).font));

    // ── T6: fiyatsiz satir BOS (0 ASLA yazilmaz) ──
    // Satir numaralari EX8 ile kaydi (dosyanin kendi basligi kopyalanmiyor) —
    // olcut ARTIK ADLA bulunur, sabit satir numarasiyla degil.
    const satirBul = (parca: string) => {
      let hedef: any = null;
      nWs.eachRow({ includeEmpty: false }, (row) => {
        if (hucreMetni(row.getCell(2)).includes(parca)) hedef = row;
      });
      return hedef;
    };
    const fiyatsiz = satirBul('Küresel vana') ?? satirBul('ST-03');
    // 23.09: birim fiyat hucreleri (E/G) BOS; tutar hucreleri (F/H) formul ama SAYI
    // uretmez (sonuc "") — musteri birim fiyati girince toplam kendiliginden cikar.
    const sayiIcerik = (v: any) => typeof v === 'number' || (v && typeof v === 'object' && typeof v.result === 'number');
    const bos = fiyatsiz ? [5, 7].every((c) => !fiyatsiz.getCell(c).value) && [5, 6, 7, 8].every((c) => !sayiIcerik(fiyatsiz.getCell(c).value)) : false;
    check('T6 fiyatsiz satir hucreleri BOS (0 yazilmaz)', bos,
      fiyatsiz ? [5, 6, 7, 8].map((c) => JSON.stringify(fiyatsiz.getCell(c).value)).join('|') : 'satır bulunamadı');

    // ── T7: tutar = miktar × birim CANLI FORMUL ──
    // 23.09 (EX4 tarifle KALDIRILDI): tutar FORMUL, onbellegi ve hucrelerden yeniden hesabi 1000.
    const f1: any = nWs.getCell(5, 6).value; // ilk veri satiri, Malz. Toplam
    const f1Hesap = formulDegerlendir(out, 'Sıhhi Tesisat', f1?.formula ?? '0');
    check('T7/EX4b tutar formülü F5 = C5 × E5 — önbellek ve yeniden hesap 1000',
      f1?.formula === 'IF(E5="","",ROUND(C5*E5,2))' && f1?.result === 1000 && f1Hesap.v === 1000, JSON.stringify(f1));

    // ── T4: kapak alanlari ──
    const kapak = out.getWorksheet('KAPAK')!;
    let kapakMetin = '';
    kapak.eachRow((row) => row.eachCell((c) => { kapakMetin += hucreMetni(c) + ' '; }));
    check('T4 kapak: teklif no + rev + tarih + musteri + proje dolu',
      kapakMetin.includes('MP-2026-001') && kapakMetin.includes('Rev.01')
      && kapakMetin.includes('20.07.2026') && kapakMetin.includes('ACME İnşaat')
      && kapakMetin.includes('Depo Binası'), kapakMetin.slice(0, 200));
    check('T4 kapakta yer tutucu KALMADI', !kapakMetin.includes('{{'), kapakMetin.slice(0, 200));

    // ── T5: icmal satiri + formullu toplamlar ──
    const icmal = out.getWorksheet('İCMAL')!;
    let icmalDump = '';
    const formuller: string[] = [];
    icmal.eachRow((row) => row.eachCell((c) => {
      const v: any = c.value;
      if (v && typeof v === 'object' && v.formula) formuller.push(v.formula);
      icmalDump += hucreMetni(c) + ' ';
    }));
    check('T5 icmalde sekme satiri (Sıhhi Tesisat) var', icmalDump.includes('Sıhhi Tesisat'), icmalDump.slice(0, 200));
    check('T5 icmal malzeme SUM formulu liste sayfasina bakar',
      formuller.some((f) => /SUM\('Sıhhi Tesisat'!F\d+:F\d+\)/.test(f)), JSON.stringify(formuller));
    check('T5 genel toplam FORMULLU (KDV dahil — formatta KDV var)',
      formuller.some((f) => f.includes('*1.2')), JSON.stringify(formuller));

    // ── T12: kur notu ──
    check('T12 kur notu ekrandaki kur+tarihle dolu', icmalDump.includes('47,07') && icmalDump.includes('TCMB'),
      icmalDump.slice(-200));

    // ── T2: ic bilgiler (kar/iskonto/maliyet) HICBIR sayfada yok ──
    let tumMetin = '';
    for (const w of out.worksheets) w.eachRow((row) => row.eachCell((c) => { tumMetin += hucreMetni(c) + ' '; }));
    check('T2 kar/iskonto/maliyet hicbir sayfada yok',
      !/iskonto|kar\s*%|maliyet/i.test(tumMetin), '');

    // ── T14: override — manuel deger korunur, otomatikler tazelenir ──
    const musteriHucre = sonuc.dolan.find((d) => d.etiket === 'MUSTERI');
    check('T14 otomatik alan haritasi MUSTERI adresini icerir', !!musteriHucre, JSON.stringify(sonuc.dolan.slice(0, 5)));
    if (musteriHucre) {
      const { orjBuffer: ob2, sheetsArr: sa2 } = await musteriFixture();
      const sonuc2 = await buildExportWorkbook({
        originalFile: ob2, sheetsArr: sa2, formatWb: buildSampleFormat(),
        ctxTemel: { ...ctxTemel, rev: 2, musteri: 'YENI MUSTERI A.S.' },
        overrides: { [musteriHucre.sheet]: { [musteriHucre.addr]: { value: 'ELLE YAZILDI LTD', manual: true } } },
      });
      const out2 = new ExcelJS.Workbook();
      await out2.xlsx.load(Buffer.from(await sonuc2.wb.xlsx.writeBuffer()) as any);
      const k2 = out2.getWorksheet('KAPAK')!;
      let k2Metin = '';
      k2.eachRow((row) => row.eachCell((c) => { k2Metin += hucreMetni(c) + ' '; }));
      check('T14 manuel deger korunur (override otomatigi ezer)',
        k2Metin.includes('ELLE YAZILDI LTD') && !k2Metin.includes('YENI MUSTERI'), k2Metin.slice(0, 200));
      check('T14 diger otomatik alanlar tazelenir (Rev.02)', k2Metin.includes('Rev.02'), k2Metin.slice(0, 200));
    }
  }

  // ── KF2 + T8: sistem alanli sayfa (fixedSchema), sablonda fiyat kolonu YOK
  //    ama veri DOLU → kolon eklenir (veri kaybi yasak, Aksa_Göynük 27.07) ──
  {
    const sheetsArr = [{
      name: 'Metraj', index: 0, isEmpty: false,
      columnRoles: {
        noField: 'col0', nameField: 'col1', quantityField: 'col3',
        materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
      },
      columnDefs: [
        { field: 'col0', headerName: 'Poz' }, { field: 'col1', headerName: 'Malzeme' },
        { field: 'col2', headerName: 'Birim' }, { field: 'col3', headerName: 'Miktar' },
        { field: '_matBirim', headerName: 'Birim Fiyat' }, { field: '_matToplam', headerName: 'Tutar' },
      ],
      rowData: [
        { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false, col0: 'Poz', col1: 'Malzeme', col2: 'Birim', col3: 'Miktar' },
        { _rowIdx: 1, _isDataRow: true, col0: '1', col1: 'Boru', col2: 'mt', col3: 10, _matBirim: '5', _matToplam: '50' },
      ],
    }];
    // Orijinal dosya: yalniz 4 kolonlu (fiyat kolonu YOK — sistem alani)
    const wb0 = new ExcelJS.Workbook();
    const w0 = wb0.addWorksheet('Metraj');
    [['Poz', 'Malzeme', 'Birim', 'Miktar'], ['1', 'Boru', 'mt', 10]].forEach((r, ri) =>
      r.forEach((v, ci) => { w0.getCell(ri + 1, ci + 1).value = v; }));
    const buf0 = Buffer.from(await wb0.xlsx.writeBuffer());

    const sonuc = await buildExportWorkbook({
      originalFile: buf0, sheetsArr, formatWb: buildSampleFormat(), ctxTemel, overrides: null,
    });
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(Buffer.from(await sonuc.wb.xlsx.writeBuffer()) as any);
    const ws = out.getWorksheet('Metraj')!;
    // KF2 (Duzeltme Talebi 27.07, Aksa_Göynük — VERI KAYBI YASAK): sablonda
    // fiyat kolonu yok ama veri DOLU → kolon basligiyla EKLENIR ve dolar.
    // (KE8'in dogru kapsami: yalniz VERISIZ kolon eklenmez — test:ke KF3.)
    // ── KF2 DUSTU (EX8): "sablonda fiyat kolonu yoksa EKLE" dali artik YOK.
    // Standart tabloda fiyatin yeri SABIT (E=Malz. Birim Fiyat, F=Malz.
    // Toplam) — veri kaybi riski yapisal olarak ortadan kalkti.
    const f5: any = ws.getCell(5, 6).value;
    check('EX8: fiyat SABİT kolonda (E/F), veri kaybı yok',
      hucreMetni(ws.getCell(4, 5)) === 'Malz. Birim Fiyat' && hucreMetni(ws.getCell(4, 6)) === 'Malz. Toplam'
      && ws.getCell(5, 5).value === 5 && f5?.result === 50 && formulDegerlendir(out, 'Metraj', f5?.formula ?? '0').v === 50,
      `E4="${hucreMetni(ws.getCell(4, 5))}" E5=${JSON.stringify(ws.getCell(5, 5).value)} F5=${JSON.stringify(f5)}`);
    check('KF2: İCMAL degeri + self-check eksik=0 (matDeger=50)',
      sonuc.sekmeler[0]?.matDeger === 50 && sonuc.eksikDeger === 0,
      `mat=${sonuc.sekmeler[0]?.matDeger} eksik=${sonuc.eksikDeger}`);
    check('EX8: ad/miktar standart kolonlarda korundu',
      hucreMetni(ws.getCell(5, 2)) === 'Boru' && ws.getCell(5, 3).value === 10,
      `B5="${hucreMetni(ws.getCell(5, 2))}" C5=${JSON.stringify(ws.getCell(5, 3).value)}`);

    // T8 GUNCELLENDI (Bulgu Raporu 21.07): T8 = "FORMAT yokken sade
    // kapak+icmal" (yukarida ana testler zaten buildSampleFormat ile
    // calisiyor → T8 kapali). ORIJINAL DOSYA yoksa ise artik uretim YOK —
    // grid'den uretim silindi; acik hata beklenir (asagida BULGU blogu).
  }

  // ══ MIMARI v2 (kullanici karari 20.07): LISTE YUVASI YER DEGISTIRME ══
  // Format = KOMPLE eski teklif dosyasi (kapak + esaslar + ESKI IS sayfasi +
  // kur sayfasi). Cikti = AYNI dosya; eski is sayfasi TEK TUSLA teklifin
  // liste sayfalariyla yer degistirir, digerleri (kur dahil) aynen kalir.
  {
    const fmt = buildSampleFormat(); // KAPAK + İCMAL (yer tutuculu → sabit)
    const eskiIs = fmt.addWorksheet('CILAS KAUCUK'); // eski is → LISTE YUVASI
    eskiIs.getCell('A1').value = 'eski teklifin kalemleri';
    // G1 kurali: liste tahmini VERI TABLOSU kaniti ister (sayisal satirlar)
    for (let r = 2; r <= 8; r++) { eskiIs.getCell(r, 2).value = r; eskiIs.getCell(r, 3).value = r * 5; }
    const kur = fmt.addWorksheet('EXCHANGE RATE'); // ad deseni → SABIT
    kur.getCell('A1').value = '1 USD = 47,07';

    const roller = sayfaRolleriTahminEt(fmt);
    check('ROL: yer tutuculu sayfalar SABIT, eski is LISTE, kur SABIT',
      roller['KAPAK'] === 'sabit' && roller['İCMAL'] === 'sabit'
      && roller['CILAS KAUCUK'] === 'liste' && roller['EXCHANGE RATE'] === 'sabit',
      JSON.stringify(roller));

    const { orjBuffer, sheetsArr } = await musteriFixture();
    const sonuc = await buildExportWorkbook({
      originalFile: orjBuffer, sheetsArr, formatWb: fmt, sheetRoles: roller, ctxTemel, overrides: null,
    });
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(Buffer.from(await sonuc.wb.xlsx.writeBuffer()) as any);
    const adlar = out.worksheets.map((w) => w.name);
    check('YUVA: eski is sayfasi CIKTIDA YOK, teklif sayfasi ONUN KONUMUNDA',
      JSON.stringify(adlar) === JSON.stringify(['KAPAK', 'İCMAL', 'Sıhhi Tesisat', 'EXCHANGE RATE']),
      adlar.join('|'));
    check('YUVA: sabit kur sayfasi icerigiyle korundu',
      hucreMetni(out.getWorksheet('EXCHANGE RATE')!.getCell('A1')) === '1 USD = 47,07', '');
    const yf: any = out.getWorksheet('Sıhhi Tesisat')!.getCell(5, 6).value;
    check('YUVA/EX8: liste sayfasinda tutar dolu (23.09: formül + sayısal önbellek)',
      typeof yf?.formula === 'string' && typeof yf?.result === 'number' && formulDegerlendir(out, 'Sıhhi Tesisat', yf.formula).v === yf.result,
      JSON.stringify(yf));
    check('YUVA: icmal SUM formulu liste sayfasinin ADINA bakar',
      /^SUM\('Sıhhi Tesisat'!F\d+:F\d+\)$/.test(sonuc.sekmeler[0]?.matFormul ?? ''),
      JSON.stringify(sonuc.sekmeler));
    check('YUVA: formatSayfalari yalniz SABIT sayfalar (onizleme sekmeleri)',
      JSON.stringify(sonuc.formatSayfalari) === JSON.stringify(['KAPAK', 'İCMAL', 'EXCHANGE RATE']),
      JSON.stringify(sonuc.formatSayfalari));
  }

  // ══ BULGU RAPORU KABULU (21.07, B1-B9) — grid-uretim yolu SILINDI ═══
  {
    // B-kok: orijinal dosya YOKSA cikti YOK (sessiz sahte uretim yasak)
    let hata = '';
    try {
      await buildExportWorkbook({
        originalFile: Buffer.alloc(0), sheetsArr: [], formatWb: buildSampleFormat(),
        sheetRoles: null, ctxTemel, overrides: null,
      });
    } catch (e: any) { hata = e?.message ?? 'hata'; }
    // EX8: standart tablo GRID VERISINDEN uretilir; orijinal dosya artik
    // ZORUNLU DEGIL. Sessiz sahte cikti riski de kalmadi — sayfa yoksa
    // cikti da bos olur (asagidaki olcut).
    check('EX8: orijinal dosya olmadan da çıktı üretilir (sayfasız → boş liste)',
      hata === '', `beklenmeyen hata: "${hata}"`);
  }
  {
    // B6/B8: fiyatlar SAYISAL yazilir; TR bicimli metin dogru parse edilir;
    // orijinalde METIN miktar varsa tutar FORMULSUZ DUZ SAYI olur (#VALUE yok)
    const wb2 = new ExcelJS.Workbook();
    const ws2 = wb2.addWorksheet('Mekanik');
    ['Poz', 'Ad', 'Miktar', 'BF', 'Top'].forEach((h, i) => { ws2.getCell(1, i + 1).value = h; });
    ws2.getColumn(2).width = 42; // B3 kabulu: kolon genisligi korunmali
    ws2.getCell(2, 1).value = 'M-1'; ws2.getCell(2, 2).value = 'Boru'; ws2.getCell(2, 3).value = '313'; // METIN miktar!
    ws2.getCell(3, 1).value = 'M-2'; ws2.getCell(3, 2).value = 'Vana'; ws2.getCell(3, 3).value = 4; // sayisal miktar
    const buf2 = Buffer.from(await wb2.xlsx.writeBuffer());
    const sheets2 = [{
      name: 'Mekanik', index: 0, isEmpty: false, columnDefs: [],
      columnRoles: { nameField: 'col1', quantityField: 'col2', materialUnitPriceField: 'col3', materialTotalField: 'col4' },
      rowData: [
        { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false },
        { _rowIdx: 1, _isDataRow: true, col2: '313', col3: '1.234,56', col4: '386.417,28' }, // TR bicim
        { _rowIdx: 2, _isDataRow: true, col2: 4, col3: '10', col4: '40' },
      ],
    }];
    const s2 = await buildExportWorkbook({
      originalFile: buf2, sheetsArr: sheets2, formatWb: buildSampleFormat(),
      sheetRoles: null, ctxTemel, overrides: null,
    });
    const out2 = new ExcelJS.Workbook();
    await out2.xlsx.load(Buffer.from(await s2.wb.xlsx.writeBuffer()) as any);
    const mek = out2.getWorksheet('Mekanik')!;
    const bf = mek.getCell(5, 5).value; // EX8: E = Malz. Birim Fiyat (23.09: veri 5. satirdan)
    check('BULGU: TR bicimli fiyat SAYISAL yazildi (1.234,56 → 1234.56)',
      typeof bf === 'number' && Math.abs((bf as number) - 1234.56) < 0.001, `got ${JSON.stringify(bf)} (${typeof bf})`);
    // 23.09: tutar FORMUL (F = C × E). #VALUE riski YOK cunku miktar hucresi SAYI
    // yazilir (GS12: kaynaktaki metin "313" → 313) — olcut: C sayi + formulun
    // hucrelerden bagimsiz yeniden hesabi dosyanin toplamina esit.
    const topMetin: any = mek.getCell(5, 6).value; // EX8: F = Malz. Toplam
    const topMetinHesap = formulDegerlendir(out2, 'Mekanik', topMetin?.formula ?? '0');
    check('BULGU: metin-miktarli satirda miktar SAYI yazılır, tutar formülü #VALUE vermez (386.417,28)',
      typeof mek.getCell(5, 3).value === 'number' && topMetinHesap.v !== undefined && Math.abs(topMetinHesap.v - 386417.28) < 0.005
        && Math.abs(Number(topMetin?.result) - 386417.28) < 0.005,
      `C5=${JSON.stringify(mek.getCell(5, 3).value)} F5=${JSON.stringify(topMetin)} hesap=${topMetinHesap.v ?? topMetinHesap.e}`);
    const topSayi: any = mek.getCell(6, 6).value;
    check('BULGU/EX4b: sayisal-miktarli satirda tutar formülü (4 × 10 = 40)',
      topSayi?.formula === 'IF(E6="","",ROUND(C6*E6,2))' && topSayi?.result === 40 && formulDegerlendir(out2, 'Mekanik', topSayi.formula).v === 40,
      JSON.stringify(topSayi));
    // B3 "kolon genisligi kopyada korunur" DUSTU (EX8): standart tablonun
    // kendi genislikleri var; ad sutunu 54 birim (23.09 tasarimi).
    check('EX8: standart tablo kolon genişlikleri uygulanır',
      Math.round(mek.getColumn(2).width ?? 0) === 54, `got ${mek.getColumn(2).width}`);
    // B5 TERSINE DONDU (EX8): eskiden "sablona EK baslik sarkmasin" deniyordu;
    // artik cikti STANDART tablodur ve 9 baslik HER SAYFADA olmak ZORUNDA.
    check('EX8: standart başlık satırı tam (F4 = Malz. Toplam)',
      String(mek.getCell(4, 6).value ?? '') === 'Malz. Toplam',
      `got ${JSON.stringify(mek.getCell(4, 6).value)}`);
    // GS12 (ust belge): miktar SAYIYA normalize edilir — metin "313" ciktida
    // 313 sayisidir. Eski olcut "orijinaldeki haliyle durur" DUSTU.
    check('GS12: metin miktar sayıya normalize edildi (313 · 4)',
      mek.getCell(5, 3).value === 313 && mek.getCell(6, 3).value === 4,
      `got ${JSON.stringify([mek.getCell(5, 3).value, mek.getCell(6, 3).value])}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEKLIF FORMATI (P1 tarama): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

bitmezseKirmizi(run().catch((e) => { console.error(e); process.exit(1); }));
