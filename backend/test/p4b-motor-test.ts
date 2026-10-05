/**
 * P4B MOTOR (05.10.2026, P4b Parti 1) — `npm run test:p4b-motor`, DB/AG GEREKTIRMEZ.
 *
 * T · ALIAS YUKLEME HATASI (C9): `loadAliases` HER hatayi sessizce [] donuyordu
 *     — alias ipuclari dusuyor (pis su PP elemesi, "temiz su → PPR"),
 *     eslestirme hatasiz ama YANLIS sonuc veriyordu. Artik yalniz P2021
 *     (tablo yok) → [] + surec basina bir WARN; diger hata FIRLAR ve toplu
 *     eslestirme sessiz yanlis sonuc yerine hata verir.
 * P · PROTOTIP ADLI SATIR (P4 notu 2'nin YAZMA yani, `ac36c96` okuma yanini
 *     kapatti): sonuc nesnesi duz `{}` idi; "__proto__" adli satirin sonucu
 *     prototipi degistirip yanittan SESSIZCE dusuyordu. Malzeme + iscilik,
 *     dolu + bos kutuphane (dort yazim yeri).
 *
 * C · OZEL FIYAT KENDI BIRIMINDE (C3, P4b Parti 2b): kutuphane 2a'dan beri
 *     ozel fiyatin birimini (`customPriceCurrency`) yazar; motor satirin tek
 *     `currency`sini (LISTE birimi) okuyordu — aktarim liste birimini
 *     degistirince teklif ozel fiyati yanlis birimde cevirirdi. Taban, kur,
 *     cevrilebilirlik, kaynak fiyat ve oneri ayni yardimcidan (`fiyatTabani`);
 *     cevirici iki birimi gorur; liste gosterimi NaN sizdirmaz.
 * K · FIRMANIN AD DUZELTMESI (C7, P4b Parti 2b): `kullaniciAdi` aday alanlarini
 *     o firma icin kurar (sahipli yeniden adlandirmayla ayni kural), sonuc
 *     etiketi onu gosterir; baska firma ayni indeksi kendi adiyla gorur;
 *     indekssiz satirda yeniden aktarimin sifirladigi materialName'in onune gecer.
 *
 * Gercek MatchingService + TerminologyService, sahte Prisma (`p4-motor-notlari`
 * deseni).
 */
import { buildProductIndex, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
import { performance } from 'node:perf_hooks';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ALIAS_SATIRLARI = ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true,
  alias: s.alias, canonical: s.canonical, kinds: s.kinds, impliedType: s.impliedType, sizeClass: s.sizeClass, stripTags: s.stripTags }));

let n = 0;
function kutuphane(c: ProductColumns) {
  const idx = buildProductIndex(c);
  n++;
  return {
    id: `lib-${n}`, materialId: null, material: null, materialName: idx.displayName,
    listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY', productIndexId: `pi-${n}`,
    brand: { id: 'b1', name: 'B1' },
    product: { ...idx, id: `pi-${n}`, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null,
      kategori: c.kategori ?? null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null },
  };
}
function iscilikKalemi(id: string, ad: string, cap: string) {
  return {
    id, unitPrice: 100, discountRate: 0, currency: 'TRY', unit: 'adet', firma: { id: 'fA', name: 'FA' },
    laborItem: { id: `li-${id}`, name: ad, unitPrice: 100, unit: 'adet', category: null, cins: null, baglanti: null,
      capRaw: cap, boyMm: null, not: null, adSlug: null, adBucket: null, adTokens: [], cinsNorm: null, cinsTokens: [],
      baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown', capTags: [], capNorm: null, malzemeler: [],
      aileZayif: false, boyTag: null, displayName: ad, belirsiz: false, indexVersion: INDEX_VERSION - 1 },
  };
}

type AliasDavranisi = { hata?: unknown };
function prismaKur(kendi: any[], iscilik: any[] = [], alias: AliasDavranisi = {}) {
  const sayac = { aliasOkuma: 0 };
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : kendi) },
    laborPrice: { findMany: async (a: any) => (a?.where?.firma?.id && typeof a.where.firma.id === 'object' ? [] : iscilik) },
    brand: { findUnique: async () => ({ name: 'TEST' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: {
      findMany: async () => {
        sayac.aliasOkuma++;
        if (alias.hata !== undefined) throw alias.hata;
        return ALIAS_SATIRLARI;
      },
    },
  };
  return { prisma, sayac };
}
const KUR = { usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'tcmb', date: '2026-10-02', fetchedAt: '' };
function servis(kendi: any[], iscilik: any[] = [], alias: AliasDavranisi = {}) {
  const { prisma, sayac } = prismaKur(kendi, iscilik, alias);
  const terminoloji = new TerminologyService(prisma);
  const svc = new MatchingService(prisma, terminoloji, { getRates: async () => KUR } as any) as any;
  return { svc, terminoloji, sayac };
}
const K = { userId: 'u1', firmaId: 'u1' };

/** console.warn/log/error yakalar (yalniz bu cagri boyunca). */
async function sessiz<T>(fn: () => Promise<T>): Promise<{ uyarilar: string[]; sonuc?: T; hata?: unknown }> {
  const uyarilar: string[] = [];
  const asil = { log: console.log, warn: console.warn, error: console.error };
  console.warn = (...a: unknown[]) => { uyarilar.push(a.map(String).join(' ')); };
  console.log = () => undefined; console.error = () => undefined;
  try { return { uyarilar, sonuc: await fn() }; } catch (hata) { return { uyarilar, hata }; } finally { Object.assign(console, asil); }
}
const kendiAnahtari = (o: unknown, k: string) => o != null && Object.prototype.hasOwnProperty.call(o, k);

async function main() {
  const P2021 = Object.assign(new Error('The table `public.TerminologyAlias` does not exist in the current database.'), { code: 'P2021' });
  const BAGLANTI = Object.assign(new Error("Can't reach database server"), { code: 'P1001' });

  // ══ T · ALIAS YUKLEME HATASI (C9) ═════════════════════════════════════
  console.log('\n── T · alias yukleme hatasi (C9) ──');
  {
    const { terminoloji, sayac } = servis([], [], { hata: P2021 });
    const a = await sessiz(() => terminoloji.loadAliases('u1'));
    const b = await sessiz(() => terminoloji.loadAliases('u1'));
    check('T-FIXTURE alias tablosu iki kez OKUNDU (hata dali kostu)', sayac.aliasOkuma === 2, `okuma=${sayac.aliasOkuma}`);
    check('T1 P2021 (tablo yok) → bos liste, hata yok', Array.isArray(a.sonuc) && a.sonuc.length === 0 && !a.hata
      && Array.isArray(b.sonuc) && b.sonuc.length === 0 && !b.hata, String((a.hata as Error)?.message ?? ''));
    check('T2 P2021 uyarisi surec basina BIR kez (her istekte ayni satir yok)',
      a.uyarilar.filter((u) => u.includes('P2021')).length === 1 && b.uyarilar.length === 0,
      `ilk=${JSON.stringify(a.uyarilar)} ikinci=${JSON.stringify(b.uyarilar)}`);
  }
  {
    const { terminoloji } = servis([], [], { hata: BAGLANTI });
    const r = await sessiz(() => terminoloji.loadAliases('u1'));
    check('T3 ★ diger hata (baglanti) FIRLAR — sessiz bos liste DEGIL', r.hata === BAGLANTI, `sonuc=${JSON.stringify(r.sonuc)} hata=${String(r.hata)}`);
    check('T4 diger hata gunluge yazilir (yutulmaz)', r.uyarilar.some((u) => u.includes("Can't reach database server")), JSON.stringify(r.uyarilar));
  }
  {
    const { terminoloji } = servis([]);
    const r = await sessiz(() => terminoloji.loadAliases('u1'));
    const s = r.sonuc ?? [];
    const sirali = s.every((x, i) => i === 0 || s[i - 1].alias.length >= x.alias.length);
    check('T5 basari yolu degismedi: tum aktif alias, en uzun once', s.length === ALIAS_SATIRLARI.length && s.length > 0 && sirali && !r.hata,
      `uzunluk=${s.length}/${ALIAS_SATIRLARI.length} sirali=${sirali}`);
  }
  // BAGLANTI: toplu eslestirme alias hatasini YUTMAZ
  {
    const boru = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '1"', price: 100 } as any);
    const hatali = await sessiz(() => servis([boru], [], { hata: BAGLANTI }).svc.bulkMatch(K, 'b1', ['ÇELİK BORU 1"']));
    check('T6 ★ alias okunamazsa (baglanti) toplu eslestirme HATA verir — ipucusuz yanlis sonuc DONMEZ',
      hatali.hata === BAGLANTI && hatali.sonuc === undefined, `sonuc=${JSON.stringify(hatali.sonuc)?.slice(0, 120)}`);
    const tabloYok = await sessiz(() => servis([boru], [], { hata: P2021 }).svc.bulkMatch(K, 'b1', ['ÇELİK BORU 1"']));
    check('T7 tablo yoksa (P2021) eslestirme surer: satir eslesir',
      !tabloYok.hata && (tabloYok.sonuc as any)?.['ÇELİK BORU 1"']?.netPrice === 100,
      `hata=${String(tabloYok.hata)} sonuc=${JSON.stringify((tabloYok.sonuc as any)?.['ÇELİK BORU 1"'])?.slice(0, 120)}`);
  }

  // ══ P · PROTOTIP ADLI SATIR YANITTA KALIR ═════════════════════════════
  console.log('\n── P · "__proto__" adli satir yanitta kalir ──');
  const PROTO = '__proto__';
  {
    const boru = kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '1"', price: 100 } as any);
    const r = (await sessiz(() => servis([boru]).svc.bulkMatch(K, 'b1', [PROTO, 'ÇELİK BORU 1"']))).sonuc as any;
    check('P-FIXTURE dolu kutuphane: obur satir eslesti (motor koştu)', r?.['ÇELİK BORU 1"']?.netPrice === 100, JSON.stringify(r?.['ÇELİK BORU 1"'])?.slice(0, 120));
    check('P1 ★ malzeme, dolu kutuphane: "__proto__" satirinin sonucu KENDI anahtariyla yanitta',
      kendiAnahtari(r, PROTO) && typeof r[PROTO]?.confidence === 'string', `anahtarlar=${JSON.stringify(Object.keys(r ?? {}))}`);
    check('P2 yanit JSON\'unda "__proto__" anahtari var (istemciye gider)', JSON.stringify(r).includes(`"${PROTO}":{`), JSON.stringify(r).slice(0, 160));
  }
  {
    const r = (await sessiz(() => servis([]).svc.bulkMatch(K, 'b1', [PROTO, 'ÇELİK BORU 1"']))).sonuc as any;
    check('P3 malzeme, bos kutuphane: "__proto__" satiri "kutuphanede yok" nedeniyle yanitta',
      kendiAnahtari(r, PROTO) && r[PROTO]?.confidence === 'none' && kendiAnahtari(r, 'ÇELİK BORU 1"'), `anahtarlar=${JSON.stringify(Object.keys(r ?? {}))}`);
  }
  {
    const r = (await sessiz(() => servis([], []).svc.bulkMatchLabor(K, 'fA', [PROTO, 'KÜRESEL VANA 1"']))).sonuc as any;
    check('P4 iscilik, bos liste: "__proto__" satiri yanitta', kendiAnahtari(r, PROTO) && r[PROTO]?.confidence === 'none',
      `anahtarlar=${JSON.stringify(Object.keys(r ?? {}))}`);
  }
  {
    const kalem = iscilikKalemi('lp1', 'Küresel Vana Montajı', '1"');
    const r = (await sessiz(() => servis([], [kalem]).svc.bulkMatchLabor(K, 'fA', [PROTO, 'KÜRESEL VANA MONTAJI 1"']))).sonuc as any;
    check('P5 iscilik, dolu liste: "__proto__" satiri yanitta (motor kostu: obur satir da yanitta)',
      kendiAnahtari(r, PROTO) && kendiAnahtari(r, 'KÜRESEL VANA MONTAJI 1"'), `anahtarlar=${JSON.stringify(Object.keys(r ?? {}))}`);
  }

  await c3Blogu();
  await c7Blogu();

  console.log(`\n${'='.repeat(60)}\nP4B MOTOR: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

// ══ P4b PARTİ 2b — motor yeni kütüphane alanlarını okur ══════════════════
const js = (x: unknown) => JSON.stringify(x);

/** Kendi marka + (öneri için) diğer marka satırları; kur çağrısı sayılır. */
function dunya2b(kendi: any[], diger: any[] = [], kur: unknown = KUR) {
  const sayac = { kur: 0 };
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? diger : kendi) },
    laborPrice: { findMany: async () => [] },
    brand: { findUnique: async () => ({ name: 'TEST' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: { findMany: async () => ALIAS_SATIRLARI },
  };
  const svc = new MatchingService(prisma, new TerminologyService(prisma),
    { getRates: async () => { sayac.kur++; return kur; } } as any) as any;
  return { svc, sayac };
}
const esle = async (svc: any, satirlar: string[]) => (await sessiz(() => svc.bulkMatch(K, 'b1', satirlar))).sonuc as any;
const BORU = 'ÇELİK BORU 1"';
const VANA = 'KELEBEK VANA 1"';
const boruSatiri = (ek: Record<string, unknown> = {}) =>
  ({ ...kutuphane({ ad: 'Çelik Boru', cins: 'siyah', cap: '1"', price: 100 } as any), ...ek });

// ══ C · ÖZEL FİYAT KENDİ BİRİMİNDE (C3 motor) ════════════════════════════
// Kütüphane 2a'dan beri özel fiyatın birimini (`customPriceCurrency`) yazıyor;
// motor hâlâ satırın tek `currency`sini (LİSTE birimi) okuyordu: aktarım liste
// birimini değiştirince ekran "₺120" gösterir, teklif 120 € × kur yazardı.
async function c3Blogu(): Promise<void> {
  console.log('\n── C · özel fiyat kendi biriminde (C3 motor) ──');
  {
    const { svc, sayac } = dunya2b([boruSatiri({ listPrice: 100, currency: 'TRY', customPrice: 2, customPriceCurrency: 'USD' })]);
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C1 ⭐ liste TRY 100, özel fiyat 2 USD → teklife 2 × 40 = 80 TL (2 TL değil)', r?.netPrice === 80, js(r)?.slice(0, 240));
    check('C1b kaynak fiyat tabanın biriminde (USD 2, liste yerine taban), kur USD 40 dondurulur',
      r?.kaynakFiyat?.currency === 'USD' && r?.kaynakFiyat?.net === 2 && r?.kaynakFiyat?.list === 2 &&
        r?.kaynakKur?.currency === 'USD' && r?.kaynakKur?.kur === 40, js({ kf: r?.kaynakFiyat, kk: r?.kaynakKur }));
    check('C1c ⭐ çevirici özel fiyatın birimini görür: liste TRY iken de kur ÇEKİLDİ (yoksa sahte "kur alınamadı")',
      sayac.kur === 1 && !r?.kurAlinamadi, `getRates=${sayac.kur} kurAlinamadi=${r?.kurAlinamadi}`);
    check('C1d liste fiyatı gösterimi liste biriminde (100 TL)', r?.listPrice === 100, js(r?.listPrice));
  }
  {
    const { svc } = dunya2b([boruSatiri({ listPrice: 3, currency: 'USD', customPrice: 50, customPriceCurrency: 'TRY' })]);
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C2 ⭐ liste USD 3, özel fiyat 50 TRY → teklife 50 TL (50 × 40 değil), kur dondurulmaz',
      r?.netPrice === 50 && r?.kaynakFiyat?.currency === 'TRY' && r?.kaynakFiyat?.net === 50 && r?.kaynakKur === undefined,
      js(r)?.slice(0, 240));
    check('C2b liste gösterimi liste biriminden: 3 USD × 40 = 120 TL', r?.listPrice === 120, js(r?.listPrice));
  }
  {
    const { svc, sayac } = dunya2b([boruSatiri({ listPrice: 100, currency: 'TRY', customPrice: 0, customPriceCurrency: 'USD' })]);
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C3 özel fiyat 0 → taban liste VE birim liste (100 TL; 100 × 40 değil)',
      r?.netPrice === 100 && r?.kaynakFiyat?.currency === 'TRY', js(r)?.slice(0, 200));
    check('C3b taban olmayan birim için kur ÇEKİLMEZ (özel fiyat 0: yalnız TRY)', sayac.kur === 0, `getRates=${sayac.kur}`);
  }
  {
    // Karışık birim + iskonto: C6 sırası TABANIN biriminde (döviz 2 hane yukarı, sonra çevrim)
    const { svc } = dunya2b([boruSatiri({ listPrice: 100, currency: 'TRY', customPrice: 1.234, customPriceCurrency: 'USD', discountRate: 10 })]);
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C11 ⭐ özel 1,234 $ −%10 → kaynak 1,12 $ (2 hane, USD kuralı) → 44,8 TL (TRY kuralıyla 48 TL OLMAZ)',
      r?.netPrice === 44.8 && r?.kaynakFiyat?.net === 1.12 && r?.kaynakFiyat?.currency === 'USD', js(r)?.slice(0, 240));
  }
  {
    // Ters yön: liste çevrilebilir (TRY), taban (USD) çevrilemez → KUR-01, NaN yok
    const { svc } = dunya2b([boruSatiri({ listPrice: 100, currency: 'TRY', customPrice: 2, customPriceCurrency: 'USD' })], [],
      { ...KUR, source: 'fallback' });
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C12 ⭐ taban USD ve kuru yok → "kur alınamadı (USD)", fiyat 0 (NaN/1:1 değil)',
      r?.netPrice === 0 && r?.kurAlinamadi === true && /\(USD\)/.test(r?.reason ?? ''), js(r)?.slice(0, 240));
  }
  {
    const { svc } = dunya2b([boruSatiri({ listPrice: 3, currency: 'USD', customPrice: 2, customPriceCurrency: null })]);
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C4 KORUMA: birim alanı boş (göç öncesi/yedekten dönen satır) → liste birimi: 2 USD → 80 TL, kaynak listesi 3',
      r?.netPrice === 80 && r?.kaynakFiyat?.currency === 'USD' && r?.kaynakFiyat?.list === 3, js(r)?.slice(0, 200));
  }
  {
    const vana = kutuphane({ ad: 'Kelebek Vana', cap: 'DN50', price: 10 } as any);
    const diger = { ...boruSatiri({ listPrice: 100, currency: 'TRY', customPrice: 2, customPriceCurrency: 'USD' }),
      brandId: 'b2', brand: { id: 'b2', name: 'B2' } };
    const { svc } = dunya2b([vana], [diger]);
    const r = (await esle(svc, [BORU]))?.[BORU];
    const alt = r?.alternatives?.[0];
    check('C5-FIXTURE kendi markada yok → başka marka önerisi geldi', r?.confidence === 'none' && !!alt, js(r)?.slice(0, 240));
    check('C5 ⭐ öneri de tabanın biriminden: 80 TL, kaynak USD 2, kur USD; liste gösterimi 100 TL',
      alt?.netPrice === 80 && alt?.kaynakFiyat?.currency === 'USD' && alt?.kaynakKur?.currency === 'USD' && alt?.listPrice === 100,
      js(alt)?.slice(0, 240));
  }
  {
    // Öneri yolunun KAPISI ve liste gösterimi: kur yokken TRY tabanlı öneri düşmemeli, liste NaN olmamalı
    const vana = kutuphane({ ad: 'Kelebek Vana', cap: 'DN50', price: 10 } as any);
    const diger = { ...boruSatiri({ listPrice: 3, currency: 'USD', customPrice: 50, customPriceCurrency: 'TRY' }),
      brandId: 'b2', brand: { id: 'b2', name: 'B2' } };
    const { svc } = dunya2b([vana], [diger], { ...KUR, source: 'fallback' });
    const alt = (await esle(svc, [BORU]))?.[BORU]?.alternatives?.[0];
    check('C5b öneri kapısı tabanın biriminde: kur yokken de TRY tabanlı öneri sunulur (50 TL), liste gösterimi NaN değil',
      alt?.netPrice === 50 && alt?.listPrice === 50 && alt?.kaynakFiyat?.currency === 'TRY', js(alt)?.slice(0, 240));
  }
  {
    const { svc } = dunya2b([boruSatiri({ listPrice: 3, currency: 'USD', customPrice: 50, customPriceCurrency: 'TRY' })], [],
      { ...KUR, source: 'fallback' });
    const r = (await esle(svc, [BORU]))?.[BORU];
    check('C6 liste biriminin kuru YOKKEN taban (50 TRY) yine yazılır; liste gösterimi NaN değil (tabana düşer)',
      r?.netPrice === 50 && !r?.kurAlinamadi && r?.listPrice === 50, js(r)?.slice(0, 240));
  }
}

// ══ K · FİRMANIN AD DÜZELTMESİ MOTORDA (C7 motor) ════════════════════════
// Kütüphane 2a'dan beri sahipli OLMAYAN satırda firmanın adını `kullaniciAdi`
// alanına yazıyor (aktarım ezmez); motor hâlâ indeksin (havuzun) adını okuyordu.
async function c7Blogu(): Promise<void> {
  console.log('\n── K · firmanın ad düzeltmesi motorda (C7 motor) ──');
  {
    const { svc } = dunya2b([boruSatiri({ kullaniciAdi: 'Kelebek Vana' })]);
    const r = await esle(svc, [VANA, BORU]);
    check('K1 ⭐ düzeltilmiş ad motorda: "KELEBEK VANA 1"" bu ürünle eşleşir (100 TL)', r?.[VANA]?.netPrice === 100, js(r?.[VANA])?.slice(0, 200));
    check('K1b sonuç etiketi firmanın adı ("Kelebek Vana …")', String(r?.[VANA]?.matchedName ?? '').startsWith('Kelebek Vana'), js(r?.[VANA]?.matchedName));
    check('K1c havuz adıyla artık eşleşmez (bu firmada ürünün adı düzeltildi)', !(r?.[BORU]?.netPrice > 0), js(r?.[BORU])?.slice(0, 160));
  }
  {
    const { svc } = dunya2b([boruSatiri()]);
    const r = await esle(svc, [VANA, BORU]);
    check('K2 ⭐ başka firma (düzeltmesiz, aynı indeks) havuz adıyla eşleşir, düzeltilmiş adla eşleşmez',
      r?.[BORU]?.netPrice === 100 && !(r?.[VANA]?.netPrice > 0), js({ boru: r?.[BORU]?.netPrice, vana: r?.[VANA]?.netPrice }));
  }
  {
    const indekssiz = { id: 'lib-indekssiz', materialId: null, material: null, productIndexId: null, product: null,
      materialName: 'Çelik Boru', cap: '1"', cins: 'siyah', listPrice: 100, customPrice: null, discountRate: 0, currency: 'TRY',
      kullaniciAdi: 'Kelebek Vana', brand: { id: 'b1', name: 'B1' } };
    const { svc } = dunya2b([indekssiz]);
    const r = await esle(svc, [VANA]);
    check('K3 ⭐ indekssiz satırda motor kullaniciAdi\'nı okur (yeniden aktarımın sıfırladığı materialName değil)',
      r?.[VANA]?.netPrice === 100, js(r?.[VANA])?.slice(0, 200));
  }
  {
    // Eski yol (MaterialPrice) satırı: aktarım her zaman materialId + material taşır — düzeltme yine önce
    const eskiYol = { id: 'lib-eskiyol', materialId: 'm1', material: { name: 'Çelik Boru' }, productIndexId: null, product: null,
      materialName: 'Çelik Boru', cap: '1"', cins: 'siyah', listPrice: 100, customPrice: null, discountRate: 0, currency: 'TRY',
      kullaniciAdi: 'Kelebek Vana', brand: { id: 'b1', name: 'B1' } };
    const { svc } = dunya2b([eskiYol]);
    const r = await esle(svc, [VANA, BORU]);
    check('K3b eski yol satırında düzeltme material.name\'den ÖNCE: düzeltilmiş adla eşleşir, katalog adıyla eşleşmez',
      r?.[VANA]?.netPrice === 100 && !(r?.[BORU]?.netPrice > 0), js({ vana: r?.[VANA]?.netPrice, boru: r?.[BORU]?.netPrice }));
  }
  {
    const bayat = boruSatiri({ kullaniciAdi: 'Kelebek Vana' });
    bayat.product = { ...bayat.product, indexVersion: INDEX_VERSION - 1 };
    const { svc } = dunya2b([bayat]);
    const r = await esle(svc, [VANA]);
    check('K4 bayat indeksli satırda da düzeltilmiş ad (eski adın yeniden üretimi değil)', r?.[VANA]?.netPrice === 100, js(r?.[VANA])?.slice(0, 200));
  }
  {
    const { svc } = dunya2b([]);
    const a = boruSatiri({ kullaniciAdi: '  Kelebek Vana  ' });
    const [row] = svc.hazirlaPool([a]);
    check('K5 aday alanları düzeltilmiş addan (ad, aile, görünen ad); kimlik (id, rowKey) indeksin',
      row.urun.ad === 'Kelebek Vana' && row.urun.adSlug === 'vana' && String(row.urun.displayName).startsWith('Kelebek Vana') &&
        row.urun.rowKey === a.product.rowKey && row.urun.id === a.product.id,
      js({ ad: row.urun.ad, adSlug: row.urun.adSlug, dn: row.urun.displayName, rk: row.urun.rowKey === a.product.rowKey }));
    const [bos] = svc.hazirlaPool([boruSatiri({ kullaniciAdi: '   ' })]);
    check('K5b boşluktan ibaret kullaniciAdi düzeltme sayılmaz (indeksin adı)', bos.urun.ad === 'Çelik Boru', js(bos.urun.ad));
    const [birimli] = svc.hazirlaPool([boruSatiri({ customPrice: 2, customPriceCurrency: 'USD' })]);
    check('K5c havuz satırı özel fiyatın birimini taşır (fiyatTabani okur)', birimli.customPriceCurrency === 'USD', js(birimli.customPriceCurrency));
  }
  {
    // Düzeltilmiş ad HER istekte yeniden indekslenir (reindex temizlemez); süre eşiği aşarsa SESSİZ kalmaz (PK9)
    const { svc } = dunya2b([boruSatiri({ kullaniciAdi: 'Kelebek Vana' })]);
    const sayac: any = performance;
    const asil = sayac.now;
    let t = 0;
    sayac.now = () => (t += 300);
    const yavas = await sessiz(() => svc.bulkMatch(K, 'b1', [VANA]));
    sayac.now = asil;
    check('K6 düzeltme yeniden indekslemesi eşiği aşınca uyarı (satır sayısı + süre)',
      yavas.uyarilar.some((u) => u.includes('AD DUZELTMESI') && u.includes('1 satir') && u.includes('300 ms')), js(yavas.uyarilar));
    const hizli = await sessiz(() => svc.bulkMatch(K, 'b1', [VANA]));
    check('K6b eşik altında uyarı YOK (her istekte gürültü yok)', !hizli.uyarilar.some((u) => u.includes('AD DUZELTMESI')), js(hizli.uyarilar));
  }
}

bitmezseKirmizi(main());
