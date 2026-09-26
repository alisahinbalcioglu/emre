/**
 * KART GÜNCELLEME SAYFASI + UYGULAMA BAĞLANTILARI  (`npm run test:kart-guncelleme`) · 25.09.2026
 *
 * AĞ/DB GEREKTİRMEZ. Gerçek `ErisimServisi`, `DunningServisi`, `SatinAlmaServisi`,
 * `AbonelikController` ve `IyzicoDonusController` küçük bir bellek-Prisma ve
 * sahte iyzico/posta ile koşar; ön yüz rotaları `frontend/app` dizininden
 * çözülür (rota grupları `(x)` şeffaf, `[x]` her parçaya uyar).
 *
 * ── ÖLÇÜLEN KUSUR (25.09, canlı) ──────────────────────────────────────────
 * https://metapricex.com/abonelik/kart → HTTP 404. Beş çağıran: dunning
 * e-postalarının "Kartımı güncelle"si (`?a=<abonelik id>`), "ödemeniz alındı"nın
 * "Uygulamaya dön"ü, uygulama içi şeridin "Kartı güncelle"si ve iki "Ödemeyi
 * tamamla"sı. Sunucudaki kart formu vardı (`kartGuncellemeFormu`) ama dönüş
 * adresi de ön yüzde olmayan `/abonelik/kart-donus`tu — olsaydı bile iyzico
 * token'ı POST gövdesinde yollar, bir Next.js sayfası onu okuyamaz (06.09
 * satın alma dersi, `iyzico-donus.controller.ts`). Ödeme kurtarma akışı
 * canlıda baştan sona kırıktı.
 *
 * ── BLOKLAR ───────────────────────────────────────────────────────────────
 *   S  statik tarama: backend'in ürettiği HER uygulama bağlantısı (e-posta,
 *      şerit, yönlendirme; kök `uygulamaUrl` / `UYGULAMA_URL` /
 *      `uygulamaKokuCoz`) `frontend/app`te bir sayfaya; `/api/` dönüş
 *      adresleri kayıtlı bir uca çözülür. ÖLÇÜT: çözücü "yok" diyebiliyor ve
 *      tarama her kök ailesinden bilinen bağlantıyı buluyor (kör değil)
 *   R  davranış: gerçek şerit eylemi, gerçek e-posta düğmeleri, gerçek kart
 *      formunun callbackUrl'i, gerçek dönüş yönlendirmeleri → rota VAR;
 *      şeridin kart eylemi ⇔ kart formu açılıyor (TEK kural, 3 durum × 8 satır)
 *   A  `?a=` anlamı: kendi aboneliği → form; başkasınınki →
 *      ABONELIK_ESLESMIYOR (iyzico'ya HİÇ gidilmez); yok → form; kartı
 *      güncellenemeyen satır (havale, kodsuz, iptal talepli, iyzico'da
 *      kapanmış, bitmiş, satırsız) → KART_ABONELIGI_YOK; DTO doğrulaması +
 *      controller BAĞLANTISI; yalnız firma sahibi; hız sınırı
 *   D  kart dönüş ucu: token → guncellendi, yoksa hata; oturum kapısı YOK
 *      (çapraz-site POST jeton taşımaz); servis çağrısı ve yazma YOK
 *   C  CORS: iyzico'nun çapraz-site dönüş POST'u (yabancı `Origin`) GERÇEK
 *      Nest uygulamasında denetleyiciye ULAŞIR (öncesi: kapı 500 yazardı);
 *      kapı öteki yollarda sürer; main.ts BAĞLANTISI; muafiyet listesi =
 *      backend'in ürettiği POST dönüş adresleri
 *
 * Ön yüz tarafı (sayfa + saf kurallar): `frontend/ozellik/odeme/kart-guncelleme.test.ts`.
 * Çıkış kodu sözleşmesi: 0 = PASS · diğeri = FAIL (process.exitCode).
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { Controller, Logger, Module, Post, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { ErisimServisi } from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';
import { SatinAlmaServisi } from '../src/ozellik/odeme/abonelik/satinalma.servisi';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { IyzicoDonusController } from '../src/ozellik/odeme/abonelik/iyzico-donus.controller';
import { KartGuncelleDto } from '../src/ozellik/odeme/abonelik/dto/kart-guncelle.dto';
import { FIRMA_ROL_KEY } from '../src/altyapi/auth/decorators/firma-rolu.decorator';
import { KullaniciHizSiniriGuard } from '../src/altyapi/auth/guards/kullanici-hiz-siniri.guard';
import { DUNNING_METINLERI } from '../src/ozellik/odeme/dunning/dunning.metinleri';
import { CAPRAZ_SITE_DONUS_YOLLARI, corsSecenekleri } from '../src/altyapi/http/cors';
import { ucEnvanteri } from './yardimci/uc-envanteri';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

if (!process.env.KG_GUNLUK) Logger.overrideLogger(false);

const BACKEND = path.resolve(__dirname, '..');
const DEPO = path.resolve(BACKEND, '..');
const APP = path.join(DEPO, 'frontend', 'app');
const UYGULAMA = 'https://ornek.test';
const config = new ConfigService({ UYGULAMA_URL: UYGULAMA });

// ═════════════════════════════════════════════════════════════════════════
//  ÖN YÜZ ROTA ÇÖZÜCÜ — Next.js App Router dizin kuralları
// ═════════════════════════════════════════════════════════════════════════
function altDizinler(dizin: string): string[] {
  return fs.readdirSync(dizin, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
}

function dizindeAra(dizin: string, parcalar: string[]): boolean {
  const dizinler = altDizinler(dizin);
  // Rota grubu `(protected)` URL'de görünmez: aynı parçalarla içine girilir.
  const gruplar = dizinler.filter((d) => /^\(.+\)$/.test(d));
  if (parcalar.length === 0) {
    if (fs.existsSync(path.join(dizin, 'page.tsx')) || fs.existsSync(path.join(dizin, 'page.ts'))) return true;
    return gruplar.some((g) => dizindeAra(path.join(dizin, g), []));
  }
  const [bas, ...kalan] = parcalar;
  for (const d of dizinler) {
    const eslesir = d === bas || /^\[[^.\]]+\]$/.test(d); // `[id]` her parçaya uyar
    if (eslesir && dizindeAra(path.join(dizin, d), kalan)) return true;
  }
  return gruplar.some((g) => dizindeAra(path.join(dizin, g), parcalar));
}

/** URL yolu (`/abonelik/kart?a=…`) `frontend/app`te bir sayfaya çözülüyor mu? */
function sayfaVarMi(yol: string): boolean {
  const saf = yol.split('?')[0].split('#')[0];
  return dizindeAra(APP, saf.split('/').filter(Boolean));
}

/** `https://ornek.test/x?y` → `/x` (başka kökten bağlantı çözülmez → null). */
function uygulamaYolu(url: string): string | null {
  if (!url.startsWith(UYGULAMA)) return null;
  return new URL(url).pathname;
}

// ═════════════════════════════════════════════════════════════════════════
//  KÜÇÜK BELLEK-PRISMA — yalnız bu yolların dokunduğu yüzey, bilinmeyende PATLAR
// ═════════════════════════════════════════════════════════════════════════
type Satir = Record<string, any>;

function bellekPrisma(abonelikler: Satir[], firmalar: Satir[], paketler: Satir[]) {
  const esles = (satir: Satir, where: Satir) => Object.entries(where).every(([k, v]) => satir[k] === v);
  const abonelikYansit = (a: Satir, arg: Satir) => {
    if (!arg.include) return { ...a };
    const surum = paketler.find((p) => p.id === a.paketSurumuId);
    return { ...a, paketSurumu: surum ? { ...surum } : null };
  };
  const prisma: any = {
    abonelik: {
      findUnique: async (arg: Satir) => {
        const a = abonelikler.find((x) => esles(x, arg.where));
        return a ? abonelikYansit(a, arg) : null;
      },
      update: async (arg: Satir) => {
        const a = abonelikler.find((x) => esles(x, arg.where));
        if (!a) throw Object.assign(new Error('abonelik yok'), { code: 'P2025' });
        Object.assign(a, arg.data);
        return { ...a };
      },
    },
    firma: {
      findUnique: async (arg: Satir) => {
        const f = firmalar.find((x) => esles(x, arg.where));
        if (!f) return null;
        if (!arg.select) return { ...f };
        return Object.fromEntries(Object.keys(arg.select).map((k) => [k, f[k]]));
      },
    },
    abonelikOlayi: {
      create: async (arg: Satir) => arg.data,
    },
  };
  return new Proxy(prisma, {
    get: (hedef, ad: string) => {
      if (ad === 'then') return undefined;
      if (!(ad in hedef)) throw new Error(`bellek-Prisma: bilinmeyen model "${ad}"`);
      return hedef[ad];
    },
  }) as any;
}

const PAKET = {
  id: 'S30', paketId: 'P1', tutar: 1649, paraBirimi: 'TRY', periyot: 'MONTHLY', periyotAdedi: 1,
  paket: { id: 'P1', kod: 'pro-mek', ad: 'Pro Mekanik', kullaniciHakki: 2, dwgAktif: true },
};

type SatirGirdisi = {
  id: string; firmaId: string; durum: string; odemeYontemi?: string; iyzicoAbonelikKodu?: string | null;
  iyzicoDurum?: string | null; iptalTalebi?: Date | null;
  ilkBasarisizlik?: Date | null; kisitlandi?: Date | null; denemeSayisi?: number;
};

function abonelikSatiri(p: SatirGirdisi): Satir {
  return {
    id: p.id, firmaId: p.firmaId, durum: p.durum, paketSurumuId: 'S30',
    odemeYontemi: p.odemeYontemi ?? 'KART',
    iyzicoAbonelikKodu: p.iyzicoAbonelikKodu === undefined ? `sub-${p.id}` : p.iyzicoAbonelikKodu,
    iyzicoDurum: p.iyzicoDurum ?? null, iptalTalebi: p.iptalTalebi ?? null,
    erisimSonu: new Date(Date.now() - 5 * 86_400_000), denemeSonu: null,
    ilkBasarisizlik: p.ilkBasarisizlik ?? null, kisitlandi: p.kisitlandi ?? null,
    denemeSayisi: p.denemeSayisi ?? 0, sonDeneme: null, planliPaketSurumuId: null, paketGecisTarihi: null,
  };
}

function firmaSatiri(id: string): Satir {
  return { id, ad: `Firma ${id}`, faturaEposta: `muhasebe@${id.toLowerCase()}.test`, yetkiliEposta: `sahip@${id.toLowerCase()}.test` };
}

/** Sahte iyzico — yalnız kart formu; çağrıları kaydeder. */
function sahteIyzico() {
  const kartCagrilari: Array<{ kod: string; donusUrl: string }> = [];
  return {
    kartCagrilari,
    istemci: {
      kartGuncellemeSayfasi: async (kod: string, donusUrl: string) => {
        kartCagrilari.push({ kod, donusUrl });
        return { token: `tok-${kod}`, checkoutFormContent: `<script>form(${kod})</script>`, tokenExpireTime: 1800 };
      },
    } as any,
  };
}

/** Express `Response`ın yönlendirme yüzü. */
function sahteCevap() {
  const yonlendirmeler: Array<{ kod: number; url: string }> = [];
  return { yonlendirmeler, cevap: { redirect: (kod: number, url: string) => yonlendirmeler.push({ kod, url }) } as any };
}

/** Herhangi bir alana dokunulursa PATLAYAN nesne — "hiç çağrılmadı"nın kanıtı. */
const DOKUNULMAZ: any = new Proxy({}, {
  get: (_h, ad) => {
    if (ad === 'then') return undefined;
    throw new Error(`DOKUNULMAZ: "${String(ad)}" okundu`);
  },
});

async function hataYakala(is: () => Promise<unknown>): Promise<{ durum?: number; kod?: unknown; hata?: unknown }> {
  try {
    await is();
    return {};
  } catch (e: any) {
    const govde = typeof e?.getResponse === 'function' ? e.getResponse() : undefined;
    return { durum: typeof e?.getStatus === 'function' ? e.getStatus() : undefined, kod: govde?.kod, hata: e };
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  S — STATİK TARAMA
// ═════════════════════════════════════════════════════════════════════════
function tsDosyalari(dizin: string): string[] {
  return fs.readdirSync(dizin, { withFileTypes: true }).flatMap((d) => {
    const tam = path.join(dizin, d.name);
    if (d.isDirectory()) return tsDosyalari(tam);
    return d.name.endsWith('.ts') && !d.name.endsWith('.spec.ts') ? [tam] : [];
  });
}

/** Yorumları soyar: tarama yorumdaki örnek yolu değil KODU ölçsün. */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Kapsam dışı: istek gövdesi sınırları (`yol:` iç yönlendirme ayarı, bağlantı değil).
const TARAMA_DISI = new Set(['src/altyapi/http/govde-siniri.ts']);

type Baglanti = { dosya: string; yol: string };

/**
 * Backend'in ürettiği uygulama bağlantıları (yorumsuz kaynaktan). Kök üç
 * aileden gelir: `uygulamaUrl` / `UYGULAMA_URL` alanı, doğrudan
 * `${uygulamaKokuCoz(…)}` ve ona bağlanmış `kok` değişkeni (kurumsal giriş,
 * davet). Şeridin eylemleri `yol: '…'` biçiminde.
 */
function uygulamaBaglantilari(): Baglanti[] {
  const SABLON = /\$\{(?:this\.|p\.|process\.env\.)?(?:uygulamaUrl|UYGULAMA_URL)\}(\/[A-Za-z0-9_\-/]*)?/g;
  const KOK_CAGRISI = /\$\{uygulamaKokuCoz\([^)]*\)\}(\/[A-Za-z0-9_\-/]*)?/g;
  const KOK_DEGISKENI = /\$\{kok\}(\/[A-Za-z0-9_\-/]*)?/g;
  const YOL = /\byol:\s*'(\/[^'?#]*)/g;
  const bulunan: Baglanti[] = [];
  for (const tam of tsDosyalari(path.join(BACKEND, 'src'))) {
    const goreli = path.relative(BACKEND, tam).split(path.sep).join('/');
    if (TARAMA_DISI.has(goreli)) continue;
    const kod = yorumsuz(fs.readFileSync(tam, 'utf-8'));
    const desenler = [SABLON, KOK_CAGRISI, YOL];
    // `kok` adı YALNIZ uygulama köküne bağlandığı dosyada bağlantıdır.
    if (/\bkok\s*=\s*uygulamaKokuCoz\(/.test(kod)) desenler.push(KOK_DEGISKENI);
    for (const desen of desenler) {
      for (const m of kod.matchAll(desen)) bulunan.push({ dosya: goreli, yol: m[1] || '/' });
    }
  }
  return bulunan;
}

function sBlogu(): Baglanti[] {
  console.log('\n── S · backend\'in ürettiği uygulama bağlantıları ön yüzde bir sayfaya çözülür ──');
  check('S-OLCUT çözücü "var" diyebiliyor: /abonelik, /dashboard, /verify-email, dinamik /quotes/<id>',
    sayfaVarMi('/abonelik') && sayfaVarMi('/dashboard') && sayfaVarMi('/verify-email') && sayfaVarMi('/quotes/abc-123'));
  check('S-OLCUT çözücü "yok" diyebiliyor: eski dönüş /abonelik/kart-donus ve uydurma yol',
    !sayfaVarMi('/abonelik/kart-donus') && !sayfaVarMi('/boyle-bir-sayfa-yok') && !sayfaVarMi('/abonelik/yok'));

  const bulunan = uygulamaBaglantilari();
  const uclar = ucEnvanteri(BACKEND);
  const apiVarMi = (yol: string) => uclar.some((u) => u.yol === yol.slice('/api'.length));

  const yollar = new Set(bulunan.map((b) => b.yol));
  // Her kök ailesinden en az bir bilinen bağlantı: `uygulamaUrl` (kart, dunning,
  // doğrulama), `yol:` (şerit), `${uygulamaKokuCoz(…)}` (SSO dönüşü), `${kok}`
  // (kurumsal giriş hatası, davet).
  const beklenen = ['/abonelik/kart', '/abonelik', '/verify-email', '/reset-password', '/dashboard',
    '/api/abonelik/iyzico-donus', '/api/abonelik/iyzico-kart-donus', '/api/auth/sso/donus', '/login', '/davet-kabul'];
  const kacan = beklenen.filter((y) => !yollar.has(y));
  check(`S-FIXTURE tarama kör değil: ${bulunan.length} bağlantı, bilinen ${beklenen.length} yolun hepsi bulundu`,
    bulunan.length >= 15 && kacan.length === 0, `kacan=${kacan.join(', ')}`);

  const olu = bulunan.filter((b) => (b.yol.startsWith('/api/') ? !apiVarMi(b.yol) : !sayfaVarMi(b.yol)));
  check('S1 ⭐⭐ her uygulama bağlantısı bir ön yüz SAYFASINA, her /api/ dönüşü kayıtlı bir UCA çözülür (ölü bağlantı YOK)',
    olu.length === 0, `olu=${JSON.stringify(olu)}`);
  check('S2 ⭐ /abonelik/kart artık bir sayfa (25.09 öncesi 404)', sayfaVarMi('/abonelik/kart'));
  check('S3 kartın eski ön yüz dönüş adresi hiçbir yerde üretilmiyor',
    !bulunan.some((b) => b.yol === '/abonelik/kart-donus'), JSON.stringify(bulunan.filter((b) => b.yol.includes('kart-donus'))));
  return bulunan;
}

// ═════════════════════════════════════════════════════════════════════════
//  R — DAVRANIŞ: gerçek üreticilerin gerçek bağlantıları
// ═════════════════════════════════════════════════════════════════════════
async function rBlogu(): Promise<void> {
  console.log('\n── R · gerçek şerit, e-posta, form ve yönlendirme bağlantıları ──');
  const simdi = new Date();
  const gun = 86_400_000;
  const satirlar = [
    abonelikSatiri({ id: 'ab-ob', firmaId: 'F-OB', durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: new Date(simdi.getTime() - 2 * gun), denemeSayisi: 1 }),
    abonelikSatiri({ id: 'ab-ks', firmaId: 'F-KS', durum: 'KISITLI', ilkBasarisizlik: new Date(simdi.getTime() - 12 * gun), kisitlandi: new Date(simdi.getTime() - 2 * gun), denemeSayisi: 4 }),
    abonelikSatiri({ id: 'ab-as', firmaId: 'F-AS', durum: 'ASKIDA', ilkBasarisizlik: new Date(simdi.getTime() - 35 * gun), denemeSayisi: 6 }),
  ];
  const db = bellekPrisma(satirlar, satirlar.map((s) => firmaSatiri(s.firmaId)), [PAKET]);
  const erisim = new ErisimServisi(db);
  for (const s of satirlar) {
    const k = await erisim.karar(s.firmaId, simdi);
    const yol = k.uyari?.eylem?.yol ?? '';
    check(`R1 ⭐ ${s.durum} şeridinin eylemi (${k.uyari?.eylem?.etiket}) bir sayfaya gider: ${yol}`,
      yol === '/abonelik/kart' && sayfaVarMi(yol), `uyari=${JSON.stringify(k.uyari)}`);
  }

  // Dunning e-posta düğmeleri — gerçek `gonder` üzerinden.
  const giden: Array<{ konu: string; dugme?: { etiket: string; url: string } }> = [];
  const posta = { gonder: async (t: any) => { giden.push({ konu: t.konu, dugme: t.dugme }); } } as any;
  const dunningSatiri = abonelikSatiri({ id: 'ab-d', firmaId: 'F-D', durum: 'ODEME_BEKLIYOR', ilkBasarisizlik: new Date(), denemeSayisi: 0 });
  const dbD = bellekPrisma([dunningSatiri], [firmaSatiri('F-D')], [PAKET]);
  const dunning = new DunningServisi(dbD, {} as any, new AbonelikServisi(dbD, {} as any), posta, config);
  await dunning.ilkBildirim('ab-d', 'ord-1');
  const ilk = giden[0];
  const ilkYol = ilk?.dugme ? uygulamaYolu(ilk.dugme.url) : null;
  check('R2 ⭐ "ödemeniz alınamadı" düğmesi (Kartımı güncelle) sayfaya gider ve ?a= aboneliğin kimliğini taşır',
    ilkYol === '/abonelik/kart' && sayfaVarMi(ilkYol) && new URL(ilk.dugme!.url).searchParams.get('a') === 'ab-d',
    `giden=${JSON.stringify(giden)}`);
  await dunning.tahsilatToparlandi('ab-d', true);
  const alindi = giden[1];
  const alindiYol = alindi?.dugme ? uygulamaYolu(alindi.dugme.url) : null;
  // E-postayı metin kaynağından tanı: metin değişirse kapı sahte kırmızı vermesin.
  const toparlandi = DUNNING_METINLERI.toparlandi({ firmaAdi: '', paketAdi: '', tutar: '' });
  check(`R3 ⭐ "ödemeniz alındı" düğmesi (${toparlandi.dugmeEtiketi}) kart formuna DEĞİL panele gider`,
    alindi?.konu === toparlandi.konu && alindi?.dugme?.etiket === toparlandi.dugmeEtiketi &&
      alindiYol === '/dashboard' && sayfaVarMi(alindiYol),
    `giden=${JSON.stringify(giden)}`);

  // Kart formunun dönüş adresi — gerçek `kartGuncellemeFormu`.
  const iyz = sahteIyzico();
  const dbF = bellekPrisma([abonelikSatiri({ id: 'ab-f', firmaId: 'F-F', durum: 'KISITLI' })], [firmaSatiri('F-F')], [PAKET]);
  const satinAlma = new SatinAlmaServisi(dbF, iyz.istemci, new AbonelikServisi(dbF, {} as any), config, {} as any, {} as any);
  await satinAlma.kartGuncellemeFormu('F-F');
  const donus = iyz.kartCagrilari[0]?.donusUrl ?? '';
  const donusYolu = uygulamaYolu(donus) ?? '';
  const uc = ucEnvanteri(BACKEND).find((u) => u.fiil === 'POST' && u.yol === donusYolu.slice('/api'.length));
  check('R4 ⭐⭐ kart formunun callbackUrl\'i SUNUCU ucu (/api/…): ön yüz sayfası POST gövdesini okuyamaz',
    donusYolu === '/api/abonelik/iyzico-kart-donus', `donus=${donus}`);
  check('R5 ⭐ o dönüş ucu kayıtlı bir POST ucu ve OTURUM istemiyor (iyzico\'nun çapraz-site POST\'u jeton taşımaz)',
    !!uc && ![...uc.sinifDekoratorleri, ...uc.metotDekoratorleri].some((d) => d.includes('JwtAuthGuard')),
    `uc=${JSON.stringify(uc)}`);

  // Dönüş yönlendirmeleri — gerçek controller.
  const c1 = sahteCevap();
  new IyzicoDonusController(DOKUNULMAZ, config).kartDonus({ token: 'tok-1' }, c1.cevap);
  const kartDonusYolu = c1.yonlendirmeler[0] ? uygulamaYolu(c1.yonlendirmeler[0].url) : null;
  check('R6 ⭐ kart dönüşü sonuç SAYFASINA yönlenir (/abonelik/kart?sonuc=…)',
    kartDonusYolu === '/abonelik/kart' && sayfaVarMi(kartDonusYolu), JSON.stringify(c1.yonlendirmeler));
  const c2 = sahteCevap();
  await new IyzicoDonusController({ donusIyzicodan: async () => 'tamam' } as any, config).donus({ token: 't' }, c2.cevap);
  const satinDonusYolu = c2.yonlendirmeler[0] ? uygulamaYolu(c2.yonlendirmeler[0].url) : null;
  check('R7 satın alma dönüşünün hedefi de bir sayfa (/abonelik/donus)',
    satinDonusYolu === '/abonelik/donus' && sayfaVarMi(satinDonusYolu), JSON.stringify(c2.yonlendirmeler));

  // TEK KURAL (inceleme M3): şerit kart sayfasına YALNIZ kart formu gerçekten
  // açılacaksa yollar. Havale teklifi `ASKIDA` + `HAVALE` satırı açar
  // (havale.servisi `abonelikBulYaDaOlustur`); o satırda kart sayfası
  // "kart aboneliği yok" retiyle çıkmazdı.
  const VARYANTLAR: Array<[string, Partial<SatirGirdisi>]> = [
    ['kart, iyzico durumu bilinmiyor', {}],
    ['kart, iyzico UNPAID', { iyzicoDurum: 'UNPAID' }],
    ['kart, iyzico CANCELED', { iyzicoDurum: 'CANCELED' }],
    ['kart, iyzico EXPIRED', { iyzicoDurum: 'EXPIRED' }],
    ['kart, iptal talepli', { iptalTalebi: new Date(simdi.getTime() - gun) }],
    ['kart kodu yok', { iyzicoAbonelikKodu: null }],
    ['havale teklifi satırı (kodsuz)', { odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null }],
    ['havaleye geçmiş (eski kart kodu duruyor)', { odemeYontemi: 'HAVALE' }],
  ];
  const uyusmayan: string[] = [];
  const sayac = { kart: 0, abonelik: 0 };
  for (const durum of ['ODEME_BEKLIYOR', 'KISITLI', 'ASKIDA']) {
    for (const [ad, ek] of VARYANTLAR) {
      const satir = abonelikSatiri({
        id: 'ab-m', firmaId: 'F-M', durum, ilkBasarisizlik: new Date(simdi.getTime() - 12 * gun), denemeSayisi: 4, ...ek,
      });
      const dbM = bellekPrisma([satir], [firmaSatiri('F-M')], [PAKET]);
      const eylem = (await new ErisimServisi(dbM).karar('F-M', simdi)).uyari?.eylem;
      const iyzM = sahteIyzico();
      const form = new SatinAlmaServisi(dbM, iyzM.istemci, new AbonelikServisi(dbM, {} as any), config, {} as any, {} as any);
      const h = await hataYakala(() => form.kartGuncellemeFormu('F-M'));
      const acildi = h.hata === undefined;
      if (eylem?.yol === '/abonelik/kart') sayac.kart++;
      else if (eylem?.yol === '/abonelik') sayac.abonelik++;
      if (!acildi && h.kod !== 'KART_ABONELIGI_YOK') uyusmayan.push(`${durum}/${ad}: beklenmedik hata ${String(h.hata)}`);
      else if ((eylem?.yol === '/abonelik/kart') !== acildi || !eylem || !sayfaVarMi(eylem.yol)) {
        uyusmayan.push(`${durum}/${ad}: eylem=${JSON.stringify(eylem)} form=${acildi}`);
      }
    }
  }
  check(`R8-FIXTURE matris iki sonucu da üretiyor: kart sayfası ${sayac.kart}, abonelik sayfası ${sayac.abonelik} (24 satır)`,
    sayac.kart > 0 && sayac.abonelik > 0 && sayac.kart + sayac.abonelik === 24);
  check('R8 ⭐⭐ TEK KURAL: şerit kart sayfasına YALNIZ kart formu açılacaksa yollar, değilse /abonelik (3 durum × 8 satır)',
    uyusmayan.length === 0, uyusmayan.join(' · '));
}

// ═════════════════════════════════════════════════════════════════════════
//  A — `?a=` ANLAMI + DTO + CONTROLLER BAĞLANTISI
// ═════════════════════════════════════════════════════════════════════════
async function aBlogu(): Promise<void> {
  console.log('\n── A · e-postadaki ?a= yalnız kendi aboneliğinin kartını açar ──');
  const dunya = (satir: Satir | null) => {
    const iyz = sahteIyzico();
    const db = bellekPrisma(satir ? [satir] : [], [firmaSatiri('F-A')], [PAKET]);
    const s = new SatinAlmaServisi(db, iyz.istemci, new AbonelikServisi(db, {} as any), config, {} as any, {} as any);
    return { iyz, s };
  };
  const KENDI = '11111111-1111-4111-8111-111111111111';
  const BASKA = '22222222-2222-4222-8222-222222222222';

  // Ödemesi başarısız aboneliğin iyzico'daki olağan hâli UNPAID: kapalı SAYILMAZ.
  const d1 = dunya(abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'ASKIDA', iyzicoDurum: 'UNPAID' }));
  const f1 = await d1.s.kartGuncellemeFormu('F-A', KENDI);
  check('A1 ⭐ ?a= kendi aboneliği → form döner, iyzico kendi abonelik koduyla çağrılır',
    f1.formIcerigi.includes(`sub-${KENDI}`) && d1.iyz.kartCagrilari.length === 1 && d1.iyz.kartCagrilari[0].kod === `sub-${KENDI}`,
    JSON.stringify(d1.iyz.kartCagrilari));

  const d2 = dunya(abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'ASKIDA' }));
  const h2 = await hataYakala(() => d2.s.kartGuncellemeFormu('F-A', BASKA));
  check('A2 ⭐⭐ ?a= BAŞKA abonelik → 409 ABONELIK_ESLESMIYOR ve iyzico\'ya HİÇ gidilmez',
    h2.durum === 409 && h2.kod === 'ABONELIK_ESLESMIYOR' && d2.iyz.kartCagrilari.length === 0,
    `durum=${h2.durum} kod=${String(h2.kod)} iyzico=${d2.iyz.kartCagrilari.length}`);

  const d3 = dunya(abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'ODEME_BEKLIYOR' }));
  await d3.s.kartGuncellemeFormu('F-A');
  check('A3 ?a= yok (uygulama içi şerit) → oturumdaki firmanın formu', d3.iyz.kartCagrilari.length === 1);

  const kartsiz: Array<[string, Satir | null]> = [
    ['havaleye geçmiş satır (eski kart kodu duruyor)', abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'AKTIF', odemeYontemi: 'HAVALE' })],
    ['havale teklifi satırı (ASKIDA, kodsuz)', abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'ASKIDA', odemeYontemi: 'HAVALE', iyzicoAbonelikKodu: null })],
    ['kart kodu hiç yok', abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'AKTIF', iyzicoAbonelikKodu: null })],
    ['iptal talepli (dönem sonuna dek IPTAL)', abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'IPTAL', iptalTalebi: new Date() })],
    ["iyzico'da CANCELED", abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'ASKIDA', iyzicoDurum: 'CANCELED' })],
    ["iyzico'da EXPIRED", abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'KISITLI', iyzicoDurum: 'EXPIRED' })],
    ['bitmiş abonelik (SONA_ERDI)', abonelikSatiri({ id: KENDI, firmaId: 'F-A', durum: 'SONA_ERDI' })],
    ['abonelik satırı yok (vitrin)', null],
  ];
  for (const [ad, satir] of kartsiz) {
    const d = dunya(satir);
    const h = await hataYakala(() => d.s.kartGuncellemeFormu('F-A'));
    check(`A4 ${ad} → 400 KART_ABONELIGI_YOK, iyzico'ya gidilmez`,
      h.durum === 400 && h.kod === 'KART_ABONELIGI_YOK' && d.iyz.kartCagrilari.length === 0,
      `durum=${h.durum} kod=${String(h.kod)}`);
  }

  // DTO — global ValidationPipe'ın gerçek ayarıyla (main.ts: whitelist + transform).
  const boru = new ValidationPipe({ whitelist: true, transform: true });
  const meta = { type: 'body' as const, metatype: KartGuncelleDto, data: '' };
  const hBozuk = await hataYakala(() => boru.transform({ abonelikId: 'ab-d; DROP' }, meta));
  const gecerli: any = await boru.transform({ abonelikId: KENDI, fazla: 'x' }, meta);
  const bos: any = await boru.transform({}, meta);
  check('A5 DTO: UUID olmayan ?a= 400 · geçerli kimlik geçer, fazla alan atılır · boş gövde geçer',
    hBozuk.durum === 400 && gecerli.abonelikId === KENDI && !('fazla' in gecerli) && bos.abonelikId === undefined,
    `bozuk=${hBozuk.durum} gecerli=${JSON.stringify(gecerli)} bos=${JSON.stringify(bos)}`);

  // Controller BAĞLANTISI: gövde tipi DTO sınıfı (satır-içi tip ValidationPipe'ı atlar), ?a= servise gider.
  const tipler = Reflect.getMetadata('design:paramtypes', AbonelikController.prototype, 'kartGuncelle') ?? [];
  const cagrilar: unknown[][] = [];
  const kontrolcu = new AbonelikController({} as any, {
    kartGuncellemeFormu: async (...arg: unknown[]) => { cagrilar.push(arg); return { formIcerigi: '' }; },
  } as any, {} as any, {} as any, {} as any, {} as any);
  await kontrolcu.kartGuncelle({ id: 'U1', firmaId: 'F-A' }, { abonelikId: KENDI });
  check('A6 ⭐ BAĞLANTI: @Body tipi KartGuncelleDto ve controller ?a=\'yı servise iletir',
    tipler[1] === KartGuncelleDto && cagrilar.length === 1 && cagrilar[0][0] === 'F-A' && cagrilar[0][1] === KENDI,
    `tipler=${tipler.map((t: any) => t?.name)} cagri=${JSON.stringify(cagrilar)}`);
  const roller = Reflect.getMetadata(FIRMA_ROL_KEY, AbonelikController.prototype.kartGuncelle);
  check('A7 kart formunu yalnız firma SAHİBİ açar (FirmaRolu sahip yerinde)',
    Array.isArray(roller) && roller.length === 1 && roller[0] === 'sahip', JSON.stringify(roller));
  const metot = AbonelikController.prototype.kartGuncelle;
  const kapilar: unknown[] = Reflect.getMetadata(GUARDS_METADATA, metot) ?? [];
  const sinir = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, metot);
  const sure = Reflect.getMetadata(`${THROTTLER_TTL}default`, metot);
  check('A8 kart formu oturum sahibi başına hız sınırlı (15 dk\'da 10): her çağrı iyzico\'da form jetonu açar',
    kapilar.includes(KullaniciHizSiniriGuard) && sinir === 10 && sure === 900_000,
    `kapilar=${kapilar.map((k: any) => k?.name)} sinir=${sinir} sure=${sure}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  D — KART DÖNÜŞ UCU
// ═════════════════════════════════════════════════════════════════════════
function dBlogu(): void {
  console.log('\n── D · kart dönüş ucu: yazmaz, oturum istemez, yalnız yönlendirir ──');
  const ucla = (govde: { token?: string } | undefined) => {
    const c = sahteCevap();
    // DOKUNULMAZ servis: uç servise dokunursa patlar — "hiçbir şey yazmaz"ın kanıtı.
    new IyzicoDonusController(DOKUNULMAZ, config).kartDonus(govde, c.cevap);
    return c.yonlendirmeler;
  };
  const tokenli = ucla({ token: 'tok-1' });
  check('D1 ⭐ token geldi → 303 /abonelik/kart?sonuc=guncellendi (servise dokunulmadı)',
    tokenli.length === 1 && tokenli[0].kod === 303 && tokenli[0].url === `${UYGULAMA}/abonelik/kart?sonuc=guncellendi`,
    JSON.stringify(tokenli));
  const tokensiz = ucla({});
  const govdesiz = ucla(undefined);
  check('D2 token yok / gövde yok → 303 ?sonuc=hata (çökmez)',
    tokensiz[0]?.url === `${UYGULAMA}/abonelik/kart?sonuc=hata` && govdesiz[0]?.url === `${UYGULAMA}/abonelik/kart?sonuc=hata`,
    JSON.stringify([tokensiz, govdesiz]));
  const sinifKapisi = Reflect.getMetadata(GUARDS_METADATA, IyzicoDonusController);
  const metotKapisi = Reflect.getMetadata(GUARDS_METADATA, IyzicoDonusController.prototype.kartDonus);
  check('D3 ⭐ dönüş ucunda kapı (guard) YOK — sınıf ve metot', !sinifKapisi && !metotKapisi,
    `sinif=${String(sinifKapisi)} metot=${String(metotKapisi)}`);
}

// ═════════════════════════════════════════════════════════════════════════
//  C — CORS: iyzico'nun çapraz-site dönüşü denetleyiciye ULAŞIR
// ═════════════════════════════════════════════════════════════════════════
const IYZICO_KOKENI = 'https://sandbox-cpp.iyzipay.com';

/** Kapı ölçütü: kimlikli `kart-guncelle` ucunun yerine geçen taklit; çağrıyı sayar. */
const korumaliCagri = { sayi: 0 };

@Controller('abonelik')
class KorumaliUcTaklidi {
  @Post('kart-guncelle')
  kartGuncelle() {
    korumaliCagri.sayi++;
    return { ok: true };
  }
}

// Gerçek dönüş denetleyicisi; servisi yalnız satın alma dönüşünün sonucunu verir.
@Module({
  controllers: [IyzicoDonusController, KorumaliUcTaklidi],
  providers: [
    { provide: SatinAlmaServisi, useValue: { donusIyzicodan: async () => 'basarili' } },
    { provide: ConfigService, useValue: config },
  ],
})
class CorsOlcumModulu {}

type HttpYaniti = { durum: number; basliklar: http.IncomingHttpHeaders; govde: string };

/** Ham HTTP isteği: `Origin` gibi tarayıcı başlıkları olduğu gibi gider; bağlantı tutulmaz. */
function istek(port: number, yontem: string, yol: string, basliklar: Record<string, string>, govde = ''): Promise<HttpYaniti> {
  return new Promise((coz, reddet) => {
    const govdeBasliklari = govde
      ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(govde)) }
      : {};
    const r = http.request(
      { host: '127.0.0.1', port, method: yontem, path: yol, agent: false, headers: { ...basliklar, ...govdeBasliklari } },
      (res) => {
        let g = '';
        res.setEncoding('utf8');
        res.on('data', (p: string) => (g += p));
        res.on('end', () => coz({ durum: res.statusCode ?? 0, basliklar: res.headers, govde: g }));
      },
    );
    r.on('error', reddet);
    r.end(govde);
  });
}

const ozet = (y: HttpYaniti) =>
  `durum=${y.durum} location=${y.basliklar.location ?? '-'} acao=${y.basliklar['access-control-allow-origin'] ?? '-'} govde=${y.govde.slice(0, 80)}`;

async function cBlogu(bulunan: Baglanti[]): Promise<void> {
  console.log('\n── C · CORS: iyzico\'nun çapraz-site dönüş POST\'u denetleyiciye ulaşır ──');
  // main.ts ile AYNI sıra: CORS → global önek → dinle.
  const app = await NestFactory.create<NestExpressApplication>(CorsOlcumModulu, { logger: false });
  app.enableCors(corsSecenekleri([UYGULAMA]));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as { port: number }).port;
  try {
    const kart = await istek(port, 'POST', '/api/abonelik/iyzico-kart-donus', { Origin: IYZICO_KOKENI }, 'token=tok-1');
    check('C1 ⭐⭐ kart dönüşü: iyzico kökenli form POST\'u → 303 /abonelik/kart?sonuc=guncellendi (kapı 500 yazmıyor)',
      kart.durum === 303 && kart.basliklar.location === `${UYGULAMA}/abonelik/kart?sonuc=guncellendi`, ozet(kart));
    const satin = await istek(port, 'POST', '/api/abonelik/iyzico-donus', { Origin: IYZICO_KOKENI }, 'token=tok-2');
    check('C2 ⭐ satın alma dönüşü de ulaşır → 303 /abonelik/donus?sonuc=basarili',
      satin.durum === 303 && satin.basliklar.location === `${UYGULAMA}/abonelik/donus?sonuc=basarili`, ozet(satin));
    const gizli = await istek(port, 'POST', '/api/abonelik/iyzico-kart-donus', { Origin: 'null' }, 'token=tok-3');
    check('C3 kökeni gizleyen yönlendirme politikası ("Origin: null") da ulaşır',
      gizli.durum === 303 && gizli.basliklar.location === `${UYGULAMA}/abonelik/kart?sonuc=guncellendi`, ozet(gizli));
    check('C4 muaf yanıt CORS başlığı TAŞIMAZ (tarayıcıya yanıt okutulmaz, yalnız reddedilmez)',
      kart.basliklar['access-control-allow-origin'] === undefined &&
        kart.basliklar['access-control-allow-credentials'] === undefined, ozet(kart));

    const once = korumaliCagri.sayi;
    const yabanci = await istek(port, 'POST', '/api/abonelik/kart-guncelle', { Origin: IYZICO_KOKENI }, 'abonelikId=x');
    check('C5 ⭐ ÖLÇÜT kapı öteki yollarda SÜRER: aynı köken kimlikli uca → reddedilir, denetleyiciye ULAŞMAZ',
      yabanci.durum === 500 && korumaliCagri.sayi === once, `${ozet(yabanci)} cagri=${korumaliCagri.sayi - once}`);
    const getYabanci = await istek(port, 'GET', '/api/abonelik/iyzico-kart-donus', { Origin: IYZICO_KOKENI });
    check('C6 muafiyet YALNIZ POST: aynı yola GET yabancı kökenle yine reddedilir (404 değil 500)',
      getYabanci.durum === 500, ozet(getYabanci));
    const izinli = await istek(port, 'POST', '/api/abonelik/kart-guncelle', { Origin: UYGULAMA }, 'a=1');
    check('C7 izinli köken: istek geçer, Allow-Origin = köken + Allow-Credentials: true',
      izinli.durum === 201 && izinli.basliklar['access-control-allow-origin'] === UYGULAMA &&
        izinli.basliklar['access-control-allow-credentials'] === 'true', ozet(izinli));
    const kokensiz = await istek(port, 'POST', '/api/abonelik/kart-guncelle', {}, 'a=1');
    check('C8 kökensiz istek (aynı köken / sunucudan sunucuya) geçer, CORS başlığı yok',
      kokensiz.durum === 201 && kokensiz.basliklar['access-control-allow-origin'] === undefined, ozet(kokensiz));
  } finally {
    await app.close();
  }

  // BAĞLANTI: üretim bu ayarı gerçekten kullanıyor.
  const ana = yorumsuz(fs.readFileSync(path.join(BACKEND, 'src', 'main.ts'), 'utf-8'));
  const cagri = ana.indexOf('app.enableCors(corsSecenekleri(');
  check('C9 ⭐ BAĞLANTI: main.ts CORS\'u YALNIZ corsSecenekleri ile kuruyor — setGlobalPrefix ve listen\'dan ÖNCE',
    cagri > 0 && (ana.match(/enableCors\(/g) ?? []).length === 1 &&
      cagri < ana.indexOf('app.setGlobalPrefix(') && cagri < ana.indexOf('app.listen('),
    `cagri@${cagri} enableCors=${(ana.match(/enableCors\(/g) ?? []).length}`);

  // KULLANIM: muafiyet listesi = backend'in ürettiği POST dönüş adresleri.
  // Yeni bir iyzico `callbackUrl`i listeye girmezse, ölü muafiyet kalırsa kırmızı.
  const uclar = ucEnvanteri(BACKEND);
  const postDonusleri = [...new Set(bulunan.map((b) => b.yol))]
    .filter((y) => y.startsWith('/api/') && uclar.some((u) => u.fiil === 'POST' && u.yol === y.slice('/api'.length)))
    .sort();
  const liste = [...CAPRAZ_SITE_DONUS_YOLLARI].sort();
  check(`C10 ⭐ muafiyet listesi = kullanılan POST dönüş adresleri (${postDonusleri.join(', ')})`,
    postDonusleri.length >= 2 && JSON.stringify(postDonusleri) === JSON.stringify(liste),
    `kullanilan=${postDonusleri.join(',')} liste=${liste.join(',')}`);
}

function son(): void {
  console.log(`\n${'='.repeat(64)}\nKART GÜNCELLEME: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const bulunan = sBlogu();
  await rBlogu();
  await aBlogu();
  dBlogu();
  await cBlogu(bulunan);
  son();
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
