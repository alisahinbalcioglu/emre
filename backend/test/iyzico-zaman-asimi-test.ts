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
 * KODSUZ olmali ki paket degisimi onu BELIRSIZ sayip iyzico'ya sorsun. Z6 bunu
 * GERCEK istemci + GERCEK `PaketDegisimiServisi` ile olcer (sahte olan yalniz
 * Prisma ve iyzico'nun kendisi).
 *
 * ── OLCULEN ────────────────────────────────────────────────────────────
 *   Z1 giden istekte `signal` var (GET + POST); o sinyal zaman asimi sinyali,
 *      her istegin KENDI sinyali
 *   Z2 sure ADLANDIRILMIS sabitten; sabit on yuzun siradan istek sinirinin
 *      (dosyadan okunur) en az 5 sn altinda ve 10 sn'den kisa degil
 *   Z3 ⭐ baslik gelmezse istek KESILIR: kodsuz IyzicoHatasi, Turkce mesaj,
 *      sunucu baglantinin kapandigini gorur; suzgec 502 + uydurma kodsuz mesaj
 *   Z4 govde yarida kalirsa da kesilir ("cozumlenemedi" DEGIL)
 *   Z5 normal yanit etkilenmez, sure sonradan dolunca yan etki yok; ag hatasi
 *      "zaman asimi" diye ETIKETLENMEZ (o davranis degismedi)
 *   Z6 ⭐ BAGLANTI: paket degisiminde zaman asimi BELIRSIZ dala girer (iyzico'ya
 *      sorulur, olayda iyzicoKodu null) ve firma sirasi COZULUR — ayni firmanin
 *      bekleyen istegi islenir
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

Logger.overrideLogger(false);

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
    ? `IyzicoHatasi kod=${h.kod} httpDurum=${h.httpDurum} mesaj="${h.message}"`
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
    check('Z3e mesaj Turkce: "iyzico yanıt vermedi (zaman aşımı, …"', /^iyzico yanıt vermedi \(zaman aşımı, /.test(h?.message ?? ''), ozet(h));
    check('Z3f kesim ZAMAN ASIMINDA oldu (anlik baska hata degil)', r.ms >= KISA_MS * 0.8 && r.ms < BEKCI_MS, `ms=${r.ms}`);
    const kesildi = await bekle(() => iyz.gelen[0]?.kesildi === true);
    check('Z3g ⭐ baglanti GERCEKTEN kapandi: sunucu yanitlanmamis istegin soketinin kapandigini gordu', kesildi);
    check(
      'Z3h suzgec: 502 (kullanici duzeltemez) + mesajda uydurma "iyzico kodu" yok',
      iyzicoDurumunuHttpyeCevir(h?.httpDurum) === 502 && !!h?.message && kullaniciyaMesaj(h) === h.message,
      `durum=${iyzicoDurumunuHttpyeCevir(h?.httpDurum)} mesaj="${h ? kullaniciyaMesaj(h) : '-'}"`,
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
  const iyz = await sahteIyzico((_metot, yol) =>
    yol.endsWith('/kopar')
      ? { tur: 'kopar' }
      : { tur: 'cevapla', veri: { referenceCode: 'uc-0', subscriptionStatus: 'ACTIVE' } },
  );
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
    // Dogrulama: kayitli uc iyzico'da hala CANLI → degisim OLMADI (kesin).
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
      'Z6c dogrulama "degismedi" dedi → 502 SAGLAYICI_DEGISIM_HATASI',
      r1Durum === 502 && r1Govde?.kod === 'SAGLAYICI_DEGISIM_HATASI',
      `durum=${r1Durum} govde=${JSON.stringify(r1Govde)}`,
    );
    const olay = db.olaylar.find((o: any) => o.tip === 'paket.degisim.basarisiz');
    check(
      'Z6d olay kaydinda iyzicoKodu NULL (uydurma kod yok) ve mesaj zaman asimi',
      !!olay && olay.veri?.iyzicoKodu === null && /zaman aşımı/.test(olay.veri?.iyzicoMesaji ?? ''),
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
  } finally {
    aracilariSok();
  }

  bitti = true;
  console.log(`\n${'═'.repeat(64)}\n  IYZICO ZAMAN ASIMI: ${passed} PASS, ${failed} FAIL\n${'═'.repeat(64)}`);
  if (failed > 0) {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  bitti = true;
  console.error('BEKLENMEDIK HATA:', e);
  process.exitCode = 1;
});
