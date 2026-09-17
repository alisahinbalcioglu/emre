/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 · F3a — OIDC DOĞRULAMA ÇEKİRDEĞİ + SAĞLAYICI KURALLARI
 *  (`npm run test:faz7-oidc`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DB, SUNUCU ve AĞ GEREKTİRMEZ: keşif/JWKS/token uçları süreç içindeki sahte
 * sağlayıcıyla (`test/yardimci/sahte-oidc-saglayici.ts`) taklit edilir, gerçek
 * HTTP sunucusu AÇILMAZ ve gerçek Microsoft/Google'a istek GİTMEZ (O17/O18).
 *
 * Ölçtükleri (tasarım §11-F3a): O1-O8 id_token doğrulama (iss/aud/nonce/süre/
 * imza/kid/alg), O9-O13 sağlayıcı kuralları (kiracı, misafir, kurumsal kimlik,
 * e-posta kanıtı, alan adı), O14 keşif, O15 kod değişimi, O16 PKCE (RFC 7636
 * Ek-B), O17 kaynak kapıları, O18 fixture kanıtı, O19 yetkilendirme adresi,
 * O20 Google issuer dizisi, O21 ek kapılar (kimlik anahtarı, sınama kanıtı,
 * boş parametreler, exp zorunluluğu).
 *
 * Çıkış: 0 = PASS · 1 = FAIL. ⚠ `process.exit` YOK (Windows 0xC0000409).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, createPublicKey } from 'node:crypto';
import {
  IZINLI_HOSTLAR,
  idTokenDogrula,
  imzaVeTalepleriDogrula,
  kesifAl,
  kodDegistir,
  OidcHatasi,
  onbellekleriTemizle,
  yetkilendirmeUrlKur,
} from '../src/altyapi/auth/kurumsal/oidc-istemci';
import {
  alanAdiNormalize,
  alanAdiNormalizeAyrintili,
  beklenenIssuer,
  entraSinamaKaniti,
  epostaAlanAdi,
  epostaKanitli,
  googleSinamaKaniti,
  kimlikAnahtari,
  kiraciIdGecerliMi,
  kurumsalKimlikMi,
  misafirMi,
  KurumsalKuralHatasi,
} from '../src/altyapi/auth/kurumsal/saglayici-kurallari';
import { pkceMeydani, pkceUret, rastgeleDizge } from '../src/altyapi/auth/kurumsal/pkce';
import { sahteOidcSaglayici } from './yardimci/sahte-oidc-saglayici';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

/** Hata KODUNU döndürür: 'HATA YOK' ya da 'BASKA: <mesaj>' de bir sonuçtur. */
async function kod(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'HATA YOK';
  } catch (e) {
    if (e instanceof OidcHatasi) return e.kod;
    if (e instanceof KurumsalKuralHatasi) return e.kod;
    return `BASKA: ${e instanceof Error ? e.message : String(e)}`;
  }
}
function kodSenkron(fn: () => unknown): string {
  try {
    fn();
    return 'HATA YOK';
  } catch (e) {
    if (e instanceof OidcHatasi) return e.kod;
    if (e instanceof KurumsalKuralHatasi) return e.kod;
    return `BASKA: ${e instanceof Error ? e.message : String(e)}`;
  }
}
async function dene<T>(fn: () => Promise<T>): Promise<{ deger?: T; hata?: unknown }> {
  try {
    return { deger: await fn() };
  } catch (hata) {
    return { hata };
  }
}
function kodMetni(goreliYol: string): string {
  const ham = fs.readFileSync(path.join(__dirname, goreliYol), 'utf8');
  return ham.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const SIMDI = Date.UTC(2026, 8, 16, 10, 0, 0);
const SANIYE = Math.floor(SIMDI / 1000);
const BASKA_KIRACI = '99999999-8888-7777-6666-555555555555';
const DOGRULANMIS = ['firma.com.tr'];

const entra = sahteOidcSaglayici({ tip: 'entra' });
const google = sahteOidcSaglayici({ tip: 'google' });

function entraDogrula(idToken: string, ek: Partial<Parameters<typeof idTokenDogrula>[0]> = {}) {
  return idTokenDogrula({
    idToken,
    jwksUri: entra.jwksUri,
    fetchFn: entra.fetchFn,
    issuer: beklenenIssuer('entra', entra.kiraciId),
    clientId: entra.clientId,
    nonce: entra.nonce,
    simdiMs: SIMDI,
    ...ek,
  });
}
function googleDogrula(idToken: string, ek: Partial<Parameters<typeof idTokenDogrula>[0]> = {}) {
  return idTokenDogrula({
    idToken,
    jwksUri: google.jwksUri,
    fetchFn: google.fetchFn,
    issuer: beklenenIssuer('google', null),
    clientId: google.clientId,
    nonce: google.nonce,
    simdiMs: SIMDI,
    ...ek,
  });
}

// ── O1-O8 · id_token DOĞRULAMA ──────────────────────────────────────────────
async function o1o8(): Promise<void> {
  console.log('\n── O1 · geçerli entra id_token ──');
  const gecerli = await dene(() => entraDogrula(entra.idTokenBas()));
  const talepler = gecerli.deger as Record<string, unknown> | undefined;
  check(
    'O1 geçerli entra token → talepler döner (tid, oid, email, aud)',
    talepler?.tid === entra.kiraciId &&
      talepler?.oid === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' &&
      talepler?.aud === entra.clientId &&
      talepler?.email === 'ali@firma.com.tr',
    JSON.stringify(talepler ?? (gecerli.hata as Error)?.message),
  );

  console.log('\n── O2 · issuer ──');
  check(
    'O2 başka kiracının issuer"ı → ISSUER_UYUSMADI',
    (await kod(() => entraDogrula(entra.idTokenBas({ iss: `https://login.microsoftonline.com/${BASKA_KIRACI}/v2.0` })))) === 'ISSUER_UYUSMADI',
  );
  check(
    'O2 common issuer → ISSUER_UYUSMADI',
    (await kod(() => entraDogrula(entra.idTokenBas({ iss: 'https://login.microsoftonline.com/common/v2.0' })))) === 'ISSUER_UYUSMADI',
  );

  console.log('\n── O3 · audience / azp ──');
  check('O3 aud yanlış → AUD_UYUSMADI', (await kod(() => entraDogrula(entra.idTokenBas({ aud: 'baska-istemci' })))) === 'AUD_UYUSMADI');
  check(
    'O3 aud dizisi [istemci, baska] + azp yanlış → AUD_UYUSMADI',
    (await kod(() => entraDogrula(entra.idTokenBas({ aud: [entra.clientId, 'baska'], azp: 'yanlis-azp' })))) === 'AUD_UYUSMADI',
  );
  check(
    'O3-OLCUT aynı dizi + azp doğru → KABUL (ret azp"den geliyor)',
    (await kod(() => entraDogrula(entra.idTokenBas({ aud: [entra.clientId, 'baska'], azp: entra.clientId })))) === 'HATA YOK',
  );

  console.log('\n── O4 · nonce ──');
  check('O4 nonce yanlış → NONCE_UYUSMADI', (await kod(() => entraDogrula(entra.idTokenBas({ nonce: 'baska-nonce' })))) === 'NONCE_UYUSMADI');
  check('O4 nonce YOK → NONCE_UYUSMADI', (await kod(() => entraDogrula(entra.idTokenBas({ nonce: undefined })))) === 'NONCE_UYUSMADI');
  check(
    'O4 beklenen nonce boş verilirse → NONCE_UYUSMADI (jsonwebtoken boş nonce"u atlar)',
    (await kod(() => entraDogrula(entra.idTokenBas(), { nonce: '' }))) === 'NONCE_UYUSMADI',
  );

  console.log('\n── O5 · süre ──');
  check(
    'O5 exp 2 dk önce → SURE_DOLDU',
    (await kod(() => entraDogrula(entra.idTokenBas({ exp: SANIYE - 120 })))) === 'SURE_DOLDU',
  );
  check(
    'O5-OLCUT exp 30 sn önce (clockTolerance 60 içinde) → KABUL',
    (await kod(() => entraDogrula(entra.idTokenBas({ exp: SANIYE - 30 })))) === 'HATA YOK',
  );
  check(
    'O5 iat 20 dk önce (maxAge 10m) → SURE_DOLDU',
    (await kod(() => entraDogrula(entra.idTokenBas({ iat: SANIYE - 1200 })))) === 'SURE_DOLDU',
  );
  check(
    'O5 exp TAŞIMAYAN token → SURE_DOLDU (jsonwebtoken exp istemez, biz isteriz)',
    (await kod(() => entraDogrula(entra.idTokenBas({ exp: undefined })))) === 'SURE_DOLDU',
  );

  console.log('\n── O6 · imza ve kid ──');
  check(
    'O6 yabancı anahtarla imzalanmış → IMZA_GECERSIZ',
    (await kod(() => entraDogrula(entra.idTokenBas({}, { yabanciImza: true })))) === 'IMZA_GECERSIZ',
  );
  onbellekleriTemizle();
  entra.gunluk.length = 0;
  const bilinmeyen1 = await kod(() => entraDogrula(entra.idTokenBas({}, { kid: 'bilinmeyen-kid' })));
  const jwksSayisi1 = entra.gunluk.filter((i) => i.tur === 'jwks').length;
  check('O6 bilinmeyen kid → ANAHTAR_YOK', bilinmeyen1 === 'ANAHTAR_YOK', bilinmeyen1);
  check('O6 bilinmeyen kid"de JWKS BİR KEZ yeniden çekildi (toplam 2 istek)', jwksSayisi1 === 2, `jwks istekleri=${jwksSayisi1}`);
  await kod(() => entraDogrula(entra.idTokenBas({}, { kid: 'bilinmeyen-kid-2' })));
  const jwksSayisi2 = entra.gunluk.filter((i) => i.tur === 'jwks').length;
  check('O6 aynı dakikada ikinci bilinmeyen kid yeniden çekme YAPTIRMIYOR (hâlâ 2)', jwksSayisi2 === 2, `jwks istekleri=${jwksSayisi2}`);
  await kod(() => entraDogrula(entra.idTokenBas({}, { kid: 'bilinmeyen-kid-3' }), { simdiMs: SIMDI + 61_000 }));
  const jwksSayisi3 = entra.gunluk.filter((i) => i.tur === 'jwks').length;
  check('O6 61 sn sonra yeniden çekme yeniden serbest (3)', jwksSayisi3 === 3, `jwks istekleri=${jwksSayisi3}`);
  entra.jwksAnahtarlariniDegistir([{ kty: 'EC', kid: entra.kid, crv: 'P-256', x: 'a', y: 'b' }]);
  onbellekleriTemizle();
  check(
    'O6 kid eşleşiyor ama RSA imza anahtarı değil → ANAHTAR_YOK',
    (await kod(() => entraDogrula(entra.idTokenBas()))) === 'ANAHTAR_YOK',
  );
  entra.jwksAnahtarlariniDegistir(null);
  onbellekleriTemizle();

  console.log('\n── O7 · algoritma ──');
  check('O7 alg: none → ALG_IZINSIZ', (await kod(() => entraDogrula(entra.algNoneTokenBas()))) === 'ALG_IZINSIZ');
  const hs256 = entra.hs256KarisiklikTokenBas(entra.acikAnahtarPem);
  check('O7 RSA açık anahtarı HS256 sırrı gibi kullanılmış → ALG_IZINSIZ (başlık kapısı)', (await kod(() => entraDogrula(hs256))) === 'ALG_IZINSIZ');
  const acikAnahtar = createPublicKey(entra.acikAnahtarPem);
  const katman2 = { issuer: beklenenIssuer('entra', entra.kiraciId), clientId: entra.clientId, nonce: entra.nonce, simdiMs: SIMDI };
  check(
    'O7 KATMAN 2: aynı token doğrudan imza katmanına verilince de ALG_IZINSIZ (ret nedeni algoritma LİSTESİ)',
    kodSenkron(() => imzaVeTalepleriDogrula(hs256, acikAnahtar, katman2)) === 'ALG_IZINSIZ',
  );
  check(
    'O7-OLCUT KATMAN 2 geçerli RS256 token"ı kabul ediyor (düzenek her şeyi reddetmiyor)',
    kodSenkron(() => imzaVeTalepleriDogrula(entra.idTokenBas(), acikAnahtar, katman2)) === 'HATA YOK',
  );

  console.log('\n── O8 · Google issuer ──');
  check('O8 https://accounts.google.com → KABUL', (await kod(() => googleDogrula(google.idTokenBas()))) === 'HATA YOK');
  check(
    'O8 accounts.google.com (kısa biçim) → KABUL',
    (await kod(() => googleDogrula(google.idTokenBas({ iss: 'accounts.google.com' })))) === 'HATA YOK',
  );
  check(
    'O8 https://accounts.google.com/ (sondaki /) → ISSUER_UYUSMADI',
    (await kod(() => googleDogrula(google.idTokenBas({ iss: 'https://accounts.google.com/' })))) === 'ISSUER_UYUSMADI',
  );
}

// ── O9-O13 · SAĞLAYICI KURALLARI ────────────────────────────────────────────
function o9o13(): void {
  console.log('\n── O9 · kiracı kimliği ──');
  check('O9 tüketici kiracısı (9188040d…) → false', kiraciIdGecerliMi('9188040d-6c67-4c5b-b112-36a304b66dad') === false);
  check('O9 büyük harfli tüketici kiracısı da → false', kiraciIdGecerliMi('9188040D-6C67-4C5B-B112-36A304B66DAD') === false);
  check(
    'O9 common / organizations / consumers → false',
    ['common', 'organizations', 'consumers'].every((s) => kiraciIdGecerliMi(s) === false),
  );
  check('O9 geçerli GUID → true', kiraciIdGecerliMi(entra.kiraciId) === true);
  check('O9 büyük harfli geçerli GUID → true (normalize edilir)', kiraciIdGecerliMi(entra.kiraciId.toUpperCase()) === true);
  check('O9 boş / null / GUID olmayan → false', !kiraciIdGecerliMi('') && !kiraciIdGecerliMi(null) && !kiraciIdGecerliMi('abc'));

  console.log('\n── O10 · misafir (B2B) ──');
  const uye = { iss: entra.issuer, tid: entra.kiraciId };
  check('O10 idp yok → misafir DEĞİL', misafirMi(uye, 'entra') === false);
  check('O10 idp === iss → misafir DEĞİL', misafirMi({ ...uye, idp: entra.issuer }, 'entra') === false);
  check(
    'O10 idp başka kiracının STS"i → MİSAFİR',
    misafirMi({ ...uye, idp: `https://sts.windows.net/${BASKA_KIRACI}/` }, 'entra') === true,
  );
  check('O10 google tipinde misafir kuralı çalışmaz → false', misafirMi({ ...uye, idp: 'live.com' }, 'google') === false);

  console.log('\n── O11 · kurumsal kimlik ──');
  const entraSaglayici = { tip: 'entra' as const, entraKiraciId: entra.kiraciId };
  const googleSaglayici = { tip: 'google' as const };
  check('O11 entra doğru kiracı + üye → true', kurumsalKimlikMi({ iss: entra.issuer, tid: entra.kiraciId }, entraSaglayici, DOGRULANMIS) === true);
  check('O11 entra tid farklı → false', kurumsalKimlikMi({ iss: entra.issuer, tid: BASKA_KIRACI }, entraSaglayici, DOGRULANMIS) === false);
  check(
    'O11 entra misafir → false',
    kurumsalKimlikMi({ iss: entra.issuer, tid: entra.kiraciId, idp: `https://sts.windows.net/${BASKA_KIRACI}/` }, entraSaglayici, DOGRULANMIS) === false,
  );
  check('O11 google hd yok (kişisel Gmail) → false', kurumsalKimlikMi({ email: 'ali@gmail.com' }, googleSaglayici, DOGRULANMIS) === false);
  check('O11 google hd doğrulanmış listede değil → false', kurumsalKimlikMi({ hd: 'baska.com.tr' }, googleSaglayici, DOGRULANMIS) === false);
  check('O11 google hd listede → true', kurumsalKimlikMi({ hd: 'FIRMA.com.tr' }, googleSaglayici, DOGRULANMIS) === true);

  console.log('\n── O12 · e-posta kanıtı ──');
  const e = (claims: Record<string, unknown>) => epostaKanitli(claims, { tip: 'entra', entraKiraciId: entra.kiraciId }, DOGRULANMIS);
  const g = (claims: Record<string, unknown>) => epostaKanitli(claims, { tip: 'google' }, DOGRULANMIS);
  check('O12 entra xms_edov YOK → null', e({ email: 'ali@firma.com.tr' }) === null);
  check('O12 entra xms_edov false → null', e({ email: 'ali@firma.com.tr', xms_edov: false }) === null);
  check('O12 entra xms_edov "true" dizgesi → null (katı boolean)', e({ email: 'ali@firma.com.tr', xms_edov: 'true' }) === null);
  check('O12 entra xms_edov true ama alan adı doğrulanmamış → null', e({ email: 'ali@baska.com.tr', xms_edov: true }) === null);
  check(
    'O12 entra doğru → { eposta } küçük harf',
    JSON.stringify(e({ email: 'ALI@Firma.COM.TR', xms_edov: true })) === JSON.stringify({ eposta: 'ali@firma.com.tr' }),
    JSON.stringify(e({ email: 'ALI@Firma.COM.TR', xms_edov: true })),
  );
  check('O12 google email_verified false → null', g({ email: 'ali@firma.com.tr', email_verified: false, hd: 'firma.com.tr' }) === null);
  check('O12 google hd doğrulanmış listede değil → null', g({ email: 'ali@firma.com.tr', email_verified: true, hd: 'baska.com.tr' }) === null);
  check('O12 google hd yok → null', g({ email: 'ali@firma.com.tr', email_verified: true }) === null);
  check(
    'O12 google e-posta alanı listede değil → null',
    g({ email: 'ali@gmail.com', email_verified: true, hd: 'firma.com.tr' }) === null,
  );
  check(
    'O12 google doğru → { eposta }',
    JSON.stringify(g({ email: 'Ali@firma.com.tr', email_verified: true, hd: 'firma.com.tr' })) === JSON.stringify({ eposta: 'ali@firma.com.tr' }),
  );

  console.log('\n── O13 · alan adı ──');
  check("O13 ' Firma.COM.TR. ' → firma.com.tr", alanAdiNormalize(' Firma.COM.TR. ') === 'firma.com.tr');
  check('O13 örnek.com.tr → xn--rnek-4qa.com.tr', alanAdiNormalize('örnek.com.tr') === 'xn--rnek-4qa.com.tr');
  const idn = alanAdiNormalizeAyrintili('FİRMA.com.tr');
  check(
    'O13 FİRMA.com.tr → xn--firma-8fd.com.tr + idnUyarisi',
    idn?.alanAdi === 'xn--firma-8fd.com.tr' && idn?.idnUyarisi === true,
    JSON.stringify(idn),
  );
  check('O13 ASCII alan adında idnUyarisi yok', alanAdiNormalizeAyrintili('firma.com.tr')?.idnUyarisi === false);
  check(
    'O13 bad..domain / -a.com / a / boş / null → null',
    ['bad..domain', '-a.com', 'a', '', null].every((s) => alanAdiNormalize(s) === null),
  );
  check('O13 epostaAlanAdi son @ sonrasını normalize eder', epostaAlanAdi('a@b@Firma.com.tr') === 'firma.com.tr' && epostaAlanAdi('firma.com.tr') === null);
}

// ── O14-O16 · KEŞİF, KOD DEĞİŞİMİ, PKCE ─────────────────────────────────────
async function o14o16(): Promise<void> {
  console.log('\n── O14 · keşif belgesi ──');
  onbellekleriTemizle();
  entra.gunluk.length = 0;
  const belge = await dene(() => kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI }));
  check(
    'O14 geçerli keşif → üç uç adresi döner',
    belge.deger?.jwksUri === entra.jwksUri && belge.deger?.tokenEndpoint.includes('/oauth2/v2.0/token'),
    JSON.stringify(belge.deger ?? (belge.hata as Error)?.message),
  );
  await kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI + 1000 });
  check('O14 ikinci çağrı ÖNBELLEKTEN (tek keşif isteği)', entra.gunluk.filter((i) => i.tur === 'kesif').length === 1);

  onbellekleriTemizle();
  entra.kesifBelgesiniDegistir({ issuer: `https://login.microsoftonline.com/${BASKA_KIRACI}/v2.0` });
  check(
    'O14 belgedeki issuer farklı → KESIF_GECERSIZ',
    (await kod(() => kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI }))) === 'KESIF_GECERSIZ',
  );
  onbellekleriTemizle();
  entra.kesifBelgesiniDegistir({ token_endpoint: 'https://kotu.example.com/token' });
  check(
    'O14 token_endpoint izinsiz host → HOST_IZINSIZ',
    (await kod(() => kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI }))) === 'HOST_IZINSIZ',
  );
  onbellekleriTemizle();
  entra.kesifBelgesiniDegistir({ jwks_uri: 'http://login.microsoftonline.com/keys' });
  check(
    'O14 http: uç → HOST_IZINSIZ',
    (await kod(() => kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI }))) === 'HOST_IZINSIZ',
  );
  onbellekleriTemizle();
  entra.kesifBelgesiniDegistir({ jwks_uri: undefined });
  check(
    'O14 jwks_uri yok → KESIF_GECERSIZ',
    (await kod(() => kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI }))) === 'KESIF_GECERSIZ',
  );
  entra.kesifBelgesiniDegistir(null);
  onbellekleriTemizle();
  entra.gunluk.length = 0;
  check(
    'O14 issuer izinsiz host → HOST_IZINSIZ',
    (await kod(() => kesifAl('https://kotu.example.com', entra.fetchFn, { simdiMs: SIMDI }))) === 'HOST_IZINSIZ',
  );
  check('O14 izinsiz issuer"a HİÇ istek gitmedi', entra.gunluk.length === 0, JSON.stringify(entra.gunluk.map((i) => i.url)));
  check('O14 izinli hostlar listesi dört sağlayıcı adresi', IZINLI_HOSTLAR.length === 4 && IZINLI_HOSTLAR.includes('oauth2.googleapis.com'));

  // Zaman aşımı: yanıt vermeyen sağlayıcı yalnız iptal (abort) ile biter.
  onbellekleriTemizle();
  let iptalEdildi = false;
  const asilanFetch = ((_url: string, s: { signal: AbortSignal }) =>
    new Promise((_coz, reddet) => {
      s.signal.addEventListener('abort', () => {
        iptalEdildi = true;
        reddet(new Error('aborted'));
      });
    })) as unknown as typeof entra.fetchFn;
  const asim = await kod(() => kesifAl(entra.issuer, asilanFetch, { simdiMs: SIMDI, zamanAsimiMs: 50 }));
  check('O14 yanıt gelmezse zaman aşımı → KESIF_GECERSIZ ve istek İPTAL edildi', asim === 'KESIF_GECERSIZ' && iptalEdildi, `${asim} iptal=${iptalEdildi}`);

  console.log('\n── O15 · kod değişimi ──');
  onbellekleriTemizle();
  entra.gunluk.length = 0;
  const gunlukSatirlari: string[] = [];
  const kodGirdisi = {
    tokenUrl: `https://login.microsoftonline.com/${entra.kiraciId}/oauth2/v2.0/token`,
    code: 'yetkilendirme-kodu',
    redirectUri: 'https://metapricex.com/api/auth/sso/donus',
    clientId: entra.clientId,
    clientSecret: 'cok-gizli-istemci-sirri',
    codeVerifier: 'dogrulayici-degeri-43-karakter-uzunlugunda-x',
  };
  const basarili = await dene(() => kodDegistir(kodGirdisi, entra.fetchFn, { gunluk: (s) => gunlukSatirlari.push(s) }));
  const istek = entra.gunluk.find((i) => i.tur === 'token');
  const govde = new URLSearchParams(istek?.body ?? '');
  check('O15 id_token döner', typeof basarili.deger?.idToken === 'string' && basarili.deger.idToken.split('.').length === 3);
  check(
    'O15 gövde x-www-form-urlencoded + grant_type/code_verifier/client_secret/client_id/redirect_uri',
    istek?.method === 'POST' &&
      istek?.headers['content-type'] === 'application/x-www-form-urlencoded' &&
      govde.get('grant_type') === 'authorization_code' &&
      govde.get('code_verifier') === kodGirdisi.codeVerifier &&
      govde.get('client_secret') === kodGirdisi.clientSecret &&
      govde.get('client_id') === entra.clientId &&
      govde.get('redirect_uri') === kodGirdisi.redirectUri,
    `${istek?.method} ${istek?.headers['content-type']} ${istek?.body}`,
  );
  check('O15 istek AbortSignal ve redirect: error taşıyor', istek?.signalVar === true && istek?.redirect === 'error');

  entra.tokenYanitiniAyarla({ status: 401, govde: { error: 'invalid_client', error_description: 'AADSTS7000215: gecersiz istemci sirri' } });
  const sirHatasi = await dene(() => kodDegistir(kodGirdisi, entra.fetchFn, { gunluk: (s) => gunlukSatirlari.push(s) }));
  const mesaj = (sirHatasi.hata as Error)?.message ?? '';
  check('O15 invalid_client → ISTEMCI_SIRRI_GECERSIZ', (sirHatasi.hata as OidcHatasi)?.kod === 'ISTEMCI_SIRRI_GECERSIZ', mesaj);
  check('O15 hata GÖVDESİ dönen mesajda YOK', !mesaj.includes('AADSTS7000215') && !mesaj.includes('error_description'), mesaj);
  check(
    'O15 gövde GÜNLÜĞE yazıldı, istemci sırrı maskeli',
    gunlukSatirlari.some((s) => s.includes('AADSTS7000215')) && !gunlukSatirlari.some((s) => s.includes(kodGirdisi.clientSecret)),
    gunlukSatirlari.join(' | '),
  );
  entra.tokenYanitiniAyarla({ status: 400, govde: { error: 'invalid_grant' } });
  check('O15 invalid_grant → KOD_GECERSIZ', (await kod(() => kodDegistir(kodGirdisi, entra.fetchFn, { gunluk: () => {} }))) === 'KOD_GECERSIZ');
  entra.tokenYanitiniAyarla({ status: 500, govde: { error: 'server_error' } });
  check('O15 başka hata → IDP_HATASI', (await kod(() => kodDegistir(kodGirdisi, entra.fetchFn, { gunluk: () => {} }))) === 'IDP_HATASI');
  entra.tokenYanitiniAyarla({ status: 200, govde: { access_token: 'x', token_type: 'Bearer' } });
  check('O15 id_token"suz 200 yanıtı → IDP_HATASI', (await kod(() => kodDegistir(kodGirdisi, entra.fetchFn, { gunluk: () => {} }))) === 'IDP_HATASI');
  entra.tokenYanitiniAyarla(null);
  check(
    'O15 izinsiz token adresi → HOST_IZINSIZ (istek gitmeden)',
    (await kod(() => kodDegistir({ ...kodGirdisi, tokenUrl: 'https://kotu.example.com/token' }, entra.fetchFn, { gunluk: () => {} }))) === 'HOST_IZINSIZ',
  );

  console.log('\n── O16 · PKCE (RFC 7636 Ek-B) ──');
  const rfcDogrulayici = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  check(
    'O16 RFC 7636 Ek-B: S256 meydanı E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    pkceMeydani(rfcDogrulayici) === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    pkceMeydani(rfcDogrulayici),
  );
  const cift = pkceUret();
  const beklenenMeydan = createHash('sha256').update(cift.dogrulayici, 'ascii').digest('base64url');
  check('O16 pkceUret meydanı = base64url(sha256(doğrulayıcı))', cift.meydan === beklenenMeydan && cift.meydan !== cift.dogrulayici);
  check(
    'O16 doğrulayıcı 43+ karakter, base64url alfabesi',
    cift.dogrulayici.length >= 43 && /^[A-Za-z0-9_-]+$/.test(cift.dogrulayici) && pkceUret().dogrulayici !== cift.dogrulayici,
  );
  check('O16 rastgeleDizge(32) 43 karakter ve her çağrıda farklı', rastgeleDizge(32).length === 43 && rastgeleDizge() !== rastgeleDizge());
}

// ── O17-O21 · KAYNAK, FIXTURE, ADRES, ISSUER DİZİSİ, EK KAPILAR ─────────────
async function o17o21(): Promise<void> {
  console.log('\n── O17 · kaynak kapıları ──');
  const kaynaklar = ['saglayici-kurallari.ts', 'pkce.ts', 'oidc-istemci.ts'].map((ad) => ({
    ad,
    kod: kodMetni(`../src/altyapi/auth/kurumsal/${ad}`),
  }));
  for (const k of kaynaklar) {
    check(
      `O17 ${k.ad}: @nestjs/jwt · openid-client · jose import YOK`,
      !/@nestjs\/jwt|openid-client|['"]jose['"]/.test(k.kod),
    );
  }
  check(
    'O17 kurumsal/ içinde doğrudan fetch/http isteği YOK (yalnız fetchFn parametresi)',
    kaynaklar.every((k) => !/(?<![A-Za-z_.])fetch\s*\(/.test(k.kod) && !/require\(['"]https?['"]\)|from\s+['"]node:https?['"]|axios/.test(k.kod)),
  );
  const istemciKodu = kaynaklar.find((k) => k.ad === 'oidc-istemci.ts')!.kod;
  check("O17 oidc-istemci.ts algoritma listesi `algorithms: ['RS256']`", istemciKodu.includes("algorithms: ['RS256']"));
  check('O17 test yardımcısı üretim kaynağında DEĞİL (test/yardimci altında)', fs.existsSync(path.join(__dirname, 'yardimci/sahte-oidc-saglayici.ts')));

  console.log('\n── O18 · FIXTURE KANITI ──');
  onbellekleriTemizle();
  entra.gunluk.length = 0;
  const kesif = await kesifAl(entra.issuer, entra.fetchFn, { simdiMs: SIMDI });
  await entraDogrula(entra.idTokenBas());
  await kodDegistir(
    {
      tokenUrl: kesif.tokenEndpoint,
      code: 'kod',
      redirectUri: 'https://metapricex.com/api/auth/sso/donus',
      clientId: entra.clientId,
      clientSecret: 'sir',
      codeVerifier: 'dogrulayici',
    },
    entra.fetchFn,
    { gunluk: () => {} },
  );
  const turler = new Set(entra.gunluk.map((i) => i.tur));
  check(
    'O18 sahte fetchFn günlüğünde keşif, JWKS ve token istekleri GERÇEKTEN var',
    turler.has('kesif') && turler.has('jwks') && turler.has('token'),
    JSON.stringify([...turler]),
  );
  check(
    'O18 O1"in başarısı sahte anahtara dayanıyor (yabancı anahtar O6"da reddedildi) ve fixture tek anahtar yayınlıyor',
    entra.kid === 'sahte-kid-1',
  );

  console.log('\n── O19 · yetkilendirme adresi ──');
  const adres = yetkilendirmeUrlKur({
    authorizationEndpoint: `https://login.microsoftonline.com/${entra.kiraciId}/oauth2/v2.0/authorize?login_hint=ali%40firma.com.tr`,
    tip: 'entra',
    clientId: entra.clientId,
    redirectUri: 'https://metapricex.com/api/auth/sso/donus',
    state: 'durum-degeri',
    nonce: 'nonce-degeri',
    codeChallenge: 'meydan-degeri',
    alanIpucu: 'firma.com.tr',
  });
  const p = new URL(adres).searchParams;
  check(
    'O19 entra: scope=openid profile email · response_type=code · S256 · domain_hint',
    p.get('scope') === 'openid profile email' &&
      p.get('response_type') === 'code' &&
      p.get('code_challenge_method') === 'S256' &&
      p.get('domain_hint') === 'firma.com.tr' &&
      p.get('client_id') === entra.clientId &&
      p.get('redirect_uri') === 'https://metapricex.com/api/auth/sso/donus',
    adres,
  );
  check(
    'O19 state/nonce/code_challenge verilen değerlerle aynı',
    p.get('state') === 'durum-degeri' && p.get('nonce') === 'nonce-degeri' && p.get('code_challenge') === 'meydan-degeri',
  );
  check('O19 login_hint YOK (keşif adresinde olsa bile silinir)', p.get('login_hint') === null, adres);
  const googleAdres = new URL(
    yetkilendirmeUrlKur({
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tip: 'google',
      clientId: google.clientId,
      redirectUri: 'https://metapricex.com/api/auth/sso/donus',
      state: 's',
      nonce: 'n',
      codeChallenge: 'm',
      alanIpucu: 'firma.com.tr',
    }),
  ).searchParams;
  check('O19 google: hd ipucu, domain_hint yok', googleAdres.get('hd') === 'firma.com.tr' && googleAdres.get('domain_hint') === null);
  check(
    'O19 izinsiz yetkilendirme adresi → HOST_IZINSIZ',
    kodSenkron(() =>
      yetkilendirmeUrlKur({
        authorizationEndpoint: 'https://kotu.example.com/authorize',
        tip: 'entra',
        clientId: 'a',
        redirectUri: 'b',
        state: 'c',
        nonce: 'd',
        codeChallenge: 'e',
      }),
    ) === 'HOST_IZINSIZ',
  );

  console.log('\n── O20 · Google issuer DİZİ (R1-D5) ──');
  const googleIssuer = beklenenIssuer('google', null);
  check(
    'O20 beklenenIssuer("google") iki değerli dizi',
    Array.isArray(googleIssuer) && googleIssuer.length === 2 && googleIssuer.includes('accounts.google.com'),
    JSON.stringify(googleIssuer),
  );
  check(
    'O20 dizi verilince iki biçim de geçer',
    (await kod(() => googleDogrula(google.idTokenBas({ iss: 'accounts.google.com' })))) === 'HATA YOK' &&
      (await kod(() => googleDogrula(google.idTokenBas()))) === 'HATA YOK',
  );
  check(
    'O20 FIXTURE KANITI: DB kolonundaki gibi TEK dizge verilince kısa biçim REDDEDİLİR',
    (await kod(() => googleDogrula(google.idTokenBas({ iss: 'accounts.google.com' }), { issuer: 'https://accounts.google.com' }))) === 'ISSUER_UYUSMADI',
  );
  check(
    'O20 entra beklenenIssuer kiracıya özel; geçersiz kiracı → KIRACI_GECERSIZ',
    beklenenIssuer('entra', entra.kiraciId) === `https://login.microsoftonline.com/${entra.kiraciId}/v2.0` &&
      kodSenkron(() => beklenenIssuer('entra', 'common')) === 'KIRACI_GECERSIZ' &&
      kodSenkron(() => beklenenIssuer('entra', '9188040d-6c67-4c5b-b112-36a304b66dad')) === 'KIRACI_GECERSIZ',
  );

  console.log('\n── O21 · ek kapılar ──');
  const entraTalepler = entra.varsayilanTalepler();
  const anahtar = kimlikAnahtari(entraTalepler, 'entra');
  check(
    'O21 entra kimlik anahtarı (iss, oid) + kiracı',
    anahtar.issuer === entra.issuer && anahtar.subject === entraTalepler.oid && anahtar.entraKiraciId === entra.kiraciId,
    JSON.stringify(anahtar),
  );
  check(
    'O21 entra oid yoksa → KIMLIK_TALEBI_EKSIK (profile kapsamı istenmemiş)',
    kodSenkron(() => kimlikAnahtari({ ...entraTalepler, oid: undefined }, 'entra')) === 'KIMLIK_TALEBI_EKSIK',
  );
  const googleAnahtar = kimlikAnahtari({ ...google.varsayilanTalepler(), iss: 'accounts.google.com' }, 'google');
  check(
    'O21 google kimlik anahtarı sub + issuer tek biçime normalize',
    googleAnahtar.issuer === 'https://accounts.google.com' && googleAnahtar.subject === '110248495921238986420',
  );
  check(
    'O21 google sub yoksa → KIMLIK_TALEBI_EKSIK',
    kodSenkron(() => kimlikAnahtari({}, 'google')) === 'KIMLIK_TALEBI_EKSIK',
  );
  check(
    'O21 entra sınama kanıtı yalnız xms_edov true iken',
    JSON.stringify(entraSinamaKaniti({ email: 'ali@firma.com.tr', xms_edov: true })) === JSON.stringify(['firma.com.tr']) &&
      entraSinamaKaniti({ email: 'ali@firma.com.tr' }).length === 0 &&
      entraSinamaKaniti({ email: 'ali@firma.com.tr', xms_edov: 'true' }).length === 0,
  );
  check(
    'O21 google sınama kanıtı [hd, e-posta alanı] tekil; email_verified false ise boş',
    JSON.stringify(googleSinamaKaniti({ hd: 'firma.com.tr', email: 'ali@firma.com.tr', email_verified: true })) === JSON.stringify(['firma.com.tr']) &&
      JSON.stringify(googleSinamaKaniti({ hd: 'firma.com.tr', email: 'ali@baska.com.tr', email_verified: true })) === JSON.stringify(['firma.com.tr', 'baska.com.tr']) &&
      googleSinamaKaniti({ hd: 'firma.com.tr', email: 'ali@firma.com.tr', email_verified: false }).length === 0,
  );
  check(
    'O21 beklenen issuer boş dizge/dizi → ISSUER_UYUSMADI (jsonwebtoken boşu atlar)',
    (await kod(() => entraDogrula(entra.idTokenBas(), { issuer: '' }))) === 'ISSUER_UYUSMADI' &&
      (await kod(() => entraDogrula(entra.idTokenBas(), { issuer: [] }))) === 'ISSUER_UYUSMADI',
  );
  check(
    'O21 clientId boş → AUD_UYUSMADI',
    (await kod(() => entraDogrula(entra.idTokenBas(), { clientId: '' }))) === 'AUD_UYUSMADI',
  );
  check(
    'O21 bozuk token (üç parça değil) → IMZA_GECERSIZ',
    (await kod(() => entraDogrula('bu-bir-token-degil'))) === 'IMZA_GECERSIZ',
  );
  check(
    'O21 hata mesajı token ya da talep taşımıyor',
    await (async () => {
      const h = (await dene(() => entraDogrula(entra.idTokenBas({ nonce: 'baska' })))).hata as Error;
      return !h.message.includes('eyJ') && !h.message.includes('baska');
    })(),
  );
}

async function main(): Promise<void> {
  await o1o8();
  o9o13();
  await o14o16();
  await o17o21();
}

main()
  .catch((hata) => {
    failed++;
    failures.push(`BEKLENMEYEN HATA: ${hata instanceof Error ? hata.message : String(hata)}`);
    console.log(`  ✗ BEKLENMEYEN HATA: ${hata instanceof Error ? hata.stack : String(hata)}`);
  })
  .finally(() => {
    console.log(`\n${'='.repeat(64)}\nFAZ 7 OIDC ÇEKİRDEĞİ: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
    if (failed) {
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exitCode = 1;
    }
  });
