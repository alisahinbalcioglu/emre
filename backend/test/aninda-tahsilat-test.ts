/**
 * KART GÜNCELLENİNCE BEKLEYEN ÖDEMEYİ HEMEN DENE  (`npm run test:aninda-tahsilat`) · 26.09.2026
 *
 * AĞ/DB/SMTP GEREKTİRMEZ. GERÇEK `DunningServisi` (anlık deneme + merdiven),
 * `AbonelikServisi`, `FaturaServisi` ve `WebhookIsleyici` bellek-Prisma üzerinde
 * koşar. Bellek-Prisma `where`i GERÇEKTEN uygular (OR, koşullu `updateMany`),
 * tekillik kısıtlarını (P2002) taşır, bilmediği operatörde/anahtarda PATLAR.
 * iyzico sahtedir: abonelik detayı (her çağrıda TAZE kopya) + yeniden deneme
 * (PARA ÇEKEN çağrı — her çağrı sayılır). Posta sahtedir: giden her iletiyi kaydeder.
 *
 * ── KARAR (Emre, 26.09) ───────────────────────────────────────────────────
 * 25.09'da kart güncellemesi bekleyen ödemeyi ÇEKMİYORDU: yeniden deneme yalnız
 * dunning merdiveninde (3./7./20. gün), ASKIDA'da hiç. Artık kart dönüşü oturumlu
 * `POST /abonelik/odeme-tekrar-dene`yi çağırır → `DunningServisi.anindaDene`.
 *
 * ── ÖLÇÜLEN RİSK: ÇİFT ÇEKİM ──────────────────────────────────────────────
 * iyzico'nun yeniden denemesi POST'tur ve para çeker. Çift tık, sayfa yenileme
 * ve aynı anda koşan merdiven ikinci çağrıyı gönderirse müşteri iki kez ödeyebilir.
 * KİRA (`Abonelik.tahsilatKirasi`): iki yol da iyzico'ya gitmeden ÖNCE kirayı
 * KOŞULLU yazar; kaybeden iyzico'ya GİTMEZ. Kira UZUN alınır, yalnız kesin retde
 * kısalır (para çeken çağrıdan sonraki yazım düşerse hata tarafı "bekle"dir).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  saf: hedef sipariş (bildirim kanıt değil — iyzico listesi karar verir),
 *      hata sınıfı (yalnız kodlu iyzico reddi kesin ret), ön koşul (ASKIDA dahil)
 *   A  anlık yol, tek çağrı: alındı · iletildi · reddedildi · belirsiz (zaman
 *      aşımı, kopan bağlantı) · gerekmiyor · sahte bildirim · ödenmiş aday ·
 *      doğrulanamadı · iyzico okunamadı; kira süresi her sonuçta ÖLÇÜLÜR
 *   T  TAM BİR KEZ: sıralı yenileme · eşzamanlı çift tık (İKİ sırada) · ret
 *      sonrası kısa kira (başka kartla yeniden) · belirsiz sonrası uzun kira
 *   M  merdivenle AYNI kira: aktif kirada basamak yarına (ne çekim ne bildirim) ·
 *      merdiven kirayı alır · merdiven + anlık eşzamanlı → tek çekim · merdivenin
 *      reti kirayı kısaltır · zaman aşımı ertelemesi korunur
 *   E  uçtan uca başarı: anlık denemenin kuyruğa yazdığı olay GERÇEK işleyicide →
 *      AKTİF + tam BİR "ödemeniz alındı"; iyzico'nun kendi webhook'u da gelince
 *      yine TEK e-posta, TEK fatura satırı
 *   C  uç BAĞLANTISI: oturumlu, sahip, hız sınırlı; controller servise firmayı verir
 *   P  dunning metinleri gerçeği söyler: kart güncellenince ödeme hemen denenir
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { ANINDA_DENEME_KAYNAGI, DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { DUNNING_METINLERI } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import {
  KIRA_RET_MS,
  KIRA_SONUC_MS,
  anindaDenemeEngeli,
  denemeHatasiSinifi,
} from '../src/ozellik/odeme/dunning/tahsilat-kirasi';
import { yenidenDenemeHedefi } from '../src/ozellik/odeme/iyzico/tahsilat-kaniti';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';
import { tekilAnahtarUret } from '../src/ozellik/odeme/iyzico/imza';
import { FIRMA_ROL_KEY } from '../src/altyapi/auth/decorators/firma-rolu.decorator';
import { FirmaRolGuard } from '../src/altyapi/auth/guards/firma-rol.guard';
import { KullaniciHizSiniriGuard } from '../src/altyapi/auth/guards/kullanici-hiz-siniri.guard';
import { ucEnvanteri } from './yardimci/uc-envanteri';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
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

// Nest günlüğü gürültüsü kapalı; AT_GUNLUK=1 ile açılır.
if (!process.env.AT_GUNLUK) Logger.overrideLogger(false);

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
const BASARILI = 'subscription.order.success';
const BASARISIZ = 'subscription.order.failure';
const KONU_ALINDI = DUNNING_METINLERI.toparlandi({ firmaAdi: '-', paketAdi: '-', tutar: '-' }).konu;

type Gunluk = { kayitlar: string[]; uyarilar: string[]; hatalar: string[] };

/** Günlüğü TOPLAR — işleyici ve servis hataları yutup yalnız günlüğe yazar. */
async function gunluguTopla<T>(is: () => Promise<T>): Promise<{ sonuc: T; g: Gunluk }> {
  const g: Gunluk = { kayitlar: [], uyarilar: [], hatalar: [] };
  const bos = () => undefined;
  Logger.overrideLogger({
    log: (m: unknown) => { g.kayitlar.push(String(m)); },
    warn: (m: unknown) => { g.uyarilar.push(String(m)); },
    error: (m: unknown) => { g.hatalar.push(String(m)); },
    debug: bos, verbose: bos, fatal: bos,
  });
  try {
    const sonuc = await is();
    return { sonuc, g };
  } finally {
    Logger.overrideLogger(process.env.AT_GUNLUK ? new ConsoleLogger() : false);
  }
}

const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : String(t));
/** Kira bitişi beklenen ana ±5 sn içinde mi? */
const yaklasik = (t: unknown, beklenen: number) => t instanceof Date && Math.abs(t.getTime() - beklenen) < 5_000;

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — `dunning-toparlandi-test.ts` taklidinin kira için genişletilmişi
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
};

const TEKIL: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  fatura: ['tahsilatKodu'],
  webhookOlayi: ['tekilAnahtar'],
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, tahsilatKirasi: null, iptalTalebi: null,
    iptalNedeni: null, planliPaketSurumuId: null, paketGecisTarihi: null, odenenPaketSurumuId: null,
    denemeHatirlatmasi: null, kopruErisimSonu: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ olusturuldu: new Date(), aktor: 'sistem', oncekiDurum: null, yeniDurum: null }),
  webhookOlayi: () => ({
    kaynak: 'iyzico', imzaBasligi: null, imzaGecerli: false, abonelikKodu: null, siparisKodu: null,
    musteriKodu: null, iyzicoRefKodu: null, olayZamani: null, islendi: false, islenmeZamani: null,
    denemeSayisi: 0, hata: null, alindi: new Date(),
  }),
  fatura: () => ({
    durum: 'BEKLIYOR', kdvOrani: 20, paraBirimi: 'TRY', saglayici: null, saglayiciId: null,
    faturaNo: null, faturaUrl: null, denemeSayisi: 0, sonDeneme: null, hata: null, olusturuldu: new Date(),
  }),
};

function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  for (const [op, v] of Object.entries(kosul)) {
    switch (op) {
      case 'in': if (!(v as unknown[]).includes(deger)) return false; break;
      case 'not': if (v === null ? bos : kosulUygula(deger, v)) return false; break;
      case 'lt': if (bos || !(deger < (v as any))) return false; break;
      case 'lte': if (bos || !(deger <= (v as any))) return false; break;
      case 'gt': if (bos || !(deger > (v as any))) return false; break;
      case 'gte': if (bos || !(deger >= (v as any))) return false; break;
      default: throw new Error(`bellek-Prisma: desteklenmeyen operator "${op}"`);
    }
  }
  return true;
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
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
      const x = a[alan] instanceof Date ? a[alan].getTime() : a[alan];
      const y = b[alan] instanceof Date ? b[alan].getTime() : b[alan];
      if (x === y) continue;
      return (x < y ? -1 : 1) * (yon === 'asc' ? 1 : -1);
    }
    return 0;
  });
  return kopya;
}

/** Kiraya ALMA denemesi mi? (koşullu yazım: `OR` + `tahsilatKirasi` verisi) */
const kiraAlmaMi = (model: string, arg: any) =>
  model === 'abonelik' && !!arg?.where?.OR && arg?.data && 'tahsilatKirasi' in arg.data;

/**
 * Her işlem (süzgeç + yazma) TEK adımda uygulanır — eşzamanlı süreçler işlemler
 * ARASINDA iç içe geçer, bir işlemin İÇİNDE geçemez (satır kilidinin taklidi).
 *
 * `kiraBariyeri(n, ters)`: kira ALMA denemeleri n tanesi birikene kadar BEKLER,
 * sonra hepsini aynı anda bırakır (`ters` → ters sırada). İki süreç de satırı
 * okumuş ve kira yazımının önündedir — yarış penceresinin tam modeli. Emniyet:
 * 2 sn'de birikmezse yine bırakır (kod denemeleri sıraya alırsa kapı asılı
 * kalmaz; FIXTURE varış sayısını ayrıca ölçer). Zamanlayıcı `unref`li DEĞİL.
 */
function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);
  const bariyer = {
    n: 0, ters: false, varan: 0, bekleyen: [] as Array<() => void>, emniyet: undefined as NodeJS.Timeout | undefined,
    /** Bırakmadan HEMEN önce (ör. satır arada döngüden çıkar — T5). */
    birakmadan: undefined as (() => void) | undefined,
  };

  const birak = () => {
    clearTimeout(bariyer.emniyet);
    bariyer.emniyet = undefined;
    bariyer.birakmadan?.();
    bariyer.birakmadan = undefined;
    const kuyruk = bariyer.ters ? [...bariyer.bekleyen].reverse() : bariyer.bekleyen;
    bariyer.bekleyen = [];
    bariyer.n = 0;
    kuyruk.forEach((f) => f());
  };

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
    for (const [k, v] of Object.entries(spec?.include ?? {})) if (v) sonuc[k] = iliski(k, v);
    return sonuc;
  }

  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const artir =
        v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) &&
        Object.keys(v).length === 1 && Object.keys(v)[0] === 'increment';
      hedef[k] = artir ? (hedef[k] ?? 0) + (v as any).increment : v;
    }
  }

  function tekillikDenetle(model: string, aday: Satir, haric?: Satir): void {
    for (const alan of TEKIL[model] ?? []) {
      const d = aday[alan];
      if (d === null || d === undefined) continue;
      if (tablo(model).some((r) => r !== haric && r[alan] === d)) {
        throw Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), { code: 'P2002', meta: { target: [alan] } });
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
      if (bariyer.n > 0 && kiraAlmaMi(model, arg)) {
        bariyer.varan++;
        await new Promise<void>((r) => {
          bariyer.bekleyen.push(r);
          if (bariyer.bekleyen.length >= bariyer.n) birak();
          else bariyer.emniyet ??= setTimeout(birak, 2000);
        });
      }
      // Süzgeç + yazma AYNI adımda (bekleme yok): kilitli satırın taklidi.
      const hedefler = tablo(model).filter((r) => whereUygula(r, arg.where));
      hedefler.forEach((s) => veriUygula(s, arg.data));
      return { count: hedefler.length };
    },
  });

  const prisma: any = new Proxy({}, {
    get: (_h, ad: string) => {
      if (ad === 'then') return undefined;
      if (ad === '$transaction') {
        return async (is: unknown) => {
          if (typeof is === 'function') return (is as (tx: unknown) => unknown)(prisma);
          throw new Error('bellek-Prisma: beklenmeyen $transaction bicimi');
        };
      }
      return modelYuzu(ad);
    },
  });
  return {
    prisma,
    tablo,
    ekle: (model: string, data: Satir) => olustur(model, data),
    kiraBariyeri: (n: number, ters = false, birakmadan?: () => void) => {
      bariyer.n = n; bariyer.ters = ters; bariyer.varan = 0; bariyer.birakmadan = birakmadan;
    },
    kiraVaran: () => bariyer.varan,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — abonelik detayı + PARA ÇEKEN yeniden deneme (sayılır)
// ═════════════════════════════════════════════════════════════════════════
type TekrarKipi = 'basari' | 'basari-odenmemis' | 'ret' | 'zaman-asimi' | 'kopuk';

function sahteIyzico() {
  const detaylar = new Map<string, any>();
  const sorulan: string[] = [];
  const tekrarlanan: string[] = [];
  const durum = { kip: 'basari' as TekrarKipi, getBozuk: false };

  /** Başarılı çekim: siparişi iyzico'nun listesinde ÖDENMİŞ yapar. */
  const odendi = (siparisKodu: string) => {
    for (const d of detaylar.values()) {
      const s = (d.orders ?? []).find((o: any) => o.referenceCode === siparisKodu);
      if (!s) continue;
      s.orderStatus = 'SUCCESS';
      s.paymentAttempts = [...(s.paymentAttempts ?? []), { paymentStatus: 'SUCCESS', paymentId: 99, createdDate: Date.now() }];
      d.subscriptionStatus = 'ACTIVE';
    }
  };

  return {
    detaylar, sorulan, tekrarlanan, durum,
    istemci: {
      abonelikGetir: async (kod: string) => {
        await Promise.resolve();
        sorulan.push(kod);
        if (durum.getBozuk) throw new IyzicoHatasi(undefined, 'iyzico yanıt vermedi (zaman aşımı, 20 sn)', undefined, true);
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return JSON.parse(JSON.stringify(d));
      },
      tahsilatiTekrarla: async (siparisKodu: string) => {
        await Promise.resolve();
        tekrarlanan.push(siparisKodu);
        switch (durum.kip) {
          case 'basari': odendi(siparisKodu); return { status: 'success' };
          case 'basari-odenmemis': return { status: 'success' };
          case 'ret': throw new IyzicoHatasi('10051', 'Kart limiti yetersiz', 400);
          case 'zaman-asimi': throw new IyzicoHatasi(undefined, 'iyzico yanıt vermedi (zaman aşımı, 20 sn)', undefined, true);
          case 'kopuk': throw new TypeError('fetch failed');
        }
      },
    } as any,
  };
}

/** Sipariş — 20.08 sandbox tutanağındaki biçim (epoch-ms dönem, `paymentAttempts[].paymentStatus`). */
function siparis(kod: string, bas: number, son: number, denemeler: string[], durum: string) {
  return {
    referenceCode: kod, price: 1649, currencyCode: 'TRY', startPeriod: bas, endPeriod: son, orderStatus: durum,
    paymentAttempts: denemeler.map((s, i) => ({ conversationId: `c-${kod}-${i}`, createdDate: bas + i * GUN + DK, paymentId: 1000 + i, paymentStatus: s })),
  };
}

const MUHASEBE_YASAK = { faturaKes: async () => { throw new Error('bu kapida fatura KESILMEZ'); } } as any;

interface Giden { kime: string; konu: string }

function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  const giden: Giden[] = [];
  const posta = { gonder: async (t: Giden) => { giden.push({ kime: t.kime, konu: t.konu }); } } as any;
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro Mekanik', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', {
    id: 'S30', paketId: 'P1', surumNo: 1, periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-30', iyzicoDenemesizPlanKodu: 'plan-30-d', satistaMi: true,
  });
  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const fatura = new FaturaServisi(db.prisma, MUHASEBE_YASAK, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning, posta);

  /**
   * Dunning döngüsündeki KART satırı + iyzico detayı. Geçen ay ödenmiş sipariş
   * `<kod>-1`; bu ayın siparişi `<kod>-2` reddedildi (abonelik UNPAID, denemesi
   * FAILURE) ve başarısızlık bildirimi işlendi — merdivenin başlattığı hâl.
   */
  function dunningSatiri(firmaId: string, p: { durum?: string; gunOnce?: number; denemeSayisi?: number; alanlar?: Satir } = {}) {
    const kod = `sub-${firmaId}`;
    const simdi = Date.now();
    const ilk = simdi - (p.gunOnce ?? 12) * GUN;
    db.ekle('firma', {
      id: firmaId, ad: `Firma ${firmaId}`, unvan: `${firmaId} Tesisat Ltd. Şti.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', tcKimlikNo: null, faturaAdresi: 'Moda Cad. 1', il: 'İstanbul', ilce: 'Kadıköy',
      faturaEposta: `muhasebe@${firmaId.toLowerCase()}.test`, yetkiliEposta: `sahip@${firmaId.toLowerCase()}.test`, imhaTarihi: null,
    });
    const ab = db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S30', odemeYontemi: 'KART', iyzicoAbonelikKodu: kod, iyzicoKokKodu: kod,
      iyzicoMusteriKodu: `cus-${kod}`, iyzicoDurum: 'UNPAID', durum: p.durum ?? 'KISITLI',
      erisimSonu: new Date(ilk), ilkBasarisizlik: new Date(ilk), denemeSayisi: p.denemeSayisi ?? 4,
      sonDeneme: new Date(ilk), kisitlandi: (p.durum ?? 'KISITLI') === 'ODEME_BEKLIYOR' ? null : new Date(ilk + 10 * GUN),
      ...(p.alanlar ?? {}),
    });
    iyz.detaylar.set(kod, {
      referenceCode: kod, pricingPlanReferenceCode: 'plan-30', customerReferenceCode: `cus-${kod}`,
      subscriptionStatus: 'UNPAID',
      orders: [
        siparis(`${kod}-1`, ilk - 30 * GUN, ilk, ['SUCCESS'], 'SUCCESS'),
        siparis(`${kod}-2`, ilk, ilk + 30 * GUN, ['FAILURE'], 'WAITING'),
      ],
    });
    olay(BASARISIZ, kod, `${kod}-2`, ilk + DK, true);
    return { ab, kod, hedef: `${kod}-2`, yeniSon: ilk + 30 * GUN };
  }

  /** Webhook olayı — controller'ın yazdığı biçim (tekil anahtar GERÇEK `tekilAnahtarUret`ten). */
  function olay(tip: string, kod: string, siparisKodu: string, alindi: number, islendi = false) {
    const iyziReferenceCode = `iyz-${siparisKodu}-${tip === BASARILI ? 'b' : 'f'}-${alindi}`;
    return db.ekle('webhookOlayi', {
      tekilAnahtar: tekilAnahtarUret({ iyziEventType: tip, iyziReferenceCode } as any),
      olayTipi: tip, hamGovde: { iyziEventType: tip, subscriptionReferenceCode: kod, orderReferenceCode: siparisKodu },
      abonelikKodu: kod, siparisKodu, musteriKodu: `cus-${kod}`, iyzicoRefKodu: iyziReferenceCode,
      alindi: new Date(alindi), islendi,
    });
  }

  const satir = (id: string) => db.tablo('abonelik').find((a) => a.id === id)!;
  const olaylar = (abonelikId: string, tip: string) => db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === tip);
  const kuyruk = () => db.tablo('webhookOlayi').filter((o) => o.kaynak === ANINDA_DENEME_KAYNAGI);
  const alindiPostasi = () => giden.filter((g) => g.konu.includes('alındı'));

  return { db, iyz, giden, dunning, isleyici, dunningSatiri, olay, satir, olaylar, kuyruk, alindiPostasi };
}

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURALLAR
// ═════════════════════════════════════════════════════════════════════════
function sBlogu(): void {
  console.log('\n── S · saf: hedef sipariş, hata sınıfı, ön koşul ──');
  const bas = Date.now() - 10 * GUN;
  const detay = (siparisler: unknown[], durum = 'UNPAID') => ({ subscriptionStatus: durum, orders: siparisler });
  const odenmis = siparis('o-1', bas - 30 * GUN, bas, ['SUCCESS'], 'SUCCESS');
  const reddedilmis = siparis('o-2', bas, bas + 30 * GUN, ['FAILURE'], 'WAITING');
  const denenmemis = siparis('o-3', bas, bas + 30 * GUN, [], 'WAITING');

  const h1 = yenidenDenemeHedefi(detay([odenmis, reddedilmis]), ['o-2', 'o-1']);
  check('S1 ⭐ reddi doğrulanan en yeni aday DENENİR', h1.tur === 'dene' && h1.kod === 'o-2', JSON.stringify(h1));
  const h2 = yenidenDenemeHedefi(detay([odenmis, reddedilmis]), ['sahte-9', 'o-2']);
  check('S2 ⭐ listede OLMAYAN (sahte) bildirim atlanır, gerçek sipariş seçilir', h2.tur === 'dene' && h2.kod === 'o-2', JSON.stringify(h2));
  const h3 = yenidenDenemeHedefi(detay([odenmis]), ['o-1']);
  check('S3 ⭐ en yeni aday iyzico\'da ÖDENMİŞ → yeniden ÇEKİLMEZ (odenmis)', h3.tur === 'odenmis' && h3.kod === 'o-1', JSON.stringify(h3));
  const h4 = yenidenDenemeHedefi(detay([denenmemis], 'ACTIVE'), ['o-3']);
  check('S4 listede ödenmemiş ama ret KANITI yok (ACTIVE, denemesiz WAITING) → para çekilmez', h4.tur === 'yok', JSON.stringify(h4));
  const h5 = yenidenDenemeHedefi(detay([odenmis]), ['sahte-1', 'sahte-2']);
  check('S5 hiçbir aday listede değil → yok', h5.tur === 'yok', JSON.stringify(h5));
  const h6 = yenidenDenemeHedefi(detay([siparis('o-4', bas, bas + GUN, [], 'FAILED')], 'ACTIVE'), ['o-4']);
  check('S6 orderStatus FAILED da ret kanıtıdır (abonelik ACTIVE iken)', h6.tur === 'dene', JSON.stringify(h6));

  const sinif = [
    denemeHatasiSinifi(new IyzicoHatasi('10051', 'Kart limiti yetersiz', 400)),
    denemeHatasiSinifi(new IyzicoHatasi(undefined, 'zaman aşımı', undefined, true)),
    denemeHatasiSinifi(new IyzicoHatasi(undefined, 'iyzico yanıtı çözümlenemedi (HTTP 502)', 502)),
    denemeHatasiSinifi(new TypeError('fetch failed')),
    denemeHatasiSinifi(new Error('bilinmeyen')),
  ];
  check('S7 ⭐ yalnız KODLU iyzico reddi kesin ret; zaman aşımı, kodsuz, kopuk bağlantı BELİRSİZ',
    JSON.stringify(sinif) === JSON.stringify(['reddedildi', 'belirsiz', 'belirsiz', 'belirsiz', 'belirsiz']), JSON.stringify(sinif));

  const simdi = new Date();
  const dongu = (durum: string, gun = 12) => ({ durum, ilkBasarisizlik: new Date(simdi.getTime() - gun * GUN) });
  const engeller = [
    anindaDenemeEngeli(dongu('ODEME_BEKLIYOR'), true, simdi),
    anindaDenemeEngeli(dongu('KISITLI'), true, simdi),
    anindaDenemeEngeli(dongu('ASKIDA', 40), true, simdi),
  ];
  check('S8 ⭐ ödeme bekleyen üç durumda denenebilir — ASKIDA DAHİL (merdiven orada artık denemiyor)',
    engeller.every((e) => e === null), JSON.stringify(engeller));
  const retler = [
    anindaDenemeEngeli(null, false, simdi),
    anindaDenemeEngeli(dongu('KISITLI'), false, simdi),
    anindaDenemeEngeli({ durum: 'AKTIF', ilkBasarisizlik: null }, true, simdi),
    anindaDenemeEngeli({ durum: 'KISITLI', ilkBasarisizlik: null }, true, simdi),
    anindaDenemeEngeli(dongu('ASKIDA', 161), true, simdi),
  ];
  check('S9 satır yok · kart kapalı/havale · döngü dışı · iz yok · 160 gün doldu → engel',
    JSON.stringify(retler) === JSON.stringify(['ABONELIK_YOK', 'KART_ABONELIGI_DEGIL', 'BEKLEYEN_ODEME_YOK', 'BEKLEYEN_ODEME_YOK', 'PENCERE_DOLDU']),
    JSON.stringify(retler));
}

// ═════════════════════════════════════════════════════════════════════════
//  A — ANLIK YOL, TEK ÇAĞRI
// ═════════════════════════════════════════════════════════════════════════
async function aBlogu(): Promise<void> {
  console.log('\n── A · anlık yol: her sonuç, kira süresi, iz ──');
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A1');
    const t0 = Date.now();
    const { sonuc, g } = await gunluguTopla(() => d.dunning.anindaDene('F-A1'));
    const ab = d.satir(s.ab.id);
    check('A1 ⭐ KISITLI: iyzico siparişi ödenmiş gösteriyor → "alindi", TEK çekim DOĞRULANAN siparişe',
      sonuc.sonuc === 'alindi' && d.iyz.tekrarlanan.length === 1 && d.iyz.tekrarlanan[0] === s.hedef,
      `sonuc=${JSON.stringify(sonuc)} cekim=${JSON.stringify(d.iyz.tekrarlanan)}`);
    check('A1b kira UZUN kalır (sonucu işleniyor) — bugün ikinci çekim yok', yaklasik(ab.tahsilatKirasi, t0 + KIRA_SONUC_MS), iso(ab.tahsilatKirasi));
    const k = d.kuyruk();
    check('A1c başarı yolu kuyruğa yazıldı: tek olay, sipariş, tekil anahtar, işlenmemiş',
      k.length === 1 && k[0].siparisKodu === s.hedef && k[0].olayTipi === BASARILI && k[0].islendi === false &&
        k[0].tekilAnahtar === `${ANINDA_DENEME_KAYNAGI}:${BASARILI}:${s.hedef}`, JSON.stringify(k.map((x) => x.tekilAnahtar)));
    check('A1d anlık yol E-POSTA GÖNDERMEZ (e-posta başarı yolunun işi)', d.giden.length === 0, JSON.stringify(d.giden));
    check('A1e iz: dunning.aninda.denendi olayı + günlük temiz',
      d.olaylar(s.ab.id, 'dunning.aninda.denendi').length === 1 && g.hatalar.length === 0, JSON.stringify(g.hatalar));
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A2', { durum: 'ASKIDA', gunOnce: 40, denemeSayisi: 6 });
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A2'));
    check('A2 ⭐ ASKIDA da denenir (merdivenin artık denemediği yer) → "alindi"',
      sonuc.sonuc === 'alindi' && d.iyz.tekrarlanan.length === 1 && d.satir(s.ab.id).durum === 'ASKIDA', JSON.stringify(sonuc));
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A3');
    d.iyz.durum.kip = 'basari-odenmemis';
    const t0 = Date.now();
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A3'));
    check('A3 ⭐ iyzico "success" dedi ama sipariş ödenmiş GÖRÜNMÜYOR → "iletildi" (alındı DENMEZ), kuyruğa yazılmaz, kira uzun',
      sonuc.sonuc === 'iletildi' && d.kuyruk().length === 0 && yaklasik(d.satir(s.ab.id).tahsilatKirasi, t0 + KIRA_SONUC_MS),
      `sonuc=${JSON.stringify(sonuc)} kuyruk=${d.kuyruk().length}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A4');
    d.iyz.durum.kip = 'ret';
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A4'));
    const t1 = Date.now();
    check('A4 ⭐ kart reddetti → "reddedildi" + iyzico\'nun kendi iletisi ve kodu',
      sonuc.sonuc === 'reddedildi' && (sonuc as any).mesaj === 'Kart limiti yetersiz (iyzico kodu: 10051)', JSON.stringify(sonuc));
    check('A4b kesin ret: kira KISALIR (başka kartla yeniden denenebilsin)', yaklasik(d.satir(s.ab.id).tahsilatKirasi, t1 + KIRA_RET_MS),
      iso(d.satir(s.ab.id).tahsilatKirasi));
    check('A4c iz: dunning.aninda.reddedildi; kuyruğa yazılmadı', d.olaylar(s.ab.id, 'dunning.aninda.reddedildi').length === 1 && d.kuyruk().length === 0);
  }
  for (const [kip, ad] of [['zaman-asimi', 'zaman aşımı'], ['kopuk', 'kopan bağlantı (kodsuz)']] as const) {
    const d = dunyaKur();
    const s = d.dunningSatiri(`F-A5-${kip}`);
    d.iyz.durum.kip = kip;
    const t0 = Date.now();
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene(`F-A5-${kip}`));
    check(`A5 ⭐ ${ad} → "belirsiz"; kira UZUN (iyzico çekmiş olabilir), kuyruk yok, iz belirsiz`,
      sonuc.sonuc === 'belirsiz' && yaklasik(d.satir(s.ab.id).tahsilatKirasi, t0 + KIRA_SONUC_MS) && d.kuyruk().length === 0 &&
        d.olaylar(s.ab.id, 'dunning.aninda.belirsiz').length === 1,
      `sonuc=${JSON.stringify(sonuc)} kira=${iso(d.satir(s.ab.id).tahsilatKirasi)}`);
  }
  {
    const d = dunyaKur();
    const aktif = d.dunningSatiri('F-A6', { durum: 'AKTIF', alanlar: { ilkBasarisizlik: null, denemeSayisi: 0 } });
    const havale = d.dunningSatiri('F-A6h', { durum: 'ASKIDA', alanlar: { odemeYontemi: 'HAVALE' } });
    const iptal = d.dunningSatiri('F-A6i', { alanlar: { iptalTalebi: new Date() } });
    const sonuclar = [];
    for (const f of ['F-A6', 'F-A6h', 'F-A6i', 'F-YOK']) sonuclar.push((await gunluguTopla(() => d.dunning.anindaDene(f))).sonuc.sonuc);
    check('A6 bekleyen ödeme yok (AKTİF · havale · iptal talepli · satırsız) → "gerekmiyor"; iyzico\'ya HİÇ gidilmez, kira dokunulmaz',
      sonuclar.every((x) => x === 'gerekmiyor') && d.iyz.sorulan.length === 0 && d.iyz.tekrarlanan.length === 0 &&
        [aktif, havale, iptal].every((x) => d.satir(x.ab.id).tahsilatKirasi === null),
      `sonuc=${JSON.stringify(sonuclar)} sorulan=${d.iyz.sorulan.length} cekim=${d.iyz.tekrarlanan.length}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A7');
    d.olay(BASARISIZ, s.kod, 'sahte-siparis', Date.now() - DK, true); // EN YENİ bildirim sahte
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A7'));
    check('A7 ⭐ en yeni bildirim SAHTE (listede yok) → atlanır, çekim GERÇEK siparişe',
      sonuc.sonuc === 'alindi' && JSON.stringify(d.iyz.tekrarlanan) === JSON.stringify([s.hedef]), JSON.stringify(d.iyz.tekrarlanan));
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A8');
    // Başarının webhook'u gelmemiş: iyzico siparişi ZATEN ödenmiş gösteriyor.
    const det = d.iyz.detaylar.get(s.kod);
    det.orders[1] = siparis(s.hedef, Date.now() - 12 * GUN, Date.now() + 18 * GUN, ['FAILURE', 'SUCCESS'], 'SUCCESS');
    det.subscriptionStatus = 'ACTIVE';
    const t0 = Date.now();
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A8'));
    check('A8 ⭐ hedef ZATEN ödenmiş → "alindi" ama ÇEKİM YOK; başarı yolu kuyrukta, kira uzun',
      sonuc.sonuc === 'alindi' && d.iyz.tekrarlanan.length === 0 && d.kuyruk().length === 1 &&
        yaklasik(d.satir(s.ab.id).tahsilatKirasi, t0 + KIRA_SONUC_MS),
      `sonuc=${JSON.stringify(sonuc)} cekim=${d.iyz.tekrarlanan.length} kuyruk=${d.kuyruk().length}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A9');
    const det = d.iyz.detaylar.get(s.kod);
    det.subscriptionStatus = 'ACTIVE';
    det.orders[1] = siparis(s.hedef, Date.now(), Date.now() + 30 * GUN, [], 'WAITING');
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A9'));
    check('A9 ret DOĞRULANAMADI (ACTIVE, denemesiz WAITING) → "yapilamadi", çekim yok, kira GERİ VERİLİR',
      sonuc.sonuc === 'yapilamadi' && d.iyz.tekrarlanan.length === 0 && d.satir(s.ab.id).tahsilatKirasi === null,
      `sonuc=${JSON.stringify(sonuc)} kira=${iso(d.satir(s.ab.id).tahsilatKirasi)}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A10');
    d.iyz.durum.getBozuk = true;
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A10'));
    check('A10 iyzico okunamadı → "yapilamadi", çekim yok, kira GERİ VERİLİR (hemen yeniden denenebilir)',
      sonuc.sonuc === 'yapilamadi' && d.iyz.tekrarlanan.length === 0 && d.satir(s.ab.id).tahsilatKirasi === null, JSON.stringify(sonuc));
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-A11');
    d.db.tablo('webhookOlayi').length = 0; // bildirim hiç yok
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-A11'));
    check('A11 başarısızlık bildirimi yok → "yapilamadi"; iyzico\'ya gidilmez, kira dokunulmaz',
      sonuc.sonuc === 'yapilamadi' && d.iyz.sorulan.length === 0 && d.satir(s.ab.id).tahsilatKirasi === null, JSON.stringify(sonuc));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  T — TAM BİR KEZ
// ═════════════════════════════════════════════════════════════════════════
async function tBlogu(): Promise<void> {
  console.log('\n── T · tam bir kez: yenileme, eşzamanlı çift tık (iki sıra), ret ve belirsiz sonrası ──');
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-T1');
    await gunluguTopla(() => d.dunning.anindaDene('F-T1'));
    const ikinci = (await gunluguTopla(() => d.dunning.anindaDene('F-T1'))).sonuc;
    check('T1 ⭐ sıralı yenileme: ikinci çağrı "zaten-deneniyor" (kira bitişiyle), TEK çekim',
      ikinci.sonuc === 'zaten-deneniyor' && (ikinci as any).kiraBitis === iso(d.satir(s.ab.id).tahsilatKirasi) &&
        d.iyz.tekrarlanan.length === 1, `ikinci=${JSON.stringify(ikinci)} cekim=${d.iyz.tekrarlanan.length}`);
  }
  for (const ters of [false, true]) {
    const d = dunyaKur();
    d.dunningSatiri('F-T2');
    d.db.kiraBariyeri(2, ters);
    const [a, b] = await Promise.all([
      gunluguTopla(() => d.dunning.anindaDene('F-T2')),
      gunluguTopla(() => d.dunning.anindaDene('F-T2')),
    ]);
    const sonuclar = [a.sonuc.sonuc, b.sonuc.sonuc].sort();
    check(`T2-FIXTURE (${ters ? 'ters' : 'düz'} sıra) iki çağrı da kiraya ULAŞTI — yarış gerçekten kuruldu`, d.db.kiraVaran() === 2,
      `varan=${d.db.kiraVaran()}`);
    check(`T2 ⭐⭐ eşzamanlı çift tık (${ters ? 'ters' : 'düz'} sıra): TEK çekim; biri sonuç, öteki "zaten-deneniyor"`,
      d.iyz.tekrarlanan.length === 1 && JSON.stringify(sonuclar) === JSON.stringify(['alindi', 'zaten-deneniyor']),
      `cekim=${d.iyz.tekrarlanan.length} sonuclar=${JSON.stringify(sonuclar)}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-T3');
    d.iyz.durum.kip = 'ret';
    await gunluguTopla(() => d.dunning.anindaDene('F-T3'));
    const hemen = (await gunluguTopla(() => d.dunning.anindaDene('F-T3'))).sonuc;
    check('T3 ret sonrası kısa kira içinde yeniden istek → "zaten-deneniyor", çekim yok',
      hemen.sonuc === 'zaten-deneniyor' && d.iyz.tekrarlanan.length === 1, JSON.stringify(hemen));
    d.satir(s.ab.id).tahsilatKirasi = new Date(Date.now() - 1000); // 10 dk geçti
    d.iyz.durum.kip = 'basari';
    const sonra = (await gunluguTopla(() => d.dunning.anindaDene('F-T3'))).sonuc;
    check('T3b ⭐ kısa kira bitince (başka kart girildi) yeniden denenir → "alindi", toplam 2 çekim (ilki reddedilmişti)',
      sonra.sonuc === 'alindi' && d.iyz.tekrarlanan.length === 2, JSON.stringify(sonra));
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-T4');
    d.iyz.durum.kip = 'zaman-asimi';
    await gunluguTopla(() => d.dunning.anindaDene('F-T4'));
    d.iyz.durum.kip = 'basari';
    const ikinci = (await gunluguTopla(() => d.dunning.anindaDene('F-T4'))).sonuc;
    const kalan = d.satir(s.ab.id).tahsilatKirasi.getTime() - Date.now();
    check('T4 ⭐ belirsiz sonrası yenileme → "zaten-deneniyor", TEK çekim; kira 19 saatten uzun',
      ikinci.sonuc === 'zaten-deneniyor' && d.iyz.tekrarlanan.length === 1 && kalan > 19 * SAAT,
      `ikinci=${JSON.stringify(ikinci)} kalanSa=${(kalan / SAAT).toFixed(1)}`);
  }
  {
    // Satır okunduktan SONRA ödeme işlendi (webhook sayaçları sıfırladı): kira
    // yalnız dunning döngüsündeki satıra yazılır — ödenmiş satıra çekim GİTMEZ.
    const d = dunyaKur();
    const s = d.dunningSatiri('F-T5');
    d.db.kiraBariyeri(1, false, () => {
      const ab = d.satir(s.ab.id);
      ab.durum = 'AKTIF';
      ab.ilkBasarisizlik = null;
      ab.denemeSayisi = 0;
    });
    const { sonuc } = await gunluguTopla(() => d.dunning.anindaDene('F-T5'));
    check('T5-FIXTURE kiraya ulaşıldı ve satır o anda döngüden çıktı', d.db.kiraVaran() === 1 && d.satir(s.ab.id).ilkBasarisizlik === null);
    check('T5 ⭐ okunduktan sonra ödenen satır: kira ALINMAZ, çekim YOK, "gerekmiyor"',
      sonuc.sonuc === 'gerekmiyor' && d.iyz.tekrarlanan.length === 0 && d.satir(s.ab.id).tahsilatKirasi === null,
      `sonuc=${JSON.stringify(sonuc)} cekim=${d.iyz.tekrarlanan.length} kira=${iso(d.satir(s.ab.id).tahsilatKirasi)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  M — MERDİVENLE AYNI KİRA
// ═════════════════════════════════════════════════════════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · merdiven aynı kirayı alır ──');
  const ucuncuGun = { durum: 'ODEME_BEKLIYOR', gunOnce: 3.5, denemeSayisi: 1 }; // 3. gün basamağı: yeniden dene
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-M1', { ...ucuncuGun, alanlar: { tahsilatKirasi: new Date(Date.now() + 5 * SAAT) } });
    const { g } = await gunluguTopla(() => d.dunning.merdiveniYurut());
    const ab = d.satir(s.ab.id);
    check('M1 ⭐ aktif kira (müşteri az önce denedi) → merdiven bugün DOKUNMAZ: çekim yok, e-posta yok, basamak işlenmedi',
      d.iyz.tekrarlanan.length === 0 && d.giden.length === 0 && ab.denemeSayisi === 1 &&
        g.kayitlar.some((m) => m.includes('yarına')), `cekim=${d.iyz.tekrarlanan.length} posta=${d.giden.length} deneme=${ab.denemeSayisi}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-M2', ucuncuGun);
    const t0 = Date.now();
    await gunluguTopla(() => d.dunning.merdiveniYurut());
    check('M2 kira yokken merdiven dener ve KİRAYI ALIR (başarılı → uzun)',
      d.iyz.tekrarlanan.length === 1 && yaklasik(d.satir(s.ab.id).tahsilatKirasi, t0 + KIRA_SONUC_MS),
      `cekim=${d.iyz.tekrarlanan.length} kira=${iso(d.satir(s.ab.id).tahsilatKirasi)}`);
    const anlik = (await gunluguTopla(() => d.dunning.anindaDene('F-M2'))).sonuc;
    check('M2b merdivenin denemesinden hemen sonra müşteri → "zaten-deneniyor", ikinci çekim yok',
      anlik.sonuc === 'zaten-deneniyor' && d.iyz.tekrarlanan.length === 1, JSON.stringify(anlik));
  }
  for (const ters of [false, true]) {
    const d = dunyaKur();
    d.dunningSatiri('F-M3', ucuncuGun);
    d.db.kiraBariyeri(2, ters);
    const [anlik] = await Promise.all([
      gunluguTopla(() => d.dunning.anindaDene('F-M3')),
      gunluguTopla(() => d.dunning.merdiveniYurut()),
    ]);
    check(`M3-FIXTURE (${ters ? 'ters' : 'düz'} sıra) merdiven ve müşteri kiraya AYNI anda ulaştı`, d.db.kiraVaran() === 2, `varan=${d.db.kiraVaran()}`);
    check(`M3 ⭐⭐ merdiven + anlık deneme eşzamanlı (${ters ? 'ters' : 'düz'} sıra): TEK çekim`,
      d.iyz.tekrarlanan.length === 1, `cekim=${d.iyz.tekrarlanan.length} anlik=${JSON.stringify(anlik.sonuc)}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-M4', ucuncuGun);
    d.iyz.durum.kip = 'ret';
    await gunluguTopla(() => d.dunning.merdiveniYurut());
    const t1 = Date.now();
    const ab = d.satir(s.ab.id);
    check('M4 ⭐ merdivenin denemesi REDDEDİLDİ → kira kısalır; merdivenin bildirimi DEĞİŞMEDİ (2. e-posta gitti, basamak işlendi)',
      yaklasik(ab.tahsilatKirasi, t1 + KIRA_RET_MS) && d.giden.length === 1 && ab.denemeSayisi === 2,
      `kira=${iso(ab.tahsilatKirasi)} posta=${d.giden.length} deneme=${ab.denemeSayisi}`);
  }
  {
    const d = dunyaKur();
    const s = d.dunningSatiri('F-M5', ucuncuGun);
    d.iyz.durum.kip = 'zaman-asimi';
    const t0 = Date.now();
    await gunluguTopla(() => d.dunning.merdiveniYurut());
    const ab = d.satir(s.ab.id);
    check('M5 merdivenin zaman aşımı: bir kez erteleme KORUNDU (belirsiz izi, bildirim yok) + kira uzun',
      d.olaylar(s.ab.id, 'dunning.tekrar.belirsiz').length === 1 && d.giden.length === 0 && ab.denemeSayisi === 1 &&
        yaklasik(ab.tahsilatKirasi, t0 + KIRA_SONUC_MS), `posta=${d.giden.length} kira=${iso(ab.tahsilatKirasi)}`);
  }
  {
    const d = dunyaKur();
    // 10. gün (KISITLI'ya düşürme, çekimsiz basamak) — müşteri az önce ödedi, sonuç bekleniyor.
    const s = d.dunningSatiri('F-M6', { durum: 'ODEME_BEKLIYOR', gunOnce: 10.5, denemeSayisi: 3, alanlar: { tahsilatKirasi: new Date(Date.now() + 5 * SAAT) } });
    await gunluguTopla(() => d.dunning.merdiveniYurut());
    const ab = d.satir(s.ab.id);
    check('M6 aktif kirada çekimsiz basamak da bekler: KISITLI\'ya DÜŞÜRÜLMEZ, "kısıtlandı" e-postası gitmez',
      ab.durum === 'ODEME_BEKLIYOR' && d.giden.length === 0 && ab.denemeSayisi === 3, `durum=${ab.durum} posta=${d.giden.length}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  E — UÇTAN UCA BAŞARI YOLU: tek "ödemeniz alındı"
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · uçtan uca: kuyruğa yazılan başarı GERÇEK işleyicide, iyzico webhook\'u da gelir ──');
  const d = dunyaKur();
  const s = d.dunningSatiri('F-E1');
  const anlik = (await gunluguTopla(() => d.dunning.anindaDene('F-E1'))).sonuc;
  const birinci = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
  const ab = d.satir(s.ab.id);
  const k = d.kuyruk()[0];
  check('E-FIXTURE anlık deneme "alindi" ve kuyruk olayı işlendi (hatasız)',
    anlik.sonuc === 'alindi' && k?.islendi === true && k?.hata === null, `anlik=${JSON.stringify(anlik)} olay=${JSON.stringify(k && { islendi: k.islendi, hata: k.hata })}`);
  check('E1 ⭐ başarı yolu koştu: AKTİF, dunning izi sıfır, erişim siparişin dönem sonuna, fatura satırı',
    ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.denemeSayisi === 0 &&
      ab.erisimSonu instanceof Date && ab.erisimSonu.getTime() === s.yeniSon &&
      d.db.tablo('fatura').filter((f) => f.tahsilatKodu === s.hedef).length === 1,
    `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} erisimSonu=${iso(ab.erisimSonu)} hatalar=${JSON.stringify(birinci.g.hatalar)}`);
  check('E2 ⭐ tam BİR "ödemeniz alındı" (dunning çıkışı), doğru alıcıya',
    d.alindiPostasi().length === 1 && d.alindiPostasi()[0].konu === KONU_ALINDI && d.alindiPostasi()[0].kime === 'muhasebe@f-e1.test',
    JSON.stringify(d.giden));
  // iyzico'nun KENDİ başarı webhook'u da gelir (aynı sipariş).
  d.olay(BASARILI, s.kod, s.hedef, Date.now());
  const ikinci = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
  const webhook = d.db.tablo('webhookOlayi').find((o) => o.olayTipi === BASARILI && o.kaynak === 'iyzico');
  check('E3 ⭐⭐ iyzico webhook\'u da işlendi — yine TEK e-posta, TEK fatura satırı (koşullu sıfırlama + tekil fatura)',
    webhook?.islendi === true && webhook?.hata === null && d.alindiPostasi().length === 1 &&
      d.db.tablo('fatura').filter((f) => f.tahsilatKodu === s.hedef).length === 1,
    `webhook=${JSON.stringify(webhook && { islendi: webhook.islendi, hata: webhook.hata })} alindi=${d.alindiPostasi().length} hatalar=${JSON.stringify(ikinci.g.hatalar)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  C — UÇ BAĞLANTISI
// ═════════════════════════════════════════════════════════════════════════
async function cBlogu(): Promise<void> {
  console.log('\n── C · uç: oturumlu, sahip, hız sınırlı; controller servise firmayı verir ──');
  const uc = ucEnvanteri(path.resolve(__dirname, '..')).find((u) => u.fiil === 'POST' && u.yol === '/abonelik/odeme-tekrar-dene');
  check('C1 POST /abonelik/odeme-tekrar-dene kayıtlı ve OTURUMLU (sınıf JwtAuthGuard)',
    !!uc && uc.sinifDekoratorleri.some((x) => x.includes('JwtAuthGuard')), JSON.stringify(uc));
  const metot = AbonelikController.prototype.odemeyiTekrarDene;
  const roller = Reflect.getMetadata(FIRMA_ROL_KEY, metot);
  const kapilar: unknown[] = Reflect.getMetadata(GUARDS_METADATA, metot) ?? [];
  const sinir = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, metot);
  check('C2 ⭐ yalnız firma SAHİBİ (para çeken iş) + oturum sahibi başına hız sınırı',
    JSON.stringify(roller) === JSON.stringify(['sahip']) && kapilar.includes(FirmaRolGuard) && kapilar.includes(KullaniciHizSiniriGuard) && sinir === 6,
    `roller=${JSON.stringify(roller)} kapilar=${kapilar.map((k: any) => k?.name)} sinir=${sinir}`);
  const cagrilar: unknown[] = [];
  const kontrolcu = new AbonelikController({} as any, {} as any, {} as any, {} as any, {} as any, {
    anindaDene: async (firmaId: string) => { cagrilar.push(firmaId); return { sonuc: 'gerekmiyor' }; },
  } as any);
  const yanit = await kontrolcu.odemeyiTekrarDene({ id: 'U1', firmaId: 'F-C' });
  check('C3 BAĞLANTI: controller oturumdaki firmayı servise verir, sonucu aynen döndürür',
    JSON.stringify(cagrilar) === JSON.stringify(['F-C']) && (yanit as any).sonuc === 'gerekmiyor', JSON.stringify(cagrilar));
}

// ═════════════════════════════════════════════════════════════════════════
//  P — DUNNING METİNLERİ GERÇEĞİ SÖYLER
// ═════════════════════════════════════════════════════════════════════════
function pBlogu(): void {
  console.log('\n── P · dunning e-postaları: kart güncellenince ödeme hemen denenir ──');
  const b = { firmaAdi: 'F', paketAdi: 'P', tutar: '₺1.649,00', kalanGun: 3, kisitTarihi: '3 Ekim 2026' };
  const govde = (k: keyof typeof DUNNING_METINLERI) => DUNNING_METINLERI[k](b).govde.join(' ');
  const anahtarlar = ['ilk', 'ikinci', 'ucuncu', 'kisitlandi', 'askiyaAlindi'] as const;
  const eksik = anahtarlar.filter((k) => !/hemen (yeni kartınızdan |yeniden )?denenir/.test(govde(k)));
  check('P1 ⭐ kart güncelleme çağrısı yapan beş e-posta mekanizmayı söyler: "bekleyen ödeme hemen … denenir"',
    eksik.length === 0, `eksik=${eksik.join(',')}`);
  const abarti = anahtarlar.filter((k) => /birkaç saniye|gerisini biz hallederiz/.test(govde(k)));
  check('P2 abartılı söz yok ("birkaç saniye içinde açılır", "gerisini biz hallederiz")', abarti.length === 0, `abarti=${abarti.join(',')}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nANINDA TAHSİLAT: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  sBlogu();
  await aBlogu();
  await tBlogu();
  await mBlogu();
  await eBlogu();
  await cBlogu();
  pBlogu();
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
