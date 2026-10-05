/**
 * FAZ C (C2) — SATIR OLCU YAZIMI: B16 "110'LUK" · D3 izolasyon KALINLIGI
 *   npx ts-node test/satir-olcu-yazimi-test.ts   (npm run test:satir-olcu-yazimi)
 *
 * Yalniz SATIR tarafi (line-parser) — urun indeksi DEGISMEZ (fiyat listeleri
 * "110 mm" yazar; "110'luk" agiz yazimi teklif satirindadir).
 *
 * OLCULDU (05.10, mevcut kod):
 *   B16 "110'LUK PİS SU BORUSU" → cap YOK; "luk" bilinmeyen kelime → onay.
 *       (B16'nin ilk yarisi "DN65xDN25" Parti 1 A5 ile cozuldu: capImzasi
 *       [dn25, dn65] bilesik — burada KONTROL olarak kilitli.)
 *       ⚠ "100'lük paket" AMBALAJ demektir — paket/kutu/koli/adet/torba
 *       oncesindeki 'luk olcu SAYILMAZ; 16'nin altindaki sayi (inc mi mm mi
 *       belirsiz: "2'lik boru" = 2", "12'lik bakir" = 12 mm) OKUNMAZ.
 *   D3  "25 mm Kauçuk İzolasyon" → cap 25 mm. Izolasyonda AD'IN ONUNDEKI mm
 *       KALINLIKTIR (KI vakasi: "19 mm Kauçuk İzolasyon 1/2''" = 19 mm kalinlik,
 *       1/2" boru); arkadan cap gelmeyince kalinlik CAP sanilip baska capli
 *       urunle eslesiyordu. Kural dar: izolasyon ailesi + metnin BASINDAKI
 *       tek mm olcusu + baska olcu yok → cap yok, sayi cins belirteci kalir.
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { capImzasi } from '../src/ozellik/eslestirme/matching/conversion';
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
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null, capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: c.boy ?? null, urunKodu: null, sheetName: null, price: c.price, birim: null } } as IndexedRow;
}
const cap = (q: string) => parseLine(q).capInfo;
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} ${js((o.kind === 'ask' ? o.rows : o.row ? [o.row] : []).map((r: any) => `${r.urun.cins}·${r.urun.capRaw}@${r.listPrice}`))} kapilar=${js(o.kapilar)} not="${o.uyariNot ?? ''}"`;

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // ══ B16 · 'luk / 'lik ═══════════════════════════════════════════════
    for (const q of ["110'LUK PİS SU BORUSU", "110'luk pis su borusu", '110’luk pis su borusu', "75'lik pis su dirseği", '110luk pis su borusu', "160'LIK PVC BORU"]) {
      const c = cap(q);
      const beklenen = Number(q.match(/\d+/)![0]);
      check(`★ B16 "${q}" → ${beklenen} mm`, c?.source === 'mm' && c?.value === beklenen, js(c));
    }
    const t = parseLine("110'LUK PİS SU BORUSU").tokens;
    check('★ B16 "luk" ad kelimesi sayilmaz (bilinmeyen kelime uretmez)', !t.some((x) => /^(?:\d+)?l[iu]k$/.test(x)) && !t.includes('110'), js(t));
    // KARSI: ambalaj ve belirsiz kucuk sayi
    for (const q of ["Dübel 100'lük paket", "Vida 50'lik kutu", "Kelepçe 100'lük koli", "Klips 20'lik torba", "2'lik siyah boru", "12'lik bakır boru"]) {
      check(`B16 karsi: "${q}" → cap OKUNMAZ`, cap(q) === null, js(cap(q)));
    }
    check('B16 karsi: yazili gercek olcu kazanir — "110\'luk boru 125 mm" → 125 mm', cap("110'luk boru 125 mm")?.value === 125, js(cap("110'luk boru 125 mm")));
    // Uctan uca: pis su satiri 110 mm urunu bulur
    const pis = urun({ ad: 'PVC Pis Su Borusu', cins: 'SN4', cap: '110 mm', price: 90 });
    const pis75 = urun({ ad: 'PVC Pis Su Borusu', cins: 'SN4', cap: '75 mm', price: 60 });
    const o = runQuery(parseLine("110'LUK PİS SU BORUSU"), [pis, pis75]) as any;
    check('★ B16 motor: "110\'LUK PİS SU BORUSU" → 110 mm urun, otomatik', o.kind === 'single' && o.row?.listPrice === 90, ozet(o));
    // B16 ilk yarisi (A5, Parti 1) — kontrol
    check('B16 kontrol (A5): "DN65xDN25 Redüksiyon" bilesik imza [dn25, dn65]', js(capImzasi('DN65xDN25 Redüksiyon', 'steel')) === js({ imza: ['dn25', 'dn65'], bilesik: true }), js(capImzasi('DN65xDN25 Redüksiyon', 'steel')));

    // ══ D3 · izolasyon kalinligi cap degildir ═══════════════════════════
    const AD = 'Elastomerik kauçuk köpüğü boru';
    const iz = (k: number, c: string, p: number) => urun({ ad: AD, cins: `ODE R-Flex · ${k} mm kalınlık`, baglanti: 'AFK kaplamalı', cap: c, boy: k, price: p });
    const havuz = [iz(19, '22 mm', 111.1), iz(19, '28 mm', 122.2), iz(25, '22 mm', 151.1), iz(25, '28 mm', 162.2), iz(25, '35 mm', 173.3)];
    for (const q of ['25 mm Kauçuk İzolasyon', '25mm Kauçuk Köpüğü İzolasyon', '9 mm Kauçuk İzolasyon']) {
      check(`★ D3 "${q}" → cap YOK (bastaki mm kalinliktir)`, cap(q) === null, js(cap(q)));
    }
    const d3 = runQuery(parseLine('25 mm Kauçuk İzolasyon', 'mt'), havuz) as any;
    check('★ D3 motor: "25 mm Kauçuk İzolasyon" → 25 mm kalinlikli UC urun sorulur (19 mm elenir, cap uydurulmaz)',
      d3.kind === 'ask' && d3.rows.length === 3 && d3.rows.every((r: any) => /25 mm/.test(r.urun.cins)), ozet(d3));
    // Boy sutunu BOS urunler (kalinlik yalniz cinste): cins belirteci yine 25 mm'likleri secer
    const izBoysuz = (k: number, c: string, p: number) => urun({ ad: AD, cins: `ODE R-Flex · ${k} mm kalınlık`, baglanti: 'AFK kaplamalı', cap: c, price: p });
    const havuz2 = [izBoysuz(19, '22 mm', 11), izBoysuz(25, '22 mm', 15), izBoysuz(25, '28 mm', 16)];
    const d3b = runQuery(parseLine('25 mm Kauçuk İzolasyon', 'mt'), havuz2) as any;
    check('★ D3 boysuz urunler: 25 mm kalinlikli IKI urun sorulur (boy sutunu bos da olsa)',
      d3b.kind === 'ask' && d3b.rows.length === 2 && d3b.rows.every((r: any) => /25 mm/.test(r.urun.cins)), ozet(d3b));
    check('D3 karsi: "25 mm Kauçuk İzolasyon 25 mm" → 25 mm (ikinci mm captir)', cap('25 mm Kauçuk İzolasyon 25 mm')?.value === 25, js(cap('25 mm Kauçuk İzolasyon 25 mm')));
    // KARSI: KI kilitleri ve aile disi satirlar aynen
    check('D3 karsi: "19 mm Kauçuk İzolasyon 1/2\'\'" → 1/2" (arkadan cap gelir)', cap("19 mm Kauçuk İzolasyon 1/2''")?.display === '1/2"', js(cap("19 mm Kauçuk İzolasyon 1/2''")));
    check('D3 karsi: "9 mm Elastomerik Kauçuk Boru İzolasyonu 22 mm" → 22 mm', cap('9 mm Elastomerik Kauçuk Boru İzolasyonu 22 mm')?.value === 22, js(cap('9 mm Elastomerik Kauçuk Boru İzolasyonu 22 mm')));
    check('D3 karsi: "Kauçuk İzolasyon 25 mm" (sonda) → 25 mm (belirsiz konum — dokunulmaz)', cap('Kauçuk İzolasyon 25 mm')?.value === 25, js(cap('Kauçuk İzolasyon 25 mm')));
    check('D3 karsi: izolasyon DISI "25 mm PPR Boru" → 25 mm', cap('25 mm PPR Boru')?.value === 25, js(cap('25 mm PPR Boru')));
    check('D3 karsi: "110 mm Kauçuk İzolasyon" (3 hane — kalinlik degil) → 110 mm', cap('110 mm Kauçuk İzolasyon')?.value === 110, js(cap('110 mm Kauçuk İzolasyon')));
  } finally { console.warn = warn; }

  console.log(`\n${'='.repeat(60)}\nSATIR OLCU YAZIMI (FAZ C2): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
