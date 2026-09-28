-- FATURA: ODEME ANI + PAKET ADI KUYRUGA ALMA ANINDA KOPYALANIR (28.09.2026)
--
-- Iyzico canliya gecmeden ONCE fatura kaydinin dogrulugu (Emre / koordinator):
--  · "tahsilatTarihi" — VUK md. 231/5 son duzenleme gunu (7 gun) ODEME
--    anindan sayilir. Kart: iyzico'nun basarili odeme denemesi (createdDate);
--    havale: onay ani. Satir eskiden odeme anini TASIMIYORDU: e-posta
--    min(kuyruga alinma, donem basi) yaziyordu — yeniden denemeyle toparlanan
--    tahsilatta gercek odemeden gunler ONCE.
--  · "paketAdi" — fatura kalemi KESIM anindaki aboneligin paketinden
--    okunuyordu; paket arada degisirse (havale onayi, yukseltme) bekleyen
--    fatura yanlis paket adiyla kesilirdi.
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Iki alan NULL baslar; NULL = bu
-- alanlardan ONCE kuyruga alinmis satir → kesim eski davranisa duser.
-- Geriye donuk doldurma YOK (tahmin olurdu).
-- SQL `prisma migrate diff` (eski sema → yeni sema) ciktisiyla AYNI.

-- AlterTable
ALTER TABLE "Fatura" ADD COLUMN     "paketAdi" TEXT,
ADD COLUMN     "tahsilatTarihi" TIMESTAMP(3);
