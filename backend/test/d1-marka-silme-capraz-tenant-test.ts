/**
 * D-1 — MARKA SILININCE TUM KULLANICILARIN KUTUPHANE SATIRLARI SESSIZCE UCUYOR
 *   npx ts-node test/d1-marka-silme-capraz-tenant-test.ts   (npm run test:d1)
 *
 * GERCEK yerel DB (PG). Gecici marka/kutuphane satiri olusturur ve SILER.
 *
 * KUSUR (src/ozellik/kutuphane/brands/brands.service.ts:153-156, `remove`):
 *   const [libDel] = await this.prisma.$transaction([
 *     this.prisma.userLibrary.deleteMany({ where: { brandId: id } }),   // ← :154
 *     this.prisma.brand.delete({ where: { id } }),
 *   ]);
 * Filtre YALNIZ `brandId`. Iki ayri eksik var:
 *   1. CAPRAZ-TENANT: `userId` yok. Bir admin markayi silince SADECE kendi degil,
 *      TUM kullanicilarin o markaya bagli kutuphane satirlari gider.
 *   2. EKONOMI AYRIMI YOK: iskonto (discountRate) / ozel fiyat (customPrice)
 *      tasiyan satirla bombos satir ayni muameleyi gorur. Kullanicinin PAZARLIKLA
 *      aldigi iskonto GERI URETILEMEZ — hicbir yerden geri gelmez.
 *
 * ⚠ KODUN KENDI YORUMU (:148-152) bu deleteMany'nin NEDEN konuldugunu soyluyor:
 *   "UserLibrary.brand ZORUNLU iliski + onDelete tanimsiz (Restrict) — kullanici
 *    kutuphane kayitlari temizlenmeden marka silinemiyordu (FK hatasi:
 *    'Cayirova/TEST_MARKA_X silinemiyor' sikayeti)."
 * Yani deleteMany GERCEK bir ihtiyaci karsiliyor: test markasi temizligi.
 * Bu yuzden cozum "deleteMany'yi kaldir" DEGIL — cozum ACIK ONAY yolu:
 * ekonomi tasiyan satir varsa onaysiz cagri 409 ile DURUR, admin ne kaybedecegini
 * gorup bilerek onaylar. Onaysiz da olsa ekonomi tasimayan marka silinebilir
 * kalmali (test markasi temizligi BOZULMAMALI — asagida L1/L2 bunu korur).
 *
 * ── ONAY SOZLESMESI (bu testin duzeltmeden BEKLEDIGI imza) ─────────────
 *   remove(id: string, opts?: { kutuphaneSilmeOnayi?: boolean })
 *     · opts.kutuphaneSilmeOnayi YOK/false + markada EKONOMI TASIYAN satir VAR
 *         → ConflictException (409) firlatir, HICBIR SEY silinmez
 *     · opts.kutuphaneSilmeOnayi === true
 *         → bugunku davranis aynen surer (siler)
 *     · markada ekonomi tasiyan satir YOK
 *         → onaysiz da siler (test markasi temizligi)
 *   Test bu ikinci parametreyi `as any` ile gecirir; BUGUN parametre yok, fazladan
 *   argüman sessizce yok sayilir — bu sayede L1/L2 bugun de fix sonrasi da YESIL.
 *
 * ── B ISININ ETKISI OLCULDU (kapsam daralmadi) ─────────────────────────
 * CANLI FK KATALOGU (04.08, B'nin `db push`u SONRASI, yerel DB, salt-okuma —
 *   SELECT conname, confdeltype FROM pg_constraint WHERE contype='f'):
 *     UserLibrary_brandId_fkey          = r  (RESTRICT)   ← B DOKUNMADI
 *     UserLibrary_productIndexId_fkey   = n  (SET NULL)   ← B degistirdi (idi: c)
 *     UserLibrary_sourcePriceListId_fkey= n  (SET NULL)
 *     ProductIndex_brandId_fkey         = c  · PriceList_brandId_fkey = c
 * B, Brand→PriceList→ProductIndex→UserLibrary zincirinin SON halkasini
 * CASCADE'den SET NULL'a cevirdi. Yani o dolayli oldurucu yol KAPANDI: artik
 * zincir kutuphane satirini oldurmuyor, yalniz bagini kopariyor. Brand→UserLibrary
 * ise HALA RESTRICT. Sonuc: D'nin kapsami DARALMADI, tersine kusur artik TEK
 * BASINA ayakta — bugun 59 iskontoyu goturen tek yol :154'teki elle deleteMany.
 * Asagidaki D0 bunu VARSAYMAZ, olcer.
 *
 * OLCULEN GERCEK (yerel DB, salt-okuma, bu turdan once):
 *   UserLibrary 1712 satir · discountRate>0 olan 59 · customPrice dolu 108
 *   Kullanici sayisi: 2 (admin haric) — capraz-tenant gercekten olculebilir.
 *
 * BU TEST KIRMIZI OLMAK ICIN YAZILDI. Duzeltme bu asamada YAPILMADI.
 */
import { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { BrandsService } from '../src/ozellik/kutuphane/brands/brands.service';

let passed = 0; let failed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, kanit?: string) => {
  if (kosul) { passed++; console.log(`PASS: ${ad}`); } else {
    failed++; failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`FAIL: ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
};

/** Kutuphane satiri — yalniz testin olusturdugu markaya baglanir. */
function kutuphaneSatiri(
  userId: string, brandId: string, ad: string,
  ekonomi: { discountRate?: number; customPrice?: number },
) {
  return {
    userId, brandId, materialName: ad, listPrice: 1000, unit: 'adet',
    ...ekonomi,
  } as any;
}

async function main() {
  const prisma = new PrismaClient();
  const svc = new BrandsService(prisma as any);

  // Capraz-tenant'i olcebilmek icin IKI FARKLI kullanici sart.
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
    // ══ D0 — OLCUM: RESTRICT canli mi? (:154'un NEYI astigi) ═══════════════
    // Bu assert BUGUN de fix sonrasi da YESIL kalmali. Amaci: deleteMany'nin
    // "gereksiz savunma" degil, DB'nin canli korumasini bilerek etkisizlestiren
    // bir mudahale oldugunu KANITLAMAK. Kirmiziya donerse once OLCUTU sina.
    const markaD0 = await prisma.brand.create({ data: { name: `D1 RESTRICT OLCUM ${Date.now()}` } });
    temizlenecek.push(markaD0.id);
    await prisma.userLibrary.create({
      data: kutuphaneSatiri(u1, markaD0.id, 'D1 RESTRICT olcum satiri', { discountRate: 15 }),
    });
    const d0Oncesi = await prisma.userLibrary.count({ where: { brandId: markaD0.id } });
    check('D0-KAPI: olcum markasinda kutuphane satiri === 1',
      d0Oncesi === 1, `${d0Oncesi} satir`);

    let d0Hata: any = null;
    try {
      await prisma.brand.delete({ where: { id: markaD0.id } });
    } catch (e) { d0Hata = e; }
    check('D0 ⭐ deleteMany OLMADAN marka silme DB tarafindan RESTRICT ile bloklanir',
      d0Hata !== null,
      d0Hata ? `hata kodu=${d0Hata?.code ?? '?'}` : 'HATA YOK — marka silindi, RESTRICT canli degil');

    // ══ SENARYO A — KIRMIZI: onaysiz silme ekonomiyi goturuyor ════════════
    const markaA = await prisma.brand.create({ data: { name: `D1 EKONOMI ${Date.now()}` } });
    temizlenecek.push(markaA.id);

    // 4 satir: 2 iskontolu (IKI FARKLI kullanici — capraz-tenant),
    // 1 ozel fiyatli, 1 tamamen bos (KONTROL satiri).
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u1, markaA.id, 'D1 Kelebek Vana DN80', { discountRate: 15 }) });
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u2, markaA.id, 'D1 Kelebek Vana DN100', { discountRate: 15 }) });
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u1, markaA.id, 'D1 Kuresel Vana DN50', { customPrice: 42 }) });
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u2, markaA.id, 'D1 Ekonomisiz Kontrol Satiri', {}) });

    // ── ★ BOS-KUME KAPISI (UC AYRI assert, fix ONCESI) ────────────────────
    // Fixture'in DOLU oldugunu VE dogru KIRILIMLA dolu oldugunu ayri ayri
    // kanitla. Sadece `length > 0` yetmez: ekonomi tasimayan 4 satirla test
    // yesil kalir ve HICBIR SEY olcmez.
    const aToplam = await prisma.userLibrary.count({ where: { brandId: markaA.id } });
    const aIskontolu = await prisma.userLibrary.count({ where: { brandId: markaA.id, discountRate: { gt: 0 } } as any });
    const aOzelFiyatli = await prisma.userLibrary.count({ where: { brandId: markaA.id, customPrice: { not: null } } as any });
    const aKullanicilar = await prisma.userLibrary.findMany({
      where: { brandId: markaA.id }, select: { userId: true }, distinct: ['userId'],
    });

    check('G1 KAPI: markaya bagli kutuphane satiri === 4', aToplam === 4, `${aToplam} satir`);
    check('G2 KAPI: discountRate > 0 olan satir === 2', aIskontolu === 2, `${aIskontolu} satir`);
    check('G3 KAPI: customPrice DOLU olan satir === 1', aOzelFiyatli === 1, `${aOzelFiyatli} satir`);
    // Capraz-tenant kusurun ADI — satirlar tek kullaniciya yigilirsa test
    // "capraz" bir sey olcmemis olur, bu yuzden AYRI kapi.
    check('G4 KAPI: satirlar IKI FARKLI kullaniciya ait (capraz-tenant olculebilir)',
      aKullanicilar.length === 2, `${aKullanicilar.length} farkli kullanici`);

    if (aToplam !== 4 || aIskontolu !== 2 || aOzelFiyatli !== 1 || aKullanicilar.length !== 2) {
      console.log('\n⛔ BOS-KUME KAPISI GECILEMEDI — kirmizi assertler KOSULMADI (yalanci yesil yasagi).');
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exit(1);
    }

    // ── TETIKLEYICI: ONAYSIZ silme cagrisi ────────────────────────────────
    let aHata: any = null;
    try {
      await svc.remove(markaA.id);
    } catch (e) { aHata = e; }

    // ── KIRMIZI ASSERTLER (her biri TEK kritere bakar) ────────────────────
    check('R1 ⭐ onaysiz silme ConflictException (409) firlatmali',
      aHata instanceof ConflictException,
      aHata ? `firlatilan: ${aHata?.constructor?.name}` : 'HIC HATA FIRLATILMADI — silme basariyla tamamlandi');

    const aKalan = await prisma.userLibrary.count({ where: { brandId: markaA.id } });
    check('R2 ⭐ onaysiz cagri sonrasi 4 satirin HEPSI durmali',
      aKalan === 4, `${aKalan} satir hayatta (4 bekleniyordu)`);

    // ══ SENARYO B — YESIL KALKAN: ekonomisiz marka onaysiz silinebilmeli ══
    // Kodun :148-152'de anlattigi GERCEK ihtiyac: test markasi temizligi.
    const markaB = await prisma.brand.create({ data: { name: `D1 EKONOMISIZ ${Date.now()}` } });
    temizlenecek.push(markaB.id);
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u1, markaB.id, 'D1 Ekonomisiz A', {}) });
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u2, markaB.id, 'D1 Ekonomisiz B', {}) });

    // Bu senaryonun da KENDI bos-kume kapisi var: "ekonomi tasimayan" iddiasi
    // olculmeden L2 yesili hicbir sey kanitlamaz.
    const bToplam = await prisma.userLibrary.count({ where: { brandId: markaB.id } });
    const bEkonomili = await prisma.userLibrary.count({
      where: { brandId: markaB.id, OR: [{ discountRate: { gt: 0 } }, { customPrice: { not: null } }] } as any,
    });
    check('G5 KAPI: ekonomisiz markada kutuphane satiri === 2', bToplam === 2, `${bToplam} satir`);
    check('G6 KAPI: o satirlarin HICBIRI ekonomi tasimiyor (0)', bEkonomili === 0, `${bEkonomili} satir ekonomi tasiyor`);

    let bHata: any = null;
    try {
      await svc.remove(markaB.id);
    } catch (e) { bHata = e; }
    const bMarkaKaldiMi = await prisma.brand.findUnique({ where: { id: markaB.id } });
    check('L2 ⭐ KALKAN: ekonomi tasimayan marka ONAYSIZ da silinebilmeli',
      bHata === null && bMarkaKaldiMi === null,
      bHata ? `hata: ${bHata?.constructor?.name}` : `marka hala var mi: ${bMarkaKaldiMi !== null}`);

    // ══ SENARYO C — YESIL KALKAN: ACIK ONAYLI silme calismali ═════════════
    const markaC = await prisma.brand.create({ data: { name: `D1 ONAYLI ${Date.now()}` } });
    temizlenecek.push(markaC.id);
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u1, markaC.id, 'D1 Onayli Iskontolu', { discountRate: 15 }) });
    await prisma.userLibrary.create({ data: kutuphaneSatiri(u2, markaC.id, 'D1 Onayli Ozel Fiyatli', { customPrice: 42 }) });

    const cEkonomili = await prisma.userLibrary.count({
      where: { brandId: markaC.id, OR: [{ discountRate: { gt: 0 } }, { customPrice: { not: null } }] } as any,
    });
    check('G7 KAPI: onayli senaryoda ekonomi tasiyan satir === 2 (onay GERCEKTEN gerekli)',
      cEkonomili === 2, `${cEkonomili} satir`);

    let cHata: any = null;
    try {
      // BUGUN: ikinci parametre yok, sessizce yok sayilir → siler (yesil).
      // FIX SONRASI: onay okunur → siler (yine yesil).
      await (svc.remove as any)(markaC.id, { kutuphaneSilmeOnayi: true });
    } catch (e) { cHata = e; }
    const cMarkaKaldiMi = await prisma.brand.findUnique({ where: { id: markaC.id } });
    check('L1 ⭐ KALKAN: ACIK ONAYLI cagri silmeyi YAPMALI (test markasi temizligi)',
      cHata === null && cMarkaKaldiMi === null,
      cHata ? `hata: ${cHata?.constructor?.name}` : `marka hala var mi: ${cMarkaKaldiMi !== null}`);
  } finally {
    // Yalniz KENDI olusturdugumuz markalar — gercek veriye DOKUNULMAZ.
    for (const bid of temizlenecek) {
      await prisma.userLibrary.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await (prisma as any).productIndex.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await (prisma as any).materialPrice.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await prisma.priceList.deleteMany({ where: { brandId: bid } }).catch(() => {});
      await prisma.brand.delete({ where: { id: bid } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}\nD-1 MARKA SILME CAPRAZ-TENANT: ${passed} PASS, ${failed} FAIL\n${'='.repeat(60)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
