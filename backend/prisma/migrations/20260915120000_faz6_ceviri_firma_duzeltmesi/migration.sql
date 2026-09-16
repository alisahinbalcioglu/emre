-- CreateTable
CREATE TABLE "CeviriDuzeltmesi" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "hedefDil" TEXT NOT NULL DEFAULT 'en',
    "kaynakMetin" TEXT NOT NULL,
    "kaynakOzeti" TEXT NOT NULL,
    "ceviriMetni" TEXT NOT NULL,
    "olusturanId" TEXT NOT NULL,
    "guncelleyenId" TEXT NOT NULL,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellendi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeviriDuzeltmesi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeviriDuzeltmeOlayi" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kullaniciEposta" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "duzeltmeId" TEXT,
    "hedefDil" TEXT NOT NULL,
    "kaynakMetin" TEXT NOT NULL,
    "oncekiDeger" TEXT,
    "yeniDeger" TEXT,
    "ortakDeger" TEXT,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeviriDuzeltmeOlayi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CeviriDuzeltmesi_firmaId_guncellendi_idx" ON "CeviriDuzeltmesi"("firmaId", "guncellendi");

-- CreateIndex
CREATE UNIQUE INDEX "CeviriDuzeltmesi_firmaId_hedefDil_kaynakOzeti_key" ON "CeviriDuzeltmesi"("firmaId", "hedefDil", "kaynakOzeti");

-- CreateIndex
CREATE INDEX "CeviriDuzeltmeOlayi_firmaId_olusturuldu_idx" ON "CeviriDuzeltmeOlayi"("firmaId", "olusturuldu");

-- CreateIndex
CREATE INDEX "CeviriDuzeltmeOlayi_userId_olusturuldu_idx" ON "CeviriDuzeltmeOlayi"("userId", "olusturuldu");

