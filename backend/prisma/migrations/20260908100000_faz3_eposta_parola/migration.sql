-- FAZ 3 — e-posta dogrulama + parola sifirlama/degistirme altyapisi.
--
-- SIRA ONEMLI: once sutun eklenir (DEFAULT false ile), SONRA mevcut satirlar
-- true'ya cekilir. Ters sirada yazilamaz; DEFAULT'u true yapip sonra
-- dusurmek ise YENI kayitlari da dogrulanmis sayardi.

-- AlterTable: e-posta dogrulama + parola degisim damgasi (3.4 · 3.5)
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- GOC (3.4): MEVCUT hesaplar dogrulanmis sayilir.
-- Bu satir olmadan bugunku kullanicilar bir gecede kendi urunlerinden
-- kilitlenirdi (dogrulanmamis uyari seridi + ileride konulacak her kapi).
-- Yeni kayitlar sutunun DEFAULT'u ile false baslar; bu UPDATE onlari ETKILEMEZ
-- cunku migration bir kez, gecmise donuk kosar.
UPDATE "User" SET "emailVerified" = true;

-- NOT: "passwordChangedAt" BILEREK NULL birakildi. Doldurulsaydi, gocun
-- kostugu andan ONCE imzalanmis TUM gecerli token'lar (7 gun omurlu) aninda
-- reddedilir ve butun kullanicilar sebepsiz yere disari atilirdi.
-- NULL = "parola hic degismedi" = jwt.strategy'deki iat kapisi bu hesap icin
-- hicbir token'i reddetmez.

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
