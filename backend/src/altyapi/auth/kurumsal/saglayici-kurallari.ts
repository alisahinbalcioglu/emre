import { domainToASCII } from 'node:url';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KURUMSAL GİRİŞ — SAĞLAYICI KURALLARI (Microsoft Entra ID · Google Workspace)
 *  Faz 7 · F3a · tasarım §5.2-5.3 — SAF: ağ yok, DB yok, route yok.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Buradaki her fonksiyon, imzası ZATEN doğrulanmış (`oidc-istemci.ts`
 *  `idTokenDogrula`) talepler üzerinde karar verir. İmza doğrulaması "bu token
 *  gerçekten o sağlayıcıdan" der; bu dosya "bu kişi GERÇEKTEN o firmanın
 *  çalışanı mı, e-postası kanıt sayılır mı" sorusunu cevaplar. İkisi ayrı
 *  kapıdır, biri ötekinin yerini tutmaz.
 *
 *  Kaynaklar (16.09.2026'da yeniden okundu):
 *   - Entra ID token talepleri: https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
 *   - Entra isteğe bağlı talepler (xms_edov): https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference
 *   - Google OIDC: https://developers.google.com/identity/openid-connect/openid-connect
 *
 *  Kural özeti:
 *   - Entra kimliği `(iss, oid)`; `iss` kiracıya özel, `tid` ayrıca doğrulanır.
 *     Kişisel hesap kiracısı ve `common/organizations/consumers` KABUL EDİLMEZ.
 *   - Entra MİSAFİR (B2B) hesabı: `idp` varsa ve `iss`'ten farklıysa misafirdir.
 *     Tek kiracılı uygulamada `tid` kontrolü misafiri ELEMEZ (misafir kaynak
 *     kiracıda kimlik doğrular).
 *   - Entra `email` "doğruluğu garanti değil": kanıt YALNIZ `xms_edov === true`.
 *   - Google: `hd` KONTROL EDİLMELİ (izin ekranı yanlışlıkla "Harici" seçilirse
 *     her Google hesabı kimlik doğrular; tek kapı budur); e-posta kanıtı
 *     `email_verified === true`. Kimlik `sub` (e-posta tanımlayıcı değildir).
 */

export type SaglayiciTipi = 'entra' | 'google';

/** Microsoft kişisel hesap (MSA) kiracısı — kurumsal kiracı SAYILMAZ. */
export const TUKETICI_KIRACI_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';
/** Google iki biçim yayınlar; kalıcı kimlikte bu biçime normalize edilir. */
export const GOOGLE_ISSUER = 'https://accounts.google.com';

const GUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALAN_ADI_DESENI = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

export type KurumsalKuralKodu = 'KIRACI_GECERSIZ' | 'KIMLIK_TALEBI_EKSIK' | 'SAGLAYICI_TIPI_GECERSIZ';

/** Kural ihlali — çağıran (F3b) koda göre gerekçeli yanıt üretir. */
export class KurumsalKuralHatasi extends Error {
  constructor(
    public readonly kod: KurumsalKuralKodu,
    mesaj: string,
  ) {
    super(mesaj);
    this.name = 'KurumsalKuralHatasi';
  }
}

/** Doğrulanmış id_token talepleri (yalnız burada okunan alanlar adlandırıldı). */
export interface KurumsalTalepler {
  iss?: unknown;
  sub?: unknown;
  oid?: unknown;
  tid?: unknown;
  idp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  xms_edov?: unknown;
  hd?: unknown;
  [talep: string]: unknown;
}

export interface SaglayiciOzeti {
  tip: SaglayiciTipi;
  /** Yalnız entra; ayar formunda kaydedilen kiracı GUID'i. */
  entraKiraciId?: string | null;
}

/** Küçük harfli GUID; tüketici kiracısı ve GUID olmayan her şey → null. */
export function kiraciIdNormalize(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const k = s.trim().toLowerCase();
  if (!GUID_DESENI.test(k)) return null;
  if (k === TUKETICI_KIRACI_ID) return null;
  return k;
}

/** Kurumsal kiracı GUID'i mi (büyük harf girdi normalize edilerek sınanır). */
export function kiraciIdGecerliMi(s: unknown): boolean {
  return kiraciIdNormalize(s) !== null;
}

/**
 * id_token doğrulamasında `iss` BEKLENTİSİNİN TEK KAYNAĞI (R1-D5).
 * Google iki değer yayınlar → DİZİ döner; tek dizgeye indirgemek
 * `accounts.google.com` biçimli geçerli token'ları reddettirir.
 * ⚠ DB'deki `issuer` kolonu gösterim/denetim içindir; doğrulamaya o VERİLMEZ.
 */
export function beklenenIssuer(tip: SaglayiciTipi, kiraciId: string | null): string | string[] {
  if (tip === 'google') return [GOOGLE_ISSUER, 'accounts.google.com'];
  if (tip === 'entra') {
    const k = kiraciIdNormalize(kiraciId);
    if (!k) {
      throw new KurumsalKuralHatasi('KIRACI_GECERSIZ', 'Entra kiracı kimliği geçerli bir kurumsal kiracı GUID\'i değil.');
    }
    return `https://login.microsoftonline.com/${k}/v2.0`;
  }
  throw new KurumsalKuralHatasi('SAGLAYICI_TIPI_GECERSIZ', 'Bilinmeyen kimlik sağlayıcı tipi.');
}

/**
 * Kalıcı dış kimlik anahtarı `(issuer, subject)`.
 * Entra: `oid` (uygulamalar arası sabit; `sub` uygulamaya özel çifttir) + `tid`.
 * Google: `sub`; issuer tek biçime (`https://accounts.google.com`) normalize.
 */
export function kimlikAnahtari(
  claims: KurumsalTalepler,
  tip: SaglayiciTipi,
): { issuer: string; subject: string; entraKiraciId?: string } {
  if (tip === 'entra') {
    const kiraci = kiraciIdNormalize(claims.tid);
    if (typeof claims.iss !== 'string' || typeof claims.oid !== 'string' || claims.oid === '' || !kiraci) {
      throw new KurumsalKuralHatasi(
        'KIMLIK_TALEBI_EKSIK',
        'Kimlik belgesinde iss/oid/tid eksik (uygulama kaydında profile kapsamı istenmeli).',
      );
    }
    return { issuer: claims.iss, subject: claims.oid, entraKiraciId: kiraci };
  }
  if (tip === 'google') {
    if (typeof claims.sub !== 'string' || claims.sub === '') {
      throw new KurumsalKuralHatasi('KIMLIK_TALEBI_EKSIK', 'Kimlik belgesinde sub eksik.');
    }
    return { issuer: GOOGLE_ISSUER, subject: claims.sub };
  }
  throw new KurumsalKuralHatasi('SAGLAYICI_TIPI_GECERSIZ', 'Bilinmeyen kimlik sağlayıcı tipi.');
}

/** Entra misafir (B2B) hesabı: `idp` VAR ve `iss`'e EŞİT DEĞİL. */
export function misafirMi(claims: KurumsalTalepler, tip: SaglayiciTipi): boolean {
  return tip === 'entra' && claims.idp !== undefined && claims.idp !== claims.iss;
}

/**
 * Alan adı normalizasyonu: trim → sondaki tek nokta → küçük harf →
 * `domainToASCII` (IDN → punycode) → DESEN. Desen ŞART: `domainToASCII`
 * `bad..domain`, `-a.com` ve `a` girdilerini REDDETMEZ, olduğu gibi döndürür
 * (Node v24.14.0'da ölçüldü).
 */
export function alanAdiNormalize(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  let a = s.trim();
  if (a.endsWith('.')) a = a.slice(0, -1);
  a = a.toLowerCase();
  const ascii = domainToASCII(a);
  if (!ascii || !ALAN_ADI_DESENI.test(ascii)) return null;
  return ascii;
}

/**
 * Ayar formu için: `xn--` ile başlayan etiket varsa `idnUyarisi` — "Alan adında
 * Türkçe karakter var, doğru mu?" (ölçüldü: `FİRMA.com.tr` → `xn--firma-8fd.com.tr`,
 * yani büyük İ ayrı bir alan adına dönüşür).
 */
export function alanAdiNormalizeAyrintili(s: unknown): { alanAdi: string; idnUyarisi: boolean } | null {
  const alanAdi = alanAdiNormalize(s);
  if (!alanAdi) return null;
  return { alanAdi, idnUyarisi: alanAdi.split('.').some((etiket) => etiket.startsWith('xn--')) };
}

/** E-postanın son `@` sonrası, normalize edilmiş alan adı. */
export function epostaAlanAdi(e: unknown): string | null {
  if (typeof e !== 'string') return null;
  const i = e.lastIndexOf('@');
  if (i <= 0 || i === e.length - 1) return null;
  return alanAdiNormalize(e.slice(i + 1));
}

/** Doğrulanmış alan adı listesi — her öğe normalize edilir, geçersizler düşer. */
function dogrulanmisListe(dogrulanmis: unknown): string[] {
  if (!Array.isArray(dogrulanmis)) return [];
  return dogrulanmis.map((d) => alanAdiNormalize(d)).filter((d): d is string => d !== null);
}

/** E-posta normalizasyonu: ASCII küçük harf (Türkçe yerel ayarı UYGULANMAZ). */
function epostaNormalize(e: unknown): string | null {
  if (typeof e !== 'string') return null;
  const t = e.trim();
  if (t === '' || t.indexOf('@') <= 0) return null;
  return t.replace(/[A-Z]/g, (h) => h.toLowerCase());
}

function entraEpostasiDogrulanmis(claims: KurumsalTalepler): boolean {
  return claims.xms_edov === true;
}

function googleEpostasiDogrulanmis(claims: KurumsalTalepler): boolean {
  return claims.email_verified === true;
}

/**
 * Bu kişi yapılandırılmış kurumun çalışanı mı?
 * Entra: `tid` ayarlanan kiracı ve misafir DEĞİL. Google: `hd` doğrulanmış alan
 * adlarından biri (`hd` yoksa kişisel Gmail'dir → hayır).
 */
export function kurumsalKimlikMi(
  claims: KurumsalTalepler,
  saglayici: SaglayiciOzeti,
  dogrulanmis: string[],
): boolean {
  if (saglayici.tip === 'entra') {
    const beklenen = kiraciIdNormalize(saglayici.entraKiraciId);
    const gelen = kiraciIdNormalize(claims.tid);
    if (beklenen === null || gelen !== beklenen) return false;
    return !misafirMi(claims, 'entra');
  }
  if (saglayici.tip === 'google') {
    const hd = alanAdiNormalize(claims.hd);
    return hd !== null && dogrulanmisListe(dogrulanmis).includes(hd);
  }
  return false;
}

/**
 * E-posta KANIT sayılır mı? Sayılırsa ASCII küçük harfli e-posta, sayılmazsa null.
 * Entra: `xms_edov === true` + e-postanın alan adı doğrulanmış listede.
 * Google: `email_verified === true` + `hd` listede + e-postanın alan adı listede.
 */
export function epostaKanitli(
  claims: KurumsalTalepler,
  saglayici: SaglayiciOzeti,
  dogrulanmis: string[],
): { eposta: string } | null {
  const eposta = epostaNormalize(claims.email);
  const alan = epostaAlanAdi(eposta);
  const liste = dogrulanmisListe(dogrulanmis);
  if (eposta === null || alan === null || !liste.includes(alan)) return null;
  if (saglayici.tip === 'entra') {
    return entraEpostasiDogrulanmis(claims) ? { eposta } : null;
  }
  if (saglayici.tip === 'google') {
    const hd = alanAdiNormalize(claims.hd);
    return googleEpostasiDogrulanmis(claims) && hd !== null && liste.includes(hd) ? { eposta } : null;
  }
  return null;
}

/** Alan adı SINAMASI kanıtı (Entra): yalnız `xms_edov === true` iken e-postanın alan adı. */
export function entraSinamaKaniti(claims: KurumsalTalepler): string[] {
  if (!entraEpostasiDogrulanmis(claims)) return [];
  const alan = epostaAlanAdi(epostaNormalize(claims.email));
  return alan ? [alan] : [];
}

/** Alan adı SINAMASI kanıtı (Google): yalnız `email_verified === true` ve `hd` varken `[hd, e-posta alanı]` (tekil). */
export function googleSinamaKaniti(claims: KurumsalTalepler): string[] {
  const hd = alanAdiNormalize(claims.hd);
  if (!googleEpostasiDogrulanmis(claims) || hd === null) return [];
  const alan = epostaAlanAdi(epostaNormalize(claims.email));
  return [...new Set([hd, alan].filter((a): a is string => a !== null))];
}
