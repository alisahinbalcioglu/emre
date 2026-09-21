/**
 * PAROLA KAPISI — `npm run test:parola-kapisi`   (Gorunur kusurlar turu, 21.09)
 *
 * DB GEREKTIRMEZ · AG GEREKTIRMEZ. Sahte Prisma + GERCEK class-validator +
 * GERCEK ThrottlerGuard ile olcer.
 *
 * ── BU DOSYA NEDEN VAR ───────────────────────────────────────────────────
 * Iki gorunur kusur ayni kokten geliyordu: "ayni kural iki yerde yaziliydi,
 * biri guncellenip digeri geride kaldi".
 *
 *  t.15  PAROLA UZUNLUGU IKI POLITIKAYA BOLUNMUSTU. `RegisterDto` ciplak
 *        `@MinLength(6)`, geri kalan her sey `parola-kurali.ts`ten 8.
 *        `/register` ekrani da ayrica "En az 6 karakter." yaziyordu. Yani
 *        kullanici 6 karakterle hesap aciyor, ertesi gun ayni parolayi
 *        DEGISTIREMIYORDU. Bu kapinin B blogu sayiyi UC yerde birden olcer:
 *        sunucu sabiti · gercek dogrulama davranisi · on yuz kopyasi.
 *
 *  t.16  YANLIS MEVCUT PAROLA KULLANICIYI OTURUMDAN ATIYORDU. Sunucu
 *        oturumlu uclarda yanlis parolayi 401 ile anlatiyordu
 *        (parola.servisi.ts · hesap.servisi.ts); `frontend/ortak/lib/api.ts`
 *        yakalayicisi ise KORUMALI bir uctan gelen 401'i -dogru sekilde-
 *        "oturum bitti" sayip token'i siliyordu. A blogu sunucunun artik
 *        400 + `kod: PAROLA_HATALI` dondugunu olcer.
 *
 * ── UC BLOK, UC AYRI IDDIA ───────────────────────────────────────────────
 *   A · Yanlis parola 400 + PAROLA_HATALI (GERCEK oturum dusmesi HALA 401)
 *   B · Uzunluk kurali TEK KAYNAK (sunucu · dogrulama · on yuz kopyasi)
 *   C · HIZ SINIRI DURUYOR — 400'e gecerken kaba kuvvete kapi acilmadi
 *
 * ⚠ C blogu metadata okumakla YETINMEZ: gercek `ThrottlerGuard`i gercek
 * depoyla kosturur ve 6. denemede `ThrottlerException` bekler. Metadata
 * assert'i tek basina "dekorator duruyor" der, "sinir KESIYOR" demez.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerStorageService,
  ThrottlerException,
} from '@nestjs/throttler';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';

import {
  PAROLA_MIN,
  PAROLA_MESAJI,
  PAROLA_HATALI_YANIT,
} from '../src/altyapi/auth/parola-kurali';
import { RegisterDto } from '../src/altyapi/auth/dto/register.dto';
import { ParolaDegistirDto } from '../src/altyapi/auth/dto/parola-degistir.dto';
import { ParolaSifirlaDto } from '../src/altyapi/auth/dto/parola-sifirla.dto';
import { DavetKabulDto } from '../src/ozellik/firma/dto/davet-kabul.dto';
import { ParolaServisi } from '../src/altyapi/auth/parola.servisi';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
import { AuthController } from '../src/altyapi/auth/auth.controller';

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
const oku = (rel: string) => fs.readFileSync(path.join(KOK, rel), 'utf8');
/** Yorumlari soy: yorumda eslesen desen KODU degistirmez (mutasyon tuzagi). */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

async function dene<T>(fn: () => Promise<T>): Promise<{ deger?: T; hata?: any }> {
  try {
    return { deger: await fn() };
  } catch (hata) {
    return { hata };
  }
}
const hataGovdesi = (e: any) => e?.response ?? e?.getResponse?.() ?? e;
const hataDurumu = (e: any) => e?.status ?? e?.getStatus?.() ?? null;
const hataKodu = (e: any) => hataGovdesi(e)?.kod ?? null;

// ═══════════════════════════════════════════════════════════════════════════
//  A · YANLIS PAROLA OTURUMDAN ATMAZ  (t.16)
// ═══════════════════════════════════════════════════════════════════════════
async function bolumA(): Promise<void> {
  console.log('\n-- A - YANLIS PAROLA -> 400 PAROLA_HATALI (401 DEGIL) --');

  const ozet = await bcrypt.hash('dogru-parola-123', 10);
  const kullanici = (fazla: Record<string, unknown> = {}) => ({
    id: 'U1',
    email: 'a@b.com',
    role: 'user',
    status: 'active',
    deletedAt: null,
    firmaId: null,
    firmaRol: 'sahip',
    password: ozet,
    ...fazla,
  });

  // ── A1-A5: PAROLA DEGISTIRME ──────────────────────────────────────────
  const yazilan: any[] = [];
  const parolaServisi = new (ParolaServisi as any)(
    {
      user: {
        findUnique: async () => kullanici(),
        update: async (a: any) => {
          yazilan.push(a.data);
          return {};
        },
      },
      $transaction: async (islemler: any[]) => Promise.all(islemler),
    },
    { gonderSessizce: async () => undefined, gonderKritik: async () => undefined },
    { signToken: () => 'TAZE-TOKEN' },
    new ConfigService({}),
  );

  const d1 = await dene(() =>
    parolaServisi.degistir('U1', 'YANLIS-parola', 'yeni-parola-1234'),
  );
  check(
    'A1 * change-password yanlis mevcut parola -> 400 (401 olsaydi api.ts token silerdi)',
    hataDurumu(d1.hata) === 400,
    `okunan=${hataDurumu(d1.hata)} govde=${JSON.stringify(hataGovdesi(d1.hata))}`,
  );
  check(
    'A2 yanit kod: PAROLA_HATALI tasiyor (on yuz sozlugu bu kodu cevirir)',
    hataKodu(d1.hata) === 'PAROLA_HATALI',
    `okunan=${hataKodu(d1.hata)}`,
  );
  check(
    'A3 yanit `message` tasiyor - `mesaj` DEGIL (profile/page.tsx data.message okuyor)',
    hataGovdesi(d1.hata)?.message === 'Parolanız hatalı.',
    `okunan=${JSON.stringify(hataGovdesi(d1.hata))}`,
  );
  check(
    'A4 (olcut) red GERCEKTEN kesiyor: hicbir yazma yapilmadi',
    yazilan.length === 0,
    `yazma=${yazilan.length}`,
  );

  // (FIXTURE KANITI) — A1'in 400'u "her sey 400" oldugundan degil. DOGRU
  // parola ayni servisten GECIYOR: bcrypt dali gercekten kostu.
  const d1d = await dene(() =>
    parolaServisi.degistir('U1', 'dogru-parola-123', 'yeni-parola-1234'),
  );
  check(
    'A5 (fixture) DOGRU parola ayni servisten GECIYOR (bcrypt dali kostu)',
    d1d.hata === undefined && yazilan.length === 1,
    `hata=${JSON.stringify(hataGovdesi(d1d.hata))} yazma=${yazilan.length}`,
  );

  // (NEGATIF KRITER) — GERCEK oturum dusmesi HALA 401. Servis "her seye 400"
  // demedi: kullanici kaydi yoksa (token gecerli ama kisi silinmis) 401.
  const yokServisi = new (ParolaServisi as any)(
    { user: { findUnique: async () => null, update: async () => ({}) } },
    { gonderSessizce: async () => undefined },
    { signToken: () => 't' },
    new ConfigService({}),
  );
  const d1y = await dene(() => yokServisi.degistir('U1', 'x', 'yeni-parola-1234'));
  check(
    'A6 (negatif) kullanici YOK -> HALA 401 (gercek oturum dusmesi sessizlesmedi)',
    hataDurumu(d1y.hata) === 401,
    `okunan=${hataDurumu(d1y.hata)}`,
  );

  // ── A7-A10: HESAP KAPATMA ─────────────────────────────────────────────
  const kapatmaYazmalari: any[] = [];
  const hesapServisi = new (HesapServisi as any)(
    {
      user: {
        findUnique: async () => kullanici(),
        update: async (a: any) => {
          kapatmaYazmalari.push(a.data);
          return {};
        },
        count: async () => 1,
      },
    },
    { iptalEt: async () => undefined },
  );
  const d2 = await dene(() => hesapServisi.hesabiKapat('U1', 'YANLIS-parola', null));
  check(
    'A7 * hesabimi-kapat yanlis parola -> 400 (401 olsaydi kullanici oturumdan atilirdi)',
    hataDurumu(d2.hata) === 400,
    `okunan=${hataDurumu(d2.hata)} govde=${JSON.stringify(hataGovdesi(d2.hata))}`,
  );
  check(
    'A8 yanit kod: PAROLA_HATALI tasiyor',
    hataKodu(d2.hata) === 'PAROLA_HATALI',
    `okunan=${hataKodu(d2.hata)}`,
  );
  check(
    'A9 (olcut) hesap KAPANMADI (red gercekten kesiyor)',
    kapatmaYazmalari.length === 0,
    `yazma=${kapatmaYazmalari.length}`,
  );

  // (NEGATIF KRITER) — kapali/silinmis hesap HALA 401.
  const silinmisServisi = new (HesapServisi as any)(
    { user: { findUnique: async () => kullanici({ deletedAt: new Date() }) } },
    { iptalEt: async () => undefined },
  );
  const d2y = await dene(() =>
    silinmisServisi.hesabiKapat('U1', 'dogru-parola-123', null),
  );
  check(
    'A10 (negatif) zaten kapatilmis hesap -> HALA 401 (her seye 400 denmedi)',
    hataDurumu(d2y.hata) === 401,
    `okunan=${hataDurumu(d2y.hata)}`,
  );

  // ── A11-A12: SABIT TEK YERDE, DESEN FAZ 7 ILE AYNI ────────────────────
  check(
    'A11 iki servis de parola-kurali.ts PAROLA_HATALI_YANIT import ediyor (kopya sabit yok)',
    /PAROLA_HATALI_YANIT/.test(kodu(oku('backend/src/altyapi/auth/parola.servisi.ts'))) &&
      /PAROLA_HATALI_YANIT/.test(kodu(oku('backend/src/altyapi/auth/hesap.servisi.ts'))),
  );
  check(
    'A12 * Faz 7 uclari AYNI kodu kullaniyor (ucuncu desen icat edilmedi)',
    /kod: 'PAROLA_HATALI'/.test(kodu(oku('backend/src/altyapi/auth/mfa/mfa.servisi.ts'))) &&
      /kod: 'PAROLA_HATALI'/.test(
        kodu(oku('backend/src/altyapi/auth/kurumsal/kurumsal-giris.servisi.ts')),
      ) &&
      PAROLA_HATALI_YANIT.kod === 'PAROLA_HATALI',
  );

  // ── A13: ON YUZ SOZLUGU BU KODU TANIYOR (mekanizma var, baglanti yok) ──
  check(
    'A13 * on yuz sozlugu PAROLA_HATALI ceviriyor (kod sessizce yedek metne dusmuyor)',
    new RegExp(`${PAROLA_HATALI_YANIT.kod}:`).test(
      oku('frontend/ortak/lib/kimlik-hata-metinleri.ts'),
    ),
  );

  // ── A14: YAKALAYICI GEVSETILMEDI ──────────────────────────────────────
  // ⚠ NEGATIF: bu iki uc `KIMLIK_UCLARI`na EKLENMIS olsaydi oradaki GERCEK
  // oturum dusmesi (suresi dolmus token) sessizlesirdi. Davranis kilidi
  // frontend/ortak/lib/api-401-kapsami.test.ts G3'te; burada LISTE olculur.
  const apiKodu = kodu(oku('frontend/ortak/lib/api.ts'));
  const liste = apiKodu.slice(
    apiKodu.indexOf('const KIMLIK_UCLARI'),
    apiKodu.indexOf('];', apiKodu.indexOf('const KIMLIK_UCLARI')),
  );
  check(
    'A14 (negatif) change-password / hesabimi-kapat KIMLIK_UCLARI listesine EKLENMEDI',
    liste.length > 0 &&
      !liste.includes('change-password') &&
      !liste.includes('hesabimi-kapat'),
    `liste=${liste.replace(/\s+/g, ' ')}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · UZUNLUK KURALI TEK KAYNAK  (t.15)
// ═══════════════════════════════════════════════════════════════════════════
async function bolumB(): Promise<void> {
  console.log('\n-- B - PAROLA UZUNLUGU TEK KAYNAK --');

  // ── B1-B4: GERCEK DOGRULAMA DAVRANISI (metadata degil, `validate()`) ───
  const kayitHatalari = async (parola: string) => {
    const hatalar = await validate(
      plainToInstance(RegisterDto, {
        email: 'yeni@firma.com',
        password: parola,
        sozlesmeOnayi: true,
      }),
    );
    return hatalar.filter((h) => h.property === 'password');
  };

  const kisa = await kayitHatalari('a'.repeat(PAROLA_MIN - 1));
  check(
    `B1 * /register ${PAROLA_MIN - 1} karakterli parolayi REDDEDIYOR`,
    kisa.length === 1,
    `hata sayisi=${kisa.length}`,
  );
  check(
    'B2 red mesaji ORTAK sabitten geliyor (ciplak varsayilan class-validator metni degil)',
    Object.values(kisa[0]?.constraints ?? {}).includes(PAROLA_MESAJI),
    `okunan=${JSON.stringify(kisa[0]?.constraints)}`,
  );
  const tam = await kayitHatalari('a'.repeat(PAROLA_MIN));
  check(
    `B3 (olcut) tam ${PAROLA_MIN} karakter GECIYOR (kapi "her seyi reddet" degil)`,
    tam.length === 0,
    `hata=${JSON.stringify(tam.map((h) => h.constraints))}`,
  );
  // ⚠ ESKI HATANIN KENDISI: 6 ve 7 karakter kabul ediliyordu.
  const alti = await kayitHatalari('a'.repeat(6));
  check(
    'B4 * 6 karakter ARTIK REDDEDILIYOR (eski MinLength(6) geri gelirse kirmizi)',
    alti.length === 1,
    `hata sayisi=${alti.length}`,
  );

  // ── B5: DIGER PAROLA BELIRLEME UCLARI AYNI SAYIYI ISTIYOR ─────────────
  const alanKisaMi = async (Dto: any, govde: Record<string, unknown>, alan: string) => {
    const hatalar = await validate(plainToInstance(Dto, govde));
    return hatalar.some((h) => h.property === alan);
  };
  const kisaParola = 'a'.repeat(PAROLA_MIN - 1);
  const uzunToken = 't'.repeat(40);
  const hepsiKisayiReddetti =
    (await alanKisaMi(
      ParolaDegistirDto,
      { mevcutParola: 'x', yeniParola: kisaParola },
      'yeniParola',
    )) &&
    (await alanKisaMi(
      ParolaSifirlaDto,
      { token: uzunToken, yeniParola: kisaParola },
      'yeniParola',
    )) &&
    (await alanKisaMi(
      DavetKabulDto,
      { token: uzunToken, parola: kisaParola, sozlesmeOnayi: true },
      'parola',
    ));
  check(
    `B5 * degistirme + sifirlama + davet de ${PAROLA_MIN - 1} karakteri reddediyor (tek politika)`,
    hepsiKisayiReddetti,
  );

  // ── B6: SUNUCUDA CIPLAK SAYI KALMADI ──────────────────────────────────
  const kayitDto = kodu(oku('backend/src/altyapi/auth/dto/register.dto.ts'));
  check(
    'B6 register.dto.ts MinLength(PAROLA_MIN) okuyor - ciplak sayi YOK',
    /MinLength\(\s*PAROLA_MIN/.test(kayitDto) && !/MinLength\(\s*\d/.test(kayitDto),
    kayitDto.match(/MinLength\([^)]*\)/g)?.join(' | ') ?? 'MinLength bulunamadi',
  );

  // ── B7-B10: ON YUZ KOPYASI SAPMADI ────────────────────────────────────
  // ⚠ AYRI NPM PAKETI: import edilemez, METIN olarak okunur. Kapinin tum
  // amaci budur - kopya sapinca CI kirmizi olsun.
  const onYuzKurali = oku('frontend/ortak/lib/parola-kurali.ts');
  const onYuzSayi = Number(
    onYuzKurali.match(/export const PAROLA_MIN\s*=\s*(\d+)/)?.[1] ?? NaN,
  );
  check(
    `B7 * on yuz kopyasi sunucuyla AYNI sayiyi tasiyor (sunucu=${PAROLA_MIN})`,
    onYuzSayi === PAROLA_MIN,
    `on yuz=${onYuzSayi}`,
  );
  check(
    'B8 (olcut) sayi gercekten OKUNDU (regex bos donup sessizce gecmedi)',
    Number.isFinite(onYuzSayi),
    `okunan=${onYuzSayi}`,
  );

  // Parola BELIRLENEN ve DEGISTIRILEN ekranlar: hicbiri sayiyi elle yazmamali.
  // ⚠ 21.09 EKLENDI: `profile/page.tsx` once DISARIDAYDI (o an baska bir
  //   ajanin dosyasiydi) ve iki `minLength={8}` tasiyordu. Dosya devredilince
  //   sabite baglandi; disarida birakmak kapiyi kendi kusuruna kor birakirdi.
  const parolaEkranlari = [
    'frontend/app/register/page.tsx',
    'frontend/app/(protected)/profile/page.tsx',
    'frontend/app/reset-password/page.tsx',
    'frontend/app/davet-kabul/page.tsx',
  ];
  const elleYazanlar = parolaEkranlari.filter((yol) => {
    const s = kodu(oku(yol));
    return /minLength=\{\s*\d/.test(s) || /En az \d+ karakter/.test(s);
  });
  check(
    'B9 * kayit + hesabim + sifirlama + davet ekranlarinin HICBIRI sayiyi elle yazmiyor',
    elleYazanlar.length === 0,
    `elle yazan=${JSON.stringify(elleYazanlar)}`,
  );
  check(
    'B10 (olcut) dort ekran da ortak sabiti GERCEKTEN import ediyor (yalanci yesil yok)',
    parolaEkranlari.every((yol) =>
      /from '@\/ortak\/lib\/parola-kurali'/.test(kodu(oku(yol))),
    ),
    JSON.stringify(
      parolaEkranlari.filter(
        (yol) => !/from '@\/ortak\/lib\/parola-kurali'/.test(kodu(oku(yol))),
      ),
    ),
  );

  // ── B11: KULLANICININ GORDUGU CUMLE ───────────────────────────────────
  // ⚠ B9 yalniz "elle yazilmis sayi YOK" der; ipucu cumlesi TAMAMEN
  // SILINSEYDI B9 yine yesil kalirdi (bos kume yalanci yesili). Bu assert
  // cumlenin HALA VAR oldugunu ve sayiyi sabitten urettigini olcer.
  // ⚠ Sayfa vitest'e/buraya import EDILEMEZ (`@/` takma adi yok — ayrintisi
  // telefon-menusu.test.ts bas yorumunda), bu yuzden metin katmani okunur.
  const ipucuSablonu = onYuzKurali.match(
    /export const PAROLA_IPUCU\s*=\s*`([^`]*)`/,
  )?.[1];
  const ipucuMetni = (ipucuSablonu ?? '').replace('${PAROLA_MIN}', String(PAROLA_MIN));
  check(
    `B11 * kayit ekranindaki ipucu cumlesi "${ipucuMetni}" (eski hali "En az 6 karakter." idi)`,
    ipucuMetni === `En az ${PAROLA_MIN} karakter.` &&
      /\{PAROLA_IPUCU\}/.test(kodu(oku('frontend/app/register/page.tsx'))),
    `sablon=${JSON.stringify(ipucuSablonu)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  C · HIZ SINIRI DURUYOR  (t.16 guvenlik siniri)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * ⚠ BU BLOK VAZGECILMEZ. t.16'nin duzeltmesi "yanlis parola kullaniciyi
 * ATMASIN" demek; "yanlis parola SERBEST olsun" DEMEK DEGIL. Oturum acik bir
 * saldirgan (calinmis token) `change-password` ucuna sinirsiz parola
 * deneyebilseydi mevcut parolayi kaba kuvvetle bulur ve hesabi KALICI olarak
 * devralirdi (parola degisince eski token'lar oluyor - `iat` kapisi). Sinir
 * GUARD katmanindadir, yani 401->400 degisimi onu etkilemez; ama bu cumle bir
 * VARSAYIMDIR ve burada OLCULUR.
 */
async function bolumC(): Promise<void> {
  console.log('\n-- C - HIZ SINIRI (gercek guard, gercek depo) --');

  const proto = AuthController.prototype as unknown as Record<string, unknown>;
  const limit = (m: string) =>
    Reflect.getMetadata('THROTTLER:LIMITdefault', proto[m] as object);
  const ttl = (m: string) =>
    Reflect.getMetadata('THROTTLER:TTLdefault', proto[m] as object);

  check('C1 change-password limiti 5', limit('changePassword') === 5, `okunan=${limit('changePassword')}`);
  check('C2 change-password penceresi 15 dk', ttl('changePassword') === 900_000, `okunan=${ttl('changePassword')}`);
  check('C3 hesabimi-kapat limiti 5', limit('hesabimiKapat') === 5, `okunan=${limit('hesabimiKapat')}`);
  check('C4 hesabimi-kapat penceresi 15 dk', ttl('hesabimiKapat') === 900_000, `okunan=${ttl('hesabimiKapat')}`);

  // ── DAVRANIS: sinir GERCEKTEN kesiyor mu? ─────────────────────────────
  const depo = new ThrottlerStorageService();
  const guard = new (ThrottlerGuard as any)(
    [{ name: 'default', ttl: 60_000, limit: 60 }],
    depo,
    new Reflector(),
  );
  await guard.onModuleInit();

  const baglam = (metot: string, ip: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        ips: [],
        headers: {},
        method: 'POST',
        url: `/api/auth/${metot}`,
      }),
      getResponse: () => ({ header: () => undefined, setHeader: () => undefined }),
    }),
    getHandler: () => proto[metot],
    getClass: () => AuthController,
  });

  /** Denemeleri kos; kacinci denemede sinira takildigini dondur (yoksa null). */
  const takildigiDeneme = async (metot: string, ip: string, kac: number) => {
    for (let i = 1; i <= kac; i++) {
      try {
        await guard.canActivate(baglam(metot, ip) as any);
      } catch (e) {
        if (e instanceof ThrottlerException) return i;
        throw e;
      }
    }
    return null;
  };

  const cp = await takildigiDeneme('changePassword', '10.0.0.1', 8);
  check(
    'C5 * change-password: art arda yanlis denemeler 6. da SINIRA TAKILIYOR (kaba kuvvet kapali)',
    cp === 6,
    `takildigi deneme=${cp}`,
  );
  const hk = await takildigiDeneme('hesabimiKapat', '10.0.0.2', 8);
  check('C6 * hesabimi-kapat: 6. denemede SINIRA TAKILIYOR', hk === 6, `takildigi deneme=${hk}`);

  // (OLCUT) — probe her seye "takildi" demiyor: sinirsiz bir uc 8 denemede
  // hic takilmamali. Bu assert olmasaydi C5/C6 bozuk bir probe ile de yesil
  // kalirdi.
  const me = await takildigiDeneme('me', '10.0.0.3', 8);
  check(
    'C7 (olcut) /auth/me 8 denemede TAKILMIYOR (probe her seye "takildi" demiyor)',
    me === null,
    `takildigi deneme=${me}`,
  );

  // (OLCUT) — sinir IP basina sayiyor: baska IP temiz kovayla basliyor.
  const baskaIp = await takildigiDeneme('changePassword', '10.0.0.9', 3);
  check(
    'C8 (olcut) sinir IP basina sayiyor (baska IP 3 denemede takilmiyor)',
    baskaIp === null,
    `takildigi deneme=${baskaIp}`,
  );

  depo.onApplicationShutdown?.();
}

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log('  PAROLA KAPISI - uzunluk tek kaynak (t.15) + yanlis parola (t.16)');
  console.log('='.repeat(72));

  await bolumA();
  await bolumB();
  await bolumC();

  console.log('\n' + '='.repeat(72));
  console.log(`  GECEN: ${passed}  ·  KALAN: ${failed}`);
  if (failed > 0) {
    console.log('\n  BASARISIZ:');
    for (const f of failures) console.log(`    x ${f}`);
  }
  console.log('='.repeat(72));
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error('KAPI COKTU:', e);
  process.exitCode = 1;
});
