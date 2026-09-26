/**
 * MÜŞTERİ E-POSTALARI — tam bir kez (`npm run test:musteri-epostalari`)
 *
 * AĞ/DB/SMTP GEREKTİRMEZ: Prisma yerine bellek-içi tablo, SMTP yerine
 * gönderimi kaydeden taklit. GERÇEK servisler çağrılır: `HavaleServisi.iptalEt`,
 * `SatinAlmaServisi.iptalEt` (+ gerçek `AbonelikServisi.durumDegistir`),
 * `WebhookIsleyici.basariliTahsilat` (+ gerçek `FaturaServisi.kuyrugaAl`),
 * `DenemeHatirlatmasiServisi.tara`.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * 24.09 envanteri: dört olay müşteriye HİÇ e-posta üretmiyordu. Emre
 * ("devam et, önerdiğin sırayla", 25.09) + deneme için karar: "3 gün kala,
 * bir kez". Kural (koordinatör): her e-posta TAM BİR KEZ — webhook tekrarı,
 * cron turları, eşzamanlı çağrı ikinci e-posta üretmez; dunning'in
 * "ödemeniz alındı"sı ile yenileme makbuzu aynı ödemeye birlikte gitmez.
 *
 * ── ÖLÇÜLEN ────────────────────────────────────────────────────────────
 *   M  SAF metinler (tutar/tarih/periyot, satır sonu, HTML yok)
 *   H  Havale reddi — koşullu iptalin KAZANAN yolu: tekrar/eşzamanlı/onaylı
 *   İ  İptal onayı — yalnız müşterinin isteği; tekrar/eşzamanlı/iyzico hatası
 *   Ö  Yenileme "ödemeniz alındı" — fatura satırı tekil; dunning'le ayrık
 *   D  Deneme bitiyor — pencere, kapsam, tur/süreç yarışı, düşen gönderim
 *   N  BAĞLANTI — denetleyici bayrağı, Nest enjeksiyonu, cron saati, modül
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL.
 */

// Süreç saati KONTEYNERİNKİ (UTC; Dockerfile/compose `TZ` vermez). Yerel
// makine İstanbul'daysa M4c tarih düzeltmesini ÖLÇMÜYORDU: `timeZone`suz
// `tarihYaz` da "4 Ekim" yazıyordu (mutant M50 yaşadı, 25.09).
process.env.TZ = 'UTC';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
import { PrismaService } from '../src/altyapi/db/prisma.service';
import { EpostaServisi } from '../src/ozellik/odeme/eposta/eposta.servisi';
import {
  denemeBitiyorEpostasi,
  havaleIptalEpostasi,
  iptalOnayiEpostasi,
  odemeAlindiEpostasi,
  periyotMetni,
} from '../src/ozellik/odeme/eposta/musteri-epostalari';
import { HavaleServisi } from '../src/ozellik/odeme/havale/havale.servisi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { FaturaServisi } from '../src/ozellik/odeme/fatura/fatura.servisi';
import { WebhookIsleyici } from '../src/ozellik/odeme/webhook/webhook.isleyici';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import {
  DENEME_HATIRLATMA_GUNU,
  DenemeHatirlatmasiServisi,
  istanbulGunSonu,
} from '../src/ozellik/odeme/abonelik/deneme-hatirlatmasi.servisi';
import { tarihYaz } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import { IyzicoHatasi } from '../src/ozellik/odeme/iyzico/iyzico.client';

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

const KOK = join(__dirname, '..', '..');
const GUN = 24 * 60 * 60 * 1000;
const SAAT = 60 * 60 * 1000;
const UYGULAMA = 'https://app.ornek.test';

/** Yorum satırlarını soyar — kapı kendi BELGESİNİ ölçmesin (14.09 dersi). */
function yorumsuz(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** `anahtar: [ ... ]` dizisinin GÖVDESİ (köşeli parantez sayarak); yoksa ''. */
function diziGovdesi(kaynak: string, anahtar: string): string {
  const bas = kaynak.search(new RegExp(`\\b${anahtar}\\s*:\\s*\\[`));
  if (bas < 0) return '';
  const ac = kaynak.indexOf('[', bas);
  let derinlik = 0;
  for (let i = ac; i < kaynak.length; i++) {
    if (kaynak[i] === '[') derinlik++;
    else if (kaynak[i] === ']' && --derinlik === 0) return kaynak.slice(ac + 1, i);
  }
  return '';
}

// ═════════════════════════════════════════════════════════════════════════
//  GÜNLÜK — yutulan hata GÖRÜNSÜN
// ═════════════════════════════════════════════════════════════════════════
const gunluk: Array<{ seviye: 'ayrinti' | 'bilgi' | 'uyari' | 'hata'; metin: string }> = [];
const gunlukServisi = {
  log: (m: unknown) => void gunluk.push({ seviye: 'bilgi', metin: String(m) }),
  debug: (m: unknown) => void gunluk.push({ seviye: 'ayrinti', metin: String(m) }),
  verbose: () => undefined,
  warn: (m: unknown) => void gunluk.push({ seviye: 'uyari', metin: String(m) }),
  error: (m: unknown) => void gunluk.push({ seviye: 'hata', metin: String(m) }),
  fatal: (m: unknown) => void gunluk.push({ seviye: 'hata', metin: String(m) }),
};
Logger.overrideLogger(gunlukServisi);
const hatalarSonra = (i: number) => gunluk.slice(i).filter((g) => g.seviye === 'hata').map((g) => g.metin);

// ═════════════════════════════════════════════════════════════════════════
//  BELLEK-PRISMA — tanınmayan koşul PATLAR; koşullu yazım TEK adımda
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

const ILISKILER: Record<string, Record<string, { model: string; yerel: string }>> = {
  abonelik: {
    paketSurumu: { model: 'paketSurumu', yerel: 'paketSurumuId' },
    firma: { model: 'firma', yerel: 'firmaId' },
  },
  paketSurumu: { paket: { model: 'paket', yerel: 'paketId' } },
  fatura: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
  havaleOdemesi: { abonelik: { model: 'abonelik', yerel: 'abonelikId' } },
};

const TEKILLER: Record<string, string[]> = {
  fatura: ['tahsilatKodu'],
  abonelik: ['firmaId'],
};

const VARSAYILAN: Record<string, () => Satir> = {
  abonelik: () => ({
    durum: 'AKTIF', denemeSonu: null, denemeHatirlatmasi: null, planliPaketSurumuId: null,
    paketGecisTarihi: null, odenenPaketSurumuId: null, iyzicoAbonelikKodu: null, iyzicoKokKodu: null,
    iyzicoMusteriKodu: null, iyzicoDurum: null, iyzicoSonKontrol: null, odemeYontemi: 'KART',
    ilkBasarisizlik: null, denemeSayisi: 0, sonDeneme: null, kisitlandi: null, iptalTalebi: null,
    iptalNedeni: null, kopruErisimSonu: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
  firma: () => ({
    unvan: null, vergiNo: null, vergiDairesi: null, tcKimlikNo: null, faturaAdresi: null, il: null,
    ilce: null, faturaEposta: null, yetkiliEposta: null,
  }),
  fatura: () => ({
    denemeSayisi: 0, hata: null, saglayici: null, saglayiciId: null, faturaNo: null, faturaUrl: null,
    kesildi: null, sonDeneme: null, olusturuldu: new Date(),
  }),
  havaleOdemesi: () => ({
    durum: 'TEKLIF', paraBirimi: 'TRY', teklifNo: null, faturaNo: null, dekontUrl: null, aciklama: null,
    onaylayanId: null, onaylandi: null, olusturuldu: new Date(), guncellendi: new Date(),
  }),
  abonelikOlayi: () => ({ oncekiDurum: null, yeniDurum: null, aciklama: null, veri: null, aktor: 'sistem', olusturuldu: new Date() }),
};

function kosulUygula(deger: any, kosul: any): boolean {
  if (kosul === null) return deger === null || deger === undefined;
  if (kosul instanceof Date) return deger instanceof Date && deger.getTime() === kosul.getTime();
  if (typeof kosul !== 'object') return deger === kosul;
  const bos = deger === null || deger === undefined;
  return Object.entries(kosul).every(([op, v]: [string, any]) => {
    switch (op) {
      case 'in': return !bos && (v as any[]).some((x) => kosulUygula(deger, x));
      // SQL: NULL NOT IN (...) → NULL → satır düşer (Prisma `notIn` aynısını üretir).
      case 'notIn': return !bos && !(v as any[]).some((x) => kosulUygula(deger, x));
      case 'not': return v === null ? !bos : !bos && !kosulUygula(deger, v);
      case 'lt': return !bos && deger < v;
      case 'lte': return !bos && deger <= v;
      case 'gt': return !bos && deger > v;
      case 'gte': return !bos && deger >= v;
      default: throw new Error(`bellek-Prisma: desteklenmeyen operatör "${op}"`);
    }
  });
}

function whereUygula(satir: Satir, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return (v as any[]).some((w) => whereUygula(satir, w));
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w) => whereUygula(satir, w));
    if (k === 'NOT') return !(Array.isArray(v) ? v : [v]).some((w) => whereUygula(satir, w));
    return kosulUygula(satir[k], v);
  });
}

function sirala(satirlar: Satir[], orderBy: any): Satir[] {
  if (!orderBy) return satirlar;
  const kurallar = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...satirlar].sort((a, b) => {
    for (const [alan, yon] of kurallar) {
      const x = a[alan] instanceof Date ? a[alan].getTime() : a[alan];
      const y = b[alan] instanceof Date ? b[alan].getTime() : b[alan];
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
  const cagrilar: string[] = [];

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
      const islem = v !== null && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Prisma.Decimal);
      if (islem && 'increment' in v) hedef[k] = (hedef[k] ?? 0) + (v as any).increment;
      else hedef[k] = v;
    }
  }

  function ekle(model: string, data: Satir): Satir {
    const satir: Satir = { id: randomUUID(), ...(VARSAYILAN[model]?.() ?? {}) };
    veriUygula(satir, data);
    tekilDenetle(model, satir);
    tablo(model).push(satir);
    return satir;
  }

  const modelYuzu = (model: string) => {
    const kapi = (islem: string) => cagrilar.push(`${model}.${islem}`);
    return {
      findUnique: async (arg: any) => {
        kapi('findUnique');
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        return s ? yansit(model, s, arg) : null;
      },
      findUniqueOrThrow: async (arg: any) => {
        kapi('findUniqueOrThrow');
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (!s) throw Object.assign(new Error(`${model} bulunamadı`), { code: 'P2025' });
        return yansit(model, s, arg);
      },
      findFirst: async (arg: any = {}) => {
        kapi('findFirst');
        const s = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy)[0];
        return s ? yansit(model, s, arg) : null;
      },
      findMany: async (arg: any = {}) => {
        kapi('findMany');
        let liste = sirala(tablo(model).filter((r) => whereUygula(r, arg.where)), arg.orderBy);
        if (arg.take !== undefined) liste = liste.slice(0, arg.take);
        return liste.map((s) => yansit(model, s, arg));
      },
      count: async (arg: any = {}) => {
        kapi('count');
        return tablo(model).filter((r) => whereUygula(r, arg.where)).length;
      },
      create: async (arg: any) => {
        kapi('create');
        return yansit(model, ekle(model, arg.data), arg);
      },
      update: async (arg: any) => {
        kapi('update');
        const s = tablo(model).find((r) => whereUygula(r, arg.where));
        if (!s) throw Object.assign(new Error(`${model} güncellenecek satır yok`), { code: 'P2025' });
        veriUygula(s, arg.data);
        tekilDenetle(model, s);
        return yansit(model, s, arg);
      },
      // Koşullu yazma: koşul ile yazım AYNI adımda (SQL'deki tek UPDATE gibi).
      updateMany: async (arg: any) => {
        kapi('updateMany');
        const hedefler = tablo(model).filter((r) => whereUygula(r, arg.where));
        hedefler.forEach((s) => veriUygula(s, arg.data));
        return { count: hedefler.length };
      },
    };
  };

  const prisma: any = new Proxy(
    {},
    {
      get: (_h, ad: string) => {
        if (ad === 'then') return undefined;
        if (ad === '$transaction') {
          return async (x: unknown) =>
            Array.isArray(x) ? Promise.all(x) : (x as (tx: unknown) => unknown)(prisma);
        }
        return modelYuzu(ad);
      },
    },
  );
  return { prisma, tablo, ekle, cagrilar };
}

// ═════════════════════════════════════════════════════════════════════════
//  SAHTE E-POSTA — gerçek sözleşme (`gonder` SMTP yoksa sessiz; kritik fırlatır)
// ═════════════════════════════════════════════════════════════════════════
interface GidenPosta {
  kip: 'gonder' | 'kritik';
  kime: string;
  konu: string;
  baslik: string;
  paragraflar: string[];
  dugme?: { etiket: string; url: string };
}

function sahteEposta() {
  const giden: GidenPosta[] = [];
  const durum = { hata: null as string | null };
  const kaydet = (kip: GidenPosta['kip'], m: any) =>
    giden.push({ kip, kime: m.kime, konu: m.konu, baslik: m.baslik, paragraflar: [...(m.paragraflar ?? [])], dugme: m.dugme });
  const servis = {
    yapilandirildiMi: () => true,
    gonder: async (m: any) => {
      if (durum.hata) throw new Error(durum.hata);
      kaydet('gonder', m);
    },
    gonderKritik: async (m: any) => {
      if (durum.hata) throw new Error(durum.hata);
      kaydet('kritik', m);
    },
  };
  return { servis: servis as any, giden, durum };
}

const iceren = (p: GidenPosta | undefined, re: RegExp) => !!p && p.paragraflar.some((x) => re.test(x));
const htmlYok = (p: { paragraflar: string[] }) => !p.paragraflar.some((x) => /<\/?[a-z][^>]*>/i.test(x));

// ═════════════════════════════════════════════════════════════════════════
//  ORTAK DÜNYA
// ═════════════════════════════════════════════════════════════════════════
const FIRMA_EPOSTA = 'muhasebe@yilmaz.test';

function dunyaKur() {
  const db = bellekPrisma();
  const posta = sahteEposta();
  db.ekle('paket', { id: 'P1', ad: 'Pro — Mekanik' });
  db.ekle('paket', { id: 'P0', ad: 'Basic — Mekanik' });
  db.ekle('paketSurumu', {
    id: 'S1', paketId: 'P1', tutar: new Prisma.Decimal(1649), paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1,
  });
  db.ekle('paketSurumu', {
    id: 'S0', paketId: 'P0', tutar: new Prisma.Decimal(899), paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1,
  });
  const firma = (id: string, ek: Satir = {}) =>
    db.ekle('firma', { id, ad: `Yılmaz ${id}`, faturaEposta: FIRMA_EPOSTA, yetkiliEposta: 'yetkili@yilmaz.test', ...ek });
  return { db, posta, firma };
}

// ═════════════════════════════════════════════════════════════════════════
//  M — SAF METİNLER
// ═════════════════════════════════════════════════════════════════════════
function mBlogu(): void {
  console.log('\n── M · SAF metinler ──');
  const o = odemeAlindiEpostasi({
    firmaAdi: 'Yılmaz Ltd.', paketAdi: 'Pro — Mekanik', tutar: 1649, paraBirimi: 'TRY',
    donemBasi: new Date('2026-09-20T12:00:00Z'), donemSonu: new Date('2026-10-20T12:00:00Z'), uygulamaUrl: `${UYGULAMA}/`,
  });
  check('M1 ödemeniz alındı: konu, tutar, dönem, fatura notu, /abonelik düğmesi',
    o.konu === 'MetaPriceX — ödemeniz alındı' &&
      o.paragraflar[0] === 'Yılmaz Ltd. için Pro — Mekanik aboneliğinizin ₺1.649,00 tutarındaki ödemesi kayıtlı kartınızdan alındı.' &&
      o.paragraflar[1] === 'Ödenen dönem: 20 Eylül 2026 – 20 Ekim 2026.' && o.paragraflar.includes('Faturanız e-posta ile ayrıca iletilecek.') &&
      o.dugme.url === `${UYGULAMA}/abonelik`,
    JSON.stringify(o));
  const o2 = odemeAlindiEpostasi({
    firmaAdi: 'X', paketAdi: 'Y', tutar: 1, paraBirimi: 'TRY', donemBasi: null, donemSonu: new Date('2026-10-20T12:00:00Z'), uygulamaUrl: UYGULAMA,
  });
  check('M1b dönem başı çözülemezse "… tarihine kadar geçerli"', o2.paragraflar[1] === 'Aboneliğiniz 20 Ekim 2026 tarihine kadar geçerli.',
    o2.paragraflar[1]);

  const ortak = { firmaAdi: 'Yılmaz Ltd.', paketAdi: 'Pro — Mekanik', bitis: new Date('2026-10-20T12:00:00Z'), uygulamaUrl: UYGULAMA };
  const i1 = iptalOnayiEpostasi({ ...ortak, hal: 'odenmis', kartli: true, erisimSuruyor: true });
  const i2 = iptalOnayiEpostasi({ ...ortak, hal: 'deneme', kartli: true, erisimSuruyor: true });
  const i3 = iptalOnayiEpostasi({ ...ortak, hal: 'odenmis', kartli: false, erisimSuruyor: true });
  const i4 = iptalOnayiEpostasi({ ...ortak, hal: 'odenmis', kartli: true, erisimSuruyor: true, geriDonulenPaketAdi: 'Basic — Mekanik' });
  check('M2 iptal onayı: kartlı dönem → "yeni ücret çekilmez"; deneme → "ücret çekilmeyecek"; havale → kart cümlesi YOK',
    i1.konu === 'MetaPriceX — aboneliğiniz iptal edildi' &&
      i1.paragraflar[1] === 'Ödenmiş döneminiz 20 Ekim 2026 tarihine kadar sürer; bu tarihten sonra kartınızdan yeni ücret çekilmez.' &&
      i2.paragraflar[1] === 'Deneme süreniz 20 Ekim 2026 tarihine kadar sürer; kartınızdan ücret çekilmeyecek.' &&
      i3.paragraflar[1] === 'Ödenmiş döneminiz 20 Ekim 2026 tarihine kadar sürer.' &&
      i4.paragraflar.some((x) => /ödediğiniz Basic — Mekanik paketine döndü/.test(x)) &&
      !i1.paragraflar.some((x) => /paketine döndü/.test(x)) && i1.paragraflar.some((x) => /siz yapmadıysanız/.test(x)) &&
      i1.paragraflar.some((x) => /^Bu tarihe kadar uygulamayı kullanmaya devam edebilirsiniz\./.test(x)),
    JSON.stringify([i1.paragraflar, i2.paragraflar[1], i3.paragraflar[1]]));
  const i5 = iptalOnayiEpostasi({ ...ortak, hal: 'odenmemis', kartli: true, erisimSuruyor: false });
  const i6 = iptalOnayiEpostasi({ ...ortak, hal: 'odenmemis', kartli: true, erisimSuruyor: true });
  check('M2b ⭐ ÖDENMEMİŞ dönem (ödeme bekliyor / kısıtlı): "ödenmiş döneminiz" YOK; yeniden çekim yok; erişim bittiyse "devam edebilirsiniz" YOK',
    i5.paragraflar[1] === 'Tahsil edilemeyen ödeme için kartınızdan yeniden çekim yapılmayacak; yeni ücret de çekilmeyecek.' &&
      i5.paragraflar[2] === 'Ödenmemiş dönem nedeniyle erişiminiz sona erdi.' &&
      !i5.paragraflar.some((x) => /Ödenmiş döneminiz|devam edebilirsiniz/.test(x)) &&
      i6.paragraflar[2] === 'Erişiminiz 20 Ekim 2026 tarihine kadar sürer.' &&
      i6.paragraflar.some((x) => /devam edebilirsiniz/.test(x)),
    JSON.stringify([i5.paragraflar, i6.paragraflar]));

  const h1 = havaleIptalEpostasi({
    firmaAdi: 'Yılmaz\nLtd.', teklifNo: 'HVL-2026-0007', tutar: 16490, paraBirimi: 'TRY', uygulamaUrl: UYGULAMA,
  });
  const h2 = havaleIptalEpostasi({ firmaAdi: 'Yılmaz Ltd.', teklifNo: null, tutar: 16490, paraBirimi: 'TRY', uygulamaUrl: UYGULAMA });
  check('M3 havale iptali: teklif no + tutar; firma adı TEK satır; yöneticinin iç notu için alan YOK',
    h1.konu === 'MetaPriceX — havale ödeme kaydınız iptal edildi' &&
      h1.paragraflar[0] === 'Yılmaz Ltd. için HVL-2026-0007 numaralı ₺16.490,00 tutarındaki havale/EFT ödeme kaydınız iptal edildi.' &&
      h2.paragraflar[0] === 'Yılmaz Ltd. için ₺16.490,00 tutarındaki havale/EFT ödeme kaydınız iptal edildi.' &&
      !h1.paragraflar.some((x) => /^Açıklama/.test(x)),
    JSON.stringify([h1.paragraflar, h2.paragraflar]));

  const dOrtak = {
    firmaAdi: 'Yılmaz Ltd.', paketAdi: 'Pro — Mekanik', cekimTarihi: new Date('2026-10-20T12:00:00Z'),
    paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, uygulamaUrl: UYGULAMA,
  };
  const d1 = denemeBitiyorEpostasi({ ...dOrtak, tutar: 1649, simdi: new Date('2026-10-17T06:00:00Z') });
  const d2 = denemeBitiyorEpostasi({ ...dOrtak, tutar: null, simdi: new Date('2026-10-17T06:00:00Z') });
  check('M4 deneme bitiyor: konuda tarih; KDV dahil tutar + "aylık yenilenecek"; tarihinden önce iptal; tutar yoksa rakam YOK',
    d1.konu === 'MetaPriceX — deneme süreniz 20 Ekim 2026 tarihinde bitiyor' &&
      d1.paragraflar[1] === 'Bu tarihte kayıtlı kartınızdan ₺1.649,00 (KDV dahil) çekilecek ve aboneliğiniz aylık yenilenecek.' &&
      d1.paragraflar[2] === 'Devam etmek istemiyorsanız 20 Ekim 2026 tarihinden önce Abonelik sayfasından iptal edin; iptal ederseniz kartınızdan ücret çekilmez.' &&
      d2.paragraflar[1] === 'Bu tarihte kayıtlı kartınızdan ilk ödeme çekilecek ve aboneliğiniz devam edecek.' &&
      !d2.paragraflar.some((x) => /₺/.test(x)),
    JSON.stringify([d1.konu, d1.paragraflar, d2.paragraflar[1]]));
  const d3 = denemeBitiyorEpostasi({ ...dOrtak, tutar: 1649, simdi: new Date('2026-10-20T02:00:00Z') });
  check('M4b çekime 24 saatten az kaldıysa "bugünden önce" gibi yapılamaz talimat YOK: "hemen iptal edin"',
    d3.paragraflar[2] === 'Devam etmek istemiyorsanız hemen Abonelik sayfasından iptal edin; çekimden önce iptal ederseniz kartınızdan ücret çekilmez.' &&
      !d3.paragraflar.some((x) => /tarihinden önce/.test(x)),
    d3.paragraflar[2]);
  const d4 = denemeBitiyorEpostasi({ ...dOrtak, cekimTarihi: new Date('2026-10-03T22:30:00Z'), tutar: 1649, simdi: new Date('2026-09-30T06:00:00Z') });
  check('M4c ⭐ gün İSTANBUL\'a göre: 22:30Z çekim (İstanbul 01:30) "4 Ekim" yazılır (konteyner UTC, eskiden "3 Ekim")',
    d4.konu === 'MetaPriceX — deneme süreniz 4 Ekim 2026 tarihinde bitiyor' && tarihYaz(new Date('2026-10-03T22:30:00Z')) === '4 Ekim 2026',
    d4.konu);
  check('M5 periyot: aylık · yıllık · her 3 ayda bir · bilinmeyen → aylık',
    periyotMetni('MONTHLY', 1) === 'aylık' && periyotMetni('YEARLY', 1) === 'yıllık' &&
      periyotMetni('MONTHLY', 3) === 'her 3 ayda bir' && periyotMetni('XYZ', 1) === 'aylık',
    [periyotMetni('MONTHLY', 1), periyotMetni('YEARLY', 1), periyotMetni('MONTHLY', 3), periyotMetni('XYZ', 1)].join(' | '));
  check('M6 metinlerde HTML YOK ve satır sonu YOK (düz metin gövdeye sahte satır gömülmez)',
    [o, i1, i5, h1, d1, d3].every((p) => htmlYok(p) && !p.paragraflar.some((x) => /[\r\n]/.test(x))));
}

// ═════════════════════════════════════════════════════════════════════════
//  H — HAVALE REDDİ
// ═════════════════════════════════════════════════════════════════════════
function havaleDunyasi() {
  const d = dunyaKur();
  d.firma('F1');
  d.db.ekle('abonelik', { id: 'AB1', firmaId: 'F1', paketSurumuId: 'S1', erisimSonu: new Date('2026-12-01T12:00:00Z') });
  const olaylar: any[] = [];
  const abonelikStub = { olayYaz: async (id: string, tip: string, v: any) => void olaylar.push({ id, tip, v }) } as any;
  const havale = new HavaleServisi(d.db.prisma, abonelikStub, {} as any, d.posta.servis);
  const kayit = (id: string, durum: string, ek: Satir = {}) =>
    d.db.ekle('havaleOdemesi', {
      id, abonelikId: 'AB1', durum, tutar: new Prisma.Decimal(16490), paraBirimi: 'TRY', ayAdedi: 12, teklifNo: `HVL-${id}`, ...ek,
    });
  return { ...d, havale, kayit, olaylar };
}

async function hBlogu(): Promise<void> {
  console.log('\n── H · havale reddi: koşullu iptalin kazanan yolu ──');
  {
    const w = havaleDunyasi();
    w.kayit('H1', 'ODEME_BEKLENIYOR');
    const s = await w.havale.iptalEt('H1', 'yonetici-1', 'iç not: dekont eşleşmedi, müşteri huysuz');
    const p = w.posta.giden[0];
    check('H1 ⭐ ödeme beklenen kaydın iptali → müşteriye TEK e-posta (fatura adresi): teklif no, tutar',
      s.durum === 'IPTAL' && w.posta.giden.length === 1 && p.kime === FIRMA_EPOSTA &&
        p.konu === 'MetaPriceX — havale ödeme kaydınız iptal edildi' && iceren(p, /HVL-H1 numaralı ₺16\.490,00/),
      JSON.stringify(w.posta.giden));
    check('H1b ⭐ yöneticinin iç notu müşteriye GİTMEZ', !!p && !JSON.stringify(p).includes('iç not'), JSON.stringify(p?.paragraflar));
    await w.havale.iptalEt('H1', 'yonetici-1', 'tekrar');
    check('H2 ⭐ aynı iptal İKİNCİ kez (yeniden deneme) → e-posta YOK, olay da tek',
      w.posta.giden.length === 1 && w.olaylar.filter((o) => o.tip === 'havale.iptal').length === 1,
      `posta=${w.posta.giden.length} olay=${w.olaylar.length}`);
  }
  {
    const w = havaleDunyasi();
    w.kayit('H3', 'FATURA_KESILDI');
    await Promise.all([w.havale.iptalEt('H3', 'y1', 'a'), w.havale.iptalEt('H3', 'y2', 'b')]);
    check('H3 ⭐ EŞZAMANLI iki iptal → TEK e-posta (koşullu yazımı kazanan gönderir)', w.posta.giden.length === 1,
      `posta=${w.posta.giden.length}`);
  }
  {
    const w = havaleDunyasi();
    w.kayit('H4', 'ONAYLANDI');
    let reddedildi = false;
    try {
      await w.havale.iptalEt('H4', 'y1');
    } catch {
      reddedildi = true;
    }
    check('H4 onaylanmış havalenin iptali REDDEDİLİR → e-posta YOK', reddedildi && w.posta.giden.length === 0,
      `reddedildi=${reddedildi} posta=${w.posta.giden.length}`);
  }
  {
    const w = havaleDunyasi();
    w.kayit('H5', 'ODEME_BEKLENIYOR');
    w.posta.durum.hata = 'SMTP 421';
    const g0 = gunluk.length;
    let hata: string | null = null;
    try {
      await w.havale.iptalEt('H5', 'y1');
    } catch (e) {
      hata = String(e);
    }
    check('H5 posta hatası iptali DÜŞÜRMEZ (satır IPTAL), hata günlükte',
      hata === null && w.db.tablo('havaleOdemesi').find((r) => r.id === 'H5')?.durum === 'IPTAL' &&
        hatalarSonra(g0).some((m) => /Havale iptal bildirimi gönderilemedi/.test(m) && /SMTP 421/.test(m)),
      `hata=${hata} iz=${hatalarSonra(g0).join(' · ')}`);
  }
  {
    const w = havaleDunyasi();
    const f = w.db.tablo('firma').find((r) => r.id === 'F1')!;
    f.faturaEposta = null;
    w.kayit('H6', 'ODEME_BEKLENIYOR');
    await w.havale.iptalEt('H6', 'y1');
    check('H6 fatura adresi yoksa yetkili adresine gider', w.posta.giden.length === 1 && w.posta.giden[0].kime === 'yetkili@yilmaz.test',
      JSON.stringify(w.posta.giden.map((x) => x.kime)));
  }
  {
    const w = havaleDunyasi();
    w.kayit('H7', 'TEKLIF');
    const s = await w.havale.iptalEt('H7', 'y1', 'yanlış açıldı');
    check('H7 ⭐ TEKLİF aşamasındaki kaydın iptali (müşteri ödeme sürecine girmedi) → e-posta YOK, iptal yine yapılır',
      s.durum === 'IPTAL' && w.posta.giden.length === 0, `durum=${s.durum} posta=${w.posta.giden.length}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  İ — İPTAL ONAYI (müşterinin kendi isteği)
// ═════════════════════════════════════════════════════════════════════════
// Tarihler BUGÜNE göre (sabit tarih → saatli bomba dersi): deneme/erişim
// kararı "şimdi"ye bakar.
const ERISIM = () => new Date(Date.now() + 25 * GUN);

function iptalDunyasi(o: { iyzicoHatasi?: boolean } = {}) {
  const d = dunyaKur();
  const iyzicoCagrilari: string[] = [];
  const iyzico = {
    abonelikIptal: async (kod: string) => {
      iyzicoCagrilari.push(kod);
      await Promise.resolve();
      if (o.iyzicoHatasi) throw new IyzicoHatasi('100001', 'Sistem hatası', 500);
      return {};
    },
  } as any;
  const abonelik = new AbonelikServisi(d.db.prisma, iyzico, d.posta.servis);
  const config = new ConfigService({ UYGULAMA_URL: UYGULAMA });
  const satinAlma = new SatinAlmaServisi(d.db.prisma, iyzico, abonelik, config, {} as any, d.posta.servis);
  const satir = (firmaId: string, ek: Satir = {}) => {
    d.firma(firmaId);
    return d.db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', durum: 'AKTIF', erisimSonu: ERISIM(), odemeYontemi: 'KART',
      iyzicoAbonelikKodu: `sub-${firmaId}`, iyzicoDurum: 'ACTIVE', ...ek,
    });
  };
  return { ...d, satinAlma, satir, iyzicoCagrilari };
}

async function iBlogu(): Promise<void> {
  console.log('\n── İ · iptal onayı: yalnız müşterinin isteği, tam bir kez ──');
  {
    const w = iptalDunyasi();
    const ab = w.satir('F1');
    await w.satinAlma.iptalEt('F1', 'u1', 'pahalı', { musteriyeBildir: true });
    const p = w.posta.giden[0];
    check('İ1 ⭐ müşterinin iptali → TEK onay e-postası: dönem sonu tarihi + "yeni ücret çekilmez"; iyzico bir kez',
      w.posta.giden.length === 1 && p.kime === FIRMA_EPOSTA && p.konu === 'MetaPriceX — aboneliğiniz iptal edildi' &&
        iceren(p, /Pro — Mekanik aboneliğinizin iptal talebi alındı/) &&
        iceren(p, new RegExp(`^Ödenmiş döneminiz ${tarihYaz(ab.erisimSonu)} tarihine kadar sürer; bu tarihten sonra kartınızdan yeni ücret çekilmez\\.$`)) &&
        w.iyzicoCagrilari.length === 1 && p.dugme?.url === `${UYGULAMA}/abonelik`,
      JSON.stringify(w.posta.giden));
    await w.satinAlma.iptalEt('F1', 'u1', 'tekrar', { musteriyeBildir: true });
    check('İ2 ⭐ SIRALI ikinci iptal (satır zaten IPTAL) → e-posta YOK', w.posta.giden.length === 1,
      `posta=${w.posta.giden.length}`);
  }
  {
    const w = iptalDunyasi();
    w.satir('F2');
    await Promise.all([
      w.satinAlma.iptalEt('F2', 'u1', 'a', { musteriyeBildir: true }),
      w.satinAlma.iptalEt('F2', 'u1', 'b', { musteriyeBildir: true }),
    ]);
    check('İ3 ⭐ EŞZAMANLI çift tık → TEK e-posta (koşullu iptal yazımı tek kazanan)', w.posta.giden.length === 1,
      `posta=${w.posta.giden.length} iyzico=${w.iyzicoCagrilari.length}`);
  }
  {
    const w = iptalDunyasi();
    w.satir('F3');
    await w.satinAlma.iptalEt('F3', 'u1', 'hesap kapatma');
    w.satir('F3b');
    await w.satinAlma.iptalEt('F3b', 'y1', 'yonetici silme', {});
    check('İ4 ⭐ bayraksız çağrı (hesap kapatma / yönetici silme) → e-posta YOK, iptal YİNE yapılır',
      w.posta.giden.length === 0 && w.db.tablo('abonelik').filter((r) => r.durum === 'IPTAL').length === 2,
      `posta=${w.posta.giden.length}`);
  }
  {
    const w = iptalDunyasi();
    const cekim = new Date(Date.now() + 6 * GUN);
    w.satir('F5', { durum: 'DENEME', denemeSonu: cekim, erisimSonu: new Date(cekim.getTime() + 2 * GUN) });
    await w.satinAlma.iptalEt('F5', 'u1', undefined, { musteriyeBildir: true });
    check('İ5 denemede iptal → "Deneme süreniz <İLK ÇEKİM GÜNÜ>… ücret çekilmeyecek" (tamponlu erişim sonu DEĞİL)',
      iceren(w.posta.giden[0], new RegExp(`^Deneme süreniz ${tarihYaz(cekim)} tarihine kadar sürer; kartınızdan ücret çekilmeyecek\\.$`)),
      JSON.stringify(w.posta.giden[0]?.paragraflar));
  }
  {
    const w = iptalDunyasi();
    const ab = w.satir('F6', { odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null, iyzicoDurum: null });
    await w.satinAlma.iptalEt('F6', 'u1', undefined, { musteriyeBildir: true });
    check('İ6 havaleli abonelik → kart cümlesi YOK, iyzico\'ya gidilmez',
      iceren(w.posta.giden[0], new RegExp(`^Ödenmiş döneminiz ${tarihYaz(ab.erisimSonu)} tarihine kadar sürer\\.$`)) &&
        w.iyzicoCagrilari.length === 0,
      JSON.stringify(w.posta.giden[0]?.paragraflar));
  }
  {
    const w = iptalDunyasi();
    w.satir('F7', {
      paketSurumuId: 'S1', odenenPaketSurumuId: 'S0', paketGecisTarihi: new Date(Date.now() + 10 * GUN),
    });
    await w.satinAlma.iptalEt('F7', 'u1', undefined, { musteriyeBildir: true });
    check('İ7 yükseltmenin ücreti başlamadan iptal → e-posta ÖDENMİŞ paketi (Basic) yazar ve "paketine döndü" der',
      iceren(w.posta.giden[0], /Basic — Mekanik aboneliğinizin iptal talebi alındı/) &&
        iceren(w.posta.giden[0], /ödediğiniz Basic — Mekanik paketine döndü/),
      JSON.stringify(w.posta.giden[0]?.paragraflar));
  }
  {
    const w = iptalDunyasi({ iyzicoHatasi: true });
    w.satir('F8');
    let hata = false;
    try {
      await w.satinAlma.iptalEt('F8', 'u1', undefined, { musteriyeBildir: true });
    } catch {
      hata = true;
    }
    check('İ8 iyzico iptali DÜŞERSE iptal olmaz → onay e-postası YOK (yalan onay yok)',
      hata && w.posta.giden.length === 0 && w.db.tablo('abonelik')[0].durum === 'AKTIF',
      `hata=${hata} posta=${w.posta.giden.length}`);
  }
  {
    // Eskiden iptal edilmiş, sonra havaleyle yeniden AKTIF olmuş satır:
    // `iptalTalebi` bayat kalır (havale onayı temizlemez). Yeni iptal YİNE onaylanır.
    const w = iptalDunyasi();
    w.satir('F9', { odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null, iptalTalebi: new Date(Date.now() - 200 * GUN) });
    await w.satinAlma.iptalEt('F9', 'u1', undefined, { musteriyeBildir: true });
    check('İ9 bayat iptalTalebi olan AKTIF satır iptal edilince onay GİDER (koşul okunan anlık görüntüye göre)',
      w.posta.giden.length === 1, `posta=${w.posta.giden.length}`);
  }
  {
    const w = iptalDunyasi();
    w.satir('F10');
    w.posta.durum.hata = 'SMTP 421';
    const g0 = gunluk.length;
    let hata: string | null = null;
    try {
      await w.satinAlma.iptalEt('F10', 'u1', undefined, { musteriyeBildir: true });
    } catch (e) {
      hata = String(e);
    }
    check('İ10 posta hatası iptali DÜŞÜRMEZ, hata günlükte',
      hata === null && w.db.tablo('abonelik')[0].durum === 'IPTAL' &&
        hatalarSonra(g0).some((m) => /Iptal onayi e-postasi gonderilemedi/.test(m) && /SMTP 421/.test(m)),
      `hata=${hata} iz=${hatalarSonra(g0).join(' · ')}`);
  }
  {
    // İnceleme M2: son yenileme alınamamış satır — `erisimSonu` GEÇMİŞ.
    const w = iptalDunyasi();
    w.satir('F11', { durum: 'ODEME_BEKLIYOR', iyzicoDurum: 'UNPAID', erisimSonu: new Date(Date.now() - 3 * GUN) });
    await w.satinAlma.iptalEt('F11', 'u1', undefined, { musteriyeBildir: true });
    const p = w.posta.giden[0];
    check('İ11 ⭐ ödeme bekleyen satırın iptali: "ödenmiş döneminiz" ve "devam edebilirsiniz" YOK; yeniden çekim yok, erişim sona erdi',
      !!p && !iceren(p, /Ödenmiş döneminiz|devam edebilirsiniz/) &&
        iceren(p, /^Tahsil edilemeyen ödeme için kartınızdan yeniden çekim yapılmayacak; yeni ücret de çekilmeyecek\.$/) &&
        iceren(p, /^Ödenmemiş dönem nedeniyle erişiminiz sona erdi\.$/),
      JSON.stringify(p?.paragraflar));
  }
  {
    // İnceleme M8: eski mutabakatın AKTIF'e çektiği deneme (ilk çekim hâlâ gelecekte).
    const w = iptalDunyasi();
    const cekim = new Date(Date.now() + 4 * GUN);
    w.satir('F12', { durum: 'AKTIF', denemeSonu: cekim, erisimSonu: new Date(cekim.getTime() + 2 * GUN) });
    await w.satinAlma.iptalEt('F12', 'u1', undefined, { musteriyeBildir: true });
    check('İ12 ⭐ etiketi AKTIF ama ilk çekimi gelecekte olan satır DENEME metnini alır (tarihe dayalı kural)',
      iceren(w.posta.giden[0], new RegExp(`^Deneme süreniz ${tarihYaz(cekim)} tarihine kadar sürer; kartınızdan ücret çekilmeyecek\\.$`)),
      JSON.stringify(w.posta.giden[0]?.paragraflar));
  }
  {
    const w = iptalDunyasi();
    const ab = w.satir('F13', {
      paketSurumuId: 'S1', odenenPaketSurumuId: 'S0', paketGecisTarihi: new Date(Date.now() + 10 * GUN),
    });
    await Promise.all([
      w.satinAlma.iptalEt('F13', 'u1', 'a', { musteriyeBildir: true }),
      w.satinAlma.iptalEt('F13', 'u1', 'b', { musteriyeBildir: true }),
    ]);
    const geri = w.db.tablo('abonelikOlayi').filter((o) => o.abonelikId === ab.id && o.tip === 'paket.geri.alindi');
    check('İ13 yazımı KAYBEDEN eşzamanlı iptal "paket geri alındı" olayını İKİNCİ kez yazmaz', geri.length === 1,
      `olay=${geri.length} posta=${w.posta.giden.length}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  Ö — YENİLEME "ÖDEMENİZ ALINDI"
// ═════════════════════════════════════════════════════════════════════════
function odemeDunyasi(o: { epostasiz?: boolean; gecikme?: number } = {}) {
  const d = dunyaKur();
  d.firma('F1');
  d.db.ekle('abonelik', { id: 'AB1', firmaId: 'F1', paketSurumuId: 'S1', erisimSonu: new Date('2026-10-20T12:00:00Z') });
  const tahsilat = {
    cagri: 0,
    sonuc: {
      abonelik: { id: 'AB1', paketSurumu: { tutar: new Prisma.Decimal(1649), paraBirimi: 'TRY' } },
      siparis: { paidPrice: 1649, startPeriod: new Date('2026-09-20T12:00:00Z').getTime() } as any,
      donemSonu: new Date('2026-10-20T12:00:00Z'),
      dunningdenCikti: false,
    } as any,
  };
  const abonelikStub = {
    tahsilatBasarili: async () => {
      tahsilat.cagri++;
      // Bekleme: eşzamanlı ikinci işlemcinin araya girebileceği pencere.
      if (o.gecikme) await new Promise((r) => setTimeout(r, o.gecikme));
      return tahsilat.sonuc;
    },
  } as any;
  const dunningCagrilari: Array<{ id: string; cikti: boolean }> = [];
  const dunningStub = {
    tahsilatToparlandi: async (id: string, cikti: boolean) => void dunningCagrilari.push({ id, cikti }),
  } as any;
  const fatura = new FaturaServisi(d.db.prisma, { ad: 'sahte', faturaKes: async () => ({ saglayiciId: 's' }) } as any, d.posta.servis);
  const isleyici = o.epostasiz
    ? new WebhookIsleyici(d.db.prisma, abonelikStub, fatura, dunningStub)
    : new WebhookIsleyici(d.db.prisma, abonelikStub, fatura, dunningStub, d.posta.servis);
  const isle = (siparis: string) => (isleyici as any).basariliTahsilat('sub-1', siparis) as Promise<void>;
  return { ...d, tahsilat, dunningCagrilari, isle, isleyici };
}

async function oBlogu(): Promise<void> {
  console.log('\n── Ö · yenileme "ödemeniz alındı": fatura satırı tekil, dunning ile ayrık ──');
  {
    const w = odemeDunyasi();
    await w.isle('ord-1');
    const p = w.posta.giden[0];
    check('Ö1 ⭐ sorunsuz yenileme → TEK makbuz: tutar (paidPrice), ödenen dönem, fatura adresi',
      w.posta.giden.length === 1 && p.kime === FIRMA_EPOSTA && p.konu === 'MetaPriceX — ödemeniz alındı' &&
        p.baslik === 'Ödemeniz için teşekkürler' && iceren(p, /₺1\.649,00 tutarındaki ödemesi kayıtlı kartınızdan alındı/) &&
        iceren(p, /^Ödenen dönem: 20 Eylül 2026 – 20 Ekim 2026\.$/) && w.db.tablo('fatura').length === 1,
      JSON.stringify(w.posta.giden));
    await w.isle('ord-1');
    check('Ö2 ⭐ AYNI sipariş yeniden işlenir (webhook tekrarı / mutabakat oynatması) → makbuz YOK, fatura tek',
      w.posta.giden.length === 1 && w.db.tablo('fatura').length === 1, `posta=${w.posta.giden.length} fatura=${w.db.tablo('fatura').length}`);
    await w.isle('ord-2');
    check('Ö2b sonraki ayın YENİ siparişi → yeni makbuz', w.posta.giden.length === 2, `posta=${w.posta.giden.length}`);
  }
  {
    const w = odemeDunyasi();
    w.tahsilat.sonuc.dunningdenCikti = true;
    await w.isle('ord-1');
    check('Ö3 ⭐ dunning\'den ÇIKIŞ → yenileme makbuzu YOK (dunning kendi "ödemeniz alındı"sını gönderir; ikisi birlikte gitmez)',
      w.posta.giden.length === 0 && w.dunningCagrilari.length === 1 && w.dunningCagrilari[0].cikti === true,
      `posta=${w.posta.giden.length} dunning=${JSON.stringify(w.dunningCagrilari)}`);
  }
  {
    const w = odemeDunyasi();
    w.tahsilat.sonuc = null;
    await w.isle('ord-1');
    check('Ö4 tahsilat işlenmediyse (havale satırı / eşleşmeyen) → makbuz YOK, fatura YOK',
      w.posta.giden.length === 0 && w.db.tablo('fatura').length === 0);
  }
  {
    const w = odemeDunyasi();
    await Promise.all([w.isle('ord-1'), w.isle('ord-1')]);
    check('Ö5 ⭐ aynı sipariş EŞZAMANLI iki kez → TEK makbuz (fatura satırının tekilliği)',
      w.posta.giden.length === 1 && w.db.tablo('fatura').length === 1, `posta=${w.posta.giden.length}`);
  }
  {
    const w = odemeDunyasi();
    w.posta.durum.hata = 'SMTP 421';
    const g0 = gunluk.length;
    let hata: string | null = null;
    try {
      await w.isle('ord-1');
    } catch (e) {
      hata = String(e);
    }
    check('Ö6 posta hatası tahsilat olayını DÜŞÜRMEZ, hata günlükte',
      hata === null && hatalarSonra(g0).some((m) => /Yenileme "ödemeniz alındı" e-postası gönderilemedi/.test(m) && /SMTP 421/.test(m)),
      `hata=${hata} iz=${hatalarSonra(g0).join(' · ')}`);
  }
  {
    // Eski 4 argümanlı fikstürler (dunning-toparlandi, mutabakat, webhook,
    // havale kapıları) günlüğün TEMİZ olduğunu ölçer: iz DEBUG'da kalmalı.
    const w = odemeDunyasi({ epostasiz: true });
    const g0 = gunluk.length;
    await w.isle('ord-1');
    const iz = gunluk.slice(g0);
    check('Ö7 e-posta servisi yoksa ÇÖKMEZ; HATA/UYARI yazmaz (eski fikstürler temiz günlük ölçer), iz DEBUG\'da',
      w.db.tablo('fatura').length === 1 && !iz.some((g) => g.seviye === 'hata' || g.seviye === 'uyari') &&
        iz.some((g) => g.seviye === 'ayrinti' && /e-posta servisi yok/.test(g.metin)),
      JSON.stringify(iz));
  }
  {
    const w = odemeDunyasi();
    w.tahsilat.sonuc.siparis = { paidPrice: 1649, startPeriod: 'bozuk' };
    await w.isle('ord-1');
    check('Ö8 dönem başı çözülemezse makbuz "… tarihine kadar geçerli" der (Invalid Date YAZMAZ)',
      iceren(w.posta.giden[0], /^Aboneliğiniz 20 Ekim 2026 tarihine kadar geçerli\.$/) &&
        !iceren(w.posta.giden[0], /Invalid/),
      JSON.stringify(w.posta.giden[0]?.paragraflar));
  }
  {
    // İnceleme M4: denetleyicinin anlık dürtmesi ile dakikalık tarama AYNI
    // olayı birlikte işlerse dunning e-postası ile makbuz AYRI işlemcilerde
    // kazanılabiliyordu. Süreç içi olay kilidi ikinci işlemeyi hiç başlatmaz.
    const w = odemeDunyasi({ gecikme: 30 });
    w.db.ekle('webhookOlayi', {
      id: 'W1', olayTipi: 'subscription.order.success', abonelikKodu: 'sub-1', siparisKodu: 'ord-9',
      islendi: false, denemeSayisi: 0, hata: null,
    });
    await Promise.all([(w.isleyici as any).tekOlayIsle('W1'), (w.isleyici as any).tekOlayIsle('W1')]);
    check('Ö9 ⭐ AYNI olay aynı süreçte eşzamanlı iki kez → tahsilat yolu BİR kez koşar (olay kilidi), tek makbuz, olay işlendi',
      w.tahsilat.cagri === 1 && w.posta.giden.length === 1 && w.db.tablo('webhookOlayi')[0].islendi === true,
      `tahsilat=${w.tahsilat.cagri} posta=${w.posta.giden.length}`);
    await (w.isleyici as any).tekOlayIsle('W1');
    check('Ö9b kilit bırakılır: işlenmiş olay yeniden istenirse erken döner (tahsilat yolu yine BİR kez)', w.tahsilat.cagri === 1,
      `tahsilat=${w.tahsilat.cagri}`);
  }
  {
    // Kilit HATADA da bırakılmalı: düşen olay taramayla YENİDEN denenir.
    const w = odemeDunyasi();
    w.db.ekle('webhookOlayi', {
      id: 'W2', olayTipi: 'subscription.order.success', abonelikKodu: 'sub-1', siparisKodu: 'ord-10',
      islendi: false, denemeSayisi: 0, hata: null,
    });
    const asil = w.tahsilat.sonuc;
    let ilk = true;
    (w.isleyici as any).abonelik.tahsilatBasarili = async () => {
      w.tahsilat.cagri++;
      if (ilk) {
        ilk = false;
        throw new Error('iyzico geçici hata');
      }
      return asil;
    };
    await (w.isleyici as any).tekOlayIsle('W2').catch(() => undefined);
    await (w.isleyici as any).tekOlayIsle('W2');
    const olay = w.db.tablo('webhookOlayi')[0];
    check('Ö9c ⭐ kilit HATADA da bırakılır: düşen olay yeniden denenir ve işlenir (sonsuza dek kilitli kalmaz)',
      w.tahsilat.cagri === 2 && olay.islendi === true && olay.denemeSayisi === 1 && w.posta.giden.length === 1,
      `tahsilat=${w.tahsilat.cagri} islendi=${olay.islendi} deneme=${olay.denemeSayisi}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  D — DENEME BİTİYOR (3 gün kala, bir kez)
// ═════════════════════════════════════════════════════════════════════════
const SIMDI = new Date('2026-10-01T06:00:00Z'); // 1 Ekim 09:00 İstanbul
const saat = (iso: string) => new Date(iso);

function denemeDunyasi() {
  const d = dunyaKur();
  const servis = () => new DenemeHatirlatmasiServisi(d.db.prisma, d.posta.servis, new ConfigService({ UYGULAMA_URL: UYGULAMA }));
  const satir = (firmaId: string, ek: Satir) => {
    d.firma(firmaId);
    return d.db.ekle('abonelik', {
      firmaId, paketSurumuId: 'S1', durum: 'DENEME', odemeYontemi: 'KART', iyzicoAbonelikKodu: `sub-${firmaId}`,
      iyzicoDurum: 'ACTIVE', erisimSonu: new Date((ek.denemeSonu ?? SIMDI).getTime() + 2 * GUN), ...ek,
    });
  };
  return { ...d, servis, satir };
}

async function dBlogu(): Promise<void> {
  console.log('\n── D · deneme bitiyor: 3 gün kala (takvim günü), bir kez ──');
  const w = denemeDunyasi();
  // Pencere: 1 Ekim 09:00 → 4 Ekim 23:59:59 İstanbul (= 2026-10-04T20:59:59Z).
  const A = w.satir('A', { denemeSonu: saat('2026-10-03T18:00:00Z') });
  const B = w.satir('B', { denemeSonu: saat('2026-10-05T06:00:00Z') });
  w.satir('C', { denemeSonu: new Date(SIMDI.getTime() - SAAT) });
  w.satir('Dx', { denemeSonu: saat('2026-10-03T06:00:00Z'), iptalTalebi: new Date(SIMDI.getTime() - GUN) });
  w.satir('E', { denemeSonu: saat('2026-10-03T06:00:00Z'), odemeYontemi: 'HAVALE' });
  const F = w.satir('F', { denemeSonu: saat('2026-10-03T06:00:00Z'), durum: 'AKTIF' });
  w.satir('G', { denemeSonu: saat('2026-10-03T06:00:00Z'), denemeHatirlatmasi: new Date(SIMDI.getTime() - GUN) });
  const H = w.satir('H', { denemeSonu: saat('2026-10-04T06:00:00Z'), planliPaketSurumuId: 'S0' });
  const J = w.satir('J', { denemeSonu: saat('2026-10-04T20:00:00Z') });
  w.satir('K', { denemeSonu: saat('2026-09-01T06:00:00Z'), durum: 'AKTIF' });
  w.satir('L', { denemeSonu: saat('2026-10-03T06:00:00Z'), iyzicoDurum: 'CANCELED' });

  const s = w.servis();
  const r1 = await s.tara(SIMDI);
  const kimin = (harf: string) => w.posta.giden.find((p) => p.paragraflar[0].startsWith(`Yılmaz ${harf} `));
  check('D1 ⭐ penceredeki KART + denemede + iptalsiz + iyzico\'da açık + gönderilmemiş satırlar: A, F, H, J (dışarıda: B C Dx E G K L)',
    r1.aday === 4 && r1.gonderilen === 4 && w.posta.giden.length === 4 && ['A', 'F', 'H', 'J'].every((h) => !!kimin(h)) &&
      w.posta.giden.every((p) => p.kip === 'kritik' && p.kime === FIRMA_EPOSTA),
    `sonuç=${JSON.stringify(r1)} alanlar=${w.posta.giden.map((p) => p.paragraflar[0].split(' ')[1]).join(',')}`);
  const pA = kimin('A');
  check('D1b içerik: çekim günü (konu + gövde, İstanbul günü), KDV dahil tutar, "aylık yenilenecek", önce iptal talimatı',
    !!pA && pA.konu === 'MetaPriceX — deneme süreniz 3 Ekim 2026 tarihinde bitiyor' &&
      iceren(pA, /₺1\.649,00 \(KDV dahil\) çekilecek ve aboneliğiniz aylık yenilenecek/) &&
      iceren(pA, /3 Ekim 2026 tarihinden önce Abonelik sayfasından iptal edin/),
    JSON.stringify(pA));
  check('D1c planlı paket değişimi olan satırda TUTAR YAZILMAZ (yanlış söz yok)',
    !!kimin('H') && !kimin('H')!.paragraflar.some((x) => /₺/.test(x)) && iceren(kimin('H'), /ilk ödeme çekilecek/),
    JSON.stringify(kimin('H')?.paragraflar));
  check('D1d ⭐ "3 gün kala" TAKVİM günü: 4 Ekim 23:00 İstanbul çekimi (J) 1 Ekim sabahı alır — 72 saat penceresi onu kaçırıyordu',
    !!kimin('J') && kimin('J')!.konu === 'MetaPriceX — deneme süreniz 4 Ekim 2026 tarihinde bitiyor',
    kimin('J')?.konu);
  check('D1e ⭐ etiketi AKTIF ama ilk çekimi gelecekte olan satır (F) denemededir → hatırlatma alır',
    !!kimin('F') && F.denemeHatirlatmasi?.getTime() === SIMDI.getTime());
  check('D1f işaret YALNIZ gönderilen satırlara yazıldı', A.denemeHatirlatmasi?.getTime() === SIMDI.getTime() &&
    H.denemeHatirlatmasi?.getTime() === SIMDI.getTime() && J.denemeHatirlatmasi?.getTime() === SIMDI.getTime() &&
    B.denemeHatirlatmasi === null);

  const r2 = await s.tara(new Date(SIMDI.getTime() + 60_000));
  check('D2 ⭐ ikinci tur (aynı gün) → e-posta YOK', r2.gonderilen === 0 && w.posta.giden.length === 4, JSON.stringify(r2));
  const r3 = await s.tara(new Date(SIMDI.getTime() + GUN));
  check('D3 B, penceresine girdiği gün (2 Ekim sabahı) BİR kez alır; diğerleri yeniden almaz',
    r3.gonderilen === 1 && w.posta.giden.length === 5 && w.posta.giden[4].paragraflar[0].startsWith('Yılmaz B '),
    JSON.stringify(r3));

  {
    // İki SÜREÇ (iki servis örneği, ayrı tur kilitleri) aynı anda.
    const v = denemeDunyasi();
    for (const id of ['P', 'Q', 'R']) v.satir(id, { denemeSonu: saat('2026-10-03T06:00:00Z') });
    await Promise.all([v.servis().tara(SIMDI), v.servis().tara(SIMDI)]);
    check('D4 ⭐ iki süreç aynı anda tarar → her satıra TEK e-posta (koşullu işaret)', v.posta.giden.length === 3,
      `posta=${v.posta.giden.length}`);
  }
  {
    // Aynı süreçte örtüşen iki tur: ikincisi hiç sorgulamaz.
    const v = denemeDunyasi();
    v.satir('P', { denemeSonu: saat('2026-10-03T06:00:00Z') });
    const s2 = v.servis();
    const once = v.db.cagrilar.filter((c) => c === 'abonelik.findMany').length;
    const [ra, rb] = await Promise.all([s2.tara(SIMDI), s2.tara(SIMDI)]);
    const sonra = v.db.cagrilar.filter((c) => c === 'abonelik.findMany').length;
    check('D5 tur kilidi: örtüşen ikinci tur kuyruğa bakmaz', sonra - once === 1 && ra.aday + rb.aday === 1 && v.posta.giden.length === 1,
      `sorgu=${sonra - once} aday=${ra.aday}+${rb.aday}`);
  }
  {
    const v = denemeDunyasi();
    const P = v.satir('P', { denemeSonu: saat('2026-10-03T06:00:00Z') });
    v.posta.durum.hata = 'SMTP 421';
    const g0 = gunluk.length;
    const ra = await v.servis().tara(SIMDI);
    check('D6 ⭐ gönderim DÜŞERSE işaret GERİ alınır (null) ve hata günlükte',
      ra.dusen === 1 && P.denemeHatirlatmasi === null && v.posta.giden.length === 0 &&
        hatalarSonra(g0).some((m) => /Deneme hatirlatmasi gonderilemedi/.test(m) && /SMTP 421/.test(m)),
      `sonuç=${JSON.stringify(ra)} işaret=${P.denemeHatirlatmasi}`);
    v.posta.durum.hata = null;
    const rb = await v.servis().tara(new Date(SIMDI.getTime() + 60_000));
    check('D6b SMTP düzelince sonraki tur BİR kez gönderir', rb.gonderilen === 1 && v.posta.giden.length === 1, JSON.stringify(rb));
  }
  {
    // Sorgudan SONRA iptal: işaret yazımı aday koşulunu yeniden sınar.
    const v = denemeDunyasi();
    const P = v.satir('P', { denemeSonu: saat('2026-10-03T06:00:00Z') });
    const s3 = v.servis();
    const anlik = { ...P, paketSurumu: { tutar: new Prisma.Decimal(1649), paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1, paket: { ad: 'Pro — Mekanik' } } };
    P.iptalTalebi = new Date(SIMDI.getTime() - 60_000);
    const sonuc = await (s3 as any).tekHatirlatma(anlik, SIMDI);
    check('D7 ⭐ sorgu ile işaret arasında iptal edilen satıra e-posta GİTMEZ', sonuc === 'atlandi' && v.posta.giden.length === 0,
      `sonuç=${sonuc} posta=${v.posta.giden.length}`);
  }
  check('D8 pencere sabiti 3 gün (Emre kararı)', DENEME_HATIRLATMA_GUNU === 3);
  {
    // Kısa deneme / deploy günü: çekime saatler kaldı.
    const v = denemeDunyasi();
    v.satir('S', { denemeSonu: new Date(SIMDI.getTime() + 10 * SAAT) });
    await v.servis().tara(SIMDI);
    check('D9 çekime 24 saatten az kaldıysa "hemen iptal edin" (yapılamaz "tarihinden önce" YOK)',
      iceren(v.posta.giden[0], /^Devam etmek istemiyorsanız hemen Abonelik sayfasından iptal edin/) &&
        !iceren(v.posta.giden[0], /tarihinden önce/),
      JSON.stringify(v.posta.giden[0]?.paragraflar));
  }
  check('D10 İstanbul gün sonu: 1 Ekim 09:00 + 3 gün → 4 Ekim 23:59:59.999 İstanbul',
    istanbulGunSonu(new Date(SIMDI.getTime() + 3 * GUN)).toISOString() === '2026-10-04T20:59:59.999Z',
    istanbulGunSonu(new Date(SIMDI.getTime() + 3 * GUN)).toISOString());
}

// ═════════════════════════════════════════════════════════════════════════
//  N — BAĞLANTI
// ═════════════════════════════════════════════════════════════════════════
async function nBlogu(): Promise<void> {
  console.log('\n── N · bağlantı ──');
  {
    const cagrilar: any[] = [];
    const satinAlmaStub = { iptalEt: async (...a: any[]) => void cagrilar.push(a) } as any;
    const ctrl = new AbonelikController({} as any, satinAlmaStub, {} as any, {} as any, {} as any, {} as any);
    await ctrl.iptal({ id: 'u1', firmaId: 'F1' }, { neden: 'pahalı' });
    check('N1 ⭐ müşterinin "Aboneliğimi iptal et" ucu onay bayrağını VERİR',
      cagrilar.length === 1 && cagrilar[0][0] === 'F1' && cagrilar[0][3]?.musteriyeBildir === true, JSON.stringify(cagrilar));
  }
  {
    const hesap = yorumsuz(readFileSync(join(KOK, 'backend/src/altyapi/auth/hesap.servisi.ts'), 'utf8'));
    const admin = yorumsuz(readFileSync(join(KOK, 'backend/src/ozellik/kutuphane/admin/admin.service.ts'), 'utf8'));
    const cagri = (k: string) => (k.match(/satinAlma\.iptalEt\(/g) ?? []).length;
    check('N2 hesap kapatma ve yönetici silme onay bayrağını VERMEZ (dosyada `musteriyeBildir` HİÇ geçmez)',
      cagri(hesap) === 1 && cagri(admin) === 1 && !/musteriyeBildir/.test(hesap) && !/musteriyeBildir/.test(admin),
      `çağrı=${cagri(hesap)}/${cagri(admin)}`);
  }
  for (const [ad, kurucu] of [
    ['WebhookIsleyici', 'isleyici'],
    ['DenemeHatirlatmasiServisi', 'deneme'],
  ] as const) {
    const posta = sahteEposta();
    const db = bellekPrisma();
    @Module({
      providers: [
        { provide: PrismaService, useValue: db.prisma },
        { provide: EpostaServisi, useValue: posta.servis },
        { provide: ConfigService, useValue: new ConfigService({ UYGULAMA_URL: UYGULAMA }) },
        { provide: AbonelikServisi, useValue: {} },
        { provide: FaturaServisi, useValue: {} },
        { provide: DunningServisi, useValue: {} },
        WebhookIsleyici,
        DenemeHatirlatmasiServisi,
      ],
    })
    class BaglantiModulu {}
    let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
    try {
      app = await NestFactory.createApplicationContext(BaglantiModulu, { logger: gunlukServisi, abortOnError: false });
      if (kurucu === 'isleyici') {
        const i = app.get(WebhookIsleyici) as any;
        check('N3 ⭐ Nest, WebhookIsleyici\'ye EpostaServisi\'ni enjekte ediyor (tip meta verisi doğru)', i.eposta === posta.servis,
          `eposta=${i.eposta?.constructor?.name}`);
      } else {
        const s = app.get(DenemeHatirlatmasiServisi) as any;
        check('N4 ⭐ Nest, DenemeHatirlatmasiServisi\'ni kurar (Prisma + e-posta enjekte)', s.prisma === db.prisma && s.eposta === posta.servis);
      }
    } catch (e) {
      check(`N3/N4 ${ad} Nest'te kurulamadı`, false, e instanceof Error ? e.message : String(e));
    } finally {
      await app?.close();
      Logger.overrideLogger(gunlukServisi);
    }
  }
  const cron = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', DenemeHatirlatmasiServisi.prototype.gunlukTarama);
  check('N5 ⭐ tarama her gün 09:00 İstanbul\'da koşar (cron meta verisi)',
    cron?.cronTime === '0 9 * * *' && cron?.timeZone === 'Europe/Istanbul', JSON.stringify(cron));
  const modul = yorumsuz(readFileSync(join(KOK, 'backend/src/ozellik/odeme/odeme.module.ts'), 'utf8'));
  check('N6 odeme.module providers GÖVDESİNDE DenemeHatirlatmasiServisi kayıtlı (kayıtsız @Cron hiç koşmaz)',
    /(^|[\s,])DenemeHatirlatmasiServisi\s*,/.test(diziGovdesi(modul, 'providers')));
  const goc = readFileSync(join(KOK, 'backend/prisma/migrations/20260925150000_abonelik_deneme_hatirlatmasi/migration.sql'), 'utf8')
    .replace(/^\s*--.*$/gm, '');
  check('N7 göç (yorumlar soyulmuş) YALNIZ ekler: Abonelik.denemeHatirlatmasi TIMESTAMP(3), DROP/DELETE/UPDATE yok',
    /ALTER TABLE "Abonelik" ADD COLUMN\s+"denemeHatirlatmasi" TIMESTAMP\(3\);/.test(goc) && !/\b(DROP|DELETE|UPDATE)\b/.test(goc),
    goc.trim());
}

// ═════════════════════════════════════════════════════════════════════════
async function blok(ad: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    check(`${ad} bloğu FIRLATTI`, false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
  }
}

async function main(): Promise<void> {
  console.log('MÜŞTERİ E-POSTALARI — tam bir kez');
  const onceki = process.env.UYGULAMA_URL;
  process.env.UYGULAMA_URL = UYGULAMA;
  try {
    await blok('M', mBlogu);
    await blok('H', hBlogu);
    await blok('İ', iBlogu);
    await blok('Ö', oBlogu);
    await blok('D', dBlogu);
    await blok('N', nBlogu);
  } finally {
    if (onceki === undefined) delete process.env.UYGULAMA_URL;
    else process.env.UYGULAMA_URL = onceki;
  }
  console.log(`\n${'='.repeat(64)}\nMÜŞTERİ E-POSTALARI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    console.log('KIRMIZI:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
