/**
 * GÖVDE GENİŞLİĞİ — 06.10.2026 (güvenlik incelemesi HIGH-3).
 *   `npm run test:govde-genisligi` · DB/AĞ GEREKTİRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   Gövdeye eklenen 80 bin üst düzey anahtar (~1 MB), class-transformer
 *   0.5.1'in O(n²) tekilleştirmesiyle olay döngüsünü tutuyordu: kimliksiz
 *   `POST /auth/login`'de ayrı süreçten komşu istek 11,7 sn (güvenlik
 *   incelemesi, 849 KB) / 14,6 sn (bu kapı, 1005 KB) bekledi. Whitelist
 *   fazlalığı SONRA siler — her DTO ucu etkileniyordu.
 *   (A) kimliksiz yollarda yol başına bayt tavanı (`govde-siniri.ts`),
 *   (B) karesel tekilleştirmenin kanıtlanabilir eşdeğer hızlı yolu
 *       (`sinif-donusturucu-yamasi.ts`).
 *
 * ── BLOKLAR ─────────────────────────────────────────────────────────────
 *   A  kimliksiz yollar: 80 bin anahtar 413 (mevcut 413 ile BAYT BAYT aynı),
 *      tek WARN, komşu istek beklemez; /api/auth altındaki GERÇEK uçların
 *      DTO kısıtlarından kurulan en geniş geçerli gövde tavana takılmaz.
 *   B  yama: sürüm kilidi, kurulum, çift kurulum yok, geniş nesnede özgün
 *      (karesel) yol ÇAĞRILMAZ; dekorlu (özellik ya da SINIF düzeyi) sınıfta
 *      özgüne düşülür; kimlikli DTO ucunda 80 bin anahtarla komşu beklemez.
 *   E  eşdeğerlik: depodaki TÜM DTO'lar × gövde türleri (boş, fazla alan,
 *      metin/sayı/mantıksal/null/nesne/dizi, iç içe dizi, 2.000 anahtarlı
 *      geniş Record) + elle kurulmuş geçerli gövdeler (units haritası dahil)
 *      + dekorlu sınıflar (özellik düzeyi, sınıf düzeyi @Exclude/@Expose,
 *      atadan gelen): özgün ve yamalı çıktı birebir — gövde → sınıf
 *      (ValidationPipe) ve sınıf → düz nesne (instanceToPlain) yönünde.
 *   K  bağlantı: main.ts yamayı uygulamadan ÖNCE tek yerden kurar; sınır
 *      listesinde kimliksiz yollar.
 *
 * Çıkış kodu: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  Body, Controller, Get, Logger, Module, Post, ValidationPipe, type LoggerService,
} from '@nestjs/common';
import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Exclude, Expose, instanceToPlain } from 'class-transformer';
import { IsOptional, IsString, getMetadataStorage } from 'class-validator';
import { json, urlencoded } from 'express';

import { GOVDE_SINIRLARI, govdeHatalariniKur, govdeSinirlariniKur } from '../src/altyapi/http/govde-siniri';
import {
  YAMALI_SURUM, YAMA_ISARETI, sinifDonusturucuYamasiKuruluMu, sinifDonusturucuYamasiniKur, yamaSurumUyarMi,
} from '../src/altyapi/http/sinif-donusturucu-yamasi';
import { LoginDto } from '../src/altyapi/auth/dto/login.dto';
import { CreateQuoteDto } from '../src/ozellik/teklif/quotes/dto/create-quote.dto';
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
Logger.overrideLogger(yakalayici);

const KOK = path.resolve(__dirname, '..', '..');
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** `n` anahtarlı geniş nesne (taban alanlarıyla). */
const genis = (n: number, taban: Record<string, unknown> = {}) => {
  const g: Record<string, unknown> = { ...taban };
  for (let i = 0; i < n; i++) g[`k${i}`] = 'a';
  return g;
};
const GENIS = 80_000;

/** Ayrı süreçte koşan komşu: `dur` gelene dek GET /api/olcum/komsu'yu arka arkaya
 *  ister (bağlantı havuzu YOK — Windows'ta açık soketle süreç çıkışı çöker),
 *  en uzun bekleyişi yazar. İlk yanıtı alınca `H` yazar: ana süreç büyük
 *  isteği ancak komşu GERÇEKTEN koşarken gönderir (sabit ısınma süresi
 *  yüklü koşucuda yetmeyebilirdi — 06.10 incelemesi). */
const KOMSU_HAZIR = 'H';
const KOMSU_BETIGI = `
const http = require('http');
const port = Number(process.argv[1]);
let dur = false;
process.stdin.on('data', () => { dur = true; });
const iste = () => new Promise((c) => {
  const t = performance.now();
  const r = http.get({ host: '127.0.0.1', port, path: '/api/olcum/komsu', agent: false }, (res) => {
    res.resume(); res.on('end', () => c(performance.now() - t));
  });
  r.on('error', () => c(performance.now() - t));
});
(async () => {
  const s = [await iste()];
  process.stdout.write('${KOMSU_HAZIR}');
  while (!dur) s.push(await iste());
  process.stdout.write(JSON.stringify({ en: Math.round(Math.max(...s)), n: s.length }));
  process.stdin.destroy();
})();`;

// ═══ Kukla uçlar — main.ts ile AYNI ara katman sırası ═══════════════════════
const cagri: string[] = [];
@Controller('auth')
class KuklaAuth {
  @Post('login') giris(@Body() _dto: LoginDto) { cagri.push('login'); return { ok: true }; }
}
@Controller('abonelik')
class KuklaDonus {
  @Post('iyzico-donus') donus(@Body() g: { token?: string }) { cagri.push('donus'); return { ok: !!g?.token }; }
  @Post('iyzico-kart-donus') kartDonus(@Body() g: { token?: string }) { cagri.push('kart'); return { ok: !!g?.token }; }
}
@Controller('ai/translate')
class KuklaCeviri {
  // Bayt tavanı olan MEVCUT yol (32 KB) — 413 yanıtının bayt karşılaştırması için.
  @Post('duzeltmeler') duzelt(@Body() _g: unknown) { return { ok: true }; }
}
@Controller('olcum')
class KuklaOlcum {
  @Post('teklif') teklif(@Body() dto: CreateQuoteDto) { cagri.push('teklif'); return { ok: true, kalem: dto.items?.length ?? -1 }; }
  @Get('komsu') komsu() { return { ok: true }; }
}

async function uygulamaKur() {
  @Module({ controllers: [KuklaAuth, KuklaDonus, KuklaCeviri, KuklaOlcum] })
  class KuklaModulu {}
  const app = await NestFactory.create<NestExpressApplication>(KuklaModulu, { logger: yakalayici });
  // main.ts SIRASI: yol başı tavan → global ayrıştırıcılar → ayrıştırıcı hata katmanı.
  govdeSinirlariniKur(app);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  govdeHatalariniKur(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const gonder = async (yol: string, govde: string, tur = 'application/json') => {
    const r = await fetch(`http://127.0.0.1:${port}/api${yol}`, {
      method: 'POST', headers: { 'content-type': tur }, body: govde, signal: AbortSignal.timeout(120_000),
    });
    return { durum: r.status, metin: await r.text() };
  };
  /**
   * Büyük istek SÜRERKEN komşu isteklerin EN UZUN beklemesi (ms). Komşu AYRI
   * SÜREÇTEN, arka arkaya gönderilir: aynı süreçteki istemci sunucuyla tek olay
   * döngüsünü paylaşır, tıkanma sırasında istek bile atamaz. Tek komşu isteği
   * de yetmez — ilk ölçümde komşu dönüşüm BAŞLAMADAN sızdı (büyük istek 13,8 sn
   * sürerken komşu 24 ms döndü).
   */
  const komsuyla = async (yol: string, govde: string, tur?: string) => {
    const cocuk = spawn(process.execPath, ['-e', KOMSU_BETIGI, String(port)], { stdio: ['pipe', 'pipe', 'inherit'] });
    let cikti = '';
    const bitti = new Promise((c) => cocuk.on('exit', c));
    // Komşu ilk yanıtını alana dek bekle (en çok 30 sn); sonra birkaç tur daha.
    const hazir = await new Promise<boolean>((c) => {
      const sure = setTimeout(() => c(false), 30_000);
      cocuk.stdout.on('data', (b) => {
        cikti += String(b);
        if (cikti.startsWith(KOMSU_HAZIR)) { clearTimeout(sure); c(true); }
      });
    });
    await new Promise((c) => setTimeout(c, 100));
    const buyuk = await gonder(yol, govde, tur);
    cocuk.stdin.on('error', () => undefined); // komşu erken öldüyse EPIPE yutulur (FIXTURE düşer)
    if (cocuk.exitCode === null) cocuk.stdin.write('dur\n');
    await bitti;
    const { en, n } = JSON.parse(cikti.slice(KOMSU_HAZIR.length) || '{"en":-1,"n":0}');
    return { buyuk, komsuMs: en as number, komsuSayisi: n as number, komsuHazir: hazir };
  };
  return { app, gonder, komsuyla };
}

// ═══ A — kimliksiz yollar: yol başına bayt tavanı ═══════════════════════════
async function aBlogu(): Promise<void> {
  console.log('\n── A · kimliksiz yollar: 80 bin anahtar 413, komşu beklemez ──');
  // Gerçek denetleyiciler sunucu AÇILMADAN yüklenir: ts-node'un eşzamanlı
  // derlemesi keep-alive süresini (5 sn) aşarsa havuzdaki soket sunucu onu
  // kapatırken yeniden kullanılır → ECONNRESET (ilk sürümde görüldü).
  const authUclari = authGovdeDtolari();
  const d = await uygulamaKur();
  try {
    const genisGiris = JSON.stringify(genis(GENIS, { email: 'a@b.test', password: 'Gizli12345!' }));
    gunluk.length = 0;
    const { buyuk, komsuMs, komsuSayisi, komsuHazir } = await d.komsuyla('/auth/login', genisGiris);
    console.log(`     (ölçüm) /auth/login ${Math.round(genisGiris.length / 1024)} KB · ${GENIS} anahtar → ${buyuk.durum}; ayrı süreçten ${komsuSayisi} komşu istek, en uzun ${komsuMs} ms bekledi`);
    check('A1 ⭐ kimliksiz giriş: 80 bin anahtarlı gövde 413', buyuk.durum === 413, `durum=${buyuk.durum}`);
    check('A2-FIXTURE komşu büyük istekten ÖNCE koşuyordu ve ölçüm boyunca sürdü (≥ 5 istek)', komsuHazir && komsuSayisi >= 5,
      js({ komsuHazir, komsuSayisi }));
    check('A2 ⭐ komşu istek BEKLEMEZ (en uzun < 1 sn; yamasız ve tavansız ~13 sn)', komsuMs >= 0 && komsuMs < 1_000, `${komsuMs} ms`);
    const mevcut = await d.gonder('/ai/translate/duzeltmeler', JSON.stringify({ x: 'a'.repeat(40_000) }));
    check('A3 413 yanıtı MEVCUT 413 ile BAYT BAYT aynı', mevcut.durum === 413 && buyuk.metin === mevcut.metin, js({ yeni: buyuk.metin, mevcut: mevcut.metin }));
    const uyari = gunluk.filter((g) => g.startsWith('WARN'));
    check('A4 413 başına TEK uyarı, ERROR yok', uyari.length === 2 && !gunluk.some((g) => g.startsWith('ERROR')), js(gunluk));
    check('A5 giriş denetleyicisine ULAŞILMADI', !cagri.includes('login'), js(cagri));

    // İKİ parametre, 40 KB: body-parser'ın parametre sınırına (1.000) TAKILMAZ —
    // 413'ü yalnız yol tavanı verebilir (ilk sürüm 20 bin parametre gönderiyordu
    // ve tavansız da "too many parameters" 413'ü alıyordu; 06.10 incelemesi).
    const urlGenis = `email=a@b.test&password=${'x'.repeat(40_000)}`;
    const u = await d.gonder('/auth/login', urlGenis, 'application/x-www-form-urlencoded');
    const uMesaj = (() => { try { return JSON.parse(u.metin).message; } catch { return u.metin; } })();
    check('A6 aynı yol urlencoded gövdeyle de tavanlı (R1-B4 deseni): 413 "request entity too large"',
      u.durum === 413 && uMesaj === 'request entity too large', js({ d: u.durum, m: uMesaj }));
    const uKontrol = await d.gonder('/olcum/teklif', urlGenis, 'application/x-www-form-urlencoded');
    check('A6-KONTROL aynı urlencoded gövde tavansız yolda ayrıştırıcıdan GEÇER (413 değil)', uKontrol.durum !== 413,
      `durum=${uKontrol.durum}`);

    cagri.length = 0;
    const gecerli = await d.gonder('/auth/login', JSON.stringify({ email: 'a@b.test', password: 'Gizli12345!' }));
    check('A7 BAĞLANTI: olağan giriş gövdesi geçer, denetleyiciye ulaşır', gecerli.durum < 400 && cagri.includes('login'), js({ d: gecerli.durum, cagri }));
    // /api/auth altındaki GERÇEK uçlar: gövde DTO'ları denetleyici meta
    // verisinden, en geniş geçerli gövde DTO kısıtlarından kurulur (ölçüt
    // fikstürün kendi sabiti DEĞİL — yeni bir /api/auth ucu geniş alan
    // eklerse bu kapı görür; bilinmeyen kural türü FIXTURE'ı düşürür).
    const kurulan = authUclari.map((u) => ({ ...u, ...enGenisGecerliGovde(u.dto, u.alan) }));
    const bilinmeyen = kurulan.flatMap((k) => k.bilinmeyen.map((b) => `${k.uc}: ${b}`));
    check('A8-FIXTURE /api/auth altındaki gövdeli uçlar denetleyicilerden okundu (≥ 20)', authUclari.length >= 20,
      `${authUclari.length}: ${authUclari.map((u) => u.uc).join(', ')}`);
    check('A8-FIXTURE alan kurallarının hepsi bilinen türde (genişlik hesaplanabilir)', bilinmeyen.length === 0, bilinmeyen.join(' | '));
    const enGenis = kurulan.reduce((a, b) => (b.govde.length > a.govde.length ? b : a));
    console.log(`     (ölçüm) /api/auth: ${authUclari.length} gövdeli uç; en geniş geçerli gövde ${enGenis.uc} ${enGenis.govde.length} bayt (sınırsız metin alanı ${SINIRSIZ_METIN} karakter varsayıldı)`);
    check(`A8 /api/auth en geniş geçerli gövde (${enGenis.uc}, ${enGenis.govde.length} bayt) 32 KB tavanın dörtte birinin altında`,
      enGenis.govde.length < 32 * 1024 / 4, js({ uc: enGenis.uc, bayt: enGenis.govde.length }));
    const genisGecerli = await d.gonder('/auth/login', enGenis.govde);
    check('A8b o gövde /api/auth yolunda tavana TAKILMAZ (413 değil)', genisGecerli.durum !== 413, `durum=${genisGecerli.durum}`);

    cagri.length = 0;
    const donus = await d.gonder('/abonelik/iyzico-donus', `token=${'t'.repeat(64)}`, 'application/x-www-form-urlencoded');
    check('A9 iyzico dönüşü: olağan form (token) geçer', donus.durum < 400 && cagri.includes('donus'), js({ d: donus.durum, cagri }));
    const donusGenis = await d.gonder('/abonelik/iyzico-donus', JSON.stringify(genis(GENIS, { token: 'x' })));
    const kartGenis = await d.gonder('/abonelik/iyzico-kart-donus', JSON.stringify(genis(GENIS, { token: 'x' })));
    check('A10 iyzico dönüşleri: geniş gövde 413 (herkese açık uç)', donusGenis.durum === 413 && kartGenis.durum === 413,
      js([donusGenis.durum, kartGenis.durum]));
  } finally {
    await d.app.close();
  }
}

// ═══ B — yama: kurulum, sürüm kilidi, karesel yol çağrılmaz ═════════════════
async function bBlogu(): Promise<void> {
  console.log('\n── B · class-transformer yaması ──');
  const { TransformOperationExecutor } = require('class-transformer/cjs/TransformOperationExecutor');
  const proto = TransformOperationExecutor.prototype;
  const surum: string = require('class-transformer/package.json').version;
  check(`B1 kurulu class-transformer okunmuş sürüm (${YAMALI_SURUM}) — yükseltmede bu kapı kırmızı`, surum === YAMALI_SURUM, surum);
  check('B2 sürüm kilidi: yalnız okunmuş sürüm', yamaSurumUyarMi(YAMALI_SURUM) && !yamaSurumUyarMi('0.5.2') && !yamaSurumUyarMi('0.6.0'));
  const ilk = sinifDonusturucuYamasiniKur();
  const ikinci = sinifDonusturucuYamasiniKur();
  check('B3 kurulur ve kurulu görünür', ilk && sinifDonusturucuYamasiKuruluMu());
  check('B4 ikinci kurulum sarmaz (özgün işlev yamalı değil)', ikinci && !proto.getKeys.ozgun?.[YAMA_ISARETI] && typeof proto.getKeys.ozgun === 'function');

  // Geniş nesnede özgün (karesel) işlev HİÇ çağrılmaz; dekorlu sınıfta çağrılır (geri dönüş).
  const ozgun = proto.getKeys.ozgun;
  let ozgunCagri = 0;
  proto.getKeys.ozgun = function (this: unknown, ...a: unknown[]) { ozgunCagri++; return ozgun.apply(this, a); };
  try {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const t0 = performance.now();
    await pipe.transform(genis(GENIS, { email: 'a@b.test', password: 'x' }), { type: 'body', metatype: LoginDto });
    const ms = Math.round(performance.now() - t0);
    check(`B5 ⭐ ${GENIS} anahtarlı gövdede özgün (karesel) yol ÇAĞRILMADI`, ozgunCagri === 0, `cagri=${ozgunCagri}`);
    check(`B6 ${GENIS} anahtar doğrusal sürede (< 3 sn; özgün ~12,9 sn)`, ms < 3_000, `${ms} ms`);
    await pipe.transform({ ad: 'x', gizli: 'y' }, { type: 'body', metatype: Dekorlu });
    check('B7 @Expose/@Exclude taşıyan sınıfta özgün yola DÜŞÜLÜR', ozgunCagri > 0, `cagri=${ozgunCagri}`);
    const onceki = ozgunCagri;
    await pipe.transform({ a: 'x', b: 'y' }, { type: 'body', metatype: SinifDuzeyiDislanan });
    check('B7b SINIF düzeyi @Exclude taşıyan sınıfta da özgün yola DÜŞÜLÜR', ozgunCagri > onceki, `cagri=${ozgunCagri - onceki}`);
  } finally {
    proto.getKeys.ozgun = ozgun;
  }

  // Kimlikli (bayt tavanı olmayan) DTO ucunda 80 bin anahtar: komşu beklemez.
  const d = await uygulamaKur();
  try {
    cagri.length = 0;
    const govde = JSON.stringify(genis(GENIS, { items: [{ materialName: 'Vana', quantity: 1 }] }));
    const { buyuk, komsuMs, komsuSayisi } = await d.komsuyla('/olcum/teklif', govde);
    console.log(`     (ölçüm) /olcum/teklif ${Math.round(govde.length / 1024)} KB · ${GENIS} anahtar → ${buyuk.durum}; ayrı süreçten ${komsuSayisi} komşu istek, en uzun ${komsuMs} ms bekledi`);
    check('B8-FIXTURE komşu döngüsü ölçüm boyunca koştu (≥ 5 istek)', komsuSayisi >= 5, String(komsuSayisi));
    check('B8 ⭐ kimlikli DTO ucunda 80 bin anahtar: komşu istek BEKLEMEZ (en uzun < 3 sn; yamasız ~13 sn)', komsuMs >= 0 && komsuMs < 3_000, `${komsuMs} ms`);
    check('B9 istek işlendi, fazla anahtarlar silindi (kalem 1)', buyuk.durum < 400 && js(JSON.parse(buyuk.metin)) === js({ ok: true, kalem: 1 }),
      js({ d: buyuk.durum, m: buyuk.metin.slice(0, 120) }));
  } finally {
    await d.app.close();
  }
  gunluk.length = 0;
  check('B10 başka sürümde kurulmaz ve açılışta ERROR yazar', sinifDonusturucuYamasiniKur('0.5.2') === false
    && gunluk.some((g) => g.startsWith('ERROR') && g.includes('0.5.2') && g.includes('KURULMADI')), js(gunluk));
}

/** @Expose/@Exclude taşıyan sınıf: hızlı yol uygulanmamalı (geri dönüş ölçüsü).
 *  `gizli` doğrulama dekoratörü TAŞIR: yoksa whitelist onu zaten silerdi ve
 *  @Exclude'un yok sayılması çıktıda görünmezdi (G6 mutantı E2'den kaçtı). */
class Dekorlu {
  @Expose({ name: 'ad' }) @IsOptional() @IsString() isim?: string;
  @Exclude() @IsOptional() @IsString() gizli?: string;
  @IsOptional() @IsString() serbest?: string;
}
/** Sınıf düzeyi @Exclude(): özgün getKeys yalnız açılmış alanları (burada
 *  hiçbiri) verir; `getMetadata` sınıf kaydını SÜZDÜĞÜ için özellik sayımı
 *  bunu görmez — ilk yama tüm anahtarları döndürüyordu (06.10 incelemesi
 *  MEDIUM-1). Alanlar doğrulama dekoratörü taşır: whitelist silmesin. */
@Exclude()
class SinifDuzeyiDislanan {
  @IsOptional() @IsString() a?: string;
  @IsOptional() @IsString() b?: string;
}
@Expose()
class SinifDuzeyiAcik {
  @IsOptional() @IsString() a?: string;
}
@Exclude()
class DislananAta {
  @IsOptional() @IsString() a?: string;
}
/** Atanın SINIF düzeyi stratejisi torunu etkilemez (`getStrategy` yalnız
 *  hedefin kendi haritasına bakar) — hızlı yol uygulanır, özgünle aynı. */
class AcikTorun extends DislananAta {
  @IsOptional() @IsString() t?: string;
}
/** Yalnız özellik düzeyi @Expose: gövdede OLMAYAN açılmış alanı özgün
 *  `isim: undefined` olarak ekler — hızlı yol eklemezdi (jsTam görür). */
class YalnizAcilan {
  @Expose({ name: 'ad' }) @IsOptional() @IsString() isim?: string;
  @IsOptional() @IsString() serbest?: string;
}
class OzellikAtasi {
  @Exclude() @IsOptional() @IsString() gizli?: string;
}
/** Atadan gelen ÖZELLİK düzeyi @Exclude: hızlı yol uygulanmaz. */
class OzellikTorunu extends OzellikAtasi {
  @IsOptional() @IsString() acik?: string;
}
/** `undefined` değerli anahtarı da gösteren karşılaştırma dizesi. */
const jsTam = (x: unknown) => JSON.stringify(x, (_k, v) => (v === undefined ? '⟨undefined⟩' : v));

// ═══ /api/auth gövdeleri (A8) ═══════════════════════════════════════════════
/** Sınırı olmayan metin alanı (parola, jeton, desenli kod) için varsayılan
 *  genişlik. Gerçekte: bcrypt parolanın ilk 72 baytını okur, MFA meydan
 *  okuma jetonu ~0,5 KB, kodlar 6-12 karakter. */
const SINIRSIZ_METIN = 2_048;
const BILINEN_KURALLAR = new Set([
  'isString', 'isOptional', 'maxLength', 'minLength', 'isLength', 'isEmail',
  'isBoolean', 'equals', 'isIn', 'isUuid', 'isJwt', 'matches',
]);

/** /api/auth altındaki GERÇEK denetleyicilerin gövde DTO'ları (Nest meta verisi). */
function authGovdeDtolari(): Array<{ uc: string; dto: Function; alan?: string }> {
  const sonuc: Array<{ uc: string; dto: Function; alan?: string }> = [];
  const tara = (dizin: string) => {
    for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, g.name);
      if (g.isDirectory()) { tara(tam); continue; }
      if (!g.name.endsWith('.controller.ts')) continue;
      if (!/@Controller\([^)]*['"`]\/?auth\b/.test(fs.readFileSync(tam, 'utf8'))) continue;
      for (const sinif of Object.values<any>(require(tam))) {
        if (typeof sinif !== 'function') continue;
        const onek = [Reflect.getMetadata(PATH_METADATA, sinif)].flat()
          .find((y) => typeof y === 'string' && /^\/?auth(\/|$)/.test(y));
        if (!onek) continue;
        for (const m of Object.getOwnPropertyNames(sinif.prototype)) {
          const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, sinif, m) ?? {};
          const tipler = Reflect.getMetadata('design:paramtypes', sinif.prototype, m) ?? [];
          for (const [anahtar, a] of Object.entries<any>(args)) {
            if (Number(anahtar.split(':')[0]) !== RouteParamtypes.BODY) continue;
            sonuc.push({ uc: `/api/${String(onek).replace(/^\//, '')} ${m}`, dto: tipler[a.index], alan: a.data });
          }
        }
      }
    }
  };
  tara(path.join(KOK, 'backend', 'src'));
  return sonuc;
}

/** DTO kısıtlarının izin verdiği EN GENİŞ gövde. Hesaplanamayan (bilinmeyen
 *  kural, tipsiz ya da tek alanlı gövde) `bilinmeyen`e yazılır. */
function enGenisGecerliGovde(dto: Function, alan?: string): { govde: string; bilinmeyen: string[] } {
  if (alan) return { govde: '{}', bilinmeyen: [`tek alanlı gövde (@Body('${alan}'))`] };
  if (!dto || [Object, String, Number, Boolean, Array].includes(dto as any)) return { govde: '{}', bilinmeyen: ['tipsiz gövde'] };
  const bilinmeyen: string[] = [];
  const alanlar = new Map<string, Array<{ name?: string; constraints?: any[] }>>();
  for (const m of getMetadataStorage().getTargetValidationMetadatas(dto, '', true, false)) {
    alanlar.set(m.propertyName, [...(alanlar.get(m.propertyName) ?? []), m]);
  }
  const govde: Record<string, unknown> = {};
  for (const [ad, kurallar] of alanlar) {
    for (const k of kurallar) if (!BILINEN_KURALLAR.has(String(k.name))) bilinmeyen.push(`${dto.name}.${ad}: ${k.name}`);
    const kural = (n: string) => kurallar.find((k) => k.name === n);
    const ust: number | undefined = kural('maxLength')?.constraints?.[0] ?? kural('isLength')?.constraints?.[1];
    if (kural('isBoolean') || kural('equals')) govde[ad] = true;
    else if (kural('isIn')) govde[ad] = [...(kural('isIn')!.constraints![0] as unknown[])].map(String).sort((x, y) => y.length - x.length)[0];
    // validator.js isEmail: yerel kısım ≤ 64, alan adı ≤ 253 (etiket ≤ 63)
    else if (kural('isEmail')) govde[ad] = `${'a'.repeat(64)}@${['b', 'c', 'd', 'e'].map((h) => h.repeat(60)).join('.')}.com`;
    else if (kural('isUuid')) govde[ad] = '00000000-0000-4000-8000-000000000000';
    else govde[ad] = 'x'.repeat(ust ?? SINIRSIZ_METIN);
  }
  return { govde: JSON.stringify(govde), bilinmeyen };
}

// ═══ E — eşdeğerlik: depodaki TÜM DTO'lar × gövde türleri ═══════════════════
function dtoSiniflari(): Array<{ ad: string; sinif: Function }> {
  const sonuc: Array<{ ad: string; sinif: Function }> = [];
  const tara = (dizin: string) => {
    for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, g.name);
      if (g.isDirectory()) { tara(tam); continue; }
      if (!g.name.endsWith('.dto.ts')) continue;
      const modul = require(tam);
      for (const [ad, deger] of Object.entries(modul)) {
        if (typeof deger === 'function' && /Dto$/.test(ad)) sonuc.push({ ad, sinif: deger as Function });
      }
    }
  };
  tara(path.join(KOK, 'backend', 'src'));
  return sonuc;
}
const alanlari = (sinif: Function): string[] => [...new Set(
  getMetadataStorage().getTargetValidationMetadatas(sinif, '', true, false).map((m) => m.propertyName),
)];
const herAlana = (alanlar: string[], deger: () => unknown) => Object.fromEntries(alanlar.map((a) => [a, deger()]));

async function eBlogu(): Promise<void> {
  console.log('\n── E · eşdeğerlik: depodaki TÜM DTO\'lar, özgün ↔ yamalı ──');
  const { TransformOperationExecutor } = require('class-transformer/cjs/TransformOperationExecutor');
  const proto = TransformOperationExecutor.prototype;
  const yamali = proto.getKeys;
  const ozgun = yamali.ozgun;
  check('E0 FIXTURE: yama kurulu (özgün işleve erişilebiliyor)', !!yamali[YAMA_ISARETI] && typeof ozgun === 'function');
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const kos = async (sinif: Function, uret: () => unknown) => {
    try {
      const r = await pipe.transform(uret(), { type: 'body', metatype: sinif as any });
      return `OK:${(r as any)?.constructor?.name}:${jsTam(r)}`;
    } catch (e: any) {
      return `HATA:${e?.status ?? e?.constructor?.name}:${js(e?.response?.message ?? e?.message)}`;
    }
  };
  const siniflar = dtoSiniflari();
  check('E1 FIXTURE: depodaki DTO\'lar yüklendi (≥ 60)', siniflar.length >= 60, String(siniflar.length));
  const turler: Array<[string, (alanlar: string[]) => () => unknown]> = [
    ['boş', () => () => ({})],
    ['fazla alan + prototip adlı anahtar', () => () => ({ ...JSON.parse('{"__proto__":{"x":1},"constructor":"c","toString":"t"}'), fazla: 1, ic: { a: [1] } })],
    ['alan = metin', (a) => () => herAlana(a, () => 'x')],
    ['alan = sayı', (a) => () => herAlana(a, () => 5)],
    ['alan = mantıksal', (a) => () => herAlana(a, () => true)],
    ['alan = null', (a) => () => herAlana(a, () => null)],
    ['alan = iç içe nesne', (a) => () => herAlana(a, () => ({ a: 1, b: { c: [1, 'x'] } }))],
    ['alan = karışık dizi', (a) => () => herAlana(a, () => ['a', 1, { b: 2 }])],
    ['alan = nesne dizisi', (a) => () => herAlana(a, () => [{ materialName: 'Vana', quantity: 1, x: 1 }, { ad: 'y', fazla: { z: 1 } }])],
    ['alan = 2.000 anahtarlı geniş Record + üst düzey 2.000 fazla', (a) => () => genis(2_000, herAlana(a, () => genis(2_000)))],
  ];
  let toplam = 0;
  const farklar: string[] = [];
  for (const { ad, sinif } of siniflar) {
    const alanlar = alanlari(sinif);
    for (const [tur, uretici] of turler) {
      const uret = uretici(alanlar);
      proto.getKeys = ozgun;
      const a = await kos(sinif, uret);
      proto.getKeys = yamali;
      const b = await kos(sinif, uret);
      toplam++;
      if (a !== b) farklar.push(`${ad} · ${tur}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
    }
  }
  // Elle kurulmuş geçerli gövdeler (geniş units haritası dahil) + dekorlu sınıf
  const elle: Array<[string, Function, () => unknown]> = [];
  const bul = (ad: string) => siniflar.find((s) => s.ad === ad)?.sinif as Function;
  const units = () => Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [`Ad ${i}`, i % 2 ? 'adet' : 'mt']));
  elle.push(['TopluEslestirmeDto geçerli + 5.000 units', bul('TopluEslestirmeDto'),
    () => ({ brandId: 'b', materialNames: ['Vana', 'Boru'], variantTags: ['kaynakli'], units: units() })]);
  elle.push(['IscilikTopluEslestirmeDto geçerli + 5.000 units', bul('IscilikTopluEslestirmeDto'),
    () => ({ firmaId: 'f', laborNames: ['Montaj'], units: units() })]);
  elle.push(['TopluEslestirmeDto units biçimsiz', bul('TopluEslestirmeDto'), () => ({ brandId: 'b', materialNames: ['a'], units: { a: 5 } })]);
  elle.push(['CreateQuoteDto kalem + ızgara', bul('CreateQuoteDto'), () => ({
    title: 'T', items: [{ materialName: 'Vana', quantity: 2, unitPrice: 10, fazla: 1 }],
    sheets: [{ name: 'S', index: 0, rowData: Array.from({ length: 50 }, (_, i) => ({ col1: `a${i}`, col2: i, _rowIdx: i })), columnRoles: { nameField: 'col1' } }],
  })]);
  elle.push(['SozlukKaydiDto ön yüz gövdesi', bul('SozlukKaydiDto'), () => ({ alias: 'pis su', canonical: 'PVC', kinds: ['pvc'], sizeClass: 'plastic', impliedType: null })]);
  elle.push(['AddLibraryRowsDto geçerli', bul('AddLibraryRowsDto'), () => ({ listId: 'new', rows: [{ materialName: 'Vana', listPrice: 10, currency: 'TRY' }] })]);
  elle.push(['LoginDto geçerli', bul('LoginDto'), () => ({ email: 'a@b.test', password: 'Gizli12345!' })]);
  elle.push(['Dekorlu (@Expose/@Exclude) özgün yola düşer', Dekorlu, () => ({ ad: 'x', isim: 'y', gizli: 'z', serbest: 'w', fazla: 1 })]);
  elle.push(['yalnız @Expose, açılan alan gövdede YOK', YalnizAcilan, () => ({ serbest: 'w', fazla: 1 })]);
  elle.push(['SINIF düzeyi @Exclude', SinifDuzeyiDislanan, () => ({ a: 'x', b: 'y', fazla: 1 })]);
  elle.push(['SINIF düzeyi @Expose', SinifDuzeyiAcik, () => ({ a: 'x', fazla: 1 })]);
  elle.push(['atası SINIF düzeyi @Exclude (torun etkilenmez)', AcikTorun, () => ({ a: 'x', t: 'y', fazla: 1 })]);
  elle.push(['atasından ÖZELLİK düzeyi @Exclude', OzellikTorunu, () => ({ gizli: 'g', acik: 'a', fazla: 1 })]);
  for (const [ad, sinif, uret] of elle) {
    proto.getKeys = ozgun;
    const a = await kos(sinif, uret);
    proto.getKeys = yamali;
    const b = await kos(sinif, uret);
    toplam++;
    if (a !== b) farklar.push(`${ad}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
  }
  // TERS YÖN (sınıf → düz nesne): bugün depoda yanıt serileştirmesi yok
  // (ClassSerializerInterceptor / instanceToPlain kullanılmıyor), ama yama
  // aynı getKeys'i değiştirir — yarın biri yanıt tipini @Exclude() ile
  // gizlerse alanlar sızmasın.
  const yeni = <T extends object>(s: new () => T, alanlar: Record<string, unknown>) => Object.assign(new s(), alanlar);
  const tersler: Array<[string, () => unknown]> = [
    ['Dekorlu', () => yeni(Dekorlu, { isim: 'y', gizli: 'z', serbest: 'w', fazla: 1 })],
    ['SINIF düzeyi @Exclude', () => yeni(SinifDuzeyiDislanan, { a: 'x', b: 'y', sifreHash: 'h' })],
    ['SINIF düzeyi @Expose', () => yeni(SinifDuzeyiAcik, { a: 'x', fazla: 1 })],
    ['yalnız @Expose', () => yeni(YalnizAcilan, { serbest: 'w' })],
    ['atası SINIF düzeyi @Exclude', () => yeni(AcikTorun, { a: 'x', t: 'y' })],
    ['atasından ÖZELLİK düzeyi @Exclude', () => yeni(OzellikTorunu, { gizli: 'g', acik: 'a' })],
    ['iç içe (düz nesnede sınıf örnekleri)', () => ({
      kullanici: yeni(SinifDuzeyiDislanan, { a: 'x', sifreHash: 'h' }), liste: [yeni(Dekorlu, { gizli: 'z', serbest: 'w' })], u: undefined,
    })],
    ['düz geniş nesne (2.000 anahtar)', () => genis(2_000, { ic: genis(500) })],
  ];
  for (const [ad, uret] of tersler) {
    proto.getKeys = ozgun;
    const a = jsTam(instanceToPlain(uret()));
    proto.getKeys = yamali;
    const b = jsTam(instanceToPlain(uret()));
    toplam++;
    if (a !== b) farklar.push(`ters yön ${ad}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
  }
  // Seçenekli dönüşüm: hızlı yol UYGULANMAMALI (seçenek koşulu). Depo bunları
  // kullanmıyor; yarın biri açarsa davranış değişmesin.
  const secenekli: Array<[string, Record<string, unknown>]> = [
    ['excludeExtraneousValues', { excludeExtraneousValues: true }],
    ['groups', { groups: ['yonetici'] }],
    ['excludePrefixes', { excludePrefixes: ['_'] }],
  ];
  for (const [ad, transformOptions] of secenekli) {
    const sPipe = new ValidationPipe({ whitelist: true, transform: true, transformOptions });
    const uret = () => ({ email: 'a@b.test', password: 'Gizli12345!', _gizli: 1, fazla: 2 });
    const sKos = async () => {
      try { return js(await sPipe.transform(uret(), { type: 'body', metatype: LoginDto })); } catch (e: any) { return `HATA ${js(e?.response?.message)}`; }
    };
    proto.getKeys = ozgun;
    const a = await sKos();
    proto.getKeys = yamali;
    const b = await sKos();
    toplam++;
    if (a !== b) farklar.push(`seçenek ${ad}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
  }
  proto.getKeys = yamali;
  console.log(`     (ölçüm) ${siniflar.length} DTO × ${turler.length} gövde türü + ${elle.length} elle gövde + ${tersler.length} ters yön + ${secenekli.length} seçenekli = ${toplam} karşılaştırma`);
  check(`E2 ⭐ ${toplam} karşılaştırmanın HEPSİNDE özgün ve yamalı çıktı birebir`, farklar.length === 0, farklar.slice(0, 5).join(' | '));
  check('E3 FIXTURE: karşılaştırma gerçekten koştu (≥ 600)', toplam >= 600, String(toplam));

  // İlk kullanımdan SONRA eklenen dekoratör: meta veri her çağrıda okunur.
  // (İlk yama sınıf başına önbellek tutuyordu; dekoratör sonradan gelince
  // yamalı yol bayat "sade" kararıyla gizli alanı geçirirdi — 06.10 incelemesi.)
  class Gec {
    @IsOptional() @IsString() a?: string;
    @IsOptional() @IsString() b?: string;
  }
  const gecGovde = () => ({ a: '1', b: '2' });
  const ilk = await kos(Gec, gecGovde); // yamalı yolda ilk kullanım
  Exclude()(Gec.prototype, 'b');
  proto.getKeys = ozgun;
  const gecOzgun = await kos(Gec, gecGovde);
  proto.getKeys = yamali;
  const gecYamali = await kos(Gec, gecGovde);
  check('E4-FIXTURE sonradan eklenen @Exclude özgünde alanı gizliyor (ilk kullanımda vardı)',
    ilk.includes('"b"') && !gecOzgun.includes('"b"'), js({ ilk, gecOzgun }));
  check('E4 ilk kullanımdan SONRA eklenen dekoratör yamalı yolda bayat kalmaz (önbellek yok)', gecYamali === gecOzgun,
    js({ gecOzgun, gecYamali }));
}

// ═══ K — bağlantı ═════════════════════════════════════════════════════════════
function kBlogu(): void {
  console.log('\n── K · bağlantı ──');
  const ana = yorumsuz(fs.readFileSync(path.join(KOK, 'backend', 'src', 'main.ts'), 'utf8'));
  const kurulum = ana.indexOf('sinifDonusturucuYamasiniKur()');
  const uygulama = ana.indexOf('NestFactory.create');
  check('K1 ⭐ main.ts yamayı uygulama kurulmadan ÖNCE kurar', kurulum > 0 && uygulama > kurulum, js({ kurulum, uygulama }));
  check('K2 yama TEK yerden kurulur', (ana.match(/sinifDonusturucuYamasiniKur\(/g) ?? []).length === 1);
  // 06.10 (HIGH-A ile birleşme, koordinatör): iki güvenlik kurulumunun SIRASI —
  // gövde tavanları ayrıştırıcılardan önce, güvenli doğrulama borusu en sonda.
  const sira = ['sinifDonusturucuYamasiniKur()', 'NestFactory.create', 'govdeSinirlariniKur(app)', 'buyukGovdeUclariniKur(app)',
    'app.use(json(', 'app.use(urlencoded(', 'govdeHatalariniKur(app)', 'useGlobalPipes('].map((s) => ({ s, i: ana.indexOf(s) }));
  check('K4 ⭐ main.ts KURULUM SIRASI: yama → uygulama → yol başı küçük tavanlar → büyük gövde uçları → global ayrıştırıcılar → hata katmanı → GÜVENLİ doğrulama borusu',
    sira.every((x, k) => x.i > 0 && (k === 0 || x.i > sira[k - 1].i)) && /useGlobalPipes\(\s*new GuvenliValidationPipe\(/.test(ana),
    js(sira));
  const sinir = (yol: string) => GOVDE_SINIRLARI.find((s) => s.yol === yol)?.sinir;
  check('K3 kimliksiz yollar bayt tavanlı: /api/auth 32 KB, iyzico dönüşleri 16 KB',
    sinir('/api/auth') === '32kb' && sinir('/api/abonelik/iyzico-donus') === '16kb' && sinir('/api/abonelik/iyzico-kart-donus') === '16kb',
    js(GOVDE_SINIRLARI));
}

bitmezseKirmizi((async () => {
  check('A0 FIXTURE: A bloğu yamasız koşar (bayt tavanı tek başına yetmeli)', !sinifDonusturucuYamasiKuruluMu());
  await aBlogu();
  await bBlogu();
  await eBlogu();
  kBlogu();
  console.log(`\n${'='.repeat(64)}\nGOVDE GENISLIGI: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(64)}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
