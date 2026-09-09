-- FAZ 5 — onay kayitlari (5.3) + hesap kapatma (5.5).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) ONAY KAYITLARI
-- ─────────────────────────────────────────────────────────────────────────
-- Boolean DEGIL TARIH: uyusmazlikta "onayladi mi" degil "NE ZAMAN ve HANGI
-- METNI onayladi" sorulur. Ticari ileti izni AYRI tutulur — sozlesme onayina
-- yedirilmis bir pazarlama izni ETK/IYS acisindan gecersizdir.
ALTER TABLE "User" ADD COLUMN     "sozlesmeOnayiAt" TIMESTAMP(3),
ADD COLUMN     "sozlesmeSurumu" TEXT,
ADD COLUMN     "ticariIletiOnayiAt" TIMESTAMP(3),
ADD COLUMN     "kapatilanEposta" TEXT;

-- ⚠ BACKFILL YOK ve BILEREK YOK.
--
-- Mevcut 4 hesap, ORTADA BOYLE BIR METIN YOKKEN kayit oldu. Onlara
-- `sozlesmeOnayiAt = createdAt` yazmak, HIC VERILMEMIS bir onayi kayda
-- gecirmek olurdu — yani ispat icin tuttugumuz alani, ilk gunden itibaren
-- YALAN bir kayitla doldurmak. Bir onay kaydinin tek degeri dogru olmasidir.
--
-- Sonuc: mevcut kullanicilarda alan NULL kalir. Urun bunu "onay bekliyor"
-- olarak GORUR ve ilerideki bir turda o kullanicilardan onay istenebilir.
-- Yeni kayitlar `RegisterDto`daki zorunlu onay kutusuyla dolar.

-- ─────────────────────────────────────────────────────────────────────────
-- 2) HESAP KAPATMA — e-posta anonimlestirmesi icin alan
-- ─────────────────────────────────────────────────────────────────────────
-- `User.email` @unique. Hesap kapatilinca adres kilitli kalirsa kullanici
-- ayni adresle GERI DONEMEZ ve bunu geri alacak bir yol da yok (olculdu:
-- `deletedAt`i null'a ceviren tek bir satir bile yok). Kapatma aninda adres
-- `kapatilanEposta`ya tasinir, `email` anonim bir degere cekilir.
-- Buraya da BACKFILL YAZILMAZ: bugun kapatilmis hesap YOK (olculdu: 0).
