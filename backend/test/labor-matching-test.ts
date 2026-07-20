/**
 * ISCILIK ESLESTIRME — TEK MOTOR KABULU (PRD Iscilik L3-L7 + L9)
 *   npx ts-node test/labor-matching-test.ts   (npm run test:labor)
 *
 * L9 yapisal kaniti: bu dosya LaborMatchingService'i cagirir; o da
 * MatchingService.bulkMatchLabor → AYNI matchV2/runQuery yolunu kosar.
 * Iscilik icin ayri motor/skorlayici YOKTUR (v1 zinciri silindi).
 *
 * Fixture'lar LEGACY kalem (yalniz ad+birim, indexVersion=0) kullanir —
 * uretimdeki mevcut LaborItem'larin halidir; istek-ani indeksleme (yol-3,
 * manuelUrunIndeksle ORTAK yardimcisi) boylece dogrudan test edilir.
 */

import { MatchingService } from '../src/modules/matching/matching.service';
import { LaborMatchingService } from '../src/modules/labor-matching/labor-matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/modules/matching/terminology.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** LEGACY iscilik kalemi: LaborPrice(+LaborItem) — indeks alanlari BOS. */
function lp(name: string, unitPrice: number, opts?: {
  unit?: string; currency?: string; discount?: number;
}) {
  const unit = opts?.unit ?? 'mt';
  return {
    id: `lp|${name}|${unit}`,
    unitPrice,
    discountRate: opts?.discount ?? 0,
    unit,
    currency: opts?.currency ?? 'TRY',
    laborItem: {
      id: `li|${name}`, name, unit, unitPrice,
      discipline: 'mechanical', category: null, description: null,
      cins: null, baglanti: null, capRaw: null, boyMm: null, not: null,
      adSlug: null, adBucket: null, adTokens: [], cinsNorm: null, cinsTokens: [],
      baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown',
      capTags: [], capNorm: null, boyTag: null, displayName: null,
      indexVersion: 0, belirsiz: false,
    },
  };
}

const memStore = new Map<string, any>();
function makeSvc(mainRows: any[], otherRows: any[] = [], otherFirmaName = 'B FİRMASI') {
  const memKey = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  const prisma: any = {
    laborFirm: {
      findUnique: async ({ where }: any) =>
        where.id === 'firma-A' ? { id: 'firma-A', userId: 'u1', name: 'A FİRMASI', discipline: 'mechanical' } : null,
    },
    laborPrice: {
      findMany: async (args: any) => {
        // Ana firma sorgusu: where.firmaId — alternatif taramasi: where.firma
        if (args?.where?.firmaId) return mainRows;
        if (args?.where?.firma) return otherRows.map((r) => ({ ...r, firma: { id: 'firma-B', name: otherFirmaName } }));
        return [];
      },
    },
    laborItem: { findMany: async () => [], update: async () => ({}) },
    userLibrary: { findMany: async () => [] },
    brand: { findUnique: async () => null },
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
  const fakeFx = {
    getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }),
  } as any;
  const matching = new MatchingService(prisma, new TerminologyService(prisma), fakeFx);
  return new LaborMatchingService(prisma, matching);
}

async function run() {
  // ══ L3 + montaj toleransi: tek uygun kalem → OTOMATIK yazilir ════════
  // Satir malzeme adidir ("SİYAH ÇELİK BORU"); katalog kalemi "... montajı"
  // ekini tasir — K1 alt-kume yonu (satir⊆kalem) montaji tolere eder.
  {
    const svc = makeSvc([
      lp('Siyah çelik boru montajı kaynaklı DN50', 85),
      lp('Siyah çelik boru montajı kaynaklı DN65', 110),
      lp('Küresel vana montajı DN50', 120, { unit: 'adet' }),
    ]);
    const r = (await svc.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50'], undefined, { 'SİYAH ÇELİK BORU - DN50': 'mt' }))['SİYAH ÇELİK BORU - DN50'];
    check('L3 tek kalem → net fiyat OTOMATIK (montaj toleransi dahil)',
      r?.netPrice === 85 && !!r?.matchedName?.toLocaleLowerCase('tr').includes('montaj'),
      `got net=${r?.netPrice} "${r?.matchedName}" (${r?.confidence}: ${r?.reason})`);
    check('L3 vana kalemi boru satirina ADAY OLMADI (K6 ad kilidi motor ortak)',
      !r?.candidates?.length, `got ${r?.candidates?.length ?? 0} aday`);
  }

  // ══ L4: ayni AD+CAP icin ≥2 kalem (kaynakli/yivli) → SECIM LISTESI ══
  {
    const svc = makeSvc([
      lp('Siyah çelik boru montajı kaynaklı DN50', 85),
      lp('Siyah çelik boru montajı yivli DN50', 70),
    ]);
    const r = (await svc.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50']))['SİYAH ÇELİK BORU - DN50'];
    check('L4 iki kalem → fiyatli secim listesi, sistem SECMEZ',
      r?.confidence === 'multi' && r?.netPrice === 0 && (r?.candidates?.length ?? 0) === 2,
      `got ${r?.confidence} net=${r?.netPrice} aday=${r?.candidates?.length}`);
    // L7 backend bacagi: secilen adayin variantTags'i tasinirsa → otomatik
    const kaynakli = r?.candidates?.find((c) => c.materialName.toLocaleLowerCase('tr').includes('kaynak'));
    check('L7 adayda variantTags var (surukleme tasiyabilir)',
      (kaynakli?.variantTags?.length ?? 0) > 0, JSON.stringify(kaynakli?.variantTags));
    const r2 = (await svc.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50'], kaynakli?.variantTags))['SİYAH ÇELİK BORU - DN50'];
    check('L7 varyant tasiminda kaynakli kalem OTOMATIK yazildi',
      r2?.netPrice === 85 && !!r2?.matchedName?.toLocaleLowerCase('tr').includes('kaynak'),
      `got net=${r2?.netPrice} "${r2?.matchedName}"`);
  }

  // ══ L6: BIRIM SERT — mt satirina adet kalemi aday olamaz ═════════════
  {
    const svc = makeSvc([
      lp('Siyah çelik boru montajı DN50', 300, { unit: 'adet' }),
    ]);
    const r = (await svc.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50'], undefined, { 'SİYAH ÇELİK BORU - DN50': 'mt' }))['SİYAH ÇELİK BORU - DN50'];
    check('L6 birim uyumsuz (mt↔adet) → fiyat YOK, aday YOK',
      r?.netPrice === 0 && r?.confidence === 'none' && !r?.candidates?.length,
      `got net=${r?.netPrice} ${r?.confidence} "${r?.reason}"`);
    check('L6 nedeni birimi soyluyor', !!r?.reason && /birim/i.test(r.reason), `got "${r?.reason}"`);
    // Birimsiz kalem ELENMEZ (kanit yok, suclama yok)
    const svc2 = makeSvc([lp('Siyah çelik boru montajı DN50', 85, { unit: '' })]);
    const r2 = (await svc2.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50'], undefined, { 'SİYAH ÇELİK BORU - DN50': 'mt' }))['SİYAH ÇELİK BORU - DN50'];
    check('L6 birimsiz kalem elenmez → fiyat yazilir', r2?.netPrice === 85, `got net=${r2?.netPrice} (${r2?.reason})`);
  }

  // ══ L5: bu firmada yok → kalemi SUNAN diger firmalar onerilir ════════
  {
    const svc = makeSvc(
      [lp('Küresel vana montajı DN50', 120, { unit: 'adet' })], // A'da yalniz vana
      [lp('Siyah çelik boru montajı kaynaklı DN50', 95)],        // B'de boru var
    );
    const r = (await svc.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50'], undefined, { 'SİYAH ÇELİK BORU - DN50': 'mt' }))['SİYAH ÇELİK BORU - DN50'];
    check('L5 firmada yok → fiyat yazilmaz', r?.netPrice === 0, `got net=${r?.netPrice}`);
    const alt = r?.alternatives?.[0];
    check('L5 alternatif firma onerildi (fiyatiyla)',
      alt?.brandName === 'B FİRMASI' && alt?.netPrice === 95,
      `got ${JSON.stringify(r?.alternatives)}`);
  }

  // ══ Z4 ikizi: para birimi CEVRILMEZ, teklif aninda TRY'ye cevrilir ══
  {
    const svc = makeSvc([lp('Siyah çelik boru montajı DN50', 10, { currency: 'USD' })]);
    const r = (await svc.bulkMatch('u1', 'firma-A', ['SİYAH ÇELİK BORU - DN50']))['SİYAH ÇELİK BORU - DN50'];
    check('L2 doviz kalemi teklif aninda TRY (10 USD × 40 = 400)',
      r?.netPrice === 400, `got net=${r?.netPrice}`);
  }

  // ══ Hafiza kapsami: iscilik imzasi 'iscilik|' onekiyle AYRISIR ══════
  {
    const svc = makeSvc([lp('Siyah çelik boru montajı kaynaklı DN50', 85)]);
    memStore.clear();
    await svc.remember('u1', 'firma-A', 'SİYAH ÇELİK BORU - DN50', 'Siyah çelik boru montajı kaynaklı DN50');
    const keys = Array.from(memStore.keys());
    check('HAFIZA: iscilik imzasi iscilik| onekli (malzemeyle CAKISMAZ)',
      keys.length > 0 && keys.every((k) => k.includes('iscilik|firma-A')),
      JSON.stringify(keys));
  }

  // ══ L2: index-at-creation — laborItemIndexData (ice aktarim yolu) ═══
  {
    const svc = makeSvc([]);
    const matching: MatchingService = (svc as any).matching;
    const d1 = matching.laborItemIndexData('Siyah çelik boru montajı', 'mt');
    check('L2 ice aktarim indeksi: is-eki soyulur, aile boru, belirsiz DEGIL',
      d1.adSlug === 'boru' && d1.belirsiz === false && d1.displayName === 'Siyah çelik boru montajı',
      JSON.stringify({ adSlug: d1.adSlug, belirsiz: d1.belirsiz, displayName: d1.displayName }));
    const d2 = matching.laborItemIndexData('---', 'mt');
    check('L2 anlamsiz ad → BEKLEYEN (belirsiz=true, eslesmeye kapali)',
      d2.belirsiz === true, JSON.stringify({ adSlug: d2.adSlug, belirsiz: d2.belirsiz }));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ISCILIK TEK MOTOR (L3-L7): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
