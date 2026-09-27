/**
 * DWG KIRACI DEDUP — KAPI · `npm run test:dwg-kiraci-dedup` (26.09.2026)
 *
 * AG ve DB GEREKTIRMEZ: GERCEK `DwgEngineController` + GERCEK `DwgEngineService`
 * + GERCEK `DwgSahiplikServisi` 127.0.0.1'de Nest+Express olarak kalkar. Prisma
 * yerine bellek ici `dwgDosya` tablosu (satir KOPYASI doner, canli nesne degil),
 * DWG motoru yerine surec ici taklit HTTP sunucusu durur. Kimlik (JWT/erisim)
 * olcum disi: sinif duzeyi kapilar bir test kapisiyla golgelenir, firma istegin
 * `x-test-firma` basligindan gelir. Rota, parametre ve govde gercek denetleyiciden.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Motor /upload'da ayni icerigi (sha256) TUM kiracilar arasinda tekillestiriyordu
 * ve mevcut file_id'yi `dedup: true` ile donuyordu. Sahiplik kaydi (upsert,
 * `update: {}`) ilk firmada kaldigi icin ikinci firma KENDI yuklemesinin /status,
 * /geometry ve /parse cagrilarinda 403 aliyor, ayni cizimi baska bir firmanin
 * yukledigini ogreniyordu (on yuz "Bu dosya daha once yuklenmisti" diyordu).
 * Gercekci senaryo: ayni ihale cizimi birden cok yukleniciye gider. Motor tarafi:
 * `python/tests/test_dedup_kapsam.py` (CI'da yok).
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   R  ⭐ BUGUNKU MOTOR (kapsami bilmez, `kapsamli` isareti yok: canli motor ve
 *      surum kaymasi). HER yukleme ayni 503'u alir — ilk firmanin da, ayni
 *      dosyanin da, farkli dosyanin da; yanitlar AYNI, hicbirinde kimlik yok,
 *      sahiplik yazilmaz, her yuklemede ERROR. Yalniz tekillestirilen dosya
 *      reddedilseydi "bu cizimi baskasi yuklemis" yine okunurdu (guvenlik
 *      incelemesi 26.09). Fikstur kaniti: taklit motor ikinci yuklemeyi GERCEKTEN
 *      ilk kimlige tekillestirdi.
 *   L  ⭐ YALANCI MOTOR ("kapsamladim" der, yine de tum kiracilarda tekillestirir):
 *      ikinci firma ilk firmanin kimligini ALMAZ (genel 503, "CAPRAZ-FIRMA DEDUP"
 *      ERROR), ilk firmanin sahipligi ve erisimi degismez.
 *   U  ⭐ KAPSAMLI MOTOR (duzeltilmis sozlesme). Nest her yuklemeye firmaya ozgu
 *      opak kapsam gonderir (64 hex, firma icinde sabit, firmalar arasi farkli,
 *      firma kimligini acik icermez); ikinci firma kendi file_id'siyle /status,
 *      /geometry, /parse'i kullanir; firma ici tekillestirme korunur; capraz
 *      erisim 403 ve motora gitmez; istemci yaniti yalniz file_id/status/dedup.
 *   F  bicimsiz file_id (motor `uuid4().hex[:12]` uretir) 400 — motora ve DB'ye
 *      gitmeden; /status, /geometry ve /parse'in ucu da.
 *   G  ⭐ KAYITSIZ KIMLIK KAPALI (Emre 26.09; 28.08'deki "bilincli aciklik" bitti):
 *      bicimli ama sahiplik kaydi olmayan file_id 403 ve motora gitmez; yanit,
 *      baska firmanin dosyasina verilenle AYNI (var/yok ayirt edilemez). Sahiplik
 *      kaydi yazilamazsa yukleme HATA verir (eskiden yutuluyordu — kapi kapaliyken
 *      yuklenen dosya sahibine de kapanirdi); DB donunce ayni dosya ayni id'yle
 *      kaydolur. Motor bicimsiz id donerse yukleme hata verir, kayit yazilmaz.
 *   Y  YARIS: `update: {}` upsert'u atomik degil (Prisma 5.22 SELECT+INSERT); ayni
 *      dosyayi ayni anda yukleyen ikinci istek P2002 alir. Kazanan AYNI firmaysa
 *      yukleme gecer; BASKA firmaysa kimlik verilmez.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 * ⚠ `process.exit` YOK: Windows'ta acik fetch soketiyle `process.exit(1)`
 * sureci 0xC0000409 ile cokertiyor. Basarisizlik `process.exitCode = 1`.
 */
import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Module, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/altyapi/db/prisma.service';
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

const FIRMA_A = 'firma-aaaa-1111';
const FIRMA_B = 'firma-bbbb-2222';
const ICERIK = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');
const BICIM = /^[0-9a-f]{12}$/;
const tamam = (d: number) => d === 200 || d === 201;

// ── Nest gunlugu yakalanir ──────────────────────────────────────────────────
const gunluk: string[] = [];
const yakalayici: LoggerService = {
  log: (m: unknown) => void gunluk.push(`LOG ${String(m)}`),
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
};
const errorSatirlari = (bas: number, ipucu: string) =>
  gunluk.slice(bas).filter((s) => s.startsWith('ERROR') && s.includes(ipucu));

// ── Bellek ici dwgDosya (Prisma yerine) ─────────────────────────────────────
const satirlar = new Map<string, Record<string, unknown>>();
let dbSorgusu = 0;
/** G3: sahiplik yazimi DB hatasiyla duser (baglanti koptu). */
let dbArizasi = false;
/** Y: yazimdan ONCE ayni kimligi bu firma adina baska bir istek yazmis olur → P2002. */
let yarisanFirma: string | null = null;
const sahtePrisma = {
  dwgDosya: {
    findUnique: async ({ where }: { where: { fileId: string } }) => {
      dbSorgusu++;
      const s = satirlar.get(where.fileId);
      return s ? { ...s } : null;
    },
    upsert: async ({ where, create, update }: any) => {
      dbSorgusu++;
      if (dbArizasi) throw new Error('Can\'t reach database server (taklit ariza)');
      if (yarisanFirma) {
        // Prisma 5.22 `update: {}`: SELECT (yok) → baska istek INSERT → bizim INSERT P2002.
        satirlar.set(where.fileId, { id: randomUUID(), olusturuldu: new Date(), ...create, firmaId: yarisanFirma });
        yarisanFirma = null;
        throw Object.assign(new Error('Unique constraint failed on the fields: (`fileId`)'), { code: 'P2002' });
      }
      const var_ = satirlar.get(where.fileId);
      const yeni = var_ ? { ...var_, ...update } : { id: randomUUID(), olusturuldu: new Date(), ...create };
      satirlar.set(where.fileId, yeni);
      return { ...yeni };
    },
  },
};

// ── Taklit DWG motoru ───────────────────────────────────────────────────────
// 'bugunku' : kapsami bilmez, `kapsamli` isareti yok, tum kiracilarda tekillestirir
//             (bugunku canli motor main.py upload_async; surum kaymasinda da boyle).
// 'yalanci' : `kapsamli: true` der ama yine tum kiracilarda tekillestirir (gerileme).
// 'kapsamli': yalniz ayni kapsamda tekillestirir, kapsam varsa `kapsamli: true`;
//             kapsamsiz yukleme tekillestirilmez.
type MotorKipi = 'bugunku' | 'yalanci' | 'kapsamli';
type Yukleme = { kapsam: string | null; hash: string; yanit: Record<string, unknown> };
let motorKipi: MotorKipi = 'bugunku';
/** G5: motor bicimsiz kimlik donerse (motor hatasi) — yuklemenin kimligi bu olur. */
let motorunVerdigiKimlik: string | null = null;
const motorIstekleri: string[] = [];
const yuklemeler: Yukleme[] = [];
const bilinen = new Set<string>();
const dedupTablosu = new Map<string, string>();

function govdeOku(req: IncomingMessage): Promise<Buffer> {
  return new Promise((coz, reddet) => {
    const parcalar: Buffer[] = [];
    req.on('data', (p: Buffer) => parcalar.push(p));
    req.on('end', () => coz(Buffer.concat(parcalar)));
    req.on('error', reddet);
  });
}

function json(res: ServerResponse, durum: number, govde: unknown): void {
  res.statusCode = durum;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(govde));
}

const motor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://motor');
  motorIstekleri.push(`${req.method} ${url.pathname}${url.search}`);
  const govde = await govdeOku(req);
  if (req.method === 'POST' && url.pathname === '/upload') {
    const form = await new Response(new Uint8Array(govde), {
      headers: { 'content-type': String(req.headers['content-type']) },
    }).formData();
    const dosya = form.get('file') as Blob;
    const hash = createHash('sha256').update(Buffer.from(await dosya.arrayBuffer())).digest('hex').slice(0, 16);
    const kapsamAlani = form.get('kapsam');
    const kapsam = typeof kapsamAlani === 'string' ? kapsamAlani : null;
    const anahtar = motorKipi !== 'kapsamli' ? hash : kapsam ? `${hash}|${kapsam}` : null;
    const isaret = motorKipi === 'yalanci' || (motorKipi === 'kapsamli' && kapsam) ? { kapsamli: true } : {};
    const eski = anahtar ? dedupTablosu.get(anahtar) : undefined;
    let yanit: Record<string, unknown>;
    if (eski) {
      yanit = { file_id: eski, status: 'ready', dedup: true, ...isaret };
    } else {
      const fileId = motorunVerdigiKimlik ?? randomBytes(6).toString('hex');
      bilinen.add(fileId);
      if (anahtar) dedupTablosu.set(anahtar, fileId);
      yanit = { file_id: fileId, status: 'processing', ...isaret };
    }
    yuklemeler.push({ kapsam, hash, yanit });
    return json(res, 200, yanit);
  }
  const durumYolu = /^\/(status|geometry)\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && durumYolu) {
    const id = decodeURIComponent(durumYolu[2]);
    if (!bilinen.has(id)) return json(res, 404, { detail: 'file_id bilinmiyor' });
    return json(res, 200, durumYolu[1] === 'status'
      ? { status: 'ready', total_layers: 1, layers: [{ name: 'BORU' }], suggested_scale: 0.001 }
      : { entities: [], layers: ['BORU'] });
  }
  if (req.method === 'POST' && url.pathname === '/parse') {
    const id = url.searchParams.get('file_id') ?? '';
    if (!bilinen.has(id)) return json(res, 404, { detail: 'Dosya bulunamadi. Lutfen tekrar yukleyin.' });
    return json(res, 200, { motor: 'taklit', edge_segments: [] });
  }
  return json(res, 404, { detail: 'Not Found' });
});

// ── Olcum denetleyicisi: GERCEK sinif, yalniz sinif duzeyi kapilar golgelenir ──
const testKapisi = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const firma = String(req.headers['x-test-firma'] ?? '');
    req.user = { id: `kisi-${firma}`, firmaId: firma };
    return true;
  },
};
class OlcumDenetleyicisi extends DwgEngineController {}
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumDenetleyicisi);

@Module({
  controllers: [OlcumDenetleyicisi],
  providers: [DwgEngineService, DwgSahiplikServisi, { provide: PrismaService, useValue: sahtePrisma }],
})
class OlcumModulu {}

let nestPort = 0;
type Yanit = { durum: number; govde: string; veri: any };

async function istek(firma: string, yontem: 'GET' | 'POST', yol: string, body?: FormData): Promise<Yanit> {
  const r = await fetch(`http://127.0.0.1:${nestPort}/api/dwg-engine${yol}`, {
    method: yontem,
    body,
    headers: { 'x-test-firma': firma },
    signal: AbortSignal.timeout(15_000),
  });
  const govde = await r.text();
  let veri: any = null;
  try {
    veri = JSON.parse(govde);
  } catch {
    /* govde JSON degil — ham metin olculur */
  }
  return { durum: r.status, govde, veri };
}

function yukle(firma: string, icerik: Buffer = ICERIK): Promise<Yanit> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(icerik)]), 'ihale-pafta.dxf');
  return istek(firma, 'POST', '/upload', form);
}

/** Bir file_id'yi kullanan uc tuketici cagri: /status, /geometry, /parse. */
async function tuket(firma: string, fileId: string): Promise<number[]> {
  const sorgu = new URLSearchParams({ file_id: fileId, selected_layers: JSON.stringify(['BORU']) });
  return [
    (await istek(firma, 'GET', `/status/${encodeURIComponent(fileId)}`)).durum,
    (await istek(firma, 'GET', `/geometry/${encodeURIComponent(fileId)}`)).durum,
    (await istek(firma, 'POST', `/parse?${sorgu}`, new FormData())).durum,
  ];
}

function sifirla(kip: MotorKipi): void {
  motorKipi = kip;
  satirlar.clear();
  yuklemeler.length = 0;
  bilinen.clear();
  dedupTablosu.clear();
}

async function rBlogu(): Promise<void> {
  console.log('\n── R) BUGUNKU MOTOR: kapsam isareti yok → HER yukleme ayni 503 ──');
  sifirla('bugunku');
  const bas = gunluk.length;
  const a = await yukle(FIRMA_A);
  const b = await yukle(FIRMA_B);
  const bFarkli = await yukle(FIRMA_B, Buffer.from('0\nEOF\n999\nFARKLI\n'));
  const aId = yuklemeler[0]?.yanit.file_id as string;
  check('R0 FIKSTUR KANITI: taklit motor ikinci firmanin yuklemesini ilk kimlige TEKILLESTIRDI',
    yuklemeler.length === 3 && BICIM.test(aId ?? '') && yuklemeler[1].yanit.file_id === aId
      && yuklemeler[1].yanit.dedup === true && yuklemeler.every((y) => y.yanit.kapsamli === undefined),
    JSON.stringify(yuklemeler.map((y) => y.yanit)));
  check('R1 ⭐ uc yukleme de 503 (ilk firma · ayni dosya · farkli dosya) — dosyaya ozgu sinyal yok',
    [a, b, bFarkli].every((y) => y.durum === 503), JSON.stringify([a.durum, b.durum, bFarkli.durum]));
  check('R2 ⭐ uc yanit govdesi BIREBIR ayni; hicbirinde kimlik ya da dedup yok',
    a.govde === b.govde && b.govde === bFarkli.govde && !a.govde.includes(aId ?? '#') && !/dedup|file_id/i.test(a.govde),
    JSON.stringify([a.govde, b.govde, bFarkli.govde]));
  check('R3 sahiplik YAZILMADI', satirlar.size === 0, JSON.stringify([...satirlar.keys()]));
  check('R4 her yuklemede ERROR iz satiri (kapsam bildirilmedi)',
    errorSatirlari(bas, 'kapsamini uyguladigini bildirmedi').length === 3,
    JSON.stringify(gunluk.slice(bas)));
}

async function lBlogu(): Promise<void> {
  console.log('\n── L) YALANCI MOTOR: "kapsamladim" der, tum kiracilarda tekillestirir ──');
  sifirla('yalanci');
  const a = await yukle(FIRMA_A);
  const aId: string = a.veri?.file_id;
  check('L0 FIKSTUR: ilk firmanin yuklemesi file_id aldi (12 hex, isleniyor)',
    a.durum === 201 && BICIM.test(aId ?? '') && a.veri?.status === 'processing', `${a.durum} ${a.govde}`);
  const bas = gunluk.length;
  const b = await yukle(FIRMA_B);
  check('L0b FIKSTUR KANITI: taklit motor ikinci yuklemeyi ilk kimlige TEKILLESTIRDI (kapsamli dedi)',
    yuklemeler[1]?.yanit.file_id === aId && yuklemeler[1]?.yanit.dedup === true && yuklemeler[1]?.yanit.kapsamli === true,
    JSON.stringify(yuklemeler.map((y) => y.yanit)));
  check('L1 ⭐ ikinci firma 503, ilk firmanin kimligi/dedup bayragi YOK',
    b.durum === 503 && b.veri?.file_id === undefined && !b.govde.includes(aId) && !/dedup/i.test(b.govde),
    `${b.durum} ${b.govde}`);
  check('L2 ilk firmanin sahipligi degismedi, kendi dosyasini kullaniyor',
    satirlar.get(aId)?.firmaId === FIRMA_A && (await tuket(FIRMA_A, aId)).every(tamam),
    JSON.stringify(satirlar.get(aId)));
  check('L3 gunlukte capraz-firma iz satiri (ERROR, kimlikle)',
    errorSatirlari(bas, 'CAPRAZ-FIRMA DEDUP').some((s) => s.includes(aId)), JSON.stringify(gunluk.slice(bas)));
}

async function uBlogu(): Promise<void> {
  console.log('\n── U) KAPSAMLI MOTOR: yalniz ayni kapsamda tekillestirir ──');
  sifirla('kapsamli');
  const a = await yukle(FIRMA_A);
  const aId: string = a.veri?.file_id;
  const b = await yukle(FIRMA_B);
  const bId: string = b.veri?.file_id;
  const a2 = await yukle(FIRMA_A);

  const [ka, kb, ka2] = yuklemeler.map((y) => y.kapsam);
  check('U1 ⭐ Nest her yuklemeye kapsam gonderir: 64 hex, firma icinde sabit, firmalar arasi farkli',
    yuklemeler.length === 3 && /^[0-9a-f]{64}$/.test(ka ?? '') && ka === ka2 && ka !== kb && /^[0-9a-f]{64}$/.test(kb ?? ''),
    JSON.stringify([ka, kb, ka2]));
  check('U1b kapsam opak: firma kimligini acik icermez',
    ![ka, kb].some((k) => (k ?? '').includes(FIRMA_A) || (k ?? '').includes(FIRMA_B)), JSON.stringify([ka, kb]));
  check('U2 ⭐ ikinci firma KENDI file_id\'sini aldi, dedup bayragi yok',
    b.durum === 201 && BICIM.test(bId ?? '') && bId !== aId && !/dedup/i.test(b.govde), `${b.durum} ${b.govde}`);
  const bKullanim = BICIM.test(bId ?? '') ? await tuket(FIRMA_B, bId) : [];
  check('U3 ⭐ ikinci firma kendi yuklemesiyle /status, /geometry, /parse kullaniyor (200)',
    bKullanim.length === 3 && bKullanim.every(tamam), JSON.stringify(bKullanim));
  check('U4 firma ici tekillestirme korunur: ayni firma ayni dosyada ayni file_id + dedup',
    a2.veri?.file_id === aId && a2.veri?.dedup === true, a2.govde);
  check('U5 sahiplik: her file_id kendi firmasinda',
    satirlar.get(aId)?.firmaId === FIRMA_A && satirlar.get(bId)?.firmaId === FIRMA_B,
    JSON.stringify([...satirlar.values()].map((s) => [s.fileId, s.firmaId])));
  check('U7 istemci yaniti yalniz file_id/status(/dedup): motorun ic alanlari gecmez',
    JSON.stringify(Object.keys(a.veri ?? {}).sort()) === '["file_id","status"]'
      && JSON.stringify(Object.keys(a2.veri ?? {}).sort()) === '["dedup","file_id","status"]',
    JSON.stringify([a.veri, a2.veri]));

  const onceMotor = motorIstekleri.length;
  const capraz = await tuket(FIRMA_B, aId);
  check('U6 capraz erisim 403 ve motora GITMEZ',
    capraz.every((d) => d === 403) && motorIstekleri.length === onceMotor,
    `durum=${JSON.stringify(capraz)} motor=${JSON.stringify(motorIstekleri.slice(onceMotor))}`);
}

async function fBlogu(): Promise<void> {
  console.log('\n── F) BICIM: file_id 12 kucuk hex; degilse 400, motora ve DB\'ye gitmez ──');
  const bicimsizler = ['ABCDEF012345', '0123456789a', '0123456789abc', '0123456789a_', '../../etc/passwd', 'x'.repeat(40)];
  for (const kotu of bicimsizler) {
    const onceMotor = motorIstekleri.length;
    const onceDb = dbSorgusu;
    const durumlar = await tuket(FIRMA_A, kotu);
    check(`F1 bicimsiz ${JSON.stringify(kotu)} → 400 (status/geometry/parse), motor ve DB cagrilmadi`,
      durumlar.every((d) => d === 400) && motorIstekleri.length === onceMotor && dbSorgusu === onceDb,
      `durum=${JSON.stringify(durumlar)} motor=${JSON.stringify(motorIstekleri.slice(onceMotor))} db=${dbSorgusu - onceDb}`);
  }
}

async function gBlogu(): Promise<void> {
  console.log('\n── G) KAYITSIZ KIMLIK KAPALI · sahiplik yazilamazsa yukleme hata verir ──');
  sifirla('kapsamli');
  const aId: string = (await yukle(FIRMA_A)).veri?.file_id;
  const kayitsiz = randomBytes(6).toString('hex');
  bilinen.add(kayitsiz); // motor dosyayi taniyor; yalniz sahiplik kaydi yok
  check('G0 FIKSTUR: kayitsiz kimlik bicimli ve motorda var, DB\'de yok',
    BICIM.test(kayitsiz) && !satirlar.has(kayitsiz) && BICIM.test(aId ?? ''), kayitsiz);

  const onceMotor = motorIstekleri.length;
  const durumlar = await tuket(FIRMA_B, kayitsiz);
  check('G1 ⭐ bicimli ama kaydi olmayan file_id 403 ve motora GITMEZ (status/geometry/parse)',
    durumlar.every((d) => d === 403) && motorIstekleri.length === onceMotor,
    `durum=${JSON.stringify(durumlar)} motor=${JSON.stringify(motorIstekleri.slice(onceMotor))}`);
  const yabanci = await istek(FIRMA_B, 'GET', `/status/${aId}`);
  const yok = await istek(FIRMA_B, 'GET', `/status/${kayitsiz}`);
  check('G2 var/yok ayirt edilemez: baska firmanin dosyasi ile kayitsiz kimlik AYNI yanit',
    yabanci.durum === 403 && yok.durum === yabanci.durum && yok.govde === yabanci.govde,
    `yabanci=${yabanci.durum} ${yabanci.govde} | kayitsiz=${yok.durum} ${yok.govde}`);

  // G3/G4: sahiplik yazilamazsa yukleme HATA — kapi kapaliyken sessiz devam, dosyayi sahibine de kapatirdi.
  const gunlukBas = gunluk.length;
  dbArizasi = true;
  const cIcerik = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n999\nG3\n');
  const c = await yukle(FIRMA_B, cIcerik);
  dbArizasi = false;
  const cMotorId = yuklemeler[yuklemeler.length - 1]?.yanit.file_id as string;
  check('G3 ⭐ sahiplik yazilamazsa yukleme HATA verir (503) ve kullanilamaz kimlik donmez',
    c.durum === 503 && c.veri?.file_id === undefined && !c.govde.includes(cMotorId) && !satirlar.has(cMotorId),
    `durum=${c.durum} govde=${c.govde} motorId=${cMotorId}`);
  check('G3b gunlukte sahiplik yazma hatasi ERROR olarak iz birakir',
    errorSatirlari(gunlukBas, 'sahiplik').some((s) => s.includes(cMotorId)), JSON.stringify(gunluk.slice(gunlukBas)));
  const c2 = await yukle(FIRMA_B, cIcerik);
  const c2Kullanim = c2.veri?.file_id === cMotorId ? await tuket(FIRMA_B, cMotorId) : [];
  check('G4 DB donunce ayni dosya ayni kimlikle kaydolur ve calisir (firma ici tekillestirme)',
    c2.durum === 201 && c2.veri?.file_id === cMotorId && satirlar.get(cMotorId)?.firmaId === FIRMA_B
      && c2Kullanim.length === 3 && c2Kullanim.every(tamam),
    `${c2.durum} ${c2.govde} kullanim=${JSON.stringify(c2Kullanim)}`);

  // G5: motor bicimsiz kimlik donerse (motor hatasi) kayit yazilmaz, yukleme hata verir.
  motorunVerdigiKimlik = '../KOTU-kimlik';
  const d = await yukle(FIRMA_A, Buffer.from('G5 farkli icerik'));
  motorunVerdigiKimlik = null;
  check('G5 motor bicimsiz kimlik donerse yukleme 503, sahiplik kaydi yazilmaz',
    d.durum === 503 && d.veri?.file_id === undefined && !d.govde.includes('KOTU') && !satirlar.has('../KOTU-kimlik'),
    `durum=${d.durum} govde=${d.govde}`);
}

async function yBlogu(): Promise<void> {
  console.log('\n── Y) YARIS: ayni kimligi ayni anda yazan iki istek (P2002) ──');
  sifirla('kapsamli');
  const bas = gunluk.length;
  yarisanFirma = FIRMA_A; // ayni firmanin baska sekmesi/uyesi az once yazdi
  const a = await yukle(FIRMA_A);
  const aId: string = a.veri?.file_id;
  check('Y0 FIKSTUR: yaris GERCEKTEN yasandi (P2002 firlatildi, satir yarisanin)',
    yarisanFirma === null && satirlar.get(aId)?.firmaId === FIRMA_A, JSON.stringify([yarisanFirma, satirlar.get(aId)]));
  const aKullanim = BICIM.test(aId ?? '') ? await tuket(FIRMA_A, aId) : [];
  check('Y1 ⭐ ayni firma yarisi: yukleme gecer (201) ve dosya calisir; yaris "yazilamadi" sayilmaz',
    a.durum === 201 && aKullanim.length === 3 && aKullanim.every(tamam)
      && errorSatirlari(bas, 'yazilamadi').length === 0,
    `${a.durum} ${a.govde} kullanim=${JSON.stringify(aKullanim)} gunluk=${JSON.stringify(gunluk.slice(bas))}`);

  yarisanFirma = FIRMA_B; // yapay: kimligi BASKA firma kazanmis
  const c = await yukle(FIRMA_A, Buffer.from('Y2 baska icerik'));
  const cMotorId = yuklemeler[yuklemeler.length - 1]?.yanit.file_id as string;
  check('Y2 yarisi baska firma kazandiysa kimlik VERILMEZ (503, sahiplik degismez)',
    c.durum === 503 && c.veri?.file_id === undefined && satirlar.get(cMotorId)?.firmaId === FIRMA_B,
    `${c.durum} ${c.govde} ${JSON.stringify(satirlar.get(cMotorId))}`);
  yarisanFirma = null;
}

async function main(): Promise<void> {
  await new Promise<void>((r) => motor.listen(0, '127.0.0.1', r));
  process.env.DWG_ENGINE_URL = `http://127.0.0.1:${(motor.address() as AddressInfo).port}`;
  delete process.env.DWG_ENGINE_TOKEN;
  const app = await NestFactory.create<NestExpressApplication>(OlcumModulu, { logger: yakalayici });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  nestPort = (app.getHttpServer().address() as AddressInfo).port;
  try {
    await rBlogu();
    await lBlogu();
    await uBlogu();
    await fBlogu();
    await gBlogu();
    await yBlogu();
  } finally {
    await app.close();
    motor.closeAllConnections();
    await new Promise<void>((r) => motor.close(() => r()));
  }

  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    process.exitCode = 1;
  }
}

bitmezseKirmizi(main().catch((e) => {
  console.error('BEKLENMEYEN:', e);
  process.exitCode = 1;
}));
