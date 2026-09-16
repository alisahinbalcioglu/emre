import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OTURUM SAHİBİ BAZINDA HIZ SINIRI  (Faz 6.9, 16.09.2026 — R1-B5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NEDEN IP SINIRI YETMEZ: firma çeviri sözlüğüne yazan uçlar (PUT/DELETE
 *  `/ai/translate/duzeltmeler`) oturum ister. IP'ye göre sayan kova, IP
 *  değiştiren tek bir hesabın sınırı sıfırlamasına izin verir; tersine aynı
 *  ofis NAT'ının arkasındaki ekip arkadaşları da birbirinin kovasını tüketir.
 *  Anlamlı birim OTURUMUN SAHİBİDİR.
 *
 *  `generateKey(context, tracker, name)` anahtarı tracker'ı içerir; kullanıcı
 *  kovası IP kovasıyla ÇAKIŞMAZ. Kimlik yoksa (guard sırası bozulursa) IP'ye
 *  düşülür — aksi hâlde kimliksiz istekler tek ve ortak bir kovayı paylaşırdı.
 *
 *  ⚠ SINIR — TEK SÜREÇ: sayaç `ThrottlerModule`'ün bellek deposundadır
 *  (`eposta-hiz-siniri.guard.ts` ile aynı not). Yatay ölçekte Redis gerekir.
 */
@Injectable()
export class KullaniciHizSiniriGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const id = req?.user?.id;
    return typeof id === 'string' && id ? `kullanici:${id}` : `ip:${req?.ip ?? 'bilinmiyor'}`;
  }
}
