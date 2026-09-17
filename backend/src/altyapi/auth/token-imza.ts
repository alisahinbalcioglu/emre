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
): string {
  const payload: Record<string, unknown> = { sub: id, email, role };
  if (authAt !== null) payload.authAt = Math.floor(authAt);
  return jwtService.sign(payload, {
    // KL P1-a: yedek deger yok — anahtar tek kaynaktan (jwt-secret.ts).
    // Sure kurali DEGISMEDI (JWT_EXPIRES_IN ?? 7d).
    secret: jwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
