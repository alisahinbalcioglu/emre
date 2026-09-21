/**
 * PAROLA KURALLARI — tek kaynak (Faz 3.3 · 3.5 · Gorunur kusurlar turu 21.09).
 *
 * Burada IKI kural yasar ve ikisi de "ayni sey iki yerde yaziliydi, biri
 * guncellenip digeri geride kaldi" hatasindan dogdu.
 */

/**
 * ── 1) UZUNLUK ────────────────────────────────────────────────────────────
 *
 * ⚠ 21.09'a kadar ASIMETRIKTI ve asimetri URUNE SIZIYORDU: `RegisterDto`
 * ciplak `@MinLength(6)` tasiyordu, parola DEGISTIRME / SIFIRLAMA / ekip
 * daveti ise buradan 8 okuyordu. Sonuc: kendi kaydolan 6 karakterli parola
 * kurabiliyor, ertesi gun ayni parolayi DEGISTIREMIYOR (8 isteniyor),
 * davet edilen ekip arkadasi ise en bastan 8 girmek zorunda kaliyordu.
 * Ayni urunde iki parola politikasi vardi. Artik kayit da BURADAN okur.
 *
 * ⚠ MEVCUT KULLANICILAR ETKILENMEZ: `LoginDto`da uzunluk kapisi YOKTUR
 * (login.dto.ts) — 2026 oncesi belirlenmis 6 karakterlik parolalar
 * calismaya devam eder. Bu bir politika SIKILASMASIDIR: kullanici
 * parolasina her DOKUNDUGUNDA yeni kurala uyar.
 *
 * ⚠ ON YUZ KOPYASI: `frontend/ortak/lib/parola-kurali.ts`. Ayri npm paketi
 * oldugu icin import EDILEMEZ, kopyalanir. Kopyanin sapmasini
 * `npm run test:parola-kapisi` (backend/test/parola-kapisi-test.ts) yakalar —
 * bu sayiyi degistiren, orayi da degistirmek ZORUNDADIR yoksa CI kirmizi.
 */
export const PAROLA_MIN = 8;

export const PAROLA_MESAJI = `Parola en az ${PAROLA_MIN} karakter olmalıdır.`;

/**
 * ── 2) YANLIS PAROLA YANITI — OTURUMLU UCLAR ICIN ─────────────────────────
 *
 * ⚠ 400, 401 DEGIL. Oturum ACIKKEN govdede gelen yanlis parola bir KIMLIK
 * hatasi degil ISTEK hatasidir. 401 donuldugu surece `frontend/ortak/lib/api.ts`
 * yakalayicisi (oradaki 67-83. satirlar) token'i siler ve kullaniciyi
 * `/login`e atardi: "parola degistir" ekranina yanlis parola yazan kisi
 * neden atildigini bile ogrenemeden disari dusuyordu.
 *
 * ⚠ Yakalayiciyi gevsetmek YANLIS COZUMDU: `/auth/change-password` ve
 * `/auth/hesabimi-kapat` KORUMALI uclardir; oradan gelen 401 GERCEKTEN
 * oturum dusmesidir (JwtAuthGuard) ve sessizlestirilemez. Kusur sunucunun
 * anlami yanlis kodla anlatmasiydi.
 *
 * Desen Faz 7'de kondu, ucuncu bir desen icat EDILMEDI:
 *   · mfa/mfa.servisi.ts:105-108 + :392-395 (ayni govde, ayni `kod`)
 *   · kurumsal/kurumsal-giris.servisi.ts:1181
 * `message` anahtari (`mesaj` degil) BILINCLI: ekranlar hem
 * `kimlikHataMetni()` (kod -> metin sozlugu) hem duz `data.message` ile
 * okuyor; `message` ikisini birden besler.
 */
export const PAROLA_HATALI_YANIT = {
  kod: 'PAROLA_HATALI',
  message: 'Parolanız hatalı.',
};
