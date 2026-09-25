-- HAVALE TEKLIFININ PAKETI (25.09.2026 — Emre karari: "onayda hemen uygula")
--
-- Olculen kusur (`backend/test/havale-teklif-paketi-test.ts`): yonetici
-- `POST /yonetim/havale/teklif` ile paket secerek teklif veriyordu ama paket
-- HICBIR YERDE saklanmiyordu. Firmanin abonelik satiri varsa teklifin paketi
-- yok sayiliyor, onay yalniz sureyi uzatiyordu: Basic musteri 19.788 TL'lik
-- Pro teklifini odeyince Basic kaliyor (1 koltuk, DWG kapali), fatura kalemi
-- ve musteri e-postasi da "Basic" yaziyordu.
--
-- Tek alan: `HavaleOdemesi.paketSurumuId` — teklifin paketi. Onay bu surumu
-- aboneligin ETKIN paketi yapar (`HavaleServisi.odemeyiOnayla`).
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Alan NULL baslar; NULL = bu
-- migration'dan ONCE verilmis teklif → onay paketi DEGISTIRMEZ (eski davranis;
-- hangi paket icin verildigi bilinmiyor, geriye donuk doldurma TAHMIN olurdu).
-- Bu migration tek basina hicbir firmanin paketini, erisimini ya da
-- tahsilatini DEGISTIRMEZ.
--
-- FK `ON DELETE SET NULL` (Prisma'nin istege bagli iliski varsayilani, A1
-- `planliPaketSurumuId` ile ayni): PaketSurumu satirlari silinmez (fiyat
-- donmus kayittir); silinirse teklif paketsiz (eski teklif gibi) kalir.
-- SQL `prisma migrate diff` (eski sema → yeni sema) ciktisiyla AYNI.

-- AlterTable
ALTER TABLE "HavaleOdemesi" ADD COLUMN     "paketSurumuId" TEXT;

-- AddForeignKey
ALTER TABLE "HavaleOdemesi" ADD CONSTRAINT "HavaleOdemesi_paketSurumuId_fkey" FOREIGN KEY ("paketSurumuId") REFERENCES "PaketSurumu"("id") ON DELETE SET NULL ON UPDATE CASCADE;
