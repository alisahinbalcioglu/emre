-- SEMA SENKRONU 2 (28.08.2026) — migration zincirini GERCEK sema ile hizalar.
--
-- OLCULEN SORUN: 27.04'teki sync_full_schema'dan bu yana sema yine
-- `prisma db push` ile ilerlemis, migration zinciri geride kalmis. PGlite
-- (PG16 WASM) uzerinde zincir SIFIRDAN kosulup hedef sema ile karsilastirildi:
--   EKSIK tablo 8 · kolon 52 · indeks 21 · kisit 9 · enum 0
--   FAZLA kolon 0 · tip/null/varsayilan farki 0 → hedef, zincirin STRICT USTKUMESI,
--   yani bu dosya YALNIZ EKLER; hicbir veri/kolon degistirmez ya da dusurmez.
--
-- CANLIDA ETKISI: canli DB bu tablolari db push ile ZATEN aldi; her ifade
-- IF NOT EXISTS / DO-block ile sarili oldugu icin canlida NO-OP'tur. Onemi:
-- bundan sonra SIFIRDAN kurulan her DB (yedekten donus, staging, yerel gelistirme)
-- ayni semayi uretir ve bir sonraki migration'in (firma_modeli) ALTER'lari tutar.
-- Bu dosya olmadan firma_modeli temiz bir DB'de "relation does not exist" ile PATLAR
-- (olculdu: EslesmeHafizasi).
--
-- GOVDE URETILDI, ELLE YAZILMADI: her ifade `prisma migrate diff --from-empty`
-- ciktisindan BIREBIR kesilmistir; uzerine yalnizca idempotens sargisi eklendi.

-- --- Eksik tablolar ---
CREATE TABLE IF NOT EXISTS "EslesmeHafizasi" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imza" TEXT NOT NULL,
    "secilenAd" TEXT NOT NULL,
    "secimSayisi" INTEGER NOT NULL DEFAULT 1,
    "sonSecimTarihi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EslesmeHafizasi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TerminologyAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "alias" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "impliedType" TEXT,
    "sizeClass" TEXT,
    "stripTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminologyAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrandMaterialType" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "pattern" TEXT NOT NULL,
    "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizeClass" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandMaterialType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductIndex" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "priceListId" TEXT,
    "ownerUserId" TEXT,
    "kategori" TEXT,
    "ad" TEXT NOT NULL,
    "cins" TEXT,
    "baglanti" TEXT,
    "capRaw" TEXT,
    "boyMm" DOUBLE PRECISION,
    "birim" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "urunKodu" TEXT,
    "not" TEXT,
    "sheetName" TEXT,
    "sourceRow" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "extra" JSONB,
    "adSlug" TEXT NOT NULL,
    "adBucket" TEXT NOT NULL,
    "adTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cinsNorm" TEXT,
    "cinsTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "baglantiNorm" TEXT,
    "baglantiTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizeClass" TEXT NOT NULL DEFAULT 'unknown',
    "malzemeler" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aileZayif" BOOLEAN NOT NULL DEFAULT false,
    "capTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capNorm" TEXT,
    "boyTag" TEXT,
    "displayName" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "indexVersion" INTEGER NOT NULL DEFAULT 1,
    "belirsiz" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductIndex_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LibraryList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuoteFormat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "mapping" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteFormat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuoteExport" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rev" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "xlsxBytes" BYTEA NOT NULL,
    "overridesSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteExport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Translation" (
    "id" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "kaynak" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- --- Mevcut tablolarda eksik kolonlar ---
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "kategori" TEXT;
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "cins" TEXT;
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "cap" TEXT;
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "adRaw" TEXT;
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "birimRaw" TEXT;
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MaterialPrice" ADD COLUMN IF NOT EXISTS "extra" JSONB;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "kategori" TEXT;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "cins" TEXT;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "cap" TEXT;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "adRaw" TEXT;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "productIndexId" TEXT;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "libraryListId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "quoteNo" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "rev" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "displayCurrency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "displayRate" DOUBLE PRECISION;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "displayRateDate" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "displayLanguage" TEXT NOT NULL DEFAULT 'tr';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "musteri" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "proje" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "hazirlayan" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "gecerlilik" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "formatId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "exportOverrides" JSONB;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "cins" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "baglanti" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "capRaw" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "boyMm" DOUBLE PRECISION;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "not" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "adSlug" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "adBucket" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "adTokens" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "cinsNorm" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "cinsTokens" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "baglantiNorm" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "baglantiTokens" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "sizeClass" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "malzemeler" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "aileZayif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "capTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "capNorm" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "boyTag" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "indexVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LaborItem" ADD COLUMN IF NOT EXISTS "belirsiz" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LaborPrice" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "AiUsageLog" ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageLog" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0;

-- --- Eksik indeksler ---
CREATE UNIQUE INDEX IF NOT EXISTS "EslesmeHafizasi_userId_imza_key" ON "EslesmeHafizasi"("userId", "imza");
CREATE INDEX IF NOT EXISTS "TerminologyAlias_userId_idx" ON "TerminologyAlias"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TerminologyAlias_userId_alias_key" ON "TerminologyAlias"("userId", "alias");
CREATE INDEX IF NOT EXISTS "BrandMaterialType_userId_idx" ON "BrandMaterialType"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "BrandMaterialType_userId_pattern_key" ON "BrandMaterialType"("userId", "pattern");
CREATE INDEX IF NOT EXISTS "ProductIndex_brandId_adSlug_idx" ON "ProductIndex"("brandId", "adSlug");
CREATE INDEX IF NOT EXISTS "ProductIndex_adSlug_adBucket_idx" ON "ProductIndex"("adSlug", "adBucket");
CREATE INDEX IF NOT EXISTS "ProductIndex_urunKodu_idx" ON "ProductIndex"("urunKodu");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductIndex_priceListId_rowKey_key" ON "ProductIndex"("priceListId", "rowKey");
CREATE INDEX IF NOT EXISTS "UserLibrary_userId_brandId_idx" ON "UserLibrary"("userId", "brandId");
CREATE INDEX IF NOT EXISTS "UserLibrary_productIndexId_idx" ON "UserLibrary"("productIndexId");
CREATE INDEX IF NOT EXISTS "UserLibrary_libraryListId_idx" ON "UserLibrary"("libraryListId");
CREATE INDEX IF NOT EXISTS "LibraryList_userId_brandId_idx" ON "LibraryList"("userId", "brandId");
CREATE INDEX IF NOT EXISTS "Quote_userId_idx" ON "Quote"("userId");
CREATE INDEX IF NOT EXISTS "Quote_userId_createdAt_idx" ON "Quote"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuoteFormat_userId_idx" ON "QuoteFormat"("userId");
CREATE INDEX IF NOT EXISTS "QuoteExport_quoteId_idx" ON "QuoteExport"("quoteId");
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteExport_quoteId_rev_key" ON "QuoteExport"("quoteId", "rev");
CREATE INDEX IF NOT EXISTS "LaborItem_adSlug_idx" ON "LaborItem"("adSlug");
CREATE INDEX IF NOT EXISTS "Translation_targetLang_idx" ON "Translation"("targetLang");
CREATE UNIQUE INDEX IF NOT EXISTS "Translation_sourceText_targetLang_key" ON "Translation"("sourceText", "targetLang");

-- --- Eksik kisitlar (FK) ---
DO $$ BEGIN
    ALTER TABLE "ProductIndex" ADD CONSTRAINT "ProductIndex_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "ProductIndex" ADD CONSTRAINT "ProductIndex_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "UserLibrary" ADD CONSTRAINT "UserLibrary_productIndexId_fkey" FOREIGN KEY ("productIndexId") REFERENCES "ProductIndex"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "UserLibrary" ADD CONSTRAINT "UserLibrary_libraryListId_fkey" FOREIGN KEY ("libraryListId") REFERENCES "LibraryList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "LibraryList" ADD CONSTRAINT "LibraryList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "LibraryList" ADD CONSTRAINT "LibraryList_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "Quote" ADD CONSTRAINT "Quote_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "QuoteFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "QuoteFormat" ADD CONSTRAINT "QuoteFormat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE "QuoteExport" ADD CONSTRAINT "QuoteExport_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
