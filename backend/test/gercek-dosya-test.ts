/**
 * TF — GERCEK DOSYA UYUMLULUK KABULU (27.07): kullanicinin sistemde
 * ACILMAYAN/yanlis-rollu 5 gercek dosyasi (test/fixtures/) prepare()'dan
 * gecer. Her dosya farkli desteklenmeyen desendi:
 *   skychem: iki-satirli baslik + "MALZEME BİRİM" fiyat basligi unit'i
 *            kapiyordu (gercek birim BASLIKSIZ D'de) + 2 GIZLI sayfa
 *   aksa-algilama: EN basliklar + 2. baslik satiri + 1000+ kalem
 *   demontaj-sefa: HIC baslik yok + ad kolonunda "32 adet ..." tuzagi
 *   demontaj: basliksiz + onceden fiyatli
 *   yangin: yalniz fiyat basliklari baslikli; NO/AD/MIKTAR/BIRIM basliksiz
 *   npx ts-node test/gercek-dosya-test.ts   (npm run test:tf)
 */
import * as fs from 'fs';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';

/** Sahte CeviriService — bu testler dil gecmez, sheetleriCevir erken doner;
 *  onbellekHaritasi HIC cagrilmaz. Constructor 13.08'de 3 parametreye cikti;
 *  tsc test/ dizinini KAPSAMADIGI icin kirigi ancak regresyon yakaladi. */
const sahteCeviri = { onbellekHaritasi: async () => ({}) };
let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
const oku = (ad: string) => fs.readFileSync(`test/fixtures/${ad}`);
const veriSay = (s: any) => (s.rowData ?? []).filter((r: any) => r._isDataRow).length;

async function run() {
  // ── TF1: skychem.xlsm ──
  {
    const res = await svc.prepare(oku('FIRMA-G.xlsm'), { fixedSchema: true });
    const t = res.sheets.find((s: any) => s.name.includes('TEKLİF'))!;
    check('TF1 skychem açılır (59 kalem)', !t.isEmpty && veriSay(t) === 59, `veri=${veriSay(t)}`);
    // SABIT SEMA (GS1): roller sabit alanlari gosterir; olcut ICERIGE tasindi —
    // birim METIN, miktar SAYI olmali ("MALZEME BİRİM" fiyat basligina kanmadan).
    {
      const d = (t.rowData ?? []).filter((r: any) => r._isDataRow);
      const birimMetin = d.filter((r: any) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(String(r._birim ?? ''))).length;
      const miktarSayi = d.filter((r: any) => typeof r._miktar === 'number').length;
      check('TF1 birim İÇERİKTEN metin, miktar sayı (fiyat başlığına kanmaz)',
        birimMetin >= d.length * 0.8 && miktarSayi >= d.length * 0.8,
        `birim-metin=${birimMetin}/${d.length} miktar-sayı=${miktarSayi}/${d.length}`);
    }
    // NOT: "marka kolonu" olcutu KALDIRILDI — kullanici karari (30.07):
    // dosyanin kendi MARKA sutunu sabit semada tamamen atilir (GS1 harfiyen).
    const gizli = res.sheets.filter((s: any) => !s.name.includes('TEKLİF'));
    check('TF1 R-C: GIZLI sayfalar (KAYIT 1085 satır + YAİS) parse edilmez, rowData boş',
      gizli.length === 2 && gizli.every((s: any) => s.isEmpty && (s.rowData ?? []).length === 0),
      gizli.map((s: any) => `${s.name}:${(s.rowData ?? []).length}`).join('|'));
  }

  // ── TF2: aksa-algilama-iscilik.xlsm (EN basliklar, 2 baslik satiri) ──
  {
    const res = await svc.prepare(oku('FIRMA-F-algilama-iscilik.xlsm'), { fixedSchema: true });
    const s = res.sheets[0];
    check('TF2 aksa-algılama açılır (1000+ kalem, EN başlık QTY/Unit/BRAND)',
      !s.isEmpty && veriSay(s) >= 1000, `veri=${veriSay(s)}`);
    check('TF2 EN başlıklı dosyada ad/miktar/birim doğru yerleşti (DESCRPTION/QTY/Unit)',
      (s.rowData ?? []).filter((r: any) => r._isDataRow && String(r._ad ?? '').trim() && typeof r._miktar === 'number').length >= 900,
      `ad+miktar dolu satır=${(s.rowData ?? []).filter((r: any) => r._isDataRow && String(r._ad ?? '').trim() && typeof r._miktar === 'number').length}`);
  }

  // ── TF3: basliksiz dosyalar (sefa + demontaj) ──
  {
    const sefa = (await svc.prepare(oku('demontaj-sefa.xlsx'), { fixedSchema: true })).sheets[0];
    check('TF3 sefa (başlıksız + "32 adet..." ad tuzağı) AÇILIR — 8 kalem',
      !sefa.isEmpty && veriSay(sefa) === 8, `veri=${veriSay(sefa)}`);
    check('TF3 sefa: başlıksız dosyada ad/birim/miktar İÇERİKTEN yerleşti (Adet/Set)',
      (sefa.rowData ?? []).filter((r: any) => r._isDataRow).every((r: any) =>
        String(r._ad ?? '').trim() !== '' && /adet|set/i.test(String(r._birim ?? ''))),
      (sefa.rowData ?? []).filter((r: any) => r._isDataRow).slice(0, 3)
        .map((r: any) => `${String(r._ad).slice(0, 18)}|${r._miktar}|${r._birim}`).join(' · '));

    const dem = (await svc.prepare(oku('demontaj.xlsx'), { fixedSchema: true })).sheets[0];
    check('TF3 demontaj (başlıksız + önceden fiyatlı) AÇILIR — 42 kalem',
      !dem.isEmpty && veriSay(dem) === 42, `veri=${veriSay(dem)}`);
  }

  // ── TF4: yangin-temin-montaj (yalniz fiyat basliklari; yetim-olcu satirlar) ──
  {
    const y = (await svc.prepare(oku('yangin-temin-montaj.xlsx'), { fixedSchema: true })).sheets[0];
    check('TF4 yangın AÇILIR — 16 kalem (yetim-ölçü 2"/2½"/3"/4" satırları dahil)',
      !y.isEmpty && veriSay(y) === 16, `veri=${veriSay(y)}`);
    check('TF4 ad/birim/miktar İÇERİKTEN yerleşti (Metre/SET/Adet)',
      (y.rowData ?? []).filter((r: any) => r._isDataRow).every((r: any) =>
        String(r._ad ?? '').trim() !== '' && /metre|set|adet/i.test(String(r._birim ?? ''))),
      (y.rowData ?? []).filter((r: any) => r._isDataRow).slice(0, 3)
        .map((r: any) => `${String(r._ad).slice(0, 18)}|${r._miktar}|${r._birim}`).join(' · '));
    // R-F: fiyat kolonunda metin ("ŞİRKET TEMİNİ") parse'i KIRMAZ — satir yine veri
    const adlar = (y.rowData ?? []).filter((r: any) => r._isDataRow).map((r: any) => String(r._ad ?? ''));
    check('TF4 R-F: "ŞİRKET TEMİNİ" fiyatlı satır veri olarak korunur',
      adlar.some((a: string) => a.includes('Tüp Bölmeli')), adlar.slice(0, 5).join('|'));
  }

  // ── KH1 (SORUN 14, hangar 500): SHARED-FORMULA'li dosya export edilir ──
  // Dosyanin F kolonunda shared-formula zinciri var; K-A temizligi master'i
  // silince clone'lar oksuz kaliyor, writeBuffer "Shared Formula master
  // must exist" ile patliyordu (canli 500'un birebir koku). Fix: hedef
  // kolonlardaki shared zincirler once degere dondurulur.
  {
    const { QuotesService } = require('../src/ozellik/teklif/quotes/quotes.service');
    const buf = oku('hangar-yss.xlsx');
    const res = await svc.prepare(buf, { fixedSchema: true });
    let n = 0;
    for (const r of (res.sheets[0].rowData ?? []) as any[]) {
      if (r._isDataRow && n < 2) { r._matBirim = '64637,3'; r._matToplam = ''; n++; }
    }
    const quote: any = {
      id: 'q1', userId: 'u1', title: 'Hangar', sheets: JSON.parse(JSON.stringify(res.sheets)),
      originalFile: buf, quoteNo: 'MP-1', rev: 1, exportOverrides: null,
    };
    const prisma: any = { quote: { findFirst: async () => quote }, quoteFormat: { findFirst: async () => null } };
    const fx: any = { getRates: async () => ({ usdTry: 47, eurTry: 54, usdTryBuying: 47, eurTryBuying: 54, source: 'f', date: '' }) };
    const qsvc = new QuotesService(prisma, fx, sahteCeviri as any);
    let hata = ''; let sonuc: any = null;
    try { sonuc = await qsvc.exportPricedXlsx('u1', 'q1'); } catch (e: any) { hata = e?.message ?? 'hata'; }
    check('KH1 hangar (shared-formula) export-priced HATASIZ + dosya üretildi',
      hata === '' && (sonuc?.buffer?.length ?? 0) > 5000 && !sonuc?.uyari,
      hata || `boyut=${sonuc?.buffer?.length} uyari=${sonuc?.uyari}`);
  }

  // ── KH11 (E2E ALTIN YOL BULGUSU — F&G Yorel, canli 500) ────────────
  // KH1 shared-formula dondurmasi YALNIZ hedef kolonlari tariyordu. Bu
  // dosyada "mekanik G BLOK" sayfasinda master H110 (HEDEF kolon, K-A ile
  // temizlenir) ama clone I110 BASKA kolonda → dondurulmadan master silinip
  // export patliyordu: "Shared Formula master must exist above and or left
  // of clone for cell I110". Fix: silinecek master'a bagli TUM clone'lar
  // (kolon farketmeksizin) once degere dondurulur.
  {
    const { QuotesService } = require('../src/ozellik/teklif/quotes/quotes.service');
    const buf = oku('fg-FIRMA-H-shared.xlsx');
    const res = await svc.prepare(buf, { fixedSchema: true });
    // Ilk 2 veri satirina fiyat yaz (K-A temizligi devreye girsin)
    let yazildi = 0;
    for (const sh of res.sheets as any[]) {
      for (const r of (sh.rowData ?? []) as any[]) {
        if (r._isDataRow && yazildi < 2) { r._matBirim = '1250'; r._matToplam = ''; yazildi++; }
      }
      if (yazildi >= 2) break;
    }
    const quote: any = {
      id: 'q9', userId: 'u1', title: 'FG Yorel', sheets: JSON.parse(JSON.stringify(res.sheets)),
      originalFile: buf, quoteNo: 'MP-9', rev: 1, exportOverrides: null,
    };
    const prisma: any = { quote: { findFirst: async () => quote }, quoteFormat: { findFirst: async () => null } };
    const fx: any = { getRates: async () => ({ usdTry: 47, eurTry: 54, usdTryBuying: 47, eurTryBuying: 54, source: 'f', date: '' }) };
    const qsvc = new QuotesService(prisma, fx, sahteCeviri as any);
    let hata = ''; let sonuc: any = null;
    try { sonuc = await qsvc.exportPricedXlsx('u1', 'q9'); } catch (e: any) { hata = e?.message ?? 'hata'; }
    check('KH11 çapraz-kolon shared-formula (master H110 / clone I110) export HATASIZ',
      hata === '' && (sonuc?.buffer?.length ?? 0) > 10000,
      hata || `boyut=${sonuc?.buffer?.length}`);
  }

  // ══ ALTIN YOL (ARINMA Faz 1) — Z1→Z2→Z3→Z4→Z5 UCTAN UCA ═══════════
  // GERCEK dosya (hangar) → parse → ESLESTIR (sahte kutuphane, tek motor)
  // → fiyat + toplam (etkinMiktar kurali) → IKI export → cikti dogrulama.
  {
    const { MatchingService } = require('../src/ozellik/eslestirme/matching/matching.service');
    const { TerminologyService, ALIAS_SEEDS } = require('../src/ozellik/eslestirme/matching/terminology.service');
    const { buildProductIndex } = require('../src/ozellik/eslestirme/matching/index/product-index');
    const { QuotesService } = require('../src/ozellik/teklif/quotes/quotes.service');
    const { buildSampleFormat } = require('../src/ozellik/cikti/quote-formats/format-engine');

    const buf = oku('hangar-yss.xlsx');
    const res = await svc.prepare(buf, { fixedSchema: true });
    const sheet: any = res.sheets[0];
    const nameField = sheet.columnRoles.nameField;
    const qtyField = sheet.columnRoles.quantityField;
    const dataRows = (sheet.rowData ?? []).filter((r: any) => r._isDataRow);

    // Z2: sahte kutuphane — dosyadaki iki gercek kalem adiyla urun
    const libRow = (ad: string, cap: string, price: number, kod: string) => {
      const idx = buildProductIndex({ kategori: 'Vanalar', ad, cins: 'çelik', baglanti: 'flanşlı', cap, birim: 'adet', price, paraBirimi: 'TL', urunKodu: kod, sheetName: 'S' });
      return { id: `l-${kod}`, materialId: null, material: null, materialName: idx.displayName,
        listPrice: price, customPrice: null, discountRate: 0, currency: 'TRY',
        productIndexId: `p-${kod}`, product: { ...idx, id: `p-${kod}`, ad, cins: 'çelik', baglanti: 'flanşlı', capRaw: cap, kategori: 'Vanalar', boyMm: null, urunKodu: kod, sheetName: 'S', price } };
    };
    const rows = [
      libRow('Islak Alarm Vanası', '6"', 64637.3, 'IAV6'),
      libRow('Kelebek Vana', '6"', 28885.6, 'KV6'),
    ];
    const prismaM: any = {
      userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : rows) },
      brand: { findUnique: async () => ({ name: 'AYVAZ' }) },
      eslesmeHafizasi: { findUnique: async () => null, upsert: async () => {} },
      terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    };
    const fx: any = { getRates: async () => ({ usdTry: 47, eurTry: 54, usdTryBuying: 47, eurTryBuying: 54, source: 'f', date: '' }) };
    const msvc = new MatchingService(prismaM, new TerminologyService(prismaM), fx);

    // Dosyadaki yetim-olcu satirlar: "6\"" — FE baglami parent adla birlestirir;
    // BE altin-yolunda birlesik adla sorgulanir (UY1 sonrasi gercek sorgu sekli).
    const sorgular = ['ISLAK ALARM VANASI 6"', 'KELEBEK VANA 6"'];
    const mres = await msvc.bulkMatch('u1', 'b1', sorgular);
    check('ALTIN Z2: iki kalem tek motorla eşleşti (64.637,3 + 28.885,6)',
      mres[sorgular[0]]?.netPrice === 64637.3 && mres[sorgular[1]]?.netPrice === 28885.6,
      JSON.stringify([mres[sorgular[0]]?.netPrice, mres[sorgular[1]]?.netPrice]));

    // Z3: fiyati grid'e yaz + toplam = fiyat × ETKIN miktar (FE kurali ikizi)
    const olculu = dataRows.filter((r: any) => String(r[nameField] ?? '').trim() === '6"').slice(0, 2);
    const fiyatlar = [64637.3, 28885.6];
    olculu.forEach((r: any, i: number) => {
      r._matBirim = String(fiyatlar[i]).replace('.', ',');
      const qty = parseFloat(String(r[qtyField] ?? '0').replace(',', '.')) || 0;
      r._matToplam = qty > 0 ? String(Math.round(fiyatlar[i] * qty * 100) / 100).replace('.', ',') : '';
    });
    check('ALTIN Z3: satır toplamı = fiyat × miktar (2×64.637,3=129.274,6)',
      olculu.length === 2 && parseFloat(String(olculu[0]._matToplam).replace(',', '.')) === 129274.6,
      `n=${olculu.length} top=${olculu[0]?._matToplam}`);

    // Z4 + Z5: iki export ayni motor/haritayla
    const quote: any = { id: 'q1', userId: 'u1', title: 'ALTIN', sheets: JSON.parse(JSON.stringify(res.sheets)),
      originalFile: buf, quoteNo: 'MP-9', rev: 1, exportOverrides: null, musteri: 'X', proje: 'Y', hazirlayan: 'E', gecerlilik: '30' };
    const prismaQ: any = {
      quote: { findFirst: async () => quote, count: async () => 0, update: async ({ data }: any) => Object.assign(quote, data) },
      quoteFormat: { findFirst: async () => null },
      quoteExport: { create: async () => ({}) },
      $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prismaQ)),
    };
    const qsvc = new QuotesService(prismaQ, fx, sahteCeviri as any);
    const priced = await qsvc.exportPricedXlsx('u1', 'q1');
    check('ALTIN Z4: fiyatlandırılmış export hatasız + self-check temiz',
      priced.buffer.length > 5000 && !priced.uyari, `uyari=${priced.uyari}`);
    // PANO 21a: gorunur self-check ozeti ("N değer aktarıldı ✓ · … fiyatsız")
    // PANO 21a + KG9: özet HER ZAMAN aktarılan değer sayısı ve toplamı taşır.
    // "N satır fiyatsız" eki YALNIZ fiyatsız satır varken eklenir — KG9'dan
    // sonra dosyanın kendi fiyatları da grid'e geldiği için hangar dosyasında
    // fiyatsız satır KALMIYOR (57 değer aktarıldı). Sözleşme: aktarılan sayı
    // + toplam zorunlu; fiyatsız eki koşullu ama sayı 0'dan büyükse ZORUNLU.
    const ozet = priced.ozet ?? '';
    const aktarilan = parseInt((/(\d+) değer aktarıldı/.exec(ozet) ?? [])[1] ?? '0', 10);
    check('ALTIN Z4/21a: export özeti üretildi (aktarılan sayı + toplam)',
      /değer aktarıldı/.test(ozet) && /toplam/.test(ozet) && aktarilan > 0,
      `ozet="${ozet}"`);
    check('ALTIN Z4/21a-b: fiyatsız satır varsa özette bildirilir (sessiz eksik yasak)',
      !/fiyatsız/.test(ozet) || /\d+ satır fiyatsız/.test(ozet),
      `ozet="${ozet}"`);

    const { buildExportWorkbook } = require('../src/ozellik/teklif/quotes/export-engine');
    const s5 = await buildExportWorkbook({
      originalFile: buf, sheetsArr: quote.sheets, formatWb: buildSampleFormat(), sheetRoles: null,
      ctxTemel: { teklifNo: 'MP-9', rev: 1, tarih: '27.07.2026', musteri: 'X', proje: 'Y', hazirlayan: 'E', gecerlilik: '30', kurNotu: 'Kur', kdvOran: 0.2 },
      overrides: null,
    });
    check('ALTIN Z5: teklif-format export — eksikDeger=0, hata artışı=0, İCMAL değeri doğru',
      s5.eksikDeger === 0 && s5.hataArtisi === 0 && Math.abs((s5.sekmeler[0]?.matDeger ?? 0) - (129274.6 + 57771.2)) < 0.01,
      `eksik=${s5.eksikDeger} hata=${s5.hataArtisi} mat=${s5.sekmeler[0]?.matDeger}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`GERCEK DOSYA UYUMLULUK (TF1-TF4): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
