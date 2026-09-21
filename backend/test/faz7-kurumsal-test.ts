/**
 * FAZ 7 · F3b — KURUMSAL GIRIS (BAGLAMA) KAPISI
 * (`npm run test:faz7-kurumsal`)
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ: her sey BELLEK ICI sahte Prisma, GERCEK
 * sinif ornekleri ve SUREC ICI sahte OIDC saglayicisiyla olculur
 * (`test/yardimci/sahte-oidc-saglayici.ts`, F3a). Gercek Microsoft/Google'a
 * TEK BIR ISTEK GITMEZ ve HTTP sunucusu ACILMAZ (Windows soket/cikis dersi).
 *
 * Sahte Prisma `where`i GERCEKTEN uygular (`OR`, `lt`, `gt`, `not`, `in`),
 * `updateMany` kosulu saglamayan satiri DEGISTIRMEZ ve `count` gercek sayiyi
 * doner — bu paketin yarisi tam olarak o kosullari olcuyor (yarisa dayanikli
 * state/kod/bilet tuketimi, koltuk sayimi). `$transaction` anlik goruntu alir
 * ve FIRLATANI GERI ALIR; `$queryRaw` sirasi kaydedilir (kilit sayimdan once
 * mi?).
 *
 * ⚠ NE OLCULMEZ (durust sinir): gercek PostgreSQL kilidi ve tekil kisitlari,
 * gercek eszamanlilik (Node tek is parcacigi), gercek Entra/Google akisi,
 * gercek SMTP, gercek tarayici.
 *
 * Mutant tablosu F3b raporunda (38 mutant). KIRMIZIYA DONERSE REGRESYON.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { sign as jwtSign } from 'jsonwebtoken';
import { hashSync as bcryptHashSync } from 'bcrypt';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'faz7-kurumsal-testi-icin-yerel-anahtar-en-az-32-karakter';
// 32 bayt (base64) — `kimlik-sifreleme.ts` bicim + uzunluk denetiminden gecer.
process.env.KIMLIK_SIFRELEME_KEY = Buffer.alloc(32, 0x3c).toString('base64');
process.env.APP_URL = 'https://metapricex.test';

import {
  KurumsalGirisServisi,
  ozetle,
  AKIS_SAKLAMA_MS,
} from '../src/altyapi/auth/kurumsal/kurumsal-giris.servisi';
import { KurumsalGirisController } from '../src/altyapi/auth/kurumsal/kurumsal-giris.controller';
import {
  alanAdiZorunluMu,
  kurumsalZorunluMu,
  alanAdiKurumsalGiris,
} from '../src/altyapi/auth/kurumsal/kurumsal-zorunluluk';
import { sifrele } from '../src/altyapi/auth/kimlik-sifreleme';
import { base32Coz, base32Kodla, hotp, totpAdim, totpSiriUret } from '../src/altyapi/auth/mfa/totp';
import { OturumServisi } from '../src/altyapi/auth/oturum.servisi';
import { AuthService } from '../src/altyapi/auth/auth.service';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
import { ParolaServisi } from '../src/altyapi/auth/parola.servisi';
import { MfaServisi } from '../src/altyapi/auth/mfa/mfa.servisi';
import { UyelikServisi } from '../src/ozellik/firma/uyelik.servisi';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { KurumsalGirisAyarServisi } from '../src/ozellik/firma/kurumsal-giris-ayar.servisi';
import { FirmaKurumsalGirisController } from '../src/ozellik/firma/firma-kurumsal-giris.controller';
import { AdminKurumsalGirisController } from '../src/ozellik/kutuphane/admin/admin-kurumsal-giris.controller';
import { KOLTUK_DISI_IZINLI } from '../src/altyapi/auth/decorators/koltuk-disi-izinli.decorator';
import { JwtAuthGuard } from '../src/altyapi/auth/guards/jwt-auth.guard';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';
import { FIRMA_ROL_KEY } from '../src/altyapi/auth/decorators/firma-rolu.decorator';
import { TIER_KEY } from '../src/altyapi/auth/guards/tier.guard';
import { sahteOidcSaglayici, type SahteSaglayici } from './yardimci/sahte-oidc-saglayici';
import { onbellekleriTemizle } from '../src/altyapi/auth/kurumsal/oidc-istemci';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, kanit?: string) {
  if (kosul) {
    passed++;
    console.log(`  \u2713 ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${kanit ? ` \u2014 ${kanit}` : ''}`);
    console.log(`  \u2717 ${ad}${kanit ? ` \u2014 ${kanit}` : ''}`);
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
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

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
  /**
   * ⚠ OKUMA ANLIK GORUNTU DONER (F3b eklemesi, KOPYALANAN BLOKTAN SAPMA).
   *
   * Gercek Prisma satiri DUZ BIR NESNE olarak doner; sonradan baska bir
   * istek o satiri degistirse elindeki nesne DEGISMEZ. Canli referans
   * dondurmek, YARIS testlerini sessizce ANLAMSIZ yapiyordu: `donus`un
   * on kontrolu (`akis.donusAt`) es zamanli ikinci istekte de "dolu"
   * goruyor ve KOSULLU TUKETIMIN (mutant #1) hic gerekmedigi izlenimi
   * veriyordu. Yazmalar (`create`/`update`) CANLI satiri dondurmeye devam
   * eder — `katil` olusturdugu kullaniciyi oradan okuyor.
   */
  const kopya = (s: Satir | undefined | null) => (s ? { ...s } : s);
  return {
    findUnique: async (a: any) => { kaydet('findUnique', a); return kopya(bul(a.where)[0]) ?? null; },
    findFirst: async (a: any) => { kaydet('findFirst', a); return kopya(sirala(bul(a.where), a.orderBy)[0]) ?? null; },
    findMany: async (a: any = {}) => { kaydet('findMany', a); return sirala(bul(a.where), a.orderBy).map((s) => ({ ...s })); },
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

const T0 = new Date('2026-09-21T10:00:00Z');
const T0MS = T0.getTime();
/** Sekme sirri ve OZETI (§5.4) — gövdede yalniz OZET gider. */
const SIR = 'a'.repeat(43);
const BAG = sha(SIR);
const KIRACI = '11111111-2222-3333-4444-555555555555';
const IDP = 'IDP1';
const SIR_METNI = 'cok-gizli-istemci-sirri';

function kullanici(ek: Satir = {}): Satir {
  return {
    id: 'U1', email: 'ali@firma.com.tr', password: bcryptHashSync('dogru-parola', 4),
    role: 'user', status: 'active', tier: 'core', deletedAt: null,
    passwordChangedAt: null, firmaId: 'F1', firmaRol: 'uye', createdAt: T0,
    ad: null, soyad: null, emailVerified: true, parolaTanimli: true,
    mfaSirriSifreli: null, mfaAcikAt: null, mfaKaynagi: null, mfaSonAdim: null,
    mfaBekleyenSirSifreli: null, mfaBekleyenAt: null, mfaHataSayaci: 0, mfaKilitliAt: null,
    ...ek,
  };
}
function firma(ek: Satir = {}): Satir {
  return { id: 'F1', ad: 'Acme Muhendislik', mfaZorunlu: false, createdAt: T0, ...ek };
}
function saglayici(ek: Satir = {}): Satir {
  return {
    id: IDP, firmaId: 'F1', tip: 'entra', entraKiraciId: KIRACI,
    issuer: `https://login.microsoftonline.com/${KIRACI}/v2.0`,
    clientId: 'sahte-istemci-kimligi',
    istemciSirriSifreli: sifrele(SIR_METNI, `idp:${IDP}`),
    istemciSirriSonGecerlilik: null, beyanAlanAdlari: ['firma.com.tr'],
    durum: 'ETKIN', jitKatilim: true, zorunlu: false,
    sonSinamaAt: null, sonHataKodu: null, sonSirUyarisiAt: null,
    olusturuldu: T0, guncellendi: T0,
    ...ek,
  };
}
function alanAdi(ek: Satir = {}): Satir {
  return { alanAdi: 'firma.com.tr', saglayiciId: IDP, firmaId: 'F1', dogrulayanId: 'U0', dogrulandiAt: T0, ...ek };
}

function db(ek: Record<string, Satir[]> = {}) {
  const veri: Record<string, Satir[]> = {
    user: [], firma: [], abonelik: [], firmaDavet: [], firmaOlayi: [], yoneticiOlayi: [],
    userSubscription: [], passwordResetToken: [], mfaKurtarmaKodu: [],
    firmaKimlikSaglayici: [], dogrulanmisAlanAdi: [], kullaniciDisKimlik: [], ssoAkisi: [],
    ...ek,
  };
  // ⚠ ILISKI SUZGECI: gercek Prisma `select: { saglayici: {…} }` ile ilisiği
  // GETIRIR; sahte Prisma satiri OLDUGU GIBI doner. `kurumsalZorunluMu` ve
  // `kesfet` tam da o ilisiği okuyor, bu yuzden fixture ilisigi AYNI NESNE
  // olarak baglar (kopya degil: testler saglayici satirini degistirip
  // "yeniden okundu mu" olcuyor).
  for (const a of veri.dogrulanmisAlanAdi) {
    if (a.saglayici === undefined) {
      a.saglayici = veri.firmaKimlikSaglayici.find((x) => x.id === a.saglayiciId) ?? null;
    }
  }
  const p = sahtePrisma(veri);
  // Bilinmeyen tablo BOS doner (`undefined` degil): KVKK disa aktarimi
  // yirmiye yakin tablo okuyor.
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

type Dunya = {
  p: any;
  servis: KurumsalGirisServisi;
  sahte: SahteSaglayici;
  giden: { kime: string; konu: string }[];
  oturum: OturumServisi;
};

/**
 * ⚠ `onbellekleriTemizle()` HER dunyada: `kesifAl`/`jwksAl` SUREC OMURLU
 * onbellek tutar. Iki farkli sahte saglayici AYNI issuer'i kullanir ama
 * FARKLI RSA anahtari uretir — onbellek temizlenmezse ikinci testin
 * token'i birinci testin anahtariyla dogrulanmaya calisilir ve test
 * NEYI olctugunu gizleyen bir "imza gecersiz" verir.
 */
function dunya(opts: {
  kullanicilar?: Satir[];
  firmalar?: Satir[];
  saglayicilar?: Satir[];
  alanAdlari?: Satir[];
  disKimlikler?: Satir[];
  abonelikler?: Satir[];
  davetler?: Satir[];
  tip?: 'entra' | 'google';
  eposta?: string;
  simdiMs?: number;
} = {}): Dunya {
  onbellekleriTemizle();
  const p = db({
    user: opts.kullanicilar ?? [kullanici()],
    firma: opts.firmalar ?? [firma()],
    firmaKimlikSaglayici: opts.saglayicilar ?? [saglayici(opts.tip === 'google' ? { tip: 'google', entraKiraciId: null, issuer: 'https://accounts.google.com' } : {})],
    dogrulanmisAlanAdi: opts.alanAdlari ?? [alanAdi()],
    kullaniciDisKimlik: opts.disKimlikler ?? [],
    abonelik: opts.abonelikler ?? [
      { id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 3 } } },
    ],
    firmaDavet: opts.davetler ?? [],
  });
  const giden: { kime: string; konu: string }[] = [];
  const eposta = {
    gonder: async (t: any) => { giden.push({ kime: t.kime, konu: t.konu }); },
    gonderKritik: async (t: any) => { giden.push({ kime: t.kime, konu: t.konu }); },
  } as any;
  const oturum = new OturumServisi(p, jwtSahte);
  const config = { get: (k: string) => (k === 'APP_URL' ? 'https://metapricex.test' : undefined) } as any;
  const servis = new KurumsalGirisServisi(p, oturum, eposta, config);
  const sahte = sahteOidcSaglayici({
    tip: opts.tip ?? 'entra',
    kiraciId: KIRACI,
    clientId: 'sahte-istemci-kimligi',
    eposta: opts.eposta ?? 'ali@firma.com.tr',
    hd: 'firma.com.tr',
    simdiMs: opts.simdiMs ?? T0MS,
  });
  servis.fetchFn = sahte.fetchFn;
  servis.simdiMs = () => opts.simdiMs ?? T0MS;
  return { p, servis, sahte, giden, oturum };
}

/** Akis baslatir, IdP token yanitini akisin NONCE'uyla kurar, `state` doner. */
async function akisKur(
  d: Dunya,
  ozelTalepler: Record<string, unknown> = {},
  baslatici?: () => Promise<{ yonlendirmeUrl: string }>,
): Promise<{ state: string; akis: Satir; yonlendirmeUrl: string }> {
  const { yonlendirmeUrl } = await (baslatici ? baslatici() : d.servis.baslat(IDP, BAG));
  const state = new URL(yonlendirmeUrl).searchParams.get('state') as string;
  const akis = d.p._veri.ssoAkisi[d.p._veri.ssoAkisi.length - 1];
  // ⚠ SAHTE PRISMA SINIRI: gercek Postgres'te yazilmayan nullable kolon NULL
  // olur; bellekteki nesnede `undefined` kalir ve `where: { donusAt: null }`
  // kosulu ESLESMEZDI. Kosullu tuketim (state/kod/bilet) tam da bu kosula
  // dayandigi icin fixture kolonlari ACIKCA null'lar — aksi hâlde testler
  // kodun degil fixture'in yuzunden kirmizi olurdu (FIXTURE KANITI dersi).
  for (const alan of [
    'donusAt', 'dogrulanmisKimlik', 'sonucKoduOzeti', 'sonucSonGecerlilik',
    'sonucKullanildiAt', 'hataKodu', 'biletOzeti', 'biletSonGecerlilik',
    'biletKullanildiAt', 'baslatanUserId',
  ]) {
    if (akis[alan] === undefined) akis[alan] = null;
  }
  d.sahte.tokenYanitiniAyarla({
    status: 200,
    govde: {
      token_type: 'Bearer',
      id_token: d.sahte.idTokenBas({ nonce: akis.nonce, ...ozelTalepler }),
    },
  });
  return { state, akis, yonlendirmeUrl };
}

/** `donus` cagirir ve 302 hedefinden `kod`u cikarir (yoksa null). */
async function donusVeKod(d: Dunya, state: string, code = 'yetki-kodu'): Promise<{ hedef: string; kod: string | null }> {
  const { yonlendirme } = await d.servis.donus({ code, state });
  const u = new URL(yonlendirme);
  return { hedef: yonlendirme, kod: u.searchParams.get('kod') };
}

/** Tam yol: baslat → donus → degis. */
async function tamAkis(
  d: Dunya,
  ozelTalepler: Record<string, unknown> = {},
  baslatici?: () => Promise<{ yonlendirmeUrl: string }>,
) {
  const { state, akis } = await akisKur(d, ozelTalepler, baslatici);
  const { hedef, kod } = await donusVeKod(d, state);
  if (!kod) return { hedef, kod: null as string | null, akis, sonuc: undefined as any, hata: undefined as any };
  const r = await dene(() => d.servis.degis(kod, SIR));
  return { hedef, kod, akis, sonuc: r.deger, hata: r.hata };
}

const cagrildi = (p: any, tablo: string, islem: string) =>
  p._iz.cagrilar.some((c: any) => c.tablo === tablo && c.islem === islem);

// ═══════════════════════════════════════════════════════════════════════════
//  BOLUMLER
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
//  K1 · BASLATMA — akis satiri ve IdP adresi
// ───────────────────────────────────────────────────────────────────────────
async function bolumBaslat() {
  console.log('── K1 · BASLATMA ──');

  const d0 = dunya({ saglayicilar: [saglayici({ durum: 'TASLAK' })] });
  const r0 = await dene(() => d0.servis.baslat(IDP, BAG));
  check('K1 ETKIN olmayan saglayici → 400 SAGLAYICI_KULLANILAMAZ',
    hataKodu(r0.hata) === 'SAGLAYICI_KULLANILAMAZ' && hataDurumu(r0.hata) === 400,
    JSON.stringify(hataGovdesi(r0.hata)));
  check('K1 ETKIN degilken `ssoAkisi.create` CAGRILMADI', !cagrildi(d0.p, 'ssoAkisi', 'create'));

  const d = dunya();
  const { yonlendirmeUrl } = await d.servis.baslat(IDP, BAG);
  const u = new URL(yonlendirmeUrl);
  const q = u.searchParams;
  const akis = d.p._veri.ssoAkisi[0];

  check('K1 ⭐ `durumOzeti` === sha256(state) (duz state DB de YOK)',
    akis.durumOzeti === sha(q.get('state') as string) && akis.durumOzeti !== q.get('state'),
    `${String(akis.durumOzeti).slice(0, 12)} vs ${sha(q.get('state') as string).slice(0, 12)}`);
  check('K1 ⭐ `tarayiciBagiOzeti` gövdeden geleni AYNEN tasir (sir sunucuda YOK)',
    akis.tarayiciBagiOzeti === BAG && akis.tarayiciBagiOzeti !== SIR);
  check('K1 `nonce` ve `pkceDogrulayici` dolu ve birbirinden farkli',
    typeof akis.nonce === 'string' && akis.nonce.length > 20 &&
    typeof akis.pkceDogrulayici === 'string' && akis.pkceDogrulayici.length > 20 &&
    akis.nonce !== akis.pkceDogrulayici);
  check('K1 `sonGecerlilik` ≈ +10 dk',
    Math.abs(akis.sonGecerlilik.getTime() - (T0MS + 10 * 60 * 1000)) < 2000,
    String(akis.sonGecerlilik));
  check('K1 `amac` = giris, `baslatanUserId` NULL (guardsiz uc)',
    akis.amac === 'giris' && akis.baslatanUserId === null);

  check('K1 ⭐ scope === "openid profile email" (R1-D5)',
    q.get('scope') === 'openid profile email', String(q.get('scope')));
  check('K1 state/nonce URL de DUZ, DB de OZET',
    q.get('nonce') === akis.nonce && sha(q.get('state') as string) === akis.durumOzeti);
  check('K1 PKCE S256 + code_challenge var',
    q.get('code_challenge_method') === 'S256' && (q.get('code_challenge') ?? '').length > 20);
  check('K1 `domain_hint` dogrulanmis alan adiyla dolu',
    q.get('domain_hint') === 'firma.com.tr', String(q.get('domain_hint')));
  check('K1 ⭐ `login_hint` YOK ve URL de E-POSTA GECMIYOR',
    q.get('login_hint') === null && !yonlendirmeUrl.includes('%40') && !yonlendirmeUrl.includes('@'),
    yonlendirmeUrl.slice(0, 160));
  check('K1 `redirect_uri` SABIT (istekten alinmaz)',
    q.get('redirect_uri') === 'https://metapricex.test/api/auth/sso/donus', String(q.get('redirect_uri')));

  // Google dali: alan ipucu `hd` parametresine gider.
  const dg = dunya({ tip: 'google' });
  const g = await dg.servis.baslat(IDP, BAG);
  const gq = new URL(g.yonlendirmeUrl).searchParams;
  check('K1 Google → `hd` ipucu, `domain_hint` YOK',
    gq.get('hd') === 'firma.com.tr' && gq.get('domain_hint') === null);
}

// ───────────────────────────────────────────────────────────────────────────
//  K2-K4 · DONUS — TUKETIM, YAN ETKISIZLIK, KIMLIK KAPILARI
// ───────────────────────────────────────────────────────────────────────────
/** `fetch` cagrilarini sahte Prisma izine yazar: SIRA tek dizide olculsun. */
function fetchIzle(d: Dunya) {
  const orj = d.servis.fetchFn;
  d.servis.fetchFn = async (url: string, o: any) => {
    d.p._iz.cagrilar.push({
      tablo: 'fetch',
      islem: url.includes('/token') ? 'token' : 'diger',
      arg: url,
    });
    return orj(url, o);
  };
}

async function bolumDonus() {
  console.log('── K2-K4 · DONUS ──');

  // K2 — bilinmeyen state
  const d1 = dunya();
  await akisKur(d1);
  fetchIzle(d1);
  const oncekiFetch = d1.p._iz.cagrilar.filter((c: any) => c.tablo === 'fetch').length;
  const y1 = await d1.servis.donus({ code: 'x', state: 'bilinmeyen-state' });
  check('K2 ⭐ bilinmeyen state → 302 `kurumsal_hata=AKIS_GECERSIZ`',
    y1.yonlendirme === 'https://metapricex.test/login?kurumsal_hata=AKIS_GECERSIZ', y1.yonlendirme);
  check('K2 ⭐ bilinmeyen state → IdP ye HIC istek gitmedi',
    d1.p._iz.cagrilar.filter((c: any) => c.tablo === 'fetch').length === oncekiFetch);

  // K2 — suresi dolmus akis
  const d2 = dunya();
  const a2 = await akisKur(d2);
  d2.p._veri.ssoAkisi[0].sonGecerlilik = new Date(T0MS - 1000);
  const y2 = await d2.servis.donus({ code: 'x', state: a2.state });
  check('K2 suresi dolmus akis → AKIS_GECERSIZ', y2.yonlendirme.includes('AKIS_GECERSIZ'), y2.yonlendirme);

  // K2 — state tuketimi token istegiNDEN ONCE + ikinci donus reddi
  const d3 = dunya();
  const a3 = await akisKur(d3);
  fetchIzle(d3);
  d3.p._iz.cagrilar.length = 0;
  await d3.servis.donus({ code: 'yetki-kodu', state: a3.state });
  const izler = d3.p._iz.cagrilar;
  const tuketimSira = izler.findIndex(
    (c: any) => c.tablo === 'ssoAkisi' && c.islem === 'updateMany' && c.arg?.data?.donusAt,
  );
  const tokenSira = izler.findIndex((c: any) => c.tablo === 'fetch' && c.islem === 'token');
  check('K2 ⭐ state tuketimi (`donusAt: null` kosullu) TOKEN ISTEGINDEN ONCE',
    tuketimSira >= 0 && tokenSira >= 0 && tuketimSira < tokenSira,
    `tuketim=${tuketimSira} token=${tokenSira}`);
  const y3 = await d3.servis.donus({ code: 'yetki-kodu', state: a3.state });
  check('K2 ⭐ ayni donus URL i IKINCI kez → AKIS_GECERSIZ (count 0)',
    y3.yonlendirme.includes('AKIS_GECERSIZ'), y3.yonlendirme);

  // K2 — YARIS: ayni state ile IKI donus AYNI ANDA.
  // ⚠ Bu, kosullu tuketimin (`donusAt: null`) TEK gercek gerekcesidir:
  // giristeki `akis.donusAt` on kontrolu SIRALI ikinci istegi zaten eler ama
  // ES ZAMANLI iki istek ikisi de `donusAt`i NULL gorur. Kosul silinirse
  // (mutant #1) IKI SONUC KODU birden uretilir.
  const d3b = dunya();
  const a3b = await akisKur(d3b);
  const yaris = await Promise.all([
    d3b.servis.donus({ code: 'yetki-kodu', state: a3b.state }),
    d3b.servis.donus({ code: 'yetki-kodu', state: a3b.state }),
  ]);
  const kodlu = yaris.filter((y) => y.yonlendirme.includes('/sso/tamam?kod=')).length;
  check('K2 ⭐ ES ZAMANLI iki donus → YALNIZ BIRI kod alir (mutant #1)',
    kodlu === 1 && yaris.some((y) => y.yonlendirme.includes('AKIS_GECERSIZ')),
    JSON.stringify(yaris.map((y) => y.yonlendirme.slice(0, 70))));

  // K3 — gecerli donus YAN ETKISIZ
  const d4 = dunya();
  const a4 = await akisKur(d4);
  d4.p._iz.cagrilar.length = 0;
  const { hedef, kod } = await donusVeKod(d4, a4.state);
  check('K3 ⭐ gecerli donus → 302 `/sso/tamam?kod=`',
    hedef.startsWith('https://metapricex.test/sso/tamam?kod=') && (kod ?? '').length > 20, hedef);
  const satir = d4.p._veri.ssoAkisi[0];
  check('K3 `dogrulanmisKimlik` yazildi (issuer+subject)',
    !!satir.dogrulanmisKimlik?.issuer && !!satir.dogrulanmisKimlik?.subject,
    JSON.stringify(satir.dogrulanmisKimlik ?? null).slice(0, 120));
  check('K3 `sonucKoduOzeti` === sha256(kod) ve omru 60 sn',
    satir.sonucKoduOzeti === sha(kod as string) &&
    Math.abs(satir.sonucSonGecerlilik.getTime() - (T0MS + 60_000)) < 2000);
  const yanEtkiler: [string, string][] = [
    ['kullaniciDisKimlik', 'create'], ['user', 'create'], ['dogrulanmisAlanAdi', 'create'],
    ['user', 'update'], ['kullaniciDisKimlik', 'update'], ['kullaniciDisKimlik', 'updateMany'],
  ];
  for (const [tablo, islem] of yanEtkiler) {
    check(`K3 ⭐ donus YAN ETKISIZ: ${tablo}.${islem} CAGRILMADI`, !cagrildi(d4.p, tablo, islem));
  }

  // K4 — misafir hesap
  const d5 = dunya();
  const a5 = await akisKur(d5, { idp: 'https://sts.windows.net/baska-kiraci/' });
  const y5 = await d5.servis.donus({ code: 'yetki-kodu', state: a5.state });
  check('K4 ⭐ misafir (B2B) token (`idp !== iss`) → MISAFIR_HESAP',
    y5.yonlendirme.includes('kurumsal_hata=MISAFIR_HESAP'), y5.yonlendirme);

  // K4 — baska kiraci (idp YOK)
  const d6 = dunya();
  const a6 = await akisKur(d6, { tid: '99999999-8888-7777-6666-555555555555' });
  const y6 = await d6.servis.donus({ code: 'yetki-kodu', state: a6.state });
  check('K4 ⭐ baska `tid` (idp YOK) → KIRACI_UYUSMADI',
    y6.yonlendirme.includes('kurumsal_hata=KIRACI_UYUSMADI'), y6.yonlendirme);

  // K4 — tuketici (kisisel hesap) kiracisi
  const d7 = dunya();
  const a7 = await akisKur(d7, { tid: '9188040d-6c67-4c5b-b112-36a304b66dad' });
  const y7 = await d7.servis.donus({ code: 'yetki-kodu', state: a7.state });
  check('K4 ⭐ tuketici kiracisi GUID i → KIRACI_UYUSMADI (kisisel MS hesabi)',
    y7.yonlendirme.includes('kurumsal_hata=KIRACI_UYUSMADI'), y7.yonlendirme);

  // K4 — imza hatasi → saglayiciya sonHataKodu
  const d8 = dunya();
  const { state: s8, akis: ak8 } = await akisKur(d8);
  d8.sahte.tokenYanitiniAyarla({
    status: 200,
    govde: { id_token: d8.sahte.idTokenBas({ nonce: ak8.nonce }, { yabanciImza: true }) },
  });
  const y8 = await d8.servis.donus({ code: 'yetki-kodu', state: s8 });
  check('K4 imza hatasi → hata 302 si', y8.yonlendirme.includes('kurumsal_hata='), y8.yonlendirme);
  check('K4 ⭐ imza hatasi saglayiciya `sonHataKodu` yazdi (sahip kartinda gorunur)',
    typeof d8.p._veri.firmaKimlikSaglayici[0].sonHataKodu === 'string',
    String(d8.p._veri.firmaKimlikSaglayici[0].sonHataKodu));
  check('K4 akis satirina da `hataKodu` yazildi', typeof d8.p._veri.ssoAkisi[0].hataKodu === 'string');

  // K4b — `issuer` DB kolonundan DEGIL koddan
  const d9 = dunya({ saglayicilar: [saglayici({ issuer: 'https://BILEREK-YANLIS.example/v2.0' })] });
  const a9 = await akisKur(d9);
  const { kod: k9 } = await donusVeKod(d9, a9.state);
  check('K4b ⭐ DB `issuer` kolonu BILEREK yanlis → akis YINE basarili (kolon OKUNMUYOR)',
    (k9 ?? '').length > 20, String(k9));

  // K4b — Google: `accounts.google.com` bicimli iss de kabul (dizi beklenti)
  const d10 = dunya({ tip: 'google' });
  const a10 = await akisKur(d10, { iss: 'accounts.google.com' });
  const { kod: k10 } = await donusVeKod(d10, a10.state);
  check('K4b ⭐ Google `iss: accounts.google.com` (oneksiz) KABUL (beklenen iss DIZI)',
    (k10 ?? '').length > 20, String(k10));
}

// ───────────────────────────────────────────────────────────────────────────
//  K5-K7 · DEGIS — SEKME SIRRI, BAGLI KIMLIK, MFA DALI
// ───────────────────────────────────────────────────────────────────────────
function disKimlik(ek: Satir = {}): Satir {
  return {
    id: 'DK1', userId: 'U1', saglayiciId: IDP,
    issuer: `https://login.microsoftonline.com/${KIRACI}/v2.0`,
    subject: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    entraKiraciId: KIRACI, epostaAnlik: 'ali@firma.com.tr',
    baglamaYolu: 'acik-baglama', olusturuldu: T0, sonGirisAt: null,
    ...ek,
  };
}

async function bolumDegis() {
  console.log('── K5-K7 · DEGIS ──');

  // K5 — yanlis sir: 401 VE kod TUKENDI (sira kanit)
  const d1 = dunya({ disKimlikler: [disKimlik()] });
  const a1 = await akisKur(d1);
  const { kod: k1 } = await donusVeKod(d1, a1.state);
  const r1 = await dene(() => d1.servis.degis(k1 as string, 'b'.repeat(43)));
  check('K5 ⭐ yanlis sekme sirri → 401 SSO_KOD_GECERSIZ',
    hataDurumu(r1.hata) === 401 && hataKodu(r1.hata) === 'SSO_KOD_GECERSIZ',
    JSON.stringify(hataGovdesi(r1.hata)));
  const r1b = await dene(() => d1.servis.degis(k1 as string, SIR));
  check('K5 ⭐ HEMEN ardindan DOGRU sirla → YINE 401 (tuketim sirdan ONCE, mutant #4)',
    hataDurumu(r1b.hata) === 401, JSON.stringify(hataGovdesi(r1b.hata)));

  // K5 — 61 sn sonra dogru sirla
  const d2 = dunya({ disKimlikler: [disKimlik()] });
  const a2 = await akisKur(d2);
  const { kod: k2 } = await donusVeKod(d2, a2.state);
  d2.servis.simdiMs = () => T0MS + 61_000;
  const r2 = await dene(() => d2.servis.degis(k2 as string, SIR));
  check('K5 ⭐ 61 sn sonra dogru sirla → 401 (`sonucSonGecerlilik` kosulu, mutant #27)',
    hataDurumu(r2.hata) === 401, JSON.stringify(hataGovdesi(r2.hata)));

  // K5 — ikinci kullanim
  const d3 = dunya({ disKimlikler: [disKimlik()] });
  const a3 = await akisKur(d3);
  const { kod: k3 } = await donusVeKod(d3, a3.state);
  await d3.servis.degis(k3 as string, SIR);
  const r3 = await dene(() => d3.servis.degis(k3 as string, SIR));
  check('K5 ayni kod IKINCI kez → 401', hataDurumu(r3.hata) === 401);

  // K6 — bagli kimlik → oturum
  const d4 = dunya({ disKimlikler: [disKimlik()] });
  const t4 = await tamAkis(d4);
  check('K6 ⭐ bagli kimlik → `{ tip: "oturum", token }`',
    t4.sonuc?.tip === 'oturum' && typeof t4.sonuc?.token === 'string' && t4.sonuc.token.length > 20,
    JSON.stringify(t4.sonuc ?? t4.hata?.response ?? t4.hata));
  check('K6 `sonGirisAt` damgalandi', d4.p._veri.kullaniciDisKimlik[0].sonGirisAt instanceof Date);
  check('K6 basarida `dogrulanmisKimlik` NULL landi (kisisel veri)',
    d4.p._veri.ssoAkisi[0].dogrulanmisKimlik === null);

  // K6 — banli
  const d5 = dunya({ kullanicilar: [kullanici({ status: 'banned' })], disKimlikler: [disKimlik()] });
  const t5 = await tamAkis(d5);
  check('K6 banli hesap → HESAP_ASKIDA', hataKodu(t5.hata) === 'HESAP_ASKIDA',
    JSON.stringify(hataGovdesi(t5.hata)));

  // K6 — yonetici
  const d6 = dunya({ kullanicilar: [kullanici({ role: 'admin' })], disKimlikler: [disKimlik()] });
  const t6 = await tamAkis(d6);
  check('K6 ⭐ platform yoneticisi → YONETICI_KURUMSAL_GIRIS_YOK (mutant #15)',
    hataKodu(t6.hata) === 'YONETICI_KURUMSAL_GIRIS_YOK', JSON.stringify(hataGovdesi(t6.hata)));

  // K6 — baska firmanin kullanicisi
  const d7 = dunya({
    kullanicilar: [kullanici({ firmaId: 'F9' })],
    disKimlikler: [disKimlik()],
  });
  const t7 = await tamAkis(d7);
  check('K6 kimlik BASKA firmanin kullanicisinda → KIMLIK_BASKA_FIRMADA',
    hataKodu(t7.hata) === 'KIMLIK_BASKA_FIRMADA', JSON.stringify(hataGovdesi(t7.hata)));

  // K6b — donus ile degis arasinda alan adi SILINDI (Google `hd` kaniti)
  const d8 = dunya({ tip: 'google', disKimlikler: [disKimlik({ issuer: 'https://accounts.google.com', subject: '110248495921238986420' })] });
  const a8 = await akisKur(d8);
  const { kod: k8 } = await donusVeKod(d8, a8.state);
  d8.p._veri.dogrulanmisAlanAdi.length = 0; // sahip alan adini kaldirdi
  const r8 = await dene(() => d8.servis.degis(k8 as string, SIR));
  check('K6b ⭐ donus↔degis arasinda alan adi silindi → ALAN_ADI_TANIMSIZ (mutant #29)',
    hataKodu(r8.hata) === 'ALAN_ADI_TANIMSIZ', JSON.stringify(hataGovdesi(r8.hata)));
  check('K6b ⭐ token VERILMEDI', (r8.deger as any) === undefined);

  // K7 — MFA kisisel
  const d9 = dunya({
    kullanicilar: [kullanici({ mfaAcikAt: T0, mfaKaynagi: 'kisisel' })],
    disKimlikler: [disKimlik()],
  });
  const t9 = await tamAkis(d9);
  check('K7 ⭐ MFA acik + kaynak "kisisel" → `{ tip: "mfa", meydanOkuma }` (mutant #16)',
    t9.sonuc?.tip === 'mfa' && typeof t9.sonuc?.meydanOkuma === 'string',
    JSON.stringify(t9.sonuc ?? hataGovdesi(t9.hata)));
  check('K7 ⭐ MFA dalinda `token` ANAHTARI YOK', !('token' in (t9.sonuc ?? {})));
  const cozulmus9 = JSON.parse(
    Buffer.from(String(t9.sonuc?.meydanOkuma).split('.')[1], 'base64').toString('utf8'),
  );
  check('K7 meydan okuma `yol: "kurumsal"` tasir', cozulmus9.yol === 'kurumsal', JSON.stringify(cozulmus9));

  // K7b — zorunlulukla kurulmus MFA kurumsal giriste SORULMAZ (E-4)
  const d10 = dunya({
    kullanicilar: [kullanici({ mfaAcikAt: T0, mfaKaynagi: 'zorunlu-firma' })],
    disKimlikler: [disKimlik()],
  });
  const t10 = await tamAkis(d10);
  check('K7b ⭐ MFA acik + kaynak "zorunlu-firma" → `{ tip: "oturum" }` (Emre E-4)',
    t10.sonuc?.tip === 'oturum', JSON.stringify(t10.sonuc ?? hataGovdesi(t10.hata)));
}

// ───────────────────────────────────────────────────────────────────────────
//  K8-K9 · E-POSTAYLA BAGLAMA — BES KOSULUN HEPSI AYRI AYRI
// ───────────────────────────────────────────────────────────────────────────
async function bolumEpostaBaglama() {
  console.log('── K8-K9 · E-POSTAYLA BAGLAMA ──');

  // K8 — tum kosullar saglaniyor
  const d = dunya();
  const t = await tamAkis(d);
  check('K8 ⭐ tum kosullar → dis kimlik `eposta-eslesme` ile olusturuldu + token',
    t.sonuc?.tip === 'oturum' &&
    d.p._veri.kullaniciDisKimlik.length === 1 &&
    d.p._veri.kullaniciDisKimlik[0].baglamaYolu === 'eposta-eslesme' &&
    d.p._veri.kullaniciDisKimlik[0].userId === 'U1',
    JSON.stringify(d.p._veri.kullaniciDisKimlik[0] ?? t.hata?.response));

  type Senaryo = {
    ad: string;
    kur: () => Dunya;
    talepler?: Record<string, unknown>;
    kod: string;
  };
  const senaryolar: Senaryo[] = [
    {
      ad: 'K9 `emailVerified: false` → EPOSTA_DOGRULANMAMIS',
      kur: () => dunya({ kullanicilar: [kullanici({ emailVerified: false })] }),
      kod: 'EPOSTA_DOGRULANMAMIS',
    },
    {
      ad: 'K9 mevcut hesap BASKA firmada → KIMLIK_BASKA_FIRMADA',
      kur: () => dunya({ kullanicilar: [kullanici({ firmaId: 'F9' })] }),
      kod: 'KIMLIK_BASKA_FIRMADA',
    },
    {
      ad: 'K9 ⭐ alan adi dogrulanmamis (entra) → EPOSTA_KANITSIZ (mutant #7)',
      kur: () => dunya({ alanAdlari: [alanAdi({ alanAdi: 'baska-alan.com' })] }),
      kod: 'EPOSTA_KANITSIZ',
    },
    {
      ad: 'K9 ⭐ `xms_edov` YOK → EPOSTA_KANITSIZ (kanitsiz e-posta yetki vermez)',
      kur: () => dunya(),
      talepler: { xms_edov: undefined },
      kod: 'EPOSTA_KANITSIZ',
    },
    {
      ad: 'K9 mevcut hesap YONETICI → YONETICI_KURUMSAL_GIRIS_YOK',
      kur: () => dunya({ kullanicilar: [kullanici({ role: 'admin' })] }),
      kod: 'YONETICI_KURUMSAL_GIRIS_YOK',
    },
    {
      ad: 'K9 ayni issuer icin BASKA dis kimlik var → BASKA_KIMLIK_BAGLI',
      kur: () => dunya({ disKimlikler: [disKimlik({ subject: 'baska-subject' })] }),
      kod: 'BASKA_KIMLIK_BAGLI',
    },
  ];
  for (const s of senaryolar) {
    const dd = s.kur();
    const tt = await tamAkis(dd, s.talepler ?? {});
    check(s.ad, hataKodu(tt.hata) === s.kod, JSON.stringify(hataGovdesi(tt.hata)));
    check(`${s.ad} — kullaniciDisKimlik.create CAGRILMADI`,
      !cagrildi(dd.p, 'kullaniciDisKimlik', 'create'));
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  K10-K12 · OTOMATIK KATILIM (V8)
// ───────────────────────────────────────────────────────────────────────────
function bekleyenDavet(ek: Satir = {}): Satir {
  return {
    id: 'D1', firmaId: 'F1', eposta: 'ali@firma.com.tr', tokenHash: 'ozet-1',
    sonGecerlilik: new Date(T0MS + 3 * 24 * 3600_000), kabulAt: null, kabulEdenId: null,
    iptalAt: null, iptalEdenId: null, davetEdenId: 'U0', davetEdenEposta: 's@firma.com.tr',
    gonderimSayisi: 1, sonGonderimAt: T0, olusturuldu: T0, ...ek,
  };
}
/** Firmada hesabi OLMAYAN kisi: sahip baska adreste. */
const sahipFarkli = () => [kullanici({ id: 'U0', email: 'sahip@baska.com', firmaRol: 'sahip' })];

async function bolumKatilim() {
  console.log('── K10-K12 · OTOMATIK KATILIM ──');

  // K10 — jitKatilim acik → bilet
  const d1 = dunya({ kullanicilar: sahipFarkli() });
  const t1 = await tamAkis(d1);
  check('K10 ⭐ hesap yok + jitKatilim → `{ tip: "katilim-onayi", bilet }`',
    t1.sonuc?.tip === 'katilim-onayi' && typeof t1.sonuc?.bilet === 'string' &&
    t1.sonuc?.eposta === 'ali@firma.com.tr' && t1.sonuc?.firmaAd === 'Acme Muhendislik',
    JSON.stringify(t1.sonuc ?? hataGovdesi(t1.hata)));
  check('K10 bilet OZETI satirda, DUZ bilet DEGIL',
    d1.p._veri.ssoAkisi[0].biletOzeti === sha(String(t1.sonuc?.bilet)));
  check('K10 bilet asamasinda `user.create` CAGRILMADI', !cagrildi(d1.p, 'user', 'create'));

  // K10 — jitKatilim kapali + davet yok
  const d2 = dunya({ kullanicilar: sahipFarkli(), saglayicilar: [saglayici({ jitKatilim: false })] });
  const t2 = await tamAkis(d2);
  check('K10 jitKatilim KAPALI + davet yok → KATILIM_KAPALI',
    hataKodu(t2.hata) === 'KATILIM_KAPALI', JSON.stringify(hataGovdesi(t2.hata)));

  // K10 — jitKatilim kapali + BEKLEYEN DAVET var
  const d3 = dunya({
    kullanicilar: sahipFarkli(),
    saglayicilar: [saglayici({ jitKatilim: false })],
    davetler: [bekleyenDavet()],
  });
  const t3 = await tamAkis(d3);
  check('K10 jitKatilim KAPALI ama BEKLEYEN DAVET var → katilim-onayi',
    t3.sonuc?.tip === 'katilim-onayi', JSON.stringify(t3.sonuc ?? hataGovdesi(t3.hata)));

  // K11 — katil: firmaId SATIRDAN, rol uye, parolasiz
  const d4 = dunya({ kullanicilar: sahipFarkli() });
  const t4 = await tamAkis(d4);
  d4.p._iz.cagrilar.length = 0;
  // ⚠ GOVDEYE SALDIRGAN FIRMA KIMLIGI KONUR: `firmaId` SATIRDAN okunmali.
  const y4 = await dene(() => d4.servis.katil({
    bilet: String(t4.sonuc?.bilet), tarayiciSirri: SIR, ticariIletiOnayi: false,
    firmaId: 'SALDIRGAN', firmaRol: 'sahip', role: 'admin',
  } as any));
  const yeni = d4.p._veri.user.find((u: Satir) => u.email === 'ali@firma.com.tr');
  check('K11 ⭐ katilim basarili → `{ tip: "oturum", token }`',
    (y4.deger as any)?.tip === 'oturum' && typeof (y4.deger as any)?.token === 'string',
    JSON.stringify(y4.deger ?? hataGovdesi(y4.hata)));
  check('K11 ⭐ `firmaId` SAGLAYICI SATIRINDAN (F1)', yeni?.firmaId === 'F1', String(yeni?.firmaId));
  check('K11 ⭐ `firmaRol: "uye"` (sema varsayilani "sahip" — ACIKCA yazilmali, mutant #9)',
    yeni?.firmaRol === 'uye', String(yeni?.firmaRol));
  check('K11 `role: "user"`, `parolaTanimli: false`, `emailVerified: true`',
    yeni?.role === 'user' && yeni?.parolaTanimli === false && yeni?.emailVerified === true,
    JSON.stringify({ r: yeni?.role, p: yeni?.parolaTanimli, e: yeni?.emailVerified }));
  check('K11 ⭐ sozlesme onayi DAMGALANDI (faz5 B3/B4 kaynak kapisinin davranis ikizi)',
    yeni?.sozlesmeOnayiAt instanceof Date && typeof yeni?.sozlesmeSurumu === 'string' &&
    yeni.sozlesmeSurumu.length > 0,
    JSON.stringify({ a: yeni?.sozlesmeOnayiAt, s: yeni?.sozlesmeSurumu }));
  check('K11 ⭐ `firma.create` CAGRILMADI (katilan kisi YENI FIRMA ACMAZ)',
    !cagrildi(d4.p, 'firma', 'create'));
  check('K11 dis kimlik `otomatik-katilim` ile yazildi',
    d4.p._veri.kullaniciDisKimlik.some((x: Satir) => x.baglamaYolu === 'otomatik-katilim'));
  check('K11 FirmaOlayi `uye.katildi` + `veri.yol = kurumsal-giris`',
    d4.p._veri.firmaOlayi.some((o: Satir) => o.tip === 'uye.katildi' && o.veri?.yol === 'kurumsal-giris'),
    JSON.stringify(d4.p._veri.firmaOlayi));
  const kilitSira = d4.p._iz.cagrilar.findIndex((c: any) => c.tablo === '$queryRaw');
  const sayimSira = d4.p._iz.cagrilar.findIndex((c: any) => c.tablo === 'user' && c.islem === 'count');
  check('K11 ⭐ firma kilidi (`firma-uyelik:`) KOLTUK SAYIMINDAN ONCE',
    kilitSira >= 0 && sayimSira > kilitSira &&
    String(d4.p._iz.ham[0]).includes('firma-uyelik:F1'),
    `kilit=${kilitSira} sayim=${sayimSira} ham=${String(d4.p._iz.ham[0]).slice(0, 60)}`);

  // K11 — davet varsa kabul damgasi
  const d5 = dunya({ kullanicilar: sahipFarkli(), davetler: [bekleyenDavet()] });
  const t5 = await tamAkis(d5);
  await d5.servis.katil({ bilet: String(t5.sonuc?.bilet), tarayiciSirri: SIR } as any);
  check('K11 bekleyen davet `kabulAt` damgalandi',
    d5.p._veri.firmaDavet[0].kabulAt instanceof Date &&
    typeof d5.p._veri.firmaDavet[0].kabulEdenId === 'string');

  // K11 — koltuk dolu
  const d6 = dunya({
    kullanicilar: [
      kullanici({ id: 'U0', email: 'sahip@baska.com', firmaRol: 'sahip' }),
      kullanici({ id: 'U2', email: 'ikinci@firma.com.tr' }),
    ],
    abonelikler: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 2 } } }],
  });
  const t6 = await tamAkis(d6);
  const y6 = await dene(() => d6.servis.katil({ bilet: String(t6.sonuc?.bilet), tarayiciSirri: SIR } as any));
  check('K11 ⭐ koltuk dolu → 400 KOLTUK_DOLU (mutant #10)',
    hataKodu(y6.hata) === 'KOLTUK_DOLU', JSON.stringify(hataGovdesi(y6.hata)));
  check('K11 koltuk dolu → `user.create` YOK',
    !d6.p._veri.user.some((u: Satir) => u.email === 'ali@firma.com.tr'));

  // K11b — bilet alindiktan SONRA sahip jitKatilim i kapatti
  const d7 = dunya({ kullanicilar: sahipFarkli() });
  const t7 = await tamAkis(d7);
  d7.p._veri.firmaKimlikSaglayici[0].jitKatilim = false;
  const y7 = await dene(() => d7.servis.katil({ bilet: String(t7.sonuc?.bilet), tarayiciSirri: SIR } as any));
  check('K11b ⭐ bilet sonrasi jitKatilim kapandi → 400 KATILIM_KAPALI (mutant #28)',
    hataKodu(y7.hata) === 'KATILIM_KAPALI', JSON.stringify(hataGovdesi(y7.hata)));
  check('K11b `user.create` YOK', !d7.p._veri.user.some((u: Satir) => u.email === 'ali@firma.com.tr'));

  // K12 — bilet ikinci kullanim / yanlis sir / sure
  const d8 = dunya({ kullanicilar: sahipFarkli() });
  const t8 = await tamAkis(d8);
  await d8.servis.katil({ bilet: String(t8.sonuc?.bilet), tarayiciSirri: SIR } as any);
  const y8 = await dene(() => d8.servis.katil({ bilet: String(t8.sonuc?.bilet), tarayiciSirri: SIR } as any));
  check('K12 bilet IKINCI kullanim → 401', hataDurumu(y8.hata) === 401, JSON.stringify(hataGovdesi(y8.hata)));

  const d9 = dunya({ kullanicilar: sahipFarkli() });
  const t9 = await tamAkis(d9);
  const y9 = await dene(() => d9.servis.katil({ bilet: String(t9.sonuc?.bilet), tarayiciSirri: 'c'.repeat(43) } as any));
  check('K12 ⭐ YANLIS sekme sirri → 401 ve hesap ACILMADI',
    hataDurumu(y9.hata) === 401 && !d9.p._veri.user.some((u: Satir) => u.email === 'ali@firma.com.tr'),
    JSON.stringify(hataGovdesi(y9.hata)));

  const d10 = dunya({ kullanicilar: sahipFarkli() });
  const t10 = await tamAkis(d10);
  d10.servis.simdiMs = () => T0MS + 11 * 60 * 1000;
  const y10 = await dene(() => d10.servis.katil({ bilet: String(t10.sonuc?.bilet), tarayiciSirri: SIR } as any));
  check('K12 bilet suresi dolmus (11 dk) → 401', hataDurumu(y10.hata) === 401);
}

// ───────────────────────────────────────────────────────────────────────────
//  K13-K14 · SINAMA ve ACIK BAGLAMA
// ───────────────────────────────────────────────────────────────────────────
const SAHIP = () => kullanici({ id: 'U1', email: 'ali@firma.com.tr', firmaRol: 'sahip' });

async function sinamaAkisi(d: Dunya, talepler: Record<string, unknown> = {}, userId = 'U1') {
  return tamAkis(d, talepler, () =>
    d.servis.niyet({ id: userId }, 'sinama', BAG, 'dogru-parola', null));
}

async function bolumSinama() {
  console.log('── K13-K14 · SINAMA ve BAGLAMA ──');

  // K13 — basari: alan adi dogrulandi + durum DOGRULANDI + sahip hesabi bagli
  const d1 = dunya({ kullanicilar: [SAHIP()], saglayicilar: [saglayici({ durum: 'TASLAK' })], alanAdlari: [] });
  const t1 = await sinamaAkisi(d1);
  check('K13 ⭐ sinama basarili → `{ tip: "sinandi", alanAdlari }`',
    t1.sonuc?.tip === 'sinandi' && (t1.sonuc?.alanAdlari ?? []).includes('firma.com.tr'),
    JSON.stringify(t1.sonuc ?? hataGovdesi(t1.hata)));
  check('K13 `DogrulanmisAlanAdi` satiri yazildi',
    d1.p._veri.dogrulanmisAlanAdi.length === 1 &&
    d1.p._veri.dogrulanmisAlanAdi[0].alanAdi === 'firma.com.tr');
  check('K13 durum TASLAK → DOGRULANDI', d1.p._veri.firmaKimlikSaglayici[0].durum === 'DOGRULANDI');
  check('K13 FirmaOlayi `kurumsal-giris.dogrulandi`',
    d1.p._veri.firmaOlayi.some((o: Satir) => o.tip === 'kurumsal-giris.dogrulandi'));
  check('K13b ⭐ kanitli e-posta SAHIBIN e-postasina ESIT → hesap BAGLANDI',
    t1.sonuc?.hesapBaglandi === true &&
    d1.p._veri.kullaniciDisKimlik.length === 1 &&
    d1.p._veri.kullaniciDisKimlik[0].baglamaYolu === 'sinama',
    JSON.stringify(d1.p._veri.kullaniciDisKimlik[0] ?? null));

  // K13b — e-postalar FARKLI: alan adi YINE dogrulanir, hesap BAGLANMAZ
  const d2 = dunya({
    kullanicilar: [kullanici({ id: 'U1', email: 'patron@firma.com.tr', firmaRol: 'sahip' })],
    saglayicilar: [saglayici({ durum: 'TASLAK' })], alanAdlari: [],
  });
  const t2 = await sinamaAkisi(d2);
  check('K13b ⭐ e-postalar FARKLI → alan adi dogrulandi ama `hesapBaglandi: false` (mutant #35)',
    t2.sonuc?.tip === 'sinandi' && t2.sonuc?.hesapBaglandi === false &&
    d2.p._veri.dogrulanmisAlanAdi.length === 1,
    JSON.stringify(t2.sonuc ?? hataGovdesi(t2.hata)));
  check('K13b ⭐ `kullaniciDisKimlik.create` CAGRILMADI', !cagrildi(d2.p, 'kullaniciDisKimlik', 'create'));

  // K13 — baslatan artik sahip DEGIL
  const d3 = dunya({ kullanicilar: [SAHIP()], saglayicilar: [saglayici({ durum: 'TASLAK' })], alanAdlari: [] });
  const a3 = await akisKur(d3, {}, () => d3.servis.niyet({ id: 'U1' }, 'sinama', BAG, 'dogru-parola', null));
  const { kod: k3 } = await donusVeKod(d3, a3.state);
  d3.p._veri.user[0].firmaRol = 'uye'; // arada rolu dusuruldu
  const r3 = await dene(() => d3.servis.degis(k3 as string, SIR));
  check('K13 ⭐ baslatan artik sahip DEGIL → red (mutant #26)',
    hataKodu(r3.hata) === 'FIRMA_SAHIBI_GEREKLI', JSON.stringify(hataGovdesi(r3.hata)));
  check('K13 ⭐ alan adi satiri YAZILMADI', d3.p._veri.dogrulanmisAlanAdi.length === 0);

  // K13 — `xms_edov` yok → SINAMA_KANITSIZ
  const d4 = dunya({ kullanicilar: [SAHIP()], saglayicilar: [saglayici({ durum: 'TASLAK' })], alanAdlari: [] });
  const t4 = await sinamaAkisi(d4, { xms_edov: undefined });
  check('K13 `xms_edov` yok → SINAMA_KANITSIZ',
    hataKodu(t4.hata) === 'SINAMA_KANITSIZ', JSON.stringify(hataGovdesi(t4.hata)));

  // K13 — beyan disi alan adi
  const d5 = dunya({
    kullanicilar: [SAHIP()],
    saglayicilar: [saglayici({ durum: 'TASLAK', beyanAlanAdlari: ['baska-sirket.com'] })],
    alanAdlari: [],
  });
  const t5 = await sinamaAkisi(d5);
  check('K13 ⭐ beyan disi alan adi → SINAMA_ALAN_ADI_UYUSMADI (mutant #22)',
    hataKodu(t5.hata) === 'SINAMA_ALAN_ADI_UYUSMADI', JSON.stringify(hataGovdesi(t5.hata)));
  check('K13 beyan disiyken alan satiri YAZILMADI', d5.p._veri.dogrulanmisAlanAdi.length === 0);

  // K13 — alan adi BASKA firmada dogrulanmis (PK cakismasi)
  const d6 = dunya({
    kullanicilar: [SAHIP()],
    saglayicilar: [saglayici({ durum: 'TASLAK' })],
    alanAdlari: [alanAdi({ saglayiciId: 'IDP-BASKA', firmaId: 'F9' })],
  });
  const t6 = await sinamaAkisi(d6);
  check('K13 alan adi BASKA firmada → SINAMA_ALAN_ADI_BASKA_FIRMADA',
    hataKodu(t6.hata) === 'SINAMA_ALAN_ADI_BASKA_FIRMADA', JSON.stringify(hataGovdesi(t6.hata)));

  // K14 — acik baglama basarisi
  const d7 = dunya({ saglayicilar: [saglayici({ durum: 'DOGRULANDI' })] });
  const t7 = await tamAkis(d7, {}, () => d7.servis.niyet({ id: 'U1' }, 'bagla', BAG, 'dogru-parola', null));
  check('K14 ⭐ acik baglama → `{ tip: "baglandi" }` + `acik-baglama`',
    t7.sonuc?.tip === 'baglandi' &&
    d7.p._veri.kullaniciDisKimlik[0]?.baglamaYolu === 'acik-baglama',
    JSON.stringify(t7.sonuc ?? hataGovdesi(t7.hata)));
  check('K14 bilgi e-postasi gonderildi',
    d7.giden.some((g) => g.kime === 'ali@firma.com.tr'), JSON.stringify(d7.giden));
  check('K14 FirmaOlayi `kurumsal-baglanti.eklendi`',
    d7.p._veri.firmaOlayi.some((o: Satir) => o.tip === 'kurumsal-baglanti.eklendi'));

  // K14b — kanitli e-posta hesabin e-postasindan FARKLI
  const d8 = dunya({
    kullanicilar: [kullanici({ email: 'baska@firma.com.tr' })],
    saglayicilar: [saglayici({ durum: 'DOGRULANDI' })],
  });
  const t8 = await tamAkis(d8, {}, () => d8.servis.niyet({ id: 'U1' }, 'bagla', BAG, 'dogru-parola', null));
  check('K14b ⭐ e-posta FARKLI → 400 EPOSTA_UYUSMADI (mutant #25)',
    hataKodu(t8.hata) === 'EPOSTA_UYUSMADI', JSON.stringify(hataGovdesi(t8.hata)));
  check('K14b `kullaniciDisKimlik.create` CAGRILMADI', !cagrildi(d8.p, 'kullaniciDisKimlik', 'create'));

  const d9 = dunya({ saglayicilar: [saglayici({ durum: 'DOGRULANDI' })] });
  const t9 = await tamAkis(d9, { xms_edov: undefined }, () =>
    d9.servis.niyet({ id: 'U1' }, 'bagla', BAG, 'dogru-parola', null));
  check('K14b ⭐ `epostaKanitli` null (xms_edov yok) → AYNI ret EPOSTA_UYUSMADI',
    hataKodu(t9.hata) === 'EPOSTA_UYUSMADI', JSON.stringify(hataGovdesi(t9.hata)));

  // K14 — kimlik baska kullanicida
  const d10 = dunya({
    kullanicilar: [kullanici(), kullanici({ id: 'U2', email: 'ikinci@firma.com.tr' })],
    saglayicilar: [saglayici({ durum: 'DOGRULANDI' })],
    disKimlikler: [disKimlik({ userId: 'U2' })],
  });
  const t10 = await tamAkis(d10, {}, () => d10.servis.niyet({ id: 'U1' }, 'bagla', BAG, 'dogru-parola', null));
  check('K14 kimlik BASKA kullanicida → KIMLIK_BASKA_HESAPTA',
    hataKodu(t10.hata) === 'KIMLIK_BASKA_HESAPTA', JSON.stringify(hataGovdesi(t10.hata)));

  // K14 — Google `hd` dogrulanmamis
  const d11 = dunya({ tip: 'google', saglayicilar: [saglayici({ tip: 'google', entraKiraciId: null, issuer: 'https://accounts.google.com', durum: 'DOGRULANDI' })], alanAdlari: [] });
  const t11 = await tamAkis(d11, {}, () => d11.servis.niyet({ id: 'U1' }, 'bagla', BAG, 'dogru-parola', null));
  check('K14 Google `hd` dogrulanmamis → ALAN_ADI_TANIMSIZ',
    hataKodu(t11.hata) === 'ALAN_ADI_TANIMSIZ', JSON.stringify(hataGovdesi(t11.hata)));

  // K14d — `niyet` parola kapisi
  for (const amac of ['bagla', 'sinama'] as const) {
    const dd = dunya({ kullanicilar: [SAHIP()], saglayicilar: [saglayici({ durum: 'DOGRULANDI' })] });
    const rBos = await dene(() => dd.servis.niyet({ id: 'U1' }, amac, BAG, undefined, null));
    check(`K14d ⭐ niyet(${amac}) PAROLASIZ → 400 PAROLA_HATALI (mutant #36)`,
      hataKodu(rBos.hata) === 'PAROLA_HATALI', JSON.stringify(hataGovdesi(rBos.hata)));
    const rYanlis = await dene(() => dd.servis.niyet({ id: 'U1' }, amac, BAG, 'yanlis', null));
    check(`K14d niyet(${amac}) YANLIS parola → 400 PAROLA_HATALI`,
      hataKodu(rYanlis.hata) === 'PAROLA_HATALI');
    check(`K14d niyet(${amac}) reddinde ssoAkisi.create CAGRILMADI`,
      !cagrildi(dd.p, 'ssoAkisi', 'create'));
  }

  // K14d — sinama icin sahip kapisi
  const d12 = dunya({ kullanicilar: [kullanici({ firmaRol: 'uye' })] });
  const r12 = await dene(() => d12.servis.niyet({ id: 'U1' }, 'sinama', BAG, 'dogru-parola', null));
  check('K14d uye "sina" baslatamaz → 403 FIRMA_SAHIBI_GEREKLI',
    hataKodu(r12.hata) === 'FIRMA_SAHIBI_GEREKLI' && hataDurumu(r12.hata) === 403,
    JSON.stringify(hataGovdesi(r12.hata)));
}

// ───────────────────────────────────────────────────────────────────────────
//  K15-K17 · ZORUNLU KURUMSAL GIRIS (V7) ve ETKINLESTIRME
// ───────────────────────────────────────────────────────────────────────────
const configSahte = { get: () => 'https://metapricex.test' } as any;
const epostaSahteBasit = () => {
  const giden: { kime: string; konu: string }[] = [];
  return {
    giden,
    servis: {
      gonder: async (t: any) => { giden.push({ kime: t.kime, konu: t.konu }); },
      gonderKritik: async (t: any) => { giden.push({ kime: t.kime, konu: t.konu }); },
    } as any,
  };
};
function authKur(p: any) {
  const oturum = new OturumServisi(p, jwtSahte);
  return new AuthService(
    p, jwtSahte,
    { karar: async () => ({}) } as any,
    { dogrulamaGonderSessizce: async () => undefined } as any,
    oturum,
  );
}
/** ETKIN + zorunlu saglayici + dogrulanmis alan adi. */
const zorunluDunya = (ek: Satir = {}, kullanicilar?: Satir[]) =>
  db({
    user: kullanicilar ?? [kullanici()],
    firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: true, ...ek })],
    dogrulanmisAlanAdi: [alanAdi()],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 3 } } }],
  });

async function bolumZorunluluk() {
  console.log('── K15-K17 · ZORUNLULUK (V7) ──');

  // K15 — zorunlu uye + DOGRU parola
  const p1 = zorunluDunya();
  const r1 = await dene(() => authKur(p1).login({ email: 'ali@firma.com.tr', password: 'dogru-parola' } as any));
  check('K15 ⭐ zorunlu uye + DOGRU parola → 400 KURUMSAL_GIRIS_ZORUNLU (mutant #11)',
    hataKodu(r1.hata) === 'KURUMSAL_GIRIS_ZORUNLU' && hataDurumu(r1.hata) === 400,
    JSON.stringify(hataGovdesi(r1.hata)));
  check('K15 ⭐ yanitta token/meydan okuma YOK',
    r1.deger === undefined && !('token' in (hataGovdesi(r1.hata) ?? {})));

  // K15 — zorunlu uye + YANLIS parola → 401 (SIRA kaniti)
  const p2 = zorunluDunya();
  const r2 = await dene(() => authKur(p2).login({ email: 'ali@firma.com.tr', password: 'yanlis' } as any));
  check('K15 ⭐ zorunlu uye + YANLIS parola → 401 (V7 kontrolu paroladan SONRA, mutant #12)',
    hataDurumu(r2.hata) === 401 && hataKodu(r2.hata) !== 'KURUMSAL_GIRIS_ZORUNLU',
    `${hataDurumu(r2.hata)} ${JSON.stringify(hataGovdesi(r2.hata))}`);

  // K15 — platform yoneticisi MUAF
  const p3 = zorunluDunya({}, [kullanici({ role: 'admin' })]);
  const r3 = await dene(() => authKur(p3).login({ email: 'ali@firma.com.tr', password: 'dogru-parola' } as any));
  check('K15 ⭐ platform yoneticisi MUAF → normal akis (token ya da MFA)',
    r3.hata === undefined, JSON.stringify(hataGovdesi(r3.hata)));

  // K15 — zorunlu DEGIL
  const p4 = db({
    user: [kullanici()], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: false })],
    dogrulanmisAlanAdi: [alanAdi()],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 3 } } }],
  });
  const r4 = await dene(() => authKur(p4).login({ email: 'ali@firma.com.tr', password: 'dogru-parola' } as any));
  check('K15 zorunlu DEGIL → normal giris', r4.hata === undefined && (r4.deger as any)?.token);

  // K15 — alan adi AYNI ama kullanici BASKA firmada → zorunluluk uygulanmaz
  const p4b = zorunluDunya({}, [kullanici({ firmaId: 'F9' })]);
  const r4b = await dene(() => authKur(p4b).login({ email: 'ali@firma.com.tr', password: 'dogru-parola' } as any));
  check('K15 alan adi ayni ama BASKA firmanin uyesi → zorunluluk YOK (kisi ekseni)',
    r4b.hata === undefined, JSON.stringify(hataGovdesi(r4b.hata)));

  // K16 — `sifirlamaIste` tekduze cevap + e-posta YOK
  const p5 = zorunluDunya();
  const e5 = epostaSahteBasit();
  const parola5 = new ParolaServisi(p5, e5.servis, { signToken: () => 'tkn' } as any, configSahte);
  const y5 = await parola5.sifirlamaIste('ali@firma.com.tr');
  check('K16 ⭐ zorunlu hesapta `sifirlamaIste` TEKDUZE cevap',
    JSON.stringify(y5) === JSON.stringify(ParolaServisi.TEKDUZE_CEVAP), JSON.stringify(y5));
  check('K16 ⭐ zorunlu hesapta sifirlama E-POSTASI GONDERILMEDI (mutant #13)',
    e5.giden.length === 0, JSON.stringify(e5.giden));

  // K16 — `sifirla` 400
  const kul6 = kullanici();
  const p6 = db({
    user: [kul6], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: true })],
    dogrulanmisAlanAdi: [alanAdi()],
    passwordResetToken: [{
      id: 'pr1', userId: 'U1', tokenHash: createHash('sha256').update('sifirlama-token').digest('hex'),
      // ⚠ SAAT BOMBASI ONARILDI (21.09, Gorunur kusurlar turu · G5 yan bulgu).
      // Eskiden `new Date(T0MS + 3_600_000)` idi; `T0` SABIT bir an
      // (2026-09-21T10:00Z) ama `sifirla()` suresi dolmayi GERCEK saatle
      // olcuyor (parola.servisi.ts: `expiresAt.getTime() <= Date.now()`).
      // Yani bu satir 21.09 saat 11:00 UTC'den itibaren KALICI kirmiziydi:
      // token suresi dolmus sayilip akis `KURUMSAL_GIRIS_ZORUNLU` kapisina
      // HIC ULASMIYORDU — kapi olcmeden "gecer" degil, olcmeden DUSERDI.
      // Sabit ana degil GERCEK ana gore uretilir; K16 neyi olcuyorsa onu
      // olcmeye devam eder (T0'a bagli diger fixture'lar degismedi).
      expiresAt: new Date(Date.now() + 3_600_000), usedAt: null, user: kul6,
    }],
  });
  const parola6 = new ParolaServisi(p6, epostaSahteBasit().servis, { signToken: () => 'tkn' } as any, configSahte);
  const r6 = await dene(() => parola6.sifirla('sifirlama-token', 'yeni-parola-123'));
  check('K16 zorunlu hesapta `sifirla` → 400 KURUMSAL_GIRIS_ZORUNLU',
    hataKodu(r6.hata) === 'KURUMSAL_GIRIS_ZORUNLU' && hataDurumu(r6.hata) === 400,
    JSON.stringify(hataGovdesi(r6.hata)));

  // K16 — `register` alan adi ekseni
  const p7 = db({
    user: [], firma: [],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: true })],
    dogrulanmisAlanAdi: [alanAdi()],
  });
  const r7 = await dene(() => authKur(p7).register({
    email: 'yeni@firma.com.tr', password: 'parola1234', sozlesmeOnayi: true,
  } as any));
  check('K16 ⭐ zorunlu ALAN ADINDA `register` → 400 (golge parolali hesap yolu kapali, mutant #14)',
    hataKodu(r7.hata) === 'KURUMSAL_GIRIS_ZORUNLU', JSON.stringify(hataGovdesi(r7.hata)));
  check('K16 register reddinde `user.create` CAGRILMADI', !cagrildi(p7, 'user', 'create'));

  // K16 — `davetKabul` parola yolu
  const p8 = db({
    user: [kullanici({ id: 'U0', email: 'sahip@firma.com.tr', firmaRol: 'sahip' })],
    firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: true })],
    dogrulanmisAlanAdi: [alanAdi()],
    firmaDavet: [bekleyenDavet({ eposta: 'yeni@firma.com.tr', tokenHash: createHash('sha256').update('davet-token').digest('hex') })],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 3 } } }],
  });
  const uyelik8 = new UyelikServisi(p8, epostaSahteBasit().servis, new OturumServisi(p8, jwtSahte), configSahte);
  const r8 = await dene(() => uyelik8.davetKabul({
    token: 'davet-token', parola: 'parola1234', sozlesmeOnayi: true,
  } as any));
  check('K16 ⭐ zorunlu firmada `davetKabul` PAROLA YOLU → 400 KURUMSAL_GIRIS_ZORUNLU',
    hataKodu(r8.hata) === 'KURUMSAL_GIRIS_ZORUNLU', JSON.stringify(hataGovdesi(r8.hata)));
  const bilgi8 = await uyelik8.davetBilgi('davet-token');
  check('K16 `davetBilgi` yanitinda `kurumsalGiris.var/zorunlu/tip` dolu',
    bilgi8.kurumsalGiris?.var === true && bilgi8.kurumsalGiris?.zorunlu === true &&
    bilgi8.kurumsalGiris?.tip === 'entra',
    JSON.stringify(bilgi8.kurumsalGiris));

  // K17 — `etkinlestir { zorunlu: true }` on sarti
  const ayarKur = (p: any) => new KurumsalGirisAyarServisi(
    p,
    new ParolaServisi(p, epostaSahteBasit().servis, { signToken: () => 'tkn' } as any, configSahte),
    new KurumsalGirisServisi(p, new OturumServisi(p, jwtSahte), epostaSahteBasit().servis, configSahte),
  );
  const p9 = db({
    user: [kullanici({ firmaRol: 'sahip' })], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'DOGRULANDI' })],
    dogrulanmisAlanAdi: [alanAdi()],
  });
  const r9 = await dene(() => ayarKur(p9).etkinlestir({ userId: 'U1', firmaId: 'F1' }, { jitKatilim: true, zorunlu: true }));
  check('K17 ⭐ sahibin alan adi DOGRULANMIS + dis kimlik YOK → ONCE_HESABINIZI_BAGLAYIN (mutant #21)',
    hataKodu(r9.hata) === 'ONCE_HESABINIZI_BAGLAYIN', JSON.stringify(hataGovdesi(r9.hata)));

  const p10 = db({
    user: [kullanici({ firmaRol: 'sahip', email: 'patron@kisisel.com' })], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'DOGRULANDI' })],
    dogrulanmisAlanAdi: [alanAdi()],
  });
  const r10 = await dene(() => ayarKur(p10).etkinlestir({ userId: 'U1', firmaId: 'F1' }, { jitKatilim: true, zorunlu: true }));
  check('K17 ⭐ sahibin alan adi DOGRULANMIS DEGIL → IZIN (sahip kilitlenmez)',
    r10.hata === undefined && p10._veri.firmaKimlikSaglayici[0].zorunlu === true,
    JSON.stringify(hataGovdesi(r10.hata)));

  const p11 = db({
    user: [kullanici({ firmaRol: 'sahip' })], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'TASLAK' })],
    dogrulanmisAlanAdi: [],
  });
  const r11 = await dene(() => ayarKur(p11).etkinlestir({ userId: 'U1', firmaId: 'F1' }, { jitKatilim: true, zorunlu: false }));
  check('K17 DOGRULANMADI → 400 DOGRULANMADI', hataKodu(r11.hata) === 'DOGRULANMADI',
    JSON.stringify(hataGovdesi(r11.hata)));
}

// ───────────────────────────────────────────────────────────────────────────
//  K18-K19 · PAROLASIZ HESAP ve KAPATMA AKISI
// ───────────────────────────────────────────────────────────────────────────
const SN = (ms: number) => Math.floor(ms / 1000);

async function bolumParolasiz() {
  console.log('── K18-K19 · PAROLASIZ HESAP ──');

  const kapatmaDunyasi = (ek: Satir = {}) => db({
    user: [kullanici({ parolaTanimli: false, firmaRol: 'sahip', ...ek })],
    firma: [firma()],
    kullaniciDisKimlik: [disKimlik()],
  });

  // K18 — authAt 11 dk once
  const p1 = kapatmaDunyasi();
  const h1 = new HesapServisi(p1, { iptalEt: async () => undefined } as any);
  const r1 = await dene(() => h1.hesabiKapat('U1', '', SN(Date.now() - 11 * 60 * 1000)));
  check('K18 ⭐ parolasiz + `authAt` 11 dk once → 400 YENIDEN_GIRIS_GEREKLI (mutant #17)',
    hataKodu(r1.hata) === 'YENIDEN_GIRIS_GEREKLI' && hataDurumu(r1.hata) === 400,
    JSON.stringify(hataGovdesi(r1.hata)));
  check('K18 ⭐ `user.update` CAGRILMADI (hesap KAPATILMADI)', !cagrildi(p1, 'user', 'update'));

  // K18 — authAt 5 dk once → kapanir + dis kimlik silinir
  const p2 = kapatmaDunyasi();
  const h2 = new HesapServisi(p2, { iptalEt: async () => undefined } as any);
  const r2 = await dene(() => h2.hesabiKapat('U1', '', SN(Date.now() - 5 * 60 * 1000)));
  check('K18 ⭐ parolasiz + `authAt` 5 dk once → hesap KAPANDI',
    r2.hata === undefined && p2._veri.user[0].deletedAt instanceof Date,
    JSON.stringify(hataGovdesi(r2.hata)));
  check('K19 ⭐ hesap kapatma `kullaniciDisKimlik.deleteMany` CAGIRDI (mutant #18)',
    cagrildi(p2, 'kullaniciDisKimlik', 'deleteMany') && p2._veri.kullaniciDisKimlik.length === 0);

  // K18 — PAROLALI hesapta bcrypt dali AYNEN (faz5 C4)
  const p3 = db({ user: [kullanici({ firmaRol: 'sahip' })], firma: [firma()], kullaniciDisKimlik: [] });
  const h3 = new HesapServisi(p3, { iptalEt: async () => undefined } as any);
  const r3y = await dene(() => h3.hesabiKapat('U1', 'yanlis-parola', null));
  // ⚠ 21.09 (Gorunur kusurlar turu, t.16): BEKLENEN 401'DEN 400'E CEKILDI.
  // Bu assert'in AMACI "bcrypt dali kosuyor mu" idi, "401 dogru kod mu" DEGIL —
  // ve 401 YANLISTI: `frontend/ortak/lib/api.ts` yakalayicisi korumali bir
  // uctan gelen 401'i "oturum bitti" sayip token'i siliyor, yani parolasini
  // yanlis yazan kullanici hesap kapatma ekranindan DISARI atiliyordu.
  // Artik F3b'nin ust satirdaki YENIDEN_GIRIS_GEREKLI dali ile AYNI sekil:
  // 400 + `kod`. Olcut korundu: dal hala KESIYOR (hesap kapanmiyor) ve
  // asagidaki "DOGRU parola → kapandi" assert'i bcrypt dalinin kostugunu
  // kanitliyor. Ayrinti + kaba kuvvet siniri: `npm run test:parola-kapisi`.
  check('K18 parolali hesapta YANLIS parola → 400 PAROLA_HATALI (bcrypt dali kesiyor)',
    hataDurumu(r3y.hata) === 400 && hataKodu(r3y.hata) === 'PAROLA_HATALI'
      && !(p3._veri.user[0].deletedAt instanceof Date),
    JSON.stringify(hataGovdesi(r3y.hata)));
  const r3d = await dene(() => h3.hesabiKapat('U1', 'dogru-parola', null));
  check('K18 parolali hesapta DOGRU parola → kapandi (`authAt` ARANMAZ)',
    r3d.hata === undefined && p3._veri.user[0].deletedAt instanceof Date,
    JSON.stringify(hataGovdesi(r3d.hata)));

  // K18b — `degistir` parolasiz hesapta 400 PAROLA_YOK (401 DEGIL)
  const p4 = db({ user: [kullanici({ parolaTanimli: false })] });
  const parola4 = new ParolaServisi(p4, epostaSahteBasit().servis, { signToken: () => 'tkn' } as any, configSahte);
  const r4 = await dene(() => parola4.degistir('U1', 'x', 'yeni-parola-123'));
  check('K18b ⭐ parolasiz hesapta `degistir` → 400 PAROLA_YOK (401 DEGIL: oturum DUSMEZ)',
    hataKodu(r4.hata) === 'PAROLA_YOK' && hataDurumu(r4.hata) === 400,
    `${hataDurumu(r4.hata)} ${JSON.stringify(hataGovdesi(r4.hata))}`);

  // K18c — MFA yeniden basimi `authAt`i TAZELEMEZ
  const simdiSn = Math.floor(Date.now() / 1000);
  const eskiAuthAt = simdiSn - 20 * 60;
  const p5 = db({
    user: [kullanici({ parolaTanimli: false, firmaRol: 'sahip', mfaAcikAt: null, mfaBekleyenSirSifreli: null })],
    firma: [firma()], kullaniciDisKimlik: [disKimlik()],
  });
  // ⚠ GERCEK YOL: F2b `mfa/kurulum/onayla` ucu token'i YENIDEN BASAR. Kapi
  // `oturumYaniti`yi dogrudan cagirmaz — o, mutantin (`authAt: simdiSn`)
  // yasadigi satiri ATLARDI ve kapi YALANCI YESIL olurdu.
  const b32 = base32Kodla(totpSiriUret());
  p5._veri.user[0].mfaBekleyenSirSifreli = sifrele(b32, 'mfa:U1');
  p5._veri.user[0].mfaBekleyenAt = new Date();
  const mfa5 = new MfaServisi(p5, new OturumServisi(p5, jwtSahte), epostaSahteBasit().servis);
  const onay5: any = await mfa5.kurulumOnayla(
    'U1',
    hotp(base32Coz(b32), totpAdim(Date.now())),
    eskiAuthAt,
  );
  const yuk5 = JSON.parse(Buffer.from(String(onay5.token).split('.')[1], 'base64').toString('utf8'));
  check('K18c ⭐ `mfa/kurulum/onayla` token"i TAZE `iat` ama ESKI `authAt` tasir (R1-Y1, mutant #32)',
    yuk5.authAt === eskiAuthAt && yuk5.iat >= simdiSn - 5,
    JSON.stringify({ authAt: yuk5.authAt, iat: yuk5.iat, simdi: simdiSn }));
  const h5 = new HesapServisi(p5, { iptalEt: async () => undefined } as any);
  const r5 = await dene(() => h5.hesabiKapat('U1', '', yuk5.authAt));
  check('K18c ⭐ o token`la `hesabimi-kapat` → 400 YENIDEN_GIRIS_GEREKLI',
    hataKodu(r5.hata) === 'YENIDEN_GIRIS_GEREKLI', JSON.stringify(hataGovdesi(r5.hata)));

  // K18d — parolasiz hesapta MFA `kurulumBaslat`
  const p6 = db({ user: [kullanici({ parolaTanimli: false })], firma: [firma()], mfaKurtarmaKodu: [] });
  const mfa6 = new MfaServisi(p6, new OturumServisi(p6, jwtSahte), epostaSahteBasit().servis);
  const r6a = await dene(() => mfa6.kurulumBaslat('U1', {}, SN(Date.now() - 11 * 60 * 1000)));
  check('K18d parolasiz + `authAt` 11 dk → 400 YENIDEN_GIRIS_GEREKLI',
    hataKodu(r6a.hata) === 'YENIDEN_GIRIS_GEREKLI', JSON.stringify(hataGovdesi(r6a.hata)));
  const r6b = await dene(() => mfa6.kurulumBaslat('U1', {}, SN(Date.now() - 5 * 60 * 1000)));
  check('K18d parolasiz + `authAt` 5 dk → kurulum BASLADI',
    r6b.hata === undefined && typeof (r6b.deger as any)?.otpauthUri === 'string',
    JSON.stringify(hataGovdesi(r6b.hata)));

  // K19 — uye cikarma ve yonetici silme ikizleri
  const p7 = db({
    user: [
      kullanici({ id: 'U0', email: 'sahip@firma.com.tr', firmaRol: 'sahip' }),
      kullanici({ id: 'U1' }),
    ],
    firma: [firma()], kullaniciDisKimlik: [disKimlik()],
  });
  const uyelik7 = new UyelikServisi(p7, epostaSahteBasit().servis, new OturumServisi(p7, jwtSahte), configSahte);
  await uyelik7.uyeCikar({ userId: 'U0', firmaId: 'F1' }, 'U1', 'ali@firma.com.tr');
  check('K19 ⭐ UYE CIKARMA `kullaniciDisKimlik.deleteMany` CAGIRDI (ikiz 2/3)',
    cagrildi(p7, 'kullaniciDisKimlik', 'deleteMany') && p7._veri.kullaniciDisKimlik.length === 0);

  const p8 = db({
    user: [
      kullanici({ id: 'U0', email: 'sahip@firma.com.tr', firmaRol: 'sahip' }),
      kullanici({ id: 'U1' }),
    ],
    firma: [firma()], kullaniciDisKimlik: [disKimlik()],
  });
  const admin8 = new AdminService(p8, {} as any, {} as any,
    { iptalEt: async () => undefined } as any, { gonder: async () => undefined } as any);
  await admin8.deleteUser({ id: 'U9', email: 'yonetici@metapricex.com' } as any, 'U1');
  check('K19 ⭐ YONETICI SILME `kullaniciDisKimlik.deleteMany` CAGIRDI (ikiz 3/3)',
    cagrildi(p8, 'kullaniciDisKimlik', 'deleteMany') && p8._veri.kullaniciDisKimlik.length === 0);
}

// ───────────────────────────────────────────────────────────────────────────
//  K20 · KESIF — NUMARALANDIRMA YUZEYI YOK
// ───────────────────────────────────────────────────────────────────────────
async function bolumKesfet() {
  console.log('── K20 · KESIF ──');

  const d1 = dunya();
  const bilinen = await d1.servis.kesfet('ali@firma.com.tr');
  check('K20 ETKIN saglayici → `{ kurumsal: { saglayiciId, tip, zorunlu } }`',
    bilinen.kurumsal?.saglayiciId === IDP && bilinen.kurumsal?.tip === 'entra' &&
    bilinen.kurumsal?.zorunlu === false, JSON.stringify(bilinen));

  const d2 = dunya({ saglayicilar: [saglayici({ durum: 'DOGRULANDI' })] });
  const etkinDegil = await d2.servis.kesfet('ali@firma.com.tr');
  const bilinmeyen = await d2.servis.kesfet('biri@hicbilinmeyen.example');
  check('K20 ⭐ bilinmeyen alan adi ile ETKIN OLMAYAN saglayici BIREBIR AYNI yanit (mutant #19)',
    JSON.stringify(etkinDegil) === JSON.stringify(bilinmeyen) &&
    JSON.stringify(etkinDegil) === JSON.stringify({ kurumsal: null }),
    `${JSON.stringify(etkinDegil)} vs ${JSON.stringify(bilinmeyen)}`);
  check('K20 ⭐ kesif KULLANICI TABLOSUNA BAKMADI (varlik oracle"i degil)',
    !cagrildi(d2.p, 'user', 'findUnique') && !cagrildi(d2.p, 'user', 'findFirst') &&
    !cagrildi(d2.p, 'user', 'findMany'),
    JSON.stringify(d2.p._iz.cagrilar.filter((c: any) => c.tablo === 'user')));
  const bozuk = await d2.servis.kesfet('e-posta-degil');
  check('K20 gecersiz adres → `{ kurumsal: null }` (istisna ATMAZ)',
    JSON.stringify(bozuk) === JSON.stringify({ kurumsal: null }));

  // Yuklem ekseni: alan adi vs kisi
  const pZ = zorunluDunya();
  check('K20 `alanAdiKurumsalGiris` ETKIN+zorunlu alan adini gorur',
    (await alanAdiKurumsalGiris(pZ, 'ali@firma.com.tr'))?.zorunlu === true);
  check('K20 `alanAdiZorunluMu` ALAN ADI ekseni (kullanici YOK)',
    (await alanAdiZorunluMu(pZ, 'hic-kayitli-olmayan@firma.com.tr')) === true);
  check('K20 `kurumsalZorunluMu` KISI ekseni: baska firmanin uyesi ETKILENMEZ',
    (await kurumsalZorunluMu(pZ, { email: 'ali@firma.com.tr', role: 'user', firmaId: 'F9' })) === false);
  check('K20 `kurumsalZorunluMu` YONETICI muaf',
    (await kurumsalZorunluMu(pZ, { email: 'ali@firma.com.tr', role: 'admin', firmaId: 'F1' })) === false);
}

// ───────────────────────────────────────────────────────────────────────────
//  K21-K23, K29 · AYAR UCLARI ve YONETICI KURTARMALARI
// ───────────────────────────────────────────────────────────────────────────
function ayarDunyasi(ek: Satir = {}, kullanicilar?: Satir[], alanlar?: Satir[]) {
  const p = db({
    user: kullanicilar ?? [kullanici({ firmaRol: 'sahip' })],
    firma: [firma()],
    firmaKimlikSaglayici: ek.YOK ? [] : [saglayici(ek)],
    dogrulanmisAlanAdi: alanlar ?? [alanAdi()],
  });
  const e = epostaSahteBasit();
  const parola = new ParolaServisi(p, e.servis, { signToken: () => 'tkn' } as any, configSahte);
  const kurumsal = new KurumsalGirisServisi(p, new OturumServisi(p, jwtSahte), e.servis, configSahte);
  return { p, e, ayar: new KurumsalGirisAyarServisi(p, parola, kurumsal) };
}
const K1 = { userId: 'U1', firmaId: 'F1' };

async function bolumAyar() {
  console.log('── K21-K23, K29 · AYAR ve YONETICI ──');

  // K21 — GET yaninda sir YOK
  const a1 = ayarDunyasi();
  const gorunum = await a1.ayar.durum(K1);
  const metin1 = JSON.stringify(gorunum);
  check('K21 ⭐ GET yanitinda istemci sirri ve `istemciSirriSifreli` YOK (mutant #20)',
    !metin1.includes('istemciSirriSifreli') && !metin1.includes(SIR_METNI) && !metin1.includes('v1.'),
    metin1.slice(0, 200));
  check('K21 GET yaniti `sirVar: true` ve `donusAdresi` tasir',
    gorunum.saglayici?.sirVar === true &&
    gorunum.donusAdresi === 'https://metapricex.test/api/auth/sso/donus',
    JSON.stringify({ s: gorunum.saglayici?.sirVar, d: gorunum.donusAdresi }));

  // K21 — PUT ilk kayit: sifreli yazilir, duz sir DB de YOK
  const a2 = ayarDunyasi({ YOK: true });
  await a2.ayar.kaydet(K1, {
    tip: 'entra', entraKiraciId: KIRACI, clientId: 'yeni-istemci',
    istemciSirri: 'yepyeni-sir', beyanAlanAdlari: ['Firma.COM.TR', ' firma.com.tr '],
  } as any);
  const yeni2 = a2.p._veri.firmaKimlikSaglayici[0];
  check('K21 ⭐ DB de duz sir YOK, `v1.` onekli SIFRELI deger var',
    typeof yeni2.istemciSirriSifreli === 'string' &&
    yeni2.istemciSirriSifreli.startsWith('v1.') &&
    !yeni2.istemciSirriSifreli.includes('yepyeni-sir'),
    String(yeni2.istemciSirriSifreli).slice(0, 24));
  check('K21 `issuer` KODDA turetildi (formdan gelmedi)',
    yeni2.issuer === `https://login.microsoftonline.com/${KIRACI}/v2.0`, String(yeni2.issuer));
  check('K21 beyan alan adlari normalize + TEKILLESTIRILDI',
    JSON.stringify(yeni2.beyanAlanAdlari) === JSON.stringify(['firma.com.tr']),
    JSON.stringify(yeni2.beyanAlanAdlari));

  // K21 — tuketici kiracisi reddi
  const a3 = ayarDunyasi({ YOK: true });
  const r3 = await dene(() => a3.ayar.kaydet(K1, {
    tip: 'entra', entraKiraciId: '9188040d-6c67-4c5b-b112-36a304b66dad',
    clientId: 'x', istemciSirri: 's', beyanAlanAdlari: [],
  } as any));
  check('K21 tuketici kiracisi GUID i → 400 KIRACI_GECERSIZ',
    hataKodu(r3.hata) === 'KIRACI_GECERSIZ', JSON.stringify(hataGovdesi(r3.hata)));
  const r3b = await dene(() => a3.ayar.kaydet(K1, {
    tip: 'entra', entraKiraciId: 'common', clientId: 'x', istemciSirri: 's', beyanAlanAdlari: [],
  } as any));
  check('K21 "common" kiraci olarak KABUL EDILMEZ', hataKodu(r3b.hata) === 'KIRACI_GECERSIZ');
  const r3c = await dene(() => a3.ayar.kaydet(K1, {
    tip: 'entra', entraKiraciId: KIRACI, clientId: 'x', beyanAlanAdlari: [],
  } as any));
  check('K21 ilk kayitta sir zorunlu → 400 SIR_GEREKLI', hataKodu(r3c.hata) === 'SIR_GEREKLI');

  // K21 — clientId degisince TASLAK + alan adlari silinir
  const a4 = ayarDunyasi({ durum: 'ETKIN', zorunlu: true });
  await a4.ayar.kaydet(K1, {
    tip: 'entra', entraKiraciId: KIRACI, clientId: 'BASKA-ISTEMCI', beyanAlanAdlari: ['firma.com.tr'],
  } as any);
  check('K21 ⭐ `clientId` degisti → durum TASLAK, zorunlu false, alan adlari SILINDI',
    a4.p._veri.firmaKimlikSaglayici[0].durum === 'TASLAK' &&
    a4.p._veri.firmaKimlikSaglayici[0].zorunlu === false &&
    a4.p._veri.dogrulanmisAlanAdi.length === 0,
    JSON.stringify({ d: a4.p._veri.firmaKimlikSaglayici[0].durum, a: a4.p._veri.dogrulanmisAlanAdi.length }));

  // K21 — yalniz sir degisince durum KORUNUR
  const a5 = ayarDunyasi({ durum: 'ETKIN' });
  await a5.ayar.kaydet(K1, {
    tip: 'entra', entraKiraciId: KIRACI, clientId: 'sahte-istemci-kimligi',
    istemciSirri: 'taze-sir', beyanAlanAdlari: ['firma.com.tr'],
  } as any);
  check('K21 yalniz SIR yenilendi → durum ETKIN KALIR, alan adlari durur',
    a5.p._veri.firmaKimlikSaglayici[0].durum === 'ETKIN' && a5.p._veri.dogrulanmisAlanAdi.length === 1);

  // K21b — denetim kaydinda SIR YOK
  const olayMetni = JSON.stringify(a5.p._veri.firmaOlayi);
  check('K21b ⭐ `FirmaOlayi` JSON unda duz sir / `istemciSirri` / `v1.` YOK (mutant #31)',
    !olayMetni.includes('taze-sir') && !olayMetni.includes('istemciSirri') &&
    !olayMetni.includes('istemciSirriSifreli') && !olayMetni.includes('v1.'),
    olayMetni.slice(0, 200));
  check('K21b sir degisince `veri.sirDegisti === true` yazildi',
    a5.p._veri.firmaOlayi.some((o: Satir) => o.veri?.sirDegisti === true), olayMetni.slice(0, 200));

  // K22 — kapat: parolasiz uyelere sifirlama
  const a6 = ayarDunyasi({ durum: 'ETKIN', zorunlu: true }, [
    kullanici({ firmaRol: 'sahip' }),
    kullanici({ id: 'U2', email: 'uye@firma.com.tr', parolaTanimli: false }),
    kullanici({ id: 'U3', email: 'silinmis@firma.com.tr', parolaTanimli: false, deletedAt: T0 }),
  ]);
  const r6 = await a6.ayar.kapat(K1);
  check('K22 ⭐ `kapat` → KAPALI + zorunlu false',
    a6.p._veri.firmaKimlikSaglayici[0].durum === 'KAPALI' &&
    a6.p._veri.firmaKimlikSaglayici[0].zorunlu === false);
  check('K22 ⭐ ETKIN parolasiz uye BASINA `sifirlamaIste` (silinmis hesap SAYILMAZ)',
    r6.parolaSifirlamaGonderilen === 1 &&
    a6.e.giden.some((g) => g.kime === 'uye@firma.com.tr'),
    `${r6.parolaSifirlamaGonderilen} ${JSON.stringify(a6.e.giden)}`);

  // K22 — DELETE onay kapisi
  const a7 = ayarDunyasi({ durum: 'ETKIN' });
  const r7 = await dene(() => a7.ayar.sil(K1, 'sil'));
  check('K22 `DELETE` gövde onayi "SİL" degilse → 400 ONAY_GEREKLI',
    hataKodu(r7.hata) === 'ONAY_GEREKLI', JSON.stringify(hataGovdesi(r7.hata)));
  check('K22 onaysiz `DELETE` saglayiciyi SILMEDI', a7.p._veri.firmaKimlikSaglayici.length === 1);
  await a7.ayar.sil(K1, 'SİL');
  check('K22 onayli `DELETE` → satir silindi', a7.p._veri.firmaKimlikSaglayici.length === 0);

  // K14e — sahip uyenin baglantisini kaldirir
  const a8 = ayarDunyasi({ durum: 'ETKIN' }, [
    kullanici({ firmaRol: 'sahip' }),
    kullanici({ id: 'U2', email: 'uye@firma.com.tr', parolaTanimli: false }),
  ]);
  a8.p._veri.kullaniciDisKimlik.push(disKimlik({ userId: 'U2' }));
  const r8 = await a8.ayar.uyeBaglantisiKaldir(K1, 'U2');
  check('K14e ⭐ sahip uyenin baglantisini kaldirdi + parolasiz hedefe `sifirlamaIste`',
    r8.kaldirildi === true && r8.parolaSifirlamaGonderildi === true &&
    a8.p._veri.kullaniciDisKimlik.length === 0 &&
    a8.e.giden.some((g) => g.kime === 'uye@firma.com.tr'),
    JSON.stringify({ r8, giden: a8.e.giden }));
  const r8b = await dene(() => a8.ayar.uyeBaglantisiKaldir(K1, 'BASKA-FIRMA-KULLANICISI'));
  check('K14e bilinmeyen/baska firmanin kullanicisi → 404 UYE_YOK',
    hataKodu(r8b.hata) === 'UYE_YOK' && hataDurumu(r8b.hata) === 404,
    JSON.stringify(hataGovdesi(r8b.hata)));

  const a9 = ayarDunyasi({ durum: 'ETKIN' }, [
    kullanici({ firmaRol: 'uye' }),
    kullanici({ id: 'U2', email: 'uye@firma.com.tr' }),
  ]);
  a9.p._veri.kullaniciDisKimlik.push(disKimlik({ userId: 'U2' }));
  const r9 = await dene(() => a9.ayar.uyeBaglantisiKaldir(K1, 'U2'));
  check('K14e ⭐ servis CAGIRANIN rolunu DB den okur: `uye` → 403 (ikinci katman, R1-Y3)',
    hataKodu(r9.hata) === 'FIRMA_SAHIBI_GEREKLI' && hataDurumu(r9.hata) === 403,
    JSON.stringify(hataGovdesi(r9.hata)));

  // K14c — kisinin KENDI baglantisini kaldirmasi
  const dk1 = dunya({ disKimlikler: [disKimlik()] });
  const rk1 = await dene(() => dk1.servis.baglantiKaldir('U1', 'yanlis-parola', null));
  check('K14c ⭐ parolali hesap YANLIS parola → 400 PAROLA_HATALI, silme YOK (mutant #33)',
    hataKodu(rk1.hata) === 'PAROLA_HATALI' && dk1.p._veri.kullaniciDisKimlik.length === 1,
    JSON.stringify(hataGovdesi(rk1.hata)));

  const dk2 = dunya({
    kullanicilar: [kullanici({ parolaTanimli: false })],
    disKimlikler: [disKimlik(), disKimlik({ id: 'DK2', issuer: 'https://accounts.google.com', subject: 'g1' })],
  });
  dk2.servis.simdiMs = () => T0MS;
  const rk2 = await dene(() => dk2.servis.baglantiKaldir('U1', undefined, SN(T0MS - 11 * 60 * 1000)));
  check('K14c parolasiz hesap `authAt` 11 dk once → 400 YENIDEN_GIRIS_GEREKLI',
    hataKodu(rk2.hata) === 'YENIDEN_GIRIS_GEREKLI', JSON.stringify(hataGovdesi(rk2.hata)));
  const rk2b = await dene(() => dk2.servis.baglantiKaldir('U1', undefined, SN(T0MS - 60_000)));
  check('K14c parolasiz hesap IKI baglantidan birini kaldirabilir',
    rk2b.hata === undefined && dk2.p._veri.kullaniciDisKimlik.length === 0,
    JSON.stringify(hataGovdesi(rk2b.hata)));

  const dk3 = dunya({
    kullanicilar: [kullanici({ parolaTanimli: false })],
    disKimlikler: [disKimlik()],
  });
  dk3.servis.simdiMs = () => T0MS;
  const rk3 = await dene(() => dk3.servis.baglantiKaldir('U1', undefined, SN(T0MS - 60_000)));
  check('K14c ⭐ parolasiz hesabin TEK baglantisi → 400 SON_GIRIS_YOLU (kendini kilitleyemez)',
    hataKodu(rk3.hata) === 'SON_GIRIS_YOLU' && dk3.p._veri.kullaniciDisKimlik.length === 1,
    JSON.stringify(hataGovdesi(rk3.hata)));

  const dk4 = dunya({ disKimlikler: [disKimlik()] });
  const rk4 = await dene(() => dk4.servis.baglantiKaldir('U1', 'dogru-parola', null));
  check('K14c basari → silindi + bilgi e-postasi + FirmaOlayi',
    rk4.hata === undefined && dk4.p._veri.kullaniciDisKimlik.length === 0 &&
    dk4.giden.length === 1 &&
    dk4.p._veri.firmaOlayi.some((o: Satir) => o.tip === 'kurumsal-baglanti.kaldirildi'),
    JSON.stringify({ giden: dk4.giden, olay: dk4.p._veri.firmaOlayi.map((o: Satir) => o.tip) }));
  const dk5 = dunya({ disKimlikler: [] });
  const rk5 = await dene(() => dk5.servis.baglantiKaldir('U1', 'dogru-parola', null));
  check('K14c baglanti yoksa → 404 BAGLANTI_YOK', hataKodu(rk5.hata) === 'BAGLANTI_YOK');

  // K23 — yonetici zorunlu-kapat
  const p10 = db({
    user: [kullanici({ firmaRol: 'sahip' })], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: true })],
    dogrulanmisAlanAdi: [alanAdi()],
  });
  const yonetici = { id: 'ADM', email: 'yonetici@metapricex.com' };
  const adminC = new AdminKurumsalGirisController(p10);
  const r10 = await adminC.zorunluKapat(yonetici as any, 'F1');
  check('K23 ⭐ yonetici `zorunlu-kapat` → zorunlu false',
    r10.zorunlu === false && p10._veri.firmaKimlikSaglayici[0].zorunlu === false);
  check('K23 ⭐ `YoneticiOlayi` VE `FirmaOlayi` birlikte yazildi',
    p10._veri.yoneticiOlayi.length === 1 && p10._veri.firmaOlayi.length === 1 &&
    p10._veri.firmaOlayi[0].tip === 'kurumsal-giris.zorunlu-degisti',
    JSON.stringify({ y: p10._veri.yoneticiOlayi.length, f: p10._veri.firmaOlayi.map((o: Satir) => o.tip) }));
  const r10b = await dene(() => adminC.zorunluKapat(yonetici as any, 'F-YOK'));
  check('K23 bilinmeyen firma → 404', hataDurumu(r10b.hata) === 404);

  // K29 — yonetici alan adi silme
  const p11 = db({
    user: [kullanici({ firmaRol: 'sahip' })], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN', zorunlu: true })],
    dogrulanmisAlanAdi: [alanAdi(), alanAdi({ alanAdi: 'ikinci.com.tr' })],
  });
  const adminC2 = new AdminKurumsalGirisController(p11);
  const r11 = await dene(() => adminC2.alanAdiKaldir(yonetici as any, 'firma.com.tr', { onay: 'sil' } as any));
  check('K29 onay "SİL" degil → 400', hataDurumu(r11.hata) === 400 && hataKodu(r11.hata) === 'ONAY_GEREKLI');
  const r11b = await dene(() => adminC2.alanAdiKaldir(yonetici as any, 'yok.example', { onay: 'SİL' } as any));
  check('K29 bilinmeyen alan adi → 404 ALAN_ADI_YOK',
    hataDurumu(r11b.hata) === 404 && hataKodu(r11b.hata) === 'ALAN_ADI_YOK');
  const r11c = await adminC2.alanAdiKaldir(yonetici as any, 'FIRMA.com.tr', { onay: 'SİL' } as any);
  check('K29 alan adi normalize edilerek silindi, DIGERI durdugu icin durum ETKIN kalir',
    r11c.silindi === true && r11c.kalanDogrulanmisAlan === 1 &&
    p11._veri.firmaKimlikSaglayici[0].durum === 'ETKIN',
    JSON.stringify({ r: r11c, d: p11._veri.firmaKimlikSaglayici[0].durum }));
  const r11d = await adminC2.alanAdiKaldir(yonetici as any, 'ikinci.com.tr', { onay: 'SİL' } as any);
  check('K29 ⭐ SON dogrulanmis alan silindi → durum TASLAK, zorunlu false (mutant #34)',
    r11d.kalanDogrulanmisAlan === 0 &&
    p11._veri.firmaKimlikSaglayici[0].durum === 'TASLAK' &&
    p11._veri.firmaKimlikSaglayici[0].zorunlu === false,
    JSON.stringify(p11._veri.firmaKimlikSaglayici[0]));
  check('K29 ⭐ `YoneticiOlayi` + `FirmaOlayi` (yonetici.alan-adi-kaldirdi) yazildi',
    p11._veri.yoneticiOlayi.filter((o: Satir) => o.tip === 'alan-adi.kaldirildi').length === 2 &&
    p11._veri.firmaOlayi.filter((o: Satir) => o.tip === 'yonetici.alan-adi-kaldirdi').length === 2,
    JSON.stringify(p11._veri.yoneticiOlayi.map((o: Satir) => o.tip)));
}

// ───────────────────────────────────────────────────────────────────────────
//  K24-K28 · TEMIZLIK, GUARD TABLOSU, KVKK, KAYNAK KAPILARI
// ───────────────────────────────────────────────────────────────────────────
async function bolumKapilar() {
  console.log('── K24-K28 · TEMIZLIK, GUARD, KVKK, KAYNAK ──');

  // K24 — 24 saatlik temizlik
  const d1 = dunya();
  d1.p._veri.ssoAkisi.push(
    { id: 'eski', olusturuldu: new Date(T0MS - AKIS_SAKLAMA_MS - 1000), durumOzeti: 'a' },
    { id: 'taze', olusturuldu: new Date(T0MS - 1000), durumOzeti: 'b' },
  );
  const silinen = await d1.servis.akislariTemizle();
  check('K24 ⭐ 24 sa"ten eski `SsoAkisi` satirlari silindi, taze olan DURUYOR',
    silinen === 1 && d1.p._veri.ssoAkisi.length === 1 && d1.p._veri.ssoAkisi[0].id === 'taze',
    JSON.stringify(d1.p._veri.ssoAkisi.map((s: Satir) => s.id)));
  const temizlikCagrisi = d1.p._iz.cagrilar.find(
    (c: any) => c.tablo === 'ssoAkisi' && c.islem === 'deleteMany',
  );
  check('K24 kosul `olusturuldu: { lt: simdi - 24sa }`',
    !!temizlikCagrisi?.arg?.where?.olusturuldu?.lt, JSON.stringify(temizlikCagrisi?.arg));

  // K24 — BAGLANTI: `@Cron` gercekten kabloli mi?
  // ⚠ OLCULDU: `@nestjs/schedule` metadata'yi PROTOTIP+ANAHTAR ciftine DEGIL
  // METODUN KENDISINE yaziyor (`SCHEDULE_CRON_OPTIONS`, `SCHEDULER_TYPE`).
  // Yanlis yerde aramak, dekorator SILINSE bile YESIL kalan bir "baglanti
  // testi" uretirdi — bu depoda alti kez olculmus hata sinifi.
  const cronFn = (KurumsalGirisServisi.prototype as any).saatlikIs;
  const cronMeta = Reflect.getMetadataKeys(cronFn).map((k) => String(k));
  check('K24 ⭐ BAGLANTI: `saatlikIs` SCHEDULE_CRON_OPTIONS metadata tasiyor (mekanizma var, BAG da var)',
    cronMeta.includes('SCHEDULE_CRON_OPTIONS') && cronMeta.includes('SCHEDULER_TYPE'),
    JSON.stringify(cronMeta));
  check('K24 OLCUT: dekoratorsuz bir metotta bu metadata YOK (kapi her seye evet demiyor)',
    !Reflect.getMetadataKeys((KurumsalGirisServisi.prototype as any).akislariTemizle)
      .map((k) => String(k)).includes('SCHEDULE_CRON_OPTIONS'));

  // K24 — sir bitis uyarisi gunde bir
  const d2 = dunya({
    saglayicilar: [saglayici({
      durum: 'ETKIN',
      istemciSirriSonGecerlilik: new Date(T0MS + 5 * 24 * 3600_000),
    })],
    kullanicilar: [kullanici({ firmaRol: 'sahip' })],
  });
  const g1 = await d2.servis.sirUyarilariniYolla();
  const g2 = await d2.servis.sirUyarilariniYolla();
  check('K24 ⭐ sir bitis uyarisi 14 gun kala GIDER ve AYNI GUN IKINCI KEZ GITMEZ',
    g1 === 1 && g2 === 0 && d2.giden.length === 1, `${g1}/${g2} ${JSON.stringify(d2.giden)}`);

  // K25 — Reflector: guard ve izin tablolari
  const sso = KurumsalGirisController.prototype as any;
  check('K25 ⭐ `niyet` JwtAuthGuard tasir',
    (Reflect.getMetadata('__guards__', sso.niyet) ?? []).includes(JwtAuthGuard),
    JSON.stringify((Reflect.getMetadata('__guards__', sso.niyet) ?? []).map((g: any) => g?.name)));
  check('K25 ⭐ `baglantiKaldir` JwtAuthGuard tasir',
    (Reflect.getMetadata('__guards__', sso.baglantiKaldir) ?? []).includes(JwtAuthGuard));
  check('K25 ⭐ `baglantiKaldir` KOLTUK_DISI_IZINLI tasir (mutant #38)',
    metadataOku(KOLTUK_DISI_IZINLI, sso.baglantiKaldir, KurumsalGirisController) === true,
    String(metadataOku(KOLTUK_DISI_IZINLI, sso.baglantiKaldir, KurumsalGirisController)));
  const GUARDSIZ_SSO = ['kesfet', 'baslat', 'donus', 'degis', 'katil'];
  for (const m of GUARDSIZ_SSO) {
    check(`K25 \`${m}\` JwtAuthGuard TASIMAZ (giris akisinin parcasi)`,
      !((Reflect.getMetadata('__guards__', sso[m]) ?? []).includes(JwtAuthGuard)));
  }
  check('K25 SSO controller metot kumesi TAM (yeni uc sessizce eklenmesin)',
    metotlar(KurumsalGirisController).sort().join(',') ===
      [...GUARDSIZ_SSO, 'niyet', 'baglantiKaldir'].sort().join(','),
    JSON.stringify(metotlar(KurumsalGirisController)));

  // K25 — firma ayar controller: HER metot sinif duzeyinden `sahip` alir
  const FIRMA_METOTLARI = ['durum', 'kaydet', 'etkinlestir', 'kapat', 'sil', 'uyeBaglantisiKaldir'];
  check('K25 ⭐ FirmaKurumsalGirisController metot TABLOSU tam (yeni metot kirmizi yapar)',
    metotlar(FirmaKurumsalGirisController).sort().join(',') === FIRMA_METOTLARI.slice().sort().join(','),
    JSON.stringify(metotlar(FirmaKurumsalGirisController)));
  for (const m of FIRMA_METOTLARI) {
    const rol = metadataOku(FIRMA_ROL_KEY, (FirmaKurumsalGirisController.prototype as any)[m], FirmaKurumsalGirisController);
    check(`K25 \`${m}\` FIRMA_ROL_KEY = ["sahip"]`,
      JSON.stringify(rol) === JSON.stringify(['sahip']), JSON.stringify(rol));
  }
  for (const m of ['zorunluKapat', 'alanAdiKaldir']) {
    const roller = metadataOku(ROLES_KEY, (AdminKurumsalGirisController.prototype as any)[m], AdminKurumsalGirisController);
    check(`K25/K23/K29 \`${m}\` ROLES_KEY = ["admin"]`,
      JSON.stringify(roller) === JSON.stringify(['admin']), JSON.stringify(roller));
  }
  const tierTasiyan = [
    ...metotlar(KurumsalGirisController).map((m) => [KurumsalGirisController, m] as const),
    ...metotlar(FirmaKurumsalGirisController).map((m) => [FirmaKurumsalGirisController, m] as const),
    ...metotlar(AdminKurumsalGirisController).map((m) => [AdminKurumsalGirisController, m] as const),
  ].filter(([c, m]) => metadataOku(TIER_KEY, (c.prototype as any)[m], c) !== null);
  check('K25 ⭐ HICBIR kurumsal ucta `TIER_KEY` YOK (kimlik paket seviyesine baglanmaz)',
    tierTasiyan.length === 0, JSON.stringify(tierTasiyan.map(([c, m]) => `${c.name}.${m}`)));

  // K26 — KVKK disa aktarimi
  const p3 = db({
    user: [kullanici({ parolaTanimli: false })],
    firma: [firma()],
    kullaniciDisKimlik: [disKimlik()],
  });
  const hesap3 = new HesapServisi(p3, { iptalEt: async () => undefined } as any);
  const disa: any = await hesap3.verileriDisaAktar('U1');
  check('K26 ⭐ KVKK ciktisinda `kurumsalKimlikler` var ve `subject` DAHIL',
    Array.isArray(disa?.kurumsalKimlikler) && disa.kurumsalKimlikler.length === 1 &&
    typeof disa.kurumsalKimlikler[0].subject === 'string',
    JSON.stringify(disa?.kurumsalKimlikler));
  check('K26 ⭐ KVKK ciktisinda SAGLAYICI SIRRI YOK (firmanin sirri, kisinin verisi degil)',
    !JSON.stringify(disa).includes('istemciSirri') && !JSON.stringify(disa).includes('v1.'),
    JSON.stringify(disa).slice(0, 120));
  check('K26 `parolaTanimli` kisisel veri olarak veriliyor',
    disa?.kullanici?.parolaTanimli === false, JSON.stringify(disa?.kullanici?.parolaTanimli));

  // K26 — /auth/me `kurumsal` alani
  const p4 = db({
    user: [kullanici({ parolaTanimli: false })], firma: [firma()],
    firmaKimlikSaglayici: [saglayici({ durum: 'ETKIN' })],
    kullaniciDisKimlik: [disKimlik()],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 3 } } }],
  });
  const me: any = await authKur(p4).me('U1');
  check('K26 ⭐ `/auth/me` `kurumsal: { bagli, saglayiciTipi, parolaTanimli }`',
    me?.kurumsal?.bagli === true && me?.kurumsal?.saglayiciTipi === 'entra' &&
    me?.kurumsal?.parolaTanimli === false,
    JSON.stringify(me?.kurumsal));
  check('K26 `/auth/me` ham `parolaTanimli` yayilimda YOK (tek okuma noktasi `kurumsal`)',
    !('parolaTanimli' in (me ?? {})), JSON.stringify(Object.keys(me ?? {})));

  // K28 — KAYNAK KAPISI: cerez YOK
  const cerezli: string[] = [];
  const gez = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((g) => {
    const tam = path.join(d, g.name);
    if (g.isDirectory()) gez(tam);
    else if (g.name.endsWith('.ts')) {
      const k = kodu(fs.readFileSync(tam, 'utf8'));
      if (/res\.cookie\(/.test(k) || /Set-Cookie/i.test(k)) {
        cerezli.push(path.relative(KOK, tam).replace(/\\/g, '/'));
      }
    }
  });
  gez(path.join(KOK, 'backend/src'));
  check('K28 ⭐ `backend/src` altinda `res.cookie(` ve `Set-Cookie` YOK (hukuki cerez beyani)',
    cerezli.length === 0, JSON.stringify(cerezli));
  const ssoKaynak = kodu(oku('backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts'));
  check('K28-OLCUT tarayici gercekten kosuyor: SSO controller`da `res.redirect(` VAR',
    ssoKaynak.includes('res.redirect('), 'redirect bulunamadi');
}

// ═══════════════════════════════════════════════════════════════════════════
//  KOSUCU
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n=== FAZ 7 F3b — KURUMSAL GIRIS (BAGLAMA) ===\n');
  await bolumBaslat();
  await bolumDonus();
  await bolumDegis();
  await bolumEpostaBaglama();
  await bolumKatilim();
  await bolumSinama();
  await bolumZorunluluk();
  await bolumParolasiz();
  await bolumKesfet();
  await bolumAyar();
  await bolumKapilar();

  console.log(`\nFAZ 7 KURUMSAL GIRIS (F3b): ${passed} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log('\nBASARISIZLAR:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  // ⚠ Windows: `process.exit` acik fetch soketiyle 0xC0000409 uretiyor.
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('KAPI COKTU:', e);
  process.exitCode = 1;
});
