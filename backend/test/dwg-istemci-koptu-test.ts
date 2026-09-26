/**
 * DWG ISTEMCI KOPTU — KAPI · `npm run test:dwg-istemci-koptu` (26.09.2026)
 *
 * AG ve DB GEREKTIRMEZ: GERCEK `DwgEngineController` + GERCEK `DwgEngineService`
 * 127.0.0.1'de Nest+Express olarak kalkar; DWG motoru yerine SUREC ICI taklit
 * HTTP sunucusu durur (istegi tutar ya da gec yanit verir) ve Nest'in motor
 * baglantisini NE ZAMAN kapattigini kaydeder. Istemci GERCEK `fetch` ile gider
 * ve GERCEKTEN kopar (AbortController → soket kapanir).
 * Kapilar (JWT/erisim) olcum disi: alt sinifta sinif duzeyi kapilar bir test
 * kapisiyla GOLGELENIR (gercek sinifin ust verisine dokunulmaz); rota, parametre
 * ve govde gercek denetleyiciden miras. Sahiplik taklit (G2 ayri kapida).
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * DWG Analiz birim degisince suren `/dwg-engine/parse` istegini iptal edip
 * yeni birimle yeniden baslatiyor (`useLayerCalc.iptalEt`). Iptal YALNIZ
 * tarayicidaydi: servis motora yalniz `AbortSignal.timeout` veriyordu, Nest
 * motor cagrisini sonuna kadar bekliyor, motor yetim isi bitiriyordu.
 * Olculdu (yerel, 4 cekirdek, 34 sn'lik ayirma): 3. saniyede kesilen ayirmanin
 * alt sureci 44-48 sn daha kostu (tam CPU), yeni istek %51-63 uzadi; 3 sn
 * arayla uc birim degisiminde %142-159. Motor tarafi (alt sureci oldurme):
 * `python/tests/test_parse_iptal.py`.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   S  saf yardimci `istemciKopmaSinyali`: acik baglanti iptal DEGIL · yanit
 *      yazilmadan 'close' → iptal (neden IstemciKoptuHatasi) · yanit bitince
 *      'close' → iptal DEGIL · kurulumdan once kopmus → aninda iptal
 *   K  ⭐ KOPMA: istemci koparsa Nest motor baglantisini KAPATIR; yeniden
 *      deneme YOK (motor tek istek gorur); gunlukte tek "istemci koptu" satiri,
 *      "cold start retry" uyarisi ya da hata satiri YOK. `req.on('close')`
 *      tuzagi da burada yakalanir: Node 16+ onu govde okununca yayar, denetleyicide
 *      kurulan dinleyici hic tetiklenmez (olculdu, mutant K1'de oldu)
 *   N  ⭐ NORMAL: kopmayan istek (on yuz gibi BOS multipart govde) sonucu alir,
 *      motor baglantisi normal biter, iz satiri yok
 *   Y  sahiplik sorgusu surerken kopan istemci motora HIC istek gondermez ve
 *      SURECI DUSURMEZ: undici 7 (Node 24), ONCEDEN iptal edilmis sinyal + FormData
 *      govdeyle cagrilan fetch'te reddin ustune YAKALANMAMIS istisna atiyor
 *      (olculdu 26.09: Node 24 2/2; canlidaki Node 20.20.2 / undici 6.24.1 0/2) —
 *      servis o sinyalle fetch cagirmaz. Kapinin ilk surumu bunu Node 24'te sureci
 *      dusurerek yakaladi; artik adiyla FAIL (Y3) — sessiz cokus yok
 *   Z  zaman asimi hala calisir (birlesik sinyal zaman asimini tasir): 300 sn
 *      sabitleri aynen, zaman asiminda eskisi gibi bir yeniden deneme + 503.
 *      Istek surerken GC ZORLANIR: Node 20'de AbortSignal.any kaynagi zayif tutar,
 *      zaman asimi sinyali toplanirsa hic tetiklenmez (kod incelemesi buldu;
 *      canli backend imajinda Node 20.20.2 olculdu). Node 24 bu hatayi gostermez.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 * ⚠ `process.exit` YOK: Windows'ta acik fetch soketiyle `process.exit(1)`
 * sureci 0xC0000409 ile cokertiyor. Basarisizlik `process.exitCode = 1`.
 */
import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Module, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'express';

import { IstemciKoptuHatasi, istemciKopmaSinyali } from '../src/altyapi/http/istemci-koptu';
import { DwgEngineController } from '../src/modules/dwg-engine/dwg-engine.controller';
import { DwgEngineService } from '../src/modules/dwg-engine/dwg-engine.service';
import { DwgSahiplikServisi } from '../src/modules/dwg-engine/dwg-sahiplik.servisi';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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

// Z icin zorla GC: Node 20'de AbortSignal.any kaynagi zayif tutar — zaman asimi
// sinyali toplanirsa hic tetiklenmez. GC kendiliginden 300 ms'de gelmeyecegi icin
// kapi onu zorlar (bayrak calisma aninda acilir; ayri Node secenegi gerekmez).
setFlagsFromString('--expose-gc');
const gcZorla = runInNewContext('gc') as () => void;

// Yakalanmamis istisna (undici govde akisi) sureci DUSURMEZ, adiyla FAIL olur (Y3).
const yakalanmamis: string[] = [];
process.on('uncaughtException', (e: any) => void yakalanmamis.push(String(e?.message ?? e)));

const uyu = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function bekle(kosul: () => boolean, ms: number): Promise<boolean> {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    if (kosul()) return true;
    await uyu(10);
  }
  return kosul();
}

// ── Nest gunlugu yakalanir: K/Y/Z iz satirlarini olcer ─────────────────────
const gunluk: string[] = [];
const yakalayici: LoggerService = {
  log: (m: unknown) => void gunluk.push(`LOG ${String(m)}`),
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
};
const yeniSatirlar = (bas: number) => gunluk.slice(bas).filter((s) => s.includes('[parseDwg]'));

// ── Taklit DWG motoru: istegi tutar ya da gec yanit verir, kapanisi kaydeder ──
type MotorKaydi = { yol: string; geldi: number; kesildi: number | null; bitti: number | null };
const motorKayitlari: MotorKaydi[] = [];
let motorKipi: 'askida' | 'gec-yanit' = 'askida';
const motor = createServer((req: IncomingMessage, res: ServerResponse) => {
  const kayit: MotorKaydi = { yol: req.url ?? '', geldi: Date.now(), kesildi: null, bitti: null };
  motorKayitlari.push(kayit);
  res.on('close', () => {
    if (res.writableFinished) kayit.bitti = Date.now();
    else kayit.kesildi = Date.now();
  });
  req.resume();
  if (motorKipi === 'gec-yanit') {
    setTimeout(() => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ motor: 'taklit', edge_segments: [] }));
    }, 600);
  }
  // 'askida': yanit YOK — baglantiyi yalniz Nest kapatabilir.
});

// ── Olcum denetleyicisi: GERCEK sinif, yalniz sinif duzeyi kapilar golgelenir ──
let sahiplikGecikmesiMs = 0;
let dogrulaCagrisi = 0;
const testKapisi = {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = { id: 'olcum-kullanici', firmaId: 'olcum-firma' };
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
        dogrula: async () => { dogrulaCagrisi++; if (sahiplikGecikmesiMs) await uyu(sahiplikGecikmesiMs); },
        kaydet: async () => undefined,
      },
    },
  ],
})
class OlcumModulu {}

let nestPort = 0;
/** On yuz gibi: BOS multipart govde, file_id'li parse. 15 sn bekci: asili istek
 *  kapiyi kilitlemez, "BEKCI" diye raporlanir (setTimeout ile — Z bloku
 *  `AbortSignal.timeout`u sarar, bekci ondan etkilenmemeli). */
async function parseIstegi(sinyal?: AbortSignal): Promise<{ durum: number | string; govde: string }> {
  const sorgu = new URLSearchParams({
    discipline: 'mechanical', scale: '0.001', file_id: 'olcum-dosyasi',
    selected_layers: JSON.stringify(['BORU']),
  });
  const bekci = new AbortController();
  const z = setTimeout(() => bekci.abort(new Error('BEKCI: 15 sn yanit yok')), 15_000);
  try {
    const r = await fetch(`http://127.0.0.1:${nestPort}/api/dwg-engine/parse?${sorgu}`, {
      method: 'POST', body: new FormData(),
      signal: sinyal ? AbortSignal.any([sinyal, bekci.signal]) : bekci.signal,
    });
    return { durum: r.status, govde: await r.text() };
  } catch (e: any) {
    return { durum: bekci.signal.aborted ? 'BEKCI' : (e?.name ?? 'hata'), govde: '' };
  } finally {
    clearTimeout(z);
  }
}

function sahteYanit(): EventEmitter & { destroyed: boolean; writableFinished: boolean } {
  return Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
}

function sBlogu(): void {
  console.log('\n── S) SAF YARDIMCI: istemciKopmaSinyali ──');
  {
    const res = sahteYanit();
    const s = istemciKopmaSinyali(res as unknown as Response);
    check('S1 acik baglantida sinyal iptal DEGIL', !s.aborted);
    res.emit('close');
    check('S2 yanit yazilmadan \'close\' → iptal, nedeni IstemciKoptuHatasi',
      s.aborted && s.reason instanceof IstemciKoptuHatasi, `aborted=${s.aborted} neden=${s.reason}`);
    check('S2b dinleyici tek sefer (once) — kapanistan sonra kalmaz', res.listenerCount('close') === 0,
      `dinleyici=${res.listenerCount('close')}`);
  }
  {
    const res = sahteYanit();
    const s = istemciKopmaSinyali(res as unknown as Response);
    res.writableFinished = true;
    res.emit('close');
    check('S3 yanit bittikten sonraki \'close\' → iptal DEGIL (normal bitis)', !s.aborted);
  }
  {
    const res = Object.assign(sahteYanit(), { destroyed: true });
    const s = istemciKopmaSinyali(res as unknown as Response);
    check('S4 kurulumdan ONCE kopmus baglanti → sinyal aninda iptal',
      s.aborted && s.reason instanceof IstemciKoptuHatasi, `aborted=${s.aborted}`);
  }
}

async function kBlogu(): Promise<void> {
  console.log('\n── K) KOPMA: istemci koparsa motor baglantisi kapanir ──');
  motorKipi = 'askida';
  const bas = gunluk.length;
  const oncekiMotor = motorKayitlari.length;
  const ac = new AbortController();
  const istek = parseIstegi(ac.signal);
  const geldi = await bekle(() => motorKayitlari.length === oncekiMotor + 1, 3_000);
  check('K0 OLCUT: istek motora ulasti', geldi, `motor istegi=${motorKayitlari.length - oncekiMotor}`);
  const kayit = motorKayitlari[oncekiMotor];
  const kopmaAni = Date.now();
  ac.abort();
  const istemci = await istek;
  const kesildi = await bekle(() => kayit?.kesildi !== null, 1_500);
  check('K1 ⭐ istemci kopunca Nest motor baglantisini KAPATTI (1,5 sn icinde)',
    kesildi && kayit?.bitti === null,
    `istemci=${istemci.durum} kesildi=${kayit?.kesildi ? `${kayit.kesildi - kopmaAni} ms` : 'HAYIR — motor yetim isi surdurur'}`);
  await uyu(2_500); // servisin yeniden deneme beklemesi 2 sn
  check('K2 yeniden deneme YOK: motor bu istek icin TEK istek gordu',
    motorKayitlari.length === oncekiMotor + 1, `motor istegi=${motorKayitlari.length - oncekiMotor}`);
  const satirlar = yeniSatirlar(bas);
  const koptu = satirlar.filter((s) => s.startsWith('LOG') && s.includes('istemci koptu'));
  check('K3 gunlukte TEK "istemci koptu" satiri; "cold start retry" / hata satiri YOK',
    koptu.length === 1 && !satirlar.some((s) => s.startsWith('WARN') || s.startsWith('ERROR')),
    JSON.stringify(satirlar));
}

async function nBlogu(): Promise<void> {
  console.log('\n── N) NORMAL: kopmayan istek sonucunu alir ──');
  motorKipi = 'gec-yanit';
  const bas = gunluk.length;
  const oncekiMotor = motorKayitlari.length;
  const r = await parseIstegi();
  let govde: any = null;
  try { govde = JSON.parse(r.govde); } catch { /* govde asagida raporlanir */ }
  check('N1 ⭐ BOS multipart govdeli istek motorun sonucunu aldi (201, yanit Nest\'ten gecti)',
    r.durum === 201 && govde?.motor === 'taklit', `durum=${r.durum} govde=${r.govde.slice(0, 120)}`);
  const kayit = motorKayitlari[oncekiMotor];
  check('N2 motor baglantisi NORMAL bitti (yanit yazilmadan kesilmedi)',
    motorKayitlari.length === oncekiMotor + 1 && !!kayit?.bitti && kayit.kesildi === null,
    `istek=${motorKayitlari.length - oncekiMotor} bitti=${kayit?.bitti} kesildi=${kayit?.kesildi}`);
  await uyu(100);
  check('N3 kopmayan istekte "istemci koptu" satiri YOK',
    !yeniSatirlar(bas).some((s) => s.includes('istemci koptu')), JSON.stringify(yeniSatirlar(bas)));
}

async function yBlogu(): Promise<void> {
  console.log('\n── Y) sahiplik sorgusu surerken kopan istemci motora gitmez ──');
  motorKipi = 'askida';
  sahiplikGecikmesiMs = 500;
  const bas = gunluk.length;
  const oncekiMotor = motorKayitlari.length;
  const oncekiDogrula = dogrulaCagrisi;
  const ac = new AbortController();
  const istek = parseIstegi(ac.signal);
  // Sabit sure DEGIL: istek denetleyiciye (sahiplik sorgusuna) ulasinca kopulur —
  // yavas CI'da kopma denetleyiciden once gelirse Y2 yanlis kizarirdi.
  const ulasti = await bekle(() => dogrulaCagrisi > oncekiDogrula, 3_000);
  check('Y0 OLCUT: istek sahiplik sorgusuna ulasti (kopma denetleyicide)', ulasti, `dogrula=${dogrulaCagrisi - oncekiDogrula}`);
  ac.abort();
  await istek;
  await uyu(1_200);
  sahiplikGecikmesiMs = 0;
  check('Y1 kopmus istemci icin motora HIC istek gitmedi', motorKayitlari.length === oncekiMotor,
    `motor istegi=${motorKayitlari.length - oncekiMotor}`);
  check('Y2 gunlukte "istemci koptu" satiri var (iptal sessizce yutulmadi)',
    yeniSatirlar(bas).some((s) => s.includes('istemci koptu')), JSON.stringify(yeniSatirlar(bas)));
  check('Y3 ⭐ yakalanmamis istisna YOK — iptal edilmis sinyalle fetch cagrilmadi (Nest sureci dusmez)',
    yakalanmamis.length === 0, JSON.stringify(yakalanmamis));
}

async function zBlogu(): Promise<void> {
  console.log('\n── Z) ZAMAN ASIMI hala calisir (birlesik sinyal) ──');
  motorKipi = 'askida';
  const asil = AbortSignal.timeout.bind(AbortSignal);
  const istenen: number[] = [];
  (AbortSignal as any).timeout = (ms: number) => { istenen.push(ms); return asil(300); };
  const bas = gunluk.length;
  const oncekiMotor = motorKayitlari.length;
  let r: { durum: number | string; govde: string };
  // Istek surdukce 60 ms'de bir GC zorlanir: iki denemenin 300 ms'lik zaman asimi
  // da dolmadan en az bir GC gorur. Sinyal toplanirsa istek asili kalir → bekci (Z1 FAIL).
  const gcDongusu = setInterval(gcZorla, 60);
  try {
    r = await parseIstegi();
  } finally {
    clearInterval(gcDongusu);
    (AbortSignal as any).timeout = asil;
  }
  check('Z1 ⭐ motor yanit vermeyince istek zaman asimiyla biter (asili kalmaz): 503',
    r.durum === 503 && r.govde.includes('yanit vermedi'), `durum=${r.durum} govde=${r.govde.slice(0, 120)}`);
  const kayitlar = motorKayitlari.slice(oncekiMotor);
  // Istemci 503'u zaman asimi aninda alir; motor tarafinda soketin 'close'u birkac ms sonra gelir.
  await bekle(() => kayitlar.length === 2 && kayitlar.every((k) => k.kesildi !== null), 1_000);
  check('Z2 eskisi gibi TEK yeniden deneme; iki motor baglantisi da zaman asimiyla kapandi',
    kayitlar.length === 2 && kayitlar.every((k) => k.kesildi !== null),
    `istek=${kayitlar.length} kesildi=${kayitlar.map((k) => k.kesildi !== null)}`);
  check('Z3 zaman asimi sabitleri aynen (300 sn ilk + 300 sn yeniden deneme)',
    JSON.stringify(istenen) === JSON.stringify([300_000, 300_000]), JSON.stringify(istenen));
  check('Z4 zaman asimi "istemci koptu" sayilmaz (istemci bekliyordu)',
    !yeniSatirlar(bas).some((s) => s.includes('istemci koptu'))
      && yeniSatirlar(bas).some((s) => s.startsWith('WARN') && s.includes('TimeoutError')),
    JSON.stringify(yeniSatirlar(bas)));
}

async function main(): Promise<void> {
  sBlogu();

  await new Promise<void>((r) => motor.listen(0, '127.0.0.1', r));
  process.env.DWG_ENGINE_URL = `http://127.0.0.1:${(motor.address() as AddressInfo).port}`;
  delete process.env.DWG_ENGINE_TOKEN;
  const app = await NestFactory.create<NestExpressApplication>(OlcumModulu, { logger: yakalayici });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  nestPort = (app.getHttpServer().address() as AddressInfo).port;
  try {
    await kBlogu();
    await nBlogu();
    await yBlogu();
    await zBlogu();
  } finally {
    await app.close();
    motor.closeAllConnections();
    await new Promise<void>((r) => motor.close(() => r()));
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
