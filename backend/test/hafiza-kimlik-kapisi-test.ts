/**
 * KARAR (b) KILIDI — HAFIZA, KIMLIK KAPISI ACIKKEN OTOMATIK YAZMAZ
 *   npx ts-node test/hafiza-kimlik-kapisi-test.ts   (npm run test:hafiza-kimlik-kapisi)
 *
 * ── KARAR (Emre 30.09) ────────────────────────────────────────────────────
 * "K2: Hafiza (onceden onaylanmis eslesme) bir guvenlik kapisi tetiklenince
 * (capsiz dusus, aile zayif, aile uyusmazligi, ad gevsetildi…) OTOMATIK
 * YAZMAZ, onaya duser. … 27.08'deki 373.825 TL makine vakasi."
 *
 * ── OLCULEN KUSUR ─────────────────────────────────────────────────────────
 * Hafiza otoyazisi (matching.service.hafizaOnSecim) motorun `kapilar`
 * listesini GOREMIYORDU: outcome-mapper yalniz uc kapiyi boolean'a ceviriyordu
 * (yuzeyGenisletildi · capCevrilemedi · dnKoprusu). Kullanici bir kez onay
 * verince sonraki kosumda kapinin uyarisi SILINIP fiyat 'high' yaziliyordu:
 *   "YİV AÇMA MAKİNESİ DN 80" (ailesi yalniz kategoriden, capsiz)
 *       → onay sonrasi 373.825 TL high, "Aynı soruda kayıtlı seçim"
 * types.ts bunu "DESEN BORCU" diye kaydetmisti: "dogru cozum kapilarin
 * TOPLUCA tasinmasidir; kapsami ayri olcum turu ister".
 *
 * ── KURAL ─────────────────────────────────────────────────────────────────
 * `MatchResult.kapilar` motorun listesini TOPLUCA tasir. Hafiza otoyazisi
 * `HAFIZA_OTOYAZ_ENGELI` kumesindeki — adayin KIMLIGINE dokunan ("bu urun O
 * urun mu?") — bir kapi aciksa YAZMAZ; secim on-secili kalir, onay istenir.
 *   ENGELLER : capsiz-dusum · aile-zayif · aile-uyusmazligi · ad-gevsetildi
 *              (karar metni) · yuzey-genisletildi · cap-cevrilemedi ·
 *              dn-koprusu (27.08'den beri engelliydi) · cap-belirsiz (A2 —
 *              cap-cevrilemedi ile ayni tur: olcu dogrulanmadi)
 *   ENGELLEMEZ (ek nitelik; gecmis onay kapsar — `guclutekAday`in ayrimi):
 *              bilinmeyen-kelime (akiskan haric, o ayrica engelli) ·
 *              malzeme / taban / birim / yuzey celiskisi · aile-yok
 * ⚠ aile-yok BILEREK engellemez — OLCULDU: Pimtas derleminde tek adayli 123
 * sorunun 122'si aile-yok ("HDPE Plaka (Siyah) 10 mm" gibi kendi adiyla
 * bulunan urunler). Engellense hafiza otoyazisi pratikte kapanirdi; karar
 * metninde yok. Pimtas'ta ENGELLER kumesindeki kapilarin hicbiri tek adayli
 * soruda atesmiyor — etki 0 satir; kanit bu dosyanin karisik havuzlarinda.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, aileUyusmazligiTeshisi, HAFIZA_OTOYAZ_ENGELI } from '../src/ozellik/eslestirme/matching/index/query-engine';
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

let n = 0;
const kutuphane = (c: ProductColumns) => {
  const idx = buildProductIndex(c);
  n++;
  return {
    id: `lib-${n}`, materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: `pi-${n}`,
    product: { ...idx, id: `pi-${n}`, ad: c.ad, cins: c.cins ?? null, baglanti: c.baglanti ?? null,
      capRaw: c.cap ?? null, kategori: c.kategori ?? null, boyMm: null, urunKodu: null,
      sheetName: c.sheetName ?? null, price: c.price, birim: (c as any).birim ?? null },
  };
};
const motor = (c: ProductColumns) => { const l: any = kutuphane(c); return { ...l, urun: l.product }; };

/** Uretim yolu: bulkMatch → remember → bulkMatch; hafiza BELLEKTE (olcu-anahtari testinin deseni). */
function servis(havuz: ProductColumns[]) {
  const satirlar = havuz.map(kutuphane);
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
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true,
      alias: s.alias, canonical: s.canonical, kinds: s.kinds, impliedType: s.impliedType, sizeClass: s.sizeClass, stripTags: s.stripTags })) },
  };
  const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'f', date: '' }) } as any;
  const s: any = new MatchingService(prisma, new TerminologyService(prisma), fx);
  const sor = async (q: string) => (await s.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', [q]))[q];
  return { s, sor, hafiza };
}
const ozet = (r: any) => `${r?.confidence} net=${r?.netPrice} hafizaOtoyaz=${r?.hafizaOtoyaz} kapilar=${JSON.stringify(r?.kapilar)} aday=${r?.candidates?.length} "${(r?.reason ?? '').slice(0, 90)}"`;

/** Bir kez onaylanan tek adayli soru yeniden soruldugunda ne olur? */
async function onayVeYenidenSor(havuz: ProductColumns[], q: string) {
  const { s, sor } = servis(havuz);
  const once = await sor(q);
  if ((once?.candidates?.length ?? 0) === 1) await s.remember('u1', 'b1', q, once.candidates[0].materialName);
  const sonra = await sor(q);
  return { once, sonra };
}
const KAYITLI = /Aynı soruda kayıtlı seçim/;

// ── FIKSTURLER (mevcut kilitlerden: s45 C1/C2, aile-uyusmazligi A1, cap-belirsizligi F1) ──
const YIV: ProductColumns = { kategori: 'Boru Hattı Ekipmanları', ad: 'Yiv açma makinesi', price: 373825, sheetName: 'S2' } as any;
const SIYAH_DN80: ProductColumns = { kategori: 'Tesisat Boruları', ad: 'Siyah çelik boru', cins: 'siyah', cap: 'DN80', price: 800, sheetName: 'S3' } as any;
const SIYAH_CAPSIZ: ProductColumns = { kategori: 'Tesisat Boruları', ad: 'Siyah çelik boru', cins: 'siyah', price: 800, sheetName: 'S3' } as any;
const KELEBEK: ProductColumns = { kategori: 'Kelebek Vanalar', ad: 'Kelebek vana', cins: 'pirinç', cap: 'DN50', price: 1500, sheetName: 'S3' } as any;
const CEKVALF: ProductColumns = { kategori: 'Çek Vanalar', ad: 'Çekvalf BC-100', cins: 'swing', cap: 'DN50', price: 2222, sheetName: 'S3' } as any;
const KELEPCE: ProductColumns = { kategori: 'Kelepçeler', ad: 'Sprinkler Kelepçe', cins: 'lastikli', cap: '6"', price: 51.7, birim: 'Ad.', sheetName: 'NORM' } as any;
const KOR_FLANS_34: ProductColumns = { ad: 'Kör Flanş', cap: '3/4"', price: 70 } as any;
const SIYAH_2: ProductColumns = { ad: 'Çelik Boru', cins: 'siyah', cap: '2"', price: 300, urunKodu: 'S-2' } as any;
const GALV_1: ProductColumns = { ad: 'Çelik Boru', cins: 'galvaniz', cap: '1"', price: 200, urunKodu: 'G-1' } as any;
const PLAKA: ProductColumns = { ad: 'HDPE Plaka (Siyah)', cap: '10 mm', price: 95 } as any;
const KURESEL: ProductColumns = { ad: 'Küresel Vana', cins: 'Pirinç', cap: '20 mm', price: 88 } as any;
const PP_ATIK: ProductColumns = { ad: 'PP Atık Su Borusu', cins: 'SN4', cap: '25 mm', price: 15 } as any;

const ENGELLEYEN: Array<[string, ProductColumns[], string, string[]]> = [
  ['★ 373.825 TL makine vakasi (aile zayif + capsiz)', [YIV, SIYAH_DN80], 'YİV AÇMA MAKİNESİ DN 80', ['aile-zayif', 'capsiz-dusum']],
  ['capsiz dusus (guclu aile)', [SIYAH_CAPSIZ], 'SİYAH ÇELİK BORU DN 80', ['capsiz-dusum']],
  ['ad gevsetildi', [KELEBEK, CEKVALF], 'KELEBEK SWING VANA DN 50', ['ad-gevsetildi']],
  ['aile uyusmazligi', [KELEPCE], 'Sprinkler Boru Bağlantı Aparatı, 6"', ['aile-uyusmazligi']],
  ['cap belirsiz (A2)', [KOR_FLANS_34], 'Kör Flanş 1"', ['cap-belirsiz']],
  // 27.08'den beri boolean'la engelliydi; hafiza DAVRANISINI suren test yoktu
  // (yuzey-genisletme-test yalniz bayragi okuyordu) — listeye tasininca kilit.
  ['yuzey genisletildi (K4)', [SIYAH_2, GALV_1], '2" Galvaniz Çelik Boru', ['yuzey-genisletildi']],
];
const ENGELLEMEYEN: Array<[string, ProductColumns[], string, string]> = [
  ['aile-yok (kendi adiyla bulunan urun — Pimtas 122/123)', [PLAKA], 'HDPE Plaka (Siyah) 10 mm', 'aile-yok'],
  ['bilinmeyen kelime (akiskan degil)', [KURESEL], 'SARI KOLLU KÜRESEL VANA 20 mm', 'bilinmeyen-kelime'],
  ['malzeme celiskisi', [PP_ATIK], 'PPR BORU 25 mm', 'malzeme-celiskisi'],
];

async function main() {
  // ── O: OLCUT ────────────────────────────────────────────────────────────
  check('O engel kumesi karar metnindeki dort kapiyi tasiyor',
    ['capsiz-dusum', 'aile-zayif', 'aile-uyusmazligi', 'ad-gevsetildi'].every((k) => ((HAFIZA_OTOYAZ_ENGELI ?? []) as readonly string[]).includes(k)),
    JSON.stringify(HAFIZA_OTOYAZ_ENGELI));
  check('O engel kumesi aile-yok\'u TASIMIYOR (olculen etki: Pimtas 122/123)',
    Array.isArray(HAFIZA_OTOYAZ_ENGELI) && !(HAFIZA_OTOYAZ_ENGELI as readonly string[]).includes('aile-yok'));
  // Motor duzeyi fikstur kaniti: her vakada beklenen kapi GERCEKTEN atesliyor
  for (const [ad, havuz, q, kapilar] of ENGELLEYEN) {
    const ham = runQuery(parseLine(q), havuz.map(motor) as any);
    const o: any = kapilar.includes('aile-uyusmazligi') ? aileUyusmazligiTeshisi(parseLine(q), havuz.map(motor) as any, undefined, ham) : ham;
    check(`O fixture ${ad}: motor tek aday + ${kapilar.join('+')}`,
      o.kind === 'ask' && o.rows.length === 1 && kapilar.every((k) => (o.kapilar ?? []).includes(k)),
      `${o.kind} rows=${o.rows?.length} kapilar=${JSON.stringify(o.kapilar)}`);
  }

  // ── H: KIMLIK KAPISI ACIKKEN HAFIZA YAZMAZ ──────────────────────────────
  for (const [ad, havuz, q, kapilar] of ENGELLEYEN) {
    const { once, sonra } = await onayVeYenidenSor(havuz, q);
    check(`H ${ad}: onay ONCESI tek aday, fiyat yok`, once?.candidates?.length === 1 && once?.netPrice === 0, ozet(once));
    check(`H ${ad}: MatchResult kapilari tasiyor (${kapilar.join('+')})`,
      kapilar.every((k) => (once?.kapilar ?? []).includes(k)), ozet(once));
    check(`★ H ${ad}: onaydan SONRA da otomatik YAZILMAZ`,
      sonra?.netPrice === 0 && sonra?.confidence !== 'high' && !sonra?.hafizaOtoyaz, ozet(sonra));
    // Hafiza yolu gercekten suruldu: kayit bulundu, secim ONDE (on-secim dali)
    check(`H ${ad}: hafiza kaydi bulundu ve secim on-secili`,
      KAYITLI.test(sonra?.reason ?? '') && sonra?.candidates?.[0]?.preferred === true, ozet(sonra));
  }

  // ── K: KARSI ORNEKLER — ek nitelik kapilarinda hafiza YAZAR ─────────────
  for (const [ad, havuz, q, kapi] of ENGELLEMEYEN) {
    const { once, sonra } = await onayVeYenidenSor(havuz, q);
    check(`K ${ad}: fixture tek aday + ${kapi}`,
      once?.candidates?.length === 1 && (once?.kapilar ?? []).includes(kapi), ozet(once));
    check(`★ K ${ad}: onaydan sonra hafiza OTOMATIK YAZAR`,
      sonra?.hafizaOtoyaz === true && sonra?.confidence === 'high' && sonra?.netPrice > 0, ozet(sonra));
  }

  console.log(`\n${'='.repeat(60)}\nKARAR (b) HAFIZA KIMLIK KAPISI: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
