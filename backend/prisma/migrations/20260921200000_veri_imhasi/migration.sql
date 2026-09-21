-- PLAN 5.8 — VERI IMHASI (21.09.2026)
-- Hesap kapatma bugune kadar YALNIZ `deletedAt` damgaliyordu; veri hic
-- silinmiyordu (`hesap.servisi.ts` basligi bunu "BU TURDA YAPILMADI" diye
-- yaziyordu). Bu migration imha icin gereken UC alani ve fatura anlik
-- goruntusunu ekler.
--
-- Yalniz EKLER: DROP / DELETE / UPDATE YOK, mevcut satirlar degismez.
-- BACKFILL YOK ve bu KASITLI:
--   · `imhaTarihi` bos kalir → bu turdan ONCE kapatilmis hicbir hesap
--     sessizce silinmez. (Olculdu 21.09: canlida 0 kapali hesap var.)
--   · Fatura anlik goruntu alanlari bos kalir → olculdu, canlida 0 fatura
--     kaydi var; gecmisi BUGUNKU firma bilgisiyle doldurmak zaten yanlis
--     veri uretirdi (fatura kesildigi ANIN bilgisini tasimalidir).
--
-- ⚠ Ayni migration'da enum OLUSTURUP KULLANMAK guvenlidir: `CREATE TYPE`
-- transaction'lidir; kisit yalniz `ALTER TYPE … ADD VALUE`'dadir.

-- ── 1) KAPATMA NEDENI ────────────────────────────────────────────────────
-- Dort kapatma yolu (kendi kapatmasi x2, yonetici silmesi, sahibin uyeyi
-- cikarmasi) bugun AYNI `kapatmaVerisi()`ni yaziyor ve ayirt edilemiyor.
-- Dordunde de imha sayaci baslar (K3); ayrim e-posta davranisi icindir:
-- yalniz `ekiptenCikarildi` olanin adresi HEMEN serbest kalir (K1 istisnasi).
CREATE TYPE "KapatmaNedeni" AS ENUM ('kendi', 'yonetici', 'ekiptenCikarildi', 'firmaKapandi');

ALTER TABLE "User" ADD COLUMN "kapatmaNedeni" "KapatmaNedeni";

-- ── 2) IMHA ANI ──────────────────────────────────────────────────────────
-- Gunluk imha isi YALNIZ bu alana bakar, `deletedAt`e DEGIL.
ALTER TABLE "User" ADD COLUMN "imhaTarihi" TIMESTAMP(3);
ALTER TABLE "Firma" ADD COLUMN "imhaTarihi" TIMESTAMP(3);

-- Imha isi her gece "vakti gelmis" satirlari arar; kismi indeks yalnizca
-- kapatilmis satirlari tasir (bugun 0 satir, buyudukce de dar kalir).
CREATE INDEX "User_imhaTarihi_idx" ON "User"("imhaTarihi") WHERE "imhaTarihi" IS NOT NULL;
CREATE INDEX "Firma_imhaTarihi_idx" ON "Firma"("imhaTarihi") WHERE "imhaTarihi" IS NOT NULL;

-- ── 3) FATURA ANLIK GORUNTUSU (K4) ───────────────────────────────────────
-- VUK md. 230 faturada musterinin adi/unvani, adresi, vergi dairesi ve
-- numarasini sart kosuyor. Bu bilgiler `Firma` satirindan CANLI okunuyordu:
-- imha firma satirini bosaltinca faturalar eksik kalirdi ve imhadan bagimsiz
-- olarak da musteri adres degistirince GECEN YILIN faturasi degisiyordu.
ALTER TABLE "Fatura" ADD COLUMN "musteriUnvan" TEXT;
ALTER TABLE "Fatura" ADD COLUMN "musteriVergiDairesi" TEXT;
ALTER TABLE "Fatura" ADD COLUMN "musteriVergiNo" TEXT;
ALTER TABLE "Fatura" ADD COLUMN "musteriTcKimlikNo" TEXT;
ALTER TABLE "Fatura" ADD COLUMN "musteriAdres" TEXT;
ALTER TABLE "Fatura" ADD COLUMN "musteriIl" TEXT;
ALTER TABLE "Fatura" ADD COLUMN "musteriIlce" TEXT;
