/**
 * FAZ B PARTI 2b KILIDI — URUN INDEKSI (v19 icinde: parti 1 ile BIRLIKTE deploy)
 *   npx ts-node test/urun-indeksi-v19-test.ts   (npm run test:urun-indeksi-v19)
 *
 * KOORDINATOR KARARI (05.10, Emre'nin surekli onayi, "onerilenle devam"):
 *   · "Atık su borusu" varsayilani: DAR KURAL — ADINDA pis su / atık su /
 *     gider gecen MALZEMESIZ boru plastic sayilir.
 *   · Parti 1 ve 2 birlikte, TEK v19 yeniden indekslemesiyle cikar.
 *
 * OLCULDU (04.10):
 *   ATIK SU  malzeme sinyali olmayan boru/vana/fitting STEEL'e duser (bilincli
 *            varsayilan) → "Atık su borusu 110 mm" (malzemesiz) 110 mm → dn100,
 *            pis su satirinin PLASTIK sinif suzgecinde ELENIYOR — kutuphanede
 *            olan pis su borusu "bulunamadi".
 *   PE100    "PE 100 BORU 63 mm" ↔ urun "PE100 Boru": satir belirtecleri
 *            ['pe','100'], urun 'pe100' → "100" bilinmeyen kelime → ONAY.
 *            Ters yon ("PE100" satir ↔ "PE 100" urun) de ayni. Cozum tee→te
 *            emsali: KANONIK_ESANLAM (tokenize — satir VE urun ayni yoldan).
 */

import { buildProductIndex, tokenize, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return { id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null } } as IndexedRow;
}
const sinif = (c: Partial<ProductColumns> & { ad: string }) => buildProductIndex({ price: 1, ...c } as ProductColumns).sizeClass;
const sor = (q: string, h: IndexedRow[], opts?: any) => runQuery(parseLine(q), h, opts) as any;
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} ${JSON.stringify((o.kind === 'ask' ? o.rows : o.row ? [o.row] : []).map((r: any) => `${r.urun.ad}@${r.listPrice}`))} kapilar=${JSON.stringify(o.kapilar)}`;

async function main() {
  // ══ ATIK SU · malzemesiz pis su borusu plastic ══════════════════════════
  for (const ad of ['Atık su borusu', 'Pis Su Borusu', 'PİSSU BORUSU', 'Gider Borusu', 'Atık Su Boru Takımı']) {
    check(`★ ATIK SU "${ad}" (malzemesiz) → plastic`, sinif({ ad, cins: 'SN4', cap: '110 mm' }) === 'plastic', sinif({ ad, cins: 'SN4', cap: '110 mm' }));
  }
  const u = buildProductIndex({ ad: 'Atık su borusu', cins: 'SN4', cap: '110 mm', price: 1 } as ProductColumns);
  check('ATIK SU 110 mm → plastik etiketleri (od-110)', u.capTags.includes('od-110'), JSON.stringify(u.capTags));
  // KARSI: malzemesi YAZILI olan pis su borusu kendi malzemesiyle (dokum pis su borusu vardir)
  check('ATIK SU karsi: "Döküm Pis Su Borusu" → steel (malzeme yazili)', sinif({ ad: 'Döküm Pis Su Borusu', cap: '100 mm' }) === 'steel', sinif({ ad: 'Döküm Pis Su Borusu', cap: '100 mm' }));
  check('ATIK SU karsi: "PVC Pis Su Borusu" → plastic (zaten)', sinif({ ad: 'PVC Pis Su Borusu', cap: '110 mm' }) === 'plastic');
  // KARSI: kural DAR — malzemesiz ama pis su DEGIL → eski varsayilan (steel)
  check('ATIK SU karsi: malzemesiz "Boru" eski varsayilan (steel)', sinif({ ad: 'Boru', cap: '2"' }) === 'steel', sinif({ ad: 'Boru', cap: '2"' }));
  check('ATIK SU karsi: boru DISI aile ("Pis Su Pompası") varsayilani degismez', sinif({ ad: 'Pis Su Dalgıç Pompası', cap: 'DN50' }) === sinif({ ad: 'Dalgıç Pompa', cap: 'DN50' }), `${sinif({ ad: 'Pis Su Dalgıç Pompası', cap: 'DN50' })}`);
  // KARSI: karar ADINDA diyor — kategoride gecmesi yetmez
  check('ATIK SU karsi: yalniz KATEGORIDE "Pis Su" yazan malzemesiz boru → eski varsayilan', sinif({ ad: 'Boru', kategori: 'Pis Su Boruları', cap: '110 mm' }) === 'steel', sinif({ ad: 'Boru', kategori: 'Pis Su Boruları', cap: '110 mm' }));
  // MOTOR: pis su satiri malzemesiz atik su borusunu artik bulur
  const o1 = sor('PİS SU BORUSU 110 mm', [urun({ ad: 'Atık su borusu', cins: 'SN4', cap: '110 mm', price: 250 })], { hintClass: 'plastic', sizeClassHint: 'plastic', hintFamily: 'boru', ignoreTokens: ['pis', 'su'] });
  check('★ ATIK SU motor: pis su satiri malzemesiz atik su borusunu BULUR (sinif suzgecinden gecer)', (o1.kind === 'single' || o1.kind === 'ask') && (o1.row?.listPrice === 250 || o1.rows?.some((r: any) => r.listPrice === 250)), ozet(o1));

  // ══ PE100 · "PE 100" ↔ "PE100" ═════════════════════════════════════════
  check('PE100 tokenize("PE 100 Boru") → pe100', JSON.stringify(tokenize('PE 100 Boru')) === '["pe100","boru"]', JSON.stringify(tokenize('PE 100 Boru')));
  check('PE100 tokenize("PE 80 Boru") → pe80', JSON.stringify(tokenize('PE 80 Boru')) === '["pe80","boru"]', JSON.stringify(tokenize('PE 80 Boru')));
  check('PE100 tokenize("PE-100 Boru") → pe100 (zaten)', JSON.stringify(tokenize('PE-100 Boru')) === '["pe100","boru"]', JSON.stringify(tokenize('PE-100 Boru')));
  const p1 = sor('PE 100 BORU 63 mm', [urun({ ad: 'PE100 Boru', cins: 'SDR 11', cap: '63 mm', price: 90 })]);
  check('★ PE100 "PE 100 BORU 63 mm" | [PE100 Boru] → otomatik (@90)', p1.kind === 'single' && p1.row?.listPrice === 90, ozet(p1));
  const p2 = sor('PE100 BORU 63 mm', [urun({ ad: 'PE 100 Boru', cins: 'SDR 11', cap: '63 mm', price: 91 })]);
  check('★ PE100 ters yon "PE100 BORU 63 mm" | [PE 100 Boru] → otomatik (@91)', p2.kind === 'single' && p2.row?.listPrice === 91, ozet(p2));
  // KARSI: ayri sayi PE degeri degil — "PE BORU 100 mm" (cap) bozulmaz
  check('PE100 karsi: "PE BORU 100 mm" belirtecleri pe + boru (100 cap)', JSON.stringify(parseLine('PE BORU 100 mm').tokens) === '["pe","boru"]', JSON.stringify(parseLine('PE BORU 100 mm').tokens));
  check('PE100 karsi: "PE 125" (PE sinifi olmayan sayi) birlesmez', !tokenize('PE 125 Boru').includes('pe125'), JSON.stringify(tokenize('PE 125 Boru')));

  console.log(`\n${'='.repeat(60)}\nURUN INDEKSI v19 (FAZ B parti 2b): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
