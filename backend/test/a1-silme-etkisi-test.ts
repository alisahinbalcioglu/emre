/**
 * A-1 — SILME ONCESI SAYIM UCLARI + ON KONTROL (fiyat listesi yolu)
 *   npx ts-node test/a1-silme-etkisi-test.ts   (npm run test:a1)
 *
 * GERCEK yerel DB (PG). Gecici marka/liste/indeks/kutuphane satiri olusturur ve SILER.
 *
 * ── NEDEN BU TEST VAR ────────────────────────────────────────────────────
 * D isi marka yoluna "ekonomi tasiyan satir varsa onaysiz silme 409" kapisini
 * koydu. Fiyat listesi yolu (`admin.service.deletePriceList`) BUGUN ciplak:
 *   async deletePriceList(id) { ...; return this.prisma.priceList.delete({ where: { id } }); }
 * Ne sayim var, ne onay. Admin ne kaybedecegini SILMEDEN ONCE goremiyor.
 *
 * ── ★ B'DEN SONRA ANLAM DEGISTI — BU TESTIN EN KRITIK NOKTASI ────────────
 * B isi `UserLibrary.productIndexId` FK'sini Cascade → SetNull yapti. Yani
 * fiyat listesi silmek artik kutuphane satirini OLDURMUYOR:
 *   priceList.delete
 *     → ProductIndex CASCADE (indeks satirlari SILINIR)
 *     → UserLibrary.productIndexId SET NULL   (kutuphane satiri YASAR)
 *     → UserLibrary.sourcePriceListId SET NULL (kutuphane satiri YASAR)
 * Bu yuzden bu yolun ucu "silinecek satir" DEGIL "bagi kopacak satir" sayar.
 * Uc, `etki: 'bag-kopar'` doner ve ekran "116 satir silinecek" gibi YANLIS bir
 * sey vaat edemez. A0 bu iddiayi VARSAYMAZ — canli DB uzerinde OLCER; olcum
 * kirilirsa (FK geri Cascade'e donerse) once bu assert kirmizi yanar.
 *
 * OLCULEN GERCEK (yerel DB, salt-okuma, bu turdan once):
 *   UserLibrary 1712 satir · productIndexId dolu 1596 · bagsiz 116 · 2 kullanici
 *   discountRate>0 olan 59 (hepsi bagsiz) · customPrice dolu 108 (hepsi bagli)
 *   sourcePriceListId TUM 1712 satirda dolu → fiyat listesi yolu 59 iskontonun
 *   59'una da DOKUNUR (bagini koparir), ama hicbirini SILMEZ.
 *   Canli FK katalogu (SELECT conname, confdeltype FROM pg_constraint WHERE contype='f'):
 *     UserLibrary_productIndexId_fkey = n · UserLibrary_sourcePriceListId_fkey = n
 *     ProductIndex_priceListId_fkey   = c · UserLibrary_brandId_fkey = r
 *
 * ── SOZLESME (bu testin duzeltmeden BEKLEDIGI imza) ──────────────────────
 *   adminService.fiyatListesiSilmeEtkisi(id) → SilmeEtkisi { etki: 'bag-kopar' }
 *   brandsService.markaSilmeEtkisi(id)       → SilmeEtkisi { etki: 'satir-silinir' }
 *   adminService.deletePriceList(id, opts?: { kutuphaneSilmeOnayi?: boolean })
 *     · onay YOK + etkilenen satirlarda EKONOMI VAR → ConflictException, hicbir sey silinmez
 *     · onay true                                   → siler
 *     · ekonomi tasiyan satir YOK                   → onaysiz da siler
 *
 * BU TEST KIRMIZI OLMAK ICIN YAZILDI (uclar ve on kontrol henuz yok).
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { AdminController } from '../src/ozellik/kutuphane/admin/admin.controller';
import { BrandsService } from '../src/ozellik/kutuphane/brands/brands.service';
import { BrandsController } from '../src/ozellik/kutuphane/brands/brands.controller';

let passed = 0; let failed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, kanit?: string) => {
  if (kosul) { passed++; console.log(`PASS: ${ad}`); } else {
    failed++; failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`FAIL: ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
};

/** ProductIndex zorunlu alanlarinin en kucuk dolgusu. */
function indeksSatiri(brandId: string, priceListId: string, ad: string, rowKey: string) {
  return {
    brandId, priceListId, ad, price: 1000,
    adSlug: 'a1-test', adBucket: 'a1 test', displayName: ad, rowKey,
  } as any;
}

/** Kutuphane satiri — yalniz testin olusturdugu marka/listeye baglanir. */
function kutuphaneSatiri(
  userId: string, brandId: string, ad: string,
  bag: { sourcePriceListId?: string; productIndexId?: string },
  ekonomi: { discountRate?: number; customPrice?: number },
) {
  return { userId, brandId, materialName: ad, listPrice: 1000, unit: 'adet', ...bag, ...ekonomi } as any;
}

async function main() {
  const prisma = new PrismaClient();
  const adminSvc = new AdminService(prisma as any, null as any, null as any);
  const brandsSvc = new BrandsService(prisma as any);

  const kullanicilar = await prisma.user.findMany({
    where: { role: 'user' }, select: { id: true }, orderBy: { id: 'asc' }, take: 2,
  });
  if (kullanicilar.length < 2) {
    console.log(`ON KOSUL YOK — capraz-tenant icin 2 kullanici gerekli, ${kullanicilar.length} bulundu`);
    process.exit(2);
  }
  const [u1, u2] = kullanicilar.map((k) => k.id);

  const temizlenecek: string[] = [];
  try {
    // ══ A0 — OLCUM: fiyat listesi silmek satiri OLDURUYOR mu? ══════════════
    // Ucun ADINI ve ekran metnini bu olcum belirler. Bugun de fix sonrasi da
    // YESIL kalmali. Kirmiziya donerse ONCE bu olcutu sina (FK geri mi dondu?).
    const markaA0 = await prisma.brand.create({ data: { name: `A1 OLCUM ${Date.now()}` } });
    temizlenecek.push(markaA0.id);
    const listeA0 = await prisma.priceList.create({ data: { name: 'A1 olcum listesi', brandId: markaA0.id } });
    const idxA0 = await (prisma as any).productIndex.create({
      data: indeksSatiri(markaA0.id, listeA0.id, 'A1 olcum urunu', `a1-olcum-${Date.now()}`),
    });
    const satirA0 = await prisma.userLibrary.create({
      data: kutuphaneSatiri(u1, markaA0.id, 'A1 olcum satiri',
        { sourcePriceListId: listeA0.id, productIndexId: idxA0.id }, { discountRate: 15 }),
    });

    // Kapi: olcumden ONCE satir gercekten BAGLI ve iskontolu olmali.
    const a0Once = await prisma.userLibrary.findUnique({ where: { id: satirA0.id } });
    check('A0-KAPI: olcum satiri silme oncesi ProductIndex\'e BAGLI',
      a0Once?.productIndexId === idxA0.id, `productIndexId=${a0Once?.productIndexId ?? 'NULL'}`);
    check('A0-KAPI: olcum satiri silme oncesi iskonto TASIYOR (%15)',
      a0Once?.discountRate === 15, `discountRate=${a0Once?.discountRate ?? 'NULL'}`);

    await prisma.priceList.delete({ where: { id: listeA0.id } });

    const a0Sonra = await prisma.userLibrary.findUnique({ where: { id: satirA0.id } });
    const a0Indeks = await (prisma as any).productIndex.findUnique({ where: { id: idxA0.id } });

    check('A0-a ⭐ fiyat listesi silinince kutuphane satiri YASAR (SetNull — silinmez)',
      a0Sonra !== null, a0Sonra ? 'satir ayakta' : 'SATIR UCTU — FK Cascade\'e donmus, ucun adi yanlis olur');
    check('A0-b ⭐ satir yasarken ISKONTO da aynen durur (%15)',
      a0Sonra?.discountRate === 15, `discountRate=${a0Sonra?.discountRate ?? 'NULL'}`);
    check('A0-c ⭐ ama urun BAGI kopar (productIndexId NULL olur)',
      a0Sonra?.productIndexId === null, `productIndexId=${a0Sonra?.productIndexId ?? 'NULL'}`);
    check('A0-d ⭐ kaynak liste bagi da kopar (sourcePriceListId NULL olur)',
      a0Sonra?.sourcePriceListId === null, `sourcePriceListId=${a0Sonra?.sourcePriceListId ?? 'NULL'}`);
    check('A0-e indeks satiri GERCEKTEN silinir (CASCADE calisiyor, olcum bos degil)',
      a0Indeks === null, a0Indeks ? 'indeks satiri hala var — CASCADE kosmadi, A0 hicbir sey olcmedi' : 'indeks silindi');

    if (a0Sonra === null || a0Indeks !== null) {
      console.log('\n⛔ A0 OLCUMU BOZUK — ucun anlami bu olcume dayaniyor, devam edilmez.');
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exit(1);
    }

    // ══ ANA FIXTURE — fiyat listesi yolu ═══════════════════════════════════
    const marka = await prisma.brand.create({ data: { name: `A1 ETKI ${Date.now()}` } });
    temizlenecek.push(marka.id);
    const liste = await prisma.priceList.create({ data: { name: 'A1 Etki Listesi', brandId: marka.id } });
    const idx1 = await (prisma as any).productIndex.create({
      data: indeksSatiri(marka.id, liste.id, 'A1 Kelebek Vana DN80', `a1-r1-${Date.now()}`),
    });
    const idx2 = await (prisma as any).productIndex.create({
      data: indeksSatiri(marka.id, liste.id, 'A1 Kuresel Vana DN50', `a1-r2-${Date.now()}`),
    });

    // 4 satir: 2 iskontolu (IKI FARKLI kullanici), 1 ozel fiyatli, 1 bombos (KONTROL).
    // Bag yollari BILEREK karisik: biri yalniz productIndexId uzerinden, biri
    // yalniz sourcePriceListId uzerinden bagli — uc IKI YOLU DA saymali.
    await prisma.userLibrary.create({
      data: kutuphaneSatiri(u1, marka.id, 'A1 Iskontolu (indeks bagli)',
        { productIndexId: idx1.id }, { discountRate: 15 }),
    });
    await prisma.userLibrary.create({
      data: kutuphaneSatiri(u2, marka.id, 'A1 Iskontolu (yalniz kaynak liste bagli)',
        { sourcePriceListId: liste.id }, { discountRate: 20 }),
    });
    await prisma.userLibrary.create({
      data: kutuphaneSatiri(u1, marka.id, 'A1 Ozel fiyatli',
        { productIndexId: idx2.id }, { customPrice: 42 }),
    });
    await prisma.userLibrary.create({
      data: kutuphaneSatiri(u2, marka.id, 'A1 Ekonomisiz kontrol satiri',
        { sourcePriceListId: liste.id }, {}),
    });

    // ── ★ BOS-KUME KAPISI (UC AYRI assert + kullanici kapisi) ──────────────
    // Fixture'in DOLU oldugunu VE dogru KIRILIMLA dolu oldugunu ayri ayri
    // kanitla. `length > 0` yetmez: 4 ekonomisiz satirla test yesil kalir ve
    // HICBIR SEY olcmez.
    const etkiKosulu = {
      OR: [{ sourcePriceListId: liste.id }, { productIndexId: { in: [idx1.id, idx2.id] } }],
    } as any;
    const gToplam = await prisma.userLibrary.count({ where: etkiKosulu });
    const gIskontolu = await prisma.userLibrary.count({ where: { AND: [etkiKosulu, { discountRate: { gt: 0 } }] } as any });
    const gOzel = await prisma.userLibrary.count({ where: { AND: [etkiKosulu, { customPrice: { not: null } }] } as any });
    const gKullanici = await prisma.userLibrary.findMany({ where: etkiKosulu, select: { userId: true }, distinct: ['userId'] });

    check('G1 KAPI: listeden etkilenecek kutuphane satiri === 4', gToplam === 4, `${gToplam} satir`);
    check('G2 KAPI: bunlarin discountRate > 0 olani === 2', gIskontolu === 2, `${gIskontolu} satir`);
    check('G3 KAPI: bunlarin customPrice DOLU olani === 1', gOzel === 1, `${gOzel} satir`);
    check('G4 KAPI: satirlar IKI FARKLI kullaniciya ait (capraz-tenant olculebilir)',
      gKullanici.length === 2, `${gKullanici.length} farkli kullanici`);

    if (gToplam !== 4 || gIskontolu !== 2 || gOzel !== 1 || gKullanici.length !== 2) {
      console.log('\n⛔ BOS-KUME KAPISI GECILEMEDI — kirmizi assertler KOSULMADI (yalanci yesil yasagi).');
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exit(1);
    }

    // ══ R — FIYAT LISTESI SAYIM UCU (bugun YOK → kirmizi) ══════════════════
    check('R0 ⭐ adminService.fiyatListesiSilmeEtkisi bir fonksiyon olmali',
      typeof (adminSvc as any).fiyatListesiSilmeEtkisi === 'function',
      `tip: ${typeof (adminSvc as any).fiyatListesiSilmeEtkisi}`);

    let etki: any = null; let etkiHata: any = null;
    try { etki = await (adminSvc as any).fiyatListesiSilmeEtkisi?.(liste.id); } catch (e) { etkiHata = e; }

    check('R1 ⭐ uc, etkilenen kutuphane satirini sayar (ulSatiri === 4)',
      etki?.ulSatiri === 4, etkiHata ? `hata: ${etkiHata?.message}` : `ulSatiri=${etki?.ulSatiri ?? 'YOK'}`);
    check('R2 ⭐ uc, iskontolu satiri AYRI sayar (iskontoluSatir === 2)',
      etki?.iskontoluSatir === 2, `iskontoluSatir=${etki?.iskontoluSatir ?? 'YOK'}`);
    check('R3 ⭐ uc, ozel fiyatli satiri AYRI sayar (ozelFiyatliSatir === 1)',
      etki?.ozelFiyatliSatir === 1, `ozelFiyatliSatir=${etki?.ozelFiyatliSatir ?? 'YOK'}`);
    check('R4 ⭐ uc, etkilenen kullaniciyi sayar (etkilenenKullanici === 2)',
      etki?.etkilenenKullanici === 2, `etkilenenKullanici=${etki?.etkilenenKullanici ?? 'YOK'}`);
    check('R5 KAPI: uc, silinecek nesnenin adini doner',
      etki?.ad === 'A1 Etki Listesi', `ad=${JSON.stringify(etki?.ad ?? null)}`);
    // A0'in olctugu gercegin uc uzerindeki karsiligi — YANLIS VAAT YASAGI.
    check('R6 ⭐ uc, fiyat listesi yolunu "bag-kopar" olarak isaretler (satir SILINMEZ)',
      etki?.etki === 'bag-kopar', `etki=${JSON.stringify(etki?.etki ?? null)}`);

    // ══ M — MARKA SAYIM UCU (bugun YOK → kirmizi) ══════════════════════════
    check('M0 ⭐ brandsService.markaSilmeEtkisi bir fonksiyon olmali',
      typeof (brandsSvc as any).markaSilmeEtkisi === 'function',
      `tip: ${typeof (brandsSvc as any).markaSilmeEtkisi}`);

    let mEtki: any = null; let mHata: any = null;
    try { mEtki = await (brandsSvc as any).markaSilmeEtkisi?.(marka.id); } catch (e) { mHata = e; }

    check('M1 ⭐ marka ucu markaya bagli TUM kutuphane satirini sayar (=== 4)',
      mEtki?.ulSatiri === 4, mHata ? `hata: ${mHata?.message}` : `ulSatiri=${mEtki?.ulSatiri ?? 'YOK'}`);
    check('M2 ⭐ marka ucu iskontolu satiri AYRI sayar (=== 2)',
      mEtki?.iskontoluSatir === 2, `iskontoluSatir=${mEtki?.iskontoluSatir ?? 'YOK'}`);
    check('M3 ⭐ marka ucu ozel fiyatli satiri AYRI sayar (=== 1)',
      mEtki?.ozelFiyatliSatir === 1, `ozelFiyatliSatir=${mEtki?.ozelFiyatliSatir ?? 'YOK'}`);
    check('M4 ⭐ marka ucu etkilenen kullaniciyi sayar (=== 2)',
      mEtki?.etkilenenKullanici === 2, `etkilenenKullanici=${mEtki?.etkilenenKullanici ?? 'YOK'}`);
    // Iki yolun ayni sema ile AYRI gercegi anlatmasi bu isin can damari.
    check('M5 ⭐ marka yolu "satir-silinir" olarak isaretlenir (fiyat listesinden FARKLI)',
      mEtki?.etki === 'satir-silinir', `etki=${JSON.stringify(mEtki?.etki ?? null)}`);

    // ══ K — ON KONTROL: onaysiz silme 409 (bugun 200 → kirmizi) ════════════
    let kHata: any = null;
    try { await adminSvc.deletePriceList(liste.id); } catch (e) { kHata = e; }

    check('K1 ⭐ ekonomi tasiyan satir varken ONAYSIZ liste silme 409 firlatmali',
      kHata instanceof ConflictException,
      kHata ? `firlatilan: ${kHata?.constructor?.name}` : 'HIC HATA FIRLATILMADI — liste sessizce silindi');

    const kListe = await prisma.priceList.findUnique({ where: { id: liste.id } });
    check('K2 ⭐ onaysiz cagri sonrasi fiyat listesi HALA DURMALI (hicbir sey silinmez)',
      kListe !== null, kListe ? 'liste ayakta' : 'LISTE SILINDI');

    const kIndeks = await (prisma as any).productIndex.count({ where: { priceListId: liste.id } });
    check('K3 ⭐ onaysiz cagri sonrasi indeks satirlari da DURMALI (=== 2)',
      kIndeks === 2, `${kIndeks} indeks satiri`);

    // ══ L — YESIL KALKANLAR ════════════════════════════════════════════════
    // L1: ACIK ONAYLI silme calismali (bugun ikinci parametre yok sayilir → yesil;
    //     fix sonrasi onay okunur → yine yesil).
    let lHata: any = null;
    try { await (adminSvc.deletePriceList as any)(liste.id, { kutuphaneSilmeOnayi: true }); } catch (e) { lHata = e; }
    const lListe = await prisma.priceList.findUnique({ where: { id: liste.id } });
    check('L1 ⭐ KALKAN: ACIK ONAYLI liste silme YAPILMALI',
      lHata === null && lListe === null,
      lHata ? `hata: ${lHata?.constructor?.name}: ${lHata?.message}` : `liste hala var mi: ${lListe !== null}`);

    // L2: ekonomi tasimayan liste ONAYSIZ da silinebilmeli (gunluk temizlik BOZULMAMALI).
    const liste2 = await prisma.priceList.create({ data: { name: 'A1 Ekonomisiz Liste', brandId: marka.id } });
    await prisma.userLibrary.create({
      data: kutuphaneSatiri(u1, marka.id, 'A1 Ekonomisiz X', { sourcePriceListId: liste2.id }, {}),
    });
    const l2Toplam = await prisma.userLibrary.count({ where: { sourcePriceListId: liste2.id } });
    const l2Ekonomi = await prisma.userLibrary.count({
      where: { sourcePriceListId: liste2.id, OR: [{ discountRate: { gt: 0 } }, { customPrice: { not: null } }] } as any,
    });
    check('G5 KAPI: ekonomisiz listede etkilenen satir === 1', l2Toplam === 1, `${l2Toplam} satir`);
    check('G6 KAPI: o satir ekonomi TASIMIYOR (0)', l2Ekonomi === 0, `${l2Ekonomi} satir ekonomi tasiyor`);

    let l2Hata: any = null;
    try { await adminSvc.deletePriceList(liste2.id); } catch (e) { l2Hata = e; }
    const l2Kaldi = await prisma.priceList.findUnique({ where: { id: liste2.id } });
    check('L2 ⭐ KALKAN: ekonomi tasimayan liste ONAYSIZ da silinebilmeli',
      l2Hata === null && l2Kaldi === null,
      l2Hata ? `hata: ${l2Hata?.constructor?.name}` : `liste hala var mi: ${l2Kaldi !== null}`);

    // ══ U — UC KABLOLAMASI + ADMIN-ONLY KORUMA ════════════════════════════
    // Uc "salt-okuma" ve "admin-only" olacak dendi; bunu metadata ile olceriz.
    const aProto: any = AdminController.prototype;
    const bProto: any = BrandsController.prototype;

    check('U1 ⭐ AdminController.priceListSilmeEtkisi metodu var',
      typeof aProto.priceListSilmeEtkisi === 'function', `tip: ${typeof aProto.priceListSilmeEtkisi}`);
    check('U2 ⭐ yolu "price-lists/:id/silme-etkisi"',
      Reflect.getMetadata('path', aProto.priceListSilmeEtkisi ?? (() => {})) === 'price-lists/:id/silme-etkisi',
      `path=${JSON.stringify(Reflect.getMetadata('path', aProto.priceListSilmeEtkisi ?? (() => {})) ?? null)}`);
    // RequestMethod.GET === 0 — salt-okuma ucu yazma metodu olmamali.
    check('U3 ⭐ salt-okuma: HTTP metodu GET',
      Reflect.getMetadata('method', aProto.priceListSilmeEtkisi ?? (() => {})) === 0,
      `method=${JSON.stringify(Reflect.getMetadata('method', aProto.priceListSilmeEtkisi ?? (() => {})) ?? null)}`);
    // AdminController'da guard/roles SINIF duzeyinde (admin.controller.ts:13-15).
    check('U4 KAPI: AdminController sinif duzeyinde admin rolu istiyor',
      JSON.stringify(Reflect.getMetadata('roles', AdminController)) === JSON.stringify(['admin']),
      `roles=${JSON.stringify(Reflect.getMetadata('roles', AdminController) ?? null)}`);

    check('U5 ⭐ BrandsController.markaSilmeEtkisi metodu var',
      typeof bProto.markaSilmeEtkisi === 'function', `tip: ${typeof bProto.markaSilmeEtkisi}`);
    check('U6 ⭐ yolu ":id/silme-etkisi"',
      Reflect.getMetadata('path', bProto.markaSilmeEtkisi ?? (() => {})) === ':id/silme-etkisi',
      `path=${JSON.stringify(Reflect.getMetadata('path', bProto.markaSilmeEtkisi ?? (() => {})) ?? null)}`);
    check('U7 ⭐ salt-okuma: HTTP metodu GET',
      Reflect.getMetadata('method', bProto.markaSilmeEtkisi ?? (() => {})) === 0,
      `method=${JSON.stringify(Reflect.getMetadata('method', bProto.markaSilmeEtkisi ?? (() => {})) ?? null)}`);
    // BrandsController sinifinda YALNIZ JwtAuthGuard var — admin korumasi
    // METOT duzeyinde olmak ZORUNDA, yoksa uc her kullaniciya acik olur.
    check('U8 ⭐ admin-only: metot duzeyinde @Roles(\'admin\') var',
      JSON.stringify(Reflect.getMetadata('roles', bProto.markaSilmeEtkisi ?? (() => {}))) === JSON.stringify(['admin']),
      `roles=${JSON.stringify(Reflect.getMetadata('roles', bProto.markaSilmeEtkisi ?? (() => {})) ?? null)}`);
    check('U9 ⭐ admin-only: metot duzeyinde RolesGuard bagli',
      (Reflect.getMetadata('__guards__', bProto.markaSilmeEtkisi ?? (() => {})) ?? [])
        .some((g: any) => g?.name === 'RolesGuard'),
      `guards=${JSON.stringify(((Reflect.getMetadata('__guards__', bProto.markaSilmeEtkisi ?? (() => {})) ?? []) as any[]).map((g) => g?.name))}`);
  } finally {
    for (const bid of temizlenecek) {
      await prisma.userLibrary.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await (prisma as any).productIndex.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await (prisma as any).materialPrice.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await prisma.priceList.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await prisma.brand.delete({ where: { id: bid } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}\nA-1 SILME ETKISI UCLARI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(60)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
