/**
 * SATIN ALMADA SÖZLEŞME ONAYI — tek kaynak (Faz 6.4, 16.09).
 *
 * ⚠ ÖN YÜZDEKİ KAPI TEK BAŞINA YETMEZ: asıl kapı sunucuda
 * (`AbonelikBaslaDto.sozlesmeOnayi` üzerinde `@Equals(true)`). Buradaki
 * kural, isteği elle atmayan kullanıcı için ekranda görünen karşılığıdır —
 * "sessiz dal yok" kuralı gereği düğme sebepsizce ölü kalmaz, gerekçe
 * yazılır.
 */

/** Kutu ÖNCEDEN İŞARETSİZ başlar — işaretli varsayılan onay sayılmaz. */
export const SOZLESME_ONAYI_BASLANGIC = false as const;

/** Satın alma adımında gösterilen onay cümlesi. */
export const SOZLESME_ONAY_METNI =
  "Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni okudum, onaylıyorum.";

/** Ön bilgilendirme formu ve sözleşme aynı sayfada; sözleşme çıpalı. */
export const ON_BILGILENDIRME_YOLU = '/mesafeli-satis';
export const SOZLESME_YOLU = '/mesafeli-satis#sozlesme';

/**
 * Onay işaretli değilse kullanıcıya gösterilecek gerekçe, işaretliyse `null`.
 * Ödeme adımına geçiş bu fonksiyonun `null` dönmesine bağlıdır.
 */
export function sozlesmeOnayiHatasi(onay: boolean): string | null {
  return onay
    ? null
    : 'Devam edebilmek için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayını işaretleyin.';
}
