import { Logger } from '@nestjs/common';
import { createPublicKey, KeyObject } from 'node:crypto';
import { decode, JsonWebTokenError, NotBeforeError, TokenExpiredError, verify } from 'jsonwebtoken';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OIDC İSTEMCİ ÇEKİRDEĞİ — keşif, JWKS, kod değişimi, id_token doğrulama
 *  Faz 7 · F3a · tasarım §0.A, §5.1, §5.3 — route YOK, DB YOK.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── KÜTÜPHANE KARARI ───────────────────────────────────────────────────────
 *  `openid-client` 6.x ve `jose` 6.x yalnız ESM (require koşulu yok); backend
 *  CommonJS, CI Node 20. Kimlik kodu `require(esm)` olasılığına bağlanmaz.
 *  Parçalar: `node:crypto` (JWK → KeyObject) + `jsonwebtoken` 9.0.2.
 *  ⚠ Nest'in JWT servisi IdP token'ı için KULLANILMAZ: modül düzeyindeki
 *  JWT_SECRET, çağrıdaki `publicKey`'i ezer (getSecretKey sırası) — RS256 hiç
 *  çalışmaz, "düzeltmek" için algoritma listesini genişletmek anahtar
 *  karışıklığı açığı olur. Kaynak kapısı: `test:faz7-oidc` O17.
 *
 *  ── AĞ ─────────────────────────────────────────────────────────────────────
 *  Her dış çağrı `fetchFn` PARAMETRESİYLE yapılır (test: süreç içi sahte
 *  sağlayıcı; gerçek ağ yok). Yalnız `https:` ve `IZINLI_HOSTLAR`; keşif
 *  belgesindeki uç adresleri de bu listeye uymak ZORUNDA (zehirlenmiş keşif
 *  belgesi başka bir JWKS'e yönlendiremesin). `redirect: 'error'`: izinli bir
 *  hosttaki açık yönlendirme de listeyi aşamasın. Zaman aşımı 5 sn.
 *
 *  ── HATALAR ────────────────────────────────────────────────────────────────
 *  Her ret `OidcHatasi(kod)`. Mesajlar token, istemci sırrı ya da IdP hata
 *  gövdesi TAŞIMAZ; IdP hata gövdesi yalnız günlüğe (sırlar maskelenerek).
 */

export type OidcHataKodu =
  | 'KESIF_GECERSIZ'
  | 'HOST_IZINSIZ'
  | 'JWKS_GECERSIZ'
  | 'ANAHTAR_YOK'
  | 'ISTEMCI_SIRRI_GECERSIZ'
  | 'KOD_GECERSIZ'
  | 'IDP_HATASI'
  | 'IMZA_GECERSIZ'
  | 'ISSUER_UYUSMADI'
  | 'AUD_UYUSMADI'
  | 'NONCE_UYUSMADI'
  | 'SURE_DOLDU'
  | 'ALG_IZINSIZ';

export class OidcHatasi extends Error {
  constructor(
    public readonly kod: OidcHataKodu,
    mesaj?: string,
  ) {
    super(mesaj ? `${kod}: ${mesaj}` : kod);
    this.name = 'OidcHatasi';
  }
}

/** Keşif, JWKS ve token uçlarının bulunabileceği TEK hostlar. */
export const IZINLI_HOSTLAR: readonly string[] = [
  'login.microsoftonline.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'www.googleapis.com',
];

/** `profile` olmadan Entra `oid`, `email` olmadan `xms_edov` gelmez (§5.2). */
export const OIDC_KAPSAM = 'openid profile email';
export const OIDC_ZAMAN_ASIMI_MS = 5000;
const KESIF_OMRU_MS = 24 * 60 * 60 * 1000;
const JWKS_OMRU_MS = 60 * 60 * 1000;
const JWKS_ZORLA_ARALIGI_MS = 60 * 1000;

/** Gerçek `fetch`'in bu dosyanın kullandığı alt kümesi. */
export interface OidcYanit {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
export interface OidcIstekSecenekleri {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  redirect: 'error';
}
export type FetchFn = (url: string, secenekler: OidcIstekSecenekleri) => Promise<OidcYanit>;

export interface KesifBelgesi {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface JwkAnahtar {
  kty?: unknown;
  kid?: unknown;
  use?: unknown;
  alg?: unknown;
  n?: unknown;
  e?: unknown;
  [alan: string]: unknown;
}

export interface OidcAyar {
  /** Önbellek ve süre kararları için (varsayılan `Date.now()`). */
  simdiMs?: number;
  /** Yalnız test: varsayılan 5 sn. */
  zamanAsimiMs?: number;
  /** IdP hata gövdesinin yazıldığı yer (varsayılan Nest Logger). */
  gunluk?: (satir: string) => void;
}

const kesifOnbellegi = new Map<string, { belge: KesifBelgesi; sonKullanma: number }>();
const jwksOnbellegi = new Map<string, { anahtarlar: JwkAnahtar[]; sonKullanma: number }>();
const jwksZorlaCekildi = new Map<string, number>();

/** Yalnız test: modül düzeyi önbellekleri boşaltır. */
export function onbellekleriTemizle(): void {
  kesifOnbellegi.clear();
  jwksOnbellegi.clear();
  jwksZorlaCekildi.clear();
}

const varsayilanGunluk = (satir: string) => new Logger('OidcIstemci').warn(satir);

/** Adres yalnız `https:` + izinli host (port/kullanıcı bilgisi yok) olabilir. */
function adresDenetle(adres: unknown): string {
  let u: URL;
  try {
    u = new URL(String(adres));
  } catch {
    throw new OidcHatasi('HOST_IZINSIZ', 'adres ayrıştırılamadı');
  }
  if (u.protocol !== 'https:' || !IZINLI_HOSTLAR.includes(u.hostname) || u.port !== '' || u.username !== '' || u.password !== '') throw new OidcHatasi('HOST_IZINSIZ', `izinsiz adres ${u.protocol}//${u.hostname}`);
  return u.toString();
}

async function jsonIste(
  adres: string,
  fetchFn: FetchFn,
  hataKodu: OidcHataKodu,
  ayar: OidcAyar,
  istek: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = { method: 'GET' },
): Promise<{ ok: boolean; status: number; govde: unknown; ham: string }> {
  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), ayar.zamanAsimiMs ?? OIDC_ZAMAN_ASIMI_MS);
  try {
    const yanit = await fetchFn(adres, {
      method: istek.method,
      headers: { accept: 'application/json', ...(istek.headers ?? {}) },
      body: istek.body,
      signal: denetleyici.signal,
      redirect: 'error',
    });
    const ham = await yanit.text();
    let govde: unknown = null;
    try {
      govde = JSON.parse(ham);
    } catch {
      govde = null;
    }
    return { ok: yanit.ok, status: yanit.status, govde, ham };
  } catch {
    // Ağ hatası / zaman aşımı / yönlendirme reddi — adres sorgusuz, gövde yok.
    throw new OidcHatasi(hataKodu, `istek tamamlanamadı (${adres.split('?')[0]})`);
  } finally {
    clearTimeout(zamanlayici);
  }
}

function nesneMi(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Keşif belgesi: `${issuer}/.well-known/openid-configuration`. Belgedeki
 * `issuer` beklenene BİREBİR eşit olmalı; üç uç adresi `https:` + izinli host.
 * Önbellek 24 sa (issuer başına).
 */
export async function kesifAl(issuer: string, fetchFn: FetchFn, ayar: OidcAyar = {}): Promise<KesifBelgesi> {
  const simdi = ayar.simdiMs ?? Date.now();
  const kayit = kesifOnbellegi.get(issuer);
  if (kayit && kayit.sonKullanma > simdi) return kayit.belge;
  const adres = adresDenetle(`${issuer}/.well-known/openid-configuration`);
  const { ok, govde } = await jsonIste(adres, fetchFn, 'KESIF_GECERSIZ', ayar);
  if (!ok || !nesneMi(govde)) throw new OidcHatasi('KESIF_GECERSIZ', 'keşif belgesi okunamadı');
  if (govde.issuer !== issuer) throw new OidcHatasi('KESIF_GECERSIZ', 'belgedeki issuer beklenenle aynı değil');
  const uclar = ['authorization_endpoint', 'token_endpoint', 'jwks_uri'].map((alan) => {
    if (typeof govde[alan] !== 'string') throw new OidcHatasi('KESIF_GECERSIZ', `${alan} yok`);
    return adresDenetle(govde[alan]);
  });
  const belge: KesifBelgesi = { issuer, authorizationEndpoint: uclar[0], tokenEndpoint: uclar[1], jwksUri: uclar[2] };
  kesifOnbellegi.set(issuer, { belge, sonKullanma: simdi + KESIF_OMRU_MS });
  return belge;
}

/**
 * JWKS: önbellek 1 sa. `zorla` (bilinmeyen `kid`) önbelleği atlar ama aynı
 * adres için EN FAZLA DAKİKADA BİR gerçekten çeker — sahte `kid`'li token
 * yağdırarak sağlayıcıya istek fırtınası yaptırılamasın.
 */
export async function jwksAl(
  uri: string,
  fetchFn: FetchFn,
  ayar: OidcAyar & { zorla?: boolean } = {},
): Promise<JwkAnahtar[]> {
  const adres = adresDenetle(uri);
  const simdi = ayar.simdiMs ?? Date.now();
  const kayit = jwksOnbellegi.get(adres);
  if (kayit && !ayar.zorla && kayit.sonKullanma > simdi) return kayit.anahtarlar;
  if (ayar.zorla && kayit) {
    const son = jwksZorlaCekildi.get(adres);
    if (son !== undefined && simdi - son < JWKS_ZORLA_ARALIGI_MS) return kayit.anahtarlar;
    jwksZorlaCekildi.set(adres, simdi);
  }
  const { ok, govde } = await jsonIste(adres, fetchFn, 'JWKS_GECERSIZ', ayar);
  if (!ok || !nesneMi(govde) || !Array.isArray(govde.keys)) throw new OidcHatasi('JWKS_GECERSIZ', 'JWKS okunamadı');
  const anahtarlar = govde.keys.filter(nesneMi) as JwkAnahtar[];
  jwksOnbellegi.set(adres, { anahtarlar, sonKullanma: simdi + JWKS_OMRU_MS });
  return anahtarlar;
}

function doluMu(x: unknown): x is string {
  return typeof x === 'string' && x.trim() !== '';
}

/**
 * Yetkilendirme kodu → id_token (`client_secret_post`, PKCE doğrulayıcısıyla).
 * IdP hata gövdesi GÜNLÜĞE yazılır (sır/kod maskelenerek), dönen hatada YOK.
 */
export async function kodDegistir(
  g: { tokenUrl: string; code: string; redirectUri: string; clientId: string; clientSecret: string; codeVerifier: string },
  fetchFn: FetchFn,
  ayar: OidcAyar = {},
): Promise<{ idToken: string }> {
  const adres = adresDenetle(g.tokenUrl);
  if (!doluMu(g.code) || !doluMu(g.codeVerifier) || !doluMu(g.redirectUri)) {
    throw new OidcHatasi('KOD_GECERSIZ', 'kod, doğrulayıcı ya da dönüş adresi eksik');
  }
  if (!doluMu(g.clientId) || !doluMu(g.clientSecret)) {
    throw new OidcHatasi('ISTEMCI_SIRRI_GECERSIZ', 'istemci kimliği ya da sırrı eksik');
  }
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: g.code,
    redirect_uri: g.redirectUri,
    client_id: g.clientId,
    client_secret: g.clientSecret,
    code_verifier: g.codeVerifier,
  });
  const { ok, status, govde, ham } = await jsonIste(adres, fetchFn, 'IDP_HATASI', ayar, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!ok) {
    const hata = nesneMi(govde) && typeof govde.error === 'string' ? govde.error : '';
    const maskeli = [g.clientSecret, g.code, g.codeVerifier].reduce((m, sir) => m.split(sir).join('***'), ham).slice(0, 500);
    (ayar.gunluk ?? varsayilanGunluk)(`token ucu reddetti: status=${status} error=${hata || '-'} govde=${maskeli}`);
    if (hata === 'invalid_client') throw new OidcHatasi('ISTEMCI_SIRRI_GECERSIZ', `token ucu ${status}`);
    if (hata === 'invalid_grant') throw new OidcHatasi('KOD_GECERSIZ', `token ucu ${status}`);
    throw new OidcHatasi('IDP_HATASI', `token ucu ${status}`);
  }
  if (!nesneMi(govde) || !doluMu(govde.id_token)) {
    throw new OidcHatasi('IDP_HATASI', 'token yanıtında id_token yok');
  }
  return { idToken: govde.id_token };
}

/**
 * Yetkilendirme adresi (saf). `response_type=code`, kapsam SABİT
 * `openid profile email`, PKCE `S256`; Entra'da `domain_hint`, Google'da `hd`.
 * `login_hint` ASLA gönderilmez (keşif adresinde gelse de silinir): kişiyi
 * önceden seçmek hesap karışıklığını kullanıcıdan gizler.
 */
export function yetkilendirmeUrlKur(g: {
  authorizationEndpoint: string;
  tip: 'entra' | 'google';
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  alanIpucu?: string | null;
}): string {
  if (g.tip !== 'entra' && g.tip !== 'google') throw new TypeError('yetkilendirmeUrlKur: bilinmeyen sağlayıcı tipi');
  for (const alan of ['clientId', 'redirectUri', 'state', 'nonce', 'codeChallenge'] as const) {
    if (!doluMu(g[alan])) throw new TypeError(`yetkilendirmeUrlKur: ${alan} boş olamaz`);
  }
  const adres = new URL(adresDenetle(g.authorizationEndpoint));
  const p = adres.searchParams;
  p.set('client_id', g.clientId);
  p.set('response_type', 'code');
  p.set('redirect_uri', g.redirectUri);
  p.set('scope', OIDC_KAPSAM);
  p.set('state', g.state);
  p.set('nonce', g.nonce);
  p.set('code_challenge', g.codeChallenge);
  p.set('code_challenge_method', 'S256');
  if (doluMu(g.alanIpucu)) p.set(g.tip === 'entra' ? 'domain_hint' : 'hd', g.alanIpucu);
  p.delete('login_hint');
  return adres.toString();
}

/** jsonwebtoken hatasını OIDC koduna çevirir (mesaj token taşımaz). */
function jwtHatasiniCevir(e: unknown): OidcHatasi {
  if (e instanceof TokenExpiredError || e instanceof NotBeforeError) return new OidcHatasi('SURE_DOLDU', e.message);
  const mesaj = e instanceof Error ? e.message : '';
  if (e instanceof JsonWebTokenError) {
    if (mesaj === 'invalid algorithm') return new OidcHatasi('ALG_IZINSIZ', mesaj);
    if (mesaj.startsWith('jwt issuer invalid')) return new OidcHatasi('ISSUER_UYUSMADI');
    if (mesaj.startsWith('jwt audience invalid')) return new OidcHatasi('AUD_UYUSMADI');
    if (mesaj.startsWith('jwt nonce invalid')) return new OidcHatasi('NONCE_UYUSMADI');
    if (mesaj === 'iat required when maxAge is specified') return new OidcHatasi('SURE_DOLDU', mesaj);
  }
  return new OidcHatasi('IMZA_GECERSIZ', mesaj.slice(0, 120));
}

export type IdTokenTalepleri = Record<string, unknown> & { iss: string; aud: string | string[]; exp: number; iat: number };

/**
 * KATMAN 2 — imza ve standart talepler, verilen AÇIK ANAHTARLA.
 * Algoritma listesi YALNIZ RS256: ret NEDENİ ("invalid algorithm") bu listedir;
 * jsonwebtoken'ın anahtar türü denetimi (`verify.js:148`) ikinci emniyettir.
 * `jsonwebtoken` `exp`'i zorunlu TUTMAZ (yalnız varsa denetler) → ayrıca istenir.
 */
export function imzaVeTalepleriDogrula(
  idToken: string,
  anahtar: KeyObject,
  b: { issuer: string | string[]; clientId: string; nonce: string; simdiMs: number },
): IdTokenTalepleri {
  let yuk: unknown;
  try {
    yuk = verify(idToken, anahtar, {
      algorithms: ['RS256'],
      audience: b.clientId,
      issuer: b.issuer,
      nonce: b.nonce,
      clockTolerance: 60,
      maxAge: '10m',
      clockTimestamp: Math.floor(b.simdiMs / 1000),
    });
  } catch (e) {
    throw jwtHatasiniCevir(e);
  }
  if (!nesneMi(yuk)) throw new OidcHatasi('IMZA_GECERSIZ', 'yük nesne değil');
  if (typeof yuk.exp !== 'number' || typeof yuk.iat !== 'number') throw new OidcHatasi('SURE_DOLDU', 'exp/iat eksik');
  if (Array.isArray(yuk.aud) && yuk.aud.length > 1 && yuk.azp !== b.clientId) throw new OidcHatasi('AUD_UYUSMADI', 'azp istemciyle aynı değil');
  return yuk as IdTokenTalepleri;
}

function beklenenIssuerDolu(issuer: unknown): boolean {
  if (typeof issuer === 'string') return issuer !== '';
  return Array.isArray(issuer) && issuer.length > 0 && issuer.every((i) => typeof i === 'string' && i !== '');
}

async function anahtarBul(jwksUri: string, kid: string, fetchFn: FetchFn, simdiMs: number): Promise<KeyObject> {
  let jwk = (await jwksAl(jwksUri, fetchFn, { simdiMs })).find((k) => k.kid === kid);
  if (!jwk) jwk = (await jwksAl(jwksUri, fetchFn, { simdiMs, zorla: true })).find((k) => k.kid === kid);
  if (!jwk) throw new OidcHatasi('ANAHTAR_YOK', 'kid JWKS içinde yok');
  if (jwk.kty !== 'RSA' || (jwk.use !== undefined && jwk.use !== 'sig') || (jwk.alg !== undefined && jwk.alg !== 'RS256')) {
    throw new OidcHatasi('ANAHTAR_YOK', 'kid eşleşti ama RS256 imza anahtarı değil');
  }
  try {
    // Yalnız açık bileşenler: zehirli JWKS özel anahtar alanı taşısa da okunmaz.
    return createPublicKey({ key: { kty: 'RSA', n: jwk.n as string, e: jwk.e as string }, format: 'jwk' });
  } catch {
    throw new OidcHatasi('JWKS_GECERSIZ', 'JWK açık anahtara çevrilemedi');
  }
}

/**
 * id_token doğrulama (KATMAN 1 başlık + anahtar seçimi, KATMAN 2 imza/talepler).
 *
 * ⚠ `issuer` HER ÇAĞRIDA `beklenenIssuer(tip, entraKiraciId)`'den verilir
 * (Google için iki değerli dizi). DB'deki `FirmaKimlikSaglayici.issuer`
 * kolonunu buraya VERMEYİN: tek dizge `accounts.google.com` biçimli geçerli
 * token'ları reddettirir (R1-D5, `test:faz7-oidc` O20).
 *
 * Boş `nonce`/`issuer`/`clientId` parametresi REDDEDİLİR: jsonwebtoken boş
 * değerde ilgili denetimi SESSİZCE ATLAR.
 */
export async function idTokenDogrula(g: {
  idToken: string;
  jwksUri: string;
  fetchFn: FetchFn;
  issuer: string | string[];
  clientId: string;
  nonce: string;
  simdiMs: number;
}): Promise<IdTokenTalepleri> {
  if (!doluMu(g.nonce)) throw new OidcHatasi('NONCE_UYUSMADI', 'beklenen nonce boş');
  if (!beklenenIssuerDolu(g.issuer)) throw new OidcHatasi('ISSUER_UYUSMADI', 'beklenen issuer boş');
  if (!doluMu(g.clientId)) throw new OidcHatasi('AUD_UYUSMADI', 'istemci kimliği boş');
  let cozulmus: { header: { alg?: unknown; kid?: unknown }; payload: unknown } | null = null;
  try {
    if (typeof g.idToken === 'string') {
      cozulmus = decode(g.idToken, { complete: true }) as typeof cozulmus;
    }
  } catch {
    cozulmus = null;
  }
  if (!cozulmus || !nesneMi(cozulmus.payload)) throw new OidcHatasi('IMZA_GECERSIZ', 'id_token ayrıştırılamadı');
  if (cozulmus.header.alg !== 'RS256') throw new OidcHatasi('ALG_IZINSIZ', 'başlık algoritması RS256 değil');
  if (!doluMu(cozulmus.header.kid)) throw new OidcHatasi('ANAHTAR_YOK', 'başlıkta kid yok');
  const anahtar = await anahtarBul(g.jwksUri, cozulmus.header.kid, g.fetchFn, g.simdiMs);
  return imzaVeTalepleriDogrula(g.idToken, anahtar, {
    issuer: g.issuer,
    clientId: g.clientId,
    nonce: g.nonce,
    simdiMs: g.simdiMs,
  });
}
