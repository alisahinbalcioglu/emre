/**
 * B1 KILIDI — GOVDE MALZEMESI CINSE YONLENIYOR ("PE" ↔ "PE kapli")
 *   npx ts-node test/kaplama-cins-test.ts   (npm run test:kaplama-cins)
 *
 * ── OLCULEN KUSUR (04.10) ─────────────────────────────────────────────────
 * `line-parser.CINS_TANIMLAYICI` govde malzemesi kelimelerini de tasiyor
 * ('pe', 'pvc', 'ppr', 'hdpe', 'plastik'…). Satirdaki token, ailenin CINS
 * dagarciginda da geciyorsa CINS'e yonleniyor. Ama urun tarafinda ayni kelime
 * ADa indeksleniyor:
 *
 *   urun "PE Boru"   → adTokens ["pe","boru"]   cinsTokens ["sdr","11","pn","16"]
 *   urun "Çelik Boru"/"PE Kaplı Doğalgaz" → adTokens ["celik","boru"] cinsTokens ["pe","kapli",…]
 *
 * Satir "PE BORU Ø32" → 'pe' CINSe gider → havuzda CINSINDE 'pe' GECEN urun
 * aranir → PE KAPLI CELIK boru kazanir. Olculdu (iki urunlu havuz, celik
 * borunun capi satirla uyumlu):
 *   "PE BORU Ø32" → single · "Çelik Boru | PE Kaplı Doğalgaz @400"
 * Gercek PE boru (@60) hic TEKLIF EDILMIYOR; ustelik `single`, yani fiyat
 * OTOMATIK yaziliyor — 6,7 kat yanlis ve sessiz.
 *
 * ── MUHURLENEN KURAL ──────────────────────────────────────────────────────
 * Kural kelimeye degil, KAPLAMA OLUP OLMADIGINA baglidir (A1'in ikizi —
 * orada da "kaplama govde degildir"): GOVDE MALZEMESI kelimesi (pe/pvc/ppr/
 * pprc/pex/hdpe/polietilen/plastik) CINSe yalnizca hemen ardindan "kapl…"
 * geliyorsa yonlenir. YUZEY kelimeleri (siyah/galvaniz/celik/paslanmaz/
 * pirinc/dokum/bronz/bakir/boyali/kirmizi/wafer/lug) bugunku davranisini
 * AYNEN korur — 04.08'de "Basınçlı Boru Siyah Düz Uçlu" vakasi icin konmus
 * kural odur ve bozulmamalidir.
 *
 * ── KAPSAM (olculdu) ──────────────────────────────────────────────────────
 * Gercek Pimtas listesinde bu kelimeler YALNIZ urun ADinda geciyor, hic
 * cinste degil (paslanmaz 250 · pirinc 60 · siyah 30 · hdpe 30 · celik 6 ·
 * galvanizli 5 · pe 2), yani orada yeniden-yonlendirme HIC tetiklenmiyor.
 * Kusur havuzda AYNI kelimeyi hem ADINDA hem CINSINDE tasiyan urunler
 * birlikteyken dogar (PE kapli celik + PE boru) — Cayirova sinifi kutuphane.
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
const sor = (satir: string, havuz: IndexedRow[]) => runQuery(parseLine(satir), havuz, undefined) as any;
const secilen = (o: any): string[] =>
  (o.kind === 'ask' ? o.rows : o.kind === 'single' || o.kind === 'auto-variant' ? [o.row] : [])
    .map((r: any) => `${r.urun.ad}|${r.urun.cins ?? ''}@${r.listPrice}`);
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} → ${JSON.stringify(secilen(o))}`;

async function main() {
  // ── P: PE AILESI — govde PE vs KAPLAMA PE ───────────────────────────────
  // Celik borunun capi satirla UYUMLU (1 1/4" = dn32 ↔ Ø32 plastik dn32),
  // yoksa kusur `cap-yok` ile gizlenir (ilk olcumde oyle oldu).
  const P = [
    urun({ ad: 'Çelik Boru', cins: 'PE Kaplı Doğalgaz', cap: '1 1/4"', price: 400 }),
    urun({ ad: 'PE Boru', cins: 'SDR 11 PN 16', cap: '32 mm', price: 60 }),
  ];
  const p1 = sor('PE BORU Ø32', P);
  check('★ P "PE BORU Ø32" GERCEK PE borusunu bulur (kapli celigi DEGIL)',
    secilen(p1).length === 1 && secilen(p1)[0].includes('PE Boru') && secilen(p1)[0].endsWith('@60'), ozet(p1));
  const p2 = sor('PE BORU 32 mm', P);
  check('★ P mm yazimi da ayni sonucu verir', secilen(p2).some((x) => x.endsWith('@60')), ozet(p2));

  // KARSI: "PE KAPLI" ACIKCA yazilmissa kapli celik DOGRU cevaptir
  const p3 = sor('PE KAPLI ÇELİK BORU 1 1/4"', P);
  check('KARSI P "PE KAPLI ÇELİK BORU" kapli celigi bulur (@400)',
    secilen(p3).length === 1 && secilen(p3)[0].endsWith('@400'), ozet(p3));

  // ── Q: KAPLAMA ISTISNASININ YUK TASIDIGI VAKA ───────────────────────────
  // ⚠ Yukaridaki P3 karsi ornegi istisnayi OLCMUYOR: satirda "ÇELİK" gectigi
  // icin kapli celik zaten AD uzerinden kazaniyor (olculdu — istisnayi silen
  // mutantlar P3'te YASIYORDU). Istisna ancak satirda govde adi YOKKEN yuk
  // tasir: "PE KAPLI BORU" → 'pe' ADa gitseydi satirin AD kumesi {pe,boru}
  // olur, kapli urunun ADi yalniz {boru} oldugu icin ALT KUME tutmaz ve urun
  // ELENIR; 'pe' CINSe gidince dogru urun bulunur.
  const Q = [
    urun({ ad: 'Boru', cins: 'PE Kaplı Doğalgaz', cap: '1 1/4"', price: 400 }),
    urun({ ad: 'PE Boru', cins: 'SDR 11 PN 16', cap: '32 mm', price: 60 }),
  ];
  const q1 = sor('PE KAPLI BORU 1 1/4"', Q);
  // ⚠ KARAR SINIFI da assert edilir: istisna silinince SECILEN URUN AYNI
  // kaliyor (@400) ama sonuc `single` yerine `ask`e dusuyor — yani fiyat
  // otomatik yazilmiyor ve kullaniciya gereksiz soru aciliyor. Yalniz urune
  // bakan assert bu farki GORMUYORDU (mutant yasiyordu).
  check('★ Q "PE KAPLI BORU" (adinda celik YOK) kapli urunu OTOMATIK yazar (@400)',
    q1.kind === 'single' && secilen(q1)[0].endsWith('@400'), ozet(q1));
  // Ikizi: ayni havuzda govde satiri hala dogru urunu bulmali
  const q2 = sor('PE BORU Ø32', Q);
  check('★ Q ayni havuzda "PE BORU Ø32" govde PE borusunu bulur (@60)',
    secilen(q2).length === 1 && secilen(q2)[0].endsWith('@60'), ozet(q2));

  // ── V: PVC AILESI (ikinci aile — kural kelimeye ozel degil) ─────────────
  const V = [
    urun({ ad: 'Çelik Boru', cins: 'PVC Kaplı', cap: '1 1/4"', price: 500 }),
    urun({ ad: 'PVC Boru', cins: 'PN 10', cap: '32 mm', price: 70 }),
  ];
  const v1 = sor('PVC BORU Ø32', V);
  check('★ V "PVC BORU Ø32" GERCEK PVC borusunu bulur (@70)',
    secilen(v1).length === 1 && secilen(v1)[0].endsWith('@70'), ozet(v1));
  const v2 = sor('PVC KAPLI ÇELİK BORU 1 1/4"', V);
  check('KARSI V "PVC KAPLI" kapli celigi bulur (@500)',
    secilen(v2).length === 1 && secilen(v2)[0].endsWith('@500'), ozet(v2));

  // ── Y: YUZEY KELIMELERI — 04.08 kurali AYNEN korunur (REGRESYON KALKANI) ─
  // "Basınçlı Boru Siyah Düz Uçlu" vakasi: 'siyah' hem ADda hem CINSte gecer
  // ve CINSe yonlenmesi DOGRUDUR; havuz adinda 'siyah' yazan aileye
  // kilitlenmemeli.
  const Y = [
    urun({ ad: 'Basınçlı Boru Siyah Düz Uçlu', cins: 'Et 2.5mm', cap: '1 1/4"', price: 300 }),
    urun({ ad: 'Boru', cins: 'Siyah Düz Uçlu', cap: '2"', price: 350 }),
  ];
  const y1 = sor('SİYAH BORU 2"', Y);
  check('Y yuzey kelimesi ("siyah") CINSe yonlenmeye DEVAM eder → 2" bulunur',
    secilen(y1).some((x) => x.endsWith('@350')), ozet(y1));

  // ── K: 'pe' CINSTE OLMAYAN havuzda da dogru calisir (tek urun) ──────────
  const K = [urun({ ad: 'PE Boru', cins: 'SDR 11 PN 16', cap: '32 mm', price: 60 })];
  const k1 = sor('PE BORU Ø32', K);
  check('K tek PE urunlu havuzda eskisi gibi tek eslesme', k1.kind === 'single', ozet(k1));

  console.log(`\n${'='.repeat(60)}\nB1 KAPLAMA/CINS: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
