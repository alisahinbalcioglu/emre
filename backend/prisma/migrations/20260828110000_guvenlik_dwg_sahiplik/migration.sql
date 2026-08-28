-- CreateTable
CREATE TABLE "DwgDosya" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "olusturanId" TEXT NOT NULL,
    "dosyaAdi" TEXT,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DwgDosya_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DwgDosya_fileId_key" ON "DwgDosya"("fileId");

-- CreateIndex
CREATE INDEX "DwgDosya_firmaId_olusturuldu_idx" ON "DwgDosya"("firmaId", "olusturuldu");

