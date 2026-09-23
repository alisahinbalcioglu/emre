-- EKIP & IZINLER — ALT KULLANICI MODUL IZINLERI (23.09.2026)
--
-- Firma sahibi, alt kullanicinin hangi modullere girebilecegini secer:
-- Excel kesif · DWG proje · firmanin tum teklifleri ve tutarlari ·
-- Kutuphanem. Kural tek yerde: `backend/src/ozellik/firma/uye-izinleri.ts`.
-- Emre karari: "Son teklifler & tutar" kapaliysa kisi YALNIZ KENDI
-- hazirladigi teklifleri gorur.
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK.
--
-- ⚠ HICBIR MEVCUT KULLANICININ ERISIMI KESILMEZ: varsayilan DORT izin.
-- PostgreSQL 11+ sabit varsayilanli `ADD COLUMN`da mevcut satirlar bu
-- degeri okur (tablo yeniden yazilmaz). Ozellik gelmeden once her uye her
-- seyi goruyordu; bugunku davranis aynen surer, sahip isterse daraltir.
-- Sahip rolundeki hesaplarda liste zaten OKUNMAZ (her zaman tam yetkili).
--
-- ⚠ NOT NULL YOK — BILEREK: SQL, `prisma migrate diff`in bu sema icin
-- urettigi metinle BIREBIR aynidir. Prisma liste kolonlarini NOT NULL
-- yazmaz; burada eklenseydi sema ile veritabani arasinda kalici bir
-- "drift" farki dogardi. NULL'a karsi koruma kodda: `izinVarMi` dizi
-- olmayan degeri uye icin IZINSIZ sayar (fail-closed).

-- CreateEnum
CREATE TYPE "UyeIzni" AS ENUM ('excel', 'dwg', 'firmaTeklifleri', 'kutuphane');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "izinler" "UyeIzni"[] DEFAULT ARRAY['excel', 'dwg', 'firmaTeklifleri', 'kutuphane']::"UyeIzni"[];

-- AlterTable
ALTER TABLE "FirmaDavet" ADD COLUMN     "izinler" "UyeIzni"[] DEFAULT ARRAY['excel', 'dwg', 'firmaTeklifleri', 'kutuphane']::"UyeIzni"[];
