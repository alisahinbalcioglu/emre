/**
 * Eslestirme Pipeline Unit Test (PRD v1.1 kabul senaryolari) — DB GEREKMEZ
 *   npx ts-node test/matching-unit-test.ts
 *
 * Fake Prisma + gercek TerminologyService seed'leri ile bulkMatch'in ucundan
 * ucuna davranisini test eder: T1, T3-T8, T13-T15.
 * (T2/T9-T12/T16 conversion-test.ts + frontend tarafinda.)
 */

import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/modules/matching/terminology.service';

// ── Fake kutuphane satiri (UserLibrary shape — materialId yok → tag'ler
//    generateTags ile anlik uretilir, gercek "manuel eklenen satir" yolu) ──
function lib(name: string, price: number) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0 };
}

// Marka adi → fake Prisma (brand.findUnique bu adi doner)
// eslesmeHafizasi: in-memory (V5 cins tercihi testi icin gercek upsert/find)
// otherBrandRows: M3 alternatif taramasi (brandId: {not}) bu havuzu gorur
function fakePrisma(brandName: string, libRows: any[], otherBrandRows: any[] = [], extraAliases: any[] = []): any {
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
      // extraAliases: S4 kullanici alias'lari (ogrenilmis) — zehir testleri icin
      findMany: async () => [
        ...ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })),
        ...extraAliases.map((s, i) => ({ id: `u${i}`, userId: 'u1', active: true, ...s })),
      ],
    },
  };
}

function makeService(brandName: string, libRows: any[], otherBrandRows: any[] = [], extraAliases: any[] = []): MatchingService {
  const prisma = fakePrisma(brandName, libRows, otherBrandRows, extraAliases);
  const term = new TerminologyService(prisma);
  // Z4: sahte kur servisi — TRY satirlarda hic cagrilmaz; dovizli fixture
  // eklenirse sabit kur kullanilir (DB'siz determinizm)
  const fakeFx = {
    getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }),
  } as any;
  return new MatchingService(prisma, term, fakeFx);
}

// ── Fixture kutuphaneleri ──────────────────────────────────
const STEEL_LIB = [
  lib('Su ve Yangın Tesisat Borusu 1/2" DN15 - Siyah Dişli Manşonlu', 80),
  lib('Su ve Yangın Tesisat Borusu 1" DN25 - Siyah Dişli Manşonlu', 130),
  lib('Su ve Yangın Tesisat Borusu 1" DN25 - Galvanizli Dişli Manşonlu', 160),
  lib('Su ve Yangın Tesisat Borusu 2 1/2" DN65 - Siyah Dişli Manşonlu', 320),
  lib('Su ve Yangın Tesisat Borusu 4" DN100 - Siyah Kaynaklı', 600),
  lib('Pirinç Küresel Vana 3/4"', 95),
];

const PPR_LIB = [
  lib('PPR-C Boru 25 mm PN20', 40),
  lib('PPR-C Boru 32 mm PN20', 55),
  lib('PPR-C Boru 63 mm PN20', 140),
];

const HDPE_LIB = [
  lib('HDPE PE100 Boru 110 mm PN10', 260),
  lib('HDPE PE100 Boru 63 mm PN10', 120),
];

const MIXED_LIB = [
  lib('Siyah Çelik Boru 1 1/4" DN32 Dişli', 140),
  lib('PPR-C Boru 32 mm PN20', 55),
];

const VANA_LIB = [
  lib('Küresel Vana DN25 Pirinç', 142.5),
  lib('Küresel Vana DN25 Çelik', 385),
  lib('Küresel Vana DN25 Bronz', 520),
];

const SIYAH_BORU_LIB = [
  lib('Siyah Düz Uçlu Boru 1" DN25', 120),
  lib('Siyah Dişli Boru 1" DN25', 130),
];

// ── Runner ─────────────────────────────────────────────────
let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function run() {
  // T1: SPRINK basligi + Cayirova → siyah celik 1" (galvaniz DEGIL), yesil
  {
    const svc = makeService('ÇAYIROVA', STEEL_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 25']))['SPRİNK HATTI BORULARI DN 25'];
    check('T1 iki cins → SORU, siyah ONDE (yeni spec: sistem secmez)',
      r?.confidence === 'multi' && r?.netPrice === 0
      && !!r?.candidates?.length && r.candidates[0].materialName.includes('Siyah'),
      `got ${r?.confidence} adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`)
    check('T1 galvanizli de SECENEK (elenmez — kullanici karari)',
      !!r?.candidates?.some((c) => c.materialName.includes('Galvanizli')),
      `adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`)
    check('T1 rozet var', !!r?.donusum && r.donusum.includes('1"'), `got "${r?.donusum}"`);
  }

  // T3: YANGIN HATTI basligi (sozluk) → 2 1/2" celik
  {
    const svc = makeService('BILINMEYEN MARKA', STEEL_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['YANGIN HATTI BORULARI DN 65']))['YANGIN HATTI BORULARI DN 65'];
    check('T3 eslesti (2 1/2\" = DN 65)',
      (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('Siyah') && !!r?.matchedName?.includes('DN 65'),
      `got \"${r?.matchedName}\" (${r?.confidence}: ${r?.reason})`)
  }

  // T4: KURESEL VANALAR basligi altinda DN 20 → vana (sprink baglami TASINMAZ — frontend C2)
  {
    const svc = makeService('DUYAR', STEEL_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['KÜRESEL VANALAR DN 20']))['KÜRESEL VANALAR DN 20'];
    check('T4 vana eslesti', !!r?.matchedName?.includes('Vana'), `got "${r?.matchedName}" (${r?.confidence})`);
  }

  // T5: FITTINGS ORANI → urun degil
  {
    const svc = makeService('ÇAYIROVA', STEEL_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['FİTTİNGS ORANI']))['FİTTİNGS ORANI'];
    check('T5 notProduct', r?.notProduct === true, `got ${JSON.stringify(r)}`);
  }

  // T6: PPR BORULAR DN 32 + KALDE → 32 mm (celik 1 1/4" DEGIL)
  {
    const svc = makeService('KALDE', PPR_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['PPR BORULAR DN 32']))['PPR BORULAR DN 32'];
    check('T6 32mm eslesti', !!r?.matchedName?.includes('32 mm'), `got "${r?.matchedName}" (${r?.confidence}: ${r?.reason})`);
  }

  // T7: HAKAN PLASTIK + satir 1" → PPR 32 mm
  {
    const svc = makeService('HAKAN PLASTİK', PPR_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['PPR BORU 1"']))['PPR BORU 1"'];
    check('T7 1"→32mm', !!r?.matchedName?.includes('32 mm'), `got "${r?.matchedName}" (${r?.confidence}: ${r?.reason})`);
    check('T7 rozet 32 mm', !!r?.donusum?.includes('32 mm'), `got "${r?.donusum}"`);
  }

  // T8: basliksiz markasiz yalin "DN 32", karisik kutuphane → otomatik SECME (multi)
  {
    const svc = makeService('GENEL DAĞITIM A.Ş.', MIXED_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['DN 32']))['DN 32'];
    check('T8 multi (sinif belirsiz)', r?.confidence === 'multi', `got ${r?.confidence} "${r?.matchedName}" (${r?.reason})`);
    check('T8 iki aday', (r?.candidates?.length ?? 0) >= 2, `got ${r?.candidates?.length}`);
  }

  // T13: HIDRANT HATTI DN 110 → HDPE 110 mm (celik DEGIL)
  {
    const svc = makeService('KUZEYBORU', HDPE_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['HİDRANT HATTI DN 110']))['HİDRANT HATTI DN 110'];
    check('T13 HDPE 110mm', !!r?.matchedName?.includes('110 mm'), `got "${r?.matchedName}" (${r?.confidence}: ${r?.reason})`);
  }

  // T14: DN 25 KURESEL VANA (cins yok) → pirinc/celik/bronz FIYATLI adaylar, otomatik yazilmaz
  {
    const svc = makeService('DUYAR', VANA_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['DN 25 KÜRESEL VANA']))['DN 25 KÜRESEL VANA'];
    check('T14 multi', r?.confidence === 'multi', `got ${r?.confidence} "${r?.matchedName}"`);
    check('T14 3 aday', (r?.candidates?.length ?? 0) === 3, `got ${r?.candidates?.length}`);
    check('T14 fiyatlar dolu', !!r?.candidates?.every((c) => c.netPrice > 0), `got ${JSON.stringify(r?.candidates?.map((c) => c.netPrice))}`);
    check('T14 netPrice yazilmadi', r?.netPrice === 0, `got ${r?.netPrice}`);
  }

  // T15 + Duzeltme Talebi K1/K2: SIYAH BORU 1" → duz uclu / disli SORULUR.
  // Otomatik-Disli material tarafinda KALDIRILDI — baglanti farki da popup'a gider.
  {
    const svc = makeService('ÇAYIROVA', SIYAH_BORU_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SİYAH BORU 1"']))['SİYAH BORU 1"'];
    check('T15/K2 baglanti farki POPUP (otomatik-Disli yok)', r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 2 && r?.netPrice === 0,
      `got ${r?.confidence} "${r?.matchedName}" ${r?.candidates?.length} aday net=${r?.netPrice}`);
  }

  // A1 (Duzeltme Talebi): DN 50 + marka, satirda varyant kelimesi YOK,
  // kutuphanede 3 varyant → fiyat YAZILMAZ, 3'u de fiyatli listelenir.
  // Kirmizi Boyali (taban-yuzey siyah/galvaniz tasimayan) listede KALMALI.
  {
    const A1_LIB = [
      lib('Siyah Düz Uçlu Boru 2" DN50', 198.4),
      lib('Siyah Dişli Manşonlu Boru 2" DN50', 241.6),
      lib('Kırmızı Boyalı Boru 2" DN50', 227.1),
    ];
    const svc = makeService('ÇAYIROVA', A1_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 50']))['SPRİNK HATTI BORULARI DN 50'];
    check('A1 fiyat yazilmadi + 3 varyant listede', r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 3 && r?.netPrice === 0,
      `got ${r?.confidence} ${r?.candidates?.length} aday net=${r?.netPrice} "${r?.matchedName ?? ''}" (${r?.reason})`);
    const kirmiziVar = r?.candidates?.some((c) => c.materialName.includes('Kırmızı'));
    check('A1 kirmizi boyali listede (taban-yuzey elemesi dusurmedi)', !!kirmiziVar,
      `adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`);
    // A3 altyapisi: kirmizi secilirse variantTags ile DN'e ozgu otomatik atama calisir
    const kirmizi = r?.candidates?.find((c) => c.materialName.includes('Kırmızı'));
    check('A1 kirmizi variantTags dolu', !!kirmizi?.variantTags?.length, `got ${JSON.stringify(kirmizi?.variantTags)}`);
  }

  // C1/M1/M3 (Duzeltme: markada olmayan urun): Cayirova'da (celik boru) PP
  // kuresel vana YOK → fiyat yazilmaz + baska markanin/ailenin urunune ASLA
  // dusulmez; AYNI aileyi sunan diger markalar fiyatlariyla ALTERNATIF doner.
  {
    const PIPES_ONLY = STEEL_LIB.filter((x) => !x.materialName.includes('Vana'));
    const OTHER = [
      { ...lib('PPR-C Küresel Vana 20 mm', 96.1), brand: { id: 'brand-kalde', name: 'KALDE' } },      // ayni aile (PP vana) → ALTERNATIF
      { ...lib('Küresel Vana DN20 Pirinç', 88), brand: { id: 'brand-duyar', name: 'DUYAR' } },        // pirinc vana — PP degil, girmemeli
      { ...lib('Siyah Çelik Boru 1" DN25', 130), brand: { id: 'brand-x', name: 'ERBOSAN' } },         // farkli aile — girmemeli
    ];
    const svc = makeService('ÇAYIROVA', PIPES_ONLY, OTHER);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['PP KÜRESEL VANALAR DN 20']))['PP KÜRESEL VANALAR DN 20'];
    check('C1 fiyat yazilmadi (none)', r?.confidence === 'none' && r?.netPrice === 0,
      `got ${r?.confidence} net=${r?.netPrice} "${r?.matchedName}"`);
    check('C1 alternatif yalniz KALDE PP vanasi', (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'KALDE' && r?.alternatives?.[0]?.netPrice === 96.1,
      `got ${JSON.stringify(r?.alternatives)}`);
  }

  // C5: hicbir markada yok → alternatifsiz 'none' (kutuphanede urun yok)
  {
    const PIPES_ONLY = STEEL_LIB.filter((x) => !x.materialName.includes('Vana'));
    const svc = makeService('ÇAYIROVA', PIPES_ONLY, []);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['PP KÜRESEL VANALAR DN 20']))['PP KÜRESEL VANALAR DN 20'];
    check('C5 alternatifsiz none', r?.confidence === 'none' && !r?.alternatives?.length, `got ${r?.confidence} alts=${r?.alternatives?.length}`);
  }

  // F2 (hata raporu): baslik sozlugunun strip ettigi 'sprink' tag'i subtype
  // elemesini KAPATMAMALI — subtype'li (basincli vb.) adaylar excel'de
  // subtype yokken elenir, aday sayisi varyant sayisina iner.
  {
    const LIB = [
      lib('Siyah Düz Uçlu Boru 2" DN50', 198.4),
      lib('Siyah Dişli Boru 2" DN50', 241.6),
      lib('Siyah Basınçlı Boru 2" DN50', 300), // subtype'li — elenmeli
    ];
    const svc = makeService('ÇAYIROVA', LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 50']))['SPRİNK HATTI BORULARI DN 50'];
    check('F2 tum varyantlar fiyatli SECENEK (yeni spec: eleme yok, secim kullanicinin)',
      r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 3
      && !!r?.candidates?.some((c) => c.materialName.includes('Basınçlı')),
      `got ${r?.confidence} ${r?.candidates?.length} aday: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`)
  }

  // A5 (Duzeltme Talebi): satir varyanti ACIKCA soyluyor → soru sorulmaz
  {
    const A1_LIB = [
      lib('Siyah Düz Uçlu Boru 2" DN50', 198.4),
      lib('Siyah Dişli Manşonlu Boru 2" DN50', 241.6),
      lib('Kırmızı Boyalı Boru 2" DN50', 227.1),
    ];
    const svc = makeService('ÇAYIROVA', A1_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SİYAH DİŞLİ BORU 2"']))['SİYAH DİŞLİ BORU 2"'];
    check('A5 acik varyant → dogrudan eslesir', (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('Dişli'),
      `got ${r?.confidence} "${r?.matchedName}" net=${r?.netPrice}`);
  }

  // T16 (V5, PRD v1.3): DN25 vanada pirinc secildi → FARKLI capli (DN32) vana
  // belirsizliginde tercih ON-SECILI gelir (otomatik DOLDURMAZ — secim kullanicinin)
  {
    const LIB = [
      ...VANA_LIB,
      lib('Küresel Vana DN32 Pirinç', 190),
      lib('Küresel Vana DN32 Çelik', 450),
    ];
    const svc = makeService('DUYAR', LIB);
    const r1 = (await svc.bulkMatch('u1', 'brand-1', ['DN 25 KÜRESEL VANA']))['DN 25 KÜRESEL VANA'];
    check('T16 once multi', r1?.confidence === 'multi', `got ${r1?.confidence}`);
    await svc.remember('u1', 'brand-1', 'DN 25 KÜRESEL VANA', 'Küresel Vana DN25 Pirinç');
    const r2 = (await svc.bulkMatch('u1', 'brand-1', ['DN 32 KÜRESEL VANA']))['DN 32 KÜRESEL VANA'];
    check('T16 tercih ON-SECILI (multi kalir)', r2?.confidence === 'multi'
      && r2?.candidates?.[0]?.preferred === true && !!r2?.candidates?.[0]?.materialName?.includes('Pirinç'),
      `got ${r2?.confidence} ilk="${r2?.candidates?.[0]?.materialName}" preferred=${r2?.candidates?.[0]?.preferred}`);
    check('T16 netPrice yazilmadi', r2?.netPrice === 0, `got ${r2?.netPrice}`);
    // Ayni cap tekrar gelirse: hafiza artik OTOMATIK DOLDURMAZ (A2/A5) —
    // gecmis secim listenin BASINDA preferred olarak gelir, secim kullanicinin
    const r3 = (await svc.bulkMatch('u1', 'brand-1', ['DN 25 KÜRESEL VANA']))['DN 25 KÜRESEL VANA'];
    check('T16 ayni imza ON-SECILI (doldurmaz)', r3?.confidence === 'multi' && r3?.netPrice === 0
      && r3?.candidates?.[0]?.preferred === true && !!r3?.candidates?.[0]?.materialName?.includes('Pirinç'),
      `got ${r3?.confidence} net=${r3?.netPrice} ilk="${r3?.candidates?.[0]?.materialName}" pref=${r3?.candidates?.[0]?.preferred}`);
  }

  // T17/T18-altyapi/T19 (V4): grup varyant filtresi — kirmizi boyali / duz uclu / disli
  {
    const FIRE_LIB = [
      lib('Sprinkler Borusu Kırmızı Boyalı 1"', 105.9),
      lib('Sprinkler Borusu Düz Uçlu 1"', 98.4),
      lib('Sprinkler Borusu Dişli 1"', 112.7),
      lib('Sprinkler Borusu Kırmızı Boyalı 1 1/4"', 130),
      lib('Sprinkler Borusu Düz Uçlu 1 1/4"', 120),
      lib('Sprinkler Borusu Dişli 1 1/4"', 137),
      // DN 65'te kirmizi BILEREK YOK (T19)
      lib('Sprinkler Borusu Düz Uçlu 2 1/2"', 260),
      lib('Sprinkler Borusu Dişli 2 1/2"', 288),
    ];
    const svc = makeService('ÇAYIROVA', FIRE_LIB);
    // Ilk satir: 3 varyant fiyatli listede, her adayin variantTags'i dolu
    const r1 = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 25']))['SPRİNK HATTI BORULARI DN 25'];
    check('T17 ilk satir multi (3 varyant)', r1?.confidence === 'multi' && r1?.candidates?.length === 3,
      `got ${r1?.confidence} ${r1?.candidates?.length} aday`);
    const kirmizi = r1?.candidates?.find((c) => c.materialName.includes('Kırmızı'));
    check('T17 kirmizi adayin variantTags dolu', !!kirmizi?.variantTags?.some((t) => t.includes('kirmizi')),
      `got ${JSON.stringify(kirmizi?.variantTags)}`);
    // Grup atamasi: DN 32'ye ayni varyant — otomatik, kendi capinin fiyati
    const r2 = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 32'], kirmizi?.variantTags))['SPRİNK HATTI BORULARI DN 32'];
    check('T17 autoVariant DN32 kirmizi', r2?.autoVariant === true && !!r2?.matchedName?.includes('Kırmızı') && !!r2?.matchedName?.includes('1 1/4"'),
      `got ${r2?.confidence} auto=${r2?.autoVariant} "${r2?.matchedName}"`);
    // T19: DN 65'te kirmizi yok → otomatik atama YOK, fiyatli liste + neden
    const r3 = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 65'], kirmizi?.variantTags))['SPRİNK HATTI BORULARI DN 65'];
    check('T19 variantMissing + secim bekliyor', r3?.variantMissing === true && (r3?.candidates?.length ?? 0) === 2 && r3?.netPrice === 0,
      `got missing=${r3?.variantMissing} ${r3?.candidates?.length} aday net=${r3?.netPrice} (${r3?.reason})`);
  }

  // Ters yon (T9 pipeline): kutuphane DN25 kayitli, Excel 1" — celik marka
  {
    const svc = makeService('ÇAYIROVA', [lib('Siyah Çelik Boru DN25 Dişli', 130)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SİYAH ÇELİK BORU 1"']))['SİYAH ÇELİK BORU 1"'];
    check('T9 ters yon eslesti', !!r?.matchedName, `got ${r?.confidence} (${r?.reason})`);
  }

  // D5: celik sinifinda tabloda olmayan DN (DN 90) → eslesme varsa bile 'suggestion'
  {
    const svc = makeService('ÇAYIROVA', [lib('Siyah Çelik Boru DN90', 200)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SİYAH ÇELİK BORU DN 90']))['SİYAH ÇELİK BORU DN 90'];
    // Oneri kademesi kalkti: cevrimsiz tek aday YAZILMAZ — onayli liste (popup 1)
    check('D5 birebir cap eslesmesi → yazilir (yeni spec: tablo-disi cap ayni gosterimle dogrulanir)',
      (r?.netPrice ?? 0) > 0,
      `got ${r?.confidence} net=${r?.netPrice} (${r?.reason})`)
  }

  // A2/A5 (Duzeltme — anahtar semantigi): tek aday SOZLUKLE CELISIYORSA
  // (sprink=siyah beklenir, tek aday GALVANIZLI) fiyat YAZILMAZ — onayli liste.
  {
    const svc = makeService('ÇAYIROVA', [lib('Su ve Yangın Tesisat Boruları Galvanizli Dişli Manşonlu 2 1/2" DN65', 372.8)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 65']))['SPRİNK HATTI BORULARI DN 65'];
    check('A2 celiskili tek aday yazilmaz (galvaniz vs siyah)', r?.confidence === 'multi' && r?.netPrice === 0 && (r?.candidates?.length ?? 0) === 1,
      `got ${r?.confidence} net=${r?.netPrice} "${r?.matchedName}" ${r?.candidates?.length} aday`);
  }

  // B1 (temiz su): detaysiz "DN50" → PPR-C 50 mm (DN=mm; default-celik sorguyu bozmaz)
  {
    const svc = makeService('KALDE', [lib('PPR-C Boru 50 mm PN20', 90), lib('PPR-C Boru 63 mm PN20', 140)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['TEMİZ SU BORULARI DN50']))['TEMİZ SU BORULARI DN50'];
    check('B1 temiz su DN50 → PPR 50 mm', (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('50 mm'),
      `got ${r?.confidence} "${r?.matchedName}" net=${r?.netPrice} (${r?.reason})`);
  }

  // B2 (T3 override): ayni baslik altinda "DN50 GALVANIZ CELIK BORU" → celik 2"
  // (PPR DEGIL — satir detayi basligi ezer; cevrim tablosu satir bazinda secilir)
  {
    const MIX = [
      lib('PPR-C Boru 50 mm PN20', 90),
      lib('Galvanizli Çelik Boru 2" DN50 Dişli', 291.1),
    ];
    const svc = makeService('GENEL TESİSAT', MIX);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['TEMİZ SU BORULARI DN50 GALVANİZ ÇELİK BORU']))['TEMİZ SU BORULARI DN50 GALVANİZ ÇELİK BORU'];
    check('B2 satir detayi basligi ezer → galvaniz celik 2"', (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('Galvanizli') && (!!r?.matchedName?.includes('2"') || !!r?.matchedName?.includes('DN 50')),
      `got ${r?.confidence} "${r?.matchedName}" net=${r?.netPrice} (${r?.reason})`);
  }

  // D2/N1 (Duzeltme: aile kilidi): TEMIZ SU (PPR) hattina CAYIROVA (celik
  // kutuphanesi) secildi → HICBIR celik aday gosterilmez, fiyat yazilmaz;
  // ayni aileyi (PPR) sunan markalar alternatif olarak doner.
  {
    const CAYIROVA_STEEL = [
      lib('Su ve Yangın Tesisat Boruları Galvanizli Dişli Manşonlu 3/4" DN20', 96.1),
      lib('Su ve Yangın Tesisat Boruları Siyah Dişli Manşonlu 3/4" DN20', 69.5),
    ];
    const OTHER = [
      { ...lib('PPR-C Boru 20 mm PN20', 32), brand: { id: 'brand-hakan', name: 'HAKAN PLASTİK' } },
      { ...lib('Küresel Vana DN20 Pirinç', 88), brand: { id: 'brand-duyar', name: 'DUYAR' } }, // farkli aile — girmemeli
    ];
    const svc = makeService('ÇAYIROVA', CAYIROVA_STEEL, OTHER);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['TEMİZ SU BORULARI DN 20']))['TEMİZ SU BORULARI DN 20'];
    check('D2 celik aday YOK + fiyat yazilmadi', r?.confidence === 'none' && r?.netPrice === 0 && !r?.candidates?.length,
      `got ${r?.confidence} net=${r?.netPrice} ${r?.candidates?.length ?? 0} aday "${r?.matchedName}"`);
    check('D2 alternatif yalniz HAKAN (PPR)', (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'HAKAN PLASTİK',
      `got ${JSON.stringify(r?.alternatives?.map((a) => a.brandName))}`);
  }

  // N6: "Kirmizi Boyali" etiketi TEKRARLAMAMALI ("Kırmızı Boyalı Boyalı" bug'i)
  {
    const LIB = [
      lib('Sprinkler Borusu Kırmızı Boyalı 2"', 227.1),
      lib('Sprinkler Borusu Düz Uçlu 2"', 198.4),
    ];
    const svc = makeService('ÇAYIROVA', LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['SPRİNK HATTI BORULARI DN 50']))['SPRİNK HATTI BORULARI DN 50'];
    const kirmiziLabel = r?.candidates?.find((c) => c.materialName.includes('Kırmızı'))?.label ?? '';
    check('N6 etiket tekrarsiz', r?.confidence === 'multi' && !/boyal.*boyal/i.test(kirmiziLabel),
      `got label="${kirmiziLabel}"`);
  }

  // PIS SU regresyonu: baslik plastik derken default-celik PVC'yi ELEMEMELI
  {
    const svc = makeService('HAKAN PLASTİK', [lib('PVC Boru 110 mm Atık Su', 75)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['PİS SU BORULARI DN 110']))['PİS SU BORULARI DN 110'];
    check('PIS SU DN110 → PVC 110 mm eslesir', (r?.netPrice ?? 0) > 0 || r?.confidence === 'multi',
      `got ${r?.confidence} "${r?.matchedName}" net=${r?.netPrice} (${r?.reason})`);
  }

  // ═══════ BORU DISI KALEMLER PRD (E1-E6, H1-H6) — AYVAZ vakasi ═══════
  const AYVAZ_LIB = [
    lib('Ayvaz Sprinkler 68°C Pendent 1/2" DN15', 420),
    lib('Ayvaz Sprinkler 141°C Pendent 1/2" DN15', 485),
    lib('Ayvaz Sprinkler 68°C Upright 1/2" DN15', 430),
    lib('Ayvaz Sprinkler 68°C Sidewall 1/2" DN15', 460),
    lib('Fan-Coil Bağlantı 1/2"Nx1/2"R 500mm', 350),
    lib('İzoleli Fan-Coil Bağlantı 1/2"Nx1/2"R 300mm', 410),
    lib('Sprinkler Bağlantı Hortumu ve Seti 300', 700),
    lib('Sprinkler Bağlantı Hortumu ve Seti 500', 800),
    lib('Akış Anahtarı Paddle Tip 2 1/2"', 4250),
    lib('Akış Anahtarı Paddle Tip 3"', 4750),
    lib('Akış Ölçer Flow Meter 2 1/2"', 14771),
  ];

  // H1: sprinkler basligi satiri → YALNIZ sprinkler ailesi; nitelikler
  // (68°C + Pendent + 1/2") tam tutan urun dogrudan eslesir; Fan-Coil ASLA aday olamaz
  {
    const svc = makeService('AYVAZ', AYVAZ_LIB);
    const q = 'SPRİNKLER ASMA TAVAN SPRİNK 68°C, K=80, 1/2" NPT (ROZET DAHİL)';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H1 68°C Pendent ADAYLARDA, fiyat onaysiz yazilmadi (v2)',
      r?.netPrice === 0 && !!(r?.candidates ?? []).some((c) => c.materialName.includes('68°C Pendent')),
      `got ${r?.confidence} adaylar: ${(r?.candidates ?? []).map((c) => c.materialName).join(' | ')}`)
    check('H1 Fan-Coil eslesmedi', !r?.matchedName?.includes('Fan-Coil'), `got "${r?.matchedName}"`);
  }

  // H1b/E3: kutuphanede olmayan nitelik (93°C) → aday listesi YALNIZ sprinkler,
  // farkli °C adaylar UYARI ile isaretli ("93°C istendi — bu ürün 68°C")
  {
    const svc = makeService('AYVAZ', AYVAZ_LIB);
    const q = 'SPRİNKLER ASMA TAVAN SPRİNK 93°C 1/2"';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H1b multi + fiyat yazilmadi', r?.confidence === 'multi' && r?.netPrice === 0,
      `got ${r?.confidence} net=${r?.netPrice} "${r?.matchedName}"`);
    check('H1b adaylar YALNIZ sprinkler (Fan-Coil yok)',
      !!r?.candidates?.length && r.candidates.every((c) => c.materialName.includes('Sprinkler') && !c.materialName.includes('Fan-Coil')),
      `adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`);
    check('H1b Fan-Coil ASLA aday degil (aile kilidi)',
      !(r?.candidates ?? []).some((c) => c.materialName.includes('Fan-Coil')),
      `adaylar: ${(r?.candidates ?? []).map((c) => c.materialName).join(' | ')}`)
    // E3 (backlog kapandi): farkli °C tasiyan adaylar UYARI ile isaretli
    const uyarilar = (r?.candidates ?? []).map((c) => c.uyari ?? '');
    check('H1b/E3 nitelik farki uyarisi ("93°C istendi — bu ürün 68°C")',
      uyarilar.some((u) => u.includes('93°C istendi') && u.includes('68°C')), JSON.stringify(uyarilar));
  }

  // ══ S4 ZEHIR REGRESYONU (canli 17.07 — "218 secenek" vakasi) ═══════
  // Ogrenilmis AD-alias'i ('test drenaj vanasi' — impliedType YOK, kinds
  // pirinc, sizeClass steel; CANLIDAN birebir) satirin ad kelimelerini
  // ignoreTokens ile yutuyordu → satir adsiz kaliyor → captaki TUM vana
  // ailesi listeleniyordu (kelebek/kuresel dahil, 218 secenek).
  // Kural: sozluk yalniz GERCEK CEVIRIDE (impliedType) kelime tuketir.
  {
    const zehirliAlias = {
      alias: 'test drenaj vanasi',
      canonical: 'Test ve drenaj vanası · K=57 orifisli · NPT dişli · 1"',
      kinds: ['pirinc'], impliedType: null, sizeClass: 'steel', stripTags: [],
    };
    const svc = makeService('AYVAZ', [
      lib('Test ve Drenaj Vanası K=57 Orifisli NPT Dişli 2"', 465),
      lib('Test ve Drenaj Vanası K=80 Orifisli NPT Dişli 2"', 465),
      lib('Kelebek Vana Wafer DN50', 250),
      lib('Küresel Vana Pirinç 2"', 850),
    ], [], [zehirliAlias]);
    const q = "2 ''Test Drenaj Vanası";
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    const adlar = (r?.candidates ?? []).map((c) => c.materialName);
    check('S4 ZEHIR: adaylar YALNIZ test-drenaj (kelebek/kuresel ASLA)',
      adlar.length === 2 && adlar.every((a) => a.includes('Test ve Drenaj')),
      `got ${r?.confidence} adaylar: ${adlar.join(' | ') || r?.matchedName} (${r?.reason})`);
    check('S4 ZEHIR: fiyat yazilmadi (cins sorusu)', r?.netPrice === 0 && r?.confidence === 'multi',
      `got ${r?.confidence} net=${r?.netPrice}`);
  }

  // ══ HAFIZA TEK-ADAY OTOYAZ (kullanici karari 17.07 — cekvalf vakasi) ══
  // Dogrulanamayan kelime tek adayi ONAY listesine dusurur (I6/373K kapisi).
  // Ayni satir imzasi icin o aday GECMISTE secildiyse onay tekrari istenmez.
  {
    const svc = makeService('AYVAZ', [lib('Küresel Vana Pirinç 1" DN25', 850)]);
    const q = 'ÇİFT ETKİLİ KÜRESEL VANA DN25';
    const r1 = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('OTOYAZ oncesi: tek aday ONAY listesi (dogrulanamayan kelime kapisi)',
      r1?.confidence === 'multi' && r1?.candidates?.length === 1 && r1?.netPrice === 0,
      `got ${r1?.confidence} cand=${r1?.candidates?.length} net=${r1?.netPrice} "${r1?.reason}"`);
    await svc.remember('u1', 'brand-1', q, r1!.candidates![0].materialName);
    const r2 = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('OTOYAZ: hafiza onayli TEK aday otomatik yazildi',
      r2?.confidence === 'high' && r2?.netPrice === 850 && !r2?.candidates,
      `got ${r2?.confidence} net=${r2?.netPrice} cand=${r2?.candidates?.length}`);
    check('OTOYAZ nedenini soyler (gecmis secim)',
      !!r2?.reason?.includes('Geçmiş seçiminiz'), `got "${r2?.reason}"`);
    // I6 kanit rozeti (18.07): FE "Geçmiş seçiminizden atandı" rozetini
    // bu bayraktan cizer — sessiz/izsiz otomatik yazim YOK.
    check('OTOYAZ rozet bayragi (hafizaOtoyaz=true)', (r2 as any)?.hafizaOtoyaz === true,
      `got ${(r2 as any)?.hafizaOtoyaz}`);
    // Canli bulgu 18.07: otoyaz SON SECIM zincirini besler — varyant
    // kimligi doner ki gruptaki sonraki satirlar otomatik dolabilsin.
    check('OTOYAZ varyant kimligi tasir (zincir beslenir)',
      Array.isArray((r2 as any)?.variantTags) && (r2 as any).variantTags.length > 0,
      `got ${JSON.stringify((r2 as any)?.variantTags)}`);
  }

  // ══ I3 AKISKAN SINIRI (kullanici sarti 18.07) ═══════════════════════
  // Markada AKISKAN kelimesi (dogalgaz/buhar/sivi) dogrulanamiyorsa:
  // (a) liste ACIK UYARI tasir, (b) HAFIZA BILE otomatik yazamaz —
  // akiskan uyusmazligi riskinde fiyat hicbir kosulda otomatik yazilmaz.
  {
    const svc = makeService('AYVAZ', [lib('Küresel Vana Pirinç 1" DN25', 850)]);
    const q = 'DOĞALGAZ KÜRESEL VANA DN25';
    const r1 = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('AKISKAN: uyari isareti ("Akışkan bilgisi doğrulanamadı")',
      !!r1?.reason?.includes('Akışkan bilgisi doğrulanamadı'), `got "${r1?.reason}"`);
    check('AKISKAN: fiyat yazilmadi (tek aday onay listesi)',
      r1?.netPrice === 0 && r1?.candidates?.length === 1,
      `got net=${r1?.netPrice} cand=${r1?.candidates?.length}`);
    await svc.remember('u1', 'brand-1', q, r1!.candidates![0].materialName);
    const r2 = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('AKISKAN: hafiza BILE otoyazamaz (multi kalir)',
      r2?.confidence === 'multi' && r2?.netPrice === 0 && !(r2 as any)?.hafizaOtoyaz,
      `got ${r2?.confidence} net=${r2?.netPrice} otoyaz=${(r2 as any)?.hafizaOtoyaz}`);
    check('AKISKAN: on-secim isareti yine calisir (preferred ✓)',
      r2?.candidates?.[0]?.preferred === true, JSON.stringify(r2?.candidates?.map((c) => c.preferred)));
  }

  // H2: "ASMA DUVAR" → Sidewall (montaj tipi ayrimi, E4 es-anlamli)
  {
    const svc = makeService('AYVAZ', AYVAZ_LIB);
    const q = 'SPRİNKLER ASMA DUVAR SPRİNK 68°C 1/2"';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H2 Sidewall SECENEKLERDE (soru — duvar sozcugu v2 niteligi degil)',
      !!(r?.candidates ?? []).some((c) => c.materialName.includes('Sidewall')) || !!r?.matchedName?.includes('Sidewall'),
      `got ${r?.confidence} adaylar: ${(r?.candidates ?? []).map((c) => c.materialName).join(' | ') || r?.matchedName}`)
  }

  // H3: capsiz hortum satiri — cm→mm cevrimi (50 cm = 500) uzunlukla eslesir
  {
    const svc = makeService('AYVAZ', AYVAZ_LIB);
    const q = 'ESNEK SPRİNKLER HORTUMU (50 cm)';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H3 hortum ailesi soruldu, 500 mm SECENEKLERDE (v2)',
      r?.netPrice === 0 && !!(r?.candidates ?? []).some((c) => c.materialName.includes('500')),
      `got ${r?.confidence} adaylar: ${(r?.candidates ?? []).map((c) => c.materialName).join(' | ')}`)
  }

  // H4: FLOW SWITCH DN 65 → akis anahtari ailesi + DN→inc cevrimi (2 1/2");
  // Akis OLCER (flow meter) ayri ailedir, aday olamaz
  {
    const svc = makeService('AYVAZ', AYVAZ_LIB);
    const q = 'FLOW SWİTCH DN 65';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H4 Paddle Tip 2 1/2" eslesti', (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('Paddle Tip') && !!r?.matchedName?.includes('2 1/2'),
      `got ${r?.confidence} "${r?.matchedName}" net=${r?.netPrice} (${r?.reason})`);
    check('H4 Flow Meter aday degil', !r?.matchedName?.includes('Meter') && !r?.candidates?.some((c) => c.materialName.includes('Meter')),
      `got "${r?.matchedName}" adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ') ?? '-'}`);
  }

  // H5/E2 regresyon: "SPRİNK HATTI" hala BORU ailesidir (E2 ayrimi yalin
  // sprink'i etkiler, hatti'yi degil) — T1 zaten dogruluyor; burada yalin
  // sprink satirinin celik boruya COZULMEDIGINI dogrula (adet birimli)
  {
    const MIX = [...STEEL_LIB, ...AYVAZ_LIB];
    const svc = makeService('AYVAZ', MIX);
    const q = 'SPRİNKLER ASMA TAVAN SPRİNK 68°C, K=80, 1/2" NPT';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q], undefined, { [q]: 'Adet' }))[q];
    check('H5 boruya cozulmedi — sprinkler adaylari soruldu (v2)',
      !(r?.candidates ?? []).some((c) => c.materialName.includes('Boru'))
      && !!(r?.candidates ?? []).some((c) => c.materialName.includes('Sprinkler')),
      `got ${r?.confidence} adaylar: ${(r?.candidates ?? []).map((c) => c.materialName).join(' | ')}`)
  }

  // E2: adet birimli satira baslik/sozluk BORU ailesi dayatamaz — celiski →
  // otomatik yazim yok, aile-belirsiz onay listesi
  {
    const svc = makeService('ÇAYIROVA', STEEL_LIB);
    const q = 'YANGIN TESİSAT DN 25';
    const rMetre = (await svc.bulkMatch('u1', 'brand-1', [q], undefined, { [q]: 'metre' }))[q];
    check('E2 metre birimli boru satiri — celiski yok, otomatik yazim da yok (2 cins sorusu)',
      rMetre?.confidence === 'multi' && rMetre?.netPrice === 0,
      `got ${rMetre?.confidence} (${rMetre?.reason})`);
    const rAdet = (await svc.bulkMatch('u1', 'brand-1', [q], undefined, { [q]: 'Adet' }))[q];
    check('E2 adet birimli → otomatik yazilMAZ (celiski/aile belirsiz)', rAdet?.confidence !== 'high' && rAdet?.netPrice === 0,
      `got ${rAdet?.confidence} net=${rAdet?.netPrice} "${rAdet?.matchedName}" (${rAdet?.reason})`);
  }

  // H6/E6: aile cozulemeyen yalin satir — tek yuksek-skorlu metin/olcu
  // eslesmesi bile OTOMATIK yazilmaz; "aile belirlenemedi" isaretli onay listesi
  {
    const svc = makeService('ÇAYIROVA', [lib('Siyah Çelik Boru 1" DN25 Dişli', 130)]);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['DN 25']))['DN 25'];
    check('H6 tek aday ama otomatik yazilmadi', r?.confidence === 'multi' && r?.netPrice === 0 && (r?.candidates?.length ?? 0) === 1,
      `got ${r?.confidence} net=${r?.netPrice} ${r?.candidates?.length} aday`);
    check('H6 neden "ailesi belirlenemedi"', !!r?.reason?.includes('belirlenemedi'), `got "${r?.reason}"`);
  }

  // ═══════ EK VAKA (E8-E10, H7-H9): vana tipi + akiskan SERT filtre ═══════
  const AYVAZ_VANA = [
    lib('Doğalgaz Küresel Vana Dişli DN50', 2250),
    lib('Doğalgaz Küresel Vana Flanşlı DN50', 3350),
    lib('Sürgülü Vana Elastomer Sitli DN50', 3250),
    lib('Bıçaklı Sürgülü Vana Wafer DN50', 4850),
    lib('Kelebek Vana Lug Tip PN16 DN50', 1850),
    lib('Globe Vana API 623 Class 150 2"', 18500),
    lib('Monoblok Vana Sıvılar DN50', 4450),
  ];

  // H7: DOGALGAZ VANASI KURESEL DN50 → YALNIZ kuresel+gaz adaylar (2 varyant:
  // disli/flansli); surgulu/kelebek/globe/bicakli/SIVILAR hicbir skorla yok (H9)
  {
    const svc = makeService('AYVAZ', AYVAZ_VANA);
    const q = 'DOĞALGAZ VANASI KÜRESEL DN50';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H7 iki gaz-kuresel varyant listede (disli/flansli)', r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 2
      && !!r?.candidates?.every((c) => c.materialName.includes('Doğalgaz Küresel')),
      `got ${r?.confidence} ${r?.candidates?.length} aday: ${r?.candidates?.map((c) => c.materialName).join(' | ') ?? r?.matchedName}`);
    check('H9 surgulu/kelebek/globe/sivilar YOK',
      !r?.candidates?.some((c) => /Sürgülü|Kelebek|Globe|Sıvılar|Bıçaklı/.test(c.materialName)),
      `adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`);
  }

  // H7b/E10: markada gaz-isaretli kuresel YOK → isaretsiz kuresel YAZILMAZ,
  // M3 alternatif markalar (gercek gaz vanasi sunanlar) onerilir
  {
    const NO_GAS = [
      lib('Küresel Vana DN50 Pirinç', 950),        // gaz isareti yok — gosterilemez
      lib('Sürgülü Vana Elastomer Sitli DN50', 3250),
    ];
    const OTHER = [
      { ...lib('Doğalgaz Küresel Vana Dişli DN50', 2100), brand: { id: 'brand-esbir', name: 'ESBİR' } },
      { ...lib('Küresel Vana DN50 Çelik', 1200), brand: { id: 'brand-x', name: 'DUYAR' } }, // gaz degil — girmemeli
    ];
    const svc = makeService('AYVAZ', NO_GAS, OTHER);
    const q = 'DOĞALGAZ VANASI KÜRESEL DN50';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H7b gaz isaretsiz urun YAZILMADI (onay listesi — E9 yeni yuzu: sessiz yazim imkansiz)',
      r?.netPrice === 0 && r?.confidence !== 'high',
      `got ${r?.confidence} net=${r?.netPrice} \"${r?.matchedName ?? ''}\"`)
    check('H7b alternatif yalniz ESBİR (gaz vanasi)', (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'ESBİR',
      `got ${JSON.stringify(r?.alternatives?.map((a) => a.brandName))}`);
  }

  // H8: DOGALGAZ VANASI FLANSLI DN50 → tip belirtilmedi; flansli+gaz vana
  // dogrudan bulunur (baglanti refine ile one gecer)
  {
    const svc = makeService('AYVAZ', AYVAZ_VANA);
    const q = 'DOĞALGAZ VANASI FLANŞLI DN50';
    const r = (await svc.bulkMatch('u1', 'brand-1', [q]))[q];
    check('H8 flansli gaz vanasi', (r?.netPrice ?? 0) > 0
      ? !!r?.matchedName?.includes('Flanşlı')
      : r?.candidates?.[0]?.materialName?.includes('Flanşlı') === true,
      `got ${r?.confidence} "${r?.matchedName ?? r?.candidates?.map((c) => c.materialName).join(' | ')}"`);
    check('H8 sivi/surgulu yok', !r?.matchedName?.includes('Sıvılar') && !r?.candidates?.some((c) => /Sıvılar|Sürgülü|Kelebek/.test(c.materialName)),
      `got "${r?.matchedName}" adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ') ?? '-'}`);
  }

  // E8 regresyon: KURESEL VANA (akiskansiz) mevcut davranis — 3 cins adayi
  // (T14 zaten dogruluyor); vt-kuresel yuvasi tum adaylarda ayni → daralmaz.

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
