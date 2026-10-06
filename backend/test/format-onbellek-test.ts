/**
 * MUSTERI FORMULLERININ ONBELLEGI  (`npm run test:format-onbellek`, regresyonda Z4)
 *
 * Kusur (06.10, gercek Excel COM ProtectedViewWindows ile olculdu): musteri formatinin
 * kendi formulleri ciktida sablonun ESKI onbellegini tasiyordu — e-postadaki ek
 * Korumali Gorunum'de acilir, HESAPLAMAZ: KAPAK ve GENEL TOPLAM 180 (sablon), dogrusu
 * 7236. Duzeltme `cikti/quote-formats/musteri-onbellegi.ts` + `dar-degerlendirici.ts`.
 *
 *  OB1 dar degerlendirici: Excel kurallari (oncelik, bos hucre, SUM metni atlar, IF tembel)
 *  OB2 desteklenmeyen her yapi `Desteklenmez` (yerele bagli: TEXT, sayi & metin; ad,
 *      tam sutun, 3B, dis kitap, hata, dizi sabiti, kesisim, birbirini goturen toplam...)
 *  OB3 Excel'in yuvarlamasi (15 hane, gercek Excel'de 62.460 durumla olculdu)
 *  OB4 onculler: cozulemeyen (TODAY, INDIRECT, ad, tam sutun) temkinle isaretlenir
 *  OB5 ★★ GERCEK motor (format diskten, Excel onbellekli): etkilenen formul DOGRU
 *      rakam, desteklenmeyen BOS + fullCalcOnLoad, etkilenmeyen DOKUNULMAZ
 *  OB6 onbellegi 0 olan etkilenmeyen formul satir eklemesinden SONRA da 0 tasir
 *  OB7 override'in yazdigi hucreye bakan formul yeniden hesaplanir
 *  OB8 dongu ve cok hucreli dizi formulu: bosaltilir (dizi ciktisi silinir)
 *  OB9 karisik teklif: karma METNE bakan musteri formulu bosaltilir
 *  OB10 formulsuz format ve yerlesik TL: tazeleme HIC calismaz (fullCalcOnLoad yok)
 * Gercek Excel kaniti (yerel, COM): zengin sablon 33 formul → 29 dogru, 4 bos, 0 yanlis.
 */
import * as ExcelJS from 'exceljs';
import { buildExportWorkbook } from '../src/ozellik/teklif/quotes/export-engine';
import { buildSampleFormat } from '../src/ozellik/cikti/quote-formats/format-engine';
import { darHesapla, excelYuvarla, onculler, Desteklenmez, type Deger } from '../src/ozellik/cikti/quote-formats/dar-degerlendirici';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const esit = (name: string, gelen: unknown, beklenen: unknown) =>
  check(name, gelen === beklenen, `beklenen ${JSON.stringify(beklenen)}, gelen ${JSON.stringify(gelen)}`);

// ── saf ortam: tek sayfa, harita ──
const HUCRE: Record<string, Deger> = { A1: 10, A2: 20, A3: 'x', B1: true, C1: 0.1, C2: 0.2, C3: 0.3 };
const ortam = {
  hucre: (_s: string | null, r: number, c: number): Deger => HUCRE[`${String.fromCharCode(64 + c)}${r}`] ?? null,
  aralik: (_s: string | null, r1: number, c1: number, r2: number, c2: number): Deger[] => {
    const out: Deger[] = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = HUCRE[`${String.fromCharCode(64 + c)}${r}`]; if (v !== undefined && v !== null) out.push(v); }
    return out;
  },
};
const hesapla = (f: string) => darHesapla(f, ortam);
const desteklenmez = (f: string) => { try { hesapla(f); return false; } catch (e) { return e instanceof Desteklenmez; } };

const roles = {
  noField: 'col0', nameField: 'col1', unitField: 'col2', quantityField: 'col3',
  materialUnitPriceField: 'col4', materialTotalField: 'col5', laborUnitPriceField: 'col6', laborTotalField: 'col7',
};
const sayfa = (name: string, index: number, mat: number, ek: Record<string, unknown> = {}) => ({
  name, index, isEmpty: false, columnRoles: roles, columnDefs: [],
  rowData: [
    { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false },
    { _rowIdx: 1, _isDataRow: true, col0: '1', col1: `${name} boru`, col2: 'mt', col3: 10, col4: String(mat / 10), col5: String(mat), col6: '1', col7: '10', ...ek },
  ],
});
const ctxTemel = {
  teklifNo: 'MP-2026-001', rev: 1, tarih: '06.10.2026', musteri: 'ACME', proje: 'P', hazirlayan: 'E', gecerlilik: '30', kurNotu: 'kur', kdvOran: 0.2,
};
const f = (ws: ExcelJS.Worksheet, a: string, formula: string, result?: unknown) => { ws.getCell(a).value = { formula, result } as any; };

/** Musteri formati — onbellekler Excel'in sablonda hesapladigi rakamlar (3 bolumle BAYAT). */
function musteriFormati(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const kapak = wb.addWorksheet('KAPAK');
  kapak.getCell('B2').value = '{{MUSTERI}}';
  f(kapak, 'C10', "'İCMAL'!E8", 180);
  f(kapak, 'C11', "ROUND('İCMAL'!E8/3,2)", 60);
  f(kapak, 'C12', "IF('İCMAL'!E8>1000,\"büyük\",\"küçük\")", 'küçük');
  f(kapak, 'C13', 'TODAY()', 46000);
  f(kapak, 'C14', "MAX('İCMAL'!C5:C5)", 100);
  f(kapak, 'C15', 'genelToplam', 180);
  f(kapak, 'C16', '2*3', 6);
  f(kapak, 'C17', 'Liste!B2*1', 20);
  kapak.getCell('Y1').value = 5;
  f(kapak, 'X1', 'TEXT(Y1,"0")', '5'); // etkilenmeyen + desteklenmeyen: DOKUNULMAZ
  kapak.getCell('B3').value = 10;
  f(kapak, 'C3', 'B3*2', 20); // OB7 override hedefi
  // OB7: AÇILMAYAN paylasimli grup (KAPAK, İCMAL'i anmaz) — ana + bagimli yeniden yazilir
  kapak.getCell('G30').value = { formula: '$B$3*3', result: 30, shareType: 'shared', ref: 'G30:G31' } as any;
  kapak.getCell('G31').value = { sharedFormula: 'G30', result: 30 } as any;
  const ic = wb.addWorksheet('İCMAL');
  ['', 'Bölüm', 'Malzeme', 'İşçilik', 'Toplam'].forEach((h, i) => { if (h) ic.getCell(4, i + 1).value = h; });
  ic.getCell('B5').value = '{{ICMAL_SATIRLARI}}';
  ic.getCell('C5').value = 100; ic.getCell('D5').value = 50;
  f(ic, 'E5', 'C5+D5', 150);
  f(ic, 'F5', 'ROUNDUP(E5*1.18,1)', 177);
  f(ic, 'E6', 'SUM(E5:E5)', 150);
  f(ic, 'E7', 'ROUND(E6*0.2,2)', 30);
  f(ic, 'E8', 'E6+E7', 180);
  f(ic, 'E9', 'MIN(E5:E5)', 150);
  f(ic, 'E11', 'E8&" TL"', '180 TL');
  ic.getCell('B12').value = 5;
  ic.mergeCells('B12:D12');
  f(ic, 'E12', 'SUM(B12:D12)+E8', 185);
  ic.getCell('H6').value = { formula: 'E6*2', result: 300, shareType: 'shared', ref: 'H6:H8' } as any;
  ic.getCell('H7').value = { sharedFormula: 'H6', result: 60 } as any;
  ic.getCell('H8').value = { sharedFormula: 'H6', result: 360 } as any;
  ic.getCell('B20').value = 0;
  f(ic, 'E20', 'B20*1', 0); // OB6: etkilenmeyen, onbellegi 0
  ic.getCell('L20').value = { formula: 'E8*2', result: 360, shareType: 'array', ref: 'L20:L21' } as any;
  ic.getCell('L21').value = 360; // dizi ciktisi
  f(ic, 'M1', 'M2+1', 1); f(ic, 'M2', 'M1+E8', 0); // dongu
  f(ic, 'N21', 'L21+1', 361); // dizi CIKTISINA bakan formul (ana etkilenir → bayat)
  f(ic, 'Q8', 'ROWS(H5:H5)', 1); // bos eklenen satirlari kapsayan aralik (ROWS desteklenmez)
  ic.getCell('B25').value = 7;
  f(ic, 'F25', 'TEXT(B25,"0")', '7'); // sablonun ALTINDA, etkilenmeyen + desteklenmeyen: kayar, DOKUNULMAZ
  wb.definedNames.add("'İCMAL'!$E$8", 'genelToplam');
  const liste = wb.addWorksheet('Liste'); // eski is sayfasi: ciktida silinir
  for (let r = 1; r <= 8; r++) { liste.getCell(r, 1).value = r; liste.getCell(r, 2).value = r * 10; liste.getCell(r, 3).value = r * 100; }
  return wb;
}

async function uret(formatHam: ExcelJS.Workbook, sheetsArr: any[], overrides: any = null) {
  const formatWb = new ExcelJS.Workbook();
  await formatWb.xlsx.load(Buffer.from(await formatHam.xlsx.writeBuffer()) as any); // uretim yolu: diskten
  const sonuc = await buildExportWorkbook({ sheetsArr, formatWb, ctxTemel, overrides } as any);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(Buffer.from(await sonuc.wb.xlsx.writeBuffer()) as any);
  return { sonuc, out };
}
const onb = (wb: ExcelJS.Workbook, s: string, a: string) => (wb.getWorksheet(s)!.getCell(a).model as any).result;
const formul = (wb: ExcelJS.Workbook, s: string, a: string) => (wb.getWorksheet(s)!.getCell(a).model as any).formula;
// ExcelJS calcPr niteliklerini GERI OKUMAZ (parseOpen bos model) — yazilan nesneden ve ham XML'den
const tamHesap = (wb: ExcelJS.Workbook) => (wb as any).calcProperties?.fullCalcOnLoad === true;
async function xmlMetni(wb: ExcelJS.Workbook): Promise<string> {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));
  return zip.file('xl/workbook.xml').async('string');
}

async function run() {
  // ══ OB1: dar degerlendirici — Excel kurallari ═════════════════════════
  esit('OB1 oncelik', hesapla('1+2*3'), 7);
  esit('OB1 tekli eksi ^ dan once (-2^2=4)', hesapla('-2^2'), 4);
  esit('OB1 ^ soldan (2^3^2=64)', hesapla('2^3^2'), 64);
  esit('OB1 yuzde', hesapla('50%'), 0.5);
  esit('OB1 hucre toplami', hesapla('A1+A2'), 30);
  esit('OB1 SUM araliktaki metni atlar', hesapla('SUM(A1:A4)'), 30);
  esit('OB1 SUM dogrudan mantik 1 sayar', hesapla('SUM(A1,5,TRUE)'), 16);
  esit('OB1 bos hucre aritmetikte 0', hesapla('A4+1'), 1);
  esit('OB1 bos hucreye basvuru 0 gosterir', hesapla('A4'), 0);
  esit('OB1 IF metin dali', hesapla('IF(A1>5,"b","k")'), 'b');
  esit('OB1 IF 3. arguman yoksa FALSE', hesapla('IF(A1>50,1)'), false);
  esit('OB1 ★ IF tembel: secilmeyen dal hesaplanmaz', hesapla('IF(FALSE,1/0,2)'), 2);
  esit('OB1 MIN / MAX', `${hesapla('MIN(A1:A2)')}/${hesapla('MAX(A1:A2)')}`, '10/20');
  esit('OB1 ABS', hesapla('ABS(-3)'), 3);
  esit('OB1 metin & metin', hesapla('"a"&"b"'), 'ab');
  esit('OB1 sayi karsilastirma', hesapla('A1=10'), true);
  esit('OB1 ayni metin esit', hesapla('"ab"="ab"'), true);
  esit('OB1 ROUND tam hucre', hesapla('ROUND(A1/3,2)'), 3.33);

  // ══ OB2: desteklenmeyen → bos (tahmin yok) ════════════════════════════
  for (const [ad, formulMetni] of [
    ['TEXT (yerele bagli)', 'TEXT(A1,"0")'], ['sayi & metin (yerele bagli)', 'A1&"x"'], ['metin aritmetikte', 'A3+1'],
    ['sifira bolme', '1/0'], ['bilinmeyen islev', 'VLOOKUP(1,A1:A2,1)'], ['tanimli ad', 'adim'], ['tam sutun', 'SUM(A:A)'],
    ['3B', "SUM('K:L'!A1)"], ['dis kitap', '[1]S!A1'], ['yapilandirilmis', 'Tablo1[Kol]'], ['hata sabiti', '#REF!+1'],
    ['dizi sabiti', 'SUM({1,2})'], ['kesisim', 'SUM(A1:A2 A1)'], ['★ birbirini goturen toplam', 'C1+C2-C3'],
    ['★ 15. hanede esit karsilastirma (0,1+0,2=0,3)', 'IF(SUM(C1:C2)=C3,1,2)'],
    ['harf katlamasi belirsiz', '"Ab"="ab"'], ['metin siralama (Turkce)', '"a"<"b"'], ['skaler baglamda aralik', 'A1:A2+1'],
    ['ROUND tek arguman', 'ROUND(A1)'], ['0^0', '0^0'], ['bos arguman', 'SUM(A1,)'], ['TEXT secilmeyen dalda da', 'IF(TRUE,1,TEXT(A1,"0"))'],
  ] as const) check(`OB2 desteklenmez: ${ad}`, desteklenmez(formulMetni));

  // ══ OB3: Excel'in yuvarlamasi (15 hane; olculdu) ═════════════════════
  esit('OB3 ★ ROUND(2,675;2) = 2,68 (Math.round 2,67 verirdi)', excelYuvarla(2.675, 2, 'yakin'), 2.68);
  esit('OB3 ROUND(1,005;2) = 1,01', excelYuvarla(1.005, 2, 'yakin'), 1.01);
  esit('OB3 ROUND(-2,5;0) = -3 (sifirdan uzaga)', excelYuvarla(-2.5, 0, 'yakin'), -3);
  esit('OB3 ROUNDUP(1,21;1) = 1,3', excelYuvarla(1.21, 1, 'yukari'), 1.3);
  esit('OB3 ROUNDDOWN(-1,29;1) = -1,2', excelYuvarla(-1.29, 1, 'asagi'), -1.2);
  esit('OB3 ROUND(1250;-2) = 1300', excelYuvarla(1250, -2, 'yakin'), 1300);
  esit('OB3 ROUND(1234;-2) = 1200', excelYuvarla(1234, -2, 'yakin'), 1200);
  esit('OB3 ROUNDUP(0,1+0,2;1) = 0,3 (15 hane)', excelYuvarla(0.1 + 0.2, 1, 'yukari'), 0.3);
  esit('OB3 ROUNDUP(0;2) = 0', excelYuvarla(0, 2, 'yukari'), 0);

  // ══ OB4: onculler ═════════════════════════════════════════════════════
  for (const x of ['TODAY()', 'INDIRECT("A1")', 'OFFSET(A1,1,0)', 'adim*2', 'SUM(E:E)', '_xlfn.RANDARRAY(2)']) {
    check(`OB4 onculu okunamaz → temkinli: ${x}`, onculler(x).cozulmez);
  }
  {
    const o = onculler("SUM('İCMAL'!E5:E7)+KAPAK!A1+B2");
    check('OB4 okunabilir onculler', !o.cozulmez && o.basvurular.length === 3
      && o.basvurular[0].sayfa === 'İCMAL' && o.basvurular[0].r2 === 7 && o.basvurular[1].sayfa === 'KAPAK' && o.basvurular[2].sayfa === null,
    JSON.stringify(o));
  }

  // ══ OB5: GERCEK motor, 3 bolum ════════════════════════════════════════
  const ucBolum = [sayfa('Mekanik', 0, 1000), sayfa('Elektrik', 1, 2000), sayfa('Yangin', 2, 3000)];
  {
    const { sonuc, out } = await uret(musteriFormati(), ucBolum);
    esit('OB5 ★★ KAPAK toplami DOGRU rakam (eskiden 180)', onb(out, 'KAPAK', 'C10'), 7236);
    esit('OB5 ★ ARA TOPLAM', onb(out, 'İCMAL', 'E8'), 6030);
    esit('OB5 ★ KDV (ROUND)', onb(out, 'İCMAL', 'E9'), 1206);
    esit('OB5 ★★ GENEL TOPLAM', onb(out, 'İCMAL', 'E10'), 7236);
    esit('OB5 KAPAK ROUND(…/3;2)', onb(out, 'KAPAK', 'C11'), 2412);
    esit('OB5 KAPAK IF metin sonucu', onb(out, 'KAPAK', 'C12'), 'büyük');
    esit('OB5 KAPAK MAX genisleyen aralik', onb(out, 'KAPAK', 'C14'), 3000);
    esit('OB5 MIN bolum blogu', onb(out, 'İCMAL', 'E11'), 1010);
    esit('OB5 ★ birlesik hucre bir kez sayilir (5 + 7236)', onb(out, 'İCMAL', 'E14'), 7241);
    esit('OB5 sablon kopyasi ROUNDUP (2. bolum)', onb(out, 'İCMAL', 'F6'), 2371.8);
    esit('OB5 paylasimli grup (H10 = GENEL × 2)', onb(out, 'İCMAL', 'H10'), 14472);
    esit('OB5 kayan paylasimli grup satir eklemesinde acilmis', formul(out, 'İCMAL', 'H10'), 'E10*2');
    esit('OB5 ★ TODAY bos (sablonun tarihi bayat)', onb(out, 'KAPAK', 'C13'), undefined);
    esit('OB5 ★ tanimli ad bos', onb(out, 'KAPAK', 'C15'), undefined);
    esit('OB5 ★ silinen liste yuvasina basvuru bos', onb(out, 'KAPAK', 'C17'), undefined);
    esit('OB5 ★ sayi & metin (yerele bagli) bos', onb(out, 'İCMAL', 'E13'), undefined);
    esit('OB5 bosaltilan formulun metni korunur', formul(out, 'İCMAL', 'E13'), 'E10&" TL"');
    check('OB5 ★ bosaltma varsa fullCalcOnLoad', tamHesap(sonuc.wb));
    check('OB5 fullCalcOnLoad dosyada', (await xmlMetni(sonuc.wb)).includes('fullCalcOnLoad="1"'));
    esit('OB5 etkilenmeyen bagimsiz formul DOKUNULMAZ', onb(out, 'KAPAK', 'C16'), 6);
    esit('OB5 ★ etkilenmeyen DESTEKLENMEYEN formul onbellegi korunur', onb(out, 'KAPAK', 'X1'), '5');
    check('OB5 sonuc sayaclari', sonuc.musteriOnbellegi?.hesaplanan! > 0 && sonuc.musteriOnbellegi?.bosaltilan! >= 4,
      JSON.stringify(sonuc.musteriOnbellegi));
    // ══ OB6: 0 onbellegi satir eklemesinden sonra da 0 ══
    esit('OB6 kayan formul (E20 → E22)', formul(out, 'İCMAL', 'E22'), 'B22*1');
    esit('OB6 ★ onbellegi 0 KORUNUR (ExcelJS value okuyucusu dusuruyordu)', onb(out, 'İCMAL', 'E22'), 0);
    // ══ OB8: dongu + dizi ══
    esit('OB8 dongu bos', onb(out, 'İCMAL', 'M1'), undefined);
    esit('OB8 dizi formulu bos', onb(out, 'İCMAL', 'L22'), undefined);
    esit('OB8 ★ dizi ciktisi silinir (bayat rakam kalmaz)', out.getWorksheet('İCMAL')!.getCell('L23').value, null);
    esit('OB8 ★ dizi ciktisina bakan formul bos (bayat 361 degil)', onb(out, 'İCMAL', 'N23'), undefined);
    esit('OB8 ★ eklenen BOS satirlari kapsayan aralik etkilenir (ROWS 1 → 3; bos)', onb(out, 'İCMAL', 'Q10'), undefined);
    esit('OB6 sablonun altindaki formul kayar (F25 → F27)', formul(out, 'İCMAL', 'F27'), 'TEXT(B27,"0")');
    esit('OB6 ★ kayan etkilenmeyen desteklenmeyen formul DOKUNULMAZ (satir eslemesi)', onb(out, 'İCMAL', 'F27'), '7');
  }

  // ══ OB7: override ══════════════════════════════════════════════════════
  {
    const { out } = await uret(musteriFormati(), ucBolum, { KAPAK: { B3: { value: 50 } } });
    esit('OB7 ★ override yazilan hucreye bakan formul yeniden hesaplanir', onb(out, 'KAPAK', 'C3'), 100);
    esit('OB7 paylasimli ana yeniden hesaplanir', onb(out, 'KAPAK', 'G30'), 150);
    esit('OB7 paylasimli ana paylasimli kalir', (out.getWorksheet('KAPAK')!.getCell('G30').model as any).shareType, 'shared');
    esit('OB7 ★ paylasimli BAGIMLI yeniden hesaplanir', onb(out, 'KAPAK', 'G31'), 150);
    esit('OB7 bagimli anasina bagli kalir', (out.getWorksheet('KAPAK')!.getCell('G31').model as any).sharedFormula, 'G30');
  }

  // ══ OB9: karisik teklif — karma metne bakan musteri formulu ══════════
  {
    const wb = new ExcelJS.Workbook();
    const k = wb.addWorksheet('KAPAK');
    k.getCell('B5').value = '{{GENEL_TOPLAM}}';
    f(k, 'C5', 'B5*1', 0);
    const karisik = [sayfa('Mekanik', 0, 1000, { _matPB: 'USD', _labPB: 'TRY' }), sayfa('Elektrik', 1, 2000)];
    const { out } = await uret(wb, karisik);
    check('OB9 karisik: GENEL_TOPLAM karma metin', typeof out.getWorksheet('KAPAK')!.getCell('B5').value === 'string');
    esit('OB9 ★ karma metne bakan formul bos (sifir degil)', onb(out, 'KAPAK', 'C5'), undefined);
  }

  // ══ OB10: formulsuz format / yerlesik TL — hic calismaz ═══════════════
  {
    const { sonuc } = await uret(buildSampleFormat(), ucBolum);
    esit('OB10 ★ yerlesik TL: tazeleme calismaz', sonuc.musteriOnbellegi, undefined);
    check('OB10 yerlesik TL: fullCalcOnLoad YOK', !tamHesap(sonuc.wb) && !(await xmlMetni(sonuc.wb)).includes('fullCalcOnLoad'));
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('KAPAK').getCell('B2').value = '{{GENEL_TOPLAM}}';
    const r2 = await uret(wb, ucBolum);
    esit('OB10 formulsuz musteri formati: calismaz', r2.sonuc.musteriOnbellegi, undefined);
  }
}

async function ana() {
  await run();
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) { for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
}
bitmezseKirmizi(ana().catch((e) => { console.error(e); process.exitCode = 1; }));
