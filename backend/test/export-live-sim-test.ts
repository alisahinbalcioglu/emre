/**
 * CANLI SIMULASYON — Teklif Formatim UCTAN UCA (kullanici talimati 21.07:
 * "testleri kendin yap"). Gercek servis katmani (QuotesService.exportXlsx)
 * sahte-Prisma ile kosulur; HTTP/auth haric CANLI YOLUN AYNISI:
 *   LOGO GOMULU format + orijinal musteri workbook'u → cikti dosyasi
 *   → yeniden ACILIP hucre hucre denetlenir.
 *   npx ts-node test/export-live-sim-test.ts   (npm run test:livesim)
 */
import * as ExcelJS from 'exceljs';
import { QuotesService } from '../src/quotes/quotes.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// 1x1 kirmizi PNG (gecerli, minimal) — "logo"
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Kullanicinin GERCEK dosya duzeninin ikizi: KAPAK(logo) + Teklif Esaslari +
 *  İCMAL(yer tutucular) + CILAS KAUCUK(eski is=liste yuvasi) + EXCHANGE RATE */
async function formatFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const kapak = wb.addWorksheet('KAPAK');
  const img = wb.addImage({ buffer: PNG_1PX as any, extension: 'png' });
  kapak.addImage(img, 'B2:E8'); // LOGO
  kapak.getCell('B12').value = 'Sn {{MUSTERI}};';
  kapak.getCell('B13').value = '{{PROJE}}';
  kapak.getCell('B15').value = 'Teklif No: {{TEKLIF_NO}} / {{REV}} / {{TARIH}}';

  const esas = wb.addWorksheet('Teklif Esasları');
  esas.mergeCells('B2:E2');
  esas.getCell('B2').value = 'TEKLİF ESASLARI';
  esas.getCell('B2').font = { bold: true };
  esas.getCell('B4').value = 'İş kapsamında malzemelerin temini bize aittir.';

  const icmal = wb.addWorksheet('İCMAL');
  icmal.getCell('B2').value = 'Bölüm';
  icmal.getCell('B3').value = '{{ICMAL_SATIRLARI}}';
  icmal.getCell('E6').value = '{{GENEL_TOPLAM}}';
  icmal.getCell('B8').value = '{{KUR_NOTU}}';

  const eski = wb.addWorksheet('CILAS KAUCUK'); // eski is → yuvasi
  eski.getCell('A1').value = 'ESKI KALEMLER';
  // Gercekci eski-is tablosu: cok sayida SAYISAL satir (rol tahmini kaniti)
  for (let r = 2; r <= 9; r++) {
    eski.getCell(r, 1).value = `E-${r}`;
    eski.getCell(r, 2).value = r * 10; // miktar
    eski.getCell(r, 3).value = r * 7.5; // fiyat
  }

  const kur = wb.addWorksheet('EXCHANGE RATE');
  kur.getCell('A1').value = 'GEÇERLİ KUR: 1 USD';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Musterinin kesif dosyasi: 2 sayfa, merge'li baslik, sayisal miktarlar */
async function musteriFixture(): Promise<{ buf: Buffer; sheetsArr: any[] }> {
  const wb = new ExcelJS.Workbook();
  const yap = (ad: string) => {
    const ws = wb.addWorksheet(ad);
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `${ad.toUpperCase()} KEŞİF`;
    ws.getCell('A1').font = { bold: true };
    ['Poz', 'Malzeme', 'Birim', 'Miktar', 'M.BF', 'M.Top', 'İ.BF', 'İ.Top'].forEach((h, i) => {
      ws.getCell(2, i + 1).value = h;
      ws.getCell(2, i + 1).font = { bold: true };
    });
    ws.getColumn(2).width = 38;
    ws.getCell(3, 1).value = 'P1'; ws.getCell(3, 2).value = 'Boru 1"'; ws.getCell(3, 3).value = 'mt'; ws.getCell(3, 4).value = 100;
    ws.getCell(4, 1).value = 'P2'; ws.getCell(4, 2).value = 'Vana 1"'; ws.getCell(4, 3).value = 'ad'; ws.getCell(4, 4).value = 5;
    return ws;
  };
  yap('mekanik G BLOK');
  yap('elektrik');
  const roles = {
    noField: 'col0', nameField: 'col1', unitField: 'col2', quantityField: 'col3',
    materialUnitPriceField: 'col4', materialTotalField: 'col5',
    laborUnitPriceField: 'col6', laborTotalField: 'col7',
  };
  const rowlar = (m1: number, m2: number) => [
    { _rowIdx: 0, _isHeaderRow: false, _isDataRow: false },
    { _rowIdx: 1, _isHeaderRow: true, _isDataRow: false },
    { _rowIdx: 2, _isDataRow: true, col3: 100, col4: String(m1), col5: String(m1 * 100), col6: '2,5', col7: '250' },
    { _rowIdx: 3, _isDataRow: true, col3: 5, col4: String(m2), col5: String(m2 * 5), col6: '', col7: '' },
  ];
  return {
    buf: Buffer.from(await wb.xlsx.writeBuffer()),
    sheetsArr: [
      { name: 'mekanik G BLOK', index: 0, isEmpty: false, columnRoles: roles, columnDefs: [], rowData: rowlar(10, 20) },
      { name: 'elektrik', index: 1, isEmpty: false, columnRoles: roles, columnDefs: [], rowData: rowlar(7, 9) },
    ],
  };
}

/** Sahte prisma: tek kullanici, tek format (varsayilan), tek teklif. */
function fakeDb(formatBytes: Buffer, musteriBuf: Buffer, sheetsArr: any[]) {
  const quote: any = {
    id: 'q1', userId: 'u1', title: 'F_G Teklif', sheets: sheetsArr,
    originalFile: musteriBuf, originalName: 'kesif.xlsx',
    quoteNo: null, rev: 0, musteri: 'PORTAKAL AHŞAP', proje: 'YANGIN RENOVASYON',
    hazirlayan: 'EMRE BAŞARAN', gecerlilik: '15 gün', formatId: null, exportOverrides: null,
  };
  const format: any = {
    id: 'f1', userId: 'u1', name: 'Teklif Formatı', fileName: 'Teklif Formatı.xlsx',
    fileBytes: formatBytes, isDefault: true,
    mapping: {
      sheetRoles: {
        KAPAK: 'sabit', 'Teklif Esasları': 'sabit', 'İCMAL': 'sabit',
        'CILAS KAUCUK': 'liste', 'EXCHANGE RATE': 'sabit',
      },
    },
  };
  const exportlar: any[] = [];
  const prisma: any = {
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
    quote: {
      findFirst: async () => quote,
      count: async () => 0,
      update: async ({ data }: any) => { Object.assign(quote, data); return quote; },
    },
    quoteFormat: { findFirst: async ({ where }: any) => (where?.isDefault || where?.userId ? format : null) },
    quoteExport: {
      create: async ({ data }: any) => { exportlar.push(data); return data; },
      findMany: async () => exportlar,
      findFirst: async ({ where }: any) => exportlar.find((e) => e.rev === where?.rev) ?? null,
    },
  };
  const fx: any = { getRates: async () => ({ usdTry: 47.2, eurTry: 53.91, usdTryBuying: 47.2, eurTryBuying: 53.91, source: 'fake', date: '21.07.2026' }) };
  return { prisma, fx, quote, exportlar };
}

async function run() {
  const formatBytes = await formatFixture();
  const { buf: musteriBuf, sheetsArr } = await musteriFixture();

  // ── ON KONTROL: fixture formatinda logo GERCEKTEN gomulu mu? ────────
  {
    const kontrol = new ExcelJS.Workbook();
    await kontrol.xlsx.load(formatBytes as any);
    check('SIM-0 fixture format: KAPAK logosu gomulu (on kontrol)',
      (kontrol.getWorksheet('KAPAK')?.getImages()?.length ?? 0) === 1,
      `img=${kontrol.getWorksheet('KAPAK')?.getImages()?.length}`);
  }

  const { prisma, fx, quote, exportlar } = fakeDb(formatBytes, musteriBuf, sheetsArr);
  const svc = new QuotesService(prisma, fx);

  // ── CANLI YOL: exportXlsx (ilk aktarim) ─────────────────────────────
  const r1 = await svc.exportXlsx('u1', 'q1');
  check('SIM-1 ilk aktarim: quoteNo atandi + Rev.01', /^MP-\d{4}-/.test(r1.quoteNo) && r1.rev === 1,
    `no=${r1.quoteNo} rev=${r1.rev}`);

  const out = new ExcelJS.Workbook();
  await out.xlsx.load(r1.buffer as any);
  const adlar = out.worksheets.map((w) => w.name);

  // B1/B2/T16: format sayfalari + yuva degisimi + sira
  check('SIM-2 sayfa sirasi: KAPAK, Esaslar, İCMAL, [listeler], EXCHANGE',
    JSON.stringify(adlar) === JSON.stringify(['KAPAK', 'Teklif Esasları', 'İCMAL', 'mekanik G BLOK', 'elektrik', 'EXCHANGE RATE']),
    adlar.join(' | '));

  // ★ KRITIK: LOGO ciktida duruyor mu? (hic test edilmemisti)
  const kapakImg = out.getWorksheet('KAPAK')?.getImages()?.length ?? 0;
  check('SIM-3 ★ KAPAK LOGOSU CIKTIDA KORUNUR', kapakImg >= 1, `getImages=${kapakImg}`);

  // Sabit sayfa icerigi birebir
  check('SIM-4 Teklif Esasları icerik + merge korunur',
    String(out.getWorksheet('Teklif Esasları')?.getCell('B2').value) === 'TEKLİF ESASLARI'
    && ((out.getWorksheet('Teklif Esasları')?.model?.merges ?? []) as string[]).includes('B2:E2'),
    JSON.stringify(out.getWorksheet('Teklif Esasları')?.model?.merges));
  check('SIM-5 EXCHANGE RATE aynen', String(out.getWorksheet('EXCHANGE RATE')?.getCell('A1').value).startsWith('GEÇERLİ KUR'), '');

  // Yer tutucular doldu
  check('SIM-6 kapak alanlari doldu (musteri/proje/no/rev)',
    String(out.getWorksheet('KAPAK')?.getCell('B12').value) === 'Sn PORTAKAL AHŞAP;'
    && String(out.getWorksheet('KAPAK')?.getCell('B13').value) === 'YANGIN RENOVASYON'
    && /MP-\d{4}-.*Rev\.01/.test(String(out.getWorksheet('KAPAK')?.getCell('B15').value)),
    `B12=${out.getWorksheet('KAPAK')?.getCell('B12').value} B15=${out.getWorksheet('KAPAK')?.getCell('B15').value}`);

  // Liste sayfalari: orijinal yapinin kopyasi + SAYISAL fiyatlar
  const mek = out.getWorksheet('mekanik G BLOK')!;
  check('SIM-7 liste: merge baslik + bold + kolon genisligi korunur',
    ((mek.model?.merges ?? []) as string[]).includes('A1:H1')
    && mek.getCell('A2').font?.bold === true
    && Math.round(mek.getColumn(2).width ?? 0) === 38,
    `merges=${JSON.stringify(mek.model?.merges)} w=${mek.getColumn(2).width}`);
  check('SIM-8 fiyatlar DOLU ve SAYISAL (10 / 2.5)',
    mek.getCell(3, 5).value === 10 && mek.getCell(3, 7).value === 2.5,
    `E3=${JSON.stringify(mek.getCell(3, 5).value)} G3=${JSON.stringify(mek.getCell(3, 7).value)}`);
  const tut: any = mek.getCell(3, 6).value;
  check('SIM-9 tutar CANLI FORMUL (=D3*E3, sonuc 1000)',
    tut?.formula === 'D3*E3' && tut?.result === 1000, JSON.stringify(tut));
  check('SIM-10 fiyatsiz hucre BOS (0 yazilmadi)',
    mek.getCell(4, 7).value === null || mek.getCell(4, 7).value === undefined,
    JSON.stringify(mek.getCell(4, 7).value));

  // Icmal: sekme satirlari + formul + kur notu
  const icm = out.getWorksheet('İCMAL')!;
  const icmalB3 = String(icm.getCell('B3').value);
  const icmalB4 = String(icm.getCell('B4').value);
  check('SIM-11 icmalde HER sekme icin satir (mekanik + elektrik)',
    icmalB3 === 'mekanik G BLOK' && icmalB4 === 'elektrik', `B3=${icmalB3} B4=${icmalB4}`);
  const c3: any = icm.getCell('C3').value;
  check('SIM-12 icmal SUM formulu liste sayfasina bakar + sonucu dogru',
    typeof c3 === 'object' && /SUM\('mekanik G BLOK'!F3:F4\)/.test(c3?.formula ?? '') && c3?.result === 1100,
    JSON.stringify(c3));
  // Icmal 2 satir eklenince alttaki etiketler 1 satir KAYAR (dogru davranis
  // — G2 kaniti): E6→E7 genel toplam, B8→B9 kur notu.
  const gt7: any = icm.getCell('E7').value;
  check('SIM-13a genel toplam KAYAN adreste formullu (E7)',
    typeof gt7 === 'object' && typeof gt7?.formula === 'string', JSON.stringify(gt7));
  check('SIM-13b kur notu KAYAN adreste dolu (B9, TCMB + tarih)',
    /47,2.*TCMB.*21\.07\.2026/.test(String(icm.getCell('B9').value)), String(icm.getCell('B9').value));

  // T10: ikinci aktarim — no sabit, rev artar, arsiv
  const r2 = await svc.exportXlsx('u1', 'q1');
  check('SIM-14 T10: ikinci aktarim ayni no + Rev.02 + arsiv 2 kayit',
    r2.quoteNo === r1.quoteNo && r2.rev === 2 && exportlar.length === 2,
    `no=${r2.quoteNo} rev=${r2.rev} arsiv=${exportlar.length}`);

  // T13/T14: override — kapak basligi degisir, format bytes DEGISMEZ
  quote.exportOverrides = { KAPAK: { B12: { value: 'Sn Turhan Bey;', manual: true } } };
  const r3 = await svc.exportXlsx('u1', 'q1');
  const out3 = new ExcelJS.Workbook();
  await out3.xlsx.load(r3.buffer as any);
  check('SIM-15 T14: manuel override ciktiya islendi',
    String(out3.getWorksheet('KAPAK')?.getCell('B12').value) === 'Sn Turhan Bey;',
    String(out3.getWorksheet('KAPAK')?.getCell('B12').value));
  const fmtKontrol = new ExcelJS.Workbook();
  await fmtKontrol.xlsx.load(formatBytes as any);
  check('SIM-16 T13: ana format dosyasi DEGISMEDI (yer tutucu hala duruyor)',
    String(fmtKontrol.getWorksheet('KAPAK')?.getCell('B12').value) === 'Sn {{MUSTERI}};', '');

  // ════════════════════════════════════════════════════════════════
  // GENELLIK MATRISI (kullanici talimati 21.07: "herkesin formati baska —
  // sorunu GENEL coz"). Motor hicbir sayfa adina/hucre konumuna/duzene
  // bagimli OLMAMALI. Farkli format cesitleri ayni motordan gecer:
  // ════════════════════════════════════════════════════════════════
  const { buildExportWorkbook } = await import('../src/quotes/export-engine');
  const ctxTemel = {
    teklifNo: 'MP-2026-009', rev: 1, tarih: '21.07.2026',
    musteri: 'GENEL A.Ş.', proje: 'Proje X', hazirlayan: 'Emre', gecerlilik: '30 gün',
    kurNotu: 'Kur: 1 USD = 47,20 TL (TCMB, 21.07.2026)', kdvOran: 0.2,
  };

  // ── G1: HIC yer tutucusuz, tamamen statik format (farkli adlar) ──
  {
    const f = new ExcelJS.Workbook();
    const on = f.addWorksheet('Ön Yazı');
    on.getCell('C5').value = 'Sabit tanıtım metni — dokunulmamalı';
    const sart = f.addWorksheet('Şartname');
    sart.getCell('A1').value = 'Genel şartlar...';
    const { buf, sheetsArr: sa } = await musteriFixture();
    const s = await buildExportWorkbook({
      originalFile: buf, sheetsArr: sa, formatWb: f, sheetRoles: null, ctxTemel, overrides: null,
    });
    const o = new ExcelJS.Workbook();
    await o.xlsx.load(Buffer.from(await s.wb.xlsx.writeBuffer()) as any);
    check('G1 etiketsiz format: hicbir hucre DEGISMEDI + listeler eklendi',
      String(o.getWorksheet('Ön Yazı')?.getCell('C5').value) === 'Sabit tanıtım metni — dokunulmamalı'
      && String(o.getWorksheet('Şartname')?.getCell('A1').value) === 'Genel şartlar...'
      && !!o.getWorksheet('mekanik G BLOK') && !!o.getWorksheet('elektrik'),
      o.worksheets.map((w) => w.name).join('|'));
    check('G1 fiyatlar yine SAYISAL dolu',
      o.getWorksheet('mekanik G BLOK')?.getCell(3, 5).value === 10, '');
  }

  // ── G2: FARKLI konum/duzen — icmal etiketi D7'de, kucuk-harf adlar ──
  {
    const f = new ExcelJS.Workbook();
    const oz = f.addWorksheet('özet sayfası');
    oz.getCell('D7').value = '{{ICMAL_SATIRLARI}}';
    oz.getCell('B1').value = 'Firma: {{MUSTERI}} — {{TARIH}}';
    oz.getCell('G20').value = '{{GENEL_TOPLAM}}';
    const isler = f.addWorksheet('ISLER'); // eski is — ad deseni tutmaz;
    // VERI TABLOSU gorunumu (sayisal satirlar) → liste tahmini (G1 kurali)
    for (let r = 1; r <= 6; r++) { isler.getCell(r, 1).value = r; isler.getCell(r, 2).value = r * 3; }
    const { buf, sheetsArr: sa } = await musteriFixture();
    const s = await buildExportWorkbook({
      originalFile: buf, sheetsArr: sa, formatWb: f, sheetRoles: null, ctxTemel, overrides: null,
    });
    const o = new ExcelJS.Workbook();
    await o.xlsx.load(Buffer.from(await s.wb.xlsx.writeBuffer()) as any);
    const ozOut = o.getWorksheet('özet sayfası')!;
    check('G2 icmal satirlari D7 konvansiyonuyla (D=ad, E/F/G=tutarlar) uretildi',
      String(ozOut.getCell('D7').value) === 'mekanik G BLOK'
      && String(ozOut.getCell('D8').value) === 'elektrik'
      && typeof (ozOut.getCell('E7').value as any)?.formula === 'string',
      `D7=${ozOut.getCell('D7').value} E7=${JSON.stringify(ozOut.getCell('E7').value)}`);
    check('G2 metin-ici etiket + farkli hucre: "Firma: GENEL A.Ş. — 21.07.2026"',
      String(ozOut.getCell('B1').value) === 'Firma: GENEL A.Ş. — 21.07.2026', String(ozOut.getCell('B1').value));
    check('G2 ISLER (taninmayan ad, icereksiz) LISTE tahmin edildi ve degisti',
      !o.getWorksheet('ISLER') && o.worksheets.some((w) => w.name === 'mekanik G BLOK'),
      o.worksheets.map((w) => w.name).join('|'));
    check('G2 satir eklemesi ALT hucreleri kaydirdi (G20→G21 genel toplam)',
      typeof (o.getWorksheet('özet sayfası')?.getCell('G21').value as any)?.formula === 'string'
      || typeof o.getWorksheet('özet sayfası')?.getCell('G21').value === 'number',
      `G20=${JSON.stringify(ozOut.getCell('G20').value)} G21=${JSON.stringify(ozOut.getCell('G21').value)}`);
  }

  // ── G3: AD CAKISMASI — formatta sabit sayfa adi teklif sayfasiyla ayni ──
  {
    const f = new ExcelJS.Workbook();
    const k = f.addWorksheet('Kapak');
    k.getCell('A1').value = '{{TEKLIF_NO}}';
    const cakisan = f.addWorksheet('mekanik G BLOK'); // SABIT ama ad cakisiyor!
    cakisan.getCell('A1').value = 'format not sayfasi';
    const { buf, sheetsArr: sa } = await musteriFixture();
    const s = await buildExportWorkbook({
      originalFile: buf, sheetsArr: sa, formatWb: f,
      sheetRoles: { 'Kapak': 'sabit', 'mekanik G BLOK': 'sabit' },
      ctxTemel, overrides: null,
    });
    const o = new ExcelJS.Workbook();
    await o.xlsx.load(Buffer.from(await s.wb.xlsx.writeBuffer()) as any);
    const adlarG3 = o.worksheets.map((w) => w.name);
    const kopyaAd = s.listeSayfalari[0];
    check('G3 cakisan ad: teklif sayfasi " (2)" ekiyle geldi, format sayfasi korundu',
      kopyaAd === 'mekanik G BLOK (2)' && String(o.getWorksheet('mekanik G BLOK')?.getCell('A1').value) === 'format not sayfasi',
      `adlar=${adlarG3.join('|')}`);
    check('G3 SUM formulu KOPYADAKI (2)li ada bakar',
      (s.sekmeler[0]?.matFormul ?? '').includes("'mekanik G BLOK (2)'"), s.sekmeler[0]?.matFormul ?? '');
  }

  // ── G4: COKLU liste yuvasi — ikisi de silinir, ILK yuvanin konumuna ──
  {
    const f = new ExcelJS.Workbook();
    f.addWorksheet('KAPAK').getCell('A1').value = '{{TEKLIF_NO}}';
    f.addWorksheet('eski is 1').getCell('A1').value = 'x';
    f.addWorksheet('NOTLAR').getCell('A1').value = 'not'; // sabit (rol ile)
    f.addWorksheet('eski is 2').getCell('A1').value = 'y';
    const { buf, sheetsArr: sa } = await musteriFixture();
    const s = await buildExportWorkbook({
      originalFile: buf, sheetsArr: sa, formatWb: f,
      sheetRoles: { KAPAK: 'sabit', 'eski is 1': 'liste', NOTLAR: 'sabit', 'eski is 2': 'liste' },
      ctxTemel, overrides: null,
    });
    const o = new ExcelJS.Workbook();
    await o.xlsx.load(Buffer.from(await s.wb.xlsx.writeBuffer()) as any);
    check('G4 coklu yuva: ikisi de gitti; listeler ILK yuvada; NOTLAR yerinde',
      JSON.stringify(o.worksheets.map((w) => w.name))
        === JSON.stringify(['KAPAK', 'mekanik G BLOK', 'elektrik', 'NOTLAR']),
      o.worksheets.map((w) => w.name).join('|'));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`CANLI SIMULASYON: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
