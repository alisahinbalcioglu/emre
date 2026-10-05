/**
 * FAZ B PARTI 1 KILIDI — OLCU OKUYUCU (conversion.extractSizeInfo / capImzasi
 * + satir belirtecleri)
 *   npx ts-node test/olcu-okuyucu-test.ts   (npm run test:olcu-okuyucu)
 *
 * OLCULDU (04.10, uretim fonksiyonlari):
 *   B4  "PN 16 1/2\""          → 16,5"   (bilesik kesir PN degerini tam kisim sandi)
 *       "PN 10 3/4\""          → 10,75"
 *   B5  "PN10/16"              → 0,625"  (basinc sinifi kesir sanildi)
 *   B6  "Ø110 x 6,6 mm"        → 6,6 mm  (ondalik mm kurali bilesikten ONCE kosup
 *                                          ET KALINLIGINI cap sandi)
 *   B7  capImzasi("Ø110 x 6,6 mm") → bilesik (x her zaman reduksiyon ayirici)
 *   B9  "Φ110" "φ110" "⌀110" "∅110" → YOK (yalniz Ø taniniyordu)
 *   A5  "DN65xDN15"            → YOK     (\b, x'e yapisik DN'i gormuyor)
 *       "1-1/4\" DİRSEK"       → belirtec "11" (tokenize tireli rakamlari birlestiriyor)
 *       "2 inç BORU"           → belirtec "inc" (olcu birimi ad kelimesi kaldi)
 *   Motor sonucu: "1-1/4\" DİRSEK" / "1 1/4 inç DİRSEK" / "DN65xDN15 REDÜKSİYON"
 *   dogru urun kutuphanedeyken "bilinmeyen-kelime" ile ONAYA dusuyordu;
 *   bosluklu yazim (1 1/4" · DN65 x DN15) otomatik yaziliyordu.
 *
 * ⚠ Urun tarafi: ayni okuyucu urunun cap sutununu da indeksler (capTags
 * SAKLANIR) → INDEX_VERSION 19, deploy sonrasi yeniden indeksleme.
 */

import { extractSizeInfo, capImzasi } from '../src/ozellik/eslestirme/matching/conversion';
import { buildProductIndex, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
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
const olcu = (s: string) => { const i = extractSizeInfo(s); return i ? `${i.source}/${i.value}` : 'YOK'; };
const esit = (s: string, beklenen: string) => check(`${s} → ${beklenen}`, olcu(s) === beklenen, `olcu=${olcu(s)}`);

let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return { id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: null, boyMm: null,
      urunKodu: null, sheetName: null, price: c.price, birim: null } } as IndexedRow;
}
const sor = (q: string, h: IndexedRow[]) => runQuery(parseLine(q), h) as any;
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} ${JSON.stringify((o.kind === 'ask' ? o.rows : o.row ? [o.row] : []).map((r: any) => `${r.urun.capRaw}@${r.listPrice}`))} kapilar=${JSON.stringify(o.kapilar)}`;

async function main() {
  check('O INDEX_VERSION 19 (urun capTags degisir → yeniden indeksleme)', Number(INDEX_VERSION) === 19, `INDEX_VERSION=${INDEX_VERSION}`);

  // ── B4 PN + inc ────────────────────────────────────────────────────────
  esit('PN 16 1/2"', 'inch/0.5');
  esit('VANA PN 16 1/2"', 'inch/0.5');
  esit('PN 10 3/4"', 'inch/0.75');
  esit('PN 25 1 1/4"', 'inch/1.25');                // PN sonrasi gercek bilesik kesir korunur
  // karsi: PN'siz bilesik kesir AYNEN
  esit('2 1/2" VANA', 'inch/2.5');
  esit('VANA 1 1/2"', 'inch/1.5');

  // ── B5 PN10/16 ─────────────────────────────────────────────────────────
  esit('PN10/16', 'YOK');
  esit('PN 10/16', 'YOK');
  esit('PN10/16 FLANŞ DN50', 'dn/50');
  esit('3/16"', 'inch/0.1875');                     // karsi: payda 16 gecerli inc kesri

  // ── B6 et kalinligi ────────────────────────────────────────────────────
  esit('Ø110 x 6,6 mm', 'mm/110');
  esit('Ø110 x 6,6 mm BORU', 'mm/110');
  esit('BORU 110x6.6 mm', 'mm/110');
  esit('110 x 4,2 mm PVC', 'mm/110');
  // karsi: ondalik celik dis capi ve "Et" kurali AYNEN
  esit('21.3mm', 'mm/21.3');
  esit('Dış Çap 114.3mm Et 6.0mm', 'mm/114.3');
  esit('32x5.4', 'mm/32');

  // ── B7 capImzasi: et kalinligi reduksiyon DEGIL ────────────────────────
  check('★ B7 "Ø110 x 6,6 mm" bilesik DEGIL', capImzasi('Ø110 x 6,6 mm', 'plastic').bilesik === false, JSON.stringify(capImzasi('Ø110 x 6,6 mm', 'plastic')));
  check('B7 "110x6.6 mm" bilesik DEGIL', capImzasi('110x6.6 mm', 'plastic').bilesik === false, JSON.stringify(capImzasi('110x6.6 mm', 'plastic')));
  check('B7 karsi: "3\\"x1\\"" reduksiyon (bilesik)', capImzasi('3"x1"', 'steel').bilesik === true, JSON.stringify(capImzasi('3"x1"', 'steel')));
  check('B7 karsi: "2\\" x 1.5\\"" (ondalik INC) reduksiyon', capImzasi('2" x 1.5"', 'steel').bilesik === true, JSON.stringify(capImzasi('2" x 1.5"', 'steel')));
  check('B7 karsi: "110x90" (iki tam sayi) reduksiyon', capImzasi('110x90 mm', 'plastic').bilesik === true, JSON.stringify(capImzasi('110x90 mm', 'plastic')));

  // ── B9 cap simgeleri ───────────────────────────────────────────────────
  for (const simge of ['Φ', 'φ', '⌀', '∅', 'Ø']) esit(`${simge}110 BORU`, 'mm/110');

  // ── A5 DN65xDN15, tireli kesir, inc kelimesi ───────────────────────────
  esit('DN65xDN15 REDÜKSİYON', 'dn/15');
  check('★ A5 capImzasi DN65xDN15 = [dn15, dn65] bilesik',
    JSON.stringify(capImzasi('DN65xDN15', 'steel')) === JSON.stringify({ imza: ['dn15', 'dn65'], bilesik: true }), JSON.stringify(capImzasi('DN65xDN15', 'steel')));
  for (const [q, b] of [['1-1/4" DİRSEK', ['dirsek']], ['2-1/2" VANA', ['vana']], ['2 inç BORU', ['boru']], ['2 inch BORU', ['boru']], ['1 1/4 inç DİRSEK', ['dirsek']]] as const) {
    check(`A5 belirtec: "${q}" → ${JSON.stringify(b)}`, JSON.stringify(parseLine(q).tokens) === JSON.stringify(b), JSON.stringify(parseLine(q).tokens));
  }
  esit('PN 16-1/2"', 'inch/0.5');                    // tireli bilesik de PN'yi tam kisim sanmaz
  // Iki haneli tam kisim (celik dis cap yazimi): basit kesir ayiklamasi tek
  // basina '10' artigi birakir — bilesik ayiklama SART (mutant M9 olculdu).
  for (const q of ['10 3/4" BORU', '10-3/4" BORU']) check(`A5 belirtec: "${q}" → ["boru"]`, JSON.stringify(parseLine(q).tokens) === '["boru"]', JSON.stringify(parseLine(q).tokens));
  check('A5 belirtec: "VANA 15/16\\"" kesir artigi birakmaz', JSON.stringify(parseLine('VANA 15/16"').tokens) === '["vana"]', JSON.stringify(parseLine('VANA 15/16"').tokens));
  // karsi (once/sonra karsilastirmasindan): DN'siz boyut belirteci KORUNUR —
  // ilk surum '\d+x\d+'yi de olcu artigi sayip "Teflon Bant 12x10"daki
  // 12 mm x 10 m boyutunu dusuruyordu (Pimtas'ta 3 satir).
  check('A5 karsi: "Teflon Bant 12x10" boyut belirteci korunur', parseLine('Teflon Bant 12x10').tokens.includes('12x10'), JSON.stringify(parseLine('Teflon Bant 12x10').tokens));
  // karsi: olcu DISI sayi korunur (68°C), olcusuz satirda 'inc' kelimesi korunur
  check('A5 karsi: "Sprinkler 68°C 1/2\\"" sicaklik belirteci korunur', parseLine('Sprinkler 68°C 1/2"').tokens.some((t) => t.startsWith('68')), JSON.stringify(parseLine('Sprinkler 68°C 1/2"').tokens));
  check('A5 karsi: urun kodu kuyrugu "10217-1/2" olcu sayilmaz', olcu('VANA 10217-1/2') === 'YOK', olcu('VANA 10217-1/2'));

  // ── MOTOR: dogru urun OTOMATIK yazilir ─────────────────────────────────
  const dir = [urun({ ad: 'Dirsek', cins: 'Galvaniz', cap: '1 1/4"', price: 25 })];
  for (const q of ['1-1/4" DİRSEK', '1 1/4 inç DİRSEK']) {
    const o = sor(q, dir);
    check(`★ A5 motor: "${q}" dogru dirsek OTOMATIK`, o.kind === 'single' && o.row?.listPrice === 25, ozet(o));
  }
  const red = [urun({ ad: 'Redüksiyon', cins: 'Galvaniz', cap: 'DN65 x DN15', price: 33 }), urun({ ad: 'Redüksiyon', cins: 'Galvaniz', cap: 'DN65 x DN25', price: 35 })];
  const r1 = sor('DN65xDN15 REDÜKSİYON', red);
  check('★ A5 motor: "DN65xDN15 REDÜKSİYON" dogru reduksiyon OTOMATIK (@33)', r1.kind === 'single' && r1.row?.listPrice === 33, ozet(r1));
  const hdpe = [urun({ ad: 'HDPE Boru', cins: 'PE100', cap: '110 mm', price: 130 }), urun({ ad: 'HDPE Boru', cins: 'PE100', cap: '90 mm', price: 90 })];
  const h1 = sor('HDPE BORU Ø110 x 6,6 mm', hdpe);
  check('★ B6/B7 motor: "HDPE BORU Ø110 x 6,6 mm" 110\'luk boru OTOMATIK (@130)', h1.kind === 'single' && h1.row?.listPrice === 130, ozet(h1));
  // Urun tarafi: et kalinligi yazan cap sutunu dogru indekslenir
  const uEt = buildProductIndex({ ad: 'HDPE Boru', cins: 'PE100', cap: 'Ø110 x 6,6', price: 1 } as any);
  check('B6 urun: cap sutunu "Ø110 x 6,6" → 110 mm etiketleri', uEt.capTags.includes('od-110'), JSON.stringify(uEt.capTags));
  const uPn = buildProductIndex({ ad: 'Küresel Vana', cins: 'Pirinç', cap: 'PN 16 1/2"', price: 1 } as any);
  check('B4 urun: cap sutunu "PN 16 1/2\\"" → 1/2" (dn15)', uPn.capTags.includes('dn15'), JSON.stringify(uPn.capTags));

  console.log(`\n${'='.repeat(60)}\nOLCU OKUYUCU (FAZ B parti 1): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
