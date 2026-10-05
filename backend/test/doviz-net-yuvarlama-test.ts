/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DOVIZ NET YUVARLAMASI (C6, karar (c))  (`npm run test:doviz-net-yuvarlama`)
 *
 *  KARAR (c) (Emre, P2 motor paketi): "Doviz + iskonto yuvarlamasi pricing.ts
 *  kuralina uyacak. Once liste biriminde Net = Liste × (1 − Isk/100), SONRA
 *  cevrim."
 *
 *  OLCULDU (05.10, saf motor + gercek MatchingService): motor dovizi ONCE
 *  TL'ye ceviriyor (kurus), iskontoyu TL'de uyguluyor, TL kuralıyla
 *  yuvarliyordu. Kutuphanede gorunen net (liste biriminde, F1 `kaynakFiyat`)
 *  ile teklife yazilan TL net AYRISIYORDU:
 *    USD 1,001 −%50 (kur 47,57): kutuphane neti 0,51 $ → × kur = 24,26 TL;
 *    motor 23,9 TL yaziyordu (47,62 × 0,5 = 23,81 → 23,9).
 *  Uc yol ayni hatayi tasiyordu: outcome-mapper `netFiyat` (tek eslesme,
 *  adaylar, hafiza otoyazisi, iscilik), malzeme onerisi, iscilik onerisi.
 *
 *  KURAL (tek yer: outcome-mapper `tlNetFiyat`):
 *    TL net = yukari-1-hane( cevir( kaynak net ) )
 *    kaynak net = pricing.ts kurali — USD/EUR 2 hane yukari (F1), TRY 1 hane.
 *    TRY satirlar DEGISMEZ (cevrim yok, net zaten ₺ kuralinda).
 *  listPrice / discount alanlari DEGISMEZ (liste TL karsiligi, iskonto %).
 *  DB GEREKMEZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult, type TryCevirici } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import { hesaplaNetFiyat, hesaplaNetFiyatDoviz, yukariYuvarla } from '../src/ozellik/fiyat/matching/pricing';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}
const js = (x: unknown) => JSON.stringify(x);

function prod(c: ProductColumns & { currency?: string; custom?: number; discount?: number }): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `l-${idx.rowKey}`, listPrice: c.price, customPrice: c.custom ?? null, discountRate: c.discount ?? 0,
    currency: c.currency ?? 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null, boyMm: null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null, price: c.price },
  } as any;
}

// GERCEK DESEN: buildTryConverter'in urettigi cevirici (kurusa yuvarlar).
const KUR = { USD: 47.57, EUR: 54.91 } as const;
const cevir = (v: number, cur: string) =>
  cur === 'USD' ? Math.round(v * KUR.USD * 100) / 100
  : cur === 'EUR' ? Math.round(v * KUR.EUR * 100) / 100 : v;
const toTry: TryCevirici = cevir as TryCevirici;
toTry.kur = { usdTry: KUR.USD, eurTry: KUR.EUR, tarih: '2026-08-06' };
toTry.cevrilemez = (cur?: string | null) => !['TRY', 'USD', 'EUR'].includes(String(cur ?? '').toUpperCase());

const vana = (o: Partial<ProductColumns> & { price: number; currency?: string; custom?: number; discount?: number }) =>
  prod({ kategori: 'Vanalar', ad: 'Kelebek Vana', cap: 'DN65', birim: 'Ad.', sheetName: 'X', ...o } as any);
const tek = (pool: IndexedRow[], satir = 'Kelebek Vana DN65') => {
  const line = parseLine(satir);
  return toMatchResult(runQuery(line, pool), line, toTry) as any;
};
/** Kararin kendisi: once kaynak birimde net (pricing.ts), sonra cevrim, sonra ₺ kurali. */
const beklenen = (list: number, isk: number, cur: 'USD' | 'EUR', custom?: number) =>
  yukariYuvarla(cevir(hesaplaNetFiyatDoviz(custom && custom > 0 ? custom : list, isk), cur));

console.log('── A) TEK ESLESME: once kaynak birimde net, sonra cevrim ──');
{
  const r = tek([vana({ price: 1.001, discount: 50, currency: 'USD' })]);
  check('A0 olcutun kendisi: tek eslesme + kaynak net 0,51 $', r.confidence !== 'multi' && r.kaynakFiyat?.net === 0.51, js({ c: r.confidence, k: r.kaynakFiyat }));
  check('A1 ★ USD 1,001 −%50: TL net 24,3 (0,51 × 47,57 = 24,26 → 24,3; eski 23,9)', r.netPrice === 24.3, `net=${r.netPrice}`);
  check('A2 KONTROL: listPrice = listenin TL karsiligi (47,62), iskonto 50', r.listPrice === 47.62 && r.discount === 50, js({ l: r.listPrice, d: r.discount }));
  const e = tek([vana({ price: 1.001, discount: 50, currency: 'EUR' })]);
  check('A3 ★ EUR 1,001 −%50: TL net 28 (0,51 × 54,91 = 28,0041 → 28,0; eski 27,5)', e.netPrice === 28, `net=${e.netPrice}`);
  const c = tek([vana({ price: 2, custom: 1.001, discount: 50, currency: 'USD' })]);
  check('A4 ★ ozel fiyat TABANI degistirir, ayni sira: 1,001 $ −%50 → 24,3', c.netPrice === 24.3 && c.kaynakFiyat?.net === 0.51, js({ n: c.netPrice, k: c.kaynakFiyat }));
}

console.log('── B) OZELLIK: her dovizli satirda TL net = ₺(cevir(kaynak net)) ──');
{
  const listeler = [0.01, 0.07, 0.333, 1.001, 1.25, 3.3335, 12.341, 41, 99.99, 333.335, 1250.5, 18764.27];
  const iskontolar = [0, 5, 10, 12.5, 33, 50, 70, 99];
  let toplam = 0; const sapan: string[] = [];
  for (const cur of ['USD', 'EUR'] as const) {
    for (const list of listeler) {
      for (const isk of iskontolar) {
        toplam++;
        const r = tek([vana({ price: list, discount: isk, currency: cur })]);
        const b = beklenen(list, isk, cur);
        const k = r.kaynakFiyat?.net;
        if (r.netPrice !== b || r.netPrice !== yukariYuvarla(cevir(k, cur))) sapan.push(`${cur} ${list} −%${isk}: ${r.netPrice} ≠ ${b}`);
      }
    }
  }
  check(`B0 olcutun kendisi: ${toplam} dovizli satir olculdu`, toplam === 2 * listeler.length * iskontolar.length);
  check(`B1 ★ ${toplam} satirin HEPSINDE TL net = ₺(cevir(kaynak net))`, sapan.length === 0, `${sapan.length} sapan: ${sapan.slice(0, 4).join(' · ')}`);
}

console.log('── C) TRY DEGISMEZ (cevrim yok) ──');
{
  const sapan: string[] = [];
  for (const list of [0.05, 1.001, 3354.64, 12.345, 999999.99]) {
    for (const isk of [0, 10, 33.3, 90]) {
      const r = tek([vana({ price: list, discount: isk })]);
      if (r.netPrice !== hesaplaNetFiyat(list, isk) || r.kaynakFiyat?.net !== r.netPrice) sapan.push(`${list} −%${isk}: ${r.netPrice}`);
    }
  }
  check('C1 KONTROL: TRY satirda net = hesaplaNetFiyat(liste, iskonto) = kaynak net', sapan.length === 0, sapan.join(' · '));
}

console.log('── D) ADAYLAR (soru) ayni kurali kullanir ──');
{
  const r = tek([
    vana({ cins: 'disli', price: 1.001, discount: 50, currency: 'USD' }),
    vana({ cins: 'flansli', price: 1.001, discount: 50, currency: 'EUR' }),
  ]);
  const netler = (r.candidates ?? []).map((c: any) => `${c.kaynakFiyat?.currency}:${c.netPrice}`).sort();
  check('D0 olcutun kendisi: iki aday soruldu', r.confidence === 'multi' && r.candidates?.length === 2, js({ c: r.confidence, n: r.candidates?.length }));
  check('D1 ★ aday TL netleri EUR:28 · USD:24,3', js(netler) === js(['EUR:28', 'USD:24.3']), js(netler));
}

console.log('── F) GERIYE UYUM: `cevrilemez`siz saf cevirici + taninmayan birim ──');
{
  // Canlida GBP cevrilemez (KUR-02) ve cagiran onceden eler; eski saf test
  // ceviricileri `cevrilemez` tasimaz — onlarda eski sira (cevir → netle) kalir.
  const sade = ((v: number) => v * 2) as TryCevirici;
  const line = parseLine('Kelebek Vana DN65');
  const r = toMatchResult(runQuery(line, [vana({ price: 1.001, discount: 50, currency: 'GBP' })]), line, sade) as any;
  check('F1 KONTROL: GBP 1,001 −%50, cevirici ×2 → 2,002 × 0,5 = 1,001 → 1,1 (kaynak fiyat yok)',
    r.netPrice === 1.1 && r.kaynakFiyat === undefined, js({ n: r.netPrice, k: r.kaynakFiyat }));
}

// ═════════════════════════════════════════════════════════════════════════
// E) GERCEK MatchingService: malzeme onerisi + iscilik onerisi + ana iscilik.
//    Ag ve DB taklit (kaynak-fiyat-test.ts ile ayni fikstur). Kur 47,35.
// ═════════════════════════════════════════════════════════════════════════
const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
const { ExchangeRatesService } = require('../src/ozellik/fiyat/exchange-rates/exchange-rates.service');

const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="12.09.2026" Date="09/12/2026">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>47.20</ForexBuying><ForexSelling>47.35</ForexSelling></Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>54.00</ForexBuying><ForexSelling>54.10</ForexSelling></Currency>
</Tarih_Date>`;
(global as any).fetch = async (url: string) => (url.includes('tcmb')
  ? { ok: true, status: 200, text: async () => TCMB_XML }
  : { ok: true, status: 200, json: async () => ({ rates: { TRY: 47.3, EUR: 0.875 } }) });
const sessizKur = () => { const fx = new ExchangeRatesService(); (fx as any).logger = { warn: () => {}, log: () => {} }; return fx; };

const KOMP = { kategori: 'Dilatasyon Omega V-Flex', cins: 'V-Flex - X,Y,Z ±40 mm hareket', birim: 'adet', sheetName: 'S' };
function kutuphaneSatiri(c: any, brand = { id: 'brand-1', name: 'AYVAZ' }) {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${brand.id}-${idx.rowKey}`, materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: c.custom ?? null, discountRate: c.discount ?? 0,
    currency: c.paraBirimi ?? 'TRY', productIndexId: `pi-${idx.rowKey}`, brand,
    product: { ...idx, id: `pi-${idx.rowKey}`, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null, boyMm: null, urunKodu: c.urunKodu ?? null,
      sheetName: c.sheetName ?? null, price: c.price },
  };
}
function iscilikFiyati(name: string, unitPrice: number, currency: string, unit = 'mt', firma?: any, discountRate = 0) {
  return {
    id: `lp|${name}|${unit}|${firma?.id ?? 'A'}`, unitPrice, discountRate, unit, currency, firma,
    laborItem: { id: `li|${name}`, name, unit, unitPrice, discipline: 'mechanical', category: null, description: null,
      cins: null, baglanti: null, capRaw: null, boyMm: null, not: null, adSlug: null, adBucket: null, adTokens: [],
      cinsNorm: null, cinsTokens: [], baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown', capTags: [],
      capNorm: null, boyTag: null, displayName: null, indexVersion: 0, belirsiz: false },
  };
}
function eslestirici(satirlar: any[], digerMarka: any[] = [], iscilikAna: any[] = [], iscilikDiger: any[] = []) {
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? digerMarka : satirlar) },
    laborPrice: { findMany: async (a: any) => (a?.where?.firmaId ? iscilikAna : a?.where?.firma ? iscilikDiger : []) },
    brand: { findUnique: async () => ({ name: 'AYVAZ' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'f1' }) },
  };
  return new MatchingService(prisma, new TerminologyService(prisma), sessizKur());
}
const KIMLIK = { userId: 'u1', firmaId: 'f1' };
const SATIR = 'Dilatasyon kompansatörü DN25';
const L = 'SİYAH ÇELİK BORU - DN50';
const komp = (brand?: { id: string; name: string }) =>
  [kutuphaneSatiri({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 1.001, discount: 50, paraBirimi: 'USD', urunKodu: 'C-USD' }, brand)];
// Kur 47,35: 0,51 $ → 24,1485 → 24,15 → 24,2 TL (eski: 1,001 × 47,35 = 47,40 → × 0,5 = 23,7)
const SERVIS_BEKLENEN = 24.2;

async function gercekServis() {
  const realLog = console.log; const realWarn = console.warn;
  const sus = () => { console.log = () => {}; console.warn = () => {}; };
  const ac = () => { console.log = realLog; console.warn = realWarn; };

  console.log('── E) GERCEK SERVIS: uc fiyat yolu ayni kural ──');
  sus();
  const ana = (await eslestirici(komp()).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
  const anaV = [kutuphaneSatiri({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'V1', sheetName: 'S' })];
  const diger = komp({ id: 'brand-2', name: 'DOVIZ MARKA' }).map((r) => ({ ...r, id: `${r.id}-b2` }));
  const marka = (await eslestirici(anaV, diger).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
  const iscAna = (await eslestirici([], [], [iscilikFiyati('Siyah çelik boru montajı kaynaklı DN50', 1.001, 'USD', 'mt', undefined, 50)])
    .bulkMatchLabor(KIMLIK, 'firma-A', [L], undefined, { [L]: 'mt' }))[L];
  const iscAlt = (await eslestirici([], [], [iscilikFiyati('Küresel vana montajı DN50', 120, 'TRY', 'adet')],
    [iscilikFiyati('Siyah çelik boru montajı kaynaklı DN50', 1.001, 'USD', 'mt', { id: 'firma-B', name: 'B FIRMASI' }, 50)])
    .bulkMatchLabor(KIMLIK, 'firma-A', [L], undefined, { [L]: 'mt' }))[L];
  ac();

  check('E0 olcutun kendisi: kur 47,35 (TCMB taklidi) ile ana malzeme fiyatlandi', ana?.kaynakKur?.kur === 47.35 && ana?.netPrice > 0, js({ k: ana?.kaynakKur, n: ana?.netPrice }));
  check('E1 ★ ana malzeme (outcome-mapper): 24,2 TL', ana?.netPrice === SERVIS_BEKLENEN, `net=${ana?.netPrice}`);
  const alt = marka?.alternatives?.[0];
  check('E2 olcutun kendisi: dovizli baska marka onerisi geldi', alt?.brandName === 'DOVIZ MARKA', js(marka?.alternatives));
  check('E3 ★ malzeme ONERISI: 24,2 TL', alt?.netPrice === SERVIS_BEKLENEN && alt?.kaynakFiyat?.net === 0.51, js({ n: alt?.netPrice, k: alt?.kaynakFiyat }));
  check('E4 KONTROL: oneri listPrice = 1,001 $ × 47,35 = 47,40', alt?.listPrice === 47.4 && alt?.discount === 50, js({ l: alt?.listPrice, d: alt?.discount }));
  check('E5 olcutun kendisi: ana iscilik tek eslesme fiyatlandi', iscAna?.netPrice > 0 && iscAna?.kaynakFiyat?.net === 0.51, js({ n: iscAna?.netPrice, k: iscAna?.kaynakFiyat }));
  check('E6 ★ ana ISCILIK: 24,2 TL', iscAna?.netPrice === SERVIS_BEKLENEN, `net=${iscAna?.netPrice}`);
  const ia = iscAlt?.alternatives?.[0];
  check('E7 olcutun kendisi: baska firma USD iscilik onerisi geldi', ia?.brandName === 'B FIRMASI', js(iscAlt?.alternatives));
  check('E8 ★ iscilik ONERISI: 24,2 TL', ia?.netPrice === SERVIS_BEKLENEN && ia?.kaynakFiyat?.net === 0.51, js({ n: ia?.netPrice, k: ia?.kaynakFiyat }));
}

bitmezseKirmizi(gercekServis().then(() => {
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  const toplam = passed + failures.length;
  if (failures.length) {
    console.log(` ✗ DOVIZ NET YUVARLAMASI: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
    for (const f of failures) console.log(`   ✗ ${f}`);
    console.log('════════════════════════════════════════════════════════════════');
    process.exitCode = 1;
    return;
  }
  console.log(` ✓ DOVIZ NET YUVARLAMASI: ${passed}/${toplam} kriter gecti`);
  console.log('════════════════════════════════════════════════════════════════');
}));
