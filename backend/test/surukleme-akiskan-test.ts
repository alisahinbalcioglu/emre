/**
 * K1 KILIDI — SURUKLEME / OTOMATIK-VARYANT YOLU AKISKAN KAPISINI ATLIYORDU
 *   npx ts-node test/surukleme-akiskan-test.ts   (npm run test:surukleme-akiskan)
 *
 * ── OLCULEN KUSUR (04.10, saf motor) ──────────────────────────────────────
 * Kullanici bir su vanasini (Küresel Vana · Pirinç 3/4") secip asagi
 * surukluyor; yol bir "DOĞALGAZ KÜRESEL VANA 1"" satirindan geciyor.
 *   S0 surukleme YOK  · havuz [su vanasi]       → ask "Akışkan bilgisi doğrulanamadı"
 *   S1 surukleme VAR  · havuz [su vanasi]       → auto-variant su vanasi @500  ✘
 *   S3 BUHAR satiri   · havuz [su vanasi]       → auto-variant su vanasi @500  ✘
 *   S7 surukleme YOK  · havuz [su, gaz(cinste)] → single GAZ vanasi @800      ✔
 *   S6 surukleme VAR  · havuz [su, gaz(cinste)] → auto-variant SU vanasi @500 ✘
 * S6 en agiri: dogru gaz vanasi kutuphanede DURURKEN surukleme su vanasini
 * yaziyor. Kok iki parca:
 *   (1) Otomatik-varyant donusleri (eslesen / tek aday / iki kurtarma) yalniz
 *       `capAutoYasak`a bakiyor; akiskan kapisi celiski zincirinde ve o
 *       zincire HIC ulasilmiyor.
 *   (2) Kurtarma havuzlari cins/yuzey/baglanti suzgecinden ONCE alinir; satirin
 *       akiskan kelimesi CINS suzgeci olarak calistiginda (gaz bilgisi urunun
 *       cinsinde) kurtarma onu atlar.
 *
 * ── KURAL ─────────────────────────────────────────────────────────────────
 * Satirin (sozluk tukettikten sonra kalan) token'larinda akiskan varsa
 * (doğalgaz/gaz/LPG/buhar/sıvı) otomatik-varyant adayi AYNI akiskani ad /
 * cins / kategorisinde tasimali:
 *   · kurtarma havuzlari bu suzgecten gecer (L6 birim kuraliyla ayni ilke:
 *     "kurtarma bu kurali DELEMEZ") — S6'da su vanasi duser, gaz vanasi yolu
 *     devralir;
 *   · dogrudan donuslerde aday akiskani tasimiyorsa surukleme YOKKEN uretilen
 *     notun AYNISIYLA onay istenir (S0 ile ayni sozlesme).
 * Sozluk akiskan kelimesini TUKETTIYSE (dogalgaz alias'i → celik boru) kapi
 * acilmaz: "DOĞALGAZ BORUSU" satirina surulen celik boru secimi AYNEN yazilir.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
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
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null, capRaw: c.cap ?? null,
      kategori: c.kategori ?? null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null },
  } as IndexedRow;
}
const sor = (satir: string, havuz: IndexedRow[], opts?: any) => runQuery(parseLine(satir), havuz, opts) as any;
const secilen = (o: any): string[] =>
  (o.kind === 'ask' ? o.rows : o.kind === 'single' || o.kind === 'auto-variant' ? [o.row] : [])
    .map((r: any) => `${r.urun.ad}/${r.urun.cins}@${r.listPrice}`);
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''}${o.uyariNot ? ' "' + o.uyariNot + '"' : ''} → ${JSON.stringify(secilen(o))}`;

const SU = () => urun({ ad: 'Küresel Vana', cins: 'Pirinç', baglanti: 'Dişli', cap: '1"', price: 500 });
const SU_KAYNAK = () => urun({ ad: 'Küresel Vana', cins: 'Pirinç', baglanti: 'Dişli', cap: '3/4"', price: 400 });
const GAZ_CINSTE = () => urun({ ad: 'Küresel Vana', cins: 'Doğalgaz Sarı Kollu', baglanti: 'Dişli', cap: '1"', price: 800 });
const GAZ_ADDA = () => urun({ ad: 'Doğalgaz Küresel Vana', cins: 'Sarı Kollu', baglanti: 'Dişli', cap: '1"', price: 800 });
const BUHAR_CINSTE = () => urun({ ad: 'Küresel Vana', cins: 'Buhar Paslanmaz', baglanti: 'Dişli', cap: '1"', price: 1500 });
const GAZ_KATEGORIDE = () => urun({ ad: 'Küresel Vana', cins: 'Sarı Kollu', baglanti: 'Dişli', cap: '1"', price: 820, kategori: 'Doğalgaz Vanaları' });

async function main() {
  // Surukleme etiketleri uretimdeki fonksiyonla, secilen urunun KENDISINDEN
  const v = urunVariantTags(SU_KAYNAK());
  check('O fixture: surukleme etiketleri su vanasindan (ad + cins + baglanti)',
    JSON.stringify(v) === '["ad:kuresel vana","cins:pirinc","bag:disli"]', JSON.stringify(v));
  const s0 = sor('DOĞALGAZ KÜRESEL VANA 1"', [SU()]);
  check('O surukleme YOKKEN akiskan kapisi acik (sozlesmenin referansi)',
    s0.kind === 'ask' && /Akışkan bilgisi doğrulanamadı/.test(s0.uyariNot ?? ''), ozet(s0));
  const s4 = sor('KÜRESEL VANA 1"', [SU()], { variantTags: v });
  check('O fixture: ayni etiketler akiskansiz satirda OTOMATIK yazar (yol kosuyor)',
    s4.kind === 'auto-variant' && secilen(s4)[0]?.endsWith('@500'), ozet(s4));

  // ── A: AKISKAN BILINMEYEN — aday akiskani tasimiyor ─────────────────────
  const s1 = sor('DOĞALGAZ KÜRESEL VANA 1"', [SU()], { variantTags: v });
  check('★ A DOGALGAZ satirina surulen su vanasi OTOMATIK YAZILMAZ',
    s1.kind === 'ask' && secilen(s1).length === 1 && secilen(s1)[0].endsWith('@500'), ozet(s1));
  check('A not surukleme YOKKEN uretilenin AYNISI (tek sozlesme)',
    s1.uyariNot === s0.uyariNot && (s1.kapilar ?? []).includes('bilinmeyen-kelime'),
    `surukleme="${s1.uyariNot}" referans="${s0.uyariNot}" kapilar=${JSON.stringify(s1.kapilar)}`);
  const s3 = sor('BUHAR KÜRESEL VANA 1"', [SU()], { variantTags: v });
  check('★ A ikinci aile: BUHAR satirina surulen su vanasi OTOMATIK YAZILMAZ',
    s3.kind === 'ask' && /Akışkan bilgisi doğrulanamadı/.test(s3.uyariNot ?? ''), ozet(s3));

  // ── K: KURTARMA HAVUZU — gaz bilgisi CINSTE, dogru urun kutuphanede ─────
  const s7 = sor('DOĞALGAZ KÜRESEL VANA 1"', [SU(), GAZ_CINSTE()]);
  check('K referans: surukleme YOKKEN gaz vanasi yazilir (@800)', s7.kind === 'single' && secilen(s7)[0]?.endsWith('@800'), ozet(s7));
  const s6 = sor('DOĞALGAZ KÜRESEL VANA 1"', [SU(), GAZ_CINSTE()], { variantTags: v });
  check('★ K surukleme kurtarmasi su vanasini gaz satirina YAZMAZ',
    !(s6.kind === 'auto-variant' && secilen(s6)[0]?.endsWith('@500')) && !secilen(s6).some((x) => x.endsWith('@500')), ozet(s6));
  check('K kullanici dogru gaz vanasini gorur', secilen(s6).some((x) => x.endsWith('@800')), ozet(s6));
  const s8 = sor('BUHAR KÜRESEL VANA 1"', [SU(), BUHAR_CINSTE()], { variantTags: v });
  check('★ K ikinci aile: BUHAR kurtarmasi su vanasini yazmaz, buhar vanasi gorunur',
    !secilen(s8).some((x) => x.endsWith('@500')) && secilen(s8).some((x) => x.endsWith('@1500')), ozet(s8));

  // ── R: OBUR KURTARMA YOLLARI — her biri ayri havuz, ayri suzgec ─────────
  // Ilk surumde yalniz yukaridaki senaryolar vardi; mutasyon (04.10) uc
  // kurtarma suzgecini kaldiran mutantlari YASATTI — o yollari suren test
  // yoktu. Senaryolar mutantlarin altinda OLCULEREK bulundu. Her birine
  // fikstur kaniti: AYNI surukleme akiskansiz satirda kurtarmayi GERCEKTEN
  // yapiyor (yoksa "none" yolun hic kosmamasindan da gelebilirdi).
  const KOLLU = { ad: 'Küresel Vana Kollu', cins: 'Pirinç', cap: '1"', price: 520 };
  const vKollu = urunVariantTags(urun({ ...KOLLU, cap: '3/4"', price: 410 }));
  const kelebekGalv = () => urun({ ad: 'Kelebek Vana', cins: 'Galvaniz', cap: '1"', price: 700 });
  const kurtarma: Array<[string, string, () => IndexedRow[], string[]]> = [
    ['erken kurtarma · varyant havuzu (yuzey ekseni bosaltti)', 'GALVANİZ KÜRESEL VANA 1"', () => [SU(), kelebekGalv()], v],
    ['erken kurtarma · tam-ad surgunu', 'GALVANİZ KÜRESEL VANA 1"',
      () => [urun(KOLLU), urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '3/4"', price: 420 }), kelebekGalv()], vKollu],
    ['cap-yok kurtarmasi · tam-ad surgunu', 'KÜRESEL VANA 1"',
      () => [urun(KOLLU), urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '3/4"', price: 420 })], vKollu],
  ];
  for (const [ad, satir, havuz, etiket] of kurtarma) {
    const kanit = sor(satir, havuz(), { variantTags: etiket });
    check(`R fixture ${ad}: akiskansiz satirda su vanasi KURTARILIR`, kanit.kind === 'auto-variant', ozet(kanit));
    const r = sor(`DOĞALGAZ ${satir}`, havuz(), { variantTags: etiket });
    check(`★ R ${ad}: gaz satirinda su vanasi kurtarilmaz (aday bile olmaz)`,
      r.kind === 'none' && secilen(r).length === 0, ozet(r));
  }

  // ── C: KARSI ORNEKLER ───────────────────────────────────────────────────
  const c1 = sor('DOĞALGAZ KÜRESEL VANA 1"', [GAZ_ADDA()], { variantTags: urunVariantTags(GAZ_ADDA()) });
  check('★ C gaz vanasi secip gaz satirina surukleme YAZILIR', c1.kind === 'auto-variant' && secilen(c1)[0]?.endsWith('@800'), ozet(c1));
  // Gaz bilgisi CINSTE olan urunun kendisi surukleniyor (M7: cins okunmazsa
  // dogru urun de onaya duserdi — ilk surumde bu senaryo yoktu, mutant yasadi)
  const c4 = sor('DOĞALGAZ KÜRESEL VANA 1"', [GAZ_CINSTE()],
    { variantTags: urunVariantTags(urun({ ad: 'Küresel Vana', cins: 'Doğalgaz Sarı Kollu', baglanti: 'Dişli', cap: '3/4"', price: 700 })) });
  check('C akiskan yalniz CINSTE yazili gaz vanasi surukleme ile yazilir (@800)',
    c4.kind === 'auto-variant' && secilen(c4)[0]?.endsWith('@800'), ozet(c4));
  const c2 = sor('DOĞALGAZ KÜRESEL VANA 1"', [GAZ_KATEGORIDE()], { variantTags: urunVariantTags(GAZ_KATEGORIDE()) });
  check('C akiskan yalniz KATEGORIDE yazili gaz vanasi da kabul (@820)',
    c2.kind === 'auto-variant' && secilen(c2)[0]?.endsWith('@820'), ozet(c2));
  // Sozluk akiskan kelimesini TUKETTIYSE kapi acilmaz (dogalgaz alias'i →
  // celik boru; satir sozlukten gecmis gibi ignoreTokens ile kurulur).
  const boru = urun({ ad: 'Siyah çelik boru', cins: 'siyah', cap: 'DN25', price: 120 });
  const c3 = sor('DOĞALGAZ BORUSU DN25', [boru], { variantTags: urunVariantTags(boru), ignoreTokens: ['dogalgaz'], hintFamily: 'boru' });
  check('★ C sozluk tukettiyse (dogalgaz borusu ← celik boru) surukleme YAZILIR',
    c3.kind === 'auto-variant' && secilen(c3)[0]?.endsWith('@120'), ozet(c3));

  console.log(`\n${'='.repeat(60)}\nK1 SURUKLEME AKISKAN: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
