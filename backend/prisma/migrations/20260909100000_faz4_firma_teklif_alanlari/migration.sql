-- FAZ 4 — firma/kisi alanlari + teklif satis durumu.
--
-- ⚠ BU MIGRATION BILEREK KUCUK. Planin 4.1/4.2 maddesi "AYRI bir Company
-- modeli olustur + mevcut kayitlari tasi" diyordu; OLCUM bunu curuttu:
-- `Firma` modeli 28.08'den beri VAR (12 alan) ve backfill 28-29.08'de zaten
-- kosuldu (canlida olculdu: firmasiz kullanici = 0). Yeni bir Company modeli
-- acmak, teklif/kutuphane/abonelik suzgeclerinin tamaminin bagli oldugu
-- tenant modelini IKIZLERDI. Bu yuzden burada YALNIZCA gercekten eksik olan
-- alanlar ekleniyor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) FIRMA — telefon + logo
-- ─────────────────────────────────────────────────────────────────────────
-- `telefon`: plan listesindeki TEK gercekten eksik fatura alani. Bugun her
-- satin almada musteriden ZORUNLU aliniyor, iyzico'ya gidiyor ve DB'ye HIC
-- yazilmadan atiliyordu.
-- `logoBytes`/`logoMime`: backend konteynerinin docker-compose'da hic
-- `volumes:` anahtari YOK — diske yazan bir cozum canlida her deploy'da
-- sessizce kaybolurdu. Depodaki tek calisan kalici dosya deseni `Bytes`
-- (QuoteFormat.fileBytes) ve o desen izleniyor.
ALTER TABLE "Firma" ADD COLUMN     "telefon" TEXT,
ADD COLUMN     "logoBytes" BYTEA,
ADD COLUMN     "logoMime" TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) USER — kisi alanlari
-- ─────────────────────────────────────────────────────────────────────────
-- Hepsi NULLABLE. Zorunlu yapmak mevcut kayit akisini kirardi (RegisterDto
-- bugun yalniz email+password aliyor) — Firma'nin fatura alanlarinin
-- nullable olmasiyla ayni gerekce: kayit surtunmesi yaratma, sonradan doldur.
-- BACKFILL YOK ve BILEREK yok: bu alanlarin dogru degerini sistem BILEMEZ.
-- E-postadan ad turetmek (`Firma.ad`da yapildigi gibi) burada YANLIS olurdu —
-- kisi adi tahmin edilemez, bos birakilip kullaniciya sorulur.
ALTER TABLE "User" ADD COLUMN     "ad" TEXT,
ADD COLUMN     "soyad" TEXT,
ADD COLUMN     "telefon" TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) TEKLIF — satis durumu + updatedAt
-- ─────────────────────────────────────────────────────────────────────────
-- Deger adi `TASLAK` DEGIL `HAZIRLANIYOR`: bu depoda `taslak` zaten
-- sessionStorage'daki YARIM DUZENLEME demek (frontend/ozellik/teklif/taslak.ts).
CREATE TYPE "TeklifDurumu" AS ENUM ('HAZIRLANIYOR', 'GONDERILDI', 'KAZANILDI', 'KAYBEDILDI');

-- SIRA ONEMLI: DEFAULT'lu NOT NULL kolon eklemek mevcut TUM satirlari
-- otomatik olarak varsayilana cekar — ayri bir UPDATE'e gerek YOK ve
-- yazmak yanlis olurdu (yeni kayitlari da etkilemez ama gereksiz tam tarama).
ALTER TABLE "Quote" ADD COLUMN     "durum" "TeklifDurumu" NOT NULL DEFAULT 'HAZIRLANIYOR';

-- `updatedAt`: @updatedAt kolonu NOT NULL'dur; mevcut satirlar icin bir
-- baslangic degeri SART. `createdAt` kullanilir (now() DEGIL): "en son
-- dokunulan" siralamasi, hic guncellenmemis eski tekliflerde olusturulma
-- anini gostermeli — hepsine migration anini yazmak butun eski teklifleri
-- "az once guncellendi" gibi gosterir ve listeyi yalan siralar.
ALTER TABLE "Quote" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "Quote" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Quote" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) INDEKS — dogru kolonda
-- ─────────────────────────────────────────────────────────────────────────
-- Semadaki `[userId, createdAt]` bilesik indeksi BAYAT: `findAll` firma
-- gocunden (`f45fd2f`) beri `where: { firmaId }` + `orderBy: { createdAt }`
-- kosuyor. Yani en sik sorgu artik kullanici-basina DEGIL firma-basina;
-- mevcut bilesik indeks bu sorguya hic yardim etmiyordu. Durum suzgeci de
-- ayni sorguya bindigi icin dogru bilesik indeks budur.
-- Eski indeksler BIRAKILIYOR: `[userId]` hala kullanici-bazli yollarda
-- (admin/denetim, kullanici silme etkisi) kullaniliyor.
CREATE INDEX "Quote_firmaId_createdAt_idx" ON "Quote"("firmaId", "createdAt");
