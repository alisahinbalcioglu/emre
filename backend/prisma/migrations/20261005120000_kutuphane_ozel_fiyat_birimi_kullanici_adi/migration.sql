-- ═══════════════════════════════════════════════════════════════════════════
--  OZEL FIYATIN BIRIMI · KULLANICI AD DUZELTMESI · LISTE INDEKSI (05.10.2026 — P4b)
-- ═══════════════════════════════════════════════════════════════════════════
--  C3 (Emre karari 01.10): kutuphane ozel fiyati girildigi PARA BIRIMINDE
--  kalir. Ozel fiyatin kendi birim alani yoktu; satirin tek `currency`si
--  "Kutuphaneme Aktar" ile havuzun birimine guncellenince ozel fiyat sessizce
--  YENI birimde okunuyordu. `customPriceCurrency` ozel fiyatla birlikte
--  yazilir; okuyan `customPriceCurrency ?? currency` der (izgara P4b 2a;
--  eslestirme motoru 2b — ikisi AYNI surumde canliya cikar).
--  C7 (Emre karari 01.10): sahipli olmayan satirda ad duzeltmesi yalniz o
--  firmada gecerli → `kullaniciAdi`. Gecmis TASINMAZ: alan DOLDURULMAZ (canli
--  02.10 kirilimi: materialName ≠ havuz adi 4.873 satirin hepsi ek farki;
--  kural yalniz ACIK duzeltmeye dayanir).
--  S1 incelemesi: `LaborPrice.priceListId` indeksi — liste sorgulari ve 04.10
--  CASCADE'i bu kolonla tarar; unique (laborItemId, firmaId, priceListId)
--  icinde 3. kolon oldugu icin o indeks kullanilamaz.
--
--  DOLUM: ozel fiyatli satirda `customPriceCurrency = currency` — goc anindaki
--  YORUMU birebir korur (ekran ve teklif deploy aninda degismez). Ozel fiyatin
--  girildigi andaki birim kayitli DEGIL; en iyi tahmin budur (canli 05.10 salt
--  okuma: 21 satir, hepsi TRY). Ozel fiyatsiz satir NULL kalir. NOTICE yalniz
--  sayar (migrate deploy gunluge basmaz — dogrulama SON sorgusuyla).
--  DDL `prisma migrate diff` ciktisiyla BIREBIR (drift olmasin).
--
--  ON KOSUL (canli salt okuma, koordinator 05.10 ~10:45): iki kolon YOK ·
--  LaborPrice'ta tek basina priceListId indeksi YOK · yarim goc 0.
--
--  GERI ALMA (yalniz gerekirse, elle):
--    DROP INDEX "LaborPrice_priceListId_idx";
--    ALTER TABLE "UserLibrary" DROP COLUMN "kullaniciAdi", DROP COLUMN "customPriceCurrency";
--  ⚠ Elle uygulamak schema.prisma ve _prisma_migrations ile DRIFT yaratir;
--  kolonlara yazilmis ozel fiyat birimleri ve ad duzeltmeleri KAYBOLUR.
--  SIRA: once ESKI kod (yeni kod calisirken kolon dusurulurse her kutuphane
--  sorgusu P2022); `_prisma_migrations` satiri silinmezse sonraki deploy goc
--  uygulanmis sayar, kolon geri gelmez. EN GUVENLI geri donus: yalniz onceki
--  imaj, DDL'e dokunmadan (nullable kolonlari eski kod gormez).
--  O pencerede eski kod ozel fiyati BIRIMSIZ yazar. Yeni koda donunce onar:
--    UPDATE "UserLibrary" SET "customPriceCurrency" = "currency"
--      WHERE "customPrice" IS NOT NULL AND "customPriceCurrency" IS NULL;
--    UPDATE "UserLibrary" SET "customPriceCurrency" = NULL
--      WHERE "customPrice" IS NULL AND "customPriceCurrency" IS NOT NULL;
--  K1 geri alimi (20260914180000_k1_donmus_ozel_fiyat) bu goctan SONRA
--  kosulursa ozel fiyati birimsiz geri yazar: ardindan ilk onarimi kos.
--  Kalici geri donus: ileri yonlu yeni goc. GERI ALMA satirlari `test:migration`
--  OB'de PGlite'ta islem icinde kosulup geri alinarak dogrulanir.

-- AlterTable
ALTER TABLE "UserLibrary" ADD COLUMN     "customPriceCurrency" TEXT,
ADD COLUMN     "kullaniciAdi" TEXT;

-- Dolum (C3): ozel fiyatli satirin birimi, ozel fiyat girildigindeki satir birimi
UPDATE "UserLibrary" SET "customPriceCurrency" = "currency" WHERE "customPrice" IS NOT NULL;

DO $$
DECLARE
  dolan integer;
BEGIN
  SELECT count(*) INTO dolan FROM "UserLibrary" WHERE "customPriceCurrency" IS NOT NULL;
  RAISE NOTICE 'P4b C3: % ozel fiyatli kutuphane satirinin birimi donduruldu', dolan;
END $$;

-- CreateIndex
CREATE INDEX "LaborPrice_priceListId_idx" ON "LaborPrice"("priceListId");
