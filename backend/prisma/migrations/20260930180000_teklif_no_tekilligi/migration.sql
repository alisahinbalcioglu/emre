-- ═══════════════════════════════════════════════════════════════════════════
--  TEKLIF NO TEKILLIGI (30.09.2026 — ekip/yetki plani A blogu)
-- ═══════════════════════════════════════════════════════════════════════════
--  Teklif no (`MP-<yil>-<sira>`) "firmadaki numarali teklif SAYISI + 1" ile
--  uretiliyordu: es zamanli iki ilk cikti ayni numarayi aliyor, ortadan silme
--  VAR OLAN numarayi tekrarlatiyordu. Atama artik firma basina danisma
--  kilidinde (`src/ozellik/teklif/quotes/teklif-no.ts`); bu indeks son savunma.
--  NULL `quoteNo` (hic disa aktarilmamis teklif) sinirsiz tekrarlanabilir —
--  PostgreSQL NULL'lari birbirine esit saymaz.
--
--  ON KOSUL (canli, salt okuma, 30.09 17:15 TR): firma icinde tekrar eden
--  numara 0 · firmasiz numarali teklif 0 · bicim disi numara 0.
--  SQL `prisma migrate diff` ciktisiyla BIREBIR (drift olmasin).
--
--  GERI ALMA: DROP INDEX "Quote_firmaId_quoteNo_key";

-- CreateIndex
CREATE UNIQUE INDEX "Quote_firmaId_quoteNo_key" ON "Quote"("firmaId", "quoteNo");
