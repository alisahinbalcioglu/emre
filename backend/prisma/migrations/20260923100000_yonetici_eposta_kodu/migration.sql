-- YONETICI GIRISINDE E-POSTA KODU (23.09.2026 — Emre karari)
--
-- Emre TOTP kurulumunu tamamlayamadi ("bu yontemle giris yapamiyorum ve cok
-- zor geldi") ve yontemin degismesini istedi. Yonetici hesabinda iki adimli
-- giris ZORUNLU (`mfaZorunluMu`: role === 'admin'), yani atlanabilir bir
-- ekran degildi: kurulum tamamlanmadan yoneticiye giris yok.
--
-- ⚠ KARAR BILEREK GERI ALINDI. 21.09'da e-posta OTP degerlendirilmis ve
-- REDDEDILMISTI; gerekce Emre'ye bu turda yeniden soylendi: parola sifirlama
-- da ayni posta kutusundan yapiliyor ve MFA'yi temizlemiyor, yani kutuyu ele
-- geciren kisi hem parolayi sifirlar hem kodu ayni yerde gorur — iki adim tek
-- adima iner. Emre karari tekrarladi; secim musteriye aittir ve burada
-- KAYITLIDIR.
--
-- YALNIZ EKLER: DROP / DELETE / UPDATE YOK. Uc alan da NULL baslar, yani
-- bu migration tek basina hicbir kullanicinin giris yolunu DEGISTIRMEZ —
-- davranisi degistiren sey koddaki `girisKarariSaf` dalidir.
--
-- ⚠ TOTP ALANLARINA DOKUNULMADI: TOTP'si acik kullanicilar (firma geneli
-- MFA zorunlulugu ya da kisinin kendi actigi) aynen calismaya devam eder.

ALTER TABLE "User" ADD COLUMN "mfaEpostaKoduOzeti"   TEXT;
ALTER TABLE "User" ADD COLUMN "mfaEpostaKoduAt"      TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaEpostaSonGonderim" TIMESTAMP(3);
