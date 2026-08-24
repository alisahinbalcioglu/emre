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
 *  sinifi kapatmaz. O yuzden KURTARMA fixture'lari sozlukte KAYITLI OLMAYAN
 *  adlardan secildi — kural veriden degil, MEKANIZMADAN gecmek zorunda.
 *  (Istisna B2: 'Kalorimetre' sozlukte KAYITLIDIR ve aile cozumu o kayda
 *  dayanir — orada sinanan sey kurtarma degil, SUSMA kapisidir.)
 *
 *  BES BLOK:
 *    A) KURTARMA    — uyusmazlik SOYLENMELI (iki ayri aile cifti ile)
 *    B) SESSIZ KALMA— gercekten yoksa teshis KONUSMAMALI (gurultu yasagi)
 *    C) FIYAT YAZMA — teshisin buldugu aday ASLA otomatik yazilmaz
 *    D) BOZMAMA     — normal eslesmeler aynen calisir
 *    E) S7 COKLU ADAY (24.08 URUN KARARI) — ikinci gecis COKLU aday
 *       buldugunda eski surum bilerek susuyordu; saha bunun her yeni
 *       listede "sifir tespit" urettigini gosterdi. Artik kanit sirali
 *       SORU acilir (fiyat yine YAZILMAZ); zayif kume ('capsiz-dusum'/
 *       'ad-gevsetildi') hic acilmaz, liste en fazla 12 kayittir.
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
function teshisli(q: string, pool: IndexedRow[], opts?: any): QueryOutcome {
  const line = parseLine(q);
  return aileUyusmazligiTeshisi(line, pool, opts, runQuery(line, pool, opts));
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
// B3 — SATIR YALNIZ AILE ADINI YAZMISSA teshis konusmaz — COKLU listede de.
//      (K8'in S7'ye uygulanmasi: "Vana" satiri kelepce ureticisinde HICBIR
//      ortak kelime tasimaz; salt "ayni capta/markada var" kanit degildir.
//      Coklu-aday sessizligi S7 ile kalkti ama BU kapi bilerek kaldi —
//      kaldirilirsa 'Vana' satirina 3 kelepce "en yakin aday" diye listelenir.)
{
  const q = 'Vana';
  const t = teshisli(q, NORM);
  check('B3 salt aile-adi yazan satirda teshis coklu listede de SUSUYOR',
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

console.log('── E) S7: COKLU ADAY — SIRALI SORU (24.08 urun karari) ──');

// E1 — ESKI B3 SOZLESMESININ BILINCLI TERSI: satirda cap yok, ikinci gecis
//      IKI adaya iniyor → eski surum susuyordu, yeni surum SORAR.
{
  const q = 'Yangın Rakoru';
  const t = teshisli(q, HORTUMCU);
  check('E1 coklu adayda artik soru aciliyor (ask + aile-uyusmazligi)',
    t.kind === 'ask' && kapiVar(t, 'aile-uyusmazligi') && t.rows.length === 2,
    `${t.kind} aday=${t.kind === 'ask' ? t.rows.length : '-'} kapilar=${(t as any).kapilar ?? '-'}`);
  // Hakem bulgusu (24.08): kor gecisinin yapay 'aile-yok'u DISARI SIZMAZ —
  // aile aslinda cozuldu; ayni ciktida "cozulemedi"+"uyusmuyor" celiskidir.
  check('E1c yapay aile-yok kapisi ayiklanmis',
    t.kind === 'ask' && !(t.kapilar ?? []).includes('aile-yok'), `kapilar=${(t as any).kapilar ?? '-'}`);
  const r = toMatchResult(t, parseLine(q), (v: number) => v);
  check('E1b fiyat YINE yazilmiyor (netPrice 0, multi, adaylar listede)',
    r.netPrice === 0 && r.confidence === 'multi' && (r.candidates?.length ?? 0) === 2,
    `netPrice=${r.netPrice} conf=${r.confidence} aday=${r.candidates?.length ?? 0}`);
}

// E2 — SIRALAMA: kaniti COK olan aday ONE gecer. Havuz sirasi bilerek ters:
//      kor gecisi [R2, R1] uretir (drop+union), kanit R1=2 (ad 'yangin' +
//      cins 'bağlantı') > R2=1 → sirali liste [R1, R2] olmali.
{
  const S7_SIRA: IndexedRow[] = [
    prod({ kategori: 'Esnek', ad: 'Bağlantı Hortumu', cins: 'örgülü', cap: 'DN65', price: 700, birim: 'Ad.', urunKodu: 'BH-65', sheetName: 'FLEX' }),
    prod({ kategori: 'Esnek', ad: 'Yangın Hortumu', cins: 'bağlantı örgülü', cap: 'DN65', price: 1250, birim: 'Ad.', urunKodu: 'YH-65B', sheetName: 'FLEX' }),
  ];
  const q = 'Yangın Bağlantı Rakoru DN65';
  const t = teshisli(q, S7_SIRA);
  check('E2 kanit sayisi sirayi belirliyor (2 kanitli aday one)',
    t.kind === 'ask' && t.rows.length === 2 && t.rows[0].urun.ad === 'Yangın Hortumu',
    t.kind === 'ask' ? `sira=[${t.rows.map((r) => r.urun.ad).join(' | ')}]` : t.kind);
}

// E3 — ZAYIF KUME FRENI: kor gecisi yalniz 'capsiz-dusum' istisnasiyla
//      hayatta kaldiysa (adaylarin capi DOGRULANAMADI) coklu liste ACILMAZ —
//      iki tahmin ust uste binmez (S2+S3 kanit dili; 373K vakasinin sinifi).
{
  const CAPSIZ: IndexedRow[] = [
    prod({ kategori: 'Esnek', ad: 'Yangın Hortumu', cins: 'tip 1', price: 900, birim: 'Ad.', urunKodu: 'T1', sheetName: 'FLEX' }),
    prod({ kategori: 'Esnek', ad: 'Yangın Hortumu', cins: 'tip 2', price: 950, birim: 'Ad.', urunKodu: 'T2', sheetName: 'FLEX' }),
  ];
  const q = 'Yangın Rakoru DN65';
  const t = teshisli(q, CAPSIZ);
  check('E3 capi dogrulanamayan coklu kumede teshis SUSUYOR',
    !kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar ?? '-'}`);
}

// E4 — KESIT: liste gurultuye donmesin — en fazla 12 aday.
{
  const COK: IndexedRow[] = Array.from({ length: 15 }, (_, i) =>
    prod({ kategori: 'Esnek', ad: 'Yangın Hortumu', cins: `tip ${i + 1}`, cap: 'DN65', price: 100 + i, birim: 'Ad.', urunKodu: `T${i + 1}`, sheetName: 'FLEX' }));
  const q = 'Yangın Rakoru DN65';
  const t = teshisli(q, COK);
  check('E4 kesit: 15 aday 12\'ye iniyor',
    t.kind === 'ask' && kapiVar(t, 'aile-uyusmazligi') && t.rows.length === 12,
    `${t.kind} aday=${t.kind === 'ask' ? t.rows.length : '-'}`);
  // Hakem bulgusu: kesit yalniz SAYIYLA sinanmisti — hangi 12'nin kaldigi
  // testsizdi (slice(-KESIT) / ters tie-break mutasyonlari yesil geciyordu).
  // Esit kanitta sira = kor sirasi (yukleme sirasi): tip 1 basta, tip 13-15 DISARIDA.
  check('E4b kesit ICERIGI dogru: tip 1 basta, tip 13 listede yok',
    t.kind === 'ask' && t.rows[0].urun.cinsNorm === 'tip 1'
      && !t.rows.some((r) => r.urun.cinsNorm === 'tip 13'),
    t.kind === 'ask' ? `ilk=${t.rows[0].urun.cinsNorm} son=${t.rows[11]?.urun.cinsNorm}` : t.kind);
  // Tasma SOYLENIR (sessiz eksiltme yasagi): uyariNot 12/15'i acikca yazar.
  check('E4c tasma uyariNot\'ta raporlaniyor (12/15)',
    t.kind === 'ask' && !!t.uyariNot && t.uyariNot.includes('12/15'), t.kind === 'ask' ? t.uyariNot : '-');
}

// E5 — DETERMINIZM (D3'un S7 ikizi): coklu liste yan etkisiz ve kararli.
{
  const a = JSON.stringify(teshisli('Yangın Rakoru', HORTUMCU));
  const b = JSON.stringify(teshisli('Yangın Rakoru', HORTUMCU));
  check('E5 S7 coklu listesi deterministik', a === b);
}

// E6 — SOZLUK ALIAS KELIMESI KANIT DEGILDIR (hakem bulgusu, olculdu):
//      'Temiz Su Borusu' satirinda sozluk 'temiz'/'su' kelimelerini yutar
//      (ignoreTokens) — runQuery onlari bilerek kisit-disi birakir. Teshis
//      de ayni kelimeyi KIMLIK KANITI sayamaz; sayarsa borusuz markada
//      "Su Sayacı" tarzi urunler 'su' kelimesi uzerinden listelenir ve
//      listenin tek dayanagi sozluk-gurultusu olur.
{
  const SAYACCI: IndexedRow[] = [
    prod({ kategori: 'Sayaçlar', ad: 'Su Sayacı', cins: 'kuru tip', cap: 'DN25', price: 850, birim: 'Ad.', urunKodu: 'SS-25', sheetName: 'SAYAC' }),
    prod({ kategori: 'Vanalar', ad: 'Su Tahliye Vanası', cins: 'pirinç', cap: 'DN25', price: 320, birim: 'Ad.', urunKodu: 'TV-25', sheetName: 'SAYAC' }),
  ];
  const q = 'Temiz Su Borusu DN25';
  const t = teshisli(q, SAYACCI, { ignoreTokens: ['temiz', 'su'] });
  check('E6 sozlugun yuttugu kelime kanit sayilmiyor — teshis SUSUYOR',
    !kapiVar(t, 'aile-uyusmazligi'),
    `${t.kind} ${t.kind === 'ask' ? `adaylar=[${t.rows.map((r) => r.urun.ad).join(' | ')}]` : ''}`);
}

// E7 — AILESI ZAYIF ADAY COKLU LISTEYE GIREMEZ: aile yalniz KATEGORI
//      basligindan turemis (ad kendi aile kelimesini tasimiyor) adaylar
//      zaten BIR tahmindir; uyusmazlik listesine girmeleri iki tahmini
//      ust uste bindirir. (Tekli yol ikizi guclutekAday:aileZayif'te.)
{
  const ZAYIF_HAVUZ: IndexedRow[] = [
    prod({ kategori: 'Hortum Grubu', ad: 'R-Flex Bant', cins: 'tip A', cap: 'DN65', price: 90, birim: 'Ad.', urunKodu: 'RB-A', sheetName: 'FLEX' }),
    prod({ kategori: 'Hortum Grubu', ad: 'R-Flex Bant', cins: 'tip B', cap: 'DN65', price: 95, birim: 'Ad.', urunKodu: 'RB-B', sheetName: 'FLEX' }),
  ];
  check('E7 on kosul: fixture ailesi gercekten KATEGORIDEN (aileZayif)',
    ZAYIF_HAVUZ.every((r) => r.urun.aileZayif && r.urun.adSlug === 'hortum'),
    ZAYIF_HAVUZ.map((r) => `${r.urun.adSlug}/${r.urun.aileZayif}`).join(','));
  const t = teshisli('Bant Rakoru DN65', ZAYIF_HAVUZ);
  check('E7 ailesi zayif adaylarla coklu liste ACILMIYOR',
    !kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar ?? '-'}`);
}

// E8 — KIMLIK KELIMESI CINS KOLONUNDA TASINAN ADAY GIRER (hakem bulgusu:
//      S7'nin motive vakasi tam da bu satici-yazimi sinifi) + IKINCI AILE
//      CIFTI (boru ↔ kelepce — E1-E5'in fitting↔hortum ciftinden farkli;
//      iki-aile kaniti kurali). Adaylarin AD'inda satir kelimesi YOK
//      ('Somunlu Kelepçe'), kimlik CINS'te ('sprinkler tipi ...').
{
  const NORM2: IndexedRow[] = [
    prod({ kategori: 'Kelepçeler', ad: 'Somunlu Kelepçe', cins: 'sprinkler tipi lastikli', cap: '6"', price: 41, birim: 'Ad.', urunKodu: 'SM-6L', sheetName: 'NORM' }),
    prod({ kategori: 'Kelepçeler', ad: 'Somunlu Kelepçe', cins: 'sprinkler tipi çiftli', cap: '6"', price: 47, birim: 'Ad.', urunKodu: 'SM-6C', sheetName: 'NORM' }),
  ];
  const q = 'Sprinkler Borusu, 6"';
  const t = teshisli(q, NORM2);
  check('E8 cins-kimlikli adaylar listeleniyor (2 aday, ikinci aile cifti)',
    t.kind === 'ask' && kapiVar(t, 'aile-uyusmazligi') && t.rows.length === 2
      && t.rows.every((r) => r.urun.adSlug === 'kelepce'),
    `${t.kind} aday=${t.kind === 'ask' ? t.rows.length : '-'}`);
}

// E9 — ZAYIF KUMENIN IKINCI UYESI ('ad-gevsetildi') DE FRENDIR (hakem
//      bulgusu: E3 yalniz 'capsiz-dusum'u sinapordu — uye dusuren mutasyon
//      yesil geciyordu). Kurgu kor gecisinde ad-gevsetmeyi tetikler: 'yangin'
//      ad daraltmasi 'düz' cinsli hortuma kilitlenir, satirin 'örgülü'su onu
//      eler → motor aile havuzuna gevser → COKLU 'Bahçe Hortumu' kalir →
//      kapida 'ad-gevsetildi' yanar → S7 ACILMAMALI (ad dogrulanmadi).
{
  const GEVSEK: IndexedRow[] = [
    prod({ kategori: 'Esnek', ad: 'Yangın Hortumu', cins: 'düz', cap: 'DN65', price: 900, birim: 'Ad.', urunKodu: 'YD-65', sheetName: 'FLEX' }),
    prod({ kategori: 'Esnek', ad: 'Bahçe Hortumu', cins: 'örgülü', cap: 'DN65', boy: 10, price: 300, birim: 'Ad.', urunKodu: 'BH-10', sheetName: 'FLEX' }),
    prod({ kategori: 'Esnek', ad: 'Bahçe Hortumu', cins: 'örgülü', cap: 'DN65', boy: 20, price: 340, birim: 'Ad.', urunKodu: 'BH-20', sheetName: 'FLEX' }),
  ];
  const kor = runQuery(parseLine('Örgülü Yangın Rakoru DN65'), GEVSEK, { aileKilidiKapali: true } as any);
  check('E9 on kosul: kor gecisi gercekten ad-gevsetildi + coklu aday uretiyor',
    kor.kind === 'ask' && kor.rows.length === 2 && (kor.kapilar ?? []).includes('ad-gevsetildi'),
    `${kor.kind} aday=${kor.kind === 'ask' ? kor.rows.length : '-'} kapilar=${kor.kind === 'ask' ? kor.kapilar : '-'}`);
  const t = teshisli('Örgülü Yangın Rakoru DN65', GEVSEK);
  check('E9 adi dogrulanamayan (ad-gevsetildi) coklu kumede teshis SUSUYOR',
    !kapiVar(t, 'aile-uyusmazligi'), `${t.kind} kapilar=${(t as any).kapilar ?? '-'}`);
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
