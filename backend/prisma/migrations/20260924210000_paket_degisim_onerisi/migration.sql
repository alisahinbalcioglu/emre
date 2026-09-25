-- PAKET DEGISIM ONERISI (24.09.2026 — yonetici paneli turu A2 Blok 2)
--
-- Emre (23.09): yonetici YUKSELTIRSE musteriye onay baglantisi gider;
-- musteri onaylamadan paketi degismez. Yonetici bir ONERI kaydeder, firma
-- sahibi A1'in penceresinden (sozlesme onayiyla) kabul eder ya da reddeder.
--
-- Tek tablo + tek enum. `bekleyenFirmaId` UNIQUE: firma basina TEK bekleyen
-- oneri kuralinin veritabani kilidi (bekleyen satirda firmaId, sonuclaninca
-- NULL; PostgreSQL UNIQUE birden fazla NULL'a izin verir). Kismi indeks
-- secilmedi: yalniz SQL'de yasar, semada gorunmez.
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Yeni tablo bos baslar; bu
-- migration tek basina hicbir firmanin paketini, erisimini ya da tahsilatini
-- DEGISTIRMEZ. SQL `prisma migrate diff` ile uretildi (eski sema → yeni sema).
--
-- FK'ler `ON DELETE RESTRICT`: firma ve paket surumu silinmez (imha satiri
-- birakir, `imha-listesi.ts` bu tabloyu firma ekseninde ELLE siler).

-- CreateEnum
CREATE TYPE "PaketOnerisiDurumu" AS ENUM ('BEKLIYOR', 'KABUL_EDILDI', 'REDDEDILDI', 'GERI_CEKILDI', 'KAPANDI');

-- CreateTable
CREATE TABLE "PaketDegisimOnerisi" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "bekleyenFirmaId" TEXT,
    "durum" "PaketOnerisiDurumu" NOT NULL DEFAULT 'BEKLIYOR',
    "hedefPaketSurumuId" TEXT NOT NULL,
    "kaynakPaketSurumuId" TEXT NOT NULL,
    "kaynakIyzicoKodu" TEXT,
    "gerekce" TEXT NOT NULL,
    "musteriNotu" TEXT,
    "sonGecerlilik" TIMESTAMP(3) NOT NULL,
    "olusturanId" TEXT NOT NULL,
    "olusturanEposta" TEXT NOT NULL,
    "sonuclandi" TIMESTAMP(3),
    "sonuclandiranId" TEXT,
    "kapanisNedeni" TEXT,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaketDegisimOnerisi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaketDegisimOnerisi_bekleyenFirmaId_key" ON "PaketDegisimOnerisi"("bekleyenFirmaId");

-- CreateIndex
CREATE INDEX "PaketDegisimOnerisi_firmaId_olusturuldu_idx" ON "PaketDegisimOnerisi"("firmaId", "olusturuldu");

-- AddForeignKey
ALTER TABLE "PaketDegisimOnerisi" ADD CONSTRAINT "PaketDegisimOnerisi_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaketDegisimOnerisi" ADD CONSTRAINT "PaketDegisimOnerisi_hedefPaketSurumuId_fkey" FOREIGN KEY ("hedefPaketSurumuId") REFERENCES "PaketSurumu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
