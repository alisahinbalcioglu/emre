#!/usr/bin/env node
/**
 * KISISEL LISTE/MARKA GERIYE DONUK ISARETLEME (24.08) — TEK SEFERLIK, IDEMPOTENT
 *   backend dizininden:  node scripts/kisisel-liste-backfill.js
 *   VPS'te:              docker exec <backend-container> node scripts/kisisel-liste-backfill.js
 *
 * NEDEN: kutuphane "Marka Ekle" / "satir ekle" akislari bugune kadar global
 * Brand + PriceList yaratti ama sahiplik YAZMADI ("kirke — Manuel Liste"
 * kopyalari admin panelde birikti, "emre basaran" gibi kisisel markalar havuz
 * listesine dustu). Sema artik sahiplik tasiyor (PriceList.ownerUserId,
 * Brand.isGlobal); bu betik ESKI kayitlari ayni sozlesmeye ceker.
 *
 * ⚠ SIRA: kolonlar once olusmali. Normal deploy'da bunu dert etme —
 * `20260824000000_kisisel_liste_izolasyonu` migration'i container boot'unda
 * (`prisma migrate deploy`) otomatik uygulanir; bu betik deploy SONRASI
 * bir kez kosulur. (Yerel gelistirmede `npx prisma db push` da esdegerdir.)
 *
 * KURAL 1 — PriceList.ownerUserId: bir listenin ProductIndex satirlarinin
 *   TAMAMI ayni kullanicinin ownerUserId'sini tasiyorsa liste o kullanicinindir.
 *   ownerUserId'yi YALNIZ kutuphane akisi (insertLibraryRows) yazar ve o akis
 *   her seferinde KENDI listesini acar — havuz listesiyle karisim uretilemez.
 *   Karisik/sahipsiz gorunen listeye DOKUNULMAZ (havuz varsayilir).
 *
 * KURAL 2 — Brand.isGlobal=false: markanin EN AZ BIR kisisel listesi var,
 *   HIC havuz listesi yok ve HIC havuz fiyati (MaterialPrice) yok ise marka
 *   kisisel kapsayicidir. Bos markalar (hic listesiz) havuzda KALIR — admin
 *   panelden acilip henuz dosya yuklenmemis mesru markalar gorunur kalmali.
 *
 * Idempotent: ikinci kosum 0 guncelleme raporlar. Geri alma gerekirse alanlar
 * additive'dir (ownerUserId=NULL, isGlobal=true yazmak eski gorunume doner).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function say(etiket) {
  const [toplamListe, kisiselListe, toplamMarka, kisiselMarka] = await Promise.all([
    prisma.priceList.count(),
    prisma.priceList.count({ where: { ownerUserId: { not: null } } }),
    prisma.brand.count(),
    prisma.brand.count({ where: { isGlobal: false } }),
  ]);
  console.log(`[${etiket}] PriceList: ${kisiselListe}/${toplamListe} kisisel · Brand: ${kisiselMarka}/${toplamMarka} kisisel`);
  return { toplamListe, kisiselListe, toplamMarka, kisiselMarka };
}

async function main() {
  const once = await say('ONCE');

  // ── KURAL 1: liste sahipligi ProductIndex satirlarindan ──────────────────
  const listeGuncellenen = await prisma.$executeRaw`
    UPDATE "PriceList" pl
    SET "ownerUserId" = sub.owner
    FROM (
      SELECT "priceListId", MIN("ownerUserId") AS owner
      FROM "ProductIndex"
      WHERE "priceListId" IS NOT NULL
      GROUP BY "priceListId"
      HAVING COUNT(*) = COUNT("ownerUserId")
         AND MIN("ownerUserId") = MAX("ownerUserId")
    ) sub
    WHERE pl.id = sub."priceListId" AND pl."ownerUserId" IS NULL`;

  // ── KURAL 2: yalniz-kisisel-icerikli markalar ────────────────────────────
  const markaGuncellenen = await prisma.$executeRaw`
    UPDATE "Brand" b
    SET "isGlobal" = false
    WHERE b."isGlobal" = true
      AND EXISTS (SELECT 1 FROM "PriceList" pl WHERE pl."brandId" = b.id AND pl."ownerUserId" IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM "PriceList" pl WHERE pl."brandId" = b.id AND pl."ownerUserId" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "MaterialPrice" mp WHERE mp."brandId" = b.id)`;

  console.log(`Guncellenen: ${listeGuncellenen} fiyat listesi isaretlendi · ${markaGuncellenen} marka kisisele cekildi`);

  const sonra = await say('SONRA');

  // Kirilim: hangi markalar kisisele cekildi (isim gorunur olsun — olcum
  // uydurma yasagi: rapor DB'nin kendi durumundan okunur, sayimdan turetilmez)
  const kisiselMarkalar = await prisma.brand.findMany({
    where: { isGlobal: false },
    select: { name: true, _count: { select: { priceLists: true } } },
    orderBy: { name: 'asc' },
  });
  if (kisiselMarkalar.length > 0) {
    console.log('Kisisel markalar (havuz/admin listesinden cikti):');
    for (const m of kisiselMarkalar) console.log(`  · ${m.name} (${m._count.priceLists} liste)`);
  }

  // Durustluk kapisi: kisisel liste sayisi arttiysa ama hicbir ProductIndex
  // sahipligi kalmadiysa bir tutarsizlik var demektir — sesli bildir.
  const sahipsizKisisel = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS c FROM "PriceList" pl
    WHERE pl."ownerUserId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "ProductIndex" pi WHERE pi."priceListId" = pl.id)`;
  const artik = Number(sahipsizKisisel[0]?.c ?? 0);
  if (artik > 0) {
    console.log(`⚠ ${artik} kisisel listenin ProductIndex satiri yok (yeni akista normal olabilir — bilgi amacli)`);
  }

  if (sonra.kisiselListe === once.kisiselListe && sonra.kisiselMarka === once.kisiselMarka) {
    console.log('Degisiklik yok — betik daha once kosulmus ya da isaretlenecek kayit yok (idempotent).');
  }
}

main()
  .catch((e) => { console.error('BACKFILL HATASI:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
