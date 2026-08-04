/**
 * 401 KAPSAMI — interceptor hangi uctan geldigini sormuyor (04.08.2026)
 *
 * KUSUR (ortak/lib/api.ts:13-23):
 *   response interceptor 401 gorunce KOSULSUZ olarak
 *     localStorage.removeItem('token') + removeItem('user')
 *     window.location.href = '/login'
 *   yapiyor. Giris istegi (`/auth/login`, bkz. app/login/page.tsx:23) AYNI
 *   axios ornegini kullandigi icin YANLIS SIFRE de 401 uretiyor; interceptor
 *   bunu "oturum dustu" sanip TAM SAYFA yenilemesi tetikliyor. login/page.tsx:28-32
 *   "Login failed" toast'i ekranda kalmiyor — kullanici bos bir form goruyor.
 *
 * DORT AYRI KRITER, DORT AYRI ASSERT (kural 4 — paylasilan assert kanit gizler):
 *   A1 — /auth/login 401'i oturumu SILMEZ
 *   A2 — /auth/login 401'i YONLENDIRME yapmaz
 *   B1 — /auth/me   401'i oturumu SILER      (regresyon kalkani, hep YESIL)
 *   B2 — /auth/me   401'i /login'e yonlendirir (regresyon kalkani, hep YESIL)
 *
 * BEKLENEN: A1+A2 KIRMIZI (kusur duruyor), B1+B2 YESIL.
 *
 * OLCUT SINAMASI (kural 5):
 *   Bu repoda jsdom/happy-dom KURULU DEGIL ve vitest.config.ts environment
 *   tanimlamiyor => varsayilan 'node'. `typeof window === 'undefined'` oldugu
 *   icin interceptor HIC CALISMAZ ve A1/A2 hicbir sey olcmeden YESIL doner.
 *   Bu yalanci yesili onlemek icin:
 *     (1) window + localStorage globalleri BURADA elle kuruluyor (yeni bagimlilik yok),
 *     (2) "OLCUT SINAMASI" bloğu adapter'in gercekten cagrildigini ayrica kanitliyor,
 *     (3) B1/B2 (interceptor'in calistiginin kaniti) YESIL olmak ZORUNDA — ikisi de
 *         kirmiziya donerse olculen sey urun degil, kosum ortamidir.
 *
 * jsdom KULLANILMADI: jsdom'da `location.href` atamasi "Not implemented:
 * navigation" ile YOK SAYILIR — href hicbir zaman degismezdi ve A2 olcmeden
 * gecerdi (yalanci yesil). Duz nesne stub'i atamayi gorunur kilar.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

const BASLANGIC_URL = 'http://localhost:3000/login';
const SEANS_JETONU = 'SEANS-JETONU-123';
const SEANS_KULLANICI = '{"email":"emre@example.com"}';

// --- Sahte localStorage (bare global; api.ts `localStorage.getItem` diye cagiriyor) ---
function sahteDepo() {
  const kutu = new Map<string, string>();
  return {
    kutu,
    getItem: (k: string) => (kutu.has(k) ? (kutu.get(k) as string) : null),
    setItem: (k: string, v: string) => void kutu.set(k, String(v)),
    removeItem: (k: string) => void kutu.delete(k),
    clear: () => kutu.clear(),
    key: (i: number) => Array.from(kutu.keys())[i] ?? null,
    get length() {
      return kutu.size;
    },
  };
}

const g = globalThis as any;
const ONCEKI_WINDOW = Object.prototype.hasOwnProperty.call(g, 'window')
  ? g.window
  : undefined;
const ONCEKI_STORAGE = Object.prototype.hasOwnProperty.call(g, 'localStorage')
  ? g.localStorage
  : undefined;

let depo: ReturnType<typeof sahteDepo>;
let pencere: { location: { href: string } };

// NOT: axios modulu import aninda `typeof window`u okur (hasStandardBrowserEnv).
// Globalleri BILEREK import'tan SONRA, her testten once kuruyoruz: boylece
// axios node yolunda kalir, api.ts'in interceptor'i ise cagri aninda window'u gorur.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import api from './api';

/** Verilen uca 401 dondur; istegin gercekten adapter'a ulastigini da kaydet. */
const adapterCagrilariUrl: string[] = [];
api.defaults.adapter = ((config: any) => {
  adapterCagrilariUrl.push(String(config.url));
  const hata: any = new Error('Request failed with status code 401');
  hata.isAxiosError = true;
  hata.config = config;
  hata.response = {
    status: 401,
    statusText: 'Unauthorized',
    data: { message: 'Invalid credentials' },
    headers: {},
    config,
  };
  return Promise.reject(hata);
}) as any;

beforeEach(() => {
  adapterCagrilariUrl.length = 0;
  depo = sahteDepo();
  depo.setItem('token', SEANS_JETONU);
  depo.setItem('user', SEANS_KULLANICI);
  pencere = { location: { href: BASLANGIC_URL } };
  g.localStorage = depo;
  g.window = pencere;
});

afterAll(() => {
  if (ONCEKI_WINDOW === undefined) delete g.window;
  else g.window = ONCEKI_WINDOW;
  if (ONCEKI_STORAGE === undefined) delete g.localStorage;
  else g.localStorage = ONCEKI_STORAGE;
});

async function dortYuzBirAl(url: string) {
  await expect(api.post(url, { email: 'a@b.c', password: 'yanlis' })).rejects.toMatchObject({
    response: { status: 401 },
  });
}

// ---------------------------------------------------------------------------
// OLCUT SINAMASI — testin gercekten interceptor'u tetikledigini kanitla
// ---------------------------------------------------------------------------
describe('OLCUT SINAMASI — kosum ortami', () => {
  it('istek gercekten adapter e ulasiyor (bos kosum degil)', async () => {
    await dortYuzBirAl('/auth/login');
    expect(adapterCagrilariUrl).toEqual(['/auth/login']);
  });

  it('interceptor in gordugu window/localStorage bizim stub umuz', async () => {
    expect(typeof (globalThis as any).window).toBe('object');
    expect((globalThis as any).localStorage.getItem('token')).toBe(SEANS_JETONU);
  });
});

// ---------------------------------------------------------------------------
// A — GIRIS UCU (/auth/login): 401 "oturum dustu" DEGILDIR
// ---------------------------------------------------------------------------
describe('A — /auth/login den gelen 401', () => {
  it('A1 — oturumu SILMEMELI', async () => {
    // On kosul (kural 3): olcecek bir sey oldugunu once kanitla.
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    expect(depo.getItem('user')).toBe(SEANS_KULLANICI);

    await dortYuzBirAl('/auth/login');

    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: SEANS_JETONU,
      user: SEANS_KULLANICI,
    });
  });

  it('A2 — YONLENDIRME YAPMAMALI (toast ekranda kalabilsin)', async () => {
    // On kosul (kural 3): baslangic adresi gercekten yerinde.
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzBirAl('/auth/login');

    expect(pencere.location.href).toBe(BASLANGIC_URL);
  });
});

// ---------------------------------------------------------------------------
// B — KORUMALI UC (/auth/me): 401 GERCEKTEN oturum dusmesidir (REGRESYON KALKANI)
//     Bu iki test duzeltmeden ONCE de SONRA da YESIL olmali.
// ---------------------------------------------------------------------------
describe('B — korumali uctan (/auth/me) gelen 401', () => {
  it('B1 — oturumu SILMELI', async () => {
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    expect(depo.getItem('user')).toBe(SEANS_KULLANICI);

    await dortYuzBirAl('/auth/me');

    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: null,
      user: null,
    });
  });

  it('B2 — /login e yonlendirmeli', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzBirAl('/auth/me');

    expect(pencere.location.href).toBe('/login');
  });
});
