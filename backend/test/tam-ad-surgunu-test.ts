/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TS — TAM-AD SURGUNU KURTARMADAN MUAF DEGILDIR  (`npm run test:tam-ad-surgunu`)
 *
 *  27.08 CANLI VAKA (DUYAR "Küresel Vana", kullanicinin kendi kutuphanesi).
 *  Kullanici 1/2" satirinda "Küresel vana (pirinç) · dişli · pirinç · PN25"
 *  secip asagi surukledi. Sonuc:
 *    3/4" ve 1"  → PEMBE (variantMissing)   — oysa @491 / @755 kutuphanede VAR
 *    1 1/4"      → "bu capta yok"           — oysa @1227 kutuphanede VAR
 *  Ustelik 1/2"ye 3.121 TL'lik FLANSLI urun yazilabiliyordu (dogrusu 316/311).
 *
 *  KOK (olculdu): TAM-AD kilidi satirin ("Küresel Vana") adiyla BIREBIR
 *  ortusen kayitlara kilitlenir; adi UST KUME olan "Küresel vana (pirinç)"
 *  kayitlari `adGenis`e SURULUR. Parantez ayractir, 'pirinc' fazladan bir AD
 *  token'idir — bu DOGRU davranis. Kusur surgunde degil, surgunun GERI
 *  ALINMAMASINDA: hicbir kurtarma yolu `adGenis`i okumuyordu, yani
 *  kullanicinin ACIK secimi havuzda YAPISAL OLARAK bulunamiyordu.
 *
 *  COZUM: ucuncu kurtarma havuzu (`adGenisKurtarma`) + SIFIR KAPISI.
 *  ⚠ MERGE DEGIL: surgunu `varyantKurtarma`ya katmak olculdu ve BUGUN dogru
 *  calisan bir vakayi cap-yok yalanina dusuruyordu (iki havuz ayni potada
 *  carpisinca "tek aday" sarti bozuluyor). Ayri havuz + sifir kapisi
 *  (yazili-ad havuzlari HERHANGI aday verdiyse surgun HIC konusmaz) o
 *  gerilemeyi sifirlar ve K7 belirsizligini korur.
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
    id: `lib-${idx.rowKey}`, listPrice: c.price, customPrice: null, discountRate: 0,
    currency: (c.paraBirimi as string) ?? 'TRY',
    urun: {
      ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null, price: c.price,
      birim: (c as any).birim ?? null,
    },
  };
}

// ── CANLI HAVUZ (kullanicinin kutuphanesinden BIREBIR) ──────────────
const KAT = 'Pirinç Vanalar';
const pirinc = (cins: string, cap: string, price: number, kod: string) =>
  prod({ kategori: KAT, ad: 'Küresel vana (pirinç)', cins, baglanti: 'dişli', cap, urunKodu: kod, price, birim: 'adet' });
const PN25 = (cap: string, p: number) => pirinc('dişli · pirinç · PN25', cap, p, 'T-2110');
const KELEBEK = (cap: string, p: number) => pirinc('kelebek kollu · dişli · pirinç · PN25', cap, p, 'T-2120');
const FLANSLI = (cap: string, p: number) =>
  prod({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'PN16 · flanşlı · GGG-40 sfero döküm · F4 boy',
    baglanti: 'flanşlı', cap, price: p, birim: 'adet' });

const HAVUZ = [
  PN25('1/2"', 316), PN25('3/4"', 491), PN25('1"', 755), PN25('1 1/4"', 1227),
  KELEBEK('1/2"', 311), KELEBEK('3/4"', 491), KELEBEK('1"', 752),
  FLANSLI('DN15', 2664), FLANSLI('DN20', 3121), FLANSLI('DN25', 3216), FLANSLI('DN40', 3006),
];
const KAYNAK_PN25 = HAVUZ[0];
const KAYNAK_KELEBEK = HAVUZ[4];

const surukle = (q: string, tags: string[], pool: IndexedRow[] = HAVUZ): QueryOutcome =>
  runQuery(parseLine(q, 'ad'), pool, { variantTags: tags });
const fiyat = (o: QueryOutcome): number | null =>
  o.kind === 'auto-variant' ? o.row.urun.price : o.kind === 'single' ? o.row.urun.price : null;
const kod = (o: QueryOutcome): string => (o.kind === 'none' ? `none/${(o as any).reason}` : o.kind);

// ═════════════════════════════════════════════════════════════════════
//  A) ON KOSUL — surgun GERCEKTEN olusuyor mu (fixture kaniti)
// ═════════════════════════════════════════════════════════════════════
console.log('── TS-1..2) fixture kaniti: tam-ad kilidi surgun uretiyor ──');
{
  // Satir "Küresel Vana"; FLANSLI urunun adi BIREBIR ayni ('kuresel vana'),
  // pirinc kayitlarinin adi UST KUME ('kuresel vana pirinc') → surgun.
  check('TS-1 flansli urun adi satirla BIREBIR, pirinc urun adi UST KUME',
    JSON.stringify(HAVUZ[8].urun.adTokens) === JSON.stringify(['kuresel', 'vana'])
    && JSON.stringify(HAVUZ[1].urun.adTokens) === JSON.stringify(['kuresel', 'vana', 'pirinc']),
    `flansli=${JSON.stringify(HAVUZ[8].urun.adTokens)} pirinc=${JSON.stringify(HAVUZ[1].urun.adTokens)}`);
  // Ayni capta ikisi de var (dn20): surgun geri alinmazsa FLANSLI kazanir.
  check('TS-2 on kosul: 3/4" hem pirinc (@491) hem flansli (DN20 @3121) tasir',
    HAVUZ[1].urun.capTags.includes('dn20') && HAVUZ[8].urun.capTags.includes('dn20'),
    `${JSON.stringify(HAVUZ[1].urun.capTags)} / ${JSON.stringify(HAVUZ[8].urun.capTags)}`);
}

// ═════════════════════════════════════════════════════════════════════
//  B) ASIL KAZANIM — surukleme kullanicinin secimini tasir
// ═════════════════════════════════════════════════════════════════════
console.log('── TS-3..7) surukleme: secilen kimlik hedef capta bulunur ──');
{
  const TAG = urunVariantTags(KAYNAK_PN25);
  const o34 = surukle(`3/4'' Küresel Vana`, TAG);
  check('TS-3 3/4" → secilen PN25 serisi yazilir (@491)',
    o34.kind === 'auto-variant' && fiyat(o34) === 491, `${kod(o34)}@${fiyat(o34)}`);
  // ⚠ PARA: ayni capta 3.121 TL'lik FLANSLI duruyor — o ASLA yazilmamali.
  check('TS-4 PARA: flansli DN20 (@3121) 3/4" satirina YAZILMAZ',
    fiyat(o34) !== 3121, `gelen ${fiyat(o34)}`);

  const o1 = surukle(`VANA VE KOMPANSATÖR GRUBU 1'' Küresel Vana`, TAG);
  check('TS-5 1" → @755 (baslik mirasi da bozmaz)',
    o1.kind === 'auto-variant' && fiyat(o1) === 755, `${kod(o1)}@${fiyat(o1)}`);

  // 1 1/4"te FLANSLI seri o capta YOK → eski kod "cap-yok" yalani soyluyordu.
  const o114 = surukle(`VANA VE KOMPANSATÖR GRUBU 1 1/4'' Küresel Vana`, TAG);
  check('TS-6 1 1/4" → @1227 ("bu capta yok" YALANI bitti)',
    o114.kind === 'auto-variant' && fiyat(o114) === 1227, `${kod(o114)}@${fiyat(o114)}`);

  // KAYNAK DUYARLILIGI: baska cins secilirse O cinsin fiyati gelmeli.
  const oKel = surukle(`VANA VE KOMPANSATÖR GRUBU 1'' Küresel Vana`, urunVariantTags(KAYNAK_KELEBEK));
  check('TS-7 kaynak duyarli: kelebek kollu secilirse @752 (PN25 @755 DEGIL)',
    fiyat(oKel) === 752, `${kod(oKel)}@${fiyat(oKel)}`);
}

// ═════════════════════════════════════════════════════════════════════
//  C) FRENLER — sessiz ikame YASAK
// ═════════════════════════════════════════════════════════════════════
console.log('── TS-8..11) frenler ──');
{
  // Kelebek serisi 1 1/4"te YOK → ikame edilmemeli (PN25 @1227 kapilmamali).
  const o = surukle(`1 1/4'' Küresel Vana`, urunVariantTags(KAYNAK_KELEBEK));
  check('TS-8 PARA: secilen cins o capta yoksa BASKA cins ikame EDILMEZ',
    fiyat(o) !== 1227 && o.kind === 'none', `${kod(o)}@${fiyat(o)}`);
}
{
  // SIFIR KAPISI: yazili-ad havuzu aday uretiyorsa surgun HIC konusmaz.
  // Burada flansli seri hedef capta TEK aday → o yazilir (BUGUNKU davranis
  // bit-bit korunur), surgun devreye girmez.
  const TAG_FL = urunVariantTags(HAVUZ[8]); // kullanici FLANSLI secmis
  const o = surukle(`3/4'' Küresel Vana`, TAG_FL);
  check('TS-9 SIFIR KAPISI: flansli secildiyse flansli yazilir (@3121)',
    o.kind === 'auto-variant' && fiyat(o) === 3121, `${kod(o)}@${fiyat(o)}`);
}
{
  // K7: surgunde AYNI kimlikten IKI kayit (iki fiyat) → gercek belirsizlik,
  // sistem secemez.
  const IKIZ = [...HAVUZ, PN25('3/4"', 495)];
  const o = surukle(`3/4'' Küresel Vana`, urunVariantTags(KAYNAK_PN25), IKIZ);
  check('TS-10 K7: surgunde iki ayni-kimlik kayit varsa fiyat YAZILMAZ',
    fiyat(o) === null, `${kod(o)}@${fiyat(o)}`);
}
{
  // KAPI: kullanici SECMEDIYSE surgun havuzlari HIC okunmaz — tagsiz yol
  // bit-bit eskisi gibi kalir.
  const o = runQuery(parseLine(`3/4'' Küresel Vana`, 'ad'), HAVUZ);
  check('TS-11 KAPI: variantTags YOKKEN davranis DEGISMEZ (surgun susar)',
    o.kind === 'single' && fiyat(o) === 3121, `${kod(o)}@${fiyat(o)}`);
}

{
  // TS-12 TAGSIZ KAPISI. Kullanici SECIM YAPMADIYSA surgun havuzu HIC
  // konusmamali: 1 1/4"te yazili-ad (flansli) serisi o capta yok, surgunde
  // ise TAM 1 pirinc kayit (@1227) var. Kapi kalkarsa motor kullanicinin
  // HIC secmedigi bir urunu OTOMATIK yazar (sessiz ikame).
  // ⚠ TS-11 bu kapiyi SURMUYOR (mutasyon olcumu): orada rows dolu oldugu
  // icin kurtarma hic cagrilmiyor. Burada rows BOSALIYOR → kurtarma kosuyor.
  const o = runQuery(parseLine(`1 1/4'' Küresel Vana`, 'ad'), HAVUZ);
  check('TS-12 ON KOSUL: tagsiz 1 1/4" yolu kurtarmaya ULASIR (rows bosalir)',
    o.kind === 'none' || o.kind === 'ask', kod(o));
  check('TS-13 PARA: secim YOKKEN surgundeki @1227 OTOMATIK yazilmaz',
    fiyat(o) !== 1227, `${kod(o)}@${fiyat(o)}`);
}

// ⚠ KAPSAM BORCU (durustluk notu, 27.08): SIFIR KAPISI mutasyonla ORTULU
// DEGIL. Kapi yalniz su kesisimde ates alir: yazili-ad havuzlari ≥2 aday
// uretir (GERCEK belirsizlik) AMA  0 olur — yani kurtarma cagrilir
// ve on-suzgec anlik goruntusu ikizleri hala tasir. Bu vakayi kuran fixture
// uretilemedi: denenen kurgu (ada gomulu olcu) satirin "20"sini CAP degil
// AD token i olarak ayristirdi ve sorgu surgun kaydiyla BIREBIR eslesip
// normal yoldan yazildi — yani kapiya hic ugramadi. O test SILINDI (ne
// olctugunu soylemeyen test testsizlikten kotudur).
// Kapi KODDA BIRAKILDI: yalnizca otomatik yazimi ENGELLEYEBILIR, asla
// uretemez — yanlis taraftaysa bedeli bir yorum, dogru taraftaysa kazanci
// bir para hatasidir. Gerekcesi curutucu turunda olculmustu (merge surumu
// bugun dogru calisan bir vakayi cap-yok yalanina dusuruyordu).

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
