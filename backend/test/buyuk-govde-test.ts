/**
 * BÜYÜK GÖVDE — 06.10.2026 (güvenlik incelemesi MEDIUM-B/C).
 *   `npm run test:buyuk-govde` · DB/AĞ GEREKTİRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   Gövde ayrıştırma Nest kapılarından (JWT) ÖNCE koşar. Global tavan 50 MB
 *   iken kimliksiz bir istek HER yolda (404 ve kapılı uç dahil) 50 MB
 *   JSON.parse ettiriyordu (güvenlik incelemesi: komşu 5,2-5,6 sn bekledi —
 *   MEDIUM-C); kayıt herkese açık, kayıtlı biri tavansız bir DTO ucunda
 *   döngüyü ~31 sn tutabiliyordu (MEDIUM-B). Şimdi global 1 MB; büyük gövde
 *   yalnız ölçülmüş toplu uçlarda ve yalnız imzası geçerli oturum token'ıyla
 *   (`altyapi/http/buyuk-govde.ts`).
 *
 * ── BLOKLAR ─────────────────────────────────────────────────────────────
 *   B  bağlantı: her kural GERÇEK bir Nest ucuna (yöntem + yol) karşılık gelir,
 *      o uç JwtAuthGuard taşır (token geçersizken gövdeyi okumamak güvenli:
 *      kapı her zaman reddeder), yönetici kuralı ↔ @Roles('admin'); hiçbir
 *      kuralın deseni TÜM denetleyicilerde başka bir rotayı eşlemez; İKİ YÖNLÜ
 *      (inceleme MEDIUM-2): her `@DiziTavani` ucu ve dizili gövdeli her yönetici
 *      ucu ya kuralda ya da gerekçeli istisnada, her kuralın yapısal gerekçesi
 *      var; "istemcisiz" istisnaların ön yüzde çağıranı yok; main.ts sırası ve
 *      global 1 MB.
 *   T  token kuralı: passport-jwt'nin GERÇEK kabul kararıyla birebir (imza,
 *      süre, algoritma, şema, başlık biçimi) + JwtStrategy'nin amac/aud reddi;
 *      ortak başlık ayrıştırıcısı (`bearerToken`) passport'un özgün
 *      çıkarıcısıyla bulanık testte EŞDEĞER ve DOĞRUSAL (inceleme HIGH-1);
 *      yönetici rolü; yol deseni Express gibi.
 *   K  üretimdeki JwtStrategy ORTAK ayrıştırıcıyı kullanır (davranış + süre);
 *      src'de passport'un karesel çıkarıcısı yok.
 *   H  HTTP (main.ts sırasıyla, GERÇEK JwtAuthGuard + RolesGuard, DB'siz test
 *      stratejisi, üretimin çıkarıcısıyla): kimliksiz 20 MB çok anahtarlı gövde
 *      toplu uca → gövde OKUNMAZ, kapı 401, komşu beklemez (FIXTURE: eski
 *      düzende bekler) · 404 yoluna 20 MB → 413 · uzun başlık düşer · gzip
 *      gövde AÇILMAZ → 415 (FIXTURE: eski düzen açar) · geçerli token'la 2 MB
 *      toplu uca geçer · tavansız uca 2 MB → 413 · yönetici olmayan token:
 *      2 MB → 413, küçük → 403 · tavan aşımı 413 · KALAN RİSK ölçümü (H16).
 *      Komşu eşiği = max(300 ms, 3 × aynı koşuda ölçülen taban); ısınma
 *      sayılmaz; okunamayan ölçüm NaN (iki yönde de düşer).
 *   Bulanık test tohumu çıktıda; düşen koşu `BUYUK_GOVDE_TOHUM=<tohum> npm run
 *   test:buyuk-govde` ile yeniden üretilir.
 *
 * Çıkış kodu: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  Body, Controller, Get, Injectable, Logger, Module, Param, Patch, Post, Put, RequestMethod,
  UnauthorizedException, UseGuards, type LoggerService,
} from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { json, urlencoded } from 'express';
import { sign } from 'jsonwebtoken';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as zlib from 'node:zlib';

process.env.TZ = 'UTC';
const GIZLI = 'test-buyuk-govde-gizli-anahtar-0123456789abcdef';
process.env.JWT_SECRET = GIZLI;

import { BUYUK_GOVDE_UCLARI, buyukGovdeUclariniKur, tokenDurumu, yolDeseni } from '../src/altyapi/http/buyuk-govde';
import { govdeHatalariniKur, govdeSinirlariniKur } from '../src/altyapi/http/govde-siniri';
import { GuvenliValidationPipe } from '../src/altyapi/http/dogrulama-borusu';
import { ALIAS_TUR_TAVANI } from '../src/altyapi/http/dizi-tavani';
import { sinifDonusturucuYamasiniKur } from '../src/altyapi/http/sinif-donusturucu-yamasi';
import { AZAMI_YETKI_BASLIGI, yetkiBasligiTavaniniKur } from '../src/altyapi/http/yetki-basligi';
import { bearerToken } from '../src/altyapi/auth/bearer-token';
import { JwtStrategy } from '../src/altyapi/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/altyapi/auth/guards/roles.guard';
import { Roles, ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
import { dekoratorVar, ucEnvanteri, type Uc } from './yardimci/uc-envanteri';
import { cagriDeseni, govdeTipi, onYuzDosyalari } from './yardimci/govde-tipi';
import { UZUN, ZOR_BASLIKLAR, ortancaMs, rastgeleBasliklar, yapisalBasliklar } from './yardimci/bulanik-baslik';

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
const MB = 1024 * 1024;
const token = (yuk: Record<string, unknown>, secenek: Record<string, unknown> = { expiresIn: '1h' }, gizli = GIZLI) =>
  sign(yuk, gizli, secenek);
const KULLANICI = token({ sub: 'u1', email: 'a@b.test', role: 'user' });
const YONETICI = token({ sub: 'y1', email: 'y@b.test', role: 'admin' });

// ═══ B — bağlantı: kurallar ↔ gerçek uçlar ═════════════════════════════════
/** `src` altındaki tüm denetleyici sınıfları (yalnız gerekli dosyalar yüklenir). */
function denetleyiciler(): Array<{ dosya: string; sinif: any }> {
  const sonuc: Array<{ dosya: string; sinif: any }> = [];
  const tara = (dizin: string) => {
    for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, g.name);
      if (g.isDirectory()) { tara(tam); continue; }
      if (!g.name.endsWith('.controller.ts')) continue;
      const metin = fs.readFileSync(tam, 'utf8');
      // Yalnız kuralların öneklerini taşıyan denetleyiciler (ağır modülleri yükleme).
      if (!/@Controller\([^)]*['"`](quotes|library|labor-firms|matching|labor-matching|admin)['"`]/.test(metin)) continue;
      for (const sinif of Object.values<any>(require(tam))) {
        if (typeof sinif === 'function' && Reflect.getMetadata(PATH_METADATA, sinif) !== undefined) {
          sonuc.push({ dosya: path.relative(KOK, tam).replace(/\\/g, '/'), sinif });
        }
      }
    }
  };
  tara(path.join(KOK, 'backend', 'src'));
  return sonuc;
}
const birlestir = (...k: string[]) => `/${k.map((x) => String(x ?? '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;

function bBlogu(): void {
  console.log('\n── B · bağlantı: kurallar ↔ gerçek Nest uçları ──');
  const uclar: Array<{ yontem: string; yol: string; kapilar: string[]; roller: string[] }> = [];
  for (const { sinif } of denetleyiciler()) {
    const onek = Reflect.getMetadata(PATH_METADATA, sinif);
    const sinifKapilari = (Reflect.getMetadata(GUARDS_METADATA, sinif) ?? []).map((g: any) => g?.name);
    const sinifRolleri = Reflect.getMetadata(ROLES_KEY, sinif) ?? [];
    for (const m of Object.getOwnPropertyNames(sinif.prototype)) {
      const islev = sinif.prototype[m];
      if (typeof islev !== 'function' || m === 'constructor') continue;
      const yontem = Reflect.getMetadata(METHOD_METADATA, islev);
      const altYol = Reflect.getMetadata(PATH_METADATA, islev);
      if (yontem === undefined || altYol === undefined) continue;
      for (const o of [onek].flat()) {
        for (const a of [altYol].flat()) {
          uclar.push({
            yontem: RequestMethod[yontem],
            yol: birlestir('api', o, a),
            kapilar: [...sinifKapilari, ...(Reflect.getMetadata(GUARDS_METADATA, islev) ?? []).map((g: any) => g?.name)],
            roller: [...sinifRolleri, ...(Reflect.getMetadata(ROLES_KEY, islev) ?? [])],
          });
        }
      }
    }
  }
  check('B0-FIXTURE gerçek denetleyicilerden uçlar okundu (≥ 60)', uclar.length >= 60, String(uclar.length));
  const eslesmeyen: string[] = [];
  const kapisiz: string[] = [];
  const ilkDegil: string[] = [];
  const rolUyumsuz: string[] = [];
  for (const k of BUYUK_GOVDE_UCLARI) {
    const uc = uclar.find((u) => u.yontem === k.yontem && u.yol.toLowerCase() === k.rota.toLowerCase());
    if (!uc) { eslesmeyen.push(`${k.yontem} ${k.rota}`); continue; }
    if (!uc.kapilar.includes('JwtAuthGuard')) kapisiz.push(`${k.yontem} ${k.rota}`);
    // İLK kapı: önündeki bir kapı (ör. gövdeyi okuyan dizi tavanı) boş gövdeyle karar vermesin.
    if (uc.kapilar[0] !== 'JwtAuthGuard') ilkDegil.push(`${k.yontem} ${k.rota} kapılar=${js(uc.kapilar)}`);
    if (!!k.yonetici !== uc.roller.includes('admin')) rolUyumsuz.push(`${k.yontem} ${k.rota} yonetici=${!!k.yonetici} roller=${js(uc.roller)}`);
  }
  check(`B1 ⭐ ${BUYUK_GOVDE_UCLARI.length} kuralın HER BİRİ gerçek bir uca (yöntem + yol) karşılık gelir`, eslesmeyen.length === 0, eslesmeyen.join(', '));
  check('B2 ⭐ her kuralın ucu JwtAuthGuard taşır (token geçersizken gövdeyi okumamak güvenli: kapı reddeder)', kapisiz.length === 0, kapisiz.join(', '));
  check('B2b JwtAuthGuard her kuralın ucunda İLK kapı', ilkDegil.length === 0, ilkDegil.join(' | '));
  check("B3 yönetici kuralı ⇔ ucun @Roles('admin')ı", rolUyumsuz.length === 0, rolUyumsuz.join(' | '));
  const envanter = ucEnvanteri(path.join(KOK, 'backend'));
  check('B0b-FIXTURE AST uç envanteri TÜM denetleyicileri okudu (≥ 150 uç)', envanter.length >= 150, String(envanter.length));
  // Kural TÜM denetleyicilerde (aynı yöntem ya da @All) YALNIZ kendi rotasıyla
  // kesişmeli (kesim kesim, iki yönlü — `@Post(':x')` de `manual-brand`i eşler): eşlediği başka (kapısız) rota geçersiz token'la BOŞ gövdeyle
  // koşardı (`:id` kesimi `/labor-firms/price-lists/save-bulk` gibi düz yolu da
  // eşler); aynı yolun İKİNCİ tanımı hangisinin koşacağını kayıt sırasına bırakırdı.
  const carpisan: string[] = [];
  for (const k of BUYUK_GOVDE_UCLARI) {
    const eslesen = envanter.filter((u) => (u.fiil === k.yontem || u.fiil === 'ALL') && kesisir(tamYol(u), k.rota));
    const kendisi = eslesen.filter((u) => u.fiil === k.yontem && tamYol(u).toLowerCase() === k.rota.toLowerCase());
    if (eslesen.length !== 1 || kendisi.length !== 1) {
      carpisan.push(`${k.yontem} ${k.rota} ↔ ${eslesen.map((u) => `${u.anahtar} (${u.dosya})`).join(', ') || 'hiçbiri'}`);
    }
  }
  check(`B3b her kuralın deseni TÜM denetleyicilerde (${envanter.length} uç) YALNIZ kendi rotasını eşler (çakışma ya da ikinci tanım yok)`,
    carpisan.length === 0, carpisan.join(' | '));
  ikiYonluBlok(envanter);
  // Teklif tavanı Excel yükleme tavanından TÜRER: kayıt yükü dosyanın base64'ünü
  // taşır (≤ 4/3 × yükleme tavanı) + satırlar (06.10 inceleme LOW-2).
  const yuklemeMb = Number(/fileSize:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(
    fs.readFileSync(path.join(KOK, 'backend', 'src', 'ozellik', 'giris', 'excel-grid', 'excel-grid.controller.ts'), 'utf8'))?.[1]);
  const teklifMb = BUYUK_GOVDE_UCLARI.filter((k) => /^\/api\/quotes(\/:id)?$/.test(k.rota)).map((k) => Number(/^(\d+)mb$/.exec(k.sinir)?.[1]));
  check(`B8 teklif tavanı ≥ Excel yükleme tavanının base64'ü + 1 MiB (yükleme ${yuklemeMb} MiB)`,
    Number.isFinite(yuklemeMb) && yuklemeMb > 0 && teklifMb.length === 2 && teklifMb.every((t) => t >= Math.ceil(yuklemeMb * 4 / 3) + 1),
    js({ yuklemeMb, teklifMb }));
  // Gerçek uçlar kuralın desenine uyar (örnek kimliklerle)
  const desenUymayan = BUYUK_GOVDE_UCLARI.filter((k) => !yolDeseni(k.rota).test(k.rota.replace(/:[^/]+/g, 'a1b2-c3')))
    .map((k) => k.rota);
  check('B4 her kuralın deseni kendi yolunu (örnek kimlikle) eşler', desenUymayan.length === 0, desenUymayan.join(', '));

  const ana = yorumsuz(fs.readFileSync(path.join(KOK, 'backend', 'src', 'main.ts'), 'utf8'));
  const sira = ['yetkiBasligiTavaniniKur(app)', 'govdeSinirlariniKur(app)', 'buyukGovdeUclariniKur(app)', "app.use(json({ limit: '1mb', inflate: false }))",
    "app.use(urlencoded({ extended: true, limit: '1mb', inflate: false }))", 'govdeHatalariniKur(app)'].map((s) => ({ s, i: ana.indexOf(s) }));
  check('B5 ⭐ main.ts SIRASI: yetki başlığı tavanı → yol başı küçük tavanlar → büyük gövde uçları → global 1 MB json + urlencoded (gzip açmaz) → hata katmanı',
    sira.every((x, k) => x.i > 0 && (k === 0 || x.i > sira[k - 1].i)), js(sira));
  // Her yazım (`"50mb"`, `'50MB'`, sayı) yakalansın: `limit` ANAHTARININ bütün değerleri (inceleme LOW-4).
  const limitler = [...ana.matchAll(/\blimit\s*:\s*([^,}\s]+)/g)].map((m) => m[1]);
  check("B6 main.ts'te global tavan yalnız 1 MB (json + urlencoded; başka hiçbir `limit` değeri yok, her yazımda)",
    js(limitler) === js(["'1mb'", "'1mb'"]), js(limitler));
}

// ═══ B (iki yönlü) — kural listesi ↔ toplu uçlar (inceleme MEDIUM-2) ═══════
/** Envanter yolu `/api` önekiyle (kural yolları gibi). */
const tamYol = (u: Uc) => (u.yol === '/' ? '/api' : `/api${u.yol}`);
const kuralBul = (u: Uc) => BUYUK_GOVDE_UCLARI.find((k) => k.yontem === u.fiil && k.rota.toLowerCase() === tamYol(u).toLowerCase());
const yoneticiUcu = (u: Uc) => [...u.sinifDekoratorleri, ...u.metotDekoratorleri].some((d) => /^Roles\(.*['"`]admin['"`]/.test(d));

const ISTEMCISIZ = 'ön yüzde çağıranı yok (06.10 tarama, inceleme LOW-2): geniş tavan kimlikli saldırı yüzeyini büyütürdü — '
  + 'istemci eklenirse önce gövde ölçülür, sonra kural yazılır (B9d onu yakalar)';
interface Istisna { gerekce: string; istemcisiz?: true }
/** `@DiziTavani` taşıyan ama geniş gövde kuralı BİLEREK olmayan uçlar. Gerekçe ZORUNLU. */
const KURALSIZ_DIZI_UCLARI: Readonly<Record<string, Istisna>> = {
  'POST /matching/aliases': { gerekce: `sözlük kaydı: tür dizisi ≤ ${ALIAS_TUR_TAVANI} öğe, gövde birkaç KB — global 1 MB yeter` },
  'POST /library/bulk-update-items': { gerekce: ISTEMCISIZ, istemcisiz: true },
  'POST /labor-firms/price-items/bulk-update': { gerekce: ISTEMCISIZ, istemcisiz: true },
  'POST /labor-firms/:id/save-from-sheets': { gerekce: ISTEMCISIZ, istemcisiz: true },
};
/** Dizili ya da tipi ÇÖZÜLEMEYEN gövdeli ama geniş gövde kuralı BİLEREK olmayan yönetici uçları. */
const KURALSIZ_YONETICI_UCLARI: Readonly<Record<string, Istisna>> = {
  'PUT /labor/:id': { gerekce: 'gövde tipi `any` (çözülemez → fail-closed): tek işçilik kalemi güncellemesi, küçük gövde — global 1 MB yeter' },
};
const BACKEND = path.join(KOK, 'backend');
/** İki yol kalıbı aynı isteği eşleyebilir mi? Kesim kesim, İKİ YÖNLÜ: `:param` her kesimi eşler. */
const kesisir = (a: string, b: string) => {
  const x = a.toLowerCase().split('/');
  const y = b.toLowerCase().split('/');
  return x.length === y.length && x.every((s, i) => s.startsWith(':') || y[i].startsWith(':') || s === y[i]);
};

function ikiYonluBlok(envanter: Uc[]): void {
  const dizili = envanter.filter((u) => dekoratorVar(u, 'DiziTavani'));
  check('B9-FIXTURE envanterde @DiziTavani taşıyan uçlar bulundu (≥ 10)', dizili.length >= 10, String(dizili.length));
  const eksik = dizili.filter((u) => !kuralBul(u) && !KURALSIZ_DIZI_UCLARI[u.anahtar]).map((u) => u.anahtar);
  check(`B9 ⭐ her @DiziTavani ucu (${dizili.length}) ya geniş gövde kuralında ya da gerekçeli istisnada (bir kural silinirse kırmızı)`,
    eksik.length === 0, eksik.join(', '));
  const bayat = Object.entries(KURALSIZ_DIZI_UCLARI)
    .filter(([a, i]) => !dizili.some((u) => u.anahtar === a && !kuralBul(u)) || i.gerekce.trim().length < 20).map(([a]) => a);
  check('B9b istisnaların her biri gerçek, kuralsız bir @DiziTavani ucu ve gerekçeli', bayat.length === 0, bayat.join(', '));
  yoneticiBlok(envanter);
  // Ters yön: her kuralın YAPISAL gerekçesi — kullanıcı kuralı öğe sayısı sınırlı
  // uca (@DiziTavani), yönetici kuralı dizili gövdeli yönetici ucuna.
  const gerekcesiz = BUYUK_GOVDE_UCLARI.filter((k) => {
    const u = envanter.find((x) => x.fiil === k.yontem && tamYol(x).toLowerCase() === k.rota.toLowerCase());
    if (!u) return true;
    return k.yonetici ? !(yoneticiUcu(u) && govdeTipi(BACKEND, u) === 'dizi') : !dekoratorVar(u, 'DiziTavani');
  }).map((k) => `${k.yontem} ${k.rota}`);
  check('B9c her kural gerekçeli: kullanıcı kuralının ucu @DiziTavani taşır, yönetici kuralınınki dizili gövdeli yönetici ucu',
    gerekcesiz.length === 0, gerekcesiz.join(', '));
  istemcisizBlok();
}

/** Dizili gövdeli yönetici uçları ↔ yönetici kuralları. Tip AST ile çözülür;
 *  çözülemeyen tip "dizi taşıyabilir" sayılır (fail-closed, inceleme LOW-1). */
function yoneticiBlok(envanter: Uc[]): void {
  const tipi = (anahtar: string) => {
    const u = envanter.find((x) => x.anahtar === anahtar);
    return u ? govdeTipi(BACKEND, u) : 'uç yok';
  };
  const ornek = { teklif: tipi('POST /quotes'), giris: tipi('POST /auth/login'), yonetici: tipi('POST /admin/materials/save-bulk'), iscilik: tipi('PUT /labor/:id') };
  check('B10-FIXTURE tip çözücü: içe aktarılan DTO dizisi → dizi · dizisiz DTO → dizisiz · satır içi dizi → dizi · `any` → cozulemedi',
    js(ornek) === js({ teklif: 'dizi', giris: 'dizisiz', yonetici: 'dizi', iscilik: 'cozulemedi' }), js(ornek));
  const aday = envanter.filter((u) => yoneticiUcu(u) && govdeTipi(BACKEND, u) !== 'dizisiz');
  check('B10-FIXTURE2 dizili gövdeli yönetici uçları bulundu (≥ 4: içe aktarma ×2, sayfadan kayıt, toplu malzeme)',
    aday.filter((u) => govdeTipi(BACKEND, u) === 'dizi').length >= 4, aday.map((u) => u.anahtar).join(', '));
  const eksik = aday.filter((u) => !kuralBul(u)?.yonetici && !KURALSIZ_YONETICI_UCLARI[u.anahtar])
    .map((u) => `${u.anahtar} (${govdeTipi(BACKEND, u)})`);
  check('B10 ⭐ dizili (ya da tipi çözülemeyen) gövdeli her yönetici ucu ya yönetici kuralında ya da gerekçeli istisnada',
    eksik.length === 0, eksik.join(', '));
  const bayat = Object.entries(KURALSIZ_YONETICI_UCLARI)
    .filter(([a, i]) => !aday.some((u) => u.anahtar === a && !kuralBul(u)) || i.gerekce.trim().length < 20).map(([a]) => a);
  check('B10b yönetici istisnalarının her biri gerçek, kuralsız, dizili/çözülemeyen gövdeli yönetici ucu ve gerekçeli',
    bayat.length === 0, bayat.join(', '));
}

/** "İstemcisiz" diye kuralsız bırakılan uçların ön yüzde çağıranı olmamalı:
 *  çağıran eklenirse gövdesi 1 MB'ı aşabilir → önce ölç, sonra kural (B9d). */
function istemcisizBlok(): void {
  const dosyalar = onYuzDosyalari(KOK);
  const metin = dosyalar.map((d) => fs.readFileSync(d, 'utf8'));
  const bilinen = ['/labor-firms/:id/save-bulk', '/library/manual-brand'].map((y) => metin.some((m) => cagriDeseni(y).test(m)));
  check('B9d-FIXTURE tarayıcı ön yüzü okur (≥ 200 dosya) ve bilinen iki çağrıyı (parametreli + düz) bulur',
    dosyalar.length >= 200 && bilinen.every(Boolean), js({ n: dosyalar.length, bilinen }));
  const istemcisiz = Object.entries(KURALSIZ_DIZI_UCLARI).filter(([, i]) => i.istemcisiz).map(([a]) => a);
  check('B9d-FIXTURE2 "istemcisiz" işaretli istisna sayısı tam 3 (işaret kaybolursa denetim boşa dönmesin)', istemcisiz.length === 3,
    js(istemcisiz));
  const cagrilan = istemcisiz.flatMap((a) => {
    const desen = cagriDeseni(a.split(' ')[1]);
    return dosyalar.filter((_, i) => desen.test(metin[i])).map((d) => `${a} ← ${path.relative(KOK, d)}`);
  });
  check('B9d ⭐ "istemcisiz" istisnaların ön yüzde çağıranı yok (çağıran eklenirse kural gerekir)', cagrilan.length === 0, cagrilan.join(' | '));
}

// ═══ T — token kuralı: passport-jwt'nin gerçek kararıyla birebir ═══════════
/** passport-jwt'nin GERÇEK kabul kararı (JwtStrategy'nin kurulumuyla aynı seçenekler). */
const passportKabul = (baslik?: string) => new Promise<boolean>((sonuc) => {
  const s: any = new Strategy(
    { jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: GIZLI },
    (yuk: any, done: any) => done(null, yuk),
  );
  s.success = () => sonuc(true);
  s.fail = () => sonuc(false);
  s.error = () => sonuc(false);
  s.authenticate({ headers: baslik === undefined ? {} : { authorization: baslik } });
});

async function tBlogu(): Promise<void> {
  console.log('\n── T · token kuralı ↔ passport-jwt ──');
  const ornekler: Array<[string, string | undefined, boolean /* amac|aud */]> = [
    ['geçerli', `Bearer ${KULLANICI}`, false],
    ['şema küçük harf', `bearer ${KULLANICI}`, false],
    ['şemadan sonra iki boşluk', `Bearer  ${KULLANICI}`, false],
    ['sonda fazla parça', `Bearer ${KULLANICI} ek`, false],
    ['HS384 aynı anahtar', `Bearer ${token({ sub: 'u1', role: 'user' }, { expiresIn: '1h', algorithm: 'HS384' })}`, false],
    ['süresi dolmuş', `Bearer ${token({ sub: 'u1', role: 'user' }, { expiresIn: -10 })}`, false],
    ['başka anahtar', `Bearer ${token({ sub: 'u1', role: 'user' }, { expiresIn: '1h' }, 'baska-anahtar-0123456789abcdef0123')}`, false],
    ['bozuk imza', `Bearer ${KULLANICI.slice(0, -3)}abc`, false],
    ['şema Basic', `Basic ${KULLANICI}`, false],
    ['yalnız şema', 'Bearer', false],
    ['başlık yok', undefined, false],
    ['amac taşıyan (MFA meydan okuması gibi)', `Bearer ${token({ sub: 'u1', amac: 'mfa' })}`, true],
    ['aud taşıyan', `Bearer ${token({ sub: 'u1' }, { expiresIn: '1h', audience: 'x' })}`, true],
    ['süresiz (exp yok)', `Bearer ${sign({ sub: 'u1', role: 'user' }, GIZLI)}`, false],
  ];
  const uyumsuz: string[] = [];
  for (const [ad, baslik, ozelAlan] of ornekler) {
    const beklenen = (await passportKabul(baslik)) && !ozelAlan ? 'gecerli' : 'gecersiz';
    const gercek = tokenDurumu(baslik, false, GIZLI);
    if (gercek !== beklenen) uyumsuz.push(`${ad}: kural=${gercek} passport+strateji=${beklenen}`);
  }
  check(`T1 ⭐ ${ornekler.length} başlıkta kural, passport-jwt'nin gerçek kararı + JwtStrategy amac/aud reddiyle birebir`,
    uyumsuz.length === 0, uyumsuz.join(' | '));
  check('T1-FIXTURE örneklerde iki karar da var (geçerli ve geçersiz)',
    ornekler.some(([, b]) => tokenDurumu(b, false, GIZLI) === 'gecerli') && ornekler.some(([, b]) => tokenDurumu(b, false, GIZLI) === 'gecersiz'));
  check("T2 yönetici kuralı: rolü 'admin' olmayan geçerli token 'yetkisiz', admin 'gecerli'",
    tokenDurumu(`Bearer ${KULLANICI}`, true, GIZLI) === 'yetkisiz' && tokenDurumu(`Bearer ${YONETICI}`, true, GIZLI) === 'gecerli');
  const desen = yolDeseni('/api/quotes/:id');
  check('T3 yol deseni Express gibi: harf duyarsız, sonda /, tek kesim parametre, alt yol EŞLEMEZ',
    desen.test('/api/quotes/abc') && desen.test('/API/Quotes/abc/') && !desen.test('/api/quotes/abc/info')
      && !desen.test('/api/quotes') && yolDeseni('/api/quotes').test('/api/quotes/') && !yolDeseni('/api/quotes').test('/api/quotes/upload-excel'));
  ayristiriciBlok();
}

// ═══ T4-T5 — ortak başlık ayrıştırıcısı ↔ passport'un özgün çıkarıcısı ════
/** passport-jwt'nin ÖZGÜN (çapasız, karesel) çıkarıcısı — eşdeğerliğin ölçütü. */
const ozgunCikarici = ExtractJwt.fromAuthHeaderAsBearerToken();
const istekle = (b: unknown) => ({ headers: b === undefined ? {} : { authorization: b } });
const ozgunToken = (b: unknown) => ozgunCikarici(istekle(b) as any) as string | null;
function ayristiriciBlok(): void {
  const yapisal = yapisalBasliklar();
  const tohum = Number(process.env.BUYUK_GOVDE_TOHUM) || (Date.now() % 2 ** 31);
  const rastgele = rastgeleBasliklar(tohum, 100_000);
  const farkli = [...yapisal, ...rastgele].filter((b) => bearerToken(b) !== ozgunToken(b)).slice(0, 5);
  const tokenli = yapisal.filter((b) => ozgunToken(b) !== null).length;
  console.log(`     (bulanık) tohum ${tohum} · yapısal ${yapisal.length} + rastgele ${rastgele.length} başlık · özgünde token çıkan yapısal ${tokenli}`);
  check('T4-FIXTURE örnekler iki sonucu da kapsar (token çıkan ≥ 1.000, çıkmayan ≥ 1.000)',
    tokenli >= 1_000 && yapisal.length - tokenli >= 1_000, js({ tokenli, n: yapisal.length }));
  check(`T4 ⭐ bearerToken, passport-jwt'nin ÖZGÜN çıkarıcısıyla ${yapisal.length + rastgele.length} başlıkta BİREBİR (tohum ${tohum})`,
    farkli.length === 0, farkli.map((b) => js(b)).join(' | '));
  const sureler = Object.entries(ZOR_BASLIKLAR).map(([ad, b]) => ({ ad, ms: Number(ortancaMs(() => bearerToken(b), 7).toFixed(3)) }));
  const ozgunMs = ortancaMs(() => ozgunToken(ZOR_BASLIKLAR['boşluksuz']), 3);
  console.log(`     (ölçüm) ${UZUN} karakter: özgün çıkarıcı ${Math.round(ozgunMs)} ms · bearerToken ${js(sureler)}`);
  check('T5-FIXTURE ölçüm karesel davranışı görür: özgün çıkarıcı 16.000 boşluksuz karakterde ≥ 50 ms', ozgunMs >= 50, `${ozgunMs.toFixed(1)} ms`);
  check('T5 ⭐ bearerToken DOĞRUSAL: 16.000 karakterlik her zor biçimde < 5 ms (ortanca)', sureler.every((s) => s.ms < 5), js(sureler));
  const durumSureleri = Object.entries(ZOR_BASLIKLAR)
    .map(([ad, b]) => ({ ad, ms: Number(ortancaMs(() => tokenDurumu(b, false, GIZLI), 7).toFixed(3)) }));
  check('T5b ⭐ ön denetim (tokenDurumu) da DOĞRUSAL: aynı biçimlerde < 5 ms (ifadeyi kopyalamaz, ortak işlevi çağırır)',
    durumSureleri.every((s) => s.ms < 5), js(durumSureleri));
}

// ═══ K — üretimdeki JwtStrategy ortak ayrıştırıcıyı kullanır ══════════════
/** Üretimdeki JwtStrategy'nin GERÇEK çıkarıcısı (DB'ye dokunmaz: yalnız kurulur). */
let gercekCikarici: ((req: unknown) => string | null) | undefined;
function uretimCikaricisi(): (req: unknown) => string | null {
  gercekCikarici ??= (new JwtStrategy({} as any) as unknown as { _jwtFromRequest: (req: unknown) => string | null })._jwtFromRequest;
  return gercekCikarici;
}
function kBlogu(): void {
  console.log('\n── K · üretimdeki JwtStrategy ↔ ortak ayrıştırıcı ──');
  const cikar = uretimCikaricisi();
  const ornekler = [...yapisalBasliklar(), ...rastgeleBasliklar(7, 20_000)];
  const farkli = ornekler.filter((b) => cikar(istekle(b)) !== ozgunToken(b)).slice(0, 5);
  check(`K1 ⭐ üretimdeki JwtStrategy'nin çıkarıcısı passport'un özgün kararıyla ${ornekler.length} başlıkta BİREBİR`,
    typeof cikar === 'function' && farkli.length === 0, farkli.map((b) => js(b)).join(' | '));
  const sureler = Object.entries(ZOR_BASLIKLAR).map(([ad, b]) => ({ ad, ms: Number(ortancaMs(() => cikar(istekle(b)), 7).toFixed(3)) }));
  check('K2 ⭐ üretimdeki çıkarıcı DOĞRUSAL: 16.000 karakterlik her zor biçimde < 5 ms (karesel özgün çıkarıcı değil)',
    sureler.every((s) => s.ms < 5), js(sureler));
  const kullanan: string[] = [];
  const tara = (d: string) => {
    for (const g of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, g.name);
      if (g.isDirectory()) tara(p);
      else if (g.name.endsWith('.ts') && /\bExtractJwt\b|fromAuthHeader/.test(yorumsuz(fs.readFileSync(p, 'utf8')))) kullanan.push(path.relative(KOK, p));
    }
  };
  tara(path.join(KOK, 'backend', 'test'));
  check('K3-FIXTURE tarayıcı çalışır: aynı tarama backend/test içinde bu kapının ExtractJwt kullanımını bulur',
    kullanan.some((d) => d.endsWith('buyuk-govde-test.ts')), kullanan.join(', '));
  kullanan.length = 0;
  tara(path.join(KOK, 'backend', 'src'));
  check("K3 src'de passport-jwt'nin hazır (karesel) çıkarıcısı kullanılmaz", kullanan.length === 0, kullanan.join(', '));
}

// ═══ H — HTTP: main.ts sırası, gerçek kapılar ══════════════════════════════
/** DB'siz `validate`: gerçek strateji rolü DB'den okur; `dbRol` token'dakinden
 *  farklı DB rolünü taklit eder (rolü sonradan yükseltilmiş yönetici — LOW-1). */
function testDogrula(yuk: any) {
  if (yuk.amac !== undefined || yuk.aud !== undefined) throw new UnauthorizedException();
  return { id: yuk.sub, role: yuk.dbRol ?? yuk.role };
}
/** Bugünkü düzen: üretimdeki JwtStrategy'nin GERÇEK çıkarıcısı. */
@Injectable()
class TestJwtStratejisi extends PassportStrategy(Strategy) {
  constructor() {
    super({ jwtFromRequest: uretimCikaricisi(), ignoreExpiration: false, secretOrKey: GIZLI });
  }
  validate(yuk: any) { return testDogrula(yuk); }
}
/** 06.10 öncesi düzen: passport-jwt'nin hazır (karesel) çıkarıcısı — H14-FIXTURE. */
@Injectable()
class EskiTestJwtStratejisi extends PassportStrategy(Strategy) {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: GIZLI });
  }
  validate(yuk: any) { return testDogrula(yuk); }
}
class GovdeDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsArray() sheets?: unknown[];
  @IsOptional() @IsArray() items?: unknown[];
}
const cagri: string[] = [];
@Controller('quotes')
@UseGuards(JwtAuthGuard)
class KuklaTeklif {
  @Post() olustur(@Body() d: GovdeDto) { cagri.push('olustur'); return { uzunluk: js(d).length }; }
  @Put(':id') kaydet(@Param('id') _id: string, @Body() d: GovdeDto) { cagri.push('kaydet'); return { uzunluk: js(d).length }; }
}
@Controller('firma')
@UseGuards(JwtAuthGuard)
class KuklaFirma {
  @Patch() guncelle(@Body() d: GovdeDto) { cagri.push('firma'); return { uzunluk: js(d).length }; }
}
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
class KuklaYonetici {
  @Post('materials/save-bulk') topluKayit(@Body() d: GovdeDto) { cagri.push('yonetici'); return { uzunluk: js(d).length }; }
}
@Controller('olcum')
class KuklaOlcum {
  @Get('komsu') komsu() { return { ok: true }; }
}

const KOMSU_HAZIR = 'H';
/** Komşu: ısınma isteğinden sonra hazır der, `dur` gelene dek art arda GET
 *  atar; ısınma SAYILMADAN örneklerin en uzununu ve sayısını yazar. */
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
  await iste();
  process.stdout.write('${KOMSU_HAZIR}');
  const s = [];
  while (!dur) s.push(await iste());
  process.stdout.write(JSON.stringify({ en: s.length ? Math.round(Math.max(...s)) : null, n: s.length }));
  process.stdin.destroy();
})();`;

/** Büyük gövdeyi AYRI SÜREÇTEN gönderen istemci: aynı süreçteki istemcinin
 *  20 MB'ı yazması sunucuyla tek döngüyü paylaşır ve komşu ölçümüne karışırdı
 *  (ilk sürümde 303 ms — sunucu gövdeyi okumadığı hâlde). Gövde çocukta kurulur:
 *  ~`boyut` bayt, çok anahtarlı (saldırının biçimi). KEEP-ALIVE (inceleme
 *  LOW-4): `Connection: close`la sunucu gövdeyi okumadan yanıtlayıp soketi
 *  kapatınca istemci yanıtı okumadan sıfırlanabilirdi (sıraya bağlı); açık
 *  bağlantıda Node sunucusu kalan gövdeyi boşaltır, yanıt her zaman okunur. */
const GONDERICI_BETIGI = `
const http = require('http');
const [port, yontem, yol, boyut, yetki] = process.argv.slice(1);
const parca = ['{"title":"T"'];
let boy = 12;
for (let i = 0; boy < Number(boyut); i++) { const p = ',"k' + i + '":1'; parca.push(p); boy += p.length; }
parca.push('}');
const govde = Buffer.from(parca.join(''));
const ajan = new http.Agent({ keepAlive: true });
let bitti = false;
const yaz = (x) => { if (!bitti) { bitti = true; process.stdout.write(JSON.stringify(x)); ajan.destroy(); } };
const r = http.request({ host: '127.0.0.1', port: Number(port), path: '/api' + yol, method: yontem, agent: ajan,
  headers: Object.assign({ 'content-type': 'application/json', 'content-length': govde.length }, yetki ? { authorization: yetki } : {}) },
  (res) => { let m = ''; res.on('data', (b) => { m += b; }); res.on('end', () => yaz({ durum: res.statusCode, metin: m, bayt: govde.length })); });
r.on('error', (e) => setTimeout(() => yaz({ durum: -1, hata: e.code, bayt: govde.length }), 200));
r.end(govde);`;

type Gonderim = { durum: number; metin: string; bayt: number; hata?: string };
/** `yeni`: main.ts'in bugünkü sırası. `eski`: 06.10 öncesi (global 50 MB, gzip açılır,
 *  büyük gövde kuralı ve yetki başlığı tavanı yok, passport'un hazır çıkarıcısı). */
async function uygulamaKur(duzen: 'yeni' | 'eski') {
  @Module({
    imports: [PassportModule],
    controllers: [KuklaTeklif, KuklaFirma, KuklaYonetici, KuklaOlcum],
    providers: [duzen === 'yeni' ? TestJwtStratejisi : EskiTestJwtStratejisi],
  })
  class KuklaModulu {}
  const app = await NestFactory.create<NestExpressApplication>(KuklaModulu, { logger: yakalayici });
  if (duzen === 'yeni') yetkiBasligiTavaniniKur(app);
  govdeSinirlariniKur(app);
  if (duzen === 'yeni') {
    buyukGovdeUclariniKur(app);
    app.use(json({ limit: '1mb', inflate: false }));
    app.use(urlencoded({ extended: true, limit: '1mb', inflate: false }));
  } else {
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));
  }
  govdeHatalariniKur(app);
  app.useGlobalPipes(new GuvenliValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const iste = async (yontem: string, yol: string, govde: string | Buffer, yetki?: string, tur = 'application/json', ek: Record<string, string> = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${yol}`, {
      method: yontem,
      headers: { 'content-type': tur, ...ek, ...(yetki ? { authorization: yetki } : {}) },
      body: typeof govde === 'string' ? govde : new Uint8Array(govde),
      signal: AbortSignal.timeout(120_000),
    });
    return { durum: r.status, metin: await r.text() };
  };
  /** Ayrı süreçten büyük (çok anahtarlı) gövde gönderir; yanıtı döndürür. */
  const disaridanGonder = (yontem: string, yol: string, boyut: number, yetki?: string) =>
    new Promise<Gonderim>((c) => {
      const g = spawn(process.execPath, ['-e', GONDERICI_BETIGI, String(port), yontem, yol, String(boyut), yetki ?? ''],
        { stdio: ['ignore', 'pipe', 'inherit'] });
      let cikti = '';
      g.stdout.on('data', (b) => { cikti += String(b); });
      g.on('close', () => c(JSON.parse(cikti || '{"durum":-2,"metin":"","bayt":0}'))); // 'exit' değil: stdout kapanmadan da gelir
    });
  /** `adet` büyük istek (eşzamanlı) SÜRERKEN komşunun EN UZUN beklemesi (ms);
   *  komşu da gönderici de AYRI süreçte. `yontem` boşsa büyük istek yok: 1 sn
   *  TABAN ölçülür. Komşunun çıktısı okunamazsa `NaN` — iki yönlü eşik de düşer. */
  const komsuyla = async (yontem: string, yol: string, boyut: number, yetki?: string, adet = 1) => {
    const cocuk = spawn(process.execPath, ['-e', KOMSU_BETIGI, String(port)], { stdio: ['pipe', 'pipe', 'inherit'] });
    let cikti = '';
    const bitti = new Promise((c) => cocuk.on('close', c));
    const hazir = await new Promise<boolean>((c) => {
      const sure = setTimeout(() => c(false), 30_000);
      cocuk.stdout.on('data', (b) => {
        cikti += String(b);
        if (cikti.startsWith(KOMSU_HAZIR)) { clearTimeout(sure); c(true); }
      });
    });
    await new Promise((c) => setTimeout(c, 100));
    const buyukler = yontem
      ? await Promise.all(Array.from({ length: adet }, () => disaridanGonder(yontem, yol, boyut, yetki)))
      : await new Promise<Gonderim[]>((c) => setTimeout(() => c([]), 1_000));
    cocuk.stdin.on('error', () => undefined);
    if (cocuk.exitCode === null) cocuk.stdin.write('dur\n');
    await bitti;
    const o = JSON.parse(cikti.slice(KOMSU_HAZIR.length) || '{"en":null,"n":0}');
    return { buyuk: buyukler[0], buyukler, komsuMs: (o.en ?? Number.NaN) as number, komsuSayisi: o.n as number, komsuHazir: hazir };
  };
  // Eşik bu süreçte BÜYÜK İSTEK OLMADAN ölçülen tabana bağlı: max(300, 3 × taban)
  // — yavaş koşucuda tek gürültü tepesi kapıyı kırmızıya çevirmesin (inceleme MEDIUM-1).
  const t = await komsuyla('', '', 0);
  const esik = Math.max(300, 3 * t.komsuMs);
  console.log(`     (ölçüm) ${duzen.toUpperCase()} düzen taban: komşu ${t.komsuSayisi} istek, en uzun ${t.komsuMs} ms → eşik ${esik} ms`);
  return { app, iste, komsuyla, esik, tabanGecerli: t.komsuHazir && t.komsuSayisi >= 5 && Number.isFinite(t.komsuMs) };
}
type Uygulama = Awaited<ReturnType<typeof uygulamaKur>>;
type Olcum = Awaited<ReturnType<Uygulama['komsuyla']>>;
/** Ölçüm geçerli mi: komşu hazırdı, büyük istek sürerken en az 5 örnek aldı, sayı okundu. */
const gecerli = (o: Olcum) => o.komsuHazir && o.komsuSayisi >= 5 && Number.isFinite(o.komsuMs);

/** `n` baytlık geçerli JSON gövdesi, AZ anahtarlı (sheets içinde düz metin
 *  satırları) — geçerli token'lı isteklerde doğrulama borusu ucuz kalsın. */
const govdeYap = (n: number) => {
  const satir = 'x'.repeat(1_000);
  const adet = Math.ceil(n / (satir.length + 3));
  return js({ title: 'T', sheets: Array.from({ length: adet }, () => satir) });
};
// Kimliksiz büyük gövde: ~20 MB ÇOK ANAHTARLI (saldırının biçimi — JSON.parse
// maliyeti anahtar başınadır; uzun dizgeler ucuz kopyalanır).
const GENIS = 20 * MB;
const IKI = govdeYap(2 * MB);
// Güvenlik incelemesi HIGH-1: boşluksuz uzun başlık, Node'un 16 KiB başlık tavanının altında.
const UZUN_BASLIK = `Bearer${'A'.repeat(15_800)}`;
/** Güvenlik incelemesi (06.10): ~1 KB gzip, açılınca ~900 KB boş nesne dizisi. */
const SIKISTIRILMIS = zlib.gzipSync(`{"x":[${Array.from({ length: 300_000 }, () => '{}').join(',')}]}`);
const GZIP = { 'content-encoding': 'gzip' };

/** FIXTURE'lar: ESKİ düzende aynı istekler kapıdan ÖNCE ayrıştırılır ve komşuyu bekletir. */
async function hEskiDuzen(): Promise<void> {
  const eski = await uygulamaKur('eski');
  try {
    check('H-FIXTURE eski düzen taban ölçümü geçerli', eski.tabanGecerli);
    const e = await eski.komsuyla('POST', '/quotes', GENIS);
    console.log(`     (ölçüm) ESKİ düzen: kimliksiz ${Math.round(e.buyuk.bayt / MB)} MB → ${e.buyuk.durum}; komşu ${e.komsuSayisi} istek, en uzun ${e.komsuMs} ms`);
    check('H0-FIXTURE eski düzende (global 50 MB) kimliksiz 20 MB çok anahtarlı gövde AYRIŞTIRILIR: 401 ama komşu eşiği aşar',
      gecerli(e) && e.buyuk.durum === 401 && e.komsuMs >= eski.esik, js({ d: e.buyuk.durum, ms: e.komsuMs, n: e.komsuSayisi, esik: eski.esik }));
    // 4 eşzamanlı uzun başlık: tek istek ~0,7 sn — FIXTURE payı geniş kalsın (MEDIUM-1).
    const eb = await eski.komsuyla('POST', '/quotes', 0, UZUN_BASLIK, 4);
    console.log(`     (ölçüm) ESKİ düzen: 4 × ${UZUN_BASLIK.length} karakterlik boşluksuz Authorization → ${eb.buyuk.durum}; komşu en uzun ${eb.komsuMs} ms`);
    check('H14-FIXTURE eski düzende 4 eşzamanlı 15,8 KB boşluksuz Authorization passport ifadesiyle döngüyü kilitler (komşu eşiği aşar)',
      gecerli(eb) && eb.buyukler.every((b) => b.durum === 401) && eb.komsuMs >= eski.esik, js({ ms: eb.komsuMs, n: eb.komsuSayisi, esik: eski.esik }));
    const gz = await eski.iste('POST', '/yok-boyle-bir-uc', SIKISTIRILMIS, undefined, 'application/json', GZIP);
    check(`H17-FIXTURE eski düzende ${SIKISTIRILMIS.length} baytlık gzip gövde AÇILIP ayrıştırılır (404'e varır)`, gz.durum === 404, js(gz));
  } finally {
    await eski.app.close();
  }
}

async function hKimliksiz(d: Uygulama): Promise<void> {
  check('H-FIXTURE yeni düzen taban ölçümü geçerli', d.tabanGecerli);
  cagri.length = 0;
  gunluk.length = 0;
  const k = await d.komsuyla('POST', '/quotes', GENIS);
  console.log(`     (ölçüm) YENİ düzen: kimliksiz ${Math.round(k.buyuk.bayt / MB)} MB → ${k.buyuk.durum}; komşu ${k.komsuSayisi} istek, en uzun ${k.komsuMs} ms (eşik ${d.esik})`);
  check('H1-FIXTURE komşu büyük istekten ÖNCE koşuyordu ve ölçüm boyunca sürdü (≥ 5 istek, sayı okundu)', gecerli(k),
    js({ h: k.komsuHazir, n: k.komsuSayisi, ms: k.komsuMs }));
  check('H1 ⭐ kimliksiz 20 MB çok anahtarlı gövde toplu uca: gövde OKUNMAZ — kapı 401, denetleyiciye ulaşılmaz, komşu eşiğin altında',
    k.buyuk.durum === 401 && cagri.length === 0 && k.komsuMs < d.esik, js({ d: k.buyuk.durum, c: cagri, ms: k.komsuMs }));
  const kucukKimliksiz = await d.iste('POST', '/quotes', js({ title: 'T' }));
  check('H2 kimliksiz büyük gövdenin 401 yanıtı küçük gövdeli kimliksiz isteğin yanıtıyla BAYT BAYT aynı (kapının kendi 401\'i)',
    kucukKimliksiz.durum === 401 && k.buyuk.metin === kucukKimliksiz.metin, js({ b: k.buyuk.metin, k: kucukKimliksiz.metin }));
  const sureli = await d.iste('POST', '/quotes', IKI, `Bearer ${token({ sub: 'u1', role: 'user' }, { expiresIn: -10 })}`);
  check('H3 süresi dolmuş token + 2 MB: okunmaz, kapı 401 (ön yüzün oturum düşmesi davranışı aynı)',
    sureli.durum === 401 && cagri.length === 0 && sureli.metin === kucukKimliksiz.metin, js(sureli));

  const yok = await d.komsuyla('POST', '/yok-boyle-bir-uc', GENIS);
  console.log(`     (ölçüm) YENİ düzen: kimliksiz ${Math.round(yok.buyuk.bayt / MB)} MB 404 yoluna → ${yok.buyuk.durum}; komşu ${yok.komsuSayisi} istek, en uzun ${yok.komsuMs} ms`);
  check('H4 ⭐ kimliksiz 20 MB tavan DIŞI yola (404): global 1 MB → 413, komşu eşiğin altında (ölçüm geçerli)',
    gecerli(yok) && yok.buyuk.durum === 413 && yok.komsuMs < d.esik, js({ d: yok.buyuk.durum, ms: yok.komsuMs, n: yok.komsuSayisi }));

  cagri.length = 0;
  const ub = await d.komsuyla('POST', '/quotes', 0, UZUN_BASLIK, 4);
  console.log(`     (ölçüm) YENİ düzen: 4 × ${UZUN_BASLIK.length} karakterlik boşluksuz Authorization → ${ub.buyuk.durum}; komşu en uzun ${ub.komsuMs} ms`);
  check(`H14 ⭐ ${AZAMI_YETKI_BASLIGI} karakteri aşan Authorization başlığı düşer: 401, komşu eşiğin altında (4 eşzamanlı, ölçüm geçerli)`,
    gecerli(ub) && ub.buyukler.every((b) => b.durum === 401) && cagri.length === 0 && ub.komsuMs < d.esik, js({ ms: ub.komsuMs, n: ub.komsuSayisi }));
  const copluToken = await d.iste('POST', '/quotes', IKI, `Bearer ${KULLANICI} ${'x'.repeat(AZAMI_YETKI_BASLIGI)}`);
  check('H15 geçerli token + tavanı aşan çöp: başlık İKİ karar için de düşer — gövde okunmaz, kapı 401, işleyiciye boş gövde gitmez',
    copluToken.durum === 401 && cagri.length === 0, js({ d: copluToken.durum, c: cagri }));
  const sinirda = await d.iste('POST', '/quotes', js({ title: 'T' }), `Bearer ${KULLANICI} ${'x'.repeat(AZAMI_YETKI_BASLIGI - KULLANICI.length - 8)}`);
  check('H15b tavanın ALTINDAKİ (ek parçalı) başlık düşmez: passport ilk iki parçayı okur, istek geçer',
    sinirda.durum === 201 && cagri.includes('olustur'), js({ d: sinirda.durum }));
  const gz = await d.iste('POST', '/yok-boyle-bir-uc', SIKISTIRILMIS, undefined, 'application/json', GZIP);
  check('H17 ⭐ sıkıştırılmış gövde AÇILMAZ: kimliksiz gzip → 415 (global ayrıştırıcı; ~1000× kaldıraç kapalı)', gz.durum === 415, js(gz));
}

async function hGecerliToken(d: Uygulama): Promise<void> {
  cagri.length = 0;
  const olustur = await d.iste('POST', '/quotes', IKI, `Bearer ${KULLANICI}`);
  check('H5 ⭐ BAĞLANTI: geçerli token + 2 MB → teklif oluştur geçer, gövde denetleyiciye TAM ulaşır',
    olustur.durum === 201 && cagri.includes('olustur') && JSON.parse(olustur.metin).uzunluk === IKI.length,
    js({ d: olustur.durum, c: cagri, m: olustur.metin.slice(0, 80) }));
  const kaydet = await d.iste('PUT', '/quotes/a1b2', IKI, `Bearer ${KULLANICI}`);
  check('H6 geçerli token + 2 MB → teklif kaydet (PUT /:id) geçer', kaydet.durum === 200 && cagri.includes('kaydet'), js({ d: kaydet.durum }));
  const baslik = 'u'.repeat(2 * MB);
  const urlKayit = await d.iste('POST', '/quotes', `title=${baslik}`, `Bearer ${KULLANICI}`, 'application/x-www-form-urlencoded');
  check('H7 geçerli token + 2 MB urlencoded → yol başı urlencoded ayrıştırıcısı da geniş, gövde işleyiciye TAM ulaşır',
    urlKayit.durum === 201 && JSON.parse(urlKayit.metin).uzunluk === js({ title: baslik }).length, js({ d: urlKayit.durum }));
  const gz = await d.iste('POST', '/quotes', SIKISTIRILMIS, `Bearer ${KULLANICI}`, 'application/json', GZIP);
  check('H17b geçerli token + sıkıştırılmış gövde toplu uca → 415 (kural ayrıştırıcısı da açmaz)', gz.durum === 415, js(gz));
  const gzUrl = await d.iste('POST', '/quotes', zlib.gzipSync(`title=${baslik}`), `Bearer ${KULLANICI}`,
    'application/x-www-form-urlencoded', GZIP);
  check('H17c geçerli token + sıkıştırılmış URLENCODED gövde toplu uca → 415 (kuralın urlencoded ayrıştırıcısı da açmaz)',
    gzUrl.durum === 415, js(gzUrl));

  cagri.length = 0;
  gunluk.length = 0;
  const firma = await d.iste('PATCH', '/firma', IKI, `Bearer ${KULLANICI}`);
  check('H8 ⭐ geçerli token + 2 MB tavansız DTO ucuna (PATCH /firma) → 413, denetleyiciye ulaşılmaz (MEDIUM-B)',
    firma.durum === 413 && !cagri.includes('firma'), js({ d: firma.durum, c: cagri }));
  check('H8b 413 tek WARN satırıyla (ERROR yok)', gunluk.filter((g) => g.startsWith('WARN')).length === 1 && !gunluk.some((g) => g.startsWith('ERROR')),
    js(gunluk));
  const firmaKucuk = await d.iste('PATCH', '/firma', js({ title: 'Firma' }), `Bearer ${KULLANICI}`);
  check('H9 tavansız uçta olağan küçük gövde geçer', firmaKucuk.durum === 200 && cagri.includes('firma'), js({ d: firmaKucuk.durum }));
  const tavanUstu = await d.iste('POST', '/quotes', govdeYap(26 * MB), `Bearer ${KULLANICI}`);
  check('H12 geçerli token + 26 MB teklif ucuna (tavan 25 MB) → 413', tavanUstu.durum === 413, js({ d: tavanUstu.durum }));
  // Kural YÖNTEMLE eşlenir: `PUT /quotes/:id`in yolu PATCH ile geniş tavan almaz.
  const baskaYontem = await d.iste('PATCH', '/quotes/a1b2', IKI, `Bearer ${KULLANICI}`);
  check('H13 aynı yol BAŞKA yöntemle (PATCH /quotes/:id, kural PUT) geniş tavan almaz → 413', baskaYontem.durum === 413,
    js({ d: baskaYontem.durum }));
}

async function hYonetici(d: Uygulama): Promise<void> {
  cagri.length = 0;
  const yetkisiz = await d.iste('POST', '/admin/materials/save-bulk', IKI, `Bearer ${KULLANICI}`);
  check("H10 yönetici ucuna rolü 'admin' olmayan token + 2 MB: geniş tavan YOK (global 1 MB → 413), denetleyiciye ulaşılmaz",
    yetkisiz.durum === 413 && cagri.length === 0, js({ d: yetkisiz.durum, c: cagri }));
  const kucukYetkisiz = await d.iste('POST', '/admin/materials/save-bulk', js({ title: 'x' }), `Bearer ${KULLANICI}`);
  check("H10a rolü 'admin' olmayan token + küçük gövde: RolesGuard 403 (karar DB rolüyle kapıda)",
    kucukYetkisiz.durum === 403 && cagri.length === 0, js({ d: kucukYetkisiz.durum }));
  // Token'da rol 'user', DB'de 'admin' (sonradan yükseltilmiş): gövde ATLANMAZ —
  // işleyici boş `{}` değil gerçek gövdeyi görür (06.10 inceleme LOW-1).
  const terfi = token({ sub: 't1', email: 't@b.test', role: 'user', dbRol: 'admin' });
  const ellikb = govdeYap(50 * 1024);
  const terfiYanit = await d.iste('POST', '/admin/materials/save-bulk', ellikb, `Bearer ${terfi}`);
  check('H10b rolü sonradan yükseltilmiş yönetici (eski token) küçük gövdede GERÇEK gövdeyi görür (boş {} değil)',
    terfiYanit.durum === 201 && JSON.parse(terfiYanit.metin).uzunluk === ellikb.length, js({ d: terfiYanit.durum, m: terfiYanit.metin.slice(0, 80) }));
  cagri.length = 0;
  const yonetici = await d.iste('POST', '/admin/materials/save-bulk', IKI, `Bearer ${YONETICI}`);
  check('H11 yönetici token + 2 MB → geçer, gövde işleyiciye TAM ulaşır',
    yonetici.durum === 201 && cagri.includes('yonetici') && JSON.parse(yonetici.metin).uzunluk === IKI.length, js({ d: yonetici.durum }));
}

/** KALAN RİSK (inceleme MEDIUM-1, ayrı iş): imzası geçerli HER token — kayıt
 *  herkese açık — kapılardan ÖNCE uç tavanına kadar ayrıştırtır. Sayı
 *  `buyuk-govde.ts` notuna yazılır; eşik YOK (ölçüm), yalnız ölçüm geçerli mi. */
async function hKalanRisk(d: Uygulama): Promise<void> {
  cagri.length = 0;
  const kalan = await d.komsuyla('POST', '/quotes', 24 * MB, `Bearer ${KULLANICI}`);
  console.log(`     (ölçüm) KALAN RİSK: geçerli token + ${Math.round(kalan.buyuk.bayt / MB)} MB çok anahtarlı gövde → ${kalan.buyuk.durum}; komşu ${kalan.komsuSayisi} istek, en uzun ${kalan.komsuMs} ms`);
  check('H16-ÖLÇÜM kalan risk ölçüldü: geçerli token + 24 MB çok anahtarlı gövde teklif ucunda ayrıştırılır, denetleyiciye ulaşır',
    kalan.komsuHazir && kalan.komsuSayisi >= 1 && kalan.buyuk.durum === 201 && cagri.includes('olustur'),
    js({ d: kalan.buyuk.durum, ms: kalan.komsuMs, h: kalan.komsuHazir }));
}

async function hBlogu(): Promise<void> {
  console.log('\n── H · HTTP: main.ts sırası, gerçek JwtAuthGuard + RolesGuard ──');
  // main.ts gibi: geniş gövdeli doğrulama class-transformer yamasıyla (HIGH-3).
  check('H-FIXTURE class-transformer yaması kuruldu (main.ts sırası)', sinifDonusturucuYamasiniKur());
  await hEskiDuzen();
  const d = await uygulamaKur('yeni');
  try {
    await hKimliksiz(d);
    await hGecerliToken(d);
    await hYonetici(d);
    await hKalanRisk(d);
  } finally {
    await d.app.close();
  }
}

bitmezseKirmizi((async () => {
  bBlogu(); // gerçek denetleyiciler sunucu AÇILMADAN yüklenir (keep-alive yarışı)
  await tBlogu();
  kBlogu();
  await hBlogu();
  console.log(`\n${'='.repeat(64)}\nBUYUK GOVDE: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(64)}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
