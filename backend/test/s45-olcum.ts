/**
 * S4+S5 OLCUM ARACI — ASSERT YOK, YALNIZ SAYIM.
 *   npx ts-node test/s45-olcum.ts
 *
 * NEDEN AYRI BIR ARAC: S4 (aile zayifligi) ve S5 (malzeme katmani) motorun
 * KARAR DAGILIMINI degistirir — bir fixture'in yesil olmasi "genelde daha
 * iyi oldu" demek DEGILDIR. Bu arac ayni sorgu kumesini GERCEK urun havuzu
 * uzerinde kosturup `single / multi(ask) / none` kirilimini basar. Sayilar
 * KOTULESIYORSA bu bir REGRESYONDUR ve raporlanmak zorundadir.
 *
 * ── KAYNAKLAR (ikisi de gercek) ────────────────────────────────────────
 *  URUN HAVUZU : yerel PostgreSQL `ProductIndex` (psql ile JSON dokumu —
 *                Prisma client'i yeniden uretmeye gerek kalmasin diye).
 *                Dokum yoksa arac SESSIZCE GECMEZ, gerekcesini yazip durur.
 *  SORGU KUMESI: gercek kesif dosyalarindan (test/fixtures/) uretim
 *                ayristiricisiyla (ExcelGridService.prepare) cikarilan
 *                malzeme adi satirlari + s45 fixture satirlari.
 *
 * ── IKI AYRI KARSILASTIRMA ─────────────────────────────────────────────
 *  1. REINDEX ONCESI vs SONRASI: ayni kod, iki veri hali. "Oncesi" = kayit
 *     eski surumde (indexVersion eski, yeni alanlar YOK) → hazirlaPool
 *     istek aninda yeniden uretir. Ikisi ayni cikmali; AYRILIYORSA bayat-
 *     indeks tamiri eksik demektir.
 *  2. ESKI KOD vs YENI KOD: bu araci calistir, S4/S5'i gecici kapat, TEKRAR
 *     calistir. Arac bunu kendisi yapmaz (uretim kodunda calisma-aninda
 *     kapatma anahtari BULUNMAZ — boyle bir anahtar kendisi bir risk olurdu).
 */

import * as fs from 'fs';
import * as path from 'path';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
import { INDEX_VERSION } from '../src/ozellik/eslestirme/matching/index/product-index';

const DOKUM = path.join(__dirname, '..', '.olcum-urun-dokumu.json');

interface PiSatir {
  id: string; brandId: string; brandName: string;
  kategori: string | null; ad: string; cins: string | null; baglanti: string | null;
  capRaw: string | null; boyMm: number | null; birim: string | null;
  price: number; currency: string; urunKodu: string | null; not: string | null;
  sheetName: string | null;
  adSlug: string; adBucket: string; adTokens: string[];
  cinsNorm: string | null; cinsTokens: string[];
  baglantiNorm: string | null; baglantiTokens: string[];
  sizeClass: string; capTags: string[]; capNorm: string | null; boyTag: string | null;
  displayName: string; indexVersion: number; belirsiz: boolean;
  malzemeler?: string[]; aileZayif?: boolean;
}

function dokumuOku(): PiSatir[] | null {
  if (!fs.existsSync(DOKUM)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(DOKUM, 'utf8'));
    return Array.isArray(j) ? j : null;
  } catch { return null; }
}

/** ProductIndex satiri → UserLibrary+product sekli (fake prisma icin). */
function libRow(p: PiSatir, bayat: boolean) {
  const urun: any = {
    id: `pi-${p.id}`,
    adSlug: p.adSlug, adBucket: p.adBucket, adTokens: p.adTokens ?? [],
    cinsNorm: p.cinsNorm, cinsTokens: p.cinsTokens ?? [],
    baglantiNorm: p.baglantiNorm, baglantiTokens: p.baglantiTokens ?? [],
    sizeClass: p.sizeClass, capTags: p.capTags ?? [], capNorm: p.capNorm,
    boyTag: p.boyTag, displayName: p.displayName, rowKey: p.id,
    indexVersion: bayat ? INDEX_VERSION - 1 : INDEX_VERSION,
    belirsiz: p.belirsiz,
    ad: p.ad, cins: p.cins, baglanti: p.baglanti, capRaw: p.capRaw,
    boyMm: p.boyMm, kategori: p.kategori, urunKodu: p.urunKodu,
    sheetName: p.sheetName, not: p.not, price: p.price, birim: p.birim,
    currency: p.currency,
  };
  // REINDEX ONCESI simulasyonu: yeni alanlar veritabaninda HENUZ YOK.
  if (!bayat) { urun.malzemeler = p.malzemeler ?? []; urun.aileZayif = p.aileZayif ?? false; }
  return {
    id: `lib-${p.id}`, materialId: null, material: null, materialName: p.displayName,
    listPrice: p.price, customPrice: null, discountRate: 0, currency: p.currency,
    productIndexId: `pi-${p.id}`, product: urun,
    brand: { id: p.brandId, name: p.brandName },
  };
}

async function kesifSatirlari(): Promise<string[]> {
  const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  const dosyalar = ['yangin-temin-montaj.xlsx', 'hangar-yss.xlsx', 'demontaj.xlsx'];
  const out: string[] = [];
  for (const d of dosyalar) {
    const yol = path.join(__dirname, 'fixtures', d);
    if (!fs.existsSync(yol)) continue;
    try {
      const res = await svc.prepare(fs.readFileSync(yol), { fixedSchema: true } as any);
      for (const s of res.sheets ?? []) {
        for (const r of (s.rowData ?? []) as any[]) {
          if (!r._isDataRow) continue;
          const ad = String(r._ad ?? '').trim();
          if (ad.length >= 4 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(ad)) out.push(ad);
        }
      }
    } catch (e) {
      console.warn(`  ⚠ ${d} okunamadi: ${(e as Error).message}`);
    }
  }
  return Array.from(new Set(out));
}

async function olc(rows: any[], sorgular: string[], etiket: string) {
  const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
  const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
  const markaAdi = rows[0]?.brand?.name ?? 'MARKA';
  const prisma: any = {
    userLibrary: {
      findMany: async (args: any) => {
        const b = args?.where?.brandId;
        if (b && typeof b === 'object' && 'not' in b) return []; // capraz-marka OLCUM DISI
        return rows;
      },
    },
    brand: { findUnique: async () => ({ name: markaAdi }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
  };
  const fx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) };
  const svc = new MatchingService(prisma, new TerminologyService(prisma), fx);

  const sessiz = console.log; console.log = () => {};
  const sessizW = console.warn; console.warn = () => {};
  const sessizE = console.error; console.error = () => {};
  let res: any;
  try { res = await svc.bulkMatch({ userId: 'olcum-user', firmaId: 'olcum-user' }, rows[0].brand.id, sorgular); }
  finally { console.log = sessiz; console.warn = sessizW; console.error = sessizE; }

  const sayim = { single: 0, multi: 0, none: 0, digger: 0 };
  for (const q of sorgular) {
    const r = res[q];
    if (!r) { sayim.digger++; continue; }
    if (r.confidence === 'high' || r.confidence === 'suggestion') sayim.single++;
    else if (r.confidence === 'multi') sayim.multi++;
    else if (r.confidence === 'none') sayim.none++;
    else sayim.digger++;
  }
  console.log(`  ${etiket.padEnd(34)} single=${String(sayim.single).padStart(4)}  multi=${String(sayim.multi).padStart(4)}  none=${String(sayim.none).padStart(4)}  diger=${sayim.digger}`);
  return sayim;
}

(async () => {
  console.log('\n════ S4+S5 OLCUM (assert yok, yalniz sayim) ════\n');
  const dokum = dokumuOku();
  if (!dokum || dokum.length === 0) {
    console.log('⛔ URUN DOKUMU YOK — olcum YAPILMADI (sessiz gecmek yasak).');
    console.log(`   Beklenen dosya: ${DOKUM}`);
    console.log('   Uretmek icin (yerel PostgreSQL acikken):');
    console.log('     bash ../scripts/s45-olcu.sh dokum');
    process.exit(2);
  }
  const markalar = new Map<string, PiSatir[]>();
  for (const p of dokum) {
    if (!markalar.has(p.brandId)) markalar.set(p.brandId, []);
    markalar.get(p.brandId)!.push(p);
  }
  // Anlamli olcum icin yeterli hacimli markalar (kucuk test markalari gurultu)
  const buyuk = Array.from(markalar.entries()).filter(([, v]) => v.length >= 50);
  console.log(`URUN HAVUZU : ${dokum.length} ProductIndex satiri, ${markalar.size} marka (${buyuk.length} tanesi >=50 satir)`);

  const kesif = await kesifSatirlari();
  const sabit = [
    'PİS SU BORUSU DN 110', 'HİDRANT HATTI BORUSU DN 110', 'TEMİZ SU BORUSU DN 50',
    'SPRİNK HATTI BORULARI DN50', 'SİYAH ÇELİK BORU DN 80', 'KELEBEK VANA DN 100',
    'ÇEKVALF DN 100', 'KÜRESEL VANA 1"', 'YANGIN HATTI BORUSU 2"', 'DOĞALGAZ BORUSU DN 25',
  ];
  const sorgular = Array.from(new Set([...kesif, ...sabit]));
  console.log(`SORGU KUMESI: ${sorgular.length} satir (${kesif.length} gercek kesif + ${sabit.length} sabit)\n`);
  if (sorgular.length === 0) { console.log('⛔ SORGU KUMESI BOS — olcum anlamsiz.'); process.exit(2); }

  for (const [bid, satirlar] of buyuk) {
    const ad = satirlar[0].brandName;
    console.log(`── ${ad} (${satirlar.length} urun, brandId=${bid}) ──`);
    const once = await olc(satirlar.map((p) => libRow(p, true)), sorgular, 'REINDEX ONCESI (bayat kayit)');
    const sonra = await olc(satirlar.map((p) => libRow(p, false)), sorgular, 'REINDEX SONRASI (v' + INDEX_VERSION + ')');
    const fark = ['single', 'multi', 'none'].map((k) => `${k}:${(sonra as any)[k] - (once as any)[k] >= 0 ? '+' : ''}${(sonra as any)[k] - (once as any)[k]}`).join(' ');
    console.log(`  FARK (sonra − once): ${fark}${fark.includes('+') || /-/.test(fark) ? '' : ''}`);
    if (sonra.single < once.single) console.log('  ⚠ REGRESYON ISARETI: reindex SONRASI daha az satira fiyat yaziliyor.');
    console.log('');
  }
  console.log('NOT: "eski kod vs yeni kod" karsilastirmasi icin S4/S5 gecici kapatilip');
  console.log('     bu arac TEKRAR kosulur — uretim kodunda calisma-aninda kapatma anahtari YOKTUR.');
})();
