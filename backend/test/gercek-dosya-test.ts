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
import { ExcelGridService } from '../src/modules/excel-grid/excel-grid.service';

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
    const res = await svc.prepare(oku('skychem.xlsm'), { fixedSchema: true });
    const t = res.sheets.find((s: any) => s.name.includes('TEKLİF'))!;
    check('TF1 skychem açılır (59 kalem)', !t.isEmpty && veriSay(t) === 59, `veri=${veriSay(t)}`);
    check('TF1 birim rolü İÇERİKTEN doğru kolona (D=col3; "MALZEME BİRİM" fiyat başlığına kanmaz)',
      t.columnRoles?.unitField === 'col3' && t.columnRoles?.quantityField === 'col2',
      `unit=${t.columnRoles?.unitField} qty=${t.columnRoles?.quantityField}`);
    check('TF1 marka kolonu A (Çayırova parent satırları)', t.columnRoles?.brandField === 'col0',
      `brand=${t.columnRoles?.brandField}`);
    const gizli = res.sheets.filter((s: any) => !s.name.includes('TEKLİF'));
    check('TF1 R-C: GIZLI sayfalar (KAYIT 1085 satır + YAİS) parse edilmez, rowData boş',
      gizli.length === 2 && gizli.every((s: any) => s.isEmpty && (s.rowData ?? []).length === 0),
      gizli.map((s: any) => `${s.name}:${(s.rowData ?? []).length}`).join('|'));
  }

  // ── TF2: aksa-algilama-iscilik.xlsm (EN basliklar, 2 baslik satiri) ──
  {
    const res = await svc.prepare(oku('aksa-algilama-iscilik.xlsm'), { fixedSchema: true });
    const s = res.sheets[0];
    check('TF2 aksa-algılama açılır (1000+ kalem, EN başlık QTY/Unit/BRAND)',
      !s.isEmpty && veriSay(s) >= 1000, `veri=${veriSay(s)}`);
    check('TF2 roller: name=DESCRPTION(col3) brand=BRAND(col2) qty=QTY(col4) unit=Unit(col5)',
      s.columnRoles?.nameField === 'col3' && s.columnRoles?.brandField === 'col2'
      && s.columnRoles?.quantityField === 'col4' && s.columnRoles?.unitField === 'col5',
      JSON.stringify(s.columnRoles));
  }

  // ── TF3: basliksiz dosyalar (sefa + demontaj) ──
  {
    const sefa = (await svc.prepare(oku('demontaj-sefa.xlsx'), { fixedSchema: true })).sheets[0];
    check('TF3 sefa (başlıksız + "32 adet..." ad tuzağı) AÇILIR — 8 kalem',
      !sefa.isEmpty && veriSay(sefa) === 8, `veri=${veriSay(sefa)}`);
    check('TF3 sefa rolleri İÇERİKTEN: ad=col2 birim=col4(Adet/Set) miktar=col5',
      sefa.columnRoles?.nameField === 'col2' && sefa.columnRoles?.unitField === 'col4'
      && sefa.columnRoles?.quantityField === 'col5', JSON.stringify(sefa.columnRoles));

    const dem = (await svc.prepare(oku('demontaj.xlsx'), { fixedSchema: true })).sheets[0];
    check('TF3 demontaj (başlıksız + önceden fiyatlı) AÇILIR — 42 kalem',
      !dem.isEmpty && veriSay(dem) === 42, `veri=${veriSay(dem)}`);
  }

  // ── TF4: yangin-temin-montaj (yalniz fiyat basliklari; yetim-olcu satirlar) ──
  {
    const y = (await svc.prepare(oku('yangin-temin-montaj.xlsx'), { fixedSchema: true })).sheets[0];
    check('TF4 yangın AÇILIR — 16 kalem (yetim-ölçü 2"/2½"/3"/4" satırları dahil)',
      !y.isEmpty && veriSay(y) === 16, `veri=${veriSay(y)}`);
    check('TF4 rolleri İÇERİKTEN: ad=col2 birim=col4(Metre/SET/Adet) miktar=col5',
      y.columnRoles?.nameField === 'col2' && y.columnRoles?.unitField === 'col4'
      && y.columnRoles?.quantityField === 'col5', JSON.stringify(y.columnRoles));
    // R-F: fiyat kolonunda metin ("ŞİRKET TEMİNİ") parse'i KIRMAZ — satir yine veri
    const adlar = (y.rowData ?? []).filter((r: any) => r._isDataRow).map((r: any) => String(r.col2 ?? ''));
    check('TF4 R-F: "ŞİRKET TEMİNİ" fiyatlı satır veri olarak korunur',
      adlar.some((a: string) => a.includes('Tüp Bölmeli')), adlar.slice(0, 5).join('|'));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`GERCEK DOSYA UYUMLULUK (TF1-TF4): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
