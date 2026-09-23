/**
 * 23.09.2026 — YOL → UYE IZNI (saf, IMPORT'SUZ).
 *
 * Kabuktaki `UyeIzniKapisi` bu karari okur: izni kapali alt kullanici bu
 * yollara girdiginde sayfa ICERIGI yerine tek bir "izniniz yok" ekrani cizilir.
 *
 * ⚠ NEDEN SAYFA SAYFA DEGIL — `ErisimKapisi` (22.09) ile AYNI gerekce:
 * sunucu dogru davranir (403 `UYE_IZNI_YOK`), ama sayfalar 403'u genel hata
 * sanip kirmizi bildirim basar. Yol listesi TEK yerde durur.
 *
 * ⚠ YALNIZ SAYFANIN TAMAMI IZNE BAGLIYSA listeye girer. `/quotes/new` Excel,
 * DWG ve elle girisi bir arada tasir; orada yalniz ilgili yukleme alani
 * kilitlenir, sayfa durdurulmaz. `/materials` (Malzeme Havuzu) izne BAGLI
 * DEGIL — yalniz "Kütüphaneme Aktar" dugmesi.
 *
 * ⚠ Arka yuzdeki ikizi: `@UyeIzniGerekli('kutuphane')` sinif duzeyinde
 * `library` + `labor-firms` denetleyicileri; DWG uclari `DWG_YUKLE`den.
 */
import type { UyeIzni } from './izin-metinleri';

const YOL_IZINLERI: readonly { yol: RegExp; izin: UyeIzni }[] = [
  { yol: /^\/library(\/|$)/, izin: 'kutuphane' },
  { yol: /^\/labor-firms(\/|$)/, izin: 'kutuphane' },
  { yol: /^\/dwg-workspace(\/|$)/, izin: 'dwg' },
];

/** Bu yol hangi izni ister? (`null` → izin gerekmez.) */
export function yolunIzni(yol: string): UyeIzni | null {
  return YOL_IZINLERI.find((k) => k.yol.test(yol))?.izin ?? null;
}

/**
 * Sayfa durdurulsun mu? `izinVar` saglayicidan gelir (bilinmiyorsa `true` —
 * gercek kapi sunucuda; ekran bosaltilmaz).
 */
export function uyeIzniDurdurulsunMu(yol: string, izinVar: (i: UyeIzni) => boolean): UyeIzni | null {
  const izin = yolunIzni(yol);
  return izin && !izinVar(izin) ? izin : null;
}
