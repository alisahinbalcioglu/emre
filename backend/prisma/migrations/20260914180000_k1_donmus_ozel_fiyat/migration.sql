-- ════════════════════════════════════════════════════════════════════════════
-- K1 MEVCUT VERI — DONMUS OZEL FIYAT TEMIZLIGI (tur 3 A4c, 14.09.2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KUSUR (eae583e ile kodda kapandi, VERIDE duruyor): kutuphane sayfasi kaydi
-- (saveBrandSheets) degismeyen satirda da customPrice = listPrice = havuz
-- fiyati yaziyordu. Havuz sonra guncellenip yeniden aktarilinca listPrice
-- yeni fiyati alir, ekran (customPrice ?? listPrice) ESKI fiyatta DONAR.
--
-- ONAYLANAN KOSUL "havuza bagli VE customPrice = listPrice" OLCULDU VE YETMEDI
-- (PGlite, gercek migration zinciri, 19 satirlik fixture): kullanicinin BILEREK
-- yazdigi fiyat da ayni kaydetme yolundan iki kolona birden yazilir (C = L =
-- 150, havuz 100). O kosul bu satiri da siler; havuz guncellenip yeniden
-- aktarilinca kullanicinin 150'si 120'ye doner.
--
-- GUVENLI KOSUL (onaylanan kumenin ALT kumesi — daha az satir, asla fazla):
--   havuza bagli  : kaynak fiyat listesi SAHIPSIZ (havuz) VE urun indeksi yok
--                   ya da sahipsiz (kisisel liste ve yetim satir DISARIDA)
--   VE C = L      : ozel fiyat liste fiyatina esit
--   VE L = havuz  : liste fiyati satirin KAYNAK havuz fiyatina esit
--                   (ProductIndex.price; legacy satirda MaterialPrice.price)
--   VE para birimi kaynakla ayni
-- Temizlik ANINDA ekran ve eslestirme tabani hicbir satirda DEGISMEZ (C = L).
-- C ≠ L olan ("ayrismis") satira DOKUNULMAZ — ekranda isaretlenir, TAHMIN YOK.
--
-- Float esitligi abs(a - b) < 0.000001 (0.1 + 0.2 ile 0.3 '=' ile esit degil).
-- deploy.sh once dogrulanmis pg_dump alir; bu migration konteyner acilirken
-- (`prisma migrate deploy`) API trafik almadan tam bir kez kosar.
-- Tablo schema.prisma'da da model: `prisma db push` semada olmayan tabloyu siler.

CREATE TABLE IF NOT EXISTS "KutuphaneOzelFiyatYedegi" (
  "userLibraryId"   TEXT NOT NULL,
  "firmaId"         TEXT,
  "eskiCustomPrice" DOUBLE PRECISION NOT NULL,
  "listPrice"       DOUBLE PRECISION NOT NULL,
  "kaynakFiyat"     DOUBLE PRECISION NOT NULL,
  "sebep"           TEXT NOT NULL,
  "temizlendi"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KutuphaneOzelFiyatYedegi_pkey" PRIMARY KEY ("userLibraryId")
);

INSERT INTO "KutuphaneOzelFiyatYedegi" ("userLibraryId", "firmaId", "eskiCustomPrice", "listPrice", "kaynakFiyat", "sebep")
SELECT ul.id, ul."firmaId", ul."customPrice", ul."listPrice", COALESCE(pi.price, mp.price), 'K1-donmus-ozel-fiyat'
  FROM "UserLibrary" ul
  JOIN "PriceList" pl ON pl.id = ul."sourcePriceListId"
  LEFT JOIN "ProductIndex" pi ON pi.id = ul."productIndexId"
  LEFT JOIN "MaterialPrice" mp ON ul."productIndexId" IS NULL
       AND mp."priceListId" = ul."sourcePriceListId" AND mp."materialId" = ul."materialId" AND mp."brandId" = ul."brandId"
 WHERE pl."ownerUserId" IS NULL AND pl."ownerFirmaId" IS NULL
   AND (ul."productIndexId" IS NULL OR (pi."ownerUserId" IS NULL AND pi."ownerFirmaId" IS NULL))
   AND ul."customPrice" IS NOT NULL AND ul."listPrice" IS NOT NULL
   AND abs(ul."customPrice" - ul."listPrice") < 0.000001
   AND COALESCE(pi.price, mp.price) IS NOT NULL
   AND abs(ul."listPrice" - COALESCE(pi.price, mp.price)) < 0.000001
   AND ul."currency" = COALESCE(pi.currency, mp.currency)
ON CONFLICT ("userLibraryId") DO NOTHING;

UPDATE "UserLibrary" ul
   SET "customPrice" = NULL
  FROM "KutuphaneOzelFiyatYedegi" y
 WHERE y."userLibraryId" = ul.id
   AND y."sebep" = 'K1-donmus-ozel-fiyat'
   AND ul."customPrice" IS NOT NULL
   AND abs(ul."customPrice" - y."eskiCustomPrice") < 0.000001;

DO $$
DECLARE temizlenen INT; ayrismis INT;
BEGIN
  SELECT count(*) INTO temizlenen FROM "KutuphaneOzelFiyatYedegi" WHERE "sebep" = 'K1-donmus-ozel-fiyat';
  SELECT count(*) INTO ayrismis
    FROM "UserLibrary" ul
    JOIN "PriceList" pl ON pl.id = ul."sourcePriceListId"
    LEFT JOIN "ProductIndex" pi ON pi.id = ul."productIndexId"
   WHERE pl."ownerUserId" IS NULL AND pl."ownerFirmaId" IS NULL
     AND (ul."productIndexId" IS NULL OR (pi."ownerUserId" IS NULL AND pi."ownerFirmaId" IS NULL))
     AND ul."customPrice" IS NOT NULL AND ul."listPrice" IS NOT NULL
     AND NOT (abs(ul."customPrice" - ul."listPrice") < 0.000001);
  RAISE NOTICE 'K1 temizlik: yedeklenip temizlenen=% · ayrismis (ekranda isaretlenir)=%', temizlenen, ayrismis;
END $$;

-- GERI ALMA BASLANGIC (elle kosulur; migration-zinciri-test K blogu bu bloğu calistirir)
-- UPDATE "UserLibrary" ul
--    SET "customPrice" = y."eskiCustomPrice"
--   FROM "KutuphaneOzelFiyatYedegi" y
--  WHERE y."userLibraryId" = ul.id
--    AND y."sebep" = 'K1-donmus-ozel-fiyat'
--    AND ul."customPrice" IS NULL;
-- GERI ALMA BITIS
-- Yalniz hala NULL olan satiri yazar: temizlikten sonra girilmis fiyati EZMEZ.
