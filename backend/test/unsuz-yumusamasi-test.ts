/**
 * UNSUZ YUMUSAMASI (P2 (c), 05.10) — token esitligi: "dirsek" ↔ "dirseği" ↔ "dirsekler".
 *
 * Olculen kusur: tokenEsit (product-index) eki ONEK toleransiyla, iyelik/cogulu
 * CEKIM_EKI ile geciriyor; sert unsuzun yumusadigi bicim (k→ğ, p→b, t→d) ortak
 * koku paylasir ama ikisi de digerinin oneki DEGIL ve kalanlar ("k" / "gi")
 * CEKIM_EKI'ye uymaz → esit sayilmiyordu (FAZ C'de bilerek KAPSAM DISI).
 * Kulliyat (P3 + yerel satir token'lari × Pimtas + kulliyat token'lari, 05.10):
 * kuralla 35 YENI esit cift — hepsi ayni kelime (çeliği/çelik 200, köpüğü/köpük
 * 49, dirseği/dirsek 42, dolabı/dolap/dolapları 28, standardı/standart 23,
 * rengi/renk 21, kapağı/kapak 12 …), yanlis pozitif 0.
 *
 * KARAR: yumusama YALNIZ token esitligine girer, AILE cozumune GIRMEZ — olculdu:
 * aile tarafinda 5 satirin 2'si YANLIS yone kayiyordu ("… Hidrant Dirseği ile"
 * hidrant → fitting, "MANOMETRE - 3 yollu musluğu dahil" manometre → armatur;
 * bas-isim kurali sondaki aksesuar kelimesini aile sanar). Urun tarafinda
 * (Pimtas) yumusamis kelime 0 → indeks degismez, INDEX_VERSION/reindex YOK.
 */
import { tokenEsit, altKumeMi, buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
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
const ozet = (r: any) => (r?.netPrice > 0 ? `FIYAT ${r.netPrice} (${r.matchedName})` : `${r?.confidence} aday=${r?.candidates?.length ?? 0} dogrulanamadi=${js(r?.dogrulanamadi ?? [])}`);

async function main() {
  // ══ Y1 · token esitligi: sert ↔ yumusak (+ cogul) ═══════════════════════
  const esitler: Array<[string, string]> = [
    ['dirsegi', 'dirsek'], ['dirsegi', 'dirsekler'], ['dolabi', 'dolap'], ['dolabi', 'dolaplari'],
    ['celigi', 'celik'], ['rengi', 'renk'], ['standardi', 'standart'], ['standardi', 'standartlari'],
    ['kapagi', 'kapak'], ['muslugu', 'musluk'], ['termostadi', 'termostat'], ['bandi', 'bant'], ['kalibi', 'kalip'],
  ];
  for (const [a, b] of esitler) {
    check(`★ Y1 "${a}" = "${b}" (iki yonde)`, tokenEsit(a, b) && tokenEsit(b, a));
  }
  // ══ Y2 · karsi: yumusama sanilmamasi gerekenler ═══════════════════════
  const farklar: Array<[string, string, string]> = [
    ['tegi', 'tek', 'kok 2 harf (kisa kok yutulmaz)'],
    ['kabi', 'kap', 'kok 2 harf'],
    ['dirsegin', 'dirsek', 'ilgi eki -in kapsam disi (dar kural)'],
    ['dirsekli', 'dirsegi', '-li sifati yumusama DEGIL'],
    ['kapaksiz', 'kapagi', 'olumsuzluk -siz'],
    ['dirsegi', 'dirsel', 'baska unsuz (l) — yumusama cifti degil'],
    ['celigi', 'celil', 'baska unsuz'],
  ];
  for (const [a, b, neden] of farklar) check(`Y2 karsi: "${a}" ≠ "${b}" (${neden})`, !tokenEsit(a, b) && !tokenEsit(b, a));
  check('Y2 karsi: mevcut kurallar ayni — "borusu"="borular", "galvaniz"="galvanizli", "galvaniz"≠"galvanizsiz"',
    tokenEsit('borusu', 'borular') && tokenEsit('galvaniz', 'galvanizli') && !tokenEsit('galvaniz', 'galvanizsiz'));
  check('★ Y1b alt-kume de yumusamayi tanir: ["yangin","dolabi"] ⊆ ["yangin","dolaplari"]', altKumeMi(['yangin', 'dolabi'], ['yangin', 'dolaplari']));

  // ══ Y3 · motor: yumusamis satir kelimesi "dogrulanamadi" olmaz ══════════
  const dolap = [urun('Yangın Dolabı Kapak', null, 300), urun('Yangın Dolabı', null, 2000)];
  const s3 = 'Yangın Dolabı Kapağı';
  const r3 = await esle(dolap, [s3, 'Yangın Dolabı Kapak']);
  check(`★ Y3 "${s3}" → 300, "kapağı" dogrulanamadi DEGIL (yumusamasiz satirla ayni)`, r3[s3]?.netPrice === 300 && !(r3[s3]?.dogrulanamadi ?? []).some((t: string) => /kapag/.test(t)), ozet(r3[s3]));
  check('Y3 karsi: "Yangın Dolabı Kapak" → 300 (bugun de dogru)', r3['Yangın Dolabı Kapak']?.netPrice === 300, ozet(r3['Yangın Dolabı Kapak']));
  const vana = [urun('Paslanmaz Çelik Küresel Vana', '1/2"', 300), urun('Pirinç Küresel Vana', '1/2"', 200)];
  const s3b = 'Paslanmaz Çeliği Küresel Vana 1/2"';
  const r3b = await esle(vana, [s3b, 'Paslanmaz Çelik Küresel Vana 1/2"']);
  check(`★ Y3b "${s3b}" → paslanmaz celik (300), pirinc DEGIL`, r3b[s3b]?.netPrice === 300, ozet(r3b[s3b]));
  check('Y3b karsi: "Paslanmaz Çelik Küresel Vana 1/2\\"" → 300 (bugun de dogru)', r3b['Paslanmaz Çelik Küresel Vana 1/2"']?.netPrice === 300, ozet(r3b['Paslanmaz Çelik Küresel Vana 1/2"']));
  // KARAR karsi: yumusama AILE cozumune girmez — bas ismi yumusamis satir ailesiz kalir, SISTEM SECMEZ
  const dirsek = [urun('Kaynak Dirsek', '2"', 50), urun('Kaynak Te', '2"', 70)];
  const r3c = await esle(dirsek, ['Kaynak Dirseği 2"']);
  check('Y3 karsi (karar): "Kaynak Dirseği 2\\"" aile cozumu degismez → otomatik fiyat YOK (soru)', !(r3c['Kaynak Dirseği 2"']?.netPrice > 0), ozet(r3c['Kaynak Dirseği 2"']));

  console.log(`\n${'='.repeat(60)}\nUNSUZ YUMUSAMASI (P2 c): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
