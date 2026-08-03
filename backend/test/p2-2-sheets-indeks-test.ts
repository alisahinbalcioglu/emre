/**
 * P2-2 — `saveMaterialsFromSheets` ProductIndex YAZAR + MUKERRER YASAK
 *   npx ts-node test/p2-2-sheets-indeks-test.ts   (npm run test:p2-2)
 *
 * GERCEK yerel DB (PG). Gecici marka/liste olusturur ve SILER.
 *
 * KUSUR: Uc yazma yolundan (`commitImportCore` → `saveBulkMaterials`,
 * `saveBulkMaterials`, `saveMaterialsFromSheets`) YALNIZ sonuncusu
 * ProductIndex yazmiyordu; yalniz `materialPrice.upsert` yapiyordu. Bu yol
 * Excel coklu-sayfa editorunun ANA kaydetme yolu (`materials/[brandId]
 * /page.tsx:334` → `POST /admin/brands/:brandId/save-from-sheets`), yani
 * kullanicinin en cok kullandigi yol indekssiz marka uretiyordu.
 *
 * ⚠ I3 BU DOSYANIN EN ONEMLI TESTIDIR — kullanicinin acikca istedigi kapi.
 * Indeks yazmaya baslamak TEK BASINA yeterli degil: `library.service.ts:302`
 * "indeks varsa indeksten aktar" diyor, ama `importFromIndex` idempotentligi
 * `productIndexId` uzerinden kuruyor. Daha once LEGACY yoldan aktarilmis
 * satirlarda o alan NULL oldugu icin ikinci aktarim hepsini YENI sanip
 * `createMany` yapar → MUKERRER kutuphane satiri + kullanicinin iskontosu
 * oksuz kalir. I3 bunu olcer.
 */
import { PrismaClient } from '@prisma/client';
import { AdminService } from '../src/admin/admin.service';
import { LibraryService } from '../src/library/library.service';
import { TerminologyService } from '../src/modules/matching/terminology.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const COLS = [
  { field: 'col0', headerName: 'No' }, { field: 'ad', headerName: 'Malzeme Adı' },
  { field: 'cins', headerName: 'Cinsi' }, { field: 'cap', headerName: 'Çap' },
  { field: 'birim', headerName: 'Birim' }, { field: 'fiyat', headerName: 'Birim Fiyat' },
];
const ROLES = { noField: 'col0', nameField: 'ad', unitField: 'birim', materialUnitPriceField: 'fiyat' };

function sayfa(ad: string, satirlar: Array<{ ad: string; cins?: string; cap?: string; fiyat: string }>) {
  const rowData: any[] = [{ _rowIdx: 0, _isHeaderRow: true, col0: 'No', ad: 'Malzeme Adı', fiyat: 'Birim Fiyat' }];
  satirlar.forEach((s, i) => rowData.push({
    _rowIdx: i + 1, _isDataRow: true, col0: String(i + 1),
    ad: s.ad, cins: s.cins ?? '', cap: s.cap ?? '', birim: 'adet', fiyat: s.fiyat,
  }));
  return { name: ad, index: 0, isEmpty: false, columnDefs: COLS, rowData, columnRoles: ROLES, headerEndRow: 0 };
}

async function main() {
  const prisma = new PrismaClient();
  const terminology = new TerminologyService(prisma as any);
  const admin = new AdminService(prisma as any, undefined as any, terminology);
  const library = new LibraryService(prisma as any, terminology);

  const user = await prisma.user.findFirst({ where: { role: 'user' }, select: { id: true } });
  if (!user) { console.log('ON KOSUL YOK — test kullanicisi yok'); process.exit(2); }
  const uid = user.id;

  let brandId = '';
  try {
    const brand = await prisma.brand.create({ data: { name: `P2-2 TEST ${Date.now()}` } });
    brandId = brand.id;

    // ── I1: bu yol ProductIndex YAZAR (bugun KIRMIZI: 0 satir) ──────────
    await admin.saveMaterialsFromSheets(brandId, [sayfa('Boru', [
      { ad: 'Dikişli Siyah Çelik Boru', cins: 'Kaynaklı', cap: 'DN25', fiyat: '270' },
      { ad: 'Dikişli Siyah Çelik Boru', cins: 'Kaynaklı', cap: 'DN32', fiyat: '340' },
      { ad: 'Küresel Vana', cins: 'Dişli', cap: 'DN25', fiyat: '520' },
    ])] as any);

    const liste = await prisma.priceList.findFirst({ where: { brandId, name: 'Boru' } });
    check('I0 fiyat listesi olustu', !!liste, `liste=${liste?.id}`);
    const idx1 = await (prisma as any).productIndex.findMany({ where: { priceListId: liste!.id } });
    check('I1 ProductIndex YAZILDI (3 satir)', idx1.length === 3, `${idx1.length} satir`);

    // I1b: zorunlu alanlar dolu — bos kabuk kayit yazip "yazdim" demeyelim.
    // ⚠ `length > 0` sarti SART: bos dizide `.every()` TRUE doner ve assert
    // hicbir sey olcmeden yesil yanar (yalanci yesil).
    check('I1b indeks satirlari adSlug/rowKey/displayName tasiyor',
      idx1.length > 0 && idx1.every((r: any) => r.adSlug && r.rowKey && r.displayName),
      JSON.stringify(idx1.map((r: any) => ({ a: r.adSlug, k: r.rowKey })).slice(0, 2)));

    // I1c: indeks surumu GUNCEL — eski surumle yazilirsa motor gorur ama
    // yanlis semayla gorur. (Ayni bos-dizi tuzagi burada da var.)
    const { INDEX_VERSION } = require('../src/modules/matching/index/product-index');
    check('I1c indexVersion GUNCEL',
      idx1.length > 0 && idx1.every((r: any) => r.indexVersion === INDEX_VERSION),
      `beklenen ${INDEX_VERSION}, gelen ${[...new Set(idx1.map((r: any) => r.indexVersion))].join(',')}`);

    // ── I2: AYNI dosya tekrar → MUKERRER indeks satiri YOK (idempotent) ──
    await admin.saveMaterialsFromSheets(brandId, [sayfa('Boru', [
      { ad: 'Dikişli Siyah Çelik Boru', cins: 'Kaynaklı', cap: 'DN25', fiyat: '299' },
      { ad: 'Dikişli Siyah Çelik Boru', cins: 'Kaynaklı', cap: 'DN32', fiyat: '340' },
      { ad: 'Küresel Vana', cins: 'Dişli', cap: 'DN25', fiyat: '520' },
    ])] as any);
    const idx2 = await (prisma as any).productIndex.findMany({ where: { priceListId: liste!.id } });
    check('I2 ayni dosya tekrar yuklenince indeks satiri ARTMAZ', idx2.length === 3, `${idx2.length} satir`);

    // I2b: guncelleme gercekten islendi (upsert update dali calisiyor)
    const dn25 = idx2.find((r: any) => String(r.capRaw) === 'DN25' && String(r.ad).includes('Boru'));
    check('I2b tekrar yuklemede FIYAT guncellendi', dn25?.price === 299, `price=${dn25?.price}`);

    // I2c: kimlik KORUNDU — id degisseydi bagli UserLibrary.productIndexId
    // kopar ve kullanicinin iskontosu ucardi (rowKey upsert'un tum amaci bu).
    const idIlk = idx1.find((r: any) => r.rowKey === dn25?.rowKey)?.id;
    check('I2c ProductIndex.id KORUNDU (rowKey upsert)', !!idIlk && idIlk === dn25?.id,
      `ilk=${idIlk} ikinci=${dn25?.id}`);

    // ── I3: LEGACY aktarilmis liste MUKERRER satir URETMEZ ───────────────
    // Senaryo: kullanici listeyi indeks YOKKEN aktarmis (satirlar materialId
    // tasir, productIndexId NULL). Sonra liste indekslenmis. Ikinci aktarim
    // mukerrer satir YARATMAMALI.
    // Kurgu, gercek gecmisi TAKLIT eder: liste normal yoldan yuklenir,
    // sonra ProductIndex satirlari SILINIR — boylece "P2-2 oncesi yuklenmis,
    // indekssiz kalmis liste" durumu birebir olusur. (Malzemeyi elle
    // yaratmak YANLIS kurgu olurdu: adi urunun uretecegi addan farkli olur,
    // listede IKI ayri malzeme olusur ve test urunu degil kendini olcer.)
    const legacySayfa = { ...sayfa('Legacy', [{ ad: 'Kelebek Vana', cins: 'Wafer', cap: 'DN80', fiyat: '100' }]), name: 'Legacy' };
    await admin.saveMaterialsFromSheets(brandId, [legacySayfa] as any);
    const liste2 = (await prisma.priceList.findFirst({ where: { brandId, name: 'Legacy' } }))!;
    await (prisma as any).productIndex.deleteMany({ where: { priceListId: liste2.id } });
    const idxSifir = await (prisma as any).productIndex.count({ where: { priceListId: liste2.id } });
    check('I3-kurgu indeks sifirlandi (P2-2 oncesi durum)', idxSifir === 0, `${idxSifir} satir`);

    // Legacy aktarim (indeks YOK → legacy dal, satirlar productIndexId'siz)
    await library.importPriceList(uid, { brandId, priceListId: liste2.id } as any);
    const kut1 = await prisma.userLibrary.count({
      where: { userId: uid, brandId, sourcePriceListId: liste2.id },
    });
    check('I3a legacy aktarim 1 satir uretti', kut1 === 1, `${kut1} satir`);
    const bagsiz = await prisma.userLibrary.count({
      where: { userId: uid, brandId, sourcePriceListId: liste2.id, productIndexId: null } as any,
    });
    check('I3a2 legacy satir productIndexId TASIMAZ (riskin on kosulu)', bagsiz === 1, `${bagsiz} bagsiz`);

    // Simdi liste indekslensin (P2-2'nin actigi durum)
    await admin.saveMaterialsFromSheets(brandId, [legacySayfa] as any);
    const idxLegacy = await (prisma as any).productIndex.count({ where: { priceListId: liste2.id } });
    check('I3b liste artik indeksli', idxLegacy > 0, `${idxLegacy} indeks satiri`);

    // IKINCI aktarim — MUKERRER OLMAMALI
    await library.importPriceList(uid, { brandId, priceListId: liste2.id } as any);
    const kut2 = await prisma.userLibrary.count({
      where: { userId: uid, brandId, sourcePriceListId: liste2.id },
    });
    check('I3c ⭐ indekslenme sonrasi 2. aktarim MUKERRER satir URETMEZ',
      kut2 === kut1, `once ${kut1}, sonra ${kut2} satir`);
  } finally {
    if (brandId) {
      await prisma.userLibrary.deleteMany({ where: { brandId } }).catch(() => {});
      await (prisma as any).productIndex.deleteMany({ where: { brandId } }).catch(() => {});
      await (prisma as any).materialPrice.deleteMany({ where: { brandId } }).catch(() => {});
      await prisma.priceList.deleteMany({ where: { brandId } }).catch(() => {});
      await prisma.brand.delete({ where: { id: brandId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}\nP2-2 SHEETS INDEKS: ${passed} PASS, ${failed} FAIL\n${'='.repeat(60)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
