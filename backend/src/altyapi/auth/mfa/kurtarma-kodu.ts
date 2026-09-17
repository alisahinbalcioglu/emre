import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KURTARMA KODLARI — üretim, normalizasyon, özet  (Faz 7 · F2a · §4.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  10 kod · Crockford base32 alfabesi · 10 karakter (50 bit) · gösterim
 *  `ABCDE-FGHJK`. Kodlar YALNIZ üretildiği yanıtta düz görünür; DB'ye bcrypt
 *  özeti yazılır.
 *
 *  ── NEDEN bcrypt (token-ozet.ts'teki SHA-256 değil) ────────────────────────
 *  Sıfırlama token'ı 256 bit — kaba kuvvet imkânsız, deterministik özet tek
 *  sorguluk arama sağlar. Kurtarma kodu ise insanın yazacağı kadar KISA
 *  (50 bit): sızan bir DB dökümünde hızlı özet çevrimdışı denemeyi ucuzlatır.
 *  Satır sayısı ≤10 olduğu için bcrypt'in "tek tek karşılaştır" bedeli önemsiz.
 *
 *  ── NORMALİZASYON (Crockford kod çözme kuralı) ─────────────────────────────
 *  Büyük harf → harf/rakam dışı atılır → O→0, I ve L→1. Kullanıcı kâğıttan
 *  okurken O/0 ve I/1/L karıştırır; kod bu karışıklığı tolere eder. Alfabe
 *  bu harfleri zaten ÜRETMEZ (tekil eşleme, çakışma yok).
 */

/** Crockford base32: I, L, O, U yok. */
export const CROCKFORD_ALFABE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Özet maliyeti (§2.4 gerekçe). */
export const KURTARMA_BCRYPT_MALIYETI = 10;

const KOD_UZUNLUGU = 10;

function tekKodUret(): string {
  // 32 simge = 5 bit; 256 % 32 === 0 olduğu için `bayt & 31` SAPMASIZ.
  const baytlar = randomBytes(KOD_UZUNLUGU);
  let kod = '';
  for (const b of baytlar) kod += CROCKFORD_ALFABE[b & 31];
  return `${kod.slice(0, 5)}-${kod.slice(5)}`;
}

/** `adet` tane TEKİL kod (gösterim biçiminde, `ABCDE-FGHJK`). */
export function kurtarmaKodlariUret(adet = 10): string[] {
  if (!Number.isInteger(adet) || adet < 1 || adet > 100) {
    throw new RangeError('kurtarmaKodlariUret: adet 1-100 arası tam sayı olmalı');
  }
  const kume = new Set<string>();
  while (kume.size < adet) kume.add(tekKodUret());
  return [...kume];
}

/** Kullanıcı girdisini karşılaştırılabilir biçime indirger (tiresiz, 10 hane). */
export function kurtarmaKoduNormalize(girdi: string): string {
  if (typeof girdi !== 'string') return '';
  return girdi
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Düz kodların bcrypt özetleri — aynı sırayla. Normalize EDİLMİŞ hâl özetlenir. */
export function kurtarmaKodlariniOzetle(duzler: string[]): Promise<string[]> {
  return Promise.all(
    duzler.map((d) => bcrypt.hash(kurtarmaKoduNormalize(d), KURTARMA_BCRYPT_MALIYETI)),
  );
}
