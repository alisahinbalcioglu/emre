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
 * Gercek MatchingService + TerminologyService, sahte Prisma (`p4-motor-notlari`
 * deseni).
 */
import { buildProductIndex, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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

  console.log(`\n${'='.repeat(60)}\nP4B MOTOR: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
