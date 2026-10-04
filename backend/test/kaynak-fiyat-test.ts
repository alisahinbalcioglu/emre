/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KAYNAK FIYAT KAPISI  (`npm run test:kaynak-fiyat`) — coklu para birimi F1
 *  (Emre karari 04.10: dovizli kalem teklifte KENDI para biriminde kalir,
 *  ayri toplamlar).
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  Eslestirme cevabi bugunku TL alanlarina (netPrice/listPrice/discount,
 *  `kaynakKur`) EK olarak fiyatin KAYNAK para birimindeki halini tasir:
 *  `kaynakFiyat = { currency, net, list, discount }`.
 *    - net = (custom ?? liste) × (1 − iskonto) — kutuphane ekraniyla ayni formul.
 *    - TRY: 1 hane YUKARI (netPrice ile BIREBIR ayni).
 *    - USD/EUR: 2 hane YUKARI (Emre karari: sent alti asagi atilmaz).
 *
 *  NEDEN: motor dovizi iskonto + yuvarlamadan ONCE TL'ye ceviriyor
 *  (outcome-mapper netFiyat); orijinal tutar cevapta YOKTU. TL'den geri
 *  hesaplamak (net ÷ kur) iki kez yuvarlanmis sayidan kurus fakli doviz
 *  uretir — kaynak fiyat ANCAK motordan gelirse dogrudur.
 *
 *  F1 YALNIZ EKLER: TL alanlari ve KUR-01 davranisi DEGISMEZ (kur yoksa
 *  dovizli satir hala fiyatsiz — kursuz fiyatlama F1b'de, istek bayragiyla).
 *  DB GEREKMEZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult, type TryCevirici } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import { hesaplaNetFiyat } from '../src/ozellik/fiyat/matching/pricing';
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

// GERCEK DESEN: buildTryConverter'in urettigi cevirici (kur metaverisi ustunde).
const toTry: TryCevirici = ((v: number, cur: string) =>
  cur === 'USD' ? Math.round(v * 47.57 * 100) / 100
  : cur === 'EUR' ? Math.round(v * 54.91 * 100) / 100 : v) as TryCevirici;
toTry.kur = { usdTry: 47.57, eurTry: 54.91, tarih: '2026-08-06' };
toTry.cevrilemez = (cur?: string | null) => !['TRY', 'USD', 'EUR'].includes(String(cur ?? '').toUpperCase());

const vana = (o: Partial<ProductColumns> & { price: number; currency?: string; custom?: number; discount?: number }) =>
  prod({ kategori: 'Vanalar', ad: 'Kelebek Vana', cap: 'DN65', birim: 'Ad.', sheetName: 'X', ...o } as any);
const tek = (pool: IndexedRow[], satir = 'Kelebek Vana DN65') => {
  const line = parseLine(satir);
  return toMatchResult(runQuery(line, pool), line, toTry) as any;
};

console.log('── A) USD tek eslesme: kaynak fiyat DOVIZDE, TL alanlari DEGISMEZ ──');
{
  const r = tek([vana({ price: 100, currency: 'USD' })]);
  check('A0 olcutun kendisi: tek eslesme geldi', r.confidence === 'high', `conf=${r.confidence}`);
  check('A1 ★ kaynakFiyat USD · net 100 · liste 100 · iskonto 0',
    r.kaynakFiyat?.currency === 'USD' && r.kaynakFiyat?.net === 100 && r.kaynakFiyat?.list === 100 && r.kaynakFiyat?.discount === 0, js(r.kaynakFiyat));
  check('A2 KONTROL: TL netPrice degismedi (100 × 47,57 = 4.757)', r.netPrice === 4757, `net=${r.netPrice}`);
  check('A3 KONTROL: kaynakKur degismedi', r.kaynakKur?.currency === 'USD' && r.kaynakKur?.kur === 47.57, js(r.kaynakKur));
}

console.log('── B) DOVIZ YUVARLAMA: 2 hane YUKARI (Emre karari 04.10) ──');
{
  const b1 = tek([vana({ price: 33.335, discount: 10, currency: 'USD' })]); // 30,0015 → 30,01
  check('B1 ★ sent alti asagi ATILMAZ: 33,335 × 0,90 = 30,0015 → 30,01', b1.kaynakFiyat?.net === 30.01, js(b1.kaynakFiyat));
  const b2 = tek([vana({ price: 41, discount: 70, currency: 'USD' })]); // 12,3 (kayan nokta 12,2999…)
  check('B2 tam deger yukari KAYMAZ: 41 × 0,30 = 12,30 (kayan nokta pay)', b2.kaynakFiyat?.net === 12.3, js(b2.kaynakFiyat));
  const b3 = tek([vana({ price: 12.341, currency: 'USD' })]);
  check('B3 1 hane DEGIL 2 hane: 12,341 → 12,35 (₺ kurali 12,4 derdi)', b3.kaynakFiyat?.net === 12.35, js(b3.kaynakFiyat));
}

console.log('── C) OZEL FIYAT TABANI degistirir, iskonto her zaman uygulanir ──');
{
  const r = tek([vana({ price: 100, custom: 90, discount: 10, currency: 'USD' })]);
  check('C1 net = 90 × 0,90 = 81 · liste 100 kalir', r.kaynakFiyat?.net === 81 && r.kaynakFiyat?.list === 100, js(r.kaynakFiyat));
}

console.log('── D) EUR ──');
{
  const r = tek([vana({ price: 200, discount: 10, currency: 'EUR' })]);
  check('D1 EUR · net 180', r.kaynakFiyat?.currency === 'EUR' && r.kaynakFiyat?.net === 180, js(r.kaynakFiyat));
}

console.log('── E) TRY: kaynak fiyat netPrice ile BIREBIR ayni (₺ kurali, 1 hane yukari) ──');
{
  for (const [price, discount] of [[4757, 0], [123.456, 7], [99.99, 33]] as const) {
    const r = tek([vana({ price, discount })]);
    check(`E1 TRY ${price} −%${discount}: kaynakFiyat.net === netPrice (${r.netPrice})`,
      r.kaynakFiyat?.currency === 'TRY' && r.kaynakFiyat?.net === r.netPrice && r.netPrice === hesaplaNetFiyat(price, discount), js(r.kaynakFiyat));
  }
}

console.log('── F) COKLU ADAY: her aday KENDI kaynak fiyatini tasir ──');
{
  const r = tek([
    vana({ cins: 'disli', price: 100, currency: 'USD' }),
    vana({ cins: 'flansli', price: 120, currency: 'USD' }),
  ]);
  check('F0 olcutun kendisi: iki aday', (r.candidates?.length ?? 0) === 2, `${r.candidates?.length}`);
  const netler = (r.candidates ?? []).map((c: any) => `${c.kaynakFiyat?.currency}:${c.kaynakFiyat?.net}`).sort();
  check('F1 ★ adaylar USD:100 ve USD:120', js(netler) === js(['USD:100', 'USD:120']), js(netler));
}

console.log('── G) TANINMAYAN para birimi: kaynak fiyat UYDURULMAZ ──');
{
  const r = tek([vana({ price: 100, currency: 'GBP' })]);
  check('G1 fiyat yok + kaynakFiyat yok (KUR-02 degismedi)', r.netPrice === 0 && r.kaynakFiyat === undefined, js(r));
  // Bugun taninmayan birimli satir HER yolda `kaynakFiyatOf`a ulasmadan elenir
  // (`cevrilemez` kapisi once kosar) — G1 yardimcinin KENDI korumasini olcmez
  // (mutant F1-M5 yasadi). F1b kursuz fiyatlamada o kapi degisecek; sozlesme
  // yardimcida dogrudan kilitlenir.
  const { kaynakFiyatOf } = require('../src/ozellik/fiyat/matching/index/outcome-mapper');
  check('G2 ★ yardimci: taninmayan birimde (GBP, £) kaynak fiyat UYDURMAZ',
    kaynakFiyatOf(vana({ price: 100, currency: 'GBP' })) === undefined && kaynakFiyatOf(vana({ price: 100, currency: '£' })) === undefined,
    js([kaynakFiyatOf(vana({ price: 100, currency: 'GBP' })), kaynakFiyatOf(vana({ price: 100, currency: '£' }))]));
}

console.log('── H) GRUP VARYANTI (surukleme yayilimi) da kaynak fiyat tasir ──');
{
  const { urunVariantTags } = require('../src/ozellik/eslestirme/matching/index/query-engine');
  const pool = [
    vana({ cins: 'disli', price: 100, currency: 'USD' }),
    vana({ cins: 'flansli', price: 120, currency: 'USD' }),
  ];
  const line = parseLine('Kelebek Vana DN65');
  const r = toMatchResult(runQuery(line, pool, { variantTags: urunVariantTags(pool[1]) }), line, toTry) as any;
  check('H0 olcutun kendisi: grup varyanti dali kostu', r.autoVariant === true, `autoVariant=${r.autoVariant} conf=${r.confidence}`);
  check('H1 ★ kaynakFiyat USD · 120', r.kaynakFiyat?.currency === 'USD' && r.kaynakFiyat?.net === 120, js(r.kaynakFiyat));
}

// ═════════════════════════════════════════════════════════════════════════
// I-K) GERCEK MatchingService (oneri yollari + hafiza otoyazisi). Ag ve DB
//      taklit (kur-donmasi-test.ts ile ayni fikstur deseni).
// ═════════════════════════════════════════════════════════════════════════
const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
const { ExchangeRatesService } = require('../src/ozellik/fiyat/exchange-rates/exchange-rates.service');

const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="12.09.2026" Date="09/12/2026">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>47.20</ForexBuying><ForexSelling>47.35</ForexSelling></Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>54.00</ForexBuying><ForexSelling>54.10</ForexSelling></Currency>
</Tarih_Date>`;
const agVar = async (url: string) => (url.includes('tcmb')
  ? { ok: true, status: 200, text: async () => TCMB_XML }
  : { ok: true, status: 200, json: async () => ({ rates: { TRY: 47.3, EUR: 0.875 } }) });
(global as any).fetch = agVar;
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
function eslestirici(satirlar: any[], digerMarka: any[] = [], iscilikAna: any[] = [], iscilikDiger: any[] = [], hafiza: any = null) {
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? digerMarka : satirlar) },
    laborPrice: { findMany: async (a: any) => (a?.where?.firmaId ? iscilikAna : a?.where?.firma ? iscilikDiger : []) },
    brand: { findUnique: async () => ({ name: 'AYVAZ' }) },
    eslesmeHafizasi: { findUnique: async () => hafiza, upsert: async () => {} },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'f1' }) },
  };
  return new MatchingService(prisma, new TerminologyService(prisma), sessizKur());
}
const KIMLIK = { userId: 'u1', firmaId: 'f1' };
const SATIR = 'Dilatasyon kompansatörü DN25';
const tekKomp = (paraBirimi: string, price = 100, discount = 0) =>
  [kutuphaneSatiri({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price, discount, paraBirimi, urunKodu: `C-${paraBirimi}` })];

async function gercekServis() {
  const realLog = console.log; const realWarn = console.warn;
  const sus = () => { console.log = () => {}; console.warn = () => {}; };
  const ac = () => { console.log = realLog; console.warn = realWarn; };

  console.log('── I) ONERI YOLLARI: baska marka (malzeme) + baska firma (iscilik) ──');
  {
    const ana = [kutuphaneSatiri({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'V1', sheetName: 'S' })];
    const diger = tekKomp('USD', 100, 15).map((r) => ({ ...r, id: `${r.id}-b2`, brand: { id: 'brand-2', name: 'DOVIZ MARKA' } }));
    const L = 'SİYAH ÇELİK BORU - DN50';
    sus();
    const marka = (await eslestirici(ana, diger).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
    const iscAlt = (await eslestirici([], [], [iscilikFiyati('Küresel vana montajı DN50', 120, 'TRY', 'adet')],
      [iscilikFiyati('Siyah çelik boru montajı kaynaklı DN50', 10.005, 'EUR', 'mt', { id: 'firma-B', name: 'B FIRMASI' })])
      .bulkMatchLabor(KIMLIK, 'firma-A', [L], undefined, { [L]: 'mt' }))[L];
    const iscAna = (await eslestirici([], [], [iscilikFiyati('Siyah çelik boru montajı kaynaklı DN50', 10, 'USD', 'mt', undefined, 5)])
      .bulkMatchLabor(KIMLIK, 'firma-A', [L], undefined, { [L]: 'mt' }))[L];
    ac();
    const alt = marka?.alternatives?.[0];
    check('I0 olcutun kendisi: dovizli baska marka onerisi geldi', alt?.brandName === 'DOVIZ MARKA', js(marka?.alternatives));
    check('I1 ★ malzeme onerisi: kaynakFiyat USD · 100 × 0,85 = 85 · liste 100 · iskonto 15',
      alt?.kaynakFiyat?.currency === 'USD' && alt?.kaynakFiyat?.net === 85 && alt?.kaynakFiyat?.list === 100 && alt?.kaynakFiyat?.discount === 15,
      js(alt?.kaynakFiyat));
    const ia = iscAlt?.alternatives?.[0];
    check('I2 olcutun kendisi: baska firma EUR iscilik onerisi geldi', ia?.brandName === 'B FIRMASI', js(iscAlt?.alternatives));
    check('I3 ★ iscilik onerisi: kaynakFiyat EUR · 10,005 → 10,01 (2 hane yukari)',
      ia?.kaynakFiyat?.currency === 'EUR' && ia?.kaynakFiyat?.net === 10.01, js(ia?.kaynakFiyat));
    check('I4 olcutun kendisi: ana iscilik tek eslesme fiyatlandi', iscAna?.netPrice > 0, `net=${iscAna?.netPrice}`);
    check('I5 ★ ana iscilik: kaynakFiyat USD · 10 × 0,95 = 9,5', iscAna?.kaynakFiyat?.currency === 'USD' && iscAna?.kaynakFiyat?.net === 9.5,
      js(iscAna?.kaynakFiyat));
  }

  console.log('── J) HAFIZA OTOYAZISI: adayin kaynak fiyati tasinir ──');
  {
    let kanit: any = null;
    for (const satir of ['Paslanmaz Dilatasyon kompansatörü DN25', 'Dilatasyon kompansatörü DN25 PN16 özel']) {
      sus();
      const ilk = (await eslestirici(tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [satir]))[satir];
      ac();
      if (ilk?.confidence !== 'multi' || ilk.candidates?.length !== 1) continue;
      const hafiza = { secilenAd: ilk.candidates[0].materialName, secimSayisi: 3 };
      sus();
      kanit = (await eslestirici(tekKomp('USD'), [], [], [], hafiza).bulkMatch(KIMLIK, 'brand-1', [satir]))[satir];
      ac();
      break;
    }
    check('J0 olcutun kendisi: hafiza otoyazisi GERCEKTEN ateslendi', kanit?.hafizaOtoyaz === true && kanit?.netPrice === 4735,
      `otoyaz=${kanit?.hafizaOtoyaz} net=${kanit?.netPrice}`);
    check('J1 ★ otoyaz kaynakFiyat USD · 100', kanit?.kaynakFiyat?.currency === 'USD' && kanit?.kaynakFiyat?.net === 100, js(kanit?.kaynakFiyat));
  }

  console.log('── K) KUR YOKKEN (KUR-01) F1 davranisi DEGISTIRMEZ ──');
  {
    (global as any).fetch = async () => { throw new Error('getaddrinfo ENOTFOUND (test)'); };
    sus();
    const usd = (await eslestirici(tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
    ac();
    (global as any).fetch = agVar;
    check('K1 KONTROL: kur yokken USD satir hala fiyatsiz + kurAlinamadi (kursuz fiyatlama F1b)',
      usd?.netPrice === 0 && usd?.kurAlinamadi === true, js({ n: usd?.netPrice, k: usd?.kurAlinamadi }));
  }
}

bitmezseKirmizi(gercekServis().then(() => {
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  const toplam = passed + failures.length;
  if (failures.length) {
    console.log(` ✗ KAYNAK FIYAT: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
    for (const f of failures) console.log(`   ✗ ${f}`);
    console.log('════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
  console.log(` ✓ KAYNAK FIYAT: ${passed}/${toplam} kriter gecti`);
  console.log('════════════════════════════════════════════════════════════════');
}).catch((e) => { console.error('BEKLENMEYEN HATA:', e); process.exit(1); }));
