/**
 * HAVALE ONAYI ↔ AÇIK iyzico KART ABONELİĞİ  (`npm run test:havale-iyzico`) · 24.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK servisler bellek-Prisma üzerinde koşar:
 * `HavaleServisi` (teklif → fatura → onay), `AbonelikServisi`, gerçek webhook
 * controller'ı + `WebhookIsleyici`, `DunningServisi`, `MutabakatJob`,
 * `FaturaServisi`, `ErisimServisi`. Havale satırı onay akışının GERÇEK yazma
 * yolundan geçer; fixture yalnız havaleden ÖNCEKİ kartlı satırı kurar (satın
 * alma yolunun `aboneligiAcVeyaGuncelle`de yazdığı alanlarla).
 *
 * SAHTE iyzico yalnız BELGELENEN davranışı taklit eder: dönem çekimini
 * aboneliğin durumuna göre yapar; iptal edilmiş (CANCELED), bitmiş (EXPIRED)
 * ya da yükseltilmiş (UPGRADED) abonelikte çekim YOKTUR; UPGRADED'ın iptali
 * 201403 döner (20.08 sandbox ölçümü, docs/adim0-tutanak); arama ucu filtre
 * UYGULAMAZ (iyzico bilinmeyen filtreyi yutar — servis süzer). ⚠ UNPAID
 * aboneliğin iptali, kart güncellemesinden sonra yeniden deneme ve iptal
 * sonrası sipariş davranışı iyzico dokümanında TARİF EDİLMİYOR ve sandbox'ta
 * ÖLÇÜLMEDİ (24.09 doküman taraması) — taklit bunları varsayar, senaryolar
 * başlığında söyler.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * Kartlı müşteri havaleyle ödeyince `odemeyiOnayla` yalnız `odemeYontemi:
 * 'HAVALE'` yazıyordu: iyzico aboneliği AÇIK kalıyor, `iyzicoAbonelikKodu`
 * satırda duruyordu. 24.09 düzeltme ÖNCESİ kodda bu paket ÖLÇTÜ (12 kırmızı:
 * İ1 A1 A2 A3 A5 B1 B2 B5 D1 D2 D3 D4):
 *   (a) eski kartın dönem sonu reddi → ODEME_BEKLIYOR, "Ödemeniz alınamadı ·
 *       365 gün kaldı" şeridi + e-postası; merdiven ve mutabakat KART dışını
 *       taramadığı için satır orada kaldı; ODEME_BEKLIYOR `erisimSonu`na
 *       bakmadığı için havale dönemi bitince de (+1 ve +400. gün) erişim AÇIK.
 *   (b) kart çalışınca iyzico yine çekti (havale 16.490 TL'ye EK 1.649 TL +
 *       ikinci fatura) ve `erisimSonu` 2027-10-06 → 2026-11-06: 334 gün kayıp.
 *       Deneme ailesinde 336 gün.
 *   (c) gece mutabakatı havale satırını iyzico'ya hiç sormuyor.
 *
 * ── KARAR (Emre, 24.09: "ikisi birden, onay beklemez") ────────────────────
 *   1. Onaydan SONRA kart aboneliği iyzico'da kapatılır; kapatılamazsa onay
 *      YİNE geçer + olay + yönetici e-postası.
 *   2. Havale satırına gelen RET webhook'u yok sayılır (olay).
 *   3. Havale satırına gelen BAŞARILI çekim = çift tahsilat: erişim ve fatura
 *      değişmez; olay + yönetici e-postası ("iade"), iptal yeniden denenir.
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   F  fixture: kartlı satır + GERÇEK havale akışı
 *   İ  onayda iptal: kapatır · iptal düşerse onay YİNE geçer + yönetici ·
 *      YONETIM_EPOSTA / SMTP yoksa uyarı günlükte · UPGRADED (201403) →
 *      canlı uç (düşerse e-postada CANLI kod) · zaten kapalıya gidilmez ·
 *      kodsuz satır · sonraki onay yeniden dener · ⭐havaleden sonra MÜŞTERİ
 *      İPTALİ çalışır (inceleme YÜKSEK-1) · iptal asılıyken fatura ve
 *      müşteri e-postası zaten tamam
 *   A  (a) dönem sonu kart reddi: durum · şerit · e-posta · 40 gün gerçek
 *      merdiven · havale dönemi bitince erişim
 *   B  (b) dönem sonu kart çekimi: çift tahsilat · erişim · ikinci fatura;
 *      ret → yeniden deneme
 *   D  deneme ailesi: denemedeki kartlı müşteri havaleyle yıllık öder
 *   Y  GEÇ / YARIŞ webhook'u — parça 2 ve 3'ün TEK ölçüsü (A/B/D onları
 *      KOŞMAZ: iptal edilmiş abonelik çekilmez, webhook hiç gelmez): onaydan
 *      önceki çekim/ret · tekrar ve aynı siparişe farklı olay (tek uyarı) ·
 *      iptalin ikinci kez düşmesi (tek e-posta) · doğrulanamayan sipariş ·
 *      ⭐YARIŞ: satır okunduktan SONRA onay (başarı, ret, dunning'deki satır;
 *      inceleme ORTA-2 — iyimser koşul, olay yeniden denenir)
 *   M  (c) gece mutabakatı havale satırını taramaz (ölçüm)
 *   K  KONTROL: saf kart satırı eskisi gibi (ölçütler kör değil, koruma dar)
 *   N  BAĞLANTI: Nest, `AbonelikServisi`ne `EpostaServisi`ni enjekte ediyor
 *
 * Günlük: `HI_GUNLUK=1` Nest günlüğünü konsola da basar.
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/altyapi/db/prisma.service';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { MutabakatJob } from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { SatinAlmaServisi, donemTarihleriHesapla } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { EpostaServisi } from '../src/ozellik/odeme/eposta/eposta.servisi';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { HavaleServisi } from '../src/ozellik/odeme/havale/havale.servisi';
import { IyzicoClient, IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';
import type { IyzicoAbonelikDurumu, IyzicoSiparis } from '../src/ozellik/odeme/iyzico/iyzico.client';
import type { AbonelikWebhookGovdesi } from '../src/ozellik/odeme/iyzico/imza';
import { IyzicoWebhookController } from '../src/ozellik/odeme/webhook/webhook.controller';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';

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
const DAKIKA = 60_000;
const PAKET_TUTARI = 1649;
const HAVALE_TUTARI = 16490;
const YONETIM = 'yonetim@ornek.test';

/**
 * Gerçek saat sınıfı. `saatte()` global `Date`i geçici olarak değiştirir;
 * taklidin tarih denetimleri HER ZAMAN bu sınıfa bakar (alt sınıfın örnekleri
 * de bunun örneğidir).
 */
const GercekDate = Date;

const tarih = (an: number | Date) => new GercekDate(an instanceof GercekDate ? an.getTime() : an).toISOString().slice(0, 10);
const gunFarki = (a: number, b: number) => Math.round((a - b) / GUN);

/** Takvim ayı ekler (servislerin `setMonth` kuralıyla aynı takvim). */
function ayEkle(an: number, ay: number): number {
  const d = new GercekDate(an);
  d.setMonth(d.getMonth() + ay);
  return d.getTime();
}

/**
 * Saati verilen ana sabitler: servislerin `new Date()` ve `Date.now()`
 * çağrıları (onay anı, webhook'un `alindi`sı, `ilkBasarisizlik`, merdivenin
 * gün sayımı) aynı saati okur. İş bitince her durumda ÖNCEKİ saati geri
 * yükler — iç içe çağrılabilir (yarış senaryosu onayı webhook'un saati
 * içinde koşturur; iç çağrı dönüşte dış saati bozmasın).
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
// Servisler birçok hatayı `catch` + `logger.error` ile yutar (tahsilatı ve
// onayı düşürmemek için). "Satır değişmedi" assert'i yutulan hatada da geçer;
// her senaryo kendi aralığındaki HATA satırlarını ayrıca sayar ve yalnız
// BEKLENEN kalıplara izin verir.
const gunluk: Array<{ seviye: 'uyari' | 'hata'; metin: string }> = [];
const konsol = process.env.HI_GUNLUK ? new ConsoleLogger() : null;
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
const beklenmeyenHatalar = (i: number, izinli: RegExp[] = []) =>
  hatalarSonra(i).filter((m) => !izinli.some((k) => k.test(m)));

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — havale, webhook, dunning, mutabakat, fatura ve karar yüzeyi
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  havaleOdemesi: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

/** Şemadaki @unique alanlar — ihlal P2002 (webhook tekrarı ve fatura tekilliği buna dayanır). */
const TEKILLER: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  paketSurumu: ['iyzicoPlanKodu', 'iyzicoDenemesizPlanKodu'],
  havaleOdemesi: ['teklifNo'],
  webhookOlayi: ['tekilAnahtar'],
  fatura: ['tahsilatKodu'],
};

/**
 * Prisma verilmeyen opsiyonel alanı `null` döndürür (undefined DEĞİL) ve şema
 * varsayılanını uygular — taklit de öyle.
 */
const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'DENEME', denemeSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null,
    odenenPaketSurumuId: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  havaleOdemesi: () => ({
    durum: 'TEKLIF', paraBirimi: 'TRY', teklifNo: null, faturaNo: null, dekontUrl: null, aciklama: null,
    onaylayanId: null, onaylandi: null, uzatilanTarih: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
  webhookOlayi: () => ({
    kaynak: 'iyzico', imzaBasligi: null, imzaGecerli: false, abonelikKodu: null, siparisKodu: null,
    musteriKodu: null, iyzicoRefKodu: null, olayZamani: null, islendi: false, islenmeZamani: null,
    denemeSayisi: 0, hata: null, alindi: new Date(),
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
      // SQL: NULL hiçbir listede değildir ve `<>` karşılaştırmasında düşer.
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
    // Prisma: NOT içindeki koşulların HİÇBİRİ tutmamalı. (Üç değerli SQL
    // mantığı taklit edilmez: bu paketin satırlarında NOT yalnız kullanıcı
    // sayımında geçer ve o tabloda satır yok.)
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

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);

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

  const modelYuzu = (model: string) => ({
    findUnique: async (arg: any) => {
      await Promise.resolve();
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
        // havale onayının atomikliğini ÖLÇMEZ, onaydan SONRAKİ davranışı ölçer.
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
  return { prisma, tablo, ekle: olustur };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — yalnız belgelenen davranış; her çağrı ve her TAHSİLAT kaydedilir
// ═════════════════════════════════════════════════════════════════════════
interface SahteAbonelik {
  kod: string;
  durum: IyzicoAbonelikDurumu;
  plan: string;
  musteri: string;
  ust?: string;
  olusturuldu: number;
  siparisler: IyzicoSiparis[];
}

function sahteIyzico() {
  const abonelikler = new Map<string, SahteAbonelik>();
  const cagrilar: Array<{ ad: string; kod: string; an: number }> = [];
  /** Karttan GERÇEKTEN çekilen para (iyzico'nun defteri). */
  const tahsilatlar: Array<{ kod: string; siparis: string; tutar: number; an: number }> = [];
  /** Koda bağlı iptal arızası (ağ / iyzico hatası) — onarılana dek sürer. */
  const iptalArizasi = new Map<string, Error>();
  /**
   * TEK SEFERLİK kanca: bir sonraki `abonelikGetir` yanıt DÖNMEDEN önce koşar.
   * Yarışı kurar: webhook satırı okudu, iyzico'yu bekliyor — o arada yönetici
   * havaleyi onaylar.
   */
  let getirKancasi: (() => Promise<void>) | null = null;
  /** Koda bağlı iptal kapısı: açılana dek `abonelikIptal` ASILI kalır (çağrı yine kaydedilir). */
  const iptalKapisi = new Map<string, Promise<void>>();
  let sayac = 0;

  const bul = (kod: string): SahteAbonelik => {
    const a = abonelikler.get(kod);
    if (!a) throw new IyzicoHatasi('201400', `Abonelik bulunamadı: ${kod}`, 422);
    return a;
  };
  const kaydet = (ad: string, kod: string) => cagrilar.push({ ad, kod, an: Date.now() });
  const detay = (a: SahteAbonelik) => ({
    referenceCode: a.kod,
    parentReferenceCode: a.ust,
    pricingPlanReferenceCode: a.plan,
    customerReferenceCode: a.musteri,
    subscriptionStatus: a.durum,
    createdDate: new GercekDate(a.olusturuldu).toISOString(),
    orders: a.siparisler.map((s) => ({ ...s })),
  });

  const istemci: any = {
    abonelikGetir: async (kod: string) => {
      kaydet('abonelikGetir', kod);
      if (getirKancasi) {
        const kanca = getirKancasi;
        getirKancasi = null;
        await kanca();
      }
      return detay(bul(kod));
    },
    // 20.08 ölçümü: ACTIVE uç iptal edilir (gövdesiz success); UPGRADED 201403.
    abonelikIptal: async (kod: string) => {
      kaydet('abonelikIptal', kod);
      const kapi = iptalKapisi.get(kod);
      if (kapi) await kapi;
      const ariza = iptalArizasi.get(kod);
      if (ariza) throw ariza;
      const a = bul(kod);
      if (a.durum === 'UPGRADED' || a.durum === 'CANCELED' || a.durum === 'EXPIRED') {
        throw new IyzicoHatasi('201403', 'Bu abonelik iptal edilemez.', 422);
      }
      a.durum = 'CANCELED';
      return {};
    },
    // iyzico bilinmeyen filtreyi YUTAR (20.08): arama TÜM abonelikleri döner,
    // süzmek servisin işi (`canliUcuBul`).
    abonelikAra: async (f: { parent?: string }) => {
      kaydet('abonelikAra', f?.parent ?? '');
      return [...abonelikler.values()].map(detay);
    },
    // Dunning merdiveninin yeniden denemesi: kart hâlâ reddediyor.
    tahsilatiTekrarla: async (siparis: string) => {
      kaydet('tahsilatiTekrarla', siparis);
      throw new IyzicoHatasi('10051', 'Kart limiti yetersiz', 422);
    },
  };

  const govde = (a: SahteAbonelik, siparis: string, basarili: boolean, an: number): AbonelikWebhookGovdesi => ({
    orderReferenceCode: siparis,
    customerReferenceCode: a.musteri,
    subscriptionReferenceCode: a.kod,
    iyziReferenceCode: `iyzi-${++sayac}`,
    iyziEventType: basarili ? 'subscription.order.success' : 'subscription.order.failure',
    iyziEventTime: an,
  });

  /**
   * iyzico'nun DÖNEM ÇEKİMİ. İptal edilmiş / bitmiş / yükseltilmiş abonelikte
   * çekim YOK → webhook da yok (`null`).
   */
  function donemCekimi(
    kod: string,
    p: {
      basarili: boolean; baslangic: number; bitis: number; an: number; tutar?: number;
      /** 'msDizesi': iyzico tipi `string` der, değer ms rakam dizesi gelebilir. */
      tarihBicimi?: 'iso' | 'msDizesi';
    },
  ): AbonelikWebhookGovdesi | null {
    const a = bul(kod);
    if (a.durum === 'CANCELED' || a.durum === 'EXPIRED' || a.durum === 'UPGRADED') return null;
    const tutar = p.tutar ?? PAKET_TUTARI;
    const siparis = `sip-${kod}-${a.siparisler.length + 1}`;
    const yaz = (an: number) => (p.tarihBicimi === 'msDizesi' ? String(an) : new GercekDate(an).toISOString());
    a.siparisler.push({
      referenceCode: siparis,
      orderStatus: p.basarili ? 'SUCCESS' : 'FAILED',
      startPeriod: yaz(p.baslangic),
      endPeriod: yaz(p.bitis),
      price: tutar,
      ...(p.basarili ? { paidPrice: tutar } : {}),
      paymentAttempts: [{ paymentAttemptStatus: p.basarili ? 'SUCCESS' : 'FAILED' }],
    });
    a.durum = p.basarili ? 'ACTIVE' : 'UNPAID';
    if (p.basarili) tahsilatlar.push({ kod, siparis, tutar, an: p.an });
    return govde(a, siparis, p.basarili, p.an);
  }

  /**
   * Başarısız siparişin YENİDEN denemesi başarılı (kart güncellendi / panelden
   * elle / merdiven). ⚠ Hangi yoldan tetiklendiği sandbox'ta ÖLÇÜLMEDİ; sonuç
   * aynı: sipariş SUCCESS, para çekilir, başarı webhook'u gelir.
   */
  function yenidenDeneme(kod: string, siparis: string, an: number): AbonelikWebhookGovdesi | null {
    const a = bul(kod);
    const s = a.siparisler.find((x) => x.referenceCode === siparis);
    if (!s || s.orderStatus !== 'FAILED' || a.durum === 'CANCELED' || a.durum === 'EXPIRED') return null;
    s.orderStatus = 'SUCCESS';
    s.paidPrice = s.price;
    s.paymentAttempts = [...(s.paymentAttempts ?? []), { paymentAttemptStatus: 'SUCCESS' }];
    a.durum = 'ACTIVE';
    tahsilatlar.push({ kod, siparis, tutar: s.price ?? PAKET_TUTARI, an });
    return govde(a, siparis, true, an);
  }

  /**
   * Sipariş listesi henüz güncellenmemişken gelen başarı webhook'u (eventual
   * consistency): sipariş iyzico'da WAITING görünür.
   */
  function bekleyenSiparisBildirimi(kod: string, p: { baslangic: number; bitis: number; an: number }): AbonelikWebhookGovdesi {
    const a = bul(kod);
    const siparis = `sip-${kod}-${a.siparisler.length + 1}`;
    a.siparisler.push({
      referenceCode: siparis,
      orderStatus: 'WAITING',
      startPeriod: new GercekDate(p.baslangic).toISOString(),
      endPeriod: new GercekDate(p.bitis).toISOString(),
      price: PAKET_TUTARI,
    });
    return govde(a, siparis, true, p.an);
  }

  return {
    istemci,
    cagrilar,
    tahsilatlar,
    donemCekimi,
    yenidenDeneme,
    bekleyenSiparisBildirimi,
    kur: (kod: string, musteri: string, ek: Partial<SahteAbonelik> = {}) =>
      abonelikler.set(kod, {
        kod, durum: 'ACTIVE', plan: 'plan-pro', musteri, olusturuldu: GercekDate.now() - 60 * GUN, siparisler: [], ...ek,
      }),
    durumYaz: (kod: string, durum: IyzicoAbonelikDurumu) => void (bul(kod).durum = durum),
    getirdeKanca: (fn: () => Promise<void>) => void (getirKancasi = fn),
    /** İptali asılı tutar; dönen işlev kapıyı açar. */
    iptaliBeklet: (kod: string): (() => void) => {
      let ac: () => void = () => undefined;
      iptalKapisi.set(kod, new Promise<void>((r) => (ac = r)));
      return () => {
        iptalKapisi.delete(kod);
        ac();
      };
    },
    iptaliBoz: (kod: string, hata: Error) => void iptalArizasi.set(kod, hata),
    iptaliOnar: (kod: string) => void iptalArizasi.delete(kod),
    durum: (kod: string) => abonelikler.get(kod)?.durum,
    sayi: (ad: string, kod?: string) => cagrilar.filter((c) => c.ad === ad && (!kod || c.kod === kod)).length,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — gerçek servisler, sahte iyzico/e-posta/muhasebe
// ═════════════════════════════════════════════════════════════════════════
function dunyaKur(opts: { smtpVar?: boolean } = {}) {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro — Mekanik', kullaniciHakki: 2, dwgAktif: true });
  db.ekle('paketSurumu', {
    id: 'S1', paketId: 'P1', surumNo: 2, iyzicoPlanKodu: 'plan-pro', iyzicoDenemesizPlanKodu: 'plan-pro-denemesiz',
    tutar: new Prisma.Decimal(PAKET_TUTARI), paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
  });

  const epostalar: Array<{ kime: string; konu: string; paragraflar: string[]; an: number }> = [];
  const eposta: any = {
    // Gerçek servis SMTP yoksa `gonder`de uyarıyla SESSİZCE döner; taklit de
    // yapılandırmayı bildirir, gönderimi yine kaydeder (kim neyi denedi).
    yapilandirildiMi: () => opts.smtpVar !== false,
    gonder: async (m: any) => {
      epostalar.push({ kime: m.kime, konu: m.konu, paragraflar: [...(m.paragraflar ?? [])], an: Date.now() });
    },
  };
  const config = new ConfigService({
    UYGULAMA_URL: 'https://ornek.test',
    IYZICO_MERCHANT_ID: 'uye-isyeri-1',
    IYZICO_SECRET_KEY: 'gizli-anahtar',
  });
  const muhasebe: any = {
    ad: 'sahte',
    faturaKes: async () => {
      throw new Error('fatura kesimi bu pakette koşmaz');
    },
  };

  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci, eposta);
  const fatura = new FaturaServisi(db.prisma, muhasebe, eposta);
  const havale = new HavaleServisi(db.prisma, abonelik, fatura, eposta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, eposta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning);
  // Controller'ın anlık dürtmesi (setImmediate) KAYDEDİLİR; işleme dakikalık
  // taramadan yürür — ikisi AYNI `tekOlayIsle`yi koşar, sıra belirli kalsın.
  const durtulen: string[] = [];
  const controller = new IyzicoWebhookController(
    db.prisma,
    { kuyrugaAl: (id: string) => void durtulen.push(id) } as any,
    config,
  );
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  const erisim = new ErisimServisi(db.prisma);
  // Müşteri iptali (`iptalEt`) — hesap kapatma ve yönetici silme de buradan geçer.
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, {} as any, eposta);

  function firma(firmaId: string): void {
    db.ekle('firma', {
      id: firmaId, ad: `Firma ${firmaId}`, unvan: `${firmaId} Mühendislik Ltd.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', faturaEposta: `muhasebe@${firmaId.toLowerCase()}.test`,
      yetkiliEposta: `yetkili@${firmaId.toLowerCase()}.test`,
    });
  }

  /** Satın alma yolunun yazdığı kartlı satır + iyzico'da ACTIVE abonelik. */
  function kartliSatir(
    firmaId: string,
    p: { durum: 'AKTIF' | 'DENEME' | 'IPTAL' | 'ODEME_BEKLIYOR'; erisimSonu: Date; denemeSonu?: Date | null; ek?: Satir },
  ): Satir {
    firma(firmaId);
    const kod = `sub-${firmaId}`;
    iyz.kur(kod, `mus-${firmaId}`);
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', durum: p.durum, erisimSonu: p.erisimSonu, denemeSonu: p.denemeSonu ?? null,
      odemeYontemi: 'KART', iyzicoAbonelikKodu: kod, iyzicoKokKodu: kod, iyzicoMusteriKodu: `mus-${firmaId}`,
      iyzicoDurum: 'ACTIVE', iyzicoSonKontrol: new Date(), ...(p.ek ?? {}),
    });
  }

  /** Yöneticinin GERÇEK üç adımı: teklif → fatura kesildi → dekont onayı. */
  async function havaleIleOde(firmaId: string, an: number, ayAdedi = 12): Promise<string> {
    return saatte(an, async () => {
      const teklif = await havale.teklifOlustur({
        firmaId, paketSurumuId: 'S1', ayAdedi, tutar: HAVALE_TUTARI, olusturanId: 'yonetici-1',
      });
      await havale.faturaKesildi(teklif.id, `FTR-${firmaId}-${teklif.id.slice(0, 4)}`, 'yonetici-1');
      await havale.odemeyiOnayla({ havaleId: teklif.id, onaylayanId: 'yonetici-1' });
      return teklif.id;
    });
  }

  /** iyzico'nun POST'u → gerçek controller → gerçek işleyici. `null` = iyzico göndermedi. */
  async function webhookGonder(g: AbonelikWebhookGovdesi | null, an: number): Promise<boolean> {
    if (!g) return false;
    await saatte(an, async () => {
      await controller.abonelik(g, undefined);
      await isleyici.bekleyenleriIsle();
    });
    return true;
  }

  const oku = (firmaId: string) => db.tablo('abonelik').find((r) => r.firmaId === firmaId)!;
  const karar = (firmaId: string, an: number) => erisim.karar(firmaId, new GercekDate(an));
  const olaylar = (tip: RegExp, abonelikId?: string) =>
    db.tablo('abonelikOlayi').filter((o) => tip.test(o.tip) && (!abonelikId || o.abonelikId === abonelikId));
  const webhooklarIslendi = () =>
    db.tablo('webhookOlayi').every((o) => o.islendi === true && o.hata === null);
  const yoneticiye = (i0 = 0) => epostalar.slice(i0).filter((e) => e.kime === YONETIM);
  const musteriye = (i0 = 0) => epostalar.slice(i0).filter((e) => e.kime !== YONETIM);

  return {
    db, iyz, epostalar, abonelik, havale, dunning, isleyici, mutabakat, erisim, satinAlma, durtulen,
    firma, kartliSatir, havaleIleOde, webhookGonder, oku, karar, olaylar, webhooklarIslendi,
    yoneticiye, musteriye,
  };
}
type Dunya = ReturnType<typeof dunyaKur>;

/** Onay FIRLATMADAN bitti mi (onay iyzico'yu beklemez)? */
async function onayla(d: Dunya, firmaId: string, an: number): Promise<{ hata: string | null; havaleId: string | null }> {
  try {
    return { hata: null, havaleId: await d.havaleIleOde(firmaId, an) };
  } catch (e) {
    return { hata: e instanceof Error ? e.message : String(e), havaleId: null };
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  F — FIXTURE: kartlı satır + GERÇEK havale akışı
// ═════════════════════════════════════════════════════════════════════════
async function fBlogu(): Promise<void> {
  console.log('\n── F · fixture: kartlı satır + GERÇEK havale akışı ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const kartSonu = T0 + 12 * GUN; // kart döneminin ortasında havale
  d.kartliSatir('F1', { durum: 'AKTIF', erisimSonu: new GercekDate(kartSonu) });
  const g0 = gunluk.length;
  const havaleId = await d.havaleIleOde('F1', T0);
  const ab = d.oku('F1');
  const h = d.db.tablo('havaleOdemesi').find((x) => x.id === havaleId);
  const fark = (ab.erisimSonu.getTime() - kartSonu) / GUN;
  check('F1 onay: satır AKTIF + HAVALE, erisimSonu kart döneminin sonundan 12 ay (365–366 gün) ileri',
    ab.durum === 'AKTIF' && ab.odemeYontemi === 'HAVALE' && fark >= 364.9 && fark <= 366.1,
    `durum=${ab.durum} yontem=${ab.odemeYontemi} fark=${fark.toFixed(2)} gün`);
  check('F2 havale kaydı ONAYLANDI, uzatilanTarih = erisimSonu',
    h?.durum === 'ONAYLANDI' && h?.uzatilanTarih?.getTime() === ab.erisimSonu.getTime(),
    `durum=${h?.durum} uzatilan=${h?.uzatilanTarih?.toISOString?.()}`);
  check('F3 havale faturası kuyrukta + müşteriye "aboneliğiniz uzatıldı" e-postası',
    d.db.tablo('fatura').some((f) => f.tahsilatKodu === `havale:${havaleId}`) &&
      d.musteriye().some((e) => /aboneliğiniz uzatıldı/.test(e.konu)),
    `faturalar=${d.db.tablo('fatura').map((f) => f.tahsilatKodu).join(',')} e-posta=${d.epostalar.map((e) => e.konu).join(' · ')}`);
  check('F4 onay yolunda yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  olcum(`F · onay sonrası satır: iyzicoAbonelikKodu=${ab.iyzicoAbonelikKodu} iyzicoKokKodu=${ab.iyzicoKokKodu} ` +
    `iyzicoDurum=${ab.iyzicoDurum} · iyzico'daki abonelik=${d.iyz.durum('sub-F1')} · abonelikIptal çağrısı=${d.iyz.sayi('abonelikIptal')}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  İ — ONAYDA İPTAL (parça 1)
// ═════════════════════════════════════════════════════════════════════════
async function iBlogu(): Promise<void> {
  console.log('\n── İ · onayda kart aboneliğinin iptali ──');
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const ab = d.kartliSatir('I1', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    await d.havaleIleOde('I1', T0);
    check('İ1 ⭐ havale onayı kart aboneliğini iyzico\'da KAPATTI (tam bir iptal çağrısı, bu koda)',
      d.iyz.durum('sub-I1') === 'CANCELED' && d.iyz.sayi('abonelikIptal') === 1 && d.iyz.sayi('abonelikIptal', 'sub-I1') === 1,
      `iyzico=${d.iyz.durum('sub-I1')} çağrılar=${JSON.stringify(d.iyz.cagrilar.map((c) => `${c.ad}:${c.kod}`))}`);
    const olay = d.olaylar(/^iyzico\.abonelik\.iptal$/, ab.id)[0];
    check('İ2 satırda iyzicoDurum=CANCELED; olay "iyzico.abonelik.iptal" onaylayan yöneticiyle, kod + teklif no',
      d.oku('I1').iyzicoDurum === 'CANCELED' && olay?.aktor === 'yonetici-1' && olay?.veri?.kod === 'sub-I1' &&
        /Havale onayı — TKF-/.test(String(olay?.veri?.neden)),
      `iyzicoDurum=${d.oku('I1').iyzicoDurum} olay=${JSON.stringify(olay)}`);
    check('İ2b kod SİLİNMEDİ (geç webhook bu satıra bağlanabilsin)', d.oku('I1').iyzicoAbonelikKodu === 'sub-I1',
      `kod=${d.oku('I1').iyzicoAbonelikKodu}`);
    check('İ2c başarılı iptalde yöneticiye e-posta YOK', d.yoneticiye().length === 0,
      d.yoneticiye().map((e) => e.konu).join(' · '));
  }
  {
    // İptal REDDEDİLİR (iyzico'nun belgelenmiş genel sistem hatası; UNPAID'in
    // iptali dokümanda tarif edilmiyor — sonuç aynı dala düşer).
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const kartSonu = T0 + 12 * GUN;
    const ab = d.kartliSatir('I3', { durum: 'AKTIF', erisimSonu: new GercekDate(kartSonu) });
    d.iyz.iptaliBoz('sub-I3', new IyzicoHatasi('100001', 'Sistem hatası', 500));
    const g0 = gunluk.length;
    const sonuc = await onayla(d, 'I3', T0);
    const s = d.oku('I3');
    const h = d.db.tablo('havaleOdemesi').find((x) => x.id === sonuc.havaleId);
    const fark = (s.erisimSonu.getTime() - kartSonu) / GUN;
    check('İ3 ⭐ iyzico iptali reddederse onay YİNE tamam: fırlatmadı, satır AKTIF + HAVALE + 12 ay, havale ONAYLANDI',
      sonuc.hata === null && s.durum === 'AKTIF' && s.odemeYontemi === 'HAVALE' && fark >= 364.9 && fark <= 366.1 &&
        h?.durum === 'ONAYLANDI',
      `hata=${sonuc.hata} durum=${s.durum} yontem=${s.odemeYontemi} fark=${fark.toFixed(2)} havale=${h?.durum}`);
    const olay = d.olaylar(/^iyzico\.abonelik\.iptal\.basarisiz$/, ab.id)[0];
    check('İ3b olay "iyzico.abonelik.iptal.basarisiz" (iyzico yanıtıyla); iyzicoDurum CANCELED YAZILMADI',
      !!olay && /Sistem hatası/.test(String(olay.veri?.hata)) && olay.aktor === 'yonetici-1' && s.iyzicoDurum === 'ACTIVE',
      `olay=${JSON.stringify(olay)} iyzicoDurum=${s.iyzicoDurum}`);
    const yon = d.yoneticiye();
    check('İ3c ⭐ yöneticiye TEK e-posta: "Kart aboneliği iptal edilemedi" + firma + kod + iyzico yanıtı + "elle iptal"',
      yon.length === 1 && /Kart aboneliği iptal edilemedi/.test(yon[0].konu) && /Firma I3/.test(yon[0].konu) &&
        yon[0].paragraflar.some((x) => /sub-I3/.test(x)) && yon[0].paragraflar.some((x) => /Sistem hatası/.test(x)) &&
        yon[0].paragraflar.some((x) => /elle iptal/.test(x)),
      JSON.stringify(yon));
    check('İ3d müşteriye yine "aboneliğiniz uzatıldı" (onay akışı sürdü), "iptal" sızmadı',
      d.musteriye().some((e) => /aboneliğiniz uzatıldı/.test(e.konu)) && !d.musteriye().some((e) => /iptal/i.test(e.konu)),
      d.musteriye().map((e) => e.konu).join(' · '));
    check('İ3e günlükte yalnız beklenen hata (iptal edilemedi)',
      beklenmeyenHatalar(g0, [/KART ABONELIGI IPTAL EDILEMEDI/]).length === 0 &&
        hatalarSonra(g0).some((m) => /KART ABONELIGI IPTAL EDILEMEDI/.test(m)),
      hatalarSonra(g0).join(' · '));
  }
  {
    // YONETIM_EPOSTA tanımsız: uyarı SESSİZCE kaybolmaz, günlükte HATA.
    const eski = process.env.YONETIM_EPOSTA;
    delete process.env.YONETIM_EPOSTA;
    try {
      const d = dunyaKur();
      const T0 = GercekDate.now();
      d.kartliSatir('I3X', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
      d.iyz.iptaliBoz('sub-I3X', new IyzicoHatasi('100001', 'Sistem hatası', 500));
      const g0 = gunluk.length;
      const sonuc = await onayla(d, 'I3X', T0);
      const iz = hatalarSonra(g0).find((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)) ?? '';
      check('İ3f YONETIM_EPOSTA yoksa: onay yine tamam, e-posta yok, içerik HATA günlüğünde (sessiz kayıp yok)',
        sonuc.hata === null && d.epostalar.every((e) => e.kime !== undefined && !/iptal edilemedi/i.test(e.konu)) &&
          /YONETIM_EPOSTA tanimli degil/.test(iz) && /sub-I3X/.test(iz) && /Kart aboneliği iptal edilemedi/.test(iz),
        `hata=${sonuc.hata} iz=${iz}`);
    } finally {
      process.env.YONETIM_EPOSTA = eski;
    }
  }
  {
    // 24.09 (Emre: "uyarılar e-posta olarak gitmeli"): YONETIM_EPOSTA canlıda
    // BOŞ. Etkin yönetici hesabı varsa uyarı onun giriş e-postasına gider;
    // engellenmiş yönetici ve sıradan kullanıcı alıcı DEĞİLDİR. Kural ve
    // ayrıntılı kapısı: yonetim-bildirimi.ts · `test:yonetim-epostalari`.
    const eski = process.env.YONETIM_EPOSTA;
    delete process.env.YONETIM_EPOSTA;
    try {
      const d = dunyaKur();
      d.db.ekle('user', { email: 'kurucu@ornek.test', role: 'admin', status: 'active', deletedAt: null, emailVerified: true, createdAt: new GercekDate(1) });
      d.db.ekle('user', { email: 'engelli@ornek.test', role: 'admin', status: 'banned', deletedAt: null, emailVerified: true, createdAt: new GercekDate(2) });
      d.db.ekle('user', { email: 'musteri@ornek.test', role: 'user', status: 'active', deletedAt: null, emailVerified: true, createdAt: new GercekDate(3) });
      const T0 = GercekDate.now();
      d.kartliSatir('I3Y', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
      d.iyz.iptaliBoz('sub-I3Y', new IyzicoHatasi('100001', 'Sistem hatası', 500));
      const g0 = gunluk.length;
      const sonuc = await onayla(d, 'I3Y', T0);
      const uyari = d.epostalar.filter((e) => /iptal edilemedi/i.test(e.konu));
      check('İ3h ⭐ YONETIM_EPOSTA boş + etkin yönetici hesabı → uyarı YÖNETİCİ HESABINA gider (engellenen/müşteri alıcı değil)',
        sonuc.hata === null && uyari.length === 1 && uyari[0].kime === 'kurucu@ornek.test' &&
          uyari[0].paragraflar.some((x) => /sub-I3Y/.test(x)) &&
          !hatalarSonra(g0).some((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)),
        `hata=${sonuc.hata} alici=${uyari.map((e) => e.kime).join(',')} iz=${hatalarSonra(g0).join(' · ')}`);
    } finally {
      process.env.YONETIM_EPOSTA = eski;
    }
  }
  {
    // Kayıtlı uç iyzico'da UPGRADED (yanıtı kaybolan paket değişimi) → 201403.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('I4', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    d.iyz.durumYaz('sub-I4', 'UPGRADED');
    // ⚠ SIRA BİLİNÇLİ: başka müşterinin (aynı üst kodu taşıyan) aboneliği
    // aramada ÖNCE gelir. `canliUcuBul`un müşteri süzgeci silinirse "ilk
    // UPGRADED olmayan" O olur ve İ4 kırmızıya döner (inceleme T4: ters
    // sırada süzgeçsiz kod da doğru ucu seçiyordu — assert kördü).
    d.iyz.kur('sub-baska', 'mus-baska', { ust: 'sub-I4' });
    d.iyz.kur('sub-I4-2', 'mus-I4', { ust: 'sub-I4', olusturuldu: T0 - 5 * GUN });
    await d.havaleIleOde('I4', T0);
    const s = d.oku('I4');
    check('İ4 ⭐ UPGRADED uç (201403) → zincirin CANLI ucu iptal edildi, başka müşterinin aboneliğine dokunulmadı',
      d.iyz.durum('sub-I4-2') === 'CANCELED' && d.iyz.durum('sub-baska') === 'ACTIVE' &&
        d.iyz.sayi('abonelikIptal', 'sub-I4') === 1 && d.iyz.sayi('abonelikIptal', 'sub-I4-2') === 1,
      `canli=${d.iyz.durum('sub-I4-2')} baska=${d.iyz.durum('sub-baska')} çağrılar=${JSON.stringify(d.iyz.cagrilar.map((c) => `${c.ad}:${c.kod}`))}`);
    check('İ4b satır canlı uca bağlandı, kök korundu, iyzicoDurum CANCELED',
      s.iyzicoAbonelikKodu === 'sub-I4-2' && s.iyzicoKokKodu === 'sub-I4' && s.iyzicoDurum === 'CANCELED',
      `kod=${s.iyzicoAbonelikKodu} kok=${s.iyzicoKokKodu} iyzicoDurum=${s.iyzicoDurum}`);
  }
  {
    // Bildiğimiz kadarıyla KAPALI abonelik: iyzico'ya hiç gidilmez.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('I5A', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN), ek: { iyzicoDurum: 'CANCELED' } });
    d.iyz.durumYaz('sub-I5A', 'CANCELED');
    // Müşteri kendi iptal etti (`iptalEt` iyzico'yu iptal edip iptalTalebi yazar);
    // bu ağaçta `iptalEt` iyzicoDurum YAZMIYOR → alan bayat 'ACTIVE'.
    d.kartliSatir('I5B', {
      durum: 'IPTAL', erisimSonu: new GercekDate(T0 + 12 * GUN), ek: { iptalTalebi: new GercekDate(T0 - GUN) },
    });
    d.iyz.durumYaz('sub-I5B', 'CANCELED');
    await d.havaleIleOde('I5A', T0);
    const b = await onayla(d, 'I5B', T0);
    check('İ5 ⭐ zaten kapalı abonelikte (iyzicoDurum CANCELED · iptalTalebi dolu) iyzico\'ya HİÇ gidilmedi',
      d.iyz.sayi('abonelikIptal') === 0 && d.iyz.sayi('abonelikGetir') === 0,
      `çağrılar=${JSON.stringify(d.iyz.cagrilar.map((c) => `${c.ad}:${c.kod}`))}`);
    check('İ5b iptal edilmiş (IPTAL) aboneliğe havale: onay tamam, AKTIF + HAVALE, yöneticiye yanlış alarm YOK',
      b.hata === null && d.oku('I5B').durum === 'AKTIF' && d.oku('I5B').odemeYontemi === 'HAVALE' && d.yoneticiye().length === 0,
      `hata=${b.hata} durum=${d.oku('I5B').durum} yönetici=${d.yoneticiye().length}`);
  }
  {
    // Havale yolunun KENDİ açtığı satır (yeni firma, kod yok) — eski davranış.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.firma('I6');
    const sonuc = await onayla(d, 'I6', T0);
    const s = d.oku('I6');
    const fark = (s.erisimSonu.getTime() - T0) / GUN;
    check('İ6 kodsuz havale satırı: iyzico\'ya hiç gidilmedi, onay tamam (AKTIF + HAVALE, bugünden 12 ay)',
      sonuc.hata === null && d.iyz.cagrilar.length === 0 && s.durum === 'AKTIF' && s.odemeYontemi === 'HAVALE' &&
        s.iyzicoAbonelikKodu === null && fark >= 364.9 && fark <= 366.1,
      `hata=${sonuc.hata} çağrı=${d.iyz.cagrilar.length} durum=${s.durum} kod=${s.iyzicoAbonelikKodu} fark=${fark.toFixed(2)}`);
  }
  {
    // İptal düşmüştü; bir sonraki havale onayı (yenileme) YENİDEN dener.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('I7', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    d.iyz.iptaliBoz('sub-I7', new IyzicoHatasi('100001', 'Sistem hatası', 500));
    await d.havaleIleOde('I7', T0);
    const ara = d.iyz.durum('sub-I7');
    d.iyz.iptaliOnar('sub-I7');
    await d.havaleIleOde('I7', T0 + 300 * GUN);
    check('İ7 ilk onayda düşen iptal, sonraki onayda YENİDEN denendi ve kapandı',
      ara === 'ACTIVE' && d.iyz.durum('sub-I7') === 'CANCELED' && d.oku('I7').iyzicoDurum === 'CANCELED' &&
        d.iyz.sayi('abonelikIptal', 'sub-I7') === 2,
      `ara=${ara} son=${d.iyz.durum('sub-I7')} satır=${d.oku('I7').iyzicoDurum} iptal çağrısı=${d.iyz.sayi('abonelikIptal', 'sub-I7')}`);
  }
  {
    // Canlı ucun iptali de düşerse yönetici CANLI kodu görmeli — panelde eski
    // (UPGRADED) kodu aramak işe yaramaz (inceleme bulgusu 6).
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const ab = d.kartliSatir('I4C', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    d.iyz.durumYaz('sub-I4C', 'UPGRADED');
    d.iyz.kur('sub-I4C-2', 'mus-I4C', { ust: 'sub-I4C' });
    d.iyz.iptaliBoz('sub-I4C-2', new IyzicoHatasi('100001', 'Sistem hatası', 500));
    const sonuc = await onayla(d, 'I4C', T0);
    const yon = d.yoneticiye();
    const olay = d.olaylar(/^iyzico\.abonelik\.iptal\.basarisiz$/, ab.id)[0];
    check('İ4c canlı ucun iptali de düşerse: onay yine tamam; yönetici e-postası ve olay CANLI kodu (sub-I4C-2) taşıyor',
      sonuc.hata === null && yon.length === 1 && yon[0].paragraflar.some((x) => x.includes('sub-I4C-2')) &&
        String(olay?.veri?.hata).includes('sub-I4C-2') && d.iyz.durum('sub-I4C-2') === 'ACTIVE',
      JSON.stringify({ hata: sonuc.hata, yon: yon.map((e) => e.paragraflar), olay: olay?.veri }));
  }
  {
    // SMTP yapılandırılmamışsa gerçek servis `gonder`de SESSİZCE döner: uyarının
    // içeriği günlüğe HATA olarak düşmeli (inceleme bulgusu 8).
    const d = dunyaKur({ smtpVar: false });
    const T0 = GercekDate.now();
    d.kartliSatir('I3S', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    d.iyz.iptaliBoz('sub-I3S', new IyzicoHatasi('100001', 'Sistem hatası', 500));
    const g0 = gunluk.length;
    const sonuc = await onayla(d, 'I3S', T0);
    const iz = hatalarSonra(g0).find((m) => /YONETICI BILDIRIMI GONDERILEMEDI/.test(m)) ?? '';
    check('İ3g SMTP yoksa: yöneticiye gönderim DENENMEDİ, içerik HATA günlüğünde (SMTP gerekçesiyle)',
      sonuc.hata === null && d.yoneticiye().length === 0 && /SMTP/.test(iz) && /sub-I3S/.test(iz),
      `iz=${iz} yönetici=${d.yoneticiye().length}`);
  }
  {
    // YÜKSEK-1 (inceleme): onay kart aboneliğini kapattıktan sonra müşteri
    // (ya da hesap kapatma / yönetici silme — hepsi `iptalEt`) aboneliği iptal
    // edebilmeli. `iptalEt` kapalı aboneliğe yeniden iptal gönderip iyzico
    // hatasıyla DÜŞÜYORDU: satır AKTIF kalıyor, müşteri "iptal tamamlanamadı"
    // görüyordu.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('I9', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    await d.havaleIleOde('I9', T0);
    const c0 = d.iyz.cagrilar.length;
    let hata: string | null = null;
    try {
      await saatte(T0 + 5 * GUN, () => d.satinAlma.iptalEt('I9', 'sahip-1', 'müşteri iptali'));
    } catch (e) {
      hata = e instanceof Error ? e.message : String(e);
    }
    const s = d.oku('I9');
    check('İ9 ⭐ havaleden sonra müşteri iptali ÇALIŞIYOR: fırlatmadı, satır IPTAL, iyzico\'ya YENİ çağrı yok',
      hata === null && s.durum === 'IPTAL' && d.iyz.cagrilar.length === c0,
      `hata=${hata} durum=${s.durum} yeni çağrı=${JSON.stringify(d.iyz.cagrilar.slice(c0).map((c) => `${c.ad}:${c.kod}`))}`);
    // KONTROL: saf kart satırında iptal iyzico'ya GİDER (atlama kuralı kartı bozmasın).
    d.kartliSatir('I9K', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    await saatte(T0 + 5 * GUN, () => d.satinAlma.iptalEt('I9K', 'sahip-2', 'müşteri iptali'));
    check('İ9b kart satırında müşteri iptali iyzico\'da aboneliği iptal eder (ölçüt kör değil)',
      d.iyz.sayi('abonelikIptal', 'sub-I9K') === 1 && d.iyz.durum('sub-I9K') === 'CANCELED' && d.oku('I9K').durum === 'IPTAL',
      `iptal=${d.iyz.sayi('abonelikIptal', 'sub-I9K')} iyzico=${d.iyz.durum('sub-I9K')} durum=${d.oku('I9K').durum}`);
  }
  {
    // SIRA (inceleme bulgusu 3): iyzico iptali ASILI kalırken onay, havale
    // faturası ve müşteri e-postası ZATEN tamam olmalı — süreç iyzico
    // beklenirken ölürse fatura kaybolmasın (iptali sonraki onay ya da geç
    // webhook yeniden dener; faturayı yeniden deneyen yol YOK).
    const d = dunyaKur();
    const T0 = GercekDate.now();
    d.kartliSatir('I10', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
    const serbest = d.iyz.iptaliBeklet('sub-I10');
    const onay = d.havaleIleOde('I10', T0);
    for (let i = 0; i < 2000 && d.iyz.sayi('abonelikIptal', 'sub-I10') === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    const beklerken = {
      iptalCagrildi: d.iyz.sayi('abonelikIptal', 'sub-I10') === 1,
      havale: d.db.tablo('havaleOdemesi')[0]?.durum,
      fatura: d.db.tablo('fatura').some((f) => /^havale:/.test(f.tahsilatKodu)),
      eposta: d.musteriye().some((e) => /aboneliğiniz uzatıldı/.test(e.konu)),
    };
    serbest();
    await onay;
    check('İ10 ⭐ iyzico iptali beklerken onay, havale faturası ve müşteri e-postası ZATEN tamam',
      beklerken.iptalCagrildi && beklerken.havale === 'ONAYLANDI' && beklerken.fatura && beklerken.eposta &&
        d.iyz.durum('sub-I10') === 'CANCELED',
      `beklerken=${JSON.stringify(beklerken)} son=${d.iyz.durum('sub-I10')}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  A — (a) eski kartın BAŞARISIZ dönem çekimi
// ═════════════════════════════════════════════════════════════════════════
async function aBlogu(): Promise<void> {
  console.log('\n── A · (a) eski kartın başarısız dönem çekimi ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  const T1 = T0 + 12 * GUN; // kart döneminin sonu = iyzico'nun yenileme çekimi
  d.kartliSatir('A1', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
  await d.havaleIleOde('A1', T0);
  const havaleSonu = d.oku('A1').erisimSonu.getTime();
  const e0 = d.epostalar.length;
  const g0 = gunluk.length;

  const govde = d.iyz.donemCekimi('sub-A1', { basarili: false, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
  const geldi = await d.webhookGonder(govde, T1 + DAKIKA);
  const ab = d.oku('A1');
  const k = await d.karar('A1', T1 + SAAT);
  const yeni = d.epostalar.slice(e0);
  if (geldi) {
    check('A-FIXTURE webhook gerçek işleyicide işlendi (islendi, hata yok)', d.webhooklarIslendi(),
      JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.hata])));
  }
  check('A1 ⭐ satır AKTIF kaldı — havaleyle ödemiş müşteri ODEME_BEKLIYOR\'a düşmedi',
    ab.durum === 'AKTIF', `durum=${ab.durum} webhook=${geldi ? 'geldi' : 'gelmedi (iyzico çekmedi)'}`);
  check('A2 ⭐ şerit "Ödemeniz alınamadı" DEĞİL',
    k.uyari?.baslik !== 'Ödemeniz alınamadı', `uyari=${k.uyari?.baslik ?? 'yok'} kalanGun=${k.kalanGun}`);
  check('A3 ⭐ müşteriye "ödemeniz alınamadı" e-postası GİTMEDİ',
    !yeni.some((e) => /ödemeniz alınamadı/i.test(e.konu)), yeni.map((e) => `${e.kime}: ${e.konu}`).join(' · '));
  check('A4 havaleyle ödenen erisimSonu değişmedi', ab.erisimSonu.getTime() === havaleSonu,
    `${tarih(havaleSonu)} → ${tarih(ab.erisimSonu)}`);

  // 40 gün boyunca GERÇEK dunning merdiveni (her gün 10:00) + bir gece mutabakatı.
  const e1 = d.epostalar.length;
  for (let g = 1; g <= 40; g++) {
    await saatte(T1 + g * GUN + 10 * SAAT, () => d.dunning.merdiveniYurut());
  }
  await saatte(T1 + GUN + 3.5 * SAAT, () => d.mutabakat.geceMutabakati());
  const kirk = d.oku('A1');
  olcum(`A · dönem sonu: durum=${ab.durum} · şerit="${k.uyari?.baslik ?? 'yok'}" · kalanGun=${k.kalanGun} · ` +
    `e-posta: ${yeni.map((e) => e.konu).join(' · ') || 'yok'} · iyzico çekim denedi mi=${geldi}`);
  olcum(`A · 40 gün merdiven sonrası: durum=${kirk.durum} · merdiven e-postası=${d.epostalar.length - e1} · ` +
    `dunning olayı=${d.olaylar(/^dunning\./).length} · mutabakat bu satırı iyzico'ya sordu mu=${d.iyz.sayi('abonelikGetir', 'sub-A1') > 0}`);

  const bitti = await d.karar('A1', havaleSonu + GUN);
  const yil = await d.karar('A1', havaleSonu + 400 * GUN);
  check('A5 ⭐ havale dönemi bitince (erisimSonu + 1 gün) erişim KAPALI — süresiz bedava erişim yok',
    bitti.erisimVar === false, `durum=${d.oku('A1').durum} erisimVar=${bitti.erisimVar}`);
  olcum(`A · havale dönemi bitti (${tarih(havaleSonu)}): +1 gün erisimVar=${bitti.erisimVar} · +400 gün erisimVar=${yil.erisimVar} · durum=${d.oku('A1').durum}`);
  check('A6 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
//  B — (b) eski kartın BAŞARILI dönem çekimi
// ═════════════════════════════════════════════════════════════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · (b) eski kartın başarılı dönem çekimi ──');
  {
    // B-a: havale satırı AKTIF, kart çalışıyor → iyzico dönem sonunda çeker mi?
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    d.kartliSatir('B1', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    await d.havaleIleOde('B1', T0);
    const havaleSonu = d.oku('B1').erisimSonu.getTime();
    const g0 = gunluk.length;
    const govde = d.iyz.donemCekimi('sub-B1', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    const cekilen = d.iyz.tahsilatlar.filter((t) => t.an > T0);
    check('B1 ⭐ ÇİFT TAHSİLAT YOK: havale onayından sonra karttan para çekilmedi',
      cekilen.length === 0, cekilen.map((t) => `${t.tutar} TL (${t.siparis}, ${tarih(t.an)})`).join(', '));
    const geldi = await d.webhookGonder(govde, T1 + DAKIKA);
    const ab = d.oku('B1');
    if (geldi) {
      check('B-FIXTURE webhook gerçek işleyicide işlendi (islendi, hata yok)', d.webhooklarIslendi(),
        JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.hata])));
    }
    check('B2 ⭐ havaleyle ödenen erişim KISALMADI',
      ab.erisimSonu.getTime() >= havaleSonu,
      `havale=${tarih(havaleSonu)} → şimdi=${tarih(ab.erisimSonu)} (${gunFarki(havaleSonu, ab.erisimSonu.getTime())} gün kayıp)`);
    check('B3 satır HAVALE kaldı', ab.odemeYontemi === 'HAVALE', `yontem=${ab.odemeYontemi}`);
    const kartFaturasi = govde ? d.db.tablo('fatura').find((f) => f.tahsilatKodu === govde.orderReferenceCode) : undefined;
    olcum(`B · kart çekimi: ${cekilen.map((t) => `${t.tutar} TL`).join(', ') || 'yok'} (havale ${HAVALE_TUTARI} TL'ye EK) · ` +
      `erisimSonu ${tarih(havaleSonu)} → ${tarih(ab.erisimSonu)} (${gunFarki(havaleSonu, ab.erisimSonu.getTime())} gün kayıp) · ` +
      `kart çekimi faturası kuyrukta=${!!kartFaturasi}${kartFaturasi ? ` (${Number(kartFaturasi.toplamTutar)} TL, ${tarih(kartFaturasi.donemBasi)}–${tarih(kartFaturasi.donemSonu)})` : ''}`);
    check('B4 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
  {
    // B-b: başarısız çekim → (şeritteki "Kartı güncelle") → yeniden deneme BAŞARILI.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    d.kartliSatir('B2', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    await d.havaleIleOde('B2', T0);
    const havaleSonu = d.oku('B2').erisimSonu.getTime();
    const g0 = gunluk.length;
    const ret = d.iyz.donemCekimi('sub-B2', { basarili: false, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.webhookGonder(ret, T1 + DAKIKA);
    const arada = d.oku('B2').durum;
    const tekrar = ret ? d.iyz.yenidenDeneme('sub-B2', ret.orderReferenceCode, T1 + 3 * GUN) : null;
    await d.webhookGonder(tekrar, T1 + 3 * GUN + DAKIKA);
    const ab = d.oku('B2');
    check('B5 ⭐ yeniden deneme başarısı da havale dönemini KISALTMADI',
      ab.erisimSonu.getTime() >= havaleSonu,
      `ara durum=${arada} → ${ab.durum} · havale=${tarih(havaleSonu)} → şimdi=${tarih(ab.erisimSonu)}`);
    olcum(`B · başarısız → yeniden deneme: durum ${arada} → ${ab.durum} · erisimSonu ${tarih(havaleSonu)} → ${tarih(ab.erisimSonu)} ` +
      `(${gunFarki(havaleSonu, ab.erisimSonu.getTime())} gün kayıp) · karttan çekilen=${d.iyz.tahsilatlar.filter((t) => t.an > T0).length}`);
    check('B6 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  D — deneme ailesi: denemedeki kartlı müşteri havaleyle yıllık öder
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · deneme ailesi: kartlı denemedeki müşteri havaleyle yıllık öder ──');
  for (const basarili of [true, false]) {
    const d = dunyaKur();
    const firmaId = basarili ? 'D1' : 'D2';
    const T0 = GercekDate.now();
    // Satın almanın GERÇEK tarih fonksiyonu: 20 gün önce 30 günlük denemeyle açıldı.
    const { erisimSonu, denemeSonu } = donemTarihleriHesapla(new GercekDate(T0 - 20 * GUN), 30);
    d.kartliSatir(firmaId, { durum: 'DENEME', erisimSonu, denemeSonu });
    await d.havaleIleOde(firmaId, T0);
    const once = d.oku(firmaId);
    const havaleSonu = once.erisimSonu.getTime();
    check(`D-FIXTURE ${firmaId} havale onayı DENEME'yi AKTIF + HAVALE yaptı`,
      once.durum === 'AKTIF' && once.odemeYontemi === 'HAVALE', `durum=${once.durum} yontem=${once.odemeYontemi}`);
    const g0 = gunluk.length;
    const e0 = d.epostalar.length;
    // iyzico ilk çekimi KENDİ deneme bitişinde yapar.
    const Tc = denemeSonu.getTime();
    const govde = d.iyz.donemCekimi(`sub-${firmaId}`, { basarili, baslangic: Tc, bitis: ayEkle(Tc, 1), an: Tc });
    const cekilen = d.iyz.tahsilatlar.filter((t) => t.an > T0);
    await d.webhookGonder(govde, Tc + DAKIKA);
    const ab = d.oku(firmaId);
    if (basarili) {
      check('D1 ⭐ deneme bitişinde ÇİFT TAHSİLAT YOK', cekilen.length === 0,
        cekilen.map((t) => `${t.tutar} TL (${tarih(t.an)})`).join(', '));
      check('D2 ⭐ ilk kart çekimi havaleyle ödenen yılı KISALTMADI', ab.erisimSonu.getTime() >= havaleSonu,
        `havale=${tarih(havaleSonu)} → şimdi=${tarih(ab.erisimSonu)} (${gunFarki(havaleSonu, ab.erisimSonu.getTime())} gün kayıp)`);
      olcum(`D · deneme sonu kart ÇALIŞIYOR: çekilen=${cekilen.length} · erisimSonu ${tarih(havaleSonu)} → ${tarih(ab.erisimSonu)} ` +
        `(${gunFarki(havaleSonu, ab.erisimSonu.getTime())} gün kayıp)`);
    } else {
      const yeni = d.epostalar.slice(e0);
      const k = await d.karar(firmaId, Tc + SAAT);
      check('D3 ⭐ deneme bitişindeki kart reddi havale müşterisini ODEME_BEKLIYOR yapmadı', ab.durum === 'AKTIF',
        `durum=${ab.durum}`);
      check('D4 ⭐ "ödemeniz alınamadı" şeridi/e-postası YOK',
        k.uyari?.baslik !== 'Ödemeniz alınamadı' && !yeni.some((e) => /ödemeniz alınamadı/i.test(e.konu)),
        `şerit=${k.uyari?.baslik ?? 'yok'} e-posta=${yeni.map((e) => e.konu).join(' · ')}`);
      olcum(`D · deneme sonu kart REDDEDİLDİ: durum=${ab.durum} · şerit="${k.uyari?.baslik ?? 'yok'}" · e-posta=${yeni.map((e) => e.konu).join(' · ') || 'yok'}`);
    }
    check(`D5 ${firmaId} yutulan hata yok`, hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Y — GEÇ / YARIŞ WEBHOOK'U (parça 2 ve 3)
// ═════════════════════════════════════════════════════════════════════════
// iyzico dönem çekimini yapar, webhook'u 15 dk arayla 3 kez dener: çekim
// ONAYDAN ÖNCE yapılıp bildirimi onaydan SONRA düşebilir. İptal düşmüşse de
// iyzico sonraki dönemi çeker. A/B/D bu dalları KOŞMAZ (iptal edilmiş
// abonelik çekilmez) — koruma kodu silinse onlar yeşil kalırdı.
async function yBlogu(): Promise<void> {
  console.log('\n── Y · geç / yarış webhook\'u ──');
  {
    // Y1: çekim onaydan 10 dk ÖNCE yapıldı (başarılı), webhook 20 dk sonra düştü.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y1', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.donemCekimi('sub-Y1', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.havaleIleOde('Y1', T1 + 10 * DAKIKA);
    const havaleSonu = d.oku('Y1').erisimSonu.getTime();
    const e0 = d.epostalar.length;
    const g0 = gunluk.length;
    await d.webhookGonder(govde, T1 + 30 * DAKIKA);
    const s = d.oku('Y1');
    check('Y-FIXTURE onaydan önceki çekim GERÇEKTEN yapıldı ve webhook işlendi (hatasız)',
      d.iyz.tahsilatlar.length === 1 && d.webhooklarIslendi() && d.db.tablo('webhookOlayi').length === 1,
      `tahsilat=${d.iyz.tahsilatlar.length} olaylar=${JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.hata]))}`);
    check('Y1 ⭐ çift tahsilat webhook\'u satırı DEĞİŞTİRMEDİ: AKTIF + HAVALE, erisimSonu havalenin tarihi',
      s.durum === 'AKTIF' && s.odemeYontemi === 'HAVALE' && s.erisimSonu.getTime() === havaleSonu,
      `durum=${s.durum} yontem=${s.odemeYontemi} ${tarih(havaleSonu)} → ${tarih(s.erisimSonu)}`);
    check('Y1b ⭐ bu çekim için fatura KESİLMEDİ (kuyrukta yalnız havale faturası)',
      !d.db.tablo('fatura').some((f) => f.tahsilatKodu === govde!.orderReferenceCode) &&
        d.db.tablo('fatura').every((f) => /^havale:/.test(f.tahsilatKodu)),
      `faturalar=${d.db.tablo('fatura').map((f) => f.tahsilatKodu).join(',')}`);
    const cift = d.olaylar(/^tahsilat\.cift$/, ab.id);
    check('Y1c olay "tahsilat.cift": sipariş, tutar, dönem (webhook aktörü)',
      cift.length === 1 && cift[0].veri?.siparisKodu === govde!.orderReferenceCode && cift[0].veri?.tutar === PAKET_TUTARI &&
        !!cift[0].veri?.startPeriod && cift[0].aktor === 'webhook',
      JSON.stringify(cift));
    const yon = d.yoneticiye(e0);
    check('Y1d ⭐ yöneticiye TEK e-posta: "Çift tahsilat — iade gerekiyor" + sipariş + ₺1.649,00 + "iade" + kapalı abonelik cümlesi',
      yon.length === 1 && /Çift tahsilat — iade gerekiyor/.test(yon[0].konu) &&
        yon[0].paragraflar.some((x) => x.includes(govde!.orderReferenceCode)) &&
        yon[0].paragraflar.some((x) => x.includes('₺1.649,00')) &&
        yon[0].paragraflar.some((x) => /iade edin/.test(x)) &&
        yon[0].paragraflar.some((x) => /kapalı görünüyor/.test(x)),
      JSON.stringify(yon));
    check('Y1d2 e-posta havaleyle ödenen erişimin bitişini söylüyor (yönetici dönem çakışmasını görebilsin)',
      yon.length === 1 && yon[0].paragraflar.some((x) => /Havaleyle ödenmiş erişim/.test(x)),
      JSON.stringify(yon[0]?.paragraflar));
    check('Y1e müşteriye "ödemeniz alındı" (toparlandı) ya da başka e-posta GİTMEDİ',
      d.musteriye(e0).length === 0, d.musteriye(e0).map((e) => e.konu).join(' · '));
    check('Y1f kapalı abonelik için iyzico\'ya YENİ iptal çağrısı yok (onayda kapanmıştı)',
      d.iyz.sayi('abonelikIptal', 'sub-Y1') === 1, `iptal çağrısı=${d.iyz.sayi('abonelikIptal', 'sub-Y1')}`);
    check('Y1g günlükte yalnız beklenen hata (ÇİFT TAHSİLAT)',
      beklenmeyenHatalar(g0, [/CIFT TAHSILAT/]).length === 0 && hatalarSonra(g0).some((m) => /CIFT TAHSILAT/.test(m)),
      hatalarSonra(g0).join(' · '));
    // iyzico AYNI olayı yeniden gönderir (2xx alsa da) — tekilleme ikinci uyarıyı keser.
    const e1 = d.epostalar.length;
    await d.webhookGonder(govde, T1 + 45 * DAKIKA);
    check('Y1h aynı webhook\'un tekrarı ikinci uyarı/olay ÜRETMEDİ',
      d.yoneticiye(e1).length === 0 && d.olaylar(/^tahsilat\.cift$/, ab.id).length === 1,
      `yeni yönetici e-postası=${d.yoneticiye(e1).length} olay=${d.olaylar(/^tahsilat\.cift$/, ab.id).length}`);
    // Aynı SİPARİŞ farklı bir olayla yeniden gelir (yeni tekil anahtar — ör.
    // gece mutabakatının kayıp tahsilatı yeniden oynatması): ikinci uyarı yok
    // (inceleme bulgusu 4).
    const e2 = d.epostalar.length;
    await d.webhookGonder({ ...govde!, iyziReferenceCode: 'iyzi-yeniden-oynatma' }, T1 + 50 * DAKIKA);
    check('Y1i aynı siparişe FARKLI olay: ikinci uyarı/olay YOK, olay yine de işlendi',
      d.db.tablo('webhookOlayi').length === 2 && d.webhooklarIslendi() && d.yoneticiye(e2).length === 0 &&
        d.olaylar(/^tahsilat\.cift$/, ab.id).length === 1,
      `olaylar=${d.db.tablo('webhookOlayi').length} yeni yönetici e-postası=${d.yoneticiye(e2).length} cift=${d.olaylar(/^tahsilat\.cift$/, ab.id).length}`);
  }
  {
    // Y2: ret onaydan ÖNCE, webhook onaydan SONRA.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y2', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.donemCekimi('sub-Y2', { basarili: false, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.havaleIleOde('Y2', T1 + 10 * DAKIKA);
    const e0 = d.epostalar.length;
    const g0 = gunluk.length;
    await d.webhookGonder(govde, T1 + 30 * DAKIKA);
    const s = d.oku('Y2');
    const k = await d.karar('Y2', T1 + SAAT);
    check('Y-FIXTURE ret webhook\'u gerçek işleyicide işlendi (hatasız)', d.webhooklarIslendi() && d.db.tablo('webhookOlayi').length === 1,
      JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.hata])));
    check('Y2 ⭐ ret webhook\'u yok sayıldı: AKTIF, ilkBasarisizlik yok, "Ödemeniz alınamadı" yok, müşteriye e-posta yok',
      s.durum === 'AKTIF' && s.ilkBasarisizlik === null && s.denemeSayisi === 0 &&
        k.uyari?.baslik !== 'Ödemeniz alınamadı' && d.musteriye(e0).length === 0,
      `durum=${s.durum} ilk=${s.ilkBasarisizlik} deneme=${s.denemeSayisi} şerit=${k.uyari?.baslik} e-posta=${d.musteriye(e0).map((e) => e.konu).join(' · ')}`);
    const yok = d.olaylar(/^tahsilat\.havale\.yok\.sayildi$/, ab.id);
    check('Y2b olay "tahsilat.havale.yok.sayildi" (sipariş kodu), dunning olayı YOK, yöneticiye e-posta YOK',
      yok.length === 1 && yok[0].veri?.siparisKodu === govde!.orderReferenceCode && d.olaylar(/^dunning\./).length === 0 &&
        d.yoneticiye(e0).length === 0,
      `olay=${JSON.stringify(yok)} dunning=${d.olaylar(/^dunning\./).length} yönetici=${d.yoneticiye(e0).length}`);
    check('Y2c yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
  {
    // Y3: onayda iptal DÜŞTÜ (kodsuz zaman aşımı); iyzico dönem sonunda karttan çekti.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y3', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    d.iyz.iptaliBoz('sub-Y3', new IyzicoHatasi(undefined, 'iyzico yanıt vermedi (zaman aşımı, 20 sn)'));
    const g0 = gunluk.length;
    await d.havaleIleOde('Y3', T0);
    const havaleSonu = d.oku('Y3').erisimSonu.getTime();
    d.iyz.iptaliOnar('sub-Y3');
    const govde = d.iyz.donemCekimi('sub-Y3', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    check('Y-FIXTURE iptal düşünce iyzico dönem sonunda GERÇEKTEN çekti (kalan risk budur)',
      !!govde && d.iyz.tahsilatlar.length === 1, `govde=${!!govde} tahsilat=${d.iyz.tahsilatlar.length}`);
    await d.webhookGonder(govde, T1 + DAKIKA);
    const s = d.oku('Y3');
    check('Y3 ⭐ erişim ve fatura DEĞİŞMEDİ (havale tarihi, kart çekimi faturası yok)',
      s.erisimSonu.getTime() === havaleSonu && s.durum === 'AKTIF' &&
        !d.db.tablo('fatura').some((f) => f.tahsilatKodu === govde?.orderReferenceCode),
      `${tarih(havaleSonu)} → ${tarih(s.erisimSonu)} durum=${s.durum}`);
    check('Y3b ⭐ çift tahsilat iptali YENİDEN denedi ve bu kez kapattı (iyzico + satır CANCELED)',
      d.iyz.durum('sub-Y3') === 'CANCELED' && s.iyzicoDurum === 'CANCELED' && d.iyz.sayi('abonelikIptal', 'sub-Y3') === 2,
      `iyzico=${d.iyz.durum('sub-Y3')} satır=${s.iyzicoDurum} iptal çağrısı=${d.iyz.sayi('abonelikIptal', 'sub-Y3')}`);
    const yon = d.yoneticiye();
    check('Y3c yöneticiye sırayla İKİ e-posta: önce "iptal edilemedi", sonra "çift tahsilat" (içinde "şimdi iptal edildi")',
      yon.length === 2 && /iptal edilemedi/.test(yon[0].konu) && /Çift tahsilat/.test(yon[1].konu) &&
        yon[1].paragraflar.some((x) => /şimdi iyzico'da iptal edildi/.test(x)),
      JSON.stringify(yon.map((e) => [e.konu, e.paragraflar])));
    check('Y3d olay sırası: iptal.basarisiz → tahsilat.cift → iptal (webhook)',
      JSON.stringify(d.olaylar(/^(iyzico\.abonelik\.iptal|iyzico\.abonelik\.iptal\.basarisiz|tahsilat\.cift)$/, ab.id).map((o) => o.tip)) ===
        JSON.stringify(['iyzico.abonelik.iptal.basarisiz', 'tahsilat.cift', 'iyzico.abonelik.iptal']),
      JSON.stringify(d.olaylar(/./, ab.id).map((o) => o.tip)));
    check('Y3e günlükte yalnız beklenen hatalar',
      beklenmeyenHatalar(g0, [/KART ABONELIGI IPTAL EDILEMEDI/, /CIFT TAHSILAT/]).length === 0,
      beklenmeyenHatalar(g0, [/KART ABONELIGI IPTAL EDILEMEDI/, /CIFT TAHSILAT/]).join(' · '));
  }
  {
    // Y4: başarı webhook'u geldi ama sipariş iyzico'da henüz WAITING.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y4', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.bekleyenSiparisBildirimi('sub-Y4', { baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.havaleIleOde('Y4', T1 + 10 * DAKIKA);
    const havaleSonu = d.oku('Y4').erisimSonu.getTime();
    const e0 = d.epostalar.length;
    const g0 = gunluk.length;
    await d.webhookGonder(govde, T1 + 30 * DAKIKA);
    const o = d.db.tablo('webhookOlayi')[0];
    // ⚠ 24.09 (webhook tahsilat doğrulaması ile birleşme): ödenmemiş sipariş
    // artık HAVALE dalına GELMEDEN `tahsilatBasarili`nin tek ödeme kanıtında
    // (`odenmisSiparisMi`, `test:webhook-tahsilat-dogrulama`) reddedilir —
    // hata metni o kuralın metnidir. Kanıt önce: yoksa ödenmemiş çekim için
    // yöneticiye "iade et" yazılabilirdi (Y4b).
    check('Y4 ⭐ doğrulanamayan çekim: olay İŞLENMEDİ (yeniden denenecek), hata sebebi kayıtlı',
      o?.islendi === false && o?.denemeSayisi === 1 && /doğrulanamadı: .* ödenmemiş \(orderStatus WAITING/.test(String(o?.hata)),
      `islendi=${o?.islendi} deneme=${o?.denemeSayisi} hata=${o?.hata}`);
    check('Y4b yöneticiye "iade et" YAZILMADI, olay yok, satır değişmedi',
      d.yoneticiye(e0).length === 0 && d.olaylar(/^tahsilat\.cift$/, ab.id).length === 0 &&
        d.oku('Y4').erisimSonu.getTime() === havaleSonu && d.oku('Y4').durum === 'AKTIF',
      `yönetici=${d.yoneticiye(e0).length} olay=${d.olaylar(/^tahsilat\.cift$/, ab.id).length}`);
    check('Y4c günlükte yalnız ödeme kanıtının ve işleyicinin "doğrulanamadı" satırları',
      beklenmeyenHatalar(g0, [/^Tahsilat kanıtı YOK: .* ÖDENMEMİŞ/, /^Webhook .*siparişi doğrulanamadı: .* ödenmemiş/]).length === 0 &&
        hatalarSonra(g0).length === 2,
      hatalarSonra(g0).join(' · '));
  }
  {
    // Y4d (24.09, webhook tahsilat doğrulaması ile birleşme): sipariş SUCCESS
    // ama iyzico'da BAŞARILI ödeme denemesi YOK (değer ÖLÇÜLMEDİ — kanıtsız
    // biçim). Tek kanıt kuralı (`odenmisSiparisMi`) HAVALE dalından ÖNCE:
    // sıra tersine dönerse dalın kendi `orderStatus` denetimi geçer ve
    // tahsil edildiği kanıtlanmamış para için yöneticiye "iade et" yazılır.
    // Kurulum Y1'in aynısı; tek fark sipariş denemesinin reddedilmiş olması.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y4d', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.donemCekimi('sub-Y4d', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    const asilGetir = d.iyz.istemci.abonelikGetir;
    d.iyz.istemci.abonelikGetir = async (kod: string) => {
      const detay = await asilGetir(kod);
      for (const s of detay?.orders ?? []) {
        if (s.referenceCode === govde?.orderReferenceCode) s.paymentAttempts = [{ paymentAttemptStatus: 'FAILED' }];
      }
      return detay;
    };
    await d.havaleIleOde('Y4d', T1 + 10 * DAKIKA);
    const havaleSonu = d.oku('Y4d').erisimSonu.getTime();
    const e0 = d.epostalar.length;
    await d.webhookGonder(govde, T1 + 30 * DAKIKA);
    const o = d.db.tablo('webhookOlayi')[0];
    check('Y4d ⭐ SUCCESS ama başarılı deneme YOK: yöneticiye "iade et" YAZILMADI, tahsilat.cift yok, satır aynı, olay yeniden denenecek',
      d.yoneticiye(e0).length === 0 && d.olaylar(/^tahsilat\.cift$/, ab.id).length === 0 &&
        d.oku('Y4d').erisimSonu.getTime() === havaleSonu && o?.islendi === false &&
        /doğrulanamadı: .* ödenmemiş \(orderStatus SUCCESS/.test(String(o?.hata)),
      `yönetici=${d.yoneticiye(e0).length} olay=${d.olaylar(/^tahsilat\.cift$/, ab.id).length} islendi=${o?.islendi} hata=${o?.hata}`);
  }
  {
    // Y5: onayda iptal düştü, iyzico çekti, çift tahsilatta iptal YİNE düştü.
    // Yönetici TAM iki e-posta alır: onaydaki "iptal edilemedi" + içinde
    // "iptal EDİLEMEDİ … elle iptal edin" cümlesi olan çift tahsilat uyarısı.
    // İkinci iptal hatası AYRI bir e-posta üretmez (inceleme T3).
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    d.kartliSatir('Y5', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    d.iyz.iptaliBoz('sub-Y5', new IyzicoHatasi(undefined, 'iyzico yanıt vermedi (zaman aşımı, 20 sn)'));
    await d.havaleIleOde('Y5', T0);
    const govde = d.iyz.donemCekimi('sub-Y5', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.webhookGonder(govde, T1 + DAKIKA);
    const yon = d.yoneticiye();
    check('Y5 ⭐ iptal çift tahsilatta da düşerse: yöneticiye TAM iki e-posta; ikincisi "iptal EDİLEMEDİ … elle iptal" diyor',
      yon.length === 2 && /iptal edilemedi/.test(yon[0].konu) && /Çift tahsilat/.test(yon[1].konu) &&
        yon[1].paragraflar.some((x) => /iptal EDİLEMEDİ/.test(x) && /elle iptal edin/.test(x)),
      JSON.stringify(yon.map((e) => [e.konu, e.paragraflar])));
    check('Y5b iyzico\'da abonelik hâlâ açık ve satır CANCELED YAZMADI (yalan yok)',
      d.iyz.durum('sub-Y5') === 'ACTIVE' && d.oku('Y5').iyzicoDurum === 'ACTIVE',
      `iyzico=${d.iyz.durum('sub-Y5')} satır=${d.oku('Y5').iyzicoDurum}`);
  }
  {
    // Y6 — YARIŞ (inceleme ORTA-2): yenileme webhook'u satırı KART iken okudu,
    // iyzico'yu beklerken yönetici havaleyi onayladı. İlk deneme havale
    // yılını `endPeriod`a KISALTMAMALI ve kart faturası KESMEMELİ; olay
    // yeniden denenir, ikinci denemede havale dalına (çift tahsilat) düşer.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y6', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.donemCekimi('sub-Y6', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    let havaleSonu = 0;
    d.iyz.getirdeKanca(async () => {
      await d.havaleIleOde('Y6', T1 + 2 * DAKIKA);
      havaleSonu = d.oku('Y6').erisimSonu.getTime();
    });
    await d.webhookGonder(govde, T1 + 2 * DAKIKA);
    const ara = d.oku('Y6');
    check('Y6-FIXTURE onay GERÇEKTEN webhook iyzico\'yu beklerken koştu (satır HAVALE, ~12 ay uzamış)',
      havaleSonu > ayEkle(T1, 11) && ara.odemeYontemi === 'HAVALE',
      `havaleSonu=${havaleSonu ? tarih(havaleSonu) : 'yok'} yontem=${ara.odemeYontemi}`);
    check('Y6 ⭐ yarışta ilk deneme havale yılını KISALTMADI ve kart faturası KESMEDİ',
      ara.erisimSonu.getTime() === havaleSonu && !d.db.tablo('fatura').some((f) => f.tahsilatKodu === govde!.orderReferenceCode),
      `${havaleSonu ? tarih(havaleSonu) : '?'} → ${tarih(ara.erisimSonu)} faturalar=${d.db.tablo('fatura').map((f) => f.tahsilatKodu).join(',')}`);
    // Dakikalık tarama olayı yeniden dener.
    await saatte(T1 + 3 * DAKIKA, () => d.isleyici.bekleyenleriIsle());
    const s = d.oku('Y6');
    check('Y6b yeniden denemede havale dalı: olay işlendi, çift tahsilat uyarısı TEK, erişim yine havalenin',
      d.webhooklarIslendi() && d.olaylar(/^tahsilat\.cift$/, ab.id).length === 1 &&
        d.yoneticiye().filter((e) => /Çift tahsilat/.test(e.konu)).length === 1 && s.erisimSonu.getTime() === havaleSonu,
      `olay=${JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.denemeSayisi, o.hata]))} ` +
        `cift=${d.olaylar(/^tahsilat\.cift$/, ab.id).length} erisim=${tarih(s.erisimSonu)}`);
  }
  {
    // Y7 — YARIŞIN RET İKİZİ: başarısızlık webhook'u satırı KART iken okudu,
    // durum yazılmadan önce yönetici havaleyi onayladı. Satır ODEME_BEKLIYOR'a
    // DÜŞMEMELİ — düşseydi düzeltmenin kapattığı süresiz erişim geri gelirdi.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    const ab = d.kartliSatir('Y7', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.donemCekimi('sub-Y7', { basarili: false, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    // Pencere: `tahsilatBasarisiz` satırı okuduktan sonra, durumu yazmadan
    // önce `planliGecisiUygula`yı çağırır — onay oraya girer (gerçek metot
    // sarılır, bir kez).
    const asil = d.abonelik.planliGecisiUygula.bind(d.abonelik);
    let kuruldu = false;
    (d.abonelik as any).planliGecisiUygula = async (...a: any[]) => {
      if (!kuruldu) {
        kuruldu = true;
        await d.havaleIleOde('Y7', T1 + 2 * DAKIKA);
      }
      return asil(...(a as [string, { aktor: string }]));
    };
    await d.webhookGonder(govde, T1 + 2 * DAKIKA);
    (d.abonelik as any).planliGecisiUygula = asil;
    await saatte(T1 + 3 * DAKIKA, () => d.isleyici.bekleyenleriIsle());
    const s = d.oku('Y7');
    const k = await d.karar('Y7', T1 + SAAT);
    check('Y7-FIXTURE onay GERÇEKTEN ret webhook\'unun penceresinde koştu', kuruldu && s.odemeYontemi === 'HAVALE',
      `kuruldu=${kuruldu} yontem=${s.odemeYontemi}`);
    check('Y7 ⭐ yarışta da satır ODEME_BEKLIYOR\'a düşmedi; "Ödemeniz alınamadı" e-postası/şeridi yok',
      s.durum === 'AKTIF' && k.uyari?.baslik !== 'Ödemeniz alınamadı' &&
        !d.musteriye().some((e) => /ödemeniz alınamadı/i.test(e.konu)),
      `durum=${s.durum} şerit=${k.uyari?.baslik} e-posta=${d.musteriye().map((e) => e.konu).join(' · ')}`);
    check('Y7b olay sonunda işlendi, havale dalında yok sayıldı; ilkBasarisizlik yazılmadı',
      d.webhooklarIslendi() && d.olaylar(/^tahsilat\.havale\.yok\.sayildi$/, ab.id).length === 1 && s.ilkBasarisizlik === null,
      `olay=${JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.denemeSayisi, o.hata]))} ilk=${s.ilkBasarisizlik}`);
  }
  {
    // Y8 — YARIŞIN ÜÇÜNCÜ YÜZÜ: satır ZATEN dunning'de (ODEME_BEKLIYOR, KART;
    // kartı reddedilip havaleye geçen müşterinin tipik yolu). Yeni bir ret
    // webhook'u satırı okudu, o arada yönetici havaleyi onayladı. Durum
    // yazılmaz (else dalı) ama dunning izi de YAZILMAMALI ve müşteriye
    // "ödemeniz alınamadı" GİTMEMELİ — onay sayaçları sıfırladığı için ilk
    // bildirim kapısı açıktır.
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const ab = d.kartliSatir('Y8', {
      durum: 'ODEME_BEKLIYOR', erisimSonu: new GercekDate(T0 - 3 * GUN),
      ek: { ilkBasarisizlik: new GercekDate(T0 - 3 * GUN), denemeSayisi: 2, sonDeneme: new GercekDate(T0 - GUN), iyzicoDurum: 'UNPAID' },
    });
    d.iyz.durumYaz('sub-Y8', 'UNPAID');
    const govde = d.iyz.donemCekimi('sub-Y8', { basarili: false, baslangic: T0 - 3 * GUN, bitis: ayEkle(T0 - 3 * GUN, 1), an: T0 });
    const asil = d.abonelik.planliGecisiUygula.bind(d.abonelik);
    let kuruldu = false;
    (d.abonelik as any).planliGecisiUygula = async (...a: any[]) => {
      if (!kuruldu) {
        kuruldu = true;
        await d.havaleIleOde('Y8', T0 + 2 * DAKIKA);
      }
      return asil(...(a as [string, { aktor: string }]));
    };
    await d.webhookGonder(govde, T0 + 2 * DAKIKA);
    (d.abonelik as any).planliGecisiUygula = asil;
    await saatte(T0 + 3 * DAKIKA, () => d.isleyici.bekleyenleriIsle());
    const s = d.oku('Y8');
    check('Y8-FIXTURE onay ret webhook\'unun penceresinde koştu (dunning\'deki satır AKTIF + HAVALE)',
      kuruldu && s.odemeYontemi === 'HAVALE' && s.durum === 'AKTIF', `kuruldu=${kuruldu} yontem=${s.odemeYontemi} durum=${s.durum}`);
    check('Y8 ⭐ yarışta dunning izi yazılmadı ve müşteriye "ödemeniz alınamadı" GİTMEDİ',
      s.ilkBasarisizlik === null && s.denemeSayisi === 0 && !d.musteriye().some((e) => /ödemeniz alınamadı/i.test(e.konu)),
      `ilk=${s.ilkBasarisizlik} deneme=${s.denemeSayisi} e-posta=${d.musteriye().map((e) => e.konu).join(' · ')}`);
    check('Y8b olay sonunda işlendi ve havale dalında yok sayıldı',
      d.webhooklarIslendi() && d.olaylar(/^tahsilat\.havale\.yok\.sayildi$/, ab.id).length === 1,
      `olay=${JSON.stringify(d.db.tablo('webhookOlayi').map((o) => [o.islendi, o.denemeSayisi, o.hata]))}`);
  }
  {
    // Y9: iyzico dönem sınırlarını ms RAKAM DİZESİ yollarsa (tip `string`,
    // değer '1791…') çift tahsilat e-postası "Invalid Date" yazmamalı — tarih
    // tek çözücüden (`iyzicoTarihi`).
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    d.kartliSatir('Y9', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const govde = d.iyz.donemCekimi('sub-Y9', {
      basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1, tarihBicimi: 'msDizesi',
    });
    await d.havaleIleOde('Y9', T1 + 10 * DAKIKA);
    await d.webhookGonder(govde, T1 + 30 * DAKIKA);
    const yon = d.yoneticiye();
    const donemSatiri = yon[0]?.paragraflar.find((x) => /kart çekiminin dönemi/.test(x)) ?? '';
    check('Y9 dönem ms rakam dizesiyle gelse de e-postadaki tarih okunur (Invalid Date / "bilinmiyor" değil)',
      yon.length === 1 && !/Invalid Date|bilinmiyor/.test(donemSatiri) && /\d{4}/.test(donemSatiri),
      donemSatiri || JSON.stringify(yon));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  M — (c) gece mutabakatı havale satırını taramaz
// ═════════════════════════════════════════════════════════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · (c) gece mutabakatı ──');
  const d = dunyaKur();
  const T0 = GercekDate.now();
  d.kartliSatir('M1', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) });
  d.kartliSatir('M2', { durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 12 * GUN) }); // saf kart (ölçüt)
  await d.havaleIleOde('M1', T0);
  const c0 = d.iyz.cagrilar.length;
  await saatte(T0 + GUN + 3.5 * SAAT, () => d.mutabakat.geceMutabakati());
  const sorulan = d.iyz.cagrilar.slice(c0).filter((c) => c.ad === 'abonelikGetir').map((c) => c.kod);
  check('M-OLCUT mutabakat saf kart satırını iyzico\'ya sordu (ölçüt kör değil)', sorulan.includes('sub-M2'),
    `sorulan=${sorulan.join(',')}`);
  olcum(`M · gece mutabakatı havale satırını (sub-M1) iyzico'ya sordu mu=${sorulan.includes('sub-M1')} · ` +
    `iyzico'daki durumu=${d.iyz.durum('sub-M1')} · satırdaki iyzicoDurum=${d.oku('M1').iyzicoDurum}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — KONTROL: saf kart satırında aynı webhook'lar eskisi gibi
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · KONTROL: saf kart satırı ──');
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    d.kartliSatir('K1', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const g0 = gunluk.length;
    const govde = d.iyz.donemCekimi('sub-K1', { basarili: false, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.webhookGonder(govde, T1 + DAKIKA);
    const ab = d.oku('K1');
    const k = await d.karar('K1', T1 + SAAT);
    check('K1 kart satırı: başarısız çekim → ODEME_BEKLIYOR + ilkBasarisizlik (A1/Y2 ölçütü kör değil)',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik instanceof GercekDate, `durum=${ab.durum}`);
    check('K2 kart satırı: "Ödemeniz alınamadı" şeridi + e-postası (A2/A3 ölçütü kör değil)',
      k.uyari?.baslik === 'Ödemeniz alınamadı' && d.epostalar.some((e) => /ödemeniz alınamadı/i.test(e.konu)),
      `şerit=${k.uyari?.baslik} e-posta=${d.epostalar.map((e) => e.konu).join(' · ')}`);
    for (let g = 1; g <= 11; g++) {
      await saatte(T1 + g * GUN + 10 * SAAT, () => d.dunning.merdiveniYurut());
    }
    check('K3 kart satırı: gerçek merdiven 10. günde KISITLI yaptı (A5 ölçütü kör değil)',
      d.oku('K1').durum === 'KISITLI', `durum=${d.oku('K1').durum}`);
    check('K4 kart satırında havale korumasının izi yok (yok sayma olayı, iptal çağrısı, yönetici e-postası)',
      d.olaylar(/^tahsilat\.havale\.yok\.sayildi$/).length === 0 && d.iyz.sayi('abonelikIptal') === 0 && d.yoneticiye().length === 0,
      `olay=${d.olaylar(/havale/).length} iptal=${d.iyz.sayi('abonelikIptal')} yönetici=${d.yoneticiye().length}`);
    check('K5 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
  {
    const d = dunyaKur();
    const T0 = GercekDate.now();
    const T1 = T0 + 12 * GUN;
    d.kartliSatir('K2', { durum: 'AKTIF', erisimSonu: new GercekDate(T1) });
    const g0 = gunluk.length;
    const govde = d.iyz.donemCekimi('sub-K2', { basarili: true, baslangic: T1, bitis: ayEkle(T1, 1), an: T1 });
    await d.webhookGonder(govde, T1 + DAKIKA);
    const ab = d.oku('K2');
    check('K6 kart satırı: başarılı çekim → erisimSonu = iyzico endPeriod (B2/Y1 ölçütü kör değil)',
      ab.durum === 'AKTIF' && ab.erisimSonu.getTime() === ayEkle(T1, 1),
      `durum=${ab.durum} erisimSonu=${tarih(ab.erisimSonu)} beklenen=${tarih(ayEkle(T1, 1))}`);
    check('K7 kart satırı: çekimin faturası kuyrukta (Y1b ölçütü kör değil)',
      d.db.tablo('fatura').some((f) => f.tahsilatKodu === govde?.orderReferenceCode),
      `faturalar=${d.db.tablo('fatura').map((f) => f.tahsilatKodu).join(',')}`);
    check('K8 kart satırında çift tahsilat yolu tetiklenmedi (olay, iptal, yönetici e-postası yok)',
      d.olaylar(/^tahsilat\.cift$/).length === 0 && d.iyz.sayi('abonelikIptal') === 0 && d.yoneticiye().length === 0,
      `olay=${d.olaylar(/^tahsilat\.cift$/).length} iptal=${d.iyz.sayi('abonelikIptal')} yönetici=${d.yoneticiye().length}`);
    check('K9 yutulan hata yok', hatalarSonra(g0).length === 0, hatalarSonra(g0).join(' · '));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  N — BAĞLANTI: Nest e-posta servisini gerçekten enjekte ediyor mu
// ═════════════════════════════════════════════════════════════════════════
// Parametre TS'de isteğe bağlı (eski fikstürler 2 argümanla kuruyor). Tip
// meta verisi bozulursa (ör. `import type`) Nest boş bırakır ve yönetici
// uyarıları yalnız günlüğe düşer — bu blok onu yakalar.
async function nBlogu(): Promise<void> {
  console.log('\n── N · BAĞLANTI: Nest enjeksiyonu ──');
  @Module({
    providers: [
      AbonelikServisi,
      EpostaServisi,
      { provide: PrismaService, useValue: {} },
      { provide: IyzicoClient, useValue: {} },
      { provide: ConfigService, useValue: new ConfigService({}) },
    ],
  })
  class BaglantiModulu {}
  // ⚠ `abortOnError: false`: Nest bağımlılığı çözemeyince varsayılan olarak
  // SÜRECİ KAPATIR — özet satırı basılmaz, teşhis kaybolur (`import type`
  // mutantında ölçüldü). Kapalıyken hata fırlar, `blok('N')` onu kırmızı
  // assert yapar ve kalan özet yine basılır.
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
  try {
    app = await NestFactory.createApplicationContext(BaglantiModulu, { logger: gunlukServisi, abortOnError: false });
    const servis = app.get(AbonelikServisi);
    check('N1 ⭐ Nest, AbonelikServisi\'ne EpostaServisi\'ni enjekte ediyor (tip meta verisi doğru)',
      (servis as any).eposta instanceof EpostaServisi, `eposta=${(servis as any).eposta?.constructor?.name}`);
  } finally {
    await app?.close();
    Logger.overrideLogger(gunlukServisi);
  }
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nHAVALE ↔ iyzico: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
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
    check(`${ad} bloğu çökmeden bitti`, false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main(): Promise<void> {
  // Beklentiler varsayılan merdiveni ölçer (10. gün KISITLI); ortamdaki bir
  // dunning ayarı sayıları kaydırıp sahte kırmızı üretmesin.
  for (const ad of Object.keys(process.env)) if (ad.startsWith('DUNNING_')) delete process.env[ad];
  process.env.YONETIM_EPOSTA = YONETIM;
  await blok('F', fBlogu);
  await blok('İ', iBlogu);
  await blok('A', aBlogu);
  await blok('B', bBlogu);
  await blok('D', dBlogu);
  await blok('Y', yBlogu);
  await blok('M', mBlogu);
  await blok('K', kBlogu);
  // Nest bağlamı günlüğü yeniden kurar — en sonda koşar.
  await blok('N', nBlogu);
  son();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
