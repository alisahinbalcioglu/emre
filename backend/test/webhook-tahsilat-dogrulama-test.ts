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
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  tahsilatBasarisizligiKarari,
} from '../src/ozellik/odeme/iyzico/tahsilat-kaniti';
import { SatinAlmaServisi, donemTarihleriHesapla } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { IyzicoWebhookController } from '../src/ozellik/odeme/webhook/webhook.controller';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import type { AbonelikWebhookGovdesi } from '../src/ozellik/odeme/iyzico/imza';

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

function dunyaKur() {
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
  // `IYZICO_IMZA_ZORUNLU` BİLEREK yok: üretimdeki varsayılan (imza zorunlu değil).
  const config = new ConfigService({
    UYGULAMA_URL: 'https://ornek.test',
    IYZICO_MERCHANT_ID: 'mid-test',
    IYZICO_SECRET_KEY: 'sk-test',
  });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const fatura = new FaturaServisi(db.prisma, MUHASEBE_YASAK, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning);
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
   * iyzico'nun (ya da sahtecinin) gönderdiği gövde, GERÇEK denetleyiciden:
   * imza başlığı YOK (üretimde özellik kapalı). Kaydedilen olay döner.
   */
  let refSayac = 0;
  async function webhookGonder(
    tip: AbonelikWebhookGovdesi['iyziEventType'],
    abonelikKodu: string,
    siparisKodu: string,
    ek: Record<string, unknown> = {},
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
    const gunluk = await gunluguTopla(() => controller.abonelik(govde, undefined));
    const olay = db.tablo('webhookOlayi').find((o) => o.iyzicoRefKodu === govde.iyziReferenceCode) as Satir;
    return { olay, gunluk };
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
    db, iyz, giden, abonelik, dunning, isleyici, mutabakat, erisim, satinAlma, kuyruk,
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
    check('T3 ⭐ İPTAL dalı: endDate rakam-dizesi, sayı hâliyle AYNI sonucu verdi (IPTAL, aynı erisimSonu)',
      dize.durum === 'IPTAL' && sayi.durum === 'IPTAL' && Number.isFinite(dize.erisimSonu.getTime()) &&
        dize.erisimSonu.getTime() === sayi.erisimSonu.getTime(),
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
  son();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
