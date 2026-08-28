-- KUTUPHANE FIRMAYA GECIYOR (ADIM 1, 28.08.2026)
--
-- Iki degisiklik:
--   1) PriceList.ownerFirmaId — kisisel liste sahipliginin FIRMA ikizi.
--      Kutuphane akisinin actigi listeler (createManualBrand / addRowsToBrandList)
--      bugun ownerUserId tasiyor; ayni firmanin baska uyesi de okuyabilmeli.
--   2) UserBrandLibrary tekilligi KISI'den FIRMA'ya.
--      Tekillik kisi bazli kalsaydi ayni firmanin iki uyesi AYNI marka icin iki
--      sheet kaydi acar, firma gorunumu markayi CIFT gosterirdi.
--
-- ⚠ TEK RISKLI IFADE, olculdu: yeni UNIQUE indeks. Cakisma icin ayni
-- (firmaId, brandId) ikilisinden iki satir gerekir; her firmada TEK uye var ve
-- eski tekillik (userId, brandId) idi → 1:1 esleme, cakisma IMKANSIZ. firmaId'si
-- NULL kalan satir varsa da Postgres'te her NULL AYRI sayilir, catismaz.
-- Yine de cakisma cikarsa migration LOUD patlar (sessizce atlamaz) — dogru olan bu.

-- 1) Kisisel liste sahipliginin firma ikizi
ALTER TABLE "PriceList" ADD COLUMN IF NOT EXISTS "ownerFirmaId" TEXT;

-- 2) Backfill: listeyi acan kullanicinin firmasi
UPDATE "PriceList" pl
SET "ownerFirmaId" = u."firmaId"
FROM "User" u
WHERE pl."ownerUserId" = u."id"
  AND pl."ownerFirmaId" IS NULL
  AND u."firmaId" IS NOT NULL;

-- 3) Tekillik KISI -> FIRMA
DROP INDEX IF EXISTS "UserBrandLibrary_userId_brandId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UserBrandLibrary_firmaId_brandId_key"
  ON "UserBrandLibrary"("firmaId", "brandId");

-- 4) Suzgec indeksi
CREATE INDEX IF NOT EXISTS "PriceList_ownerFirmaId_idx" ON "PriceList"("ownerFirmaId");
