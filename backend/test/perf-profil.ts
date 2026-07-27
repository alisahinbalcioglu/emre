/** ARINMA Faz 3 — MIKRO-PROFIL (gercek fixture + sentetik 1500-kalem havuz) */
import * as fs from 'fs';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';
import { buildProductIndex } from '../src/modules/matching/index/product-index';
import { parseLine } from '../src/modules/matching/index/line-parser';
import { runQuery } from '../src/modules/matching/index/query-engine';
import { writePricesToWorkbook, buildExportWorkbook } from '../src/quotes/export-engine';
import { buildSampleFormat } from '../src/quote-formats/format-engine';
import * as ExcelJS from 'exceljs';

const olc = async (ad: string, fn: () => Promise<any> | any, tekrar = 1) => {
  const t0 = Date.now();
  for (let i = 0; i < tekrar; i++) await fn();
  const ms = (Date.now() - t0) / tekrar;
  console.log(`  ${ad}: ${ms.toFixed(1)} ms${tekrar > 1 ? ` (ort/${tekrar})` : ''}`);
  return ms;
};

async function main() {
  const grid = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  console.log('── Z1: ICE AKTARIM (prepare) ──');
  const aksa = fs.readFileSync('test/fixtures/aksa-algilama-iscilik.xlsm');
  await olc('aksa-algilama 1115 satir (xlsm)', () => grid.prepare(aksa, { fixedSchema: true }));
  const sky = fs.readFileSync('test/fixtures/skychem.xlsm');
  await olc('skychem 91 satir + 2 gizli sayfa', () => grid.prepare(sky, { fixedSchema: true }));
  const hangar = fs.readFileSync('test/fixtures/hangar-yss.xlsx');
  await olc('hangar 58 satir', () => grid.prepare(hangar, { fixedSchema: true }));

  console.log('── Z2: ESLESTIRME (1500-kalem havuz, satir basina) ──');
  const AILELER = ['Küresel Vana', 'Kelebek Vana', 'Çek Vana', 'Siyah Çelik Boru', 'Galvaniz Boru', 'Dirsek', 'Te', 'Manşon', 'Flanş', 'Kompansatör'];
  const CAPLAR = ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"', '2 1/2"', '3"', '4"', '5"', '6"', 'DN15', 'DN25', 'DN80', 'DN100'];
  const pool: any[] = [];
  let k = 0;
  for (const a of AILELER) for (const c of CAPLAR) for (const v of ['dişli', 'flanşlı', 'kaynaklı', 'yivli', 'vidalı', 'geçmeli', 'rakorlu', 'presli', 'soketli', 'düz']) {
    const idx = buildProductIndex({ kategori: 'K', ad: a, cins: k % 2 ? 'pirinç' : 'çelik', baglanti: v, cap: c, birim: 'adet', price: 100 + k, paraBirimi: 'TL', urunKodu: `P${k}`, sheetName: 'S' });
    pool.push({ id: `l${k}`, listPrice: 100 + k, customPrice: null, discountRate: 0, currency: 'TRY', urun: { ...idx, ad: a, cins: k % 2 ? 'pirinç' : 'çelik', baglanti: v, capRaw: c, kategori: 'K', boyMm: null, urunKodu: `P${k}`, sheetName: 'S', price: 100 + k } });
    k++;
  }
  console.log(`  havuz: ${pool.length} kalem`);
  const SORGULAR = ['Küresel Vana 1"', 'Kelebek Vana DN80 flanşlı', 'Siyah çelik boru 2"', 'Dişli dirsek 3/4"', 'Çek vana 4"'];
  await olc(`sorgu × ${SORGULAR.length} (tekil ort.)`, () => { for (const q of SORGULAR) runQuery(parseLine(q), pool); }, 20);
  await olc('100 satirlik toplu eslestirme', () => { for (let i = 0; i < 100; i++) runQuery(parseLine(SORGULAR[i % SORGULAR.length]), pool); });

  console.log('── Z4/Z5: EXPORT (hangar gercek dosya) ──');
  const res = await grid.prepare(hangar, { fixedSchema: true });
  let n = 0;
  for (const r of (res.sheets[0].rowData ?? []) as any[]) if (r._isDataRow && n < 5) { r._matBirim = '100'; r._matToplam = ''; n++; }
  const sheets = JSON.parse(JSON.stringify(res.sheets));
  await olc('Z4 fiyatli-kesif (load+write+buffer)', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(hangar as any);
    writePricesToWorkbook(wb, sheets);
    await wb.xlsx.writeBuffer();
  }, 3);
  await olc('Z5 teklif-format (tam kurucu)', async () => {
    const s = await buildExportWorkbook({
      originalFile: hangar, sheetsArr: sheets, formatWb: buildSampleFormat(), sheetRoles: null,
      ctxTemel: { teklifNo: 'M', rev: 1, tarih: 't', musteri: 'm', proje: 'p', hazirlayan: 'h', gecerlilik: 'g', kurNotu: 'k', kdvOran: 0.2 },
      overrides: null,
    });
    await s.wb.xlsx.writeBuffer();
  }, 3);

  console.log('── SEMA INDEKSLERI ──');
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
  const kritik = ['UserLibrary', 'ProductIndex', 'EslesmeHafizasi', 'TerminologyAlias', 'Quote', 'LaborPrice'];
  for (const m of kritik) {
    const blok = schema.split(`model ${m} `)[1]?.split('\nmodel ')[0] ?? '';
    const idx = (blok.match(/@@index|@@unique|@unique/g) ?? []).length;
    console.log(`  ${m}: ${idx} index/unique`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
