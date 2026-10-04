-- ═══════════════════════════════════════════════════════════════════════════
--  ISCILIK FIYAT LISTESI SILININCE FIYATLARI DA GIDER (04.10.2026 — L3/S1)
-- ═══════════════════════════════════════════════════════════════════════════
--  `LaborPrice.priceList` silmede `SET NULL` idi: liste silinince fiyat
--  satirlari priceListId=NULL kaliyor, kullanici onlari ne goruyor ne
--  silebiliyordu — ve iscilik eslestirmesi fiyatlari `firmaId` ile cektigi
--  icin SILINEN LISTENIN FIYATI teklifte kullanilmaya devam ediyordu. Kod
--  duzeyinde ayri silme (deleteMany + delete) ayni listeye eszamanli yazimla
--  yarisirdi; CASCADE ile DB tek ifadede siler.
--
--  ON KOSUL YOK: veri donusumu yapilmaz. Canli salt okuma (02.10 14:15 TR):
--  listesiz (priceListId NULL) LaborPrice 0 · ayni (kalem, firma) icin cift
--  fiyat 0. Listeyi silen yol yalniz `deletePriceList` (fiyatlarin listeden
--  sonra yasamasini bekleyen yol YOK; firma silme zaten firma uzerinden
--  CASCADE, KVKK imhasi fiyatlari listelerden ONCE siler).
--  SQL `prisma migrate diff` ciktisiyla BIREBIR (drift olmasin).
--
--  GERI ALMA (yalniz gerekirse, elle):
--    ALTER TABLE "LaborPrice" DROP CONSTRAINT "LaborPrice_priceListId_fkey";
--    ALTER TABLE "LaborPrice" ADD CONSTRAINT "LaborPrice_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "LaborPriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--  ⚠ Elle uygulamak schema.prisma ve _prisma_migrations ile DRIFT yaratir,
--  mevcut kodla L3 hatasini geri getirir; CASCADE'in sildigi satirlar geri
--  DONMEZ (yalniz deploy oncesi yedekten). Kalici geri donus: ileri yonlu
--  yeni goc + semada `onDelete: SetNull`. Satirlar `test:migration` LC'de
--  PGlite'ta islem icinde kosulup geri alinarak dogrulanir.

-- DropForeignKey
ALTER TABLE "LaborPrice" DROP CONSTRAINT "LaborPrice_priceListId_fkey";

-- AddForeignKey
ALTER TABLE "LaborPrice" ADD CONSTRAINT "LaborPrice_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "LaborPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
