/**
 * PARANTEZ ICI NITELIK (P2, P4 bulgusu 05.10) — YUMUSAK AYIRICI.
 *
 * Olculen kusur: satir cozucu (line-parser) parantez icini kisit token'larindan
 * ATAR (Faz 2b H1/R6: "(ROZET DAHİL)" notu aileyi kaciriyordu), urun indeksi ise
 * ATMAZ ("Küresel Vana (tam geçişli)" → adTokens kuresel/vana/tam/gecisli).
 * Sonuc: "Küresel Vana (tam geçişli) 1\"" satiri havuzda duz "Küresel Vana 1\""
 * da varsa SESSIZCE duz vanaya fiyatlaniyordu (tam-ad onceligi); yalniz cesitler
 * varsa ayirt edemeyip soruya dusuyordu (P4: "parantezli satir eslesmiyor").
 * Pimtas'ta parantez ici gercek cesit ayiricisidir ("tek/cift taraf icten
 * disli", "30 mm laynerli/laynersiz", renk) — kulliyat olcumu 05.10.
 *
 * Kural: parantez sozcukleri HAVUZDA TANINIYORSA ayirici olur (tam ad once
 * "ad + parantez" ile denenir; coklu aday parantezle daraltilir); taninmiyorsa
 * YOK SAYILIR — asla bilinmeyen-sozcuk kisiti/notu uretmez (Faz 2b korumasi).
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
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
function urun(ad: string, cap: string | null, price: number, cins: string | null = null) {
  n++;
  const idx = buildProductIndex({ ad, cap, cins, price } as ProductColumns);
  return { id: `lib-${n}`, materialId: null, material: null, materialName: idx.displayName, listPrice: price, customPrice: null,
    discountRate: 0, currency: 'TRY', productIndexId: `pi-${n}`, brand: { id: 'b1', name: 'B1' },
    product: { ...idx, id: `pi-${n}`, ad, cins, baglanti: null, capRaw: cap, kategori: null, boyMm: null, urunKodu: null, sheetName: null, price, birim: null } };
}
async function esle(kutuphane: any[], satirlar: string[]): Promise<Record<string, any>> {
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : kutuphane) },
    brand: { findUnique: async () => ({ name: 'B1' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'u1' }) },
  };
  const svc = new MatchingService(prisma, new TerminologyService(prisma), { getRates: async () => ({ usdTry: 40, eurTry: 48, source: 'tcmb' }) } as any);
  const a = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try { return await svc.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', satirlar); } finally { Object.assign(console, a); }
}
const ozet = (r: any) => (r?.netPrice > 0 ? `FIYAT ${r.netPrice} (${r.matchedName})` : `${r?.confidence} aday=${r?.candidates?.length ?? 0} ${js((r?.candidates ?? []).map((c: any) => c.materialName))}`);

async function main() {
  // ══ P1 · duz kardes varken parantezli nitelik YANLIS urune gitmez ═══════
  const vanalar = [urun('Küresel Vana', '1"', 100), urun('Küresel Vana (tam geçişli)', '1"', 140)];
  const s1 = 'Küresel Vana (tam geçişli) 1"';
  const r1 = await esle(vanalar, [s1, 'Küresel Vana 1"', 'Küresel Vana 1" (tam geçişli)', 'KÜRESEL VANA TAM GEÇİŞLİ 1"']);
  check(`★ P1 "${s1}" → tam geçişli (140), duz vana DEGIL`, r1[s1]?.netPrice === 140, ozet(r1[s1]));
  check('★ P1b parantez olcuden SONRA da ayni: "Küresel Vana 1\\" (tam geçişli)" → 140', r1['Küresel Vana 1" (tam geçişli)']?.netPrice === 140, ozet(r1['Küresel Vana 1" (tam geçişli)']));
  check('P1 karsi: parantezsiz "Küresel Vana 1\\"" → duz vana (100) — davranis ayni', r1['Küresel Vana 1"']?.netPrice === 100, ozet(r1['Küresel Vana 1"']));
  check('P1 karsi: parantezsiz yazilan "KÜRESEL VANA TAM GEÇİŞLİ 1\\"" → 140 (bugun de dogru)', r1['KÜRESEL VANA TAM GEÇİŞLİ 1"']?.netPrice === 140, ozet(r1['KÜRESEL VANA TAM GEÇİŞLİ 1"']));

  // ══ P2 · yalniz parantezle ayrisan cesitler (Pimtas bicimi) ══════════════
  const cekvalfler = [urun('Çekvalf (tek taraf içten dişli)', '1"', 210), urun('Çekvalf (çift taraf içten dişli)', '1"', 250)];
  const s2 = 'Çekvalf (çift taraf içten dişli) 1"';
  const s2b = 'Çekvalf (tek taraf içten dişli) 1"';
  const r2 = await esle(cekvalfler, [s2, s2b, 'Çekvalf 1"']);
  check(`★ P2 "${s2}" → cift taraf (250)`, r2[s2]?.netPrice === 250, ozet(r2[s2]));
  check(`★ P2b "${s2b}" → tek taraf (210)`, r2[s2b]?.netPrice === 210, ozet(r2[s2b]));
  check('P2 karsi: niteliksiz "Çekvalf 1\\"" hala SORU (iki cesit, sistem secmez)', !(r2['Çekvalf 1"']?.netPrice > 0) && (r2['Çekvalf 1"']?.candidates?.length ?? 0) === 2, ozet(r2['Çekvalf 1"']));
  // tam ad yok (parantez urun adindan KISA) → alt-kume coklu aday parantezle YUMUSAK daraltilir
  const s2c = 'Çekvalf (çift taraf) 1"';
  const r2c = await esle(cekvalfler, [s2c]);
  check(`★ P2c "${s2c}" (eksik nitelik) → cift taraf (250): tam ad yokken coklu aday daraltilir`, r2c[s2c]?.netPrice === 250, ozet(r2c[s2c]));
  // not + nitelik karisik parantez: havuzda TANINMAYAN 'yeni/planlanan' (belirtec URETIR — 'montaj/dahil'
  // uretmez, sinamaz) tam ad aramasini bosa dusurmez
  const s1m = 'Küresel Vana (tam geçişli, yeni planlanan) 1"';
  const r1m = await esle(vanalar, [s1m]);
  check(`★ P1c "${s1m}" → 140: taninmayan not sozcugu yok sayilir, nitelik kullanilir`, r1m[s1m]?.netPrice === 140, ozet(r1m[s1m]));

  // ══ P3 · havuzda TANINMAYAN parantez = not → yok sayilir, kisit/not uretmez ══
  const tek = [urun('Küresel Vana', '1"', 100)];
  const notlar = ['Küresel Vana 1" (Yeni Planlanan)', 'Küresel Vana (montaj aparatı dahil) 1"', 'Küresel Vana (tam geçişli) 1"'];
  const r3 = await esle(tek, ['Küresel Vana 1"', ...notlar]);
  for (const s of notlar) {
    check(`P3 karsi: "${s}" notu yok sayilir → parantezsiz satirla AYNI sonuc`, js(r3[s]?.netPrice) === js(r3['Küresel Vana 1"']?.netPrice) && js(r3[s]?.dogrulanamadi ?? []) === js(r3['Küresel Vana 1"']?.dogrulanamadi ?? []) && r3[s]?.netPrice === 100, ozet(r3[s]));
  }

  // ══ P4 · Faz 2b korumasi: "(ROZET DAHİL)" aileyi kacirmaz, rozete daraltmaz ══
  const sprinkler = [urun('Sprinkler Başlığı', '1/2"', 80), urun('Sprinkler Rozeti', '1/2"', 15)];
  const s4 = 'Sprinkler Başlığı 1/2" (ROZET DAHİL)';
  const r4 = await esle(sprinkler, [s4, 'Sprinkler Başlığı 1/2"']);
  check(`P4 karsi: "${s4}" → başlık (80), rozet DEGIL — parantezsiz satirla ayni`, r4[s4]?.netPrice === 80 && js(r4[s4]?.netPrice) === js(r4['Sprinkler Başlığı 1/2"']?.netPrice), ozet(r4[s4]));

  console.log(`\n${'='.repeat(60)}\nPARANTEZ NITELIGI (P2): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
