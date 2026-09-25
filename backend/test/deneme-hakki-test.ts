/**
 * DENEME HAKKI — BIR KEZ  (`npm run test:deneme-hakki`)  · Faz 6.12a, 16.09.2026
 *
 * AG/DB GEREKTIRMEZ. GERCEK servisler (SatinAlmaServisi, DenemeHakkiServisi,
 * AbonelikServisi, WebhookIsleyici, MutabakatJob, HesapServisi, AuthService,
 * AbonelikController) BELLEK-PRISMA uzerinde kosar. Bellek-Prisma SADIKTIR:
 * `where`i gercekten uygular (OR/in/gt/lte/not, duyarsiz esitlikte ILIKE
 * JOKER davranisi dahil — en kotu hal), tekillik kisitlarini (e-posta, firma
 * aboneligi, niyet token'i, deneme kaydinin niyeti) ihlalde P2002 ile
 * reddeder, bilmedigi operatorde PATLAR (sessizce yok saymaz) ve her cagrida
 * olay dongusune doner (es zamanli iki sonuclandirma gercekten ic ice gecer).
 *
 * ── NEDEN ────────────────────────────────────────────────────────────────
 * 15.09 olcumu: deneme karari hicbir kimlige bagli degildi (tek kistas
 * `surum.denemeGunu > 0`), iyzico'ya her seferinde AYNI denemeli plan
 * gidiyordu. Olculen tekrar yollari asagida birer blok:
 *   A ayni firma: iptal → SONA_ERDI → yeniden alim
 *   B ayni firma: deneme sonu tahsilat basarisiz → (K-P5 onarimi ile dunning)
 *   C hesap kapat → ayni e-postayla yeni kayit
 *   D yeni e-posta + ayni telefon
 *   E ayni e-postanin buyuk harfli bicimi (K-P6 oncesi acilmis ikiz)
 * Her yolda ikinci deneme VERILMEZ, satin alma ENGELLENMEZ, iyzico'ya
 * denemesiz IKIZ plan gider ve abonelik AKTIF (DENEME degil) acilir.
 *
 * ── BLOKLAR ──────────────────────────────────────────────────────────────
 *   S    saf normalize/kosul                  O  OLCUT: temiz firma deneme ALIR
 *   A-E  tekrar yollari                        F  form e-postasi anahtari
 *   M    miras firma (K-P3)                   V  dogrulanmamis e-posta (K-P4)
 *   Y    denemesiz plan kodu yok → 503        N  niyet deneme gunu esas
 *   K    deneme kaydi TAM BIR KEZ              C  cift abonelik + firma sirasi
 *   W    K-P5: deneme sonu basarisiz tahsilat → ODEME_BEKLIYOR + dunning
 *   T    mutabakat UNPAID artik gecersiz gecis degil
 *   G    K-P6 kayit/giris harf duyarsiz        L  controller baglantisi (K-P7)
 *   H    KVKK veri indirmesi                   I  ikiz plan tanimi (betik)
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
// Hata turleri ADIYLA karsilastirilir (hataTuru): import edilen sinifla `instanceof`
// ts-node altinda farkli modul kopyasinda yanlis-negatif verebilir.
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  denemeAnahtarlari,
  denemeEpostaAnahtari,
  denemeKaydiKosulu,
  telefonAnahtari,
} from '../src/ozellik/odeme/abonelik/deneme-hakki';
import { epostaKucult } from '../src/altyapi/auth/eposta';
import { DenemeHakkiServisi } from '../src/ozellik/odeme/abonelik/deneme-hakki.servisi';
import {
  SatinAlmaServisi,
  planSec,
} from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { MutabakatJob } from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
import { AuthService } from '../src/altyapi/auth/auth.service';
import { OturumServisi } from '../src/altyapi/auth/oturum.servisi';
import { ParolaServisi } from '../src/altyapi/auth/parola.servisi';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { OdemeModule } from '../src/ozellik/odeme/odeme.module';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

/**
 * FAZ 7 F2b — `login`/`register` artik DALLANIR (MFA acik/zorunluysa yanitta
 * `token` ANAHTARI YOKTUR). Bu paketteki hicbir fixture'da iki adimli giris
 * acik ya da zorunlu DEGILDIR; yanit her zaman OTURUM dalidir.
 *
 * ⚠ `as any` YERINE bu yardimci: MFA dali gelirse test GURULTULU duser,
 * `undefined.user` okuyup anlamsiz bir hata vermez.
 */
function oturumDali(y: unknown): {
  token: string;
  user: { id: string; email: string; role: string; tier: string; koltukDurduruldu: boolean };
} {
  if (!y || typeof y !== 'object' || !('token' in (y as Record<string, unknown>))) {
    throw new Error(`Oturum yaniti beklendi, MFA dali geldi: ${JSON.stringify(y)}`);
  }
  return y as never;
}


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

// Nest gunlugu gurultusu kapali; DH_GUNLUK=1 ile acilir.
if (!process.env.DH_GUNLUK) Logger.overrideLogger(false);
// AuthService.signToken anahtari ortamdan okur (yedek deger YOK, bilincli).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'deneme-hakki-testi-icin-yerel-anahtar-32karakter';

const GUN = 86_400_000;

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel?: string; uzak?: string }>> = {
  abonelik: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
  abonelikBaslatma: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  paket: { surumler: { model: 'paketSurumu', uzak: 'paketId' } },
  user: { firma: { model: 'firma', yerel: 'firmaId' } },
};
const TEKILLER: Record<string, string[]> = {
  user: ['email'],
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  abonelikBaslatma: ['token'],
  denemeKullanimi: ['abonelikBaslatmaId'],
  paketSurumu: ['iyzicoPlanKodu', 'iyzicoDenemesizPlanKodu'],
  paket: ['kod'],
};
const VARSAYILAN: Record<string, () => Satir> = {
  user: () => ({ role: 'user', status: 'active', tier: 'core', firmaRol: 'sahip', emailVerified: false, deletedAt: null, createdAt: new Date(), kapatilanEposta: null, passwordChangedAt: null }),
  abonelikBaslatma: () => ({ durum: 'BEKLIYOR', denemeSayisi: 0, olusturuldu: new Date(), sonuclandi: null, hata: null, iyzicoAbonelikKodu: null, denemeGunu: null, planKodu: null, epostaNormal: null, formEpostaNormal: null, telefonNormal: null }),
  abonelik: () => ({ denemeSayisi: 0, ilkBasarisizlik: null, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null, olusturuldu: new Date(), guncellendi: new Date(), iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null, denemeSonu: null, odemeYontemi: 'KART' }),
  denemeKullanimi: () => ({ olusturuldu: new Date(), kullaniciId: null, abonelikBaslatmaId: null, epostaNormal: null, formEpostaNormal: null, telefonNormal: null, iyzicoMusteriKodu: null }),
  abonelikOlayi: () => ({ olusturuldu: new Date(), aktor: 'sistem' }),
  webhookOlayi: () => ({ islendi: false, denemeSayisi: 0, hata: null, alindi: new Date() }),
  firma: () => ({ unvan: null, yetkiliEposta: null, faturaAdresi: null, il: null, telefon: null, createdAt: new Date() }),
};

function tekilHatasi(model: string, alan: string): Error {
  return Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), { code: 'P2002' });
}

/** Postgres ILIKE: `%` ve `_` KACIRILMAMIS joker (Prisma'nin davranisi olculmedi → en kotu hal). */
function ilikeEsles(deger: string, desen: string): boolean {
  const re = desen
    .split('')
    .map((h) => (h === '%' ? '.*' : h === '_' ? '.' : h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${re}$`, 'is').test(deger);
}

function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  for (const [op, v] of Object.entries(kosul)) {
    switch (op) {
      case 'mode':
        break;
      case 'equals':
        if (kosul.mode === 'insensitive') {
          if (bos || !ilikeEsles(String(deger), String(v))) return false;
        } else if (!kosulUygula(deger, v)) return false;
        break;
      case 'in':
        if (!(v as any[]).includes(deger)) return false;
        break;
      case 'not':
        if (v === null ? bos : kosulUygula(deger, v)) return false;
        break;
      case 'gt':
        if (bos || !(deger > (v as any))) return false;
        break;
      case 'gte':
        if (bos || !(deger >= (v as any))) return false;
        break;
      case 'lt':
        if (bos || !(deger < (v as any))) return false;
        break;
      case 'lte':
        if (bos || !(deger <= (v as any))) return false;
        break;
      default:
        throw new Error(`bellek-Prisma: desteklenmeyen operator "${op}"`);
    }
  }
  return true;
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as any[]).some((w) => whereUygula(satir, w))) return false;
    } else if (k === 'AND') {
      if (!(v as any[]).every((w) => whereUygula(satir, w))) return false;
    } else if (k === 'NOT') {
      if (whereUygula(satir, v)) return false;
    } else if (!kosulUygula(satir[k], v)) {
      return false;
    }
  }
  return true;
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...satirlar].sort((a, b) => {
    for (const [alan, yon] of kurallar) {
      const x = a[alan];
      const y = b[alan];
      if (x === y) continue;
      const kucuk = x < y ? -1 : 1;
      return yon === 'desc' ? -kucuk : kucuk;
    }
    return 0;
  });
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);
  let araGecis = 0;
  const bekle = async () => {
    araGecis++;
    await Promise.resolve();
  };

  function yansit(model: string, satir: Satir, spec: any): Satir {
    if (spec?.select) {
      const sonuc: Satir = {};
      for (const [k, v] of Object.entries(spec.select)) {
        if (!v) continue;
        sonuc[k] = ILISKILER[model]?.[k] ? iliski(model, satir, k, v === true ? {} : v) : satir[k];
      }
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) {
      if (v) sonuc[k] = iliski(model, satir, k, v === true ? {} : v);
    }
    return sonuc;
  }
  function iliski(model: string, satir: Satir, ad: string, spec: any): any {
    const il = ILISKILER[model][ad];
    if (il.uzak) {
      let cok = tablo(il.model).filter((r) => r[il.uzak!] === satir.id && whereUygula(r, spec.where));
      cok = sirala(cok, spec.orderBy);
      if (spec.take !== undefined) cok = cok.slice(0, spec.take);
      return cok.map((r) => yansit(il.model, r, spec));
    }
    const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel!]);
    return hedef ? yansit(il.model, hedef, spec) : null;
  }
  function tekilDenetle(model: string, satir: Satir) {
    for (const alan of TEKILLER[model] ?? []) {
      const deger = satir[alan];
      if (deger === null || deger === undefined) continue;
      if (tablo(model).some((r) => r !== satir && r[alan] === deger)) throw tekilHatasi(model, alan);
    }
  }
  function veriUygula(model: string, hedef: Satir, data: Satir) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
        hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      } else if (v !== undefined) {
        hedef[k] = v;
      }
    }
  }
  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    const duz: Satir = { ...data };
    if (model === 'user' && duz.firma?.create) {
      const firma = olustur('firma', duz.firma.create);
      delete duz.firma;
      duz.firmaId = firma.id;
    }
    veriUygula(model, satir, duz);
    tekilDenetle(model, satir);
    tablo(model).push(satir);
    return satir;
  }

  const modeller = new Map<string, any>();
  const modelYuzu = (model: string) => {
    if (modeller.has(model)) return modeller.get(model);
    const yuz = {
      findUnique: async (arg: any) => {
        await bekle();
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        return s ? yansit(model, s, arg) : null;
      },
      findUniqueOrThrow: async (arg: any) => {
        await bekle();
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (!s) throw Object.assign(new Error(`${model} bulunamadi`), { code: 'P2025' });
        return yansit(model, s, arg);
      },
      findFirst: async (arg: any = {}) => {
        await bekle();
        const s = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy)[0];
        return s ? yansit(model, s, arg) : null;
      },
      findMany: async (arg: any = {}) => {
        await bekle();
        let liste = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy);
        if (arg.take !== undefined) liste = liste.slice(0, arg.take);
        return liste.map((s) => yansit(model, s, arg));
      },
      count: async (arg: any = {}) => {
        await bekle();
        return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
      },
      create: async (arg: any) => {
        await bekle();
        return yansit(model, olustur(model, arg.data), arg);
      },
      update: async (arg: any) => {
        await bekle();
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (!s) throw Object.assign(new Error(`${model} guncellenecek satir yok`), { code: 'P2025' });
        const once = { ...s };
        veriUygula(model, s, arg.data);
        try {
          tekilDenetle(model, s);
        } catch (e) {
          Object.keys(s).forEach((k) => delete s[k]);
          Object.assign(s, once);
          throw e;
        }
        return yansit(model, s, arg);
      },
      updateMany: async (arg: any) => {
        await bekle();
        const hedefler = tablo(model).filter((r) => whereUygula(r, arg.where));
        hedefler.forEach((s) => veriUygula(model, s, arg.data));
        return { count: hedefler.length };
      },
      // FAZ 7 F3b (§5.11): ayrilma akisi (hesap kapatma / uye cikarma /
      // yonetici silme) artik `kullaniciDisKimlik.deleteMany` de cagiriyor —
      // kapatilan hesap sirket hesabiyla GERI ACILMASIN diye.
      deleteMany: async (arg: any = {}) => {
        await bekle();
        const kalan = tablo(model).filter((r) => !whereUygula(r, arg.where));
        const n = tablo(model).length - kalan.length;
        tablo(model).length = 0;
        tablo(model).push(...kalan);
        return { count: n };
      },
      upsert: async (arg: any) => {
        await bekle();
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (s) {
          veriUygula(model, s, arg.update);
          tekilDenetle(model, s);
          return yansit(model, s, arg);
        }
        return yansit(model, olustur(model, arg.create), arg);
      },
    };
    modeller.set(model, yuz);
    return yuz;
  };

  const prisma: any = new Proxy(
    {},
    {
      get: (_h, ad: string) => {
        if (ad === 'then') return undefined;
        // DIZI bicimi (parola sifirlama) + ETKILESIMLI bicim.
        // ⚠ FAZ 7 F1b: `hesabiKapat` artik firma kilidinde kosuyor
        // (`firmaKilitliIslem` → `$transaction(async tx => …)`). Etkilesimli
        // bicim ATOMIK DEGIL taklit edilir: bu paket ayrilma yolunun
        // atomikligini OLCMEZ (onu `test:faz7-ekip` H blogu olcer), yalniz
        // deneme hakkinin yollarini olcer. Sessizce "atomik" sanmamak icin
        // not burada duruyor.
        if (ad === '$transaction') {
          return async (islemler: unknown) => {
            if (Array.isArray(islemler)) return Promise.all(islemler);
            if (typeof islemler === 'function') return (islemler as (tx: unknown) => unknown)(prisma);
            throw new Error('bellek-Prisma: beklenmeyen $transaction bicimi');
          };
        }
        // `firmaKilitliIslem` advisory lock sorgusu atiyor; bellek-Prisma'da
        // kilit YOKTUR, sorgu yutulur (yarisi bu paket olcmez).
        if (ad === '$queryRaw') return async () => [{ kilit: 'ok' }];
        return modelYuzu(ad);
      },
    },
  );
  return { prisma, tablolar, tablo, ekle: (model: string, data: Satir) => olustur(model, data), araGecis: () => araGecis };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE IYZICO — giden istegi ve iptalleri kaydeder
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const baslatilan: any[] = [];
  const iptalEdilen: string[] = [];
  const formlar = new Map<string, any>();
  const detaylar = new Map<string, any>();
  let sayac = 0;
  return {
    baslatilan,
    iptalEdilen,
    formlar,
    detaylar,
    istemci: {
      abonelikBaslat: async (g: any) => {
        baslatilan.push(g);
        return { token: `tok-${++sayac}`, checkoutFormContent: '<div id="iyzipay-checkout-form"></div>', tokenExpireTime: 1800 };
      },
      formSonucu: async (token: string) => {
        await Promise.resolve();
        return formlar.get(token) ?? null;
      },
      abonelikIptal: async (kod: string) => {
        iptalEdilen.push(kod);
        return {};
      },
      abonelikGetir: async (kod: string) => detaylar.get(kod) ?? { subscriptionStatus: 'ACTIVE', orders: [] },
    } as any,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DUNYA — paketler + servisler (her blok TAZE dunya kurar)
// ═════════════════════════════════════════════════════════════════════════
function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  const tutar = () => new Prisma.Decimal('1649.00');
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro — Mekanik', aciklama: null, kapsam: 'mechanical', seviye: 'pro', kullaniciHakki: 2, aylikTeklifHakki: null, dwgAktif: true, aktif: true, sira: 20 });
  db.ekle('paket', { id: 'P2', kod: 'basic-mek', ad: 'Basic — Mekanik', aciklama: null, kapsam: 'mechanical', seviye: 'core', kullaniciHakki: 2, aylikTeklifHakki: null, dwgAktif: false, aktif: true, sira: 10 });
  db.ekle('paket', { id: 'P3', kod: 'basic-elk', ad: 'Basic — Elektrik', aciklama: null, kapsam: 'electrical', seviye: 'core', kullaniciHakki: 2, aylikTeklifHakki: null, dwgAktif: false, aktif: true, sira: 30 });
  db.ekle('paket', { id: 'PM', kod: 'miras-pro', ad: 'Miras — Pro', aciklama: null, kapsam: 'mep', seviye: 'pro', kullaniciHakki: 5, aylikTeklifHakki: null, dwgAktif: true, aktif: false, sira: 99 });
  const surum = (id: string, paketId: string, plan: string, ikiz: string | null, denemeGunu: number, satistaMi = true) =>
    db.ekle('paketSurumu', { id, paketId, surumNo: 1, iyzicoPlanKodu: plan, iyzicoDenemesizPlanKodu: ikiz, iyzicoUrunKodu: 'urun-1', tutar: tutar(), paraBirimi: 'TRY', referansTutar: null, referansParaBirimi: null, periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu, satistaMi });
  surum('S30', 'P1', 'plan-30', 'plan-30-denemesiz', 30);
  surum('SIKIZSIZ', 'P2', 'plan-basic-30', null, 30); // ikiz plan KURULMAMIS
  surum('S0', 'P3', 'plan-elk-0', null, 0); // denemesiz paket
  surum('SM', 'PM', 'plan-miras', null, 0, false);

  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const denemeHakki = new DenemeHakkiServisi(db.prisma);
  // Faz 6.4: satin alma sonrasi "aboneliginiz basladi" maili. Bu paketin
  // konusu deneme hakki; mail YUTULUYOR ama cagrildigi SAYILIYOR.
  const gidenMailler: any[] = [];
  const sahteEposta = { gonder: async (t: any) => { gidenMailler.push(t); } } as any;
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, denemeHakki, sahteEposta);
  // ⚠ FAZ 6.4: `baslat` artik mesafeli satis onayi ISTIYOR. Bu paketin konusu
  // DENEME HAKKI; her cagriya onay eklemek yerine varsayilan burada veriliyor.
  // Onayin KENDISI test:satinalma S-ONAY bolumunde olculuyor.
  const baslatHam = satinAlma.baslat.bind(satinAlma);
  (satinAlma as any).baslat = (g: any) => baslatHam({ sozlesmeOnayi: true, ...g });
  const dunningCagrilari: any[] = [];
  const dunning = { ilkBildirim: async (id: string, siparis: string) => { dunningCagrilari.push({ id, siparis }); }, tahsilatToparlandi: async () => undefined } as any;
  const webhook = new WebhookIsleyici(db.prisma, abonelik, {} as any, dunning);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  // PLAN 5.8 §3.4: kapatma bildirimi eklendi — gonderilenler kaydedilir.
  const kapatmaEpostalari: { kime: string; konu: string }[] = [];
  const hesap = new HesapServisi(db.prisma, satinAlma, {
    gonder: async (t: any) => { kapatmaEpostalari.push({ kime: t.kime, konu: t.konu }); },
  } as any);
  const dogrulamaGiden: string[] = [];
  const jwtSahte = { sign: () => 'tkn' } as any;
  // FAZ 7 F1b: `AuthService` artik `OturumServisi`ye delege ediyor (§3.11).
  // GERCEK servis veriliyor (sahte degil): `login`/`register` yanitindaki
  // `tier` turetmesi ve ban/silme kapisi o sinifta kosuyor.
  const auth = new AuthService(db.prisma, jwtSahte, {} as any, { dogrulamaGonderSessizce: async (_id: string, e: string) => { dogrulamaGiden.push(e); } } as any, new OturumServisi(db.prisma, jwtSahte));
  // 23.09: 4. bağımlılık paket değişimi yolu — bu kapının konusu değil (boş
  // harita → her kart "satin-al"); değişimin kendi kapısı test:paket-degisimi.
  const controller = new AbonelikController({} as any, satinAlma, denemeHakki, { yollar: async () => new Map() } as any);

  const firma = (id: string, telefon: string | null = null) => db.ekle('firma', { id, ad: id, telefon });
  const kullanici = (id: string, email: string, firmaId: string, ek: Satir = {}) =>
    db.ekle('user', { id, email, password: 'x', firmaId, emailVerified: true, ...ek });

  const musteri = (eposta: string, telefon: string) => ({
    ad: 'Ayse', soyad: 'Yilmaz', eposta, telefon, kimlikNo: '11111111111', sehir: 'Istanbul', adres: 'Ornek Mah. 1',
  });

  /** Formu acar, iyzico'ya sonucu yazar ve kullanicinin donusuyle sonuclandirir. */
  async function satinAl(p: { firmaId: string; kullaniciId: string; eposta: string; telefon: string; kod: string; surum?: string }) {
    const yanit = await satinAlma.baslat({
      firmaId: p.firmaId,
      kullaniciId: p.kullaniciId,
      paketSurumuId: p.surum ?? 'S30',
      musteri: musteri(p.eposta, p.telefon),
    });
    const giden = iyz.baslatilan[iyz.baslatilan.length - 1];
    iyz.formlar.set(yanit.token, {
      referenceCode: p.kod,
      customerReferenceCode: `cus-${p.kod}`,
      pricingPlanReferenceCode: giden.planKodu,
      subscriptionStatus: 'ACTIVE',
    });
    const donus = await satinAlma.donus(yanit.token, p.firmaId);
    const niyet = db.tablo('abonelikBaslatma').find((n) => n.token === yanit.token)!;
    const ab = db.tablo('abonelik').find((a) => a.firmaId === p.firmaId)!;
    return { yanit, planKodu: giden.planKodu as string, donus, niyet, ab };
  }

  return { db, iyz, abonelik, denemeHakki, satinAlma, webhook, mutabakat, hesap, auth, controller, dunningCagrilari, dogrulamaGiden, firma, kullanici, musteri, satinAl };
}

type Dunya = ReturnType<typeof dunyaKur>;

const kayitSayisi = (d: Dunya, firmaId?: string) =>
  d.db.tablo('denemeKullanimi').filter((r) => !firmaId || r.firmaId === firmaId).length;

async function hataTuru(is: () => Promise<unknown>) {
  try {
    await is();
    return { tur: 'YOK', mesaj: '', govde: null as any };
  } catch (e: any) {
    return { tur: e?.constructor?.name ?? 'BILINMEYEN', mesaj: String(e?.message ?? ''), govde: e?.getResponse?.() ?? null };
  }
}

async function main() {
  // ── S · SAF ─────────────────────────────────────────────────────────────
  console.log('\n── S · saf normalize ve kosul ──');
  check('S1 gmail noktasi + etiket + harf tek anahtar', denemeEpostaAnahtari('Ali.Veli+x@GMail.com') === 'aliveli@gmail.com',
    String(denemeEpostaAnahtari('Ali.Veli+x@GMail.com')));
  check('S2 googlemail → gmail.com', denemeEpostaAnahtari('ali.veli@GoogleMail.com') === 'aliveli@gmail.com');
  check('S3 ⭐ "I" ASCII kuculur ("ılker" DEGIL)', denemeEpostaAnahtari('ILKER@x.com') === 'ilker@x.com',
    String(denemeEpostaAnahtari('ILKER@x.com')));
  check('S4 gmail DISI alanda nokta KORUNUR', denemeEpostaAnahtari('a.b@firma.com') === 'a.b@firma.com');
  check('S5 bos yerel kisim / "@" yok → null (eslesme uretmez)',
    denemeEpostaAnahtari('+x@y.com') === null && denemeEpostaAnahtari('yok') === null && denemeEpostaAnahtari(null) === null);
  check('S6 telefon: uc yazim tek anahtar',
    telefonAnahtari('0533 098 36 63') === '5330983663' && telefonAnahtari('+905330983663') === '5330983663' &&
      telefonAnahtari('5330983663') === '5330983663');
  check('S7 10 haneden kisa telefon → null', telefonAnahtari('12345') === null && telefonAnahtari('') === null);
  check('S8 epostaKucult trim + yalniz ASCII (İ korunur)',
    epostaKucult('  ALI@X.COM ') === 'ali@x.com' && epostaKucult('İpek@x.com') === 'İpek@x.com');
  const kosul = denemeKaydiKosulu('F1', denemeAnahtarlari({ hesapEposta: 'A@x.com', formEposta: 'a@X.com', telefon: null }));
  check('S9 kosul: firma daima, ayni e-posta TEKIL, null telefon kosula GIRMEZ',
    JSON.stringify(kosul) === JSON.stringify({ OR: [{ firmaId: 'F1' }, { epostaNormal: { in: ['a@x.com'] } }, { formEpostaNormal: { in: ['a@x.com'] } }] }),
    JSON.stringify(kosul));
  const ikiz = { iyzicoPlanKodu: 'p', iyzicoDenemesizPlanKodu: 'pd', denemeGunu: 30 };
  check('S10 planSec: hak var → denemeli · yok → ikiz · ikiz yok → kapali hata · dogrulanmamis → red · surum denemesiz → ana',
    JSON.stringify(planSec(ikiz, { hak: true, gerekce: 'var' })) === JSON.stringify({ tur: 'plan', planKodu: 'p', denemeGunu: 30, denemeHakki: true }) &&
      JSON.stringify(planSec(ikiz, { hak: false, gerekce: 'kullanildi' })) === JSON.stringify({ tur: 'plan', planKodu: 'pd', denemeGunu: 0, denemeHakki: false }) &&
      planSec({ ...ikiz, iyzicoDenemesizPlanKodu: null }, { hak: false, gerekce: 'kullanildi' }).tur === 'denemesiz-plan-yok' &&
      planSec(ikiz, { hak: false, gerekce: 'eposta-dogrulanmadi' }).tur === 'eposta-dogrulanmadi' &&
      JSON.stringify(planSec({ ...ikiz, denemeGunu: 0 }, { hak: false, gerekce: 'eposta-dogrulanmadi' })) ===
        JSON.stringify({ tur: 'plan', planKodu: 'p', denemeGunu: 0, denemeHakki: false }));

  // ── O · OLCUT: temiz firma deneme ALIR (bos kume yesili yok) ────────────
  console.log('\n── O · OLCUT: ilk deneme hakki olan temiz firma ──');
  {
    const d = dunyaKur();
    d.firma('F0', null);
    d.kullanici('U0', 'temiz@ornek.com', 'F0');
    const r = await d.satinAl({ firmaId: 'F0', kullaniciId: 'U0', eposta: 'temiz@ornek.com', telefon: '0533 000 00 01', kod: 'sub-0' });
    check('O1 ⭐ iyzico\'ya DENEMELI plan gitti', r.planKodu === 'plan-30', `plan=${r.planKodu}`);
    check('O2 yanit denemeHakki=true, denemeGunu=30', r.yanit.denemeHakki === true && r.yanit.denemeGunu === 30, JSON.stringify(r.yanit));
    check('O3 niyete karar DONDURULDU (denemeGunu 30, plan, anahtarlar)',
      r.niyet.denemeGunu === 30 && r.niyet.planKodu === 'plan-30' && r.niyet.epostaNormal === 'temiz@ornek.com' &&
        r.niyet.formEpostaNormal === 'temiz@ornek.com' && r.niyet.telefonNormal === '5330000001', JSON.stringify(r.niyet));
    check('O4 abonelik DENEME + denemeSonu dolu', r.ab?.durum === 'DENEME' && r.ab?.denemeSonu instanceof Date, `durum=${r.ab?.durum}`);
    const k = d.db.tablo('denemeKullanimi');
    check('O5 ⭐ deneme kaydi TAM 1 satir, niyet + anahtarlar + iyzico musteri no',
      k.length === 1 && k[0].abonelikBaslatmaId === r.niyet.id && k[0].kaynak === 'deneme' && k[0].kullaniciId === 'U0' &&
        k[0].telefonNormal === '5330000001' && k[0].iyzicoMusteriKodu === 'cus-sub-0', JSON.stringify(k));
    check('O6 niyet TAMAMLANDI', r.niyet.durum === 'TAMAMLANDI' && r.donus.durum === 'TAMAMLANDI');
  }

  await yollar();
  await digerBloklar();
  son();
}

// ═════════════════════════════════════════════════════════════════════════
//  TEKRAR YOLLARI — her yolda ANAHTAR YALITIMI: ikinci alimda yalniz o yolun
//  anahtari eslesir (baska uye / baska telefon / baska form e-postasi). Boylece
//  anahtari kosuldan cikaran mutant YALNIZ o yolu kirmizi yapar.
// ═════════════════════════════════════════════════════════════════════════
async function yollar(): Promise<void> {
  // ── A · ayni firma: iptal → sure doldu → yeniden alim ──────────────────
  console.log('\n── A · ayni firma: iptal → SONA_ERDI → yeniden alim ──');
  {
    const d = dunyaKur();
    d.firma('FA', '0533 111 11 11');
    d.kullanici('UA1', 'ali@firmaa.com', 'FA');
    d.kullanici('UA2', 'veli@baska.com', 'FA', { firmaRol: 'uye' });
    const ilk = await d.satinAl({ firmaId: 'FA', kullaniciId: 'UA1', eposta: 'ali@firmaa.com', telefon: '0533 111 11 11', kod: 'sub-a1' });
    check('A-OLCUT ilk alim deneme aldi', ilk.ab.durum === 'DENEME' && ilk.planKodu === 'plan-30', `durum=${ilk.ab.durum}`);
    await d.satinAlma.iptalEt('FA', 'UA1', 'deneme bitmeden iptal');
    const ab = d.db.tablo('abonelik').find((a) => a.firmaId === 'FA')!;
    ab.erisimSonu = new Date(Date.now() - GUN);
    await d.mutabakat.suresiDolanlariKapat();
    check('A-OLCUT iptal + sure doldu → SONA_ERDI (satin alma kapisi yeniden alimi GECIRIR)', ab.durum === 'SONA_ERDI', `durum=${ab.durum}`);
    const ikinci = await d.satinAl({ firmaId: 'FA', kullaniciId: 'UA2', eposta: 'veli@baska.com', telefon: '0544 999 99 99', kod: 'sub-a2' });
    check('A1 ⭐ satin alma ENGELLENMEDI, iyzico\'ya DENEMESIZ ikiz plan gitti',
      ikinci.planKodu === 'plan-30-denemesiz' && ikinci.donus.durum === 'TAMAMLANDI', `plan=${ikinci.planKodu} donus=${ikinci.donus.durum}`);
    const gun = Math.round((ikinci.ab.erisimSonu.getTime() - Date.now()) / GUN);
    check('A2 ⭐ abonelik AKTIF (DENEME degil), denemeSonu yok, erisim 31+2 gun',
      ikinci.ab.durum === 'AKTIF' && ikinci.ab.denemeSonu === null && gun === 33, `durum=${ikinci.ab.durum} gun=${gun}`);
    check('A3 yanit denemeHakki=false · niyet denemeGunu=0 · ikinci deneme kaydi YOK',
      ikinci.yanit.denemeHakki === false && ikinci.niyet.denemeGunu === 0 && kayitSayisi(d, 'FA') === 1,
      `hak=${ikinci.yanit.denemeHakki} gun=${ikinci.niyet.denemeGunu} kayit=${kayitSayisi(d, 'FA')}`);
  }

  // ── B · deneme sonu tahsilat basarisiz (K-P5 onarimi dahil) ────────────
  console.log('\n── B/W · deneme sonu tahsilat basarisiz → dunning → ASKIDA → yeniden alim ──');
  {
    const d = dunyaKur();
    d.firma('FB', '0533 222 22 22');
    d.kullanici('UB1', 'bora@firmab.com', 'FB');
    d.kullanici('UB2', 'muhasebe@baska-b.com', 'FB', { firmaRol: 'uye' });
    await d.satinAl({ firmaId: 'FB', kullaniciId: 'UB1', eposta: 'bora@firmab.com', telefon: '0533 222 22 22', kod: 'sub-b1' });
    // ⚠ 24.09 — ret iyzico'dan DOGRULANIR (`tahsilatBasarisiz` →
    // `tahsilatBasarisizligiKarari`, `test:webhook-tahsilat-dogrulama` F).
    // Deneme sonu cekimi reddedilince iyzico'nun karsiligi: abonelik UNPAID,
    // sipariste reddedilmis deneme.
    d.iyz.detaylar.set('sub-b1', {
      subscriptionStatus: 'UNPAID',
      orders: [{ referenceCode: 'ord-b1', orderStatus: 'FAILED', paymentAttempts: [{ paymentStatus: 'FAILURE' }] }],
    });
    const olay = d.db.ekle('webhookOlayi', {
      tekilAnahtar: 'w-b1', olayTipi: 'subscription.order.failure', hamGovde: {}, abonelikKodu: 'sub-b1', siparisKodu: 'ord-b1',
    });
    await (d.webhook as any).tekOlayIsle(olay.id).catch(() => undefined);
    const ab = d.db.tablo('abonelik').find((a) => a.firmaId === 'FB')!;
    const w = d.db.tablo('webhookOlayi')[0];
    check('W1 ⭐ K-P5: DENEME → ODEME_BEKLIYOR gecisi GECERLI (satir DENEME kalmadi)', ab.durum === 'ODEME_BEKLIYOR', `durum=${ab.durum} hata=${w.hata}`);
    check('W2 ⭐ ilkBasarisizlik ve sonDeneme YAZILDI (dunning merdiveni baslayabilir)',
      ab.ilkBasarisizlik instanceof Date && ab.sonDeneme instanceof Date, `ilk=${ab.ilkBasarisizlik}`);
    check('W3 ⭐ BAGLANTI: webhook → dunning ilk bildirimi CAGRILDI (abonelik + siparis)',
      d.dunningCagrilari.length === 1 && d.dunningCagrilari[0].id === ab.id && d.dunningCagrilari[0].siparis === 'ord-b1',
      JSON.stringify(d.dunningCagrilari));
    check('W4 webhook olayi ISLENDI (5 kez dusup kalmiyor)', w.islendi === true && w.denemeSayisi === 0 && !w.hata, `islendi=${w.islendi} hata=${w.hata}`);
    check('W5 olay gunlugu: durum.degisti DENEME → ODEME_BEKLIYOR',
      d.db.tablo('abonelikOlayi').some((o) => o.tip === 'durum.degisti' && o.oncekiDurum === 'DENEME' && o.yeniDurum === 'ODEME_BEKLIYOR'));
    // Dunning merdiveni (10. gun KISITLI, 30. gun ASKIDA) gercek durum makinesiyle.
    await d.abonelik.durumDegistir(ab.id, 'KISITLI' as any, { aktor: 'dunning' });
    await d.abonelik.durumDegistir(ab.id, 'ASKIDA' as any, { aktor: 'dunning' });
    // ⚠ 24.09 — merdiven boyunca GERCEK gece mutabakati iyzico'nun UNPAID'ini
    // `iyzicoDurum`a yazar (ASKIDA'yi geri cekmez). Yeniden satin alma kapisi
    // bu alani okur: iyzico'su hala ACTIVE olan satir cift cekim olmasin diye
    // ENGELLENIR (paket-degisimi.ts → `iyzicoAboneligiAcikMi`,
    // `test:mutabakat-kayip-tahsilat` K). Satin almadan kalan 'ACTIVE' burada
    // gercekci degildi: cekim reddedildi, iyzico UNPAID der.
    d.iyz.detaylar.set('sub-b1', { subscriptionStatus: 'UNPAID' });
    await (d.mutabakat as any).tekAbonelikMutabakati(ab.id, 'sub-b1');
    check('B-OLCUT merdiven sonu ASKIDA, gece mutabakati iyzico UNPAID yazdi', ab.durum === 'ASKIDA' && ab.iyzicoDurum === 'UNPAID',
      `durum=${ab.durum} iyzicoDurum=${ab.iyzicoDurum}`);
    const ikinci = await d.satinAl({ firmaId: 'FB', kullaniciId: 'UB2', eposta: 'muhasebe@baska-b.com', telefon: '0544 888 88 88', kod: 'sub-b2' });
    check('B1 ⭐ ASKIDA firma yeniden alimda ENGELLENMEDI, DENEMESIZ plana gitti',
      ikinci.planKodu === 'plan-30-denemesiz' && ikinci.donus.durum === 'TAMAMLANDI', `plan=${ikinci.planKodu}`);
    check('B2 ⭐ abonelik AKTIF, ikinci deneme kaydi YOK', ikinci.ab.durum === 'AKTIF' && kayitSayisi(d, 'FB') === 1,
      `durum=${ikinci.ab.durum} kayit=${kayitSayisi(d, 'FB')}`);
  }

  // ── T · gece mutabakati iyzico UNPAID (deneme sonu) ────────────────────
  console.log('\n── T · mutabakat: denemede iyzico UNPAID ──');
  {
    const d = dunyaKur();
    d.firma('FT');
    d.kullanici('UT', 't@x.com', 'FT');
    const r = await d.satinAl({ firmaId: 'FT', kullaniciId: 'UT', eposta: 't@x.com', telefon: '0533 111 00 99', kod: 'sub-t' });
    d.iyz.detaylar.set('sub-t', { subscriptionStatus: 'UNPAID' });
    check('T-OLCUT once ilkBasarisizlik BOS (webhook gelmedi varsayimi)', r.ab.ilkBasarisizlik === null);
    const degisti = await (d.mutabakat as any).tekAbonelikMutabakati(r.ab.id, 'sub-t');
    check('T1 UNPAID → ODEME_BEKLIYOR (eskiden "gecersiz gecis" diye atlaniyordu)', degisti === true && r.ab.durum === 'ODEME_BEKLIYOR', `degisti=${degisti} durum=${r.ab.durum}`);
    check('T2 ⭐ mutabakat yolu da ilkBasarisizlik YAZIYOR (yoksa dunning merdiveni hic baslamaz, ODEME_BEKLIYOR suresiz tam erisim)',
      r.ab.ilkBasarisizlik instanceof Date && r.ab.sonDeneme instanceof Date, `ilk=${r.ab.ilkBasarisizlik}`);
  }

  // ── C · hesap kapat → ayni e-postayla yeni kayit ───────────────────────
  // ⚠ 21.09 (plan 5.8 · K1) BU BLOGUN ON KOSULU DEGISTI. Eskiden kapatma
  // e-postayi ANINDA `kapali-<id>@…` yapiyordu ve ayni adresle HEMEN yeni
  // hesap acilabiliyordu. Artik adres 30 gun HESAPTA KALIR ve kayit
  // `HESAP_KAPALI_GERI_DONUS` ile REDDEDILIR (musterinin en kolay dusecegi
  // tuzak buydu). Adres ancak 30 gun sonra, gunluk imha isi satiri
  // anonimlestirince serbest kalir.
  // Blogun OLCTUGU sey DEGISMEDI: `DenemeKullanimi`nin e-posta anahtari
  // hesap kapatmada SILINMEZ, bu yuzden ayni kisi denemeyi IKINCI KEZ alamaz.
  console.log('\n── C · hesap kapat → ayni e-postayla yeni kayit ──');
  {
    const d = dunyaKur();
    d.firma('FC', '0532 111 22 33');
    d.kullanici('UC1', 'Can.Demir@Ornek.com', 'FC', { password: bcrypt.hashSync('parola-123', 4) });
    await d.satinAl({ firmaId: 'FC', kullaniciId: 'UC1', eposta: 'Can.Demir@Ornek.com', telefon: '0532 111 22 33', kod: 'sub-c1' });
    await d.hesap.hesabiKapat('UC1', 'parola-123');
    const eski = d.db.tablo('user').find((u) => u.id === 'UC1')!;
    check('C-OLCUT hesap kapandi: e-posta HESAPTA KALDI (K1), orijinali kapatilanEpostada, abonelik iyzicoda iptal',
      eski.email === 'Can.Demir@Ornek.com' && eski.kapatilanEposta === 'Can.Demir@Ornek.com' &&
        eski.kapatmaNedeni === 'kendi' && eski.imhaTarihi instanceof Date &&
        d.iyz.iptalEdilen.includes('sub-c1'),
      `email=${eski.email} neden=${eski.kapatmaNedeni}`);
    const erken = await (async () => {
      try {
        await d.auth.register({ email: 'can.demir@ornek.com', password: 'yeni-parola', sozlesmeOnayi: true } as any);
        return null;
      } catch (e: any) { return e; }
    })();
    check('C-OLCUT ⭐ 30 gun dolmadan ayni adresle KAYIT ACILMAZ (K1 tuzagi)',
      (erken?.response ?? erken?.getResponse?.())?.kod === 'HESAP_KAPALI_GERI_DONUS',
      JSON.stringify(erken?.response ?? String(erken)));
    // ── IMHA SIMULASYONU (C gorevinin gunluk isi) ────────────────────────
    // 30 gun doldu ve imha satiri anonimlestirdi. BURADA IKINCI BIR KURAL
    // YAZILMIYOR: yalniz fixture o gune tasiniyor ki asil olcum (deneme
    // anahtari) kosabilsin. Imhanin KENDISI C gorevinin paketinde olculur.
    eski.email = 'kapali-UC1@metapricex.invalid';
    eski.imhaTarihi = null;
    const kayit = oturumDali(await d.auth.register({ email: 'can.demir@ornek.com', password: 'yeni-parola', sozlesmeOnayi: true } as any));
    const yeni = d.db.tablo('user').find((u) => u.id === kayit.user.id)!;
    check('C-OLCUT imhadan SONRA ayni e-postayla YENI hesap + YENI firma acildi', !!yeni.firmaId && yeni.firmaId !== 'FC', `firma=${yeni.firmaId}`);
    yeni.emailVerified = true; // dogrulama baglantisina tikladi
    const ikinci = await d.satinAl({ firmaId: yeni.firmaId, kullaniciId: yeni.id, eposta: 'fatura@yenifirma.com', telefon: '0542 999 88 77', kod: 'sub-c2' });
    check('C1 ⭐ yeni firma DENEMESIZ plana gitti (kapatilan hesabin e-postasi deneme kaydinda)',
      ikinci.planKodu === 'plan-30-denemesiz', `plan=${ikinci.planKodu}`);
    check('C2 abonelik AKTIF; yeni firmaya deneme kaydi yazilmadi', ikinci.ab.durum === 'AKTIF' && kayitSayisi(d, yeni.firmaId) === 0);
  }

  // ── D · yeni e-posta + ayni telefon ────────────────────────────────────
  console.log('\n── D · yeni e-posta + ayni telefon ──');
  {
    const d = dunyaKur();
    d.firma('FD1');
    d.kullanici('UD1', 'deniz@ilk.com', 'FD1');
    await d.satinAl({ firmaId: 'FD1', kullaniciId: 'UD1', eposta: 'deniz@ilk.com', telefon: '0533 444 55 66', kod: 'sub-d1' });
    d.firma('FD2');
    d.kullanici('UD2', 'baska.kisi@ikinci.com', 'FD2');
    const ikinci = await d.satinAl({ firmaId: 'FD2', kullaniciId: 'UD2', eposta: 'baska.kisi@ikinci.com', telefon: '+90 (533) 444-5566', kod: 'sub-d2' });
    check('D1 ⭐ yeni e-posta + ayni telefon (farkli yazim) → DENEMESIZ plan', ikinci.planKodu === 'plan-30-denemesiz', `plan=${ikinci.planKodu}`);
    check('D2 abonelik AKTIF, yeni deneme kaydi yok', ikinci.ab.durum === 'AKTIF' && kayitSayisi(d) === 1);
  }

  // ── E · ayni e-postanin buyuk harfli bicimi ─────────────────────────────
  console.log('\n── E · ayni e-postanin farkli harf bicimi (K-P6 oncesi ikiz) ──');
  {
    const d = dunyaKur();
    d.firma('FE1');
    d.kullanici('UE1', 'Ayse.Kaya@Firma.com', 'FE1');
    await d.satinAl({ firmaId: 'FE1', kullaniciId: 'UE1', eposta: 'Ayse.Kaya@Firma.com', telefon: '0533 555 66 77', kod: 'sub-e1' });
    d.firma('FE2');
    d.kullanici('UE2', 'ayse.kaya@firma.com', 'FE2'); // bugun kayit bunu REDDEDER (bkz. G1); eski veride VAR olabilir
    const ikinci = await d.satinAl({ firmaId: 'FE2', kullaniciId: 'UE2', eposta: 'fatura@firma2.com', telefon: '0544 000 11 22', kod: 'sub-e2' });
    check('E1 ⭐ kucuk harfli ikiz hesap → DENEMESIZ plan', ikinci.planKodu === 'plan-30-denemesiz', `plan=${ikinci.planKodu}`);
    check('E2 abonelik AKTIF, yeni deneme kaydi yok', ikinci.ab.durum === 'AKTIF' && kayitSayisi(d) === 1);
  }

  // ── F · iyzico formuna yazilan e-posta ─────────────────────────────────
  console.log('\n── F · form e-postasi anahtari (capraz eslesme dahil) ──');
  {
    const d = dunyaKur();
    d.firma('FF1');
    d.kullanici('UF1', 'kisi1@x.com', 'FF1');
    await d.satinAl({ firmaId: 'FF1', kullaniciId: 'UF1', eposta: 'fatura@ortak.com', telefon: '0533 777 00 01', kod: 'sub-f1' });
    d.firma('FF2');
    d.kullanici('UF2', 'kisi2@y.com', 'FF2');
    const ikinci = await d.satinAl({ firmaId: 'FF2', kullaniciId: 'UF2', eposta: 'Fatura@Ortak.com', telefon: '0533 777 00 02', kod: 'sub-f2' });
    check('F1 ⭐ form e-postasi eslesir, hesap e-postasi eslesmez → DENEMESIZ', ikinci.planKodu === 'plan-30-denemesiz', `plan=${ikinci.planKodu}`);
    d.firma('FF3');
    d.kullanici('UF3', 'FATURA@ortak.com', 'FF3');
    const ucuncu = await d.satinAl({ firmaId: 'FF3', kullaniciId: 'UF3', eposta: 'baska3@z.com', telefon: '0533 777 00 03', kod: 'sub-f3' });
    check('F2 ⭐ CAPRAZ: bugunku HESAP e-postasi gecmisteki FORM e-postasiyla eslesir → DENEMESIZ',
      ucuncu.planKodu === 'plan-30-denemesiz', `plan=${ucuncu.planKodu}`);
  }
}

async function digerBloklar(): Promise<void> {
  // ── M · miras (gecis) firmasi (K-P3) ───────────────────────────────────
  console.log('\n── M · miras firma ilk kart alimi ──');
  {
    const d = dunyaKur();
    d.firma('FM');
    d.kullanici('UM', 'gecis@firma.com', 'FM');
    d.db.ekle('abonelik', { firmaId: 'FM', paketSurumuId: 'SM', durum: 'AKTIF', erisimSonu: new Date(Date.now() + 300 * GUN) });
    // Migration miras KAYDI yazmamis varsayimi: calisma anindaki dal TEK BASINA olculur.
    const r = await d.satinAl({ firmaId: 'FM', kullaniciId: 'UM', eposta: 'gecis@firma.com', telefon: '0533 123 45 67', kod: 'sub-m' });
    check('M1 ⭐ K-P3: miras firma deneme ALMAZ → DENEMESIZ plan', r.planKodu === 'plan-30-denemesiz', `plan=${r.planKodu}`);
    check('M2 abonelik AKTIF, 300 gunluk gecis erisimi KISALMADI, deneme kaydi yok',
      r.ab.durum === 'AKTIF' && r.ab.erisimSonu.getTime() > Date.now() + 299 * GUN && kayitSayisi(d) === 0,
      `durum=${r.ab.durum} kayit=${kayitSayisi(d)}`);
  }

  // ── V · e-posta dogrulanmamis (K-P4) ───────────────────────────────────
  console.log('\n── V · e-posta dogrulanmamis ──');
  {
    const d = dunyaKur();
    d.firma('FV');
    d.kullanici('UV', 'dogrulanmamis@x.com', 'FV', { emailVerified: false });
    const h = await hataTuru(() =>
      d.satinAlma.baslat({ firmaId: 'FV', kullaniciId: 'UV', paketSurumuId: 'S30', musteri: d.musteri('dogrulanmamis@x.com', '0533 321 00 00') }),
    );
    check('V1 ⭐ deneme hakki var ama e-posta dogrulanmamis → 403 + kod + gerekceli Turkce mesaj',
      h.tur === 'ForbiddenException' && h.govde?.kod === 'DENEME_EPOSTA_DOGRULANMADI' && /e-posta adresinizi doğrulayın/.test(h.mesaj),
      `${h.tur} ${JSON.stringify(h.govde)}`);
    check('V2 red YAN ETKISIZ: iyzico cagrisi 0, niyet 0, firma fatura alanlari yazilmadi',
      d.iyz.baslatilan.length === 0 && d.db.tablo('abonelikBaslatma').length === 0 &&
        d.db.tablo('firma').find((f) => f.id === 'FV')!.yetkiliEposta === null);
    const r0 = await d.satinAl({ firmaId: 'FV', kullaniciId: 'UV', eposta: 'dogrulanmamis@x.com', telefon: '0533 321 00 00', kod: 'sub-v0', surum: 'S0' });
    check('V3 ⭐ ucretli alim etkilenmez: dogrulanmamis kullanici DENEMESIZ paketi alir', r0.planKodu === 'plan-elk-0' && r0.ab.durum === 'AKTIF',
      `plan=${r0.planKodu} durum=${r0.ab.durum}`);
    d.firma('FV2');
    d.kullanici('UV2', 'dogrulanmamis2@x.com', 'FV2', { emailVerified: false });
    d.db.ekle('denemeKullanimi', { firmaId: 'FV2', kaynak: 'deneme' });
    const r2 = await d.satinAl({ firmaId: 'FV2', kullaniciId: 'UV2', eposta: 'dogrulanmamis2@x.com', telefon: '0533 321 00 02', kod: 'sub-v2' });
    check('V4 ⭐ hakki zaten olmayan dogrulanmamis kullanici ucretli (denemesiz ikiz) alimi YAPAR', r2.planKodu === 'plan-30-denemesiz' && r2.ab.durum === 'AKTIF',
      `plan=${r2.planKodu}`);
  }

  // ── Y · denemesiz ikiz plan kurulmamis → kapali hata ───────────────────
  console.log('\n── Y · ikiz plan yok → 503, denemeli plana DUSULMEZ ──');
  {
    const d = dunyaKur();
    d.firma('FY');
    d.kullanici('UY', 'y@x.com', 'FY');
    d.db.ekle('denemeKullanimi', { firmaId: 'FY', kaynak: 'deneme' });
    const gunluk: string[] = [];
    (d.satinAlma as any).logger = { error: (m: string) => gunluk.push(m), warn: () => undefined, log: () => undefined };
    const h = await hataTuru(() =>
      d.satinAlma.baslat({ firmaId: 'FY', kullaniciId: 'UY', paketSurumuId: 'SIKIZSIZ', musteri: d.musteri('y@x.com', '0533 999 00 00') }),
    );
    check('Y1 ⭐ hak yok + ikiz plan YOK → 503 "Bu paket şu an satın alınamıyor" + kod',
      h.tur === 'ServiceUnavailableException' && h.govde?.kod === 'DENEMESIZ_PLAN_YOK' && h.mesaj.startsWith('Bu paket şu an satın alınamıyor'),
      `${h.tur} ${h.mesaj}`);
    check('Y2 ⭐ KAPALI HATA: iyzico cagrisi 0 (denemeli plana DUSULMEDI), niyet 0',
      d.iyz.baslatilan.length === 0 && d.db.tablo('abonelikBaslatma').length === 0, `iyzico=${d.iyz.baslatilan.length}`);
    check('Y3 sessiz degil: gunluge surum ve cozum yazildi', gunluk.some((g) => g.includes('DENEMESIZ IKIZ PLAN YOK') && g.includes('SIKIZSIZ')),
      JSON.stringify(gunluk));
    d.firma('FY2');
    d.kullanici('UY2', 'y2@x.com', 'FY2');
    const r = await d.satinAl({ firmaId: 'FY2', kullaniciId: 'UY2', eposta: 'y2@x.com', telefon: '0533 999 00 02', kod: 'sub-y2', surum: 'SIKIZSIZ' });
    check('Y-OLCUT ayni surumde hakki OLAN firma denemeli plana gider (503 hak yuzunden)', r.planKodu === 'plan-basic-30', `plan=${r.planKodu}`);
  }

  // ── N · sonuclandirma deneme gununu NIYETTEN okur ──────────────────────
  console.log('\n── N · niyetin deneme gunu esas ──');
  {
    const d = dunyaKur();
    d.firma('FN');
    d.kullanici('UN', 'n@x.com', 'FN');
    d.db.ekle('abonelikBaslatma', { token: 'tok-n0', firmaId: 'FN', paketSurumuId: 'S30', olusturanId: 'UN', denemeGunu: 0, planKodu: 'plan-30-denemesiz', epostaNormal: 'n@x.com' });
    d.iyz.formlar.set('tok-n0', { referenceCode: 'sub-n0', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30-denemesiz', subscriptionStatus: 'ACTIVE' });
    const sonuc = await d.satinAlma.donus('tok-n0', 'FN');
    const ab = d.db.tablo('abonelik').find((a) => a.firmaId === 'FN')!;
    const gun = Math.round((ab.erisimSonu.getTime() - Date.now()) / GUN);
    check('N1 ⭐ niyet.denemeGunu=0 (surum 30) → AKTIF, denemeSonu null, erisim 33 gun',
      sonuc.durum === 'TAMAMLANDI' && ab.durum === 'AKTIF' && ab.denemeSonu === null && gun === 33, `durum=${ab.durum} gun=${gun}`);
    check('N2 denemesiz niyete deneme kaydi YAZILMADI', kayitSayisi(d) === 0);
    d.firma('FN2');
    d.kullanici('UN2', 'n2@x.com', 'FN2');
    d.db.ekle('abonelikBaslatma', { token: 'tok-n1', firmaId: 'FN2', paketSurumuId: 'S30', olusturanId: 'UN2' });
    d.iyz.formlar.set('tok-n1', { referenceCode: 'sub-n1', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30', subscriptionStatus: 'ACTIVE' });
    await d.satinAlma.donus('tok-n1', 'FN2');
    const ab2 = d.db.tablo('abonelik').find((a) => a.firmaId === 'FN2')!;
    check('N3 eski kod niyeti (denemeGunu NULL) → surumun 30 gunu: DENEME + kayit', ab2.durum === 'DENEME' && kayitSayisi(d, 'FN2') === 1,
      `durum=${ab2.durum}`);
  }

  // ── K · deneme kaydi TAM BIR KEZ ───────────────────────────────────────
  console.log('\n── K · kayit bir kez: damga duserse kurtarma taramasi ──');
  {
    const d = dunyaKur();
    d.firma('FK');
    d.kullanici('UK', 'k@x.com', 'FK');
    const yanit = await d.satinAlma.baslat({ firmaId: 'FK', kullaniciId: 'UK', paketSurumuId: 'S30', musteri: d.musteri('k@x.com', '0533 010 10 10') });
    d.iyz.formlar.set(yanit.token, { referenceCode: 'sub-k', customerReferenceCode: 'cus-k', pricingPlanReferenceCode: 'plan-30', subscriptionStatus: 'ACTIVE' });
    const yuz = d.db.prisma.abonelikBaslatma;
    const asil = yuz.update;
    let dusur = true;
    yuz.update = async (arg: any) => {
      if (dusur && arg.data?.durum === 'TAMAMLANDI') {
        dusur = false;
        throw new Error('baglanti koptu');
      }
      return asil(arg);
    };
    const ilk = await d.satinAlma.donusIyzicodan(yanit.token);
    const niyet = d.db.tablo('abonelikBaslatma')[0];
    check('K-OLCUT damga dustu: niyet BEKLIYOR kaldi, musteriye "bekliyor" dendi', ilk === 'bekliyor' && niyet.durum === 'BEKLIYOR',
      `donus=${ilk} durum=${niyet.durum}`);
    check('K1 kayit damgadan ONCE yazildi (1 satir)', kayitSayisi(d) === 1, `kayit=${kayitSayisi(d)}`);
    niyet.olusturuldu = new Date(Date.now() - 10 * 60_000);
    await d.satinAlma.bekleyenNiyetleriTara();
    check('K2 ⭐ kurtarma taramasi sonuclandirdi: TAMAMLANDI, kayit HALA 1 (ikinci satir yok)',
      niyet.durum === 'TAMAMLANDI' && kayitSayisi(d) === 1, `durum=${niyet.durum} kayit=${kayitSayisi(d)}`);
    await d.satinAlma.donus(yanit.token, 'FK');
    check('K3 ayni niyetin tekrar donusu kayit eklemez', kayitSayisi(d) === 1);
  }

  // ── C · cift abonelik (iki form) + es zamanli sonuclandirma sirasi ────
  console.log('\n── CF · iki odeme formu ayni firmada tamamlandi ──');
  {
    const d = dunyaKur();
    d.firma('FC2');
    d.kullanici('UC2', 'cift@x.com', 'FC2');
    const m = d.musteri('cift@x.com', '0533 020 20 20');
    const y1 = await d.satinAlma.baslat({ firmaId: 'FC2', kullaniciId: 'UC2', paketSurumuId: 'S30', musteri: m });
    const y2 = await d.satinAlma.baslat({ firmaId: 'FC2', kullaniciId: 'UC2', paketSurumuId: 'S30', musteri: m });
    check('CF-OLCUT iki form da acildi (abonelik yokken — baslat kapisi yakalayamaz)', d.iyz.baslatilan.length === 2);
    d.iyz.formlar.set(y1.token, { referenceCode: 'sub-1', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30', subscriptionStatus: 'ACTIVE' });
    d.iyz.formlar.set(y2.token, { referenceCode: 'sub-2', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30', subscriptionStatus: 'ACTIVE' });
    await d.satinAlma.donus(y1.token, 'FC2');
    const ikinciSonuc = await d.satinAlma.donusIyzicodan(y2.token);
    const ab = d.db.tablo('abonelik').find((a) => a.firmaId === 'FC2')!;
    const n2 = d.db.tablo('abonelikBaslatma').find((n) => n.token === y2.token)!;
    check('CF1 ⭐ ikinci iyzico aboneligi IPTAL edildi, mevcut aboneligin USTUNE YAZILMADI',
      d.iyz.iptalEdilen.join() === 'sub-2' && ab.iyzicoAbonelikKodu === 'sub-1' && ab.iyzicoKokKodu === 'sub-1',
      `iptal=${d.iyz.iptalEdilen.join()} kod=${ab.iyzicoAbonelikKodu}`);
    check('CF2 ikinci niyet BASARISIZ + gerekce; musteri "hata" gorur ("bekliyor" DEGIL)',
      n2.durum === 'BASARISIZ' && /ikinci/.test(String(n2.hata)) && ikinciSonuc === 'hata', `durum=${n2.durum} donus=${ikinciSonuc}`);
    check('CF3 olay kaydi: abonelik.cift.engellendi (iade kontrolu icin iz)',
      d.db.tablo('abonelikOlayi').some((o) => o.tip === 'abonelik.cift.engellendi' && o.veri?.iptalEdilenKod === 'sub-2'));
    check('CF4 ikinci form deneme kaydi URETMEDI (1 satir)', kayitSayisi(d) === 1, `kayit=${kayitSayisi(d)}`);
  }
  console.log('\n── CF5 · ikinci aboneligin iptali iyzico\'da basarisiz ──');
  {
    const d = dunyaKur();
    d.firma('FC5');
    d.kullanici('UC5', 'c5@x.com', 'FC5');
    const m = d.musteri('c5@x.com', '0533 050 50 50');
    const y1 = await d.satinAlma.baslat({ firmaId: 'FC5', kullaniciId: 'UC5', paketSurumuId: 'S30', musteri: m });
    const y2 = await d.satinAlma.baslat({ firmaId: 'FC5', kullaniciId: 'UC5', paketSurumuId: 'S30', musteri: m });
    d.iyz.formlar.set(y1.token, { referenceCode: 'sub-c5a', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30', subscriptionStatus: 'ACTIVE' });
    d.iyz.formlar.set(y2.token, { referenceCode: 'sub-c5b', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30', subscriptionStatus: 'ACTIVE' });
    await d.satinAlma.donus(y1.token, 'FC5');
    d.iyz.istemci.abonelikIptal = async () => {
      throw new Error('iyzico 201403 iptal edilemez');
    };
    const sonuc = await d.satinAlma.donusIyzicodan(y2.token);
    const n2 = d.db.tablo('abonelikBaslatma').find((n) => n.token === y2.token)!;
    const ab = d.db.tablo('abonelik').find((a) => a.firmaId === 'FC5')!;
    check('CF5 ⭐ iptal BASARISIZSA "engellendi" damgasi YOK: niyet BEKLIYOR (kurtarma yeniden dener), hata + deneme sayisi, musteriye "bekliyor", abonelik degismedi',
      sonuc === 'bekliyor' && n2.durum === 'BEKLIYOR' && n2.denemeSayisi === 1 && /iptal edilemedi/.test(String(n2.hata)) &&
        ab.iyzicoAbonelikKodu === 'sub-c5a' && !d.db.tablo('abonelikOlayi').some((o) => o.tip === 'abonelik.cift.engellendi'),
      `donus=${sonuc} durum=${n2.durum} deneme=${n2.denemeSayisi} hata=${n2.hata} kod=${ab.iyzicoAbonelikKodu}`);
  }
  console.log('\n── CS · es zamanli iki sonuclandirma, geri donen firma ──');
  {
    const d = dunyaKur();
    d.firma('FS');
    d.kullanici('US', 's@x.com', 'FS');
    d.db.ekle('abonelik', { firmaId: 'FS', paketSurumuId: 'S30', durum: 'SONA_ERDI', erisimSonu: new Date(Date.now() - GUN), iyzicoAbonelikKodu: 'sub-eski' });
    d.db.ekle('denemeKullanimi', { firmaId: 'FS', kaynak: 'deneme' });
    const m = d.musteri('s@x.com', '0533 030 30 30');
    const y1 = await d.satinAlma.baslat({ firmaId: 'FS', kullaniciId: 'US', paketSurumuId: 'S30', musteri: m });
    const y2 = await d.satinAlma.baslat({ firmaId: 'FS', kullaniciId: 'US', paketSurumuId: 'S30', musteri: m });
    d.iyz.formlar.set(y1.token, { referenceCode: 'sub-s1', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30-denemesiz', subscriptionStatus: 'ACTIVE' });
    d.iyz.formlar.set(y2.token, { referenceCode: 'sub-s2', customerReferenceCode: 'cus', pricingPlanReferenceCode: 'plan-30-denemesiz', subscriptionStatus: 'ACTIVE' });
    const [s1, s2] = await Promise.all([d.satinAlma.donus(y1.token, 'FS'), d.satinAlma.donus(y2.token, 'FS')]);
    const ab = d.db.tablo('abonelik').find((a) => a.firmaId === 'FS')!;
    check('CS1 ⭐ es zamanli iki sonuclandirmadan YALNIZ BIRI acti, digeri iyzico\'da iptal edildi',
      [s1.durum, s2.durum].sort().join() === 'BASARISIZ,TAMAMLANDI' && d.iyz.iptalEdilen.length === 1,
      `durumlar=${s1.durum},${s2.durum} iptal=${d.iyz.iptalEdilen.join()}`);
    check('CS2 abonelikteki kod TAMAMLANAN niyetin kodu (iptal edilen DEGIL)',
      ['sub-s1', 'sub-s2'].includes(ab.iyzicoAbonelikKodu) && ab.iyzicoAbonelikKodu !== d.iyz.iptalEdilen[0], `kod=${ab.iyzicoAbonelikKodu}`);
  }

  // ── G · K-P6: kayit ve giris harfe duyarsiz ────────────────────────────
  console.log('\n── G · e-posta harf buyuklugu: kayit + giris ──');
  {
    const d = dunyaKur();
    d.firma('FG1');
    d.kullanici('UG1', 'Ayse.Kaya@Firma.com', 'FG1', { password: bcrypt.hashSync('p-eski', 4), createdAt: new Date(Date.now() - 5 * GUN) });
    d.firma('FG2');
    d.kullanici('UG2', 'ayse.kaya@firma.com', 'FG2', { password: bcrypt.hashSync('p-ikiz', 4), createdAt: new Date(Date.now() - GUN) });
    d.firma('FG3');
    d.kullanici('UG3', 'Mixed.Case@Ornek.com', 'FG3', { password: bcrypt.hashSync('p-mix', 4) });
    const kayitRed = await hataTuru(() => d.auth.register({ email: 'AYSE.KAYA@firma.com', password: 'x123456', sozlesmeOnayi: true } as any));
    const kayitRed2 = await hataTuru(() => d.auth.register({ email: 'mixed.case@ornek.com', password: 'x123456', sozlesmeOnayi: true } as any));
    check('G1 ⭐ ayni adresin baska harf bicimiyle ikinci hesap ACILAMAZ (409) — kucultulmus yazimi birebir OLMAYAN kayit dahil',
      kayitRed.tur === 'ConflictException' && kayitRed2.tur === 'ConflictException', `${kayitRed.tur} / ${kayitRed2.tur}`);
    const yeni = oturumDali(await d.auth.register({ email: 'Yeni.Kisi@Ornek.com', password: 'x123456', sozlesmeOnayi: true } as any));
    const yeniSatir = d.db.tablo('user').find((u) => u.id === yeni.user.id)!;
    const yeniFirma = d.db.tablo('firma').find((f) => f.id === yeniSatir.firmaId);
    check('G2 ⭐ yeni kayit KUCUK harfle saklanir (firma adi ve dogrulama e-postasi da)',
      yeniSatir.email === 'yeni.kisi@ornek.com' && yeniFirma?.ad === 'yeni.kisi' && d.dogrulamaGiden[0] === 'yeni.kisi@ornek.com',
      `email=${yeniSatir.email} firma=${yeniFirma?.ad}`);
    const giris = oturumDali(await d.auth.login({ email: 'YENI.KISI@ORNEK.COM', password: 'x123456' }));
    check('G3 ⭐ giris harfe DUYARSIZ', giris.user.id === yeni.user.id);
    const g4 = oturumDali(await d.auth.login({ email: 'Ayse.Kaya@Firma.com', password: 'p-eski' }));
    const g5 = oturumDali(await d.auth.login({ email: 'ayse.kaya@firma.com', password: 'p-ikiz' }));
    check('G4 mevcut karisik harfli kayit DEGISMEDI; ikizler BIREBIR yazimla kendi hesaplarina girer',
      g4.user.id === 'UG1' && g5.user.id === 'UG2' && d.db.tablo('user').find((u) => u.id === 'UG1')!.email === 'Ayse.Kaya@Firma.com');
    const g6 = oturumDali(await d.auth.login({ email: 'AYSE.KAYA@FIRMA.COM', password: 'p-eski' }));
    const g7 = oturumDali(await d.auth.login({ email: 'mixed.CASE@ornek.COM', password: 'p-mix' }));
    check('G5 ucuncu yazim → EN ESKI ikiz; tek kayitta her yazim', g6.user.id === 'UG1' && g7.user.id === 'UG3');
    d.firma('FG4');
    d.kullanici('UG4S', 'Silinen@Ornek.com', 'FG4', { password: bcrypt.hashSync('p-sil', 4), createdAt: new Date(Date.now() - 9 * GUN), deletedAt: new Date() });
    d.kullanici('UG4A', 'silinen@ornek.com', 'FG4', { password: bcrypt.hashSync('p-etkin', 4), createdAt: new Date(Date.now() - GUN) });
    const g8 = await hataTuru(async () => {
      const r = oturumDali(await d.auth.login({ email: 'SILINEN@ORNEK.COM', password: 'p-etkin' }));
      if (r.user.id !== 'UG4A') throw new Error(`giris ${r.user.id} hesabina gitti`);
    });
    check('G5b ikizlerden biri silinmisse ucuncu yazim ETKIN hesaba gider (silinmis eski ikiz once gelmez)', g8.tur === 'YOK', `${g8.tur} ${g8.mesaj}`);
    const joker = await hataTuru(() => d.auth.login({ email: 'a_se.kaya@firma.com', password: 'p-eski' }));
    check('G6 ⭐ ILIKE jokeri ("_") BASKA hesaba giris ACMAZ', joker.tur === 'UnauthorizedException', joker.tur);
    const parola = new ParolaServisi(
      d.db.prisma,
      { gonderKritik: async () => undefined, gonder: async () => undefined } as any,
      { signToken: () => 'x' } as any,
      new ConfigService({}),
    );
    await parola.sifirlamaIste('mixed.CASE@ORNEK.com');
    const tokenlar = d.db.tablo('passwordResetToken');
    check('G7 ⭐ BAGLANTI: parola sifirlama da harfe duyarsiz (giris ile AYNI kural) — karisik harfli kayda token yazildi',
      tokenlar.length === 1 && tokenlar[0].userId === 'UG3', JSON.stringify(tokenlar.map((t) => t.userId)));
  }

  // ── L · JWT'li paket ucu baglantisi (K-P7) ─────────────────────────────
  console.log('\n── L · /abonelik/paketler deneme hakki ──');
  {
    const d = dunyaKur();
    d.firma('FL1');
    d.kullanici('UL1', 'temiz@l.com', 'FL1');
    d.firma('FL2');
    d.kullanici('UL2', 'kullanan@l.com', 'FL2');
    d.db.ekle('denemeKullanimi', { firmaId: 'FL2', kaynak: 'deneme' });
    d.firma('FL3');
    d.kullanici('UL3', 'dogrulanmamis@l.com', 'FL3', { emailVerified: false });
    d.firma('FL4');
    d.kullanici('UL4', 'gecis@l.com', 'FL4');
    d.db.ekle('abonelik', { firmaId: 'FL4', paketSurumuId: 'SM', durum: 'AKTIF', erisimSonu: new Date(Date.now() + 100 * GUN) });
    const liste = async (u: string, f: string) => (await d.controller.paketler({ id: u, firmaId: f })) as any[];
    const surumu = (l: any[], kod: string) => l.find((p) => p.kod === kod)?.surum ?? {};
    const l1 = await liste('UL1', 'FL1');
    const l2 = await liste('UL2', 'FL2');
    const l3 = await liste('UL3', 'FL3');
    const l4 = await liste('UL4', 'FL4');
    check('L-OLCUT uc satistaki paket listelendi (miras satista degil)', l1.map((p) => p.kod).sort().join() === 'basic-elk,basic-mek,pro-mek',
      l1.map((p) => p.kod).join());
    check('L1 ⭐ temiz firma: denemeli surumde denemeHakki=true, gerekce var',
      surumu(l1, 'pro-mek').denemeHakki === true && surumu(l1, 'pro-mek').denemeGerekcesi === 'var', JSON.stringify(surumu(l1, 'pro-mek')));
    check('L2 ⭐ deneme kullanmis firma: false + kullanildi',
      surumu(l2, 'pro-mek').denemeHakki === false && surumu(l2, 'pro-mek').denemeGerekcesi === 'kullanildi', JSON.stringify(surumu(l2, 'pro-mek')));
    check('L3 dogrulanmamis: false + eposta-dogrulanmadi',
      surumu(l3, 'pro-mek').denemeHakki === false && surumu(l3, 'pro-mek').denemeGerekcesi === 'eposta-dogrulanmadi');
    check('L4 miras firma: false + kullanildi', surumu(l4, 'pro-mek').denemeHakki === false && surumu(l4, 'pro-mek').denemeGerekcesi === 'kullanildi');
    check('L5 denemesiz surum: false + null (soru anlamsiz)',
      surumu(l1, 'basic-elk').denemeHakki === false && surumu(l1, 'basic-elk').denemeGerekcesi === null);
    const sade = (await d.satinAlma.satistakiPaketler()) as any[];
    check('L6 ⭐ K-P7: girissiz kaynak (satistakiPaketler) deneme alani TASIMIYOR',
      sade.length === 3 && sade.every((p) => !('denemeHakki' in p.surum) && !('denemeGerekcesi' in p.surum)));
    const saglayicilar = (Reflect.getMetadata('providers', OdemeModule) ?? []) as any[];
    check('L7 BAGLANTI: DenemeHakkiServisi OdemeModule saglayicilarinda', saglayicilar.includes(DenemeHakkiServisi));
    const guardlar = ((Reflect.getMetadata('__guards__', AbonelikController) ?? []) as any[]).map((g) => g?.name);
    check('L8 firma bazli cevap JWT korumali sinifta (girissize acilmaz)', guardlar.includes('JwtAuthGuard'), JSON.stringify(guardlar));
  }

  // ── H · KVKK veri indirmesi ────────────────────────────────────────────
  console.log('\n── H · KVKK veri indirmesi deneme kaydi ──');
  {
    const d = dunyaKur();
    d.firma('FH');
    d.kullanici('UH', 'Hakan@Ornek.com', 'FH');
    d.db.ekle('denemeKullanimi', { firmaId: 'FH', kullaniciId: 'UH', kaynak: 'deneme', epostaNormal: 'hakan@ornek.com', telefonNormal: '5330001122' });
    d.db.ekle('denemeKullanimi', { firmaId: 'F-ESKI', kullaniciId: 'U-KAPALI', kaynak: 'geriye-donuk', epostaNormal: 'hakan@ornek.com' });
    d.db.ekle('denemeKullanimi', { firmaId: 'F-BASKA', kullaniciId: 'U-BASKA', kaynak: 'deneme', epostaNormal: 'baska@x.com', telefonNormal: '5330001122' });
    d.db.ekle('denemeKullanimi', { firmaId: 'FH', kullaniciId: 'U-UYE', kaynak: 'deneme', epostaNormal: 'uye@ornek.com' });
    const disa: any = await d.hesap.verileriDisaAktar('UH');
    const k: any[] = disa.denemeKullanimKayitlari ?? [];
    const var_ = (firma: string, eposta: string) => k.some((r) => r.firmaId === firma && r.epostaNormal === eposta);
    check('H1 ⭐ bu hesabin kaydi + ayni adresle kapatilmis eski hesabin kaydi indirmede VAR',
      var_('FH', 'hakan@ornek.com') && var_('F-ESKI', 'hakan@ornek.com'), JSON.stringify(k));
    check('H2 ⭐ yalniz telefonu ortak BASKA kisinin ve ayni firmadaki baska uyenin kaydi YOK',
      k.length === 2 && !var_('F-BASKA', 'baska@x.com') && !var_('FH', 'uye@ornek.com'), `adet=${k.length}`);
    check('H3 notlarda deneme kaydinin saklama gerekcesi', (disa.notlar ?? []).some((n: string) => n.includes('denemeKullanimKayitlari')));
  }

  // ── I · denemesiz ikiz plan tanimi (paketleri-kur.ts, KOSULMAZ) ────────
  console.log('\n── I · ikiz plan tanimi ──');
  {
    const { denemesizIkizTanimi, denemesizIkizGerekliMi } = await import('../scripts/paketleri-kur');
    const t = denemesizIkizTanimi({ tutar: new Prisma.Decimal('1649.00'), paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, paket: { ad: 'Pro — Mekanik' } });
    check('I1 ⭐ ikiz: deneme 0; tutar/para birimi/periyot SURUMUN AYNISI',
      t.denemeGunu === 0 && t.tutar === 1649 && t.paraBirimi === 'TRY' && t.periyot === 'MONTHLY' && t.periyotAdedi === 1 &&
        t.ad === 'Pro — Mekanik · Aylik · Denemesiz', JSON.stringify(t));
    const s = { satistaMi: true, denemeGunu: 30, iyzicoDenemesizPlanKodu: null as string | null };
    check('I2 ikiz yalniz satistaki, denemeli, ikizi OLMAYAN surume kurulur',
      denemesizIkizGerekliMi(s) && !denemesizIkizGerekliMi({ ...s, iyzicoDenemesizPlanKodu: 'x' }) &&
        !denemesizIkizGerekliMi({ ...s, denemeGunu: 0 }) && !denemesizIkizGerekliMi({ ...s, satistaMi: false }));
  }
}

function son() {
  console.log(`\n${'='.repeat(64)}\nDENEME HAKKI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
