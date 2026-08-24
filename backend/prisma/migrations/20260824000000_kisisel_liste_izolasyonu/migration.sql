-- KISISEL LISTE/MARKA IZOLASYONU (24.08.2026)
-- Kutuphane "Marka Ekle" / "satir ekle" akislarinin actigi Brand/PriceList
-- kayitlarina sahiplik alanlari. Container boot'u `prisma migrate deploy`
-- kostugu icin bu dosya deploy sirasinda OTOMATIK uygulanir — yeni kod
-- trafige cikmadan ONCE kolonlar hazir olur (P2022 penceresi yok).
--
-- IF NOT EXISTS: biri deploy'dan once elle `prisma db push` kosarsa migration
-- yine de kaydedilir, cakismaz. Iki kolon da additive (nullable / default'lu)
-- oldugu icin ESKI kod yeni kolonlarla sorunsuz calisir.

-- Brand: false = kullanicinin kisisel kapsayicisi (havuz/admin listelemez)
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT true;

-- PriceList: null = havuz listesi; dolu = kutuphane akisinin actigi kisisel liste
ALTER TABLE "PriceList" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
