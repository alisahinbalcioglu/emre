-- ═════════════════════════════════════════════════════════════════
-- Sync full schema with production DB
-- Schema'ya zaman icinde eklenmis ama migration olarak commit edilmemis
-- TUM degisiklikleri (8 yeni tablo, 4 yeni enum, eksik column'lar, FK,
-- index'ler) idempotent olarak uygular. Mevcut tablolar/enum'lar/index'ler
-- "IF NOT EXISTS" / EXCEPTION wrap ile atlanir, sadece eksikler eklenir.
-- ═════════════════════════════════════════════════════════════════

-- ─── Eksik enum'lar ───────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "Tier" AS ENUM ('core', 'pro', 'suite');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "PackageLevel" AS ENUM ('core', 'pro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "SubscriptionScope" AS ENUM ('mechanical', 'electrical', 'mep');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "Discipline" AS ENUM ('mechanical', 'electrical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Mevcut tablolara eksik column'lar ───────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tier" "Tier" NOT NULL DEFAULT 'core';

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "discipline" TEXT NOT NULL DEFAULT 'mechanical';

ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "listPrice" DOUBLE PRECISION;
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "normalizedName" TEXT;
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "materialType" TEXT;

ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "priceListId" TEXT;

ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "listPrice" DOUBLE PRECISION;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "sourcePriceListId" TEXT;

ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "sheets" JSONB;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "originalFile" BYTEA;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "originalName" TEXT;

ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'Adet';
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "laborFirmaId" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "materialUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "materialTotalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "materialMargin" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "laborUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "laborTotalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "laborMargin" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "totalUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- QuoteItem'da var olan kolonlar default eksik olabilir, idempotent guncelle
ALTER TABLE "QuoteItem" ALTER COLUMN "unitPrice" SET DEFAULT 0;
ALTER TABLE "QuoteItem" ALTER COLUMN "netPrice" SET DEFAULT 0;
ALTER TABLE "QuoteItem" ALTER COLUMN "finalPrice" SET DEFAULT 0;

-- ─── Yeni tablolar ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserBrandLibrary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sheets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserBrandLibrary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "PackageLevel" NOT NULL,
    "scope" "SubscriptionScope" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LaborItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "normalizedName" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaborItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LaborFirm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "LaborFirm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LaborPriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sheets" JSONB,
    CONSTRAINT "LaborPriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LaborPrice" (
    "id" TEXT NOT NULL,
    "laborItemId" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "priceListId" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaborPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- ─── Index'ler (idempotent) ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS "UserBrandLibrary_userId_idx" ON "UserBrandLibrary"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBrandLibrary_userId_brandId_key" ON "UserBrandLibrary"("userId", "brandId");

CREATE INDEX IF NOT EXISTS "UserSubscription_userId_idx" ON "UserSubscription"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSubscription_userId_level_scope_key" ON "UserSubscription"("userId", "level", "scope");

CREATE INDEX IF NOT EXISTS "Material_materialType_idx" ON "Material"("materialType");

-- MaterialPrice unique constraint init'te (materialId, brandId), schema'da (materialId, brandId, priceListId)
-- Once eskisini drop et (varsa), sonra yeniyi ekle (yoksa)
ALTER TABLE "MaterialPrice" DROP CONSTRAINT IF EXISTS "MaterialPrice_materialId_brandId_key";
DROP INDEX IF EXISTS "MaterialPrice_materialId_brandId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialPrice_materialId_brandId_priceListId_key" ON "MaterialPrice"("materialId", "brandId", "priceListId");

CREATE INDEX IF NOT EXISTS "LaborItem_discipline_idx" ON "LaborItem"("discipline");
CREATE INDEX IF NOT EXISTS "LaborItem_name_idx" ON "LaborItem"("name");
CREATE INDEX IF NOT EXISTS "LaborItem_tags_idx" ON "LaborItem" USING GIN ("tags");

CREATE INDEX IF NOT EXISTS "LaborFirm_userId_idx" ON "LaborFirm"("userId");
CREATE INDEX IF NOT EXISTS "LaborFirm_discipline_idx" ON "LaborFirm"("discipline");
CREATE UNIQUE INDEX IF NOT EXISTS "LaborFirm_userId_name_key" ON "LaborFirm"("userId", "name");

CREATE INDEX IF NOT EXISTS "LaborPrice_firmaId_idx" ON "LaborPrice"("firmaId");
CREATE INDEX IF NOT EXISTS "LaborPrice_laborItemId_idx" ON "LaborPrice"("laborItemId");
CREATE UNIQUE INDEX IF NOT EXISTS "LaborPrice_laborItemId_firmaId_priceListId_key" ON "LaborPrice"("laborItemId", "firmaId", "priceListId");

CREATE INDEX IF NOT EXISTS "AiUsageLog_feature_idx" ON "AiUsageLog"("feature");
CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- ─── Foreign Key'ler (idempotent — DO BEGIN ... EXCEPTION) ──────
DO $$ BEGIN
    ALTER TABLE "UserBrandLibrary" ADD CONSTRAINT "UserBrandLibrary_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "UserBrandLibrary" ADD CONSTRAINT "UserBrandLibrary_brandId_fkey"
        FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_brandId_fkey"
        FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_priceListId_fkey"
        FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "UserLibrary" ADD CONSTRAINT "UserLibrary_sourcePriceListId_fkey"
        FOREIGN KEY ("sourcePriceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_laborFirmaId_fkey"
        FOREIGN KEY ("laborFirmaId") REFERENCES "LaborFirm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LaborFirm" ADD CONSTRAINT "LaborFirm_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LaborPriceList" ADD CONSTRAINT "LaborPriceList_firmaId_fkey"
        FOREIGN KEY ("firmaId") REFERENCES "LaborFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LaborPrice" ADD CONSTRAINT "LaborPrice_laborItemId_fkey"
        FOREIGN KEY ("laborItemId") REFERENCES "LaborItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LaborPrice" ADD CONSTRAINT "LaborPrice_firmaId_fkey"
        FOREIGN KEY ("firmaId") REFERENCES "LaborFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LaborPrice" ADD CONSTRAINT "LaborPrice_priceListId_fkey"
        FOREIGN KEY ("priceListId") REFERENCES "LaborPriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
