/**
 * HAVALE TEKLİFİNİN PAKETİ  (`npm run test:havale-teklif-paketi`) · 25.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK servisler bellek-Prisma üzerinde koşar:
 * `HavaleServisi` (teklif → fatura → onay), `AbonelikServisi` (onay uzatması,
 * kart webhook'u), `ErisimServisi` (erişim/paket kararı), `FaturaServisi`
 * (kuyruk + kesim), `PaketDegisimiServisi` (10 dk planlı geçiş taraması) ve
 * `SatinAlmaServisi.iptalEt` (müşteri iptali). Fixture yalnız havaleden ÖNCEKİ
 * abonelik satırını kurar; havale satırı onay akışının GERÇEK yazma yolundan
 * geçer. Sahte iyzico yalnız kart aboneliğinin iptalini (onay onu kapatır),
 * okumasını ve dönem çekimini taklit eder.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * 24.09 kod okumasıyla bulundu, 25.09 bu paketle ÖLÇÜLDÜ (düzeltme öncesi 12
 * kırmızı): `teklifOlustur({ paketSurumuId })` mevcut abonelik satırında
 * teklifin paketini YOK SAYIYORDU (`HavaleOdemesi`nde paket sütunu bile yoktu);
 * onay (`erisimiUzat`) süreyi uzatıp `paketSurumuId`ye dokunmuyordu. Basic
 * müşteri 19.788 TL'lik Pro teklifini ödeyince Basic kalıyordu: 1 koltuk, DWG
 * kapalı, fatura kalemi ve müşteri e-postası "Basic". Aynı ölçüm karttan kalan
 * A1 izlerini de yakaladı: planlı düşürme havaleyle ödenmiş Pro'yu kart dönemi
 * sonunda Basic'e indiriyor, bekleyen yükseltmenin "ödenmiş paket" işareti
 * müşteri iptalinde Pro'yu Basic'e döndürüyor, kalan kilit 3 gün sonra
 * "tahsilat bildirimi gelmedi" olayı yazıyordu.
 *
 * ── KARAR (Emre, 25.09: "onayda hemen uygula") ────────────────────────────
 * Teklif paketi kaydedilir; onay onu ETKİN paket yapar ve karttan kalan
 * planlı geçiş / kilit / ödenmiş-paket izlerini siler. Bedeli kabul edildi:
 * ERKEN ödenen düşürme yenilemesinde kalan üst paket günleri onayda biter (D).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   F  fixture: iki paket erişim kararında gerçekten AYRIŞIYOR (ölçüt kör değil)
 *   T  teklif: paket zorunlu ve var olmalı; kaydedilir; yanıt ve olay paketi söyler
 *   K  mevcut KART satırı (Basic) + Pro teklifi — hesap, erişim, DWG, fatura
 *      kalemi, müşteri e-postası, olay, API yanıtı
 *   D  düşürme HEMEN (kabul edilen bedel): 60 gün kalmış Pro havalesi → Basic
 *   H  mevcut HAVALE satırının yenilemesi: farklı paket · aynı paket (olay yok)
 *   Y  yeni firma (satır yok) — KONTROL; aynı firmaya ikinci teklif
 *   P  A1 izleri: planlı düşürme · bekleyen yükseltme (iptal) · kilit olayı ·
 *      ödenmiş pakete düşürme teklifi
 *   E  alan eklenmeden ÖNCEKİ (paketsiz) teklif: paket değişmez, izler silinir
 *   R  ⭐YARIŞ: kart webhook'u durumu onaydan ÖNCE, paket hizalamasını SONRA
 *      yapar — havaleyle ödenen paket kartın planına geri çekilmez
 *   A  ⭐YARIŞ (inceleme ORTA-1): A1 değişimi iyzico'yu beklerken havale
 *      onaylanır; A1'in son yazımı havale satırına düşmez (409), iyzico'daki
 *      yeni uç onayın kart kapatmasında kapanır
 *   W  onayda kart iptali düştü, iyzico sonra eski planla çekti: paket kalır
 *   G  yönetici görünümü: bekleyenler listesi teklifin paketini gösteriyor
 *
 * Günlük: `HTP_GUNLUK=1` Nest günlüğünü konsola da basar.
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi, Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { PaketDegisimiServisi } from '../src/ozellik/odeme/abonelik/paket-degisimi.servisi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { HavaleServisi } from '../src/ozellik/odeme/havale/havale.servisi';
import { koltukDurumuHesapla } from '../src/ozellik/firma/uyelik-kurallari';
import { tarihYaz } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';
import type { IyzicoAbonelikDetayi, IyzicoAbonelikDurumu } from '../src/ozellik/odeme/iyzico/iyzico.client';
import { KART_OKUMA_SURESI_MS, sonrakiKartCekimi, yerelSonrakiCekim } from '../src/ozellik/odeme/havale/havale-kart-penceresi';

let passed = 0;
let failed = 0;
const failures: string[] = [];
const olcumler: string[] = [];

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

/** Assert DEĞİL: senaryonun ölçtüğü değer (özette tekrar basılır). */
function olcum(metin: string): void {
  olcumler.push(metin);
  console.log(`  · ÖLÇÜM ${metin}`);
}

const SAAT = 3_600_000;
const GUN = 24 * SAAT;
const HAVALE_TUTARI = 19788; // Pro 12 ay (1.649 TL × 12)
const YONETIM = 'yonetim@ornek.test';

/** Gerçek saat sınıfı — `saatte()` global `Date`i geçici değiştirir. */
const GercekDate = Date;
const tarih = (an: number | Date) =>
  new GercekDate(an instanceof GercekDate ? an.getTime() : an).toISOString().slice(0, 10);

/** Takvim ayı ekler (servislerin `setMonth` kuralıyla aynı takvim). */
function ayEkle(an: number, ay: number): number {
  const d = new GercekDate(an);
  d.setMonth(d.getMonth() + ay);
  return d.getTime();
}

/**
 * Saati verilen ana sabitler: servislerin `new Date()` ve `Date.now()`
 * çağrıları aynı saati okur. İş bitince ÖNCEKİ saati geri yükler — iç içe
 * çağrılabilir (yarış bloğu onayı webhook'un saati içinde koşturur).
 */
async function saatte<T>(an: number, fn: () => Promise<T>): Promise<T> {
  class SabitDate extends GercekDate {
    constructor(...args: any[]) {
      super(...((args.length ? args : [an]) as [number]));
    }
    static now(): number {
      return an;
    }
  }
  const onceki = globalThis.Date;
  globalThis.Date = SabitDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = onceki;
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  GÜNLÜK — yutulan hata GÖRÜNSÜN
// ═════════════════════════════════════════════════════════════════════════
// Servisler birçok hatayı `catch` + `logger.error` ile yutar (onayı ve
// tahsilatı düşürmemek için). "Satır değişmedi" assert'i yutulan hatada da
// geçer; senaryolar kendi aralığındaki HATA satırlarını ayrıca sayar.
const gunluk: Array<{ seviye: 'uyari' | 'hata'; metin: string }> = [];
const konsol = process.env.HTP_GUNLUK ? new ConsoleLogger() : null;
const gunlukServisi = {
  log: (m: unknown) => konsol?.log(m),
  debug: () => undefined,
  verbose: () => undefined,
  warn: (m: unknown) => {
    gunluk.push({ seviye: 'uyari', metin: String(m) });
    konsol?.warn(m);
  },
  error: (m: unknown) => {
    gunluk.push({ seviye: 'hata', metin: String(m) });
    konsol?.error(m);
  },
  fatal: (m: unknown) => {
    gunluk.push({ seviye: 'hata', metin: String(m) });
    konsol?.fatal(m);
  },
};
Logger.overrideLogger(gunlukServisi);
const hatalarSonra = (i: number) => gunluk.slice(i).filter((g) => g.seviye === 'hata').map((g) => g.metin);
const uyarilarSonra = (i: number) => gunluk.slice(i).filter((g) => g.seviye === 'uyari').map((g) => g.metin);
const beklenmeyenHatalar = (i: number, izinli: RegExp[] = []) =>
  hatalarSonra(i).filter((m) => !izinli.some((k) => k.test(m)));

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — havale, erişim kararı, fatura, planlı geçiş, iptal, webhook
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  havaleOdemesi: {
    abonelik: { model: 'abonelik', yerel: 'abonelikId' },
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
  },
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

/** Şemadaki @unique alanlar — ihlal P2002. */
const TEKILLER: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  paketSurumu: ['iyzicoPlanKodu', 'iyzicoDenemesizPlanKodu'],
  havaleOdemesi: ['teklifNo'],
  fatura: ['tahsilatKodu'],
};

/** Prisma verilmeyen opsiyonel alanı `null` döndürür ve şema varsayılanını uygular. */
const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'DENEME', denemeSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null,
    odenenPaketSurumuId: null, kopruErisimSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null,
    iyzicoMusteriKodu: null, iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART',
    ilkBasarisizlik: null, denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null,
    iptalNedeni: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
  havaleOdemesi: () => ({
    paketSurumuId: null, durum: 'TEKLIF', paraBirimi: 'TRY', teklifNo: null, faturaNo: null, dekontUrl: null,
    aciklama: null, onaylayanId: null, onaylandi: null, uzatilanTarih: null, olusturuldu: new Date(),
    guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ oncekiDurum: null, yeniDurum: null, aciklama: null, veri: null, aktor: 'sistem', olusturuldu: new Date() }),
  fatura: () => ({
    denemeSayisi: 0, hata: null, saglayici: null, saglayiciId: null, faturaNo: null, faturaUrl: null,
    kesildi: null, olusturuldu: new Date(),
  }),
  firma: () => ({
    unvan: null, vergiNo: null, vergiDairesi: null, tcKimlikNo: null, faturaAdresi: null, il: null,
    ilce: null, faturaEposta: null, yetkiliEposta: null, imhaTarihi: null,
  }),
};

/** Yalnız ölçülen operatörler; tanınmayan koşul PATLAR (sessizce yok saymaz). */
function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof GercekDate) return deger instanceof GercekDate && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  return Object.entries(kosul).every(([op, v]: [string, any]) => {
    switch (op) {
      case 'in': return !bos && (v as any[]).some((x) => kosulUygula(deger, x));
      case 'not': return v === null ? !bos : !bos && !kosulUygula(deger, v);
      case 'gt': return !bos && deger > v;
      case 'gte': return !bos && deger >= v;
      case 'lt': return !bos && deger < v;
      case 'lte': return !bos && deger <= v;
      default: throw new Error(`bellek-Prisma: desteklenmeyen operatör "${op}"`);
    }
  });
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const liste = (x: any) => (Array.isArray(x) ? x : [x]);
    if (k === 'OR') return (v as any[]).some((w) => whereUygula(satir, w));
    if (k === 'AND') return liste(v).every((w) => whereUygula(satir, w));
    if (k === 'NOT') return !liste(v).some((w) => whereUygula(satir, w));
    return kosulUygula(satir[k], v);
  });
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...satirlar].sort((a, b) => {
    for (const [alan, yon] of kurallar) {
      const x = a[alan];
      const y = b[alan];
      if (x === y || (x instanceof GercekDate && y instanceof GercekDate && x.getTime() === y.getTime())) continue;
      const kucuk = x < y ? -1 : 1;
      return yon === 'desc' ? -kucuk : kucuk;
    }
    return 0;
  });
}

/** Tek seferlik kanca: eşleşen ilk sorgu ÇALIŞMADAN önce `fn` koşar (yarış kurulumu). */
interface Kanca {
  model: string;
  /** Kancanın koştuğu okuma: mevcut yarış kancaları `findUnique`, olay kaydı arızası `findMany`. */
  islem: 'findUnique' | 'findMany';
  eslesir: (arg: any) => boolean;
  fn: () => Promise<void>;
  tetiklendi: boolean;
}

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);
  const kancalar: Kanca[] = [];

  // Prisma her okumada TAZE nesne döndürür; ilişkiyi yalnız `include`/`select`
  // ile getirir; bilinmeyen ilişkide PATLAR.
  function yansit(model: string, satir: Satir, spec: any): Satir {
    const iliski = (ad: string, alt: any) => {
      const il = ILISKILER[model]?.[ad];
      if (!il) throw new Error(`bellek-Prisma: bilinmeyen ilişki ${model}.${ad}`);
      const hedef = tablo(il.model).find((r) => r.id === satir[il.yerel]);
      return hedef ? yansit(il.model, hedef, alt === true ? {} : alt) : null;
    };
    if (spec?.select) {
      const sonuc: Satir = {};
      for (const [k, v] of Object.entries(spec.select)) {
        if (!v) continue;
        sonuc[k] = ILISKILER[model]?.[k] ? iliski(k, v) : satir[k] ?? null;
      }
      return sonuc;
    }
    const sonuc: Satir = { ...satir };
    for (const [k, v] of Object.entries(spec?.include ?? {})) if (v) sonuc[k] = iliski(k, v);
    return sonuc;
  }

  function tekilDenetle(model: string, satir: Satir): void {
    for (const alan of TEKILLER[model] ?? []) {
      const deger = satir[alan];
      if (deger === null || deger === undefined) continue;
      if (tablo(model).some((r) => r !== satir && r[alan] === deger)) {
        throw Object.assign(new Error(`Unique constraint failed on ${model}.${alan}`), { code: 'P2002' });
      }
    }
  }

  /** `undefined` = dokunma; `{ increment }` sayaç; Decimal/Json/Date DEĞER olarak yazılır. */
  function veriUygula(hedef: Satir, data: Satir): void {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const islem = v !== null && typeof v === 'object' && !(v instanceof GercekDate) && !(v instanceof Prisma.Decimal);
      if (islem && 'increment' in v) hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      else if (islem && 'decrement' in v) hedef[k] = (hedef[k] ?? 0) - (v as any).decrement;
      else hedef[k] = v;
    }
  }

  function olustur(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tekilDenetle(model, satir);
    tablo(model).push(satir);
    return satir;
  }

  async function kancaKos(model: string, arg: any, islem: Kanca['islem'] = 'findUnique'): Promise<void> {
    for (const k of kancalar) {
      if (!k.tetiklendi && k.model === model && k.islem === islem && k.eslesir(arg)) {
        k.tetiklendi = true;
        await k.fn();
      }
    }
  }

  const modelYuzu = (model: string) => ({
    findUnique: async (arg: any) => {
      await Promise.resolve();
      await kancaKos(model, arg);
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      return s ? yansit(model, s, arg) : null;
    },
    findUniqueOrThrow: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} bulunamadı`), { code: 'P2025' });
      return yansit(model, s, arg);
    },
    findFirst: async (arg: any = {}) => {
      await Promise.resolve();
      const s = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy)[0];
      return s ? yansit(model, s, arg) : null;
    },
    findMany: async (arg: any = {}) => {
      await Promise.resolve();
      await kancaKos(model, arg, 'findMany');
      let liste = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy);
      if (arg.take !== undefined) liste = liste.slice(0, arg.take);
      return liste.map((s) => yansit(model, s, arg));
    },
    count: async (arg: any = {}) => {
      await Promise.resolve();
      return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
    },
    create: async (arg: any) => {
      await Promise.resolve();
      return yansit(model, olustur(model, arg.data), arg);
    },
    update: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} güncellenecek satır yok`), { code: 'P2025' });
      const once = { ...s };
      veriUygula(s, arg.data);
      try {
        tekilDenetle(model, s);
      } catch (e) {
        Object.keys(s).forEach((k) => delete s[k]);
        Object.assign(s, once);
        throw e;
      }
      // Şemada `guncellendi @updatedAt`: her yazımda o anın saati.
      if ('guncellendi' in s) s.guncellendi = new Date();
      return yansit(model, s, arg);
    },
    updateMany: async (arg: any) => {
      await Promise.resolve();
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
        // ⚠ Etkileşimli `$transaction` ATOMİK DEĞİL taklit edilir: bu paket
        // onayın atomikliğini ÖLÇMEZ, onaydan SONRAKİ paketi ölçer.
        if (ad === '$transaction') {
          return async (islemler: unknown) => {
            if (Array.isArray(islemler)) return Promise.all(islemler);
            if (typeof islemler === 'function') return (islemler as (tx: unknown) => unknown)(prisma);
            throw new Error('bellek-Prisma: beklenmeyen $transaction biçimi');
          };
        }
        return modelYuzu(ad);
      },
    },
  );
  const kancaKur = (
    model: string,
    eslesir: (arg: any) => boolean,
    fn: () => Promise<void>,
    islem: Kanca['islem'] = 'findUnique',
  ): Kanca => {
    const k: Kanca = { model, islem, eslesir, fn, tetiklendi: false };
    kancalar.push(k);
    return k;
  };
  return { prisma, tablo, ekle: olustur, kancaKur };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — kart aboneliğinin iptali, okuması ve dönem çekimi
// ═════════════════════════════════════════════════════════════════════════
interface SahteAbonelik {
  durum: IyzicoAbonelikDurumu;
  plan: string;
  musteri: string;
  /** Plan değişiminde yeni ucun atası (`parentReferenceCode`). */
  ust?: string;
  olusturuldu: number;
  /** Dönem sonu — `paketDegistir` (NEXT_PERIOD) yeni planın başlangıcını bundan bildirir. */
  donemSonu: number;
  /** Denemeli abonelik: iyzico'nun `trialEndDate`i (ms). Denemesizde yok. */
  denemeSonu?: number;
  siparisler: Satir[];
}

function sahteIyzico() {
  const abonelikler = new Map<string, SahteAbonelik>();
  const cagrilar: Array<{ ad: string; kod: string }> = [];
  /** Koda bağlı iptal arızası (ağ / iyzico hatası). */
  const iptalArizasi = new Map<string, Error>();
  /** Koda bağlı OKUMA arızası (`abonelikGetir` — iyzico'ya ulaşılamıyor). */
  const getirArizasi = new Map<string, Error>();
  /** Koda bağlı ASILI okuma: `abonelikGetir` hiç yanıt vermez (iyzico yavaş / bağlantı takıldı). */
  const getirAsili = new Set<string>();
  /**
   * TEK SEFERLİK: `paketDegistir` değişimi iyzico'da UYGULAR, yanıtı bu kanca
   * bitene dek döndürmez (yanıt ağda) — A1 ↔ havale onayı yarışını kurar.
   */
  let degisimKancasi: (() => Promise<void>) | null = null;
  const bul = (kod: string): SahteAbonelik => {
    const a = abonelikler.get(kod);
    if (!a) throw new IyzicoHatasi('201400', `Abonelik bulunamadı: ${kod}`, 422);
    return a;
  };
  const detay = (kod: string, a: SahteAbonelik) => ({
    referenceCode: kod,
    parentReferenceCode: a.ust,
    pricingPlanReferenceCode: a.plan,
    customerReferenceCode: a.musteri,
    subscriptionStatus: a.durum,
    createdDate: new GercekDate(a.olusturuldu).toISOString(),
    ...(a.denemeSonu !== undefined ? { trialEndDate: a.denemeSonu } : {}),
    orders: a.siparisler.map((s) => ({ ...s })),
  });
  const istemci: any = {
    abonelikGetir: async (kod: string) => {
      cagrilar.push({ ad: 'abonelikGetir', kod });
      const ariza = getirArizasi.get(kod);
      if (ariza) throw ariza;
      if (getirAsili.has(kod)) return new Promise(() => undefined);
      return detay(kod, bul(kod));
    },
    // iyzico bilinmeyen filtreyi YUTAR (20.08): arama TÜM abonelikleri döner,
    // süzmek servisin işi (`canliUcuBul`).
    abonelikAra: async (f: { parent?: string }) => {
      cagrilar.push({ ad: 'abonelikAra', kod: f?.parent ?? '' });
      return [...abonelikler.entries()].map(([k, a]) => detay(k, a));
    },
    // 20.08 ölçümü: değişim YENİ referans üretir, eski uç UPGRADED (terminal);
    // UPGRADED ucu yeniden değiştirmek 201402.
    paketDegistir: async (kod: string, o: { yeniPlanKodu: string }) => {
      cagrilar.push({ ad: 'paketDegistir', kod });
      const a = bul(kod);
      if (a.durum !== 'ACTIVE') throw new IyzicoHatasi('201402', 'Bu abonelik yükseltilemez.', 422);
      const yeniKod = `${kod}-u${[...abonelikler.keys()].filter((k) => k.startsWith(`${kod}-u`)).length + 1}`;
      abonelikler.set(yeniKod, {
        durum: 'ACTIVE', plan: o.yeniPlanKodu, musteri: a.musteri, ust: kod, olusturuldu: Date.now(),
        donemSonu: a.donemSonu, siparisler: [],
      });
      a.durum = 'UPGRADED';
      if (degisimKancasi) {
        const k = degisimKancasi;
        degisimKancasi = null;
        await k();
      }
      return {
        referenceCode: yeniKod,
        parentReferenceCode: kod,
        pricingPlanReferenceCode: o.yeniPlanKodu,
        subscriptionStatus: 'ACTIVE',
        startDate: new GercekDate(a.donemSonu).toISOString(),
      };
    },
    // 20.08 ölçümü: ACTIVE uç iptal edilir (gövdesiz success); UPGRADED 201403.
    abonelikIptal: async (kod: string) => {
      cagrilar.push({ ad: 'abonelikIptal', kod });
      const ariza = iptalArizasi.get(kod);
      if (ariza) throw ariza;
      const a = bul(kod);
      if (a.durum === 'UPGRADED' || a.durum === 'CANCELED' || a.durum === 'EXPIRED') {
        throw new IyzicoHatasi('201403', 'Bu abonelik iptal edilemez.', 422);
      }
      a.durum = 'CANCELED';
      return {};
    },
  };
  return {
    istemci,
    cagrilar,
    kur: (kod: string, plan: string, musteri: string, donemSonu: number, denemeSonu?: number) =>
      void abonelikler.set(kod, {
        durum: 'ACTIVE', plan, musteri, olusturuldu: GercekDate.now() - 60 * GUN, donemSonu, denemeSonu, siparisler: [],
      }),
    durum: (kod: string) => abonelikler.get(kod)?.durum,
    durumYaz: (kod: string, durum: IyzicoAbonelikDurumu) => void (bul(kod).durum = durum),
    /** iyzico'nun defterinde karttan GERÇEKTEN çekilen (SUCCESS) sipariş sayısı. */
    basariliCekimler: (kod: string) =>
      (abonelikler.get(kod)?.siparisler ?? []).filter((s) => s.orderStatus === 'SUCCESS').length,
    iptaliBoz: (kod: string, hata: Error) => void iptalArizasi.set(kod, hata),
    okumayiBoz: (kod: string, hata: Error) => void getirArizasi.set(kod, hata),
    okumayiAs: (kod: string) => void getirAsili.add(kod),
    sayi: (ad: string, kod?: string) => cagrilar.filter((c) => c.ad === ad && (!kod || c.kod === kod)).length,
    /** Başarısız dönem çekimi (kart reddi): FAILED sipariş, abonelik UNPAID. */
    ret: (kod: string, p: { baslangic: number; bitis: number }): string => {
      const a = bul(kod);
      const siparis = `sip-${kod}-${a.siparisler.length + 1}`;
      a.siparisler.push({
        referenceCode: siparis, orderStatus: 'FAILED',
        startPeriod: new GercekDate(p.baslangic).toISOString(), endPeriod: new GercekDate(p.bitis).toISOString(),
        price: 1299, paymentAttempts: [{ paymentAttemptStatus: 'FAILED' }],
      });
      a.durum = 'UNPAID';
      return siparis;
    },
    degisimdeKanca: (fn: () => Promise<void>) => void (degisimKancasi = fn),
    /**
     * iyzico'nun DÖNEM ÇEKİMİ (abonelik planının fiyatıyla). İptal edilmiş /
     * bitmiş / yükseltilmiş abonelikte çekim YOK → `null`.
     */
    cekim: (kod: string, p: { baslangic: number; bitis: number }): string | null => {
      const a = bul(kod);
      if (a.durum === 'CANCELED' || a.durum === 'EXPIRED' || a.durum === 'UPGRADED') return null;
      const siparis = `sip-${kod}-${a.siparisler.length + 1}`;
      a.siparisler.push({
        referenceCode: siparis,
        orderStatus: 'SUCCESS',
        startPeriod: new GercekDate(p.baslangic).toISOString(),
        endPeriod: new GercekDate(p.bitis).toISOString(),
        price: 1299,
        paidPrice: 1299,
        paymentAttempts: [{ paymentAttemptStatus: 'SUCCESS' }],
      });
      a.durum = 'ACTIVE';
      return siparis;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — gerçek servisler, sahte iyzico/e-posta/muhasebe
// ═════════════════════════════════════════════════════════════════════════
/** İki paket erişim kararında AYRIŞIR: koltuk 1↔2, DWG kapalı↔açık, seviye core↔pro. */
const BASIC = 'S-BASIC';
const PRO = 'S-PRO';
/** S bloğu: kullanıcı hakları canlı katalogla aynı (Basic 1 · Pro 2 · Pro-MEP 3) + 5 kişilik miras. */
const MEP = 'S-MEP';
const MIRAS = 'S-MIRAS';
const PAKET_KODU: Record<string, string> = {
  [BASIC]: 'basic-mek', [PRO]: 'pro-mek', [MEP]: 'pro-mep', [MIRAS]: 'miras-pro',
};
const pk = (id: unknown) => (typeof id === 'string' ? PAKET_KODU[id] ?? id : String(id));

function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  db.ekle('paket', {
    id: 'P-BASIC', kod: 'basic-mek', ad: 'Basic — Mekanik', kapsam: 'mechanical', seviye: 'core',
    kullaniciHakki: 1, aylikTeklifHakki: null, dwgAktif: false, aktif: true,
  });
  db.ekle('paket', {
    id: 'P-PRO', kod: 'pro-mek', ad: 'Pro — Mekanik', kapsam: 'mechanical', seviye: 'pro',
    kullaniciHakki: 2, aylikTeklifHakki: null, dwgAktif: true, aktif: true,
  });
  db.ekle('paketSurumu', {
    id: BASIC, paketId: 'P-BASIC', surumNo: 2, iyzicoPlanKodu: 'plan-basic', iyzicoDenemesizPlanKodu: 'plan-basic-dz',
    iyzicoUrunKodu: 'urun-1', tutar: new Prisma.Decimal(1299), paraBirimi: 'TRY', periyot: 'MONTHLY',
    periyotAdedi: 1, denemeGunu: 30, satistaMi: true,
  });
  db.ekle('paketSurumu', {
    id: PRO, paketId: 'P-PRO', surumNo: 2, iyzicoPlanKodu: 'plan-pro', iyzicoDenemesizPlanKodu: 'plan-pro-dz',
    iyzicoUrunKodu: 'urun-1', tutar: new Prisma.Decimal(1649), paraBirimi: 'TRY', periyot: 'MONTHLY',
    periyotAdedi: 1, denemeGunu: 30, satistaMi: true,
  });
  db.ekle('paket', {
    id: 'P-MEP', kod: 'pro-mep', ad: 'Pro — MEP', kapsam: 'mep', seviye: 'pro',
    kullaniciHakki: 3, aylikTeklifHakki: null, dwgAktif: true, aktif: true,
  });
  db.ekle('paketSurumu', {
    id: MEP, paketId: 'P-MEP', surumNo: 2, iyzicoPlanKodu: 'plan-mep', iyzicoDenemesizPlanKodu: 'plan-mep-dz',
    iyzicoUrunKodu: 'urun-1', tutar: new Prisma.Decimal(2449), paraBirimi: 'TRY', periyot: 'MONTHLY',
    periyotAdedi: 1, denemeGunu: 30, satistaMi: true,
  });
  // Miras (göç) paketi: satış dışı, 5 kişilik — "miras → katalog" düşürmesi.
  db.ekle('paket', {
    id: 'P-MIRAS', kod: 'miras-pro', ad: 'Miras Pro', kapsam: 'mechanical', seviye: 'pro',
    kullaniciHakki: 5, aylikTeklifHakki: null, dwgAktif: true, aktif: false,
  });
  db.ekle('paketSurumu', {
    id: MIRAS, paketId: 'P-MIRAS', surumNo: 1, iyzicoPlanKodu: 'plan-miras', iyzicoDenemesizPlanKodu: null,
    iyzicoUrunKodu: 'urun-0', tutar: new Prisma.Decimal(0), paraBirimi: 'TRY', periyot: 'YEARLY',
    periyotAdedi: 1, denemeGunu: 0, satistaMi: false,
  });

  const epostalar: Array<{ kime: string; konu: string; paragraflar: string[] }> = [];
  /** TEK SEFERLİK: konusu eşleşen e-posta gönderilirken koşar (onayın işlem-sonrası penceresi). */
  let epostaKancasi: { desen: RegExp; fn: () => Promise<void> } | null = null;
  const eposta: any = {
    yapilandirildiMi: () => true,
    gonder: async (m: any) => {
      epostalar.push({ kime: m.kime, konu: m.konu, paragraflar: [...(m.paragraflar ?? [])] });
      if (epostaKancasi && epostaKancasi.desen.test(String(m.konu))) {
        const k = epostaKancasi;
        epostaKancasi = null;
        await k.fn();
      }
    },
    gonderKritik: async (m: any) => {
      epostalar.push({ kime: m.kime, konu: m.konu, paragraflar: [...(m.paragraflar ?? [])] });
    },
  };
  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  /** Muhasebeye giden kesim talepleri — fatura kalemi hangi paketi yazıyor? */
  const kesimler: Array<{ harciAnahtar: string; kalem: string; toplam: number }> = [];
  const muhasebe: any = {
    ad: 'sahte',
    faturaKes: async (t: any) => {
      kesimler.push({ harciAnahtar: t.harciAnahtar, kalem: String(t.kalemler?.[0]?.ad), toplam: Number(t.tahsilat?.toplam) });
      return { saglayiciId: `sahte-${kesimler.length}`, faturaNo: `TEST${kesimler.length}` };
    },
  };

  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci, eposta);
  const fatura = new FaturaServisi(db.prisma, muhasebe, eposta);
  const havale = new HavaleServisi(db.prisma, abonelik, fatura, eposta);
  const erisim = new ErisimServisi(db.prisma);
  const degisim = new PaketDegisimiServisi(db.prisma, iyz.istemci, abonelik, eposta, config);
  // Müşteri iptali (`iptalEt`) — hesap kapatma ve yönetici silme de buradan geçer.
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, {} as any, eposta);

  function firma(firmaId: string): void {
    db.ekle('firma', {
      id: firmaId, ad: `Firma ${firmaId}`, unvan: `${firmaId} Mühendislik Ltd.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', faturaEposta: `muhasebe@${firmaId.toLowerCase()}.test`,
      yetkiliEposta: `yetkili@${firmaId.toLowerCase()}.test`,
    });
  }

  /** Satın alma yolunun yazdığı kartlı satır + iyzico'da ACTIVE abonelik (paketin planıyla). */
  function kartliSatir(firmaId: string, paket: string, p: { erisimSonu: Date; plan?: string; ek?: Satir }): Satir {
    firma(firmaId);
    const kod = `sub-${firmaId}`;
    // Denemeli satır = iyzico'da denemeli abonelik (satın alma ikisini birlikte açar).
    const deneme = p.ek?.denemeSonu ? new GercekDate(p.ek.denemeSonu).getTime() : undefined;
    iyz.kur(kod, p.plan ?? (paket === PRO ? 'plan-pro' : 'plan-basic'), `mus-${firmaId}`, p.erisimSonu.getTime(), deneme);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: paket, durum: 'AKTIF', erisimSonu: p.erisimSonu, odemeYontemi: 'KART',
      iyzicoAbonelikKodu: kod, iyzicoKokKodu: kod, iyzicoMusteriKodu: `mus-${firmaId}`, iyzicoDurum: 'ACTIVE',
      iyzicoSonKontrol: new Date(), ...(p.ek ?? {}),
    });
  }

  /** Havaleyle ödeyen (miras göçü ya da önceki havale) kartsız satır. */
  function havaleSatiri(firmaId: string, paket: string, p: { erisimSonu: Date }): Satir {
    firma(firmaId);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: paket, durum: 'AKTIF', erisimSonu: p.erisimSonu, odemeYontemi: 'HAVALE',
    });
  }

  /**
   * Firma hesabı (koltuk kuralının okuduğu alanlar). `dakikaOnce`: katılım
   * sırası — küçük = daha yeni. Banlı / silinmiş hesap `ek` ile.
   */
  function uye(firmaId: string, rol: 'sahip' | 'uye', dakikaOnce: number, ek: Satir = {}): Satir {
    return db.ekle('user', {
      firmaId, firmaRol: rol, email: `${rol}-${dakikaOnce}@${firmaId.toLowerCase()}.test`,
      createdAt: new GercekDate(GercekDate.now() - dakikaOnce * 60_000), deletedAt: null, status: 'active', ...ek,
    });
  }

  /** Yöneticinin GERÇEK ilk adımı: teklif (fırlatırsa hata döner, fırlatmaz). */
  async function teklif(firmaId: string, paket: string | undefined, an: number, ayAdedi = 12) {
    return saatte(an, async () => {
      try {
        const t = await havale.teklifOlustur({
          firmaId, paketSurumuId: paket as string, ayAdedi, tutar: HAVALE_TUTARI, olusturanId: 'yonetici-1',
        });
        return { id: t.id as string, yanit: t as Satir, hata: null as unknown };
      } catch (e) {
        return { id: null, yanit: null, hata: e as unknown };
      }
    });
  }

  /** Yöneticinin GERÇEK kalan iki adımı: fatura kesildi → dekont onayı. Onayın DÖNÜŞÜ (API yanıtı) döner. */
  async function onayla(havaleId: string, an: number): Promise<Satir> {
    return saatte(an, async () => {
      await havale.faturaKesildi(havaleId, `FTR-${havaleId.slice(0, 6)}`, 'yonetici-1');
      return (await havale.odemeyiOnayla({ havaleId, onaylayanId: 'yonetici-1' })) as Satir;
    });
  }

  /** Teklif + onay; teklif fırlatırsa onay koşmaz (hata yukarı taşınır). */
  async function havaleIleOde(firmaId: string, paket: string, an: number, ayAdedi = 12) {
    const t = await teklif(firmaId, paket, an, ayAdedi);
    if (!t.id) throw new Error(`teklif oluşmadı: ${t.hata instanceof Error ? t.hata.message : String(t.hata)}`);
    const yanit = await onayla(t.id, an);
    return { havaleId: t.id, yanit };
  }

  /**
   * Satırın O ANKİ KOPYASI. ⚠ Canlı nesne döndürülmez: tablo satırı sonraki
   * yazımlarla yerinde değişir; "önce/sonra" karşılaştırması aynı nesneyi
   * kendisiyle kıyaslayıp KÖR yeşil verirdi (W2'de öyleydi).
   */
  const oku = (firmaId: string): Satir => ({ ...db.tablo('abonelik').find((r) => r.firmaId === firmaId) });
  const karar = (firmaId: string, an: number) => erisim.karar(firmaId, new GercekDate(an));
  const olaylar = (tip: RegExp, abonelikId?: string) =>
    db.tablo('abonelikOlayi').filter((o) => tip.test(o.tip) && (!abonelikId || o.abonelikId === abonelikId));
  const musteriEpostasi = (firmaId: string) =>
    epostalar.filter((e) => e.kime === `muhasebe@${firmaId.toLowerCase()}.test`);
  /** Dakikalık fatura kuyruğu (gerçek `kuyrugaBak` → `tekFatura` → muhasebe). */
  const faturaKuyrugu = (an: number) => saatte(an, () => fatura.kuyrugaBak());
  const yoneticiye = () => epostalar.filter((e) => e.kime === YONETIM);
  const epostadaKanca = (desen: RegExp, fn: () => Promise<void>) => void (epostaKancasi = { desen, fn });

  return {
    db, iyz, epostalar, kesimler, abonelik, fatura, havale, erisim, degisim, satinAlma,
    firma, kartliSatir, havaleSatiri, uye, teklif, onayla, havaleIleOde, oku, karar, olaylar,
    musteriEpostasi, faturaKuyrugu, yoneticiye, epostadaKanca,
  };
}
type Dunya = ReturnType<typeof dunyaKur>;

/** Erişim kararının paket yüzü: kod · koltuk · DWG (yetenek). */
async function paketYuzu(d: Dunya, firmaId: string, an: number) {
  const k = await d.karar(firmaId, an);
  return {
    kod: k.paketKodu,
    koltuk: k.kullaniciHakki,
    dwg: d.erisim.yetenekKararla(k, Yetenek.DWG_YUKLE),
    erisimVar: k.erisimVar,
    paketGecisi: k.paketGecisi ?? null,
  };
}

/** A1 izlerinin üçü de boş mu? */
const kartIziYok = (ab: Satir) =>
  ab.planliPaketSurumuId === null && ab.paketGecisTarihi === null && ab.odenenPaketSurumuId === null;
const izler = (ab: Satir) =>
  `planli=${pk(ab.planliPaketSurumuId)} gecis=${ab.paketGecisTarihi ? tarih(ab.paketGecisTarihi) : null} odenen=${pk(ab.odenenPaketSurumuId)}`;
const hataMetni = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// ═════════════════════════════════════════════════════════════════════════
//  F — FIXTURE: iki paket erişim kararında gerçekten ayrışıyor
// ═════════════════════════════════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · fixture: Basic ↔ Pro erişim kararında ayrışıyor ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  d.kartliSatir('FB', BASIC, { erisimSonu: new GercekDate(T0 + 12 * GUN) });
  d.kartliSatir('FP', PRO, { erisimSonu: new GercekDate(T0 + 12 * GUN) });
  const b = await paketYuzu(d, 'FB', T0);
  const p = await paketYuzu(d, 'FP', T0);
  check('F1 FIXTURE KANITI: Basic satırı → basic-mek, 1 koltuk, DWG KAPALI',
    b.kod === 'basic-mek' && b.koltuk === 1 && b.dwg === false && b.erisimVar, JSON.stringify(b));
  check('F2 FIXTURE KANITI: Pro satırı → pro-mek, 2 koltuk, DWG AÇIK',
    p.kod === 'pro-mek' && p.koltuk === 2 && p.dwg === true && p.erisimVar, JSON.stringify(p));
}

// ═════════════════════════════════════════════════════════════════════════
//  T — TEKLİF: paket zorunlu, var olmalı, kaydedilir
// ═════════════════════════════════════════════════════════════════════════
async function tBlogu(): Promise<void> {
  console.log('\n── T · teklif: paket zorunlu ve kaydedilir ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  d.firma('T1'); // satırı olmayan yeni firma
  d.kartliSatir('T2', BASIC, { erisimSonu: new GercekDate(T0 + 12 * GUN) });

  const eksik = await d.teklif('T1', undefined, T0);
  const yok = await d.teklif('T1', 'S-YOK', T0);
  const eksikMevcut = await d.teklif('T2', undefined, T0);
  check('T1 paketsiz teklif 400 (BadRequest) — yeni firmada da mevcut satırda da',
    eksik.hata instanceof BadRequestException && eksikMevcut.hata instanceof BadRequestException,
    `yeni=${hataMetni(eksik.hata)} mevcut=${hataMetni(eksikMevcut.hata)}`);
  check('T2 var olmayan paket sürümüyle teklif 400 (eskiden mevcut satırda sessizce geçiyordu, yeni firmada FK/500)',
    yok.hata instanceof BadRequestException, hataMetni(yok.hata));
  check('T3 reddedilen tekliflerden İZ KALMADI: yeni firmada ASKIDA satır yok, havale kaydı yok',
    !d.db.tablo('abonelik').some((r) => r.firmaId === 'T1') && d.db.tablo('havaleOdemesi').length === 0,
    `T1 satırı=${d.db.tablo('abonelik').some((r) => r.firmaId === 'T1')} havale=${d.db.tablo('havaleOdemesi').length}`);

  const t = await d.teklif('T2', PRO, T0);
  const kayit = d.db.tablo('havaleOdemesi').find((h) => h.id === t.id);
  const olay = d.olaylar(/^havale\.teklif\.olusturuldu$/)[0];
  check('T4 ⭐ teklif paketi havale kaydına YAZILDI (paketSurumuId = Pro)',
    kayit?.paketSurumuId === PRO, `kayit.paketSurumuId=${pk(kayit?.paketSurumuId)}`);
  check('T5 teklif yanıtı teklifin paketini taşıyor (yönetici neyi teklif ettiğini görür)',
    t.yanit?.paketSurumu?.paket?.kod === 'pro-mek' && t.yanit?.paketSurumu?.id === PRO,
    `yanit.paketSurumu=${JSON.stringify(t.yanit?.paketSurumu)}`);
  check('T6 "havale.teklif.olusturuldu" olayı paketi adıyla ve kimliğiyle kaydediyor',
    olay?.veri?.paketSurumuId === PRO && /Pro — Mekanik/.test(String(olay?.aciklama)),
    `olay=${JSON.stringify({ aciklama: olay?.aciklama, veri: olay?.veri })}`);
  check('T7 teklif hesabın paketini DEĞİŞTİRMEDİ (ödeme onaylanmadan Pro verilmez)',
    d.oku('T2').paketSurumuId === BASIC, `paket=${pk(d.oku('T2').paketSurumuId)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — MEVCUT KART SATIRI (Basic) + Pro TEKLİFİ
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · mevcut KART satırı (Basic) + Pro teklifi ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const kartSonu = T0 + 12 * GUN;
  const ab0 = d.kartliSatir('K1', BASIC, { erisimSonu: new GercekDate(kartSonu) });
  const g0 = gunluk.length;
  const { havaleId, yanit } = await d.havaleIleOde('K1', PRO, T0);
  const ab = d.oku('K1');
  const yuz = await paketYuzu(d, 'K1', T0 + GUN);
  await d.faturaKuyrugu(T0 + 2 * 60_000);
  const kesim = d.kesimler.find((k) => k.harciAnahtar === `havale:${havaleId}`);
  const posta = d.musteriEpostasi('K1').find((e) => /aboneliğiniz uzatıldı/.test(e.konu));
  const paketOlaylari = d.olaylar(/^paket\./, ab0.id);
  olcum(`K · onay sonrası paket=${pk(ab.paketSurumuId)} durum=${ab.durum} yöntem=${ab.odemeYontemi} ` +
    `erisimSonu=${tarih(ab.erisimSonu)} · karar ${yuz.kod}/${yuz.koltuk} koltuk/DWG ${yuz.dwg} · ` +
    `fatura kalemi="${kesim?.kalem}" · e-posta="${posta?.paragraflar[0]}"`);

  const fark = (ab.erisimSonu.getTime() - kartSonu) / GUN;
  check('K1 ⭐ Pro teklifini ödeyen firmanın hesabı ONAYDA Pro (ödenen paket = hesabın paketi)',
    ab.paketSurumuId === PRO, `paket=${pk(ab.paketSurumuId)}`);
  check('K2 uzatma değişmedi: AKTIF + HAVALE, erisimSonu kart döneminin sonundan 12 ay (365–366 gün) ileri',
    ab.durum === 'AKTIF' && ab.odemeYontemi === 'HAVALE' && fark >= 364.9 && fark <= 366.1,
    `durum=${ab.durum} yontem=${ab.odemeYontemi} fark=${fark.toFixed(2)} gün`);
  check('K3 erişim kararı ödenen paketi söylüyor: pro-mek · 2 koltuk · DWG açık',
    yuz.kod === 'pro-mek' && yuz.koltuk === 2 && yuz.dwg === true, JSON.stringify(yuz));
  check('K4 havale faturasının kalemi ödenen paketi yazıyor ("Pro — Mekanik — …", 19.788 TL)',
    /^Pro — Mekanik — Yazılım Kullanım Bedeli/.test(String(kesim?.kalem)) && kesim?.toplam === HAVALE_TUTARI,
    `kesim=${JSON.stringify(kesim)}`);
  check('K5 müşteri e-postası ödenen paketi yazıyor ("Pro — Mekanik aboneliğiniz")',
    /Pro — Mekanik aboneliğiniz/.test(String(posta?.paragraflar[0])), `e-posta=${posta?.paragraflar[0]}`);
  const olay = paketOlaylari[0];
  check('K6 TEK olay "paket.degisti": kaynak havale, Basic → Pro, onaylayan yönetici, teklif no; kart izi yok',
    paketOlaylari.length === 1 && olay?.tip === 'paket.degisti' && olay.aktor === 'yonetici-1' &&
      olay.veri?.kaynak === 'havale' && olay.veri?.havaleId === havaleId && /^TKF-/.test(String(olay.veri?.teklifNo)) &&
      olay.veri?.oncekiPaketSurumuId === BASIC && olay.veri?.yeniPaketSurumuId === PRO &&
      olay.veri?.birakilanKartDegisimi === null,
    `olaylar=${JSON.stringify(paketOlaylari.map((o) => ({ tip: o.tip, aktor: o.aktor, veri: o.veri })))}`);
  check('K7 onayın API yanıtı yazılan paketi taşıyor (abonelik.paketSurumuId = Pro)',
    yanit?.abonelik?.paketSurumuId === PRO && yanit?.havale?.durum === 'ONAYLANDI',
    `yanit.abonelik.paketSurumuId=${pk(yanit?.abonelik?.paketSurumuId)} havale=${yanit?.havale?.durum}`);
  check('K8 24.09 davranışı sürüyor: kart aboneliği iyzico\'da KAPATILDI (kod satırda duruyor)',
    d.iyz.durum('sub-K1') === 'CANCELED' && ab.iyzicoAbonelikKodu === 'sub-K1', `iyzico=${d.iyz.durum('sub-K1')}`);
  check('K9 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));

  // Art arda İKİNCİ onay (çift tıklamanın SIRALI hâli). Eşzamanlı çift tıklama
  // ayrı iş (koşullu yazma — havale çift uzatma işi); ölçüt o işin hata
  // metnine BAĞLI DEĞİL: ikinci onay fırlatabilir ya da etkisiz dönebilir.
  const oncekiSon = ab.erisimSonu.getTime();
  let ikinciHata: unknown = null;
  try {
    await saatte(T0 + 5 * 60_000, () => d.havale.odemeyiOnayla({ havaleId, onaylayanId: 'yonetici-1' }));
  } catch (e) {
    ikinciHata = e;
  }
  const ab2 = d.oku('K1');
  check('K10 art arda ikinci onay paketi ve süreyi İKİNCİ KEZ uygulamıyor (Pro, erisimSonu aynı, tek "paket.degisti")',
    ab2.paketSurumuId === PRO && ab2.erisimSonu.getTime() === oncekiSon &&
      d.olaylar(/^paket\.degisti$/, ab0.id).length === 1,
    `ikinci onay=${hataMetni(ikinciHata)} paket=${pk(ab2.paketSurumuId)} erisimSonu=${tarih(ab2.erisimSonu)} ` +
      `olay=${d.olaylar(/^paket\.degisti$/, ab0.id).length}`);

  // KAPSAM DIŞI ÖLÇÜM (çift uzatma işi): onaydan SONRA fatura numarası girilirse.
  await saatte(T0 + 10 * 60_000, () => d.havale.faturaKesildi(havaleId, 'FTR-SONRADAN', 'yonetici-1'));
  // Değer HEMEN kopyalanır: tablo satırı canlı nesnedir, sonraki onay onu yeniden yazar.
  const sonradanDurum = d.db.tablo('havaleOdemesi').find((x) => x.id === havaleId)?.durum;
  const listede = (await saatte(T0 + 11 * 60_000, () => d.havale.bekleyenler())).some((x: Satir) => x.id === havaleId);
  let ucuncuHata: unknown = null;
  try {
    await saatte(T0 + 12 * 60_000, () => d.havale.odemeyiOnayla({ havaleId, onaylayanId: 'yonetici-1' }));
  } catch (e) {
    ucuncuHata = e;
  }
  const uzama = Math.round((d.oku('K1').erisimSonu.getTime() - oncekiSon) / GUN);
  olcum(`K · ONAYDAN SONRA "fatura kesildi" → havale durumu=${sonradanDurum}, bekleyenler listesinde=${listede}; ` +
    `yeniden onay=${ucuncuHata ? hataMetni(ucuncuHata) : 'GEÇTİ'} → erişim +${uzama} gün (kapsam dışı: çift uzatma işi)`);
}

// ═════════════════════════════════════════════════════════════════════════
//  D — DÜŞÜRME HEMEN (Emre'nin kabul ettiği bedel)
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · düşürme yenilemesi HEMEN uygulanır (kabul edilen bedel) ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const eskiSon = T0 + 60 * GUN;
  d.havaleSatiri('D1', PRO, { erisimSonu: new GercekDate(eskiSon) });
  await d.havaleIleOde('D1', BASIC, T0);
  const ab = d.oku('D1');
  const yuz = await paketYuzu(d, 'D1', T0 + SAAT);
  olcum(`D · 60 gün kalmış Pro havalesi Basic yenilemesiyle onaylandı: paket=${pk(ab.paketSurumuId)} ` +
    `erisimSonu=${tarih(ab.erisimSonu)} (eski bitiş ${tarih(eskiSon)} + 12 ay) — kalan 60 gün Pro ONAYDA bitti`);
  check('D1 düşürme ONAYDA uygulanır: hesap Basic (1 koltuk, DWG kapalı) — Emre kararı, bedel kabul edildi',
    ab.paketSurumuId === BASIC && yuz.kod === 'basic-mek' && yuz.koltuk === 1 && yuz.dwg === false, JSON.stringify(yuz));
  check('D2 uzatma yine ESKİ bitişten başlar (ödenen 12 ay kaybolmaz)',
    ab.erisimSonu.getTime() === ayEkle(eskiSon, 12), `erisimSonu=${tarih(ab.erisimSonu)} beklenen=${tarih(ayEkle(eskiSon, 12))}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  H — MEVCUT HAVALE SATIRININ YENİLEMESİ
// ═════════════════════════════════════════════════════════════════════════
async function hBlogu(): Promise<void> {
  console.log('\n── H · mevcut HAVALE satırı (miras benzeri) yenilemesi ──');
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const eskiSon = T0 + 60 * GUN;
    const ab0 = d.havaleSatiri('H1', BASIC, { erisimSonu: new GercekDate(eskiSon) });
    const g0 = gunluk.length;
    await d.havaleIleOde('H1', PRO, T0);
    const ab = d.oku('H1');
    const yuz = await paketYuzu(d, 'H1', T0 + GUN);
    olcum(`H · Basic HAVALE satırı Pro yenilemesi: paket=${pk(ab.paketSurumuId)} erisimSonu=${tarih(ab.erisimSonu)} ` +
      `· karar ${yuz.kod}/${yuz.koltuk} koltuk/DWG ${yuz.dwg}`);
    check('H1 ⭐ HAVALE satırı Pro yenilemesini ödeyince hesap Pro',
      ab.paketSurumuId === PRO, `paket=${pk(ab.paketSurumuId)}`);
    check('H2 erişim kararı Pro (2 koltuk, DWG açık)',
      yuz.kod === 'pro-mek' && yuz.koltuk === 2 && yuz.dwg === true, JSON.stringify(yuz));
    check('H3 uzatma eski bitişten 12 ay; olay "paket.degisti" (Basic → Pro)',
      ab.erisimSonu.getTime() === ayEkle(eskiSon, 12) &&
        d.olaylar(/^paket\.degisti$/, ab0.id).length === 1,
      `erisimSonu=${tarih(ab.erisimSonu)} olay=${d.olaylar(/^paket\./, ab0.id).map((o) => o.tip).join(',')}`);
    check('H4 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
  {
    // Aynı paketle yenileme: olay kaydı yalnız DEĞİŞİMİ anlatır.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const ab0 = d.havaleSatiri('H5', PRO, { erisimSonu: new GercekDate(T0 + 60 * GUN) });
    await d.havaleIleOde('H5', PRO, T0);
    const ab = d.oku('H5');
    check('H5 KONTROL: aynı paketle yenileme: paket Pro kalır, "paket.*" olayı YAZILMAZ, erişim uzar',
      ab.paketSurumuId === PRO && d.olaylar(/^paket\./, ab0.id).length === 0 &&
        ab.erisimSonu.getTime() === ayEkle(T0 + 60 * GUN, 12),
      `paket=${pk(ab.paketSurumuId)} olay=${d.olaylar(/^paket\./, ab0.id).map((o) => o.tip).join(',')}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Y — YENİ FİRMA (satır yok): KONTROL + aynı firmaya ikinci teklif
// ═════════════════════════════════════════════════════════════════════════
async function yBlogu(): Promise<void> {
  console.log('\n── Y · yeni firma (satır yok) ──');
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.firma('Y1');
    const t = await d.teklif('Y1', PRO, T0);
    const acilan = d.oku('Y1');
    const bekler = await d.karar('Y1', T0 + SAAT);
    olcum(`Y · teklif anında açılan satır: paket=${pk(acilan?.paketSurumuId)} durum=${acilan?.durum} · ` +
      `ödeme BEKLENİRKEN müşterinin gördüğü: erisimVar=${bekler.erisimVar} şerit="${bekler.uyari?.baslik}" → ${bekler.uyari?.eylem?.yol}`);
    await d.onayla(t.id!, T0 + GUN);
    const ab = d.oku('Y1');
    const yuz = await paketYuzu(d, 'Y1', T0 + 2 * GUN);
    check('Y1 KONTROL: yeni firmada teklifin paketi (Pro) satıra yazılır ve onayda AKTIF + HAVALE olur',
      ab.paketSurumuId === PRO && ab.durum === 'AKTIF' && ab.odemeYontemi === 'HAVALE',
      `paket=${pk(ab.paketSurumuId)} durum=${ab.durum}`);
    check('Y2 KONTROL: erişim kararı Pro; satır zaten Pro olduğu için "paket.*" olayı yok',
      yuz.kod === 'pro-mek' && yuz.koltuk === 2 && yuz.dwg === true && d.olaylar(/^paket\./, ab.id).length === 0,
      `${JSON.stringify(yuz)} olay=${d.olaylar(/^paket\./, ab.id).map((o) => o.tip).join(',')}`);
  }
  {
    // Yönetici önce yanlış paketle teklif verdi, iptal edip doğrusunu verdi.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.firma('Y3');
    const ilk = await d.teklif('Y3', BASIC, T0);
    await saatte(T0 + SAAT, () => d.havale.iptalEt(ilk.id!, 'yonetici-1', 'Yanlış paket'));
    const ikinci = await d.teklif('Y3', PRO, T0 + 2 * SAAT);
    await d.onayla(ikinci.id!, T0 + GUN);
    const ab = d.oku('Y3');
    olcum(`Y · yeni firmaya ikinci teklif (Basic iptal → Pro): onay sonrası paket=${pk(ab.paketSurumuId)}`);
    check('Y3 ⭐ iptal edilen ilk teklifin açtığı satırın paketi ödenen ikinci teklifi EZMİYOR (Pro)',
      ab.paketSurumuId === PRO, `paket=${pk(ab.paketSurumuId)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  P — A1 İZLERİ: karttaki planlı düşürme / bekleyen yükseltme
// ═════════════════════════════════════════════════════════════════════════
async function pBlogu(): Promise<void> {
  console.log('\n── P · karttan kalan A1 izleri havaleyle ödenen paketi değiştirmiyor ──');
  {
    // Pro kartlı müşteri dönem sonunda Basic'e düşürmeyi planlamıştı (A1:
    // özellik de ücret de DÖNEM SONUNDA). Sonra Pro'yu havaleyle 12 ay öder.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const donemSonu = T0 + 12 * GUN;
    const ab0 = d.kartliSatir('P1', PRO, {
      erisimSonu: new GercekDate(donemSonu),
      ek: { planliPaketSurumuId: BASIC, paketGecisTarihi: new GercekDate(donemSonu) },
    });
    const g0 = gunluk.length;
    await d.havaleIleOde('P1', PRO, T0);
    const once = d.oku('P1');
    const ekran = await paketYuzu(d, 'P1', T0 + GUN);
    await saatte(donemSonu + SAAT, () => d.degisim.vadesiGelenGecisleriUygula(new Date()));
    const sonra = d.oku('P1');
    const yuz = await paketYuzu(d, 'P1', donemSonu + 2 * SAAT);
    olcum(`P · planlı düşürmeli Pro satırı Pro havalesi sonrası: ${izler(once)} · tarama sonrası ` +
      `paket=${pk(sonra.paketSurumuId)} (havale ${tarih(sonra.erisimSonu)} tarihine kadar ödendi)`);
    check('P1 ⭐ havaleyle ödenen Pro, karttan kalan planlı düşürmeyle kart dönemi sonunda Basic\'e İNMİYOR',
      sonra.paketSurumuId === PRO && yuz.kod === 'pro-mek', `paket=${pk(sonra.paketSurumuId)} karar=${yuz.kod}`);
    check('P2 onayda üç kart izi silindi; müşteri ekranı "Basic\'e geçilecek" göstermiyor',
      kartIziYok(once) && ekran.paketGecisi === null, `${izler(once)} ekran=${JSON.stringify(ekran.paketGecisi)}`);
    const olay = d.olaylar(/^paket\./, ab0.id);
    check('P3 paket aynı kaldığı için olay "paket.degisimi.birakildi" (bırakılan planlı düşürme kayıtlı)',
      olay.length === 1 && olay[0].tip === 'paket.degisimi.birakildi' && olay[0].aktor === 'yonetici-1' &&
        olay[0].veri?.birakilanKartDegisimi?.planliPaketSurumuId === BASIC &&
        olay[0].veri?.birakilanKartDegisimi?.paketGecisTarihi === new GercekDate(donemSonu).toISOString() &&
        olay[0].veri?.yeniPaketSurumuId === PRO,
      `olay=${JSON.stringify(olay.map((o) => ({ tip: o.tip, veri: o.veri })))}`);
    check('P4 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
  {
    // Basic kartlı müşteri Pro'ya YÜKSELTTİ (A1: özellikler hemen, yeni ücret
    // dönem sonunda; `odenenPaketSurumuId` = Basic). Yeni ücret başlamadan
    // Pro'yu havaleyle 12 ay öder, sonra iptal eder (havalede yenileme yok).
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const donemSonu = T0 + 12 * GUN;
    const ab0 = d.kartliSatir('P5', PRO, {
      erisimSonu: new GercekDate(donemSonu),
      ek: { odenenPaketSurumuId: BASIC, paketGecisTarihi: new GercekDate(donemSonu) },
    });
    const g0 = gunluk.length;
    await d.havaleIleOde('P5', PRO, T0);
    const once = d.oku('P5');
    await saatte(T0 + GUN, () => d.satinAlma.iptalEt('P5', 'sahip-P5', 'Havaleyle ödedik, yenileme istemiyoruz'));
    const sonra = d.oku('P5');
    const yuz = await paketYuzu(d, 'P5', T0 + 2 * GUN);
    olcum(`P · bekleyen yükseltmeli satır Pro havalesi sonrası: ${izler(once)} · müşteri iptalinden sonra ` +
      `paket=${pk(sonra.paketSurumuId)} durum=${sonra.durum} erisimSonu=${tarih(sonra.erisimSonu)}`);
    check('P5 ⭐ havaleyle ödenen Pro, iptalde karttaki "ödenmiş paket" işaretiyle Basic\'e DÖNMÜYOR',
      sonra.paketSurumuId === PRO && yuz.kod === 'pro-mek' && d.olaylar(/^paket\.geri\.alindi$/).length === 0,
      `paket=${pk(sonra.paketSurumuId)} karar=${yuz.kod} geri.alindi=${d.olaylar(/^paket\.geri\.alindi$/).length}`);
    check('P6 iptal ödenmiş havale dönemini korur (IPTAL, erişim sonuna kadar Pro)',
      sonra.durum === 'IPTAL' && yuz.erisimVar === true, `durum=${sonra.durum} erisimVar=${yuz.erisimVar}`);
    const olay = d.olaylar(/^paket\./, ab0.id).find((o) => o.tip === 'paket.degisimi.birakildi');
    check('P7 olay "paket.degisimi.birakildi" bırakılan ödenmiş-paket işaretini kaydediyor',
      olay?.veri?.birakilanKartDegisimi?.odenenPaketSurumuId === BASIC, `olay=${JSON.stringify(olay?.veri)}`);
    check('P8 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
  {
    // Aynı bekleyen yükseltme, iptal YOK: kilit (`paketGecisTarihi`) havale
    // satırında kalsaydı 3 günlük emniyet süresi "tahsilat bildirimi gelmedi"
    // olayı yazardı — havalede iyzico tahsilatı hiç gelmeyecek.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const donemSonu = T0 + 12 * GUN;
    d.kartliSatir('P9', PRO, {
      erisimSonu: new GercekDate(donemSonu),
      ek: { odenenPaketSurumuId: BASIC, paketGecisTarihi: new GercekDate(donemSonu) },
    });
    await d.havaleIleOde('P9', PRO, T0);
    await saatte(donemSonu + 3 * GUN + SAAT, () => d.degisim.vadesiGelenGecisleriUygula(new Date()));
    const kilitOlayi = d.olaylar(/^paket\.degisim\.kilit\.zaman\.asimi$/);
    check('P9 havale satırında karttan kalan kilit "tahsilat bildirimi gelmedi" olayı ÜRETMİYOR; paket Pro',
      kilitOlayi.length === 0 && d.oku('P9').paketSurumuId === PRO,
      `olay=${kilitOlayi.length} paket=${pk(d.oku('P9').paketSurumuId)}`);
  }
  {
    // Bekleyen yükseltme (Pro, ödenmiş Basic) ve teklif ÖDENMİŞ pakete (Basic):
    // müşteri yükseltmeyi hiç ödemedi, havale Basic'i öder → Basic, hemen.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const donemSonu = T0 + 12 * GUN;
    const ab0 = d.kartliSatir('P10', PRO, {
      erisimSonu: new GercekDate(donemSonu),
      ek: { odenenPaketSurumuId: BASIC, paketGecisTarihi: new GercekDate(donemSonu) },
    });
    await d.havaleIleOde('P10', BASIC, T0);
    const ab = d.oku('P10');
    const olay = d.olaylar(/^paket\./, ab0.id);
    check('P10 bekleyen yükseltme + Basic teklifi: hesap Basic, izler silindi, TEK olay "paket.degisti" (izleriyle)',
      ab.paketSurumuId === BASIC && kartIziYok(ab) && olay.length === 1 && olay[0].tip === 'paket.degisti' &&
        olay[0].veri?.birakilanKartDegisimi?.odenenPaketSurumuId === BASIC,
      `paket=${pk(ab.paketSurumuId)} ${izler(ab)} olay=${JSON.stringify(olay.map((o) => ({ tip: o.tip, veri: o.veri })))}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  E — ALAN EKLENMEDEN ÖNCEKİ (PAKETSİZ) TEKLİF
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · göçten önce verilmiş paketsiz teklif ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const ab0 = d.kartliSatir('E1', BASIC, {
    erisimSonu: new GercekDate(T0 + 12 * GUN),
    ek: { planliPaketSurumuId: PRO, paketGecisTarihi: new GercekDate(T0 + 12 * GUN) },
  });
  // Göç öncesi satır: `paketSurumuId` sütunu NULL.
  const eski = d.db.ekle('havaleOdemesi', {
    abonelikId: ab0.id, durum: 'ODEME_BEKLENIYOR', tutar: new Prisma.Decimal(HAVALE_TUTARI), ayAdedi: 12,
    teklifNo: 'TKF-2026-0999', faturaNo: 'FTR-ESKI',
  });
  const eskiPaketi = eski.paketSurumuId; // onaydan ÖNCE okunur
  const g0 = gunluk.length;
  let hata: unknown = null;
  try {
    await saatte(T0, () => d.havale.odemeyiOnayla({ havaleId: eski.id, onaylayanId: 'yonetici-1' }));
  } catch (e) {
    hata = e;
  }
  const ab = d.oku('E1');
  const h = d.db.tablo('havaleOdemesi').find((x) => x.id === eski.id);
  check('E1 FIXTURE KANITI: teklif satırında paket YOK (göç öncesi)', eskiPaketi === null,
    `paketSurumuId=${eskiPaketi}`);
  check('E2 paketsiz teklif onaylanır: hata yok, ONAYLANDI, AKTIF + HAVALE',
    hata === null && h?.durum === 'ONAYLANDI' && ab.durum === 'AKTIF' && ab.odemeYontemi === 'HAVALE',
    `hata=${hataMetni(hata)} havale=${h?.durum} durum=${ab.durum}`);
  check('E3 paket DEĞİŞMEDİ (Basic — hangi paket için verildiği bilinmiyor, tahmin yok); kart izleri yine silindi',
    ab.paketSurumuId === BASIC && kartIziYok(ab), `paket=${pk(ab.paketSurumuId)} ${izler(ab)}`);
  check('E4 günlükte UYARI: "teklifin paketi kayıtlı değil … DEĞİŞTİRİLMEDİ"',
    uyarilarSonra(g0).some((m) => /teklifin paketi kayıtlı değil/.test(m) && /TKF-2026-0999/.test(m)),
    uyarilarSonra(g0).join(' · '));
  check('E5 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
//  R — YARIŞ: kart webhook'u ↔ havale onayı
// ═════════════════════════════════════════════════════════════════════════
/**
 * `odenenPaketeHizala`nın satır okuması (select: durum + paketSurumuId +
 * iyzicoAbonelikKodu, paketGecisTarihi YOK) — planlı geçiş ve kilit
 * okumalarından bu seçimle ayrılır.
 */
const hizalamaOkumasi = (arg: any) =>
  !!arg?.select?.iyzicoAbonelikKodu && !!arg?.select?.durum && !!arg?.select?.paketSurumuId &&
  !arg?.select?.paketGecisTarihi;

async function rBlogu(): Promise<void> {
  console.log('\n── R · YARIŞ: kart webhook\'u durumu onaydan önce, hizalamayı sonra yapar ──');
  {
    // KONTROL: onay yokken aynı yol KART satırını ödenen plana hizalar —
    // kanca doğru okumayı yakalıyor, hizalama KART'ta çalışıyor.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const donemSonu = T0 + 12 * GUN;
    d.kartliSatir('R0', PRO, { erisimSonu: new GercekDate(donemSonu), plan: 'plan-basic' });
    const kanca = d.db.kancaKur('abonelik', hizalamaOkumasi, async () => undefined);
    const sip = d.iyz.cekim('sub-R0', { baslangic: donemSonu, bitis: ayEkle(donemSonu, 1) })!;
    await saatte(donemSonu + SAAT, () => d.abonelik.tahsilatBasarili('sub-R0', sip));
    check('R0 KONTROL: kanca hizalama okumasında tetiklendi ve KART satırı ödenen plana (Basic) hizalandı',
      kanca.tetiklendi && d.oku('R0').paketSurumuId === BASIC && d.olaylar(/^paket\.hizalandi$/).length === 1,
      `kanca=${kanca.tetiklendi} paket=${pk(d.oku('R0').paketSurumuId)} hizalandi=${d.olaylar(/^paket\.hizalandi$/).length}`);
  }
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const donemSonu = T0 + 12 * GUN;
    const ab0 = d.kartliSatir('R1', BASIC, { erisimSonu: new GercekDate(donemSonu) });
    const t = await d.teklif('R1', PRO, T0);
    const g0 = gunluk.length;
    // Kart dönem sonunda Basic planından çekildi; webhook satırı KART iken okur,
    // durumu yazar — hizalama okumasından HEMEN önce yönetici havaleyi onaylar.
    const kanca = d.db.kancaKur('abonelik', hizalamaOkumasi, async () => {
      await d.onayla(t.id!, donemSonu + SAAT);
    });
    const sip = d.iyz.cekim('sub-R1', { baslangic: donemSonu, bitis: ayEkle(donemSonu, 1) })!;
    let hata: unknown = null;
    try {
      await saatte(donemSonu + SAAT, () => d.abonelik.tahsilatBasarili('sub-R1', sip));
    } catch (e) {
      hata = e;
    }
    const ab = d.oku('R1');
    const webhookGecisi = d.olaylar(/^durum\.degisti$/, ab0.id).some((o) => o.aktor === 'webhook');
    const h = d.db.tablo('havaleOdemesi').find((x) => x.id === t.id);
    check('R1 FIXTURE KANITI: webhook durumu onaydan ÖNCE yazdı, onay hizalama okumasından önce koştu',
      kanca.tetiklendi && webhookGecisi && h?.durum === 'ONAYLANDI' && hata === null,
      `kanca=${kanca.tetiklendi} webhookGecisi=${webhookGecisi} havale=${h?.durum} hata=${hataMetni(hata)}`);
    olcum(`R · yarış sonrası: paket=${pk(ab.paketSurumuId)} yöntem=${ab.odemeYontemi} ` +
      `hizalandi=${d.olaylar(/^paket\.hizalandi$/, ab0.id).length}`);
    check('R2 ⭐ yarışta havaleyle ödenen Pro, kartın eski planına (Basic) GERİ ÇEKİLMEDİ',
      ab.paketSurumuId === PRO && ab.odemeYontemi === 'HAVALE' && d.olaylar(/^paket\.hizalandi$/, ab0.id).length === 0,
      `paket=${pk(ab.paketSurumuId)} hizalandi=${d.olaylar(/^paket\.hizalandi$/, ab0.id).length}`);
    check('R3 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  A — YARIŞ: A1 paket değişimi ↔ havale onayı (kod incelemesi ORTA-1)
// ═════════════════════════════════════════════════════════════════════════
/**
 * Pro kartlı müşteri "Basic'e geç"e (dönem sonu) basar; A1 satırı KART iken
 * okur, iyzico değişimi UYGULAR ama yanıt ağda bekler. O sırada yönetici Pro
 * havalesini onaylar: işlem commit olur (HAVALE + Pro), fatura kuyruğa alınır,
 * müşteri e-postası giderken A1'in koşullu son yazımı koşar — kart kapatma
 * e-postadan SONRA olduğu için satırda hâlâ ESKİ uç, AKTIF, kilit yok.
 */
async function aBlogu(): Promise<void> {
  console.log('\n── A · YARIŞ: A1 değişimi iyzico\'yu beklerken havale onaylanır ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const donemSonu = T0 + 12 * GUN;
  d.kartliSatir('A1', PRO, { erisimSonu: new GercekDate(donemSonu) });
  const t = await d.teklif('A1', PRO, T0);

  const sira: string[] = [];
  let a1Bitti: () => void = () => undefined;
  const a1BittiSoz = new Promise<void>((r) => (a1Bitti = r));
  let epostada: () => void = () => undefined;
  const epostadaSoz = new Promise<void>((r) => (epostada = r));
  const kos: { onay: Promise<void> | null; onayHata: unknown; a1Hata: unknown } = { onay: null, onayHata: null, a1Hata: null };
  // iyzico değişimi uyguladı, yanıt ağda: yönetici ŞİMDİ onaylar; yanıt,
  // onay müşteri e-postasına gelene dek dönmez.
  d.iyz.degisimdeKanca(async () => {
    sira.push('iyzico-degisti');
    kos.onay = (async () => {
      await d.havale.faturaKesildi(t.id!, 'FTR-A1', 'yonetici-1');
      await d.havale.odemeyiOnayla({ havaleId: t.id!, onaylayanId: 'yonetici-1' });
    })()
      .catch((e) => {
        kos.onayHata = e;
      })
      .finally(() => sira.push('onay-bitti'));
    await epostadaSoz;
  });
  // Onayın işlemi commit oldu, müşteri e-postası gidiyor: A1'in son yazımı
  // BURADA koşar; kart kapatma e-postadan SONRA (havale.servisi sırası).
  d.epostadaKanca(/aboneliğiniz uzatıldı/, async () => {
    sira.push('onay-eposta');
    epostada();
    await a1BittiSoz;
  });
  const g0 = gunluk.length;
  await saatte(T0 + SAAT, async () => {
    await d.degisim
      .degistir({ firmaId: 'A1', kullaniciId: 'sahip-A1', paketSurumuId: BASIC, sozlesmeOnayi: true })
      .catch((e) => {
        kos.a1Hata = e;
      })
      .finally(() => {
        sira.push('a1-bitti');
        a1Bitti();
      });
    await kos.onay;
  });
  const ab = d.oku('A1');
  check('A0 FIXTURE KANITI: iyzico değişti → onay e-postada → A1 son yazımı → onay bitti (kart kapatma en sonda)',
    sira.join(' > ') === 'iyzico-degisti > onay-eposta > a1-bitti > onay-bitti' && kos.onayHata === null,
    `sıra=${sira.join(' > ')} onayHata=${hataMetni(kos.onayHata)}`);
  const kod = kos.a1Hata instanceof ConflictException ? (kos.a1Hata.getResponse() as Satir)?.kod : null;
  check('A1 ⭐ A1\'in son yazımı havale satırına DÜŞMEDİ: 409 ABONELIK_DEGISTI; hesap HAVALE + Pro, kart izi yok',
    kod === 'ABONELIK_DEGISTI' && ab.odemeYontemi === 'HAVALE' && ab.paketSurumuId === PRO && kartIziYok(ab),
    `a1=${hataMetni(kos.a1Hata)} kod=${kod} yöntem=${ab.odemeYontemi} paket=${pk(ab.paketSurumuId)} ${izler(ab)}`);
  check('A2 iyzico\'daki yeni uç onayın kart kapatmasında (201403 → canlı uç) KAPATILDI; satır o uca bağlandı',
    d.iyz.durum('sub-A1-u1') === 'CANCELED' && ab.iyzicoAbonelikKodu === 'sub-A1-u1' && ab.iyzicoDurum === 'CANCELED',
    `u1=${d.iyz.durum('sub-A1-u1')} satır kodu=${ab.iyzicoAbonelikKodu} iyzicoDurum=${ab.iyzicoDurum}`);
  await saatte(donemSonu + SAAT, () => d.degisim.vadesiGelenGecisleriUygula(new Date()));
  const yuz = await paketYuzu(d, 'A1', donemSonu + 2 * SAAT);
  check('A3 kart dönemi sonunda tarama A1\'in Basic düşürmesini UYGULAMADI (havaleyle ödenen Pro sürüyor)',
    d.oku('A1').paketSurumuId === PRO && yuz.kod === 'pro-mek', `paket=${pk(d.oku('A1').paketSurumuId)} karar=${yuz.kod}`);
  check('A4 yalnız BEKLENEN hata (A1 "PAKET DEGISIMI YARIM" — iyzico değişti, yerel yazım reddedildi)',
    beklenmeyenHatalar(g0, [/PAKET DEGISIMI YARIM/]).length === 0,
    beklenmeyenHatalar(g0, [/PAKET DEGISIMI YARIM/]).join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
//  W — ONAYDA KART İPTALİ DÜŞTÜ, iyzico SONRA ESKİ PLANLA ÇEKTİ
// ═════════════════════════════════════════════════════════════════════════
async function wBlogu(): Promise<void> {
  console.log('\n── W · iptal düştü, iyzico eski (Basic) planla çekti ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const kartSonu = T0 + 12 * GUN;
  const ab0 = d.kartliSatir('W1', BASIC, { erisimSonu: new GercekDate(kartSonu) });
  d.iyz.iptaliBoz('sub-W1', new IyzicoHatasi('100001', 'Sistem hatası', 500));
  const g0 = gunluk.length;
  await d.havaleIleOde('W1', PRO, T0);
  const onayda = d.oku('W1');
  const sip = d.iyz.cekim('sub-W1', { baslangic: kartSonu, bitis: ayEkle(kartSonu, 1) })!;
  let donus: unknown = 'koşmadı';
  let hata: unknown = null;
  // Fırlatma da ÖLÇÜLÜR (blok çökmesi değil): havale dalı olmasaydı olay
  // yeniden denenmek üzere fırlardı — bu da bir kırmızıdır.
  await saatte(kartSonu + SAAT, async () => {
    try {
      donus = await d.abonelik.tahsilatBasarili('sub-W1', sip);
    } catch (e) {
      hata = e;
    }
  });
  const ab = d.oku('W1');
  check('W1 FIXTURE KANITI: onayda iptal düştü (iyzico ACTIVE), onay yine geçti (Pro, HAVALE)',
    d.iyz.durum('sub-W1') === 'ACTIVE' && onayda.paketSurumuId === PRO && onayda.odemeYontemi === 'HAVALE',
    `iyzico=${d.iyz.durum('sub-W1')} paket=${pk(onayda.paketSurumuId)}`);
  check('W2 ⭐ eski Basic planının çekimi havaleyle ödenen Pro\'yu DEĞİŞTİRMEDİ; erişim de değişmedi; olay işlendi',
    hata === null && donus === null && ab.paketSurumuId === PRO && ab.erisimSonu.getTime() === onayda.erisimSonu.getTime(),
    `hata=${hataMetni(hata)} dönüş=${JSON.stringify(donus)} paket=${pk(ab.paketSurumuId)} erisimSonu=${tarih(ab.erisimSonu)}`);
  check('W3 çekim "tahsilat.cift" olarak kaydedildi, yöneticiye iade e-postası gitti',
    d.olaylar(/^tahsilat\.cift$/, ab0.id).length === 1 && d.yoneticiye().some((e) => /Çift tahsilat/.test(e.konu)),
    `olay=${d.olaylar(/^tahsilat\.cift$/, ab0.id).length} yönetici=${d.yoneticiye().map((e) => e.konu).join(' · ')}`);
  check('W4 yalnız BEKLENEN hatalar (iptal başarısızlığı + çift tahsilat uyarısı)',
    beklenmeyenHatalar(g0, [/KART ABONELIGI IPTAL EDILEMEDI/, /CIFT TAHSILAT/]).length === 0,
    beklenmeyenHatalar(g0, [/KART ABONELIGI IPTAL EDILEMEDI/, /CIFT TAHSILAT/]).join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
//  S — KOLTUK: düşürme ekip üyesini durdurur (Emre kararı, 25.09)
// ═════════════════════════════════════════════════════════════════════════
/**
 * Gerçek koltuk kuralı (`koltukDurumuHesapla` — JwtStrategy her istekte bunu
 * çağırır): verilen hesaplardan hangileri DURDU (e-postaları).
 */
async function duranlar(d: Dunya, hesaplar: Satir[]): Promise<string[]> {
  const sonuc: string[] = [];
  for (const h of hesaplar) {
    const k = await koltukDurumuHesapla(d.db.prisma, {
      id: h.id, firmaId: h.firmaId, firmaRol: h.firmaRol, createdAt: h.createdAt,
    });
    if (k.durduruldu) sonuc.push(h.email);
  }
  return sonuc;
}

/** Onay e-postasının (müşteri) tüm paragrafları tek metin. */
const onayMetni = (d: Dunya, firmaId: string) =>
  (d.musteriEpostasi(firmaId).find((e) => /aboneliğiniz uzatıldı/.test(e.konu))?.paragraflar ?? []).join(' ');

async function sBlogu(): Promise<void> {
  console.log('\n── S · koltuk: düşürmede duran ekip üyesi (yönetici uyarısı + müşteri e-postası) ──');
  {
    // Miras 5 kişilik HAVALE satırı; 5 etkin hesap (1 sahip + 4 üye) + banlı ve
    // silinmiş birer üye. Pro-MEP (3 kişilik) yenilemesi → 2 kişi durur.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.havaleSatiri('S1', MIRAS, { erisimSonu: new GercekDate(T0 + 60 * GUN) });
    const sahip = d.uye('S1', 'sahip', 500);
    const u1 = d.uye('S1', 'uye', 400);
    const u2 = d.uye('S1', 'uye', 300);
    const u3 = d.uye('S1', 'uye', 200);
    const u4 = d.uye('S1', 'uye', 100);
    d.uye('S1', 'uye', 50, { status: 'banned' });
    d.uye('S1', 'uye', 40, { deletedAt: new GercekDate(T0 - GUN) });
    const etkinler = [sahip, u1, u2, u3, u4];
    const onceki = await duranlar(d, etkinler);
    check('S1 FIXTURE KANITI: 5 kişilik mirasta 5 etkin hesabın hiçbiri durmuyor (banlı + silinmiş hesap da var)',
      onceki.length === 0 && d.db.tablo('user').filter((x) => x.firmaId === 'S1').length === 7, `duran=${onceki.join(',')}`);

    const t = await d.teklif('S1', MEP, T0);
    const u = t.yanit?.uyari;
    olcum(`S · miras 5 → Pro-MEP 3 teklif yanıtı: uyari=${JSON.stringify(u)}`);
    check('S2 ⭐ teklif yanıtı yöneticiyi ÖNCEDEN uyarıyor: 5 etkin, yeni sınır 3, 2 kişi durur — teklif REDDEDİLMEDİ',
      t.id !== null && u?.durdurulacakUyeSayisi === 2 && u?.yeniSinir === 3 && u?.mevcutAktif === 5,
      `hata=${hataMetni(t.hata)} uyari=${JSON.stringify(u)}`);
    const mesaj = String(u?.mesaj ?? '');
    check('S3 uyarının düz metni sayıları ve kimin durduğunu söylüyor (5 etkin · 3 kişilik · en son katılan 2 kişi)',
      /5 etkin/.test(mesaj) && /3 kişilik/.test(mesaj) && /en son katılan 2 kişi/.test(mesaj), mesaj);

    await d.onayla(t.id!, T0 + GUN);
    const sonra = await duranlar(d, etkinler);
    check('S4 ÖLÇÜM: onaydan sonra gerçek koltuk kuralı EN SON katılan 2 üyeyi durduruyor; sahip ve eski üyeler çalışıyor',
      sonra.join(',') === [u3.email, u4.email].join(','), `duran=${sonra.join(',')}`);
    const metin = onayMetni(d, 'S1');
    olcum(`S · onay e-postası: "${metin}"`);
    // Düzeltme yolu KODDAKİ gibi: Ekip sayfası yalnız firma sahibine görünür
    // (Sidebar YALNIZ_YONETICIYE); havale satırında paket değişimi self-servis
    // DEĞİL (A1 `HAVALE` reddi: "bizimle iletişime geçin").
    check('S5 ⭐ onay e-postası açıkça söylüyor: firma sahibi dahil 3 kişilik · 2 kişinin erişimi durduruldu · en son katılanlar · veriler silinmedi · sahip hesabıyla Ekip sayfası · büyük paket için iletişim',
      /firma sahibi dahil 3 kişilik/.test(metin) && /2 kişinin erişimi durduruldu/.test(metin) &&
        /en son katılan/.test(metin) && /silinmedi/.test(metin) && /[Ff]irma sahibi hesabıyla/.test(metin) &&
        /Ekip sayfası/.test(metin) && /ekipten çıkar/.test(metin) && /iletişime geç/.test(metin),
      metin);
    check('S6 onay hiçbir hesabı silmedi ya da değiştirmedi (durdurma türetilir, saklanmaz)',
      d.db.tablo('user').filter((x) => x.firmaId === 'S1' && x.deletedAt === null && x.status === 'active').length === 5);

    // E-postadaki İKİ düzeltme yolunu ÖLÇ (tahmin değil): (1) bir üyeyi
    // ekipten çıkarmak (hesap kapanır → etkin sayılmaz) en eski duran üyeyi
    // açar; (2) paket büyüyünce hepsi açılır.
    const cikarilan = d.db.tablo('user').find((x) => x.id === u1.id)!;
    cikarilan.deletedAt = new GercekDate(T0 + 2 * GUN);
    const cikarinca = await duranlar(d, [sahip, u2, u3, u4]);
    const satir = d.db.tablo('abonelik').find((r) => r.firmaId === 'S1')!;
    satir.paketSurumuId = MIRAS;
    const buyuyunce = await duranlar(d, [sahip, u2, u3, u4]);
    check('S7 düzeltme yolları gerçekten açıyor: bir üye ekipten çıkınca yalnız en yeni üye durur; paket büyüyünce kimse durmaz',
      cikarinca.join(',') === u4.email && buyuyunce.length === 0,
      `çıkarınca=${cikarinca.join(',')} büyüyünce=${buyuyunce.join(',')}`);
  }
  {
    // KART Pro (2 kişilik) + 2 etkin → Basic (1): 1 kişi durur.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('S8', PRO, { erisimSonu: new GercekDate(T0 + 12 * GUN) });
    d.uye('S8', 'sahip', 300);
    d.uye('S8', 'uye', 100);
    const t = await d.teklif('S8', BASIC, T0);
    await d.onayla(t.id!, T0 + SAAT);
    const metin = onayMetni(d, 'S8');
    check('S8 kartlı Pro → Basic: yanıtta 2 etkin / sınır 1 / 1 durur; e-postada "1 kişilik" ve "1 kişinin erişimi durduruldu"',
      t.yanit?.uyari?.durdurulacakUyeSayisi === 1 && t.yanit?.uyari?.yeniSinir === 1 && t.yanit?.uyari?.mevcutAktif === 2 &&
        /firma sahibi dahil 1 kişilik/.test(metin) && /1 kişinin erişimi durduruldu/.test(metin),
      `uyari=${JSON.stringify(t.yanit?.uyari)} e-posta="${metin}"`);
  }
  {
    // YÜKSELTME: Basic (1) + 2 etkin (üye ŞU AN durmuş) → Pro (2): uyarı yok.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.havaleSatiri('S9', BASIC, { erisimSonu: new GercekDate(T0 + 30 * GUN) });
    d.uye('S9', 'sahip', 300);
    d.uye('S9', 'uye', 100);
    const t = await d.teklif('S9', PRO, T0);
    await d.onayla(t.id!, T0 + SAAT);
    const metin = onayMetni(d, 'S9');
    check('S9 yükseltmede uyarı YOK: yanıtta uyari=null, e-postada koltuk cümlesi yok',
      t.id !== null && t.yanit?.uyari === null && !/erişimi durduruldu/.test(metin) && /uzatıldı/.test(metin),
      `uyari=${JSON.stringify(t.yanit?.uyari)} e-posta="${metin}"`);
  }
  {
    // AYNI PAKET: Pro (2) + 3 etkin (biri ZATEN durmuş) → Pro yenileme: uyarı yok.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.havaleSatiri('S10', PRO, { erisimSonu: new GercekDate(T0 + 30 * GUN) });
    d.uye('S10', 'sahip', 300);
    d.uye('S10', 'uye', 200);
    d.uye('S10', 'uye', 100);
    const t = await d.teklif('S10', PRO, T0);
    await d.onayla(t.id!, T0 + SAAT);
    const metin = onayMetni(d, 'S10');
    check('S10 aynı paketle yenilemede uyarı YOK (önceden duran üye bu işlemin sonucu değil)',
      t.id !== null && t.yanit?.uyari === null && !/erişimi durduruldu/.test(metin),
      `uyari=${JSON.stringify(t.yanit?.uyari)} e-posta="${metin}"`);
  }
  {
    // DÜŞÜRME ama sınır aşılmıyor: Pro → Basic, yalnız sahip → uyarı yok.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('S11', PRO, { erisimSonu: new GercekDate(T0 + 12 * GUN) });
    d.uye('S11', 'sahip', 300);
    d.uye('S11', 'uye', 100, { status: 'banned' });
    const t = await d.teklif('S11', BASIC, T0);
    await d.onayla(t.id!, T0 + SAAT);
    const metin = onayMetni(d, 'S11');
    check('S11 düşürmede kimse durmuyorsa uyarı YOK (tek etkin hesap; banlı üye sayılmaz)',
      t.id !== null && t.yanit?.uyari === null && !/erişimi durduruldu/.test(metin),
      `uyari=${JSON.stringify(t.yanit?.uyari)} e-posta="${metin}"`);
  }
  {
    // ZATEN AŞMIŞ firma düşürülür: Pro (2) + 3 etkin (biri ŞU AN durmuş) → Basic (1).
    // Uyarı çıkar (bu değişim bir kişiyi daha durdurur) ve TOPLAMI söyler: 2.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.havaleSatiri('S13', PRO, { erisimSonu: new GercekDate(T0 + 30 * GUN) });
    const sahip = d.uye('S13', 'sahip', 300);
    const eski = d.uye('S13', 'uye', 200);
    const yeni = d.uye('S13', 'uye', 100);
    const once = await duranlar(d, [sahip, eski, yeni]);
    const t = await d.teklif('S13', BASIC, T0);
    await d.onayla(t.id!, T0 + SAAT);
    const sonra = await duranlar(d, [sahip, eski, yeni]);
    const metin = onayMetni(d, 'S13');
    check('S13 sınırı zaten aşmış firmada düşürme: uyarı TOPLAMI söyler (2 durur; 1\'i önceden duruyordu) — e-posta da 2',
      once.join(',') === yeni.email && sonra.join(',') === [eski.email, yeni.email].join(',') &&
        t.yanit?.uyari?.durdurulacakUyeSayisi === 2 && t.yanit?.uyari?.mevcutAktif === 3 && t.yanit?.uyari?.yeniSinir === 1 &&
        /2 kişinin erişimi durduruldu/.test(metin),
      `önce=${once.join(',')} sonra=${sonra.join(',')} uyari=${JSON.stringify(t.yanit?.uyari)} e-posta="${metin}"`);
  }
  {
    // YENİ FİRMA (satır yok), yalnız sahip → Basic: uyarı yok.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.firma('S12');
    d.uye('S12', 'sahip', 300);
    const t = await d.teklif('S12', BASIC, T0);
    check('S12 yeni firmada (satır yok, tek sahip) uyarı YOK', t.id !== null && t.yanit?.uyari === null,
      `uyari=${JSON.stringify(t.yanit?.uyari)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  C — KART ABONELİĞİ AÇIKKEN HAVALE SATIŞI (25.09 — Emre: "uyar + onayda bildir")
// ═════════════════════════════════════════════════════════════════════════
/**
 * Teklif ile onay arasında (havale günlerce sürer) kart aboneliği iyzico'da
 * AÇIK: yenileme çekimi o pencereye düşerse satır hâlâ KART'tır — webhook onu
 * OLAĞAN yenileme sayar (çift tahsilat dalı HAVALE satırına bakar). ÖLÇÜLDÜ
 * (düzeltme öncesi): kartlı AKTIF, DENEME ve kartı düşmüş (UNPAID) satırda
 * kart pencerede sessizce bir dönem daha çekildi; yöneticiye e-posta 0, olay
 * 0, teklif yanıtında kart bilgisi yok. Erişim üst üste eklendiği için aynı
 * dönem iki kez ödenmiyor, ama müşteri istemediği bir kart dönemini ödüyor.
 * KARAR: teklif iyzico'dan canlı durumu okuyup `kartUyarisi` döner (teklif
 * REDDEDİLMEZ); onay, tekliften sonra karttan çekim olduysa yöneticiye
 * e-posta + olay yazar ve yanıtında `kartCekimleri` taşır.
 */
async function cBlogu(): Promise<void> {
  console.log('\n── C · kart aboneliği açıkken havale satışı (teklif ↔ onay penceresi) ──');
  /** Teklif → (pencerede çekim/ret/yok) → onay. */
  const pencere = async (
    kur: (d: Dunya, T0: number) => {
      firmaId: string; kod: string; cekimAni: number; baslangic: number;
      olay?: 'cekim' | 'ret' | 'yok' | 'kodsuz' | 'cift';
      /** Tekliften ÖNCE gerçek yoldan koşan adım (ör. önceki dönemin çekimi). */
      once?: () => Promise<void>;
    },
  ) => {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const s = kur(d, T0);
    if (s.once) await s.once();
    const teklifteAb = d.oku(s.firmaId);
    const getir0 = d.iyz.sayi('abonelikGetir', s.kod);
    const t = await d.teklif(s.firmaId, PRO, T0);
    const teklifteOkuma = d.iyz.sayi('abonelikGetir', s.kod) - getir0;
    const y0 = d.yoneticiye().length;
    let sip: string | null = null;
    const olay = s.olay ?? 'cekim';
    if (olay === 'cekim' || olay === 'cift') {
      sip = d.iyz.cekim(s.kod, { baslangic: s.baslangic, bitis: ayEkle(s.baslangic, 1) });
      if (sip) await saatte(s.cekimAni, () => d.abonelik.tahsilatBasarili(s.kod, sip!));
      // GERÇEK yol: aynı webhook olayı ikinci kez işlenir (fatura kuyruğu düşünce
      // işleyici baştan koşar) — ikinci bir `durum.degisti` olayı yazılır.
      if (sip && olay === 'cift') await saatte(s.cekimAni + 60_000, () => d.abonelik.tahsilatBasarili(s.kod, sip!));
    } else if (olay === 'ret') {
      sip = d.iyz.ret(s.kod, { baslangic: s.baslangic, bitis: ayEkle(s.baslangic, 1) });
      await saatte(s.cekimAni, () => d.abonelik.tahsilatBasarisiz(s.kod, sip!));
    } else if (olay === 'kodsuz') {
      // SENTETİK: bugün bu geçişi yazan yol yok (`tahsilatBasarili` hep sipariş
      // kodludur) — okuyucunun sözleşmesi ölçülür: kodsuz çekim düşürülmez.
      const ab = d.oku(s.firmaId);
      d.db.ekle('abonelikOlayi', {
        abonelikId: ab.id, tip: 'durum.degisti', aktor: 'webhook', oncekiDurum: ab.durum, yeniDurum: 'AKTIF',
        aciklama: 'Tahsilat başarılı (sipariş kodu yok)', veri: {}, olusturuldu: new GercekDate(s.cekimAni),
      });
    }
    const g0 = gunluk.length;
    // Teklif düştüyse onaya gidilmez: blok çökmesin, düşüşü assert yakalasın (C10 `t.id`).
    const yanit = t.id ? await d.onayla(t.id, s.cekimAni + 2 * GUN) : null;
    const ab = d.oku(s.firmaId);
    return {
      d, T0, t, yanit, ab, sip, teklifteOkuma, g0, teklifteAb,
      ku: t.yanit?.kartUyarisi,
      kartEpostasi: d.yoneticiye().slice(y0).filter((e) => /kart/i.test(e.konu)),
      kartOlayi: d.olaylar(/^havale\.onay\.kart\.cekimi$/, ab.id),
      teklifOlayi: d.olaylar(/^havale\.teklif\.olusturuldu$/, ab.id)[0],
    };
  };
  const bildirildi = (c: Awaited<ReturnType<typeof pencere>>) =>
    c.kartEpostasi.length === 1 && c.kartEpostasi[0].paragraflar.join(' ').includes(String(c.sip)) &&
    /iade/.test(c.kartEpostasi[0].paragraflar.join(' ')) &&
    // Kart kapatma SONUCU aynı e-postada (onay kartı az önce kapattı).
    /şimdi iyzico'da iptal edildi/.test(c.kartEpostasi[0].paragraflar.join(' ')) &&
    c.kartOlayi.length === 1 && (c.kartOlayi[0].veri?.siparisler ?? []).includes(c.sip) &&
    c.yanit?.kartCekimleri?.length === 1 && c.yanit.kartCekimleri[0].siparisKodu === c.sip;
  const bildirimOzeti = (c: Awaited<ReturnType<typeof pencere>>) =>
    `e-posta=${c.kartEpostasi.map((e) => e.konu).join(' | ')} olay=${c.kartOlayi.length} ` +
    `yanıt=${JSON.stringify(c.yanit?.kartCekimleri)} sip=${c.sip}`;

  // C1 — KART AKTIF: dönem 5 gün sonra bitiyor; teklif bugün, onay 7. gün.
  const c1 = await pencere((d, T0) => {
    d.kartliSatir('C1', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    // Bu dönemin çekimi TEKLİFTEN ÖNCE (gerçek webhook yolu): iyzico'da ödenmiş dönem T0+5'te
    // biter — sonraki çekim tarihi iyzico'nun KENDİ siparişinden okunur (inceleme D1).
    const once = async () => {
      const sip = d.iyz.cekim('sub-C1', { baslangic: ayEkle(T0 + 5 * GUN, -1), bitis: T0 + 5 * GUN })!;
      await saatte(ayEkle(T0 + 5 * GUN, -1), () => d.abonelik.tahsilatBasarili('sub-C1', sip));
    };
    return { firmaId: 'C1', kod: 'sub-C1', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN, once };
  });
  check('C1 ⭐ teklif iyzico\'dan canlı durumu OKUYOR ve uyarıyor: ACTIVE · doğrulandı · sonraki çekim dönem sonu · tutar — teklif REDDEDİLMEDİ',
    c1.t.id !== null && c1.teklifteOkuma >= 1 && c1.ku?.iyzicoDurum === 'ACTIVE' && c1.ku?.dogrulandi === true &&
      c1.ku?.sonrakiCekim === new GercekDate(c1.T0 + 5 * GUN).toISOString() && c1.ku?.tutar === '1299.00' &&
      c1.ku?.paraBirimi === 'TRY' && c1.ku?.sonrakiCekimKaynagi === 'iyzico',
    `okuma=${c1.teklifteOkuma} uyari=${JSON.stringify(c1.ku)}`);
  const m1 = String(c1.ku?.mesaj ?? '');
  olcum(`C · kart uyarısı: "${m1}"`);
  check('C2 uyarı metni: sonraki çekim tarihi, "bir dönem daha", müşterinin iptal yolu (Hesabım → Abonelik → Aboneliği iptal et)',
    m1.includes(tarihYaz(new GercekDate(c1.T0 + 5 * GUN))) && /bir dönem daha/.test(m1) && /Aboneliği iptal et/.test(m1) &&
      !/kesin değil/.test(m1),
    m1);
  check('C3 teklif olayı kart uyarısının izini taşıyor (durum + sonraki çekim + tarihin kaynağı)',
    c1.teklifOlayi?.veri?.kart?.iyzicoDurum === 'ACTIVE' &&
      c1.teklifOlayi?.veri?.kart?.sonrakiCekim === new GercekDate(c1.T0 + 5 * GUN).toISOString() &&
      c1.teklifOlayi?.veri?.kart?.sonrakiCekimKaynagi === 'iyzico',
    JSON.stringify(c1.teklifOlayi?.veri));
  const e1 = c1.kartEpostasi.length === 1 ? c1.kartEpostasi[0].paragraflar.join(' ') : '';
  olcum(`C · onayda kart bildirimi: "${e1}"`);
  check('C4 ⭐ onay: tekliften SONRA karttan çekim oldu → yöneticiye TEK e-posta (sipariş, iade yolu, kart kapatma sonucu)',
    c1.kartEpostasi.length === 1 && e1.includes(String(c1.sip)) && /iade/.test(e1) && /şimdi iyzico'da iptal edildi/.test(e1),
    bildirimOzeti(c1));
  check('C4b onay: olay havale.onay.kart.cekimi siparişi taşıyor',
    c1.kartOlayi.length === 1 && JSON.stringify(c1.kartOlayi[0].veri?.siparisler) === JSON.stringify([c1.sip]),
    JSON.stringify(c1.kartOlayi.map((o) => o.veri)));
  check('C4c onay yanıtı kartCekimleri = [bu sipariş]',
    c1.yanit?.kartCekimleri?.length === 1 && c1.yanit.kartCekimleri[0].siparisKodu === c1.sip,
    JSON.stringify(c1.yanit?.kartCekimleri));
  {
    const bas = new GercekDate(c1.T0 + 5 * GUN);
    const son = new GercekDate(ayEkle(c1.T0 + 5 * GUN, 1));
    check('C4d e-posta çekimin TUTARINI, kart dönemini ve ERİŞİME ETKİSİNİ söylüyor (uzattı → iade erişimi KISALTMAZ)',
      e1.includes('₺1.299,00') && e1.includes(`kart dönemi ${tarihYaz(bas)} – ${tarihYaz(son)}`) &&
        e1.includes(`erişimi ${tarihYaz(bas)} → ${tarihYaz(son)} uzattı`) && /İade erişimi kendiliğinden KISALTMAZ/.test(e1),
      e1);
  }
  check('C5 onay yine TAMAM (bildirim onayı durdurmaz): AKTIF + HAVALE, kart iyzico\'da kapatıldı; yutulan hata yok',
    c1.ab.durum === 'AKTIF' && c1.ab.odemeYontemi === 'HAVALE' && c1.d.iyz.durum('sub-C1') === 'CANCELED' &&
      hatalarSonra(c1.g0).length === 0,
    `durum=${c1.ab.durum} yöntem=${c1.ab.odemeYontemi} iyzico=${c1.d.iyz.durum('sub-C1')} hata=${hatalarSonra(c1.g0).join(' · ')}`);

  // C6 — DENEME: deneme 3 gün sonra bitiyor (ilk çekim), erişim tamponu +2 gün.
  const c6 = await pencere((d, T0) => {
    d.kartliSatir('C6', BASIC, {
      erisimSonu: new GercekDate(T0 + 5 * GUN),
      ek: { durum: 'DENEME', denemeSonu: new GercekDate(T0 + 3 * GUN) },
    });
    return { firmaId: 'C6', kod: 'sub-C6', cekimAni: T0 + 3 * GUN, baslangic: T0 + 3 * GUN };
  });
  check('C6 DENEME: sonraki çekim DENEME SONU (erişim tamponu değil); ilk çekim pencerede → onayda bildirim',
    c6.ku?.iyzicoDurum === 'ACTIVE' && c6.ku?.sonrakiCekim === new GercekDate(c6.T0 + 3 * GUN).toISOString() &&
      c6.ku?.sonrakiCekimKaynagi === 'iyzico' &&
      bildirildi(c6),
    `uyari=${JSON.stringify(c6.ku)} ${bildirimOzeti(c6)}`);

  // C7 — KARTI DÜŞMÜŞ (UNPAID, ODEME_BEKLIYOR): tarih bilinmez, yeniden deneme her an geçebilir.
  const c7 = await pencere((d, T0) => {
    d.kartliSatir('C7', BASIC, {
      // Erişim tamponu (köprü) HÂLÂ gelecekte: tarih yine gösterilmemeli.
      erisimSonu: new GercekDate(T0 + GUN),
      ek: { durum: 'ODEME_BEKLIYOR', iyzicoDurum: 'UNPAID', ilkBasarisizlik: new GercekDate(T0 - 2 * GUN) },
    });
    d.iyz.durumYaz('sub-C7', 'UNPAID');
    return { firmaId: 'C7', kod: 'sub-C7', cekimAni: T0 + GUN, baslangic: T0 - 2 * GUN };
  });
  check('C7 UNPAID: uyarı "ödeme bekliyor", tarih YOK (yeniden deneme her an); pencerede geçen çekim onayda bildirildi',
    c7.ku?.iyzicoDurum === 'UNPAID' && c7.ku?.sonrakiCekim === null && /yeniden deneme/.test(String(c7.ku?.mesaj)) &&
      bildirildi(c7),
    `uyari=${JSON.stringify(c7.ku)} ${bildirimOzeti(c7)}`);

  // C8 — KONTROL: kart aboneliği BİLİNEN kapalı (müşteri iptal etti) → okuma yok, uyarı yok.
  const c8 = await pencere((d, T0) => {
    d.kartliSatir('C8', BASIC, {
      erisimSonu: new GercekDate(T0 + 5 * GUN),
      ek: { durum: 'IPTAL', iyzicoDurum: 'CANCELED', iptalTalebi: new GercekDate(T0 - GUN) },
    });
    d.iyz.durumYaz('sub-C8', 'CANCELED');
    return { firmaId: 'C8', kod: 'sub-C8', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN };
  });
  check('C8 KONTROL: bilinen kapalı kart → iyzico\'ya gidilmez, kartUyarisi=null, onayda kart bildirimi yok',
    c8.t.id !== null && c8.teklifteOkuma === 0 && c8.ku === null && c8.kartEpostasi.length === 0 &&
      c8.kartOlayi.length === 0 && Array.isArray(c8.yanit?.kartCekimleri) && c8.yanit.kartCekimleri.length === 0,
    `okuma=${c8.teklifteOkuma} uyari=${JSON.stringify(c8.ku)} ${bildirimOzeti(c8)}`);

  // C9 — KONTROL: havale satırı, kart kodu yok (miras) → okuma yok, uyarı yok.
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.havaleSatiri('C9', BASIC, { erisimSonu: new GercekDate(T0 + 60 * GUN) });
    const okuma0 = d.iyz.sayi('abonelikGetir');
    const t = await d.teklif('C9', PRO, T0);
    check('C9 KONTROL: kart kodu olmayan havale satırında iyzico\'ya gidilmez, kartUyarisi=null',
      t.id !== null && t.yanit?.kartUyarisi === null && d.iyz.sayi('abonelikGetir') === okuma0,
      `uyari=${JSON.stringify(t.yanit?.kartUyarisi)} okuma=${d.iyz.sayi('abonelikGetir') - okuma0}`);
  }

  // C10 — iyzico OKUNAMIYOR: uyarı yerel kayıtla, "doğrulanamadı"; teklif yine oluşur.
  const c10 = await pencere((d, T0) => {
    d.kartliSatir('C10', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    d.iyz.okumayiBoz('sub-C10', new Error('fetch failed'));
    return { firmaId: 'C10', kod: 'sub-C10', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN, olay: 'yok' };
  });
  check('C10 iyzico okunamayınca teklif REDDEDİLMEZ: uyarı yerel kayıtla (ACTIVE), dogrulandi=false, metin "doğrulanamadı"',
    c10.t.id !== null && c10.ku?.dogrulandi === false && c10.ku?.iyzicoDurum === 'ACTIVE' &&
      /doğrulanamadı/.test(String(c10.ku?.mesaj)),
    `hata=${hataMetni(c10.t.hata)} uyari=${JSON.stringify(c10.ku)}`);

  // C11 — KONTROL: pencerede çekim YOK (onay yenilemeden önce) → uyarı var, bildirim yok.
  const c11 = await pencere((d, T0) => {
    d.kartliSatir('C11', BASIC, { erisimSonu: new GercekDate(T0 - 10 * GUN) });
    // Önceki dönemin çekimi TEKLİFTEN ÖNCE (gerçek webhook yolu): onayda sayılmamalı.
    const once = async () => {
      const sip = d.iyz.cekim('sub-C11', { baslangic: T0 - 10 * GUN, bitis: T0 + 20 * GUN })!;
      await saatte(T0 - 10 * GUN, () => d.abonelik.tahsilatBasarili('sub-C11', sip));
    };
    return { firmaId: 'C11', kod: 'sub-C11', cekimAni: T0 + GUN, baslangic: T0 + 20 * GUN, olay: 'yok', once };
  });
  check('C11 KONTROL: tekliften ÖNCEKİ çekim sayılmaz, onay yenilemeden ÖNCE → uyarı vardı ama onayda kart bildirimi YOK',
    c11.ku?.iyzicoDurum === 'ACTIVE' &&
      c11.d.olaylar(/^durum\.degisti$/, c11.ab.id).some((o) => o.aktor === 'webhook') &&
      c11.kartEpostasi.length === 0 && c11.kartOlayi.length === 0 &&
      Array.isArray(c11.yanit?.kartCekimleri) && c11.yanit.kartCekimleri.length === 0,
    bildirimOzeti(c11));

  // C12 — yerel kayıt BAYAT: satır ACTIVE diyor, iyzico'da abonelik CANCELED (panelden iptal) → uyarı YOK.
  const c12 = await pencere((d, T0) => {
    d.kartliSatir('C12', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    d.iyz.durumYaz('sub-C12', 'CANCELED');
    return { firmaId: 'C12', kod: 'sub-C12', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN, olay: 'yok' };
  });
  check('C12 canlı okuma yerel kaydı YENER: satır ACTIVE, iyzico CANCELED → kartUyarisi=null (okuma yapıldı)',
    c12.teklifteOkuma >= 1 && c12.ku === null, `okuma=${c12.teklifteOkuma} uyari=${JSON.stringify(c12.ku)}`);

  // C13 — KONTROL: pencerede BAŞARISIZ çekim (kart reddi) → çekim sayılmaz, bildirim yok.
  const c13 = await pencere((d, T0) => {
    d.kartliSatir('C13', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    return { firmaId: 'C13', kod: 'sub-C13', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN, olay: 'ret' };
  });
  check('C13 KONTROL: pencerede kart REDDİ (başarısız çekim) kart çekimi SAYILMAZ — bildirim yok',
    c13.kartEpostasi.length === 0 && c13.kartOlayi.length === 0 && c13.yanit?.kartCekimleri?.length === 0 &&
      c13.d.olaylar(/^durum\.degisti$/, c13.ab.id).some((o) => o.aktor === 'webhook' && o.yeniDurum === 'ODEME_BEKLIYOR'),
    bildirimOzeti(c13));

  // C16 — SAVUNMA: sipariş kodu OLMAYAN webhook tahsilat geçişi yine SAYILIR.
  const c16 = await pencere((d, T0) => {
    d.kartliSatir('C16', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    return { firmaId: 'C16', kod: 'sub-C16', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN, olay: 'kodsuz' };
  });
  check('C16 SAVUNMA: sipariş kodsuz webhook tahsilatı DÜŞÜRÜLMEZ — yanıtta siparisKodu=null, e-postada "sipariş kodu okunamadı", olay yazıldı',
    c16.kartEpostasi.length === 1 && /sipariş kodu okunamadı/.test(c16.kartEpostasi[0].paragraflar.join(' ')) &&
      c16.kartOlayi.length === 1 && c16.yanit?.kartCekimleri?.length === 1 &&
      c16.yanit.kartCekimleri[0].siparisKodu === null,
    bildirimOzeti(c16));

  // C17 — MİRAS + KART (inceleme Y1): satın alma 365 günü KORUDU, webhook erişimi
  // yalnız ileri yazar → yerel erisimSonu kart dönemi DEĞİL; tarih iyzico'dan okunur.
  const c17 = await pencere((d, T0) => {
    d.kartliSatir('C17', BASIC, { erisimSonu: new GercekDate(T0 + 300 * GUN) });
    // Önceki dönemin çekimi GERÇEK webhook yolundan; dönem sonu (T0+10) korunan erişimden erken.
    const once = async () => {
      const sip = d.iyz.cekim('sub-C17', { baslangic: T0 - 20 * GUN, bitis: T0 + 10 * GUN })!;
      await saatte(T0 - 20 * GUN, () => d.abonelik.tahsilatBasarili('sub-C17', sip));
    };
    return { firmaId: 'C17', kod: 'sub-C17', cekimAni: T0 + 10 * GUN, baslangic: T0 + 10 * GUN, once };
  });
  const e17 = c17.kartEpostasi.length === 1 ? c17.kartEpostasi[0].paragraflar.join(' ') : '';
  check('C17 FIXTURE KANITI: önceki çekim webhook\'tan işlendi, korunan erişim (T0+300) DEĞİŞMEDİ',
    c17.teklifteAb.erisimSonu.getTime() === c17.T0 + 300 * GUN &&
      c17.d.olaylar(/^durum\.degisti$/, c17.ab.id).some((o) => o.aktor === 'webhook'),
    `erisimSonu=${tarih(c17.teklifteAb.erisimSonu)}`);
  check('C17 ⭐ miras satırda sonraki çekim iyzico\'nun ödenmiş dönem sonu (T0+10), korunan erişim sonu (T0+300) DEĞİL',
    c17.ku?.dogrulandi === true && c17.ku?.sonrakiCekim === new GercekDate(c17.T0 + 10 * GUN).toISOString(),
    JSON.stringify(c17.ku));
  check('C17b miras satırda pencere çekimi erişimi uzatmadı → e-posta "DEĞİŞTİRMEDİ" der, "KISALTMAZ" uyarısı YOK',
    e17.includes(String(c17.sip)) && /erişimi DEĞİŞTİRMEDİ/.test(e17) && !/KISALTMAZ/.test(e17), e17);

  // C18 — DENEME BİTTİ, tahsilat henüz gelmedi (inceleme Y1): erişimin +2 gün tamponu
  // "sonraki çekim" DEĞİLDİR — çekim işleniyor: tarih yok, "her an".
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C18', BASIC, {
      erisimSonu: new GercekDate(T0 + 2 * GUN - SAAT),
      ek: { durum: 'DENEME', denemeSonu: new GercekDate(T0 - SAAT) },
    });
    const t = await d.teklif('C18', PRO, T0);
    check('C18 deneme sonu geçmiş DENEME satırı: iyzico\'nun denemesinden sonrakiCekim=null, metin "her an" (erişim tamponu tarih diye yazılmaz)',
      t.yanit?.kartUyarisi?.dogrulandi === true && t.yanit?.kartUyarisi?.sonrakiCekim === null &&
        t.yanit?.kartUyarisi?.sonrakiCekimKaynagi === 'iyzico' &&
        /her an/.test(String(t.yanit?.kartUyarisi?.mesaj)),
      JSON.stringify(t.yanit?.kartUyarisi));
  }

  // C19 — AYNI webhook İKİ KEZ işlendi (inceleme O1): bir sipariş, iki `durum.degisti` olayı.
  const c19 = await pencere((d, T0) => {
    d.kartliSatir('C19', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    return { firmaId: 'C19', kod: 'sub-C19', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN, olay: 'cift' };
  });
  const cift19 = c19.d.olaylar(/^durum\.degisti$/, c19.ab.id)
    .filter((o) => o.aktor === 'webhook' && o.veri?.siparisKodu === c19.sip).length;
  check('C19 FIXTURE KANITI: aynı sipariş için İKİ webhook tahsilat olayı yazıldı (iyzico\'da tek çekim)',
    cift19 === 2 && c19.d.iyz.basariliCekimler('sub-C19') === 1,
    `olay=${cift19} iyzico=${c19.d.iyz.basariliCekimler('sub-C19')}`);
  {
    const e19 = c19.kartEpostasi[0]?.paragraflar.join(' ') ?? '';
    check('C19 ⭐ aynı sipariş BİR kez bildirilir: yanıtta 1 çekim, olayda 1 sipariş, e-postada kod bir kez',
      c19.yanit?.kartCekimleri?.length === 1 && c19.kartOlayi.length === 1 &&
        (c19.kartOlayi[0].veri?.siparisler ?? []).length === 1 && e19.split(String(c19.sip)).length - 1 === 1,
      `${bildirimOzeti(c19)} e-posta="${e19}"`);
  }

  // C20 — AYNI aboneliğe İKİ teklif, ikisi de onaylandı (inceleme O1): pencere çekimi ilk
  // onayda bildirildi; ikinci onay aynı çekimi YENİDEN söylemez.
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C20', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    const t1 = await d.teklif('C20', PRO, T0);
    const t2 = await d.teklif('C20', PRO, T0 + SAAT);
    const sip = d.iyz.cekim('sub-C20', { baslangic: T0 + 5 * GUN, bitis: ayEkle(T0 + 5 * GUN, 1) })!;
    await saatte(T0 + 5 * GUN, () => d.abonelik.tahsilatBasarili('sub-C20', sip));
    const kartE = (a: number, b: number) => d.yoneticiye().slice(a, b).filter((e) => /kart/i.test(e.konu)).length;
    const y0 = d.yoneticiye().length;
    const bir = await d.onayla(t1.id!, T0 + 7 * GUN);
    const y1 = d.yoneticiye().length;
    const iki = await d.onayla(t2.id!, T0 + 8 * GUN);
    const y2 = d.yoneticiye().length;
    check('C20 FIXTURE KANITI: iki teklif de onaylandı; ilk onay pencere çekimini bildirdi',
      bir?.kartCekimleri?.length === 1 && bir.kartCekimleri[0].siparisKodu === sip && kartE(y0, y1) === 1 &&
        Array.isArray(iki?.kartCekimleri),
      `bir=${JSON.stringify(bir?.kartCekimleri)} iki=${JSON.stringify(iki?.kartCekimleri)}`);
    check('C20 ⭐ ikinci onay aynı çekimi YENİDEN bildirmez: yanıtta 0 çekim, ikinci kart e-postası yok, tek olay',
      iki?.kartCekimleri?.length === 0 && kartE(y1, y2) === 0 && d.olaylar(/^havale\.onay\.kart\.cekimi$/).length === 1,
      `iki=${JSON.stringify(iki?.kartCekimleri)} e-posta=${kartE(y1, y2)} olay=${d.olaylar(/^havale\.onay\.kart\.cekimi$/).length}`);
  }

  // C21 — KOMŞU FİRMA: başka firmanın pencere çekimi bu onayda sayılmaz (abonelik süzgeci).
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C21', BASIC, { erisimSonu: new GercekDate(T0 + 20 * GUN) });
    d.kartliSatir('C21K', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    const t = await d.teklif('C21', PRO, T0);
    const sip = d.iyz.cekim('sub-C21K', { baslangic: T0 + 5 * GUN, bitis: ayEkle(T0 + 5 * GUN, 1) })!;
    await saatte(T0 + 5 * GUN, () => d.abonelik.tahsilatBasarili('sub-C21K', sip));
    const y0 = d.yoneticiye().length;
    const yanit = await d.onayla(t.id!, T0 + 7 * GUN);
    const komsu = d.oku('C21K');
    check('C21 FIXTURE KANITI: komşu firmanın çekimi teklifin penceresinde webhook\'tan işlendi',
      d.olaylar(/^durum\.degisti$/, komsu.id).some((o) => o.aktor === 'webhook' && o.veri?.siparisKodu === sip),
      JSON.stringify(d.olaylar(/^durum\.degisti$/, komsu.id).map((o) => o.veri)));
    check('C21 ⭐ komşu firmanın kart çekimi bu onayda SAYILMAZ: yanıtta 0 çekim, kart e-postası yok',
      yanit?.kartCekimleri?.length === 0 && d.yoneticiye().slice(y0).filter((e) => /kart/i.test(e.konu)).length === 0,
      JSON.stringify(yanit?.kartCekimleri));
  }

  // C22 — PLANLI DÜŞÜRME + pencere çekimi: webhook aynı anda `paket.degisti` yazar (aktör
  // webhook, yeni durum AKTIF) — çekim DEĞİLDİR, sayılmaz (olay tipi süzgeci).
  const c22 = await pencere((d, T0) => {
    d.kartliSatir('C22', PRO, {
      erisimSonu: new GercekDate(T0 + 5 * GUN),
      ek: { planliPaketSurumuId: BASIC, paketGecisTarihi: new GercekDate(T0 + 5 * GUN) },
    });
    return { firmaId: 'C22', kod: 'sub-C22', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN };
  });
  check('C22 FIXTURE KANITI: pencerede webhook paket.degisti yazdı (aktör webhook, yeni durum AKTIF)',
    c22.d.olaylar(/^paket\.degisti$/, c22.ab.id).some((o) => o.aktor === 'webhook' && o.yeniDurum === 'AKTIF'),
    JSON.stringify(c22.d.olaylar(/^paket\./, c22.ab.id).map((o) => ({ tip: o.tip, aktor: o.aktor, yeni: o.yeniDurum }))));
  check('C22 ⭐ paket geçişi olayı çekim sayılmaz: yanıtta TEK çekim (bu sipariş)',
    c22.yanit?.kartCekimleri?.length === 1 && c22.yanit.kartCekimleri[0].siparisKodu === c22.sip,
    bildirimOzeti(c22));

  // C23 — iyzico okuması ASILI (yanıt yok): teklif süre sınırında yerel kayıtla döner.
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C23', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    d.iyz.okumayiAs('sub-C23');
    const bas = GercekDate.now();
    const t = await d.teklif('C23', PRO, T0);
    const sure = GercekDate.now() - bas;
    check(`C23 okuma asılıyken teklif ~${KART_OKUMA_SURESI_MS} ms'de oluşur: dogrulandi=false, "doğrulanamadı", yerel tarih`,
      t.id !== null && t.yanit?.kartUyarisi?.dogrulandi === false &&
        /doğrulanamadı/.test(String(t.yanit?.kartUyarisi?.mesaj)) &&
        t.yanit?.kartUyarisi?.sonrakiCekim === new GercekDate(T0 + 5 * GUN).toISOString() &&
        sure >= KART_OKUMA_SURESI_MS - 50 && sure < KART_OKUMA_SURESI_MS + 3000,
      `süre=${sure} ms uyari=${JSON.stringify(t.yanit?.kartUyarisi)}`);
  }

  // C24–C29 — SAF: `sonrakiKartCekimi` iyzico'nun ÖLÇÜLMÜŞ biçimiyle (20.08 tutanağı,
  // docs/adim0-tutanak/adim0-ek-cikti.json: tarihler epoch ms SAYISI).
  {
    const detay = (orders: unknown[], ek: Record<string, unknown> = {}) =>
      ({ referenceCode: 'x', pricingPlanReferenceCode: 'p', customerReferenceCode: 'c', subscriptionStatus: 'ACTIVE',
        orders, ...ek }) as unknown as IyzicoAbonelikDetayi;
    const odenmis = (s: unknown, e: unknown) =>
      ({ referenceCode: 'o1', orderStatus: 'SUCCESS', startPeriod: s, endPeriod: e, paymentAttempts: [{ paymentStatus: 'SUCCESS' }] });
    // $[9] UPGRADED detay: ödenmiş dönem + iyzico'nun ÖNCEDEN açtığı sonraki sipariş.
    const u = detay([
      { referenceCode: 'o2', orderStatus: 'SUBSCRIPTION_UPGRADED', startPeriod: 1789893544991, endPeriod: 1792485544991, paymentAttempts: [] },
      odenmis(1787215144991, 1789893544991),
    ], { subscriptionStatus: 'UPGRADED' });
    const t24 = sonrakiKartCekimi(u, new GercekDate(1789893544991 - 5 * GUN));
    check('C24 ölçülmüş biçim (ms sayısı): sonraki çekim = ödenmiş dönemin sonu',
      t24 instanceof GercekDate && t24.getTime() === 1789893544991, String(t24));
    // $[8] ACTIVE detay: tek sipariş WAITING, deneme yok, başlangıç = abonelik başı.
    const bekleyen = [{ referenceCode: 'o3', orderStatus: 'WAITING', startPeriod: 1787215145248, endPeriod: 1789893545248, paymentAttempts: [] }];
    const t25a = sonrakiKartCekimi(detay(bekleyen), new GercekDate(1787215145248 + SAAT));
    const t25b = sonrakiKartCekimi(detay(bekleyen), new GercekDate(1787215145248 - SAAT));
    check('C25 ödenmiş dönem yok: bekleyen (WAITING) siparişin başı — geçmişse null ("her an"), gelecekse o an',
      t25a === null && t25b instanceof GercekDate && t25b.getTime() === 1787215145248, `${t25a} · ${t25b}`);
    const t26 = sonrakiKartCekimi(detay(bekleyen, { trialEndDate: 1787215145248 + 20 * GUN }), new GercekDate(1787215145248 + GUN));
    check('C26 süren deneme: sonraki çekim deneme sonu (trialEndDate), geçmiş WAITING başı değil',
      t26 instanceof GercekDate && t26.getTime() === 1787215145248 + 20 * GUN, String(t26));
    const t26b = sonrakiKartCekimi(
      detay([odenmis(1787215145248 - 5 * GUN, 1787215145248)], { trialEndDate: 1787215145248 + 20 * GUN }),
      new GercekDate(1787215145248 + GUN));
    check('C26b deneme sürerken ödenmiş görünen sipariş (kart doğrulaması?) olsa da sonraki çekim DENEME SONU',
      t26b instanceof GercekDate && t26b.getTime() === 1787215145248 + 20 * GUN, String(t26b));
    check('C27 çözülecek bir şey yok → undefined (çağıran yerel kayda düşer)',
      sonrakiKartCekimi(detay([]), new GercekDate(1787215145248)) === undefined, 'undefined değil');
    check('C28 ödenmiş dönemin sonu geçmişse null ("her an")',
      sonrakiKartCekimi(detay([odenmis(1787215144991, 1789893544991)]), new GercekDate(1789893544991 + SAAT)) === null,
      'null değil');
    const t29 = sonrakiKartCekimi(detay([odenmis('1787215144991', '1789893544991')]), new GercekDate(1789893544991 - GUN));
    const t29b = sonrakiKartCekimi(
      detay([{ ...odenmis(1787215144991, 1789893544991), paymentAttempts: [] }]), new GercekDate(1789893544991 - GUN));
    check('C29 rakam-dizesi ms çözülür; ödeme denemesi OLMAYAN "SUCCESS" ödenmiş SAYILMAZ (tahsilat kanıtı kuralı)',
      t29 instanceof GercekDate && t29.getTime() === 1789893544991 && t29b === undefined, `${t29} · ${t29b}`);
    const t31 = sonrakiKartCekimi(
      detay([odenmis(1787215144991, 1789893544991), { ...odenmis(1789893544991, 1792485544991), referenceCode: 'o4' }]),
      new GercekDate(1789893544991 + GUN));
    check('C31 birden çok ödenmiş dönem: sonraki çekim EN GEÇ ödenmiş dönemin sonu',
      t31 instanceof GercekDate && t31.getTime() === 1792485544991, String(t31));
    // C33 — yerel tahmin deneme TARİHİNE göre (inceleme D2; `beklenenGecisTarihi` ile aynı kural).
    const an = new GercekDate(1787215145248);
    const g = (gun: number) => new GercekDate(1787215145248 + gun * GUN);
    const aylik = { periyot: 'MONTHLY', periyotAdedi: 1 };
    const y1 = yerelSonrakiCekim({ durum: 'AKTIF', erisimSonu: g(5), denemeSonu: g(3), paketSurumu: aylik }, an);
    const y2 = yerelSonrakiCekim({ durum: 'DENEME', erisimSonu: g(1), denemeSonu: g(-1), paketSurumu: aylik }, an);
    const y3 = yerelSonrakiCekim({ durum: 'AKTIF', erisimSonu: g(20), denemeSonu: g(-40), paketSurumu: aylik }, an);
    check('C33 yerel tahmin: süren deneme (AKTIF etiketli de) → deneme sonu; bitmiş DENEME → null; eski deneme + AKTIF → erişim sonu',
      y1?.getTime() === g(3).getTime() && y2 === null && y3?.getTime() === g(20).getTime(),
      `${y1?.toISOString()} · ${y2} · ${y3?.toISOString()}`);
    // C35 — kart HER DÖNEM çekilir: erişim sonu bir dönemden (+7 gün pay) uzaksa yerel tarih kart dönemi olamaz.
    const y4 = yerelSonrakiCekim({ durum: 'AKTIF', erisimSonu: g(300), denemeSonu: null, paketSurumu: aylik }, an);
    const y5 = yerelSonrakiCekim({ durum: 'AKTIF', erisimSonu: g(33), denemeSonu: null, paketSurumu: aylik }, an);
    const y6 = yerelSonrakiCekim(
      { durum: 'AKTIF', erisimSonu: g(300), denemeSonu: null, paketSurumu: { periyot: 'YEARLY', periyotAdedi: 1 } }, an);
    check('C35 yerel tahmin: aylık pakette erişim 300 gün uzakta → undefined (bilinmiyor); köprü (33 gün) pay içinde → erişim sonu; yıllıkta 300 gün → erişim sonu',
      y4 === undefined && y5?.getTime() === g(33).getTime() && y6?.getTime() === g(300).getTime(),
      `${y4} · ${y5?.toISOString()} · ${y6?.toISOString()}`);
  }

  // C30 — OLAY KAYDI OKUNAMIYOR (inceleme): yanıt `kartCekimleri: null` — "çekim yok" ([]) ile
  // karışmaz; onay yine tamam, hata günlükte.
  const c30 = await pencere((d, T0) => {
    d.kartliSatir('C30', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    d.db.kancaKur(
      'abonelikOlayi',
      (arg) => arg?.where?.tip === 'durum.degisti' && arg?.where?.aktor === 'webhook',
      async () => {
        throw new Error('bağlantı koptu');
      },
      'findMany',
    );
    return { firmaId: 'C30', kod: 'sub-C30', cekimAni: T0 + 5 * GUN, baslangic: T0 + 5 * GUN };
  });
  check('C30 olay kaydı okunamazsa yanıtta kartCekimleri=null ("çekim yok" değil); onay yine AKTIF + HAVALE, hata günlükte',
    c30.yanit !== null && c30.yanit?.kartCekimleri === null && c30.ab.odemeYontemi === 'HAVALE' && c30.ab.durum === 'AKTIF' &&
      hatalarSonra(c30.g0).some((h) => /OKUNAMADI/.test(h)),
    `yanıt=${JSON.stringify(c30.yanit?.kartCekimleri)} hata=${hatalarSonra(c30.g0).join(' · ')}`);

  // C32 — iyzico OKUNDU ama tarih vermedi (siparişsiz kayıt; UPGRADED zincirinde canlı uç aramadan
  // gelir ve sipariş taşımayabilir): tarih YEREL tahmindir — "doğrulanmış" gibi sunulmaz (inceleme D1).
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C32', BASIC, { erisimSonu: new GercekDate(T0 + 5 * GUN) });
    const t = await d.teklif('C32', PRO, T0);
    const k = t.yanit?.kartUyarisi;
    check('C32 iyzico okundu ama siparişsiz: dogrulandi=true, kaynak "yerel", metin "kesin değil"',
      k?.dogrulandi === true && k?.sonrakiCekimKaynagi === 'yerel' &&
        k?.sonrakiCekim === new GercekDate(T0 + 5 * GUN).toISOString() && /kesin değil/.test(String(k?.mesaj)),
      JSON.stringify(k));
  }

  // C34 — MİRAS satır + iyzico OKUNAMIYOR (inceleme tekrarı): korunan erişim sonu (T0+300) kart dönemi
  // olamaz; "11 ay sonra (kesin değil)" yerine tarih BİLİNMİYOR denir.
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C34', BASIC, { erisimSonu: new GercekDate(T0 + 300 * GUN) });
    d.iyz.okumayiBoz('sub-C34', new Error('fetch failed'));
    const t = await d.teklif('C34', PRO, T0);
    const k = t.yanit?.kartUyarisi;
    check('C34 miras satır, iyzico okunamadı: sonrakiCekim=null, kaynak "bilinmiyor", metin "tarihi bilinmiyor" (300 gün sonrası yazılmaz)',
      t.id !== null && k?.dogrulandi === false && k?.sonrakiCekim === null && k?.sonrakiCekimKaynagi === 'bilinmiyor' &&
        /tarihi bilinmiyor/.test(String(k?.mesaj)) && !String(k?.mesaj).includes(tarihYaz(new GercekDate(T0 + 300 * GUN))),
      JSON.stringify(k));
  }

  // C14 — planlı DÜŞÜRME (A1): sonraki çekim PLANLI paketin fiyatıyla yapılır.
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C14', PRO, {
      erisimSonu: new GercekDate(T0 + 5 * GUN),
      ek: { planliPaketSurumuId: BASIC, paketGecisTarihi: new GercekDate(T0 + 5 * GUN) },
    });
    const t = await d.teklif('C14', PRO, T0);
    check('C14 planlı düşürmede uyarının tutarı PLANLI paketin (Basic 1.299) fiyatı, bugünkü Pro (1.649) değil',
      t.yanit?.kartUyarisi?.tutar === '1299.00', JSON.stringify(t.yanit?.kartUyarisi));
  }
  // C15 — dönem sonu GEÇMİŞ (yenileme işleniyor): tarih yok, "her an".
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('C15', BASIC, { erisimSonu: new GercekDate(T0 - SAAT) });
    const t = await d.teklif('C15', PRO, T0);
    check('C15 dönem sonu geçmişse sonrakiCekim=null ve metin "her an" der (geçmiş tarih yazılmaz)',
      t.yanit?.kartUyarisi?.iyzicoDurum === 'ACTIVE' && t.yanit?.kartUyarisi?.sonrakiCekim === null &&
        /her an/.test(String(t.yanit?.kartUyarisi?.mesaj)),
      JSON.stringify(t.yanit?.kartUyarisi));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  G — YÖNETİCİ GÖRÜNÜMÜ
// ═════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · yönetici görünümü: bekleyen havale listesi ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  d.kartliSatir('G1', BASIC, { erisimSonu: new GercekDate(T0 + 12 * GUN) });
  const t = await d.teklif('G1', PRO, T0);
  const liste = await saatte(T0 + SAAT, () => d.havale.bekleyenler());
  // Tip bilerek gevşek: teklifin paket ilişkisi ve hesabın paketi birlikte okunur.
  const satir = liste.find((h: Satir) => h.id === t.id) as Satir | undefined;
  const teklifPaketi = satir?.paketSurumu?.paket?.kod ?? null;
  const hesapPaketi = satir?.abonelik?.paketSurumu?.paket?.kod ?? null;
  olcum(`G · bekleyenler listesi: teklifin paketi=${teklifPaketi} · hesabın bugünkü paketi=${hesapPaketi}`);
  check('G1 bekleyen havale listesi TEKLİFİN paketini (Pro) ve hesabın bugünkü paketini (Basic) ayrı gösteriyor',
    teklifPaketi === 'pro-mek' && hesapPaketi === 'basic-mek', JSON.stringify({ teklifPaketi, hesapPaketi }));
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nHAVALE TEKLİF PAKETİ: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (olcumler.length) {
    console.log('ÖLÇÜMLER:');
    olcumler.forEach((o) => console.log(`  · ${o}`));
  }
  if (failed) {
    console.log('KIRMIZI:');
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

/**
 * Bir bloğun fırlatması KIRMIZI bir assert olur, koşuyu bitirmez: kalan
 * bloklar yine koşar ve özet satırı basılır.
 */
async function blok(ad: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu çökmeden bitti`, false, hataMetni(e));
  }
}

/**
 * ⚠ ASILI SÖZ KORUMASI (hafıza dersi, 25.09): çözülmeyen bir `await` olay
 * döngüsünü boşaltırsa Node ÖZETSİZ ve 0 ile çıkar — kapı "yeşil" görünür.
 * `main` sonuna ulaşmadıysa çıkış 1 olur.
 */
let kapiBitti = false;
process.on('beforeExit', () => {
  if (kapiBitti) return;
  console.error('KAPI ASILI KALDI: bir söz hiç çözülmedi, özet basılmadı (çıkış 1).');
  process.exitCode = 1;
});

async function main(): Promise<void> {
  // W bloğunun yönetici e-postası; ortamdaki gerçek adres kullanılmasın.
  process.env.YONETIM_EPOSTA = YONETIM;
  await blok('F', fBlogu);
  await blok('T', tBlogu);
  await blok('K', kBlogu);
  await blok('D', dBlogu);
  await blok('H', hBlogu);
  await blok('Y', yBlogu);
  await blok('P', pBlogu);
  await blok('E', eBlogu);
  await blok('R', rBlogu);
  await blok('A', aBlogu);
  await blok('W', wBlogu);
  await blok('S', sBlogu);
  await blok('C', cBlogu);
  await blok('G', gBlogu);
  son();
  kapiBitti = true;
}

main().catch((e) => {
  kapiBitti = true;
  console.error('KAPI ÇÖKTÜ:', e);
  process.exitCode = 1;
});
