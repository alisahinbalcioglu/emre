/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — FIRMA OLAY TIPLERI SOZLUGU (§2.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `FirmaOlayi.tip` serbest metin DEGIL: tek sabit dizi. Serbest birakilirsa
 *  ayni olay iki yerde `uye.cikarildi` ve `uye_cikarildi` diye yazilir, sonra
 *  hicbir rapor dogru saymaz.
 *
 *  ⚠ SIR TASIMAZ (R1-D4): `veri`, `oncekiDeger`, `yeniDeger` alanlarina
 *  istemci sirri, `v1.` onekli sifreli deger, TOTP sirri, kurtarma kodu ya
 *  da token YAZILMAZ. Sir degisikligi yalniz `{ sirDegisti: true }`.
 */

export const FIRMA_OLAY_TIPLERI = [
  // ── F1b: ekip ──────────────────────────────────────────────────────────
  'davet.olusturuldu',
  'davet.yeniden-gonderildi',
  'davet.iptal',
  /// Firmanin son kullanicisi ayrilinca bekleyen davetler otomatik iptal olur
  /// (kapanan firmaya katilim olmasin).
  'davet.otomatik-iptal',
  /// veri: { yol: 'davet' | 'kurumsal-giris' }
  'uye.katildi',
  'uye.cikarildi',
  /// Kisi KENDI hesabini kapatti.
  'uye.ayrildi',
  /// Platform yoneticisi sildi (E-1). Ayrica `YoneticiOlayi`na da yazilir.
  'uye.yonetici-sildi',
  'rol.degisti',
  /// 23.09.2026 — sahip alt kullanicinin modul izinlerini degistirdi.
  /// `oncekiDeger`/`yeniDeger` kanonik sirada "excel,dwg" metni.
  'uye.izinleri',
  /// Platform yoneticisi firma rolunu degistirdi (§3.3 son satir).
  'yonetici.sahip-atadi',
  // ── F2b: iki adimli giris ──────────────────────────────────────────────
  'guvenlik.mfa-zorunlu',
  // ── F3b: kurumsal giris ────────────────────────────────────────────────
  'kurumsal-giris.kaydedildi',
  'kurumsal-giris.dogrulandi',
  'kurumsal-giris.etkinlestirildi',
  'kurumsal-giris.kapatildi',
  'kurumsal-giris.silindi',
  'kurumsal-giris.zorunlu-degisti',
  'kurumsal-baglanti.eklendi',
  'kurumsal-baglanti.kaldirildi',
  'yonetici.alan-adi-kaldirdi',
] as const;

export type FirmaOlayTipi = (typeof FIRMA_OLAY_TIPLERI)[number];

/**
 * ⚠ DURDURMA OLAY URETMEZ. Kisi siniri asiminda hesabin durdurulmasi
 * (§3.12) TURETILMIS bir durumdur, bir islem degil: her istekte yeniden
 * hesaplanir. Olay yazmak, tek bir kullanicinin gun icinde yuzlerce satir
 * uretmesi demek olurdu.
 */
export const DURDURMA_OLAY_URETMEZ = true;
