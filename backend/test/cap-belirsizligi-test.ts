/**
 * A2 KILIDI — SINIF COZULEMEYINCE KOMSU CAP OTOMATIK YAZILIYOR
 *   npx ts-node test/cap-belirsizligi-test.ts   (npm run test:cap-belirsizligi)
 *
 * ── OLCULEN KUSUR (02.10) ─────────────────────────────────────────────────
 * `sizeEquivalents` sinif 'unknown' iken CELIK ve PLASTIK yorumlarinin
 * BIRLESIMINI dondurur ve `ambiguous: true` isaretler. Isaretin amaci dosyada
 * yazili: "sorgu tarafi iki yoruma yayilan adayi gorunce ASLA otomatik yazmaz
 * (P4 korumasi)". Ama `conversion.ts`in KENDI yorumu 26.08'de bunu curutmus:
 * "hicbir cagiran bu bayragi okumuyor". Bayrak ana eslesme yolunda (query-
 * engine `capUyar`) HALA okunmuyor — yalniz kurtarma yolunda okunuyor.
 *
 * Sonuc: iki yorum FARKLI fiziksel urune gittigi halde tag kumeleri cakisinca
 * motor KOMSU capi tek eslesme sayip fiyati OTOMATIK yaziyor (olculdu):
 *   "Kör Flanş 1\""          → Kör Flanş 3/4" @70   (1"→dn25 celik ∩ 3/4"→25mm plastik)
 *   "Kaynak Boyunlu Flanş 1 1/4\"" → … 1" @100      (1 1/4"→dn32 ∩ 1"→32mm)
 *   "Dirsek 1\""             → Dirsek Siyah 1 1/4" @50
 * Hepsi conf=high, hepsi sessiz — kullanici yanlis capin fiyatini gorur.
 *
 * ── MUHURLENEN KURAL ──────────────────────────────────────────────────────
 * ADAY ELENMEZ (kanit yok, suclama yok — evin cizgisi). Degisen tek sey:
 * eslesme YALNIZCA capraz yorumla mumkun olduysa OTOMATIK YAZILMAZ; satir
 * `ask`e duser ve gerekce `kapilar`da 'cap-belirsiz' olarak tasinir.
 * Eslesme AYNI yorumda da mumkunse (gercek ayni cap) davranis DEGISMEZ.
 *
 * ── GENELLIK ──────────────────────────────────────────────────────────────
 * IKI AILE: (F) flans — sinifi 'unknown' cozulen aile · (D) dirsek/fitting —
 * urunu CELIK, satiri belirsiz. Karsi ornekler ayni ailelerde: gercek ayni cap
 * ve mm kaynagi (tek anlamli) eskisi gibi tek eslesme + high kalmali.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
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
const ozet = (o: any) => `${o.kind}${o.kapilar ? ' kapilar=' + JSON.stringify(o.kapilar) : ''}`;

async function main() {
  // ── F: FLANS AILESI (sinif unknown) ─────────────────────────────────────
  const flansKomsu = [urun({ ad: 'Kör Flanş', cap: '3/4"', price: 70 })];
  const f1 = sor('Kör Flanş 1"', flansKomsu);
  check('★ F komsu cap (1" → 3/4") OTOMATIK YAZILMAZ', f1.kind === 'ask', `bugun: ${ozet(f1)}`);
  check('F komsu cap adayi ELENMEZ (kullanici secebilir)',
    (f1.kind === 'ask' ? f1.rows.length : f1.kind === 'single' ? 1 : 0) === 1, `bugun: ${ozet(f1)}`);
  check('F gerekce kapilarda tasinir (cap-belirsiz)',
    Array.isArray(f1.kapilar) && f1.kapilar.includes('cap-belirsiz'), `kapilar=${JSON.stringify(f1.kapilar)}`);

  const f2 = sor('Kaynak Boyunlu Flanş 1 1/4"', [urun({ ad: 'Kaynak Boyunlu Flanş', cap: '1"', price: 100 })]);
  check('★ F ikinci vaka (1 1/4" → 1") OTOMATIK YAZILMAZ', f2.kind === 'ask', `bugun: ${ozet(f2)}`);

  // KARSI: GERCEK ayni cap — davranis DEGISMEZ
  const f3 = sor('Kör Flanş 1"', [urun({ ad: 'Kör Flanş', cap: '1"', price: 90 })]);
  check('KARSI F ayni cap → tek eslesme (otomatik yazim SURER)', f3.kind === 'single', `bugun: ${ozet(f3)}`);

  // ── D: DIRSEK/FITTING AILESI — KARISIK HAVUZ ───────────────────────────
  // ⚠ HAVUZ SEKLI SART: yalniz CELIK urun konunca satirin sinifi da celik
  // cozuluyor ve sorgu `cap-yok` ile duser — kapi HIC denenmez (ilk yazimda
  // oyle oldu, assert `!== 'single'` ile SAHTE YESIL verdi). Kusur ancak ad
  // uzayinda iki sinif birlikteyken (celik + PPR) dogar: satirin sinifi
  // cozulemez, birlesim uretilir, komsu cap cakisir.
  const karisik = [
    urun({ ad: 'Dirsek', cins: 'Siyah', cap: '1/2"', price: 10 }),
    urun({ ad: 'Dirsek', cins: 'Siyah', cap: '1 1/4"', price: 50 }),
    urun({ ad: 'Dirsek', cins: 'PPR', cap: '20 mm', price: 3 }),
    urun({ ad: 'Dirsek', cins: 'PPR', cap: '40 mm', price: 9 }),
  ];
  const d1 = sor('Dirsek 1"', karisik);
  check('★ D komsu cap (1" → celik 1 1/4") OTOMATIK YAZILMAZ', d1.kind === 'ask', `bugun: ${ozet(d1)}`);
  check('D aday ELENMEZ (kullanici secebilir)',
    d1.kind === 'ask' && d1.rows.length >= 1, `bugun: ${ozet(d1)}`);
  check('D gerekce kapilarda tasinir (cap-belirsiz)',
    Array.isArray(d1.kapilar) && d1.kapilar.includes('cap-belirsiz'), `kapilar=${JSON.stringify(d1.kapilar)}`);

  // KARSI: AYNI havuzda gercek ayni cap — bugunku davranis AYNEN kalmali
  const d2 = sor('Dirsek 1 1/4"', karisik);
  check('KARSI D 1 1/4" → celik 1 1/4" adayi DURUR (eleme yok)',
    (d2.kind === 'ask' ? d2.rows : d2.kind === 'single' ? [d2.row] : [])
      .some((r: any) => String(r.urun.capRaw) === '1 1/4"'), `bugun: ${ozet(d2)}`);

  // ── KARSI: GERCEK ADAY VARKEN KAPI ACILMAZ ("her aday" vs "bir aday") ───
  // Havuzda hem GERCEK ayni cap hem komsu cap varsa: tutarli bir okuma MEVCUT
  // oldugu icin kapi ACILMAMALI. Olcut `d.every(tutarsiz)` olmali; `d.some`
  // olsaydi tek bir komsu aday butun sorguyu cekinceye dusururdu.
  const ikisi = sor('Kör Flanş 1"', [
    urun({ ad: 'Kör Flanş', cap: '1"', price: 90 }),
    urun({ ad: 'Kör Flanş', cap: '3/4"', price: 70 }),
  ]);
  check('KARSI gercek ayni cap da havuzdaysa cap-belirsiz kapisi ACILMAZ',
    !(ikisi.kapilar ?? []).includes('cap-belirsiz'), `kapilar=${JSON.stringify(ikisi.kapilar)}`);

  // ── KARSI: PLASTIK OKUMA ILE TUTARLI ESLESME (ikiz okuma) ───────────────
  // Kiyas yalniz CELIK okumada yapilsaydi, plastik tarafta DOGRU eslesen satir
  // haksiz yere cekinceye duserdi. 3/4" plastikte 25 mm'dir.
  const plastikTutarli = sor('Dirsek 3/4"', [
    urun({ ad: 'Dirsek', cins: 'Siyah', cap: '1 1/4"', price: 50 }),
    urun({ ad: 'Dirsek', cins: 'PPR', cap: '25 mm', price: 4 }),
  ]);
  const pRows = plastikTutarli.kind === 'ask' ? plastikTutarli.rows
    : plastikTutarli.kind === 'single' ? [plastikTutarli.row] : [];
  check('KARSI plastik okuma tutarliysa (3/4" ↔ 25 mm) kapi ACILMAZ',
    pRows.some((r: any) => String(r.urun.capRaw) === '25 mm')
      && !(plastikTutarli.kapilar ?? []).includes('cap-belirsiz'),
    `kind=${plastikTutarli.kind} kapilar=${JSON.stringify(plastikTutarli.kapilar)} rows=${JSON.stringify(pRows.map((r: any) => r.urun.capRaw))}`);

  // ── U: SATIRIN OKUMASI NET AMA URUNUNKI DEGIL ──────────────────────────
  // Kapi yalniz `equiv.ambiguous` iken aciliyordu — yani SATIRIN okumasi
  // belirsizse. Oysa capraz eslesme satirin sinifi COZULSE BILE olabilir:
  // urunun sinifi 'unknown' ise onun capTags'i da BIRLESIMDIR ve kesisim
  // urunun OBUR okumasindan gelebilir.
  // Burada satir 3/4" (plastikte 25 mm), urun 1" (celikte dn25). Kesisen tek
  // tag dn25 ve urunde CELIK okumasindan geliyor — yani 3/4" satirina 1"
  // urununun fiyati yazilacakti.
  const urunBelirsiz = sor('Kör Flanş 3/4"', [urun({ ad: 'Kör Flanş', cap: '1"', price: 100 })],
    { sizeClassHint: 'plastic' });
  check('★ U satir NET + urun BELIRSIZ caprazi da OTOMATIK YAZILMAZ',
    urunBelirsiz.kind === 'ask', `bugun: ${ozet(urunBelirsiz)}`);
  check('U gerekce kapilarda tasinir (cap-belirsiz)',
    (urunBelirsiz.kapilar ?? []).includes('cap-belirsiz'), `kapilar=${JSON.stringify(urunBelirsiz.kapilar)}`);

  // KARSI: mm kaynagi TEK ANLAMLI (ambiguous=false) — kapi ATESLENMEMELI
  const d3 = sor('Dirsek 20 mm', [urun({ ad: 'Dirsek', cins: 'PPR', cap: '20 mm', price: 3 })]);
  check('KARSI mm kaynagi tek anlamli → tek eslesme, kapi yok',
    d3.kind === 'single', `bugun: ${ozet(d3)}`);

  console.log(`\n${'='.repeat(60)}\nA2 CAP BELIRSIZLIGI: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
