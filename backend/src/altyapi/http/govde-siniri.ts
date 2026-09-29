import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';

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
  // 28.09 (webhook güvenliği): iyzico bildirimi altı kısa alandır (< 1 KB).
  // Uç herkese açık — 50 MB'lık global tavanla tek istek MB'larca gövde
  // ayrıştırtabiliyordu. Kapı: `test:webhook-tahsilat-dogrulama` I9.
  { yol: '/api/webhook/iyzico', sinir: '16kb' },
];

export function govdeSinirlariniKur(app: Pick<NestExpressApplication, 'use'>): void {
  for (const s of GOVDE_SINIRLARI) {
    app.use(s.yol, json({ limit: s.sinir }));
    app.use(s.yol, urlencoded({ extended: true, limit: s.sinir }));
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AYRIŞTIRICI İSTEMCİ HATALARI — tek WARN satırı, yığın YOK (29.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *  body-parser'ın reddi (http-errors: 413 tavan · 415 karakter kümesi · 400
 *  bozuk sıkıştırma / yarıda kesilen gövde …) Nest'in HttpException'ı DEĞİLDİR. Nest'in
 *  ExceptionsHandler'ı durum kodunu doğru dönüyor ama onu "bilinmeyen hata"
 *  sayıp HER istekte ERROR + 11 satır yığın (~1,6 KB) basıyordu (ölçüldü,
 *  29.09; canlı dumanda koordinatör gördü): tavanı aşan gövde gönderen herkes
 *  hata günlüğünü doldurabilir, gerçek hatalar gürültüde kaybolur.
 *  Bu ara katman yanıtı BUGÜNKÜYLE AYNI verir (`{statusCode, message}`; ön yüz
 *  413'ü durum koduyla çevirir) ve tek WARN satırı yazar. Satırda istemcinin
 *  yazdığı metin yok: sorgusuz yol (sorgu jeton taşıyabilir), hata TİPİ ya da
 *  KODU (mesajı değil — 415 mesajı istemcinin karakter kümesini taşır), uzunluk.
 *  TİP ŞART DEĞİL (29.09 inceleme W1, ölçüldü): body-parser zlib ve soket
 *  hatasına tip eklemez (`{code: 'Z_DATA_ERROR' | 'ECONNRESET', status: 400,
 *  expose}`) — 15 baytlık bozuk gzip gövdesi tavanı aşmadan ERROR + yığın
 *  bastırıyordu. Kaynağı katmanın KONUMU sınırlar: önünde yalnız Express'in
 *  kendi katmanları, güvenlik başlıkları ve ayrıştırıcılar var; 4xx + `expose`
 *  bir http-errors hatasına Nest de aynı `{statusCode, message}` yanıtını verir.
 *  Nest'e bırakılan (bugünkü gibi): `SyntaxError` (bozuk JSON) ve `URIError` —
 *  Nest ikisini BadRequestException'a çevirir, günlüğe yazmaz, yanıtında
 *  `error` alanı da var; 5xx ve `expose` olmayan her hata.
 *  ⚠ SIRA ŞART: `main.ts`'te iki global ayrıştırıcıdan SONRA (Express hata ara
 *  katmanı yalnız KENDİNDEN ÖNCE kurulanların hatasını görür) ve `app.listen`
 *  ÖNCESİNDE (Nest kendi hata katmanını init'te sona ekler).
 *  ⚠ Bu hatalar Nest'in filtre zincirine UĞRAMAZ: ileride eklenecek global
 *  `@Catch()` (hata izleme vb.) ayrıştırıcı hatalarını görmez — gerekirse
 *  buradan iletilir.
 *  Kapılar: `test:ceviri-duzeltme` E3b-E5 · `test:webhook-tahsilat-dogrulama` I9.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ayristiriciIstemciHatasiMi(
  err: unknown,
): err is { status: number; type?: unknown; code?: unknown; message: string } {
  if (!err || typeof err !== 'object' || err instanceof SyntaxError || err instanceof URIError) return false;
  const e = err as Record<string, unknown>;
  return typeof e.status === 'number' && e.status >= 400 && e.status < 500 && e.expose === true;
}

export function govdeHatalariniKur(app: Pick<NestExpressApplication, 'use'>): void {
  const logger = new Logger('GovdeAyristirici');
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!ayristiriciIstemciHatasiMi(err) || res.headersSent) return next(err);
    // Tip ya da kod sabittir (body-parser, zlib, soket); yine de süzülür.
    const tip = String(err.type ?? err.code ?? '-').replace(/[^\w.-]/g, '?').slice(0, 40);
    logger.warn(
      `Gövde reddedildi (${err.status}, ${tip}): ${req.method} ${req.path.slice(0, 200)} — ` +
        `${req.headers['content-length'] ?? '?'} bayt`,
    );
    res.status(err.status).json({ statusCode: err.status, message: err.message });
  });
}
