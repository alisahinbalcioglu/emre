import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * UYGULAMA KATMANI GUVENLIK BASLIKLARI (B3 · plan 1.15 · para dogrulugu turu 14.09.2026)
 *
 * Olculmus: Caddy atlanip ic agdan `backend:3001`e gidilince `X-Powered-By: Express`
 * geliyordu ve uygulama guvenlik basliklarinin HICBIRINI uretmiyordu — tek savunma
 * kenar katmaniydi (Caddyfile `(guvenlik)` snippet'i). Bu dosya ikinci katmandir.
 *
 * DEGERLER CADDY ILE BIREBIR: Caddy `defer` ile ayni basliklari yeniden yazar; iki
 * katman farkli deger soylerse davranis katman sirasina kalir ve kimse fark etmez.
 * Parite `test:guvenlik-basliklari` icinde Caddyfile OKUNARAK olculur.
 *
 * `X-Permitted-Cross-Domain-Policies` Caddy'de YOK, yalniz buradan gelir: deploy
 * sonrasi disaridan `curl -I /api/health` ile gorunmesi bu katmanin CANLIDA
 * calistiginin kanitidir (B2 olcum defteri bunu sinar). Islevsel etkisi yoktur.
 *
 * CSP BURADA YOK: zorunlu kilma karari (plan 1.10) Emre'de; kenar Report-Only basiyor.
 * COOP/CORP BILEREK YOK: odeme penceresi ve e-postadaki gorseller gibi capraz-kaynak
 * yollari olculmeden eklenirse sessizce kirilir.
 */
export const GUVENLIK_BASLIKLARI: Readonly<Record<string, string>> = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), accelerometer=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
});

/** Kenarin (Caddy) da yazdigi basliklar — parite testi bunlari Caddyfile ile karsilastirir. */
export const KENARLA_ORTAK_BASLIKLAR = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'X-Frame-Options',
  'Permissions-Policy',
] as const;

export function guvenlikBasliklari(_req: Request, res: Response, next: NextFunction): void {
  for (const [ad, deger] of Object.entries(GUVENLIK_BASLIKLARI)) res.setHeader(ad, deger);
  next();
}

/** main.ts'te route'lardan ONCE cagrilir: hata ve 404 yanitlari da basligi tasir. */
export function guvenlikBasliklariniKur(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.use(guvenlikBasliklari);
}
