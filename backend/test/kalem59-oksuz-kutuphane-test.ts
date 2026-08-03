/**
 * KALEM 59 — YENIDEN YUKLEME KUTUPHANE SATIRINI OKSUZ BIRAKIR
 *   npx ts-node test/kalem59-oksuz-kutuphane-test.ts   (npm run test:kalem59)
 *
 * GERCEK yerel DB (PG). Gecici marka/liste olusturur ve SILER.
 *
 * OLCULEN GERCEK (04.08, CAYIROVA markasi, canli olmayan yerel veri):
 *   kutuphane satiri 116 · indekse bagli 0 · ProductIndex 359 kalem
 *   -> ayni fiyat listesinde. Yani urunler ORADA, satirlar bagsiz.
 * Kok neden UC aday anahtarin da olu olmasiyla kesinlesti:
 *   sortOrder 116 satirda da 0 · materialId 0/116 cozuluyor · cins/cap BOS.
 * Yani "eslestirme zinciri kopuk" DEGIL: kullanici listeyi yeniden yuklemis,
 * Y7 (`replaceExisting`) eski MaterialPrice'i silmis, kutuphane satirlari
 * SILINMIS kayitlara isaret eder kalmis. 59 satirda kullanicinin iskontosu var.
 *
 * ⚠ INDEKSLI satirlar BAGISIK — `importFromIndex` ile gelenler
 * `productIndexId` tasir, ProductIndex rowKey ile upsert edildigi icin id'ler
 * korunur. Kayip yalniz LEGACY (materialId tabanli) satirlarda.
 *
 * BU TESTIN OLCTUGU SEY: yeniden yukleme, oksuz birakacagi satirlari
 * RAPORLUYOR mu. Satirlari onarmiyoruz (guvenli anahtar yok, yanlis eslesme
 * kullanicinin iskontosunu YANLIS urune yazar). Kalem 58'in muhurlu dersi:
 * sessiz birakma yasak, ISARETLE.
 */
import { PrismaClient } from '@prisma/client';
import { AdminService } from '../src/admin/admin.service';
import { TerminologyService } from '../src/modules/matching/terminology.service';

let passed = 0; let failed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, kanit?: string) => {
  if (kosul) { passed++; console.log(`PASS: ${ad}`); } else {
    failed++; failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`FAIL: ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
};

async function main() {
  const prisma = new PrismaClient();
  const admin = new AdminService(prisma as any, undefined as any, new TerminologyService(prisma as any));

  const user = await prisma.user.findFirst({ where: { role: 'user' }, select: { id: true } });
  if (!user) { console.log('ON KOSUL YOK — test kullanicisi yok'); process.exit(2); }

  let brandId = '';
  try {
    const brand = await prisma.brand.create({ data: { name: `K59 TEST ${Date.now()}` } });
    brandId = brand.id;
    const liste = await prisma.priceList.create({ data: { brandId, name: 'K59 Liste' } });

    // 1) Ilk yukleme
    await admin.saveBulkMaterials(brandId, liste.id, [
      { materialName: 'K59 Kelebek Vana DN80', unit: 'adet', unitPrice: 100 },
      { materialName: 'K59 Kelebek Vana DN100', unit: 'adet', unitPrice: 200 },
    ] as any, { replaceExisting: true });

    // 2) LEGACY kutuphane satiri (materialId tabanli, productIndexId YOK) —
    //    kullanici bir de ISKONTO girmis olsun.
    const mp = await (prisma as any).materialPrice.findFirst({ where: { priceListId: liste.id } });
    check('K59-0 ilk yukleme MaterialPrice uretti', !!mp, `mp=${mp?.id}`);
    await prisma.userLibrary.create({
      data: {
        userId: user.id, brandId, sourcePriceListId: liste.id,
        materialId: mp.materialId, materialName: 'K59 Kelebek Vana DN80',
        listPrice: 100, discountRate: 15, unit: 'adet',
      } as any,
    });
    const oncesi = await prisma.userLibrary.count({
      where: { userId: user.id, sourcePriceListId: liste.id, productIndexId: null } as any,
    });
    check('K59-1 legacy kutuphane satiri kuruldu (productIndexId YOK)', oncesi === 1, `${oncesi} satir`);

    // 3) AYNI listeyi YENIDEN yukle — kusurun tetiklendigi an.
    //
    // ⚠ ADLAR DEGISIYOR, ve bu kurgu DEGIL gercegin taklidi. Ilk kirmizi
    // turunda ayni adlarla yuklemistim ve K59-5 GECMEDI: `material.findFirst
    // ({name})` mevcut kaydi buluyor, materialId DEGISMIYOR, satir oksuz
    // kalmiyor. Yani tetikleyici "yeniden yukleme" degil, IKI YUKLEME
    // ARASINDA ADLANDIRMANIN DEGISMESI. Gercek vakada da tam bu olmus:
    // ilk yukleme birlesik ad uretmis ("Su ve Yangın Tesisat Borusu 1/2"
    // DN15 Dış Cap 21.3mm..."), sonraki standart-sema ayrisik ad uretmis
    // ("Çelik boru" + cins + cap). Farkli ad = farkli Material = farkli
    // materialId = eski kutuphane satiri oksuz.
    const sonuc: any = await admin.saveBulkMaterials(brandId, liste.id, [
      { materialName: 'K59 Kelebek vana', unit: 'adet', unitPrice: 130, cins: 'wafer', cap: 'DN80' },
      { materialName: 'K59 Kelebek vana', unit: 'adet', unitPrice: 240, cins: 'wafer', cap: 'DN100' },
    ] as any, { replaceExisting: true });

    // ── ASIL KAPI ──
    check('K59-2 ⭐ yeniden yukleme OKSUZ satirlari RAPORLUYOR',
      !!sonuc.oksuzKutuphaneSatiri, `alan=${JSON.stringify(sonuc.oksuzKutuphaneSatiri)}`);
    check('K59-3 oksuz satir sayisi dogru (1)',
      sonuc.oksuzKutuphaneSatiri?.satir === 1, `${sonuc.oksuzKutuphaneSatiri?.satir}`);
    check('K59-4 ISKONTOLU satir ayrica sayiliyor (1)',
      sonuc.oksuzKutuphaneSatiri?.iskontolu === 1, `${sonuc.oksuzKutuphaneSatiri?.iskontolu}`);

    // 4) Kusurun kendisi hala duruyor mu — satir gercekten oksuz mu?
    //    (Bu ONARIM DEGIL; onarim ayri karar. Burada yalniz belgeleniyor.)
    const kutSatir = await prisma.userLibrary.findFirst({
      where: { userId: user.id, sourcePriceListId: liste.id } as any,
      select: { materialId: true },
    });
    const halaVar = kutSatir?.materialId
      ? await (prisma as any).materialPrice.count({ where: { materialId: kutSatir.materialId, priceListId: liste.id } })
      : -1;
    check('K59-5 satir GERCEKTEN oksuz kaldi (belgeleme — onarim ayri karar)',
      halaVar === 0, `materialId'nin MaterialPrice karsiligi: ${halaVar}`);

    // 5) Oksuz satir YOKKEN alan null olmali (yalanci uyari yasak)
    const liste2 = await prisma.priceList.create({ data: { brandId, name: 'K59 Liste 2' } });
    const temiz: any = await admin.saveBulkMaterials(brandId, liste2.id, [
      { materialName: 'K59 Temiz Kalem', unit: 'adet', unitPrice: 50 },
    ] as any, { replaceExisting: true });
    check('K59-6 oksuz satir yokken uyari NULL (yalanci alarm yok)',
      temiz.oksuzKutuphaneSatiri === null, `${JSON.stringify(temiz.oksuzKutuphaneSatiri)}`);
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

  console.log(`\n${'='.repeat(60)}\nKALEM 59 OKSUZ KUTUPHANE: ${passed} PASS, ${failed} FAIL\n${'='.repeat(60)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
