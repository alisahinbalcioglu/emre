/**
 * FAZ C (C1) — A11 BUYUK HARF BIRIM · A12 HAVUZ SIRASI · CEKIM EKI (borusu ↔ borular)
 *   npx ts-node test/birim-sira-cekim-test.ts   (npm run test:birim-sira-cekim)
 *
 * OLCULDU (05.10, mevcut kod):
 *   A11 `birimKanonik` ve (FAZ B'de yazdigim) `fiyatBirimiSinifi` birimi
 *       toLocaleLowerCase('tr') ile kucultuyor: Turkce kuralda I → ı, yani
 *       "PIECE" → "pıece", "KILO" → "kılo", "LITRE" → "lıtre", "CIFT" → "cıft"
 *       — HICBIRI tanınmıyor. Iscilik L6 (birimSert) "PIECE" satirinda metre
 *       fiyatli kalemi ELEMIYOR; B10 kapisi "KILO" yazan satirda acilmiyor.
 *       Ayni sinifin ikizi: B10 siniflayicim AYNI kusuru tasiyordu.
 *   A12 Eslestirme havuzu sorgulari (kutuphane ana + oneri, iscilik ana +
 *       oneri) `orderBy` TASIMIYOR: Postgres sirasi tanimsiz — ayni teklif iki
 *       kosumda farkli aday sirasi / esitlikte farkli ilk aday verebilir.
 *   CEKIM `tokenEsit('borusu','borular')` false (vanasi/vanalar,
 *       borulari/borusu da): ONEK toleransi yalniz biri digerinin onekiyse
 *       calisiyor. Gercek vaka (Pimtas, servis + sozluk): "PİS SU BORUSU
 *       110 mm" asil pis su borularini ("U-PVC Geçme Muflu Borular") HIC
 *       listelemiyor, yalniz "… Boru" adlilari gosteriyordu.
 */
import { buildProductIndex, tokenEsit, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, birimKanonik, fiyatBirimiSinifi } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);
let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number; birim?: string | null }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return { id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: c.birim ?? null } } as IndexedRow;
}
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} kapilar=${js(o.kapilar)}`;

function kutuphaneSatiri(c: any, i: number, sortOrder: number) {
  const idx = buildProductIndex(c);
  return {
    id: `lib-s${i}`, materialId: null, material: null, materialName: idx.displayName, sortOrder,
    listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: `pi-s${i}`,
    product: { ...idx, id: `pi-s${i}`, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null,
      kategori: c.kategori ?? null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: c.birim ?? null },
  };
}

async function main() {
  // ══ A11 · BUYUK HARF BIRIM ═════════════════════════════════════════
  const b: Array<[string, string | null, string | null]> = [
    ['PIECE', 'adet', 'sayi'], ['PİECE', 'adet', 'sayi'], ['KILO', null, 'kg'], ['LITRE', null, 'lt'],
    ['CIFT', null, 'cift'], ['ÇİFT', null, 'cift'], ['METREKÜP', null, 'm3'], ['TAKIM', 'takim', 'sayi'], ['MTÜL', 'metre', 'metre'],
  ];
  for (const [u, k, f] of b) {
    check(`★ A11 birimKanonik("${u}") = ${k}`, birimKanonik(u) === k, String(birimKanonik(u)));
    check(`★ A11 fiyatBirimiSinifi("${u}") = ${f}`, fiyatBirimiSinifi(u) === f, String(fiyatBirimiSinifi(u)));
  }
  const boru = (birim: string) => urun({ ad: 'Siyah Çelik Boru', cins: 'siyah', cap: '2"', price: 60, birim });
  const l6 = runQuery(parseLine('SİYAH ÇELİK BORU 2"', 'PIECE'), [boru('mt')], { birimSert: true }) as any;
  check('★ A11 L6: "PIECE" satiri metre fiyatli iscilik kalemini ELER (birim-uyumsuz)', l6.kind === 'none' && l6.reason === 'birim-uyumsuz', ozet(l6));
  const l6k = runQuery(parseLine('SİYAH ÇELİK BORU 2"', 'PIECE'), [boru('Ad.')], { birimSert: true }) as any;
  check('A11 karsi: "PIECE" satiri adet fiyatli kalemi bulur', l6k.kind === 'single', ozet(l6k));
  const b10 = runQuery(parseLine('SİYAH ÇELİK BORU 2"', 'METRE'), [boru('KILO')]) as any;
  check('★ A11 B10: "KILO" fiyatli urun "METRE" satirinda fiyat-birimi kapisini acar', b10.kind === 'ask' && (b10.kapilar ?? []).includes('fiyat-birimi'), ozet(b10));

  // ══ CEKIM EKI · borusu ↔ borular ════════════════════════════════════
  const esit: Array<[string, string, boolean]> = [
    ['borusu', 'borular', true], ['borulari', 'borusu', true], ['vanasi', 'vanalar', true], ['kelepcesi', 'kelepceler', true],
    ['borusu', 'boru', true], ['boru', 'borular', true],
    // KARSI: ek kumesi disi / olumsuzluk / kisa kok
    ['galvanizsiz', 'galvanizler', false], ['pompasi', 'pompali', false], ['disli', 'disko', false], ['kanali', 'kanat', false],
    // kisa kok (<4) belirsizdir: el+i / el+ler — kural ONEK_MIN'i korur
    ['eli', 'eller', false],
  ];
  for (const [a, c, e] of esit) check(`${e ? '★ ' : ''}CEKIM tokenEsit("${a}","${c}") = ${e}`, tokenEsit(a, c) === e && tokenEsit(c, a) === e, `${tokenEsit(a, c)}/${tokenEsit(c, a)}`);

  // Gercek vaka: servis yolu (gercek sozluk) — "PİS SU BORUSU 110 mm"
  {
    const havuz = [
      { kategori: 'U-PVC Geçme Muflu Pis Su Boruları', ad: 'U-PVC Geçme Muflu Borular', cins: 'PN 4', cap: '110 mm', price: 6.69 },
      { kategori: 'U-PVC Basınçlı Borular', ad: 'U-PVC Zonder Boru', cins: 'PN 20', cap: '110 mm', price: 27.75 },
    ].map((c, i) => kutuphaneSatiri(c, i, i));
    const prisma: any = {
      userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : havuz) },
      brand: { findUnique: async () => ({ name: 'PIMTAS' }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, k: number) => ({ id: `a${k}`, userId: null, active: true,
        alias: s.alias, canonical: s.canonical, kinds: s.kinds, impliedType: s.impliedType, sizeClass: s.sizeClass, stripTags: s.stripTags })) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'f', date: '' }) } as any;
    const s: any = new MatchingService(prisma, new TerminologyService(prisma), fx);
    const log = console.log; console.log = () => {};
    const q = 'PİS SU BORUSU 110 mm';
    const r = (await s.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', [q]))[q];
    console.log = log;
    const adlar = (r?.candidates ?? []).map((c: any) => c.materialName).concat(r?.matchedName ? [r.matchedName] : []);
    check('CEKIM olcutun kendisi: servis "U-PVC Zonder Boru"yu buluyor', adlar.some((a: string) => /Zonder/.test(a)), js(adlar));
    check('★ CEKIM gercek vaka: "PİS SU BORUSU 110 mm" asil pis su borusunu ("… Borular") da listeler', adlar.some((a: string) => /Geçme Muflu Borular/.test(a)), js(adlar));
  }

  // ══ A12 · HAVUZ SIRASI (dort sorgu) ═════════════════════════════════
  {
    const yakalanan: Record<string, any[]> = { kutAna: [], kutOneri: [], iscAna: [], iscOneri: [] };
    const prisma: any = {
      userLibrary: { findMany: async (a: any) => { (a?.where?.brandId && typeof a.where.brandId === 'object' ? yakalanan.kutOneri : yakalanan.kutAna).push(a); return []; } },
      laborPrice: { findMany: async (a: any) => { (a?.where?.firmaId ? yakalanan.iscAna : yakalanan.iscOneri).push(a); return []; } },
      brand: { findUnique: async () => ({ name: 'X' }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => [] },
      user: { findUnique: async () => ({ firmaId: 'f1' }) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'f', date: '' }) } as any;
    const s: any = new MatchingService(prisma, new TerminologyService(prisma), fx);
    const log = console.log; console.log = () => {};
    // Ana havuz bos → yine de sorgulanir; oneri havuzlari dogrudan
    await s.bulkMatch({ userId: 'u1', firmaId: 'f1' }, 'b1', ['Küresel Vana 1"']);
    await s.malzemeOneriHavuzu({ userId: 'u1', firmaId: 'f1' }, 'b1');
    await s.bulkMatchLabor({ userId: 'u1', firmaId: 'f1' }, 'firma-A', ['Boru montajı 2"']);
    await s.iscilikOneriHavuzu({ userId: 'u1', firmaId: 'f1' }, 'firma-A');
    console.log = log;
    const KUT = js([{ sortOrder: 'asc' }, { id: 'asc' }]);
    const ISC = js([{ laborItem: { name: 'asc' } }, { id: 'asc' }]);
    check('A12 olcutun kendisi: dort sorgu da yakalandi', Object.values(yakalanan).every((v) => v.length > 0), js(Object.fromEntries(Object.entries(yakalanan).map(([k, v]) => [k, v.length]))));
    check('★ A12 kutuphane ANA havuz siralı (sortOrder, id)', js(yakalanan.kutAna[0]?.orderBy) === KUT, js(yakalanan.kutAna[0]?.orderBy));
    check('★ A12 kutuphane ONERI havuzu siralı (sortOrder, id)', js(yakalanan.kutOneri[0]?.orderBy) === KUT, js(yakalanan.kutOneri[0]?.orderBy));
    check('★ A12 iscilik ANA havuz siralı (kalem adi, id — firma ekraniyla ayni)', js(yakalanan.iscAna[0]?.orderBy) === ISC, js(yakalanan.iscAna[0]?.orderBy));
    check('★ A12 iscilik ONERI havuzu siralı', js(yakalanan.iscOneri[0]?.orderBy) === ISC, js(yakalanan.iscOneri[0]?.orderBy));
  }

  console.log(`\n${'='.repeat(60)}\nBIRIM · SIRA · CEKIM (FAZ C1): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
