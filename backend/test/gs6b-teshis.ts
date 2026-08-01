/**
 * PK8 TESHIS (tek seferlik olcum, kalici test DEGIL)
 *
 * Soru: GS6b'de ("Malzeme Adi sutunu" secicisi degisince grid yeniden
 * dolmuyor) kusur VERIDE mi yoksa React/AG-Grid BORUSUNDA mi?
 *
 * Yontem: gercek YILDIZ fixture'i backend'in kendi parse'iyla okunur (frontend
 * ne aliyorsa o), sonra `quotes/new/page.tsx:665-676` icindeki `yenidenDoldur`
 * mantigi BIREBIR uygulanir. `_ad` degisiyorsa kusur boruda, degismiyorsa
 * veride.
 */
import * as fs from 'fs';
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

async function main() {
  const grid = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  const yol = '../test-fixtures/e2e/FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx';
  if (!fs.existsSync(yol)) {
    console.log('ON KOSUL YOK — YILDIZ fixture bulunamadi:', yol);
    process.exit(2);
  }
  const out: any = await grid.prepare(fs.readFileSync(yol), { fixedSchema: true } as any);
  const sheets: any[] = out.sheets ?? [];
  console.log(`sayfa sayisi: ${sheets.length}`);
  const trafo = sheets.find((s) => /trafo/i.test(s.name));
  if (!trafo) { console.log('Trafo sayfasi yok:', sheets.map((s) => s.name)); process.exit(2); }

  console.log(`\n── SAYFA: ${trafo.name} ──`);
  console.log(`  index=${trafo.index} · isEmpty=${trafo.isEmpty} · satir=${trafo.rowData?.length}`);
  console.log(`  kaynakAdKolonu = ${JSON.stringify(trafo.kaynakAdKolonu)}`);
  console.log(`  kaynakKolonlar = ${JSON.stringify((trafo.kaynakKolonlar ?? []).map((k: any) => k.field))}`);
  const kaynakliSatir = (trafo.rowData ?? []).filter((r: any) => r?._kaynak).length;
  console.log(`  _kaynak TASIYAN satir: ${kaynakliSatir}/${trafo.rowData?.length}`);

  if (!kaynakliSatir) {
    console.log('\n🔴 KOK NEDEN VERIDE: hicbir satirda `_kaynak` yok →');
    console.log('   yenidenDoldur ERKEN DONUS yapar, `_ad` HIC yeniden yazilmaz.');
    process.exit(0);
  }

  // ── page.tsx:665-676 `yenidenDoldur` BIREBIR ──
  const yenidenDoldur = (s: any, newField: string) => {
    if (!s?.rowData?.length || !s.rowData.some((r: any) => r?._kaynak)) {
      return { ...s, columnRoles: { ...s.columnRoles, nameField: newField }, _erkenDonus: true };
    }
    const rowData = s.rowData.map((r: any) => {
      const ad = String(r?._kaynak?.[newField] ?? '').trim();
      const miktar = String(r?._miktar ?? '').trim();
      const birim = String(r?._birim ?? '').trim();
      return { ...r, _ad: ad, _isDataRow: !!ad && (!!birim || (!!miktar && miktar !== '0')) };
    });
    return { ...s, rowData, kaynakAdKolonu: newField, _erkenDonus: false };
  };

  const secenekler: string[] = (trafo.kaynakKolonlar ?? []).map((k: any) => k.field);
  const secili = trafo.kaynakAdKolonu;
  const hedef = secenekler.find((f) => f !== secili);
  console.log(`\n  secili="${secili}" → hedef="${hedef}" (E2E ayni secimi yapar)`);
  if (!hedef) { console.log('🔴 secenek yok — secici tek secenekli'); process.exit(0); }

  const once = (trafo.rowData ?? []).filter((r: any) => r._isDataRow).slice(0, 8).map((r: any) => r._ad);
  const sonrasi = yenidenDoldur(trafo, hedef);
  const sonra = (sonrasi.rowData ?? []).filter((r: any) => r._isDataRow).slice(0, 8).map((r: any) => r._ad);

  console.log(`  erkenDonus = ${sonrasi._erkenDonus}`);
  console.log(`  ONCE : ${JSON.stringify(once)}`);
  console.log(`  SONRA: ${JSON.stringify(sonra)}`);
  const degisti = JSON.stringify(once) !== JSON.stringify(sonra);
  console.log(`\n  _ad DEGISTI Mi? → ${degisti ? 'EVET' : 'HAYIR'}`);
  console.log(degisti
    ? '\n🔵 KOK NEDEN BORUDA: veri/mantik dogru calisiyor, ekrana yansitan katman kusurlu.'
    : '\n🔴 KOK NEDEN VERIDE: mantik dogru ama `_kaynak` yeni alanda ayni/bos deger veriyor.');

  // Ek olcum: hedef alan kac satirda GERCEKTEN farkli deger tasiyor?
  const farkli = (trafo.rowData ?? []).filter((r: any) => {
    if (!r?._kaynak) return false;
    const yeni = String(r._kaynak[hedef] ?? '').trim();
    return yeni && yeni !== String(r._ad ?? '').trim();
  }).length;
  const bos = (trafo.rowData ?? []).filter((r: any) => r?._kaynak && !String(r._kaynak[hedef] ?? '').trim()).length;
  console.log(`  hedef alanda FARKLI deger tasiyan satir: ${farkli}`);
  console.log(`  hedef alanda BOS olan satir           : ${bos}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
