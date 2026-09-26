-- "DENEME SURENIZ BITIYOR" E-POSTASI — TAM BIR KEZ (25.09.2026)
--
-- Emre: "faturalar ve uyarilar vs. e posta olarak gitmeli"; hatirlatma ilk
-- cekimden 3 gun once, BIR kez (Emre karari, 25.09). Gunluk tarama
-- (`DenemeHatirlatmasiServisi`, 09:00 Istanbul) e-postayi gondermeden ONCE
-- bu alani KOSULLU yazar (`WHERE "denemeHatirlatmasi" IS NULL`): ayni satiri
-- iki tur / iki surec ayni anda gorse de yalniz biri yazar ve gonderir.
-- Gonderim duserse alan geri NULL'a cekilir, sonraki tur yeniden dener.
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Alan NULL baslar; NULL =
-- "hatirlatma gitmedi". Geriye donuk doldurma YOK: deploy aninda denemesi
-- 3 gun icinde bitecek satirlar ilk turda hatirlatmayi alir (dogru davranis;
-- bugune kadar hic gitmemisti).
-- SQL `prisma migrate diff` (eski sema → yeni sema) ciktisiyla AYNI.

-- AlterTable
ALTER TABLE "Abonelik" ADD COLUMN     "denemeHatirlatmasi" TIMESTAMP(3);
