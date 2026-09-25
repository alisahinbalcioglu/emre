/**
 * MUTABAKAT KAYIP TAHSİLAT WEBHOOK'UNU KURTARIR  (`npm run test:mutabakat-kayip-tahsilat`) · 24.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. GERÇEK `MutabakatJob`, `AbonelikServisi`, `WebhookIsleyici`,
 * `FaturaServisi`, `DunningServisi` ve `ErisimServisi` bellek-Prisma üzerinde
 * koşar. Bellek-Prisma `where`i GERÇEKTEN uygular, tekillik kısıtlarını
 * (P2002) taşır, `orderBy`/`take`/`increment` bilir ve bilmediği operatörde
 * PATLAR (sessizce yok saymaz). iyzico sahtedir: yalnız ABONELİK DETAYI
 * döndürür (her çağrıda TAZE kopya), kime sorulduğunu kaydeder ve
 * tanımlanmamış kod için VARSAYILAN UYDURMAZ (hata fırlatır).
 *
 * ── NEDEN ─────────────────────────────────────────────────────────────────
 * Ödenmiş dönemi `erisimSonu`na yazan TEK yol başarılı tahsilat webhook'udur
 * (`AbonelikServisi.tahsilatBasarili`, iyzico'nun sipariş listesinde
 * doğrulayarak); faturayı kuyruğa alan da (`FaturaServisi.kuyrugaAl`) yalnız
 * o yoldur (`WebhookIsleyici.basariliTahsilat`). iyzico webhook'u ~3 denemede
 * (~45 dk) bırakır; işleyici yalnız ALDIĞIMIZ olayı yeniden dener. Gece
 * mutabakatı `erisimSonu`na yalnız İPTAL dalında dokunur. Sonuç: webhook'u
 * kaybolan ödeyen müşteri `erisimSonu`nu geçer, "Abonelik döneminiz
 * doğrulanıyor" ekranında erişimsiz kalır ve fatura HİÇ kesilmez.
 *
 * ⚠ SAHTE iyzico YALNIZ ÖLÇÜLMÜŞ/DOKÜMANTE ALANLARI taşır. Sipariş biçimi
 * 20.08 sandbox tutanağından (docs/adim0-tutanak/*.json): tarihler epoch ms
 * SAYI, ödeme denemesi alanı `paymentStatus` (istemci tipi
 * `paymentAttemptStatus` diyor — tutanak `paymentStatus` gösteriyor),
 * `paidPrice` YOK, liste YENİDEN ESKİYE sıralı. Denemeli abonelikte sipariş
 * listesi ÖLÇÜLMEDİ. Ölçülmemiş her değer bulunduğu yerde işaretli.
 *
 * ── KURAL (Emre kararı 24.09): mutabakat.job.ts → KAYIP TAHSİLAT notu ────
 * iyzico ACTIVE + ödenmiş sipariş (SUCCESS + SUCCESS ödeme denemesi) dönem
 * sonu `erisimSonu`ndan sonra → mutabakat `WebhookOlayi`na `kaynak:
 * 'mutabakat'` satırı yazar, webhook işleyicisi AYNI tahsilat yolunu koşar.
 * Kanıtsız ACTIVE (IPTAL dışında) AKTIF'e çekmez.
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  saf kural: `odenmisSiparisMi`, `erisimiUzatanOdemeler`
 *   T  saf tarih: `iyzicoTarihi` (sayı · rakam-dizesi · ISO; uydurma yok)
 *   Ö  ÖLÇÜT: webhook ALINIRSA aynı dünya istenen sonucu üretir (kör değil)
 *   A  AKTİF yenileme webhook'u kayboldu → erişim + fatura + iz (BAĞLANTI)
 *   D  deneme sonrası ilk çekim webhook'u kayboldu
 *   B  ödeme bekleyen müşterinin toparlanması kayboldu (eski hâlde KİLİT)
 *   W  deneme sürerken ödenmiş sipariş: kanıt deneme kuralından önce gelir
 *   N  negatifler: kanıt yok → dokunma; kanıtsız ACTIVE terfi ettirmez
 *   İ  tekrarlanabilirlik: ikinci gece · geç gelen gerçek webhook · işlenemeyen
 *      oynatma ertesi gece YENİDEN KURULUR · birden çok kayıp sipariş
 *   G  gece taraması (cron giriş noktası): özet satırı, sayaçlar, BAĞLANTI
 *   K  KORUMA (Emre 24.09 "kural kalsın, koruma ekle"): iyzico'da ACTIVE
 *      görünen SONA_ERDI satırı taranır; GERÇEK `baslat` iyzico'su açık geri
 *      dönen müşteriyi reddeder (çift çekim); `iptalEt` iyzico durumunu tazeler
 *   Z  zincir (incelemenin senaryosu): kanıt tamponda görünmez → SONA_ERDI →
 *      yeniden alım engelli → ertesi gece oynatma kurtarır
 *
 * ESKİ HÂL (kural yokken, 24.09 ölçüldü): Ö yeşil, A/D/B'nin 10 sonuç
 * assert'i kırmızı — B'de mutabakat ödeyen müşterinin erişimini KAPATIYORDU.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MUTABAKAT_KAYNAGI,
  MutabakatJob,
  erisimiUzatanOdemeler,
  odenmisSiparisMi,
} from '../src/ozellik/odeme/abonelik/mutabakat.job';
import { iyzicoTarihi } from '../src/ozellik/odeme/iyzico/iyzico-tarihi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import {
  SatinAlmaServisi,
  donemTarihleriHesapla,
  ikinciAbonelikMi,
} from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { yeniAbonelikEngeli } from '../src/ozellik/odeme/abonelik/paket-degisimi';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
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

/**
 * Günlüğü TOPLAR (`mutabakat-deneme-test.ts` ile aynı gerekçe): gece işi ve
 * webhook işleyicisi satır/olay hatasını YAKALAYIP yalnız günlüğe yazar;
 * günlük kapalıyken patlayan bir satır "değişmedi" diye boşuna yeşil
 * görünürdü. Her koşum hata/uyarı satırlarını ayrıca sayar.
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
//  BELLEK-PRISMA — `mutabakat-deneme-test.ts`teki taklidin genişletilmişi:
//  tekillik (P2002), ilişki `select`i, orderBy/take, `increment`
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
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
//  SAHTE iyzico — yalnız abonelik detayı (her çağrıda TAZE kopya)
// ═════════════════════════════════════════════════════════════════════════
function sahteIyzico() {
  const detaylar = new Map<string, unknown>();
  const sorulan: string[] = [];
  const iptaller: string[] = [];
  const baslatmalar: unknown[] = [];
  return {
    detaylar,
    sorulan,
    iptaller,
    baslatmalar,
    istemci: {
      abonelikGetir: async (kod: string) => {
        sorulan.push(kod);
        const d = detaylar.get(kod);
        if (!d) throw new Error(`sahte iyzico: ${kod} icin detay tanimlanmadi`);
        return JSON.parse(JSON.stringify(d));
      },
      tahsilatiTekrarla: async () => {
        throw new Error('sahte iyzico: bu pakette yeniden tahsilat DENENMEZ');
      },
      abonelikIptal: async (kod: string) => {
        iptaller.push(kod);
        return {};
      },
      // Satın alma kapısı reddederse iyzico formu HİÇ açılmamalı.
      abonelikBaslat: async (p: unknown) => {
        baslatmalar.push(p);
        throw new Error('sahte iyzico: bu pakette abonelik formu ACILMAZ');
      },
    } as any,
  };
}

/**
 * Sipariş — 20.08 sandbox tutanağındaki biçim (adim0-cikti.json, S2a-dogrulama
 * SUCCESS siparişi): `price`, `currencyCode`, epoch-ms `startPeriod`/
 * `endPeriod`, `orderStatus`, `paymentAttempts[{conversationId, createdDate,
 * paymentId, paymentStatus}]`. `paidPrice` tutanakta YOK — konmadı.
 * ⚠ Başarısız denemenin `paymentStatus` değeri ÖLÇÜLMEDİ ('FAILURE' iyzico'nun
 * ödeme API'sindeki değer); kural yalnız SUCCESS'i arar.
 */
function siparis(p: {
  kod: string;
  durum: string;
  bas: number;
  son: number | string;
  denemeler?: string[];
}) {
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

/** Abonelik detayı — 20.08 tutanağındaki alanlar; deneme alanları dokümandan. */
function iyzicoDetayi(
  kod: string,
  durum: string,
  siparisler: unknown[],
  deneme?: { baslangic: number; gun: number },
) {
  return {
    referenceCode: kod,
    parentReferenceCode: `kok-${kod}`,
    pricingPlanReferenceCode: 'plan-30',
    customerReferenceCode: `cus-${kod}`,
    subscriptionStatus: durum,
    trialDays: deneme?.gun ?? 0,
    ...(deneme
      ? { trialStartDate: deneme.baslangic, trialEndDate: deneme.baslangic + deneme.gun * GUN }
      : {}),
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
    tutar: 1649, paraBirimi: 'TRY', iyzicoPlanKodu: 'plan-30', satistaMi: true,
  });
  const config = new ConfigService({ UYGULAMA_URL: 'https://ornek.test' });
  const abonelik = new AbonelikServisi(db.prisma, iyz.istemci);
  const mutabakat = new MutabakatJob(db.prisma, iyz.istemci, abonelik);
  const fatura = new FaturaServisi(db.prisma, MUHASEBE_YASAK, posta);
  const dunning = new DunningServisi(db.prisma, iyz.istemci, abonelik, posta, config);
  const isleyici = new WebhookIsleyici(db.prisma, abonelik, fatura, dunning);
  const erisim = new ErisimServisi(db.prisma);
  // Satın alma kapısının BAĞLANTI ölçümü: kapıdan sonraki ilk adım deneme
  // hakkı kararıdır. Sahtesi işaret bırakıp durur — kapıyı GEÇTİĞİ kanıtlanır,
  // formun geri kalanı bu paketin konusu değil.
  const kapiGecildi: string[] = [];
  const denemeHakki = {
    karar: async (p: { firmaId: string }) => {
      kapiGecildi.push(p.firmaId);
      throw new Error('KAPI_GECILDI');
    },
  } as any;
  const satinAlma = new SatinAlmaServisi(db.prisma, iyz.istemci, abonelik, config, denemeHakki, posta);

  /** Gerçek `baslat`: kapının kararı (red kodu) ya da kapıyı geçtiği. */
  async function satinAlmayiDene(firmaId: string): Promise<string> {
    try {
      await satinAlma.baslat({
        firmaId, kullaniciId: `U-${firmaId}`, paketSurumuId: 'S30', sozlesmeOnayi: true,
        musteri: {
          ad: 'Ada', soyad: 'Yılmaz', eposta: `sahip@${firmaId.toLowerCase()}.test`, telefon: '05321234567',
          kimlikNo: '10000000146', sehir: 'İstanbul', adres: 'Moda Cad. 1', vergiDairesi: 'Kadıköy',
        },
      });
      return 'BASLADI';
    } catch (e) {
      if (e instanceof Error && e.message === 'KAPI_GECILDI') return 'KAPI_GECILDI';
      const yanit = (e as { getResponse?: () => unknown }).getResponse?.() as { kod?: string } | undefined;
      return yanit?.kod ?? `BEKLENMEYEN: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

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

  const faturalar = (abonelikId: string) => db.tablo('fatura').filter((f) => f.abonelikId === abonelikId);
  const olaylar = (siparisKodu: string) =>
    db.tablo('webhookOlayi').filter((o) => o.siparisKodu === siparisKodu);
  const oynatilanlar = () => db.tablo('webhookOlayi').filter((o) => o.kaynak === MUTABAKAT_KAYNAGI);
  const durumOlaylari = (abonelikId: string) =>
    db.tablo('abonelikOlayi').filter((o) => o.abonelikId === abonelikId && o.tip === 'durum.degisti');

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
    db, iyz, giden, abonelik, mutabakat, isleyici, erisim, kartSatiri, islenmisTahsilat,
    faturalar, olaylar, oynatilanlar, durumOlaylari, geceyiKos, firmaEkle: firma,
    satinAlma, satinAlmayiDene, kapiGecildi,
  };
}

const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : String(t));

type Gunluk = { kayitlar: string[]; uyarilar: string[]; hatalar: string[] };

/** Gece özet satırı (`geceMutabakati` sonu). */
const ozet = (g: Gunluk) => g.kayitlar.find((m) => m.startsWith('Mutabakat bitti')) ?? '';

/**
 * Hata YOK ve uyarılar TAM OLARAK verilen siparişlerin yeniden oynatma
 * satırları — "hiç uyarı yok" demek artık yanlış olurdu (oynatma bilerek
 * uyarı yazar); fazladan uyarı ya da yutulan hata kırmızıdır.
 */
function yalnizOynatmaUyarisi(g: Gunluk, siparisKodlari: string[]): boolean {
  return (
    g.hatalar.length === 0 &&
    g.uyarilar.length === siparisKodlari.length &&
    siparisKodlari.every((kod) =>
      g.uyarilar.some((u) => u.startsWith('Kayıp tahsilat yeniden oynatıldı') && u.includes(` sipariş ${kod} `)),
    )
  );
}

const gunlukYaz = (g: Gunluk) => `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)}`;

// ═════════════════════════════════════════════════════════════════════════
//  S — SAF KURAL
// ═════════════════════════════════════════════════════════════════════════
function sBlogu(): void {
  console.log('\n── S · saf kural: odenmisSiparisMi · erisimiUzatanOdemeler ──');
  const T0 = 1_787_215_031_301; // 20.08 tutanağındaki startPeriod
  const odendi = (ek: Record<string, unknown> = {}) => ({
    ...siparis({ kod: 'o', durum: 'SUCCESS', bas: T0, son: T0 + 30 * GUN, denemeler: ['SUCCESS'] }),
    ...ek,
  });
  check('S1 ⭐ tutanak biçimi (orderStatus SUCCESS + paymentStatus SUCCESS) → ödenmiş',
    odenmisSiparisMi(odendi()) === true);
  check('S2 istemci tipindeki ad (paymentAttemptStatus) da okunur',
    odenmisSiparisMi({ orderStatus: 'SUCCESS', paymentAttempts: [{ paymentAttemptStatus: 'SUCCESS' }] }) === true);
  const red: Array<[string, unknown]> = [
    ['WAITING + deneme yok (20.08 TEST 2-dogrulama biçimi)', odendi({ orderStatus: 'WAITING', paymentAttempts: [] })],
    ['SUBSCRIPTION_UPGRADED (20.08 S2a biçimi)', odendi({ orderStatus: 'SUBSCRIPTION_UPGRADED', paymentAttempts: [] })],
    ['SUCCESS ama deneme dizisi BOŞ', odendi({ paymentAttempts: [] })],
    ['SUCCESS ama deneme alanı YOK', { orderStatus: 'SUCCESS' }],
    ['SUCCESS ama yalnız başarısız deneme', odendi({ paymentAttempts: [{ paymentStatus: 'FAILURE' }] })],
    ['deneme SUCCESS ama sipariş SUCCESS değil (örn. iade — değer ÖLÇÜLMEDİ)', odendi({ orderStatus: 'REFUNDED' })],
    ['küçük harf "success" (iyzico büyük harf yazar)', odendi({ orderStatus: 'success' })],
    ['null', null],
    ['dize', 'SUCCESS'],
  ];
  const gecen = red.filter(([, s]) => odenmisSiparisMi(s)).map(([ad]) => ad);
  check('S3 ⭐ kanıt olmayan 9 biçimin HİÇBİRİ ödenmiş sayılmaz', red.length === 9 && gecen.length === 0,
    `gecen=${gecen.join(' | ')}`);

  const sinir = new Date(T0 + 30 * GUN);
  // iyzico listesi YENİDEN ESKİYE: sonraki dönem WAITING, iki ödenmiş dönem, eski dönem.
  const liste = [
    siparis({ kod: 'o4', durum: 'WAITING', bas: T0 + 90 * GUN, son: T0 + 120 * GUN }),
    siparis({ kod: 'o3', durum: 'SUCCESS', bas: T0 + 60 * GUN, son: T0 + 90 * GUN, denemeler: ['SUCCESS'] }),
    siparis({ kod: 'o2', durum: 'SUCCESS', bas: T0 + 30 * GUN, son: String(T0 + 60 * GUN), denemeler: ['FAILURE', 'SUCCESS'] }),
    siparis({ kod: 'o1', durum: 'SUCCESS', bas: T0, son: T0 + 30 * GUN, denemeler: ['SUCCESS'] }),
    null,
    { orderStatus: 'SUCCESS', paymentAttempts: [{ paymentStatus: 'SUCCESS' }], endPeriod: T0 + 200 * GUN },
  ];
  const secilen = erisimiUzatanOdemeler(liste, sinir);
  check('S4 ⭐ yalnız erişimi UZATAN ödenmiş siparişler, ESKİDEN YENİYE (o2, o3); WAITING, sınırdaki o1 ve kodsuz kayıt yok',
    secilen.map((o) => o.siparisKodu).join(',') === 'o2,o3', `secilen=${secilen.map((o) => o.siparisKodu)}`);
  check('S5 rakam-DİZESİ dönem sonu doğru okundu (o2); ilk denemesi reddedilmiş sipariş de ödenmiş',
    secilen[0]?.donemSonu.getTime() === T0 + 60 * GUN && secilen[0]?.siparisKodu === 'o2',
    `o2=${iso(secilen[0]?.donemSonu)}`);
  check('S6 kanıt ham siparişle taşınır (olay kaydına yazılacak)',
    secilen[1]?.ham?.referenceCode === 'o3' && secilen[1]?.ham?.orderStatus === 'SUCCESS');
  check('S7 sınır: dönem sonu erisimSonu\'na EŞİT → uzatmaz (asla kısaltma/tekrar yok)',
    erisimiUzatanOdemeler([liste[3]], sinir).length === 0);
  check('S8 bozuk girdi: dizi değil / erisimSonu yok ya da geçersiz → boş (tahmin yok)',
    erisimiUzatanOdemeler(undefined, sinir).length === 0 &&
      erisimiUzatanOdemeler({ 0: liste[1] }, sinir).length === 0 &&
      erisimiUzatanOdemeler(liste, null).length === 0 &&
      erisimiUzatanOdemeler(liste, new Date('gecersiz')).length === 0);
}

// ═════════════════════════════════════════════════════════════════════════
//  T — SAF TARİH
// ═════════════════════════════════════════════════════════════════════════
function tBlogu(): void {
  console.log('\n── T · saf tarih: iyzicoTarihi ──');
  const ms = 1_789_893_431_301; // 20.08 tutanağındaki endPeriod
  check('T-OLCUT tuzak gerçek: new Date("<ms>") ve Date.parse(<ms>) geçersiz — dönüştürücü bu yüzden var',
    Number.isNaN(new Date(String(ms)).getTime()) && Number.isNaN(Date.parse(ms as unknown as string)));
  check('T1 ⭐ sayı (ölçülen biçim) → aynı an', iyzicoTarihi(ms)?.getTime() === ms);
  check('T2 ⭐ rakam-dizesi → aynı an (boşluklu da)',
    iyzicoTarihi(String(ms))?.getTime() === ms && iyzicoTarihi(` ${ms} `)?.getTime() === ms);
  check('T3 ISO dize → aynı an', iyzicoTarihi(new Date(ms).toISOString())?.getTime() === ms);
  const bos: unknown[] = [0, -5, NaN, Infinity, 1e20, '0', '', '   ', 'abc', '99999999999999999999', null, undefined, {}, true];
  const uyduran = bos.filter((v) => iyzicoTarihi(v) !== null).map((v) => String(v));
  check('T4 ⭐ çözülemeyen 14 değer → null (0/eksi/NaN/sonsuz/taşan sayı, "0", boş, metin, nesne)',
    bos.length === 14 && uyduran.length === 0, `uyduran=${uyduran.join(',')}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  Ö — ÖLÇÜT: webhook ALINIRSA aynı dünya istenen sonucu üretir (kör değil)
// ═════════════════════════════════════════════════════════════════════════
async function oBlogu(): Promise<void> {
  console.log('\n── Ö · ölçüt: webhook ALINIRSA yenileme erişimi uzatır ve faturayı kuyruğa alır ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const eskiSon = simdi - 8 * SAAT;
  const yeniSon = eskiSon + 30 * GUN;
  const ab = d.kartSatiri('F-O', 'sub-o', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
  d.islenmisTahsilat(ab, 'sub-o', 'ord-o1', eskiSon - 30 * GUN, eskiSon);
  d.iyz.detaylar.set('sub-o', iyzicoDetayi('sub-o', 'ACTIVE', [
    siparis({ kod: 'ord-o2', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }),
    siparis({ kod: 'ord-o1', durum: 'SUCCESS', bas: eskiSon - 30 * GUN, son: eskiSon, denemeler: ['SUCCESS'] }),
  ]));
  // iyzico'nun gönderdiği olay (webhook.controller `hamKaydet` biçimi).
  d.db.ekle('webhookOlayi', {
    tekilAnahtar: 'iyzico:subscription.order.success:iyz-ord-o2',
    olayTipi: 'subscription.order.success', hamGovde: {}, abonelikKodu: 'sub-o', siparisKodu: 'ord-o2',
  });
  const g = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
  check('Ö1 ⭐ webhook yolu: erisimSonu iyzico siparişinin dönem sonuna taşındı',
    ab.erisimSonu.getTime() === yeniSon, `erisimSonu=${iso(ab.erisimSonu)} beklenen=${iso(new Date(yeniSon))}`);
  const f = d.faturalar(ab.id).find((x) => x.tahsilatKodu === 'ord-o2');
  check('Ö2 ⭐ webhook yolu: fatura kuyruğa alındı (tahsilatKodu = sipariş, dönem = siparişin dönemi)',
    !!f && f.donemSonu.getTime() === yeniSon && f.donemBasi.getTime() === eskiSon,
    JSON.stringify(f ?? null));
  const k = await d.erisim.karar('F-O');
  check('Ö3 erişim açık, "doğrulanıyor" uyarısı yok', k.erisimVar === true && k.uyari === null,
    `erisim=${k.erisimVar} uyari=${k.uyari?.baslik}`);
  check('Ö4 hata/uyarı yazılmadı, olay işlendi',
    g.hatalar.length === 0 && g.uyarilar.length === 0 && d.olaylar('ord-o2')[0]?.islendi === true,
    `hatalar=${JSON.stringify(g.hatalar)} uyarilar=${JSON.stringify(g.uyarilar)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  A — AKTİF yenileme: tahsilat webhook'u KAYBOLDU
// ═════════════════════════════════════════════════════════════════════════
async function aBlogu(): Promise<void> {
  console.log('\n── A · AKTİF yenilemenin webhook\'u kayboldu → gece mutabakatı ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const eskiSon = simdi - 8 * SAAT; // yenileme 8 saat önce çekildi
  const yeniSon = eskiSon + 30 * GUN;
  const ab = d.kartSatiri('F-A', 'sub-a', { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
  d.islenmisTahsilat(ab, 'sub-a', 'ord-a1', eskiSon - 30 * GUN, eskiSon);
  d.iyz.detaylar.set('sub-a', iyzicoDetayi('sub-a', 'ACTIVE', [
    siparis({ kod: 'ord-a2', durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }),
    siparis({ kod: 'ord-a1', durum: 'SUCCESS', bas: eskiSon - 30 * GUN, son: eskiSon, denemeler: ['SUCCESS'] }),
  ]));

  const once = await d.erisim.karar('F-A');
  check('A-FIXTURE gece öncesi: ödeyen müşteri erişimsiz, "Abonelik döneminiz doğrulanıyor"',
    once.erisimVar === false && once.uyari?.baslik === 'Abonelik döneminiz doğrulanıyor',
    `erisim=${once.erisimVar} uyari=${once.uyari?.baslik}`);
  check('A-FIXTURE ord-a2 için webhook olayı YOK (kayboldu), faturası YOK',
    d.olaylar('ord-a2').length === 0 && !d.faturalar(ab.id).some((f) => f.tahsilatKodu === 'ord-a2'));

  const g = await d.geceyiKos();
  check('A1 ⭐ gece sonrası erisimSonu ödenmiş siparişin dönem sonu',
    ab.erisimSonu.getTime() === yeniSon, `erisimSonu=${iso(ab.erisimSonu)} beklenen=${iso(new Date(yeniSon))}`);
  const f = d.faturalar(ab.id).find((x) => x.tahsilatKodu === 'ord-a2');
  check('A2 ⭐ gece sonrası ord-a2 faturası kuyrukta', !!f, `faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
  const k = await d.erisim.karar('F-A');
  check('A3 ⭐ gece sonrası erişim açık, uyarı yok', k.erisimVar === true && k.uyari === null,
    `erisim=${k.erisimVar} uyari=${k.uyari?.baslik}`);
  check('A4 hata YOK; tek uyarı ord-a2\'nin yeniden oynatılması (yutulan hata A1-A3\'ü boşuna yeşil yapamaz)',
    yalnizOynatmaUyarisi(g, ['ord-a2']), gunlukYaz(g));

  // ── Nasıl oldu: TEK yol — webhook işleyicisi (BAĞLANTI) ──
  const oy = d.oynatilanlar();
  check('A5 ⭐ oynatılan olay: tek satır, kaynak mutabakat, başarılı tahsilat tipi, İŞLENDİ',
    oy.length === 1 && oy[0].olayTipi === 'subscription.order.success' && oy[0].islendi === true &&
      oy[0].abonelikKodu === 'sub-a' && oy[0].siparisKodu === 'ord-a2' && oy[0].hata === null,
    JSON.stringify(oy.map((o) => ({ tip: o.olayTipi, islendi: o.islendi, s: o.siparisKodu, hata: o.hata }))));
  check('A6 tekil anahtar sipariş başına sabit, imza yok, gövdede kaynak + iyzico\'nun kendi sipariş kaydı (kanıt)',
    oy[0]?.tekilAnahtar === 'mutabakat:subscription.order.success:ord-a2' && oy[0]?.imzaGecerli === false &&
      oy[0]?.musteriKodu === 'cus-sub-a' && oy[0]?.hamGovde?.kaynak === 'mutabakat' &&
      oy[0]?.hamGovde?.kanit?.orderStatus === 'SUCCESS' && oy[0]?.hamGovde?.kanit?.referenceCode === 'ord-a2',
    JSON.stringify(oy[0]?.hamGovde));
  check('A7 ⭐ BAĞLANTI: tahsilat yolu siparişi iyzico\'nun listesinde yeniden ARADI (sub-a iki kez soruldu: mutabakat + tahsilatBasarili; 24.09\'dan beri o yol da AYNI ödeme kanıtını ister — `test:webhook-tahsilat-dogrulama`)',
    d.iyz.sorulan.filter((kod) => kod === 'sub-a').length === 2, `sorulan=${d.iyz.sorulan}`);
  const durumOlayi = d.durumOlaylari(ab.id);
  check('A8 iz: durum olayı tahsilat yolundan (aktör webhook, sipariş ord-a2) — mutabakat durumu kendisi DEĞİŞTİRMEDİ',
    durumOlayi.length === 1 && durumOlayi[0].aktor === 'webhook' && durumOlayi[0].veri?.siparisKodu === 'ord-a2',
    JSON.stringify(durumOlayi.map((o) => ({ aktor: o.aktor, veri: o.veri }))));
  const f2 = d.faturalar(ab.id).find((x) => x.tahsilatKodu === 'ord-a2');
  check('A9 fatura dönemi siparişin dönemi; eski dönemin faturası TEKRAR kuyruğa girmedi',
    f2?.donemBasi?.getTime() === eskiSon && f2?.donemSonu?.getTime() === yeniSon &&
      d.faturalar(ab.id).filter((x) => x.tahsilatKodu === 'ord-a1').length === 1,
    `faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  D — Deneme SONRASI ilk çekim: webhook KAYBOLDU
// ═════════════════════════════════════════════════════════════════════════
async function dBlogu(): Promise<void> {
  console.log('\n── D · deneme sonrası ilk çekimin webhook\'u kayboldu → gece mutabakatı ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const baslangic = new Date(simdi - 31 * GUN); // deneme DÜN bitti, tampon yarın biter
  const { erisimSonu, denemeSonu } = donemTarihleriHesapla(baslangic, 30);
  const cekim = denemeSonu!.getTime() - 3 * DK; // iyzico kendi trialEndDate'inde çeker
  const yeniSon = cekim + 30 * GUN;
  const ab = d.kartSatiri('F-D', 'sub-d', { durum: 'DENEME', erisimSonu, denemeSonu });
  d.iyz.detaylar.set('sub-d', iyzicoDetayi('sub-d', 'ACTIVE', [
    siparis({ kod: 'ord-d1', durum: 'SUCCESS', bas: cekim, son: yeniSon, denemeler: ['SUCCESS'] }),
  ], { baslangic: baslangic.getTime() - 3 * DK, gun: 30 }));
  check('D-FIXTURE deneme BİTTİ (denemeSonu geçmişte), tampon sürüyor (erisimSonu ileride)',
    denemeSonu!.getTime() < simdi && erisimSonu.getTime() > simdi);

  const g = await d.geceyiKos();
  check('D1 ⭐ gece sonrası satır AKTIF ve erisimSonu ödenmiş siparişin dönem sonu',
    ab.durum === 'AKTIF' && ab.erisimSonu.getTime() === yeniSon,
    `durum=${ab.durum} erisimSonu=${iso(ab.erisimSonu)} beklenen=${iso(new Date(yeniSon))}`);
  check('D2 ⭐ ilk çekimin faturası kuyrukta', d.faturalar(ab.id).some((x) => x.tahsilatKodu === 'ord-d1'),
    `faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
  const ucGunSonra = await d.erisim.karar('F-D', new Date(simdi + 3 * GUN));
  check('D3 ⭐ tampon bittikten sonra (3 gün) erişim hâlâ açık', ucGunSonra.erisimVar === true,
    `erisim=${ucGunSonra.erisimVar} uyari=${ucGunSonra.uyari?.baslik}`);
  check('D4 hata YOK; tek uyarı ord-d1\'in yeniden oynatılması', yalnizOynatmaUyarisi(g, ['ord-d1']), gunlukYaz(g));
  const o = d.durumOlaylari(ab.id);
  check('D5 DENEME → AKTIF tahsilat yolundan (aktör webhook), mutabakatın çıplak terfisinden DEĞİL',
    o.length === 1 && o[0].oncekiDurum === 'DENEME' && o[0].yeniDurum === 'AKTIF' && o[0].aktor === 'webhook',
    JSON.stringify(o.map((x) => ({ onceki: x.oncekiDurum, yeni: x.yeniDurum, aktor: x.aktor }))));
}

// ═════════════════════════════════════════════════════════════════════════
//  B — ÖDEME BEKLİYOR: yeniden deneme tuttu, webhook KAYBOLDU
// ═════════════════════════════════════════════════════════════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · ödeme bekleyen müşterinin toparlanma webhook\'u kayboldu → gece mutabakatı ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const donemBasi = simdi - 4 * GUN; // yenileme 4 gün önce reddedildi
  const yeniSon = donemBasi + 30 * GUN;
  const ab = d.kartSatiri('F-B', 'sub-b', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(donemBasi), ilkBasarisizlik: new Date(donemBasi),
    sonDeneme: new Date(simdi - GUN), denemeSayisi: 2, iyzicoDurum: 'UNPAID',
  });
  d.islenmisTahsilat(ab, 'sub-b', 'ord-b1', donemBasi - 30 * GUN, donemBasi);
  d.iyz.detaylar.set('sub-b', iyzicoDetayi('sub-b', 'ACTIVE', [
    // Dün tutan yeniden deneme: ilk deneme reddedildi, ikincisi başarılı.
    siparis({ kod: 'ord-b2', durum: 'SUCCESS', bas: donemBasi, son: yeniSon, denemeler: ['FAILURE', 'FAILURE', 'SUCCESS'] }),
    siparis({ kod: 'ord-b1', durum: 'SUCCESS', bas: donemBasi - 30 * GUN, son: donemBasi, denemeler: ['SUCCESS'] }),
  ]));
  const once = await d.erisim.karar('F-B');
  check('B-FIXTURE gece öncesi: tolerans — erişim TAM açık (ODEME_BEKLIYOR erisimSonu\'na bakmaz)',
    once.durum === 'ODEME_BEKLIYOR' && once.erisimVar === true && once.saltOkunur === false,
    `durum=${once.durum} erisim=${once.erisimVar}`);

  const g = await d.geceyiKos();
  const k = await d.erisim.karar('F-B');
  check('B1 ⭐⭐ gece sonrası erişim KAPANMADI (ödeyen müşteri mutabakatla kilitlenmez)',
    k.erisimVar === true, `durum=${k.durum} erisim=${k.erisimVar} uyari=${k.uyari?.baslik}`);
  check('B2 ⭐ satır AKTIF, erisimSonu ödenmiş siparişin dönem sonu',
    ab.durum === 'AKTIF' && ab.erisimSonu.getTime() === yeniSon,
    `durum=${ab.durum} erisimSonu=${iso(ab.erisimSonu)} beklenen=${iso(new Date(yeniSon))}`);
  check('B3 ⭐ dunning sayaçları sıfırlandı (ilkBasarisizlik boş, denemeSayisi 0)',
    ab.ilkBasarisizlik === null && ab.denemeSayisi === 0,
    `ilk=${iso(ab.ilkBasarisizlik)} deneme=${ab.denemeSayisi}`);
  check('B4 ⭐ ord-b2 faturası kuyrukta', d.faturalar(ab.id).some((x) => x.tahsilatKodu === 'ord-b2'),
    `faturalar=${d.faturalar(ab.id).map((x) => x.tahsilatKodu)}`);
  check('B5 hata YOK; tek uyarı ord-b2\'nin yeniden oynatılması', yalnizOynatmaUyarisi(g, ['ord-b2']), gunlukYaz(g));
}

// ═════════════════════════════════════════════════════════════════════════
//  W — Deneme SÜRERKEN ödenmiş sipariş: kanıt deneme kuralından önce gelir
// ═════════════════════════════════════════════════════════════════════════
async function wBlogu(): Promise<void> {
  console.log('\n── W · deneme sürerken ödenmiş sipariş: kanıt deneme kuralından ÖNCE ──');
  const d = dunyaKur();
  const simdi = Date.now();
  // iyzico denemeyi KENDİ trialEndDate'inde bitirip çeker; bizim denemeSonu
  // niyet sonuçlanınca hesaplandığı için birkaç dakika SONRA olabilir
  // (`mutabakat-deneme-test.ts` W bloğu ile aynı senaryo).
  const baslangic = new Date(simdi - 30 * GUN + 5 * DK);
  const { erisimSonu, denemeSonu } = donemTarihleriHesapla(baslangic, 30);
  const cekim = simdi - DK;
  const ab = d.kartSatiri('F-W', 'sub-w', { durum: 'DENEME', erisimSonu, denemeSonu });
  d.iyz.detaylar.set('sub-w', iyzicoDetayi('sub-w', 'ACTIVE', [
    siparis({ kod: 'ord-w1', durum: 'SUCCESS', bas: cekim, son: cekim + 30 * GUN, denemeler: ['SUCCESS'] }),
  ], { baslangic: baslangic.getTime() - 6 * DK, gun: 30 }));
  check('W-FIXTURE bizim denemeSonu hâlâ İLERİDE (deneme kuralı bu satırı korurdu)',
    denemeSonu!.getTime() > simdi, `denemeSonu=${iso(denemeSonu)}`);

  const g = await d.geceyiKos();
  check('W1 ⭐ ödenmiş sipariş yeniden oynatıldı → AKTIF, erisimSonu dönem sonu, fatura kuyrukta',
    ab.durum === 'AKTIF' && ab.erisimSonu.getTime() === cekim + 30 * GUN &&
      d.faturalar(ab.id).some((x) => x.tahsilatKodu === 'ord-w1'),
    `durum=${ab.durum} erisimSonu=${iso(ab.erisimSonu)}`);
  check('W2 özet: deneme kuralı bu satırı SAYMADI (0), oynatma 1', ozet(g).includes("deneme sürdüğü için AKTIF'e çekilmeyen: 0") &&
    ozet(g).includes('kayıp tahsilat yeniden oynatılan: 1'), `ozet="${ozet(g)}"`);
  check('W3 hata YOK; tek uyarı ord-w1\'in yeniden oynatılması', yalnizOynatmaUyarisi(g, ['ord-w1']), gunlukYaz(g));
}

// ═════════════════════════════════════════════════════════════════════════
//  N — NEGATİFLER: kanıt yok → dokunma · kanıtsız ACTIVE terfi ettirmez
// ═════════════════════════════════════════════════════════════════════════
async function nBlogu(): Promise<void> {
  console.log('\n── N · kanıt olmadan hiçbir şey oynatılmaz; erişim kısalmaz ──');
  const d = dunyaKur();
  const simdi = Date.now();
  // N1 — dönem ortası: ödenmiş dönem sürüyor, sonraki dönemin siparişi WAITING
  // (⚠ ACTIVE abonelikte önceden açılmış WAITING siparişi ÖLÇÜLMEDİ; 20.08'de
  // UPGRADED abonelikte önceden açılmış gelecek sipariş GÖZLENDİ).
  const n1Son = simdi + 10 * GUN;
  const n1 = d.kartSatiri('F-N1', 'sub-n1', { durum: 'AKTIF', erisimSonu: new Date(n1Son) });
  d.iyz.detaylar.set('sub-n1', iyzicoDetayi('sub-n1', 'ACTIVE', [
    siparis({ kod: 'ord-n1b', durum: 'WAITING', bas: n1Son, son: n1Son + 30 * GUN }),
    siparis({ kod: 'ord-n1a', durum: 'SUCCESS', bas: n1Son - 30 * GUN, son: n1Son, denemeler: ['SUCCESS'] }),
  ]));
  // N2 — deneme BAŞARILI ama sipariş SUCCESS değil (örn. iade; değer ÖLÇÜLMEDİ).
  const n2Son = simdi - 2 * SAAT;
  const n2 = d.kartSatiri('F-N2', 'sub-n2', { durum: 'AKTIF', erisimSonu: new Date(n2Son) });
  d.iyz.detaylar.set('sub-n2', iyzicoDetayi('sub-n2', 'ACTIVE', [
    siparis({ kod: 'ord-n2', durum: 'REFUNDED', bas: n2Son, son: n2Son + 30 * GUN, denemeler: ['SUCCESS'] }),
  ]));
  // N3 — sipariş SUCCESS ama başarılı ödeme denemesi YOK (boş / yalnız ret).
  const n3Son = simdi - 3 * SAAT;
  const n3 = d.kartSatiri('F-N3', 'sub-n3', { durum: 'AKTIF', erisimSonu: new Date(n3Son) });
  d.iyz.detaylar.set('sub-n3', iyzicoDetayi('sub-n3', 'ACTIVE', [
    siparis({ kod: 'ord-n3b', durum: 'SUCCESS', bas: n3Son, son: n3Son + 31 * GUN, denemeler: ['FAILURE'] }),
    siparis({ kod: 'ord-n3a', durum: 'SUCCESS', bas: n3Son, son: n3Son + 30 * GUN, denemeler: [] }),
  ]));
  // N4 — iyzico UNPAID: bir önceki yenileme ödenmiş (webhook'u kaybolmuş),
  // sonraki (10 gün önce) reddedilmiş. Kanıt yalnız ACTIVE'de aranır (bilinen sınır).
  const n4Son = simdi - 40 * GUN;
  const n4 = d.kartSatiri('F-N4', 'sub-n4', { durum: 'AKTIF', erisimSonu: new Date(n4Son), iyzicoDurum: 'ACTIVE' });
  d.iyz.detaylar.set('sub-n4', iyzicoDetayi('sub-n4', 'UNPAID', [
    siparis({ kod: 'ord-n4b', durum: 'FAILED', bas: n4Son + 30 * GUN, son: n4Son + 60 * GUN, denemeler: ['FAILURE'] }),
    siparis({ kod: 'ord-n4a', durum: 'SUCCESS', bas: n4Son, son: n4Son + 30 * GUN, denemeler: ['SUCCESS'] }),
  ]));
  // N5 — webhook İŞLENMİŞ (dönem sonu = erisimSonu) + daha eski ödenmiş dönem.
  const n5Son = simdi + 5 * GUN;
  const n5 = d.kartSatiri('F-N5', 'sub-n5', { durum: 'AKTIF', erisimSonu: new Date(n5Son) });
  d.iyz.detaylar.set('sub-n5', iyzicoDetayi('sub-n5', 'ACTIVE', [
    siparis({ kod: 'ord-n5b', durum: 'SUCCESS', bas: n5Son - 30 * GUN, son: n5Son, denemeler: ['SUCCESS'] }),
    siparis({ kod: 'ord-n5a', durum: 'SUCCESS', bas: n5Son - 60 * GUN, son: n5Son - 30 * GUN, denemeler: ['SUCCESS'] }),
  ]));

  const g = await d.geceyiKos();
  check('N1 ⭐ dönem ortası + sonraki WAITING: oynatma yok, erisimSonu aynı', n1.erisimSonu.getTime() === n1Son &&
    n1.durum === 'AKTIF', `erisimSonu=${iso(n1.erisimSonu)}`);
  check('N2 ⭐ sipariş SUCCESS değilse (deneme başarılı olsa da) oynatma yok', n2.erisimSonu.getTime() === n2Son,
    `erisimSonu=${iso(n2.erisimSonu)}`);
  check('N3 ⭐ başarılı ödeme denemesi yoksa (SUCCESS sipariş olsa da) oynatma yok', n3.erisimSonu.getTime() === n3Son,
    `erisimSonu=${iso(n3.erisimSonu)}`);
  check('N4 ⭐ UNPAID\'de oynatma yok; eski yol: AKTIF → ODEME_BEKLIYOR + ilkBasarisizlik',
    n4.durum === 'ODEME_BEKLIYOR' && n4.ilkBasarisizlik instanceof Date && n4.erisimSonu.getTime() === n4Son,
    `durum=${n4.durum} ilk=${iso(n4.ilkBasarisizlik)}`);
  check('N5 ⭐ işlenmiş dönem (sınır =) ve eski dönem: oynatma yok, erisimSonu KISALMADI', n5.erisimSonu.getTime() === n5Son,
    `erisimSonu=${iso(n5.erisimSonu)}`);
  check('N6 ⭐ hiçbir WebhookOlayi yazılmadı, hiçbir fatura kuyruğa girmedi',
    d.oynatilanlar().length === 0 && d.db.tablo('webhookOlayi').length === 0 && d.db.tablo('fatura').length === 0,
    `olay=${d.db.tablo('webhookOlayi').map((o) => o.siparisKodu)} fatura=${d.db.tablo('fatura').map((f) => f.tahsilatKodu)}`);
  check('N7 hata/uyarı yok', g.hatalar.length === 0 && g.uyarilar.length === 0, gunlukYaz(g));

  console.log('\n── N · kanıtsız ACTIVE AKTIF\'e çekmez (IPTAL → AKTIF hariç) ──');
  const k = dunyaKur();
  const bitenBaslangic = new Date(simdi - 31 * GUN);
  const bitenTarih = donemTarihleriHesapla(bitenBaslangic, 30);
  const biten = k.kartSatiri('F-K1', 'sub-k1', { durum: 'DENEME', ...bitenTarih });
  const gecmis = new Date(simdi - 4 * GUN);
  const bekleyen = k.kartSatiri('F-K2', 'sub-k2', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: gecmis, ilkBasarisizlik: gecmis, denemeSayisi: 2, iyzicoDurum: 'UNPAID',
  });
  const kisitli = k.kartSatiri('F-K3', 'sub-k3', {
    durum: 'KISITLI', erisimSonu: new Date(simdi - 12 * GUN), ilkBasarisizlik: new Date(simdi - 12 * GUN),
    kisitlandi: new Date(simdi - 2 * GUN), denemeSayisi: 4, iyzicoDurum: 'UNPAID',
  });
  const askida = k.kartSatiri('F-K4', 'sub-k4', {
    durum: 'ASKIDA', erisimSonu: new Date(simdi - 35 * GUN), ilkBasarisizlik: new Date(simdi - 35 * GUN),
    denemeSayisi: 6, iyzicoDurum: 'UNPAID',
  });
  const iptalSon = simdi + 9 * GUN;
  const iptal = k.kartSatiri('F-K5', 'sub-k5', { durum: 'IPTAL', erisimSonu: new Date(iptalSon), iyzicoDurum: 'CANCELED' });
  // Hepsinde iyzico ACTIVE; ödenmiş sipariş ya yok ya da erişimi uzatmıyor.
  k.iyz.detaylar.set('sub-k1', iyzicoDetayi('sub-k1', 'ACTIVE', [], { baslangic: bitenBaslangic.getTime(), gun: 30 }));
  k.iyz.detaylar.set('sub-k2', iyzicoDetayi('sub-k2', 'ACTIVE', [
    siparis({ kod: 'ord-k2', durum: 'SUCCESS', bas: gecmis.getTime() - 30 * GUN, son: gecmis.getTime(), denemeler: ['SUCCESS'] }),
  ]));
  k.iyz.detaylar.set('sub-k3', iyzicoDetayi('sub-k3', 'ACTIVE', []));
  k.iyz.detaylar.set('sub-k4', iyzicoDetayi('sub-k4', 'ACTIVE', []));
  k.iyz.detaylar.set('sub-k5', iyzicoDetayi('sub-k5', 'ACTIVE', []));
  const once = {
    bekleyen: await k.erisim.karar('F-K2'),
    kisitli: await k.erisim.karar('F-K3'),
    askida: await k.erisim.karar('F-K4'),
  };

  const gk = await k.geceyiKos();
  check('N8 ⭐ deneme bitmiş DENEME + çıplak ACTIVE → DENEME kalır (çekimin kanıtı yok)',
    biten.durum === 'DENEME' && k.durumOlaylari(biten.id).length === 0, `durum=${biten.durum}`);
  const sonra = {
    bekleyen: await k.erisim.karar('F-K2'),
    kisitli: await k.erisim.karar('F-K3'),
    askida: await k.erisim.karar('F-K4'),
  };
  check('N9 ⭐⭐ ODEME_BEKLIYOR + çıplak ACTIVE → ODEME_BEKLIYOR kalır, erişim AÇIK kalır (eski hâlde KİLİTLENİYORDU)',
    bekleyen.durum === 'ODEME_BEKLIYOR' && once.bekleyen.erisimVar === true && sonra.bekleyen.erisimVar === true &&
      bekleyen.ilkBasarisizlik instanceof Date, `durum=${bekleyen.durum} erisim=${sonra.bekleyen.erisimVar}`);
  check('N10 ⭐ KISITLI ve ASKIDA + çıplak ACTIVE → yerinde; erişim kararı AYNI (salt-okunur / kapalı)',
    kisitli.durum === 'KISITLI' && askida.durum === 'ASKIDA' &&
      sonra.kisitli.erisimVar === once.kisitli.erisimVar && sonra.kisitli.saltOkunur === true &&
      sonra.askida.erisimVar === false && once.askida.erisimVar === false,
    `kisitli=${kisitli.durum}/${sonra.kisitli.saltOkunur} askida=${askida.durum}`);
  const iptalOlayi = k.durumOlaylari(iptal.id)[0];
  check('N11 ⭐ İSTİSNA: IPTAL + ACTIVE → AKTIF (müşteri vazgeçti), erisimSonu aynı, aktör mutabakat',
    iptal.durum === 'AKTIF' && iptal.erisimSonu.getTime() === iptalSon && iptalOlayi?.aktor === 'mutabakat',
    `durum=${iptal.durum} olay=${JSON.stringify(iptalOlayi ?? null)}`);
  check('N12 özet: "Değişen: 1" (yalnız IPTAL) · kanıtsız 4 · oynatma 0 · deneme 0',
    ozet(gk).includes('Değişen: 1 ') && ozet(gk).includes("kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 4") &&
      ozet(gk).includes('kayıp tahsilat yeniden oynatılan: 0') &&
      ozet(gk).includes("deneme sürdüğü için AKTIF'e çekilmeyen: 0"), `ozet="${ozet(gk)}"`);
  check('N13 hata/uyarı yok, olay/fatura yok', gk.hatalar.length === 0 && gk.uyarilar.length === 0 &&
    k.db.tablo('webhookOlayi').length === 0 && k.db.tablo('fatura').length === 0, gunlukYaz(gk));
}

// ═════════════════════════════════════════════════════════════════════════
//  İ — TEKRARLANABİLİRLİK
// ═════════════════════════════════════════════════════════════════════════
/** A bloğunun dünyası: AKTİF yenileme ord-2, webhook'u kaybolmuş. */
function kayipYenilemeDunyasi(firmaId: string, kod: string) {
  const d = dunyaKur();
  const simdi = Date.now();
  const eskiSon = simdi - 8 * SAAT;
  const yeniSon = eskiSon + 30 * GUN;
  const ab = d.kartSatiri(firmaId, kod, { durum: 'AKTIF', erisimSonu: new Date(eskiSon) });
  d.islenmisTahsilat(ab, kod, `${kod}-ord-1`, eskiSon - 30 * GUN, eskiSon);
  const detay = iyzicoDetayi(kod, 'ACTIVE', [
    siparis({ kod: `${kod}-ord-2`, durum: 'SUCCESS', bas: eskiSon, son: yeniSon, denemeler: ['SUCCESS'] }),
    siparis({ kod: `${kod}-ord-1`, durum: 'SUCCESS', bas: eskiSon - 30 * GUN, son: eskiSon, denemeler: ['SUCCESS'] }),
  ]);
  d.iyz.detaylar.set(kod, detay);
  return { d, ab, eskiSon, yeniSon, detay, siparis2: `${kod}-ord-2` };
}

async function iBlogu(): Promise<void> {
  console.log('\n── İ · ikinci gece + geç gelen GERÇEK webhook ──');
  {
    const { d, ab, yeniSon, siparis2 } = kayipYenilemeDunyasi('F-I1', 'sub-i1');
    await d.geceyiKos();
    const ikinci = await d.geceyiKos();
    check('İ1 ⭐ ikinci gece: yeni olay yok, yeni fatura yok, özet "yeniden oynatılan: 0", uyarı yok',
      d.olaylar(siparis2).length === 1 && d.faturalar(ab.id).filter((f) => f.tahsilatKodu === siparis2).length === 1 &&
        ozet(ikinci).includes('kayıp tahsilat yeniden oynatılan: 0') && ikinci.uyarilar.length === 0 &&
        ikinci.hatalar.length === 0 && ab.erisimSonu.getTime() === yeniSon,
      `olay=${d.olaylar(siparis2).length} ozet="${ozet(ikinci)}" ${gunlukYaz(ikinci)}`);

    // iyzico'nun kendi tekrarı geç geldi (ör. kesinti bitti): GERÇEK olay.
    d.db.ekle('webhookOlayi', {
      tekilAnahtar: `iyzico:subscription.order.success:iyz-${siparis2}`,
      olayTipi: 'subscription.order.success', hamGovde: {}, abonelikKodu: 'sub-i1', siparisKodu: siparis2,
    });
    const gec = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    check('İ2 ⭐ geç gelen gerçek webhook da işlendi ama İKİNCİ fatura YOK (tahsilatKodu tekil), erişim aynı',
      d.olaylar(siparis2).length === 2 && d.olaylar(siparis2).every((o) => o.islendi === true) &&
        d.faturalar(ab.id).filter((f) => f.tahsilatKodu === siparis2).length === 1 &&
        ab.erisimSonu.getTime() === yeniSon && gec.hatalar.length === 0,
      `olaylar=${JSON.stringify(d.olaylar(siparis2).map((o) => [o.kaynak, o.islendi]))} ${gunlukYaz(gec)}`);
  }

  console.log('\n── İ · oynatılan olay işlenemedi (5 deneme) → sonraki gece YENİDEN KURULUR, ikinci olay yazılmaz ──');
  {
    const { d, ab, eskiSon, yeniSon, detay, siparis2 } = kayipYenilemeDunyasi('F-I3', 'sub-i3');
    // Gece: mutabakat olayı yazar; o sırada iyzico siparişi listesinden
    // düşürmüş olsun (tahsilat yolu doğrulayamaz → olay hata alır). Gerçekte:
    // 03:30'da iyzico'nun kısa bir kesintisi ya da liste gecikmesi.
    await gunluguTopla(() => d.mutabakat.geceMutabakati());
    d.iyz.detaylar.set('sub-i3', { ...detay, orders: detay.orders.slice(1) });
    for (let i = 0; i < 6; i++) await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    const olu = d.oynatilanlar()[0];
    check('İ3-FIXTURE oynatılan olay 5 denemede işlenemedi (ölü), erişim uzamadı',
      d.oynatilanlar().length === 1 && olu?.islendi === false && olu?.denemeSayisi === 5 &&
        String(olu?.hata).includes('doğrulanamadı') && ab.erisimSonu.getTime() === eskiSon,
      `olay=${JSON.stringify({ islendi: olu?.islendi, deneme: olu?.denemeSayisi, hata: olu?.hata })}`);
    d.iyz.detaylar.set('sub-i3', detay); // sipariş listede yeniden görünür
    const g = await gunluguTopla(() => d.mutabakat.geceMutabakati());
    check('İ3 ⭐ sonraki gece: İKİNCİ olay YAZILMADI; ölü olay YENİDEN KURULDU (deneme 0, hata temiz)',
      d.oynatilanlar().length === 1 && olu.denemeSayisi === 0 && olu.hata === null && olu.islendi === false &&
        g.hatalar.length === 0 && ozet(g).includes('kayıp tahsilat yeniden oynatılan: 0'),
      `oynatilan=${d.oynatilanlar().length} deneme=${olu.denemeSayisi} hata=${olu.hata} ozet="${ozet(g)}" ${gunlukYaz(g)}`);
    check('İ4 ... ve SESSİZ değil: "YENİDEN KURULDU" uyarısı sipariş koduyla + sıfırlanan SON HATA (teşhis kaybolmaz)',
      g.uyarilar.length === 1 && g.uyarilar[0].includes('YENİDEN KURULDU') && g.uyarilar[0].includes(siparis2) &&
        g.uyarilar[0].includes('son hata:') && g.uyarilar[0].includes('doğrulanamadı'),
      gunlukYaz(g));
    const isle = await gunluguTopla(() => d.isleyici.bekleyenleriIsle());
    check('İ5 ⭐ yeniden kurulan olay işlendi: erisimSonu dönem sonu, fatura kuyrukta (ödeme kaybolmadı)',
      olu.islendi === true && ab.erisimSonu.getTime() === yeniSon &&
        d.faturalar(ab.id).filter((f) => f.tahsilatKodu === siparis2).length === 1 && isle.hatalar.length === 0,
      `islendi=${olu.islendi} erisimSonu=${iso(ab.erisimSonu)} ${gunlukYaz(isle)}`);

    // İşlenmiş olay + erişim yine kısa (dışarıdan geri çekilmiş): yeniden
    // KURULMAZ (işlenmiş), yalnız uyarı — elle bakılır.
    ab.erisimSonu = new Date(eskiSon);
    const g2 = await gunluguTopla(() => d.mutabakat.geceMutabakati());
    check('İ6 işlenmiş olay yeniden kurulmaz; "erişim hâlâ uzamadı" uyarısı, ikinci olay yok',
      d.oynatilanlar().length === 1 && olu.islendi === true && g2.hatalar.length === 0 && g2.uyarilar.length === 1 &&
        g2.uyarilar[0].includes('erişim hâlâ uzamadı') && g2.uyarilar[0].includes(siparis2),
      gunlukYaz(g2));
  }

  console.log('\n── İ · iş bir dönem koşmadı: iki kayıp sipariş → yalnız EN YENİSİ, eskisi için uyarı ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const T0 = simdi - 35 * GUN;
    const ab = d.kartSatiri('F-I5', 'sub-i5', { durum: 'AKTIF', erisimSonu: new Date(T0) });
    // iyzico listesi YENİDEN ESKİYE (20.08 S2a-dogrulama sırası).
    d.iyz.detaylar.set('sub-i5', iyzicoDetayi('sub-i5', 'ACTIVE', [
      siparis({ kod: 'ord-i5c', durum: 'WAITING', bas: T0 + 60 * GUN, son: T0 + 90 * GUN }),
      siparis({ kod: 'ord-i5b', durum: 'SUCCESS', bas: T0 + 30 * GUN, son: T0 + 60 * GUN, denemeler: ['SUCCESS'] }),
      siparis({ kod: 'ord-i5a', durum: 'SUCCESS', bas: T0, son: T0 + 30 * GUN, denemeler: ['SUCCESS'] }),
    ]));
    const g = await d.geceyiKos();
    check('İ7 ⭐ yalnız en yeni ödenmiş sipariş (ord-i5b) oynatıldı; erisimSonu onun dönem sonu',
      d.oynatilanlar().map((o) => o.siparisKodu).join(',') === 'ord-i5b' && ab.erisimSonu.getTime() === T0 + 60 * GUN,
      `oynatilan=${d.oynatilanlar().map((o) => o.siparisKodu)} erisimSonu=${iso(ab.erisimSonu)}`);
    const eskiUyari = g.uyarilar.find((u) => u.startsWith('Kayıp tahsilat: abonelik'));
    check('İ8 ⭐ eski kayıp sipariş (ord-i5a) SESSİZ kalmadı: "elle fatura gerekir" uyarısı; faturası kuyrukta DEĞİL',
      !!eskiUyari && eskiUyari.includes('ord-i5a') && eskiUyari.includes('elle fatura') &&
        !d.faturalar(ab.id).some((f) => f.tahsilatKodu === 'ord-i5a') && g.hatalar.length === 0 && g.uyarilar.length === 2,
      gunlukYaz(g));
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  G — GECE TARAMASI (cron giriş noktası): özet satırı, sayaçlar, BAĞLANTI
// ═════════════════════════════════════════════════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G · gece taraması (cron giriş noktası) — özet satırı ve BAĞLANTI ──');
  const d = dunyaKur();
  const simdi = Date.now();
  // g1 — AKTİF yenileme kayboldu
  const g1Eski = simdi - 6 * SAAT;
  const g1 = d.kartSatiri('F-G1', 'sub-g1', { durum: 'AKTIF', erisimSonu: new Date(g1Eski) });
  d.iyz.detaylar.set('sub-g1', iyzicoDetayi('sub-g1', 'ACTIVE', [
    siparis({ kod: 'ord-g1', durum: 'SUCCESS', bas: g1Eski, son: g1Eski + 30 * GUN, denemeler: ['SUCCESS'] }),
  ]));
  // g2 — deneme sonrası ilk çekim kayboldu
  const g2Bas = new Date(simdi - 31 * GUN);
  const g2 = d.kartSatiri('F-G2', 'sub-g2', { durum: 'DENEME', ...donemTarihleriHesapla(g2Bas, 30) });
  const g2Cekim = g2.denemeSonu.getTime() - 2 * DK;
  d.iyz.detaylar.set('sub-g2', iyzicoDetayi('sub-g2', 'ACTIVE', [
    siparis({ kod: 'ord-g2', durum: 'SUCCESS', bas: g2Cekim, son: g2Cekim + 30 * GUN, denemeler: ['SUCCESS'] }),
  ], { baslangic: g2Bas.getTime() - 2 * DK, gun: 30 }));
  // g3 — deneme sürüyor (mutabakat-deneme kuralı)
  const g3Bas = new Date(simdi - 3 * GUN);
  const g3 = d.kartSatiri('F-G3', 'sub-g3', { durum: 'DENEME', ...donemTarihleriHesapla(g3Bas, 30) });
  d.iyz.detaylar.set('sub-g3', iyzicoDetayi('sub-g3', 'ACTIVE', [], { baslangic: g3Bas.getTime(), gun: 30 }));
  // g4 — ödeme bekliyor, çıplak ACTIVE (kanıtsız)
  const g4 = d.kartSatiri('F-G4', 'sub-g4', {
    durum: 'ODEME_BEKLIYOR', erisimSonu: new Date(simdi - 2 * GUN), ilkBasarisizlik: new Date(simdi - 2 * GUN),
    denemeSayisi: 1, iyzicoDurum: 'UNPAID',
  });
  d.iyz.detaylar.set('sub-g4', iyzicoDetayi('sub-g4', 'ACTIVE', []));
  // g5 — iyzico panelinden iptal (CANCELED) → IPTAL: GERÇEK değişim.
  // ⚠ `endDate` BİLEREK yok: CANCELED'daki anlamı (dönem sonu mu, iptal anı
  // mı) ÖLÇÜLMEDİ; fixture uydurursa İPTAL dalının davranışını kilitlerdi.
  const g5Son = simdi + 20 * GUN;
  const g5 = d.kartSatiri('F-G5', 'sub-g5', { durum: 'AKTIF', erisimSonu: new Date(g5Son) });
  d.iyz.detaylar.set('sub-g5', iyzicoDetayi('sub-g5', 'CANCELED', []));
  // g6 — havale (iyzico'ya sorulmaz)
  d.firmaEkle('F-G6');
  const g6 = d.db.ekle('abonelik', {
    firmaId: 'F-G6', paketSurumuId: 'S30', durum: 'AKTIF', erisimSonu: new Date(simdi - GUN), odemeYontemi: 'HAVALE',
  });

  const gece = await d.geceyiKos();
  check('G1 ⭐ BAĞLANTI: cron giriş noktası iki kayıp tahsilatı oynattı, işleyici uyguladı (g1, g2 AKTIF + dönem sonu)',
    g1.durum === 'AKTIF' && g1.erisimSonu.getTime() === g1Eski + 30 * GUN &&
      g2.durum === 'AKTIF' && g2.erisimSonu.getTime() === g2Cekim + 30 * GUN,
    `g1=${g1.durum}/${iso(g1.erisimSonu)} g2=${g2.durum}/${iso(g2.erisimSonu)}`);
  check('G2 g3 (deneme sürüyor) DENEME, g4 (kanıtsız) ODEME_BEKLIYOR, g5 IPTAL (erisimSonu aynı), g6 (havale) dokunulmadı',
    g3.durum === 'DENEME' && g4.durum === 'ODEME_BEKLIYOR' && g5.durum === 'IPTAL' &&
      g5.erisimSonu.getTime() === g5Son && g6.durum === 'AKTIF',
    `g3=${g3.durum} g4=${g4.durum} g5=${g5.durum}/${iso(g5.erisimSonu)} g6=${g6.durum}`);
  const sorulan = [...new Set(d.iyz.sorulan)].sort().join(',');
  check('G3 BAĞLANTI: beş kart aboneliği soruldu, havale sorulmadı', sorulan === 'sub-g1,sub-g2,sub-g3,sub-g4,sub-g5',
    `sorulan=${sorulan}`);
  check('G4 ⭐ faturalar: yalnız iki oynatılan sipariş', d.db.tablo('fatura').map((f) => f.tahsilatKodu).sort().join(',') ===
    'ord-g1,ord-g2', `fatura=${d.db.tablo('fatura').map((f) => f.tahsilatKodu)}`);
  const ozet1 = ozet(gece);
  check('G5 ⭐ özet (deploy sonrası ölçüm): "Değişen: 1 · deneme …: 1 · kayıp tahsilat yeniden oynatılan: 2 · kanıtsız …: 1"',
    ozet1 === "Mutabakat bitti. Değişen: 1 · deneme sürdüğü için AKTIF'e çekilmeyen: 1 · " +
      "kayıp tahsilat yeniden oynatılan: 2 · kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 1", `ozet="${ozet1}"`);
  check('G6 hata YOK; uyarılar TAM OLARAK iki oynatma', yalnizOynatmaUyarisi(gece, ['ord-g1', 'ord-g2']), gunlukYaz(gece));

  // İkinci gece AYNI iş örneğiyle: sayaçlar sıfırlanmazsa birikir, ölçüm yalan söyler.
  const ikinci = await d.geceyiKos();
  check('G7 ⭐ ikinci gece: "Değişen: 0 · …: 1 · …oynatılan: 0 · kanıtsız …: 1" (sayaçlar her gece sıfırlanır)',
    ozet(ikinci) === "Mutabakat bitti. Değişen: 0 · deneme sürdüğü için AKTIF'e çekilmeyen: 1 · " +
      "kayıp tahsilat yeniden oynatılan: 0 · kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 1" &&
      ikinci.hatalar.length === 0 && ikinci.uyarilar.length === 0,
    `ozet="${ozet(ikinci)}" ${gunlukYaz(ikinci)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  K — KORUMA (Emre 24.09 "kural kalsın, koruma ekle"): iyzico'da hâlâ
//  ACTIVE olan SONA_ERDI satırı taranır, yeniden satın alma kapalıdır
// ═════════════════════════════════════════════════════════════════════════
async function kBlogu(): Promise<void> {
  console.log('\n── K · gece taraması: iyzico\'da hâlâ ACTIVE görünen SONA_ERDI satırı ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    // k1: deneme sonrası çekim ödendi, webhook kayboldu, kanıt tamponda
    // bulunamadı → saatlik iş kapattı. iyzico çekmeye devam ediyor.
    const cekim = simdi - 3 * GUN;
    const kapanan = d.kartSatiri('F-K1', 'sub-k1', {
      durum: 'SONA_ERDI', erisimSonu: new Date(simdi - GUN), denemeSonu: new Date(cekim), iyzicoDurum: 'ACTIVE',
    });
    d.iyz.detaylar.set('sub-k1', iyzicoDetayi('sub-k1', 'ACTIVE', [
      siparis({ kod: 'ord-k1', durum: 'SUCCESS', bas: cekim, son: cekim + 30 * GUN, denemeler: ['SUCCESS'] }),
    ], { baslangic: cekim - 30 * GUN, gun: 30 }));
    // k2: SONA_ERDI + iyzico ACTIVE, ödenmiş sipariş YOK
    const kanitsiz = d.kartSatiri('F-K2', 'sub-k2', {
      durum: 'SONA_ERDI', erisimSonu: new Date(simdi - GUN), iyzicoDurum: 'ACTIVE',
    });
    d.iyz.detaylar.set('sub-k2', iyzicoDetayi('sub-k2', 'ACTIVE', []));
    // k3: SONA_ERDI + iyzico CANCELED (bilinen) → TARANMAZ
    d.kartSatiri('F-K3', 'sub-k3', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - 5 * GUN), iyzicoDurum: 'CANCELED' });
    d.iyz.detaylar.set('sub-k3', iyzicoDetayi('sub-k3', 'CANCELED', []));
    // k4: yerelde bayat ACTIVE, iyzico artık CANCELED diyor
    const bayat = d.kartSatiri('F-K4', 'sub-k4', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - 2 * GUN), iyzicoDurum: 'ACTIVE' });
    d.iyz.detaylar.set('sub-k4', iyzicoDetayi('sub-k4', 'CANCELED', []));

    const g = await d.geceyiKos();
    const olay = d.durumOlaylari(kapanan.id)[0];
    check('K1 ⭐ SONA_ERDI + iyzico ACTIVE + ödenmiş sipariş → tarandı, oynatıldı: AKTIF, dönem sonu, fatura',
      kapanan.durum === 'AKTIF' && kapanan.erisimSonu.getTime() === cekim + 30 * GUN &&
        d.faturalar(kapanan.id).some((f) => f.tahsilatKodu === 'ord-k1') &&
        olay?.oncekiDurum === 'SONA_ERDI' && olay?.aktor === 'webhook',
      `durum=${kapanan.durum} erisimSonu=${iso(kapanan.erisimSonu)} olay=${JSON.stringify(olay ?? null)}`);
    const k2Uyari = g.uyarilar.filter((u) => u.includes("SONA_ERDI satır iyzico'da hâlâ ACTIVE"));
    check('K2 ⭐ kanıtsız SONA_ERDI + ACTIVE → durum AYNI, olay yok; tek UYARI (yeniden satın alma kapalı)',
      kanitsiz.durum === 'SONA_ERDI' && d.durumOlaylari(kanitsiz.id).length === 0 &&
        k2Uyari.length === 1 && k2Uyari[0].includes('sub-k2') && d.oynatilanlar().every((o) => o.abonelikKodu !== 'sub-k2'),
      gunlukYaz(g));
    check('K3 iyzico\'su CANCELED bilinen SONA_ERDI satırı iyzico\'ya SORULMADI', !d.iyz.sorulan.includes('sub-k3'),
      `sorulan=${d.iyz.sorulan}`);
    check('K4 bayat ACTIVE tazelendi (CANCELED), durum AYNI, uyarı yok',
      bayat.durum === 'SONA_ERDI' && bayat.iyzicoDurum === 'CANCELED' && !g.uyarilar.some((u) => u.includes('sub-k4')),
      `durum=${bayat.durum} iyzicoDurum=${bayat.iyzicoDurum}`);
    check('K5 hata yok; uyarılar = ord-k1 oynatması + sub-k2; özet "Değişen: 0 · … oynatılan: 1 · kanıtsız …: 0"',
      g.hatalar.length === 0 && g.uyarilar.length === 2 && g.uyarilar.some((u) => u.startsWith('Kayıp tahsilat yeniden oynatıldı') && u.includes(' sipariş ord-k1 ')) &&
        ozet(g).includes('Değişen: 0 ') && ozet(g).includes('kayıp tahsilat yeniden oynatılan: 1') &&
        ozet(g).includes("kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 0"),
      `ozet="${ozet(g)}" ${gunlukYaz(g)}`);
    const onceSorulan = d.iyz.sorulan.filter((k) => k === 'sub-k4').length;
    await d.geceyiKos();
    check('K6 ikinci gece: tazelenen (CANCELED) satır artık sorulmuyor',
      d.iyz.sorulan.filter((k) => k === 'sub-k4').length === onceSorulan, `sorulan=${d.iyz.sorulan}`);
  }

  console.log('\n── K · satın alma kapısı: iyzico\'su açık geri dönen müşteri (GERÇEK baslat) ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const satirlar: Array<[string, Satir, string]> = [
      ['F-S1', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - GUN), iyzicoDurum: 'ACTIVE' }, 'KART_ABONELIGI_ACIK'],
      ['F-S2', { durum: 'ASKIDA', erisimSonu: new Date(simdi - 35 * GUN), iyzicoDurum: 'ACTIVE' }, 'KART_ABONELIGI_ACIK'],
      ['F-S3', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - GUN), iyzicoDurum: 'CANCELED' }, 'KAPI_GECILDI'],
      ['F-S4', { durum: 'ASKIDA', erisimSonu: new Date(simdi - 35 * GUN), iyzicoDurum: 'UNPAID' }, 'KAPI_GECILDI'],
      ['F-S5', { durum: 'SONA_ERDI', erisimSonu: new Date(simdi - GUN), iyzicoDurum: 'EXPIRED' }, 'KAPI_GECILDI'],
      ['F-S6', { durum: 'AKTIF', erisimSonu: new Date(simdi + 9 * GUN), iyzicoDurum: 'ACTIVE' }, 'ABONELIK_ZATEN_VAR'],
    ];
    const sonuc: string[] = [];
    for (const [firmaId, alanlar] of satirlar) {
      d.kartSatiri(firmaId, `sub-${firmaId}`, alanlar);
      sonuc.push(await d.satinAlmayiDene(firmaId));
    }
    const sapma = satirlar.filter(([, , beklenen], i) => sonuc[i] !== beklenen).map(([f], i) => `${f}:${sonuc[i]}`);
    check('K7 ⭐ BAĞLANTI: iyzico ACTIVE iken SONA_ERDI/ASKIDA → KART_ABONELIGI_ACIK; CANCELED/UNPAID/EXPIRED → kapı AÇIK; AKTIF → ABONELIK_ZATEN_VAR',
      sapma.length === 0, `sapma=${sapma.join(' | ')} sonuc=${sonuc}`);
    check('K8 reddedilen satın almada iyzico formu HİÇ açılmadı; kapıyı yalnız üç satır geçti',
      d.iyz.baslatmalar.length === 0 && d.kapiGecildi.join(',') === 'F-S3,F-S4,F-S5', `gecen=${d.kapiGecildi}`);
    const eski = { durum: 'SONA_ERDI', iyzicoDurum: 'ACTIVE', iyzicoAbonelikKodu: 'sub-eski', paketSurumu: { paket: { kod: 'pro-mek' } } };
    check('K9 ⭐ ikinci form tamamlanırsa da (yarış) yeni abonelik İKİNCİ sayılır; iyzico kapalıysa sayılmaz',
      ikinciAbonelikMi(eski, 'sub-yeni') === true && ikinciAbonelikMi({ ...eski, iyzicoDurum: 'CANCELED' }, 'sub-yeni') === false);
    check('K10 miras satırı muaf (iyzico durumu ne olursa olsun)',
      yeniAbonelikEngeli({ durum: 'AKTIF', iyzicoDurum: 'ACTIVE', paketSurumu: { paket: { kod: 'miras-pro' } } }) === null);
  }

  console.log('\n── K · iptalEt iyzico durumunu tazeler (yanlış engel yok) ──');
  {
    const d = dunyaKur();
    const simdi = Date.now();
    const ab = d.kartSatiri('F-K9', 'sub-k9', { durum: 'AKTIF', erisimSonu: new Date(simdi + 3 * GUN), iyzicoDurum: 'ACTIVE' });
    await gunluguTopla(() => d.satinAlma.iptalEt('F-K9', 'U-K9', 'test'));
    check('K11 ⭐ BAĞLANTI: iptalEt iyzico\'da iptal etti ve iyzicoDurum = CANCELED yazdı',
      d.iyz.iptaller.join(',') === 'sub-k9' && ab.durum === 'IPTAL' && ab.iyzicoDurum === 'CANCELED',
      `iptaller=${d.iyz.iptaller} durum=${ab.durum} iyzicoDurum=${ab.iyzicoDurum}`);
    // Dönem AYNI gün bitti; gece mutabakatı HENÜZ koşmadı.
    ab.erisimSonu = new Date(Date.now() - 1_000);
    await gunluguTopla(() => d.mutabakat.suresiDolanlariKapat());
    const r = await d.satinAlmayiDene('F-K9');
    check('K12 ⭐ iptal eden müşteri dönem bitince AYNI GÜN yeniden alabiliyor (kapı açık; bayat ACTIVE engel olmadı)',
      ab.durum === 'SONA_ERDI' && r === 'KAPI_GECILDI', `durum=${ab.durum} sonuc=${r}`);
  }
  {
    // Zincirin (Z) satırında hesap kapatma / yönetici silme: iyzico'da iptal
    // BAŞARILI ama SONA_ERDI → IPTAL geçersiz geçiş olduğu için `iptalEt`
    // sonra patlar. iyzico durumu yine de doğru yazılmalı.
    const d = dunyaKur();
    const ab = d.kartSatiri('F-K13', 'sub-k13', { durum: 'SONA_ERDI', erisimSonu: new Date(Date.now() - GUN), iyzicoDurum: 'ACTIVE' });
    let hata = '';
    await gunluguTopla(async () => {
      await d.satinAlma.iptalEt('F-K13', 'U-K13', 'hesap kapatma').catch((e: unknown) => {
        hata = e instanceof Error ? e.name : String(e);
      });
    });
    const r = await d.satinAlmayiDene('F-K13');
    check('K13 ⭐ SONA_ERDI satırda iptal: iyzico iptal edildi, durum geçişi patlasa da iyzicoDurum CANCELED → geri dönüş satın alması AÇIK',
      d.iyz.iptaller.join(',') === 'sub-k13' && hata === 'GecersizGecisHatasi' && ab.iyzicoDurum === 'CANCELED' &&
        ab.durum === 'SONA_ERDI' && r === 'KAPI_GECILDI',
      `iptaller=${d.iyz.iptaller} hata=${hata} iyzicoDurum=${ab.iyzicoDurum} sonuc=${r}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Z — ZİNCİR (incelemenin senaryosu): deneme sonrası çekim ödendi, kanıt
//  tamponda görünmedi → SONA_ERDI → satın alma ENGELLİ → ertesi gece kurtarma
// ═════════════════════════════════════════════════════════════════════════
async function zBlogu(): Promise<void> {
  console.log('\n── Z · zincir: tampon → SONA_ERDI → yeniden alım engelli → ertesi gece oynatma ──');
  const d = dunyaKur();
  const simdi = Date.now();
  const baslangic = new Date(simdi - 30 * GUN - 6 * SAAT); // deneme 6 saat önce bitti
  const tarihler = donemTarihleriHesapla(baslangic, 30);
  const ab = d.kartSatiri('F-Z', 'sub-z', { durum: 'DENEME', ...tarihler });
  const cekim = tarihler.denemeSonu!.getTime() - 3 * DK;
  const deneme = { baslangic: baslangic.getTime() - 3 * DK, gun: 30 };
  // 1. gece: iyzico çekti ama sipariş listesi HENÜZ göstermiyor (gecikme).
  d.iyz.detaylar.set('sub-z', iyzicoDetayi('sub-z', 'ACTIVE', [], deneme));
  const g1 = await d.geceyiKos();
  check('Z1 kanıt yok → DENEME kaldı (kanıtsız terfi yok, özet kanıtsız: 1)',
    ab.durum === 'DENEME' && ozet(g1).includes("kanıtsız ACTIVE ile AKTIF'e çekilmeyen: 1"), `durum=${ab.durum} ozet="${ozet(g1)}"`);
  // Tampon bitti (zaman atlaması); saatlik iş kapatır.
  ab.erisimSonu = new Date(Date.now() - 1_000);
  await gunluguTopla(() => d.mutabakat.suresiDolanlariKapat());
  check('Z2 saatlik iş SONA_ERDI yaptı; iyzicoDurum hâlâ ACTIVE', ab.durum === 'SONA_ERDI' && ab.iyzicoDurum === 'ACTIVE',
    `durum=${ab.durum} iyzicoDurum=${ab.iyzicoDurum}`);
  const r1 = await d.satinAlmayiDene('F-Z');
  check('Z3 ⭐ "sona erdi" gören müşteri yeniden ALAMIYOR (çift çekim yok), iyzico formu açılmadı',
    r1 === 'KART_ABONELIGI_ACIK' && d.iyz.baslatmalar.length === 0, `sonuc=${r1}`);
  // 2. gece: sipariş artık listede.
  d.iyz.detaylar.set('sub-z', iyzicoDetayi('sub-z', 'ACTIVE', [
    siparis({ kod: 'ord-z1', durum: 'SUCCESS', bas: cekim, son: cekim + 30 * GUN, denemeler: ['SUCCESS'] }),
  ], deneme));
  const g2 = await d.geceyiKos();
  check('Z4 ⭐ ertesi gece SONA_ERDI satırı tarandı, tahsilat oynatıldı: AKTIF, dönem sonu, fatura',
    ab.durum === 'AKTIF' && ab.erisimSonu.getTime() === cekim + 30 * GUN &&
      d.faturalar(ab.id).some((f) => f.tahsilatKodu === 'ord-z1') && yalnizOynatmaUyarisi(g2, ['ord-z1']),
    `durum=${ab.durum} erisimSonu=${iso(ab.erisimSonu)} ${gunlukYaz(g2)}`);
  const k = await d.erisim.karar('F-Z');
  const r2 = await d.satinAlmayiDene('F-Z');
  check('Z5 müşteri erişimli; artık olağan kural: ABONELIK_ZATEN_VAR', k.erisimVar === true && r2 === 'ABONELIK_ZATEN_VAR',
    `erisim=${k.erisimVar} sonuc=${r2}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nMUTABAKAT KAYIP TAHSİLAT: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  sBlogu();
  tBlogu();
  await oBlogu();
  await aBlogu();
  await dBlogu();
  await bBlogu();
  await wBlogu();
  await nBlogu();
  await iBlogu();
  await gBlogu();
  await kBlogu();
  await zBlogu();
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
