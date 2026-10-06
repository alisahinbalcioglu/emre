/**
 * FAZ C (C3) KILIDI — URUN INDEKSI v20: B12 "steel" · A10 DN hanesi · B15 inc oneki/parmak
 *   npx ts-node test/urun-indeksi-v20-test.ts   (npm run test:urun-indeksi-v20)
 *
 * Uc kural da SATIR ve URUN tarafinin ORTAK yolunda (resolveFamily /
 * extractSizeInfo) — urunun aile/cap etiketleri degisir → INDEX_VERSION 20,
 * deploy sonrasi yeniden indeksleme (v19 ile ayni komut).
 *
 * OLCULDU (05.10, mevcut kod):
 *   B12 TYPE_PATTERNS'te yalin /tee/ "steel"in icinden tutuyor: "Paslanmaz
 *       Steel" / "Galvanized Steel" adli urunun AILESI 'fitting' cikiyor.
 *   A10 line-parser'daki "ciplak PE yolu" dali yorumunun anlattigi isi HIC
 *       yapmiyor ("63 PE100 SDR17" → cap yok — o is A8, karar: dokunulmaz);
 *       fiilen yalniz BITISIK tek/dort haneli DN'i yakaliyor: satirda "DN8"
 *       okunuyor ama "DN 8" okunmuyor; "DN1000" satirda okunuyor, URUNDE hic
 *       okunmuyor (extractSizeInfo 2-3 hane) → ayni urun kendi adiyla capsiz
 *       sayiliyor. Cozum: kural extractSizeInfo'da (satir + urun ortak),
 *       DN 6/8 ve 4 haneli; dal kaldirildi.
 *   B15 inc ONEK yazimi ("INC 2 SİYAH BORU", "inch 2 boru") ve Turkce "parmak"
 *       ("2 parmak siyah boru" = 2") okunmuyor; kelimeler bilinmeyen sayiliyor.
 */
import { buildProductIndex, resolveFamily, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { extractSizeInfo } from '../src/ozellik/eslestirme/matching/conversion';
import { extractMaterialType } from '../src/ozellik/eslestirme/matching/normalizer';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);
let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return { id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null } } as IndexedRow;
}
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} ${js((o.kind === 'ask' ? o.rows : o.row ? [o.row] : []).map((r: any) => `${r.urun.ad}@${r.listPrice}`))} kapilar=${js(o.kapilar)}`;
const capOf = (t: string) => { const s = extractSizeInfo(t); return s ? `${s.source}:${s.value}` : null; };

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // >= : sonraki surum artislari (v21 P2 6a) bu partinin sartini bozmaz
    check('SURUM: INDEX_VERSION >= 20', (INDEX_VERSION as number) >= 20, String(INDEX_VERSION));

    // ══ B12 · "steel" tee DEGILDIR ══════════════════════════════════════
    for (const t of ['Paslanmaz Steel', 'Galvanized Steel', 'Carbon Steel Sheet']) {
      check(`★ B12 "${t}" fitting DEGIL`, extractMaterialType(t) !== 'fitting' && resolveFamily(t, null) !== 'fitting', `${extractMaterialType(t)} / ${resolveFamily(t, null)}`);
    }
    for (const t of ['Tee 2"', 'Eşit Tee 1"', 'Galvaniz Tee', 'Tees 1"']) check(`B12 karsi: "${t}" → fitting`, extractMaterialType(t) === 'fitting', extractMaterialType(t));
    check('B12 karsi: "Steel Flange DN50" → flans (sondan cozum)', resolveFamily('Steel Flange DN50', null) === 'flans', String(resolveFamily('Steel Flange DN50', null)));

    // ══ A10 · DN hanesi satir ve urunde AYNI ════════════════════════════
    const dn: Array<[string, string | null]> = [
      ['DN8 Küresel Vana', 'dn:8'], ['DN 8 Küresel Vana', 'dn:8'], ['DN6 Vana', 'dn:6'],
      ['DN1000 Kelebek Vana', 'dn:1000'], ['Kelebek Vana DN 1200', 'dn:1200'],
    ];
    for (const [t, b] of dn) check(`★ A10 extractSizeInfo("${t}") = ${b}`, capOf(t) === b, String(capOf(t)));
    for (const [t, b] of dn) check(`A10 satir "${t}" ayni (${b})`, (() => { const c = parseLine(t).capInfo; return c ? `${c.source}:${c.value}` : null; })() === b, js(parseLine(t).capInfo));
    // KARSI: anlamsiz DN degerleri olcu sayilmaz (eski arka kapi DN1, DN12345'i okuyordu)
    for (const t of ['DN1 Vana', 'DN5 Vana', 'DN12345 Vana']) check(`★ A10 karsi: "${t}" → cap yok (satir ve urun)`, capOf(t) === null && parseLine(t).capInfo === null, `${capOf(t)} / ${js(parseLine(t).capInfo)}`);
    check('A10 karsi: "63 PE100 SDR17" (A8 — dokunulmadi) cap yok', parseLine('63 PE100 SDR17').capInfo === null, js(parseLine('63 PE100 SDR17').capInfo));
    const v1000 = urun({ ad: 'Kelebek Vana', cins: 'döküm', cap: 'DN1000', price: 99000 });
    check('A10 urun: "DN1000" cap sutunu etiket uretir', v1000.urun.capTags.length > 0, js(v1000.urun.capTags));
    const o = runQuery(parseLine('Kelebek Vana DN1000'), [v1000]) as any;
    check('★ A10 motor: "Kelebek Vana DN1000" | [Kelebek Vana DN1000] → otomatik (capsiz-dusum degil)', o.kind === 'single' && o.row?.listPrice === 99000, ozet(o));

    // ══ B15 · inc ONEK yazimi ve "parmak" ═══════════════════════════════
    const inc: Array<[string, string]> = [
      ['INC 2 SİYAH BORU', 'inch:2'], ['inch 2 boru', 'inch:2'], ['inç 1 1/4 galvaniz boru', 'inch:1.25'],
      ['2 parmak siyah boru', 'inch:2'], ['parmak 2 boru', 'inch:2'], ['3/4 parmak küresel vana', 'inch:0.75'],
    ];
    for (const [t, b] of inc) check(`★ B15 "${t}" → ${b}`, capOf(t) === b, String(capOf(t)));
    for (const t of ['INC 2 SİYAH BORU', '2 parmak siyah boru']) {
      const tk = parseLine(t).tokens;
      check(`★ B15 "${t}" belirtecleri inc/parmak TASIMAZ`, !tk.includes('inc') && !tk.includes('parmak'), js(tk));
    }
    // KARSI
    check('B15 karsi: "4 parmaklı kelepçe" → olcu degil (parmakli sifat)', capOf('4 parmaklı kelepçe') === null, String(capOf('4 parmaklı kelepçe')));
    check('B15 karsi: "2 inch siyah boru" (sonek) aynen → inch:2', capOf('2 inch siyah boru') === 'inch:2', String(capOf('2 inch siyah boru')));
    check('B15 karsi: "parmak" tek basina olcu uretmez', capOf('Parmak Kilit') === null, String(capOf('Parmak Kilit')));
    check('B15 karsi: sonek inc\'ten sonraki sayi olcu degil — "Küresel Vana 1 1/4 inch 10 adet" → 1 1/4"', capOf('Küresel Vana 1 1/4 inch 10 adet') === 'inch:1.25', String(capOf('Küresel Vana 1 1/4 inch 10 adet')));
    const sb = urun({ ad: 'Siyah Çelik Boru', cins: 'siyah', cap: '2"', price: 300 });
    const sb1 = urun({ ad: 'Siyah Çelik Boru', cins: 'siyah', cap: '1"', price: 150 });
    const o2 = runQuery(parseLine('2 parmak siyah boru'), [sb, sb1]) as any;
    check('★ B15 motor: "2 parmak siyah boru" → 2" urun, otomatik', o2.kind === 'single' && o2.row?.listPrice === 300, ozet(o2));
  } finally { console.warn = warn; }

  console.log(`\n${'='.repeat(60)}\nURUN INDEKSI v20 (FAZ C3): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
