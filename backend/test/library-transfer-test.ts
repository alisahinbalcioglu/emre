/**
 * Kutuphane Aktarim Sadakati Test Suite (L1/L2/L3, G1/G2) — DB GEREKMEZ
 *   npx ts-node test/library-transfer-test.ts
 */

import { buildLibrarySheetRows, LibrarySheetItem } from '../src/library/library-sheet-builder';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const item = (id: string, name: string, kategori: string | null, extra: Partial<LibrarySheetItem> = {}): LibrarySheetItem => ({
  id, materialName: name, listPrice: 100, kategori, ...extra,
});

// ── G1: gruplu yapi BIREBIR — ayni gruplar, ayni sira, birebir sayi ──
{
  const items = [
    item('a1', 'ACOP 100i', 'ACOP Çift Pompali ACOP'),
    item('a2', 'ACOP 200i', 'ACOP Çift Pompali ACOP'),
    item('b1', 'ACOP Tek 100i', 'ACOP Tek Pompali ACOP'),
    item('b2', 'ACOP Tek 200i', 'ACOP Tek Pompali ACOP'),
    item('b3', 'ACOP Tek 300i', 'ACOP Tek Pompali ACOP'),
  ];
  const s = buildLibrarySheetRows(items);
  const bands = s.rowData.filter((r) => r._isGroupRow);
  const dataRows = s.rowData.filter((r) => r._isDataRow);

  check('G1 grup sayisi (2)', bands.length === 2, `got ${bands.length}`);
  check('G1 grup sirasi kaynak sirasi', bands[0]._groupLabel === 'ACOP Çift Pompali ACOP' && bands[1]._groupLabel === 'ACOP Tek Pompali ACOP',
    `got ${bands.map((b: any) => b._groupLabel).join(' | ')}`);
  check('G1 grup sayaclari (2/3)', bands[0]._groupCount === 2 && bands[1]._groupCount === 3,
    `got ${bands[0]._groupCount}/${bands[1]._groupCount}`);
  check('G1 urun sayisi BIREBIR (5)', dataRows.length === items.length, `got ${dataRows.length}`);
  check('G1 urun sirasi korunur', dataRows.map((r) => r._libraryItemId).join(',') === 'a1,a2,b1,b2,b3',
    `got ${dataRows.map((r) => r._libraryItemId).join(',')}`);
  check('G1 band data satirdan ONCE gelir', s.rowData[0]._isGroupRow === true && s.rowData[1]._isDataRow === true);
  check('L3 _groupKey her data satirinda', dataRows.every((r) => typeof r._groupKey === 'string' && r._groupKey.length > 0),
    `got ${dataRows.map((r) => r._groupKey).join(',')}`);
  check('G1 numaralama yalniz data satirlari (1..5)', dataRows.map((r) => r.col0).join(',') === '1,2,3,4,5',
    `got ${dataRows.map((r) => r.col0).join(',')}`);
}

// ── G2: kolon basligi satiri URUN OLAMAZ — sentetik header yok ──
{
  const s = buildLibrarySheetRows([item('x', 'Vana 1/2"', null)]);
  check('G2 header satiri YOK (_isHeaderRow)', s.rowData.every((r) => r._isHeaderRow !== true));
  check('G2 "Malzeme Adi" metni satir olarak yok', s.rowData.every((r) => r.col1 !== 'Malzeme Adi'),
    `rows: ${s.rowData.map((r) => r.col1).join(' | ')}`);
  check('G2 kategorisiz liste = bandsiz duz liste', s.rowData.length === 1 && s.rowData[0]._isDataRow === true);
}

// ── L1: alanlar birebir — adRaw / cins / cap yalniz veri varsa ──
{
  const s = buildLibrarySheetRows([
    item('c1', 'SIYAH BORU Boyali 2"', 'Borular', { adRaw: 'SİYAH BORU', cins: 'Boyalı', cap: '2"', currency: 'USD', discountRate: 15 }),
  ]);
  const row = s.rowData.find((r) => r._isDataRow)!;
  check('L1 adRaw BIREBIR gosterilir', row.col1 === 'SİYAH BORU', `got ${row.col1}`);
  check('L1 cins kolonu var + dolu', s.columnDefs.some((c) => c.field === 'col_cins') && row.col_cins === 'Boyalı');
  check('L1 cap kolonu var + dolu', s.columnDefs.some((c) => c.field === 'col_cap') && row.col_cap === '2"');
  check('Z4 _currency tasinir', row._currency === 'USD', `got ${row._currency}`);
  check('Iskonto korunur (_libraryDiscountRate)', row._libraryDiscountRate === 15, `got ${row._libraryDiscountRate}`);

  const sade = buildLibrarySheetRows([item('d1', 'Vana', null)]);
  check('L1 cins/cap verisi yoksa kolon da yok',
    !sade.columnDefs.some((c) => c.field === 'col_cins' || c.field === 'col_cap'));
}

// ── Kategorisiz aradaki satir: banda dahil olmaz, grup akisi bozulmaz ──
{
  const s = buildLibrarySheetRows([
    item('e1', 'Urun A', 'Grup 1'),
    item('e2', 'Serbest Urun', null),
    item('e3', 'Urun B', 'Grup 2'),
  ]);
  const bands = s.rowData.filter((r) => r._isGroupRow);
  check('Karma: 2 band (null kategori band acmaz)', bands.length === 2, `got ${bands.length}`);
  const serbest = s.rowData.find((r) => r._libraryItemId === 'e2')!;
  check('Karma: kategorisiz satir _groupKey bos', serbest._groupKey === '', `got "${serbest._groupKey}"`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
console.log('='.repeat(60));
if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);
