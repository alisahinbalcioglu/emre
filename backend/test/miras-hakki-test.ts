/**
 * MİRAS HAKKI AYRI TAŞINIR  (`npm run test:miras-hakki`) · 26.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK servisler bellek-Prisma üzerinde koşar:
 * `SatinAlmaServisi` (iyzico dönüşü → `aboneligiAcVeyaGuncelle` · iptal),
 * `AbonelikServisi` (geçit `durumDegistir` + `mirasaDon`), gerçek webhook
 * controller'ı + `WebhookIsleyici`, `MutabakatJob` (gece + saatlik),
 * `MirasDonusuJob` (10 dk), `DunningServisi` (merdiven), `HavaleServisi`
 * (teklif → fatura → onay), `FaturaServisi`, `ErisimServisi` (karar).
 * Temel dünya `havale-iyzico-cakismasi-test.ts`ten (bellek-Prisma + durumlu
 * sahte iyzico + sabit saat); eklenen: miras paketleri, iyzico form dönüşü,
 * iptal edilmiş aboneliğin `endDate`i, tek seferlik okuma kancası (yarış).
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * 01.09 göçü her firmaya `miras-core`/`miras-pro` satırı yazdı (HAVALE, AKTIF,
 * erişim 2027-09-01). Miras tarihi `erisimSonu` içinde "ödenmiş erişim" gibi
 * taşınıyordu:
 *   G1 kart satın alma `max(mevcut, köprü)` + iptal `erisimSonu`na dokunmaz →
 *      1 ay Pro öde, iptal et, Pro'yu miras bitişine kadar kullan;
 *   G4 havale `max(erisimSonu, şimdi) + ay` → 1 aylık Pro havalesi 340+30 gün;
 *   G2 mutabakat İPTAL dalı `erisimSonu = endDate` (varsa) — miras silinebilir;
 *   G3 dunning 10./30. gün kısıt/askı — kart düşen miras firma mirası kaybeder.
 * KARAR (Emre, 24.09 + 26.09): miras hakkı AYRI alanlarda; ödenen dönem BUGÜN
 * başlar; ücretli dönem bitince satır miras paketine DÖNER. Kural TEK yerde:
 * `abonelik/miras-hakki.ts`.
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  saf kurallar + ALAN ENVANTERİ (şemadaki her Abonelik alanı dönüşte
 *      yazılır ya da BİLEREK korunur; yeni alan → kırmızı)
 *   K  kartla satın alma: köprü + hak yakalama; ilk tahsilat düzeltir;
 *      miras DIŞI süren ödenmiş erişim eski kural (regresyon)
 *   İ  iptal: uygulama · iyzico CANCELED (`endDate` yok / iptal anı / dönem
 *      sonu / miras bitişi) · yarış (iptal → geç ilk tahsilat webhook'u)
 *   D  dönüş yolları: saatlik · 10 dk · EXPIRED · 160 gün · negatifler ·
 *      bekçi (bayat aday taze ödemeyi çevirmez) · eşzamanlı iki iş
 *   H  havale: 1 ay Pro (340+30 değil) · dönem bitince dönüş · miras yenilemesi
 *      → kart → dönüş yenilenmiş bitişe · miras DIŞI yenileme (regresyon)
 *   N  dunning: tolerans ücretli pakette · kısıt günü ve sonrası dönüş + kart
 *      kapatma + bildirim · kira · okuma sonrası ödeme · iptal arızası
 *   G  satın alma kapısı: dönmüş satırda açık kart → KART_ABONELIGI_ACIK
 *   E  metinler: İPTAL şeridi, ODEME_BEKLIYOR şeridi, iptal e-postası,
 *      dunning 2./3. e-posta (miras firmada "salt-okunur" YOK)
 *   C  hesap kapatma / yönetici silme mirası bitirir
 *   B  bağlantı: şema · göç · modül kaydı · kapatma çağıranları
 *
 * ⚠ SAAT: servisler `new Date()`/`Date.now()` okur — `saatte()` global Date'i
 * geçici olarak değiştirir. Beklenen tarihler ELLE yazıldı (33 gün köprü,
 * takvim ayı dönem) — servis yardımcılarından TÜRETİLMEDİ (dairesel ölçüt yok).
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
process.env.TZ = 'UTC';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { DenemeHakkiServisi } from '../src/ozellik/odeme/abonelik/deneme-hakki.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { MirasDonusuJob } from '../src/ozellik/odeme/abonelik/miras-donusu.job';
import {
  donemSonuKarari,
  mirasGecerliMi,
  mirasaDonusVerisi,
  mirasiAyir,
  mirasiBitirVerisi,
  mirastaMi,
  mirastanCikisMi,
  odenenDonemTabani,
} from '../src/ozellik/odeme/abonelik/miras-hakki';
import { MutabakatJob } from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { yeniAbonelikEngeli } from '../src/ozellik/odeme/abonelik/paket-degisimi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { HavaleServisi } from '../src/ozellik/odeme/havale/havale.servisi';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';
import type { IyzicoAbonelikDurumu, IyzicoSiparis } from '../src/ozellik/odeme/iyzico/iyzico.client';
import type { AbonelikWebhookGovdesi } from '../src/ozellik/odeme/iyzico/imza';
import { IyzicoWebhookController } from '../src/ozellik/odeme/webhook/webhook.controller';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
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

const DAKIKA = 60_000;
const SAAT = 60 * DAKIKA;
const GUN = 24 * SAAT;
const YONETIM = 'yonetim@ornek.test';
const PRO_TUTARI = 1649;

/** Gerçek saat sınıfı — `saatte()` global Date'i değiştirirken taklit buna bakar. */
const GercekDate = Date;
const tarih = (an: number | Date | null | undefined) =>
  an === null || an === undefined ? String(an) : new GercekDate(an instanceof GercekDate ? an.getTime() : an).toISOString();
const ms = (d: Date | null | undefined) => (d instanceof GercekDate ? d.getTime() : NaN);

/** Takvim ayı ekler (servislerin `setMonth` kuralıyla aynı takvim, TZ=UTC). */
function ayEkle(an: number, ay: number): number {
  const d = new GercekDate(an);
  d.setMonth(d.getMonth() + ay);
  return d.getTime();
}

/** Test ekseni: 2026-10-01 09:00Z. Miras bitişi canlıdaki göç satırlarıyla aynı an. */
const T0 = GercekDate.UTC(2026, 9, 1, 9, 0, 0);
const MIRAS_BITIS = GercekDate.UTC(2027, 8, 1, 20, 31, 30, 318);

/**
 * Saati verilen ana sabitler (`new Date()` + `Date.now()`); iş bitince ÖNCEKİ
 * saati geri yükler — iç içe çağrılabilir.
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
//  GÜNLÜK — yutulan hata GÖRÜNSÜN (servisler birçok hatayı `catch` + log ile yutar)
// ═════════════════════════════════════════════════════════════════════════
const gunluk: Array<{ seviye: 'uyari' | 'hata'; metin: string }> = [];
const konsol = process.env.HI_GUNLUK ? new ConsoleLogger() : null;
Logger.overrideLogger({
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
});
const hatalarSonra = (i: number) => gunluk.slice(i).filter((g) => g.seviye === 'hata').map((g) => g.metin);

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA (havale-iyzico-cakismasi-test.ts sürümü + miras ilişkisi,
//  niyet tablosu ve tek seferlik okuma kancası)
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    mirasPaketSurumu: { model: 'paketSurumu', yerel: 'mirasPaketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  havaleOdemesi: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
  abonelikBaslatma: { paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' } },
};

/** Şemadaki @unique alanlar — ihlal P2002. */
const TEKILLER: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  paketSurumu: ['iyzicoPlanKodu', 'iyzicoDenemesizPlanKodu'],
  havaleOdemesi: ['teklifNo'],
  webhookOlayi: ['tekilAnahtar'],
  fatura: ['tahsilatKodu'],
  abonelikBaslatma: ['token'],
};

/** Prisma verilmeyen opsiyonel alanı `null` döndürür ve şema varsayılanını uygular. */
const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'DENEME', denemeSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null,
    odenenPaketSurumuId: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    kopruErisimSonu: null, denemeHatirlatmasi: null, tahsilatKirasi: null,
    mirasPaketSurumuId: null, mirasErisimSonu: null,
    olusturuldu: new Date(), guncellendi: new Date(),
  }),
  paket: () => ({ aciklama: null, sira: 0, kapsam: 'mechanical', seviye: 'pro', kullaniciHakki: 5, aylikTeklifHakki: null, dwgAktif: true, aktif: true }),
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
    ilce: null, faturaEposta: null, yetkiliEposta: null, imhaTarihi: null, telefon: null,
  }),
  abonelikBaslatma: () => ({
    durum: 'BEKLIYOR', iyzicoAbonelikKodu: null, denemeSayisi: 0, sonKontrol: null, sonuclandi: null,
    hata: null, epostaNormal: null, formEpostaNormal: null, telefonNormal: null, sozlesmeSurumu: null,
    olusturuldu: new Date(),
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

function bellekPrisma() {
  const tablolar: Record<string, Satir[]> = {};
  const tablo = (m: string) => (tablolar[m] ??= []);
  /**
   * TEK SEFERLİK okuma kancası: `model.islem` çağrısı sonucunu HESAPLADIKTAN
   * sonra, DÖNDÜRMEDEN önce koşar. Yarışı kurar: iş satırı okudu, o arada
   * başka bir yazım oldu, iş BAYAT okumayla devam eder.
   */
  const kancalar = new Map<string, () => Promise<void>>();
  const kancaKos = async (anahtar: string) => {
    const k = kancalar.get(anahtar);
    if (!k) return;
    kancalar.delete(anahtar);
    await k();
  };

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
      const sonuc = s ? yansit(model, s, arg) : null;
      await kancaKos(`${model}.findUnique`);
      return sonuc;
    },
    findUniqueOrThrow: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (!s) throw Object.assign(new Error(`${model} bulunamadı`), { code: 'P2025' });
      const sonuc = yansit(model, s, arg);
      await kancaKos(`${model}.findUniqueOrThrow`);
      return sonuc;
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
      const sonuc = liste.map((s) => yansit(model, s, arg));
      await kancaKos(`${model}.findMany`);
      return sonuc;
    },
    count: async (arg: any = {}) => {
      await Promise.resolve();
      return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
    },
    create: async (arg: any) => {
      await Promise.resolve();
      return yansit(model, olustur(model, arg.data), arg);
    },
    upsert: async (arg: any) => {
      await Promise.resolve();
      const s = tablo(model).find((r) => whereUygula(r, arg.where));
      if (s) {
        veriUygula(s, arg.update ?? {});
        return yansit(model, s, arg);
      }
      return yansit(model, olustur(model, arg.create), arg);
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
        // ⚠ Etkileşimli `$transaction` ATOMİK DEĞİL taklit edilir (havale
        // onayının atomikliği `test:havale-onay-yarisi`nın konusu).
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
  return {
    prisma,
    tablo,
    ekle: olustur,
    kanca: (model: string, islem: string, fn: () => Promise<void>) => void kancalar.set(`${model}.${islem}`, fn),
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE iyzico — belgelenen davranış + form dönüşü + iptal edilmişin endDate'i
// ═════════════════════════════════════════════════════════════════════════
interface SahteAbonelik {
  kod: string;
  durum: IyzicoAbonelikDurumu;
  plan: string;
  musteri: string;
  olusturuldu: number;
  siparisler: IyzicoSiparis[];
  /** Detay yanıtındaki `endDate`; `undefined` = alan HİÇ yok (26.09 sandbox ölçümü). */
  endDate?: number | string;
}

function sahteIyzico() {
  const abonelikler = new Map<string, SahteAbonelik>();
  const formlar = new Map<string, Record<string, unknown>>();
  const cagrilar: Array<{ ad: string; kod: string; an: number }> = [];
  const iptalArizasi = new Map<string, Error>();
  let sayac = 0;

  const bul = (kod: string): SahteAbonelik => {
    const a = abonelikler.get(kod);
    if (!a) throw new IyzicoHatasi('201400', `Abonelik bulunamadı: ${kod}`, 422);
    return a;
  };
  const kaydet = (ad: string, kod: string) => cagrilar.push({ ad, kod, an: Date.now() });
  const detay = (a: SahteAbonelik) => ({
    referenceCode: a.kod,
    pricingPlanReferenceCode: a.plan,
    customerReferenceCode: a.musteri,
    subscriptionStatus: a.durum,
    createdDate: a.olusturuldu,
    ...(a.endDate !== undefined ? { endDate: a.endDate } : {}),
    orders: a.siparisler.map((s) => ({ ...s })),
  });

  const istemci: any = {
    formSonucu: async (token: string) => {
      kaydet('formSonucu', token);
      const f = formlar.get(token);
      if (!f) throw new IyzicoHatasi('201400', `Form bulunamadı: ${token}`, 422);
      return { ...f };
    },
    abonelikGetir: async (kod: string) => {
      kaydet('abonelikGetir', kod);
      return detay(bul(kod));
    },
    abonelikIptal: async (kod: string) => {
      kaydet('abonelikIptal', kod);
      const ariza = iptalArizasi.get(kod);
      if (ariza) throw ariza;
      const a = bul(kod);
      if (a.durum === 'UPGRADED' || a.durum === 'CANCELED' || a.durum === 'EXPIRED') {
        throw new IyzicoHatasi('201403', 'Bu abonelik iptal edilemez.', 422);
      }
      a.durum = 'CANCELED';
      return {};
    },
    abonelikAra: async () => {
      kaydet('abonelikAra', '');
      return [...abonelikler.values()].map(detay);
    },
    // Dunning yeniden denemesi: kart hâlâ reddediyor.
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

  /** iyzico'nun dönem çekimi — iptal/bitmiş/yükseltilmiş abonelikte çekim YOK (`null`). */
  function donemCekimi(kod: string, p: { basarili: boolean; baslangic: number; bitis: number; an: number }) {
    const a = bul(kod);
    if (a.durum === 'CANCELED' || a.durum === 'EXPIRED' || a.durum === 'UPGRADED') return null;
    const siparis = `sip-${kod}-${a.siparisler.length + 1}`;
    a.siparisler.push({
      referenceCode: siparis,
      orderStatus: p.basarili ? 'SUCCESS' : 'FAILED',
      startPeriod: new GercekDate(p.baslangic).toISOString(),
      endPeriod: new GercekDate(p.bitis).toISOString(),
      price: PRO_TUTARI,
      ...(p.basarili ? { paidPrice: PRO_TUTARI } : {}),
      paymentAttempts: [{ paymentAttemptStatus: p.basarili ? 'SUCCESS' : 'FAILED' }],
    });
    a.durum = p.basarili ? 'ACTIVE' : 'UNPAID';
    return { siparis, govde: govde(a, siparis, p.basarili, p.an) };
  }

  /** Başarısız siparişin yeniden denemesi başarılı (kart güncellendi / panelden). */
  function yenidenDeneme(kod: string, siparis: string, an: number): AbonelikWebhookGovdesi | null {
    const a = bul(kod);
    const s = a.siparisler.find((x) => x.referenceCode === siparis);
    if (!s || s.orderStatus !== 'FAILED' || a.durum === 'CANCELED' || a.durum === 'EXPIRED') return null;
    s.orderStatus = 'SUCCESS';
    s.paidPrice = s.price;
    s.paymentAttempts = [...(s.paymentAttempts ?? []), { paymentAttemptStatus: 'SUCCESS' }];
    a.durum = 'ACTIVE';
    return govde(a, siparis, true, an);
  }

  return {
    istemci,
    cagrilar,
    formlar,
    donemCekimi,
    yenidenDeneme,
    kur: (kod: string, musteri: string, ek: Partial<SahteAbonelik> = {}) =>
      abonelikler.set(kod, { kod, durum: 'ACTIVE', plan: 'plan-pro-denemesiz', musteri, olusturuldu: T0, siparisler: [], ...ek }),
    durumYaz: (kod: string, durum: IyzicoAbonelikDurumu, endDate?: number | string) => {
      const a = bul(kod);
      a.durum = durum;
      if (endDate !== undefined) a.endDate = endDate;
    },
    iptaliBoz: (kod: string, hata: Error) => void iptalArizasi.set(kod, hata),
    durum: (kod: string) => abonelikler.get(kod)?.durum,
    sayi: (ad: string, kod?: string) => cagrilar.filter((c) => c.ad === ad && (!kod || c.kod === kod)).length,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  DÜNYA — gerçek servisler, sahte iyzico/e-posta/muhasebe
// ═════════════════════════════════════════════════════════════════════════
function dunyaKur() {
  const db = bellekPrisma();
  const iyz = sahteIyzico();
  const decimal = (n: number) => new Prisma.Decimal(n);
  const surum = (id: string, paketId: string, o: Satir) =>
    db.ekle('paketSurumu', {
      id, paketId, surumNo: 1, iyzicoUrunKodu: `urun-${paketId}`, tutar: decimal(0), paraBirimi: 'TRY',
      periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 0, satistaMi: true, iyzicoDenemesizPlanKodu: null, ...o,
    });
  // Göç paketleri (migration 20260828100000): satış dışı, tutar 0, deneme yok.
  db.ekle('paket', { id: 'P-MC', kod: 'miras-core', ad: 'Miras — Core (MEP)', kapsam: 'mep', seviye: 'core', kullaniciHakki: 5, dwgAktif: false, aktif: false });
  surum('S-MC', 'P-MC', { iyzicoPlanKodu: 'MIRAS-miras-core', satistaMi: false });
  db.ekle('paket', { id: 'P-MP', kod: 'miras-pro', ad: 'Miras — Pro (MEP)', kapsam: 'mep', seviye: 'pro', kullaniciHakki: 5, dwgAktif: true, aktif: false });
  surum('S-MP', 'P-MP', { iyzicoPlanKodu: 'MIRAS-miras-pro', satistaMi: false });
  db.ekle('paket', { id: 'P1', kod: 'pro-mek', ad: 'Pro — Mekanik', kullaniciHakki: 2, dwgAktif: true });
  surum('S1', 'P1', {
    surumNo: 2, iyzicoPlanKodu: 'plan-pro', iyzicoDenemesizPlanKodu: 'plan-pro-denemesiz', tutar: decimal(PRO_TUTARI), denemeGunu: 30,
  });

  const epostalar: Array<{ kime: string; konu: string; baslik?: string; paragraflar: string[]; an: number }> = [];
  const eposta: any = {
    yapilandirildiMi: () => true,
    gonder: async (m: any) => {
      epostalar.push({ kime: m.kime, konu: m.konu, baslik: m.baslik, paragraflar: [...(m.paragraflar ?? [])], an: Date.now() });
    },
  };
  const config = new ConfigService({
    UYGULAMA_URL: 'https://ornek.test',
    IYZICO_MERCHANT_ID: 'uye-isyeri-1',
    IYZICO_SECRET_KEY: 'gizli-anahtar',
  });
  const muhasebe: any = { ad: 'sahte', faturaKes: async () => { throw new Error('fatura kesimi bu pakette koşmaz'); } };

  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci, eposta);
  const fatura = new FaturaServisi(db.prisma, muhasebe, eposta);
  const havale = new HavaleServisi(db.prisma, abonelik, fatura, eposta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, eposta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning);
  const controller = new IyzicoWebhookController(db.prisma, { kuyrugaAl: () => undefined } as any, config);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  const mirasDonusu = new MirasDonusuJob(db.prisma, abonelik);
  const erisim = new ErisimServisi(db.prisma);
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, {} as any, eposta);

  function firma(firmaId: string): void {
    db.ekle('firma', {
      id: firmaId, ad: `Firma ${firmaId}`, unvan: `${firmaId} Mühendislik Ltd.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', faturaEposta: `muhasebe@${firmaId.toLowerCase()}.test`,
    });
  }

  /**
   * Göç satırı (migration 20260828100000'ün yazdığı biçim: HAVALE, AKTIF, iyzico
   * bağı yok, `olusturuldu` = bitiş − 365 gün). `doldur` = yeni göçün geriye
   * dönük doldurması (varsayılan: VAR).
   */
  function mirasSatiri(firmaId: string, p: { bitis?: number; surum?: string; doldur?: boolean; ek?: Satir } = {}): Satir {
    firma(firmaId);
    const bitis = p.bitis ?? MIRAS_BITIS;
    const surumId = p.surum ?? 'S-MC';
    return db.ekle('abonelik', {
      firmaId, paketSurumuId: surumId, durum: 'AKTIF', erisimSonu: new GercekDate(bitis), odemeYontemi: 'HAVALE',
      olusturuldu: new GercekDate(bitis - 365 * GUN), guncellendi: new GercekDate(bitis - 365 * GUN),
      ...(p.doldur === false ? {} : { mirasPaketSurumuId: surumId, mirasErisimSonu: new GercekDate(bitis) }),
      ...(p.ek ?? {}),
    });
  }

  let niyetSayaci = 0;
  /**
   * GERÇEK satın alma dönüşü: niyet → iyzico form sonucu → `donusIyzicodan`.
   * Denemesiz plan: iyzico ilk dönemi form anında çeker (20.08 tutanağı) —
   * ilk tahsilatın webhook gövdesi DÖNER, teslimi senaryonun işi (yarış).
   */
  async function kartlaSatinAl(firmaId: string, an: number) {
    const n = ++niyetSayaci;
    const kod = `sub-${firmaId}-${n}`;
    const token = `tok-${firmaId}-${n}`;
    db.ekle('abonelikBaslatma', {
      token, firmaId, paketSurumuId: 'S1', olusturanId: `U-${firmaId}`, denemeGunu: 0,
      planKodu: 'plan-pro-denemesiz', olusturuldu: new GercekDate(an),
    });
    iyz.kur(kod, `mus-${firmaId}`, { olusturuldu: an });
    iyz.formlar.set(token, {
      referenceCode: kod, customerReferenceCode: `mus-${firmaId}`, subscriptionStatus: 'ACTIVE',
      pricingPlanReferenceCode: 'plan-pro-denemesiz',
    });
    const ilk = iyz.donemCekimi(kod, { basarili: true, baslangic: an, bitis: ayEkle(an, 1), an })!;
    const donus = await saatte(an, () => satinAlma.donusIyzicodan(token));
    return { kod, donus, ilkSiparis: ilk.siparis, ilkCekim: ilk.govde };
  }

  /** iyzico'nun POST'u → gerçek controller → gerçek işleyici. */
  async function webhookGonder(g: AbonelikWebhookGovdesi | null, an: number): Promise<boolean> {
    if (!g) return false;
    await saatte(an, async () => {
      await controller.abonelik(g, undefined);
      await isleyici.bekleyenleriIsle();
    });
    return true;
  }

  /** Yöneticinin GERÇEK üç adımı: teklif → fatura kesildi → dekont onayı. */
  async function havaleIleOde(firmaId: string, an: number, p: { surum: string; ay: number; tutar?: number }): Promise<string> {
    return saatte(an, async () => {
      const teklif = await havale.teklifOlustur({
        firmaId, paketSurumuId: p.surum, ayAdedi: p.ay, tutar: p.tutar ?? 1649 * p.ay, olusturanId: 'yonetici-1',
      });
      await havale.faturaKesildi(teklif.id, `FTR-${firmaId}-${teklif.id.slice(0, 4)}`, 'yonetici-1');
      await havale.odemeyiOnayla({ havaleId: teklif.id, onaylayanId: 'yonetici-1' });
      return teklif.id;
    });
  }

  const iptalEt = (firmaId: string, an: number, s: Record<string, unknown> = { musteriyeBildir: true }) =>
    saatte(an, () => (satinAlma.iptalEt as any)(firmaId, `U-${firmaId}`, 'test', s));
  const saatlik = (an: number) => saatte(an, () => mutabakat.suresiDolanlariKapat());
  const onDakika = (an: number) => saatte(an, () => mirasDonusu.mirasaDonenleriTara());
  const gece = (an: number) => saatte(an, () => mutabakat.geceMutabakati());
  const merdiven = (an: number) => saatte(an, () => dunning.merdiveniYurut());
  const oku = (firmaId: string) => db.tablo('abonelik').find((r) => r.firmaId === firmaId)!;
  const karar = (firmaId: string, an: number) => saatte(an, () => erisim.karar(firmaId, new GercekDate(an)));
  const olaylar = (abonelikId: string, tip?: RegExp) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && (!tip || tip.test(o.tip)));
  const donusOlaylari = (abonelikId: string) =>
    olaylar(abonelikId, /^durum\.degisti$/).filter((o) => o.veri?.mirasaDonus === true);
  const musteriye = (firmaId: string) =>
    epostalar.filter((e) => e.kime === `muhasebe@${firmaId.toLowerCase()}.test`);
  const yoneticiye = () => epostalar.filter((e) => e.kime === YONETIM);

  return {
    db, iyz, epostalar, abonelik, havale, dunning, isleyici, mutabakat, mirasDonusu, erisim, satinAlma,
    firma, mirasSatiri, kartlaSatinAl, webhookGonder, havaleIleOde, iptalEt, saatlik, onDakika, gece, merdiven,
    oku, karar, olaylar, donusOlaylari, musteriye, yoneticiye,
  };
}
type Dunya = ReturnType<typeof dunyaKur>;

/** Miras firma kartla Pro alır ve ilk tahsilat webhook'u işlenir (K akışının kısaltması). */
async function mirastanKartaGec(d: Dunya, firmaId: string, an = T0) {
  d.mirasSatiri(firmaId);
  const s = await d.kartlaSatinAl(firmaId, an);
  await d.webhookGonder(s.ilkCekim, an + DAKIKA);
  return s;
}

/** Satır miras-core'a (2027-09-01) dönmüş mü — dönüş verisinin TAMAMI. */
function mirastaDondu(ab: Satir, p: { surum?: string; bitis?: number } = {}): boolean {
  return (
    ab.paketSurumuId === (p.surum ?? 'S-MC') &&
    ab.durum === 'AKTIF' &&
    ab.odemeYontemi === 'HAVALE' &&
    ms(ab.erisimSonu) === (p.bitis ?? MIRAS_BITIS) &&
    ab.kopruErisimSonu === null &&
    ab.ilkBasarisizlik === null &&
    ab.denemeSayisi === 0 &&
    ab.kisitlandi === null &&
    ab.tahsilatKirasi === null &&
    ab.planliPaketSurumuId === null &&
    ab.odenenPaketSurumuId === null
  );
}
const ozet = (ab: Satir) =>
  `paket=${ab?.paketSurumuId} durum=${ab?.durum} yontem=${ab?.odemeYontemi} erisim=${tarih(ab?.erisimSonu)} ` +
  `kopru=${tarih(ab?.kopruErisimSonu)} miras=${ab?.mirasPaketSurumuId}@${tarih(ab?.mirasErisimSonu)}`;

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURALLAR + ALAN ENVANTERİ
// ═════════════════════════════════════════════════════════════════════════
async function sBlogu(): Promise<void> {
  console.log('\n── S · saf kurallar (miras-hakki.ts) + alan envanteri ──');
  const simdi = new GercekDate(T0);
  const gelecek = new GercekDate(MIRAS_BITIS);
  const gecmis = new GercekDate(T0 - GUN);
  const kod = (k: string) => ({ paket: { kod: k } });
  const gocSatiri = { paketSurumuId: 'S-MC', erisimSonu: gelecek, mirasPaketSurumuId: 'S-MC', mirasErisimSonu: gelecek, paketSurumu: kod('miras-core') };
  const doldurulmamis = { paketSurumuId: 'S-MC', erisimSonu: gelecek, paketSurumu: kod('miras-core') };
  const kartta = {
    paketSurumuId: 'S1', erisimSonu: new GercekDate(ayEkle(T0, 1)), mirasPaketSurumuId: 'S-MC', mirasErisimSonu: gelecek, paketSurumu: kod('pro-mek'),
  };
  const mirassiz = { paketSurumuId: 'S1', erisimSonu: new GercekDate(ayEkle(T0, 1)), mirasPaketSurumuId: null, mirasErisimSonu: null, paketSurumu: kod('pro-mek') };

  check('S1 mirastaMi: göç satırı · doldurulmamış (önek) · eşitlik (kodsuz) EVET; kartta · mirassız HAYIR',
    mirastaMi(gocSatiri) && mirastaMi(doldurulmamis) && mirastaMi({ paketSurumuId: 'S-MC', erisimSonu: gelecek, mirasPaketSurumuId: 'S-MC' }) &&
      !mirastaMi(kartta) && !mirastaMi(mirassiz));
  check('S2 mirasGecerliMi: kartta + gelecek EVET; mirastaki satır HAYIR (erişimi zaten miras)',
    mirasGecerliMi(kartta, simdi) && !mirasGecerliMi(gocSatiri, simdi));
  check('S2b sınır: bitiş = şimdi GEÇERSİZ · geçmiş GEÇERSİZ · alan yok GEÇERSİZ',
    !mirasGecerliMi({ ...kartta, mirasErisimSonu: simdi }, simdi) && !mirasGecerliMi({ ...kartta, mirasErisimSonu: gecmis }, simdi) &&
      !mirasGecerliMi(mirassiz, simdi));
  const pro = { paketSurumuId: 'S1', mirasPaketi: false };
  check('S4 mirastanCikisMi: miras → Pro EVET; miras → miras-pro (yenileme) · aynı paket · kartta HAYIR',
    mirastanCikisMi(gocSatiri, pro) && !mirastanCikisMi(gocSatiri, { paketSurumuId: 'S-MP', mirasPaketi: true }) &&
      !mirastanCikisMi(gocSatiri, { paketSurumuId: 'S-MC', mirasPaketi: true }) && !mirastanCikisMi(kartta, pro));
  const yenilenmis = { ...gocSatiri, paketSurumuId: 'S-MP', paketSurumu: kod('miras-pro'), erisimSonu: new GercekDate(ayEkle(MIRAS_BITIS, 12)) };
  const a1 = mirasiAyir(doldurulmamis);
  const a2 = mirasiAyir(yenilenmis);
  const a3 = mirasiAyir(kartta);
  check('S5 mirasiAyir: doldurulmamış göç satırı → o anki paket + erisimSonu', a1.mirasPaketSurumuId === 'S-MC' && ms(a1.mirasErisimSonu) === MIRAS_BITIS, JSON.stringify(a1));
  check('S5b mirasiAyir: miras yenilemesi (miras-pro, +12 ay) → YENİ paket + büyük bitiş',
    a2.mirasPaketSurumuId === 'S-MP' && ms(a2.mirasErisimSonu) === ayEkle(MIRAS_BITIS, 12), JSON.stringify(a2));
  check('S5c mirasiAyir: mirasta değilse alanlar AYNEN (yakalanmış hak ezilmez)', a3.mirasPaketSurumuId === 'S-MC' && ms(a3.mirasErisimSonu) === MIRAS_BITIS);
  check("S6 odenenDonemTabani: mirastan Pro'ya ŞİMDİ · yenileme eski bitiş · mirassız süren bitiş · bitmiş şimdi",
    ms(odenenDonemTabani(gocSatiri, pro, simdi)) === T0 &&
      ms(odenenDonemTabani(gocSatiri, { paketSurumuId: 'S-MP', mirasPaketi: true }, simdi)) === MIRAS_BITIS &&
      ms(odenenDonemTabani(mirassiz, pro, simdi)) === ayEkle(T0, 1) &&
      ms(odenenDonemTabani({ ...mirassiz, erisimSonu: gecmis }, pro, simdi)) === T0);
  const mirasTeklifi = { paketSurumuId: 'S-MC', mirasPaketi: true };
  check('S6b odenenDonemTabani (inceleme O2): ücretli satır → miras teklifi, hak geçerli → HAK bitişi (hak kaybolmaz); hak dolmuş → ödenen dönem; ücretli teklif → ödenen dönem',
    ms(odenenDonemTabani(kartta, mirasTeklifi, simdi)) === MIRAS_BITIS &&
      ms(odenenDonemTabani({ ...kartta, mirasErisimSonu: gecmis }, mirasTeklifi, simdi)) === ayEkle(T0, 1) &&
      ms(odenenDonemTabani(kartta, pro, simdi)) === ayEkle(T0, 1));
  const k = (ab: any, o = {}) => donemSonuKarari(ab, simdi, o);
  check('S7 donemSonuKarari: hak yok · satır mirasta · hak dolmuş → SONA_ERDI (bugünkü davranış)',
    k({ ...mirassiz, durum: 'IPTAL', erisimSonu: gecmis }) === 'SONA_ERDI' && k({ ...gocSatiri, durum: 'IPTAL', erisimSonu: gecmis }) === 'SONA_ERDI' &&
      k({ ...kartta, durum: 'IPTAL', erisimSonu: gecmis, mirasErisimSonu: gecmis }) === 'SONA_ERDI');
  check('S7b donemSonuKarari: hak + dönem bitti · ödeme sorunlu · iyzico EXPIRED → MIRAS',
    k({ ...kartta, durum: 'IPTAL', erisimSonu: simdi }) === 'MIRAS' && k({ ...kartta, durum: 'KISITLI' }) === 'MIRAS' &&
      k({ ...kartta, durum: 'AKTIF' }, { iyzicoBitti: true }) === 'MIRAS');
  check('S7c donemSonuKarari: hak var, dönem SÜRÜYOR → BEKLE (bayat aday taze ödemeyi çevirmez)',
    k({ ...kartta, durum: 'AKTIF' }) === 'BEKLE' && k({ ...kartta, durum: 'IPTAL' }) === 'BEKLE');
  check('S7d donemSonuKarari (inceleme Y1): dönem SÜRÜYORSA hak olmasa da BEKLE — mirasa dönmüş satır (mirasta, AKTIF) · hak dolmuş ücretli satır',
    k({ ...gocSatiri, durum: 'AKTIF' }) === 'BEKLE' && k({ ...kartta, durum: 'IPTAL', mirasErisimSonu: gecmis }) === 'BEKLE');
  const veri = mirasaDonusVerisi(kartta);
  check('S8 mirasaDonusVerisi: paket miras · AKTIF · HAVALE · erişim miras bitişi',
    veri.paketSurumuId === 'S-MC' && veri.durum === 'AKTIF' && veri.odemeYontemi === 'HAVALE' && ms(veri.erisimSonu) === MIRAS_BITIS);
  let firladi = false;
  try {
    mirasaDonusVerisi(mirassiz);
  } catch {
    firladi = true;
  }
  check('S8b hak yoksa dönüş verisi ÜRETİLMEZ (fırlatır)', firladi);
  const bitir1 = mirasiBitirVerisi(kartta, simdi);
  const bitir2 = mirasiBitirVerisi(gocSatiri, simdi);
  check('S10 mirasiBitirVerisi: kartta → yalnız hak bugüne (ödenen dönem KORUNUR); mirasta → hak + erişim bugüne',
    ms(bitir1.mirasErisimSonu) === T0 && bitir1.erisimSonu === undefined && ms(bitir2.mirasErisimSonu) === T0 && ms(bitir2.erisimSonu) === T0,
    JSON.stringify({ bitir1, bitir2 }));

  // ALAN ENVANTERİ: şemadaki HER skaler Abonelik alanı dönüşte ya YAZILIR ya
  // da BİLEREK korunur. Şemaya yeni alan eklenince kırmızı olur — "dönüşte bu
  // alana ne olmalı?" sorusu cevaplanmadan geçilemez.
  const sema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const modeller = new Set([...sema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const bas = sema.indexOf('model Abonelik {');
  const govdeMetni = sema.slice(bas, sema.indexOf('\n}', bas));
  const alanlar = govdeMetni
    .split('\n')
    .slice(1)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('//') && !s.startsWith('@@'))
    .map((s) => s.split(/\s+/))
    .filter(([ad, tip]) => /^\w+$/.test(ad ?? '') && !!tip && !modeller.has(tip.replace(/[?[\]]/g, '')))
    .map(([ad]) => ad);
  const YAZILAN = Object.keys(veri);
  const KORUNAN = [
    'id', 'firmaId', 'iyzicoAbonelikKodu', 'iyzicoKokKodu', 'iyzicoMusteriKodu', 'iyzicoDurum', 'iyzicoSonKontrol',
    'iptalTalebi', 'iptalNedeni', 'mirasPaketSurumuId', 'mirasErisimSonu', 'denemeHatirlatmasi', 'olusturuldu', 'guncellendi',
  ];
  const siniflanmamis = alanlar.filter((a) => !YAZILAN.includes(a) && !KORUNAN.includes(a));
  const ikiKez = YAZILAN.filter((a) => KORUNAN.includes(a));
  const semadaYok = [...YAZILAN, ...KORUNAN].filter((a) => !alanlar.includes(a));
  check('S9-OLCUT şemadan Abonelik skaler alanları okundu (≥ 25)', alanlar.length >= 25, `adet=${alanlar.length} ${alanlar.join(',')}`);
  check('S9 ⭐ ALAN ENVANTERİ: her alan dönüşte YAZILIR ya da BİLEREK korunur', siniflanmamis.length === 0, `sınıflanmamış: ${siniflanmamis.join(', ')}`);
  check('S9b envanter tutarlı: iki listede birden alan yok, şemada olmayan alan yok', ikiKez.length === 0 && semadaYok.length === 0,
    `ikiKez=${ikiKez} semadaYok=${semadaYok}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — KARTLA SATIN ALMA: ödenen dönem BUGÜN, hak ayrı
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · kartla satın alma: köprü + hak yakalama ──');
  {
    const d = dunyaKur();
    const ab0 = d.mirasSatiri('F-K1');
    check('K-FIXTURE göç satırı: miras-core · HAVALE · 2027-09-01 · doldurulmuş hak',
      ab0.paketSurumuId === 'S-MC' && ab0.odemeYontemi === 'HAVALE' && ms(ab0.erisimSonu) === MIRAS_BITIS && ab0.mirasPaketSurumuId === 'S-MC');
    const s = await d.kartlaSatinAl('F-K1', T0);
    const ab = d.oku('F-K1');
    check('K0 iyzico dönüşü TAMAMLANDI (gerçek giriş noktası)', s.donus === 'tamam', `donus=${s.donus}`);
    check('K1 ⭐⭐ G1: ödenen Pro BUGÜN başlar — erişim köprü 33 gün (miras bitişi DEĞİL)',
      ab.paketSurumuId === 'S1' && ab.odemeYontemi === 'KART' && ms(ab.erisimSonu) === T0 + 33 * GUN, ozet(ab));
    check('K1b köprü işareti yazıldı (ilk tahsilat düzeltsin)', ms(ab.kopruErisimSonu) === ms(ab.erisimSonu), ozet(ab));
    check('K1c hak AYRI alanda: miras-core @ 2027-09-01', ab.mirasPaketSurumuId === 'S-MC' && ms(ab.mirasErisimSonu) === MIRAS_BITIS, ozet(ab));
    await d.webhookGonder(s.ilkCekim, T0 + DAKIKA);
    const ab2 = d.oku('F-K1');
    check('K2 ilk tahsilat köprüyü iyzico dönem sonuna düzeltti (33 g → takvim ayı), hak aynen',
      ms(ab2.erisimSonu) === ayEkle(T0, 1) && ab2.kopruErisimSonu === null && ab2.mirasPaketSurumuId === 'S-MC' && ms(ab2.mirasErisimSonu) === MIRAS_BITIS,
      ozet(ab2));
    const kanit = d.olaylar(ab2.id, /^durum\.degisti$/).filter((o) => o.aktor === 'webhook');
    check('K2-KANIT webhook siparişi GERÇEKTEN işledi, köprü düzeltildi', kanit.length === 1 && kanit[0].veri?.kopruDuzeltildi === true,
      JSON.stringify(kanit.map((o) => o.veri)));
    const acildi = d.olaylar(ab2.id, /^abonelik\.yeniden\.acildi$/)[0];
    check('K2-İZ yeniden açılma olayı yakalanan hakkı taşır',
      acildi?.veri?.mirasPaketSurumuId === 'S-MC' && acildi?.veri?.mirasErisimSonu === tarih(MIRAS_BITIS), JSON.stringify(acildi?.veri));
  }
  {
    // Doldurma ALMAMIŞ göç satırı (başka ortam): önekten tanınır.
    const d = dunyaKur();
    d.mirasSatiri('F-K3', { doldur: false });
    await d.kartlaSatinAl('F-K3', T0);
    const ab = d.oku('F-K3');
    check('K3 doldurmasız göç satırı da köprüyle başlar ve hak yakalanır',
      ms(ab.erisimSonu) === T0 + 33 * GUN && ab.mirasPaketSurumuId === 'S-MC' && ms(ab.mirasErisimSonu) === MIRAS_BITIS, ozet(ab));
  }
  {
    // REGRESYON: miras DIŞI satırda süren ÖDENMİŞ erişim korunur (02.09 kuralı).
    const d = dunyaKur();
    d.firma('F-K4');
    d.db.ekle('abonelik', { firmaId: 'F-K4', paketSurumuId: 'S1', durum: 'AKTIF', erisimSonu: new GercekDate(T0 + 200 * GUN), odemeYontemi: 'HAVALE' });
    await d.kartlaSatinAl('F-K4', T0);
    const ab = d.oku('F-K4');
    check('K4 miras dışı süren ödenmiş erişim (200 gün) KORUNDU, köprü NULL, hak yok',
      ms(ab.erisimSonu) === T0 + 200 * GUN && ab.kopruErisimSonu === null && ab.mirasPaketSurumuId === null, ozet(ab));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  İ — İPTAL: iki yol aynı, Pro miras dönemine TAŞMAZ
// ═════════════════════════════════════════════════════════════════════════
async function iBlogu(): Promise<void> {
  console.log('\n── İ · iptal: uygulama · iyzico CANCELED · yarış ──');
  const DONEM_SONU = ayEkle(T0, 1);
  {
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-I1');
    await d.iptalEt('F-I1', T0 + 15 * GUN);
    const ab = d.oku('F-I1');
    check('İ1 uygulama iptali: IPTAL, erişim ÖDENMİŞ dönem sonu (miras bitişi DEĞİL)', ab.durum === 'IPTAL' && ms(ab.erisimSonu) === DONEM_SONU && !!ab.iptalTalebi, ozet(ab));
    const k1 = await d.karar('F-I1', T0 + 15 * GUN);
    check('İ1b dönem içinde Pro erişimi sürer', k1.erisimVar === true && k1.paketKodu === 'pro-mek', JSON.stringify({ erisim: k1.erisimVar, paket: k1.paketKodu }));
    await d.onDakika(T0 + 15 * GUN + DAKIKA);
    await d.saatlik(T0 + 15 * GUN + 2 * DAKIKA);
    check('İ2 dönem sürerken ne 10 dk işi ne saatlik iş dokunur', d.oku('F-I1').durum === 'IPTAL' && d.donusOlaylari(ab.id).length === 0, ozet(d.oku('F-I1')));
    const k2 = await d.karar('F-I1', DONEM_SONU + DAKIKA);
    check('İ3 ⭐⭐ G1: dönem bitince Pro erişimi YOK (miras bitişine taşmaz)', !(k2.erisimVar && k2.paketKodu === 'pro-mek'),
      JSON.stringify({ erisim: k2.erisimVar, paket: k2.paketKodu }));
    await d.saatlik(DONEM_SONU + 5 * DAKIKA);
    const ab3 = d.oku('F-I1');
    check("İ4 ⭐⭐ saatlik iş (SONA_ERDI geçidi) satırı miras-core'a döndürdü: AKTIF · HAVALE · 2027-09-01", mirastaDondu(ab3), ozet(ab3));
    check('İ4b iptal izi ve iyzico kodu KORUNDU (kart kapalılık kuralı ona bakar)', !!ab3.iptalTalebi && ab3.iyzicoAbonelikKodu !== null, ozet(ab3));
    const k3 = await d.karar('F-I1', DONEM_SONU + 6 * DAKIKA);
    check('İ4c erişim kararı: miras-core, erişim VAR, AKTIF', k3.erisimVar === true && k3.paketKodu === 'miras-core' && k3.durum === 'AKTIF',
      JSON.stringify({ erisim: k3.erisimVar, paket: k3.paketKodu, durum: k3.durum }));
    const don = d.donusOlaylari(ab3.id);
    check('İ4-İZ tek dönüş olayı: IPTAL → AKTIF, istenen SONA_ERDI, önceki paket ve erişim',
      don.length === 1 && don[0].oncekiDurum === 'IPTAL' && don[0].yeniDurum === 'AKTIF' && don[0].veri?.istenen === 'SONA_ERDI' &&
        don[0].veri?.oncekiPaketSurumuId === 'S1' && don[0].veri?.oncekiErisimSonu === tarih(DONEM_SONU),
      JSON.stringify(don.map((o) => [o.oncekiDurum, o.yeniDurum, o.veri])));
    await d.onDakika(DONEM_SONU + 15 * DAKIKA);
    await d.saatlik(DONEM_SONU + 65 * DAKIKA);
    check('İ5 sonraki turlar DOKUNMAZ (satır mirasta, tek dönüş olayı)', mirastaDondu(d.oku('F-I1')) && d.donusOlaylari(ab3.id).length === 1);
  }
  // İ6 · iyzico tarafı iptal (panel): `endDate`in dört biçimi.
  const bicimler: Array<[string, number | string | undefined]> = [
    ['endDate YOK — 26.09 sandbox ölçümü', undefined],
    ['endDate = iptal anı', T0 + 10 * GUN],
    ['endDate = dönem sonu', DONEM_SONU],
    ['endDate = miras bitişi', MIRAS_BITIS],
  ];
  for (const [i, [ad, endDate]] of bicimler.entries()) {
    const d = dunyaKur();
    const firmaId = `F-I6-${i}`;
    const s = await mirastanKartaGec(d, firmaId);
    d.iyz.durumYaz(s.kod, 'CANCELED', endDate);
    await d.gece(T0 + 10 * GUN + 3 * SAAT);
    const ab = d.oku(firmaId);
    check(`İ6.${i} ⭐ G2 iyzico CANCELED (${ad}): IPTAL, erişim ödenmiş dönem sonunda KALDI`, ab.durum === 'IPTAL' && ms(ab.erisimSonu) === DONEM_SONU, ozet(ab));
    await d.saatlik(DONEM_SONU + 5 * DAKIKA);
    check(`İ6.${i}b dönem sonunda mirasa döndü`, mirastaDondu(d.oku(firmaId)), ozet(d.oku(firmaId)));
  }
  {
    // İ7 · YARIŞ: iptal, ilk tahsilat webhook'undan ÖNCE (webhook gecikti).
    const d = dunyaKur();
    d.mirasSatiri('F-I7');
    const s = await d.kartlaSatinAl('F-I7', T0);
    await d.iptalEt('F-I7', T0 + 2 * DAKIKA);
    check("İ7-FIXTURE iptal iyzico'da yapıldı, satır IPTAL", d.iyz.durum(s.kod) === 'CANCELED' && d.oku('F-I7').durum === 'IPTAL');
    await d.webhookGonder(s.ilkCekim, T0 + 10 * DAKIKA);
    const ab = d.oku('F-I7');
    check("İ7 ⭐ geç ilk tahsilat: satır IPTAL KALDI (AKTIF KART'a dönmedi), köprü dönem sonuna düzeltildi",
      ab.durum === 'IPTAL' && ms(ab.erisimSonu) === DONEM_SONU && ab.kopruErisimSonu === null, ozet(ab));
    const kanit = d.olaylar(ab.id, /^durum\.degisti$/).filter((o) => o.aktor === 'webhook');
    check('İ7-KANIT webhook siparişi GERÇEKTEN işledi', kanit.length === 1, JSON.stringify(kanit.map((o) => [o.oncekiDurum, o.yeniDurum])));
    await d.gece(T0 + GUN + 3 * SAAT);
    check('İ7b gece mutabakatı (CANCELED) satırı değiştirmedi', d.oku('F-I7').durum === 'IPTAL' && ms(d.oku('F-I7').erisimSonu) === DONEM_SONU, ozet(d.oku('F-I7')));
    await d.onDakika(DONEM_SONU + 10 * DAKIKA);
    check('İ7c dönem sonunda 10 dk işi mirasa döndürdü', mirastaDondu(d.oku('F-I7')), ozet(d.oku('F-I7')));
  }
  {
    // İ8 · GECE TARAMASI sırasında satır mirasa döndü (26.09 kod incelemesi
    // O1): liste KART + IPTAL satırını aldı; satırın taze okumasından ÖNCE 10 dk
    // işi onu döndürdü (tarama satır başına ≥120 ms + iyzico çağrısı — uzun sürer).
    const d = dunyaKur();
    const s = await mirastanKartaGec(d, 'F-I8');
    await d.iptalEt('F-I8', T0 + 5 * GUN);
    d.db.kanca('abonelik', 'findMany', async () => {
      await d.onDakika(DONEM_SONU + 3 * DAKIKA);
    });
    const g0 = gunluk.length;
    await d.gece(DONEM_SONU + 3 * DAKIKA);
    const ab = d.oku('F-I8');
    check("İ8-FIXTURE yarış kuruldu: 10 dk işi gece listesinden SONRA döndürdü (tek dönüş olayı), iyzico CANCELED",
      d.donusOlaylari(ab.id).length === 1 && d.iyz.durum(s.kod) === 'CANCELED', ozet(ab));
    check("İ8 ⭐ gece taraması mirasa dönmüş (HAVALE) satırı IPTAL'e ÇEKMEDİ",
      mirastaDondu(ab) && !d.olaylar(ab.id, /^durum\.degisti$/).some((o) => o.aktor === 'mutabakat'), ozet(ab));
    // Koşullu yazım da (P2025) satırı korurdu ama HATA yazardı: dönmüş satır kart
    // kuralına HİÇ girmemeli (açık `odemeYontemi` denetimi).
    const satirHatalari = hatalarSonra(g0).filter((m) => m.includes(ab.id));
    check('İ8b gece bu satır için HATA yazmadı (kart kuralına girmedi)', satirHatalari.length === 0, satirHatalari.join(' | '));
  }
  {
    // İ9 · pencerenin İKİNCİ yarısı: gece taraması satırı TAZE okudu (kartlı,
    // IPTAL); yazımdan ÖNCE yönetici havaleyi onayladı (AKTIF HAVALE Pro, dönem
    // ileride); iyzico eski kartı EXPIRED diyor. Yazım taze okumaya KOŞULLU
    // olmasaydı havale ödeyen müşteri mirasa çevrilirdi.
    const d = dunyaKur();
    const s = await mirastanKartaGec(d, 'F-I9');
    await d.iptalEt('F-I9', T0 + 5 * GUN);
    d.iyz.durumYaz(s.kod, 'EXPIRED');
    const an = T0 + 10 * GUN + 3 * SAAT;
    d.db.kanca('abonelik', 'findUniqueOrThrow', async () => {
      await d.havaleIleOde('F-I9', an, { surum: 'S1', ay: 1 });
    });
    await d.gece(an);
    const ab = d.oku('F-I9');
    check('İ9-FIXTURE yarış kuruldu: havale gece okumasından SONRA onaylandı (HAVALE Pro, dönem ileride)',
      ab.odemeYontemi === 'HAVALE' && ab.paketSurumuId === 'S1' && ms(ab.erisimSonu) > an, ozet(ab));
    check('İ9 ⭐ gece yazımı taze okumaya koşullu: havale ödeyen satır mirasa ÇEVRİLMEDİ, SONA_ERDI de olmadı',
      ab.durum === 'AKTIF' && d.donusOlaylari(ab.id).length === 0, ozet(ab));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  D — DÖNÜŞ YOLLARI · NEGATİFLER · BEKÇİ · EŞZAMANLILIK
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · dönüş yolları, negatifler, bekçi ──');
  const DONEM_SONU = ayEkle(T0, 1);
  {
    const d = dunyaKur();
    const s = await mirastanKartaGec(d, 'F-D1');
    d.iyz.durumYaz(s.kod, 'EXPIRED');
    await d.gece(T0 + 10 * GUN + 3 * SAAT);
    check('D1 ⭐ iyzico EXPIRED (gece): satır mirasa döndü, SONA_ERDI değil', mirastaDondu(d.oku('F-D1')), ozet(d.oku('F-D1')));
  }
  {
    // Dunning 160 gün penceresi: ASKIDA kart satırı, hak geçerli.
    const d = dunyaKur();
    d.firma('F-D2');
    d.iyz.kur('sub-D2', 'mus-D2', { durum: 'UNPAID' });
    d.db.ekle('abonelik', {
      firmaId: 'F-D2', paketSurumuId: 'S1', durum: 'ASKIDA', erisimSonu: new GercekDate(T0 - 161 * GUN), odemeYontemi: 'KART',
      iyzicoAbonelikKodu: 'sub-D2', iyzicoKokKodu: 'sub-D2', iyzicoDurum: 'UNPAID', ilkBasarisizlik: new GercekDate(T0 - 161 * GUN), denemeSayisi: 6,
      mirasPaketSurumuId: 'S-MC', mirasErisimSonu: new GercekDate(MIRAS_BITIS),
    });
    await d.merdiven(T0);
    check('D2 ⭐ dunning 160 gün (ASKIDA): SONA_ERDI yerine mirasa dönüş', mirastaDondu(d.oku('F-D2')), ozet(d.oku('F-D2')));
  }
  const vakalar: Array<[string, Satir]> = [
    ['D3 hak DOLMUŞ', { mirasPaketSurumuId: 'S-MC', mirasErisimSonu: new GercekDate(DONEM_SONU - GUN) }],
    ['D4 sınır: hak bitişi = şimdi', { mirasPaketSurumuId: 'S-MC', mirasErisimSonu: new GercekDate(DONEM_SONU + 5 * DAKIKA) }],
    ['D5 hak YOK (sıradan kart firması)', {}],
  ];
  for (const [i, [ad, ek]] of vakalar.entries()) {
    const d = dunyaKur();
    const firmaId = `F-D3-${i}`;
    d.firma(firmaId);
    d.db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', durum: 'IPTAL', erisimSonu: new GercekDate(DONEM_SONU), odemeYontemi: 'KART',
      iyzicoAbonelikKodu: `sub-${firmaId}`, iyzicoDurum: 'CANCELED', iptalTalebi: new GercekDate(T0), ...ek,
    });
    await d.saatlik(DONEM_SONU + 5 * DAKIKA);
    const ab = d.oku(firmaId);
    check(`${ad} → SONA_ERDI, paket DEĞİŞMEDİ (bugünkü davranış)`, ab.durum === 'SONA_ERDI' && ab.paketSurumuId === 'S1' && d.donusOlaylari(ab.id).length === 0, ozet(ab));
  }
  {
    // BEKÇİ (10 dk işi): havale dönemi bitti, iş adayı OKUDU; o arada yönetici
    // yeni havaleyi onayladı (bayat okuma). ⚠ Kartla yeniden satın alma bu
    // yarışı KURAMAZ: IPTAL/AKTIF satırda satın alma kapısı kapalı
    // (`ABONELIK_ZATEN_VAR`) — gerçek yarış havale onayıdır.
    const d = dunyaKur();
    d.mirasSatiri('F-D6');
    await d.havaleIleOde('F-D6', T0, { surum: 'S1', ay: 1 });
    const bitis = ayEkle(T0, 1);
    d.db.kanca('abonelik', 'findMany', async () => {
      await d.havaleIleOde('F-D6', bitis + 2 * DAKIKA, { surum: 'S1', ay: 1 });
    });
    await d.onDakika(bitis + 2 * DAKIKA);
    const ab = d.oku('F-D6');
    check('D6-FIXTURE yarış kuruldu: yeni havale işlendi (Pro, dönem ileride)',
      ab.paketSurumuId === 'S1' && ms(ab.erisimSonu) === ayEkle(bitis + 2 * DAKIKA, 1), ozet(ab));
    check('D6 ⭐ 10 dk işi: bayat aday taze havale ödemesini mirasa ÇEVİRMEDİ',
      ab.durum === 'AKTIF' && ab.odemeYontemi === 'HAVALE' && d.donusOlaylari(ab.id).length === 0, ozet(ab));
  }
  {
    // BEKÇİ (saatlik iş): iptal edilmiş kartın dönemi bitti, iş adayı OKUDU; o
    // arada yönetici havale onayladı → SONA_ERDI de mirasa dönüş de YAZILMAZ.
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-D6B');
    await d.iptalEt('F-D6B', T0 + 5 * GUN);
    d.db.kanca('abonelik', 'findMany', async () => {
      await d.havaleIleOde('F-D6B', DONEM_SONU + 2 * DAKIKA, { surum: 'S1', ay: 1 });
    });
    await d.saatlik(DONEM_SONU + 2 * DAKIKA);
    const ab = d.oku('F-D6B');
    check('D6b-FIXTURE yarış kuruldu: havale işlendi (AKTIF HAVALE Pro, dönem ileride)',
      ab.durum === 'AKTIF' && ab.odemeYontemi === 'HAVALE' && ms(ab.erisimSonu) === ayEkle(DONEM_SONU + 2 * DAKIKA, 1), ozet(ab));
    check('D6b ⭐ saatlik iş: bayat aday taze ödemeyi SONA_ERDI yapmadı, mirasa da çevirmedi',
      ab.paketSurumuId === 'S1' && d.donusOlaylari(ab.id).length === 0 &&
        !d.olaylar(ab.id, /^durum\.degisti$/).some((o) => o.yeniDurum === 'SONA_ERDI'), ozet(ab));
  }
  {
    // İki iş AYNI satıra aynı anda (saatlik + 10 dk): TEK dönüş.
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-D7');
    await d.iptalEt('F-D7', T0 + 5 * GUN);
    await saatte(DONEM_SONU + 5 * DAKIKA, () => Promise.all([d.mutabakat.suresiDolanlariKapat(), d.mirasDonusu.mirasaDonenleriTara()]));
    const ab = d.oku('F-D7');
    check('D7 ⭐ eşzamanlı iki iş: satır mirasta, TEK dönüş olayı', mirastaDondu(ab) && d.donusOlaylari(ab.id).length === 1,
      `${ozet(ab)} olay=${d.donusOlaylari(ab.id).length}`);
  }
  {
    // D8 · SIRALI yarış (26.09 kod incelemesi Y1): saatlik iş adayı OKUDU; o
    // arada 10 dk işi satırı mirasa DÖNDÜRDÜ; saatlik iş bayat adayla SONA_ERDI
    // ister. Taze satır mirasta ve dönemi SÜRÜYOR → BEKLE. (D7 yalnız iki
    // okumanın da yazımdan ÖNCE olduğu eşzamanlı sırayı ölçer.)
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-D8');
    await d.iptalEt('F-D8', T0 + 5 * GUN);
    d.db.kanca('abonelik', 'findMany', async () => {
      await d.onDakika(DONEM_SONU + 3 * DAKIKA);
    });
    await d.saatlik(DONEM_SONU + 3 * DAKIKA);
    const ab = d.oku('F-D8');
    const don = d.donusOlaylari(ab.id);
    check('D8-FIXTURE yarış kuruldu: 10 dk işi saatlik işin okumasından SONRA döndürdü (tek dönüş, aktör miras-donusu)',
      don.length === 1 && don[0].aktor === 'miras-donusu', JSON.stringify(don.map((o) => o.aktor)));
    check('D8 ⭐ saatlik iş bayat adayla mirasa dönmüş satırı SONA_ERDI YAPMADI (miras-core @ 2027-09-01, AKTIF)',
      mirastaDondu(ab) && !d.olaylar(ab.id, /^durum\.degisti$/).some((o) => o.yeniDurum === 'SONA_ERDI'), ozet(ab));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  H — HAVALE: ödenen dönem BUGÜN, dönem bitince dönüş, miras yenilemesi
// ═════════════════════════════════════════════════════════════════════════
async function hBlogu(): Promise<void> {
  console.log('\n── H · havale: 1 ay Pro (340+30 değil) · dönüş · miras yenilemesi ──');
  {
    const d = dunyaKur();
    d.mirasSatiri('F-H1');
    await d.havaleIleOde('F-H1', T0, { surum: 'S1', ay: 1 });
    const ab = d.oku('F-H1');
    check('H1 ⭐⭐ G4: 1 aylık Pro havalesi BUGÜNDEN 1 ay (miras bitişi + 1 ay DEĞİL)',
      ab.paketSurumuId === 'S1' && ab.odemeYontemi === 'HAVALE' && ms(ab.erisimSonu) === ayEkle(T0, 1), ozet(ab));
    check('H1b hak AYRI alanda: miras-core @ 2027-09-01', ab.mirasPaketSurumuId === 'S-MC' && ms(ab.mirasErisimSonu) === MIRAS_BITIS, ozet(ab));
    const fatura = d.db.tablo('fatura').find((f) => f.abonelikId === ab.id);
    check('H1c havale faturasının dönem sonu da 1 ay', ms(fatura?.donemSonu) === ayEkle(T0, 1), `donemSonu=${tarih(fatura?.donemSonu)}`);
    await d.onDakika(ayEkle(T0, 1) - DAKIKA);
    check('H2-ÖNCE dönem sürerken 10 dk işi dokunmaz', d.oku('F-H1').paketSurumuId === 'S1' && d.donusOlaylari(ab.id).length === 0, ozet(d.oku('F-H1')));
    await d.onDakika(ayEkle(T0, 1) + 5 * DAKIKA);
    check('H2 ⭐ havale dönemi bitince 10 dk işi mirasa döndürdü (bugün HAVALE satırını hiçbir iş kapatmıyordu)',
      mirastaDondu(d.oku('F-H1')), ozet(d.oku('F-H1')));
  }
  {
    // Miras yenilemesi (yönetici satış dışı miras sürümüyle teklif verir) → kart → iptal → dönüş.
    const d = dunyaKur();
    d.mirasSatiri('F-H3');
    await d.havaleIleOde('F-H3', T0, { surum: 'S-MP', ay: 12, tutar: 5000 });
    const YENI = ayEkle(MIRAS_BITIS, 12);
    const ab = d.oku('F-H3');
    check('H3 miras yenilemesi (miras-pro, 12 ay): ESKİ bitişten uzar, satır mirasta kalır', ab.paketSurumuId === 'S-MP' && ms(ab.erisimSonu) === YENI, ozet(ab));
    const s = await d.kartlaSatinAl('F-H3', T0 + GUN);
    await d.webhookGonder(s.ilkCekim, T0 + GUN + DAKIKA);
    const ab2 = d.oku('F-H3');
    check('H3b kartla Pro: hak YENİLENMİŞ hâliyle yakalandı (miras-pro @ +12 ay), Pro bugünden',
      ab2.mirasPaketSurumuId === 'S-MP' && ms(ab2.mirasErisimSonu) === YENI && ms(ab2.erisimSonu) === ayEkle(T0 + GUN, 1), ozet(ab2));
    await d.iptalEt('F-H3', T0 + 5 * GUN);
    await d.onDakika(ayEkle(T0 + GUN, 1) + 5 * DAKIKA);
    check('H3c dönüş YENİLENMİŞ bitişe (miras-pro)', mirastaDondu(d.oku('F-H3'), { surum: 'S-MP', bitis: YENI }), ozet(d.oku('F-H3')));
  }
  {
    // REGRESYON: miras dışı havale yenilemesi eski bitişten (havale-teklif-paketi H1/H3).
    const d = dunyaKur();
    d.firma('F-H4');
    const eskiSon = T0 + 60 * GUN;
    d.db.ekle('abonelik', { firmaId: 'F-H4', paketSurumuId: 'S1', durum: 'AKTIF', erisimSonu: new GercekDate(eskiSon), odemeYontemi: 'HAVALE' });
    await d.havaleIleOde('F-H4', T0, { surum: 'S1', ay: 12 });
    check('H4 miras dışı yenileme eski bitişten uzar, hak alanı boş kalır',
      ms(d.oku('F-H4').erisimSonu) === ayEkle(eskiSon, 12) && d.oku('F-H4').mirasPaketSurumuId === null, ozet(d.oku('F-H4')));
  }
  {
    // DOLDURMASIZ göç satırı (doldurma bir satırı kaçırdıysa) → havale Pro: hak
    // havale yolunda da ÖNEKTEN yakalanır — yoksa dönem sonunda dönülecek paket
    // olmaz ve satır SONA_ERDI'ye düşer (satın alma yolunun ikizi: K3).
    const d = dunyaKur();
    d.mirasSatiri('F-H5', { doldur: false });
    check('H5-FIXTURE doldurmasız göç satırı: hak alanı BOŞ', d.oku('F-H5').mirasPaketSurumuId == null, ozet(d.oku('F-H5')));
    await d.havaleIleOde('F-H5', T0, { surum: 'S1', ay: 1 });
    const ab = d.oku('F-H5');
    check('H5 ⭐ doldurmasız göç satırında havale Pro: hak YAKALANDI (miras-core @ 2027-09-01), Pro bugünden 1 ay',
      ab.paketSurumuId === 'S1' && ms(ab.erisimSonu) === ayEkle(T0, 1) && ab.mirasPaketSurumuId === 'S-MC' &&
        ms(ab.mirasErisimSonu) === MIRAS_BITIS, ozet(ab));
    await d.onDakika(ayEkle(T0, 1) + 5 * DAKIKA);
    check('H5b dönem sonunda mirasa döndü (miras-core @ 2027-09-01)', mirastaDondu(d.oku('F-H5')), ozet(d.oku('F-H5')));
  }
  {
    // H6 · ÜCRETLİ satır (kartla Pro, hak miras-core @ 2027-09-01) → yönetici
    // miras yenilemesi havalesi (26.09 kod incelemesi O2): satır miras paketine
    // geçer ve `mirasErisimSonu` bir daha okunmaz — taban ödenen dönemden
    // olsaydı ödeyen müşteri ~9 aylık hakkını kaybederdi.
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-H6');
    await d.havaleIleOde('F-H6', T0 + 5 * GUN, { surum: 'S-MC', ay: 12, tutar: 3000 });
    const ab = d.oku('F-H6');
    check('H6 ⭐ ücretli satırda miras yenilemesi: miras-core, erişim HAK bitişinden +12 ay (hak kaybolmadı)',
      ab.paketSurumuId === 'S-MC' && ab.odemeYontemi === 'HAVALE' && ms(ab.erisimSonu) === ayEkle(MIRAS_BITIS, 12), ozet(ab));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  N — DUNNING: tolerans ücretli pakette, kısıt günü ve sonrası mirasa dönüş
// ═════════════════════════════════════════════════════════════════════════
const R = ayEkle(T0, 1); // ilk yenileme anı

/** Miras firma kartla Pro; ilk yenileme reddedilir → ODEME_BEKLIYOR. */
async function reddedilenYenileme(d: Dunya, firmaId: string) {
  const s = await mirastanKartaGec(d, firmaId);
  const ret = d.iyz.donemCekimi(s.kod, { basarili: false, baslangic: R, bitis: ayEkle(R, 1), an: R })!;
  await d.webhookGonder(ret.govde, R + DAKIKA);
  return { ...s, retSiparis: ret.siparis };
}

async function nBlogu(): Promise<void> {
  console.log('\n── N · dunning: tolerans ücretli pakette, kısıt günü ve sonrası mirasa dönüş ──');
  {
    const d = dunyaKur();
    const s = await reddedilenYenileme(d, 'F-N1');
    const ab0 = d.oku('F-N1');
    check('N-FIXTURE yenileme reddi: ODEME_BEKLIYOR, Pro, ilk başarısızlık yazıldı',
      ab0.durum === 'ODEME_BEKLIYOR' && ab0.paketSurumuId === 'S1' && ab0.ilkBasarisizlik instanceof GercekDate, ozet(ab0));
    await d.merdiven(R + 3 * GUN + SAAT);
    await d.merdiven(R + 7 * GUN + SAAT);
    const ab1 = d.oku('F-N1');
    const k1 = await d.karar('F-N1', R + 8 * GUN);
    check("N1 tolerans (0-9. gün): Pro'da ODEME_BEKLIYOR, erişim VAR",
      ab1.durum === 'ODEME_BEKLIYOR' && ab1.paketSurumuId === 'S1' && k1.erisimVar === true && k1.paketKodu === 'pro-mek', `${ozet(ab1)} erisim=${k1.erisimVar}`);
    const iptalOnce = d.iyz.sayi('abonelikIptal', s.kod);
    await d.merdiven(R + 10 * GUN + SAAT);
    const ab2 = d.oku('F-N1');
    check('N2 ⭐⭐ G3: kısıt günü KISITLI yerine mirasa dönüş', mirastaDondu(ab2), ozet(ab2));
    check('N2b iyzico kart aboneliği BİR KEZ iptal edildi', d.iyz.sayi('abonelikIptal', s.kod) - iptalOnce === 1 && d.iyz.durum(s.kod) === 'CANCELED',
      `iptal=${d.iyz.sayi('abonelikIptal', s.kod) - iptalOnce} durum=${d.iyz.durum(s.kod)}`);
    const konular = d.musteriye('F-N1').map((e) => e.konu);
    // ⚠ 3. e-postanın miras konusu da "geçiş paketinize dönüyorsunuz" der —
    // sayım DÖNÜŞ bildirimine özgü kalıpla yapılır.
    const donusKonusu = /geçiş paketinize döndünüz/i;
    check('N2c "salt-okunur" e-postası GİTMEDİ; dönüş bildirimi BİR KEZ gitti',
      !konular.some((k) => /salt-okunur/i.test(k)) && konular.filter((k) => donusKonusu.test(k)).length === 1, JSON.stringify(konular));
    const bildirim = d.musteriye('F-N1').find((e) => donusKonusu.test(e.konu));
    check('N2d bildirim ücretli paketi ve geçiş paketini ADIYLA söyler',
      !!bildirim && bildirim.paragraflar.some((p) => p.includes('Pro — Mekanik')) && bildirim.paragraflar.some((p) => p.includes('Miras — Core') && p.includes('2027')),
      JSON.stringify(bildirim?.paragraflar));
    const k2 = await d.karar('F-N1', R + 10 * GUN + 2 * SAAT);
    check('N2e erişim kararı: miras-core, erişim VAR', k2.erisimVar === true && k2.paketKodu === 'miras-core', JSON.stringify({ erisim: k2.erisimVar, paket: k2.paketKodu }));
    const epostaSayisi = d.musteriye('F-N1').length;
    const iyzSayisi = d.iyz.cagrilar.length;
    for (const gun of [11, 20, 30, 161]) await d.merdiven(R + gun * GUN + SAAT);
    check('N3 sonraki basamaklar (11/20/30/161. gün) satıra DOKUNMAZ: e-posta yok, iyzico çağrısı yok',
      mirastaDondu(d.oku('F-N1')) && d.musteriye('F-N1').length === epostaSayisi && d.iyz.cagrilar.length === iyzSayisi,
      `eposta=+${d.musteriye('F-N1').length - epostaSayisi} iyz=+${d.iyz.cagrilar.length - iyzSayisi}`);
  }
  {
    const d = dunyaKur();
    await reddedilenYenileme(d, 'F-N4');
    await d.merdiven(R + 11 * GUN + SAAT);
    const ab = d.oku('F-N4');
    check('N4 ⭐ 10. gün koşusu kaçtı: 11. gün yine mirasa döner', mirastaDondu(ab), ozet(ab));
    check('N4b KISITLI / ASKIDA hiç yazılmadı', !d.olaylar(ab.id, /^durum\.degisti$/).some((o) => o.yeniDurum === 'KISITLI' || o.yeniDurum === 'ASKIDA'));
  }
  {
    const d = dunyaKur();
    await reddedilenYenileme(d, 'F-N5');
    d.oku('F-N5').tahsilatKirasi = new GercekDate(R + 10 * GUN + 5 * SAAT);
    const g0 = gunluk.length;
    await d.merdiven(R + 10 * GUN + SAAT);
    check('N5 ⭐ tahsilat kirası geçerliyken (anlık deneme sürüyor) dönüş YOK', d.oku('F-N5').durum === 'ODEME_BEKLIYOR' && d.oku('F-N5').paketSurumuId === 'S1',
      ozet(d.oku('F-N5')));
    // Koşullu dönüş yazımı (kira boş/geçmiş) satırı yine korurdu ama P2025 ile
    // HATA yazardı: kira sürerken merdiven dönüşü HİÇ denememeli.
    const kiraHatalari = hatalarSonra(g0).filter((m) => m.includes(d.oku('F-N5').id));
    check('N5c kira sürerken merdiven bu satır için HATA yazmadı (dönüş denenmedi)', kiraHatalari.length === 0, kiraHatalari.join(' | '));
    await d.merdiven(R + 11 * GUN + SAAT);
    check('N5b kira bitince ertesi gün döner', mirastaDondu(d.oku('F-N5')), ozet(d.oku('F-N5')));
  }
  {
    // Dunning satırı okudu; o arada ödeme toparlandı (kart güncellendi).
    const d = dunyaKur();
    const s = await reddedilenYenileme(d, 'F-N6');
    d.db.kanca('abonelik', 'findUnique', async () => {
      const g = d.iyz.yenidenDeneme(s.kod, s.retSiparis, R + 10 * GUN + SAAT);
      await d.webhookGonder(g, R + 10 * GUN + SAAT);
    });
    const iptalOnce = d.iyz.sayi('abonelikIptal', s.kod);
    await d.merdiven(R + 10 * GUN + SAAT);
    const ab = d.oku('F-N6');
    check('N6-FIXTURE yarış kuruldu: ödeme toparlandı (AKTIF, dönem uzadı)', ab.durum === 'AKTIF' && ms(ab.erisimSonu) === ayEkle(R, 1), ozet(ab));
    check('N6 ⭐ okuma sonrası ödeme: mirasa DÖNMEDİ, kart İPTAL EDİLMEDİ',
      ab.odemeYontemi === 'KART' && ab.paketSurumuId === 'S1' && d.iyz.sayi('abonelikIptal', s.kod) === iptalOnce && d.donusOlaylari(ab.id).length === 0, ozet(ab));
  }
  {
    const d = dunyaKur();
    const s = await reddedilenYenileme(d, 'F-N7');
    d.iyz.iptaliBoz(s.kod, new IyzicoHatasi('100001', 'Sistem hatası', 500));
    await d.merdiven(R + 10 * GUN + SAAT);
    const ab = d.oku('F-N7');
    check('N7 ⭐ kart iptali arızalı olsa da satır mirasa döndü', mirastaDondu(ab), ozet(ab));
    check('N7b iptal hatası olaya yazıldı', d.olaylar(ab.id, /^iyzico\.abonelik\.iptal\.basarisiz$/).length === 1);
    const y = d.yoneticiye();
    check('N7c yöneticiye TEK e-posta: miras metni (havale değil), elle iptal talimatı',
      y.length === 1 && !/havale/i.test(`${y[0].konu} ${y[0].baslik ?? ''}`) && y[0].paragraflar.some((p) => /geçiş|miras/i.test(p)),
      JSON.stringify(y.map((e) => [e.konu, e.baslik])));
    const g = d.iyz.yenidenDeneme(s.kod, s.retSiparis, R + 12 * GUN);
    await d.webhookGonder(g, R + 12 * GUN);
    check('N7d geç gelen başarılı çekim satırı DEĞİŞTİRMEDİ ("çift tahsilat — iade" dalı)',
      mirastaDondu(d.oku('F-N7')) && d.olaylar(ab.id, /^tahsilat\.cift$/).length === 1, ozet(d.oku('F-N7')));
  }
  {
    const d = dunyaKur();
    await reddedilenYenileme(d, 'F-N8');
    d.oku('F-N8').mirasErisimSonu = new GercekDate(R + 5 * GUN);
    await d.merdiven(R + 10 * GUN + SAAT);
    check('N8 hak dolmuşsa (5. gün bitti) merdiven aynen: 10. gün KISITLI', d.oku('F-N8').durum === 'KISITLI' && d.oku('F-N8').paketSurumuId === 'S1', ozet(d.oku('F-N8')));
  }
  {
    // N9 · dönüş yazıldı, ardından kart kapatma DB hatasıyla DÜŞTÜ (26.09 kod
    // incelemesi D2): satır artık HAVALE — merdiven onu bir daha görmez; müşteri
    // e-postası burada gitmezse HİÇ gitmezdi.
    const d = dunyaKur();
    await reddedilenYenileme(d, 'F-N9');
    (d.abonelik as any).havaleIcinKartAboneliginiKapat = async () => {
      throw new Error('sahte DB: bağlantı koptu');
    };
    await d.merdiven(R + 10 * GUN + SAAT);
    const ab = d.oku('F-N9');
    check('N9-FIXTURE dönüş yazıldı (kart kapatma düştü)', mirastaDondu(ab), ozet(ab));
    check('N9 ⭐ kart kapatma düşse de "geçiş paketinize döndünüz" e-postası BİR KEZ gitti',
      d.musteriye('F-N9').filter((e) => /geçiş paketinize döndünüz/i.test(e.konu)).length === 1,
      JSON.stringify(d.musteriye('F-N9').map((e) => e.konu)));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  G — SATIN ALMA KAPISI: dönmüş satırda açık kart → ikinci abonelik yok
// ═════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · satın alma kapısı ──');
  const kod = (k: string) => ({ paket: { kod: k } });
  check('G1 ⭐ miras satırı + iyzico ACTIVE (kapatılamamış kart) → KART_ABONELIGI_ACIK',
    yeniAbonelikEngeli({ durum: 'AKTIF', iyzicoDurum: 'ACTIVE', paketSurumu: kod('miras-core') }) === 'KART_ABONELIGI_ACIK');
  check('G2 göç satırı (iyzico bağı yok) ve kapalı/ödenmemiş kart → engel YOK',
    yeniAbonelikEngeli({ durum: 'AKTIF', iyzicoDurum: null, paketSurumu: kod('miras-core') }) === null &&
      yeniAbonelikEngeli({ durum: 'AKTIF', iyzicoDurum: 'CANCELED', paketSurumu: kod('miras-core') }) === null &&
      yeniAbonelikEngeli({ durum: 'AKTIF', iyzicoDurum: 'UNPAID', paketSurumu: kod('miras-core') }) === null);
  // Uçtan uca: kart iptali arızalı dönüşten sonra iyzico hâlâ ACTIVE görünüyor → yeni kart aboneliği.
  const d = dunyaKur();
  const s = await reddedilenYenileme(d, 'F-G');
  d.iyz.iptaliBoz(s.kod, new IyzicoHatasi('100001', 'Sistem hatası', 500));
  await d.merdiven(R + 10 * GUN + SAAT);
  const ab = d.oku('F-G');
  ab.iyzicoDurum = 'ACTIVE'; // son bakışta iyzico ACTIVE dedi (çekim yeniden denendi)
  check('G3-FIXTURE satır mirasa döndü, kart iyzico\'da açık', mirastaDondu(ab) && d.iyz.durum(s.kod) !== 'CANCELED', ozet(ab));
  const yeni = await d.kartlaSatinAl('F-G', R + 11 * GUN);
  check('G3 ⭐ ikinci kart aboneliği ENGELLENDİ (yeni abonelik iyzico\'da iptal edildi, satır mirasta)',
    yeni.donus === 'hata' && d.iyz.durum(yeni.kod) === 'CANCELED' && mirastaDondu(d.oku('F-G')), `donus=${yeni.donus} yeni=${d.iyz.durum(yeni.kod)} ${ozet(d.oku('F-G'))}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  T — DENEME HAKKI ikinci emniyeti: hak yakalanmış firma deneme almaz
// ═════════════════════════════════════════════════════════════════════════
async function tBlogu(): Promise<void> {
  console.log('\n── T · deneme hakkı: miras hakkı yakalanmış firma ──');
  const d = dunyaKur();
  const deneme = new DenemeHakkiServisi(d.db.prisma);
  // Asıl koruma `DenemeKullanimi kaynak='miras'` kaydı (göç 20260915100000);
  // burada kayıt BİLEREK yok — ikinci emniyet tek başına ölçülür.
  for (const [firmaId, ek] of [
    ['F-T1', { mirasPaketSurumuId: 'S-MC', mirasErisimSonu: new GercekDate(MIRAS_BITIS) }],
    ['F-T2', {}],
  ] as const) {
    d.firma(firmaId);
    d.db.ekle('user', { id: `U-${firmaId}`, email: `sahip@${firmaId.toLowerCase()}.test`, emailVerified: true, firmaId });
    d.db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', durum: 'SONA_ERDI', erisimSonu: new GercekDate(T0 - GUN), odemeYontemi: 'KART', ...ek,
    });
  }
  const k1 = await deneme.karar({ firmaId: 'F-T1', kullaniciId: 'U-F-T1' });
  const k2 = await deneme.karar({ firmaId: 'F-T2', kullaniciId: 'U-F-T2' });
  check('T1 ⭐ miras hakkı yakalanmış firma (ücretli pakette, dönemi bitmiş) deneme ALMAZ', k1.hak === false && k1.gerekce === 'kullanildi', JSON.stringify(k1));
  check('T2 NEGATİF KONTROL: aynı koşuldaki sıradan firma deneme alır (ölçüt kör değil)', k2.hak === true, JSON.stringify(k2));
}

// ═════════════════════════════════════════════════════════════════════════
//  E — METİNLER: miras firmaya doğru bilgi, miras dışı firmada aynen
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · metinler ──');
  const gecis = /geçiş paket/i;
  {
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-E1');
    await d.iptalEt('F-E1', T0 + 15 * GUN);
    const k = await d.karar('F-E1', T0 + 15 * GUN);
    check('E1 İPTAL şeridi: geçiş paketini ve miras bitişini söyler',
      !!k.uyari && gecis.test(k.uyari.metin) && k.uyari.metin.includes('Miras — Core') && k.uyari.metin.includes('2027'), JSON.stringify(k.uyari));
    const ep = d.musteriye('F-E1').find((e) => /iptal edildi/i.test(e.konu));
    check('E2 iptal onayı e-postası: ödenmiş dönem + ardından geçiş paketi',
      !!ep && ep.paragraflar.some((p) => gecis.test(p) && p.includes('Miras — Core') && p.includes('2027')), JSON.stringify(ep?.paragraflar));
  }
  {
    // Miras DIŞI iptal: metinler aynen.
    const d = dunyaKur();
    d.firma('F-E3');
    const s = await d.kartlaSatinAl('F-E3', T0);
    await d.webhookGonder(s.ilkCekim, T0 + DAKIKA);
    await d.iptalEt('F-E3', T0 + 15 * GUN);
    const k = await d.karar('F-E3', T0 + 15 * GUN);
    const ep = d.musteriye('F-E3').find((e) => /iptal edildi/i.test(e.konu));
    check('E3 miras dışı iptal: şerit ve e-posta geçiş paketinden SÖZ ETMEZ',
      !!k.uyari && !gecis.test(k.uyari.metin) && !!ep && !ep.paragraflar.some((p) => gecis.test(p)), JSON.stringify({ uyari: k.uyari, ep: ep?.paragraflar }));
  }
  {
    const d = dunyaKur();
    await reddedilenYenileme(d, 'F-E4');
    const k = await d.karar('F-E4', R + 2 * GUN);
    check('E4 ODEME_BEKLIYOR şeridi (miras): geçiş paketine dönüşü söyler', gecis.test(k.uyari?.metin ?? ''), JSON.stringify(k.uyari));
    await d.merdiven(R + 3 * GUN + SAAT);
    await d.merdiven(R + 7 * GUN + SAAT);
    const e = d.musteriye('F-E4');
    const ikinci = e.find((x) => /hatırlatması/i.test(x.konu));
    const ucuncu = e.find((x) => /gün sonra/i.test(x.konu));
    check('E5 dunning 2. e-posta (miras): "teklif oluşturma kapanır" DEMEZ, geçiş paketini söyler',
      !!ikinci && !ikinci.paragraflar.some((p) => /geçici olarak kapanır/.test(p)) && ikinci.paragraflar.some((p) => gecis.test(p)), JSON.stringify(ikinci?.paragraflar));
    check('E6 dunning 3. e-posta (miras): "kısıtlanacak / salt-okunur" DEMEZ, geçiş paketini söyler',
      !!ucuncu && !/kısıtlanacak/i.test(ucuncu.konu) && !ucuncu.paragraflar.some((p) => /salt-okunur/i.test(p)) && ucuncu.paragraflar.some((p) => gecis.test(p)),
      JSON.stringify({ konu: ucuncu?.konu, p: ucuncu?.paragraflar }));
  }
  {
    // REGRESYON: miras DIŞI firmanın dunning metinleri aynen.
    const d = dunyaKur();
    d.firma('F-E7');
    const s = await d.kartlaSatinAl('F-E7', T0);
    await d.webhookGonder(s.ilkCekim, T0 + DAKIKA);
    const ret = d.iyz.donemCekimi(s.kod, { basarili: false, baslangic: R, bitis: ayEkle(R, 1), an: R })!;
    await d.webhookGonder(ret.govde, R + DAKIKA);
    const k = await d.karar('F-E7', R + 2 * GUN);
    await d.merdiven(R + 3 * GUN + SAAT);
    await d.merdiven(R + 7 * GUN + SAAT);
    const e = d.musteriye('F-E7');
    const ikinci = e.find((x) => /hatırlatması/i.test(x.konu));
    const ucuncu = e.find((x) => /gün sonra/i.test(x.konu));
    check('E7 miras dışı: şerit, 2. ve 3. e-posta AYNEN (kısıt dili, geçiş paketi yok)',
      !gecis.test(k.uyari?.metin ?? '') && !!ikinci && ikinci.paragraflar.some((p) => /geçici olarak kapanır/.test(p)) &&
        !!ucuncu && /kısıtlanacak/i.test(ucuncu.konu), JSON.stringify({ uyari: k.uyari?.metin, ikinci: ikinci?.konu, ucuncu: ucuncu?.konu }));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  C — HESAP KAPATMA / YÖNETİCİ SİLME mirası bitirir (Emre, 26.09)
// ═════════════════════════════════════════════════════════════════════════
async function cBlogu(): Promise<void> {
  console.log('\n── C · hesap kapatma / yönetici silme mirası bitirir ──');
  const DONEM_SONU = ayEkle(T0, 1);
  {
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-C1');
    await d.iptalEt('F-C1', T0 + 5 * GUN, { mirasiBitir: true });
    const ab = d.oku('F-C1');
    check('C1 kapatma (kartta): hak bugüne çekildi, ÖDENMİŞ dönem korundu',
      ab.durum === 'IPTAL' && ms(ab.mirasErisimSonu) === T0 + 5 * GUN && ms(ab.erisimSonu) === DONEM_SONU, ozet(ab));
    await d.onDakika(DONEM_SONU + 5 * DAKIKA);
    await d.saatlik(DONEM_SONU + 6 * DAKIKA);
    check('C1b dönem sonunda mirasa DÖNMEDİ → SONA_ERDI', d.oku('F-C1').durum === 'SONA_ERDI' && d.oku('F-C1').paketSurumuId === 'S1', ozet(d.oku('F-C1')));
  }
  {
    const d = dunyaKur();
    d.mirasSatiri('F-C2');
    await d.iptalEt('F-C2', T0 + 5 * GUN, { mirasiBitir: true });
    const ab = d.oku('F-C2');
    check('C2 kapatma (mirasta): miras erişimi de bugün biter', ab.durum === 'IPTAL' && ms(ab.erisimSonu) === T0 + 5 * GUN && ms(ab.mirasErisimSonu) === T0 + 5 * GUN, ozet(ab));
    await d.saatlik(T0 + 5 * GUN + SAAT);
    check('C2b saatlik iş SONA_ERDI yaptı', d.oku('F-C2').durum === 'SONA_ERDI', ozet(d.oku('F-C2')));
  }
  {
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-C3');
    await d.iptalEt('F-C3', T0 + 5 * GUN);
    check('C3 müşterinin KENDİ iptali mirası BİTİRMEZ', ms(d.oku('F-C3').mirasErisimSonu) === MIRAS_BITIS, ozet(d.oku('F-C3')));
  }
  {
    // C4 · müşteri ÖNCE kendi iptal etti (hak sürer), SONRA hesabı kapattı.
    // (IPTAL → IPTAL `gecisGecerliMi` için geçerlidir; kapı bu yolun sürdüğünü kilitler.)
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-C4');
    await d.iptalEt('F-C4', T0 + 5 * GUN);
    await d.iptalEt('F-C4', T0 + 6 * GUN, { mirasiBitir: true });
    const ab = d.oku('F-C4');
    check('C4 önce iptal, sonra kapatma: hak bugüne çekildi, ödenmiş dönem korundu, olay izi `miras.bitirildi`',
      ms(ab.mirasErisimSonu) === T0 + 6 * GUN && ms(ab.erisimSonu) === DONEM_SONU &&
        d.olaylar(ab.id, /^miras\.bitirildi$/).length === 1, ozet(ab));
    await d.onDakika(DONEM_SONU + 5 * DAKIKA);
    await d.saatlik(DONEM_SONU + 6 * DAKIKA);
    check('C4b dönem sonunda mirasa DÖNMEDİ → SONA_ERDI', d.oku('F-C4').durum === 'SONA_ERDI' && d.donusOlaylari(ab.id).length === 0, ozet(d.oku('F-C4')));
  }
  {
    // C5 · kapatma, 10 dk işinin OKUMASIYLA YAZIMI ARASINA düştü (26.09 kod
    // incelemesi O3a): iş bayat okumayla dönüş yazmaya kalkar — hak kapatmayla
    // bitti, dönüş YAZILMAMALI (anlık görüntüde miras alanları).
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-C5');
    await d.iptalEt('F-C5', T0 + 5 * GUN);
    d.db.kanca('abonelik', 'findUniqueOrThrow', async () => {
      await d.iptalEt('F-C5', DONEM_SONU + 3 * DAKIKA, { mirasiBitir: true });
    });
    await d.onDakika(DONEM_SONU + 3 * DAKIKA);
    const ab = d.oku('F-C5');
    check('C5-FIXTURE yarış kuruldu: kapatma dönüş işinin taze okumasından SONRA hakkı bitirdi',
      ms(ab.mirasErisimSonu) === DONEM_SONU + 3 * DAKIKA, ozet(ab));
    check('C5 ⭐ bayat dönüş YAZILMADI: kapatılmış firmada AKTIF miras satırı yok',
      ab.paketSurumuId === 'S1' && ab.durum === 'IPTAL' && d.donusOlaylari(ab.id).length === 0, ozet(ab));
  }
  {
    // C6 · kapatmada iyzico iptali DÜŞTÜ (26.09 inceleme: güvenlik DÜŞÜK-1b,
    // kod O3b): çağıran hatayı yalnız günlüğe yazar — hak YİNE bitmeli.
    const d = dunyaKur();
    const s = await mirastanKartaGec(d, 'F-C6');
    d.iyz.iptaliBoz(s.kod, new IyzicoHatasi('100001', 'Sistem hatası', 500));
    const hata = await d.iptalEt('F-C6', T0 + 5 * GUN, { mirasiBitir: true }).then(() => null, (e: unknown) => e);
    const ab = d.oku('F-C6');
    check('C6-FIXTURE iyzico iptali düştü (iptalEt fırlattı), satır iptal EDİLMEDİ',
      hata !== null && ab.durum === 'AKTIF', `${ozet(ab)} hata=${(hata as Error | null)?.message}`);
    check('C6 ⭐ iyzico düşse de hak bitti (bugüne çekildi), olay izi var',
      ms(ab.mirasErisimSonu) === T0 + 5 * GUN && d.olaylar(ab.id, /^miras\.bitirildi$/).length === 1, ozet(ab));
  }
  {
    // C7 · YARIŞ (26.09 inceleme: güvenlik DÜŞÜK-1a): kapatma satırı okudu, o
    // arada müşterinin KENDİ iptali koşullu iptal yazımını kazandı.
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-C7');
    d.db.kanca('abonelik', 'findUnique', async () => {
      await d.iptalEt('F-C7', T0 + 5 * GUN);
    });
    await d.iptalEt('F-C7', T0 + 5 * GUN, { mirasiBitir: true }).catch(() => undefined);
    const ab = d.oku('F-C7');
    check('C7-FIXTURE yarış kuruldu: müşteri iptali kapatmanın okumasından SONRA yazıldı', ab.durum === 'IPTAL' && !!ab.iptalTalebi, ozet(ab));
    check('C7 ⭐ eşzamanlı müşteri iptali kazansa da hak BİTTİ', ms(ab.mirasErisimSonu) === T0 + 5 * GUN, ozet(ab));
  }
  {
    // C8 · kapatmanın hak bitirme OKUMASI ile YAZIMI arasına 10 dk işinin
    // dönüşü düştü: bayat okumayla yalnız `mirasErisimSonu` bugüne çekilseydi
    // satır mirasta kalır, miras erişimi 2027'ye dek SÜRERDİ. Koşullu yazım
    // düşer; taze okumayla yeniden karar: satır mirasta → erişim de bugün biter.
    const d = dunyaKur();
    await mirastanKartaGec(d, 'F-C8');
    await d.iptalEt('F-C8', T0 + 5 * GUN);
    const an = DONEM_SONU + 3 * DAKIKA;
    d.db.kanca('abonelik', 'findUniqueOrThrow', async () => {
      await d.onDakika(an);
    });
    await d.iptalEt('F-C8', an, { mirasiBitir: true }).catch(() => undefined);
    const ab = d.oku('F-C8');
    check('C8-FIXTURE yarış kuruldu: dönüş kapatmanın hak okumasından SONRA yazıldı', d.donusOlaylari(ab.id).length === 1, ozet(ab));
    check("C8 ⭐ taze okumayla yeniden karar: miras erişimi de bugün bitti (kapatılmış firmada 2027'ye dek miras yok)",
      ms(ab.erisimSonu) === an && ms(ab.mirasErisimSonu) === an && d.olaylar(ab.id, /^miras\.bitirildi$/).length === 1, ozet(ab));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  B — BAĞLANTI: şema · göç · modül kaydı · kapatma çağıranları
// ═════════════════════════════════════════════════════════════════════════
function bBlogu(): void {
  console.log('\n── B · bağlantı ──');
  const KOK = join(__dirname, '..');
  const tsYorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const sqlYorumsuz = (s: string) => s.replace(/--.*$/gm, '');
  const sema = readFileSync(join(KOK, 'prisma', 'schema.prisma'), 'utf8').replace(/\/\/\/?.*$/gm, '');
  const bas = sema.indexOf('model Abonelik {');
  const model = sema.slice(bas, sema.indexOf('\n}', bas));
  check('B1 şema: mirasPaketSurumuId String? + mirasErisimSonu DateTime? + ilişki onDelete: Restrict',
    /\bmirasPaketSurumuId\s+String\?/.test(model) && /\bmirasErisimSonu\s+DateTime\?/.test(model) &&
      /mirasPaketSurumu\s+PaketSurumu\?\s+@relation\("AbonelikMirasPaketi",[^)]*onDelete:\s*Restrict/.test(model));
  const gocler = readdirSync(join(KOK, 'prisma', 'migrations')).filter((k) => /^\d{14}_abonelik_miras_hakki$/.test(k));
  check('B2-OLCUT göç klasörü tek', gocler.length === 1, JSON.stringify(gocler));
  const ham = gocler[0] ? readFileSync(join(KOK, 'prisma', 'migrations', gocler[0], 'migration.sql'), 'utf8') : '';
  const sql = sqlYorumsuz(ham);
  check('B2 göç: iki sütun + FK RESTRICT', /ADD COLUMN\s+"mirasErisimSonu" TIMESTAMP\(3\)/.test(sql) && /ADD COLUMN\s+"mirasPaketSurumuId" TEXT/.test(sql) &&
    /FOREIGN KEY \("mirasPaketSurumuId"\) REFERENCES "PaketSurumu"\("id"\) ON DELETE RESTRICT/.test(sql));
  check('B2b göç doldurması: ayraç + yalnız miras- önekli ve BOŞ satırlar', ham.includes('-- ═══ GERIYE DONUK DOLDURMA (miras hakki)') &&
    /LIKE 'miras-%'/.test(sql) && /"mirasPaketSurumuId" IS NULL/.test(sql));
  // `ON DELETE RESTRICT` bir KISIT kuralıdır, silme komutu değil — komut biçimleri aranır.
  check('B2c göç veri SİLMEZ (DROP TABLE/COLUMN · DELETE FROM · TRUNCATE yok)', !/\b(DROP\s+(TABLE|COLUMN|CONSTRAINT)|DELETE\s+FROM|TRUNCATE)\b/i.test(sql));
  const modul = tsYorumsuz(readFileSync(join(KOK, 'src', 'ozellik', 'odeme', 'odeme.module.ts'), 'utf8'));
  check('B3 odeme.module: MirasDonusuJob SAĞLAYICI olarak kayıtlı', /providers:\s*\[[\s\S]*?\bMirasDonusuJob\b[\s\S]*?\]/.test(modul));
  for (const [ad, yol] of [
    ['hesap kapatma', join(KOK, 'src', 'altyapi', 'auth', 'hesap.servisi.ts')],
    ['yönetici silme', join(KOK, 'src', 'ozellik', 'kutuphane', 'admin', 'admin.service.ts')],
  ] as const) {
    const kaynak = tsYorumsuz(readFileSync(yol, 'utf8'));
    check(`B4 ${ad}: iptalEt mirası BİTİRİR (mirasiBitir: true)`, /satinAlma\.iptalEt\([^;]*mirasiBitir:\s*true/.test(kaynak));
  }
}

// ═════════════════════════════════════════════════════════════════════════
function son(): void {
  // Yutulan hata görünsün: günlükteki HATA satırları yalnız BEKLENEN kalıplar olabilir.
  const izinli = [
    /Mirasa dönüş yazılamadı/, // D7: yarışı kaybeden iş (koşullu yazım)
    /Kapatma hatası/, // D6b bekçi (dönem sürüyor) · D7 saatlik iş kaybeden
    /KART ABONELIGI IPTAL EDILEMEDI/, // N7 · G: iyzico iptali arızalı
    /CIFT ABONELIK ENGELLENDI/, // G3
    /Tahsilat alındı ama|çift tahsilat|CIFT TAHSILAT/i, // N7d havale satırı çekimi
    /Mirasa dönüşte kart aboneliği kapatılamadı/, // N9: kart kapatma DB hatası (yutulur, günlüğe yazılır)
    /Mutabakat hatası \([^)]*\): .*güncellenecek satır yok/, // İ9: yarışı kaybeden gece yazımı (koşullu, P2025)
  ];
  const beklenmeyen = hatalarSonra(0).filter((m) => !izinli.some((k) => k.test(m)));
  check('Z beklenmeyen HATA günlüğü yok (yutulan hata yeşil assert arkasına saklanmasın)', beklenmeyen.length === 0,
    beklenmeyen.slice(0, 5).join(' | '));
  console.log(`\n${'='.repeat(64)}\nMİRAS HAKKI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    console.log('KIRMIZI:');
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

/** Bir bloğun fırlatması KIRMIZI bir assert olur, koşuyu bitirmez. */
async function blok(ad: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu çökmeden bitti`, false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main(): Promise<void> {
  // Beklentiler varsayılan merdiveni ölçer (10. gün KISITLI); ortam ayarı sayıları kaydırmasın.
  for (const ad of Object.keys(process.env)) if (ad.startsWith('DUNNING_')) delete process.env[ad];
  process.env.YONETIM_EPOSTA = YONETIM;
  await blok('S', sBlogu);
  await blok('K', kBlogu);
  await blok('İ', iBlogu);
  await blok('D', dBlogu);
  await blok('H', hBlogu);
  await blok('N', nBlogu);
  await blok('G', gBlogu);
  await blok('T', tBlogu);
  await blok('E', eBlogu);
  await blok('C', cBlogu);
  await blok('B', bBlogu);
  son();
}

bitmezseKirmizi(
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  }),
);
