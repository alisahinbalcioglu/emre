/**
 * DWG YÜKLEME HATASI — dosya yeniden gönderilir mi, kullanıcıya ne yazılır (28.09.2026).
 *
 * 429 = sunucu DOLU: firmanın 2 yüklemesi zaten sürüyor (Nest, `Retry-After: 30`) ya da
 * motorun dönüşüm hattı dolu (motorun 429'u, Nest aynen geçirir, `Retry-After: 60`).
 * Eskiden bu yanıtlar (motorunki 503'e çevrilmiş olarak) OTOMATİK yeniden deneniyordu:
 * her deneme dosyanın TAMAMINI yeniden taşır — 250 MB'ta 4 ek deneme ~1 GB aktarım,
 * Nest'te ve motorda diske yazım — tam da sistem boğulmuşken; dolu hat saniyeler içinde
 * boşalmaz. Artık 429 YENİDEN GÖNDERİLMEZ: kullanıcıya sunucunun metni + "Tekrar dene".
 * 5xx, ağ hatası ve zaman aşımı (motorun soğuk başlangıcı) eskisi gibi denenir.
 *
 * Kural tek yerde; `DwgUploader.tsx` bu modülü kullanır (bağlantı: yukleme-hatasi.test.ts).
 */

type YuklemeHatasi = {
  response?: { status?: number; data?: { message?: unknown; detail?: unknown } | null };
  code?: string;
  message?: unknown;
};

const hataOf = (e: unknown): YuklemeHatasi =>
  e !== null && typeof e === 'object' ? (e as YuklemeHatasi) : {};

/** Sunucu dolu (429): firmanın eş zamanlı yükleme sınırı ya da motorun dönüşüm hattı. */
export function yogunMu(e: unknown): boolean {
  return hataOf(e).response?.status === 429;
}

/** Dosya otomatik olarak YENİDEN gönderilsin mi? (her deneme dosyanın tamamını taşır) */
export function yuklemeYenidenGonderilir(e: unknown): boolean {
  const h = hataOf(e);
  const durum = h.response?.status;
  if (durum === 429) return false;
  if (durum === 500 || durum === 502 || durum === 503 || durum === 504) return true;
  if (h.code === 'ECONNABORTED' || h.code === 'ERR_NETWORK') return true;
  return !h.response;
}

export const YOGUN_METNI =
  'Sunucu şu an çok sayıda DWG dosyası işliyor. Birkaç dakika sonra «Tekrar dene»ye basın.';

/** Kullanıcıya gösterilecek metin: sunucunun metni; yoksa (429'da) sabit metin. */
export function yuklemeHataMetni(e: unknown): string {
  const h = hataOf(e);
  const veri = h.response?.data;
  const sunucu = [veri?.message, veri?.detail].find(
    (m): m is string => typeof m === 'string' && m.trim() !== '',
  );
  if (sunucu) return sunucu;
  if (yogunMu(e)) return YOGUN_METNI;
  return typeof h.message === 'string' && h.message ? h.message : 'Proje yuklenemedi';
}
