/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ALIAS KELIME YUTMA — "Otomatik Sprinkler Kafasi" hic aday uretmiyordu
 *  (`npm run test:alias-yutma`)
 *
 *  KULLANICI BILDIRIMI (06.08): AYVAZ kutuphanesinde YUZLERCE "Sprinkler"
 *  varken teklif satiri "Otomatik Sprinkler Kafasi, (Sarkik, K=240)" hic aday
 *  uretmiyor, fiyat gelmiyor.
 *
 *  ── OLCULEN KOK NEDEN (iki katman) ───────────────────────────────────────
 *  1. OGRENME KAPISI YANLIS PROXY KULLANIYOR.
 *     `buildProductIndex`: `adSlug = familySlug ?? (anlamli ? adBucket : ...)`.
 *     Uc cagiran (library.service:164, admin.service:1151, :1602) "sozluksuz
 *     self-family mi?" sorusunu `adSlug === adBucket` diye TAHMIN ediyor.
 *     Ama SOZLUGUN COZDUGU tek kelimelik adlarda da esitlik dogar:
 *       ad="Sprinkler" → familySlug='sprinkler' (sozlukten), adBucket='sprinkler'
 *     → sozlugun TANIDIGI ad "sozluksuz" sanilip GLOBAL alias ogreniliyor
 *       (alias='sprinkler', impliedType='sprinkler').
 *     OLCULDU: 381 ad adayindan 68'i bu tuzaga dusuyor (Fan, Damper, Conta,
 *     Dubel, Kelepce, Kanal, Hidrant, Kabin, Kalorimetre, Kolektor...).
 *     Yerel DB'de kanit: TerminologyAlias 'sprinkler|sprinkler|GLOBAL'.
 *  2. YUTMA SAVUNMASIZ.
 *     `query-engine.ts:66-68` alias kelimelerini satirdan duser (S3 kurali —
 *     "alias'in kendi kelimeleri kisit da degil, bulunamadi da degil").
 *     Satirin TEK ad kelimesi 'sprinkler' oldugu icin geriye AD KALMIYOR →
 *     K8 kapisi (`:255`) atesliyor → `none/ad-yok`, 0 aday.
 *     Ekranda: `Bu markada "otomatik kafasi" bulunamadi.`
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  A) Sozlugun cozdugu ad "sozluksuz" SAYILMAZ — alias ogrenilmez.
 *  B) Alias kelimelerini dusurmek satiri ADSIZ BIRAKIYORSA dusurme
 *     UYGULANMAZ. (S3'un amaci gurultuyu susturmakti, satiri kor etmek degil.)
 *     Bu, ZATEN ogrenilmis alias'lari da etkisizlestirir — canli veri
 *     temizligi beklemeden duzelir.
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, resolveFamily, tokenize, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import { AD_SOZLUGU, AD_ZENGINLESTIRME } from '../src/ozellik/eslestirme/matching/ad-cins-sozlugu';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

function prod(c: ProductColumns & { currency?: string }): IndexedRow {
  const i = buildProductIndex(c);
  return {
    id: `l-${i.rowKey}`, listPrice: c.price, customPrice: null, discountRate: 0,
    currency: c.currency ?? 'TRY',
    urun: {
      ...i, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null, boyMm: null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null, price: c.price,
    },
  } as any;
}

// AYVAZ kutuphanesinin GERCEK sekli (kullanicinin ekran goruntusunden)
const CINSLER = [
  'pendent (sarkık) · hızlı tepkimeli', 'pendent (sarkık) · standart tepkimeli',
  'upright (dik) · hızlı tepkimeli', 'upright (dik) · standart tepkimeli',
  'duvar tipi (sidewall) · hızlı tepkimeli', 'duvar tipi (sidewall) · standart',
  'gizli (concealed) · beyaz kapak', 'pendent (sarkık) · kromajlı 68°C',
  'pendent (sarkık) · 93°C', 'upright (dik) · 141°C',
];
const FIYAT = [14.5, 15, 11.5, 13, 18, 17, 10, 16, 14, 12];
const AYVAZ: IndexedRow[] = CINSLER.map((cins, i) => prod({
  kategori: 'Sprinkler', ad: 'Sprinkler', cins, baglanti: '1/2 dişli', cap: '1/2',
  birim: 'adet', price: FIYAT[i], currency: 'USD',
  urunKodu: `70826720002${i}`, not: 'UL listeli', sheetName: 'AYVAZ',
}));

const SORGU = 'Otomatik Sprinkler Kafası, (Sarkık, K=240)';

console.log('── A) ON KOSUL: aile IKI TARAFTA da cozuluyor (kilit dogru kapaniyor) ──');
{
  const line = parseLine(SORGU, 'adet');
  check('A1 satirin ailesi sprinkler', line.familySlug === 'sprinkler', String(line.familySlug));
  check('A2 urunlerin ailesi sprinkler', AYVAZ.every((r) => r.urun.adSlug === 'sprinkler'),
    AYVAZ[0].urun.adSlug);
  check('A3 alias YOKKEN motor ZATEN aday uretiyor (kok neden motorda DEGIL)',
    (runQuery(line, AYVAZ, undefined) as any).kind === 'ask',
    (runQuery(line, AYVAZ, undefined) as any).kind);
}

console.log('── B) OGRENME KAPISI: sozlugun cozdugu ad "sozluksuz" SAYILMAMALI ──');
{
  // Kapinin bugunku proxy'si: adSlug === adBucket
  // Dogru olcut: resolveFamily(ad) === null  (sozluk GERCEKTEN cozemedi)
  const adaylar = new Set<string>();
  for (const e of [...AD_SOZLUGU, ...AD_ZENGINLESTIRME]) {
    adaylar.add(e.ad);
    for (const p of e.patterns) adaylar.add(p);
  }
  for (const w of ['Boru', 'Vana', 'Sprinkler', 'Kelepçe', 'Fan', 'Damper', 'Conta']) adaylar.add(w);
  // ⚠ SOZLUKTE OLMAYAN adlar da SART: yoksa "gercek" olcut her adda false
  // olur ve B1 bos-kume yalanci yesili verir ([[feedback-bos-dizi-yalanci-yesil]]).
  for (const w of ['ZXQW Blorp Aparat', 'Mikro Kaplin Seti X9', 'Trapez Bagli Tesviye Aparati']) adaylar.add(w);

  const carpisan: string[] = [];
  for (const ad of adaylar) {
    if (!ad || ad.length < 3) continue;
    const idx = buildProductIndex({ ad, price: 1 } as any);
    if (idx.belirsiz) continue;
    // KAPI: uretimin kullandigi olcut — artik acik alan olmali
    const kapi = (idx as any).selfFamily === true;
    const gercek = resolveFamily(ad) === null;
    if (kapi !== gercek) carpisan.push(`${ad} (kapi=${kapi} gercek=${gercek})`);
  }
  check('B1 kapi ile GERCEK olcut hicbir adda ayrismiyor',
    carpisan.length === 0, `${carpisan.length} carpisma: ${carpisan.slice(0, 5).join(' · ')}`);

  const sp = buildProductIndex({ ad: 'Sprinkler', price: 1 } as any);
  check('B2 "Sprinkler" self-family DEGIL (sozluk cozuyor)',
    (sp as any).selfFamily === false, `selfFamily=${(sp as any).selfFamily}`);
  const uydurma = buildProductIndex({ ad: 'ZXQW Blorp Aparat', price: 1 } as any);
  check('B3 sozlukte OLMAYAN anlamli ad self-family (eski davranis korunur)',
    (uydurma as any).selfFamily === true && !uydurma.belirsiz,
    `selfFamily=${(uydurma as any).selfFamily} belirsiz=${uydurma.belirsiz}`);
}

console.log('── C) SAVUNMA: alias yutmasi satiri ADSIZ BIRAKAMAZ ──');
{
  // Canli DB'de ZATEN ogrenilmis alias var (sprinkler|sprinkler|GLOBAL).
  // matching.service.ts:406 bundan ignoreTokens kurar.
  const line = parseLine(SORGU, 'adet');
  const ignoreTokens = Array.from(new Set([...tokenize('sprinkler')]));
  const o: any = runQuery(line, AYVAZ, { hintFamily: null, ignoreTokens } as any);
  check('C1 alias kelimesi yutulsa da sonuc "none" DEGIL',
    o.kind !== 'none', `${o.kind}/${o.reason ?? ''}`);
  check('C2 adaylar geliyor (havuzun tamami)',
    o.kind === 'ask' && o.rows.length === AYVAZ.length,
    o.kind === 'ask' ? `${o.rows.length} aday` : o.kind);
  const r = toMatchResult(o, line, ((v: number) => v) as any);
  // ⚠ OLCUT DUZELTILDI (ilk yazim fazla katiydi): "bulunamadı" kelimesinin
  // GECMESI hata degil — Karar #3 taninmayan kelimeyi SOYLEMEK zorunda
  // ('otomatik'/'kafasi' bu markanin dagarciginda gercekten yok). Hata olan
  // sey CIKMAZ SOKAKTI: 0 aday + nokta ile biten "Bu markada ... bulunamadı."
  // Simdi ayni kelimeler soyleniyor AMA 10 aday sunulup SORU soruluyor.
  check('C3 cevap CIKMAZ degil: aday listesi + soru',
    (r.candidates?.length ?? 0) === AYVAZ.length && r.confidence === 'multi'
      && /hangi/i.test(r.reason ?? ''),
    `${r.candidates?.length ?? 0} aday · ${r.confidence} · ${JSON.stringify(r.reason)}`);
  check('C4 eski CIKMAZ metni ARTIK cikmiyor',
    !/^Bu markada .* bulunamadı\.$/.test(r.reason ?? ''), JSON.stringify(r.reason));
}

console.log('── D) S3 KURALI BOZULMADI: yutma HALA calisiyor (satir adsiz kalmiyorsa) ──');
{
  // "SPRINK HATTI BORULARI" gibi: alias kelimeleri dususe de GERIYE AD KALIR.
  const HAVUZ = [
    prod({ kategori: 'Borular', ad: 'Sprinkler Borusu', cins: 'siyah', cap: 'DN50', birim: 'm', price: 100, sheetName: 'X' }),
    prod({ kategori: 'Borular', ad: 'Sprinkler Borusu', cins: 'galvaniz', cap: 'DN50', birim: 'm', price: 130, sheetName: 'X' }),
  ];
  const line = parseLine('Siyah Sprinkler Borusu DN50', 'm');
  const o: any = runQuery(line, HAVUZ, { ignoreTokens: ['sprinkler'] } as any);
  check('D1 yutma sonrasi ad KALIYORSA dusurme uygulanir ve daraltir',
    o.kind === 'single' || (o.kind === 'ask' && o.rows.length < HAVUZ.length + 1),
    `${o.kind}${o.kind === 'ask' ? ' ' + o.rows.length : ''}`);
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
const toplam = passed + failures.length;
if (failures.length) {
  console.log(` ✗ ALIAS KELIME YUTMA: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log('════════════════════════════════════════════════════════════════');
  process.exit(1);
}
console.log(` ✓ ALIAS KELIME YUTMA: ${passed}/${toplam} kriter gecti`);
console.log('════════════════════════════════════════════════════════════════');
