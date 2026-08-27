/**
 * EXCEL GRID PARSE — KABUL TESTLERI (kesif dosyasi yukleme, fixedSchema)
 *   npx ts-node test/excel-grid-test.ts   (npm run test:grid)
 *
 * Fixture'lar XLSX ile BELLEKTE kurulur — DB yok, dosya yok.
 * Kaynak vaka: kullanicinin "DRK 1.xlsx" / "DRK 2.xlsx" dosyalari
 * "Excel dosyasinda fiyatlandirilacak veri bulunamadi" ile reddediliyordu.
 */
import * as XLSX from 'xlsx';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';

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

  // ══ KG6 (EMO AYVAZ 27.07): MİKTAR/BİRİM basliklari TERS dosya ═══════
  // "MİKTAR" altinda birim METNI ('mt'), "BİRİM" altinda SAYI (70) —
  // veri karar verir: sayisal oran capraz, roller TAKAS edilir.
  {
    const aoa: any[][] = [
      ['NO', 'MALZEMENİN CİNSİ', 'MİKTAR', 'BİRİM', 'MALZ. BİRİM FİYAT ($)'],
      ['1', '4" Siyah Boru', 'mt', 70, 0],
      ['2', '4" Patent Dirsek', 'ad', 8, 0],
      ['3', 'KONSOL İÇİN NPU100', 'mt', 18, 0],
    ];
    const res = await svc.prepare(fixture(aoa, []), { fixedSchema: true });
    const s = res.sheets[0];
    // SABIT SEMA (GS1): roller artik SABIT alanlari gosterir (_miktar/_birim);
    // "hangi DOSYA kolonundan geldigi" ic ayrintidir. Olcut ICERIGE tasindi:
    // ters basliga ragmen miktar SAYI, birim METIN olmali.
    {
      const d = s.rowData.filter((r: any) => r._isDataRow);
      const miktarSayi = d.every((r: any) => typeof r._miktar === 'number');
      const birimMetin = d.every((r: any) => /^(mt|ad)$/i.test(String(r._birim ?? '').trim()));
      check('KG6 ters başlık: miktar SAYI, birim METİN olarak yerleşti (içerikten takas)',
        miktarSayi && birimMetin,
        `miktar=${d.map((r: any) => r._miktar).join(',')} birim=${d.map((r: any) => r._birim).join(',')}`);
    }
    check('KG6 veri satırları tanındı (3 kalem; miktar parse edilebiliyor)',
      !s.isEmpty && s.rowData.filter((r: any) => r._isDataRow).length === 3,
      `isEmpty=${s.isEmpty} rows=${s.rowData.filter((r: any) => r._isDataRow).length}`);
  }

  // ══ İB (27.08, Grand Hyatt canli vakasi): "İşçilik Birim" — FIYATSIZ yazim ══
  // Kullanicinin dosyasinda fiyat kolonlari "İşçilik Birim" / "İşçilik Toplam"
  // diye basliklanmis — "fiyat" KELIMESI YOK. laborUnitPrice desenlerinin HEPSI
  // "fiyat" sartli oldugu icin rol atanmiyordu → G kolonundaki 200/300/350
  // gride HIC gelmiyordu (İşç. Toplam ise /iscilik.*toplam/ ile geliyordu —
  // kullanici yarim tablo goruyordu). Ayni yazim ailesi skychem'de de olculmustu
  // ("MALZEME BİRİM" — R-B yorumu). IKI AILE kaniti: malzeme + iscilik.
  // KARSI ORNEK korunur: "İşçilik Birimi" basligi altinda GERCEKTEN mt/ad
  // varsa fiyat rolu ATANMAZ (sayisal icerik sarti) — unit atamasi bozulmaz.
  {
    // Kullanicinin gercek dosya sekli: bolum basligi + BOS malzeme fiyat
    // kolonu + fiyatsiz "İşçilik Birim" basligi.
    const aoa: any[][] = [
      ['No', 'Malzeme Adı', 'Birim', 'Miktar', 'Malzeme Birim Fiyat', 'Malzeme Toplam', 'İşçilik Birim', 'İşçilik Toplam', 'Toplam'],
      ['', 'OFİSLER FAN-COİL DEMONTAJ İŞLERİ', '', '', '', '', '', '', ''],
      ['', '1/2"-2" Boru Demontaj', 'mt', 1931, '', '', 200, 386200, ''],
      ['', '2"-4" Boru Demontaj', 'mt', 886, '', '', 300, 265800, ''],
      ['', '1/2" Siyah Boru', 'mt', 300, '', '', 350, 105000, ''],
    ];
    const res = await svc.prepare(fixture(aoa, []), { fixedSchema: true });
    const s = res.sheets[0];
    const d = s.rowData.filter((r: any) => r._isDataRow);
    // FIXTURE KANITI: veri satirlari taniniyor ve İşç. Toplam ZATEN geliyor
    // (yani asagidaki birim-fiyat iddiasi bos kumeden degil).
    check('İB0 FIXTURE KANITI: 3 veri satırı tanındı', d.length === 3,
      `isEmpty=${s.isEmpty} rows=${d.length}`);
    check('İB0b FIXTURE KANITI: İşç. Toplam Excel\'den geliyor (kontrol grubu)',
      d.some((r: any) => Number(r._labToplam) === 386200),
      `_labToplam=${d.map((r: any) => r._labToplam).join(',')}`);
    // ASIL IDDIA: fiyatsiz "İşçilik Birim" basligi laborUnitPrice olmali ve
    // degerler sabit alana TASINMALI.
    check('İB1 "İşçilik Birim" (fiyatsız yazım) → işçilik birim fiyatları gride gelir',
      d.map((r: any) => Number(r._labBirim)).join(',') === '200,300,350',
      `_labBirim=${d.map((r: any) => r._labBirim).join(',')}`);
    // Birim (mt) kolonu fiyat roluyle KARISMAMALI.
    check('İB1b "Birim" kolonu (mt) hâlâ birim olarak yerleşir',
      d.every((r: any) => String(r._birim ?? '').trim().toLowerCase() === 'mt'),
      `_birim=${d.map((r: any) => r._birim).join(',')}`);
  }
  // ── İB2: IKIZ — "Malzeme Birim" (fiyatsiz) malzeme tarafinda ──
  {
    const aoa: any[][] = [
      ['No', 'Malzeme Adı', 'Birim', 'Miktar', 'Malzeme Birim', 'Malzeme Toplam'],
      ['', '1/2" Siyah Boru', 'mt', 300, 150, 45000],
      ['', '3/4" Siyah Boru', 'mt', 463, 180, 83340],
    ];
    const res = await svc.prepare(fixture(aoa, []), { fixedSchema: true });
    const s = res.sheets[0];
    const d = s.rowData.filter((r: any) => r._isDataRow);
    check('İB2 İKİZ: "Malzeme Birim" (fiyatsız yazım) → malzeme birim fiyatları gride gelir',
      d.map((r: any) => Number(r._matBirim)).join(',') === '150,180',
      `_matBirim=${d.map((r: any) => r._matBirim).join(',')}`);
  }
  // ── İB3: KARSI ORNEK KILIDI — "İşçilik Birimi" altinda GERCEK birim (mt/ad) ──
  // Sayisal icerik sarti olmasa bu kolon fiyat rolu kapardi; mt/ad metinleri
  // birim fiyat sanilirdi. Bugunku dogru davranis (unit atamasi) KORUNMALI.
  // ⚠ FIXTURE DERSI (mutasyonla yakalandi): ilk desen `/birim\b/` idi ve
  //   "Birimi" (ekli yazim) desene ZATEN tutmuyordu — İB3 sayisal sart
  //   sayesinde degil, TESADUFEN yesildi (sart kaldirilinca da yesil kaldi).
  //   Desene ek toleransi (birim(i|leri)?) eklendi; artik bu blok GERCEKTEN
  //   sayisal sarti olcuyor — İB4 de ayni yazimin fiyat-icerikli halini kilitler.
  {
    const aoa: any[][] = [
      ['No', 'İmalat Tanımı', 'Miktar', 'İşçilik Birimi', 'İşçilik Toplam'],
      ['1', 'Boru montajı', 100, 'mt', 20000],
      ['2', 'Vana montajı', 5, 'ad', 1500],
    ];
    const res = await svc.prepare(fixture(aoa, []), { fixedSchema: true });
    const s = res.sheets[0];
    const d = s.rowData.filter((r: any) => r._isDataRow);
    // ⚠ OLCUT DERSI (mutasyonla yakalandi, 2. tur): ilk assert
    //   `!(Number(_labBirim) > 0)` idi — Number('mt')=NaN>0 false oldugu
    //   icin sart kaldirildiginda da yesil kaliyordu. Mutasyon altinda
    //   olculen gercek bozulma: ayni kolon HEM unit HEM laborUnitPrice
    //   rolu aliyor ve 'mt'/'ad' metinleri fiyat alanina TASINIYOR.
    //   Dogru olcut: fiyat alani TAMAMEN BOS kalmali.
    check('İB3 ★ "İşçilik Birimi" içeriği mt/ad ise FİYAT ROLÜ ALMAZ (fiyat alanı BOŞ kalır)',
      d.every((r: any) => /^(mt|ad)$/i.test(String(r._birim ?? '').trim()))
      && d.every((r: any) => String(r._labBirim ?? '').trim() === ''),
      `_birim=${d.map((r: any) => r._birim).join(',')} _labBirim=${d.map((r: any) => JSON.stringify(r._labBirim)).join(',')}`);
  }
  // ── İB4: EKLI YAZIM + SAYISAL icerik → fiyat rolu ALMALI (İB3'un ikizi) ──
  // İB3 ile birlikte sayisal sartin IKI YONUNU kilitler: ayni baslik, icerik
  // sayiysa FIYAT, mt/ad ise BIRIM. Boylece İB3'un dali surdugu de kanitlanir
  // (desen tutmasaydi İB4 de kirmizi olurdu — bir assert tek kriter).
  {
    const aoa: any[][] = [
      ['No', 'İmalat Tanımı', 'Birim', 'Miktar', 'İşçilik Birimi', 'İşçilik Toplam'],
      ['1', 'Boru montajı', 'mt', 100, 200, 20000],
      ['2', 'Vana montajı', 'ad', 5, 300, 1500],
    ];
    const res = await svc.prepare(fixture(aoa, []), { fixedSchema: true });
    const s = res.sheets[0];
    const d = s.rowData.filter((r: any) => r._isDataRow);
    check('İB4 "İşçilik Birimi" içeriği SAYI ise fiyat olarak gelir (ek toleransı)',
      d.map((r: any) => Number(r._labBirim)).join(',') === '200,300',
      `_labBirim=${d.map((r: any) => r._labBirim).join(',')}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`EXCEL GRID PARSE: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
