/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  S6 — AILE UYUSMAZLIGI TESHISI  (`npm run test:aile-uyusmazligi`)
 *
 *  KORUNAN SOZLESME (metin bir CIKTIYI degil, bir DAVRANISI tarif eder):
 *    "Bir aday YALNIZCA aile kilidi yuzunden elendiyse, kullaniciya bos ekran
 *     gosterilmez — durum SOYLENIR ve aday ONAYA sunulur."
 *
 *  NEDEN VAR — NORM KELEPÇE (06.08): satir "Sprinkler Boru Askisi, DN150"
 *  icindeki "Boru" yuzunden 'boru' ailesine cozuluyor, urunler 'kelepce'
 *  ailesinde kaliyordu. Aile SERT KILIT oldugu icin sonuc `none/ad-yok` idi —
 *  markanin urunu GERCEKTEN tasimadigi durumla BIT BIT AYNI. Ekranda
 *  `Bu markada "boru" bulunamadi.` yaziyordu; teshis bir oturum surdu.
 *
 *  ★ BU DOSYA O TEK VAKAYI DEGIL, SINIFI KORUR. Kullanicilar kendi
 *  kutuphanelerine kendi adlarini yazdikca ayni uyusmazlik tahmin edemeyecegimiz
 *  bicimlerde tekrar dogar; sozluge kayit eklemek bilinen vakalari kapatir,
 *  sinifi kapatmaz. O yuzden buradaki fixture'lar sozlukte KAYITLI OLMAYAN
 *  adlardan secildi — kural veriden degil, MEKANIZMADAN gecmek zorunda.
 *
 *  DORT BLOK:
 *    A) KURTARMA    — uyusmazlik SOYLENMELI (iki ayri aile cifti ile)
 *    B) SESSIZ KALMA— gercekten yoksa teshis KONUSMAMALI (gurultu yasagi)
 *    C) FIYAT YAZMA — teshisin buldugu aday ASLA otomatik yazilmaz
 *    D) BOZMAMA     — normal eslesmeler aynen calisir
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, aileUyusmazligiTeshisi } from '../src/ozellik/eslestirme/matching/index/query-engine';
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

/** Motorun IKI hali: ham (teshissiz) ve teshisli — fark tam olarak S6'dir. */
function ham(q: string, pool: IndexedRow[]): QueryOutcome {
  return runQuery(parseLine(q), pool, undefined);
}
function teshisli(q: string, pool: IndexedRow[]): QueryOutcome {
  const line = parseLine(q);
  return aileUyusmazligiTeshisi(line, pool, undefined, runQuery(line, pool, undefined));
}
const kapiVar = (o: QueryOutcome, k: string) => o.kind === 'ask' && (o.kapilar ?? []).includes(k as any);
const aileOf = (q: string) => parseLine(q).familySlug;

// ════════════════════════════════════════════════════════════════════════════
// HAVUZ 1 — KELEPÇE URETICISI (NORM deseni). Markada BORU YOK.
// ════════════════════════════════════════════════════════════════════════════
const NORM: IndexedRow[] = [
  prod({ kategori: 'Kelepçeler', ad: 'Sprinkler Kelepçe', cins: 'lastikli', cap: '6"', price: 51.7, birim: 'Ad.', urunKodu: 'SK-6', sheetName: 'NORM' }),
  prod({ kategori: 'Kelepçeler', ad: 'Sprinkler Kelepçe', cins: 'lastikli', cap: '2 1/2"', price: 28.4, birim: 'Ad.', urunKodu: 'SK-25', sheetName: 'NORM' }),
  prod({ kategori: 'Kelepçeler', ad: 'Somunlu Kelepçe', cins: 'galvaniz', cap: '4"', price: 33.2, birim: 'Ad.', urunKodu: 'SM-4', sheetName: 'NORM' }),
];

// ════════════════════════════════════════════════════════════════════════════
// HAVUZ 2 — HORTUM URETICISI. Markada FITTING YOK. (ikinci aile cifti)
// ════════════════════════════════════════════════════════════════════════════
const HORTUMCU: IndexedRow[] = [
  prod({ kategori: 'Esnek Bağlantı', ad: 'Yangın Hortumu', cins: 'örgülü', cap: 'DN65', price: 1250, birim: 'Ad.', urunKodu: 'YH-65', sheetName: 'FLEX' }),
  prod({ kategori: 'Esnek Bağlantı', ad: 'Yangın Hortumu', cins: 'örgülü', cap: 'DN50', price: 980, birim: 'Ad.', urunKodu: 'YH-50', sheetName: 'FLEX' }),
];

console.log('── A) KURTARMA: uyusmazlik SOYLENMELI (iki ayri aile cifti) ──');

// A1 — NORM deseni. Sozlukte OLMAYAN bir ad kullaniliyor ("boru bağlantı
//      aparatı"); yani kurtaris sozluk kaydindan DEGIL, mekanizmadan geliyor.
const A1 = 'Sprinkler Boru Bağlantı Aparatı, 6"';
{
  const a = aileOf(A1);
  const h = ham(A1, NORM);
  const t = teshisli(A1, NORM);
  check(`A1 on kosul: satir ailesi cozuldu ve havuzda YOK (aile=${a})`,
    !!a && !NORM.some((r) => r.urun.adSlug === a), `aile=${a}`);
  check('A1 ESKI davranis: sessiz none/ad-yok',
    h.kind === 'none' && h.reason === 'ad-yok', `${h.kind}/${(h as any).reason}`);
  check('A1 YENI davranis: uyusmazlik soyleniyor (ask + aile-uyusmazligi kapisi)',
    t.kind === 'ask' && kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar}`);
  check('A1 aday GERCEKTEN baska ailede',
    t.kind === 'ask' && t.rows[0].urun.adSlug !== a, `aday aile=${t.kind === 'ask' ? t.rows[0].urun.adSlug : '-'}`);
  check('A1 mesaj IKI aileyi de adiyla soyluyor',
    t.kind === 'ask' && !!t.uyariNot && t.uyariNot.includes(String(a)) && t.uyariNot.includes(t.rows[0].urun.adSlug),
    t.kind === 'ask' ? t.uyariNot : '-');
}

// A2 — IKINCI AILE CIFTI (fitting ↔ hortum). Ayni mekanizma, baska aileler:
//      fix aileye ozel degilse burada da tutmali. [[feedback-genel-cozum-iki-aile-kanit]]
const A2 = 'Yangın Rakoru, DN65';
{
  const a = aileOf(A2);
  const h = ham(A2, HORTUMCU);
  const t = teshisli(A2, HORTUMCU);
  check(`A2 on kosul: satir ailesi cozuldu ve havuzda YOK (aile=${a})`,
    !!a && !HORTUMCU.some((r) => r.urun.adSlug === a), `aile=${a}`);
  check('A2 ESKI davranis: sessiz none/ad-yok',
    h.kind === 'none' && h.reason === 'ad-yok', `${h.kind}/${(h as any).reason}`);
  check('A2 YENI davranis: uyusmazlik soyleniyor',
    t.kind === 'ask' && kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar}`);
}

console.log('── B) SESSIZ KALMA: gercekten yoksa teshis KONUSMAMALI ──');

// B1 — Markada o cap HIC yok → aday da yok. Teshis uydurmamali.
{
  const q = 'Sprinkler Boru Bağlantı Aparatı, DN500';
  const t = teshisli(q, NORM);
  check('B1 olmayan capta teshis SUSUYOR (none kalir)',
    t.kind === 'none', `${t.kind}`);
}
// B2 — Satirin adi havuzun dagarcigiyla hic ortusmuyor → aday yok.
{
  const q = 'Kalorimetre, DN65';
  const t = teshisli(q, HORTUMCU);
  check('B2 alakasiz urun adinda teshis SUSUYOR',
    t.kind === 'none', `${t.kind} ${(t as any).kapilar ?? ''}`);
}
// B3 — GURULTU YASAGI: ikinci gecis TEK adaya inemiyorsa teshis konusmaz.
//      (Havuzda ayni ada sahip iki farkli cap var, satirda cap YOK.)
{
  const q = 'Yangın Rakoru';
  const t = teshisli(q, HORTUMCU);
  check('B3 ikinci gecis tek adaya inmiyorsa teshis SUSUYOR',
    !kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar ?? '-'}`);
}

console.log('── C) FIYAT YAZMA YASAGI: teshis adayi otomatik yazilmaz ──');
{
  const line = parseLine(A1);
  const t = teshisli(A1, NORM);
  const r = toMatchResult(t, line, (v: number) => v);
  check('C1 netPrice YAZILMADI (0)', r.netPrice === 0, `netPrice=${r.netPrice}`);
  check('C2 confidence "multi" (onay isteniyor)', r.confidence === 'multi', `${r.confidence}`);
  check('C3 kullaniciya gerekce gosteriliyor', !!r.reason && r.reason.length > 10, r.reason ?? '-');
  check('C4 aday ekranda listeleniyor', (r.candidates?.length ?? 0) === 1, `${r.candidates?.length ?? 0} aday`);
}

console.log('── D) BOZMAMA: normal yollar aynen calisiyor ──');
{
  // D1 — Aile TUTAN normal eslesme: tek aday → fiyat OTOMATIK yazilir.
  const q = 'Somunlu Kelepçe, 4"';
  const line = parseLine(q);
  const t = teshisli(q, NORM);
  const r = toMatchResult(t, line, (v: number) => v);
  check('D1 aile tutunca fiyat otomatik yaziliyor (teshis karismiyor)',
    r.netPrice === 33.2 && !kapiVar(t, 'aile-uyusmazligi'), `netPrice=${r.netPrice} kind=${t.kind}`);
}
{
  // D2 — Ailesi HIC cozulemeyen satirda teshis calismaz (uyusmazlik kavrami yok).
  const q = 'ZZZ Bilinmeyen Aparat, 6"';
  const t = teshisli(q, NORM);
  check('D2 ailesiz satirda teshis kapisi ATESLEMEZ',
    !kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar ?? '-'}`);
}
{
  // D3 — Ayni sorgu iki kez: teshis SAF olmali (yan etkisiz, deterministik).
  const a = JSON.stringify(teshisli(A1, NORM));
  const b = JSON.stringify(teshisli(A1, NORM));
  check('D3 teshis deterministik (yan etkisiz)', a === b);
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
const toplam = passed + failures.length;
if (failures.length) {
  console.log(` ✗ AILE UYUSMAZLIGI: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log('════════════════════════════════════════════════════════════════');
  process.exit(1);
}
console.log(` ✓ AILE UYUSMAZLIGI: ${passed}/${toplam} kriter gecti`);
console.log('════════════════════════════════════════════════════════════════');
