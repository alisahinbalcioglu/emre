/**
 * FAZ 3 — E-POSTA ALTYAPISI ve PAROLA AKISLARI KAPISI (`npm run test:faz3`)
 *
 * DB GEREKTIRMEZ · SMTP GEREKTIRMEZ. `PrismaClient.prototype.$connect`
 * no-op'lanir (saglayicilar GERCEKTEN kurulur, baglanti acilmaz); e-posta
 * tarafi ise SMTP_HOST TANIMSIZ birakilarak olculur — testin kendisi
 * "yapilandirilmamis" yolu sinamak zorunda.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Bu turun neredeyse her maddesi "yazildi mi" degil "BAGLI MI / GERCEKTEN
 * KESIYOR MU" sorusuyla ayakta duruyor. Sessizce olu kalabilecekler:
 *
 *   F1  `iat` KAPISI — parola degisince eski token'lar olmezse, "parolami
 *       degistirdim, artik guvendeyim" cumlesi YALAN olur; calinmis token
 *       7 gun daha calisir. Kapinin TERSI de olcülmeli: 2 sn tolerans
 *       olmazsa kullanici KENDI parola degisiminden sonra disari atilir
 *       (iat saniyeye yuvarlanir, passwordChangedAt milisaniyelidir).
 *   F2  NUMARALANDIRMA — `forgot-password` var olan ve olmayan e-postaya
 *       AYNI cevabi vermezse uc, musteri listesi sorgulama hizmetine doner.
 *   F3  E-POSTA BAZINDA HIZ SINIRI — guard baglanmazsa ya da tracker
 *       govdedeki `email`'i okumazsa, sinir SESSIZCE IP kovasina duser ve
 *       gelen kutusu bombalamasi acik kalir. Hicbir hata olusmaz.
 *   F4  TEK GONDERICI — ikinci bir nodemailer/transport acilirsa gonderen
 *       adresi ve sablon ikiye bolunur (bu dosyanin ilk surumu de ayni
 *       uyariyi tasiyordu). Kapi, taşıyıcı kurulumunun TEK dosyada
 *       kaldigini olcer.
 *   F5  TOKEN OZETI — DB'ye duz metin token yazilirsa, sizan bir dokum
 *       DOGRUDAN hesap devralmaya doner.
 *   F6  KRITIK vs BEST-EFFORT — `gonderKritik` yapilandirma yokken
 *       sessizce gecerse, parola sifirlama "gonderildi" deyip hicbir sey
 *       gondermez; kullanici hesabindan kilitlenir.
 *
 * ── OLCUTU ONCE DOGRULA ─────────────────────────────────────────────────
 * Her "X var" iddiasinin yaninda ayni probe ile olculen ve BULUNMAMASI
 * gereken bir ornek var (…-OLCUT bloklari).
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/**
 * YORUMLARI SOY — bu kapinin desenleri KODDA benzersiz olmali. Bu depoda ayni
 * tuzaga uc kez dusuldu: desen kodu degil, kodun YANINDAKI aciklamayi
 * yakaliyordu ve test kendi belgelerini olcuyordu.
 */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// ── ORTAM ────────────────────────────────────────────────────────────────
// SMTP BILEREK TANIMSIZ: F6 tam olarak "yapilandirilmamis" yolu olcuyor.
for (const a of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])
  delete process.env[a];
process.env.DATABASE_URL ??= 'postgresql://olcum:olcum@localhost:5432/olcum';
process.env.JWT_SECRET ??= 'olcum-icin-sabit-en-az-otuziki-karakterlik-anahtar';
process.env.APP_URL ??= 'https://olcum.example.com';

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  (PrismaClient.prototype as any).$connect = async () => undefined;
  (PrismaClient.prototype as any).$disconnect = async () => undefined;

  // ═════════════════════════════════════════════════════════════════════
  //  A · ONYUKLEME + DI GRAFIGI  (statik yesil kanit degildir)
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── A · ONYUKLEME ve BAGIMLILIK GRAFIGI ──');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');

  let app: any = null;
  let onyuklemeHatasi: unknown = null;
  try {
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api'); // uretimi birebir yansit (main.ts)
    await app.init();
  } catch (e) {
    onyuklemeHatasi = e;
  }
  check(
    'A1 SMTP TANIMSIZKEN uygulama ONYUKLENIR (e-posta cekirdek bagimliligi DEGIL)',
    onyuklemeHatasi === null,
    onyuklemeHatasi instanceof Error ? onyuklemeHatasi.message.slice(0, 300) : '',
  );
  if (!app) {
    console.log(`\n${'='.repeat(64)}\nFAZ 3: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }

  const { ParolaServisi } = await import('../src/altyapi/auth/parola.servisi');
  const { EpostaDogrulamaServisi } = await import(
    '../src/altyapi/auth/eposta-dogrulama.servisi'
  );
  const { EpostaServisi } = await import(
    '../src/ozellik/odeme/eposta/eposta.servisi'
  );

  const parolaServisi = app.get(ParolaServisi);
  const dogrulamaServisi = app.get(EpostaDogrulamaServisi);
  const epostaServisi = app.get(EpostaServisi);
  check('A2 ParolaServisi DI ile cozuluyor', !!parolaServisi);
  check('A3 EpostaDogrulamaServisi DI ile cozuluyor', !!dogrulamaServisi);

  // F4 — TEK GONDERICI: parola akisi ile odeme akisi AYNI ORNEGI paylasmali.
  check(
    'A4 ParolaServisi ile odeme AYNI EpostaServisi ORNEGINI paylasiyor (tek gonderici)',
    (parolaServisi as any).eposta === epostaServisi,
  );
  check(
    'A5 EpostaDogrulamaServisi de AYNI ornegi paylasiyor',
    (dogrulamaServisi as any).eposta === epostaServisi,
  );

  // ── Rota envanteri ───────────────────────────────────────────────────
  const sunucu = app.getHttpAdapter().getInstance();
  const rotalar: string[] = [];
  for (const k of sunucu?._router?.stack ?? []) {
    if (k.route?.path)
      for (const m of Object.keys(k.route.methods ?? {}))
        rotalar.push(`${m.toUpperCase()} ${k.route.path}`);
  }
  check(
    'A-OLCUT rota toplayici calisiyor (bilinen /api/auth/login goruluyor)',
    rotalar.includes('POST /api/auth/login'),
    `toplam rota=${rotalar.length}`,
  );
  for (const uc of [
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password',
    'POST /api/auth/change-password',
    'POST /api/auth/verify-email',
    'POST /api/auth/resend-verification',
  ]) {
    check(`A6 rota kayitli: ${uc}`, rotalar.includes(uc));
  }

  // ═════════════════════════════════════════════════════════════════════
  //  B · HIZ SINIRI — IP **ve** HEDEF E-POSTA  (F3)
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── B · HIZ SINIRI (metadata + tracker davranisi) ──');
  const { AuthController } = await import('../src/altyapi/auth/auth.controller');
  const { EpostaHizSiniriGuard } = await import(
    '../src/altyapi/auth/guards/eposta-hiz-siniri.guard'
  );
  const proto = AuthController.prototype as unknown as Record<string, unknown>;
  const limit = (m: string) =>
    Reflect.getMetadata('THROTTLER:LIMITdefault', proto[m] as object);
  const ttl = (m: string) =>
    Reflect.getMetadata('THROTTLER:TTLdefault', proto[m] as object);
  const metotGuardlari = (m: string) =>
    ((Reflect.getMetadata('__guards__', proto[m] as object) ?? []) as any[]).map(
      (g) => g?.name ?? String(g),
    );

  const sinifGuardlari = (
    (Reflect.getMetadata('__guards__', AuthController) ?? []) as any[]
  ).map((g) => g?.name ?? String(g));
  check(
    'B1 sinifa ThrottlerGuard BAGLI (IP kovasi)',
    sinifGuardlari.includes('ThrottlerGuard'),
    `guardlar=${JSON.stringify(sinifGuardlari)}`,
  );
  check('B2 forgot-password limiti 5', limit('forgotPassword') === 5, `okunan=${limit('forgotPassword')}`);
  check(
    'B3 forgot-password penceresi 15 dk',
    ttl('forgotPassword') === 900_000,
    `okunan=${ttl('forgotPassword')}`,
  );
  check(
    'B4 forgot-password ucuna EpostaHizSiniriGuard BAGLI (e-posta kovasi)',
    metotGuardlari('forgotPassword').includes('EpostaHizSiniriGuard'),
    `guardlar=${JSON.stringify(metotGuardlari('forgotPassword'))}`,
  );
  check('B5 reset-password limiti 5', limit('resetPassword') === 5);
  check(
    'B6 resend-verification DAR sinirli (<=3, her istek bir mail uretir)',
    limit('resendVerification') === 3,
    `okunan=${limit('resendVerification')}`,
  );
  check(
    'B-OLCUT metot guard okuyucusu calisiyor (change-password JwtAuthGuard tasiyor)',
    metotGuardlari('changePassword').includes('JwtAuthGuard'),
    `guardlar=${JSON.stringify(metotGuardlari('changePassword'))}`,
  );

  // Tracker DAVRANISI — dekorator varligi yetmez, ne urettigini olc.
  const guard = new (EpostaHizSiniriGuard as any)({ throttlers: [] }, {}, {});
  const izle = (req: any) => (guard as any).getTracker(req);
  check(
    'B7 tracker HEDEF E-POSTAdan turuyor (IP degil)',
    (await izle({ body: { email: 'ali@ornek.com' }, ip: '1.2.3.4' })) ===
      'eposta:ali@ornek.com',
    String(await izle({ body: { email: 'ali@ornek.com' }, ip: '1.2.3.4' })),
  );
  check(
    'B8 buyuk/kucuk harf ve bosluk sinirI ATLATAMAZ (ayni kova)',
    (await izle({ body: { email: '  ALI@Ornek.COM ' } })) ===
      (await izle({ body: { email: 'ali@ornek.com' } })),
  );
  check(
    'B9 e-posta YOKSA IP kovasina duser (govdesiz istekler birbirini kilitlemez)',
    (await izle({ body: {}, ip: '9.9.9.9' })) === 'ip:9.9.9.9',
    String(await izle({ body: {}, ip: '9.9.9.9' })),
  );
  check(
    'B-OLCUT farkli e-postalar FARKLI kova uretir',
    (await izle({ body: { email: 'a@x.com' } })) !==
      (await izle({ body: { email: 'b@x.com' } })),
  );

  // ═════════════════════════════════════════════════════════════════════
  //  C · TOKEN OZETI  (F5)
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── C · TOKEN URETIMI ve OZETLEME ──');
  const { tokenUret, tokenOzetle, SIFIRLAMA_OMRU_MS, DOGRULAMA_OMRU_MS } =
    await import('../src/altyapi/auth/token-ozet');
  const { token: t1, ozet: o1 } = tokenUret();
  const { token: t2 } = tokenUret();
  check('C1 token ile OZET AYNI DEGIL (DBye duz metin yazilmaz)', t1 !== o1);
  check('C2 ozet SHA-256 (64 onaltilik karakter)', /^[0-9a-f]{64}$/.test(o1));
  check('C3 ozetleme DETERMINISTIK (tek sorguyla dogrulanabilir)', tokenOzetle(t1) === o1);
  check('C4 iki cagri FARKLI token uretir (tahmin edilemez)', t1 !== t2);
  check(
    'C5 token URL-GUVENLI (base64url: + / = YOK)',
    !/[+/=]/.test(t1),
    `token=${t1.slice(0, 12)}…`,
  );
  check('C6 token en az 32 bayt entropi (>=43 karakter)', t1.length >= 43, `uzunluk=${t1.length}`);
  check('C7 sifirlama omru 1 saat', SIFIRLAMA_OMRU_MS === 3_600_000);
  check('C8 dogrulama omru 24 saat', DOGRULAMA_OMRU_MS === 86_400_000);
  check('C-OLCUT ozetleyici FARKLI girdiye FARKLI ozet verir', tokenOzetle('a') !== tokenOzetle('b'));

  // ═════════════════════════════════════════════════════════════════════
  //  D · E-POSTA ICERIGI ve IKI GONDERIM KIPI  (F6)
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── D · E-POSTA ICERIGI ve GONDERIM SOZLESMELERI ──');
  const icerik = epostaServisi.icerikUret({
    kime: 'a@b.com',
    konu: 'k',
    baslik: 'Baslik',
    paragraflar: ['Birinci paragraf'],
    dugme: { etiket: 'Tikla', url: 'https://ornek.com/reset?token=ABC' },
    altNot: 'alt not',
  });
  check('D1 HTML govde uretiliyor', icerik.html.includes('<!doctype html>'));
  check('D2 DUZ METIN govde de uretiliyor (yalniz-HTML spam skorunu bozar)', icerik.metin.length > 0);
  check(
    'D3 baglanti DUZ METINDE de var (metin okuyan kullanici tiklayabilsin)',
    icerik.metin.includes('https://ornek.com/reset?token=ABC'),
  );
  check(
    'D4 HTML kacisi calisiyor (XSS)',
    epostaServisi
      .icerikUret({
        kime: 'a@b.com',
        konu: 'k',
        baslik: '<script>alert(1)</script>',
        paragraflar: [],
      })
      .html.includes('&lt;script&gt;'),
  );
  check('D5 SMTP TANIMSIZ olarak raporlaniyor', epostaServisi.yapilandirildiMi() === false);

  let bestEffortHatasi: unknown = null;
  try {
    await epostaServisi.gonder({ kime: 'a@b.com', konu: 'k', baslik: 'b', paragraflar: [] });
  } catch (e) {
    bestEffortHatasi = e;
  }
  check(
    'D6 `gonder` yapilandirma yokken FIRLATMAZ (dunning/fatura/havale sozlesmesi korundu)',
    bestEffortHatasi === null,
    String(bestEffortHatasi ?? ''),
  );

  let kritikHatasi: unknown = null;
  try {
    await epostaServisi.gonderKritik({ kime: 'a@b.com', konu: 'k', baslik: 'b', paragraflar: [] });
  } catch (e) {
    kritikHatasi = e;
  }
  check(
    'D7 `gonderKritik` yapilandirma yokken FIRLATIR (sessizce yutmaz)',
    kritikHatasi !== null,
  );
  check(
    'D8 hata mesaji EKSIK DEGISKENIN adini soyler',
    String((kritikHatasi as Error)?.message ?? '').includes('SMTP_HOST'),
    String((kritikHatasi as Error)?.message ?? '').slice(0, 120),
  );

  // ═════════════════════════════════════════════════════════════════════
  //  E · NUMARALANDIRMA  (F2)
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── E · KULLANICI NUMARALANDIRMA ──');
  const { ConfigService } = await import('@nestjs/config');
  const sahteEposta = {
    gonderKritik: async () => undefined,
    gonder: async () => undefined,
  };
  const yazilanlar: any[] = [];
  const sahtePrisma = (kullanici: any) =>
    ({
      user: { findUnique: async () => kullanici, update: async () => kullanici },
      passwordResetToken: {
        updateMany: async () => ({ count: 0 }),
        create: async (a: any) => {
          yazilanlar.push(a.data);
          return a.data;
        },
        findUnique: async () => null,
      },
      $transaction: async (islemler: any[]) => Promise.all(islemler),
    }) as any;

  const varOlan = {
    id: 'u1',
    email: 'var@ornek.com',
    role: 'user',
    status: 'active',
    deletedAt: null,
    password: 'x',
  };
  const servisVar = new (ParolaServisi as any)(
    sahtePrisma(varOlan),
    sahteEposta,
    { signToken: () => 'tkn' },
    new ConfigService({}),
  );
  const servisYok = new (ParolaServisi as any)(
    sahtePrisma(null),
    sahteEposta,
    { signToken: () => 'tkn' },
    new ConfigService({}),
  );

  const t0 = Date.now();
  const cevapVar = await servisVar.sifirlamaIste('var@ornek.com');
  const sureVar = Date.now() - t0;
  const t3 = Date.now();
  const cevapYok = await servisYok.sifirlamaIste('yok@ornek.com');
  const sureYok = Date.now() - t3;

  check(
    'E1 var olan ve OLMAYAN e-posta AYNI cevabi aliyor',
    JSON.stringify(cevapVar) === JSON.stringify(cevapYok),
    `${JSON.stringify(cevapVar)} vs ${JSON.stringify(cevapYok)}`,
  );
  check(
    'E2 olmayan e-posta HATA FIRLATMIYOR (404 de bir cevaptir)',
    cevapYok === (ParolaServisi as any).TEKDUZE_CEVAP,
  );
  check(
    'E3 iki dal da e-postayi BEKLEMEDEN doner (sure sizintisi yok, <150ms fark)',
    Math.abs(sureVar - sureYok) < 150,
    `var=${sureVar}ms yok=${sureYok}ms`,
  );
  check(
    'E-OLCUT olcum araci calisiyor: VAR olan dalda token GERCEKTEN yazildi',
    yazilanlar.length === 1 && !!yazilanlar[0].tokenHash,
    `yazilan=${yazilanlar.length}`,
  );
  check(
    'E4 DBye yazilan deger OZET (duz metin token DEGIL)',
    /^[0-9a-f]{64}$/.test(yazilanlar[0]?.tokenHash ?? ''),
  );
  check(
    'E5 sifirlama baglantisinda `redirect`/`next` parametresi YOK (acik yonlendirme)',
    !kodu(oku('backend/src/altyapi/auth/parola.servisi.ts')).match(/redirect|[?&]next=/),
  );

  // ── E-b · TOKEN DOGRULAMA DALLARI ve `passwordChangedAt` YAZICISI ────
  // ⚠ Asagidaki iki assert bu kapinin ILK surumunde YOKTU ve bu gercek bir
  // bosluktu: F bolumu `iat` kapisinin KESTIGINI kanitliyor ama o kapiyi
  // besleyen damgayi KIMIN YAZDIGINI kanitlamiyordu. Bu depoda tam olarak bu
  // tuzak alti kez yasandi (mekanizma dogru, cagiran yok): `sifirla`
  // passwordChangedAt yazmasaydi F1 yine YESIL kalir, ama parola sifirlamak
  // hicbir oturumu KAPATMAZDI.
  console.log('');
  console.log('── E-b · SIFIRLAMA DALLARI ve DAMGA ──');

  const tokenKaydi = (uzeri: any) => ({
    id: 'tk1',
    userId: 'u1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'u1', deletedAt: null, status: 'active' },
    ...uzeri,
  });
  const sifirlamaServisi = (kayit: any, yakala: any[]) =>
    new (ParolaServisi as any)(
      {
        user: {
          findUnique: async () => ({
            id: 'u1',
            email: 'a@b.com',
            role: 'user',
            status: 'active',
            deletedAt: null,
            password: '$2b$10$abcdefghijklmnopqrstuv',
          }),
          update: async (a: any) => {
            yakala.push(a.data);
            return {};
          },
        },
        passwordResetToken: {
          findUnique: async () => kayit,
          update: async () => ({}),
          updateMany: async () => ({ count: 1 }),
        },
        $transaction: async (islemler: any[]) => Promise.all(islemler),
      } as any,
      sahteEposta,
      { signToken: () => 'TAZE-TOKEN' },
      new ConfigService({}),
    );

  const yazilanKullanici: any[] = [];
  const sonuc = await sifirlamaServisi(tokenKaydi({}), yazilanKullanici).sifirla(
    'gecerli-token',
    'yeniParola123',
  );
  check('E6 gecerli token ile sifirlama BASARILI', !!sonuc?.mesaj);
  check(
    'E7 sifirlama `passwordChangedAt` DAMGALIYOR (iat kapisini besleyen tek yazici)',
    yazilanKullanici[0]?.passwordChangedAt instanceof Date,
    `yazilan alanlar=${Object.keys(yazilanKullanici[0] ?? {}).join(',')}`,
  );
  check(
    'E8 sifirlamada parola BCRYPT ozeti olarak yaziliyor (duz metin degil)',
    typeof yazilanKullanici[0]?.password === 'string' &&
      yazilanKullanici[0].password.startsWith('$2') &&
      yazilanKullanici[0].password !== 'yeniParola123',
  );

  let kullanilmisHata: any = null;
  try {
    await sifirlamaServisi(tokenKaydi({ usedAt: new Date() }), []).sifirla('t', 'yeniParola123');
  } catch (e) {
    kullanilmisHata = e;
  }
  check('E9 KULLANILMIS token ikinci kez calismiyor', kullanilmisHata !== null);

  let suresiDolmusHata: any = null;
  try {
    await sifirlamaServisi(
      tokenKaydi({ expiresAt: new Date(Date.now() - 1000) }),
      [],
    ).sifirla('t', 'yeniParola123');
  } catch (e) {
    suresiDolmusHata = e;
  }
  check('E10 SURESI DOLMUS token calismiyor', suresiDolmusHata !== null);

  let yokHata: any = null;
  try {
    await sifirlamaServisi(null, []).sifirla('t', 'yeniParola123');
  } catch (e) {
    yokHata = e;
  }
  check('E11 BILINMEYEN token calismiyor', yokHata !== null);
  check(
    'E12 uc ret de AYNI mesaji veriyor (token bir zamanlar gecerliydi bilgisi sizmaz)',
    kullanilmisHata?.message === suresiDolmusHata?.message &&
      suresiDolmusHata?.message === yokHata?.message,
    `${kullanilmisHata?.message} | ${yokHata?.message}`,
  );

  // Parola DEGISTIRME (3.5) — mevcut parola kapisi + damga + taze token
  const degisimYazilan: any[] = [];
  const bcryptModulu = await import('bcrypt');
  const gercekOzet = await bcryptModulu.hash('dogruParola', 10);
  const degisimServisi = new (ParolaServisi as any)(
    {
      user: {
        findUnique: async () => ({
          id: 'u1',
          email: 'a@b.com',
          role: 'user',
          status: 'active',
          deletedAt: null,
          password: gercekOzet,
        }),
        update: async (a: any) => {
          degisimYazilan.push(a.data);
          return {};
        },
      },
      $transaction: async (islemler: any[]) => Promise.all(islemler),
    } as any,
    sahteEposta,
    { signToken: () => 'TAZE-TOKEN' },
    new ConfigService({}),
  );

  let yanlisMevcut: any = null;
  try {
    await degisimServisi.degistir('u1', 'YANLIS-parola', 'yeniParola123');
  } catch (e) {
    yanlisMevcut = e;
  }
  check('E13 YANLIS mevcut parola ile degisim REDDEDILIYOR', yanlisMevcut !== null);
  check(
    'E13-OLCUT hicbir yazma yapilmadi (red gercekten kesiyor)',
    degisimYazilan.length === 0,
    `yazma=${degisimYazilan.length}`,
  );

  const degisimSonuc = await degisimServisi.degistir('u1', 'dogruParola', 'yeniParola123');
  check(
    'E14 DOGRU mevcut parola ile degisim `passwordChangedAt` damgaliyor',
    degisimYazilan[0]?.passwordChangedAt instanceof Date,
  );
  check(
    'E15 degisim TAZE TOKEN donuyor (yoksa kullanici kendi islemiyle atilir)',
    degisimSonuc?.token === 'TAZE-TOKEN',
    `donen=${JSON.stringify(Object.keys(degisimSonuc ?? {}))}`,
  );
  let ayniParola: any = null;
  try {
    await degisimServisi.degistir('u1', 'dogruParola', 'dogruParola');
  } catch (e) {
    ayniParola = e;
  }
  check('E16 yeni parola mevcutla AYNI olamaz', ayniParola !== null);

  // ═════════════════════════════════════════════════════════════════════
  //  F · `iat` KAPISI  (F1) — hem KESIYOR hem YANLIS KESMIYOR
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── F · PAROLA DEGISINCE ESKI TOKENLAR OLUYOR MU ──');
  const { JwtStrategy } = await import('../src/altyapi/auth/strategies/jwt.strategy');
  const kullaniciyla = (pwChangedAt: Date | null) =>
    new (JwtStrategy as any)({
      user: {
        findUnique: async () => ({
          id: 'u1',
          email: 'a@b.com',
          role: 'user',
          firmaId: 'f1',
          status: 'active',
          deletedAt: null,
          passwordChangedAt: pwChangedAt,
        }),
      },
    });

  const simdi = Date.now();
  const eskiIat = Math.floor((simdi - 60_000) / 1000); // 1 dk once imzalanmis
  const yeniIat = Math.floor(simdi / 1000); // AYNI an imzalanmis (yuvarlanmis)

  let eskiRet: unknown = null;
  try {
    await kullaniciyla(new Date(simdi)).validate({
      sub: 'u1',
      email: 'a@b.com',
      role: 'user',
      iat: eskiIat,
    });
  } catch (e) {
    eskiRet = e;
  }
  check('F1 parola degisiminden ONCEKI token REDDEDILIYOR', eskiRet !== null);
  check(
    'F1-b ret mesaji sebebi soyluyor',
    String((eskiRet as Error)?.message ?? '').toLowerCase().includes('parola'),
    String((eskiRet as Error)?.message ?? ''),
  );

  // ⚠ ASIL TUZAK: taze token kendi kapisina takilmamali.
  let tazeSonuc: any = null;
  let tazeHata: unknown = null;
  try {
    tazeSonuc = await kullaniciyla(new Date(simdi)).validate({
      sub: 'u1',
      email: 'a@b.com',
      role: 'user',
      iat: yeniIat,
    });
  } catch (e) {
    tazeHata = e;
  }
  check(
    'F2 parola degisimiyle AYNI ANDA uretilen TAZE token KABUL EDILIYOR ' +
      '(saniyeye yuvarlama kullaniciyi kendi isleminden atmiyor)',
    tazeHata === null && tazeSonuc?.id === 'u1',
    String((tazeHata as Error)?.message ?? ''),
  );

  let gocSonuc: any = null;
  try {
    gocSonuc = await kullaniciyla(null).validate({
      sub: 'u1',
      email: 'a@b.com',
      role: 'user',
      iat: eskiIat,
    });
  } catch {
    gocSonuc = null;
  }
  check(
    'F3 passwordChangedAt NULL (goc edilen hesap) ise HICBIR token reddedilmiyor',
    gocSonuc?.id === 'u1',
  );
  check(
    'F-OLCUT kapi hala ban/yumusak silme kapilarini da tasiyor',
    (() => {
      const k = kodu(oku('backend/src/altyapi/auth/strategies/jwt.strategy.ts'));
      return k.includes("status === 'banned'") && k.includes('user.deletedAt');
    })(),
  );

  // ═════════════════════════════════════════════════════════════════════
  //  G · KAYNAK DISIPLINI — tek gonderici, goc, on yuz baglantisi
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── G · KAYNAK ve GOC DISIPLINI ──');
  const epostaKodu = kodu(oku('backend/src/ozellik/odeme/eposta/eposta.servisi.ts'));
  check('G1 tasiyici nodemailer SMTP (saglayiciya ozel SDK yok)', epostaKodu.includes('nodemailer.createTransport'));
  check(
    'G2 Resend HTTP API cagrisi KALDIRILDI',
    !epostaKodu.includes('api.resend.com'),
  );
  check(
    'G3 587de STARTTLS ZORUNLU (parola duz metin gitmesin)',
    epostaKodu.includes('requireTLS'),
  );
  check(
    'G4 sendMail hem `text` hem `html` tasiyor',
    /text:\s*metin/.test(epostaKodu) && /html,/.test(epostaKodu),
  );

  // F4 — ikinci gonderici acilmis mi? Tum backend kaynagini tara.
  const taranan: string[] = [];
  (function gez(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'dist') gez(p);
      } else if (e.name.endsWith('.ts')) taranan.push(p);
    }
  })(path.join(KOK, 'backend/src'));
  const tasiyiciKuranlar = taranan.filter((p) =>
    kodu(fs.readFileSync(p, 'utf8')).includes('createTransport'),
  );
  check(
    'G5 TEK GONDERICI: `createTransport` yalniz eposta.servisi.ts icinde',
    tasiyiciKuranlar.length === 1 && tasiyiciKuranlar[0].endsWith('eposta.servisi.ts'),
    `bulunan=${tasiyiciKuranlar.map((p) => path.basename(p)).join(', ')}`,
  );
  check(
    'G-OLCUT tarayici gercekten calisiyor (dosya sayisi makul)',
    taranan.length > 50,
    `taranan=${taranan.length}`,
  );

  const migration = oku(
    'backend/prisma/migrations/20260908100000_faz3_eposta_parola/migration.sql',
  );
  check(
    'G6 GOC: mevcut hesaplar emailVerified=true isaretleniyor (kimse kilitlenmiyor)',
    /UPDATE "User" SET "emailVerified" = true/.test(migration),
  );
  check(
    'G7 GOC: passwordChangedAt DOLDURULMUYOR (doldurulsa herkes disari atilirdi)',
    !/UPDATE "User" SET "passwordChangedAt"/.test(migration),
  );
  check(
    'G8 tokenHash BENZERSIZ indeksli (tek sorguyla dogrulama)',
    /CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"/.test(migration),
  );

  // On yuz: giris ekraninda baglanti GERCEKTEN var mi (ozellik yazildi,
  // baglanti unutuldu tuzagi — bu depoda defalarca yasandi).
  const loginSayfasi = oku('frontend/app/login/page.tsx');
  // ⚠ MUTASYONLA OLCULDU: bu assert ilk surumunde HAM dosyayi okuyordu ve
  // baglanti silindiginde bile YESIL kaliyordu — cunku `/forgot-password`
  // metni dosyanin BASINDAKI aciklama yorumunda da geciyor. Kapi kendi
  // belgesini olcuyordu. Desen KODDA benzersiz olmali (M13 sagkalani).
  check(
    'G9 giris ekraninda /forgot-password baglantisi VAR (KODDA, yorumda degil)',
    kodu(loginSayfasi).includes('/forgot-password'),
  );
  // G10 BILEREK ham dosyayi okur: olctugu sey zaten YORUMUN kendisi.
  check(
    'G10 "BILEREK YOK" notu KALDIRILDI (ozellik yazilinca not da guncellenir)',
    !loginSayfasi.includes('BILEREK YOK'),
  );
  for (const s of [
    'frontend/app/forgot-password/page.tsx',
    'frontend/app/reset-password/page.tsx',
    'frontend/app/verify-email/page.tsx',
  ]) {
    check(`G11 sayfa mevcut: ${path.basename(path.dirname(s))}`, fs.existsSync(path.join(KOK, s)));
  }
  const profil = kodu(oku('frontend/app/(protected)/profile/page.tsx'));
  check(
    'G12 profil sayfasi change-password ucunu CAGIRIYOR (KODDA)',
    profil.includes('/auth/change-password'),
  );
  check(
    'G13 parola degisiminde ON YUZ TAZE TOKENI SAKLIYOR (yoksa kullanici atilir)',
    /localStorage\.setItem\('token'/.test(profil),
  );

  await app.close();

  console.log(`\n${'='.repeat(64)}\nFAZ 3: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed > 0) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('KAPI COKTU:', e);
  process.exit(1);
});
