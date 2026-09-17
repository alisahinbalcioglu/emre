/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 · F2a — TOTP / KİMLİK ŞİFRELEME / MEYDAN OKUMA ÇEKİRDEĞİ
 *  (`npm run test:faz7-totp`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DB, SUNUCU ve AĞ GEREKTİRMEZ. `JWT_SECRET` ve `KIMLIK_SIFRELEME_KEY`
 * değerlerini test KENDİSİ kurar, sonunda geri yükler; gerçek `.env`e bağlı
 * değildir.
 *
 * Ölçtükleri (tasarım §11-F2a):
 *   T1  RFC 6238 Ek-B ve RFC 4226 Ek-D vektörleri — değerler RFC METNİNDEN
 *       kopyalandı (rfc-editor.org, 16.09.2026), hafızadan değil
 *   T2  base32: RFC 4648 §10 vektörleri + tohumun kodlanışı, harf/boşluk
 *   T3  pencere ±1 · T4 tekrar reddi (`sonAdim`) · T5 girdi · T6 kaynak
 *   T7  kurtarma kodları (Crockford, normalizasyon, bcrypt özeti)
 *   T8  AES-256-GCM tur dönüşü, AAD, IV, etiket, anahtar yok/bozuk, gecikmeli okuma
 *   T8b kısaltılmış etiket (4 ve 12 bayt) RED · T8c anahtar BİÇİMİ
 *   T9  meydan okuma: amaç, süre, aud/iss, katman 1 — hem `jsonwebtoken`
 *       hem GERÇEK `JwtStrategy` üzerinden (BAĞLANTI: `validate` hiç çağrılmaz)
 *   T10 `test:ortam` ve T11 `test:sir-dondur` KENDİ dosyalarındadır.
 *
 * Her blokta FIXTURE KANITI vardır: ret, fixture bozuk olduğu için değil,
 * ölçülen kapı yüzünden olmalı (aynı girdinin geçerli hâli kabul ediliyor).
 *
 * Çıkış: 0 = PASS · 1 = FAIL. ⚠ `process.exit` YOK — Windows'ta açık soket
 * varken 0xC0000409 ile çöker; `process.exitCode` kullanılır.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { decode, sign, verify } from 'jsonwebtoken';

// Meydan okuma anahtarı JWT_SECRET'ten türetilir; JwtStrategy kurucusu da
// okur. Import'lardan ÖNCE kurulur (strateji dosyası yüklenirken okumaz ama
// sıra bağımlılığı olmasın).
const ESKI_JWT = process.env.JWT_SECRET;
const ESKI_KIMLIK = process.env.KIMLIK_SIFRELEME_KEY;
const TEST_JWT_SECRET = 'faz7-totp-test-jwt-sirri-yalniz-test-icin-32+';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import {
  base32Coz,
  base32Kodla,
  hotp,
  otpauthUri,
  totpAdim,
  totpDogrula,
  totpSiriUret,
} from '../src/altyapi/auth/mfa/totp';
import {
  kurtarmaKodlariniOzetle,
  kurtarmaKodlariUret,
  kurtarmaKoduNormalize,
} from '../src/altyapi/auth/mfa/kurtarma-kodu';
import { anahtarDurumu, coz, sifrele } from '../src/altyapi/auth/kimlik-sifreleme';
import {
  meydanOkumaAnahtari,
  meydanOkumaDogrula,
  meydanOkumaImzala,
} from '../src/altyapi/auth/mfa/meydan-okuma';
import { JwtStrategy } from '../src/altyapi/auth/strategies/jwt.strategy';

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

/** Fırlatan çağrı da ölçülür: mutantın ürettiği istisna "kırmızı" sayılır. */
function dene<T>(fn: () => T): { deger?: T; hata?: unknown } {
  try {
    return { deger: fn() };
  } catch (hata) {
    return { hata };
  }
}

function hataMesaji(h: unknown): string {
  return h instanceof Error ? h.message : String(h);
}

/** Nest HttpException ise durum + gövdedeki `kod`. */
function nestHatasi(h: unknown): { durum?: number; kod?: string } {
  const e = h as { getStatus?: () => number; getResponse?: () => unknown };
  if (!e || typeof e.getStatus !== 'function') return {};
  const yanit = e.getResponse?.() as { kod?: string } | string | undefined;
  return { durum: e.getStatus(), kod: typeof yanit === 'object' && yanit ? yanit.kod : undefined };
}

/** Yorumları soyulmuş kaynak: kaynak kapıları yorumdaki kelimeyi saymasın. */
function kodMetni(goreliYol: string): string {
  const ham = fs.readFileSync(path.join(__dirname, goreliYol), 'utf8');
  return ham.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function kimlikAnahtariKur(deger: string | undefined): void {
  if (deger === undefined) delete process.env.KIMLIK_SIFRELEME_KEY;
  else process.env.KIMLIK_SIFRELEME_KEY = deger;
}

// RFC 6238 Ek-B / RFC 4226 Ek-D ortak tohumu: ASCII "12345678901234567890".
const RFC_SIR = Buffer.from('12345678901234567890', 'ascii');

// ── T1 · RFC VEKTÖRLERİ ─────────────────────────────────────────────────────
function t1(): void {
  console.log('\n── T1 · RFC 6238 Ek-B + RFC 4226 Ek-D ──');
  // [zaman (sn), T (hex, RFC tablosu), TOTP 8 hane] — yalnız SHA1 satırları.
  const ekB: Array<[number, string, string]> = [
    [59, '0000000000000001', '94287082'],
    [1111111109, '00000000023523EC', '07081804'],
    [1111111111, '00000000023523ED', '14050471'],
    [1234567890, '000000000273EF07', '89005924'],
    [2000000000, '0000000003F940AA', '69279037'],
    [20000000000, '0000000027BC86AA', '65353130'],
  ];
  for (const [sn, tHex, sekiz] of ekB) {
    const adim = totpAdim(sn * 1000);
    // FIXTURE KANITI: zaman adımı RFC tablosundaki T ile birebir.
    check(`T1-OLCUT T=${sn}: adım RFC tablosundaki 0x${tHex}`, adim === parseInt(tHex, 16), `adim=${adim}`);
    const r8 = dene(() => hotp(RFC_SIR, adim, 8));
    const r6 = dene(() => hotp(RFC_SIR, adim, 6));
    check(`T1 T=${sn}: 8 hane ${sekiz}`, r8.deger === sekiz, `bulunan=${r8.deger ?? hataMesaji(r8.hata)}`);
    check(`T1 T=${sn}: 6 hane = son 6 hane (${sekiz.slice(-6)})`, r6.deger === sekiz.slice(-6), `bulunan=${r6.deger ?? hataMesaji(r6.hata)}`);
  }
  // RFC 4226 Ek-D Tablo 2: sayaç 0-9, 6 hane (farklı dinamik kesme ofsetleri).
  const ekD = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  const bulunan = ekD.map((_, i) => dene(() => hotp(RFC_SIR, i, 6)).deger);
  check('T1 RFC 4226 Ek-D: sayaç 0-9 HOTP değerleri birebir', ekD.every((v, i) => bulunan[i] === v), `bulunan=${JSON.stringify(bulunan)}`);
  check('T1 sayaç bigint de kabul (1n → 287082)', dene(() => hotp(RFC_SIR, BigInt(1), 6)).deger === '287082');
  const sir = totpSiriUret();
  check('T1 totpSiriUret 20 bayt ve her çağrıda farklı', sir.length === 20 && !sir.equals(totpSiriUret()));
}

// ── T2 · BASE32 ─────────────────────────────────────────────────────────────
function t2(): void {
  console.log('\n── T2 · base32 (RFC 4648) ──');
  const tohum = dene(() => base32Kodla(RFC_SIR));
  check('T2 base32Kodla(tohum) = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', tohum.deger === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', `bulunan=${tohum.deger}`);
  // RFC 4648 §10 (dolgusuz biçim — ürün dolgu yazmaz).
  const ornekler: Array<[string, string]> = [
    ['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI'],
  ];
  check(
    'T2 RFC 4648 §10 vektörleri (kodlama, dolgusuz)',
    ornekler.every(([duz, b32]) => dene(() => base32Kodla(Buffer.from(duz, 'ascii'))).deger === b32),
  );
  check(
    'T2 RFC 4648 §10 vektörleri (çözüm, `=` dolgulu yazım da)',
    ornekler.every(([duz, b32]) => dene(() => base32Coz(b32 + '='.repeat((8 - (b32.length % 8)) % 8))).deger?.toString('ascii') === duz),
  );
  const kucukBosluklu = dene(() => base32Coz('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'));
  check('T2 çözüm küçük harf + boşluklu girdide aynı bayt', !!kucukBosluklu.deger && kucukBosluklu.deger.equals(RFC_SIR));
  check('T2 çözüm büyük harfte aynı bayt', !!dene(() => base32Coz('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).deger?.equals(RFC_SIR));
  check('T2 alfabe dışı karakter (1, 0, 8) sessizce atılmaz → hata', ['GEZ1', 'GEZ0', 'GE8Z'].every((s) => !!dene(() => base32Coz(s)).hata));
  const rastgele = randomBytes(20);
  check('T2 rastgele 20 bayt tur dönüşü', !!dene(() => base32Coz(base32Kodla(rastgele))).deger?.equals(rastgele));
}

// ── T3/T4/T5/T6 · DOĞRULAMA ─────────────────────────────────────────────────
function t3t6(): void {
  console.log('\n── T3 · pencere ±1 ──');
  const simdiMs = 1111111111 * 1000;
  const m = totpAdim(simdiMs); // RFC: 0x23523ED
  const kodu = (adim: number) => hotp(RFC_SIR, adim, 6);
  const kodlar = [m - 2, m - 1, m, m + 1, m + 2].map(kodu);
  // FIXTURE KANITI: beş kod birbirinden farklı → kabul/ret doğru adıma atfedilir;
  // merkez kod RFC'deki 14050471'in son 6 hanesi.
  check('T3-OLCUT beş adımın kodu birbirinden farklı ve merkez = 050471', new Set(kodlar).size === 5 && kodlar[2] === '050471', JSON.stringify(kodlar));
  const dogrula = (kod: string, sonAdim: number | null = null) => dene(() => totpDogrula({ sir: RFC_SIR, kod, simdiMs, sonAdim }));
  const eksi1 = dogrula(kodu(m - 1));
  const arti1 = dogrula(kodu(m + 1));
  const merkez = dogrula(kodu(m));
  check('T3 T-1 kodu KABUL (adım T-1)', eksi1.deger?.gecerli === true && eksi1.deger?.adim === m - 1, JSON.stringify(eksi1.deger ?? hataMesaji(eksi1.hata)));
  check('T3 T kodu KABUL (adım T)', merkez.deger?.gecerli === true && merkez.deger?.adim === m);
  check('T3 T+1 kodu KABUL (adım T+1)', arti1.deger?.gecerli === true && arti1.deger?.adim === m + 1);
  const eksi2 = dogrula(kodu(m - 2));
  const arti2 = dogrula(kodu(m + 2));
  check('T3 T-2 kodu RED', eksi2.deger?.gecerli === false && eksi2.deger?.adim === null, JSON.stringify(eksi2.deger));
  check('T3 T+2 kodu RED', arti2.deger?.gecerli === false && arti2.deger?.adim === null, JSON.stringify(arti2.deger));

  console.log('\n── T4 · tekrar reddi (sonAdim) ──');
  const esit = dogrula(kodu(m), m);
  const kucuk = dogrula(kodu(m), m + 1);
  const buyuk = dogrula(kodu(m), m - 1);
  const hic = dogrula(kodu(m), null);
  check('T4 bulunan adım == sonAdim → RED (aynı kod ikinci kez girmez)', esit.deger?.gecerli === false && esit.deger?.adim === null, JSON.stringify(esit.deger));
  check('T4 bulunan adım < sonAdim → RED', kucuk.deger?.gecerli === false);
  check('T4 bulunan adım > sonAdim → KABUL', buyuk.deger?.gecerli === true && buyuk.deger?.adim === m);
  check('T4 sonAdim null → KABUL', hic.deger?.gecerli === true && hic.deger?.adim === m);
  check('T4 önceki pencere kodu, o adım tüketilmişken → RED', dogrula(kodu(m - 1), m - 1).deger?.gecerli === false);

  console.log('\n── T5 · girdi ──');
  const rfc59 = (kod: string) => dene(() => totpDogrula({ sir: RFC_SIR, kod, simdiMs: 59 * 1000, sonAdim: null }));
  for (const bozuk of ['12345', '1234567', 'abcdef']) {
    const r = rfc59(bozuk);
    check(`T5 '${bozuk}' → RED (fırlatmadan)`, !r.hata && r.deger?.gecerli === false, r.hata ? hataMesaji(r.hata) : JSON.stringify(r.deger));
  }
  const normal = rfc59(' 287 082 ');
  check("T5 ' 287 082 ' boşlukları atılıp KABUL (T=59, adım 1)", normal.deger?.gecerli === true && normal.deger?.adim === 1, JSON.stringify(normal.deger ?? hataMesaji(normal.hata)));
  check('T5-OLCUT aynı kod boşluksuz da KABUL (6 haneli profil = RFC 94287082 son 6)', rfc59('287082').deger?.gecerli === true);
  check('T5 ASCII dışı rakam (Arapça-Hint ٢٨٧٠٨٢) → RED', rfc59('٢٨٧٠٨٢').deger?.gecerli === false);
  check('T5 metin olmayan kod → RED (fırlatmadan)', rfc59(undefined as unknown as string).deger?.gecerli === false);

  console.log('\n── T6 · kaynak ──');
  const totpKod = kodMetni('../src/altyapi/auth/mfa/totp.ts');
  check('T6 totp.ts karşılaştırmayı timingSafeEqual ile yapıyor (kodda çağrı var)', /timingSafeEqual\(\s*beklenen\s*,\s*girilen\s*\)/.test(totpKod));
  check("T6 timingSafeEqual 'node:crypto'dan import ediliyor", /import\s*\{[^}]*\btimingSafeEqual\b[^}]*\}\s*from\s*'node:crypto'/.test(totpKod));

  const uri = otpauthUri('ali.veli@firma.com.tr', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const u = new URL(uri);
  check(
    'T6 otpauthUri: otpauth://totp/MetaPriceX:<e-posta>, secret/issuer/SHA1/6/30',
    u.protocol === 'otpauth:' &&
      u.host === 'totp' &&
      decodeURIComponent(u.pathname) === '/MetaPriceX:ali.veli@firma.com.tr' &&
      u.searchParams.get('secret') === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' &&
      u.searchParams.get('issuer') === 'MetaPriceX' &&
      u.searchParams.get('algorithm') === 'SHA1' &&
      u.searchParams.get('digits') === '6' &&
      u.searchParams.get('period') === '30',
    uri,
  );
}

// ── T7 · KURTARMA KODLARI ───────────────────────────────────────────────────
async function t7(): Promise<void> {
  console.log('\n── T7 · kurtarma kodları ──');
  const kodlar = kurtarmaKodlariUret(10);
  const desen = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
  check('T7 10 kod üretildi', kodlar.length === 10);
  check('T7 hepsi Crockford deseninde (ABCDE-FGHJK)', kodlar.every((k) => desen.test(k)), JSON.stringify(kodlar));
  check('T7 kodlar tekil', new Set(kodlar).size === 10);
  check("T7 normalize('abcde-fghjk') = ABCDEFGHJK", kurtarmaKoduNormalize('abcde-fghjk') === 'ABCDEFGHJK');
  check("T7 O→0: normalize('O') = '0' ve normalize('ab0de-o') = AB0DE0", kurtarmaKoduNormalize('O') === '0' && kurtarmaKoduNormalize('ab0de-o') === 'AB0DE0');
  check("T7 I→1 ve L→1 (küçük harf de): normalize('IiLl') = 1111", kurtarmaKoduNormalize('IiLl') === '1111');
  check('T7 harf/rakam dışı atılıyor (boşluk, tire, nokta)', kurtarmaKoduNormalize(' ab.cd-e fg ') === 'ABCDEFG');

  const ozetler = await kurtarmaKodlariniOzetle(kodlar);
  check('T7 10 özet, bcrypt maliyeti 10', ozetler.length === 10 && ozetler.every((o) => bcrypt.getRounds(o) === 10));
  check('T7 özet düz kodu İÇERMİYOR', ozetler.every((o, i) => !o.includes(kurtarmaKoduNormalize(kodlar[i]))));
  const dogru = await bcrypt.compare(kurtarmaKoduNormalize(kodlar[0]), ozetler[0]);
  const baska = await bcrypt.compare(kurtarmaKoduNormalize(kodlar[1]), ozetler[0]);
  check('T7 bcrypt.compare(normalize(kod), özet) → true', dogru === true);
  check('T7 başka kod aynı özete → false', baska === false);
  // Kullanıcı kâğıttan küçük harfle, tiresiz ve 0 yerine O yazarak girer.
  const elYazisi = kodlar[0].toLowerCase().replace(/-/g, '').replace(/0/g, 'o');
  check('T7 el yazısı varyantı (küçük, tiresiz, 0→o) aynı özete true', await bcrypt.compare(kurtarmaKoduNormalize(elYazisi), ozetler[0]));
}

// ── T8 · ŞİFRELEME ──────────────────────────────────────────────────────────
function t8(): void {
  console.log('\n── T8 · kimlik şifreleme (AES-256-GCM) ──');
  const anahtar = randomBytes(32).toString('base64');
  kimlikAnahtariKur(anahtar);
  check('T8-OLCUT test anahtarı openssl rand -base64 32 biçiminde (43 simge + =)', /^[A-Za-z0-9+/]{43}=$/.test(anahtar) && anahtarDurumu() === 'var');

  const duz = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const s = dene(() => sifrele(duz, 'mfa:kullanici-1'));
  const sifreli = s.deger ?? '';
  const parca = sifreli.split('.');
  check('T8 biçim v1.<iv>.<etiket>.<şifreli>', parca.length === 4 && parca[0] === 'v1' && sifreli.startsWith('v1.'), sifreli || hataMesaji(s.hata));
  check('T8 IV 12 bayt, etiket 16 bayt', parca.length === 4 && Buffer.from(parca[1], 'base64url').length === 12 && Buffer.from(parca[2], 'base64url').length === 16);
  check('T8 şifreli değer düz metni İÇERMİYOR', !!sifreli && !sifreli.includes(duz));
  const tur = dene(() => coz(sifreli, 'mfa:kullanici-1'));
  check('T8 tur dönüşü (aynı AAD)', tur.deger === duz, hataMesaji(tur.hata));
  const farkliAad = dene(() => coz(sifreli, 'mfa:kullanici-2'));
  check('T8 farklı AAD → HATA (şifreli değer başka satıra kopyalanamaz)', !!farkliAad.hata && farkliAad.deger === undefined, `deger=${farkliAad.deger}`);
  const s2 = dene(() => sifrele(duz, 'mfa:kullanici-1')).deger ?? '';
  check('T8 aynı düz metin iki şifrelemede FARKLI (IV her çağrıda yeni)', !!s2 && s2 !== sifreli && s2.split('.')[1] !== parca[1]);
  check('T8 ikinci şifreleme de çözülüyor', dene(() => coz(s2, 'mfa:kullanici-1')).deger === duz);

  const bozEtiket = (() => {
    const e = Buffer.from(parca[2] ?? '', 'base64url');
    if (e.length) e[0] ^= 0x01;
    return [parca[0], parca[1], e.toString('base64url'), parca[3]].join('.');
  })();
  check('T8 etiketin bir baytı bozulunca HATA', !!dene(() => coz(bozEtiket, 'mfa:kullanici-1')).hata);
  const bozGovde = (() => {
    const g = Buffer.from(parca[3] ?? '', 'base64url');
    if (g.length) g[g.length - 1] ^= 0x80;
    return [parca[0], parca[1], parca[2], g.toString('base64url')].join('.');
  })();
  check('T8 şifreli gövdenin bir baytı bozulunca HATA', !!dene(() => coz(bozGovde, 'mfa:kullanici-1')).hata);
  check("T8 sürüm öneki 'v2.' → HATA", !!dene(() => coz(sifreli.replace(/^v1\./, 'v2.'), 'mfa:kullanici-1')).hata);
  kimlikAnahtariKur(randomBytes(32).toString('base64'));
  check('T8 başka (geçerli) anahtarla çözüm → HATA', !!dene(() => coz(sifreli, 'mfa:kullanici-1')).hata);

  // Anahtar YOK / 16 bayt → 503 KIMLIK_SIFRELEME_YOK (iki fonksiyon da).
  kimlikAnahtariKur(undefined);
  const yok1 = nestHatasi(dene(() => sifrele(duz, 'mfa:kullanici-1')).hata);
  const yok2 = nestHatasi(dene(() => coz(sifreli, 'mfa:kullanici-1')).hata);
  check('T8 anahtar yok → sifrele 503 KIMLIK_SIFRELEME_YOK', yok1.durum === 503 && yok1.kod === 'KIMLIK_SIFRELEME_YOK', JSON.stringify(yok1));
  check('T8 anahtar yok → coz 503 KIMLIK_SIFRELEME_YOK', yok2.durum === 503 && yok2.kod === 'KIMLIK_SIFRELEME_YOK', JSON.stringify(yok2));
  kimlikAnahtariKur(randomBytes(16).toString('base64'));
  const kisa = nestHatasi(dene(() => sifrele(duz, 'mfa:kullanici-1')).hata);
  check('T8 16 baytlık anahtar → bozuk + 503 KIMLIK_SIFRELEME_YOK', anahtarDurumu() === 'bozuk' && kisa.durum === 503 && kisa.kod === 'KIMLIK_SIFRELEME_YOK', JSON.stringify(kisa));

  // Modül yüklenirken anahtar OKUNMAZ: anahtarsız require fırlatmaz, sonra
  // kurulan anahtar yeniden yüklemeden kullanılır.
  kimlikAnahtariKur(undefined);
  const modulYolu = require.resolve('../src/altyapi/auth/kimlik-sifreleme');
  delete require.cache[modulYolu];
  const yuklenen = dene(() => require(modulYolu) as typeof import('../src/altyapi/auth/kimlik-sifreleme'));
  check('T8 anahtar YOKKEN modülü require etmek fırlatmıyor', !yuklenen.hata && typeof yuklenen.deger?.sifrele === 'function', hataMesaji(yuklenen.hata));
  kimlikAnahtariKur(anahtar);
  const gec = dene(() => yuklenen.deger!.coz(sifreli, 'mfa:kullanici-1'));
  check('T8 anahtar sonradan kurulunca aynı modül örneği çözüyor (çağrı anında okuma)', gec.deger === duz, hataMesaji(gec.hata));
  check('T8 boş AAD reddediliyor', !!dene(() => sifrele(duz, '')).hata);

  console.log('\n── T8b · kısaltılmış etiket (R1-D3) ──');
  kimlikAnahtariKur(anahtar);
  const etiket = Buffer.from(parca[2] ?? '', 'base64url');
  const kes = (n: number) => [parca[0], parca[1], etiket.subarray(0, n).toString('base64url'), parca[3]].join('.');
  // FIXTURE KANITI: aynı değer kesilmeden çözülüyor → aşağıdaki RED yalnız
  // etiket uzunluğundan.
  check('T8b-OLCUT kesilmemiş değer çözülüyor', dene(() => coz(sifreli, 'mfa:kullanici-1')).deger === duz);
  const k4 = dene(() => coz(kes(4), 'mfa:kullanici-1'));
  const k12 = dene(() => coz(kes(12), 'mfa:kullanici-1'));
  check('T8b etiket 4 bayta kesilince HATA', !!k4.hata && k4.deger === undefined, `deger=${k4.deger}`);
  check('T8b etiket 12 bayta kesilince HATA', !!k12.hata && k12.deger === undefined, `deger=${k12.deger}`);

  console.log('\n── T8c · anahtar biçimi (R1-O6c) ──');
  kimlikAnahtariKur(anahtar);
  check("T8c 43 simge + '=' geçerli değer → var", anahtarDurumu() === 'var');
  const yildizli = `${anahtar.slice(0, 10)}*${anahtar.slice(10)}`;
  // FIXTURE KANITI: Node bu değeri yine 32 bayta çözüyor — yalnız uzunluğa
  // bakan bir kontrol bunu GEÇERLİ sayardı.
  check('T8c-OLCUT yıldızlı değer Buffer.from(base64) ile yine 32 bayt', Buffer.from(yildizli, 'base64').length === 32);
  kimlikAnahtariKur(yildizli);
  check("T8c içine '*' eklenmiş değer → bozuk", anahtarDurumu() === 'bozuk');
  kimlikAnahtariKur('');
  check('T8c boş → yok', anahtarDurumu() === 'yok');
  kimlikAnahtariKur('   ');
  check('T8c yalnız boşluk → yok', anahtarDurumu() === 'yok');
  kimlikAnahtariKur(undefined);
  check('T8c tanımsız → yok', anahtarDurumu() === 'yok');
  kimlikAnahtariKur(randomBytes(33).toString('base64'));
  check("T8c 33 bayt (44 simge, '=' yok) → bozuk", anahtarDurumu() === 'bozuk');
}

// ── T9 · MEYDAN OKUMA ───────────────────────────────────────────────────────

/** GERÇEK JwtStrategy: passport akışı (`authenticate`) sahte Prisma ile. */
async function stratejiyleDene(token: string): Promise<{ sonuc: string; prismaCagrisi: number }> {
  const cagrilar: unknown[] = [];
  const sahtePrisma = {
    user: {
      findUnique: async (arg: { where: { id: string } }) => {
        cagrilar.push(arg);
        return {
          id: arg.where.id, email: 'uye@firma.test', role: 'user', status: 'active',
          deletedAt: null, passwordChangedAt: null, firmaId: 'firma-1',
        };
      },
    },
  };
  const strateji = new JwtStrategy(sahtePrisma as never) as unknown as {
    fail: (...a: unknown[]) => void;
    success: (...a: unknown[]) => void;
    error: (...a: unknown[]) => void;
    authenticate: (req: unknown, opts: unknown) => void;
  };
  return new Promise((sonlandir) => {
    let bitti = false;
    const bitir = (sonuc: string) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      sonlandir({ sonuc, prismaCagrisi: cagrilar.length });
    };
    const zamanlayici = setTimeout(() => bitir('zaman-asimi'), 3000);
    strateji.fail = () => bitir('fail');
    strateji.success = () => bitir('success');
    strateji.error = () => bitir('error');
    strateji.authenticate({ headers: { authorization: `Bearer ${token}` } }, {});
  });
}

async function t9(): Promise<void> {
  console.log('\n── T9 · meydan okuma token\'ı ──');
  const t = meydanOkumaImzala({ userId: 'kullanici-1', amac: 'mfa-dogrula', yol: 'parola' });
  const cozulmus = decode(t, { complete: true }) as { header: { alg: string }; payload: Record<string, unknown> } | null;
  check(
    'T9-OLCUT token HS256; aud metaprice:mfa, iss metaprice-api, jti, ömür 300 sn',
    cozulmus?.header.alg === 'HS256' &&
      cozulmus?.payload.aud === 'metaprice:mfa' &&
      cozulmus?.payload.iss === 'metaprice-api' &&
      typeof cozulmus?.payload.jti === 'string' &&
      (cozulmus?.payload.exp as number) - (cozulmus?.payload.iat as number) === 300,
    JSON.stringify(cozulmus?.payload),
  );
  const tur = dene(() => meydanOkumaDogrula(t, 'mfa-dogrula'));
  check(
    'T9 tur dönüşü: { userId, yol, iat }',
    tur.deger?.userId === 'kullanici-1' && tur.deger?.yol === 'parola' && typeof tur.deger?.iat === 'number',
    JSON.stringify(tur.deger ?? hataMesaji(tur.hata)),
  );
  const yanlisAmac = nestHatasi(dene(() => meydanOkumaDogrula(t, 'mfa-kurulum')).hata);
  check('T9 amaç farklı → 401 MEYDAN_OKUMA_GECERSIZ', yanlisAmac.durum === 401 && yanlisAmac.kod === 'MEYDAN_OKUMA_GECERSIZ', JSON.stringify(yanlisAmac));
  const kurulum = meydanOkumaImzala({ userId: 'kullanici-1', amac: 'mfa-kurulum', yol: 'kurumsal' });
  check('T9 kurulum amaçlı token kendi amacıyla geçiyor, doğrulama amacıyla geçmiyor',
    dene(() => meydanOkumaDogrula(kurulum, 'mfa-kurulum')).deger?.yol === 'kurumsal' &&
      !!dene(() => meydanOkumaDogrula(kurulum, 'mfa-dogrula')).hata);

  // Elle basım: AYNI türetilmiş anahtar, alan alan değiştirilmiş.
  const simdi = Math.floor(Date.now() / 1000);
  const elle = (yuk: Record<string, unknown>, sec: { audience?: string; issuer?: string } = {}) =>
    sign(
      { sub: 'kullanici-1', amac: 'mfa-dogrula', yol: 'parola', ...yuk },
      meydanOkumaAnahtari(),
      { algorithm: 'HS256', audience: sec.audience ?? 'metaprice:mfa', issuer: sec.issuer ?? 'metaprice-api' },
    );
  // FIXTURE KANITI: elle basım doğru alanlarla KABUL → aşağıdaki retler alana ait.
  check('T9-OLCUT elle basılmış doğru token KABUL', !dene(() => meydanOkumaDogrula(elle({ iat: simdi, exp: simdi + 300 }), 'mfa-dogrula')).hata);
  check('T9-OLCUT süresi 2 sn önce dolmuş token clockTolerance (5 sn) içinde KABUL',
    !dene(() => meydanOkumaDogrula(elle({ iat: simdi - 300, exp: simdi - 2 }), 'mfa-dogrula')).hata);
  const dolmus = nestHatasi(dene(() => meydanOkumaDogrula(elle({ iat: simdi - 400, exp: simdi - 30 }), 'mfa-dogrula')).hata);
  check('T9 clockTolerance ötesinde (30 sn önce) süresi dolmuş → 401', dolmus.durum === 401 && dolmus.kod === 'MEYDAN_OKUMA_GECERSIZ');
  check('T9 aud değiştirilmiş (aynı anahtar) → RED',
    !!dene(() => meydanOkumaDogrula(elle({ iat: simdi, exp: simdi + 300 }, { audience: 'metaprice:baska' }), 'mfa-dogrula')).hata);
  check('T9 iss değiştirilmiş (aynı anahtar) → RED',
    !!dene(() => meydanOkumaDogrula(elle({ iat: simdi, exp: simdi + 300 }, { issuer: 'baska-api' }), 'mfa-dogrula')).hata);
  check('T9 exp TAŞIMAYAN token → RED (jsonwebtoken exp istemez, biz isteriz)',
    !!dene(() => meydanOkumaDogrula(elle({ iat: simdi }), 'mfa-dogrula')).hata);
  check("T9 bilinmeyen yol ('sms') → RED", !!dene(() => meydanOkumaDogrula(elle({ iat: simdi, exp: simdi + 300, yol: 'sms' }), 'mfa-dogrula')).hata);
  const ana = sign({ sub: 'kullanici-1', amac: 'mfa-dogrula', yol: 'parola' }, TEST_JWT_SECRET, {
    algorithm: 'HS256', expiresIn: 300, audience: 'metaprice:mfa', issuer: 'metaprice-api',
  });
  check('T9 ANA anahtarla (JWT_SECRET) basılmış meydan okuma → RED', !!dene(() => meydanOkumaDogrula(ana, 'mfa-dogrula')).hata);

  // Katman 1 — jsonwebtoken ile: JWT_SECRET meydan okumanın imzasını tutmaz.
  const katman1 = dene(() => verify(t, process.env.JWT_SECRET as string));
  check('T9 katman 1: jsonwebtoken.verify(token, JWT_SECRET) → HATA (invalid signature)',
    !!katman1.hata && hataMesaji(katman1.hata) === 'invalid signature', `deger=${JSON.stringify(katman1.deger)} hata=${hataMesaji(katman1.hata)}`);
  check('T9-OLCUT aynı token türetilmiş anahtarla verify EDİLİYOR (hata anahtardan)', !dene(() => verify(t, meydanOkumaAnahtari())).hata);

  // Katman 1 — BAĞLANTI: gerçek JwtStrategy meydan okumayı OTURUM SAYMIYOR ve
  // validate'e (DB okuması) hiç ulaşmıyor.
  const strMeydan = await stratejiyleDene(t);
  check('T9 BAĞLANTI: JwtStrategy meydan okumayı reddediyor (fail) ve validate çağrılmıyor (Prisma 0)',
    strMeydan.sonuc === 'fail' && strMeydan.prismaCagrisi === 0, JSON.stringify(strMeydan));
  const erisim = sign({ sub: 'kullanici-1', email: 'uye@firma.test', role: 'user' }, TEST_JWT_SECRET, { expiresIn: '7d' });
  const strErisim = await stratejiyleDene(erisim);
  // FIXTURE KANITI: aynı düzenek gerçek bir erişim token'ını KABUL ediyor —
  // yukarıdaki "fail" düzeneğin her şeyi reddetmesinden gelmiyor.
  check('T9-OLCUT aynı düzenek normal erişim token\'ını kabul ediyor (success, Prisma 1)',
    strErisim.sonuc === 'success' && strErisim.prismaCagrisi === 1, JSON.stringify(strErisim));

  const kaynak = kodMetni('../src/altyapi/auth/mfa/meydan-okuma.ts');
  check('T9 kaynak: meydan-okuma.ts @nestjs/jwt import ETMİYOR', !/@nestjs\/jwt/.test(kaynak));
  check("T9 kaynak: imza/doğrulama doğrudan 'jsonwebtoken' paketinden", /from\s+'jsonwebtoken'/.test(kaynak));
}

async function main(): Promise<void> {
  t1();
  t2();
  t3t6();
  await t7();
  t8();
  await t9();
}

main()
  .catch((hata) => {
    failed++;
    failures.push(`BEKLENMEYEN HATA: ${hataMesaji(hata)}`);
    console.log(`  ✗ BEKLENMEYEN HATA: ${hata instanceof Error ? hata.stack : String(hata)}`);
  })
  .finally(() => {
    if (ESKI_JWT === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ESKI_JWT;
    kimlikAnahtariKur(ESKI_KIMLIK);
    console.log(`\n${'='.repeat(64)}\nFAZ 7 TOTP ÇEKİRDEĞİ: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
    if (failed) {
      failures.forEach((f) => console.log(`  · ${f}`));
      process.exitCode = 1;
    }
  });
