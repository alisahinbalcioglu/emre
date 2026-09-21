/**
 * PAROLA UZUNLUK KURALI — ON YUZ KOPYASI (Gorunur kusurlar turu, 21.09).
 *
 * ⚠ KAYNAK SUNUCUDADIR: `backend/src/altyapi/auth/parola-kurali.ts` `PAROLA_MIN`.
 * Backend ve frontend AYRI npm paketleri oldugu icin import edilemez; deger
 * kopyalanir. Kopya sapmasin diye backend kapisi bu dosyayi METIN olarak okur
 * ve sayilari karsilastirir: `npm run test:parola-kapisi`
 * (backend/test/parola-kapisi-test.ts, B blogu). Sayiyi burada degistiren
 * sunucudakini de degistirmek ZORUNDADIR, yoksa CI kirmizi olur.
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────
 * 21.09'dan once bu sayi ON YUZDE DORT AYRI YERDE elle yaziliydi ve biri
 * yanlisti: `/register` ekrani "En az 6 karakter." diyordu. Kayit ucu de 6
 * kabul ediyordu ama parola DEGISTIRME, SIFIRLAMA ve ekip DAVETI 8 istiyordu.
 * Yani kullanici 6 karakterle hesap aciyor, ertesi gun ayni parolayi
 * degistiremiyordu. Ekran metni ile sunucu kurali arasindaki her ayrisma
 * kullaniciyi "ekranin tamam dedigi seyi yaptim, reddedildim" durumuna sokar.
 */
export const PAROLA_MIN = 8;

/** Alan altinda gosterilen ipucu — metin de TEK yerden uretilir. */
export const PAROLA_IPUCU = `En az ${PAROLA_MIN} karakter.`;
