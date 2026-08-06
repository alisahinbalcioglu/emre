/**
 * S2 + S3 — ONERI KUTUSU: CEKINCE TASINIR, ZAYIF ADAY ONERILMEZ
 *   npx ts-node test/oneri-kutusu-cekince-test.ts   (npm run test:oneri)
 *
 * ── TESHIS (olculdu, 06.08.2026) ───────────────────────────────────────────
 * Capraz-marka/firma onerisi ana motoru (runQuery) cagirir. O motor tek adayi
 * "ask" (onaylat) diye isaretleyebilir — I6 kapisi: dogrulanamayan eslesme
 * fiyat YAZAMAZ. AMA tasima tipi (BrandAlternative) cekince tasimiyordu ve
 * FE bunu "Bu markada urun yok — su markalarda var:" KESINLIK basligiyla
 * ciziyordu. Yani ana ekranda ASLA otomatik yazilamayacak bir aday, oneri
 * kutusunda TEK SECENEK ve KESIN gibi goruluyordu.
 *
 * ── IKI AYRI ISTEK, IKI AYRI OLCUT ─────────────────────────────────────────
 * S2 (CEKINCEYI TASI): kapidan gecemeyen ama MESRU kalan aday (yalniz
 *     "bilinmeyen kelime" kapisina takilan) oneri olarak DONER, fakat
 *     cekincesini (uyariNot + bilinmeyen) BERABERINDE tasir.
 * S3 (ZAYIF ADAYI ONERME): kanidi EN ZAYIF iki kapiyla ayakta kalan aday
 *     (capsiz-dusum = capi dogrulanamadi · ad-gevsetildi = adi birebir
 *     tutmadi) oneri kutusuna HIC GIRMEZ.
 *
 * ── "BILINMEYEN KELIME" NEDEN AYRI TUTULDU (S3 madde 3'un gerekcesi) ──────
 * `capsiz-dusum` ve `ad-gevsetildi` adayin KIMLIGINI zayiflatir: biri capin,
 * digeri adin dogrulanmadigini soyler — ikisi de urunun NE OLDUGU sorusuna
 * dokunur. `bilinmeyen kelime` ise satirda YAZILI ama o markanin dagarciginda
 * bulunmayan bir kelimedir; urunun kimligini degil, satirin EK niteligini
 * belirsiz birakir ("paslanmaz" yazili, marka cinsi hic deklare etmemis).
 * Capraz-marka onerisinin butun anlami "bu marka bilmiyor, baskasi biliyor"
 * demektir; bilinmeyen kelimeyi de eleseydik ONERI MEKANIZMASI KENDINI
 * YERDI (bkz. M4/L4 — 'PP KURESEL' → KALDE vakasi bu yoldan gecer).
 *
 * ── OLCUT NEDEN SAYI DEGIL, KIRILIM ────────────────────────────────────────
 * "Alternatif sayisi 0" tek basina kanit degildir: havuz bos olsaydi da 0
 * cikardi. Her zayif fixture icin AYRICA, ayni havuz KENDI markasi olarak
 * sorgulandiginda 1 aday urettigi assert edilir (G* satirlari) — yani
 * "aday yok" ile "aday elendi" birbirine karismaz.
 *
 * ── IKI AILE ──────────────────────────────────────────────────────────────
 * Her olcut hem MALZEME (findAlternativesV2) hem ISCILIK (findLaborAlternativesV2)
 * yolunda kosulur. Ikisi ayri metottur; birinde duzeltilip digerinde
 * unutulan bir kural GENEL DEGILDIR.
 */

import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import type { MatchResult } from '../src/ozellik/eslestirme/matching/types';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const FX = {
  getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }),
} as any;

// ═══════════════ MALZEME KANADI (findAlternativesV2) ═══════════════════════

function lib(name: string, price: number, extra?: Record<string, unknown>) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0, ...extra };
}

function malzemeServis(brandName: string, libRows: any[], otherBrandRows: any[] = []): MatchingService {
  const prisma: any = {
    userLibrary: {
      findMany: async (args: any) => {
        const b = args?.where?.brandId;
        if (b && typeof b === 'object' && 'not' in b) return otherBrandRows;
        return libRows;
      },
    },
    brand: { findUnique: async () => ({ name: brandName }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
    terminologyAlias: {
      findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })),
    },
  };
  return new MatchingService(prisma, new TerminologyService(prisma), FX);
}

/** Ana markada bu urun ailesi HIC yok → alternatif taramasi acilir. */
const MALZEME_ANA = [lib('Siyah Çelik Boru 1" DN25', 130)];

// Zayif-1: urunun capi YOK, satirin capi VAR → capsiz-dusum kapisi.
const M_CAPSIZ = [lib('Küresel Vana Pirinç Tam Geçişli', 111)];
// Zayif-2: satirin ad kisiti bu adayi elerdi, cins kisiti ad daraltmasini
// gevsetti → ad-gevsetildi kapisi ("Kelebek" urunu "Küresel" satirina geldi).
const M_GEVSEK = [
  lib('Küresel Vana DN50', 333, { cins: 'Pirinç' }),
  lib('Kelebek Vana DN50', 444, { cins: 'Paslanmaz' }),
];
// KALKAN: cap + ad TAM tutan aday — kapiya hic takilmaz ('single').
const M_SAGLAM = [lib('Küresel Vana DN20 Pirinç', 222)];
// MESRU CEKINCELI: yalniz "paslanmaz" kelimesi dogrulanamadi.
const M_CEKINCE = [lib('Küresel Vana DN20 Pirinç', 222)];

function markali(rows: any[], marka: string) {
  return rows.map((x, i) => ({ ...x, id: `${x.id}|o${i}`, brand: { id: `b-${marka}`, name: marka } }));
}

async function malzemeAlt(rows: any[], marka: string, satir: string): Promise<MatchResult> {
  const svc = malzemeServis('ANA MARKA', MALZEME_ANA, markali(rows, marka));
  return (await svc.bulkMatch('u1', 'brand-ana', [satir]))[satir];
}

async function malzemeKendi(rows: any[], satir: string): Promise<MatchResult> {
  return (await malzemeServis('X', rows).bulkMatch('u1', 'brand-x', [satir]))[satir];
}

// ═══════════════ ISCILIK KANADI (findLaborAlternativesV2) ══════════════════

function lp(name: string, unitPrice: number, o: Record<string, any> = {}) {
  return {
    id: `lp|${name}`, unitPrice, discountRate: 0, unit: o.unit ?? 'adet', currency: 'TRY',
    laborItem: {
      id: `li|${name}`, name, unit: o.unit ?? 'adet', unitPrice,
      discipline: 'mechanical', category: null, description: null,
      cins: o.cins ?? null, baglanti: null, capRaw: o.capRaw ?? null, boyMm: null, not: null,
      // adSlug+adBucket DOLU + indexVersion eski → "kolonlu bayat" yolu:
      // cins KOLONU boylece motora ulasir (legacy yolda cins kolonu okunmaz).
      adSlug: o.adSlug ?? null, adBucket: o.adBucket ?? null, adTokens: [], cinsNorm: null, cinsTokens: [],
      baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown',
      capTags: [], capNorm: null, boyTag: null, displayName: null,
      indexVersion: 0, belirsiz: false,
    },
  };
}

function iscilikServis(main: any[], other: any[]): MatchingService {
  const prisma: any = {
    laborPrice: {
      findMany: async (args: any) => {
        if (args?.where?.firmaId) return main;
        if (args?.where?.firma) return other.map((r) => ({ ...r, firma: { id: 'firma-B', name: 'B FİRMASI' } }));
        return [];
      },
    },
    laborItem: { findMany: async () => [], update: async () => ({}) },
    userLibrary: { findMany: async () => [] },
    brand: { findUnique: async () => null },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
    terminologyAlias: {
      findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })),
    },
  };
  return new MatchingService(prisma, new TerminologyService(prisma), FX);
}

const ISCILIK_ANA = [lp('Siyah çelik boru montajı DN25', 90, { unit: 'mt' })];
const KOLONLU = { adSlug: 'x', adBucket: 'x' };

const L_CAPSIZ = [lp('Küresel vana montajı', 500)];
const L_GEVSEK = [
  lp('Küresel vana DN50', 700, { ...KOLONLU, cins: 'Pirinç', capRaw: 'DN50' }),
  lp('Kelebek vana DN50', 800, { ...KOLONLU, cins: 'Paslanmaz', capRaw: 'DN50' }),
];
const L_SAGLAM = [lp('Küresel vana montajı DN20', 600)];
const L_CEKINCE = [lp('Küresel vana montajı DN20', 600)];

async function iscilikAlt(rows: any[], satir: string): Promise<MatchResult> {
  return (await iscilikServis(ISCILIK_ANA, rows).bulkMatchLabor('u1', 'firma-A', [satir]))[satir];
}
async function iscilikKendi(rows: any[], satir: string): Promise<MatchResult> {
  return (await iscilikServis(rows, []).bulkMatchLabor('u1', 'firma-A', [satir]))[satir];
}

// Cekince alanlari BUGUN tipte yok → `any` uzerinden okunur; alan eklenince
// tsc ayrica dogrular (bkz. types.ts BrandAlternative).
const cek = (a: any) => ({ uyariNot: a?.uyariNot as string | undefined, bilinmeyen: a?.bilinmeyen as string[] | undefined });

const SATIR_CAPSIZ = 'KÜRESEL VANA DN 20';
const SATIR_GEVSEK = 'KÜRESEL VANA PASLANMAZ DN 50';
const SATIR_SAGLAM = 'KÜRESEL VANA DN 20';
const SATIR_CEKINCE = 'KÜRESEL VANA PASLANMAZ DN 20';

async function run() {
  // ══════════════════════════════════════════════════════════════════════
  // G — BOS KUME KAPILARI: her fixture havuzu GERCEKTEN dolu ve GERCEKTEN
  //     bu satira aday uretiyor. Bunlar olmadan "0 alternatif" cumlesi
  //     "0 aday vardi" ile ayirt edilemezdi.
  // ══════════════════════════════════════════════════════════════════════
  {
    const r = await malzemeKendi(M_CAPSIZ, SATIR_CAPSIZ);
    check('G1 M-CAPSIZ havuzu DOLU: kendi markasinda 1 aday (capsiz kapisi)',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} aday=${r?.candidates?.length}`);
    check('G1b M-CAPSIZ kapisi CAP kapisi (uyari capi soyluyor)',
      !!r?.reason && /çapı doğrulanamadı/.test(r.reason), `got "${r?.reason}"`);
  }
  {
    const r = await malzemeKendi(M_GEVSEK, SATIR_GEVSEK);
    check('G2 M-GEVSEK havuzu DOLU: kendi markasinda 1 aday (gevsetme kapisi)',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} aday=${r?.candidates?.length}`);
    check('G2b M-GEVSEK kapisi AD kapisi (uyari adi soyluyor)',
      !!r?.reason && /Ad birebir eşleşmedi/.test(r.reason), `got "${r?.reason}"`);
  }
  {
    const r = await malzemeKendi(M_SAGLAM, SATIR_SAGLAM);
    check('G3 M-SAGLAM havuzu DOLU: kendi markasinda KESIN eslesme (high)',
      r?.confidence === 'high' && r?.netPrice === 222, `got ${r?.confidence} net=${r?.netPrice}`);
  }
  {
    const r = await malzemeKendi(M_CEKINCE, SATIR_CEKINCE);
    check('G4 M-CEKINCE havuzu DOLU: kendi markasinda 1 aday (bilinmeyen kapisi)',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} aday=${r?.candidates?.length}`);
    check('G4b M-CEKINCE kapisi KELIME kapisi (uyari kelimeyi soyluyor)',
      !!r?.reason && /paslanmaz.*doğrulanamadı/.test(r.reason), `got "${r?.reason}"`);
  }
  {
    const r = await iscilikKendi(L_CAPSIZ, SATIR_CAPSIZ);
    check('G5 L-CAPSIZ havuzu DOLU: kendi firmasinda 1 aday',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} aday=${r?.candidates?.length}`);
  }
  {
    const r = await iscilikKendi(L_GEVSEK, SATIR_GEVSEK);
    check('G6 L-GEVSEK havuzu DOLU: kendi firmasinda 1 aday',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} aday=${r?.candidates?.length}`);
  }
  {
    const r = await iscilikKendi(L_SAGLAM, SATIR_SAGLAM);
    check('G7 L-SAGLAM havuzu DOLU: kendi firmasinda KESIN eslesme (high)',
      r?.confidence === 'high' && r?.netPrice === 600, `got ${r?.confidence} net=${r?.netPrice}`);
  }
  {
    const r = await iscilikKendi(L_CEKINCE, SATIR_CEKINCE);
    check('G8 L-CEKINCE havuzu DOLU: kendi firmasinda 1 aday',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} aday=${r?.candidates?.length}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // S3 — ZAYIF ADAY ONERILMEZ (capsiz-dusum · ad-gevsetildi)
  // ══════════════════════════════════════════════════════════════════════
  {
    const r = await malzemeAlt(M_CAPSIZ, 'MARKA-CAPSIZ', SATIR_CAPSIZ);
    check('S3-M1 capi dogrulanamayan aday MALZEME onerisi OLMAZ',
      (r?.alternatives?.length ?? 0) === 0, `got ${JSON.stringify(r?.alternatives)}`);
  }
  {
    const r = await malzemeAlt(M_GEVSEK, 'MARKA-GEVSEK', SATIR_GEVSEK);
    check('S3-M2 adi gevsetilerek bulunan aday MALZEME onerisi OLMAZ',
      (r?.alternatives?.length ?? 0) === 0, `got ${JSON.stringify(r?.alternatives)}`);
  }
  {
    const r = await iscilikAlt(L_CAPSIZ, SATIR_CAPSIZ);
    check('S3-L1 capi dogrulanamayan aday ISCILIK onerisi OLMAZ',
      (r?.alternatives?.length ?? 0) === 0, `got ${JSON.stringify(r?.alternatives)}`);
  }
  {
    const r = await iscilikAlt(L_GEVSEK, SATIR_GEVSEK);
    check('S3-L2 adi gevsetilerek bulunan aday ISCILIK onerisi OLMAZ',
      (r?.alternatives?.length ?? 0) === 0, `got ${JSON.stringify(r?.alternatives)}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // KALKAN — saglam aday HALA onerilir (daraltma her seyi kesmedi)
  // ══════════════════════════════════════════════════════════════════════
  {
    const r = await malzemeAlt(M_SAGLAM, 'MARKA-SAGLAM', SATIR_SAGLAM);
    check('K1 saglam aday MALZEME onerisi olarak HALA doner',
      (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'MARKA-SAGLAM',
      `got ${JSON.stringify(r?.alternatives)}`);
    check('K1b saglam aday CEKINCESIZ (kesinlik iddiasi mesru)',
      !cek(r?.alternatives?.[0]).uyariNot, `got "${cek(r?.alternatives?.[0]).uyariNot}"`);
  }
  {
    const r = await iscilikAlt(L_SAGLAM, SATIR_SAGLAM);
    check('K2 saglam aday ISCILIK onerisi olarak HALA doner',
      (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'B FİRMASI',
      `got ${JSON.stringify(r?.alternatives)}`);
    check('K2b saglam iscilik adayi CEKINCESIZ',
      !cek(r?.alternatives?.[0]).uyariNot, `got "${cek(r?.alternatives?.[0]).uyariNot}"`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // S2 — CEKINCE TASINIR (mesru ama kesin-olmayan aday)
  // ══════════════════════════════════════════════════════════════════════
  {
    const r = await malzemeAlt(M_CEKINCE, 'MARKA-CEKINCE', SATIR_CEKINCE);
    check('S2-M0 cekinceli aday MALZEME onerisi olarak DONER (elenmedi)',
      (r?.alternatives?.length ?? 0) === 1, `got ${JSON.stringify(r?.alternatives)}`);
    const c = cek(r?.alternatives?.[0]);
    check('S2-M1 cekinceli MALZEME adayi uyariNot TASIR',
      typeof c.uyariNot === 'string' && c.uyariNot.length > 0, `got ${JSON.stringify(c.uyariNot)}`);
    check('S2-M2 uyariNot NEDENI soyler (dogrulanamayan kelime metinde)',
      !!c.uyariNot && /paslanmaz/i.test(c.uyariNot), `got "${c.uyariNot}"`);
    check('S2-M3 cekinceli MALZEME adayi bilinmeyen kelimeleri TASIR',
      (c.bilinmeyen ?? []).some((t) => /paslanmaz/i.test(t)), `got ${JSON.stringify(c.bilinmeyen)}`);
  }
  {
    const r = await iscilikAlt(L_CEKINCE, SATIR_CEKINCE);
    check('S2-L0 cekinceli aday ISCILIK onerisi olarak DONER (elenmedi)',
      (r?.alternatives?.length ?? 0) === 1, `got ${JSON.stringify(r?.alternatives)}`);
    const c = cek(r?.alternatives?.[0]);
    check('S2-L1 cekinceli ISCILIK adayi uyariNot TASIR',
      typeof c.uyariNot === 'string' && c.uyariNot.length > 0, `got ${JSON.stringify(c.uyariNot)}`);
    check('S2-L2 cekinceli ISCILIK adayi bilinmeyen kelimeleri TASIR',
      (c.bilinmeyen ?? []).some((t) => /paslanmaz/i.test(t)), `got ${JSON.stringify(c.bilinmeyen)}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // M4/L4 — MESRU ONERI KORUNDU (S3 madde 4: daraltmanin yan etkisi olcusu)
  // Kodun 454-457 satirlarinda gerekcelendirilen 'PP KURESEL' → KALDE vakasi.
  // Bu vaka daraltmadan SONRA da onerilmelidir; dusesse esik fazla sert
  // demektir. (Ayni vaka spec-regression R9-EK ve matching-unit C1'de de var —
  // buradaki assert onlarin kopyasi degil, DARALTMA SONRASI olcumdur.)
  // ══════════════════════════════════════════════════════════════════════
  {
    const AYVAZ_OZEL_VANA = [
      lib('Basınç Düşürücü Vana Pistonlu Tip 3/4"', 5650),
      lib('Motorlu Vana 2 Yollu ON/OFF DN20', 4250),
      lib('Pnömatik Pistonlu Vana 2 Yollu DN20', 9500),
      lib('Selenoid Valf 2/2 NK 3/4"', 1850),
    ];
    const svc = malzemeServis('AYVAZ', AYVAZ_OZEL_VANA, [
      { ...lib('PPR-C Küresel Vana 20 mm', 96.1), brand: { id: 'b-kalde', name: 'KALDE' } },
    ]);
    const satir = 'PP KÜRESEL VANALAR DN 20';
    const r = (await svc.bulkMatch('u1', 'brand-ayvaz', [satir]))[satir];
    check('M4 mesru vaka KORUNDU: PP kuresel sunan KALDE hala onerilir',
      (r?.alternatives?.length ?? 0) === 1 && r?.alternatives?.[0]?.brandName === 'KALDE',
      `got ${JSON.stringify(r?.alternatives?.map((a) => a.brandName))}`);
  }

  console.log('\n============================================================');
  console.log(`ONERI KUTUSU CEKINCE (S2+S3): ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { console.log('--- FAIL ---'); failures.forEach((f) => console.log(`  • ${f}`)); }
  console.log('============================================================');
  if (failed > 0) process.exit(1);
}

run();
