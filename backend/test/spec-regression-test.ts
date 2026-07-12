/**
 * TEK KAYNAK SPESIFIKASYON — Regresyon Test Seti (Bolum D, R1-R12)
 *   npx ts-node test/spec-regression-test.ts   (npm run test:spec)
 *
 * Yasanmis gercek vakalar KANONIK akisa (Bolum A) ve degismezlere (Bolum B,
 * I1-I12) gore dogrulanir. R13 kaniti: test/admin-import-test.ts (Z1-Z6).
 * R14 kaniti: test/library-transfer-test.ts (L1-L5).
 * KABUL OLCUTU: R1-R14 tamami gecmeden motor "duzeltildi" sayilmaz.
 */

import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS, BRAND_SEEDS } from '../src/modules/matching/terminology.service';

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
    brandMaterialType: {
      findMany: async () => BRAND_SEEDS.map((s, i) => ({ id: `b${i}`, userId: null, active: true, ...s })),
    },
  };
}

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

async function m(svc: MatchingService, q: string, variantTags?: string[], units?: Record<string, string>) {
  return (await svc.bulkMatch('u1', 'brand-1', [q], variantTags, units))[q];
}

async function run() {
  // ── R1 (I1,I6,I8): SPRINK HATTI · DN 50 · Cayirova → siyah celik 2"
  // varyantlari FIYATLI LISTE; galvaniz one cikmaz; sistem SECMEZ.
  {
    const svc = makeService('ÇAYIROVA', [
      lib('Sprinkler Borusu Kırmızı Boyalı 2"', 227.1),
      lib('Sprinkler Borusu Düz Uçlu 2"', 198.4),
      lib('Sprinkler Borusu Dişli 2"', 241.6),
      lib('Su ve Yangın Tesisat Borusu Galvanizli Dişli 2" DN50', 291.1),
    ]);
    const r = await m(svc, 'SPRİNK HATTI BORULARI DN 50');
    check('R1 fiyatli secim listesi, sistem secmedi', r?.confidence === 'multi' && r?.netPrice === 0 && (r?.candidates?.length ?? 0) === 3,
      `got ${r?.confidence} net=${r?.netPrice} ${r?.candidates?.length} aday`);
    check('R1 galvaniz listede yok, kirmizi var',
      !r?.candidates?.some((c) => c.materialName.includes('Galvanizli')) && !!r?.candidates?.some((c) => c.materialName.includes('Kırmızı')),
      `adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ')}`);
    check('R1 adaylar fiyatli', !!r?.candidates?.every((c) => c.netPrice > 0));
  }

  // ── R2 (I10,I11): kirmizi secimi → DN 32'ye KENDI cap fiyatiyla otomatik
  // yayilim (variantTags), rozetli (autoVariant); DN 65'te varyant yoksa
  // otomatik atama YOK (backend cekirdegi; FE yayilim ExcelGrid V4)
  {
    const svc = makeService('ÇAYIROVA', [
      lib('Sprinkler Borusu Kırmızı Boyalı 1"', 105.9),
      lib('Sprinkler Borusu Dişli 1"', 112.7),
      lib('Sprinkler Borusu Kırmızı Boyalı 1 1/4"', 130),
      lib('Sprinkler Borusu Dişli 1 1/4"', 137),
      lib('Sprinkler Borusu Dişli 2 1/2"', 288),
    ]);
    const r1 = await m(svc, 'SPRİNK HATTI BORULARI DN 25');
    const kirmizi = r1?.candidates?.find((c) => c.materialName.includes('Kırmızı'));
    check('R2 ilk satir secim listesi + variantTags', r1?.confidence === 'multi' && !!kirmizi?.variantTags?.includes('kirmizi'),
      `got ${r1?.confidence}, variantTags=${JSON.stringify(kirmizi?.variantTags)}`);
    const r2 = await m(svc, 'SPRİNK HATTI BORULARI DN 32', kirmizi?.variantTags);
    check('R2 DN32 kendi fiyatiyla otomatik + rozet', r2?.autoVariant === true && r2?.netPrice === 130 && !!r2?.matchedName?.includes('1 1/4"'),
      `got auto=${r2?.autoVariant} net=${r2?.netPrice} "${r2?.matchedName}"`);
    const r3 = await m(svc, 'SPRİNK HATTI BORULARI DN 65', kirmizi?.variantTags);
    check('R2 DN65 varyant yok → otomatik atama YOK', r3?.variantMissing === true && r3?.netPrice === 0,
      `got missing=${r3?.variantMissing} net=${r3?.netPrice}`);
  }

  // ── R3 (I4,I5,I8): TEMIZ SU · DN 20 · Cayirova → celik aday YOK;
  // PPR sunan markalar fiyatli oneri
  {
    const OTHER = [
      { ...lib('PPR-C Boru 20 mm PN20', 32), brand: { id: 'b-hakan', name: 'HAKAN PLASTİK' } },
      { ...lib('Küresel Vana DN20 Pirinç', 88), brand: { id: 'b-duyar', name: 'DUYAR' } },
    ];
    const svc = makeService('ÇAYIROVA', [
      lib('Su ve Yangın Tesisat Boruları Siyah Dişli Manşonlu 3/4" DN20', 69.5),
      lib('Su ve Yangın Tesisat Boruları Galvanizli Dişli Manşonlu 3/4" DN20', 96.1),
    ], OTHER);
    const r = await m(svc, 'TEMİZ SU BORULARI DN 20');
    check('R3 celik aday YOK, fiyat yazilmadi', r?.confidence === 'none' && r?.netPrice === 0 && !r?.candidates?.length,
      `got ${r?.confidence} net=${r?.netPrice} "${r?.matchedName}"`);
    check('R3 alternatif yalniz PPR markasi', (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'HAKAN PLASTİK',
      `got ${JSON.stringify(r?.alternatives?.map((a) => a.brandName))}`);
  }

  // ── R4 (I9): TEMIZ SU basligi + satirda GALVANIZ CELIK → satir basligi EZER
  {
    const svc = makeService('GENEL TESİSAT', [
      lib('PPR-C Boru 50 mm PN20', 90),
      lib('Galvanizli Çelik Boru 2" DN50 Dişli', 291.1),
    ]);
    const r = await m(svc, 'TEMİZ SU BORULARI DN50 GALVANİZ ÇELİK BORU');
    check('R4 satir basligi ezdi → galvaniz celik 2"', (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('Galvanizli') && !!r?.matchedName?.includes('2"'),
      `got ${r?.confidence} "${r?.matchedName}"`);
  }

  // ── R5 (I5): PP KURESEL VANALAR · DN 20 · Cayirova → fiyat yazilmaz + uyumlu markalar
  {
    const OTHER = [
      { ...lib('PPR-C Küresel Vana 20 mm', 96.1), brand: { id: 'b-kalde', name: 'KALDE' } },
      { ...lib('Siyah Çelik Boru 1" DN25', 130), brand: { id: 'b-x', name: 'ERBOSAN' } },
    ];
    const svc = makeService('ÇAYIROVA', [
      lib('Su ve Yangın Tesisat Borusu 1/2" DN15 - Siyah Dişli Manşonlu', 80),
    ], OTHER);
    const r = await m(svc, 'PP KÜRESEL VANALAR DN 20');
    check('R5 fiyat yazilmadi + KALDE onerildi', r?.confidence === 'none' && r?.netPrice === 0
      && (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'KALDE',
      `got ${r?.confidence} net=${r?.netPrice} alts=${JSON.stringify(r?.alternatives?.map((a) => a.brandName))}`);
  }

  const AYVAZ_EKIPMAN = [
    lib('Ayvaz Sprinkler 68°C Pendent 1/2" DN15', 420),
    lib('Ayvaz Sprinkler 141°C Pendent 1/2" DN15', 485),
    lib('Ayvaz Sprinkler 68°C Upright 1/2" DN15', 430),
    lib('Fan-Coil Bağlantı 1/2"Nx1/2"R 500mm', 350),
    lib('İzoleli Fan-Coil Bağlantı 1/2"Nx1/2"R 300mm', 410),
    lib('Sprinkler Bağlantı Hortumu ve Seti 300', 700),
    lib('Sprinkler Bağlantı Hortumu ve Seti 500', 800),
    lib('Akış Anahtarı Paddle Tip 2 1/2"', 4250),
    lib('Akış Anahtarı Paddle Tip 3"', 4750),
    lib('Akış Ölçer Flow Meter 2 1/2"', 14771),
  ];

  // ── R6 (I1,I2): sprinkler satiri → yalniz sprinkler ailesi; Fan-Coil YOK
  {
    const svc = makeService('AYVAZ', AYVAZ_EKIPMAN);
    const r = await m(svc, 'SPRİNKLER ASMA TAVAN SPRİNK 68°C, K=80, 1/2" NPT (ROZET DAHİL)', undefined,
      { 'SPRİNKLER ASMA TAVAN SPRİNK 68°C, K=80, 1/2" NPT (ROZET DAHİL)': 'Adet' });
    check('R6 Pendent+68°C eslesti, Fan-Coil YOK', !!r?.matchedName?.includes('68°C Pendent') && !r?.matchedName?.includes('Fan-Coil'),
      `got ${r?.confidence} "${r?.matchedName}"`);
  }

  // ── R7 (I1,I8): ESNEK SPRINKLER HORTUMU (50 cm) → Seti 500 (cm→mm)
  {
    const svc = makeService('AYVAZ', AYVAZ_EKIPMAN);
    const r = await m(svc, 'ESNEK SPRİNKLER HORTUMU (50 cm)');
    check('R7 hortum ailesi + 500 mm ustte', (r?.netPrice ?? 0) > 0 && !!r?.matchedName?.includes('Seti 500'),
      `got ${r?.confidence} "${r?.matchedName}"`);
  }

  // ── R8 (I1,I8): FLOW SWITCH · DN 65 → akis anahtari, Paddle Tip 2 1/2"
  {
    const svc = makeService('AYVAZ', AYVAZ_EKIPMAN);
    const r = await m(svc, 'FLOW SWİTCH DN 65');
    check('R8 Paddle Tip 2 1/2" (Flow Meter degil)', !!r?.matchedName?.includes('Paddle Tip 2 1/2"') && !r?.matchedName?.includes('Meter'),
      `got ${r?.confidence} "${r?.matchedName}"`);
  }

  const AYVAZ_VANA = [
    lib('Doğalgaz Küresel Vana Dişli DN50', 2250),
    lib('Doğalgaz Küresel Vana Flanşlı DN50', 3350),
    lib('Sürgülü Vana Elastomer Sitli DN50', 3250),
    lib('Bıçaklı Sürgülü Vana Wafer DN50', 4850),
    lib('Kelebek Vana Lug Tip PN16 DN50', 1850),
    lib('Globe Vana API 623 Class 150 2"', 18500),
    lib('Monoblok Vana Sıvılar DN50', 4450),
  ];

  // ── R9 (I2,I3): DOGALGAZ VANASI KURESEL · DN50 → yalniz kuresel+gaz;
  // surgulu/kelebek/globe/"Sivilar" HICBIR skorla yok
  {
    const svc = makeService('AYVAZ', AYVAZ_VANA);
    const r = await m(svc, 'DOĞALGAZ VANASI KÜRESEL DN50');
    check('R9 yalniz gaz-kuresel varyantlar (2)', r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 2
      && !!r?.candidates?.every((c) => c.materialName.includes('Doğalgaz Küresel')),
      `adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ') ?? r?.matchedName}`);
    check('R9 surgulu/kelebek/globe/sivilar YOK',
      !r?.candidates?.some((c) => /Sürgülü|Kelebek|Globe|Sıvılar|Bıçaklı/.test(c.materialName)));
  }

  // ── R10 (I2,I3): DOGALGAZ VANASI FLANSLI · DN80 → flansli gaz vanalari;
  // tip belirtilmedi → tipler fiyatli secenek
  {
    const svc = makeService('AYVAZ', [
      lib('Doğalgaz Küresel Vana Flanşlı DN80', 5200),
      lib('Doğalgaz Kelebek Vana Flanşlı DN80', 4100),
      lib('Sürgülü Vana Elastomer Sitli DN80', 4900),   // gaz isareti yok — gosterilemez
      lib('Monoblok Vana Sıvılar DN80', 5800),          // akiskan celiskisi
    ]);
    const r = await m(svc, 'DOĞALGAZ VANASI FLANŞLI DN80');
    check('R10 tipler fiyatli secenek (kuresel+kelebek)', r?.confidence === 'multi' && (r?.candidates?.length ?? 0) === 2
      && !!r?.candidates?.every((c) => c.materialName.includes('Doğalgaz') && c.netPrice > 0),
      `adaylar: ${r?.candidates?.map((c) => `${c.materialName}=${c.netPrice}`).join(' | ') ?? r?.matchedName}`);
    check('R10 surgulu/sivilar YOK', !r?.candidates?.some((c) => /Sürgülü|Sıvılar/.test(c.materialName)));
  }

  // ── R11 (I6): basliksiz-markasiz yalin DN 25 → otomatik eslesme YOK;
  // celik 1" / PPR 25 mm adaylari kullaniciya
  {
    const svc = makeService('GENEL DAĞITIM', [
      lib('Siyah Çelik Boru 1" DN25 Dişli', 130),
      lib('PPR-C Boru 25 mm PN20', 40),
    ]);
    const r = await m(svc, 'DN 25');
    check('R11 otomatik eslesme yok, iki aday kullaniciya', r?.confidence === 'multi' && r?.netPrice === 0 && (r?.candidates?.length ?? 0) === 2,
      `got ${r?.confidence} net=${r?.netPrice} ${r?.candidates?.length} aday (${r?.reason})`);
  }

  // ── R9-EK (I2, canli vaka 13.07): "PP KURESEL VANALAR · DN 20 · AYVAZ" —
  // kutuphanede kuresel YOK, motorlu/pnomatik/selenoid/basinc-dusurucu VAR →
  // hicbiri gosterilemez (tip sert); PP kuresel sunan marka M3 ile onerilir.
  {
    const AYVAZ_OZEL_VANA = [
      lib('Basınç Düşürücü Vana Pistonlu Tip 3/4"', 5650),
      lib('Motorlu Vana 2 Yollu ON/OFF DN20', 4250),
      lib('Pnömatik Pistonlu Vana 2 Yollu DN20', 9500),
      lib('Pnömatik Pistonlu Vana 3 Yollu DN20', 10500),
      lib('Selenoid Valf 2/2 NK 3/4"', 1850),
    ];
    const OTHER = [
      { ...lib('PPR-C Küresel Vana 20 mm', 96.1), brand: { id: 'b-kalde', name: 'KALDE' } },
    ];
    const svc = makeService('AYVAZ', AYVAZ_OZEL_VANA, OTHER);
    const r = await m(svc, 'PP KÜRESEL VANALAR DN 20');
    check('R9-EK kuresel yok → motorlu/selenoid GOSTERILMEDI (none)', r?.confidence === 'none' && r?.netPrice === 0 && !r?.candidates?.length,
      `got ${r?.confidence} net=${r?.netPrice} adaylar: ${r?.candidates?.map((c) => c.materialName).join(' | ') ?? '-'} "${r?.matchedName ?? ''}"`);
    check('R9-EK alternatif: PP kuresel sunan KALDE', (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'KALDE',
      `got ${JSON.stringify(r?.alternatives?.map((a) => a.brandName))}`);
  }

  // ── R9-EK2: kutuphanede kuresel VARSA yalniz o gosterilir; motorlu/
  // selenoid hicbir skorla listeye giremez
  {
    const svc = makeService('AYVAZ', [
      lib('Küresel Vana Tam Geçişli Dişli DN20', 1450),
      lib('Motorlu Vana 2 Yollu ON/OFF DN20', 4250),
      lib('Selenoid Valf 2/2 NK 3/4"', 1850),
      lib('Pnömatik Pistonlu Vana 2 Yollu DN20', 9500),
    ]);
    const r = await m(svc, 'KÜRESEL VANALAR DN 20');
    const names = r?.candidates?.map((c) => c.materialName) ?? (r?.matchedName ? [r.matchedName] : []);
    check('R9-EK2 yalniz kuresel', names.length === 1 && names[0].includes('Küresel'),
      `got ${r?.confidence} adaylar: ${names.join(' | ')}`);
    check('R9-EK2 motorlu/selenoid/pnomatik yok', !names.some((n) => /Motorlu|Selenoid|Pnömatik/.test(n)));
  }

  // ── R12 (A-1): FITTINGS ORANI → malzeme eslestirmesi yapilmaz
  {
    const svc = makeService('ÇAYIROVA', [lib('Siyah Çelik Boru 1" DN25 Dişli', 130)]);
    const r = await m(svc, 'FİTTİNGS ORANI');
    check('R12 urun degil (oran satiri)', r?.notProduct === true && r?.netPrice === 0, `got ${JSON.stringify(r)}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SPEC REGRESYON (R1-R12): ${passed} PASS, ${failed} FAIL`);
  console.log('R13 kaniti → npm run test:admin-import (Z1-Z6) · R14 kaniti → npm run test:library (L1-L5)');
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
