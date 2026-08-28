-- FIRMA MODELI (ADIM 1, 28.08.2026) — GOREV_Odeme_Altyapisi_1.md
-- Hesap artik KISI degil FIRMA olacak: teklifler, kutuphane, iskontolar,
-- iscilik firmalari ve ABONELIK firmaya ait. Kisiye ait olan: kimlik + yetki.
--
-- BU MIGRATION SALT EKLEMEDIR (additive): Firma tablosu + FirmaRol enum +
-- 12 tabloya NULLABLE kolon. Hicbir sorgu bu kolonlari HENUZ okumuyor;
-- eski kod yeni kolonlarla sorunsuz calisir, davranis DEGISMEZ. Backfill ve
-- suzgec gecisi ayri commit'lerde gelir.
--
-- Container boot'u `npx prisma migrate deploy` kosar (backend/Dockerfile:55),
-- yani bu dosya deploy sirasinda OTOMATIK uygulanir — yeni Prisma client
-- trafige cikmadan ONCE kolonlar hazir olur (P2022 penceresi yok).
--
-- SQL govdesi `prisma migrate diff` ciktisidir (elle tahmin DEGIL), sema ile
-- birebir ortusur; ileride `migrate dev` drift gormez. Uzerine yalnizca
-- IDEMPOTENS sargilari eklendi (IF NOT EXISTS / DO-block): yarim kalan bir
-- uygulama ya da elle kosulmus bir `db push` durumunda tekrar guvenli.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FirmaRol" AS ENUM ('sahip', 'uye');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Firma" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Firma_pkey" PRIMARY KEY ("id")
);

-- AlterTable: kisi -> firma uyeligi (firmaRol varsayilani 'sahip', cunku
-- mevcut her hesap kendi firmasinin sahibi olacak; davetle gelen uyeler 'uye').
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firmaRol" "FirmaRol" NOT NULL DEFAULT 'sahip';

-- AlterTable: gecis donemi NULLABLE firmaId'ler (null = henuz atanmamis)
ALTER TABLE "EslesmeHafizasi"  ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "TerminologyAlias" ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "BrandMaterialType" ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "UserBrandLibrary" ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "UserLibrary"      ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "LibraryList"      ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "Quote"            ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "QuoteFormat"      ADD COLUMN IF NOT EXISTS "firmaId" TEXT;
ALTER TABLE "LaborFirm"        ADD COLUMN IF NOT EXISTS "firmaId" TEXT;

-- AlterTable: ProductIndex.ownerUserId'nin firma ikizi (null = havuz satiri)
ALTER TABLE "ProductIndex" ADD COLUMN IF NOT EXISTS "ownerFirmaId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EslesmeHafizasi_firmaId_idx"  ON "EslesmeHafizasi"("firmaId");
CREATE INDEX IF NOT EXISTS "TerminologyAlias_firmaId_idx" ON "TerminologyAlias"("firmaId");
CREATE INDEX IF NOT EXISTS "BrandMaterialType_firmaId_idx" ON "BrandMaterialType"("firmaId");
CREATE INDEX IF NOT EXISTS "UserBrandLibrary_firmaId_idx" ON "UserBrandLibrary"("firmaId");
CREATE INDEX IF NOT EXISTS "UserSubscription_firmaId_idx" ON "UserSubscription"("firmaId");
CREATE INDEX IF NOT EXISTS "UserLibrary_firmaId_idx"      ON "UserLibrary"("firmaId");
CREATE INDEX IF NOT EXISTS "LibraryList_firmaId_idx"      ON "LibraryList"("firmaId");
CREATE INDEX IF NOT EXISTS "Quote_firmaId_idx"            ON "Quote"("firmaId");
CREATE INDEX IF NOT EXISTS "QuoteFormat_firmaId_idx"      ON "QuoteFormat"("firmaId");
CREATE INDEX IF NOT EXISTS "LaborFirm_firmaId_idx"        ON "LaborFirm"("firmaId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_firmaId_fkey"
    FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
