/**
 * Admin Import Sadakati Test Suite (Duzeltme Talebi Y1/Y2/Y4) — DB GEREKMEZ
 *   npx ts-node test/admin-import-test.ts
 */

import { parseTrNumber, walkCategories, detectExtraRoles, ImportRowView } from '../src/utils/import-fidelity';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Y4: TR sayi ayristirma ─────────────────────────────────
function num(raw: unknown, value: number | null, ambiguous = false) {
  const r = parseTrNumber(raw);
  check(`parseTrNumber(${JSON.stringify(raw)}) → ${value}${ambiguous ? ' (belirsiz)' : ''}`,
    r.value === value && r.ambiguous === ambiguous,
    `got ${JSON.stringify(r)}`);
}
num(540, 540);
num('540', 540);
num('540,50', 540.5);
num('1.234,56', 1234.56);
num('₺1.234,56', 1234.56);
num('1.234.567', 1234567);       // cift nokta → binlik
num('540.5', 540.5);              // tek nokta, 1 hane → ondalik
num('540.25', 540.25);            // tek nokta, 2 hane → ondalik
num('540.000', null, true);       // BELIRSIZ: 540000 mu 540 mi? — sessiz varsayim YOK
num('₺540.000', null, true);
num('1,234,567', 1234567);        // cift virgul → EN binlik
num('', null);
num('abc', null);
num('  2.500,00 TL ', 2500);

// ── Y1: kategori yuruyusu ──────────────────────────────────
{
  const rows: ImportRowView[] = [
    { isDataRow: false, name: 'Esnek Metal Hortum / Örgülü Hortum', priceRaw: '' }, // kategori
    { isDataRow: true, name: 'AISI 304 Hortum', priceRaw: '540,50' },
    { isDataRow: true, name: 'AISI 316 Hortum', priceRaw: '620' },
    { isDataRow: false, name: 'Sprinkler Bağlantı Hortumu ve Seti', priceRaw: '' }, // yeni kategori
    { isDataRow: true, name: 'Sprink Seti 1"', priceRaw: '890' },
    { isDataRow: false, name: '', priceRaw: '' }, // bos satir — kategori DEGIL
    { isDataRow: true, name: 'Sprink Seti 2"', priceRaw: '990' },
  ];
  const k = walkCategories(rows);
  check('Y1 ilk grup', k[1] === 'Esnek Metal Hortum / Örgülü Hortum' && k[2] === k[1], `got ${k[1]} / ${k[2]}`);
  check('Y1 kategori SIFIRLANIR (C2 mantigi)', k[4] === 'Sprinkler Bağlantı Hortumu ve Seti', `got ${k[4]}`);
  check('Y1 bos satir kategoriyi bozmaz', k[6] === 'Sprinkler Bağlantı Hortumu ve Seti', `got ${k[6]}`);
  check('Y3 Turkce birebir (Örgülü korunur)', (k[1] ?? '').includes('Örgülü'), `got "${k[1]}"`);
}

// ── Y2: cins/cap kolon tespiti ─────────────────────────────
{
  const r = detectExtraRoles([
    { field: 'col0', headerName: 'MALZEME ADI' },
    { field: 'col1', headerName: 'MALZEME CİNSİ' },
    { field: 'col2', headerName: 'ÇAP' },
    { field: 'col3', headerName: 'BİRİM' },
    { field: 'col4', headerName: 'FİYAT' },
  ]);
  check('Y2 cins kolonu', r.cinsField === 'col1', `got ${r.cinsField}`);
  check('Y2 cap kolonu', r.capField === 'col2', `got ${r.capField}`);
}
{
  // "CINSI TANIM" gibi ad-kolonu basliklari cins sanilmamali
  const r = detectExtraRoles([
    { field: 'c0', headerName: 'CİNSİ TANIMI' },
    { field: 'c1', headerName: 'FİYAT' },
  ]);
  check('Y2 "cinsi tanimi" cins DEGIL', r.cinsField === undefined, `got ${r.cinsField}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
console.log('='.repeat(60));
if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);
