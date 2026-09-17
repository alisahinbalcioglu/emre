import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TOTP ÇEKİRDEĞİ — RFC 6238 (zaman) üstünde RFC 4226 (HOTP)  (Faz 7 · F2a)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ `otplib` KULLANILMAZ (tasarım §0.B): 13.x varsayılan eklentileri yalnız
 *  ESM (`@noble/hashes`, `@scure/base`) — CommonJS backend'de `require(esm)`e
 *  yaslanır; 12.x eski hat. Algoritma ~40 satır ve pencere/tekrar mantığı
 *  zaten bizim kodumuz olacaktı; mutantlar kendi satırlarımıza uygulanır.
 *  Doğruluk RFC 6238 Ek-B test vektörleriyle mühürlüdür (`test:faz7-totp` T1).
 *
 *  Profil SABİT: SHA-1 · 6 hane · 30 sn. Google/Microsoft Authenticator'ın
 *  fiilen desteklediği tek profil budur; `otpauth://` içindeki `algorithm`
 *  parametresini uygulamaların çoğu yok sayar (§4.2).
 *
 *  Bu dosya DB'ye YAZMAZ ve tekrar reddinin YARIŞ tarafını çözmez: bulunan
 *  adımı döndürür, çağıran (F2b) `mfaSonAdim < adim` koşullu `updateMany` ile
 *  tüketir — aynı kodla eşzamanlı iki istekten yalnız biri kazanır.
 */

/** RFC 4648 §6 base32 alfabesi (dolgusuz kullanılır). */
const BASE32_ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 30 sn'lik zaman adımı (RFC 6238 X). */
export const TOTP_ADIM_SN = 30;

/**
 * Kabul penceresi: T-1, T, T+1 (±30 sn saat kayması). Daha geniş pencere
 * tahmin alanını büyütür; daha dar pencere saati biraz kaymış telefonu
 * kilitler. Üç aday da HER ZAMAN karşılaştırılır.
 */
const PENCERE = [-1, 0, 1];

/** Kurulumda üretilen sır: 20 bayt = 160 bit (RFC 4226 §4 önerisi). */
export function totpSiriUret(): Buffer {
  return randomBytes(20);
}

/** RFC 4648 base32, dolgusuz (`otpauth://` ve elle giriş anahtarı biçimi). */
export function base32Kodla(veri: Buffer): string {
  if (!Buffer.isBuffer(veri)) throw new TypeError('base32Kodla: Buffer bekleniyor');
  let cikti = '';
  let tampon = 0;
  let bit = 0;
  for (const bayt of veri) {
    tampon = (tampon << 8) | bayt;
    bit += 8;
    while (bit >= 5) {
      cikti += BASE32_ALFABE[(tampon >>> (bit - 5)) & 31];
      bit -= 5;
    }
    tampon &= (1 << bit) - 1;
  }
  if (bit > 0) cikti += BASE32_ALFABE[(tampon << (5 - bit)) & 31];
  return cikti;
}

/**
 * base32 çözümü — büyük/küçük harfe duyarsız; boşluk, tire ve `=` dolgusu
 * atılır. Alfabe dışı karakter SESSİZCE ATILMAZ, hata verir: bozuk bir sır
 * sessizce başka baytlara dönüşürse kullanıcı hiçbir kodu doğrulayamaz ve
 * nedenini kimse bulamaz.
 */
export function base32Coz(girdi: string): Buffer {
  if (typeof girdi !== 'string') throw new TypeError('base32Coz: metin bekleniyor');
  const temiz = girdi.replace(/[\s=-]/g, '');
  if (!/^[A-Za-z2-7]*$/.test(temiz)) {
    throw new Error('base32Coz: alfabe dışı karakter');
  }
  const buyuk = temiz.replace(/[a-z]/g, (h) => h.toUpperCase());
  const baytlar: number[] = [];
  let tampon = 0;
  let bit = 0;
  for (const harf of buyuk) {
    tampon = (tampon << 5) | BASE32_ALFABE.indexOf(harf);
    bit += 5;
    if (bit >= 8) {
      baytlar.push((tampon >>> (bit - 8)) & 0xff);
      bit -= 8;
    }
    tampon &= (1 << bit) - 1;
  }
  return Buffer.from(baytlar);
}

/**
 * RFC 4226 HOTP: HMAC-SHA1(sır, 8 baytlık büyük-endian sayaç) → dinamik
 * kesme (§5.3) → 31 bit → `10^hane` modu. 6 ve 8 hane desteklenir (8 hane
 * yalnız RFC 6238 Ek-B vektörü içindir; ürün 6 hane kullanır).
 */
export function hotp(sir: Buffer, sayac: bigint | number, hane = 6): string {
  if (!Buffer.isBuffer(sir) || sir.length === 0) throw new TypeError('hotp: sır boş olamaz');
  if (hane !== 6 && hane !== 8) throw new RangeError('hotp: yalnız 6 ya da 8 hane');
  const n = typeof sayac === 'bigint' ? sayac : BigInt(sayac);
  if (n < BigInt(0)) throw new RangeError('hotp: sayaç negatif olamaz');
  const sayacBaytlari = Buffer.alloc(8);
  sayacBaytlari.writeBigUInt64BE(n);
  const hmac = createHmac('sha1', sir).update(sayacBaytlari).digest();
  // Dinamik kesme: son baytın alt 4 biti ofseti verir (SHA-1 = 20 bayt).
  const ofset = hmac[19] & 0x0f;
  const ikili =
    ((hmac[ofset] & 0x7f) << 24) |
    (hmac[ofset + 1] << 16) |
    (hmac[ofset + 2] << 8) |
    hmac[ofset + 3];
  return String(ikili % 10 ** hane).padStart(hane, '0');
}

/** RFC 6238: T = floor(unixSaniye / 30). */
export function totpAdim(simdiMs: number): number {
  return Math.floor(simdiMs / 1000 / TOTP_ADIM_SN);
}

export interface TotpDogrulamaGirdisi {
  /** Çözülmüş (düz) sır. */
  sir: Buffer;
  /** Kullanıcının yazdığı kod; boşluklar atılır. */
  kod: string;
  simdiMs: number;
  /** Bu hesapta en son TÜKETİLEN adım; hiç yoksa `null`. */
  sonAdim: number | null;
}

/**
 * Kodu doğrular; DB'ye YAZMAZ.
 *
 *  - Girdi: boşluklar atılır; `/^\d{6}$/` değilse HMAC hiç hesaplanmaz.
 *  - Pencere T-1..T+1; karşılaştırma `timingSafeEqual` ile ve üç adayın
 *    TAMAMI denenir (ilk eşleşmede çıkılmaz).
 *  - ⚠ TEKRAR REDDİ: bulunan adım `sonAdim`'e EŞİT ya da küçükse GEÇERSİZ.
 *    Yalnız "küçük" reddedilseydi aynı 30 sn'lik kod (omuz sörfü, kaydedilmiş
 *    ekran) ikinci kez girerdi.
 *  - Dönüş: `gecerli` false iken `adim` DAİMA `null` — çağıran yalnız geçerli
 *    koddaki adımı tüketebilsin.
 *
 * Bilinen sınır: aynı pencerede iki adımın kodu tesadüfen aynıysa (~10^-6)
 * ilk eşleşen adım esas alınır.
 */
export function totpDogrula(g: TotpDogrulamaGirdisi): { gecerli: boolean; adim: number | null } {
  const red = { gecerli: false, adim: null };
  const normal = typeof g.kod === 'string' ? g.kod.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(normal)) return red;
  const girilen = Buffer.from(normal, 'ascii');
  const merkez = totpAdim(g.simdiMs);
  let bulunan: number | null = null;
  for (const fark of PENCERE) {
    const adim = merkez + fark;
    if (adim < 0) continue;
    const beklenen = Buffer.from(hotp(g.sir, adim, 6), 'ascii');
    const eslesti = timingSafeEqual(beklenen, girilen);
    if (eslesti && bulunan === null) bulunan = adim;
  }
  if (bulunan === null) return red;
  if (typeof g.sonAdim === 'number' && bulunan <= g.sonAdim) return red;
  return { gecerli: true, adim: bulunan };
}

/**
 * Kurulum QR'ı / bağlantısı. Etiket `MetaPriceX:<e-posta>` (iki parça ayrı
 * `encodeURIComponent`). ⚠ Bu adres SIR TAŞIR: yalnız kurulum başlatma
 * yanıtında döner, günlüğe yazılmaz, başka hiçbir uçta dönmez (§4.2).
 */
export function otpauthUri(eposta: string, sirB32: string): string {
  const yayinci = 'MetaPriceX';
  const etiket = `${encodeURIComponent(yayinci)}:${encodeURIComponent(eposta)}`;
  const parametreler = new URLSearchParams({
    secret: sirB32,
    issuer: yayinci,
    algorithm: 'SHA1',
    digits: '6',
    period: String(TOTP_ADIM_SN),
  });
  return `otpauth://totp/${etiket}?${parametreler.toString()}`;
}
