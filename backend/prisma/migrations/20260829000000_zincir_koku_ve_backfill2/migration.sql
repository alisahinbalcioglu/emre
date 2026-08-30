-- AlterTable
ALTER TABLE "Abonelik" ADD COLUMN     "iyzicoKokKodu" TEXT;

-- CreateIndex
CREATE INDEX "Abonelik_iyzicoKokKodu_idx" ON "Abonelik"("iyzicoKokKodu");


-- ═══════════════════════════════════════════════════════════════════════════
--  1) ZINCIR KOKU — mevcut abonelikler icin
-- ═══════════════════════════════════════════════════════════════════════════
-- Bugune kadar acilmis aboneliklerde hic plan degisimi olmadi, dolayisiyla
-- mevcut kod ZATEN kokUn kendisidir. Geriye donuk dolduruyoruz ki zincir
-- cozucunun 2. kademesi (kok ile arama) ilk gunden calissin.
UPDATE "Abonelik"
   SET "iyzicoKokKodu" = "iyzicoAbonelikKodu"
 WHERE "iyzicoKokKodu" IS NULL
   AND "iyzicoAbonelikKodu" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
--  2) IKINCI BACKFILL — 28.08 backfill'i ile YAZMA KOPRUSU arasindaki pencere
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠ NEDEN GEREKLI (CANLIDA OLCULDU, 29.08 — scripts/firma-olcum.sh):
--      K0.3 EslesmeHafizasi : 4 / 198 satirda firmaId BOS
--      K0.3 TerminologyAlias: 0 / 262
--
--  Bu 4 satir, 28.08'deki ilk backfill (20260828010000) ile yazma koprusu
--  commit'i (6a5ad03) ARASINDAKI pencerede ogrenildi: backfill onlari
--  goremezdi (henuz yoktular), kopru de yoktu (firmaId yazmiyordu).
--
--  Bugun ZARARSIZ gorunuyorlar cunku hafiza OKUMASI hala kisi bazli
--  (`@@unique([userId, imza])`). Ama okuma ileride firmaya donerse bu 4
--  satir SESSIZCE gorunmez olur — kullanicinin ogrettigi eslestirmeler
--  kaybolur ve kimse fark etmez. Ucuz olan simdi kapatmaktir.
--
--  ⚠ IDEMPOTENT ve DAR: yalnizca firmaId'si BOS olan satirlara dokunur ve
--  yalnizca kullanicinin firmasi BELLI ise yazar. Dolu bir firmaId ASLA
--  ezilmez. Tekrar kosarsa hicbir satiri etkilemez.
--  20260828010000_firma_backfill'in 3. adimindaki UPDATE'lerin aynisi.

UPDATE "EslesmeHafizasi" t
   SET "firmaId" = u."firmaId"
  FROM "User" u
 WHERE u."id" = t."userId"
   AND t."firmaId" IS NULL
   AND u."firmaId" IS NOT NULL;

UPDATE "TerminologyAlias" t
   SET "firmaId" = u."firmaId"
  FROM "User" u
 WHERE u."id" = t."userId"
   AND t."firmaId" IS NULL
   AND u."firmaId" IS NOT NULL;

-- UserLibrary: canlida K0.2 = 0 olctuk (26.229/26.229 dolu), yani bu UPDATE
-- bugun NO-OP. Yine de yaziliyor — backfill'in kapsami veriye degil KURALA
-- bagli olmali; yarin yeni bir satir NULL dogarsa buradan iyilesir.
UPDATE "UserLibrary" t
   SET "firmaId" = u."firmaId"
  FROM "User" u
 WHERE u."id" = t."userId"
   AND t."firmaId" IS NULL
   AND u."firmaId" IS NOT NULL;

-- Kalan bos satir varsa deploy gunlugune yaz (sessiz kalmasin).
DO $$
DECLARE
  h INT; a INT; l INT;
BEGIN
  SELECT count(*) INTO h FROM "EslesmeHafizasi"  WHERE "firmaId" IS NULL;
  SELECT count(*) INTO a FROM "TerminologyAlias" WHERE "firmaId" IS NULL AND "userId" IS NOT NULL;
  SELECT count(*) INTO l FROM "UserLibrary"      WHERE "firmaId" IS NULL;
  RAISE NOTICE 'BACKFILL2 kalan bos: hafiza=% alias=% kutuphane=%', h, a, l;
  -- ⚠ SIFIR OLMAYABILIR ve bu BEKLENEN olabilir: firmasi olmayan bir
  -- kullanicinin satiri doldurulamaz (u."firmaId" IS NOT NULL sarti).
  -- Canlida K0.1 = 0 olctugu icin bugun boyle bir satir YOK.
END $$;
