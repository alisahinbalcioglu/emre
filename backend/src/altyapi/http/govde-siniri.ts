import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOL BAŞINA GÖVDE TAVANI  (Faz 6.9, 16.09.2026 — §3.4 · R1-B4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Global ayrıştırıcı 50 MB (teklif kaydı gerçekten o kadar büyüyor, main.ts
 *  notu). Çeviri düzeltme uçlarının gövdesi ise tek metin çiftidir (DTO tavanı
 *  2.000 karakter): orada 50 MB kabul etmek, bellekte tek istekle MB'larca
 *  gövde ayrıştırmaya izin vermektir.
 *
 *  ⚠ SIRA ŞART: `main.ts`'te iki global ayrıştırıcıdan ÖNCE çağrılır. Express
 *  gövdeyi İLK eşleşen ayrıştırıcıyla okur; global `json(50mb)` önce koşarsa
 *  gövde zaten okunmuş olur ve buradaki sınır SESSİZCE etkisiz kalır (Ö3 H6).
 *  ⚠ İKİ AYRIŞTIRICI BİRDEN (R1-B4): yalnız `json` sınırlanırsa aynı gövde
 *  `application/x-www-form-urlencoded` ile gönderilip 50 MB'lık global
 *  urlencoded ayrıştırıcıdan geçer.
 *  ⚠ YOL `/api` ÖNEKİYLE: önek `setGlobalPrefix` ile sonra kurulur, `app.use`
 *  ham Express yoludur.
 *  413 gövdesi İngilizce JSON'dur; ön yüz 413'ü durum koduyla Türkçe metne çevirir.
 */
export const GOVDE_SINIRLARI: ReadonlyArray<{ yol: string; sinir: string }> = [
  { yol: '/api/ai/translate/duzeltmeler', sinir: '32kb' },
  { yol: '/api/ai/translate/correct', sinir: '32kb' },
];

export function govdeSinirlariniKur(app: Pick<NestExpressApplication, 'use'>): void {
  for (const s of GOVDE_SINIRLARI) {
    app.use(s.yol, json({ limit: s.sinir }));
    app.use(s.yol, urlencoded({ extended: true, limit: s.sinir }));
  }
}
