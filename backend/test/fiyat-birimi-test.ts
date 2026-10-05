/**
 * FAZ B PARTI 2b — B10 FIYAT BIRIMI KAPISI
 *   npx ts-node test/fiyat-birimi-test.ts   (npm run test:fiyat-birimi)
 *
 * BULGU (P2 motor paketi, B10): urunun FIYAT birimi (kg, boy, rulo, paket…)
 * satirin MIKTAR birimiyle hic karsilastirilmiyordu.
 * OLCULDU (05.10, saf motor): "SİYAH ÇELİK BORU 2\"" satiri, birimi 'mt',
 * havuzda tek urun "Siyah Çelik Boru 2\"" birimi 'kg' (ya da 'Boy') →
 * single · high · 100 TL — kilo (ya da 6 metrelik boy) fiyati METRE fiyati
 * gibi, sessizce yazildi. Miktar × fiyat carpimi kat kat yanlis.
 *
 * KURAL: satirin birimi ve urunun fiyat birimi IKISI DE taninir ve FARKLI
 * fiyat tabanindaysa ('fiyat-birimi' kapisi) otomatik yazim KAPANIR — tek aday
 * onaya duser, aday ELENMEZ (PRD: yalniz ACIK celiski; birimsiz/taninmayan
 * birim kanit degildir). Ayni taban: metre ≈ mt/m/mtül · sayi ≈ adet/ad/takım/set.
 * Hafiza otoyazisi da bu kapida yazmaz (gecmis onay birimi hatirlamaz; para
 * hatasi her kosumda tekrarlanir). Caprazmarka onerisi cekinceyle GIRER
 * (kimlik kapisi degil — urun dogru, fiyat tabani farkli; not gorunur).
 * Iscilik L6 (birimSert) ayni kalir: taninan farkli birim orada zaten ELENIR;
 * kg/boy gibi L6'nin tanimadigi birim artik onaya duser.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags, guclutekAday, fiyatBirimiSinifi, HAFIZA_OTOYAZ_ENGELI, KIMLIK_ZAYIF_KAPILAR } from '../src/ozellik/eslestirme/matching/index/query-engine';
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
let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number; birim?: string | null }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return { id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: c.birim ?? null } } as IndexedRow;
}
const sor = (q: string, unit: string | null, h: IndexedRow[], opts?: any) => runQuery(parseLine(q, unit), h, opts) as any;
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} rows=${o.rows?.length ?? (o.row ? 1 : 0)} kapilar=${JSON.stringify(o.kapilar)} not="${o.uyariNot ?? ''}"`;
const kapi = (o: any) => (o.kapilar ?? []).includes('fiyat-birimi');

const BORU = (birim: string | null, price = 100) => urun({ ad: 'Siyah Çelik Boru', cins: 'siyah', cap: '2"', price, birim });
const Q_BORU = 'SİYAH ÇELİK BORU 2"';
const VANA = (cins: string, birim: string | null, price: number) => urun({ ad: 'Küresel Vana', cins, cap: '1"', price, birim });

async function main() {
  // ══ S · SINIFLAYICI ═══════════════════════════════════════════════════
  const tablo: Array<[string | null, string | null]> = [
    ['Mt.', 'metre'], ['MT', 'metre'], ['m', 'metre'], ['MTÜL', 'metre'], ['metre', 'metre'],
    ['Ad.', 'sayi'], ['ADET', 'sayi'], ['Takım', 'sayi'], ['TK', 'sayi'], ['set', 'sayi'],
    ['KG', 'kg'], ['Kg.', 'kg'], ['Boy', 'boy'], ['BOY', 'boy'], ['Rulo', 'rulo'], ['Paket', 'paket'], ['Pk', 'paket'],
    ['Kutu', 'kutu'], ['m²', 'm2'], ['M2', 'm2'], ['Ton', 'ton'], ['Çift', 'cift'], ['Lt', 'lt'],
    ['Torba', null], ['', null], [null, null],
  ];
  // Koruma: disa aktarim yoksa (kirmizi olcum, --transpile-only) S1 duser, kalan bloklar yine koşar.
  const sinif = typeof fiyatBirimiSinifi === 'function' ? fiyatBirimiSinifi : (_u: string | null) => undefined;
  const sapan = tablo.filter(([u, k]) => sinif(u) !== k).map(([u, k]) => `${u}→${sinif(u)} (beklenen ${k})`);
  check('S1 fiyat birimi siniflayici (26 yazim)', sapan.length === 0, sapan.join(' · '));

  // ══ R · TEK ADAY ══════════════════════════════════════════════════════
  const kg = sor(Q_BORU, 'mt', [BORU('kg')]);
  check('★ R1 mt satiri | kg fiyatli boru → ONAY (fiyat-birimi), aday elenmez', kg.kind === 'ask' && kg.rows.length === 1 && kapi(kg), ozet(kg));
  check('R1b not urun ve satir birimini soyler', /kg/.test(kg.uyariNot ?? '') && /mt/.test(kg.uyariNot ?? ''), kg.uyariNot);
  const boy = sor(Q_BORU, 'mt', [BORU('Boy')]);
  check('★ R2 mt satiri | Boy fiyatli boru → ONAY (fiyat-birimi)', boy.kind === 'ask' && kapi(boy), ozet(boy));
  const mt = sor(Q_BORU, 'mt', [BORU('Mt.')]);
  check('R3 KARSI: mt satiri | Mt. fiyatli boru → otomatik (ayni taban)', mt.kind === 'single', ozet(mt));
  const birimsizSatir = sor(Q_BORU, null, [BORU('kg')]);
  check('R4 KARSI: birimi YAZILMAMIS satir → otomatik (kanit yok)', birimsizSatir.kind === 'single', ozet(birimsizSatir));
  const birimsizUrun = sor(Q_BORU, 'mt', [BORU(null)]);
  check('R5 KARSI: birimi olmayan urun → otomatik (kanit yok)', birimsizUrun.kind === 'single', ozet(birimsizUrun));
  const torba = sor(Q_BORU, 'mt', [BORU('Torba')]);
  check('R6 KARSI: TANINMAYAN urun birimi → otomatik (suclama yok)', torba.kind === 'single', ozet(torba));
  const takim = sor('Küresel Vana 1"', 'adet', [VANA('pirinç', 'Takım', 90)]);
  check('R7 KARSI: adet satiri | Takım fiyatli urun → otomatik (ikisi de sayi)', takim.kind === 'single', ozet(takim));
  const paket = sor('Küresel Vana 1"', 'adet', [VANA('pirinç', 'Paket', 90)]);
  check('★ R8 adet satiri | Paket fiyatli urun → ONAY', paket.kind === 'ask' && kapi(paket), ozet(paket));
  check('R9 KARSI: kapi yalniz fiyat-birimi celiskisinde (R3 kapisiz)', !kapi(mt) && !kapi(takim), `${ozet(mt)} | ${ozet(takim)}`);

  // ══ V · OTOMATIK VARYANT (V4 surukleme) ══════════════════════════════
  {
    const pirinc = VANA('pirinç', 'Ad.', 90); const pas = VANA('paslanmaz', 'Ad.', 140);
    const on = sor('Küresel Vana 1"', 'adet', [pirinc, pas], { variantTags: urunVariantTags(pirinc) });
    check('V0 olcutun kendisi: ayni birimde varyant OTOMATIK yaziliyor', on.kind === 'auto-variant' && on.row.listPrice === 90, ozet(on));
    const pirincPk = VANA('pirinç', 'Paket', 91); const pas2 = VANA('paslanmaz', 'Ad.', 141);
    const v = sor('Küresel Vana 1"', 'adet', [pirincPk, pas2], { variantTags: urunVariantTags(pirincPk) });
    check('★ V1 varyant urunu Paket fiyatli → otomatik varyant YAZILMAZ, onay', v.kind === 'ask' && v.rows.length === 1 && v.rows[0].listPrice === 91 && kapi(v), ozet(v));
    // Baska kapi (capsiz) zaten aciksa onun notu kalir, fiyat-birimi LISTEYE eklenir
    const capsizPk = urun({ ad: 'Küresel Vana', cins: 'pirinç', price: 92, birim: 'Paket' });
    const capsizAd = urun({ ad: 'Küresel Vana', cins: 'paslanmaz', price: 142, birim: 'Ad.' });
    const v2 = sor('Küresel Vana 1"', 'adet', [capsizPk, capsizAd], { variantTags: urunVariantTags(capsizPk) });
    check('V2 olcutun kendisi: capsiz varyant capsiz-dusum ile onaya duser', v2.kind === 'ask' && (v2.kapilar ?? []).includes('capsiz-dusum'), ozet(v2));
    check('★ V2 iki kapi birden: capsiz notu kalir + fiyat-birimi listede', kapi(v2) && !/Fiyat birimi/.test(v2.uyariNot ?? ''), ozet(v2));
  }

  // ══ M · COKLU ADAY ════════════════════════════════════════════════════
  {
    const m = sor('Küresel Vana 1"', 'adet', [VANA('pirinç', 'Paket', 92), VANA('paslanmaz', 'Ad.', 142)]);
    check('M0 olcutun kendisi: iki aday soruldu', m.kind === 'ask' && m.rows.length === 2, ozet(m));
    check('★ M1 adaylardan biri farkli fiyat birimli → kapi listede + uyari notu (secen kullanici gorur)', kapi(m), ozet(m));
    check('M3 coklu soruda not farkli birimi ve satir birimini soyler', /Paket/.test(m.uyariNot ?? '') && /adet/.test(m.uyariNot ?? ''), ozet(m));
    const ikinci = sor('Küresel Vana 1"', 'adet', [VANA('pirinç', 'Ad.', 94), VANA('paslanmaz', 'Paket', 144)]);
    const ikinciSira = (ikinci.rows ?? []).map((r: any) => r.urun.birim);
    check('M4 olcutun kendisi: farkli birimli aday ILK sirada DEGIL', ikinci.kind === 'ask' && ikinciSira[0] === 'Ad.' && ikinciSira.includes('Paket'), JSON.stringify(ikinciSira));
    check('★ M4 farkli birimli aday ikinci sirada → kapi yine listede', kapi(ikinci), ozet(ikinci));
    const ayni = sor('Küresel Vana 1"', 'adet', [VANA('pirinç', 'Ad.', 93), VANA('paslanmaz', 'Ad.', 143)]);
    check('M2 KARSI: tum adaylar ayni birim → kapi yok', ayni.kind === 'ask' && !kapi(ayni), ozet(ayni));
  }

  // ══ L · ISCILIK (birimSert) ═══════════════════════════════════════════
  {
    const isc = (birim: string) => BORU(birim, 60);
    const kgIsc = sor(Q_BORU, 'mt', [isc('kg')], { birimSert: true });
    check('★ L1 iscilik: mt satiri | kg fiyatli iscilik → ONAY (L6 kg\'yi tanimiyordu, sessiz yaziyordu)', kgIsc.kind === 'ask' && kapi(kgIsc), ozet(kgIsc));
    const adIsc = sor(Q_BORU, 'mt', [isc('Ad.')], { birimSert: true });
    check('L2 KARSI: L6 degismez — mt satiri | adet iscilik → none/birim-uyumsuz', adIsc.kind === 'none' && adIsc.reason === 'birim-uyumsuz', ozet(adIsc));
    const mtIsc = sor(Q_BORU, 'mt', [isc('mt')], { birimSert: true });
    check('L3 KARSI: mt | mt iscilik → otomatik', mtIsc.kind === 'single', ozet(mtIsc));
  }

  // ══ K · KAPI LISTELERI ════════════════════════════════════════════════
  check('★ K1 hafiza otoyazisi fiyat-birimi kapisinda YAZMAZ', (HAFIZA_OTOYAZ_ENGELI as readonly string[]).includes('fiyat-birimi'), JSON.stringify(HAFIZA_OTOYAZ_ENGELI));
  check('K2 caprazmarka onerisi kimlik barajinda DEGIL (cekinceyle girer)', !(KIMLIK_ZAYIF_KAPILAR as readonly string[]).includes('fiyat-birimi'));
  const g = guclutekAday(kg);
  check('K3 oneri: tek aday notuyla girer (fiyat gorunur, not tasinir)', !!g && g.row.listPrice === 100 && /kg/.test(g.uyariNot ?? ''), JSON.stringify({ g: !!g, not: g?.uyariNot }));

  // ══ H · GERCEK SERVIS: birim bulkMatch'ten gelir, hafiza yazmaz ═════════
  {
    let i = 0;
    const satirlar = [{ ad: 'Siyah Çelik Boru', cins: 'siyah', cap: '2"', price: 100, birim: 'kg' }].map((c) => {
      const idx = buildProductIndex(c as ProductColumns); i++;
      return { id: `lib-h${i}`, materialId: null, material: null, materialName: idx.displayName,
        listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: `pi-h${i}`,
        product: { ...idx, id: `pi-h${i}`, ad: c.ad, cins: c.cins, baglanti: null, capRaw: c.cap, kategori: null, boyMm: null,
          urunKodu: null, sheetName: null, price: c.price, birim: c.birim } };
    });
    const hafiza = new Map<string, any>();
    const anahtar = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
    const prisma: any = {
      userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : satirlar) },
      brand: { findUnique: async () => ({ name: 'TEST' }) },
      eslesmeHafizasi: {
        findUnique: async ({ where }: any) => hafiza.get(anahtar(where)) ?? null,
        upsert: async ({ where, update, create }: any) => {
          const ex = hafiza.get(anahtar(where));
          if (ex) { ex.secilenAd = update.secilenAd ?? ex.secilenAd; ex.secimSayisi++; } else hafiza.set(anahtar(where), { ...create, secimSayisi: 1 });
        },
      },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, k: number) => ({ id: `a${k}`, userId: null, active: true,
        alias: s.alias, canonical: s.canonical, kinds: s.kinds, impliedType: s.impliedType, sizeClass: s.sizeClass, stripTags: s.stripTags })) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'f', date: '' }) } as any;
    const s: any = new MatchingService(prisma, new TerminologyService(prisma), fx);
    const realLog = console.log; console.log = () => {};
    const bul = async (unit?: string) => (await s.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', [Q_BORU], undefined, unit ? { [Q_BORU]: unit } : undefined))[Q_BORU];
    const birimsiz = await bul();
    const once = await bul('mt');
    if (once?.candidates?.length === 1) await s.remember('u1', 'b1', Q_BORU, once.candidates[0].materialName);
    const sonra = await bul('mt');
    console.log = realLog;
    const oz = (r: any) => `${r?.confidence} net=${r?.netPrice} otoyaz=${r?.hafizaOtoyaz} kapilar=${JSON.stringify(r?.kapilar)} aday=${r?.candidates?.length}`;
    check('H0 olcutun kendisi: birim gonderilmezse servis otomatik yazar', birimsiz?.confidence === 'high' && birimsiz?.netPrice === 100, oz(birimsiz));
    check('★ H1 servis: mt satiri | kg urun → fiyat YAZILMAZ, tek aday onayda', once?.netPrice === 0 && once?.candidates?.length === 1 && (once?.kapilar ?? []).includes('fiyat-birimi'), oz(once));
    check('★ H2 servis: onaydan SONRA da hafiza otomatik YAZMAZ', sonra?.netPrice === 0 && !sonra?.hafizaOtoyaz && sonra?.confidence !== 'high', oz(sonra));
    check('H3 olcutun kendisi: hafiza kaydi gercekten okundu (secim on-secili)', sonra?.candidates?.[0]?.preferred === true, oz(sonra));
  }

  console.log(`\n${'='.repeat(60)}\nB10 FIYAT BIRIMI KAPISI: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
