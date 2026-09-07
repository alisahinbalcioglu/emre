-- AlterTable: AI kullanim kaydina ATIF alanlari (2.6)
-- Ikisi de NULLABLE: mevcut satirlarin sahibi bilinmiyor.
ALTER TABLE "AiUsageLog" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "firmaId" TEXT;

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_firmaId_createdAt_idx" ON "AiUsageLog"("firmaId", "createdAt");
