/**
 * B-1 — PRODUCTINDEX SILININCE KULLANICININ KUTUPHANE SATIRI DA SILINIYOR
 *   npx ts-node test/b1-kutuphane-cascade-test.ts   (npm run test:b1)
 *
 * GERCEK yerel DB (PG). Gecici marka/liste/indeks/kutuphane olusturur ve SILER.
 *
 * KUSUR (schema.prisma:348):
 *   product ProductIndex? @relation(..., onDelete: Cascade)
 * Ayni tabloda 14 satir yukarida (:334) sourcePriceList icin `onDelete: SetNull`
 * var. Yani AYNI SATIRA biri koruyucu biri oldurucu iki kural bagli:
 *   - fiyat listesi bagi kopunca satir YASAR (alan NULL olur)
 *   - urun indeksi bagi kopunca satir SILINIR (discountRate/customPrice ile)
 *
 * CANLI FK KATALOGU (04.08, yerel DB, salt-okuma —
 *   SELECT conname, confdeltype FROM pg_constraint WHERE contype='f'):
 *     ProductIndex_priceListId_fkey     = c  (CASCADE)
 *     UserLibrary_productIndexId_fkey   = c  (CASCADE)   ← OLDURUCU
 *     UserLibrary_sourcePriceListId_fkey= n  (SET NULL)  ← KORUYUCU
 *     UserLibrary_brandId_fkey          = r  (RESTRICT)
 * Zincir: priceList.delete → ProductIndex CASCADE → UserLibrary CASCADE.
 * ⚠ Bu proje semayi `prisma db push` ile yonetir; `prisma/migrations/` DRIFT
 * ETMISTIR (ProductIndex orada hic gecmez). FK gercegi migration'dan DEGIL
 * yukaridaki katalogdan okunur.
 *
 * OLCULEN GERCEK (yerel DB, salt-okuma): UserLibrary 1712 satir · 1596 bagli ·
 * 116 bagsiz · discountRate>0 olan 59 · customPrice dolu 108. `bagli=t &
 * iskontolu=t` hucresi BUGUN BOS — yani fiyat listesi yolu su an iskonto
 * goturmuyor. Kusur LATENT: veri bir kez o hucreye dustugunde kullanicinin
 * ekonomisi sessizce ucar. Bu test o hucreyi bilerek doldurup olcer.
 *
 * BU TEST KIRMIZI OLMAK ICIN YAZILDI. Duzeltme bu asamada YAPILMADI.
 */
import { PrismaClient } from '@prisma/client';

let passed = 0; let failed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, kanit?: string) => {
  if (kosul) { passed++; console.log(`PASS: ${ad}`); } else {
    failed++; failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`FAIL: ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
};

/** ProductIndex'in zorunlu (default'suz) alanlari — minimum gecerli satir. */
function indeksSatiri(brandId: string, priceListId: string, n: number) {
  return {
    brandId, priceListId,
    ad: `B1 Kelebek Vana DN${n}`,
    price: 100 * n,
    adSlug: 'kelebek-vana',
    adBucket: `b1 kelebek vana dn${n}`,
    displayName: `B1 Kelebek Vana DN${n}`,
    rowKey: `b1-row-${n}`,
  };
}

async function main() {
  const prisma = new PrismaClient();

  const user = await prisma.user.findFirst({ where: { role: 'user' }, select: { id: true } });
  if (!user) { console.log('ON KOSUL YOK — test kullanicisi yok'); process.exit(2); }
  const uid = user.id;

  let brandId = '';
  try {
    // ── FIXTURE ────────────────────────────────────────────────────────────
    const brand = await prisma.brand.create({ data: { name: `B1 TEST ${Date.now()}` } });
    brandId = brand.id;
    const liste = await prisma.priceList.create({ data: { brandId, name: 'B1 Liste' } });

    const pi1 = await (prisma as any).productIndex.create({ data: indeksSatiri(brandId, liste.id, 80) });
    const pi2 = await (prisma as any).productIndex.create({ data: indeksSatiri(brandId, liste.id, 100) });

    // Iki BAGLI satir: birinde iskonto, digerinde ozel fiyat (kullanicinin ekonomisi).
    const ulIskonto = await prisma.userLibrary.create({
      data: {
        userId: uid, brandId, sourcePriceListId: liste.id, productIndexId: pi1.id,
        materialName: 'B1 Kelebek Vana DN80', listPrice: 8000, discountRate: 15, unit: 'adet',
      } as any,
    });
    const ulOzelFiyat = await prisma.userLibrary.create({
      data: {
        userId: uid, brandId, sourcePriceListId: liste.id, productIndexId: pi2.id,
        materialName: 'B1 Kelebek Vana DN100', listPrice: 10000, customPrice: 42, unit: 'adet',
      } as any,
    });
    // KONTROL satiri: BAGSIZ (productIndexId NULL) — koruyucu kuralin alani.
    const ulKontrol = await prisma.userLibrary.create({
      data: {
        userId: uid, brandId, sourcePriceListId: liste.id,
        materialName: 'B1 Bagsiz Kontrol Satiri', listPrice: 500, discountRate: 20, unit: 'adet',
      } as any,
    });

    const bagliIdler = [ulIskonto.id, ulOzelFiyat.id];

    // ── ★ BOS-KUME KAPISI (fix ONCESI) ─────────────────────────────────────
    // Fixture'in DOLU oldugunu VE dogru KIRILIMLA dolu oldugunu AYRI
    // assertlerle kanitla. Sadece `length > 0` yetmez: iskonto/ozel fiyat
    // tasimayan iki satirla test yesil kalir ve HICBIR SEY olcmez.
    const bagliOncesi = await prisma.userLibrary.count({
      where: { brandId, productIndexId: { not: null } } as any,
    });
    const iskontoluOncesi = await prisma.userLibrary.count({
      where: { id: { in: bagliIdler }, discountRate: { not: null } } as any,
    });
    const ozelFiyatliOncesi = await prisma.userLibrary.count({
      where: { id: { in: bagliIdler }, customPrice: { not: null } } as any,
    });
    const bagsizOncesi = await prisma.userLibrary.count({
      where: { brandId, productIndexId: null } as any,
    });

    check('G1 KAPI: indekse BAGLI kutuphane satiri === 2', bagliOncesi === 2, `${bagliOncesi} satir`);
    check('G2 KAPI: bagli satirlardan discountRate DOLU olan === 1', iskontoluOncesi === 1, `${iskontoluOncesi} satir`);
    check('G3 KAPI: bagli satirlardan customPrice DOLU olan === 1', ozelFiyatliOncesi === 1, `${ozelFiyatliOncesi} satir`);
    check('G4 KAPI: kontrol icin BAGSIZ satir === 1', bagsizOncesi === 1, `${bagsizOncesi} satir`);

    // Kapi gecmeden testin gerisi KOSMAZ — yoksa kirmizi assertler bos kume
    // uzerinde "gecerdi" ve hicbir sey olculmemis olurdu.
    if (bagliOncesi !== 2 || iskontoluOncesi !== 1 || ozelFiyatliOncesi !== 1 || bagsizOncesi !== 1) {
      console.log('\n⛔ BOS-KUME KAPISI GECILEMEDI — kirmizi assertler KOSULMADI (yalanci yesil yasagi).');
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exit(1);
    }

    // ── TETIKLEYICI: fiyat listesi silinir ────────────────────────────────
    // Gercek karsiligi: admin bir fiyat listesini kaldirir / markayi temizler.
    // Beklenen: kullanicinin kutuphane satiri YASAR, yalniz bag kopar.
    await prisma.priceList.delete({ where: { id: liste.id } });

    // ── KIRMIZI ASSERTLER (her biri TEK kritere bakar) ────────────────────
    const kalan = await prisma.userLibrary.findMany({
      where: { id: { in: bagliIdler } } as any,
      select: { id: true, discountRate: true, customPrice: true, productIndexId: true },
    });

    check('R1 ⭐ silme sonrasi BAGLI kutuphane satirlari YASAMALI (2)',
      kalan.length === 2, `${kalan.length} satir hayatta`);

    const rIskonto = kalan.find((r) => r.id === ulIskonto.id);
    check('R2 ⭐ hayatta kalan satirda discountRate === 15 (kullanicinin iskontosu)',
      rIskonto?.discountRate === 15,
      rIskonto ? `discountRate=${rIskonto.discountRate}` : 'SATIR YOK — cascade sildi');

    const rOzel = kalan.find((r) => r.id === ulOzelFiyat.id);
    check('R3 ⭐ hayatta kalan satirda customPrice === 42 (kullanicinin ozel fiyati)',
      rOzel?.customPrice === 42,
      rOzel ? `customPrice=${rOzel.customPrice}` : 'SATIR YOK — cascade sildi');

    check('R4 hayatta kalan satirlarin productIndexId i NULL (bag koptu, satir yasadi)',
      kalan.length === 2 && kalan.every((r) => r.productIndexId === null),
      `productIndexId degerleri: ${JSON.stringify(kalan.map((r) => r.productIndexId))}`);

    // ── ★ KONTROL (olcut sinamasi) ────────────────────────────────────────
    // BAGSIZ satir BUGUN de yasiyor (sourcePriceListId SET NULL). Bu assert
    // YESIL kalmali: testin ortami dogru kurdugunun ve silmenin gercekten
    // gerceklestiginin kaniti. Kirmiziya donerse once OLCUTU sina, urunu degil.
    const kontrol = await prisma.userLibrary.findUnique({
      where: { id: ulKontrol.id },
      select: { id: true, discountRate: true, sourcePriceListId: true },
    });
    check('K1 KONTROL: bagsiz satir silme sonrasi YASIYOR (bugun de yesil)',
      !!kontrol, kontrol ? `id=${kontrol.id}` : 'SATIR YOK');
    check('K2 KONTROL: bagsiz satirin sourcePriceListId i NULL a dustu (SET NULL calisti)',
      kontrol?.sourcePriceListId === null, `sourcePriceListId=${kontrol?.sourcePriceListId}`);
    check('K3 KONTROL: bagsiz satirin discountRate i korundu (20)',
      kontrol?.discountRate === 20, `discountRate=${kontrol?.discountRate}`);
  } finally {
    // Yalniz KENDI olusturdugumuz kayitlar — gercek veriye dokunulmaz.
    if (brandId) {
      await prisma.userLibrary.deleteMany({ where: { brandId } }).catch(() => {});
      await (prisma as any).productIndex.deleteMany({ where: { brandId } }).catch(() => {});
      await (prisma as any).materialPrice.deleteMany({ where: { brandId } }).catch(() => {});
      await prisma.priceList.deleteMany({ where: { brandId } }).catch(() => {});
      await prisma.brand.delete({ where: { id: brandId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}\nB-1 KUTUPHANE CASCADE: ${passed} PASS, ${failed} FAIL\n${'='.repeat(60)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
