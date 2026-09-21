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
let pencere: { location: { href: string; pathname: string }; dispatchEvent?: (e: any) => boolean };
const yayinlananOlaylar: string[] = [];

// NOT: axios modulu import aninda `typeof window`u okur (hasStandardBrowserEnv).
// Globalleri BILEREK import'tan SONRA, her testten once kuruyoruz: boylece
// axios node yolunda kalir, api.ts'in interceptor'i ise cagri aninda window'u gorur.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import api, {
  zamanAsimiSec,
  VARSAYILAN_ZAMAN_ASIMI_MS,
  AGIR_ZAMAN_ASIMI_MS,
} from './api';

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
  // ⚠ FAZ 7 F1b: `api.ts` 403 dalinda `window.location.pathname` okuyor.
  // ⚠ `ABONELIK_KISITLI` dali `window.dispatchEvent` cagiriyor; stub
  // olmadan E4 hic olcmeden TypeError'la duserdi (yalanci kirmizi).
  yayinlananOlaylar.length = 0;
  pencere = {
    location: { href: BASLANGIC_URL, pathname: '/login' },
    dispatchEvent: (e: any) => { yayinlananOlaylar.push(e?.type ?? String(e)); return true; },
  } as any;
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
// C — KAYIT UCU (/auth/register): 401 "oturum dustu" DEGILDIR  [KILIT L1]
//
// NEDEN AYRI BLOK: KIMLIK_UCLARI listesinde IKI uc var (api.ts:21) ama
// A blogu yalniz `/auth/login`i kosuyordu. Listeden `/auth/register`
// silinse A1/A2/B1/B2 DORDU DE YESIL kalir — yani muafiyetin yarisi
// olculmuyordu. Bu blok o yarisi kilitler.
//
// C1/C2, A1/A2'nin IKIZIDIR (ayni kriter, farkli uc). Kural 4 geregi
// "silinmedi" ve "yonlendirilmedi" AYRI assert'lerdir: tek assert'te
// birlestirilirse hangi yarinin bozuldugu gorunmez.
// ---------------------------------------------------------------------------
describe('C — /auth/register den gelen 401 [KILIT L1]', () => {
  it('C0 KAPI — istek gercekten /auth/register adresine gitti', async () => {
    await dortYuzBirAl('/auth/register');
    // Bos-kume yalanci yesili yasak (kural 3): adapter cagrilmadiysa
    // asagidaki C1/C2 hicbir sey olcmeden gecerdi.
    expect(adapterCagrilariUrl).toEqual(['/auth/register']);
  });

  it('C1 — oturumu SILMEMELI', async () => {
    // On kosul (kural 3): olcecek bir oturum gercekten var.
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    expect(depo.getItem('user')).toBe(SEANS_KULLANICI);

    await dortYuzBirAl('/auth/register');

    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: SEANS_JETONU,
      user: SEANS_KULLANICI,
    });
  });

  it('C2 — YONLENDIRME YAPMAMALI (kayit formu kendi hatasini gosterebilsin)', async () => {
    // On kosul (kural 3): baslangic adresi gercekten yerinde.
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzBirAl('/auth/register');

    expect(pencere.location.href).toBe(BASLANGIC_URL);
  });

  it('C3 — TAM URL ile gelse de muaf (err.config.url mutlak olabilir)', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzBirAl('http://localhost:3001/api/auth/register');

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

// ---------------------------------------------------------------------------
// D — FAZ 7 F2b: GIRISIN IKINCI ADIMI (guardsiz MFA uclari)  [KILIT L1]
//
// NEDEN AYRI BLOK: iki adimli girisin ikinci adimi HENUZ OTURUM DEGILDIR;
// kimligi meydan okuma token'i tasir. Oradan gelen 401 "meydan okumanin
// suresi doldu" demektir ve sayfa KENDISI 1. adima doner + NEDENINI soyler.
// `KIMLIK_UCLARI`'nda olmasalardi yakalayici tam sayfa `/login`
// yonlendirmesi yapardi ve kullanici hicbir mesaj GOREMEZDI — bu dosyanin
// en basindaki kusurun birebir aynisi.
//
// D1/D2 A1/A2'nin IKIZIDIR. Kural 4 geregi "silinmedi" ve "yonlendirilmedi"
// AYRI assert'lerdir.
// ---------------------------------------------------------------------------
const MFA_UCLARI = [
  '/auth/mfa/dogrula',
  '/auth/mfa/zorunlu-kurulum/baslat',
  '/auth/mfa/zorunlu-kurulum/onayla',
];

describe.each(MFA_UCLARI)('D — %s den gelen 401 [KILIT L1]', (uc) => {
  it('D0 KAPI — istek gercekten o adrese gitti', async () => {
    await dortYuzBirAl(uc);
    expect(adapterCagrilariUrl).toEqual([uc]);
  });

  it('D1 — oturumu SILMEMELI', async () => {
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    expect(depo.getItem('user')).toBe(SEANS_KULLANICI);

    await dortYuzBirAl(uc);

    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: SEANS_JETONU,
      user: SEANS_KULLANICI,
    });
  });

  it('D2 — YONLENDIRME YAPMAMALI (sayfa kendi 1. adimina doner)', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzBirAl(uc);

    expect(pencere.location.href).toBe(BASLANGIC_URL);
  });

  it('D3 — TAM URL ile gelse de muaf', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzBirAl(`http://localhost:3001/api${uc}`);

    expect(pencere.location.href).toBe(BASLANGIC_URL);
  });
});

// ---------------------------------------------------------------------------
// D4 — NEGATIF KRITER: OTURUMLU MFA UCLARI LISTEDE **YOK**
//
// `/auth/mfa/kapat` ve kardesleri yanlis parola/kodda **400** doner (backend
// `test:faz7-mfa` M11/M15b/M16 bunu olcer), yani yakalayici onlara zaten
// dokunmaz. Muafiyet listesine eklenselerdi o uclardaki GERCEK oturum
// dusmesi (token suresi dolmus) SESSIZLESIRDI.
// ---------------------------------------------------------------------------
describe('D4 — oturumlu MFA uclari muaf DEGIL', () => {
  it('/auth/mfa/kapat 401 alirsa oturum DUSER ve /login e gidilir', async () => {
    expect(depo.getItem('token')).toBe(SEANS_JETONU);

    await dortYuzBirAl('/auth/mfa/kapat');

    expect({ token: depo.getItem('token'), href: pencere.location.href }).toEqual({
      token: null,
      href: '/login',
    });
  });

  it('/auth/mfa/kurulum/baslat da muaf DEGIL', async () => {
    await dortYuzBirAl('/auth/mfa/kurulum/baslat');
    expect(pencere.location.href).toBe('/login');
  });
});

// ---------------------------------------------------------------------------
// E — FAZ 7 F1b (Emre karari E-3): 403 `KOLTUK_ASILDI`
//     Kisi sinirini asan hesap 403 alir. 401 DEGIL: oturum GECERLIDIR.
//     Oturumu silmek kullaniciyi giris ekranina atar, o tekrar girer, ayni
//     403'u alir — SONSUZ DONGU; durdurma ekranini hic goremezdi.
// ---------------------------------------------------------------------------
/** Verilen uctan 403 dondur (gövde `kod` tasir). */
async function ucYuzUcAl(url: string, kod: string) {
  const oncekiAdapter = api.defaults.adapter;
  api.defaults.adapter = ((config: any) => {
    adapterCagrilariUrl.push(String(config.url));
    const hata: any = new Error('Request failed with status code 403');
    hata.isAxiosError = true;
    hata.config = config;
    hata.response = {
      status: 403,
      statusText: 'Forbidden',
      data: { kod, mesaj: 'Firmanızın paketi 2 kişilik', hak: 2 },
      headers: {},
      config,
    };
    return Promise.reject(hata);
  }) as any;
  try {
    await expect(api.get(url)).rejects.toMatchObject({ response: { status: 403 } });
  } finally {
    api.defaults.adapter = oncekiAdapter;
  }
}

describe('E — 403 KOLTUK_ASILDI [FAZ 7 F1b]', () => {
  it('E0 KAPI — istek gercekten adapter e ulasti', async () => {
    await ucYuzUcAl('/quotes', 'KOLTUK_ASILDI');
    expect(adapterCagrilariUrl).toEqual(['/quotes']);
  });

  it('E1 — oturumu SILMEZ (401 dali degil)', async () => {
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    await ucYuzUcAl('/quotes', 'KOLTUK_ASILDI');
    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: SEANS_JETONU,
      user: SEANS_KULLANICI,
    });
  });

  it('E2 — /koltuk-durduruldu ya YONLENDIRIR', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);
    await ucYuzUcAl('/quotes', 'KOLTUK_ASILDI');
    expect(pencere.location.href).toBe('/koltuk-durduruldu');
  });

  it('E3 — ZATEN o sayfadayken yonlendirme YAPMAZ (sonsuz dongu yok)', async () => {
    (pencere as any).location.pathname = '/koltuk-durduruldu';
    pencere.location.href = 'http://localhost:3000/koltuk-durduruldu';
    await ucYuzUcAl('/auth/me', 'KOLTUK_ASILDI');
    expect(pencere.location.href).toBe('http://localhost:3000/koltuk-durduruldu');
  });

  it('E4 — BASKA bir 403 (ABONELIK_KISITLI) bu dala GIRMEZ', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);
    await ucYuzUcAl('/quotes/1/export', 'ABONELIK_KISITLI');
    expect(pencere.location.href).toBe(BASLANGIC_URL);
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    // FIXTURE KANITI: ABONELIK_KISITLI dali gercekten kostu (olay yayinlandi),
    // yani yukaridaki "yonlendirmedi" sonucu "hicbir dal kosmadi"dan gelmiyor.
    expect(yayinlananOlaylar).toContain('abonelik-kisitli');
  });
});

// ---------------------------------------------------------------------------
// F — KURUMSAL GIRIS UCLARI (/auth/sso/degis, /auth/sso/katil)  [FAZ 7 F3b]
//
// NEDEN AYRI BLOK: bu iki uc GUARDSIZDIR ve 401 "60 saniyelik kod tukendi ya
// da sekme sirri uymadi" demektir — OTURUM DUSMESI DEGIL. Listeden biri
// silinse A/C bloklari YINE YESIL kalir; bu blok o yarisi kilitler.
// C blogu deseninin (C0 olcut · C1 silmez · C2 yonlendirmez · C3 tam URL)
// birebir ikizidir.
// ---------------------------------------------------------------------------
for (const uc of ['/auth/sso/degis', '/auth/sso/katil']) {
  describe(`F — ${uc} den gelen 401 [FAZ 7 F3b]`, () => {
    it('F0 KAPI — istek gercekten o adrese gitti', async () => {
      await dortYuzBirAl(uc);
      expect(adapterCagrilariUrl).toEqual([uc]);
    });

    it('F1 — oturumu SILMEMELI', async () => {
      expect(depo.getItem('token')).toBe(SEANS_JETONU);
      await dortYuzBirAl(uc);
      expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
        token: SEANS_JETONU,
        user: SEANS_KULLANICI,
      });
    });

    it('F2 — YONLENDIRME YAPMAMALI (/sso/tamam kendi mesajini gostersin)', async () => {
      expect(pencere.location.href).toBe(BASLANGIC_URL);
      await dortYuzBirAl(uc);
      expect(pencere.location.href).toBe(BASLANGIC_URL);
    });

    it('F3 — TAM URL ile gelse de muaf', async () => {
      expect(pencere.location.href).toBe(BASLANGIC_URL);
      await dortYuzBirAl(`http://localhost:3001/api${uc}`);
      expect(pencere.location.href).toBe(BASLANGIC_URL);
    });
  });
}

describe('F4 — OTURUMLU kurumsal uclar listede DEGIL [FAZ 7 F3b]', () => {
  it('F4 — /auth/sso/niyet ten gelen 401 GERCEK oturum dusmesidir', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);
    await dortYuzBirAl('/auth/sso/niyet');
    // ⚠ NEGATIF KRITER: bu uc muaf OLMAMALI. Muaf olsaydi gercek bir oturum
    // dusmesi sessizlesir, kullanici "hicbir sey olmuyor" ekraninda kalirdi.
    expect(pencere.location.href).toBe('/login');
    expect(depo.getItem('token')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G — PAROLA DEGISTIRME ve HESAP KAPATMA  [GORUNUR KUSURLAR TURU t.16]
//
// KUSUR (21.09'a kadar): `/auth/change-password` ve `/auth/hesabimi-kapat`
// uclarinda MEVCUT PAROLA yanlis girilince sunucu **401** donuyordu
// (parola.servisi.ts:239 · hesap.servisi.ts:404). Ikisi de bu listede DEGIL
// — dogrusu da bu — ve yakalayici o 401'i "oturum bitti" sayip token'i
// silip `/login`e atiyordu. Kullanici parolasini yanlis yazdigi icin
// uygulamadan ATILIYOR, nedenini de goremiyordu.
//
// ⚠ YANLIS COZUM: bu iki ucu `KIMLIK_UCLARI`'na eklemek. Ikisi de KORUMALI
// uctur (JwtAuthGuard); oradan gelen 401 GERCEKTEN oturum dusmesidir.
// Muaf tutulsalardi suresi dolmus token sessizlesir, kullanici "hicbir sey
// olmuyor" ekraninda kalirdi — D4/F4 bloklarindaki ayni negatif kriter.
//
// DOGRU COZUM (Faz 7 deseni, ucuncu desen icat edilmedi): sunucu oturumlu
// ucta yanlis parolayi **400 + kod PAROLA_HATALI** ile doner. Backend kapisi
// `npm run test:parola-kapisi` (A blogu) bunu olcer — bu dosya yalniz
// "400 cikis yaptirmaz, 401 YAPTIRIR" ayrimini kilitler. Iki kapi birlikte
// zinciri tamamlar; biri tek basina "mekanizma var, baglanti yok"tur.
// ---------------------------------------------------------------------------
/** Verilen uctan `kod` tasiyan 400 dondur (sunucunun yeni yaniti). */
async function dortYuzAl(url: string, kod: string) {
  const oncekiAdapter = api.defaults.adapter;
  api.defaults.adapter = ((config: any) => {
    adapterCagrilariUrl.push(String(config.url));
    const hata: any = new Error('Request failed with status code 400');
    hata.isAxiosError = true;
    hata.config = config;
    hata.response = {
      status: 400,
      statusText: 'Bad Request',
      data: { kod, message: 'Parolanız hatalı.' },
      headers: {},
      config,
    };
    return Promise.reject(hata);
  }) as any;
  try {
    await expect(api.post(url, {})).rejects.toMatchObject({ response: { status: 400 } });
  } finally {
    api.defaults.adapter = oncekiAdapter;
  }
}

const PAROLALI_OTURUM_UCLARI = ['/auth/change-password', '/auth/hesabimi-kapat'];

describe.each(PAROLALI_OTURUM_UCLARI)('G — %s yanlis parola [t.16]', (uc) => {
  it('G0 KAPI — istek gercekten o adrese gitti (bos kosum degil)', async () => {
    await dortYuzAl(uc, 'PAROLA_HATALI');
    expect(adapterCagrilariUrl).toEqual([uc]);
  });

  it('G1 — 400 PAROLA_HATALI oturumu SILMEZ', async () => {
    // On kosul: silinecek bir oturum gercekten var.
    expect(depo.getItem('token')).toBe(SEANS_JETONU);
    expect(depo.getItem('user')).toBe(SEANS_KULLANICI);

    await dortYuzAl(uc, 'PAROLA_HATALI');

    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: SEANS_JETONU,
      user: SEANS_KULLANICI,
    });
  });

  it('G2 — 400 PAROLA_HATALI YONLENDIRME yapmaz (ekran kendi mesajini gosterir)', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await dortYuzAl(uc, 'PAROLA_HATALI');

    expect(pencere.location.href).toBe(BASLANGIC_URL);
  });

  it('G3 ⟨NEGATIF⟩ — AYNI uctan gelen 401 HALA cikis yaptirir (liste gevsetilmedi)', async () => {
    // ⚠ Bu assert, "duzeltelim" diye ucu KIMLIK_UCLARI'na ekleyen bir
    // degisikligi yakalar: o zaman gercek oturum dusmesi sessizlesirdi.
    expect(depo.getItem('token')).toBe(SEANS_JETONU);

    await dortYuzBirAl(uc);

    expect({ token: depo.getItem('token'), href: pencere.location.href }).toEqual({
      token: null,
      href: '/login',
    });
  });
});

// ---------------------------------------------------------------------------
// H — ZAMAN ASIMI  [GORUNUR KUSURLAR TURU, G6 olcumu]
//
// KUSUR: axios ornegi `timeout` TASIMIYORDU; axios varsayilani 0 = SONSUZ.
// Asilan istek hic dusmedigi icin `catch`/`finally` HIC kosmuyor, ekrandaki
// `animate-spin` sonsuza kadar donuyordu.
//
// ⚠ BU BLOK 401 BLOKLARININ IKINCI YUZUDUR: yakalayici "hangi hata cikis
// yaptirir" karari verirken AG HATASINI / ZAMAN ASIMINI gercek oturum
// bitisinden ayirmak zorunda. Zaman asimi hatasinin `response`u YOKTUR;
// H3 bunun bir varsayim degil OLCUM oldugunu gosterir.
// ---------------------------------------------------------------------------
describe('H — zaman asimi secimi (saf karar)', () => {
  it('H1 — siradan JSON istegi VARSAYILAN sureyi alir (sonsuz DEGIL)', () => {
    expect(zamanAsimiSec({ url: '/quotes' })).toBe(VARSAYILAN_ZAMAN_ASIMI_MS);
    // ⚠ Olcut: varsayilan gercekten SONLU. 0 olsaydi kusur duruyordu.
    expect(VARSAYILAN_ZAMAN_ASIMI_MS).toBeGreaterThan(0);
  });

  it('H2 — dosya yukleyen istek (multipart) AGIR sureyi alir', () => {
    expect(
      zamanAsimiSec({ url: '/excel-grid/prepare', headers: { 'Content-Type': 'multipart/form-data' } }),
    ).toBe(AGIR_ZAMAN_ASIMI_MS);
    // Yol listesinde OLMAYAN bir yukleme de agir sayilmali (liste bakimsiz
    // kalsa bile yeni yukleme ekrani 30 sn'de kesilmesin).
    expect(
      zamanAsimiSec({ url: '/firma/logo', headers: { 'Content-Type': 'multipart/form-data' } }),
    ).toBe(AGIR_ZAMAN_ASIMI_MS);
  });

  it('H2b — AI / cikti uclari govdesiz de olsa AGIR sureyi alir', () => {
    // `/ai/translate` bir LLM cagrisi (max_tokens 16000); `/export` Excel uretir.
    expect(zamanAsimiSec({ url: '/ai/translate' })).toBe(AGIR_ZAMAN_ASIMI_MS);
    expect(zamanAsimiSec({ url: '/quotes/42/export' })).toBe(AGIR_ZAMAN_ASIMI_MS);
    // ⚠ OLCUT: karar her seye "agir" demiyor.
    expect(zamanAsimiSec({ url: '/auth/me' })).toBe(VARSAYILAN_ZAMAN_ASIMI_MS);
  });

  it('H2c — CAGIRANIN kendi suresi korunur (DwgUploader 120000/15000)', () => {
    expect(zamanAsimiSec({ url: '/dwg/parse', timeout: 120_000 })).toBe(120_000);
    expect(zamanAsimiSec({ url: '/quotes', timeout: 15_000 })).toBe(15_000);
  });

  it('H2d — AGIR sure, sunucunun (Caddy 600s) tavanini ASMAZ', () => {
    // Istemci sunucudan UZUN beklerse hata "zaman asimi" degil "baglanti
    // koptu" olarak gorunur; siralama korunmali.
    expect(AGIR_ZAMAN_ASIMI_MS).toBeLessThan(600_000);
    expect(AGIR_ZAMAN_ASIMI_MS).toBeGreaterThan(VARSAYILAN_ZAMAN_ASIMI_MS);
  });

  it('H3 ⭐ istek GERCEKTEN timeout ile gonderiliyor (kablolama, karar degil)', async () => {
    // ⚠ "mekanizma var, baglanti yok" tuzagi: H1/H2 saf karari olcer ama
    // `zamanAsimiSec` request interceptor'a BAGLANMAMIS olsaydi hepsi YESIL
    // kalirdi. Burada giden istegin config'i okunur.
    const gorulenTimeout: Array<number | undefined> = [];
    const onceki = api.defaults.adapter;
    api.defaults.adapter = ((config: any) => {
      gorulenTimeout.push(config.timeout);
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    }) as any;
    try {
      await api.get('/quotes');
      await api.post('/excel-grid/prepare', new FormData(), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } finally {
      api.defaults.adapter = onceki;
    }
    expect(gorulenTimeout).toEqual([VARSAYILAN_ZAMAN_ASIMI_MS, AGIR_ZAMAN_ASIMI_MS]);
  });
});

describe('H4 — zaman asimi OTURUMU DUSURMEZ', () => {
  /** axios'un zaman asimi hatasi: `response` YOK, `code: ECONNABORTED`. */
  async function zamanAsimiAl(url: string) {
    const onceki = api.defaults.adapter;
    api.defaults.adapter = ((config: any) => {
      adapterCagrilariUrl.push(String(config.url));
      const hata: any = new Error(`timeout of ${config.timeout}ms exceeded`);
      hata.isAxiosError = true;
      hata.code = 'ECONNABORTED';
      hata.config = config;
      hata.response = undefined;
      return Promise.reject(hata);
    }) as any;
    try {
      await expect(api.get(url)).rejects.toMatchObject({ code: 'ECONNABORTED' });
    } finally {
      api.defaults.adapter = onceki;
    }
  }

  it('H4a KAPI — istek gercekten adapter e ulasti (bos kosum degil)', async () => {
    await zamanAsimiAl('/quotes');
    expect(adapterCagrilariUrl).toEqual(['/quotes']);
  });

  it('H4b ⭐ zaman asimi oturumu SILMEZ (401 dali `response`suz hatada kosmaz)', async () => {
    expect(depo.getItem('token')).toBe(SEANS_JETONU);

    await zamanAsimiAl('/quotes');

    expect({ token: depo.getItem('token'), user: depo.getItem('user') }).toEqual({
      token: SEANS_JETONU,
      user: SEANS_KULLANICI,
    });
  });

  it('H4c ⭐ zaman asimi /login e YONLENDIRMEZ (kullanici sayfasinda kalir)', async () => {
    expect(pencere.location.href).toBe(BASLANGIC_URL);

    await zamanAsimiAl('/quotes');

    expect(pencere.location.href).toBe(BASLANGIC_URL);
  });

  it('H4d — hata CAGIRANA ulasiyor (spinner`i kapatacak catch/finally kossun)', async () => {
    // ⚠ ASIL KUSUR BUYDU: istek hic dusmedigi icin `finally` HIC kosmuyordu.
    // Yakalayici hatayi yutmus olsaydi (`return` / sessiz resolve) spinner
    // yine sonsuz donerdi; bu assert reddin cagirana vardigini olcer.
    const onceki = api.defaults.adapter;
    api.defaults.adapter = ((config: any) => {
      const hata: any = new Error('timeout of 30000ms exceeded');
      hata.isAxiosError = true;
      hata.code = 'ECONNABORTED';
      hata.config = config;
      return Promise.reject(hata);
    }) as any;
    let finallyKostu = false;
    let yakalandi = false;
    try {
      try {
        await api.get('/quotes');
      } catch {
        yakalandi = true;
      } finally {
        finallyKostu = true;
      }
    } finally {
      api.defaults.adapter = onceki;
    }
    expect({ yakalandi, finallyKostu }).toEqual({ yakalandi: true, finallyKostu: true });
  });
});
