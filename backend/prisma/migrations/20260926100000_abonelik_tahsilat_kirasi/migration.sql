-- TAHSILAT DENEMESI KIRASI — ANLIK YENIDEN TAHSILAT, TAM BIR KEZ (26.09.2026)
--
-- Emre karari (26.09): kart guncellenince bekleyen odeme HEMEN bir kez yeniden
-- tahsil edilir. iyzico'nun yeniden deneme cagrisi (`/operation/retry`) PARA
-- CEKER ve POST'tur: cift tik, sayfa yenileme ya da ayni anda kosan dunning
-- taramasi ikinci cagriyi gonderirse cift cekim olabilir. Her deneme yolu
-- iyzico'ya gitmeden ONCE bu alani KOSULLU yazar (`WHERE "tahsilatKirasi" IS
-- NULL OR "tahsilatKirasi" < simdi`): yalniz biri kazanir, kaybeden iyzico'ya
-- GITMEZ. Deger kiranin bittigi andir; sureler `dunning/tahsilat-kirasi.ts`.
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Alan NULL baslar; NULL = "deneme
-- yok". Geriye donuk doldurma YOK.
-- SQL `prisma migrate diff` (eski sema → yeni sema) ciktisiyla AYNI.

-- AlterTable
ALTER TABLE "Abonelik" ADD COLUMN     "tahsilatKirasi" TIMESTAMP(3);
