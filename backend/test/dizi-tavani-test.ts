/**
 * DİZİ TAVANI — 06.10.2026: tek istekte gelen dizinin üst sınırı.
 *   `npm run test:dizi-tavani` · DB GEREKTIRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   Genel JSON sınırı 50 MB; bu uçların işi DİZİNİN BOYUYLA büyür (ad başına
 *   motor, satır başına sorgu, öğe başına DTO kurulumu). Tavan yoktu: tek
 *   istek bütün kiracıların olay döngüsünü saniyelerce tutabilirdi. Tavan
 *   GUARD'dadır — ValidationPipe'tan ÖNCE koşar; aşan istek 413 + Türkçe
 *   mesaj, işin hiçbiri yapılmaz, kimliksiz tek WARN satırı.
 *
 * ── NASIL ÖLÇÜLÜR ───────────────────────────────────────────────────────
 *   U  kapının kendisi (sahte bağlam): sınır, mesaj, sayaçlar, günlük.
 *   M  tavanlar ölçülen meşru en büyüğün geniş katı (altına inen tavan kırmızı).
 *   B  her hedef ucun yöntem meta verisinde kapı + DOĞRU kural (alan, tavan).
 *   H  GERÇEK denetleyiciler HTTP üzerinden (Nest + fetch), ValidationPipe
 *      `main.ts` ile aynı; sınıf düzeyi kapılar gölgelenir (kimlik `x-test-kim`),
 *      yöntem düzeyi kapı ÇALIŞIR. Teklif servisi taklit (yalnız çağrıyı sayar).
 *   P  toplu iskonto: kimlikler 1.000'lik parçalarla, TEK işlemde, firma süzgeçli.
 *
 * Çıkış kodu: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { Logger, Module, ValidationPipe, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';

import {
  ALIAS_TUR_TAVANI,
  DiziTavaniKapisi,
  ESLESTIRME_AD_TAVANI,
  TEKLIF_SATIR_TAVANI,
  TEKLIF_SAYFA_TAVANI,
  KUTUPHANE_EKLEME_SATIR_TAVANI,
  ISCILIK_SATIR_TAVANI,
  ISCILIK_SAYFA_TAVANI,
  KUTUPHANE_SATIR_TAVANI,
  TEKLIF_KALEM_TAVANI,
  TOPLU_ISKONTO_KIMLIK_TAVANI,
  TOPLU_ISKONTO_PARCA,
  VARYANT_ETIKET_TAVANI,
  anahtarSayisi,
  diziTavaniMesaji,
  sayfaSatirToplami,
  type DiziKurali,
} from '../src/altyapi/http/dizi-tavani';
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
import { QuotesController } from '../src/ozellik/teklif/quotes/quotes.controller';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { AddLibraryRowsDto } from '../src/ozellik/kutuphane/library/dto/add-library-rows.dto';
import { CreateManualBrandDto } from '../src/ozellik/kutuphane/library/dto/create-manual-brand.dto';
import { getMetadataStorage } from 'class-validator';
import { malzemeEtiketleri } from '../src/ozellik/eslestirme/matching/index/product-index';
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
const js = (x: unknown) => JSON.stringify(x);

const gunluk: string[] = [];
const yakalayici: LoggerService = {
  log: () => undefined,
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
};
const tavanUyarilari = () => gunluk.filter((g) => g.startsWith('WARN Dizi tavani asildi'));
// Uygulama kurulmadan önceki (U bloğu) günlük de yakalansın.
Logger.overrideLogger(yakalayici);

/** `n` öğeli dizi (öğe üreticisiyle). */
const dizi = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

// ═══ U — kapının kendisi ═══════════════════════════════════════════════════
function sahteBaglam(govde: unknown): ExecutionContext {
  class SahteDenetleyici {}
  function sahteUc() { /* yalniz ad */ }
  return {
    switchToHttp: () => ({ getRequest: () => ({ body: govde, user: { id: 'kisi-gizli', email: 'gizli@ornek.test' } }) }),
    getClass: () => SahteDenetleyici,
    getHandler: () => sahteUc,
  } as unknown as ExecutionContext;
}
function kapidanGecer(kapi: DiziTavaniKapisi, govde: unknown): { gecti: boolean; durum?: number; mesaj?: string } {
  try {
    return { gecti: kapi.canActivate(sahteBaglam(govde)) === true };
  } catch (e: any) {
    return { gecti: false, durum: e?.getStatus?.(), mesaj: e?.response?.message ?? e?.message };
  }
}

function uBlogu(): void {
  console.log('\n── U · kapı: sınır, mesaj, sayaçlar, günlük ──');
  const kural: DiziKurali = { alan: 'adlar', tavan: 3, ogeAdi: 'ad' };
  const kapi = new DiziTavaniKapisi([kural]);
  check('U1 tam tavan kadar öğe GEÇER', kapidanGecer(kapi, { adlar: ['a', 'b', 'c'] }).gecti);
  const asan = kapidanGecer(kapi, { adlar: ['a', 'b', 'c', 'd'] });
  check('U2 tavanın bir fazlası 413', !asan.gecti && asan.durum === 413, js(asan));
  check('U3 mesaj Türkçe, tavanı ve geleni söyler',
    asan.mesaj === 'Tek istekte en çok 3 ad gönderilebilir; bu istekte 4 var.', String(asan.mesaj));
  check('U3b büyük sayılar Türkçe basamakla yazılır',
    diziTavaniMesaji({ alan: 'x', tavan: 20_000, ogeAdi: 'kalem' }, 25_001) ===
      'Tek istekte en çok 20.000 kalem gönderilebilir; bu istekte 25.001 var.');
  check('U4a alan yoksa / null / gövde yoksa GEÇER',
    kapidanGecer(kapi, {}).gecti && kapidanGecer(kapi, { adlar: null }).gecti && kapidanGecer(kapi, undefined).gecti);
  const metin = kapidanGecer(kapi, { adlar: 'abcdef' });
  check('U4b ⭐ DEĞİŞMEZ: alan var ama DİZİ DEĞİLSE 400 (metin karakter karakter dolaşılmasın)',
    !metin.gecti && metin.durum === 400 && metin.mesaj === 'Geçersiz istek: "adlar" bir liste olmalı.', js(metin));
  const sayacli = new DiziTavaniKapisi([{ alan: 'units', tavan: 2, ogeAdi: 'birim', say: (g) => anahtarSayisi(g?.units) }]);
  check('U4c kendi sayacı olan kural dizi ŞARTI koymaz (units sözlüktür)', kapidanGecer(sayacli, { units: { a: 'x' } }).gecti);
  const iki = new DiziTavaniKapisi([kural, { alan: 'etiket', tavan: 1, ogeAdi: 'etiket' }]);
  const ikinci = kapidanGecer(iki, { adlar: ['a'], etiket: ['x', 'y'] });
  check('U5 her kural ayrı denetlenir (ikinci alan da 413)', ikinci.durum === 413 && /2 var/.test(String(ikinci.mesaj)), js(ikinci));
  check('U6 anahtar sayacı: nesnenin anahtarları; dizi / null / metin 0',
    anahtarSayisi({ a: '1', b: '2' }) === 2 && anahtarSayisi(['a']) === 0 && anahtarSayisi(null) === 0 && anahtarSayisi('ab') === 0);
  check('U7 sayfa sayacı: sayfaların TOPLAM satırı; biçimsiz sayfa 0',
    sayfaSatirToplami([{ rowData: [1, 2] }, { rowData: [3] }, { rowData: 'x' }, null]) === 3 && sayfaSatirToplami('x') === 0);
  gunluk.length = 0;
  kapidanGecer(kapi, { adlar: ['a', 'b', 'c', 'd', 'e'] });
  const satir = tavanUyarilari();
  check('U8 aşımda TEK uyarı: uç + alan + sayı', satir.length === 1 && /SahteDenetleyici\.sahteUc adlar=5 > 3/.test(satir[0] ?? ''), js(satir));
  check('U9 uyarı KİMLİK taşımaz (kullanıcı kimliği / e-posta yok)',
    satir.length === 1 && !/kisi-gizli|gizli@ornek/.test(satir[0]), js(satir));
}

// ═══ M — tavanlar ölçülen meşru en büyüğün GENİŞ katı (canlı salt okuma 06.10) ═══
/** Tavan bu katın altına inerse meşru büyük teklif 413 alırdı (örneklem 12 teklif). */
const OLCULEN = {
  benzersizAd: 682, teklifKalemi: 527, firmaMarkaSatiri: 3_729, firmaSatiri: 23_056,
  sozlukTuru: 2, teklifSayfasi: 11, teklifSatiri: 1_829,
};
function mBlogu(): void {
  console.log('\n── M · tavanlar ölçülen meşru en büyüğün geniş katı ──');
  check(`M1 bulk-match ad tavanı ≥ 10 × ölçülen ${OLCULEN.benzersizAd}`, ESLESTIRME_AD_TAVANI >= 10 * OLCULEN.benzersizAd, String(ESLESTIRME_AD_TAVANI));
  check(`M2 teklif kalem tavanı ≥ 10 × ölçülen ${OLCULEN.teklifKalemi}`, TEKLIF_KALEM_TAVANI >= 10 * OLCULEN.teklifKalemi, String(TEKLIF_KALEM_TAVANI));
  check(`M3 kütüphane satır tavanı ≥ 5 × ölçülen ${OLCULEN.firmaMarkaSatiri}`, KUTUPHANE_SATIR_TAVANI >= 5 * OLCULEN.firmaMarkaSatiri, String(KUTUPHANE_SATIR_TAVANI));
  check(`M4 toplu iskonto tavanı ≥ 4 × ölçülen firma ${OLCULEN.firmaSatiri}`, TOPLU_ISKONTO_KIMLIK_TAVANI >= 4 * OLCULEN.firmaSatiri, String(TOPLU_ISKONTO_KIMLIK_TAVANI));
  check('M5 işçilik satır tavanı kütüphaneninkinden az değil (Excel yüklemesi)', ISCILIK_SATIR_TAVANI >= KUTUPHANE_SATIR_TAVANI);
  check('M6 parça boyu bağ parametresi sınırının çok altında ve > 0', TOPLU_ISKONTO_PARCA > 0 && TOPLU_ISKONTO_PARCA <= 5_000);
  check(`M8 sözlük türü tavanı ≥ 10 × ölçülen ${OLCULEN.sozlukTuru}`, ALIAS_TUR_TAVANI >= 10 * OLCULEN.sozlukTuru, String(ALIAS_TUR_TAVANI));
  check(`M9 teklif sayfa tavanı ≥ 10 × ölçülen ${OLCULEN.teklifSayfasi}`, TEKLIF_SAYFA_TAVANI >= 10 * OLCULEN.teklifSayfasi, String(TEKLIF_SAYFA_TAVANI));
  check(`M10 teklif satır tavanı ≥ 10 × ölçülen ${OLCULEN.teklifSatiri}`, TEKLIF_SATIR_TAVANI >= 10 * OLCULEN.teklifSatiri, String(TEKLIF_SATIR_TAVANI));
  // Ekleme uçlarında DTO'nun `@ArrayMaxSize`'ı da AYNI sabiti okumalı (tek kaynak):
  // ikisi ayrışırsa kapı 5.000'de keserken DTO başka sayıda keserdi.
  const dtoTavani = (dto: Function) => getMetadataStorage()
    .getTargetValidationMetadatas(dto, '', true, false)
    .find((m) => m.propertyName === 'rows' && m.name === 'arrayMaxSize')?.constraints?.[0];
  check('M7 ekleme tavanı 5.000 (değişmedi) ve iki DTO aynı sabiti okuyor',
    KUTUPHANE_EKLEME_SATIR_TAVANI === 5_000 && dtoTavani(AddLibraryRowsDto) === KUTUPHANE_EKLEME_SATIR_TAVANI
      && dtoTavani(CreateManualBrandDto) === KUTUPHANE_EKLEME_SATIR_TAVANI,
    js([dtoTavani(AddLibraryRowsDto), dtoTavani(CreateManualBrandDto)]));
}

// ═══ B — her hedef ucun meta verisi ═════════════════════════════════════════
const HEDEFLER: Array<{ ad: string; uc: Function; kurallar: Array<[string, number]> }> = [
  { ad: 'malzeme bulk-match', uc: MatchingController.prototype.bulkMatch,
    kurallar: [['materialNames', ESLESTIRME_AD_TAVANI], ['variantTags', VARYANT_ETIKET_TAVANI], ['units', ESLESTIRME_AD_TAVANI]] },
  { ad: 'işçilik bulk-match', uc: LaborMatchingController.prototype.bulkMatch,
    kurallar: [['laborNames', ESLESTIRME_AD_TAVANI], ['variantTags', VARYANT_ETIKET_TAVANI], ['units', ESLESTIRME_AD_TAVANI]] },
  { ad: 'kütüphane toplu iskonto', uc: LibraryController.prototype.bulkUpdateItems, kurallar: [['ids', TOPLU_ISKONTO_KIMLIK_TAVANI]] },
  { ad: 'kütüphane ızgara kaydı', uc: LibraryController.prototype.saveBrandSheets, kurallar: [['dirtyRows', KUTUPHANE_SATIR_TAVANI]] },
  { ad: 'kütüphane elle marka', uc: LibraryController.prototype.createManualBrand, kurallar: [['rows', KUTUPHANE_EKLEME_SATIR_TAVANI]] },
  { ad: 'kütüphane satır ekleme', uc: LibraryController.prototype.addRowsToBrandList, kurallar: [['rows', KUTUPHANE_EKLEME_SATIR_TAVANI]] },
  { ad: 'işçilik toplu fiyat güncelleme', uc: LaborFirmsController.prototype.bulkUpdatePriceItems, kurallar: [['items', ISCILIK_SATIR_TAVANI]] },
  { ad: 'işçilik ızgara kaydı', uc: LaborFirmsController.prototype.savePriceListSheets, kurallar: [['dirtyRows', ISCILIK_SATIR_TAVANI]] },
  { ad: 'işçilik toplu kayıt', uc: LaborFirmsController.prototype.saveBulkPrices, kurallar: [['items', ISCILIK_SATIR_TAVANI]] },
  { ad: 'işçilik sayfalardan kayıt', uc: LaborFirmsController.prototype.saveFromSheets,
    kurallar: [['sheets', ISCILIK_SAYFA_TAVANI], ['sheets', ISCILIK_SATIR_TAVANI]] },
  { ad: 'teklif oluştur', uc: QuotesController.prototype.create,
    kurallar: [['items', TEKLIF_KALEM_TAVANI], ['sheets', TEKLIF_SAYFA_TAVANI], ['sheets', TEKLIF_SATIR_TAVANI]] },
  { ad: 'teklif güncelle', uc: QuotesController.prototype.update,
    kurallar: [['items', TEKLIF_KALEM_TAVANI], ['sheets', TEKLIF_SAYFA_TAVANI], ['sheets', TEKLIF_SATIR_TAVANI]] },
  { ad: 'sözlük kaydı', uc: MatchingController.prototype.saveAlias, kurallar: [['kinds', ALIAS_TUR_TAVANI]] },
];

function bBlogu(): void {
  console.log('\n── B · hedef uçların meta verisinde kapı + doğru kural ──');
  for (const h of HEDEFLER) {
    const kapilar: unknown[] = Reflect.getMetadata(GUARDS_METADATA, h.uc) ?? [];
    const kapi = kapilar.find((k): k is DiziTavaniKapisi => k instanceof DiziTavaniKapisi);
    const gercek = (kapi?.kurallar ?? []).map((k) => [k.alan, k.tavan]);
    check(`B ${h.ad}: kapı var, kurallar ${js(h.kurallar)}`, js(gercek) === js(h.kurallar), js(gercek));
  }
}

// ═══ H — gerçek denetleyiciler HTTP üzerinden ═══════════════════════════════
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
class OlcumQuotes extends QuotesController {}
for (const s of [OlcumLibrary, OlcumMatching, OlcumLaborMatching, OlcumLaborFirms, OlcumQuotes]) {
  Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], s);
}
const sahteKur = {
  getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'sahte', date: '' }),
};
/** Teklif servisi taklidi: yalnız çağrıyı sayar (kapı servisten ÖNCE mi?). */
const teklifCagrilari: Array<{ kalem: number; id?: string }> = [];
const sahteTeklif = {
  create: async (_k: unknown, dto: any, id?: string) => {
    teklifCagrilari.push({ kalem: Array.isArray(dto?.items) ? dto.items.length : -1, id });
    return { id: id ?? 'q-yeni' };
  },
};

interface Yanit { durum: number; veri: any }
const MARKA = 'marka-1';
const MARKA_B = 'marka-b';
const ISCILIK_FIRMASI = 'isc-a';
const LISTE = 'lpl-a';

async function dunyaKur() {
  const db: BellekPrisma = bellekPrisma();
  const p = db.istemci;
  await p.firma.create({ data: { id: KISI.firmaId, ad: KISI.firmaId } });
  await p.firma.create({ data: { id: 'firma-b', ad: 'firma-b' } });
  await p.user.create({ data: { id: KISI.id, email: 'a1@ornek.test', password: 'x', firmaId: KISI.firmaId } });
  await p.user.create({ data: { id: 'kisi-b1', email: 'b1@ornek.test', password: 'x', firmaId: 'firma-b' } });
  await p.brand.create({ data: { id: MARKA, name: 'Olcum Marka' } });
  await p.brand.create({ data: { id: MARKA_B, name: 'B Marka' } });
  await p.laborFirm.create({ data: { id: ISCILIK_FIRMASI, name: 'Olcum Iscilik', discipline: 'mechanical', userId: KISI.id, firmaId: KISI.firmaId } });
  await p.laborPriceList.create({ data: { id: LISTE, name: 'Liste A', firmaId: ISCILIK_FIRMASI } });

  // Dizi biçimli işlem çağrılarını say (toplu iskonto TEK işlem mi?) ve işleme
  // giren öğeleri tut: gerçek Prisma dizide YALNIZ kendi sözlerini (PrismaPromise)
  // kabul eder — `async` sarmalı söz "All elements … Prisma Client promises"
  // hatası verir. bellek-prisma bunu ayırt etmez; kimlik karşılaştırması eder (P5b).
  const islemler: string[] = [];
  const islemOgeleri: unknown[] = [];
  const updateManyDonusleri: unknown[] = [];
  const izli = new Proxy(p, {
    get(hedef: any, anahtar: string | symbol) {
      if (anahtar === '$transaction') {
        const asil = hedef.$transaction;
        return (x: any) => {
          islemler.push(Array.isArray(x) ? `dizi:${x.length}` : 'islev');
          if (Array.isArray(x)) islemOgeleri.push(...x);
          return asil(x);
        };
      }
      if (anahtar === 'userLibrary') {
        const temsilci = hedef.userLibrary;
        return new Proxy(temsilci, {
          get(t: any, k: string | symbol) {
            if (k !== 'updateMany') return t[k];
            return (...a: unknown[]) => {
              const soz = t.updateMany(...a);
              updateManyDonusleri.push(soz);
              return soz;
            };
          },
        });
      }
      return hedef[anahtar];
    },
  });

  @Module({
    controllers: [OlcumLibrary, OlcumMatching, OlcumLaborMatching, OlcumLaborFirms, OlcumQuotes],
    providers: [
      LibraryService, MatchingService, LaborMatchingService, TerminologyService, LaborFirmsService, ExcelGridService,
      { provide: PrismaService, useValue: izli },
      { provide: ExchangeRatesService, useValue: sahteKur },
      { provide: QuotesService, useValue: sahteTeklif },
    ],
  })
  class DunyaModulu {}

  const app = await NestFactory.create<NestExpressApplication>(DunyaModulu, { logger: yakalayici });
  // main.ts ile AYNI gövde ayrıştırıcısı (50 MB). ⚠ OLMAZSA Nest'in varsayılanı
  // (100 KB) büyük gövdeyi KAPIYA ULAŞMADAN 413'le reddeder — ilk kırmızı koşuda
  // tam olarak bu oldu ("request entity too large"), sayı dizisi testi yanlış
  // nedenle geçti.
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // main.ts ile AYNI
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const istek = async (yontem: string, yol: string, govde?: unknown, kimlikli = true): Promise<Yanit> => {
    const r = await fetch(`http://127.0.0.1:${port}/api${yol}`, {
      method: yontem,
      headers: { ...(kimlikli ? { 'x-test-kim': 'a1' } : {}), 'content-type': 'application/json' },
      body: govde !== undefined ? JSON.stringify(govde) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const metin = await r.text();
    let veri: any = null;
    try { veri = JSON.parse(metin); } catch { veri = metin; }
    return { durum: r.status, veri };
  };
  return { db, app, istek, islemler, islemOgeleri, updateManyDonusleri };
}

/** Servise ulaşıldı mı: prototip yöntemini sayan casus (her çağrıda +1). */
function casus(proto: any, yontem: string): { sayi: () => number; geriAl: () => void } {
  const asil = proto[yontem];
  let n = 0;
  proto[yontem] = function (this: unknown, ...a: unknown[]) { n++; return asil.apply(this, a); };
  return { sayi: () => n, geriAl: () => { proto[yontem] = asil; } };
}

async function hBlogu(): Promise<void> {
  console.log('\n── H · gerçek denetleyiciler: 413 ValidationPipe\'tan önce, servis çağrılmaz ──');
  const d = await dunyaKur();
  try {
    const durumVeMesaj = (y: Yanit, tavan: number, gelen: number) =>
      y.durum === 413 && typeof y.veri?.message === 'string'
        && y.veri.message.includes(tavan.toLocaleString('tr-TR')) && y.veri.message.includes(gelen.toLocaleString('tr-TR'));

    // FIXTURE: büyük gövde ayrıştırıcıdan geçiyor mu (yoksa her 413 ayrıştırıcının olurdu)
    teklifCagrilari.length = 0;
    const buyukGovde = await d.istek('POST', '/quotes', {
      title: 'x'.repeat(2_000_000), items: [{ materialName: 'Vana', quantity: 1 }],
    });
    check('H0 FIXTURE: 2 MB gövde ayrıştırıcıdan geçip servise ulaşır (main.ts gibi 50 MB)',
      buyukGovde.durum !== 413 && teklifCagrilari.length === 1, js({ d: buyukGovde.durum, c: teklifCagrilari }));

    // Malzeme bulk-match
    const eslestir = casus(MatchingService.prototype, 'bulkMatch');
    const fazlaAd = ESLESTIRME_AD_TAVANI + 1;
    gunluk.length = 0;
    let y = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: dizi(fazlaAd, (i) => `Vana DN${i}`) });
    check('H1 ⭐ malzeme bulk-match: tavan+1 ad → 413 + mesaj', durumVeMesaj(y, ESLESTIRME_AD_TAVANI, fazlaAd), js({ d: y.durum, m: y.veri?.message }));
    check('H1b eşleştirme servisi ÇAĞRILMADI', eslestir.sayi() === 0, `cagri=${eslestir.sayi()}`);
    check('H1c tek kimliksiz uyarı: uç + alan + sayı',
      tavanUyarilari().length === 1 && tavanUyarilari()[0].includes(`bulkMatch materialNames=${fazlaAd} > ${ESLESTIRME_AD_TAVANI}`)
        && !/kisi-a1|a1@ornek/.test(tavanUyarilari()[0]), js(tavanUyarilari()));
    y = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: dizi(fazlaAd, (i) => i) });
    check('H2 ⭐ SAYI dizisi de KAPININ 413\'ü (400 DEĞİL): kapı ValidationPipe\'tan ÖNCE',
      durumVeMesaj(y, ESLESTIRME_AD_TAVANI, fazlaAd), js({ d: y.durum, m: y.veri?.message }));
    y = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25'], variantTags: dizi(VARYANT_ETIKET_TAVANI + 1, (i) => `t${i}`) });
    check('H3 variantTags tavan+1 → 413', durumVeMesaj(y, VARYANT_ETIKET_TAVANI, VARYANT_ETIKET_TAVANI + 1), `durum=${y.durum}`);
    const birimler: Record<string, string> = {};
    for (let i = 0; i <= ESLESTIRME_AD_TAVANI; i++) birimler[`ad${i}`] = 'adet';
    y = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25'], units: birimler });
    check('H4 units anahtarı tavan+1 → 413', durumVeMesaj(y, ESLESTIRME_AD_TAVANI, ESLESTIRME_AD_TAVANI + 1), `durum=${y.durum}`);
    check('H4b eşleştirme servisi hâlâ ÇAĞRILMADI', eslestir.sayi() === 0, `cagri=${eslestir.sayi()}`);
    y = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: ['Vana DN25', 'Boru 1"'] });
    check('H5 BAĞLANTI: olağan istek kapıdan geçer, servise ulaşır (200)', y.durum === 200 || y.durum === 201, `durum=${y.durum}`);
    check('H5b servis bir kez çağrıldı', eslestir.sayi() === 1, `cagri=${eslestir.sayi()}`);
    eslestir.geriAl();

    // İşçilik bulk-match
    const iscilikEslestir = casus(LaborMatchingService.prototype, 'bulkMatch');
    y = await d.istek('POST', '/labor-matching/bulk-match', { firmaId: ISCILIK_FIRMASI, laborNames: dizi(fazlaAd, (i) => `Montaj ${i}`) });
    check('H6 işçilik bulk-match: tavan+1 ad → 413, servis çağrılmadı',
      durumVeMesaj(y, ESLESTIRME_AD_TAVANI, fazlaAd) && iscilikEslestir.sayi() === 0, `durum=${y.durum} cagri=${iscilikEslestir.sayi()}`);
    iscilikEslestir.geriAl();

    // Kütüphane ızgara kaydı (satır içi tip — ValidationPipe atlanır)
    const kutuphaneKayit = casus(LibraryService.prototype, 'saveBrandSheets');
    y = await d.istek('POST', `/library/brand/${MARKA}/save-sheets`, { dirtyRows: dizi(KUTUPHANE_SATIR_TAVANI + 1, (i) => ({ libraryItemId: `x${i}` })) });
    check('H7 kütüphane ızgara kaydı: tavan+1 satır → 413, servis çağrılmadı',
      durumVeMesaj(y, KUTUPHANE_SATIR_TAVANI, KUTUPHANE_SATIR_TAVANI + 1) && kutuphaneKayit.sayi() === 0, `durum=${y.durum}`);
    y = await d.istek('POST', `/library/brand/${MARKA}/save-sheets`, { dirtyRows: [] });
    check('H7b BAĞLANTI: olağan kayıt servise ulaşır', (y.durum === 200 || y.durum === 201) && kutuphaneKayit.sayi() === 1, `durum=${y.durum}`);
    kutuphaneKayit.geriAl();

    // Kütüphane toplu iskonto
    y = await d.istek('POST', '/library/bulk-update-items', { ids: dizi(TOPLU_ISKONTO_KIMLIK_TAVANI + 1, (i) => `id${i}`), discountRate: 10 });
    check('H8 toplu iskonto: tavan+1 kimlik → 413', durumVeMesaj(y, TOPLU_ISKONTO_KIMLIK_TAVANI, TOPLU_ISKONTO_KIMLIK_TAVANI + 1), `durum=${y.durum}`);

    // Teklif oluştur / güncelle (iç içe DTO: pipe önce koşsaydı boş nesneler 400 verirdi)
    teklifCagrilari.length = 0;
    y = await d.istek('POST', '/quotes', { items: dizi(TEKLIF_KALEM_TAVANI + 1, () => ({})) });
    check('H9 ⭐ teklif oluştur: tavan+1 (geçersiz) kalem → 413, 400 DEĞİL', durumVeMesaj(y, TEKLIF_KALEM_TAVANI, TEKLIF_KALEM_TAVANI + 1), `durum=${y.durum}`);
    y = await d.istek('PUT', '/quotes/q-1', { items: dizi(TEKLIF_KALEM_TAVANI + 1, () => ({})) });
    check('H10 teklif güncelle: tavan+1 kalem → 413', durumVeMesaj(y, TEKLIF_KALEM_TAVANI, TEKLIF_KALEM_TAVANI + 1), `durum=${y.durum}`);
    check('H10b teklif servisi hiç çağrılmadı', teklifCagrilari.length === 0, js(teklifCagrilari));
    y = await d.istek('POST', '/quotes', { items: [{ materialName: 'Vana', quantity: 1, unit: 'adet', unitPrice: 10 }] });
    check('H11 BAĞLANTI: olağan teklif servise ulaşır (1 kalem)', teklifCagrilari.length === 1 && teklifCagrilari[0].kalem === 1, js({ d: y.durum, c: teklifCagrilari, m: y.veri?.message }));

    // İşçilik: toplu kayıt (DTO) · toplu fiyat güncelleme · ızgara kaydı · sayfalardan kayıt
    const fazlaSatir = ISCILIK_SATIR_TAVANI + 1;
    y = await d.istek('POST', `/labor-firms/${ISCILIK_FIRMASI}/save-bulk`, { priceListId: 'new', items: dizi(fazlaSatir, () => ({})) });
    check('H12 işçilik toplu kayıt: tavan+1 → 413 (DTO doğrulamasından önce)', durumVeMesaj(y, ISCILIK_SATIR_TAVANI, fazlaSatir), `durum=${y.durum}`);
    y = await d.istek('POST', '/labor-firms/price-items/bulk-update', { items: dizi(fazlaSatir, (i) => ({ id: `x${i}` })) });
    check('H13 işçilik toplu fiyat güncelleme: tavan+1 → 413', durumVeMesaj(y, ISCILIK_SATIR_TAVANI, fazlaSatir), `durum=${y.durum}`);
    y = await d.istek('POST', `/labor-firms/price-lists/${LISTE}/save-sheets`, { dirtyRows: dizi(fazlaSatir, (i) => ({ laborPriceId: `x${i}` })) });
    check('H14 işçilik ızgara kaydı: tavan+1 → 413', durumVeMesaj(y, ISCILIK_SATIR_TAVANI, fazlaSatir), `durum=${y.durum}`);
    const ucSayfa = dizi(3, (s) => ({ name: `S${s}`, columnRoles: {}, rowData: dizi(s === 0 ? fazlaSatir - 2 * 5_000 : 5_000, () => ({})) }));
    y = await d.istek('POST', `/labor-firms/${ISCILIK_FIRMASI}/save-from-sheets`, { sheets: ucSayfa });
    check('H15 sayfalardan kayıt: sayfaların TOPLAM satırı tavan+1 → 413', durumVeMesaj(y, ISCILIK_SATIR_TAVANI, fazlaSatir), js({ d: y.durum, m: y.veri?.message }));
    y = await d.istek('POST', `/labor-firms/${ISCILIK_FIRMASI}/save-from-sheets`, { sheets: dizi(ISCILIK_SAYFA_TAVANI + 1, (s) => ({ name: `S${s}`, columnRoles: {}, rowData: [] })) });
    check('H16 sayfalardan kayıt: tavan+1 sayfa → 413', durumVeMesaj(y, ISCILIK_SAYFA_TAVANI, ISCILIK_SAYFA_TAVANI + 1), `durum=${y.durum}`);

    // İnceleme HIGH-1 (06.10): satır içi tipte METİN `dirtyRows` + `sheet` tavanı
    // atlatıyor, servis metni karakter karakter dolaşıyordu (4 MB → 4,6 sn duruş).
    const iscilikKayit = casus(LaborFirmsService.prototype, 'savePriceListSheets');
    y = await d.istek('POST', `/labor-firms/price-lists/${LISTE}/save-sheets`, {
      dirtyRows: 'A'.repeat(ISCILIK_SATIR_TAVANI + 1), sheet: { rowData: [], columnDefs: [], columnRoles: {} },
    });
    check('H14b ⭐ işçilik ızgara kaydı: METİN dirtyRows (+ sheet) → 400, servis çağrılmadı',
      y.durum === 400 && /bir liste olmalı/.test(String(y.veri?.message)) && iscilikKayit.sayi() === 0,
      js({ d: y.durum, m: y.veri?.message, c: iscilikKayit.sayi() }));
    iscilikKayit.geriAl();
    // İkinci kilit serviste: kapı atlansa da metin karakter karakter dolaşılmaz
    const iscilikServisi = d.app.get(LaborFirmsService);
    const ikinciKilit = await iscilikServisi.savePriceListSheets(
      { userId: KISI.id, firmaId: KISI.firmaId } as any, LISTE, 'abc' as any, { rowData: [], columnDefs: [], columnRoles: {} },
    );
    check('H14c servis METİN dirtyRows\'u dolaşmaz (ikinci kilit: 0 satır, 0 hata)',
      ikinciKilit.updated === 0 && ikinciKilit.errors.length === 0, js(ikinciKilit));

    // Kimlik kapısı tavandan ÖNCE koşar: kimliksiz aşan istek 403, uyarı yazılmaz
    gunluk.length = 0;
    y = await d.istek('POST', '/matching/bulk-match', { brandId: MARKA, materialNames: dizi(fazlaAd, (i) => `Vana ${i}`) }, false);
    check('H17 kimliksiz + tavanı aşan istek 403 (413 DEĞİL), tavan uyarısı YOK',
      y.durum === 403 && tavanUyarilari().length === 0, js({ d: y.durum, g: tavanUyarilari() }));

    // İnceleme HIGH-2 (06.10): kütüphaneye satır ekleyen iki uç (DTO `@ArrayMaxSize`
    // pipe'ta bütün diziyi kurduktan SONRA reddediyordu)
    const elleMarka = casus(LibraryService.prototype, 'createManualBrand');
    const satirEkle = casus(LibraryService.prototype, 'addRowsToBrandList');
    const fazlaEkleme = KUTUPHANE_EKLEME_SATIR_TAVANI + 1;
    y = await d.istek('POST', '/library/manual-brand', { brandName: 'Yeni Marka', rows: dizi(fazlaEkleme, () => ({})) });
    check('H18 elle marka: tavan+1 (geçersiz) satır → 413 (400 DEĞİL), servis çağrılmadı',
      durumVeMesaj(y, KUTUPHANE_EKLEME_SATIR_TAVANI, fazlaEkleme) && elleMarka.sayi() === 0, js({ d: y.durum, m: y.veri?.message }));
    y = await d.istek('POST', `/library/brand/${MARKA}/rows`, { listId: 'new', rows: dizi(fazlaEkleme, () => ({})) });
    check('H19 satır ekleme: tavan+1 satır → 413, servis çağrılmadı',
      durumVeMesaj(y, KUTUPHANE_EKLEME_SATIR_TAVANI, fazlaEkleme) && satirEkle.sayi() === 0, js({ d: y.durum, m: y.veri?.message }));
    y = await d.istek('POST', `/library/brand/${MARKA}/rows`, { listId: 'new', rows: dizi(KUTUPHANE_EKLEME_SATIR_TAVANI, () => ({})) });
    check('H20 SINIR: tam tavan kadar satır kapıdan geçer, DTO doğrular (geçersiz satır 400), servis yok',
      y.durum === 400 && satirEkle.sayi() === 0, js({ d: y.durum, m: String(y.veri?.message).slice(0, 80) }));
    elleMarka.geriAl();
    satirEkle.geriAl();

    // Güvenlik HIGH-2 (06.10): sözlük kaydı `kinds` sınırsız DEPOYA yazılıyordu
    const sozluk = casus(TerminologyService.prototype, 'saveUserAlias');
    y = await d.istek('POST', '/matching/aliases', { alias: 'ozel terim', kinds: dizi(ALIAS_TUR_TAVANI + 1, (i) => `t${i}`) });
    check('H21 sözlük: tavan+1 tür → 413, servis çağrılmadı',
      durumVeMesaj(y, ALIAS_TUR_TAVANI, ALIAS_TUR_TAVANI + 1) && sozluk.sayi() === 0, js({ d: y.durum, m: y.veri?.message }));
    y = await d.istek('POST', '/matching/aliases', { alias: 'ozel terim', kinds: 'pvc' });
    check('H22 sözlük: METİN kinds → 400 (kapının değişmezi), servis çağrılmadı', y.durum === 400 && sozluk.sayi() === 0, `durum=${y.durum}`);
    y = await d.istek('POST', '/matching/aliases', { alias: 'ozel terim', kinds: [5] });
    check('H23 sözlük: metin olmayan tür → 400 (DTO), servis çağrılmadı', y.durum === 400 && sozluk.sayi() === 0, `durum=${y.durum}`);
    const onYuzGovdesi = { alias: 'pis su hatti', canonical: 'PVC Boru', kinds: ['pvc', 'boru'], sizeClass: 'plastic', impliedType: null };
    y = await d.istek('POST', '/matching/aliases', onYuzGovdesi);
    check('H24 BAĞLANTI: ön yüzün gönderdiği gövde servise TÜM alanlarıyla ulaşır',
      (y.durum === 200 || y.durum === 201) && sozluk.sayi() === 1 && y.veri?.ok === true
        && d.db.tablo('TerminologyAlias').some((t) => js(t.kinds) === js(['pvc', 'boru']) && t.sizeClass === 'plastic' && t.canonical === 'PVC Boru'),
      js({ d: y.durum, v: y.veri, c: sozluk.sayi() }));
    sozluk.geriAl();

    // Güvenlik MEDIUM-1 (06.10): teklif `sheets` `items` tavanlıyken tavansızdı
    teklifCagrilari.length = 0;
    const sayfa = (n: number) => ({ name: 'S', index: 0, columnDefs: [], columnRoles: {}, headerEndRow: 0, isEmpty: false, rowData: dizi(n, () => ({})) });
    y = await d.istek('POST', '/quotes', { items: [], sheets: dizi(TEKLIF_SAYFA_TAVANI + 1, () => sayfa(0)) });
    check('H25 teklif: tavan+1 sayfa → 413', durumVeMesaj(y, TEKLIF_SAYFA_TAVANI, TEKLIF_SAYFA_TAVANI + 1), js({ d: y.durum, m: y.veri?.message }));
    y = await d.istek('PUT', '/quotes/q-1', { items: [], sheets: [sayfa(10_000), sayfa(10_000), sayfa(1)] });
    check('H26 teklif: sayfaların TOPLAM satırı tavan+1 → 413', durumVeMesaj(y, TEKLIF_SATIR_TAVANI, TEKLIF_SATIR_TAVANI + 1), js({ d: y.durum, m: y.veri?.message }));
    check('H26b teklif servisi çağrılmadı', teklifCagrilari.length === 0, js(teklifCagrilari));
    y = await d.istek('POST', '/quotes', { items: [{ materialName: 'Vana', quantity: 1 }], sheets: dizi(OLCULEN.teklifSayfasi, () => sayfa(166)) });
    check('H27 BAĞLANTI: ölçülen en büyük teklif kadar ızgara (11 sayfa, 1.826 satır) servise ulaşır',
      teklifCagrilari.length === 1, js({ d: y.durum, c: teklifCagrilari, m: y.veri?.message }));
  } finally {
    await d.app.close();
  }
}

// ═══ P — toplu iskonto: parça parça, tek işlem, firma süzgeçli ═════════════
async function pBlogu(): Promise<void> {
  console.log('\n── P · toplu iskonto 1.000\'lik parçalarla, TEK işlemde ──');
  const d = await dunyaKur();
  try {
    const p = d.db.istemci;
    const N = 2_500;
    for (let i = 0; i < N; i++) {
      await p.userLibrary.create({ data: { id: `ul-a-${i}`, userId: KISI.id, firmaId: KISI.firmaId, brandId: MARKA, materialName: `Malzeme ${i}`, discountRate: 0 } });
    }
    for (let i = 0; i < 3; i++) {
      await p.userLibrary.create({ data: { id: `ul-b-${i}`, userId: 'kisi-b1', firmaId: 'firma-b', brandId: MARKA_B, materialName: `B ${i}`, discountRate: 5 } });
    }
    const ids = [...dizi(N, (i) => `ul-a-${i}`), ...dizi(3, (i) => `ul-b-${i}`)];
    d.db.izler.length = 0;
    d.islemler.length = 0;
    const y = await d.istek('POST', '/library/bulk-update-items', { ids, discountRate: 12 });
    const parcalar = d.db.izler.filter((z) => z.model === 'UserLibrary' && z.islem === 'updateMany').map((z: any) => z.args);
    check('P1 yanıt firmanın 2.500 satırını sayar', y.veri?.updated === N && y.veri?.discountRate === 12, js(y.veri));
    check(`P2 ${Math.ceil(ids.length / TOPLU_ISKONTO_PARCA)} parça, hiçbiri ${TOPLU_ISKONTO_PARCA}'den büyük değil`,
      parcalar.length === Math.ceil(ids.length / TOPLU_ISKONTO_PARCA)
        && parcalar.every((a: any) => a.where.id.in.length <= TOPLU_ISKONTO_PARCA), js(parcalar.map((a: any) => a.where.id.in.length)));
    check('P3 parçalar kimliklerin HEPSİNİ bir kez kapsar',
      js(parcalar.flatMap((a: any) => a.where.id.in).sort()) === js([...ids].sort()));
    check('P4 her parça firma süzgeçli', parcalar.every((a: any) => a.where.firmaId === KISI.firmaId), js(parcalar.map((a: any) => a.where.firmaId)));
    check('P5 TEK dizi işlemi (Prisma\'da tek veritabanı işlemi)', js(d.islemler) === js([`dizi:${parcalar.length}`]), js(d.islemler));
    check('P5b işleme giren öğeler `updateMany`nin KENDİ sözleri (async sarmalı gerçek Prisma\'da patlar)',
      d.islemOgeleri.length === parcalar.length && d.islemOgeleri.every((o) => d.updateManyDonusleri.includes(o)),
      `oge=${d.islemOgeleri.length} donus=${d.updateManyDonusleri.length}`);
    const tablo = d.db.tablo('UserLibrary');
    check('P6 firmanın satırları yazıldı', tablo.filter((r) => r.firmaId === KISI.firmaId).every((r) => r.discountRate === 12));
    check('P7 BAŞKA firmanın satırına dokunulmadı', tablo.filter((r) => r.firmaId === 'firma-b').every((r) => r.discountRate === 5));
    d.db.izler.length = 0;
    const bos = await d.istek('POST', '/library/bulk-update-items', { ids: [], discountRate: 3 });
    check('P8 boş dizi: 0 güncelleme, sorgu yok', bos.veri?.updated === 0
      && d.db.izler.filter((z) => z.islem === 'updateMany').length === 0, js(bos.veri));
    // Tekrar eden kimlik parça sınırına düşse de İKİ kez sayılmaz (eski tek `in` gibi)
    d.db.izler.length = 0;
    const tekrarli = [...dizi(N, (i) => `ul-a-${i}`), ...dizi(10, (i) => `ul-a-${i}`)];
    const t = await d.istek('POST', '/library/bulk-update-items', { ids: tekrarli, discountRate: 7 });
    const tParca = d.db.izler.filter((z) => z.model === 'UserLibrary' && z.islem === 'updateMany').map((z: any) => z.args.where.id.in);
    check('P9 tekrarlı kimlik bir kez sayılır ve bir kez yazılır', t.veri?.updated === N
      && new Set(tParca.flat()).size === tParca.flat().length, js({ u: t.veri?.updated, parca: tParca.map((x) => x.length) }));
  } finally {
    await d.app.close();
  }
}

// ═══ Y — depodaki sözlük türleri bulk-match'te YAYILMAZ (güvenlik HIGH-2) ═══
function yBlogu(): void {
  console.log('\n── Y · sözlük türleri argüman olarak yayılmaz ──');
  const kaynak = fs.readFileSync(path.resolve(__dirname, '../src/ozellik/eslestirme/matching/matching.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('Y1 FIXTURE: eşleştirme servisi malzeme etiketlerini çağırıyor (ölçüt boş dosyada geçmesin)',
    (kaynak.match(/malzemeEtiketleri\(/g) ?? []).length >= 2);
  check('Y2 hiçbir çağrı diziyi YAYMIYOR (`malzemeEtiketleri(...`)', !/malzemeEtiketleri\(\s*\.\.\./.test(kaynak));
  const ornekler = [['pvc'], ['pp', '', 'pvc'], ['  ', 'bakir'], [], ['paslanmaz celik', 'pirinc']];
  check('Y3 birleşik metin yaymayla AYNI etiketleri verir',
    ornekler.every((k) => js(malzemeEtiketleri(k.join(' '))) === js(malzemeEtiketleri(...k))));
  let hata = '';
  try { malzemeEtiketleri(dizi(200_000, () => 'pvc').join(' ')); } catch (e) { hata = String(e); }
  check('Y4 200 bin türlü kayıt birleşik metinle yığını taşırmaz', hata === '', hata);
}

bitmezseKirmizi((async () => {
  uBlogu();
  mBlogu();
  bBlogu();
  yBlogu();
  await hBlogu();
  await pBlogu();
  console.log(`\n${'='.repeat(64)}\nDIZI TAVANI: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(64)}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
