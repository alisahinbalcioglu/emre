/**
 * AI ANALİZ UCU KAPALI — 06.10.2026.
 *   `npm run test:ai-analiz-kapali` · DB/AĞ GEREKTIRMEZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *   `POST /ai/analyze` (PDF analizi) ön yüzden 27.08'de (K6) kaldırılmıştı;
 *   uç ölü kaldı. Ölçüldü: çağıranı yok, AiUsageLog'a hiç yazmıyordu (ücretli
 *   AI çağrısının maliyeti kayda geçmiyordu), fiyatı para birimsiz okuyordu.
 *   KARAR (koordinatör, Emre'nin ön onayıyla; Emre dönünce bilgilendirilecek
 *   ürün kararı): uç 410, servis kodu silindi, çağrı kimliksiz WARN bırakır.
 *
 * ── NASIL ÖLÇÜLÜR ───────────────────────────────────────────────────────
 *   H  GERÇEK denetleyici HTTP üzerinden (Nest + fetch, sınıf düzeyi kapılar
 *      gölgelenir): çok parçalı PDF gövdesiyle 410 + Türkçe mesaj, servis yok,
 *      tek kimliksiz WARN; kimliksiz istek kapıda kalır.
 *   Y  yetki meta verisi KORUNDU (yetkisiz çağıran ucun varlığını öğrenmez),
 *      dosya ayrıştırıcısı (FileInterceptor) YOK.
 *   S  silinen servis kodu geri gelmedi (yorumsuz kaynak) · ön yüzde çağıran yok.
 *
 * Çıkış kodu: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { Logger, Module, UnauthorizedException, type ExecutionContext, type LoggerService } from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerModule } from '@nestjs/throttler';

import { AI_ANALIZ_KAPALI_MESAJI, AiController } from '../src/ozellik/giris/ai/ai.controller';
import { AiService } from '../src/ozellik/giris/ai/ai.service';
import { CeviriService } from '../src/ozellik/giris/ai/ceviri.service';
import { CeviriKotaServisi } from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { ErisimServisi, Yetenek } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { UYE_IZNI_KEY } from '../src/altyapi/auth/decorators/uye-izni.decorator';
import { TIER_KEY } from '../src/altyapi/auth/guards/tier.guard';
import { YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
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
const oku = (goreli: string) => fs.readFileSync(path.join(KOK, goreli), 'utf8');
/** Yorumlar atılır: kaynak kapısı yorumda geçen adı "kod" saymasın. */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ═══ H — gerçek denetleyici HTTP üzerinden ═════════════════════════════════
const KISI = { id: 'kisi-gizli-1', email: 'gizli@ornek.test', firmaId: 'firma-a', role: 'user' };
/** Gerçek zincirin İLK halkası gibi davranır: kimliksiz istek 401
 *  (JwtAuthGuard). Paket/erişim/üye izni kapılarının kendi davranışı başka
 *  paketlerde ölçülür (faz7-yetki Y1-Y5, guvenlik O2-O4, erisim W1, ekip-izinleri
 *  K3); burada SIRALARI (Y5) ve meta verileri (Y1-Y3) denetlenir. */
const testKapisi = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['x-test-kim'] !== 'a1') throw new UnauthorizedException();
    req.user = { ...KISI };
    return true;
  },
};
class OlcumAi extends AiController {}
Reflect.defineMetadata(GUARDS_METADATA, [testKapisi], OlcumAi);

/** Servis taklitleri: kapalı uç HİÇBİRİNE dokunmamalı. Nest'in yaşam döngüsü
 *  kancaları (`onModuleInit` …) ve söz denetimi (`then`) taklitte YOK — yoksa
 *  Nest onları "uygulanmış" sanıp çağırır, sayaç uygulama açılışını sayardı. */
const dokunulan: string[] = [];
const YASAM_DONGUSU = /^(on[A-Z]|before[A-Z]|then$)/;
const taklit = (ad: string) =>
  new Proxy({}, {
    get: (_t, anahtar) => (typeof anahtar !== 'string' || YASAM_DONGUSU.test(anahtar)
      ? undefined
      : (...a: unknown[]) => { dokunulan.push(`${ad}.${anahtar}`); return a; }),
  });

async function hBlogu(): Promise<void> {
  console.log('\n── H · POST /ai/analyze → 410, servis yok, kimliksiz WARN ──');
  @Module({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
    controllers: [OlcumAi],
    providers: [
      // Eski yapıcı AI servisini isterdi; taklit verilir ki eski koda karşı da
      // koşulabilsin (kırmızı önce) — yeni denetleyici onu hiç almaz (S3).
      { provide: AiService, useValue: taklit('ai') },
      { provide: CeviriService, useValue: taklit('ceviri') },
      { provide: CeviriKotaServisi, useValue: taklit('kota') },
      { provide: ErisimServisi, useValue: taklit('erisim') },
    ],
  })
  class DunyaModulu {}
  const app = await NestFactory.create<NestExpressApplication>(DunyaModulu, { logger: yakalayici });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  try {
    const pdfGonder = async (kim?: string) => {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from('%PDF-1.4 sahte icerik\n%%EOF')], { type: 'application/pdf' }), 'liste.pdf');
      const r = await fetch(`http://127.0.0.1:${port}/api/ai/analyze`, {
        method: 'POST',
        headers: kim ? { 'x-test-kim': kim } : {},
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
      const metin = await r.text();
      let veri: any = null;
      try { veri = JSON.parse(metin); } catch { veri = metin; }
      return { durum: r.status, veri };
    };

    (taklit('olcut') as any).dene();
    check('H3-FIXTURE kaydedici çalışır: taklide dokunuş kaydedilir (H3 boşuna yeşil kalmasın)',
      dokunulan.length === 1 && dokunulan[0] === 'olcut.dene', js(dokunulan));
    dokunulan.length = 0;
    gunluk.length = 0;
    const y = await pdfGonder('a1');
    check('H1 ⭐ PDF yüklemesi 410 alır', y.durum === 410, js(y));
    check('H2 mesaj Türkçe ve alternatifi söyler', y.veri?.message === AI_ANALIZ_KAPALI_MESAJI
      && /kaldırıldı/.test(AI_ANALIZ_KAPALI_MESAJI) && /Excel/.test(AI_ANALIZ_KAPALI_MESAJI), js(y.veri));
    check('H3 hiçbir servise dokunulmadı (AI / kota / erişim)', dokunulan.length === 0, js(dokunulan));
    const uyari = gunluk.filter((g) => g.startsWith('WARN Kapali uc cagrildi'));
    check('H4 TEK uyarı: kapalı uç çağrıldı (günlükte başka satır, ERROR yok)',
      uyari.length === 1 && uyari[0].includes('POST /ai/analyze (410)') && gunluk.length === 1, js(gunluk));
    check('H5 uyarı KİMLİK taşımaz', uyari.length === 1 && !uyari[0].includes(KISI.id) && !uyari[0].includes(KISI.email)
      && !uyari[0].includes(KISI.firmaId), js(uyari));
    const bozuk = await fetch(`http://127.0.0.1:${port}/api/ai/analyze`, {
      method: 'POST', headers: { 'x-test-kim': 'a1', 'content-type': 'multipart/form-data; boundary=YOK' },
      body: 'sinirsiz bozuk govde', signal: AbortSignal.timeout(15_000),
    });
    check('H7 bozuk çok parçalı gövde de 410 alır — gövde ayrıştırılmaz (ayrıştırıcı olsa 400 dönerdi)', bozuk.status === 410,
      String(bozuk.status));
    gunluk.length = 0;
    const kimliksiz = await pdfGonder();
    check('H6 kimliksiz istek kapıda kalır: 401, işleyiciye ulaşılmaz (uyarı yok) — gerçek kapı SIRASI: Y5',
      kimliksiz.durum === 401 && gunluk.filter((g) => g.includes('Kapali uc')).length === 0, js({ d: kimliksiz.durum, g: gunluk }));
  } finally {
    await app.close();
  }
}

// ═══ Y — yetki meta verisi korundu, dosya ayrıştırıcısı yok ═════════════════
function yBlogu(): void {
  console.log('\n── Y · yetki meta verisi korundu, FileInterceptor yok ──');
  const uc = AiController.prototype.analyze;
  check('Y1 Pro paketi kapısı korundu (yetkisiz çağıran eskisi gibi reddedilir)',
    js(Reflect.getMetadata(TIER_KEY, uc)) === js(['pro']), js(Reflect.getMetadata(TIER_KEY, uc)));
  check('Y2 yetenek kapısı (AI_ANALIZ) korundu',
    js(Reflect.getMetadata(YETENEK_KEY, uc)) === js([Yetenek.AI_ANALIZ]), js(Reflect.getMetadata(YETENEK_KEY, uc)));
  check("Y3 üye izni 'kutuphane' korundu", Reflect.getMetadata(UYE_IZNI_KEY, uc) === 'kutuphane');
  check('Y4 dosya ayrıştırıcısı (interceptor) YOK — gövde okunmaz (metot VE sınıf düzeyi)',
    (Reflect.getMetadata(INTERCEPTORS_METADATA, uc) ?? []).length === 0
      && (Reflect.getMetadata(INTERCEPTORS_METADATA, AiController) ?? []).length === 0,
    js([Reflect.getMetadata(INTERCEPTORS_METADATA, uc), Reflect.getMetadata(INTERCEPTORS_METADATA, AiController)]));
  // SIRA şart: JWT önce (kimliksiz 401), sonra paket, sonra erişim — sayı yetmez.
  const kapilar = ((Reflect.getMetadata(GUARDS_METADATA, AiController) ?? []) as Array<{ name?: string }>).map((g) => g?.name);
  check('Y5 sınıf düzeyi kapılar SIRAYLA yerinde (JWT → paket → erişim)',
    js(kapilar) === js(['JwtAuthGuard', 'TierGuard', 'ErisimGuard']), js(kapilar));
}

// ═══ S — silinen servis kodu geri gelmedi · ön yüzde çağıran yok ════════════
function sBlogu(): void {
  console.log('\n── S · silinen kod geri gelmedi, ön yüzde çağıran yok ──');
  const servis = yorumsuz(oku('backend/src/ozellik/giris/ai/ai.service.ts'));
  const geriGelen = ['matchWithDatabase', 'analyzeWithFailover', 'analyzeWithClaude', 'analyzeWithGemini',
    'analyzeWithOpenRouter', 'extractText(', 'callOpenRouter', 'async analyze(', 'interface ParsedMaterial']
    .filter((ad) => servis.includes(ad));
  check('S1 analiz yolunun servis kodu SİLİNDİ (geri gelmedi)', geriGelen.length === 0, geriGelen.join(', '));
  check('S2 FIXTURE: korunan yönetici havuz ayıklaması duruyor (ölçüt boş dosyada geçmesin)',
    /async extractGlobalMaterials\(/.test(servis) && /private async callClaude</.test(servis));
  const denetleyici = yorumsuz(oku('backend/src/ozellik/giris/ai/ai.controller.ts'));
  check('S3 denetleyici AI servisini çağırmaz / enjekte etmez', !/aiService/.test(denetleyici) && !/\bAiService\b/.test(denetleyici));
  // Ön yüzün TAMAMI (ortak/ dahil; yalnız bağımlılık, derleme ve test dizinleri
  // dışarıda). Desen tırnaksız da yakalar: `${API}/ai/analyze` gibi yazımlar.
  // Satır bazlı yorum ayıklama: blok ayıklayıcı dizgedeki `/*`ı (ör. `image/*`)
  // yorum sanıp gerçek kodu yutabiliyordu (inceleme L2). Eğik çizgisiz yol da yakalanır.
  const SATIR_SONU = String.fromCharCode(10);
  const satirYorumsuz = (m: string) => m.split(SATIR_SONU).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join(SATIR_SONU);
  const algila = (m: string) => /(?<![\w-])ai\/analyze(?![\w-])/.test(satirYorumsuz(m));
  const onYuz: string[] = [];
  const taranan = new Set<string>();
  const tara = (dizin: string) => {
    for (const ad of fs.readdirSync(path.join(KOK, dizin), { withFileTypes: true })) {
      const goreli = `${dizin}/${ad.name}`;
      if (ad.isDirectory()) { if (!['node_modules', '.next', 'test', 'out'].includes(ad.name)) tara(goreli); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(ad.name) || /\.(test|spec)\.[jt]sx?$/.test(ad.name)) continue;
      taranan.add(goreli);
      if (algila(fs.readFileSync(path.join(KOK, goreli), 'utf8'))) onYuz.push(goreli);
    }
  };
  tara('frontend');
  check('S4-FIXTURE ön yüz taraması gerçekten koştu (≥ 200 dosya) ve ortak/lib/api.ts TARANAN kümede',
    taranan.size >= 200 && taranan.has('frontend/ortak/lib/api.ts'), String(taranan.size));
  check('S4-FIXTURE2 algılayıcı: çağrı yakalanır (eğik çizgili, çizgisiz, `image/*` sonrası), yorum satırı yakalanmaz',
    algila("api.post('/ai/analyze')") && algila("api.post('ai/analyze')")
      && algila(["const a = 'image/*';", "api.post('/ai/analyze');", '// */'].join(SATIR_SONU))
      && !algila('// /ai/analyze eski yol') && !algila('   * /ai/analyze kapandı'));
  check('S4 ön yüzde /ai/analyze çağıran YOK (eklenirse 410 alırdı)', onYuz.length === 0, onYuz.join(', '));
}

bitmezseKirmizi((async () => {
  await hBlogu();
  yBlogu();
  sBlogu();
  console.log(`\n${'='.repeat(64)}\nAI ANALIZ KAPALI: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(64)}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
