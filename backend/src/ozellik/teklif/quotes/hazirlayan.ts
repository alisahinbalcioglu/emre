/**
 * FAZ 7 F1b (§3.8) — "HAZIRLAYAN: X (ayrıldı)".
 *
 * Firmalar cok kisili oldu: teklif listesinde "bunu kim hazirladi" sorusunun
 * cevabi gorunmeli. Ekipten cikarilan ya da hesabini kapatan kisinin
 * teklifleri FIRMADA KALIR (sert silme yasak) ve "ayrildi" notuyla gorunur.
 *
 * ⚠ ANONIM ADRES ASLA GORUNMEZ. Kapatma deseni `email`i
 * `kapali-<id>@metapricex.invalid` yapar; o dizgeyi ekrana basmak
 * kullaniciya anlamsiz bir teknik artik gosterirdi. `deletedAt` doluysa
 * `kapatilanEposta` okunur (gercek adres orada saklanir).
 *
 * ⚠ AD/SOYAD VARSA ONCELIKLI: e-posta ancak ad girilmemisse gosterilir.
 */
export type HazirlayanKullanicisi = {
  ad?: string | null;
  soyad?: string | null;
  email?: string | null;
  kapatilanEposta?: string | null;
  deletedAt?: Date | null;
} | null | undefined;

export function hazirlayanGorunumu(
  user: HazirlayanKullanicisi,
): { gorunenAd: string; ayrildi: boolean } | null {
  if (!user) return null;
  const ayrildi = Boolean(user.deletedAt);
  const adSoyad = [user.ad, user.soyad].filter(Boolean).join(' ').trim();
  // ⚠ `deletedAt` doluysa `email` ANONIMDIR — okunmaz.
  const adres = ayrildi ? (user.kapatilanEposta ?? '') : (user.email ?? '');
  const gorunenAd = adSoyad || adres;
  if (!gorunenAd) return null;
  return { gorunenAd, ayrildi };
}
