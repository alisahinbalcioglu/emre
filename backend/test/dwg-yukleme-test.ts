/**
 * DWG YUKLEME — KAPI · `npm run test:dwg-yukleme` (26.09.2026)
 *
 * AG ve DB GEREKTIRMEZ: GERCEK `DwgEngineController` + GERCEK `DwgEngineService`
 * 127.0.0.1'de Nest+Express olarak kalkar; DWG motoru yerine SUREC ICI taklit
 * HTTP sunucusu durur: gelen cok parcali govdeyi busboy ile AKARAK ayristirir,
 * dosya parcasinin sha256'sini, bayt sayisini, adini ve Content-Length'i kaydeder.
 * Istemci GERCEK `fetch` ile akarak yukler (bellekte yalniz 1 MB'lik blok) ve
 * gerektiginde GERCEKTEN kopar. Kapilar (JWT/erisim) olcum disi: sinif duzeyi
 * kapilar bir test kapisiyla GOLGELENIR (firma `x-test-firma` basligindan);
 * yontem duzeyi `DwgYuklemeKapisi` GERCEK sinifin ust verisinden miras kosar.
 * Gecici dizin (TMPDIR/TEMP/TMP) teste ozel dizine yonlendirilir.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * `/dwg-engine/upload` multer memoryStorage (1 GB sinir) + motora Blob kopyasi
 * kullaniyordu: istek basina govdenin iki kati (~2 GB) bellekte. Kenarda (Caddy)
 * govde siniri, DWG uclarinda hiz/es zamanlilik siniri yoktu. Olculdu (26.09):
 * gercek DWG'ler p99 63 MB, en buyuk 98,8 MB → tavan 250 MB.
 * Motor tarafi: `python/tests/test_olay_dongusu.py` D4 + Y1-Y3.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   C  Caddy tavanlari Nest'le TUTARLI: DWG yolu ≥ Nest tavani + zarf payi (ve makul
 *      ustu), diger /api ≥ 50 MB JSON siniri. Birim tuzagi: Caddy "MB" SI'dir,
 *      "260MB" Nest'in 250 MiB'inden KUCUK (olcut kendini sinar).
 *   M  YAPI: /upload'da `DwgYuklemeKapisi` (sinif kapilarindan SONRA, multer'dan ONCE)
 *   G  kapi birimi: tavan sinirinda kabul, +1 bayt 413 (yer alinmaz) · firma basina
 *      2 · yer 'close'da TAM BIR KEZ geri · kopmus yanitta yer alinmaz · uzunluksuz gecer
 *   S  ⭐ AKIS: 200 MB motora BAYTI BAYTINA (sha256), Content-Length'li gider; UTF-8
 *      Turkce ad motora ve sahiplik kaydina DOGRU (multer latin1 cozuyordu); govde
 *      bellekte TUTULMAZ (zorla GC sonrasi canli ArrayBuffer: motor OKUMAZKEN bir sonda —
 *      ileri okuma/tam kopya — ve iletimin %25/50/75/95'inde dort sonda); gecici dosya
 *      silinir. Kapinin ilk kosusu bir tuzak buldu: undici akis govdeli istegi yonlendirme
 *      icin klonlayip `tee()`liyor, okunmayan kol govdenin TAMAMINI biriktiriyordu
 *      (+200 MB) — `redirect: 'error'` + `window: null` klonu kapatir
 *   O  ⭐ ON DENETIM: Content-Length tavani asiyorsa govde okunmadan 413 (Turkce),
 *      motora 0 istek, diske 0 parca, yer alinmaz
 *   E  ⭐ FIRMA BASINA ES ZAMANLILIK: A'nin 2 yuklemesi surerken ucuncusu 429 (govdesi
 *      diske yazilmaz, motora gitmez); B etkilenmez; bitince A yeniden yukler; sayac 0
 *   A  ⭐ ISTEMCI KOPMASI: yukleme ortasinda kopan istemcinin yarim parcasi silinir,
 *      yeri geri verilir, motora istek gitmez, gunluge tek sessiz satir (ERROR yok);
 *      ardindan normal yukleme calisir (multer 2.0.2 kopmada busboy'u kapatmaz —
 *      kesim olmasa yazim hic bitmezdi)
 *   K  ⭐ ILETIM SURERKEN KOPMA (inceleme L1): istemci motora iletim surerken koparsa
 *      motor istegi kesilir ve yeniden denenmez — kapi yeri geri verdiginde yetim
 *      250 MB'lik iletim suruyor, kimsenin yoklamadigi is kuyruga giriyordu
 *   H  motor hatasi (500): tek yeniden deneme dosyayi diskten BASTAN akitir (iki
 *      istek de tam ve ayni), 503 metni motorun `detail`i, gecici dosya silinir;
 *      motor 429 (hat dolu) → 503, yeniden deneme yok; iletim ORTASINDA zaman
 *      asiminda yeniden deneme dosyayi bastan ve eksiksiz akitir
 *   L  tavan SINIRI: tam 250 MiB gecer (busboy esitlikte de 'limit' yayar — sinir
 *      +1), tavan + 1 bayt uzunluksuz govde 413
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 * ⚠ `process.exit` YOK: Windows'ta acik fetch soketiyle `process.exit(1)`
 * sureci 0xC0000409 ile cokertiyor. Basarisizlik `process.exitCode = 1`.
 */
import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, request as httpIstegi, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import {
  ForbiddenException, HttpException, Module, PayloadTooLargeException,
  type ExecutionContext, type LoggerService,
} from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../src/altyapi/auth/guards/jwt-auth.guard';
import { ErisimGuard } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { DwgEngineController } from '../src/modules/dwg-engine/dwg-engine.controller';
import { DwgEngineService } from '../src/modules/dwg-engine/dwg-engine.service';
import { DwgSahiplikServisi } from '../src/modules/dwg-engine/dwg-sahiplik.servisi';
import { dwgGeciciDizin, yuklenenDosyaAdi } from '../src/modules/dwg-engine/dwg-gecici-depo';
import {
  DWG_YUKLEME_AZAMI_BAYT, DWG_YUKLEME_COK_BUYUK_MESAJI, DWG_YUKLEME_SURUYOR_MESAJI,
  DWG_YUKLEME_ZARF_PAYI_BAYT, DwgYuklemeKapisi, FIRMA_BASINA_ES_ZAMANLI_YUKLEME, firmaYuklemeleri,
} from '../src/modules/dwg-engine/dwg-yukleme-kapisi';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

// busboy'un tipi kurulu degil (@types/busboy yok): yalniz kullanilan yuzey.
type BusboyAkisi = NodeJS.WritableStream & {
  on(olay: 'file', dinleyici: (ad: string, akis: NodeJS.ReadableStream, bilgi: { filename: string }) => void): BusboyAkisi;
  on(olay: 'close' | 'error', dinleyici: (e?: Error) => void): BusboyAkisi;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const Busboy = require('busboy') as (ayar: { headers: IncomingMessage['headers']; defParamCharset?: string }) => BusboyAkisi;

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

setFlagsFromString('--expose-gc');
const gcZorla = runInNewContext('gc') as () => void;

const yakalanmamis: string[] = [];
process.on('uncaughtException', (e: any) => void yakalanmamis.push(String(e?.message ?? e)));

const MB = 1024 * 1024;
const uyu = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function bekle(kosul: () => boolean, ms: number): Promise<boolean> {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    if (kosul()) return true;
    await uyu(10);
  }
  return kosul();
}

// ── Gecici dizin yalitimi: `os.tmpdir()` ortami her cagrida okur ────────────
const testGecici = mkdtempSync(join(tmpdir(), 'dwg-yukleme-test-'));
const oncekiOrtam = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
process.env.TMPDIR = testGecici;
process.env.TEMP = testGecici;
process.env.TMP = testGecici;
const parcalar = (): string[] => {
  const d = dwgGeciciDizin();
  return existsSync(d) ? readdirSync(d).filter((a) => a.endsWith('.part')) : [];
};

// ── Nest gunlugu ────────────────────────────────────────────────────────────
const gunluk: string[] = [];
const yakalayici: LoggerService = {
  log: (m: unknown) => void gunluk.push(`LOG ${String(m)}`),
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
};

// ── Taklit DWG motoru: cok parcali govdeyi akarak ayristirir ve kaydeder ────
type MotorKaydi = {
  yol: string; icerikUzunlugu: string | undefined; aktarimKodlamasi: string | undefined;
  alinanBayt: number; dosyaAdi: string | null; dosyaBayt: number; ozet: string | null;
  bitti: number | null; kesildi: number | null;
};
const motorKayitlari: MotorKaydi[] = [];
/** normal: okur + yanitlar · askida: okur, yanit bekletir · hata: 500 · yogun: 429 (hat dolu) ·
 *  yavas: govdeyi 20 ms'de bir parca okur, yanit vermez (32 MB iletim ~10 sn surer — K blogu;
 *  HIC okumayan taklit kopmayi goremiyordu: okunmayan govde kopmayi gizler) ·
 *  ilk-yarida-dur: ilk istegin govdesinin yarisini okuyup durur (zaman asimi → yeniden
 *  deneme), sonrakileri normal isler (H blogu). */
let motorKipi: 'normal' | 'askida' | 'hata' | 'yogun' | 'yavas' | 'ilk-yarida-dur' = 'normal';
let ilkYaridaDurKullanildi = false;
const bekleyenYanitlar: Array<() => void> = [];
/** S blogu: motorun aldigi her parcada cagrilir (iletim ilerlemesine bagli bellek sondasi). */
let motorVeriKancasi: ((kayit: MotorKaydi) => void) | null = null;
/** S blogu: motor gelen istegin govdesini bu kadar sure OKUMAZ (TCP geri basinci), sonra
 *  `motorBaslamadanKancasi` cagrilir ve okumaya baslar. */
let motorBaslamaGecikmesiMs = 0;
let motorBaslamadanKancasi: (() => void) | null = null;
const motor = createServer((req: IncomingMessage, res: ServerResponse) => {
  const kayit: MotorKaydi = {
    yol: req.url ?? '', icerikUzunlugu: req.headers['content-length'],
    aktarimKodlamasi: req.headers['transfer-encoding'], alinanBayt: 0, dosyaAdi: null, dosyaBayt: 0,
    ozet: null, bitti: null, kesildi: null,
  };
  motorKayitlari.push(kayit);
  res.on('close', () => {
    if (res.writableFinished) kayit.bitti = Date.now();
    else kayit.kesildi = Date.now();
  });
  if (motorKipi === 'yavas') {
    // Parca parca okur (kopmayi gorebilsin), yanit vermez: kapanisi yalniz Nest yapar.
    req.on('data', (p: Buffer) => {
      kayit.alinanBayt += p.length;
      req.pause();
      setTimeout(() => req.resume(), 20);
    });
    return;
  }
  const yaridaDur = motorKipi === 'ilk-yarida-dur' && !ilkYaridaDurKullanildi;
  if (yaridaDur) ilkYaridaDurKullanildi = true;
  const oku = () => {
    motorBaslamadanKancasi?.();
    req.on('data', (p: Buffer) => {
      kayit.alinanBayt += p.length;
      motorVeriKancasi?.(kayit);
      if (yaridaDur && kayit.alinanBayt >= Number(req.headers['content-length']) / 2) req.pause();
    });
    const bb = Busboy({ headers: req.headers, defParamCharset: 'utf8' });
    bb.on('file', (_ad, akis, bilgi) => {
      kayit.dosyaAdi = bilgi.filename;
      const h = createHash('sha256');
      akis.on('data', (p: Buffer) => { h.update(p); kayit.dosyaBayt += p.length; });
      akis.on('end', () => { kayit.ozet = h.digest('hex'); });
    });
    bb.on('close', () => {
      const yanitla = () => {
        res.setHeader('content-type', 'application/json');
        if (motorKipi === 'hata') {
          res.statusCode = 500;
          res.end(JSON.stringify({ detail: 'disk dolu (taklit)' }));
          return;
        }
        if (motorKipi === 'yogun') {
          res.statusCode = 429;
          res.end(JSON.stringify({ detail: 'DWG motoru su an cok sayida projeyi isliyor (taklit)' }));
          return;
        }
        res.end(JSON.stringify({ file_id: `taklit${motorKayitlari.indexOf(kayit)}`, status: 'processing' }));
      };
      if (motorKipi === 'askida') bekleyenYanitlar.push(yanitla);
      else yanitla();
    });
    bb.on('error', () => res.destroy());
    req.pipe(bb);
  };
  if (motorBaslamaGecikmesiMs) setTimeout(oku, motorBaslamaGecikmesiMs);
  else oku();
});

// ── Olcum denetleyicisi: GERCEK sinif, yalniz sinif duzeyi kapilar golgelenir ──
const sahiplikKayitlari: Array<{ yanit: unknown; firmaId: string; dosyaAdi?: string }> = [];
const testKapisi = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const firma = String(req.headers['x-test-firma'] ?? 'firma-a');
    req.user = { id: `kullanici-${firma}`, firmaId: firma };
    return true;
  },
};
class OlcumDenetleyicisi extends DwgEngineController {}
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumDenetleyicisi);

@Module({
  controllers: [OlcumDenetleyicisi],
  providers: [
    DwgEngineService,
    {
      provide: DwgSahiplikServisi,
      useValue: {
        dogrula: async () => undefined,
        kaydet: async (yanit: unknown, firmaId: string, _kullanici: string, dosyaAdi?: string) => {
          sahiplikKayitlari.push({ yanit, firmaId, dosyaAdi });
        },
      },
    },
  ],
})
class OlcumModulu {}

let nestPort = 0;

type YuklemeSecenegi = {
  firma?: string; ad?: string; blok?: Buffer; adet: number; uzunluksuz?: boolean;
  sinyal?: AbortSignal; blokArasiMs?: number;
  /** Dosyanin sonuna eklenecek baytlar (tavan +1 bayt gibi sinir denemeleri). */
  ek?: Buffer;
};
type Yanit = { durum: number | string; govde: string; sure: number };

/** Tarayici gibi cok parcali govde: UTF-8 ad, akarak (istemci bellegi = bir blok). */
async function yukle(s: YuklemeSecenegi): Promise<Yanit> {
  const blok = s.blok ?? Buffer.alloc(MB, 0x41);
  const sinir = `----dwgyuklemetest${randomBytes(8).toString('hex')}`;
  const bas = Buffer.from(
    `--${sinir}\r\nContent-Disposition: form-data; name="file"; filename="${s.ad ?? 'proje.dwg'}"\r\n`
      + 'Content-Type: application/octet-stream\r\n\r\n',
    'utf8',
  );
  const son = Buffer.from(`\r\n--${sinir}--\r\n`, 'utf8');
  async function* govde() {
    yield bas;
    for (let i = 0; i < s.adet; i++) {
      if (s.blokArasiMs) await uyu(s.blokArasiMs);
      yield blok;
    }
    if (s.ek?.length) yield s.ek;
    yield son;
  }
  const basliklar: Record<string, string> = {
    'content-type': `multipart/form-data; boundary=${sinir}`,
    'x-test-firma': s.firma ?? 'firma-a',
  };
  if (!s.uzunluksuz) {
    basliklar['content-length'] = String(bas.length + blok.length * s.adet + (s.ek?.length ?? 0) + son.length);
  }
  const bekci = new AbortController();
  const z = setTimeout(() => bekci.abort(new Error('BEKCI: 60 sn yanit yok')), 60_000);
  const t0 = Date.now();
  try {
    const r = await fetch(`http://127.0.0.1:${nestPort}/api/dwg-engine/upload`, {
      method: 'POST',
      body: Readable.toWeb(Readable.from(govde())) as unknown as BodyInit,
      duplex: 'half',
      headers: basliklar,
      signal: s.sinyal ? AbortSignal.any([s.sinyal, bekci.signal]) : bekci.signal,
    } as RequestInit);
    return { durum: r.status, govde: await r.text(), sure: Date.now() - t0 };
  } catch (e: any) {
    return { durum: bekci.signal.aborted ? 'BEKCI' : (e?.name ?? 'hata'), govde: '', sure: Date.now() - t0 };
  } finally {
    clearTimeout(z);
  }
}

function ozetle(blok: Buffer, adet: number): string {
  const h = createHash('sha256');
  for (let i = 0; i < adet; i++) h.update(blok);
  return h.digest('hex');
}

const mesaj = (govde: string): string => {
  try {
    return String((JSON.parse(govde) as { message?: unknown }).message ?? '');
  } catch {
    return '';
  }
};

// ── C: Caddy ↔ Nest tavan tutarliligi ───────────────────────────────────────

/** Caddy `max_size` → bayt (go-humanize): KB/MB/GB SI (10^n), KiB/MiB/GiB ikili (2^n). */
function caddyBoyutu(deger: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([KMGT]?)(i?)B?$/i.exec(deger.trim());
  if (!m) return Number.NaN;
  const us = ' KMGT'.indexOf(m[2].toUpperCase() || ' ');
  return Number(m[1]) * (m[3] ? 1024 : 1000) ** us;
}

function cBlogu(): void {
  console.log('\n── C) CADDY ↔ NEST tavan tutarliligi ──');
  check('C0-OLCUT birim tuzagi olculuyor: "260MB" (SI) Nest tavani + zarftan KUCUK, "260MiB" buyuk',
    caddyBoyutu('260MB') === 260e6 && caddyBoyutu('260MB') < DWG_YUKLEME_AZAMI_BAYT + DWG_YUKLEME_ZARF_PAYI_BAYT
      && caddyBoyutu('260MiB') === 260 * MB,
    `260MB=${caddyBoyutu('260MB')} 260MiB=${caddyBoyutu('260MiB')}`);

  const caddy = readFileSync(join(__dirname, '..', '..', 'Caddyfile'), 'utf8');
  const apiBas = caddy.indexOf('handle /api/* {');
  const vekil = caddy.indexOf('reverse_proxy backend:3001', apiBas);
  const blok = apiBas >= 0 && vekil > apiBas ? caddy.slice(apiBas, vekil) : '';
  check('C1-OLCUT /api/* blogu ve backend vekili bulundu', blok.length > 0, `apiBas=${apiBas} vekil=${vekil}`);

  const dwgYol = /@dwgYukleme\s+path\s+(\S+)/.exec(blok)?.[1];
  const digerYol = /@digerApi\s+not\s+path\s+(\S+)/.exec(blok)?.[1];
  check('C2 DWG eslestiricisi tam olarak Nest yukleme yolu (/api + dwg-engine + upload); digerleri onun DISI',
    dwgYol === '/api/dwg-engine/upload' && digerYol === dwgYol, `dwg=${dwgYol} diger=${digerYol}`);

  const dwgSinir = caddyBoyutu(/request_body\s+@dwgYukleme\s*\{\s*max_size\s+(\S+)\s*\}/.exec(blok)?.[1] ?? '');
  check('C3 ⭐ DWG yolu Caddy tavani ≥ Nest tavani + zarf payi (gecerli dosya kenarda kesilmez)',
    dwgSinir >= DWG_YUKLEME_AZAMI_BAYT + DWG_YUKLEME_ZARF_PAYI_BAYT,
    `caddy=${dwgSinir} nest+zarf=${DWG_YUKLEME_AZAMI_BAYT + DWG_YUKLEME_ZARF_PAYI_BAYT}`);
  check('C4 DWG yolu Caddy tavani Nest tavaninin en cok 32 MiB ustunde (kenar da siki)',
    dwgSinir <= DWG_YUKLEME_AZAMI_BAYT + 32 * MB, `caddy=${dwgSinir}`);

  const jsonMb = Number(/app\.use\(json\(\{\s*limit:\s*'(\d+)mb'\s*\}\)\)/.exec(
    readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8'))?.[1]);
  const digerSinir = caddyBoyutu(/request_body\s+@digerApi\s*\{\s*max_size\s+(\S+)\s*\}/.exec(blok)?.[1] ?? '');
  check('C5 diger /api tavani ≥ Nest JSON siniri (body-parser "mb" = MiB) ve ≤ 128 MiB',
    Number.isFinite(jsonMb) && jsonMb > 0 && digerSinir >= jsonMb * MB && digerSinir <= 128 * MB,
    `json=${jsonMb} MiB caddy=${digerSinir}`);
}

// ── M: yapi ─────────────────────────────────────────────────────────────────

function mBlogu(): void {
  console.log('\n── M) YAPI: /upload kapi sirasi ──');
  const sinif = Reflect.getMetadata(GUARDS_METADATA, DwgEngineController) as unknown[] | undefined;
  check('M1 GERCEK sinifta sinif duzeyi kapilar JWT + erisim (yontem kapisindan ONCE kosar)',
    JSON.stringify(sinif?.map((k: any) => k?.name)) === JSON.stringify([JwtAuthGuard.name, ErisimGuard.name]),
    JSON.stringify(sinif?.map((k: any) => k?.name)));
  const yontem = Reflect.getMetadata(GUARDS_METADATA, DwgEngineController.prototype.uploadAsync) as unknown[] | undefined;
  check('M2 /upload yontem kapisi DwgYuklemeKapisi (multer araya girmeden ONCE kosar)',
    yontem?.length === 1 && yontem[0] === DwgYuklemeKapisi, JSON.stringify(yontem?.map((k: any) => k?.name)));
  const araya = Reflect.getMetadata(INTERCEPTORS_METADATA, DwgEngineController.prototype.uploadAsync) as unknown[] | undefined;
  check('M3 /upload tek araya giren (FileInterceptor)', araya?.length === 1, `adet=${araya?.length}`);
}

// ── G: kapi birimi ──────────────────────────────────────────────────────────

function sahteBaglam(basliklar: Record<string, string>, user: unknown, yikildi = false) {
  const res = Object.assign(new EventEmitter(), { destroyed: yikildi });
  const req = { headers: basliklar, user };
  const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ExecutionContext;
  return { ctx, res };
}

function gBlogu(): void {
  console.log('\n── G) KAPI BIRIMI ──');
  const kapi = new DwgYuklemeKapisi();
  const kul = (f: string) => ({ id: `k-${f}`, firmaId: f });
  const tavan = String(DWG_YUKLEME_AZAMI_BAYT + DWG_YUKLEME_ZARF_PAYI_BAYT);
  {
    const { ctx, res } = sahteBaglam({ 'content-length': tavan }, kul('g1'));
    const sonuc = kapi.canActivate(ctx);
    check('G1 tavan + zarf payi tam sinirda KABUL, yer alindi', sonuc === true && firmaYuklemeleri.sayi('g1') === 1,
      `sonuc=${sonuc} sayi=${firmaYuklemeleri.sayi('g1')}`);
    res.emit('close');
    res.emit('close');
    check('G2 \'close\' yeri geri verir, ikinci \'close\' ikinci kez vermez', firmaYuklemeleri.sayi('g1') === 0,
      `sayi=${firmaYuklemeleri.sayi('g1')}`);
  }
  {
    const { ctx } = sahteBaglam({ 'content-length': String(Number(tavan) + 1) }, kul('g2'));
    let hata: unknown;
    try { kapi.canActivate(ctx); } catch (e) { hata = e; }
    check('G3 +1 bayt → 413 Turkce ileti, yer ALINMAZ',
      hata instanceof PayloadTooLargeException && (hata as HttpException).message === DWG_YUKLEME_COK_BUYUK_MESAJI
        && firmaYuklemeleri.sayi('g2') === 0, `hata=${(hata as Error)?.message} sayi=${firmaYuklemeleri.sayi('g2')}`);
  }
  {
    const acik: EventEmitter[] = [];
    for (let i = 0; i < FIRMA_BASINA_ES_ZAMANLI_YUKLEME; i++) {
      const { ctx, res } = sahteBaglam({ 'content-length': '1000' }, kul('g3'));
      kapi.canActivate(ctx);
      acik.push(res);
    }
    let hata: unknown;
    try { kapi.canActivate(sahteBaglam({ 'content-length': '1000' }, kul('g3')).ctx); } catch (e) { hata = e; }
    check(`G4 firmanin ${FIRMA_BASINA_ES_ZAMANLI_YUKLEME + 1}. es zamanli yuklemesi 429 (Turkce)`,
      hata instanceof HttpException && hata.getStatus() === 429 && hata.message === DWG_YUKLEME_SURUYOR_MESAJI
        && firmaYuklemeleri.sayi('g3') === FIRMA_BASINA_ES_ZAMANLI_YUKLEME,
      `hata=${(hata as Error)?.message} sayi=${firmaYuklemeleri.sayi('g3')}`);
    check('G5 baska firma etkilenmez', kapi.canActivate(sahteBaglam({}, kul('g3-baska')).ctx) === true);
    for (const r of acik) r.emit('close');
    check('G6 kapananlar yeri geri verdi', firmaYuklemeleri.sayi('g3') === 0, `sayi=${firmaYuklemeleri.sayi('g3')}`);
  }
  {
    const sonuc = kapi.canActivate(sahteBaglam({ 'content-length': '1000' }, kul('g4'), true).ctx);
    check('G7 kapiya varmadan kopmus yanit → gecmez, yer ALINMAZ (\'close\' coktan yayildi)',
      sonuc === false && firmaYuklemeleri.sayi('g4') === 0, `sonuc=${sonuc} sayi=${firmaYuklemeleri.sayi('g4')}`);
  }
  {
    let hata: unknown;
    try { kapi.canActivate(sahteBaglam({}, { id: 'firmasiz' }).ctx); } catch (e) { hata = e; }
    check('G8 firmasiz hesap sayaca dokunmadan reddedilir (kimlikCoz)', hata instanceof ForbiddenException,
      String((hata as Error)?.name));
  }
  firmaYuklemeleri.birak('g3-baska');

  // Dosya adi (inceleme 26.09): busboy `filename`i latin1 cozer, `filename*` (RFC 5987)
  // adini bildirilen karakter kumesiyle DOGRU cozer; denetim karakteri Prisma'da 500 veriyordu.
  const turkce = 'Şişli ÇÖĞÜ İ-3.dwg';
  const latin1Bozuk = Buffer.from(turkce, 'utf8').toString('latin1');
  check('G9 latin1 cozulmus UTF-8 ad duzelir', yuklenenDosyaAdi(latin1Bozuk) === turkce, yuklenenDosyaAdi(latin1Bozuk));
  // 'Şişli.dwg' U+00FF ustu harfler + ASCII: korumasiz latin1 cevrimi "^i_li.dwg" uretir ve
  // U+FFFD CIKMAZ (geri donus yakalamaz) — Ç/Ö/Ü'lu ad hatayi gizliyordu (mutant N16 yasadi).
  check('G10 zaten dogru cozulmus (filename*) Turkce ad BOZULMAZ',
    yuklenenDosyaAdi('Şişli.dwg') === 'Şişli.dwg' && yuklenenDosyaAdi(turkce) === turkce,
    `${yuklenenDosyaAdi('Şişli.dwg')} · ${yuklenenDosyaAdi(turkce)}`);
  check('G11 denetim karakterleri (NUL, satir sonu) "_" olur', yuklenenDosyaAdi('a\u0000b\nc\u007fd.dwg') === 'a_b_c_d.dwg',
    JSON.stringify(yuklenenDosyaAdi('a\u0000b\nc\u007fd.dwg')));
  check('G12 duz ASCII ad aynen kalir', yuklenenDosyaAdi('proje-1 (rev2).dwg') === 'proje-1 (rev2).dwg');
}

// ── S: akis ─────────────────────────────────────────────────────────────────

async function sBlogu(): Promise<void> {
  console.log('\n── S) AKIS: 200 MB motora bayti baytina, bellege alinmadan ──');
  motorKipi = 'normal';
  const isinma = await yukle({ adet: 1 });
  check('S0-OLCUT isinma yuklemesi gecti', isinma.durum === 201, `durum=${isinma.durum} ${isinma.govde.slice(0, 160)}`);

  const ADET = 200;
  const blok = randomBytes(MB);
  const beklenen = ozetle(blok, ADET);
  const ad = 'Yangın Tesisatı ÇÖĞÜŞ-2.dwg';
  const onceMotor = motorKayitlari.length;
  const onceSahiplik = sahiplikKayitlari.length;
  // BELLEK OLCUTU: istemci, Nest ve taklit motor AYNI surecte; RSS cop toplayici
  // gecikmesini de tasir (bilgi olarak basilir). Olculen, ZORLA GC'den sonra canli
  // kalan ArrayBuffer baytidir — govdeyi TUTAN her yol (memoryStorage, Blob kopyasi,
  // undici'nin `tee()` kolu) burada govde kadar gorunur; akan yol sabit kalir.
  // SONDALAR: (1) ERKEN — motor govdeyi 1,5 sn OKUMAZ (TCP geri basinci); akan yol o
  // sirada birkac MB'ta durur, govdeyi bellege alan yol (dosyanin tamami, Buffer.concat)
  // ise tutar. Tuketici okurken olculseydi goremezdik: Windows loopback 200 MB'lik tek
  // yazimi cekirdege alip Node bellegini hemen bosaltiyor (mutant N2: RSS +634 MB ama
  // %25-95 sondalari +2..41 MB). (2) ILERLEME — motor dosyanin %25/%50/%75/%95'ini
  // aldiginda birer tam GC + olcum. Surekli zorla GC olcum olculeni bozdu: 50 ms'de bir
  // yukleme ~1 MB/sn'ye dustu; canli imajda (1 CPU, ts-node yigini) 250 ms'de bir bile
  // 60 sn'lik bekciye takildi.
  gcZorla();
  await uyu(50);
  const tabanRss = process.memoryUsage.rss();
  const tabanAb = process.memoryUsage().arrayBuffers;
  let tepeRss = tabanRss;
  let tepeAb = tabanAb;
  let erkenMb = Number.NaN;
  motorBaslamaGecikmesiMs = 1_500;
  motorBaslamadanKancasi = () => {
    gcZorla();
    erkenMb = (process.memoryUsage().arrayBuffers - tabanAb) / MB;
  };
  const sondalar = [0.25, 0.5, 0.75, 0.95];
  const olcumler: string[] = [];
  motorVeriKancasi = (mk) => {
    if (mk !== motorKayitlari[onceMotor] || !sondalar.length) return;
    if (mk.alinanBayt < sondalar[0] * ADET * MB) return;
    sondalar.shift();
    gcZorla();
    const ab = process.memoryUsage().arrayBuffers;
    tepeAb = Math.max(tepeAb, ab);
    olcumler.push(`%${Math.round((100 * mk.alinanBayt) / (ADET * MB))}:+${((ab - tabanAb) / MB).toFixed(0)}MB`);
  };
  let parcaGoruldu = 0;
  const ornekleyici = setInterval(() => {
    tepeRss = Math.max(tepeRss, process.memoryUsage.rss());
    parcaGoruldu = Math.max(parcaGoruldu, parcalar().length);
  }, 50);
  const r = await yukle({ adet: ADET, blok, ad });
  clearInterval(ornekleyici);
  motorVeriKancasi = null;
  motorBaslamadanKancasi = null;
  motorBaslamaGecikmesiMs = 0;
  const kayit = motorKayitlari[onceMotor];
  let govde: any = null;
  try { govde = JSON.parse(r.govde); } catch { /* asagida raporlanir */ }

  check('S1 yukleme gecti, motorun yaniti Nest\'ten aynen dondu',
    r.durum === 201 && govde?.file_id === `taklit${onceMotor}`, `durum=${r.durum} govde=${r.govde.slice(0, 160)}`);
  check('S2-OLCUT yukleme DISKTEN gecti: gecici dizinde parca goruldu', parcaGoruldu >= 1, `parca=${parcaGoruldu}`);
  check('S3 ⭐ motor dosyayi BAYTI BAYTINA aldi (sha256 ve 200 MB)',
    motorKayitlari.length === onceMotor + 1 && kayit?.ozet === beklenen && kayit?.dosyaBayt === ADET * MB,
    `motor istegi=${motorKayitlari.length - onceMotor} bayt=${kayit?.dosyaBayt} ozet=${kayit?.ozet?.slice(0, 12)} beklenen=${beklenen.slice(0, 12)}`);
  check('S4 motora Content-Length\'li gitti (parcali aktarim degil) ve uzunluk dogru',
    kayit?.aktarimKodlamasi === undefined && Number(kayit?.icerikUzunlugu) === kayit?.alinanBayt,
    `content-length=${kayit?.icerikUzunlugu} te=${kayit?.aktarimKodlamasi} alinan=${kayit?.alinanBayt}`);
  const kayitAdi = sahiplikKayitlari[onceSahiplik]?.dosyaAdi;
  check('S5 Turkce ad motora ve sahiplik kaydina DOGRU gitti (latin1 bozulmasi yok)',
    kayit?.dosyaAdi === ad && kayitAdi === ad, `motor=${kayit?.dosyaAdi} kayit=${kayitAdi}`);
  const tutulanMb = (tepeAb - tabanAb) / MB;
  console.log(`    (bilgi) 200 MB, ${r.sure} ms · GC sonrasi tutulan ArrayBuffer: motor okumazken +${erkenMb.toFixed(0)}MB · `
    + `${olcumler.join(' ')} · surec RSS tepesi +${((tepeRss - tabanRss) / MB).toFixed(1)} MB (GC'siz)`);
  check('S6-OLCUT erken sonda (motor okumazken) ve dort ilerleme sondasi (%25/%50/%75/%95) olctu',
    Number.isFinite(erkenMb) && olcumler.length === 4, `erken=${erkenMb} olcum=${JSON.stringify(olcumler)}`);
  // Akan yolda motor okumazken Nest ~11 MB'ta durur; okurken havadaki tampon (uretici +
  // tuketici ayni surecte) +2..+91 MB arasi SALINIR, iletilenle buyumez (olculdu 26.09:
  // yerel Node 24 ve canli Node 20.20.2). Govdeyi tutan gerilemelerin imzasi ayri:
  //   S7 dosyayi (ya da iletilecek govdeyi) bellege alan yol — motor okumazken ≥ 200 MB
  //      (mutant N2: tam dosya + Buffer.concat)
  //   S8 memoryStorage butun iletim boyunca ≥ 200 MB; undici `tee()` kolu iletilen kadar
  //      tutar, %95 sondasinda ≥ 190 MB (mutant N1). Buyume farki (%95 − %25) OLCUT
  //      OLAMADI: salinim ~80 MB, `tee`nin iki sonda arasi artisiyla ayni mertebe.
  check('S7 ⭐ motor okumazken Nest govdeyi bellekte BEKLETMEDI: GC sonrasi tutulan < 64 MB',
    erkenMb < 64, `erken=+${erkenMb.toFixed(1)} MB`);
  check('S8 ⭐ iletim boyunca govde bellekte TUTULMADI: her sondada < 160 MB (memoryStorage / `tee` ≥ 190 MB)',
    tutulanMb < 160, `tepe=+${tutulanMb.toFixed(1)} MB · ${olcumler.join(' ')}`);
  check('S9 gecici dosya silindi', await bekle(() => parcalar().length === 0, 2_000), JSON.stringify(parcalar()));
}

// ── O: on denetim ───────────────────────────────────────────────────────────

async function oBlogu(): Promise<void> {
  console.log('\n── O) ON DENETIM: Content-Length tavani asiyorsa govde okunmadan 413 ──');
  const onceMotor = motorKayitlari.length;
  const uzunluk = DWG_YUKLEME_AZAMI_BAYT + DWG_YUKLEME_ZARF_PAYI_BAYT + 1;
  const sonuc = await new Promise<{ durum: number | string; govde: string; sure: number }>((coz) => {
    const t0 = Date.now();
    const istek = httpIstegi({
      host: '127.0.0.1', port: nestPort, method: 'POST', path: '/api/dwg-engine/upload',
      headers: {
        'content-type': 'multipart/form-data; boundary=x', 'content-length': String(uzunluk), 'x-test-firma': 'firma-o',
      },
    });
    const z = setTimeout(() => { istek.destroy(); coz({ durum: 'BEKCI', govde: '', sure: Date.now() - t0 }); }, 5_000);
    istek.on('response', (yanit) => {
      let govde = '';
      yanit.on('data', (p: Buffer) => { govde += p.toString('utf8'); });
      yanit.on('end', () => { clearTimeout(z); istek.destroy(); coz({ durum: yanit.statusCode ?? 0, govde, sure: Date.now() - t0 }); });
    });
    istek.on('error', () => undefined);
    istek.write(Buffer.alloc(16 * 1024, 0x42)); // govdenin yalniz 16 KB'si; kalani HIC gonderilmez
  });
  check('O1 ⭐ govdenin tamami beklenmeden 413 + Turkce ileti',
    sonuc.durum === 413 && mesaj(sonuc.govde) === DWG_YUKLEME_COK_BUYUK_MESAJI,
    `durum=${sonuc.durum} sure=${sonuc.sure} ms govde=${sonuc.govde.slice(0, 160)}`);
  await uyu(100);
  check('O2 motora istek GITMEDI, diske parca YAZILMADI, yer ALINMADI',
    motorKayitlari.length === onceMotor && parcalar().length === 0 && firmaYuklemeleri.sayi('firma-o') === 0,
    `motor=${motorKayitlari.length - onceMotor} parca=${parcalar().length} sayi=${firmaYuklemeleri.sayi('firma-o')}`);
}

// ── L: multer siniri ────────────────────────────────────────────────────────

async function lBlogu(): Promise<void> {
  console.log('\n── L) MULTER SINIRI: tam tavan gecer, tavan + 1 bayt (uzunluksuz) 413 ──');
  motorKipi = 'normal';
  const adet = DWG_YUKLEME_AZAMI_BAYT / MB;
  // busboy `fileSize === sinir` olunca da 'limit' yayar: sinir tavanin kendisi olsaydi
  // TAM tavandaki dosya 413 alirdi (inceleme 26.09). Denetleyici tavan + 1 verir.
  const onceTavan = motorKayitlari.length;
  const tavan = await yukle({ adet, firma: 'firma-l' });
  const kayit = motorKayitlari[onceTavan];
  check(`L1 TAM tavan (${adet} MiB = ${DWG_YUKLEME_AZAMI_BAYT} bayt) gecer ve motora eksiksiz ulasir`,
    tavan.durum === 201 && kayit?.dosyaBayt === DWG_YUKLEME_AZAMI_BAYT,
    `durum=${tavan.durum} motor=${kayit?.dosyaBayt} ${tavan.govde.slice(0, 120)}`);
  await bekle(() => parcalar().length === 0, 2_000);

  const onceMotor = motorKayitlari.length;
  const r = await yukle({ adet, ek: Buffer.from([0x41]), uzunluksuz: true, firma: 'firma-l' });
  check('L2 tavan + 1 bayt, uzunluksuz govde (on denetim goremez) → multer 413', r.durum === 413,
    `durum=${r.durum} govde=${r.govde.slice(0, 160)}`);
  check('L3 yarim parca silindi, motora istek gitmedi, yer geri verildi',
    (await bekle(() => parcalar().length === 0, 2_000)) && motorKayitlari.length === onceMotor
      && firmaYuklemeleri.sayi('firma-l') === 0,
    `parca=${parcalar().length} motor=${motorKayitlari.length - onceMotor} sayi=${firmaYuklemeleri.sayi('firma-l')}`);
}

// ── E: firma basina es zamanlilik ───────────────────────────────────────────

async function eBlogu(): Promise<void> {
  console.log('\n── E) FIRMA BASINA ES ZAMANLILIK ──');
  motorKipi = 'askida';
  const onceMotor = motorKayitlari.length;
  const suren = [yukle({ firma: 'firma-e', adet: 1 }), yukle({ firma: 'firma-e', adet: 1 })];
  const ikisiMotorda = await bekle(() => bekleyenYanitlar.length === 2, 5_000);
  check('E0-OLCUT iki yukleme motora ulasti ve yanit bekliyor (yer tutuluyor)',
    ikisiMotorda && firmaYuklemeleri.sayi('firma-e') === 2,
    `bekleyen=${bekleyenYanitlar.length} sayi=${firmaYuklemeleri.sayi('firma-e')}`);

  const ucuncu = await yukle({ firma: 'firma-e', adet: 4 });
  check('E1 ⭐ ucuncu es zamanli yukleme 429 + Turkce ileti',
    ucuncu.durum === 429 && mesaj(ucuncu.govde) === DWG_YUKLEME_SURUYOR_MESAJI,
    `durum=${ucuncu.durum} govde=${ucuncu.govde.slice(0, 160)}`);
  check('E2 reddedilenin govdesi diske YAZILMADI, motora GITMEDI',
    parcalar().length === 2 && motorKayitlari.length === onceMotor + 2,
    `parca=${parcalar().length} motor=${motorKayitlari.length - onceMotor}`);

  const baska = yukle({ firma: 'firma-e-baska', adet: 1 });
  check('E3 baska firma ayni anda yukleyebilir (motora ulasti)', await bekle(() => bekleyenYanitlar.length === 3, 5_000),
    `bekleyen=${bekleyenYanitlar.length}`);

  motorKipi = 'normal';
  for (const yanitla of bekleyenYanitlar.splice(0)) yanitla();
  const bitenler = await Promise.all([...suren, baska]);
  check('E4 bekleyen uc yukleme tamamlandi', bitenler.every((b) => b.durum === 201),
    JSON.stringify(bitenler.map((b) => b.durum)));
  check('E5 yerler geri verildi (sayac 0), gecici dosyalar silindi',
    (await bekle(() => firmaYuklemeleri.sayi('firma-e') === 0 && parcalar().length === 0, 2_000))
      && firmaYuklemeleri.sayi('firma-e-baska') === 0,
    `sayi=${firmaYuklemeleri.sayi('firma-e')} parca=${parcalar().length}`);
  const yeniden = await yukle({ firma: 'firma-e', adet: 1 });
  check('E6 bitince ayni firma yeniden yukleyebilir', yeniden.durum === 201, `durum=${yeniden.durum}`);
}

// ── A: istemci kopmasi ──────────────────────────────────────────────────────

async function aBlogu(): Promise<void> {
  console.log('\n── A) ISTEMCI KOPMASI: yarim parca silinir, yer geri verilir ──');
  motorKipi = 'normal';
  const onceMotor = motorKayitlari.length;
  const ac = new AbortController();
  const istek = yukle({ firma: 'firma-k', adet: 60, blokArasiMs: 25, sinyal: ac.signal });
  // Parca belirince ~0,4 sn beklenir, boyutu TEK kez okunur (yazilan dosyaya sik stat
  // Windows'ta yazimi yavaslatiyor — S blogu notu).
  const belirdi = await bekle(() => parcalar().length === 1, 10_000);
  await uyu(400);
  const p = parcalar();
  let yazilanMb = 0;
  try { yazilanMb = p.length === 1 ? statSync(join(dwgGeciciDizin(), p[0])).size / MB : 0; } catch { /* asagida raporlanir */ }
  check('A0-OLCUT kopma ANINDA yukleme diske yaziliyordu (≥ 5 MB parca, yer tutuluyor)',
    belirdi && yazilanMb >= 5 && firmaYuklemeleri.sayi('firma-k') === 1,
    `parca=${JSON.stringify(p)} yazilan=${yazilanMb.toFixed(1)} MB sayi=${firmaYuklemeleri.sayi('firma-k')}`);
  const basGunluk = gunluk.length;
  ac.abort();
  const sonuc = await istek;
  check('A1 ⭐ kopan yuklemenin yarim parcasi silindi (2 sn icinde)', await bekle(() => parcalar().length === 0, 2_000),
    `istemci=${sonuc.durum} parca=${JSON.stringify(parcalar())}`);
  check('A2 ⭐ yer geri verildi', await bekle(() => firmaYuklemeleri.sayi('firma-k') === 0, 2_000),
    `sayi=${firmaYuklemeleri.sayi('firma-k')}`);
  check('A3 motora istek GITMEDI', motorKayitlari.length === onceMotor, `motor=${motorKayitlari.length - onceMotor}`);
  await uyu(100);
  const satirlar = gunluk.slice(basGunluk);
  check('A4 kopma SESSIZ: tek "istemci koptu" satiri, ERROR yigini YOK (eskiden AbortError ERROR diye yaziliyordu)',
    satirlar.filter((s) => s.startsWith('LOG') && s.includes('[uploadAsync] istemci koptu')).length === 1
      && !satirlar.some((s) => s.startsWith('ERROR')), JSON.stringify(satirlar).slice(0, 400));
  const sonra = await yukle({ firma: 'firma-k', adet: 2 });
  check('A5 ardindan normal yukleme calisir', sonra.durum === 201, `durum=${sonra.durum} ${sonra.govde.slice(0, 120)}`);
}

// ── K: istemci motora ILETIM SURERKEN koparsa iletim de kesilir ───────────────

async function kBlogu(): Promise<void> {
  console.log('\n── K) ILETIM SURERKEN KOPMA: motor istegi kesilir, yeniden denenmez ──');
  // Motor govdeyi 20 ms'de bir parca okur: 32 MB'lik iletim ~10 sn surer.
  // Istemci yuklemeyi bitirmis ve Nest'in motor istegini bekliyor; sonra kopar.
  motorKipi = 'yavas';
  const onceMotor = motorKayitlari.length;
  const basGunluk = gunluk.length;
  const ac = new AbortController();
  const istek = yukle({ firma: 'firma-i', adet: 32, sinyal: ac.signal });
  const iletimde = await bekle(() => motorKayitlari.length === onceMotor + 1, 20_000);
  await uyu(300);
  const kayit = motorKayitlari[onceMotor];
  check('K0-OLCUT istek motora ulasti ve motor yanit vermiyor (iletim suruyor, yer tutuluyor)',
    iletimde && kayit?.bitti === null && kayit?.kesildi === null && firmaYuklemeleri.sayi('firma-i') === 1,
    `iletimde=${iletimde} bitti=${kayit?.bitti} kesildi=${kayit?.kesildi} sayi=${firmaYuklemeleri.sayi('firma-i')}`);
  const kopmaAni = Date.now();
  ac.abort();
  await istek;
  // Olcut: baglanti kapandi VE dosyanin yarisindan azi ulasti. Sure olcut DEGIL: Nest
  // kopmada gondermeyi hemen keser (gunlukte ~300 ms), ama keserken soket tamponlarina
  // girmis birkac MB'i yavas taklit ancak saniyeler icinde bosaltip kapanisi gorur
  // (olculdu 26.09: kopmada 0,2 MB, kapanista 3,1 MB, 4,7 sn — 100 ms'lik okuyucuyla).
  const kesildi = await bekle(() => kayit?.kesildi != null, 10_000);
  check('K1 ⭐ istemci kopunca Nest motor istegini KESTI: baglanti kapandi, dosyanin yarisindan azi ulasti',
    kesildi && kayit?.bitti === null && (kayit?.alinanBayt ?? 0) < 16 * MB,
    `kesildi=${kayit?.kesildi ? `${kayit.kesildi - kopmaAni} ms` : 'HAYIR — iletim yetim suruyor'} alinan=${((kayit?.alinanBayt ?? 0) / MB).toFixed(1)} MB`);
  await uyu(2_500); // servisin yeniden deneme beklemesi 2 sn
  check('K2 yeniden deneme YOK: motor bu yukleme icin TEK istek gordu', motorKayitlari.length === onceMotor + 1,
    `motor istegi=${motorKayitlari.length - onceMotor}`);
  check('K3 gecici dosya silindi, yer geri verildi',
    (await bekle(() => parcalar().length === 0, 2_000)) && firmaYuklemeleri.sayi('firma-i') === 0,
    `parca=${parcalar().length} sayi=${firmaYuklemeleri.sayi('firma-i')}`);
  const satirlar = gunluk.slice(basGunluk);
  check('K4 gunlukte tek "[uploadAsync] istemci koptu — motor istegi" satiri, ERROR/WARN YOK',
    satirlar.filter((s) => s.startsWith('LOG') && s.includes('[uploadAsync] istemci koptu — motor istegi')).length === 1
      && !satirlar.some((s) => s.startsWith('ERROR') || s.startsWith('WARN')), JSON.stringify(satirlar).slice(0, 400));
  motorKipi = 'normal';
}

// ── H: motor hatasi ─────────────────────────────────────────────────────────

async function hBlogu(): Promise<void> {
  console.log('\n── H) MOTOR HATASI: yeniden deneme dosyayi bastan akitir, gecici silinir ──');
  motorKipi = 'hata';
  const onceMotor = motorKayitlari.length;
  const blok = randomBytes(MB);
  const r = await yukle({ firma: 'firma-h', adet: 3, blok });
  const kayitlar = motorKayitlari.slice(onceMotor);
  const beklenen = ozetle(blok, 3);
  check('H1 503 ve ileti motorun `detail` metni (ham JSON degil)',
    r.durum === 503 && mesaj(r.govde) === 'Upload hatasi: disk dolu (taklit)', `durum=${r.durum} govde=${r.govde.slice(0, 160)}`);
  check('H2 tek yeniden deneme: iki istek de dosyanin TAMAMINI tasidi (akis bastan kuruldu)',
    kayitlar.length === 2 && kayitlar.every((k) => k.ozet === beklenen && k.dosyaBayt === 3 * MB),
    JSON.stringify(kayitlar.map((k) => [k.dosyaBayt, k.ozet?.slice(0, 8)])));
  check('H3 gecici dosya silindi, yer geri verildi',
    (await bekle(() => parcalar().length === 0, 2_000)) && firmaYuklemeleri.sayi('firma-h') === 0,
    `parca=${parcalar().length} sayi=${firmaYuklemeleri.sayi('firma-h')}`);

  // Motorun "hat dolu" 429'u: bugunku sozlesme 503 + motorun metni, yeniden deneme YOK
  // (fetchWithRetry yalniz 5xx/zaman asiminda dener). Degisirse bu satir bilerek kizarir.
  motorKipi = 'yogun';
  const onceYogun = motorKayitlari.length;
  const yogun = await yukle({ firma: 'firma-h', adet: 1 });
  check('H4 motor 429 (hat dolu) → Nest 503 + motorun metni, motora TEK istek',
    yogun.durum === 503 && mesaj(yogun.govde).includes('cok sayida projeyi isliyor')
      && motorKayitlari.length === onceYogun + 1,
    `durum=${yogun.durum} motor=${motorKayitlari.length - onceYogun} govde=${yogun.govde.slice(0, 160)}`);

  // Iletim ORTASINDA zaman asimi: motor ilk istegin yarisini okuyup durur; Nest zaman
  // asimiyla keser, 2 sn sonra yeniden dener ve dosyayi diskten BASTAN akitir.
  motorKipi = 'ilk-yarida-dur';
  ilkYaridaDurKullanildi = false;
  const asil = AbortSignal.timeout.bind(AbortSignal);
  (AbortSignal as any).timeout = () => asil(1_500);
  const onceYarida = motorKayitlari.length;
  const basGunluk = gunluk.length;
  const blok2 = randomBytes(MB);
  let yarida: Yanit;
  try {
    yarida = await yukle({ firma: 'firma-h', adet: 8, blok: blok2 });
  } finally {
    (AbortSignal as any).timeout = asil;
  }
  const ilk = motorKayitlari[onceYarida];
  const ikinci = motorKayitlari[onceYarida + 1];
  // Taklit ilk istegi YARIDA durdurup okumuyor; okunmayan govdede kopmayi goremez —
  // olcut: ilk istek BITMEDI ve dosyanin yalniz bir kismi ulasti.
  check('H5-OLCUT ilk istek govdenin ortasinda kaldi (bitmedi, dosyanin bir kismi ulasti)',
    !!ilk && ilk.bitti === null && ilk.dosyaBayt > 0 && ilk.dosyaBayt < 8 * MB,
    `alinan=${ilk?.alinanBayt} dosya=${ilk?.dosyaBayt} kesildi=${ilk?.kesildi}`);
  check('H6 ⭐ yeniden deneme dosyayi BASTAN ve EKSIKSIZ akitti (sha256), yukleme gecti',
    yarida.durum === 201 && ikinci?.ozet === ozetle(blok2, 8) && ikinci?.dosyaBayt === 8 * MB,
    `durum=${yarida.durum} ikinci=${ikinci?.dosyaBayt} ozet=${ikinci?.ozet?.slice(0, 8)}`);
  check('H7 zaman asimi gunlukte "cold start retry" uyarisi (yeniden deneme gercekten oldu)',
    gunluk.slice(basGunluk).some((s) => s.startsWith('WARN') && s.includes('[uploadAsync] TimeoutError')),
    JSON.stringify(gunluk.slice(basGunluk)).slice(0, 300));
  check('H8 gecici dosya silindi, yer geri verildi',
    (await bekle(() => parcalar().length === 0, 2_000)) && firmaYuklemeleri.sayi('firma-h') === 0,
    `parca=${parcalar().length} sayi=${firmaYuklemeleri.sayi('firma-h')}`);
  motorKipi = 'normal';
}

async function main(): Promise<void> {
  check('OLCUT gecici dizin teste ozel', dwgGeciciDizin().startsWith(testGecici), dwgGeciciDizin());
  cBlogu();
  mBlogu();
  gBlogu();

  await new Promise<void>((r) => motor.listen(0, '127.0.0.1', r));
  process.env.DWG_ENGINE_URL = `http://127.0.0.1:${(motor.address() as AddressInfo).port}`;
  delete process.env.DWG_ENGINE_TOKEN;
  const app = await NestFactory.create<NestExpressApplication>(OlcumModulu, { logger: yakalayici });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  nestPort = (app.getHttpServer().address() as AddressInfo).port;
  try {
    await sBlogu();
    await oBlogu();
    await lBlogu();
    await eBlogu();
    await aBlogu();
    await kBlogu();
    await hBlogu();
  } finally {
    for (const yanitla of bekleyenYanitlar.splice(0)) yanitla();
    await app.close();
    motor.closeAllConnections();
    await new Promise<void>((r) => motor.close(() => r()));
    for (const [ad, deger] of Object.entries(oncekiOrtam)) {
      if (deger === undefined) delete process.env[ad];
      else process.env[ad] = deger;
    }
    rmSync(testGecici, { recursive: true, force: true });
  }

  check('SON: kosum boyunca yakalanmamis istisna YOK', yakalanmamis.length === 0, JSON.stringify(yakalanmamis));
  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    const son = gunluk.filter((s) => !s.includes('RouterExplorer') && !s.includes('RoutesResolver')).slice(-8);
    if (son.length) console.log(`  Nest gunlugunun son satirlari:\n    ${son.join('\n    ')}`);
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error('BEKLENMEYEN:', e);
  process.exitCode = 1;
}));
