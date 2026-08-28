/**
 * S4 + S5 KILIDI — MALZEME KATMANI + AILE ZAYIFLIGI
 *   npx ts-node test/s45-malzeme-aile-test.ts   (npm run test:s45)
 *
 * ── S5: MALZEME KATMANI ────────────────────────────────────────────────
 * Sozluk "pis su = PVC|HDPE" bilgisini TASIYOR (ALIAS_SEEDS kinds) ama bu
 * bilgi motora HIC ulasmiyordu: matching.service `kinds`i yalniz
 * siyah|galvaniz suzgecinden geciriyor, gerisi dusuyordu. Yapisal kok:
 * SizeClass yalnizca steel|plastic|unknown — PVC ile PP'yi ayirt edecek bir
 * olcu motorda YOKTU.
 * Kural (muhurlu 16.07 "TABAN YUZEY SIRALAR, ELEMEZ" kararinin malzeme
 * eksenine dogal genislemesi): beklenen malzemeyi tasiyan aday ONE, CAKISAN
 * malzeme tasiyan SONA; cakisan TEK aday kalirsa fiyat OTOMATIK YAZILMAZ.
 * SERT FILTRE YOK — malzemesi cozulemeyen urun elenmez (kanit yok, suclama yok).
 *
 * ── S4: AILE ZAYIFLIGI ─────────────────────────────────────────────────
 * product-index.resolveFamily aileyi ADdan cozemezse KATEGORIDEN cozer.
 * "Yiv açma makinesi" (Kategori: Boru Hattı Ekipmanları) boylece 'boru'
 * ailesine yaziliyor ve capsiz-istisnasi + ad-gevsetme yollarindan gecip
 * BORU satirlarina aday olabiliyordu. Kategori fallback'i KALIR (kapsamayi
 * o kazandirdi) ama zayif aile GUVENLIK FRENI tasir:
 *   (a) capsiz istisnasindan yararlanamaz · (b) ad-gevsetmeden gecemez
 *   (c) capraz-marka onerisi olamaz
 *
 * ── S7: ROZET ──────────────────────────────────────────────────────────
 * conversion.plasticEquivalents sabit "(PPR-mm)" yaziyordu; plastik sinifin
 * TAMAMI (PVC/HDPE/PE) o rozeti aliyordu. Sayilar dogru, ETIKET yaniltici.
 *
 * ── OLCUM DISIPLINI ────────────────────────────────────────────────────
 * Her bolumde IKI AILE olculur (S5: pis su + hidrant · S4: boru + vana) —
 * ornege ozel duzeltme genellik saymaz. Bos-kume kapilari ayri assert'tir:
 * havuzun dolu oldugu ve bugunku davranisin GERCEKTEN aday urettigi
 * ("0 aday" ile "0 alternatif" karismasin) tek tek kanitlanir.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { sizeEquivalents } from '../src/ozellik/eslestirme/matching/conversion';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 11 kolonlu urun satiri → motor havuzu satiri (URETIM indeksleyicisiyle) */
function prod(c: ProductColumns & { discount?: number }): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    listPrice: c.price, customPrice: null, discountRate: c.discount ?? 0,
    currency: (c.paraBirimi as string) ?? 'TRY',
    urun: {
      ...idx,
      ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null,
      price: c.price, birim: c.birim ?? null,
    },
  };
}

/** UserLibrary satiri (Prisma include:{product} sekli) — dispatch testleri icin */
function libRow(c: ProductColumns & { discount?: number }) {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: null, discountRate: c.discount ?? 0,
    currency: (c.paraBirimi as string) ?? 'TRY',
    productIndexId: `pi-${idx.rowKey}`,
    product: {
      ...idx, id: `pi-${idx.rowKey}`,
      ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null,
      price: c.price, birim: c.birim ?? null,
    },
  };
}

// ── URUN FIXTURE'LARI ─────────────────────────────────────────────────
// PVC / PP / PE100: UCU DE plastik sinif — bugunku sizeClass suzgeci
// uculunu de gecirir. Ayrimi YALNIZ malzeme etiketi yapabilir.
const PVC = { kategori: 'Pis Su Boruları', ad: 'PVC atık su borusu', cins: 'PVC-U', cap: '110 mm', price: 300, sheetName: 'S1' };
const PP = { kategori: 'Tesisat Boruları', ad: 'PP boru', cins: 'PP-R', cap: '110 mm', price: 500, sheetName: 'S1' };
const PE = { kategori: 'Hidrant Hattı', ad: 'PE100 boru', cins: 'PE 100', cap: '110 mm', price: 400, sheetName: 'S1' };

// AILESI ZAYIF urunler: adlari HICBIR aile cozmuyor, aile YALNIZ kategoriden
// geliyor (probe ile dogrulandi — resolveFamily(ad, null) === null).
const ZAYIF_BORU_CAPSIZ = { kategori: 'Boru Hattı Ekipmanları', ad: 'Yiv açma makinesi', price: 373825, sheetName: 'S2' };
const ZAYIF_VANA_CAPSIZ = { kategori: 'Vana Aksesuarları', ad: 'Yedek prob', price: 9100, sheetName: 'S2' };
const ZAYIF_VANA_SWING = { kategori: 'Vana Aksesuarları', ad: 'Yedek prob', cins: 'swing', cap: 'DN50', price: 9100, sheetName: 'S2' };
const ZAYIF_BORU_SPIRAL = { kategori: 'Boru Hattı Ekipmanları', ad: 'Yiv açma makinesi', cins: 'spiral', cap: 'DN80', price: 373825, sheetName: 'S2' };
const ZAYIF_VANA_GOVDE = { kategori: 'Vana Grupları', ad: 'Kelebek gövde', cap: 'DN50', price: 1234, sheetName: 'S2' };
const ZAYIF_BORU_GOVDE = { kategori: 'Boru Hattı Ekipmanları', ad: 'Kaynaklı gövde', cap: 'DN80', price: 4321, sheetName: 'S2' };
// AILESI GUCLU karsilastirma urunleri (ad'dan cozulur)
const GUCLU_BORU = { kategori: 'Tesisat Boruları', ad: 'Siyah çelik boru', cins: 'siyah', cap: 'DN80', price: 800, sheetName: 'S3' };
const GUCLU_VANA = { kategori: 'Kelebek Vanalar', ad: 'Kelebek vana', cins: 'pirinç', cap: 'DN50', price: 1500, sheetName: 'S3' };

const noFx = (v: number) => v;

// ══════════════════════════════════════════════════════════════════════
// BOLUM A — S5 MALZEME KATMANI (dispatch: sozlukten motora)
// ══════════════════════════════════════════════════════════════════════
async function bolumA() {
  const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
  const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');

  function svcWith(rows: any[], otherRows: any[] = [], brandName = 'TEST') {
    const prisma: any = {
      userLibrary: {
        findMany: async (args: any) => {
          const b = args?.where?.brandId;
          if (b && typeof b === 'object' && 'not' in b) return otherRows;
          return rows;
        },
      },
      brand: { findUnique: async () => ({ name: brandName }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) };
    return new MatchingService(prisma, new TerminologyService(prisma), fx);
  }
  const sor = async (svc: any, q: string) => (await svc.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', [q]))[q];

  // ── A0 BOS KUME KAPISI: sozlukteki malzeme bilgisi GERCEKTEN var mi? ──
  // (Olcut once dogrulanir: assert'lerin dayandigi seed alanlari bos olsaydi
  //  asagidaki tum kirmizilar "veri yok"tan gelir, kusurdan degil.)
  const pisSu = ALIAS_SEEDS.find((s: any) => s.alias === 'pis su');
  const hidrant = ALIAS_SEEDS.find((s: any) => s.alias === 'hidrant hatti');
  check('A0a sozlukte "pis su" alias\'i PVC bilgisini tasiyor',
    !!pisSu && pisSu.kinds.includes('pvc'), `got ${JSON.stringify(pisSu?.kinds)}`);
  check('A0b sozlukte "hidrant hatti" alias\'i HDPE/PE bilgisini tasiyor',
    !!hidrant && (hidrant.kinds.includes('hdpe') || hidrant.kinds.includes('pe')), `got ${JSON.stringify(hidrant?.kinds)}`);

  // ── AILE 1: PIS SU (beklenen malzeme PVC|PE) ──────────────────────────
  // Havuzda PP ONCE duruyor: siralama duzelmezse aday listesinin basinda
  // PP kalir (bugunku davranis).
  {
    const svc = svcWith([libRow(PP), libRow(PVC)]);
    const r = await sor(svc, 'PİS SU BORUSU DN 110');
    check('A1a bos-kume kapisi: pis su satiri IKI aday uretiyor (havuz dolu)',
      (r?.candidates?.length ?? 0) === 2, `got ${r?.confidence} adayi=${r?.candidates?.length}`);
    check('A1b PIS SU: beklenen malzeme (PVC) listenin BASINDA',
      /PVC/i.test(r?.candidates?.[0]?.materialName ?? ''), `got "${r?.candidates?.[0]?.materialName}"`);
    check('A1c PIS SU: cakisan malzeme (PP) listenin SONUNDA — elenmez, siralanir',
      /PP/i.test(r?.candidates?.[r.candidates.length - 1]?.materialName ?? ''), `got "${r?.candidates?.[(r?.candidates?.length ?? 1) - 1]?.materialName}"`);
  }
  {
    const svc = svcWith([libRow(PP)]);
    const r = await sor(svc, 'PİS SU BORUSU DN 110');
    check('A2a PIS SU: cakisan malzemeli TEK aday elenmez (havuzda kalir)',
      (r?.candidates?.length ?? 0) === 1 || r?.netPrice === PP.price, `got ${r?.confidence} adayi=${r?.candidates?.length} net=${r?.netPrice}`);
    check('A2b PIS SU: cakisan malzemeli TEK adaya fiyat OTOMATIK YAZILMAZ',
      r?.confidence !== 'high' && r?.netPrice === 0, `got ${r?.confidence} net=${r?.netPrice}`);
  }

  // ── AILE 2: HIDRANT (beklenen malzeme PE) ─────────────────────────────
  {
    const svc = svcWith([libRow(PVC), libRow(PE)]);
    const r = await sor(svc, 'HİDRANT HATTI BORUSU DN 110');
    check('A3a bos-kume kapisi: hidrant satiri IKI aday uretiyor (havuz dolu)',
      (r?.candidates?.length ?? 0) === 2, `got ${r?.confidence} adayi=${r?.candidates?.length}`);
    check('A3b HIDRANT: beklenen malzeme (PE100) listenin BASINDA',
      /PE100/i.test(r?.candidates?.[0]?.materialName ?? ''), `got "${r?.candidates?.[0]?.materialName}"`);
  }
  {
    const svc = svcWith([libRow(PVC)]);
    const r = await sor(svc, 'HİDRANT HATTI BORUSU DN 110');
    check('A4 HIDRANT: cakisan malzemeli TEK adaya fiyat OTOMATIK YAZILMAZ',
      r?.confidence !== 'high' && r?.netPrice === 0, `got ${r?.confidence} net=${r?.netPrice}`);
  }

  // ── A5 K4 KORUNUR: satirda malzeme ACIKCA yaziliysa SERT filtre ───────
  // ("PVC" yazan satir PP'yi ELER — siralama degil eleme; T3/T5 satir kazanir)
  {
    const svc = svcWith([libRow(PP), libRow(PVC)]);
    const r = await sor(svc, 'PVC PİS SU BORUSU DN 110');
    check('A5 K4: satirda yazili malzeme SERT filtre olarak kalir (PP elenir, fiyat yazilir)',
      r?.confidence === 'high' && r?.netPrice === PVC.price, `got ${r?.confidence} net=${r?.netPrice}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// BOLUM B — S5 MOTOR SOZLESMESI (dispatch'ten BAGIMSIZ)
// ══════════════════════════════════════════════════════════════════════
function bolumB() {
  const havuz = [prod(PP), prod(PVC)];
  const line = parseLine('BORU DN 110');
  const o: any = runQuery(line, havuz, { hintMalzeme: ['pvc'] } as any);
  check('B0 bos-kume kapisi: motor havuzu IKI aday tasiyor',
    o.kind === 'ask' && o.rows.length === 2, `got ${o.kind} rows=${o.rows?.length}`);
  check('B1 motor sozlesmesi: hintMalzeme beklenen malzemeyi ONE alir',
    o.kind === 'ask' && /PVC/i.test(o.rows?.[0]?.urun?.ad ?? ''), `got "${o.rows?.[0]?.urun?.ad}"`);

  const tek: any = runQuery(parseLine('BORU DN 110'), [prod(PP)], { hintMalzeme: ['pvc'] } as any);
  check('B2 motor sozlesmesi: cakisan TEK aday "single" DEGIL, onay listesi',
    tek.kind === 'ask' && tek.rows.length === 1, `got ${tek.kind}`);
  check('B3 motor sozlesmesi: kapi kimligi yapisal listede (malzeme-celiskisi)',
    (tek.kapilar ?? []).includes('malzeme-celiskisi'), `got ${JSON.stringify(tek.kapilar)}`);

  // Malzemesi COZULEMEYEN urun ELENMEZ ve FRENLENMEZ (kanit yok, suclama yok)
  const notr: any = runQuery(parseLine('GÖVDE BORU DN 80'), [prod(ZAYIF_BORU_GOVDE)], { hintMalzeme: ['pvc'] } as any);
  check('B4 malzemesi cozulemeyen urun sert elenmez (sonuc "none" degil)',
    notr.kind !== 'none', `got ${notr.kind}`);
}

// ══════════════════════════════════════════════════════════════════════
// BOLUM C — S4 AILE ZAYIFLIGI
// ══════════════════════════════════════════════════════════════════════
function bolumC() {
  // ── C0: BAYRAK. Aile YALNIZ kategoriden cozulduyse zayif; ADdan
  //        cozulduyse (veya self-family) GUCLU. Iki aile, dort assert.
  const zBoru: any = buildProductIndex(ZAYIF_BORU_CAPSIZ);
  const zVana: any = buildProductIndex(ZAYIF_VANA_CAPSIZ);
  const gBoru: any = buildProductIndex(GUCLU_BORU);
  const gVana: any = buildProductIndex(GUCLU_VANA);
  check('C0a bos-kume kapisi: kategori fallback\'i HALA calisiyor (kapsama korunur)',
    zBoru.adSlug === 'boru' && zVana.adSlug === 'vana', `got ${zBoru.adSlug} / ${zVana.adSlug}`);
  check('C0b BORU: aile yalniz kategoriden cozuldu → aileZayif', zBoru.aileZayif === true, `got ${zBoru.aileZayif}`);
  check('C0c VANA: aile yalniz kategoriden cozuldu → aileZayif', zVana.aileZayif === true, `got ${zVana.aileZayif}`);
  check('C0d BORU: aile ADdan cozuldu → aileZayif DEGIL', gBoru.aileZayif === false, `got ${gBoru.aileZayif}`);
  check('C0e VANA: aile ADdan cozuldu → aileZayif DEGIL', gVana.aileZayif === false, `got ${gVana.aileZayif}`);
  // OLCUT DOGRULAMASI (bos-kume kapisi): asagidaki C1 assert'leri "urunun capi
  // YOK" varsayimina dayanir. Fixture capli olsaydi capsiz istisnasi HIC
  // calismaz, testler kusuru degil kendi verisini olcerdi.
  check('C0f BORU fixture GERCEKTEN capsiz (capTags bos)', zBoru.capTags.length === 0, `got ${JSON.stringify(zBoru.capTags)}`);
  check('C0g VANA fixture GERCEKTEN capsiz (capTags bos)', zVana.capTags.length === 0, `got ${JSON.stringify(zVana.capTags)}`);

  // ── C1 (a): CAPSIZ ISTISNASI — ELEMEZ, ONAY ISTER (06.08 DUZELTMESI) ──
  // ONCEKI SURUM (regresyon): zayif aile capsiz istisnasindan GECEMIYOR,
  // sonuc 'none/cap-yok' oluyordu → kalem KULLANICININ EKRANINDAN KAYBOLUYOR.
  // Kullanici karari: aileZayif SERT ELEME degil GUVENLIK FRENIDIR. Capsiz
  // urun icin dogru davranis "hic gosterme" DEGIL, "goster ama ONAY iste".
  // Ayrim: ad-gevsetme ve capraz-marka frenleri TAHMIN URETIYOR (olmayan bir
  // eslesmeyi ureten yollar) — capsiz istisnasi ise VAR OLAN bir kalemi
  // gosteriyor. Bu yuzden o iki fren AYNEN kalir (C2*, D*), bu kalkar.
  {
    const o: any = runQuery(parseLine('YİV AÇMA MAKİNESİ DN 80'), [prod(ZAYIF_BORU_CAPSIZ), prod(GUCLU_BORU)]);
    check('C1a BORU zayif aile: capsiz istisnasi ELEMEZ → onay listesi (ask)',
      o.kind === 'ask', `got ${o.kind}/${o.reason} rows=${o.rows?.length}`);
    check('C1a2 BORU zayif aile: aday LISTEDE duruyor (ekrandan kaybolmuyor)',
      o.rows?.length === 1 && o.rows?.[0]?.urun?.ad === 'Yiv açma makinesi', `got rows=${JSON.stringify(o.rows?.map((r: any) => r.urun.ad))}`);
    check('C1a3 BORU zayif aile: kapi kimligi yapisal listede (aile-zayif)',
      (o.kapilar ?? []).includes('aile-zayif'), `got ${JSON.stringify(o.kapilar)}`);
    check('C1a4 BORU zayif aile: capsiz kapisi da atesler (cap dogrulanmadi)',
      (o.kapilar ?? []).includes('capsiz-dusum'), `got ${JSON.stringify(o.kapilar)}`);
  }
  {
    const o: any = runQuery(parseLine('YEDEK PROB DN 50'), [prod(ZAYIF_VANA_CAPSIZ), prod(GUCLU_VANA)]);
    check('C1b VANA zayif aile: capsiz istisnasi ELEMEZ → onay listesi (ask)',
      o.kind === 'ask', `got ${o.kind}/${o.reason} rows=${o.rows?.length}`);
    check('C1b2 VANA zayif aile: aday LISTEDE duruyor (ekrandan kaybolmuyor)',
      o.rows?.length === 1 && o.rows?.[0]?.urun?.ad === 'Yedek prob', `got rows=${JSON.stringify(o.rows?.map((r: any) => r.urun.ad))}`);
    check('C1b3 VANA zayif aile: kapi kimligi yapisal listede (aile-zayif)',
      (o.kapilar ?? []).includes('aile-zayif'), `got ${JSON.stringify(o.kapilar)}`);
    check('C1b4 VANA zayif aile: capsiz kapisi da atesler (cap dogrulanmadi)',
      (o.kapilar ?? []).includes('capsiz-dusum'), `got ${JSON.stringify(o.kapilar)}`);
  }
  {
    // KALKAN: GUCLU ailede capsiz istisnasi AYNEN durur — davranisi bugunku
    // gibi kalmali (fren yalniz ZAYIF aileye ek kapi ekler, akisi degistirmez).
    const capsizGuclu = { kategori: 'Tesisat Boruları', ad: 'Siyah çelik boru', cins: 'siyah', price: 800, sheetName: 'S3' };
    const o: any = runQuery(parseLine('SİYAH ÇELİK BORU DN 80'), [prod(capsizGuclu)]);
    check('C1c KALKAN: guclu ailede capsiz istisnasi AYNEN durur (aday yasar)',
      o.kind === 'ask' && o.rows.length === 1, `got ${o.kind} rows=${o.rows?.length}`);
    check('C1d KALKAN: guclu aile adayinda "aile-zayif" kapisi ACILMAZ',
      !(o.kapilar ?? []).includes('aile-zayif'), `got ${JSON.stringify(o.kapilar)}`);
  }

  // ── C2 (b): AD-GEVSETMEDEN GECEMEZ ───────────────────────────────────
  {
    const o: any = runQuery(parseLine('KELEBEK SWING VANA DN 50'), [prod(GUCLU_VANA), prod(ZAYIF_VANA_SWING)]);
    check('C2a VANA zayif aile: ad-gevsetme kurtarmasindan gecemez',
      o.kind === 'none' && o.reason === 'kriter-yok', `got ${o.kind}/${o.reason} rows=${o.rows?.length}`);
  }
  {
    const o: any = runQuery(parseLine('ÇELİK SPİRAL BORU DN 80'), [prod(GUCLU_BORU), prod(ZAYIF_BORU_SPIRAL)]);
    check('C2b BORU zayif aile: ad-gevsetme kurtarmasindan gecemez',
      o.kind === 'none' && o.reason === 'kriter-yok', `got ${o.kind}/${o.reason} rows=${o.rows?.length}`);
  }
  {
    // KARSIT KONTROL: gevsetme GUCLU ailede AYNEN calisir (16.07 "Swing Çek
    // Vana" vakasinin kazanimi kaybolmadi).
    const gucluSwing = { kategori: 'Çek Vanalar', ad: 'Çekvalf BC-100', cins: 'swing', cap: 'DN50', price: 2222, sheetName: 'S3' };
    const o: any = runQuery(parseLine('KELEBEK SWING VANA DN 50'), [prod(GUCLU_VANA), prod(gucluSwing)]);
    check('C2c KARSIT: guclu ailede ad-gevsetme AYNEN calisir',
      o.kind === 'ask' && o.rows.length === 1 && o.rows[0].urun.ad === 'Çekvalf BC-100', `got ${o.kind}/${o.reason} rows=${o.rows?.length}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// BOLUM C2 — S4 (a): ONAY ISTENIR ama FIYAT OTOMATIK YAZILMAZ
// ══════════════════════════════════════════════════════════════════════
// C1* motor sozlesmesini olcer ('ask' dali). Burada UCTAN UCA olculur:
// kalem kullaniciya GORUNUR (aday listede) ama netPrice 0 kalir — "goster
// ama onay iste" kuralinin iki yarisi AYRI assert'lerdir.
async function bolumC2() {
  const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
  const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
  function svcWith(rows: any[]) {
    const prisma: any = {
      userLibrary: {
        findMany: async (args: any) => {
          const b = args?.where?.brandId;
          if (b && typeof b === 'object' && 'not' in b) return [];
          return rows;
        },
      },
      brand: { findUnique: async () => ({ name: 'TEST' }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) };
    return new MatchingService(prisma, new TerminologyService(prisma), fx);
  }

  // AILE 1 — BORU
  {
    const q = 'YİV AÇMA MAKİNESİ DN 80';
    const r = (await svcWith([libRow(ZAYIF_BORU_CAPSIZ)]).bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', [q]))[q];
    check('C3a BORU zayif aile: kalem EKRANDA (aday uretiliyor)',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} adayi=${r?.candidates?.length}`);
    check('C3b BORU zayif aile: fiyat OTOMATIK YAZILMAZ (netPrice 0)',
      r?.netPrice === 0, `got net=${r?.netPrice}`);
  }
  // AILE 2 — VANA
  {
    const q = 'YEDEK PROB DN 50';
    const r = (await svcWith([libRow(ZAYIF_VANA_CAPSIZ)]).bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', [q]))[q];
    check('C4a VANA zayif aile: kalem EKRANDA (aday uretiliyor)',
      (r?.candidates?.length ?? 0) === 1, `got ${r?.confidence} adayi=${r?.candidates?.length}`);
    check('C4b VANA zayif aile: fiyat OTOMATIK YAZILMAZ (netPrice 0)',
      r?.netPrice === 0, `got net=${r?.netPrice}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// BOLUM D — S4 (c): CAPRAZ-MARKA ONERISI OLAMAZ
// ══════════════════════════════════════════════════════════════════════
async function bolumD() {
  const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
  const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
  function svcWith(rows: any[], otherRows: any[]) {
    const prisma: any = {
      userLibrary: {
        findMany: async (args: any) => {
          const b = args?.where?.brandId;
          if (b && typeof b === 'object' && 'not' in b) return otherRows;
          return rows;
        },
      },
      brand: { findUnique: async () => ({ name: 'TEST' }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    };
    const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) };
    return new MatchingService(prisma, new TerminologyService(prisma), fx);
  }
  const marka = (r: any, id: string, name: string) => ({ ...r, brand: { id, name } });

  // AILE 1 — VANA
  {
    const zayif = [marka(libRow(ZAYIF_VANA_GOVDE), 'b-x', 'X MARKA')];
    const guclu = [marka(libRow({ ...GUCLU_VANA, ad: 'Kelebek vana' }), 'b-y', 'Y MARKA')];
    const kendi = [libRow({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', cap: 'DN25', price: 850, sheetName: 'S0' })];
    // BOS KUME KAPISI: ayni mekanizma GUCLU aile ile aday URETIYOR mu?
    const svcG = svcWith(kendi, guclu);
    const rG = (await svcG.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', ['KELEBEK VANA DN 50']))['KELEBEK VANA DN 50'];
    check('D0a bos-kume kapisi: guclu ailede capraz-marka onerisi URETILIYOR',
      (rG?.alternatives?.length ?? 0) === 1, `got ${JSON.stringify(rG?.alternatives)}`);
    const svcZ = svcWith(kendi, zayif);
    const rZ = (await svcZ.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', ['KELEBEK VANA DN 50']))['KELEBEK VANA DN 50'];
    check('D1 VANA zayif aile: capraz-marka onerisi OLAMAZ',
      (rZ?.alternatives?.length ?? 0) === 0, `got ${JSON.stringify(rZ?.alternatives)}`);
  }

  // AILE 2 — BORU
  {
    const zayif = [marka(libRow(ZAYIF_BORU_GOVDE), 'b-x', 'X MARKA')];
    const guclu = [marka(libRow({ kategori: 'Tesisat Boruları', ad: 'Gövdeli çelik boru', cins: 'siyah', cap: 'DN80', price: 999, sheetName: 'S4' }), 'b-y', 'Y MARKA')];
    const kendi = [libRow({ kategori: 'Küresel Vanalar', ad: 'Küresel vana', cins: 'pirinç', cap: 'DN25', price: 850, sheetName: 'S0' })];
    const svcG = svcWith(kendi, guclu);
    const rG = (await svcG.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', ['GÖVDE BORU DN 80']))['GÖVDE BORU DN 80'];
    check('D0b bos-kume kapisi: guclu ailede capraz-marka onerisi URETILIYOR',
      (rG?.alternatives?.length ?? 0) === 1, `got ${JSON.stringify(rG?.alternatives)}`);
    const svcZ = svcWith(kendi, zayif);
    const rZ = (await svcZ.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'brand-1', ['GÖVDE BORU DN 80']))['GÖVDE BORU DN 80'];
    check('D2 BORU zayif aile: capraz-marka onerisi OLAMAZ',
      (rZ?.alternatives?.length ?? 0) === 0, `got ${JSON.stringify(rZ?.alternatives)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// BOLUM E — S7 ROZET (kozmetik; SAYILARA DOKUNULMAZ)
// ══════════════════════════════════════════════════════════════════════
function bolumE() {
  const dn = sizeEquivalents('plastic', { source: 'dn', value: 110, display: 'DN 110' });
  const inc = sizeEquivalents('plastic', { source: 'inch', value: 1, display: '1"' });
  check('E0 bos-kume kapisi: plastik cevrim rozeti GERCEKTEN uretiliyor',
    !!dn.rozet && !!inc.rozet, `got "${dn.rozet}" / "${inc.rozet}"`);
  check('E1 DN rozetinde yaniltici "PPR" ibaresi YOK (PVC/HDPE de bu yoldan gecer)',
    !/PPR/i.test(dn.rozet ?? ''), `got "${dn.rozet}"`);
  check('E2 inc rozetinde yaniltici "PPR" ibaresi YOK',
    !/PPR/i.test(inc.rozet ?? ''), `got "${inc.rozet}"`);
  check('E3 SAYILAR DEGISMEDI: DN110 → 110 mm, tag kumesi korunur',
    (dn.rozet ?? '').includes('110 mm') && dn.tags.includes('dn110') && dn.tags.includes('od-110'),
    `got "${dn.rozet}" tags=${JSON.stringify(dn.tags)}`);
  check('E4 SAYILAR DEGISMEDI: 1" → 32 mm',
    (inc.rozet ?? '').includes('32 mm') && inc.tags.includes('od-32'), `got "${inc.rozet}" tags=${JSON.stringify(inc.tags)}`);
}

(async () => {
  console.log('\n=== BOLUM A — S5 malzeme katmani (sozluk → motor) ===');
  await bolumA();
  console.log('\n=== BOLUM B — S5 motor sozlesmesi ===');
  bolumB();
  console.log('\n=== BOLUM C — S4 aile zayifligi (bayrak + a + b) ===');
  bolumC();
  console.log('\n=== BOLUM C2 — S4 (a) uctan uca: goster ama onay iste ===');
  await bolumC2();
  console.log('\n=== BOLUM D — S4 (c) capraz-marka onerisi ===');
  await bolumD();
  console.log('\n=== BOLUM E — S7 rozet ===');
  bolumE();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`S4+S5: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { console.log('\nBASARISIZ:'); failures.forEach((f) => console.log(`  - ${f}`)); }
  process.exit(failed > 0 ? 1 : 0);
})();
