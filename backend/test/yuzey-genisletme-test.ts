/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  YG — YUZEY ELEDIGINDE URUN EKRANA GELSIN  (`npm run test:yuzey-genisletme`)
 *
 *  27.08 turu, E4'un IKINCI YARISI.
 *
 *  E4 (26.08) mesaji durustlestirdi: markada 2" siyah boru DURURKEN ekran
 *  "Bu markada 2\" yok" diyordu; artik "bu üründe 2\" \"galvaniz\" olarak yok
 *  · başka yüzeyde olabilir" diyor. AMA kullanicinin GORDUGU sey hala BOSTU —
 *  urun ekrana HIC gelmiyordu. Bu paket onu getirir.
 *
 *  KURAL: FIYAT OTOMATIK YAZILMAZ. Aday satirda YAZILI bir kisiti (galvaniz)
 *  IHLAL ediyor; bu bir "oneri" degil, kullanici KARARIDIR. `yuzey-genisletildi`
 *  kapisi tek aday kalsa bile onay ister (I6).
 *
 *  IKI KAPI (ikisi de olcumle zorunlu kilindi):
 *   · `variantTags` YOKKEN calisir — surukleyen kullanicinin KENDI kurtarma
 *     yolu var; ikisini ust uste bindirmek o yolun frenlerini atlatirdi.
 *   · `!adGevsetildi` — adi GEVSETILEREK bulunmus aday ('Vana' yazan satira
 *     'Çekvalf') burada YALNIZ "başka yüzeyde" aciklamasiyla sunulurdu; bu
 *     donus yapisal olarak 'ad-gevsetildi' rozetini URETEMEZ. Ad dogrulanmamis
 *     + yazili yuzey celisiyor = iki tahminin ust uste binmesi (S4 yasagi).
 *     OLCULDU: kapisiz surumde 'Vana' satirina 'Çekvalf' ₺250 SESSIZCE yaziliyor.
 *
 *  ⚠ MESAJ farkin YALNIZ yuzey oldugunu IDDIA ETMEZ: 'PN25' gibi cins
 *  ifadeleri satirda tokenize EDILMIYOR, yani aday baska eksenlerde de farkli
 *  olabilir. Iddia etmek mesaj-yalani sinifina girerdi.
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor + uretim mesaj ureticisi.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import type { IndexedRow, QueryOutcome, QueryOpts } from '../src/ozellik/eslestirme/matching/index/types';

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
      birim: (c as any).birim ?? null,
    },
  };
}

const sor = (q: string, pool: IndexedRow[], opts?: QueryOpts, birim = 'mt'): QueryOutcome =>
  runQuery(parseLine(q, birim), pool, opts);
const net = (o: QueryOutcome, q: string, birim = 'mt'): number =>
  toMatchResult(o, parseLine(q, birim), (v) => v).netPrice;
const sonuc = (o: QueryOutcome, q: string, birim = 'mt') => toMatchResult(o, parseLine(q, birim), (v) => v);
const kod = (o: QueryOutcome): string => (o.kind === 'none' ? `none/${(o as any).reason}` : o.kind);
const kapilar = (o: QueryOutcome): string[] => ((o as any).kapilar ?? []) as string[];

// ═════════════════════════════════════════════════════════════════════
//  A) ANA VAKA — galvaniz yok, siyah VAR
// ═════════════════════════════════════════════════════════════════════
console.log('── YG-1..6) yuzey elediginde urun gelir ──');
{
  const AD = 'Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 300, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'siyah', cap: '1"', price: 150, urunKodu: 'S-1' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '1"', price: 200, urunKodu: 'G-1' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '3/4"', price: 170, urunKodu: 'G-34' }),
  ];
  const Q = '2" Galvaniz Çelik Boru';
  const o = sor(Q, HAVUZ);

  // ON KOSUL: 2" markada GERCEKTEN var (siyah). Eleyen sey GALVANIZ.
  const oSiyah = sor('2" Siyah Çelik Boru', HAVUZ);
  check('YG-1 on kosul: markada 2" VAR (siyah @300)',
    oSiyah.kind === 'single', kod(oSiyah));

  check('YG-2 ASIL KAZANIM: kalem artik EKRANA GELIR (none degil, ask)',
    o.kind === 'ask', kod(o));
  check('YG-3 dogru aday sunulur: siyah 2" (@300)',
    o.kind === 'ask' && o.rows.length === 1 && o.rows[0].urun.urunKodu === 'S-2',
    o.kind === 'ask' ? o.rows.map((r) => r.urun.urunKodu).join(',') : kod(o));
  check('YG-4 PARA: fiyat OTOMATIK YAZILMAZ — aday YAZILI kisiti (galvaniz) ihlal ediyor',
    net(o, Q) === 0, `net=${net(o, Q)}`);
  check('YG-5 KAPI: "yuzey-genisletildi" acilir',
    kapilar(o).includes('yuzey-genisletildi'), JSON.stringify(kapilar(o)));
  // Mesaj farkin NE oldugunu IDDIA ETMEZ — yalniz "farkli bir cins/yuzey" der.
  check('YG-6 MESAJ: yazili yuzey anilir ve kontrol istenir',
    /galvaniz/i.test(sonuc(o, Q).reason ?? '') && /kontrol edin/i.test(sonuc(o, Q).reason ?? ''),
    sonuc(o, Q).reason);
}

// ═════════════════════════════════════════════════════════════════════
//  B) KAPILAR — hangi durumda ACILMAZ
// ═════════════════════════════════════════════════════════════════════
console.log('── YG-7..11) kapilar ──');
{
  const AD = 'Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 300, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '1"', price: 200, urunKodu: 'G-1' }),
  ];
  // (1) SURUKLEME yaparken ACILMAZ: kullanicinin kendi kurtarma yolu var.
  const TAG = urunVariantTags(HAVUZ[1]);
  const oTag = sor('2" Galvaniz Çelik Boru', HAVUZ, { variantTags: TAG });
  check('YG-7 KAPI: variantTags VARKEN yuzey genisletme ACILMAZ',
    !kapilar(oTag).includes('yuzey-genisletildi'), `${kod(oTag)} ${JSON.stringify(kapilar(oTag))}`);

  // (2) YAZILI YUZEY YOKKEN ACILMAZ — genisletecek bir sey yok.
  const Q2 = '4" Çelik Boru';
  const o2 = sor(Q2, HAVUZ);
  check('YG-8 KAPI: yazili yuzey YOKKEN cap-yok AYNEN doner',
    o2.kind === 'none' && (o2 as any).reason === 'cap-yok', kod(o2));
}
{
  // (3) ⚠ PARA KAPISI: AD-GEVSETME ile bulunmus aday SUNULMAZ.
  // Satirda 'Vana' yaziyor, aday 'Çekvalf' — ad DOGRULANMADI. Ustune yazili
  // yuzey de celisiyor: iki tahmin ust uste. Bu donus 'ad-gevsetildi' rozetini
  // uretemedigi icin kullanici adin dogrulanmadigini GOREMEZDI.
  const HAVUZ = [
    prod({ ad: 'Küresel Vana', cins: 'siyah', cap: '2"', price: 700, urunKodu: 'KV-2' }),
    prod({ ad: 'Çekvalf', cins: 'çalpara siyah', cap: '2"', price: 250, urunKodu: 'CV-2' }),
    prod({ ad: 'Çekvalf', cins: 'çalpara galvaniz', cap: '1"', price: 260, urunKodu: 'CV-1' }),
  ];
  const Q = 'Çalpara Galvaniz Vana 2"';
  const o = sor(Q, HAVUZ, undefined, 'adet');
  check('YG-9 PARA: ad GEVSETILEREK bulunan aday yuzey-genisletme ile SUNULMAZ',
    !kapilar(o).includes('yuzey-genisletildi'), `${kod(o)} ${JSON.stringify(kapilar(o))}`);
  check('YG-10 PARA: Çekvalf fiyati (250) "Vana" satirina YAZILMAZ',
    net(o, Q, 'adet') !== 250, `${kod(o)} net=${net(o, Q, 'adet')}`);
}

{
  // YG-13 IKINCI AILE KANITI (genel cozum kurali): havuz TUM AILELER icin
  // dolar. ⚠ Bu, `yuzeyGenis`ten AYRI degisken olmasinin da sebebi:
  // `yuzeyGenis` yalniz 'boru' ailesinde doluyor ve V4.7 kurtarmasinin havuz
  // sirasina giriyor; onu tum ailelerde doldurmak kurtarmayi boru DISINDA da
  // degistirip olculen bir PARA hatasi uretiyordu.
  const AD = 'Kelebek Vana';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: 'DN100', price: 700, urunKodu: 'KV-100' }),
    prod({ ad: AD, cins: 'galvaniz', cap: 'DN50', price: 400, urunKodu: 'KV-50' }),
  ];
  const Q = 'Galvaniz Kelebek Vana DN 100';
  const o = sor(Q, HAVUZ, undefined, 'adet');
  check('YG-13 IKINCI AILE (vana): boru DISINDA da kalem ekrana gelir',
    o.kind === 'ask' && kapilar(o).includes('yuzey-genisletildi'),
    `${kod(o)} ${JSON.stringify(kapilar(o))}`);
  check('YG-14 PARA: burada da fiyat otomatik yazilmaz',
    net(o, Q, 'adet') === 0, `net=${net(o, Q, 'adet')}`);
}

// ═════════════════════════════════════════════════════════════════════
//  C) HAFIZA OTOYAZI KAPISI — sozlesmeye tasindi mi
// ═════════════════════════════════════════════════════════════════════
console.log('── YG-11..12) hafiza otoyazi kapisi ──');
{
  const AD = 'Çelik Boru';
  const HAVUZ = [
    prod({ ad: AD, cins: 'siyah', cap: '2"', price: 300, urunKodu: 'S-2' }),
    prod({ ad: AD, cins: 'galvaniz', cap: '1"', price: 200, urunKodu: 'G-1' }),
  ];
  const Q = '2" Galvaniz Çelik Boru';
  const r = sonuc(sor(Q, HAVUZ), Q);
  // Motorun ic `kapilar` listesi dis sozlesmeye (MatchResult) tasinmiyor;
  // hafiza otoyazi kapisi bu bayragi okur. Bayrak dusesse bir kez onaylanan
  // secim IKINCI kosumda uyariyi silip fiyati 'high' yazardi.
  check('YG-11 bayrak dis sozlesmeye tasinir (hafiza otoyazi kapisi okur)',
    r.yuzeyGenisletildi === true, JSON.stringify(r.yuzeyGenisletildi));
  check('YG-12 KARSI: normal cap-yok yolunda bayrak URETILMEZ',
    (() => {
      const q2 = '4" Çelik Boru';
      return sonuc(sor(q2, HAVUZ), q2).yuzeyGenisletildi === undefined;
    })(), '-');
}

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
