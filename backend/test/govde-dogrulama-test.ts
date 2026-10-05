/**
 * GOVDE DOGRULAMA — Paket 4a (01.10.2026): eslestirme uclarinin govdesi ve
 * malzeme kutuphanesi izgara kaydinin satir hatalari.
 *   `npm run test:govde-dogrulama` · DB GEREKTIRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   C11 (P3) `POST /matching/bulk-match`, `/labor-matching/bulk-match` ve iki
 *       `remember` ucu govdeyi SATIR ICI tiple aliyordu: genel ValidationPipe
 *       sinif olmayan tipi dogrulamaz → `materialNames: ["Vana DN25", 5]`
 *       motorda TypeError → 500, tum liste duser; `"abc"` harf harf
 *       eslestirilir; `units: { ad: 5 }` normalizeText'i patlatir.
 *   Ikiz (P1 guvenlik incelemesi) — malzeme kutuphanesi izgara kaydi
 *       (`POST /library/brand/:brandId/save-sheets`) satir hatasinda ham
 *       `e.message` donduruyordu: Prisma hatasi sorgu ayrintisini tarayiciya
 *       tasirdi; bicimsiz kimlik DB'ye gidiyordu. Iscilik ikizi P1'de kapandi
 *       (`satirHatalari`); bu dosya malzeme tarafini olcer.
 *
 * ── NASIL OLCULUR ───────────────────────────────────────────────────────
 *   GERCEK denetleyiciler ve GERCEK servisler, HTTP uzerinden (Nest + fetch);
 *   yalniz sinif duzeyi kapilar golgelenir (kimlik `x-test-kim`). Genel
 *   ValidationPipe `main.ts` ile AYNI ayarla kurulur. Veri
 *   `yardimci/bellek-prisma.ts`te.
 *
 * Cikis kodu: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Module, ValidationPipe, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/altyapi/db/prisma.service';
import { LibraryController } from '../src/ozellik/kutuphane/library/library.controller';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';
import { MatchingController } from '../src/ozellik/eslestirme/matching/matching.controller';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService } from '../src/ozellik/eslestirme/matching/terminology.service';
import { LaborMatchingController } from '../src/ozellik/eslestirme/labor-matching/labor-matching.controller';
import { LaborMatchingService } from '../src/ozellik/eslestirme/labor-matching/labor-matching.service';
import { ExchangeRatesService } from '../src/ozellik/fiyat/exchange-rates/exchange-rates.service';
import { LaborFirmsController } from '../src/ozellik/kutuphane/labor-firms/labor-firms.controller';
import { LaborFirmsService } from '../src/ozellik/kutuphane/labor-firms/labor-firms.service';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
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

const KISI = { id: 'kisi-a1', firmaId: 'firma-a', role: 'user' };
const testKapisi = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['x-test-kim'] !== 'a1') return false;
    req.user = { ...KISI };
    return true;
  },
};
class OlcumLibrary extends LibraryController {}
class OlcumMatching extends MatchingController {}
class OlcumLaborMatching extends LaborMatchingController {}
class OlcumLaborFirms extends LaborFirmsController {}
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumLibrary);
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumMatching);
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumLaborMatching);
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumLaborFirms);

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
  istek(yontem: string, yol: string, govde?: unknown): Promise<Yanit>;
}

const MARKA = 'marka-1';
const ISCILIK_FIRMASI = 'isc-a';

async function dunyaKur(): Promise<Dunya> {
  const db = bellekPrisma();
  const p = db.istemci;
  await p.firma.create({ data: { id: KISI.firmaId, ad: KISI.firmaId } });
  await p.user.create({ data: { id: KISI.id, email: 'a1@ornek.test', password: 'x', firmaId: KISI.firmaId } });
  await p.brand.create({ data: { id: MARKA, name: 'Olcum Marka' } });
  await p.laborFirm.create({ data: { id: ISCILIK_FIRMASI, name: 'Olcum Iscilik', discipline: 'mechanical', userId: KISI.id, firmaId: KISI.firmaId } });

  @Module({
    controllers: [OlcumLibrary, OlcumMatching, OlcumLaborMatching, OlcumLaborFirms],
    providers: [
      LibraryService, MatchingService, LaborMatchingService, TerminologyService, LaborFirmsService, ExcelGridService,
      { provide: PrismaService, useValue: p },
      { provide: ExchangeRatesService, useValue: sahteKur },
    ],
  })
  class DunyaModulu {}

  const app = await NestFactory.create<NestExpressApplication>(DunyaModulu, { logger: yakalayici });
  // main.ts ile AYNI genel boru.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const istek = async (yontem: string, yol: string, govde?: unknown): Promise<Yanit> => {
    const r = await fetch(`http://127.0.0.1:${port}/api${yol}`, {
      method: yontem,
      headers: { 'x-test-kim': 'a1', ...(govde !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: govde !== undefined ? JSON.stringify(govde) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const metin = await r.text();
    let veri: any = null;
    try {
      veri = JSON.parse(metin);
    } catch {
      /* JSON degil */
    }
    return { durum: r.status, veri, metin };
  };
  return { db, app, istek };
}

/** Kutuphane satiri (firma-a, marka-1). */
async function kutuphaneSatiri(d: Dunya, ad: string, fiyat: number): Promise<string> {
  const r = await d.db.istemci.userLibrary.create({
    data: { userId: KISI.id, firmaId: KISI.firmaId, brandId: MARKA, materialName: ad, adRaw: ad, listPrice: fiyat, currency: 'TRY' },
  });
  return r.id as string;
}

/** TEK SEFERLIK: verilen satir(lar)in `userLibrary.update`i bir kez `hata` firlatir. */
function guncellemeHatasi(d: Dunya, idler: string[], hata: (id: string) => Error): void {
  const api = d.db.istemci.userLibrary;
  const asil = api.update;
  const kalan = new Set(idler);
  api.update = async (args: any) => {
    const id = args?.where?.id;
    if (kalan.has(id)) {
      kalan.delete(id);
      if (kalan.size === 0) api.update = asil;
      throw hata(id);
    }
    return asil(args);
  };
}

const kaydet = (d: Dunya, dirtyRows: unknown[]) =>
  d.istek('POST', `/library/brand/${MARKA}/save-sheets`, { dirtyRows });

// ═══ S — ikiz: malzeme izgara kaydinin satir hatalari ══════════════════════
async function sBlogu(): Promise<void> {
  console.log('\n── S (ikiz) malzeme kütüphanesi ızgara kaydı — satır hataları ──');
  const d = await dunyaKur();
  try {
    const s1 = await kutuphaneSatiri(d, 'Küresel vana DN50', 100);
    const s2 = await kutuphaneSatiri(d, 'Kelebek vana DN80', 200);
    const s3 = await kutuphaneSatiri(d, 'Çekvalf DN25', 50);

    const normal = await kaydet(d, [{ libraryItemId: s1, listPrice: 110 }]);
    check('S.0 FIXTURE: normal kayit calisir (fiyat yazildi, hata yok)',
      normal.durum === 201 && normal.veri?.updated === 1 && (normal.veri?.errors ?? []).length === 0 &&
        d.db.tablo('UserLibrary').find((r) => r.id === s1)?.listPrice === 110,
      `${normal.durum} ${normal.metin}`);

    const gunlukBas = gunluk.length;
    guncellemeHatasi(d, [s2, s3], (id) => new Error(`Invalid \`prisma.userLibrary.update()\` invocation: ic ayrinti 9c1e <<${id}>>`));
    const ham = await kaydet(d, [{ libraryItemId: s2, listPrice: 210 }, { libraryItemId: s3, listPrice: 55 }]);
    const satirlar = gunluk.slice(gunlukBas).filter((l) => l.includes('ic ayrinti 9c1e'));
    check('S.1 Beklenmeyen hata metni (Prisma ayrintisi) yanitta YOK — iki satir da genel metin',
      ham.durum === 201 && (ham.veri?.errors ?? []).length === 2 &&
        !ham.metin.includes('ic ayrinti') && !ham.metin.includes('prisma') &&
        (ham.veri?.errors ?? []).every((e: any) => String(e.error).includes('kaydedilemedi')),
      ham.metin);
    check('S.2 Ayrinti sunucu gunlugunde, istek basina TEK satir (sayi 2, iki ornek, tek satir)',
      satirlar.length === 1 && satirlar[0].includes('library save-sheets: 2 kütüphane satırı') && satirlar[0].includes(`<<${s2}>>`) &&
        satirlar[0].includes(`<<${s3}>>`) && !satirlar[0].includes('\n'),
      JSON.stringify(gunluk.slice(gunlukBas)));

    const izBas = d.db.izler.length;
    const gunlukBas2 = gunluk.length;
    const bicimsiz = await kaydet(d, [
      { libraryItemId: 7, listPrice: 1 }, { libraryItemId: null }, { libraryItemId: { x: 1 } }, { libraryItemId: 'x'.repeat(65) },
    ]);
    const sorgu = d.db.izler.slice(izBas).filter((i) => i.model === 'UserLibrary' && i.islem === 'findFirst').length;
    check('S.3 Bicimsiz satir kimligi DB\'ye gitmeden reddedilir ("Geçersiz satır kimliği.", gunluk yok)',
      bicimsiz.durum === 201 && (bicimsiz.veri?.errors ?? []).length === 4 &&
        (bicimsiz.veri?.errors ?? []).every((e: any) => e.error === 'Geçersiz satır kimliği.') &&
        sorgu === 0 && gunluk.length === gunlukBas2,
      `${bicimsiz.metin} | sorgu=${sorgu} | ${gunluk.slice(gunlukBas2).join(' / ')}`);

    const gunlukBas3 = gunluk.length;
    const tipHatasi = await kaydet(d, [
      { libraryItemId: s1, materialName: 5 }, { libraryItemId: s1, unit: 7 }, { libraryItemId: s1, listPrice: '120' },
    ]);
    check('S.4 Turu bozuk alan (ad/birim sayi, fiyat metin) DB\'ye gitmeden "Geçersiz satır verisi" — ham metin yok, gunluk yok',
      tipHatasi.durum === 201 && (tipHatasi.veri?.errors ?? []).length === 3 &&
        (tipHatasi.veri?.errors ?? []).every((e: any) => String(e.error).startsWith('Geçersiz satır verisi')) &&
        !tipHatasi.metin.includes('is not a function') && !tipHatasi.metin.includes('trim') &&
        gunluk.length === gunlukBas3,
      `${tipHatasi.metin} | ${gunluk.slice(gunlukBas3).join(' / ')}`);

    // null (inceleme P4a): on yuz bu alanlarda null GONDERMEZ (sayi/metin ya da
    // undefined); null eskiden kapidan geciyordu → fiyat null yaziliyor (silinir),
    // iskonto 0 oluyor, birimde `trim` patlayip genel hata + gunluk uretiyordu.
    const s4 = await kutuphaneSatiri(d, 'Pislik tutucu DN40', 80);
    await d.db.istemci.userLibrary.update({ where: { id: s4 }, data: { discountRate: 15, unit: 'Adet' } });
    const s4Once = { ...d.db.tablo('UserLibrary').find((r) => r.id === s4) };
    check('S.4b FIXTURE: satirda fiyat 80, iskonto 15, birim "Adet" (null yazimi gorunur olsun)',
      s4Once.listPrice === 80 && s4Once.discountRate === 15 && s4Once.unit === 'Adet', JSON.stringify(s4Once));
    const gunlukBas4 = gunluk.length;
    const nullHatasi = await kaydet(d, [
      { libraryItemId: s4, listPrice: null }, { libraryItemId: s4, discountRate: null },
      { libraryItemId: s4, unit: null }, { libraryItemId: s4, materialName: null },
    ]);
    const s4Sonra = { ...d.db.tablo('UserLibrary').find((r) => r.id === s4) };
    check('S.4c null alan da "Geçersiz satır verisi": fiyat SILINMEZ, iskonto 0 OLMAZ, birimde genel hata/gunluk YOK',
      nullHatasi.durum === 201 && (nullHatasi.veri?.errors ?? []).length === 4 &&
        (nullHatasi.veri?.errors ?? []).every((e: any) => String(e.error).startsWith('Geçersiz satır verisi')) &&
        s4Sonra.listPrice === 80 && s4Sonra.customPrice === s4Once.customPrice && s4Sonra.discountRate === 15 &&
        s4Sonra.unit === 'Adet' && gunluk.length === gunlukBas4,
      `${nullHatasi.metin} | ${JSON.stringify(s4Sonra)} | ${gunluk.slice(gunlukBas4).join(' / ')}`);

    const yok = await kaydet(d, [{ libraryItemId: '00000000-0000-4000-8000-000000000000', listPrice: 1 }]);
    check('S.5 KORUMA: bulunamayan satir kendi metniyle doner (Bulunamadi)',
      yok.durum === 201 && yok.veri?.errors?.[0]?.error === 'Bulunamadi', yok.metin);
  } finally {
    await d.app.close();
  }
}

// ═══ G — C11: eslestirme uclarinin govdesi ═══════════════════════════════
async function gBlogu(): Promise<void> {
  console.log('\n── G (C11) eşleştirme uçlarının gövdesi ──');
  const d = await dunyaKur();
  try {
    // Servisler YAKALANIR: dogrulama gecerse cagri kaydedilir (motor kosmaz).
    const matching = d.app.get(MatchingService);
    const labor = d.app.get(LaborMatchingService);
    const cagrilar: Array<{ uc: string; args: unknown[] }> = [];
    (matching as any).bulkMatch = async (...args: unknown[]) => { cagrilar.push({ uc: 'malzeme', args }); return {}; };
    (matching as any).remember = async (...args: unknown[]) => { cagrilar.push({ uc: 'malzeme-hafiza', args }); return { ok: true }; };
    (labor as any).bulkMatch = async (...args: unknown[]) => { cagrilar.push({ uc: 'iscilik', args }); return {}; };
    (labor as any).remember = async (...args: unknown[]) => { cagrilar.push({ uc: 'iscilik-hafiza', args }); return { ok: true }; };

    const bozuklar: Array<[string, string, unknown]> = [
      ['G.1', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25', 5] }],
      ['G.2', '/matching/bulk-match', { brandId: MARKA, materialNames: 'abc' }],
      ['G.3', '/matching/bulk-match', { materialNames: ['Vana DN25'] }],
      ['G.4', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25'], variantTags: [1] }],
      ['G.5', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25'], units: { 'Vana DN25': 5 } }],
      ['G.6', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25'], units: ['adet'] }],
      ['G.7', '/labor-matching/bulk-match', { firmaId: 'isc-1', laborNames: ['Vana montajı', 5] }],
      ['G.8', '/labor-matching/bulk-match', { firmaId: 'isc-1', laborNames: 'abc' }],
      ['G.9', '/labor-matching/bulk-match', { laborNames: ['Vana montajı'] }],
      ['G.10', '/labor-matching/bulk-match', { firmaId: 'isc-1', laborNames: ['Vana montajı'], units: { 'Vana montajı': 5 } }],
      ['G.11', '/matching/remember', { brandId: MARKA, materialName: 5, secilenAd: 'Vana' }],
      ['G.12', '/labor-matching/remember', { firmaId: 'isc-1', laborName: 'Vana montajı', secilenAd: 7 }],
    ];
    for (const [ad, yol, govde] of bozuklar) {
      const once = cagrilar.length;
      const r = await d.istek('POST', yol, govde);
      check(`${ad} Bicimsiz govde 400 alir, servise ULASMAZ (${yol} ${JSON.stringify(govde).slice(0, 70)})`,
        r.durum === 400 && cagrilar.length === once, `${r.durum} ${r.metin.slice(0, 160)}`);
    }

    // BAGLANTI: gecerli govde servise BOZULMADAN ulasir (whitelist alani dusurmez).
    const gecerli = { brandId: MARKA, materialNames: ['Vana DN25', 'Dirsek 90° DN50'], variantTags: ['kaynakli'], units: { 'Vana DN25': 'adet' } };
    const once = cagrilar.length;
    const r = await d.istek('POST', '/matching/bulk-match', gecerli);
    const c = cagrilar[once];
    check('G.13 BAGLANTI: gecerli malzeme govdesi servise tum alanlariyla ulasir (brandId, adlar, varyant, birimler)',
      r.durum === 201 && cagrilar.length === once + 1 && c?.uc === 'malzeme' &&
        JSON.stringify(c.args.slice(1)) === JSON.stringify([gecerli.brandId, gecerli.materialNames, gecerli.variantTags, gecerli.units]),
      `${r.durum} ${JSON.stringify(c?.args)}`);
    const gecerliIsc = { firmaId: 'isc-1', laborNames: ['Vana montajı DN25'], units: { 'Vana montajı DN25': 'adet' } };
    const once2 = cagrilar.length;
    const r2 = await d.istek('POST', '/labor-matching/bulk-match', gecerliIsc);
    const c2 = cagrilar[once2];
    check('G.14 BAGLANTI: gecerli iscilik govdesi servise tum alanlariyla ulasir (variantTags yoksa undefined)',
      r2.durum === 201 && c2?.uc === 'iscilik' &&
        JSON.stringify(c2.args.slice(1)) === JSON.stringify([gecerliIsc.firmaId, gecerliIsc.laborNames, undefined, gecerliIsc.units]),
      `${r2.durum} ${JSON.stringify(c2?.args)}`);
    const once3 = cagrilar.length;
    const r3 = await d.istek('POST', '/matching/remember', { brandId: MARKA, materialName: 'Vana DN25', secilenAd: 'Küresel vana DN25' });
    check('G.15 BAGLANTI: gecerli hafiza govdesi servise ulasir',
      r3.durum === 201 && cagrilar[once3]?.uc === 'malzeme-hafiza' &&
        JSON.stringify(cagrilar[once3].args.slice(1)) === JSON.stringify([MARKA, 'Vana DN25', 'Küresel vana DN25']),
      `${r3.durum} ${JSON.stringify(cagrilar[once3]?.args)}`);

    // MIRAS ANAHTAR (guvenlik incelemesi P4a): motor birimi `units?.[ad]` ile
    // okur (matching.service.ts matchV2). Duz nesnede "toString"/"constructor"
    // adli satir Object.prototype'tan FONKSIYON alir → parseLine →
    // normalizeText(fonksiyon) TypeError → tum istek 500. Sinirda sozluk
    // PROTOTIPSIZ olmali; gercek birim korunur.
    const miras = ['toString', 'constructor', '__proto__', 'hasOwnProperty'];
    const tur = (u: any, a: string) => (u ? typeof u[a] : 'sozluk-yok');
    const once4 = cagrilar.length;
    const r4 = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: [...miras, 'Vana DN25'], units: { 'Vana DN25': 'adet' } });
    const u4 = cagrilar[once4]?.args[4] as any;
    check('G.16 units PROTOTIPSIZ: miras anahtar adli satir sozlukten deger ALMAZ, gercek birim korunur (malzeme)',
      r4.durum === 201 && cagrilar[once4]?.uc === 'malzeme' && miras.every((a) => u4?.[a] === undefined) && u4?.['Vana DN25'] === 'adet',
      `${r4.durum} ${miras.map((a) => `${a}:${tur(u4, a)}`).join(' ')} birim=${u4?.['Vana DN25']}`);
    const once5 = cagrilar.length;
    const r5 = await d.istek('POST', '/labor-matching/bulk-match', { firmaId: 'isc-1', laborNames: ['toString', 'constructor'], units: {} });
    const u5 = cagrilar[once5]?.args[4] as any;
    check('G.17 iscilik ikizi: units PROTOTIPSIZ (bos sozluk de)',
      r5.durum === 201 && cagrilar[once5]?.uc === 'iscilik' && !!u5 && u5.toString === undefined && u5.constructor === undefined,
      `${r5.durum} toString:${tur(u5, 'toString')} constructor:${tur(u5, 'constructor')}`);

    const once6 = cagrilar.length;
    const r6 = await d.istek('POST', '/labor-matching/remember', { firmaId: 'isc-1', laborName: 'Vana montajı DN25', secilenAd: 'Vana montajı' });
    check('G.18 BAGLANTI: gecerli iscilik hafiza govdesi servise ulasir (whitelist alan dusurmez)',
      r6.durum === 201 && cagrilar[once6]?.uc === 'iscilik-hafiza' &&
        JSON.stringify(cagrilar[once6].args.slice(1)) === JSON.stringify(['isc-1', 'Vana montajı DN25', 'Vana montajı']),
      `${r6.durum} ${JSON.stringify(cagrilar[once6]?.args)}`);
  } finally {
    await d.app.close();
  }
}

// ═══ I — P4b (05.10.2026, S1 incelemesi): iscilik toplu kayit (save-bulk) DTO ═══
// Govde satir ici tipteydi: `items: "abc"` / `[null]` servisi TypeError ile 500'e
// dusuruyordu (`[5]` sessizce suzuluyordu). DTO yapiyi dogrular; SATIR duzeyinde hosgorulu kalir (yarim
// satiri servis suzer) ve para birimini servise birakir (KUR-02 Turkce mesaj).
async function iBlogu(): Promise<void> {
  console.log('\n── I (P4b) işçilik toplu kayıt (save-bulk) gövdesi ──');
  const d = await dunyaKur();
  try {
    const firmalar = d.app.get(LaborFirmsService);
    const asil = firmalar.saveBulkPrices.bind(firmalar);
    const cagrilar: unknown[][] = [];
    (firmalar as any).saveBulkPrices = async (...args: unknown[]) => { cagrilar.push(args); return { ok: true }; };
    const yol = `/labor-firms/${ISCILIK_FIRMASI}/save-bulk`;
    const satir = { laborName: 'Vana montajı DN25', unit: 'adet', unitPrice: 120 };

    const bozuklar: Array<[string, unknown]> = [
      ['I.1', { priceListId: 'new', items: 'abc' }],
      ['I.2', { priceListId: 'new', items: [5] }],
      ['I.3', { priceListId: 'new', items: [null] }],
      ['I.4', { priceListId: 'new', items: [{ ...satir, laborName: 123 }] }],
      ['I.5', { priceListId: 'new', items: [{ ...satir, unitPrice: '120' }] }],
      ['I.6', { priceListId: 5, items: [satir] }],
      ['I.7', { priceListId: 'new', items: [satir], sheet: [] }],
      ['I.8', { priceListId: 'new' }],
    ];
    for (const [ad, govde] of bozuklar) {
      const once = cagrilar.length;
      const r = await d.istek('POST', yol, govde);
      check(`${ad} Bicimsiz govde 400 alir, servise ULASMAZ (${JSON.stringify(govde).slice(0, 70)})`,
        r.durum === 400 && cagrilar.length === once, `${r.durum} ${r.metin.slice(0, 160)}`);
    }

    // BAGLANTI: gecerli govde servise tum alanlariyla ulasir; sheet ICERIGI
    // (ic ice alanlar) silinmez, bilinmeyen satir alani silinir (whitelist).
    const sheet = {
      columnDefs: [{ field: 'ad', headerName: 'Ad' }], columnRoles: { ad: 'name' }, headerEndRow: 0,
      rowData: [{ _rowIdx: 0, _isDataRow: true, ad: 'Vana montajı DN25', not: 'gece mesaisi', _laborName: 'Vana montajı DN25' }],
    };
    const tamSatir = { ...satir, category: 'Vana', discountRate: 10, currency: 'USD', hack: 'baska-firma' };
    const once = cagrilar.length;
    const r = await d.istek('POST', yol, { priceListId: 'new', items: [tamSatir, { laborName: '', unitPrice: 0 }], sheet });
    const c = cagrilar[once];
    const gelenSatir = (c?.[3] as any[])?.[0];
    check('I.9 BAGLANTI: gecerli govde servise ulasir (liste kimligi, satir alanlari, para birimi)',
      r.durum === 201 && c?.[2] === 'new' && gelenSatir?.laborName === satir.laborName && gelenSatir?.unit === 'adet'
        && gelenSatir?.unitPrice === 120 && gelenSatir?.category === 'Vana' && gelenSatir?.discountRate === 10 && gelenSatir?.currency === 'USD',
      `${r.durum} ${JSON.stringify(c?.slice(2, 4))}`);
    check('I.10 yarim satir DTO\'da 400 ALMAZ, servise ulasir (suzme serviste)', (c?.[3] as any[])?.length === 2, JSON.stringify(c?.[3]));
    check('I.11 sheet ICERIGI aynen ulasir (ic ice alanlar silinmez)', JSON.stringify(c?.[4]) === JSON.stringify(sheet), JSON.stringify(c?.[4]));
    check('I.12 bilinmeyen satir alani servise ULASMAZ (whitelist)', !!gelenSatir && !('hack' in gelenSatir), JSON.stringify(gelenSatir));

    // GERCEK servis: suzme ve KUR-02 mesaji DTO'dan sonra da serviste.
    (firmalar as any).saveBulkPrices = asil;
    const satirSayisi = () => d.db.tablo('LaborPrice').length;
    const onceSatir = satirSayisi();
    const g = await d.istek('POST', yol, { priceListId: 'new', items: [satir, { laborName: '', unit: 'adet', unitPrice: 0 }, { laborName: 'X', unitPrice: 5 }] });
    check('I.13 gercek servis: yarim satirlar suzulur, gecerli satir YAZILIR (201, +1 fiyat satiri)',
      g.durum === 201 && satirSayisi() === onceSatir + 1, `${g.durum} ${g.metin.slice(0, 160)} satir ${onceSatir}→${satirSayisi()}`);
    const kur = await d.istek('POST', yol, { priceListId: 'new', items: [{ ...satir, currency: 'EURO' }] });
    check('I.14 para birimi serviste dogrulanir: Turkce satir mesaji (KUR-02), yazilmaz',
      kur.durum === 400 && /^Satır 1 \("Vana montajı DN25"\): para birimi /.test(String(kur.veri?.message)) && satirSayisi() === onceSatir + 1,
      `${kur.durum} ${kur.metin.slice(0, 160)}`);
  } finally {
    await d.app.close();
  }
}

async function main(): Promise<void> {
  await sBlogu();
  await gBlogu();
  await iBlogu();
  console.log(`\nGOVDE DOGRULAMA: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAIL: ${f}`);
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error('FAIL: beklenmeyen hata', e);
  process.exitCode = 1;
}));
