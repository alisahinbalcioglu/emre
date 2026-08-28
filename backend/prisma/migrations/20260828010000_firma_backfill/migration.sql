-- FIRMA BACKFILL (ADIM 1, 28.08.2026) — mevcut veriyi firmalara ATAR.
--
-- KURAL: her mevcut kullanici KENDI firmasinin SAHIBI olur. Kullanicilar
-- birbirinden bagimsiz kiracilardir; TEK ortak firma yaratmak onlarin
-- tekliflerini/kutuphanelerini birbirine acar — kasten YAPILMAZ.
--
-- Firma.ad simdilik e-postanin @ oncesi parcasidir (yer tutucu); firma sahibi
-- ADIM 2'de bunu panelden degistirebilecek.
--
-- SAHIPSIZ SATIRLAR DOKUNULMAZ: TerminologyAlias/BrandMaterialType'ta
-- userId IS NULL = sistem seed'i, ProductIndex'te ownerUserId IS NULL = havuz.
-- Bunlarin firmaId'si NULL kalir (herkese acik olmalari kasten).
--
-- IDEMPOTENS: her ifade yalniz "firmaId IS NULL" satirlari gunceller, firma
-- yaratimi da yalniz firmasiz kullanicilar icin kosar. Ikinci kosum NO-OP'tur.
-- Bu ayni zamanda GECIS GUVENLIGIDIR: migration bir kez kosar, ama migrate
-- deploy yarida kesilip tekrar denenirse veri ikizlenmez.

-- 1) Firmasi olmayan her kullaniciya kendi firmasi.
--    Firma id'si kullanici kimliginden TURETILIR (md5 -> uuid): rastgele id
--    kullanip sonra e-postayla geri eslestirmek kirilgandi (ayni yerel parcali
--    iki e-posta birbirine karisabilir). Turetilmis id hem tekil hem tekrarlanabilir,
--    boylece INSERT ile UPDATE arasinda eslesme SORGUSUZ kurulur.
INSERT INTO "Firma" ("id", "ad", "createdAt")
SELECT (md5('firma:' || u."id"))::uuid::text,
       split_part(u."email", '@', 1),
       CURRENT_TIMESTAMP
FROM "User" u
WHERE u."firmaId" IS NULL
ON CONFLICT ("id") DO NOTHING;

-- 2) Kullaniciyi kendi firmasina SAHIP olarak bagla
UPDATE "User" u
SET "firmaId" = (md5('firma:' || u."id"))::uuid::text,
    "firmaRol" = 'sahip'
WHERE u."firmaId" IS NULL;

-- 3) Kullaniciya ait satirlari kullanicinin firmasina tasi (atama, goc degil)
UPDATE "EslesmeHafizasi" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "TerminologyAlias" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "BrandMaterialType" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "UserBrandLibrary" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "UserSubscription" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "UserLibrary" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "LibraryList" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "Quote" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "QuoteFormat" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;
UPDATE "LaborFirm" t SET "firmaId" = u."firmaId"
  FROM "User" u WHERE t."userId" = u."id" AND t."firmaId" IS NULL AND u."firmaId" IS NOT NULL;

-- 4) ProductIndex: ownerUserId'nin firma ikizi (ownerUserId NULL = havuz, dokunulmaz)
UPDATE "ProductIndex" t SET "ownerFirmaId" = u."firmaId"
  FROM "User" u WHERE t."ownerUserId" = u."id" AND t."ownerFirmaId" IS NULL AND u."firmaId" IS NOT NULL;
