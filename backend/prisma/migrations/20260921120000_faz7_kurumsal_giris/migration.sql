-- FAZ 7 F3b — KURUMSAL GIRIS (OIDC): saglayici ayari, dogrulanmis alan
-- adlari, dis kimlik eslemesi, akis durumu ve `User.parolaTanimli`.
-- Yalniz EKLER: DROP / DELETE / UPDATE YOK, mevcut satirlar degismez.
-- BACKFILL YOK: `parolaTanimli` varsayilani true — bugunku her hesabin
-- parolasi vardir ve hicbir giris bu migration ile degismez.
-- ⚠ Ayni migration'da enum OLUSTURUP KULLANMAK guvenlidir: `CREATE TYPE`
-- transaction'lidir; kisit yalniz `ALTER TYPE … ADD VALUE`'dadir.

-- ── 1) ENUM TIPLERI ──────────────────────────────────────────────────────
CREATE TYPE "KimlikSaglayiciTipi" AS ENUM ('entra', 'google');
CREATE TYPE "KimlikSaglayiciDurumu" AS ENUM ('TASLAK', 'DOGRULANDI', 'ETKIN', 'KAPALI');

-- ── 2) FIRMA KIMLIK SAGLAYICISI (firma basina TEK) ───────────────────────
CREATE TABLE "FirmaKimlikSaglayici" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "tip" "KimlikSaglayiciTipi" NOT NULL,
    "entraKiraciId" TEXT,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "istemciSirriSifreli" TEXT NOT NULL,
    "istemciSirriSonGecerlilik" TIMESTAMP(3),
    "beyanAlanAdlari" TEXT[],
    "durum" "KimlikSaglayiciDurumu" NOT NULL DEFAULT 'TASLAK',
    "jitKatilim" BOOLEAN NOT NULL DEFAULT true,
    "zorunlu" BOOLEAN NOT NULL DEFAULT false,
    "sonSinamaAt" TIMESTAMP(3),
    "sonHataKodu" TEXT,
    "sonSirUyarisiAt" TIMESTAMP(3),
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellendi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmaKimlikSaglayici_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FirmaKimlikSaglayici_firmaId_key" ON "FirmaKimlikSaglayici"("firmaId");

ALTER TABLE "FirmaKimlikSaglayici" ADD CONSTRAINT "FirmaKimlikSaglayici_firmaId_fkey"
    FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3) DOGRULANMIS ALAN ADI ──────────────────────────────────────────────
-- Alan adi PK'dir: bir alan adi TUM SISTEMDE en fazla BIR firmada
-- dogrulanabilir. Beyan (TASLAK) tekil DEGIL — saldirgan baskasinin alan
-- adini "once yazarak" gercek firmayi engelleyemesin.
CREATE TABLE "DogrulanmisAlanAdi" (
    "alanAdi" TEXT NOT NULL,
    "saglayiciId" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "dogrulayanId" TEXT NOT NULL,
    "dogrulandiAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DogrulanmisAlanAdi_pkey" PRIMARY KEY ("alanAdi")
);

CREATE INDEX "DogrulanmisAlanAdi_firmaId_idx" ON "DogrulanmisAlanAdi"("firmaId");

ALTER TABLE "DogrulanmisAlanAdi" ADD CONSTRAINT "DogrulanmisAlanAdi_saglayiciId_fkey"
    FOREIGN KEY ("saglayiciId") REFERENCES "FirmaKimlikSaglayici"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4) KULLANICI DIS KIMLIGI ─────────────────────────────────────────────
-- `(issuer, subject)` esleme anahtaridir; `(userId, issuer)` bir kisinin ayni
-- saglayicida IKI kimlik tasimasini engeller.
CREATE TABLE "KullaniciDisKimlik" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saglayiciId" TEXT,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "entraKiraciId" TEXT,
    "epostaAnlik" TEXT,
    "baglamaYolu" TEXT NOT NULL,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sonGirisAt" TIMESTAMP(3),

    CONSTRAINT "KullaniciDisKimlik_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KullaniciDisKimlik_issuer_subject_key" ON "KullaniciDisKimlik"("issuer", "subject");
CREATE UNIQUE INDEX "KullaniciDisKimlik_userId_issuer_key" ON "KullaniciDisKimlik"("userId", "issuer");
CREATE INDEX "KullaniciDisKimlik_saglayiciId_idx" ON "KullaniciDisKimlik"("saglayiciId");

ALTER TABLE "KullaniciDisKimlik" ADD CONSTRAINT "KullaniciDisKimlik_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KullaniciDisKimlik" ADD CONSTRAINT "KullaniciDisKimlik_saglayiciId_fkey"
    FOREIGN KEY ("saglayiciId") REFERENCES "FirmaKimlikSaglayici"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5) SSO AKISI ─────────────────────────────────────────────────────────
-- ⚠ CEREZ YOK: tarayici bagi `sessionStorage` sekme sirrinin OZETIDIR.
CREATE TABLE "SsoAkisi" (
    "id" TEXT NOT NULL,
    "durumOzeti" TEXT NOT NULL,
    "tarayiciBagiOzeti" TEXT NOT NULL,
    "saglayiciId" TEXT NOT NULL,
    "amac" TEXT NOT NULL,
    "baslatanUserId" TEXT,
    "nonce" TEXT NOT NULL,
    "pkceDogrulayici" TEXT NOT NULL,
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sonGecerlilik" TIMESTAMP(3) NOT NULL,
    "donusAt" TIMESTAMP(3),
    "dogrulanmisKimlik" JSONB,
    "sonucKoduOzeti" TEXT,
    "sonucSonGecerlilik" TIMESTAMP(3),
    "sonucKullanildiAt" TIMESTAMP(3),
    "hataKodu" TEXT,
    "biletOzeti" TEXT,
    "biletSonGecerlilik" TIMESTAMP(3),
    "biletKullanildiAt" TIMESTAMP(3),

    CONSTRAINT "SsoAkisi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SsoAkisi_durumOzeti_key" ON "SsoAkisi"("durumOzeti");
CREATE UNIQUE INDEX "SsoAkisi_sonucKoduOzeti_key" ON "SsoAkisi"("sonucKoduOzeti");
CREATE UNIQUE INDEX "SsoAkisi_biletOzeti_key" ON "SsoAkisi"("biletOzeti");
CREATE INDEX "SsoAkisi_sonGecerlilik_idx" ON "SsoAkisi"("sonGecerlilik");

-- ── 6) PAROLASIZ HESAP BAYRAGI ───────────────────────────────────────────
-- Varsayilan true: bugunku her hesabin parolasi vardir.
ALTER TABLE "User" ADD COLUMN "parolaTanimli" BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
--  GERI ALMA (elle; kod geri alinirsa tablolar ve kolon ZARARSIZ kalir —
--  hepsi yeni ya da varsayilanli, sema geri alma ZORUNLU DEGIL):
--
--    ALTER TABLE "User" DROP COLUMN "parolaTanimli";
--    DROP TABLE "SsoAkisi";
--    DROP TABLE "KullaniciDisKimlik";
--    DROP TABLE "DogrulanmisAlanAdi";
--    DROP TABLE "FirmaKimlikSaglayici";
--    DROP TYPE "KimlikSaglayiciDurumu";
--    DROP TYPE "KimlikSaglayiciTipi";
-- ═══════════════════════════════════════════════════════════════════════════
