-- PAKET DEGISIMI (23.09.2026 — Emre karari, yonetici paneli turu A1)
--
-- Emre: "modeli yukseltip dusurebilmeli ... paket degisince odeme de ona
-- gore olacak." Karar: YUKSELTME → ozellikler HEMEN, ucret DONEM SONUNDA.
-- DUSURME (ve yatay gecis) → ozellik de ucret de DONEM SONUNDA. iyzico'ya
-- her iki yonde `NEXT_PERIOD` gider: `NOW` kist hesap yapmaz, cakisan sureyi
-- iki kez cektirir (docs/RAPOR_ADIM0_iyzico_Sandbox.md, 20.08 olcumu).
--
-- Uc alan:
--   planliPaketSurumuId — donem sonunda gecilecek paket (yalniz dusurme/yatay)
--   paketGecisTarihi    — iyzico'daki yeni planin basladigi an; DOLU oldukca
--                         degisim kilitli (yeni ucun ilk tahsilatina kadar)
--   odenenPaketSurumuId — hemen uygulanan yukseltmede ODENMIS paket; yeni
--                         ucret baslamadan iptal gelirse etkin paket buna doner
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Iki alan da NULL baslar; bu
-- migration tek basina hicbir firmanin paketini, erisimini ya da tahsilatini
-- DEGISTIRMEZ. `paketSurumuId` iliskisine verilen AD (AbonelikPaketi) Prisma
-- duzeyindedir, veritabaninda karsiligi yoktur (`prisma migrate diff` ile
-- olculdu: mevcut yabanci anahtar icin SQL uretilmedi).
--
-- FK `ON DELETE SET NULL`: PaketSurumu satirlari silinmez (fiyat donmus
-- kayittir), ama silinirse planli gecis sessizce bosalir — erisim bozulmaz.

-- AlterTable
ALTER TABLE "Abonelik" ADD COLUMN     "odenenPaketSurumuId" TEXT,
ADD COLUMN     "paketGecisTarihi" TIMESTAMP(3),
ADD COLUMN     "planliPaketSurumuId" TEXT;

-- CreateIndex
CREATE INDEX "Abonelik_paketGecisTarihi_idx" ON "Abonelik"("paketGecisTarihi");

-- AddForeignKey
ALTER TABLE "Abonelik" ADD CONSTRAINT "Abonelik_planliPaketSurumuId_fkey" FOREIGN KEY ("planliPaketSurumuId") REFERENCES "PaketSurumu"("id") ON DELETE SET NULL ON UPDATE CASCADE;
