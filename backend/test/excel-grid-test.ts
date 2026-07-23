/**
 * EXCEL GRID PARSE — KABUL TESTLERI (kesif dosyasi yukleme, fixedSchema)
 *   npx ts-node test/excel-grid-test.ts   (npm run test:grid)
 *
 * Fixture'lar XLSX ile BELLEKTE kurulur — DB yok, dosya yok.
 * Kaynak vaka: kullanicinin "DRK 1.xlsx" / "DRK 2.xlsx" dosyalari
 * "Excel dosyasinda fiyatlandirilacak veri bulunamadi" ile reddediliyordu.
 */
import * as XLSX from 'xlsx';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);

/** aoa + merge listesinden bellekte xlsx buffer uretir */
function fixture(aoa: any[][], merges: string[]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges.map((m) => XLSX.utils.decode_range(m));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * DRK sekli: "Ürün Adı" sutunu HER SATIRDA 3 sutuna merge'li (B..D),
 * bolum basliklari birim/miktar'siz, sonda TOPLAM satiri.
 * Sutunlar: A=A.No B,C,D=Ürün Adı E=Birim F=Miktar G=Birim Fiyatı H=Toplam Fiyat
 */
const DRK_AOA: any[][] = [
  ['', '', '', '', 'MALİYET LİSTESİ', '', '', ''],
  ['A.No', 'Ürün Adı', '', '', 'Birim', 'Miktar\r\n(m2/L/adet)', 'Birim\r\nFiyatı (TL)', 'Toplam\r\nFiyat (TL)'],
  ['SIRA 1', 'FANCOİL BORULARI VE İZOLASYONLAR', '', '', '', '', '', ''], // bolum basligi
  ['SIRA 1', 'DN15 / Siyah Düz Uçlu Boru', '', '', 'Mt.', 60, 0, 0],
  ['SIRA 1', 'DN25 / Siyah Düz Uçlu Boru', '', '', 'Mt.', 48, 0, 0],
  ['SIRA 2', 'SARF MALZEMELER', '', '', '', '', '', ''],             // bolum basligi
  ['SIRA 2', 'GENEL ALANLARDA SARF MALZEME', '', '', 'Adet', 1, 0, 0],
  ['', 'TOPLAM:', '', '', '', '', '', 0],                            // toplam satiri
];
const DRK_MERGES = [
  'B2:D2', 'B3:D3', 'B4:D4', 'B5:D5', 'B6:D6', 'B7:D7', 'B8:D8',
];

async function run() {
  // ══ E1: ad sutunu her satirda merge'li → satirlar VERI sayilir ═══════
  {
    const res = await svc.prepare(fixture(DRK_AOA, DRK_MERGES), { fixedSchema: true });
    const s = res.sheets[0];
    const dataRows = s.rowData.filter((r: any) => r._isDataRow);
    const adlar = dataRows.map((r: any) => String(r[s.columnRoles.nameField!] ?? ''));

    check('E1 sayfa BOS sayilmaz (ad sutunu 3-sutun merge)', !s.isEmpty,
      `isEmpty=${s.isEmpty}`);
    check('E1 tam 3 veri satiri (bolum basliklari + TOPLAM haric)', dataRows.length === 3,
      `${dataRows.length}: ${JSON.stringify(adlar)}`);
    check('E1 bolum basligi veri DEGIL (birim/miktar yok)',
      !adlar.some((a) => /FANCOİL BORULARI|SARF MALZEMELER$/.test(a)), JSON.stringify(adlar));
    check('E1 TOPLAM satiri veri DEGIL', !adlar.some((a) => /^TOPLAM/.test(a)),
      JSON.stringify(adlar));

    // ══ E2: Excel'in kendi fiyat sutunlari gride SIZMAZ ═══════════════
    // "Birim Fiyatı (TL)" — normalize sonrasi "fiyati" olur, duz \bfiyat\b tutmaz.
    const basliklar = s.columnDefs.map((c: any) => c.headerName).join(' | ');
    check('E2 "Birim Fiyatı (TL)" sutunu ATILIR (Turkce ek toleransi)',
      !/Fiyatı \(TL\)/.test(basliklar), basliklar);
    check('E2 sabit sistem fiyat sutunlari VAR',
      s.columnDefs.some((c: any) => c.field === '_matBirim')
      && s.columnDefs.some((c: any) => c.field === '_labBirim'), basliklar);

    // ══ E3: ad sutunu tablodan DUSMEZ ════════════════════════════════
    // ad sutununda "SARF MALZEMELER" + "TOPLAM:" gecince /malzeme.*toplam/
    // rolu bu sutunu kapiyor, fixedSchema fiyat rollerini attigi icin
    // malzeme adi sutunu tamamen kayboluyordu.
    check('E3 malzeme adi sutunu columnDefs icinde durur',
      s.columnDefs.some((c: any) => c.field === s.columnRoles.nameField),
      `nameField=${s.columnRoles.nameField} defs=${s.columnDefs.map((c: any) => c.field).join(',')}`);
    check('E3 nameField fiyat rolune atanmamis',
      s.columnRoles.materialTotalField === '_matToplam'
      && s.columnRoles.nameField !== s.columnRoles.materialTotalField,
      JSON.stringify(s.columnRoles));
  }

  // ══ E4: TUM SATIRA merge'li bolum basligi (birim/miktar sutununa tasar) ══
  // Eski davranis korunmali: bu satir baslik, veri DEGIL.
  {
    const aoa: any[][] = [
      ['A.No', 'Ürün Adı', '', '', 'Birim', 'Miktar', 'Birim Fiyatı', 'Tutar'],
      ['SIRA 1', 'YANGIN TESİSATI', '', '', '', '', '', ''], // B..H merge → birim sutununa tasar
      ['SIRA 1', 'DN15 / Siyah Boru', '', '', 'Mt.', 60, 0, 0],
    ];
    const res = await svc.prepare(fixture(aoa, ['B2:H2', 'B3:D3']), { fixedSchema: true });
    const s = res.sheets[0];
    const adlar = s.rowData.filter((r: any) => r._isDataRow)
      .map((r: any) => String(r[s.columnRoles.nameField!] ?? ''));
    check('E4 satir-boyu merge bolum basligi veri sayilmaz',
      !adlar.some((a) => /YANGIN TESİSATI/.test(a)), JSON.stringify(adlar));
    check('E4 altindaki gercek kalem veri sayilir',
      adlar.some((a) => /DN15/.test(a)), JSON.stringify(adlar));
  }

  // ══ E5: merge'siz duz kesif dosyasi (regresyon guvencesi) ════════════
  {
    const aoa: any[][] = [
      ['Sıra No', 'İmalatın Tanımı', 'Birim', 'Miktar', 'Malzeme Birim Fiyat', 'İşçilik Birim Fiyat'],
      ['1', 'DN25 Siyah Çelik Boru', 'Mt.', 100, 0, 0],
      ['2', 'DN32 Küresel Vana', 'Adet', 4, 0, 0],
    ];
    const res = await svc.prepare(fixture(aoa, []), { fixedSchema: true });
    const s = res.sheets[0];
    check('E5 merge'.concat('siz dosya bozulmaz (2 veri satiri)'),
      !s.isEmpty && s.rowData.filter((r: any) => r._isDataRow).length === 2,
      `isEmpty=${s.isEmpty} rows=${s.rowData.filter((r: any) => r._isDataRow).length}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`EXCEL GRID PARSE: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
