/**
 * FAZ 6.9 — FİRMA ÇEVİRİ DÜZELTMESİ (`npm run test:ceviri-duzeltme`)
 *
 * DB'siz, deterministik (sahte Prisma: `ceviri-sahte-db.ts`). Bloklar:
 *  L) SAF KATMAN — `katmanlariBirlestir` / `kaynakOzeti` (firma ortağı EZER, silmez).
 *  S) KAPSAM — A firmasının düzeltmesi B'yi etkilemez; düzeltmesiz terim ortaktan
 *     gelir ve API'ye GİTMEZ; ortak katman değeri hiçbir yanıttan çıkmaz.
 *  U) ÇAĞIRAN KAYDI — her yazım aynı transaction'da olay bırakır (K-T12), kilit
 *     okumadan/sayımdan/yazmadan ÖNCE.
 *  K) KAPI — yetenek, e-posta, hız sınırı izleyicisi, tavanlar, kaynak kapıları.
 *  E) UZUNLUK — DTO tavanı ve GERÇEK HTTP gövde tavanı (json + urlencoded).
 *  Z) ZEHİRLEME — `ceviriGuvenliMi` (K-T11) ve hepsi-ya-da-hiçbiri (K-T7) ilişkisi.
 *  G) DIŞA AKTARIM — firma karşılığı dosyaya iner; kayıtta İngilizce hücre değişmez.
 *  M) ÖLÇÜM — deploy öncesi süzgeç ölçüm betiği (salt okuma).
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 1 = FAIL (`process.exitCode`, Windows dersi).
 */
import 'reflect-metadata';
import * as http from 'http';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector, NestFactory } from '@nestjs/core';
import { Controller, Module, Post, Put } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as fs from 'fs';
import * as path from 'path';
import { kaynakOzeti, katmanlariBirlestir } from '../src/ozellik/giris/ai/ceviri-katmani';
import { ceviriGuvenliMi, ceviriIcerigi } from '../src/ozellik/giris/ai/ceviri-kurali';
import {
  CeviriDuzeltmeServisi,
  DUZELTME_METNI,
  FIRMA_DUZELTME_TAVANI,
  GUNLUK_DUZELTME_TAVANI,
  turkiyeGunBaslangici,
} from '../src/ozellik/giris/ai/ceviri-duzeltme.servisi';
import { CeviriDuzeltmeController } from '../src/ozellik/giris/ai/ceviri-duzeltme.controller';
import { CeviriFirmaDuzeltmeDto } from '../src/ozellik/giris/ai/dto/ceviri-duzeltme.dto';
import { CeviriService } from '../src/ozellik/giris/ai/ceviri.service';
import { CeviriKotaServisi } from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { ErisimGuard, YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { ErisimServisi, Yetenek, type ErisimKarari } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { KullaniciHizSiniriGuard } from '../src/altyapi/auth/guards/kullanici-hiz-siniri.guard';
import { govdeSinirlariniKur } from '../src/altyapi/http/govde-siniri';
import { HesapServisi } from '../src/altyapi/auth/hesap.servisi';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { suzgecOlc } from '../scripts/ceviri-suzgec-olcum';
import { sahteDb, type Kayit } from './ceviri-sahte-db';

delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

async function hata(fn: () => Promise<unknown>): Promise<any> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}
const yanit = (e: any) => (typeof e?.getResponse === 'function' ? e.getResponse() : {});
const durum = (e: any) => (typeof e?.getStatus === 'function' ? e.getStatus() : 0);
const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;

const Q = '7f3a1c2e-0b4d-4a11-9c8e-1d2f3a4b5c60'; // f1
const Q2 = '7f3a1c2e-0b4d-4a11-9c8e-1d2f3a4b5c61'; // f2 (aynı içerik)
const Q_EK = '7f3a1c2e-0b4d-4a11-9c8e-1d2f3a4b5c62'; // f1, iki katmanda da olmayan terimli
const K1 = { userId: 'u1', firmaId: 'f1' };
const KF2 = { userId: 'u2', firmaId: 'f2' };
const KDOG = { userId: 'u3', firmaId: 'f1' }; // e-posta doğrulanmamış
const EPOSTA1 = 'uye@firma-a.com';
const EPOSTA2 = 'uye@firma-b.com';

/** Sabit "şimdi": günlük tavanın gün sınırı koşum saatine göre KAYMAZ (kararsız test yasağı). */
const SIMDI = new Date();
const BUGUN_BASI = turkiyeGunBaslangici(SIMDI);
const DUN = new Date(BUGUN_BASI.getTime() - 1000);

const ROLLER = { noField: '_no', nameField: '_ad', quantityField: '_miktar', unitField: '_birim', materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam' };
const satir = (ad: string, ek: Kayit = {}): Kayit => ({ _isDataRow: true, _no: '1', _ad: ad, _miktar: 1, _birim: 'Ad.', _matBirim: '10', _matToplam: '10', ...ek });
const isaretli = (en: string, tr: string) => satir(en, { _ceviriKaynak: tr, _ceviriSonucu: en });
const sayfa = (satirlar: Kayit[]): Kayit[] => [{ index: 0, name: 'Mekanik', isEmpty: false, columnRoles: ROLLER, rowData: satirlar }];

/** metinler: KÜRESEL VANA · PVC BORU · ÇELİK BORU (kayıtta İngilizce) · DN 20 dokunulmaz. */
const SAYFALAR = (): Kayit[] => sayfa([satir('KÜRESEL VANA'), satir('PVC BORU'), satir('DN 20'), isaretli('STEEL PIPE', 'ÇELİK BORU')]);
/** İki katmanda da karşılığı olmayan terim — API'ye gitmesi GEREKEN tek durum. */
const EK_SAYFALAR = (): Kayit[] => sayfa([satir('KÜRESEL VANA'), satir('HAVA DAMPERİ 200X300')]);

const ORTAK: Record<string, string> = { 'KÜRESEL VANA': 'BALL VALVE', 'PVC BORU': 'PVC PIPE', 'ÇELİK BORU': 'STEEL PIPE' };
const F1_KARSILIK = 'SPHERICAL VALVE';
const F2_KARSILIK = 'UPVC PIPE';

const duzeltmeSatiri = (o: Kayit): Kayit => ({
  id: `d-${Math.random().toString(36).slice(2)}`,
  firmaId: 'f1', hedefDil: 'en', kaynakMetin: 'KÜRESEL VANA',
  ceviriMetni: F1_KARSILIK, olusturanId: 'u1', guncelleyenId: 'u1', olusturuldu: SIMDI, guncellendi: SIMDI,
  ...o,
  kaynakOzeti: kaynakOzeti(String(o.kaynakMetin ?? 'KÜRESEL VANA')),
});

const olaySatiri = (o: Kayit = {}): Kayit => ({
  id: `o-${Math.random().toString(36).slice(2)}`,
  firmaId: 'f1', userId: 'u1', kullaniciEposta: EPOSTA1, tip: 'eklendi', duzeltmeId: 'd-x', hedefDil: 'en',
  kaynakMetin: 'ESKİ TERİM', oncekiDeger: null, yeniDeger: 'OLD TERM', ortakDeger: null, olusturuldu: SIMDI,
  ...o,
});

const tuketim = (o: Kayit = {}): Kayit => ({
  id: `tk-${Math.random().toString(36).slice(2)}`,
  firmaId: 'f1', userId: 'u1', abonelikId: 'ab-1', paketKodu: 'pro-mek', quoteId: Q, hedefDil: 'en',
  metinSayisi: 0, icerikOzeti: 'x', satirSayisi: 3, dusulenSatir: 3, toplamTeslim: 3, devam: false,
  durum: 'BASARILI', olusturuldu: new Date(Date.now() - SAAT), sonuclandi: new Date(Date.now() - SAAT + DK), hata: null,
  ...o,
});

/** Sahte Anthropic (dikiş: `anthropicIstemcisi`). Her çağrı sıradaki üreticiye gider. */
function sahteIstemci(ureticiler: Array<(metinler: string[]) => Array<{ kaynak: string; ceviri: string }>>) {
  const istekler: string[][] = [];
  let sira = 0;
  return {
    istekler,
    messages: {
      create: async (govde: any) => {
        const icerik = String(govde?.messages?.[0]?.content ?? '');
        const metinler = icerik.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
        istekler.push(metinler);
        const ceviriler = ureticiler[Math.min(sira++, ureticiler.length - 1)](metinler);
        return { content: [{ type: 'text', text: JSON.stringify({ ceviriler }) }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
}

interface Ayar {
  duzeltmeler?: Kayit[];
  olaylar?: Kayit[];
  tuketim?: Kayit[];
  ortak?: Record<string, string>;
  sayfalar?: Kayit[];
  yanitlar?: Array<(metinler: string[]) => Array<{ kaynak: string; ceviri: string }>>;
  duzeltmeAcik?: boolean;
}

/** Gerçek servisler + sahte Prisma. Okumalar da olay sırasına yazılır (U6 sırası ölçülür). */
function sahne(o: Ayar = {}) {
  const teklif = (id: string, firmaId: string, sayfalar: Kayit[]): Kayit => ({
    id, firmaId, title: 'Çeviri Düzeltme Turu', sheets: sayfalar, originalFile: Buffer.from('x'),
    quoteNo: null, rev: 0, musteri: 'Müşteri', proje: 'Proje', hazirlayan: 'H', gecerlilik: '30 gün',
    exportOverrides: null, displayCurrency: 'TRY', displayLanguage: 'tr', formatId: null, updatedAt: new Date(),
  });
  const abonelik = (id: string, firmaId: string): Kayit => ({
    id, firmaId, olusturuldu: new Date(Date.now() - 3 * GUN),
    paketSurumu: { periyot: 'MONTHLY', periyotAdedi: 1, paket: { kod: 'pro-mek', seviye: 'pro', kapsam: 'mechanical' } },
  });
  const s = sahteDb({
    quote: [teklif(Q, 'f1', o.sayfalar ?? SAYFALAR()), teklif(Q2, 'f2', SAYFALAR()), teklif(Q_EK, 'f1', EK_SAYFALAR())],
    translation: Object.entries(o.ortak ?? ORTAK).map(([sourceText, translatedText]) => ({
      id: `tr-${sourceText}`, sourceText, targetLang: 'en', translatedText, kaynak: 'ai', createdAt: new Date(),
    })),
    ceviriDuzeltmesi: o.duzeltmeler ?? [],
    ceviriDuzeltmeOlayi: o.olaylar ?? [],
    ceviriTuketimi: o.tuketim ?? [],
    systemSettings: [{ key: 'CLAUDE_API_KEY', value: 'sk-sahte' }],
    user: [
      { id: 'u1', email: EPOSTA1, emailVerified: true, firma: { id: 'f1', ad: 'Firma A' } },
      { id: 'u2', email: EPOSTA2, emailVerified: true, firma: { id: 'f2', ad: 'Firma B' } },
      { id: 'u3', email: 'yeni@firma-a.com', emailVerified: false, firma: { id: 'f1', ad: 'Firma A' } },
    ],
    firma: [{ id: 'f1', ad: 'Firma A' }, { id: 'f2', ad: 'Firma B' }],
    abonelik: [abonelik('ab-1', 'f1'), abonelik('ab-2', 'f2')],
  }, { okumalariKaydet: true, saat: () => SIMDI });

  const kota = new CeviriKotaServisi(s.db);
  (kota as any).logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
  const aiKayitlari: unknown[] = [];
  const ceviri = new CeviriService(s.db, { logUsage: async (x: unknown) => { aiKayitlari.push(x); } } as any, kota);
  (ceviri as any).logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
  const istemci = sahteIstemci(o.yanitlar ?? [(metinler) => metinler.map((m) => ({ kaynak: m, ceviri: `${m} (EN)` }))]);
  (ceviri as any).anthropicIstemcisi = () => istemci;
  const erisim = { yetenekAcikMi: async () => o.duzeltmeAcik ?? true } as unknown as ErisimServisi;
  const duzeltme = new CeviriDuzeltmeServisi(s.db, kota, erisim);
  (duzeltme as any).saat = () => SIMDI;
  const fx = { getRates: async () => ({ usdTry: 47.35, eurTry: 54.1, source: 'tcmb', date: '16.09.2026' }) };
  const quotes = new QuotesService(s.db, fx as any, ceviri);
  return { s, kota, ceviri, duzeltme, quotes, istemci, aiKayitlari };
}

/** Yazma olayları (okuma olayları hariç) — S5/M2 gibi "hiç yazma yok" ölçütleri için. */
const YAZMA = /\.(create|update|updateMany|upsert|delete|deleteMany)$/;
const yazmalar = (s: ReturnType<typeof sahne>['s']) => s.olaylar.filter((o) => YAZMA.test(o));

// ── L) SAF KATMAN ───────────────────────────────────────────────────────────
function lBlogu(): void {
  console.log('\nL) Saf katman — firma ortağın ÜSTÜNE biner');
  const ortakSatir = (k: string, v: string) => ({ sourceText: k, translatedText: v });
  const firmaSatir = (k: string, v: string, ozetMetni = k) => ({ kaynakMetin: k, kaynakOzeti: kaynakOzeti(ozetMetni), ceviriMetni: v });

  const l1 = katmanlariBirlestir(['KÜRESEL VANA'], [ortakSatir('KÜRESEL VANA', 'BALL VALVE')], [firmaSatir('KÜRESEL VANA', F1_KARSILIK)]);
  check('L1 ★ firma karşılığı ortağı EZER (ortak satır silinmez, yalnız üstüne biner)',
    l1.harita['KÜRESEL VANA'] === F1_KARSILIK && l1.katman.get('KÜRESEL VANA') === 'FIRMA',
    JSON.stringify({ harita: l1.harita, katman: [...l1.katman] }));

  const l2 = katmanlariBirlestir(['PVC BORU'], [ortakSatir('PVC BORU', 'PVC PIPE')], []);
  check('L2 firma düzeltmesi yoksa ortak karşılık gelir', l2.harita['PVC BORU'] === 'PVC PIPE' && l2.katman.get('PVC BORU') === 'ORTAK');

  const l3 = katmanlariBirlestir(['BAKIR BORU'], [], []);
  check('L3 iki katmanda da yoksa anahtar HİÇ yok (boş dizge değil)',
    !Object.prototype.hasOwnProperty.call(l3.harita, 'BAKIR BORU') && l3.katman.size === 0);

  check('L4 katman etiketi her anahtar için doğru',
    (() => {
      const r = katmanlariBirlestir(['KÜRESEL VANA', 'PVC BORU'], [ortakSatir('KÜRESEL VANA', 'BALL VALVE'), ortakSatir('PVC BORU', 'PVC PIPE')], [firmaSatir('KÜRESEL VANA', F1_KARSILIK)]);
      return r.katman.get('KÜRESEL VANA') === 'FIRMA' && r.katman.get('PVC BORU') === 'ORTAK';
    })());

  const l5 = katmanlariBirlestir(['constructor'], [], []);
  check('L5 harita PROTOTİPSİZ ("constructor" haritada VAR sanılmaz)',
    Object.getPrototypeOf(l5.harita) === null && (l5.harita as any).constructor === undefined);

  check('L6 `kaynakOzeti` normalize eder (boşluk farkı aynı özet), 64 haneli hex, farklı metin farklı özet',
    kaynakOzeti('PVC  BORU ') === kaynakOzeti('PVC BORU') && /^[0-9a-f]{64}$/.test(kaynakOzeti('PVC BORU')) &&
    kaynakOzeti('PVC BORU') !== kaynakOzeti('PVC BORUSU'));

  const l7 = katmanlariBirlestir(
    ['KÜRESEL VANA'],
    [ortakSatir('KÜRESEL VANA', 'BALL VALVE')],
    [firmaSatir('KELEBEK VANA', 'BUTTERFLY VALVE', 'KÜRESEL VANA'), firmaSatir('BAKIR BORU', 'COPPER PIPE')],
  );
  check('L7 `kaynakMetin` anahtarla eşleşmeyen firma satırı YOK SAYILIR (özeti tutsa bile)',
    l7.harita['KÜRESEL VANA'] === 'BALL VALVE' && !Object.prototype.hasOwnProperty.call(l7.harita, 'BAKIR BORU'),
    JSON.stringify(l7.harita));
}

// ── Z1) GÜVENLİK SÜZGECİ TABLOSU ────────────────────────────────────────────
function z1Blogu(): void {
  console.log('\nZ1) `ceviriGuvenliMi` — yanlış red YASAK, zehirleme kapalı');
  const vakalar: Array<[string, string, string, boolean]> = [
    ['ölçü aynen korunuyor', 'DN 20 KÜRESEL VANA', 'DN 20 BALL VALVE', true],
    ['binlik ayracı değişti (aynı sayı)', '24.000 kcal/h KAZAN', '24,000 kcal/h BOILER', true],
    ['ondalık ayracı değişti', '3x2,5 mm² KABLO', '3x2.5 mm² CABLE', true],
    ['ayraç kaybı — BİLİNÇLİ yanlış kabul (RR2)', '2,5 mm KABLO', '25 mm CABLE', true],
    ['ölçü DEĞİŞTİ', 'DN 20 VANA', 'DN 25 VALVE', false],
    ['kaynakta olmayan YENİ sayı', 'KÜRESEL VANA', 'BALL VALVE 25', false],
    ['kesir korunuyor', '1 1/4" REKOR', '1 1/4" UNION', true],
    ['Ø ölçüsü korunuyor', 'Ø110 PVC BORU', 'Ø110 PVC PIPE', true],
    ['kaynakta OLMAYAN bağlantı', 'KÜRESEL VANA', 'BALL VALVE www.kotu.com', false],
    ['kaynakta OLAN bağlantı serbest', 'VANA www.x.com', 'VALVE www.x.com', true],
    ['kaynakta OLMAYAN e-posta', 'KÜRESEL VANA', 'BALL VALVE a@b.com', false],
    ['aşırı uzun karşılık', 'VANA', 'VALVE'.padEnd(3 * 4 + 21, ' x'), false],
    // ── CANLI VAKALAR (16.09): 334 makine çevirisinin YANLIŞ REDDEDİLEN 4'ü.
    //    Dördü de doğru çeviri; ret sebebi kaynak metindeki düzensiz boşluk ve
    //    noktalamaydı (`1 1/ 4` kesri bölünüyor, `K80,68` tek sayı sanılıyor).
    ['canlı: kesirde boşluk (1 1/ 4)', "1 1/ 4'' x 1''x 1'' İnegal Tee",
      "1 1/4'' x 1'' x 1'' Reducing Tee", true],
    ['canlı: kesirde boşluk (1 1/ 2)', "1 1/ 2'' x1''x 1 1/4'' İnegal Tee",
      "1 1/2'' x 1'' x 1 1/4'' Reducing Tee", true],
    ['canlı: boşluksuz virgül (K80,68°C) — pendent', "1/2'' ,K80,68°C,Pendent,std, Sprinkler",
      "1/2'', K80, 68°C, Pendent, Standard, Sprinkler", true],
    ['canlı: boşluksuz virgül (K80,68°C) — upright', "1/2'' ,K80,68°C,upright ,std,Sprinkler",
      "1/2'', K80, 68°C, Upright, Standard, Sprinkler", true],
    // Gruplama serbest ama rakam İÇERİĞİ değil: aşağıdakiler REDDEDİLMEYE devam eder.
    ['gruplama serbest ama rakam kaybı YASAK', '24.000 kcal/h KAZAN', '24.0 kcal/h BOILER', false],
    ['düzensiz kaynakta bile YENİ sayı YASAK', "1/2'' ,K80,68°C,std", "1/2'', K80, 68°C, K115, Standard", false],
  ];
  for (const [ad, kaynak, ceviri, beklenen] of vakalar) {
    check(`Z1 ${ad}: «${kaynak}» → «${ceviri.slice(0, 40)}» ${beklenen ? '✓' : '✗'}`,
      ceviriGuvenliMi(kaynak, ceviri) === beklenen);
  }
}

// ── S) KAPSAM — firma katmanı izolasyonu ────────────────────────────────────
async function sBlogu(): Promise<void> {
  console.log('\nS) Kapsam — A firmasının düzeltmesi B firmasını ETKİLEMEZ');
  const iki = () => [
    duzeltmeSatiri({ id: 'd-f1', firmaId: 'f1', kaynakMetin: 'KÜRESEL VANA', ceviriMetni: F1_KARSILIK }),
    duzeltmeSatiri({ id: 'd-f2', firmaId: 'f2', kaynakMetin: 'PVC BORU', ceviriMetni: F2_KARSILIK, olusturanId: 'u2', guncelleyenId: 'u2' }),
  ];
  const ozet = ceviriIcerigi(SAYFALAR()).ozet;
  const odenmis = (firmaId: string, quoteId: string) => [tuketim({ firmaId, quoteId, icerikOzeti: ozet, userId: firmaId === 'f1' ? 'u1' : 'u2', abonelikId: firmaId === 'f1' ? 'ab-1' : 'ab-2' })];

  {
    const t = sahne({ duzeltmeler: iki() });
    check('S0 FIXTURE KANITI: iki firmanın düzeltmesi AYNI sahte tabloda, ortak katmanda üçü de var',
      t.s.t.ceviriDuzeltmesi.length === 2 && t.s.t.ceviriDuzeltmesi.some((d) => d.firmaId === 'f2') && ORTAK['KÜRESEL VANA'] === 'BALL VALVE',
      JSON.stringify(t.s.t.ceviriDuzeltmesi.map((d) => [d.firmaId, d.kaynakMetin, d.ceviriMetni])));
  }
  {
    // f2 dört yolun üçünde ORTAK karşılığı görür (kendi düzeltmesi başka anahtarda).
    const t = sahne({ duzeltmeler: iki(), tuketim: odenmis('f2', Q2) });
    const g = await t.ceviri.teklifGorunumu(KF2, Q2);
    const c = await t.ceviri.teklifiCevir(KF2, Q2);
    const d = await t.duzeltme.listele(KF2, Q2);
    check('S1 ★ f1 "SPHERICAL VALVE" yazınca f2 hâlâ ortak "BALL VALVE" görür (görüntüleme, çeviri, kendi listesi)',
      (g as any).harita?.['KÜRESEL VANA'] === 'BALL VALVE' && c.harita['KÜRESEL VANA'] === 'BALL VALVE' &&
      c.harita['PVC BORU'] === F2_KARSILIK && d.duzeltmeler.every((x) => x.kaynak !== 'KÜRESEL VANA'),
      JSON.stringify({ g: (g as any).harita, c: c.harita, d: d.duzeltmeler }));
  }
  {
    const t = sahne({ duzeltmeler: iki(), tuketim: odenmis('f1', Q) });
    const yeni = await sahne({ duzeltmeler: iki() }).ceviri.teklifiCevir(K1, Q);
    const tekrar = await t.ceviri.teklifiCevir(K1, Q);
    const g = await t.ceviri.teklifGorunumu(K1, Q);
    const dosya = await t.quotes.exportPricedXlsx(K1, Q, 'en');
    const metin = await dosyaMetinleri(dosya.buffer);
    check('S2 f1 kendi karşılığını DÖRT yolda görür: yeni çeviri · tekrar dalı · görüntüleme · dışa aktarım',
      yeni.harita['KÜRESEL VANA'] === F1_KARSILIK && tekrar.tekrar === true && tekrar.harita['KÜRESEL VANA'] === F1_KARSILIK &&
      (g as any).harita?.['KÜRESEL VANA'] === F1_KARSILIK && metin.includes(F1_KARSILIK) && !metin.includes('BALL VALVE'),
      JSON.stringify({ yeni: yeni.harita['KÜRESEL VANA'], tekrar: tekrar.harita['KÜRESEL VANA'], g: (g as any).harita?.['KÜRESEL VANA'] }));
  }
  {
    const t = sahne({ duzeltmeler: iki() });
    const c = await t.ceviri.teklifiCevir(K1, Q);
    const ek = sahne({ duzeltmeler: iki() });
    const cEk = await ek.ceviri.teklifiCevir(K1, Q_EK);
    check('S3 ★ düzeltmesiz terim ORTAKTAN gelir, API\'ye GİTMEZ (anahtar okuması 0, logUsage 0) + ÖLÇÜT: iki katmanda da olmayan terim API\'ye GİDER (1)',
      c.harita['PVC BORU'] === 'PVC PIPE' && t.istemci.istekler.length === 0 && t.aiKayitlari.length === 0 &&
      t.s.say('systemSettings.findMany') === 0 &&
      ek.istemci.istekler.length === 1 && ek.istemci.istekler[0].join() === 'HAVA DAMPERİ 200X300' && ek.s.say('systemSettings.findMany') === 1 &&
      cEk.harita['KÜRESEL VANA'] === F1_KARSILIK,
      JSON.stringify({ istek: t.istemci.istekler, ayar: t.s.say('systemSettings.findMany'), ekIstek: ek.istemci.istekler }));
  }
  {
    const t = sahne({ duzeltmeler: iki(), tuketim: odenmis('f1', Q) });
    const once = kopya(t.s.t.translation);
    await t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1');
    const g = await t.ceviri.teklifGorunumu(K1, Q);
    check('S4 firma karşılığı KALDIRILINCA ortak karşılık geri gelir; Translation satırları AYNI (ortak silinmedi)',
      (g as any).harita?.['KÜRESEL VANA'] === 'BALL VALVE' && JSON.stringify(kopya(t.s.t.translation)) === JSON.stringify(once),
      JSON.stringify((g as any).harita));
  }
  {
    const t = sahne({ duzeltmeler: iki() });
    await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'PVC BORU', ceviri: 'UPVC PIPE (A)' });
    await t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1');
    check('S5 ★ PUT ve DELETE yolunda ORTAK katmana yazım YOK (translation create/update/upsert 0)',
      t.s.say('translation.upsert') === 0 && t.s.say('translation.update') === 0 && t.s.say('translation.create') === 0,
      JSON.stringify(yazmalar(t.s)));
  }
  {
    const t = sahne();
    const e = await hata(() => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'DN 20', ceviri: 'DN 20' }));
    check('S6 dokunulmaz kaynak (ölçü/kod) → 400 OLCU_KODU_CEVRILMEZ, yazım ve olay YOK',
      durum(e) === 400 && yanit(e).kod === 'OLCU_KODU_CEVRILMEZ' && yazmalar(t.s).length === 0,
      JSON.stringify({ d: durum(e), y: yanit(e), yazma: yazmalar(t.s) }));
  }
  {
    const t = sahne({ duzeltmeler: iki() });
    const e = await hata(() => t.duzeltme.kaldir(KF2, EPOSTA2, 'd-f1'));
    check('S7 ★ başka firmanın düzeltme kimliğiyle DELETE → 404 DUZELTME_YOK; satır DURUYOR, olay YOK',
      durum(e) === 404 && yanit(e).kod === 'DUZELTME_YOK' && t.s.t.ceviriDuzeltmesi.some((d) => d.id === 'd-f1') && t.s.t.ceviriDuzeltmeOlayi.length === 0,
      JSON.stringify({ d: durum(e), kalan: t.s.t.ceviriDuzeltmesi.length, olay: t.s.t.ceviriDuzeltmeOlayi.length }));
  }
  {
    const t = sahne({ duzeltmeler: iki(), tuketim: odenmis('f1', Q) });
    const oncekiOzet = ceviriIcerigi(t.s.t.quote[0].sheets).ozet;
    await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'GLOBE VALVE' });
    const sonrakiOzet = ceviriIcerigi(t.s.t.quote[0].sheets).ozet;
    const tuketimOnce = t.s.t.ceviriTuketimi.length;
    const r = await t.ceviri.teklifiCevir(K1, Q);
    check('S8 ★ düzeltme içerik ÖZETİNİ değiştirmez; firma sözlüğü karşıladığı için kotadan 0 düşer (denetim kaydı yazılır)',
      oncekiOzet === sonrakiOzet && oncekiOzet === ozet && r.tekrar === true && r.dusulenSatir === 0 &&
      t.s.t.ceviriTuketimi.length === tuketimOnce + 1 && t.s.t.ceviriTuketimi[tuketimOnce].dusulenSatir === 0 &&
      r.harita['KÜRESEL VANA'] === 'GLOBE VALVE',
      JSON.stringify({ oncekiOzet: oncekiOzet.slice(0, 8), sonrakiOzet: sonrakiOzet.slice(0, 8), tekrar: r.tekrar }));
  }
  {
    // 'KELEBEK VANA' YALNIZ firma katmanında: ortakta yok → API'ye gitmemeli.
    const t = sahne({
      sayfalar: sayfa([satir('KELEBEK VANA')]),
      duzeltmeler: [duzeltmeSatiri({ id: 'd-kv', kaynakMetin: 'KELEBEK VANA', ceviriMetni: 'BUTTERFLY VALVE' })],
    });
    const c = await t.ceviri.teklifiCevir(K1, Q);
    check('S9 ★ yalnız firma katmanında olan anahtar `cevir`\'de API\'ye GİTMEZ',
      c.harita['KELEBEK VANA'] === 'BUTTERFLY VALVE' && t.istemci.istekler.length === 0 && t.aiKayitlari.length === 0 && c.onbellekten === 1,
      JSON.stringify({ harita: c.harita, istek: t.istemci.istekler }));
  }
  {
    const t = sahne({ duzeltmeler: iki() });
    const govdeler: unknown[] = [];
    govdeler.push(await t.duzeltme.listele(K1, Q));
    govdeler.push(await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'GLOBE VALVE' }));
    govdeler.push(await t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1'));
    for (const fn of [
      () => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'BAKIR BORU', ceviri: 'COPPER PIPE' }),
      () => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'BALL VALVE 25' }),
      () => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'DN 20', ceviri: 'DN 20' }),
      () => t.duzeltme.kaldir(K1, EPOSTA1, '11111111-1111-4111-8111-111111111111'),
    ]) govdeler.push(yanit(await hata(fn)));
    const hepsi = JSON.stringify(govdeler);
    check('S10 ★ GET/PUT/DELETE yanıtlarında ve HATA gövdelerinde ORTAK katman değeri YOK',
      !hepsi.includes('BALL VALVE"') && !hepsi.includes('PVC PIPE') && !hepsi.includes('STEEL PIPE'),
      hepsi.slice(0, 400));
  }
  {
    const t = sahne({ duzeltmeler: iki() });
    const d = await t.duzeltme.listele(K1, Q);
    check('S11 ★ GET yanıtında BAŞKA firmanın (f2) düzeltmesi YOK; anahtarlar teklifin kayıtlı metinleri',
      d.duzeltmeler.length === 1 && d.duzeltmeler[0].kaynak === 'KÜRESEL VANA' && d.duzeltmeler[0].ceviri === F1_KARSILIK &&
      JSON.stringify(d.anahtarlar) === JSON.stringify(['KÜRESEL VANA', 'PVC BORU', 'ÇELİK BORU']) && d.duzeltmeAcik === true,
      JSON.stringify(d));
  }
  {
    const t = sahne();
    const e1 = await hata(() => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'BAKIR BORU', ceviri: 'COPPER PIPE' }));
    const e2 = await hata(() => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q2, kaynak: 'KÜRESEL VANA', ceviri: 'GLOBE VALVE' }));
    check('S12 ★ metin teklifte yoksa 400 KAYNAK_TEKLIFTE_YOK; başka firmanın teklifi 404; ikisinde de yazım ve olay YOK',
      durum(e1) === 400 && yanit(e1).kod === 'KAYNAK_TEKLIFTE_YOK' && durum(e2) === 404 &&
      t.s.t.ceviriDuzeltmesi.length === 0 && t.s.t.ceviriDuzeltmeOlayi.length === 0,
      JSON.stringify({ e1: yanit(e1), e2: durum(e2) }));
  }
}

// ── U) ÇAĞIRAN KAYDI (K-T12) ────────────────────────────────────────────────
async function uBlogu(): Promise<void> {
  console.log('\nU) Çağıran kaydı — düzeltme ve olay AYNI transaction\'da, kilit önce');
  {
    const t = sahne();
    const e = await hata(() => t.s.db.$transaction(async (tx: any) => {
      await tx.ceviriDuzeltmesi.create({ data: { firmaId: 'f1', hedefDil: 'en', kaynakMetin: 'X', kaynakOzeti: kaynakOzeti('X'), ceviriMetni: 'Y', olusturanId: 'u1', guncelleyenId: 'u1' } });
      throw new Error('kasıtlı');
    }));
    check('U0 ÖLÇÜT: sahte `$transaction` fırlayınca TABLOLARI GERİ YÜKLÜYOR (atomiklik ölçülebilir)',
      e instanceof Error && t.s.t.ceviriDuzeltmesi.length === 0, `${t.s.t.ceviriDuzeltmesi.length}`);
  }
  {
    const t = sahne();
    const r = await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK });
    const olay = t.s.t.ceviriDuzeltmeOlayi[0];
    console.log(`    ↳ U1 olay kaydı: ${JSON.stringify(olay)}`);
    check('U1 PUT → TEK olay: firma, kullanıcı, e-posta kopyası, tip "eklendi", önceki null, yeni değer, o anki ortak değer',
      t.s.t.ceviriDuzeltmeOlayi.length === 1 && olay.firmaId === 'f1' && olay.userId === 'u1' && olay.kullaniciEposta === EPOSTA1 &&
      olay.tip === 'eklendi' && olay.oncekiDeger === null && olay.yeniDeger === F1_KARSILIK && olay.ortakDeger === 'BALL VALVE' &&
      olay.kaynakMetin === 'KÜRESEL VANA' && olay.duzeltmeId === t.s.t.ceviriDuzeltmesi[0].id && r.degisti === true,
      JSON.stringify(olay));
  }
  {
    const t = sahne({ duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })] });
    const r = await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'GLOBE VALVE' });
    const olay = t.s.t.ceviriDuzeltmeOlayi[0];
    check('U2 aynı anahtara ikinci yazım → tip "guncellendi", önceki değer korunur, satır güncellenir',
      olay.tip === 'guncellendi' && olay.oncekiDeger === F1_KARSILIK && olay.yeniDeger === 'GLOBE VALVE' &&
      t.s.t.ceviriDuzeltmesi.length === 1 && t.s.t.ceviriDuzeltmesi[0].ceviriMetni === 'GLOBE VALVE' && r.degisti === true,
      JSON.stringify(olay));
  }
  {
    const t = sahne({ duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })] });
    const r = await t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1');
    const olay = t.s.t.ceviriDuzeltmeOlayi[0];
    check('U3 DELETE → tip "kaldirildi", yeni değer null, önceki değer izde; satır gitti',
      olay.tip === 'kaldirildi' && olay.yeniDeger === null && olay.oncekiDeger === F1_KARSILIK &&
      t.s.t.ceviriDuzeltmesi.length === 0 && r.kaldirildi === true && r.kaynak === 'KÜRESEL VANA',
      JSON.stringify(olay));
  }
  {
    const t = sahne();
    t.s.db.ceviriDuzeltmeOlayi.create = async () => { throw new Error('sahte DB: olay yazilamadi'); };
    const e = await hata(() => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK }));
    check('U4 ★ olay yazımı PATLARSA düzeltme de YOK (ikisi aynı transaction\'da)',
      e instanceof Error && t.s.t.ceviriDuzeltmesi.length === 0 && t.s.t.ceviriDuzeltmeOlayi.length === 0,
      JSON.stringify({ hata: String(e), duzeltme: t.s.t.ceviriDuzeltmesi.length }));
  }
  {
    const t = sahne();
    await t.ceviri.duzelt({ id: 'admin-1', email: 'yonetici@metaprice.com' }, 'KÜRESEL VANA', 'FULL BORE BALL VALVE');
    const olay = t.s.t.yoneticiOlayi[0];
    check('U5 yönetici `correct` → YoneticiOlayi "ceviri.ortak.duzeltildi" (önceki/yeni değer, veri) + ortak katman güncellendi',
      t.s.t.yoneticiOlayi.length === 1 && olay.tip === 'ceviri.ortak.duzeltildi' && olay.oncekiDeger === 'BALL VALVE' &&
      olay.yeniDeger === 'FULL BORE BALL VALVE' && olay.yoneticiEpsta === 'yonetici@metaprice.com' &&
      JSON.stringify(olay.veri) === JSON.stringify({ kaynak: 'KÜRESEL VANA', hedefDil: 'en' }) &&
      t.s.t.translation.find((x) => x.sourceText === 'KÜRESEL VANA')?.kaynak === 'manual',
      JSON.stringify(olay));
  }
  {
    const t = sahne({ duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })] });
    t.s.olaylar.length = 0;
    await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'GLOBE VALVE' });
    const putSira = [...t.s.olaylar];
    t.s.olaylar.length = 0;
    await t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1');
    const delSira = [...t.s.olaylar];
    const kilitOnce = (sira: string[]) => {
      const i = sira.indexOf('kilit:ceviri-duzeltme:f1');
      const ilgili = sira.filter((o) => /^ceviriDuzeltme/.test(o));
      return i >= 0 && ilgili.length > 0 && ilgili.every((o) => sira.indexOf(o) > i);
    };
    check('U6 ★ PUT ve DELETE: FİRMA kilidi (`ceviri-duzeltme:<firmaId>`) okumadan, sayımdan ve yazmadan ÖNCE',
      kilitOnce(putSira) && kilitOnce(delSira),
      JSON.stringify({ put: putSira, del: delSira }));
  }
  {
    const t = sahne({ duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })] });
    const r = await t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK });
    check('U7 aynı değerle PUT → yazım ve olay YOK, `degisti: false`',
      r.degisti === false && r.id === 'd-f1' && yazmalar(t.s).length === 0 && t.s.t.ceviriDuzeltmeOlayi.length === 0,
      JSON.stringify({ r, yazma: yazmalar(t.s) }));
  }
  {
    const t = sahne({
      duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })],
      olaylar: [olaySatiri({ id: 'o-1', ortakDeger: 'BALL VALVE' })],
    });
    // KVKK indirmesi bu turun tablolarının dışında da okur: tanımadığı tablo BOŞ döner.
    const bosTablo = { findMany: async () => [], findUnique: async () => null, findFirst: async () => null, count: async () => 0 };
    const genisDb = new Proxy(t.s.db, { get: (hedef: any, ad: string) => (ad in hedef ? hedef[ad] : bosTablo) });
    const hesap = new HesapServisi(genisDb as any, {} as any);
    const veri: any = await hesap.verileriDisaAktar('u1');
    const metin = JSON.stringify(veri);
    check('U8 KVKK veri indirmesi İKİ BAŞLIĞI taşır (firma sözlüğü + kullanıcının düzeltme olayları)',
      Array.isArray(veri.ceviriDuzeltmeleri) && veri.ceviriDuzeltmeleri.length === 1 && veri.ceviriDuzeltmeleri[0].kaynakMetin === 'KÜRESEL VANA' &&
      Array.isArray(veri.ceviriDuzeltmeOlaylari) && veri.ceviriDuzeltmeOlaylari.length === 1 && veri.ceviriDuzeltmeOlaylari[0].tip === 'eklendi',
      JSON.stringify({ d: veri.ceviriDuzeltmeleri, o: veri.ceviriDuzeltmeOlaylari }).slice(0, 300));
    check('S10b ★ KVKK indirmesinde ORTAK katman değeri YOK (`ortakDeger` alanı yok, metin geçmiyor)',
      !('ortakDeger' in (veri.ceviriDuzeltmeOlaylari[0] ?? {})) && !metin.includes('BALL VALVE'),
      JSON.stringify(veri.ceviriDuzeltmeOlaylari));
  }
  {
    const t = sahne({ duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })] });
    await t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1');
    const e = await hata(() => t.duzeltme.kaldir(K1, EPOSTA1, 'd-f1'));
    check('U9 kilit altındaki okuma BOŞSA 404 DUZELTME_YOK ve İKİNCİ olay YOK (eşzamanlı ikinci DELETE)',
      durum(e) === 404 && yanit(e).kod === 'DUZELTME_YOK' && t.s.t.ceviriDuzeltmeOlayi.length === 1,
      JSON.stringify({ d: durum(e), olay: t.s.t.ceviriDuzeltmeOlayi.length }));
  }
}

/** Üretilen .xlsx'in hücre metinleri (ham bayt aramak yanıltır: dosya zip'tir). */
async function dosyaMetinleri(buf: Buffer | ArrayBuffer): Promise<string[]> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const m: string[] = [];
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    const v: any = c.value;
    const t = v && typeof v === 'object'
      ? (Array.isArray(v.richText) ? v.richText.map((x: any) => x.text).join('') : v.formula ? '' : String(v.text ?? v.result ?? ''))
      : String(v ?? '');
    if (t) m.push(t);
  })));
  return m;
}

const ucYetenekleri = (sinif: any, metot: string): unknown[] =>
  (Reflect.getMetadata(YETENEK_KEY, sinif.prototype[metot]) ?? Reflect.getMetadata(YETENEK_KEY, sinif) ?? []) as unknown[];
const guardAdlari = (hedef: any): string[] =>
  ((Reflect.getMetadata(GUARDS_METADATA, hedef) ?? []) as any[]).map((g) => g?.name ?? String(g));
/** Yorumlar atılır: kaynak kapısı yorumda geçen metinle yeşil yanmasın. */
const kodu = (m: string) => m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SRC = path.join(__dirname, '../src');
const oku = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

// ── K) KAPI ─────────────────────────────────────────────────────────────────
async function kBlogu(): Promise<void> {
  console.log('\nK) Kapı — yetenek, e-posta, hız sınırı, tavanlar, kaynak kapıları');
  const P = CeviriDuzeltmeController.prototype as any;
  check('K1 PUT ve DELETE `@GerekliYetenek(CEVIRI)` taşır',
    ucYetenekleri(CeviriDuzeltmeController, 'kaydet').includes(Yetenek.CEVIRI) &&
    ucYetenekleri(CeviriDuzeltmeController, 'kaldir').includes(Yetenek.CEVIRI),
    JSON.stringify([ucYetenekleri(CeviriDuzeltmeController, 'kaydet'), ucYetenekleri(CeviriDuzeltmeController, 'kaldir')]));
  check('K2 PUT/DELETE KULLANICI izleyicili hız sınırı guard\'ı + dakikada 30 istek',
    guardAdlari(P.kaydet).includes('KullaniciHizSiniriGuard') && guardAdlari(P.kaldir).includes('KullaniciHizSiniriGuard') &&
    Reflect.getMetadata('THROTTLER:LIMITdefault', P.kaydet) === 30 && Reflect.getMetadata('THROTTLER:TTLdefault', P.kaydet) === 60_000 &&
    Reflect.getMetadata('THROTTLER:LIMITdefault', P.kaldir) === 30,
    JSON.stringify({ kaydet: guardAdlari(P.kaydet), limit: Reflect.getMetadata('THROTTLER:LIMITdefault', P.kaydet) }));
  check('K5 GET yetenek TAŞIMAZ (KALKAN) ama sınıf ErisimGuard + JwtAuthGuard taşır; GET\'te ThrottlerGuard 60/dk',
    ucYetenekleri(CeviriDuzeltmeController, 'listele').length === 0 &&
    guardAdlari(CeviriDuzeltmeController).includes('ErisimGuard') && guardAdlari(CeviriDuzeltmeController).includes('JwtAuthGuard') &&
    guardAdlari(P.listele).includes('ThrottlerGuard') && Reflect.getMetadata('THROTTLER:LIMITdefault', P.listele) === 60,
    JSON.stringify(guardAdlari(CeviriDuzeltmeController)));

  {
    // GERÇEK ErisimGuard + gerçek `yetenekKararla` + kısıtlı (salt okunur) karar.
    const erisim = new ErisimServisi({} as any);
    const kisitli: ErisimKarari = {
      erisimVar: true, saltOkunur: true, durum: 'ODEME_GECIKTI' as any,
      uyari: { seviye: 'kritik', baslik: 'Erişiminiz kısıtlı', metin: 'Ödemeniz gecikti.' },
      kalanGun: 0, paketKodu: 'pro-mek', kullaniciHakki: 3, dwgAktif: true,
    };
    (erisim as any).karar = async () => kisitli;
    const guard = new ErisimGuard(new Reflector(), erisim);
    const baglam = (metot: string) => ({
      getHandler: () => (CeviriDuzeltmeController.prototype as any)[metot],
      getClass: () => CeviriDuzeltmeController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', firmaId: 'f1' } }) }),
    }) as any;
    const e = await hata(() => guard.canActivate(baglam('kaydet')));
    const okuma = await guard.canActivate(baglam('listele'));
    check('K3 ★ kısıtlı firma: PUT gerçek ErisimGuard\'dan 403 ABONELIK_KISITLI alır; GET (okuma) AÇIK kalır',
      durum(e) === 403 && yanit(e).kod === 'ABONELIK_KISITLI' && okuma === true,
      JSON.stringify({ d: durum(e), y: yanit(e), okuma }));
  }
  {
    const t = sahne({ duzeltmeler: [duzeltmeSatiri({ id: 'd-f1' })] });
    const e1 = await hata(() => t.duzeltme.kaydet(KDOG, 'yeni@firma-a.com', { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'GLOBE VALVE' }));
    const e2 = await hata(() => t.duzeltme.kaldir(KDOG, 'yeni@firma-a.com', 'd-f1'));
    check('K4 ★ e-posta doğrulanmamış → PUT ve DELETE 403 EPOSTA_DOGRULANMADI; yazım, olay ve kilit YOK',
      durum(e1) === 403 && yanit(e1).kod === 'EPOSTA_DOGRULANMADI' && durum(e2) === 403 &&
      yazmalar(t.s).length === 0 && t.s.olaylar.every((o) => !o.startsWith('kilit:')) &&
      t.s.t.ceviriDuzeltmesi.length === 1,
      JSON.stringify({ e1: yanit(e1), yazma: yazmalar(t.s) }));
  }
  {
    const dolu = Array.from({ length: FIRMA_DUZELTME_TAVANI }, (_, i) =>
      duzeltmeSatiri({ id: `d-${i}`, kaynakMetin: `TERİM ${i}`, ceviriMetni: `TERM ${i}` }));
    const t = sahne({ duzeltmeler: dolu });
    const e = await hata(() => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK }));
    check('K6 firma sözlüğü tavanı (5.000) → 409 DUZELTME_TAVANI, yeni satır ve olay YOK',
      durum(e) === 409 && yanit(e).kod === 'DUZELTME_TAVANI' && t.s.t.ceviriDuzeltmesi.length === FIRMA_DUZELTME_TAVANI &&
      t.s.t.ceviriDuzeltmeOlayi.length === 0,
      JSON.stringify({ d: durum(e), y: yanit(e) }));
  }
  {
    const gunluk = (n: number, zaman: Date) => Array.from({ length: n }, (_, i) => olaySatiri({ id: `og-${i}`, olusturuldu: zaman }));
    const dolu = sahne({ olaylar: gunluk(GUNLUK_DUZELTME_TAVANI, SIMDI) });
    const e = await hata(() => dolu.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK }));
    const esik = sahne({ olaylar: gunluk(GUNLUK_DUZELTME_TAVANI - 1, SIMDI) });
    const r = await esik.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK });
    const dun = sahne({ olaylar: gunluk(GUNLUK_DUZELTME_TAVANI, DUN) });
    const rDun = await dun.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: F1_KARSILIK });
    check('K10 ★ günlük tavan: 500 yazımdan sonra 429 DUZELTME_GUNLUK_TAVAN (yazım/olay yok); 499\'da geçer; DÜNKÜ 500 olay sayılmaz',
      durum(e) === 429 && yanit(e).kod === 'DUZELTME_GUNLUK_TAVAN' &&
      dolu.s.t.ceviriDuzeltmesi.length === 0 && dolu.s.t.ceviriDuzeltmeOlayi.length === GUNLUK_DUZELTME_TAVANI &&
      r.degisti === true && rDun.degisti === true,
      JSON.stringify({ d: durum(e), y: yanit(e), esik: r.degisti, dun: rDun.degisti }));
  }
  {
    const guard = Object.create(KullaniciHizSiniriGuard.prototype) as any;
    const kimlikli = await guard.getTracker({ user: { id: 'u1' }, ip: '1.2.3.4' });
    const kimliksiz = await guard.getTracker({ ip: '1.2.3.4' });
    check('K11 hız sınırı izleyicisi OTURUM SAHİBİ; kimlik yoksa IP\'ye düşer',
      kimlikli === 'kullanici:u1' && kimliksiz === 'ip:1.2.3.4', `${kimlikli} / ${kimliksiz}`);
  }
  {
    const servis = kodu(oku('ozellik/giris/ai/ceviri-duzeltme.servisi.ts'));
    check('K12 kaynak kapısı: kilit `pg_advisory_xact_lock(...)::text AS kilit` biçiminde, `$executeRaw` ile kilit YOK',
      /pg_advisory_xact_lock\(hashtext\(\$\{`ceviri-duzeltme:\$\{firmaId\}`\}\)\)::text AS kilit/.test(servis) && !/\$executeRaw/.test(servis),
      servis.slice(servis.indexOf('pg_advisory'), servis.indexOf('pg_advisory') + 120));
    const ozellikAltinda: string[] = [];
    const gez = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((g) => {
      const tam = path.join(d, g.name);
      if (g.isDirectory()) gez(tam);
      else if (g.name.endsWith('.ts') && kodu(fs.readFileSync(tam, 'utf8')).includes('emailVerified')) ozellikAltinda.push(tam);
    });
    gez(path.join(SRC, 'ozellik'));
    check('K7 `emailVerified` okuması `src/ozellik` altında YOK (tek yardımcı: altyapi/auth/eposta-dogrulama.ts)',
      ozellikAltinda.length === 0 && kodu(oku('altyapi/auth/eposta-dogrulama.ts')).includes('emailVerified') &&
      kodu(oku('ozellik/giris/ai/ceviri-duzeltme.servisi.ts')).includes('epostaDogrulandiMi') &&
      kodu(oku('ozellik/odeme/abonelik/ceviri-kota.servisi.ts')).includes('epostaDogrulandiMi'),
      JSON.stringify(ozellikAltinda));
    const yeniDosyalar = [
      'ozellik/giris/ai/ceviri-duzeltme.servisi.ts', 'ozellik/giris/ai/ceviri-duzeltme.controller.ts',
      'ozellik/giris/ai/ceviri-katmani.ts', 'ozellik/giris/ai/ceviri.service.ts',
      'altyapi/http/govde-siniri.ts', 'altyapi/auth/eposta-dogrulama.ts',
    ];
    check('K8 G401: yeni/değişen çeviri dosyalarında `UnauthorizedException` YOK (iş kuralı reddi kullanıcıyı çıkışa atmaz)',
      yeniDosyalar.every((d) => !oku(d).includes('UnauthorizedException')), JSON.stringify(yeniDosyalar));
  }
  {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const meta = { type: 'body' as const, metatype: CeviriFirmaDuzeltmeDto, data: '' };
    const temiz: any = await pipe.transform({ quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'BALL VALVE', firmaId: 'f2', ekstra: 1 }, meta);
    const t = sahne();
    await new CeviriDuzeltmeController(t.duzeltme).kaydet({ id: 'u1', email: EPOSTA1, firmaId: 'f1' }, { ...temiz, firmaId: 'f2' } as any);
    check('K9 gövdeye eklenen `firmaId` YOK SAYILIR: ValidationPipe atar, servis oturumun firmasını yazar',
      !('firmaId' in temiz) && !('ekstra' in temiz) && t.s.t.ceviriDuzeltmesi[0]?.firmaId === 'f1' &&
      t.s.t.ceviriDuzeltmeOlayi[0]?.firmaId === 'f1',
      JSON.stringify({ temiz, yazilan: t.s.t.ceviriDuzeltmesi[0] }));
  }
}

// ── E) UZUNLUK ──────────────────────────────────────────────────────────────
@Controller('ai/translate')
class KuklaDuzeltmeController {
  @Put('duzeltmeler')
  kaydet() {
    return { ok: true };
  }

  @Post('correct')
  correct() {
    return { ok: true };
  }
}

@Controller('baska')
class KuklaBaskaController {
  @Post()
  gonder() {
    return { ok: true };
  }
}

@Module({ controllers: [KuklaDuzeltmeController, KuklaBaskaController] })
class KuklaModulu {}

function iste(port: number, yol: string, govde: string, tur: string, metot: string): Promise<{ durum: number }> {
  return new Promise((coz, at) => {
    const r = http.request(
      { host: '127.0.0.1', port, path: yol, method: metot, headers: { 'content-type': tur, 'content-length': Buffer.byteLength(govde) } },
      (y) => {
        y.resume();
        y.on('end', () => coz({ durum: y.statusCode ?? 0 }));
      },
    );
    r.on('error', at);
    r.end(govde);
  });
}

async function eBlogu(): Promise<void> {
  console.log('\nE) Uzunluk — DTO tavanı ve GERÇEK HTTP gövde tavanı');
  {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const meta = { type: 'body' as const, metatype: CeviriFirmaDuzeltmeDto, data: '' };
    const uzun = 'A'.repeat(2001);
    const tam = 'A'.repeat(2000);
    const e1 = await hata(() => pipe.transform({ quoteId: Q, kaynak: uzun, ceviri: 'X' }, meta));
    const e2 = await hata(() => pipe.transform({ quoteId: Q, kaynak: 'X', ceviri: uzun }, meta));
    const ok = await pipe.transform({ quoteId: Q, kaynak: tam, ceviri: tam }, meta);
    check('E1 DTO tavanı: 2001 karakter → 400 (iki alan ayrı ayrı), 2000 geçer',
      durum(e1) === 400 && durum(e2) === 400 && (ok as any).kaynak.length === 2000,
      JSON.stringify({ e1: durum(e1), e2: durum(e2) }));
  }
  {
    const app = await NestFactory.create<NestExpressApplication>(KuklaModulu, { logger: false });
    // main.ts SIRASI: yol başı tavan ÖNCE, global ayrıştırıcılar SONRA.
    govdeSinirlariniKur(app);
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));
    app.setGlobalPrefix('api');
    await app.listen(0);
    const port = (app.getHttpServer().address() as any).port;
    try {
      const buyuk = JSON.stringify({ kaynak: 'A'.repeat(33 * 1024) });
      const d1 = await iste(port, '/api/ai/translate/duzeltmeler', buyuk, 'application/json', 'PUT');
      const d2 = await iste(port, '/api/ai/translate/correct', buyuk, 'application/json', 'POST');
      const d3 = await iste(port, '/api/baska', buyuk, 'application/json', 'POST');
      check('E2 ★ GERÇEK HTTP: 33 KB JSON iki düzeltme yoluna 413; BAŞKA yola 413 DEĞİL (global 50mb sürüyor)',
        d1.durum === 413 && d2.durum === 413 && d3.durum !== 413,
        JSON.stringify({ d1, d2, d3 }));
      const form = `kaynak=${'A'.repeat(33 * 1024)}`;
      const u1 = await iste(port, '/api/ai/translate/duzeltmeler', form, 'application/x-www-form-urlencoded', 'PUT');
      const u3 = await iste(port, '/api/baska', form, 'application/x-www-form-urlencoded', 'POST');
      check('E2b ★ aynı uygulamada 33 KB urlencoded gövde de 413 (yalnız json sınırlansaydı bu yoldan geçerdi)',
        u1.durum === 413 && u3.durum !== 413, JSON.stringify({ u1, u3 }));
    } finally {
      await app.close();
    }
  }
  {
    const ana = kodu(fs.readFileSync(path.join(SRC, 'main.ts'), 'utf8'));
    const i = ana.indexOf('govdeSinirlariniKur(app)');
    const j = ana.indexOf("json({ limit: '50mb' })");
    const k = ana.indexOf('urlencoded({ extended: true');
    check('E3 BAĞLANTI: `main.ts`\'te yol başı tavan, global json VE urlencoded ayrıştırıcılarından ÖNCE',
      i > 0 && j > i && k > i, JSON.stringify({ i, j, k }));
  }
}

// ── Z2-Z5) ZEHİRLEME + HEPSİ YA DA HİÇBİRİ ─────────────────────────────────
async function zBlogu(): Promise<void> {
  console.log('\nZ2-Z5) Güvensiz AI yanıtı teslim EDİLMEZ, kotadan bir şey DÜŞMEZ');
  const guvensizYanit = (metinler: string[]) => metinler.map((m) => ({ kaynak: m, ceviri: 'AIR DAMPER 250X300' }));
  const guvenliYanit = (metinler: string[]) => metinler.map((m) => ({ kaynak: m, ceviri: 'AIR DAMPER 200X300' }));
  {
    const t = sahne({ yanitlar: [guvensizYanit] });
    const e = await hata(() => t.ceviri.teklifiCevir(K1, Q_EK));
    const kayit = t.s.t.ceviriTuketimi[0];
    // ⚠ 16.09 EK KARARI: süzgeç yanıtı reddeder ama YANIT GELMİŞTİR — çağrının
    // parası harcandı, o satır kotadan DÜŞER. Süzgeç ücretsiz geri alma değil;
    // "reddedilen yanıt bedava" olsaydı zehirleme denemesi de bedava olurdu.
    check('Z2 ★ AI yanıtı güvensiz: haritaya girmez, ORTAK önbelleğe yazılmaz, teklif 422 "tamamlanamadı", ama 1 satır DÜŞER (para harcandı)',
      durum(e) === 422 && yanit(e).kod === 'CEVIRI_TAMAMLANAMADI' &&
      JSON.stringify(yanit(e).cevrilemeyenSatirlar) === JSON.stringify(['HAVA DAMPERİ 200X300']) &&
      t.s.say('translation.upsert') === 0 && kayit.durum === 'BASARISIZ' && kayit.dusulenSatir === 1 &&
      yanit(e).dusulenSatir === 1 &&
      !t.s.t.translation.some((x) => x.sourceText === 'HAVA DAMPERİ 200X300'),
      JSON.stringify({ d: durum(e), y: yanit(e), kayit: kayit && { durum: kayit.durum, dusulen: kayit.dusulenSatir } }));
  }
  {
    const t = sahne();
    const e = await hata(() => t.duzeltme.kaydet(K1, EPOSTA1, { quoteId: Q, kaynak: 'KÜRESEL VANA', ceviri: 'BALL VALVE DN 25' }));
    check('Z3 PUT güvensiz karşılık → 400 CEVIRI_GUVENSIZ, yazım ve olay YOK',
      durum(e) === 400 && yanit(e).kod === 'CEVIRI_GUVENSIZ' && yazmalar(t.s).length === 0,
      JSON.stringify(yanit(e)));
  }
  {
    const t = sahne();
    const e = await hata(() => t.ceviri.duzelt({ id: 'admin-1', email: 'yonetici@metaprice.com' }, 'DN 20 KÜRESEL VANA', 'DN 25 BALL VALVE'));
    check('Z4 yönetici `correct` güvensiz → 400 CEVIRI_GUVENSIZ; ortak katmana yazım ve denetim kaydı YOK',
      durum(e) === 400 && yanit(e).kod === 'CEVIRI_GUVENSIZ' && t.s.say('translation.upsert') === 0 && t.s.t.yoneticiOlayi.length === 0,
      JSON.stringify(yanit(e)));
  }
  {
    const t = sahne({ yanitlar: [guvensizYanit, guvenliYanit] });
    const e = await hata(() => t.ceviri.teklifiCevir(K1, Q_EK));
    const r = await t.ceviri.teklifiCevir(K1, Q_EK);
    const dusen = t.s.t.ceviriTuketimi.reduce((n, k) => n + (k.durum === 'BASARILI' ? k.dusulenSatir : 0), 0);
    // 16.09: ilk denemede GÜVENLİ dönen metin önbelleğe yazılmıştı; ikinci
    // denemede API'ye yalnız kalan metin gider, kotadan da yalnız o satır düşer
    // ("tekrar denemek ücretsizdir" sözü artık faturaya da yansıyor).
    check('Z5 ★ ikinci denemede model güvenli döndürünce çeviri tamamlanır; kotadan YALNIZ API satırı düşer',
      durum(e) === 422 && r.harita['HAVA DAMPERİ 200X300'] === 'AIR DAMPER 200X300' && r.tekrar === false &&
      r.dusulenSatir === 1 && r.onbellektenSatir === 1 && dusen === 1 && t.s.t.ceviriTuketimi.length === 2,
      JSON.stringify({ ilk: durum(e), dusen, kayitlar: t.s.t.ceviriTuketimi.map((k) => [k.durum, k.dusulenSatir]) }));
  }
}

// ── G) DIŞA AKTARIM ─────────────────────────────────────────────────────────
async function gBlogu(): Promise<void> {
  console.log('\nG) Dışa aktarım — firma karşılığı dosyaya iner, kayıtta İngilizce hücre değişmez');
  const ozet = ceviriIcerigi(SAYFALAR()).ozet;
  const t = sahne({
    duzeltmeler: [
      duzeltmeSatiri({ id: 'd-kv', kaynakMetin: 'KÜRESEL VANA', ceviriMetni: F1_KARSILIK }),
      duzeltmeSatiri({ id: 'd-cb', kaynakMetin: 'ÇELİK BORU', ceviriMetni: 'STEEL TUBE' }),
      duzeltmeSatiri({ id: 'd-dn', kaynakMetin: 'DN 20', ceviriMetni: 'NOMINAL 20' }),
    ],
    tuketim: [tuketim({ icerikOzeti: ozet })],
  });
  const r = await t.quotes.exportPricedXlsx(K1, Q, 'en');
  const m = await dosyaMetinleri(r.buffer);
  check('G1 firma karşılığı ÖDENMİŞ içerikte dosyaya iner (ortak karşılık dosyada YOK)',
    m.includes(F1_KARSILIK) && !m.includes('BALL VALVE'), JSON.stringify(m.slice(0, 12)));
  check('G2 ★ kayıtta İngilizce duran hücre firma karşılığı OLSA DA değişmez (K-T1)',
    m.includes('STEEL PIPE') && !m.includes('STEEL TUBE'), JSON.stringify(m.filter((x) => /STEEL/.test(x))));
  check('G3 dokunulmaz ad (DN 20) firma düzeltmesi olsa da değişmez',
    m.includes('DN 20') && !m.includes('NOMINAL 20'), JSON.stringify(m.filter((x) => /DN|NOMINAL/.test(x))));
}

// ── M) SÜZGEÇ ÖLÇÜMÜ ────────────────────────────────────────────────────────
async function mBlogu(): Promise<void> {
  console.log('\nM) Süzgeç ölçüm betiği — salt okuma, deploy öncesi');
  const satirlar: Kayit[] = [];
  for (let i = 0; i < 998; i++) satirlar.push({ id: `t-${String(i).padStart(4, '0')}`, sourceText: `TERİM ${i}`, targetLang: 'en', translatedText: `TERM ${i}`, kaynak: 'ai' });
  satirlar.push({ id: 't-9001', sourceText: 'DN 20 VANA', targetLang: 'en', translatedText: 'DN 25 VALVE', kaynak: 'ai' });
  satirlar.push({ id: 't-9002', sourceText: `ÇOK UZUN ŞARTNAME SATIRI ${'X'.repeat(80)}`, targetLang: 'en', translatedText: `LONG SPEC LINE ${'Y'.repeat(80)} www.kotu.com`, kaynak: 'ai' });
  satirlar.push({ id: 't-9003', sourceText: 'KÜRESEL VANA', targetLang: 'en', translatedText: 'BALL VALVE 25', kaynak: 'manual' });
  const s = sahteDb({ translation: satirlar }, { okumalariKaydet: true });
  const cikti: string[] = [];
  const r = await suzgecOlc(s.db, (x) => cikti.push(x));
  check('M1 red sayısı/oranı doğru (yalnız `kaynak=ai`), örnekler 60 karakterle kesilmiş, sayfalama çalışıyor',
    r.taranan === 1000 && r.reddedilen === 2 && r.oranYuzde === 0.2 && r.esikAsildi === false &&
    r.ornekler.length === 2 && r.ornekler.every((o) => o.kaynak.length <= 61 && o.ceviri.length <= 61) &&
    s.say('translation.findMany') === 3 && cikti.join('\n').includes('%0.20'),
    JSON.stringify({ taranan: r.taranan, red: r.reddedilen, oran: r.oranYuzde, ornek: r.ornekler[0], sayfa: s.say('translation.findMany') }));
  check('M2 ölçüm HİÇBİR yazma yapmaz (salt okuma)', yazmalar(s).length === 0, JSON.stringify(s.olaylar.slice(0, 5)));
}

async function main(): Promise<void> {
  lBlogu();
  z1Blogu();
  await sBlogu();
  await uBlogu();
  await kBlogu();
  await eBlogu();
  await zBlogu();
  await gBlogu();
  await mBlogu();
}

main()
  .catch((e) => {
    failures.push(`beklenmedik hata: ${(e as Error)?.stack ?? e}`);
  })
  .finally(() => {
    console.log(`\nÇEVİRİ DÜZELTMESİ (6.9): ${passed} PASS · ${failures.length} FAIL`);
    if (failures.length > 0) {
      console.log('\nKALANLAR:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exitCode = 1;
    }
  });
