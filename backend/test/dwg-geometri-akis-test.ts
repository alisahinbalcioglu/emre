/**
 * DWG GEOMETRI AKISI — KAPI · `npm run test:dwg-geometri-akis` (26.09.2026)
 *
 * AG ve DB GEREKTIRMEZ: GERCEK `DwgEngineController` + GERCEK `DwgEngineService`
 * 127.0.0.1'de Nest+Express olarak kalkar; DWG motoru yerine SUREC ICI taklit
 * HTTP sunucusu durur. Istemci GERCEK `fetch` ile gider (govdeyi parca parca okur).
 * Kapilar (JWT/erisim) olcum disi: alt sinifta sinif duzeyi kapilar bir test
 * kapisiyla GOLGELENIR; rota ve parametreler gercek denetleyiciden miras.
 * Sahiplik taklit ama SIRASI olculur (G2'nin kaynak kapisi: guvenlik-turu-2).
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * `getGeometry` motorun geometri yanitini (canlida 11,5 ve 17 MB) `response.json()`
 * ile cozup Express'e yeniden yazdiriyordu. Olculdu (canli backend imaji, Node
 * 20.20.2, 1 CPU, 18 MB): JSON.parse 443 ms + JSON.stringify 253 ms — Nest'in TEK
 * olay dongusu (tum kiracilarin tum API istekleri) her proje acilisinda ~0,7 sn
 * duruyordu. Motor 26.09'dan beri yanitin kendisini (katı JSON, UTF-8) akitiyor
 * (`python/tests/test_olay_dongusu.py` D5): Nest'in cozmesine gerek yok.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   A  ⭐ AKTARIM: yanit motorun baytlarinin AYNISI (kanonik olmayan bicim —
 *      Python ayraclari, `12.0`, `2e3`, `Ø` kacisi — korunur), Content-Type
 *      application/json. Olcut: parse + stringify bu govdeyi DEGISTIRIR.
 *   D  ⭐ DONGU: 17 MB govde akarken olay dongusunun en uzun gecikmesi esigin
 *      altinda. Esik makineden bagimsiz: ayni govdenin bu surecte olculen
 *      JSON.parse suresine baglidir (cozmek en az o kadar durdurur).
 *   H  HATA ESLEMESI aynen: motor 409 ("geometri onbellekte yok") / 404 / 410 →
 *      422 (on yuz "Oturum sona erdi… yeniden yukleyin"); 500 → TEK yeniden deneme
 *      + 503; 429 → 503. Govdede motorun mesaji.
 *   S  SAHIPLIK motordan ONCE; 403 verirse motora istek YOK.
 *   K  ⭐ KOPMA: istemci govde akarken koparsa Nest motor baglantisini kapatir
 *      (akis sizmaz), yeniden deneme yok, tek "istemci koptu" satiri, hata satiri yok.
 *   Y  YARIM: motor govdenin ortasinda olurse istemci TAMAM gorunen yanit ALMAZ
 *      (ag hatasi → on yuz yeniden dener); sessiz yarim JSON yok.
 *   Z  ZAMAN: baslik zaman asimi aynen (60 + 90 sn, GC zorlanarak — Node 20'de
 *      AbortSignal.timeout kaynagi zayif tutulur) → 503; GOVDE baslik suresine
 *      BAGLI DEGIL (yavas istemci/uzun akis kesilmez); govde tavani asili motoru keser.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 * ⚠ `process.exit` YOK: Windows'ta acik fetch soketiyle `process.exit(1)`
 * sureci 0xC0000409 ile cokertiyor. Basarisizlik `process.exitCode = 1`.
 */
import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { ForbiddenException, Module, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

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

setFlagsFromString('--expose-gc');
const gcZorla = runInNewContext('gc') as () => void;

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

const gunluk: string[] = [];
const yakalayici: LoggerService = {
  log: (m: unknown) => void gunluk.push(`LOG ${String(m)}`),
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
};
const yeniSatirlar = (bas: number) => gunluk.slice(bas).filter((s) => s.includes('[getGeometry]'));

// ── Kanonik OLMAYAN, canli boyutta geometri govdesi ────────────────────────
// Motorun gercek bicimi Python `json.dumps`: ", " / ": " ayraclari, `12.0`.
// JSON.parse + JSON.stringify ayraclari siler, `12.0`→`12`, `2e3`→`2000`,
// `Ø`→`Ø` yapar — yeniden yazim BAYTLARI degistirir.
function geometriGovdesi(hedefMb: number): Buffer {
  let tohum = 26;
  const rnd = () => {
    tohum = (tohum * 16807) % 2147483647;
    return (tohum / 2147483647) * 1e5 - 5e4;
  };
  const sayi = () => rnd().toFixed(6);
  const parcalar: string[] = [];
  let boy = 0;
  let i = 0;
  while (boy < hedefMb * 1e6) {
    const p = i % 5 === 0
      ? `{"layer": "YAY", "color": 256, "center": [${sayi()}, ${sayi()}], "radius": 12.0, `
        + `"start_angle": 2e3, "end_angle": 90.0}`
      : `{"layer": "BORU-${i % 40}", "color": 256, "coords": [${sayi()}, ${sayi()}, ${sayi()}, ${sayi()}]}`;
    parcalar.push(p);
    boy += p.length + 2;
    i++;
  }
  const metin = `{"lines": [${parcalar.join(', ')}], "texts": [{"text": "\\u00d850 ÇİĞÖŞÜ", `
    + `"layer": "YAZI", "color": 7, "position": [1.0, 2.0], "height": 2.5, "rotation": 0.0}], `
    + `"bounds": [-50000.0, -50000.0, 50000.0, 50000.0], "layer_colors": {"YAZI": 7}}`;
  return Buffer.from(metin, 'utf-8');
}
const BUYUK = geometriGovdesi(17);
const BUYUK_OZET = createHash('sha256').update(BUYUK).digest('hex');

// ── Taklit DWG motoru ─────────────────────────────────────────────────────
type MotorKaydi = { yol: string; geldi: number; kesildi: number | null; bitti: number | null };
const motorKayitlari: MotorKaydi[] = [];
type MotorKipi =
  | 'buyuk' // tum govde bir seferde
  | 'yavas' // 64 KB parca, 10 ms arayla (~2,7 sn): kopma ve zaman icin uzun akis
  | 'yarim' // basliklar + 1 MB, sonra soket yikilir (motor oldu)
  | 'askida' // hic yanit yok
  | { durum: number; govde: string };
let motorKipi: MotorKipi = 'buyuk';
let olayIzi: string[] = []; // S: dogrula ile motor isteginin SIRASI

const motor = createServer((req: IncomingMessage, res: ServerResponse) => {
  const kayit: MotorKaydi = { yol: req.url ?? '', geldi: Date.now(), kesildi: null, bitti: null };
  motorKayitlari.push(kayit);
  olayIzi.push('motor');
  res.on('close', () => {
    if (res.writableFinished) kayit.bitti = Date.now();
    else kayit.kesildi = Date.now();
  });
  const kip = motorKipi;
  if (kip === 'askida') return;
  if (typeof kip === 'object') {
    res.writeHead(kip.durum, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(kip.govde) });
    res.end(kip.govde);
    return;
  }
  // Gercek motor gibi (FileResponse) uzunluk bildirilir; 'yarim' kipte de TAM uzunluk.
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': BUYUK.length });
  if (kip === 'buyuk') {
    res.end(BUYUK);
    return;
  }
  if (kip === 'yarim') {
    res.write(BUYUK.subarray(0, 1 << 20), () => setTimeout(() => res.socket?.destroy(), 50));
    return;
  }
  // 'yavas'
  let konum = 0;
  const yaz = () => {
    if (res.destroyed) return;
    if (konum >= BUYUK.length) {
      res.end();
      return;
    }
    res.write(BUYUK.subarray(konum, konum + 65536));
    konum += 65536;
    setTimeout(yaz, 10);
  };
  yaz();
});

// ── Olcum denetleyicisi: GERCEK sinif, yalniz sinif duzeyi kapilar golgelenir ──
let sahiplikReddi = false;
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
        dogrula: async () => {
          olayIzi.push('dogrula');
          if (sahiplikReddi) throw new ForbiddenException('Bu dosyaya erisim yetkiniz yok');
        },
        kaydet: async () => undefined,
      },
    },
  ],
})
class OlcumModulu {}

let nestPort = 0;
type Sonuc = {
  durum: number | string; tip: string | null; uzunluk: string | null; boy: number; ozet: string;
  govde: string; hata: string | null;
};
/** Geometri istegi; govde PARCA PARCA okunur (tek birlestirme yok). 20 sn bekci. */
async function geometriIstegi(opts: { kes?: AbortSignal; yavasOku?: number } = {}): Promise<Sonuc> {
  const bekci = new AbortController();
  const z = setTimeout(() => bekci.abort(new Error('BEKCI: 20 sn')), 20_000);
  const sinyal = opts.kes ? AbortSignal.any([opts.kes, bekci.signal]) : bekci.signal;
  const sonuc: Sonuc = { durum: 'yok', tip: null, uzunluk: null, boy: 0, ozet: '', govde: '', hata: null };
  try {
    const r = await fetch(`http://127.0.0.1:${nestPort}/api/dwg-engine/geometry/0123456789ab`, { signal: sinyal });
    sonuc.durum = r.status;
    sonuc.tip = r.headers.get('content-type');
    sonuc.uzunluk = r.headers.get('content-length');
    const ozet = createHash('sha256');
    const kucuk: Buffer[] = [];
    for await (const parca of r.body as unknown as AsyncIterable<Uint8Array>) {
      ozet.update(parca);
      sonuc.boy += parca.length;
      if (sonuc.boy <= 4096) kucuk.push(Buffer.from(parca));
      if (opts.yavasOku) await uyu(opts.yavasOku);
    }
    sonuc.ozet = ozet.digest('hex');
    sonuc.govde = Buffer.concat(kucuk).toString('utf-8');
  } catch (e: any) {
    sonuc.hata = bekci.signal.aborted ? 'BEKCI' : `${e?.name}: ${e?.cause?.code ?? e?.message}`;
  } finally {
    clearTimeout(z);
  }
  return sonuc;
}

async function aBlogu(): Promise<void> {
  console.log('\n── A) AKTARIM: yanit motorun baytlarinin aynisi ──');
  motorKipi = 'buyuk';
  const metin = BUYUK.toString('utf-8');
  check('A0 OLCUT: parse + stringify bu govdeyi DEGISTIRIR (yeniden yazim yakalanir)',
    JSON.stringify(JSON.parse(metin)) !== metin);
  const r = await geometriIstegi();
  check('A1 ⭐ 200 ve govde motorun baytlarinin AYNISI (sha256 + boy)',
    r.durum === 200 && r.boy === BUYUK.length && r.ozet === BUYUK_OZET,
    `durum=${r.durum} boy=${r.boy}/${BUYUK.length} hata=${r.hata}`);
  check('A2 Content-Type application/json (on yuz axios JSON cozer)',
    !!r.tip && r.tip.startsWith('application/json'), `tip=${r.tip}`);
  // Uzunluk aktarilir: yarim kalan govde HTTP cercevesinde de yakalanir (kod incelemesi).
  check('A3 motorun Content-Length\'i istemciye aktarildi', r.uzunluk === String(BUYUK.length),
    `uzunluk=${r.uzunluk} beklenen=${BUYUK.length}`);
}

/** Eski yolun EN AZ yapacagi is: bu govdeyi bir kez cozmek + bir kez yazmak. Her olcumden
 *  once GC — onceki cozumun copu olcumu sisirmesin (ilk surum iki parse'i arka arkaya
 *  olcup 254 ms buldu; tek parse ~85 ms'di). Nesneler bu fonksiyondan cikinca olur. */
function kalibrasyon(): { parseMs: number; stringifyMs: number } {
  const metin = BUYUK.toString('utf-8');
  JSON.stringify(JSON.parse(metin)); // isinma (JIT)
  gcZorla();
  let t = performance.now();
  const nesne = JSON.parse(metin);
  const parseMs = performance.now() - t;
  t = performance.now();
  JSON.stringify(nesne);
  return { parseMs, stringifyMs: performance.now() - t };
}

async function dBlogu(): Promise<void> {
  console.log('\n── D) DONGU: 17 MB govde akarken olay dongusu serbest ──');
  motorKipi = 'buyuk';
  const { parseMs, stringifyMs } = kalibrasyon();
  // Esikler makineden bagimsiz, eski yolun asgari isine bagli. Eski yol TEK parca tikar
  // (parse + stringify [+ geri akis], yerel 1183 ms). Akitan yolda da kisa duraklamalar
  // olur — GC ve bu surecteki taklit motor/istemci patlamalari: canli imajda (Node 20,
  // 1 CPU) 3 × ~80 ms olculdu, yerelde (Node 24) 0. Bu yuzden hem EN UZUN tek tikanma
  // (parse'in yarisi) hem TOPLAM (asgari isin 3/4'u) olculur.
  // (0,8 × parse: kod incelemesi — eski yolun tek tikanmasi ≥ parse + stringify; gurultu payi 2×.)
  const enUzunEsikMs = Math.max(100, parseMs * 0.8);
  // TOPLAM yalniz gevsek saglik siniri: paylasilan makinede birkac orta boy zamanlama
  // duraklamasi toplanir (yerel yuk altinda 9 × ≤120 ms = 598 ms olculdu, D1 yine gecti).
  // Eski yolu D1 yakalar; D2 "cok sayida orta tikanma" turu akitmayi yakalar.
  const toplamEsikMs = Math.max(200, (parseMs + stringifyMs) * 2);
  gcZorla();
  // ORNEKLEYICI: 5 ms'de bir zamanlayici; 30 ms'yi asan her gecikme TIKANMA sayilir
  // (Windows zamanlayici cozunurlugu ~15,6 ms — normal atlama sayilmaz).
  const tikanma: number[] = [];
  let onceki = performance.now();
  const ornekleyici = setInterval(() => {
    const simdi = performance.now();
    const gecikme = simdi - onceki - 5;
    if (gecikme > 30) tikanma.push(gecikme);
    onceki = simdi;
  }, 5);
  const r = await geometriIstegi();
  clearInterval(ornekleyici);
  // SON ACIK BOSLUK da olculur: tikanma istegin sonuna dek surerse zamanlayici bir daha
  // hic tetiklenmez ve bosluk kaydedilmezdi (ilk surum boyle kacirdi: eski yolun 360 ms'lik
  // cozumu + geri akisi 964 ms'lik tek bosluktu, yalniz 78 ms'lik onceki bosluk sayildi).
  const sonBosluk = performance.now() - onceki - 5;
  if (sonBosluk > 30) tikanma.push(sonBosluk);
  const toplamMs = tikanma.reduce((a, b) => a + b, 0);
  const enUzunMs = tikanma.length ? Math.max(...tikanma) : 0;
  check('D0 OLCUT: istek tam govdeyle bitti (olcum bos akisa bakmiyor)',
    r.durum === 200 && r.boy === BUYUK.length, `durum=${r.durum} boy=${r.boy} hata=${r.hata}`);
  check(`D1 ⭐ olay dongusunun en uzun TEK tikanmasi < ${enUzunEsikMs.toFixed(0)} ms `
    + `(bu makinede tek JSON.parse ${parseMs.toFixed(0)} ms)`,
    enUzunMs < enUzunEsikMs, `en uzun=${enUzunMs.toFixed(0)} ms (${tikanma.length} tikanma)`);
  check(`D2 istek boyunca TOPLAM tikanma < ${toplamEsikMs.toFixed(0)} ms `
    + `(eski yolun asgarisi: parse ${parseMs.toFixed(0)} + stringify ${stringifyMs.toFixed(0)} ms)`,
    toplamMs < toplamEsikMs, `toplam=${toplamMs.toFixed(0)} ms (${tikanma.length} kez)`);
  console.log(`    olcum: ${(BUYUK.length / 1e6).toFixed(1)} MB · parse ${parseMs.toFixed(0)} ms · stringify `
    + `${stringifyMs.toFixed(0)} ms · toplam tikanma ${toplamMs.toFixed(0)} ms · en uzun ${enUzunMs.toFixed(0)} ms`);
}

async function hBlogu(): Promise<void> {
  console.log('\n── H) HATA ESLEMESI aynen ──');
  // H0: 200 + BOS govde — eski yolda response.json() onu 503 yapiyordu; govde artik
  // cozulmedigi icin basliklardan ONCE elenmeli (on yuz yeniden dener, bos "tamam" almaz).
  motorKipi = { durum: 200, govde: '' };
  const once0 = motorKayitlari.length;
  const r0 = await geometriIstegi();
  check('H0 motor 200 + bos govde → Nest 503 (bos 200 degil)', r0.durum === 503,
    `durum=${r0.durum} boy=${r0.boy} istek=${motorKayitlari.length - once0}`);
  const durumlar: Array<[number, number, number, string]> = [
    // [motor, beklenen Nest, beklenen motor istegi, motor govdesi]
    [409, 422, 1, '{"detail":"Geometri onbellekte yok — dosyayi yeniden yukleyin."}'],
    [404, 422, 1, '{"detail":"Dosya bulunamadi. Lutfen tekrar yukleyin."}'],
    [410, 422, 1, '{"detail":"Dosya suresi doldu (24 saat). Lutfen tekrar yukleyin."}'],
    [500, 503, 2, '{"detail":"motor coktu"}'],
    [429, 503, 1, '{"detail":"yavas"}'],
  ];
  for (const [motorDurum, beklenen, istekSayisi, govde] of durumlar) {
    motorKipi = { durum: motorDurum, govde };
    const once = motorKayitlari.length;
    const r = await geometriIstegi();
    const detay = JSON.parse(govde).detail as string;
    check(`H${motorDurum} motor ${motorDurum} → Nest ${beklenen}, motorun mesaji govdede, motor istegi ${istekSayisi}`,
      r.durum === beklenen && r.govde.includes(detay) && motorKayitlari.length - once === istekSayisi,
      `durum=${r.durum} istek=${motorKayitlari.length - once} govde=${r.govde.slice(0, 160)}`);
  }
}

async function sBlogu(): Promise<void> {
  console.log('\n── S) SAHIPLIK motordan once ──');
  motorKipi = 'buyuk';
  olayIzi = [];
  const r1 = await geometriIstegi();
  check('S1 sahiplik dogrulamasi motor isteginden ONCE', r1.durum === 200
    && JSON.stringify(olayIzi) === JSON.stringify(['dogrula', 'motor']), JSON.stringify(olayIzi));
  sahiplikReddi = true;
  olayIzi = [];
  const once = motorKayitlari.length;
  try {
    const r2 = await geometriIstegi();
    check('S2 sahiplik 403 → motora istek YOK', r2.durum === 403 && motorKayitlari.length === once,
      `durum=${r2.durum} motor istegi=${motorKayitlari.length - once} iz=${JSON.stringify(olayIzi)}`);
  } finally {
    sahiplikReddi = false;
  }
}

async function kBlogu(): Promise<void> {
  console.log('\n── K) KOPMA: istemci akis ortasinda koparsa motor baglantisi kapanir ──');
  motorKipi = 'yavas';
  const bas = gunluk.length;
  const once = motorKayitlari.length;
  const ac = new AbortController();
  const istek = geometriIstegi({ kes: ac.signal });
  const geldi = await bekle(() => motorKayitlari.length === once + 1, 3_000);
  await uyu(400); // akis basladi: istemci birkac parca aldi
  check('K0 OLCUT: istek motora ulasti ve akis suruyor', geldi && motorKayitlari[once]?.bitti === null,
    `istek=${motorKayitlari.length - once}`);
  const kayit = motorKayitlari[once];
  const kopmaAni = Date.now();
  ac.abort();
  const istemci = await istek;
  const kesildi = await bekle(() => kayit?.kesildi !== null, 1_500);
  check('K1 ⭐ istemci kopunca Nest motor baglantisini KAPATTI (1,5 sn icinde; akis sizmaz)',
    kesildi && kayit?.bitti === null,
    `istemci=${istemci.hata ?? istemci.durum} kesildi=${kayit?.kesildi ? `${kayit.kesildi - kopmaAni} ms` : 'HAYIR'}`);
  await uyu(2_500); // servisin yeniden deneme beklemesi 2 sn
  check('K2 yeniden deneme YOK', motorKayitlari.length === once + 1, `istek=${motorKayitlari.length - once}`);
  const satirlar = yeniSatirlar(bas);
  check('K3 gunlukte TEK "istemci koptu" satiri; hata/uyari satiri YOK',
    satirlar.filter((s) => s.startsWith('LOG') && s.includes('istemci koptu')).length === 1
      && !satirlar.some((s) => s.startsWith('WARN') || s.startsWith('ERROR')),
    JSON.stringify(satirlar));

  // K4: motor daha BASLIK gondermeden kopma — pipeline yok; yalniz fetch'e verilen
  // kopma sinyali keser (yoksa motor istegi 60 sn'lik baslik zaman asimina dek asili kalir).
  motorKipi = 'askida';
  const once4 = motorKayitlari.length;
  const ac4 = new AbortController();
  const istek4 = geometriIstegi({ kes: ac4.signal });
  await bekle(() => motorKayitlari.length === once4 + 1, 3_000);
  const kayit4 = motorKayitlari[once4];
  const kopma4 = Date.now();
  ac4.abort();
  await istek4;
  const kesildi4 = await bekle(() => kayit4?.kesildi != null, 1_500);
  await uyu(2_500);
  check('K4 ⭐ basliklardan ONCE kopma: motor baglantisi 1,5 sn icinde kapandi, yeniden deneme yok',
    kesildi4 && motorKayitlari.length === once4 + 1,
    `kesildi=${kayit4?.kesildi ? `${kayit4.kesildi - kopma4} ms` : 'HAYIR'} istek=${motorKayitlari.length - once4}`);
}

async function yBlogu(): Promise<void> {
  console.log('\n── Y) YARIM: motor govde ortasinda olurse istemci tamam sanmaz ──');
  motorKipi = 'yarim';
  const bas = gunluk.length;
  const r = await geometriIstegi();
  // Kabul: ag hatasi (akis basladiysa) ya da 200 OLMAYAN durum. Red: tamam gorunen 200.
  check('Y1 ⭐ yarim akis istemciye HATA olarak ulasir (sessiz yarim JSON yok)',
    r.hata !== 'BEKCI' && !(r.durum === 200 && r.hata === null) && r.boy < BUYUK.length,
    `durum=${r.durum} boy=${r.boy} hata=${r.hata}`);
  await uyu(100);
  check('Y2 gunlukte hata satiri (iz)', yeniSatirlar(bas).some((s) => s.startsWith('ERROR')),
    JSON.stringify(yeniSatirlar(bas)));
}

async function zBlogu(): Promise<void> {
  console.log('\n── Z) ZAMAN: baslik zaman asimi aynen; govde ona bagli degil; govde tavani ──');
  const asil = AbortSignal.timeout.bind(AbortSignal);
  let istenen: number[] = [];
  let kisalt: (ms: number) => number = (ms) => ms;
  (AbortSignal as any).timeout = (ms: number) => { istenen.push(ms); return asil(kisalt(ms)); };
  // Zaman asimi BEKLENIRKEN GC zorlanir (Node 20: AbortSignal.any kaynagi zayif tutar;
  // toplanan sinyal hic tetiklenmez). Akis olcumlerinde (Z4) GC baskisi YOK: 60 ms'de
  // bir tam GC akisi 4 kat yavaslatip bekciye takiliyordu (ilk surum, olculdu).
  let gcDongusu: NodeJS.Timeout | undefined;
  const gcBaskisi = (acik: boolean) => {
    clearInterval(gcDongusu);
    gcDongusu = acik ? setInterval(gcZorla, 60) : undefined;
  };
  try {
    // Z1-Z3: motor hic yanit vermez → iki baslik zaman asimi → 503
    motorKipi = 'askida';
    istenen = [];
    kisalt = () => 300;
    gcBaskisi(true);
    const once = motorKayitlari.length;
    const r = await geometriIstegi();
    gcBaskisi(false);
    check('Z1 ⭐ motor yanit vermeyince istek zaman asimiyla biter (asili kalmaz): 503',
      r.durum === 503 && r.govde.includes('yanit vermedi'), `durum=${r.durum} hata=${r.hata} govde=${r.govde.slice(0, 120)}`);
    const kayitlar = motorKayitlari.slice(once);
    await bekle(() => kayitlar.length === 2 && kayitlar.every((k) => k.kesildi !== null), 1_000);
    check('Z2 eskisi gibi TEK yeniden deneme; iki motor baglantisi da kapandi',
      kayitlar.length === 2 && kayitlar.every((k) => k.kesildi !== null), `istek=${kayitlar.length}`);
    check('Z3 baslik zaman asimi sabitleri aynen (60 sn ilk + 90 sn yeniden deneme)',
      JSON.stringify(istenen.slice(0, 2)) === JSON.stringify([60_000, 90_000]), JSON.stringify(istenen));

    // Z4: baslik suresi (300 ms) govdeyi KESMEZ — ~2,7 sn suren akis tamamlanir
    motorKipi = 'yavas';
    istenen = [];
    kisalt = (ms) => (ms <= 90_000 ? 300 : ms);
    const r4 = await geometriIstegi();
    check('Z4 ⭐ govde baslik zaman asimina BAGLI DEGIL: 300 ms\'lik baslik suresine ragmen ~2,7 sn\'lik akis tam',
      r4.durum === 200 && r4.boy === BUYUK.length && r4.ozet === BUYUK_OZET,
      `durum=${r4.durum} boy=${r4.boy}/${BUYUK.length} hata=${r4.hata}`);
    const tavan = istenen.find((ms) => ms > 90_000);
    check('Z5 govdeye ayri, comert tavan kuruldu (≥ 5 dk)', !!tavan && tavan >= 300_000, JSON.stringify(istenen));

    // Z6: govde tavani (kisaltilmis, 700 ms) uzun akisi keser → istemci hata gorur.
    // GC baskisi acik: tavan sinyali de toplanmamali.
    motorKipi = 'yavas';
    kisalt = (ms) => (ms <= 90_000 ? ms : 700);
    gcBaskisi(true);
    const bas6 = gunluk.length;
    const once6 = motorKayitlari.length;
    const r6 = await geometriIstegi();
    gcBaskisi(false);
    const kayit6 = motorKayitlari[once6];
    await bekle(() => kayit6?.kesildi !== null, 1_000);
    check('Z6 govde tavani dolunca akis kesilir: istemci hata alir, motor baglantisi kapanir, hata satiri',
      r6.hata !== null && r6.hata !== 'BEKCI' && kayit6?.kesildi !== null
        && yeniSatirlar(bas6).some((s) => s.startsWith('ERROR')),
      `durum=${r6.durum} boy=${r6.boy} hata=${r6.hata} motor kesildi=${kayit6?.kesildi !== null} gunluk=${JSON.stringify(yeniSatirlar(bas6))}`);
  } finally {
    gcBaskisi(false);
    (AbortSignal as any).timeout = asil;
  }
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
    await aBlogu();
    await dBlogu();
    await hBlogu();
    await sBlogu();
    await kBlogu();
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
