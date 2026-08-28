/**
 * HAFIZA IMZASININ EKSENLERI — KIRMIZI KANIT TURU (04.08.2026)
 *   npm run test:imza     (DB GEREKMEZ)
 *
 * OLCULEN SEY: `matching.service.ts` icindeki `buildImza` — ogrenme
 * hafizasinin (EslesmeHafizasi) ANAHTARI. Ayni imza = "ayni belirsizlik",
 * yani gecmis secim bu satira ON-SECILI getirilir.
 *
 * TESHIS (bu turdan once olculdu): `buildImza` (matching.service.ts:832-840)
 * etiketlerden YALNIZ olcu (dn.. ve od-.. onekleri) + materialType +
 * KIND_TAGS suzer.
 * `shared-tag-matcher.ts:18-20` SURFACE_TAGS (galvaniz/siyah/kirmizi/boyali)
 * ve `:27-29` CONNECTION_TAGS (disli/kaynakli/flans/pres/duz-uclu/yivli)
 * TANIMLI ama imzaya HIC girmiyor. Sonucta yuzeyi, baglantisi ve akiskani
 * farkli sorgular TEK anahtara duser; birinde verilen karar otekine
 * "onceki tercihiniz" diye gosterilir. Gercek veride olculen bedel:
 * galvanizli boru siyahtan %20,5-%46,9 pahali.
 *
 * ── BU DOSYANIN YAPISI ──
 *  Ö* → OLCUT KONTROLU. Once ölçüm aracinin kendisini sinar (bos etiket
 *        kumesi "esit" uretip yalanci yesil vermesin diye). BUGUN YESIL.
 *  A-R*, E-R*, C-R* → KIRMIZI KANIT. Dogru davranisi yazar, bugun FAIL eder.
 *  L*  → ★ REGRESYON KILIDI. Bugun YESIL; duzeltmeden SONRA da yesil kalmali
 *        (buildKindImza kasitli genis birakildi — daraltilmamali).
 *
 * ⚠ BU SUITE BUGUN KIRMIZIDIR VE OYLE OLMASI GEREKIR (kirmizi-once).
 *   Yesile donmesi, duzeltmenin YAPILDIGI anlamina gelir.
 *
 * ERISIM GEREKCESI: `buildImza`/`buildKindImza` TypeScript'te `private`,
 * yani derleme-zamani kisitidir; calisma zamaninda normal metotlardir.
 * Uretim yolunu (bulkMatch → hafizaOnSecim) DB'siz surmek fake Prisma ile
 * mumkun ama imzayi DOGRUDAN okumaz — bu yuzden saf fonksiyon assertleri
 * `(svc as any).buildImza(...)` ile cagrilir. Uretim koduna test icin
 * `export`/gorunurluk DEGISIKLIGI YAPILMADI (kural 7: yeni ozellik ekleme).
 * C-R1 ise ekrana gercekten cikan metni olctugu icin TAM uretim yolundan
 * (bulkMatch + remember) gecer.
 */

import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { generateTags } from '../src/ozellik/eslestirme/matching/tag-generator';
import { SURFACE_TAGS, CONNECTION_TAGS } from '../src/ozellik/eslestirme/matching/shared-tag-matcher';

// ── Fake kutuphane satiri (matching-unit-test.ts uslubu) ───────────
function lib(name: string, price: number) {
  return { id: `lib-${name}`, material: null, materialName: name, customPrice: null, listPrice: price, discountRate: 0 };
}

function fakePrisma(brandName: string, libRows: any[]): any {
  const memStore = new Map<string, any>();
  const memKey = (w: any) => `${w.userId_imza.userId}|${w.userId_imza.imza}`;
  return {
    userLibrary: { findMany: async (args: any) => {
      const b = args?.where?.brandId;
      if (b && typeof b === 'object' && 'not' in b) return [];
      return libRows;
    } },
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
  };
}

function makeService(brandName = 'ÇAYIROVA', libRows: any[] = []): MatchingService {
  const prisma = fakePrisma(brandName, libRows);
  const term = new TerminologyService(prisma);
  const fakeFx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) } as any;
  return new MatchingService(prisma, term, fakeFx);
}

const BRAND = 'brand-1';

// ── Runner (matching-unit-test.ts ile ayni) ────────────────────────
let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function run() {
  const svc: any = makeService();
  const term: any = (svc as any).terminology;
  const aliases = await term.loadAliases('u1');
  const imza = (n: string) => svc.buildImza(n, BRAND) as string;
  const kindImza = (n: string) => svc.buildKindImza(n, BRAND, aliases) as string;

  // ═══════════════════════════════════════════════════════════════
  // Ö — OLCUT KONTROLU (bugun YESIL). Bunlar gecmeden asagidaki
  //     "esit/farkli" iddialarinin hicbiri kanit degildir.
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── Ö: ÖLÇÜT KONTROLÜ (boş küme / kör ölçüt kapısı) ──');

  // Ö1: fixture GERCEKTEN dolu — bos etiket kumesi her sorguyu ayni
  //     imzaya dusurur ve tum "esitler" assertleri YALANCI YESIL olurdu.
  {
    const t = generateTags('2" Siyah boru').tags;
    check('Ö1 etiket kümesi BOŞ DEĞİL ("2\\" Siyah boru")',
      t.length > 0, `tags=${JSON.stringify(t)}`);
  }
  // Ö2: yuzey kelimesi ETIKETE cikiyor — yani sorun "etiket uretilmiyor"
  //     degil, "uretilen etiket imzaya alinmiyor".
  {
    const t = generateTags('2" Siyah boru').tags;
    check('Ö2 yüzey etiketi üretiliyor: "siyah" tags içinde',
      t.includes('siyah'), `tags=${JSON.stringify(t)}`);
  }
  {
    const t = generateTags('2" Galvanizli boru').tags;
    check('Ö3 yüzey etiketi üretiliyor: "galvaniz" tags içinde',
      t.includes('galvaniz'), `tags=${JSON.stringify(t)}`);
  }
  {
    const t = generateTags('DN100 Dişli Manşonlu boru').tags;
    check('Ö4 bağlantı etiketi üretiliyor: "disli" tags içinde',
      t.includes('disli'), `tags=${JSON.stringify(t)}`);
  }
  {
    const t = generateTags('DN100 Düz Uçlu boru').tags;
    check('Ö5 bağlantı etiketi üretiliyor: "duz-uclu" tags içinde',
      t.includes('duz-uclu'), `tags=${JSON.stringify(t)}`);
  }
  {
    const t = generateTags('2" Doğalgaz borusu').tags;
    check('Ö6 akışkan etiketi üretiliyor: "dogalgaz" tags içinde',
      t.includes('dogalgaz'), `tags=${JSON.stringify(t)}`);
  }
  // Ö7: iddia edilen etiketler gercekten SURFACE/CONNECTION kumelerinde —
  //     teshis metni ile kod arasindaki bagi dogrular.
  {
    check('Ö7 "siyah" ve "galvaniz" SURFACE_TAGS üyesi',
      SURFACE_TAGS.has('siyah') && SURFACE_TAGS.has('galvaniz'),
      `SURFACE_TAGS=${JSON.stringify([...SURFACE_TAGS])}`);
  }
  {
    check('Ö8 "disli" ve "duz-uclu" CONNECTION_TAGS üyesi',
      CONNECTION_TAGS.has('disli') && CONNECTION_TAGS.has('duz-uclu'),
      `CONNECTION_TAGS=${JSON.stringify([...CONNECTION_TAGS])}`);
  }
  // Ö9: olcum araci CALISIYOR — normal girdide bos olmayan imza doner.
  {
    const s = imza('2" Siyah boru');
    check('Ö9 buildImza normal girdide boş olmayan dize döndürür',
      typeof s === 'string' && s.length > 0, `imza="${s}"`);
  }
  // Ö10: olcut KOR DEGIL — ayirt edebildigi bir eksen (olcu) var.
  //      Bu gecmezse asagidaki "farklı olmalı" assertleri anlamsizdir.
  {
    const a = imza('Küresel Vana DN25 Pirinç');
    const b = imza('Küresel Vana DN32 Pirinç');
    check('Ö10 ölçüt kör değil: DN25 ≠ DN32 farkını GÖRÜYOR',
      a !== b, `DN25="${a}" DN32="${b}"`);
  }

  // ═══════════════════════════════════════════════════════════════
  // A-R — KIRMIZI: AYRI OLMASI GEREKEN SORGULAR TEK ANAHTARA DUSUYOR
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── A-R: KIRMIZI KANIT (imza ekseni eksik) ──');

  // A-R1 · YUZEY EKSENI (1. aile)
  {
    const a = imza('2" Siyah boru');
    const b = imza('2" Galvanizli boru');
    check('A-R1 YÜZEY: "2\\" Siyah boru" ile "2\\" Galvanizli boru" AYRI imza üretmeli',
      a !== b, `ikisi de "${a}" — siyah/galvanizli tek hafıza kaydına düşüyor`);
  }

  // A-R2 · BAGLANTI EKSENI (2. aile — genellik icin bagimsiz ikinci eksen)
  {
    const a = imza('DN100 Dişli Manşonlu boru');
    const b = imza('DN100 Düz Uçlu boru');
    check('A-R2 BAĞLANTI: "DN100 Dişli Manşonlu boru" ile "DN100 Düz Uçlu boru" AYRI imza üretmeli',
      a !== b, `ikisi de "${a}" — dişli/düz uçlu tek hafıza kaydına düşüyor`);
  }

  // A-R3 · AKISKAN EKSENI (3. bagimsiz eksen)
  {
    const a = imza('2" Doğalgaz borusu');
    const b = imza('2" Siyah boru');
    check('A-R3 AKIŞKAN: "2\\" Doğalgaz borusu" ile "2\\" Siyah boru" AYRI imza üretmeli',
      a !== b, `ikisi de "${a}" — doğalgaz/siyah tek hafıza kaydına düşüyor`);
  }

  // ═══════════════════════════════════════════════════════════════
  // E-R — KIRMIZI: OLCUSU COZULEMEYEN SATIR DA IMZA URETIYOR
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── E-R: KIRMIZI KANIT (boş ölçüyle imza üretimi) ──');

  // Once bu vakanin GERCEKTEN olcusuz oldugunu kanitla (olcut kontrolu).
  {
    const t = generateTags('Siyah Dişli Manşonlu Boru').tags;
    check('E-Ö vaka gerçekten ölçüsüz: dn*/od-* etiketi YOK',
      !t.some((x: string) => x.startsWith('dn') || x.startsWith('od-')),
      `tags=${JSON.stringify(t)}`);
  }
  // E-R1: capi cozulemeyen HER boru satiri tek bir kayda duser — hafizayi
  //       en cok kirleten kalem. Olcu yoksa anahtar URETILMEMELI.
  {
    const s = imza('Siyah Dişli Manşonlu Boru');
    check('E-R1 ÖLÇÜ BOŞ ise imza ÜRETİLMEMELİ (null/boş dönmeli)',
      s === null || s === undefined || s === '',
      `imza="${s}" — ölçü alanı boş olduğu hâlde anahtar üretildi`);
  }

  // ═══════════════════════════════════════════════════════════════
  // C-R — KIRMIZI: ON-SECIM METNI KANITTAN GUCLU KONUSUYOR
  //   (uretim yolundan gecer: remember() × 54 → bulkMatch → reason)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── C-R: KIRMIZI KANIT (ön-seçim metni) ──');
  {
    const STEEL_LIB = [
      lib('Su ve Yangın Tesisat Borusu 1" DN25 - Siyah Dişli Manşonlu', 130),
      lib('Su ve Yangın Tesisat Borusu 1" DN25 - Galvanizli Dişli Manşonlu', 160),
    ];
    const s2: any = makeService('ÇAYIROVA', STEEL_LIB);
    const q = 'SPRİNK HATTI BORULARI DN 25';
    // ÖLÇÜT NOTU: hafiza, adayin GORUNEN adiyla (candidate.materialName)
    // eslesir — kutuphane satirinin ham adiyla DEGIL. Ham adi yazarsak
    // findIndex -1 doner, mesaj hic uretilmez ve C-R1 "yalanci yesil"
    // olurdu (ilk kosumda tam bunu olctuk). Bu yuzden secilen ad,
    // uretim akisinin kendisinden (FE'nin gonderdigi ad) alinir.
    const on = (await s2.bulkMatch({ userId: 'u1', firmaId: 'u1' }, BRAND, [q]))[q];
    const secilen = on?.candidates?.find((c: any) => /Siyah/.test(c.materialName))?.materialName ?? '';
    check('C-Ö0 ölçüm aracı: seçilebilir "Siyah" aday üretildi',
      secilen.length > 0, `adaylar=${JSON.stringify(on?.candidates?.map((c: any) => c.materialName))}`);
    // 54 kez "secildi" — teshisteki gercek sayaci birebir uretir.
    for (let i = 0; i < 54; i++) await s2.remember('u1', BRAND, q, secilen);
    const r = (await s2.bulkMatch({ userId: 'u1', firmaId: 'u1' }, BRAND, [q]))[q];
    const reason: string = r?.reason ?? '';
    console.log(`     [üretilen metin] "${reason}"`);

    // C-Ö: metin gercekten uretildi mi + sayac gercekten 54 mu (olcut kontrolu)
    check('C-Ö ön-seçim metni ÜRETİLDİ ve sayaç 54',
      reason.includes('(54×)'), `reason="${reason}" confidence=${r?.confidence}`);

    // C-R1a: onaylatici dil — kullaniciya "onayla" demek, sistemin kendi
    //        onerisini kullanici karariymis gibi mesrulastirir.
    check('C-R1a ön-seçim metni ONAYLATICI dil KULLANMAMALI ("onaylayın")',
      !/onayla/i.test(reason), `reason="${reason}"`);

    // C-R1b: 54 sayisi SATIRA degil ANAHTARA ait — ayni imzaya dusen TUM
    //        satirlarin toplami (ustelik ~53'u kendi onerisinin teyidi).
    //        Metin bunu ima etmeli.
    check('C-R1b metin sayının ANAHTARA (aynı soruya) ait olduğunu ima etmeli',
      /aynı soru|aynı belirsizlik|benzer satır|bu anahtar|aynı imza|aynı satır tipi/i.test(reason),
      `reason="${reason}" — sayı satıra aitmiş gibi okunuyor`);
  }

  // ═══════════════════════════════════════════════════════════════
  // L — ★ REGRESYON KILITLERI (bugun YESIL, duzeltmeden sonra da YESIL)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── L: ★ REGRESYON KİLİTLERİ (bugün yeşil, yeşil kalmalı) ──');

  // L1: buildKindImza KASITLI genis (olcu-bagimsiz cins tercihi) —
  //     duzeltme yuzey/baglanti eklerken BURAYA DOKUNMAMALI.
  //     Bugunku degerler 04.08.2026'da olculup donduruldu.
  const KIND_DONDURULMUS: Array<[string, string]> = [
    ['2" Siyah boru', 'kind|brand-1|boru|celik'],
    ['2" Galvanizli boru', 'kind|brand-1|boru|genel'],
    ['DN100 Dişli Manşonlu boru', 'kind|brand-1|boru|genel'],
    ['Küresel Vana DN25 Pirinç', 'kind|brand-1|vana|pirinc'],
    ['PPR-C Boru 32 mm PN20', 'kind|brand-1|boru|ppr'],
  ];
  for (const [ad, beklenen] of KIND_DONDURULMUS) {
    const got = kindImza(ad);
    check(`L1 ★ buildKindImza DEĞİŞMEDİ: "${ad}"`,
      got === beklenen, `beklenen="${beklenen}" bulunan="${got}"`);
  }

  // L2: DETERMINISTIKLIK — ayni sorgu iki kez, ayni imza.
  {
    const a = imza('2" Siyah boru');
    const b = imza('2" Siyah boru');
    check('L2a ★ buildImza deterministik (aynı sorgu → aynı imza)',
      a === b, `1."${a}" 2."${b}"`);
  }
  {
    const a = kindImza('Küresel Vana DN25 Pirinç');
    const b = kindImza('Küresel Vana DN25 Pirinç');
    check('L2b ★ buildKindImza deterministik (aynı sorgu → aynı imza)',
      a === b, `1."${a}" 2."${b}"`);
  }

  // L3: ASIRI DARALTMA YASAGI — yuzey/baglanti kelimesi ICERMEYEN iki
  //     farkli yazim hala AYNI anahtara dusmeli (hafiza tamamen olmesin).
  {
    const t1 = generateTags('2" boru').tags;
    const t2 = generateTags('DN50 boru').tags;
    const yuzeyVarMi = [...t1, ...t2].some((x: string) => SURFACE_TAGS.has(x) || CONNECTION_TAGS.has(x));
    check('L3-Ö vakalar gerçekten yüzey/bağlantı kelimesi İÇERMİYOR',
      !yuzeyVarMi, `t1=${JSON.stringify(t1)} t2=${JSON.stringify(t2)}`);
  }
  {
    const a = imza('2" boru');
    const b = imza('DN50 boru');
    check('L3 ★ yüzey/bağlantı içermeyen iki sorgu AYNI imzada kalmalı (aşırı daraltma yok)',
      a === b, `"${a}" vs "${b}"`);
  }

  // ── Ozet ────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(64)}`);
  console.log(`SONUC: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
    console.log('\n⚠ BU SUITE KIRMIZI-ONCE TURUNDA YAZILDI: yukaridaki FAIL\'ler');
    console.log('  BEKLENEN kanittir (duzeltme henuz YAPILMADI).');
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
