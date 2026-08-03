/**
 * PANO 18 — TL/USD/EUR CEVRIMI CIKTIYA GECER  (`npm run test:18`)
 *
 * KRITER METNI (birebir alinti — `Duzeltme_Talebi_Disiplin_ParaBirimiExport_
 * CapSembolu.md` §18):
 *
 *   **Kural:** "Export = ekrandaki hal (v2 kurali). Teklifin secili goruntuleme
 *   birimi neyse, 'Fiyatlandirilmis Excel' ve 'Teklif Formatinda' ciktilarin
 *   IKISI de o birimle uretilir: degerler cevrilmis, hucre para bicimi o
 *   birimde, kur + tarih notu dosyada (kapak/baslik). Kutuphane orijinal
 *   birimleri degismez (yalniz cikti goruntusu)."
 *
 *   **Kabul:** 18a: USD sec → indir → dosyadaki birim fiyat/tutarlar USD,
 *   bicim $, kur notu var; ekranla birebir. 18b: TL'ye don → indir → TL.
 *   18c: Iki export yolu da ayni davranir (KF7 tek motor).
 *
 * NEDEN BU DOSYA: ozellik KODDA VARDI (27.07 canli turunda elle dogrulandi:
 * "$1.365,0 = ₺64.622,1/47,35 · F26=1365 `"$"#,##0.00` · D64 kur notu") ama
 * panoda "sifir eslesme" gorunuyordu — cunku HICBIR TEST 18a/18b/18c'ye
 * dokunmuyordu. Kanit kolonu bos olan kriter yapilmamis sayilir; bu suite o
 * kolonu dolduruyor.
 *
 * Uc kriter, UC AYRI assert. (Bir assert birden fazla kritere sayilamaz.)
 * Cikis kodu sozlesmesi: 0 = PASS · 2 = ON KOSUL YOK · digeri = FAIL.
 */
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { standartCiktiUret } from '../src/ozellik/teklif/quotes/standart-cikti';
import { buildExportWorkbook } from '../src/ozellik/teklif/quotes/export-engine';
import { buildSampleFormat } from '../src/quote-formats/format-engine';

let pass = 0; const fails: string[] = [];
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fails.push(`${ad}${kanit ? ' — ' + kanit : ''}`); console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};

/** Ekrandaki (TL) degerler — "ekranla birebir" sartinin referansi. */
const SHEETS = [{
  name: 'MEKANİK',
  isEmpty: false,
  rowData: [
    { _rowIdx: 0, _isHeaderRow: true, _ad: 'CİNSİ TANIMI' },
    { _rowIdx: 1, _isDataRow: true, _no: '1', _ad: 'Galvaniz Çelik Boru 1"', _miktar: 10, _birim: 'mt.',
      _matBirim: '100', _matToplam: '1000', _labBirim: '50', _labToplam: '500', _toplam: '1500' },
    { _rowIdx: 2, _isDataRow: true, _no: '2', _ad: 'Kelebek Vana DN 65', _miktar: 4, _birim: 'ad.',
      _matBirim: '250', _matToplam: '1000', _labBirim: '25', _labToplam: '100', _toplam: '1100' },
  ],
}];

const KUR = 47.35;
const USD = { kod: 'USD' as const, katsayi: 1 / KUR, not: `Fiyatlar USD — 1 USD = ₺${KUR} (TCMB, 31.07.2026)` };
const TRY_ = { kod: 'TRY' as const, katsayi: 1, not: '' };

/** Sayfadaki tum sayisal hucreler: {deger, bicim}. */
async function sayisalHucreler(buf: Buffer, sayfaAdi: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.getWorksheet(sayfaAdi);
  const out: { adres: string; deger: number; fmt: string }[] = [];
  ws?.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    // ⚠ OLCUM NOTU (31.07): ilk hal YALNIZ `typeof value === 'number'` bakiyordu
    // ve 18c sahte KIRMIZI verdi (standart 11 deger, format 8). Eksik ucu
    // (12.67 · 42.24 · 54.91) sayfa TOPLAMLARIYDI: standart yol duz sayi,
    // format yolu SUM FORMULU yaziyor (EX8/KF7 — Icmal formulleri). Ikisi de
    // ayni degeri uretir; fark URUNDE degil OLCUMDEYDI. Formul sonucu da sayilir.
    const v: any = c.value;
    if (typeof v === 'number') out.push({ adres: c.address, deger: v, fmt: String(c.numFmt ?? '') });
    else if (v && typeof v === 'object' && typeof v.result === 'number') {
      out.push({ adres: c.address, deger: v.result, fmt: String(c.numFmt ?? '') });
    }
  }));
  return out;
}
async function tumMetin(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const p: string[] = [];
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    if (typeof c.value === 'string') p.push(c.value);
  })));
  return p.join('\n');
}

async function main() {
  // ── 18a: USD sec → degerler cevrilmis + bicim $ + kur notu ───────────────
  const usd = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: USD, baslik: 'PANO18' });
  const usdHucre = await sayisalHucreler(usd.buffer, 'MEKANİK');
  const usdFiyat = usdHucre.filter((h) => h.fmt.includes('$'));
  // Ekrandaki ₺100 birim fiyat → $100/47,35 = $2,11
  const beklenen = Math.round((100 / KUR) * 100) / 100;
  const birimVar = usdFiyat.some((h) => Math.abs(h.deger - beklenen) < 0.011);
  const notVar = /1 USD = ₺47\.?,?35|Fiyatlar USD/.test(await tumMetin(usd.buffer));
  check('18a — USD: değerler çevrilmiş + biçim $ + kur notu dosyada',
    usdFiyat.length > 0 && birimVar && notVar,
    `$-biçimli hücre=${usdFiyat.length}; ₺100→$${beklenen} bulundu=${birimVar}; kurNotu=${notVar}`);

  // ── 18b: TL'ye don → ham TL degerler + ₺ bicim ───────────────────────────
  const tl = await standartCiktiUret({ sheetsArr: SHEETS as any, birim: TRY_, baslik: 'PANO18' });
  const tlHucre = await sayisalHucreler(tl.buffer, 'MEKANİK');
  const tlFiyat = tlHucre.filter((h) => h.fmt.includes('₺'));
  const hamVar = tlFiyat.some((h) => Math.abs(h.deger - 100) < 0.011);
  const dolarSizin = tlHucre.every((h) => !h.fmt.includes('$'));
  check('18b — TL: ham TL değerler + ₺ biçim, hiç $ biçimi yok',
    tlFiyat.length > 0 && hamVar && dolarSizin,
    `₺-biçimli hücre=${tlFiyat.length}; ₺100 ham bulundu=${hamVar}; $-biçim yok=${dolarSizin}`);

  // ── 18c: IKI EXPORT YOLU DA AYNI DAVRANIR (KF7 tek motor) ────────────────
  const orjYol = 'test/fixtures/hangar-yss.xlsx';
  if (!fs.existsSync(orjYol)) {
    console.log(`ON KOSUL YOK — ${orjYol} bulunamadi (18c olculemedi).`);
    console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL, 1 OLCULEMEDI`);
    process.exit(fails.length ? 1 : 2);
  }
  const fmtSonuc = await buildExportWorkbook({
    originalFile: fs.readFileSync(orjYol),
    sheetsArr: SHEETS as any,
    formatWb: buildSampleFormat(),
    sheetRoles: null,
    birim: USD,
    ctxTemel: {
      teklifNo: 'M-18', rev: 1, tarih: '31.07.2026', musteri: 'PANO18', proje: 'p',
      hazirlayan: 'h', gecerlilik: 'g', kurNotu: USD.not, kdvOran: 0.2,
    },
    overrides: null,
  } as any);
  const fmtBuf = Buffer.from(await fmtSonuc.wb.xlsx.writeBuffer());
  const fmtHucre = await sayisalHucreler(fmtBuf, 'MEKANİK');
  const fmtFiyat = fmtHucre.filter((h) => h.fmt.includes('$'));

  // ⚠ OLCUM NOTU (31.07): ilk hal SAYFANIN TUM $ hucrelerini karsilastirdi ve
  // sahte KIRMIZI verdi. Fark, standart yolun sayfa sonuna TOPLAM SATIRI
  // yazmasi, format yolunun yazmamasiydi — `export-engine.ts:332` bunu
  // BILEREK yapiyor: `standartSayfaYaz(..., { toplamSatiri: false })`, cunku
  // format yolunda toplamlar ICMAL sayfasinda SUM formulu olarak kurulur
  // (EX8/KF7). Yani tasarim geregi, urun farki DEGIL.
  //
  // Kriterin dedigi sey: "iki export yolu da AYNI DAVRANIR" — yani ayni
  // VERI SATIRI icin ayni cevrilmis deger + ayni para bicimi. Olcum bu.
  const satirFiyatlari = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet('MEKANİK');
    const adlar = SHEETS[0].rowData.filter((r: any) => r._isDataRow).map((r: any) => r._ad);
    const cikti: Record<string, string> = {};
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const ad = String(row.getCell(2).value ?? '').trim();
      if (!adlar.includes(ad)) return; // toplam/baslik satirlari HARIC
      const p: string[] = [];
      row.eachCell({ includeEmpty: false }, (c) => {
        if (typeof c.value === 'number' && String(c.numFmt ?? '').includes('$')) {
          p.push(`${c.value.toFixed(2)}|${c.numFmt}`);
        }
      });
      cikti[ad] = p.join(' · ');
    });
    return cikti;
  };
  const stdSatir = await satirFiyatlari(usd.buffer);
  const fmtSatir = await satirFiyatlari(fmtBuf);
  const ayni = JSON.stringify(stdSatir) === JSON.stringify(fmtSatir);
  const kurNotuFmt = /1 USD = ₺47\.?,?35|Fiyatlar USD/.test(await tumMetin(fmtBuf));
  check('18c — iki export yolu aynı davranır (KF7 tek motor)',
    Object.keys(fmtSatir).length > 0 && ayni && kurNotuFmt,
    `veri satırı=${Object.keys(stdSatir).length}; satır bazında eşit=${ayni}; format yolunda kur notu=${kurNotuFmt}`
    + (ayni ? '' : `\n    standart=${JSON.stringify(stdSatir)}\n    format  =${JSON.stringify(fmtSatir)}`));

  console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL`);
  if (fails.length) { fails.forEach((f) => console.log('  • ' + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
