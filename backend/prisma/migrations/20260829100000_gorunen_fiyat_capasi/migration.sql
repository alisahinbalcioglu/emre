-- AlterTable
ALTER TABLE "PaketSurumu" ADD COLUMN     "kurDegeri" DECIMAL(12,4),
ADD COLUMN     "kurTarihi" TIMESTAMP(3),
ADD COLUMN     "referansParaBirimi" TEXT,
ADD COLUMN     "referansTutar" DECIMAL(12,2);

