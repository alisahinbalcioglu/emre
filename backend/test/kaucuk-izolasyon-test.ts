/**
 * KAUCUK IZOLASYON VAKASI (KI) — 24.08.2026 canli olcum regresyonu
 *   npx ts-node test/kaucuk-izolasyon-test.ts   (npm run test:kaucuk)
 *
 * Ekran goruntusunden GERCEK veri: teklif "19 mm Kauçuk İzolasyon" basligi
 * altinda inc satirlari (1/2''...), kutuphane ODE listesi "Elastomerik
 * kauçuk köpüğü boru · N mm kalınlık · 22/28/35/42 mm". SIFIR tespit vardi.
 *
 * UC BAGIMSIZ KUSUR OLCULDU (uclu zincir — her biri tek basina oldurucu):
 *  1. AILE: urun adi sondaki 'boru' ile 'boru' ailesine dusuyordu; satir
 *     'izolasyon' — SERT kilit → none/ad-yok. Sozluge 'kaucuk kopugu (boru)'
 *     desenleri eklendi (kapsama ustunlugu 'boru'yu sahiplenir).
 *  2. CAP: izolasyon ic capi YUVARLANMIS celik OD yazar (22/28/35) —
 *     steelOdToDn ±0,5 toleransina sigmiyordu (21,3'e uzaklik 0,7) → olu
 *     od-22 tag'i. STEEL_OD_SERIES + ikiz mm tablolarina eklendi.
 *  3. SINIF: AD_ZENGINLESTIRME'nin dnli:true bayragi AD_DNLI_SLUGS'a hic
 *     girmiyordu (OLU BAYRAK) → sizeClass 'unknown' → celik+plastik BIRLESIM
 *     tag'leri → 1/2'' hem dn15 hem dn20 sayilip yapay 2. aday uretiyordu.
 */
import { buildProductIndex, resolveFamily, resolveProductSizeClass, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { AD_DNLI_SLUGS } from '../src/ozellik/eslestirme/matching/ad-resolver';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function prod(c: ProductColumns): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`, listPrice: c.price, customPrice: null,
    discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null, price: c.price },
  } as IndexedRow;
}

// ── KI-1..6: AILE COZUMU ────────────────────────────────────────────
const AD = 'Elastomerik kauçuk köpüğü boru';
check('KI-1 urun adi izolasyon ailesine cozulur (sondaki "boru"ya ragmen)',
  resolveFamily(AD) === 'izolasyon', `beklenen izolasyon, gelen ${resolveFamily(AD)}`);
// Iki-aile-kanidi kurali: ayni desen levha bicimini de cozer (ornege ozel degil)
check('KI-2 "Kauçuk köpüğü levha" da izolasyon',
  resolveFamily('Kauçuk köpüğü levha') === 'izolasyon', `gelen ${resolveFamily('Kauçuk köpüğü levha')}`);
check('KI-3 teklif satiri ayni aileye cozulur',
  parseLine("19 mm Kauçuk İzolasyon 1/2''", 'mt').familySlug === 'izolasyon');
check('KI-4 karsi: "Siyah çelik boru" boru KALIR',
  resolveFamily('Siyah çelik boru') === 'boru', `gelen ${resolveFamily('Siyah çelik boru')}`);
check('KI-5 karsi: "Dekoratif boru kompansatörü" kompansator KALIR',
  resolveFamily('Dekoratif boru kompansatörü') === 'kompansator');
check('KI-6 karsi: "Kauçuk kompansatör" kompansator KALIR (yeni desen calmaz)',
  resolveFamily('Kauçuk kompansatör') === 'kompansator', `gelen ${resolveFamily('Kauçuk kompansatör')}`);

// ── KI-7..10: CAP + SINIF (indeks tarafi) ───────────────────────────
const CINS19 = 'ODE R-Flex PRM/AFK · 19 mm kalınlık';
const mk = (cap: string) => buildProductIndex({ ad: AD, cins: CINS19, baglanti: 'AFK kaplamalı', cap, price: 100 });
check('KI-7 izolasyon sinifi steel (dnli bayragi CANLI)', mk('22 mm').sizeClass === 'steel',
  `gelen ${mk('22 mm').sizeClass}`);
// TAM esitlik bilerek: union sizarsa (unknown regresyonu) fazla tag yakalanir
check('KI-8 "22 mm" → tam [dn15]', JSON.stringify(mk('22 mm').capTags) === '["dn15"]', `gelen [${mk('22 mm').capTags}]`);
check('KI-9 "28 mm" → tam [dn20]', JSON.stringify(mk('28 mm').capTags) === '["dn20"]', `gelen [${mk('28 mm').capTags}]`);
check('KI-10 "35 mm" → tam [dn25]', JSON.stringify(mk('35 mm').capTags) === '["dn25"]', `gelen [${mk('35 mm').capTags}]`);

// ── KI-11..12: OLU BAYRAK ONARIMI GENEL (zenginlestirme dnli kumesi) ─
check('KI-11 zenginlestirme dnli:true kumesi canli (hortum+pompa+akis-anahtari)',
  AD_DNLI_SLUGS.has('hortum') && AD_DNLI_SLUGS.has('pompa') && AD_DNLI_SLUGS.has('akis-anahtari'));
check('KI-12 karsi: dnli:false olanlar sizmiyor (sprinkler/radyator/vitrifiye)',
  !AD_DNLI_SLUGS.has('sprinkler') && !AD_DNLI_SLUGS.has('radyator') && !AD_DNLI_SLUGS.has('vitrifiye'));

// ── KI-13..17: UCTAN UCA (9 mm IKIZLER HAVUZDA DURURKEN dogru satir) ─
const CINS9 = 'ODE R-Flex PRM/AFK · 9 mm kalınlık';
const HAVUZ: IndexedRow[] = [
  prod({ ad: AD, cins: CINS9,  baglanti: 'AFK kaplamalı', cap: '22 mm', boy: 9,  price: 64.9 }),
  prod({ ad: AD, cins: CINS9,  baglanti: 'AFK kaplamalı', cap: '28 mm', boy: 9,  price: 69.0 }),
  prod({ ad: AD, cins: CINS19, baglanti: 'AFK kaplamalı', cap: '22 mm', boy: 19, price: 111.1 }),
  prod({ ad: AD, cins: CINS19, baglanti: 'AFK kaplamalı', cap: '28 mm', boy: 19, price: 122.2 }),
  prod({ ad: AD, cins: CINS19, baglanti: 'AFK kaplamalı', cap: '35 mm', boy: 19, price: 133.3 }),
  prod({ ad: AD, cins: CINS19, baglanti: 'AFK kaplamalı', cap: '42 mm', boy: 19, price: 144.4 }),
  prod({ ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850 }),
];
const sorgula = (q: string) => runQuery(parseLine(q, 'mt'), HAVUZ) as any;

const VAKALAR: Array<[string, string, number]> = [
  ["19 mm Kauçuk İzolasyon 1/2''",   '22 mm', 111.1],
  ["19 mm Kauçuk İzolasyon 3/4''",   '28 mm', 122.2],
  ["19 mm Kauçuk İzolasyon 1''",     '35 mm', 133.3],
  ["19 mm Kauçuk İzolasyon 1 1/4''", '42 mm', 144.4],
];
VAKALAR.forEach(([q, cap, fiyat], i) => {
  const out = sorgula(q);
  const r = out.row?.urun;
  check(`KI-${13 + i} "${q}" → single · 19mm · ${cap} · ${fiyat}`,
    out.kind === 'single' && r?.capRaw === cap && /19 mm/.test(r?.cinsNorm ?? '') && out.row?.listPrice === fiyat,
    `gelen kind=${out.kind} cap=${r?.capRaw} cins=${r?.cinsNorm} fiyat=${out.row?.listPrice}`);
});

// ── KI-18: plastik yolu bozulmadi (25 mm PPR plastik kalir) ─────────
check('KI-18 karsi: PPR urunu plastic sinifta kalir',
  buildProductIndex({ ad: 'PPR Boru', cins: 'PP-R', cap: '25 mm', price: 10 }).sizeClass === 'plastic');

// ── KI-19: IKIZ TABLO (normalizer.MM_TO_DN) — extractDiameter yolu ──
// capTags conversion tablosundan gelir; extractDiameter AYRI ikiz tabloyu
// okur (legacy tag uretimi). Ikizlerden birini guncelleyip digerini unutmak
// bilinen hastalik — bu assert yalniz normalizer ikizini oldurur.
import { extractDiameter } from '../src/ozellik/eslestirme/matching/normalizer';
check('KI-19 ikiz: extractDiameter("22 mm") dn15 (normalizer.MM_TO_DN)',
  extractDiameter('kaucuk izolasyon 22 mm') === 'dn15',
  `gelen ${extractDiameter('kaucuk izolasyon 22 mm')}`);

console.log(`\nKI TOPLAM: ${passed} PASS · ${failed} FAIL`);
if (failed > 0) { console.log(failures.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
