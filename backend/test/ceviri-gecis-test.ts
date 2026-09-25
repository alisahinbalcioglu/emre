/**
 * FAZ 6 ÇEVİRİ GEÇİŞ İZNİ BETİĞİ (K-T6, 15.09.2026)  (`npm run test:ceviri-gecis`)
 *
 * DB'siz (sahte Prisma `ceviri-sahte-db.ts`). Betik canlıya karşı KOŞULMAZ;
 * burada gerçek `gecisKos` + gerçek kanıt fonksiyonu sınanır.
 *  C1-C6  sınıf kuralı (R1-B3 + T1 incelemesi DÜŞÜK-2): GUCLU ancak (K1∨K2) ∧
 *         değişecek>0 ∧ K3 ∧ K5=%100 ∧ karşılıksız=0; değişecek 0 + karşılıksız>0
 *         → CEVIRI_GEREKLI (izin yazılmaz)
 *  C14    BAĞLANTI: karşılıksız satırlı teklifler PROVA'da doğru sınıf ve gerekçeyle,
 *         --onayli CEVIRI_GEREKLI'yi yazmaz
 *  C15    DÜŞÜK-4 ipucu: son değişiklik = çıktı alımı anı → öneride ipucu, sınıf aynı
 *  C7     K5 yalnız DEĞİŞECEK satırların metinlerinden
 *  C8     K0: eski (v1) özetli ödenmiş kayıt yeniden anahtarlanır
 *  C9     BAĞLANTI: yazılan izni kodun kanıt fonksiyonu ödenmiş sayar
 *  C10    PROVA hiçbir şey yazmaz; son 10 dakikadaki yarım çeviri sayısını basar
 *  C11    --uygula yalnız onaylı GUCLU/ZAYIF'ı, --k0 yalnız K0'ı yazar; farklı
 *         özetli izni ezmez; bulunamayan kimlik → dönüş 1
 *  C12    kota migration kaydı yoksa durur
 *  C13    --geri-al PROVA'da silmez; --uygula ile yalnız betiğin yazdığını siler
 *
 * Çıkış kodu sözleşmesi: 0 = PASS · 1 = FAIL (`process.exitCode`).
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import {
  GECIS_BETIGI,
  KOTA_MIGRATION,
  TEKLIF_ALANLARI_MIGRATION,
  adayOlc,
  gecisKos,
  gecisSinifi,
  type GecisAdayi,
} from '../scripts/ceviri-gecis-izni';
import { CEVIRI_KAYNAK_ALANI, CEVIRI_SONUC_ALANI, ceviriIcerigi } from '../src/ozellik/giris/ai/ceviri-kurali';
import { gecisAnahtari } from '../src/ozellik/odeme/abonelik/ceviri-kotasi';
import { CeviriKotaServisi } from '../src/ozellik/odeme/abonelik/ceviri-kota.servisi';
import { CeviriService } from '../src/ozellik/giris/ai/ceviri.service';
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

const DK = 60_000;
const KESIM = new Date('2026-09-14T10:06:00.000Z');
const ONCE = new Date('2026-09-12T08:00:00.000Z');
const SONRA = new Date('2026-09-14T12:00:00.000Z');
const SIMDI = new Date('2026-09-15T20:00:00.000Z');
const ROLLER = { noField: '_no', nameField: '_ad', quantityField: '_miktar', unitField: '_birim', materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam' };
const satir = (ad: string, ek: Kayit = {}): Kayit => ({ _isDataRow: true, _no: '1', _ad: ad, _miktar: 1, _birim: 'Ad.', _matBirim: '10', _matToplam: '10', ...ek });
const sayfa = (satirlar: Kayit[]): Kayit[] => [{ index: 0, name: 'Mekanik', isEmpty: false, columnRoles: ROLLER, rowData: satirlar }];
const isaretli = (en: string, tr: string) => satir(en, { [CEVIRI_KAYNAK_ALANI]: tr, [CEVIRI_SONUC_ALANI]: en });

/** Saf sınıf vakaları için taban aday. */
function aday(ek: Partial<GecisAdayi>): GecisAdayi {
  return {
    quoteId: 'q', firmaId: 'f1', firmaAdi: 'Firma A', quoteNo: 'MP-2026-001', baslik: 'Teklif', L: true, isaretliSatir: 0,
    satirSayisi: 5, degisecek: 3, karsiliksiz: 0, odenmis: false, v1Odenmis: false, updatedAt: ONCE, K3: true, K3ciktiIpucu: false,
    ciktiSayisi: 0, ilkCikti: null, K4: false, K5: 100, ozet: 'ozet', ...ek,
  };
}

// Teklifler (hepsi f1). Kimlikler sıralama için alfabetik.
const QG = '10000000-0000-4000-8000-000000000001'; // GUCLU: L, işaretsiz (K2), K3, K5 %100
const QZ = '10000000-0000-4000-8000-000000000002'; // ZAYIF: işaretli (K1) + K4, ama kesimden sonra değişti (K3 yok)
const QN = '10000000-0000-4000-8000-000000000003'; // GEREKMIYOR: değişecek satır yok
const QK = '10000000-0000-4000-8000-000000000004'; // K0: eski (v1) özetli BASARILI eşleşiyor
const QD = '10000000-0000-4000-8000-000000000005'; // farklı özetli izin zaten var
const Q5 = '10000000-0000-4000-8000-000000000006'; // C7: değişecek olmayan metin kesimden sonra önbelleğe girmiş
const QKS = '10000000-0000-4000-8000-000000000007'; // DÜŞÜK-2: GUCLU koşulları + karşılıksız 1 satır → ZAYIF
const QDK = '10000000-0000-4000-8000-000000000008'; // DÜŞÜK-2: değişecek 0 + karşılıksız 1 → CEVIRI_GEREKLI
const QIP = '10000000-0000-4000-8000-000000000009'; // DÜŞÜK-4: kesimden sonra yalnız çıktı alınmış (updatedAt ≈ çıktı)
const Q_YOK = '10000000-0000-4000-8000-0000000000ff';

const SAYFALAR: Record<string, Kayit[]> = {
  [QG]: sayfa([satir('PVC BORU'), satir('KABLO KANALI')]),
  [QZ]: sayfa([isaretli('STEEL PIPE', 'ÇELİK BORU'), satir('PVC BORU')]),
  [QN]: sayfa([satir('GEBERIT'), satir('DN 20')]),
  [QK]: sayfa([satir('BAKIR BORU')]),
  [QD]: sayfa([satir('PVC BORU')]),
  [Q5]: sayfa([satir('PVC BORU'), isaretli('BRASS VALVE', 'PİRİNÇ VANA')]),
  [QKS]: sayfa([satir('PVC BORU'), satir('HAVA DAMPERİ')]),
  [QDK]: sayfa([isaretli('STEEL PIPE', 'ÇELİK BORU'), satir('HAVA DAMPERİ')]),
  [QIP]: sayfa([satir('KABLO KANALI')]),
};

async function ingilizceCikti(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Summary').getCell('A1').value = 'Grand Total';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function kur(ek: { gocler?: Kayit[]; ayarlar?: Record<string, string>; tuketim?: Kayit[] } = {}) {
  const teklif = (id: string, e: Kayit): Kayit => ({ id, firmaId: 'f1', title: `Teklif ${id.slice(-2)} — Müşteri Adı Uzun Bir Başlık`, quoteNo: null, displayLanguage: 'tr', updatedAt: ONCE, sheets: JSON.parse(JSON.stringify(SAYFALAR[id])), ...e });
  const ceviri = (sourceText: string, translatedText: string, createdAt: Date): Kayit => ({ sourceText, targetLang: 'en', translatedText, kaynak: 'ai', createdAt });
  const kIcerik = ceviriIcerigi(SAYFALAR[QK]);
  const s = sahteDb({
    migrations: ek.gocler ?? [
      { migration_name: TEKLIF_ALANLARI_MIGRATION, finished_at: new Date('2026-09-09T10:00:00.000Z') },
      { migration_name: KOTA_MIGRATION, finished_at: KESIM },
    ],
    quote: [
      teklif(QG, { displayLanguage: 'en' }),
      teklif(QZ, { updatedAt: SONRA }),
      teklif(QN, { displayLanguage: 'en' }),
      teklif(QK, {}),
      teklif(QD, { displayLanguage: 'en' }),
      teklif(Q5, { displayLanguage: 'en' }),
      teklif(QKS, { displayLanguage: 'en' }),
      teklif(QDK, { displayLanguage: 'en' }),
      teklif(QIP, { displayLanguage: 'en', updatedAt: SONRA }),
      { id: '10000000-0000-4000-8000-0000000000aa', firmaId: null, title: 'atanmamış', displayLanguage: 'en', updatedAt: ONCE, sheets: sayfa([satir('PVC BORU')]) },
    ],
    translation: [
      ceviri('PVC BORU', 'PVC PIPE', ONCE),
      ceviri('KABLO KANALI', 'CABLE TRAY', ONCE),
      ceviri('ÇELİK BORU', 'STEEL PIPE', ONCE),
      ceviri('GEBERIT', 'GEBERIT', ONCE),
      ceviri('BAKIR BORU', 'COPPER PIPE', SONRA),
      ceviri('PİRİNÇ VANA', 'BRASS VALVE', SONRA),
    ],
    quoteExport: [
      { id: 'ex-1', quoteId: QZ, rev: 1, fileName: 'x.xlsx', xlsxBytes: await ingilizceCikti(), createdAt: ONCE },
      // QIP: kesimden sonraki tek dokunuş Teklif Formatı çıktısı (quote.update ile aynı transaction, 40 ms fark)
      { id: 'ex-2', quoteId: QIP, rev: 1, fileName: 'y.xlsx', xlsxBytes: await ingilizceCikti(), createdAt: new Date(SONRA.getTime() + 40) },
    ],
    ceviriTuketimi: ek.tuketim ?? [
      { id: 'tk-v1', firmaId: 'f1', userId: 'u1', quoteId: QK, hedefDil: 'en', icerikOzeti: kIcerik.eskiOzet, durum: 'BASARILI', satirSayisi: 1, dusulenSatir: 1, toplamTeslim: 1, devam: false, olusturuldu: SONRA, sonuclandi: SONRA },
      { id: 'tk-yarim', firmaId: 'f2', userId: 'u2', quoteId: 'baska', hedefDil: 'en', icerikOzeti: 'x', durum: 'KISMI', satirSayisi: 3, dusulenSatir: 2, toplamTeslim: 2, devam: false, olusturuldu: new Date(SIMDI.getTime() - 4 * DK), sonuclandi: new Date(SIMDI.getTime() - 3 * DK) },
    ],
    systemSettings: Object.entries(ek.ayarlar ?? {
      [gecisAnahtari(QD, 'en')]: JSON.stringify({ surum: 1, firmaId: 'f1', quoteId: QD, hedefDil: 'en', icerikOzeti: 'eski-icerik', sinif: 'GUCLU', kanit: 'K2+K3+K5', yazildi: '2026-09-15T00:00:00.000Z', betik: GECIS_BETIGI }),
    }).map(([key, value]) => ({ key, value })),
    firma: [{ id: 'f1', ad: 'Firma A' }],
  });
  const cikti: string[] = [];
  const kos = (argv: string[]) => gecisKos(s.db, argv, (x) => cikti.push(x), SIMDI);
  const izin = (id: string) => s.t.systemSettings.find((k) => k.key === gecisAnahtari(id, 'en'));
  return { s, cikti, kos, izin };
}

async function main(): Promise<void> {
  console.log('\nC) Geçiş izni betiği');

  check('C1 (K2) ∧ değişecek>0 ∧ K3 ∧ K5=%100 → GUCLU', gecisSinifi(aday({})).sinif === 'GUCLU');
  check('C2 ★ K1 + K4 ama K3 yanlış → ZAYIF (K4 yalnız destek bilgisi)', gecisSinifi(aday({ L: false, isaretliSatir: 2, K4: true, K3: false })).sinif === 'ZAYIF', JSON.stringify(gecisSinifi(aday({ L: false, isaretliSatir: 2, K4: true, K3: false }))));
  check('C3 K2+K3 ama K5 %99 → ZAYIF', gecisSinifi(aday({ K5: 99 })).sinif === 'ZAYIF');
  check('C4 K3 ölçülemez (null) → ZAYIF', gecisSinifi(aday({ K3: null })).sinif === 'ZAYIF');
  check('C5 ödenmiş → GEREKMIYOR', gecisSinifi(aday({ odenmis: true })).sinif === 'GEREKMIYOR');
  {
    const c6 = gecisSinifi(aday({ degisecek: 0 }));
    check('C6 değişecek 0 + karşılıksız 0 → GEREKMIYOR, gerekçe "kapı sorulmaz"', c6.sinif === 'GEREKMIYOR' && c6.gerekce.includes('kapı sorulmaz'), JSON.stringify(c6));
    const c6b = gecisSinifi(aday({ degisecek: 0, karsiliksiz: 2 }));
    check('C6b ★ değişecek 0 + karşılıksız 2 → CEVIRI_GEREKLI (yazılamaz); gerekçe dosyanın DURDUĞUNU ve 2 satırı söyler, "kapı sorulmaz" demez',
      c6b.sinif === 'CEVIRI_GEREKLI' && c6b.gerekce.includes('durur') && c6b.gerekce.includes('2 satır') && !c6b.gerekce.includes('kapı sorulmaz'), JSON.stringify(c6b));
    const c1b = gecisSinifi(aday({ karsiliksiz: 1 }));
    check('C1b ★ GUCLU koşulları + karşılıksız 1 → ZAYIF; gerekçe izin sonrası kotasız çeviriyi söyler',
      c1b.sinif === 'ZAYIF' && c1b.gerekce.includes('karşılığı olmayan 1 satır') && c1b.gerekce.includes('kotasız'), JSON.stringify(c1b));
    const c1c = gecisSinifi(aday({ K3: false, karsiliksiz: 3 }));
    check('C1c ZAYIF gerekçesi birden fazla nedeni birlikte söyler (K3 + karşılıksız)', c1c.sinif === 'ZAYIF' && c1c.gerekce.includes('kesimden sonra değişmiş olabilir') && c1c.gerekce.includes('3 satır'), JSON.stringify(c1c));
  }

  {
    const { s } = await kur();
    const kota = new CeviriKotaServisi(s.db);
    const ortam = { kesim: KESIM, k3Olculebilir: true, kota, ceviri: new CeviriService(s.db, {} as any, kota) };
    const q = (id: string): any => s.t.quote.find((x) => x.id === id)!;
    const a5 = await adayOlc(s.db, q(Q5), q(Q5).sheets, ortam);
    check('C7 ★ K5 yalnız değişecek satırlardan: kesimden sonra önbelleğe giren İngilizce-kayıtlı satır metni K5\'i düşürmez',
      a5.degisecek === 1 && a5.isaretliSatir === 1 && a5.K5 === 100 && gecisSinifi(a5).sinif === 'GUCLU',
      JSON.stringify({ d: a5.degisecek, i: a5.isaretliSatir, K5: a5.K5, s: gecisSinifi(a5) }));
    const ak = await adayOlc(s.db, q(QK), q(QK).sheets, ortam);
    check('C8 K0: v1 özetli BASARILI + güncel v1 eşleşiyor → K0 (v2 kayıt yok)', ak.v1Odenmis === true && ak.odenmis === false && gecisSinifi(ak).sinif === 'K0', JSON.stringify({ v1: ak.v1Odenmis, o: ak.odenmis }));
    const az = await adayOlc(s.db, q(QZ), q(QZ).sheets, ortam);
    check('C2b gerçek ölçüm: işaretli + İngilizce çıktı (K4) ama kesimden sonra değişmiş → ZAYIF', az.K4 === true && az.K3 === false && gecisSinifi(az).sinif === 'ZAYIF', JSON.stringify({ K4: az.K4, K3: az.K3, s: gecisSinifi(az) }));
  }

  {
    const { s, cikti, kos } = await kur();
    const kod = await kos([]);
    const metin = cikti.join('\n');
    check('C10 ★ PROVA: systemSettings upsert/delete 0, son 10 dakikadaki yarım çeviri sayısı basıldı, dönüş 0',
      kod === 0 && s.say('systemSettings.upsert') === 0 && s.say('systemSettings.delete') === 0 && /Son 10 dakikada yarım kalan çeviri: 1/.test(metin) && /PROVA \(hiçbir şey yazılmadı\)/.test(metin),
      metin.split('\n').slice(0, 5).join(' / '));
    check('C10b PROVA tablosu: aday sınıfları, K0 ayrı başlıkta, atanmamış teklif taranmaz, başlık 30 karakter',
      metin.includes(`${QG} |`) && /\| GUCLU \| yaz/.test(metin) && /K0 — 14.09 sonrası/.test(metin) && !metin.includes('atanmamış') && !metin.includes('Uzun Bir Başlık'),
      metin);
  }

  {
    const { s, cikti, kos, izin } = await kur();
    const kod = await kos(['--uygula', '--onayli', QG, QZ, QN, QK, QD, Q_YOK]);
    const metin = cikti.join('\n');
    const dYeni = JSON.parse(izin(QD)!.value);
    check('C11 ★ --uygula --onayli: GUCLU ve ZAYIF yazılır; GEREKMIYOR ve K0 yazılmaz; farklı özetli izin EZİLMEZ; bulunamayan → dönüş 1',
      kod === 1 && !!izin(QG) && !!izin(QZ) && !izin(QN) && !izin(QK) && dYeni.icerikOzeti === 'eski-icerik' &&
      new RegExp(`${Q_YOK} \\| BULUNAMADI`).test(metin) && /İÇERİK DEĞİŞMİŞ/.test(metin) && s.say('systemSettings.upsert') === 2,
      metin);
    const g = JSON.parse(izin(QG)!.value);
    check('C11b yazılan değer §2.1 biçiminde (surum 1, firma, teklif, dil, v2 özet, sınıf, kanıt, betik)',
      g.surum === 1 && g.firmaId === 'f1' && g.quoteId === QG && g.hedefDil === 'en' && g.icerikOzeti === ceviriIcerigi(SAYFALAR[QG]).ozet && g.sinif === 'GUCLU' && g.kanit === 'K2+K3+K5' && g.betik === GECIS_BETIGI,
      izin(QG)!.value);

    const kota = new CeviriKotaServisi(s.db);
    (kota as any).logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
    const q = s.t.quote.find((x) => x.id === QG)!;
    const kanit = await kota.odenmisIcerikKaniti({ userId: 'u1', firmaId: 'f1' }, QG, 'en', ceviriIcerigi(q.sheets));
    check('C9 ★ BAĞLANTI: betiğin yazdığı izni kodun kanıt fonksiyonu ödenmiş sayar (GECIS)', kanit.odenmis === true && (kanit as any).kaynak === 'GECIS', JSON.stringify(kanit));

    cikti.length = 0;
    const kod2 = await kos(['--uygula', '--k0']);
    check('C11c --uygula --k0 yalnız K0\'ı yazar (onaylıların üzerine dokunmaz)', kod2 === 0 && !!izin(QK) && JSON.parse(izin(QK)!.value).sinif === 'K0' && s.say('systemSettings.upsert') === 3 && !izin(QN) && !izin(Q5), cikti.join('\n'));
  }

  {
    const { s, cikti, kos, izin } = await kur();
    const kota = new CeviriKotaServisi(s.db);
    const ortam = { kesim: KESIM, k3Olculebilir: true, kota, ceviri: new CeviriService(s.db, {} as any, kota) };
    const q = (id: string): any => s.t.quote.find((x) => x.id === id)!;
    const aKs = await adayOlc(s.db, q(QKS), q(QKS).sheets, ortam);
    const aDk = await adayOlc(s.db, q(QDK), q(QDK).sheets, ortam);
    check('C14 FIXTURE KANITI: QKS değişecek 1 + karşılıksız 1 (K2, K3, K5 %100); QDK değişecek 0 + karşılıksız 1',
      aKs.degisecek === 1 && aKs.karsiliksiz === 1 && aKs.K3 === true && aKs.K5 === 100 && aKs.L && aDk.degisecek === 0 && aDk.karsiliksiz === 1,
      JSON.stringify({ ks: [aKs.degisecek, aKs.karsiliksiz, aKs.K3, aKs.K5], dk: [aDk.degisecek, aDk.karsiliksiz] }));
    await kos([]);
    const metin = cikti.join('\n');
    const satirOf = (id: string) => cikti.find((x) => x.startsWith(`${id} |`)) ?? '';
    check('C14 ★ BAĞLANTI (PROVA): karşılıksız satırlı teklif ZAYIF + kotasız uyarısı; değişecek 0 + karşılıksız → CEVIRI_GEREKLI "durur"; özet satırı sayar',
      /\| ZAYIF \| Emre karar verir — .*karşılığı olmayan 1 satır var.*kotasız/.test(satirOf(QKS)) &&
      /\| CEVIRI_GEREKLI \| izin yazılmaz — İngilizce dosya durur/.test(satirOf(QDK)) && !satirOf(QDK).includes('kapı sorulmaz') &&
      /CEVIRI_GEREKLI 1/.test(metin),
      [satirOf(QKS), satirOf(QDK)].join(' // '));
    cikti.length = 0;
    const kod = await kos(['--uygula', '--onayli', QDK]);
    check('C14b --uygula --onayli CEVIRI_GEREKLI teklifi YAZMAZ (ATLANDI + gerekçe), upsert 0',
      kod === 0 && !izin(QDK) && s.say('systemSettings.upsert') === 0 && cikti.join('\n').includes(`${QDK} | ATLANDI (CEVIRI_GEREKLI: izin yazılmaz`),
      cikti.join(' / '));
    const aIp = await adayOlc(s.db, q(QIP), q(QIP).sheets, ortam);
    const aZ = await adayOlc(s.db, q(QZ), q(QZ).sheets, ortam);
    check('C15 DÜŞÜK-4 ipucu: son değişiklik çıktı alımıyla aynı anda → ipucu var, sınıf yine ZAYIF; eski çıktılı ama sonradan değişmiş teklifte ipucu YOK',
      aIp.K3 === false && aIp.K3ciktiIpucu === true && gecisSinifi(aIp).sinif === 'ZAYIF' && aZ.K3 === false && aZ.K3ciktiIpucu === false,
      JSON.stringify({ ip: [aIp.K3, aIp.K3ciktiIpucu], z: [aZ.K3, aZ.K3ciktiIpucu] }));
    cikti.length = 0;
    await kos([]);
    const satirIp = cikti.find((x) => x.startsWith(`${QIP} |`)) ?? '';
    const satirZ = cikti.find((x) => x.startsWith(`${QZ} |`)) ?? '';
    check('C15b PROVA öneri sütununda ipucu yalnız o satırda', satirIp.includes('ipucu: son değişiklik bir çıktı alımıyla aynı anda') && !satirZ.includes('ipucu'), [satirIp, satirZ].join(' // '));
  }

  {
    const { s, cikti, kos } = await kur({ gocler: [{ migration_name: TEKLIF_ALANLARI_MIGRATION, finished_at: new Date('2026-09-09T10:00:00.000Z') }] });
    const kod = await kos([]);
    check('C12 kota migration kaydı yoksa durur: dönüş 1, teklif taranmaz', kod === 1 && /uygulanmamış/.test(cikti.join('\n')) && !cikti.some((x) => x.startsWith('Taranan')), cikti.join(' / '));
  }

  {
    const elle = JSON.stringify({ surum: 1, firmaId: 'f1', quoteId: QN, hedefDil: 'en', icerikOzeti: 'x' });
    const betikten = JSON.stringify({ surum: 1, firmaId: 'f1', quoteId: QG, hedefDil: 'en', icerikOzeti: 'y', betik: GECIS_BETIGI });
    const { s, cikti, kos, izin } = await kur({ ayarlar: { [gecisAnahtari(QG, 'en')]: betikten, [gecisAnahtari(QN, 'en')]: elle } });
    const prova = await kos(['--geri-al', QG, QN]);
    const provaSonrasi = !!izin(QG) && !!izin(QN) && s.say('systemSettings.delete') === 0;
    cikti.length = 0;
    const kod = await kos(['--uygula', '--geri-al', QG, QN]);
    check('C13 --geri-al PROVA\'da silmez; --uygula ile yalnız betiğin yazdığı izni siler, elle yazılanı atlar',
      prova === 0 && provaSonrasi && kod === 0 && !izin(QG) && !!izin(QN) && s.say('systemSettings.delete') === 1 && /ATLANDI/.test(cikti.join('\n')),
      cikti.join(' / '));
  }
}

bitmezseKirmizi(main()
  .catch((e) => {
    failures.push(`beklenmedik hata: ${(e as Error)?.stack ?? e}`);
  })
  .finally(() => {
    console.log(`\nÇEVİRİ GEÇİŞ İZNİ: ${passed} PASS · ${failures.length} FAIL`);
    if (failures.length > 0) {
      console.log('\nKALANLAR:');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exitCode = 1;
    }
  }));
