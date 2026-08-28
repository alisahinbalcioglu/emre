-- CreateEnum
CREATE TYPE "AbonelikBaslatmaDurumu" AS ENUM ('BEKLIYOR', 'TAMAMLANDI', 'BASARISIZ', 'VAZGECILDI');

-- CreateEnum
CREATE TYPE "AbonelikDurumu" AS ENUM ('DENEME', 'AKTIF', 'ODEME_BEKLIYOR', 'KISITLI', 'ASKIDA', 'IPTAL', 'SONA_ERDI');

-- CreateEnum
CREATE TYPE "OdemeYontemi" AS ENUM ('KART', 'HAVALE');

-- CreateEnum
CREATE TYPE "FaturaDurumu" AS ENUM ('BEKLIYOR', 'KESILDI', 'HATA', 'ELLE_MUDAHALE', 'IPTAL');

-- CreateEnum
CREATE TYPE "HavaleDurumu" AS ENUM ('TEKLIF', 'FATURA_KESILDI', 'ODEME_BEKLENIYOR', 'ONAYLANDI', 'IPTAL');

-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "faturaAdresi" TEXT,
ADD COLUMN     "faturaEposta" TEXT,
ADD COLUMN     "il" TEXT,
ADD COLUMN     "ilce" TEXT,
ADD COLUMN     "tcKimlikNo" TEXT,
ADD COLUMN     "unvan" TEXT,
ADD COLUMN     "vergiDairesi" TEXT,
ADD COLUMN     "vergiNo" TEXT,
ADD COLUMN     "yetkiliEposta" TEXT;

-- CreateTable
CREATE TABLE "Paket" (
    "id" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "aciklama" TEXT,
    "sira" INTEGER NOT NULL DEFAULT 0,
    "kapsam" "SubscriptionScope" NOT NULL,
    "seviye" "PackageLevel" NOT NULL,
    "kullaniciHakki" INTEGER NOT NULL DEFAULT 5,
    "aylikTeklifHakki" INTEGER,
    "dwgAktif" BOOLEAN NOT NULL DEFAULT true,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaketSurumu" (
    "id" TEXT NOT NULL,
    "paketId" TEXT NOT NULL,
    "surumNo" INTEGER NOT NULL,
    "iyzicoPlanKodu" TEXT NOT NULL,
    "iyzicoUrunKodu" TEXT NOT NULL,
    "tutar" DECIMAL(12,2) NOT NULL,
    "paraBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "periyot" TEXT NOT NULL DEFAULT 'MONTHLY',
    "periyotAdedi" INTEGER NOT NULL DEFAULT 1,
    "denemeGunu" INTEGER NOT NULL DEFAULT 0,
    "satistaMi" BOOLEAN NOT NULL DEFAULT true,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaketSurumu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abonelik" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "paketSurumuId" TEXT NOT NULL,
    "durum" "AbonelikDurumu" NOT NULL DEFAULT 'DENEME',
    "erisimSonu" TIMESTAMP(3) NOT NULL,
    "denemeSonu" TIMESTAMP(3),
    "iyzicoAbonelikKodu" TEXT,
    "iyzicoMusteriKodu" TEXT,
    "iyzicoDurum" TEXT,
    "iyzicoSonKontrol" TIMESTAMP(3),
    "odemeYontemi" "OdemeYontemi" NOT NULL DEFAULT 'KART',
    "ilkBasarisizlik" TIMESTAMP(3),
    "denemeSayisi" INTEGER NOT NULL DEFAULT 0,
    "sonDeneme" TIMESTAMP(3),
    "kisitlandi" TIMESTAMP(3),
    "iptalTalebi" TIMESTAMP(3),
    "iptalNedeni" TEXT,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellendi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abonelik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonelikBaslatma" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "paketSurumuId" TEXT NOT NULL,
    "olusturanId" TEXT NOT NULL,
    "durum" "AbonelikBaslatmaDurumu" NOT NULL DEFAULT 'BEKLIYOR',
    "iyzicoAbonelikKodu" TEXT,
    "hata" TEXT,
    "sonKontrol" TIMESTAMP(3),
    "denemeSayisi" INTEGER NOT NULL DEFAULT 0,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sonuclandi" TIMESTAMP(3),

    CONSTRAINT "AbonelikBaslatma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookOlayi" (
    "id" TEXT NOT NULL,
    "tekilAnahtar" TEXT NOT NULL,
    "kaynak" TEXT NOT NULL DEFAULT 'iyzico',
    "olayTipi" TEXT NOT NULL,
    "hamGovde" JSONB NOT NULL,
    "imzaBasligi" TEXT,
    "imzaGecerli" BOOLEAN NOT NULL DEFAULT false,
    "abonelikKodu" TEXT,
    "siparisKodu" TEXT,
    "musteriKodu" TEXT,
    "iyzicoRefKodu" TEXT,
    "olayZamani" TIMESTAMP(3),
    "islendi" BOOLEAN NOT NULL DEFAULT false,
    "islenmeZamani" TIMESTAMP(3),
    "denemeSayisi" INTEGER NOT NULL DEFAULT 0,
    "hata" TEXT,
    "alindi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookOlayi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonelikOlayi" (
    "id" TEXT NOT NULL,
    "abonelikId" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "oncekiDurum" TEXT,
    "yeniDurum" TEXT,
    "aciklama" TEXT,
    "veri" JSONB,
    "aktor" TEXT NOT NULL DEFAULT 'sistem',
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbonelikOlayi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "abonelikId" TEXT NOT NULL,
    "tahsilatKodu" TEXT NOT NULL,
    "durum" "FaturaDurumu" NOT NULL DEFAULT 'BEKLIYOR',
    "tutar" DECIMAL(12,2) NOT NULL,
    "kdvOrani" INTEGER NOT NULL DEFAULT 20,
    "kdvTutari" DECIMAL(12,2) NOT NULL,
    "toplamTutar" DECIMAL(12,2) NOT NULL,
    "paraBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "saglayici" TEXT,
    "saglayiciId" TEXT,
    "faturaNo" TEXT,
    "faturaUrl" TEXT,
    "denemeSayisi" INTEGER NOT NULL DEFAULT 0,
    "sonDeneme" TIMESTAMP(3),
    "hata" TEXT,
    "donemBasi" TIMESTAMP(3) NOT NULL,
    "donemSonu" TIMESTAMP(3) NOT NULL,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kesildi" TIMESTAMP(3),

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HavaleOdemesi" (
    "id" TEXT NOT NULL,
    "abonelikId" TEXT NOT NULL,
    "durum" "HavaleDurumu" NOT NULL DEFAULT 'TEKLIF',
    "tutar" DECIMAL(12,2) NOT NULL,
    "paraBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "ayAdedi" INTEGER NOT NULL,
    "teklifNo" TEXT,
    "faturaNo" TEXT,
    "dekontUrl" TEXT,
    "aciklama" TEXT,
    "onaylayanId" TEXT,
    "onaylandi" TIMESTAMP(3),
    "uzatilanTarih" TIMESTAMP(3),
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellendi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HavaleOdemesi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Paket_kod_key" ON "Paket"("kod");

-- CreateIndex
CREATE INDEX "Paket_aktif_sira_idx" ON "Paket"("aktif", "sira");

-- CreateIndex
CREATE UNIQUE INDEX "PaketSurumu_iyzicoPlanKodu_key" ON "PaketSurumu"("iyzicoPlanKodu");

-- CreateIndex
CREATE INDEX "PaketSurumu_satistaMi_idx" ON "PaketSurumu"("satistaMi");

-- CreateIndex
CREATE UNIQUE INDEX "PaketSurumu_paketId_surumNo_key" ON "PaketSurumu"("paketId", "surumNo");

-- CreateIndex
CREATE UNIQUE INDEX "Abonelik_firmaId_key" ON "Abonelik"("firmaId");

-- CreateIndex
CREATE UNIQUE INDEX "Abonelik_iyzicoAbonelikKodu_key" ON "Abonelik"("iyzicoAbonelikKodu");

-- CreateIndex
CREATE INDEX "Abonelik_durum_erisimSonu_idx" ON "Abonelik"("durum", "erisimSonu");

-- CreateIndex
CREATE INDEX "Abonelik_durum_sonDeneme_idx" ON "Abonelik"("durum", "sonDeneme");

-- CreateIndex
CREATE UNIQUE INDEX "AbonelikBaslatma_token_key" ON "AbonelikBaslatma"("token");

-- CreateIndex
CREATE INDEX "AbonelikBaslatma_durum_olusturuldu_idx" ON "AbonelikBaslatma"("durum", "olusturuldu");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookOlayi_tekilAnahtar_key" ON "WebhookOlayi"("tekilAnahtar");

-- CreateIndex
CREATE INDEX "WebhookOlayi_islendi_alindi_idx" ON "WebhookOlayi"("islendi", "alindi");

-- CreateIndex
CREATE INDEX "WebhookOlayi_abonelikKodu_idx" ON "WebhookOlayi"("abonelikKodu");

-- CreateIndex
CREATE INDEX "AbonelikOlayi_abonelikId_olusturuldu_idx" ON "AbonelikOlayi"("abonelikId", "olusturuldu");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_tahsilatKodu_key" ON "Fatura"("tahsilatKodu");

-- CreateIndex
CREATE INDEX "Fatura_durum_sonDeneme_idx" ON "Fatura"("durum", "sonDeneme");

-- CreateIndex
CREATE UNIQUE INDEX "HavaleOdemesi_teklifNo_key" ON "HavaleOdemesi"("teklifNo");

-- CreateIndex
CREATE INDEX "HavaleOdemesi_durum_olusturuldu_idx" ON "HavaleOdemesi"("durum", "olusturuldu");

-- AddForeignKey
ALTER TABLE "PaketSurumu" ADD CONSTRAINT "PaketSurumu_paketId_fkey" FOREIGN KEY ("paketId") REFERENCES "Paket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonelik" ADD CONSTRAINT "Abonelik_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abonelik" ADD CONSTRAINT "Abonelik_paketSurumuId_fkey" FOREIGN KEY ("paketSurumuId") REFERENCES "PaketSurumu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonelikBaslatma" ADD CONSTRAINT "AbonelikBaslatma_paketSurumuId_fkey" FOREIGN KEY ("paketSurumuId") REFERENCES "PaketSurumu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonelikOlayi" ADD CONSTRAINT "AbonelikOlayi_abonelikId_fkey" FOREIGN KEY ("abonelikId") REFERENCES "Abonelik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_abonelikId_fkey" FOREIGN KEY ("abonelikId") REFERENCES "Abonelik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HavaleOdemesi" ADD CONSTRAINT "HavaleOdemesi_abonelikId_fkey" FOREIGN KEY ("abonelikId") REFERENCES "Abonelik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
--  BACKFILL — ADIM 2 (28.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠ TEK KURAL: BU MIGRATION HICBIR MEVCUT KULLANICININ ERISIMINI KESMEZ.
--
--  Sebep: ADIM 2 ile "bu firma uygulamayi kullanabilir mi" sorusunun cevabi
--  ErisimServisi'ne tasiniyor ve o servis, Abonelik satiri OLMAYAN firmaya
--  `erisimVar: false` doner ("Aboneliginiz bulunmuyor"). Backfill olmasaydi
--  deploy anindaki TUM mevcut firmalar kapida kalirdi.
--
--  ── KAPSAM NEDEN 'mep' ──────────────────────────────────────────────────
--  Bugun `scope` HICBIR YERDE ZORLANMIYOR (olculdu: tum backend'de scope
--  yalniz capabilities URETIMINDE ve admin YAZMA yolunda geciyor; tek bir
--  guard/servis "bu istek mechanical mi" diye sormuyor). Yani mevcut
--  kullanicilar fiilen her iki disipline de erisiyor. 'mep' vermek
--  MEVCUT DAVRANISI BIREBIR KORUR; daha dar bir kapsam vermek ise
--  bugun calisan bir seyi KAPATIRDI.
--
--  ── SEVIYE NASIL SECILIYOR ──────────────────────────────────────────────
--  TAVAN alinir (union), taban degil: firmanin herhangi bir uyesinin
--  herhangi bir etkin aboneliginde level='pro' varsa YA DA uyenin
--  User.tier'i pro/suite ise → seviye 'pro'. Sebep: capabilities bugun
--  zaten UNION olarak hesaplaniyor (capabilities.helper.ts:44-58, birden
--  fazla abonelik en yuksek yetkiye birlesir). Tabani almak erisim
--  DARALTIRDI.
--  ⚠ Bilinen ve KABUL EDILEN sapma: bir firmada (pro,mechanical) +
--  (core,electrical) gibi ASIMETRIK bir kombinasyon varsa, tek Abonelik
--  satiri bunu ifade edemez ve firma (pro,mep) alir — yani elektrikte
--  iscilik/dwg hakki GENISLER. Yon bilincli secildi: gocte fazla vermek
--  geri alinabilir, eksik vermek musteriyi kapida birakir. Asagidaki
--  NOTICE bu firmalari deploy gunlugune yazar ki elle duzeltilebilsin.
--
--  ── ODEME YONTEMI NEDEN 'HAVALE' ────────────────────────────────────────
--  Bu satirlarin iyzico'da KARSILIGI YOKTUR (iyzicoAbonelikKodu NULL).
--  'KART' isaretlenirse mutabakat/dunning taramalari onlari iyzico'ya
--  sormaya calisir. 'HAVALE' hem dogru hem de taramalarin disinda birakir.
--
--  ── SURE ────────────────────────────────────────────────────────────────
--  erisimSonu = simdi + 365 gun. Amac deploy gunu kimseyi kesmemek ve
--  operatore paketleri bilincli kurmasi icin genis bir pencere birakmak.
--  Bu bir URUN KARARI DEGIL, GOC EMNIYETIDIR.

-- 1) Miras paketleri (satisa KAPALI — fiyat sayfasinda gorunmezler)
INSERT INTO "Paket" ("id", "kod", "ad", "aciklama", "sira", "kapsam", "seviye",
                     "kullaniciHakki", "aylikTeklifHakki", "dwgAktif", "aktif", "olusturuldu")
VALUES
  (gen_random_uuid()::text, 'miras-core', 'Miras — Core (MEP)',
   'ADIM 2 gocunde olusturuldu. Satisa kapali; yalniz mevcut kullanicilarin erisimini korur.',
   900, 'mep', 'core', 5, NULL, false, false, now()),
  (gen_random_uuid()::text, 'miras-pro', 'Miras — Pro (MEP)',
   'ADIM 2 gocunde olusturuldu. Satisa kapali; yalniz mevcut kullanicilarin erisimini korur.',
   901, 'mep', 'pro', 5, NULL, true, false, now())
ON CONFLICT ("kod") DO NOTHING;

-- 2) Miras paket surumleri (tutar 0 — bu satirlar bir TAHSILATI temsil etmez)
INSERT INTO "PaketSurumu" ("id", "paketId", "surumNo", "iyzicoPlanKodu", "iyzicoUrunKodu",
                           "tutar", "paraBirimi", "periyot", "periyotAdedi", "denemeGunu",
                           "satistaMi", "olusturuldu")
SELECT gen_random_uuid()::text, p."id", 1,
       'MIRAS-' || p."kod", 'MIRAS-URUN',
       0, 'TRY', 'MONTHLY', 1, 0, false, now()
FROM "Paket" p
WHERE p."kod" IN ('miras-core', 'miras-pro')
  AND NOT EXISTS (SELECT 1 FROM "PaketSurumu" s WHERE s."paketId" = p."id");

-- 3) Asimetrik kombinasyonlari deploy gunlugune yaz (sessiz genisleme olmasin)
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT u."firmaId",
           bool_or(us."level" = 'pro')  AS pro_var,
           bool_or(us."level" = 'core') AS core_var,
           count(DISTINCT us."scope")   AS kapsam_adedi
    FROM "User" u
    JOIN "UserSubscription" us ON us."userId" = u."id" AND us."active" = true
    WHERE u."firmaId" IS NOT NULL
    GROUP BY u."firmaId"
    HAVING bool_or(us."level" = 'pro') AND bool_or(us."level" = 'core')
  LOOP
    n := n + 1;
    RAISE NOTICE 'ADIM2-BACKFILL asimetrik firma: % (pro+core birlikte, kapsam adedi %) -> (pro, mep) verildi',
      r."firmaId", r."kapsam_adedi";
  END LOOP;
  RAISE NOTICE 'ADIM2-BACKFILL asimetrik firma sayisi: %', n;
END $$;

-- 4) HER firmaya bir Abonelik. Zaten varsa dokunulmaz.
INSERT INTO "Abonelik" ("id", "firmaId", "paketSurumuId", "durum", "erisimSonu",
                        "odemeYontemi", "denemeSayisi", "olusturuldu", "guncellendi")
SELECT
  gen_random_uuid()::text,
  f."id",
  (SELECT s."id" FROM "PaketSurumu" s
     JOIN "Paket" p ON p."id" = s."paketId"
    WHERE p."kod" = CASE WHEN yetki."pro" THEN 'miras-pro' ELSE 'miras-core' END
    LIMIT 1),
  'AKTIF'::"AbonelikDurumu",
  now() + interval '365 days',
  'HAVALE'::"OdemeYontemi",
  0, now(), now()
FROM "Firma" f
LEFT JOIN LATERAL (
  SELECT bool_or(
           COALESCE(us."level" = 'pro', false) OR u."tier" IN ('pro', 'suite')
         ) AS "pro"
  FROM "User" u
  LEFT JOIN "UserSubscription" us ON us."userId" = u."id" AND us."active" = true
  WHERE u."firmaId" = f."id"
) yetki ON true
WHERE NOT EXISTS (SELECT 1 FROM "Abonelik" a WHERE a."firmaId" = f."id");

-- 5) Firma fatura kimligini elde olandan doldur (sahibinin e-postasi)
UPDATE "Firma" f
SET "yetkiliEposta" = sahip."email"
FROM (
  SELECT DISTINCT ON (u."firmaId") u."firmaId", u."email"
  FROM "User" u
  WHERE u."firmaId" IS NOT NULL
  ORDER BY u."firmaId", (u."firmaRol" = 'sahip') DESC, u."createdAt" ASC
) sahip
WHERE sahip."firmaId" = f."id" AND f."yetkiliEposta" IS NULL;
