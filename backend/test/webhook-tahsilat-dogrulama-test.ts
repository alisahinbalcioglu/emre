/**
 * WEBHOOK TAHSİLAT DOĞRULAMASI  (`npm run test:webhook-tahsilat-dogrulama`) · 24.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `IyzicoWebhookController` (imza ayarı varsayılan:
 * ZORUNLU DEĞİL), `WebhookIsleyici`, `AbonelikServisi`, `FaturaServisi`,
 * `DunningServisi`, `ErisimServisi`, `MutabakatJob` ve `SatinAlmaServisi`
 * bellek-Prisma üzerinde koşar. Bellek-Prisma ve sahte iyzico
 * `mutabakat-kayip-tahsilat-test.ts`teki taklidin kopyasıdır: `where`i GERÇEKTEN
 * uygular, tekillik (P2002) taşır, bilmediği operatörde PATLAR; iyzico her
 * çağrıda TAZE kopya döndürür, kime sorulduğunu kaydeder, tanımsız kod için
 * varsayılan UYDURMAZ. Sipariş biçimi 20.08 sandbox tutanağından
 * (docs/adim0-tutanak/*.json): epoch ms SAYI, `paymentStatus`, yeniden eskiye.
 *
 * ── NEDEN (güvenlik incelemesi, 24.09 kodda okundu) ──────────────────────
 * Webhook ucu herkese açık ve imza varsayılan olarak ZORUNLU DEĞİL
 * (`IYZICO_IMZA_ZORUNLU`). Gövde tahsilat kanıtı değildir:
 *  1. `tahsilatBasarili` siparişin iyzico listesinde VAR olmasına bakıyordu,
 *     ÖDENMİŞ olmasına değil. iyzico sonraki dönemin siparişini ÖNCEDEN açar
 *     (tutanak: WAITING, ödeme denemesi yok) — onu anan sahte başarı erişimi
 *     bir dönem uzatır, dunning'i sıfırlar, tahsil edilmemiş paraya fatura açar.
 *  2. `tahsilatBasarisiz` iyzico'ya HİÇ sormuyordu: abonelik kodunu anan her
 *     gövde AKTIF/DENEME'yi ODEME_BEKLIYOR'a atıp dunning'i başlatıyordu. Gece
 *     mutabakatı bunu artık onarmıyor (kanıtsız terfi yok, Emre 24.09) →
 *     ödeyen müşteri 10. gün KISITLI, 30. gün ASKIDA.
 *  3. `POST /abonelik/donus` yanıtı `abonelikKodu` taşıyordu (1 ve 2'nin ön
 *     koşulu olan kod); ön yüz yalnız `durum` okur.
 *  +  iyzico tarihleri `new Date(...)` ile okunuyordu: rakam-dizesi Invalid Date.
 *
 * ── BLOKLAR ─────────────────────────────────────────────────────────────
 *   S  saf kural (`iyzico/tahsilat-kaniti.ts`): TEK kural (mutabakat AYNI
 *      fonksiyonu kullanır), sipariş eşleşmesi, başarısızlık kanıtı tablosu
 *   Ö  ÖLÇÜT: gerçek başarı/başarısızlık AYNI yoldan istenen sonucu verir
 *   B  sahte BAŞARI: ödenmemiş sipariş erişim/fatura/dunning'e dokunmaz;
 *      gerçek ödeme KAYBOLMAZ (liste gecikirse yeniden deneme; olay ölürse
 *      gece mutabakatı oynatır — BAĞLANTI)
 *   F  sahte BAŞARISIZLIK: ödeyen müşteri dunning'e girmez (zincir: gece +
 *      10./30. gün); gerçek ret yine dunning'i başlatır; eskimiş ret ödenmiş
 *      siparişi geri almaz
 *   D  `/abonelik/donus` yanıtı yalnız `durum`
 *   T  tarih: rakam-dizesi endPeriod · startPeriod · endDate · iyziEventTime
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import { BadRequestException, ConsoleLogger, Logger, Module, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { PrismaService } from '../src/altyapi/db/prisma.service';
import { govdeSinirlariniKur } from '../src/altyapi/http/govde-siniri';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import {
  MUTABAKAT_KAYNAGI,
  MutabakatJob,
  odenmisSiparisMi as mutabakatinOdenmisKurali,
} from '../src/ozellik/odeme/abonelik/mutabakat.job';
import {
  odenmisSiparisMi,
  siparisiBul,
  sonrakiDonemIslenmisMi,
  tahsilatBasarisizligiKarari,
} from '../src/ozellik/odeme/iyzico/tahsilat-kaniti';
import { SatinAlmaServisi, donemTarihleriHesapla } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { IyzicoWebhookController } from '../src/ozellik/odeme/webhook/webhook.controller';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { abonelikImzasiniDogrula, type AbonelikWebhookGovdesi } from '../src/ozellik/odeme/iyzico/imza';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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

// Nest günlüğü gürültüsü kapalı; WTD_GUNLUK=1 ile açılır.
if (!process.env.WTD_GUNLUK) Logger.overrideLogger(false);

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;

const BASARI: AbonelikWebhookGovdesi['iyziEventType'] = 'subscription.order.success';
const BASARISIZLIK: AbonelikWebhookGovdesi['iyziEventType'] = 'subscription.order.failure';

/** Denetleyicinin imza ayarı — dünyada ortam değişkeni olarak verilir. */
const IMZA_AYARI = { merchantId: 'mid-test', secretKey: 'sk-test' } as const;
type ImzaSirasiAdi = 'merchantId-once' | 'secretKey-once';

/**
 * GEÇERLİ X-IYZ-SIGNATURE-V3 — üretim kodundan BAĞIMSIZ hesap (dairesel ölçüt
 * yok): HMAC-SHA256(secretKey), hex; merchantId + secretKey (ya da ters) +
 * olay tipi + abonelik + sipariş + müşteri kodu, AYIRAÇSIZ (iyzico dokümanı).
 */
function imzala(g: AbonelikWebhookGovdesi, sira: ImzaSirasiAdi): string {
  const bas =
    sira === 'merchantId-once'
      ? IMZA_AYARI.merchantId + IMZA_AYARI.secretKey
      : IMZA_AYARI.secretKey + IMZA_AYARI.merchantId;
  return createHmac('sha256', IMZA_AYARI.secretKey)
    .update(bas + g.iyziEventType + g.subscriptionReferenceCode + g.orderReferenceCode + g.customerReferenceCode)
    .digest('hex');
}

/**
 * Günlüğü TOPLAR: işleyici ve gece işi hatayı YAKALAYIP yalnız günlüğe yazar;
 * günlük kapalıyken patlayan bir adım "değişmedi" diye boşuna yeşil görünürdü.
 */
async function gunluguTopla(is: () => Promise<unknown>) {
  const kayitlar: string[] = [];
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const bos = () => undefined;
  Logger.overrideLogger({
    log: (m: unknown) => { kayitlar.push(String(m)); },
    warn: (m: unknown) => { uyarilar.push(String(m)); },
    error: (m: unknown) => { hatalar.push(String(m)); },
    debug: bos,
    verbose: bos,
    fatal: bos,
  });
  try {
    await is();
  } finally {
    Logger.overrideLogger(process.env.WTD_GUNLUK ? new ConsoleLogger() : false);
  }
  return { kayitlar, uyarilar, hatalar };
}

type Gunluk = { kayitlar: string[]; uyarilar: string[]; hatalar: string[] };
const gunlukYaz = (g: Gunluk) => `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)}`;
// Geçersiz Date'te `toISOString` PATLAR — T bloğu tam da onu ölçüyor.
const iso = (t: unknown) =>
  t instanceof Date ? (Number.isNaN(t.getTime()) ? 'Invalid Date' : t.toISOString()) : String(t);

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — `mutabakat-kayip-tahsilat-test.ts`teki taklit + satın alma
//  niyeti (`abonelikBaslatma`) ilişkisi ve tekilliği
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  abonelikBaslatma: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
};

/** Şemadaki `@unique` alanlar (yalnız bu paketin dokunduğu tablolar). */
const TEKIL: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  fatura: ['tahsilatKodu'],
  webhookOlayi: ['tekilAnahtar'],
  abonelikBaslatma: ['token'],
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    planliPaketSurumuId: null, paketGecisTarihi: null, odenenPaketSurumuId: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ olusturuldu: new Date(), aktor: 'sistem', oncekiDurum: null, yeniDurum: null }),
  webhookOlayi: () => ({
    kaynak: 'iyzico', imzaBasligi: null, imzaGecerli: false, abonelikKodu: null, siparisKodu: null,
    musteriKodu: null, iyzicoRefKodu: null, olayZamani: null, islendi: false, islenmeZamani: null,
    denemeSayisi: 0, hata: null, alindi: new Date(),
  }),
  fatura: () => ({
    durum: 'BEKLIYOR', kdvOrani: 20, paraBirimi: 'TRY', saglayici: null, saglayiciId: null,
    faturaNo: null, faturaUrl: null, denemeSayisi: 0, sonDeneme: null, hata: null,
    olusturuldu: new Date(),
  }),
  abonelikBaslatma: () => ({
    durum: 'BEKLIYOR', iyzicoAbonelikKodu: null, hata: null, sonKontrol: null, denemeSayisi: 0,
    denemeGunu: null, planKodu: null, epostaNormal: null, formEpostaNormal: null, telefonNormal: null,
    sozlesmeOnayiZamani: null, sozlesmeSurumu: null, olusturuldu: new Date(), sonuclandi: null,
  }),
};

function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  for (const [op, v] of Object.entries(kosul)) {
    switch (op) {
      case 'in':
        if (!(v as unknown[]).includes(deger)) return false;
        break;
      case 'not':
        if (v === null ? bos : kosulUygula(deger, v)) return false;
        break;
      case 'lt':
        if (bos || !(deger < (v as any))) return false;
        break;
      case 'lte':
        if (bos || !(deger <= (v as any))) return false;
        break;
      case 'gt':
        if (bos || !(deger > (v as any))) return false;
        break;
      case 'gte':
        if (bos || !(deger >= (v as any))) return false;
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

/** Sorgu argümanında tanımadığı anahtar varsa PATLAR (sessiz yok sayma yok). */
function anahtarDenetle(model: string, islem: string, arg: any, izinli: string[]): void {
  for (const k of Object.keys(arg ?? {})) {
    if (!izinli.includes(k)) throw new Error(`bellek-Prisma: ${model}.${islem} "${k}" desteklenmiyor`);
  }
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = Array.isArray(orderBy) ? orderBy : [orderBy];
  const kopya = [...satirlar];
  kopya.sort((a, b) => {
    for (const kural of kurallar) {
      const [alan, yon] = Object.entries(kural)[0] as [string, string];
      if (yon !== 'asc' && yon !== 'desc') throw new Error(`bellek-Prisma: orderBy yonu "${yon}"`);
      const x = a[alan] instanceof Date ? a[alan].getTime() : a[alan];
      const y = b[alan] instanceof Date ? b[alan].getTime() : b[alan];
      if (x === y) continue;
      return (x < y ? -1 : 1) * (yon === 'asc' ? 1 : -1);
    }
    return 0;
  });
  return kopya;
}

const VERI_ISLEMLERI = ['increment', 'decrement'];

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

  // Prisma her okumada TAZE nesne döndürür; taklit de öyle (kopya döner).
  function yansit(model: string, satir: Satir, spec: any): Satir {
    const iliski = (k: string, v: any) => {
      const il = ILISKILER[model]?.[k];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen iliski ${model}.${k}`);
      const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel]);
      return hedef ? yansit(il.model, hedef, v === true ? {} : v) : null;
    };
    if (spec?.select) {
      const sonuc: Satir = {};
      for (const [k, v] of Object.entries(spec.select)) {
        if (!v) continue;
        sonuc[k] = ILISKILER[model]?.[k] ? iliski(k, v) : satir[k];
      }
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) {
      if (v) sonuc[k] = iliski(k, v);
    }
    return sonuc;
  }

  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const islem =
        v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) &&
        Object.keys(v).length === 1 && VERI_ISLEMLERI.includes(Object.keys(v)[0])
          ? Object.keys(v)[0]
          : null;
      if (islem === 'increment') hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      else if (islem === 'decrement') hedef[k] = (hedef[k] ?? 0) - (v as any).decrement;
      else hedef[k] = v;
    }
  }

  function tekillikDenetle(model: string, aday: Satir, haric?: Satir): void {
    for (const alan of TEKIL[model] ?? []) {
      const d = aday[alan];
      if (d === null || d === undefined) continue;
      if (tablo(model).some((r) => r !== haric && r[alan] === d)) {
        throw Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), {
          code: 'P2002', meta: { target: [alan] },
        });
      }
    }
  }

  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tekillikDenetle(model, satir);
    tablo(model).push(satir);
    return satir;
  }

  const modelYuzu = (model: string) => ({
    findUnique: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findUnique', arg, ['where', 'select', 'include']);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      return s ? yansit(model, s, arg) : null;
    },
    findUniqueOrThrow: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findUniqueOrThrow', arg, ['where', 'select', 'include']);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} bulunamadi`), { code: 'P2025' });
      return yansit(model, s, arg);
    },
    findFirst: async (arg: any = {}) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findFirst', arg, ['where', 'select', 'include', 'orderBy']);
      const s = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy)[0];
      return s ? yansit(model, s, arg) : null;
    },
    findMany: async (arg: any = {}) => {
      await Promise.resolve();
      anahtarDenetle(model, 'findMany', arg, ['where', 'select', 'include', 'orderBy', 'take']);
      const hepsi = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy);
      const kesit = typeof arg.take === 'number' ? hepsi.slice(0, arg.take) : hepsi;
      return kesit.map((s) => yansit(model, s, arg));
    },
    count: async (arg: any = {}) => {
      await Promise.resolve();
      anahtarDenetle(model, 'count', arg, ['where']);
      return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
    },
    create: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'create', arg, ['data', 'select', 'include']);
      return yansit(model, olustur(model, arg.data), arg);
    },
    update: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'update', arg, ['where', 'data', 'select', 'include']);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} guncellenecek satir yok`), { code: 'P2025' });
      const aday = { ...s };
      veriUygula(aday, arg.data);
      tekillikDenetle(model, aday, s);
      veriUygula(s, arg.data);
      return yansit(model, s, arg);
    },
    updateMany: async (arg: any) => {
      await Promise.resolve();
      anahtarDenetle(model, 'updateMany', arg, ['where', 'data']);
      const hedefler = tablo(model).filter((r) => whereUygula(r, arg.where));
      hedefler.forEach((s) => veriUygula(s, arg.data));
      return { count: hedefler.length };
    },
  });

  const prisma: any = new Proxy(
    {},
    {
      get: (_h, ad: string) => {
        if (ad === 'then') return undefined;
        // `firmayiGeriAc` etkileşimli transaction açar. Taklit ATOMİK DEĞİL:
        // bu paket geri açmanın atomikliğini ölçmez (onu `test:odeme-imha` ölçer).
        if (ad === '$transaction') {
          return async (is: unknown) => {
            if (typeof is === 'function') return (is as (tx: unknown) => unknown)(prisma);
            if (Array.isArray(is)) return Promise.all(is);
            throw new Error('bellek-Prisma: beklenmeyen $transaction bicimi');
          };
        }
        return modelYuzu(ad);
      },
    },
  );
  return { prisma, tablo, ekle: (model: string, data: Satir) => olustur(model, data) };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — abonelik detayı + form sonucu (her çağrıda TAZE kopya)
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const detaylar = new Map<string, unknown>();
  const formlar = new Map<string, unknown>();
  const sorulan: string[] = [];
  const tekrarlar: string[] = [];
  return {
    detaylar,
    formlar,
    sorulan,
    tekrarlar,
    istemci: {
      abonelikGetir: async (kod: string) => {
        sorulan.push(kod);
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return JSON.parse(JSON.stringify(d));
      },
      formSonucu: async (token: string) => {
        const f = formlar.get(token);
        if (f === undefined) throw new Error(`sahte iyzico: ${token} icin form sonucu tanimlanmadi`);
        return JSON.parse(JSON.stringify(f));
      },
      // Dunning merdiveninin yeniden deneme basamağı: kaydedilir, reddedilir.
      tahsilatiTekrarla: async (siparisKodu: string) => {
        tekrarlar.push(siparisKodu);
        throw new Error('sahte iyzico: yeniden tahsilat reddedildi');
      },
      abonelikIptal: async () => {
        throw new Error('sahte iyzico: bu pakette iptal YOK');
      },
      abonelikBaslat: async () => {
        throw new Error('sahte iyzico: bu pakette abonelik formu ACILMAZ');
      },
    } as any,
  };
}

/**
 * Sipariş — 20.08 sandbox tutanağındaki biçim: `price`, `currencyCode`,
 * epoch-ms `startPeriod`/`endPeriod`, `orderStatus`,
 * `paymentAttempts[{conversationId, createdDate, paymentId, paymentStatus}]`.
 * ⚠ Reddedilmiş denemenin `paymentStatus` değeri ÖLÇÜLMEDİ ('FAILURE' iyzico
 * ödeme API'sindeki değer; istemci tipi `paymentAttemptStatus: 'FAILED'` der).
 * Tarihler T bloğunda bilerek rakam-DİZESİ verilir.
 */
function siparis(p: {
  kod: string;
  durum: string;
  bas: number | string;
  son: number | string;
  denemeler?: string[];
}) {
  const t0 = Number(p.bas);
  return {
    referenceCode: p.kod,
    price: 1649,
    currencyCode: 'TRY',
    startPeriod: p.bas,
    endPeriod: p.son,
    orderStatus: p.durum,
    paymentAttempts: (p.denemeler ?? []).map((s, i) => ({
      conversationId: `conv-${p.kod}-${i}`,
      createdDate: t0 + i * GUN + DK,
      paymentId: 37_387_490 + i,
      paymentStatus: s,
    })),
  };
}

/** Abonelik detayı — 20.08 tutanağındaki alanlar; deneme alanları dokümandan. */
function iyzicoDetayi(
  kod: string,
  durum: string,
  siparisler: unknown[],
  ek: Record<string, unknown> = {},
) {
  return {
    referenceCode: kod,
    parentReferenceCode: `kok-${kod}`,
    pricingPlanReferenceCode: 'plan-30',
    customerReferenceCode: `cus-${kod}`,
    subscriptionStatus: durum,
    trialDays: 0,
    orders: siparisler,
    ...ek,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — her senaryo TAZE dünya kurar
// ═════════════════════════════════════════════════════════════════════════
const MUHASEBE_YASAK = {
  // Bu paket faturanın KUYRUĞA alındığını ölçer; kesim (muhasebe) ÇAĞRILMAZ.
  faturaKes: async () => {
    throw new Error('bu pakette fatura KESILMEZ');
  },
} as any;

/**
 * `makbuz`: işleyiciye e-posta servisi verilir — sorunsuz yenilemenin makbuzu
 * `giden`e düşer. `imzaZorunlu` / `imzaSirasi`: denetleyicinin imza ayarı
 * (`IYZICO_IMZA_ZORUNLU` / `IYZICO_IMZA_SIRASI`; verilmezse üretim varsayılanı).
 */
function dunyaKur(secenek: { makbuz?: boolean; imzaZorunlu?: boolean; imzaSirasi?: string } = {}) {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  const giden: Array<{ kime: string; konu: string }> = [];
  const posta = {
    gonder: async (p: { kime: string; konu: string }) => {
      giden.push({ kime: p.kime, konu: p.konu });
    },
  } as any;
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro Mekanik', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', {
    id: 'S30', paketId: 'P1', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-30', iyzicoDenemesizPlanKodu: 'plan-30-denemesiz',
    satistaMi: true,
  });
  // `IYZICO_IMZA_ZORUNLU` yalnız istenirse: üretimdeki varsayılan (imza zorunlu değil).
  const config = new ConfigService({
    UYGULAMA_URL: 'https://ornek.test',
    IYZICO_MERCHANT_ID: IMZA_AYARI.merchantId,
    IYZICO_SECRET_KEY: IMZA_AYARI.secretKey,
    ...(secenek.imzaZorunlu ? { IYZICO_IMZA_ZORUNLU: 'true' } : {}),
    ...(secenek.imzaSirasi ? { IYZICO_IMZA_SIRASI: secenek.imzaSirasi } : {}),
  });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const fatura = new FaturaServisi(db.prisma, MUHASEBE_YASAK, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning, secenek.makbuz ? posta : undefined);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  const erisim = new ErisimServisi(db.prisma);
  // Denetleyicinin anlık dürtmesi (`kuyrugaAl` → setImmediate) KAYDEDİLİR;
  // işleme dakikalık taramadan (`bekleyenleriIsle`) sürülür — sıra belirli.
  const kuyruk: string[] = [];
  const controller = new IyzicoWebhookController(
    db.prisma,
    { kuyrugaAl: (id: string) => { kuyruk.push(id); } } as any,
    config,
  );
  const denemeHakki = {
    karar: async () => {
      throw new Error('bu pakette satin alma BASLATILMAZ');
    },
  } as any;
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, denemeHakki, posta);

  /** Fatura kopyası çıkarılabilsin diye tam kimlikli firma (limited şirket). */
  function firma(id: string) {
    return db.ekle('firma', {
      id, ad: `Firma ${id}`, unvan: `${id} Tesisat Ltd. Şti.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', tcKimlikNo: null, faturaAdresi: 'Moda Cad. 1', il: 'İstanbul',
      ilce: 'Kadıköy', faturaEposta: `muhasebe@${id.toLowerCase()}.test`,
      yetkiliEposta: `sahip@${id.toLowerCase()}.test`, imhaTarihi: null,
    });
  }

  /** Kart aboneliği satırı (firma ile birlikte). */
  function kartSatiri(firmaId: string, kod: string, alanlar: Satir) {
    firma(firmaId);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S30', odemeYontemi: 'KART', iyzicoAbonelikKodu: kod,
      iyzicoKokKodu: `kok-${kod}`, iyzicoMusteriKodu: `cus-${kod}`, iyzicoDurum: 'ACTIVE',
      iyzicoSonKontrol: new Date(Date.now() - GUN), ...alanlar,
    });
  }

  /**
   * iyzico'nun (ya da sahtecinin) gönderdiği gövde, GERÇEK denetleyiciden.
   * Varsayılan: imza başlığı YOK (üretimde özellik kapalı). `baslik`:
   * `{ sira }` = o alan sırasıyla GEÇERLİ imza (`imzala`), dize = olduğu gibi.
   * Kaydedilen olay (yoksa undefined), günlük ve denetleyicinin fırlattığı
   * hata (401 vb.; yoksa null) döner.
   */
  let refSayac = 0;
  async function webhookGonder(
    tip: AbonelikWebhookGovdesi['iyziEventType'],
    abonelikKodu: string,
    siparisKodu: string,
    ek: Record<string, unknown> = {},
    baslik?: string | { sira: ImzaSirasiAdi },
  ) {
    const govde = {
      orderReferenceCode: siparisKodu,
      customerReferenceCode: `cus-${abonelikKodu}`,
      subscriptionReferenceCode: abonelikKodu,
      iyziReferenceCode: `iyz-${++refSayac}-${siparisKodu}`,
      iyziEventType: tip,
      iyziEventTime: Date.now(),
      ...ek,
    } as AbonelikWebhookGovdesi;
    const imzaBasligi = typeof baslik === 'object' ? imzala(govde, baslik.sira) : baslik;
    let hata: unknown = null;
    let yanit: unknown = null;
    const gunluk = await gunluguTopla(async () => {
      try {
        yanit = await controller.abonelik(govde, imzaBasligi);
      } catch (e) {
        hata = e;
      }
    });
    const olay = db.tablo('webhookOlayi').find((o) => o.iyzicoRefKodu === govde.iyziReferenceCode) as Satir;
    return { olay, gunluk, hata: hata as unknown, yanit, govde, imzaBasligi };
  }

  /** Dakikalık tarama (üretimde @Cron) — `kez` kez. */
  async function isle(kez = 1) {
    return gunluguTopla(async () => {
      for (let i = 0; i < kez; i++) await isleyici.bekleyenleriIsle();
    });
  }

  /** GECE: `geceMutabakati` + ardından işleyicinin taraması (ikisi de @Cron). */
  async function geceyiKos() {
    return gunluguTopla(async () => {
      await mutabakat.geceMutabakati();
      await isleyici.bekleyenleriIsle();
    });
  }

  const faturalar = (abonelikId: string) => db.tablo('fatura').filter((f) => f.abonelikId === abonelikId);
  const olaylar = (abonelikId: string, tip: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === tip);
  const durumOlaylari = (abonelikId: string) => olaylar(abonelikId, 'durum.degisti');
  const dunningPostalari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && String(o.tip).startsWith('dunning.eposta.'));

  return {
    db, iyz, giden, abonelik, fatura, dunning, isleyici, mutabakat, erisim, satinAlma, kuyruk,
    firmaEkle: firma, kartSatiri, webhookGonder, isle, geceyiKos,
    faturalar, olaylar, durumOlaylari, dunningPostalari,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURAL (`iyzico/tahsilat-kaniti.ts`)
// ═════════════════════════════════════════════════════════════════════════
function sBlogu(): void {
  console.log('\n── S · saf kural: tek kural · sipariş eşleşmesi · başarısızlık kanıtı ──');
  check('S1 ⭐ TEK kural: mutabakatın `odenmisSiparisMi`si tahsilat kanıtının AYNI fonksiyonu (ikiz yok)',
    mutabakatinOdenmisKurali === odenmisSiparisMi);

  const liste = [
    { referenceCode: 'a', orderStatus: 'SUCCESS' },
    { orderStatus: 'SUCCESS' }, // kodu EKSİK kayıt
    null,
    { referenceCode: 'b', orderStatus: 'WAITING' },
  ];
  check('S2 siparisiBul: birebir kod; boş/eksik/dize-olmayan kod ve dizi-olmayan liste → yok',
    siparisiBul(liste, 'b')?.orderStatus === 'WAITING' && siparisiBul(liste, 'A') === undefined &&
      siparisiBul(liste, undefined) === undefined && siparisiBul(liste, '') === undefined &&
      siparisiBul(liste, null) === undefined && siparisiBul(undefined, 'a') === undefined &&
      siparisiBul({ 0: liste[0] } as unknown as unknown[], 'a') === undefined);

  const T0 = 1_787_215_031_301; // 20.08 tutanağındaki startPeriod
  const sp = (durum: string, denemeler?: string[]) =>
    siparis({ kod: 'o', durum, bas: T0, son: T0 + 30 * GUN, denemeler });
  const detay = (abonelik: string, orders: unknown[]) => ({ subscriptionStatus: abonelik, orders });
  const tablo: Array<[string, unknown, unknown, string]> = [
    ['ödenmiş sipariş + ACTIVE', detay('ACTIVE', [sp('SUCCESS', ['SUCCESS'])]), 'o', 'ODENMIS'],
    ['⭐ ödenmiş sipariş + UNPAID (veto önce gelir: eskimiş ret)', detay('UNPAID', [sp('SUCCESS', ['FAILURE', 'SUCCESS'])]), 'o', 'ODENMIS'],
    ['listede yok + UNPAID', detay('UNPAID', []), 'o', 'KANITLI'],
    ['⭐ denemesiz WAITING + UNPAID', detay('UNPAID', [sp('WAITING')]), 'o', 'KANITLI'],
    ['FAILED, deneme listelenmemiş + ACTIVE', detay('ACTIVE', [sp('FAILED')]), 'o', 'KANITLI'],
    ['WAITING + reddedilmiş deneme (paymentStatus) + ACTIVE', detay('ACTIVE', [sp('WAITING', ['FAILURE'])]), 'o', 'KANITLI'],
    ['WAITING + reddedilmiş deneme (paymentAttemptStatus: FAILED) + ACTIVE',
      detay('ACTIVE', [{ referenceCode: 'o', orderStatus: 'WAITING', paymentAttempts: [{ paymentAttemptStatus: 'FAILED' }] }]), 'o', 'KANITLI'],
    ['⭐ denemesiz WAITING + ACTIVE (20.08 TEST 2-dogrulama; önceden açılmış dönem)', detay('ACTIVE', [sp('WAITING')]), 'o', 'KANITSIZ'],
    ['SUBSCRIPTION_UPGRADED, deneme yok + UPGRADED (TEST 2-dogrulama-2)', detay('UPGRADED', [sp('SUBSCRIPTION_UPGRADED')]), 'o', 'KANITSIZ'],
    ['SUCCESS ama deneme dizisi BOŞ + ACTIVE', detay('ACTIVE', [sp('SUCCESS')]), 'o', 'KANITSIZ'],
    ['deneme SUCCESS ama sipariş SUCCESS değil (iade? ÖLÇÜLMEDİ) + ACTIVE', detay('ACTIVE', [sp('REFUNDED', ['SUCCESS'])]), 'o', 'KANITSIZ'],
    ['⭐ değersiz (biçimi bilinmeyen) deneme + ACTIVE — tahmin yok',
      detay('ACTIVE', [{ referenceCode: 'o', orderStatus: 'WAITING', paymentAttempts: [{}] }]), 'o', 'KANITSIZ'],
    ['listede yok + ACTIVE', detay('ACTIVE', [sp('SUCCESS', ['SUCCESS'])]), 'baska', 'KANITSIZ'],
    ['küçük harf "unpaid" (iyzico büyük harf yazar)', detay('unpaid', []), 'o', 'KANITSIZ'],
    ['kodsuz bildirim + UNPAID: abonelik hükmü yine geçerli', detay('UNPAID', [{ orderStatus: 'SUCCESS', paymentAttempts: [{ paymentStatus: 'SUCCESS' }] }]), undefined, 'KANITLI'],
    ['detay yok (null)', null, 'o', 'KANITSIZ'],
    ['detay dize', 'UNPAID', 'o', 'KANITSIZ'],
  ];
  const sapan = tablo
    .map(([ad, d, kod, beklenen]) => ({ ad, beklenen, gercek: tahsilatBasarisizligiKarari(d, kod).karar }))
    .filter((x) => x.gercek !== x.beklenen);
  check(`S3 ⭐ başarısızlık kanıtı doğruluk tablosu (${tablo.length} satır)`, sapan.length === 0 && tablo.length === 17,
    sapan.map((x) => `${x.ad}: ${x.gercek} (beklenen ${x.beklenen})`).join(' | '));
  const g = tahsilatBasarisizligiKarari(detay('ACTIVE', [sp('WAITING')]), 'o').gerekce;
  check('S4 gerekçe iyzico\'nun kendi değerlerini taşır (olay kaydına/günlüğe yazılır)',
    g.includes('WAITING') && g.includes('ACTIVE'), g);

  // 28.09 — ESKİ DÖNEM: sonraki dönemin siparişini iyzico İŞLEMİŞ (ödenmiş ya
  // da çekimi reddedilmiş) ödenmiş sipariş. R bloğu bağlantısını ölçer.
  const E0 = T0 + 30 * GUN; // ödenmiş dönemin sonu = sonraki dönemin başı
  const odenen = sp('SUCCESS', ['SUCCESS']);
  const sonraki = (durum: string, denemeler?: string[], bas: number | string = E0) =>
    siparis({ kod: 'n', durum, bas, son: Number(bas) + 30 * GUN, denemeler });
  const eskiTablo: Array<[string, unknown[], boolean]> = [
    ['⭐ sonraki dönem reddedildi (FAILED + reddedilmiş denemeler)', [sonraki('FAILED', ['FAILURE', 'FAILURE']), odenen], true],
    ['sonraki dönem WAITING + reddedilmiş deneme', [sonraki('WAITING', ['FAILURE']), odenen], true],
    ['sonraki dönem FAILED, deneme listelenmemiş', [sonraki('FAILED'), odenen], true],
    ['sonraki dönem ÖDENMİŞ', [sonraki('SUCCESS', ['SUCCESS']), odenen], true],
    ['sonraki dönem reddedildi (paymentAttemptStatus: FAILED)',
      [{ referenceCode: 'n', orderStatus: 'WAITING', startPeriod: E0, paymentAttempts: [{ paymentAttemptStatus: 'FAILED' }] }, odenen], true],
    ['sonraki dönemin başı rakam-DİZESİ', [sonraki('FAILED', ['FAILURE'], String(E0)), odenen], true],
    ['⭐ önceden açılmış sonraki dönem (WAITING, deneme yok) — gerçek toparlanma onu listede taşır', [sonraki('WAITING'), odenen], false],
    ['sonraki dönem SUBSCRIPTION_UPGRADED, deneme yok', [sonraki('SUBSCRIPTION_UPGRADED'), odenen], false],
    ['yalnız ÖNCEKİ dönem reddedilmiş',
      [odenen, siparis({ kod: 'e', durum: 'FAILED', bas: T0 - 30 * GUN, son: T0, denemeler: ['FAILURE'] })], false],
    ['listede yalnız siparişin kendisi', [odenen], false],
    ['sonraki siparişin başı çözülemiyor', [sonraki('FAILED', ['FAILURE'], 'bozuk'), odenen], false],
  ];
  const eskiSapan = eskiTablo
    .map(([ad, liste, beklenen]) => ({ ad, beklenen, gercek: sonrakiDonemIslenmisMi(liste, odenen) }))
    .filter((x) => x.gercek !== x.beklenen);
  check(`S5 ⭐ eski dönem kuralı doğruluk tablosu (${eskiTablo.length} satır)`,
    eskiSapan.length === 0 && eskiTablo.length === 11,
    eskiSapan.map((x) => `${x.ad}: ${x.gercek} (beklenen ${x.beklenen})`).join(' | '));
  const basiBozuk = { ...odenen, startPeriod: 'bozuk' };
  check('S6 kendi başı çözülemeyen sipariş, sipariş yok ya da liste dizi değil → eski SAYILMAZ (tahmin yok)',
    !sonrakiDonemIslenmisMi([sonraki('FAILED', ['FAILURE']), basiBozuk], basiBozuk) &&
      !sonrakiDonemIslenmisMi([sonraki('FAILED', ['FAILURE'])], null) &&
      !sonrakiDonemIslenmisMi({ 0: sonraki('FAILED', ['FAILURE']) }, odenen));
  const redli = [sonraki('FAILED', ['FAILURE']), odenen];
  check('S6b ⭐ vadesi gelmemiş sonraki dönem eskitmez: başı şimdiden 1 ms sonra → eski DEĞİL; tam şimdi → eski; bozuk saat → eski DEĞİL',
    !sonrakiDonemIslenmisMi(redli, odenen, new Date(E0 - 1)) && sonrakiDonemIslenmisMi(redli, odenen, new Date(E0)) &&
      !sonrakiDonemIslenmisMi(redli, odenen, new Date(NaN)));
  // 28.09 güvenlik incelemesi: reddedilen yenilemenin biçimi ÖLÇÜLMEDİ —
  // abonelik UNPAID iken başlamış denemesiz WAITING de dönemi işlenmiş sayar.
  const bekleyen = [sonraki('WAITING'), odenen];
  check('S6c ⭐ abonelik UNPAID: başlamış HER sonraki dönem eskitir; ACTIVE\'de denemesiz WAITING eskitmez; UNPAID\'de başlamamış dönem ve tek sipariş eskitmez',
    sonrakiDonemIslenmisMi(bekleyen, odenen, new Date(E0 + GUN), 'UNPAID') &&
      !sonrakiDonemIslenmisMi(bekleyen, odenen, new Date(E0 + GUN), 'ACTIVE') &&
      !sonrakiDonemIslenmisMi(bekleyen, odenen, new Date(E0 + GUN)) &&
      !sonrakiDonemIslenmisMi(bekleyen, odenen, new Date(E0 - 1), 'UNPAID') &&
      !sonrakiDonemIslenmisMi([odenen], odenen, new Date(E0 - 1), 'UNPAID'));
  check('S6d ⭐ abonelik UNPAID + siparişin KENDİ dönemi bitmiş: sonraki dönem listede OLMASA da eski; dönemi süren ödeme (durum gecikmesi) eski DEĞİL; ACTIVE\x27de dönemi bitmiş tek sipariş eski DEĞİL',
    sonrakiDonemIslenmisMi([odenen], odenen, new Date(E0), 'UNPAID') &&
      !sonrakiDonemIslenmisMi([odenen], odenen, new Date(E0 - 1), 'UNPAID') &&
      !sonrakiDonemIslenmisMi([odenen], odenen, new Date(E0 + GUN), 'ACTIVE'));
  // Dönemler bitişik olduğundan (sonraki başı = kendi sonu) S6c/R26'da "kendi
  // dönemi bitmiş" kuralı da tetiklenir; "başlamış HER sonraki dönem" kuralını
  // ondan AYIRAN durum: kendi dönem sonu çözülemeyen sipariş (mutasyon K5).
  const sonuBozuk = { ...odenen, endPeriod: 'bozuk' };
  const bekleyenSonuBozuk = [sonraki('WAITING'), sonuBozuk];
  check('S6e ⭐ kendi dönem sonu çözülemeyen sipariş: UNPAID\'de başlamış denemesiz sonraki dönem yine eskitir (dönem sonu kuralından bağımsız); ACTIVE\'de eskitmez',
    sonrakiDonemIslenmisMi(bekleyenSonuBozuk, sonuBozuk, new Date(E0 + GUN), 'UNPAID') &&
      !sonrakiDonemIslenmisMi(bekleyenSonuBozuk, sonuBozuk, new Date(E0 + GUN), 'ACTIVE'));
}

// ═════════════════════════════════════════════════════════════════════════
//  Ö — ÖLÇÜT: gerçek başarı ve gerçek ret AYNI yoldan istenen sonucu verir
// ═════════════════════════════════════════════════════════════════════════
async function oBlogu(): Promise<void> {
  console.log('\n── Ö · ölçüt: GERÇEK başarı/ret denetleyici → işleyici → servis yolundan işlenir ──');
  {
    const d = dunyaKur();
    const eskiSon = Date.now() - 6 * SAAT; // yenileme 6 saat önce çekildi
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-O1', 'sub-o1', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    d.iyz.detaylar.set('sub-o1', iyzicoDetayi('sub-o1', 'ACTIVE', [
      siparis({ kod: 'ord-o1b', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }),
      siparis({ kod: 'ord-o1a', durum: 'SUCCESS', bas: eskiSon - 30 * GUN, son: eskiSon, denemeler: ['SUCCESS'] }),
    ]));
    const w = await d.webhookGonder(BASARI, 'sub-o1', 'ord-o1b');
    check('Ö-FIXTURE imzasız gövde KAYDEDİLDİ ve işleyiciye VERİLDİ (uç açık, imza zorunlu değil)',
      !!w.olay && w.olay.imzaGecerli === false && d.kuyruk.includes(w.olay.id),
      `olay=${JSON.stringify(w.olay ?? null)} kuyruk=${d.kuyruk}`);
    const g = await d.isle();
    check('Ö1 ⭐ ödenmiş yenileme: erisimSonu dönem sonu, fatura kuyrukta, olay işlendi',
      ab.erisimSonu.getTime() === yeniSon && d.faturalar(ab.id).some((f) => f.tahsilatKodu === 'ord-o1b') &&
        w.olay.islendi === true,
      `erisimSonu=${iso(ab.erisimSonu)} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} islendi=${w.olay.islendi}`);
    check('Ö2 hata yok', g.hatalar.length === 0, gunlukYaz(g));
  }
  {
    const d = dunyaKur();
    const son = Date.now() - 2 * SAAT; // yenileme 2 saat önce reddedildi
    const ab = d.kartSatiri('F-O2', 'sub-o2', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-o2', iyzicoDetayi('sub-o2', 'UNPAID', [
      siparis({ kod: 'ord-o2b', durum: 'FAILED', bas: son, son: son + 30 * GUN, denemeler: ['FAILURE'] }),
      siparis({ kod: 'ord-o2a', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    const w = await d.webhookGonder(BASARISIZLIK, 'sub-o2', 'ord-o2b');
    const g = await d.isle();
    check('Ö3 ⭐ gerçek ret: AKTIF → ODEME_BEKLIYOR, ilkBasarisizlik yazıldı, olay işlendi',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date && w.olay.islendi === true,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} islendi=${w.olay.islendi} hata=${w.olay.hata}`);
    check('Ö4 ⭐ ilk dunning e-postası firmaya gitti (kart güncelleme bağlantısı)',
      d.dunningPostalari(ab.id).map((o) => o.tip).join(',') === 'dunning.eposta.ilk' &&
        d.giden.some((m) => m.kime === 'muhasebe@f-o2.test'),
      `olaylar=${d.dunningPostalari(ab.id).map((o) => o.tip)} giden=${JSON.stringify(d.giden)}`);
    check('Ö5 hata yok', g.hatalar.length === 0, gunlukYaz(g));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  B — SAHTE BAŞARI (bulgu 1): ödenmemiş sipariş hiçbir şeyi değiştirmez
// ═════════════════════════════════════════════════════════════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · sahte BAŞARI: önceden açılmış (WAITING) sonraki dönem siparişi ──');
  {
    const d = dunyaKur();
    const son = Date.now() + 3 * GUN; // ödenmiş dönem 3 gün sonra biter
    const ab = d.kartSatiri('F-B1', 'sub-b1', { durum: 'AKTIF', erisimSonu: new Date(son) });
    // 20.08 TEST 2-dogrulama: ACTIVE abonelikte WAITING, ödeme denemesi YOK.
    d.iyz.detaylar.set('sub-b1', iyzicoDetayi('sub-b1', 'ACTIVE', [
      siparis({ kod: 'ord-b1-sonraki', durum: 'WAITING', bas: son, son: son + 30 * GUN }),
      siparis({ kod: 'ord-b1-bu', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    const w = await d.webhookGonder(BASARI, 'sub-b1', 'ord-b1-sonraki');
    const g = await d.isle(6);
    check('B1 ⭐ erisimSonu DEĞİŞMEDİ (eski hâl: bir dönem ileri)', ab.erisimSonu.getTime() === son,
      `erisimSonu=${iso(ab.erisimSonu)} beklenen=${iso(new Date(son))}`);
    check('B2 ⭐ tahsil edilmemiş siparişe fatura YOK', d.faturalar(ab.id).length === 0,
      `fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)}`);
    check('B3 ⭐ durum olayı YOK (sahte gövde durum makinesine ulaşmadı)', d.durumOlaylari(ab.id).length === 0,
      JSON.stringify(d.durumOlaylari(ab.id).map((o) => o.aciklama)));
    check('B4 olay işlenmedi: 5 denemede bırakıldı (ölü), hata siparişi anıyor',
      w.olay.islendi === false && w.olay.denemeSayisi === 5 && String(w.olay.hata).includes('ord-b1-sonraki'),
      `islendi=${w.olay.islendi} deneme=${w.olay.denemeSayisi} hata=${w.olay.hata}`);
    check('B5 her deneme kanıtı iyzico\'dan TAZE ister (5 soru) ve sessiz değil (hata günlüğü)',
      d.iyz.sorulan.filter((k) => k === 'sub-b1').length === 5 && g.hatalar.some((h) => h.includes('ord-b1-sonraki')),
      `sorulan=${d.iyz.sorulan} ${gunlukYaz(g)}`);
  }

  console.log('\n── B · sahte BAŞARI: dunning\'deki (KISITLI) müşteri, reddedilmiş siparişi anar ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi - 12 * GUN; // yenileme 12 gün önce reddedildi
    const ilk = new Date(son);
    const kisit = new Date(simdi - 2 * GUN);
    const ab = d.kartSatiri('F-B2', 'sub-b2', {
      durum: 'KISITLI', erisimSonu: new Date(son), ilkBasarisizlik: ilk, sonDeneme: new Date(simdi - 5 * GUN),
      denemeSayisi: 4, kisitlandi: kisit, iyzicoDurum: 'UNPAID',
    });
    d.iyz.detaylar.set('sub-b2', iyzicoDetayi('sub-b2', 'UNPAID', [
      siparis({ kod: 'ord-b2-ret', durum: 'FAILED', bas: son, son: son + 30 * GUN, denemeler: ['FAILURE', 'FAILURE'] }),
      siparis({ kod: 'ord-b2-eski', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    const once = await d.erisim.karar('F-B2');
    await d.webhookGonder(BASARI, 'sub-b2', 'ord-b2-ret');
    await d.isle(6);
    const sonra = await d.erisim.karar('F-B2');
    check('B6 ⭐ KISITLI kaldı; dunning SIFIRLANMADI (ilkBasarisizlik · denemeSayisi · kisitlandi aynı)',
      ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() && ab.denemeSayisi === 4 &&
        ab.kisitlandi?.getTime() === kisit.getTime(),
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} kisit=${iso(ab.kisitlandi)}`);
    check('B7 ⭐ erisimSonu aynı, fatura YOK', ab.erisimSonu.getTime() === son && d.faturalar(ab.id).length === 0,
      `erisimSonu=${iso(ab.erisimSonu)} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)}`);
    check('B8 erişim kararı AYNI (salt-okunur kaldı)',
      once.saltOkunur === true && sonra.saltOkunur === true && sonra.erisimVar === once.erisimVar,
      `once=${once.durum}/${once.saltOkunur} sonra=${sonra.durum}/${sonra.saltOkunur}`);
  }

  console.log('\n── B · sahte BAŞARI: ödenmemiş diğer biçimler (TEK kural) ──');
  {
    const d = dunyaKur();
    const son = Date.now() + 5 * GUN;
    const bicimler: Array<[string, (kod: string) => unknown]> = [
      ['SUBSCRIPTION_UPGRADED, deneme yok (20.08 TEST 2-dogrulama-2)',
        (kod) => siparis({ kod, durum: 'SUBSCRIPTION_UPGRADED', bas: son, son: son + 30 * GUN })],
      ['SUCCESS ama ödeme denemesi YOK', (kod) => siparis({ kod, durum: 'SUCCESS', bas: son, son: son + 30 * GUN })],
      ['SUCCESS ama yalnız reddedilmiş deneme',
        (kod) => siparis({ kod, durum: 'SUCCESS', bas: son, son: son + 30 * GUN, denemeler: ['FAILURE'] })],
      ['deneme SUCCESS ama sipariş SUCCESS değil (örn. iade — değer ÖLÇÜLMEDİ)',
        (kod) => siparis({ kod, durum: 'REFUNDED', bas: son, son: son + 30 * GUN, denemeler: ['SUCCESS'] })],
    ];
    const satirlar = bicimler.map(([, s], i) => {
      const kod = `sub-bx${i}`;
      const ab = d.kartSatiri(`F-BX${i}`, kod, { durum: 'AKTIF', erisimSonu: new Date(son) });
      d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'ACTIVE', [s(`ord-bx${i}`)]));
      return ab;
    });
    // Denetim: listede HİÇ olmayan kod — eski hâlde de reddediliyordu (kontrol).
    const yok = d.kartSatiri('F-BXY', 'sub-bxy', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-bxy', iyzicoDetayi('sub-bxy', 'ACTIVE', [
      siparis({ kod: 'ord-bxy-bu', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    for (let i = 0; i < satirlar.length; i++) await d.webhookGonder(BASARI, `sub-bx${i}`, `ord-bx${i}`);
    await d.webhookGonder(BASARI, 'sub-bxy', 'uydurma-siparis');
    await d.isle(6);
    const uzayan = bicimler.filter((_, i) => satirlar[i].erisimSonu.getTime() !== son).map(([ad]) => ad);
    check('B9 ⭐ dört ödenmemiş biçimin HİÇBİRİ erişimi uzatmadı, faturası yok',
      uzayan.length === 0 && d.db.tablo('fatura').length === 0,
      `uzayan=${uzayan.join(' | ')} fatura=${d.db.tablo('fatura').map((f) => f.tahsilatKodu)}`);
    check('B10 kontrol: listede olmayan uydurma kod yine reddedildi', yok.erisimSonu.getTime() === son,
      `erisimSonu=${iso(yok.erisimSonu)}`);
  }

  console.log('\n── B · gerçek ödeme KAYBOLMAZ: iyzico listesi gecikirse yeniden deneme ──');
  {
    const d = dunyaKur();
    const eskiSon = Date.now() - 10 * DK;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-B4', 'sub-b4', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    const odenmis = siparis({ kod: 'ord-b4', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] });
    // ⚠ Gecikme ÖLÇÜLMEDİ: bildirimin listeden önce gelip gelmediği bilinmiyor.
    d.iyz.detaylar.set('sub-b4', iyzicoDetayi('sub-b4', 'ACTIVE', [{ ...odenmis, orderStatus: 'WAITING', paymentAttempts: [] }]));
    const w = await d.webhookGonder(BASARI, 'sub-b4', 'ord-b4');
    await d.isle(1);
    check('B11 liste henüz WAITING: tahsilat UYGULANMADI, olay bekliyor (1 deneme)',
      ab.erisimSonu.getTime() === eskiSon && w.olay.islendi === false && w.olay.denemeSayisi === 1,
      `erisimSonu=${iso(ab.erisimSonu)} islendi=${w.olay.islendi} deneme=${w.olay.denemeSayisi}`);
    d.iyz.detaylar.set('sub-b4', iyzicoDetayi('sub-b4', 'ACTIVE', [odenmis]));
    const g = await d.isle(1);
    check('B12 ⭐ liste ödendi deyince sonraki tarama uyguladı: erisimSonu, tek fatura, olay işlendi',
      ab.erisimSonu.getTime() === yeniSon && d.faturalar(ab.id).filter((f) => f.tahsilatKodu === 'ord-b4').length === 1 &&
        w.olay.islendi === true && g.hatalar.length === 0,
      `erisimSonu=${iso(ab.erisimSonu)} islendi=${w.olay.islendi} ${gunlukYaz(g)}`);
  }

  console.log('\n── B · olay öldü → gece mutabakatı ödemeyi yeniden oynatır (BAĞLANTI: kayıp tahsilat) ──');
  {
    const d = dunyaKur();
    const eskiSon = Date.now() - 2 * SAAT;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-B5', 'sub-b5', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    const odenmis = siparis({ kod: 'ord-b5', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] });
    d.iyz.detaylar.set('sub-b5', iyzicoDetayi('sub-b5', 'ACTIVE', [{ ...odenmis, orderStatus: 'WAITING', paymentAttempts: [] }]));
    const w = await d.webhookGonder(BASARI, 'sub-b5', 'ord-b5');
    await d.isle(6);
    const bekleme = await d.erisim.karar('F-B5');
    check('B13 BEDEL (bilinçli): olay 5 denemede öldü; erişim gece koşumuna kadar "doğrulanıyor"',
      w.olay.islendi === false && w.olay.denemeSayisi === 5 && bekleme.erisimVar === false &&
        bekleme.uyari?.baslik === 'Abonelik döneminiz doğrulanıyor',
      `islendi=${w.olay.islendi} deneme=${w.olay.denemeSayisi} erisim=${bekleme.erisimVar} uyari=${bekleme.uyari?.baslik}`);
    d.iyz.detaylar.set('sub-b5', iyzicoDetayi('sub-b5', 'ACTIVE', [odenmis]));
    const gece = await d.geceyiKos();
    const k = await d.erisim.karar('F-B5');
    check('B14 ⭐ gece mutabakatı ödenmiş siparişi oynattı: erisimSonu dönem sonu, TEK fatura, erişim açık',
      ab.erisimSonu.getTime() === yeniSon && d.faturalar(ab.id).filter((f) => f.tahsilatKodu === 'ord-b5').length === 1 &&
        k.erisimVar === true,
      `erisimSonu=${iso(ab.erisimSonu)} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} erisim=${k.erisimVar}`);
    const oynatilan = d.db.tablo('webhookOlayi').filter((o) => o.kaynak === MUTABAKAT_KAYNAGI);
    check('B15 oynatma AYRI olay (kaynak mutabakat) ve işlendi; ölü gerçek olay ölü kaldı; hata yok',
      oynatilan.length === 1 && oynatilan[0].islendi === true && w.olay.islendi === false && gece.hatalar.length === 0,
      `oynatilan=${JSON.stringify(oynatilan.map((o) => [o.siparisKodu, o.islendi]))} ${gunlukYaz(gece)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  F — SAHTE BAŞARISIZLIK (bulgu 2): ödeyen müşteri dunning'e girmez
// ═════════════════════════════════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · sahte BAŞARISIZLIK: üç ödeyen müşteri + deneme ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi + 12 * GUN;
    const odeyen = (firma: string, kod: string) => {
      const ab = d.kartSatiri(firma, kod, { durum: 'AKTIF', erisimSonu: new Date(son) });
      d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'ACTIVE', [
        siparis({ kod: `${kod}-sonraki`, durum: 'WAITING', bas: son, son: son + 30 * GUN }),
        siparis({ kod: `${kod}-bu`, durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
      ]));
      return ab;
    };
    const a = odeyen('F-FA', 'sub-fa'); // uydurma sipariş kodu anılır
    const b = odeyen('F-FB', 'sub-fb'); // bu dönemin ÖDENMİŞ siparişi anılır
    const c = odeyen('F-FC', 'sub-fc'); // önceden açılmış sonraki dönem (WAITING, deneme yok)
    const dn = d.kartSatiri('F-FD', 'sub-fd', { durum: 'DENEME', ...donemTarihleriHesapla(new Date(simdi - 5 * GUN), 30) });
    d.iyz.detaylar.set('sub-fd', iyzicoDetayi('sub-fd', 'ACTIVE', []));
    const wa = await d.webhookGonder(BASARISIZLIK, 'sub-fa', 'uydurma-siparis');
    const wb = await d.webhookGonder(BASARISIZLIK, 'sub-fb', 'sub-fb-bu');
    const wc = await d.webhookGonder(BASARISIZLIK, 'sub-fc', 'sub-fc-sonraki');
    const wd = await d.webhookGonder(BASARISIZLIK, 'sub-fd', 'uydurma-deneme');
    await d.isle(6);
    const odeyenler = [a, b, c];
    check('F1 ⭐ üç ödeyen müşteri AKTIF kaldı, ilkBasarisizlik YOK (eski hâl: ODEME_BEKLIYOR + dunning)',
      odeyenler.every((s) => s.durum === 'AKTIF' && s.ilkBasarisizlik === null),
      odeyenler.map((s) => `${s.firmaId}=${s.durum}/${iso(s.ilkBasarisizlik)}`).join(' '));
    check('F2 ⭐ denemedeki müşteri DENEME kaldı (eski hâl: K-P5 ile ODEME_BEKLIYOR)',
      dn.durum === 'DENEME' && dn.ilkBasarisizlik === null, `durum=${dn.durum}`);
    check('F3 ⭐ hiçbirine dunning e-postası GİTMEDİ, hiçbir durum olayı yazılmadı',
      d.giden.length === 0 && [...odeyenler, dn].every((s) => d.durumOlaylari(s.id).length === 0 && d.dunningPostalari(s.id).length === 0),
      `giden=${JSON.stringify(d.giden)}`);
    check('F4 kanıtsız bildirim (uydurma · önceden açılmış · deneme): işlenmedi, 5 denemede bırakıldı',
      [wa, wc, wd].every((w) => w.olay.islendi === false && w.olay.denemeSayisi === 5),
      JSON.stringify([wa, wc, wd].map((w) => [w.olay.siparisKodu, w.olay.islendi, w.olay.denemeSayisi])));
    const yokSayilan = d.olaylar(b.id, 'tahsilat.basarisiz.yok.sayildi');
    check('F5 ⭐ ÖDENMİŞ siparişi anan bildirim: işlendi (yeniden denenmez), iz olayı yazıldı',
      wb.olay.islendi === true && wb.olay.denemeSayisi === 0 && yokSayilan.length === 1 &&
        yokSayilan[0].veri?.siparisKodu === 'sub-fb-bu',
      `islendi=${wb.olay.islendi} hata=${wb.olay.hata} olay=${JSON.stringify(yokSayilan.map((o) => o.veri))}`);

    // ZİNCİR (bulgunun sonucu): gece mutabakatı + dunning merdiveni 10. ve
    // 30. gün. Zaman atlaması yalnız başarısızlık YAZILMIŞ satırda anlamlıdır.
    const gece = await d.geceyiKos();
    const merdiven = async (gun: number) => {
      for (const s of [...odeyenler, dn]) if (s.ilkBasarisizlik) s.ilkBasarisizlik = new Date(Date.now() - gun * GUN);
      return gunluguTopla(() => d.dunning.merdiveniYurut());
    };
    await merdiven(10);
    await merdiven(30);
    const kararlar = await Promise.all(['F-FA', 'F-FB', 'F-FC'].map((f) => d.erisim.karar(f)));
    check('F6 ⭐⭐ zincir: gece + 10. gün + 30. gün sonra ödeyen müşteriler hâlâ AKTIF ve TAM erişimli (eski hâl: ASKIDA)',
      odeyenler.every((s) => s.durum === 'AKTIF') && kararlar.every((k) => k.erisimVar === true && k.saltOkunur === false),
      `${odeyenler.map((s) => `${s.firmaId}=${s.durum}`).join(' ')} erisim=${kararlar.map((k) => k.erisimVar)} ${gunlukYaz(gece)}`);
    check('F7 zincir: denemedeki müşteri DENEME, erişimi açık', dn.durum === 'DENEME' && (await d.erisim.karar('F-FD')).erisimVar === true,
      `durum=${dn.durum}`);
  }

  console.log('\n── F · GERÇEK başarısızlık yine dunning\'i başlatır (kanıt iyzico\'dan) ──');
  {
    const d = dunyaKur();
    const son = Date.now() - 3 * SAAT;
    const kur = (firma: string, kod: string, iyzicoDurum: string, siparisler: unknown[]) => {
      const ab = d.kartSatiri(firma, kod, { durum: 'AKTIF', erisimSonu: new Date(son) });
      d.iyz.detaylar.set(kod, iyzicoDetayi(kod, iyzicoDurum, siparisler));
      return ab;
    };
    const satirlar = [
      // abonelik hâlâ ACTIVE, siparişte reddedilmiş deneme
      kur('F-P1', 'sub-p1', 'ACTIVE', [siparis({ kod: 'ord-p1', durum: 'WAITING', bas: son, son: son + 30 * GUN, denemeler: ['FAILURE'] })]),
      // abonelik ACTIVE, sipariş FAILED (deneme listelenmemiş)
      kur('F-P2', 'sub-p2', 'ACTIVE', [siparis({ kod: 'ord-p2', durum: 'FAILED', bas: son, son: son + 30 * GUN })]),
      // abonelik UNPAID, sipariş listede henüz yok
      kur('F-P3', 'sub-p3', 'UNPAID', []),
      // istemci tipindeki alan adı (`paymentAttemptStatus: 'FAILED'`)
      kur('F-P4', 'sub-p4', 'ACTIVE', [{
        referenceCode: 'ord-p4', orderStatus: 'WAITING', startPeriod: son, endPeriod: son + 30 * GUN,
        paymentAttempts: [{ paymentAttemptStatus: 'FAILED' }],
      }]),
    ];
    const olaylar: Satir[] = [];
    for (let i = 1; i <= 4; i++) olaylar.push((await d.webhookGonder(BASARISIZLIK, `sub-p${i}`, `ord-p${i}`)).olay);
    const g = await d.isle(1);
    check('F8 ⭐ dört kanıt biçimi (reddedilmiş deneme · FAILED · UNPAID · tipteki alan adı) → ODEME_BEKLIYOR + ilkBasarisizlik',
      satirlar.every((s) => s.durum === 'ODEME_BEKLIYOR' && s.ilkBasarisizlik instanceof Date),
      satirlar.map((s) => `${s.firmaId}=${s.durum}`).join(' '));
    check('F9 ⭐ dördüne de ilk dunning e-postası; olaylar TEK taramada işlendi; hata yok',
      satirlar.every((s) => d.dunningPostalari(s.id).length === 1) && olaylar.every((o) => o.islendi === true) &&
        g.hatalar.length === 0,
      `islendi=${olaylar.map((o) => o.islendi)} ${gunlukYaz(g)}`);
  }

  console.log('\n── F · kanıt gecikirse ret kaybolmaz; eskimiş ret ödenmiş siparişi geri almaz ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi - SAAT;
    const ab = d.kartSatiri('F-G1', 'sub-g1', { durum: 'AKTIF', erisimSonu: new Date(son) });
    const bekleyen = siparis({ kod: 'ord-g1', durum: 'WAITING', bas: son, son: son + 30 * GUN });
    d.iyz.detaylar.set('sub-g1', iyzicoDetayi('sub-g1', 'ACTIVE', [bekleyen]));
    const w = await d.webhookGonder(BASARISIZLIK, 'sub-g1', 'ord-g1');
    await d.isle(1);
    check('F10 kanıt henüz yok (ACTIVE + WAITING, deneme yok): durum aynı, olay bekliyor (1 deneme)',
      ab.durum === 'AKTIF' && w.olay.islendi === false && w.olay.denemeSayisi === 1,
      `durum=${ab.durum} islendi=${w.olay.islendi} deneme=${w.olay.denemeSayisi}`);
    d.iyz.detaylar.set('sub-g1', iyzicoDetayi('sub-g1', 'UNPAID', [{ ...bekleyen, orderStatus: 'FAILED' }]));
    await d.isle(1);
    check('F11 ⭐ iyzico UNPAID deyince sonraki tarama dunning\'i başlattı (gerçek ret kaybolmaz)',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date && w.olay.islendi === true &&
        d.dunningPostalari(ab.id).length === 1,
      `durum=${ab.durum} islendi=${w.olay.islendi}`);

    // Eskimiş ret: ilk deneme reddedildi, yeniden deneme TUTTU ve başarı
    // işlendi (AKTIF, dönem sonu); gecikmiş ret bildirimi SONRA geliyor.
    const eskiSon = simdi - 4 * GUN;
    const yeniSon = eskiSon + 30 * GUN;
    const tutan = siparis({ kod: 'ord-s', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['FAILURE', 'SUCCESS'] });
    const s1 = d.kartSatiri('F-S1', 'sub-s1', { durum: 'AKTIF', erisimSonu: new Date(yeniSon) });
    d.iyz.detaylar.set('sub-s1', iyzicoDetayi('sub-s1', 'ACTIVE', [{ ...tutan, referenceCode: 'ord-s1' }]));
    // s2: aynısı, ama iyzico abonelik durumu henüz UNPAID'den dönmemiş (gecikme)
    const s2 = d.kartSatiri('F-S2', 'sub-s2', { durum: 'AKTIF', erisimSonu: new Date(yeniSon) });
    d.iyz.detaylar.set('sub-s2', iyzicoDetayi('sub-s2', 'UNPAID', [{ ...tutan, referenceCode: 'ord-s2' }]));
    const w1 = await d.webhookGonder(BASARISIZLIK, 'sub-s1', 'ord-s1');
    const w2 = await d.webhookGonder(BASARISIZLIK, 'sub-s2', 'ord-s2');
    await d.isle(1);
    check('F12 ⭐ eskimiş ret (sipariş sonra ÖDENDİ): AKTIF kaldı, dunning yok — abonelik durumu henüz UNPAID gösterse de',
      [s1, s2].every((s) => s.durum === 'AKTIF' && s.ilkBasarisizlik === null && d.dunningPostalari(s.id).length === 0) &&
        w1.olay.islendi === true && w2.olay.islendi === true,
      `s1=${s1.durum} s2=${s2.durum} islendi=${w1.olay.islendi},${w2.olay.islendi}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  D — `POST /abonelik/donus` yanıtı yalnız `durum` (bulgu 3)
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · /abonelik/donus yanıtı iyzico abonelik kodunu TAŞIMAZ ──');
  const d = dunyaKur();
  const niyet = (token: string, firmaId: string, ek: Satir = {}) => {
    d.firmaEkle(firmaId);
    return d.db.ekle('abonelikBaslatma', {
      token, firmaId, paketSurumuId: 'S30', olusturanId: `U-${firmaId}`, denemeGunu: 0, planKodu: 'plan-30-denemesiz', ...ek,
    });
  };
  const form = (kod: string) => ({
    referenceCode: kod, customerReferenceCode: `cus-${kod}`, pricingPlanReferenceCode: 'plan-30-denemesiz',
    subscriptionStatus: 'ACTIVE',
  });

  niyet('tok-d1', 'F-D1', { durum: 'TAMAMLANDI', iyzicoAbonelikKodu: 'sub-d1' });
  const y1: Satir = await d.satinAlma.donus('tok-d1', 'F-D1');
  check('D1 ⭐ tamamlanmış niyet: yanıt YALNIZ { durum } (eski hâl: abonelikKodu da)',
    JSON.stringify(y1) === '{"durum":"TAMAMLANDI"}', JSON.stringify(y1));

  niyet('tok-d2', 'F-D2');
  d.iyz.formlar.set('tok-d2', form('sub-d2'));
  let y2: Satir = {};
  await gunluguTopla(async () => { y2 = await d.satinAlma.donus('tok-d2', 'F-D2'); });
  const ab2 = d.db.tablo('abonelik').find((a) => a.firmaId === 'F-D2');
  check('D2 ⭐ sonuçlandırma yolu: abonelik AÇILDI (yol koştu) ve yanıt YALNIZ { durum }',
    ab2?.iyzicoAbonelikKodu === 'sub-d2' && JSON.stringify(y2) === '{"durum":"TAMAMLANDI"}',
    `abonelik=${ab2?.iyzicoAbonelikKodu} yanit=${JSON.stringify(y2)}`);

  niyet('tok-d3', 'F-D3');
  d.iyz.formlar.set('tok-d3', {}); // iyzico abonelik açmadı
  let y3: Satir = {};
  await gunluguTopla(async () => { y3 = await d.satinAlma.donus('tok-d3', 'F-D3'); });
  check('D3 bekleyen niyet: yanıt YALNIZ { durum: BEKLIYOR }', JSON.stringify(y3) === '{"durum":"BEKLIYOR"}',
    JSON.stringify(y3));

  niyet('tok-d4', 'F-D4');
  d.iyz.formlar.set('tok-d4', form('sub-d4'));
  let y4 = '';
  await gunluguTopla(async () => { y4 = await d.satinAlma.donusIyzicodan('tok-d4'); });
  check('D4 iyzico dönüş POST\'u (iç yol, aynı sonuçlandırma) etkilenmedi: "tamam"',
    y4 === 'tamam' && d.db.tablo('abonelik').some((a) => a.iyzicoAbonelikKodu === 'sub-d4'), `sonuc=${y4}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  T — TARİH: rakam-DİZESİ olarak gelen iyzico tarihleri (tek çözücü)
// ═════════════════════════════════════════════════════════════════════════
async function tBlogu(): Promise<void> {
  console.log('\n── T · tarih: rakam-dizesi endPeriod · startPeriod · endDate · iyziEventTime ──');
  {
    const d = dunyaKur();
    const eskiSon = Date.now() - 5 * SAAT;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-T1', 'sub-t1', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    d.iyz.detaylar.set('sub-t1', iyzicoDetayi('sub-t1', 'ACTIVE', [
      siparis({ kod: 'ord-t1', durum: 'SUCCESS', bas: String(eskiSon), son: String(yeniSon), denemeler: ['SUCCESS'] }),
    ]));
    check('T-OLCUT tuzak gerçek: new Date("<ms>") geçersiz', Number.isNaN(new Date(String(yeniSon)).getTime()));
    await d.webhookGonder(BASARI, 'sub-t1', 'ord-t1');
    const g = await d.isle(1);
    check('T1 ⭐ endPeriod rakam-dizesi → erisimSonu doğru an', ab.erisimSonu.getTime() === yeniSon,
      `erisimSonu=${iso(ab.erisimSonu)} beklenen=${iso(new Date(yeniSon))} ${gunlukYaz(g)}`);
    const f = d.faturalar(ab.id)[0];
    check('T2 ⭐ fatura dönemi: startPeriod/endPeriod rakam-dizesi → doğru anlar',
      f?.donemBasi?.getTime() === eskiSon && f?.donemSonu?.getTime() === yeniSon,
      `donemBasi=${iso(f?.donemBasi)} donemSonu=${iso(f?.donemSonu)}`);
  }
  {
    // İPTAL dalı: `endDate`in ANLAMI (dönem sonu mu, iptal anı mı) ÖLÇÜLMEDİ —
    // kapı anlamı KİLİTLEMEZ, yalnız çözümü: rakam-dizesi, AYNI değerin sayı
    // hâliyle birebir aynı sonucu vermeli (fark ölçütü).
    // ⚠ 26.09 (miras hakkı turu): İPTAL dalı `endDate`i ARTIK OKUMAZ — iki
    // iptal yolu (uygulama `iptalEt`, iyzico tarafı) aynı: ödenmiş dönem sonu
    // `erisimSonu`nda kalır (sandbox'ta CANCELED ayrıntısında `endDate` hiç
    // yoktu, 26.09 ölçüm). T3 bu yüzden "aynı sonuç"tan "hiçbiri değiştirmedi"ye
    // keskinleşti; tarih çözücüsünü T1/T2/T5 ölçer.
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi + 20 * GUN;
    const bitis = simdi + 18 * GUN;
    const sayi = d.kartSatiri('F-T3', 'sub-t3', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-t3', iyzicoDetayi('sub-t3', 'CANCELED', [], { endDate: bitis }));
    const dize = d.kartSatiri('F-T4', 'sub-t4', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-t4', iyzicoDetayi('sub-t4', 'CANCELED', [], { endDate: String(bitis) }));
    const bozuk = d.kartSatiri('F-T5', 'sub-t5', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-t5', iyzicoDetayi('sub-t5', 'CANCELED', [], { endDate: 'bozuk' }));
    const g = await d.geceyiKos();
    check('T3 ⭐ İPTAL dalı: endDate (sayı da rakam-dizesi de) erişimi DEĞİŞTİRMEDİ — IPTAL, erisimSonu ödenmiş dönem sonunda',
      dize.durum === 'IPTAL' && sayi.durum === 'IPTAL' &&
        dize.erisimSonu.getTime() === son && sayi.erisimSonu.getTime() === son,
      `sayi=${sayi.durum}/${iso(sayi.erisimSonu)} dize=${dize.durum}/${iso(dize.erisimSonu)} ${gunlukYaz(g)}`);
    check('T4 çözülemeyen endDate: iptal YİNE yazıldı, erisimSonu UYDURULMADI (endDate yokmuş gibi, aynı)',
      bozuk.durum === 'IPTAL' && bozuk.erisimSonu.getTime() === son,
      `durum=${bozuk.durum} erisimSonu=${iso(bozuk.erisimSonu)}`);
  }
  {
    const d = dunyaKur();
    const an = Date.now() - DK;
    const w1 = await d.webhookGonder(BASARI, 'sub-yok', 'ord-yok-1', { iyziEventTime: String(an) });
    const w2 = await d.webhookGonder(BASARI, 'sub-yok', 'ord-yok-2', { iyziEventTime: 'bozuk' });
    check('T5 ⭐ gövdedeki iyziEventTime rakam-dizesi → olayZamani doğru an',
      w1.olay?.olayZamani instanceof Date && w1.olay.olayZamani.getTime() === an, `olayZamani=${iso(w1.olay?.olayZamani)}`);
    check('T6 çözülemeyen iyziEventTime: olay YİNE kaydedildi, olayZamani boş (Invalid Date yazılmadı)',
      !!w2.olay && w2.olay.olayZamani === null, `olayZamani=${iso(w2.olay?.olayZamani)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  R — TEKRAR (28.09): aynı ya da eski ödenmiş sipariş bugünkü hâli değiştirmez
// ═════════════════════════════════════════════════════════════════════════
const TEKRAR_IZI = 'tahsilat.tekrar.yok.sayildi';
const ESKI_DONEM_IZI = 'tahsilat.eski.donem';

/** Dunning'in 10. gün basamağı (KISITLI) — B6 fikstürüyle aynı alanlar. */
function kisitliAlanlar(ilk: Date, simdi: number): Satir {
  return {
    durum: 'KISITLI', ilkBasarisizlik: ilk, denemeSayisi: 4, sonDeneme: new Date(simdi - 5 * GUN),
    kisitlandi: new Date(simdi - 2 * GUN), iyzicoDurum: 'UNPAID',
  };
}

async function rBlogu(): Promise<void> {
  console.log('\n── R · ölçüm: imza tekil anahtarı ve zamanı KAPSAMAZ; tekil anahtar yalnız aynı ref kodunu yutar ──');
  {
    const ayar = { merchantId: 'mid-test', secretKey: 'sk-test' };
    const govde = {
      orderReferenceCode: 'ord-m1', customerReferenceCode: 'cus-m1', subscriptionReferenceCode: 'sub-m1',
      iyziReferenceCode: 'iyz-m1-a', iyziEventType: BASARI, iyziEventTime: 1_787_215_031_301,
    } as AbonelikWebhookGovdesi;
    // Başlık BAĞIMSIZ hesaplanır: iyzico dokümanının kod örneklerindeki sıra.
    const baslik = createHmac('sha256', ayar.secretKey)
      .update(ayar.merchantId + ayar.secretKey + govde.iyziEventType + govde.subscriptionReferenceCode +
        govde.orderReferenceCode + govde.customerReferenceCode)
      .digest('hex');
    const kendi = abonelikImzasiniDogrula(baslik, govde, ayar).gecerli;
    const tekrar = abonelikImzasiniDogrula(
      baslik, { ...govde, iyziReferenceCode: 'iyz-m1-b', iyziEventTime: 946_684_800_000 }, ayar).gecerli;
    const baskaSiparis = abonelikImzasiniDogrula(baslik, { ...govde, orderReferenceCode: 'ord-m1-x' }, ayar).gecerli;
    check('R-M1 ⭐ imza iyziReferenceCode ve iyziEventTime\'ı KAPSAMAZ: aynı başlık ref kodu ve zamanı değişmiş gövdede de geçerli (sipariş kodu değişince geçersiz — kontrol)',
      kendi && tekrar && !baskaSiparis, `kendi=${kendi} tekrar=${tekrar} baskaSiparis=${baskaSiparis}`);

    const d = dunyaKur();
    await d.webhookGonder(BASARI, 'sub-m2', 'ord-m2', { iyziReferenceCode: 'iyz-m2-sabit' });
    await d.webhookGonder(BASARI, 'sub-m2', 'ord-m2', { iyziReferenceCode: 'iyz-m2-sabit' });
    await d.webhookGonder(BASARI, 'sub-m2', 'ord-m2', { iyziReferenceCode: 'iyz-m2-yeni' });
    const kayitlar = d.db.tablo('webhookOlayi').filter((o) => o.siparisKodu === 'ord-m2');
    check('R-M2 tekil anahtar (`iyzico:<tip>:<iyziReferenceCode>`) yalnız AYNI ref kodunu yutar; yeni ref kodlu aynı sipariş YENİ olay',
      kayitlar.length === 2 && d.kuyruk.length === 2 &&
        kayitlar.map((o) => o.tekilAnahtar).sort().join() ===
          `iyzico:${BASARI}:iyz-m2-sabit,iyzico:${BASARI}:iyz-m2-yeni`,
      JSON.stringify(kayitlar.map((o) => o.tekilAnahtar)));
  }

  console.log('\n── R · dunning\'deki satır: UYGULANMIŞ eski siparişin tekrarı (yeni ref kodu) ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const eskiBas = simdi - 42 * GUN;
    const eskiSon = simdi - 12 * GUN; // ödenmiş dönemin sonu = reddedilen yenilemenin başı
    const ab = d.kartSatiri('F-R1', 'sub-r1', { durum: 'AKTIF', erisimSonu: new Date(eskiBas) });
    const odenmis = siparis({ kod: 'ord-r1-eski', durum: 'SUCCESS', bas: eskiBas, son: eskiSon, denemeler: ['SUCCESS'] });
    d.iyz.detaylar.set('sub-r1', iyzicoDetayi('sub-r1', 'ACTIVE', [odenmis]));
    await d.webhookGonder(BASARI, 'sub-r1', 'ord-r1-eski');
    await d.isle();
    const uygulandi = ab.erisimSonu.getTime() === eskiSon && d.faturalar(ab.id).length === 1;
    d.iyz.detaylar.set('sub-r1', iyzicoDetayi('sub-r1', 'UNPAID', [
      siparis({ kod: 'ord-r1-ret', durum: 'FAILED', bas: eskiSon, son: eskiSon + 30 * GUN, denemeler: ['FAILURE', 'FAILURE'] }),
      odenmis,
    ]));
    await d.webhookGonder(BASARISIZLIK, 'sub-r1', 'ord-r1-ret');
    await d.isle();
    const dunningde = ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date;
    const ilk = new Date(eskiSon + SAAT);
    Object.assign(ab, kisitliAlanlar(ilk, simdi));
    const kisit = ab.kisitlandi as Date;
    check('R-FIXTURE eski sipariş GERÇEK yoldan uygulandı (erişim + tek fatura), sonraki dönemin reddi dunning\'i başlattı',
      uygulandi && dunningde, `uygulandi=${uygulandi} dunningde=${dunningde}`);
    const once = {
      durumOlay: d.durumOlaylari(ab.id).length, giden: d.giden.length, posta: d.dunningPostalari(ab.id).length,
      sorulan: d.iyz.sorulan.length,
    };
    const kararOnce = await d.erisim.karar('F-R1');
    const w = await d.webhookGonder(BASARI, 'sub-r1', 'ord-r1-eski');
    const g = await d.isle();
    const kararSonra = await d.erisim.karar('F-R1');
    check('R1 ⭐ KISITLI kaldı; dunning SIFIRLANMADI (ilkBasarisizlik · denemeSayisi · kisitlandi aynı), erişim sonu aynı',
      ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() && ab.denemeSayisi === 4 &&
        ab.kisitlandi?.getTime() === kisit.getTime() && ab.erisimSonu.getTime() === eskiSon,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} kisit=${iso(ab.kisitlandi)} erisimSonu=${iso(ab.erisimSonu)}`);
    check('R2 ⭐ "ödemeniz alındı" GİTMEDİ, yeni durum olayı YOK (havale ↔ kart penceresi onu "tekliften sonra çekim" sayardı), fatura tek',
      d.giden.length === once.giden && d.dunningPostalari(ab.id).length === once.posta &&
        d.durumOlaylari(ab.id).length === once.durumOlay && d.faturalar(ab.id).length === 1,
      `giden=${JSON.stringify(d.giden.slice(once.giden))} durumOlay=${once.durumOlay}→${d.durumOlaylari(ab.id).length}`);
    // Dunning'deki satırda kısa devre YOK: ödemenin döngüyü kapatıp
    // kapatmadığını iyzico'nun listesi söyler — sonraki dönem reddedilmiş.
    const eskiIz = d.olaylar(ab.id, ESKI_DONEM_IZI);
    check('R3 ⭐ tekrar olayı İŞLENDİ (yeniden denenmez); dunning\'de kısa devre yok — iyzico listesi "eski dönem" dedi, tekrar izi YOK',
      w.olay.islendi === true && w.olay.denemeSayisi === 0 && eskiIz.length === 1 &&
        eskiIz[0].veri?.siparisKodu === 'ord-r1-eski' && d.olaylar(ab.id, TEKRAR_IZI).length === 0,
      `islendi=${w.olay.islendi} deneme=${w.olay.denemeSayisi} hata=${w.olay.hata} ` +
        `eski=${JSON.stringify(eskiIz.map((o) => o.veri?.siparisKodu))} tekrar=${d.olaylar(ab.id, TEKRAR_IZI).length}`);
    check('R4 dunning\'deki satırın tekrarı iyzico\'ya SORULDU (bir kez)',
      d.iyz.sorulan.length === once.sorulan + 1, `sorulan=${once.sorulan}→${d.iyz.sorulan.length}`);
    check('R4b erişim kararı AYNI (salt-okunur kaldı); hata yok',
      kararOnce.saltOkunur === true && kararSonra.saltOkunur === true && kararSonra.erisimVar === kararOnce.erisimVar &&
        g.hatalar.length === 0,
      `once=${kararOnce.durum}/${kararOnce.saltOkunur} sonra=${kararSonra.durum}/${kararSonra.saltOkunur} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · dunning\'deki satır: HİÇ UYGULANMAMIŞ eski ödenmiş sipariş (sonraki dönem reddedilmiş) ──');
  {
    const d = dunyaKur({ makbuz: true });
    const simdi = Date.now();
    const son = simdi - 12 * GUN;
    const ilk = new Date(son + SAAT);
    const ab = d.kartSatiri('F-R5', 'sub-r5', { erisimSonu: new Date(son), ...kisitliAlanlar(ilk, simdi) });
    const kisit = ab.kisitlandi as Date;
    d.iyz.detaylar.set('sub-r5', iyzicoDetayi('sub-r5', 'UNPAID', [
      siparis({ kod: 'ord-r5-ret', durum: 'FAILED', bas: son, son: son + 30 * GUN, denemeler: ['FAILURE', 'FAILURE'] }),
      siparis({ kod: 'ord-r5-eski', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    // KONTROL: aynı dünyada sorunsuz yenilemenin makbuzu GİDER (ölçüt kör değil).
    const kSon = simdi - 2 * SAAT;
    d.kartSatiri('F-R5K', 'sub-r5k', { durum: 'AKTIF', erisimSonu: new Date(kSon) });
    d.iyz.detaylar.set('sub-r5k', iyzicoDetayi('sub-r5k', 'ACTIVE', [
      siparis({ kod: 'ord-r5k', durum: 'SUCCESS', bas: kSon, son: kSon + 30 * GUN, denemeler: ['SUCCESS'] }),
    ]));
    const kararOnce = await d.erisim.karar('F-R5');
    const w = await d.webhookGonder(BASARI, 'sub-r5', 'ord-r5-eski');
    await d.webhookGonder(BASARI, 'sub-r5k', 'ord-r5k');
    const g = await d.isle();
    const kararSonra = await d.erisim.karar('F-R5');
    check('R5 ⭐ KISITLI kaldı; dunning SIFIRLANMADI; dunning\'in "ödemeniz alındı"sı GİTMEDİ',
      ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() && ab.denemeSayisi === 4 &&
        ab.kisitlandi?.getTime() === kisit.getTime() && d.dunningPostalari(ab.id).length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} posta=${d.dunningPostalari(ab.id).map((o) => o.tip)}`);
    const eski = d.olaylar(ab.id, ESKI_DONEM_IZI);
    check('R6 ⭐ ödeme GERÇEK: faturası kuyrukta, erişim sonu geri çekilmedi; iz "eski dönem", durum olayı YOK',
      d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r5-eski' && ab.erisimSonu.getTime() === son &&
        eski.length === 1 && eski[0].veri?.siparisKodu === 'ord-r5-eski' && d.durumOlaylari(ab.id).length === 0,
      `fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} erisimSonu=${iso(ab.erisimSonu)} ` +
        `iz=${JSON.stringify(eski.map((o) => o.veri))} durumOlay=${d.durumOlaylari(ab.id).length}`);
    check('R7 olay işlendi; erişim kararı AYNI (salt-okunur); hata yok',
      w.olay.islendi === true && kararOnce.saltOkunur === true && kararSonra.saltOkunur === true && g.hatalar.length === 0,
      `islendi=${w.olay.islendi} once=${kararOnce.saltOkunur} sonra=${kararSonra.durum}/${kararSonra.saltOkunur} ${gunlukYaz(g)}`);
    const kime = (firma: string) => d.giden.filter((m) => m.kime === `muhasebe@${firma}.test`).map((m) => m.konu);
    check('R7b ⭐ eski döneme MAKBUZ da gitmedi (kısıt sürerken "ödemeniz alındı" yok); kontrol: sorunsuz yenilemeninki gitti',
      kime('f-r5').length === 0 && kime('f-r5k').length === 1,
      `f-r5=${JSON.stringify(kime('f-r5'))} kontrol=${JSON.stringify(kime('f-r5k'))}`);
  }

  console.log('\n── R · gece mutabakatı: bildirimi kaybolmuş ödeme, sonraki dönem reddedilmişken (BAĞLANTI: kayıp tahsilat kural 2) ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const bas = simdi - 42 * GUN; // kayıp ödemenin başı = son UYGULANMIŞ erişim sonu
    const oSon = simdi - 12 * GUN; // kayıp ödemenin sonu = reddedilen dönemin başı
    const ilk = new Date(oSon + SAAT);
    const ab = d.kartSatiri('F-R15', 'sub-r15', { erisimSonu: new Date(bas), ...kisitliAlanlar(ilk, simdi) });
    const kisit = ab.kisitlandi as Date;
    // Mutabakat kayıp ödemeyi yalnız ACTIVE'de arar (dosya başı sınırı): iyzico
    // reddedilen dönemi hâlâ yeniden deniyor (WAITING + reddedilmiş deneme).
    d.iyz.detaylar.set('sub-r15', iyzicoDetayi('sub-r15', 'ACTIVE', [
      siparis({ kod: 'ord-r15-ret', durum: 'WAITING', bas: oSon, son: oSon + 30 * GUN, denemeler: ['FAILURE', 'FAILURE'] }),
      siparis({ kod: 'ord-r15-kayip', durum: 'SUCCESS', bas, son: oSon, denemeler: ['SUCCESS'] }),
    ]));
    const gece = await d.geceyiKos();
    const oynatilan = d.db.tablo('webhookOlayi').filter((o) => o.kaynak === MUTABAKAT_KAYNAGI);
    check('R15-FIXTURE gece mutabakatı kayıp ödemeyi OYNATTI (kaynak mutabakat, işlendi)',
      oynatilan.length === 1 && oynatilan[0].siparisKodu === 'ord-r15-kayip' && oynatilan[0].islendi === true,
      `oynatilan=${JSON.stringify(oynatilan.map((o) => [o.siparisKodu, o.islendi, o.hata]))} ${gunlukYaz(gece)}`);
    check('R15 ⭐ kayıp ödeme uygulandı (erişim o dönemin sonuna, fatura) ama KISITLI kaldı, dunning sürüyor, "ödemeniz alındı" yok',
      ab.erisimSonu.getTime() === oSon && d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r15-kayip' &&
        ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() &&
        ab.kisitlandi?.getTime() === kisit.getTime() && d.dunningPostalari(ab.id).length === 0 &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 1,
      `erisimSonu=${iso(ab.erisimSonu)} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} durum=${ab.durum} ` +
        `ilk=${iso(ab.ilkBasarisizlik)} posta=${d.dunningPostalari(ab.id).map((o) => o.tip)}`);
  }

  console.log('\n── R · GERÇEK toparlanma aynen: reddedilen dönemin yeniden denemesi tuttu (önceden açılmış sonraki dönem listede) ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi - 12 * GUN;
    const lSon = son + 30 * GUN;
    const ab = d.kartSatiri('F-R8', 'sub-r8', { erisimSonu: new Date(son), ...kisitliAlanlar(new Date(son + SAAT), simdi) });
    d.iyz.detaylar.set('sub-r8', iyzicoDetayi('sub-r8', 'ACTIVE', [
      siparis({ kod: 'ord-r8-sonraki', durum: 'WAITING', bas: lSon, son: lSon + 30 * GUN }),
      siparis({ kod: 'ord-r8-ret', durum: 'SUCCESS', bas: son, son: lSon, denemeler: ['FAILURE', 'SUCCESS'] }),
      siparis({ kod: 'ord-r8-eski', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r8', 'ord-r8-ret');
    const g = await d.isle();
    check('R8 ⭐ reddedilen dönemin ödemesi dunning\'den ÇIKARDI: AKTIF, sayaçlar sıfır, erişim dönem sonu',
      ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.denemeSayisi === 0 && ab.kisitlandi === null &&
        ab.erisimSonu.getTime() === lSon,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} erisimSonu=${iso(ab.erisimSonu)}`);
    check('R9 dunning\'in "ödemeniz alındı"sı BİR kez gitti, fatura kuyrukta, hata yok',
      d.dunningPostalari(ab.id).map((o) => o.tip).join() === 'dunning.eposta.toparlandi' &&
        d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r8-ret' && g.hatalar.length === 0,
      `posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} ${gunlukYaz(g)}`);
    const once = { durumOlay: d.durumOlaylari(ab.id).length, giden: d.giden.length, sorulan: d.iyz.sorulan.length };
    const w = await d.webhookGonder(BASARI, 'sub-r8', 'ord-r8-ret');
    const g2 = await d.isle();
    check('R10 ⭐ aynı siparişin ikinci bildirimi (yeni ref kodu, satır artık AKTIF): yeni durum olayı YOK, e-posta YOK, iz var, olay işlendi',
      d.durumOlaylari(ab.id).length === once.durumOlay && d.giden.length === once.giden && w.olay.islendi === true &&
        d.olaylar(ab.id, TEKRAR_IZI).map((o) => o.veri?.iz).join() === 'fatura',
      `durumOlay=${once.durumOlay}→${d.durumOlaylari(ab.id).length} giden=${once.giden}→${d.giden.length} ` +
        `iz=${JSON.stringify(d.olaylar(ab.id, TEKRAR_IZI).map((o) => o.veri))}`);
    check('R10b tekrar iyzico\'ya SORULMADI (kanıt kendi fatura kaydımız — sahte tekrar iyzico kotası harcatmaz); günlükte uyarı/hata yok',
      d.iyz.sorulan.length === once.sorulan && g2.uyarilar.length === 0 && g2.hatalar.length === 0,
      `sorulan=${once.sorulan}→${d.iyz.sorulan.length} ${gunlukYaz(g2)}`);
  }

  console.log('\n── R · sonraki dönemin başı GEÇTİ ama iyzico henüz çekmedi (WAITING, deneme yok): gerçek toparlanma aynen ──');
  {
    // Çekim partisi gecikebilir: sonraki dönem başladı, sipariş denemesiz WAITING.
    // O dönem "işlenmiş" DEĞİLDİR — reddedilen dönemin ödemesi döngüyü kapatır.
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi - 31 * GUN; // reddedilen dönemin başı
    const lSon = son + 30 * GUN; // reddedilen dönemin sonu = sonraki dönemin başı: DÜN
    const ab = d.kartSatiri('F-R8C', 'sub-r8c', { erisimSonu: new Date(son), ...kisitliAlanlar(new Date(son + SAAT), simdi) });
    d.iyz.detaylar.set('sub-r8c', iyzicoDetayi('sub-r8c', 'ACTIVE', [
      siparis({ kod: 'ord-r8c-sonraki', durum: 'WAITING', bas: lSon, son: lSon + 30 * GUN }),
      siparis({ kod: 'ord-r8c-ret', durum: 'SUCCESS', bas: son, son: lSon, denemeler: ['FAILURE', 'SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r8c', 'ord-r8c-ret');
    const g = await d.isle();
    check('R8c ⭐ başlamış ama denenmemiş sonraki dönem ödemeyi eskitmedi: dunning\'den ÇIKTI, erişim dönem sonu (dün)',
      ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.erisimSonu.getTime() === lSon &&
        d.dunningPostalari(ab.id).map((o) => o.tip).join() === 'dunning.eposta.toparlandi' &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 0 && g.hatalar.length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} erisimSonu=${iso(ab.erisimSonu)} ` +
        `posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} eski=${d.olaylar(ab.id, ESKI_DONEM_IZI).length} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · havaleye geçmiş satır: KART döneminde uygulanmış siparişin tekrarı ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const bas = simdi - 20 * GUN;
    const son = simdi + 10 * GUN;
    const ab = d.kartSatiri('F-R11', 'sub-r11', { durum: 'AKTIF', erisimSonu: new Date(bas) });
    d.iyz.detaylar.set('sub-r11', iyzicoDetayi('sub-r11', 'ACTIVE', [
      siparis({ kod: 'ord-r11', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r11', 'ord-r11');
    await d.isle();
    const uygulandi = d.faturalar(ab.id).length === 1 && ab.erisimSonu.getTime() === son;
    // Yönetici havaleyi onayladı: satır HAVALE, bir yıl; kart aboneliği kapatıldı.
    const yil = new Date(simdi + 365 * GUN);
    Object.assign(ab, { odemeYontemi: 'HAVALE', erisimSonu: yil, iyzicoDurum: 'CANCELED' });
    const w = await d.webhookGonder(BASARI, 'sub-r11', 'ord-r11');
    const g = await d.isle();
    check('R11 ⭐ ÇİFT TAHSİLAT SANILMADI: "iade gerekiyor" kaydı YOK, erişim ve fatura aynı, tekrar izi var',
      uygulandi && d.olaylar(ab.id, 'tahsilat.cift').length === 0 && ab.erisimSonu.getTime() === yil.getTime() &&
        d.faturalar(ab.id).length === 1 && d.olaylar(ab.id, TEKRAR_IZI).length === 1 && w.olay.islendi === true &&
        g.hatalar.length === 0,
      `uygulandi=${uygulandi} cift=${d.olaylar(ab.id, 'tahsilat.cift').length} erisimSonu=${iso(ab.erisimSonu)} ` +
        `iz=${d.olaylar(ab.id, TEKRAR_IZI).length} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · kapatılmış hesap: uygulanmış siparişin tekrarı hesabı GERİ AÇMAZ ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const bas = simdi - 20 * GUN;
    const son = simdi + 10 * GUN;
    const ab = d.kartSatiri('F-R14', 'sub-r14', { durum: 'AKTIF', erisimSonu: new Date(bas) });
    d.iyz.detaylar.set('sub-r14', iyzicoDetayi('sub-r14', 'ACTIVE', [
      siparis({ kod: 'ord-r14', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r14', 'ord-r14');
    await d.isle();
    // Hesap kapatıldı: imha planlandı, kart aboneliği iptal, satır IPTAL.
    const firma = d.db.tablo('firma').find((f) => f.id === 'F-R14') as Satir;
    const imha = new Date(simdi + 30 * GUN);
    firma.imhaTarihi = imha;
    Object.assign(ab, { durum: 'IPTAL', iptalTalebi: new Date(simdi - GUN), iyzicoDurum: 'CANCELED' });
    await d.webhookGonder(BASARI, 'sub-r14', 'ord-r14');
    const g = await d.isle();
    check('R14 ⭐ kapatılmış hesabın imhası İPTAL EDİLMEDİ (hesap geri açılmadı), satır IPTAL kaldı',
      firma.imhaTarihi instanceof Date && firma.imhaTarihi.getTime() === imha.getTime() && ab.durum === 'IPTAL' &&
        g.hatalar.length === 0,
      `imhaTarihi=${iso(firma.imhaTarihi)} durum=${ab.durum} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · tutarı okunamayan tahsilat: iz tutar-okunamadı olayıdır; tekrar yine yok sayılır ──');
  {
    const d = dunyaKur();
    const eskiSon = Date.now() - 3 * SAAT;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-R16', 'sub-r16', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    const tutarsiz: Satir = { ...siparis({ kod: 'ord-r16', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }) };
    delete tutarsiz.price; // iyzico siparişi tutar TAŞIMIYOR
    d.iyz.detaylar.set('sub-r16', iyzicoDetayi('sub-r16', 'ACTIVE', [tutarsiz]));
    await d.webhookGonder(BASARI, 'sub-r16', 'ord-r16');
    await d.isle();
    const uygulandi = ab.erisimSonu.getTime() === yeniSon && d.faturalar(ab.id).length === 0 &&
      d.olaylar(ab.id, 'fatura.tutar.okunamadi').length === 1;
    const once = { durumOlay: d.durumOlaylari(ab.id).length, sorulan: d.iyz.sorulan.length };
    const w = await d.webhookGonder(BASARI, 'sub-r16', 'ord-r16');
    const g = await d.isle();
    check('R16 ⭐ faturası YAZILAMAYAN (tutar okunamadı) uygulanmış sipariş: tekrar yok sayıldı (iz "tutar-izi"), yeni durum olayı ve ikinci uyarı YOK',
      uygulandi && d.durumOlaylari(ab.id).length === once.durumOlay && d.iyz.sorulan.length === once.sorulan &&
        w.olay.islendi === true && d.olaylar(ab.id, TEKRAR_IZI).map((o) => o.veri?.iz).join() === 'tutar-izi' &&
        d.olaylar(ab.id, 'fatura.tutar.okunamadi').length === 1 && g.hatalar.length === 0,
      `uygulandi=${uygulandi} durumOlay=${once.durumOlay}→${d.durumOlaylari(ab.id).length} ` +
        `iz=${JSON.stringify(d.olaylar(ab.id, TEKRAR_IZI).map((o) => o.veri))} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · başka aboneliğin uygulanmış siparişini anan gövde tekrar SAYILMAZ ──');
  {
    const d = dunyaKur();
    const bas = Date.now() - 20 * GUN;
    const son = Date.now() + 10 * GUN;
    d.kartSatiri('F-R17A', 'sub-r17a', { durum: 'AKTIF', erisimSonu: new Date(bas) });
    const b = d.kartSatiri('F-R17B', 'sub-r17b', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-r17a', iyzicoDetayi('sub-r17a', 'ACTIVE', [
      siparis({ kod: 'ord-r17a', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    d.iyz.detaylar.set('sub-r17b', iyzicoDetayi('sub-r17b', 'ACTIVE', [
      siparis({ kod: 'ord-r17b', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r17a', 'ord-r17a');
    await d.isle();
    const w = await d.webhookGonder(BASARI, 'sub-r17b', 'ord-r17a'); // B'nin kodu + A'nın siparişi
    await d.isle();
    check('R17 B\'ye tekrar izi YAZILMADI; olay iyzico listesinde doğrulanamadı (eski hâl: işlenmedi, hata siparişi anar)',
      d.olaylar(b.id, TEKRAR_IZI).length === 0 && w.olay.islendi === false && String(w.olay.hata).includes('ord-r17a'),
      `iz=${d.olaylar(b.id, TEKRAR_IZI).length} islendi=${w.olay.islendi} hata=${w.olay.hata}`);
  }

  console.log('\n── R · eski dönem yazımı KOŞULLU: okumayla yazım arasında erişim ilerlediyse geri çekmez ──');
  {
    // İki kayıp eski ödeme (bildirimleri kaybolmuş) + reddedilen sonraki dönem;
    // ikisinin bildirimi aynı anda işlenir: biri erişimi ilerletirken diğerinin
    // satır okuması bayatlar. Durum DEĞİŞMEZ (ikisi de eski dönem) — koruyan
    // yalnız erişim koşulu.
    const d = dunyaKur();
    const simdi = Date.now();
    const o1Bas = simdi - 72 * GUN;
    const o1Son = simdi - 42 * GUN;
    const o2Son = simdi - 12 * GUN;
    const ab = d.kartSatiri('F-R18', 'sub-r18', { erisimSonu: new Date(o1Bas), ...kisitliAlanlar(new Date(o2Son + SAAT), simdi) });
    d.iyz.detaylar.set('sub-r18', iyzicoDetayi('sub-r18', 'UNPAID', [
      siparis({ kod: 'ord-r18-ret', durum: 'FAILED', bas: o2Son, son: o2Son + 30 * GUN, denemeler: ['FAILURE'] }),
      siparis({ kod: 'ord-r18-o2', durum: 'SUCCESS', bas: o1Son, son: o2Son, denemeler: ['SUCCESS'] }),
      siparis({ kod: 'ord-r18-o1', durum: 'SUCCESS', bas: o1Bas, son: o1Son, denemeler: ['SUCCESS'] }),
    ]));
    // o1 iyzico'ya sorulurken başka süreç o2'yi uyguladı (erişim o2'nin sonuna).
    const asil = d.iyz.istemci.abonelikGetir;
    let araya = true;
    d.iyz.istemci.abonelikGetir = async (kod: string) => {
      const detay = await asil(kod);
      if (kod === 'sub-r18' && araya) {
        araya = false;
        ab.erisimSonu = new Date(o2Son);
      }
      return detay;
    };
    const w = await d.webhookGonder(BASARI, 'sub-r18', 'ord-r18-o1');
    await d.isle();
    const ilkDeneme = { islendi: w.olay.islendi, deneme: w.olay.denemeSayisi, erisimSonu: ab.erisimSonu.getTime() };
    const g = await d.isle();
    check('R18 ⭐ bayat okumalı eski dönem yazımı DÜŞTÜ (erişim o2\'nin sonunda kaldı), yeniden deneme taze okuyup uyguladı',
      ilkDeneme.islendi === false && ilkDeneme.deneme === 1 && ilkDeneme.erisimSonu === o2Son &&
        ab.erisimSonu.getTime() === o2Son && ab.durum === 'KISITLI' && w.olay.islendi === true &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 1 &&
        d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r18-o1' && g.hatalar.length === 0,
      `ilkDeneme=${JSON.stringify({ ...ilkDeneme, erisimSonu: iso(new Date(ilkDeneme.erisimSonu)) })} ` +
        `erisimSonu=${iso(ab.erisimSonu)} durum=${ab.durum} islendi=${w.olay.islendi} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · kapatılmış hesap: HİÇ uygulanmamış eski dönem siparişi hesabı GERİ AÇMAZ ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi - 12 * GUN;
    const sonrakiSon = son + 30 * GUN;
    const ab = d.kartSatiri('F-R19', 'sub-r19', {
      durum: 'IPTAL', erisimSonu: new Date(sonrakiSon), iptalTalebi: new Date(simdi - 3 * GUN), iyzicoDurum: 'CANCELED',
    });
    const firma = d.db.tablo('firma').find((f) => f.id === 'F-R19') as Satir;
    const imha = new Date(simdi + 30 * GUN);
    firma.imhaTarihi = imha;
    d.iyz.detaylar.set('sub-r19', iyzicoDetayi('sub-r19', 'CANCELED', [
      siparis({ kod: 'ord-r19-sonraki', durum: 'SUCCESS', bas: son, son: sonrakiSon, denemeler: ['SUCCESS'] }),
      siparis({ kod: 'ord-r19-eski', durum: 'SUCCESS', bas: son - 30 * GUN, son, denemeler: ['SUCCESS'] }),
    ]));
    const w = await d.webhookGonder(BASARI, 'sub-r19', 'ord-r19-eski');
    const g = await d.isle();
    check('R19 ⭐ imha İPTAL EDİLMEDİ (hesap geri açılmadı), satır IPTAL, erişim aynı; ödeme gerçek: fatura + eski dönem izi',
      firma.imhaTarihi instanceof Date && firma.imhaTarihi.getTime() === imha.getTime() && ab.durum === 'IPTAL' &&
        ab.erisimSonu.getTime() === sonrakiSon && d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r19-eski' &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 1 && w.olay.islendi === true && g.hatalar.length === 0,
      `imhaTarihi=${iso(firma.imhaTarihi)} durum=${ab.durum} erisimSonu=${iso(ab.erisimSonu)} ` +
        `fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · vadesi gelmemiş sonraki dönem hiçbir şeyi eskitmez (iyzico onu reddedilmiş işaretlese de) ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const son = simdi - 12 * GUN; // reddedilen dönemin başı
    const lSon = son + 30 * GUN; // reddedilen dönemin sonu: 18 gün sonra
    const ab = d.kartSatiri('F-R20', 'sub-r20', { erisimSonu: new Date(son), ...kisitliAlanlar(new Date(son + SAAT), simdi) });
    d.iyz.detaylar.set('sub-r20', iyzicoDetayi('sub-r20', 'ACTIVE', [
      // Biçimi ÖLÇÜLMEDİ: abonelik UNPAID'e düşünce önceden açılmış sonraki
      // dönem reddedilmiş işaretlenmiş — dönemi 18 gün SONRA başlıyor.
      siparis({ kod: 'ord-r20-sonraki', durum: 'FAILED', bas: lSon, son: lSon + 30 * GUN, denemeler: ['FAILURE'] }),
      siparis({ kod: 'ord-r20-ret', durum: 'SUCCESS', bas: son, son: lSon, denemeler: ['FAILURE', 'SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r20', 'ord-r20-ret');
    const g = await d.isle();
    check('R20 ⭐ reddedilen dönemin gerçek ödemesi dunning\'den ÇIKARDI: vadesi gelmemiş "reddedilmiş" sonraki dönem onu eskitmedi',
      ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.erisimSonu.getTime() === lSon &&
        d.dunningPostalari(ab.id).map((o) => o.tip).join() === 'dunning.eposta.toparlandi' &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 0 && g.hatalar.length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} erisimSonu=${iso(ab.erisimSonu)} ` +
        `posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · paket değişimi zincirinin ESKİ halkası: geç gelen ödemesi yeni ucun dunning\'ini bitirmez ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const gecis = simdi - 12 * GUN; // yeni uç bu anda başladı (dönem sonunda geçiş)
    const ilk = new Date(gecis + SAAT);
    // Satır yeni uçta, yeni ucun ilk dönemi reddedildi (KISITLI); kök kod eski halka.
    const ab = d.kartSatiri('F-R21', 'sub-r21-yeni', {
      erisimSonu: new Date(gecis), ...kisitliAlanlar(ilk, simdi), iyzicoKokKodu: 'sub-r21-eski',
    });
    const kisit = ab.kisitlandi as Date;
    d.iyz.detaylar.set('sub-r21-eski', iyzicoDetayi('sub-r21-eski', 'UPGRADED', [
      siparis({ kod: 'ord-r21-yukseltildi', durum: 'SUBSCRIPTION_UPGRADED', bas: gecis, son: gecis + 30 * GUN }),
      siparis({ kod: 'ord-r21-eski', durum: 'SUCCESS', bas: gecis - 30 * GUN, son: gecis, denemeler: ['SUCCESS'] }),
    ]));
    const w = await d.webhookGonder(BASARI, 'sub-r21-eski', 'ord-r21-eski');
    const g = await d.isle();
    check('R21 ⭐ eski halkanın (bildirimi kaybolmuş) ödemesi: KISITLI kaldı, dunning sürüyor; ödeme gerçek — fatura + eski dönem izi',
      ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() && ab.kisitlandi?.getTime() === kisit.getTime() &&
        d.dunningPostalari(ab.id).length === 0 && d.olaylar(ab.id, ESKI_DONEM_IZI).length === 1 &&
        d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r21-eski' && w.olay.islendi === true &&
        g.hatalar.length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} ` +
        `eski=${d.olaylar(ab.id, ESKI_DONEM_IZI).length} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · aynı siparişin İKİ olayı AYNI ANDA: biri bekletilir, sonra tekrar sayılır ──');
  {
    const d = dunyaKur({ makbuz: true });
    const simdi = Date.now();
    const son = simdi - 3 * GUN;
    const lSon = son + 30 * GUN;
    const ab = d.kartSatiri('F-R22', 'sub-r22', {
      durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(son), ilkBasarisizlik: new Date(son + SAAT), denemeSayisi: 1,
      iyzicoDurum: 'UNPAID',
    });
    d.iyz.detaylar.set('sub-r22', iyzicoDetayi('sub-r22', 'ACTIVE', [
      siparis({ kod: 'ord-r22', durum: 'SUCCESS', bas: son, son: lSon, denemeler: ['FAILURE', 'SUCCESS'] }),
    ]));
    // Bariyer: iki işleme iyzico sorusunda buluşur (ikisi de satırı okumuştur);
    // yalnız biri gelirse 100 ms sonra tek başına devam eder.
    const asil = d.iyz.istemci.abonelikGetir;
    const bekleyenler: Array<() => void> = [];
    d.iyz.istemci.abonelikGetir = async (kod: string) => {
      const detay = await asil(kod);
      if (kod === 'sub-r22') {
        await new Promise<void>((coz) => {
          bekleyenler.push(coz);
          if (bekleyenler.length === 2) bekleyenler.forEach((f) => f());
          else setTimeout(coz, 100);
        });
      }
      return detay;
    };
    // Anlık denemenin kuyruğa yazdığı olay + iyzico'nun kendi bildirimi (yeni ref kodu).
    const w1 = await d.webhookGonder(BASARI, 'sub-r22', 'ord-r22');
    const w2 = await d.webhookGonder(BASARI, 'sub-r22', 'ord-r22');
    const g1 = await gunluguTopla(() =>
      Promise.all([(d.isleyici as any).tekOlayIsle(w1.olay.id), (d.isleyici as any).tekOlayIsle(w2.olay.id)]));
    const ilkTur = { islenen: [w1.olay.islendi, w2.olay.islendi].filter(Boolean).length, durumOlay: d.durumOlaylari(ab.id).length };
    const g2 = await d.isle();
    const kime = d.giden.filter((m) => m.kime === 'muhasebe@f-r22.test').map((m) => m.konu);
    check('R22 ⭐ eşzamanlı ilk turda YALNIZ biri işlendi (diğeri bekletildi, deneme sayılmadı); sonraki tarama onu TEKRAR saydı',
      ilkTur.islenen === 1 && ilkTur.durumOlay === 1 && w1.olay.islendi === true && w2.olay.islendi === true &&
        w1.olay.denemeSayisi === 0 && w2.olay.denemeSayisi === 0 && d.olaylar(ab.id, TEKRAR_IZI).length === 1,
      `ilkTur=${JSON.stringify(ilkTur)} islendi=${w1.olay.islendi},${w2.olay.islendi} ` +
        `deneme=${w1.olay.denemeSayisi},${w2.olay.denemeSayisi} tekrar=${d.olaylar(ab.id, TEKRAR_IZI).length}`);
    check('R22b ⭐ tek ödeme = TEK "ödemeniz alındı" (dunning çıkışı), TEK durum olayı, tek fatura; AKTIF; hata yok',
      kime.length === 1 && d.durumOlaylari(ab.id).length === 1 && d.faturalar(ab.id).length === 1 && ab.durum === 'AKTIF' &&
        g1.hatalar.length === 0 && g2.hatalar.length === 0,
      `posta=${JSON.stringify(kime)} durumOlay=${d.durumOlaylari(ab.id).length} fatura=${d.faturalar(ab.id).length} ` +
        `durum=${ab.durum} ${gunlukYaz(g1)} ${gunlukYaz(g2)}`);
  }

  console.log('\n── R · ödemesi uygulanmış satır gecikmiş UNPAID ile döngüye düştü: aynı siparişin olayı onu ÇIKARIR ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const bas = simdi - 3 * GUN;
    const son = bas + 30 * GUN;
    const ab = d.kartSatiri('F-R23', 'sub-r23', { durum: 'AKTIF', erisimSonu: new Date(bas) });
    d.iyz.detaylar.set('sub-r23', iyzicoDetayi('sub-r23', 'ACTIVE', [
      siparis({ kod: 'ord-r23', durum: 'SUCCESS', bas, son, denemeler: ['FAILURE', 'SUCCESS'] }),
    ]));
    await d.webhookGonder(BASARI, 'sub-r23', 'ord-r23');
    await d.isle();
    const uygulandi = ab.erisimSonu.getTime() === son && d.faturalar(ab.id).length === 1;
    // Gece mutabakatı iyzico'nun gecikmiş UNPAID'ini gördü: ODEME_BEKLIYOR + döngü.
    Object.assign(ab, { durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: new Date(simdi - SAAT), iyzicoDurum: 'UNPAID' });
    // Anlık deneme siparişi iyzico'da ödenmiş gördü, başarı olayını kuyruğa yazdı.
    const w = await d.webhookGonder(BASARI, 'sub-r23', 'ord-r23');
    const g = await d.isle();
    check('R23 ⭐ aynı siparişin olayı satırı döngüden ÇIKARDI (dunning\'de kısa devre yok): AKTIF, sayaçlar sıfır, "ödemeniz alındı"; fatura tek',
      uygulandi && ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && w.olay.islendi === true &&
        d.dunningPostalari(ab.id).map((o) => o.tip).join() === 'dunning.eposta.toparlandi' &&
        d.faturalar(ab.id).length === 1 && d.olaylar(ab.id, TEKRAR_IZI).length === 0 && g.hatalar.length === 0,
      `uygulandi=${uygulandi} durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} ` +
        `posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} tekrar=${d.olaylar(ab.id, TEKRAR_IZI).length} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · sahte/gecikmiş RET: sonraki dönemi ÖDENMİŞ müşteri eski reddi anan bildirimle dunning\'e düşmez ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const fBas = simdi - 40 * GUN;
    const fSon = simdi - 10 * GUN; // reddedilmiş (hiç ödenmemiş) eski dönemin sonu = ödenen dönemin başı
    const nSon = fSon + 30 * GUN;
    const ab = d.kartSatiri('F-R24', 'sub-r24', { durum: 'AKTIF', erisimSonu: new Date(nSon) });
    d.iyz.detaylar.set('sub-r24', iyzicoDetayi('sub-r24', 'ACTIVE', [
      siparis({ kod: 'ord-r24-odenen', durum: 'SUCCESS', bas: fSon, son: nSon, denemeler: ['SUCCESS'] }),
      siparis({ kod: 'ord-r24-eski-ret', durum: 'FAILED', bas: fBas, son: fSon, denemeler: ['FAILURE', 'FAILURE'] }),
    ]));
    const w = await d.webhookGonder(BASARISIZLIK, 'sub-r24', 'ord-r24-eski-ret');
    const g = await d.isle();
    const yok = d.olaylar(ab.id, 'tahsilat.basarisiz.yok.sayildi');
    check('R24 ⭐ AKTIF kaldı, dunning YOK, e-posta YOK; olay işlendi, iz "eski dönem"',
      ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && d.dunningPostalari(ab.id).length === 0 && d.giden.length === 0 &&
        w.olay.islendi === true && yok.length === 1 && yok[0].veri?.neden === 'eski-donem' &&
        yok[0].veri?.siparisKodu === 'ord-r24-eski-ret',
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} giden=${d.giden.length} islendi=${w.olay.islendi} ` +
        `yok=${JSON.stringify(yok.map((o) => o.veri))} ${gunlukYaz(g)}`);
  }
  {
    // KONTROL: gerçek ret yine dunning'i başlatır — vadesi gelmemiş
    // "reddedilmiş" sonraki dönem onu eskitmez.
    const d = dunyaKur();
    const son = Date.now() - 2 * SAAT;
    const lSon = son + 30 * GUN;
    const ab = d.kartSatiri('F-R25', 'sub-r25', { durum: 'AKTIF', erisimSonu: new Date(son) });
    d.iyz.detaylar.set('sub-r25', iyzicoDetayi('sub-r25', 'UNPAID', [
      siparis({ kod: 'ord-r25-sonraki', durum: 'FAILED', bas: lSon, son: lSon + 30 * GUN, denemeler: ['FAILURE'] }),
      siparis({ kod: 'ord-r25', durum: 'FAILED', bas: son, son: lSon, denemeler: ['FAILURE'] }),
    ]));
    await d.webhookGonder(BASARISIZLIK, 'sub-r25', 'ord-r25');
    const g = await d.isle();
    check('R25 KONTROL: gerçek ret dunning\'i başlattı — vadesi gelmemiş "reddedilmiş" sonraki dönem onu eskitmedi',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date && d.dunningPostalari(ab.id).length === 1 &&
        d.olaylar(ab.id, 'tahsilat.basarisiz.yok.sayildi').length === 0 && g.hatalar.length === 0,
      `durum=${ab.durum} posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · abonelik UNPAID, reddedilen yenileme DENEMESİZ listeleniyor (biçim ölçülmedi): eski ödemenin tekrarı döngüden kaçıramaz ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const eskiBas = simdi - 42 * GUN;
    const eskiSon = simdi - 12 * GUN;
    const ab = d.kartSatiri('F-R26', 'sub-r26', { durum: 'AKTIF', erisimSonu: new Date(eskiBas) });
    const odenmis = siparis({ kod: 'ord-r26-eski', durum: 'SUCCESS', bas: eskiBas, son: eskiSon, denemeler: ['SUCCESS'] });
    d.iyz.detaylar.set('sub-r26', iyzicoDetayi('sub-r26', 'ACTIVE', [odenmis]));
    await d.webhookGonder(BASARI, 'sub-r26', 'ord-r26-eski');
    await d.isle();
    // Yenileme reddedildi: iyzico UNPAID; reddedilen sipariş DENEMESİZ WAITING listelenmiş.
    d.iyz.detaylar.set('sub-r26', iyzicoDetayi('sub-r26', 'UNPAID', [
      siparis({ kod: 'ord-r26-ret', durum: 'WAITING', bas: eskiSon, son: eskiSon + 30 * GUN }),
      odenmis,
    ]));
    await d.webhookGonder(BASARISIZLIK, 'sub-r26', 'ord-r26-ret');
    await d.isle();
    const dunningde = ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date;
    const ilk = new Date(eskiSon + SAAT);
    Object.assign(ab, kisitliAlanlar(ilk, simdi));
    const w = await d.webhookGonder(BASARI, 'sub-r26', 'ord-r26-eski');
    await d.isle();
    check('R26 ⭐ UNPAID + başlamış denemesiz yenileme: eski siparişin tekrarı KISITLI\'dan ÇIKARAMADI (eski dönem), "ödemeniz alındı" yok',
      dunningde && ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() &&
        d.dunningPostalari(ab.id).every((o) => o.tip !== 'dunning.eposta.toparlandi') && w.olay.islendi === true &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 1,
      `dunningde=${dunningde} durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} ` +
        `posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} eski=${d.olaylar(ab.id, ESKI_DONEM_IZI).length}`);
    // KONTROL: iyzico henüz UNPAID derken reddedilen dönemin KENDİ ödemesi.
    d.iyz.detaylar.set('sub-r26', iyzicoDetayi('sub-r26', 'UNPAID', [
      siparis({ kod: 'ord-r26-ret', durum: 'SUCCESS', bas: eskiSon, son: eskiSon + 30 * GUN, denemeler: ['FAILURE', 'SUCCESS'] }),
      odenmis,
    ]));
    await d.webhookGonder(BASARI, 'sub-r26', 'ord-r26-ret');
    const g = await d.isle();
    check('R26b KONTROL: iyzico henüz UNPAID derken reddedilen dönemin KENDİ ödemesi döngüyü kapattı (AKTIF, erişim dönem sonu)',
      ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.erisimSonu.getTime() === eskiSon + 30 * GUN &&
        g.hatalar.length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} erisimSonu=${iso(ab.erisimSonu)} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · abonelik UNPAID, reddedilen yenileme listede HİÇ YOK: dönemi bitmiş eski ödemenin tekrarı döngüden kaçıramaz ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const eskiBas = simdi - 42 * GUN;
    const eskiSon = simdi - 12 * GUN;
    const ab = d.kartSatiri('F-R27', 'sub-r27', { durum: 'AKTIF', erisimSonu: new Date(eskiBas) });
    const odenmis = siparis({ kod: 'ord-r27-eski', durum: 'SUCCESS', bas: eskiBas, son: eskiSon, denemeler: ['SUCCESS'] });
    d.iyz.detaylar.set('sub-r27', iyzicoDetayi('sub-r27', 'ACTIVE', [odenmis]));
    await d.webhookGonder(BASARI, 'sub-r27', 'ord-r27-eski');
    await d.isle();
    // Yenileme reddedildi: iyzico UNPAID, reddedilen sipariş listede HENÜZ YOK
    // (kanıt kural 2 — abonelik hükmü; F-P3 ile aynı biçim).
    d.iyz.detaylar.set('sub-r27', iyzicoDetayi('sub-r27', 'UNPAID', [odenmis]));
    await d.webhookGonder(BASARISIZLIK, 'sub-r27', 'ord-r27-ret');
    await d.isle();
    const dunningde = ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date;
    const ilk = new Date(eskiSon + SAAT);
    Object.assign(ab, kisitliAlanlar(ilk, simdi));
    const w = await d.webhookGonder(BASARI, 'sub-r27', 'ord-r27-eski');
    const g = await d.isle();
    check('R27 ⭐ UNPAID + sonraki dönem listede yok: dönemi BİTMİŞ ödemenin tekrarı KISITLI\'dan ÇIKARAMADI (eski dönem)',
      dunningde && ab.durum === 'KISITLI' && ab.ilkBasarisizlik?.getTime() === ilk.getTime() && w.olay.islendi === true &&
        d.olaylar(ab.id, ESKI_DONEM_IZI).length === 1 &&
        d.dunningPostalari(ab.id).every((o) => o.tip !== 'dunning.eposta.toparlandi') && g.hatalar.length === 0,
      `dunningde=${dunningde} durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} eski=${d.olaylar(ab.id, ESKI_DONEM_IZI).length} ` +
        `${gunlukYaz(g)}`);
  }

  console.log('\n── R · ret yolunda UNPAID genişlemesi YOK: iyzico "ödenmedi" derken dönemi bitmiş siparişin reddi dunning\'i başlatır ──');
  {
    // Yenilemenin ret bildirimi kaybolmuş, satır AKTIF; iyzico UNPAID ve
    // listedeki son sipariş dönemi BİTMİŞ reddedilmiş sipariş. Başarı yolunun
    // UNPAID kuralı (R27) burada uygulansaydı ret "eski dönem" diye yok
    // sayılır, ödemeyen müşteri gece mutabakatına dek AKTIF kalırdı.
    const d = dunyaKur();
    const simdi = Date.now();
    const rBas = simdi - 40 * GUN;
    const rSon = simdi - 10 * GUN;
    const ab = d.kartSatiri('F-R28', 'sub-r28', { durum: 'AKTIF', erisimSonu: new Date(rBas) });
    d.iyz.detaylar.set('sub-r28', iyzicoDetayi('sub-r28', 'UNPAID', [
      siparis({ kod: 'ord-r28-ret', durum: 'FAILED', bas: rBas, son: rSon, denemeler: ['FAILURE'] }),
    ]));
    const w = await d.webhookGonder(BASARISIZLIK, 'sub-r28', 'ord-r28-ret');
    const g = await d.isle();
    check('R28 ⭐ UNPAID + dönemi bitmiş reddedilmiş sipariş: ret yok SAYILMADI — ODEME_BEKLIYOR, ilk dunning e-postası',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof Date && d.dunningPostalari(ab.id).length === 1 &&
        d.olaylar(ab.id, 'tahsilat.basarisiz.yok.sayildi').length === 0 && w.olay.islendi === true && g.hatalar.length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} posta=${d.dunningPostalari(ab.id).map((o) => o.tip)} ` +
        `yok=${d.olaylar(ab.id, 'tahsilat.basarisiz.yok.sayildi').length} ${gunlukYaz(g)}`);
  }

  console.log('\n── R · tekrar SAYILMAYANLAR: aynı olayın yeniden denemesi · bağlanmadan yok sayılan bildirim ──');
  {
    const d = dunyaKur();
    const eskiSon = Date.now() - 3 * SAAT;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-R12', 'sub-r12', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    d.iyz.detaylar.set('sub-r12', iyzicoDetayi('sub-r12', 'ACTIVE', [
      siparis({ kod: 'ord-r12', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }),
    ]));
    // Fatura kuyruğu BİR kez düşer: erişim yazıldı, fatura yazılamadı.
    const asil = d.fatura.kuyrugaAl.bind(d.fatura);
    let dusur = true;
    (d.fatura as any).kuyrugaAl = async (...a: Parameters<typeof asil>) => {
      if (dusur) {
        dusur = false;
        throw new Error('sahte: fatura kuyruğu düştü');
      }
      return asil(...a);
    };
    const w = await d.webhookGonder(BASARI, 'sub-r12', 'ord-r12');
    await d.isle();
    const ilkDeneme = w.olay.islendi === false && w.olay.denemeSayisi === 1 && ab.erisimSonu.getTime() === yeniSon &&
      d.faturalar(ab.id).length === 0;
    const g = await d.isle();
    check('R12 ⭐ fatura kuyruğu düştü: AYNI olayın yeniden denemesi tekrar SAYILMADI, faturayı yazdı, olay işlendi',
      ilkDeneme && d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r12' && w.olay.islendi === true &&
        d.olaylar(ab.id, TEKRAR_IZI).length === 0 && g.hatalar.length === 0,
      `ilkDeneme=${ilkDeneme} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} islendi=${w.olay.islendi} ` +
        `iz=${d.olaylar(ab.id, TEKRAR_IZI).length} ${gunlukYaz(g)}`);
  }
  {
    const d = dunyaKur();
    const bas = Date.now() - 2 * SAAT;
    const son = bas + 30 * GUN;
    d.iyz.detaylar.set('sub-r13', iyzicoDetayi('sub-r13', 'ACTIVE', [
      siparis({ kod: 'ord-r13', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    // Satın alma sonuçlanmadan (kod satıra yazılmadan) gelen ilk bildirim.
    const w1 = await d.webhookGonder(BASARI, 'sub-r13', 'ord-r13');
    await d.isle();
    const yokSayildi = w1.olay.islendi === true && d.db.tablo('fatura').length === 0;
    const kopru = new Date(bas + 33 * GUN);
    const ab = d.kartSatiri('F-R13', 'sub-r13', { durum: 'AKTIF', erisimSonu: kopru, kopruErisimSonu: kopru });
    const w2 = await d.webhookGonder(BASARI, 'sub-r13', 'ord-r13');
    const g = await d.isle();
    check('R13 ⭐ bağlanmadan işlenen (yok sayılan) bildirim "uygulandı" SAYILMAZ: sonraki bildirim köprüyü düzeltti, faturayı yazdı',
      yokSayildi && ab.erisimSonu.getTime() === son && d.faturalar(ab.id).map((f) => f.tahsilatKodu).join() === 'ord-r13' &&
        w2.olay.islendi === true && d.olaylar(ab.id, TEKRAR_IZI).length === 0 && g.hatalar.length === 0,
      `yokSayildi=${yokSayildi} erisimSonu=${iso(ab.erisimSonu)} fatura=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} ` +
        `iz=${d.olaylar(ab.id, TEKRAR_IZI).length} ${gunlukYaz(g)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  I — İMZA ZORUNLULUĞU (28.09): zorunluyken eksik/yanlış imza 401, satır yok
// ═════════════════════════════════════════════════════════════════════════
const durum401 = (h: unknown) => h instanceof UnauthorizedException && h.getStatus() === 401;
const durum400 = (h: unknown) => h instanceof BadRequestException && h.getStatus() === 400;

async function iBlogu(): Promise<void> {
  console.log('\n── I · imza zorunluyken: eksik/yanlış imza 401 + kayıt YOK; geçerli imza işlenir ──');
  {
    const d = dunyaKur({ imzaZorunlu: true });
    const eskiSon = Date.now() - 6 * SAAT;
    const yeniSon = eskiSon + 30 * GUN;
    const ab = d.kartSatiri('F-I1', 'sub-i1', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
    d.iyz.detaylar.set('sub-i1', iyzicoDetayi('sub-i1', 'ACTIVE', [
      siparis({ kod: 'ord-i1', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }),
    ]));
    const yok = await d.webhookGonder(BASARI, 'sub-i1', 'ord-i1');
    const yanlis = await d.webhookGonder(BASARI, 'sub-i1', 'ord-i1', {}, 'a'.repeat(64));
    // Başka siparişin GEÇERLİ imzası: imza sipariş kodunu kapsar (R-M1).
    const baskaGovde = { ...yanlis.govde, orderReferenceCode: 'ord-baska' } as AbonelikWebhookGovdesi;
    const kopya = await d.webhookGonder(BASARI, 'sub-i1', 'ord-i1', {}, imzala(baskaGovde, 'merchantId-once'));
    check('I1 ⭐ imza YOK → 401, satır YAZILMADI, kuyruğa alınmadı',
      durum401(yok.hata) && !yok.olay && d.kuyruk.length === 0,
      `hata=${String(yok.hata)} olay=${!!yok.olay} kuyruk=${d.kuyruk.length}`);
    check('I2 ⭐ imza YANLIŞ (rastgele ya da başka siparişin imzası) → 401, satır YAZILMADI',
      durum401(yanlis.hata) && !yanlis.olay && durum401(kopya.hata) && !kopya.olay &&
        d.db.tablo('webhookOlayi').length === 0,
      `yanlis=${String(yanlis.hata)} kopya=${String(kopya.hata)} satir=${d.db.tablo('webhookOlayi').length}`);
    const g = await d.isle();
    check('I2b reddedilen istekler hiçbir şeyi değiştirmedi (erişim, fatura)',
      ab.erisimSonu.getTime() === eskiSon && d.faturalar(ab.id).length === 0 && g.hatalar.length === 0,
      `erisimSonu=${iso(ab.erisimSonu)} fatura=${d.faturalar(ab.id).length} ${gunlukYaz(g)}`);
    const gecerli = await d.webhookGonder(BASARI, 'sub-i1', 'ord-i1', {}, { sira: 'merchantId-once' });
    const g2 = await d.isle();
    check('I3 ⭐ GEÇERLİ imza → 200 {alindi}, satır imzaGecerli=true, işlendi: erişim dönem sonu',
      gecerli.hata === null && JSON.stringify(gecerli.yanit) === '{"alindi":true}' &&
        gecerli.olay?.imzaGecerli === true && gecerli.olay?.islendi === true && ab.erisimSonu.getTime() === yeniSon &&
        g2.hatalar.length === 0,
      `hata=${String(gecerli.hata)} yanit=${JSON.stringify(gecerli.yanit)} imzaGecerli=${gecerli.olay?.imzaGecerli} ` +
        `islendi=${gecerli.olay?.islendi} erisimSonu=${iso(ab.erisimSonu)} ${gunlukYaz(g2)}`);
    check('I3b ilk geçerli imzada eşleşen sıra günlükte (IYZICO_IMZA_SIRASI sabitlensin diye — runbook)',
      gecerli.gunluk.uyarilar.some((u) => u.includes('Alan sırası: "merchantId-once"')),
      JSON.stringify(gecerli.gunluk.uyarilar));
  }
  {
    // Sıra sabitlenmemişken iki alan sırası da kabul; sabitlenince öbür sıra 401.
    const serbest = dunyaKur({ imzaZorunlu: true });
    const s = await serbest.webhookGonder(BASARI, 'sub-yok', 'ord-i4', {}, { sira: 'secretKey-once' });
    const sabit = dunyaKur({ imzaZorunlu: true, imzaSirasi: 'merchantId-once' });
    const t = await sabit.webhookGonder(BASARI, 'sub-yok', 'ord-i5', {}, { sira: 'secretKey-once' });
    const u = await sabit.webhookGonder(BASARI, 'sub-yok', 'ord-i6', {}, { sira: 'merchantId-once' });
    check('I4 sıra sabitlenmemişken secretKey-önce imza da KABUL; sabitlenince öbür sıra 401, sabit sıra kabul',
      s.hata === null && s.olay?.imzaGecerli === true && durum401(t.hata) && !t.olay &&
        u.hata === null && u.olay?.imzaGecerli === true,
      `serbest=${String(s.hata)}/${s.olay?.imzaGecerli} sabit-oteki=${String(t.hata)} sabit=${String(u.hata)}/${u.olay?.imzaGecerli}`);
  }

  console.log('\n── I · zorunlu imza SAHTE "başarısız" bildirimini işlemeye bile almaz (karşılaştırma: varsayılan) ──');
  {
    // iyzico'da kanıt VAR (UNPAID + reddedilmiş sipariş): doğrulama kuralı bu
    // bildirimi dunning'e sokar. Zorunlu imzada imzasız gövde kapıda kalır.
    const kur = (secenek: { imzaZorunlu?: boolean }) => {
      const d = dunyaKur(secenek);
      const son = Date.now() - 2 * SAAT;
      const ab = d.kartSatiri('F-I7', 'sub-i7', { durum: 'AKTIF', erisimSonu: new Date(son) });
      d.iyz.detaylar.set('sub-i7', iyzicoDetayi('sub-i7', 'UNPAID', [
        siparis({ kod: 'ord-i7', durum: 'FAILED', bas: son, son: son + 30 * GUN, denemeler: ['FAILURE'] }),
      ]));
      return { d, ab };
    };
    const z = kur({ imzaZorunlu: true });
    const zw = await z.d.webhookGonder(BASARISIZLIK, 'sub-i7', 'ord-i7');
    await z.d.isle();
    check('I5 ⭐ zorunlu imza: imzasız "başarısız" → 401, satır yok, iyzico\'ya SORULMADI, AKTIF kaldı, dunning e-postası YOK',
      durum401(zw.hata) && !zw.olay && z.d.iyz.sorulan.length === 0 && z.ab.durum === 'AKTIF' &&
        z.d.dunningPostalari(z.ab.id).length === 0,
      `hata=${String(zw.hata)} olay=${!!zw.olay} sorulan=${z.d.iyz.sorulan} durum=${z.ab.durum}`);
    const v = kur({});
    const vw = await v.d.webhookGonder(BASARISIZLIK, 'sub-i7', 'ord-i7');
    await v.d.isle();
    check('I5b karşılaştırma (varsayılan, zorunlu değil): aynı imzasız gövde kaydedildi, iyzico\'ya soruldu, işlendi → dunning başladı (koruma yalnız doğrulama kuralı)',
      vw.hata === null && vw.olay?.imzaGecerli === false && vw.olay?.islendi === true && v.d.iyz.sorulan.includes('sub-i7') &&
        v.ab.durum === 'ODEME_BEKLIYOR' && v.d.dunningPostalari(v.ab.id).length === 1,
      `hata=${String(vw.hata)} imzaGecerli=${vw.olay?.imzaGecerli} islendi=${vw.olay?.islendi} durum=${v.ab.durum}`);
  }

  console.log('\n── I · beklenen imza günlüğe YAZILMAZ (eski hâl: iki sıranın geçerli imzasını basıyordu) ──');
  {
    const d = dunyaKur({ imzaZorunlu: true });
    const w = await d.webhookGonder(BASARI, 'sub-i8', 'ord-i8', {}, 'b'.repeat(64));
    const gecerliIkisi = [imzala(w.govde, 'merchantId-once'), imzala(w.govde, 'secretKey-once')];
    const tum = [...w.gunluk.kayitlar, ...w.gunluk.uyarilar, ...w.gunluk.hatalar];
    check('I6 ⭐ imza eşleşmedi: günlükte "eşleşmedi" satırı var ama iki sıranın GEÇERLİ imzası da YOK',
      w.gunluk.hatalar.some((h) => h.includes('Webhook imzası eşleşmedi')) &&
        gecerliIkisi.every((imza) => !tum.some((satir) => satir.includes(imza))),
      JSON.stringify(w.gunluk.hatalar));
    const sahte = await d.webhookGonder(BASARI, 'sub-i8\nSAHTE SATIR', 'ord-i9');
    const tumSahte = [...sahte.gunluk.kayitlar, ...sahte.gunluk.uyarilar, ...sahte.gunluk.hatalar];
    check('I6b ⭐ satır sonlu (biçimsiz) kod: 400, KAYDEDİLMEDİ; günlükte yalnız alan ADI — değer (sahte satır) YOK',
      durum400(sahte.hata) && !sahte.olay &&
        sahte.gunluk.uyarilar.some((u) => u.includes('REDDEDİLDİ (400)') && u.includes('subscriptionReferenceCode')) &&
        !tumSahte.some((u) => u.includes('SAHTE')),
      `hata=${String(sahte.hata)} olay=${!!sahte.olay} ${JSON.stringify(tumSahte)}`);
  }

  console.log('\n── I · gövde biçimi (28.09 güvenlik incelemesi): biçimsiz kod 400, bilinmeyen yük saklanmaz ──');
  {
    const d = dunyaKur();
    const w7 = await d.webhookGonder(BASARI, 'sub-i10', 'ord-i10', { ekYuk: 'x'.repeat(5000), kanit: { sahte: true } });
    const altiAlan = ['customerReferenceCode', 'iyziEventTime', 'iyziEventType', 'iyziReferenceCode', 'orderReferenceCode',
      'subscriptionReferenceCode'];
    check('I7 kaydedilen ham gövde YALNIZ bilinen altı alan (bilinmeyen yük tabloya girmedi)',
      !!w7.olay && JSON.stringify(Object.keys(w7.olay.hamGovde ?? {}).sort()) === JSON.stringify(altiAlan),
      JSON.stringify(Object.keys(w7.olay?.hamGovde ?? {})));
    const eksik = await d.webhookGonder(BASARI, 'sub-i11', 'ord-i11', { orderReferenceCode: undefined });
    const yol = await d.webhookGonder(BASARI, 'sub-i11', 'ord/../x');
    const tip = await d.webhookGonder('SUBSCRIPTION ORDER' as AbonelikWebhookGovdesi['iyziEventType'], 'sub-i11', 'ord-i12');
    await d.isle();
    check('I8 eksik sipariş kodu · yol karakterli kod · biçimsiz olay tipi → 400, KAYDEDİLMEDİ; iyzico\'ya sorulmadı',
      [eksik, yol, tip].every((x) => durum400(x.hata) && !x.olay) && !d.iyz.sorulan.includes('sub-i11'),
      JSON.stringify([eksik, yol, tip].map((x) => [String(x.hata), !!x.olay])) + ` sorulan=${d.iyz.sorulan}`);
  }

  console.log('\n── I · İKİ GERÇEK BİÇİM: canlıdaki tek kayıt (4 alan) ve belge örneği (6 alan) — ikisi de kaydedilir ve işlenir ──');
  {
    // 28.09 koordinatör ölçümü (salt okuma): canlıdaki TEK iyzico kaydının
    // gövdesi DÖRT alan — iyziEventType, iyziReferenceCode, orderReferenceCode,
    // subscriptionReferenceCode; müşteri kodu ve olay zamanı YOK; kodlar
    // 9/9/19 karakter. Belge (docs.iyzico.com/ek-servisler/webhook, 28.09
    // okundu) altı alanı listeler, zorunluluk belirtmez; örneği UUID +
    // milisaniye. Biçim kuralı ikisini de geçirmeli: 400 alan gerçek bildirim
    // iyzico'da üç denemeden sonra KAYBOLUR.
    const d = dunyaKur();
    const bas = Date.now() - 2 * GUN;
    const son = bas + 30 * GUN;
    const canli = d.kartSatiri('F-I13', 'SUB000913', { durum: 'AKTIF', erisimSonu: new Date(bas) });
    d.iyz.detaylar.set('SUB000913', iyzicoDetayi('SUB000913', 'ACTIVE', [
      siparis({ kod: 'ORD000913', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    const w4 = await d.webhookGonder(BASARI, 'SUB000913', 'ORD000913', {
      customerReferenceCode: undefined, iyziEventTime: undefined, iyziReferenceCode: 'IYZ0000000000000913',
    });
    const BELGE = {
      sub: 'ea0362e2-a1c4-4fda-89f0-3758a5c20a28', ord: 'ae5fcbf8-4fd2-46e5-b199-8f690ae9fae5',
      cus: 'ff4052ca-0588-40eb-81a9-848c0c409472', ref: '18d7cc48-a64b-4cd3-ae68-71aff1c76ed9', zaman: 1758704403161,
    };
    const belge = d.kartSatiri('F-I14', BELGE.sub, { durum: 'AKTIF', erisimSonu: new Date(bas) });
    d.iyz.detaylar.set(BELGE.sub, iyzicoDetayi(BELGE.sub, 'ACTIVE', [
      siparis({ kod: BELGE.ord, durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    const w6 = await d.webhookGonder(BASARI, BELGE.sub, BELGE.ord, {
      customerReferenceCode: BELGE.cus, iyziReferenceCode: BELGE.ref, iyziEventTime: BELGE.zaman,
    });
    const g = await d.isle();
    const dortAlan = ['iyziEventType', 'iyziReferenceCode', 'orderReferenceCode', 'subscriptionReferenceCode'];
    check('I10 ⭐ canlıdaki GERÇEK biçim (4 alan, müşteri kodu ve olay zamanı YOK, kodlar 9/9/19): 200, kaydedildi (müşteri kodu ve olay zamanı boş, ham gövde tam bu dört alan), İŞLENDİ — erişim dönem sonuna, fatura',
      w4.hata === null && !!w4.olay && w4.olay.musteriKodu == null && w4.olay.olayZamani == null &&
        JSON.stringify(Object.keys(w4.olay.hamGovde ?? {}).sort()) === JSON.stringify(dortAlan) &&
        w4.olay.islendi === true && canli.erisimSonu.getTime() === son && d.faturalar(canli.id).length === 1 &&
        g.hatalar.length === 0,
      `hata=${String(w4.hata)} olay=${!!w4.olay} musteri=${w4.olay?.musteriKodu} zaman=${iso(w4.olay?.olayZamani)} ` +
        `alanlar=${JSON.stringify(Object.keys(w4.olay?.hamGovde ?? {}))} islendi=${w4.olay?.islendi} ` +
        `erisimSonu=${iso(canli.erisimSonu)} ${gunlukYaz(g)}`);
    check('I10b belge ÖRNEĞİ (6 alan, UUID, olay zamanı milisaniye): 200, müşteri kodu ve olay zamanı saklandı, İŞLENDİ',
      w6.hata === null && !!w6.olay && w6.olay.musteriKodu === BELGE.cus &&
        w6.olay.olayZamani?.getTime() === BELGE.zaman && w6.olay.islendi === true &&
        belge.erisimSonu.getTime() === son && d.faturalar(belge.id).length === 1,
      `hata=${String(w6.hata)} musteri=${w6.olay?.musteriKodu} zaman=${iso(w6.olay?.olayZamani)} ` +
        `erisimSonu=${iso(belge.erisimSonu)}`);
    // Müşteri kodu isteğe bağlı ama VARSA denetlenir; boş (null/"") yok sayılır.
    const bicimsiz = await d.webhookGonder(BASARI, 'sub-i15', 'ord-i15', { customerReferenceCode: 'cus/../x' });
    const satirSonlu = await d.webhookGonder(BASARI, 'sub-i15', 'ord-i16', { customerReferenceCode: 'cus\nSAHTE SATIR' });
    const bos = await d.webhookGonder(BASARI, 'sub-i15', 'ord-i17', { customerReferenceCode: '' });
    const nul = await d.webhookGonder(BASARI, 'sub-i15', 'ord-i18', { customerReferenceCode: null });
    check('I10c müşteri kodu VARSA biçimi denetlenir (yol karakteri, satır sonu → 400, kayıt yok); boş dize ve null yok sayılır (200, sütun boş)',
      durum400(bicimsiz.hata) && !bicimsiz.olay && durum400(satirSonlu.hata) && !satirSonlu.olay &&
        bos.hata === null && !!bos.olay && bos.olay.musteriKodu == null &&
        nul.hata === null && !!nul.olay && nul.olay.musteriKodu == null,
      JSON.stringify([bicimsiz, satirSonlu, bos, nul].map((x) => [String(x.hata), !!x.olay, x.olay?.musteriKodu ?? null])));
  }

  console.log('\n── I · gövde tavanı: webhook yolunda 16 KB (global 50 MB değil) — gerçek HTTP, gerçek denetleyici ──');
  {
    const db = bellekPrisma();
    const config = new ConfigService({ IYZICO_MERCHANT_ID: IMZA_AYARI.merchantId, IYZICO_SECRET_KEY: IMZA_AYARI.secretKey });
    @Module({
      controllers: [IyzicoWebhookController],
      providers: [
        { provide: PrismaService, useValue: db.prisma },
        { provide: WebhookIsleyici, useValue: { kuyrugaAl: () => undefined } },
        { provide: ConfigService, useValue: config },
      ],
    })
    class TavanModulu {}
    const app = await NestFactory.create<NestExpressApplication>(TavanModulu, { logger: false });
    // main.ts SIRASI: yol başı tavan ÖNCE, global ayrıştırıcılar SONRA.
    govdeSinirlariniKur(app);
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));
    app.setGlobalPrefix('api');
    await app.listen(0);
    const port = (app.getHttpServer().address() as { port: number }).port;
    const govde = (dolgu: number) =>
      JSON.stringify({
        orderReferenceCode: 'ord-i13', customerReferenceCode: 'cus-i13', subscriptionReferenceCode: 'sub-i13',
        iyziReferenceCode: `iyz-i13-${dolgu}`, iyziEventType: BASARI, iyziEventTime: Date.now(), dolgu: 'x'.repeat(dolgu),
      });
    const gonder = async (b: string, tur = 'application/json') =>
      (await fetch(`http://127.0.0.1:${port}/api/webhook/iyzico/abonelik`, {
        method: 'POST', headers: { 'content-type': tur }, body: b,
      })).status;
    try {
      const kucuk = await gonder(govde(100));
      const buyuk = await gonder(govde(20_000));
      const form = await gonder(`a=${'x'.repeat(20_000)}`, 'application/x-www-form-urlencoded');
      check('I9 ⭐ gövde tavanı: 1 KB bildirim 200 (kaydedildi); 20 KB JSON ve 20 KB form 413 (global 50 MB değil)',
        kucuk === 200 && buyuk === 413 && form === 413 && db.tablo('webhookOlayi').length === 1,
        `kucuk=${kucuk} buyuk=${buyuk} form=${form} satir=${db.tablo('webhookOlayi').length}`);
    } finally {
      await app.close();
    }
  }
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nWEBHOOK TAHSİLAT DOĞRULAMA: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  sBlogu();
  await oBlogu();
  await bBlogu();
  await fBlogu();
  await dBlogu();
  await tBlogu();
  await rBlogu();
  await iBlogu();
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
