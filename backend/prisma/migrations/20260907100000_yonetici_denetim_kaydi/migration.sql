-- CreateTable
CREATE TABLE "YoneticiOlayi" (
    "id" TEXT NOT NULL,
    "yoneticiId" TEXT NOT NULL,
    "yoneticiEpsta" TEXT NOT NULL,
    "hedefKullaniciId" TEXT,
    "hedefEposta" TEXT,
    "tip" TEXT NOT NULL,
    "oncekiDeger" TEXT,
    "yeniDeger" TEXT,
    "veri" JSONB,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YoneticiOlayi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "YoneticiOlayi_hedefKullaniciId_olusturuldu_idx" ON "YoneticiOlayi"("hedefKullaniciId", "olusturuldu");

-- CreateIndex
CREATE INDEX "YoneticiOlayi_yoneticiId_olusturuldu_idx" ON "YoneticiOlayi"("yoneticiId", "olusturuldu");

-- CreateIndex
CREATE INDEX "YoneticiOlayi_olusturuldu_idx" ON "YoneticiOlayi"("olusturuldu");

-- AlterTable: yumusak silme (2.3)
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
