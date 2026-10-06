-- ═══════════════════════════════════════════════════════════════════════════
--  UYE YETKILERI: DORT IZIN → IKI YETKI (06.10.2026 — ekip/yetki plani B)
-- ═══════════════════════════════════════════════════════════════════════════
--  `UyeIzni` {excel, dwg, firmaTeklifleri, kutuphane} → {fiyat, dwg}.
--  Esleme (Emre 30.09 karari 7, BILEREK): excel → fiyat · dwg → dwg ·
--  firmaTeklifleri ve kutuphane DUSER (fiyat yetkisi ikisini de kapsar).
--  Sonuc: Excel izni acik uye kutuphaneyi ve firmanin tum teklif tutarlarini
--  gormeye baslar. Excel'siz ama kutuphane/firmaTeklifleri acik uye bunlari
--  KAYBEDER (30.09 canli olcumunde yok). Bu goc KENDISI durdurmaz (durdursa
--  konteyner acilmaz); deploy'dan HEMEN once salt okunur ON KAPI kosulur
--  (deploy adimi, koordinator): yetki kaybedecek / yetkisiz kalacak etkin uye
--  ve bekleyen davet 0 olmali, degilse deploy YOK. Sahip satiri da esler ama
--  sahip icin liste okunmaz (her zaman tam yetkili). NULL dizi NULL kalir
--  (okuma fail-closed: yetki yok).
--  Kural yeri: `src/ozellik/firma/uye-izinleri.ts`.
--
--  NEDEN ELLE: `prisma migrate diff` ciktisi `USING ("izinler"::text::"UyeIzni_new"[])`
--  yazar; `kutuphane` iceren her satirda PATLAR. PostgreSQL `USING` icinde alt
--  sorguya izin vermez → ara adim `text[]` + UPDATE. Son durum (tip, degerler,
--  varsayilanlar) diff ciktisiyla BIREBIR.
--
--  ── GERI DONUS (sira ONEMLI) ─────────────────────────────────────────────
--  Eski kod yeni enum'la ACILMAZ: her oturumlu istek `User.izinler`i okur,
--  eski Prisma istemcisi 'fiyat' degerini taniyamaz → istek 500. Bu yuzden:
--   1. backend'i DURDUR (yeni kod yeni enumla calisir; once durdurulmali ki
--      geri alma sirasinda yeni deger yazilmasin);
--   2. asagidaki TERS SQL'i kos (fiyat → excel+firmaTeklifleri+kutuphane,
--      dwg → dwg; bu goc satirini `_prisma_migrations`tan sil);
--   3. ESKI IMAJI ac (eski `migrate deploy` bu goce dokunmaz).
--  Ters SQL (yorum; elle kosulur):
--    BEGIN;
--    CREATE TYPE "UyeIzni_old" AS ENUM ('excel','dwg','firmaTeklifleri','kutuphane');
--    ALTER TABLE "User" ALTER COLUMN "izinler" DROP DEFAULT;
--    ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" DROP DEFAULT;
--    ALTER TABLE "User" ALTER COLUMN "izinler" TYPE text[] USING "izinler"::text[];
--    ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" TYPE text[] USING "izinler"::text[];
--    UPDATE "User" SET "izinler" = ARRAY(SELECT v FROM unnest(ARRAY['excel','dwg','firmaTeklifleri','kutuphane']) WITH ORDINALITY AS k(v, n)
--      WHERE (v IN ('excel','firmaTeklifleri','kutuphane') AND 'fiyat' = ANY("izinler")) OR (v = 'dwg' AND 'dwg' = ANY("izinler")) ORDER BY n)
--      WHERE "izinler" IS NOT NULL;
--    UPDATE "FirmaDavet" SET "izinler" = ARRAY(SELECT v FROM unnest(ARRAY['excel','dwg','firmaTeklifleri','kutuphane']) WITH ORDINALITY AS k(v, n)
--      WHERE (v IN ('excel','firmaTeklifleri','kutuphane') AND 'fiyat' = ANY("izinler")) OR (v = 'dwg' AND 'dwg' = ANY("izinler")) ORDER BY n)
--      WHERE "izinler" IS NOT NULL;
--    ALTER TABLE "User" ALTER COLUMN "izinler" TYPE "UyeIzni_old"[] USING "izinler"::"UyeIzni_old"[];
--    ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" TYPE "UyeIzni_old"[] USING "izinler"::"UyeIzni_old"[];
--    DROP TYPE "UyeIzni"; ALTER TYPE "UyeIzni_old" RENAME TO "UyeIzni";
--    ALTER TABLE "User" ALTER COLUMN "izinler" SET DEFAULT ARRAY['excel','dwg','firmaTeklifleri','kutuphane']::"UyeIzni"[];
--    ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" SET DEFAULT ARRAY['excel','dwg','firmaTeklifleri','kutuphane']::"UyeIzni"[];
--    DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261006100000_uye_yetkileri_fiyat_dwg';
--    COMMIT;
--  Geri donuste eski secimin AYRINTISI (kutuphane'siz excel gibi) geri GELMEZ:
--  fiyat uc eski izne birden acilir — canlida tek uye ve tek bekleyen davet var.

BEGIN;

CREATE TYPE "UyeIzni_new" AS ENUM ('fiyat', 'dwg');

ALTER TABLE "User" ALTER COLUMN "izinler" DROP DEFAULT;
ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" DROP DEFAULT;

-- Ara adim: metin dizisi (UPDATE alt sorgu kullanabilsin).
ALTER TABLE "User" ALTER COLUMN "izinler" TYPE text[] USING "izinler"::text[];
ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" TYPE text[] USING "izinler"::text[];

-- ═══ ESLEME (kanonik sira: fiyat, dwg) ═══
UPDATE "User"
   SET "izinler" = ARRAY(
         SELECT v FROM unnest(ARRAY['fiyat', 'dwg']) WITH ORDINALITY AS k(v, n)
          WHERE (v = 'fiyat' AND 'excel' = ANY("izinler"))
             OR (v = 'dwg' AND 'dwg' = ANY("izinler"))
          ORDER BY n)
 WHERE "izinler" IS NOT NULL;

UPDATE "FirmaDavet"
   SET "izinler" = ARRAY(
         SELECT v FROM unnest(ARRAY['fiyat', 'dwg']) WITH ORDINALITY AS k(v, n)
          WHERE (v = 'fiyat' AND 'excel' = ANY("izinler"))
             OR (v = 'dwg' AND 'dwg' = ANY("izinler"))
          ORDER BY n)
 WHERE "izinler" IS NOT NULL;

ALTER TABLE "User" ALTER COLUMN "izinler" TYPE "UyeIzni_new"[] USING "izinler"::"UyeIzni_new"[];
ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" TYPE "UyeIzni_new"[] USING "izinler"::"UyeIzni_new"[];

ALTER TYPE "UyeIzni" RENAME TO "UyeIzni_old";
ALTER TYPE "UyeIzni_new" RENAME TO "UyeIzni";
DROP TYPE "UyeIzni_old";

ALTER TABLE "User" ALTER COLUMN "izinler" SET DEFAULT ARRAY['fiyat', 'dwg']::"UyeIzni"[];
ALTER TABLE "FirmaDavet" ALTER COLUMN "izinler" SET DEFAULT ARRAY['fiyat', 'dwg']::"UyeIzni"[];

-- Sayim (deploy gunlugunde gorunur; deploy sonrasi SON KAPI ayrica olcer).
-- NULL liste de "yetkisiz" sayilir (okuma fail-closed). Sifirdan buyukse
-- WARNING: goc yine biter (durdurmak konteyneri acilmaz yapardi), bekleyen
-- bos davet kabul edilirse yetkisiz uye dogar — ON KAPI bunu deploy'dan once
-- yakalamak icin var.
DO $$
DECLARE
  bos_uye int;
  bos_davet int;
BEGIN
  SELECT count(*) INTO bos_uye FROM "User"
   WHERE "firmaRol" = 'uye' AND "deletedAt" IS NULL AND COALESCE(cardinality("izinler"), 0) = 0;
  SELECT count(*) INTO bos_davet FROM "FirmaDavet"
   WHERE "kabulAt" IS NULL AND "iptalAt" IS NULL AND COALESCE(cardinality("izinler"), 0) = 0;
  IF bos_uye > 0 OR bos_davet > 0 THEN
    RAISE WARNING 'uye yetkileri: yetkisiz kalan etkin uye=% · yetkisiz bekleyen davet=%', bos_uye, bos_davet;
  ELSE
    RAISE NOTICE 'uye yetkileri: yetkisiz kalan etkin uye=0 · yetkisiz bekleyen davet=0';
  END IF;
END $$;

COMMIT;
