/**
 * HUKUKI METIN SURUMU (FAZ 5.3).
 *
 * Kullanicinin kayit sirasinda onayladigi metnin surumu `User.sozlesmeSurumu`
 * alanina YAZILIR. Neden surum tutuluyor:
 *
 * Bir onay kaydinin degeri "onayladi" bilgisinde degil, HANGI METNI
 * onayladigi bilgisindedir. Metin degistiginde eski onay yeni metni
 * KAPSAMAZ; surum tutulmazsa, bir uyusmazlikta kullanicinin kabul ettigi
 * metnin ne oldugu geri getirilemez ve elimizdeki kayit ise yaramaz.
 *
 * ⚠ SURUMU DEGISTIRME KURALI: hukuki metinlerin ANLAMINI degistiren her
 * duzenlemede burasi da artirilir (yazim duzeltmesi icin gerekmez).
 * Artirdiginizda, eski surumu onaylamis kullanicilardan yeniden onay
 * istenmesi GEREKEBILIR — bu bir urun/hukuk karari, kod karari degil.
 *
 * ⚠ IKIZ: ayni deger on yuzde de duruyor
 * (`frontend/ozellik/hukuki/metinler.ts` → `HUKUKI_METIN_SURUMU`).
 * Iki paket ayri derlendigi icin ortak import mumkun degil; ikisinin ayni
 * kalmasi `npm run test:faz5` kapisinda OLCULUYOR.
 */
export const HUKUKI_METIN_SURUMU = '2026-09-09';
