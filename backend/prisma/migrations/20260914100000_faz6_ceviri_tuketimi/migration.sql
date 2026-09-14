-- FAZ 6.2 — ceviri tuketim kaydi (kota bu tablodan sayilir).
--
-- NEDEN AiUsageLog DEGIL (13.09 olcum turu): o tablo 60 metinlik parca basina
-- satir yazar, satir/dosya alani yoktur ve TAMAMEN onbellekten donen ceviride
-- HIC satir yazmaz. Kota ondan sayilamaz.
--
-- FK BILEREK YOK: teklif silinince kayit KALMALI. Cascade'li bir FK ile
-- kullanici cevirip teklifi silerek kotasini geri alabilirdi.
--
-- SAYIM "dusulenSatir" UZERINDEN: kismen tamamlanan ceviride yalniz teslim
-- edilen satir duser (KISMI); ayni icerigin 10 dk icindeki devami yalniz yeni
-- teslim edilen satiri duser ve dosya hakkindan yemez ("devam").
--
-- Veri gocu yok: tablo bos baslar. Mevcut firmalar ilk ceviriden itibaren sayilir.

-- CreateEnum
CREATE TYPE "CeviriTuketimDurumu" AS ENUM ('ISLENIYOR', 'BASARILI', 'KISMI', 'BASARISIZ');

-- CreateTable
CREATE TABLE "CeviriTuketimi" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "abonelikId" TEXT NOT NULL,
    "paketKodu" TEXT NOT NULL,
    "donemBaslangic" TIMESTAMP(3) NOT NULL,
    "donemBitis" TIMESTAMP(3) NOT NULL,
    "quoteId" TEXT NOT NULL,
    "hedefDil" TEXT NOT NULL DEFAULT 'en',
    "satirSayisi" INTEGER NOT NULL,
    "dusulenSatir" INTEGER NOT NULL DEFAULT 0,
    "toplamTeslim" INTEGER NOT NULL DEFAULT 0,
    "devam" BOOLEAN NOT NULL DEFAULT false,
    "metinSayisi" INTEGER NOT NULL,
    "icerikOzeti" TEXT NOT NULL,
    "durum" "CeviriTuketimDurumu" NOT NULL DEFAULT 'ISLENIYOR',
    "onbellekten" INTEGER NOT NULL DEFAULT 0,
    "cevrilen" INTEGER NOT NULL DEFAULT 0,
    "basarisizParca" INTEGER NOT NULL DEFAULT 0,
    "hata" TEXT,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sonuclandi" TIMESTAMP(3),

    CONSTRAINT "CeviriTuketimi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Donem kullanimi: WHERE firmaId = ? AND olusturuldu >= ? AND olusturuldu < ?
CREATE INDEX "CeviriTuketimi_firmaId_olusturuldu_idx" ON "CeviriTuketimi"("firmaId", "olusturuldu");

-- CreateIndex
-- Tekrar korumasi: ayni teklifin ayni icerigi icin son kayit
CREATE INDEX "CeviriTuketimi_firmaId_quoteId_icerikOzeti_olusturuldu_idx" ON "CeviriTuketimi"("firmaId", "quoteId", "icerikOzeti", "olusturuldu");
