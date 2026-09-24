/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KISITLAMAYA KALAN GÜN — müşteriye söylenen TEK sayı (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ödeme alınamayınca hesap `ilkBasarisizlik` + `DUNNING_KISIT_GUNU` gününde
 *  salt-okunur moda geçer (dunning merdiveninin KISITLI basamağı). Bu sayıyı
 *  müşteriye İKİ yer söyler:
 *    · dunning e-postası — "hesabınız N gün sonra kısıtlanacak"
 *      (`dunning.servisi.ts` `gonder`)
 *    · ekran — Hesabım › Abonelik "N gün kaldı" (`ErisimKarari.kalanGun`,
 *      `erisim.servisi.ts` ODEME_BEKLIYOR dalı)
 *
 *  ⚠ NEDEN TEK DOSYA (24.09'da ölçüldü): ekran `erisimSonu`na sayıyordu —
 *  tahsilat başarısızken ZATEN geçmiş olan ödenmiş dönem sonuna — ve 7. gün
 *  e-postası "3 gün sonra kısıtlanacak" derken "−7 gün kaldı" yazıyordu. İki
 *  yer iki formül taşıdıkça iki ayrı gün söyler. Emre kararı: ekran
 *  e-postanın sayısını gösterir.
 *
 *  ⚠ Merdivenin KENDİSİ (DunningServisi kurucusu) aynı değişkeni
 *  `ConfigService`ten okur ve aynı biçimde çözer (`Number(… ?? 10)`, gün =
 *  `Math.floor`); ikisinin aynı günü bulduğunu `test:odeme-bekliyor-geri-sayim`
 *  L bloğu gerçek merdivenle ölçer.
 *
 *  ⚠ HİÇBİR ŞEY IMPORT ETMEZ: `erisim.servisi.ts` (her kapılı istekte koşar)
 *  buradan okur; dunning servisine bağ kurmak ona Nest bağımlılığı taşırdı.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `.env.example` ve `docker-compose.yml` ile aynı varsayılan. */
export const VARSAYILAN_KISIT_GUNU = 10;

/** Başarısızlıktan kaç gün sonra salt-okunur (`DUNNING_KISIT_GUNU`). */
export function dunningKisitGunu(
  env: Record<string, string | undefined> = process.env,
): number {
  return Number(env.DUNNING_KISIT_GUNU ?? VARSAYILAN_KISIT_GUNU);
}

/**
 * Kısıtlamaya kalan gün = kısıt günü − başarısızlıktan bu yana geçen TAM gün
 * (merdivenin basamak seçtiği sayı); kısıt günü gelince 0'da durur. Başlamış
 * gün sayılır: kısıta 9 gün 22 saat varken 10.
 *
 * `ilkBasarisizlik` yoksa `null`: merdiven o satırı taramaz, kısıt
 * planlanmamıştır (kontrol burada — çağıran unutursa `null.getTime()` her
 * kapılı isteği 500'e düşürürdü).
 *
 * `simdiMs` milisaniye: e-posta `Date.now()`, erişim kararı kendi `simdi`sini
 * verir.
 */
export function kisitlamayaKalanGun(
  ilkBasarisizlik: Date | null | undefined,
  simdiMs: number,
  kisitGunu: number = dunningKisitGunu(),
): number | null {
  if (!ilkBasarisizlik) return null;
  // ⚠ Geçen gün eksi olmaz: erişim kararı saatini satırı okumadan ÖNCE alır;
  // webhook `ilkBasarisizlik`i o arada yazarsa fark −ms olur ve
  // `Math.floor` −1 verip kısıt gününü AŞARDI ("11 gün kaldı").
  const gecenGun = Math.max(0, Math.floor((simdiMs - ilkBasarisizlik.getTime()) / 86_400_000));
  return Math.max(0, kisitGunu - gecenGun);
}
