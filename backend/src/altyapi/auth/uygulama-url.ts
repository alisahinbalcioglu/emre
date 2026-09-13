import { ConfigService } from '@nestjs/config';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  UYGULAMA KÖKÜ — e-posta bağlantılarının taban adresi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠⚠ NEDEN `??` DEĞİL: `??` yalnız `undefined`/`null`'da düşer, BOŞ DİZEDE
 *  DÜŞMEZ. `docker-compose.yml` bu anahtarı `APP_URL: ${APP_URL:-}` diye
 *  yazıyor — yani host değişkeni tanımlı değilse anahtar YOK OLMAZ, BOŞ
 *  DİZE olur. Sonuç: `config.get('APP_URL')` → `''`, `'' ?? …` → `''`, ve
 *  bağlantı `/reset-password?token=…` diye başlar — başında alan adı yok.
 *
 *  Bu kurgu 09.09.2026'da CANLIDA ölçüldü ve gerçek bir kullanıcıya gitti:
 *    çalışan konteyner  APP_URL      = BOŞ (uzunluk 0)
 *    çalışan konteyner  UYGULAMA_URL = DOLU (uzunluk 22)
 *  İlk gerçek şifre sıfırlama mailinde yedek adres alan adsız çıktı.
 *
 *  Bu yüzden kural DOLULUK kontrolüdür (`if (t)`), varlık kontrolü değil.
 *  Sıra da önemli: önce `trim`, sonra sondaki `/` kırpılır, EN SON doluluk
 *  bakılır — yalnız boşluktan ibaret bir değer de "yok" sayılmalı.
 *
 *  ⚠ Bu depoda ödeme tarafı (`dunning.servisi.ts`, `satinalma.servisi.ts`,
 *  `iyzico-donus.controller.ts`) hâlâ `https://app.metapricex.com`
 *  varsayılanını taşıyor; gerçek değer `https://metapricex.com`. Onları da
 *  buraya bağlamak AYRI ve bilinçli bir iş — ödeme dönüş adreslerini
 *  etkiler ve kendi doğrulamasını ister.
 */

/** Bağlantı kökü. Boş/boşluk değerler düşürülür, sondaki '/' kırpılır. */
export function uygulamaKokuCoz(config: ConfigService): string {
  const adaylar = [
    config.get<string>('APP_URL'),
    config.get<string>('UYGULAMA_URL'),
  ];
  for (const ham of adaylar) {
    const temiz = (ham ?? '').trim().replace(/\/+$/, '');
    if (temiz) return temiz;
  }
  // Ölçülen gerçek değere hizalı (apex, `www.` YOK, sondaki '/' YOK).
  return 'https://metapricex.com';
}
