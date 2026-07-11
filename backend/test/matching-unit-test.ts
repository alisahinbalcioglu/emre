/**
 * Eslestirme Pipeline Unit Test (PRD v1.1 kabul senaryolari) — DB GEREKMEZ
 *   npx ts-node test/matching-unit-test.ts
 *
 * Fake Prisma + gercek TerminologyService seed'leri ile bulkMatch'in ucundan
 * ucuna davranisini test eder: T1, T3-T8, T13-T15.
 * (T2/T9-T12/T16 conversion-test.ts + frontend tarafinda.)
 */

import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS, BRAND_SEEDS } from '../src/modules/matching/terminology.service';

// ── Fake kutuphane satiri (UserLibrary shape — materialId yok → tag'ler
//    generateTags ile anlik uretilir, gercek "manuel eklenen satir" yolu) ──
function lib(name: string, price: number) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0 };
}

// Marka adi → fake Prisma (brand.findUnique bu adi doner)
// eslesmeHafizasi: in-memory (V5 cins tercihi testi icin gercek upsert/find)
function fakePrisma(brandName: string, libRows: any[]): any {
  const memStore = new Map<string, any>();
  const memKey = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  return {
    userLibrary: { findMany: async () => libRows },
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
    brandMaterialType: {
      findMany: async () => BRAND_SEEDS.map((s, i) => ({ id: `b${i}`, userId: null, active: true, ...s })),
    },
  };
}

function makeService(brandName: string, libRows: any[]): MatchingService {
  const prisma = fakePrisma(brandName, libRows);
  const term = new TerminologyService(prisma);
  return new MatchingService(prisma, term);
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
    check('T1 confidence high', r?.confidence === 'high', `got ${r?.confidence} (${r?.reason})`);
    check('T1 siyah 1" eslesti', !!r?.matchedName?.includes('1"') && !!r?.matchedName?.includes('Siyah'), `got "${r?.matchedName}"`);
    check('T1 rozet var', !!r?.donusum && r.donusum.includes('1"'), `got "${r?.donusum}"`);
  }

  // T3: YANGIN HATTI basligi (sozluk) → 2 1/2" celik
  {
    const svc = makeService('BILINMEYEN MARKA', STEEL_LIB);
    const r = (await svc.bulkMatch('u1', 'brand-1', ['YANGIN HATTI BORULARI DN 65']))['YANGIN HATTI BORULARI DN 65'];
    check('T3 eslesti', !!r?.matchedName?.includes('2 1/2"'), `got "${r?.matchedName}" (${r?.confidence}: ${r?.reason})`);
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
    check('F2 subtype elemesi calisiyor (basincli elendi, 2 aday)', r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 2,
      `got ${r?.confidence} ${r?.candidates?.length} aday: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`);
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
    // Ayni cap tekrar gelirse tam-imza hafizasi calisir (mevcut davranis korunur)
    const r3 = (await svc.bulkMatch('u1', 'brand-1', ['DN 25 KÜRESEL VANA']))['DN 25 KÜRESEL VANA'];
    check('T16 ayni imza hafizadan', r3?.confidence === 'suggestion' && !!r3?.matchedName?.includes('Pirinç'),
      `got ${r3?.confidence} "${r3?.matchedName}"`);
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
    check('T17 kirmizi adayin variantTags dolu', !!kirmizi?.variantTags?.includes('kirmizi'),
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
    check('D5 suggestion (cevrim yok)', r?.confidence === 'suggestion', `got ${r?.confidence} (${r?.reason})`);
  }

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
