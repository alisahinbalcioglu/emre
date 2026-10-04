/**
 * P4'UN DORT MOTOR NOTU (P4 oturumu buldu, koordinator P2'ye iletti — 04.10)
 *   npx ts-node test/p4-motor-notlari-test.ts   (npm run test:p4-motor-notlari)
 *
 * G · GUNLUK SAHTECILIGI: eslestirme gunlukleri kullanici metnini (Excel satir
 *     adi, secilen ad, brandId) HAM yaziyordu. Excel hucresi satir sonu
 *     icerebilir → tek kayit ikiye bolunur, ikincisi "[Matching] …" diye
 *     baslayan SAHTE kayit olur. `gunlukDegeri` kacislar.
 * B · PROTOTIP ADI: `units?.[ad]` "toString"/"constructor" adli satirda
 *     Object.prototype'tan FONKSIYON aliyordu → parseLine TypeError → TUM
 *     toplu istek dusuyordu (olculdu: diger satirlarin sonucu da kayboldu).
 *     DTO (C11, P4a) bunu kontrolcude kapatti; motor DTO'suz cagrildiginda
 *     (servis, test) SAVUNMA DERINLIGI.
 * K · BAYAT KUR (C10, Emre karari): kur > 2 is gunu bayatsa eslestirme
 *     SONUCUNDA isaret. P4a yalniz sunucuda WARN yaziyordu. Isaret kur
 *     metaverisiyle (`kaynakKur`) tasinir — kurun aktigi her yere (sonuc,
 *     aday, oneri) tek yerden ulasir.
 * H · ONERI HAVUZU: `findAlternativesV2` (ve isçilik ikizi) "bu markada yok"
 *     diyen HER satir icin obur markalarin TUM kutuphanesini yeniden cekiyor,
 *     indeksliyor, kur ceviricisi kuruyordu — ayni ad 50.000 kez → 50.000
 *     tarama. Havuz istek basina BIR KEZ; ayni ad BIR KEZ islenir.
 */

import { buildProductIndex, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import * as QE from '../src/ozellik/eslestirme/matching/index/query-engine';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { gunlukDegeri } from '../src/ozellik/eslestirme/matching/gunluk-degeri';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

let n = 0;
function kutuphane(c: ProductColumns & { currency?: string; marka?: string }) {
  const idx = buildProductIndex(c);
  n++;
  return {
    id: `lib-${n}`, materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: null, discountRate: 0, currency: c.currency ?? 'TRY', productIndexId: `pi-${n}`,
    brand: { id: c.marka ?? 'b1', name: (c.marka ?? 'b1').toUpperCase() },
    product: { ...idx, id: `pi-${n}`, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null,
      kategori: c.kategori ?? null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null },
  };
}
const SAYAC = { digerMarka: 0, digerFirma: 0 };
type Kur = Record<string, unknown>;
function servis(kendi: any[], diger: any[] = [], kur: Kur = { usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'tcmb', date: '2026-10-02', fetchedAt: '' }, iscilik?: { kendi: any[]; diger: any[] }) {
  const hafiza = new Map<string, any>();
  const anahtar = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => {
      if (a?.where?.brandId && typeof a.where.brandId === 'object') { SAYAC.digerMarka++; return diger; }
      return kendi;
    } },
    laborPrice: { findMany: async (a: any) => {
      if (a?.where?.firma?.id && typeof a.where.firma.id === 'object') { SAYAC.digerFirma++; return iscilik?.diger ?? []; }
      return iscilik?.kendi ?? [];
    } },
    brand: { findUnique: async () => ({ name: 'TEST' }) },
    eslesmeHafizasi: {
      findUnique: async ({ where }: any) => hafiza.get(anahtar(where)) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const ex = hafiza.get(anahtar(where));
        if (ex) { ex.secilenAd = update.secilenAd ?? ex.secilenAd; ex.secimSayisi++; } else hafiza.set(anahtar(where), { ...create, secimSayisi: 1 });
      },
    },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true,
      alias: s.alias, canonical: s.canonical, kinds: s.kinds, impliedType: s.impliedType, sizeClass: s.sizeClass, stripTags: s.stripTags })) },
  };
  const fx = { getRates: async () => kur } as any;
  return new MatchingService(prisma, new TerminologyService(prisma), fx) as any;
}
const K = { userId: 'u1', firmaId: 'u1' };

/** Kurulan servisin TUM console cikisini yakalar; fiziksel SATIRLARA boler. */
async function gunlugu<T>(fn: () => Promise<T>): Promise<{ satirlar: string[]; sonuc?: T; hata?: unknown }> {
  const satirlar: string[] = [];
  const asil = { log: console.log, warn: console.warn, error: console.error };
  const yakala = (...a: unknown[]) => { for (const s of a.map(String).join(' ').split(/\r\n|\r|\n|\u2028|\u2029/)) satirlar.push(s); };
  console.log = yakala; console.warn = yakala; console.error = yakala;
  try { return { satirlar, sonuc: await fn() }; } catch (hata) { return { satirlar, hata }; } finally { Object.assign(console, asil); }
}
const SAHTE = '[Matching] SAHTE';
const sahteSatir = (satirlar: string[]) => satirlar.filter((s) => s.startsWith(SAHTE));

function iscilikKalemi(id: string, ad: string, cap: string, firma: { id: string; name: string }) {
  return {
    id, unitPrice: 100, discountRate: 0, currency: 'TRY', unit: 'adet', firma,
    laborItem: { id: `li-${id}`, name: ad, unitPrice: 100, unit: 'adet', category: null, cins: null, baglanti: null,
      capRaw: cap, boyMm: null, not: null, adSlug: null, adBucket: null, adTokens: [], cinsNorm: null, cinsTokens: [],
      baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown', capTags: [], capNorm: null, malzemeler: [],
      aileZayif: false, boyTag: null, displayName: ad, belirsiz: false, indexVersion: INDEX_VERSION - 1 },
  };
}

async function main() {
  // ══ G · GUNLUK SAHTECILIGI ═══════════════════════════════════════════
  {
    const boru = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '1"', price: 100 } as any);
    const vanaA = kutuphane({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '1"', price: 80 } as any);
    const vanaB = kutuphane({ ad: 'Küresel Vana', cins: 'Krom', cap: '1"', price: 90 } as any);
    const satir = `KÜRESEL VANA 1"\n${SAHTE} satir adindan`;
    const s = servis([boru, vanaA, vanaB]);
    // (1) bos kutuphane: marka kimligi gunluge gider
    const g1 = await gunlugu(() => servis([]).bulkMatch(K, `b1\n${SAHTE} marka kimliginden`, ['ÇELİK BORU 1"']));
    // (2) dolu kutuphane: marka + satir adi (sozluk/sonuc gunlukleri)
    const g2 = await gunlugu(() => s.bulkMatch(K, `b1\n${SAHTE} marka kimliginden`, [satir, `PİS SU BORUSU 110 mm\n${SAHTE} sozluk`]));
    // (3) hafiza yaz: SECILEN AD sahte satir tasiyor (baska satir uzerinden —
    //     ⚠ ilk yazimda ayni satiri kullandim: kayitli ad adayla eslesmeyince
    //     on-secim dali KOSMADI, cins tercihi devreye girdi; fikstur kaniti yakaladi)
    const g3 = await gunlugu(() => s.remember('u1', 'b1', 'ÇELİK BORU 1"', `Çelik Boru\n${SAHTE} secilen addan`));
    // (4) hafiza on-secim: SATIR ADI sahte satir tasiyor, kayitli ad DOGRU
    const once: any = (await gunlugu(() => s.bulkMatch(K, 'b1', [satir]))).sonuc;
    await gunlugu(() => s.remember('u1', 'b1', satir, once?.[satir]?.candidates?.[0]?.materialName));
    const g4 = await gunlugu(() => s.bulkMatch(K, 'b1', [satir]));
    const g5 = await gunlugu(() => s.remember('u1', 'b1', `OLCUSUZ SATIR\n${SAHTE} olcusuz`, 'X'));
    // ── Mutasyonun yasattigi dort gunluk satiri (04.10) — senaryosu yoktu ──
    // (6) sozluk alias'i korumaya takilip ATLANDI (E8: dogalgaz → boru, satir vana)
    const g6 = await gunlugu(() => s.bulkMatch(K, 'b1', [`DOĞALGAZ KÜRESEL VANA 1"\n${SAHTE} atlanan alias`]));
    // (7) iscilik motoru: iscilik firmasi kimligi gunluge gider
    const isS = servis([], [], undefined, { kendi: [iscilikKalemi('k1', 'Küresel Vana', '1"', { id: 'fA', name: 'A' })], diger: [] });
    const g7 = await gunlugu(() => isS.bulkMatchLabor(K, `fA\n${SAHTE} iscilik firmasi`, ['KÜRESEL VANA 1"']));
    // (8) hafiza TEK-ADAY OTOYAZ: ek nitelik kapisi (bilinmeyen-kelime) — otoyaz SURER
    const tekS = servis([kutuphane({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '20 mm', price: 70 } as any)]);
    const otoSatir = `SARI KOLLU KÜRESEL VANA 20 mm\n${SAHTE} otoyaz`;
    const oto0: any = (await gunlugu(() => tekS.bulkMatch(K, 'b1', [otoSatir]))).sonuc;
    await gunlugu(() => tekS.remember('u1', 'b1', otoSatir, oto0?.[otoSatir]?.candidates?.[0]?.materialName));
    const g8 = await gunlugu(() => tekS.bulkMatch(K, 'b1', [otoSatir]));
    // (9) cins tercihi YAZ: imzada HAM brandId var (hafiza ucunun DTO'su yalniz
    //     "bos olmayan metin" dogrular)
    const g9 = await gunlugu(() => s.remember('u1', `b1\n${SAHTE} hafiza markasi`, 'KÜRESEL VANA 1"', 'Küresel Vana · Pirinç · 1"'));
    check('G fixture: alias atlama gunlugu uretildi', g6.satirlar.some((x) => x.includes("guard'la atlandi")), JSON.stringify(g6.satirlar.slice(0, 3)));
    check('G fixture: iscilik motoru gunlugu uretildi', g7.satirlar.some((x) => x.includes('ISCILIK MOTORU')), JSON.stringify(g7.satirlar.slice(0, 3)));
    check('G fixture: hafiza TEK-ADAY OTOYAZ dali kostu', g8.satirlar.some((x) => x.includes('HAFIZA TEK-ADAY OTOYAZ')), JSON.stringify(g8.satirlar.slice(0, 3)));
    check('G fixture: cins tercihi YAZ gunlugu uretildi', g9.satirlar.some((x) => x.includes('CINS TERCIHI YAZ')), JSON.stringify(g9.satirlar.slice(0, 3)));
    for (const [ad, g] of [['alias atlama', g6], ['iscilik motoru (firma)', g7], ['hafiza tek-aday otoyaz', g8], ['cins tercihi yaz (marka)', g9]] as const) {
      check(`★ G ${ad}: gunlukte SAHTE satir YOK`, sahteSatir(g.satirlar).length === 0, JSON.stringify(sahteSatir(g.satirlar)));
    }
    const tumu = [...g1.satirlar, ...g2.satirlar, ...g3.satirlar, ...g4.satirlar, ...g5.satirlar, ...g6.satirlar, ...g7.satirlar, ...g8.satirlar, ...g9.satirlar];
    check('G fixture: senaryolar gunluk URETIYOR (olcut bos degil)', tumu.filter((x) => x.startsWith('[Matching]')).length >= 6, `${tumu.length} satir`);
    check('G fixture: hafiza on-secim dali KOSTU', g4.satirlar.some((x) => x.includes('HAFIZA ON-SECILI') || x.includes('HAFIZA TEK-ADAY')), JSON.stringify(g4.satirlar.slice(0, 3)));
    for (const [ad, g] of [['bos kutuphane (marka)', g1], ['dolu kutuphane (marka + satir + sozluk)', g2], ['hafiza yaz', g3], ['hafiza on-secim', g4], ['olcusuz hafiza', g5]] as const) {
      check(`★ G ${ad}: gunlukte SAHTE satir YOK`, sahteSatir(g.satirlar).length === 0, JSON.stringify(sahteSatir(g.satirlar)));
    }
    // Yardimcinin kendi sozlesmesi (tirnak/ters bolu kacisi, kirpma isareti)
    const bs = String.fromCharCode(92);
    check('G gunlukDegeri tirnak + ters bolu + satir sonu kacislar',
      gunlukDegeri(`a"b${bs}c\nd`) === `"a${bs}"b${bs}${bs}c${bs}u000ad"`, gunlukDegeri(`a"b${bs}c\nd`));
    check('G gunlukDegeri satir ayiricisini (U+2028) kacislar',
      gunlukDegeri(`x${String.fromCharCode(0x2028)}y`) === `"x${bs}u2028y"`, gunlukDegeri(`x${String.fromCharCode(0x2028)}y`));
    check('G gunlukDegeri asiri uzun degeri kirpar ve SOYLER',
      gunlukDegeri('x'.repeat(200), 160) === `"${'x'.repeat(160)}"…(+40)`, gunlukDegeri('x'.repeat(200), 160).slice(-12));
    // Kacislanan deger GORUNUR kalir (bilgi kaybi yok)
    check('G kacislanan deger gunlukte okunur kalir (\\u000a)', tumu.some((x) => x.includes('\\u000a[Matching] SAHTE')), 'kacisli bicim bulunamadi');
  }

  // ══ B · PROTOTIP ADLI SATIR TUM ISTEGI DUSURMEZ ══════════════════════
  {
    const boru = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '1"', price: 100 } as any);
    const adlar = ['ÇELİK BORU 1"', 'toString', 'constructor', '__proto__', 'hasOwnProperty'];
    const g = await gunlugu(() => servis([boru]).bulkMatch(K, 'b1', adlar, undefined, { 'ÇELİK BORU 1"': 'mt' }));
    check('★ B prototip adli satirlar istegi DUSURMEZ', !g.hata, String((g.hata as Error)?.message ?? ''));
    const r: any = g.sonuc ?? {};
    check('B obur satirin sonucu KAYBOLMAZ (boru eslesir)', r['ÇELİK BORU 1"']?.netPrice === 100, JSON.stringify(r['ÇELİK BORU 1"']));
    check('B kendi birimi okunur (mt): boru satiri pipe sinyaliyle eslesti', r['ÇELİK BORU 1"']?.confidence === 'high', JSON.stringify(r['ÇELİK BORU 1"']?.confidence));
    // ⚠ IKINCI KOK (P4 notunun disinda, olcerken bulundu): satir BELIRTECI de
    // prototip adiyla cakisabiliyor. `line-parser` KISALTMALAR[t] duz nesne:
    // normalleştirme kucuk harfe cevirdigi icin "CONSTRUCTOR" yazan HER satir
    // belirteci FONKSIYONA donusturup tum istegi dusuruyordu (DTO bunu
    // kapsamaz — sorun birim sozlugunde degil satir metninde).
    const g3 = await gunlugu(() => servis([boru]).bulkMatch(K, 'b1', ['ÇELİK BORU 1"', 'VANA CONSTRUCTOR 1"']));
    check('★ B icinde "CONSTRUCTOR" gecen satir istegi DUSURMEZ', !g3.hata, String((g3.hata as Error)?.message ?? ''));
    check('B ... ve obur satir eslesir', (g3.sonuc as any)?.['ÇELİK BORU 1"']?.netPrice === 100, JSON.stringify((g3.sonuc as any)?.['ÇELİK BORU 1"']));
    // Ayni aile, karar (a)'nin tablosu: kullanici alias'inin canonical'i
    // prototip adi olursa SOZLUK_MALZEME_RETTI[...] fonksiyon donup yayilirdi.
    const sAlias = servis([boru]);
    sAlias.terminology.prisma.terminologyAlias.findMany = async () => [{ id: 'u-a', userId: 'u1', active: true,
      alias: 'ozel hat', canonical: 'constructor', kinds: ['pvc'], impliedType: 'boru', sizeClass: 'plastic', stripTags: [] }];
    const g4 = await gunlugu(() => sAlias.bulkMatch(K, 'b1', ['ÖZEL HAT BORUSU 1"']));
    check('B canonical\'i prototip adi olan kullanici alias\'i istegi DUSURMEZ', !g4.hata, String((g4.hata as Error)?.message ?? ''));
    // Metin olmayan birim (DTO'suz cagrida) de dusurmez
    const g2 = await gunlugu(() => servis([boru]).bulkMatch(K, 'b1', ['ÇELİK BORU 1"'], undefined, { 'ÇELİK BORU 1"': 5 } as any));
    check('B metin olmayan birim istegi DUSURMEZ', !g2.hata, String((g2.hata as Error)?.message ?? ''));
  }

  // ══ K · BAYAT KUR ISARETI (C10) ══════════════════════════════════════
  {
    const usd = kutuphane({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '1"', price: 10, currency: 'USD' } as any);
    const usd2 = kutuphane({ ad: 'Küresel Vana', cins: 'Krom', cap: '1"', price: 12, currency: 'USD' } as any);
    const tl = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '1"', price: 100 } as any);
    const BAYAT = { usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'cache', date: '2026-09-29', fetchedAt: '', yasIsGunu: 3, bayat: true };
    const TAZE = { usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'tcmb', date: '2026-10-02', fetchedAt: '', yasIsGunu: 0, bayat: false };
    const ozet = (r: any) => `${r?.confidence} net=${r?.netPrice} kaynakKur=${JSON.stringify(r?.kaynakKur)}`;
    const b1: any = (await gunlugu(() => servis([usd, tl], [], BAYAT).bulkMatch(K, 'b1', ['PİRİNÇ KÜRESEL VANA 1"', 'ÇELİK BORU 1"']))).sonuc;
    check('K fixture: dovizli satir bayat kurla da FIYATLANIR (kur gecerli, <=5 is gunu)', b1?.['PİRİNÇ KÜRESEL VANA 1"']?.netPrice === 400, ozet(b1?.['PİRİNÇ KÜRESEL VANA 1"']));
    check('★ K bayat kurla fiyatlanan sonuc ISARET tasir (bayat + yas)',
      b1?.['PİRİNÇ KÜRESEL VANA 1"']?.kaynakKur?.bayat === true && b1?.['PİRİNÇ KÜRESEL VANA 1"']?.kaynakKur?.yasIsGunu === 3, ozet(b1?.['PİRİNÇ KÜRESEL VANA 1"']));
    check('K TL satir kur kullanmaz → isaret YOK', b1?.['ÇELİK BORU 1"']?.kaynakKur === undefined, ozet(b1?.['ÇELİK BORU 1"']));
    const b2: any = (await gunlugu(() => servis([usd, usd2], [], BAYAT).bulkMatch(K, 'b1', ['KÜRESEL VANA 1"']))).sonuc;
    check('★ K coklu adayda HER aday isaret tasir',
      (b2?.['KÜRESEL VANA 1"']?.candidates?.length ?? 0) === 2 && b2['KÜRESEL VANA 1"'].candidates.every((c: any) => c.kaynakKur?.bayat === true),
      JSON.stringify(b2?.['KÜRESEL VANA 1"']?.candidates?.map((c: any) => c.kaynakKur)));
    const bos = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '2"', price: 100 } as any);
    const digerUsd = kutuphane({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '1"', price: 10, currency: 'USD', marka: 'b2' } as any);
    const b3: any = (await gunlugu(() => servis([bos], [digerUsd], BAYAT).bulkMatch(K, 'b1', ['PİRİNÇ KÜRESEL VANA 1"']))).sonuc;
    check('★ K capraz-marka ONERISI de isaret tasir',
      b3?.['PİRİNÇ KÜRESEL VANA 1"']?.alternatives?.[0]?.kaynakKur?.bayat === true, JSON.stringify(b3?.['PİRİNÇ KÜRESEL VANA 1"']?.alternatives));
    const t1: any = (await gunlugu(() => servis([usd], [], TAZE).bulkMatch(K, 'b1', ['PİRİNÇ KÜRESEL VANA 1"']))).sonuc;
    check('K taze kurda isaret YOK (kur metaverisi yine var)',
      !!t1?.['PİRİNÇ KÜRESEL VANA 1"']?.kaynakKur && !('bayat' in t1['PİRİNÇ KÜRESEL VANA 1"'].kaynakKur), ozet(t1?.['PİRİNÇ KÜRESEL VANA 1"']));
  }

  // ══ H · ONERI HAVUZU ISTEK BASINA BIR KEZ ════════════════════════════
  {
    const boru = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '2"', price: 100 } as any);
    const diger = ['1"', '2"', '3/4"', '1 1/4"', '1 1/2"'].map((c) => kutuphane({ ad: 'Küresel Vana', cins: 'Pirinç', cap: c, price: 50, marka: 'b2' } as any));
    const satirlar = ['KÜRESEL VANA 1"', 'KÜRESEL VANA 2"', 'KÜRESEL VANA 3/4"', 'KÜRESEL VANA 1 1/4"', 'KÜRESEL VANA 1 1/2"'];
    SAYAC.digerMarka = 0;
    const h1: any = (await gunlugu(() => servis([boru], diger).bulkMatch(K, 'b1', satirlar))).sonuc;
    check('H fixture: bes satirin besi de "bu markada yok" + oneri aldi',
      satirlar.every((s) => h1?.[s]?.confidence === 'none' && (h1?.[s]?.alternatives?.length ?? 0) === 1), JSON.stringify(satirlar.map((s) => [h1?.[s]?.confidence, h1?.[s]?.alternatives?.length])));
    check('★ H malzeme: obur markalarin kutuphanesi istek basina BIR KEZ cekilir (5 satir)', SAYAC.digerMarka === 1, `cekim=${SAYAC.digerMarka}`);

    // Iscilik ikizi (findLaborAlternativesV2) — ayni kural
    const firmaB = { id: 'fB', name: 'FIRMA B' };
    const kendiIs = [iscilikKalemi('k1', 'Çelik Boru', '2"', { id: 'fA', name: 'FIRMA A' })];
    const digerIs = ['1"', '2"', '3/4"', '1 1/4"', '1 1/2"'].map((c, i) => iscilikKalemi(`d${i}`, 'Küresel Vana', c, firmaB));
    SAYAC.digerFirma = 0;
    const h2: any = (await gunlugu(() => servis([], [], undefined, { kendi: kendiIs, diger: digerIs }).bulkMatchLabor(K, 'fA', satirlar))).sonuc;
    check('H fixture: iscilikte de bes satir oneri aldi',
      satirlar.every((s) => (h2?.[s]?.alternatives?.length ?? 0) === 1), JSON.stringify(satirlar.map((s) => [h2?.[s]?.confidence, h2?.[s]?.alternatives?.length])));
    check('★ H iscilik ikizi: obur firmalarin fiyatlari istek basina BIR KEZ cekilir', SAYAC.digerFirma === 1, `cekim=${SAYAC.digerFirma}`);

    // Ayni ad tekrar tekrar: motor BIR KEZ calisir
    const say = async (adlar: string[]) => {
      let c = 0; const asil = (QE as any).runQuery;
      (QE as any).runQuery = (...a: any[]) => { c++; return asil(...a); };
      try { await gunlugu(() => servis([boru], diger).bulkMatch(K, 'b1', adlar)); } finally { (QE as any).runQuery = asil; }
      return c;
    };
    const tek = await say(['KÜRESEL VANA 1"']);
    const cok = await say(Array(25).fill('KÜRESEL VANA 1"'));
    check('H fixture: sayac motor cagrisini GORUYOR', tek > 0, `tek=${tek}`);
    check('★ H ayni ad 25 kez → motor 1 kez kadar calisir', cok === tek, `tek=${tek} 25x=${cok}`);
  }

  console.log(`\n${'='.repeat(60)}\nP4 MOTOR NOTLARI: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
