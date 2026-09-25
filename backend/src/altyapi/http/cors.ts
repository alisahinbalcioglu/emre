import type { Request } from 'express';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CORS — KÖKEN KAPISI + iyzico DÖNÜŞ MUAFİYETİ (25.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kapı (07.09 güvenlik paketi): `credentials: true` ile YALNIZ izin
 *  listesindeki kökenler. Listede olmayan `Origin` başlıklı istek reddedilir.
 *
 *  ⚠ KUSUR (25.09, kod okuması + `test:kart-guncelleme` C bloğunda ölçüm):
 *  `cors` paketi köken işlevi hata dönünce `next(hata)` çağırır; istek
 *  DENETLEYİCİYE HİÇ ULAŞMAZ, Nest 500 yazar. iyzico ödeme ve kart formunun
 *  dönüşü, tarayıcının iyzico alan adından yaptığı bir form POST'udur.
 *  Tarayıcı GET/HEAD dışındaki her gezinmede `Origin` gönderir (Fetch
 *  standardı; yönlendirme politikası kökeni gizlerse `"null"` gider, o da
 *  listede yok). Yani satın alma ve kart dönüşü bu kapıya takılıp müşteriye
 *  500 gösterirdi. Canlıda ölçülemedi: Caddy erişim günlüğü tutmuyor, backend
 *  günlüğü yalnız son deploy'dan beri duruyor ve dönüş hiç görülmedi.
 *
 *  ÇÖZÜM EN DAR HÂLİYLE: yalnız iyzico'nun dönüş uçları (POST, tam yol) CORS'tan
 *  MUAF — kapı ne başlık yazar ne reddeder, istek denetleyiciye geçer. Güvenli:
 *    · Gezinme POST'u CORS'a tabi değildir. Muafiyet tarayıcıya YANIT
 *      OKUTMAZ (CORS başlığı yazılmaz), yalnız isteği reddetmeyi bırakır.
 *    · İki uç da gövdeye güvenmez: satın alma dönüşü token'ı iyzico'ya SORAR
 *      (`donusIyzicodan`), kart dönüşü HİÇBİR ŞEY yazmaz
 *      (`iyzico-donus.controller.ts`).
 *  Diğer HER yol eski kapıdan geçer (izin listesi, kimlikli istek).
 *
 *  Listeyi KULLANIM belirler: yeni bir iyzico `callbackUrl`i buraya eklenmezse
 *  `test:kart-guncelleme` C bloğu kırmızı verir; kullanılmayan muafiyet de.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const CAPRAZ_SITE_DONUS_YOLLARI: readonly string[] = Object.freeze([
  '/api/abonelik/iyzico-donus',
  '/api/abonelik/iyzico-kart-donus',
]);

/** Muaf mı? Yalnız POST ve TAM yol (`req.path` sorgu dizesini taşımaz). */
export function caprazSiteDonusuMu(req: Pick<Request, 'method' | 'path'>): boolean {
  return req.method === 'POST' && CAPRAZ_SITE_DONUS_YOLLARI.includes(req.path);
}

/**
 * `app.enableCors`a verilen istek başı ayar. `izinliKokenler` main.ts'te
 * kurulur (CORS_ORIGINS + geliştirmede localhost).
 */
export function corsSecenekleri(izinliKokenler: readonly string[]): CorsOptionsDelegate<Request> {
  const kapi: CorsOptions = {
    origin: (origin, callback) => {
      // Aynı köken (adres çubuğu) ya da sunucudan sunucuya: `Origin` yok.
      if (!origin) return callback(null, true);
      if (izinliKokenler.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    // KF6: indirme yanıtındaki dosya adı + self-check uyarısı cross-origin'de
    // de okunabilsin (same-origin'de zaten serbest).
    exposedHeaders: ['Content-Disposition', 'X-Export-Warning', 'X-Export-Summary'],
  };
  // `origin: false` → `cors` hiçbir başlık yazmadan `next()` der.
  const muaf: CorsOptions = { origin: false };
  return (req, callback) => callback(null, caprazSiteDonusuMu(req) ? muaf : kapi);
}
