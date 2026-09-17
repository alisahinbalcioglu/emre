import { createHash, randomBytes } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PKCE (RFC 7636) + akış rastgeleleri — Faz 7 · F3a · tasarım §5.3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Yalnız S256: `code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))`
 *  (RFC 7636 §4.2). `plain` yöntemi KULLANILMAZ — meydan = doğrulayıcı olursa
 *  yetkilendirme adresini gören (tarayıcı geçmişi, günlük, Referer) kodu da
 *  değiştirebilir; PKCE'nin bütün anlamı biter. Doğruluk RFC 7636 Ek-B
 *  vektörüyle mühürlüdür (`test:faz7-oidc` O16).
 *
 *  `state` ve `nonce` da buradan üretilir: 32 bayt = 256 bit, base64url
 *  (43 karakter — RFC 7636 doğrulayıcı alt sınırı 43).
 */

/** Kriptografik rastgele, base64url (dolgusuz). */
export function rastgeleDizge(bayt = 32): string {
  if (!Number.isInteger(bayt) || bayt < 32 || bayt > 96) {
    throw new RangeError('rastgeleDizge: bayt 32-96 arası tam sayı olmalı');
  }
  return randomBytes(bayt).toString('base64url');
}

/** RFC 7636 §4.2 S256 meydanı. */
export function pkceMeydani(dogrulayici: string): string {
  return createHash('sha256').update(dogrulayici, 'ascii').digest('base64url');
}

/** Tek kullanımlık doğrulayıcı + S256 meydanı. */
export function pkceUret(): { dogrulayici: string; meydan: string } {
  const dogrulayici = rastgeleDizge(32);
  return { dogrulayici, meydan: pkceMeydani(dogrulayici) };
}
