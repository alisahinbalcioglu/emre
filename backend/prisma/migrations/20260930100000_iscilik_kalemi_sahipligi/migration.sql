-- ═══════════════════════════════════════════════════════════════════════════
--  ISCILIK KALEMI SAHIPLIGI (30.09.2026 — Paket 1 / C2)
-- ═══════════════════════════════════════════════════════════════════════════
--  LaborItem kuresel katalogdu (sahip kolonu YOK). Kiraci yuklemesi de bu
--  tabloya `isGlobal = true` kalem aciyordu (ad + kiracinin birim fiyati) ve
--  GET /labor filtresizdi: her pro kiraci baskasinin kalemini goruyordu.
--  Yeni kolon: NULL = YONETICI KATALOGU · dolu = o kiracinin kalemi
--  (ProductIndex.ownerFirmaId'nin ikizi; FK yok). Kural yeri:
--  `src/ozellik/kutuphane/labor/iscilik-kalemi-kapsami.ts`.

ALTER TABLE "LaborItem" ADD COLUMN "ownerFirmaId" TEXT;

CREATE INDEX "LaborItem_ownerFirmaId_idx" ON "LaborItem"("ownerFirmaId");

-- ═══ GERIYE DONUK DOLDURMA (kiraci kalemleri) ═══
-- Kalem KIRACININ sayilir, ancak:
--   · fiyat satirlarinin HEPSI tek kiracinin (LaborFirm.firmaId, bos degil)
--     iscilik firmalarinda, VE
--   · kalem, o kiracinin ILK fiyat satiriyla en cok 120 sn arayla olusmus:
--     yukleme kalemi acip fiyatini hemen yazar; yonetici kalemi (POST /labor)
--     fiyatsiz dogar, kiraciya ancak SONRA baglanir.
-- Geri kalan her satir (fiyatsiz, cok kiracili, sonradan baglanmis)
-- KATALOGDA kalir. SILME YOK: yalniz bu iki alan yazilir. Ikinci kosum hicbir
-- seyi degistirmez (dolu sahip yeniden yazilmaz).
UPDATE "LaborItem" AS li
   SET "ownerFirmaId" = s."kiraci",
       "isGlobal" = false
  FROM (
        SELECT lp."laborItemId",
               min(lf."firmaId") AS "kiraci",
               count(DISTINCT lf."firmaId") AS "kiraciSayisi",
               bool_and(lf."firmaId" IS NOT NULL) AS "hepsiKiracili",
               min(lp."createdAt") AS "ilkFiyat"
          FROM "LaborPrice" lp
          JOIN "LaborFirm" lf ON lf."id" = lp."firmaId"
         GROUP BY lp."laborItemId"
       ) AS s
 WHERE li."id" = s."laborItemId"
   AND li."ownerFirmaId" IS NULL
   AND s."kiraciSayisi" = 1
   AND s."hepsiKiracili"
   AND abs(extract(epoch FROM s."ilkFiyat" - li."createdAt")) <= 120;

-- Deploy gunlugune ozet (yalniz sayi — ad/fiyat YAZILMAZ).
DO $$
DECLARE
  kiraci_kalemi int;
  katalog_fiyatsiz int;
  katalog_fiyatli int;
BEGIN
  SELECT count(*) INTO kiraci_kalemi FROM "LaborItem" WHERE "ownerFirmaId" IS NOT NULL;
  SELECT count(*) INTO katalog_fiyatsiz FROM "LaborItem" li
   WHERE li."ownerFirmaId" IS NULL AND NOT EXISTS (SELECT 1 FROM "LaborPrice" lp WHERE lp."laborItemId" = li."id");
  SELECT count(*) INTO katalog_fiyatli FROM "LaborItem" li
   WHERE li."ownerFirmaId" IS NULL AND EXISTS (SELECT 1 FROM "LaborPrice" lp WHERE lp."laborItemId" = li."id");
  RAISE NOTICE 'LaborItem sahipligi: % kiraci kalemi · % katalog (fiyatsiz) · % katalog (kiraci fiyati bagli)',
    kiraci_kalemi, katalog_fiyatsiz, katalog_fiyatli;
END $$;
