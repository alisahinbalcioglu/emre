/**
 * KIRACI SINIRI — iscilik katalogu, sozluk, yeniden indeksleme (Paket 1, 30.09.2026)
 *   `npm run test:kiraci-siniri` · DB GEREKTIRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   C2 (P0) Kiracinin yukledigi iscilik kalemi KURESEL `LaborItem` olarak
 *       yaziliyordu (ad + kiracinin birim fiyati, `isGlobal: true`) ve
 *       GET /labor filtresizdi: her pro kiraci baskasinin kalem adini ve
 *       fiyatini goruyordu. Ayni adi yukleyen ikinci kiraci birincinin
 *       kalemine BAGLANIYORDU.
 *   C1 (P0) Fiyat satirinin adini degistirmek ORTAK kalemin adini
 *       degistiriyordu: ayni kaleme bagli baska kiracinin satiri ve ayni
 *       firmanin DIGER iscilik firmasindaki satir da yeni adi aliyordu;
 *       yonetici katalogu kalemi de kiracinin eliyle yeniden adlaniyordu.
 *   C4 (P1) Kutuphane duzenleme izni olan her uye ORTAK sozluk kaydini
 *       (seed ya da ogrenilmis) HERKES icin kapatabiliyordu.
 *   C5 (P1) Yonetici yeniden indekslemesi kiraciya ait urunlerin aile
 *       adlarini ORTAK sozluge ogretiyordu (kanonik = urunun adi): diger
 *       kiracilar GET /matching/aliases ile okuyor, eslestirmeleri
 *       etkileniyordu.
 *
 * ── NASIL OLCULUR ───────────────────────────────────────────────────────
 *   GERCEK denetleyiciler ve GERCEK servisler, HTTP uzerinden (Nest + fetch).
 *   Yalniz sinif duzeyi kapilar golgelenir (kimlik `x-test-kim` basligindan);
 *   `RolesGuard` GERCEK. Veri `yardimci/bellek-prisma.ts`te: sorgu kosullari
 *   Prisma anlamiyla degerlendirilir — el yazimi sahte, yeni bir kosulu
 *   sessizce yok sayamaz.
 *   Her blokta BAGLANTI satirlari var: eslestirme kiracinin KENDI fiyatini
 *   bulmaya devam ediyor (gorunurluk daraltmasi motoru kirmadi).
 *
 * Cikis kodu: 0 = PASS · 1 = FAIL (`process.exitCode`; Windows'ta
 * `process.exit` + acik fetch soketi sureci cokertir).
 */
import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Module, ValidationPipe, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../src/altyapi/db/prisma.service';
import { RolesGuard } from '../src/altyapi/auth/guards/roles.guard';
import { LaborController } from '../src/ozellik/kutuphane/labor/labor.controller';
import { LaborService } from '../src/ozellik/kutuphane/labor/labor.service';
import { LaborFirmsController } from '../src/ozellik/kutuphane/labor-firms/labor-firms.controller';
import { LaborFirmsService } from '../src/ozellik/kutuphane/labor-firms/labor-firms.service';
import { LaborMatchingController } from '../src/ozellik/eslestirme/labor-matching/labor-matching.controller';
import { LaborMatchingService } from '../src/ozellik/eslestirme/labor-matching/labor-matching.service';
import { MatchingController } from '../src/ozellik/eslestirme/matching/matching.controller';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService } from '../src/ozellik/eslestirme/matching/terminology.service';
import { normalizeText } from '../src/ozellik/eslestirme/matching/normalizer';
import { INDEX_VERSION } from '../src/ozellik/eslestirme/matching/index/product-index';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
import { ExchangeRatesService } from '../src/ozellik/fiyat/exchange-rates/exchange-rates.service';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import {
  kiraciKalemiAlanlari, kiraciKapsaminda, kiracininKalemleri,
} from '../src/ozellik/kutuphane/labor/iscilik-kalemi-kapsami';
import { bellekPrisma, type BellekPrisma } from './yardimci/bellek-prisma';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

process.env.TZ = 'UTC';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  PASS: ${ad}`);
  } else {
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

// ── Kisiler: iki kiraci (A iki uyeli), bir yonetici ────────────────────────
const KISILER: Record<string, { id: string; firmaId: string; role: string }> = {
  a1: { id: 'kisi-a1', firmaId: 'firma-a', role: 'user' },
  a2: { id: 'kisi-a2', firmaId: 'firma-a', role: 'user' },
  b: { id: 'kisi-b', firmaId: 'firma-b', role: 'user' },
  y: { id: 'yonetici', firmaId: 'firma-y', role: 'admin' },
};
type Kim = keyof typeof KISILER;

const testKapisi = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const kim = KISILER[String(req.headers['x-test-kim'] ?? '')];
    if (!kim) return false;
    req.user = { ...kim };
    return true;
  },
};
class OlcumLabor extends LaborController {}
class OlcumLaborFirms extends LaborFirmsController {}
class OlcumLaborMatching extends LaborMatchingController {}
class OlcumMatching extends MatchingController {}
// LaborController'in sinif listesi RolesGuard'i da tasiyor: yonetici uclari
// (`@Roles('admin')`) testte de GERCEK kapidan gecer.
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi, RolesGuard], OlcumLabor);
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumLaborFirms);
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumLaborMatching);
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumMatching);

const sahteKur = {
  getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'sahte', date: '' }),
};

const gunluk: string[] = [];
const yakalayici: LoggerService = {
  log: () => undefined,
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
};

interface Yanit {
  durum: number;
  veri: any;
  metin: string;
}

interface Dunya {
  db: BellekPrisma;
  app: NestExpressApplication;
  istek(kim: Kim, yontem: string, yol: string, govde?: unknown): Promise<Yanit>;
}

async function dunyaKur(): Promise<Dunya> {
  const db = bellekPrisma();
  const p = db.istemci;
  for (const id of ['firma-a', 'firma-b', 'firma-y']) await p.firma.create({ data: { id, ad: id } });
  for (const k of Object.values(KISILER)) {
    await p.user.create({ data: { id: k.id, email: `${k.id}@ornek.test`, password: 'x', firmaId: k.firmaId } });
  }

  @Module({
    controllers: [OlcumLabor, OlcumLaborFirms, OlcumLaborMatching, OlcumMatching],
    providers: [
      LaborService, LaborFirmsService, LaborMatchingService, MatchingService, TerminologyService, ExcelGridService,
      { provide: PrismaService, useValue: p },
      { provide: ExchangeRatesService, useValue: sahteKur },
    ],
  })
  class DunyaModulu {}

  const app = await NestFactory.create<NestExpressApplication>(DunyaModulu, { logger: yakalayici });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const istek = async (kim: Kim, yontem: string, yol: string, govde?: unknown): Promise<Yanit> => {
    const r = await fetch(`http://127.0.0.1:${port}/api${yol}`, {
      method: yontem,
      headers: { 'x-test-kim': kim, ...(govde !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: govde !== undefined ? JSON.stringify(govde) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const metin = await r.text();
    let veri: any = null;
    try {
      veri = JSON.parse(metin);
    } catch {
      /* JSON degil — ham metin olculur */
    }
    return { durum: r.status, veri, metin };
  };
  return { db, app, istek };
}

// ── Yardimcilar (hepsi GERCEK uclardan gecer; DB yalniz kimlik bulmak ve
//    "yazildi mi" olcmek icin okunur) ─────────────────────────────────────
async function iscilikFirmasiAc(d: Dunya, kim: Kim, ad: string): Promise<string> {
  const r = await d.istek(kim, 'POST', '/labor-firms', { name: ad, discipline: 'mechanical' });
  if (r.durum !== 201 || !r.veri?.id) throw new Error(`iscilik firmasi acilamadi: ${r.durum} ${r.metin}`);
  return r.veri.id as string;
}

/** Yeni liste acip kalemleri yazar (save-bulk, 'new'); yeni listenin kimligini doner. */
async function yukle(d: Dunya, kim: Kim, iscilikFirmaId: string, kalemler: Array<[string, number, string?]>): Promise<string> {
  const once = new Set(d.db.tablo('LaborPriceList').map((l) => l.id));
  const r = await d.istek(kim, 'POST', `/labor-firms/${iscilikFirmaId}/save-bulk`, {
    priceListId: 'new',
    items: kalemler.map(([laborName, unitPrice, unit]) => ({ laborName, unitPrice, unit: unit ?? 'adet' })),
  });
  if (r.durum !== 201) throw new Error(`yukleme basarisiz: ${r.durum} ${r.metin}`);
  const yeni = d.db.tablo('LaborPriceList').find((l) => !once.has(l.id) && l.firmaId === iscilikFirmaId);
  if (!yeni) throw new Error('yukleme listesi bulunamadi');
  return yeni.id as string;
}

/** Sheet yolu (save-from-sheets): tek sayfa, ad + fiyat kolonu. */
async function sayfadanYukle(d: Dunya, kim: Kim, iscilikFirmaId: string, kalemler: Array<[string, number]>): Promise<Yanit> {
  return d.istek(kim, 'POST', `/labor-firms/${iscilikFirmaId}/save-from-sheets`, {
    sheets: [{
      name: 'Sayfa1',
      index: 0,
      rowData: kalemler.map(([ad, fiyat]) => ({ _isDataRow: true, ad, fiyat: String(fiyat), birim: 'adet' })),
      columnRoles: { nameField: 'ad', laborUnitPriceField: 'fiyat', unitField: 'birim' },
    }],
  });
}

const kalemRow = (d: Dunya, id: string) => d.db.tablo('LaborItem').find((k) => k.id === id);
const kalemAdiyla = (d: Dunya, ad: string) => d.db.tablo('LaborItem').filter((k) => k.name === ad);

/** Bir iscilik firmasinin, verilen ada bagli fiyat satiri (DB). */
function fiyatSatiri(d: Dunya, iscilikFirmaId: string, ad: string) {
  return d.db.tablo('LaborPrice').find((p) => p.firmaId === iscilikFirmaId && kalemRow(d, p.laborItemId)?.name === ad);
}

/** Liste kalemlerini KIRACININ gordugu haliyle okur (GET price-lists/:id/items). */
async function listeAdlari(d: Dunya, kim: Kim, listeId: string): Promise<string[]> {
  const r = await d.istek(kim, 'GET', `/labor-firms/price-lists/${listeId}/items`);
  return ((r.veri?.items ?? []) as Array<{ laborItemName: string }>).map((i) => i.laborItemName).sort();
}

/** Yonetici katalogu (`yonetici-katalog` ya da `GET /labor` — ikisi de YALNIZ yonetici). */
async function katalog(d: Dunya, yol = '/labor/yonetici-katalog?discipline=mechanical'): Promise<Array<{ id: string; name: string; unitPrice: number }>> {
  const r = await d.istek('y', 'GET', yol);
  if (r.durum !== 200 || !Array.isArray(r.veri)) throw new Error(`katalog okunamadi: ${r.durum} ${r.metin}`);
  return r.veri;
}

async function eslestir(d: Dunya, kim: Kim, iscilikFirmaId: string, satir: string, birim = 'adet') {
  const r = await d.istek(kim, 'POST', '/labor-matching/bulk-match', {
    firmaId: iscilikFirmaId, laborNames: [satir], units: { [satir]: birim },
  });
  return r.veri?.[satir] as { netPrice?: number; confidence?: string; matchedName?: string } | undefined;
}

/** Yonetici katalog kalemi (POST /labor, `@Roles('admin')`). */
async function katalogKalemi(d: Dunya, ad: string, fiyat: number): Promise<string> {
  const r = await d.istek('y', 'POST', '/labor', { name: ad, unit: 'mt', unitPrice: fiyat, discipline: 'mechanical' });
  if (r.durum !== 201 || !r.veri?.id) throw new Error(`katalog kalemi eklenemedi: ${r.durum} ${r.metin}`);
  return r.veri.id as string;
}

/**
 * W2 ONCESI katalog kalemi — canlidakilerin hali: master'in `LaborService.create`i
 * yalniz ad/birim/fiyat/disiplin yaziyordu (etiket ve indeks alanlari BOS).
 * Yonetici eklemesi artik indeksledigi icin kiracinin "katalog kalemini
 * TAZELEMEZ" kapisi ancak boyle bir kalemle surulur — 01.10 mutasyonda
 * olculdu: taze fikstur kapiyi kaldiran mutanti yasatiyordu. (Yalniz surumu
 * sifirlamak YETMEZ, canlida olmayan karisik bir hal kurar: indeksli-bayat
 * kalem motorda ayri bir daldan gecer — bkz. KC.8.)
 */
async function bayatKatalog(d: Dunya, id: string): Promise<void> {
  await d.db.istemci.laborItem.update({
    where: { id },
    data: { tags: [], normalizedName: null, indexVersion: 0, adSlug: null, adBucket: null, capTags: [], displayName: null },
  });
}
const bayatMi = (d: Dunya, id: string) =>
  (kalemRow(d, id)?.tags ?? []).length === 0 && kalemRow(d, id)?.indexVersion === 0 && kalemRow(d, id)?.adSlug === null;

/** Bu kalem satirina (id) yazan LaborItem cagrilari — ortak kalem "degismedi mi" olcusu. */
function kalemeYazanlar(d: Dunya, id: string, bas: number): string[] {
  return d.db.izler.slice(bas)
    .filter((i) => i.model === 'LaborItem' && ['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(i.islem))
    .filter((i) => JSON.stringify(i.args?.where ?? {}).includes(id) || i.islem.endsWith('Many'))
    .map((i) => `${i.islem}(${JSON.stringify(i.args?.where ?? {})})`);
}

const KATALOG_AD = 'Siyah çelik boru montajı kaynaklı DN50';
const A_OZEL = 'Küresel vana montajı DN65';
const B_OZEL = 'Kelebek vana montajı DN80';
const ORTAK_AD = 'Pis su borusu montajı PVC Ø110';

// ═══ K2 — C2: kiracinin kalemi ona ait, baskasina gorunmez ════════════════
async function k2Blogu(): Promise<void> {
  console.log('\n── K2 (C2) görünürlük ve yükleme ──');
  const d = await dunyaKur();
  try {
    const katalogId = await katalogKalemi(d, KATALOG_AD, 50);
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    const b1 = await iscilikFirmasiAc(d, 'b', 'Usta B1');
    await yukle(d, 'a1', a1, [[A_OZEL, 777]]);
    await yukle(d, 'b', b1, [[B_OZEL, 888]]);
    const aKalem = kalemAdiyla(d, A_OZEL)[0];
    check('K2.0 FIXTURE: A\'nin kalemi yazildi (tek satir, 777)', !!aKalem && kalemAdiyla(d, A_OZEL).length === 1,
      JSON.stringify(kalemAdiyla(d, A_OZEL)));

    // Emre 30.09: GET /labor ve GET /labor/:id YALNIZ yonetici — kiraci 403.
    const bListe = await d.istek('b', 'GET', '/labor?discipline=mechanical');
    check('K2.1 B GET /labor → 403 ve yanitta A\'nin kalemi (ad ya da 777) YOK',
      bListe.durum === 403 && !bListe.metin.includes(A_OZEL) && !bListe.metin.includes('777'), `${bListe.durum} ${bListe.metin}`);
    const bTekil = await d.istek('b', 'GET', `/labor/${aKalem?.id}`);
    check('K2.2 B, A\'nin kalemini GET /labor/:id ile okuyamaz (403)',
      bTekil.durum === 403 && !bTekil.metin.includes(A_OZEL), `${bTekil.durum} ${bTekil.metin}`);
    const aListe = await d.istek('a1', 'GET', '/labor?discipline=mechanical');
    const aTekilKatalog = await d.istek('a1', 'GET', `/labor/${katalogId}`);
    check('K2.3 Kiraci KENDI verisinde de GET /labor ve GET /labor/:id → 403 (fiyatlari kendi iscilik firmalarinda)',
      aListe.durum === 403 && aTekilKatalog.durum === 403, `${aListe.durum} ${aTekilKatalog.durum}`);

    const yGetLabor = await katalog(d, '/labor?discipline=mechanical');
    check('K2.3b Yonetici GET /labor → 200, YALNIZ katalog (kiraci kalemi yok)',
      yGetLabor.length === 1 && yGetLabor[0].id === katalogId, JSON.stringify(yGetLabor.map((k) => k.name)));
    const yTekil = await d.istek('y', 'GET', `/labor/${katalogId}`);
    const yTekilKiraci = await d.istek('y', 'GET', `/labor/${aKalem?.id}`);
    check('K2.3c Yonetici GET /labor/:id → katalog kalemi 200, kiraci kalemi 404',
      yTekil.durum === 200 && yTekil.veri?.id === katalogId && yTekilKiraci.durum === 404,
      `${yTekil.durum} ${yTekilKiraci.durum} ${yTekilKiraci.metin}`);

    const yGorur = await katalog(d);
    check('K2.4 Yonetici katalogu yalniz sahipsiz kalemleri listeler (kiraci kalemi YOK)',
      yGorur.length === 1 && yGorur[0].id === katalogId, JSON.stringify(yGorur.map((k) => k.name)));

    check('K2.5 A\'nin kalemi A\'ya ait kaydedildi (ownerFirmaId=firma-a, isGlobal=false)',
      aKalem?.ownerFirmaId === 'firma-a' && aKalem?.isGlobal === false,
      JSON.stringify({ owner: aKalem?.ownerFirmaId, isGlobal: aKalem?.isGlobal }));

    // Bağlantı ölçümü yıkıcı yönetici adımlarından (K2.6/K2.7) ÖNCE: eski
    // kodda yönetici silmesi A'nın fiyatını da götürüyordu, sonra ölçülürse
    // eşleştirmenin kendisi değil silme ölçülür.
    const eslesme = await eslestir(d, 'a1', a1, 'KÜRESEL VANA DN65');
    check('K2.B1 BAGLANTI: A\'nin eslestirmesi kendi kalemini kendi fiyatiyla bulur (777)',
      eslesme?.netPrice === 777, JSON.stringify(eslesme));
    // KORUMA (kanit DEGIL): master'da da yesildi — eslestirme zaten kiracinin
    // LaborPrice satirlariyla kapsamli. Gerileme korumasi olarak durur;
    // master'da kirmizi olan baglanti K1.B3.
    const bEslesme = await eslestir(d, 'b', b1, 'KÜRESEL VANA DN65');
    check('K2.B2 KORUMA: B\'nin eslestirmesi A\'nin fiyatini ASLA getirmez (master\'da da yesil)',
      bEslesme?.netPrice !== 777, JSON.stringify(bEslesme));

    const put = await d.istek('y', 'PUT', `/labor/${aKalem?.id}`, { name: 'Yonetici elinden ad' });
    check('K2.6 Yonetici kiraci kalemini PUT /labor/:id ile degistiremez (404, ad ayni)',
      put.durum === 404 && kalemRow(d, aKalem?.id)?.name === A_OZEL, `${put.durum} ${kalemRow(d, aKalem?.id)?.name}`);
    const sil = await d.istek('y', 'DELETE', `/labor/${aKalem?.id}`);
    check('K2.7 Yonetici kiraci kalemini silemez (404) — A\'nin fiyat satiri yerinde',
      sil.durum === 404 && !!fiyatSatiri(d, a1, A_OZEL), `${sil.durum} satir=${!!fiyatSatiri(d, a1, A_OZEL)}`);

    const katPut = await d.istek('y', 'PUT', `/labor/${katalogId}`, { unitPrice: 55 });
    check('K2.8 Yonetici KATALOG kalemini duzenlemeye devam eder (davranis degismedi)',
      katPut.durum === 200 && kalemRow(d, katalogId)?.unitPrice === 55, `${katPut.durum} ${katPut.metin}`);
    const katPut2 = await d.istek('y', 'PUT', `/labor/${katalogId}`, { unitPrice: 56, ownerFirmaId: 'firma-a', isGlobal: false });
    check('K2.8b Yonetici govdesi sahipligi YAZAMAZ (katalog kalemi kiraciya tasinmaz; ekranin alanlari yazilir)',
      katPut2.durum === 200 && kalemRow(d, katalogId)?.ownerFirmaId === null && kalemRow(d, katalogId)?.isGlobal === true &&
        kalemRow(d, katalogId)?.unitPrice === 56,
      `${katPut2.durum} ${JSON.stringify({ owner: kalemRow(d, katalogId)?.ownerFirmaId, g: kalemRow(d, katalogId)?.isGlobal })}`);
    const kiraciPost = await d.istek('a1', 'POST', '/labor', { name: 'X', unitPrice: 1, discipline: 'mechanical' });
    check('K2.9 Kiraci katalog kalemi ekleyemez (403, RolesGuard GERCEK)', kiraciPost.durum === 403, `${kiraciPost.durum}`);

    // Sahiplik FIRMADA: A'nin ikinci uyesi ayni adi yuklerse ayni kaleme
    // baglanir (eslestirme olcumlerinden SONRA: ikinci fiyat secim uretirdi).
    await yukle(d, 'a2', a1, [[A_OZEL, 778]]);
    const a2Satirlari = d.db.tablo('LaborPrice').filter((p) => p.firmaId === a1 && p.unitPrice === 778);
    check('K2.4b A\'nin ikinci uyesinin yuklemesi firmanin AYNI kalemine baglanir (sahiplik firmada)',
      a2Satirlari.length === 1 && a2Satirlari[0].laborItemId === aKalem?.id && kalemAdiyla(d, A_OZEL).length === 1,
      JSON.stringify(a2Satirlari.map((p) => p.laborItemId)));
  } finally {
    await d.app.close();
  }
}

// ═══ K2b — ayni ad iki kiracida + katalog adli satir ══════════════════════
async function k2bBlogu(): Promise<void> {
  console.log('\n── K2b (C2) aynı ad iki kiracıda · katalog adıyla yükleme ──');
  const d = await dunyaKur();
  try {
    const katalogId = await katalogKalemi(d, KATALOG_AD, 50);
    await bayatKatalog(d, katalogId);
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    const b1 = await iscilikFirmasiAc(d, 'b', 'Usta B1');
    await yukle(d, 'a1', a1, [[ORTAK_AD, 100, 'mt']]);
    await yukle(d, 'b', b1, [[ORTAK_AD, 120, 'mt']]);
    const aSatir = fiyatSatiri(d, a1, ORTAK_AD);
    const bSatir = fiyatSatiri(d, b1, ORTAK_AD);
    check('K2.10 Ayni adi yukleyen iki kiraci AYRI kaleme baglanir',
      !!aSatir && !!bSatir && aSatir.laborItemId !== bSatir.laborItemId,
      JSON.stringify({ a: aSatir?.laborItemId, b: bSatir?.laborItemId }));
    const aKalemi = kalemRow(d, aSatir?.laborItemId);
    const bKalemi = kalemRow(d, bSatir?.laborItemId);
    check('K2.11 Her kiracinin kalemi KENDISINE ait ve kendi fiyatini tasir (A 100, B 120)',
      aKalemi?.ownerFirmaId === 'firma-a' && aKalemi?.unitPrice === 100 &&
        bKalemi?.ownerFirmaId === 'firma-b' && bKalemi?.unitPrice === 120,
      JSON.stringify({ a: [aKalemi?.ownerFirmaId, aKalemi?.unitPrice], b: [bKalemi?.ownerFirmaId, bKalemi?.unitPrice] }));

    // Sonradan AYNI adla katalog kalemi acilir: A'nin yeni listesi yine KENDI
    // kalemine baglanir (katalog kopyasi A'nin satirlarini ikiye bolmez).
    const ayniAdKatalog = await katalogKalemi(d, ORTAK_AD, 95);
    await yukle(d, 'a1', a1, [[ORTAK_AD, 105, 'mt']]);
    const aSatirlari = d.db.tablo('LaborPrice').filter((p) => p.firmaId === a1 && kalemRow(d, p.laborItemId)?.name === ORTAK_AD);
    check('K2.16 Ayni adda kendi + katalog kalemi varken yukleme KENDI kalemine baglanir',
      aSatirlari.length === 2 && aSatirlari.every((p) => p.laborItemId === aSatir?.laborItemId) &&
        !d.db.tablo('LaborPrice').some((p) => p.laborItemId === ayniAdKatalog),
      JSON.stringify(aSatirlari.map((p) => p.laborItemId)));

    check('K2.12a FIXTURE: katalog kalemi BAYAT (etiketsiz, eski surum) — toplu yuklemenin tazeleme kapisi surulur',
      bayatMi(d, katalogId), JSON.stringify({ tags: kalemRow(d, katalogId)?.tags, v: kalemRow(d, katalogId)?.indexVersion }));
    const bas = d.db.izler.length;
    const katalogOnce = { ...kalemRow(d, katalogId) };
    await yukle(d, 'a1', a1, [[KATALOG_AD, 85, 'mt']]);
    const katSatir = fiyatSatiri(d, a1, KATALOG_AD);
    check('K2.12 Katalog adli satir KATALOG kalemine baglanir (yeni kalem acilmaz)',
      katSatir?.laborItemId === katalogId && kalemAdiyla(d, KATALOG_AD).length === 1,
      JSON.stringify({ bagli: katSatir?.laborItemId, adet: kalemAdiyla(d, KATALOG_AD).length }));
    const yazan = kalemeYazanlar(d, katalogId, bas);
    check('K2.13 Kiraci yuklemesi katalog kalemine YAZMAZ (ad/fiyat/indeks/etiket ayni)',
      yazan.length === 0 && JSON.stringify(kalemRow(d, katalogId)) === JSON.stringify(katalogOnce), yazan.join(' | '));

    const esA = await eslestir(d, 'a1', a1, 'SİYAH ÇELİK BORU - DN50', 'mt');
    check('K2.B3 BAGLANTI: katalog kalemine bagli satir kiracinin fiyatiyla eslesir (85, katalog 50 degil)',
      esA?.netPrice === 85, JSON.stringify(esA));

    // Joker/kacis (guvenlik incelemesi MEDIUM; 01.10 gercek PG'de olculdu:
    // `equals` + `mode:'insensitive'` = ILIKE, `%` `_` `\` KACISLANMAZ).
    const altCizgi = `${KATALOG_AD.slice(0, -1)}_`;
    await yukle(d, 'a1', a1, [['Siyah%', 11, 'mt'], [altCizgi, 12, 'mt']]);
    const jokerSatir = fiyatSatiri(d, a1, 'Siyah%');
    check('K2.17 `%` tasiyan yukleme adi katalog kalemine BAGLANMAZ — kiracinin kendi kalemi',
      !!jokerSatir && kalemRow(d, jokerSatir.laborItemId)?.ownerFirmaId === 'firma-a', JSON.stringify(jokerSatir ?? null));
    const altCizgiSatir = fiyatSatiri(d, a1, altCizgi);
    check('K2.18 `_` tasiyan yukleme adi tek harfle esleyip katalog kalemine BAGLANMAZ',
      !!altCizgiSatir && altCizgiSatir.laborItemId !== katalogId, JSON.stringify(altCizgiSatir ?? null));
    const tersBolu = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: 'new', items: [{ laborName: 'Boru montajı \\', unitPrice: 13, unit: 'mt' }],
    });
    check('K2.19 Sonu ters bolu olan ad yuklemeyi DUSURMEZ (PG 22025 → 500 degil), kendi kalemi acilir',
      tersBolu.durum === 201 && !!fiyatSatiri(d, a1, 'Boru montajı \\'), `${tersBolu.durum} ${tersBolu.metin}`);
  } finally {
    await d.app.close();
  }
}

// ═══ K2c — sayfa (save-from-sheets) yolu ═══════════════════════════════════
async function k2cBlogu(): Promise<void> {
  console.log('\n── K2c (C2) sayfa yolu (save-from-sheets) ──');
  const d = await dunyaKur();
  try {
    const katalogId = await katalogKalemi(d, KATALOG_AD, 50);
    await bayatKatalog(d, katalogId);
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    check('K2.14c FIXTURE: katalog kalemi BAYAT (etiketsiz, eski surum) — sayfa yolunun tazeleme kapisi surulur',
      bayatMi(d, katalogId), JSON.stringify({ tags: kalemRow(d, katalogId)?.tags, v: kalemRow(d, katalogId)?.indexVersion }));
    const bas = d.db.izler.length;
    const katalogOnce = { ...kalemRow(d, katalogId) };
    const r = await sayfadanYukle(d, 'a1', a1, [['Yangın dolabı montajı', 300], [KATALOG_AD, 90]]);
    check('K2.14a FIXTURE: sayfa yuklemesi iki satiri yazdi', r.durum === 201 && !!fiyatSatiri(d, a1, 'Yangın dolabı montajı') &&
      !!fiyatSatiri(d, a1, KATALOG_AD), `${r.durum} ${r.metin}`);
    const kalem = kalemAdiyla(d, 'Yangın dolabı montajı')[0];
    check('K2.14 Sayfa yolunda acilan kalem A\'ya ait (ownerFirmaId=firma-a)', kalem?.ownerFirmaId === 'firma-a',
      JSON.stringify({ owner: kalem?.ownerFirmaId }));
    const yGorur = await katalog(d);
    check('K2.14b Sayfa yoluyla yazilan kiraci kalemi yonetici kataloguna DUSMEZ',
      !yGorur.some((k) => k.name === 'Yangın dolabı montajı') && yGorur.some((k) => k.id === katalogId),
      JSON.stringify(yGorur.map((k) => k.name)));
    const yazan = kalemeYazanlar(d, katalogId, bas);
    check('K2.15 Sayfa yolu da katalog kalemine YAZMAZ (bayat indeksi kiraci tazelemez)',
      yazan.length === 0 && JSON.stringify(kalemRow(d, katalogId)) === JSON.stringify(katalogOnce), yazan.join(' | '));
  } finally {
    await d.app.close();
  }
}

// ═══ K1 — C1: yeniden adlandirma yalniz O satirin bagini tasir ═══════════
const KOMP = 'Kompansatör montajı DN100';
const KOMP_YENI = 'Kompansatör montajı DN125';
async function k1Blogu(): Promise<void> {
  console.log('\n── K1 (C1) yeniden adlandırma ──');
  const d = await dunyaKur();
  try {
    const katalogId = await katalogKalemi(d, KATALOG_AD, 50);
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    const a2 = await iscilikFirmasiAc(d, 'a1', 'Usta A2');
    const b1 = await iscilikFirmasiAc(d, 'b', 'Usta B1');
    const listeA1 = await yukle(d, 'a1', a1, [[KOMP, 200], [KATALOG_AD, 85, 'mt'], ['Termostatik vana montajı DN15', 40]]);
    const listeA2 = await yukle(d, 'a1', a2, [[KOMP, 210]]);
    const listeB1 = await yukle(d, 'b', b1, [[KOMP, 250]]);

    const satirA1 = fiyatSatiri(d, a1, KOMP)!;
    const put = await d.istek('a1', 'PUT', `/labor-firms/price-items/${satirA1.id}`, { laborItemName: KOMP_YENI });
    check('K1.0 FIXTURE: yeniden adlandirma istegi basarili', put.durum === 200, `${put.durum} ${put.metin}`);
    check('K1.1 A1\'deki satir yeni adi gosterir', (await listeAdlari(d, 'a1', listeA1)).includes(KOMP_YENI),
      JSON.stringify(await listeAdlari(d, 'a1', listeA1)));
    check('K1.2 AYNI firmanin DIGER iscilik firmasindaki (A2) satir ESKI adda kalir',
      JSON.stringify(await listeAdlari(d, 'a1', listeA2)) === JSON.stringify([KOMP]), JSON.stringify(await listeAdlari(d, 'a1', listeA2)));
    check('K1.3 BASKA kiracinin (B) satiri ESKI adda kalir',
      JSON.stringify(await listeAdlari(d, 'b', listeB1)) === JSON.stringify([KOMP]), JSON.stringify(await listeAdlari(d, 'b', listeB1)));
    const esA2 = await eslestir(d, 'a1', a2, 'KOMPANSATÖR DN100');
    check('K1.B1 BAGLANTI: A2 eski adla eslesmeye devam eder (210)', esA2?.netPrice === 210, JSON.stringify(esA2));
    const esA1 = await eslestir(d, 'a1', a1, 'KOMPANSATÖR DN125');
    check('K1.B2 BAGLANTI: A1 yeni adla eslesir (200)', esA1?.netPrice === 200, JSON.stringify(esA1));
    // Master'da KIRMIZI olan baglanti (C1'in B'ye etkisi): ortak kalem A'nin
    // eliyle yeniden adlanınca B'nin eski adla eslestirmesi BULAMIYORDU.
    const esB = await eslestir(d, 'b', b1, 'KOMPANSATÖR DN100');
    check('K1.B3 BAGLANTI: BASKA kiraci (B) eski adla kendi fiyatini bulmaya devam eder (250)',
      esB?.netPrice === 250, JSON.stringify(esB));

    const katSatir = fiyatSatiri(d, a1, KATALOG_AD)!;
    const katAdi = 'Siyah çelik boru montajı yivli DN50';
    const put2 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${katSatir.id}`, { laborItemName: katAdi, unitPrice: 86 });
    check('K1.4 Katalog kalemine bagli satiri adlandirmak KATALOG kalemini degistirmez',
      put2.durum === 200 && kalemRow(d, katalogId)?.name === KATALOG_AD, `${put2.durum} katalog=${kalemRow(d, katalogId)?.name}`);
    const yeniSatir = d.db.tablo('LaborPrice').find((p) => p.id === katSatir.id);
    check('K1.5 Satir yeni adli KENDI kalemine tasindi, fiyati korundu (86)',
      !!yeniSatir && kalemRow(d, yeniSatir.laborItemId)?.name === katAdi && kalemRow(d, yeniSatir.laborItemId)?.ownerFirmaId === 'firma-a' &&
        yeniSatir.unitPrice === 86,
      JSON.stringify({ kalem: kalemRow(d, yeniSatir?.laborItemId), fiyat: yeniSatir?.unitPrice }));

    const termo = fiyatSatiri(d, a1, 'Termostatik vana montajı DN15')!;
    const termoKalem = termo.laborItemId;
    const kalemSayisi = d.db.tablo('LaborItem').length;
    const put3 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${termo.id}`, { laborItemName: 'Termostatik vana montajı DN20' });
    check('K1.6 Yalniz bu satira ait kalem YERINDE adlanir (yeni kalem acilmaz, kimlik ayni)',
      put3.durum === 200 && kalemRow(d, termoKalem)?.name === 'Termostatik vana montajı DN20' &&
        d.db.tablo('LaborItem').length === kalemSayisi,
      `${put3.durum} ${kalemRow(d, termoKalem)?.name} ${kalemSayisi}→${d.db.tablo('LaborItem').length}`);

    // Tek satirlik KENDI kalemi, listede zaten olan bir ada da YERINDE adlanir
    // (eski davranis — ayni listede iki adin takasi bu sayede calisir; ad
    // tekrari kalemlerde serbest). Cakisma 409'u yalniz BAG TASINIRKEN (K1c).
    const cakisan = fiyatSatiri(d, a1, KOMP_YENI)!;
    // Satir nesnesi CANLI: kimlik istekten ONCE alinir (yoksa "kimlik ayni"
    // olcutu ayni nesneyi kendisiyle karsilastirir — 01.10 mutasyonda olculdu).
    const cakisanKalemi = cakisan.laborItemId as string;
    const kalemSayisi4 = d.db.tablo('LaborItem').length;
    const put4 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${cakisan.id}`, { laborItemName: katAdi });
    const cakisanSonra = d.db.tablo('LaborPrice').find((p) => p.id === cakisan.id);
    check('K1.7 Tek satirlik kendi kalemi listede var olan ada da YERINDE adlanir (409 yok, kimlik ayni, yeni kalem yok)',
      put4.durum === 200 && cakisanSonra?.laborItemId === cakisanKalemi && kalemRow(d, cakisanKalemi)?.name === katAdi &&
        d.db.tablo('LaborItem').length === kalemSayisi4,
      `${put4.durum} ${put4.metin} ${JSON.stringify({ once: cakisanKalemi, sonra: cakisanSonra?.laborItemId })}`);
  } finally {
    await d.app.close();
  }
}

// ═══ K1b — ekranin kullandigi yol (save-sheets dirtyRows) ═════════════════
async function k1bBlogu(): Promise<void> {
  console.log('\n── K1b (C1) ızgara kaydı (save-sheets) ──');
  const d = await dunyaKur();
  try {
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    const a2 = await iscilikFirmasiAc(d, 'a1', 'Usta A2');
    const listeA1 = await yukle(d, 'a1', a1, [[KOMP, 200]]);
    const listeA2 = await yukle(d, 'a1', a2, [[KOMP, 210]]);
    const satir = fiyatSatiri(d, a1, KOMP)!;
    const r = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [{ laborPriceId: satir.id, laborItemName: KOMP_YENI, listPrice: 200 }],
    });
    check('K1.8 FIXTURE: izgara kaydi 1 satir guncelledi', r.durum === 201 && r.veri?.updated === 1, `${r.durum} ${r.metin}`);
    check('K1.9 Izgaradan adlandirma da DIGER iscilik firmasini degistirmez',
      JSON.stringify(await listeAdlari(d, 'a1', listeA2)) === JSON.stringify([KOMP]) &&
        (await listeAdlari(d, 'a1', listeA1)).includes(KOMP_YENI),
      JSON.stringify({ a1: await listeAdlari(d, 'a1', listeA1), a2: await listeAdlari(d, 'a1', listeA2) }));
  } finally {
    await d.app.close();
  }
}

// ═══ K1c — paylasilan kalem, takas, buyuk/kucuk harf, izgara gorunumu, joker ══
const ORTAK_KALEM = 'Ortak kalem montajı';
const HEDEF_KALEM = 'Hedef kalem montajı';
const GORUNUM_KALEM = 'Görünüm kalem montajı';
const JOKER_KALEM = 'Joker test montajı';
const SAYFA_ROLLERI = { nameField: 'ad', laborUnitPriceField: 'fiyat' };

/** Kayitli sayfadaki (LaborPriceList.sheets) bir satirin ad hucresi. */
function sayfadakiAd(d: Dunya, listeId: string, fiyatId: string): string | undefined {
  const sayfa = d.db.tablo('LaborPriceList').find((l) => l.id === listeId)?.sheets as any;
  return sayfa?.rowData?.find((r: any) => r._laborPriceId === fiyatId)?.ad;
}

/** Kayitli sayfanin veri satirlarinin `_laborPriceId` sirasi. */
function sayfaKimlikleri(d: Dunya, listeId: string): string[] {
  const sayfa = d.db.tablo('LaborPriceList').find((l) => l.id === listeId)?.sheets as any;
  return ((sayfa?.rowData ?? []) as any[]).filter((r) => r?._isDataRow).map((r) => r._laborPriceId);
}

/**
 * TEK SEFERLIK yazim hatasi: verilen satir(lar)in BAGI tasinirken (update
 * `data.laborItemId`) her biri icin BIR KEZ hata firlatilir. Hedef secimi ayni
 * listede satiri olan kalemi artik ATLADIGI icin (inceleme 2. tur) bag
 * tasimasinin 409'u yalniz yarista kalir — es zamanli istek ayni kalemi ayni
 * listeye ekler; testte ancak boyle uretilir. Beklenmeyen DB hatasi da ayni
 * kapidan. Hepsi atesleyince asil `update` geri konur.
 */
function bagTasimaHatasi(d: Dunya, fiyatIdleri: string | string[], hata: Error | ((fiyatId: string) => Error)): void {
  const api = d.db.istemci.laborPrice;
  const asil = api.update;
  const kalan = new Set(([] as string[]).concat(fiyatIdleri));
  api.update = async (args: any) => {
    const id = args?.where?.id;
    if (kalan.has(id) && args?.data?.laborItemId !== undefined) {
      kalan.delete(id);
      if (kalan.size === 0) api.update = asil;
      throw typeof hata === 'function' ? hata(id) : hata;
    }
    return asil(args);
  };
}
const yarisHatasi = (): Error => new Prisma.PrismaClientKnownRequestError(
  'Unique constraint failed on the fields: (`laborItemId`,`firmaId`,`priceListId`)',
  { code: 'P2002', clientVersion: 'test', meta: { target: ['laborItemId', 'firmaId', 'priceListId'] } },
);

async function k1cBlogu(): Promise<void> {
  console.log('\n── K1c (C1) paylaşılan kalem · takas · harf · ızgara görünümü · joker ──');
  const d = await dunyaKur();
  try {
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    const a2 = await iscilikFirmasiAc(d, 'a1', 'Usta A2');
    const listeA1 = await yukle(d, 'a1', a1, [
      [ORTAK_KALEM, 100], [HEDEF_KALEM, 120], ['Takas bir montajı', 10], ['Takas iki montajı', 20], ['boru montaji test', 5],
      [GORUNUM_KALEM, 30], [JOKER_KALEM, 40],
    ]);
    const listeA2 = await yukle(d, 'a1', a2, [[ORTAK_KALEM, 110], ['boru montaji test', 6], [GORUNUM_KALEM, 31], [JOKER_KALEM, 41]]);
    const ortakA1 = fiyatSatiri(d, a1, ORTAK_KALEM)!;
    const ortakA2 = fiyatSatiri(d, a2, ORTAK_KALEM)!;
    const hedefA1 = fiyatSatiri(d, a1, HEDEF_KALEM)!;
    // Satir nesneleri CANLI (bellek-Prisma yerinde gunceller): bag olcumu
    // icin kimlikler ONCEDEN alinir.
    const ortakKalemi = ortakA1.laborItemId as string;
    const hedefKalemi = hedefA1.laborItemId as string;
    check('K1c.0 FIXTURE: ortak kalem iki iscilik firmasinda AYNI kaleme bagli',
      ortakA1.laborItemId === ortakA2.laborItemId &&
        fiyatSatiri(d, a1, GORUNUM_KALEM)?.laborItemId === fiyatSatiri(d, a2, GORUNUM_KALEM)?.laborItemId &&
        fiyatSatiri(d, a1, JOKER_KALEM)?.laborItemId === fiyatSatiri(d, a2, JOKER_KALEM)?.laborItemId,
      JSON.stringify(ortakA1));

    // Inceleme 2. tur (01.10): hedef secimi AYNI LISTEDE satiri olan kalemi
    // atlar — paylasilan kalemin satiri listede var olan bir ada da adlanir:
    // KENDI yeni kalemi acilir (ad tekrari kalemlerde serbest; tek satirlik
    // kendi kaleminin yerinde adlanmasiyla ayni sonuc, K1.7). Eskiden 409.
    const put = await d.istek('a1', 'PUT', `/labor-firms/price-items/${ortakA1.id}`, { laborItemName: HEDEF_KALEM, unitPrice: 999 });
    const ortakSonra = d.db.tablo('LaborPrice').find((p) => p.id === ortakA1.id);
    const ortakYeniKalem = kalemRow(d, ortakSonra?.laborItemId);
    check('K1c.1 Paylasilan kalemin satiri listede VAR OLAN ada da adlanir (200): KENDI yeni kalemi, fiyat 999 yazildi',
      put.durum === 200 && ortakYeniKalem?.name === HEDEF_KALEM && ortakYeniKalem?.ownerFirmaId === 'firma-a' &&
        ortakSonra?.laborItemId !== hedefKalemi && ortakSonra?.laborItemId !== ortakKalemi &&
        ortakSonra?.unitPrice === 999,
      `${put.durum} ${put.metin} ${JSON.stringify({ ad: ortakYeniKalem?.name, sahip: ortakYeniKalem?.ownerFirmaId, fiyat: ortakSonra?.unitPrice })}`);
    check('K1c.1b Listedeki ayni adli satir ve DIGER iscilik firmasinin satiri yerinde kalir (bag, ad, fiyat)',
      d.db.tablo('LaborPrice').find((p) => p.id === hedefA1.id)?.laborItemId === hedefKalemi &&
        d.db.tablo('LaborPrice').find((p) => p.id === ortakA2.id)?.laborItemId === ortakKalemi &&
        kalemRow(d, ortakKalemi)?.name === ORTAK_KALEM && d.db.tablo('LaborPrice').find((p) => p.id === hedefA1.id)?.unitPrice === 120,
      JSON.stringify(await listeAdlari(d, 'a1', listeA2)));

    // Ayni kayitta iki satirin adi TAKAS edilir (tek satirlik kendi kalemleri yerinde adlanir).
    const t1 = fiyatSatiri(d, a1, 'Takas bir montajı')!;
    const t2 = fiyatSatiri(d, a1, 'Takas iki montajı')!;
    const takas = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [
        { laborPriceId: t1.id, laborItemName: 'Takas iki montajı', listPrice: 10 },
        { laborPriceId: t2.id, laborItemName: 'Takas bir montajı', listPrice: 20 },
      ],
    });
    check('K1c.2 Ayni kayitta iki adin TAKASI calisir (eski davranis; iki satir da guncellendi, hata yok)',
      takas.durum === 201 && takas.veri?.updated === 2 && (takas.veri?.errors ?? []).length === 0 &&
        kalemRow(d, d.db.tablo('LaborPrice').find((p) => p.id === t1.id)?.laborItemId)?.name === 'Takas iki montajı' &&
        kalemRow(d, d.db.tablo('LaborPrice').find((p) => p.id === t2.id)?.laborItemId)?.name === 'Takas bir montajı',
      `${takas.durum} ${takas.metin}`);

    // Katalog kalemlerine bagli iki satirin TAKASI: ilk satirin hedefi (Y)
    // listede ikinci satira bagli → atlanir, KENDI kalemi acilir; ikinci
    // satirin hedefi (X) o anda listede satirsiz → katalog kalemine baglanir.
    const katX = await katalogKalemi(d, 'Katalog takas X montajı', 7);
    const katY = await katalogKalemi(d, 'Katalog takas Y montajı', 8);
    const listeKat = await yukle(d, 'a1', a1, [['Katalog takas X montajı', 70], ['Katalog takas Y montajı', 80]]);
    const kx = d.db.tablo('LaborPrice').find((p) => p.priceListId === listeKat && p.laborItemId === katX)!;
    const ky = d.db.tablo('LaborPrice').find((p) => p.priceListId === listeKat && p.laborItemId === katY)!;
    const katTakas = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeKat}/save-sheets`, {
      dirtyRows: [
        { laborPriceId: kx.id, laborItemName: 'Katalog takas Y montajı', listPrice: 70 },
        { laborPriceId: ky.id, laborItemName: 'Katalog takas X montajı', listPrice: 80 },
      ],
    });
    const kxSonra = d.db.tablo('LaborPrice').find((p) => p.id === kx.id);
    const kySonra = d.db.tablo('LaborPrice').find((p) => p.id === ky.id);
    check('K1c.12 Katalog kalemli iki satirin ad TAKASI calisir (hata yok; katalog kalemlerinin adi degismez)',
      katTakas.durum === 201 && katTakas.veri?.updated === 2 && (katTakas.veri?.errors ?? []).length === 0 &&
        kalemRow(d, kxSonra?.laborItemId)?.name === 'Katalog takas Y montajı' && kalemRow(d, kxSonra?.laborItemId)?.ownerFirmaId === 'firma-a' &&
        kySonra?.laborItemId === katX && kalemRow(d, katX)?.name === 'Katalog takas X montajı' &&
        kalemRow(d, katY)?.name === 'Katalog takas Y montajı',
      `${katTakas.durum} ${katTakas.metin} ${JSON.stringify({ x: kalemRow(d, kxSonra?.laborItemId)?.name, y: kySonra?.laborItemId === katX })}`);

    // L1: paylasilan kalemin satiri yalniz harf degisikligiyle adlanir, sonra yine.
    const boruA1 = fiyatSatiri(d, a1, 'boru montaji test')!;
    const h1 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${boruA1.id}`, { laborItemName: 'Boru Montaji Test' });
    const h2 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${boruA1.id}`, { laborItemName: 'BORU MONTAJI TEST' });
    const boruSonra = d.db.tablo('LaborPrice').find((p) => p.id === boruA1.id);
    check('K1c.3 Yalniz harf degisen ad KULLANICININ yazimiyla kalir (eski ayni adli kaleme kaymaz)',
      h1.durum === 200 && h2.durum === 200 && kalemRow(d, boruSonra?.laborItemId)?.name === 'BORU MONTAJI TEST',
      `${h1.durum} ${h2.durum} ${kalemRow(d, boruSonra?.laborItemId)?.name}`);
    check('K1c.4 Paylasan DIGER iscilik firmasinin satiri eski yazimda kalir',
      JSON.stringify((await listeAdlari(d, 'a1', listeA2)).filter((a) => a.toLowerCase().startsWith('boru'))) ===
        JSON.stringify(['boru montaji test']),
      JSON.stringify(await listeAdlari(d, 'a1', listeA2)));

    // W1: izgara kaydinda DB'ye yazilamayan satirin GORUNUMU kaydedilmez.
    const gorunumA1 = fiyatSatiri(d, a1, GORUNUM_KALEM)!;
    const sayfa = (rows: Array<{ id?: string; ad: string; fiyat: number; ek?: Record<string, unknown> }>) => ({
      columnDefs: [{ field: 'ad' }, { field: 'fiyat' }],
      columnRoles: SAYFA_ROLLERI,
      headerEndRow: 0,
      rowData: rows.map((r, i) => ({
        _rowIdx: i + 1, _isDataRow: true, ...(r.id ? { _laborPriceId: r.id } : {}), ad: r.ad, fiyat: r.fiyat, ...(r.ek ?? {}),
      })),
    });
    const ilk = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [],
      sheet: sayfa([{ id: gorunumA1.id, ad: GORUNUM_KALEM, fiyat: 30 }, { id: hedefA1.id, ad: HEDEF_KALEM, fiyat: 120 }]),
    });
    check('K1c.6 FIXTURE: liste sayfasi kaydedildi', ilk.durum === 201 && sayfadakiAd(d, listeA1, gorunumA1.id) === GORUNUM_KALEM,
      `${ilk.durum} ${ilk.metin}`);
    bagTasimaHatasi(d, gorunumA1.id, yarisHatasi());
    const ikinci = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [
        { laborPriceId: gorunumA1.id, laborItemName: 'Görünüm yeni ad montajı', listPrice: 32 },
        { laborPriceId: hedefA1.id, laborItemName: HEDEF_KALEM, listPrice: 121 },
      ],
      sheet: sayfa([{ id: gorunumA1.id, ad: 'Görünüm yeni ad montajı', fiyat: 32 }, { id: hedefA1.id, ad: HEDEF_KALEM, fiyat: 121 }]),
    });
    check('K1c.7 Izgara kaydi basarisiz satiri NEDENIYLE doner (yaris: 409 metni), basarili satir yazilir',
      ikinci.durum === 201 && ikinci.veri?.updated === 1 && (ikinci.veri?.errors ?? []).length === 1 &&
        String(ikinci.veri?.errors?.[0]?.error ?? '').includes('aynı adlı') &&
        d.db.tablo('LaborPrice').find((p) => p.id === hedefA1.id)?.unitPrice === 121 &&
        d.db.tablo('LaborPrice').find((p) => p.id === gorunumA1.id)?.unitPrice === 30,
      `${ikinci.durum} ${ikinci.metin}`);
    check('K1c.8 Basarisiz satirin sayfadaki gorunumu ESKI haline doner (DB ile ayni ad), basarili satirinki kaydedilir',
      sayfadakiAd(d, listeA1, gorunumA1.id) === GORUNUM_KALEM && sayfadakiAd(d, listeA1, hedefA1.id) === HEDEF_KALEM &&
        (d.db.tablo('LaborPriceList').find((l) => l.id === listeA1)?.sheets as any)?.rowData?.find((r: any) => r._laborPriceId === hedefA1.id)?.fiyat === 121,
      JSON.stringify((d.db.tablo('LaborPriceList').find((l) => l.id === listeA1)?.sheets as any)?.rowData));

    // Ekran yeni satir varken IKI istek gonderir: once save-sheets (mevcut
    // satirlar), sonra save-bulk (yeni satirlar + TAM sayfa). Ikinci istegin
    // sayfasi, birincinin YAZAMADIGI satirin yeni adini tasir.
    bagTasimaHatasi(d, gorunumA1.id, yarisHatasi());
    const ikinciAd = 'Görünüm ikinci ad montajı';
    const yeniSatirAdi = 'Görünüm yeni satır montajı';
    const ekranSayfasi = sayfa([
      { id: gorunumA1.id, ad: ikinciAd, fiyat: 30 },
      { id: hedefA1.id, ad: HEDEF_KALEM, fiyat: 121 },
      { ad: yeniSatirAdi, fiyat: 33, ek: { _laborName: yeniSatirAdi } },
    ]);
    const s1 = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [{ laborPriceId: gorunumA1.id, laborItemName: ikinciAd, listPrice: 30 }],
      sheet: { ...ekranSayfasi, rowData: ekranSayfasi.rowData.filter((r: any) => r._laborPriceId) },
    });
    const s2 = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeA1,
      items: [{ laborName: yeniSatirAdi, unitPrice: 33, unit: 'adet' }],
      sheet: ekranSayfasi,
    });
    const yeniFiyat = fiyatSatiri(d, a1, yeniSatirAdi);
    check('K1c.13a FIXTURE: ilk istekte satir yazilamadi, ikinci istek yeni satiri yazdi',
      (s1.veri?.errors ?? []).length === 1 && s2.durum === 201 && s2.veri?.imported === 1 && !!yeniFiyat,
      `${s1.metin} | ${s2.durum} ${s2.metin}`);
    check('K1c.13 Ardindan gelen toplu kayit (save-bulk) yazilamayan satirin yeni adini GERI GETIRMEZ; yeni satir kimligiyle eklenir',
      sayfadakiAd(d, listeA1, gorunumA1.id) === GORUNUM_KALEM && sayfadakiAd(d, listeA1, yeniFiyat?.id ?? '-') === yeniSatirAdi &&
        JSON.stringify(sayfaKimlikleri(d, listeA1)) === JSON.stringify([gorunumA1.id, hedefA1.id, yeniFiyat?.id]),
      JSON.stringify((d.db.tablo('LaborPriceList').find((l) => l.id === listeA1)?.sheets as any)?.rowData));

    // Kayitli sayfasi OLMAYAN (sentetik) liste: yazilamayan satirin kayitli
    // hali yok — iki istekten sonra okumada yine DB'deki adla gelir.
    // Sentetik sayfa satirlari ada gore dizilir: yazilamayacak satir ILK sirada
    // (sona eklenen bir uygulama yerinde olandan ayirt edilsin — inceleme LOW-A).
    const SENTETIK = 'Sentetik ortak montajı';
    const SENTETIK2 = 'Sentetik son montajı';
    const listeS = await yukle(d, 'a1', a1, [[SENTETIK, 50], [SENTETIK2, 55]]);
    await yukle(d, 'a1', a2, [[SENTETIK, 51]]);
    const sS = d.db.tablo('LaborPrice').find((p) => p.priceListId === listeS && kalemRow(d, p.laborItemId)?.name === SENTETIK)!;
    const okuS = await d.istek('a1', 'GET', `/labor-firms/price-lists/${listeS}/sheets`);
    const sentetikSayfa = okuS.veri?.sheet;
    const sentetikAd = 'Sentetik yeni ad montajı';
    const ekranS = ((sentetikSayfa?.rowData ?? []) as any[]).map((r) => (r._laborPriceId === sS.id ? { ...r, ad: sentetikAd } : r));
    bagTasimaHatasi(d, sS.id, yarisHatasi());
    const sentetik1 = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeS}/save-sheets`, {
      dirtyRows: [{ laborPriceId: sS.id, laborItemName: sentetikAd, listPrice: 50 }],
      sheet: { columnDefs: sentetikSayfa?.columnDefs, columnRoles: sentetikSayfa?.columnRoles, headerEndRow: 0, rowData: ekranS },
    });
    // Inceleme 3. tur (LOW-1): kayitli hali olmayan yazilamamis satir DUSMEZ —
    // yerinde DB haliyle yazilir (eskiden dusup okumada SONA ekleniyordu).
    const sayfaS = ((d.db.tablo('LaborPriceList').find((l) => l.id === listeS)?.sheets as any)?.rowData ?? []) as any[];
    const ekrandaS = ekranS.find((r) => r._laborPriceId === sS.id);
    const yerindeS = sayfaS.find((r) => r._laborPriceId === sS.id);
    check('K1c.13b2 W1: kayitli hali olmayan yazilamamis satir YERINDE DB haliyle yazilir (sira, satir no, ad; dusmez, yeni ad yok)',
      JSON.stringify(sayfaKimlikleri(d, listeS)) === JSON.stringify(ekranS.filter((r) => r._isDataRow).map((r) => r._laborPriceId)) &&
        sayfaKimlikleri(d, listeS).length === 2 && sayfaKimlikleri(d, listeS)[0] === sS.id && yerindeS?.ad === SENTETIK &&
        yerindeS?._rowIdx === ekrandaS?._rowIdx && yerindeS?.col0 === ekrandaS?.col0,
      JSON.stringify(sayfaS));
    const sentetikYeni = 'Sentetik yeni satır montajı';
    await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeS,
      items: [{ laborName: sentetikYeni, unitPrice: 52, unit: 'adet' }],
      sheet: {
        columnDefs: sentetikSayfa?.columnDefs, columnRoles: sentetikSayfa?.columnRoles, headerEndRow: 0,
        rowData: [...ekranS, { _rowIdx: 99, _isDataRow: true, ad: sentetikYeni, fiyat: 52, birim: 'adet', _laborName: sentetikYeni }],
      },
    });
    const okuS2 = await d.istek('a1', 'GET', `/labor-firms/price-lists/${listeS}/sheets`);
    const sSatiri = ((okuS2.veri?.sheet?.rowData ?? []) as any[]).filter((r) => r._laborPriceId === sS.id);
    check('K1c.13b FIXTURE: sentetik sayfada satir vardi ve yazilamadi',
      sentetikSayfa?.synthetic === true && ekranS.some((r) => r._laborPriceId === sS.id) && (sentetik1.veri?.errors ?? []).length === 1,
      `${okuS.durum} ${sentetik1.metin}`);
    check('K1c.13c Kayitli hali olmayan yazilamamis satir toplu kayitla da YENI adla yazilmaz: okumada DB adiyla (tek kez) gelir',
      sSatiri.length === 1 && sSatiri[0].ad === SENTETIK &&
        ((okuS2.veri?.sheet?.rowData ?? []) as any[]).some((r) => r.ad === sentetikYeni && r._laborPriceId),
      JSON.stringify(okuS2.veri?.sheet?.rowData));

    // Sayfasiz listede (bu kayitta sayfayi yazan save-sheets olmadi) toplu
    // kayit mevcut satirlari YUKTEN alir: sira ve sutunlar korunur.
    const SIRALI = 'Sırası korunan montajı';
    const listeP = await yukle(d, 'a1', a1, [[SIRALI, 60]]);
    const sP = d.db.tablo('LaborPrice').find((p) => p.priceListId === listeP)!;
    const siraliYeni = 'Sırası korunan yeni montajı';
    const sirali = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeP,
      items: [{ laborName: siraliYeni, unitPrice: 61, unit: 'adet' }],
      sheet: sayfa([{ id: sP.id, ad: SIRALI, fiyat: 60, ek: { not: 'ilk satir notu' } }, { ad: siraliYeni, fiyat: 61, ek: { _laborName: siraliYeni } }]),
    });
    const siraliYeniFiyat = fiyatSatiri(d, a1, siraliYeni);
    const siraliSayfa = (d.db.tablo('LaborPriceList').find((l) => l.id === listeP)?.sheets as any)?.rowData ?? [];
    check('K1c.13d Sayfasiz listede toplu kayit mevcut satiri yukten alir (sira + sutun korunur), yeni satira kimlik yazar',
      sirali.durum === 201 && JSON.stringify(sayfaKimlikleri(d, listeP)) === JSON.stringify([sP.id, siraliYeniFiyat?.id]) &&
        siraliSayfa.find((r: any) => r._laborPriceId === sP.id)?.not === 'ilk satir notu',
      `${sirali.durum} ${JSON.stringify(siraliSayfa)}`);

    // Ayni kimlik IKI satirda: yeni satir listedeki ayni adli kaleme baglanir
    // (var olan fiyat satiri guncellenir, kimligi yeni satira da yazilir).
    // Sonraki toplu kayit her satira KENDI kayitli halini verir.
    const ikizEkle = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeP,
      items: [{ laborName: SIRALI, unitPrice: 62, unit: 'adet' }],
      sheet: sayfa([
        { id: sP.id, ad: SIRALI, fiyat: 60, ek: { not: 'ilk satir notu' } },
        { id: siraliYeniFiyat?.id, ad: siraliYeni, fiyat: 61 },
        { ad: SIRALI, fiyat: 62, ek: { _laborName: SIRALI, not: 'ikiz satir notu' } },
      ]),
    });
    const ucuncu = 'Sırası korunan üçüncü montajı';
    const ikizSonra = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeP,
      items: [{ laborName: ucuncu, unitPrice: 63, unit: 'adet' }],
      sheet: sayfa([
        { id: sP.id, ad: SIRALI, fiyat: 62, ek: { not: 'ekrandaki not 1' } },
        { id: siraliYeniFiyat?.id, ad: siraliYeni, fiyat: 61 },
        { id: sP.id, ad: SIRALI, fiyat: 62, ek: { not: 'ekrandaki not 2' } },
        { ad: ucuncu, fiyat: 63, ek: { _laborName: ucuncu } },
      ]),
    });
    const ikizSayfa = ((d.db.tablo('LaborPriceList').find((l) => l.id === listeP)?.sheets as any)?.rowData ?? []) as any[];
    check('K1c.13e Ayni kimlikli iki satir: her biri KENDI kayitli halini alir (biri digerini ezmez, biri dusmez)',
      ikizEkle.durum === 201 && ikizSonra.durum === 201 &&
        JSON.stringify(ikizSayfa.filter((r) => r._laborPriceId === sP.id).map((r) => r.not)) ===
          JSON.stringify(['ilk satir notu', 'ikiz satir notu']) &&
        ikizSayfa.some((r) => r.ad === ucuncu && r._laborPriceId),
      `${ikizEkle.durum} ${ikizSonra.durum} ${JSON.stringify(ikizSayfa)}`);

    // Yukte kayitlidan FAZLA kopya (okuma ad eslesmesiyle ayni kimligi iki
    // satira verebilir) yalniz-yeni-satir kaydinda DUSMEZ: listenin satiri
    // yukten alinir (inceleme 3. tur INFO-1 — eskiden sessizce siliniyordu).
    const dorduncu = 'Sırası korunan dördüncü montajı';
    const fazlaKopya = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeP,
      items: [{ laborName: dorduncu, unitPrice: 64, unit: 'adet' }],
      sheet: sayfa([
        { id: sP.id, ad: SIRALI, fiyat: 62 },
        { id: siraliYeniFiyat?.id, ad: siraliYeni, fiyat: 61 },
        { id: sP.id, ad: SIRALI, fiyat: 62 },
        { id: fiyatSatiri(d, a1, ucuncu)?.id, ad: ucuncu, fiyat: 63 },
        { id: sP.id, ad: SIRALI, fiyat: 62, ek: { not: 'ucuncu kopya' } },
        { ad: dorduncu, fiyat: 64, ek: { _laborName: dorduncu } },
      ]),
    });
    const fazlaSayfa = ((d.db.tablo('LaborPriceList').find((l) => l.id === listeP)?.sheets as any)?.rowData ?? []) as any[];
    check('K1c.13j Yukte kayitlidan FAZLA kopyali kimlik (listenin satiri) DUSMEZ — fazlasi yukten, digerleri kayitli halinden',
      fazlaKopya.durum === 201 &&
        JSON.stringify(fazlaSayfa.filter((r) => r._laborPriceId === sP.id).map((r) => r.not ?? null)) ===
          JSON.stringify(['ilk satir notu', 'ikiz satir notu', 'ucuncu kopya']),
      `${fazlaKopya.durum} ${JSON.stringify(fazlaSayfa)}`);

    // Inceleme 3. tur (LOW-1): kayitli sayfada OLMAYAN eski satir (sayfasiz
    // eklenmis — okuma onu SONA ekler) yalniz-yeni-satir kaydinda yukten
    // alinir: BU listenin fiyat satiriysa yerinde kalir; baska kiracinin /
    // baska listenin / olmayan kimlik YAZILMAZ.
    const b1 = await iscilikFirmasiAc(d, 'b', 'Usta B1');
    const B_GIZLI = 'B kiracisinin gizli montajı';
    await yukle(d, 'b', b1, [[B_GIZLI, 777]]);
    const bFiyat = fiyatSatiri(d, b1, B_GIZLI)!;
    const SAYFA_DISI = 'Sayfa dışı eklenen montajı';
    await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeA1, items: [{ laborName: SAYFA_DISI, unitPrice: 35, unit: 'adet' }],
    });
    const sayfaDisi = fiyatSatiri(d, a1, SAYFA_DISI)!;
    const okuA1 = await d.istek('a1', 'GET', `/labor-firms/price-lists/${listeA1}/sheets`);
    const okuA1Satirlari = (okuA1.veri?.sheet?.rowData ?? []) as any[];
    const kayitliOnce = sayfaKimlikleri(d, listeA1);
    const N3 = 'Görünüm üçüncü yeni satır montajı';
    const disaridan = await d.istek('a1', 'POST', `/labor-firms/${a1}/save-bulk`, {
      priceListId: listeA1,
      items: [{ laborName: N3, unitPrice: 36, unit: 'adet' }],
      sheet: {
        ...sayfa([]),
        rowData: [
          ...okuA1Satirlari,
          { _rowIdx: 95, _isDataRow: true, _laborPriceId: bFiyat.id, ad: 'SAHTE B SATIRI', fiyat: 1 },
          { _rowIdx: 96, _isDataRow: true, _laborPriceId: ortakA2.id, ad: 'SAHTE A2 SATIRI', fiyat: 1 },
          { _rowIdx: 97, _isDataRow: true, _laborPriceId: 'yok-boyle-bir-kimlik', ad: 'SAHTE YOK SATIRI', fiyat: 1 },
          { _rowIdx: 98, _isDataRow: true, ad: N3, fiyat: 36, _laborName: N3 },
        ],
      },
    });
    const n3Fiyat = fiyatSatiri(d, a1, N3);
    const a1Sayfa = JSON.stringify((d.db.tablo('LaborPriceList').find((l) => l.id === listeA1)?.sheets as any)?.rowData);
    check('K1c.13f FIXTURE: sayfa disi satir kayitli sayfada YOK, okuma onu SONA ekledi',
      !kayitliOnce.includes(sayfaDisi.id) && okuA1Satirlari.filter((r) => r._isDataRow).slice(-1)[0]?._laborPriceId === sayfaDisi.id &&
        disaridan.durum === 201 && !!n3Fiyat,
      `${JSON.stringify(kayitliOnce)} ${disaridan.durum} ${disaridan.metin}`);
    // Okuma sayfa disi satirlarin HEPSINI (bu listede onceki adimlarin
    // kayitsiz satirlari da) sona ekler; kayit onlari o sirada tutar.
    const okumaSirasi = okuA1Satirlari.filter((r) => r._isDataRow).map((r) => r._laborPriceId);
    check('K1c.13g Listenin sayfa disi satirlari yalniz-yeni-satir kaydinda YERINDE kalir (yeni satirin altina dusmez)',
      okumaSirasi.length > kayitliOnce.length + 1 &&
        JSON.stringify(sayfaKimlikleri(d, listeA1)) === JSON.stringify([...okumaSirasi, n3Fiyat?.id]),
      `${JSON.stringify(okumaSirasi)} ${a1Sayfa}`);
    check('K1c.13h Baska kiracinin / baska listenin / olmayan kimlikli satir sayfaya YAZILMAZ (ad, kimlik, B\'nin kalem adi yok)',
      !a1Sayfa.includes(bFiyat.id) && !a1Sayfa.includes(ortakA2.id) && !a1Sayfa.includes('yok-boyle-bir-kimlik') &&
        !a1Sayfa.includes('SAHTE') && !a1Sayfa.includes(B_GIZLI),
      a1Sayfa);

    // W1 + baska kiracinin satiri: yazilamayan (404, olmayanla ayni) yabanci satir kayitli hali
    // olmadigi icin DB'den KURULMAZ — kurulsaydi B'nin kalem adi A'nin
    // sayfasina yazilirdi (okuma kendi listesinde bulamadigi kimligi oldugu
    // gibi gosterir).
    const w1Yabanci = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [{ laborPriceId: bFiyat.id, listPrice: 1 }],
      sheet: { ...sayfa([]), rowData: [...okuA1Satirlari, { _rowIdx: 94, _isDataRow: true, _laborPriceId: bFiyat.id, ad: 'SAHTE B W1', fiyat: 1 }] },
    });
    const a1SayfaW1 = JSON.stringify((d.db.tablo('LaborPriceList').find((l) => l.id === listeA1)?.sheets as any)?.rowData);
    check('K1c.13i W1: yazilamayan YABANCI satir (404) DB\'den kurulmaz — B\'nin kimligi/kalem adi A\'nin sayfasinda yok',
      w1Yabanci.durum === 201 && (w1Yabanci.veri?.errors ?? []).length === 1 &&
        !a1SayfaW1.includes(bFiyat.id) && !a1SayfaW1.includes(B_GIZLI) && !a1SayfaW1.includes('SAHTE') &&
        d.db.tablo('LaborPrice').find((p) => p.id === bFiyat.id)?.unitPrice === 777,
      `${w1Yabanci.metin} ${a1SayfaW1}`);

    // Beklenmeyen (HttpException DISI) hata: DB ayrintisi kullaniciya donmez.
    const gizli = 'Invalid `prisma.laborPrice.update()` invocation: ic ayrinti 7f3a';
    const gunlukBas = gunluk.length;
    bagTasimaHatasi(d, gorunumA1.id, new Error(gizli));
    const beklenmeyen = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [{ laborPriceId: gorunumA1.id, laborItemName: 'Görünüm üçüncü ad montajı', listPrice: 30 }],
    });
    bagTasimaHatasi(d, gorunumA1.id, new Error(gizli));
    const beklenmeyenToplu = await d.istek('a1', 'POST', '/labor-firms/price-items/bulk-update', {
      items: [{ id: gorunumA1.id, laborItemName: 'Görünüm dördüncü ad montajı' }],
    });
    const satirHatasi = (y: Yanit) => String(y.veri?.errors?.[0]?.error ?? '');
    check('K1c.14 Beklenmeyen hata metni (DB ayrintisi) yanitta YOK — genel metin; ayrinti sunucu gunlugunde (save-sheets + bulk-update)',
      beklenmeyen.durum === 201 && beklenmeyenToplu.durum === 201 &&
        (beklenmeyen.veri?.errors ?? []).length === 1 && (beklenmeyenToplu.veri?.errors ?? []).length === 1 &&
        !beklenmeyen.metin.includes('ic ayrinti') && !beklenmeyenToplu.metin.includes('ic ayrinti') &&
        !beklenmeyen.metin.includes('prisma') && satirHatasi(beklenmeyen).includes('kaydedilemedi') &&
        satirHatasi(beklenmeyenToplu) === satirHatasi(beklenmeyen) &&
        gunluk.slice(gunlukBas).filter((l) => l.includes('ic ayrinti 7f3a')).length === 2,
      `${beklenmeyen.metin} | ${beklenmeyenToplu.metin} | ${gunluk.slice(gunlukBas).join(' / ')}`);

    // Guvenlik incelemesi 3. tur (LOW): satir basina ERROR + yigin, sinirsiz
    // satir sayisiyla gunlugu sisirebiliyordu → istek basina TEK satir (sayi +
    // ilk 3 ornek + ilk yigin), JSON — mesajdaki satir sonu gunlugu bolemez.
    const GUNLUK_ADLARI = ['Günlük bir montajı', 'Günlük iki montajı', 'Günlük üç montajı', 'Günlük dört montajı'];
    const listeG = await yukle(d, 'a1', a1, GUNLUK_ADLARI.map((ad, i): [string, number] => [ad, 10 + i]));
    await yukle(d, 'a1', a2, GUNLUK_ADLARI.map((ad, i): [string, number] => [ad, 20 + i]));
    const gSatirlari = GUNLUK_ADLARI.map((ad) => d.db.tablo('LaborPrice').find((p) => p.priceListId === listeG && kalemRow(d, p.laborItemId)?.name === ad)!);
    const gIdleri = gSatirlari.map((s) => s.id as string);
    // 1. ornek satir sonu tasir, 2. ornek UZUN (Prisma dogrulama hatasi istek
    // degerlerini metne katar) — ornek mesaj 500 karakterde kirpilir.
    bagTasimaHatasi(d, gIdleri, (id) => new Error(
      id === gIdleri[0] ? `ic ayrinti <<${id}>>\nSAHTE GUNLUK SATIRI`
        : id === gIdleri[1] ? `ic ayrinti <<${id}>> ${'x'.repeat(5000)}` : `ic ayrinti <<${id}>>`));
    const gunlukBas2 = gunluk.length;
    const dortHata = await d.istek('a1', 'POST', '/labor-firms/price-items/bulk-update', {
      items: gIdleri.map((id, i) => ({ id, laborItemName: `Günlük yeni ${i} montajı` })),
    });
    const dortSatir = gunluk.slice(gunlukBas2).filter((l) => l.includes('ic ayrinti'));
    const tekSatir = dortSatir[0] ?? '';
    check('K1c.14b Dort beklenmeyen satir hatasi = TEK gunluk satiri: sayi 4, ilk 3 ornek, 4. yok, tek satir (\\n kacisli), yigin var',
      dortHata.durum === 201 && (dortHata.veri?.errors ?? []).length === 4 &&
        (dortHata.veri?.errors ?? []).every((e: any) => String(e.error).includes('kaydedilemedi')) &&
        dortSatir.length === 1 && tekSatir.includes('bulk-update: 4 ') &&
        gIdleri.slice(0, 3).every((id) => tekSatir.includes(`<<${id}>>`)) && !tekSatir.includes(`<<${gIdleri[3]}>>`) &&
        !tekSatir.includes('\n') && tekSatir.includes('\\nSAHTE') && tekSatir.includes('labor-firms.service') &&
        tekSatir.includes('x'.repeat(400)) && !tekSatir.includes('x'.repeat(501)),
      `${dortHata.metin} | ${JSON.stringify(dortSatir).slice(0, 2000)}`);

    // Inceleme 3. tur (LOW-3): kimligi bicimsiz satir DB'ye gitmeden reddedilir
    // (gercek Prisma'da dogrulama hatasi = beklenmeyen hata + gunluk satiri).
    const izBas = d.db.izler.length;
    const gunlukBas3 = gunluk.length;
    const bicimsiz = await d.istek('a1', 'POST', '/labor-firms/price-items/bulk-update', {
      items: [{ id: 7, unitPrice: 1 }, { id: null }, { id: { x: 1 } }, { id: 'x'.repeat(65) }],
    });
    const bicimsizIzgara = await d.istek('a1', 'POST', `/labor-firms/price-lists/${listeA1}/save-sheets`, {
      dirtyRows: [{ laborPriceId: 7, listPrice: 1 }, { laborPriceId: ['a\nb'], listPrice: 1 }],
    });
    const fiyatSorgusu = d.db.izler.slice(izBas).filter((i) => i.model === 'LaborPrice').length;
    check('K1c.14c Bicimsiz satir kimligi DB\'ye gitmeden reddedilir (her satir "Geçersiz satır kimliği", gunluk yok)',
      bicimsiz.durum === 201 && bicimsizIzgara.durum === 201 &&
        (bicimsiz.veri?.errors ?? []).length === 4 && (bicimsizIzgara.veri?.errors ?? []).length === 2 &&
        [...(bicimsiz.veri?.errors ?? []), ...(bicimsizIzgara.veri?.errors ?? [])].every((e: any) => e.error === 'Geçersiz satır kimliği.') &&
        fiyatSorgusu === 0 && gunluk.length === gunlukBas3,
      `${bicimsiz.metin} | ${bicimsizIzgara.metin} | fiyat sorgusu=${fiyatSorgusu} | ${gunluk.slice(gunlukBas3).join(' / ')}`);

    // Joker: yeni ad `%` tasiyorsa ILIKE ile BASKA kaleme baglanmamali. A2'nin
    // satiri — HEDEF adli kalemlerin A2 listesinde satiri yok, yani kacis
    // olmasaydi aday olurlardi (A1 listesinde ayni-liste suzgeci gizlerdi).
    const jokerA2 = fiyatSatiri(d, a2, JOKER_KALEM)!;
    const joker = await d.istek('a1', 'PUT', `/labor-firms/price-items/${jokerA2.id}`, { laborItemName: 'Hedef%' });
    const jokerSonra = d.db.tablo('LaborPrice').find((p) => p.id === jokerA2.id);
    check('K1c.9 Jokerli yeni ad (`Hedef%`) baska kaleme BAGLANMAZ — kendi yeni kalemi acilir',
      joker.durum === 200 && kalemRow(d, jokerSonra?.laborItemId)?.name === 'Hedef%' &&
        kalemRow(d, jokerSonra?.laborItemId)?.ownerFirmaId === 'firma-a',
      `${joker.durum} ${joker.metin} ${kalemRow(d, jokerSonra?.laborItemId)?.name}`);

    // Harf degisikligi + o yazimi BIREBIR tasiyan baska kalem varsa satir ONA
    // baglanir (ikinci bir kopya acilmaz). Uc satir ayni kalemde: biri yeni
    // yazimla kendi kalemine gecer; ikincisi ayni yazima donunce o kaleme baglanir.
    const listeK1 = await yukle(d, 'a1', a1, [['kanal montaji test', 1]]);
    await yukle(d, 'a1', a2, [['kanal montaji test', 2]]);
    const listeK2 = await yukle(d, 'a1', a1, [['kanal montaji test', 3]]);
    const satirIdsi = (liste: string) => d.db.tablo('LaborPrice').find((p) => p.priceListId === liste)!;
    const r1 = satirIdsi(listeK1);
    const r3 = satirIdsi(listeK2);
    const ortakKanal = r1.laborItemId;
    const p3 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${r3.id}`, { laborItemName: 'Kanal Montaji Test' });
    const p1 = await d.istek('a1', 'PUT', `/labor-firms/price-items/${r1.id}`, { laborItemName: 'Kanal Montaji Test' });
    const r1Sonra = d.db.tablo('LaborPrice').find((p) => p.id === r1.id);
    const r3Sonra = d.db.tablo('LaborPrice').find((p) => p.id === r3.id);
    // L1 (inceleme): PAYLASILAN kalemin satirinda yalniz harf degisir ve ayni
    // adin BASKA bir yazimi ayri kalemde dururken satir o kaleme KAYMAZ —
    // kullanicinin yazdigi yazimla kendi kalemi acilir.
    const listeT1 = await yukle(d, 'a1', a1, [['tava montaji test', 1]]);
    await yukle(d, 'a1', a2, [['tava montaji test', 2]]);
    const listeT2 = await yukle(d, 'a1', a1, [['tava montaji test', 3]]);
    const tP = satirIdsi(listeT1);
    const tQ = satirIdsi(listeT2);
    const tq = await d.istek('a1', 'PUT', `/labor-firms/price-items/${tQ.id}`, { laborItemName: 'TAVA MONTAJI TEST' });
    const tp = await d.istek('a1', 'PUT', `/labor-firms/price-items/${tP.id}`, { laborItemName: 'Tava Montaji Test' });
    const tPSonra = d.db.tablo('LaborPrice').find((p) => p.id === tP.id);
    check('K1c.11 Paylasilan kalemde harf degisikligi, adin BASKA yazimli kalemine kaymaz (yazim korunur)',
      tq.durum === 200 && tp.durum === 200 && kalemRow(d, tPSonra?.laborItemId)?.name === 'Tava Montaji Test',
      `${tq.durum} ${tp.durum} ${kalemRow(d, tPSonra?.laborItemId)?.name}`);
    check('K1c.10 Harf degisikliginde o yazimi BIREBIR tasiyan kalem varsa ona baglanir (kopya kalem acilmaz)',
      p3.durum === 200 && p1.durum === 200 && r1Sonra?.laborItemId === r3Sonra?.laborItemId &&
        r1Sonra?.laborItemId !== ortakKanal && kalemAdiyla(d, 'Kanal Montaji Test').length === 1,
      JSON.stringify({ p3: p3.durum, p1: p1.durum, r1: r1Sonra?.laborItemId, r3: r3Sonra?.laborItemId, kopya: kalemAdiyla(d, 'Kanal Montaji Test').length }));
  } finally {
    await d.app.close();
  }
}

// ═══ KC — W2: katalog kalemi yonetici yazisinda indekslenir ═══════════════
async function kcBlogu(): Promise<void> {
  console.log('\n── KC katalog indeksi (yönetici ekleme · düzenleme · yeniden indeksleme) ──');
  const d = await dunyaKur();
  try {
    const eklenen = await katalogKalemi(d, 'Katalog indeks testi DN40', 45);
    const k = kalemRow(d, eklenen);
    check('KC.1 Yonetici ekledigi katalog kalemi GUNCEL surumle indekslenir',
      k?.indexVersion === INDEX_VERSION && !!k?.adSlug && k?.displayName === 'Katalog indeks testi DN40',
      JSON.stringify({ v: k?.indexVersion, slug: k?.adSlug, ad: k?.displayName }));

    // Eski (kiracinin bir zamanlar tazeledigi) katalog kalemi: GUNCEL surumde ESKI adin indeksi.
    const matching = d.app.get(MatchingService);
    const eski = await katalogKalemi(d, 'Küresel vana montajı DN25', 50);
    await d.db.istemci.laborItem.update({ where: { id: eski }, data: matching.laborItemIndexData('Küresel vana montajı DN25', 'adet') });
    const put = await d.istek('y', 'PUT', `/labor/${eski}`, { name: 'Küresel vana montajı DN32', unit: 'adet' });
    const yeni = kalemRow(d, eski);
    const beklenen = matching.laborItemIndexData('Küresel vana montajı DN32', 'adet');
    check('KC.2 Yonetici adi degistirince katalog kalemi YENI adla indekslenir (bayat indeks kalmaz)',
      put.durum === 200 && yeni?.displayName === 'Küresel vana montajı DN32' && yeni?.adBucket === beklenen.adBucket &&
        JSON.stringify(yeni?.capTags) === JSON.stringify(beklenen.capTags),
      JSON.stringify({ d: put.durum, ad: yeni?.displayName, b: yeni?.adBucket, c: yeni?.capTags }));
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    await yukle(d, 'a1', a1, [['Küresel vana montajı DN32', 60, 'adet']]);
    const es = await eslestir(d, 'a1', a1, 'KÜRESEL VANA DN32', 'adet');
    check('KC.3 BAGLANTI: kiraci yeni katalog adiyla kendi fiyatini bulur (60)', es?.netPrice === 60, JSON.stringify(es));

    // Surum artisi sonrasi: katalog kalemini yalniz YONETICI yeniden indeksler.
    // `eski` kiracinin fiyatina BAGLI ve indeksli-bayat olur (KC.8).
    await d.db.istemci.laborItem.update({ where: { id: eklenen }, data: { indexVersion: 0 } });
    await d.db.istemci.laborItem.update({ where: { id: eski }, data: { indexVersion: 0 } });
    const kiraciKalemi = fiyatSatiri(d, a1, 'Küresel vana montajı DN32')?.laborItemId;
    await yukle(d, 'a1', a1, [['Kiracinin kendi kalemi DN15', 5]]);
    const kendi = fiyatSatiri(d, a1, 'Kiracinin kendi kalemi DN15')!.laborItemId;
    await d.db.istemci.laborItem.update({ where: { id: kendi }, data: { indexVersion: 0 } });
    const kiraciReindex = await d.istek('a1', 'POST', '/labor/yeniden-indeksle');
    check('KC.4 Kiraci katalog yeniden indekslemesini tetikleyemez (403)', kiraciReindex.durum === 403, `${kiraciReindex.durum}`);
    const r = await d.istek('y', 'POST', '/labor/yeniden-indeksle');
    check('KC.5 Yonetici katalogu yeniden indeksler (bayat kalem guncel surumde)',
      r.durum === 201 && kalemRow(d, eklenen)?.indexVersion === INDEX_VERSION, `${r.durum} ${r.metin} v=${kalemRow(d, eklenen)?.indexVersion}`);
    check('KC.6 OLCUT: kiraci yuklemesi katalog kalemine baglandi (yeni kalem acmadi)',
      kiraciKalemi === eski, JSON.stringify({ kiraciKalemi, eski }));
    check('KC.7 Yonetici katalog yeniden indekslemesi KIRACI kalemine yazmaz',
      kalemRow(d, kendi)?.indexVersion === 0, JSON.stringify({ v: kalemRow(d, kendi)?.indexVersion }));
    // Indeksli-BAYAT kalem (surum artisi sonrasi) motorda istek aninda AD'dan
    // degil SUTUNLARDAN (capRaw) yeniden indekslenir: adinda cap tasiyan iscilik
    // kaleminin capi duser, eslesmez — motor bulgusu, master'da da ayni
    // (`hazirlaLaborPool` bayat dali; 01.10 olculdu, P2'ye bildirildi). Kiraci
    // yuklemesi artik katalog kalemini tazelemedigi (C2) icin tazeleme yolu
    // yonetici yeniden indekslemesidir: sonrasinda kiracinin fiyati eslesir.
    const esSonra = await eslestir(d, 'a1', a1, 'KÜRESEL VANA DN32', 'adet');
    check('KC.8 BAGLANTI: surum artisindan sonra yonetici yeniden indekslemesi katalog kalemli kiraci fiyatini yine eslestirir (60)',
      kalemRow(d, eski)?.indexVersion === INDEX_VERSION && esSonra?.netPrice === 60,
      JSON.stringify({ v: kalemRow(d, eski)?.indexVersion, es: esSonra }));
  } finally {
    await d.app.close();
  }
}

// ═══ K4 — C4: ortak sozluk kaydini yalniz yonetici kapatir ═══════════════
async function k4Blogu(): Promise<void> {
  console.log('\n── K4 (C4) ortak sözlük kaydı ──');
  const d = await dunyaKur();
  try {
    const seed = d.db.tablo('TerminologyAlias').find((t) => t.userId === null && t.createdBy === 'seed');
    check('K4.0 FIXTURE: onModuleInit seed\'i yazdi', !!seed && seed.active === true, JSON.stringify(seed ?? null));
    const ogrenilmis = await d.db.istemci.terminologyAlias.create({
      data: { userId: null, alias: 'zetaflex omegatron', canonical: 'Zetaflex Omegatron', createdBy: 'learned' },
    });

    const r1 = await d.istek('a1', 'DELETE', `/matching/aliases/${seed?.id}`);
    const seedSonra = d.db.tablo('TerminologyAlias').find((t) => t.id === seed?.id);
    check('K4.1 Uye ORTAK seed kaydini kapatamaz (ok:false, kayit AKTIF)',
      r1.veri?.ok === false && seedSonra?.active === true, `${r1.durum} ${r1.metin} aktif=${seedSonra?.active}`);
    const r2 = await d.istek('a1', 'DELETE', `/matching/aliases/${ogrenilmis.id}`);
    const ogrSonra = d.db.tablo('TerminologyAlias').find((t) => t.id === ogrenilmis.id);
    check('K4.2 Uye ORTAK ogrenilmis kaydi kapatamaz', r2.veri?.ok === false && ogrSonra?.active === true,
      `${r2.durum} ${r2.metin} aktif=${ogrSonra?.active}`);

    const r3 = await d.istek('y', 'DELETE', `/matching/aliases/${seed?.id}`);
    check('K4.3 Yonetici ortak seed kaydini kapatir (davranis korundu)',
      r3.veri?.deactivated === true && d.db.tablo('TerminologyAlias').find((t) => t.id === seed?.id)?.active === false,
      `${r3.durum} ${r3.metin}`);

    const kaydet = await d.istek('a1', 'POST', '/matching/aliases', { alias: 'ozel terim kisa', canonical: 'kullanici_tanimli' });
    const kendi = d.db.tablo('TerminologyAlias').find((t) => t.userId === 'kisi-a1' && t.alias === 'ozel terim kisa');
    check('K4.4 FIXTURE: uye kendi kaydini yazdi', kaydet.durum === 201 && !!kendi, `${kaydet.durum} ${kaydet.metin}`);
    const r5 = await d.istek('a2', 'DELETE', `/matching/aliases/${kendi?.id}`);
    check('K4.5 Ayni firmanin baska uyesi o kaydi silemez (yetki yok)',
      r5.veri?.ok === false && !!d.db.tablo('TerminologyAlias').find((t) => t.id === kendi?.id), `${r5.durum} ${r5.metin}`);
    const r4 = await d.istek('a1', 'DELETE', `/matching/aliases/${kendi?.id}`);
    check('K4.6 Uye KENDI kaydini siler (davranis korundu)',
      r4.veri?.deleted === true && !d.db.tablo('TerminologyAlias').some((t) => t.id === kendi?.id), `${r4.durum} ${r4.metin}`);
  } finally {
    await d.app.close();
  }
}

// ═══ K5 — C5: yeniden indeksleme sahipli urunu ORTAK sozluge ogretmez ═════
async function k5Blogu(): Promise<void> {
  console.log('\n── K5 (C5) yönetici yeniden indekslemesi ──');
  const d = await dunyaKur();
  try {
    const p = d.db.istemci;
    const marka = await p.brand.create({ data: { name: 'Marka-K5' } });
    const temel = { brandId: marka.id, price: 10, adSlug: 'eski', displayName: 'x', indexVersion: 0, belirsiz: false };
    await p.productIndex.create({ data: { ...temel, ad: 'Zetaflex Omegatron', adBucket: 'eski', rowKey: 'r-havuz' } });
    await p.productIndex.create({
      data: { ...temel, ad: 'Gizliflex Kappatron', adBucket: 'eski', rowKey: 'r-sahipli', ownerUserId: 'kisi-a1', ownerFirmaId: 'firma-a' },
    });
    const admin = new AdminService(p, {} as any, d.app.get(TerminologyService), {} as any, {} as any);
    await admin.reindexProducts();

    const havuz = normalizeText('Zetaflex Omegatron');
    const gizli = normalizeText('Gizliflex Kappatron');
    const ortak = d.db.tablo('TerminologyAlias').filter((t) => t.userId === null);
    check('K5.1 BAGLANTI: havuz urununun ailesi ORTAK sozluge ogrenildi (davranis korundu)',
      ortak.some((t) => t.alias === havuz && t.createdBy === 'learned'), JSON.stringify(ortak.filter((t) => t.createdBy === 'learned')));
    check('K5.2 Kiraciya ait urunun ailesi ORTAK sozluge ogrenilMEDI',
      !ortak.some((t) => t.alias === gizli), JSON.stringify(ortak.filter((t) => t.alias === gizli)));
    const sahibinin = d.db.tablo('TerminologyAlias').filter((t) => t.userId === 'kisi-a1' && t.alias === gizli);
    check('K5.3 Kiraci urununun ailesi SAHIBININ sozlugune ogrenildi (kutuphane=hafiza, kisi kapsami)',
      sahibinin.length === 1 && sahibinin[0].createdBy === 'learned', JSON.stringify(sahibinin));
    const bListe = await d.istek('b', 'GET', '/matching/aliases');
    check('K5.4 B, A\'nin urun ailesini GET /matching/aliases ile OKUYAMAZ',
      bListe.durum === 200 && Array.isArray(bListe.veri) && !bListe.veri.some((t: any) => t.alias === gizli || t.canonical === 'Gizliflex Kappatron'),
      `${bListe.durum} ${JSON.stringify((bListe.veri ?? []).filter?.((t: any) => t.alias === gizli))}`);
  } finally {
    await d.app.close();
  }
}

// ═══ KB — kiracinin yeniden indekslemesi ortak kaleme yazmaz ═════════════
async function kbBlogu(): Promise<void> {
  console.log('\n── KB kiracı yeniden indekslemesi (POST /labor-matching/reindex) ──');
  const d = await dunyaKur();
  try {
    const katalogId = await katalogKalemi(d, KATALOG_AD, 50);
    // KB.4 "istek aninda eslesir" iddiasi INDEKSSIZ (canlidaki W2 oncesi)
    // katalog kalemiyle olculur — W2'den beri yonetici eklemesi indeksli.
    await bayatKatalog(d, katalogId);
    const a1 = await iscilikFirmasiAc(d, 'a1', 'Usta A1');
    const b1 = await iscilikFirmasiAc(d, 'b', 'Usta B1');
    await yukle(d, 'a1', a1, [[ORTAK_AD, 100, 'mt']]);
    await yukle(d, 'b', b1, [[KATALOG_AD, 70, 'mt'], [ORTAK_AD, 120, 'mt'], [B_OZEL, 888]]);
    const aKalem = fiyatSatiri(d, a1, ORTAK_AD)!.laborItemId;
    const bKalem = fiyatSatiri(d, b1, B_OZEL)!.laborItemId;
    await d.db.istemci.laborItem.update({ where: { id: bKalem }, data: { indexVersion: 0, adSlug: null } });

    const bas = d.db.izler.length;
    const r = await d.istek('b', 'POST', '/labor-matching/reindex');
    check('KB.0 FIXTURE: B\'nin yeniden indekslemesi basarili', r.durum === 201, `${r.durum} ${r.metin}`);
    check('KB.1 B\'nin yeniden indekslemesi KATALOG kalemine yazmaz', kalemeYazanlar(d, katalogId, bas).length === 0,
      kalemeYazanlar(d, katalogId, bas).join(' | '));
    check('KB.2 B\'nin yeniden indekslemesi A\'nin kalemine yazmaz', kalemeYazanlar(d, aKalem, bas).length === 0,
      kalemeYazanlar(d, aKalem, bas).join(' | '));
    check('KB.3 BAGLANTI: B\'nin KENDI bayat kalemi yeniden indekslendi', (kalemRow(d, bKalem)?.indexVersion ?? 0) > 0 &&
      !!kalemRow(d, bKalem)?.adSlug, JSON.stringify({ v: kalemRow(d, bKalem)?.indexVersion, slug: kalemRow(d, bKalem)?.adSlug }));
    const esB = await eslestir(d, 'b', b1, 'SİYAH ÇELİK BORU - DN50', 'mt');
    check('KB.4 BAGLANTI: katalog kalemi yeniden indekslenmeden de eslesir (istek aninda, B fiyati 70)',
      esB?.netPrice === 70, JSON.stringify(esB));
  } finally {
    await d.app.close();
  }
}

// ═══ KM — bellek-Prisma'nin ILIKE modeli GERCEK PG olcumuyle ayni ═════════
// 01.10.2026: joker/kacis sonuclari Prisma 5.22 + PostgreSQL 17 (gecici yerel
// kume; LIKE tanimi surum ve yerel ayardan bagimsiz) — ayni alti ad, ayni
// sorgular. HARF KATLAMASI yerel ayara bagli: `İ`/`ı` satirlari CANLI
// PG 16.14 (glibc en_US.utf8) olcumunden (`lower('İ')`='i', ı katlanmaz).
// Model bu tablodan sapARSA kiraci sinirinin joker testleri yanlis yesil verirdi.
async function kmBlogu(): Promise<void> {
  console.log('\n── KM bellek-Prisma ILIKE ↔ PG ölçümü ──');
  const db = bellekPrisma();
  const adlar = ['OLCUM Abc', 'OLCUM A_c', 'OLCUM A%c', 'OLCUM İSTANBUL VANA', 'OLCUM Istanbul Vana', 'OLCUM x\\y'];
  for (const name of adlar) await db.istemci.laborItem.create({ data: { name, unitPrice: 1, discipline: 'mechanical' } });
  const bul = async (deger: string): Promise<string[] | string> => {
    try {
      const r = await db.istemci.laborItem.findMany({
        where: { name: { equals: deger, mode: 'insensitive' } }, select: { name: true }, orderBy: { name: 'asc' },
      });
      return r.map((x: any) => x.name);
    } catch (e: any) {
      return String(e?.message ?? e).includes('22025') ? 'HATA-22025' : `HATA: ${e?.message}`;
    }
  };
  const kacis = (s: string) => s.replace(/[\\%_]/g, '\\$&');
  // PG'de olculen sonuclar (siralama kod noktasina gore: '%' < '_' < 'b').
  const PG: Array<[string, string[] | string]> = [
    ['OLCUM abc', ['OLCUM Abc']],
    ['OLCUM a%', ['OLCUM A%c', 'OLCUM A_c', 'OLCUM Abc']],
    ['OLCUM a_c', ['OLCUM A%c', 'OLCUM A_c', 'OLCUM Abc']],
    // CANLI (glibc): İ→i katlanir — iki yazim da eslesir; noktasiz ı I ile eslesmez.
    ['OLCUM istanbul vana', ['OLCUM Istanbul Vana', 'OLCUM İSTANBUL VANA']],
    ['OLCUM İSTANBUL VANA', ['OLCUM Istanbul Vana', 'OLCUM İSTANBUL VANA']],
    ['OLCUM ıstanbul vana', []],
    ['OLCUM x\\y', []],
    ['OLCUM x\\', 'HATA-22025'],
    [kacis('OLCUM a%c'), ['OLCUM A%c']],
    [kacis('OLCUM a_c'), ['OLCUM A_c']],
    [kacis('OLCUM a%'), []],
    [kacis('OLCUM x\\y'), ['OLCUM x\\y']],
    [kacis('OLCUM x\\'), []],
    [kacis('OLCUM ABC'), ['OLCUM Abc']],
  ];
  const sapan: string[] = [];
  for (const [deger, beklenen] of PG) {
    const g = await bul(deger);
    if (JSON.stringify(g) !== JSON.stringify(beklenen)) sapan.push(`${deger}: ${JSON.stringify(g)} ≠ ${JSON.stringify(beklenen)}`);
  }
  check(`KM.1 ${PG.length} sorgunun ${PG.length}'i PG olcumuyle AYNI (joker · tek harf · kacis · sonda ters bolu · İ)`,
    sapan.length === 0, sapan.join(' | '));
  const tum = await bul('OLCUM %');
  check('KM.2 `%` tum adlari esler (ILIKE gercekten modellendi — duz esitlik degil)',
    Array.isArray(tum) && tum.length === adlar.length, JSON.stringify(tum));
}

// ═══ K0 — kapsam kurali firmasiz kimlikte KAPALI kalir (fail-closed) ══════
function k0Blogu(): void {
  console.log('\n── K0 kapsam kuralı: firmasız kimlik ──');
  const firlatir = (f: () => unknown): boolean => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  // `firmaId` undefined → `{ ownerFirmaId: undefined }` Prisma'da DUSER ve
  // `OR: [{}, ...]` HER satiri dondururdu; bos dize de ayni kapidan gecmez.
  const hepsiFirlatir = [{ userId: 'kisi-x' }, { userId: 'kisi-x', firmaId: '' }].every((firmasiz: any) =>
    firlatir(() => kiraciKapsaminda(firmasiz)) && firlatir(() => kiracininKalemleri(firmasiz)) &&
      firlatir(() => kiraciKalemiAlanlari(firmasiz)));
  check('K0.1 Firmasiz kimlikte (undefined ya da bos) kapsam kosulu URETILMEZ — FIRLATIR', hepsiFirlatir);
  check('K0.2 OLCUT: firmali kimlikte kosul uretilir ve sahipsiz satiri da kapsar',
    JSON.stringify(kiraciKapsaminda({ userId: 'u', firmaId: 'f' })).includes('"ownerFirmaId":null') &&
      JSON.stringify(kiracininKalemleri({ userId: 'u', firmaId: 'f' })).includes('"ownerFirmaId":"f"'));
}

// ═══ KV — P1 takibi (02.10.2026): baska kiracinin kaydi OLMAYANLA AYNI yanit ══
// Eskiden firma / liste / fiyat satiri icin "bulunamadi" (404) ile "erisim
// yetkiniz yok" (403) ayriydi: B, A'nin kimligini bilirse kaydin VARLIGINI
// okurdu (toplu kayitta ve izgara kaydinda satir basina ayni fark; eslestirme
// ucunda 403 ile bos yanit). Olcut: B'nin A kaydina istegi ile OLMAYAN kimlige
// istegi BIREBIR ayni durum + govde; yazma denemeleri A'nin verisini degistirmez.
async function kvBlogu(): Promise<void> {
  console.log('\n── KV (P1 takibi) başka kiracının kaydı olmayanla aynı yanıtı alır ──');
  const d = await dunyaKur();
  try {
    const aF = await iscilikFirmasiAc(d, 'a1', 'Usta A');
    const aL = await yukle(d, 'a1', aF, [[A_OZEL, 777]]);
    const aP = fiyatSatiri(d, aF, A_OZEL)!.id as string;
    const bF = await iscilikFirmasiAc(d, 'b', 'Usta B');
    const bL = await yukle(d, 'b', bF, [[B_OZEL, 555]]);
    const YOK = { firma: `${aF}-yok`, liste: `${aL}-yok`, kalem: `${aP}-yok` };

    const A_SATIR = 'KÜRESEL VANA DN65'; // A'nin kalemiyle eslesen teklif satiri
    const aFirma = await d.istek('a1', 'GET', `/labor-firms/${aF}`);
    const aListe = await d.istek('a1', 'GET', `/labor-firms/price-lists/${aL}/items`);
    const aEsle = await eslestir(d, 'a1', aF, A_SATIR);
    check('KV.0 FIXTURE: A kendi firmasini/listesini okur ve satiri 777 ile eslestirir (B\'nin yaniti kaydin YOKLUGUNDAN degil; kapi acilsa 777 gorunurdu)',
      aFirma.durum === 200 && aListe.durum === 200 && aListe.metin.includes(A_OZEL) && aEsle?.netPrice === 777,
      `${aFirma.durum} ${aListe.durum} ${JSON.stringify(aEsle)}`);
    const izBas = d.db.izler.length; // bundan sonrasi B'nin istekleri (KV.17 sorgu kapsami)

    const ayni = async (ad: string, yontem: string, yol: (id: string) => string, gercek: string, yok: string, govde?: unknown) => {
      const r1 = await d.istek('b', yontem, yol(gercek), govde);
      const r2 = await d.istek('b', yontem, yol(yok), govde);
      check(`${ad} ${yontem} ${yol(':id')}: A'nin kaydi ile OLMAYAN kimlik AYNI yanit (404, ayni govde)`,
        r1.durum === 404 && r1.durum === r2.durum && r1.metin === r2.metin,
        `A: ${r1.durum} ${r1.metin} | yok: ${r2.durum} ${r2.metin}`);
    };
    await ayni('KV.1', 'GET', (id) => `/labor-firms/${id}`, aF, YOK.firma);
    await ayni('KV.2', 'GET', (id) => `/labor-firms/${id}/price-lists`, aF, YOK.firma);
    await ayni('KV.3', 'PUT', (id) => `/labor-firms/${id}`, aF, YOK.firma, { name: 'Ele gecirildi' });
    await ayni('KV.4', 'POST', (id) => `/labor-firms/${id}/price-lists`, aF, YOK.firma, { name: 'Sizma listesi' });
    await ayni('KV.5', 'GET', (id) => `/labor-firms/price-lists/${id}/items`, aL, YOK.liste);
    await ayni('KV.6', 'GET', (id) => `/labor-firms/price-lists/${id}/sheets`, aL, YOK.liste);
    await ayni('KV.7', 'PUT', (id) => `/labor-firms/price-items/${id}`, aP, YOK.kalem, { unitPrice: 1 });

    const toplu = await d.istek('b', 'POST', '/labor-firms/price-items/bulk-update', {
      items: [{ id: aP, unitPrice: 1 }, { id: YOK.kalem, unitPrice: 1 }],
    });
    const [tA, tYok] = (toplu.veri?.errors ?? []) as Array<{ id: string; error: string }>;
    check('KV.11 toplu kayit (bulk-update): A\'nin satiri ile OLMAYAN satir AYNI satir hatasi ("Kalem bulunamadi")',
      toplu.durum < 300 && toplu.veri?.updated === 0 && tA?.id === aP && tYok?.id === YOK.kalem &&
        tA.error === 'Kalem bulunamadi' && tYok.error === 'Kalem bulunamadi',
      toplu.metin);
    const izgara = await d.istek('b', 'POST', `/labor-firms/price-lists/${bL}/save-sheets`, {
      dirtyRows: [{ laborPriceId: aP, listPrice: 1 }, { laborPriceId: YOK.kalem, listPrice: 1 }],
    });
    const [iA, iYok] = (izgara.veri?.errors ?? []) as Array<{ id: string; error: string }>;
    check('KV.12 izgara kaydi (save-sheets, B\'nin KENDI listesi): A\'nin satiri ile OLMAYAN satir AYNI satir hatasi ("Kalem bulunamadi")',
      izgara.durum < 300 && iA?.id === aP && iYok?.id === YOK.kalem &&
        iA.error === 'Kalem bulunamadi' && iYok.error === 'Kalem bulunamadi',
      izgara.metin);

    const esle = (firmaId: string) => d.istek('b', 'POST', '/labor-matching/bulk-match', {
      firmaId, laborNames: [A_SATIR], units: { [A_SATIR]: 'adet' },
    });
    const eA = await esle(aF);
    const eYok = await esle(YOK.firma);
    check('KV.13 eslestirme: A\'nin iscilik firmasi ile OLMAYAN firma AYNI yanit (bos; A\'nin fiyati yanitta yok)',
      eA.durum === eYok.durum && eA.metin === eYok.metin && JSON.stringify(eA.veri) === '{}' && !eA.metin.includes('777'),
      `A: ${eA.durum} ${eA.metin} | yok: ${eYok.durum} ${eYok.metin}`);
    const hatirla = (firmaId: string) => d.istek('b', 'POST', '/labor-matching/remember', {
      firmaId, laborName: A_OZEL, secilenAd: A_OZEL,
    });
    const hA = await hatirla(aF);
    const hYok = await hatirla(YOK.firma);
    check('KV.14 eslestirme hafizasi: A\'nin firmasi ile OLMAYAN firma AYNI yanit ({ ok: false })',
      hA.durum === hYok.durum && hA.metin === hYok.metin && hA.veri?.ok === false,
      `A: ${hA.durum} ${hA.metin} | yok: ${hYok.durum} ${hYok.metin}`);

    // save-bulk: B'nin KENDI iscilik firmasina A'nin LISTESI hedef verilir.
    const topluYukle = (priceListId: string) => d.istek('b', 'POST', `/labor-firms/${bF}/save-bulk`, {
      priceListId, items: [{ laborName: B_OZEL, unitPrice: 1, unit: 'adet' }],
    });
    const yA = await topluYukle(aL);
    const yYok = await topluYukle(YOK.liste);
    check('KV.18 save-bulk: A\'nin LISTESI ile OLMAYAN liste AYNI yanit (404, ayni govde)',
      yA.durum === 404 && yA.durum === yYok.durum && yA.metin === yYok.metin,
      `A: ${yA.durum} ${yA.metin} | yok: ${yYok.durum} ${yYok.metin}`);

    // YIKICI denemeler EN SONDA: kapi acilsaydi A'nin kaydi silinir ve sonraki
    // karsilastirmalar "yok ile yok"a donerdi (inceleme LOW-2).
    await ayni('KV.8', 'DELETE', (id) => `/labor-firms/price-items/${id}`, aP, YOK.kalem);
    await ayni('KV.9', 'DELETE', (id) => `/labor-firms/price-lists/${id}`, aL, YOK.liste);
    await ayni('KV.10', 'DELETE', (id) => `/labor-firms/${id}`, aF, YOK.firma);

    const aFirmaSon = d.db.tablo('LaborFirm').find((f) => f.id === aF);
    const aFiyatSon = d.db.tablo('LaborPrice').find((p) => p.id === aP);
    check('KV.15 A\'nin verisi DEGISMEDI: firma adi, liste ve fiyat satiri (777) yerinde, sizma listesi yok',
      aFirmaSon?.name === 'Usta A' && d.db.tablo('LaborPriceList').some((l) => l.id === aL) &&
        aFiyatSon?.unitPrice === 777 && !d.db.tablo('LaborPriceList').some((l) => l.name === 'Sizma listesi'),
      JSON.stringify({ firma: aFirmaSon?.name, fiyat: aFiyatSon?.unitPrice }));
    const bKendi = await eslestir(d, 'b', bF, 'KELEBEK VANA DN80');
    check('KV.16 KORUMA: B KENDI kaydinda calisir (firma okunur, eslestirme kendi fiyatini bulur — kapi her seyi reddetmiyor)',
      (await d.istek('b', 'GET', `/labor-firms/${bF}`)).durum === 200 && bKendi?.netPrice === 555,
      JSON.stringify(bKendi));

    // SURE KAHINI (guvenlik incelemesi MEDIUM-1): sahiplik JS'te karsilastirilirsa
    // yabanci kayit DB'den ILISKILERIYLE okunur (liste: sheets JSON), olmayan
    // kayitta tek bos sorgu — fark sureden olculur, toplu ucla buyutulur.
    // Kiraci kosulu SORGUDA (WHERE) ise A'nin kaydi hic donmez.
    const bKiraci = KISILER.b.firmaId;
    const aKimlikleri = new Set([aF, aL, aP]);
    const aOkumalari = d.db.izler.slice(izBas).filter((i) =>
      ['LaborFirm', 'LaborPriceList', 'LaborPrice'].includes(i.model) && /^find/.test(i.islem) &&
        aKimlikleri.has((i.args as any)?.where?.id));
    const kapsamli = (w: any) => w?.firmaId === bKiraci || w?.firmaId === bF || w?.firma?.firmaId === bKiraci;
    check('KV.17 SURE KAHINI KAPALI: B\'nin A kaydina yonelik HER okumasi kiraci kosulunu SORGUDA tasir (A\'nin kaydi DB\'den donmez)',
      aOkumalari.length >= 15 && aOkumalari.every((i) => kapsamli((i.args as any).where)),
      `okuma=${aOkumalari.length} kapsamsiz=${JSON.stringify(aOkumalari.filter((i) => !kapsamli((i.args as any).where))
        .map((i) => ({ m: i.model, o: i.islem, w: (i.args as any).where })))}`);

    // LOW-1 (inceleme): save-bulk govdesi satir ici tipte (ValidationPipe yok) —
    // `priceListId` eksik ya da nesne (`{ not: '' }`) gelince findFirst kosulu
    // DUSER ve kayit firmanin RASTGELE bir listesine yazilirdi. Bicimsiz liste
    // kimligi 400 alir, hicbir yere yazilmaz. (KV.17 olcumunden SONRA: A'nin
    // kendi istegi o pencereye girmesin.)
    const satirSayisi = () => d.db.tablo('LaborPrice').length;
    const oncekiSatir = satirSayisi();
    const kalem = [{ laborName: 'Sızma kalemi montajı', unitPrice: 9, unit: 'adet' }];
    const eksik = await d.istek('a1', 'POST', `/labor-firms/${aF}/save-bulk`, { items: kalem });
    const nesne = await d.istek('a1', 'POST', `/labor-firms/${aF}/save-bulk`, { priceListId: { not: '' }, items: kalem });
    // Metin de olculur: daha erken donen BASKA bir 400 kaldirilmis bir
    // denetimi gizleyemesin (kod incelemesi).
    const KIMLIK_400 = 'Gecersiz fiyat listesi kimligi';
    check('KV.19 save-bulk: liste kimligi eksik ya da nesneyse 400 ("Gecersiz fiyat listesi kimligi"), HICBIR listeye yazilmaz',
      eksik.durum === 400 && nesne.durum === 400 && eksik.veri?.message === KIMLIK_400 && nesne.veri?.message === KIMLIK_400 &&
        satirSayisi() === oncekiSatir,
      `${eksik.durum} ${eksik.metin} | ${nesne.durum} ${nesne.metin} | satir ${oncekiSatir}→${satirSayisi()}`);
  } finally {
    await d.app.close();
  }
}

// ═══ KL — L3/S1 (02.10.2026): liste silinince fiyat satirlari da gider ═════
// Eskiden yalniz liste siliniyordu; satirlar `onDelete: SetNull` ile
// priceListId=NULL kaliyor, kullanici onlari ne goruyor ne silebiliyordu — ve
// eslestirme fiyatlari `firmaId` ile cektigi icin SILINEN LISTENIN FIYATI
// TEKLIFTE KULLANILMAYA DEVAM EDIYORDU (canli 02.10: 0 satir). Eslestirme
// etkisi motor dosyasina dokunmadan GERCEK uctan olculur.
async function klBlogu(): Promise<void> {
  console.log('\n── KL (L3/S1) liste silinince fiyat satırları da gider ──');
  const d = await dunyaKur();
  try {
    const aF = await iscilikFirmasiAc(d, 'a1', 'Usta A');
    const silinecek = await yukle(d, 'a1', aF, [[A_OZEL, 777]]);
    const kalan = await yukle(d, 'a1', aF, [[KOMP, 200]]);
    const bF = await iscilikFirmasiAc(d, 'b', 'Usta B');
    await yukle(d, 'b', bF, [[B_OZEL, 555]]);
    const silinecekSatir = fiyatSatiri(d, aF, A_OZEL)!.id as string;
    const kalanSatir = fiyatSatiri(d, aF, KOMP)!.id as string;
    const bSatir = fiyatSatiri(d, bF, B_OZEL)!.id as string;
    const once = await eslestir(d, 'a1', aF, 'KÜRESEL VANA DN65');
    check('KL.0 FIXTURE: silinecek listenin satiri eslestirmede 777 ile bulunur', once?.netPrice === 777, JSON.stringify(once));

    const satirlar = () => d.db.tablo('LaborPrice');
    const sil = await d.istek('a1', 'DELETE', `/labor-firms/price-lists/${silinecek}`);
    check('KL.1 ★ liste silinince ONUN fiyat satiri da silinir (listesiz NULL satir KALMAZ)',
      sil.durum === 200 && !satirlar().some((p) => p.id === silinecekSatir) && !satirlar().some((p) => p.priceListId === null),
      `${sil.durum} ${JSON.stringify(satirlar().map((p) => ({ id: p.id, liste: p.priceListId })))}`);
    // Ham yanit olculur: hata yanitinda `eslestir` undefined doner ve olumsuz
    // kontrol bos yere gecerdi (inceleme LOW-2).
    const sonraYanit = await d.istek('a1', 'POST', '/labor-matching/bulk-match', {
      firmaId: aF, laborNames: ['KÜRESEL VANA DN65'], units: { 'KÜRESEL VANA DN65': 'adet' },
    });
    const sonra = sonraYanit.veri?.['KÜRESEL VANA DN65'];
    check('KL.2 ★ BAGLANTI eslestirme: silinen listenin fiyati (777) havuza GIRMEZ (yanit 201, satir eslesmez)',
      sonraYanit.durum === 201 && sonra?.confidence === 'none' && sonra?.netPrice === 0 && !sonraYanit.metin.includes('777'),
      `${sonraYanit.durum} ${sonraYanit.metin.slice(0, 200)}`);
    const kalanEsle = await eslestir(d, 'a1', aF, 'KOMPANSATÖR DN100');
    check('KL.3 KORUMA: diger listenin ve baska kiracinin satiri YERINDE (kapsam yalniz silinen liste); kalan liste eslesir (200)',
      satirlar().some((p) => p.id === kalanSatir && p.priceListId === kalan) && satirlar().some((p) => p.id === bSatir) &&
        kalanEsle?.netPrice === 200,
      JSON.stringify(kalanEsle));

    // ATOMIK: liste silme duserse satirlar da YERINDE kalir (ayni islem).
    const ikinci = await yukle(d, 'a1', aF, [[ORTAK_AD, 90]]);
    const ikinciSatir = fiyatSatiri(d, aF, ORTAK_AD)!.id as string;
    const api = d.db.istemci.laborPriceList;
    const asil = api.delete;
    api.delete = async () => {
      api.delete = asil;
      throw new Error('liste silinemedi (test)');
    };
    const hatali = await d.istek('a1', 'DELETE', `/labor-firms/price-lists/${ikinci}`);
    api.delete = asil;
    // Olcut: IKI ADIMLI silme (once satirlar, sonra liste) geri gelirse liste
    // silme dustugunde satirlar gitmis olur. Cascade'in kendisini KL.1 ve
    // `test:migration` LC0 olcer (kod incelemesi LOW-1).
    check('KL.4 IKI ADIMLI SILME YOK: liste silme duserse fiyat satiri da SILINMEZ (satirlari DB siler, tek ifade)',
      hatali.durum >= 500 && satirlar().some((p) => p.id === ikinciSatir) && d.db.tablo('LaborPriceList').some((l) => l.id === ikinci),
      `${hatali.durum} ${hatali.metin.slice(0, 120)}`);
  } finally {
    await d.app.close();
  }
}

async function main(): Promise<void> {
  k0Blogu();
  await kmBlogu();
  await k2Blogu();
  await k2bBlogu();
  await k2cBlogu();
  await k1Blogu();
  await k1bBlogu();
  await k1cBlogu();
  await kcBlogu();
  await k4Blogu();
  await k5Blogu();
  await kbBlogu();
  await kvBlogu();
  await klBlogu();
  const hatalar = gunluk.filter((s) => s.startsWith('ERROR'));
  if (hatalar.length) console.log(`\n  (Nest ERROR satirlari: ${hatalar.length}) ${hatalar.slice(0, 3).join(' || ').slice(0, 600)}`);
  console.log(`\nKIRACI SINIRI: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAIL: ${f}`);
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error('FAIL: beklenmeyen hata', e);
  process.exitCode = 1;
}));
