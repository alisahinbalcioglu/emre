/**
 * DN NOMINAL KOPRUSU — KOMSU DN'IN FIYATI SESSIZCE YAZILIYOR
 *   npm run test:dn-koprusu      (DB GEREKMEZ)
 *
 * ── OLCULEN KUSUR (27.08.2026) ──
 * `conversion.NOMINAL_MM_TO_DN`, mm etiketli urunleri DN sorgulariyla
 * bulusturan bir KOPRUDUR (24.08 ODE R-Flex canli vakasi icin kondu:
 * kutuphanedeki "22 mm" izolasyon, teklifin 1/2" = dn15'iyle bulussun).
 * Kopru 19 olcude mm degerini KOMSU DN'e indirger: 110 mm → dn100,
 * 160 mm → dn150, 22 mm → dn15 ...
 *
 * SATIR tarafinda `sizeEquivalents('unknown', …)` celik ve plastik yorumlarin
 * BIRLESIMINI alir. Celikte DN 110 diye bir olcu YOKTUR (steel.noConversion =
 * true) ama plastik yorumun kopru turevi 'dn100' tag'i birlesime girer.
 * Sonuc — olculdu, uretim yolunda:
 *     satir "Boru DN 110" + havuz {celik "DN 100" @1200 , PPR "32 mm" @90}
 *       → kind=single · confidence=high · NET=1200 · ONAYSIZ
 *     satir "Boru DN 160" + havuz {celik "DN 150" @1800 , …} → NET=1800
 * Motor "bu urunde DN 110 yok" DEMELIYDI: kullanicinin istedigi olcu
 * kutuphanede YOK, komsu bir olcunun fiyati yaziliyor.
 *
 * ── NEDEN TAG DUSURMEK YANLIS (olculerek curutuldu) ──
 * Kopru tag'ini birlesimden cikarmak, kusuru kestigi gibi MESRU KURTARMAYI
 * da keser. Cunku iki urun INDEKSTE BIREBIR AYNI gorunur:
 *     buildProductIndex(cap:"DN 100") → sizeClass=steel capTags=["dn100"]
 *     buildProductIndex(cap:"110 mm") → sizeClass=steel capTags=["dn100"]
 * (tags, sizeClass) ikilisiyle ayirt edilemezler; tag uzayinda yapilan HER
 * eleme 19 olcunun 18'inde "DN N satiri ↔ 'N mm' kutuphane satiri" koprusunu
 * de oldurur → 18 para hatasi 18 SESSIZ KAYBA doner (24.08'de bedeli odenen
 * regresyon sinifi).
 *
 * ── SECILEN COZUM: ELEME DEGIL KAPI (S4 cizgisi) ──
 * Ayirt edici tek sinyal urunun KENDI olcu GOSTERIMIDIR (`capNorm`):
 *     "DN 100" → source='dn'   |   "110 mm" → source='mm'
 * Kural: SATIR DN yaziyorsa ve hayatta kalan adaylarin HEPSI de DN yazip
 * BASKA bir DN degeri beyan ediyorsa, eslesme yalnizca kopruye dayanmaktadir
 * → fiyat OTOMATIK YAZILMAZ, kalem EKRANDA KALIR ve onay istenir.
 * Urun mm/inc yaziyorsa (mesru kopru) kapi SUSAR.
 *
 * ── YAPI ──
 *   Ö*  → FIXTURE KANITI / olcut kontrolu
 *   D-R*→ PARA: kopruye dayanan eslesme otomatik yazilmamali
 *   L*  → ★ REGRESYON KILIDI: mesru kopru ve normal eslesmeler bozulmamali
 */

import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
import { toMatchResult } from '../src/ozellik/fiyat/matching/index/outcome-mapper';
import { extractSizeInfo, sizeEquivalents } from '../src/ozellik/eslestirme/matching/conversion';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';

function prod(c: ProductColumns & { price: number }): IndexedRow {
  const idx = buildProductIndex(c);
  return {
    id: `lib-${idx.rowKey}`,
    listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: {
      ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: typeof c.boy === 'number' ? c.boy : null,
      urunKodu: c.urunKodu ?? null, sheetName: c.sheetName ?? null,
    },
  } as any;
}
const toTry = (v: number) => v;

function sor(satir: string, havuz: IndexedRow[], opts?: any) {
  const line = parseLine(satir);
  const out = runQuery(line, havuz, opts);
  return { out, r: toMatchResult(out, line, toTry as any) };
}

/**
 * Karisik sinif havuzu ZORUNLU: birlesim dali YALNIZ 'unknown' sinifta kosar.
 * ⚠ DOLGUNUN CAPI OLCULEREK SECILDI. Ilk denemede '32 mm' kullanildi ve
 *   DN 42'nin kopru hedefi de dn32 oldugu icin dolgu ADAY OLUYOR, sonuc
 *   'ask'e dusuyordu → L2 kilidi YANLIS SEBEPLE kirmizi verdi (kod degil
 *   fixture kusurlu). Dokum (19 koprulu olcu × aday dolgular):
 *     "32 mm"→1 carpisma [42] · "20 mm"→2 [27,28] · "125 mm"→1 [140]
 *     "250 mm"→1 [273] · "63 mm"→0 · "75 mm"→0 · "90 mm"→0 · "180 mm"→0
 *   '63 mm' secildi: 19 olcunun hicbiriyle carpismiyor.
 */
const PLASTIK_DOLGU = () => prod({ ad: 'PPR Boru', cins: 'ppr', cap: '63 mm', price: 90 } as any);
const CELIK = (cap: string, price: number) =>
  prod({ ad: 'Boru', cins: 'çelik dikişli siyah', cap, price } as any);

/**
 * NOMINAL_MM_TO_DN'in mm ≠ DN olan girdileri (conversion.ts:102-113).
 * [mm, komsuDN] — kopru bu mm'yi o DN'e indirger.
 */
const KOPRU: Array<[number, number]> = [
  [21, 15], [22, 15], [27, 20], [28, 20], [34, 25], [35, 25],
  [42, 32], [48, 40], [60, 50], [76, 65], [89, 80],
  [110, 100], [114, 100], [140, 125], [160, 150], [168, 150],
  [219, 200], [273, 250], [323, 300],
];

// ── HAFIZA IKIZI icin servis kosumu (DB'siz, imza-ekseni-test.ts uslubu) ──
function libSatir(name: string, price: number) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0 };
}
function fakePrisma(libRows: any[]): any {
  const memStore = new Map<string, any>();
  const memKey = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  return {
    userLibrary: { findMany: async (args: any) => {
      const b = args?.where?.brandId;
      if (b && typeof b === 'object' && 'not' in b) return [];
      return libRows;
    } },
    brand: { findUnique: async () => ({ name: 'TEST MARKA' }) },
    eslesmeHafizasi: {
      findUnique: async ({ where }: any) => memStore.get(memKey(where)) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const k = memKey(where); const ex = memStore.get(k);
        if (ex) { ex.secilenAd = update.secilenAd ?? ex.secilenAd; ex.secimSayisi++; }
        else memStore.set(k, { ...create, secimSayisi: 1 });
      },
    },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
  };
}
function makeService(libRows: any[]): any {
  const prisma = fakePrisma(libRows);
  const term = new TerminologyService(prisma);
  const fakeFx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) } as any;
  return new MatchingService(prisma, term, fakeFx);
}
const BRAND = 'brand-1';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * HAFIZA IKIZI (M-R*): kapiyi motorda kapatmak YETMEZ — `MatchResult`
 * sozlesmesi `outcome.kapilar`i tasimadigi icin hafiza otoyazisi
 * (matching.service) kapiyi GOREMEZ ve kullanici bir kez cevap verdiginde
 * UYARI CUMLESINI SILIP fiyati 'high' yazar. `cap-cevrilemedi`de birebir ayni
 * kusur olculup kapatilmisti (bkz. olcu-anahtari-cakismasi-test.ts B-R*);
 * bu blok onun DN koprusundeki IKIZIDIR.
 */
async function hafizaIkizi() {
  console.log('\n── M-R: HAFIZA, "dn-koprusu" KAPISINI SİLMEMELİ (CC ikizinin ikizi) ──');

  // Servis yolunda kutuphane satiri SERBEST METINDIR (ayri cap kolonu yok),
  // bu yuzden urun adinin ICINDE "DN 100" yazar.
  const HAVUZ = [libSatir('Boru Çelik Dikişli Siyah DN 100', 1200), libSatir('PPR Boru 63 mm', 90)];
  const SATIR = 'Boru DN 110';
  const s = makeService(HAVUZ);

  const once = (await s.bulkMatch('u1', BRAND, [SATIR]))[SATIR];
  check('M-R0 FIXTURE KANITI: köprü kapısı GERÇEKTEN koşuyor (gerekçede "köprü")',
    /köprü/i.test(once.reason ?? ''), `reason=${once.reason}`);
  check('M-R0b FIXTURE KANITI: hafızasız hâlde fiyat yazılmıyor, TEK aday var',
    once.netPrice === 0 && (once.candidates?.length ?? 0) === 1,
    `NET=${once.netPrice} aday=${once.candidates?.length ?? 0}`);
  const imza = s.buildImza(SATIR, BRAND);
  check('M-R0c FIXTURE KANITI: imza ÜRETİLİYOR (hafıza yolu gerçekten sürülüyor)',
    typeof imza === 'string' && imza.length > 0, `imza=${imza}`);

  // Kullanici popup'tan secer — `secilenAd` ADAYIN materialName'idir.
  await s.remember('u1', BRAND, SATIR, once.candidates![0].materialName);

  const sonra = (await s.bulkMatch('u1', BRAND, [SATIR]))[SATIR];
  check('M-R1 hafıza, köprü kapısını SİLMEMELİ (fiyat otomatik yazılmamalı)',
    sonra.netPrice === 0,
    `NET=${sonra.netPrice} conf=${sonra.confidence} otoyaz=${sonra.hafizaOtoyaz} reason=${sonra.reason}`);
  check('M-R2 kalem EKRANDA KALMALI — aday listesi korunmalı (S4)',
    (sonra.candidates?.length ?? 0) > 0, `aday=${sonra.candidates?.length ?? 0}`);
}

async function run() {
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Ö: FIXTURE KANITI (bunlar geçmeden aşağısı kanıt değil) ──');

  {
    // Ö1: IKI URUN INDEKSTE AYIRT EDILEMEZ — tag uzayinda fix imkansizdir.
    const a = buildProductIndex({ ad: 'Boru', cins: 'çelik dikişli siyah', cap: 'DN 100' } as any);
    const b = buildProductIndex({ ad: 'Boru', cins: 'çelik dikişli siyah', cap: '110 mm' } as any);
    check('Ö1 "DN 100" ile "110 mm" ürünleri AYNI capTags + sizeClass taşıyor',
      JSON.stringify(a.capTags) === JSON.stringify(b.capTags) && a.sizeClass === b.sizeClass,
      `a=${JSON.stringify(a.capTags)}/${a.sizeClass} b=${JSON.stringify(b.capTags)}/${b.sizeClass}`);
  }
  {
    // Ö2: ...ama capNorm AYIRIYOR — cozumun dayandigi sinyal GERCEKTEN var.
    const a = buildProductIndex({ ad: 'Boru', cins: 'çelik dikişli siyah', cap: 'DN 100' } as any);
    const b = buildProductIndex({ ad: 'Boru', cins: 'çelik dikişli siyah', cap: '110 mm' } as any);
    const sa = a.capNorm ? extractSizeInfo(a.capNorm) : null;
    const sb = b.capNorm ? extractSizeInfo(b.capNorm) : null;
    check('Ö2 capNorm AYIRIYOR: "DN 100"→dn · "110 mm"→mm (ayırt edici sinyal var)',
      sa?.source === 'dn' && sb?.source === 'mm', `a=${a.capNorm}/${sa?.source} b=${b.capNorm}/${sb?.source}`);
  }
  {
    // Ö3: koprunun kendisi calisiyor — birlesimde komsu DN tag'i VAR ve
    //     celik yorumunda bu olcu HIC YOK. Kusurun onkosulu budur.
    const info = extractSizeInfo('DN 110')!;
    const s = sizeEquivalents('steel', info);
    const u = sizeEquivalents('unknown', info);
    check('Ö3 DN 110: çelikte çevrilemez (noConversion) ama birleşimde dn100 VAR',
      s.noConversion === true && u.tags.includes('dn100'),
      `steel.noConv=${s.noConversion} union=${JSON.stringify(u.tags)}`);
  }

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── D-R: PARA — köprüye dayanan eşleşme otomatik yazılmamalı ──');

  {
    const { out, r } = sor('Boru DN 110', [CELIK('DN 100', 1200), PLASTIK_DOLGU()]);
    check('D-R1 "Boru DN 110" → çelik "DN 100"un 1200 TL\'si OTOMATİK yazılmamalı',
      r.netPrice === 0, `kind=${out.kind} conf=${r.confidence} NET=${r.netPrice} matched=${r.matchedName}`);
    check('D-R1b kalem EKRANDA KALMALI (S4: eleme değil onay)',
      (r.candidates?.length ?? 0) > 0 && r.confidence !== 'none',
      `conf=${r.confidence} aday=${r.candidates?.length ?? 0}`);
  }
  {
    const { r } = sor('Boru DN 160', [CELIK('DN 150', 1800), PLASTIK_DOLGU()]);
    check('D-R2 "Boru DN 160" → çelik "DN 150"nin 1800 TL\'si OTOMATİK yazılmamalı',
      r.netPrice === 0, `conf=${r.confidence} NET=${r.netPrice} matched=${r.matchedName}`);
  }
  {
    // D-R3: SAYIMLI kanit — payda ve kirilim basilir.
    const yazan: string[] = [];
    for (const [mm, dn] of KOPRU) {
      const { r } = sor(`Boru DN ${mm}`, [CELIK(`DN ${dn}`, 1000 + mm), PLASTIK_DOLGU()]);
      if (r.netPrice > 0) yazan.push(`DN ${mm}→"DN ${dn}" @${r.netPrice}`);
    }
    check(`D-R3 payda ${KOPRU.length} köprülü ölçü · KOMŞU DN'e OTOMATİK YAZAN = 0 olmalı`,
      yazan.length === 0, `yazan=${yazan.length} → ${yazan.slice(0, 5).join(' | ')}${yazan.length > 5 ? ' …' : ''}`);
  }
  {
    // D-R4: SURUKLEME (auto-variant) ikizi — ayni kapi orada da kosmali.
    // 'auto-variant' yolu celiski zincirinden ONCE doner; freni ayridir.
    // ⚠ variantTags URUNUN KENDISINDEN turetilir. Ilk denemede elle
    //   ['ad:boru','cins:çelik dikişli siyah'] yazilmisti; motor tag'leri
    //   TURKCE KARAKTERSIZ uretiyor ('cins:celik dikisli siyah') ve eslesme
    //   tutmayip sonuc 'ask'e dusuyordu → test YANLIS SEBEPLE yesildi.
    //   Dogru tag'lerle olculdu: kind=auto-variant NET=1200 (kusur BURADA DA VAR).
    const urun = CELIK('DN 100', 1200);
    const havuz = [urun, PLASTIK_DOLGU()];
    const vt = urunVariantTags(urun);
    const { out, r } = sor('Boru DN 110', havuz, { variantTags: vt });
    check('D-R4-Ö FIXTURE KANITI: variantTags ürünün kendi tag\'leriyle kuruldu',
      vt.length > 0 && vt.some((t) => t.startsWith('cins:')), `vt=${JSON.stringify(vt)}`);
    check('D-R4 sürükleme (variantTags) yolunda da otomatik yazılmamalı',
      r.netPrice === 0, `kind=${out.kind} conf=${r.confidence} NET=${r.netPrice}`);
  }

  {
    // D-R5: KAPI KIMLIGI SOZLESMEDIR (types.ts KanitKapisi). Mesin metni
    // kullaniciya aittir ve degisir; kapi kimligi degismez. Ayri assert,
    // cunku ayri kriter (feedback_bir_assert_tek_kriter).
    const { out, r } = sor('Boru DN 110', [CELIK('DN 100', 1200), PLASTIK_DOLGU()]);
    check('D-R5 kapı kimliği taşınmalı: kapilar içinde "dn-koprusu"',
      (out as any).kapilar?.includes('dn-koprusu') === true,
      `kapilar=${JSON.stringify((out as any).kapilar)}`);
    check('D-R5b gerekçe köprüyü SÖYLEMELİ (kullanıcı neyi doğrulayacağını bilsin)',
      /köprü/i.test(r.reason ?? '') && /DN 100/.test(r.reason ?? ''),
      `reason=${r.reason}`);
  }

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── L: ★ REGRESYON KİLİDİ — meşru köprü BOZULMAMALI ──');

  {
    // L1 ★ ASIL RISK: kutuphanede "110 mm" DURUYOR — kopru onu bulmali.
    const { r } = sor('Boru DN 110', [CELIK('110 mm', 900), PLASTIK_DOLGU()]);
    check('L1 ★ "Boru DN 110" ↔ kütüphanedeki "110 mm" köprüsü ÇALIŞMAYA DEVAM etmeli',
      r.netPrice === 900, `conf=${r.confidence} NET=${r.netPrice} matched=${r.matchedName}`);
  }
  {
    // L2 ★ SAYIMLI kilit: 19 olcunun HEPSINDE mm-kurtarmasi ayakta kalmali.
    const kaybeden: string[] = [];
    for (const [mm] of KOPRU) {
      const { r } = sor(`Boru DN ${mm}`, [CELIK(`${mm} mm`, 1000 + mm), PLASTIK_DOLGU()]);
      if (r.netPrice !== 1000 + mm) kaybeden.push(`DN ${mm}→"${mm} mm" NET=${r.netPrice}`);
    }
    check(`L2 ★ payda ${KOPRU.length} · "DN N satırı ↔ 'N mm' kütüphane satırı" kurtarması KAYBOLMAMALI`,
      kaybeden.length === 0, `kaybeden=${kaybeden.length} → ${kaybeden.slice(0, 5).join(' | ')}${kaybeden.length > 5 ? ' …' : ''}`);
  }
  {
    // L3 ★ 24.08 KAUCUK VAKASI: koprunun kondugu asil sebep.
    const { r } = sor('1/2" Elastomerik kauçuk köpüğü boru',
      [prod({ ad: 'Elastomerik kauçuk köpüğü boru', cap: '22 mm', price: 75 } as any)]);
    check('L3 ★ 24.08 kauçuk köprüsü (1/2" ↔ "22 mm") ÇALIŞMAYA DEVAM etmeli',
      r.netPrice === 75, `conf=${r.confidence} NET=${r.netPrice} matched=${r.matchedName}`);
  }
  {
    // L4 ★ TAM ESLESME: satir DN 100, urun DN 100 — kapi SUSMALI.
    const { r } = sor('Boru DN 100', [CELIK('DN 100', 1200), PLASTIK_DOLGU()]);
    check('L4 ★ satır ve ürün AYNI DN\'i yazıyorsa fiyat yazılmaya devam etmeli',
      r.netPrice === 1200, `conf=${r.confidence} NET=${r.netPrice}`);
  }
  {
    // L5 ★ INC/DN cevrimi: satir 4", urun DN 100 — mesru cevrim, kapi SUSMALI.
    const { r } = sor('Boru 4"', [CELIK('DN 100', 1200), PLASTIK_DOLGU()]);
    check('L5 ★ inç↔DN çevrimi (4" ↔ DN 100) bozulmamalı',
      r.netPrice === 1200, `conf=${r.confidence} NET=${r.netPrice}`);
  }
  {
    // L6 ★ TEK SINIF HAVUZ: birlesim dali hic kosmaz — mesaj DOGRU kalmali.
    const { out, r } = sor('Boru DN 110', [CELIK('DN 100', 1200)]);
    check('L6 ★ tek sınıflı havuzda davranış DEĞİŞMEMELİ (none + doğru mesaj)',
      out.kind === 'none' && r.netPrice === 0 && /DN 110/.test(r.reason ?? ''),
      `kind=${out.kind} NET=${r.netPrice} reason=${r.reason}`);
  }

  {
    // L7 ★ `every` KILIDI: havuzda hem kopruye dayanan ("DN 100") hem MESRU
    //     ("110 mm") aday varsa kapi SUSMALI — cunku istenen olcu ASLINDA
    //     bu urunde VAR ve zaten coklu aday soru aciyor. Kapi burada
    //     ateslerse motor "bu üründe DN 110 yok" YALANINI soyler.
    //     (`every` → `some` mutasyonunu bu assert oldurur.)
    const { out, r } = sor('Boru DN 110', [CELIK('DN 100', 1200), CELIK('110 mm', 900), PLASTIK_DOLGU()]);
    check('L7-Ö FIXTURE KANITI: gerçekten çok aday var (kapı tek adayla ölçülmüyor)',
      (r.candidates?.length ?? 0) >= 2, `aday=${r.candidates?.length ?? 0}`);
    check('L7 ★ meşru aday da varken "dn-koprusu" kapısı ATEŞLENMEMELİ (yalan mesaj yasağı)',
      (out as any).kapilar?.includes('dn-koprusu') !== true,
      `kapilar=${JSON.stringify((out as any).kapilar)} reason=${r.reason}`);
  }

  await hafizaIkizi();

  console.log(`\n${'='.repeat(64)}`);
  console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
