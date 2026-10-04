/**
 * L1 KILIDI — BAYAT INDEKSLI ISCILIK KALEMI CAPINI KAYBEDIYOR
 *   npx ts-node test/iscilik-bayat-indeks-test.ts   (npm run test:iscilik-bayat)
 *
 * ── OLCULEN KUSUR (01.10) ─────────────────────────────────────────────────
 * Ayni kalemi indeksleyen IKI yol `kolonlu` kararini FARKLI oluta baglamis:
 *
 *   reindexLabor (kalici)      : kolonlu = cins || baglanti || capRaw || boyMm
 *                                → "KAYNAK SUTUNU VAR MI"
 *   hazirlaLaborPool (istek)   : kolonlu = adSlug && adBucket
 *                                → "HIC INDEKSLENMIS MI"
 *
 * Capi ADINDA tasiyan ("… DN 50"), cap SUTUNU bos bir iscilik kalemi:
 *   · hic indekslenmemisse → hazirlaLaborPool yol-3'e duser, cap ADDAN okunur ✔
 *   · indekslenmis ama surumu BAYATSA → "kolonlu" sayilir, cap BOS kolondan
 *     okunur ve DUSER → satirdaki "DN 50" eslesmez ✘
 *
 * ── NEDEN SIMDI KRITIK ────────────────────────────────────────────────────
 * Bayat dal YALNIZ `indexVersion !== INDEX_VERSION` iken kosar. Bugun canlida
 * surumler esit oldugu icin kusur UYUYOR. INDEX_VERSION artirildigi AN (A1
 * olcu sinifi duzeltmesi bunu gerektiriyor) butun indeksli iscilik kalemleri
 * bu dala duser ve yeniden indeksleme kosana dek capla eslesmez.
 *
 * ── OLCUM BICIMI ──────────────────────────────────────────────────────────
 * A/B: AYNI kalem, tek fark indeks alanlarinin VARLIGI. Kontrol (indekssiz)
 * YESIL olmali — kirmizi olsaydi kusur baska yerde olurdu ve bu kapi kor
 * kalirdi. Karsi ornek: cap SUTUNU dolu bayat kalem bugun de dogru calisiyor,
 * duzeltmeden sonra da calismali (bayat dal busbutun kaldirilmasin).
 */

import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { INDEX_VERSION } from '../src/ozellik/eslestirme/matching/index/product-index';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** hazirlaLaborPool prisma'ya DOKUNMAZ — servis bos bagimliliklarla kurulur. */
const svc = new MatchingService(null as any, null as any, null as any);
const havuzla = (items: any[]) => (svc as any).hazirlaLaborPool(items) as any[];

/** LaborPrice(+laborItem) sekli. `indeksli` → adSlug/adBucket dolu. */
function kalem(o: { ad: string; capRaw?: string | null; cins?: string | null; indeksli: boolean; surum?: number }) {
  return {
    id: 'lp-1', unitPrice: 100, discountRate: 0, currency: 'TRY', unit: 'adet',
    laborItem: {
      id: 'li-1', name: o.ad, unitPrice: 100, unit: 'adet', category: null,
      cins: o.cins ?? null, baglanti: null, capRaw: o.capRaw ?? null, boyMm: null, not: null,
      // Indeks alanlari: "hic indekslenmis mi" olcutu bunlara bakiyor
      adSlug: o.indeksli ? 'montaj' : null, adBucket: o.indeksli ? 'montaj' : null,
      adTokens: [], cinsNorm: null, cinsTokens: [], baglantiNorm: null, baglantiTokens: [],
      sizeClass: 'unknown', capTags: [], capNorm: null, malzemeler: [], aileZayif: false,
      boyTag: null, displayName: o.ad, belirsiz: false,
      indexVersion: o.surum ?? INDEX_VERSION,
    },
  };
}

const capTags = (p: any[]) => (p[0]?.urun?.capTags ?? []) as string[];
const BAYAT = INDEX_VERSION - 1;
const AD = 'Siyah Çelik Boru DN 50 montajı';

async function main() {
  // ── KONTROL: hic indekslenmemis kalem — cap ADDAN okunur (bugun YESIL) ───
  const indekssiz = havuzla([kalem({ ad: AD, indeksli: false })]);
  check('KONTROL indekssiz kalem → capTags dn50 TASIR (yol-3, addan)',
    capTags(indekssiz).includes('dn50'), `capTags=${JSON.stringify(capTags(indekssiz))}`);

  // ── OLCUM: AYNI kalem, yalnizca indeks alanlari dolu + surum BAYAT ───────
  const bayat = havuzla([kalem({ ad: AD, indeksli: true, surum: BAYAT })]);
  check('★ BAYAT indeksli kalem → capTags dn50 TASIR (ikizle AYNI kural)',
    capTags(bayat).includes('dn50'), `capTags=${JSON.stringify(capTags(bayat))}`);

  // Ayni sonuc: iki yol AYNI kalemde AYNI capi uretmeli (ikiz sozlesmesi)
  check('★ IKIZ: indekssiz ve bayat yol AYNI capTags uretir',
    JSON.stringify(capTags(indekssiz).slice().sort()) === JSON.stringify(capTags(bayat).slice().sort()),
    `indekssiz=${JSON.stringify(capTags(indekssiz))} bayat=${JSON.stringify(capTags(bayat))}`);

  // ── KARSI ORNEK: cap SUTUNU dolu bayat kalem — kolon OTORITE kalmali ─────
  const kolonlu = havuzla([kalem({ ad: 'Boru montajı', capRaw: 'DN 80', indeksli: true, surum: BAYAT })]);
  check('KARSI kolonlu bayat kalem → capTags dn80 (kolon otorite, bayat dal YASIYOR)',
    capTags(kolonlu).includes('dn80'), `capTags=${JSON.stringify(capTags(kolonlu))}`);

  // ── KARSI: SUTUN VAR ama CAP SUTUNU YOK (cins dolu) ─────────────────────
  // `kolonlu` olcutu ikizin TAMAMI olmali: cins/baglanti/boyMm de sutundur.
  // Yalniz `capRaw`a bakilsaydi cins'li kalem yol-3'e duser, cap ADDAN okunur
  // ve istek yolu ikizden YINE ayrisirdi (kalicida `rebuildIndexFields`
  // kosar, cap bos kolondan gelir).
  // ⚠ ACIK SORU (bu kapinin kapsami DISI): ikizin kendisi de bu kalemde capi
  // ADDAN okumuyor — "cins dolu ama cap bos" kaleminin capi dusuyor. Burada
  // muhurlenen sey IKI YOLUN AYNI DAVRANMASI; kuralin KENDISI ayri bulgu.
  const cinsli = havuzla([kalem({ ad: AD, cins: 'Siyah', indeksli: true, surum: BAYAT })]);
  check('KARSI cins dolu (cap sutunu bos) → ikizle ayni dala gider (dn50 YOK)',
    !capTags(cinsli).includes('dn50'), `capTags=${JSON.stringify(capTags(cinsli))}`);

  // Cap hem ADDA hem KOLONDA ise KOLON kazanir (manuelUrunIndeksle'nin kurali)
  const ikisi = havuzla([kalem({ ad: AD, capRaw: 'DN 80', indeksli: true, surum: BAYAT })]);
  check('KARSI ad DN50 + kolon DN80 → kolon kazanir (dn80, dn50 YOK)',
    capTags(ikisi).includes('dn80') && !capTags(ikisi).includes('dn50'),
    `capTags=${JSON.stringify(capTags(ikisi))}`);

  // ── GUNCEL SURUM dokunulmaz: saklanan alanlar AYNEN kullanilir ───────────
  const guncel = havuzla([kalem({ ad: AD, indeksli: true })]);
  check('GUNCEL surum → saklanan capTags aynen (bos) — yeniden uretilmez',
    capTags(guncel).length === 0, `capTags=${JSON.stringify(capTags(guncel))}`);

  // ── UYARI: isletmeci "yeniden indeksle" gerektigini BU satirdan ogrenir ──
  // Sutunsuz bayat kalem yol-3'e duser; "indekssiz" sayilsaydi uyari HIC
  // basilmaz ve deploy sonrasi kimse reindex gerektigini bilmezdi (sessiz
  // bozulma). Sayac kozmetik DEGIL — tek operasyonel sinyal.
  const uyarilar: string[] = [];
  const eskiWarn = console.warn;
  console.warn = (...a: unknown[]) => { uyarilar.push(a.map(String).join(' ')); };
  try { havuzla([kalem({ ad: AD, indeksli: true, surum: BAYAT })]); } finally { console.warn = eskiWarn; }
  check('★ UYARI sutunsuz bayat kalem BAYAT sayilir (reindex onerisi basilir)',
    uyarilar.some((u) => /ISCILIK BAYAT INDEKS: 1 kalem/.test(u)),
    `uyarilar=${JSON.stringify(uyarilar)}`);

  // KARSI: gercekten indekssiz kalem bayat SAYILMAZ (uyari kor degil)
  const uyari2: string[] = [];
  const eskiWarn2 = console.warn;
  console.warn = (...a: unknown[]) => { uyari2.push(a.map(String).join(' ')); };
  try { havuzla([kalem({ ad: AD, indeksli: false })]); } finally { console.warn = eskiWarn2; }
  check('KARSI gercek indekssiz kalem BAYAT sayilmaz',
    !uyari2.some((u) => /ISCILIK BAYAT INDEKS/.test(u)), `uyarilar=${JSON.stringify(uyari2)}`);

  console.log(`\n${'='.repeat(60)}\nL1 ISCILIK BAYAT INDEKS: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
