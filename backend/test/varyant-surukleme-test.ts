/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  VS — SURUKLE-DOLDUR VARYANT YAYILIMI  (`npm run test:varyant`)
 *
 *  CANLI VAKA (25.08): "PP KURESEL VANALAR" grubunda DN20 kaynagindan asagi
 *  surukleme — DN50/63 doldu, DN32/40 pembe kaldi. Uc kollu kesif + saf-motor
 *  probe matrisi uc yapisal kusur olctu; bu dosya o kusurlarin kapilaridir:
 *
 *   1. TAM-DIZGI TAG ESITLIGI: 'PN25' vs 'PN 25' yazim kaymasi ya da ada
 *      gomulu olcu ('... 20 mm') TUM grubu variantMissing'e dusuruyordu.
 *      → varyantTagEsit: ad ekseninde olcu ifadesi kimlikten duser, cins/bag
 *        ekseninde yalniz bosluk-duyarsiz karsilastirma. GERCEK cins farki
 *        ('19 mm kalinlik' ≠ '9 mm kalinlik') AYNEN korunur.
 *   2. PARA HATASI (probe M3): ada gomulu-olculu + CAP KOLONU BOS listede
 *      eslesen===1 kosulu KAYNAK urunu bulup kaynagin fiyatini HER hedef
 *      capa yaziyordu. → capsizAutoYasak: satir capliyken capsiz urune
 *      variant-yoluyla otomatik fiyat YAZILMAZ (capsiz-dusum onayina duser).
 *   3. YALIN 'pp' PLASTIK DEGILDI: 'PP Küresel Vana' steel siniflanip cap
 *      '63' od-63'e dusuyor, satirin DN63'u (celik tablosunda yok) kesisemiyor
 *      → 'bu markada DN 63 yok' YALANI. → PLASTIK regex + YAZILI_SINIF'a 'pp'.
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags, varyantTagEsit } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import type { IndexedRow, QueryOutcome } from '../src/ozellik/eslestirme/matching/index/types';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

function prod(c: ProductColumns): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    listPrice: c.price, customPrice: null, discountRate: 0,
    currency: (c.paraBirimi as string) ?? 'TRY',
    urun: {
      ...idx,
      ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null,
      price: c.price,
    },
  };
}

/** Surukleme = kaynak satirin tag'leriyle hedef satiri sorgulamak. */
function surukle(q: string, pool: IndexedRow[], tags: string[]): QueryOutcome {
  return runQuery(parseLine(q, 'adet'), pool, { variantTags: tags });
}
const fiyat = (o: QueryOutcome): number | null =>
  o.kind === 'auto-variant' ? o.row.urun.price : o.kind === 'single' ? o.row.urun.price : null;

console.log('── VS-1) BOZULMAMA: cins sabitken surukleme her capta dolar (PP vana) ──');
{
  const CAPLAR = ['20', '25', '32', '40', '50', '63'];
  const POOL = CAPLAR.map((c, i) => prod({
    kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana', cins: 'PPRC yapıştırma',
    cap: c, price: 100 + i * 50, birim: 'Ad.', urunKodu: `KV-${c}`, sheetName: 'PILSA',
  }));
  const tags = urunVariantTags(POOL[0]);
  const sonuclar = CAPLAR.map((c) => surukle(`PP KÜRESEL VANALAR DN ${c}`, POOL, tags));
  check('VS-1 alti capin ALTISI da otomatik dolar (DN63 dahil)',
    sonuclar.every((o, i) => fiyat(o) === 100 + i * 50),
    sonuclar.map((o, i) => `${CAPLAR[i]}:${o.kind}${fiyat(o) !== null ? '@' + fiyat(o) : ''}`).join(' '));
  check('VS-1b urun sinifi PLASTIC (yalin pp taninir) ve DN63 koprusu kurulur',
    POOL.every((r) => r.urun.sizeClass === 'plastic') && POOL[5].urun.capTags.includes('dn63'),
    `sinif=${POOL[0].urun.sizeClass} dn63Tags=${POOL[5].urun.capTags}`);
}

console.log('── VS-2) YAZIM KAYMASI: PN25 vs PN 25 grubu KIRMAZ ──');
{
  const POOL = [
    prod({ kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana', cins: 'PPRC PN25 yapıştırma', cap: '20', price: 100, birim: 'Ad.', urunKodu: 'KV-20', sheetName: 'PILSA' }),
    prod({ kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana', cins: 'PPRC PN 25 yapıştırma', cap: '32', price: 200, birim: 'Ad.', urunKodu: 'KV-32', sheetName: 'PILSA' }),
  ];
  const tags = urunVariantTags(POOL[0]); // cins: 'pprc pn25 yapistirma'
  const o = surukle('PP KÜRESEL VANALAR DN 32', POOL, tags);
  check('VS-2 bosluk farkli cins ayni kimlik sayilir → hedef otomatik dolar',
    o.kind === 'auto-variant' && o.row.urun.price === 200, `${o.kind}${fiyat(o) !== null ? '@' + fiyat(o) : ''}`);
  check('VS-2b varyantTagEsit birim testi: bosluk esit, deger farki esit DEGIL',
    varyantTagEsit('cins:pprc pn25', 'cins:pprc pn 25') && !varyantTagEsit('cins:pprc pn25', 'cins:pprc pn16'),
    '-');
}

console.log('── VS-3) ADA GOMULU OLCU: dogru varyanti hedef capta AYIRT EDER ──');
{
  // Her capta IKI cins var — surukleme kaynaktaki cinsi (yapistirma) secmeli.
  // Ad olcu tasidigi icin eski tam-dizgi kural eslesen=0 verir, rows=2 →
  // variantMissing (pembe) olurdu. Ad-olcu-soyma ile eslesen=1 dogru varyant.
  const POOL = [
    prod({ kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana 20 mm', cins: 'yapıştırma', cap: '20', price: 100, birim: 'Ad.', urunKodu: 'Y-20', sheetName: 'PILSA' }),
    prod({ kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana 32 mm', cins: 'yapıştırma', cap: '32', price: 200, birim: 'Ad.', urunKodu: 'Y-32', sheetName: 'PILSA' }),
    prod({ kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana 32 mm', cins: 'rakorlu', cap: '32', price: 260, birim: 'Ad.', urunKodu: 'R-32', sheetName: 'PILSA' }),
  ];
  const tags = urunVariantTags(POOL[0]); // ad:'pp kuresel vana 20 mm' + cins:'yapistirma'
  const o = surukle('PP KÜRESEL VANALAR DN 32', POOL, tags);
  check('VS-3 hedef capta dogru cins otomatik secilir (rakorlu DEGIL yapistirma)',
    o.kind === 'auto-variant' && o.row.urun.urunKodu === 'Y-32' && o.row.urun.price === 200,
    `${o.kind} ${o.kind === 'auto-variant' ? o.row.urun.urunKodu : ''}`);
}

console.log('── VS-4) PARA KORUMASI: capsiz urune kaynak fiyati YAYILMAZ ──');
{
  // Probe M3 vakasi: cap kolonu BOS, boyut adin icinde. Eski davranis kaynak
  // urunu (tip 20 @100) HER hedef capta eslesen===1 bulup fiyatini yaziyordu.
  const POOL = ['20', '32', '50'].map((c, i) => prod({
    kategori: 'PP Küresel Vanalar', ad: `PP Küresel Vana ${c} mm`, cins: `tip ${c}`,
    price: 100 + i * 100, birim: 'Ad.', urunKodu: `T-${c}`, sheetName: 'PILSA',
  }));
  check('VS-4 on kosul: urunler gercekten capsiz (capTags bos)',
    POOL.every((r) => r.urun.capTags.length === 0), POOL.map((r) => r.urun.capTags.join(',')).join('|'));
  const tags = urunVariantTags(POOL[0]);
  const o = surukle('PP KÜRESEL VANALAR DN 32', POOL, tags);
  check('VS-4 otomatik fiyat YAZILMAZ (capsiz-dusum onayina duser)',
    o.kind === 'ask' && (o.kapilar ?? []).includes('capsiz-dusum'),
    `${o.kind} kapilar=${o.kind === 'ask' ? o.kapilar : '-'}`);
  const r = toMatchResult(o, parseLine('PP KÜRESEL VANALAR DN 32', 'adet'), (v: number) => v);
  check('VS-4b mapper: netPrice 0, kullanici onayina birakilir',
    r.netPrice === 0 && (r.candidates?.length ?? 0) >= 1, `netPrice=${r.netPrice} aday=${r.candidates?.length}`);
}

console.log('── VS-5) GERCEK CINS FARKI KORUNUR: 19 mm ≠ 9 mm kalinlik ──');
{
  const POOL = [
    prod({ kategori: 'İzolasyon', ad: 'Elastomerik kauçuk köpüğü boru', cins: '19 mm kalınlık', cap: '22 mm', price: 40, birim: 'metre', urunKodu: 'K19-22', sheetName: 'ODE' }),
    prod({ kategori: 'İzolasyon', ad: 'Elastomerik kauçuk köpüğü boru', cins: '9 mm kalınlık', cap: '28 mm', price: 30, birim: 'metre', urunKodu: 'K9-28', sheetName: 'ODE' }),
  ];
  const tags = urunVariantTags(POOL[0]); // cins:'19 mm kalinlik'
  const o = surukle('Kauçuk İzolasyon 3/4"', POOL, tags); // hedef capta YALNIZ 9 mm var
  check('VS-5 farkli kalinliga SESSIZ IKAME YOK (variantMissing/ask)',
    o.kind === 'ask' && o.variantMissing === true && fiyat(o) === null,
    `${o.kind} variantMissing=${o.kind === 'ask' ? o.variantMissing : '-'}`);
  check('VS-5b varyantTagEsit: kalinlik farki bosluksuz halde de AYRIK',
    !varyantTagEsit('cins:19 mm kalinlik', 'cins:9 mm kalinlik'), '-');
}

console.log('── VS-6) BORU KONTROL GRUBU: yuzey varyanti yayilimi AYNEN calisir ──');
{
  const POOL = [
    prod({ kategori: 'Borular', ad: 'Siyah Çelik Boru', cins: 'siyah', cap: 'DN50', price: 500, birim: 'metre', urunKodu: 'S-50', sheetName: 'BORU' }),
    prod({ kategori: 'Borular', ad: 'Siyah Çelik Boru', cins: 'galvaniz', cap: 'DN50', price: 620, birim: 'metre', urunKodu: 'G-50', sheetName: 'BORU' }),
    prod({ kategori: 'Borular', ad: 'Siyah Çelik Boru', cins: 'siyah', cap: 'DN65', price: 700, birim: 'metre', urunKodu: 'S-65', sheetName: 'BORU' }),
    prod({ kategori: 'Borular', ad: 'Siyah Çelik Boru', cins: 'galvaniz', cap: 'DN65', price: 860, birim: 'metre', urunKodu: 'G-65', sheetName: 'BORU' }),
  ];
  const tags = urunVariantTags(POOL[1]); // galvaniz DN50
  const o = surukle('ÇELİK BORULAR DN 65', POOL, tags);
  check('VS-6 galvaniz secimi hedef capta galvanizi bulur (boru davranisi korunur)',
    o.kind === 'auto-variant' && o.row.urun.urunKodu === 'G-65',
    `${o.kind} ${o.kind === 'auto-variant' ? o.row.urun.urunKodu : ''}`);
}

console.log('── VS-7) YALIN PP OLDURUCUSU: cins plastik kelimesi TASIMAZKEN sinif ──');
{
  // VS-1'in fixture'lari cins'te 'PPRC' tasidigi icin sinif oradan kurtuluyor
  // ve 'pp' mutasyonu yasiyordu (olculdu). Bu blok yalin 'pp'nin TEK kurtarici
  // oldugu vakayi kilitler: cins 'PN 25 rakorlu' (plastik kelimesi YOK),
  // ad 'PP Küresel Vana', cap '63' — probe M6'nin birebir canli imzasi.
  const POOL = [
    prod({ kategori: 'PP Küresel Vanalar', ad: 'PP Küresel Vana', cins: 'PN 25 rakorlu', cap: '63', price: 900, birim: 'Ad.', urunKodu: 'KV-63', sheetName: 'PILSA' }),
  ];
  check('VS-7 yalin pp → PLASTIC sinif + dn63 koprusu',
    POOL[0].urun.sizeClass === 'plastic' && POOL[0].urun.capTags.includes('dn63'),
    `sinif=${POOL[0].urun.sizeClass} tags=${POOL[0].urun.capTags}`);
  const o = runQuery(parseLine('PP KÜRESEL VANALAR DN 63', 'adet'), POOL, undefined);
  check('VS-7b satirin DN 63\'u urunu BULUR ("bu markada DN 63 yok" yalani biter)',
    o.kind === 'single' && o.row.urun.price === 900, `${o.kind}`);
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
const toplam = passed + failures.length;
if (failures.length) {
  console.log(` ✗ VARYANT SURUKLEME: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log('════════════════════════════════════════════════════════════════');
  process.exit(1);
}
console.log(` ✓ VARYANT SURUKLEME: ${passed}/${toplam} kriter gecti`);
console.log('════════════════════════════════════════════════════════════════');
