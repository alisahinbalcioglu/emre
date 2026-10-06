import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AUTHORIZATION BAŞLIĞI TAVANI (06.10.2026, güvenlik incelemesi HIGH-1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  passport-jwt'nin hazır çıkarıcısı başlığı ÇAPASIZ `/(\S+)\s+(\S+)/` ile
 *  ayırır (auth_header.js:3): boşluksuz uzun değerde her başlangıç konumunda
 *  geri izler, maliyet O(n²). Node'un başlık tavanı 16 KiB; ölçüldü (yerel,
 *  HTTP): 2.006 karakter ~7 ms · 8.006 ~180-200 ms · 15.906 ~0,7 sn —
 *  JwtAuthGuard taşıyan HER rotada, kimliksiz ve gövdesiz TEK istekle.
 *  ASIL düzeltme ayrıştırıcıdır: JwtStrategy ve büyük gövde ön denetimi
 *  artık ORTAK, DOĞRUSAL `auth/bearer-token.ts`yi kullanır.
 *
 *  Bu tavan DERİN SAVUNMA: başlığı bundan sonra okuyacak her kod (yeni bir
 *  strateji, kütüphane, günlük satırı) en çok 2 KB görür. Tavanı aşan başlık
 *  passport'tan da ön denetimden de ÖNCE düşürülür — ikisi aynı durumu görür,
 *  kararları eşdeğer kalır (tavan yalnız birine konsaydı `Bearer <geçerli>
 *  <uzun çöp>`u biri kabul eder, öteki reddederdi: işleyici boş gövdeyle
 *  koşardı).
 *
 *  Gerçek oturum token'ı: `sub` (uuid) + `email` (IsEmail: yerel ≤ 64, alan
 *  ≤ 253; Türkçe karakter UTF-8'de 2 bayt) + rol/authAt/mfa/iat/exp → başlık
 *  en kötü ~1,1 KB. 2 KB geniş pay.
 *  ⚠ SIRA: `main.ts`'te büyük gövde ön denetiminden (ve her kapıdan) ÖNCE.
 *  Kapı: `test:buyuk-govde`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const AZAMI_YETKI_BASLIGI = 2_048;

export function yetkiBasligiTavaniniKur(app: Pick<NestExpressApplication, 'use'>): void {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const baslik = req.headers.authorization;
    if (typeof baslik === 'string' && baslik.length > AZAMI_YETKI_BASLIGI) delete req.headers.authorization;
    next();
  });
}
