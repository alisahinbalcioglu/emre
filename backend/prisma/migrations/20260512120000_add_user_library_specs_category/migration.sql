-- ═════════════════════════════════════════════════════════════════
-- UserLibrary — specs (JSONB) + category (TEXT) ekle
-- ─────────────────────────────────────────────────────────────────
-- DWG workspace'te kütüphaneden seçilen ekipmanların (kombi, pompa
-- vs.) teknik bilgilerini ve kategori filtresini tutmak için.
--
-- specs:    Serbest key-value JSON. Örn: {"Güç":"24 kW","Kapasite":"100 m³/h"}
-- category: "ekipman" | "boru" | "fitting" | NULL — /library/equipment
--           sayfası bu sütuna göre filtreler.
-- ─────────────────────────────────────────────────────────────────
-- Idempotent: ADD COLUMN IF NOT EXISTS — yeniden çalıştırılırsa hata vermez.
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "specs" JSONB;
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "category" TEXT;
