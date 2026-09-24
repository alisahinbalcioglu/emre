/**
 * HESAP DOGRULUGU TURU (13.09.2026) — CIKTI HESABININ DEGISMEZLERI
 *   npx ts-node test/hesap-dogrulugu-test.ts   (npm run test:hesap)
 *
 * NEDEN BU KAPI: bu urunun tek isi metrajdan fiyat cikarmak. Musteriye giden
 * rakam Excel ciktisindadir; oradaki ICMAL/SUM'u HUCRELERDEN yeniden
 * hesaplayan tek bir test bile yoktu (olculdu: 5 cikti paketi SUM araligini
 * 3 satir kaydiran mutanti 4/5 hayatta birakti, SIM-12 yalniz sabit "F2:F3"
 * metnine bakiyordu). Excel dosyayi Korumali Gorunum'de ONBELLEK degeriyle,
 * duzenleme acilinca FORMUL degeriyle gosterir — ikisi de dogru olmak zorunda.
 *
 * OLCUT BAGIMSIZLIGI (dairesel olcut yasak): beklenen deger motorun kendi
 * `matDeger`inden DEGIL, ekranin tek hesap modulunden (frontend
 * `sayfaToplamlari`) ve formullerin degerlendiriciyle (`cikti-test-yardimci.ts`)
 * hucrelerden yeniden hesabindan gelir. Degerlendiricinin kendisi H0'da sinanir;
 * Excel'in formul sinirlari (8192 karakter, SUM 255 arguman) AYRICA olculur —
 * asan dosyayi gercek Excel HIC ACMIYOR (13.09 olculdu).
 *
 * Bloklar:
 *  H0  formul degerlendiricisi (olcutun kendisi)
 *  H1  "İCMAL toplamı = sayfa toplamlarının toplamı" — iki cikti yolu,
 *      sentetik (ara-toplam _ozet satiri + ozet sayfasi) + 3 gercek dosya,
 *      her biri ANTETSIZ ve ANTETLI (Gorev 2: antet satirlari tabloyu kaydirir)
 *  H2  ekran = cikti (kurusu kurusuna) ve iki yol ayni rakam (ikiz)
 *  H3  KDV: oranlar, muafiyet, etiketsiz format
 *  H4  kur: USD cevrimi, kur yok / servis hatasi, ICMAL para bicimi, tek kur
 *  H5  bos / tek kalemli teklif, katkisiz sayfa, 300 ara toplamli sinir sayfasi
 *  H6  format yolu oz-denetim sayaclari
 *  H7  FE ↔ BE fiyat cekirdegi paritesi
 *  H8  eski kayitli override'lar: onbellek = formul, para bicimi yalniz para hucresine
 *
 * Cikis kodu: 0 = PASS · 1 = FAIL (fixture'lar depoda; SKIP yok).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { standartCiktiUret } from '../src/ozellik/teklif/quotes/standart-cikti';
import { buildExportWorkbook } from '../src/ozellik/teklif/quotes/export-engine';
import { buildSampleFormat, fillPlaceholders } from '../src/ozellik/cikti/quote-formats/format-engine';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { ExchangeRatesService } from '../src/ozellik/fiyat/exchange-rates/exchange-rates.service';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
import * as BE from '../src/ozellik/fiyat/matching/pricing';
import { antetKur } from '../src/ozellik/cikti/utils/antet';
import { TAM_FIRMA, formulDegerlendir, gercek, formulDenetimi } from './cikti-test-yardimci';

// Ekranin TEK hesap modulu — beklenen degerlerin kaynagi (kd11 ile ayni yol).
const FE = require('../../frontend/ozellik/fiyat/pricing');

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const K = (v: number): number => FE.kurusTamsayi(v);
const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 });

// ════════════════════════════════════════════════════════════════════
// FIXTURE'LAR
// ════════════════════════════════════════════════════════════════════
const ROLLER = {
  noField: '_no', nameField: '_ad', quantityField: '_miktar', unitField: '_birim',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam', grandTotalField: '_toplam',
};
const veri = (no: number | string, ad: string, miktar: number | string, mB: string, mT: string, lB = '', lT = '', ek: any = {}) => ({
  _isDataRow: true, _no: String(no), _ad: ad, _miktar: miktar, _birim: 'Ad.',
  _matBirim: mB, _matToplam: mT, _labBirim: lB, _labToplam: lT, ...ek,
});
const grup = (ad: string) => ({ _isDataRow: false, _isHeaderRow: false, _ad: ad });
const sayfa = (name: string, rowData: any[]) => ({ name, isEmpty: false, columnRoles: ROLLER, columnDefs: [], rowData });

/** Uc sayfalik sentetik teklif: gruplar, fiyatsiz satir, 3 ondalikli dosya
 *  toplami, yalniz iscilik satiri, ARA TOPLAM (_ozet) satiri ve musterinin
 *  kendi İcmal'i (tum satirlari _ozet, para _labToplam'da — YILDIZ deseni).
 *  KAYIT YUKU SEKLINDE: `isOzet` bayragi YOK (page.tsx kayit yukunde duser). */
function sentetikTeklif(): any[] {
  return [
    sayfa('Mekanik', [
      { _isHeaderRow: true, _isDataRow: false, _ad: 'Malzeme Adı' },
      grup('KAT 1'),
      veri(1, 'Boru 1"', 100, '152.3', '15230', '25', '2500'),
      veri(2, 'Küresel vana DN50', 5, '1200.5', '6002.5'),
      veri(3, 'Eşleşmemiş kalem', 3, '', ''),
      grup('KAT 2'),
      veri(4, 'Dosyadan 3 haneli toplam', 1, '10.075', '10.075', '1.015', '1.015'),
      veri(5, 'Yalnız işçilik', 2, '', '', '0.285', '0.57'),
    ]),
    sayfa('Elektrik', [
      veri(1, 'NYY 3x2,5 kablo', 250, '42.7', '10675', '3.5', '875'),
      veri('', 'ARA TOPLAM', '', '', '10675', '', '875', { _ozet: true }),
      veri(2, 'Dağıtım panosu', 1, '35000', '35000', '4500', '4500'),
    ]),
    sayfa('İcmal', [
      veri(1, 'MEKANİK', '', '', '21242.58', '', '2501.59', { _ozet: true }),
      veri(2, 'ELEKTRİK', '', '', '45675', '', '5375', { _ozet: true }),
      veri('', 'GENEL TOPLAM', '', '', '66917.58', '', '7876.59', { _ozet: true }),
    ]),
  ];
}

/** Ekranin gordugu sayfa toplamlari (kurus) — beklenenin TEK kaynagi. */
function ekranToplami(sh: any): { mat: number; lab: number } {
  const o = FE.sayfaToplamlari(sh.rowData ?? [], sh.columnRoles ?? {});
  return { mat: Math.round(o.matToplam * 100), lab: Math.round(o.labToplam * 100) };
}

const GERCEK_DOSYALAR = [
  'FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx', // ozet sayfasi _labToplam tasir (62.043.700 dersi)
  '0_Bursa SAHA-BIR inşai işler - Revize Keşif (1).xlsx', // 3 ondalikli dosya toplamlari, 295M
  'FIRMA-D-1.xlsx', // toplam kolonu bos, birim dolu (tamamlama yolu)
];

async function gercekTeklif(dosya: string): Promise<any[]> {
  const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  const parsed = await svc.prepare(fs.readFileSync(path.join(__dirname, '..', '..', 'test-fixtures', 'e2e', dosya)), { fixedSchema: true });
  const sheets = JSON.parse(JSON.stringify(parsed.sheets));
  // Ice aktarmada bos toplamlar tamamlanir (dashboard yolu, pricing.ts toplamlariTamamla)
  for (const sh of sheets) FE.toplamlariTamamla(sh.rowData ?? [], sh.columnRoles ?? {});
  // KAYIT YUKU (quotes/new/page.tsx handleSave): isOzet DUSER, bos yedek satir girmez
  return sheets.map((s: any) => ({
    name: s.name, index: s.index, isEmpty: s.isEmpty, columnDefs: s.columnDefs, columnRoles: s.columnRoles,
    headerEndRow: s.headerEndRow, rowData: (s.rowData ?? []).filter((r: any) => !r._isSpareRow),
  }));
}

const fxSabit = (usdTry = 47.35, eurTry = 54.1): any => ({
  getRates: async () => ({ usdTry, eurTry, usdTryBuying: usdTry, eurTryBuying: eurTry, source: 'tcmb', date: '12.09.2026' }),
});

function servis(sheets: any[], ek: { displayCurrency?: string; fx?: any; firma?: any } = {}) {
  const quote: any = {
    id: 'q1', firmaId: 'f1', title: 'Hesap Turu', sheets, originalFile: Buffer.from('x'), quoteNo: null, rev: 0,
    musteri: 'Müşteri A.Ş.', proje: 'Proje', hazirlayan: 'H', gecerlilik: '30 gün', exportOverrides: null,
    displayCurrency: ek.displayCurrency ?? 'TRY',
  };
  const prisma: any = {
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
    quote: { findFirst: async () => quote, count: async () => 0, update: async ({ data }: any) => Object.assign(quote, data) },
    quoteFormat: { findFirst: async () => null }, // → yerlesik ornek format (T8)
    quoteExport: { create: async () => ({}) },
    firma: { findUnique: async () => ek.firma ?? null },
  };
  return new QuotesService(prisma, ek.fx ?? fxSabit(), { onbellekHaritasi: async () => ({}) } as any);
}
const KIM: any = { userId: 'u1', firmaId: 'f1', teklifKapsami: 'firma' };

async function ac(buf: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
}

/** Fiyatli ciktida bir sayfanin "SAYFA TOPLAMI" satiri (F, H, I kurus).
 *  23.09: hucreler FORMUL — deger onbellekten DEGIL, formulun hucrelerden
 *  bagimsiz yeniden hesabindan okunur (onbellegin kendisi formulDenetimi'nde). */
function sayfaToplamSatiri(ws: ExcelJS.Worksheet): { mat: number; lab: number; genel: number } | null {
  let bulunan: { mat: number; lab: number; genel: number } | null = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (String(row.getCell(2).value ?? '') !== 'SAYFA TOPLAMI') return;
    const n = (c: number) => { const d = gercek(ws.workbook, ws.name, row.getCell(c).address); return d.e !== undefined ? NaN : K(d.v as number); };
    bulunan = { mat: n(6), lab: n(8), genel: n(9) };
  });
  return bulunan;
}

/** 23.09 tarif §4: kalemsiz sayfa METIN yazilir — SAYFA TOPLAMI yok ve hicbir
 *  sayi/formul yok. Oyleyse katkisi 0'dir; sayi tasiyan "metin" sayfasi null. */
function metinSayfasiToplami(ws: ExcelJS.Worksheet): { mat: number; lab: number; genel: number } | null {
  let sayi = 0;
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    const v: any = c.value;
    if (typeof v === 'number' || (v && typeof v === 'object' && typeof v.formula === 'string')) sayi++;
  }));
  return sayi === 0 && ws.columnCount <= 3 ? { mat: 0, lab: 0, genel: 0 } : null;
}

/** B kolonunda metni tam eslesen ilk satir (sabit satir numarasi VARSAYILMAZ). */
function satirBul(ws: ExcelJS.Worksheet, metin: string): ExcelJS.Row {
  let bulunan: ExcelJS.Row | null = null;
  ws.eachRow({ includeEmpty: false }, (row) => { if (!bulunan && String(row.getCell(2).value ?? '').trim() === metin) bulunan = row; });
  if (!bulunan) throw new Error(`${ws.name}: "${metin}" satiri yok`);
  return bulunan;
}

/** Format ciktisindaki ICMAL: bolum satirlari + toplam hucreleri (dolan haritasindan). */
function icmalHucreleri(dolan: Array<{ etiket: string; sheet: string; addr: string }>) {
  const satirlar = dolan.filter((d) => d.etiket === 'ICMAL_SATIRLARI');
  const bolumler: Array<{ ad: string; mat: string; lab: string; top: string; sheet: string }> = [];
  for (let i = 0; i + 3 < satirlar.length; i += 4) {
    bolumler.push({ ad: satirlar[i].addr, mat: satirlar[i + 1].addr, lab: satirlar[i + 2].addr, top: satirlar[i + 3].addr, sheet: satirlar[i].sheet });
  }
  const tek = (e: string) => dolan.find((d) => d.etiket === e);
  return { bolumler, malzeme: tek('MALZEME_TOPLAMI'), iscilik: tek('ISCILIK_TOPLAMI'), kdv: tek('KDV'), genel: tek('GENEL_TOPLAM') };
}

function degerK(wb: ExcelJS.Workbook, sayfaAd: string, addr?: string): number | string {
  if (!addr) return 'hucre-yok';
  const d = gercek(wb, sayfaAd, addr);
  return d.e ? d.e : K(d.v as number);
}

// ════════════════════════════════════════════════════════════════════
// H1 + H2 — bir teklifi IKI yoldan cikar, degismezleri olc
// ════════════════════════════════════════════════════════════════════
async function icmalDegismezi(ad: string, sheets: any[], firma: any = null) {
  if (firma) ad = `${ad} · ANTETLİ`;
  const detay = sheets.filter((s) => !s.isEmpty);
  const ekran = detay.map((s) => ({ ad: s.name, ...ekranToplami(s) }));
  const ekranMat = ekran.reduce((a, s) => a + s.mat, 0);
  const ekranLab = ekran.reduce((a, s) => a + s.lab, 0);

  // ── FIYATLI YOL (GET :id/export-priced) ──
  const priced = await servis(sheets, { firma }).exportPricedXlsx(KIM, 'q1');
  const pwb = await ac(priced.buffer);
  const listeSayfalari = pwb.worksheets.filter((w) => w.name !== 'GENEL TOPLAM');
  // 23.09: kalemsiz sayfa METIN (SAYFA TOPLAMI yok) — katkisi 0; ekran da 0 demeli (H2)
  const sayfaToplamlari = listeSayfalari.map((w) => ({ ad: w.name, t: sayfaToplamSatiri(w) ?? metinSayfasiToplami(w) }));
  const gt = pwb.getWorksheet('GENEL TOPLAM');
  let teklifGenel: number | null = null;
  gt?.eachRow({ includeEmpty: false }, (row) => {
    if (String(row.getCell(1).value ?? '') !== 'TEKLİF GENEL TOPLAMI') return;
    const d = gercek(pwb, 'GENEL TOPLAM', row.getCell(4).address); // formul — hucrelerden yeniden hesap
    if (d.e === undefined) teklifGenel = K(d.v as number);
  });
  const sayfalarGenelK = sayfaToplamlari.reduce((a, s) => a + (s.t?.genel ?? 0), 0);
  check(`İCMAL toplamı = sayfa toplamlarının toplamı [fiyatlı · ${ad}]`,
    teklifGenel !== null && teklifGenel === sayfalarGenelK && sayfaToplamlari.every((s) => s.t !== null),
    `TEKLİF GENEL TOPLAMI=${teklifGenel === null ? 'yok' : tl(teklifGenel)} Σ SAYFA TOPLAMI=${tl(sayfalarGenelK)}`);
  const ekranFarki = ekran.map((e, i) => {
    const t = sayfaToplamlari[i]?.t;
    return t && t.mat === e.mat && t.lab === e.lab ? null : `${e.ad}: ekran ${tl(e.mat)}/${tl(e.lab)} · çıktı ${t ? `${tl(t.mat)}/${tl(t.lab)}` : 'yok'}`;
  }).filter(Boolean);
  check(`H2 ekran sayfa toplamı = çıktı SAYFA TOPLAMI, kuruşu kuruşuna [fiyatlı · ${ad}]`, ekranFarki.length === 0,
    ekranFarki.slice(0, 3).join(' | '));
  const pfd = formulDenetimi(pwb);
  check(`H1 fiyatlı: her formülün önbelleği = hücrelerden yeniden hesabı, hatasız [${ad}]`,
    pfd.sayi > 0 && pfd.sorun.length === 0, `formül=${pfd.sayi} sorun=${pfd.sorun.length}: ${pfd.sorun.slice(0, 2).join(' | ')}`);

  // ── FORMAT YOLU (POST :id/export → buildExportWorkbook, yerlesik ornek format) ──
  const sonuc = await buildExportWorkbook({
    originalFile: Buffer.from('x'), sheetsArr: sheets, formatWb: buildSampleFormat(), sheetRoles: null,
    ctxTemel: { teklifNo: 'MP-T', rev: 1, tarih: '13.09.2026', kurNotu: '', kdvOran: 0.2 },
    antet: antetKur(firma),
  });
  const wb = sonuc.wb;
  // Antetli kosumda antet GERCEKTEN basildi mi (olcutun kendisi: bos kosum yalanci yesil verir)
  if (firma) {
    const ilk = wb.getWorksheet(sonuc.listeSayfalari[0]);
    check(`H1 antetli koşum gerçekten antetli: başlık 1. satırda DEĞİL [${ad}]`,
      !!ilk && String(ilk.getRow(1).getCell(2).value ?? '') === firma.unvan && String(ilk.getRow(1).getCell(1).value ?? '') !== 'No');
  }
  const h = icmalHucreleri(sonuc.dolan);
  const bolumFarki: string[] = [];
  let bolumMatK = 0; let bolumLabK = 0;
  h.bolumler.forEach((b, i) => {
    const m = degerK(wb, b.sheet, b.mat); const l = degerK(wb, b.sheet, b.lab);
    if (typeof m !== 'number' || typeof l !== 'number') { bolumFarki.push(`${ekran[i]?.ad}: hata ${m}/${l}`); return; }
    bolumMatK += m; bolumLabK += l;
    if (!ekran[i] || m !== ekran[i].mat || l !== ekran[i].lab) {
      bolumFarki.push(`${ekran[i]?.ad}: ICMAL(formül) ${tl(m)}/${tl(l)} · ekran ${ekran[i] ? `${tl(ekran[i].mat)}/${tl(ekran[i].lab)}` : 'yok'}`);
    }
  });
  const malz = degerK(wb, h.malzeme?.sheet ?? 'İCMAL', h.malzeme?.addr);
  const isc = degerK(wb, h.iscilik?.sheet ?? 'İCMAL', h.iscilik?.addr);
  const genel = degerK(wb, h.genel?.sheet ?? 'İCMAL', h.genel?.addr);
  const beklenenGenel = K(((ekranMat + ekranLab) / 100) * 1.2);
  check(`İCMAL toplamı = sayfa toplamlarının toplamı [format · ${ad}]`,
    h.bolumler.length === detay.length && bolumFarki.length === 0
      && malz === bolumMatK && isc === bolumLabK && malz === ekranMat && isc === ekranLab && genel === beklenenGenel,
    `bölüm=${h.bolumler.length}/${detay.length} MALZEME=${typeof malz === 'number' ? tl(malz) : malz} (ekran ${tl(ekranMat)}) `
    + `İŞÇİLİK=${typeof isc === 'number' ? tl(isc) : isc} (ekran ${tl(ekranLab)}) GENEL(KDV dahil)=${typeof genel === 'number' ? tl(genel) : genel} `
    + `(beklenen ${tl(beklenenGenel)}) ${bolumFarki.slice(0, 2).join(' | ')}`);
  const fd = formulDenetimi(wb);
  check(`H1 format: her formülün önbelleği = hücrelerden yeniden hesabı, hatasız [${ad}]`,
    fd.sayi > 0 && fd.sorun.length === 0, `formül=${fd.sayi} sorun=${fd.sorun.length}: ${fd.sorun.slice(0, 2).join(' | ')}`);
  const ikiz = h.bolumler.map((b, i) => {
    const t = sayfaToplamlari[i]?.t;
    return t && degerK(wb, b.sheet, b.mat) === t.mat && degerK(wb, b.sheet, b.lab) === t.lab;
  });
  check(`H2 ikiz: iki çıktı yolu her bölüm için aynı rakamı basar [${ad}]`, ikiz.length > 0 && ikiz.every(Boolean),
    `uyuşmayan bölüm=${ikiz.filter((x) => !x).length}`);
  return { sonuc, priced };
}

async function run() {
  // ── H0: degerlendiricinin kendisi ─────────────────────────────────────
  {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet("O'Neil Blok");
    s.getCell('F2').value = 100; s.getCell('F3').value = 'Malz. Toplam'; s.getCell('F5').value = 2.5;
    s.getCell('H2').value = { formula: "SUM('O''Neil Blok'!F2:F5)", result: 102.5 } as any;
    const i = wb.addWorksheet('İCMAL');
    i.getCell('C3').value = { formula: "SUM('O''Neil Blok'!F2:F3,'O''Neil Blok'!F5:F5)+0", result: 102.5 } as any;
    i.getCell('E5').value = { formula: '(C3+C3)*1.2', result: 246 } as any;
    const a = formulDegerlendir(wb, 'İCMAL', "SUM('O''Neil Blok'!F2:F5)");
    const b = gercek(wb, 'İCMAL', 'E5');
    const c = formulDegerlendir(wb, 'İCMAL', "SUM('YOK'!F2:F5)");
    const d = formulDegerlendir(wb, 'İCMAL', "'O''Neil Blok'!F3*2");
    check('H0 değerlendirici: SUM metni/boşu yok sayar, sayfa adı kaçışı, iç içe formül, #REF!, metin aritmetiği hata',
      a.v === 102.5 && b.v === 246 && c.e === '#REF!' && !!d.e && formulDenetimi(wb).sorun.length === 0,
      `a=${a.v} b=${b.v} c=${c.e} d=${d.e}`);
    s.getCell('F2').value = 101; // onbellek artik YANLIS — denetim bunu gormeli
    check('H0 değerlendirici: bayat önbelleği yakalar (ölçütün kendisi kırmızı olabilir)', formulDenetimi(wb).sorun.length === 3,
      `sorun=${formulDenetimi(wb).sorun.length}`);
  }

  // ── H0b (23.09): yeni tasarimin formul dilbilgisi — IF, "", ROUND/ROUNDUP, COUNT ──
  // Kalem satiri `IF(E7="","",ROUND(C7*E7,2))`, uygulama yuvarlamasi ROUNDUP(…,1),
  // Genel Toplam `IF(COUNT(F7,H7)=0,"",SUM(F7,H7))`. Excel ROUND/ROUNDUP'i 15
  // anlamli haneden yapar: 3 × 1,1 = 3,3000000000000003 → ROUNDUP 3,3 (3,4 DEGIL).
  {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet('K');
    s.getCell('C1').value = 3; s.getCell('E1').value = 1.1;
    s.getCell('C2').value = 1; s.getCell('E2').value = 2.675;
    s.getCell('C3').value = 2; // E3 BOS → fiyatsiz kalem
    const f = (x: string) => formulDegerlendir(wb, 'K', x);
    s.getCell('F1').value = { formula: 'IF(E1="","",ROUNDUP(C1*E1,1))', result: 3.3 } as any;
    s.getCell('F3').value = { formula: 'IF(E3="","",ROUND(C3*E3,2))', result: '' } as any;
    s.getCell('H3').value = { formula: 'IF(G3="","",ROUND(C3*G3,2))', result: '' } as any;
    const a = f('IF(E1="","",ROUNDUP(C1*E1,1))');
    const b = f('IF(E2="","",ROUND(C2*E2,2))');
    const c = f('IF(E3="","",ROUND(C3*E3,2))');
    const d = f('IF(COUNT(F3,H3)=0,"",SUM(F3,H3))');
    const e = f('COUNT(F1,F3,E3)');
    const g = f('ROUNDUP(-1.25,1)');
    const h = f('SUM(F1,F3)');
    check('H0b değerlendirici: IF · "" · ROUNDUP 15 hane (3×1,1 → 3,3) · ROUND(2,675) = 2,68 · COUNT/SUM metni saymaz · negatif ROUNDUP sıfırdan uzağa',
      a.v === 3.3 && b.v === 2.68 && c.m === '' && d.m === '' && e.v === 1 && g.v === -1.3 && h.v === 3.3 && formulDenetimi(wb).sorun.length === 0,
      JSON.stringify({ a, b, c, d, e, g, h, sorun: formulDenetimi(wb).sorun }));
    s.getCell('F1').value = { formula: 'IF(E1="","",ROUNDUP(C1*E1,1))', result: '' } as any; // sayi sonuca METIN onbellek
    s.getCell('F3').value = { formula: 'IF(E3="","",ROUND(C3*E3,2))', result: 0 } as any; // metin sonuca SAYI onbellek
    check('H0b denetim: sayı sonuçlu formülün "" önbelleği ve "" sonuçlu formülün 0 önbelleği ayrı ayrı yakalanır',
      formulDenetimi(wb).sorun.length === 2, formulDenetimi(wb).sorun.join(' | '));
  }

  // ── H1/H2: sentetik + gercek dosyalar ────────────────────────────────
  // Her teklif IKI KEZ: antetsiz ve tam antetli (logolu). Antet satirlari tabloyu
  // asagi kaydirir; degismez ikisinde de AYNI rakamla tutmak zorunda (Gorev 2).
  await icmalDegismezi('sentetik: ara-toplam satırı + özet sayfası', sentetikTeklif());
  await icmalDegismezi('sentetik: ara-toplam satırı + özet sayfası', sentetikTeklif(), TAM_FIRMA);
  for (const dosya of GERCEK_DOSYALAR) {
    const sheets = await gercekTeklif(dosya);
    await icmalDegismezi(dosya.slice(0, 28), sheets);
    await icmalDegismezi(dosya.slice(0, 28), sheets, TAM_FIRMA);
  }

  // ── H3: KDV ───────────────────────────────────────────────────────────
  {
    const kdvDene = (oran: number, kdvEtiketi: boolean) => {
      const wb = buildSampleFormat();
      if (!kdvEtiketi) wb.getWorksheet('İCMAL')!.getCell('E7').value = '';
      const liste = wb.addWorksheet('L');
      liste.getCell('F2').value = 1000.1; liste.getCell('H2').value = 234.57;
      const dolan = fillPlaceholders(wb, {
        teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: oran,
        sekmeler: [{ name: 'L', matFormul: "SUM('L'!F2:F2)", labFormul: "SUM('L'!H2:H2)", matDeger: 1000.1, labDeger: 234.57 }],
      });
      const h = icmalHucreleri(dolan);
      return { kdv: degerK(wb, 'İCMAL', h.kdv?.addr), genel: degerK(wb, 'İCMAL', h.genel?.addr), denetim: formulDenetimi(wb) };
    };
    const ara = 1000.1 + 234.57; // 1234,67
    const r20 = kdvDene(0.2, true);
    check('H3 KDV %20: KDV = (malzeme+işçilik) × 0,20 · GENEL = × 1,20 (satış toplamı üzerinden, kâr/iskonto sonrası)',
      r20.kdv === K(ara * 0.2) && r20.genel === K(ara * 1.2) && r20.denetim.sorun.length === 0,
      `kdv=${r20.kdv} genel=${r20.genel} beklenen ${K(ara * 0.2)}/${K(ara * 1.2)}`);
    const r10 = kdvDene(0.1, true);
    check('H3 KDV %10: oran parametresi formüle ve önbelleğe aynı geçer', r10.kdv === K(ara * 0.1) && r10.genel === K(ara * 1.1)
      && r10.denetim.sorun.length === 0, `kdv=${r10.kdv} genel=${r10.genel}`);
    const r0 = kdvDene(0, true);
    check('H3 KDV muafiyeti (oran 0): KDV 0, GENEL TOPLAM = ara toplam', r0.kdv === 0 && r0.genel === K(ara)
      && r0.denetim.sorun.length === 0, `kdv=${r0.kdv} genel=${r0.genel}`);
    const rEtiketsiz = kdvDene(0.2, false);
    check('H3 formatta {{KDV}} etiketi yoksa GENEL TOPLAM KDV HARİÇ basılır (belgelenen kural)',
      rEtiketsiz.genel === K(ara), `genel=${rEtiketsiz.genel}`);
  }

  // ── H4: KUR ───────────────────────────────────────────────────────────
  {
    const usdKatsayi = 1 / 47.35;
    const sheets = sentetikTeklif();
    const r = await servis(sheets, { displayCurrency: 'USD' }).exportPricedXlsx(KIM, 'q1');
    const wb = await ac(r.buffer);
    const ws = wb.getWorksheet('Mekanik')!;
    // beklenen: her TL toplam hucresi ayri cevrilir (urunle ayni carpim sirasi — KD9 notu)
    const bekMat = sheets[0].rowData.filter((x: any) => x._isDataRow && !x._ozet)
      .reduce((a: number, x: any) => a + K((parseFloat(x._matToplam) || 0) * usdKatsayi), 0);
    const st = sayfaToplamSatiri(ws);
    check('H4 USD: liste hücreleri TL × (1/kur), SAYFA TOPLAMI = çevrilmiş hücrelerin kuruş toplamı, biçim "$"',
      st?.mat === bekMat && /\$/.test(String(ws.getRow(ws.rowCount).getCell(6).numFmt)),
      `sayfa=${st?.mat} beklenen=${bekMat} numFmt=${ws.getRow(ws.rowCount).getCell(6).numFmt}`);

    for (const [ad, fx] of [
      ['kur servisi 1:1 geri düşüş döndü', { getRates: async () => ({ usdTry: 1, eurTry: 1, source: 'fallback', date: '' }) }],
      ['kur servisi hata fırlattı', { getRates: async () => { throw new Error('TCMB yok'); } }],
    ] as const) {
      const rr = await servis(sentetikTeklif(), { displayCurrency: 'USD', fx }).exportPricedXlsx(KIM, 'q1');
      const w = await ac(rr.buffer);
      const s = sayfaToplamSatiri(w.getWorksheet('Mekanik')!);
      const fmt = String(satirBul(w.getWorksheet('Mekanik')!, 'Boru 1"').getCell(6).numFmt ?? '');
      check(`H4 USD teklif + ${ad}: dosya 1:1 "$" BASMAZ, TL değer ve ₺ biçimiyle iner`,
        s?.mat === ekranToplami(sentetikTeklif()[0]).mat && !/\$/.test(fmt) && /₺/.test(fmt),
        `sayfa=${s?.mat} numFmt=${fmt}`);
      // Format yolu: musterinin ICMAL'ine "1 USD = 1,00 TL (TCMB …)" gibi UYDURMA kur notu yazilamaz
      const fx2 = await servis(sentetikTeklif(), { displayCurrency: 'USD', fx }).exportXlsx(KIM, 'q1');
      const w2 = await ac(fx2.buffer);
      const notlar: string[] = [];
      w2.eachSheet((x) => x.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        const m = String(c.value ?? '');
        if (/1 (USD|EUR) =/.test(m)) notlar.push(m);
      })));
      check(`H4 format yolu + ${ad}: dosyaya kur notu YAZILMAZ (1:1 kur "TCMB" diye basılmaz)`, notlar.length === 0,
        notlar.join(' | '));
    }

    // Format yolu USD: ICMAL para bicimi + "Fiyatlar USD" notu
    const fr = await servis(sentetikTeklif(), { displayCurrency: 'USD' }).exportXlsx(KIM, 'q1');
    const fw = await ac(fr.buffer);
    const icmal = fw.getWorksheet('İCMAL')!;
    const paraHucreleri: string[] = [];
    icmal.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      const v: any = c.value;
      if (typeof v === 'number' || (v && typeof v === 'object' && v.formula)) paraHucreleri.push(String(c.numFmt ?? ''));
    }));
    let fiyatlarUsd = false;
    fw.eachSheet((w) => w.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      if (/Fiyatlar USD/.test(String(c.value ?? ''))) fiyatlarUsd = true;
    })));
    check('H4 format yolu USD: İCMAL para hücreleri "$" biçimli (USD tutar ₺/simgesiz basılmaz)',
      paraHucreleri.length > 0 && paraHucreleri.every((f) => /\$/.test(f)),
      `biçimler=${Array.from(new Set(paraHucreleri)).join(' , ')}`);
    check('H4 format yolu USD: dosyada "Fiyatlar USD — 1 USD = ₺…" notu var (rakamların birimi söylenir)', fiyatlarUsd);

    // Tek indirme = tek kur: cagri sirasina gore farkli kur donse de dosya ile ozet ayni birimi soyler
    let cagri = 0;
    const oynak: any = { getRates: async () => (++cagri % 2 === 1
      ? { usdTry: 47.35, eurTry: 54.1, source: 'tcmb', date: '12.09.2026' }
      : { usdTry: 1, eurTry: 1, source: 'fallback', date: '' }) };
    const or = await servis(sentetikTeklif(), { displayCurrency: 'USD', fx: oynak }).exportXlsx(KIM, 'q1');
    const ow = await ac(or.buffer);
    const listeUsd = /\$/.test(String(satirBul(ow.getWorksheet('Mekanik')!, 'Boru 1"').getCell(6).numFmt ?? ''));
    const ozetUsd = /toplam \$/.test(or.ozet ?? '');
    check('H4 tek indirme TEK kur okur: dosyanın birimi ile özetin simgesi ayrışmaz', listeUsd === ozetUsd && cagri === 1,
      `liste$=${listeUsd} ozet="${or.ozet}" getRates çağrısı=${cagri}`);

    // Kur servisinin geri dusus sozlesmesi — export guard'i (tryPer<=1 → TL) buna dayanir
    const eskiFetch = (global as any).fetch;
    (global as any).fetch = async () => { throw new Error('ag yok'); };
    try {
      const svc = new ExchangeRatesService();
      const k = await svc.getRates();
      check('H4 kur servisi: TCMB + yedek kaynak yokken 1:1 döner ama source="fallback" ile İŞARETLER (sessiz değil)',
        k.usdTry === 1 && k.eurTry === 1 && k.source === 'fallback', JSON.stringify(k));
    } finally {
      (global as any).fetch = eskiFetch;
    }
  }

  // ── H4b: DOVIZDE EKRAN SAYFA TOPLAMI = CIKTI SAYFA TOPLAMI (tur 3 A4b — Orta-2) ──
  // Ekran TL toplamini TEK SEFERDE ceviriyordu, cikti her satiri AYRI cevirip
  // kuruslar: 13 dosyanin 147 sayfa toplaminda USD 25, EUR 31 fark (en cok 16
  // sent). Oran use-currency.ts siralamasiyla satir icinde (para-gosterim.ts
  // `@/` alias'i ts-node'da cozulmez).
  {
    const USD_TRY = 47.35; const EUR_TRY = 54.1;
    const oranlar: Record<string, number> = { USD: 1 / USD_TRY, EUR: (USD_TRY / EUR_TRY) / USD_TRY };
    const teklifler: Array<[string, any[]]> = [['3×₺100', [sayfa('Mekanik', [veri(1, 'A', 1, '100', '100'), veri(2, 'B', 1, '100', '100'), veri(3, 'C', 1, '100', '100')])]]];
    for (const dosya of GERCEK_DOSYALAR) teklifler.push([dosya.slice(0, 14), await gercekTeklif(dosya)]);
    for (const kod of ['USD', 'EUR']) {
      let sayfaSayisi = 0; let tekSeferdeAyrisan = 0; const farklar: string[] = [];
      for (const [ad, sheets] of teklifler) {
        const r = await servis(JSON.parse(JSON.stringify(sheets)), { displayCurrency: kod, fx: fxSabit(USD_TRY, EUR_TRY) }).exportPricedXlsx(KIM, 'q1');
        const wb = await ac(r.buffer);
        for (const sh of sheets.filter((s: any) => !s.isEmpty)) {
          const ws = wb.worksheets.find((w) => w.name === sh.name);
          const kalemSt = ws ? sayfaToplamSatiri(ws) : null;
          const st = kalemSt ?? (ws ? metinSayfasiToplami(ws) : null);
          if (!st) { farklar.push(`${ad}/${sh.name}: çıktıda sayfa toplamı yok`); continue; }
          if (kalemSt) sayfaSayisi++;
          const e = FE.sayfaToplamlari(sh.rowData ?? [], sh.columnRoles ?? {}, oranlar[kod]);
          if (K(e.matToplam) !== st.mat || K(e.labToplam) !== st.lab) farklar.push(`${ad}/${sh.name}: ekran ${K(e.matToplam)}/${K(e.labToplam)} çıktı ${st.mat}/${st.lab}`);
          const tlOzet = FE.sayfaToplamlari(sh.rowData ?? [], sh.columnRoles ?? {});
          if (K(tlOzet.matToplam * oranlar[kod]) !== st.mat || K(tlOzet.labToplam * oranlar[kod]) !== st.lab) tekSeferdeAyrisan++;
        }
      }
      check(`H4b ölçütün kendisi (${kod}): TL toplamını tek seferde çevirmek en az bir sayfada çıktıdan AYRIŞIR`,
        tekSeferdeAyrisan > 0, `ayrışan=${tekSeferdeAyrisan}/${sayfaSayisi}`);
      check(`H4b Orta-2 (${kod}): sayfaToplamlari(…, oran) = çıktı SAYFA TOPLAMI kuruşu kuruşuna (sentetik + 3 gerçek dosya)`,
        farklar.length === 0 && sayfaSayisi > 3, `sayfa=${sayfaSayisi} fark=${farklar.slice(0, 3).join(' | ')}`);
    }
  }

  // ── H5: bos / tek kalem / katkisiz sayfa ─────────────────────────────
  {
    const bos = await buildExportWorkbook({
      originalFile: Buffer.from('x'), sheetsArr: [], formatWb: buildSampleFormat(), sheetRoles: null,
      ctxTemel: { teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: 0.2 },
    });
    const h = icmalHucreleri(bos.dolan);
    let kalanEtiket = 0;
    bos.wb.eachSheet((w) => w.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      if (String(c.value ?? '').includes('{{')) kalanEtiket++;
    })));
    check('H5 boş teklif (format): bölüm yok, MALZEME/İŞÇİLİK/GENEL = 0, yer tutucu kalmaz, formül hatası yok',
      h.bolumler.length === 0 && degerK(bos.wb, 'İCMAL', h.malzeme?.addr) === 0 && degerK(bos.wb, 'İCMAL', h.genel?.addr) === 0
        && kalanEtiket === 0 && formulDenetimi(bos.wb).sorun.length === 0,
      `bölüm=${h.bolumler.length} kalan {{=${kalanEtiket}}}`);
    const bosFiyatli = await standartCiktiUret({ sheetsArr: [] });
    const bw = await ac(bosFiyatli.buffer);
    let genel: any = null;
    bw.getWorksheet('GENEL TOPLAM')?.eachRow((row) => { if (row.getCell(1).value === 'TEKLİF GENEL TOPLAMI') genel = row.getCell(4).value; });
    check('H5 boş teklif (fiyatlı): TEKLİF GENEL TOPLAMI = 0, çıktı düşmez', genel === 0 && bosFiyatli.genelToplam === 0, `genel=${genel}`);

    await icmalDegismezi('tek kalem', [sayfa('Tek', [veri(1, 'Tek kalem', 3, '1523.7', '4571.1', '100', '300')])]);

    // EXCEL SINIRLARI: her kalemin altinda ara toplam satiri olan 300 kalemlik
    // sayfa → 300 ayri SUM araligi. Kisa adli sayfada 255 arguman siniri
    // parcali SUM'la, uzun adli sayfada 8192 karakter siniri deger yazimiyla
    // asilmamali; dosya Excel'de ACILABILIR kalmali (olcut: formulDenetimi).
    const cokParcali = (ad: string) => sayfa(ad, Array.from({ length: 300 }, (_, i) => [
      veri(i + 1, `Kalem ${i + 1}`, 1, '10.5', '10.5', '1', '1'),
      veri('', 'ARA TOPLAM', '', '', '10.5', '', '1', { _ozet: true }),
    ]).flat());
    const sinir = await icmalDegismezi('300 ara toplamlı iki sayfa (255 argüman + 8192 karakter)',
      [cokParcali('A'), cokParcali('Çok Uzun Adlı Mekanik Tesisat Sayfası')]);
    const aFormul: any = sinir.sonuc.wb.getWorksheet('İCMAL')!.getCell(icmalHucreleri(sinir.sonuc.dolan).bolumler[0].mat).value;
    check('H5 255 argüman sınırı: kısa adlı sayfanın bölüm formülü PARÇALI SUM (canlı formül kalır)',
      typeof aFormul?.formula === 'string' && (aFormul.formula.match(/SUM\(/g) ?? []).length === 2,
      String(aFormul?.formula ?? aFormul).slice(0, 80));

    // Katkisiz sayfa: bos olmayan ama VERI SATIRI kalmamis sayfa (yalniz grup
    // basliklari) — eskiden SUM kurulamayip TUM ICMAL toplamlari statik
    // sayiya dusuyordu (bir sayfa yuzunden dosya yari canli, yari olu).
    const katkisiz = await buildExportWorkbook({
      originalFile: Buffer.from('x'), formatWb: buildSampleFormat(), sheetRoles: null,
      sheetsArr: [sayfa('Dolu', [veri(1, 'A', 1, '10', '10')]), sayfa('Başlıklar', [grup('BÖLÜM 1'), grup('BÖLÜM 2')])],
      ctxTemel: { teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: 0.2 },
    });
    const kh = icmalHucreleri(katkisiz.dolan);
    const genelHucre: any = katkisiz.wb.getWorksheet('İCMAL')!.getCell(kh.genel!.addr).value;
    check('H5 fiyatı olmayan sayfa İCMAL\'i formülsüz (statik) bırakmaz: GENEL TOPLAM canlı formül ve doğru',
      !!genelHucre?.formula && degerK(katkisiz.wb, 'İCMAL', kh.genel?.addr) === K(12) && formulDenetimi(katkisiz.wb).sorun.length === 0,
      `genel=${JSON.stringify(genelHucre)}`);
    // Ayni durum {{ICMAL_SATIRLARI}} TASIMAYAN kullanici formatinda: toplamlar
    // sayfa SUM'larinin birlesimidir, TEK bir kurulamayan parca hepsini statige
    // dusururdu — veri satiri olmayan sayfa bu yuzden `0` formulu alir.
    const etiketsizFormat = new ExcelJS.Workbook();
    const kapak = etiketsizFormat.addWorksheet('KAPAK');
    kapak.getCell('C5').value = '{{MALZEME_TOPLAMI}}';
    kapak.getCell('C6').value = '{{GENEL_TOPLAM}}';
    const etiketsiz = await buildExportWorkbook({
      originalFile: Buffer.from('x'), formatWb: etiketsizFormat, sheetRoles: null,
      sheetsArr: [sayfa('Dolu', [veri(1, 'A', 1, '10', '10')]), sayfa('Başlıklar', [grup('BÖLÜM 1')])],
      ctxTemel: { teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: 0.2 },
    });
    const eg = etiketsiz.dolan.find((d) => d.etiket === 'GENEL_TOPLAM');
    const egHucre: any = eg ? etiketsiz.wb.getWorksheet(eg.sheet)!.getCell(eg.addr).value : null;
    check('H5 İCMAL satırı olmayan formatta da veri satırsız sayfa toplamları statiğe düşürmez (canlı formül, doğru değer)',
      !!egHucre?.formula && degerK(etiketsiz.wb, 'KAPAK', eg?.addr) === K(10) && formulDenetimi(etiketsiz.wb).sorun.length === 0,
      `genel=${JSON.stringify(egHucre)}`);
  }

  // ── H6: format yolu oz-denetim sayaclari ─────────────────────────────
  {
    const sheets = sentetikTeklif();
    const s = await buildExportWorkbook({
      originalFile: Buffer.from('x'), sheetsArr: sheets, formatWb: buildSampleFormat(), sheetRoles: null,
      ctxTemel: { teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: 0.2 },
    });
    let paraHucresi = 0;
    for (const ad of s.listeSayfalari) {
      s.wb.getWorksheet(ad)!.eachRow({ includeEmpty: false }, (row) => {
        for (const c of [5, 6, 7, 8, 9]) {
          const v: any = row.getCell(c).value;
          const n = typeof v === 'number' ? v : v && typeof v === 'object' && typeof v.result === 'number' ? v.result : 0;
          if (n !== 0) paraHucresi++; // 23.09: tutar hucreleri FORMUL — sonucu sayi olan da para hucresidir
        }
      });
    }
    // fiyatsiz: _matBirim/_labBirim ikisi de bos olan (ozet olmayan) veri satiri → Mekanik #3
    // ⚠ `eksikDeger` BURADA OLCULMEZ: sayac hala `beklenen := yazilan` ile kuruluyor
    // (export-engine.ts), yani yapisal olarak 0 — assert'e koymak kanit gibi
    // gorunen bir totoloji olurdu (13.09 incelemesi). Acik is olarak raporda.
    check('H6 format yolu öz-denetimi ÇALIŞIR: yazılan değer = dosyadaki para hücresi sayısı, fiyatsız satır sayılır',
      s.yazilanDeger === paraHucresi && paraHucresi > 0 && s.fiyatsizSatir === 1,
      `yazilan=${s.yazilanDeger} dosyada=${paraHucresi} fiyatsiz=${s.fiyatsizSatir}`);
    const r = await servis(sheets).exportXlsx(KIM, 'q1');
    check('H6 format indirme özeti "0 değer aktarıldı" YALANINI söylemez', !/^0 değer aktarıldı/.test(r.ozet ?? '')
      && /1 satır fiyatsız/.test(r.ozet ?? ''), `ozet="${r.ozet}"`);
  }

  // ── H8: eski kayitli override'lar (T13/T14 — onizleme ucu silindi, kayitlar duruyor) ──
  {
    const temel = (ek: any = {}) => buildExportWorkbook({
      originalFile: Buffer.from('x'), sheetsArr: sentetikTeklif(), formatWb: buildSampleFormat(), sheetRoles: null,
      ctxTemel: { teklifNo: 'T', rev: 1, tarih: '13.09.2026', kurNotu: '', kdvOran: 0.2 }, ...ek,
    });
    // Adresler ONCE override'siz kosumdan okunur (sabit adres varsayilmaz)
    const once = await temel();
    const hO = icmalHucreleri(once.dolan);
    const b0 = hO.bolumler[0];
    const tarih = once.dolan.find((d) => d.etiket === 'TARIH')!;
    const OVERRIDE = 100000;
    const sonra = await temel({ overrides: { [b0.sheet]: { [b0.mat]: { value: OVERRIDE, manual: true } } } });
    const h = icmalHucreleri(sonra.dolan);
    const yazilan: any = sonra.wb.getWorksheet(b0.sheet)!.getCell(b0.mat).value;
    const digerMat = h.bolumler.slice(1).reduce((a, b) => a + (degerK(sonra.wb, b.sheet, b.mat) as number), 0);
    const malzOnbellek: any = sonra.wb.getWorksheet(h.malzeme!.sheet)!.getCell(h.malzeme!.addr).value;
    const fd = formulDenetimi(sonra.wb);
    check('H8 eski override bölüm hücresine rakam yazdıysa İCMAL toplamlarının ÖNBELLEĞİ formülün gerçek değerine eşit (Korumalı Görünüm = düzenleme modu)',
      yazilan === OVERRIDE && fd.sorun.length === 0 && K(malzOnbellek?.result) === K(OVERRIDE) + digerMat
        && degerK(sonra.wb, h.malzeme!.sheet, h.malzeme!.addr) === K(OVERRIDE) + digerMat,
      `override=${JSON.stringify(yazilan)} önbellek=${malzOnbellek?.result} sorun=${fd.sorun.slice(0, 2).join(' | ')}`);

    // USD cikti: TARIH alanina eski override "13.09.2026" metnini yazmis (applyOverrides
    // onu 13092026 sayisina cevirir) — para bicimi ALMAMALI ("$13,092,026.00" basilmaz)
    const usd = await temel({
      birim: { kod: 'USD', katsayi: 1 / 47.35, not: 'Fiyatlar USD' },
      overrides: { [tarih.sheet]: { [tarih.addr]: { value: '13.09.2026', manual: true } } },
    });
    const tarihFmt = String(usd.wb.getWorksheet(tarih.sheet)!.getCell(tarih.addr).numFmt ?? '');
    const uh = icmalHucreleri(usd.dolan);
    const genelFmt = String(usd.wb.getWorksheet(uh.genel!.sheet)!.getCell(uh.genel!.addr).numFmt ?? '');
    check('H8 USD çıktıda para biçimi yalnız PARA hücrelerine uygulanır: override ile sayıya dönmüş TARİH "$" almaz',
      !/\$/.test(tarihFmt) && /\$/.test(genelFmt), `tarih numFmt="${tarihFmt}" genel numFmt="${genelFmt}"`);

    // TRY cikti + kullanici formatinda YEREL AYAR kodlu TL bicimi ([$-41F]) korunur
    const fmtWb = new ExcelJS.Workbook();
    const kapak = fmtWb.addWorksheet('KAPAK');
    kapak.getCell('C5').value = '{{MALZEME_TOPLAMI}}';
    kapak.getCell('C5').numFmt = '[$-41F]#,##0.00';
    const trySonuc = await buildExportWorkbook({
      originalFile: Buffer.from('x'), sheetsArr: sentetikTeklif(), formatWb: fmtWb, sheetRoles: null,
      ctxTemel: { teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: 0.2 },
    });
    const yerelFmt = String(trySonuc.wb.getWorksheet('KAPAK')!.getCell('C5').numFmt ?? '');
    check('H8 TL çıktıda kullanıcının yerel ayar kodlu biçimi ([$-41F]) döviz sanılıp EZİLMEZ', yerelFmt === '[$-41F]#,##0.00',
      `numFmt="${yerelFmt}"`);
  }

  // ── H9: KAYIT TOPLAMI = EKRAN (para dogrulugu turu, 14.09 — G1) ──────
  // Musterinin kendi İcmal satirlari (`_ozet`) ekranda toplanmiyor ama kayda
  // KALEM olarak gidiyordu: FIRMA-C teklif listesi 186.131.100, ekran 62.043.700.
  // Olcut ekranin tek hesap modulunden; kayit yolu URETIMDEKI zincir:
  // page.tsx handleSave dongusunun suzgeci → gercek `kalemUret` (FE) →
  // gercek `QuotesService.create` (satir toplami + finalPrice kurali).
  {
    const FEKALEM = require('../../frontend/ozellik/teklif/teklif-kalem');
    let yakalanan: any[] = [];
    const prisma: any = { quote: { create: async (arg: any) => { yakalanan = arg?.data?.items?.create ?? []; return { id: 'h9', items: [] }; } } };
    const kayitServisi = new QuotesService(prisma, fxSabit(), { onbellekHaritasi: async () => ({}) } as any);
    const sheets = await gercekTeklif('FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx');
    const kalemler: any[] = [];
    let ozetSatiri = 0;
    let ozetTutariK = 0; // olcutun kendisi: dislanmasaydi kayda girecek para
    for (const sh of sheets) {
      if (sh.isEmpty) continue;
      for (const r of sh.rowData ?? []) {
        if (!r._isDataRow || r._isGroupRow || r._isSpareRow) continue; // page.tsx:1339 suzgeci
        if (r._ozet) {
          ozetSatiri++;
          const { _ozet: _yok, ...isaretsiz } = r;
          const hayali = FEKALEM.kalemUret(isaretsiz, sh.columnRoles);
          if (hayali) ozetTutariK += K((hayali.materialTotalPrice ?? 0) + (hayali.laborTotalPrice ?? 0));
        }
        const k = FEKALEM.kalemUret(r, sh.columnRoles);
        if (k) kalemler.push(k);
      }
    }
    await kayitServisi.create(KIM, { title: 'H9', items: kalemler } as any);
    const kayitK = yakalanan.reduce((a, it) => a + K(it.finalPrice), 0);
    const ekranK = sheets.filter((s) => !s.isEmpty).reduce((a, s) => { const e = ekranToplami(s); return a + e.mat + e.lab; }, 0);
    check('H9 ölçütün kendisi: FIRMA-C İcmal satırları GERÇEKTEN para taşıyor (dışlanmasa kayda 124.087.400 girerdi)',
      ozetSatiri > 0 && ozetTutariK === 12408740000, `özet satırı=${ozetSatiri} tutar=${tl(ozetTutariK)}`);
    check('H9 G1: kayıtlı teklif toplamı (Σ finalPrice) = ekrandaki sayfa toplamları, kuruşu kuruşuna — FIRMA-C 62.043.700',
      kayitK === ekranK && ekranK === 6204370000, `kayıt=${tl(kayitK)} ekran=${tl(ekranK)} kalem=${yakalanan.length}`);
  }

  // ── H11: KALEM TOPLAMI KURUS KATMANINDA (tur 3 A4a — G4/K11, 14.09) ──
  // Satirin Genel Toplami (malzeme + iscilik) ikinci kez YUKARI 1 haneye
  // yuvarlaniyordu: Bursa'da 41 kalem +2,42 TL — satir hucreleri ve kayit
  // 295.272.924,70, ekran/cikti/ICMAL 295.272.922,28. Olcut hucre METNINDEN
  // bagimsiz kurus (urun kodu kullanmaz); kayit yolu H9 ile ayni uretim zinciri.
  {
    const FEKALEM = require('../../frontend/ozellik/teklif/teklif-kalem');
    const bagimsizKurus = (v: unknown): bigint => {
      const m = String(v ?? '').trim().replace(',', '.').match(/^(-?)(\d+)(?:\.(\d+))?$/);
      if (!m) return 0n;
      const ond = `${m[3] ?? ''}000`.slice(0, 3);
      const k = BigInt(m[2]) * 100n + BigInt(ond.slice(0, 2)) + (Number(ond[2]) >= 5 ? 1n : 0n);
      return m[1] ? -k : k;
    };
    let yakalanan: any[] = [];
    const prisma: any = { quote: { create: async (arg: any) => { yakalanan = arg?.data?.items?.create ?? []; return { id: 'h11', items: [] }; } } };
    const kayitServisi = new QuotesService(prisma, fxSabit(), { onbellekHaritasi: async () => ({}) } as any);
    const sheets = await gercekTeklif(GERCEK_DOSYALAR[1]); // Bursa
    const kalemler: any[] = [];
    let hucreK = 0n; let satirHucreK = 0n; let ayrisan = 0; let ekranK = 0;
    for (const sh of sheets.filter((s: any) => !s.isEmpty)) {
      const R = sh.columnRoles ?? {};
      const e = ekranToplami(sh); ekranK += e.mat + e.lab;
      for (const r of sh.rowData ?? []) {
        if (!r._isDataRow || r._isGroupRow || r._isSpareRow) continue; // page.tsx kayit suzgeci
        const k = FEKALEM.kalemUret(r, R);
        if (k) kalemler.push(k);
        if (r._ozet) continue;
        const bk = bagimsizKurus(R.materialTotalField ? r[R.materialTotalField] : '') + bagimsizKurus(R.laborTotalField ? r[R.laborTotalField] : '');
        hucreK += bk;
        if ((bk + 9n) / 10n * 10n !== bk) ayrisan++; // yukari 1 hanede sapacak kalem
        if (R.grandTotalField && String(r[R.grandTotalField] ?? '').trim() !== '') satirHucreK += bagimsizKurus(r[R.grandTotalField]);
      }
    }
    await kayitServisi.create(KIM, { title: 'H11', items: kalemler } as any);
    const kayitK = yakalanan.reduce((a, it) => a + K(it.finalPrice), 0);
    check('H11 ölçütün kendisi: Bursa\'da kuruşu 10\'a bölünmeyen (yukarı 1 hanede sapacak) kalem VAR', ayrisan > 0, `ayrışan=${ayrisan}`);
    check('H11 G4 kayıt: Σ K(finalPrice) = hücre kuruşu = ekran — Bursa 295.272.922,28',
      BigInt(kayitK) === hucreK && BigInt(ekranK) === hucreK && hucreK === 29527292228n,
      `kayıt=${tl(kayitK)} ekran=${tl(ekranK)} hücre=${hucreK}`);
    check('H11 G4 satır: Genel Toplam hücreleri (içe aktarma tamamlaması) toplamı = hücre kuruşu', satirHucreK === hucreK,
      `satır=${satirHucreK} hücre=${hucreK}`);
    yakalanan = [];
    await kayitServisi.create(KIM, { title: 'H11s', items: [FEKALEM.kalemUret(veri(1, 'Sentetik', 1, '100.25', '100.25'), ROLLER)] } as any);
    check('H11 G4 sentetik: malzeme toplamı 100,25 → totalPrice = finalPrice = 100,25 (eskisi 100,3)',
      yakalanan[0]?.totalPrice === 100.25 && yakalanan[0]?.finalPrice === 100.25,
      `total=${yakalanan[0]?.totalPrice} final=${yakalanan[0]?.finalPrice}`);
  }

  // ── H10: SAYFA ADI CAKISMASI CIKTIYI DUSURMEZ (14.09 — I9 / I10) ─────
  // Olculdu: teklifte "GENEL TOPLAM" adli sayfa varsa fiyatli cikti HTTP 400 ile
  // dusuyordu; "ICMAL" formati + "icmal" teklif sayfasi (ve "MEKANIK" + "Mekanik")
  // TR kucultmesiyle farkli, ExcelJS'in duz kucultmesiyle AYNI sayildigi icin
  // format ve fiyatli yol dusuyordu. Dosya inmezse rakamin dogrulugu anlamsiz.
  {
    const cakisan = [
      sayfa('Genel Toplam', [veri(1, 'Kalem A', 2, '100', '200')]),
      sayfa('MEKANIK', [veri(1, 'Kalem B', 1, '50', '50')]),
      sayfa('Mekanik', [veri(1, 'Kalem C', 1, '25', '25')]),
    ];
    let fiyatliHata = '';
    let fwb: ExcelJS.Workbook | null = null;
    try {
      const r = await standartCiktiUret({ sheetsArr: cakisan });
      fwb = await ac(r.buffer);
    } catch (e: any) { fiyatliHata = e?.message ?? String(e); }
    let genel: number | null = null;
    fwb?.getWorksheet('GENEL TOPLAM')?.eachRow((row) => {
      if (row.getCell(1).value !== 'TEKLİF GENEL TOPLAMI') return;
      const d = gercek(fwb!, 'GENEL TOPLAM', row.getCell(4).address);
      genel = d.e === undefined ? K(d.v as number) : null;
    });
    check('H10 I9: "Genel Toplam" adlı teklif sayfası fiyatlı çıktıyı düşürmez; özet sayfa adını KORUR ve toplam doğru',
      !fiyatliHata && genel === K(275) && fwb!.worksheets.some((w) => w.name === 'Genel Toplam (2)'),
      `hata="${fiyatliHata}" genel=${genel} sayfalar=${fwb?.worksheets.map((w) => w.name).join(' | ')}`);
    check('H10 I10: "MEKANIK" + "Mekanik" (ExcelJS\'in eşit saydığı çift) fiyatlı çıktıda ayrı sayfa olur',
      !fiyatliHata && !!fwb?.getWorksheet('MEKANIK') && fwb!.worksheets.some((w) => w.name === 'Mekanik (2)'),
      `sayfalar=${fwb?.worksheets.map((w) => w.name).join(' | ')}`);

    const kullaniciFormati = new ExcelJS.Workbook();
    kullaniciFormati.addWorksheet('KAPAK').getCell('B2').value = '{{MUSTERI}}';
    const icmalFmt = kullaniciFormati.addWorksheet('ICMAL');
    icmalFmt.getCell('B3').value = '{{ICMAL_SATIRLARI}}';
    icmalFmt.getCell('E6').value = '{{GENEL_TOPLAM}}';
    let formatHata = '';
    let sonuc: any = null;
    try {
      sonuc = await buildExportWorkbook({
        originalFile: Buffer.from('x'), formatWb: kullaniciFormati, sheetRoles: null,
        sheetsArr: [sayfa('icmal', [veri(1, 'Kalem D', 4, '10', '40')])],
        ctxTemel: { teklifNo: 'T', rev: 1, tarih: '', kurNotu: '', kdvOran: 0.2 },
      });
    } catch (e: any) { formatHata = e?.message ?? String(e); }
    check('H10 I10: "ICMAL" formatı + "icmal" teklif sayfası format çıktısını düşürmez, formüller doğru',
      !formatHata && !!sonuc && formulDenetimi(sonuc.wb).sorun.length === 0 && sonuc.listeSayfalari.length === 1,
      `hata="${formatHata}" liste=${sonuc?.listeSayfalari?.join(',')}`);
  }

  // ── H7: FE ↔ BE fiyat cekirdegi paritesi ─────────────────────────────
  {
    let tohum = 20260913;
    const rastgele = () => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; };
    const farklar: string[] = [];
    for (let i = 0; i < 20000 && farklar.length < 3; i++) {
      const buyukluk = 10 ** Math.floor(rastgele() * 8);
      const x = Math.round(rastgele() * buyukluk * 1000) / 1000;
      const isk = Math.round(rastgele() * 1000) / 10;
      if (FE.yukariYuvarla(x) !== BE.yukariYuvarla(x)) farklar.push(`yukariYuvarla(${x})`);
      if (FE.hesaplaNetFiyat(x, isk) !== BE.hesaplaNetFiyat(x, isk)) farklar.push(`hesaplaNetFiyat(${x},${isk})`);
      if (FE.kurusTamsayi(x) !== BE.kurusTamsayi(x) || FE.kurusTamsayi(-x) !== BE.kurusTamsayi(-x)) farklar.push(`kurusTamsayi(${x})`);
      // tur 3 A4a: kalem toplami iki yanda ayni kural (ekran satiri ↔ kayit totalPrice)
      if (FE.kalemToplami(x, isk) !== BE.kalemToplami(x, isk)) farklar.push(`kalemToplami(${x},${isk})`);
    }
    for (const x of [10.075, 1.015, 0.285, 1858060.05, 152.3 * 12200, -0.005]) {
      if (FE.yukariYuvarla(x) !== BE.yukariYuvarla(x) || FE.kurusTamsayi(x) !== BE.kurusTamsayi(x)) farklar.push(`sinir ${x}`);
    }
    check('H7 FE ↔ BE parite: yukariYuvarla · hesaplaNetFiyat · kurusTamsayi · kalemToplami 20.000 girdide + sınırlarda BİREBİR',
      farklar.length === 0, farklar.join(' | '));
  }

  // ── H12: A2 (tur 3, 14.09) — BELİRSİZ SAYI SÜZGECİ: FE ↔ BE PARİTESİ + ÇIKTI ──
  // Kural İKİ yerde yaşar (ön yüz `sayi-alani.ts`, backend `import-fidelity.ts`):
  // aynı metin ekranda ve dosyada FARKLI sınıf olursa "her yolda aynı sınıf"
  // iş emri çöker. Ölçüt bağımsız: iki uygulama aynı korpusta nesne düzeyinde eşit
  // olmalı; backend İNSAN yolları (miktar, AI PDF, override) ve Excel çıktısının
  // MAKİNE okuyucusu da ön yüzün sınıfını vermeli.
  {
    const FESAYI = require('../../frontend/ozellik/fiyat/sayi-alani');
    const BESAYI = require('../src/ozellik/kutuphane/utils/import-fidelity');
    const { miktarNormalize } = require('../src/ozellik/giris/excel-grid/standart-sema');
    const { AiService } = require('../src/ozellik/giris/ai/ai.service');
    const { applyOverrides } = require('../src/ozellik/cikti/quote-formats/format-engine');
    const KORPUS: unknown[] = [
      '', '   ', '0', '12', '12,5', '12.5', '1.25', '1.250', '10.075', '25430.000', '.250', '-1.250', '1.234,5', '1,234.5',
      '1,234,567', '1.234.567', '6.500,00', '₺1.250,00', '2.500,00 TL', 'TL 2.500,00', '₺1.250', '%30', '30%', '% 15', '%12,5',
      '%12.125', '12 m', '3 adet', '12,5 mt.', '5 TAKIM', '2 LITRE', '1.250 m', '100m', '24 kW', '550 kVA', '2x1,5 mm²',
      '35x240mm Üç bölmeli döşeme kanalı', 'Ø100 PVC boru', 'DN50', 'abc', '1 250', '0505 885 15 64', ': +90 000 000 00 00',
      '$1.500,00', '12 €', '0x10', '1e3', 'Infinity', '-5', '+5', '323308,125', 12, 12.375, -3, NaN, null, undefined,
    ];
    const farklar: string[] = [];
    for (const g of KORPUS) {
      for (const alan of ['miktar', 'fiyat', 'kar', 'iskonto']) {
        const fe = JSON.stringify(FESAYI.insanSayiOku(g, alan));
        const be = JSON.stringify(BESAYI.insanSayiOku(g, alan));
        if (fe !== be) farklar.push(`insan ${alan} ${JSON.stringify(g)}: FE=${fe} BE=${be}`);
      }
      if (!Object.is(FESAYI.sayiOku(g), BESAYI.makineSayiOku(g))) farklar.push(`makine ${JSON.stringify(g)}: FE=${FESAYI.sayiOku(g)} BE=${BESAYI.makineSayiOku(g)}`);
    }
    check('H12a FE ↔ BE parite: insanSayiOku (4 alan) ve makine okuyucusu 57 girdilik korpusta NESNE düzeyinde BİREBİR',
      farklar.length === 0, farklar.slice(0, 4).join(' | '));
    check('H12a K1/K2 sabitleri iki tarafta AYNI (karar tek yerden değişmez — iki yer birlikte)',
      FESAYI.K1_UZUN_TAM_KISIM_BELIRSIZ === BESAYI.K1_UZUN_TAM_KISIM_BELIRSIZ
        && JSON.stringify(FESAYI.MIKTAR_BIRIMLERI) === JSON.stringify(BESAYI.MIKTAR_BIRIMLERI),
      `K1 FE=${FESAYI.K1_UZUN_TAM_KISIM_BELIRSIZ} BE=${BESAYI.K1_UZUN_TAM_KISIM_BELIRSIZ}`);

    let tohum = 1409;
    const rastgele = () => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; };
    const metinFark: string[] = [];
    for (let i = 0; i < 5000 && metinFark.length < 3; i++) {
      const hane = Math.floor(rastgele() * 5);
      const n = Math.round(rastgele() * 10 ** Math.floor(rastgele() * 8) * 10 ** hane) / 10 ** hane;
      const m = BESAYI.makineMetni(n);
      const insan = BESAYI.insanSayiOku(m, 'fiyat');
      if (m !== FESAYI.makineMetni(n)) metinFark.push(`makineMetni(${n}) FE=${FESAYI.makineMetni(n)} BE=${m}`);
      else if (BESAYI.makineSayiOku(m) !== n || insan.tur !== 'sayi' || insan.deger !== n) metinFark.push(`gidiş-dönüş ${n} → "${m}" → ${JSON.stringify(insan)}`);
    }
    check('H12b makine metni 5.000 değerde FE ≡ BE ve İKİ kuralda da kendisine döner (Excel SAYI hücresi belirsiz sayılmaz)',
      metinFark.length === 0, metinFark.join(' | '));

    // Backend İNSAN yolları ön yüzün sınıfını verir
    const yolFark: string[] = [];
    const wbO = new ExcelJS.Workbook();
    wbO.addWorksheet('S');
    for (const g of KORPUS) {
      const miktarFe = FESAYI.insanSayiOku(g, 'miktar');
      const mik = miktarNormalize(g);
      if (!Object.is(mik, miktarFe.tur === 'sayi' ? miktarFe.deger : null)) yolFark.push(`miktarNormalize ${JSON.stringify(g)} → ${mik}`);
      const fiyatFe = FESAYI.insanSayiOku(g, 'fiyat');
      const ai = AiService.prototype.cleanExtractedPrices.call(null, [{ materialName: 'Kalem', unit: 'Adet', unitPrice: g }]);
      const aiAlir = fiyatFe.tur === 'sayi' && fiyatFe.deger > 0;
      const aiUyarir = fiyatFe.tur === 'belirsiz' || fiyatFe.tur === 'sayi-degil';
      if ((ai.materials.length === 1) !== aiAlir || (ai.sayiUyarilari.length === 1) !== aiUyarir) yolFark.push(`AI ${JSON.stringify(g)} alındı=${ai.materials.length} uyarı=${ai.sayiUyarilari.length}`);
      if (typeof g === 'string' && g.trim() !== '') {
        applyOverrides(wbO, { S: { A1: { value: g, manual: true } } });
        const yazilan = wbO.getWorksheet('S')!.getCell('A1').value;
        const sayiOlmali = fiyatFe.tur === 'sayi' && /^[\d.,\s+-]+$/.test(g.trim());
        if ((typeof yazilan === 'number') !== sayiOlmali || (sayiOlmali && yazilan !== (fiyatFe as any).deger)) yolFark.push(`override ${JSON.stringify(g)} → ${JSON.stringify(yazilan)}`);
      }
    }
    check('H12c backend İNSAN yolları aynı sınıf: miktarNormalize · AI PDF fiyatı (alınır/uyarılır) · override hücresi (sayı/metin)',
      yolFark.length === 0, yolFark.slice(0, 4).join(' | '));

    // Excel ÇIKTISI (makine okuyucusu) = ekran okuyucusu — hayalet çıktıda da sayı değil
    const satirlar = [
      ['Hayalet', '3 adet', '35x240mm Üç bölmeli döşeme kanalı'],
      ['TR binlik', '12,5', '1.234,5'],
      ['Virgül 3', 7, '10,075'],
      ['Makine 3', '10.075', '323308.125'],
      ['TL simge', 'Ø100 PVC boru', '₺1.250,00'],
      ['Boş fiyat', '', ''],
    ];
    const cikti = await standartCiktiUret({ sheetsArr: [sayfa('Çıktı', satirlar.map(([ad, m, b], i) => veri(i + 1, String(ad), m as any, String(b), '')))] });
    const cwb = await ac(cikti.buffer);
    const ws = cwb.getWorksheet('Çıktı')!;
    const ciktiFark: string[] = [];
    for (const [ad, m, b] of satirlar) {
      let row: ExcelJS.Row | null = null;
      ws.eachRow((r) => { if (String(r.getCell(2).value ?? '') === ad) row = r; });
      if (!row) { ciktiFark.push(`${ad}: satır yok`); continue; }
      const miktarBek = FESAYI.sayiOku(m) ?? null;
      // 23.09: birim fiyat hucresi TAM hassasiyet (13,4725 × 100 = 1.347,25 satiri formulle
      // tutsun diye — standart-cikti.ts kenarYaz); gorunen 2 hane degismez. Bos → null.
      const birimSayi = FESAYI.sayiOku(b) ?? 0;
      const birimBek = birimSayi !== 0 ? birimSayi : null;
      // Olcut SAYI: miktari/fiyati olmayan satir tarif geregi METIN satiri olur (not: B–I
      // birlesik, C/E birlesik metni okur) — orada hic sayi olmamali, ekran da sayi okumuyor.
      const sayiMi = (v: unknown) => (typeof v === 'number' ? v : null);
      const c = sayiMi((row as ExcelJS.Row).getCell(3).value); const e = sayiMi((row as ExcelJS.Row).getCell(5).value);
      if (c !== miktarBek || e !== birimBek) ciktiFark.push(`${ad}: C=${JSON.stringify(c)} (ekran ${JSON.stringify(miktarBek)}) E=${JSON.stringify(e)} (ekran ${JSON.stringify(birimBek)})`);
    }
    check('H12d Excel çıktısı ekranın makine okuyucusuyla AYNI sayıyı yazar — "35x240mm…" Malz. Birim 35 DEĞİL, "3 adet" Miktar 3 DEĞİL',
      ciktiFark.length === 0, ciktiFark.join(' | '));
  }

  console.log(`\n${'─'.repeat(64)}\nHESAP DOĞRULUĞU: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nBAŞARISIZ:'); failures.forEach((f) => console.log(`  ✗ ${f}`)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('BEKLENMEYEN HATA:', e); process.exit(1); });
