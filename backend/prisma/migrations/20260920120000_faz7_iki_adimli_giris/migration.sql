-- FAZ 7 F2b — IKI ADIMLI GIRIS (TOTP: kullanici kolonlari + kurtarma kodu
-- tablosu + firma zorunluluk anahtari).
-- Yalniz EKLER: DROP / DELETE / UPDATE YOK, mevcut satirlar degismez.
-- BACKFILL YOK: her yeni kolon NULL ya da varsayilanli, kimsenin girisi
-- bu migration ile degismez (zorunluluk ayri bir kullanici eylemiyle acilir).

-- ── 1) KULLANICI: TOTP ALANLARI ──────────────────────────────────────────
-- `mfaAcikAt` TEK dogru kaynaktir (ayri bir boolean tutulsaydi ikisi gunun
-- birinde ayrisirdi). `mfaKaynagi` kurumsal giriste kod sorulup
-- sorulmayacagini belirler (R1/E-4).
ALTER TABLE "User" ADD COLUMN "mfaSirriSifreli" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaAcikAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaKaynagi" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaSonAdim" INTEGER;
ALTER TABLE "User" ADD COLUMN "mfaBekleyenSirSifreli" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaBekleyenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaHataSayaci" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "mfaKilitliAt" TIMESTAMP(3);

-- ── 2) KURTARMA KODLARI ──────────────────────────────────────────────────
-- Ozet bcrypt(10); duz kod yalniz uretildigi yanitta gorunur.
CREATE TABLE "MfaKurtarmaKodu" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kodOzeti" TEXT NOT NULL,
    "kullanildiAt" TIMESTAMP(3),
    "olusturuldu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaKurtarmaKodu_pkey" PRIMARY KEY ("id")
);

-- Dogrulama "bu kullanicinin KULLANILMAMIS kodlari" sorgusudur.
CREATE INDEX "MfaKurtarmaKodu_userId_kullanildiAt_idx" ON "MfaKurtarmaKodu"("userId", "kullanildiAt");

ALTER TABLE "MfaKurtarmaKodu" ADD CONSTRAINT "MfaKurtarmaKodu_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3) FIRMA ZORUNLULUK ANAHTARI ─────────────────────────────────────────
-- Varsayilan false: bu migration hicbir firmada zorunluluk ACMAZ.
ALTER TABLE "Firma" ADD COLUMN "mfaZorunlu" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
--  GERI ALMA (elle; kod geri alinirsa kolonlar ZARARSIZ kalir — hepsi
--  nullable ya da varsayilanli, sema geri alma ZORUNLU DEGIL):
--
--    DROP TABLE "MfaKurtarmaKodu";
--    ALTER TABLE "Firma" DROP COLUMN "mfaZorunlu";
--    ALTER TABLE "User" DROP COLUMN "mfaKilitliAt";
--    ALTER TABLE "User" DROP COLUMN "mfaHataSayaci";
--    ALTER TABLE "User" DROP COLUMN "mfaBekleyenAt";
--    ALTER TABLE "User" DROP COLUMN "mfaBekleyenSirSifreli";
--    ALTER TABLE "User" DROP COLUMN "mfaSonAdim";
--    ALTER TABLE "User" DROP COLUMN "mfaKaynagi";
--    ALTER TABLE "User" DROP COLUMN "mfaAcikAt";
--    ALTER TABLE "User" DROP COLUMN "mfaSirriSifreli";
-- ═══════════════════════════════════════════════════════════════════════════
