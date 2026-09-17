import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KİMLİK SIRLARININ ŞİFRELENMESİ — AES-256-GCM  (Faz 7 · F2a · §2.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TOTP sırları ve kurumsal girişin istemci sırları DB'ye DÜZ yazılmaz; bu
 *  dosya ile şifrelenir. `KIMLIK_SIFRELEME_KEY`'i okuyan TEK dosya burasıdır.
 *
 *  ── KAZANCIN DÜRÜST SINIRI (docs/GERI_YUKLEME.md:60-65) ────────────────────
 *  `.env` içeren yapılandırma arşivi ve DB dökümü aynı `age` alıcısıyla aynı
 *  dış klasöre gidiyor; o anahtarı açan İKİSİNİ BİRDEN açar. Şifreleme yalnız
 *  "YALNIZ DB dökümü sızdı" senaryosunu korur. "Sırlar güvende" DENMEZ.
 *
 *  ── AÇILIŞI ÖLDÜRMEZ (§0.9) ────────────────────────────────────────────────
 *  Anahtar modül yüklenirken OKUNMAZ, her çağrıda okunur. Eksik/bozuksa yalnız
 *  bu fonksiyonlar 503 `KIMLIK_SIFRELEME_YOK` fırlatır; MFA kullanmayan herkes
 *  çalışmaya devam eder (`test:odeme` tüm AppModule'ü kurar — kurucuda fırlatan
 *  sağlayıcı o paketi kırardı; `deploy.sh` geri alma yapmaz).
 *
 *  ── DÖNDÜRÜLMEZ ────────────────────────────────────────────────────────────
 *  `scripts/sir-dondur.sh` DONDURULEN listesine EKLENMEZ: anahtar değişirse
 *  DB'deki bütün MFA ve istemci sırları çözülemez. `v1.` öneki ileride
 *  eski anahtarla yeniden şifreleme yolunu açık tutar (bu turda yazılmadı).
 *
 *  Biçim: `v1.<iv 12 bayt>.<etiket 16 bayt>.<şifreli>` (her parça base64url).
 *  AAD (`mfa:<userId>`, `idp:<saglayiciId>`): şifreli değer başka satıra
 *  kopyalanırsa çözme BAŞARISIZ olur.
 */

/** `openssl rand -base64 32` çıktısının birebir biçimi: 43 simge + tek `=`. */
const ANAHTAR_BICIMI = /^[A-Za-z0-9+/]{43}=$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IV_BAYT = 12;
const ETIKET_BAYT = 16;
const SURUM_ONEKI = 'v1';

export type AnahtarDurumu = 'var' | 'yok' | 'bozuk';

function anahtarOku(): { durum: AnahtarDurumu; anahtar: Buffer | null } {
  const ham = process.env.KIMLIK_SIFRELEME_KEY;
  if (ham === undefined || ham.trim() === '') return { durum: 'yok', anahtar: null };
  // ⚠ ÖNCE BİÇİM, SONRA UZUNLUK (R1-O6c): Node `Buffer.from(s, 'base64')`
  // geçersiz karakterleri SESSİZCE atar — araya `*` girmiş 45 karakterlik bir
  // değer de 32 bayt verir (ölçüldü). Uzunluk tek başına kanıt değildir.
  if (!ANAHTAR_BICIMI.test(ham)) return { durum: 'bozuk', anahtar: null };
  const anahtar = Buffer.from(ham, 'base64');
  if (anahtar.length !== 32) return { durum: 'bozuk', anahtar: null };
  return { durum: 'var', anahtar };
}

/** Açılış günlüğü ve sağlık ölçümü için: değeri ASLA döndürmez. */
export function anahtarDurumu(): AnahtarDurumu {
  return anahtarOku().durum;
}

function anahtarAl(): Buffer {
  const { durum, anahtar } = anahtarOku();
  if (durum !== 'var' || !anahtar) {
    throw new ServiceUnavailableException({
      kod: 'KIMLIK_SIFRELEME_YOK',
      message:
        'Sunucu yapılandırması eksik; iki adımlı giriş ve kurumsal giriş şu an kullanılamıyor.',
    });
  }
  return anahtar;
}

function aadDenetle(aad: string): Buffer {
  if (typeof aad !== 'string' || aad.length === 0) {
    throw new TypeError('kimlik-sifreleme: AAD boş olamaz (örn. mfa:<userId>)');
  }
  return Buffer.from(aad, 'utf8');
}

/** Düz metni şifreler. Her çağrıda YENİ 12 baytlık IV. */
export function sifrele(duz: string, aad: string): string {
  const anahtar = anahtarAl();
  const ekVeri = aadDenetle(aad);
  if (typeof duz !== 'string') throw new TypeError('kimlik-sifreleme: düz metin bekleniyor');
  const iv = randomBytes(IV_BAYT);
  const sifreleyici = createCipheriv('aes-256-gcm', anahtar, iv, { authTagLength: ETIKET_BAYT });
  sifreleyici.setAAD(ekVeri);
  const govde = Buffer.concat([sifreleyici.update(duz, 'utf8'), sifreleyici.final()]);
  const etiket = sifreleyici.getAuthTag();
  return [SURUM_ONEKI, iv, etiket, govde]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/**
 * Şifreli değeri çözer. Biçim, IV ya da etiket uzunluğu, AAD, anahtar veya
 * değerin kendisi uyuşmazsa HATA — kısmi/sessiz sonuç yok.
 */
export function coz(sifreli: string, aad: string): string {
  const anahtar = anahtarAl();
  const ekVeri = aadDenetle(aad);
  const parcalar = typeof sifreli === 'string' ? sifreli.split('.') : [];
  if (parcalar.length !== 4 || parcalar[0] !== SURUM_ONEKI || !parcalar.slice(1).every((p) => BASE64URL.test(p))) {
    throw new Error('kimlik-sifreleme: şifreli değerin biçimi tanınmadı');
  }
  const iv = Buffer.from(parcalar[1], 'base64url');
  const etiket = Buffer.from(parcalar[2], 'base64url');
  const govde = Buffer.from(parcalar[3], 'base64url');
  // ⚠ ETİKET UZUNLUĞU SABİT 16 BAYT (R1-D3). Seçeneksiz çözücü KISALTILMIŞ
  // etiketi kabul eder (ölçüldü, Node v24.14.0: 12/8/4 bayt KABUL; Node 20
  // belgesi: v20.13.0'da yalnız "belge düzeyinde" kullanım dışı, DEP0182).
  // 4 baytlık etiket = 2^32 denemede sahte değer. İki katman: bu kontrol VE
  // çözücüdeki `authTagLength`.
  if (iv.length !== IV_BAYT || etiket.length !== ETIKET_BAYT) {
    throw new Error('kimlik-sifreleme: IV ya da etiket uzunluğu geçersiz');
  }
  const cozucu = createDecipheriv('aes-256-gcm', anahtar, iv, { authTagLength: ETIKET_BAYT });
  cozucu.setAAD(ekVeri);
  cozucu.setAuthTag(etiket);
  try {
    return Buffer.concat([cozucu.update(govde), cozucu.final()]).toString('utf8');
  } catch {
    // Node'un iç mesajı ("unable to authenticate data") yerine NEDEN AİLESİ:
    // anahtar, AAD ya da değer uyuşmuyor. Değerin kendisi mesaja girmez.
    throw new Error('kimlik-sifreleme: değer doğrulanamadı (anahtar, AAD ya da değer uyuşmuyor)');
  }
}
