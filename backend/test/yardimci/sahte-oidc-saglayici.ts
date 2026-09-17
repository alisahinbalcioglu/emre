import { createHmac, generateKeyPairSync, KeyObject } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import type { FetchFn, OidcIstekSecenekleri, OidcYanit } from '../../src/altyapi/auth/kurumsal/oidc-istemci';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SAHTE OIDC SAĞLAYICI (test yardımcısı — ÜRETİM KODU DEĞİL)  · Faz 7 F3a
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ GERÇEK HTTP SUNUCUSU AÇILMAZ ve gerçek Microsoft/Google'a istek gitmez:
 *  keşif, JWKS ve token uçları SÜREÇ İÇİNDE bir `fetchFn` ile taklit edilir
 *  (Windows'ta açık soket + `process.exit` dersi; CI'da ağ yok).
 *
 *  İki RSA anahtar çifti: biri sağlayıcının (JWKS'te yayınlanır), biri YABANCI
 *  (imza reddi ölçümü). Ayrıca `alg: none` ve HS256 "algoritma karışıklığı"
 *  token üreticileri vardır — ikisi de elle kurulur, çünkü kütüphane bunları
 *  imzalamayı reddeder.
 *
 *  Her istek `gunluk`'a yazılır: hangi adres, hangi gövde, kaç kez. Testler
 *  "gerçekten çağrıldı mı / önbellekten mi geldi" sorusunu buradan ölçer.
 */

export interface SahteIstek {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect?: string;
  signalVar: boolean;
  tur: 'kesif' | 'jwks' | 'token' | 'bilinmeyen';
}

export interface SahteTokenYaniti {
  status: number;
  govde: unknown;
  /** JSON yerine ham metin döndürmek için (bozuk yanıt ölçümü). */
  ham?: string;
}

export interface SahteSaglayiciAyari {
  tip: 'entra' | 'google';
  kiraciId?: string;
  clientId?: string;
  nonce?: string;
  eposta?: string;
  hd?: string;
  simdiMs?: number;
}

export interface SahteSaglayici {
  tip: 'entra' | 'google';
  issuer: string;
  clientId: string;
  nonce: string;
  kid: string;
  kiraciId: string;
  jwksUri: string;
  kesifAdresi: string;
  acikAnahtarPem: string;
  gunluk: SahteIstek[];
  fetchFn: FetchFn;
  kesifBelgesi(): Record<string, unknown>;
  kesifBelgesiniDegistir(yama: Record<string, unknown> | null): void;
  jwksAnahtarlariniDegistir(anahtarlar: unknown[] | null): void;
  tokenYanitiniAyarla(yanit: SahteTokenYaniti | null): void;
  idTokenBas(ozellestir?: Record<string, unknown>, secenek?: { kid?: string; yabanciImza?: boolean }): string;
  algNoneTokenBas(ozellestir?: Record<string, unknown>): string;
  hs256KarisiklikTokenBas(sir: string, ozellestir?: Record<string, unknown>): string;
  varsayilanTalepler(): Record<string, unknown>;
}

function b64url(veri: Buffer | string): string {
  return Buffer.from(veri).toString('base64url');
}

function yanit(status: number, govde: unknown, ham?: string): OidcYanit {
  const metin = ham ?? JSON.stringify(govde);
  return { ok: status >= 200 && status < 300, status, text: async () => metin };
}

export function sahteOidcSaglayici(ayar: SahteSaglayiciAyari): SahteSaglayici {
  const tip = ayar.tip;
  const kiraciId = ayar.kiraciId ?? '11111111-2222-3333-4444-555555555555';
  const clientId = ayar.clientId ?? 'sahte-istemci-kimligi';
  const nonce = ayar.nonce ?? 'sahte-nonce-degeri';
  const simdiMs = ayar.simdiMs ?? Date.UTC(2026, 8, 16, 10, 0, 0);
  const eposta = ayar.eposta ?? (tip === 'entra' ? 'ali@firma.com.tr' : 'ali@firma.com.tr');
  const hd = ayar.hd ?? 'firma.com.tr';
  const kid = 'sahte-kid-1';

  const anahtar = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const yabanci = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const acikAnahtarPem = anahtar.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const jwkHam = anahtar.publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

  const issuer = tip === 'entra' ? `https://login.microsoftonline.com/${kiraciId}/v2.0` : 'https://accounts.google.com';
  const kesifAdresi = `${issuer}/.well-known/openid-configuration`;
  const jwksUri =
    tip === 'entra'
      ? `https://login.microsoftonline.com/${kiraciId}/discovery/v2.0/keys`
      : 'https://www.googleapis.com/oauth2/v3/certs';
  const tokenUcu =
    tip === 'entra' ? `https://login.microsoftonline.com/${kiraciId}/oauth2/v2.0/token` : 'https://oauth2.googleapis.com/token';
  const yetkiUcu =
    tip === 'entra'
      ? `https://login.microsoftonline.com/${kiraciId}/oauth2/v2.0/authorize`
      : 'https://accounts.google.com/o/oauth2/v2/auth';

  // Gerçek sağlayıcıların JWKS satırları fazladan alan taşır (x5t, issuer);
  // `idTokenDogrula` yalnız kty/n/e okur — fixture bunu da sınar.
  const jwk: Record<string, unknown> =
    tip === 'entra'
      ? { kty: jwkHam.kty, n: jwkHam.n, e: jwkHam.e, kid, use: 'sig', x5t: 'sahte-x5t', issuer }
      : { kty: jwkHam.kty, n: jwkHam.n, e: jwkHam.e, kid, use: 'sig', alg: 'RS256' };

  let kesifYamasi: Record<string, unknown> | null = null;
  let jwksAnahtarlari: unknown[] | null = null;
  let tokenYaniti: SahteTokenYaniti | null = null;
  const gunluk: SahteIstek[] = [];

  function varsayilanTalepler(): Record<string, unknown> {
    const saniye = Math.floor(simdiMs / 1000);
    if (tip === 'entra') {
      return {
        iss: issuer,
        aud: clientId,
        sub: 'entra-uygulamaya-ozel-sub',
        oid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        tid: kiraciId,
        nonce,
        email: eposta,
        xms_edov: true,
        iat: saniye,
        exp: saniye + 3600,
      };
    }
    return {
      iss: issuer,
      aud: clientId,
      azp: clientId,
      sub: '110248495921238986420',
      hd,
      email: eposta,
      email_verified: true,
      nonce,
      iat: saniye,
      exp: saniye + 3600,
    };
  }

  function talepleriKur(ozellestir: Record<string, unknown> = {}): Record<string, unknown> {
    const yuk = varsayilanTalepler();
    for (const [k, v] of Object.entries(ozellestir)) {
      if (v === undefined) delete yuk[k];
      else yuk[k] = v;
    }
    return yuk;
  }

  function kesifBelgesi(): Record<string, unknown> {
    const taban: Record<string, unknown> = {
      issuer,
      authorization_endpoint: yetkiUcu,
      token_endpoint: tokenUcu,
      jwks_uri: jwksUri,
      response_types_supported: ['code', 'id_token', 'code id_token'],
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['plain', 'S256'],
    };
    return kesifYamasi ? { ...taban, ...kesifYamasi } : taban;
  }

  const fetchFn: FetchFn = async (url: string, secenekler: OidcIstekSecenekleri): Promise<OidcYanit> => {
    const tur: SahteIstek['tur'] =
      url === kesifAdresi ? 'kesif' : url === jwksUri ? 'jwks' : url === tokenUcu ? 'token' : 'bilinmeyen';
    gunluk.push({
      url,
      method: secenekler.method,
      headers: secenekler.headers,
      body: secenekler.body,
      redirect: secenekler.redirect,
      signalVar: Boolean(secenekler.signal),
      tur,
    });
    if (tur === 'kesif') return yanit(200, kesifBelgesi());
    if (tur === 'jwks') return yanit(200, { keys: jwksAnahtarlari ?? [jwk] });
    if (tur === 'token') {
      if (tokenYaniti) return yanit(tokenYaniti.status, tokenYaniti.govde, tokenYaniti.ham);
      return yanit(200, { token_type: 'Bearer', access_token: 'sahte-erisim', id_token: idTokenBas() });
    }
    return yanit(404, { error: 'not_found' });
  };

  function idTokenBas(ozellestir: Record<string, unknown> = {}, secenek: { kid?: string; yabanciImza?: boolean } = {}): string {
    const ozel: KeyObject = secenek.yabanciImza ? yabanci.privateKey : anahtar.privateKey;
    return sign(talepleriKur(ozellestir), ozel, { algorithm: 'RS256', keyid: secenek.kid ?? kid });
  }

  /** `alg: none` + BOŞ imza — kütüphane basmaz, elle kurulur. */
  function algNoneTokenBas(ozellestir: Record<string, unknown> = {}): string {
    const baslik = b64url(JSON.stringify({ alg: 'none', typ: 'JWT', kid }));
    const yuk = b64url(JSON.stringify(talepleriKur(ozellestir)));
    return `${baslik}.${yuk}.`;
  }

  /** ALGORİTMA KARIŞIKLIĞI: RSA AÇIK anahtarı HMAC sırrı gibi kullanılmış token. */
  function hs256KarisiklikTokenBas(sir: string, ozellestir: Record<string, unknown> = {}): string {
    const baslik = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid }));
    const yuk = b64url(JSON.stringify(talepleriKur(ozellestir)));
    const imza = createHmac('sha256', Buffer.from(sir)).update(`${baslik}.${yuk}`).digest('base64url');
    return `${baslik}.${yuk}.${imza}`;
  }

  return {
    tip,
    issuer,
    clientId,
    nonce,
    kid,
    kiraciId,
    jwksUri,
    kesifAdresi,
    acikAnahtarPem,
    gunluk,
    fetchFn,
    kesifBelgesi,
    kesifBelgesiniDegistir: (yama) => {
      kesifYamasi = yama;
    },
    jwksAnahtarlariniDegistir: (anahtarlar) => {
      jwksAnahtarlari = anahtarlar;
    },
    tokenYanitiniAyarla: (y) => {
      tokenYaniti = y;
    },
    idTokenBas,
    algNoneTokenBas,
    hs256KarisiklikTokenBas,
    varsayilanTalepler,
  };
}
