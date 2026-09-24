/**
 * IYZICO ZAMAN ASIMI — KAPI · `npm run test:iyzico-zaman-asimi` (24.09.2026)
 *
 * AG GEREKTIRMEZ: SUREC ICI yerel HTTP sunucusu (127.0.0.1, rastgele port)
 * iyzico gibi davranir — cevap vermez, govdeyi yarida birakir, baglantiyi
 * koparir ya da cevap verir. Istek GERCEK `fetch` (undici) ile gider; `fetch`
 * yalniz SARILIR (giden secenekler kaydedilir, istek aynen iletilir).
 * Bekleme KISALTILIR: `AbortSignal.timeout` sarilir, istenen sure KAYDEDILIR
 * ve GERCEK sinyal kisa sureyle kurulur — TimeoutError da soketin kapanmasi
 * da gercektir, yalniz 20 sn yerine 300 ms.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * `IyzicoClient.istek` icindeki `fetch` sinyal TASIMIYORDU. undici basliga
 * 300 sn, govdeye ayrica 300 sn bekler: iyzico takilinca odeme, iptal, kart
 * guncelleme ve paket degisimi istekleri dakikalarca asili kaliyordu; paket
 * degisiminin FIRMA SIRASI yuzunden ayni firmanin sonraki istekleri de.
 *
 * ⚠ ANLAM: zaman asimi RED DEGILDIR (iyzico islemi yapmis olabilir). Hata
 * KODSUZ ve `zamanAsimi` ISARETLI olmali ki degistiren cagiranlar onu redden
 * ayirsin. Z6/Z7 bunu GERCEK istemci + GERCEK servisle (`PaketDegisimiServisi`,
 * `DunningServisi`) olcer; sahte olan yalniz Prisma, e-posta ve iyzico'nun kendisi.
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   Z1 giden istekte `signal` var (GET + POST); o sinyal zaman asimi sinyali,
 *      her istegin KENDI sinyali
 *   Z2 sure ADLANDIRILMIS sabitten; sabit on yuzun siradan istek sinirinin
 *      (dosyadan okunur) en az 5 sn altinda ve 10 sn'den kisa degil
 *   Z3 ⭐ baslik gelmezse istek KESILIR: kodsuz + isaretli IyzicoHatasi, Turkce
 *      mesaj, takilan uc gunlukte; sunucu baglantinin kapandigini gorur; suzgec
 *      502 + uydurma kodsuz mesaj
 *   Z4 govde yarida kalirsa da kesilir ("cozumlenemedi" DEGIL)
 *   Z5 normal yanit etkilenmez, sure sonradan dolunca yan etki yok; ag hatasi
 *      "zaman asimi" diye ETIKETLENMEZ; gercek iyzico reddi ISARETSIZ kalir
 *   Z6 ⭐ BAGLANTI: paket degisiminde zaman asimi BELIRSIZ dala girer (iyzico'ya
 *      sorulur); kayitli uc hala canli gorunse de "degismedi" DENMEZ (503
 *      dogrulanamadi); firma sirasi COZULUR — bekleyen istek islenir
 *   Z7 ⭐ BAGLANTI: dunning yeniden denemesi zaman asimina ugrarsa "odemeniz
 *      alinamadi" bildirimi GITMEZ, basamak islenmis SAYILMAZ — basamak basina
 *      BIR KEZ: ikinci zaman asiminda bildirim gider. Gercek red ve basarili
 *      yanit eskisi gibi; basarili denemeden sonraki DB hatasi red SAYILMAZ
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 * ⚠ `process.exit` YOK: Windows'ta acik fetch soketiyle `process.exit(1)`
 * sureci 0xC0000409 ile cokertiyor (14.09 olcumu, deploy-olcum). Basarisizlik
 * `process.exitCode = 1` ile isaretlenir; yarida kalan kosum da FAIL sayilir.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbonelikDurumu } from '@prisma/client';

import {
  IYZICO_ZAMAN_ASIMI_MS,
  IyzicoClient,
  IyzicoHatasi,
} from '../src/ozellik/odeme/iyzico/iyzico.client';
import {
  iyzicoDurumunuHttpyeCevir,
  kullaniciyaMesaj,
} from '../src/ozellik/odeme/iyzico/iyzico-hata.filter';
import { AbonelikServisi } from '../src/ozellik/odeme/abonelik/abonelik.servisi';
import { PaketDegisimiServisi } from '../src/ozellik/odeme/abonelik/paket-degisimi.servisi';
import { DunningServisi } from '../src/ozellik/odeme/dunning/dunning.servisi';

// Nest gunlugu YAKALANIR (ekrana basilmaz): Z3 istemcinin uyari satirini olcer,
// kirmizi kosumda son satirlar teshis icin basilir.
const gunluk: string[] = [];
Logger.overrideLogger({
  log: () => undefined,
  error: (m: unknown) => void gunluk.push(`ERROR ${String(m)}`),
  warn: (m: unknown) => void gunluk.push(`WARN ${String(m)}`),
  debug: () => undefined,
  verbose: () => undefined,
});

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

// Kosum yarida kalirsa (bir istek sonsuza dek asili, olay dongusu bosaldi)
// Node 0 ile cikar ve kapi PASS sanir. Sonuc satiri yazilmadiysa FAIL.
let bitti = false;
process.on('exit', () => {
  if (!bitti) {
    console.log('\n  ✗ KAPI YARIDA KALDI — sonuc satiri yazilmadi, PASS sayilamaz');
    process.exitCode = 1;
  }
});

const KOK = join(__dirname, '..', '..');
/** Kisaltilmis zaman asimi (gercek sinyal, yalniz sure kisa). */
const KISA_MS = 300;
/** Bekci: bu surede sonuclanmayan istek ASILI sayilir — kapi asilmaz. */
const BEKCI_MS = 4_000;

const uyu = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function bekle(kosul: () => boolean, ms = 1_000): Promise<boolean> {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    if (kosul()) return true;
    await uyu(10);
  }
  return kosul();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ARACILAR: fetch SARILIR, AbortSignal.timeout KISALTILIR (ikisi de gercek)
// ═══════════════════════════════════════════════════════════════════════════
interface GidenIstek {
  url: string;
  metot?: string;
  signal?: unknown;
  /** fetch'in sozu basliklarla cozuldu mu (govde asamasina gecildi mi). */
  baslikGeldi: boolean;
}
const giden: GidenIstek[] = [];
const kurulanSureler: number[] = [];
const kurulanSinyaller: AbortSignal[] = [];
/** Gercek sinyalin kurulacagi sure; Z5c bekcinin tetiklenmemesi icin uzatir. */
let sinyalSuresi = KISA_MS;

const asilFetch = globalThis.fetch;
const asilTimeout = AbortSignal.timeout;

function aracilariKur(): void {
  globalThis.fetch = ((url: any, opts: any) => {
    const kayit: GidenIstek = { url: String(url), metot: opts?.method, signal: opts?.signal, baslikGeldi: false };
    giden.push(kayit);
    return asilFetch(url, opts).then((cevap) => {
      kayit.baslikGeldi = true;
      return cevap;
    });
  }) as typeof fetch;
  (AbortSignal as any).timeout = (ms: number): AbortSignal => {
    kurulanSureler.push(ms);
    const sinyal = asilTimeout.call(AbortSignal, sinyalSuresi) as AbortSignal;
    kurulanSinyaller.push(sinyal);
    return sinyal;
  };
}

function aracilariSok(): void {
  globalThis.fetch = asilFetch;
  (AbortSignal as any).timeout = asilTimeout;
}

function kayitlariSifirla(): void {
  giden.length = 0;
  kurulanSureler.length = 0;
  kurulanSinyaller.length = 0;
  sinyalSuresi = KISA_MS;
}

/** Istegi bekciyle kosar: sonuclanmazsa `asili` doner, kapi ASILMAZ. `bitti` = sonuc ani. */
async function sureli<T>(
  is: () => Promise<T>,
): Promise<{ durum: 'deger' | 'hata' | 'asili'; deger?: T; hata?: any; ms: number; bitti: number }> {
  const t0 = Date.now();
  let bekci: NodeJS.Timeout | undefined;
  const sonuc = await Promise.race([
    // `then(ok, hata)`: bekci kazansa da gec gelen red ISLENMIS olur.
    is().then(
      (deger) => ({ durum: 'deger' as const, deger }),
      (hata) => ({ durum: 'hata' as const, hata }),
    ),
    new Promise<{ durum: 'asili' }>((r) => {
      bekci = setTimeout(() => r({ durum: 'asili' }), BEKCI_MS);
    }),
  ]);
  clearTimeout(bekci);
  const bitti = Date.now();
  return { ...sonuc, ms: bitti - t0, bitti };
}

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE IYZICO — yerel HTTP sunucusu
// ═══════════════════════════════════════════════════════════════════════════
type Davranis =
  | { tur: 'cevapla'; veri?: unknown }
  | { tur: 'reddet'; kod: string; mesaj: string } // iyzico ACIK red (status: failure)
  | { tur: 'takil' } // hic cevap yok
  | { tur: 'govde-yarim' } // 200 + basliklar gelir, govde yarida kalir
  | { tur: 'kopar' }; // baglanti hemen kesilir (ag hatasi)

interface GelenIstek {
  metot: string;
  yol: string;
  /** Sunucuya varis ani. */
  an: number;
  /** Yanit TAMAMLANMADAN baglanti kapandi (istemci kesti). */
  kesildi: boolean;
}

async function sahteIyzico(yonlendir: (metot: string, yol: string) => Davranis) {
  const gelen: GelenIstek[] = [];
  const sunucu = createServer((req, res) => {
    const kayit: GelenIstek = { metot: req.method ?? '?', yol: req.url ?? '?', an: Date.now(), kesildi: false };
    gelen.push(kayit);
    res.on('close', () => {
      if (!res.writableFinished) kayit.kesildi = true;
    });
    req.resume();
    const d = yonlendir(kayit.metot, kayit.yol);
    if (d.tur === 'takil') return;
    if (d.tur === 'kopar') {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (d.tur === 'reddet') {
      res.end(JSON.stringify({ status: 'failure', errorCode: d.kod, errorMessage: d.mesaj }));
      return;
    }
    if (d.tur === 'govde-yarim') {
      res.write('{"status":');
      return;
    }
    res.end(JSON.stringify({ status: 'success', data: d.veri ?? {} }));
  });
  await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', () => r()));
  const port = (sunucu.address() as AddressInfo).port;
  return {
    taban: `http://127.0.0.1:${port}`,
    gelen,
    kapat: () =>
      new Promise<void>((r) => {
        sunucu.closeAllConnections();
        sunucu.close(() => r());
      }),
  };
}

function istemci(taban: string): IyzicoClient {
  return new IyzicoClient(
    new ConfigService({
      IYZICO_API_KEY: 'sandbox-TEST-API',
      IYZICO_SECRET_KEY: 'sandbox-TEST-SECRET',
      IYZICO_TABAN_URL: taban,
    }),
  );
}

const ozet = (h: any) =>
  h instanceof IyzicoHatasi
    ? `IyzicoHatasi kod=${h.kod} httpDurum=${h.httpDurum} zamanAsimi=${h.zamanAsimi} mesaj="${h.message}"`
    : `${h?.constructor?.name ?? typeof h} ${h?.message ?? String(h)}`;

// ═══════════════════════════════════════════════════════════════════════════
//  Z1 / Z2 · SINYAL VE SURE
// ═══════════════════════════════════════════════════════════════════════════
async function z12(): Promise<void> {
  console.log('\n── Z1/Z2 · giden istek sinyal tasir, sure adlandirilmis sabitten ──');
  kayitlariSifirla();
  const iyz = await sahteIyzico(() => ({
    tur: 'cevapla',
    veri: { referenceCode: 'uc-0', subscriptionStatus: 'ACTIVE' },
  }));
  try {
    const c = istemci(iyz.taban);
    const get = await sureli(() => c.abonelikGetir('uc-0'));
    const post = await sureli(() => c.abonelikIptal('uc-0'));
    check(
      'Z1-OLCUT iki istek de sahte iyzico\'ya ulasti ve cevaplandi (GET + POST)',
      iyz.gelen.length === 2 && get.durum === 'deger' && post.durum === 'deger' && giden.length === 2,
      `gelen=${iyz.gelen.length} giden=${giden.length} get=${get.durum} post=${post.durum}`,
    );
    const [g, p] = giden;
    check('Z1a GET isteginde signal VAR', g?.signal instanceof AbortSignal, `signal=${String(g?.signal)}`);
    check('Z1b POST isteginde signal VAR', p?.signal instanceof AbortSignal, `signal=${String(p?.signal)}`);
    check(
      'Z1c giden sinyal zaman asimi sinyalinin KENDISI',
      !!g && g.signal === kurulanSinyaller[0] && !!p && p.signal === kurulanSinyaller[1],
      `kurulan=${kurulanSinyaller.length}`,
    );
    check(
      'Z1d her istek KENDI sinyalini kurar (paylasilan sinyal ilk dolusta sonraki her istegi oldururdu)',
      kurulanSinyaller.length === 2 && kurulanSinyaller[0] !== kurulanSinyaller[1],
      `kurulan=${kurulanSinyaller.length}`,
    );
    check(
      'Z2a sure adlandirilmis sabitten: AbortSignal.timeout(IYZICO_ZAMAN_ASIMI_MS)',
      kurulanSureler.length === 2 && kurulanSureler.every((ms) => ms === IYZICO_ZAMAN_ASIMI_MS),
      `istenen=${JSON.stringify(kurulanSureler)} sabit=${IYZICO_ZAMAN_ASIMI_MS}`,
    );
  } finally {
    await iyz.kapat();
  }

  // Sinir on yuz DOSYASINDAN okunur: sabit buradan turetilmez (dairesel olcut).
  const api = readFileSync(join(KOK, 'frontend/ortak/lib/api.ts'), 'utf8');
  const m = api.match(/export const VARSAYILAN_ZAMAN_ASIMI_MS = ([\d_]+);/);
  const onYuz = m ? Number(m[1].replace(/_/g, '')) : NaN;
  check('Z2-OLCUT on yuzun siradan istek siniri dosyadan okundu', Number.isFinite(onYuz) && onYuz > 0, `okunan=${m?.[1]}`);
  check(
    'Z2b ⭐ sabit on yuz sinirinin en az 5 sn ALTINDA (musteri bizim 502 mesajimizi gorur, tarayicinin zaman asimini degil)',
    IYZICO_ZAMAN_ASIMI_MS + 5_000 <= onYuz,
    `sabit=${IYZICO_ZAMAN_ASIMI_MS} onYuz=${onYuz}`,
  );
  check(
    'Z2c sabit en az 10 sn (cok kisa sure yavas ama basarili degisimi BELIRSIZE dusurur)',
    IYZICO_ZAMAN_ASIMI_MS >= 10_000,
    `sabit=${IYZICO_ZAMAN_ASIMI_MS}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Z3 · BASLIK GELMEZ
// ═══════════════════════════════════════════════════════════════════════════
async function z3(): Promise<void> {
  console.log('\n── Z3 · iyzico hic cevap vermezse istek KESILIR ──');
  kayitlariSifirla();
  const gunlukBasi = gunluk.length;
  const iyz = await sahteIyzico(() => ({ tur: 'takil' }));
  try {
    const r = await sureli(() => istemci(iyz.taban).paketDegistir('uc-0', { yeniPlanKodu: 'plan-x' }));
    check(
      'Z3-OLCUT istek iyzico\'ya ulasti ve basliklar HIC gelmedi',
      iyz.gelen.length === 1 && giden.length === 1 && giden[0].baslikGeldi === false,
      `gelen=${iyz.gelen.length} baslikGeldi=${giden[0]?.baslikGeldi}`,
    );
    check('Z3a ⭐ istek KESILDI (asili kalmadi)', r.durum === 'hata', `durum=${r.durum} ms=${r.ms}`);
    const h = r.hata;
    check('Z3b hata IyzicoHatasi', h instanceof IyzicoHatasi, ozet(h));
    check('Z3c ⭐ kod UNDEFINED — iyzico kod soylemedi, uydurulmaz', h instanceof IyzicoHatasi && h.kod === undefined, ozet(h));
    check('Z3d httpDurum yok (yanit gelmedi)', h instanceof IyzicoHatasi && h.httpDurum === undefined, ozet(h));
    check(
      'Z3i ⭐ zamanAsimi ISARETLI (paket degisimi / dunning bunu redden ayirir)',
      h instanceof IyzicoHatasi && h.zamanAsimi === true,
      ozet(h),
    );
    check('Z3e mesaj Turkce: "iyzico yanıt vermedi (zaman aşımı, …"', /^iyzico yanıt vermedi \(zaman aşımı, /.test(h?.message ?? ''), ozet(h));
    check('Z3f kesim ZAMAN ASIMINDA oldu (anlik baska hata degil)', r.ms >= KISA_MS * 0.8 && r.ms < BEKCI_MS, `ms=${r.ms}`);
    const kesildi = await bekle(() => iyz.gelen[0]?.kesildi === true);
    check('Z3g ⭐ baglanti GERCEKTEN kapandi: sunucu yanitlanmamis istegin soketinin kapandigini gordu', kesildi);
    check(
      'Z3h suzgec: 502 (kullanici duzeltemez) + mesajda uydurma "iyzico kodu" yok',
      iyzicoDurumunuHttpyeCevir(h?.httpDurum) === 502 && !!h?.message && kullaniciyaMesaj(h) === h.message,
      `durum=${iyzicoDurumunuHttpyeCevir(h?.httpDurum)} mesaj="${h ? kullaniciyaMesaj(h) : '-'}"`,
    );
    // Hata mesaji musteriye gider, iyzico ucu gitmez: hangi ucun takildigi
    // YALNIZ bu gunluk satirinda (istemci yorumu boyle diyor — olculur).
    const uyarilar = gunluk.slice(gunlukBasi).filter((s) => s.startsWith('WARN iyzico '));
    check(
      'Z3j takilan iyzico ucu gunlukte: yontem + yol',
      uyarilar.some((s) => s.includes('istek kesildi: POST /v2/subscription/subscriptions/uc-0/upgrade')),
      uyarilar.join(' | ') || '(uyari yok)',
    );
  } finally {
    await iyz.kapat();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Z4 · GOVDE YARIDA KALIR
// ═══════════════════════════════════════════════════════════════════════════
async function z4(): Promise<void> {
  console.log('\n── Z4 · basliklar gelip govde takilirsa da istek KESILIR ──');
  kayitlariSifirla();
  const iyz = await sahteIyzico(() => ({ tur: 'govde-yarim' }));
  try {
    const r = await sureli(() => istemci(iyz.taban).abonelikGetir('uc-0'));
    check(
      'Z4-OLCUT basliklar GELDI, takilan govde (govde asamasi olculuyor)',
      giden.length === 1 && giden[0].baslikGeldi === true,
      `baslikGeldi=${giden[0]?.baslikGeldi}`,
    );
    check('Z4a ⭐ govde takilinca da istek KESILDI', r.durum === 'hata', `durum=${r.durum} ms=${r.ms}`);
    const h = r.hata;
    check('Z4b kodsuz IyzicoHatasi', h instanceof IyzicoHatasi && h.kod === undefined, ozet(h));
    check('Z4f govde asamasinda da zamanAsimi ISARETLI', h instanceof IyzicoHatasi && h.zamanAsimi === true, ozet(h));
    check(
      'Z4c mesaj ZAMAN ASIMI der, "çözümlenemedi" DEMEZ (bozuk JSON sanilmaz)',
      /zaman aşımı/.test(h?.message ?? '') && !/çözümlenemedi/.test(h?.message ?? ''),
      ozet(h),
    );
    check('Z4d httpDurum yok (200 gelmis olsa da suzgec 502 versin)', h instanceof IyzicoHatasi && h.httpDurum === undefined, ozet(h));
    check('Z4e baglanti kapandi', await bekle(() => iyz.gelen[0]?.kesildi === true));
  } finally {
    await iyz.kapat();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Z5 · NORMAL YOL VE AG HATASI DEGISMEDI
// ═══════════════════════════════════════════════════════════════════════════
async function z5(): Promise<void> {
  console.log('\n── Z5 · normal yanit ve ag hatasi davranisi degismedi ──');
  kayitlariSifirla();
  const iyz = await sahteIyzico((_metot, yol) => {
    if (yol.endsWith('/kopar')) return { tur: 'kopar' };
    if (yol.endsWith('/reddet')) return { tur: 'reddet', kod: '201406', mesaj: 'Abonelik farklı ödeme sıklığına sahip ödeme plana yükseltilemez.' };
    return { tur: 'cevapla', veri: { referenceCode: 'uc-0', subscriptionStatus: 'ACTIVE' } };
  });
  const beklenmeyen: unknown[] = [];
  const dinle = (e: unknown) => beklenmeyen.push(e);
  process.on('unhandledRejection', dinle);
  process.on('uncaughtException', dinle);
  try {
    const r = await sureli(() => istemci(iyz.taban).abonelikGetir('uc-0'));
    check(
      'Z5a normal yanit etkilenmedi (veri dondu)',
      r.durum === 'deger' && r.deger?.subscriptionStatus === 'ACTIVE',
      `durum=${r.durum} ${r.durum === 'hata' ? ozet(r.hata) : ''}`,
    );
    const sinyal = kurulanSinyaller[kurulanSinyaller.length - 1];
    await bekle(() => sinyal?.aborted === true, KISA_MS * 4);
    check(
      'Z5b sure YANITTAN SONRA dolunca yan etki yok (islenmemis red / istisna 0)',
      sinyal?.aborted === true && beklenmeyen.length === 0,
      `sinyalDustu=${sinyal?.aborted} beklenmeyen=${beklenmeyen.map(ozet).join(' | ')}`,
    );

    // Ag hatasi: sure UZUN kurulur ki hata zaman asimindan once gelsin.
    sinyalSuresi = BEKCI_MS;
    const k = await sureli(() => istemci(iyz.taban).abonelikGetir('kopar'));
    const kSinyal = kurulanSinyaller[kurulanSinyaller.length - 1];
    check(
      'Z5c-OLCUT baglanti koparildi, hata zaman asimi DOLMADAN geldi',
      k.durum === 'hata' && kSinyal?.aborted === false,
      `durum=${k.durum} ms=${k.ms} sinyalDustu=${kSinyal?.aborted}`,
    );
    check(
      'Z5c ag hatasi "zaman aşımı" diye ETIKETLENMEDI (hata aynen atildi)',
      k.durum === 'hata' && !(k.hata instanceof IyzicoHatasi) && !/zaman aşımı/.test(k.hata?.message ?? ''),
      ozet(k.hata),
    );

    // Gercek iyzico reddi (status: failure + kod): isaret TASIMAZ — yoksa
    // paket degisimi / dunning kesin reddi "sonuc bilinmiyor" sanardi.
    const red = await sureli(() => istemci(iyz.taban).abonelikGetir('reddet'));
    check(
      'Z5d gercek iyzico reddi: kodlu IyzicoHatasi, zamanAsimi ISARETSIZ',
      red.durum === 'hata' && red.hata instanceof IyzicoHatasi && red.hata.kod === '201406' && red.hata.zamanAsimi === false,
      ozet(red.hata),
    );
  } finally {
    process.off('unhandledRejection', dinle);
    process.off('uncaughtException', dinle);
    await iyz.kapat();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Z6 · BAGLANTI: PAKET DEGISIMI (gercek istemci + gercek servis)
// ═══════════════════════════════════════════════════════════════════════════
const GUN = 86_400_000;
const PAKETLER: Record<string, { haklar: Record<string, unknown>; tutar: string }> = {
  'basic-mek': {
    haklar: { seviye: 'core', kapsam: 'mechanical', kullaniciHakki: 1, dwgAktif: false, aylikTeklifHakki: null },
    tutar: '1299.00',
  },
  'pro-mek': {
    haklar: { seviye: 'pro', kapsam: 'mechanical', kullaniciHakki: 2, dwgAktif: true, aylikTeklifHakki: null },
    tutar: '1649.00',
  },
};

/** Sahte `PaketSurumu` (paket-degisimi-test ile ayni bicim). */
function surum(kod: string): any {
  const { haklar, tutar } = PAKETLER[kod];
  return {
    id: `s-${kod}`,
    paketId: `p-${kod}`,
    surumNo: 2,
    satistaMi: true,
    periyot: 'MONTHLY',
    periyotAdedi: 1,
    iyzicoUrunKodu: 'urun-tek',
    iyzicoPlanKodu: `plan-${kod}`,
    iyzicoDenemesizPlanKodu: `plan-${kod}-denemesiz`,
    denemeGunu: 30,
    paraBirimi: 'TRY',
    tutar: { toFixed: (n: number) => Number(tutar).toFixed(n), toString: () => tutar },
    paket: { kod, ad: `Paket ${kod}`, ...haklar },
  };
}

/** Tek firmali sahte Prisma: yalniz `degistir` yolunun dokundugu cagrilar. */
function sahteDb() {
  const surumler = [surum('basic-mek'), surum('pro-mek')];
  const satir: Record<string, any> = {
    id: 'ab1',
    firmaId: 'f1',
    paketSurumuId: 's-basic-mek',
    planliPaketSurumuId: null,
    paketGecisTarihi: null,
    durum: AbonelikDurumu.AKTIF,
    erisimSonu: new Date(Date.now() + 20 * GUN),
    denemeSonu: null,
    odemeYontemi: 'KART',
    iyzicoAbonelikKodu: 'uc-0',
    iyzicoKokKodu: 'uc-0',
    iyzicoMusteriKodu: 'm-1',
    iyzicoDurum: 'ACTIVE',
    odenenPaketSurumuId: null,
  };
  const olaylar: Record<string, any>[] = [];
  const dolu = () => ({ ...satir, paketSurumu: surumler.find((s) => s.id === satir.paketSurumuId) });
  const db: any = {
    satir,
    olaylar,
    abonelik: {
      findUnique: async ({ where }: any) => (where.firmaId === satir.firmaId || where.id === satir.id ? dolu() : null),
      update: async ({ where, data }: any) => {
        if (where.id !== satir.id) throw new Error('update: satir yok');
        Object.assign(satir, data);
        return dolu();
      },
      // Degisimin son yazimi KOSULLU (`updateMany`): `where` GERCEKTEN
      // uygulanir (`in` ve NULL kolon dahil); tutmazsa count 0 -> cekirdek 409.
      updateMany: async ({ where, data }: any) => {
        const tutar = Object.entries(where).every(([k, v]: [string, any]) =>
          v !== null && typeof v === 'object' && Array.isArray(v.in)
            ? v.in.includes(satir[k])
            : (satir[k] ?? null) === v,
        );
        if (!tutar) return { count: 0 };
        Object.assign(satir, data);
        return { count: 1 };
      },
    },
    paketSurumu: {
      findUnique: async ({ where }: any) => surumler.find((s) => s.id === where.id) ?? null,
      findFirst: async () => null,
    },
    abonelikOlayi: {
      create: async ({ data }: any) => {
        olaylar.push(data);
        return data;
      },
    },
    // Adres yok: degisim maili ATLANIR (e-posta bu kapinin konusu degil).
    firma: { findUnique: async () => null },
    $transaction: async (fn: any) => fn(db),
  };
  return db;
}

const UPGRADE = 'POST /v2/subscription/subscriptions/uc-0/upgrade';
const DOGRULA = 'GET /v2/subscription/subscriptions/uc-0';

async function z6(): Promise<void> {
  console.log('\n── Z6 · BAGLANTI: paket degisimi zaman asiminda BELIRSIZ dala girer, sira cozulur ──');
  kayitlariSifirla();
  let yukseltme = 0;
  const iyz = await sahteIyzico((metot, yol) => {
    const istek = `${metot} ${yol}`;
    if (istek === UPGRADE) {
      yukseltme++;
      // Ilk istek takilir; sirada bekleyen ikinci istek cevap alir.
      return yukseltme === 1
        ? { tur: 'takil' }
        : {
            tur: 'cevapla',
            veri: {
              referenceCode: 'uc-1',
              parentReferenceCode: 'uc-0',
              subscriptionStatus: 'ACTIVE',
              startDate: Date.now() + 20 * GUN,
            },
          };
    }
    // Dogrulama: kayitli uc iyzico'da hala CANLI GORUNUYOR. Ag hatasinda bu
    // "degismedi" (kesin) olurdu; zaman asiminda DEGIL — yukseltme hala
    // isleniyor olabilir (soru kesilen istegin hemen ardindan soruluyor).
    if (istek === DOGRULA) {
      return {
        tur: 'cevapla',
        veri: { referenceCode: 'uc-0', customerReferenceCode: 'm-1', subscriptionStatus: 'ACTIVE' },
      };
    }
    return { tur: 'kopar' }; // beklenmeyen istek sessiz basari uretmesin
  });
  try {
    const db = sahteDb();
    const c = istemci(iyz.taban);
    const ab = new AbonelikServisi(db, c);
    const pd = new PaketDegisimiServisi(db, c, ab, { gonder: async () => undefined } as any, {
      get: () => undefined,
    } as any);
    const istek = () =>
      pd.degistir({ firmaId: 'f1', kullaniciId: 'u1', paketSurumuId: 's-pro-mek', sozlesmeOnayi: true });

    // Ayni firmadan IKI istek ayni anda: ikincisi firma sirasinda bekler.
    const [r1, r2] = await Promise.all([sureli(istek), sureli(istek)]);
    const sira = iyz.gelen.map((g) => `${g.metot} ${g.yol}`);
    const yukseltmeler = iyz.gelen.filter((g) => `${g.metot} ${g.yol}` === UPGRADE);

    check(
      'Z6-OLCUT fikstur degisim yolunu surdu: iyzico\'ya giden ilk istek yukseltme',
      sira[0] === UPGRADE,
      `sira=${JSON.stringify(sira)}`,
    );
    const r1Durum = typeof r1.hata?.getStatus === 'function' ? r1.hata.getStatus() : null;
    const r1Govde = typeof r1.hata?.getResponse === 'function' ? r1.hata.getResponse() : null;
    check(
      'Z6a ilk istek zaman asiminda KESILDI ve sonuclandi (asili kalmadi)',
      r1.durum === 'hata',
      `durum=${r1.durum} ms=${r1.ms}`,
    );
    check(
      'Z6b ⭐ BELIRSIZ dal kostu: zaman asimindan sonra iyzico\'ya SORULDU (kesin redde sorulmaz)',
      sira[1] === DOGRULA,
      `sira=${JSON.stringify(sira)}`,
    );
    check(
      'Z6c ⭐ kayitli uc canli GORUNSE de "degismedi" DENMEDI (zaman asimi): 503 DEGISIM_DOGRULANAMADI',
      r1Durum === 503 && r1Govde?.kod === 'DEGISIM_DOGRULANAMADI',
      `durum=${r1Durum} govde=${JSON.stringify(r1Govde)}`,
    );
    const olay = db.olaylar.find((o: any) => o.tip === 'paket.degisim.belirsiz');
    check(
      'Z6d belirsiz olay kaydi: iyzicoKodu NULL (uydurma kod yok), mesaj ve neden zaman asimi',
      !!olay &&
        olay.veri?.iyzicoKodu === null &&
        /zaman aşımı/.test(olay.veri?.iyzicoMesaji ?? '') &&
        /zaman asimi/.test(olay.veri?.neden ?? ''),
      JSON.stringify(olay?.veri),
    );
    // Sira OLCUTU: ikinci istek birinci SONUCLANMADAN yola cikmadi. Yoksa Z6f
    // sira olmadan da yesil kalirdi (dogrulama GET'ine bakilmaz — o Z6b'nin isi).
    check(
      'Z6e-OLCUT ikinci istek sirada BEKLEDI: yukseltmesi birinci istek sonuclandiktan SONRA geldi',
      yukseltmeler.length === 2 && yukseltmeler[1].an >= r1.bitti,
      `yukseltme=${yukseltmeler.length} ikinciVaris=${yukseltmeler[1]?.an} birinciBitti=${r1.bitti}`,
    );
    check(
      'Z6f ⭐ firma SIRASI cozuldu: bekleyen ikinci istek sonuclandi (asili kalmadi)',
      r2.durum !== 'asili',
      `durum=${r2.durum} ms=${r2.ms}`,
    );
    check(
      'Z6g ikinci istek islendi: yeni uc uc-1, etkin paket pro-mek',
      r2.durum === 'deger' && db.satir.iyzicoAbonelikKodu === 'uc-1' && db.satir.paketSurumuId === 's-pro-mek',
      `durum=${r2.durum} ${r2.durum === 'hata' ? ozet(r2.hata) : ''} uc=${db.satir.iyzicoAbonelikKodu} paket=${db.satir.paketSurumuId}`,
    );
  } finally {
    await iyz.kapat();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Z7 · BAGLANTI: DUNNING YENIDEN DENEMESI (gercek istemci + gercek servis)
// ═══════════════════════════════════════════════════════════════════════════
const YENIDEN_DENE = 'POST /v2/subscription/operation/retry';

interface DunningSecenek {
  /** Kac gunluk tarama art arda kosulsun (ayni DB, ayni servis). */
  tarama?: number;
  /** Bu tipte olay yazilirken sahte DB hata firlatir. */
  olayHatasi?: string;
  /** Taramadan ONCE var olan olaylar (onceki basamaklardan). */
  onOlaylar?: Record<string, any>[];
}

/** Tek abonelikli sahte Prisma: varsayilan merdivenin 3. gun basamagi. */
function dunningDb(secenek: DunningSecenek = {}) {
  const satir: Record<string, any> = {
    id: 'ab1',
    firmaId: 'f1',
    durum: AbonelikDurumu.ODEME_BEKLIYOR,
    odemeYontemi: 'KART',
    // 3,5 gun once: 3. gun basamagi = yeniden dene, olmazsa 'ikinci' bildirimi.
    ilkBasarisizlik: new Date(Date.now() - 3.5 * GUN),
    denemeSayisi: 1, // ilk bildirim gitmis
    sonDeneme: null,
    iyzicoAbonelikKodu: 'uc-0',
    paketSurumu: { tutar: 1299, paraBirimi: 'TRY', paket: { ad: 'Paket basic-mek' } },
  };
  const olaylar: Record<string, any>[] = [...(secenek.onOlaylar ?? [])];
  const guncellemeler: Record<string, any>[] = [];
  const db: any = {
    satir,
    olaylar,
    guncellemeler,
    abonelik: {
      findMany: async () => [{ id: satir.id }],
      findUnique: async ({ where }: any) => (where.id === satir.id ? { ...satir } : null),
      update: async ({ where, data }: any) => {
        if (where.id !== satir.id) throw new Error('update: satir yok');
        guncellemeler.push(data);
        Object.assign(satir, data);
        return { ...satir };
      },
    },
    firma: { findUnique: async () => ({ ad: 'Firma A', faturaEposta: 'fatura@firma.test', yetkiliEposta: null }) },
    // Basarisizlik webhook'unun siparis kodu: yeniden denenecek siparis.
    webhookOlayi: { findFirst: async () => ({ siparisKodu: 'sip-1' }) },
    abonelikOlayi: {
      create: async ({ data }: any) => {
        if (data.tip === secenek.olayHatasi) throw new Error(`sahte DB: ${data.tip} yazilamadi`);
        const kayit = { olusturuldu: new Date(), ...data }; // Prisma varsayilani now()
        olaylar.push(kayit);
        return kayit;
      },
      // `where` GERCEKTEN uygulanir: abonelik + tip + olusturuldu >= gte.
      count: async ({ where }: any) =>
        olaylar.filter(
          (o) =>
            o.abonelikId === where.abonelikId &&
            o.tip === where.tip &&
            (!where.olusturuldu?.gte || o.olusturuldu.getTime() >= where.olusturuldu.gte.getTime()),
        ).length,
    },
  };
  return db;
}

/** Gunluk taramayi GERCEK servisle kosar; iyzico'nun yeniden deneme ucu `davranis`i uygular. */
async function dunningKos(davranis: Davranis, secenek: DunningSecenek = {}) {
  const iyz = await sahteIyzico((metot, yol) => (`${metot} ${yol}` === YENIDEN_DENE ? davranis : { tur: 'kopar' }));
  try {
    const db = dunningDb(secenek);
    const postalar: any[] = [];
    const c = istemci(iyz.taban);
    const dunning = new DunningServisi(
      db,
      c,
      new AbonelikServisi(db, c),
      { gonder: async (m: any) => void postalar.push(m) } as any,
      { get: () => undefined } as any,
    );
    const taramalar: { posta: number; denemeSayisi: number }[] = [];
    let r: Awaited<ReturnType<typeof sureli>> = { durum: 'asili', ms: 0, bitti: 0 };
    for (let i = 0; i < (secenek.tarama ?? 1); i++) {
      r = await sureli(() => dunning.merdiveniYurut());
      taramalar.push({ posta: postalar.length, denemeSayisi: db.satir.denemeSayisi });
    }
    return { db, postalar, gelen: iyz.gelen.map((g) => `${g.metot} ${g.yol}`), r, taramalar };
  } finally {
    await iyz.kapat();
  }
}

async function z7(): Promise<void> {
  console.log('\n── Z7 · BAGLANTI: dunning yeniden denemesi zaman asiminda bildirim GONDERMEZ ──');
  kayitlariSifirla();

  // Zaman asimi: iyzico yeniden denemeyi yapmis OLABILIR — sonuc webhook'la gelir.
  const za = await dunningKos({ tur: 'takil' });
  check(
    'Z7-OLCUT fikstur 3. gun basamagini surdu: yeniden deneme istegi iyzico\'ya gitti, tarama bitti',
    za.gelen.length === 1 && za.gelen[0] === YENIDEN_DENE && za.r.durum === 'deger',
    `gelen=${JSON.stringify(za.gelen)} durum=${za.r.durum}`,
  );
  check('Z7a ⭐ zaman asiminda "odemeniz alinamadi" bildirimi GITMEDI', za.postalar.length === 0, `posta=${za.postalar.length}`);
  check(
    'Z7b ⭐ basamak islenmis SAYILMADI (yarinki tarama taze bilgiyle yeniden degerlendirir)',
    za.db.satir.denemeSayisi === 1 && za.db.guncellemeler.length === 0,
    `denemeSayisi=${za.db.satir.denemeSayisi} guncelleme=${JSON.stringify(za.db.guncellemeler)}`,
  );
  const iz = za.db.olaylar.find((o: any) => o.tip === 'dunning.tekrar.belirsiz');
  check(
    'Z7c iz olay kaydinda: dunning.tekrar.belirsiz + zaman asimi',
    !!iz && /zaman aşımı/.test(iz.aciklama ?? ''),
    JSON.stringify(za.db.olaylar.map((o: any) => o.tip)),
  );

  // KONTROL — gercek red: eski davranis (bildirim gider, basamak islenir).
  const red = await dunningKos({ tur: 'reddet', kod: 'RED-TEST', mesaj: 'Kart reddedildi' });
  check(
    'Z7d gercek red: "ikinci" bildirimi GITTI ve basamak islendi (eski davranis korundu)',
    red.postalar.length === 1 &&
      red.db.satir.denemeSayisi === 2 &&
      red.db.olaylar.some((o: any) => o.tip === 'dunning.eposta.ikinci'),
    `posta=${red.postalar.length} denemeSayisi=${red.db.satir.denemeSayisi} olaylar=${JSON.stringify(red.db.olaylar.map((o: any) => o.tip))}`,
  );

  // KONTROL — basarili yanit: sonuc webhook'la gelir; bildirim yok, basamak islenir.
  const tamam = await dunningKos({ tur: 'cevapla', veri: {} });
  check(
    'Z7e basarili yanit: bildirim YOK, basamak islendi, "dunning.tekrar.denendi" (eski davranis)',
    tamam.postalar.length === 0 &&
      tamam.db.satir.denemeSayisi === 2 &&
      tamam.db.olaylar.some((o: any) => o.tip === 'dunning.tekrar.denendi'),
    `posta=${tamam.postalar.length} denemeSayisi=${tamam.db.satir.denemeSayisi}`,
  );

  // Ayni basamakta IKINCI zaman asimi: erteleme hakki kullanildi → bildirim
  // gider. Sinirsiz erteleme her gun yeni bir deneme ve hic gitmeyen on
  // uyarilar demekti (inceleme 24.09).
  const iki = await dunningKos({ tur: 'takil' }, { tarama: 2 });
  check(
    'Z7f-OLCUT iki tarama da yeniden denedi; ilk taramada bildirim gitmedi',
    iki.gelen.filter((g) => g === YENIDEN_DENE).length === 2 && iki.taramalar[0]?.posta === 0,
    `gelen=${JSON.stringify(iki.gelen)} taramalar=${JSON.stringify(iki.taramalar)}`,
  );
  check(
    'Z7f ⭐ ayni basamakta IKINCI zaman asimi: bildirim GITTI, basamak islendi (sinirsiz erteleme yok)',
    iki.postalar.length === 1 &&
      iki.db.satir.denemeSayisi === 2 &&
      iki.db.olaylar.filter((o: any) => o.tip === 'dunning.tekrar.belirsiz').length === 1,
    `posta=${iki.postalar.length} denemeSayisi=${iki.db.satir.denemeSayisi} olaylar=${JSON.stringify(iki.db.olaylar.map((o: any) => o.tip))}`,
  );

  // Onceki basamaktaki erteleme (bu dongude, basamak basindan ONCE) bu
  // basamagin hakkini YEMEZ: ilk zaman asimi yine ertelenir.
  const onceki = await dunningKos(
    { tur: 'takil' },
    {
      onOlaylar: [
        { abonelikId: 'ab1', tip: 'dunning.tekrar.belirsiz', aciklama: 'onceki basamak', olusturuldu: new Date(Date.now() - 3 * GUN) },
      ],
    },
  );
  check(
    'Z7h onceki basamagin ertelemesi bu basamagin hakkini yemedi (ilk zaman asimi yine ertelendi)',
    onceki.gelen.length === 1 && onceki.postalar.length === 0 && onceki.db.satir.denemeSayisi === 1,
    `gelen=${onceki.gelen.length} posta=${onceki.postalar.length} denemeSayisi=${onceki.db.satir.denemeSayisi}`,
  );

  // `try` yalniz iyzico cagrisini sarar: BASARILI denemeden sonra DB yazmasi
  // duserse bu red degildir — "tekrar denedik, yine alinamadi" GITMEMELI.
  const gunlukBasi = gunluk.length;
  const dbHata = await dunningKos({ tur: 'cevapla', veri: {} }, { olayHatasi: 'dunning.tekrar.denendi' });
  check(
    'Z7g-OLCUT yeniden deneme iyzico\'da basarili, ardindan olay yazmasi DUSTU',
    dbHata.gelen.length === 1 && gunluk.slice(gunlukBasi).some((s) => s.includes('dunning.tekrar.denendi yazilamadi')),
    gunluk.slice(gunlukBasi).join(' | ').slice(0, 300) || '(gunluk bos)',
  );
  check(
    'Z7g basarili denemeden sonraki DB hatasi "yine alinamadi" e-postasina DONMEDI',
    dbHata.postalar.length === 0,
    `posta=${dbHata.postalar.length}`,
  );
}

/** Bir blokta cokme sonrakileri GIZLEMESIN: hata o blogun kirmizisi olur, kosu surer. */
async function blok(ad: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    check(`${ad} blogu — BEKLENMEDIK HATA (blok yarida kaldi)`, false, e?.message ?? String(e));
  }
}

async function main(): Promise<void> {
  aracilariKur();
  try {
    await blok('Z1/Z2', z12);
    await blok('Z3', z3);
    await blok('Z4', z4);
    await blok('Z5', z5);
    await blok('Z6', z6);
    await blok('Z7', z7);
  } finally {
    aracilariSok();
  }

  bitti = true;
  console.log(`\n${'═'.repeat(64)}\n  IYZICO ZAMAN ASIMI: ${passed} PASS, ${failed} FAIL\n${'═'.repeat(64)}`);
  if (failed > 0) {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    // Servisler hatayi yakalayip gunluge yazar: teshis icin son satirlar.
    console.log('\n  Son gunluk satirlari:');
    gunluk.slice(-15).forEach((s) => console.log(`    ${s.slice(0, 240)}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  bitti = true;
  console.error('BEKLENMEDIK HATA:', e);
  process.exitCode = 1;
});
