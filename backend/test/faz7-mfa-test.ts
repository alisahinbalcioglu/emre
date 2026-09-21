/**
 * FAZ 7 · F2b — IKI ADIMLI GIRIS (BAGLAMA) KAPISI
 * (`npm run test:faz7-mfa`)
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ: her sey BELLEK ICI sahte Prisma ve GERCEK
 * sinif ornekleriyle olculur. Sahte Prisma `where`i GERCEKTEN uygular
 * (`OR`, `lt`, `gte`, `not`, `in`), `updateMany` kosulu saglamayan satiri
 * DEGISTIRMEZ ve `count` gercek sayiyi doner — bu paketin yarisi tam olarak
 * o kosullari olcuyor (yarisa dayanikli tuketim, rezervasyon, `mfaAcikAt:
 * null` kosullu yazimi). `$transaction` anlik goruntu alir ve FIRLATANI
 * GERI ALIR.
 *
 * ⚠ NE OLCULMEZ (durust sinir): gercek PostgreSQL kilidi, gercek eszamanlilik
 * (Node tek is parcacigi — `Promise.all` yalniz `await` noktalarinda
 * serpistirir), gercek SMTP, gercek tarayici.
 *
 * Mutant tablosu F2b raporunda (29 mutant). KIRMIZIYA DONERSE REGRESYON.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import { sign as jwtSign } from 'jsonwebtoken';
import { hashSync as bcryptHashSync } from 'bcrypt';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'faz7-mfa-testi-icin-yerel-anahtar-en-az-32-karakter';
// 32 bayt (base64) — `kimlik-sifreleme.ts` bicim + uzunluk denetiminden gecer.
const TEST_SIFRELEME_ANAHTARI = Buffer.alloc(32, 0x2b).toString('base64');
process.env.KIMLIK_SIFRELEME_KEY = TEST_SIFRELEME_ANAHTARI;

import {
  girisKarariSaf,
  kapatilabilirMi,
  mfaTemizlemeVerisi,
  mfaZorunluMu,
} from '../src/altyapi/auth/mfa/mfa-karari';
import { MfaServisi } from '../src/altyapi/auth/mfa/mfa.servisi';
import { MfaController } from '../src/altyapi/auth/mfa/mfa.controller';
import { meydanOkumaImzala } from '../src/altyapi/auth/mfa/meydan-okuma';
import {
  base32Coz,
  base32Kodla,
  hotp,
  totpAdim,
  totpSiriUret,
} from '../src/altyapi/auth/mfa/totp';
import { kurtarmaKoduNormalize } from '../src/altyapi/auth/mfa/kurtarma-kodu';
import { sifrele } from '../src/altyapi/auth/kimlik-sifreleme';
import { tokenOzetle } from '../src/altyapi/auth/token-ozet';
import { OturumServisi } from '../src/altyapi/auth/oturum.servisi';
import { AuthService } from '../src/altyapi/auth/auth.service';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
import { JwtStrategy } from '../src/altyapi/auth/strategies/jwt.strategy';
import { UyelikServisi } from '../src/ozellik/firma/uyelik.servisi';
import { FirmaServisi } from '../src/ozellik/firma/firma.servisi';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { ParolaServisi } from '../src/altyapi/auth/parola.servisi';
import { KOLTUK_DISI_IZINLI } from '../src/altyapi/auth/decorators/koltuk-disi-izinli.decorator';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';
import { FIRMA_ROL_KEY } from '../src/altyapi/auth/decorators/firma-rolu.decorator';
import { AdminController } from '../src/ozellik/kutuphane/admin/admin.controller';
import { FirmaController } from '../src/ozellik/firma/firma.controller';
import { sifirlamaPlaniUret } from '../scripts/mfa-sifirla';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, kanit?: string) {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`  ✗ ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
}

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorum satirlarini atar: kapi YORUMDA degil KODDA eslessin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const reflector = new Reflector();
const metadataOku = (anahtar: string, handler: any, cls: any): any =>
  reflector.getAllAndOverride<any>(anahtar, [handler, cls]) ?? null;
const metotlar = (cls: any): string[] =>
  Object.getOwnPropertyNames(cls.prototype).filter((m) => m !== 'constructor');

async function dene<T>(fn: () => Promise<T>): Promise<{ deger?: T; hata?: any }> {
  try {
    return { deger: await fn() };
  } catch (hata) {
    return { hata };
  }
}
const hataGovdesi = (e: any) => e?.response ?? e?.getResponse?.() ?? e;
const hataKodu = (e: any) => hataGovdesi(e)?.kod ?? null;
const hataDurumu = (e: any) => e?.status ?? e?.getStatus?.() ?? null;

// ═══════════════════════════════════════════════════════════════════════════
//  BELLEK ICI SAHTE PRISMA — `where`i GERCEKTEN uygular
//  (`faz7-ekip-test.ts`ten KOPYALANDI; gerekce orada yazili.)
// ═══════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

function karsilastir(a: any, b: any): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
function esitMi(a: any, b: any): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return karsilastir(a, b) === 0;
  return a === b;
}

function esles(satir: Satir, kosul: any): boolean {
  if (!kosul) return true;
  for (const [alan, deger] of Object.entries(kosul)) {
    if (alan === 'OR') {
      if (!(deger as any[]).some((k) => esles(satir, k))) return false;
      continue;
    }
    if (alan === 'AND') {
      if (!(deger as any[]).every((k) => esles(satir, k))) return false;
      continue;
    }
    if (alan === 'NOT') {
      if (esles(satir, deger)) return false;
      continue;
    }
    const mevcut = satir[alan];
    if (deger !== null && typeof deger === 'object' && !(deger instanceof Date)) {
      const OPERATORLER = ['lt', 'lte', 'gt', 'gte', 'not', 'in', 'equals', 'mode'];
      const operatorVar = Object.keys(deger as any).some((k) => OPERATORLER.includes(k));
      if (!operatorVar && mevcut !== null && typeof mevcut === 'object' && !(mevcut instanceof Date)) {
        if (!esles(mevcut, deger)) return false;
        continue;
      }
      const duyarsiz = (deger as any).mode === 'insensitive';
      const kucult = (v: any) => (duyarsiz && typeof v === 'string' ? v.toLowerCase() : v);
      for (const [op, ham] of Object.entries(deger as Record<string, any>)) {
        if (op === 'mode') continue;
        const hedef = kucult(ham);
        const mevcutK = kucult(mevcut);
        if (op === 'equals') { if (!esitMi(mevcutK, hedef)) return false; continue; }
        if (op === 'in') {
          if (!(ham as any[]).some((h) => esitMi(mevcutK, kucult(h)))) return false;
          continue;
        }
        if (op === 'lt') { if (!(karsilastir(mevcut, hedef) < 0)) return false; }
        else if (op === 'lte') { if (!(karsilastir(mevcut, hedef) <= 0)) return false; }
        else if (op === 'gt') { if (!(karsilastir(mevcut, hedef) > 0)) return false; }
        else if (op === 'gte') { if (!(karsilastir(mevcut, hedef) >= 0)) return false; }
        else if (op === 'not') { if (esitMi(mevcutK, hedef)) return false; }
        else throw new Error(`SAHTE PRISMA: bilinmeyen operator "${op}" (alan ${alan})`);
      }
      continue;
    }
    if (!esitMi(mevcut, deger)) return false;
  }
  return true;
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...satirlar].sort((a, b) => {
    for (const k of kurallar) {
      const [alan, yon] = Object.entries(k)[0] as [string, string];
      const f = karsilastir(a[alan], b[alan]);
      if (f !== 0) return yon === 'desc' ? -f : f;
    }
    return 0;
  });
}

type Iz = { ham: string[]; cagrilar: { tablo: string; islem: string; arg: any }[] };

function tabloYap(ad: string, satirlar: Satir[], iz: Iz) {
  const kaydet = (islem: string, arg: any) => iz.cagrilar.push({ tablo: ad, islem, arg });
  const bul = (w: any) => satirlar.filter((s) => esles(s, w));
  return {
    findUnique: async (a: any) => { kaydet('findUnique', a); return bul(a.where)[0] ?? null; },
    findFirst: async (a: any) => { kaydet('findFirst', a); return sirala(bul(a.where), a.orderBy)[0] ?? null; },
    findMany: async (a: any = {}) => { kaydet('findMany', a); return sirala(bul(a.where), a.orderBy); },
    count: async (a: any = {}) => { kaydet('count', a); return bul(a.where).length; },
    create: async (a: any) => {
      kaydet('create', a);
      const yeni: Satir = {
        id: a.data?.id ?? `${ad}-${satirlar.length + 1}`,
        createdAt: new Date(), olusturuldu: new Date(), ...a.data,
      };
      satirlar.push(yeni);
      return yeni;
    },
    createMany: async (a: any) => {
      kaydet('createMany', a);
      const veri: Satir[] = Array.isArray(a.data) ? a.data : [a.data];
      veri.forEach((d, i) => satirlar.push({
        id: d.id ?? `${ad}-${satirlar.length + i + 1}`,
        olusturuldu: new Date(), kullanildiAt: null, ...d,
      }));
      return { count: veri.length };
    },
    update: async (a: any) => {
      kaydet('update', a);
      const s = bul(a.where)[0];
      if (!s) throw new Error(`SAHTE PRISMA: ${ad}.update — satir yok`);
      uygula(s, a.data);
      return s;
    },
    updateMany: async (a: any) => {
      kaydet('updateMany', a);
      const hedefler = bul(a.where);
      hedefler.forEach((s) => uygula(s, a.data));
      return { count: hedefler.length };
    },
    delete: async (a: any) => {
      kaydet('delete', a);
      const i = satirlar.findIndex((s) => esles(s, a.where));
      if (i < 0) throw new Error(`SAHTE PRISMA: ${ad}.delete — satir yok`);
      return satirlar.splice(i, 1)[0];
    },
    deleteMany: async (a: any = {}) => {
      kaydet('deleteMany', a);
      const kalan = satirlar.filter((s) => !esles(s, a.where));
      const n = satirlar.length - kalan.length;
      satirlar.length = 0;
      satirlar.push(...kalan);
      return { count: n };
    },
  };
}

function uygula(satir: Satir, data: any) {
  for (const [alan, deger] of Object.entries(data ?? {})) {
    if (deger !== null && typeof deger === 'object' && !(deger instanceof Date) && 'increment' in (deger as any)) {
      satir[alan] = (satir[alan] ?? 0) + (deger as any).increment;
      continue;
    }
    satir[alan] = deger;
  }
}

function canlandir(s: Satir): Satir {
  const yeni: Satir = {};
  for (const [k, v] of Object.entries(s)) {
    yeni[k] =
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? new Date(v) : v;
  }
  return yeni;
}

function sahtePrisma(veri: Record<string, Satir[]>) {
  const iz: Iz = { ham: [], cagrilar: [] };
  const p: any = {
    _iz: iz,
    _veri: veri,
    $queryRaw: async (parcalar: TemplateStringsArray, ...degerler: any[]) => {
      const metin = parcalar.reduce((a, s, i) => a + s + (i < degerler.length ? String(degerler[i]) : ''), '');
      iz.ham.push(metin);
      iz.cagrilar.push({ tablo: '$queryRaw', islem: 'raw', arg: metin });
      return [{ kilit: 'ok' }];
    },
    $transaction: async (fn: any) => {
      // ⚠ Dizi bicimi de desteklenir (`parola.servisi.ts` onu kullanir).
      if (Array.isArray(fn)) return Promise.all(fn);
      const yedek = JSON.parse(JSON.stringify(veri));
      try {
        return await fn(vekil);
      } catch (e) {
        for (const [ad, satirlar] of Object.entries(veri)) {
          satirlar.length = 0;
          satirlar.push(...(yedek[ad] ?? []).map(canlandir));
        }
        throw e;
      }
    },
  };
  for (const [ad, satirlar] of Object.entries(veri)) p[ad] = tabloYap(ad, satirlar, iz);
  // ⚠ FAZ 7 F3b — BILINMEYEN TABLO BOS DONER, `undefined` DEGIL.
  // Gerekce: `login`, `/auth/me`, ayrilma akisi ve parola sifirlama artik
  // F3b tablolarini da okuyor (`dogrulanmisAlanAdi`, `kullaniciDisKimlik`,
  // `firmaKimlikSaglayici`). Her fixture'a elle eklemek testi konusundan
  // uzaklastirirdi. Bos tablo "veri yok" demektir ve sessiz bir yalan
  // uretmez — sorgu YINE KAYDEDILIR, izden okunabilir.
  // ⚠ VEKIL `$transaction`a da verilir: `tx` ham nesne olsaydi islem
  // ICINDE bilinmeyen tablo yine `undefined` donerdi.
  const vekil: any = new Proxy(p, {
    get(hedef: any, anahtar: string | symbol) {
      if (typeof anahtar !== 'string' || anahtar in hedef) return hedef[anahtar as any];
      if (anahtar.startsWith('$') || anahtar.startsWith('_')) return undefined;
      veri[anahtar] = [];
      hedef[anahtar] = tabloYap(anahtar, veri[anahtar], iz);
      return hedef[anahtar];
    },
  });
  return vekil;
}


// ═══════════════════════════════════════════════════════════════════════════
//  ORTAK FIXTURE
// ═══════════════════════════════════════════════════════════════════════════
const jwtSahte = {
  sign: (payload: any, secret: any) => jwtSign(payload, secret.secret, { expiresIn: '7d' }),
} as any;

const epostaSahte = () => {
  const giden: { kime: string; konu: string }[] = [];
  return {
    giden,
    servis: { gonder: async (t: any) => { giden.push({ kime: t.kime, konu: t.konu }); } } as any,
  };
};

const t1 = new Date('2026-01-01T00:00:00Z');

/** Duz sir (base32) → DB'de duran SIFRELI deger. */
const sirle = (b32: string, userId: string) => sifrele(b32, `mfa:${userId}`);
/** O anki gecerli 6 haneli kod. */
const gecerliKod = (b32: string, simdiMs = Date.now()) =>
  hotp(base32Coz(b32), totpAdim(simdiMs));

function kullanici(ek: Satir): Satir {
  return {
    id: 'U1', email: 'u1@firma.test', password: bcryptHashSync('dogru-parola', 4),
    role: 'user', status: 'active', tier: 'core', deletedAt: null,
    passwordChangedAt: null, firmaId: 'F1', firmaRol: 'uye', createdAt: t1,
    ad: null, soyad: null, emailVerified: true,
    mfaSirriSifreli: null, mfaAcikAt: null, mfaKaynagi: null, mfaSonAdim: null,
    mfaBekleyenSirSifreli: null, mfaBekleyenAt: null, mfaHataSayaci: 0, mfaKilitliAt: null,
    ...ek,
  };
}

function firma(ek: Satir = {}): Satir {
  return { id: 'F1', ad: 'Firma', mfaZorunlu: false, createdAt: t1, ...ek };
}

/**
 * ORTAK TABLO KUMESI — her fixture AYNI tablolari tasir.
 *
 * ⚠ Gerekce: `oturumYaniti` → `firmaPaketSeviyesi` → `prisma.abonelik`
 * okuyor. Eksik tablo, sahte Prisma"da anlasilmaz bir `undefined` hatasi
 * uretir ve testin NEYI olctugunu gizler.
 */
function db(ek: Record<string, Satir[]> = {}) {
  const veri: Record<string, Satir[]> = {
    user: [], firma: [], mfaKurtarmaKodu: [], abonelik: [],
    firmaDavet: [], firmaOlayi: [], yoneticiOlayi: [], userSubscription: [],
    passwordResetToken: [],
    ...ek,
  };
  const p = sahtePrisma(veri);
  // ⚠ BILINMEYEN TABLO BOS DONER, `undefined` DEGIL. KVKK disa aktarimi
  // yirmiye yakin tablo okuyor; her birini elle listelemek fixture'i
  // testin konusundan uzaklastirirdi. Bos tablo "veri yok" demektir ve
  // sessiz bir yalan uretmez (sorgu yine KAYDEDILIR, izden okunabilir).
  return new Proxy(p, {
    get(hedef: any, anahtar: string | symbol) {
      if (typeof anahtar !== 'string' || anahtar in hedef) return hedef[anahtar as any];
      if (anahtar.startsWith('$') || anahtar.startsWith('_')) return undefined;
      veri[anahtar] = [];
      hedef[anahtar] = tabloYap(anahtar, veri[anahtar], hedef._iz);
      return hedef[anahtar];
    },
  });
}

/** Tek kisilik dunya + MFA servisi. */
function dunya(kullanicilar: Satir[], firmalar: Satir[] = [firma()], kodlar: Satir[] = []) {
  const p = db({ user: kullanicilar, firma: firmalar, mfaKurtarmaKodu: kodlar });
  const e = epostaSahte();
  const oturum = new OturumServisi(p, jwtSahte);
  const mfa = new MfaServisi(p, oturum, e.servis);
  return { p, e, oturum, mfa };
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOLUMLER
// ═══════════════════════════════════════════════════════════════════════════
/** AuthService — sahte erisim/dogrulama ile. */
function authKur(p: any) {
  const oturum = new OturumServisi(p, jwtSahte);
  return new AuthService(
    p, jwtSahte,
    { karar: async () => ({}) } as any,
    { dogrulamaGonderSessizce: async () => undefined } as any,
    oturum,
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  M1-M4 · GIRIS DALI: TOKEN MI, KOD MU, KURULUM MU
// ───────────────────────────────────────────────────────────────────────────
async function bolumGiris() {
  console.log('── M1-M4 · GIRIS DALI ──');
  const b32 = base32Kodla(totpSiriUret());

  // M1 — MFA ACIK kullanici parolayla girdi.
  const p1 = db({
    user: [kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1') })],
    firma: [firma()], mfaKurtarmaKodu: [],
  });
  const y1: any = await authKur(p1).login({ email: 'u1@firma.test', password: 'dogru-parola' } as any);
  check('M1 ⭐ MFA acik → `mfaGerekli` ve meydan okuma DIZGE',
    y1.mfaGerekli === true && typeof y1.meydanOkuma === 'string' && y1.meydanOkuma.length > 20,
    JSON.stringify(Object.keys(y1)));
  check('M1 ⭐ yanitta `token` ANAHTARI YOK (on yuz "undefined" yazamasin)',
    ('token' in y1) === false, JSON.stringify(Object.keys(y1)));
  check('M1 yontemler = ["kod","kurtarma"]',
    Array.isArray(y1.yontemler) && y1.yontemler.join(',') === 'kod,kurtarma');

  // M2 — YONETICI, MFA kapali.
  const p2 = db({
    user: [kullanici({ role: 'admin', firmaRol: 'sahip' })], firma: [firma()], mfaKurtarmaKodu: [],
  });
  const y2: any = await authKur(p2).login({ email: 'u1@firma.test', password: 'dogru-parola' } as any);
  check('M2 ⭐ yonetici MFA kapali → `mfaKurulumGerekli`, neden "yonetici", token YOK',
    y2.mfaKurulumGerekli === true && y2.neden === 'yonetici' && ('token' in y2) === false,
    JSON.stringify(y2));

  // M3 — FIRMA zorunlulugu.
  const p3 = db({
    user: [kullanici({})], firma: [firma({ mfaZorunlu: true })], mfaKurtarmaKodu: [],
  });
  const y3: any = await authKur(p3).login({ email: 'u1@firma.test', password: 'dogru-parola' } as any);
  check('M3 ⭐ firma `mfaZorunlu` + uye MFA kapali → neden "firma", token YOK',
    y3.mfaKurulumGerekli === true && y3.neden === 'firma' && ('token' in y3) === false,
    JSON.stringify(y3));

  // M4 — normal kullanici.
  const p4 = db({ user: [kullanici({})], firma: [firma()] });
  const y4: any = await authKur(p4).login({ email: 'u1@firma.test', password: 'dogru-parola' } as any);
  check('M4 normal kullanici → { token, user } (bugunku sekil KORUNDU)',
    typeof y4.token === 'string' && y4.user?.id === 'U1' && typeof y4.user?.tier === 'string',
    JSON.stringify(Object.keys(y4)));

  // M3c — kayit normal.
  const p5 = db();
  const y5: any = await authKur(p5).register({
    email: 'yeni@firma.test', password: 'x1234567', sozlesmeOnayi: true,
  } as any);
  check('M3c `register` normal → token (kayit dali kirilmadi)',
    typeof y5.token === 'string' && y5.user?.email === 'yeni@firma.test',
    JSON.stringify(Object.keys(y5)));

  // M3b (R1-O1) — DAVET KABULU firma zorunlulugunu UYGULAR.
  const davetSonu = new Date(Date.now() + 3 * 86_400_000);
  const pD = db({
    user: [kullanici({ id: 'S1', email: 'sahip@firma.test', firmaRol: 'sahip', mfaAcikAt: t1, mfaKaynagi: 'kisisel' })],
    firma: [firma({ mfaZorunlu: true })],
    firmaDavet: [{
      id: 'D1', firmaId: 'F1', eposta: 'davetli@firma.test',
      tokenHash: tokenOzetle('ham-token'),
      sonGecerlilik: davetSonu, kabulAt: null, iptalAt: null, kabulEdenId: null,
      davetEdenId: 'S1', davetEdenEposta: 'sahip@firma.test', gonderimSayisi: 1,
      sonGonderimAt: t1, olusturuldu: t1,
    }],
    firmaOlayi: [], mfaKurtarmaKodu: [], abonelik: [],
  });
  const uyelik = new UyelikServisi(
    pD,
    { gonder: async () => undefined, gonderKritik: async () => undefined } as any,
    new OturumServisi(pD, jwtSahte),
    { iptalEt: async () => undefined } as any,
  );
  // Koltuk kapisini gecmek icin hak sinirsiz sayilsin (bu testin konusu degil).
  (uyelik as any).koltukKapisi = async () => undefined;
  const yD: any = await dene(async () =>
    (uyelik as any).davetKabul({ token: 'ham-token', parola: 'x1234567', sozlesmeOnayi: true }),
  );
  const yDD = yD.deger ?? {};
  check('M3b ⭐ (R1-O1) davet kabulu → `mfaKurulumGerekli`, `token` anahtari YOK',
    yDD.mfaKurulumGerekli === true && ('token' in yDD) === false,
    `${yD.hata ? String(yD.hata?.message ?? yD.hata) : JSON.stringify(Object.keys(yDD))}`);
  check('M3b-OLCUT kullanici YINE DE olusturuldu (karar committen SONRA)',
    pD._veri.user.some((u: Satir) => u.email === 'davetli@firma.test'),
    JSON.stringify(pD._veri.user.map((u: Satir) => u.email)));
}

// ───────────────────────────────────────────────────────────────────────────
//  M21 · SAF KARAR TABLOSU (R1/E-4 `mfaKaynagi`)
// ───────────────────────────────────────────────────────────────────────────
function bolumSafKarar() {
  console.log('\n── M21 · girisKarariSaf ──');
  const acik = (kaynak: string | null) => ({ role: 'user', mfaAcikAt: t1, mfaKaynagi: kaynak });
  const kapali = { role: 'user', mfaAcikAt: null, mfaKaynagi: null };
  const zorunlu = { mfaZorunlu: true };
  const serbest = { mfaZorunlu: false };

  check('M21 kurumsal + firma zorunlu + MFA kapali → oturum',
    girisKarariSaf({ user: kapali, firma: zorunlu, yol: 'kurumsal' }).tip === 'oturum');
  check('M21 ⭐ kurumsal + MFA acik + kaynak "kisisel" → mfa',
    girisKarariSaf({ user: acik('kisisel'), firma: serbest, yol: 'kurumsal' }).tip === 'mfa');
  check('M21 ⭐ kurumsal + MFA acik + kaynak "zorunlu-firma" → oturum',
    girisKarariSaf({ user: acik('zorunlu-firma'), firma: zorunlu, yol: 'kurumsal' }).tip === 'oturum');
  check('M21 kurumsal + kaynak "zorunlu-yonetici" → oturum',
    girisKarariSaf({ user: acik('zorunlu-yonetici'), firma: serbest, yol: 'kurumsal' }).tip === 'oturum');
  check('M21 parola + MFA acik + kaynak "zorunlu-firma" → mfa',
    girisKarariSaf({ user: acik('zorunlu-firma'), firma: zorunlu, yol: 'parola' }).tip === 'mfa');
  check('M21 parola + firma zorunlu + MFA kapali → mfa-kurulum (neden firma)',
    girisKarariSaf({ user: kapali, firma: zorunlu, yol: 'parola' }).tip === 'mfa-kurulum' &&
    girisKarariSaf({ user: kapali, firma: zorunlu, yol: 'parola' }).neden === 'firma');
  check('M21-OLCUT parola + serbest + MFA kapali → oturum (kural her seye "mfa" demiyor)',
    girisKarariSaf({ user: kapali, firma: serbest, yol: 'parola' }).tip === 'oturum');
  check('M21 `mfaZorunluMu` yonetici dali firmadan BAGIMSIZ',
    mfaZorunluMu({ role: 'admin' }, null).neden === 'yonetici' &&
    mfaZorunluMu({ role: 'user' }, null).zorunlu === false);
  check('M21 `mfaTemizlemeVerisi` dokuz alani da temizler + damga atar',
    (() => {
      const v: any = mfaTemizlemeVerisi(new Date(5));
      return v.mfaSirriSifreli === null && v.mfaAcikAt === null && v.mfaKaynagi === null &&
        v.mfaSonAdim === null && v.mfaBekleyenSirSifreli === null && v.mfaBekleyenAt === null &&
        v.mfaHataSayaci === 0 && v.mfaKilitliAt === null && v.passwordChangedAt instanceof Date;
    })());
}

// ───────────────────────────────────────────────────────────────────────────
//  M5-M7 · MEYDAN OKUMA OTURUM DEGILDIR + STRATEJI
// ───────────────────────────────────────────────────────────────────────────
async function bolumStrateji() {
  console.log('\n── M5-M7 · STRATEJI ──');
  const p = db({
    user: [kullanici({}), kullanici({ id: 'A1', email: 'admin@firma.test', role: 'admin' })],
    firma: [firma()],
  });
  const strateji = new JwtStrategy(p);

  // M5 BAGLANTI — gercek passport akisi.
  const meydanOkuma = meydanOkumaImzala({ userId: 'U1', amac: 'mfa-dogrula', yol: 'parola' });
  const oncekiCagri = p._iz.cagrilar.length;
  const sonuc = await new Promise<string>((coz) => {
    const s: any = strateji;
    s.success = () => coz('success');
    s.fail = () => coz('fail');
    s.error = () => coz('error');
    s.redirect = () => coz('redirect');
    s.authenticate({ headers: { authorization: `Bearer ${meydanOkuma}` } }, {});
  });
  const yeniCagrilar = p._iz.cagrilar.slice(oncekiCagri);
  check('M5 ⭐ BAGLANTI: meydan okuma token"i passport"ta FAIL (imza asamasi)',
    sonuc === 'fail', sonuc);
  check('M5 ⭐ BAGLANTI: `user.findUnique` HIC cagrilmadi (validate"e ulasmadi)',
    yeniCagrilar.every((c) => c.islem !== 'findUnique'),
    JSON.stringify(yeniCagrilar.map((c) => `${c.tablo}.${c.islem}`)));

  // OLCUT: ayni duzenek GERCEK erisim token"ini KABUL eder.
  const oturum = new OturumServisi(p, jwtSahte);
  const gercek: any = await oturum.oturumYaniti(
    p._veri.user[0] as any, { authAt: Math.floor(Date.now() / 1000) },
  );
  const sonuc2 = await new Promise<string>((coz) => {
    const s: any = new JwtStrategy(p);
    s.success = () => coz('success');
    s.fail = () => coz('fail');
    s.error = () => coz('error');
    s.authenticate({ headers: { authorization: `Bearer ${gercek.token}` } }, {});
  });
  check('M5-OLCUT ayni duzenekte GERCEK token → success (kapi calisiyor)',
    sonuc2 === 'success', sonuc2);

  // M6 — katman 2 (validate"in ilk satiri).
  const r1 = await dene(() => strateji.validate({ sub: 'U1', email: 'x', role: 'user', amac: 'mfa-dogrula' } as any));
  const r2 = await dene(() => strateji.validate({ sub: 'U1', email: 'x', role: 'user', aud: 'metaprice:mfa' } as any));
  const r3 = await dene(() => strateji.validate({ sub: 'U1', email: 'x', role: 'user', authAt: 123 } as any));
  check('M6 ⭐ `amac` tasiyan yuk → 401', hataDurumu(r1.hata) === 401, String(r1.hata));
  check('M6 ⭐ `aud` tasiyan yuk → 401', hataDurumu(r2.hata) === 401, String(r2.hata));
  check('M6-OLCUT `authAt` REDDEDILMEZ (bizim alanimiz)',
    !r3.hata && (r3.deger as any)?.id === 'U1', String(r3.hata));

  // M7 — yonetici MFA kapisi.
  const yA = await dene(() => strateji.validate({ sub: 'A1', email: 'admin@firma.test', role: 'admin' } as any));
  check('M7 ⭐ yonetici `mfaAcikAt` bos → 401 MFA_KURULUM_GEREKLI',
    hataDurumu(yA.hata) === 401 && hataKodu(yA.hata) === 'MFA_KURULUM_GEREKLI',
    JSON.stringify(hataGovdesi(yA.hata)));
  (p._veri.user.find((u: Satir) => u.id === 'A1') as Satir).mfaAcikAt = t1;
  const yA2 = await dene(() => strateji.validate({ sub: 'A1', email: 'admin@firma.test', role: 'admin' } as any));
  check('M7-OLCUT yonetici MFA acik → GECER', !yA2.hata && (yA2.deger as any)?.id === 'A1', String(yA2.hata));
  const yU = await dene(() => strateji.validate({ sub: 'U1', email: 'u1@firma.test', role: 'user' } as any));
  check('M7-OLCUT normal kullanici MFA kapali → GECER (kural yalniz yoneticide)',
    !yU.hata && (yU.deger as any)?.id === 'U1', String(yU.hata));
}
// ───────────────────────────────────────────────────────────────────────────
//  M8-M12 · DOGRULAMA, TEKRAR REDDI, KILIT, KURTARMA KODU
// ───────────────────────────────────────────────────────────────────────────
async function bolumDogrula() {
  console.log('\n── M8-M12 · DOGRULAMA ──');
  const b32 = base32Kodla(totpSiriUret());
  const mfaAcikKullanici = (ek: Satir = {}) =>
    kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1'), ...ek });
  const mo = () => meydanOkumaImzala({ userId: 'U1', amac: 'mfa-dogrula', yol: 'parola' });

  // M8 — dogru kod.
  {
    const d = dunya([mfaAcikKullanici()]);
    const d8 = await dene(() => d.mfa.dogrula(mo(), { kod: gecerliKod(b32) }));
    check('M8-FIXTURE dogrulama FIRLATMADAN dondu', !d8.hata, JSON.stringify(hataGovdesi(d8.hata)));
    const y: any = d8.deger ?? { token: 'x.eyJ9.y', user: {} };
    const simdiSn = Math.floor(Date.now() / 1000);
    const yuk = JSON.parse(Buffer.from(y.token.split('.')[1], 'base64url').toString());
    check('M8 ⭐ dogru kod → token', typeof y.token === 'string' && y.user?.id === 'U1');
    check('M8 token `authAt` ≈ simdi (ikinci adim BIRINCIL dogrulamadir)',
      typeof yuk.authAt === 'number' && Math.abs(yuk.authAt - simdiSn) <= 3, String(yuk.authAt));
    const tuketim = d.p._iz.cagrilar.filter(
      (c: any) => c.tablo === 'user' && c.islem === 'updateMany' && c.arg?.data?.mfaSonAdim !== undefined,
    );
    check('M8 ⭐ tuketim `updateMany.where.OR` `mfaSonAdim` kosulunu ICERIR (yaris)',
      // ⚠ NULL-GUVENLI: kosul silinirse `where.OR` undefined olur; duz
      // `.includes` COKERDI ve kirmizi ANLAMSIZLASIRDI (ozet basilmaz).
      tuketim.length === 1 &&
      JSON.stringify(tuketim[0]?.arg?.where?.OR ?? null).includes('mfaSonAdim'),
      JSON.stringify(tuketim.map((c: any) => c.arg?.where)));
    check('M8 dogru kodda sayac SIFIRLANIR',
      tuketim[0]?.arg?.data?.mfaHataSayaci === 0 && d.p._veri.user[0].mfaHataSayaci === 0,
      String(d.p._veri.user[0].mfaHataSayaci));
  }

  // M9 — ayni kod ikinci kez.
  {
    const d = dunya([mfaAcikKullanici()]);
    const kod = gecerliKod(b32);
    const ilk = await dene(() => d.mfa.dogrula(mo(), { kod }));
    check('M9-FIXTURE ilk kullanim BASARILI (ikinci ret anlamli olsun)', !ilk.hata,
      JSON.stringify(hataGovdesi(ilk.hata)));
    const r = await dene(() => d.mfa.dogrula(mo(), { kod }));
    check('M9 ⭐ ayni kod IKINCI kez → 400 MFA_KOD_HATALI (tekrar reddi)',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_KOD_HATALI',
      JSON.stringify(hataGovdesi(r.hata)));
  }

  // M10 — ayni kodla es zamanli iki istek.
  {
    const d = dunya([mfaAcikKullanici()]);
    const kod = gecerliKod(b32);
    const sonuclar = await Promise.all([
      dene(() => d.mfa.dogrula(mo(), { kod })),
      dene(() => d.mfa.dogrula(mo(), { kod })),
    ]);
    const basarili = sonuclar.filter((s) => !s.hata);
    check('M10 ⭐ ayni kodla `Promise.all` iki istek → TAM OLARAK BIR token',
      basarili.length === 1, JSON.stringify(sonuclar.map((s) => (s.hata ? hataKodu(s.hata) : 'token'))));
  }

  // M11 — yanlis kod, sayac, uyari, kilit.
  {
    const d = dunya([mfaAcikKullanici()]);
    const r = await dene(() => d.mfa.dogrula(mo(), { kod: '000000' }));
    check('M11 ⭐ yanlis kod → 400 (401 DEGIL — kullaniciyi disari atmaz)',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_KOD_HATALI',
      String(hataDurumu(r.hata)));
    check('M11 sayac 1 artti', d.p._veri.user[0].mfaHataSayaci === 1,
      String(d.p._veri.user[0].mfaHataSayaci));
    for (let i = 0; i < 4; i++) await dene(() => d.mfa.dogrula(mo(), { kod: '000000' }));
    const besinci = d.e.giden.filter((g) => g.konu.includes('hatalı doğrulama kodu'));
    check('M11 5. hatada uyari e-postasi TAM BIR KEZ',
      besinci.length === 1 && d.p._veri.user[0].mfaHataSayaci === 5,
      `${besinci.length} e-posta, sayac=${d.p._veri.user[0].mfaHataSayaci}`);
    for (let i = 0; i < 15; i++) await dene(() => d.mfa.dogrula(mo(), { kod: '000000' }));
    check('M11 ⭐ 20. hatada `mfaKilitliAt` DOLU',
      d.p._veri.user[0].mfaHataSayaci === 20 && d.p._veri.user[0].mfaKilitliAt instanceof Date,
      `sayac=${d.p._veri.user[0].mfaHataSayaci} kilit=${d.p._veri.user[0].mfaKilitliAt}`);
    const kilitli = await dene(() => d.mfa.dogrula(mo(), { kod: gecerliKod(b32) }));
    check('M11 ⭐ kilitliyken DOGRU kod bile → MFA_KILITLI',
      hataKodu(kilitli.hata) === 'MFA_KILITLI', JSON.stringify(hataGovdesi(kilitli.hata)));
    check('M11 kilit e-postasi TAM BIR KEZ',
      d.e.giden.filter((g) => g.konu.includes('geçici olarak kilitlendi')).length === 1,
      JSON.stringify(d.e.giden.map((g) => g.konu)));
  }

  // M11c — KILIT ALANI TEK BASINA BAGLAYICI (sayac dusuk olsa bile).
  // ⚠ Gerekce: kilidi yoneticinin ya da ileride baska bir yolun ELLE
  // yazmasi mumkundur; rezervasyon yalniz sayaca baksaydi kilitli bir hesap
  // deneme yapmaya devam ederdi.
  {
    const d = dunya([mfaAcikKullanici({ mfaHataSayaci: 0, mfaKilitliAt: new Date() })]);
    const r = await dene(() => d.mfa.dogrula(mo(), { kod: gecerliKod(b32) }));
    check('M11c ⭐ `mfaKilitliAt` DOLU ama sayac 0 → yine de MFA_KILITLI',
      hataKodu(r.hata) === 'MFA_KILITLI', JSON.stringify(hataGovdesi(r.hata)));
    check('M11c-OLCUT sayac ARTMADI (rezervasyon kosulu tutmadi)',
      d.p._veri.user[0].mfaHataSayaci === 0, String(d.p._veri.user[0].mfaHataSayaci));
  }

  // M11b (R1-O2) — 25 paralel yanlis deneme.
  {
    const d = dunya([mfaAcikKullanici()]);
    // Casus: `totpDogrula` kac kez KOSTU? (rezervasyon once gelmezse 25 olur)
    let hesapSayisi = 0;
    const gercekCoz = (d.mfa as any).kodAdiminiAl.bind(d.mfa);
    (d.mfa as any).kodAdiminiAl = async (...a: any[]) => { hesapSayisi++; return gercekCoz(...a); };
    const sonuclar = await Promise.all(
      Array.from({ length: 25 }, () => dene(() => d.mfa.dogrula(mo(), { kod: '000000' }))),
    );
    const kodlar = sonuclar.map((s) => hataKodu(s.hata));
    check('M11b ⭐ (R1-O2) 25 paralel yanlis kod → sayac TAM 20 (sinir asilmadi)',
      d.p._veri.user[0].mfaHataSayaci === 20, String(d.p._veri.user[0].mfaHataSayaci));
    check('M11b ⭐ TAM 5 istek MFA_KILITLI aldi (20 deneme + 5 ret)',
      kodlar.filter((k) => k === 'MFA_KILITLI').length === 5,
      JSON.stringify(kodlar.reduce((a: any, k) => ({ ...a, [String(k)]: (a[String(k)] ?? 0) + 1 }), {})));
    check('M11b ⭐ kod dogrulamasi EN FAZLA 20 kez kostu (rezervasyon ONCE)',
      hesapSayisi <= 20, String(hesapSayisi));
  }

  // M12 — kurtarma kodu.
  {
    const duz = 'ABCDEFGHJK';
    const kodlar = [
      { id: 'K1', userId: 'U1', kodOzeti: bcryptHashSync(kurtarmaKoduNormalize(duz), 4), kullanildiAt: null },
      { id: 'K2', userId: 'U1', kodOzeti: bcryptHashSync('ZZZZZZZZZZ', 4), kullanildiAt: null },
    ];
    const d = dunya([mfaAcikKullanici()], [firma()], kodlar);
    const k1 = await dene(() => d.mfa.dogrula(mo(), { kurtarmaKodu: 'abcde-fghjk' }));
    const y: any = k1.deger ?? {};
    check('M12 ⭐ kurtarma kodu BIR KEZ gecer (bicimlendirilmis yazim da)',
      typeof y.token === 'string' && d.p._veri.mfaKurtarmaKodu[0].kullanildiAt instanceof Date,
      JSON.stringify(hataGovdesi(k1.hata)));
    check('M12 kalan kod bilgisi e-postayla soylendi',
      d.e.giden.some((g) => g.konu.includes('kurtarma koduyla')), JSON.stringify(d.e.giden));
    const r = await dene(() => d.mfa.dogrula(mo(), { kurtarmaKodu: duz }));
    check('M12 ⭐ ayni kod IKINCI kez → 400 (kosullu tuketim)',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_KOD_HATALI',
      JSON.stringify(hataGovdesi(r.hata)));
    check('M12 kurtarma yolu da REZERVASYONDAN gecti (sayac arttı)',
      d.p._veri.user[0].mfaHataSayaci >= 1, String(d.p._veri.user[0].mfaHataSayaci));
    const bos = await dene(() => d.mfa.dogrula(mo(), {}));
    check('M12-OLCUT kod da kurtarma kodu da yoksa → 400 MFA_DOGRULAMA_YOK',
      hataKodu(bos.hata) === 'MFA_DOGRULAMA_YOK', JSON.stringify(hataGovdesi(bos.hata)));
  }

  // M12d — KOSULLU TUKETIM, ADAY LISTESI BAYAT OLSA BILE BAGLAYICI.
  // ⚠ NEDEN BOYLE OLCULUYOR: gercek yarista aday listesi (`findMany`) ile
  // tuketim (`updateMany`) arasinda baska bir istek kodu kullanmis olabilir.
  // O pencereyi DETERMINISTIK kurmak icin aday listesini BAYAT donduruyoruz:
  // satir DB'de KULLANILMIS, listede kullanilmamis gorunuyor. Kosullu
  // tuketim `count: 0` gormeli ve kod REDDEDILMELI. Duz `update` kabul ederdi.
  {
    const duz = 'ABCDEFGHJK';
    const kullanilmis = {
      id: 'K9', userId: 'U1',
      kodOzeti: bcryptHashSync(kurtarmaKoduNormalize(duz), 4),
      kullanildiAt: new Date(),
    };
    const d = dunya([mfaAcikKullanici()], [firma()], [kullanilmis]);
    d.p.mfaKurtarmaKodu.findMany = async () => [{ ...kullanilmis, kullanildiAt: null }];
    const r = await dene(() => d.mfa.dogrula(mo(), { kurtarmaKodu: duz }));
    check('M12d ⭐ aday BAYAT (DB"de kullanilmis) → 400, token YOK',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_KOD_HATALI' && !r.deger,
      JSON.stringify(hataGovdesi(r.hata)));
  }

  // M22 — sifreleme anahtari YOK.
  {
    const d = dunya([mfaAcikKullanici()], [firma()], [
      { id: 'K1', userId: 'U1', kodOzeti: bcryptHashSync('ABCDEFGHJK', 4), kullanildiAt: null },
    ]);
    delete process.env.KIMLIK_SIFRELEME_KEY;
    try {
      // MFA'si KAPALI ayri bir dunya: `kurulumBaslat` once `MFA_ZATEN_ACIK`
      // kapisindan gecer, anahtar kontrolu ondan SONRA gelir.
      const dk = dunya([kullanici({})]);
      const kurulum = await dene(() => dk.mfa.kurulumBaslat('U1', { parola: 'dogru-parola' }, null));
      check('M22 ⭐ anahtar yok → `kurulumBaslat` 503 KIMLIK_SIFRELEME_YOK',
        hataDurumu(kurulum.hata) === 503 && hataKodu(kurulum.hata) === 'KIMLIK_SIFRELEME_YOK',
        JSON.stringify(hataGovdesi(kurulum.hata)));
      const kodYolu = await dene(() => d.mfa.dogrula(mo(), { kod: '123456' }));
      check('M22 ⭐ anahtar yok → kod yolu 503',
        hataDurumu(kodYolu.hata) === 503, JSON.stringify(hataGovdesi(kodYolu.hata)));
      const kurtarma: any = await dene(() => d.mfa.dogrula(mo(), { kurtarmaKodu: 'ABCDEFGHJK' }));
      check('M22 ⭐ anahtar yokken KURTARMA KODU yolu CALISIR (kullanici kilitlenmez)',
        !kurtarma.hata && typeof kurtarma.deger?.token === 'string',
        JSON.stringify(hataGovdesi(kurtarma.hata)));
    } finally {
      process.env.KIMLIK_SIFRELEME_KEY = TEST_SIFRELEME_ANAHTARI;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  M13 · MEYDAN OKUMA KAPILARI
// ───────────────────────────────────────────────────────────────────────────
async function bolumMeydanOkuma() {
  console.log('\n── M13 · MEYDAN OKUMA ──');
  const b32 = base32Kodla(totpSiriUret());
  const acik = (ek: Satir = {}) =>
    kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1'), ...ek });

  // Suresi dolmus meydan okuma (elle, ayni anahtarla, gecmis `exp`).
  const { createHmac } = require('crypto') as typeof import('crypto');
  const anahtar = createHmac('sha256', process.env.JWT_SECRET as string)
    .update('metaprice/mfa-meydan-okuma/v1').digest();
  const simdiSn = Math.floor(Date.now() / 1000);
  const eski = jwtSign(
    { sub: 'U1', amac: 'mfa-dogrula', yol: 'parola', iat: simdiSn - 1000, exp: simdiSn - 500 },
    anahtar, { algorithm: 'HS256', audience: 'metaprice:mfa', issuer: 'metaprice-api' },
  );
  {
    const d = dunya([acik()]);
    const r = await dene(() => d.mfa.dogrula(eski, { kod: gecerliKod(b32) }));
    check('M13 suresi dolmus meydan okuma → 401 MEYDAN_OKUMA_GECERSIZ',
      hataDurumu(r.hata) === 401 && hataKodu(r.hata) === 'MEYDAN_OKUMA_GECERSIZ',
      JSON.stringify(hataGovdesi(r.hata)));
  }
  {
    const d = dunya([acik({ status: 'banned' })]);
    const r = await dene(() =>
      d.mfa.dogrula(meydanOkumaImzala({ userId: 'U1', amac: 'mfa-dogrula', yol: 'parola' }), { kod: gecerliKod(b32) }),
    );
    check('M13 ⭐ kullanici ARADA banlandi → 401 (hesapKapisi burada da kosar)',
      hataDurumu(r.hata) === 401, JSON.stringify(hataGovdesi(r.hata)));
  }
  {
    // `passwordChangedAt` meydan okumanin `iat`indan SONRA.
    const d = dunya([acik({ passwordChangedAt: new Date(Date.now() + 60_000) })]);
    const r = await dene(() =>
      d.mfa.dogrula(meydanOkumaImzala({ userId: 'U1', amac: 'mfa-dogrula', yol: 'parola' }), { kod: gecerliKod(b32) }),
    );
    check('M13 ⭐ `passwordChangedAt` meydan okumadan SONRA → 401',
      hataDurumu(r.hata) === 401 && hataKodu(r.hata) === 'MEYDAN_OKUMA_GECERSIZ',
      JSON.stringify(hataGovdesi(r.hata)));
  }
  {
    // Amac karismasi: `mfa-kurulum` token"i ile `dogrula`.
    const d = dunya([acik()]);
    const r = await dene(() =>
      d.mfa.dogrula(meydanOkumaImzala({ userId: 'U1', amac: 'mfa-kurulum', yol: 'parola' }), { kod: gecerliKod(b32) }),
    );
    check('M13 ⭐ `mfa-kurulum` amacli token ile `dogrula` → 401',
      hataDurumu(r.hata) === 401, JSON.stringify(hataGovdesi(r.hata)));
  }
}
// ───────────────────────────────────────────────────────────────────────────
//  M14 · ZORUNLU KURULUM (giris akisinin icinde)
// ───────────────────────────────────────────────────────────────────────────
async function bolumZorunluKurulum() {
  console.log('\n── M14 · ZORUNLU KURULUM ──');
  const kurulumMo = () => meydanOkumaImzala({ userId: 'U1', amac: 'mfa-kurulum', yol: 'parola' });
  /** Baslat → bekleyen sirri oku → gecerli kodu uret. */
  const bekleyeninKodu = (d: any) => {
    const sifreli = d.p._veri.user[0].mfaBekleyenSirSifreli as string;
    const { coz } = require('../src/altyapi/auth/kimlik-sifreleme');
    return gecerliKod(coz(sifreli, 'mfa:U1'));
  };

  // M14 — yonetici dali.
  {
    const d = dunya([kullanici({ role: 'admin', firmaRol: 'sahip' })]);
    // ⚠ SARMALANIR: firlatan bir mutant testi COKERTIRSE ozet basilmaz ve
    // kirmizi "yanlis neden" sayilir (bu depoda olculmus tuzak).
    const baslatSonuc = await dene(() => d.mfa.zorunluKurulumBaslat(kurulumMo()));
    check('M14-FIXTURE `baslat` FIRLATMADAN dondu', !baslatSonuc.hata,
      JSON.stringify(hataGovdesi(baslatSonuc.hata)));
    const baslat: any = baslatSonuc.deger ?? {};
    const satir = d.p._veri.user[0];
    check('M14 `baslat` → otpauth URI + elle anahtar',
      String(baslat.otpauthUri).startsWith('otpauth://totp/') && /^[A-Z2-7]{32}$/.test(baslat.elleAnahtar),
      JSON.stringify(baslat));
    check('M14 ⭐ bekleyen sir SIFRELI yazildi (duz base32 veride GECMIYOR)',
      typeof satir.mfaBekleyenSirSifreli === 'string' &&
      satir.mfaBekleyenSirSifreli.startsWith('v1.') &&
      !satir.mfaBekleyenSirSifreli.includes(baslat.elleAnahtar),
      String(satir.mfaBekleyenSirSifreli).slice(0, 24));
    check('M14-OLCUT `mfaSirriSifreli` HENUZ BOS (onaya kadar aktif sir degismez)',
      satir.mfaSirriSifreli === null);

    const yanlis = await dene(() => d.mfa.zorunluKurulumOnayla(kurulumMo(), '000000'));
    check('M14 yanlis kod → 400 MFA_KOD_HATALI',
      hataDurumu(yanlis.hata) === 400 && hataKodu(yanlis.hata) === 'MFA_KOD_HATALI',
      JSON.stringify(hataGovdesi(yanlis.hata)));

    const onaySonuc = await dene(() => d.mfa.zorunluKurulumOnayla(kurulumMo(), bekleyeninKodu(d)));
    check('M14-FIXTURE `onayla` FIRLATMADAN dondu', !onaySonuc.hata,
      JSON.stringify(hataGovdesi(onaySonuc.hata)));
    const y: any = onaySonuc.deger ?? {};
    check('M14 ⭐ onay → `mfaAcikAt` dolu, kaynak "zorunlu-yonetici", damga atildi, token var',
      satir.mfaAcikAt instanceof Date && satir.mfaKaynagi === 'zorunlu-yonetici' &&
      satir.passwordChangedAt instanceof Date && typeof y.token === 'string',
      JSON.stringify({ acik: satir.mfaAcikAt, kaynak: satir.mfaKaynagi }));
    check('M14 ⭐ 10 kurtarma kodu URETILDI ve `createMany` ile YAZILDI',
      Array.isArray(y.kurtarmaKodlari) && y.kurtarmaKodlari.length === 10 &&
      d.p._veri.mfaKurtarmaKodu.length === 10,
      `${y.kurtarmaKodlari?.length} / ${d.p._veri.mfaKurtarmaKodu.length}`);
    check('M14 kurtarma kodlari DB"de OZETLI (duz kod satirlarda YOK)',
      d.p._veri.mfaKurtarmaKodu.every((k: Satir) =>
        String(k.kodOzeti).startsWith('$2') && !y.kurtarmaKodlari.includes(k.kodOzeti)),
      JSON.stringify(d.p._veri.mfaKurtarmaKodu[0]));
    check('M14 bekleyen sir TEMIZLENDI',
      satir.mfaBekleyenSirSifreli === null && satir.mfaBekleyenAt === null);
  }

  // M14 — firma dali + 15 dk.
  {
    const d = dunya([kullanici({})], [firma({ mfaZorunlu: true })]);
    const f1 = await dene(() => d.mfa.zorunluKurulumBaslat(kurulumMo()));
    const kod = f1.hata ? '000000' : bekleyeninKodu(d);
    const f2 = await dene(() => d.mfa.zorunluKurulumOnayla(kurulumMo(), kod));
    check('M14-FIXTURE firma dali FIRLATMADAN kostu', !f1.hata && !f2.hata,
      JSON.stringify(hataGovdesi(f1.hata ?? f2.hata)));
    check('M14 ⭐ firma dali → kaynak "zorunlu-firma"',
      d.p._veri.user[0].mfaKaynagi === 'zorunlu-firma', String(d.p._veri.user[0].mfaKaynagi));
  }
  {
    const d = dunya([kullanici({})], [firma({ mfaZorunlu: true })]);
    const s1 = await dene(() => d.mfa.zorunluKurulumBaslat(kurulumMo()));
    check('M14-FIXTURE sure dolma senaryosu icin kurulum basladi', !s1.hata,
      JSON.stringify(hataGovdesi(s1.hata)));
    const kod = s1.hata ? '000000' : bekleyeninKodu(d);
    d.p._veri.user[0].mfaBekleyenAt = new Date(Date.now() - 16 * 60_000);
    const r = await dene(() => d.mfa.zorunluKurulumOnayla(kurulumMo(), kod));
    check('M14 ⭐ 15 dk sonra → 400 KURULUM_SURESI_DOLDU',
      hataKodu(r.hata) === 'KURULUM_SURESI_DOLDU', JSON.stringify(hataGovdesi(r.hata)));
  }

  // M14b (R1-Y2) — AMAC karismasi: `mfa-dogrula` token"i ile zorunlu kurulum.
  {
    const b32 = base32Kodla(totpSiriUret());
    const d = dunya([kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1') })]);
    const dogrulaMo = meydanOkumaImzala({ userId: 'U1', amac: 'mfa-dogrula', yol: 'parola' });
    const oncekiYazma = d.p._iz.cagrilar.filter(
      (c: any) => c.tablo === 'user' && ['update', 'updateMany'].includes(c.islem)).length;
    const r1 = await dene(() => d.mfa.zorunluKurulumBaslat(dogrulaMo));
    const r2 = await dene(() => d.mfa.zorunluKurulumOnayla(dogrulaMo, gecerliKod(b32)));
    const sonrakiYazma = d.p._iz.cagrilar.filter(
      (c: any) => c.tablo === 'user' && ['update', 'updateMany'].includes(c.islem)).length;
    check('M14b ⭐ (R1-Y2) `mfa-dogrula` token"i ile `baslat` → 401',
      hataDurumu(r1.hata) === 401, JSON.stringify(hataGovdesi(r1.hata)));
    check('M14b ⭐ (R1-Y2) `mfa-dogrula` token"i ile `onayla` → 401',
      hataDurumu(r2.hata) === 401, JSON.stringify(hataGovdesi(r2.hata)));
    check('M14b ⭐ HICBIR `user.update`/`updateMany` cagrilmadi',
      sonrakiYazma === oncekiYazma, `${oncekiYazma} → ${sonrakiYazma}`);
  }

  // M14c (R1-Y2) — MFA"si ACIK hesaba elle basilmis GECERLI `mfa-kurulum` token"i.
  {
    const b32 = base32Kodla(totpSiriUret());
    const eskiSir = sirle(b32, 'U1');
    const d = dunya([kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: eskiSir })]);
    const r1 = await dene(() => d.mfa.zorunluKurulumBaslat(kurulumMo()));
    check('M14c ⭐ `baslat` → 400 MFA_ZATEN_ACIK',
      hataDurumu(r1.hata) === 400 && hataKodu(r1.hata) === 'MFA_ZATEN_ACIK',
      JSON.stringify(hataGovdesi(r1.hata)));
    check('M14c ⭐ bekleyen sir YAZILMADI',
      d.p._veri.user[0].mfaBekleyenSirSifreli === null);

    // Onceden bekleyen sir varken `onayla`: kosullu yazim `count 0` gormeli.
    const yeniB32 = base32Kodla(totpSiriUret());
    d.p._veri.user[0].mfaBekleyenSirSifreli = sirle(yeniB32, 'U1');
    d.p._veri.user[0].mfaBekleyenAt = new Date();
    const r2 = await dene(() => d.mfa.zorunluKurulumOnayla(kurulumMo(), gecerliKod(yeniB32)));
    check('M14c ⭐ `onayla` → 400 MFA_ZATEN_ACIK (kosullu yazim `count !== 1`)',
      hataDurumu(r2.hata) === 400 && hataKodu(r2.hata) === 'MFA_ZATEN_ACIK',
      JSON.stringify(hataGovdesi(r2.hata)));
    check('M14c ⭐ `mfaSirriSifreli` DEGISMEDI (parolayi bilen sirri degistiremez)',
      d.p._veri.user[0].mfaSirriSifreli === eskiSir);
    check('M14c ⭐ kurtarma kodu YAZILMADI (transaction geri alindi)',
      d.p._veri.mfaKurtarmaKodu.length === 0, String(d.p._veri.mfaKurtarmaKodu.length));
  }

  // M14e — KOSULLU YAZIM TEK BASINA BAGLAYICI (erken kontrolden BAGIMSIZ).
  // ⚠ NEDEN AYRI: `zorunluKurulumOnayla` once `mfaAcikAt !== null` diye bakar;
  // o kontrol M14c'de olculuyor. AMA gercek yarista kullanici okunduktan
  // SONRA baska bir istek MFA'yi acabilir. Bu senaryoyu deterministik kurmak
  // icin servise BAYAT bir kullanici goruntusu (`mfaAcikAt: null`) veriyoruz;
  // DB'deki satir ACIK. Kosullu yazim (`where: { id, mfaAcikAt: null }`)
  // `count: 0` gormeli, transaction GERI ALINMALI.
  {
    const eskiB32 = base32Kodla(totpSiriUret());
    const yeniB32 = base32Kodla(totpSiriUret());
    const eskiSir = sirle(eskiB32, 'U1');
    const d = dunya([kullanici({
      mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: eskiSir,
      mfaBekleyenSirSifreli: sirle(yeniB32, 'U1'), mfaBekleyenAt: new Date(),
    })]);
    const bayatGoruntu = { ...d.p._veri.user[0], mfaAcikAt: null };
    const r = await dene(() =>
      (d.mfa as any).kurulumuTamamla(bayatGoruntu, gecerliKod(yeniB32), 'kisisel'),
    );
    check('M14e ⭐ bayat goruntuyle onay → 400 MFA_ZATEN_ACIK (kosullu yazim)',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_ZATEN_ACIK',
      JSON.stringify(hataGovdesi(r.hata)));
    check('M14e ⭐ `mfaSirriSifreli` DEGISMEDI ve kurtarma kodu YAZILMADI',
      d.p._veri.user[0].mfaSirriSifreli === eskiSir && d.p._veri.mfaKurtarmaKodu.length === 0,
      `${d.p._veri.user[0].mfaSirriSifreli === eskiSir} / ${d.p._veri.mfaKurtarmaKodu.length}`);
  }

  // M14d — zorunluluk arada KALKTI.
  {
    const d = dunya([kullanici({})], [firma({ mfaZorunlu: false })]);
    const r = await dene(() => d.mfa.zorunluKurulumBaslat(kurulumMo()));
    check('M14d ⭐ zorunluluk kalkmis → 400 MFA_ZORUNLU_DEGIL (`girisKarariSaf` YENIDEN kostu)',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_ZORUNLU_DEGIL',
      JSON.stringify(hataGovdesi(r.hata)));
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  M15-M17 · OTURUMLU KURULUM, KAPATMA, KOD YENILEME, SIRKET GIRISI
// ───────────────────────────────────────────────────────────────────────────
async function bolumOturumlu() {
  console.log('\n── M15-M17 · OTURUMLU UCLAR ──');
  const bekleyeninKodu = (d: any) => {
    const { coz } = require('../src/altyapi/auth/kimlik-sifreleme');
    return gecerliKod(coz(d.p._veri.user[0].mfaBekleyenSirSifreli, 'mfa:U1'));
  };
  const yuk = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

  // M15 — mutlu yol.
  {
    const d = dunya([kullanici({})]);
    const ESKI_AUTHAT = Math.floor(Date.now() / 1000) - 5000;
    const b1 = await dene(() => d.mfa.kurulumBaslat('U1', { parola: 'dogru-parola' }, ESKI_AUTHAT));
    check('M15-FIXTURE kurulum FIRLATMADAN basladi', !b1.hata, JSON.stringify(hataGovdesi(b1.hata)));
    const o1 = await dene(() => d.mfa.kurulumOnayla('U1', b1.hata ? '000000' : bekleyeninKodu(d), ESKI_AUTHAT));
    check('M15-FIXTURE onay FIRLATMADAN dondu', !o1.hata, JSON.stringify(hataGovdesi(o1.hata)));
    const y: any = o1.deger ?? { kurtarmaKodlari: [] };
    const satir = d.p._veri.user[0];
    check('M15 ⭐ dogru parola + dogru kod → token + 10 kod + kaynak "kisisel"',
      typeof y.token === 'string' && y.kurtarmaKodlari.length === 10 && satir.mfaKaynagi === 'kisisel',
      JSON.stringify({ kaynak: satir.mfaKaynagi, kod: y.kurtarmaKodlari?.length }));
    check('M15 `passwordChangedAt` DAMGALANDI (diger cihazlar duser)',
      satir.passwordChangedAt instanceof Date);
    check('M15 "acildi" bilgi e-postasi gitti',
      d.e.giden.some((g) => g.konu === 'İki adımlı giriş açıldı'), JSON.stringify(d.e.giden));

    // BAGLANTI: damgadan ONCE imzalanmis token `validate`te 401.
    const strateji = new JwtStrategy(d.p);
    satir.passwordChangedAt = new Date(Date.now() + 60_000);
    const r = await dene(() => strateji.validate({ sub: 'U1', email: 'u1@firma.test', role: 'user', iat: Math.floor(Date.now() / 1000) } as any));
    check('M15 ⭐ BAGLANTI: damgadan once imzalanmis token → 401',
      hataDurumu(r.hata) === 401, String(r.hata));
  }

  // M15b (R1-Y1) — yeniden kimlik dogrulamasi.
  {
    const d = dunya([kullanici({})]);
    const parolasiz = await dene(() => d.mfa.kurulumBaslat('U1', {}, null));
    check('M15b ⭐ parolasiz istek → 400 PAROLA_HATALI',
      hataDurumu(parolasiz.hata) === 400 && hataKodu(parolasiz.hata) === 'PAROLA_HATALI',
      JSON.stringify(hataGovdesi(parolasiz.hata)));
    const yanlis = await dene(() => d.mfa.kurulumBaslat('U1', { parola: 'yanlis' }, null));
    check('M15b ⭐ yanlis parola → 400 PAROLA_HATALI (401 DEGIL)',
      hataDurumu(yanlis.hata) === 400 && hataKodu(yanlis.hata) === 'PAROLA_HATALI',
      JSON.stringify(hataGovdesi(yanlis.hata)));
    check('M15b ⭐ bekleyen sir YAZILMADI (calinmis token tek basina MFA KURAMAZ)',
      d.p._veri.user[0].mfaBekleyenSirSifreli === null);
    const dogru: any = await dene(() => d.mfa.kurulumBaslat('U1', { parola: 'dogru-parola' }, null));
    check('M15b-OLCUT dogru parola → kurulum BASLAR',
      !dogru.hata && typeof dogru.deger?.otpauthUri === 'string', String(dogru.hata));
  }

  // M15c (R1-Y1) — `authAt` KOPYALANIR.
  {
    const d = dunya([kullanici({})]);
    const ESKI = Math.floor(Date.now() / 1000) - 4242;
    const c1 = await dene(() => d.mfa.kurulumBaslat('U1', { parola: 'dogru-parola' }, ESKI));
    const c2 = await dene(() => d.mfa.kurulumOnayla('U1', c1.hata ? '000000' : bekleyeninKodu(d), ESKI));
    check('M15c-FIXTURE kurulum FIRLATMADAN tamamlandi', !c1.hata && !c2.hata,
      JSON.stringify(hataGovdesi(c1.hata ?? c2.hata)));
    const y: any = c2.deger ?? { token: 'x.eyJ9.y' };
    check('M15c ⭐ `kurulumOnayla` token `authAt`i ISTEGIN authAt"ina ESIT (simdi DEGIL)',
      !c2.hata && yuk(y.token).authAt === ESKI, `${c2.hata ? 'FIRLATTI' : yuk(y.token).authAt} ≠ ${ESKI}`);

    const c3 = await dene(() => d.mfa.kapat('U1', { parola: 'dogru-parola' }, ESKI));
    const kapali: any = c3.deger ?? { token: 'x.eyJ9.y' };
    check('M15c ⭐ `kapat` token `authAt`i de KOPYALANIR',
      !c3.hata && yuk(kapali.token).authAt === ESKI,
      c3.hata ? JSON.stringify(hataGovdesi(c3.hata)) : String(yuk(kapali.token).authAt));

    // `authAt`siz istek → yanit token"inda da YOK.
    const d2 = dunya([kullanici({})]);
    const e1 = await dene(() => d2.mfa.kurulumBaslat('U1', { parola: 'dogru-parola' }, null));
    const e2 = await dene(() => d2.mfa.kurulumOnayla('U1', e1.hata ? '000000' : bekleyeninKodu(d2), null));
    const y2: any = e2.deger ?? { token: 'x.eyJ9.y' };
    check('M15c ⭐ `authAt`siz istekte yanit token"inda `authAt` YOK',
      !e2.hata && !('authAt' in yuk(y2.token)),
      e2.hata ? JSON.stringify(hataGovdesi(e2.hata)) : JSON.stringify(yuk(y2.token)));
  }

  // M16 — kapatma.
  {
    const b32 = base32Kodla(totpSiriUret());
    const d = dunya(
      [kullanici({ role: 'admin', mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1') })],
      [firma()],
      [{ id: 'K1', userId: 'U1', kodOzeti: bcryptHashSync('ABCDEFGHJK', 4), kullanildiAt: null }],
    );
    const r = await dene(() => d.mfa.kapat('U1', { parola: 'dogru-parola' }, null));
    check('M16 ⭐ yonetici → 400 MFA_ZORUNLU',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_ZORUNLU',
      JSON.stringify(hataGovdesi(r.hata)));
    d.p._veri.user[0].role = 'user';
    const yanlis = await dene(() => d.mfa.kapat('U1', { parola: 'yanlis' }, null));
    check('M16 ⭐ yanlis parola → 400 PAROLA_HATALI (401 DEGIL)',
      hataDurumu(yanlis.hata) === 400 && hataKodu(yanlis.hata) === 'PAROLA_HATALI',
      JSON.stringify(hataGovdesi(yanlis.hata)));
    const y: any = await d.mfa.kapat('U1', { parola: 'dogru-parola' }, null);
    const satir = d.p._veri.user[0];
    check('M16 ⭐ dogru parola → alanlar null (`mfaKaynagi` DAHIL), kodlar silindi, damga, token',
      satir.mfaAcikAt === null && satir.mfaSirriSifreli === null && satir.mfaKaynagi === null &&
      d.p._veri.mfaKurtarmaKodu.length === 0 && satir.passwordChangedAt instanceof Date &&
      typeof y.token === 'string',
      JSON.stringify({ acik: satir.mfaAcikAt, kaynak: satir.mfaKaynagi, kod: d.p._veri.mfaKurtarmaKodu.length }));
    check('M16 "kapatildi" bilgi e-postasi gitti',
      d.e.giden.some((g) => g.konu === 'İki adımlı giriş kapatıldı'), JSON.stringify(d.e.giden));
  }

  // M16b — firma zorunlulugu dali.
  {
    const b32 = base32Kodla(totpSiriUret());
    const kur = (zorunlu: boolean) => dunya(
      [kullanici({ mfaAcikAt: t1, mfaKaynagi: 'zorunlu-firma', mfaSirriSifreli: sirle(b32, 'U1') })],
      [firma({ mfaZorunlu: zorunlu })],
    );
    const d1 = kur(true);
    const r = await dene(() => d1.mfa.kapat('U1', { parola: 'dogru-parola' }, null));
    check('M16b ⭐ firma zorunlu + uye (yonetici DEGIL) → 400 MFA_ZORUNLU',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'MFA_ZORUNLU' &&
      hataGovdesi(r.hata)?.neden === 'firma',
      JSON.stringify(hataGovdesi(r.hata)));
    const d2 = kur(false);
    const y: any = await dene(() => d2.mfa.kapat('U1', { parola: 'dogru-parola' }, null));
    check('M16b ⭐ zorunluluk KALKINCA ayni uye KAPATABILIR',
      !y.hata && d2.p._veri.user[0].mfaAcikAt === null, String(y.hata));
    check('M16b `kapatilabilirMi` saf kurali iki dali AYRI doner',
      kapatilabilirMi({ role: 'admin' }, null).neden === 'yonetici' &&
      kapatilabilirMi({ role: 'user' }, { mfaZorunlu: true }).neden === 'firma' &&
      kapatilabilirMi({ role: 'user' }, { mfaZorunlu: false }).kapatilabilir === true);
  }

  // M17 — kurtarma kodu yenileme.
  {
    const b32 = base32Kodla(totpSiriUret());
    const d = dunya(
      [kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1') })],
      [firma()],
      [{ id: 'ESKI', userId: 'U1', kodOzeti: bcryptHashSync('AAAAAAAAAA', 4), kullanildiAt: null }],
    );
    const damgaOnce = d.p._veri.user[0].passwordChangedAt;
    const yn = await dene(() => d.mfa.kurtarmaKodlariniYenile('U1', gecerliKod(b32)));
    check('M17-FIXTURE yenileme FIRLATMADAN dondu', !yn.hata, JSON.stringify(hataGovdesi(yn.hata)));
    const y: any = yn.deger ?? { kurtarmaKodlari: [] };
    check('M17 ⭐ eski kodlar SILINDI, 10 yeni kod yazildi',
      y.kurtarmaKodlari.length === 10 && d.p._veri.mfaKurtarmaKodu.length === 10 &&
      !d.p._veri.mfaKurtarmaKodu.some((k: Satir) => k.id === 'ESKI'),
      String(d.p._veri.mfaKurtarmaKodu.length));
    const silme = d.p._iz.cagrilar.filter((c: any) => c.tablo === 'mfaKurtarmaKodu' && c.islem === 'deleteMany');
    const yazma = d.p._iz.cagrilar.filter((c: any) => c.tablo === 'mfaKurtarmaKodu' && c.islem === 'createMany');
    check('M17 silme ve yazma AYNI transaction icinde (silme → yazma sirasi)',
      silme.length === 1 && yazma.length === 1 &&
      d.p._iz.cagrilar.indexOf(silme[0]) < d.p._iz.cagrilar.indexOf(yazma[0]));
    check('M17-OLCUT damga ATILMAZ (§4.7: kod yenileme oturum kapatmaz)',
      d.p._veri.user[0].passwordChangedAt === damgaOnce);
  }

  // M26 (R1/E-4) — sirket girisinde de sor.
  {
    const b32 = base32Kodla(totpSiriUret());
    const d = dunya([kullanici({ mfaAcikAt: t1, mfaKaynagi: 'zorunlu-firma', mfaSirriSifreli: sirle(b32, 'U1') })]);
    const yanlis = await dene(() => d.mfa.sirketGirisindeDeSor('U1', '000000'));
    check('M26 yanlis kod → 400 MFA_KOD_HATALI', hataDurumu(yanlis.hata) === 400,
      JSON.stringify(hataGovdesi(yanlis.hata)));
    const sg = await dene(() => d.mfa.sirketGirisindeDeSor('U1', gecerliKod(b32)));
    check('M26-FIXTURE FIRLATMADAN dondu', !sg.hata, JSON.stringify(hataGovdesi(sg.hata)));
    check('M26 ⭐ dogru kod → `mfaKaynagi` "kisisel"',
      d.p._veri.user[0].mfaKaynagi === 'kisisel', String(d.p._veri.user[0].mfaKaynagi));
    const d2 = dunya([kullanici({})]);
    const kapali = await dene(() => d2.mfa.sirketGirisindeDeSor('U1', '123456'));
    check('M26 MFA kapali → 400 MFA_KAPALI', hataKodu(kapali.hata) === 'MFA_KAPALI',
      JSON.stringify(hataGovdesi(kapali.hata)));
  }
}
// ───────────────────────────────────────────────────────────────────────────
//  M18-M20 · YONETICI SIFIRLAMA · FIRMA ANAHTARI · PAROLA SIFIRLAMA
// ───────────────────────────────────────────────────────────────────────────
async function bolumYonetim() {
  console.log('\n── M18-M20 · YONETIM ──');

  // M18 — yonetici MFA sifirlama.
  {
    const b32 = base32Kodla(totpSiriUret());
    const p = db({
      user: [
        kullanici({ mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1') }),
        kullanici({ id: 'Y1', email: 'yonetici@firma.test', role: 'admin', mfaAcikAt: t1 }),
      ],
      firma: [firma()],
      mfaKurtarmaKodu: [{ id: 'K1', userId: 'U1', kodOzeti: 'x', kullanildiAt: null }],
    });
    const e = epostaSahte();
    const servis = new AdminService(
      p, {} as any, {} as any, { iptalEt: async () => undefined } as any, e.servis,
    );
    (servis as any).logger = { error: () => undefined, warn: () => undefined, log: () => undefined };
    const yonetici = { id: 'Y1', email: 'yonetici@firma.test' };
    await servis.mfaSifirla(yonetici, 'U1');
    const satir = p._veri.user[0];
    check('M18 ⭐ alanlar null + kodlar silindi + damga',
      satir.mfaAcikAt === null && satir.mfaSirriSifreli === null && satir.mfaKaynagi === null &&
      p._veri.mfaKurtarmaKodu.length === 0 && satir.passwordChangedAt instanceof Date,
      JSON.stringify({ acik: satir.mfaAcikAt, kod: p._veri.mfaKurtarmaKodu.length }));
    const olay = p._veri.yoneticiOlayi[0];
    check('M18 ⭐ `YoneticiOlayi` tip "mfa.sifirlandi" AYNI transaction"da',
      olay?.tip === 'mfa.sifirlandi' && olay?.hedefKullaniciId === 'U1',
      JSON.stringify(olay));
    check('M18 bilgi e-postasi gitti',
      e.giden.some((g) => g.konu === 'İki adımlı giriş sıfırlandı'), JSON.stringify(e.giden));
    const kendisi = await dene(() => servis.mfaSifirla(yonetici, 'Y1'));
    check('M18 ⭐ yonetici KENDI MFA"sini panelden sifirlayamaz',
      hataKodu(kendisi.hata) === 'KENDI_MFA_SIFIRLANAMAZ', JSON.stringify(hataGovdesi(kendisi.hata)));
    check('M18 BAGLANTI: `AdminController` sinifinda ROLES_KEY ["admin"]',
      JSON.stringify(metadataOku(ROLES_KEY, (AdminController.prototype as any).mfaSifirla, AdminController)) === '["admin"]',
      JSON.stringify(metadataOku(ROLES_KEY, (AdminController.prototype as any).mfaSifirla, AdminController)));
  }

  // M19 — firma guvenlik anahtari.
  {
    const p = db({
      user: [
        kullanici({ id: 'S1', email: 'sahip@firma.test', firmaRol: 'sahip' }),
        kullanici({ id: 'U2', email: 'u2@firma.test' }),
        kullanici({ id: 'U3', email: 'u3@firma.test', mfaAcikAt: t1, mfaKaynagi: 'kisisel' }),
      ],
      firma: [firma()],
    });
    const servis = new FirmaServisi(p);
    const kimlik = { userId: 'S1', firmaId: 'F1' };
    const r = await dene(() => servis.guvenlikGuncelle(kimlik, true));
    check('M19 ⭐ sahibin MFA"si kapali → 400 ONCE_KENDINIZ_ACIN',
      hataDurumu(r.hata) === 400 && hataKodu(r.hata) === 'ONCE_KENDINIZ_ACIN',
      JSON.stringify(hataGovdesi(r.hata)));
    p._veri.user[0].mfaAcikAt = t1;
    await servis.guvenlikGuncelle(kimlik, true);
    const damga = p._iz.cagrilar.filter(
      (c: any) => c.tablo === 'user' && c.islem === 'updateMany');
    check('M19 ⭐ damga `updateMany.where` = { firmaId, deletedAt: null, mfaAcikAt: null }',
      damga.length === 1 &&
      JSON.stringify(damga[0].arg.where) === JSON.stringify({ firmaId: 'F1', deletedAt: null, mfaAcikAt: null }),
      JSON.stringify(damga.map((c: any) => c.arg.where)));
    check('M19 ⭐ MFA"si OLAN uyenin damgasina DOKUNULMADI (yalniz MFA"sizlar)',
      p._veri.user[1].passwordChangedAt instanceof Date && p._veri.user[2].passwordChangedAt === null,
      JSON.stringify(p._veri.user.map((u: Satir) => [u.id, u.passwordChangedAt])));
    check('M19 `FirmaOlayi` "guvenlik.mfa-zorunlu" yazildi',
      p._veri.firmaOlayi.some((o: Satir) => o.tip === 'guvenlik.mfa-zorunlu' && o.yeniDeger === 'true'),
      JSON.stringify(p._veri.firmaOlayi));
    check('M19 BAGLANTI: `FirmaController.guvenlik` FIRMA_ROL_KEY ["sahip"]',
      JSON.stringify(metadataOku(FIRMA_ROL_KEY, (FirmaController.prototype as any).guvenlik, FirmaController)) === '["sahip"]',
      JSON.stringify(metadataOku(FIRMA_ROL_KEY, (FirmaController.prototype as any).guvenlik, FirmaController)));
    // Kapatma: damga ATILMAZ.
    const oncekiDamga = p._iz.cagrilar.filter((c: any) => c.tablo === 'user' && c.islem === 'updateMany').length;
    await servis.guvenlikGuncelle(kimlik, false);
    check('M19-OLCUT kapatirken damga ATILMAZ (kimsenin oturumu bosuna dusmez)',
      p._iz.cagrilar.filter((c: any) => c.tablo === 'user' && c.islem === 'updateMany').length === oncekiDamga &&
      p._veri.firma[0].mfaZorunlu === false);
  }

  // M20 — parola sifirlama kilidi acar, MFA"yi KAPATMAZ.
  {
    const b32 = base32Kodla(totpSiriUret());
    const kul = kullanici({
      mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1'),
      mfaHataSayaci: 20, mfaKilitliAt: new Date(),
    });
    const p = db({
      user: [kul], firma: [firma()],
      passwordResetToken: [{
        id: 'T1', userId: 'U1', tokenHash: tokenOzetle('sifirlama-token'),
        expiresAt: new Date(Date.now() + 3_600_000), usedAt: null, user: kul,
      }],
    });
    const parola = new ParolaServisi(
      p,
      { gonder: async () => undefined, gonderKritik: async () => undefined } as any,
      { signToken: () => 'tkn' } as any,
      { get: () => 'https://ornek.test' } as any,
    );
    await parola.sifirla('sifirlama-token', 'yeni-parola-123');
    const yazim = p._iz.cagrilar.find((c: any) => c.tablo === 'user' && c.islem === 'update');
    check('M20 ⭐ sifirlama `mfaHataSayaci: 0` ve `mfaKilitliAt: null` yazar (kilidi acar)',
      yazim?.arg?.data?.mfaHataSayaci === 0 && yazim?.arg?.data?.mfaKilitliAt === null,
      JSON.stringify(yazim?.arg?.data));
    check('M20 ⭐ `mfaAcikAt`/`mfaSirriSifreli`/`mfaKaynagi` VERIDE YOK (MFA ACIK KALIR)',
      !('mfaAcikAt' in (yazim?.arg?.data ?? {})) &&
      !('mfaSirriSifreli' in (yazim?.arg?.data ?? {})) &&
      !('mfaKaynagi' in (yazim?.arg?.data ?? {})) &&
      kul.mfaAcikAt === t1 && kul.mfaSirriSifreli !== null,
      JSON.stringify(Object.keys(yazim?.arg?.data ?? {})));
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  M23-M25 · /auth/me · KVKK · BETIK
// ───────────────────────────────────────────────────────────────────────────
async function bolumYanitlar() {
  console.log('\n── M23-M25 · YANITLAR ──');

  // M23 — /auth/me.
  {
    const b32 = base32Kodla(totpSiriUret());
    const p = db({
      user: [kullanici({
        mfaAcikAt: t1, mfaKaynagi: 'zorunlu-firma', mfaSirriSifreli: sirle(b32, 'U1'),
        firma: firma({ mfaZorunlu: true }),
      })],
      firma: [firma({ mfaZorunlu: true })],
      mfaKurtarmaKodu: [
        { id: 'K1', userId: 'U1', kodOzeti: 'ozet1', kullanildiAt: null },
        { id: 'K2', userId: 'U1', kodOzeti: 'ozet2', kullanildiAt: null },
        { id: 'K3', userId: 'U1', kodOzeti: 'ozet3', kullanildiAt: new Date() },
      ],
    });
    const me: any = await authKur(p).me('U1');
    check('M23 ⭐ `mfa` alani: acik, acikAt, kaynak, kalanKurtarmaKodu, zorunlu, neden',
      me.mfa?.acik === true && me.mfa?.kaynak === 'zorunlu-firma' &&
      me.mfa?.kalanKurtarmaKodu === 2 && me.mfa?.zorunlu === true &&
      me.mfa?.zorunlulukNedeni === 'firma',
      JSON.stringify(me.mfa));
    const meSelect = p._iz.cagrilar.find(
      (c: any) => c.tablo === 'user' && c.islem === 'findUnique')?.arg?.select ?? {};
    check('M23 ⭐ `select` `mfaAcikAt`/`mfaKaynagi` ISTER, `mfaSirriSifreli` ISTEMEZ',
      meSelect.mfaAcikAt === true && meSelect.mfaKaynagi === true &&
      !('mfaSirriSifreli' in meSelect) && !('password' in meSelect),
      JSON.stringify(Object.keys(meSelect)));
    check('M23 ⭐ `mfa` nesnesinin KENDISI sir/ozet TASIMAZ',
      !JSON.stringify(me.mfa).includes('mfaSirriSifreli') &&
      !JSON.stringify(me.mfa).includes('kodOzeti') && !JSON.stringify(me.mfa).includes('ozet1'),
      JSON.stringify(me.mfa));
    check('M23-OLCUT ham `mfaAcikAt`/`mfaKaynagi` alanlari yayilimdan CIKARILDI',
      !('mfaAcikAt' in me) && !('mfaKaynagi' in me), JSON.stringify(Object.keys(me)));
    // MFA kapali: sorgu ATILMAZ.
    const p2 = db({ user: [kullanici({})], firma: [firma()] });
    const me2: any = await authKur(p2).me('U1');
    check('M23 MFA kapali → acik:false, kalan 0, kurtarma kodu SORGUSU atilmadi',
      me2.mfa?.acik === false && me2.mfa?.kalanKurtarmaKodu === 0 &&
      !p2._iz.cagrilar.some((c: any) => c.tablo === 'mfaKurtarmaKodu'),
      JSON.stringify(me2.mfa));
  }

  // M24 — KVKK disa aktarimi.
  {
    const b32 = base32Kodla(totpSiriUret());
    const p = db({
      user: [kullanici({ firmaRol: 'sahip', mfaAcikAt: t1, mfaKaynagi: 'kisisel', mfaSirriSifreli: sirle(b32, 'U1') })],
      firma: [firma()],
      mfaKurtarmaKodu: [
        { id: 'K1', userId: 'U1', kodOzeti: 'GIZLI-OZET-1', kullanildiAt: null },
        { id: 'K2', userId: 'U1', kodOzeti: 'GIZLI-OZET-2', kullanildiAt: null },
      ],
    });
    const hesap = new HesapServisi(p, { iptalEt: async () => undefined } as any);
    const disa: any = await hesap.verileriDisaAktar('U1');
    check('M24 ⭐ `kullanici.mfa` = { acikAt, kaynak, kalanKurtarmaKodu: 2 }',
      disa.kullanici?.mfa?.kaynak === 'kisisel' && disa.kullanici?.mfa?.kalanKurtarmaKodu === 2 &&
      disa.kullanici?.mfa?.acikAt instanceof Date,
      JSON.stringify(disa.kullanici?.mfa));
    const disaSelect = p._iz.cagrilar.find(
      (c: any) => c.tablo === 'user' && c.islem === 'findUnique')?.arg?.select ?? {};
    check('M24 ⭐ disa aktarim `select`i `mfaSirriSifreli` ISTEMEZ (dosya dolasir)',
      disaSelect.mfaAcikAt === true && disaSelect.mfaKaynagi === true &&
      !('mfaSirriSifreli' in disaSelect) && !('password' in disaSelect),
      JSON.stringify(Object.keys(disaSelect)));
    check('M24 ⭐ `mfa` nesnesi SAYI tasir, OZET TASIMAZ',
      !JSON.stringify(disa.kullanici.mfa).includes('GIZLI-OZET') &&
      typeof disa.kullanici.mfa.kalanKurtarmaKodu === 'number',
      JSON.stringify(disa.kullanici.mfa));
    check('M24-OLCUT kurtarma kodu tablosu `findMany` ile CEKILMEDI (yalniz `count`)',
      !p._iz.cagrilar.some((c: any) => c.tablo === 'mfaKurtarmaKodu' && c.islem === 'findMany'),
      JSON.stringify(p._iz.cagrilar.filter((c: any) => c.tablo === 'mfaKurtarmaKodu').map((c: any) => c.islem)));
    check('M24 `passwordChangedAt` aciklamasi ve MFA saklama notu eklendi',
      disa.notlar.some((n: string) => n.includes('passwordChangedAt')) &&
      disa.notlar.some((n: string) => n.includes('sifrelenmis olarak saklanir')),
      JSON.stringify(disa.notlar.length));
  }

  // M25 — betik plan fonksiyonu.
  {
    check('M25 ⭐ betik: kullanici yoksa yapilacak=false, GEREKCE var',
      (() => {
        const p1 = sifirlamaPlaniUret(null, 'yok@x.com');
        return p1.yapilacak === false && p1.neden.includes('bulunamadi');
      })(), '');
    check('M25 betik: kullanici yoksa gerekce metni DOLU',
      (() => {
        const p1 = sifirlamaPlaniUret(null, 'yok@x.com');
        return p1.yapilacak === false && p1.neden.trim().length > 0;
      })());
    check('M25 ⭐ betik: MFA kapali → yapilacak=false (sessiz yazma YOK)',
      sifirlamaPlaniUret(
        { id: 'U1', email: 'a@b.c', role: 'user', deletedAt: null, mfaAcikAt: null }, 'a@b.c',
      ).yapilacak === false);
    check('M25 betik: kapatilmis hesap → yapilacak=false',
      sifirlamaPlaniUret(
        { id: 'U1', email: 'a@b.c', role: 'user', deletedAt: new Date(), mfaAcikAt: t1 }, 'a@b.c',
      ).yapilacak === false);
    check('M25-OLCUT betik: MFA acik + etkin hesap → yapilacak=true',
      sifirlamaPlaniUret(
        { id: 'U1', email: 'a@b.c', role: 'admin', deletedAt: null, mfaAcikAt: t1 }, 'a@b.c',
      ).yapilacak === true);
    const betik = kodu(oku('backend/scripts/mfa-sifirla.ts'));
    check('M25 ⭐ betik PROVA varsayilani: yazma `if (!uygula) return`den SONRA',
      betik.indexOf('$transaction') > betik.indexOf('if (!uygula)'),
      `${betik.indexOf('if (!uygula)')} → ${betik.indexOf('$transaction')}`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  M27-M28 · IZIN TABLOSU ve KAYNAK KAPILARI
// ───────────────────────────────────────────────────────────────────────────
function bolumKapilar() {
  console.log('\n── M27-M28 · KAPILAR ──');

  // M27 — S12 izin tablosunun F2b genislemesi.
  const OTURUMLU = [
    'kurulumBaslat', 'kurulumOnayla', 'kapat',
    'kurtarmaKodlariniYenile', 'sirketGirisindeDeSor',
  ];
  const GUARDSIZ = ['dogrula', 'zorunluKurulumBaslat', 'zorunluKurulumOnayla'];
  const izinli = metotlar(MfaController).filter(
    (m) => metadataOku(KOLTUK_DISI_IZINLI, (MfaController.prototype as any)[m], MfaController) === true,
  );
  check('M27 ⭐ `MfaController` oturumlu metotlarinin TAMAMI `@KoltukDisiIzinli` tasir',
    izinli.sort().join(',') === OTURUMLU.sort().join(','), JSON.stringify(izinli));
  check('M27-OLCUT guardsiz metotlar izin metadatasi TASIMAZ (Jwt yok)',
    GUARDSIZ.every((m) => metadataOku(KOLTUK_DISI_IZINLI, (MfaController.prototype as any)[m], MfaController) !== true),
    JSON.stringify(GUARDSIZ.map((m) => metadataOku(KOLTUK_DISI_IZINLI, (MfaController.prototype as any)[m], MfaController))));
  check('M27 controller metot kumesi TAM (yeni uc sessizce eklenmesin)',
    metotlar(MfaController).sort().join(',') === [...OTURUMLU, ...GUARDSIZ].sort().join(','),
    JSON.stringify(metotlar(MfaController)));

  // M28 (R1-O1) — kaynak kapisi.
  const govde = (kaynak: string, ad: string) => {
    const k = kodu(kaynak);
    const bas = k.indexOf(ad);
    if (bas < 0) return '';
    // Fonksiyon govdesini kaba kuvvetle al.
    // ⚠ PENCERE 4500: F3b `login`/`register`/`davetKabul` govdelerine V7
    // (zorunlu kurumsal giris) kontrolunu ve gerekcesini ekledi; 3000 karakter
    // `girisKarari(` satirini PENCERENIN DISINDA birakiyordu ve kapi
    // YANLIS-NEGATIF veriyordu (kod dogruyken kirmizi).
    return k.slice(bas, bas + 4500);
  };
  const authSrc = oku('backend/src/altyapi/auth/auth.service.ts');
  const uyelikSrc = oku('backend/src/ozellik/firma/uyelik.servisi.ts');
  const loginGovde = govde(authSrc, 'async login(');
  const registerGovde = govde(authSrc, 'async register(');
  const davetGovde = govde(uyelikSrc, 'async davetKabul(');
  check('M28 ⭐ `login` govdesinde DOGRUDAN `oturumYaniti(` YOK, `girisKarari(` VAR',
    !loginGovde.includes('oturumYaniti(') && loginGovde.includes('girisKarari('),
    `oturumYaniti=${loginGovde.includes('oturumYaniti(')} girisKarari=${loginGovde.includes('girisKarari(')}`);
  check('M28 ⭐ `register` govdesinde DOGRUDAN `oturumYaniti(` YOK, `girisKarari(` VAR',
    !registerGovde.includes('oturumYaniti(') && registerGovde.includes('girisKarari('),
    `oturumYaniti=${registerGovde.includes('oturumYaniti(')}`);
  check('M28 ⭐ `davetKabul` govdesinde DOGRUDAN `oturumYaniti(` YOK, `girisKarari(` VAR',
    !davetGovde.includes('oturumYaniti(') && davetGovde.includes('girisKarari('),
    `oturumYaniti=${davetGovde.includes('oturumYaniti(')}`);
  check('M28-OLCUT olcut calisiyor: `oturumYaniti(` `oturum.servisi.ts`te GECIYOR',
    kodu(oku('backend/src/altyapi/auth/oturum.servisi.ts')).includes('oturumYaniti('));
  check('M28 `meydan-okuma.ts` `@nestjs/jwt` IMPORT ETMEZ (§4.5 kaynak kapisi)',
    !kodu(oku('backend/src/altyapi/auth/mfa/meydan-okuma.ts')).includes('@nestjs/jwt'));

  // Kayit kapilari.
  const pkg = JSON.parse(oku('backend/package.json'));
  check('X `test:faz7-mfa` scripti kayitli', typeof pkg.scripts['test:faz7-mfa'] === 'string');
  check('X `mfa:sifirla` betik scripti kayitli', typeof pkg.scripts['mfa:sifirla'] === 'string');
  const reg = oku('backend/test/regression-all.ts');
  check('X `regression-all.ts` SUITES kaydi var (zincir Z0, db yok)',
    /script:\s*'test:faz7-mfa',\s*zincir:\s*'Z0'/.test(reg));
  const harita = oku('KOD_HARITASI.md');
  for (const dosya of [
    'backend/src/altyapi/auth/mfa/mfa-karari.ts',
    'backend/src/altyapi/auth/mfa/mfa.servisi.ts',
    'backend/src/altyapi/auth/mfa/mfa.controller.ts',
    'backend/src/altyapi/auth/mfa/mfa-epostalari.ts',
    'backend/test/faz7-mfa-test.ts',
  ]) {
    check(`X KOD_HARITASI.md ${dosya} icerir`, harita.includes(dosya));
  }
  const migration = fs.readdirSync(path.join(KOK, 'backend/prisma/migrations'))
    .find((d) => d.includes('faz7_iki_adimli_giris'));
  check('X migration klasoru var', !!migration, String(migration));
  const sql = migration ? oku(`backend/prisma/migrations/${migration}/migration.sql`) : '';
  const sqlKodu = sql.replace(/^--.*$/gm, '');
  // ⚠ Satir BASINDA aranir: `ON DELETE CASCADE` bir FK davranisidir, silme
  // degildir; duz `\bDELETE\b` onu yanlislikla yakalardi (olculdu).
  check('X migration YALNIZ EKLER (DROP/DELETE yok — yorum disinda)',
    !/^\s*(DROP|DELETE)\b/im.test(sqlKodu), 'DROP/DELETE bulundu');
  check('X migration `MfaKurtarmaKodu` + 8 User kolonu + `Firma.mfaZorunlu`',
    sqlKodu.includes('CREATE TABLE "MfaKurtarmaKodu"') &&
    (sqlKodu.match(/ALTER TABLE "User" ADD COLUMN "mfa/g) ?? []).length === 8 &&
    sqlKodu.includes('ALTER TABLE "Firma" ADD COLUMN "mfaZorunlu"'),
    String((sqlKodu.match(/ALTER TABLE "User" ADD COLUMN "mfa/g) ?? []).length));
  check('X migration sonunda GERI ALMA notu var (yorum)', sql.includes('GERI ALMA'));
}
// <<BOLUMLER>>

async function main() {
  console.log('\n══ FAZ 7 · F2b — IKI ADIMLI GIRIS ══\n');
  await bolumGiris();
  bolumSafKarar();
  await bolumStrateji();
  await bolumDogrula();
  await bolumMeydanOkuma();
  await bolumZorunluKurulum();
  await bolumOturumlu();
  await bolumYonetim();
  await bolumYanitlar();
  bolumKapilar();
  // <<CAGRILAR>>
  console.log(
    `\n${'='.repeat(64)}\nFAZ 7 IKI ADIMLI GIRIS (F2b): ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed > 0) {
    failures.forEach((f) => console.log(`  · ${f}`));
    // ⚠ Windows: `process.exit` acik fetch soketiyle 0xC0000409 uretir.
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
