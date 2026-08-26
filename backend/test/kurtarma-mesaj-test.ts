/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KM — CAP-YOK ERKEN DONUSU: KURTARMA ATLANMASI + MESAJ YALANI
 *  (`npm run test:kurtarma-mesaj`)
 *
 *  26.08 turu. VS turunda (25.08) BILINCLI ERTELENEN bulgulardan biri: query-engine'de `cap-yok`
 *  ERKEN DONUSU (rows cap filtresinden sonra bosaldiginda).
 *
 *   E2 — SESSIZ KAYIP: dosyadaki 12 'none' donusunun 12'si de V4.7 varyant
 *        kurtarmasindan ONCE doner. Kurtarma havuzlarina (`yuzeyGenis`,
 *        `varyantKurtarma`) cap suzgeci `cap-yok` donusunun ALTINDAKI iki
 *        satirda uygulanir — yani kurtarma, tam olarak ele almak icin
 *        yazildigi vakaya hic ulasamiyor: kullanici kaynak satirda "kirmizi
 *        boyali"yi secip surukluyor, hedef satirda "siyah" yazili → siyah
 *        2½" yok → "bu markada yok". OYSA kirmizi boyali 2½" kutuphanede
 *        DURUYOR. (V4.7'nin 30.07 gerekcesiyle BIREBIR ayni vaka; kurtarma
 *        2"de calisip 2½"de calismiyordu — kanit KM-1 vs KM-2.)
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
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
const surukle = (q: string, pool: IndexedRow[], tags: string[], birim = 'mt'): QueryOutcome =>
  runQuery(parseLine(q, birim), pool, { variantTags: tags });
const fiyat = (o: QueryOutcome): number | null =>
  o.kind === 'auto-variant' ? o.row.urun.price : o.kind === 'single' ? o.row.urun.price : null;
const kod = (o: QueryOutcome): string => (o.kind === 'none' ? `none/${(o as any).reason}` : o.kind);

// ═════════════════════════════════════════════════════════════════════
//  A) E2 — CAP-YOK ERKEN DONUSU V4.7 KURTARMASINI ATLIYOR
// ═════════════════════════════════════════════════════════════════════
console.log('── KM-1..8) E2: surukleme kurtarmasi cap-yok yolunda da calisir ──');
{
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 100, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 200, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '1"', price: 120, urunKodu: 'K-1' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '2"', price: 220, urunKodu: 'K-2' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '2 1/2"', price: 300, urunKodu: 'K-25' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '4"', price: 500, urunKodu: 'K-4' }),
  ];
  // Kullanici KAYNAK satirda (1") popup'tan "kirmizi boyali"yi secti, asagi surukluyor.
  const TAG = urunVariantTags(HAVUZ[2]);

  // KM-1 KONTROL (bugun de yesil): 2"de kurtarma CALISIR — cunku siyah 2"
  // havuzda oldugu icin cap filtresi rows'u BOSALTMAZ, akis V4 blogana ulasir.
  // Bu assert, kusurun "kurtarma yok" degil "kurtarmaya ULASILAMIYOR"
  // oldugunu kanitlar; KM-2 ile birlikte okunmali.
  const o2 = surukle('Dikişli SİYAH Çelik Boru 2"', HAVUZ, TAG);
  check('KM-1 KONTROL: siyah 2" hedefinde kurtarma calisir (kirmizi 2" @220)',
    o2.kind === 'auto-variant' && fiyat(o2) === 220, `${kod(o2)}@${fiyat(o2)}`);

  // KM-2 ASIL KUSUR: siyah 2½" HAVUZDA YOK → cap filtresi rows'u bosaltir →
  // erken 'cap-yok' donusu → kurtarma HIC calismaz. Oysa kirmizi 2½" @300 var.
  const o25 = surukle('Dikişli SİYAH Çelik Boru 2 1/2"', HAVUZ, TAG);
  check('KM-2 siyah 2 1/2" hedefinde de kurtarma calisir (kirmizi 2 1/2" @300)',
    o25.kind === 'auto-variant' && fiyat(o25) === 300, `${kod(o25)}@${fiyat(o25)}`);

  // KM-3 PARA: kurtarilan aday HEDEF CAPTA olmali. Havuzdaki kirmizi 4" @500
  // kurtarma havuzunda DURUYOR; cap suzgeci uygulanmazsa 500 yazilir (VS probe
  // M3'te olculen para hatasi sinifi). Bu assert o suzgecin kapisidir.
  check('KM-3 PARA: kurtarilan urun HEDEF capta — 4" @500 ASLA yazilmaz',
    fiyat(o25) !== 500, `gelen ${fiyat(o25)}`);

  // KM-4 KARSI ORNEK: kirmizi 3" GERCEKTEN yok → hala 'cap-yok'.
  // (Bu havuzda kirmizi DORT capta var; asagidaki KM-3b tek-capli havuzla
  //  para kapisini AYRICA sinar — bu iki assert farkli mutasyonlari oldurur.)
  const o3 = surukle('Dikişli SİYAH Çelik Boru 3"', HAVUZ, TAG);
  check('KM-4 KARSI: hedef cap hicbir varyantta yoksa cap-yok AYNEN doner',
    o3.kind === 'none' && (o3 as any).reason === 'cap-yok', kod(o3));

  // KM-5 KAPI: kurtarma YALNIZ kullanicinin acik secimi (variantTags) varken
  // calisir. Tag yoksa davranis DEGISMEZ — sessiz ikame uretilmez.
  const oTagsiz = runQuery(parseLine('Dikişli SİYAH Çelik Boru 2 1/2"', 'mt'), HAVUZ);
  check('KM-5 KAPI: variantTags YOKKEN cap-yok AYNEN doner (kurtarma tetiklenmez)',
    oTagsiz.kind === 'none' && (oTagsiz as any).reason === 'cap-yok', kod(oTagsiz));

  // KM-6 TEK ADAY FRENI: kurtarma havuzunda tag'e uyan IKI aday varsa
  // kurtarma yapilmaz (sessiz ikame yasagi).
  const IKIZ = [...HAVUZ, prod({ ad: AD, cins: 'kırmızı boyalı', cap: '2 1/2"', price: 310, urunKodu: 'K-25b' })];
  const oIkiz = surukle('Dikişli SİYAH Çelik Boru 2 1/2"', IKIZ, TAG);
  check('KM-6 FREN: kurtarmada TEK aday sarti — iki aday varsa fiyat yazilmaz',
    fiyat(oIkiz) === null, `${kod(oIkiz)}@${fiyat(oIkiz)}`);
}
{
  // KM-3b PARA KAPISI (asil olcum): kullanicinin sectigi varyant havuzda
  // YALNIZ BIR capta var ve o cap hedeften FARKLI. Kurtarma havuzuna CAP
  // suzgeci uygulanmazsa tam olarak TEK aday kalir → 1" fiyati (120) bir
  // 2 1/2" satirina yazilir. VS probe M3'te olculen para hatasi sinifinin
  // kurtarma yolundaki karsiligi budur; bu assert o suzgecin kapisidir.
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 100, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 200, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', cap: '1"', price: 120, urunKodu: 'K-1' }), // TEK kirmizi
  ];
  const TAG = urunVariantTags(HAVUZ[2]);
  const o = surukle('Dikişli SİYAH Çelik Boru 2 1/2"', HAVUZ, TAG);
  check('KM-3b PARA: secilen varyant baska capta tek basinaysa fiyati YAYILMAZ (120 yazilmaz)',
    fiyat(o) !== 120 && o.kind === 'none', `${kod(o)}@${fiyat(o)}`);
}
{
  // KM-7 CAPSIZ FRENI (VS'te muhurlenen capsizAutoYasak) — kurtarma yolunda.
  //
  // Bu vakanin kosulu OLCULEREK bulundu: satirin capi CEVRILEBILIYORSA cap
  // suzgeci capsiz adayi zaten kurtarma havuzundan DUSURUR (KM-3b o yolu
  // kilitler) ve fren hic calismaz. Fren ancak cap CEVRILEMEYINCE gorunur:
  // `5/8"` cevrim tablosunda YOK (noConversion) → cap blogu KOMPLE atlanir,
  // kurtarma havuzuna cap suzgeci HIC uygulanmaz, capsiz aday ayakta kalir.
  // (Ilk surumde bu assert `2 1/2"` ile yazilmisti ve YANLIS SEBEPLE yesildi;
  //  mutasyon olcumu yakaladi — fren silinince test kirilmiyordu.)
  const AD = 'Dikişli Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 100, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'kırmızı boyalı', price: 900, urunKodu: 'K-capsiz' }), // cap kolonu BOS
  ];
  const TAG = urunVariantTags(HAVUZ[1]);
  const o = surukle('Dikişli SİYAH Çelik Boru 5/8"', HAVUZ, TAG);
  check('KM-7 CAPSIZ FRENI: capsiz aday kurtarilsa bile fiyat OTOMATIK yazilmaz',
    fiyat(o) !== 900, `${kod(o)}@${fiyat(o)}`);
  check('KM-7b fren kullaniciya ACIK: capsiz-dusum onayi acilir (sessiz ret degil)',
    o.kind === 'ask' && (o as any).kapilar?.includes('capsiz-dusum'),
    `${kod(o)} kapilar=${JSON.stringify((o as any).kapilar)}`);
}
{
  // KM-8 IKINCI AILE KANITI (genel cozum kurali): kusur boruya ozgu DEGIL.
  // yuzeyGenis yalniz 'boru' ailesinde dolar; varyantKurtarma AILE-BAGIMSIZDIR.
  const AD = 'Kelebek Vana';
  const HAVUZ = [
    prod({ ad: AD, cins: 'wafer dişli', cap: 'DN50', price: 500, urunKodu: 'W-50' }),
    prod({ ad: AD, cins: 'lug flanşlı', cap: 'DN50', price: 600, urunKodu: 'L-50' }),
    prod({ ad: AD, cins: 'lug flanşlı', cap: 'DN65', price: 700, urunKodu: 'L-65' }),
  ];
  const TAG = urunVariantTags(HAVUZ[1]); // kullanici "lug flansli" secti
  const o = surukle('Wafer Dişli Kelebek Vana DN65', HAVUZ, TAG, 'adet');
  check('KM-8 IKINCI AILE (vana): kurtarma boru DISINDA da calisir (lug DN65 @700)',
    o.kind === 'auto-variant' && fiyat(o) === 700, `${kod(o)}@${fiyat(o)}`);
}

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
