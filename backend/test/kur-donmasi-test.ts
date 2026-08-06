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
