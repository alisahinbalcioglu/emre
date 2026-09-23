import type { JwtService } from '@nestjs/jwt';
import { jwtSecret } from './jwt-secret';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — TOKEN IMZASI TEK YERDE (§3.11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `AuthService.signToken` govdesi buraya tasindi; servis ona DELEGE eder.
 *  Gerekce: F2b (MFA) ve F3b (kurumsal giris) de token basacak ve imza
 *  kurali (anahtar + sure + payload sekli) uc yerde kopyalanirsa biri
 *  gunun birinde `authAt` yazmayi unutur.
 *
 *  ── `authAt` NEDIR (R1-Y1) ───────────────────────────────────────────────
 *  BIRINCIL KIMLIK DOGRULAMA ANI (saniye). `iat` "bu token ne zaman
 *  basildi" der; `authAt` "kullanici parolasini/MFA'sini/kurumsal hesabini
 *  EN SON NE ZAMAN kanitladi" der. Ikisi ayrilmasa, taze token basan her
 *  islem (or. MFA kurulumu) yakin-zaman kanitini kendi kendine tazeler ve
 *  parolasiz hesapta MFA'yi KAPATMAYI acardi (olculmus saldiri zinciri).
 *
 *  · YENI DEGER basanlar: `login`, `register`, `davet-kabul`,
 *    `change-password` (mevcut parolayi dogrular → birincildir), F2b
 *    `mfa/dogrula` + `mfa/zorunlu-kurulum/onayla`, F3b `sso/degis`+`sso/katil`.
 *  · ESKI DEGERI KOPYALAYANLAR (yeniden basim): F2b `mfa/kurulum/onayla`,
 *    `mfa/kapat`. Eski token'da `authAt` yoksa yenisinde de YOKTUR.
 *
 *  ⚠ `authAt: null` → payload'a alan HIC KONMAZ (eski token'larla ayni sekil).
 *  Okuyan taraf (`yakinZamandaGirisMi`) `null`u "yakin zaman kaniti YOK"
 *  sayar — fail-closed.
 */
export function tokenImzala(
  jwtService: JwtService,
  id: string,
  email: string,
  role: string,
  authAt: number | null,
  /**
   * ── `mfa` IDDIASI (23.09.2026) ─────────────────────────────────────────
   * "Bu token IKINCI ADIM GECILEREK alindi." YALNIZ `mfa/dogrula` true
   * gecer; varsayilan `false` oldugu icin diger cagiranlar DEGISMEDI.
   *
   * ⚠ NEDEN GEREKTI: yonetici girisinde kod artik e-postadan geliyor ve o
   * yolda TOTP kurulumu YOK, yani `mfaAcikAt` HIC dolmuyor. `jwt.strategy`
   * ise yoneticiyi `mfaAcikAt` ile suzuyordu; sonuc: kod dogru girilip
   * token aliniyor, ILK istekte 401 `MFA_KURULUM_GEREKLI` yeniyor ve
   * kullanici giris ekranina geri atiliyordu. CANLIDA YASANDI.
   *
   * ⚠ ESKI TOKEN'LAR BU IDDIAYI TASIMAZ ve tasimamalidir: stratejideki
   * kuralin asil amaci "deploy aninda elde duran 7 gunluk token bir sonraki
   * istekte dussun" idi. Iddia yoksa yonetici yeniden giris yapar — koruma
   * AYNEN durur, yalnizca dayanagi `mfaAcikAt`tan IKINCI ADIM KANITINA
   * tasindi.
   */
  ikinciAdim = false,
): string {
  const payload: Record<string, unknown> = { sub: id, email, role };
  if (authAt !== null) payload.authAt = Math.floor(authAt);
  if (ikinciAdim) payload.mfa = true;
  return jwtService.sign(payload, {
    // KL P1-a: yedek deger yok — anahtar tek kaynaktan (jwt-secret.ts).
    // Sure kurali DEGISMEDI (JWT_EXPIRES_IN ?? 7d).
    secret: jwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
