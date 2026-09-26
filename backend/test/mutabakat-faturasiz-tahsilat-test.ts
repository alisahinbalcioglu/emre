/**
 * MUTABAKAT: ERİŞİMİ UZATMAYAN KAYIP TAHSİLAT  (`npm run test:mutabakat-faturasiz-tahsilat`) · 26.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `MutabakatJob`, `AbonelikServisi`, `SatinAlmaServisi`
 * (satır yazımı: `aboneligiAcVeyaGuncelle`), `WebhookIsleyici`, `FaturaServisi`,
 * `DunningServisi` ve `ErisimServisi` bellek-Prisma üzerinde koşar. Bellek-Prisma
 * ve sahte iyzico `mutabakat-kayip-tahsilat-test.ts`ten (depo deseni: her kapı
 * kendi taklidini taşır): `where`i GERÇEKTEN uygular, tekillik (P2002) taşır,
 * bilmediği anahtarda PATLAR; sahte iyzico her çağrıda TAZE kopya verir ve
 * tanımsız kodda varsayılan UYDURMAZ.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * Gece mutabakatı kaybolmuş başarılı tahsilat webhook'unu yalnız ödenmiş
 * siparişin dönem sonu `erisimSonu`ndan SONRAYSA yeniden oynatır
 * (`erisimiUzatanOdemeler`, mutabakat.job.ts → BİLİNEN SINIRLAR). Erişim
 * siparişten zaten İLERİDEYSE tetik yok:
 *   · miras (göç) firma kartla ödeyince satın alma ~1 yıllık erişimi KORUR
 *     (`max(mevcut, köprü)`, `kopruErisimSonu` NULL) — erişim bitene dek HER
 *     sipariş;
 *   · denemesiz satın almanın İLK siparişi (satın alma 31+2 gün köprü yazar,
 *     iyzico dönemi bir takvim ayı).
 * Bu siparişlerin webhook'u kaybolursa (iyzico ~3 denemede ~45 dk bırakır)
 * faturayı kuyruğa alan TEK yol (`WebhookIsleyici.basariliTahsilat`) hiç
 * koşmaz: fatura yok, UYARI yok, özet satırı sıfır. ⭐ Miras satırı dunning'de
 * ise (merdivenin yeniden denemesi TUTTU, webhook kayboldu) satır
 * ODEME_BEKLIYOR'da kalır ve 10. gün KISITLI + "salt-okunur" e-postası —
 * ÖDEMİŞ müşteriye (KISITLI/ASKIDA `erisimSonu`na bakmaz).
 *
 * ── KURAL 7 (Emre kararı 26.09 "aynı yol, süren dönem"): mutabakat.job.ts ─
 * Faturası olmayan (`Fatura.tahsilatKodu`) ve dönemi SÜREN ödenmiş sipariş de
 * kayıptır → kural 2'nin AYNI oynatması (tek olay, tek yol). Dönemi BİTMİŞ
 * faturasız sipariş oynatılmaz (daha yeni reddin dunning'ini silerdi) — 31
 * gün "elle fatura" uyarısı + özet sayacı; daha eskisi tarihçe. Deneme
 * sürerken faturasız kuralı bakmaz. Kural 2-4 kapısı:
 * `test:mutabakat-kayip-tahsilat`.
 *
 * ⚠ SAHTE iyzico YALNIZ ÖLÇÜLMÜŞ/DOKÜMANTE ALANLARI taşır (20.08 sandbox
 * tutanağı, docs/adim0-tutanak/*.json). Ölçülmemiş her değer bulunduğu yerde
 * işaretli (reddedilmiş denemenin `paymentStatus` değeri, UNPAID/FAILED,
 * ret sonrası iyzico durumu, denemeli abonelikte sipariş listesi).
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  saf kural `kayipTahsilatKarari` (sınırlar, deneme, köprü, üç dönem,
 *      kanıt kuralı, bozuk girdi, kural 7e engelleri) · `odenmisSiparisler`
 *   Ö  ÖLÇÜT: webhook ALINIRSA aynı dünyalar faturayı kuyruğa alır; miras
 *      erişimi DEĞİŞMEZ, köprü iyzico dönemine düzelir (tasarlanmış), dunning
 *      toparlanır — kapı kör değil
 *   M  miras AKTİF: ilk çekimin webhook'u kayboldu → oynatma (TEK yol, BAĞLANTI)
 *   K  köprü: denemesiz satın almanın ilk siparişi kayboldu → köprü 33 → 31 gün
 *   R  ⭐ miras dunning: yeniden deneme tuttu, webhook kayboldu → toparlanır;
 *      10. gün merdiveni KISITLAMAZ
 *   B  dönemi BİTMİŞ faturasız sipariş OYNATILMAZ (daha yeni reddin dunning'i
 *      silinmez) → elle fatura; pencereden eskisi tarihçe
 *   E  kural 7e engelleri (26.09 kod incelemesi): sonraki dönem ERKEN çekilip
 *      reddedildi · paket düşürme bekliyor (eski ucun siparişi yeni uçta) ·
 *      webhook yolda (30 dk) — oynatma yok, dunning/paket/kilit yerinde
 *   D  deneme sürerken faturasız kuralı bakmaz
 *   İ  ikinci gece · geç gelen gerçek webhook · ölü oynatma YENİDEN KURULUR ·
 *      uyarı nedeni doğru söyler
 *   G  gece taraması (cron giriş noktası): karışık satırlar, TAM özet satırı;
 *      kural 7d (faturası BAŞKA satıra kesilmiş sipariş faturalıdır)
 *   V  NES talebi (elle, GERÇEK fatura kesim turu): oynatılan faturanın "ödeme
 *      tarihi" yakalama anı DEĞİL (VUK 231/5 son günü ertelenmez); BİLİNEN
 *      SINIR: toparlanan tahsilatta tarih = dönem başı (ödeme anı satırda yok)
 *
 * ESKİ HÂL (kural 7 yokken, 26.09 ölçüldü): 23 PASS / 52 FAIL. Ölçüt (Ö1-Ö5)
 * ve fikstürler eski kodda da yeşil (kırmızılar kuraldan; İ3/V fikstürleri
 * oynatmanın kendisine bağlı). Kırmızı: S'nin 17'si (kural yok) + 35
 * entegrasyon assert'i — M/K/R'de fatura 0, uyarı 0, özet sıfır; R'de 10. gün
 * KISITLI + "salt-okunur" e-postası; V'de NES talebi hiç yok; B3/D1/E
 * uyarıları özetin beşinci sayısı ve "elle fatura" satırı yüzünden. Eski
 * hâlde yeşil kalan entegrasyon assert'leri B1/E1/E2: oynatmama negatifleri —
 * eski kod hiçbirini oynatmıyordu, kural 7'nin engelleri bu davranışı KORUR.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KayipTahsilatKarari,
  MUTABAKAT_KAYNAGI,
  MutabakatJob,
  kayipTahsilatKarari,
  odenmisSiparisler,
} from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { tarihYaz } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import { faturaKesimTalebiEpostasi } from '../src/ozellik/odeme/fatura/fatura-kesim-epostasi';
import type { FaturaKesTalebi } from '../src/ozellik/odeme/fatura/muhasebe.adaptor';
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

// Nest günlüğü gürültüsü kapalı; MKT_GUNLUK=1 ile açılır.
if (!process.env.MKT_GUNLUK) Logger.overrideLogger(false);

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
/** Servisler kendi `new Date()`lerini kullanır: gün katı beklentiler 60 sn toleranslı. */
const TOLERANS = 60_000;

/**
 * Günlüğü TOPLAR (`mutabakat-kayip-tahsilat-test.ts` ile aynı gerekçe): gece
 * işi ve webhook işleyicisi satır/olay hatasını YAKALAYIP yalnız günlüğe
 * yazar; günlük kapalıyken patlayan bir satır "değişmedi" diye boşuna yeşil
 * görünürdü.
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
    Logger.overrideLogger(process.env.MKT_GUNLUK ? new ConsoleLogger() : false);
  }
  return { kayitlar, uyarilar, hatalar };
}

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — `mutabakat-kayip-tahsilat-test.ts`teki taklit (aynı kurallar)
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  // V bloğu: fatura kesim turu (`tekFatura`) satırı aboneliğiyle okur.
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

/** Şemadaki `@unique` alanlar (yalnız bu paketin dokunduğu tablolar). */
const TEKIL: Record<string, string[]> = {
  abonelik: ['firmaId', 'iyzicoAbonelikKodu'],
  fatura: ['tahsilatKodu'],
  webhookOlayi: ['tekilAnahtar'],
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    denemeSonu: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null, iyzicoMusteriKodu: null,
    iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART', ilkBasarisizlik: null,
    denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null, iptalNedeni: null,
    kopruErisimSonu: null, planliPaketSurumuId: null, paketGecisTarihi: null, odenenPaketSurumuId: null,
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
//  SAHTE iyzico — abonelik detayı (her çağrıda TAZE kopya) + yeniden deneme kaydı
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const detaylar = new Map<string, unknown>();
  const sorulan: string[] = [];
  const yenidenDenemeler: string[] = [];
  return {
    detaylar,
    sorulan,
    yenidenDenemeler,
    istemci: {
      abonelikGetir: async (kod: string) => {
        sorulan.push(kod);
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return JSON.parse(JSON.stringify(d));
      },
      // Dunning merdiveninin yeniden denemesi: iyzico isteği KABUL eder; sonucu
      // (sipariş SUCCESS) test abonelik detayına kendisi yazar — gerçekte
      // sonucu webhook getirir (dunning.servisi "Sonucu webhook getirecek").
      tahsilatiTekrarla: async (siparisKodu: string) => {
        yenidenDenemeler.push(siparisKodu);
        return {};
      },
      abonelikIptal: async () => {
        throw new Error('sahte iyzico: bu pakette iptal EDİLMEZ');
      },
      abonelikBaslat: async () => {
        throw new Error('sahte iyzico: bu pakette abonelik formu ACILMAZ');
      },
    } as any,
  };
}

/**
 * Sipariş — 20.08 sandbox tutanağındaki biçim (adim0-cikti.json, S2a-dogrulama
 * SUCCESS siparişi): `price`, `currencyCode`, epoch-ms `startPeriod`/
 * `endPeriod`, `orderStatus`, `paymentAttempts[{conversationId, createdDate,
 * paymentId, paymentStatus}]`. `paidPrice` tutanakta YOK — konmadı. Tutanaktaki
 * dönem 31 GÜNDÜR (takvim ayı): 1_787_215_031_301 → 1_789_893_431_301.
 * ⚠ Reddedilmiş denemenin `paymentStatus` değeri ÖLÇÜLMEDİ ('FAILURE' iyzico'nun
 * ödeme API'sindeki değer); kanıt kuralı yalnız SUCCESS'i arar.
 */
function siparis(p: { kod: string; durum: string; bas: number; son: number; denemeler?: string[] }) {
  return {
    referenceCode: p.kod,
    price: 1649,
    currencyCode: 'TRY',
    startPeriod: p.bas,
    endPeriod: p.son,
    orderStatus: p.durum,
    paymentAttempts: (p.denemeler ?? []).map((s, i) => ({
      conversationId: `conv-${p.kod}-${i}`,
      createdDate: p.bas + i * GUN + DK,
      paymentId: 37_387_490 + i,
      paymentStatus: s,
    })),
  };
}

/** Abonelik detayı — 20.08 tutanağındaki alanlar (denemesiz: `trialDays: 0`). */
function iyzicoDetayi(kod: string, durum: string, siparisler: unknown[]) {
  return {
    referenceCode: kod,
    parentReferenceCode: `kok-${kod}`,
    pricingPlanReferenceCode: 'plan-30',
    customerReferenceCode: `cus-${kod}`,
    subscriptionStatus: durum,
    trialDays: 0,
    orders: siparisler,
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

/** Göç satırının erişimi (miras firma ~1 yıl): bugünden 340 gün sonra. */
const MIRAS_GUN = 340;

function dunyaKur(muhasebe: unknown = MUHASEBE_YASAK) {
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
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-30', satistaMi: true,
  });
  // Göç paketi (migration 20260828100000): tutar 0, satış dışı, deneme 0.
  db.ekle('paket', { id: 'PM', kod: 'miras-core', ad: 'Miras Core', kullaniciHakki: 2, dwgAktif: false });
  db.ekle('paketSurumu', {
    id: 'SM', paketId: 'PM', periyot: 'YEARLY', periyotAdedi: 1, denemeGunu: 0,
    tutar: 0, paraBirimi: 'TRY', iyzicoPlanKodu: 'MIRAS-miras-core', satistaMi: false,
  });
  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  const fatura = new FaturaServisi(db.prisma, muhasebe as any, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  // Beşinci argüman: sorunsuz yenilemenin "ödemeniz alındı" makbuzu da ölçülür.
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning, posta);
  const erisim = new ErisimServisi(db.prisma);
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, {} as any, posta);

  /** Fatura kopyası çıkarılabilsin diye tam kimlikli firma (limited şirket). */
  function firma(id: string) {
    return db.ekle('firma', {
      id, ad: `Firma ${id}`, unvan: `${id} Tesisat Ltd. Şti.`, vergiNo: '1234567890',
      vergiDairesi: 'Kadıköy', tcKimlikNo: null, faturaAdresi: 'Moda Cad. 1', il: 'İstanbul',
      ilce: 'Kadıköy', faturaEposta: `muhasebe@${id.toLowerCase()}.test`,
      yetkiliEposta: `sahip@${id.toLowerCase()}.test`, imhaTarihi: null,
    });
  }

  /**
   * Kart satırını GERÇEK satın alma yazımı kurar (`aboneligiAcVeyaGuncelle` —
   * `donusIyzicodan` ve kurtarma taramasının ortak yazıcısı). Denemesiz:
   * miras firma deneme almaz (deneme-hakki.servisi), ikinci örnek de denemesiz
   * ikiz planı seçmiş yeni firmadır.
   */
  async function kartSatinAlmasi(firmaId: string, kod: string, denemeGunu = 0): Promise<Satir> {
    await (satinAlma as any).aboneligiAcVeyaGuncelle({
      firmaId, paketSurumuId: 'S30', iyzicoAbonelikKodu: kod, iyzicoMusteriKodu: `cus-${kod}`,
      iyzicoDurum: 'ACTIVE', denemeGunu,
    });
    const ab = db.tablo('abonelik').find((r) => r.firmaId === firmaId);
    if (!ab) throw new Error(`fikstür: ${firmaId} satırı yazılmadı`);
    return ab;
  }

  /** Göç satırı (HAVALE, miras-core, iyzico bağı yok) + bugün kartla satın alma. */
  async function mirasSatinAlmasi(firmaId: string, kod: string) {
    firma(firmaId);
    const gocErisimi = new Date(Date.now() + MIRAS_GUN * GUN);
    db.ekle('abonelik', {
      firmaId, paketSurumuId: 'SM', durum: 'AKTIF', erisimSonu: gocErisimi, odemeYontemi: 'HAVALE',
    });
    return { ab: await kartSatinAlmasi(firmaId, kod), gocErisimi };
  }

  /** Hiç aboneliği olmayan firma, kart satın alması (köprü yazılır; varsayılan denemesiz). */
  async function yeniFirmaSatinAlmasi(firmaId: string, kod: string, denemeGunu = 0) {
    firma(firmaId);
    return kartSatinAlmasi(firmaId, kod, denemeGunu);
  }

  /** Daha önce ALINMIŞ ve işlenmiş gerçek webhook (geçmiş dönem) + faturası. */
  function islenmisTahsilat(ab: Satir, kod: string, siparisKodu: string, bas: number, son: number) {
    db.ekle('webhookOlayi', {
      tekilAnahtar: `iyzico:subscription.order.success:iyz-${siparisKodu}`,
      olayTipi: 'subscription.order.success', hamGovde: {}, abonelikKodu: kod,
      siparisKodu, islendi: true, islenmeZamani: new Date(bas + DK), alindi: new Date(bas + DK),
    });
    db.ekle('fatura', {
      abonelikId: ab.id, tahsilatKodu: siparisKodu, tutar: 1374.17, kdvTutari: 274.83,
      toplamTutar: 1649, donemBasi: new Date(bas), donemSonu: new Date(son),
    });
  }

  /** iyzico'nun GÖNDERDİĞİ olay (webhook.controller `hamKaydet` biçimi). */
  function gelenWebhook(kod: string, siparisKodu: string, tip: 'success' | 'failure') {
    db.ekle('webhookOlayi', {
      tekilAnahtar: `iyzico:subscription.order.${tip}:iyz-${siparisKodu}`,
      olayTipi: `subscription.order.${tip}`, hamGovde: {}, abonelikKodu: kod, siparisKodu,
    });
  }

  const faturalar = (abonelikId: string) => db.tablo('fatura').filter((f) => f.abonelikId === abonelikId);
  const olaylar = (siparisKodu: string) => db.tablo('webhookOlayi').filter((o) => o.siparisKodu === siparisKodu);
  const oynatilanlar = () => db.tablo('webhookOlayi').filter((o) => o.kaynak === MUTABAKAT_KAYNAGI);
  const durumOlaylari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === 'durum.degisti');
  const toparlandiOlaylari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === 'dunning.eposta.toparlandi');

  /**
   * GECE: cron giriş noktası `geceMutabakati`, ardından webhook işleyicisinin
   * dakikalık taraması (`bekleyenleriIsle`) — üretimde ikisi de @Cron'dur.
   */
  async function geceyiKos() {
    return gunluguTopla(async () => {
      await mutabakat.geceMutabakati();
      await isleyici.bekleyenleriIsle();
    });
  }

  return {
    db, iyz, giden, abonelik, mutabakat, isleyici, dunning, erisim, mirasSatinAlmasi,
    yeniFirmaSatinAlmasi, islenmisTahsilat, gelenWebhook, faturalar, olaylar, oynatilanlar, durumOlaylari,
    toparlandiOlaylari, geceyiKos, faturaServisi: fatura, firmaEkle: firma,
  };
}

const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : String(t));
const gunOlarak = (t: unknown) =>
  t instanceof Date ? `${((t.getTime() - Date.now()) / GUN).toFixed(3)} gün` : String(t);
/** `t` bugünden `gun` gün sonrasına 60 sn içinde mi? */
const yakin = (t: unknown, gun: number) =>
  t instanceof Date && Math.abs(t.getTime() - (Date.now() + gun * GUN)) < TOLERANS;

type Gunluk = { kayitlar: string[]; uyarilar: string[]; hatalar: string[] };

/** Gece özet satırı (`geceMutabakati` sonu). */
const ozet = (g: Gunluk) => g.kayitlar.find((m) => m.startsWith('Mutabakat bitti')) ?? '';
const gunlukYaz = (g: Gunluk) => `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)}`;

/** Kararın okunur özeti: "oynat=<kod>/<neden> elle=<kodlar>". */
const kararYaz = (k: KayipTahsilatKarari) =>
  `oynat=${k.oynatilacak ? `${k.oynatilacak.siparisKodu}/${k.oynatilacak.neden}` : '-'} ` +
  `elle=${k.elleFatura.map((o) => o.siparisKodu).join(',') || '-'}`;

/** "Kayıp tahsilat yeniden oynatıldı" satırı bu sipariş için mi? */
const oynatmaSatiri = (u: string, kod: string) =>
  u.startsWith('Kayıp tahsilat yeniden oynatıldı') && u.includes(` sipariş ${kod} `);

/** "Elle fatura" uyarı satırları (kural 3 + 7b — satır başına bir). */
const elleFaturaSatirlari = (g: Gunluk) => g.uyarilar.filter((u) => u.startsWith('Kayıp tahsilat: abonelik'));

/** Özet satırının son (beşinci) sayısı — `endsWith` ile: sayı başka bir alana kaçamaz. */
const elleFaturaOzeti = (n: number) => `faturasız ödenmiş sipariş (elle fatura): ${n}`;

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURAL: kayipTahsilatKarari (kural 7) · odenmisSiparisler
// ═════════════════════════════════════════════════════════════════════════
function sBlogu(): void {
  console.log('\n── S · saf kural: kayipTahsilatKarari · odenmisSiparisler ──');
  // `simdi` PARAMETRE — duvar saatine bağlı değil: sabit T0 burada güvenli.
  const T0 = 1_787_215_031_301; // 20.08 tutanağındaki startPeriod
  const AY = 31 * GUN; // tutanaktaki dönem (takvim ayı)
  const sip = (kod: string, bas: number, sonu: number, durum = 'SUCCESS', denemeler: string[] = ['SUCCESS']) =>
    siparis({ kod, durum, bas, son: sonu, denemeler });
  const karar = (liste: unknown, p: Partial<Parameters<typeof kayipTahsilatKarari>[1]> = {}) =>
    kayipTahsilatKarari(liste, {
      erisimSonu: new Date(T0 + MIRAS_GUN * GUN),
      faturali: new Set<string>(),
      simdi: new Date(T0 + 10 * GUN),
      denemeSuruyor: false,
      paketGecisTarihi: null,
      ...p,
    });
  const m1 = sip('m1', T0, T0 + AY);
  const kisa = new Date(T0 + 5 * GUN);

  const s1 = karar([m1]);
  check('S1 ⭐ miras biçimi: erişim 340 gün ileride, faturasız, dönemi SÜREN → oynat (neden fatura)',
    kararYaz(s1) === 'oynat=m1/fatura elle=-', kararYaz(s1));
  check('S2 ⭐ aynı sipariş FATURALI → hiçbir şey (webhook işlenmiş)',
    kararYaz(karar([m1], { faturali: new Set(['m1']) })) === 'oynat=- elle=-');
  check('S3 erişimi UZATAN sipariş → oynat, neden erisim (kural 2 aynen)',
    kararYaz(karar([m1], { erisimSonu: kisa })) === 'oynat=m1/erisim elle=-');
  check('S4 ⭐ uzatan sipariş FATURALIYSA da oynatılır (kural 2 faturaya bakmaz)',
    kararYaz(karar([m1], { erisimSonu: kisa, faturali: new Set(['m1']) })) === 'oynat=m1/erisim elle=-');
  check('S5 ⭐ dönemi BİTMİŞ faturasız (5 gün önce) → OYNATILMAZ, elle fatura',
    kararYaz(karar([m1], { simdi: new Date(T0 + AY + 5 * GUN) })) === 'oynat=- elle=m1');
  check('S6 ⭐ pencereden eski (40 gün önce bitmiş) → tarihçe: ne oynatma ne uyarı',
    kararYaz(karar([m1], { simdi: new Date(T0 + AY + 40 * GUN) })) === 'oynat=- elle=-');
  // Sınırlar ELLE yazıldı (31 gün sabitten türetilmedi): "süren" = dönem sonu
  // > şimdi; pencere = dönem sonu > şimdi − 31 gün — ikisi de kesin.
  const sinirlar = [
    kararYaz(karar([m1], { simdi: new Date(T0 + AY) })),
    kararYaz(karar([m1], { simdi: new Date(T0 + AY - 1) })),
    kararYaz(karar([m1], { simdi: new Date(T0 + AY + 31 * GUN - 1) })),
    kararYaz(karar([m1], { simdi: new Date(T0 + AY + 31 * GUN) })),
  ].join(' | ');
  check('S7 sınırlar: dönem sonu ANI bitmiş sayılır, 1 ms önce süren; pencere tam 31 gün',
    sinirlar === 'oynat=- elle=m1 | oynat=m1/fatura elle=- | oynat=- elle=m1 | oynat=- elle=-', sinirlar);
  const deneme = [
    kararYaz(karar([m1], { denemeSuruyor: true })),
    kararYaz(karar([m1], { denemeSuruyor: true, simdi: new Date(T0 + AY + 5 * GUN) })),
    kararYaz(karar([m1], { denemeSuruyor: true, erisimSonu: kisa })),
  ].join(' | ');
  check('S8 ⭐ deneme SÜRERKEN faturasız kuralı bakmaz (süren de bitmiş de); uzatan yine oynatılır (kural 2)',
    deneme === 'oynat=- elle=- | oynat=- elle=- | oynat=m1/erisim elle=-', deneme);
  // Köprü: ilk sipariş (k1) kayıp, dönemi bitti; yenileme (k2) köprüyü aşıyor. Liste YENİDEN ESKİYE.
  const k1 = sip('k1', T0, T0 + AY);
  const k2 = sip('k2', T0 + AY, T0 + 2 * AY);
  const s9 = karar([k2, k1], { erisimSonu: new Date(T0 + 33 * GUN), simdi: new Date(T0 + AY + 2 * GUN) });
  check('S9 ⭐ köprü: uzatan yenileme oynatılır, bitmiş ilk sipariş elle fatura (kural 3: eskisi erişimi geri çekerdi)',
    kararYaz(s9) === 'oynat=k2/erisim elle=k1', kararYaz(s9));
  // Miras, üç dönem: eski faturalı (a), geçen ay faturasız (b), bu ay faturasız (c).
  const a = sip('a', T0 - 2 * AY, T0 - AY);
  const b = sip('b', T0 - AY, T0);
  const c = sip('c', T0, T0 + AY);
  const s10 = karar([c, b, a], { faturali: new Set(['a']), simdi: new Date(T0 + 3 * GUN) });
  check('S10 ⭐ miras üç dönem: yalnız SÜREN (c) oynatılır; bitmiş faturasız (b) elle fatura; faturalı (a) hiç anılmaz',
    kararYaz(s10) === 'oynat=c/fatura elle=b', kararYaz(s10));
  check('S11 kanıt oynatılan siparişle taşınır (olay kaydına yazılacak ham iyzico kaydı)',
    s10.oynatilacak?.ham?.referenceCode === 'c' && s10.oynatilacak?.ham?.orderStatus === 'SUCCESS');
  const odenmemis = [
    sip('w', T0, T0 + AY, 'WAITING', []), // iyzico sonraki dönemi önceden açar (20.08 tutanağı)
    sip('x', T0, T0 + AY, 'SUCCESS', []), // başarılı deneme yok
    sip('y', T0, T0 + AY, 'REFUNDED', ['SUCCESS']), // sipariş SUCCESS değil (değer ÖLÇÜLMEDİ)
    sip('z', T0, T0 + AY, 'SUCCESS', ['FAILURE']), // yalnız reddedilmiş deneme
  ];
  check('S12 ⭐ kanıt kuralı AYNI (`odenmisSiparisMi`): ödenmemiş 4 biçim faturasız ve süren olsa da hiçbir şey',
    kararYaz(karar(odenmemis)) === 'oynat=- elle=-');
  const bozuk = [
    kararYaz(karar(undefined)),
    kararYaz(karar([m1], { simdi: new Date('gecersiz') })),
    kararYaz(karar([m1], { simdi: new Date('gecersiz'), erisimSonu: kisa })),
    kararYaz(karar([m1], { erisimSonu: null })),
  ].join(' | ');
  check('S13 bozuk girdi: dizi değil → yok; bozuk şimdi faturasız kuralını KAPATIR (kural 2 aynen); erisimSonu yoksa faturasız kural bağımsız',
    bozuk === 'oynat=- elle=- | oynat=- elle=- | oynat=m1/erisim elle=- | oynat=m1/fatura elle=-', bozuk);
  const karisik = [m1, { ...m1, referenceCode: '' }, { ...m1, referenceCode: 'e', endPeriod: 'abc' }, null, 'm1'];
  check('S14 odenmisSiparisler: kodsuz ve dönem sonu çözülemeyen sipariş YOK sayılır (oynatılamaz, sorguya girmez)',
    odenmisSiparisler(karisik).map((o) => o.siparisKodu).join(',') === 'm1');
  // İş iki dönem koşmadı (erişim 50 gün önce bitti): üç uzatan sipariş. Kural 3'ün
  // uyarısı PENCEREYE TABİ DEĞİL — 40 gün önce biten uzatan sipariş de anılır.
  const u1 = sip('u1', T0 - 71 * GUN, T0 - 40 * GUN);
  const u2 = sip('u2', T0 - 40 * GUN, T0 - 9 * GUN);
  const u3 = sip('u3', T0 - 9 * GUN, T0 + 22 * GUN);
  const s15 = karar([u3, u2, u1], { erisimSonu: new Date(T0 - 50 * GUN), simdi: new Date(T0) });
  check('S15 kural 3: en yeni uzatan oynatılır; eski UZATAN faturasızlar pencere dışındaysa da elle fatura (u1 40 gün önce bitti)',
    kararYaz(s15) === 'oynat=u3/erisim elle=u1,u2', kararYaz(s15));

  // ── KURAL 7e ENGELLERİ (26.09 kod incelemesi) ──
  // Sonraki dönemin çekimi DENENDİ: iyzico erken çekti ve reddetti (ÖLÇÜLMEDİ — en kötü hâl).
  const ret = sip('n2', T0 + AY, T0 + 2 * AY, 'FAILED', ['FAILURE']);
  const bekleyen = sip('n3', T0 + AY, T0 + 2 * AY, 'WAITING', []); // iyzico önceden açar, denemesiz
  // Erken çekim TUTTU: deneme anı dönem başından ÖNCE (şimdiden 5 saat önce) —
  // `siparis()` deneme anını dönem başına koyar, o yüzden açıkça yazıldı.
  const tutan = {
    ...sip('n4', T0 + AY, T0 + 2 * AY, 'SUCCESS', ['SUCCESS']),
    paymentAttempts: [{ paymentStatus: 'SUCCESS', createdDate: T0 + 10 * GUN - 5 * SAAT }],
  };
  const denenen = [
    kararYaz(karar([ret, m1])),
    kararYaz(karar([bekleyen, m1])),
    kararYaz(karar([tutan, m1])),
    kararYaz(karar([sip('n5', T0 + AY - 1, T0 + 2 * AY, 'FAILED', ['FAILURE']), m1])),
  ].join(' | ');
  check('S16 ⭐ sonraki dönemin çekimi DENENDİYSE süren m1 oynatılmaz → elle fatura; denemesiz WAITING engel değil; sonraki ödenmişse o oynatılır; başlangıç sınırı ≥ (1 ms önce başlayan sonraki DEĞİL)',
    denenen === 'oynat=- elle=m1 | oynat=m1/fatura elle=- | oynat=n4/fatura elle=m1 | oynat=m1/fatura elle=-', denenen);
  // Paket değişimi bekliyor: geçiş m1'in dönem sonunda (NEXT_PERIOD, paket-degisimi.servisi).
  const gecisli = [
    kararYaz(karar([m1], { paketGecisTarihi: new Date(T0 + AY) })),
    kararYaz(karar([sip('y1', T0 + AY, T0 + 2 * AY)], { paketGecisTarihi: new Date(T0 + AY), simdi: new Date(T0 + AY + 3 * GUN) })),
    kararYaz(karar([sip('y2', T0 + AY - 1, T0 + 2 * AY)], { paketGecisTarihi: new Date(T0 + AY), simdi: new Date(T0 + AY + 3 * GUN) })),
    kararYaz(karar([{ ...m1, startPeriod: 'abc' }], { paketGecisTarihi: new Date(T0 + AY) })),
    kararYaz(karar([m1], { paketGecisTarihi: new Date(T0 + AY), erisimSonu: kisa })),
  ].join(' | ');
  check('S17 ⭐ paket değişimi beklerken geçişten ÖNCE başlayan (eski uç) sipariş oynatılmaz → elle fatura; yeni ucun kendi siparişi (≥ geçiş) oynatılır; başlangıcı çözülemeyen engellenir; kural 2 (uzatan) etkilenmez',
    gecisli === 'oynat=- elle=m1 | oynat=y1/fatura elle=- | oynat=- elle=y2 | oynat=- elle=m1 | oynat=m1/erisim elle=-', gecisli);
  // Yoldaki webhook: son çekim denemesi 2 saatten yeni (siparis() denemesi = dönem başı + 1 dk).
  const yolda = [
    kararYaz(karar([m1], { simdi: new Date(T0 + DK + 2 * SAAT - 1) })),
    kararYaz(karar([m1], { simdi: new Date(T0 + DK + 2 * SAAT) })),
    kararYaz(karar([sip('r1', T0, T0 + AY, 'SUCCESS', ['FAILURE', 'FAILURE', 'FAILURE', 'SUCCESS'])], { simdi: new Date(T0 + 3 * GUN + DK + SAAT) })),
    kararYaz(karar([{ ...m1, paymentAttempts: [{ paymentStatus: 'SUCCESS' }] }], { simdi: new Date(T0 + SAAT) })),
    kararYaz(karar([m1], { simdi: new Date(T0 + DK + SAAT), erisimSonu: kisa })),
    kararYaz(karar([ret, m1], { simdi: new Date(T0 + DK + SAAT) })),
  ].join(' | ');
  check('S18 ⭐ yoldaki webhook (son deneme < 2 saat): ne oynatılır ne uyarılır; sınır tam 2 saat; SON deneme sayılır (3. gün yeniden deneme); deneme anı yoksa dönem başı; kural 2 bekletilmez; engelli de o gece uyarılmaz',
    yolda === 'oynat=- elle=- | oynat=m1/fatura elle=- | oynat=- elle=- | oynat=- elle=- | oynat=m1/erisim elle=- | oynat=- elle=-', yolda);
  // DÜŞÜK 4: süren, engelsiz ama en yeni aday OLMAYAN faturasız sipariş uyarıya YAZILMAZ (sonraki gece oynatılır).
  const ust = [sip('o2', T0 + 5 * GUN, T0 + AY + 5 * GUN), m1];
  const s19 = karar(ust);
  check('S19 süren ve engelsiz ikinci aday "elle fatura" DEMEZ (ertesi gece oynatılır — çift fatura olmaz); yalnız en yeni oynatılır',
    kararYaz(s19) === 'oynat=o2/fatura elle=-', kararYaz(s19));
  const ayr = odenmisSiparisler([
    sip('a1', T0, T0 + AY, 'SUCCESS', ['FAILURE', 'SUCCESS']),
    { ...m1, referenceCode: 'a2', paymentAttempts: [{ paymentStatus: 'SUCCESS' }] },
    { ...m1, referenceCode: 'a3', startPeriod: null, paymentAttempts: [{ paymentStatus: 'SUCCESS' }] },
  ]).map((o) => `${o.siparisKodu}:${o.donemBasi?.getTime() ?? '-'}:${o.sonDeneme?.getTime() ?? '-'}`).join(' ');
  check('S20 odenmisSiparisler: dönem başı ve SON deneme anı (en büyük createdDate); deneme anı yoksa dönem başı; ikisi de yoksa boş',
    ayr === `a1:${T0}:${T0 + GUN + DK} a2:${T0}:${T0} a3:-:-`, ayr);
}

/** Miras satırı + işlenmiş ilk dönem + başarısız yenileme → merdivenin 3. gün yeniden denemesi TUTTU. */
async function mirasDunningDunyasi(firmaId: string, kod: string) {
  const d = dunyaKur();
  const { ab, gocErisimi } = await d.mirasSatinAlmasi(firmaId, kod);
  const simdi = Date.now();
  const onceki = { bas: simdi - 34 * GUN, son: simdi - 3 * GUN };
  const yenileme = { bas: onceki.son, son: onceki.son + 31 * GUN };
  const siparis1 = `${kod}-ord-1`;
  const siparis2 = `${kod}-ord-2`;
  d.islenmisTahsilat(ab, kod, siparis1, onceki.bas, onceki.son);
  const ilk = siparis({ kod: siparis1, durum: 'SUCCESS', bas: onceki.bas, son: onceki.son, denemeler: ['SUCCESS'] });
  // 1) Yenileme reddedildi. ⚠ Abonelik UNPAID ve sipariş FAILED ÖLÇÜLMEDİ —
  //    `tahsilatBasarisizligiKarari` ikisini de kanıt sayar (iyzico/tahsilat-kaniti.ts).
  d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'UNPAID', [
    siparis({ kod: siparis2, durum: 'FAILED', bas: yenileme.bas, son: yenileme.son, denemeler: ['FAILURE'] }),
    ilk,
  ]));
  d.gelenWebhook(kod, siparis2, 'failure');
  const ret = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
  const retSonrasi = { durum: ab.durum, ilk: ab.ilkBasarisizlik, deneme: ab.denemeSayisi, eposta: d.giden.length };
  // 2) Zaman atlaması: 3. gün — merdiven iyzico'ya yeniden denetir, iyzico çeker.
  ab.ilkBasarisizlik = new Date(Date.now() - 3 * GUN - 5 * DK);
  const merdiven3 = await gunluguTopla(() => d.dunning.merdiveniYurut());
  d.iyz.detaylar.set(kod, iyzicoDetayi(kod, 'ACTIVE', [
    siparis({ kod: siparis2, durum: 'SUCCESS', bas: yenileme.bas, son: yenileme.son, denemeler: ['FAILURE', 'SUCCESS'] }),
    ilk,
  ]));
  return { d, ab, gocErisimi, yenileme, siparis1, siparis2, ret, retSonrasi, merdiven3 };
}

/** Fikstürün DOĞRU dalı sürdüğünün kanıtı (başarısızlık → dunning → yeniden deneme). */
function dunningFikstur(ad: string, w: Awaited<ReturnType<typeof mirasDunningDunyasi>>): void {
  const { d, ab, gocErisimi, siparis2, ret, retSonrasi, merdiven3 } = w;
  check(`${ad}-FIXTURE ret webhook'u GERÇEK yoldan: ODEME_BEKLIYOR + ilkBasarisizlik + ilk bildirim (deneme 1, tek e-posta)`,
    retSonrasi.durum === 'ODEME_BEKLIYOR' && retSonrasi.ilk instanceof Date && retSonrasi.deneme === 1 &&
      retSonrasi.eposta === 1 && ret.hatalar.length === 0,
    `durum=${retSonrasi.durum} ilk=${iso(retSonrasi.ilk)} deneme=${retSonrasi.deneme} eposta=${retSonrasi.eposta} ${gunlukYaz(ret)}`);
  check(`${ad}-FIXTURE 3. gün merdiveni iyzico'ya ${siparis2}'yi yeniden denetti (deneme 2); erişim hâlâ 340 gün, köprü NULL`,
    d.iyz.yenidenDenemeler.join(',') === siparis2 && ab.denemeSayisi === 2 && ab.durum === 'ODEME_BEKLIYOR' &&
      ab.erisimSonu.getTime() === gocErisimi.getTime() && ab.kopruErisimSonu === null && merdiven3.hatalar.length === 0,
    `denemeler=${d.iyz.yenidenDenemeler} deneme=${ab.denemeSayisi} durum=${ab.durum} ${gunlukYaz(merdiven3)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  Ö — ÖLÇÜT: webhook ALINIRSA aynı dünyalar istenen sonucu verir (kör değil)
// ═════════════════════════════════════════════════════════════════════════
async function oBlogu(): Promise<void> {
  console.log('\n── Ö · ölçüt: webhook ALINIRSA fatura kuyrukta; miras erişimi değişmez, köprü düzelir, dunning toparlanır ──');
  {
    const d = dunyaKur();
    const { ab, gocErisimi } = await d.mirasSatinAlmasi('F-OM', 'sub-om');
    const bas = Date.now() - 5 * DK;
    const son = bas + 31 * GUN;
    d.iyz.detaylar.set('sub-om', iyzicoDetayi('sub-om', 'ACTIVE', [
      siparis({ kod: 'ord-om1', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    check('Ö-FIXTURE miras: GERÇEK satın alma yazımı KART + pro-mek, 340 gün KORUNDU, köprü NULL; sipariş dönem sonu erişimden ERKEN',
      ab.odemeYontemi === 'KART' && ab.paketSurumuId === 'S30' && ab.iyzicoAbonelikKodu === 'sub-om' &&
        ab.erisimSonu.getTime() === gocErisimi.getTime() && ab.kopruErisimSonu === null && son < gocErisimi.getTime(),
      `yontem=${ab.odemeYontemi} surum=${ab.paketSurumuId} erisim=${gunOlarak(ab.erisimSonu)} kopru=${iso(ab.kopruErisimSonu)}`);
    d.gelenWebhook('sub-om', 'ord-om1', 'success');
    const g = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    const f = d.faturalar(ab.id).filter((x) => x.tahsilatKodu === 'ord-om1');
    check('Ö1 ⭐ miras: webhook yolu faturayı kuyruğa aldı (tek satır, dönem = siparişin dönemi)',
      f.length === 1 && f[0].donemBasi.getTime() === bas && f[0].donemSonu.getTime() === son,
      `faturalar=${JSON.stringify(f.map((x) => [x.tahsilatKodu, iso(x.donemBasi), iso(x.donemSonu)]))}`);
    const o = d.durumOlaylari(ab.id).filter((x) => x.veri?.siparisKodu === 'ord-om1');
    check('Ö2 ⭐ miras: erişim DEĞİŞMEDİ (340 gün) — webhook siparişi GERÇEKTEN işledi, köprü düzeltilmedi (yalnız uzatır)',
      ab.erisimSonu.getTime() === gocErisimi.getTime() && ab.durum === 'AKTIF' && o.length === 1 &&
        o[0].veri?.kopruDuzeltildi === false,
      `erisim=${gunOlarak(ab.erisimSonu)} olay=${JSON.stringify(o.map((x) => x.veri))}`);
    check('Ö3 miras: hata/uyarı yok, olay işlendi, tek "ödemeniz alındı"',
      g.hatalar.length === 0 && g.uyarilar.length === 0 && d.olaylar('ord-om1')[0]?.islendi === true && d.giden.length === 1,
      `${gunlukYaz(g)} giden=${JSON.stringify(d.giden)}`);
  }
  {
    const d = dunyaKur();
    const ab = await d.yeniFirmaSatinAlmasi('F-OK', 'sub-ok');
    const bas = Date.now() - 5 * DK;
    const son = bas + 31 * GUN;
    d.iyz.detaylar.set('sub-ok', iyzicoDetayi('sub-ok', 'ACTIVE', [
      siparis({ kod: 'ord-ok1', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
    ]));
    check('Ö-FIXTURE köprü: yeni firma denemesiz satın aldı — erisimSonu = köprü = 33 gün; sipariş dönem sonu (31 gün) köprüden ERKEN',
      yakin(ab.erisimSonu, 33) && ab.kopruErisimSonu?.getTime() === ab.erisimSonu.getTime() && son < ab.erisimSonu.getTime(),
      `erisim=${gunOlarak(ab.erisimSonu)} kopru=${gunOlarak(ab.kopruErisimSonu)}`);
    d.gelenWebhook('sub-ok', 'ord-ok1', 'success');
    const g = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    check('Ö4 ⭐ köprü: webhook köprüyü iyzico dönemine DÜZELTTİ (33 → 31 gün — tasarlanmış kısaltma), köprü kapandı, fatura kuyrukta',
      ab.erisimSonu.getTime() === son && ab.kopruErisimSonu === null &&
        d.faturalar(ab.id).filter((x) => x.tahsilatKodu === 'ord-ok1').length === 1 && g.hatalar.length === 0,
      `erisim=${gunOlarak(ab.erisimSonu)} kopru=${iso(ab.kopruErisimSonu)} ${gunlukYaz(g)}`);
  }
  {
    const w = await mirasDunningDunyasi('F-OR', 'sub-or');
    dunningFikstur('Ö', w);
    const { d, ab, gocErisimi, siparis2 } = w;
    d.gelenWebhook('sub-or', siparis2, 'success');
    const onceGiden = d.giden.length;
    const g = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    check('Ö5 ⭐ miras dunning: webhook yolu TOPARLADI — AKTIF, sayaçlar sıfır, erişim 340 gün, fatura kuyrukta, tek "toparlandı"',
      ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.denemeSayisi === 0 &&
        ab.erisimSonu.getTime() === gocErisimi.getTime() &&
        d.faturalar(ab.id).filter((x) => x.tahsilatKodu === siparis2).length === 1 &&
        d.giden.length === onceGiden + 1 && g.hatalar.length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} erisim=${gunOlarak(ab.erisimSonu)} ` +
        `giden=${JSON.stringify(d.giden.slice(onceGiden))} ${gunlukYaz(g)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  M — MİRAS satırı AKTİF: ilk çekimin webhook'u KAYBOLDU
// ═════════════════════════════════════════════════════════════════════════
async function mBlogu(): Promise<void> {
  console.log('\n── M · miras satırı: ilk çekimin webhook\'u kayboldu → gece mutabakatı OYNATIR ──');
  const d = dunyaKur();
  const { ab, gocErisimi } = await d.mirasSatinAlmasi('F-M', 'sub-m');
  // Çekim 8 saat önce: iyzico webhook'u ~45 dk'da bıraktı, gece saatler sonra
  // koşar (2 saatten yeni çekim "yolda" sayılır — kural 7e, E bloğu).
  const bas = Date.now() - 8 * SAAT;
  const son = bas + 31 * GUN;
  d.iyz.detaylar.set('sub-m', iyzicoDetayi('sub-m', 'ACTIVE', [
    siparis({ kod: 'ord-m1', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
  ]));
  check('M-FIXTURE Ö ile aynı dünya, webhook YOK: 340 gün, köprü NULL, ord-m1 için olay ve fatura yok',
    ab.erisimSonu.getTime() === gocErisimi.getTime() && ab.kopruErisimSonu === null && son < gocErisimi.getTime() &&
      d.olaylar('ord-m1').length === 0 && d.faturalar(ab.id).length === 0);

  const g = await d.geceyiKos();
  const f = d.faturalar(ab.id).filter((x) => x.tahsilatKodu === 'ord-m1');
  check('M1 ⭐ fatura kuyrukta: TEK satır, dönem = siparişin dönemi',
    f.length === 1 && f[0].donemBasi.getTime() === bas && f[0].donemSonu.getTime() === son,
    `faturalar=${JSON.stringify(d.faturalar(ab.id).map((x) => [x.tahsilatKodu, iso(x.donemBasi), iso(x.donemSonu)]))}`);
  const o = d.durumOlaylari(ab.id).filter((x) => x.veri?.siparisKodu === 'ord-m1');
  check('M2 ⭐ miras erişimi DEĞİŞMEDİ (340 gün), AKTIF — tahsilat yolundan (aktör webhook), köprü düzeltilmedi',
    ab.erisimSonu.getTime() === gocErisimi.getTime() && ab.durum === 'AKTIF' && o.length === 1 &&
      o[0].aktor === 'webhook' && o[0].veri?.kopruDuzeltildi === false,
    `erisim=${gunOlarak(ab.erisimSonu)} durum=${ab.durum} olay=${JSON.stringify(o.map((x) => [x.aktor, x.veri]))}`);
  const oy = d.oynatilanlar();
  check('M3 ⭐ BAĞLANTI: TEK yol — mutabakat olayı (tekil anahtar, imzasız, iyzico kaydı kanıt) işlendi; tahsilat yolu siparişi iyzico\'da YENİDEN aradı',
    oy.length === 1 && oy[0].tekilAnahtar === 'mutabakat:subscription.order.success:ord-m1' && oy[0].islendi === true &&
      oy[0].imzaGecerli === false && oy[0].hamGovde?.kanit?.referenceCode === 'ord-m1' &&
      oy[0].hamGovde?.neden === 'fatura' && d.iyz.sorulan.filter((k) => k === 'sub-m').length === 2,
    `oynatilan=${JSON.stringify(oy.map((x) => [x.tekilAnahtar, x.islendi, x.hata]))} sorulan=${d.iyz.sorulan}`);
  check('M4 müşteriye TEK "ödemeniz alındı" (yenileme makbuzu — dunning yolu değil)',
    d.giden.length === 1 && d.giden[0].konu === 'MetaPriceX — ödemeniz alındı' && d.giden[0].kime === 'muhasebe@f-m.test' &&
      d.toparlandiOlaylari(ab.id).length === 0,
    `giden=${JSON.stringify(d.giden)}`);
  check('M5 günlük: hata yok; TEK uyarı oynatma satırı ve nedeni söylüyor (faturası yoktu); özet "oynatılan: 1 … elle fatura: 0"',
    g.hatalar.length === 0 && g.uyarilar.length === 1 && oynatmaSatiri(g.uyarilar[0], 'ord-m1') &&
      g.uyarilar[0].includes('faturası yoktu') && ozet(g).includes('kayıp tahsilat yeniden oynatılan: 1') &&
      ozet(g).endsWith(elleFaturaOzeti(0)),
    `${gunlukYaz(g)} ozet="${ozet(g)}"`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — KÖPRÜ satırı: denemesiz satın almanın ilk siparişi KAYBOLDU
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · köprü satırı: denemesiz satın almanın ilk siparişi kayboldu → gece mutabakatı ──');
  const d = dunyaKur();
  const ab = await d.yeniFirmaSatinAlmasi('F-K', 'sub-k');
  const bas = Date.now() - 8 * SAAT; // bkz. M: gece çekimden saatler sonra
  const son = bas + 31 * GUN;
  d.iyz.detaylar.set('sub-k', iyzicoDetayi('sub-k', 'ACTIVE', [
    siparis({ kod: 'ord-k1', durum: 'SUCCESS', bas, son, denemeler: ['SUCCESS'] }),
  ]));
  const kopru = ab.erisimSonu.getTime();
  check('K-FIXTURE Ö ile aynı dünya, webhook YOK: erisimSonu = köprü = 33 gün, sipariş (31 gün) köprüden ERKEN',
    yakin(ab.erisimSonu, 33) && ab.kopruErisimSonu?.getTime() === kopru && son < kopru && d.faturalar(ab.id).length === 0);

  const g = await d.geceyiKos();
  check('K1 ⭐ ilk siparişin faturası kuyrukta (tek satır)',
    d.faturalar(ab.id).filter((x) => x.tahsilatKodu === 'ord-k1').length === 1,
    `faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
  const o = d.durumOlaylari(ab.id).filter((x) => x.veri?.siparisKodu === 'ord-k1');
  check('K2 ⭐ köprü iyzico dönemine DÜZELDİ (33 → 31 gün) — webhook gelseydi de böyle (Ö4); köprü kapandı, olay izi',
    ab.erisimSonu.getTime() === son && ab.kopruErisimSonu === null && o.length === 1 && o[0].veri?.kopruDuzeltildi === true,
    `erisim=${gunOlarak(ab.erisimSonu)} kopru=${iso(ab.kopruErisimSonu)} olay=${JSON.stringify(o.map((x) => x.veri))}`);
  check('K3 hata yok; tek uyarı ord-k1 oynatması (faturası yoktu); tek makbuz',
    g.hatalar.length === 0 && g.uyarilar.length === 1 && oynatmaSatiri(g.uyarilar[0], 'ord-k1') &&
      g.uyarilar[0].includes('faturası yoktu') && d.giden.length === 1,
    `${gunlukYaz(g)} giden=${JSON.stringify(d.giden)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  R — MİRAS satırı dunning'de: yeniden deneme TUTTU, başarı webhook'u KAYBOLDU
// ═════════════════════════════════════════════════════════════════════════
async function rBlogu(): Promise<void> {
  console.log('\n── R · miras satırı: merdivenin yeniden denemesi tuttu, webhook kayboldu → gece → merdiven 10. gün ──');
  const w = await mirasDunningDunyasi('F-R', 'sub-r');
  dunningFikstur('R', w);
  const { d, ab, gocErisimi, siparis2 } = w;
  const onceGiden = d.giden.length;

  const g = await d.geceyiKos();
  check('R1 ⭐⭐ ödeyen miras müşteri TOPARLANDI: AKTIF, dunning sayaçları sıfır, erişim 340 gün',
    ab.durum === 'AKTIF' && ab.ilkBasarisizlik === null && ab.denemeSayisi === 0 &&
      ab.erisimSonu.getTime() === gocErisimi.getTime(),
    `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} erisim=${gunOlarak(ab.erisimSonu)}`);
  check('R2 ⭐ yenilemenin faturası kuyrukta (tek); ilk dönemin faturası TEKRAR girmedi',
    d.faturalar(ab.id).filter((x) => x.tahsilatKodu === siparis2).length === 1 &&
      d.faturalar(ab.id).filter((x) => x.tahsilatKodu === w.siparis1).length === 1,
    `faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
  check('R3 TEK "toparlandı" e-postası (dunning yolu; yenileme makbuzu İKİNCİ kez gitmedi)',
    d.giden.length === onceGiden + 1 && d.giden[onceGiden]?.konu === 'MetaPriceX — ödemeniz alındı' &&
      d.toparlandiOlaylari(ab.id).length === 1,
    `giden=${JSON.stringify(d.giden.slice(onceGiden))}`);
  check('R4 günlük: hata yok; tek uyarı oynatma; özet "oynatılan: 1 · kanıtsız: 0" (eski hâlde kanıtsız: 1)',
    g.hatalar.length === 0 && g.uyarilar.length === 1 && oynatmaSatiri(g.uyarilar[0], siparis2) &&
      ozet(g).includes('kayıp tahsilat yeniden oynatılan: 1') && ozet(g).includes("kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 0"),
    `${gunlukYaz(g)} ozet="${ozet(g)}"`);

  // 10. gün: eski hâlde merdiven bu satırı KISITLI yapıyordu (ilkBasarisizlik
  // duruyordu). Toparlanan satırda iz yok — zaman atlaması yalnız iz VARSA
  // uygulanır. (7. gün basamağı BİLEREK koşulmadı: iyzico'nun ÖDENMİŞ siparişi
  // yeniden deneme yanıtı ÖLÇÜLMEDİ.)
  if (ab.ilkBasarisizlik instanceof Date) ab.ilkBasarisizlik = new Date(Date.now() - 10 * GUN - 5 * DK);
  const m10 = await gunluguTopla(() => d.dunning.merdiveniYurut());
  const k = await d.erisim.karar('F-R');
  check('R5 ⭐⭐ 10. gün merdiveni koştu ama satırı TARAMADI: KISITLI YOK, erişim tam, "salt-okunur" e-postası YOK',
    m10.kayitlar.includes('Dunning taraması: 0 abonelik') && ab.durum === 'AKTIF' && k.erisimVar === true &&
      k.saltOkunur === false && d.giden.length === onceGiden + 1 && m10.hatalar.length === 0,
    `durum=${ab.durum} erisim=${k.erisimVar}/${k.saltOkunur} kayitlar=${JSON.stringify(m10.kayitlar)} ` +
      `giden=${JSON.stringify(d.giden.slice(onceGiden))}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  B — dönemi BİTMİŞ faturasız sipariş OYNATILMAZ (kural 7b)
// ═════════════════════════════════════════════════════════════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · dönemi BİTMİŞ faturasız sipariş oynatılmaz: daha yeni reddin dunning\'i silinmez → elle fatura ──');
  {
    const d = dunyaKur();
    const { ab, gocErisimi } = await d.mirasSatinAlmasi('F-B', 'sub-b');
    const simdi = Date.now();
    const b1 = siparis({ kod: 'ord-b1', durum: 'SUCCESS', bas: simdi - 34 * GUN, son: simdi - 3 * GUN, denemeler: ['SUCCESS'] });
    const b2Ret = siparis({ kod: 'ord-b2', durum: 'FAILED', bas: simdi - 3 * GUN, son: simdi + 28 * GUN, denemeler: ['FAILURE'] });
    // Yenileme (ord-b2) reddedildi — GERÇEK başarısızlık yolu. ⚠ UNPAID / FAILED ÖLÇÜLMEDİ.
    d.iyz.detaylar.set('sub-b', iyzicoDetayi('sub-b', 'UNPAID', [b2Ret, b1]));
    d.gelenWebhook('sub-b', 'ord-b2', 'failure');
    const ret = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    const iz = { durum: ab.durum, ilk: ab.ilkBasarisizlik?.getTime(), deneme: ab.denemeSayisi };
    check('B-FIXTURE ret GERÇEK yoldan: ODEME_BEKLIYOR + ilkBasarisizlik + ilk bildirim; ord-b1 ödenmiş, faturasız, dönemi 3 gün önce BİTTİ',
      iz.durum === 'ODEME_BEKLIYOR' && typeof iz.ilk === 'number' && iz.deneme === 1 &&
        d.faturalar(ab.id).length === 0 && ret.hatalar.length === 0,
      `durum=${iz.durum} deneme=${iz.deneme} ${gunlukYaz(ret)}`);
    // En kötü hâl: iyzico yeniden denerken hâlâ ACTIVE diyor (⚠ ÖLÇÜLMEDİ) —
    // mutabakat sipariş listesine bakar ve bitmiş faturasız ord-b1'i görür.
    d.iyz.detaylar.set('sub-b', iyzicoDetayi('sub-b', 'ACTIVE', [b2Ret, b1]));
    const g = await d.geceyiKos();
    check('B1 ⭐⭐ bitmiş dönemin siparişi OYNATILMADI: ODEME_BEKLIYOR, ilkBasarisizlik ve deneme AYNI (daha yeni reddin dunning\'i SİLİNMEDİ), erişim 340 gün, fatura yok',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik?.getTime() === iz.ilk && ab.denemeSayisi === iz.deneme &&
        ab.erisimSonu.getTime() === gocErisimi.getTime() && d.oynatilanlar().length === 0 && d.faturalar(ab.id).length === 0,
      `durum=${ab.durum} ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi} oynatilan=${d.oynatilanlar().length}`);
    const elle = elleFaturaSatirlari(g);
    check('B2 ⭐ SESSİZ değil: tek "elle fatura" uyarısı ord-b1 ile (ödenmemiş ord-b2 anılmaz); özet "elle fatura: 1"',
      elle.length === 1 && elle[0].includes('ord-b1') && !elle[0].includes('ord-b2') && elle[0].includes('elle fatura') &&
        ozet(g).endsWith(elleFaturaOzeti(1)) && g.hatalar.length === 0 && g.uyarilar.length === 1,
      `${gunlukYaz(g)} ozet="${ozet(g)}"`);
  }
  {
    const d = dunyaKur();
    const { ab } = await d.mirasSatinAlmasi('F-B3', 'sub-b3');
    const simdi = Date.now();
    d.islenmisTahsilat(ab, 'sub-b3', 'ord-b3b', simdi - 40 * GUN, simdi - 9 * GUN);
    d.islenmisTahsilat(ab, 'sub-b3', 'ord-b3c', simdi - 9 * GUN, simdi + 22 * GUN);
    d.iyz.detaylar.set('sub-b3', iyzicoDetayi('sub-b3', 'ACTIVE', [
      siparis({ kod: 'ord-b3c', durum: 'SUCCESS', bas: simdi - 9 * GUN, son: simdi + 22 * GUN, denemeler: ['SUCCESS'] }),
      siparis({ kod: 'ord-b3b', durum: 'SUCCESS', bas: simdi - 40 * GUN, son: simdi - 9 * GUN, denemeler: ['SUCCESS'] }),
      // Faturasız ama dönemi 40 gün önce bitti: pencereden eski (canlıdaki sandbox dönemi gibi).
      siparis({ kod: 'ord-b3a', durum: 'SUCCESS', bas: simdi - 71 * GUN, son: simdi - 40 * GUN, denemeler: ['SUCCESS'] }),
    ]));
    const g = await d.geceyiKos();
    check('B3 ⭐ pencereden eski faturasız sipariş TARİHÇEDİR: uyarı yok, oynatma yok, yeni fatura yok; özet "elle fatura: 0"',
      g.uyarilar.length === 0 && g.hatalar.length === 0 && d.oynatilanlar().length === 0 &&
        d.faturalar(ab.id).map((x) => x.tahsilatKodu).join(',') === 'ord-b3b,ord-b3c' && ozet(g).endsWith(elleFaturaOzeti(0)),
      `${gunlukYaz(g)} ozet="${ozet(g)}" faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  E — ENGELLER (kural 7e, 26.09 kod incelemesi): oynatma yanlış satır durumu üretirdi
// ═════════════════════════════════════════════════════════════════════════
async function eBlogu(): Promise<void> {
  console.log('\n── E · engeller: sonraki dönem reddedildi · paket değişimi bekliyor · webhook yolda ──');
  {
    // E1 — Miras satırı; bu ayın siparişi ödenmiş, faturasız (deploy gecesi
    // birikimi). iyzico sonraki dönemi ERKEN çekti ve REDDETTİ (ÖLÇÜLMEDİ —
    // en kötü hâl), abonelik hâlâ ACTIVE. Ret webhook'u GERÇEK yoldan işlendi.
    const d = dunyaKur();
    const { ab, gocErisimi } = await d.mirasSatinAlmasi('F-E1', 'sub-e1');
    const simdi = Date.now();
    const bu = siparis({ kod: 'ord-e1a', durum: 'SUCCESS', bas: simdi - 29 * GUN, son: simdi + 2 * GUN, denemeler: ['SUCCESS'] });
    const sonraki = {
      ...siparis({ kod: 'ord-e1b', durum: 'FAILED', bas: simdi + 2 * GUN, son: simdi + 33 * GUN }),
      paymentAttempts: [{ conversationId: 'conv-e1b', createdDate: simdi - 5 * SAAT, paymentId: 1, paymentStatus: 'FAILURE' }],
    };
    d.iyz.detaylar.set('sub-e1', iyzicoDetayi('sub-e1', 'ACTIVE', [sonraki, bu]));
    d.gelenWebhook('sub-e1', 'ord-e1b', 'failure');
    const ret = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    const iz = { durum: ab.durum, ilk: ab.ilkBasarisizlik?.getTime(), deneme: ab.denemeSayisi, giden: d.giden.length };
    check('E1-FIXTURE ret GERÇEK yoldan (sipariş FAILED + ret denemesi kanıttır, abonelik ACTIVE): ODEME_BEKLIYOR + ilkBasarisizlik + ilk bildirim',
      iz.durum === 'ODEME_BEKLIYOR' && typeof iz.ilk === 'number' && iz.deneme === 1 && iz.giden === 1 && ret.hatalar.length === 0,
      `durum=${iz.durum} deneme=${iz.deneme} giden=${iz.giden} ${gunlukYaz(ret)}`);
    const g = await d.geceyiKos();
    check('E1 ⭐⭐ bu ayın faturasız siparişi OYNATILMADI: ret dunning\'i yerinde (ODEME_BEKLIYOR, ilkBasarisizlik/deneme AYNI), "ödemeniz alındı" YOK, erişim 340 gün',
      ab.durum === 'ODEME_BEKLIYOR' && ab.ilkBasarisizlik?.getTime() === iz.ilk && ab.denemeSayisi === iz.deneme &&
        d.giden.length === iz.giden && d.oynatilanlar().length === 0 && d.faturalar(ab.id).length === 0 &&
        ab.erisimSonu.getTime() === gocErisimi.getTime(),
      `durum=${ab.durum} deneme=${ab.denemeSayisi} giden=${JSON.stringify(d.giden)} oynatilan=${d.oynatilanlar().length}`);
    const elle = elleFaturaSatirlari(g);
    check('E1b SESSİZ değil: tek "elle fatura" uyarısı ord-e1a; özet "elle fatura: 1"',
      elle.length === 1 && elle[0].includes('ord-e1a') && !elle[0].includes('ord-e1b') && ozet(g).endsWith(elleFaturaOzeti(1)) &&
        g.hatalar.length === 0 && g.uyarilar.length === 1,
      `${gunlukYaz(g)} ozet="${ozet(g)}"`);
  }
  {
    // E2 — Paket DÜŞÜRME bekliyor (dönem sonu). `paket-degisimi.servisi`nin
    // yazdığı biçim: yeni UÇ kodu, planlı sürüm, kilit = geçiş. Yeni ucun
    // listesinde eski ucun faturasız siparişi GÖRÜNÜYOR (ÖLÇÜLMEDİ — en kötü hâl).
    const d = dunyaKur();
    d.db.ekle('paket', { id: 'PB', kod: 'basic-mek', ad: 'Basic Mekanik', kullaniciHakki: 1, dwgAktif: false });
    d.db.ekle('paketSurumu', {
      id: 'S20', paketId: 'PB', periyot: 'MONTHLY', periyotAdedi: 1, denemeGunu: 30,
      tutar: 999, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-20', satistaMi: true,
    });
    const { ab, gocErisimi } = await d.mirasSatinAlmasi('F-E2', 'sub-e2');
    const simdi = Date.now();
    const gecis = new Date(simdi + 21 * GUN);
    Object.assign(ab, {
      iyzicoAbonelikKodu: 'sub-e2-yeni', planliPaketSurumuId: 'S20', odenenPaketSurumuId: null, paketGecisTarihi: gecis,
    });
    const eski = siparis({ kod: 'ord-e2', durum: 'SUCCESS', bas: simdi - 10 * GUN, son: gecis.getTime(), denemeler: ['SUCCESS'] });
    d.iyz.detaylar.set('sub-e2-yeni', { ...iyzicoDetayi('sub-e2-yeni', 'ACTIVE', [eski]), pricingPlanReferenceCode: 'plan-20' });
    check('E2-FIXTURE satır yeni uçta, düşürme planlı, kilit = geçiş (21 gün sonra); sipariş geçişten ÖNCE başladı, faturasız',
      ab.iyzicoAbonelikKodu === 'sub-e2-yeni' && ab.paketSurumuId === 'S30' && ab.planliPaketSurumuId === 'S20' &&
        ab.paketGecisTarihi?.getTime() === gecis.getTime() && d.faturalar(ab.id).length === 0);
    const g = await d.geceyiKos();
    check('E2 ⭐⭐ eski ucun siparişi yeni ucun tahsilatı sayılmadı: OYNATILMADI; etkin paket, planlı düşürme ve KİLİT yerinde; erişim 340 gün',
      d.oynatilanlar().length === 0 && ab.paketSurumuId === 'S30' && ab.planliPaketSurumuId === 'S20' &&
        ab.paketGecisTarihi?.getTime() === gecis.getTime() && ab.erisimSonu.getTime() === gocErisimi.getTime() &&
        d.faturalar(ab.id).length === 0,
      `oynatilan=${d.oynatilanlar().length} paket=${ab.paketSurumuId} planli=${ab.planliPaketSurumuId} kilit=${iso(ab.paketGecisTarihi)}`);
    const elle = elleFaturaSatirlari(g);
    check('E2b tek "elle fatura" uyarısı ord-e2; hata yok',
      elle.length === 1 && elle[0].includes('ord-e2') && g.hatalar.length === 0 && g.uyarilar.length === 1, gunlukYaz(g));
  }
  {
    // E3 — Çekim 30 dk önce: iyzico'nun kendi yeniden gönderimi hâlâ sürebilir.
    const d = dunyaKur();
    const { ab } = await d.mirasSatinAlmasi('F-E3', 'sub-e3');
    const bas = Date.now() - 30 * DK;
    const taze = siparis({ kod: 'ord-e3', durum: 'SUCCESS', bas, son: bas + 31 * GUN, denemeler: ['SUCCESS'] });
    d.iyz.detaylar.set('sub-e3', iyzicoDetayi('sub-e3', 'ACTIVE', [taze]));
    const g1 = await d.geceyiKos();
    check('E3 ⭐ webhook YOLDA (son deneme 29 dk önce): oynatılmadı, uyarı yok, özet "oynatılan: 0 · elle fatura: 0"',
      d.oynatilanlar().length === 0 && d.faturalar(ab.id).length === 0 && g1.uyarilar.length === 0 && g1.hatalar.length === 0 &&
        ozet(g1).includes('kayıp tahsilat yeniden oynatılan: 0') && ozet(g1).endsWith(elleFaturaOzeti(0)),
      `${gunlukYaz(g1)} ozet="${ozet(g1)}"`);
    // Sonraki gece: saat ilerletilemediği için deneme anı geriye alınır (aynı etki).
    d.iyz.detaylar.set('sub-e3', iyzicoDetayi('sub-e3', 'ACTIVE', [{
      ...taze, paymentAttempts: taze.paymentAttempts.map((a) => ({ ...a, createdDate: Date.now() - 3 * SAAT })),
    }]));
    const g2 = await d.geceyiKos();
    check('E3b sonraki gece (deneme 3 saat önce): oynatıldı, fatura kuyrukta',
      d.oynatilanlar().length === 1 && d.faturalar(ab.id).filter((f) => f.tahsilatKodu === 'ord-e3').length === 1 &&
        g2.hatalar.length === 0 && oynatmaSatiri(g2.uyarilar[0] ?? '', 'ord-e3'),
      `${gunlukYaz(g2)} faturalar=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  D — deneme SÜRERKEN faturasız kuralı bakmaz (kural 7c)
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · deneme sürerken faturasız kuralı bakmaz (denemede tahsilat yok) ──');
  const d = dunyaKur();
  const ab = await d.yeniFirmaSatinAlmasi('F-D', 'sub-d', 30);
  const simdi = Date.now();
  // En kötü hâl: kart doğrulaması (1 TL, iade) ödenmiş sipariş gibi görünür,
  // dönem sonu deneme sonu — erişimden (deneme + 2 gün tampon) ERKEN, kural 2
  // tetiklemez. 26.09 canlı sandbox (tek örnek, salt okuma): GÖRÜNMEDİ, listede
  // yalnız önceden açılmış WAITING vardı — kapı yine de en kötü hâli ölçer.
  // 8 saat önce: "yoldaki webhook" kuralı (7e) bu vakayı ayırt ETMESİN — D1'i
  // yalnız deneme kuralı (7c) tutmalı.
  const dogrulama = siparis({ kod: 'ord-d0', durum: 'SUCCESS', bas: simdi - 8 * SAAT, son: ab.denemeSonu.getTime(), denemeler: ['SUCCESS'] });
  d.iyz.detaylar.set('sub-d', { ...iyzicoDetayi('sub-d', 'ACTIVE', [dogrulama]), trialDays: 30 });
  check('D-FIXTURE GERÇEK satın alma: DENEME, deneme 30 gün sürüyor, sipariş dönem sonu erişimden ERKEN',
    ab.durum === 'DENEME' && yakin(ab.denemeSonu, 30) && yakin(ab.erisimSonu, 32) && ab.denemeSonu < ab.erisimSonu,
    `durum=${ab.durum} deneme=${gunOlarak(ab.denemeSonu)} erisim=${gunOlarak(ab.erisimSonu)}`);
  const g = await d.geceyiKos();
  check('D1 ⭐ DENEME kaldı: oynatma yok, fatura yok, uyarı yok; özet "deneme sürdüğü için: 1 · elle fatura: 0"',
    ab.durum === 'DENEME' && d.oynatilanlar().length === 0 && d.faturalar(ab.id).length === 0 &&
      g.uyarilar.length === 0 && g.hatalar.length === 0 &&
      ozet(g).includes("deneme sürdüğü için AKTIF'e çekilmeyen: 1") && ozet(g).endsWith(elleFaturaOzeti(0)),
    `durum=${ab.durum} ${gunlukYaz(g)} ozet="${ozet(g)}"`);
}

// ═════════════════════════════════════════════════════════════════════════
//  İ — TEKRARLANABİLİRLİK (kural 4 kural 7'nin oynatmasına da uygulanır)
// ═════════════════════════════════════════════════════════════════════════
/** M bloğunun dünyası: miras satırı, bu ayın siparişi kayıp. */
async function mirasKayipDunyasi(firmaId: string, kod: string) {
  const d = dunyaKur();
  const { ab, gocErisimi } = await d.mirasSatinAlmasi(firmaId, kod);
  const bas = Date.now() - 8 * SAAT; // bkz. M: gece çekimden saatler sonra
  const siparisKodu = `${kod}-ord-1`;
  const detay = iyzicoDetayi(kod, 'ACTIVE', [
    siparis({ kod: siparisKodu, durum: 'SUCCESS', bas, son: bas + 31 * GUN, denemeler: ['SUCCESS'] }),
  ]);
  d.iyz.detaylar.set(kod, detay);
  return { d, ab, gocErisimi, detay, siparisKodu };
}

async function iBlogu(): Promise<void> {
  console.log('\n── İ · ikinci gece + geç gelen GERÇEK webhook ──');
  {
    const { d, ab, gocErisimi, siparisKodu } = await mirasKayipDunyasi('F-I1', 'sub-i1');
    await d.geceyiKos();
    const ikinci = await d.geceyiKos();
    check('İ1 ⭐ ikinci gece: yeni olay yok, yeni fatura yok, uyarı yok, özet "oynatılan: 0 · elle fatura: 0", makbuz hâlâ tek',
      d.olaylar(siparisKodu).length === 1 && d.faturalar(ab.id).length === 1 && ikinci.uyarilar.length === 0 &&
        ikinci.hatalar.length === 0 && ozet(ikinci).includes('kayıp tahsilat yeniden oynatılan: 0') &&
        ozet(ikinci).endsWith(elleFaturaOzeti(0)) && d.giden.length === 1,
      `olay=${d.olaylar(siparisKodu).length} fatura=${d.faturalar(ab.id).length} ozet="${ozet(ikinci)}" ${gunlukYaz(ikinci)}`);
    // iyzico'nun kendi tekrarı geç geldi (kesinti bitti): GERÇEK olay.
    d.gelenWebhook('sub-i1', siparisKodu, 'success');
    const gec = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    check('İ2 ⭐ geç gelen gerçek webhook işlendi ama İKİNCİ fatura ve İKİNCİ makbuz YOK, erişim 340 gün',
      d.olaylar(siparisKodu).length === 2 && d.olaylar(siparisKodu).every((o) => o.islendi === true) &&
        d.faturalar(ab.id).length === 1 && d.giden.length === 1 && ab.erisimSonu.getTime() === gocErisimi.getTime() &&
        gec.hatalar.length === 0,
      `olaylar=${JSON.stringify(d.olaylar(siparisKodu).map((o) => [o.kaynak, o.islendi]))} giden=${d.giden.length} ${gunlukYaz(gec)}`);
  }

  console.log('\n── İ · oynatılan olay işlenemedi (5 deneme) → sonraki gece YENİDEN KURULUR ──');
  {
    const { d, ab, gocErisimi, detay, siparisKodu } = await mirasKayipDunyasi('F-I3', 'sub-i3');
    // Gece: mutabakat olayı yazar; o sırada iyzico siparişi listesinden düşürmüş
    // olsun (tahsilat yolu doğrulayamaz → olay hata alır) — 03:30 kesintisi.
    await gunluguTopla(() => d.mutabakat.geceMutabakati());
    d.iyz.detaylar.set('sub-i3', { ...detay, orders: [] });
    for (let i = 0; i < 6; i++) await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    const olu = d.oynatilanlar()[0];
    check('İ3-FIXTURE oynatılan olay 5 denemede işlenemedi (ölü), fatura yok',
      d.oynatilanlar().length === 1 && olu?.islendi === false && olu?.denemeSayisi === 5 &&
        String(olu?.hata).includes('doğrulanamadı') && d.faturalar(ab.id).length === 0,
      `olay=${JSON.stringify({ islendi: olu?.islendi, deneme: olu?.denemeSayisi, hata: olu?.hata })}`);
    d.iyz.detaylar.set('sub-i3', detay); // sipariş listede yeniden görünür
    const g = await gunluguTopla(() => d.mutabakat.geceMutabakati());
    // `olu?.` — olay hiç yazılmadıysa (kural yok/bozuk) kapı PATLAMAZ, kırmızı
    // yazar ve sonraki bloklar yine ölçülür.
    check('İ3 ⭐ sonraki gece: İKİNCİ olay YAZILMADI; ölü olay YENİDEN KURULDU, uyarı sipariş kodu + son hatayı taşır',
      d.oynatilanlar().length === 1 && olu?.denemeSayisi === 0 && olu?.hata === null && g.hatalar.length === 0 &&
        g.uyarilar.length === 1 && g.uyarilar[0].includes('YENİDEN KURULDU') && g.uyarilar[0].includes(siparisKodu) &&
        g.uyarilar[0].includes('doğrulanamadı'),
      `oynatilan=${d.oynatilanlar().length} deneme=${olu?.denemeSayisi} ${gunlukYaz(g)}`);
    const isle = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    check('İ4 ⭐ yeniden kurulan olay işlendi: fatura kuyrukta, erişim 340 gün (ödeme kaybolmadı)',
      olu?.islendi === true && d.faturalar(ab.id).filter((f) => f.tahsilatKodu === siparisKodu).length === 1 &&
        ab.erisimSonu.getTime() === gocErisimi.getTime() && isle.hatalar.length === 0,
      `islendi=${olu?.islendi} faturalar=${d.faturalar(ab.id).map((f) => f.tahsilatKodu)} ${gunlukYaz(isle)}`);
    // SENTETİK (canlıda fatura silinmez): işlenmiş olay + fatura yine yok →
    // yalnız uyarı metninin NEDENİ doğru söylediğini ölçer.
    const tablo = d.db.tablo('fatura');
    const sira = tablo.findIndex((f) => f.tahsilatKodu === siparisKodu);
    if (sira >= 0) tablo.splice(sira, 1);
    const g2 = await gunluguTopla(() => d.mutabakat.geceMutabakati());
    check('İ5 işlenmiş olay yeniden kurulmaz, ikinci olay yok; uyarı nedeni doğru: "faturası hâlâ yok" ("erişim" DEĞİL)',
      sira >= 0 && d.oynatilanlar().length === 1 && olu?.islendi === true && g2.hatalar.length === 0 && g2.uyarilar.length === 1 &&
        g2.uyarilar[0].includes('faturası hâlâ yok') && !g2.uyarilar[0].includes('erişim hâlâ') &&
        g2.uyarilar[0].includes(siparisKodu),
      gunlukYaz(g2));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  G — GECE TARAMASI (cron giriş noktası): karışık satırlar, TAM özet satırı
// ═════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · gece taraması (cron giriş noktası) — BAĞLANTI ve tam özet satırı ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const ode = (kod: string, bas: number, sonu: number) =>
    siparis({ kod, durum: 'SUCCESS', bas, son: sonu, denemeler: ['SUCCESS'] });
  // g1 — miras: bu ayın siparişi kayıp → oynat (erişim dokunulmaz)
  const { ab: g1, gocErisimi } = await d.mirasSatinAlmasi('F-G1', 'sub-g1');
  d.iyz.detaylar.set('sub-g1', iyzicoDetayi('sub-g1', 'ACTIVE', [ode('ord-g1', simdi - 2 * GUN, simdi + 29 * GUN)]));
  // g2 — köprü: denemesiz satın almanın ilk siparişi kayıp → oynat (köprü düzelir)
  const g2 = await d.yeniFirmaSatinAlmasi('F-G2', 'sub-g2');
  const g2Son = simdi - 8 * SAAT + 31 * GUN;
  d.iyz.detaylar.set('sub-g2', iyzicoDetayi('sub-g2', 'ACTIVE', [ode('ord-g2', simdi - 8 * SAAT, g2Son)]));
  // g3 — miras: geçen ayın siparişi faturasız (bitti), bu ayınki faturalı → elle fatura
  const { ab: g3 } = await d.mirasSatinAlmasi('F-G3', 'sub-g3');
  d.islenmisTahsilat(g3, 'sub-g3', 'ord-g3b', simdi - 3 * GUN, simdi + 28 * GUN);
  d.iyz.detaylar.set('sub-g3', iyzicoDetayi('sub-g3', 'ACTIVE', [
    ode('ord-g3b', simdi - 3 * GUN, simdi + 28 * GUN),
    ode('ord-g3a', simdi - 34 * GUN, simdi - 3 * GUN),
  ]));
  // g4 — miras: her şey faturalı → hiçbir şey
  const { ab: g4 } = await d.mirasSatinAlmasi('F-G4', 'sub-g4');
  d.islenmisTahsilat(g4, 'sub-g4', 'ord-g4', simdi - 10 * GUN, simdi + 21 * GUN);
  d.iyz.detaylar.set('sub-g4', iyzicoDetayi('sub-g4', 'ACTIVE', [ode('ord-g4', simdi - 10 * GUN, simdi + 21 * GUN)]));
  // g5 — kural 7d: siparişin faturası BAŞKA bir abonelik satırına kesilmiş
  // (`tahsilatKodu` @unique, `kuyrugaAl` tekilliği abonelikten bağımsız) →
  // faturalıdır. Sorguya abonelik süzgeci eklenirse g5 yanlışlıkla oynatılır.
  const { ab: g5 } = await d.mirasSatinAlmasi('F-G5', 'sub-g5');
  d.firmaEkle('F-G5X');
  const baska = d.db.ekle('abonelik', {
    firmaId: 'F-G5X', paketSurumuId: 'S30', durum: 'AKTIF', erisimSonu: new Date(simdi + 9 * GUN), odemeYontemi: 'HAVALE',
  });
  d.islenmisTahsilat(baska, 'sub-g5', 'ord-g5', simdi - 6 * GUN, simdi + 25 * GUN);
  d.iyz.detaylar.set('sub-g5', iyzicoDetayi('sub-g5', 'ACTIVE', [ode('ord-g5', simdi - 6 * GUN, simdi + 25 * GUN)]));

  const gece = await d.geceyiKos();
  const kodlar = () => d.db.tablo('fatura').map((f) => f.tahsilatKodu).sort().join(',');
  check('G1 ⭐ BAĞLANTI: cron giriş noktası iki faturasız süren siparişi oynattı, işleyici faturaladı; g3/g4/g5 oynatılmadı (g5\'in faturası başka satırda — kural 7d)',
    kodlar() === 'ord-g1,ord-g2,ord-g3b,ord-g4,ord-g5' &&
      d.oynatilanlar().map((o) => o.siparisKodu).sort().join(',') === 'ord-g1,ord-g2' &&
      d.faturalar(g5.id).length === 0 && d.faturalar(baska.id).length === 1,
    `faturalar=${kodlar()} oynatilan=${d.oynatilanlar().map((o) => o.siparisKodu)}`);
  check('G2 erişim: g1/g3/g4 340 gün (dokunulmadı), g2 köprüsü iyzico dönemine düzeldi; hepsi AKTIF',
    g1.erisimSonu.getTime() === gocErisimi.getTime() && yakin(g3.erisimSonu, MIRAS_GUN) && yakin(g4.erisimSonu, MIRAS_GUN) &&
      g2.erisimSonu.getTime() === g2Son && [g1, g2, g3, g4].every((r) => r.durum === 'AKTIF'),
    `g1=${gunOlarak(g1.erisimSonu)} g2=${gunOlarak(g2.erisimSonu)} g3=${gunOlarak(g3.erisimSonu)} g4=${gunOlarak(g4.erisimSonu)}`);
  const beklenen =
    "Mutabakat bitti. Değişen: 0 · deneme sürdüğü için AKTIF'e çekilmeyen: 0 · kayıp tahsilat yeniden oynatılan: 2 · " +
    "kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 0 · faturasız ödenmiş sipariş (elle fatura): 1";
  check('G3 ⭐ özet (deploy sonrası ölçüm): "… oynatılan: 2 · … elle fatura: 1" — TAM satır', ozet(gece) === beklenen,
    `ozet="${ozet(gece)}"`);
  const elle = elleFaturaSatirlari(gece);
  check('G4 günlük TAM: hata yok; uyarılar = iki oynatma + g3\'ün "elle fatura"sı (yalnız ord-g3a)',
    gece.hatalar.length === 0 && gece.uyarilar.length === 3 &&
      gece.uyarilar.some((u) => oynatmaSatiri(u, 'ord-g1')) && gece.uyarilar.some((u) => oynatmaSatiri(u, 'ord-g2')) &&
      elle.length === 1 && elle[0].includes('ord-g3a') && !elle[0].includes('ord-g3b'),
    gunlukYaz(gece));
  const ikinci = await d.geceyiKos();
  check('G5 ⭐ ikinci gece: "oynatılan: 0 · … elle fatura: 1" — sayaçlar sıfırlanır; bitmiş faturasız sipariş pencere boyunca görünür',
    ozet(ikinci) === beklenen.replace('yeniden oynatılan: 2', 'yeniden oynatılan: 0') &&
      ikinci.uyarilar.length === 1 && ikinci.uyarilar[0].includes('ord-g3a') && ikinci.hatalar.length === 0,
    `ozet="${ozet(ikinci)}" ${gunlukYaz(ikinci)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  V — NES TALEBİ (elle): oynatılan faturanın "ödeme tarihi" YAKALAMA ANI DEĞİL
// ═════════════════════════════════════════════════════════════════════════
/** Elle (NES) adaptörünün yerine: talebi kaydeder; e-posta metni SAF fonksiyondan kurulur. */
function nesYakalayici() {
  const talepler: FaturaKesTalebi[] = [];
  return {
    talepler,
    adaptor: {
      ad: 'elle',
      faturaKes: async (t: FaturaKesTalebi) => {
        talepler.push(t);
        return { saglayiciId: `nes-${t.harciAnahtar}` };
      },
    },
  };
}

async function vBlogu(): Promise<void> {
  console.log('\n── V · NES talebi (elle): oynatma VUK 231/5 son düzenleme gününü ERTELEMEZ ──');
  const nes = nesYakalayici();
  const d = dunyaKur(nes.adaptor);
  const { ab } = await d.mirasSatinAlmasi('F-V', 'sub-v');
  // v1: çekim 20 saat önce, webhook kayboldu; gece oynatması ~20 saat SONRA yakalar.
  // v2: yenileme ilk üç denemede reddedildi, DÖRDÜNCÜ deneme (dönem başından
  //     3 gün sonra) tuttu — `siparis()` deneme anı = dönem başı + sıra × gün.
  const { ab: ab2 } = await d.mirasSatinAlmasi('F-V2', 'sub-v2');
  const bas = Date.now() - 20 * SAAT;
  const bas2 = Date.now() - 4 * GUN;
  d.iyz.detaylar.set('sub-v', iyzicoDetayi('sub-v', 'ACTIVE', [
    siparis({ kod: 'ord-v1', durum: 'SUCCESS', bas, son: bas + 31 * GUN, denemeler: ['SUCCESS'] }),
  ]));
  const v2 = siparis({
    kod: 'ord-v2', durum: 'SUCCESS', bas: bas2, son: bas2 + 31 * GUN, denemeler: ['FAILURE', 'FAILURE', 'FAILURE', 'SUCCESS'],
  });
  d.iyz.detaylar.set('sub-v2', iyzicoDetayi('sub-v2', 'ACTIVE', [v2]));
  await d.geceyiKos();
  const f = d.faturalar(ab.id).find((x) => x.tahsilatKodu === 'ord-v1');
  const k = await gunluguTopla(() => d.faturaServisi.kuyrugaBak());
  const t = nes.talepler.find((x) => x.harciAnahtar === 'ord-v1');
  check('V-FIXTURE oynatılan fatura ~20 saat GEÇ yakalandı (satırın oluşturulma anı çekimden sonra); iki NES talebi',
    !!f && f.olusturuldu.getTime() - bas > 19 * SAAT && nes.talepler.length === 2 && k.hatalar.length === 0 &&
      d.faturalar(ab2.id).length === 1,
    `olusturuldu-bas=${f ? ((f.olusturuldu.getTime() - bas) / SAAT).toFixed(1) : '-'} saat talep=${nes.talepler.length} ${gunlukYaz(k)}`);
  check('V1 ⭐ NES talebinin ödeme tarihi = çekim anı (siparişin dönem başı), YAKALAMA anı DEĞİL — oynatma son günü ertelemez',
    t?.tahsilat?.tarih instanceof Date && t.tahsilat.tarih.getTime() === bas,
    `tarih=${iso(t?.tahsilat?.tarih)} beklenen=${iso(new Date(bas))}`);
  const e = t ? faturaKesimTalebiEpostasi(t, { iyzicoTestOrtami: false }) : null;
  check('V2 NES e-postası son düzenleme gününü çekim + 7 gün yazar (VUK md. 231/5)',
    !!e && e.paragraflar.some((p) => p.startsWith(`Son düzenleme günü: ${tarihYaz(new Date(bas + 7 * GUN))} `)),
    JSON.stringify(e?.paragraflar.filter((p) => p.startsWith('Ödeme tarihi') || p.startsWith('Son düzenleme'))));
  // BİLİNEN SINIR (ayrı iş, koordinatör notu 26.09): `Fatura` satırı ödeme
  // anını TAŞIMAZ; "ödeme tarihi" = min(kuyruğa alınma, dönem başı). Yeniden
  // denemeyle toparlanan tahsilatta bu, GERÇEK ödemeden (başarılı deneme)
  // ÖNCEDİR: son gün erken yazılır; ödeme dönem başından 7+ gün sonraysa
  // e-posta GEÇMİŞ bir son gün yazar ve "süre geçti" demez.
  const t2 = nes.talepler.find((x) => x.harciAnahtar === 'ord-v2');
  const basariliDeneme = v2.paymentAttempts.find((a) => a.paymentStatus === 'SUCCESS')?.createdDate ?? NaN;
  check('V3 BİLİNEN SINIR: toparlanan tahsilatta NES "ödeme tarihi" = dönem başı, başarılı denemeden 3 gün ÖNCE',
    t2?.tahsilat?.tarih?.getTime() === bas2 && basariliDeneme - bas2 === 3 * GUN + DK,
    `tarih=${iso(t2?.tahsilat?.tarih)} basariliDeneme=${iso(new Date(basariliDeneme))}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nMUTABAKAT FATURASIZ TAHSİLAT: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  sBlogu();
  await oBlogu();
  await mBlogu();
  await kBlogu();
  await rBlogu();
  await bBlogu();
  await eBlogu();
  await dBlogu();
  await iBlogu();
  await gBlogu();
  await vBlogu();
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
