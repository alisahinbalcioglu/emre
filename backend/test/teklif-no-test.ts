/**
 * TEKLİF NO KAPISI (30.09.2026 — ekip/yetki planı A bloğu)
 *   npm run test:teklif-no
 *
 * NEDEN: teklif no "firmadaki numaralı teklif SAYISI + 1" ile üretilip dosya
 * üretildikten SONRA yazılıyordu. Aynı firmada eş zamanlı iki ilk çıktı AYNI
 * numarayı alıyor; 001/002/003'ten 001 silinince yeni teklif VAR OLAN 003'ü
 * alıyor; sayaç yıla göre süzülmüyordu. Kural artık `teklif-no.ts`te: firma
 * başına danışma kilidi + yıl önekli EN BÜYÜK + 1; şemada
 * `@@unique([firmaId, quoteNo])` son savunma (PGlite ölçümü
 * `test:migration` TN bloğunda).
 *
 * SAHTE DB: danışma kilidi anahtar başına async muteks (işlem bitince
 * bırakılır); okuma ile yazma arasında 30 ms gecikme (sıfır gecikmeli taklit
 * iki adımı tek tike toplar, kilitsiz mutant yaşar); tekillik kısıtı taklit
 * edilir (kilitsiz sürüm aynı numarayı yazmaya kalkınca P2002 fırlatır).
 *
 * Bloklar:
 *  S  saf kural (`sonrakiTeklifNo`)
 *  K  kilitli atama (`teklifNoAta`) — eş zamanlılık ve kapsam
 *  B  BAĞLANTI: gerçek `QuotesService.exportXlsx` eş zamanlı, T10, R1-B6
 *  E  kaynak/şema/göç eşliği
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { sonrakiTeklifNo, teklifNoAta } from '../src/ozellik/teklif/quotes/teklif-no';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

process.env.TZ = 'UTC';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, kanit?: string) {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`  ✗ ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
}

const KOK = path.join(__dirname, '..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumları at: kapı YORUMDA değil KODDA eşleşsin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sqlKodu = (s: string) => s.replace(/--.*$/gm, '').trim();
const js = (v: unknown) => JSON.stringify(v);
const bekle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function dene<T>(fn: () => Promise<T>): Promise<{ deger?: T; hata?: any }> {
  try {
    return { deger: await fn() };
  } catch (hata) {
    return { hata };
  }
}

const YIL = 2026;
const GECIKME = 30;

// ═══════════════════════════════════════════════════════════════════════════
//  SAHTE DB
// ═══════════════════════════════════════════════════════════════════════════
type Satir = { id: string; firmaId: string; userId: string; quoteNo: string | null; rev: number; [k: string]: any };

function sahteDb(satirlar: Satir[], ayar: { gecikme?: (islem: string, where: any) => number } = {}) {
  const tablo = satirlar.map((s) => ({ ...s }));
  const kilitler = new Map<string, Promise<void>>();
  const kayit = {
    kilitSql: [] as string[],
    kilitAnahtarlari: [] as string[],
    guncellemeler: [] as { id: string; data: any }[],
    arsiv: [] as any[],
    olaylar: [] as string[],
  };
  const gecik = (islem: string, where: any) => bekle(ayar.gecikme?.(islem, where) ?? GECIKME);

  async function kilitAl(anahtar: string): Promise<() => void> {
    const onceki = kilitler.get(anahtar) ?? Promise.resolve();
    let birak!: () => void;
    const benim = new Promise<void>((r) => (birak = r));
    kilitler.set(anahtar, onceki.then(() => benim));
    await onceki;
    return birak;
  }
  const eslesir = (s: Satir, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (v && typeof v === 'object' && 'startsWith' in (v as any)) return String(s[k] ?? '').startsWith((v as any).startsWith);
      return s[k] === v;
    });

  const quote = {
    findFirst: async ({ where }: any) => {
      await gecik('findFirst', where);
      const s = tablo.find((r) => eslesir(r, where));
      return s ? { ...s } : null;
    },
    findMany: async ({ where }: any) => {
      await gecik('findMany', where);
      return tablo.filter((r) => eslesir(r, where)).map((r) => ({ quoteNo: r.quoteNo }));
    },
    update: async ({ where, data }: any) => {
      await gecik('update', where);
      const s = tablo.find((r) => r.id === where.id);
      if (!s) throw new Error(`kayit yok: ${where.id}`);
      // Sema: @@unique([firmaId, quoteNo]) — NULL serbest.
      if (data.quoteNo != null && tablo.some((r) => r !== s && r.firmaId === s.firmaId && r.quoteNo === data.quoteNo)) {
        throw Object.assign(new Error(`Unique constraint failed on (firmaId, quoteNo): ${data.quoteNo}`), { code: 'P2002' });
      }
      kayit.guncellemeler.push({ id: where.id, data: { ...data } });
      kayit.olaylar.push(`update:${where.id}:${data.quoteNo ?? '-'}`);
      Object.assign(s, data);
      return { ...s };
    },
  };

  const prisma: any = {
    quote,
    quoteFormat: { findFirst: async () => null }, // → yerlesik ornek format
    quoteExport: { create: async ({ data }: any) => { kayit.arsiv.push(data); return {}; } },
    firma: { findUnique: async () => null },
    $transaction: async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const birakilacak: (() => void)[] = [];
      const tx = {
        ...prisma,
        $queryRaw: async (parcalar: TemplateStringsArray, ...degerler: unknown[]) => {
          const sql = parcalar.join('?');
          if (/pg_advisory_xact_lock/.test(sql)) {
            kayit.kilitSql.push(sql);
            kayit.kilitAnahtarlari.push(String(degerler[0]));
            birakilacak.push(await kilitAl(String(degerler[0])));
          }
          return [{ kilit: '' }];
        },
      };
      try {
        return await arg(tx);
      } finally {
        birakilacak.forEach((b) => b());
      }
    },
  };
  return { prisma, tablo, kayit, satir: (id: string) => tablo.find((r) => r.id === id)! };
}

const teklif = (id: string, firmaId: string, quoteNo: string | null = null, ek: Partial<Satir> = {}): Satir => ({
  id, firmaId, userId: `u-${firmaId}`, quoteNo, rev: 0, ...ek,
});

// ═══════════════════════════════════════════════════════════════════════════
//  S · SAF KURAL
// ═══════════════════════════════════════════════════════════════════════════
function bolumS() {
  console.log('\n── S · saf kural (sonrakiTeklifNo) ──');
  check('S1 numarasız firmada ilk numara MP-<yıl>-001', sonrakiTeklifNo([], YIL) === 'MP-2026-001');
  check('S2 001, 002 varken 003', sonrakiTeklifNo(['MP-2026-001', 'MP-2026-002'], YIL) === 'MP-2026-003');
  check('S3 ⭐ önceki yılın 007\'si bu yılın sırasını etkilemez → 001',
    sonrakiTeklifNo(['MP-2025-007'], YIL) === 'MP-2026-001', sonrakiTeklifNo(['MP-2025-007'], YIL));
  check('S4 ⭐ ortadan silme: 002 ve 003 kalmışken 004 (sayım 003 verirdi = var olan numara)',
    sonrakiTeklifNo(['MP-2026-002', 'MP-2026-003'], YIL) === 'MP-2026-004', sonrakiTeklifNo(['MP-2026-002', 'MP-2026-003'], YIL));
  check('S5 biçim dışı ve boş numaralar sayılmaz',
    sonrakiTeklifNo(['ESKI-9', 'MP-2026-99X', 'MP-26-005', null, undefined, ''], YIL) === 'MP-2026-001');
  check('S6 sıra 999\'u aşar (dolgu üç hane, kesme yok)',
    sonrakiTeklifNo(['MP-2026-999'], YIL) === 'MP-2026-1000' && sonrakiTeklifNo(['MP-2026-1000'], YIL) === 'MP-2026-1001');
  check('S7 sıralama sayısal ve sıradan bağımsız (002, 009, 010 → 011)',
    sonrakiTeklifNo(['MP-2026-009', 'MP-2026-010', 'MP-2026-002'], YIL) === 'MP-2026-011');
}

// ═══════════════════════════════════════════════════════════════════════════
//  K · KİLİTLİ ATAMA
// ═══════════════════════════════════════════════════════════════════════════
async function bolumK() {
  console.log('\n── K · kilitli atama (teklifNoAta) ──');

  {
    const db = sahteDb([teklif('q1', 'fA'), teklif('q0', 'fA', 'MP-2026-001')]);
    const no = await teklifNoAta(db.prisma, 'fA', 'q1', YIL);
    check('K1 atama numarayı döndürür VE teklife yazar', no === 'MP-2026-002' && db.satir('q1').quoteNo === 'MP-2026-002', js(db.tablo));
  }

  {
    // FIXTURE KANITI: iki çağrı gerçekten iç içe geçiyor mu? Kilitsiz yarış
    // aynı sahtede P2002 üretmeli — üretmezse K2 hiçbir şey ölçmez.
    const db = sahteDb([teklif('q1', 'fA'), teklif('q2', 'fA')]);
    const kilitsiz = async (id: string) => {
      const onekli = await db.prisma.quote.findMany({ where: { firmaId: 'fA', quoteNo: { startsWith: 'MP-2026-' } } });
      const no = sonrakiTeklifNo(onekli.map((q: any) => q.quoteNo), YIL);
      await db.prisma.quote.update({ where: { id }, data: { quoteNo: no } });
      return no;
    };
    const r = await Promise.allSettled([kilitsiz('q1'), kilitsiz('q2')]);
    check('K2-OLCUT kilitsiz eş zamanlı atama bu sahtede ÇAKIŞIYOR (yarış gerçekten kuruluyor)',
      r.some((x) => x.status === 'rejected' && (x.reason as any)?.code === 'P2002'), js(r.map((x) => x.status)));
  }

  {
    const db = sahteDb([teklif('q1', 'fA'), teklif('q2', 'fA')]);
    const r = await Promise.allSettled([teklifNoAta(db.prisma, 'fA', 'q1', YIL), teklifNoAta(db.prisma, 'fA', 'q2', YIL)]);
    const nolar = r.map((x) => (x.status === 'fulfilled' ? x.value : `HATA:${(x.reason as any)?.message}`));
    check('K2 ⭐ aynı firmada iki teklif EŞ ZAMANLI → iki farklı numara, hata yok',
      r.every((x) => x.status === 'fulfilled') && new Set(nolar).size === 2 && nolar.sort().join() === 'MP-2026-001,MP-2026-002', js(nolar));
  }

  {
    const db = sahteDb([teklif('q1', 'fA')]);
    const [a, b] = await Promise.all([teklifNoAta(db.prisma, 'fA', 'q1', YIL), teklifNoAta(db.prisma, 'fA', 'q1', YIL)]);
    check('K3 ⭐ AYNI teklif eş zamanlı iki çıktı → tek numara, tek yazım',
      a === 'MP-2026-001' && b === a && db.satir('q1').quoteNo === a && db.kayit.guncellemeler.length === 1,
      js({ a, b, g: db.kayit.guncellemeler }));
  }

  {
    const db = sahteDb([teklif('q1', 'fA', 'MP-2026-005')]);
    const no = await teklifNoAta(db.prisma, 'fA', 'q1', YIL);
    check('K4 numarası olan teklif: aynı numara döner, yazım yok (T10)', no === 'MP-2026-005' && db.kayit.guncellemeler.length === 0);
  }

  {
    const db = sahteDb([teklif('qA', 'fA'), teklif('qB', 'fB'), teklif('xB', 'fB', 'MP-2026-005')]);
    const a = await teklifNoAta(db.prisma, 'fA', 'qA', YIL);
    check('K5 başka firmanın numaraları sayılmaz (sayaç firma başına)', a === 'MP-2026-001', a);
  }

  {
    // fA'nın atamasını yavaşlat; fB onu BEKLEMEMELİ (kilit anahtarı firma başına).
    const db = sahteDb([teklif('qA', 'fA'), teklif('qB', 'fB')], {
      gecikme: (islem, where) => (islem === 'update' && where?.id === 'qA' ? 300 : GECIKME),
    });
    const sira: string[] = [];
    await Promise.all([
      teklifNoAta(db.prisma, 'fA', 'qA', YIL).then(() => sira.push('A')),
      teklifNoAta(db.prisma, 'fB', 'qB', YIL).then(() => sira.push('B')),
    ]);
    check('K6 farklı firmalar birbirini beklemez (fB, yavaş fA\'dan önce biter)', sira.join() === 'B,A', sira.join());
    check('K6b kilit anahtarı firma başına: teklif-no:<firmaId>',
      db.kayit.kilitAnahtarlari.sort().join() === 'teklif-no:fA,teklif-no:fB', js(db.kayit.kilitAnahtarlari));
  }

  {
    // Teklif, cagiranin dogrulamasindan SONRA silindi: anlamsiz P2025 (500) degil 404.
    const db = sahteDb([teklif('q0', 'fA', 'MP-2026-001')]);
    const r = await dene(() => teklifNoAta(db.prisma, 'fA', 'silinmis', YIL));
    check('K8 kilitten sonra teklif yoksa 404, yazım yok',
      r.hata?.getStatus?.() === 404 && db.kayit.guncellemeler.length === 0, js({ hata: r.hata?.message, g: db.kayit.guncellemeler }));
  }

  {
    const db = sahteDb([teklif('q1', 'fA')]);
    await teklifNoAta(db.prisma, 'fA', 'q1', YIL);
    check('K7 kilit SQL\'i işlem kapsamlı danışma kilidi (pg_advisory_xact_lock + hashtext + ::text)',
      db.kayit.kilitSql.length === 1 && /pg_advisory_xact_lock\(hashtext\(\?\)\)::text/.test(db.kayit.kilitSql[0]), js(db.kayit.kilitSql));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  B · BAĞLANTI — gerçek QuotesService.exportXlsx
// ═══════════════════════════════════════════════════════════════════════════
const fxSabit: any = {
  getRates: async () => ({ usdTry: 47.35, eurTry: 54.1, usdTryBuying: 47.35, eurTryBuying: 54.1, source: 'tcmb', date: '30.09.2026' }),
};
const ciktiTeklifi = (id: string, ek: Partial<Satir> = {}): Satir => teklif(id, 'fA', null, {
  title: `Teklif ${id}`, sheets: [], originalFile: Buffer.from('x'), exportOverrides: null,
  displayCurrency: 'TRY', displayLanguage: 'tr', musteri: null, proje: null, hazirlayan: null, gecerlilik: null, ...ek,
});
const KIM: any = { userId: 'u-fA', firmaId: 'fA', teklifKapsami: 'firma' };
/** Gercek `exportXlsx` yili SAATTEN okur: beklenen de saatten (sabit yil
 *  1 Ocak'ta kirmiziya donen saatli bombadir). */
const BU_YIL = new Date().getFullYear();
const no = (sira: string) => `MP-${BU_YIL}-${sira}`;

async function bolumB() {
  console.log('\n── B · bağlantı (gerçek exportXlsx) ──');
  const ceviriRet = {
    onbellekHaritasi: async () => ({}),
    disaAktarimCevirisi: async () => { throw new BadRequestException('İngilizce çeviri eksik (test)'); },
  };

  {
    const db = sahteDb([ciktiTeklifi('q1'), ciktiTeklifi('q2')]);
    const svc = new QuotesService(db.prisma, fxSabit, ceviriRet as any);
    const r = await Promise.allSettled([svc.exportXlsx(KIM, 'q1'), svc.exportXlsx(KIM, 'q2')]);
    const ozet = r.map((x) => (x.status === 'fulfilled' ? { no: x.value.quoteNo, dosya: x.value.filename } : { hata: String((x.reason as any)?.message) }));
    const nolar = ozet.map((o: any) => o.no);
    check('B1 ⭐ aynı firmada iki teklif EŞ ZAMANLI dışa aktarılır → farklı numaralar, hata yok',
      r.every((x) => x.status === 'fulfilled') && [...nolar].sort().join() === `${no('001')},${no('002')}`, js(ozet));
    check('B1b dosya adı ve kayıt atanan numarayı taşır',
      ozet.every((o: any) => o.dosya?.startsWith(`${o.no} Rev.01`)) && db.satir('q1').quoteNo !== db.satir('q2').quoteNo
      && [db.satir('q1').quoteNo, db.satir('q2').quoteNo].sort().join() === `${no('001')},${no('002')}`, js({ ozet, t: db.tablo.map((t) => t.quoteNo) }));

    const ikinci = await svc.exportXlsx(KIM, 'q1');
    check('B2 aynı teklifin yeni çıktısı: numara SABİT, rev artar (T10)',
      ikinci.quoteNo === db.satir('q1').quoteNo && ikinci.rev === 2 && db.satir('q1').rev === 2, js({ no: ikinci.quoteNo, rev: ikinci.rev }));
  }

  {
    const db = sahteDb([ciktiTeklifi('q3')]);
    const svc = new QuotesService(db.prisma, fxSabit, ceviriRet as any);
    const r = await dene(() => svc.exportXlsx(KIM, 'q3', 'en'));
    check('B3 ⭐ reddedilen İngilizce indirme numara YAKMAZ (R1-B6): ret, numara yok, kilit yok, yazım yok',
      !!r.hata && db.satir('q3').quoteNo === null && db.kayit.kilitSql.length === 0 && db.kayit.guncellemeler.length === 0,
      js({ hata: r.hata?.message, no: db.satir('q3').quoteNo, kilit: db.kayit.kilitSql.length }));
  }

  {
    // Kesin ret: orijinal dosya yok → her denemede reddedilecek; numara YAKMAZ.
    const db = sahteDb([ciktiTeklifi('q4', { originalFile: null })]);
    const svc = new QuotesService(db.prisma, fxSabit, ceviriRet as any);
    const r = await dene(() => svc.exportXlsx(KIM, 'q4'));
    check('B4a ⭐ kesin ret (orijinal dosya yok) numara ALMAZ: 400, kilit yok, yazım yok',
      r.hata?.getStatus?.() === 400 && db.satir('q4').quoteNo === null && db.kayit.kilitSql.length === 0 && db.kayit.guncellemeler.length === 0,
      js({ hata: r.hata?.message, no: db.satir('q4').quoteNo, kilit: db.kayit.kilitSql.length }));
  }

  {
    // Gecici hata: numara atandiktan SONRA format okunamadi → numara teklifte kalir.
    const db = sahteDb([ciktiTeklifi('q5')]);
    db.prisma.quoteFormat = { findFirst: async () => { throw new Error('format okunamadı (test)'); } };
    const svc = new QuotesService(db.prisma, fxSabit, ceviriRet as any);
    const r = await dene(() => svc.exportXlsx(KIM, 'q5'));
    check('B4b üretim geçici hatayla düşerse numara bu teklifte KALIR (yanmaz, başkasına verilmez)',
      /format okunamad/.test(String(r.hata?.message)) && db.satir('q5').quoteNo === no('001') && db.satir('q5').rev === 0,
      js({ hata: r.hata?.message, no: db.satir('q5').quoteNo, rev: db.satir('q5').rev }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  E · KAYNAK / ŞEMA / GÖÇ EŞLİĞİ
// ═══════════════════════════════════════════════════════════════════════════
function bolumE() {
  console.log('\n── E · kaynak, şema, göç ──');
  const servis = kodu(oku('src/ozellik/teklif/quotes/quotes.service.ts'));
  const exportGovdesi = servis.slice(servis.indexOf('async exportXlsx('), servis.indexOf('async exportPricedXlsx('));
  check('E-OLCUT exportXlsx gövdesi bulundu', exportGovdesi.length > 200, `uzunluk=${exportGovdesi.length}`);
  check('E1 ⭐ exportXlsx numarayı teklifNoAta ile atar', /teklifNoAta\(\s*this\.prisma\s*,\s*k\.firmaId\s*,\s*id\s*,/.test(exportGovdesi));
  check('E1b exportXlsx sayımla numara ÜRETMEZ (eski `quote.count` + 1 yolu yok)', !/quote\.count\(/.test(exportGovdesi));
  const atama = exportGovdesi.indexOf('teklifNoAta(');
  check('E1c atama çeviri kapısından SONRA, dosya üretiminden ÖNCE (R1-B6 + kalıcı numara)',
    atama > exportGovdesi.indexOf('disaAktarimCevirisi(') && atama < exportGovdesi.indexOf('this.ciktiKur('),
    js({ atama, ceviri: exportGovdesi.indexOf('disaAktarimCevirisi('), kur: exportGovdesi.indexOf('this.ciktiKur(') }));

  const kural = kodu(oku('src/ozellik/teklif/quotes/teklif-no.ts'));
  check('E2 kilit öneki `teklif-no:` (üyelik kilidi `firma-uyelik:` ile PAYLAŞILMAZ)',
    /hashtext\(\$\{`teklif-no:\$\{firmaId\}`\}\)/.test(kural) && !/firma-uyelik:/.test(kural));

  const sema = oku('prisma/schema.prisma');
  const quoteModeli = sema.slice(sema.indexOf('model Quote {'), sema.indexOf('\n}', sema.indexOf('model Quote {')));
  check('E3 şemada Quote @@unique([firmaId, quoteNo])', /^\s*@@unique\(\[firmaId, quoteNo\]\)/m.test(quoteModeli));

  const gocKlasoru = fs.readdirSync(path.join(KOK, 'prisma/migrations')).find((k) => k.endsWith('_teklif_no_tekilligi'));
  check('E4 göç klasörü var ve P1\'in göçünden (20260930100000) SONRA sıralanır',
    !!gocKlasoru && gocKlasoru > '20260930100000_iscilik_kalemi_sahipligi', String(gocKlasoru));
  const gocSql = gocKlasoru ? sqlKodu(oku(`prisma/migrations/${gocKlasoru}/migration.sql`)) : '';
  check('E5 göç YALNIZ tekil indeksi açar (prisma migrate diff çıktısıyla birebir)',
    gocSql === 'CREATE UNIQUE INDEX "Quote_firmaId_quoteNo_key" ON "Quote"("firmaId", "quoteNo");', gocSql);
}

async function main() {
  bolumS();
  await bolumK();
  await bolumB();
  bolumE();
  console.log(`\n${'='.repeat(64)}`);
  console.log(`TEKLIF NO: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}));
