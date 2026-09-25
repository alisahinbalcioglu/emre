/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KUR DONMASI KAPISI  (`npm run test:kur`) — kullanici karari 06.08:
 *  "dovizli maliyetin kuru teklife donsun — evet donsun."
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  Dovizli (USD/EUR) kutuphane satirindan fiyat yazildiginda, eslestirme
 *  cevabi CEVRIMDE KULLANILAN KURU da tasir (`kaynakKur`): para birimi +
 *  kur + tarih. FE bunu satira (`_matKurBilgi`/`_labKurBilgi`) yazar ve
 *  teklifle birlikte KAYDEDILIR — cuma acilan teklif pazartesinin sayisini
 *  VE o sayinin hangi kurla dogdugunu gosterir.
 *
 *  NEDEN — ADIM 3/5b olcumu: TRY tutar zaten satirda donuyordu ama KUR
 *  KAYIT DISIYDI (yalniz goruntuleme kuru displayRate arsivleniyor).
 *  431 dovizli kutuphane satiri var (391 USD + 40 EUR): ilk musteri dovizli
 *  kalemde "bu fiyat hangi kurla?" sorusuna cevap alamazdi.
 *
 *  TRY satirlar kur BILGISI TASIMAZ (kur kavrami yok — null/undefined).
 *  DB GEREKMEZ: saf outcome-mapper + gercek indeksleyici.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult, type TryCevirici } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

function prod(c: ProductColumns & { currency?: string }): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `l-${idx.rowKey}`, listPrice: c.price, customPrice: null, discountRate: 0,
    currency: c.currency ?? 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null, boyMm: null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null, price: c.price },
  } as any;
}

// GERCEK DESEN: buildTryConverter'in urettigi cevirici — kur metaverisi
// fonksiyonun USTUNDE tasinir (imzalar degismesin diye).
const toTry: TryCevirici = ((v: number, cur: string) =>
  cur === 'USD' ? Math.round(v * 47.57 * 100) / 100
  : cur === 'EUR' ? Math.round(v * 54.91 * 100) / 100 : v) as TryCevirici;
toTry.kur = { usdTry: 47.57, eurTry: 54.91, tarih: '2026-08-06' };

const USD_POOL = [prod({ kategori: 'Vanalar', ad: 'Kelebek Vana', cap: 'DN65', price: 100, birim: 'Ad.', currency: 'USD', sheetName: 'X' })];
const TRY_POOL = [prod({ kategori: 'Vanalar', ad: 'Kelebek Vana', cap: 'DN65', price: 4757, birim: 'Ad.', sheetName: 'X' })];
const COK_USD = [
  prod({ kategori: 'Vanalar', ad: 'Kelebek Vana', cins: 'disli', cap: 'DN65', price: 100, birim: 'Ad.', currency: 'USD', sheetName: 'X' }),
  prod({ kategori: 'Vanalar', ad: 'Kelebek Vana', cins: 'flansli', cap: 'DN65', price: 120, birim: 'Ad.', currency: 'USD', sheetName: 'X' }),
];

console.log('── A) USD satir: sonuc KURU TASIR ──');
{
  const line = parseLine('Kelebek Vana DN65');
  const r = toMatchResult(runQuery(line, USD_POOL), line, toTry);
  check('A1 eslesme geldi ve TRY cevrildi', r.netPrice === 4757, `netPrice=${r.netPrice}`);
  check('A2 kaynakKur DOLU', !!(r as any).kaynakKur, JSON.stringify((r as any).kaynakKur));
  const k = (r as any).kaynakKur ?? {};
  check('A3 para birimi USD', k.currency === 'USD', JSON.stringify(k));
  check('A4 kur 47.57', k.kur === 47.57, JSON.stringify(k));
  check('A5 tarih tasiniyor', k.tarih === '2026-08-06', JSON.stringify(k));
}

console.log('── B) TRY satir: kur bilgisi TASIMAZ ──');
{
  const line = parseLine('Kelebek Vana DN65');
  const r = toMatchResult(runQuery(line, TRY_POOL), line, toTry);
  check('B1 eslesme geldi', r.netPrice === 4757, `netPrice=${r.netPrice}`);
  check('B2 kaynakKur YOK (TRY icin kur kavrami yok)', (r as any).kaynakKur === undefined,
    JSON.stringify((r as any).kaynakKur));
}

console.log('── C) COKLU ADAY: her aday KENDI kurunu tasir ──');
{
  const line = parseLine('Kelebek Vana DN65');
  const r = toMatchResult(runQuery(line, COK_USD), line, toTry);
  check('C1 coklu aday donduruldu', (r.candidates?.length ?? 0) === 2, `${r.candidates?.length}`);
  const hepsiKurlu = (r.candidates ?? []).every((c: any) => c.kaynakKur?.currency === 'USD' && c.kaynakKur?.kur === 47.57);
  check('C2 adaylarin hepsi kaynakKur tasiyor', hepsiKurlu,
    JSON.stringify((r.candidates ?? []).map((c: any) => c.kaynakKur)));
}

console.log('── D) KUR METAVERISI OLMAYAN cevirici: sonuc kur IDDIA ETMEZ ──');
{
  const kursuz = ((v: number) => v) as TryCevirici; // .kur YOK
  const line = parseLine('Kelebek Vana DN65');
  const r = toMatchResult(runQuery(line, USD_POOL), line, kursuz);
  check('D1 kur metaverisi yoksa kaynakKur da yok (uydurma tarih/kur yasak)',
    (r as any).kaynakKur === undefined, JSON.stringify((r as any).kaynakKur));
}

// ═════════════════════════════════════════════════════════════════════════
// E-K) KUR GERI DUSUSU — GERCEK ExchangeRatesService + GERCEK MatchingService
//      (para dogrulugu turu, 14.09.2026 · KUR-01 / KUR-02)
//
// NEDEN BURADA GERCEK SERVISLER: yukaridaki A-D bloklari saf outcome-mapper'i
// ELLE yazilmis bir ceviriciyle sinar — uretimdeki `buildTryConverter`
// hic cagrilmiyordu. KUR-01 tam o boslukta yasadi: TCMB ve yedek kaynak
// dusup onbellek bosken servis `usdTry = 1` (source 'fallback') doner,
// cevirici kaynaga bakmadan 100 dolarlik kalemi 100 TL yazar ve satir
// "tek eslesme · yuksek guven" alirdi (olculdu: 47,35 kat dusuk teklif).
// Yalniz global fetch taklit edilir (ag); prisma sahtedir (DB yok).
// ═════════════════════════════════════════════════════════════════════════
const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
const { ExchangeRatesService } = require('../src/ozellik/fiyat/exchange-rates/exchange-rates.service');

const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="12.09.2026" Date="09/12/2026">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>47.20</ForexBuying><ForexSelling>47.35</ForexSelling></Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>54.00</ForexBuying><ForexSelling>54.10</ForexSelling></Currency>
</Tarih_Date>`;
type AgModu = 'ag-yok' | 'tcmb-ok' | 'asili';
let agModu: AgModu = 'ag-yok';
let fetchSayac = 0;
/** L blogu sahte saati: 'asili' fetch saati 8 sn ilerletir (kaynak zaman asimi), gercek bekleme yok. */
const saat = { t: 1_000_000 };
(global as any).fetch = async (url: string) => {
  fetchSayac++;
  if (agModu === 'ag-yok') throw new Error('getaddrinfo ENOTFOUND (test)');
  // undici'nin asili sunucuda urettigi hata (14.09 gercek sunucuyla olculdu)
  if (agModu === 'asili') { saat.t += 8000; throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }
  return url.includes('tcmb')
    ? { ok: true, status: 200, text: async () => TCMB_XML }
    : { ok: true, status: 200, json: async () => ({ rates: { TRY: 47.3, EUR: 0.875 } }) };
};
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
function iscilikFiyati(name: string, unitPrice: number, currency: string, unit = 'mt', firma?: any) {
  return {
    id: `lp|${name}|${unit}|${firma?.id ?? 'A'}`, unitPrice, discountRate: 0, unit, currency, firma,
    laborItem: { id: `li|${name}`, name, unit, unitPrice, discipline: 'mechanical', category: null, description: null,
      cins: null, baglanti: null, capRaw: null, boyMm: null, not: null, adSlug: null, adBucket: null, adTokens: [],
      cinsNorm: null, cinsTokens: [], baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown', capTags: [],
      capNorm: null, boyTag: null, displayName: null, indexVersion: 0, belirsiz: false },
  };
}
function eslestirici(fx: any, satirlar: any[], digerMarka: any[] = [], iscilikAna: any[] = [], iscilikDiger: any[] = [], hafiza: any = null) {
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? digerMarka : satirlar) },
    laborPrice: { findMany: async (a: any) => (a?.where?.firmaId ? iscilikAna : a?.where?.firma ? iscilikDiger : []) },
    brand: { findUnique: async () => ({ name: 'AYVAZ' }) },
    eslesmeHafizasi: { findUnique: async () => hafiza, upsert: async () => {} },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'f1' }) },
  };
  return new MatchingService(prisma, new TerminologyService(prisma), fx);
}
const KIMLIK = { userId: 'u1', firmaId: 'f1' };
const SATIR = 'Dilatasyon kompansatörü DN25';
const tekKomp = (paraBirimi: string, price = 100, discount = 0) =>
  [kutuphaneSatiri({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price, discount, paraBirimi, urunKodu: `C-${paraBirimi}` })];
/** Hicbir yolda NaN / null / sonsuz fiyat sizmasin (cevrilemez satirin guvenlik agi). */
const fiyatlarSayi = (r: any) => [r?.netPrice, r?.listPrice, ...(r?.candidates ?? []).map((c: any) => c.netPrice),
  ...(r?.alternatives ?? []).map((a: any) => a.netPrice)].every((v) => typeof v === 'number' && Number.isFinite(v));

async function kurGeriDususu() {
  const realLog = console.log; const realWarn = console.warn;
  const sus = () => { console.log = () => {}; console.warn = () => {}; };
  const ac = () => { console.log = realLog; console.warn = realWarn; };

  console.log('── E) KUR-01: TCMB + yedek kaynak YOK, onbellek BOS → dovizli satira fiyat YAZILMAZ ──');
  {
    agModu = 'ag-yok';
    const fx = sessizKur();
    sus();
    const usd = (await eslestirici(fx, tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
    const eur = (await eslestirici(fx, tekKomp('EUR', 200, 10)).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
    ac();
    check('E0 olcutun kendisi: kur servisi gercekten geri dustu (source=fallback, usdTry=1)',
      (await (async () => { sus(); const k = await sessizKur().getRates(); ac(); return k.source === 'fallback' && k.usdTry === 1; })()));
    check('E1 USD tek aday: fiyat YAZILMAZ (netPrice 0) — 100 dolar 100 TL olamaz', usd?.netPrice === 0 && usd?.listPrice === 0,
      `net=${usd?.netPrice} list=${usd?.listPrice} conf=${usd?.confidence}`);
    check('E2 USD tek aday: yuksek guven YOK, satir "kur alinamadi" ile isaretli', usd?.confidence === 'none' && usd?.kurAlinamadi === true,
      `conf=${usd?.confidence} kurAlinamadi=${usd?.kurAlinamadi}`);
    check('E3 kullanici nedeni gorur: "Kur alınamadı" sebep metni', /Kur alınamadı/.test(usd?.reason ?? ''), `reason=${usd?.reason}`);
    check('E4 uydurma "kur 1" teklife DONMAZ (kaynakKur yok)', usd?.kaynakKur === undefined, JSON.stringify(usd?.kaynakKur));
    check('E5 EUR + %10 iskonto: ayni karar (fiyatsiz + isaretli)', eur?.netPrice === 0 && eur?.kurAlinamadi === true,
      `net=${eur?.netPrice} kurAlinamadi=${eur?.kurAlinamadi}`);
    check('E6 kur servisi geri dustugunde baska marka onerisi de acilmaz ("bu markada yok" DEGIL, urun var)',
      !usd?.alternatives?.length, `alternatives=${usd?.alternatives?.length}`);
  }

  console.log('── F) COKLU ADAY + KARISIK HAVUZ: karar SATIR BAZINDA ──');
  {
    agModu = 'ag-yok';
    const fx = sessizKur();
    const cok = [
      kutuphaneSatiri({ ...KOMP, ad: 'Omega V-Flex dilatasyon kompansatörü', baglanti: 'flanşlı', cap: 'DN25', price: 100, paraBirimi: 'USD', urunKodu: 'M1' }),
      kutuphaneSatiri({ ...KOMP, ad: 'Eksenel metal körüklü kompansatör', baglanti: 'flanşlı', cap: 'DN25', price: 80, paraBirimi: 'USD', urunKodu: 'M2' }),
    ];
    const karisik = [
      ...tekKomp('USD'),
      kutuphaneSatiri({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'V1', sheetName: 'S' }),
    ];
    sus();
    const rc = (await eslestirici(fx, cok).bulkMatch(KIMLIK, 'brand-1', ['Kompansatör DN25']))['Kompansatör DN25'];
    const rk = await eslestirici(fx, karisik).bulkMatch(KIMLIK, 'brand-1', [SATIR, 'Küresel vana DN25']);
    ac();
    check('F1 coklu dovizli aday: fiyatli secim listesi SUNULMAZ (aday "X TL" diye gorunmez)',
      rc?.netPrice === 0 && !rc?.candidates?.length && rc?.kurAlinamadi === true,
      `conf=${rc?.confidence} aday=${rc?.candidates?.length} kurAlinamadi=${rc?.kurAlinamadi}`);
    check('F2 ayni istekte TL satiri etkilenmez: kur dusukken TL fiyat YAZILIR', rk['Küresel vana DN25']?.netPrice === 850,
      `TL satir net=${rk['Küresel vana DN25']?.netPrice} conf=${rk['Küresel vana DN25']?.confidence}`);
    check('F3 ayni istekte dovizli satir fiyatsiz + isaretli', rk[SATIR]?.netPrice === 0 && rk[SATIR]?.kurAlinamadi === true,
      `USD satir net=${rk[SATIR]?.netPrice}`);
    check('F4 hicbir yolda NaN/null fiyat sizmaz', [rc, rk[SATIR], rk['Küresel vana DN25']].every(fiyatlarSayi));
  }

  console.log('── G) KUR GERI GELINCE yeniden eslestirme fiyatlar (donmus yanlis fiyat yok) ──');
  {
    const fx = sessizKur(); // AYNI servis ornegi: geri dusus onbellege yazilmamali
    sus();
    agModu = 'ag-yok';
    const once = (await eslestirici(fx, tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
    agModu = 'tcmb-ok';
    const sonra = (await eslestirici(fx, tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
    ac();
    check('G1 once isaretli, kur donunce ayni satir TCMB kuruyla fiyatlanir (100 USD × 47,35 = 4.735)',
      once?.kurAlinamadi === true && sonra?.netPrice === 4735 && sonra?.confidence === 'high' && !sonra?.kurAlinamadi,
      `once=${once?.netPrice}/${once?.kurAlinamadi} sonra=${sonra?.netPrice}/${sonra?.confidence}`);
    check('G2 kur donunce kaynakKur gercek kuru tasir (USD 47,35 · 12.09.2026)',
      sonra?.kaynakKur?.currency === 'USD' && sonra?.kaynakKur?.kur === 47.35 && sonra?.kaynakKur?.tarih === '12.09.2026',
      JSON.stringify(sonra?.kaynakKur));
  }

  console.log('── H) ONERI YOLLARI: baska marka / baska firma dovizli onerisi ──');
  {
    const ana = [kutuphaneSatiri({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'V1', sheetName: 'S' })];
    const diger = tekKomp('USD').map((r) => ({ ...r, id: `${r.id}-b2`, brand: { id: 'brand-2', name: 'DOVIZ MARKA' } }));
    const L = 'SİYAH ÇELİK BORU - DN50';
    const sonuc: Record<string, any> = {};
    for (const m of ['ag-yok', 'tcmb-ok'] as AgModu[]) {
      agModu = m;
      const fx = sessizKur();
      sus();
      sonuc[`marka-${m}`] = (await eslestirici(fx, ana, diger).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
      sonuc[`isc-${m}`] = (await eslestirici(fx, [], [], [iscilikFiyati('Siyah çelik boru montajı kaynaklı DN50', 10, 'USD')])
        .bulkMatchLabor(KIMLIK, 'firma-A', [L], undefined, { [L]: 'mt' }))[L];
      sonuc[`isc-alt-${m}`] = (await eslestirici(fx, [], [], [iscilikFiyati('Küresel vana montajı DN50', 120, 'TRY', 'adet')],
        [iscilikFiyati('Siyah çelik boru montajı kaynaklı DN50', 10, 'EUR', 'mt', { id: 'firma-B', name: 'B FIRMASI' })])
        .bulkMatchLabor(KIMLIK, 'firma-A', [L], undefined, { [L]: 'mt' }))[L];
      ac();
    }
    const altOk = sonuc['marka-tcmb-ok']?.alternatives?.[0];
    check('H0 olcutun kendisi: kur varken baska marka dovizli onerisi GERCEKTEN geliyor (fixture kaniti)',
      altOk?.netPrice === 4735, JSON.stringify(sonuc['marka-tcmb-ok']?.alternatives));
    check('H1 kur yokken dovizli baska marka onerisi SUNULMAZ (secilince 1:1 yazardi)',
      !(sonuc['marka-ag-yok']?.alternatives ?? []).some((a: any) => a.brandName === 'DOVIZ MARKA'),
      JSON.stringify(sonuc['marka-ag-yok']?.alternatives));
    check('H2 kur varken oneri de kaynakKur tasir (secilen onerinin kuru donar)',
      altOk?.kaynakKur?.currency === 'USD' && altOk?.kaynakKur?.kur === 47.35, JSON.stringify(altOk?.kaynakKur));
    check('H3 iscilik USD kalem: kur yokken fiyatsiz + isaretli (malzeme ikizi)',
      sonuc['isc-ag-yok']?.netPrice === 0 && sonuc['isc-ag-yok']?.kurAlinamadi === true,
      `net=${sonuc['isc-ag-yok']?.netPrice} conf=${sonuc['isc-ag-yok']?.confidence}`);
    check('H4 iscilik USD kalem: kur varken fiyatlanir (10 × 47,35 = 473,5)', sonuc['isc-tcmb-ok']?.netPrice === 473.5,
      `net=${sonuc['isc-tcmb-ok']?.netPrice}`);
    check('H5 kur yokken baska firmanin EUR iscilik onerisi SUNULMAZ',
      !(sonuc['isc-alt-ag-yok']?.alternatives ?? []).length, JSON.stringify(sonuc['isc-alt-ag-yok']?.alternatives));
    check('H6 kur varken baska firma EUR onerisi gelir ve kuru tasir (fixture kaniti + baglanti)',
      sonuc['isc-alt-tcmb-ok']?.alternatives?.[0]?.netPrice === 541 && sonuc['isc-alt-tcmb-ok']?.alternatives?.[0]?.kaynakKur?.currency === 'EUR',
      JSON.stringify(sonuc['isc-alt-tcmb-ok']?.alternatives));
  }

  console.log('── I) HAFIZA OTOYAZI kur yokken fiyat YAZAMAZ ──');
  {
    let kanit: any = null;
    let dusuk: any = null;
    for (const satir of ['Paslanmaz Dilatasyon kompansatörü DN25', 'Dilatasyon kompansatörü DN25 PN16 özel']) {
      agModu = 'tcmb-ok';
      sus();
      const ilk = (await eslestirici(sessizKur(), tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [satir]))[satir];
      ac();
      if (ilk?.confidence !== 'multi' || ilk.candidates?.length !== 1) continue;
      const hafiza = { secilenAd: ilk.candidates[0].materialName, secimSayisi: 3 };
      sus();
      kanit = (await eslestirici(sessizKur(), tekKomp('USD'), [], [], [], hafiza).bulkMatch(KIMLIK, 'brand-1', [satir]))[satir];
      agModu = 'ag-yok';
      dusuk = (await eslestirici(sessizKur(), tekKomp('USD'), [], [], [], hafiza).bulkMatch(KIMLIK, 'brand-1', [satir]))[satir];
      ac();
      break;
    }
    check('I0 olcutun kendisi: kur varken hafiza otoyazisi GERCEKTEN ateslendi (fixture kaniti)',
      kanit?.hafizaOtoyaz === true && kanit?.netPrice === 4735, `otoyaz=${kanit?.hafizaOtoyaz} net=${kanit?.netPrice}`);
    check('I1 kur yokken hafiza otoyazisi fiyat yazmaz, satir isaretli', dusuk?.netPrice === 0 && !dusuk?.hafizaOtoyaz && dusuk?.kurAlinamadi === true,
      `net=${dusuk?.netPrice} otoyaz=${dusuk?.hafizaOtoyaz} kurAlinamadi=${dusuk?.kurAlinamadi}`);
  }

  console.log('── J) KUR-02: para birimi kodu yazim bicimi 1:1 TL uretmez ──');
  {
    agModu = 'tcmb-ok';
    const olc = async (kod: string) => {
      sus();
      const fx = sessizKur();
      fetchSayac = 0;
      const r = (await eslestirici(fx, tekKomp(kod)).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR];
      ac();
      return { r, fetch: fetchSayac };
    };
    const sonuclar: Record<string, any> = {};
    for (const kod of ['usd', 'DOLAR', '$', ' USD ', 'EURO', 'AVRO', '€', 'eur', 'GBP', '£', 'TL', '₺']) sonuclar[kod] = await olc(kod);
    const usdYazimlari = ['usd', 'DOLAR', '$', ' USD '].filter((k) => sonuclar[k].r?.netPrice !== 4735 || sonuclar[k].r?.kaynakKur?.currency !== 'USD');
    const eurYazimlari = ['EURO', 'AVRO', '€', 'eur'].filter((k) => sonuclar[k].r?.netPrice !== 5410 || sonuclar[k].r?.kaynakKur?.currency !== 'EUR');
    check('J1 USD yazimlari (usd · DOLAR · $ · bosluklu) TCMB kuruyla cevrilir ve kuru tasir', usdYazimlari.length === 0,
      usdYazimlari.map((k) => `${k}=${sonuclar[k].r?.netPrice}`).join(' | '));
    check('J2 EUR yazimlari (EURO · AVRO · € · eur) TCMB kuruyla cevrilir ve kuru tasir', eurYazimlari.length === 0,
      eurYazimlari.map((k) => `${k}=${sonuclar[k].r?.netPrice}`).join(' | '));
    const taninmayan = ['GBP', '£'].filter((k) => !(sonuclar[k].r?.netPrice === 0 && /Para birimi tanınmadı/.test(sonuclar[k].r?.reason ?? '')));
    check('J3 taninmayan para birimi (GBP · £) fiyatsiz kalir ve nedeni soylenir — 1:1 TL YAZILMAZ', taninmayan.length === 0,
      taninmayan.map((k) => `${k}: net=${sonuclar[k].r?.netPrice} reason=${sonuclar[k].r?.reason}`).join(' | '));
    check('J4 taninmayan para birimi "kur alinamadi" SAYILMAZ (yeniden denemek duzeltmez, kutuphane duzeltilmeli)',
      ['GBP', '£'].every((k) => !sonuclar[k].r?.kurAlinamadi));
    check('J5 TL yazimlari (TL · ₺) TRY sayilir: kur servisine hic gidilmez, fiyat aynen yazilir',
      ['TL', '₺'].every((k) => sonuclar[k].r?.netPrice === 100 && sonuclar[k].fetch === 0),
      ['TL', '₺'].map((k) => `${k}: net=${sonuclar[k].r?.netPrice} fetch=${sonuclar[k].fetch}`).join(' | '));
  }

  console.log('── K) KUR GECERLILIK KURALI: kaynak VE deger birlikte ──');
  {
    const { kurGecerli, paraBirimiKodu } = require('../src/ozellik/fiyat/exchange-rates/exchange-rates.service');
    check('K1 source=fallback ise kur degeri ne olursa olsun GECERSIZ', kurGecerli({ usdTry: 47.35, eurTry: 54.1, source: 'fallback' }, 'USD') === false);
    check('K2 kur 1 ya da alti GECERSIZ (1:1 TL ile ayni anlam)', kurGecerli({ usdTry: 1, eurTry: 1, source: 'tcmb' }, 'EUR') === false
      && kurGecerli({ usdTry: 0, eurTry: 54.1, source: 'cache' }, 'USD') === false);
    check('K3 TCMB / er-api / onbellek kuru GECERLI', ['tcmb', 'er-api', 'cache'].every((s) => kurGecerli({ usdTry: 47.35, eurTry: 54.1, source: s }, 'USD')));
    check('K4 bos / tanimsiz para birimi TRY sayilir (eski satirlar)', paraBirimiKodu(null) === 'TRY' && paraBirimiKodu('') === 'TRY' && paraBirimiKodu(undefined) === 'TRY');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // L) NEGATIF ONBELLEK (tur 3 A4d, 14.09): iki kaynak ASILI kalinca her
  //    getRates 16 sn bekliyordu (gercek zamanla olculdu); surukle-doldur 10
  //    satir ≈ 160 sn. Yalniz asili (>= 4 sn) hatadan sonra 60 sn aga cikilmaz;
  //    hizli hata pencere acmaz (G1/G2). Zaman SAHTE: servis `simdi` alanindan
  //    okur, asili fetch saati 8 sn ilerletir — gercek bekleme yok. (Gercek
  //    AbortSignal zamanlayicisi unref'li: bekleme ortasinda surec exit 0 ile
  //    biter, yarida kesilen cikti "yesil" gorunur — olculdu.)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── L) NEGATIF ONBELLEK: asili kaynak her istekte 16 sn bekletmez ──');
  {
    const { kurGecerli } = require('../src/ozellik/fiyat/exchange-rates/exchange-rates.service');
    const saatliKur = () => { const fx = sessizKur(); (fx as any).simdi = () => saat.t; return fx; };
    const BAYAT_KUR = { usdTry: 47.35, eurTry: 54.1, usdTryBuying: 47.2, eurTryBuying: 54, source: 'tcmb', date: '12.09.2026', fetchedAt: '' };
    const TL_ANA = [kutuphaneSatiri({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', baglanti: 'dişli', cap: 'DN25', price: 850, urunKodu: 'V1', sheetName: 'S' })];
    const CAPLAR = ['DN25', 'DN32', 'DN40', 'DN50', 'DN65'];
    const USD_DIGER = CAPLAR.map((cap) => kutuphaneSatiri({ ...KOMP, ad: 'Dilatasyon kompansatörü', baglanti: 'flanşlı', cap, price: 100, paraBirimi: 'USD', urunKodu: `C-${cap}` }, { id: 'brand-2', name: 'DOVIZ MARKA' }));

    sus();
    agModu = 'asili'; saat.t = 1_000_000; fetchSayac = 0;
    const r0 = await saatliKur().getRates();
    const l0 = { fetch: fetchSayac, saat: saat.t, source: r0.source };

    agModu = 'asili'; saat.t = 1_000_000; fetchSayac = 0;
    const fx1 = saatliKur();
    await fx1.getRates();
    const pencerede: any[] = [];
    for (let i = 0; i < 5; i++) { saat.t += 1000; pencerede.push(await fx1.getRates()); }
    const l1Fetch = fetchSayac;

    agModu = 'asili'; saat.t = 10_000_000; fetchSayac = 0;
    const fx2 = saatliKur();
    (fx2 as any).cache = { ...BAYAT_KUR }; (fx2 as any).cacheAt = saat.t - 2 * 60 * 60 * 1000;
    const b1 = await fx2.getRates();
    saat.t += 1000;
    const b2 = await fx2.getRates();
    const l2Fetch = fetchSayac;

    agModu = 'asili'; saat.t = 20_000_000; fetchSayac = 0;
    const fx3 = saatliKur();
    await fx3.getRates();
    const bitis = saat.t;
    saat.t = bitis + 59_000; await fx3.getRates(); const f59 = fetchSayac;
    saat.t = bitis + 61_000; await fx3.getRates(); const f61 = fetchSayac;

    agModu = 'asili'; saat.t = 30_000_000; fetchSayac = 0;
    const fx4 = saatliKur();
    await fx4.getRates();
    saat.t += 61_000; agModu = 'tcmb-ok';
    const d1 = await fx4.getRates();
    agModu = 'asili'; saat.t += 5_000;
    const d2 = await fx4.getRates();

    agModu = 'ag-yok'; saat.t = 40_000_000; fetchSayac = 0;
    const fx5 = saatliKur();
    const h1 = await fx5.getRates();
    agModu = 'tcmb-ok';
    const h2 = await fx5.getRates();

    agModu = 'asili'; saat.t = 50_000_000; fetchSayac = 0;
    const fx6 = saatliKur();
    const doldur: any[] = [];
    for (let i = 0; i < 10; i++) doldur.push((await eslestirici(fx6, tekKomp('USD')).bulkMatch(KIMLIK, 'brand-1', [SATIR]))[SATIR]);
    const l6Fetch = fetchSayac;

    agModu = 'asili'; saat.t = 60_000_000; fetchSayac = 0;
    await eslestirici(saatliKur(), TL_ANA, USD_DIGER).bulkMatch(KIMLIK, 'brand-1', CAPLAR.map((c) => `Dilatasyon kompansatörü ${c}`));
    const l7Fetch = fetchSayac;
    agModu = 'ag-yok';
    ac();

    check('L0 olcutun kendisi: asili deneme 2 kaynaga gitti, saat 16 sn ilerledi, geri dusus dondu',
      l0.fetch === 2 && l0.saat === 1_016_000 && l0.source === 'fallback', JSON.stringify(l0));
    check('L1a ★ pencere icinde 5 cagri daha: aga cikilmaz (fetch 2de kalir)', l1Fetch === 2, `fetch=${l1Fetch}`);
    check('L1b pencerede donen deger fallback, kurGecerli USD/EUR false (KUR-01 aynen)',
      pencerede.every((r) => r.source === 'fallback' && !kurGecerli(r, 'USD') && !kurGecerli(r, 'EUR')), pencerede.map((r) => r.source).join(','));
    check('L2a bayat basarili onbellek + asili kaynak: ilk cagri bayat kuru doner (cache, 47,35)', b1.source === 'cache' && b1.usdTry === 47.35, `${b1.source} ${b1.usdTry}`);
    check('L2b pencerede bayat kur ONCE doner, aga cikilmaz, kurGecerli true',
      b2.source === 'cache' && b2.usdTry === 47.35 && kurGecerli(b2, 'USD') && l2Fetch === 2, `${b2.source} ${b2.usdTry} fetch=${l2Fetch}`);
    check('L3a pencere bitmeden (+59 sn) aga cikilmaz', f59 === 2, `fetch=${f59}`);
    check('L3b pencere bitince (+61 sn) yeniden denenir', f61 === 4, `fetch=${f61}`);
    check('L4a pencereden sonra kur donunce TCMB kuru (47,35)', d1.source === 'tcmb' && d1.usdTry === 47.35, `${d1.source} ${d1.usdTry}`);
    check('L4b kur donduktan sonra kaynak yeniden asili olsa da pozitif onbellek doner', d2.source === 'cache' && d2.usdTry === 47.35, `${d2.source} ${d2.usdTry}`);
    check('L5 ★ HIZLI hata pencere acmaz: kur hemen donerse ayni servis ornegi TCMB kurunu verir', h1.source === 'fallback' && h2.source === 'tcmb', `${h1.source} → ${h2.source}`);
    check('L6a ★ 10 satirlik surukle-doldur (ayni servis): toplam fetch 2 (onceden 20 ≈ 160 sn)', l6Fetch === 2, `fetch=${l6Fetch}`);
    check('L6b pencerede de her satir fiyatsiz + "kur alinamadi" (KUR-01)', doldur.every((r) => r?.netPrice === 0 && r?.kurAlinamadi === true),
      doldur.map((r) => `${r?.netPrice}/${r?.kurAlinamadi}`).join(','));
    check('L7 ★ tek istekte 5 "bu markada yok" adi (diger markada USD): fetch 2 (onceden 10)', l7Fetch === 2, `fetch=${l7Fetch}`);
  }
}

bitmezseKirmizi(kurGeriDususu().then(() => {
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  const toplam = passed + failures.length;
  if (failures.length) {
    console.log(` ✗ KUR DONMASI: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
    for (const f of failures) console.log(`   ✗ ${f}`);
    console.log('════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
  console.log(` ✓ KUR DONMASI: ${passed}/${toplam} kriter gecti`);
  console.log('════════════════════════════════════════════════════════════════');
}).catch((e) => { console.error('BEKLENMEYEN HATA:', e); process.exit(1); }));
