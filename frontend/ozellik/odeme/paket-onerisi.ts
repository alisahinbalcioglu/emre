// Göreli yol (A1 `paket-degisimi.ts` ile aynı): vitest `@/` takma adını çözmez.
import { trTarih } from '../teklif/ceviri-kota';
import type { Paket } from './paket-bicim';
import { kartEylemi, mevcutPaketMi } from './paket-degisimi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YÖNETİCİ PAKET ÖNERİSİ — MÜŞTERİ ŞERİDİ (SAF) · 24.09.2026, A2 Blok 2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  MetaPriceX ekibi firmaya bir paket önerdiyse abonelik sayfasının üstünde
 *  bir şerit çıkar. Karar SUNUCUDA: öneri yalnız GEÇERLİYSE (süresi dolmamış,
 *  abonelik öneriden sonra değişmemiş) hedef paketin satırında gelir
 *  (`Paket.oneri`). Bu modül yalnız ekrana çevirir.
 *
 *  · SAHİP: not + son gün + "İncele ve onayla" (A1'in onay penceresi, sözleşme
 *    kutusuyla) + "Reddet". Kabul edilemiyorsa (ör. ödeme sorunu) düğme kapalı
 *    ve NEDENİ yazılı — kapalı düğme tek başına "neden?"i cevapsız bırakır.
 *  · ÜYE: yalnız bilgi; not GÖSTERİLMEZ (sunucu zaten `null` gönderir).
 *  · Bağlantıda `?oneri=` var ama geçerli öneri yok: "artık geçerli değil".
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type OneriSeridi =
  | { tur: 'yok' }
  | { tur: 'gecersiz-baglanti' }
  | { tur: 'uye'; hedefAdi: string; sonGun: string }
  | {
      tur: 'sahip';
      oneriId: string;
      hedef: Paket;
      not: string | null;
      sonGun: string;
      kabul: { acik: true } | { acik: false; neden: string };
    };

export const GECERSIZ_ONERI_METNI =
  'Bağlantıdaki paket önerisi artık geçerli değil: süresi dolmuş, geri çekilmiş, yanıtlanmış ya da ' +
  'paketiniz öneriden sonra değişmiş olabilir.';

export function oneriSeridi(
  paketler: readonly Paket[],
  g: { sahipMi: boolean; mevcutPaketKodu: string | null; baglantidakiOneri: string | null },
): OneriSeridi {
  const hedef = paketler.find((p) => p.oneri);
  if (!hedef?.oneri) return g.baglantidakiOneri ? { tur: 'gecersiz-baglanti' } : { tur: 'yok' };
  const sonGun = trTarih(hedef.oneri.sonGecerlilik) || '—';
  if (!g.sahipMi) return { tur: 'uye', hedefAdi: hedef.ad, sonGun };

  // Kabul A1'in karar yolundan: kart "geç" diyorsa pencere açılır.
  const eylem = kartEylemi(hedef, { mevcutMu: mevcutPaketMi(hedef, g.mevcutPaketKodu), sahipMi: true });
  const kabul =
    eylem.tur === 'degistir'
      ? ({ acik: true } as const)
      : {
          acik: false as const,
          neden:
            eylem.tur === 'kapali'
              ? eylem.mesaj
              : eylem.tur === 'mevcut'
                ? 'Önerilen paket zaten mevcut paketiniz.'
                : // "satın al" yolu: etkin abonelik yok. Sunucu böyle bir öneriyi
                  // zaten kapatır (ASKIDA / SONA_ERDI); "sayfayı yenileyin" demek
                  // işe yaramayan bir eylem önermek olurdu (inceleme D6).
                  'Aboneliğiniz şu an etkin olmadığı için öneri kabul edilemiyor.',
        };
  return { tur: 'sahip', oneriId: hedef.oneri.id, hedef, not: hedef.oneri.not, sonGun, kabul };
}

/**
 * Hesabım › Abonelik satırı: bekleyen öneri varsa hedef paket, son gün ve
 * şeridi açan bağlantı (`null` = satır çizilmez). Kaynak şeritle AYNI:
 * `GET /abonelik/paketler` → `Paket.oneri`.
 */
export function bekleyenOneriSatiri(
  paketler: readonly Paket[],
): { ad: string; sonGun: string; baglanti: string } | null {
  const hedef = paketler.find((p) => p.oneri);
  if (!hedef?.oneri) return null;
  return {
    ad: hedef.ad,
    sonGun: trTarih(hedef.oneri.sonGecerlilik) || '—',
    baglanti: `/abonelik?oneri=${encodeURIComponent(hedef.oneri.id)}`,
  };
}

/** Bağlantıdaki `?oneri=` değeri (yoksa `null`). Biçim sunucuda doğrulanır. */
export function baglantidakiOneri(arama: string): string | null {
  const deger = new URLSearchParams(arama).get('oneri');
  return deger && deger.trim() ? deger.trim() : null;
}
