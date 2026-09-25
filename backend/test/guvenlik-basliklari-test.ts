/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  UYGULAMA KATMANI GUVENLIK BASLIKLARI (B3 · plan 1.15)  (`npm run test:guvenlik-basliklari`)
 *
 *  PARA DOGRULUGU TURU (14.09) — olculmus bulgu: Caddy atlanip `backend:3001`e
 *  gidilince `X-Powered-By: Express` geliyor, uygulama guvenlik basliklarinin
 *  hicbirini uretmiyordu. Bu dosya GERCEK bir Nest+Express uygulamasini portta
 *  kaldirir ve GERCEK HTTP istegiyle olcer (Caddy yok = ic ag yolu).
 *
 *   G0  OLCUT: kurulum YOKKEN cıplaklik gorunuyor (bulgu yeniden uretilir)
 *   G1  kurulumla her baslik birebir, `X-Powered-By` yok — 200, 404 ve 400'de
 *   G2  Caddyfile paritesi: kenarla ortak basliklar AYNI deger; uygulamaya ozgu
 *       baslik Caddyfile'da YOK (yoksa B2'nin dis olcumu bos yere yesil yanar)
 *   G3  BAGLANTI: main.ts kurulumu route'lardan ve listen'dan ONCE cagiriyor
 *
 *  DB ve AG GEREKMEZ (127.0.0.1, rastgele port).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { BadRequestException, Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  GUVENLIK_BASLIKLARI,
  KENARLA_ORTAK_BASLIKLAR,
  guvenlikBasliklariniKur,
} from '../src/altyapi/http/guvenlik-basliklari';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad} — ${detay}`); }
  else { failures.push(`${ad} — ${detay}`); console.log(`  FAIL: ${ad} — ${detay}`); }
}

@Controller('deneme')
class DenemeController {
  @Get()
  tamam() { return { ok: true }; }

  @Get('hata')
  hata() { throw new BadRequestException('bilerek'); }
}

@Module({ controllers: [DenemeController] })
class DenemeModulu {}

async function uygulama(kur: boolean) {
  const app = await NestFactory.create<NestExpressApplication>(DenemeModulu, { logger: false });
  if (kur) guvenlikBasliklariniKur(app);
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as { port: number }).port;
  return { app, port };
}

function iste(port: number, yol: string): Promise<{ durum: number; basliklar: http.IncomingHttpHeaders }> {
  return new Promise((coz, reddet) => {
    http.get({ host: '127.0.0.1', port, path: yol }, (res) => {
      res.resume();
      res.on('end', () => coz({ durum: res.statusCode ?? 0, basliklar: res.headers }));
    }).on('error', reddet);
  });
}

const kodMetni = (dosya: string) => fs.readFileSync(dosya, 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

bitmezseKirmizi((async () => {
  console.log('── G0) OLCUT: kurulum YOKKEN uygulama cıplak (bulgu yeniden uretilir) ──');
  {
    const { app, port } = await uygulama(false);
    const r = await iste(port, '/api/deneme');
    check('G0a kurulumsuz yanitta X-Powered-By: Express VAR', r.basliklar['x-powered-by'] === 'Express', `x-powered-by=${r.basliklar['x-powered-by']}`);
    const eksik = Object.keys(GUVENLIK_BASLIKLARI).filter((ad) => r.basliklar[ad.toLowerCase()] === undefined);
    check('G0b kurulumsuz yanitta guvenlik basliklarinin HICBIRI yok', eksik.length === Object.keys(GUVENLIK_BASLIKLARI).length,
      `eksik ${eksik.length}/${Object.keys(GUVENLIK_BASLIKLARI).length}`);
    await app.close();
  }

  console.log('── G1) KURULUMLA: her baslik birebir, X-Powered-By yok ──');
  {
    const { app, port } = await uygulama(true);
    for (const [yol, beklenenDurum] of [['/api/deneme', 200], ['/api/yok-boyle-uc', 404], ['/api/deneme/hata', 400]] as const) {
      const r = await iste(port, yol);
      const yanlis = Object.entries(GUVENLIK_BASLIKLARI)
        .filter(([ad, deger]) => r.basliklar[ad.toLowerCase()] !== deger)
        .map(([ad]) => `${ad}=${r.basliklar[ad.toLowerCase()]}`);
      check(`G1 ${beklenenDurum} ${yol}: ${Object.keys(GUVENLIK_BASLIKLARI).length} baslik birebir, X-Powered-By yok`,
        r.durum === beklenenDurum && yanlis.length === 0 && r.basliklar['x-powered-by'] === undefined,
        `durum=${r.durum} yanlis=[${yanlis.join(', ')}] x-powered-by=${r.basliklar['x-powered-by']}`);
    }
    await app.close();
  }

  console.log('── G2) CADDYFILE PARITESI ──');
  {
    const caddy = fs.readFileSync(path.resolve(__dirname, '../../Caddyfile'), 'utf-8');
    const snippet = caddy.match(/^\(guvenlik\)\s*\{[\s\S]*?\r?\n\}/m)?.[0] ?? '';
    const satirlar = snippet.split(/\r?\n/).filter((l) => !l.trim().startsWith('#'));
    const caddyDegeri = (ad: string) => {
      const satir = satirlar.find((l) => l.trim().startsWith(`${ad} `));
      return satir?.match(/"([^"]*)"/)?.[1];
    };
    check('G2-olcut Caddyfile (guvenlik) snippet BULUNDU ve basliklari okunuyor',
      snippet.length > 200 && caddyDegeri('X-Frame-Options') !== undefined, `snippet ${snippet.length} karakter`);
    for (const ad of KENARLA_ORTAK_BASLIKLAR) {
      check(`G2 ${ad}: uygulama = kenar`, caddyDegeri(ad) === GUVENLIK_BASLIKLARI[ad],
        `caddy="${caddyDegeri(ad)}" uygulama="${GUVENLIK_BASLIKLARI[ad]}"`);
    }
    const yalnizUygulama = Object.keys(GUVENLIK_BASLIKLARI).filter((ad) => !(KENARLA_ORTAK_BASLIKLAR as readonly string[]).includes(ad));
    check('G2b uygulamaya ozgu baslik Caddyfile\'da YOK (dis olcum ancak boylece bu katmani kanitlar)',
      yalnizUygulama.length > 0 && yalnizUygulama.every((ad) => !caddy.includes(ad)), yalnizUygulama.join(', '));
  }

  console.log('── G3) BAGLANTI: main.ts kurulumu cagiriyor ──');
  {
    const main = kodMetni(path.resolve(__dirname, '../src/main.ts'));
    const kurulum = main.indexOf('guvenlikBasliklariniKur(app)');
    const listen = main.indexOf('app.listen(');
    const onek = main.indexOf('app.setGlobalPrefix(');
    check('G3 main.ts guvenlikBasliklariniKur(app) cagiriyor — setGlobalPrefix ve listen\'dan ONCE',
      kurulum > 0 && kurulum < onek && kurulum < listen, `kurulum@${kurulum} prefix@${onek} listen@${listen}`);
  }

  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    process.exit(1);
  }
})().catch((e) => { console.error('BEKLENMEYEN:', e); process.exit(1); }));
