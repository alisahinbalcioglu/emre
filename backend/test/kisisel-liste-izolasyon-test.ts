/**
 * KISISEL LISTE/MARKA IZOLASYONU (24.08 kullanici bildirimi)
 *   npx ts-node test/kisisel-liste-izolasyon-test.ts   (npm run test:kisisel-liste)
 *
 * BILDIRIM: "kullanicinin kutuphanede kaydettigi dosyalar admin panelde
 * gorunuyor. kutuphanede olusturulan klasorler kisiseldir. admin sadece
 * malzeme havuzunu olusturur, excel yukler, siler."
 *
 * OLCULEN KOK: kutuphane "Marka Ekle" (createManualBrand) ve "satir ekle"
 * (addRowsToBrandList) akislari global Brand'i upsert edip her seferinde
 * global bir PriceList aciyordu ("kirke — Manuel Liste" ×5 tam bu); admin
 * paneli (GET /brands + /admin/brands/:id/materials) ve kullanici havuz
 * gorunumu (GET /brands/:id/price-lists) bu tablolari SAHIPLIK SUZGECI
 * OLMADAN listeliyordu. Ustelik /brands/price-lists/:id/materials kisisel
 * listenin SATIRLARINI (fiyat dahil) id bilen herkese aciyordu — gorunurluk
 * hatasi degil, CAPRAZ-TENANT veri sizintisi.
 *
 * SOZLESME (bu suite'in kilitledigi):
 *   · Brand.isGlobal=false → kutuphane akisinin actigi KISISEL kapsayici;
 *     GET /brands (havuz + admin) LISTELEMEZ. Bos havuz markasi GORUNUR kalir.
 *   · PriceList.ownerUserId dolu → kisisel liste; havuz/admin liste uclari
 *     null suzer, icerigini YALNIZ sahibi okur (admin dahil kimse okuyamaz).
 *   · Kutuphane akislari sahipligi YAZAR (upsert create.isGlobal=false,
 *     priceList.create ownerUserId=userId); mevcut havuz markasina baglanmak
 *     markayi KISISELLESTIRMEZ (upsert update bos kalir).
 *   · Admin ayni adla marka acarsa kisisel marka havuza TERFI eder (409 yerine)
 *     — cunku admin kisisel markayi GOREMEZ, "zaten kayitli" cikmaz sokakti.
 *   · importPriceList yabanci kisisel listeyi id'yle dahi AKTARAMAZ (NotFound).
 *
 * YONTEM: sahte Prisma. Suzgecler SABIT DEGIL — sahte findMany/count, SERVISIN
 * GECIRDIGI where'i fixture dizisine kendisi uygular. Yani servis suzgeci
 * dusurse (isGlobal/ownerUserId silinse) fixture'daki kisisel kayit sonuca
 * geri sizar ve ilgili assert KIRMIZI yanar — "kaydedilen arguman" degil
 * DAVRANIS olculur. DB gerekmez.
 */
import { NotFoundException, ConflictException } from '@nestjs/common';
import { BrandsService } from '../src/ozellik/kutuphane/brands/brands.service';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';

let passed = 0; let failed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, kanit?: string) => {
  if (kosul) { passed++; console.log(`PASS: ${ad}`); } else {
    failed++; failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`FAIL: ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
};

// ── FIXTURE ─────────────────────────────────────────────────────────────────
const U1 = 'u1-sahip'; const U2 = 'u2-yabanci';

const MARKALAR = [
  { id: 'b-ayvaz', name: 'AYVAZ', discipline: 'mechanical', isGlobal: true, logoUrl: null },
  // u1'in kutuphane "Marka Ekle" akisiyla actigi kisisel marka (ekran gorutusundeki "kirke")
  { id: 'b-kirke', name: 'kirke', discipline: 'mechanical', isGlobal: false, logoUrl: null },
  // Admin acmis ama henuz dosya yuklememis BOS havuz markasi — gorunur KALMALI
  { id: 'b-borusan', name: 'BORUSAN', discipline: 'mechanical', isGlobal: true, logoUrl: null },
  { id: 'b-elk', name: 'ELK MARKA', discipline: 'electrical', isGlobal: true, logoUrl: null },
];

const LISTELER = [
  { id: 'pl-havuz', name: 'AYVAZ 2026', brandId: 'b-ayvaz', ownerUserId: null, createdAt: new Date('2026-01-01') },
  { id: 'pl-kisisel', name: 'AYVAZ — Manuel Liste', brandId: 'b-ayvaz', ownerUserId: U1, createdAt: new Date('2026-02-01') },
  { id: 'pl-kirke', name: 'kirke — Manuel Liste', brandId: 'b-kirke', ownerUserId: U1, createdAt: new Date('2026-03-01') },
];

const INDEKS_SATIRLARI = [
  { id: 'pi-1', priceListId: 'pl-kirke', brandId: 'b-kirke', ownerUserId: U1, ad: 'Ozel Vana', birim: 'Adet', price: 1234, currency: 'TRY', kategori: null, cins: null, baglanti: null, capRaw: null, boyMm: null, urunKodu: null, not: null, sortOrder: 0, displayName: 'Ozel Vana', belirsiz: false },
];

const HAVUZ_FIYATLARI = [
  { id: 'mp-1', priceListId: 'pl-havuz', brandId: 'b-ayvaz', price: 500, currency: 'TRY', material: { name: 'Celik Boru DN50', unit: 'Metre' }, kategori: null, cins: null, cap: null, adRaw: null, birimRaw: null, sortOrder: 0, materialId: 'm-1', extra: null },
];

// ── SUZGECLER: sahte DB, SERVISIN verdigi where'i KENDISI uygular ──────────
function markaSuz(where: any = {}) {
  return MARKALAR.filter((b) =>
    (where.isGlobal === undefined || b.isGlobal === where.isGlobal)
    && (where.discipline === undefined || b.discipline === where.discipline));
}
function listeSuz(where: any = {}) {
  return LISTELER.filter((pl) =>
    (where.brandId === undefined || pl.brandId === where.brandId)
    // 'ownerUserId' anahtarinin VARLIGI onemli: where'de yoksa suzme yok
    && (!('ownerUserId' in where) || pl.ownerUserId === where.ownerUserId));
}

// ── KAYIT DEFTERI (mekanizma tanisi icin — davranis assert'lerine EK) ──────
const kayit = {
  brandFindManyWhere: [] as any[],
  plFindManyWhere: [] as any[],
  brandUpsert: [] as any[],
  brandUpdate: [] as any[],
  brandCreate: [] as any[],
  plCreate: [] as any[],
};

function fakePrisma() {
  return {
    brand: {
      findMany: async (arg: any = {}) => {
        kayit.brandFindManyWhere.push(arg.where ?? {});
        return markaSuz(arg.where).map((b) => {
          // _count, SERVISIN include'da gecirdigi iliski suzgecine gore hesaplanir
          // (Prisma filtered relation count'un davranissal esdegeri): suzgec
          // dusurulurse kisisel listeler sayima geri girer ve A6 kirmizi yanar.
          const plSel = arg.include?._count?.select?.priceLists;
          const plWhere = (plSel && typeof plSel === 'object' && plSel.where) ? plSel.where : {};
          const listeSayisi = listeSuz({ ...plWhere, brandId: b.id }).length;
          return { ...b, _count: { priceLists: listeSayisi, materialPrices: 0 } };
        });
      },
      findUnique: async (arg: any) => {
        if (arg.where?.id) return MARKALAR.find((b) => b.id === arg.where.id) ?? null;
        if (arg.where?.name) return MARKALAR.find((b) => b.name === arg.where.name) ?? null;
        return null;
      },
      count: async (arg: any = {}) => markaSuz(arg.where).length,
      create: async (arg: any) => { kayit.brandCreate.push(arg.data); return { id: 'b-yeni', isGlobal: true, ...arg.data }; },
      update: async (arg: any) => { kayit.brandUpdate.push(arg); const b = MARKALAR.find((x) => x.id === arg.where.id); return { ...b, ...arg.data }; },
      upsert: async (arg: any) => {
        kayit.brandUpsert.push(arg);
        const mevcut = MARKALAR.find((b) => b.name === arg.where.name);
        if (mevcut) return { ...mevcut, ...arg.update };
        return { id: 'b-yeni', ...arg.create };
      },
    },
    priceList: {
      findMany: async (arg: any = {}) => { kayit.plFindManyWhere.push(arg.where ?? {}); return listeSuz(arg.where).map((pl) => ({ ...pl, _count: { items: 0 } })); },
      findUnique: async (arg: any) => {
        const pl = LISTELER.find((x) => x.id === arg.where?.id);
        if (!pl) return null;
        return arg.include?.brand ? { ...pl, brand: MARKALAR.find((b) => b.id === pl.brandId) } : { ...pl };
      },
      count: async (arg: any = {}) => listeSuz(arg.where).length,
      create: async (arg: any) => { kayit.plCreate.push(arg.data); return { id: 'pl-yeni', ...arg.data }; },
    },
    productIndex: {
      findMany: async (arg: any = {}) => INDEKS_SATIRLARI.filter((r) => (arg.where?.priceListId === undefined || r.priceListId === arg.where.priceListId)),
      create: async (arg: any) => ({ id: `pi-yeni-${Math.random().toString(36).slice(2, 8)}`, ...arg.data }),
    },
    materialPrice: {
      findMany: async (arg: any = {}) => HAVUZ_FIYATLARI.filter((r) => (arg.where?.priceListId === undefined || r.priceListId === arg.where.priceListId)),
    },
    userLibrary: {
      findMany: async () => [],
      create: async (arg: any) => ({ id: 'ul-yeni', ...arg.data }),
      createMany: async (arg: any) => ({ count: (arg.data ?? []).length }),
      count: async (arg: any = {}) => (arg.where?.productIndexId === null ? 0 : 1),
      aggregate: async () => ({ _max: { sortOrder: 3 } }),
      groupBy: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    userBrandLibrary: { deleteMany: async () => ({ count: 0 }), upsert: async () => ({}) },
    libraryList: { findFirst: async (arg: any) => (arg.where?.id === 'll-1' ? { id: 'll-1', name: 'Fiyat Listesi', userId: U1, brandId: 'b-kirke' } : null) },
    user: { count: async () => 5 },
    material: { count: async () => 7 },
    quote: { count: async () => 0, findMany: async () => [] },
    $queryRaw: async () => [],
    $transaction: async (islemler: any[]) => Promise.all(islemler),
  };
}

const fakeTerminology = { learnFamilyAliases: async () => {} } as any;

async function main() {
  const prisma = fakePrisma() as any;
  const brandsSvc = new BrandsService(prisma);
  const adminSvc = new AdminService(prisma, {} as any, fakeTerminology);
  const librarySvc = new LibraryService(prisma, fakeTerminology);

  // ══ G — FIXTURE/OLCUT KAPILARI (bos kume yalanci yesil yasagi) ═══════════
  check('G1 KAPI: fixture kisisel marka iceriyor (isGlobal=false)',
    MARKALAR.some((b) => !b.isGlobal), 'kisisel marka yok — A blogu hicbir sey olcmez');
  check('G2 KAPI: fixture havuz markasi altinda KISISEL liste iceriyor',
    LISTELER.some((pl) => pl.brandId === 'b-ayvaz' && pl.ownerUserId !== null),
    'kisisel liste yok — B/D bloklari hicbir sey olcmez');
  check('G3 KAPI: suzgecsiz sorgu kisisel kaydi GERI GETIRIR (olcut kor degil)',
    markaSuz({}).length === MARKALAR.length && listeSuz({}).length === LISTELER.length,
    'sahte DB where uygulamiyor olabilir');

  // ══ A — GET /brands: havuz markalari ═════════════════════════════════════
  const tumu = await brandsSvc.findAll();
  const adlar = tumu.map((b: any) => b.name);
  check('A1 ⭐ kisisel marka ("kirke") havuz listesinde YOK',
    !adlar.includes('kirke'), `donen: ${adlar.join(', ')}`);
  check('A2 mekanizma: findAll where.isGlobal === true gecirdi',
    kayit.brandFindManyWhere.some((w) => w.isGlobal === true),
    JSON.stringify(kayit.brandFindManyWhere));
  check('A3 KALKAN: havuz markalari (AYVAZ/BORUSAN/ELK) listede duruyor',
    adlar.includes('AYVAZ') && adlar.includes('BORUSAN') && adlar.includes('ELK MARKA'),
    `donen: ${adlar.join(', ')}`);
  check('A4 KALKAN: BOS havuz markasi (BORUSAN, 0 liste) GORUNUR kaldi',
    adlar.includes('BORUSAN'), 'bos marka dustu — admin yeni marka acinca goremez olur');
  const elk = await brandsSvc.findAll('electrical');
  check('A5 KALKAN: discipline suzgeci korunur (electrical → yalniz ELK MARKA)',
    elk.length === 1 && (elk[0] as any).name === 'ELK MARKA',
    `donen: ${elk.map((b: any) => b.name).join(', ')}`);
  // AYVAZ'in altinda 1 havuz + 1 kisisel liste var; kart sayaci yalniz havuzu
  // saymali — 2 gorunurse gizli listenin VARLIGI sayidan sizmis olur.
  const ayvazKart = tumu.find((b: any) => b.name === 'AYVAZ') as any;
  check('A6 ⭐ marka kartindaki liste sayaci kisisel listeyi SAYMAZ (1)',
    ayvazKart?._count?.priceLists === 1,
    `_count.priceLists=${ayvazKart?._count?.priceLists} (2 ise kisisel liste sayildi)`);

  // ══ B — GET /brands/:id/price-lists: yalniz havuz listeleri ══════════════
  const bp = await brandsSvc.getBrandPriceLists('b-ayvaz');
  const bpAdlar = bp.priceLists.map((pl: any) => pl.name);
  check('B1 ⭐ kisisel liste ("AYVAZ — Manuel Liste") havuz gorunumunde YOK',
    !bpAdlar.includes('AYVAZ — Manuel Liste'), `donen: ${bpAdlar.join(', ')}`);
  check('B2 KALKAN: havuz listesi ("AYVAZ 2026") duruyor',
    bpAdlar.includes('AYVAZ 2026'), `donen: ${bpAdlar.join(', ')}`);
  check('B3 mekanizma: where ownerUserId=null anahtarini ICERIYOR',
    kayit.plFindManyWhere.some((w) => 'ownerUserId' in w && w.ownerUserId === null),
    JSON.stringify(kayit.plFindManyWhere));

  // ══ C — /brands/price-lists/:id/materials: sahiplik korumasi ═════════════
  let cHata: any = null;
  try { await brandsSvc.getPriceListMaterials('pl-kirke', U2); } catch (e) { cHata = e; }
  check('C1 ⭐ yabanci kullanici kisisel listeyi OKUYAMAZ (NotFound)',
    cHata instanceof NotFoundException,
    cHata ? `firlatilan: ${cHata?.constructor?.name}` : 'HATA YOK — icerik acildi (sizinti)');

  const sahipSonuc = await brandsSvc.getPriceListMaterials('pl-kirke', U1);
  check('C2 KALKAN: SAHIBI kendi kisisel listesini okuyabilir',
    sahipSonuc.totalCount === 1 && sahipSonuc.materials[0].materialName === 'Ozel Vana',
    `totalCount=${sahipSonuc.totalCount}`);

  const havuzSonuc = await brandsSvc.getPriceListMaterials('pl-havuz', U2);
  check('C3 KALKAN: havuz listesi herkese acik kalir',
    havuzSonuc.totalCount === 1, `totalCount=${havuzSonuc.totalCount}`);

  let c4Hata: any = null;
  try { await brandsSvc.getPriceListMaterials('pl-kirke', undefined); } catch (e) { c4Hata = e; }
  check('C4 kimliksiz cagri sahip SAYILMAZ (NotFound)',
    c4Hata instanceof NotFoundException,
    c4Hata ? `firlatilan: ${c4Hata?.constructor?.name}` : 'HATA YOK');

  // ══ D — /admin/brands/:id/materials: panel yalniz havuzu gorur ═══════════
  kayit.plFindManyWhere.length = 0;
  const am = await adminSvc.getBrandMaterials('b-ayvaz');
  const amAdlar = am.priceLists.map((pl: any) => pl.name);
  check('D1 ⭐ admin panel marka detayinda kisisel liste YOK',
    !amAdlar.includes('AYVAZ — Manuel Liste'), `donen: ${amAdlar.join(', ')}`);
  check('D2 KALKAN: havuz listesi admin panelde duruyor',
    amAdlar.includes('AYVAZ 2026'), `donen: ${amAdlar.join(', ')}`);
  check('D3 mekanizma: admin where ownerUserId=null anahtarini ICERIYOR',
    kayit.plFindManyWhere.some((w) => 'ownerUserId' in w && w.ownerUserId === null),
    JSON.stringify(kayit.plFindManyWhere));

  // ══ E — /admin/price-lists/:id/materials: kisisel icerik admin'e KAPALI ══
  let eHata: any = null;
  try { await adminSvc.getPriceListMaterials('pl-kirke'); } catch (e) { eHata = e; }
  check('E1 ⭐ admin bile kisisel listenin icerigini okuyamaz (NotFound)',
    eHata instanceof NotFoundException,
    eHata ? `firlatilan: ${eHata?.constructor?.name}` : 'HATA YOK — icerik acildi');
  const eHavuz = await adminSvc.getPriceListMaterials('pl-havuz');
  check('E2 KALKAN: admin havuz listesini okumaya devam eder',
    eHavuz.totalCount === 1, `totalCount=${eHavuz.totalCount}`);

  // ══ F — /admin/stats: sayilar havuzu sayar ═══════════════════════════════
  const stats = await adminSvc.getStats();
  check('F1 ⭐ stats.brandCount yalniz havuz markalarini sayar (3)',
    stats.brandCount === 3, `brandCount=${stats.brandCount} (4 ise kisisel marka sayildi)`);
  check('F2 ⭐ stats.priceListCount yalniz havuz listelerini sayar (1)',
    stats.priceListCount === 1, `priceListCount=${stats.priceListCount} (3 ise kisisel listeler sayildi)`);

  // ══ L — kutuphane akislari sahipligi YAZAR ═══════════════════════════════
  const yeni = await librarySvc.createManualBrand(U1, {
    brandName: 'YENI MARKA', discipline: 'mechanical',
    rows: [{ ad: 'Test Borusu', price: 100 }],
  } as any);
  const sonUpsert = kayit.brandUpsert[kayit.brandUpsert.length - 1];
  check('L1 ⭐ createManualBrand YENI markayi isGlobal:false acar',
    sonUpsert?.create?.isGlobal === false, JSON.stringify(sonUpsert?.create));
  const manuelListe = kayit.plCreate.find((d) => d.name === 'YENI MARKA — Manuel Liste');
  check('L2 ⭐ manuel listenin ownerUserId alani kullaniciya yazilir',
    manuelListe?.ownerUserId === U1, JSON.stringify(manuelListe));
  check('L3 KALKAN: akis tamamlanir (1 satir yazildi)',
    yeni.created === 1, `created=${yeni.created}`);

  await librarySvc.createManualBrand(U1, {
    brandName: 'AYVAZ', discipline: 'mechanical', rows: [{ ad: 'Baska Boru', price: 50 }],
  } as any);
  const ayvazUpsert = kayit.brandUpsert[kayit.brandUpsert.length - 1];
  check('L4 KALKAN: mevcut HAVUZ markasina baglanmak onu kisisellestirmez (update bos)',
    ayvazUpsert && Object.keys(ayvazUpsert.update ?? {}).length === 0,
    JSON.stringify(ayvazUpsert?.update));

  kayit.plCreate.length = 0;
  await librarySvc.addRowsToBrandList(U1, 'b-kirke', {
    listId: 'll-1', rows: [{ ad: 'Ek Vana', price: 10 }],
  } as any);
  check('L5 ⭐ addRowsToBrandList listeyi ownerUserId ile acar',
    kayit.plCreate.length === 1 && kayit.plCreate[0].ownerUserId === U1,
    JSON.stringify(kayit.plCreate));

  // ══ I — admin marka acma: kisisel marka TERFI eder, havuz 409 kalir ══════
  kayit.brandUpdate.length = 0;
  const terfi = await brandsSvc.create({ name: 'kirke', discipline: 'mechanical' } as any);
  check('I1 ⭐ admin ayni adla marka acinca kisisel marka havuza TERFI eder (409 degil)',
    (terfi as any).isGlobal === true
      && kayit.brandUpdate.some((u) => u.where?.id === 'b-kirke' && u.data?.isGlobal === true),
    JSON.stringify(kayit.brandUpdate));
  let iHata: any = null;
  try { await brandsSvc.create({ name: 'AYVAZ', discipline: 'mechanical' } as any); } catch (e) { iHata = e; }
  check('I2 KALKAN: mevcut HAVUZ markasi icin 409 davranisi DEGISMEDI',
    iHata instanceof ConflictException,
    iHata ? `firlatilan: ${iHata?.constructor?.name}` : 'HATA YOK — mukerrer havuz markasi acildi');
  kayit.brandCreate.length = 0;
  await brandsSvc.create({ name: 'TAZE MARKA', discipline: 'mechanical' } as any);
  check('I3 KALKAN: taze adla marka acma yolu bozulmadi',
    kayit.brandCreate.length === 1 && kayit.brandCreate[0].name === 'TAZE MARKA',
    JSON.stringify(kayit.brandCreate));

  // ══ K — importPriceList: yabanci kisisel liste AKTARILAMAZ ═══════════════
  let kHata: any = null;
  try {
    await librarySvc.importPriceList(U2, { brandId: 'b-kirke', priceListId: 'pl-kirke' } as any);
  } catch (e) { kHata = e; }
  check('K1 ⭐ yabanci kullanici kisisel listeyi kutuphanesine AKTARAMAZ (NotFound)',
    kHata instanceof NotFoundException,
    kHata ? `firlatilan: ${kHata?.constructor?.name}` : 'HATA YOK — fiyatlar kopyalandi (sizinti)');
  const kendiAktarim = await librarySvc.importPriceList(U1, { brandId: 'b-kirke', priceListId: 'pl-kirke' } as any);
  check('K2 KALKAN: SAHIBI kendi kisisel listesini aktarabilir (kapi asilir)',
    kendiAktarim.imported === 1, `imported=${kendiAktarim.imported}`);

  console.log(`\n${'='.repeat(64)}\nKISISEL LISTE IZOLASYONU: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
