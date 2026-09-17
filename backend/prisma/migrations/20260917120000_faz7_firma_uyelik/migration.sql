-- FAZ 7 F1b — EKIP (davet + firma denetim kaydi + kisi sinirinin indeksi).
-- Yalniz EKLER: DROP / DELETE / UPDATE YOK, mevcut satirlar degismez.

-- ── 1) EKIP DAVETI ────────────────────────────────────────────────────────
-- Duz token DB'ye YAZILMAZ; `tokenHash` SHA-256 ozetidir (token-ozet.ts).
CREATE TABLE "FirmaDavet" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "eposta" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sonGecerlilik" TIMESTAMP(3) NOT NULL,
    "kabulAt" TIMESTAMP(3),
    "kabulEdenId" TEXT,
    "iptalAt" TIMESTAMP(3),
    "iptalEdenId" TEXT,
    "davetEdenId" TEXT NOT NULL,
    "davetEdenEposta" TEXT NOT NULL,
    "gonderimSayisi" INTEGER NOT NULL DEFAULT 1,
    "sonGonderimAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmaDavet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FirmaDavet_tokenHash_key" ON "FirmaDavet"("tokenHash");
CREATE INDEX "FirmaDavet_firmaId_kabulAt_iptalAt_idx" ON "FirmaDavet"("firmaId", "kabulAt", "iptalAt");
CREATE INDEX "FirmaDavet_eposta_idx" ON "FirmaDavet"("eposta");
CREATE INDEX "FirmaDavet_sonGecerlilik_idx" ON "FirmaDavet"("sonGecerlilik");

-- ⚠ ON DELETE RESTRICT (Prisma varsayilani): firma SILINMEZ; yumusak silme
-- kisiye aittir. Cascade yazmak, ileride bir firma satiri elle silindiginde
-- davet gecmisini de sessizce goturur.
ALTER TABLE "FirmaDavet" ADD CONSTRAINT "FirmaDavet_firmaId_fkey"
    FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2) FIRMA DENETIM KAYDI ────────────────────────────────────────────────
-- FK YOK (YoneticiOlayi ile ayni gerekce): silinen hesabin izi kaybolmasin.
CREATE TABLE "FirmaOlayi" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "aktorId" TEXT,
    "aktorEposta" TEXT,
    "hedefKullaniciId" TEXT,
    "hedefEposta" TEXT,
    "tip" TEXT NOT NULL,
    "oncekiDeger" TEXT,
    "yeniDeger" TEXT,
    "veri" JSONB,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmaOlayi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FirmaOlayi_firmaId_olusturuldu_idx" ON "FirmaOlayi"("firmaId", "olusturuldu");
CREATE INDEX "FirmaOlayi_hedefKullaniciId_olusturuldu_idx" ON "FirmaOlayi"("hedefKullaniciId", "olusturuldu");

-- ── 3) KISI SINIRI SIRASI ─────────────────────────────────────────────────
-- Her kimlikli istek "benden once kac etkin hesap var" sayar (§3.12).
CREATE INDEX "User_firmaId_firmaRol_createdAt_idx" ON "User"("firmaId", "firmaRol", "createdAt");

-- ── GERI ALMA (elle, gerekirse) ───────────────────────────────────────────
-- DROP INDEX "User_firmaId_firmaRol_createdAt_idx";
-- DROP TABLE "FirmaOlayi";
-- ALTER TABLE "FirmaDavet" DROP CONSTRAINT "FirmaDavet_firmaId_fkey";
-- DROP TABLE "FirmaDavet";
-- ⚠ Geri alma VERI KAYBEDER (davetler + firma denetim kaydi). Once
--   `pg_dump -t '"FirmaDavet"' -t '"FirmaOlayi"'` ile yedek alin.
