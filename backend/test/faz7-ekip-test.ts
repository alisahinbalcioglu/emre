/**
 * FAZ 7 · F1b — EKIP (DAVET · KOLTUK · KISI SINIRI · IKIZLER) KAPISI
 * (`npm run test:faz7-ekip`)
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ: her sey BELLEK ICI sahte Prisma ve gercek
 * sinif ornekleriyle olculur.
 *
 * ── SAHTE PRISMA `where`i GERCEKTEN UYGULAR ─────────────────────────────
 * Onceki paketlerde sahte Prisma yalniz `where`i KAYDEDIYORDU (casus).
 * Burada yetmez: koltuk sayimi, kisi sinirinin SIRASI ve ayrilma karari
 * gercek satirlar uzerinde hesaplaniyor. Bu yuzden `OR`, `NOT`, `lt`, `gt`,
 * `not`, `in` ve esitlik GERCEKTEN uygulanir; bilinmeyen operator GURULTULU
 * duser (sessizce "eslesti" saymaz — bu depoda olculmus hata sinifi).
 *
 * `$transaction` anlik goruntu alir ve firlatan islemi GERI ALIR; `$queryRaw`
 * cagrilari SIRASIYLA kaydedilir (kilit sayimdan ONCE mi geldi?).
 *
 * Mutant tablosu F1b raporunda (46 mutant). KIRMIZIYA DONERSE REGRESYON.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import { decode, verify, sign as jwtSign } from 'jsonwebtoken';
import { hashSync as bcryptHashSync } from 'bcrypt';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'faz7-ekip-testi-icin-yerel-anahtar-en-az-32-karakter';
const TEST_JWT_SECRET = process.env.JWT_SECRET;

import {
  ayrilmaKarari,
  bekleyenDavetKosulu,
  etkinHesapKosulu,
  firmaKilitliIslem,
  imhaTarihiHesapla,
  kapatmaVerisi,
  topluKapatmaVerisi,
  KAPATMA_SAKLAMA_GUN,
  koltukDurumuHesapla,
  koltukKarari,
  koltukSirasiKarari,
  oncekilerKosulu,
} from '../src/ozellik/firma/uyelik-kurallari';
import { firmaRolaGoreSuz } from '../src/ozellik/firma/firma-maskele';
import { hazirlayanGorunumu } from '../src/ozellik/teklif/quotes/hazirlayan';
import {
  hesapKapisi,
  OturumServisi,
  yakinZamandaGirisMi,
} from '../src/altyapi/auth/oturum.servisi';
import { JwtStrategy } from '../src/altyapi/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/altyapi/auth/guards/jwt-auth.guard';
import { FirmaRolGuard } from '../src/altyapi/auth/guards/firma-rol.guard';
import {
  FIRMA_ROL_KEY,
  FirmaRolu,
} from '../src/altyapi/auth/decorators/firma-rolu.decorator';
import {
  KOLTUK_DISI_IZINLI,
  KoltukDisiIzinli,
} from '../src/altyapi/auth/decorators/koltuk-disi-izinli.decorator';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';
import { TIER_KEY } from '../src/altyapi/auth/guards/tier.guard';
import { YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { UyelikServisi } from '../src/ozellik/firma/uyelik.servisi';
import { UyelikController } from '../src/ozellik/firma/uyelik.controller';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { FirmaController } from '../src/ozellik/firma/firma.controller';
import { AuthController } from '../src/altyapi/auth/auth.controller';
import { AuthService } from '../src/altyapi/auth/auth.service';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { FirmaServisi } from '../src/ozellik/firma/firma.servisi';
import { tokenOzetle } from '../src/altyapi/auth/token-ozet';
import {
  YENI_HAKLAR,
  durdurulacaklar,
  hakPlaniUret,
} from '../scripts/kullanici-hakki-guncelle';

let passed = 0;
let failed = 0;
/** `bolumO`daki gercek `JwtStrategy.validate` donusu — R2 davranis kapisi okur. */
let stratejiDonusu: any = null;
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
const guardAdlari = (handler: any, cls: any): string[] =>
  [
    ...((Reflect.getMetadata('__guards__', cls) ?? []) as any[]),
    ...((Reflect.getMetadata('__guards__', handler) ?? []) as any[]),
  ].map((g: any) => g?.name ?? String(g));

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
      // ILISKI SUZGECI (`where: { abonelik: { firmaId } }`): kosulun hicbir
      // anahtari operator degilse ve deger bir NESNE ise IC ICE eslestir.
      const OPERATORLER = ['lt', 'lte', 'gt', 'gte', 'not', 'in', 'equals', 'mode'];
      const operatorVar = Object.keys(deger as any).some((k) => OPERATORLER.includes(k));
      if (!operatorVar && mevcut !== null && typeof mevcut === 'object' && !(mevcut instanceof Date)) {
        if (!esles(mevcut, deger)) return false;
        continue;
      }
      // Prisma `mode: 'insensitive'` (K-P6 e-posta eslesmesi): ASCII kucult.
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

type Iz = {
  ham: string[];
  cagrilar: { tablo: string; islem: string; arg: any }[];
};

function tabloYap(ad: string, satirlar: Satir[], iz: Iz) {
  const kaydet = (islem: string, arg: any) => iz.cagrilar.push({ tablo: ad, islem, arg });
  const bul = (w: any) => satirlar.filter((s) => esles(s, w));
  return {
    findUnique: async (a: any) => {
      kaydet('findUnique', a);
      return bul(a.where)[0] ?? null;
    },
    findFirst: async (a: any) => {
      kaydet('findFirst', a);
      return sirala(bul(a.where), a.orderBy)[0] ?? null;
    },
    findMany: async (a: any = {}) => {
      kaydet('findMany', a);
      return sirala(bul(a.where), a.orderBy);
    },
    count: async (a: any = {}) => {
      kaydet('count', a);
      return bul(a.where).length;
    },
    groupBy: async (a: any = {}) => {
      kaydet('groupBy', a);
      const harita = new Map<string, number>();
      for (const s of bul(a.where)) {
        const k = String(s[a.by[0]]);
        harita.set(k, (harita.get(k) ?? 0) + 1);
      }
      return [...harita].map(([k, n]) => ({ [a.by[0]]: k, _count: { _all: n } }));
    },
    create: async (a: any) => {
      kaydet('create', a);
      const yeni: Satir = {
        id: a.data?.id ?? `${ad}-${satirlar.length + 1}`,
        createdAt: new Date(),
        olusturuldu: new Date(),
        ...a.data,
      };
      satirlar.push(yeni);
      return yeni;
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

function sahtePrisma(veri: Record<string, Satir[]>) {
  const iz: Iz = { ham: [], cagrilar: [] };
  const tablolar: Record<string, any> = {};
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
      // ANLIK GORUNTU: firlatan islem GERI ALINIR (atomiklik olculebilsin).
      const yedek = JSON.parse(JSON.stringify(veri, (_k, v) => v));
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
  for (const [ad, satirlar] of Object.entries(veri)) {
    tablolar[ad] = tabloYap(ad, satirlar, iz);
    p[ad] = tablolar[ad];
  }
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


/** JSON turu kaybeden tarihleri geri getirir (anlik goruntu geri alma). */
function canlandir(s: Satir): Satir {
  const yeni: Satir = {};
  for (const [k, v] of Object.entries(s)) {
    yeni[k] =
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
        ? new Date(v)
        : v;
  }
  return yeni;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ORTAK FIXTURE — firma F1: sahip A(t1) · uye B(t2) · uye C(t3)
// ═══════════════════════════════════════════════════════════════════════════
const t1 = new Date('2026-01-01T00:00:00Z');
const t2 = new Date('2026-02-01T00:00:00Z');
const t3 = new Date('2026-03-01T00:00:00Z');

function kullanici(ek: Satir): Satir {
  return {
    id: 'u?', email: 'x@firma.test', password: 'ozet', role: 'user',
    status: 'active', tier: 'core', deletedAt: null, passwordChangedAt: null,
    firmaId: 'F1', firmaRol: 'uye', createdAt: t2, ad: null, soyad: null,
    kapatilanEposta: null, emailVerified: true, sozlesmeOnayiAt: null,
    sozlesmeSurumu: null, ticariIletiOnayiAt: null,
    // PLAN 5.8 — SEKIL EKSIK OLMASIN: alanlar fixture'da yoksa "yazilmadi"
    // ile "hic yoktu" ayirt edilemez ve `undefined` her assert'i sessizce
    // gecerdi (hafiza dersi: fixture dogru dali surmeli).
    imhaTarihi: null, kapatmaNedeni: null,
    ...ek,
  };
}

/** Standart uc kisilik firma + hak degeri (`null` = abonelik YOK). */
function ucKisi(hak: number | null, ekVeri: Record<string, Satir[]> = {}) {
  return sahtePrisma({
    user: [
      kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1, ad: 'Ayse' }),
      kullanici({ id: 'B', email: 'b@firma.test', createdAt: t2 }),
      kullanici({ id: 'C', email: 'c@firma.test', createdAt: t3 }),
    ],
    firma: [{ id: 'F1', ad: 'Acme' }],
    firmaDavet: [],
    firmaOlayi: [],
    abonelik: hak === null ? [] : [{
      id: 'ab1', firmaId: 'F1',
      paketSurumu: { paket: { kullaniciHakki: hak, kod: 'pro-mek' } },
    }],
    quote: [],
    yoneticiOlayi: [],
    ...ekVeri,
  });
}

const jwtSahte = {
  sign: (payload: any, opts: any) => jwtSign(payload, opts.secret, { expiresIn: opts.expiresIn }),
} as any;
const configSahte = { get: (k: string) => (k === 'APP_URL' ? 'https://app.test' : undefined) } as any;

function epostaSahte() {
  const giden: { tur: string; kime: string; icerik: string }[] = [];
  const durum: { kritikHata: Error | null } = { kritikHata: null };
  return {
    giden,
    durum,
    servis: {
      gonderKritik: async (t: any) => {
        if (durum.kritikHata) throw durum.kritikHata;
        giden.push({ tur: 'kritik', kime: t.kime, icerik: JSON.stringify(t) });
      },
      gonder: async (t: any) => {
        giden.push({ tur: 'bilgi', kime: t.kime, icerik: JSON.stringify(t) });
      },
    } as any,
  };
}

function uyelikKur(prisma: any) {
  const eposta = epostaSahte();
  const oturum = new OturumServisi(prisma, jwtSahte);
  const servis = new UyelikServisi(prisma, eposta.servis, oturum, configSahte);
  return { servis, eposta, prisma };
}

const K = (userId: string, firmaId = 'F1') => ({ userId, firmaId });

/** Davet satiri + duz token uretir (ozet DB'de, duz token e-postada). */
function davetEkle(prisma: any, ek: Satir = {}) {
  const token = ('t' + Math.random().toString(36).slice(2)).padEnd(40, 'x');
  const satir = {
    id: ek.id ?? 'd1', firmaId: 'F1', eposta: 'yeni@firma.test',
    tokenHash: tokenOzetle(token),
    sonGecerlilik: new Date(Date.now() + 7 * 86400000),
    kabulAt: null, kabulEdenId: null, iptalAt: null, iptalEdenId: null,
    davetEdenId: 'A', davetEdenEposta: 'a@firma.test',
    gonderimSayisi: 1, sonGonderimAt: new Date(), olusturuldu: new Date(),
    ...ek,
  };
  prisma._veri.firmaDavet.push(satir);
  return { token, satir };
}

// ═══════════════════════════════════════════════════════════════════════════
//  O · OTURUM KAPISI ve `authAt`
// ═══════════════════════════════════════════════════════════════════════════
async function bolumO(): Promise<void> {
  console.log('\n── O · OTURUM KAPISI ve authAt ──');

  const banli = await dene(async () => hesapKapisi({ status: 'banned', deletedAt: null }));
  check('O1 banned → 401 "Hesabiniz askiya alinmis."',
    hataDurumu(banli.hata) === 401 && String(banli.hata?.message).includes('askiya alinmis'),
    String(banli.hata?.message));
  const silinmis = await dene(async () => hesapKapisi({ status: 'active', deletedAt: new Date() }));
  check('O1 deletedAt → 401 "Hesabiniz kapatilmis."',
    hataDurumu(silinmis.hata) === 401 && String(silinmis.hata?.message).includes('kapatilmis'),
    String(silinmis.hata?.message));
  const temiz = await dene(async () => hesapKapisi({ status: 'active', deletedAt: null }));
  check('O1-OLCUT etkin hesap gecer (kapi her seyi reddetmiyor)', !temiz.hata);

  // O2 — BAGLANTI: `login` gercekten kapiyi cagiriyor mu?
  const ozet = bcryptHashSync('parola1234', 4);
  const kurGiris = (durum: string) => {
    const p = sahtePrisma({
      user: [kullanici({ id: 'A', email: 'a@firma.test', password: ozet, firmaRol: 'sahip', createdAt: t1, status: durum })],
      firma: [{ id: 'F1', ad: 'Acme' }],
      abonelik: [{ id: 'ab1', firmaId: 'F1', durum: 'AKTIF', erisimSonu: new Date(Date.now() + 30 * 86_400_000), paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 3 } } }],
      userSubscription: [], firmaDavet: [], firmaOlayi: [],
    });
    return new AuthService(p, jwtSahte, { karar: async () => ({}) } as any,
      { dogrulamaGonderSessizce: async () => undefined } as any, new OturumServisi(p, jwtSahte));
  };
  const banliGiris = await dene(() =>
    kurGiris('banned').login({ email: 'a@firma.test', password: 'parola1234' } as any));
  check('O2 BAGLANTI: dogru parola + banned → 401 (login hesapKapisi cagiriyor)',
    hataDurumu(banliGiris.hata) === 401, String(banliGiris.hata?.message));
  const iyiGiris = await dene(() =>
    kurGiris('active').login({ email: 'a@firma.test', password: 'parola1234' } as any));
  check('O2-OLCUT ayni yol etkin hesapta oturum veriyor (FIXTURE KANITI)',
    !iyiGiris.hata && typeof (iyiGiris.deger as any)?.token === 'string',
    String(iyiGiris.hata?.message));

  // O3 — oturum yanitinin sekli
  const y = (iyiGiris.deger ?? { token: jwtSign({}, TEST_JWT_SECRET), user: {} }) as any;
  const cozum = decode(y.token, { complete: true }) as any;
  const dogrulandi = verify(y.token, TEST_JWT_SECRET) as any;
  check('O3 token JWT_SECRET ile dogrulaniyor; payload {sub,email,role,authAt}; aud/amac YOK',
    !!dogrulandi && dogrulandi.sub === 'A' && dogrulandi.email === 'a@firma.test' &&
      dogrulandi.role === 'user' && typeof dogrulandi.authAt === 'number' &&
      cozum?.payload?.aud === undefined && cozum?.payload?.amac === undefined,
    JSON.stringify(cozum?.payload));
  check('O3 `tier` TURETILMIS (saklanan "core" degil abonelikten "pro")',
    y.user.tier === 'pro', JSON.stringify(y.user));
  check('O3 yanitta `koltukDurduruldu` var ve false', y.user.koltukDurduruldu === false);

  // O4 — authAt
  const simdiSn = Math.floor(Date.now() / 1000);
  check('O4 login token authAt ≈ simdi (±2 sn)', Math.abs(dogrulandi.authAt - simdiSn) <= 2,
    `authAt=${dogrulandi.authAt} simdi=${simdiSn}`);
  check('O4 yakinZamandaGirisMi(null) === false (eski token yakin zaman KANITI DEGIL)',
    yakinZamandaGirisMi(null, simdiSn) === false);
  check('O4 yakinZamandaGirisMi(simdi-599) === true', yakinZamandaGirisMi(simdiSn - 599, simdiSn) === true);
  check('O4 yakinZamandaGirisMi(simdi-601) === false', yakinZamandaGirisMi(simdiSn - 601, simdiSn) === false);

  const pd = ucKisi(5);
  const { servis: uyelikSvc } = uyelikKur(pd);
  const { token: dToken } = davetEkle(pd);
  const kabul = await dene(() => uyelikSvc.davetKabul({
    token: dToken, parola: 'parola1234', sozlesmeOnayi: true,
  } as any));
  const kabulPayload = kabul.deger ? (verify((kabul.deger as any).token, TEST_JWT_SECRET) as any) : null;
  check('O4 davet-kabul token authAt ≈ simdi (±2 sn)',
    !!kabulPayload && Math.abs(kabulPayload.authAt - Math.floor(Date.now() / 1000)) <= 2,
    JSON.stringify(kabulPayload ?? kabul.hata?.message ?? kabul.hata));

  const strPrisma = ucKisi(5);
  const str = new JwtStrategy(strPrisma);
  const sonuc: any = await str.validate({ sub: 'A', email: 'a@firma.test', role: 'user' } as any);
  stratejiDonusu = sonuc;
  check('O4 JwtStrategy: authAt`siz payload → authAt: null', sonuc.authAt === null, JSON.stringify(sonuc));
  const sonuc2: any = await str.validate({ sub: 'A', email: 'a@firma.test', role: 'user', authAt: 1234 } as any);
  check('O4 JwtStrategy: authAt varsa aynen tasiniyor', sonuc2.authAt === 1234);

  const parolaKodu = kodu(oku('backend/src/altyapi/auth/parola.servisi.ts'));
  check('O4 change-password YENI authAt basiyor (kopyalamiyor)',
    /signToken\(\s*user\.id,\s*user\.email,\s*user\.role,\s*Math\.floor\(Date\.now\(\) \/ 1000\)/.test(parolaKodu));
}

// ═══════════════════════════════════════════════════════════════════════════
//  R · FIRMA ROLU KAPISI (dekorator + guard + TABLO)
// ═══════════════════════════════════════════════════════════════════════════
function baglam(user: any, handler: any, cls: any) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => cls,
  } as any;
}

class SahteMetotluController {
  @FirmaRolu('sahip')
  sahipIsi() { return 1; }
  serbestIs() { return 2; }
}

@FirmaRolu('sahip')
class SahteSinifliController {
  herhangiIs() { return 3; }
}

function bolumR(): void {
  console.log('\n── R · FIRMA ROLU KAPISI ──');
  const guard = new FirmaRolGuard(reflector);

  const uye = { id: 'B', firmaId: 'F1', firmaRol: 'uye' };
  const sahip = { id: 'A', firmaId: 'F1', firmaRol: 'sahip' };

  const red = (() => {
    try {
      guard.canActivate(baglam(uye, SahteMetotluController.prototype.sahipIsi, SahteMetotluController));
      return null;
    } catch (e) { return e; }
  })();
  check('R1 metot `sahip` + kullanici `uye` → 403 FIRMA_SAHIBI_GEREKLI',
    hataDurumu(red) === 403 && hataKodu(red) === 'FIRMA_SAHIBI_GEREKLI', JSON.stringify(hataGovdesi(red)));
  check('R1 `sahip` → gecer',
    guard.canActivate(baglam(sahip, SahteMetotluController.prototype.sahipIsi, SahteMetotluController)) === true);
  check('R1 metadata YOK → gecer (kapi yalniz isaretli uclarda)',
    guard.canActivate(baglam(uye, SahteMetotluController.prototype.serbestIs, SahteMetotluController)) === true);
  const sinifRed = (() => {
    try {
      guard.canActivate(baglam(uye, SahteSinifliController.prototype.herhangiIs, SahteSinifliController));
      return null;
    } catch (e) { return e; }
  })();
  check('R1 YALNIZ SINIFTA `@FirmaRolu` olan controller`da da 403 (mutant #16)',
    hataDurumu(sinifRed) === 403, JSON.stringify(hataGovdesi(sinifRed)));
  const firmasiz = (() => {
    try {
      guard.canActivate(baglam({ id: 'X', firmaId: null, firmaRol: 'sahip' },
        SahteMetotluController.prototype.sahipIsi, SahteMetotluController));
      return null;
    } catch (e) { return e; }
  })();
  check('R1 firmasiz hesap GURULTULU duser (kimlikCoz 403)', hataDurumu(firmasiz) === 403);

  // R3 — TABLO: prototipteki metot listesi beklentiyle BIREBIR
  const BEKLENEN: Record<string, { firmaRol: string[] | null; yetenek: string[] | null }> = {
    uyeleriGetir: { firmaRol: null, yetenek: null },
    davetOlustur: { firmaRol: ['sahip'], yetenek: [Yetenek.KULLANICI_DAVET] },
    davetYenidenGonder: { firmaRol: ['sahip'], yetenek: [Yetenek.KULLANICI_DAVET] },
    davetIptal: { firmaRol: ['sahip'], yetenek: null },
    rolDegistir: { firmaRol: ['sahip'], yetenek: null },
    uyeCikar: { firmaRol: ['sahip'], yetenek: null },
  };
  const gercekMetotlar = metotlar(UyelikController).sort();
  check('R3-FIXTURE KANITI: prototip metot listesi beklenti tablosuyla BIREBIR (eksik/fazla → kirmizi)',
    JSON.stringify(gercekMetotlar) === JSON.stringify(Object.keys(BEKLENEN).sort()),
    JSON.stringify(gercekMetotlar));
  for (const [ad, bek] of Object.entries(BEKLENEN)) {
    const h = (UyelikController.prototype as any)[ad];
    if (!h) { check(`R3 ${ad} metodu VAR`, false); continue; }
    const rol = metadataOku(FIRMA_ROL_KEY, h, UyelikController);
    check(`R3 ${ad} @FirmaRolu = ${JSON.stringify(bek.firmaRol)}`,
      JSON.stringify(rol) === JSON.stringify(bek.firmaRol), JSON.stringify(rol));
    const yet = metadataOku(YETENEK_KEY, h, UyelikController);
    check(`R3 ${ad} @GerekliYetenek = ${JSON.stringify(bek.yetenek)}`,
      JSON.stringify(yet) === JSON.stringify(bek.yetenek), JSON.stringify(yet));
    check(`R3 ${ad} TIER_KEY YOK (paket kapisi koltukla uygulanir)`,
      metadataOku(TIER_KEY, h, UyelikController) === null);
  }
  const sinifGuardlari = guardAdlari(UyelikController.prototype.uyeleriGetir, UyelikController);
  check('R3 sinif guard listesi ⊇ {JwtAuthGuard, FirmaRolGuard, ErisimGuard}',
    ['JwtAuthGuard', 'FirmaRolGuard', 'ErisimGuard'].every((g) => sinifGuardlari.includes(g)),
    JSON.stringify(sinifGuardlari));
  check('R3 sinif duzeyinde TIER_KEY YOK',
    Reflect.getMetadata(TIER_KEY, UyelikController) === undefined);

  // R4 — Abonelik uclari
  const R4 = { basla: ['sahip'], kartGuncelle: ['sahip'], iptal: ['sahip'] };
  for (const [ad, bek] of Object.entries(R4)) {
    const h = (AbonelikController.prototype as any)[ad];
    check(`R4 AbonelikController.${ad} @FirmaRolu ${JSON.stringify(bek)}`,
      JSON.stringify(metadataOku(FIRMA_ROL_KEY, h, AbonelikController)) === JSON.stringify(bek),
      JSON.stringify(metadataOku(FIRMA_ROL_KEY, h, AbonelikController)));
    check(`R4 AbonelikController.${ad} metot guard`, guardAdlari(h, AbonelikController).includes('FirmaRolGuard'));
  }
  for (const ad of ['paketler', 'durum', 'donus']) {
    const h = (AbonelikController.prototype as any)[ad];
    check(`R4 AbonelikController.${ad} metadata YOK (salt okuma / donus — gerekce §3.5)`,
      metadataOku(FIRMA_ROL_KEY, h, AbonelikController) === null);
  }

  // R5 — Firma uclari
  for (const ad of ['guncelle', 'logoYukle', 'logoSil']) {
    const h = (FirmaController.prototype as any)[ad];
    check(`R5 FirmaController.${ad} @FirmaRolu ['sahip']`,
      JSON.stringify(metadataOku(FIRMA_ROL_KEY, h, FirmaController)) === JSON.stringify(['sahip']));
  }
  for (const ad of ['getir', 'logoGetir']) {
    const h = (FirmaController.prototype as any)[ad];
    check(`R5 FirmaController.${ad} metadata YOK (uye de gorur)`,
      metadataOku(FIRMA_ROL_KEY, h, FirmaController) === null);
  }

  // R6 — kaynak taramasi: `@FirmaRolu(` yalniz izinli dosyalarda
  const IZINLI = [
    'backend/src/ozellik/firma/uyelik.controller.ts',
    'backend/src/ozellik/firma/firma.controller.ts',
    'backend/src/ozellik/odeme/abonelik/abonelik.controller.ts',
    // FAZ 7 F3b: kurumsal giris ayari YALNIZ firma sahibinin (§5.5).
    'backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts',
  ];
  const bulunan: string[] = [];
  const gez = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((g) => {
    const tam = path.join(d, g.name);
    if (g.isDirectory()) gez(tam);
    else if (g.name.endsWith('.ts') && /@FirmaRolu\(/.test(kodu(fs.readFileSync(tam, 'utf8')))) {
      bulunan.push(path.relative(KOK, tam).replace(/\\/g, '/'));
    }
  });
  gez(path.join(KOK, 'backend/src'));
  check('R6 `@FirmaRolu(` YALNIZ izinli dosyalarda (T2 ceviri uclarinda YOK — V1)',
    bulunan.sort().join('|') === IZINLI.sort().join('|'), JSON.stringify(bulunan));

  // R2 — strateji donusunde firmaRol
  // ⚠ 17.09 MUTANT M17 BU KAPIYI HAYATTA BIRAKTI: `firmaRol: user.firmaRol`
  // metni ayni dosyada `koltukDurumuHesapla` cagrisinda DA geciyor, bu yuzden
  // donusten silinse bile kaynak taramasi yesil kaliyordu. Kapi DAVRANISA
  // cevrildi (`bolumO`daki gercek `validate` cagrisi).
  check('R2 JwtStrategy DONUSUNDE `firmaRol` var (davranis, kaynak taramasi DEGIL)',
    stratejiDonusu?.firmaRol === 'sahip', JSON.stringify(stratejiDonusu));
}

// ═══════════════════════════════════════════════════════════════════════════
//  S · KOLTUK ve KISI SINIRI
// ═══════════════════════════════════════════════════════════════════════════
class SahteIzinliController {
  @KoltukDisiIzinli()
  izinli() { return 1; }
  izinsiz() { return 2; }
}
@KoltukDisiIzinli()
class SahteSinifIzinli {
  herhangi() { return 3; }
}

async function bolumS(): Promise<void> {
  console.log('\n── S · KOLTUK ve KISI SINIRI ──');

  // S1 / S1b — saf koltuk karari
  check('S1 (etkin 1, bekleyen 0, hak 2) → izin',
    koltukKarari({ etkinHesap: 1, bekleyenDavet: 0, hak: 2 }).izin === true);
  check('S1 (1,1,2) → KOLTUK_DOLU',
    koltukKarari({ etkinHesap: 1, bekleyenDavet: 1, hak: 2 }).nedenKodu === 'KOLTUK_DOLU');
  check('S1 (2,0,2) → KOLTUK_DOLU',
    koltukKarari({ etkinHesap: 2, bekleyenDavet: 0, hak: 2 }).nedenKodu === 'KOLTUK_DOLU');
  check('S1 (2,0,3) → izin',
    koltukKarari({ etkinHesap: 2, bekleyenDavet: 0, hak: 3 }).izin === true);
  check('S1b (1,0,1) → PAKET_EKIP_YOK',
    koltukKarari({ etkinHesap: 1, bekleyenDavet: 0, hak: 1 }).nedenKodu === 'PAKET_EKIP_YOK');
  check('S1b (0,0,0) → PAKET_EKIP_YOK (abonelik yok)',
    koltukKarari({ etkinHesap: 0, bekleyenDavet: 0, hak: 0 }).nedenKodu === 'PAKET_EKIP_YOK');

  // S2 — davet ucu: hak 2, 1 etkin + 1 bekleyen → KOLTUK_DOLU, create YOK
  const p2 = sahtePrisma({
    user: [kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 })],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 2 } } }],
  });
  davetEkle(p2, { id: 'd0', eposta: 'bekleyen@firma.test' });
  const { servis: s2 } = uyelikKur(p2);
  const r2 = await dene(() => s2.davetOlustur(K('A'), 'yeni@firma.test'));
  check('S2 hak 2, 1 etkin + 1 bekleyen → 400 KOLTUK_DOLU', hataKodu(r2.hata) === 'KOLTUK_DOLU',
    JSON.stringify(hataGovdesi(r2.hata)));
  check('S2 `firmaDavet.create` CAGRILMADI',
    !p2._iz.cagrilar.some((c: any) => c.tablo === 'firmaDavet' && c.islem === 'create'));

  // S3 — süresi dolmus / iptal / kabul edilmis davet ve BANLI hesap sayilmaz
  const p3 = sahtePrisma({
    user: [
      kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }),
      kullanici({ id: 'X', email: 'x@firma.test', status: 'banned', createdAt: t2 }),
    ],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 2 } } }],
  });
  davetEkle(p3, { id: 'dEski', sonGecerlilik: new Date(Date.now() - 1000) });
  davetEkle(p3, { id: 'dIptal', iptalAt: new Date() });
  davetEkle(p3, { id: 'dKabul', kabulAt: new Date() });
  const { servis: s3, eposta: e3 } = uyelikKur(p3);
  const r3 = await dene(() => s3.davetOlustur(K('A'), 'yeni2@firma.test'));
  check('S3 olu davetler ve BANLI hesap koltuk TUTMAZ → davet olusuyor',
    !r3.hata && e3.giden.length === 1, JSON.stringify(hataGovdesi(r3.hata)));

  // S4 — kilit sayimdan ONCE
  const kilitIndeksi = p3._iz.cagrilar.findIndex((c: any) => c.tablo === '$queryRaw');
  const sayimIndeksi = p3._iz.cagrilar.findIndex((c: any) => c.tablo === 'user' && c.islem === 'count');
  check('S4 `$queryRaw` kilidi (firma-uyelik:F1) sayimdan ONCE geldi',
    kilitIndeksi >= 0 && sayimIndeksi > kilitIndeksi &&
      p3._iz.ham.some((h: string) => h.includes('firma-uyelik:F1')),
    JSON.stringify({ kilitIndeksi, sayimIndeksi, ham: p3._iz.ham }));

  // S5 — kabul: kabul edilen davet sayimdan DUSER (haricDavetId)
  const p5 = sahtePrisma({
    user: [kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 })],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 2 } } }],
  });
  const d5 = davetEkle(p5, { id: 'd5', eposta: 'yeni@firma.test' });
  const { servis: s5 } = uyelikKur(p5);
  const r5 = await dene(() => s5.davetKabul({ token: d5.token, parola: 'parola1234', sozlesmeOnayi: true } as any));
  check('S5 hak 2, 1 etkin + KABUL EDILEN davet → izin (kendi koltugunu tutuyordu)',
    !r5.hata, JSON.stringify(hataGovdesi(r5.hata)));

  const p5b = sahtePrisma({
    user: [kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 })],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 2 } } }],
  });
  const d5b = davetEkle(p5b, { id: 'd5b', eposta: 'yeni@firma.test' });
  davetEkle(p5b, { id: 'd5c', eposta: 'baska@firma.test' });
  const { servis: s5b } = uyelikKur(p5b);
  const r5b = await dene(() => s5b.davetKabul({ token: d5b.token, parola: 'parola1234', sozlesmeOnayi: true } as any));
  check('S5 ayrica BIR BEKLEYEN DAVET daha varsa → KOLTUK_DOLU',
    hataKodu(r5b.hata) === 'KOLTUK_DOLU', JSON.stringify(hataGovdesi(r5b.hata)));

  // S7 — saf sira karari
  check('S7 hak null → iceride', koltukSirasiKarari({ onceGelen: 5, hak: null }).iceride === true);
  check('S7 (0,0) → iceride (en eski sahip her zaman calisir)',
    koltukSirasiKarari({ onceGelen: 0, hak: 0 }).iceride === true);
  check('S7 (0,1) → iceride', koltukSirasiKarari({ onceGelen: 0, hak: 1 }).iceride === true);
  check('S7 (1,1) → DISARIDA', koltukSirasiKarari({ onceGelen: 1, hak: 1 }).iceride === false);
  check('S7 (2,3) → iceride', koltukSirasiKarari({ onceGelen: 2, hak: 3 }).iceride === true);
  check('S7 (3,3) → DISARIDA', koltukSirasiKarari({ onceGelen: 3, hak: 3 }).iceride === false);

  // S8 — koltukDurumuHesapla (gercek sayim)
  const durum = async (hak: number | null, id: string) => {
    const p = ucKisi(hak);
    const u = p._veri.user.find((x: Satir) => x.id === id);
    const d = await koltukDurumuHesapla(p, u as any);
    return { d, p };
  };
  const h2A = await durum(2, 'A'); const h2B = await durum(2, 'B'); const h2C = await durum(2, 'C');
  check('S8 hak 2 → A ve B calisir, C DURDU',
    !h2A.d.durduruldu && !h2B.d.durduruldu && h2C.d.durduruldu,
    JSON.stringify([h2A.d, h2B.d, h2C.d]));
  const h3C = await durum(3, 'C');
  check('S8 hak 3 → C de calisir', h3C.d.durduruldu === false);
  const h1B = await durum(1, 'B'); const h1A = await durum(1, 'A');
  check('S8 hak 1 → yalniz A calisir', !h1A.d.durduruldu && h1B.d.durduruldu);
  const hYok = await durum(null, 'C');
  check('S8 abonelik YOK → kural uygulanmaz (hepsi calisir)', hYok.d.durduruldu === false);
  check('S8 A TEK BASINA sirada → hak sorgusu CAGRILMADI (maliyet)',
    !h2A.p._iz.cagrilar.some((c: any) => c.tablo === 'abonelik'),
    JSON.stringify(h2A.p._iz.cagrilar.map((c: any) => `${c.tablo}.${c.islem}`)));

  // S9 — "herkesi sahip yap" atlatmasi KAPALI
  const pAtlat = sahtePrisma({
    user: [
      kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }),
      kullanici({ id: 'B', email: 'b@firma.test', firmaRol: 'uye', createdAt: t2 }),
      kullanici({ id: 'D', email: 'd@firma.test', firmaRol: 'sahip', createdAt: t3 }),
    ],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 2 } } }],
  });
  const sD = await koltukDurumuHesapla(pAtlat, pAtlat._veri.user.find((x: Satir) => x.id === 'D') as any);
  const sB = await koltukDurumuHesapla(pAtlat, pAtlat._veri.user.find((x: Satir) => x.id === 'B') as any);
  check('S9 sahip D (t3) calisir, uye B (t2) DURDU — sahipler HER ZAMAN once',
    sD.durduruldu === false && sB.durduruldu === true, JSON.stringify({ sD, sB }));
  const pUcSahip = sahtePrisma({
    user: [
      kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }),
      kullanici({ id: 'B', email: 'b@firma.test', firmaRol: 'sahip', createdAt: t2 }),
      kullanici({ id: 'C', email: 'c@firma.test', firmaRol: 'sahip', createdAt: t3 }),
    ],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 1 } } }],
  });
  const uA = await koltukDurumuHesapla(pUcSahip, pUcSahip._veri.user[0] as any);
  const uB = await koltukDurumuHesapla(pUcSahip, pUcSahip._veri.user[1] as any);
  const uC = await koltukDurumuHesapla(pUcSahip, pUcSahip._veri.user[2] as any);
  check('S9 UCU DE SAHIP + hak 1 → yalniz A calisir',
    !uA.durduruldu && uB.durduruldu && uC.durduruldu, JSON.stringify([uA, uB, uC]));
  // FIXTURE KANITI: `oncekilerKosulu` uye dalinda sahip satiri VAR
  const uyeKosul = oncekilerKosulu({ firmaRol: 'uye', createdAt: t2, id: 'B' });
  check('S9-FIXTURE `oncekilerKosulu(uye)` ilk dali {firmaRol:"sahip"}',
    JSON.stringify(uyeKosul[0]) === JSON.stringify({ firmaRol: 'sahip' }), JSON.stringify(uyeKosul));

  // S10/S11 — JwtAuthGuard karari
  const g = new JwtAuthGuard(reflector);
  const durdurulan = { id: 'C', koltukDurduruldu: true, koltukHakki: 2 };
  const gRed = (() => {
    try {
      g.handleRequest(null, durdurulan, null,
        baglam(durdurulan, SahteIzinliController.prototype.izinsiz, SahteIzinliController));
      return null;
    } catch (e) { return e; }
  })();
  check('S10 durdurulan + izinsiz uc → 403 KOLTUK_ASILDI (401 DEGIL)',
    hataDurumu(gRed) === 403 && hataKodu(gRed) === 'KOLTUK_ASILDI' &&
      hataGovdesi(gRed)?.hak === 2 &&
      String(hataGovdesi(gRed)?.mesaj).includes('Firmanızın paketi 2 kişilik'),
    JSON.stringify(hataGovdesi(gRed)));
  // ⚠ FIRLATAN bir mutant burada TESTI COKERTIRDI (ozet yok, ✗ yok →
  // "yanlis neden"). Cagri sarmalanir ki kirmizi ANLAMLI olsun.
  const izinliSonuc = (() => {
    try {
      return g.handleRequest(null, durdurulan, null,
        baglam(durdurulan, SahteIzinliController.prototype.izinli, SahteIzinliController));
    } catch (e) { return e; }
  })();
  check('S10 izinli uc → kullanici DONER (firlatmaz)', izinliSonuc === durdurulan,
    JSON.stringify(hataGovdesi(izinliSonuc)));
  const calisan = { id: 'B', koltukDurduruldu: false, koltukHakki: 2 };
  const calisanSonuc = (() => {
    try {
      return g.handleRequest(null, calisan, null,
        baglam(calisan, SahteIzinliController.prototype.izinsiz, SahteIzinliController));
    } catch (e) { return e; }
  })();
  check('S10-OLCUT durdurulmamis kullanici gecer', calisanSonuc === calisan,
    JSON.stringify(hataGovdesi(calisanSonuc)));
  const sinifIzinSonuc = (() => {
    try {
      return g.handleRequest(null, durdurulan, null,
        baglam(durdurulan, SahteSinifIzinli.prototype.herhangi, SahteSinifIzinli));
    } catch (e) { return e; }
  })();
  check('S11 izin metadatasi YALNIZ SINIFTA olsa da gecerli (mutant #40)',
    sinifIzinSonuc === durdurulan, JSON.stringify(hataGovdesi(sinifIzinSonuc)));

  // S12 — izin tablosu
  // ⚠ 21.09 (plan 5.8 §3.3.1): `kapatmaOnizlemesi` EKLENDI ve bu
  // `hesabimiKapat`in IKIZIDIR — durdurulmus uye hesabini KAPATABILIYORSA
  // kapatmadan once ne olacagini da GORMEK zorundadir. Ikisinden birine
  // izin verip digerine vermemek, ekranda "firmanız kapanır" uyarisini
  // yalniz bazi kullanicilardan gizlerdi.
  const IZINLI_UCLAR = ['me', 'verilerim', 'hesabimiKapat', 'kapatmaOnizlemesi',
    'changePassword', 'resendVerification'];
  const authMetotlari = metotlar(AuthController);
  const izinliBulunan = authMetotlari.filter(
    (m) => metadataOku(KOLTUK_DISI_IZINLI, (AuthController.prototype as any)[m], AuthController) === true,
  );
  check('S12 AuthController`da `@KoltukDisiIzinli` TAM OLARAK bes ucta',
    izinliBulunan.sort().join(',') === IZINLI_UCLAR.sort().join(','), JSON.stringify(izinliBulunan));
  for (const cls of [UyelikController, FirmaController, AbonelikController]) {
    const tasiyan = metotlar(cls).filter(
      (m) => metadataOku(KOLTUK_DISI_IZINLI, (cls.prototype as any)[m], cls) === true,
    );
    check(`S12 ${cls.name} hicbir metodu izin metadatasi TASIMAZ`, tasiyan.length === 0, JSON.stringify(tasiyan));
  }

  // S13 — /auth/me ve login yanitindaki koltuk bilgisi
  const pMe = ucKisi(2);
  const authMe = new AuthService(pMe, jwtSahte, { karar: async () => ({}) } as any,
    { dogrulamaGonderSessizce: async () => undefined } as any, new OturumServisi(pMe, jwtSahte));
  (pMe as any).userSubscription = {
    findMany: async () => [],
  };
  const meC: any = await authMe.me('C');
  check('S13 /auth/me → koltuk {durduruldu:true, hak:2, sahipAdi:"Ayse"}',
    meC?.koltuk?.durduruldu === true && meC?.koltuk?.hak === 2 && meC?.koltuk?.sahipAdi === 'Ayse',
    JSON.stringify(meC?.koltuk));
  const meA: any = await authMe.me('A');
  check('S13-OLCUT sahip A icin durduruldu false', meA?.koltuk?.durduruldu === false);
  const oturumC = await new OturumServisi(pMe, jwtSahte).oturumYaniti(
    pMe._veri.user.find((x: Satir) => x.id === 'C') as any, { authAt: 1 });
  check('S13 login yaniti `user.koltukDurduruldu` DOGRU (strateji kosmadan)',
    oturumC.user.koltukDurduruldu === true, JSON.stringify(oturumC.user));

  // S14 — kaynak: AuthGuard('jwt') yalniz jwt-auth.guard.ts
  const jwtGuardKullanan: string[] = [];
  const gez2 = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((gg) => {
    const tam = path.join(d, gg.name);
    if (gg.isDirectory()) gez2(tam);
    else if (gg.name.endsWith('.ts') && /AuthGuard\('jwt'\)/.test(kodu(fs.readFileSync(tam, 'utf8')))) {
      jwtGuardKullanan.push(path.relative(KOK, tam).replace(/\\/g, '/'));
    }
  });
  gez2(path.join(KOK, 'backend/src'));
  check("S14 `AuthGuard('jwt')` YALNIZ jwt-auth.guard.ts`te (baska yerde koltuk kapisi ATLANIR)",
    jwtGuardKullanan.length === 1 &&
      jwtGuardKullanan[0] === 'backend/src/altyapi/auth/guards/jwt-auth.guard.ts',
    JSON.stringify(jwtGuardKullanan));

  // S-EK: ekip listesi `durduruldu` bilgisini TEK sorguda hesapliyor
  const pListe = ucKisi(2);
  const { servis: sListe } = uyelikKur(pListe);
  const liste: any = await sListe.uyeleriGetir(K('A'));
  check('S-EK ekip listesi: koltuk {aktif:3, hak:2, durdurulan:1}',
    liste.koltuk.aktif === 3 && liste.koltuk.hak === 2 && liste.koltuk.durdurulan === 1,
    JSON.stringify(liste.koltuk));
  check('S-EK listede yalniz C durdurulmus',
    liste.uyeler.filter((u: any) => u.durduruldu).map((u: any) => u.id).join(',') === 'C',
    JSON.stringify(liste.uyeler.map((u: any) => [u.id, u.durduruldu])));
  check('S-EK uye basina `count` ATILMADI (tek sorguda dizildi)',
    pListe._iz.cagrilar.filter((c: any) => c.tablo === 'user' && c.islem === 'count').length === 0,
    JSON.stringify(pListe._iz.cagrilar.map((c: any) => `${c.tablo}.${c.islem}`)));
  const listeUye: any = await sListe.uyeleriGetir(K('B'));
  check('S-EK UYE bekleyen davetleri GORMEZ ve davet dugmesi kapali',
    listeUye.bekleyenDavetler.length === 0 && listeUye.davet.acik === false &&
      listeUye.davet.nedenKodu === 'FIRMA_SAHIBI_GEREKLI',
    JSON.stringify(listeUye.davet));
}

// ═══════════════════════════════════════════════════════════════════════════
//  D · DAVET
// ═══════════════════════════════════════════════════════════════════════════
async function bolumD(): Promise<void> {
  console.log('\n── D · DAVET ──');

  // D1 — duz token DB'ye YAZILMAZ
  const p1 = ucKisi(6);
  const { servis: s1, eposta: e1 } = uyelikKur(p1);
  const d1 = await dene(() => s1.davetOlustur(K('A'), 'Yeni@Firma.TEST'));
  const satir = p1._veri.firmaDavet[0];
  const url = e1.giden[0] ? JSON.parse(e1.giden[0].icerik).dugme.url : '';
  const gidenToken = decodeURIComponent((url.split('token=')[1] ?? ''));
  check('D1 davet olustu ve e-posta gitti', !d1.hata && e1.giden.length === 1,
    JSON.stringify(hataGovdesi(d1.hata)));
  check('D1 `tokenHash` = sha256(e-postaya giden token)',
    !!satir && satir.tokenHash === tokenOzetle(gidenToken), JSON.stringify(satir?.tokenHash));
  check('D1 DUZ TOKEN hicbir alanda YOK',
    !!satir && !Object.values(satir).some((v) => typeof v === 'string' && v === gidenToken),
    JSON.stringify(satir));
  check('D1 e-posta NORMALIZE saklandi (ASCII kucuk harf)',
    satir?.eposta === 'yeni@firma.test', satir?.eposta);
  check('D1 davet e-postasi KRITIK yolla gitti (SMTP yoksa davet olusmaz)',
    e1.giden[0]?.tur === 'kritik');

  // D2-D5 — dort gecersizlik dali AYNI mesaj
  const mesajlar: Record<string, any> = {};
  for (const [ad, ek] of Object.entries({
    kabul: { kabulAt: new Date() },
    suresiGecmis: { sonGecerlilik: new Date(Date.now() - 1000) },
    iptal: { iptalAt: new Date() },
  })) {
    const p = ucKisi(6);
    const { servis } = uyelikKur(p);
    const { token } = davetEkle(p, { id: 'd-' + ad, ...(ek as Satir) });
    const r = await dene(() => servis.davetBilgi(token));
    mesajlar[ad] = hataGovdesi(r.hata);
  }
  {
    const p = ucKisi(6);
    const { servis } = uyelikKur(p);
    const r = await dene(() => servis.davetBilgi('bilinmeyen'.padEnd(40, 'x')));
    mesajlar.bilinmeyen = hataGovdesi(r.hata);
  }
  check('D2 kabul edilmis → DAVET_GECERSIZ', mesajlar.kabul?.kod === 'DAVET_GECERSIZ');
  check('D3 suresi gecmis → DAVET_GECERSIZ', mesajlar.suresiGecmis?.kod === 'DAVET_GECERSIZ');
  check('D4 iptal → DAVET_GECERSIZ', mesajlar.iptal?.kod === 'DAVET_GECERSIZ');
  check('D5 bilinmeyen → DAVET_GECERSIZ', mesajlar.bilinmeyen?.kod === 'DAVET_GECERSIZ');
  check('D2-D5 DORDU DE AYNI MESAJ (numaralandirma sizintisi yok)',
    new Set(Object.values(mesajlar).map((m: any) => m?.mesaj)).size === 1,
    JSON.stringify(Object.values(mesajlar).map((m: any) => m?.mesaj)));

  // D6 — kabulun yazdigi veri
  const p6 = ucKisi(6);
  const { servis: s6 } = uyelikKur(p6);
  const d6 = davetEkle(p6, { id: 'd6', eposta: 'yeni@firma.test' });
  const r6 = await dene(() => s6.davetKabul({
    token: d6.token, parola: 'parola1234', sozlesmeOnayi: true,
    firmaId: 'SALDIRGAN',
  } as any));
  const yeniKullanici = p6._veri.user.find((u: Satir) => u.email === 'yeni@firma.test');
  const HUKUKI = require('../src/altyapi/auth/hukuki-surum').HUKUKI_METIN_SURUMU;
  check('D6 kabul basarili', !r6.hata, JSON.stringify(hataGovdesi(r6.hata)));
  check('D6 `firmaId` DAVETTEN geldi (govdedeki "SALDIRGAN" OKUNMADI)',
    yeniKullanici?.firmaId === 'F1', yeniKullanici?.firmaId);
  check('D6 `firmaRol: "uye"` ACIKCA yazildi (sema varsayilani "sahip")',
    yeniKullanici?.firmaRol === 'uye', yeniKullanici?.firmaRol);
  check('D6 `role: "user"`', yeniKullanici?.role === 'user');
  check('D6 `emailVerified: true` (davet gelen kutusuna gitti)', yeniKullanici?.emailVerified === true);
  check('D6 `sozlesmeOnayiAt` dolu ve `sozlesmeSurumu` guncel',
    !!yeniKullanici?.sozlesmeOnayiAt && yeniKullanici?.sozlesmeSurumu === HUKUKI,
    JSON.stringify([yeniKullanici?.sozlesmeOnayiAt, yeniKullanici?.sozlesmeSurumu]));
  // ⚠ 17.09 MUTANT M11 BU KAPIYI HAYATTA BIRAKTI: `user.create` verisine
  // `firma: { create: … }` eklemek sahte Prisma'da AYRI bir `firma.create`
  // cagrisi URETMEZ (ic ice yazma taklit edilmiyor). Kapi artik cagrinin
  // KENDI ARGUMANINI okuyor — ic ice firma acilisi burada gorunur.
  const kabulArgumani = p6._iz.cagrilar
    .find((c: any) => c.tablo === 'user' && c.islem === 'create')?.arg;
  check('D6 `user.create` verisinde `firma` ANAHTARI YOK (davet kabul YENI FIRMA ACMAZ)',
    !!kabulArgumani && kabulArgumani.data?.firma === undefined,
    JSON.stringify(Object.keys(kabulArgumani?.data ?? {})));
  check('D6 ayrica `firma.create` cagrisi da YOK',
    !p6._iz.cagrilar.some((c: any) => c.tablo === 'firma' && c.islem === 'create'));
  check('D6 `uye.katildi` olayi yazildi (veri.yol = "davet")',
    p6._veri.firmaOlayi.some((o: Satir) => o.tip === 'uye.katildi' && o.veri?.yol === 'davet'),
    JSON.stringify(p6._veri.firmaOlayi.map((o: Satir) => o.tip)));

  // D7 — V3: baska firmada kayitli / zaten ekipte
  const p7 = ucKisi(6, {
    // ⚠ FARKLI HARF BUYUKLUGU: eslesme duyarsiz olmali.
    user2: [],
  });
  p7._veri.user.push(kullanici({ id: 'Z', email: 'Baska@Firma.TEST', firmaId: 'F2', firmaRol: 'sahip' }));
  const { servis: s7 } = uyelikKur(p7);
  const d7 = davetEkle(p7, { id: 'd7', eposta: 'baska@firma.test' });
  const r7 = await dene(() => s7.davetKabul({ token: d7.token, parola: 'parola1234', sozlesmeOnayi: true } as any));
  check('D7 baska firmada kayitli (farkli harf buyuklugu) → BASKA_FIRMADA_KAYITLI',
    hataKodu(r7.hata) === 'BASKA_FIRMADA_KAYITLI', JSON.stringify(hataGovdesi(r7.hata)));
  const d7b = davetEkle(p7, { id: 'd7b', eposta: 'b@firma.test' });
  const r7b = await dene(() => s7.davetKabul({ token: d7b.token, parola: 'parola1234', sozlesmeOnayi: true } as any));
  check('D7 ayni firmada ETKIN hesap → ZATEN_EKIPTE',
    hataKodu(r7b.hata) === 'ZATEN_EKIPTE', JSON.stringify(hataGovdesi(r7b.hata)));

  // D8 — kosullu tuketim (yaris)
  const p8 = ucKisi(6);
  const { servis: s8 } = uyelikKur(p8);
  const d8 = davetEkle(p8, { id: 'd8' });
  const hamUpdateMany = p8.firmaDavet.updateMany;
  p8.firmaDavet.updateMany = async (a: any) => {
    // Yaris benzetimi: baska bir istek daveti AZ ONCE tuketti.
    if (a.data?.kabulAt) return { count: 0 };
    return hamUpdateMany(a);
  };
  const r8 = await dene(() => s8.davetKabul({ token: d8.token, parola: 'parola1234', sozlesmeOnayi: true } as any));
  check('D8 kosullu tuketim count 0 (yaris) → DAVET_GECERSIZ',
    hataKodu(r8.hata) === 'DAVET_GECERSIZ', JSON.stringify(hataGovdesi(r8.hata)));
  check('D8 `user.create` YAPILMADI',
    !p8._veri.user.some((u: Satir) => u.email === 'yeni@firma.test'));

  // D9 — yeniden gonderim
  const p9 = ucKisi(6);
  const { servis: s9, eposta: e9 } = uyelikKur(p9);
  const d9 = davetEkle(p9, { id: 'd9' });
  const eskiOzet = p9._veri.firmaDavet[0].tokenHash;
  await s9.davetYenidenGonder(K('A'), 'd9');
  check('D9 yeniden gonderimde OZET DEGISTI (eski baglanti olur)',
    p9._veri.firmaDavet[0].tokenHash !== eskiOzet);
  const r9eski = await dene(() => s9.davetBilgi(d9.token));
  check('D9 ESKI token artik DAVET_GECERSIZ', hataKodu(r9eski.hata) === 'DAVET_GECERSIZ');
  check('D9 `gonderimSayisi` arttı (1 → 2)', p9._veri.firmaDavet[0].gonderimSayisi === 2);
  p9._veri.firmaDavet[0].gonderimSayisi = 5;
  const r9sinir = await dene(() => s9.davetYenidenGonder(K('A'), 'd9'));
  check('D9 5. gonderimden sonra → GONDERIM_SINIRI',
    hataKodu(r9sinir.hata) === 'GONDERIM_SINIRI', JSON.stringify(hataGovdesi(r9sinir.hata)));
  check('D9-OLCUT yeniden gonderim gercekten e-posta yolluyor (fixture)', e9.giden.length >= 1);

  // D10 — SMTP hatasi → 503 ve davet satiri KALICI DEGIL
  const p10 = ucKisi(6);
  const { servis: s10, eposta: e10 } = uyelikKur(p10);
  e10.durum.kritikHata = new Error('SMTP yok');
  const r10 = await dene(() => s10.davetOlustur(K('A'), 'yeni@firma.test'));
  check('D10 SMTP hatasi → 503 EPOSTA_GONDERILEMEDI',
    hataDurumu(r10.hata) === 503 && hataKodu(r10.hata) === 'EPOSTA_GONDERILEMEDI',
    JSON.stringify(hataGovdesi(r10.hata)));
  check('D10 davet satiri KALICI DEGIL (transaction geri alindi)',
    p10._veri.firmaDavet.length === 0, JSON.stringify(p10._veri.firmaDavet));

  // D11 — gunluk sinir
  const p11 = ucKisi(6);
  for (let i = 0; i < 20; i++) {
    p11._veri.firmaOlayi.push({
      id: `o${i}`, firmaId: 'F1', tip: 'davet.olusturuldu',
      olusturuldu: new Date(Date.now() - 1000 * 60 * i),
    });
  }
  const { servis: s11 } = uyelikKur(p11);
  const r11 = await dene(() => s11.davetOlustur(K('A'), 'yeni@firma.test'));
  check('D11 24 saatte 20 davet olayi → 429 GUNLUK_DAVET_SINIRI',
    hataDurumu(r11.hata) === 429 && hataKodu(r11.hata) === 'GUNLUK_DAVET_SINIRI',
    JSON.stringify([hataDurumu(r11.hata), hataGovdesi(r11.hata)]));
  // FIXTURE KANITI: 24 saatten ESKI olaylar sayilmaz
  const p11b = ucKisi(6);
  for (let i = 0; i < 25; i++) {
    p11b._veri.firmaOlayi.push({
      id: `o${i}`, firmaId: 'F1', tip: 'davet.olusturuldu',
      olusturuldu: new Date(Date.now() - 1000 * 60 * 60 * 30),
    });
  }
  const { servis: s11b } = uyelikKur(p11b);
  const r11b = await dene(() => s11b.davetOlustur(K('A'), 'yeni@firma.test'));
  check('D11-FIXTURE 30 saat onceki 25 olay SAYILMIYOR (davet gecer)', !r11b.hata,
    JSON.stringify(hataGovdesi(r11b.hata)));

  // D12 — baska firmanin davet kimligi
  const p12 = ucKisi(6);
  p12._veri.firmaDavet.push({
    id: 'dBaska', firmaId: 'F2', eposta: 'z@firma.test', tokenHash: 'x',
    sonGecerlilik: new Date(Date.now() + 86400000), kabulAt: null, iptalAt: null,
    davetEdenId: 'Z', davetEdenEposta: 'z@firma.test', gonderimSayisi: 1,
  });
  const { servis: s12 } = uyelikKur(p12);
  const r12 = await dene(() => s12.davetIptal(K('A'), 'dBaska'));
  check('D12 baska firmanin davetini IPTAL → 404 DAVET_YOK',
    hataDurumu(r12.hata) === 404 && hataKodu(r12.hata) === 'DAVET_YOK',
    JSON.stringify(hataGovdesi(r12.hata)));
  const r12b = await dene(() => s12.davetYenidenGonder(K('A'), 'dBaska'));
  check('D12 baska firmanin davetini YENIDEN GONDER → 404 DAVET_YOK',
    hataDurumu(r12b.hata) === 404 && hataKodu(r12b.hata) === 'DAVET_YOK');
  check('D12 hicbir YAZMA yapilmadi (`update`/`updateMany` yok)',
    !p12._iz.cagrilar.some((c: any) => c.tablo === 'firmaDavet' && /update/i.test(c.islem)),
    JSON.stringify(p12._iz.cagrilar.filter((c: any) => c.tablo === 'firmaDavet').map((c: any) => c.islem)));
  check('D12-OLCUT baska firmanin daveti hâlâ AYAKTA (iptal olmadi)',
    p12._veri.firmaDavet.find((d: Satir) => d.id === 'dBaska')?.iptalAt == null);
}

// ═══════════════════════════════════════════════════════════════════════════
//  H · AYRILMA IKIZI (hesap kapatma · uye cikarma · yonetici silme)
// ═══════════════════════════════════════════════════════════════════════════
function hesapKur(prisma: any) {
  const iptaller: any[] = [];
  const loglar: string[] = [];
  // PLAN 5.8 §3.4 — kapatma bildirimleri. Gonderilenler KAYDEDILIR:
  // "e-posta gitti mi, KIME ve hangi TARIHLE" ayri ayri olculebilsin.
  const epostalar: { kime: string; konu: string; govde: string }[] = [];
  const eposta = {
    gonder: async (t: any) => {
      epostalar.push({
        kime: t.kime, konu: t.konu,
        govde: [t.baslik, ...(t.paragraflar ?? []), t.altNot ?? ''].join(' '),
      });
    },
  } as any;
  const satinAlma = {
    iptalEt: async (firmaId: string, aktor: string, neden: string) => {
      iptaller.push({ firmaId, aktor, neden, sira: prisma._iz.cagrilar.length });
    },
  } as any;
  const servis = new HesapServisi(prisma, satinAlma, eposta);
  (servis as any).logger = { error: (m: unknown) => loglar.push(String(m)), warn: () => undefined, log: () => undefined };
  return { servis, iptaller, loglar, satinAlma, epostalar };
}

function adminKur(prisma: any) {
  const iptaller: any[] = [];
  const loglar: string[] = [];
  const satinAlma = {
    iptalEt: async (firmaId: string, aktor: string, neden: string) => {
      iptaller.push({ firmaId, aktor, neden, sira: prisma._iz.cagrilar.length });
    },
  } as any;
  const servis = new AdminService(prisma, {} as any, {} as any, satinAlma, { gonder: async () => undefined } as any);
  (servis as any).logger = { error: (m: unknown) => loglar.push(String(m)), warn: () => undefined, log: () => undefined };
  return { servis, iptaller, loglar };
}

const PAROLA_OZETI = bcryptHashSync('parola1234', 4);

async function bolumH(): Promise<void> {
  console.log('\n── H · AYRILMA IKIZI ──');

  const kapatmaPrisma = (kullanicilar: Satir[], davetler: Satir[] = []) =>
    sahtePrisma({
      user: kullanicilar.map((u) => kullanici({ password: PAROLA_OZETI, ...u })),
      firma: [{ id: 'F1', ad: 'Acme' }],
      firmaDavet: davetler, firmaOlayi: [], abonelik: [], quote: [], yoneticiOlayi: [],
    });

  // H1 — uye kendi hesabini kapatir → iptal YOK
  const pH1 = kapatmaPrisma([
    { id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 },
    { id: 'B', email: 'b@firma.test', firmaRol: 'uye', createdAt: t2 },
  ]);
  const h1 = hesapKur(pH1);
  const r1 = await dene(() => h1.servis.hesabiKapat('B', 'parola1234'));
  check('H1 uye hesabini kapatti → `iptalEt` CAGRILMADI', !r1.hata && h1.iptaller.length === 0,
    JSON.stringify([hataGovdesi(r1.hata), h1.iptaller]));
  check('H1 `FirmaOlayi uye.ayrildi` yazildi',
    pH1._veri.firmaOlayi.some((o: Satir) => o.tip === 'uye.ayrildi'),
    JSON.stringify(pH1._veri.firmaOlayi.map((o: Satir) => o.tip)));
  check('H1 kapatma veri deseni uygulandi (deletedAt + passwordChangedAt + E-POSTA DURUYOR)',
    (() => { const u = pH1._veri.user.find((x: Satir) => x.id === 'B');
      // ⚠ "dolu mu" YETMEZ: BAYAT bir damga (epoch) da doludur ama token'i
      // OLDURMEZ. Damga kapatma anina esit olmali (mutant M21).
      return !!u?.deletedAt && u?.passwordChangedAt?.getTime() === u?.deletedAt?.getTime() &&
        // PLAN 5.8 K1 (21.09): adres ARTIK ANONIMLESMIYOR — 30 gun boyunca
        // ayni adresle girip geri donulebilmeli. Eski hâl `kapali-B@…` idi.
        u.email === 'b@firma.test' &&
        u.kapatilanEposta === 'b@firma.test'; })(),
    JSON.stringify(pH1._veri.user.find((x: Satir) => x.id === 'B')));
  check('H1 `kapatmaNedeni = kendi` ve `imhaTarihi = kapatma + 30 gun`',
    (() => { const u = pH1._veri.user.find((x: Satir) => x.id === 'B');
      return u?.kapatmaNedeni === 'kendi' &&
        u?.imhaTarihi?.getTime() === u?.deletedAt?.getTime() + 30 * 86400000; })(),
    JSON.stringify(pH1._veri.user.find((x: Satir) => x.id === 'B')));
  check('H1 kapatma e-postasi GERCEK TARIHLE gitti ("30 gun sonra" DEGIL)',
    (() => { const u = pH1._veri.user.find((x: Satir) => x.id === 'B');
      const gg = new Date(u!.imhaTarihi.getTime() + 3 * 3600000);
      const bek = `${String(gg.getUTCDate()).padStart(2, '0')}.${String(gg.getUTCMonth() + 1).padStart(2, '0')}.${gg.getUTCFullYear()}`;
      const e = h1.epostalar.find((x) => x.kime === 'b@firma.test');
      return !!e && e.govde.includes(bek) && !/30 gün sonra/.test(e.govde); })(),
    JSON.stringify(h1.epostalar));

  // H2 — son sahip + baska hesap var → SON_SAHIP, yazma yok
  const pH2 = kapatmaPrisma([
    { id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 },
    { id: 'B', email: 'b@firma.test', firmaRol: 'uye', createdAt: t2 },
  ]);
  const h2 = hesapKur(pH2);
  const r2 = await dene(() => h2.servis.hesabiKapat('A', 'parola1234'));
  // ⚠ 21.09 (K2) DAVRANIS DEGISTI: son sahip ARTIK kapatabilir. Eski assert
  // `SON_SAHIP` bekliyordu; o kapi yalniz YONETICI SILMESI ve UYE CIKARMA
  // yollarinda duruyor (H5c ve K bolumu olcer).
  check('H2 son sahip KENDI kapatabilir (K2) → hata YOK, firma kapanir',
    !r2.hata, JSON.stringify(hataGovdesi(r2.hata)));
  check('H2 `user.update` YAPILDI (A kapandi)',
    pH2._veri.user.find((x: Satir) => x.id === 'A')?.deletedAt != null);

  // H3 — firmanin TEK hesabi → iptal var ve COMMIT'TEN SONRA
  const pH3 = kapatmaPrisma(
    [{ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }],
    [{ id: 'dX', firmaId: 'F1', eposta: 'x@firma.test', tokenHash: 'h', kabulAt: null, iptalAt: null,
      sonGecerlilik: new Date(Date.now() + 86400000), davetEdenId: 'A', davetEdenEposta: 'a@firma.test', gonderimSayisi: 1 }],
  );
  const h3 = hesapKur(pH3);
  const r3 = await dene(() => h3.servis.hesabiKapat('A', 'parola1234'));
  const sonYazma = Math.max(...pH3._iz.cagrilar
    .map((c: any, i: number) => (/create|update/i.test(c.islem) ? i : -1)));
  check('H3 tek hesap → `iptalEt(F1, A, "hesap kapatma")` CAGRILDI',
    !r3.hata && h3.iptaller.length === 1 && h3.iptaller[0].neden === 'hesap kapatma',
    JSON.stringify([hataGovdesi(r3.hata), h3.iptaller]));
  check('H3 iptal COMMIT`TEN SONRA (son yazmadan sonraki sirada)',
    h3.iptaller[0]?.sira > sonYazma, JSON.stringify({ iptalSira: h3.iptaller[0]?.sira, sonYazma }));
  check('H3b bekleyen davetler AYNI transaction`da iptal edildi',
    pH3._veri.firmaDavet[0]?.iptalAt != null &&
      pH3._veri.firmaOlayi.some((o: Satir) => o.tip === 'davet.otomatik-iptal'),
    JSON.stringify(pH3._veri.firmaDavet[0]));

  // H3c — iptalEt firlatir → kapatma yine kalici + logger.error
  const pH3c = kapatmaPrisma([{ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }]);
  const h3c = hesapKur(pH3c);
  (h3c.servis as any).satinAlma = { iptalEt: async () => { throw new Error('iyzico yok'); } };
  const r3c = await dene(() => h3c.servis.hesabiKapat('A', 'parola1234'));
  check('H3c `iptalEt` firlatti → kapatma YINE KALICI ve `logger.error` cagrildi',
    !r3c.hata && pH3c._veri.user[0].deletedAt != null &&
      h3c.loglar.some((l) => l.includes('ELLE IPTAL GEREKEBILIR')),
    JSON.stringify([hataGovdesi(r3c.hata), h3c.loglar]));

  // H4 — sahip + baska ETKIN sahip → iptal yok, kapatma var
  const pH4 = kapatmaPrisma([
    { id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 },
    { id: 'D', email: 'd@firma.test', firmaRol: 'sahip', createdAt: t2 },
  ]);
  const h4 = hesapKur(pH4);
  const r4 = await dene(() => h4.servis.hesabiKapat('A', 'parola1234'));
  check('H4 baska etkin sahip var → iptal YOK, kapatma VAR',
    !r4.hata && h4.iptaller.length === 0 && pH4._veri.user[0].deletedAt != null,
    JSON.stringify([hataGovdesi(r4.hata), h4.iptaller]));

  // H4b — tek diger hesap BANLI → SON_SAHIP (banli "hesap" sayilir, "etkin sahip" sayilmaz)
  const pH4b = kapatmaPrisma([
    { id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 },
    { id: 'X', email: 'x@firma.test', firmaRol: 'uye', createdAt: t2, status: 'banned' },
  ]);
  const h4b = hesapKur(pH4b);
  const r4b = await dene(() => h4b.servis.hesabiKapat('A', 'parola1234'));
  // ⚠ 21.09 (K2): artik SON_SAHIP DEGIL — firma kapanir. Ama olcut AYNI
  // kaliyor: BANLI hesap "hesap" sayilir, yani firma "tek kullanicili"
  // degildir ve banli kisi de `firmaKapandi` ile durdurulur.
  check('H4b tek diger hesap BANLI → firma kapanir, BANLI hesap da durdurulur',
    !r4b.hata &&
      pH4b._veri.user.find((x: Satir) => x.id === 'X')?.kapatmaNedeni === 'firmaKapandi' &&
      pH4b._veri.user.find((x: Satir) => x.id === 'X')?.status === 'banned',
    JSON.stringify([hataGovdesi(r4b.hata), pH4b._veri.user.find((x: Satir) => x.id === 'X')]));

  // H5 — YONETICI SILMESI, tek hesapli firma
  const pH5 = kapatmaPrisma([{ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }]);
  const a5 = adminKur(pH5);
  const r5 = await dene(() => a5.servis.deleteUser({ id: 'Y1', email: 'y@metaprice.test' }, 'A'));
  const yonetSonYazma = Math.max(...pH5._iz.cagrilar
    .map((c: any, i: number) => (/create|update/i.test(c.islem) ? i : -1)));
  const u5 = pH5._veri.user[0];
  check('H5 yonetici silmesi tek hesapli firmada `iptalEt(..., "yonetici silme")` cagirdi',
    !r5.hata && a5.iptaller.length === 1 && a5.iptaller[0].neden === 'yonetici silme',
    JSON.stringify([hataGovdesi(r5.hata), a5.iptaller]));
  check('H5 iptal COMMIT`TEN SONRA', a5.iptaller[0]?.sira > yonetSonYazma);
  check('H5 veri deseni HESAP KAPATMAYLA BIREBIR (nedeni `yonetici`, e-posta DURUR)',
    u5.deletedAt != null && u5.passwordChangedAt?.getTime() === u5.deletedAt?.getTime() &&
      u5.kapatilanEposta === 'a@firma.test' && u5.email === 'a@firma.test' &&
      u5.kapatmaNedeni === 'yonetici' &&
      u5.imhaTarihi?.getTime() === u5.deletedAt?.getTime() + 30 * 86400000,
    JSON.stringify(u5));
  check('H5 firmanin son hesabi gitti → `Firma.imhaTarihi` de doldu (§5.2)',
    pH5._veri.firma[0]?.imhaTarihi?.getTime() === u5.imhaTarihi?.getTime(),
    JSON.stringify(pH5._veri.firma[0]));
  check('H5 YoneticiOlayi `veri.abonelikIptal === true`',
    pH5._veri.yoneticiOlayi.some((o: Satir) => o.tip === 'kullanici.silindi' && o.veri?.abonelikIptal === true),
    JSON.stringify(pH5._veri.yoneticiOlayi));
  check('H5 FirmaOlayi `uye.yonetici-sildi` yazildi',
    pH5._veri.firmaOlayi.some((o: Satir) => o.tip === 'uye.yonetici-sildi'),
    JSON.stringify(pH5._veri.firmaOlayi.map((o: Satir) => o.tip)));

  // H5b — cok hesapli firmada uye silinir → iptal YOK
  const pH5b = kapatmaPrisma([
    { id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 },
    { id: 'B', email: 'b@firma.test', firmaRol: 'uye', createdAt: t2 },
  ]);
  const a5b = adminKur(pH5b);
  const r5b = await dene(() => a5b.servis.deleteUser({ id: 'Y1', email: 'y@metaprice.test' }, 'B'));
  check('H5b cok hesapli firmada uye silindi → `iptalEt` YOK',
    !r5b.hata && a5b.iptaller.length === 0, JSON.stringify([hataGovdesi(r5b.hata), a5b.iptaller]));
  check('H5b YoneticiOlayi `veri.abonelikIptal === false`',
    pH5b._veri.yoneticiOlayi.some((o: Satir) => o.veri?.abonelikIptal === false),
    JSON.stringify(pH5b._veri.yoneticiOlayi.map((o: Satir) => o.veri)));

  // H5c — son sahip + baska hesap → 400, yazma yok
  const pH5c = kapatmaPrisma([
    { id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 },
    { id: 'B', email: 'b@firma.test', firmaRol: 'uye', createdAt: t2 },
  ]);
  const a5c = adminKur(pH5c);
  const r5c = await dene(() => a5c.servis.deleteUser({ id: 'Y1', email: 'y@metaprice.test' }, 'A'));
  check('H5c yonetici son sahibi silemez → 400 SON_SAHIP',
    hataKodu(r5c.hata) === 'SON_SAHIP', JSON.stringify(hataGovdesi(r5c.hata)));
  check('H5c hicbir yazma KALICI degil (transaction geri alindi)',
    pH5c._veri.user.find((x: Satir) => x.id === 'A')?.deletedAt == null &&
      pH5c._veri.firmaOlayi.length === 0,
    JSON.stringify(pH5c._veri.firmaOlayi));

  // H6 — uyeCikar
  const pH6 = ucKisi(6);
  const { servis: s6 } = uyelikKur(pH6);
  const r6 = await dene(() => s6.uyeCikar(K('A'), 'C', 'C@FIRMA.test'));
  const uC = pH6._veri.user.find((x: Satir) => x.id === 'C');
  check('H6 uye cikarildi: kapatma veri deseni + K1 ISTISNASI (adres HEMEN serbest)',
    !r6.hata && uC?.deletedAt != null &&
      uC?.passwordChangedAt?.getTime() === uC?.deletedAt?.getTime() &&
      // ⚠ DORT YOLDAN YALNIZ BU: ayrilmayi kisi secmedi, baska bir firmaya
      // katilabilmeli (K1 istisnasi). Diger uc yolda adres 30 gun durur.
      uC?.email === 'kapali-C@metapricex.invalid' && uC?.kapatilanEposta === 'c@firma.test' &&
      uC?.kapatmaNedeni === 'ekiptenCikarildi' &&
      uC?.imhaTarihi?.getTime() === uC?.deletedAt?.getTime() + 30 * 86400000,
    JSON.stringify([hataGovdesi(r6.hata), uC]));
  // ⚠ FAZ 7 F3b: `kullaniciDisKimlik.deleteMany` BEKLENEN bir silmedir
  // (§5.11 — cikarilan uye sirket hesabiyla geri giremesin). Kural hâlâ
  // "KISI ve TEKLIF satiri SERT SILINMEZ": kapsam o iki tabloyla yazildi ki
  // yeni bir yan tablonun silinmesi kapiyi anlamsiz kirmasin.
  const sertSilme = (c: any) => /delete/i.test(c.islem) && /^(user|quote)/i.test(c.tablo);
  check('H6 `user.delete` / `quote.delete*` CAGRILMADI (teklifler firmada kalir)',
    !pH6._iz.cagrilar.some(sertSilme),
    JSON.stringify(pH6._iz.cagrilar.filter(sertSilme)));
  check('H6-OLCUT ⭐ dis kimlik silme CAGRILDI (F3b ikizi; kapi "hic silme yok" demiyor)',
    pH6._iz.cagrilar.some((c: any) => c.tablo === 'kullaniciDisKimlik' && c.islem === 'deleteMany'));
  check('H6 `FirmaOlayi uye.cikarildi` yazildi',
    pH6._veri.firmaOlayi.some((o: Satir) => o.tip === 'uye.cikarildi'));
  const r6b = await dene(() => s6.uyeCikar(K('A'), 'A', 'a@firma.test'));
  check('H6 kendini cikarma → KENDINI_CIKARAMAZ', hataKodu(r6b.hata) === 'KENDINI_CIKARAMAZ');
  const pH6c = sahtePrisma({
    user: [kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1 }),
      kullanici({ id: 'D', email: 'd@firma.test', firmaRol: 'sahip', createdAt: t2 })],
    firma: [{ id: 'F1', ad: 'Acme' }], firmaDavet: [], firmaOlayi: [], abonelik: [],
  });
  const { servis: s6c } = uyelikKur(pH6c);
  pH6c._veri.user[1].firmaRol = 'uye';
  const r6c = await dene(() => s6c.uyeCikar(K('A'), 'D', 'd@firma.test'));
  check('H6-OLCUT normal cikarma gecer (fixture kaniti)', !r6c.hata, JSON.stringify(hataGovdesi(r6c.hata)));
  const pH6d = ucKisi(6);
  const { servis: s6d } = uyelikKur(pH6d);
  const r6d = await dene(() => s6d.uyeCikar(K('A'), 'B', 'yanlis@firma.test'));
  check('H6 e-posta onayi uyusmuyor → ONAY_UYUSMADI', hataKodu(r6d.hata) === 'ONAY_UYUSMADI');
  const r6e = await dene(() => s6d.uyeCikar(K('A'), 'BASKA-FIRMA-KULLANICISI', 'x@x.test'));
  check('H6 baska firmanin kullanicisi → 404 UYE_YOK', hataDurumu(r6e.hata) === 404);

  // H6b — servis katmani: cagiran DB'de `uye` → 403
  const pH6b = ucKisi(6);
  const { servis: s6bb } = uyelikKur(pH6b);
  const r6bb = await dene(() => s6bb.uyeCikar(K('B'), 'C', 'c@firma.test'));
  check('H6b servis `uyeCikar`: cagiran DB`de uye → 403 FIRMA_SAHIBI_GEREKLI',
    hataDurumu(r6bb.hata) === 403 && hataKodu(r6bb.hata) === 'FIRMA_SAHIBI_GEREKLI',
    JSON.stringify(hataGovdesi(r6bb.hata)));
  check('H6b hicbir `user.update` yapilmadi',
    pH6b._veri.user.find((x: Satir) => x.id === 'C')?.deletedAt == null);

  // H7 — cikarilanin kaydiyla JwtStrategy → 401
  const strH7 = new JwtStrategy(pH6);
  const r7 = await dene(() => strH7.validate({ sub: 'C', email: 'c@firma.test', role: 'user' } as any));
  check('H7 cikarilan kullanicinin token`i → 401', hataDurumu(r7.hata) === 401,
    String(r7.hata?.message));

  // H8 — rolDegistir
  const pH8 = ucKisi(6);
  const { servis: s8b } = uyelikKur(pH8);
  const r8 = await dene(() => s8b.rolDegistir(K('A'), 'A', 'uye'));
  check('H8 son sahibi uyeye dusurmek → SON_SAHIP', hataKodu(r8.hata) === 'SON_SAHIP');
  const r8b = await dene(() => s8b.rolDegistir(K('A'), 'YOK', 'sahip'));
  check('H8 baska firma / bilinmeyen → 404', hataDurumu(r8b.hata) === 404);
  const r8c = await dene(() => s8b.rolDegistir(K('A'), 'B', 'sahip'));
  check('H8 rol degisti + `FirmaOlayi rol.degisti`',
    !r8c.hata && pH8._veri.user.find((x: Satir) => x.id === 'B')?.firmaRol === 'sahip' &&
      pH8._veri.firmaOlayi.some((o: Satir) => o.tip === 'rol.degisti' && o.oncekiDeger === 'uye' && o.yeniDeger === 'sahip'),
    JSON.stringify(pH8._veri.firmaOlayi));

  // H8b — servis: cagiran DB'de uye (kendini sahip yapmaya calisiyor)
  const pH8b = ucKisi(6);
  const { servis: s8bb } = uyelikKur(pH8b);
  const r8d = await dene(() => s8bb.rolDegistir(K('B'), 'B', 'sahip'));
  check('H8b uye kendini sahip YAPAMAZ (servis katmani) → 403',
    hataDurumu(r8d.hata) === 403 && hataKodu(r8d.hata) === 'FIRMA_SAHIBI_GEREKLI');
  check('H8b hicbir yazma yapilmadi',
    pH8b._veri.user.find((x: Satir) => x.id === 'B')?.firmaRol === 'uye');
  // token'da sahip ama DB'de AZ ONCE uyeye dusurulmus
  const pH8c = ucKisi(6);
  const { servis: s8cc } = uyelikKur(pH8c);
  pH8c._veri.user.find((x: Satir) => x.id === 'A').firmaRol = 'uye';
  const r8e = await dene(() => s8cc.rolDegistir(K('A'), 'B', 'sahip'));
  check('H8b token`da sahip ama DB`de uye → 403 (kilit ici okuma yarisi kapatir)',
    hataDurumu(r8e.hata) === 403 && hataKodu(r8e.hata) === 'FIRMA_SAHIBI_GEREKLI');

  // S4b — firma kilidi BES tuketicide de sayimdan/yazmadan once
  const kilitTasiyor = (iz: Iz, etiket: string) => {
    const kilit = iz.cagrilar.findIndex((c: any) => c.tablo === '$queryRaw');
    const ilkYazma = iz.cagrilar.findIndex((c: any) => /create|update/i.test(c.islem));
    return { etiket, kilit, ilkYazma, ok: kilit >= 0 && (ilkYazma === -1 || ilkYazma > kilit) };
  };
  const s4bSonuc = [
    kilitTasiyor(pH8._iz, 'rolDegistir'),
    kilitTasiyor(pH6._iz, 'uyeCikar'),
    kilitTasiyor(pH1._iz, 'hesabiKapat'),
    kilitTasiyor(pH5._iz, 'admin.deleteUser'),
  ];
  for (const s of s4bSonuc) {
    check(`S4b ${s.etiket}: firma kilidi YAZMADAN ONCE`, s.ok, JSON.stringify(s));
  }
  const pRol = ucKisi(6);
  const aRol = adminKur(pRol);
  const rRol = await dene(() => aRol.servis.updateFirmaRol({ id: 'Y1', email: 'y@metaprice.test' }, 'B', 'sahip'));
  check('S4b admin firma-rol: firma kilidi YAZMADAN ONCE',
    !rRol.hata && kilitTasiyor(pRol._iz, 'admin firma-rol').ok,
    JSON.stringify([hataGovdesi(rRol.hata), kilitTasiyor(pRol._iz, 'x')]));

  // A1 — admin firma-rol ucu
  check('A1 admin firma-rol: YoneticiOlayi ve FirmaOlayi AYNI transaction`da',
    pRol._veri.yoneticiOlayi.some((o: Satir) => o.tip === 'firma-rol.degisti') &&
      pRol._veri.firmaOlayi.some((o: Satir) => o.tip === 'yonetici.sahip-atadi'),
    JSON.stringify([pRol._veri.yoneticiOlayi.map((o: Satir) => o.tip), pRol._veri.firmaOlayi.map((o: Satir) => o.tip)]));
  const pRol2 = ucKisi(6);
  const aRol2 = adminKur(pRol2);
  const rRol2 = await dene(() => aRol2.servis.updateFirmaRol({ id: 'Y1', email: 'y@metaprice.test' }, 'A', 'uye'));
  check('A1 admin firma-rol son sahip kurali: 400 SON_SAHIP',
    hataKodu(rRol2.hata) === 'SON_SAHIP', JSON.stringify(hataGovdesi(rRol2.hata)));
  const adminKaynak = kodu(oku('backend/src/ozellik/kutuphane/admin/admin.controller.ts'));
  check('A1 `PATCH admin/users/:id/firma-rol` ucu kayitli ve ROLES_KEY ["admin"] sinifta',
    /@Patch\('users\/:id\/firma-rol'\)/.test(adminKaynak) &&
      JSON.stringify(Reflect.getMetadata(ROLES_KEY,
        require('../src/ozellik/kutuphane/admin/admin.controller').AdminController)) === JSON.stringify(['admin']),
    adminKaynak.includes("users/:id/firma-rol") ? 'uc var' : 'uc YOK');
}

// ═══════════════════════════════════════════════════════════════════════════
//  M · MASKELEME ve KVKK EKSENI
// ═══════════════════════════════════════════════════════════════════════════
const FIRMA_ORNEK = {
  id: 'F1', ad: 'Acme', unvan: 'Acme Ltd.', yetkiliEposta: 'yetkili@acme.test',
  faturaEposta: 'fatura@acme.test', vergiNo: '1234567890', vergiDairesi: 'Kadikoy',
  tcKimlikNo: '12345678901', faturaAdresi: 'Adres 1', il: 'Istanbul', ilce: 'Kadikoy',
  telefon: '5551112233', logoMime: null, createdAt: t1,
};

async function bolumM(): Promise<void> {
  console.log('\n── M · MASKELEME ve KVKK ──');

  // M1 — saf suzgec
  const uyeGoru: any = firmaRolaGoreSuz({ ...FIRMA_ORNEK }, 'uye');
  check('M1 uye: `tcKimlikNo` ve `yetkiliEposta` null',
    uyeGoru.tcKimlikNo === null && uyeGoru.yetkiliEposta === null, JSON.stringify(uyeGoru));
  check('M1 uye: antet alanlari KORUNDU (vergiNo/faturaAdresi/telefon/faturaEposta/vergiDairesi)',
    uyeGoru.vergiNo === '1234567890' && uyeGoru.faturaAdresi === 'Adres 1' &&
      uyeGoru.telefon === '5551112233' && uyeGoru.faturaEposta === 'fatura@acme.test' &&
      uyeGoru.vergiDairesi === 'Kadikoy',
    JSON.stringify(uyeGoru));
  check('M1 uye: `gizliAlanlar` TAM IKI eleman',
    JSON.stringify(uyeGoru.gizliAlanlar) === JSON.stringify(['tcKimlikNo', 'yetkiliEposta']),
    JSON.stringify(uyeGoru.gizliAlanlar));
  const sahipGoru: any = firmaRolaGoreSuz({ ...FIRMA_ORNEK }, 'sahip');
  check('M1 sahip: nesne AYNEN + gizliAlanlar []',
    sahipGoru.tcKimlikNo === '12345678901' && sahipGoru.yetkiliEposta === 'yetkili@acme.test' &&
      JSON.stringify(sahipGoru.gizliAlanlar) === JSON.stringify([]),
    JSON.stringify(sahipGoru));
  check('M1 null firma → null', firmaRolaGoreSuz(null as any, 'uye') === null);

  // M2 — /auth/me uyede maskeli
  const pMe = sahtePrisma({
    user: [
      kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1, firma: FIRMA_ORNEK }),
      kullanici({ id: 'B', email: 'b@firma.test', firmaRol: 'uye', createdAt: t2, firma: FIRMA_ORNEK }),
    ],
    firma: [FIRMA_ORNEK], firmaDavet: [], firmaOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', durum: 'AKTIF', erisimSonu: new Date(Date.now() + 30 * 86_400_000), paketSurumu: { paket: { seviye: 'pro', kullaniciHakki: 5 } } }],
    userSubscription: [],
  });
  const authMe = new AuthService(pMe, jwtSahte, { karar: async () => ({}) } as any,
    { dogrulamaGonderSessizce: async () => undefined } as any, new OturumServisi(pMe, jwtSahte));
  const meUye: any = await authMe.me('B');
  const meSahip: any = await authMe.me('A');
  check('M2 `/auth/me` UYE: firma.tcKimlikNo null, yetkiliEposta null',
    meUye?.firma?.tcKimlikNo === null && meUye?.firma?.yetkiliEposta === null,
    JSON.stringify(meUye?.firma));
  check('M2-OLCUT `/auth/me` SAHIP: ikisi de DOLU (sahte Prisma gercekten doner)',
    meSahip?.firma?.tcKimlikNo === '12345678901' && meSahip?.firma?.yetkiliEposta === 'yetkili@acme.test',
    JSON.stringify(meSahip?.firma));

  // M3 — FirmaServisi.getir
  const firmaSvc = new FirmaServisi(pMe as any);
  const getirUye: any = await firmaSvc.getir(K('B'));
  const getirSahip: any = await firmaSvc.getir(K('A'));
  check('M3 `FirmaServisi.getir` UYE: maskeli',
    getirUye.tcKimlikNo === null && getirUye.yetkiliEposta === null, JSON.stringify(getirUye));
  check('M3-OLCUT `FirmaServisi.getir` SAHIP: dolu',
    getirSahip.tcKimlikNo === '12345678901', JSON.stringify(getirSahip));

  // M4 — KVKK ekseni
  const kvkkPrisma = (rol: string) => sahtePrisma({
    user: [kullanici({ id: 'B', email: 'b@firma.test', firmaRol: rol, createdAt: t2, firma: FIRMA_ORNEK })],
    firma: [FIRMA_ORNEK],
    quote: [{ id: 'q1', firmaId: 'F1', userId: 'B' }, { id: 'q2', firmaId: 'F1', userId: 'A' }],
    quoteFormat: [], userLibrary: [], libraryList: [], userBrandLibrary: [],
    laborFirm: [], userSubscription: [], aiUsageLog: [],
    dwgDosya: [{ id: 'dw1', firmaId: 'F1', olusturanId: 'B' }, { id: 'dw2', firmaId: 'F1', olusturanId: 'A' }],
    ceviriDuzeltmesi: [], ceviriDuzeltmeOlayi: [],
    abonelik: [{ id: 'ab1', firmaId: 'F1', durum: 'AKTIF', erisimSonu: t3, denemeSonu: null, odemeYontemi: 'KART', paketSurumu: { paket: { ad: 'Pro', seviye: 'pro' } } }],
    fatura: [{ id: 'f1', abonelik: { firmaId: 'F1' }, durum: 'ODENDI', tutar: 1, paraBirimi: 'TRY', olusturuldu: t2 }],
    denemeKullanimi: [], abonelikBaslatma: [],
    firmaOlayi: [
      { id: 'o1', firmaId: 'F1', tip: 'uye.katildi', aktorId: 'B', hedefKullaniciId: 'B', olusturuldu: t2 },
      { id: 'o2', firmaId: 'F1', tip: 'rol.degisti', aktorId: 'A', hedefKullaniciId: 'A', olusturuldu: t3 },
    ],
    firmaDavet: [],
  });
  const pUye = kvkkPrisma('uye');
  const hUye = new HesapServisi(pUye, { iptalEt: async () => undefined } as any, { gonder: async () => undefined } as any);
  const disaUye: any = await hUye.verileriDisaAktar('B');
  const tekliflerWhere = pUye._iz.cagrilar.find((c: any) => c.tablo === 'quote' && c.islem === 'findMany')?.arg?.where;
  check('M4 UYE teklif süzgeci `{ firmaId, userId }`',
    tekliflerWhere?.firmaId === 'F1' && tekliflerWhere?.userId === 'B', JSON.stringify(tekliflerWhere));
  check('M4 UYE ticari abonelik ve faturalar BOS',
    disaUye.ticariAbonelikler.length === 0 && disaUye.faturalar.length === 0);
  const dwgWhere = pUye._iz.cagrilar.find((c: any) => c.tablo === 'dwgDosya')?.arg?.where;
  check('M4 UYE DWG süzgeci `olusturanId` tasiyor', dwgWhere?.olusturanId === 'B', JSON.stringify(dwgWhere));
  check('M4 UYE firma MASKELI (tcKimlikNo null)', disaUye.kullanici?.firma?.tcKimlikNo === null);
  check('M4 UYE notlarinda "firmanın ticari kayıtları firma sahibinin dosyasındadır" cumlesi var',
    disaUye.notlar.some((n: string) => n.includes('firma sahibinin dosyasındadır')));
  check('M5 UYE FirmaOlayi ekseni: yalniz kendisi (1 satir)',
    disaUye.firmaIslemKayitlari.length === 1 && disaUye.firmaIslemKayitlari[0].tip === 'uye.katildi',
    JSON.stringify(disaUye.firmaIslemKayitlari.map((o: any) => o.tip)));

  const pSahip = kvkkPrisma('sahip');
  const hSahip = new HesapServisi(pSahip, { iptalEt: async () => undefined } as any, { gonder: async () => undefined } as any);
  const disaSahip: any = await hSahip.verileriDisaAktar('B');
  const tekliflerWhereS = pSahip._iz.cagrilar.find((c: any) => c.tablo === 'quote' && c.islem === 'findMany')?.arg?.where;
  check('M4-OLCUT SAHIP teklif süzgeci yalniz `{ firmaId }` (fixture kaniti)',
    tekliflerWhereS?.firmaId === 'F1' && tekliflerWhereS?.userId === undefined,
    JSON.stringify(tekliflerWhereS));
  check('M4-OLCUT SAHIP ticari kayitlar DOLU',
    disaSahip.ticariAbonelikler.length === 1 && disaSahip.faturalar.length === 1);
  check('M5-OLCUT SAHIP FirmaOlayi firma geneli (2 satir)',
    disaSahip.firmaIslemKayitlari.length === 2);
  check('M4-OLCUT SAHIP firma MASKESIZ', disaSahip.kullanici?.firma?.tcKimlikNo === '12345678901');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Q · HAZIRLAYAN  ·  P · KULLANICI HAKKI BETIGI
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//  K · KAPATMA NEDENI ve FIRMA KAPANISI (plan 5.8 · 21.09.2026)
//  Kabul olcutu 5 (son sahip kapatinca uyeler durur / odeme geri getirir /
//  `ekiptenCikarildi` GELMEZ) ve olcut 6 (cikarilan uyenin adresi HEMEN
//  serbest, baska firmaya davet edilebiliyor).
// ═══════════════════════════════════════════════════════════════════════════
async function bolumK(): Promise<void> {
  console.log('\n── K · KAPATMA NEDENI ve FIRMA KAPANISI ──');

  // Firma F1: A(sahip) · B(uye) · C(uye) · hak 3 · bir de bekleyen davet.
  // Ikinci firma F2: Z(sahip), hak 3 — cikarilan uyeyi davet edecek.
  const p = sahtePrisma({
    user: [
      kullanici({ id: 'A', email: 'a@firma.test', firmaRol: 'sahip', createdAt: t1, password: PAROLA_OZETI }),
      kullanici({ id: 'B', email: 'b@firma.test', createdAt: t2, password: PAROLA_OZETI }),
      kullanici({ id: 'C', email: 'c@firma.test', createdAt: t3, password: PAROLA_OZETI }),
      kullanici({ id: 'Z', email: 'z@ikinci.test', firmaId: 'F2', firmaRol: 'sahip', createdAt: t1, password: PAROLA_OZETI }),
    ],
    firma: [{ id: 'F1', ad: 'Acme', imhaTarihi: null }, { id: 'F2', ad: 'Ikinci', imhaTarihi: null }],
    firmaDavet: [], firmaOlayi: [], quote: [], yoneticiOlayi: [],
    abonelik: [
      { id: 'ab1', firmaId: 'F1', paketSurumu: { paket: { kullaniciHakki: 3, kod: 'pro-mep' } } },
      { id: 'ab2', firmaId: 'F2', paketSurumu: { paket: { kullaniciHakki: 3, kod: 'pro-mep' } } },
    ],
  });
  const { servis: uyelik } = uyelikKur(p);
  const hesap = hesapKur(p);

  // ── 1) Sahip C'yi ekipten CIKARIR → K1 istisnasi ────────────────────────
  const rC = await dene(() => uyelik.uyeCikar(K('A'), 'C', 'c@firma.test'));
  const uC = () => p._veri.user.find((x: Satir) => x.id === 'C');
  check('K1 ⭐ ekipten cikarilanin ADRESI HEMEN SERBEST (K1 istisnasi)',
    !rC.hata && uC()?.email === 'kapali-C@metapricex.invalid' &&
      uC()?.kapatilanEposta === 'c@firma.test' &&
      uC()?.kapatmaNedeni === 'ekiptenCikarildi',
    JSON.stringify([hataGovdesi(rC.hata), uC()]));

  // ── 2) Son sahip A KAPATIR → K2: firma kapanir, B durur ─────────────────
  // ⚠ Bekleyen davet KAPANIS ANINDA acik olsun ki iptali olculebilsin.
  davetEkle(p, { id: 'dK', firmaId: 'F1', eposta: 'sonradan@firma.test' });
  const rA = await dene(() => hesap.servis.hesabiKapat('A', 'parola1234'));
  const uA = p._veri.user.find((x: Satir) => x.id === 'A');
  const uB = p._veri.user.find((x: Satir) => x.id === 'B');
  const f1 = p._veri.firma.find((x: Satir) => x.id === 'F1');
  check('K2 ⭐ SON SAHIP KAPATABILIR (eski hâl 400 SON_SAHIP veriyordu)',
    !rA.hata && uA?.deletedAt != null && uA?.kapatmaNedeni === 'kendi',
    JSON.stringify([hataGovdesi(rA.hata), uA]));
  check('K2 ⭐ uye B `firmaKapandi` ile DURDU (silinmedi: satir ve teklifleri duruyor)',
    uB?.deletedAt != null && uB?.kapatmaNedeni === 'firmaKapandi' &&
      uB?.passwordChangedAt?.getTime() === uB?.deletedAt?.getTime(),
    JSON.stringify(uB));
  check('K2 uyenin E-POSTASI DEGISMEDI (sahip geri acinca ayni adresle girecek)',
    uB?.email === 'b@firma.test' && uB?.kapatilanEposta === null,
    JSON.stringify([uB?.email, uB?.kapatilanEposta]));
  check('K2 ⭐ SAHIP, UYE ve FIRMA ayni `imhaTarihi`ni tasiyor (§3.2)',
    uA?.imhaTarihi instanceof Date &&
      uA?.imhaTarihi?.getTime() === uB?.imhaTarihi?.getTime() &&
      uA?.imhaTarihi?.getTime() === f1?.imhaTarihi?.getTime() &&
      uA?.imhaTarihi?.getTime() === uA?.deletedAt?.getTime() + 30 * 86400000,
    JSON.stringify({ A: uA?.imhaTarihi, B: uB?.imhaTarihi, F1: f1?.imhaTarihi }));
  check('K2 ⭐ ZATEN KAPALI olan C EZILMEDI (nedeni ve tarihi korundu)',
    uC()?.kapatmaNedeni === 'ekiptenCikarildi' &&
      uC()?.email === 'kapali-C@metapricex.invalid',
    JSON.stringify(uC()));
  // ⚠ Firma kapaninca abonelik de IPTAL: kimse kullanamayacak bir firmanin
  // karti cekilmeye devam edemez. Eski kural yalniz "firmanin son hesabi"
  // dalinda iptal ediyordu; uyeleri olan bir firma kapandiginda ETMIYORDU.
  check('K2 ⭐ uyeli firma kapaninca ABONELIK de iptal edildi',
    hesap.iptaller.length === 1 && hesap.iptaller[0].neden === 'hesap kapatma' &&
      hesap.iptaller[0].firmaId === 'F1',
    JSON.stringify(hesap.iptaller));
  check('K2 bekleyen davet AYNI transaction`da iptal edildi',
    p._veri.firmaDavet.find((d: Satir) => d.id === 'dK')?.iptalAt != null &&
      p._veri.firmaOlayi.some((o: Satir) => o.tip === 'davet.otomatik-iptal'),
    JSON.stringify(p._veri.firmaDavet.find((d: Satir) => d.id === 'dK')));
  check('K2 `uye.firma-kapandi` olayi SAYIYLA yazildi (icerik degil)',
    p._veri.firmaOlayi.some((o: Satir) => o.tip === 'uye.firma-kapandi' && o.veri?.durdurulan === 1),
    JSON.stringify(p._veri.firmaOlayi.map((o: Satir) => [o.tip, o.veri])));
  check('K2 ⭐ uyeye AYRI ve KISA e-posta gitti, GERCEK TARIHLE',
    (() => {
      const gg = new Date(uB!.imhaTarihi.getTime() + 3 * 3600000);
      const bek = `${String(gg.getUTCDate()).padStart(2, '0')}.${String(gg.getUTCMonth() + 1).padStart(2, '0')}.${gg.getUTCFullYear()}`;
      const e = hesap.epostalar.find((x) => x.kime === 'b@firma.test');
      const s = hesap.epostalar.find((x) => x.kime === 'a@firma.test');
      return !!e && !!s && e.konu !== s.konu &&
        /[Ff]irman/.test(e.govde) && e.govde.includes(bek) &&
        // Uyeye "paket secin" DENMEZ: karar sahibindir, uye odeme yapamaz.
        !/paket seçerek hesabınızı/.test(e.govde);
    })(),
    JSON.stringify(hesap.epostalar.map((e) => [e.kime, e.konu])));
  check('K2 ⭐ CIKARILAN UYEYE firma kapanis e-postasi GITMEDI (o ekipte degil)',
    !hesap.epostalar.some((e) => /kapali-C@/.test(e.kime) || e.kime === 'c@firma.test'),
    JSON.stringify(hesap.epostalar.map((e) => e.kime)));

  // ── 3) ODEME GERI ACINCA KIM DONER (olcut 5'in son ayagi) ───────────────
  // ⚠ IKINCI BIR KURAL YAZILMAZ: geri acmanin kapali listesi D gorevinin
  // dosyasindadir (`abonelik.servisi.ts`). Burada O LISTE okunur ve kapanis
  // fixture'ina UYGULANIR — ikiz bir "kim doner" tablosu tutulsaydi ikisi
  // ayri zamanlarda degisirdi.
  const { GERI_ACILAN_KAPATMA_NEDENLERI } =
    require('../src/ozellik/odeme/abonelik/abonelik.servisi');
  const donenler = p._veri.user
    .filter((u: Satir) => u.firmaId === 'F1' && u.deletedAt &&
      GERI_ACILAN_KAPATMA_NEDENLERI.includes(u.kapatmaNedeni))
    .map((u: Satir) => u.id).sort();
  check('K3-FIXTURE geri acma listesi GERCEKTEN okundu (bos dizi yalanci yesil vermesin)',
    Array.isArray(GERI_ACILAN_KAPATMA_NEDENLERI) && GERI_ACILAN_KAPATMA_NEDENLERI.length === 2,
    JSON.stringify(GERI_ACILAN_KAPATMA_NEDENLERI));
  check('K3 ⭐ odeme sonrasi DONENLER: A (kendi) + B (firmaKapandi)',
    JSON.stringify(donenler) === JSON.stringify(['A', 'B']), JSON.stringify(donenler));
  check('K3 ⭐ `ekiptenCikarildi` olan C GERI GELMEZ',
    !donenler.includes('C') && !GERI_ACILAN_KAPATMA_NEDENLERI.includes('ekiptenCikarildi'),
    JSON.stringify([donenler, GERI_ACILAN_KAPATMA_NEDENLERI]));

  // ── 4) OLCUT 6: cikarilan uye BASKA FIRMAYA katilabiliyor ───────────────
  const dZ = davetEkle(p, { id: 'dZ', firmaId: 'F2', eposta: 'c@firma.test',
    davetEdenId: 'Z', davetEdenEposta: 'z@ikinci.test' });
  const rKabul = await dene(() => uyelik.davetKabul({
    token: dZ.token, parola: 'parola1234', sozlesmeOnayi: true,
  } as any));
  const yeniC = p._veri.user.find((u: Satir) => u.email === 'c@firma.test' && u.firmaId === 'F2');
  check('K4 ⭐ ekipten cikarilan kisi BASKA FIRMANIN davetini kabul edebildi',
    !rKabul.hata && !!yeniC && yeniC.firmaRol === 'uye',
    JSON.stringify([hataGovdesi(rKabul.hata), yeniC?.id]));
  check('K4 eski satir DOKUNULMADAN duruyor (teklifleri F1`de kalir)',
    uC()?.id === 'C' && uC()?.firmaId === 'F1' && yeniC?.id !== 'C',
    JSON.stringify([uC()?.firmaId, yeniC?.id]));

  // ── 5) K1`IN IKIZI: adresi DURAN kapali hesap davete katilamaz ──────────
  // ⚠ Bu kapi olmasaydi `user.create` `User.email` @unique kisitina carpar
  // ve musteri ham 500 gorurdu (kayit yolunun ikizi, §4.3).
  const dB = davetEkle(p, { id: 'dB', firmaId: 'F2', eposta: 'b@firma.test',
    davetEdenId: 'Z', davetEdenEposta: 'z@ikinci.test' });
  const rB = await dene(() => uyelik.davetKabul({
    token: dB.token, parola: 'parola1234', sozlesmeOnayi: true,
  } as any));
  check('K5 ⭐ adresi DURAN kapali hesap → 400 KAPALI_HESAP_VAR (ham 500 DEGIL)',
    hataKodu(rB.hata) === 'KAPALI_HESAP_VAR' && hataDurumu(rB.hata) === 400,
    JSON.stringify([hataDurumu(rB.hata), hataGovdesi(rB.hata)]));
  check('K5 ikinci bir B hesabi ACILMADI',
    p._veri.user.filter((u: Satir) => u.email === 'b@firma.test').length === 1,
    JSON.stringify(p._veri.user.filter((u: Satir) => u.email === 'b@firma.test').map((u: Satir) => u.id)));

  // ── 6) KAPATMA ONIZLEMESI — onay metninin TEK kaynagi (§3.3.1) ──────────
  const p2 = sahtePrisma({
    user: [
      kullanici({ id: 'S', email: 's@uc.test', firmaId: 'F3', firmaRol: 'sahip', createdAt: t1, password: PAROLA_OZETI }),
      kullanici({ id: 'U1', email: 'u1@uc.test', firmaId: 'F3', createdAt: t2, password: PAROLA_OZETI }),
      kullanici({ id: 'U2', email: 'u2@uc.test', firmaId: 'F3', createdAt: t3, password: PAROLA_OZETI }),
      kullanici({ id: 'Y', email: 'y@dort.test', firmaId: 'F4', firmaRol: 'sahip', createdAt: t1, password: PAROLA_OZETI }),
      kullanici({ id: 'Y2', email: 'y2@dort.test', firmaId: 'F4', firmaRol: 'sahip', createdAt: t2, password: PAROLA_OZETI }),
    ],
    firma: [{ id: 'F3', ad: 'Uc' }, { id: 'F4', ad: 'Dort' }],
    firmaDavet: [], firmaOlayi: [], abonelik: [], quote: [], yoneticiOlayi: [],
  });
  const h2 = hesapKur(p2);
  const onS = await h2.servis.kapatmaOnizlemesi('S');
  check('K6 ⭐ son sahip onizlemesi: `firmaKapaniyor: true` + `digerHesap: 2`',
    onS.firmaVar === true && onS.karar.izin === true &&
      (onS.karar as any).firmaKapaniyor === true && onS.digerHesap === 2,
    JSON.stringify(onS));
  const onY = await h2.servis.kapatmaOnizlemesi('Y');
  check('K6 baska etkin sahip varken firma DEVAM eder (`firmaKapaniyor: false`)',
    onY.karar.izin === true && (onY.karar as any).firmaKapaniyor === false,
    JSON.stringify(onY));
  const onU = await h2.servis.kapatmaOnizlemesi('U1');
  check('K6 uye onizlemesi: firma DEVAM',
    onU.karar.izin === true && (onU.karar as any).firmaKapaniyor === false,
    JSON.stringify(onU));
  check('K6 onizleme HICBIR SEY YAZMADI (salt okunur uc)',
    !p2._iz.cagrilar.some((c: any) => /create|update|delete/i.test(c.islem)),
    JSON.stringify(p2._iz.cagrilar.map((c: any) => c.islem)));
  check('K6 onizleme `saklamaGun` tasiyor (on yuzdeki 30 ikizi buna baglanacak)',
    onS.saklamaGun === KAPATMA_SAKLAMA_GUN, String(onS.saklamaGun));

  // ── 7) KAYNAK KAPILARI — kural TEK yerde kalsin ─────────────────────────
  const hesapKodu = kodu(oku('backend/src/altyapi/auth/hesap.servisi.ts'));
  const adminKodu = kodu(oku('backend/src/ozellik/kutuphane/admin/admin.service.ts'));
  const uyelikKodu = kodu(oku('backend/src/ozellik/firma/uyelik.servisi.ts'));
  check('K7 ⭐ `firmayiKapatabilir` YALNIZ kendi kapatma yolunda',
    /firmayiKapatabilir:\s*true/.test(hesapKodu) &&
      !/firmayiKapatabilir/.test(adminKodu) && !/firmayiKapatabilir/.test(uyelikKodu),
    'yonetici silmesi ya da uye cikarma firmayi kapatabilir hâle gelmis');
  check('K7 dort kapatma yolunun DORDU de `kapatmaVerisi(..., neden)` cagiriyor',
    (hesapKodu.match(/kapatmaVerisi\([^)]*'kendi'\)/g) ?? []).length === 2 &&
      /kapatmaVerisi\([^)]*'ekiptenCikarildi'\)/.test(uyelikKodu) &&
      /kapatmaVerisi\([^)]*'yonetici'\)/.test(adminKodu),
    'bir yol nedensiz kapatiyorsa imha ve geri donus o hesapta sessizce sasar');
  check('K7 uye durdurma TEK yazma (`topluKapatmaVerisi` + tek `updateMany`)',
    /topluKapatmaVerisi\(simdi, 'firmaKapandi'\)/.test(hesapKodu) &&
      (hesapKodu.match(/user\.updateMany/g) ?? []).length === 1,
    'ikinci bir durdurma mekanizmasi yazilmis');
}

function bolumQP(): void {
  console.log('\n── Q · HAZIRLAYAN ──');
  const ayrilan = hazirlayanGorunumu({
    ad: 'Ali', soyad: 'Veli', email: 'kapali-C@metapricex.invalid',
    kapatilanEposta: 'c@firma.test', deletedAt: new Date(),
  });
  check('Q1 ayrilan kisi: ad soyad + ayrildi:true',
    ayrilan?.gorunenAd === 'Ali Veli' && ayrilan?.ayrildi === true, JSON.stringify(ayrilan));
  const ayrilanAdsiz = hazirlayanGorunumu({
    ad: null, soyad: null, email: 'kapali-C@metapricex.invalid',
    kapatilanEposta: 'c@firma.test', deletedAt: new Date(),
  });
  check('Q1 adsiz ayrilan: `kapatilanEposta` gosterilir, ANONIM ADRES ASLA',
    ayrilanAdsiz?.gorunenAd === 'c@firma.test' &&
      !String(ayrilanAdsiz?.gorunenAd).includes('metapricex.invalid'),
    JSON.stringify(ayrilanAdsiz));
  const etkin = hazirlayanGorunumu({ ad: null, soyad: null, email: 'b@firma.test', deletedAt: null });
  check('Q1 etkin kisi: e-posta + ayrildi:false',
    etkin?.gorunenAd === 'b@firma.test' && etkin?.ayrildi === false, JSON.stringify(etkin));
  check('Q1 kullanici yok → null', hazirlayanGorunumu(null) === null);
  const quotesKodu = kodu(oku('backend/src/ozellik/teklif/quotes/quotes.service.ts'));
  check('Q1 BAGLANTI: `findAll` `hazirlayanGorunumu(` cagiriyor ve `userId` doner',
    /hazirlayanGorunumu\(user\)/.test(quotesKodu) && /userId: true/.test(quotesKodu));

  console.log('\n── P · KULLANICI HAKKI BETIGI ──');
  const paketler = [
    { id: 'p1', kod: 'basic-mek', aktif: true, kullaniciHakki: 2 },
    { id: 'p2', kod: 'pro-mek', aktif: true, kullaniciHakki: 2 },
    { id: 'p3', kod: 'basic-elk', aktif: true, kullaniciHakki: 2 },
    { id: 'p4', kod: 'pro-elk', aktif: true, kullaniciHakki: 2 },
    { id: 'p5', kod: 'pro-mep', aktif: true, kullaniciHakki: 2 },
    { id: 'p6', kod: 'miras-eski', aktif: false, kullaniciHakki: 5 },
  ];
  const plan = hakPlaniUret(paketler);
  check('P1 bes kod → 1/1/2/2/3',
    YENI_HAKLAR['basic-mek'] === 1 && YENI_HAKLAR['basic-elk'] === 1 &&
      YENI_HAKLAR['pro-mek'] === 2 && YENI_HAKLAR['pro-elk'] === 2 && YENI_HAKLAR['pro-mep'] === 3,
    JSON.stringify(YENI_HAKLAR));
  check('P1 yalniz degisenler planda (basic-mek, basic-elk, pro-mep)',
    plan.degisecekler.map((d) => d.kod).sort().join(',') === 'basic-elk,basic-mek,pro-mep',
    JSON.stringify(plan.degisecekler));
  check('P1 MIRAS (pasif) paket DOKUNULMAZ',
    plan.dokunulmayanlar.some((d) => d.kod === 'miras-eski' && d.hak === 5),
    JSON.stringify(plan.dokunulmayanlar));
  let bilinmeyenHata: any = null;
  try {
    hakPlaniUret([...paketler, { id: 'p9', kod: 'yeni-paket', aktif: true, kullaniciHakki: 2 }]);
  } catch (e) { bilinmeyenHata = e; }
  check('P1 listede olmayan AKTIF kod → HATA (sessiz atlama YOK)',
    !!bilinmeyenHata && String(bilinmeyenHata.message).includes('yeni-paket'),
    String(bilinmeyenHata?.message));

  // `durdurulacaklar` SQL 4 mantigiyla ayni sonucu verir (uc firmali fixture)
  const firmalar = [
    { firmaId: 'F1', firmaAd: 'Bir', paketKodu: 'basic-mek', etkinHesap: 2 },
    { firmaId: 'F2', firmaAd: 'Iki', paketKodu: 'pro-mek', etkinHesap: 2 },
    { firmaId: 'F3', firmaAd: 'Uc', paketKodu: 'pro-mep', etkinHesap: 5 },
  ];
  const durus = durdurulacaklar(firmalar);
  check('P1 `durdurulacaklar`: F1 → 1 kisi (hak 1), F3 → 2 kisi (hak 3), F2 ETKILENMEZ',
    durus.length === 2 &&
      durus[0].firmaId === 'F3' && durus[0].durdurulacak === 2 &&
      durus[1].firmaId === 'F1' && durus[1].durdurulacak === 1,
    JSON.stringify(durus));
  const betikKodu = kodu(oku('backend/scripts/kullanici-hakki-guncelle.ts'));
  check('P1 PROVA varsayilan: `--uygula` YOKSA yazma dali kosmaz (kaynak kapisi)',
    /if \(!uygula\)[\s\S]{0,200}return;/.test(betikKodu) &&
      betikKodu.indexOf('$transaction') > betikKodu.indexOf('if (!uygula)'),
    'prova erken donusu');
  check('P1 betikte `$executeRaw` YOK (tek transaction + Prisma update)',
    !/\$executeRaw/.test(betikKodu));
  const kurulumKodu = kodu(oku('backend/scripts/paketleri-kur.ts'));
  check('P1 `paketleri-kur.ts` degerleri 1/1/2/2/3',
    /kod: 'basic-mek'[\s\S]{0,600}?kullaniciHakki: 1,/.test(kurulumKodu) &&
      /kod: 'basic-elk'[\s\S]{0,600}?kullaniciHakki: 1,/.test(kurulumKodu) &&
      /kod: 'pro-mep'[\s\S]{0,600}?kullaniciHakki: 3,/.test(kurulumKodu));

  console.log('\n── Z · SAF KURAL OLCUTLERI ──');
  check('Z `etkinHesapKosulu` tek tanim { deletedAt: null, status: "active" }',
    JSON.stringify(etkinHesapKosulu()) === JSON.stringify({ deletedAt: null, status: 'active' }));
  const bk = bekleyenDavetKosulu(t2);
  check('Z `bekleyenDavetKosulu` = { kabulAt:null, iptalAt:null, sonGecerlilik:{gt} }',
    bk.kabulAt === null && bk.iptalAt === null && bk.sonGecerlilik.gt === t2);
  check('Z `ayrilmaKarari` tek hesap → firma kapanir',
    JSON.stringify(ayrilmaKarari({ firmaRol: 'uye', digerHesap: 0, digerEtkinSahip: 0 })) ===
      JSON.stringify({ izin: true, firmaKapaniyor: true }));
  check('Z `ayrilmaKarari` uye + baska hesap → firma DEVAM',
    JSON.stringify(ayrilmaKarari({ firmaRol: 'uye', digerHesap: 2, digerEtkinSahip: 1 })) ===
      JSON.stringify({ izin: true, firmaKapaniyor: false }));
  check('Z `ayrilmaKarari` son sahip + YETKISIZ YOL → SON_SAHIP',
    (ayrilmaKarari({ firmaRol: 'sahip', digerHesap: 1, digerEtkinSahip: 0 }) as any).kod === 'SON_SAHIP');
  check('Z ⭐ `ayrilmaKarari` son sahip + `firmayiKapatabilir` → firma KAPANIR (K2)',
    JSON.stringify(ayrilmaKarari({
      firmaRol: 'sahip', digerHesap: 1, digerEtkinSahip: 0, firmayiKapatabilir: true,
    })) === JSON.stringify({ izin: true, firmaKapaniyor: true }));
  check('Z ⭐ `firmayiKapatabilir` BASKA SAHIP VARKEN firmayi kapatmaz',
    JSON.stringify(ayrilmaKarari({
      firmaRol: 'sahip', digerHesap: 2, digerEtkinSahip: 1, firmayiKapatabilir: true,
    })) === JSON.stringify({ izin: true, firmaKapaniyor: false }));
  const kv = kapatmaVerisi({ id: 'X', email: 'x@firma.test' }, t2, 'kendi');
  check('Z `kapatmaVerisi(kendi)` bes alan, E-POSTA ANAHTARI HIC YOK (K1)',
    kv.deletedAt === t2 && kv.passwordChangedAt === t2 &&
      kv.passwordChangedAt.getTime() === kv.deletedAt.getTime() &&
      kv.kapatilanEposta === 'x@firma.test' && kv.kapatmaNedeni === 'kendi' &&
      // ⚠ `=== undefined` YETMEZ: anahtarin VARLIGI olculur. `email: undefined`
      // yazilmis olsaydi Prisma alani "degistirme" sayardi ama sozlesme
      // yanlis olurdu; burada anahtar HIC OLMAMALI.
      !('email' in kv) &&
      kv.imhaTarihi.getTime() === t2.getTime() + 30 * 86400000,
    JSON.stringify([kv, Object.keys(kv)]));
  for (const n of ['yonetici', 'firmaKapandi'] as const) {
    const k = kapatmaVerisi({ id: 'X', email: 'x@firma.test' }, t2, n);
    check(`Z \`kapatmaVerisi(${n})\` de e-postayi DEGISTIRMEZ`, !('email' in k), JSON.stringify(Object.keys(k)));
  }
  const kvC = kapatmaVerisi({ id: 'X', email: 'x@firma.test' }, t2, 'ekiptenCikarildi');
  check('Z ⭐ `kapatmaVerisi(ekiptenCikarildi)` TEK istisna: adres anonimlesir',
    kvC.email === 'kapali-X@metapricex.invalid' && kvC.kapatmaNedeni === 'ekiptenCikarildi',
    JSON.stringify(kvC));
  const tkv = topluKapatmaVerisi(t2, 'firmaKapandi');
  check('Z `topluKapatmaVerisi` KISIYE BAGLI alan TASIMAZ (updateMany guvenli)',
    !('email' in tkv) && !('kapatilanEposta' in tkv) &&
      JSON.stringify(Object.keys(tkv).sort()) ===
        JSON.stringify(['deletedAt', 'imhaTarihi', 'kapatmaNedeni', 'passwordChangedAt']),
    JSON.stringify(Object.keys(tkv)));
  check('Z `imhaTarihiHesapla` = KAPATMA_SAKLAMA_GUN gun sonrasi (ciplak 30 YOK)',
    imhaTarihiHesapla(t2).getTime() === t2.getTime() + KAPATMA_SAKLAMA_GUN * 86400000 &&
      KAPATMA_SAKLAMA_GUN === 30);
  const sahipKosul = oncekilerKosulu({ firmaRol: 'sahip', createdAt: t2, id: 'A' });
  check('Z `oncekilerKosulu(sahip)` YALNIZ sahip dallari (2 dal)',
    sahipKosul.length === 2 && sahipKosul.every((d: any) => d.firmaRol === 'sahip'),
    JSON.stringify(sahipKosul));
}

// ═══════════════════════════════════════════════════════════════════════════
//  X · KAYIT KAPILARI (paket · SUITES · KOD HARITASI · migration)
// ═══════════════════════════════════════════════════════════════════════════
function bolumX(): void {
  console.log('\n── X · KAYIT KAPILARI ──');
  const pkg = oku('backend/package.json');
  check('X `test:faz7-ekip` scripti kayitli', /"test:faz7-ekip":\s*"ts-node test\/faz7-ekip-test\.ts"/.test(pkg));
  const suites = oku('backend/test/regression-all.ts');
  check('X `regression-all.ts` SUITES kaydi var (zincir Z0, db yok)',
    /script: 'test:faz7-ekip'/.test(suites) && !/script: 'test:faz7-ekip'[^}]*db: true/.test(suites));
  const harita = oku('KOD_HARITASI.md');
  for (const dosya of [
    'backend/src/ozellik/firma/uyelik-kurallari.ts',
    'backend/src/ozellik/firma/uyelik.servisi.ts',
    'backend/src/altyapi/auth/oturum.servisi.ts',
    'backend/test/faz7-ekip-test.ts',
  ]) {
    check(`X KOD_HARITASI.md ${dosya} icerir`, harita.includes(dosya));
  }
  const migAd = fs.readdirSync(path.join(KOK, 'backend/prisma/migrations'))
    .find((d) => d.endsWith('_faz7_firma_uyelik'));
  check('X migration klasoru var', !!migAd, String(migAd));
  const mig = migAd ? oku(`backend/prisma/migrations/${migAd}/migration.sql`) : '';
  check('X migration YALNIZ EKLER (DROP/DELETE yok — yorum disinda)',
    !/^\s*(DROP|DELETE)\b/im.test(mig.replace(/^--.*$/gm, '')), 'DROP/DELETE bulundu');
  check('X migration iki tabloyu ve User indeksini olusturuyor',
    /CREATE TABLE "FirmaDavet"/.test(mig) && /CREATE TABLE "FirmaOlayi"/.test(mig) &&
      /CREATE INDEX "User_firmaId_firmaRol_createdAt_idx"/.test(mig));
  check('X migration sonunda GERI ALMA notu var (yorum)', /GERI ALMA/.test(mig));
  const sema = oku('backend/prisma/schema.prisma');
  check('X sema: FirmaDavet.tokenHash @unique · rol kolonu YOK',
    /tokenHash\s+String\s+@unique/.test(sema) &&
      !/model FirmaDavet[\s\S]*?firmaRol[\s\S]*?\n\}/.test(sema));
}

async function main() {
  await bolumO();
  bolumR();
  await bolumS();
  await bolumD();
  await bolumH();
  await bolumK();
  await bolumM();
  bolumQP();
  bolumX();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`FAZ 7 EKIP (F1b): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
