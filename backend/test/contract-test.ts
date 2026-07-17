/**
 * SOZLESME DONDURMA — Motor Dis Yuzeyi (F0b)
 *   npx ts-node test/contract-test.ts   (npm run test:contract)
 *
 * AMAC: Indeksli + Ad-kilitli TEK motor yeniden yazimi boyunca, frontend'in
 * ve testlerin BAGLI OLDUGU dis yuzey kirilirsa HEMEN yakalansin.
 *
 * Bu dosya DAVRANIS test etmez (o spec-regression-test.ts'in isi) — SEKIL
 * test eder: hangi alan var, tipi ne, hangi degeri tasimak zorunda.
 *
 * Her iddianin yaninda o alani TUKETEN frontend satiri yazilidir. Bir alan
 * burada kirilirsa, orada bir ozellik SESSIZCE susar.
 *
 * KURAL: v2 motor bu dosyayi DEGISTIRMEDEN gecmek zorundadir. Bu dosyayi
 * gevsetmek = sozlesmeyi bozmak. Once burayi oku, sonra motoru degistir.
 */

import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/modules/matching/terminology.service';
import type { MatchResult, MatchCandidate, BrandAlternative } from '../src/modules/matching/types';

function lib(name: string, price: number) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0 };
}

function fakePrisma(brandName: string, libRows: any[], otherBrandRows: any[] = []): any {
  const memStore = new Map<string, any>();
  const memKey = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  return {
    userLibrary: {
      findMany: async (args: any) => {
        const b = args?.where?.brandId;
        if (b && typeof b === 'object' && 'not' in b) return otherBrandRows;
        return libRows;
      },
    },
    brand: { findUnique: async () => ({ name: brandName }) },
    eslesmeHafizasi: {
      findUnique: async ({ where }: any) => memStore.get(memKey(where)) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const k = memKey(where);
        const ex = memStore.get(k);
        if (ex) { ex.secilenAd = update.secilenAd ?? ex.secilenAd; ex.secimSayisi++; }
        else memStore.set(k, { ...create, secimSayisi: 1 });
      },
    },
    terminologyAlias: {
      findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })),
    },
  };
}

// C0: CONSTRUCTOR SOZLESMESI — (prisma, TerminologyService, ExchangeRatesService)
// DI container YOK, saf positional constructor. spec-regression-test.ts:54 ve
// matching-unit-test.ts bu sirayla dogrudan new'liyor.
function makeService(brandName: string, libRows: any[], otherBrandRows: any[] = []): MatchingService {
  const prisma = fakePrisma(brandName, libRows, otherBrandRows);
  const term = new TerminologyService(prisma);
  const fakeFx = {
    getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }),
  } as any;
  return new MatchingService(prisma, term, fakeFx);
}

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const isNum = (v: any) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: any) => typeof v === 'string';
const CONFIDENCE_VALUES = ['high', 'suggestion', 'medium', 'low', 'none', 'multi'];

/** MatchResult'in HER sonucta tasimak zorunda oldugu alanlar */
function assertResultShape(tag: string, r: MatchResult | undefined) {
  check(`${tag}: MatchResult donuyor`, !!r, `got ${JSON.stringify(r)}`);
  if (!r) return;
  // page.tsx:1447 → netPrice > 0 && confidence in ('high','suggestion') ile YAZAR
  check(`${tag}: netPrice number`, isNum(r.netPrice), `got ${typeof r.netPrice}`);
  check(`${tag}: listPrice number`, isNum(r.listPrice), `got ${typeof r.listPrice}`);
  check(`${tag}: discount number`, isNum(r.discount), `got ${typeof r.discount}`);
  check(`${tag}: confidence gecerli deger`, CONFIDENCE_VALUES.includes(r.confidence), `got "${r.confidence}"`);
}

/** MatchCandidate'in HER adayda tasimak zorunda oldugu alanlar */
function assertCandidateShape(tag: string, c: MatchCandidate | undefined) {
  if (!c) { check(`${tag}: aday var`, false, 'aday yok'); return; }
  check(`${tag}: materialName string`, isStr(c.materialName), `got ${typeof c.materialName}`);   // ExcelGrid.tsx:476,498
  check(`${tag}: netPrice number`, isNum(c.netPrice), `got ${typeof c.netPrice}`);               // ExcelGrid.tsx:477,526
  check(`${tag}: listPrice number`, isNum(c.listPrice), `got ${typeof c.listPrice}`);
  check(`${tag}: discount number`, isNum(c.discount), `got ${typeof c.discount}`);
  check(`${tag}: tags dizi`, Array.isArray(c.tags), `got ${typeof c.tags}`);                     // ExcelGrid.tsx:358 (S4 alias onerisi)
  check(`${tag}: popular boolean`, typeof c.popular === 'boolean', `got ${typeof c.popular}`);   // ExcelGrid.tsx:524 (★)
  check(`${tag}: label string DOLU`, isStr(c.label) && c.label.length > 0, `got "${c.label}"`);  // ExcelGrid.tsx:487-492 — stage2 gruplamasinin TEK anahtari
  check(`${tag}: surfaceLevel boolean`, typeof c.surfaceLevel === 'boolean', `got ${typeof c.surfaceLevel}`);
}

/** BrandAlternative (M3 popup) sekli — ExcelGrid.tsx:586-620 */
function assertAlternativeShape(tag: string, a: BrandAlternative | undefined) {
  if (!a) { check(`${tag}: alternatif var`, false, 'alternatif yok'); return; }
  check(`${tag}: brandId string`, isStr(a.brandId), `got ${typeof a.brandId}`);
  check(`${tag}: brandName string`, isStr(a.brandName), `got ${typeof a.brandName}`);
  check(`${tag}: materialName string`, isStr(a.materialName), `got ${typeof a.materialName}`);
  check(`${tag}: netPrice number`, isNum(a.netPrice), `got ${typeof a.netPrice}`);
}

async function run() {
  // ══ C1: bulkMatch IMZASI — 4. ve 5. param OPSIYONEL ═══════════════════
  // page.tsx:889 (prefetch) ve :496 (restore re-match) yalnizca 3 argumanla
  // cagiriyor. Opsiyonelligi kaybedersek O IKI YOL PATLAR.
  {
    const svc = makeService('AYVAZ', [lib('Yaylı Çekvalf DN50', 1250)]);
    const r3 = await svc.bulkMatch('u1', 'brand-1', ['ÇEKVALF DN 50']);
    check('C1 bulkMatch 3 argumanla calisir (page.tsx:889/496)', !!r3['ÇEKVALF DN 50'], `got ${JSON.stringify(r3)}`);

    const r4 = await svc.bulkMatch('u1', 'brand-1', ['ÇEKVALF DN 50'], []);
    check('C1 bulkMatch 4 argumanla calisir', !!r4['ÇEKVALF DN 50']);

    const r5 = await svc.bulkMatch('u1', 'brand-1', ['ÇEKVALF DN 50'], [], { 'ÇEKVALF DN 50': 'adet' });
    check('C1 bulkMatch 5 argumanla calisir (units)', !!r5['ÇEKVALF DN 50']);

    // Donus tipi: Record<materialName, MatchResult> — page.tsx:1723 anahtarla okuyor
    check('C1 donus Record<name, MatchResult>', Object.keys(r3)[0] === 'ÇEKVALF DN 50', `got keys ${JSON.stringify(Object.keys(r3))}`);
    check('C1 bos liste bos obje doner', Object.keys(await svc.bulkMatch('u1', 'brand-1', [])).length === 0);
  }

  // ══ C2: TEK ESLESME sekli (high) ══════════════════════════════════════
  {
    const svc = makeService('AYVAZ', [lib('Yaylı Çekvalf DN50', 1250)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['ÇEKVALF DN 50']))['ÇEKVALF DN 50'];
    assertResultShape('C2 single', r);
    check('C2 matchedName dolu (page.tsx:1723 okur)', isStr(r?.matchedName) && (r?.matchedName?.length ?? 0) > 0, `got "${r?.matchedName}"`);
    check('C2 reason "Tek eşleşme" tasir (R18 asserti)', !!r?.reason?.includes('Tek eşleşme'), `got "${r?.reason}"`);
    check('C2 yazilabilir: netPrice>0 && confidence high|suggestion (page.tsx:1447)',
      (r?.netPrice ?? 0) > 0 && ['high', 'suggestion'].includes(r?.confidence ?? ''), `got ${r?.confidence} net=${r?.netPrice}`);
  }

  // ══ C3: ALTIN KURAL — multi/none'da netPrice ISTISNASIZ 0 ═════════════
  // Bu, tum sistemin en kritik degismezi: fiyat SORULMADAN YAZILMAZ.
  {
    const svc = makeService('ÇAYIROVA', [
      lib('Sprinkler Borusu Kırmızı Boyalı 2"', 227.1),
      lib('Sprinkler Borusu Düz Uçlu 2"', 198.4),
    ]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 50']))['SPRİNK HATTI BORULARI DN 50'];
    assertResultShape('C3 multi', r);
    check('C3 multi → netPrice === 0 (ALTIN KURAL)', r?.confidence === 'multi' && r?.netPrice === 0,
      `got ${r?.confidence} net=${r?.netPrice}`);
    check('C3 multi → candidates dizisi dolu', (r?.candidates?.length ?? 0) >= 2, `got ${r?.candidates?.length}`);
    check('C3 multi YAZILAMAZ (page.tsx:1447 kosulu saglanmaz)',
      !((r?.netPrice ?? 0) > 0 && ['high', 'suggestion'].includes(r?.confidence ?? '')));

    // ══ C4: MatchCandidate sekli — HER aday tam olmali
    for (const c of r?.candidates ?? []) assertCandidateShape(`C4 aday "${c.materialName.slice(0, 24)}"`, c);
    // label stage2'nin gruplama anahtari — bos/undefined ise popup coker
    check('C4 tum adaylarda label DOLU', (r?.candidates ?? []).every((c) => isStr(c.label) && c.label.length > 0),
      `got ${JSON.stringify(r?.candidates?.map((c) => c.label))}`);
  }

  // ══ C5: variantTags OPAK round-trip + autoVariant/variantMissing ══════
  // FE variantTags'i HIC YORUMLAMAZ (ExcelGrid.tsx:375-376): backend'den alir,
  // aynen geri gonderir. Tag sozlugu tamamen degisebilir; round-trip tutmali.
  {
    const svc = makeService('ÇAYIROVA', [
      lib('Sprinkler Borusu Kırmızı Boyalı 1"', 105.9),
      lib('Sprinkler Borusu Dişli 1"', 112.7),
      lib('Sprinkler Borusu Kırmızı Boyalı 1 1/4"', 130),
      lib('Sprinkler Borusu Dişli 1 1/4"', 137),
      // DN65'te KIRMIZI OLMAYAN bir urun SART: variantMissing'in tanimi
      // "o capta urun VAR ama istenen varyant YOK". Hic aday yoksa motor
      // 'none' dalindan doner (matching.service.ts:576) ve V4'e ulasmaz —
      // farkli bir durum, farkli bir sozlesme.
      lib('Sprinkler Borusu Dişli 2 1/2"', 288),
    ]);
    const r1 = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 25']))['SPRİNK HATTI BORULARI DN 25'];
    const kirmizi = r1?.candidates?.find((c) => c.materialName.includes('Kırmızı'));
    check('C5 adayda variantTags dizisi var', Array.isArray(kirmizi?.variantTags) && (kirmizi?.variantTags?.length ?? 0) > 0,
      `got ${JSON.stringify(kirmizi?.variantTags)}`);

    // Ayni variantTags farkli capta TEK adaya iniyorsa → autoVariant + fiyat
    const r2 = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 32'], kirmizi?.variantTags))['SPRİNK HATTI BORULARI DN 32'];
    assertResultShape('C5 autoVariant', r2);
    check('C5 round-trip → autoVariant boolean true (ExcelGrid.tsx:251-254 oto-atama)',
      r2?.autoVariant === true, `got ${r2?.autoVariant}`);
    check('C5 autoVariant sonucu YAZILABILIR (netPrice>0 + suggestion)',
      (r2?.netPrice ?? 0) > 0 && ['high', 'suggestion'].includes(r2?.confidence ?? ''),
      `got ${r2?.confidence} net=${r2?.netPrice}`);

    // Varyant o capta yoksa → variantMissing + fiyat YAZILMAZ
    const r3 = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 65'], kirmizi?.variantTags))['SPRİNK HATTI BORULARI DN 65'];
    check('C5 varyant yok → variantMissing true + netPrice 0 (ExcelGrid.tsx:1289 belirsiz)',
      r3?.variantMissing === true && r3?.netPrice === 0, `got missing=${r3?.variantMissing} net=${r3?.netPrice}`);
  }

  // ══ C6: donusum rozeti (U2 seffaf cevrim) ════════════════════════════
  {
    const svc = makeService('ÇAYIROVA', [
      lib('Sprinkler Borusu Kırmızı Boyalı 1 1/4"', 130),
      lib('Sprinkler Borusu Dişli 1 1/4"', 137),
    ]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 32']))['SPRİNK HATTI BORULARI DN 32'];
    check('C6 donusum rozeti string (DN→inc cevrimi yapildiysa)', r?.donusum === undefined || isStr(r.donusum),
      `got ${typeof r?.donusum} "${r?.donusum}"`);
  }

  // ══ C7: none + M3 alternatif marka sekli ═════════════════════════════
  {
    const OTHER = [
      { ...lib('PPR-C Boru 20 mm PN20', 32), brand: { id: 'b-hakan', name: 'HAKAN PLASTİK' } },
      { ...lib('Küresel Vana DN20 Pirinç', 88), brand: { id: 'b-duyar', name: 'DUYAR' } },
    ];
    const svc = makeService('ÇAYIROVA', [
      lib('Su ve Yangın Tesisat Boruları Siyah Dişli Manşonlu 3/4" DN20', 69.5),
      lib('Su ve Yangın Tesisat Boruları Galvanizli Dişli Manşonlu 3/4" DN20', 96.1),
    ], OTHER);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['TEMİZ SU BORULARI DN 20']))['TEMİZ SU BORULARI DN 20'];
    assertResultShape('C7 none', r);
    check('C7 none → netPrice === 0 (ALTIN KURAL)', r?.confidence === 'none' && r?.netPrice === 0,
      `got ${r?.confidence} net=${r?.netPrice}`);
    check('C7 alternatives dizisi', Array.isArray(r?.alternatives) && (r?.alternatives?.length ?? 0) > 0,
      `got ${JSON.stringify(r?.alternatives)}`);
    assertAlternativeShape('C7 alternatif', r?.alternatives?.[0]);
  }

  // ══ C8: notProduct (oran/hizmet satiri) ══════════════════════════════
  // ExcelGrid.tsx:275-281 → 'urun_degil' (gri) vs 'yok' (kirmizi) ayrimi
  {
    const svc = makeService('ÇAYIROVA', [lib('Siyah Çelik Boru 1" DN25 Dişli', 130)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['FİTTİNGS ORANI']))['FİTTİNGS ORANI'];
    assertResultShape('C8 notProduct', r);
    check('C8 notProduct boolean true + netPrice 0', r?.notProduct === true && r?.netPrice === 0,
      `got notProduct=${r?.notProduct} net=${r?.netPrice}`);
  }

  // ══ C9: PUBLIC API YUZEYI — controller bagli ═════════════════════════
  {
    const svc = makeService('AYVAZ', [lib('Yaylı Çekvalf DN50', 1250)]);
    check('C9 bulkMatch var (POST /matching/bulk-match)', typeof svc.bulkMatch === 'function');
    check('C9 remember var (POST /matching/remember)', typeof svc.remember === 'function');
    check('C9 backfillTags var (POST /matching/backfill-tags)', typeof svc.backfillTags === 'function');
    check('C9 generateTagsForTest var (POST /matching/generate-tags)', typeof svc.generateTagsForTest === 'function');

    // remember(userId, brandId, materialName, secilenAd) → { ok, imza }
    const rem = await svc.remember('u1', 'brand-1', 'ÇEKVALF DN 50', 'Yaylı Çekvalf DN50');
    check('C9 remember → { ok: boolean }', typeof rem?.ok === 'boolean', `got ${JSON.stringify(rem)}`);

    // generateTagsForTest(name) → TaggedMaterial { tags, normalizedName, materialType }
    const t = svc.generateTagsForTest('Yaylı Çekvalf DN50');
    check('C9 generateTagsForTest → tags dizi', Array.isArray(t?.tags), `got ${JSON.stringify(t)}`);
    check('C9 generateTagsForTest → normalizedName string', isStr(t?.normalizedName), `got ${typeof t?.normalizedName}`);
    check('C9 generateTagsForTest → materialType string', isStr(t?.materialType), `got ${typeof t?.materialType}`);
  }

  // ══ C10: FALLBACK YASAGI — hicbir sonuc "coklu aday + fiyat" olamaz ══
  // PRD Bolum 7: tanimli UC sonuc disinda yol yok. Bu, tum senaryolarda
  // taranan genel bir degismez — dorduncu "sessiz yazma" yolunu yakalar.
  {
    const svc = makeService('ÇAYIROVA', [
      lib('Sprinkler Borusu Kırmızı Boyalı 2"', 227.1),
      lib('Sprinkler Borusu Düz Uçlu 2"', 198.4),
      lib('Sprinkler Borusu Dişli 2"', 210),
    ]);
    const queries = ['SPRİNK HATTI BORULARI DN 50', 'SPRİNK HATTI DN 50', 'BORU DN 50'];
    const all = await svc.bulkMatch('u1', 'brand-1', queries);
    const ihlal = Object.entries(all).filter(([, r]) => (r.candidates?.length ?? 0) > 1 && r.netPrice > 0);
    check('C10 hicbir sonucta candidates>1 && netPrice>0 (fallback yasagi)', ihlal.length === 0,
      `ihlal: ${JSON.stringify(ihlal.map(([q, r]) => `${q}: ${r.candidates?.length} aday, net=${r.netPrice}`))}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SOZLESME DONDURMA (C1-C10): ${passed} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log(`\nKIRILAN SOZLESME:`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log(`\nUYARI: Bu dosyayi GEVSETME. Kirilan alan frontend'de bir`);
    console.log(`ozelligin sessizce susmasi demektir — once nedenini anla.`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

run();
