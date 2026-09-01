/**
 * IYZICO YETKI BASLIGI TURU  (`npm run test:iyzico-basligi`)
 *
 * AG GEREKTIRMEZ: global `fetch` gecici olarak degistirilir, giden istegin
 * BASLIKLARI yakalanip incelenir. Hicbir gercek cagri yapilmaz.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * 01.09'da canli sandbox'ta ILK GERCEK iyzico cagrisi denendi ve HER istek
 *     "Authentication token is not verified"
 * ile reddedildi. Anahtarlar paneldekiyle birebir ayniydi, imza formulu
 * (HMACSHA256 / IYZWSv2) dogruydu, taban URL dogruydu.
 *
 * KUSUR: rastgele deger IKI KEZ uretiliyordu.
 *     Authorization: yetkiBasligi(...)          → icinde rastgele A uretip A ile IMZALIYOR
 *     'x-iyzi-rnd': randomBytes(8).toString()   → baslIga rastgele B koyuyor
 * iyzico imzayi `randomKey` ile dogrular; A ile imzalanip B gonderilince
 * dogrulama TANIM GEREGI tutmaz. Iki satir arasi bir baginti kopuklugu,
 * butun entegrasyonu calismaz halde tutuyordu.
 *
 * Bu tur kusur gozle YAKALANMASI ZOR: iki satir da tek basina dogru
 * gorunuyor, `randomBytes(8).toString('hex')` iki yerde de "makul" duruyor.
 * Ancak GIDEN ISTEK incelenince ortaya cikiyor — bu paket onu yapiyor.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   I1 ⭐ `x-iyzi-rnd` basligi, Authorization icindeki `randomKey` ile AYNI
 *   I2 imza gercekten o randomKey + yol + govde uzerinden HMAC'lenmis
 *      (yani baglanti tesadufi degil, formul de dogru)
 *   I3 Authorization bicimi: "IYZWSv2 <base64>"
 *   I4 ardisik iki istek FARKLI rastgele kullanir (sabitlenmis degil)
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { IyzicoClient } from '../src/ozellik/odeme/iyzico/iyzico.client';

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

const API_ANAHTARI = 'sandbox-TEST-API';
const SIR = 'sandbox-TEST-SECRET';

/** Giden istegin basliklarini ve govdesini yakalar. */
interface Yakalanan {
  url: string;
  basliklar: Record<string, string>;
  govde?: string;
}

async function istekYakala(
  calistir: (c: IyzicoClient) => Promise<unknown>,
): Promise<Yakalanan> {
  const eskiFetch = globalThis.fetch;
  let yakalanan: Yakalanan | null = null;

  globalThis.fetch = (async (url: any, opts: any) => {
    yakalanan = {
      url: String(url),
      basliklar: opts?.headers ?? {},
      govde: opts?.body,
    };
    // iyzico'nun basarili yanit sekli
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: {} }),
    } as any;
  }) as any;

  try {
    const config = new ConfigService({
      IYZICO_API_KEY: API_ANAHTARI,
      IYZICO_SECRET_KEY: SIR,
      IYZICO_MERCHANT_ID: '1234',
      IYZICO_TABAN_URL: 'https://sandbox-api.iyzipay.com',
    });
    await calistir(new IyzicoClient(config)).catch(() => undefined);
  } finally {
    globalThis.fetch = eskiFetch;
  }

  if (!yakalanan) throw new Error('istek yakalanamadi');
  return yakalanan;
}

/** "IYZWSv2 <base64>" basligini cozup alanlarina ayirir. */
function yetkiCoz(baslik: string) {
  const onek = 'IYZWSv2 ';
  if (!baslik?.startsWith(onek)) return null;
  const duz = Buffer.from(baslik.slice(onek.length), 'base64').toString('utf8');
  const al = (ad: string) =>
    duz.split('&').find((p) => p.startsWith(`${ad}:`))?.slice(ad.length + 1);
  return {
    duz,
    apiKey: al('apiKey'),
    randomKey: al('randomKey'),
    signature: al('signature'),
  };
}

async function main() {
  console.log('\n── I · YETKI BASLIGI ──');

  const y = await istekYakala((c) => c.urunleriListele());

  // OLCUT: yakalayici gercekten calisti mi?
  check(
    'I-OLCUT istek yakalandi ve iyzico ucuna gidiyor',
    y.url.includes('sandbox-api.iyzipay.com'),
    `url=${y.url}`,
  );

  const yetki = yetkiCoz(y.basliklar['Authorization']);
  check(
    'I3 Authorization bicimi "IYZWSv2 <base64>"',
    yetki !== null && !!yetki.apiKey && !!yetki.randomKey && !!yetki.signature,
    `baslik=${y.basliklar['Authorization']?.slice(0, 40)}`,
  );
  if (!yetki) return son();

  check(
    'I-OLCUT apiKey basliga dogru gecmis',
    yetki.apiKey === API_ANAHTARI,
    `apiKey=${yetki.apiKey}`,
  );

  // ⭐ ASIL KUSUR: baslik ile imzanin randomKey'i AYNI olmali.
  const rndBaslik = y.basliklar['x-iyzi-rnd'];
  check(
    'I1 ⭐ x-iyzi-rnd basligi, imzadaki randomKey ile AYNI',
    !!rndBaslik && rndBaslik === yetki.randomKey,
    `baslik=${rndBaslik} imza=${yetki.randomKey}`,
  );

  // I2: imza gercekten o randomKey + yol (+govde) uzerinden mi uretilmis?
  // Bu, I1'in tesaduf olmadigini gosterir — formul de dogru.
  const tamYol = y.url.replace('https://sandbox-api.iyzipay.com', '');
  const sorgusuzYol = tamYol.split('?')[0];

  // OLCUT: bu uc GERCEKTEN sorgu dizesi tasiyor mu? Tasimiyorsa I6 hicbir
  // sey olcmez ve "tesadufen yesil" kalir.
  check(
    'I-OLCUT bu uc sorgu dizesi tasiyor (I6 anlamli)',
    tamYol.includes('?'),
    `yol=${tamYol}`,
  );

  const beklenen = createHmac('sha256', SIR)
    .update(yetki.randomKey + sorgusuzYol + (y.govde ?? ''))
    .digest('hex');
  check(
    'I2 imza = HMAC(sir, randomKey + SORGUSUZ yol + govde)',
    yetki.signature === beklenen,
    `alinan=${yetki.signature?.slice(0, 16)}… beklenen=${beklenen.slice(0, 16)}…`,
  );

  // ⭐ I6: imza SORGU DIZESINI ICERMEMELI.
  // iyzico dokumani: "The URI path does not include query strings."
  // Sorgu dahil edilirse HER GET istegi reddedilir (01.09'da olculdu).
  const sorguDahilImza = createHmac('sha256', SIR)
    .update(yetki.randomKey + tamYol + (y.govde ?? ''))
    .digest('hex');
  check(
    'I6 ⭐ imza SORGU DIZESINI ICERMIYOR (iyzico yalniz uc yolunu imzalar)',
    yetki.signature !== sorguDahilImza,
    'imza sorgu dizesiyle hesaplanmis — her GET reddedilir',
  );

  // I4: rastgele SABITLENMEMIS olmali (tekrar saldirisina acik kalmasin).
  const y2 = await istekYakala((c) => c.urunleriListele());
  const yetki2 = yetkiCoz(y2.basliklar['Authorization']);
  check(
    'I4 ardisik istekler FARKLI rastgele kullanir (sabit degil)',
    !!yetki2 && yetki2.randomKey !== yetki.randomKey,
    `1=${yetki.randomKey} 2=${yetki2?.randomKey}`,
  );
  check(
    'I4-b ikinci istekte de baslik ile imza ESLESIYOR',
    y2.basliklar['x-iyzi-rnd'] === yetki2?.randomKey,
    `baslik=${y2.basliklar['x-iyzi-rnd']} imza=${yetki2?.randomKey}`,
  );

  // POST yolunda da ayni esleme gecerli olmali (govdeli istek).
  const y3 = await istekYakala((c) =>
    c.urunOlustur({ ad: 'Deneme Urunu' }),
  );
  const yetki3 = yetkiCoz(y3.basliklar['Authorization']);
  check(
    'I5 POST (govdeli) istekte de baslik ile imza ESLESIYOR',
    !!yetki3 && y3.basliklar['x-iyzi-rnd'] === yetki3.randomKey,
    `baslik=${y3.basliklar['x-iyzi-rnd']} imza=${yetki3?.randomKey}`,
  );
  check(
    'I5-b POST imzasi GOVDEYI de kapsiyor',
    (() => {
      if (!yetki3) return false;
      const yol3 = y3.url.replace('https://sandbox-api.iyzipay.com', '');
      const b = createHmac('sha256', SIR)
        .update(yetki3.randomKey + yol3 + (y3.govde ?? ''))
        .digest('hex');
      return yetki3.signature === b;
    })(),
    'govde imzaya girmiyor olabilir',
  );

  son();
}

function son() {
  console.log(
    `\n${'='.repeat(64)}\nIYZICO YETKI BASLIGI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
