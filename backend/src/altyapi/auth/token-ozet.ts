import { createHash, randomBytes } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TEK KULLANIMLIK TOKEN — üretim ve ÖZETLEME  (Faz 3.3 · 3.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ TOKEN VERİTABANINDA DUZ METIN TUTULMAZ. Yazılan tek şey SHA-256 özetidir.
 *  Gerekçe olçulmuş bir gerçek: bu deponun dış yedekleri 07.09'a kadar DÜZ
 *  METİN çıkıyordu (0.9b ile şifrelendi). Düz metin tutulan bir sıfırlama
 *  token'ı, sızan bir dökümde DOĞRUDAN HESAP DEVRALMA demektir — saldırgan
 *  token'ı okur, /reset-password'e verir, parolayı değiştirir. Özet tutulursa
 *  aynı döküm işe yaramaz: özetten token geri üretilemez.
 *
 *  ── NEDEN bcrypt DEĞİL de SHA-256 ────────────────────────────────────────
 *  Parolalar bcrypt ile özetlenir çünkü DÜŞÜK entropilidir; yavaş özet, kaba
 *  kuvveti pahalı kılar. Token ise 256 bit KRİPTOGRAFİK RASTGELE — kaba kuvvet
 *  zaten imkânsız, yavaşlatmanın kazandıracağı bir şey yok. Buna karşılık
 *  SHA-256 DETERMİNİSTİK olduğu için `tokenHash` üzerinde @unique indeks
 *  kurulabilir ve doğrulama TEK sorguda yapılır. bcrypt ile her satırı tek tek
 *  denemek gerekirdi (tarama) — hem yavaş hem zamanlama sızıntısı.
 *
 *  ── base64url ŞART ───────────────────────────────────────────────────────
 *  Token bir URL'in sorgu parçasında taşınır. Düz base64 `+ / =` üretir;
 *  bunlar URL'de kodlanır, e-posta istemcileri bağlantıyı bölebilir ve
 *  kullanıcı "geçersiz bağlantı" görür. base64url bu üçünü hiç üretmez.
 */

/** 32 bayt = 256 bit entropi. */
export const TOKEN_BAYT = 32;

/** Parola sıfırlama bağlantısının ömrü: 1 saat (saldırı penceresi dar olmalı). */
export const SIFIRLAMA_OMRU_MS = 60 * 60 * 1000;

/**
 * E-posta doğrulama bağlantısının ömrü: 24 saat. Sıfırlamadan uzun, bilerek:
 * kullanıcı kaydolup e-postasını ertesi gün açabilir ve bunun bir saldırı
 * penceresi değeri yoktur (doğrulama yetki VERMEZ, yalnız işaretler).
 */
export const DOGRULAMA_OMRU_MS = 24 * 60 * 60 * 1000;

/** Üretilen token yalnız BURADA ve e-postada görünür; DB'ye özeti yazılır. */
export function tokenUret(): { token: string; ozet: string } {
  const token = randomBytes(TOKEN_BAYT).toString('base64url');
  return { token, ozet: tokenOzetle(token) };
}

export function tokenOzetle(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
