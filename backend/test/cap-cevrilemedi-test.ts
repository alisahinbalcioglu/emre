/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CC — SATIRIN CAPI CEVRILEMEYINCE CAP SUZGECI SESSIZCE ATLANIYOR
 *  (`npm run test:cap-cevrilemedi`)
 *
 *  26.08 turu, PARA HATASI — ertelenen listede degil, O GUN CANLIDA OLAN kod.
 *
 *  KOK: `sizeEquivalents` bazi yazimlar icin BOS tag doner (`noConversion`).
 *  query-engine'in cap blogu `if (equiv.tags.length)` ile korunuyordu → tag
 *  yoksa BLOK KOMPLE ATLANIYOR: cap filtresi HIC uygulanmiyor, TUM caplar
 *  aday kaliyor ve kullanici capin YOK SAYILDIGINI ogrenmiyor.
 *
 *  OLCULEN PAYDA (37 yazim tarandi): steel'de 15 yazim cevrilemiyor —
 *    1/8" 3/16" 1/4" 3/8" 5/8" 7/8" 1 1/8" 1 3/4" 2 1/4" 3 1/2" 7" 9" 18" 20" 24"
 *  plastic'te ayrica 8" 10" 12" 14" 16" (pis suda SIK kullanilan olculer).
 *
 *  OLCULEN PARA (uc ayri yol, uretim motoru + uretim mesaj ureticisi):
 *    · single      : '1/4" Küresel Vana' + havuzda yalniz 1/2" @850
 *                    → kind=single · NET=850 · confidence=high  (1/2" fiyati)
 *    · single      : '8" PVC Pis Su Borusu' + havuzda yalniz 110 mm @300
 *                    → NET=300   (8"≈200 mm; 110 mm = 4" — ticari fark ~3 kat)
 *    · auto-variant: hedef '1/4"', kullanici kaynak satirda PN25 1/2" @500
 *                    secip surukluyor → NET=500  (hedefin capi 1/4")
 *
 *  ⚠ `noConversion` bayragi KAPI OLCUTU DEGILDIR: olculdu — steel'de 18 yazimda
 *  `noConversion=true` iken tag DOLU (DN 90 → ['dn90']). Kapi `tags.length===0`.
 *  ⚠ `ambiguous` bayragi bu turda BAGLANMADI (yalniz 'unknown' sinifta, 37
 *  yazimin 14'unde atesler — kor kapi gereksiz onay seli uretir). Yalniz
 *  conversion.ts'teki YALAN YORUM duzeltildi (olculdu: ambiguous=true iken
 *  motor 'high' veriyor — yorum "asla vermez" diyordu).
 *
 *  COZUM IKI PARCALI:
 *   (1) GERI DUSUS — cap cevrilemese bile IMZA esitligiyle suzulur (`capImzasi`,
 *       dosyada zaten var). Ham-dizgi esitligi BILEREK KULLANILMADI: olculdu,
 *       reduksiyon satirinda 900 TL'lik urune 100 TL yazdiriyor ve `3/8''`
 *       `1-3/4"` gibi yazim kaymalarini kaciriyor.
 *   (2) KAPI — hicbir aday capla dogrulanamadiysa `cap-cevrilemedi` kapisi
 *       acilir: fiyat OTOMATIK YAZILMAZ (I6: cap dogrulanamadi = tahmin,
 *       tahmin fiyat yazamaz), kalem GORUNUR kalir (S4: goster ama onay iste).
 *
 *  DB GEREKMEZ: uretim indeksleyicisi + saf motor + uretim mesaj ureticisi.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { sizeEquivalents, extractSizeInfo } from '../src/ozellik/eslestirme/matching/conversion';
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
    },
  };
}

const sor = (q: string, pool: IndexedRow[], opts?: QueryOpts, birim = 'adet'): QueryOutcome =>
  runQuery(parseLine(q, birim), pool, opts);
const net = (o: QueryOutcome, q: string, birim = 'adet'): number =>
  toMatchResult(o, parseLine(q, birim), (v) => v).netPrice;
const kod = (o: QueryOutcome): string => (o.kind === 'none' ? `none/${(o as any).reason}` : o.kind);
const kapilar = (o: QueryOutcome): string[] => ((o as any).kapilar ?? []) as string[];

// ═════════════════════════════════════════════════════════════════════
//  A) MEKANIZMA — cevrilemeyen yazimlar GERCEKTEN bos tag donuyor
// ═════════════════════════════════════════════════════════════════════
console.log('── CC-1..2) mekanizma: cevrim bosluklari ──');
{
  const bos = (q: string, cls: 'steel' | 'plastic') => {
    const info = extractSizeInfo(`Boru ${q}`);
    return !!info && sizeEquivalents(cls, info).tags.length === 0;
  };
  check('CC-1 celik tarafinda 1/4" · 3/8" · 5/8" · 7/8" cevrilemiyor (tag BOS)',
    bos('1/4"', 'steel') && bos('3/8"', 'steel') && bos('5/8"', 'steel') && bos('7/8"', 'steel'));
  // Pis su borusunda 8"/10"/12" SIK kullanilir — plastik tarafindaki bosluk
  // bu yuzden celiktekinden daha pahali.
  check('CC-2 plastik tarafinda 8" · 10" · 12" cevrilemiyor (tag BOS)',
    bos('8"', 'plastic') && bos('10"', 'plastic') && bos('12"', 'plastic'));
}

// ═════════════════════════════════════════════════════════════════════
//  B) PARA — cevrilemeyen capta YANLIS OLCUNUN fiyati yazilamaz
// ═════════════════════════════════════════════════════════════════════
console.log('── CC-3..9) PARA: cevrilemeyen capta otomatik fiyat YASAK ──');
{
  // Havuzda YALNIZ 1/2" var; satir 1/4" istiyor. Cap suzgeci kosmadigi icin
  // 1/2" tek aday kaliyor ve 'single' → 850 TL OTOMATIK yaziliyordu.
  const HAVUZ = [prod({ ad: 'Küresel Vana', cins: 'pirinç', baglanti: 'dişli', cap: '1/2"', price: 850, urunKodu: 'KV-12' })];
  const Q = '1/4" Küresel Vana';
  const o = sor(Q, HAVUZ);
  check('CC-3 kind: cevrilemeyen capta otomatik yazim YOK (ask)', o.kind === 'ask', kod(o));
  check('CC-4 PARA: netPrice 0 — 1/2" fiyati (850) 1/4" satirina YAZILMAZ', net(o, Q) === 0, `gelen ${net(o, Q)}`);
  check('CC-5 KAPI: kapilar "cap-cevrilemedi" tasir', kapilar(o).includes('cap-cevrilemedi'), JSON.stringify(kapilar(o)));
  // 'capsiz-dusum' AYRI bir olgudur: orada URUNUN capi yok. Burada urunun capi
  // VAR (1/2"), cevrilemeyen SATIRIN capi. Iki kapi karistirilirsa mesaj yalan olur.
  check('CC-6 KAPI AYRIMI: "capsiz-dusum" kapisi ATESLEMEZ (urunun capi VAR)',
    !kapilar(o).includes('capsiz-dusum'), JSON.stringify(kapilar(o)));
  // S4 dersi: eleme DEGIL onay. Kalem kullanicinin EKRANINDAN KAYBOLMAZ.
  check('CC-7 GORUNURLUK (S4): aday listede kalir, kalem ekrandan kaybolmaz',
    o.kind === 'ask' && o.rows.length === 1, `${kod(o)} rows=${o.kind === 'ask' ? o.rows.length : '-'}`);
  check('CC-8 MESAJ: kullanici capin suzulmedigini OGRENIR',
    /çevrim tablosunda yok/i.test((o as any).uyariNot ?? ''), `uyariNot: ${(o as any).uyariNot}`);
}
{
  // Ikinci aile kaniti — PLASTIK. 8" ≈ 200 mm; havuzdaki 110 mm = 4".
  const HAVUZ = [prod({ ad: 'PVC Pis Su Borusu', cins: 'PVC', cap: '110 mm', price: 300, urunKodu: 'PVC110' })];
  const Q = '8" PVC Pis Su Borusu';
  const o = sor(Q, HAVUZ, { sizeClassHint: 'plastic' }, 'mt');
  check('CC-9 IKINCI AILE (plastik): 110 mm fiyati 8" satirina YAZILMAZ',
    net(o, Q, 'mt') === 0, `${kod(o)} net=${net(o, Q, 'mt')}`);
}
{
  // UCUNCU YOL — SURUKLEME (auto-variant). Bu yol celiski zincirinden ONCE
  // doner; yalniz mesaj/kapi eklemek parayi KESMEZ, freni de genisletmek sart.
  const HAVUZ = [
    prod({ ad: 'PP Küresel Vana', cins: 'PN25', cap: '1/2"', price: 500, urunKodu: 'PN25-12' }),
    prod({ ad: 'PP Küresel Vana', cins: 'PN16', cap: '1/4"', price: 100, urunKodu: 'PN16-14' }),
  ];
  const TAG = urunVariantTags(HAVUZ[0]); // kullanici PN25'i secti
  const Q = '1/4" PP Küresel Vana';
  const o = sor(Q, HAVUZ, { variantTags: TAG });
  check('CC-10 PARA/SURUKLEME: auto-variant yolu da 1/2" fiyatini (500) YAZAMAZ',
    net(o, Q) !== 500, `${kod(o)} net=${net(o, Q)}`);
  check('CC-11 SURUKLEME kapisi: fiyat yazilmaz, onay istenir', net(o, Q) === 0, `net=${net(o, Q)}`);
}
{
  // CC-22 OTOMATIK YAZIM FRENININ KENDISI. CC-10/11 havuzunda hedef capta
  // (1/4") BASKA bir urun vardi, yani onlari kurtaran sey GERI DUSUS SUZGECI
  // idi — FREN degil (mutasyon olcumu yakaladi: fren capsiz-only'e geri
  // dondurulunce CC-10/11 yine yesil kaliyordu).
  // Bu havuzda hedef capta HICBIR urun yok ve tek adayin capi CEVRILEBILIR
  // (1/2" → capTags ['dn15'] DOLU) — yani eski 'capsiz' freni ATESLEMEZ.
  // Freni ates alan tek sey `capCevrilemedi` kosulu; olculdu: o kosul olmadan
  // 1/2" fiyati (500) bir 1/4" satirina OTOMATIK yaziliyor.
  const HAVUZ = [prod({ ad: 'PP Küresel Vana', cins: 'PN25', cap: '1/2"', price: 500, urunKodu: 'PN25-12' })];
  const TAG = urunVariantTags(HAVUZ[0]);
  const Q = '1/4" PP Küresel Vana';
  const o = sor(Q, HAVUZ, { variantTags: TAG });
  check('CC-22 on kosul: tek adayin capi CEVRILEBILIR (capTags DOLU) — eski fren atesleyemez',
    HAVUZ[0].urun.capTags.length > 0, JSON.stringify(HAVUZ[0].urun.capTags));
  check('CC-23 PARA/FREN: cap dogrulanamadigi icin 1/2" fiyati (500) YAZILMAZ',
    net(o, Q) === 0, `${kod(o)} net=${net(o, Q)}`);
  check('CC-24 FREN kapisi dogru: "cap-cevrilemedi" (urunun capi VAR, satirinki cevrilemiyor)',
    kapilar(o).includes('cap-cevrilemedi'), JSON.stringify(kapilar(o)));
}

// ═════════════════════════════════════════════════════════════════════
//  C) GERI DUSUS — cap cevrilemese bile IMZA ile suzulur
// ═════════════════════════════════════════════════════════════════════
console.log('── CC-12..15) GERI DUSUS: imza esitligi ──');
{
  // Cap CEVRILEMIYOR ama satir ile urun AYNI capi yaziyor → dogrulanmis sayilir,
  // fiyat OTOMATIK yazilir. Kapi ACILMAZ (dogrulanamayan bir sey yok).
  const HAVUZ = [prod({ ad: 'Küresel Vana', cins: 'pirinç', cap: '3/8"', price: 620, urunKodu: 'KV-38' })];
  const Q = '3/8" Küresel Vana';
  const o = sor(Q, HAVUZ);
  check('CC-12 GERI DUSUS(+): satir ve urun AYNI cevrilemez capta → single',
    o.kind === 'single' && net(o, Q) === 620, `${kod(o)} net=${net(o, Q)}`);
  check('CC-13 GERI DUSUS(+) kapi acilmaz: cap DOGRULANDI', kapilar(o).length === 0, JSON.stringify(kapilar(o)));
}
{
  // SECICILIK: bes cevrilemez bakir olcusu. Suzgec kosmadigi icin motor
  // BESINI de aday gosterip "hangisi?" diye soruyordu (olculdu).
  const CAPLAR = ['1/4"', '3/8"', '1/2"', '5/8"', '7/8"'];
  const HAVUZ = CAPLAR.map((c, i) => prod({ ad: 'Bakır Boru', cins: 'bakır', cap: c, price: 100 + i * 10, urunKodu: `B-${i}` }));
  const Q = '3/8" Bakır Boru';
  const o = sor(Q, HAVUZ, undefined, 'mt');
  check('CC-14 SECICILIK: bes cevrilemez cap arasindan DOGRU olan secilir',
    o.kind === 'single' && o.row.urun.capRaw === '3/8"', `${kod(o)} cap=${o.kind === 'single' ? o.row.urun.capRaw : '-'}`);
}
{
  // YAZIM TOLERANSI — ham-dizgi esitliginin OLEMEYECEGI vaka. Satici `3/8''`
  // (cift tirnak yerine iki apostrof) yazmis; imza esitligi bunu ayni sayar.
  const HAVUZ = [prod({ ad: 'Bakır Boru', cins: 'bakır', cap: "3/8''", price: 620, urunKodu: 'B-38' })];
  const Q = '3/8" Bakır Boru';
  const o = sor(Q, HAVUZ, undefined, 'mt');
  check('CC-15 YAZIM TOLERANSI: 3/8\'\' ile 3/8" ayni cap sayilir',
    o.kind === 'single' && net(o, Q, 'mt') === 620, `${kod(o)} net=${net(o, Q, 'mt')}`);
}

{
  // CC-19 PARA/KURTARMA HAVUZU: geri dusus suzgeci GENIS havuzlara da
  // uygulanmali (E2 para kapisinin ikizi). Kosul: hedef capta kullanicinin
  // sectigi cins YOK, ama BASKA bir cevrilemez capta VAR.
  //   suzgecsiz → varyantKurtarma'da 3/8" PN25 tek aday kalir → @620 bir
  //               5/8" satirina yazilir (kaynak capin fiyati hedef capa yayilir)
  //   suzgecli  → kurtarma havuzu 5/8"ye daralir, PN25 yok → fiyat yazilmaz
  const HAVUZ = [
    prod({ ad: 'Bakır Boru', cins: 'PN25', cap: '3/8"', price: 620, urunKodu: 'P25-38' }),
    prod({ ad: 'Bakır Boru', cins: 'PN16', cap: '5/8"', price: 700, urunKodu: 'P16-58' }),
  ];
  const TAG = urunVariantTags(HAVUZ[0]); // kullanici PN25'i secti
  const Q = '5/8" Bakır Boru';
  const o = sor(Q, HAVUZ, { variantTags: TAG }, 'mt');
  check('CC-19 PARA: geri dususte kurtarma havuzu da suzulur — 3/8" fiyati (620) 5/8" satirina YAZILMAZ',
    net(o, Q, 'mt') !== 620, `${kod(o)} net=${net(o, Q, 'mt')}`);
}

{
  // CC-20 KAPI SECIMI capRaw'a bakar, capTags'e DEGIL. Cevrilemez capli urunun
  // capTags'i ZATEN bostur (3/8" → []); olcut capTags olsaydi motor o urunu
  // CAPSIZ sanip "ürünün çapı doğrulanamadı" derdi — URUNUN CAPI YAZILI (3/8"),
  // dogrulanamayan sey SATIRIN capi. Mesaj yalani tam olarak buradan cikardi.
  const HAVUZ = [prod({ ad: 'Bakır Boru', cins: 'bakır', cap: '3/8"', price: 620, urunKodu: 'B-38' })];
  const Q = '1/4" Bakır Boru';
  const o = sor(Q, HAVUZ, undefined, 'mt');
  check('CC-20 on kosul: cevrilemez capli urunun capTags i BOS ama capRaw i DOLU',
    HAVUZ[0].urun.capTags.length === 0 && HAVUZ[0].urun.capRaw === '3/8"',
    `tags=${JSON.stringify(HAVUZ[0].urun.capTags)} raw=${HAVUZ[0].urun.capRaw}`);
  check('CC-21 KAPI SECIMI: "cap-cevrilemedi" acilir, "capsiz-dusum" ACILMAZ',
    kapilar(o).includes('cap-cevrilemedi') && !kapilar(o).includes('capsiz-dusum'),
    JSON.stringify(kapilar(o)));
}

// ═════════════════════════════════════════════════════════════════════
//  D) REGRESYON — CEVRILEBILIR cap davranisi HIC DEGISMEZ
// ═════════════════════════════════════════════════════════════════════
console.log('── CC-16..18) REGRESYON: cevrilebilir capta davranis aynen ──');
{
  const HAVUZ = [prod({ ad: 'Küresel Vana', cins: 'pirinç', baglanti: 'dişli', cap: '1/2"', price: 850, urunKodu: 'KV-12' })];
  const Q1 = '1/2" Küresel Vana';
  const o1 = sor(Q1, HAVUZ);
  check('CC-16 cevrilebilir + havuzda VAR → single, fiyat yazilir (aynen)',
    o1.kind === 'single' && net(o1, Q1) === 850, `${kod(o1)} net=${net(o1, Q1)}`);
  check('CC-17 cevrilebilir yolda "cap-cevrilemedi" kapisi ATESLEMEZ',
    !kapilar(o1).includes('cap-cevrilemedi'), JSON.stringify(kapilar(o1)));

  const o2 = sor('3/4" Küresel Vana', HAVUZ);
  check('CC-18 cevrilebilir + havuzda YOK → cap-yok AYNEN doner (E4/E6 turu bozulmadi)',
    o2.kind === 'none' && (o2 as any).reason === 'cap-yok', kod(o2));
}

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
