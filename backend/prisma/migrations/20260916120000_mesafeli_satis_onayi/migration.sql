-- FAZ 6.4 — mesafeli satis sozlesmesi onayinin izi.
--
-- NEDEN (olcum 16.09): satin alma akisinda (abonelik sayfasi -> fatura
-- bilgisi -> iyzico formu) on bilgilendirme formuna baglanti da, onay kutusu
-- da YOKTU. Onay artik ZORUNLU (`AbonelikBaslaDto.sozlesmeOnayi` uzerinde
-- `@Equals(true)`), ve bir onay kaydinin degeri "onayladi" bilgisinde degil,
-- HANGI METNI ve NE ZAMAN onayladigi bilgisindedir. Ikisi de niyet satirinda
-- durur; abonelik acildiktan sonra da geriye donuk izlenebilir.
--
-- GEÇMISE DONUK ONAY UYDURULMAZ: eski satirlar NULL kalir (o kod onay kutusu
-- GOSTERMIYORDU, dolayisiyla o musteriler bu metni onaylamadi).
--
-- DDL `prisma migrate diff` (taban sema -> yeni sema) ciktisidir.
-- Sema notu: schema.prisma `AbonelikBaslatma`.

-- AlterTable
ALTER TABLE "AbonelikBaslatma" ADD COLUMN     "sozlesmeOnayiZamani" TIMESTAMP(3),
ADD COLUMN     "sozlesmeSurumu" TEXT;
