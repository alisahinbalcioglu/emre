/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KUTUPHANE: OZEL FIYAT DONMASI (K1)  (`npm run test:kb-fiyat`)
 *
 *  PARA DOGRULUGU TURU (14.09) — A0 bulgusu K1, mevcut kodda OLCULDU:
 *  marka sayfasinda yalniz ISKONTOSU (ya da yalniz ADI) degisen satir
 *  kaydedilince `saveBrandSheets` customPrice'i o anki liste fiyatina
 *  yaziyordu. Havuz fiyati sonra guncellenip "Kutuphaneme Aktar" yeniden
 *  yapilinca `listPrice` yenileniyor, ama ekran ve eslestirme
 *  `customPrice ?? listPrice` okudugu icin ESKI fiyatta kaliyordu.
 *    Duzeltme oncesi olculen: 1/2" iskonto 10 · havuz 100→120 →
 *    ekran 100, eslestirme net 90 (dogrusu 120 / 108).
 *
 *  NEDEN ON YUZ METNI: kayit yuku (library/brand/[brandId]/page.tsx) her kirli
 *  satirda EKRANDAKI fiyati gonderir. Bu dosya o yukun kodunu sayfanin KENDI
 *  metninden cikarip calistirir (kopya degil). On yuz fiyati gondermeyi
 *  birakirsa K1/K2 bos yere yesil yanardi — K0 olcutu bunu yakalar.
 *
 *  KORUNAN SOZLESME
 *   K1-K2  fiyati degismeyen kayit customPrice YAZMAZ (yalniz iskonto / yalniz ad)
 *   K3-K4  yeniden aktarimdan sonra ekran ve eslestirme YENI havuz fiyatini kullanir
 *   K5     kullanicinin GERCEKTEN yazdigi fiyat kalici (L4: ozel fiyat korunur)
 *
 *  DB GEREKMEZ: bellek-ici sahte Prisma (yalniz bu yolun cagirdigi islemler).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { buildProductIndex } from '../src/ozellik/eslestirme/matching/index/product-index';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad} — ${detay}`); }
  else { failures.push(`${ad} — ${detay}`); console.log(`  FAIL: ${ad} — ${detay}`); }
}

// ── Bellek-ici sahte Prisma: esitlik, null, {in}, {not}, {notIn}, AND/OR ──
function eslesir(row: any, where: any): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND') { if (!(v as any[]).every((w) => eslesir(row, w))) return false; continue; }
    if (k === 'OR') { if (!(v as any[]).some((w) => eslesir(row, w))) return false; continue; }
    const deger = row[k];
    if (v === null) { if (deger != null) return false; continue; }
    if (typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      const o: any = v;
      if ('in' in o && !o.in.includes(deger)) return false;
      if ('notIn' in o && o.notIn.includes(deger)) return false;
      if ('not' in o) { if (o.not === null ? deger == null : deger === o.not) return false; }
      continue;
    }
    if (deger !== v) return false;
  }
  return true;
}

function sahtePrisma() {
  let sayac = 0;
  const db: Record<string, any[]> = { userLibrary: [], productIndex: [], priceList: [], brand: [], userBrandLibrary: [], libraryList: [] };
  const varsayilan: Record<string, any> = {
    userLibrary: { customPrice: null, discountRate: null, listPrice: null, currency: 'TRY', sortOrder: 0, libraryListId: null, productIndexId: null, materialId: null, sourcePriceListId: null, adRaw: null, kategori: null, cins: null, cap: null, unit: null },
  };
  const bilesikAnahtariAc = (where: any) => {
    const w = { ...where };
    for (const [k, v] of Object.entries(w)) if (k.includes('_') && v && typeof v === 'object') { delete w[k]; Object.assign(w, v); }
    return w;
  };
  const katil = (model: string, row: any, include: any) => {
    const r = { ...row };
    if (!include) return r;
    if (include.product && model === 'userLibrary') r.product = db.productIndex.find((p) => p.id === row.productIndexId) ?? null;
    // Tur 3 A4c: K1 ayrisim isareti kaynak listenin sahip alanlarini okur
    if (include.sourcePriceList && model === 'userLibrary') r.sourcePriceList = db.priceList.find((p) => p.id === row.sourcePriceListId) ?? null;
    if (include.material) r.material = null;
    if (include.brand) r.brand = db.brand.find((b) => b.id === row.brandId) ?? null;
    if (include._count && model === 'libraryList') r._count = { items: db.userLibrary.filter((u) => u.libraryListId === row.id).length };
    return r;
  };
  const tablo = (model: string) => ({
    findMany: async (a: any = {}) => {
      let rows = (db[model] ?? []).filter((r) => eslesir(r, a.where));
      const ob = Array.isArray(a.orderBy) ? a.orderBy : a.orderBy ? [a.orderBy] : [];
      for (const o of [...ob].reverse()) {
        const [alan, yon] = Object.entries(o)[0] as [string, any];
        if (typeof yon !== 'string') continue;
        rows = [...rows].sort((x, y) => (x[alan] > y[alan] ? 1 : x[alan] < y[alan] ? -1 : 0) * (yon === 'desc' ? -1 : 1));
      }
      return rows.map((r) => katil(model, r, a.include));
    },
    findFirst: async (a: any = {}) => { const r = (db[model] ?? []).find((x) => eslesir(x, a.where)); return r ? katil(model, r, a.include) : null; },
    findUnique: async (a: any = {}) => { const r = (db[model] ?? []).find((x) => eslesir(x, bilesikAnahtariAc(a.where))); return r ? katil(model, r, a.include) : null; },
    count: async (a: any = {}) => (db[model] ?? []).filter((r) => eslesir(r, a.where)).length,
    create: async (a: any) => { const r = { id: `${model}-${++sayac}`, ...(varsayilan[model] ?? {}), ...a.data }; (db[model] ??= []).push(r); return { ...r }; },
    createMany: async (a: any) => { for (const d of a.data) (db[model] ??= []).push({ id: `${model}-${++sayac}`, ...(varsayilan[model] ?? {}), ...d }); return { count: a.data.length }; },
    update: async (a: any) => { const r = (db[model] ?? []).find((x) => eslesir(x, a.where)); if (!r) throw new Error(`${model} yok`); Object.assign(r, a.data); return { ...r }; },
    updateMany: async (a: any) => { const rows = (db[model] ?? []).filter((x) => eslesir(x, a.where)); rows.forEach((r) => Object.assign(r, a.data)); return { count: rows.length }; },
    upsert: async (a: any) => {
      const r = (db[model] ?? []).find((x) => eslesir(x, bilesikAnahtariAc(a.where)));
      if (r) { Object.assign(r, a.update); return { ...r }; }
      const yeni = { id: `${model}-${++sayac}`, ...a.create }; (db[model] ??= []).push(yeni); return { ...yeni };
    },
    delete: async (a: any) => { const i = (db[model] ?? []).findIndex((x) => eslesir(x, a.where)); const [r] = db[model].splice(i, 1); return r; },
    deleteMany: async (a: any = {}) => { const once = (db[model] ?? []).length; db[model] = (db[model] ?? []).filter((x) => !eslesir(x, a.where)); return { count: once - db[model].length }; },
    aggregate: async (a: any) => { const rows = (db[model] ?? []).filter((x) => eslesir(x, a.where)); const alan = Object.keys(a._max ?? {})[0]; return { _max: { [alan]: rows.length ? Math.max(...rows.map((r) => r[alan] ?? 0)) : null } }; },
  });
  const prisma: any = new Proxy({}, {
    get(_t, ad: string | symbol) {
      if (ad === '$transaction') return async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma));
      if (typeof ad !== 'string' || ad.startsWith('$') || ad === 'then') return undefined;
      return tablo(ad);
    },
  });
  return { prisma, db };
}

// ── On yuz kayit yuku: sayfanin KENDI metninden cikarilir ──────────────────
const SAYFA = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/app/(protected)/library/brand/[brandId]/page.tsx'), 'utf-8');
const numOrUKaynak = /function numOrU\([\s\S]*?\r?\n\}/.exec(SAYFA)?.[0] ?? '';
const yukKaynak = /const payload = dirtyExisting\.map\(\(r: any\) => \(\{[\s\S]*?\r?\n {8}\}\)\);/.exec(SAYFA)?.[0] ?? '';
const derle = (kod: string) => ts.transpileModule(kod, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
// A2 (tur 3): sayfanin `numOrU`su ortak MAKINE okuyucusuna (`sayiOku`) devreder;
// sayfanin import'u bu baglamda yok — GERCEK kural modulu verilir (kopya degil).
const { sayiOku } = require('../../frontend/ozellik/fiyat/sayi-alani');
// eslint-disable-next-line no-new-func
const kayitYukuHam = new Function('sayiOku', 'dirtyExisting', 'priceField', 'unitField', 'nameField',
  `${derle(numOrUKaynak)}\n${derle(yukKaynak)}\nreturn payload;`) as (s: unknown, d: any[], p: string, u: string, n: string) => any[];
const kayitYuku = (d: any[], p: string, u: string, n: string) => kayitYukuHam(sayiOku, d, p, u, n);

const K = { userId: 'u1', firmaId: 'f1' };

function havuzUrunu(id: string, cap: string, fiyat: number, sira: number) {
  const idx = buildProductIndex({ ad: 'Küresel Vana', cap, birim: 'Adet', price: fiyat, kategori: 'Vanalar', sortOrder: sira } as any);
  return {
    id, brandId: 'b1', priceListId: 'pl1', ownerUserId: null, ownerFirmaId: null, kategori: 'Vanalar', ad: 'Küresel Vana',
    cins: null, baglanti: null, capRaw: cap, boyMm: null, birim: 'Adet', price: fiyat, currency: 'TRY', urunKodu: null,
    not: null, sheetName: 'Liste', sourceRow: sira, sortOrder: sira, ...idx,
  };
}

(async () => {
  const { prisma, db } = sahtePrisma();
  db.brand.push({ id: 'b1', name: 'TestVana', isGlobal: true });
  db.priceList.push({ id: 'pl1', brandId: 'b1', name: 'TestVana 2026', ownerUserId: null, ownerFirmaId: null });
  db.productIndex.push(havuzUrunu('pi1', '1/2"', 100, 0), havuzUrunu('pi2', '3/4"', 200, 1), havuzUrunu('pi3', '1"', 300, 2));
  const terminology: any = { loadAliases: async () => [], resolveAliasAdaylari: () => [], resolveAlias: () => null, learnFamilyAliases: async () => {} };
  const lib = new LibraryService(prisma, terminology);
  const eslestirici = new MatchingService(prisma, terminology, { getRates: async () => ({ usdTry: 47.35, eurTry: 54.1, source: 'tcmb', date: '' }) } as any);
  const kutuphaneSatiri = (cap: string) => db.userLibrary.find((u) => db.productIndex.find((p) => p.id === u.productIndexId)?.capRaw === cap);
  const ekranSatirlari = async (listId: string) => {
    const ekran: any = await lib.getBrandSheets(K as any, 'b1', listId);
    const sh = ekran.sheets.sheets[0];
    return { R: sh.columnRoles, satirlar: sh.rowData.filter((r: any) => r._isDataRow) };
  };

  await lib.importPriceList(K as any, { brandId: 'b1', priceListId: 'pl1' } as any);
  const { lists } = await lib.getBrandLists(K as any, 'b1');
  const listId = lists[0].id;

  // Kullanici: 1/2" YALNIZ iskonto 10 · 1" YALNIZ ad · 3/4" fiyati GERCEKTEN 150 yazar
  const once = await ekranSatirlari(listId);
  const R = once.R;
  const satirlar = once.satirlar.map((r: any) => ({ ...r, _draftDiscount: r._libraryDiscountRate ?? 0 }));
  const bul = (cap: string) => satirlar.find((r: any) => r.col_cap === cap);
  Object.assign(bul('1/2"'), { _draftDiscount: 10, _dirty: true });
  Object.assign(bul('1"'), { [R.nameField]: 'Küresel Vana (tam geçişli)', _dirty: true });
  Object.assign(bul('3/4"'), { [R.materialUnitPriceField]: '150', _dirty: true });
  const kirli = satirlar.filter((r: any) => r._isDataRow && r._libraryItemId && r._dirty);
  const yuk = kayitYuku(kirli, R.materialUnitPriceField, R.unitField, R.nameField);

  console.log('── K0) OLCUT: on yuz yuku sayfadan cikti ve fiyati HER kirli satirda gonderiyor ──');
  const yuk12 = yuk.find((p: any) => p.libraryItemId === bul('1/2"')._libraryItemId);
  // A2: numOrU artik tek satir (`sayiOku` devri) — olcut uzunluk degil DEVIR.
  check('K0a numOrU + kayit yuku kodu page.tsx metninde BULUNDU',
    /\bsayiOku\(/.test(numOrUKaynak) && yukKaynak.length > 300, `numOrU ${numOrUKaynak.length} karakter (sayiOku devri) · yuk ${yukKaynak.length} karakter`);
  check('K0b yalniz iskontosu degisen satirin yukunde de listPrice VAR (K1 bu yuzden gerekli)',
    yuk.length === 3 && typeof yuk12?.listPrice === 'number', JSON.stringify(yuk12));

  await lib.saveBrandSheets(K as any, 'b1', yuk);

  console.log('── K1-K2) FIYATI DEGISMEYEN KAYIT customPrice YAZMAZ ──');
  const s12 = kutuphaneSatiri('1/2"');
  const s1 = kutuphaneSatiri('1"');
  const s34 = kutuphaneSatiri('3/4"');
  check('K1 yalniz iskonto kaydi: iskonto yazildi, customPrice BOS kaldi',
    s12?.discountRate === 10 && s12?.customPrice == null, `discountRate=${s12?.discountRate} customPrice=${s12?.customPrice}`);
  check('K2 yalniz ad kaydi: ad yazildi, customPrice BOS kaldi',
    s1?.adRaw === 'Küresel Vana (tam geçişli)' && s1?.customPrice == null, `adRaw=${s1?.adRaw} customPrice=${s1?.customPrice}`);
  check('K5a gercek fiyat duzenlemesi YAZILDI',
    s34?.customPrice === 150, `customPrice=${s34?.customPrice}`);

  // Havuz fiyati guncellenir (admin upsert rowKey ile ID korur) → kullanici yeniden aktarir
  for (const p of db.productIndex) p.price = Math.round(p.price * 1.2);
  await lib.importPriceList(K as any, { brandId: 'b1', priceListId: 'pl1' } as any);

  console.log('── K3) YENIDEN AKTARIMDAN SONRA EKRAN ──');
  const sonra = await ekranSatirlari(listId);
  const fiyat = (cap: string) => sonra.satirlar.find((r: any) => r.col_cap === cap)?.[sonra.R.materialUnitPriceField];
  check('K3a iskontolu satir ekranda YENI havuz fiyati', fiyat('1/2"') === 120, `1/2" Liste Fiyat=${fiyat('1/2"')} (eski 100)`);
  check('K3b adi degisen satir ekranda YENI havuz fiyati', fiyat('1"') === 360, `1" Liste Fiyat=${fiyat('1"')} (eski 300)`);
  check('K5b kullanicinin yazdigi fiyat havuz guncellemesinden SONRA da duruyor', fiyat('3/4"') === 150, `3/4" Liste Fiyat=${fiyat('3/4"')} (havuz 240)`);

  console.log('── K4) YENIDEN AKTARIMDAN SONRA ESLESTIRME (teklife giden fiyat) ──');
  const sonuc: any = await eslestirici.bulkMatch(K as any, 'b1', ['Küresel vana 1/2"', 'Küresel vana 3/4"', 'Küresel vana 1"']);
  const net = (ad: string) => sonuc[ad]?.netPrice;
  check('K4a iskontolu satir: net = 120 × (1 − %10) = 108', net('Küresel vana 1/2"') === 108, `netPrice=${net('Küresel vana 1/2"')} (donmus 90)`);
  check('K4b adi degisen satir: net = 360', net('Küresel vana 1"') === 360, `netPrice=${net('Küresel vana 1"')} (donmus 300)`);
  check('K5c kullanicinin yazdigi fiyat eslestirmede de 150', net('Küresel vana 3/4"') === 150, `netPrice=${net('Küresel vana 3/4"')}`);

  console.log('── K6) AYRISMIS FIYAT ISARETI (tur 3 A4c): tahmin yok, iki fiyat gorunur ──');
  const ekranSatiri = (cap: string) => sonra.satirlar.find((r: any) => r.col_cap === cap);
  check('K6a havuz fiyati degisip ozel fiyattan AYRISINCA satir isaretli: ozel 150 · havuz liste 240',
    JSON.stringify(ekranSatiri('3/4"')?._fiyatAyrisik) === JSON.stringify({ ozel: 150, havuz: 240 }), JSON.stringify(ekranSatiri('3/4"')?._fiyatAyrisik));
  check('K6b gosterilen fiyat DEGISMEZ — ekran hangisinin gecerli oldugunu tahmin etmez (3/4" hala 150)',
    fiyat('3/4"') === 150, `3/4" Liste Fiyat=${fiyat('3/4"')}`);
  check('K6c ozel fiyati olmayan satirlar ISARETSIZ (1/2", 1")',
    !ekranSatiri('1/2"')?._fiyatAyrisik && !ekranSatiri('1"')?._fiyatAyrisik, `${JSON.stringify(ekranSatiri('1/2"')?._fiyatAyrisik)} ${JSON.stringify(ekranSatiri('1"')?._fiyatAyrisik)}`);
  {
    const { havuzFiyatAyrisimi } = require('../src/ozellik/kutuphane/library/library-sheet-builder');
    const havuz = { sourcePriceList: { ownerUserId: null, ownerFirmaId: null }, productIndexId: 'pi', product: { ownerUserId: null, ownerFirmaId: null } };
    const kisi = { ownerUserId: 'u1', ownerFirmaId: 'f1' };
    const durumlar: Array<[string, any, boolean]> = [
      ['havuz C≠L', { ...havuz, customPrice: 100, listPrice: 120 }, true],
      ['legacy havuz (indekssiz) C≠L', { sourcePriceList: havuz.sourcePriceList, productIndexId: null, customPrice: 500, listPrice: 600 }, true],
      ['kisisel liste', { ...havuz, sourcePriceList: kisi, customPrice: 100, listPrice: 120 }, false],
      ['eski kisisel (liste sahipsiz, indeks sahipli)', { ...havuz, product: kisi, customPrice: 100, listPrice: 120 }, false],
      ['yetim (kaynak yok)', { customPrice: 100, listPrice: 120 }, false],
      ['esit (float 0,1+0,2 = 0,3)', { ...havuz, customPrice: 0.1 + 0.2, listPrice: 0.3 }, false],
      ['ozel fiyat yok', { ...havuz, customPrice: null, listPrice: 120 }, false],
      ['liste fiyati yok', { ...havuz, customPrice: 400, listPrice: null }, false],
    ];
    const yanlis = durumlar.filter(([, girdi, beklenen]) => (havuzFiyatAyrisimi(girdi) !== null) !== beklenen).map(([ad]) => ad);
    check('K6d tanim migration\'daki "ayrismis" ile ayni: yalniz HAVUZA BAGLI ve C≠L (kisisel, yetim, esit, bos isaretsiz)', yanlis.length === 0, yanlis.join(' · ') || `${durumlar.length} durum`);
  }

  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    process.exit(1);
  }
})().catch((e) => { console.error('BEKLENMEYEN:', e); process.exit(1); });
