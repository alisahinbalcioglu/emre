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
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';
import type { IyzicoAbonelikDurumu } from '../src/ozellik/odeme/iyzico/iyzico.client';

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

  async function kancaKos(model: string, arg: any): Promise<void> {
    for (const k of kancalar) {
      if (!k.tetiklendi && k.model === model && k.eslesir(arg)) {
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
  const kancaKur = (model: string, eslesir: (arg: any) => boolean, fn: () => Promise<void>): Kanca => {
    const k: Kanca = { model, eslesir, fn, tetiklendi: false };
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
  siparisler: Satir[];
}

function sahteIyzico() {
  const abonelikler = new Map<string, SahteAbonelik>();
  const cagrilar: Array<{ ad: string; kod: string }> = [];
  /** Koda bağlı iptal arızası (ağ / iyzico hatası). */
  const iptalArizasi = new Map<string, Error>();
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
    orders: a.siparisler.map((s) => ({ ...s })),
  });
  const istemci: any = {
    abonelikGetir: async (kod: string) => {
      cagrilar.push({ ad: 'abonelikGetir', kod });
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
    kur: (kod: string, plan: string, musteri: string, donemSonu: number) =>
      void abonelikler.set(kod, {
        durum: 'ACTIVE', plan, musteri, olusturuldu: GercekDate.now() - 60 * GUN, donemSonu, siparisler: [],
      }),
    durum: (kod: string) => abonelikler.get(kod)?.durum,
    iptaliBoz: (kod: string, hata: Error) => void iptalArizasi.set(kod, hata),
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
const PAKET_KODU: Record<string, string> = { [BASIC]: 'basic-mek', [PRO]: 'pro-mek' };
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
    iyz.kur(kod, p.plan ?? (paket === PRO ? 'plan-pro' : 'plan-basic'), `mus-${firmaId}`, p.erisimSonu.getTime());
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
    firma, kartliSatir, havaleSatiri, teklif, onayla, havaleIleOde, oku, karar, olaylar,
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
  await blok('G', gBlogu);
  son();
  kapiBitti = true;
}

main().catch((e) => {
  kapiBitti = true;
  console.error('KAPI ÇÖKTÜ:', e);
  process.exitCode = 1;
});
