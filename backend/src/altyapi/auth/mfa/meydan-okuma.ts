import { UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { sign, verify } from 'jsonwebtoken';
import { jwtSecret } from '../jwt-secret';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MEYDAN OKUMA TOKEN'I — parola doğru, ikinci adım bekleniyor  (F2a · §4.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Parola (ya da kurumsal giriş) doğrulandıktan sonra, iki adımlı kod
 *  girilene kadar istemcide duran KISA ömürlü (300 sn) token. OTURUM DEĞİLDİR:
 *  hiçbir korumalı uçta geçmemeli. EN KRİTİK BAĞLANTI KAPISI budur — bu token
 *  erişim token'ı gibi kabul edilirse ikinci adım tamamen atlanır.
 *
 *  ── KATMAN 1: AYRI ANAHTAR (bu dosya) ──────────────────────────────────────
 *  İmza anahtarı `JWT_SECRET`'in KENDİSİ DEĞİL, ondan HMAC ile türetilen ayrı
 *  bir anahtardır. `JwtStrategy` (`secretOrKey: jwtSecret()`) bu token'ı İMZA
 *  aşamasında reddeder; `validate` hiç çağrılmaz. Türetme sayesinde yeni bir
 *  ortam değişkeni gerekmez ve JWT_SECRET döndürülünce meydan okumalar da
 *  kendiliğinden geçersizleşir.
 *  (Katman 2 — stratejide `amac`/`aud` taşıyan token'ın açık reddi — F2b'dedir.)
 *
 *  ── NESTJS JWT SERVİSİ KULLANILMAZ ─────────────────────────────────────────
 *  `getSecretKey` sırası `options.secret || modül secret || options.privateKey/
 *  publicKey` (10.2.0, `jwt.service.js:104-113` okundu): modülde JWT_SECRET
 *  tanımlı olduğu için çağrıda `privateKey`/`publicKey` ile verilen anahtar
 *  SESSİZCE EZİLİR — "ayrı anahtarla imzaladım" sanılır, JWT_SECRET ile
 *  imzalanır ve katman 1 yok olur. Tek bir seçenek adına bağlı kalmamak için
 *  doğrudan `jsonwebtoken` kullanılır; kaynak kapısı (`test:faz7-totp` T9)
 *  o paketin buraya import edilmediğini ölçer.
 *
 *  Bu fonksiyon DB OKUMAZ. Doğrulayan uç (F2b) ayrıca kullanıcıyı okur ve
 *  `hesapKapisi` + `iat >= floor(passwordChangedAt/1000)` kuralını uygular —
 *  bunun için `iat` döndürülür.
 */

export type MeydanOkumaAmaci = 'mfa-dogrula' | 'mfa-kurulum';
export type MeydanOkumaYolu = 'parola' | 'kurumsal';

export const MEYDAN_OKUMA_OMRU_SN = 300;
const KITLE = 'metaprice:mfa';
const YAYINCI = 'metaprice-api';
const TURETME_ETIKETI = 'metaprice/mfa-meydan-okuma/v1';

/** JWT_SECRET'ten türetilen AYRI imza anahtarı (32 bayt). */
export function meydanOkumaAnahtari(): Buffer {
  return createHmac('sha256', jwtSecret()).update(TURETME_ETIKETI).digest();
}

export function meydanOkumaImzala(g: {
  userId: string;
  amac: MeydanOkumaAmaci;
  yol: MeydanOkumaYolu;
}): string {
  if (typeof g.userId !== 'string' || g.userId === '') {
    throw new TypeError('meydanOkumaImzala: userId boş olamaz');
  }
  return sign({ sub: g.userId, amac: g.amac, yol: g.yol }, meydanOkumaAnahtari(), {
    algorithm: 'HS256',
    expiresIn: MEYDAN_OKUMA_OMRU_SN,
    audience: KITLE,
    issuer: YAYINCI,
    jwtid: randomUUID(),
  });
}

function gecersiz(): UnauthorizedException {
  return new UnauthorizedException({
    kod: 'MEYDAN_OKUMA_GECERSIZ',
    message: 'Doğrulama süresi doldu ya da geçersiz. Lütfen yeniden giriş yapın.',
  });
}

/**
 * Doğrular; her ret AYNI 401 `MEYDAN_OKUMA_GECERSIZ` (neden istemciye
 * söylenmez — süre mi doldu, amaç mı yanlış, imza mı bozuk ayırt edilmez).
 * `beklenenAmac` ZORUNLU: kurulum için basılmış token doğrulama ucunda, ya da
 * tersi, geçmemeli.
 */
export function meydanOkumaDogrula(
  token: string,
  beklenenAmac: MeydanOkumaAmaci,
): { userId: string; yol: MeydanOkumaYolu; iat: number } {
  if (typeof token !== 'string' || token === '') throw gecersiz();
  let yuk: unknown;
  try {
    yuk = verify(token, meydanOkumaAnahtari(), {
      algorithms: ['HS256'],
      audience: KITLE,
      issuer: YAYINCI,
      clockTolerance: 5,
    });
  } catch {
    throw gecersiz();
  }
  if (typeof yuk !== 'object' || yuk === null) throw gecersiz();
  const p = yuk as Record<string, unknown>;
  if (p.amac !== beklenenAmac) throw gecersiz();
  if (typeof p.sub !== 'string' || p.sub === '') throw gecersiz();
  if (p.yol !== 'parola' && p.yol !== 'kurumsal') throw gecersiz();
  // `jsonwebtoken` exp'i ZORUNLU TUTMAZ (verify.js yalnız varsa denetler):
  // süresiz bir meydan okuma kabul edilmemeli.
  if (typeof p.exp !== 'number' || typeof p.iat !== 'number') throw gecersiz();
  return { userId: p.sub, yol: p.yol, iat: p.iat };
}
