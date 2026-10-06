/**
 * MUSTERI FORMATI — İCMAL SATIR EKLEMESI FORMULLERE YANSITILIR (06.10, P3).
 *   npm run test:format-satir-ekleme
 *
 * Kok (olculdu): `icmalSatirlariniYaz` sablon satirini `duplicateRow` ile
 * cogaltir; ExcelJS alttaki hucreleri kaydirir ama formul basvurularini
 * GUNCELLEMEZ. 3 bolumlu teklifte musterinin ARA TOPLAM'i (SUM(E5:E5)) yalniz
 * ilk bolumu, KDV'si (E6*0.2) ikinci bolum satirini, KAPAK'taki 'İCMAL'!E8
 * ARA TOPLAM'i gosteriyordu — teklif formatinin cikti RAKAMI yanlisti.
 *
 *  SE1 saf kural: ekleme (alt +k, sablonu iceren aralik blogu kapsar, mutlak da
 *      kayar, baska sayfa / tirnak ici / islev adi / yalniz-sutun dokunulmaz)
 *  SE2 saf kural: sablon kopyasi (goreli satir +i, mutlak sabit)
 *  SE3 ★★ GERCEK motor (buildExportWorkbook, 3 bolum): formul metinleri + DEGER
 *      (GENEL TOPLAM = Σ bolum × 1,2; KAPAK ayni rakam)
 *  SE4 kosullu bicim, veri dogrulama, birlesik hucre, baski alani ve tanimli ad kayar
 *  SE5 tek bolum: ekleme yok, formuller aynen
 *  SE6 paylasimli formul iki kez KAYMAZ
 *  SE7 iki kez ekleme: kural bileskesi tutarli
 *  SE9 (inceleme H1) sablon satirinin KENDI goreli araligi genislemez (SUM(C5:D5),
 *      birikimli SUM(E$5:E5)); mutlak pay blogu kapsar — formul + DEGER
 *  SE10 (H2) paylasimli formul: ilgisiz grup DOKUNULMAZ (tirnak ici "m2" bozulmaz);
 *      hedef sayfadaki grup bizim tirnak bilen cevirimizle acilir
 *  SE11 (M1) dizi formulu shareType + ref ile kayar
 *  SE12/13 (M2, LOW) XFD otesi ad, 3B, yapilandirilmis dokunulmaz; kesisim kayar
 *  SE14 sablon satirindaki kosullu bicim blogu kapsar; dogrulama kopyalara gecer
 *  SE8 formulsuz format (ornek format): yeniden yazilan 0, cikti BAYT BAYT ayni;
 *      SE8b etkilenmeyen formul (ustte / baska sayfada) yeniden yazilmaz
 */
import * as ExcelJS from 'exceljs';
import { gercek } from './cikti-test-yardimci';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
import { buildExportWorkbook } from '../src/ozellik/teklif/quotes/export-engine';
import { buildSampleFormat, scanWorkbook } from '../src/ozellik/cikti/quote-formats/format-engine';
import { formulSatirEkle, formulSatirKopyala, satirEkle, satirEklemesiniYansit } from '../src/ozellik/cikti/quote-formats/satir-ekleme';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const esit = (name: string, gercekDeger: unknown, beklenen: unknown) =>
  check(name, gercekDeger === beklenen, `beklenen ${JSON.stringify(beklenen)}, gelen ${JSON.stringify(gercekDeger)}`);

const roles = {
  noField: 'col0', nameField: 'col1', unitField: 'col2', quantityField: 'col3',
  materialUnitPriceField: 'col4', materialTotalField: 'col5',
  laborUnitPriceField: 'col6', laborTotalField: 'col7',
};
const sayfa = (name: string, index: number, mat: number) => ({
  name, index, isEmpty: false, columnRoles: roles, columnDefs: [],
  rowData: [
    { _rowIdx: 0, _isHeaderRow: true, _isDataRow: false },
    { _rowIdx: 1, _isDataRow: true, col0: '1', col1: `${name} boru`, col2: 'mt', col3: 10, col4: String(mat / 10), col5: String(mat), col6: '1', col7: '10' },
  ],
});
const ctxTemel = {
  teklifNo: 'MP-2026-001', rev: 1, tarih: '06.10.2026', musteri: 'ACME', proje: 'P', hazirlayan: 'E',
  gecerlilik: '30', kurNotu: 'kur', kdvOran: 0.2,
};

/** Musterinin formati: İCMAL sablon satiri B5; ALTINDA kendi formulleri. */
function musteriFormati(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const kapak = wb.addWorksheet('KAPAK');
  kapak.getCell('B2').value = '{{MUSTERI}}';
  kapak.getCell('C10').value = { formula: "'İCMAL'!E8", result: 0 } as any;
  const ic = wb.addWorksheet('İCMAL');
  ['', 'Bölüm', 'Malzeme', 'İşçilik', 'Toplam'].forEach((h, i) => { if (h) ic.getCell(4, i + 1).value = h; });
  ic.getCell('B5').value = '{{ICMAL_SATIRLARI}}';
  ic.getCell('F5').value = { formula: 'C5*1.1', result: 0 } as any; // sablonun kendi formulu
  ic.getCell('G5').value = { formula: 'E5/$E$8', result: 0 } as any; // GENEL TOPLAM payi
  ic.getCell('B6').value = 'ARA TOPLAM';
  ic.getCell('E6').value = { formula: 'SUM(E5:E5)', result: 0 } as any;
  ic.getCell('B7').value = 'KDV %20';
  ic.getCell('E7').value = { formula: 'E6*0.2', result: 0 } as any;
  ic.getCell('B8').value = 'GENEL TOPLAM';
  ic.getCell('E8').value = { formula: 'E6+E7', result: 0 } as any;
  ic.getCell('F8').value = { formula: '$E$6+$E$7', result: 0 } as any;
  ic.getCell('C3').value = { formula: 'E8', result: 0 } as any; // ustten alta
  ic.mergeCells('B10:E10');
  ic.getCell('B10').value = 'Notlar';
  ic.addConditionalFormatting({ ref: 'E8', rules: [{ type: 'expression', formulae: ['$E$8>0'], priority: 1, style: { font: { bold: true } } } as any] });
  ic.getCell('B13').dataValidation = { type: 'list', allowBlank: true, formulae: ['"A,B"'] } as any;
  ic.pageSetup.printArea = 'A1:G10';
  // SE9: sablon satirinin kendi araliklari
  ic.getCell('H5').value = { formula: 'SUM(C5:D5)', result: 0 } as any;       // satir ici yatay
  ic.getCell('I5').value = { formula: 'SUM(E$5:E5)', result: 0 } as any;      // birikimli
  ic.getCell('J5').value = { formula: 'E5/SUM($E$5:$E$5)', result: 0 } as any; // blogdaki pay
  // SE10: ilgisiz paylasimli grup (KAPAK, tirnak ici metin) + hedefte grup
  kapak.getCell('D2').value = 'm2'; kapak.getCell('E2').value = 7;
  kapak.getCell('D3').value = 'm2'; kapak.getCell('E3').value = 8;
  kapak.getCell('F2').value = { formula: 'IF(D2="m2",E2,0)', result: 7, shareType: 'shared', ref: 'F2:F3' } as any;
  kapak.getCell('F3').value = { sharedFormula: 'F2', result: 8 } as any;
  ic.getCell('K8').value = { formula: 'IF(E8>0,"E8",0)', result: 0, shareType: 'shared', ref: 'K8:K9' } as any;
  ic.getCell('K9').value = { sharedFormula: 'K8', result: 0 } as any;
  ic.getCell('O8').value = { formula: 'E8*2', result: 0, shareType: 'shared', ref: 'O8:P8' } as any; // YATAY grup
  ic.getCell('P8').value = { sharedFormula: 'O8', result: 0 } as any;
  // SE11: dizi formulu
  ic.getCell('L8').value = { formula: 'SUM(E5:E5*C5:C5)', result: 0, shareType: 'array', ref: 'L8' } as any;
  // SE14: sablon satirinda kosullu bicim + dogrulama; sablonu kapsayan dogrulama
  ic.addConditionalFormatting({ ref: 'H5', rules: [{ type: 'expression', formulae: ['$H5>0'], priority: 2, style: { font: { italic: true } } } as any] });
  ic.getCell('M5').dataValidation = { type: 'list', allowBlank: true, formulae: ['"X,Y"'] } as any;
  for (let r = 4; r <= 9; r++) ic.getCell(`N${r}`).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [0, 9] } as any;
  wb.definedNames.add("'İCMAL'!$E$8", 'genelToplamHucresi'); // tanimli ad (sayfa adli)
  wb.definedNames.add("'İCMAL'!$B$5:$E$5", 'icmalBolgesi'); // sablon satiri — blogu kapsamali
  return wb;
}

async function uret(formatHam: ExcelJS.Workbook, bolumler: number): Promise<ExcelJS.Workbook> {
  // Uretimde format dosyadan (QuoteFormat.fileBytes) YUKLENIR — ayni yol
  const formatWb = new ExcelJS.Workbook();
  await formatWb.xlsx.load(Buffer.from(await formatHam.xlsx.writeBuffer()) as any);
  const sheetsArr = [sayfa('Mekanik', 0, 1000), sayfa('Elektrik', 1, 2000), sayfa('Yangin', 2, 3000)].slice(0, bolumler);
  const sonuc = await buildExportWorkbook({ sheetsArr, formatWb, ctxTemel, overrides: null } as any);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(Buffer.from(await sonuc.wb.xlsx.writeBuffer()) as any);
  return out;
}

const formul = (wb: ExcelJS.Workbook, s: string, adr: string): string => {
  const v: any = wb.getWorksheet(s)!.getCell(adr).value;
  return v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : `(formul yok: ${JSON.stringify(v)})`;
};

async function run() {
  // ══ SE1: saf kural — ekleme (T=5, k=2, formul İCMAL'de) ═══════════════
  {
    const e = (f: string, sayfaAdi = 'İCMAL') => formulSatirEkle(f, sayfaAdi, 'İCMAL', 5, 2);
    esit('SE1 sablonun alti +k', e('E8'), 'E10');
    esit('SE1 sablonun ustu aynen', e('E4'), 'E4');
    esit('SE1 sablonun kendisi (tek hucre) aynen — ilk bolum satiri', e('E5'), 'E5');
    esit('SE1 ★ sablonun tek satirlik araligi BLOGU kapsar', e('SUM(E5:E5)'), 'SUM(E5:E7)');
    esit('SE1 sablonda biten aralik blogu kapsar', e('SUM(E2:E5)'), 'SUM(E2:E7)');
    esit('SE1 alttaki aralik kayar', e('SUM(E6:E9)'), 'SUM(E8:E11)');
    esit('SE1 ustteki aralik aynen', e('SUM(E2:E4)'), 'SUM(E2:E4)');
    esit('SE1 ters yazilmis aralik', e('SUM(E9:E6)'), 'SUM(E11:E8)');
    esit('SE1 mutlak ($) da kayar, isaretler korunur', e('$E$8+E$6+$E7'), '$E$10+E$8+$E9');
    esit('SE1 baska sayfaya basvuru dokunulmaz', e("'Mekanik'!E8+E8"), "'Mekanik'!E8+E10");
    esit('SE1 KAPAK formulunde tirnakli sayfa adi', e("'İCMAL'!E8", 'KAPAK'), "'İCMAL'!E10");
    esit('SE1 KAPAK formulunde yalin sayfa adi', e('İCMAL!E8', 'KAPAK'), 'İCMAL!E10');
    esit('SE1 KAPAK formulunde yalin basvuru KAPAK\'a bakar — dokunulmaz', e('E8', 'KAPAK'), 'E8');
    esit('SE1 sayfa adi buyuk-kucuk harf duyarsiz (tr)', e("'icmal'!E8", 'KAPAK'), "'icmal'!E10");
    esit('SE1 tirnak ici metin dokunulmaz', e('IF(E8>0,"E8 tutar","")'), 'IF(E10>0,"E8 tutar","")');
    esit('SE1 islev adlari (LOG10, ATAN2) dokunulmaz', e('LOG10(E8)+ATAN2(E8,1)'), 'LOG10(E10)+ATAN2(E10,1)');
    esit('SE1 yalniz-sutun araligi dokunulmaz', e('SUM(E:E)'), 'SUM(E:E)');
    esit('SE1 dis kitap basvurusu dokunulmaz', e('[1]İCMAL!E8'), '[1]İCMAL!E8');
    esit("SE1 kesme isaretli sayfa adi ('')", formulSatirEkle("'Ali''nin'!B9", 'KAPAK', "Ali'nin", 5, 2), "'Ali''nin'!B11");
    esit('SE1 k=0 kimlik', formulSatirEkle('SUM(E5:E9)', 'İCMAL', 'İCMAL', 5, 0), 'SUM(E5:E9)');
    const s = (f: string) => formulSatirEkle(f, 'İCMAL', 'İCMAL', 5, 2, true); // formul sablon satirinda
    esit('SE9 sablonda goreli alt uc genislemez', s('SUM(C5:D5)'), 'SUM(C5:D5)');
    esit('SE9 sablonda birikimli aralik genislemez', s('SUM(E$5:E5)'), 'SUM(E$5:E5)');
    esit('SE9 sablonda MUTLAK alt uc blogu kapsar', s('E5/SUM($E$5:$E$5)'), 'E5/SUM($E$5:$E$7)');
    esit('SE9 sablonda alttaki basvuru yine kayar', s('E5/$E$8'), 'E5/$E$10');
    esit('SE12 XFD otesi "sutun" tanimli addir — dokunulmaz', e('E8*YIL2026'), 'E10*YIL2026');
    esit('SE12 XFD (son sutun) gecerli basvuru — kayar', e('XFD8'), 'XFD10');
    esit('SE13 tirnaksiz 3B basvuru dokunulmaz', e('SUM(KAPAK:İCMAL!E8)'), 'SUM(KAPAK:İCMAL!E8)');
    esit('SE13 tirnakli 3B basvuru dokunulmaz', e("SUM('KAPAK:İCMAL'!E8)"), "SUM('KAPAK:İCMAL'!E8)");
    esit('SE13 yapilandirilmis basvuru dokunulmaz', e('Tablo1[[#This Row],[E8]]'), 'Tablo1[[#This Row],[E8]]');
    esit('SE13 kesisim (bosluk) operatoru sonrasi kayar', e('SUM(E8:E9 E8)'), 'SUM(E10:E11 E10)');
  }

  // ══ SE2: saf kural — sablon kopyasi ═════════════════════════════════
  {
    esit('SE2 goreli satir +i', formulSatirKopyala('C5*1.1', 1), 'C6*1.1');
    esit('SE2 mutlak satir sabit', formulSatirKopyala('E5/$E$10', 2), 'E7/$E$10');
    esit('SE2 karma ($ yalniz sutunda / satirda)', formulSatirKopyala('E$5+$E6', 1), 'E$5+$E7');
    esit('SE2 baska sayfa goreli basvurusu da kayar (Excel kopyasi)', formulSatirKopyala("'Mekanik'!F5", 1), "'Mekanik'!F6");
    esit('SE2 tirnak ici metin dokunulmaz', formulSatirKopyala('C5&"C5"', 1), 'C6&"C5"');
  }

  // ══ SE3: GERCEK motor, 3 bolum (2 satir eklenir) ═════════════════════
  const out = await uret(musteriFormati(), 3);
  {
    esit('SE3 ★★ ARA TOPLAM blogu toplar', formul(out, 'İCMAL', 'E8'), 'SUM(E5:E7)');
    esit('SE3 ★ KDV ARA TOPLAM\'a bakar', formul(out, 'İCMAL', 'E9'), 'E8*0.2');
    esit('SE3 ★ GENEL TOPLAM', formul(out, 'İCMAL', 'E10'), 'E8+E9');
    esit('SE3 mutlak basvurulu formul', formul(out, 'İCMAL', 'F10'), '$E$8+$E$9');
    esit('SE3 ustten alta basvuru', formul(out, 'İCMAL', 'C3'), 'E10');
    esit('SE3 ★ KAPAK\'tan basvuru', formul(out, 'KAPAK', 'C10'), "'İCMAL'!E10");
    esit('SE3 sablon satirinin kendi formulu (ilk bolum)', formul(out, 'İCMAL', 'F5'), 'C5*1.1');
    esit('SE3 ★ sablon kopyasi kendi satirina bakar', formul(out, 'İCMAL', 'F7'), 'C7*1.1');
    esit('SE3 sablon kopyasinda mutlak pay', formul(out, 'İCMAL', 'G6'), 'E6/$E$10');
    // DEGER (Excel'in hesaplayacagi): bolumler 1010 + 2010 + 3010 = 6030; KDV 1206
    esit('SE3 ★★ GENEL TOPLAM DEGERI = Σ bolum × 1,2', gercek(out, 'İCMAL', 'E10').v, 7236);
    esit('SE3 ★★ KAPAK DEGERI ayni rakam', gercek(out, 'KAPAK', 'C10').v, 7236);
    esit('SE3 KDV DEGERI', gercek(out, 'İCMAL', 'E9').v, 1206);
  }

  // ══ SE9: sablon satirinin kendi araliklari (inceleme H1) ══════════════
  {
    esit('SE9 ★ sablon satirinda yatay toplam kendi satirinda', formul(out, 'İCMAL', 'H5'), 'SUM(C5:D5)');
    esit('SE9 ★ kopyada yatay toplam kendi satirinda', formul(out, 'İCMAL', 'H6'), 'SUM(C6:D6)');
    esit('SE9 birikimli toplam kopyada buyur', formul(out, 'İCMAL', 'I7'), 'SUM(E$5:E7)');
    esit('SE9 pay blogu kapsar', formul(out, 'İCMAL', 'J6'), 'E6/SUM($E$5:$E$7)');
    esit('SE9 ★★ DEGER: Elektrik satiri yalniz kendi tutari (cift sayim yok)', gercek(out, 'İCMAL', 'H6').v, 2010);
    esit('SE9 DEGER: birikimli son satir = Σ bolum', gercek(out, 'İCMAL', 'I7').v, 6030);
  }

  // ══ SE10: paylasimli formul (inceleme H2) ════════════════════════════
  {
    const kp = out.getWorksheet('KAPAK')!;
    const f3: any = kp.getCell('F3').value;
    check('SE10 ★ ilgisiz paylasimli grup DOKUNULMAZ (Excel cevirir)', f3?.sharedFormula === 'F2', JSON.stringify(f3));
    esit('SE10 ilgisiz grubun anasi aynen (tirnak ici metin)', formul(out, 'KAPAK', 'F2'), 'IF(D2="m2",E2,0)');
    esit('SE10 ★ hedefteki grup acilir: ana kayar, metin bozulmaz', formul(out, 'İCMAL', 'K10'), 'IF(E10>0,"E8",0)');
    esit('SE10 ★ hedefteki grubun bagimlisi BIR kez kayar, metin bozulmaz', formul(out, 'İCMAL', 'K11'), 'IF(E11>0,"E8",0)');
    esit('SE10 yatay paylasimli grup sutun ofsetiyle acilir', formul(out, 'İCMAL', 'P10'), 'F10*2');
  }

  // ══ SE11: dizi formulu (inceleme M1) ═════════════════════════════════
  {
    const v: any = out.getWorksheet('İCMAL')!.getCell('L10').value;
    esit('SE11 dizi formulu blogu kapsar', v?.formula, 'SUM(E5:E7*C5:C7)');
    esit('SE11 ★ dizi formulu dizi KALIR', v?.shareType, 'array');
    esit('SE11 ★ dizi formulunun ref\'i hucresiyle kayar', v?.ref, 'L10');
  }

  // ══ SE4: kosullu bicim, dogrulama, birlesik hucre, baski alani ═══════
  {
    const ic = out.getWorksheet('İCMAL')!;
    const kb = ((ic as any).conditionalFormattings ?? []) as Array<{ ref: string; rules: any[] }>;
    esit('SE4 kosullu bicim araligi kayar', kb.map((k) => k.ref).filter((r) => r.startsWith('E')).join(' '), 'E10');
    esit('SE14 ★ sablon satirindaki kosullu bicim blogu kapsar', kb.map((k) => k.ref).filter((r) => r.startsWith('H')).join(' '), 'H5:H7');
    check('SE14 ★ sablon satirindaki dogrulama kopyalara gecer (M5:M7)',
      ['M5', 'M6', 'M7'].every((a) => (ic.getCell(a).dataValidation as any)?.type === 'list'),
      ['M5', 'M6', 'M7'].map((a) => JSON.stringify(ic.getCell(a).dataValidation)).join(' '));
    const nBos = [];
    for (let r = 4; r <= 11; r++) if ((ic.getCell(`N${r}`).dataValidation as any)?.type !== 'whole') nBos.push(r);
    check('SE14 ★ sablonu kapsayan dogrulama bosluksuz (N4:N11)', nBos.length === 0, `dogrulamasiz satirlar: ${nBos.join(',')}`);
    esit('SE4 kosullu bicim formulu kayar', String(kb[0]?.rules?.[0]?.formulae?.[0]), '$E$10>0');
    check('SE4 veri dogrulama kayar (B13 → B15)',
      !ic.getCell('B13').dataValidation && (ic.getCell('B15').dataValidation as any)?.type === 'list',
      `B13=${JSON.stringify(ic.getCell('B13').dataValidation)} B15=${JSON.stringify(ic.getCell('B15').dataValidation)}`);
    esit('SE4 birlesik hucre kayar (ExcelJS)', JSON.stringify((ic.model as any).merges), JSON.stringify(['B12:E12']));
    esit('SE4 baski alani blogu kapsar', String(ic.pageSetup.printArea), 'A1:G12');
    const ad = ((out as any).definedNames.model as Array<{ name: string; ranges: string[] }>).find((x) => x.name === 'genelToplamHucresi');
    esit('SE4 tanimli ad kayar', JSON.stringify(ad?.ranges), JSON.stringify(["'İCMAL'!$E$10"]));
    const blok = ((out as any).definedNames.model as Array<{ name: string; ranges: string[] }>).find((x) => x.name === 'icmalBolgesi');
    // ExcelJS tek basina bunu GENISLETMEZ (yalniz alttakileri kaydirir) — kural bizim
    esit('SE4 ★ sablonu kapsayan tanimli ad blogu kapsar', JSON.stringify(blok?.ranges), JSON.stringify(["'İCMAL'!$B$5:$E$7"]));
  }

  // ══ SE5: tek bolum — ekleme yok ═══════════════════════════════════════
  {
    const tek = await uret(musteriFormati(), 1);
    esit('SE5 tek bolumde ARA TOPLAM aynen', formul(tek, 'İCMAL', 'E6'), 'SUM(E5:E5)');
    esit('SE5 tek bolumde KAPAK aynen', formul(tek, 'KAPAK', 'C10'), "'İCMAL'!E8");
    esit('SE5 tek bolumde GENEL TOPLAM DEGERI', gercek(tek, 'İCMAL', 'E8').v, 1212);
  }

  // ══ SE6: paylasimli formul iki kez kaymaz ════════════════════════════
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('İCMAL');
    ws.getCell('B5').value = 'sablon';
    ws.getCell('E8').value = 1; ws.getCell('E9').value = 2;
    ws.getCell('F8').value = { formula: 'E8*2', result: 2, shareType: 'shared', ref: 'F8:F9' } as any;
    ws.getCell('F9').value = { sharedFormula: 'F8', result: 4 } as any;
    // diskten geri oku: paylasimli formul ExcelJS'in okudugu bicimde olsun
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(Buffer.from(await wb.xlsx.writeBuffer()) as any);
    const ws2 = wb2.getWorksheet('İCMAL')!;
    satirEkle(wb2, ws2, 5, 2); // motorun yolu: once paylasimli formuller acilir
    esit('SE6 paylasimli ana formul kayar', formul(wb2, 'İCMAL', 'F10'), 'E10*2');
    esit('SE6 ★ paylasimli bagimli formul BIR kez kayar', formul(wb2, 'İCMAL', 'F11'), 'E11*2');
  }

  // ══ SE7: art arda iki ekleme = tek ekleme (kural bileskesi) ══════════
  {
    const a = formulSatirEkle(formulSatirEkle('SUM(E5:E5)+E9', 'S', 'S', 5, 1), 'S', 'S', 5, 2);
    const b = formulSatirEkle('SUM(E5:E5)+E9', 'S', 'S', 5, 3);
    esit('SE7 iki ekleme (1 + 2) = tek ekleme (3)', a, b);
  }

  // ══ SE8: formulsuz format — dokunulmaz, bayt bayt ayni ═══════════════
  {
    const hazirla = () => {
      const wb = buildSampleFormat();
      const yer = scanWorkbook(wb).bulunan.find((b) => b.etiket === 'ICMAL_SATIRLARI')!;
      const ws = wb.getWorksheet(yer.sheet)!;
      const T = Number((ws.getCell(yer.addr) as any).row);
      ws.duplicateRow(T, 2, true);
      return { wb, ws, T };
    };
    const yalin = hazirla();
    const islenen = hazirla();
    const yazilan = satirEklemesiniYansit(islenen.wb, islenen.ws, islenen.T, 2);
    esit('SE8 ornek formatta yeniden yazilan formul 0', yazilan, 0);
    const [b1, b2] = await Promise.all([yalin.wb.xlsx.writeBuffer(), islenen.wb.xlsx.writeBuffer()]);
    // ZIP icindeki zaman damgasi farkini disla: icerik dosyalarini karsilastir
    const icerik = async (b: ArrayBuffer | Buffer) => {
      const w = new ExcelJS.Workbook(); await w.xlsx.load(b as any);
      return JSON.stringify(w.worksheets.map((s) => s.model));
    };
    check('SE8 ★ formulsuz formatin ciktisi AYNI', (await icerik(b1)) === (await icerik(b2)));
  }

  // ══ SE8c: sablonun USTUNDEKI formul, paylasimli grup, bicim, dogrulama,
  //    baski alani ve tanimli ad — satirEkle ciktisi yalin duplicateRow'la AYNI ═
  {
    const kur = async () => {
      const wb = new ExcelJS.Workbook();
      const ic = wb.addWorksheet('İCMAL');
      ic.getCell('A1').value = 1; ic.getCell('A2').value = 2;
      ic.getCell('B1').value = { formula: 'A1*2', result: 2, shareType: 'shared', ref: 'B1:B2' } as any;
      ic.getCell('B2').value = { sharedFormula: 'B1', result: 4 } as any;
      ic.getCell('C3').value = { formula: 'SUM(A1:A2)', result: 3 } as any;
      ic.addConditionalFormatting({ ref: 'A1:A3', rules: [{ type: 'expression', formulae: ['$A1>1'], priority: 1, style: { font: { bold: true } } } as any] });
      ic.getCell('D2').dataValidation = { type: 'list', allowBlank: true, formulae: ['"A,B"'] } as any;
      ic.pageSetup.printArea = 'A1:D3';
      wb.definedNames.add("'İCMAL'!$A$1:$A$2", 'ustAlan');
      ic.getCell('B5').value = 'sablon';
      const w = new ExcelJS.Workbook();
      await w.xlsx.load(Buffer.from(await wb.xlsx.writeBuffer()) as any);
      return w;
    };
    const yalin = await kur(); yalin.getWorksheet('İCMAL')!.duplicateRow(5, 2, true);
    const islenen = await kur(); satirEkle(islenen, islenen.getWorksheet('İCMAL')!, 5, 2);
    const model = (w: ExcelJS.Workbook) => JSON.stringify({ s: w.worksheets.map((x) => x.model), d: (w as any).definedNames.model });
    check('SE8c ★ sablonun ustundeki her sey dokunulmaz (yalin duplicateRow ile ayni)', model(yalin) === model(islenen));
  }

  // ══ SE8b: etkilenmeyen formul YENIDEN YAZILMAZ (ustte / baska sayfada) ═
  {
    const wb = new ExcelJS.Workbook();
    const kapak = wb.addWorksheet('KAPAK');
    kapak.getCell('A1').value = 5;
    kapak.getCell('B1').value = { formula: 'A1*2', result: 10 } as any; // kendi sayfasina
    const ic = wb.addWorksheet('İCMAL');
    ic.getCell('B2').value = 3;
    ic.getCell('C2').value = { formula: 'B2*2', result: 6 } as any;     // sablonun USTU
    ic.getCell('C3').value = { formula: "'KAPAK'!B1+1", result: 11 } as any; // baska sayfaya
    ic.getCell('B5').value = 'sablon';
    ic.duplicateRow(5, 2, true);
    esit('SE8b ★ etkilenmeyen formul yeniden yazilmaz', satirEklemesiniYansit(wb, ic, 5, 2), 0);
  }
}

async function ana() {
  await run();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MUSTERI FORMATI SATIR EKLEME: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

bitmezseKirmizi(ana().catch((e) => { console.error(e); process.exit(1); }));
