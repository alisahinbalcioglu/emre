/**
 * DOĞRULAMA BORUSU — 06.10.2026 (güvenlik incelemesi HIGH-A).
 *   `npm run test:dogrulama-borusu` · DB/AĞ GEREKTİRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   class-transformer 0.5.1 iç içe nesnenin tipini nesnenin KENDİ
 *   `constructor` anahtarından tahmin ediyor; tahmin edilen "tip" süreç ömürlü
 *   `_ancestorsMap`e yazılıp hiç toplanmıyordu (kalıcı bellek) ve istek 500 +
 *   yığınlı ERROR ile bitiyordu. Dönüşüm whitelist'ten ÖNCE koştuğu için DTO'da
 *   olmayan alan da yetiyordu: kimliksiz login dahil her DTO ucu; JSON,
 *   urlencoded gövde ve sorgu dizesi (qs `allowPrototypes: true`).
 *   Düzeltme: `GuvenliValidationPipe` (`altyapi/http/dogrulama-borusu.ts`).
 *
 * ── BLOKLAR ─────────────────────────────────────────────────────────────
 *   R  sızıntı: düz ValidationPipe'ta ÜRETİLİR (FIXTURE: 500 + kalıcı kayıt +
 *      GC sonrası bellek + ERROR), güvenli boruda YOK — JSON, urlencoded,
 *      sorgu, dizi içi; olağan giriş ve doğrulama yerinde.
 *   E  eşdeğerlik: depodaki TÜM DTO'lar × gövde türleri. constructor'sız
 *      gövdede düz ve güvenli boru BİREBİR; constructor'lı gövdede
 *      güvenli(g) = düz(g'nin constructor'ları silinmiş) — düzeltme tam olarak
 *      "dönüşümden önce kendi constructor anahtarını sil"dir.
 *   K  bağlantı (TypeScript sözdizim ağacıyla — yorum ve dize kod sayılmaz):
 *      main.ts genel boruyu güvenli sınıftan kurar; src'de düz ValidationPipe /
 *      ParseArrayPipe ADI yok (new, takma adlı içe aktarma, sınıf referansı,
 *      APP_PIPE useClass), tek alt sınıf güvenli boru.
 *
 * ⚠ E2 çıktıları JSON'la karşılaştırır: bir DTO'ya belirlenimci olmayan alan
 *   (ör. `createdAt = new Date()`) eklenirse yalancı kırmızı verir — o alan
 *   karşılaştırmadan dışlanmalı.
 *
 * Çıkış kodu: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import {
  Body, Controller, Get, Logger, Module, Post, Query, ValidationPipe, type LoggerService,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, getMetadataStorage } from 'class-validator';
import { json, urlencoded } from 'express';
import * as ts from 'typescript';

import { GuvenliValidationPipe } from '../src/altyapi/http/dogrulama-borusu';
import { LoginDto } from '../src/altyapi/auth/dto/login.dto';
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
/** `undefined` değerli anahtarı da gösteren karşılaştırma dizesi. */
const jsTam = (x: unknown) => JSON.stringify(x, (_k, v) => (v === undefined ? '⟨undefined⟩' : v));

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
const goreli = (tam: string) => path.relative(KOK, tam).replace(/\\/g, '/');
/** `backend/src` altındaki dosyalar (uzantıya göre). */
function srcDosyalari(uzanti: RegExp): string[] {
  const sonuc: string[] = [];
  const tara = (dizin: string) => {
    for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, g.name);
      if (g.isDirectory()) tara(tam);
      else if (uzanti.test(g.name)) sonuc.push(tam);
    }
  };
  tara(path.join(KOK, 'backend', 'src'));
  return sonuc;
}

// Sızıntının ölçüsü: class-transformer'ın süreç ömürlü ata haritası (kalıcı
// tutmanın KENDİSİ) + GC sonrası yığın (insan ölçüsü).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defaultMetadataStorage } = require('class-transformer/cjs/storage');
const ataHaritasi = (): Map<unknown, unknown> | undefined => (defaultMetadataStorage as any)._ancestorsMap;
/** Haritadaki SINIF OLMAYAN anahtarlar = istekten sızan nesneler. (Sınıf
 *  anahtarları meşrudur: bir DTO'nun ilk kullanımı kendi kaydını ekler.) */
const sizanKayit = (): number => [...ataHaritasi()!.keys()].filter((k) => typeof k !== 'function').length;
v8.setFlagsFromString('--expose_gc');
const gc: () => void = vm.runInNewContext('gc');
const yigin = (): number => { gc(); gc(); return process.memoryUsage().heapUsed; };

const DOLGU = 100_000; // istek başına tutulacak bayt (saldırganın dolgusu)
const ISTEK = 30;
const MB = 1024 * 1024;

// ═══ Kukla uçlar — main.ts ile AYNI ayrıştırıcılar ════════════════════════════
class SorguDto {
  @IsOptional() @IsString() q?: string;
}
/** `GET /api/quotes` sorgusunun (TekliflerSorgusuDto `sayfa`) biçimi: sayıya çevrilen alan. */
class SayfaDto {
  @IsOptional() @Type(() => Number) @IsInt() sayfa?: number;
}
let girisCagri = 0;
@Controller('auth')
class KuklaGiris {
  @Post('login') giris(@Body() dto: LoginDto) { girisCagri++; return { ok: true, email: dto.email }; }
}
@Controller('kukla')
class KuklaSorgu {
  @Get('ara') ara(@Query() q: SorguDto) { return { ok: true, q: q.q ?? null }; }
  @Get('sayfa') sayfa(@Query() q: SayfaDto) { return { ok: true, sayfa: q.sayfa ?? null }; }
}

async function uygulamaKur(Boru: typeof ValidationPipe) {
  @Module({ controllers: [KuklaGiris, KuklaSorgu] })
  class KuklaModulu {}
  const app = await NestFactory.create<NestExpressApplication>(KuklaModulu, { logger: yakalayici });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.useGlobalPipes(new Boru({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const iste = async (yol: string, secenek: { govde?: string; tur?: string } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${yol}`, secenek.govde === undefined
      ? { signal: AbortSignal.timeout(60_000) }
      : { method: 'POST', headers: { 'content-type': secenek.tur ?? 'application/json' }, body: secenek.govde, signal: AbortSignal.timeout(60_000) });
    return { durum: r.status, metin: await r.text() };
  };
  return { app, iste };
}

/** Saldırı biçimleri: her biri `ISTEK` kez gönderilir. */
const dolgu = (n: number) => 'a'.repeat(n);
const SALDIRILAR: Array<{ ad: string; yol: string; govde?: () => string; tur?: string; dolguBayti: number; istek: number }> = [
  {
    ad: 'JSON gövde, DTO\'da OLMAYAN alanda', yol: '/auth/login', dolguBayti: DOLGU, istek: ISTEK,
    govde: () => js({ email: 'a@b.test', password: 'Gizli12345!', x: { constructor: { prototype: {}, pad: dolgu(DOLGU) } } }),
  },
  {
    ad: 'JSON gövde, dizi öğesinde 3. derinlik', yol: '/auth/login', dolguBayti: DOLGU, istek: ISTEK,
    govde: () => js({ email: 'a@b.test', password: 'Gizli12345!', rows: [{ a: { constructor: { prototype: {}, pad: dolgu(DOLGU) } } }] }),
  },
  {
    ad: 'urlencoded gövde (qs allowPrototypes)', yol: '/auth/login', tur: 'application/x-www-form-urlencoded', dolguBayti: DOLGU, istek: ISTEK,
    govde: () => `email=a%40b.test&password=Gizli12345!&x[constructor][prototype][a]=1&x[constructor][pad]=${dolgu(DOLGU)}`,
  },
  // URL ~16 KB başlık sınırında: dolgu 8 KB — toplam yığın gürültüsünün üstünde kalsın diye 300 istek.
  { ad: 'sorgu dizesi (Express qs)', yol: `/kukla/ara?q=x&x[constructor][prototype][a]=1&x[constructor][pad]=${dolgu(8_000)}`, dolguBayti: 8_000, istek: 300 },
];

async function saldir(Boru: typeof ValidationPipe, s: (typeof SALDIRILAR)[number]) {
  const d = await uygulamaKur(Boru);
  try {
    // Isınma: saldırının ZARARSIZ İKİZİ (aynı biçim ve boy, anahtar `kurucu`),
    // aynı sayıda. Ölçüldü (06.10): ilk yüzlerce istek — meşru olsa da —
    // yığını 0,7-1,4 MB büyütüp düzleşiyor (tembel derleme, tampon havuzları);
    // ısınmadan sonra saldırının kendi katkısı kalır.
    const ikizYol = s.yol.replace(/constructor/g, 'kurucu');
    for (let i = 0; i < s.istek; i++) {
      await d.iste(ikizYol, s.govde ? { govde: s.govde().replace(/constructor/g, 'kurucu'), tur: s.tur } : {});
    }
    const kayitOnce = sizanKayit();
    const yiginOnce = yigin();
    gunluk.length = 0;
    const durumlar: number[] = [];
    for (let i = 0; i < s.istek; i++) {
      const r = await d.iste(s.yol, s.govde ? { govde: s.govde(), tur: s.tur } : {});
      durumlar.push(r.durum);
    }
    const yiginArti = yigin() - yiginOnce;
    return {
      durumlar: [...new Set(durumlar)],
      kayitArti: sizanKayit() - kayitOnce,
      yiginArtiMb: Math.round((yiginArti / MB) * 100) / 100,
      beklenenMb: Math.round(((s.istek * s.dolguBayti) / MB) * 100) / 100,
      error: gunluk.filter((g) => g.startsWith('ERROR')).length,
    };
  } finally {
    await d.app.close();
  }
}

// ═══ R — sızıntı: düz boruda üretilir, güvenli boruda yok ═══════════════════
async function rBlogu(): Promise<void> {
  console.log('\n── R · iç içe constructor: düz boruda kalıcı tutma + 500, güvenli boruda yok ──');
  check('R0-FIXTURE class-transformer ata haritası okunabiliyor (Map)', ataHaritasi() instanceof Map);
  for (const [i, s] of SALDIRILAR.entries()) {
    const no = i + 1;
    const duz = await saldir(ValidationPipe, s);
    const guv = await saldir(GuvenliValidationPipe, s);
    console.log(`     (ölçüm) ${s.ad}: ${s.istek} istek × ${s.dolguBayti} bayt — düz ${js(duz)} · güvenli ${js(guv)}`);
    check(`R${no}-FIXTURE ${s.ad}: DÜZ boruda sızıntı ÜRETİLİYOR (500, istek başına kalıcı kayıt, ERROR)`,
      js(duz.durumlar) === js([500]) && duz.kayitArti === s.istek && duz.error >= s.istek, js(duz));
    check(`R${no}-FIXTURE ${s.ad}: düz boruda GC sonrası tutulan bellek dolgunun ≥ %70'i`,
      duz.yiginArtiMb >= 0.7 * duz.beklenenMb, js(duz));
    check(`R${no} ⭐ ${s.ad}: güvenli boruda KALICI KAYIT YOK`, guv.kayitArti === 0, js(guv));
    check(`R${no}b ${s.ad}: güvenli boruda 500 yok, ERROR yok`,
      !guv.durumlar.includes(500) && guv.durumlar.every((x) => x < 400) && guv.error === 0, js(guv));
    check(`R${no}c ${s.ad}: güvenli boruda GC sonrası artış dolgunun %25'inin altında`,
      guv.yiginArtiMb < 0.25 * guv.beklenenMb, js(guv));
  }

  // Olağan giriş ve doğrulama yerinde (bağlantı): güvenli boru DTO'yu doğrular.
  const d = await uygulamaKur(GuvenliValidationPipe);
  try {
    girisCagri = 0;
    const iyi = await d.iste('/auth/login', { govde: js({ email: 'a@b.test', password: 'Gizli12345!', fazla: 1 }) });
    check('R9 olağan giriş gövdesi geçer, denetleyiciye ulaşır', iyi.durum === 201 && girisCagri === 1 && JSON.parse(iyi.metin).email === 'a@b.test',
      js({ iyi, girisCagri }));
    const kotu = await d.iste('/auth/login', { govde: js({ email: 'e-posta-degil', password: 'x', x: { constructor: { prototype: {} } } }) });
    check('R10 doğrulama yerinde: biçimsiz e-posta 400 (500 DEĞİL)', kotu.durum === 400 && girisCagri === 1, js(kotu));
    const sayi = await d.iste('/kukla/sayfa?sayfa=3');
    check('R11 BAĞLANTI: sayıya çevrilen sorgu alanı olağan değerde çalışır (sayfa=3 → 3)',
      sayi.durum === 200 && JSON.parse(sayi.metin).sayfa === 3, js(sayi));
  } finally {
    await d.app.close();
  }

  // R5 — sayıya çevrilen alanda KENDİ toString/valueOf (güvenlik incelemesi
  // LOW-1, önceden vardı): `Number({toString:'1'})` TypeError → 500 + ERROR.
  const sayiSaldirisi = '/kukla/sayfa?sayfa[valueOf]=1&sayfa[toString]=1';
  const sonuc: Record<string, { durum: number; error: number }> = {};
  for (const [ad, Boru] of [['düz', ValidationPipe], ['güvenli', GuvenliValidationPipe]] as const) {
    const a = await uygulamaKur(Boru);
    try {
      gunluk.length = 0;
      const r = await a.iste(sayiSaldirisi);
      sonuc[ad] = { durum: r.durum, error: gunluk.filter((g) => g.startsWith('ERROR')).length };
    } finally {
      await a.app.close();
    }
  }
  console.log(`     (ölçüm) sayı alanında toString/valueOf: ${js(sonuc)}`);
  check('R5-FIXTURE düz boruda sayı alanına toString/valueOf nesnesi 500 + ERROR', sonuc['düz'].durum === 500 && sonuc['düz'].error >= 1, js(sonuc));
  check('R5 ⭐ güvenli boruda 400 (doğrulama), ERROR yok', sonuc['güvenli'].durum === 400 && sonuc['güvenli'].error === 0, js(sonuc));
}

// ═══ E — eşdeğerlik: depodaki TÜM DTO'lar ═══════════════════════════════════
function dtoSiniflari(): Array<{ ad: string; sinif: Function }> {
  const sonuc: Array<{ ad: string; sinif: Function }> = [];
  for (const tam of srcDosyalari(/\.dto\.ts$/)) {
    for (const [ad, deger] of Object.entries(require(tam))) {
      if (typeof deger === 'function' && /Dto$/.test(ad)) sonuc.push({ ad, sinif: deger as Function });
    }
  }
  return sonuc;
}
/** Kaynaktaki `export class …Dto` sayısı — E1'in ölçütü taramadan türer. */
const kaynaktakiDtoSayisi = () => srcDosyalari(/\.dto\.ts$/)
  .reduce((t, tam) => t + (fs.readFileSync(tam, 'utf8').match(/export\s+(?:abstract\s+)?class\s+\w+Dto\b/g) ?? []).length, 0);
const alanlari = (sinif: Function): string[] => [...new Set(
  getMetadataStorage().getTargetValidationMetadatas(sinif, '', true, false).map((m) => m.propertyName),
)];
const herAlana = (alanlar: string[], deger: () => unknown) => Object.fromEntries(alanlar.map((a) => [a, deger()]));
const genis = (n: number, taban: Record<string, unknown> = {}) => {
  const g: Record<string, unknown> = { ...taban };
  for (let i = 0; i < n; i++) g[`k${i}`] = 'a';
  return g;
};
/** Testin KENDİ listesi ve silicisi (üretim sabitine bağlı DEĞİL): her derinlikte,
 *  dizi öğeleri dahil, nesnenin kendi `constructor` / `toString` / `valueOf`u. */
const OZ_ANAHTARLAR = ['constructor', 'toString', 'valueOf'];
function ozAnahtarSil<T>(x: T): T {
  if (Array.isArray(x)) { x.forEach(ozAnahtarSil); return x; }
  if (x !== null && typeof x === 'object') {
    for (const a of OZ_ANAHTARLAR) if (Object.prototype.hasOwnProperty.call(x, a)) delete (x as any)[a];
    for (const k of Object.keys(x as object)) ozAnahtarSil((x as any)[k]);
  }
  return x;
}

async function eBlogu(): Promise<void> {
  console.log('\n── E · eşdeğerlik: depodaki TÜM DTO\'lar, düz ↔ güvenli boru ──');
  const duz = new ValidationPipe({ whitelist: true, transform: true });
  const guvenli = new GuvenliValidationPipe({ whitelist: true, transform: true });
  const kos = async (boru: ValidationPipe, sinif: Function, govde: unknown) => {
    try {
      const r = await boru.transform(govde, { type: 'body', metatype: sinif as any });
      return `OK:${(r as any)?.constructor?.name}:${jsTam(r)}`;
    } catch (e: any) {
      return `HATA:${e?.status ?? e?.constructor?.name}:${js(e?.response?.message ?? e?.message)}`;
    }
  };
  const siniflar = dtoSiniflari();
  const beklenenDto = kaynaktakiDtoSayisi();
  check("E1 FIXTURE: depodaki DTO'ların HEPSİ yüklendi (kaynaktaki `export class …Dto` sayısı kadar) ve LoginDto aralarında",
    siniflar.length === beklenenDto && beklenenDto > 0 && siniflar.some((s) => s.ad === 'LoginDto'), `${siniflar.length}/${beklenenDto}`);
  const yalin: Array<[string, (a: string[]) => () => unknown]> = [
    ['boş', () => () => ({})],
    ['fazla alan + prototip adlı anahtar', () => () => ({ ...JSON.parse('{"__proto__":{"x":1},"prototype":{"y":2},"toString":"t"}'), fazla: 1, ic: { a: [1] } })],
    ['alan = metin', (a) => () => herAlana(a, () => 'x')],
    ['alan = sayı', (a) => () => herAlana(a, () => 5)],
    ['alan = mantıksal', (a) => () => herAlana(a, () => true)],
    ['alan = null', (a) => () => herAlana(a, () => null)],
    ['alan = iç içe nesne (prototype adlı alan dahil)', (a) => () => herAlana(a, () => ({ a: 1, prototype: { p: 1 }, b: { c: [1, 'x'] } }))],
    ['alan = karışık dizi', (a) => () => herAlana(a, () => ['a', 1, { b: 2 }])],
    ['alan = nesne dizisi', (a) => () => herAlana(a, () => [{ materialName: 'Vana', quantity: 1, x: 1 }, { ad: 'y', fazla: { z: 1 } }])],
    ['alan = 500 anahtarlı geniş Record', (a) => () => genis(500, herAlana(a, () => genis(500)))],
  ];
  const yapicili: Array<[string, (a: string[]) => () => unknown]> = [
    ['üst düzey constructor', () => () => JSON.parse('{"constructor":{"prototype":{},"p":1},"fazla":1}')],
    ['alanda iç içe constructor (nesne)', (a) => () => herAlana(a, () => JSON.parse('{"constructor":{"prototype":{},"p":"x"},"b":1}'))],
    ['alanda iç içe constructor (dize)', (a) => () => herAlana(a, () => JSON.parse('{"constructor":"c","b":1}'))],
    ['dizi öğesinde constructor', (a) => () => herAlana(a, () => JSON.parse('[{"constructor":{"prototype":{}},"b":1}]'))],
    ['alanda iç içe constructor (yanlış değerler)', (a) => () => herAlana(a, () => JSON.parse('{"constructor":null,"x":{"constructor":0},"y":{"constructor":""},"b":1}'))],
    ['alanda kendi toString/valueOf', (a) => () => herAlana(a, () => JSON.parse('{"toString":"1","valueOf":"1","b":1}'))],
  ];
  let toplam = 0;
  const farklar: string[] = [];
  // Ek ölçüt: düz boru constructor'lı gövdeyi HATASIZ işliyorsa çıktı birebir aynı
  // (silici testin kendisine dayanmaz); iki dal da koşmalı (FIXTURE).
  let duzBasarili = 0;
  let duzHata = 0;
  for (const { ad, sinif } of siniflar) {
    const alanlar = alanlari(sinif);
    for (const [tur, uretici] of yalin) {
      const uret = uretici(alanlar);
      const a = await kos(duz, sinif, uret());
      const b = await kos(guvenli, sinif, uret());
      toplam++;
      if (a !== b) farklar.push(`${ad} · ${tur}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
    }
    for (const [tur, uretici] of yapicili) {
      const uret = uretici(alanlar);
      const a = await kos(duz, sinif, ozAnahtarSil(uret()));
      const b = await kos(guvenli, sinif, uret());
      toplam++;
      if (a !== b) farklar.push(`${ad} · ${tur}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
      const ham = await kos(duz, sinif, uret());
      if (ham.startsWith('HATA:TypeError')) duzHata++;
      else {
        duzBasarili++;
        toplam++;
        if (ham !== b) farklar.push(`${ad} · ${tur} (düz hatasız): ${ham.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
      }
    }
  }
  // Elle kurulmuş GEÇERLİ gövdeler: kullanıcı anahtarlı alanda "prototype" /
  // "constructor" adlı veri (malzeme adı, ızgara sütunu). `prototype` SİLİNMEZ —
  // silinseydi "prototype" adlı malzemenin birimi düşerdi (A7 mutantı).
  const bul = (ad: string) => siniflar.find((s) => s.ad === ad)!.sinif;
  const elle: Array<[string, Function, () => unknown]> = [
    ['TopluEslestirmeDto units\'te "prototype" adlı malzeme', bul('TopluEslestirmeDto'),
      () => ({ brandId: 'b', materialNames: ['prototype', 'Vana'], units: { prototype: 'adet', Vana: 'mt' } })],
    ['IscilikTopluEslestirmeDto units\'te "prototype"', bul('IscilikTopluEslestirmeDto'),
      () => ({ firmaId: 'f', laborNames: ['prototype'], units: { prototype: 'mt' } })],
    ['CreateQuoteDto ızgara satırında "prototype" sütunu', bul('CreateQuoteDto'), () => ({
      title: 'T', items: [{ materialName: 'Vana', quantity: 1 }],
      sheets: [{ name: 'S', index: 0, rowData: [{ prototype: 'p', col1: 'Vana', _rowIdx: 0 }], columnRoles: { nameField: 'col1' } }],
    })],
  ];
  let elleOk = 0;
  for (const [ad, sinif, uret] of elle) {
    const a = await kos(duz, sinif, uret());
    const b = await kos(guvenli, sinif, uret());
    toplam++;
    if (a.startsWith('OK:') && a.includes('"prototype"')) elleOk++;
    if (a !== b) farklar.push(`${ad}: ${a.slice(0, 90)} ≠ ${b.slice(0, 90)}`);
  }
  check('E5-FIXTURE elle gövdelerin HEPSİ geçerli ve çıktıda "prototype" adlı veri taşıyor', elleOk === elle.length,
    `${elleOk}/${elle.length}`);
  console.log(`     (ölçüm) ${siniflar.length} DTO × (${yalin.length} yalın + ${yapicili.length} öz anahtarlı) gövde + düzün hatasız işlediği ${duzBasarili} gövde + ${elle.length} elle = ${toplam} karşılaştırma (düz boru ${duzHata} gövdede TypeError)`);
  check(`E2 ⭐ ${toplam} karşılaştırmanın HEPSİNDE: yalın gövdede düz = güvenli; öz anahtarlıda güvenli(g) = düz(g − öz anahtarlar) ve düz hatasızsa düz(g) = güvenli(g)`,
    farklar.length === 0, farklar.slice(0, 5).join(' | '));
  check('E3 FIXTURE: karşılaştırma gerçekten koştu (≥ 1.000)', toplam >= 1_000, String(toplam));
  check('E3b-FIXTURE öz anahtarlı gövdede iki dal da koştu (düz boru hem hatasız hem TypeError)', duzBasarili > 0 && duzHata > 0,
    js({ duzBasarili, duzHata }));

  // Düz boru constructor'lı gövdede gerçekten başka davranıyor (E2 boş ölçmesin).
  const dize = await kos(duz, siniflar.find((s) => s.ad === 'LoginDto')!.sinif, { email: 'a@b.test', password: 'x', ic: { constructor: 'c' } });
  check('E4-FIXTURE düz boru dize constructor\'lı iç içe nesnede ÇÖKÜYOR (TypeError → 500)', dize.startsWith('HATA:TypeError'), dize);
}

// ═══ K — bağlantı (sözdizim ağacı: yorum ve dize kod sayılmaz) ═══════════════
/** Ağaçtaki düğümler (koşula uyan). */
function dugumler<T extends ts.Node>(kok: ts.Node, uyar: (d: ts.Node) => d is T): T[] {
  const sonuc: T[] = [];
  const gez = (d: ts.Node) => { if (uyar(d)) sonuc.push(d); ts.forEachChild(d, gez); };
  gez(kok);
  return sonuc;
}
/** Düz boru adları: ParseArrayPipe da yasak — içinde düz ValidationPipe kurar. */
const YASAK_AD = new Set(['ValidationPipe', 'ParseArrayPipe']);
const BORU_DOSYASI = 'backend/src/altyapi/http/dogrulama-borusu.ts';
const agac = (ad: string, metin: string) => ts.createSourceFile(ad, metin, ts.ScriptTarget.Latest, true);
/** Yasak adın geçtiği yerler (`dosya:satır ad`). */
const yasakAdlar = (d: string, a: ts.SourceFile) => dugumler(a, ts.isIdentifier)
  .filter((i) => YASAK_AD.has(i.text))
  .map((i) => `${d}:${a.getLineAndCharacterOfPosition(i.getStart()).line + 1} ${i.text}`);

function kBlogu(): void {
  console.log('\n── K · bağlantı ──');
  const agaclar = srcDosyalari(/\.ts$/).map((tam) => ({ d: goreli(tam), a: agac(tam, fs.readFileSync(tam, 'utf8')) }));
  const ana = agaclar.find((x) => x.d === 'backend/src/main.ts')!.a;
  const cagrilar = dugumler(ana, ts.isCallExpression)
    .filter((c) => ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === 'useGlobalPipes');
  const argumanlar = cagrilar.flatMap((c) => [...c.arguments]);
  check('K1 ⭐ main.ts genel boruyu GÜVENLİ sınıftan kurar (tek useGlobalPipes, her argümanı new GuvenliValidationPipe)',
    cagrilar.length === 1 && argumanlar.length >= 1
      && argumanlar.every((x) => ts.isNewExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === 'GuvenliValidationPipe'),
    js({ cagri: cagrilar.length, arg: argumanlar.map((x) => x.getText(ana).slice(0, 60)) }));
  const duz = agaclar.filter((x) => x.d !== BORU_DOSYASI).flatMap((x) => yasakAdlar(x.d, x.a));
  check("K2 ⭐ src'de düz ValidationPipe/ParseArrayPipe ADI YOK (new · takma adlı içe aktarma · sınıf referansı · APP_PIPE useClass)",
    duz.length === 0, duz.join(', '));
  const altSiniflar = agaclar.flatMap((x) => dugumler(x.a, ts.isClassDeclaration)
    .filter((s) => s.heritageClauses?.some((h) => h.types.some((t) => YASAK_AD.has(t.expression.getText(x.a)))))
    .map((s) => `${x.d}:${s.name?.text}`));
  check("K3 ValidationPipe'in tek alt sınıfı güvenli boru", js(altSiniflar) === js([`${BORU_DOSYASI}:GuvenliValidationPipe`]), js(altSiniflar));
  const guvenliKurulum = agaclar.reduce((t, x) => t + dugumler(x.a, ts.isNewExpression)
    .filter((n) => ts.isIdentifier(n.expression) && n.expression.text === 'GuvenliValidationPipe').length, 0);
  check('K4-FIXTURE güvenli boru en az iki yerde kurulu (genel + yönetici parametre borusu)', guvenliKurulum >= 2, String(guvenliKurulum));
  // Ölçütün kendisi: takma adlı içe aktarmayı ve sınıf referansını GÖRÜR; yorumdaki
  // ve dizedeki adı (`'image/*'` gibi dizeler dahil) GÖRMEZ.
  const ornek = agac('ornek.ts', [
    "import { ValidationPipe as VP } from '@nestjs/common';",
    '// new ValidationPipe(',
    "const tur = 'image/* new ValidationPipe( */';",
    '@UsePipes(ValidationPipe) class A {}',
  ].join('\n'));
  const ornekAd = yasakAdlar('ornek.ts', ornek);
  check('K5-FIXTURE ölçüt takma adı ve sınıf referansını görür, yorumu ve dizeyi görmez (tam 2 ad)', ornekAd.length === 2, js(ornekAd));
}

bitmezseKirmizi((async () => {
  await rBlogu();
  await eBlogu();
  kBlogu();
  console.log(`\n${'='.repeat(64)}\nDOGRULAMA BORUSU: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(64)}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
