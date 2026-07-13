/**
 * Admin Import Sadakati Test Suite (Duzeltme Talebi Y1/Y2/Y4 + Z1-Z6) — DB GEREKMEZ
 *   npx ts-node test/admin-import-test.ts
 */

import {
  parseTrNumber, walkCategories, detectExtraRoles, detectCurrency,
  inferPriceFormat, flagPriceOutliers, ImportRowView,
} from '../src/utils/import-fidelity';
import { deriveEtiketler, isValidAdOverride } from '../src/utils/etiket-display';

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

// ── Z2: dosya karari (dotMeaning) belirsizligi cozer ────────
{
  const t = parseTrNumber('540.000', 'thousands');
  check('Z2 binlik karari: 540.000 → 540000', t.value === 540000 && !t.ambiguous, `got ${JSON.stringify(t)}`);
  const d = parseTrNumber('540.000', 'decimal');
  check('Z2 ondalik karari: 540.000 → 540', d.value === 540 && !d.ambiguous, `got ${JSON.stringify(d)}`);
  const s = parseTrNumber('$15.000', 'decimal');
  check('Z2 karar para biriminden bagimsiz: $15.000 → 15', s.value === 15 && !s.ambiguous, `got ${JSON.stringify(s)}`);
  const kesin = parseTrNumber('1.234,56', 'decimal');
  check('Z2 karar KESIN bicimi ezmez: 1.234,56 → 1234.56', kesin.value === 1234.56, `got ${JSON.stringify(kesin)}`);
}

// ── Z1: kolon duzeyinde bicim cikarimi ──────────────────────
{
  // F5: hem nokta hem virgullu ornek varsa bicim kesin — soru sorulmaz
  const f5 = inferPriceFormat(['1.234,50', '637.000', '646.000']);
  check('Z1/F5 karma ornek → nokta=binlik, soru YOK', f5.dotMeaning === 'thousands' && f5.ambiguousCount === 2,
    `got ${JSON.stringify(f5)}`);

  // Yalniz virgullu ondalik (540,50) da kanittir → nokta binlik
  const commaEv = inferPriceFormat(['540,50', '637.000']);
  check('Z1 virgul-ondalik kaniti → nokta=binlik', commaEv.dotMeaning === 'thousands', `got ${JSON.stringify(commaEv)}`);

  // Cift noktali deger (1.234.567) kanittir → nokta binlik
  const multiDot = inferPriceFormat(['1.234.567', '637.000']);
  check('Z1 cift-nokta kaniti → nokta=binlik', multiDot.dotMeaning === 'thousands', `got ${JSON.stringify(multiDot)}`);

  // Tek nokta ≠3 hane (540.5) kanittir → nokta ondalik
  const decEv = inferPriceFormat(['540.5', '637.000']);
  check('Z1 kisa-ondalik kaniti → nokta=ondalik', decEv.dotMeaning === 'decimal', `got ${JSON.stringify(decEv)}`);

  // F1 (AYVAZ vakasi): TUM degerler "637.000" bicimi → kanit yok, TEK soru
  const f1 = inferPriceFormat(['25430.000', '637.000', '646.000', '15.000']);
  check('Z1/F1 tum degerler belirsiz → soru (dotMeaning=null)', f1.dotMeaning === null && f1.ambiguousCount === 4,
    `got ${JSON.stringify(f1)}`);
  check('Z1/F1 ornekler dolu (max 3, tekil)', f1.samples.length === 3, `got ${JSON.stringify(f1.samples)}`);

  // Celiskili kanit → karar verilmez (guvenli taraf)
  const conflict = inferPriceFormat(['540,50', '99.5', '637.000']);
  check('Z1 celiskili kanit → karar YOK', conflict.dotMeaning === null, `got ${JSON.stringify(conflict)}`);

  // Number hucreler kanit sayilmaz
  const nums = inferPriceFormat([540, 620.5, '637.000']);
  check('Z1 number hucreler kanit degil', nums.dotMeaning === null && nums.ambiguousCount === 1,
    `got ${JSON.stringify(nums)}`);
}

// ── Z4: para birimi tespiti (cevrimsiz etiketleme) ──────────
{
  check('Z4 $ → USD', detectCurrency('$15.000') === 'USD');
  check('Z4 € → EUR', detectCurrency('€99,50') === 'EUR');
  check('Z4 ₺ → TRY', detectCurrency('₺637.000') === 'TRY');
  check('Z4 "USD" metni → USD', detectCurrency('Birim Fiyat (USD)') === 'USD');
  check('Z4 sembolsuz → null (baslik/varsayilana duser)', detectCurrency('637.000') === null);
}

// ── Z6: makulluk kontrolu (sapan isaretleme) ────────────────
{
  const items = [
    { price: 100, kategori: 'Vana' },
    { price: 120, kategori: 'Vana' },
    { price: 110, kategori: 'Vana' },
    { price: 115000, kategori: 'Vana' },  // medyanin ×1000'i → sapan
    { price: 0, kategori: 'Vana' },       // sifir → sapan
    { price: -5, kategori: 'Vana' },      // negatif → sapan
    { price: null, kategori: 'Vana' },    // belirsiz → isaret yok
  ];
  const flags = flagPriceOutliers(items);
  check('Z6 normal fiyatlar isaretsiz', flags[0] === null && flags[1] === null && flags[2] === null,
    `got ${JSON.stringify(flags.slice(0, 3))}`);
  check('Z6 ×1000 sicrama isaretli', !!flags[3] && flags[3]!.includes('×'), `got ${flags[3]}`);
  check('Z6 sifir fiyat isaretli', flags[4] === 'sıfır fiyat', `got ${flags[4]}`);
  check('Z6 negatif fiyat isaretli', flags[5] === 'negatif fiyat', `got ${flags[5]}`);
  check('Z6 null fiyat isaretsiz', flags[6] === null, `got ${flags[6]}`);

  // Kucuk grup (<3) medyan kiyasi yapmaz — yanlis alarm yok
  const small = flagPriceOutliers([
    { price: 10, kategori: 'X' },
    { price: 90000, kategori: 'X' },
  ]);
  check('Z6 kucuk grupta medyan kiyasi YOK', small[0] === null && small[1] === null, `got ${JSON.stringify(small)}`);
}

// ── 3-ETIKET MODELI: AD/CINS/CAP turetimi (onizleme gosterimi) ──
{
  const s = deriveEtiketler('Ayvaz Sprinkler 68°C Pendent 1/2" DN15');
  check('3E sprinkler: AD=Sprinkler', s.ad === 'Sprinkler' && s.adSlug === 'sprinkler', `got ${JSON.stringify(s)}`);
  check('3E sprinkler: CAP=DN15', s.cap === 'DN15', `got ${s.cap}`);
  check('3E sprinkler: CINS 68°C + Pendent icerir', s.cins.includes('68°C') && s.cins.includes('Pendent'), `got "${s.cins}"`);

  const v = deriveEtiketler('DOĞALGAZ VANASI KÜRESEL DN50');
  check('3E vana: AD=Küresel Vana', v.ad === 'Küresel Vana', `got ${v.ad}`);
  check('3E vana: CINS Doğalgaz icerir', v.cins.includes('Doğalgaz'), `got "${v.cins}"`);
  check('3E vana: CAP=DN50', v.cap === 'DN50', `got ${v.cap}`);

  const ck = deriveEtiketler('KÜRESEL VE KELEBEK VANALAR DN15');
  check('3E coklu AD: Küresel/Kelebek Vana', ck.ad === 'Küresel/Kelebek Vana', `got ${ck.ad}`);

  const u = deriveEtiketler('ÖZEL KALEM XR-2000');
  check('3E cozulemedi: AD=null (isaretlenir)', u.ad === null && u.adSlug === null, `got ${JSON.stringify(u)}`);

  const h = deriveEtiketler('ESNEK SPRİNKLER HORTUMU 50 cm');
  check('3E hortum: AD=Hortum + CAP=500 mm', h.ad === 'Hortum' && h.cap === '500 mm', `got ${JSON.stringify(h)}`);

  // adOverride guvenligi: yalniz bilinen slug'lar
  check('3E adOverride: vana gecerli', isValidAdOverride('vana') === true);
  check('3E adOverride: rastgele deger RED', isValidAdOverride('drop table') === false && isValidAdOverride(null) === false);

  // vt→vana terfisi (canli vaka): adinda 'vana' gecmeyen kelebek urunu
  const iz = deriveEtiketler('İzleme Anahtarlı Kelebek Wafer Yangın 3"');
  check('3E vt-terfi: AD=Kelebek Vana', iz.ad === 'Kelebek Vana' && iz.adSlug === 'vana', `got ${JSON.stringify(iz)}`);
  check('3E vt-terfi: CINS izleme-anahtarli icerir', iz.cins.includes('İzleme Anahtarlı'), `got "${iz.cins}"`);
  // Koruma: kelebek somun vana DEGILDIR
  const somun = deriveEtiketler('Kelebek Somun 1/2"');
  check('3E vt-terfi korumasi: kelebek somun vana degil', somun.adSlug !== 'vana', `got ${JSON.stringify(somun)}`);

  // ── AD-CINS SOZLUGU (Excel seed) ──
  const dolap = deriveEtiketler('Yangın Dolabı Camlı Makaralı');
  check('Sozluk: yangin dolabi ailesi', dolap.adSlug === 'yangin-dolabi' && dolap.ad === 'Yangın dolabı', `got ${JSON.stringify(dolap)}`);
  const ch = deriveEtiketler('SU SOĞUTMA GRUBU 500 kW');
  check('Sozluk es anlamli: su sogutma grubu → chiller', ch.adSlug === 'chiller', `got ${JSON.stringify(ch)}`);
  const siber = deriveEtiketler('Şiber Vana DN50');
  check('Sozluk vt es anlamli: siber → Sürgülü Vana', siber.ad === 'Sürgülü Vana', `got ${JSON.stringify(siber)}`);
  const kond = deriveEtiketler('Termostatik Kondenstop DN25');
  check('Sozluk oncelik: termostatik kondenstop VANA DEGIL kondenstop', kond.adSlug === 'kondenstop', `got ${JSON.stringify(kond)}`);
  const kanaliz = deriveEtiketler('KANALİZASYON HATTI DN200');
  check('Sozluk koruma: kanalizasyon hava kanali DEGIL', kanaliz.adSlug !== 'kanal', `got ${JSON.stringify(kanaliz)}`);
  const yivli = deriveEtiketler('Test Drenaj Vanası Yivli DN25');
  check('Cins: yivli baglanti etiketi', yivli.cins.includes('Yivli'), `got "${yivli.cins}"`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
console.log('='.repeat(60));
if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);
