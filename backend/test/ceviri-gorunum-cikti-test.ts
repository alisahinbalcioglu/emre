/**
 * FAZ 6.10 / 6.11 — ÖDENMİŞ İÇERİK KANITI + GÖRÜNTÜLEME + İNGİLİZCE ÇIKTI KAPISI
 *   (`npm run test:ceviri-gorunum-cikti`)
 *
 * DB'siz, deterministik (sahte Prisma: `ceviri-sahte-db.ts`). Bloklar:
 *  O) ÖZET v2 — çoklu küme: sıra/sayfa/miktar duyarsız, ad/adet duyarlı; v1
 *     (eskiOzet) değişiklikten önce ölçülmüş taban sabitine eşit.
 *  S) SATIR KAYNAĞI — bayat işaret (`_ceviriSonucu`) ve ekran-dosya ikiz fikstürü.
 *  P) KANIT — ödenmiş içerik penceresiz BASARILI ya da geçiş izni; eski KISMI,
 *     BASARISIZ, başka firma/teklif/dil kanıt DEĞİL; neden yalan söylemez.
 *  Z) ZİNCİR — ödenmiş içerik tekrardır (pencere yok), içerik değişince yeni.
 *  G) GÖRÜNTÜLEME — yan etkisiz, yeteneksiz; harita yalnız ödenmiş+tam içerikte.
 *  X) DIŞA AKTARIM — gerçek QuotesService + CeviriService + CeviriKotaServisi;
 *     R1-B6 tablosu + Emre 15.09 kararı ("tam değilse çevirmesin"): karışık
 *     dilli dosya ÜRETİLMEZ; kapı rev/arşivden ÖNCE.
 *  H) HATA GÖVDESİ — gerçek controller ve gerçek HTTP: 403/409/422 gövdesi birebir.
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 1 = FAIL (`process.exitCode`, Windows dersi).
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { Controller, Get, Module, Res } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  CEVIRI_KAYNAK_ALANI,
  CEVIRI_SONUC_ALANI,
  ceviriIcerigi,
  disaAktarimPlani,
  kayittaKaynakDuruyorMu,
  satirKaynagi,
} from '../src/ozellik/giris/ai/ceviri-kurali';
import {
  CIKTI_KAPISI_METNI,
  ceviriKapisiReddi,
  ceviriTamamlanamadiHatasi,
  gecisAnahtari,
} from '../src/ozellik/odeme/abonelik/ceviri-kotasi';
import { CeviriKotaServisi } from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { CeviriService, KAYIT_INDIRGEME_UYARISI } from '../src/ozellik/giris/ai/ceviri.service';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { QuotesController } from '../src/ozellik/teklif/quotes/quotes.controller';
import { YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { sahteDb, type Kayit } from './ceviri-sahte-db';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

async function hata(fn: () => Promise<unknown>): Promise<any> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}
const yanit = (e: any) => (typeof e?.getResponse === 'function' ? e.getResponse() : {});
const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const DK = 60_000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
const Q = '8a2f4a4e-2b7c-4a55-9d0e-0f6f3c1b2a10';
const Q_BASKA = '5d1c7e2a-0b3f-4c8d-9e6a-7f2b1c0d9e8f';
// 23.09: teklif kapsami ACIK — bu paket izin DEGIL ceviri olcer.
const K1 = { userId: 'u1', firmaId: 'f1', teklifKapsami: 'firma' as const };

/**
 * Ekran-dosya ikiz fikstürü (ön yüz `ceviri.test.ts` S10 AYNI dosyayı koşar).
 * Varsayılan hâlinde: değişecek 3 (PVC BORU ×2, KABLO KANALI), karşılıksız 2
 * (bayat KIRMIZI VANA, BAKIR BORU), İngilizce kayıtlı 1 (STEEL PIPE), özdeş
 * GEBERIT, dokunulmaz DN 20.
 */
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../../test-fixtures/ceviri-gorunum-ikizi.json'), 'utf8'));
/**
 * O6: T1 değişikliğinden ÖNCE, taban `ceviriIcerigi` (e8bf0ca) ile fikstürün
 * `_ceviriSonucu` taşımayan hâlinden ölçüldü (scratchpad blok1/T1/o6-olc.js).
 * Canlıdaki 14.09 sonrası tüketim kayıtları bu tanımla yazıldı.
 */
const O6_TABAN_OZETI = '04afe5050c1a9589ae21c0fae4db0ee6b4cf84f0f5a17b519f9f2df95a1a9ae8';

const ROLLER = FX.sayfalar[0].columnRoles;
const satir = (ad: string, ek: Kayit = {}): Kayit => ({ _isDataRow: true, _no: '1', _ad: ad, _miktar: 1, _birim: 'Ad.', _matBirim: '10', _matToplam: '10', _labBirim: '', _labToplam: '', ...ek });
const sayfa = (satirlar: Kayit[], ek: Kayit = {}): Kayit => ({ index: 0, name: 'Mekanik', isEmpty: false, columnRoles: ROLLER, rowData: satirlar, ...ek });
const adlar = (...a: string[]) => [sayfa(a.map((x) => satir(x)))];

/** Önbellek eksiği kapatılmış varsayılan: değişecek 5, karşılıksız 0. */
const TAM_ONBELLEK: Record<string, string> = { ...FX.onbellek, 'KIRMIZI VANA': 'RED VALVE', 'BAKIR BORU': 'COPPER PIPE' };

function tuketim(ek: Kayit): Kayit {
  const olusturuldu: Date = ek.olusturuldu ?? new Date(Date.now() - SAAT);
  const durum: string = ek.durum ?? 'BASARILI';
  return {
    id: `tk-${Math.random().toString(36).slice(2)}`,
    firmaId: 'f1', userId: 'u1', abonelikId: 'ab-1', paketKodu: 'pro-mek',
    quoteId: Q, hedefDil: 'en', metinSayisi: 0, icerikOzeti: 'baska-icerik',
    satirSayisi: 3, dusulenSatir: 3, toplamTeslim: 3, devam: false, durum, olusturuldu, hata: null,
    sonuclandi: durum === 'ISLENIYOR' ? null : new Date(olusturuldu.getTime() + DK),
    ...ek,
  };
}

interface SahneAyari {
  sheets?: unknown;
  onbellek?: Record<string, string>;
  tuketim?: Kayit[];
  ayarlar?: Record<string, string>;
  displayLanguage?: string;
  firmaId?: string;
}

/** Gerçek servisler + sahte Prisma. Casuslar: çeviri, kanıt, rezervasyon, dışa aktarım kararı. */
function sahne(o: SahneAyari = {}) {
  const quote: Kayit = {
    id: Q, firmaId: o.firmaId ?? 'f1', title: 'Çeviri Turu', sheets: o.sheets ?? kopya(FX.sayfalar),
    originalFile: Buffer.from('x'), quoteNo: null, rev: 0, musteri: 'Müşteri A.Ş.', proje: 'Proje',
    hazirlayan: 'H', gecerlilik: '30 gün', exportOverrides: null, displayCurrency: 'TRY',
    displayLanguage: o.displayLanguage ?? 'tr', formatId: null, updatedAt: new Date(),
  };
  const s = sahteDb({
    quote: [quote],
    translation: Object.entries(o.onbellek ?? FX.onbellek).map(([sourceText, translatedText]) => ({
      sourceText, targetLang: 'en', translatedText, kaynak: 'ai', createdAt: new Date(),
    })),
    ceviriTuketimi: o.tuketim ?? [],
    systemSettings: Object.entries(o.ayarlar ?? {}).map(([key, value]) => ({ key, value })),
    abonelik: [{
      id: 'ab-1', firmaId: 'f1', olusturuldu: new Date(Date.now() - 3 * GUN),
      paketSurumu: { periyot: 'MONTHLY', periyotAdedi: 1, paket: { kod: 'pro-mek', seviye: 'pro', kapsam: 'mechanical' } },
    }],
    user: [{ id: 'u1', emailVerified: true }],
    firma: [{ id: 'f1', ad: 'Firma A' }],
  });
  const kota = new CeviriKotaServisi(s.db);
  const gunluk: string[] = [];
  (kota as any).logger = { log: (m: string) => gunluk.push(`log:${m}`), warn: (m: string) => gunluk.push(`warn:${m}`), error: (m: string) => gunluk.push(`error:${m}`) };
  const aiKayitlari: unknown[] = [];
  const ceviri = new CeviriService(s.db, { logUsage: async (x: unknown) => { aiKayitlari.push(x); } } as any, kota);
  const sayac = { cevir: 0, kanit: 0, rezerve: 0, disaAktarim: 0 };
  const sar = (nesne: any, metot: string, anahtar: keyof typeof sayac) => {
    const asil = nesne[metot].bind(nesne);
    nesne[metot] = async (...a: unknown[]) => {
      sayac[anahtar]++;
      return asil(...a);
    };
  };
  sar(ceviri, 'cevir', 'cevir');
  sar(ceviri, 'disaAktarimCevirisi', 'disaAktarim');
  sar(kota, 'odenmisIcerikKaniti', 'kanit');
  sar(kota, 'rezerveEt', 'rezerve');
  const fx = { getRates: async () => ({ usdTry: 47.35, eurTry: 54.1, source: 'tcmb', date: '12.09.2026' }) };
  const quotes = new QuotesService(s.db, fx as any, ceviri);
  return { s, quote, kota, ceviri, quotes, gunluk, aiKayitlari, sayac };
}

const ozetOf = (sheets: unknown) => ceviriIcerigi(sheets).ozet;

async function metinler(buf: Buffer | ArrayBuffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const m: string[] = [];
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    const v: any = c.value;
    const t = v && typeof v === 'object'
      ? (Array.isArray(v.richText) ? v.richText.map((x: any) => x.text).join('') : v.formula ? '' : String(v.text ?? v.result ?? ''))
      : String(v ?? '');
    if (t) m.push(t);
  })));
  return m;
}
const icerir = (l: string[], parca: string) => l.some((x) => x.includes(parca));

/** Sekme sekme yerleşim: Excel'in açtığı sekme, başlık satırı, donmuş bölme, sayısal hücreler.
 *  23.09 tasarımı: tablo başlığı kalem sayfasında "Malzeme Adı" (B), GENEL TOPLAM'da
 *  "Sayfa" (A); tutarlar FORMÜL — sayısal içerik = değer ya da formül önbelleği. */
async function sekmeler(buf: Buffer | ArrayBuffer): Promise<{
  etkinSekme: number;
  liste: { ad: string; baslikNo: number; ySplit: number | undefined; ustMetinler: string[]; sayilar: number[]; tumMetinler: string[] }[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const liste = wb.worksheets.map((ws) => {
    let baslikNo = 0;
    const ustMetinler: string[] = [];
    const tumMetinler: string[] = [];
    const sayilar: number[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (!baslikNo && (String(row.getCell(2).value ?? '') === 'Malzeme Adı' || String(row.getCell(1).value ?? '') === 'Sayfa')) baslikNo = row.number;
      row.eachCell({ includeEmpty: false }, (c) => {
        const v: any = c.value;
        if (typeof v === 'number') sayilar.push(v);
        else if (v && typeof v === 'object' && typeof v.formula === 'string') { if (typeof v.result === 'number') sayilar.push(v.result); }
        else if (typeof c.value === 'string') {
          tumMetinler.push(c.value);
          if (!baslikNo) ustMetinler.push(c.value);
        }
      });
    });
    return { ad: ws.name, baslikNo, ySplit: (ws.views?.[0] as any)?.ySplit, ustMetinler, sayilar, tumMetinler };
  });
  const etkinSekme = Number((wb.views?.[0] as any)?.activeTab ?? 0);
  return { etkinSekme, liste };
}

// ── O) ÖZET ─────────────────────────────────────────────────────────────────
function oBlogu(): void {
  console.log('\nO) Özet v2 — çoklu küme');
  check('O1 ★ satır sırası değişince özet AYNI', ozetOf(adlar('A BORU', 'B BORU', 'A BORU')) === ozetOf(adlar('B BORU', 'A BORU', 'A BORU')));
  const ikiSayfa = [sayfa([satir('A BORU'), satir('B BORU')]), sayfa([satir('C BORU')], { index: 1, name: 'Elektrik' })];
  const tasinmis = [sayfa([satir('A BORU')]), sayfa([satir('B BORU'), satir('C BORU')], { index: 1, name: 'Elektrik' })];
  check('O2 satırın başka sayfaya taşınması özeti DEĞİŞTİRMEZ', ozetOf(ikiSayfa) === ozetOf(tasinmis));
  check('O3 ★ satır silme/ekleme (adet) özeti DEĞİŞTİRİR',
    ozetOf(adlar('A BORU', 'A BORU', 'B BORU')) !== ozetOf(adlar('A BORU', 'B BORU')) &&
    ozetOf(adlar('A BORU', 'B BORU')) !== ozetOf(adlar('A BORU', 'B BORU', 'B BORU')));
  check('O4 ad değişimi özeti DEĞİŞTİRİR', ozetOf(adlar('A BORU', 'B BORU')) !== ozetOf(adlar('A BORU', 'C BORU')));
  check('O5 miktar/fiyat değişimi özeti DEĞİŞTİRMEZ', ozetOf([sayfa([satir('A BORU', { _miktar: 1, _matBirim: '10' })])]) === ozetOf([sayfa([satir('A BORU', { _miktar: 99, _matBirim: '777' })])]));
  const tabanHali = kopya(FX.sayfalar);
  for (const s of tabanHali) for (const r of s.rowData) delete r[CEVIRI_SONUC_ALANI];
  const sonucsuz = tabanHali.every((s: Kayit) => s.rowData.every((r: Kayit) => !(CEVIRI_SONUC_ALANI in r)));
  check('O6 ★ eskiOzet (v1) T1 öncesi taban tanımıyla birebir (_ceviriSonucu taşımayan fikstür)', sonucsuz && ceviriIcerigi(tabanHali).eskiOzet === O6_TABAN_OZETI, ceviriIcerigi(tabanHali).eskiOzet);
  const bos = ceviriIcerigi([]);
  check('O7 boş içerikte v1 ≠ v2 (önek çakışmayı önler)', bos.ozet !== bos.eskiOzet && /^[0-9a-f]{64}$/.test(bos.ozet), `${bos.ozet} · ${bos.eskiOzet}`);
  const proto = ceviriIcerigi(adlar('constructor', 'PVC BORU'));
  check('O8 "constructor" satırı özetlenir, sayılır, prototipten okunmaz', /^[0-9a-f]{64}$/.test(proto.ozet) && proto.satirlar.get('constructor') === 1 && proto.ozet !== ozetOf(adlar('PVC BORU')));
}

// ── S) SATIR KAYNAĞI ────────────────────────────────────────────────────────
function sBlogu(): void {
  console.log('\nS) Satır kaynağı — bayat işaret ve ikiz fikstür');
  check('S1 işaretsiz satır: ad', satirKaynagi({ ad: 'PVC BORU' }, 'ad') === 'PVC BORU');
  check('S2 eski işaret (sonuç alanı yok): Türkçe asıl — bugünkü davranış korunur', satirKaynagi({ ad: 'PVC PIPE', [CEVIRI_KAYNAK_ALANI]: 'PVC BORU' }, 'ad') === 'PVC BORU');
  check('S3 geçerli işaret (hücre = sonuç): Türkçe asıl', satirKaynagi({ ad: 'PVC PIPE', [CEVIRI_KAYNAK_ALANI]: 'PVC BORU', [CEVIRI_SONUC_ALANI]: 'PVC PIPE' }, 'ad') === 'PVC BORU');
  check('S4 boşluk farkı bayat SAYILMAZ', satirKaynagi({ ad: ' PVC  PIPE ', [CEVIRI_KAYNAK_ALANI]: 'PVC BORU', [CEVIRI_SONUC_ALANI]: 'PVC PIPE' }, 'ad') === 'PVC BORU');
  check('S5 ★ BAYAT işaret (hücre elle değişti): hücre anahtar olur', satirKaynagi({ ad: 'KELEBEK VANA', [CEVIRI_KAYNAK_ALANI]: 'KÜRESEL VANA', [CEVIRI_SONUC_ALANI]: 'BALL VALVE' }, 'ad') === 'KELEBEK VANA');
  check('S6 boş kaynak ada düşer (K22 korunur)', satirKaynagi({ ad: 'PVC BORU', [CEVIRI_KAYNAK_ALANI]: '  ', [CEVIRI_SONUC_ALANI]: 'X' }, 'ad') === 'PVC BORU');
  check('S7 dizge olmayan sonuç: eski işaret gibi (bugünkü güven)', satirKaynagi({ ad: 'PVC PIPE', [CEVIRI_KAYNAK_ALANI]: 'PVC BORU', [CEVIRI_SONUC_ALANI]: 42 }, 'ad') === 'PVC BORU');
  check('S7b kayittaKaynakDuruyorMu: geçerli işaret false, bayat ve işaretsiz true',
    !kayittaKaynakDuruyorMu({ ad: 'PVC PIPE', [CEVIRI_KAYNAK_ALANI]: 'PVC BORU', [CEVIRI_SONUC_ALANI]: 'PVC PIPE' }, 'ad') &&
    kayittaKaynakDuruyorMu({ ad: 'KELEBEK VANA', [CEVIRI_KAYNAK_ALANI]: 'KÜRESEL VANA', [CEVIRI_SONUC_ALANI]: 'BALL VALVE' }, 'ad') &&
    kayittaKaynakDuruyorMu({ ad: 'PVC BORU' }, 'ad'));

  const cevrilmis = [sayfa([satir('BALL VALVE', { [CEVIRI_KAYNAK_ALANI]: 'KÜRESEL VANA', [CEVIRI_SONUC_ALANI]: 'BALL VALVE' })])];
  const elleDegisti = [sayfa([satir('KELEBEK VANA', { [CEVIRI_KAYNAK_ALANI]: 'KÜRESEL VANA', [CEVIRI_SONUC_ALANI]: 'BALL VALVE' })])];
  check('S8 ★ bayat işaretli satır özeti DEĞİŞTİRİR (çeviriden sonra yazılan ad ücretsiz kalmaz)', ozetOf(cevrilmis) !== ozetOf(elleDegisti) && ceviriIcerigi(elleDegisti).metinler[0] === 'KELEBEK VANA', JSON.stringify(ceviriIcerigi(elleDegisti).metinler));

  const kaynakDosyalari = (kok: string, altlar: string[]): string[] => {
    const cikti: string[] = [];
    const gez = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const g of fs.readdirSync(d, { withFileTypes: true })) {
        if (g.name === 'node_modules' || g.name === '.next' || g.name === 'dist') continue;
        const tam = path.join(d, g.name);
        if (g.isDirectory()) gez(tam);
        else if (/\.(ts|tsx)$/.test(g.name) && !/\.test\.tsx?$/.test(g.name)) cikti.push(tam);
      }
    };
    altlar.forEach((a) => gez(path.join(kok, a)));
    return cikti;
  };
  const feKok = path.join(__dirname, '../../frontend');
  const feIcerenler = kaynakDosyalari(feKok, ['app', 'ozellik', 'ortak']).filter((f) => fs.readFileSync(f, 'utf8').includes('_ceviriSonucu')).map((f) => path.relative(feKok, f).replace(/\\/g, '/'));
  const beKok = path.join(__dirname, '..');
  const beIcerenler = kaynakDosyalari(beKok, ['src']).filter((f) => fs.readFileSync(f, 'utf8').includes('_ceviriSonucu')).map((f) => path.relative(beKok, f).replace(/\\/g, '/'));
  check('S9 `_ceviriSonucu` ön yüzde YALNIZ ozellik/teklif/ceviri.ts\'te (yazan tek dosya), sunucuda yalnız kural sabitinde',
    JSON.stringify(feIcerenler) === JSON.stringify(['ozellik/teklif/ceviri.ts']) && JSON.stringify(beIcerenler) === JSON.stringify(['src/ozellik/giris/ai/ceviri-kurali.ts']),
    `ön yüz: ${JSON.stringify(feIcerenler)} · sunucu: ${JSON.stringify(beIcerenler)}`);

  const sayfalar = kopya(FX.sayfalar);
  const plan = disaAktarimPlani(sayfalar, FX.onbellek);
  const bulunan: Array<[number, number, string]> = plan.degisecek.map((d) => {
    const si = sayfalar.findIndex((s: Kayit) => s.rowData.includes(d.row));
    return [si, sayfalar[si].rowData.indexOf(d.row), d.yeni];
  });
  check('S10 ★ ikiz fikstür: sunucu planı beklenen değişen satırları ve karşılıksız sayısını verir (ön yüz aynı dosyayı koşar)',
    JSON.stringify(bulunan) === JSON.stringify(FX.beklenen.degisecek) && plan.karsiliksiz === FX.beklenen.karsiliksiz,
    `${JSON.stringify(bulunan)} · karşılıksız ${plan.karsiliksiz}`);
}

// ── P) KANIT ────────────────────────────────────────────────────────────────
async function pBlogu(): Promise<void> {
  console.log('\nP) Ödenmiş içerik kanıtı — penceresiz, nedenli');
  const sheets = kopya(FX.sayfalar);
  const icerik = ceviriIcerigi(sheets);
  const kanit = async (kayitlar: Kayit[], ayarlar?: Record<string, string>, k = K1) => {
    const t = sahne({ tuketim: kayitlar, ayarlar });
    return { r: await t.kota.odenmisIcerikKaniti(k, Q, 'en', icerik), t };
  };

  const tablo = [
    tuketim({ icerikOzeti: icerik.ozet, firmaId: 'f2' }),
    tuketim({ icerikOzeti: icerik.ozet, quoteId: Q_BASKA }),
    tuketim({ icerikOzeti: icerik.ozet, hedefDil: 'de' }),
    tuketim({ icerikOzeti: icerik.ozet, durum: 'KISMI' }),
    tuketim({ icerikOzeti: icerik.ozet, durum: 'BASARISIZ' }),
    tuketim({ icerikOzeti: 'baska-ozet', durum: 'ISLENIYOR' }),
  ];
  check('P0 FIXTURE KANITI: başka firma/teklif/dil, eski KISMI, BASARISIZ, ISLENIYOR aynı tabloda (6 kayıt)', tablo.length === 6 && new Set(tablo.map((k) => `${k.firmaId}|${k.quoteId}|${k.hedefDil}|${k.durum}`)).size === 6);
  {
    const { r } = await kanit([...tablo, tuketim({ icerikOzeti: icerik.ozet, olusturuldu: new Date(Date.now() - 26 * SAAT) })]);
    check('P1 ★ 26 saat önceki BASARILI → ödenmiş (pencere yok)', r.odenmis === true && (r as any).kaynak === 'TUKETIM', JSON.stringify(r));
  }
  {
    const { r } = await kanit([tuketim({ icerikOzeti: icerik.ozet, olusturuldu: new Date(Date.now() - 40 * GUN) })]);
    check('P2 önceki dönemin BASARILI kaydı → ödenmiş (dönem süzgeci yok)', r.odenmis === true, JSON.stringify(r));
  }
  check('P3 ★ başka teklifin kaydı → ödenmemiş', (await kanit([tuketim({ icerikOzeti: icerik.ozet, quoteId: Q_BASKA })])).r.odenmis === false);
  check('P4 ★ başka firmanın kaydı → ödenmemiş', (await kanit([tuketim({ icerikOzeti: icerik.ozet, firmaId: 'f2' })])).r.odenmis === false);
  check('P5 başka dilin kaydı → ödenmemiş', (await kanit([tuketim({ icerikOzeti: icerik.ozet, hedefDil: 'de' })])).r.odenmis === false);
  {
    const { r } = await kanit([tuketim({ icerikOzeti: icerik.ozet, durum: 'KISMI', dusulenSatir: 2, toplamTeslim: 2 })]);
    check('P6 ★ eski KISMI aynı özet → ödenmemiş, neden CEVIRI_YOK', r.odenmis === false && (r as any).neden === 'CEVIRI_YOK', JSON.stringify(r));
  }
  check('P7 BASARISIZ → CEVIRI_YOK', (await kanit([tuketim({ icerikOzeti: icerik.ozet, durum: 'BASARISIZ' })])).r.odenmis === false);
  {
    const { r } = await kanit([tuketim({ icerikOzeti: icerik.ozet, durum: 'ISLENIYOR', olusturuldu: new Date(Date.now() - 2 * DK) })]);
    check('P8 taze ISLENIYOR (aynı özet) → CEVIRI_SURUYOR', (r as any).neden === 'CEVIRI_SURUYOR', JSON.stringify(r));
  }
  {
    const { r } = await kanit([tuketim({ icerikOzeti: 'eski-icerik' })]);
    check('P9 başka özetli BASARILI → ICERIK_DEGISTI', (r as any).neden === 'ICERIK_DEGISTI', JSON.stringify(r));
    const { r: r2 } = await kanit([tuketim({ icerikOzeti: 'eski-icerik', durum: 'KISMI' })]);
    check('P9b başka özetli yalnız KISMI → CEVIRI_YOK (içerik değişti diye yalan söylenmez)', (r2 as any).neden === 'CEVIRI_YOK', JSON.stringify(r2));
  }
  {
    const { r } = await kanit([tuketim({ icerikOzeti: icerik.eskiOzet })]);
    const yeniSira = kopya(FX.sayfalar);
    yeniSira[0].rowData.reverse();
    const siraFarkli = ceviriIcerigi(yeniSira);
    const t = sahne({ tuketim: [tuketim({ icerikOzeti: icerik.eskiOzet })] });
    const r2 = await t.kota.odenmisIcerikKaniti(K1, Q, 'en', siraFarkli);
    check('P10 ★ v1 özetli BASARILI: sıra aynı → ödenmiş; sıra farklı → ödenmemiş', r.odenmis === true && r2.odenmis === false && siraFarkli.ozet === icerik.ozet, `${JSON.stringify(r)} · ${JSON.stringify(r2)}`);
  }
  {
    const izin = (ek: Kayit = {}) => ({
      [gecisAnahtari(Q, 'en')]: JSON.stringify({ surum: 1, firmaId: 'f1', quoteId: Q, hedefDil: 'en', icerikOzeti: icerik.ozet, sinif: 'GUCLU', kanit: 'K2+K3+K5', yazildi: new Date().toISOString(), betik: 'ceviri-gecis-izni', ...ek }),
    });
    const dogru = await kanit([], izin());
    const ozetFarkli = await kanit([], izin({ icerikOzeti: 'baska' }));
    const firmaFarkli = await kanit([], izin({ firmaId: 'f2' }));
    const bozuk = await kanit([], { [gecisAnahtari(Q, 'en')]: '{bozuk' });
    check('P11 ★ geçiş izni doğru → ödenmiş (GECIS); özet farklı / başka firma / bozuk JSON → ödenmemiş, bozuk için uyarı günlüğü',
      dogru.r.odenmis === true && (dogru.r as any).kaynak === 'GECIS' && (dogru.r as any).kayitId === null &&
      ozetFarkli.r.odenmis === false && firmaFarkli.r.odenmis === false && bozuk.r.odenmis === false &&
      bozuk.t.gunluk.some((g) => g.startsWith('warn:') && g.includes('okunamadi')),
      JSON.stringify({ d: dogru.r, o: ozetFarkli.r, f: firmaFarkli.r, b: bozuk.r, g: bozuk.t.gunluk }));
    check('P11b izinde hedefDil farklı → ödenmemiş', (await kanit([], izin({ hedefDil: 'de' }))).r.odenmis === false);
    check('P11c izinde surum 2 → ödenmemiş', (await kanit([], izin({ surum: 2 }))).r.odenmis === false);
    check('P12 izinle geçen istek günlüğe yazılır (denetimsiz yönetici ucuna karşı iz)', dogru.t.gunluk.some((g) => g.startsWith('log:') && g.includes('gecis izni kullanildi') && g.includes(Q)), JSON.stringify(dogru.t.gunluk));
  }
}

// ── Z) ZİNCİR ───────────────────────────────────────────────────────────────
async function zBlogu(): Promise<void> {
  console.log('\nZ) Zincir — ödenmiş içerik tekrardır');
  const ozet = ozetOf(FX.sayfalar);
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet, olusturuldu: new Date(Date.now() - 3 * SAAT) })] });
    const r: any = await t.ceviri.teklifiCevir(K1, Q).catch((e) => ({ hata: String(e) }));
    check('Z1 ★ eski BASARILI + tam önbellek → API çağrısı yok, kotadan 0 düşer (denetim kaydı yazılır)',
      r.tekrar === true && r.dusulenSatir === 0 && t.aiKayitlari.length === 0 && t.s.t.ceviriTuketimi.length === 2 && t.s.t.ceviriTuketimi[1].dusulenSatir === 0,
      JSON.stringify({ tekrar: r.tekrar, dusen: r.dusulenSatir, kayit: t.s.t.ceviriTuketimi.length, ai: t.aiKayitlari.length }));
  }
  {
    const ayarlar = { [gecisAnahtari(Q, 'en')]: JSON.stringify({ surum: 1, firmaId: 'f1', quoteId: Q, hedefDil: 'en', icerikOzeti: ozet, sinif: 'ZAYIF', kanit: 'K2', yazildi: '2026-09-15T00:00:00.000Z', betik: 'ceviri-gecis-izni' }) };
    const t = sahne({ onbellek: TAM_ONBELLEK, ayarlar });
    const r: any = await t.kota.rezerveEt(K1, Q, 'en').catch((e) => ({ hata: String(e) }));
    const kanit: any = await t.kota.odenmisIcerikKaniti(K1, Q, 'en', ceviriIcerigi(FX.sayfalar));
    check('Z3 ★ geçiş izni ödenmiş içerik KANITIDIR ama kota kararını önbellek verir: yeni satır 0, kayıt yazılır',
      kanit.odenmis === true && kanit.kaynak === 'GECIS' && r.gerekenSatir === 0 && r.tekrar === true && t.s.say('ceviriTuketimi.create') === 1,
      JSON.stringify({ kanit: kanit.kaynak, gereken: r.gerekenSatir, create: t.s.say('ceviriTuketimi.create') }));
  }
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet, olusturuldu: new Date(Date.now() - 30 * SAAT) })] });
    const o: any = await t.kota.onizleme(K1, Q, 'en', new Date()).catch((e) => ({ hata: String(e) }));
    check('Z4 önizleme ertesi gün de 0 satır (tümü önbellekte)', o.tekrar === true && o.gerekenSatir === 0 && o.onbellektenSatir === o.toplamSatir && o.toplamSatir > 0, JSON.stringify({ tekrar: o.tekrar, gereken: o.gerekenSatir, toplam: o.toplamSatir }));
    const bos: any = await sahne({ onbellek: {}, tuketim: [tuketim({ icerikOzeti: ozet })] }).kota.onizleme(K1, Q, 'en', new Date()).catch((e) => ({ hata: String(e) }));
    check('Z4b ★ ödenmiş kayıt VARSA bile önbellek boşsa satırlar YENİDİR (kanıt kota kararı vermez)', bos.tekrar === false && bos.gerekenSatir === o.toplamSatir, JSON.stringify({ tekrar: bos.tekrar, gereken: bos.gerekenSatir }));
  }
  {
    // İçerik değişti ama yeni ad ORTAK ÖNBELLEKTE (başka bir firma çevirmiş):
    // yeni bir çeviri işidir, yeni kayıt yazılır — ama API'ye para gitmediği
    // için ne satır ne DOSYA hakkı yenir (Emre 16.09).
    const sheets = kopya(FX.sayfalar);
    const t = sahne({ sheets, onbellek: { ...TAM_ONBELLEK, 'PPR BORU': 'PPR PIPE' }, tuketim: [tuketim({ icerikOzeti: ozet, dusulenSatir: 7 })] });
    t.s.t.quote[0].sheets[0].rowData[0]._ad = 'PPR BORU';
    const once = await t.kota.durum(K1);
    const r: any = await t.ceviri.teklifiCevir(K1, Q).catch((e) => ({ hata: String(e) }));
    const sonra = await t.kota.durum(K1);
    check('Z5 ★ içerik değişti ama yeni ad ortak önbellekte: yeni kayıt yazılır, satır da DOSYA hakkı da yenmez',
      t.s.t.ceviriTuketimi.length === 2 && r.dusulenSatir === 0 && t.aiKayitlari.length === 0 &&
      (sonra?.kullanilanDosya ?? -1) === (once?.kullanilanDosya ?? -2) && (sonra?.kullanilanSatir ?? -1) === (once?.kullanilanSatir ?? -2),
      JSON.stringify({ dusen: r.dusulenSatir, once: once?.kullanilanDosya, sonra: sonra?.kullanilanDosya }));

    // Aynı senaryo ama yeni ad HİÇBİR katmanda yok ve API anahtarı tanımsız:
    // çeviri tamamlanamaz → BASARISIZ, kotadan hiçbir şey düşmez (K-T7 sürüyor).
    const t2 = sahne({ sheets: kopya(FX.sayfalar), onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet, dusulenSatir: 7 })] });
    t2.s.t.quote[0].sheets[0].rowData[0]._ad = 'PPR BORU';
    const o2 = await t2.kota.onizleme(K1, Q, 'en', new Date());
    await t2.ceviri.teklifiCevir(K1, Q).catch(() => undefined);
    const yeni = t2.s.t.ceviriTuketimi[1];
    check('Z5b ★ yeni ad hiçbir katmanda yok → önizleme o satırı YENİ sayar; çeviri patlarsa 0 düşer',
      o2.gerekenSatir === 1 && o2.tekrar === false && yeni?.durum === 'BASARISIZ' && yeni?.dusulenSatir === 0,
      JSON.stringify({ gereken: o2.gerekenSatir, durum: yeni?.durum, dusen: yeni?.dusulenSatir }));
  }
}

// ── G) GÖRÜNTÜLEME ──────────────────────────────────────────────────────────
async function gBlogu(): Promise<void> {
  console.log('\nG) Görüntüleme — bakmak ≠ çevirmek');
  const ozet = ozetOf(FX.sayfalar);
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet })] });
    const y: any = await t.ceviri.teklifGorunumu(K1, Q).catch((e) => ({ hata: String(e) }));
    check('G1 ★ ödenmiş + tam → harita döner; tüketim, işlem, kilit, çeviri, AI kaydı YOK',
      y.odenmis === true && y.tamam === true && y.harita?.['PVC BORU'] === 'PVC PIPE' &&
      t.s.t.ceviriTuketimi.length === 1 && t.s.say('$transaction') === 0 && t.s.say('kilit') === 0 && t.s.say('ceviriTuketimi.') === 0 &&
      t.sayac.cevir === 0 && t.sayac.rezerve === 0 && t.aiKayitlari.length === 0,
      JSON.stringify({ y: { ...y, harita: undefined }, olaylar: t.s.olaylar, cevir: t.sayac.cevir, rezerve: t.sayac.rezerve }));
  }
  {
    const t = sahne({ onbellek: FX.onbellek });
    const y: any = await t.ceviri.teklifGorunumu(K1, Q).catch((e) => ({ hata: String(e) }));
    check('G2 ★ ödenmemiş → harita alanı YOK (önbellek dolu olsa da), sayılar doğru', y.odenmis === false && !('harita' in y) && y.neden === 'CEVIRI_YOK' && y.degisecekSatir === 3 && y.karsiliksizSatir === 2, JSON.stringify(y));
  }
  {
    const t = sahne({ firmaId: 'f2', tuketim: [tuketim({ icerikOzeti: ozet, firmaId: 'f2' })] });
    const e = await hata(() => t.ceviri.teklifGorunumu(K1, Q));
    check('G3 başka firmanın teklifi → 404 (varlık ifşa edilmez)', e?.getStatus?.() === 404, String(e?.message));
  }
  {
    const tr = AiController.prototype.translateGoruntule;
    const guardlar: unknown[] = Reflect.getMetadata(GUARDS_METADATA, tr) ?? [];
    const alinan: unknown[][] = [];
    const ctrl = new AiController({} as any, { teklifGorunumu: async (...a: unknown[]) => { alinan.push(a); return {}; } } as any, {} as any, {} as any);
    // 23.09: oturum FIRMA SAHIBI → kapsam 'firma' (K1 ile birebir). Uc `kimlikCoz`a
    // donerse servise giden kimlikte `teklifKapsami` OLMAZ ve bu assert kirmiziya doner.
    await ctrl.translateGoruntule({ id: 'u1', firmaId: 'f1', firmaRol: 'sahip' }, Object.assign(Object.create(null), { quoteId: Q, fazla: 'x' }));
    check('G5 ★ controller: yetenek metadata\'sı YOK, ThrottlerGuard var, 60/60000, servise yalnız kimlik + teklif',
      Reflect.getMetadata(YETENEK_KEY, tr) === undefined && guardlar.includes(ThrottlerGuard) &&
      Reflect.getMetadata('THROTTLER:LIMITdefault', tr) === 60 && Reflect.getMetadata('THROTTLER:TTLdefault', tr) === 60_000 &&
      JSON.stringify(alinan) === JSON.stringify([[K1, Q]]),
      JSON.stringify({ yetenek: Reflect.getMetadata(YETENEK_KEY, tr), limit: Reflect.getMetadata('THROTTLER:LIMITdefault', tr), alinan }));
  }
  {
    const oku = (y: string) => fs.readFileSync(path.join(__dirname, '..', y), 'utf8');
    const dosyalar = ['src/ozellik/giris/ai/ceviri.service.ts', 'src/ozellik/odeme/abonelik/ceviri-kota.servisi.ts', 'src/ozellik/teklif/quotes/quotes.service.ts'];
    const bulunan = dosyalar.filter((d) => oku(d).includes('UnauthorizedException'));
    check('G6 G401: yeni/değişen servislerde UnauthorizedException YOK (iş kuralı 401 dönmez)', bulunan.length === 0, JSON.stringify(bulunan));
  }
  {
    const t = sahne();
    const e = await hata(() => t.ceviri.katmanliHarita(['PVC BORU'], 'en', ''));
    const srcDosyalari: string[] = [];
    const gez = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((g) => {
      const tam = path.join(d, g.name);
      if (g.isDirectory()) gez(tam);
      else if (g.name.endsWith('.ts')) srcDosyalari.push(tam);
    });
    gez(path.join(__dirname, '../src'));
    const findMany = srcDosyalari.reduce((s, f) => s + (fs.readFileSync(f, 'utf8').split('translation.findMany').length - 1), 0);
    const eskiAd = srcDosyalari.filter((f) => fs.readFileSync(f, 'utf8').includes('onbellekHaritasi'));
    check('G7 katmanliHarita boş firmaId\'de fırlatır; backend/src\'de translation.findMany TAM 1; onbellekHaritasi yok',
      e instanceof Error && /firmaId zorunlu/.test(e.message) && findMany === 1 && eskiAd.length === 0,
      JSON.stringify({ hata: e?.message, findMany, eskiAd }));
  }
  {
    const t = sahne({ onbellek: FX.onbellek, tuketim: [tuketim({ icerikOzeti: ozet })] });
    const y: any = await t.ceviri.teklifGorunumu(K1, Q).catch((e) => ({ hata: String(e) }));
    check('G8 ★ ödenmiş ama önbellekte eksik → tamam:false, harita alanı YOK, çevrilemeyen satır doğru', y.odenmis === true && y.tamam === false && !('harita' in y) && y.cevrilemeyenSatir === 2, JSON.stringify(y));
  }
}

// ── X) DIŞA AKTARIM ─────────────────────────────────────────────────────────
async function xBlogu(): Promise<void> {
  console.log('\nX) İngilizce dosya kapısı — R1-B6 + Emre 15.09 kararı');
  const ozet = ozetOf(FX.sayfalar);
  // Başarı bekleyen vakada fırlatan çağrı bloğu KESMEZ: boş metin döner, vaka kendi adıyla kırmızı olur.
  const fiyatli = async (t: ReturnType<typeof sahne>, dil?: string): Promise<{ r: any; m: string[]; hata: unknown }> => {
    try {
      const r = await t.quotes.exportPricedXlsx(K1, Q, dil);
      return { r, m: await metinler(r.buffer), hata: null };
    } catch (e) {
      return { r: {}, m: [], hata: e };
    }
  };
  const format = async (t: ReturnType<typeof sahne>, dil?: string): Promise<{ r: any; m: string[]; hata: unknown }> => {
    try {
      const r = await t.quotes.exportXlsx(K1, Q, dil);
      return { r, m: await metinler(r.buffer), hata: null };
    } catch (e) {
      return { r: {}, m: [], hata: e };
    }
  };

  {
    const sheets = kopya(FX.sayfalar);
    const plan = disaAktarimPlani(kopya(FX.sayfalar), FX.onbellek);
    const satirlar: Kayit[] = sheets.flatMap((s: Kayit) => s.rowData);
    const ad = (x: string) => satirlar.find((r) => r._ad === x)!;
    check('X0 FIXTURE KANITI: kayıtta Türkçe+karşılıklı, özdeş GEBERIT, DN 20, İngilizce kayıtlı işaretli, bayat işaretli, karşılıksız satırlar var',
      plan.degisecek.length === 3 && plan.karsiliksiz === 2 && FX.onbellek.GEBERIT === 'GEBERIT' &&
      !ceviriIcerigi(sheets).metinler.includes('DN 20') && !kayittaKaynakDuruyorMu(ad('STEEL PIPE'), '_ad') &&
      satirKaynagi(ad('KIRMIZI VANA'), '_ad') === 'KIRMIZI VANA' && FX.onbellek['BAKIR BORU'] === undefined,
      JSON.stringify({ d: plan.degisecek.length, k: plan.karsiliksiz }));
  }
  {
    const t = sahne();
    const e = await hata(() => t.quotes.exportXlsx(K1, Q, 'en'));
    const y = yanit(e);
    check('X1 ★ açık en, kayıt yok, Teklif Formatı → 403 CEVIRI_GEREKLI/CEVIRI_YOK, message dolu; teklif no/rev ve arşiv YAZILMADI',
      e?.getStatus?.() === 403 && y.kod === 'CEVIRI_GEREKLI' && y.neden === 'CEVIRI_YOK' && typeof y.message === 'string' && y.message.length > 0 &&
      t.s.say('quote.update') === 0 && t.s.say('quoteExport.create') === 0,
      JSON.stringify({ durum: e?.getStatus?.(), y, olaylar: t.s.olaylar }));
    const t2 = sahne();
    const e2 = await hata(() => t2.quotes.exportPricedXlsx(K1, Q, 'en'));
    check('X2 ★ açık en, kayıt yok, Fiyatlandırılmış Excel → 403 CEVIRI_GEREKLI/CEVIRI_YOK', e2?.getStatus?.() === 403 && yanit(e2).kod === 'CEVIRI_GEREKLI' && yanit(e2).neden === 'CEVIRI_YOK', JSON.stringify(yanit(e2)));
  }
  {
    const t = sahne({ displayLanguage: 'en' });
    const { r, m } = await fiyatli(t);
    const f = await format(sahne({ displayLanguage: 'en' }));
    check('X3 ★ kayıttan (parametresiz) + ödenmemiş + değişecek>0 → hata yok, dosya TAMAMEN Türkçe, uyarı ve fiyatlı başlıkta eki',
      icerir(m, 'Genel Toplam') && !icerir(m, 'Grand Total') && icerir(m, 'PVC BORU') && !icerir(m, 'PVC PIPE') &&
      icerir(m, 'ÇELİK BORU') && !m.includes('STEEL PIPE') && r.uyari === KAYIT_INDIRGEME_UYARISI && icerir(m, 'Türkçe (İngilizce çevirisi yok)') &&
      String(f.r.uyari ?? '').includes(KAYIT_INDIRGEME_UYARISI) && !icerir(f.m, 'PVC PIPE'),
      JSON.stringify({ uyari: r.uyari, formatUyari: f.r.uyari, ornek: m.slice(0, 12) }));
  }
  {
    // İnceleme ORTA-1 (16.09): not yalnız SON sekmedeydi; Excel dosyayı İLK sekmede açar.
    const indirgenmis = await sekmeler((await fiyatli(sahne({ displayLanguage: 'en' }))).r.buffer);
    // Aynı içeriğin notsuz Türkçe dosyası (açık tr) — yerleşim/toplam karşılaştırması için.
    const acikTr = await sekmeler((await fiyatli(sahne(), 'tr')).r.buffer);
    const [ilk, ikinci] = indirgenmis.liste;
    const [ilkTr] = acikTr.liste;
    // 23.09 tasarımı: İLK sekme GENEL TOPLAM (Excel dosyayı onda açar) — not onun
    // tablo başlığının ÜSTÜNDE. Kısa özet sayfasında donmuş bölme yok (referans dosya).
    const ucuncu = indirgenmis.liste[2];
    check('X3b FIXTURE KANITI: GENEL TOPLAM + iki teklif sekmesi; Excel\'in açtığı sekme 0 (etkin sekme ayarı yok)',
      indirgenmis.liste.length === 3 && ilk?.ad === 'GENEL TOPLAM' && ikinci?.ad === 'Mekanik' && ucuncu?.ad === 'Elektrik' && indirgenmis.etkinSekme === 0,
      JSON.stringify({ sekmeler: indirgenmis.liste.map((s) => s.ad), etkin: indirgenmis.etkinSekme }));
    check('X3b ★ indirgeme notu dosya AÇILINCA görünen ilk sekmede (GENEL TOPLAM), tablo başlığının ÜSTÜNDE; teklif sekmelerinde YOK',
      !!ilk && ilk.ustMetinler.includes(KAYIT_INDIRGEME_UYARISI) && ilk.baslikNo > 1 &&
      !!ikinci && !ikinci.tumMetinler.includes(KAYIT_INDIRGEME_UYARISI) && !!ucuncu && !ucuncu.tumMetinler.includes(KAYIT_INDIRGEME_UYARISI),
      JSON.stringify({ ilk: ilk && { ust: ilk.ustMetinler, baslik: ilk.baslikNo }, ikinciNotlu: ikinci?.tumMetinler.includes(KAYIT_INDIRGEME_UYARISI) }));
    check('X3b not TOPLAMLARI KAYDIRMAZ: her sekmenin sayısal hücreleri (sayfa toplamı ve GENEL TOPLAM dahil) notsuz Türkçe dosyayla birebir; notsuz dosyada not YOK',
      !!ilkTr && JSON.stringify(indirgenmis.liste.map((s) => s.sayilar)) === JSON.stringify(acikTr.liste.map((s) => s.sayilar)) &&
      indirgenmis.liste.every((s) => s.sayilar.length > 0) && ilkTr.baslikNo === ilk.baslikNo - 1 &&
      !acikTr.liste.some((s) => s.tumMetinler.includes(KAYIT_INDIRGEME_UYARISI)),
      JSON.stringify({ indirgenmis: indirgenmis.liste.map((s) => s.sayilar.length), acikTr: acikTr.liste.map((s) => s.sayilar.length), baslik: [ilk?.baslikNo, ilkTr?.baslikNo] }));
  }
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet })] });
    const { m } = await fiyatli(t, 'en');
    check('X4 ★ BASARILI → değişecek hücreler İngilizce, etiket İngilizce, tüketim sayısı aynı',
      icerir(m, 'PVC PIPE') && !icerir(m, 'PVC BORU') && icerir(m, 'CABLE TRAY') && icerir(m, 'Grand Total') && t.s.t.ceviriTuketimi.length === 1 && t.s.say('ceviriTuketimi.') === 0,
      JSON.stringify(m.slice(0, 14)));
  }
  {
    // R1-B6 satır 7: kayıttan (parametresiz) + ödenmiş + tam → İngilizce; indirgeme uyarısı ve başlık eki YOK.
    const odenmisTam = () => sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet })], displayLanguage: 'en' });
    const { r, m } = await fiyatli(odenmisTam());
    const f = await format(odenmisTam());
    check('X4b kayıttan (parametresiz) + ödenmiş + tam → İngilizce iner (satır 7); Türkçe indirgeme uyarısı ve başlık eki YOK',
      icerir(m, 'PVC PIPE') && icerir(m, 'Grand Total') && !icerir(m, 'Türkçe (İngilizce çevirisi yok)') && !m.includes(KAYIT_INDIRGEME_UYARISI) && r.uyari === undefined &&
      icerir(f.m, 'PVC PIPE') && !String(f.r.uyari ?? '').includes(KAYIT_INDIRGEME_UYARISI),
      JSON.stringify({ uyari: r.uyari, formatUyari: f.r.uyari, hata: String(f.hata ?? '') }));
  }
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet, durum: 'KISMI', dusulenSatir: 2, toplamTeslim: 2 })] });
    const e = await hata(() => t.quotes.exportPricedXlsx(K1, Q, 'en'));
    check('X5 eski KISMI aynı özet → 403 CEVIRI_GEREKLI/CEVIRI_YOK', e?.getStatus?.() === 403 && yanit(e).neden === 'CEVIRI_YOK', JSON.stringify(yanit(e)));
  }
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet, durum: 'ISLENIYOR', olusturuldu: new Date(Date.now() - 2 * DK) })] });
    const e = await hata(() => t.quotes.exportPricedXlsx(K1, Q, 'en'));
    check('X6 süren çeviri → 409 CEVIRI_SURUYOR', e?.getStatus?.() === 409 && yanit(e).kod === 'CEVIRI_SURUYOR', JSON.stringify(yanit(e)));
  }
  {
    const odenmis = () => [tuketim({ icerikOzeti: ozet })];
    const adDegisti = sahne({ onbellek: { ...TAM_ONBELLEK, 'PPR BORU': 'PPR PIPE' }, tuketim: odenmis() });
    adDegisti.s.t.quote[0].sheets[0].rowData[0]._ad = 'PPR BORU';
    const e = await hata(() => adDegisti.quotes.exportPricedXlsx(K1, Q, 'en'));
    const miktar = sahne({ onbellek: TAM_ONBELLEK, tuketim: odenmis() });
    miktar.s.t.quote[0].sheets[0].rowData[0]._miktar = 42;
    const eM = await hata(() => miktar.quotes.exportPricedXlsx(K1, Q, 'en'));
    const sira = sahne({ onbellek: TAM_ONBELLEK, tuketim: odenmis() });
    sira.s.t.quote[0].sheets[0].rowData.reverse();
    const eS = await hata(() => sira.quotes.exportPricedXlsx(K1, Q, 'en'));
    check('X7 ★ ad değişti → 403 ICERIK_DEGISTI; yalnız miktar ya da yalnız satır sırası değişti → İngilizce iner',
      e?.getStatus?.() === 403 && yanit(e).neden === 'ICERIK_DEGISTI' && eM === null && eS === null,
      JSON.stringify({ ad: yanit(e), miktar: eM?.message, sira: eS?.message }));
  }
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet, firmaId: 'f2' })] });
    const e = await hata(() => t.quotes.exportPricedXlsx(K1, Q, 'en'));
    check('X8 başka firmanın tüketim kaydı → ret', e?.getStatus?.() === 403, JSON.stringify(yanit(e)));
  }
  {
    const izin = { [gecisAnahtari(Q, 'en')]: JSON.stringify({ surum: 1, firmaId: 'f1', quoteId: Q, hedefDil: 'en', icerikOzeti: ozet, sinif: 'GUCLU', kanit: 'K2+K3+K5', yazildi: '2026-09-15T00:00:00.000Z', betik: 'ceviri-gecis-izni' }) };
    const t = sahne({ onbellek: TAM_ONBELLEK, ayarlar: izin });
    const { m } = await fiyatli(t, 'en');
    const t2 = sahne({ onbellek: { ...TAM_ONBELLEK, 'PPR BORU': 'PPR PIPE' }, ayarlar: izin });
    t2.s.t.quote[0].sheets[0].rowData[0]._ad = 'PPR BORU';
    const e = await hata(() => t2.quotes.exportPricedXlsx(K1, Q, 'en'));
    check('X9 geçiş izni → İngilizce iner; içerik değişince ret', icerir(m, 'PVC PIPE') && e?.getStatus?.() === 403, JSON.stringify(yanit(e)));
  }
  {
    const sheets = [sayfa([satir('GEBERIT'), satir('DN 20'), satir('STEEL PIPE', { [CEVIRI_KAYNAK_ALANI]: 'ÇELİK BORU', [CEVIRI_SONUC_ALANI]: 'STEEL PIPE' })])];
    const t = sahne({ sheets, onbellek: { GEBERIT: 'GEBERIT', 'ÇELİK BORU': 'STEEL PIPING' } });
    const { m } = await fiyatli(t, 'en');
    check('X10 ★ değişecek 0 ve karşılıksız 0 → İngilizce dosya, kanıt fonksiyonu ÇAĞRILMADI', icerir(m, 'Grand Total') && m.includes('STEEL PIPE') && t.sayac.kanit === 0, JSON.stringify({ kanit: t.sayac.kanit }));
  }
  {
    const t = sahne({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet })] });
    const { m } = await fiyatli(t, 'en');
    const kayit = t.s.t.quote[0].sheets[0].rowData[3];
    check('X11 ★ ödenmiş içerikte kayıtta İngilizce duran hücre DEĞİŞMEZ (STEEL PIPING yazılmaz), kayıt nesnesi de değişmez',
      m.includes('STEEL PIPE') && !icerir(m, 'STEEL PIPING') && kayit._ad === 'STEEL PIPE' && t.s.t.quote[0].sheets[0].rowData[0]._ad === 'PVC BORU',
      JSON.stringify(m.filter((x) => x.includes('STEEL'))));
  }
  {
    const yalnizDokunulmazVeIngilizce = [sayfa([satir('DN 20'), satir('STEEL PIPE', { [CEVIRI_KAYNAK_ALANI]: 'ÇELİK BORU' })])];
    const p = disaAktarimPlani(yalnizDokunulmazVeIngilizce, {});
    check('X12 karşılıksız sayısında dokunulmaz ve İngilizce kayıtlı satır YOK', p.karsiliksiz === 0 && disaAktarimPlani(kopya(FX.sayfalar), FX.onbellek).karsiliksiz === 2, `${p.karsiliksiz}`);
  }
  {
    const t = sahne();
    const { m } = await fiyatli(t, 'tr');
    check('X13 ★ açık tr: işaretli hücre Türkçe kaynağına döner, bayat işaretli hücre korunur',
      icerir(m, 'ÇELİK BORU') && !m.includes('STEEL PIPE') && icerir(m, 'KIRMIZI VANA') && !icerir(m, 'KÜRESEL VANA') && icerir(m, 'Genel Toplam'),
      JSON.stringify(m.slice(0, 14)));
  }
  {
    const odenmis = () => ({ onbellek: TAM_ONBELLEK, tuketim: [tuketim({ icerikOzeti: ozet })] });
    const a = sahne(odenmis());
    await hata(() => a.quotes.exportPricedXlsx(K1, Q, 'en'));
    const b = sahne(odenmis());
    await hata(() => b.quotes.exportXlsx(K1, Q, 'en'));
    const c = sahne(odenmis());
    await hata(() => c.quotes.exportPricedXlsx(K1, Q));
    await hata(() => c.quotes.exportXlsx(K1, Q));
    check('X14 ★ BAĞLANTI: iki metot da çözülmüş dil en iken disaAktarimCevirisi\'ni çağırır; dil yok + kayıt tr iken ÇAĞIRMAZ',
      a.sayac.disaAktarim === 1 && b.sayac.disaAktarim === 1 && c.sayac.disaAktarim === 0,
      JSON.stringify({ fiyatli: a.sayac.disaAktarim, format: b.sayac.disaAktarim, dilsiz: c.sayac.disaAktarim }));
  }
  {
    const odenmis = () => [tuketim({ icerikOzeti: ozet })];
    const acik = sahne({ onbellek: FX.onbellek, tuketim: odenmis() });
    const e = await hata(() => acik.quotes.exportPricedXlsx(K1, Q, 'en'));
    const kayit = sahne({ onbellek: FX.onbellek, tuketim: odenmis(), displayLanguage: 'en' });
    const { m } = await fiyatli(kayit);
    check('X15 ★ ödenmiş + değişecek>0 + karşılıksız>0: açık → 409 CEVIRI_EKSIK (dosya yok); kayıttan → tamamen Türkçe',
      e?.getStatus?.() === 409 && yanit(e).kod === 'CEVIRI_EKSIK' && icerir(m, 'Genel Toplam') && icerir(m, 'PVC BORU') && !icerir(m, 'PVC PIPE'),
      JSON.stringify({ y: yanit(e) }));
  }
  {
    // Emre 15.09 kararı: tablo satır 3 artık İNMEZ — başlıkları İngilizce, adları Türkçe dosya üretilmez.
    const sheets = () => [sayfa([satir('GEBERIT'), satir('STEEL PIPE', { [CEVIRI_KAYNAK_ALANI]: 'ÇELİK BORU', [CEVIRI_SONUC_ALANI]: 'STEEL PIPE' }), satir('BAKIR BORU')])];
    const onbellek = { GEBERIT: 'GEBERIT', 'ÇELİK BORU': 'STEEL PIPING' };
    const acik = sahne({ sheets: sheets(), onbellek });
    const e = await hata(() => acik.quotes.exportPricedXlsx(K1, Q, 'en'));
    const odenmisAcik = sahne({ sheets: sheets(), onbellek, tuketim: [tuketim({ icerikOzeti: ozetOf(sheets()) })] });
    const eO = await hata(() => odenmisAcik.quotes.exportPricedXlsx(K1, Q, 'en'));
    const kayit = sahne({ sheets: sheets(), onbellek, displayLanguage: 'en' });
    const { r, m } = await fiyatli(kayit);
    check('X16 ★ değişecek 0 + karşılıksız>0: açık → DURUR (ödenmemiş 403 CEVIRI_YOK, ödenmiş 409 CEVIRI_EKSIK); kayıttan → tamamen Türkçe',
      e?.getStatus?.() === 403 && yanit(e).neden === 'CEVIRI_YOK' && yanit(e).mesaj === CIKTI_KAPISI_METNI.CEVIRI_YOK.mesaj &&
      eO?.getStatus?.() === 409 && yanit(eO).kod === 'CEVIRI_EKSIK' &&
      icerir(m, 'Genel Toplam') && icerir(m, 'ÇELİK BORU') && icerir(m, 'BAKIR BORU') && r.uyari === KAYIT_INDIRGEME_UYARISI,
      JSON.stringify({ acik: yanit(e), odenmis: yanit(eO), uyari: r.uyari }));
  }
  {
    const t = sahne({ displayLanguage: 'en' });
    const { m } = await fiyatli(t);
    check('X17 ★ kayıttan + ödenmemiş + Düzenle\'de İngilizce kaydedilmiş satır → dosyada Türkçe kaynağıyla', icerir(m, 'ÇELİK BORU') && !m.includes('STEEL PIPE') && t.s.t.quote[0].sheets[0].rowData[3]._ad === 'STEEL PIPE', JSON.stringify(m.filter((x) => /STEEL|ÇELİK/.test(x))));
  }
}

// ── H) HATA GÖVDESİ ─────────────────────────────────────────────────────────
@Controller('kukla')
class KuklaController {
  @Get('kapi')
  kapi(@Res() _res: unknown) {
    throw ceviriKapisiReddi('CEVIRI_YOK');
  }

  @Get('tamamlanamadi')
  tamamlanamadi(@Res() _res: unknown) {
    throw ceviriTamamlanamadiHatasi(['ÇELİK BORU', 'BAKIR BORU'], 3);
  }
}

@Module({ controllers: [KuklaController] })
class KuklaModulu {}

function iste(port: number, yol: string): Promise<{ durum: number; govde: string }> {
  return new Promise((coz, reddet) => {
    http.get({ host: '127.0.0.1', port, path: yol }, (res) => {
      let govde = '';
      res.setEncoding('utf8');
      res.on('data', (p) => { govde += p; });
      res.on('end', () => coz({ durum: res.statusCode ?? 0, govde }));
    }).on('error', reddet);
  });
}

async function hBlogu(): Promise<void> {
  console.log('\nH) Hata gövdesi — controller ve gerçek HTTP');
  {
    const ctrl = new QuotesController({ exportPricedXlsx: async () => { throw ceviriKapisiReddi('CEVIRI_YOK'); } } as any);
    const e = await hata(() => ctrl.exportPriced({ id: 'u1', firmaId: 'f1' }, Q, {} as any, 'en'));
    check('H1 gerçek QuotesController.exportPriced: çeviri kapısı 400\'e çevrilmeden 403 çıkar', e?.getStatus?.() === 403 && yanit(e).kod === 'CEVIRI_GEREKLI', `${e?.getStatus?.()}`);
  }
  const app = await NestFactory.create(KuklaModulu, { logger: false });
  await app.listen(0, '127.0.0.1');
  try {
    const port = (app.getHttpServer().address() as { port: number }).port;
    const a = await iste(port, '/kukla/kapi');
    const j = JSON.parse(a.govde);
    const m = CIKTI_KAPISI_METNI.CEVIRI_YOK;
    check('H2 gerçek HTTP (@Res uç): 403 JSON message/mesaj/aciklama/kod/neden birebir',
      a.durum === 403 && JSON.stringify(Object.keys(j).sort()) === JSON.stringify(['aciklama', 'kod', 'mesaj', 'message', 'neden']) &&
      j.mesaj === m.mesaj && j.aciklama === m.aciklama && j.message === `${m.mesaj}. ${m.aciklama}` && j.kod === 'CEVIRI_GEREKLI' && j.neden === 'CEVIRI_YOK',
      `${a.durum} ${a.govde}`);
    const b = await iste(port, '/kukla/tamamlanamadi');
    const jb = JSON.parse(b.govde);
    check('H3 gerçek HTTP: tamamlanamadı → 422 JSON kod + çevrilemeyen satırlar',
      b.durum === 422 && jb.kod === 'CEVIRI_TAMAMLANAMADI' && JSON.stringify(jb.cevrilemeyenSatirlar) === JSON.stringify(['ÇELİK BORU', 'BAKIR BORU']) && jb.cevrilemeyenSayisi === 3,
      `${b.durum} ${b.govde}`);
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const bloklar: Array<[string, () => void | Promise<void>]> = [['O', oBlogu], ['S', sBlogu], ['P', pBlogu], ['Z', zBlogu], ['G', gBlogu], ['X', xBlogu], ['H', hBlogu]];
  for (const [ad, blok] of bloklar) {
    try {
      await blok();
    } catch (e) {
      // Bir bloğun istisnası diğer blokları koşturmadan bırakmasın; kendisi kırmızıdır.
      check(`${ad}-BLOK beklenmedik hata`, false, String((e as Error)?.stack ?? e).slice(0, 400));
    }
  }
}

bitmezseKirmizi(main()
  .catch((e) => {
    failures.push(`beklenmedik hata: ${(e as Error)?.stack ?? e}`);
  })
  .finally(() => {
    console.log(`\nÇEVİRİ GÖRÜNÜM + ÇIKTI: ${passed} PASS · ${failures.length} FAIL`);
    if (failures.length > 0) {
      console.log('\nKALANLAR:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exitCode = 1;
    }
  }));
