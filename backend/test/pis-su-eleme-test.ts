/**
 * KARAR (a) KILIDI — PIS SU / GIDER BORUSU = PVC; PP / PPR / PPR-C ELENIR
 *   npx ts-node test/pis-su-eleme-test.ts   (npm run test:pis-su-eleme)
 *
 * ── KARAR ─────────────────────────────────────────────────────────────────
 * Emre (04.08 canli vaka, 30.09 YENIDEN TEYIT): "pissu - pis su - gider
 * borusu - PVC borulardir. PP boru onerme." · "pis su = PVC, PP/PPR (PPR-C)
 * elenir. dogrusu bu". Aday listesine BILE girmez — siralanmaz, ELENIR.
 *
 * ── OLCULEN SAPMA (04.10, servis duzeyi, gercek sozluk) ───────────────────
 *   "PİS SU BORUSU Ø110"  | [PP-R, PPR-C, PP-HT, PVC, HDPE, etiketsiz]
 *        → multi [PVC, HDPE, PP-R, PPR-C, PP-HT]   (PP ailesi SONDA ama LISTEDE)
 *   "PİS SU BORUSU DN 110"| [PP-R] → multi [PP-R]   (tek secenek PP)
 *   "GİDER BORUSU Ø110"   | [PVC, PP-HT, Siyah celik DN100]
 *        → multi [PVC, PP-HT, Siyah celik]          ('gider' sozlukte YOKTU)
 * S5 (16.07) bunu BILEREK "siralar, elemez" diye kurmustu; s45 A1c/A2a o
 * sapmayi kilitliyordu. Test kurala gore duzeltildi, kod teste gore degil.
 *
 * ── KURAL ─────────────────────────────────────────────────────────────────
 * Sozluk girisi `canonical` ile anahtarli bir RET kumesi tasir
 * (`terminology.service.SOZLUK_MALZEME_RETTI`): pis_su_borusu → pp, ppr.
 * Malzemesi YALNIZ bu kumeden olan aday (PP, PP-R, PPR-C, PP-HT...) elenir.
 *   · Anahtar `canonical`: `loadAliases` DB satirini alan alan esler — seed
 *     sabitine eklenen yeni bir alan uretimde KAYBOLURDU (test gecer, canli
 *     kirik). `canonical` DB'de vardir.
 *   · Etiketsiz aday KALIR (etiketsizlik kanit degil — S5 ile ayni esik).
 *   · Karisik etiketli aday (pvc + pp) KALIR — malzemesi yalniz PP degil.
 *   · SATIR KAZANIR (T3/T5): satirda malzeme ACIKCA yaziliysa ("PP PİS SU
 *     BORUSU") ret uygulanmaz — kullanicinin yazdigi kelime serttir.
 *   · SURUKLEME RETTI SUSTURMAZ: E1 (`sozlukSusar`) yalniz sozlugun
 *     VARSAYIMINI susturur (kendi yorumu: "sert filtreler AYNEN durur").
 *     "Temiz su → PPR" varsayimdir; "pis suda PP elenir" sert rettir.
 *   · Boru disi aileler etkilenmez: E8 korumasi, satirin kendi ailesi
 *     (pompa, suzgec...) sozlugun ailesinden (boru) farkliysa alias'i hic
 *     uygulamaz (olculdu: pis su dalgic pompasinda PP govdeli pompa kalir).
 *   · 'gider' esanlamlisi YALNIZ boru bicimiyle ('gider boru', 'gider hatt'):
 *     cipla 'gider' lavabo gideri / sifon satirlarina pis su borusu ailesi
 *     dayatirdi.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
const { TerminologyService, ALIAS_SEEDS, SOZLUK_MALZEME_RETTI } = require('../src/ozellik/eslestirme/matching/terminology.service');

let n = 0;
/** UserLibrary satiri (Prisma include:{product} sekli) — uretim indeksleyicisiyle */
function lib(c: ProductColumns) {
  const idx = buildProductIndex(c);
  n++;
  return {
    id: `lib-${n}`, materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: `pi-${n}`,
    product: { ...idx, id: `pi-${n}`, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null,
      kategori: c.kategori ?? null, boyMm: null, urunKodu: null, sheetName: 'S1', price: c.price, birim: null },
  };
}
/**
 * ⚠ Sahte DB, URETIMIN DB'den okudugu ALANLARI dondurur — `loadAliases`in
 * esledigi alanlarin otesinde hicbir sey tasimaz. Seed sabitini oldugu gibi
 * yaymak (s45'in yaptigi) yeni bir seed alaninin uretimde kayboldugunu GIZLER.
 */
function svc(rows: any[]) {
  const dbSatiri = (s: any, i: number) => ({ id: `a${i}`, userId: null, active: true,
    alias: s.alias, canonical: s.canonical, kinds: s.kinds, impliedType: s.impliedType,
    sizeClass: s.sizeClass, stripTags: s.stripTags });
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : rows) },
    brand: { findUnique: async () => ({ name: 'TEST' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map(dbSatiri) },
  };
  const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'f', date: '' }) };
  return new MatchingService(prisma, new TerminologyService(prisma), fx);
}
const sor = async (havuz: ProductColumns[], q: string, variantTags?: string[]) =>
  (await svc(havuz.map(lib)).bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', [q], variantTags))[q];
const adaylar = (r: any): string[] => (r?.candidates ?? []).map((c: any) => `${c.materialName}@${c.listPrice}`);
const ozet = (r: any) => `${r?.confidence} net=${r?.netPrice} ${JSON.stringify(adaylar(r))}`;
const PP_AILESI = /PP-R|PPR|PP-HT|PP atık/;

const PVC: ProductColumns = { kategori: 'Pis Su', ad: 'PVC atık su borusu', cins: 'PVC-U', cap: '110 mm', price: 300 } as any;
const PPR: ProductColumns = { kategori: 'Tesisat', ad: 'PP boru', cins: 'PP-R', cap: '110 mm', price: 500 } as any;
const PPRC: ProductColumns = { kategori: 'Tesisat', ad: 'PPR-C boru', cins: 'PN 20', cap: '110 mm', price: 510 } as any;
const PPHT: ProductColumns = { kategori: 'Pis Su', ad: 'PP atık su borusu', cins: 'PP-HT', cap: '110 mm', price: 280 } as any;
const HDPE: ProductColumns = { kategori: 'Pis Su', ad: 'HDPE boru', cins: 'PE 100', cap: '110 mm', price: 400 } as any;
// ETIKETSIZ: plastik SINIFTA ama malzeme ETIKETI yok ('plastik' sinif verir,
// `malzemeEtiketleri` vermez). ⚠ Ilk fikstur cinsi 'SN4' idi: malzeme sinyali
// olmayan boru `resolveProductSizeClass`ta STEEL'e duser (boru/vana/fitting
// varsayilani, olculdu: 110 mm → dn100) ve pis su satirinin SINIF suzgecinde
// zaten eleniyordu — "etiketsiz kalir" assert'i hic sinanmiyordu.
const ETIKETSIZ: ProductColumns = { kategori: 'Pis Su', ad: 'Atık su borusu', cins: 'Plastik SN4', cap: '110 mm', price: 250 } as any;
const SIYAH: ProductColumns = { kategori: 'Tesisat', ad: 'Siyah çelik boru', cins: 'siyah', cap: 'DN100', price: 900 } as any;
const PEX: ProductColumns = { kategori: 'Tesisat', ad: 'PEX boru', cins: 'PEX-B', cap: '110 mm', price: 450 } as any;

async function main() {
  // ── O: OLCUT — kural verisi yerinde mi ──────────────────────────────────
  const pisSu = ALIAS_SEEDS.find((s: any) => s.alias === 'pis su');
  check('O ret kumesi pis su canonical\'ina bagli (pp, ppr)',
    JSON.stringify(SOZLUK_MALZEME_RETTI?.[pisSu?.canonical]) === '["pp","ppr"]',
    `canonical=${pisSu?.canonical} ret=${JSON.stringify(SOZLUK_MALZEME_RETTI?.[pisSu?.canonical])}`);
  for (const a of ['gider boru', 'gider hatt']) {
    const s = ALIAS_SEEDS.find((x: any) => x.alias === a);
    check(`O sozlukte "${a}" pis su girisi olarak var`, s?.canonical === pisSu?.canonical, `got ${JSON.stringify(s)}`);
  }
  check('O cipla "gider" alias DEGIL (lavabo gideri / sifon korunur)',
    !ALIAS_SEEDS.some((x: any) => x.alias === 'gider'));

  // ── E: PIS SU — PP ailesi ELENIR, digerleri KALIR ───────────────────────
  const e1 = await sor([PPR, PPRC, PPHT, PVC, HDPE, ETIKETSIZ], 'PİS SU BORUSU Ø110');
  check('★ E PIS SU: PP-R, PPR-C, PP-HT listede YOK', !adaylar(e1).some((a) => PP_AILESI.test(a)), ozet(e1));
  check('E PIS SU: PVC, HDPE ve malzemesi etiketsiz aday KALIR (etiketsizlik kanit degil)',
    adaylar(e1).length === 3 && ['PVC', 'HDPE', 'Atık su borusu · Plastik SN4'].every((k) => adaylar(e1).some((a) => a.includes(k))), ozet(e1));
  check('E PIS SU: beklenen malzeme (PVC) basta (S5 siralamasi surer)', /PVC/.test(adaylar(e1)[0] ?? ''), ozet(e1));

  const e2 = await sor([PPR], 'PİS SU BORUSU DN 110');
  check('★ E PIS SU + havuzda yalniz PP-R → aday YOK, fiyat yazilmaz',
    e2?.confidence === 'none' && adaylar(e2).length === 0 && e2?.netPrice === 0, ozet(e2));
  // ⚠ Ilk yazimda yalniz /pvc/ ariyordum: duzeltmeden ONCE de geciyordu (S5
  // celiski notu da "pvc" icerir). Kullanicinin gorecegi cumleye baglandi.
  check('E PIS SU yalniz PP: mesaj "bu markada pvc tasiyan urun yok" der',
    /Bu markada ".*pvc.*" taşıyan ürün yok/i.test(e2?.reason ?? ''), `reason=${JSON.stringify(e2?.reason)}`);
  const e3 = await sor([PPHT], 'PİS SU BORUSU DN 110');
  check('E PIS SU + yalniz PP-HT (PP\'nin baska yazimi) → elenir', e3?.confidence === 'none' && adaylar(e3).length === 0, ozet(e3));

  // ── G: GIDER BORUSU — esanlamli ─────────────────────────────────────────
  const g1 = await sor([PVC, PPHT, SIYAH], 'GİDER BORUSU Ø110');
  check('★ G "GİDER BORUSU": yalniz PVC (PP ve celik yok) ve fiyat yazilir',
    g1?.confidence === 'high' && g1?.netPrice === 300, ozet(g1));
  const g2 = await sor([PVC, PPR], 'GİDER BORULARI 110 mm');
  check('G "GİDER BORULARI" cogulu da pis su: PVC yazilir', g2?.confidence === 'high' && g2?.netPrice === 300, ozet(g2));
  const g3 = await sor([PVC, PPR], 'GİDER HATTI BORUSU 110 mm');
  check('G "GİDER HATTI" da pis su: PVC yazilir', g3?.confidence === 'high' && g3?.netPrice === 300, ozet(g3));

  // ── A: AYNI KURAL DIGER YAZIMLARDA (ayni canonical) ─────────────────────
  for (const q of ['PİSSU BORUSU 110 mm', 'ATIK SU BORUSU 110 mm', 'KANALİZASYON BORUSU 110 mm']) {
    const r = await sor([PVC, PPHT, PPR], q);
    check(`A "${q}": PP ailesi elenir, PVC yazilir`, r?.confidence === 'high' && r?.netPrice === 300, ozet(r));
  }

  // ── K: KARSI ORNEKLER ───────────────────────────────────────────────────
  const k1 = await sor([PVC, PPHT], 'PP PİS SU BORUSU 110 mm');
  check('★ K satir PP YAZIYORSA satir kazanir (PP-HT yazilir)', k1?.confidence === 'high' && k1?.netPrice === 280, ozet(k1));
  const k2 = await sor([PVC, PPHT], 'PVC PİS SU BORUSU 110 mm');
  check('K satir PVC yaziyorsa PVC yazilir', k2?.confidence === 'high' && k2?.netPrice === 300, ozet(k2));
  const k3 = await sor([PVC, PPR], 'TEMİZ SU BORUSU 110 mm');
  check('★ K TEMIZ SU etkilenmez: PP-R listede ve basta', /PP-R/.test(adaylar(k3)[0] ?? ''), ozet(k3));
  const k4 = await sor([PVC, PPR], 'HİDRANT HATTI BORUSU DN 110');
  check('K HIDRANT etkilenmez: ret yalniz pis su girisinin (PP-R listede kalir)', adaylar(k4).some((a) => /PP-R/.test(a)), ozet(k4));
  // Ret YALNIZ pp/ppr: kuralin disindaki cakisan plastik SIRALANIR, elenmez
  const k5 = await sor([PEX, PVC], 'PİS SU BORUSU DN 110');
  check('K PIS SU + PEX: ret kumesi disindaki malzeme ELENMEZ, sona siralanir',
    adaylar(k5).length === 2 && /PVC/.test(adaylar(k5)[0]) && /PEX/.test(adaylar(k5)[1]), ozet(k5));
  const pompaPP: ProductColumns = { kategori: 'Pompa', ad: 'Pis su dalgıç pompası', cins: 'PP gövde', cap: 'DN50', price: 7000 } as any;
  const pompaDokum: ProductColumns = { kategori: 'Pompa', ad: 'Pis su dalgıç pompası', cins: 'döküm gövde', cap: 'DN50', price: 9000 } as any;
  const k6 = await sor([pompaPP, pompaDokum], 'PİS SU DALGIÇ POMPASI DN 50');
  check('★ K boru disi aile (pompa) etkilenmez: PP govdeli pompa listede',
    adaylar(k6).length === 2 && adaylar(k6).some((a) => a.includes('@7000')), ozet(k6));

  // ── D: SURUKLEME RETTI SUSTURMAZ ────────────────────────────────────────
  // Kullanici temiz su satirinda PP-R secip asagi surukluyor, yol pis su
  // satirindan geciyor: o satira PP-R YAZILMAZ.
  // D0 FIXTURE KANITI: ayni etiketler sozluksuz satirda PP-R'yi GERCEKTEN
  // otomatik yazar — yoksa D1 surukleme yolu hic kosmadan gecerdi.
  const d0 = await sor([PVC, PPR], 'BORU 110 mm', ['ad:pp boru', 'cins:pp-r']);
  check('D0 fixture: surukleme etiketleri sozluksuz satirda PP-R yazar (yol kosuyor)', d0?.netPrice === 500, ozet(d0));
  const d1 = await sor([PVC, PPR], 'PİS SU BORUSU 110 mm', ['ad:pp boru', 'cins:pp-r']);
  check('★ D surukleme (variantTags) pis su satirina PP-R YAZDIRAMAZ',
    !(d1?.netPrice === 500) && !adaylar(d1).some((a) => /PP-R/.test(a)), ozet(d1));

  // ── M: MOTOR SOZLESMESI (sozluksuz, saf) ────────────────────────────────
  const prod = (c: ProductColumns) => { const l: any = lib(c); return { ...l, urun: l.product }; };
  const ham: any = runQuery(parseLine('BORU 110 mm'), [prod(PPR), prod(PVC)], { hintMalzemeEle: ['pp', 'ppr'] } as any);
  check('M motor: hintMalzemeEle yalniz PP ailesini eler', ham.kind === 'single' && /PVC/.test(ham.row?.urun?.ad ?? ''),
    `got ${ham.kind} ${ham.row?.urun?.ad ?? JSON.stringify(ham.rows?.map((r: any) => r.urun.ad))}`);
  const karisik: ProductColumns = { kategori: 'Pis Su', ad: 'PVC/PP geçiş borusu', cins: null, cap: '110 mm', price: 333 } as any;
  const km: any = runQuery(parseLine('BORU 110 mm'), [prod(karisik)], { hintMalzemeEle: ['pp', 'ppr'] } as any);
  check('M karisik etiketli (pvc+pp) aday ELENMEZ', km.kind !== 'none', `got ${km.kind}`);

  console.log(`\n${'='.repeat(60)}\nKARAR (a) PIS SU ELEME: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
