/**
 * KOLON ESLEME — KABUL TESTLERI (Duzeltme Talepleri 24.07):
 *  KE1-KE7: "fiyatlar sablonun F–J kolonlari yerine K–O'ya kayiyor" —
 *   fixedSchema sistem alanlari (_matBirim vb.) SABLONUN KENDI fiyat
 *   sutununa BASLIK ANLAMIYLA yazilir, ikinci kolon seti URETILMEZ.
 *  KE8-KE11: "sablonda olmayan kolon ekleniyor" — sablonda karsiligi
 *   olmayan fiyat kolonu ASLA eklenmez (append yasak; malzeme-only kesifte
 *   iscilik verisi yazilmaz, musteri duzeni bilerek kurmus).
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

/** iscilikVar=false → UYMZ gercegi: malzeme-only kesif, iscilik HIC girilmemis
 *  (KE8/KF3 senaryosu — verisiz kolon dayatilmaz). */
function sheetsFixture(iscilikVar = true) {
  const L = (v: string) => (iscilikVar ? v : '');
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
        _matBirim: '26,6', _matToplam: '8325,8', _labBirim: L('500'), _labToplam: L('156500'),
        _toplam: iscilikVar ? '164825,8' : '8325,8' },
      { _rowIdx: 3, _isDataRow: true, col0: '2', col1: 'DN 25', col3: 'metre', col4: 380,
        _matBirim: '', _matToplam: '', _labBirim: L('600'), _labToplam: L('228000'),
        _toplam: iscilikVar ? '228000' : '' },
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

  // KE10: iscilik kolonlari VAR (F_G sablonu) → degerler O kolonlara yazildi
  // (append degil, eslesme) — ana senaryonun acik adlandirilmis kaniti.
  check('KE10 işçilik kolonlu şablon: İşç. değerleri G/I sütunlarında, ek kolon yok',
    ws.getCell(3, 7).value === 500 && (ws.getCell(3, 9).value as any)?.result === 156500
    && !ws.getCell(2, 11).value, '');

  // KE11a: genel toplam SABLONUN KENDI Toplam Tutar sutununa (J) yazildi
  check('KE11a genel toplam şablonun J sütununda (=H3+I3), uydurma kolon yok',
    j3?.formula === 'H3+I3' && bosMu(ws.getCell(2, 11).value), JSON.stringify(j3));

  // ══ KE8/KE9: MALZEME-ONLY sablon (UYMZ ikizi) — iscilik kolonu YOK ve
  // iscilik VERISI de yok (gercek UYMZ: iscilik hic girilmemisti) →
  // verisiz kolon EKLENMEZ (KF3), turetilmis Toplam da uretilmez (KE11).
  {
    const BASLIK_MALZ = ['SIRA', 'İŞİN TANIMI', 'AÇIKLAMA', 'BİRİM', 'MİKTAR',
      'PURSANTAJ', 'MARKA', 'NOT', 'MALZEME BİRİM FİYATI', 'MALZEME TOPLAM FİYATI'];
    const buf9 = await musteriFixture(BASLIK_MALZ);
    const wb9 = new ExcelJS.Workbook();
    await wb9.xlsx.load(buf9 as any);
    const bilgi9 = writePricesToWorkbook(wb9, sheetsFixture(false) as any);
    const w9 = wb9.getWorksheet('mekanik G BLOK')!;

    // KE9: yalniz malzeme kolonlari dolar — I=birim, J=formullu toplam
    const j9: any = w9.getCell(3, 10).value;
    check('KE9 malzeme-only şablon: I3=26,6 · J3==E3*I3 (8325,8)',
      w9.getCell(3, 9).value === 26.6 && j9?.formula === 'E3*I3' && j9?.result === 8325.8,
      `I3=${JSON.stringify(w9.getCell(3, 9).value)} J3=${JSON.stringify(j9)}`);

    // KE8/KF3: iscilik VERISI yok → kolon EKLENMEDI; K..O tamamen bos
    const sagTemiz = [2, 3, 4].every((r) =>
      [11, 12, 13, 14, 15].every((c) => bosMu(w9.getCell(r, c).value)));
    check('KE8/KF3 verisiz İşçilik kolonu eklenmedi; sağ taraf tamamen temiz',
      sagTemiz, [11, 12, 13].map((c) => JSON.stringify(w9.getCell(2, c).value)).join('|'));

    // KE11b: turetilmis Toplam kolonu uretilmedi; İCMAL malzeme degeri birikti
    check('KE11b ayrı Toplam kolonu üretilmedi; İCMAL mat=8325,8 (self-check: beklenen==yazılan)',
      bilgi9[0].labCol === null && bilgi9[0].matDeger === 8325.8
      && bilgi9[0].beklenen === bilgi9[0].yazilan && bilgi9[0].beklenen === 2,
      JSON.stringify(bilgi9[0]));
  }

  // ══ KF1-KF7: AKSA_GÖYNÜK ikizi — YENI dosya, sablonda MALZEME kolonu HIC
  // yok (yalniz İŞÇİLİK basliklari), baslik ~12. satirda, mukerrer MİKTAR +
  // adsiz kolon. Uygulamada dolu malzeme fiyatlari ciktida KAYBOLMAMALI:
  // kolon sag uca basligiyla EKLENIR (KF2); verisiz iscilik dayatilmaz (KF3).
  {
    const wbA = new ExcelJS.Workbook();
    const wsA = wbA.addWorksheet('TEKLİF');
    // 1-11: kapak/karisik satirlar (bosluklu) — dagitilmis baslik toleransi
    wsA.getCell('B2').value = 'AKSA GÖYNÜK YSS PROJESİ';
    // 12: baslik satiri — C ve D MUKERRER 'MİKTAR', E ADSIZ (Sütun 119 ikizi)
    ['I', 'AÇIKLAMA', 'MİKTAR', 'MİKTAR', '', 'İŞÇİLİK BİRİM FİYAT', 'İŞÇİLİK TOPLAM FİYAT']
      .forEach((h, i) => { if (h) { const c = wsA.getCell(12, i + 1); c.value = h; c.font = { bold: true }; } });
    wsA.getCell(13, 1).value = '1'; wsA.getCell(13, 2).value = '6"- DN150 Siyah Çelik Boru';
    wsA.getCell(13, 3).value = 30; wsA.getCell(13, 4).value = 'Metre';
    wsA.getCell(14, 1).value = '2'; wsA.getCell(14, 2).value = '4"- DN100 Siyah Çelik Boru';
    wsA.getCell(14, 3).value = 6; wsA.getCell(14, 4).value = 'Metre';
    const bufA = Buffer.from(await wbA.xlsx.writeBuffer());

    const bosSatir = (i: number) => ({ _rowIdx: i, _isHeaderRow: false, _isDataRow: false });
    const sheetsA: any[] = [{
      name: 'TEKLİF', index: 0, isEmpty: false,
      columnRoles: { noField: 'col0', nameField: 'col1', quantityField: 'col2', unitField: 'col3',
        materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
        laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam', grandTotalField: '_toplam' },
      columnDefs: [
        { field: '_matBirim', headerName: 'Malz. Birim Fiyat' },
        { field: '_matToplam', headerName: 'Malz. Toplam' },
      ],
      rowData: [
        ...Array.from({ length: 11 }, (_, i) => bosSatir(i)),
        { _rowIdx: 11, _isHeaderRow: true, _isDataRow: false },
        { _rowIdx: 12, _isDataRow: true, col0: '1', col1: '6"- DN150 Siyah Çelik Boru', col2: 30, col3: 'Metre',
          _matBirim: '939,9', _matToplam: '28.197,0', _labBirim: '', _labToplam: '', _toplam: '28.197,0' },
        { _rowIdx: 13, _isDataRow: true, col0: '2', col1: '4"- DN100 Siyah Çelik Boru', col2: 6, col3: 'Metre',
          _matBirim: '558,2', _matToplam: '3.349,2', _labBirim: '', _labToplam: '', _toplam: '3.349,2' },
      ],
    }];

    const wbT = new ExcelJS.Workbook();
    await wbT.xlsx.load(bufA as any);
    const bilgiA = writePricesToWorkbook(wbT, sheetsA);
    const wT = wbT.getWorksheet('TEKLİF')!;

    // KF2: malzeme kolonlari SAG UCA eklendi (H=birim, I=toplam; baslik 12. satirda)
    check('KF2 malzeme kolonu yok + dolu veri → H/I eklendi (başlık 12. satır, bold)',
      String(wT.getCell(12, 8).value) === 'Malz. Birim Fiyat' && wT.getCell(12, 8).font?.bold === true
      && String(wT.getCell(12, 9).value) === 'Malz. Toplam',
      `H12=${JSON.stringify(wT.getCell(12, 8).value)} I12=${JSON.stringify(wT.getCell(12, 9).value)}`);

    // KF1: degerler uygulamayla birebir + tutar formullu (=C13*H13)
    const i13: any = wT.getCell(13, 9).value;
    check('KF1 fiyatlar dosyada: H13=939,9 · I13==C13*H13 (28.197) · H14=558,2',
      wT.getCell(13, 8).value === 939.9 && i13?.formula === 'C13*H13' && i13?.result === 28197
      && wT.getCell(14, 8).value === 558.2,
      `H13=${JSON.stringify(wT.getCell(13, 8).value)} I13=${JSON.stringify(i13)}`);

    // KF1: GENEL TOPLAM dosya degerlerinden turetilebilir (İCMAL degeri dogru)
    check('KF1 SekmeBilgi toplamı uygulamayla eşit (28.197+3.349,2=31.546,2)',
      Math.abs(bilgiA[0].matDeger - 31546.2) < 0.01, `matDeger=${bilgiA[0].matDeger}`);

    // KF3: verisiz İŞÇİLİK sablon kolonlari (F/G) BOS kaldi; EK iscilik
    // kolonu da uretilmedi (J'den sonrasi temiz)
    check('KF3 verisiz İşçilik: F/G boş, fazladan kolon yok (J+ temiz)',
      bosMu(wT.getCell(13, 6).value) && bosMu(wT.getCell(13, 7).value)
      && bosMu(wT.getCell(12, 10).value) && bosMu(wT.getCell(13, 10).value), '');

    // KF6: self-check — dolu 4 deger (2 satir × birim+tutar), 4'ü de yazildi
    check('KF6 self-check: beklenen=4, yazılan=4 (sessiz kayıp yok)',
      bilgiA[0].beklenen === 4 && bilgiA[0].yazilan === 4, JSON.stringify(bilgiA[0]));

    // KF5: AYNI workbook'a IKINCI yazim — eklenen baslik artik ANLAMLA
    // bulunur, IKINCI set eklenmez (kolon sayisi sabit, ayni hucreler)
    writePricesToWorkbook(wbT, sheetsA);
    check('KF5 tekrar export: aynı kolonlar, ikinci set yok (J+ hâlâ temiz)',
      wT.getCell(13, 8).value === 939.9 && bosMu(wT.getCell(12, 10).value)
      && bosMu(wT.getCell(12, 11).value), '');

    // KF7: TEKLIF FORMATI yolu AYNI motor — kopyalanan liste sayfasinda
    // eklenen kolonlar + degerler + İCMAL SUM eklenen kolona bakar; eksik 0
    const f = new ExcelJS.Workbook();
    f.addWorksheet('KAPAK').getCell('A1').value = '{{TEKLIF_NO}}';
    const icmF = f.addWorksheet('İCMAL');
    icmF.getCell('B3').value = '{{ICMAL_SATIRLARI}}';
    f.addWorksheet('ESKI').getCell('A1').value = 'x';
    const s = await buildExportWorkbook({
      originalFile: bufA, sheetsArr: sheetsA, formatWb: f,
      sheetRoles: { KAPAK: 'sabit', 'İCMAL': 'sabit', ESKI: 'liste' },
      ctxTemel: { teklifNo: 'MP-2026-002', rev: 1, tarih: '27.07.2026', musteri: 'AKSA', proje: 'GÖYNÜK',
        hazirlayan: 'Emre', gecerlilik: '30 gün', kurNotu: 'Kur', kdvOran: 0 },
      overrides: null,
    });
    const o = new ExcelJS.Workbook();
    await o.xlsx.load(Buffer.from(await s.wb.xlsx.writeBuffer()) as any);
    const oT = o.getWorksheet('TEKLİF')!;
    check('KF7 teklif-format yolu: eklenen kolon + değerler kopyada, eksikDeger=0',
      oT.getCell(13, 8).value === 939.9 && s.eksikDeger === 0
      && (s.sekmeler[0]?.matFormul ?? '').includes('!I13:I14'),
      `H13=${JSON.stringify(oT.getCell(13, 8).value)} eksik=${s.eksikDeger} mat=${s.sekmeler[0]?.matFormul}`);
  }

  // ══ KG1-KG8: EMO AYVAZ ikizi — ONCEDEN FIYATLI kaynak dosya ══════════
  // Sablon $-formatli, eski fiyat/formuller icinde; MİKTAR/BİRİM basliklari
  // TERS (E='mt', F=70). Kurallar: K-A hayalet temizligi, K-B toplam her
  // kosulda formulle (stale 798 ezilir), K-C TL bicimi, K-D hata artisi 0.
  {
    const USD = '#,##0.00"USD"';
    const wbE = new ExcelJS.Workbook();
    const wsE = wbE.addWorksheet('CİLAS KAUÇUK');
    ['NO', 'PROJE KOD', 'MARKA MODEL', 'MALZEMENİN CİNSİ', 'MİKTAR', 'BİRİM',
      'MALZ. BİRİM FİYAT ($)', 'MALZ. TOPLAM FİYAT ($)', 'İŞÇİLİK BİRİM FİYAT ($)', 'İŞÇİLİK TOPLAM FİYAT ($)']
      .forEach((h, i) => { const c = wsE.getCell(12, i + 1); c.value = h; c.font = { bold: true }; });
    // r13: kullanicinin fiyat GIRDIGI satir — dosyada ESKI fiyat+formul var
    wsE.getCell(13, 4).value = '4" Siyah Boru'; wsE.getCell(13, 5).value = 'mt'; wsE.getCell(13, 6).value = 70;
    wsE.getCell(13, 7).value = 11.4; wsE.getCell(13, 7).numFmt = USD;
    wsE.getCell(13, 8).value = { formula: 'F13*G13', result: 798 } as any; wsE.getCell(13, 8).numFmt = USD;
    // r14: fiyat girilen 2. satir
    wsE.getCell(14, 4).value = '4" Patent Dirsek'; wsE.getCell(14, 5).value = 'ad'; wsE.getCell(14, 6).value = 8;
    wsE.getCell(14, 7).value = 5.2; wsE.getCell(14, 7).numFmt = USD;
    wsE.getCell(14, 8).value = { formula: 'F14*G14', result: 41.6 } as any; wsE.getCell(14, 8).numFmt = USD;
    // r15: kullanicinin GIRMEDIGI satir — dosyanin kendi eski fiyati (HAYALET)
    wsE.getCell(15, 4).value = '4" PN16 DÜZ FLANŞ'; wsE.getCell(15, 5).value = 'ad'; wsE.getCell(15, 6).value = 4;
    wsE.getCell(15, 7).value = 10.7; wsE.getCell(15, 7).numFmt = USD;
    wsE.getCell(15, 8).value = { formula: 'F15*G15', result: 42.8 } as any; wsE.getCell(15, 8).numFmt = USD;
    // KG9: musterinin KENDI iscilik fiyatlari — kullanici bu dosyada iscilik
    // fiyatlamasi YAPMAZ (grid'de _labBirim tum satirlarda bos) → korunmali
    wsE.getCell(13, 9).value = 680; wsE.getCell(13, 9).numFmt = USD;
    wsE.getCell(14, 9).value = 740; wsE.getCell(14, 9).numFmt = USD;
    wsE.getCell(15, 9).value = 850; wsE.getCell(15, 9).numFmt = USD;
    // r16: TOPLAM satiri (data DEGIL) — sablon SUM'u korunmali
    wsE.getCell(16, 4).value = 'TOPLAM';
    wsE.getCell(16, 8).value = { formula: 'SUM(H13:H15)', result: 882.4 } as any;
    // Yardimci blok: dosyanin KENDI eski #VALUE! hatasi (E='mt' metin carpimi)
    wsE.getCell(13, 14).value = { formula: 'L13*E13', result: { error: '#VALUE!' } } as any;

    const sheetsE: any[] = [{
      name: 'CİLAS KAUÇUK', index: 0, isEmpty: false,
      // Roller TERS-baslikli dosyadan persist edilmis: quantityField=E (metin!)
      columnRoles: { noField: 'col0', nameField: 'col3', quantityField: 'col4', unitField: 'col5',
        materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
        laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam' },
      columnDefs: [],
      rowData: [
        ...Array.from({ length: 11 }, (_, i) => ({ _rowIdx: i, _isHeaderRow: false, _isDataRow: false })),
        { _rowIdx: 11, _isHeaderRow: true, _isDataRow: false },
        { _rowIdx: 12, _isDataRow: true, col3: '4" Siyah Boru', col4: 'mt', col5: 70,
          _matBirim: '558,2', _matToplam: '' }, // app toplami hesaplayamadi (S1b)
        { _rowIdx: 13, _isDataRow: true, col3: '4" Patent Dirsek', col4: 'ad', col5: 8,
          _matBirim: '215', _matToplam: '' },
        { _rowIdx: 14, _isDataRow: true, col3: '4" PN16 DÜZ FLANŞ', col4: 'ad', col5: 4,
          _matBirim: '', _matToplam: '' }, // kullanici fiyat GIRMEDI
      ],
    }];

    const bilgiE = writePricesToWorkbook(wbE, sheetsE);
    const b = bilgiE[0];

    // KG1: yeni birim yazildi + toplam FORMULLE (etkin miktar F'den) — 798 EZILDI
    const h13: any = wsE.getCell(13, 8).value;
    check('KG1 stale toplam ezildi: G13=558,2 · H13==F13*G13 (39.074; 798 kalmadı)',
      wsE.getCell(13, 7).value === 558.2 && h13?.formula === 'F13*G13' && h13?.result === 39074,
      `G13=${JSON.stringify(wsE.getCell(13, 7).value)} H13=${JSON.stringify(h13)}`);
    check('KG1b ikinci satır: G14=215 · H14 result=1720 (8×215)',
      wsE.getCell(14, 7).value === 215 && (wsE.getCell(14, 8).value as any)?.result === 1720,
      JSON.stringify(wsE.getCell(14, 8).value));

    // KG2: HAYALET fiyat temizlendi — grid'de olmayan 10,7/42,8 ciktida YOK
    check('KG2 hayalet fiyat temizlendi: G15/H15 boş (grid ↔ çıktı birebir)',
      bosMu(wsE.getCell(15, 7).value) && bosMu(wsE.getCell(15, 8).value),
      `G15=${JSON.stringify(wsE.getCell(15, 7).value)} H15=${JSON.stringify(wsE.getCell(15, 8).value)}`);

    // K-A siniri: TOPLAM satiri (data degil) DOKUNULMADI — sablon SUM'u durur
    check('KG2b şablon TOPLAM satırının SUM formülü korundu',
      (wsE.getCell(16, 8).value as any)?.formula === 'SUM(H13:H15)', JSON.stringify(wsE.getCell(16, 8).value));

    // KG4: TL deger $-formatli hucrede "USD" etiketiyle BASILMAZ — bicim TL
    check('KG4 yazılan hücre biçimi TL\'ye düzeltildi ("USD" kalmadı)',
      String(wsE.getCell(13, 7).numFmt).includes('TL') && String(wsE.getCell(13, 8).numFmt).includes('TL')
      && !String(wsE.getCell(13, 7).numFmt).includes('USD'),
      `G13fmt=${wsE.getCell(13, 7).numFmt} H13fmt=${wsE.getCell(13, 8).numFmt}`);

    // KG5: hata ARTISI sifir (dosyanin kendi eski #VALUE!'su sayilmaz)
    check('KG5 formül-hata artışı 0 (eski #DEĞER!\'ler artmadı)',
      b.hataArtisi === 0, `hataArtisi=${b.hataArtisi}`);

    // KG8: self-check — beklenen 2 (girilen birimler), yazilan 4 (+2 turetilen
    // toplam) → eksik yok; İCMAL degeri turetilen toplamlari icerir
    check('KG8 self-check: eksik=0, İCMAL matDeger=40.794 (39.074+1.720)',
      Math.max(0, b.beklenen - b.yazilan) === 0 && Math.abs(b.matDeger - 40794) < 0.01,
      `beklenen=${b.beklenen} yazilan=${b.yazilan} matDeger=${b.matDeger}`);

    // KG9 (E2E ALTIN YOL BULGUSU — yangin-temin-montaj.xlsx): kullanici bu
    // dosyada iscilik fiyati HIC girmedi (rol tamamen bos). Musterinin kendi
    // ISCILIK BIRIM FIYAT kolonu (I13/I14 = 680/740) K-A hayalet temizligiyle
    // SILINIYORDU → sessiz VERI KAYBI (KF1 ihlali). Uygulamanin YONETMEDIGI
    // rolde kolon DOKUNULMAZ; yonetilen malzeme rolunde temizlik aynen surer.
    check('KG9 yönetilmeyen İŞÇİLİK rolü: müşterinin 680/740 değerleri KORUNDU',
      wsE.getCell(13, 9).value === 680 && wsE.getCell(14, 9).value === 740
      && wsE.getCell(15, 9).value === 850,
      `I13=${JSON.stringify(wsE.getCell(13, 9).value)} I14=${JSON.stringify(wsE.getCell(14, 9).value)} I15=${JSON.stringify(wsE.getCell(15, 9).value)}`);
    check('KG9b yönetilen MALZEME rolünde hayalet temizliği sürüyor (G15 boş)',
      bosMu(wsE.getCell(15, 7).value), `G15=${JSON.stringify(wsE.getCell(15, 7).value)}`);
  }

  // ══ KG10 (E2E ALTIN YOL BULGUSU — yangin-temin-montaj R14) ═══════════
  // Musteri fiyat kolonuna METIN not yazar ("ŞİRKET TEMİNİ" = bu kalemi
  // sirket temin edecek, fiyat yok). K-A hayalet temizligi bu METNI de
  // siliyordu → geri donusu olmayan bilgi kaybi (KF1). Sayi/formul/sayi-
  // benzeri metin temizlenir; GERCEK metin DOKUNULMAZ.
  {
    const wbM = new ExcelJS.Workbook();
    const wsM = wbM.addWorksheet('Sheet1');
    ['NO', 'MALZEMENİN CİNSİ', 'MİKTAR', 'BİRİM', 'MALZ. BİRİM FİYAT', 'MALZ. TOPLAM']
      .forEach((h, i) => { const c = wsM.getCell(1, i + 1); c.value = h; c.font = { bold: true }; });
    // r2: kullanicinin fiyatladigi satir
    wsM.getCell(2, 2).value = 'Yangın Dolabı'; wsM.getCell(2, 3).value = 1; wsM.getCell(2, 4).value = 'Adet';
    wsM.getCell(2, 5).value = 12500;
    // r3: musterinin METIN notu — fiyat DEGIL, korunmali
    wsM.getCell(3, 2).value = 'Sprinkler Pompası'; wsM.getCell(3, 3).value = 2; wsM.getCell(3, 4).value = 'Adet';
    wsM.getCell(3, 5).value = 'ŞİRKET TEMİNİ';
    // r4: musterinin eski SAYISAL fiyati, kullanici fiyatlamadi → hayalet, temizlenir
    wsM.getCell(4, 2).value = 'Hortum Makarası'; wsM.getCell(4, 3).value = 3; wsM.getCell(4, 4).value = 'Adet';
    wsM.getCell(4, 5).value = 24500;
    // r5: sayi-BENZERI metin ("1.250,50") — fiyattir, temizlenir
    wsM.getCell(5, 2).value = 'Vana'; wsM.getCell(5, 3).value = 1; wsM.getCell(5, 4).value = 'Adet';
    wsM.getCell(5, 5).value = '1.250,50';

    const sheetsM: any[] = [{
      name: 'Sheet1', index: 0, isEmpty: false,
      columnRoles: { nameField: 'col1', quantityField: 'col2', unitField: 'col3',
        materialUnitPriceField: '_matBirim', materialTotalField: 'col5' },
      columnDefs: [],
      rowData: [
        { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false },
        { _rowIdx: 1, _isDataRow: true, col1: 'Yangın Dolabı', col2: 1, col3: 'Adet', _matBirim: '9711,9' },
        { _rowIdx: 2, _isDataRow: true, col1: 'Sprinkler Pompası', col2: 2, col3: 'Adet', _matBirim: '' },
        { _rowIdx: 3, _isDataRow: true, col1: 'Hortum Makarası', col2: 3, col3: 'Adet', _matBirim: '' },
        { _rowIdx: 4, _isDataRow: true, col1: 'Vana', col2: 1, col3: 'Adet', _matBirim: '' },
      ],
    }];
    writePricesToWorkbook(wbM, sheetsM);

    check('KG10 müşterinin METİN notu korundu ("ŞİRKET TEMİNİ" silinmedi)',
      wsM.getCell(3, 5).value === 'ŞİRKET TEMİNİ', `E3=${JSON.stringify(wsM.getCell(3, 5).value)}`);
    check('KG10b sayısal hayalet fiyat temizlendi (24500 → boş)',
      bosMu(wsM.getCell(4, 5).value), `E4=${JSON.stringify(wsM.getCell(4, 5).value)}`);
    check('KG10c sayı-benzeri metin de fiyattır → temizlendi ("1.250,50" → boş)',
      bosMu(wsM.getCell(5, 5).value), `E5=${JSON.stringify(wsM.getCell(5, 5).value)}`);
    check('KG10d fiyatlanan satıra yeni değer yazıldı (E2=9.711,9)',
      wsM.getCell(2, 5).value === 9711.9, `E2=${JSON.stringify(wsM.getCell(2, 5).value)}`);
  }

  // ══ PANO 18: export EKRANDAKI para birimini alir (USD/EUR cevirisi) ══
  // Degerler hedef birime cevrilir, hucre bicimi o birim, kur notu dosyada;
  // TRY cagrilarinda (birimsiz — ustteki TUM testler) davranis DEGISMEZ.
  {
    const bufB = await musteriFixture(BASLIK_TAM);
    const wbB = new ExcelJS.Workbook();
    await wbB.xlsx.load(bufB as any);
    const bilgiB = writePricesToWorkbook(wbB, sheetsFixture() as any,
      { kod: 'USD', katsayi: 0.5, not: 'Fiyatlar USD — 1 USD = ₺2,00 (TCMB, 28.07.2026)' });
    const wB = wbB.getWorksheet('mekanik G BLOK')!;
    const i3: any = wB.getCell(3, 9).value;
    check('PANO 18a değerler USD\'ye çevrili yazılır (F3=13,3 · İşç.Toplam=78.250)',
      wB.getCell(3, 6).value === 13.3 && i3?.result === 78250,
      `F3=${JSON.stringify(wB.getCell(3, 6).value)} I3=${JSON.stringify(i3)}`);
    check('PANO 18a hücre biçimi $ (yanlış etiket yok)',
      String(wB.getCell(3, 6).numFmt).includes('$') && !String(wB.getCell(3, 6).numFmt).includes('TL'),
      `fmt=${wB.getCell(3, 6).numFmt}`);
    let kurNotuVar = false;
    wB.eachRow((row) => row.eachCell((c) => {
      if (String(c.value ?? '').includes('Fiyatlar USD')) kurNotuVar = true;
    }));
    check('PANO 18a kur notu dosyada', kurNotuVar, '');
    check('PANO 18a İCMAL değerleri de çevrili (matDeger=4.162,9)',
      Math.abs(bilgiB[0].matDeger - 4162.9) < 0.01, `mat=${bilgiB[0].matDeger}`);
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
