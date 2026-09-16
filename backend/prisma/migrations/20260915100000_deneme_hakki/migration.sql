-- FAZ 6.12a — ucretsiz deneme BIR KEZ (deneme kullanim kaydi + denemesiz ikiz plan).
--
-- NEDEN (olcum 15.09): deneme karari hicbir kimlige bagli degildi; tek kistas
-- `PaketSurumu.denemeGunu > 0` idi ve iyzico'ya her seferinde ayni denemeli
-- plan gidiyordu. Ayni firma iptal/sona erdi, deneme sonu tahsilat basarisiz,
-- hesap kapat + ayni e-posta, yeni e-posta + ayni telefon ve ayni e-postanin
-- buyuk harfli bicimiyle deneme tekrar tekrar alinabiliyordu.
--
-- DDL `prisma migrate diff` (taban sema -> yeni sema) ciktisidir; elle yazilmadi.
-- FK BILEREK YOK: hesap kapatma / veri imhasi deneme kaydini silmemeli.
-- Sema notu: schema.prisma `DenemeKullanimi`.

-- AlterTable
ALTER TABLE "PaketSurumu" ADD COLUMN     "iyzicoDenemesizPlanKodu" TEXT;

-- AlterTable
ALTER TABLE "AbonelikBaslatma" ADD COLUMN     "denemeGunu" INTEGER,
ADD COLUMN     "epostaNormal" TEXT,
ADD COLUMN     "formEpostaNormal" TEXT,
ADD COLUMN     "planKodu" TEXT,
ADD COLUMN     "telefonNormal" TEXT;

-- CreateTable
CREATE TABLE "DenemeKullanimi" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "kullaniciId" TEXT,
    "abonelikBaslatmaId" TEXT,
    "epostaNormal" TEXT,
    "formEpostaNormal" TEXT,
    "telefonNormal" TEXT,
    "iyzicoMusteriKodu" TEXT,
    "kaynak" TEXT NOT NULL,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DenemeKullanimi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DenemeKullanimi_abonelikBaslatmaId_key" ON "DenemeKullanimi"("abonelikBaslatmaId");

-- CreateIndex
CREATE INDEX "DenemeKullanimi_firmaId_idx" ON "DenemeKullanimi"("firmaId");

-- CreateIndex
CREATE INDEX "DenemeKullanimi_epostaNormal_idx" ON "DenemeKullanimi"("epostaNormal");

-- CreateIndex
CREATE INDEX "DenemeKullanimi_formEpostaNormal_idx" ON "DenemeKullanimi"("formEpostaNormal");

-- CreateIndex
CREATE INDEX "DenemeKullanimi_telefonNormal_idx" ON "DenemeKullanimi"("telefonNormal");

-- CreateIndex
CREATE UNIQUE INDEX "PaketSurumu_iyzicoDenemesizPlanKodu_key" ON "PaketSurumu"("iyzicoDenemesizPlanKodu");

-- ═══ GERIYE DONUK DOLDURMA (6.12a) ═══════════════════════════════════════════
-- IDEMPOTENT: niyet guncellemesi yalniz "denemeGunu" NULL satirlara dokunur;
-- kayit kimlikleri niyetten/firmadan TURETILIR (md5) ve ON CONFLICT DO NOTHING.
-- Ikinci kosum hicbir satiri degistirmez (test:migration D blogu olcer).
--
-- NORMALIZE KURALI deneme-hakki.ts `denemeEpostaAnahtari` ile BIREBIR AYNI:
--   trim · YALNIZ ASCII A-Z kucuk harf (lower() DEGIL: yerel ayara gore Unicode
--   harfleri de cevirir, JS ile ayrisirdi) · yerel kisimda ilk '+' sonrasi
--   atilir · gmail.com/googlemail.com'da noktalar atilir, alan gmail.com ·
--   '@' yoksa ya da yerel kisim bossa NULL. Telefon: rakam disi atilir, son 10
--   hane (10'dan azsa NULL). SQL ile JS'in ayni sonucu verdigi test:migration
--   D blogunda ornek kumeyle olculur.
--
-- BILINEN SINIR: gecmis niyetlerde form e-postasi saklanmadi (NULL kalir);
-- telefon Firma.telefon'un GUNCEL degeridir (deneme anindaki degil).

-- 1) Eski niyetler: deneme karari surumden (eski kod her zaman surumun
--    denemeli planini gonderiyordu), anahtarlar hesaptan ve firmadan.
WITH kaynak AS (
  SELECT b."id",
         s."denemeGunu" AS gun,
         s."iyzicoPlanKodu" AS plan,
         translate(btrim(coalesce(u."kapatilanEposta", u."email"), E' \t\r\n'),
                   'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') AS e,
         regexp_replace(coalesce(f."telefon", ''), '[^0-9]', '', 'g') AS tel
  FROM "AbonelikBaslatma" b
  JOIN "PaketSurumu" s ON s."id" = b."paketSurumuId"
  LEFT JOIN "User" u ON u."id" = b."olusturanId"
  LEFT JOIN "Firma" f ON f."id" = b."firmaId"
  WHERE b."denemeGunu" IS NULL
), parca AS (
  SELECT k.*,
         CASE WHEN strpos(k.e, '@') > 1 AND strpos(k.e, '@') < length(k.e)
              THEN split_part(split_part(k.e, '@', 1), '+', 1) END AS yerel,
         CASE WHEN strpos(k.e, '@') > 1 AND strpos(k.e, '@') < length(k.e)
              THEN substr(k.e, strpos(k.e, '@') + 1) END AS alan
  FROM kaynak k
)
UPDATE "AbonelikBaslatma" b
SET "denemeGunu" = p.gun,
    "planKodu" = coalesce(b."planKodu", p.plan),
    "epostaNormal" = coalesce(b."epostaNormal",
      CASE
        WHEN p.yerel IS NULL THEN NULL
        WHEN p.alan IN ('gmail.com', 'googlemail.com')
          THEN nullif(replace(p.yerel, '.', ''), '') || '@gmail.com'
        ELSE nullif(p.yerel, '') || '@' || p.alan
      END),
    "telefonNormal" = coalesce(b."telefonNormal",
      CASE WHEN length(p.tel) >= 10 THEN right(p.tel, 10) END)
FROM parca p
WHERE p."id" = b."id";

-- 2) Deneme almis (TAMAMLANDI + deneme gunu > 0) her niyet icin kayit.
INSERT INTO "DenemeKullanimi"
  ("id", "firmaId", "kullaniciId", "abonelikBaslatmaId", "epostaNormal",
   "formEpostaNormal", "telefonNormal", "iyzicoMusteriKodu", "kaynak", "olusturuldu")
SELECT (md5('deneme-kullanimi:' || b."id"))::uuid::text,
       b."firmaId",
       b."olusturanId",
       b."id",
       b."epostaNormal",
       b."formEpostaNormal",
       b."telefonNormal",
       a."iyzicoMusteriKodu",
       'geriye-donuk',
       coalesce(b."sonuclandi", b."olusturuldu")
FROM "AbonelikBaslatma" b
LEFT JOIN "Abonelik" a ON a."firmaId" = b."firmaId"
WHERE b."durum" = 'TAMAMLANDI'
  AND b."denemeGunu" > 0
ON CONFLICT DO NOTHING;

-- 3) Miras (gecis) firmalari: karar K-P3 — ilk kart aliminda deneme ALMAZ.
--    Hak gecis doneminde kullanilmis sayilir; YALNIZ firma anahtari (kisi
--    anahtari yazilmaz: gecis bir kisinin deneme almasi degildir).
--    Satir SIMDI yazilmazsa ilk (denemesiz) alim miras satirini gercek paketle
--    ezer ve ikinci alimda firma "miras" olarak TANINMAZ.
INSERT INTO "DenemeKullanimi" ("id", "firmaId", "kaynak", "olusturuldu")
SELECT (md5('deneme-miras:' || a."firmaId"))::uuid::text,
       a."firmaId",
       'miras',
       CURRENT_TIMESTAMP
FROM "Abonelik" a
JOIN "PaketSurumu" s ON s."id" = a."paketSurumuId"
JOIN "Paket" p ON p."id" = s."paketId"
WHERE p."kod" LIKE 'miras-%'
ON CONFLICT DO NOTHING;
