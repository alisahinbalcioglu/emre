/**
 * B3 KILIDI — KISA KOK ONEK TOLERANSI PP ile PPR'yi AYNI SAYIYOR
 *   npx ts-node test/kisa-kok-malzeme-test.ts   (npm run test:kisa-kok-malzeme)
 *
 * ── OLCULEN KUSUR (04.10) ─────────────────────────────────────────────────
 * `product-index.KISA_KOKLER` = {pp, ppr, pvc, pex}; bu kokler ONEK_MIN
 * esiginin altinda olsalar bile onek toleransina girer. Sonuc:
 *   tokenEsit('pp','ppr')  → true        tokenEsit('ppr','pp') → true
 * PP (polipropilen, ATIK SU) ile PPR (sicak/soguk TEMIZ SU) FARKLI malzemedir;
 * `malzemeEtiketleri` ikisini ZATEN ayirt ediyor ("PP Atık Su Borusu" → ['pp'],
 * "PPR Boru" → ['ppr']) ama o bilgi eslesmeyi DURDURMUYORDU.
 *
 * OLCULDU — havuzda YALNIZ PP atik su borusu varken:
 *   "PPR BORU 25 mm" → single · "PP Atık Su Borusu @15"   (SESSIZ otomatik yazim)
 * Satir ACIKCA PPR diyor, kutuphanede PPR YOK, yine de atik su borusunun
 * fiyati yaziliyor.
 *
 * ── MUHURLENEN KURAL ──────────────────────────────────────────────────────
 * ONEK TOLERANSI KALDIRILMAZ: KALDE vakasi ("PP Boru" adi + "PP-R" cinsi)
 * tam da onun sayesinde bulunuyor — kaldirsaydik gercek PPR urunu kaybolurdu.
 * Degisen: satirin KENDI yazdigi malzeme de bir BEKLENTIDIR. Tek aday o
 * beklentiyle CAKISIYORSA (malzemeSirasi === 2) `malzeme-celiskisi` kapisi
 * acilir ve fiyat OTOMATIK YAZILMAZ — aday elenmez, kullanici karar verir.
 *
 * PP CINS, PPR TUR — kusur TEK YONLUDUR:
 *   satir PPR (ya da "PP-R") + aday duz PP   → CELISKI (tur cinsi kabul etmez)
 *   satir PP                 + aday PPR      → DOGRU   (cins turu kabul eder)
 * Piyasada "PP vana / PP boru" cogu zaman PPR'nin halk dilidir. Ilk yazimda
 * ikinci satiri da kusur sanmistim; test:matching C1 (KALDE PP KÜRESEL)
 * kirmizisi duzeltti — bkz. C blogu.
 *
 * ⚠ KAPSAM BILEREK DAR: satir-turevli beklenti YALNIZ celiski kapisina
 * baglanir, SIRALAMAYA (malzemeSirasi sort) baglanmaz. Olculdu: Pimtas sorgu
 * derleminde 1915 satirin 1698'i malzeme etiketi tasiyor — siralamaya baglamak
 * binlerce coklu-aday sorgusunun aday SIRASINI degistirirdi. Sozlukten gelen
 * `hintMalzeme` siralamayi surdurmeye devam eder (S5, degismedi).
 */

import { buildProductIndex, tokenEsit, malzemeEtiketleri, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return {
    id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null,
      kategori: null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null },
  } as IndexedRow;
}
const sor = (satir: string, havuz: IndexedRow[], opts?: any) => runQuery(parseLine(satir), havuz, opts) as any;
const secilen = (o: any): string[] =>
  (o.kind === 'ask' ? o.rows : o.kind === 'single' || o.kind === 'auto-variant' ? [o.row] : [])
    .map((r: any) => `${r.urun.ad}@${r.listPrice}`);
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''}${o.kapilar ? ' kapilar=' + JSON.stringify(o.kapilar) : ''} → ${JSON.stringify(secilen(o))}`;

const PP = () => urun({ ad: 'PP Atık Su Borusu', cins: 'SN4', cap: '25 mm', price: 15 });
const PPR = () => urun({ ad: 'PPR Boru', cins: 'PN 20', cap: '25 mm', price: 40 });

async function main() {
  // ── O: OLCUT — kusurun ON KOSULU gercekten kuruluyor mu ─────────────────
  check('O onek toleransi pp ile ppr’yi esit sayiyor (kusurun kaynagi)',
    tokenEsit('pp', 'ppr') === true && tokenEsit('ppr', 'pp') === true);
  check('O malzeme katmani ikisini AYIRT EDIYOR (bilgi VAR, kullanilmiyordu)',
    JSON.stringify(malzemeEtiketleri('PP Atık Su Borusu')) === '["pp"]'
    && JSON.stringify(malzemeEtiketleri('PPR Boru')) === '["ppr"]',
    `pp=${JSON.stringify(malzemeEtiketleri('PP Atık Su Borusu'))} ppr=${JSON.stringify(malzemeEtiketleri('PPR Boru'))}`);

  // ── A: SATIR PPR ISTIYOR, KUTUPHANEDE YALNIZ PP VAR ─────────────────────
  const a1 = sor('PPR BORU 25 mm', [PP()]);
  check('★ A satir PPR, havuzda yalniz PP → OTOMATIK YAZILMAZ',
    a1.kind === 'ask', ozet(a1));
  check('A aday ELENMEZ (kullanici gorup karar verir)',
    secilen(a1).length === 1 && secilen(a1)[0].includes('PP Atık Su'), ozet(a1));
  check('A gerekce kapilarda tasinir (malzeme-celiskisi)',
    Array.isArray(a1.kapilar) && a1.kapilar.includes('malzeme-celiskisi'), `kapilar=${JSON.stringify(a1.kapilar)}`);

  // ── P: "PP-R" YAZIMI — metin HEM 'ppr' HEM 'pp' etiketi uretir ──────────
  // Cins etiketi beklentiye girseydi duz PP adayini aklardi (olculdu: ilk
  // duzeltmede "PP-R BORU 25 mm" | [PP Atık Su] → single, kusur yasiyordu).
  const p1 = sor('PP-R BORU 25 mm', [PP()]);
  check('★ P "PP-R" yazimli satir duz PP adaya OTOMATIK YAZILMAZ',
    p1.kind === 'ask' && Array.isArray(p1.kapilar) && p1.kapilar.includes('malzeme-celiskisi'), ozet(p1));

  // ── V: IKINCI AILE — VANA ───────────────────────────────────────────────
  const PPV = () => urun({ ad: 'PP Küresel Vana', cins: 'PP', cap: '20 mm', price: 30 });
  const PPRV = () => urun({ ad: 'PPR-C Küresel Vana', cap: '20 mm', price: 96 });
  const v1 = sor('PPR KÜRESEL VANA 20 mm', [PPV()]);
  check('★ V satir PPR vana, havuzda yalniz duz PP vana → OTOMATIK YAZILMAZ',
    v1.kind === 'ask' && Array.isArray(v1.kapilar) && v1.kapilar.includes('malzeme-celiskisi'), ozet(v1));
  const v3 = sor('PP-R KÜRESEL VANA 20 mm', [PPV()]);
  check('V "PP-R" yazimli vana satiri da duz PP vanaya yazilmaz',
    v3.kind === 'ask' && Array.isArray(v3.kapilar) && v3.kapilar.includes('malzeme-celiskisi'), ozet(v3));

  // ── C: PP CINS, PPR TUR — satir yalniz "PP" yazdiysa PPR DOGRU adaydir ──
  // ⚠ Ilk yazimda bunun TERSINI ("PP satiri PPR'ye yazilmaz") kusur sanip
  // assert ettim. test:matching C1 kirmizisi duzeltti: "PP KÜRESEL" satirinda
  // KALDE'nin PPR-C vanasi dogru oneridir; piyasada "PP vana / PP boru" PPR'nin
  // halk dilidir. Kapi onu ask'e dusurunce oneri kutusunun kesinlik onceligi
  // bozuldu ve DUYAR pirinc vana listeye girdi. Sozlesme: cins turu KABUL eder.
  const c1 = sor('PP BORU 25 mm', [PPR()]);
  check('★ C satir PP boru, havuzda PPR → yazilir (cins turu kabul eder)',
    c1.kind === 'single' && secilen(c1)[0].endsWith('@40'), ozet(c1));
  const c2 = sor('PP KÜRESEL VANA 20 mm', [PPRV()]);
  check('★ C satir PP vana, havuzda PPR-C vana → yazilir (KALDE vakasi)',
    c2.kind === 'single' && secilen(c2)[0].endsWith('@96'), ozet(c2));

  // ── K: KARSI ORNEKLER — dogru eslesmeler AYNEN kalmali ──────────────────
  const k1 = sor('PPR BORU 25 mm', [PP(), PPR()]);
  check('K havuzda PPR VARSA dogru urun otomatik yazilir (@40)',
    k1.kind === 'single' && secilen(k1)[0].endsWith('@40'), ozet(k1));

  const k2 = sor('PPR BORU 25 mm', [PPR()]);
  check('K tek PPR urunlu havuzda celiski YOK', k2.kind === 'single', ozet(k2));

  // KALDE vakasi: urun ADI "PP Boru" ama CINSI "PP-R" → malzeme ['ppr','pp'];
  // onek toleransi onu bulur ve celiski ACILMAMALI (bu yuzden tolerans kaldi).
  const kalde = urun({ ad: 'PP Boru', cins: 'PP-R PN 20', cap: '25 mm', price: 42 });
  const k3 = sor('PPR BORU 25 mm', [kalde]);
  check('★ K KALDE "PP Boru / PP-R" bulunur ve celiski ACILMAZ (@42)',
    k3.kind === 'single' && secilen(k3)[0].endsWith('@42'), ozet(k3));

  // Malzemesi COZULEMEYEN aday celiski saymaz (S5'in esigi degismedi).
  // ⚠ kind'a BAKILMAZ: satir "ppr" diyip urunde hic gecmeyince `bilinmeyen-
  // kelime` kapisi zaten acilir (olculdu) — bu yuzden "single" beklemek
  // imkansiz bir on kosul olurdu. Olculen MEKANIZMA: malzeme kapisi ACILMAZ.
  const k4 = sor('PPR BORU 25 mm', [urun({ ad: 'Boru', cins: 'PN 20', cap: '25 mm', price: 20 })]);
  check('K malzemesi cozulemeyen aday malzeme-celiskisi SAYMAZ (etiketsizlik kanit degil)',
    Array.isArray(k4.kapilar) && !k4.kapilar.includes('malzeme-celiskisi') && k4.kapilar.includes('bilinmeyen-kelime'), ozet(k4));

  // KAPLAMA: "PE KAPLI CELIK BORU" satirinin etiketleri ['pe','celik'].
  // Ayni urun tek aday → kesisim var, kapi ACILMAZ. (Kaplama sozcugunu
  // beklentiden ayiklamak OLCULDU ve ATIL: kaplamasiz celik boru tek aday
  // olunca "pe"/"kapli" urunde yok → `bilinmeyen-kelime` zaten aciliyor.)
  const kapli = urun({ ad: 'PE Kaplı Çelik Boru', cins: null as any, cap: '2"', price: 90 });
  const k6 = sor('PE KAPLI CELIK BORU 2"', [kapli]);
  check('K kaplamali satir kendi urununde celiski ACMAZ', k6.kind === 'single', ozet(k6));

  // NOT ONCELIGI: kapinin hedefi BASKA HICBIR kapinin acilmadigi sessiz yazim.
  // Satirin kelimesi adayda yoksa `bilinmeyen-kelime` zaten acilir ve KENDI
  // notu gosterilir (test:oneri G4b sozlesmesi) — kapi listede yine tasinir.
  check('A hedef vakada gosterilen not satir malzemesini soyler',
    /Satır ppr diyor/.test(a1.uyariNot ?? ''), `uyariNot=${JSON.stringify(a1.uyariNot)}`);
  const n1 = sor('PASLANMAZ KÜRESEL VANA 20 mm', [urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '20 mm', price: 88 })]);
  check('K baska kapi da aciksa ONUN notu gosterilir, malzeme kapisi listede tasinir',
    n1.kind === 'ask' && /paslanmaz.*doğrulanamadı/.test(n1.uyariNot ?? '')
    && (n1.kapilar ?? []).includes('malzeme-celiskisi') && (n1.kapilar ?? []).includes('bilinmeyen-kelime'),
    `uyariNot=${JSON.stringify(n1.uyariNot)} kapilar=${JSON.stringify(n1.kapilar)}`);

  // COK ADAY: kapi S5 ikizi gibi YALNIZ tek adayda acilir — liste zaten
  // kullaniciya soruluyor. Iki PP aday, satir PPR → soru, ama kapi notu YOK.
  // ⚠ Ilk fikstur [PP Atık Su, PP Boru] idi: suzgec birini eledi, kapiya TEK
  // aday ulasti ve kapi DOGRU acildi — on kosul kurulmamisti. Ayni ad, farkli
  // sinif: satir sinifi soylemedigi icin ikisi de kapiya ulasir.
  const k7 = sor('PPR BORU 25 mm', [
    urun({ ad: 'PP Boru', cins: 'SN4', cap: '25 mm', price: 16 }),
    urun({ ad: 'PP Boru', cins: 'SN8', cap: '25 mm', price: 18 }),
  ]);
  check('K cok adayli soruda malzeme kapisi ACILMAZ (yalniz tek aday)',
    k7.kind === 'ask' && secilen(k7).length === 2 && !(k7.kapilar ?? []).includes('malzeme-celiskisi'), ozet(k7));

  // Satirda malzeme kelimesi YOKSA kapi hic aciklmaz
  const k5 = sor('BORU 25 mm', [PP()]);
  check('K satirda malzeme kelimesi yoksa kapi aciklmaz', k5.kind === 'single', ozet(k5));

  console.log(`\n${'='.repeat(60)}\nB3 KISA KOK / MALZEME: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
