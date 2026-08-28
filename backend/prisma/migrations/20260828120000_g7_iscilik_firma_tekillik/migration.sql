-- DropIndex
DROP INDEX "LaborFirm_userId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "LaborFirm_firmaId_name_key" ON "LaborFirm"("firmaId", "name");

