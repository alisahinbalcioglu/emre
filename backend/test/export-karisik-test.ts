/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TEKLIF FORMATI — KARISIK PARA BIRIMI  (`npm run test:export-karisik`) — İCMAL
 *  (05.10; Emre'nin onerilen onayi koordinator uzerinden: "karma metin yalniz
 *  musteri formatindaki tek hucre yer tutucularinda, kendi formatimizda para
 *  birimi basina satir").
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *   EK1 İCMAL satirlari sayfa × birim (₺, $, € sabit sirada), ad "Sayfa ₺";
 *       malzeme/iscilik liste sayfasinin gizli J/K birim sutunlarina SUMIF;
 *       hucre bicimi satirin birimi. Kalemsiz sayfa tek "0" ₺ satiri.
 *   EK2 YERLESIK format: toplam blogu birim BASINA ("Malzeme Toplamı ₺" …
 *       "GENEL TOPLAM $"), birim ekli yer tutucularla; her birim YALNIZ kendi
 *       İCMAL satirlarini toplar (dolar lira toplamina girmez).
 *   EK3 MUSTERI formati: satir EKLENMEZ (yalniz İCMAL satirlari kadar kayma);
 *       eksiz etiket TEKLIF GENELINDE: birden cok birimde tutar varsa DORT para
 *       etiketinin hepsi KARMA METIN (etiket basina karar musterinin `=F12+F13`
 *       formulunde $ ile ₺'yi toplatirdi — inceleme M1); tek birimde sayi/formul,
 *       ₺ ise tek birimli yolun aynisi (musterinin bicimi, simgesiz metin).
 *       Musteri formulu birimli para hucresine basvuruyorsa UYARI (servise kadar).
 *       Format dosyadan YUKLENIR (uretim yolu: ExcelJS ayni stil kimligini paylastirir).
 *   EK4 Birim ekli etiket ({{GENEL_TOPLAM_USD}}) musteri formatinda da: o birim;
 *       teklifte o birim yoksa 0 (o birimin bicimiyle).
 *   EK5 CEVRIM YOK: goruntuleme birimi yok sayilir; kur notu "çevrim yapılmaz".
 *       Eski kayitli override'lar karisik duzende UYGULANMAZ (adresler kayar).
 *   EK6 Tum formul onbellekleri = yeniden hesap (Excel'in gorecegi rakam).
 *   EK7 Servis: karisik teklif format yolunda INER (F5'in gecici 400 reddi
 *       kalkti), numara alir, ozet birim basina.
 *   EK9 F6a (karar K1): yalniz-₺ karisik teklif (₺ birim alanlari) TL teklifle
 *       format yolunda BAYT BAYT ayni — karisik duzen yalniz $/€ taraf varken.
 *   EK0 KONTROL: yalniz-TL teklif eski duzende (simgesiz ad, eksiz toplamlar);
 *       birim ekli etiket tek birimli teklifte: teklifin birimi tum toplam,
 *       digerleri 0.
 *  Yalniz-TL ciktinin HEAD motoruyla BAYT BAYT esitligi bir kez olculdu
 *  (10 senaryo, commit mesaji) — kapida degil (HEAD kayar).
 *  DB GEREKMEZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as ExcelJS from 'exceljs';
import { buildExportWorkbook } from '../src/ozellik/teklif/quotes/export-engine';
import { buildSampleFormat, scanWorkbook, hucreMetni } from '../src/ozellik/cikti/quote-formats/format-engine';
import { paraBicimi } from '../src/ozellik/teklif/quotes/cikti-stil';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { formulDenetimi } from './cikti-test-yardimci';
const JSZip = require('jszip');
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};
const js = (x: unknown) => JSON.stringify(x);

const TARIH = new Date('2026-10-05T10:00:00Z');
const TRY = paraBicimi('TRY'); const USD = paraBicimi('USD'); const EUR = paraBicimi('EUR');

const ROLLER = {
  noField: '_no', nameField: '_ad', quantityField: '_miktar', unitField: '_birim',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};
const kalem = (no: string, ad: string, miktar: number, birim: string, m: [string, string], l: [string, string], pb: Record<string, string> = {}, ek: any = {}) => ({
  _isDataRow: true, _no: no, _ad: ad, _miktar: miktar, _birim: birim,
  _matBirim: m[0], _matToplam: m[1], _labBirim: l[0], _labToplam: l[1], ...pb, ...ek,
});

/** Onayli F5 prototipinin rakamlari (₺ 180.180 / 29.274 · $ 2.924,25 / 7,88). */
const MEKANIK = {
  name: 'Mekanik', isEmpty: false, columnRoles: ROLLER,
  rowData: [
    { _isHeaderRow: true, _ad: 'CİNSİ' },
    kalem('2', 'Kelebek Vana DN65', 10, 'ad', ['10.5', '105'], ['0.75', '7.5'], { _matPB: 'USD', _labPB: 'USD' }),
    kalem('1', 'Siyah Çelik Boru 6"', 286, 'mt', ['600', '171600'], ['60', '17160'], { _matPB: 'TRY', _labPB: 'TRY' }),
    kalem('3', 'Küresel Vana 4"', 268, 'ad', ['10', '2680'], ['40', '10720'], { _matPB: 'USD', _labPB: 'TRY' }),
    // ARA TOPLAM: gorunur, SUMIF'e GIRMEZ (birim hucresi bos)
    kalem('', 'ARA TOPLAM', 0, '', ['', '174385'], ['', '27887.5'], {}, { _ozet: true, _miktar: '' }),
    kalem('4', 'Fitting bedeli', 5, '%', ['', ''], ['', ''], {}, {
      _fitting: { kapsam: [1, 2, 3] },
      _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 8580 }, { pb: 'USD', toplam: 139.25 }], lab: [{ pb: 'TRY', toplam: 1394 }, { pb: 'USD', toplam: 0.38 }] },
    }),
    kalem('5', 'Manometre', 2, 'ad', ['', ''], ['', '']),
  ],
};
const ELEKTRIK = {
  name: 'Elektrik', isEmpty: false, columnRoles: ROLLER,
  rowData: [
    kalem('1', 'Kablo NYM 3x2,5', 100, 'mt', ['25', '2500'], ['5', '500'], { _matPB: 'TRY', _labPB: 'TRY' }),
    kalem('2', 'Fitting %5', 5, '%', ['', ''], ['', ''], {}, { _fitting: { kapsam: [0] }, _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 125 }], lab: [] } }),
  ],
};
/** Tek ₺ tutarli ama DOVIZLI taraf tasiyan (fiyatsiz $ satir) karisik teklif — karisik
 *  duzen + tek dolu birim ₺ kurallarini olcer (F6a'dan beri yalniz-₺ teklif TL yolunu alir). */
const ELEKTRIK_BOS_DOLAR = {
  ...ELEKTRIK,
  rowData: [...ELEKTRIK.rowData, kalem('3', 'Boş Dolar', 1, 'ad', ['', ''], ['', ''], { _matPB: 'USD', _labPB: 'TRY' })],
};
const ESASLAR = { name: 'Esaslar', isEmpty: false, columnRoles: ROLLER, rowData: [{ _ad: 'TEKLİF ESASLARI' }, { _ad: 'Fiyatlar 30 gün geçerlidir.' }] };
const DOVIZ = {
  name: 'Döviz', isEmpty: false, columnRoles: ROLLER,
  rowData: [
    kalem('1', 'Çekvalf', 3, 'ad', ['10.551', '31.66'], ['', ''], { _matPB: 'USD' }),
    kalem('2', 'Montaj', 2, 'ad', ['', ''], ['12.5', '25'], { _labPB: 'EUR' }),
    kalem('3', 'Boş Karma', 1, 'ad', ['', ''], ['', ''], { _matPB: 'USD', _labPB: 'TRY' }),
  ],
};
const TL_SAYFA = {
  name: 'Mekanik', isEmpty: false, columnRoles: ROLLER,
  rowData: [kalem('1', 'Siyah Çelik Boru 6"', 286, 'mt', ['600', '171600'], ['60', '17160'])],
};

const CTX = {
  teklifNo: 'MP-2026-001', rev: 1, tarih: '05.10.2026', musteri: 'Müşteri A.Ş.', proje: 'Proje', hazirlayan: 'Emre',
  gecerlilik: '30 gün', kurNotu: 'KUR NOTU', kdvOran: 0.2,
};

/** Musterinin kendi formati: farkli kolonda İCMAL, tek hucre ve metin ici etiketler, sabit isaret hucresi. */
function musteriFormati(o: { icmalli?: boolean; birimli?: boolean; formullu?: boolean } = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const kapak = wb.addWorksheet('Kapak');
  kapak.getCell('B3').value = 'Sayın {{MUSTERI}}';
  kapak.getCell('D9').value = 'Sabit metin';
  if (o.formullu) {
    // Musterinin KENDI formulleri: İCMAL tutar sutununu toplayan (birimli hucreler) + ilgisiz kontrol
    kapak.getCell('C10').value = { formula: "SUM('Icmal Sayfasi'!D5:D8)" } as any;
    kapak.getCell('C11').value = { formula: '1+2', result: 3 } as any;
  }
  const ic = wb.addWorksheet('Icmal Sayfasi');
  if (o.icmalli !== false) {
    ic.getCell('C5').value = '{{ICMAL_SATIRLARI}}';
    // Bicimli sablon satiri: ExcelJS cogaltmada stil nesnesini PAYLASTIRIR (EK1f tuzagi)
    for (const k of ['D5', 'E5', 'F5']) ic.getCell(k).numFmt = '#,##0.00 "TL"';
  }
  ic.getCell('C9').value = 'Ara toplam: {{MALZEME_TOPLAMI}}';
  ic.getCell('F10').value = '{{KDV}}';
  ic.getCell('F11').value = '{{GENEL_TOPLAM}}';
  ic.getCell('F11').numFmt = '#,##0.00 "TL"';
  ic.getCell('F12').value = '{{MALZEME_TOPLAMI}}';
  ic.getCell('F13').value = '{{ISCILIK_TOPLAMI}}';
  ic.getCell('C14').value = '{{KUR_NOTU}}';
  if (o.birimli) {
    ic.getCell('F16').value = '{{GENEL_TOPLAM_USD}}';
    ic.getCell('F17').value = '{{GENEL_TOPLAM_EUR}}';
    ic.getCell('C18').value = 'Dolar malzeme: {{MALZEME_TOPLAMI_USD}}';
    ic.getCell('F19').value = '{{GENEL_TOPLAM_TRY}}';
  }
  ic.getCell('H20').value = 'Son satır'; // satir eklenmedigini olcen isaret
  return wb;
}

const ac = async (buf: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
};

/** Format yolu: motor + dosyaya yaz + geri ac (dosyanin kendisi olculur). */
async function cikti(sheets: any[], format: 'yerlesik' | ExcelJS.Workbook, ek: { birim?: any; ctx?: any; overrides?: any } = {}) {
  const yerlesik = format === 'yerlesik';
  // Musteri formati URETIMDEKI gibi baytlardan YUKLENIR: ExcelJS okurken ayni stil
  // kimligindeki hucrelere TEK stil nesnesi verir (inceleme — bellekte kurulan sablon gizlerdi)
  const formatWb = yerlesik ? buildSampleFormat() : await ac(Buffer.from(await format.xlsx.writeBuffer()));
  const s = await buildExportWorkbook({
    originalFile: Buffer.alloc(0), sheetsArr: sheets, formatWb,
    ctxTemel: { ...CTX, ...(ek.ctx ?? {}) }, overrides: ek.overrides ?? null, birim: ek.birim ?? null, baslik: 'İCMAL testi', tarih: TARIH, yerlesik,
  });
  return { s, wb: await ac(Buffer.from(await s.wb.xlsx.writeBuffer())) };
}

/** Hucrenin dosyadaki sayisi: duz sayi ya da formul onbellegi (modelden — 0 dusmez). */
const sayi = (c: ExcelJS.Cell): number => {
  const v: any = c.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.formula === 'string') {
    const r = (c as any).model?.result;
    return typeof r === 'number' ? r : r === undefined ? 0 : NaN;
  }
  return NaN;
};
const formulu = (c: ExcelJS.Cell): string => { const v: any = c.value; return v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : ''; };
const yakin = (a: number, b: number) => Math.abs(a - b) < 0.005;
const satirBul = (ws: ExcelJS.Worksheet, metin: string, kolon = 2): number => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row, rn) => { if (!n && hucreMetni(row.getCell(kolon)).trim() === metin) n = rn; });
  return n;
};
const kolonMetinleri = (ws: ExcelJS.Worksheet, kolon: number, ilk: number, son: number): string[] => {
  const o: string[] = [];
  for (let r = ilk; r <= son; r++) o.push(hucreMetni(ws.getRow(r).getCell(kolon)));
  return o;
};
const denetim = (ad: string, wb: ExcelJS.Workbook) => {
  const d = formulDenetimi(wb);
  check(`${ad} — tum formul onbellekleri = yeniden hesap (EK6)`, d.sayi > 0 && d.sorun.length === 0, `${d.sayi} formul${d.sorun.length ? ' · ' + d.sorun.slice(0, 3).join(' ; ') : ''}`);
};
const kalanEtiket = (wb: ExcelJS.Workbook) => scanWorkbook(wb).bulunan.map((b) => `${b.sheet}!${b.addr}:${b.etiket}`);

// Beklenen birim toplamlari (A: Mekanik + Elektrik + Esaslar)
const T = { mat: 180180 + 2625, lab: 29274 + 500 };
const D = { mat: 2924.25, lab: 7.88 };

async function main() {
  // ══ A — YERLESIK format, karisik teklif ══════════════════════════════════
  const { s: sA, wb: wA } = await cikti([MEKANIK, ELEKTRIK, ESASLAR], 'yerlesik', { birim: { kod: 'USD', katsayi: 1 / 40, not: 'Fiyatlar USD' } });
  const ic = wA.getWorksheet('İCMAL')!;
  const ilk = satirBul(ic, 'Mekanik ₺');
  check('EK1a İCMAL satirlari sayfa × birim, sabit sira (₺ < $), kalemsiz sayfa tek ₺',
    ilk > 0 && js(kolonMetinleri(ic, 2, ilk, ilk + 3)) === js(['Mekanik ₺', 'Mekanik $', 'Elektrik ₺', 'Esaslar ₺']), js(kolonMetinleri(ic, 2, ilk, ilk + 4)));
  const mek = wA.getWorksheet('Mekanik')!;
  // Aralik katki veren ilk..son satir: son kalem fiyatsiz Manometre (fiyat yazilirsa toplar)
  const veriIlk = satirBul(mek, 'Kelebek Vana DN65'); const veriSon = satirBul(mek, 'Manometre');
  const cUsd = ic.getRow(ilk + 1).getCell(3);
  check('EK1b $ satiri malzemesi J sutununa SUMIF "USD" (katki veren satirlarin araligi)',
    formulu(cUsd) === `SUMIF('Mekanik'!J${veriIlk}:J${veriSon},"USD",'Mekanik'!F${veriIlk}:F${veriSon})`, formulu(cUsd));
  check('EK1c $ satiri iscilik K sutununa SUMIF', formulu(ic.getRow(ilk + 1).getCell(4)) === `SUMIF('Mekanik'!K${veriIlk}:K${veriSon},"USD",'Mekanik'!H${veriIlk}:H${veriSon})`,
    formulu(ic.getRow(ilk + 1).getCell(4)));
  const uclu = (r: number) => [3, 4, 5].map((c) => sayi(ic.getRow(r).getCell(c)));
  check('EK1d Mekanik ₺ 180.180 / 29.274 / 209.454 (fitting ₺ parcasi dahil, ARA TOPLAM haric)', js(uclu(ilk)) === js([180180, 29274, 209454]), js(uclu(ilk)));
  check('EK1e Mekanik $ 2.924,25 / 7,88 / 2.932,13', uclu(ilk + 1).every((v, i) => yakin(v, [2924.25, 7.88, 2932.13][i])), js(uclu(ilk + 1)));
  const bicimler = (r: number) => [3, 4, 5].map((c) => ic.getRow(r).getCell(c).numFmt);
  check('EK1f hucre bicimi satirin birimi ($ satiri USD, ₺ satiri TRY)', bicimler(ilk + 1).every((f) => f === USD) && bicimler(ilk).every((f) => f === TRY), js([bicimler(ilk), bicimler(ilk + 1)]));
  check('EK1g kalemsiz sayfa "0" formulu, ₺', formulu(ic.getRow(ilk + 3).getCell(3)) === '0' && sayi(ic.getRow(ilk + 3).getCell(5)) === 0, formulu(ic.getRow(ilk + 3).getCell(3)));

  const etiketler = ['Malzeme Toplamı', 'İşçilik Toplamı', 'KDV (%20)', 'GENEL TOPLAM'];
  const tl = etiketler.map((e) => satirBul(ic, `${e} ₺`)); const dl = etiketler.map((e) => satirBul(ic, `${e} $`));
  check('EK2a yerlesik toplam blogu birim basina: ₺ dort satir, bos satir, $ dort satir',
    tl.every((r, i) => r === tl[0] + i) && dl.every((r, i) => r === tl[0] + 5 + i) && !satirBul(ic, 'GENEL TOPLAM') && !satirBul(ic, 'GENEL TOPLAM €'), js({ tl, dl }));
  const deger = (r: number) => sayi(ic.getRow(r).getCell(5));
  check('EK2b ₺ blogu 182.805 / 29.774 / KDV 42.515,80 / GENEL 255.094,80',
    js(tl.map(deger).map((v) => Math.round(v * 100) / 100)) === js([182805, 29774, 42515.8, 255094.8]), js(tl.map(deger)));
  check('EK2c $ blogu 2.924,25 / 7,88 / KDV 586,43 / GENEL 3.518,56',
    dl.map(deger).every((v, i) => yakin(v, [2924.25, 7.88, 586.426, 3518.556][i])), js(dl.map(deger)));
  const icRef = (k: string, r: number) => `'İCMAL'!${k}${r}`;
  check('EK2d ₺ malzeme YALNIZ ₺ İCMAL satirlarini toplar (dolar satiri yok)',
    formulu(ic.getRow(tl[0]).getCell(5)) === `SUM(${icRef('C', ilk)},${icRef('C', ilk + 2)},${icRef('C', ilk + 3)})`, formulu(ic.getRow(tl[0]).getCell(5)));
  check('EK2e $ GENEL TOPLAM = ($ satirlari) × 1,2', formulu(ic.getRow(dl[3]).getCell(5)) === `(SUM(${icRef('C', ilk + 1)})+SUM(${icRef('D', ilk + 1)}))*1.2`, formulu(ic.getRow(dl[3]).getCell(5)));
  check('EK2f toplam hucre bicimleri kendi birimi', tl.every((r) => ic.getRow(r).getCell(5).numFmt === TRY) && dl.every((r) => ic.getRow(r).getCell(5).numFmt === USD),
    js([tl.map((r) => ic.getRow(r).getCell(5).numFmt), dl.map((r) => ic.getRow(r).getCell(5).numFmt)]));
  check('EK2g hic yer tutucu kalmadi (kur notu dahil)', kalanEtiket(wA).length === 0 && satirBul(ic, 'KUR NOTU') === dl[3] + 2, js({ kalan: kalanEtiket(wA), kur: satirBul(ic, 'KUR NOTU') }));
  check('EK5a goruntuleme birimi (USD) verilse de cevrim yok: ₺ satiri 180.180', uclu(ilk)[0] === 180180, String(uclu(ilk)[0]));
  check('EK5b liste sayfasi karisik duzende: gizli J/K, karma metin, SAYFA TOPLAMI yok (İCMAL topluyor)',
    mek.getColumn(10).hidden && mek.getColumn(11).hidden && hucreMetni(mek.getRow(satirBul(mek, 'Küresel Vana 4"')).getCell(9)) === '$2.680,00 + 10.720,00 ₺'
    && !satirBul(mek, 'SAYFA TOPLAMI ₺') && !satirBul(mek, 'SAYFA TOPLAMI'), hucreMetni(mek.getRow(satirBul(mek, 'Küresel Vana 4"')).getCell(9)));
  check('EK5c ARA TOPLAM satirinin birim hucreleri bos (SUMIF disi)', (() => {
    const r = satirBul(mek, 'ARA TOPLAM');
    return r > veriIlk && r < veriSon && mek.getRow(r).getCell(10).value == null && mek.getRow(r).getCell(11).value == null;
  })());
  const bg = sA.birimliGenelToplam ?? [];
  check('EK7a motor ozeti birim basina (₺, $ sirasi; KDV haric, fiyatli yolla ayni olcu)', bg.length === 2 && bg[0].pb === 'TRY' && yakin(bg[0].toplam, T.mat + T.lab)
    && bg[1].pb === 'USD' && yakin(bg[1].toplam, D.mat + D.lab), js(bg));
  check('EK7e karisikta tek birimli SUM formulu bos ($ + ₺ toplardi; yalniz birim parcalari)',
    sA.sekmeler.length === 3 && sA.sekmeler.every((x) => x.matFormul === null && x.labFormul === null && (x.birimler?.length ?? 0) > 0), js(sA.sekmeler.map((x) => x.matFormul)));
  denetim('A yerlesik', wA);

  // ══ B — MUSTERI formati, karisik teklif ══════════════════════════════════
  const { wb: wB } = await cikti([MEKANIK, ELEKTRIK, ESASLAR], musteriFormati({ birimli: true }));
  const mi = wB.getWorksheet('Icmal Sayfasi')!;
  const n = 4; const kayma = n - 1; // İCMAL satirlari kadar
  check('EK3a satir EKLENMEZ: yalniz İCMAL satirlari kadar kayma', satirBul(mi, 'Son satır', 8) === 20 + kayma && mi.rowCount === 20 + kayma,
    js({ isaret: satirBul(mi, 'Son satır', 8), rowCount: mi.rowCount }));
  check('EK3b İCMAL satirlari musterinin kolonunda (C ad, D/E/F tutar)', js(kolonMetinleri(mi, 3, 5, 8)) === js(['Mekanik ₺', 'Mekanik $', 'Elektrik ₺', 'Esaslar ₺'])
    && [4, 5, 6].every((k) => mi.getRow(6).getCell(k).numFmt === USD && mi.getRow(5).getCell(k).numFmt === TRY),
    js([kolonMetinleri(mi, 3, 5, 8), mi.getRow(5).getCell(4).numFmt, mi.getRow(6).getCell(4).numFmt]));
  const f = (adr: string) => mi.getCell(adr.replace(/\d+/, (x) => String(Number(x) + kayma)));
  check('EK3c eksiz GENEL_TOPLAM tek hucrede KARMA METIN (₺ + $, KDV dahil)', f('F11').value === '255.094,80 ₺ + $3.518,56', js(f('F11').value));
  check('EK3d eksiz KDV karma', f('F10').value === '42.515,80 ₺ + $586,43', js(f('F10').value));
  check('EK3e eksiz MALZEME/ISCILIK karma', f('F12').value === '182.805,00 ₺ + $2.924,25' && f('F13').value === '29.774,00 ₺ + $7,88', js([f('F12').value, f('F13').value]));
  check('EK3f metin ici etiket karma', f('C9').value === 'Ara toplam: 182.805,00 ₺ + $2.924,25', js(f('C9').value));
  check('EK3g yer tutucusuz hucreye dokunulmaz (T3)', wB.getWorksheet('Kapak')!.getCell('D9').value === 'Sabit metin' && wB.getWorksheet('Kapak')!.getCell('B3').value === 'Sayın Müşteri A.Ş.');
  check('EK4a {{GENEL_TOPLAM_USD}} = $ GENEL (formul, USD bicimi)', yakin(sayi(f('F16')), 3518.556) && f('F16').numFmt === USD && formulu(f('F16')).startsWith('(SUM('), js([f('F16').value, f('F16').numFmt]));
  check('EK4b teklifte olmayan birim (€) 0, kendi bicimiyle', sayi(f('F17')) === 0 && f('F17').numFmt === EUR, js([f('F17').value, f('F17').numFmt]));
  check('EK4c metin ici birimli etiket simgeli', f('C18').value === 'Dolar malzeme: $2.924,25', js(f('C18').value));
  check('EK4d {{GENEL_TOPLAM_TRY}} = ₺ GENEL, TRY bicimi', yakin(sayi(f('F19')), 255094.8) && f('F19').numFmt === TRY, js([f('F19').value, f('F19').numFmt]));
  denetim('B musteri', wB);

  // ══ C — tek birimde tutar: eksiz etiket SAYI kalir (canli formul) ══════════
  const { wb: wC } = await cikti([DOVIZ], musteriFormati());
  const ci = wC.getWorksheet('Icmal Sayfasi')!;
  const kC = 1; // Döviz $, Döviz €
  const fc = (adr: string) => ci.getCell(adr.replace(/\d+/, (x) => String(Number(x) + kC)));
  check('EK1h $ ve € satirlari ayri, sabit sira', js(kolonMetinleri(ci, 3, 5, 6)) === js(['Döviz $', 'Döviz €']) && ci.getRow(6).getCell(5).numFmt === EUR, js(kolonMetinleri(ci, 3, 5, 6)));
  // Teklif GENELINDE iki birim: malzeme yalniz $, iscilik yalniz € olsa da ikisi de METIN —
  // sayi kalsalar musterinin `=F12+F13`u $ ile €'yu sessizce toplardi (inceleme M1)
  check('EK3h teklif cok birimli: MALZEME tek birimde tutarli olsa da METIN "$31,66"', fc('F12').value === '$31,66', js(fc('F12').value));
  check('EK3i ISCILIK METIN "€25,00"', fc('F13').value === '€25,00', js(fc('F13').value));
  check('EK3j GENEL iki birimde → karma "$37,99 + €30,00"', fc('F11').value === '$37,99 + €30,00', js(fc('F11').value));
  denetim('C doviz', wC);

  const { s: sC2, wb: wC2 } = await cikti([ELEKTRIK_BOS_DOLAR], musteriFormati({ formullu: true }));
  const c2s = wC2.getWorksheet('Icmal Sayfasi')!;
  const c2 = c2s.getCell('F11');
  check('EK3k yalniz ₺ tutarli karisik teklif: eksiz GENEL tek birimli yolun aynisi (sayi/formul, musterinin "TL" bicimi korunur)',
    yakin(sayi(c2), 3750) && c2.numFmt === '#,##0.00 "TL"' && formulu(c2) !== '', js([c2.value, c2.numFmt]));
  check('EK3m tek ₺: metin ici rakam simgesiz (tek birimli yol gibi; "… TL" sablonunda "₺ TL" olmaz)', c2s.getCell('C9').value === 'Ara toplam: 2.625,00', js(c2s.getCell('C9').value));
  check('EK8c tek birimde uyari YOK (birim karismaz)', sC2.karisikUyari === undefined, String(sC2.karisikUyari));
  // Goruntuleme birimi USD verilse de karisikta yok sayilir: birimsiz (tek ₺) hucre "$" bicimi ALMAZ
  const { wb: wC3 } = await cikti([ELEKTRIK_BOS_DOLAR], musteriFormati(), { birim: { kod: 'USD', katsayi: 1 / 40, not: 'Fiyatlar USD' }, ctx: { musteri: 'Yapı $& Co' } });
  const c3 = wC3.getWorksheet('Icmal Sayfasi')!.getCell('F11');
  check('EK5g karisik + USD gorunum: tek ₺ eksiz GENEL musterinin TL biciminde, cevrilmeden', c3.numFmt === '#,##0.00 "TL"' && yakin(sayi(c3), 3750), js([c3.value, c3.numFmt]));
  check('EK3n metin ici sabit "$&" kalibi yorumlanmaz (replace fonksiyonla)', wC3.getWorksheet('Kapak')!.getCell('B3').value === 'Sayın Yapı $& Co', js(wC3.getWorksheet('Kapak')!.getCell('B3').value));

  // ══ D — İCMAL_SATIRLARI olmayan musteri formati: toplam sayfa SUMIF'lerinden ══
  const { wb: wD } = await cikti([MEKANIK, ELEKTRIK], musteriFormati({ icmalli: false, birimli: true }));
  const di = wD.getWorksheet('Icmal Sayfasi')!;
  check('EK3l İCMAL satirsiz formatta satir kaymaz', satirBul(di, 'Son satır', 8) === 20, String(satirBul(di, 'Son satır', 8)));
  check('EK4e {{GENEL_TOPLAM_USD}} sayfalarin $ SUMIF\'lerinden', formulu(di.getCell('F16')).includes(`SUMIF('Mekanik'!J`) && formulu(di.getCell('F16')).includes('"USD"') && yakin(sayi(di.getCell('F16')), 3518.556),
    formulu(di.getCell('F16')).slice(0, 90));
  denetim('D İCMAL satirsiz', wD);

  // ══ E — uc birim, kesme isaretli sayfa adi (yerlesik) ══════════════════
  const ONEIL = { ...DOVIZ, name: "O'Neil Döviz" };
  const { wb: wE3b } = await cikti([MEKANIK, ELEKTRIK, ONEIL], 'yerlesik');
  const i3 = wE3b.getWorksheet('İCMAL')!;
  const g3 = ['₺', '$', '€'].map((x) => satirBul(i3, `GENEL TOPLAM ${x}`));
  check('EK2h uc birimli blok: ₺, $, € sirayla, aralarinda bos satir', g3[0] > 0 && g3[1] === g3[0] + 5 && g3[2] === g3[1] + 5, js(g3));
  check('EK2i € blogu GENEL 30 (yalniz O\'Neil € iscilik × 1,2), $ blogu dolar malzemesi 2.924,25 + 31,66',
    yakin(sayi(i3.getRow(g3[2]).getCell(5)), 30) && yakin(sayi(i3.getRow(satirBul(i3, 'Malzeme Toplamı $')).getCell(5)), 2955.91),
    js([sayi(i3.getRow(g3[2]).getCell(5)), sayi(i3.getRow(satirBul(i3, 'Malzeme Toplamı $')).getCell(5))]));
  const oneil = satirBul(i3, "O'Neil Döviz $");
  check('EK1i kesme isaretli sayfa adi SUMIF\'te kacisli', oneil > 0 && formulu(i3.getRow(oneil).getCell(3)).startsWith("SUMIF('O''Neil Döviz'!J"), formulu(i3.getRow(oneil).getCell(3)));
  denetim('E uc birim', wE3b);

  // ══ F — yalniz $ tutarli teklif + kalemsiz sayfa: bos satir ₺ DEGIL teklifin birimi ══
  const DOLAR = { name: 'Dolar', isEmpty: false, columnRoles: ROLLER, rowData: [DOVIZ.rowData[0]] };
  const { wb: wF } = await cikti([DOLAR, ESASLAR], 'yerlesik');
  const iF = wF.getWorksheet('İCMAL')!;
  check('EK1j yalniz $ teklifte kalemsiz sayfa "Esaslar $", blok yalniz $ (bos satir toplamsiz birimde kalmaz)',
    js(kolonMetinleri(iF, 2, 3, 4)) === js(['Dolar $', 'Esaslar $']) && satirBul(iF, 'GENEL TOPLAM $') > 0 && !satirBul(iF, 'GENEL TOPLAM ₺'), js(kolonMetinleri(iF, 2, 3, 5)));

  // ══ G — eski kayitli override karisik duzende uygulanmaz ══════════════════
  const { wb: wG } = await cikti([MEKANIK], 'yerlesik', { overrides: { 'İCMAL': { C3: { value: '999', manual: true }, E8: { value: '1' } } } });
  const iG = wG.getWorksheet('İCMAL')!;
  check('EK5f karisikta eski override UYGULANMAZ (İCMAL SUMIF ve toplam formulu yerinde, 999/1 yazilmadi)', formulu(iG.getCell('C3')).startsWith('SUMIF(') && formulu(iG.getCell('E8')) !== '',
    js([iG.getCell('C3').value, iG.getCell('E8').value]));

  // ══ H — musteri formulu birimli hucreye bakiyor: uyari ══════════════════
  const { s: sH } = await cikti([MEKANIK, ELEKTRIK, ESASLAR], musteriFormati({ formullu: true }));
  check('EK8a cok birimde musteri formulu İCMAL tutarlarina bakiyor → uyari (adres, yalniz o formul)',
    String(sH.karisikUyari).includes('1 formül') && String(sH.karisikUyari).includes('Kapak!C10'), String(sH.karisikUyari));
  const { s: sH2 } = await cikti([MEKANIK, ELEKTRIK, ESASLAR], musteriFormati());
  check('EK8b musteri formulu yoksa uyari yok', sH2.karisikUyari === undefined, String(sH2.karisikUyari));

  // ══ EK9 — F6a K1: yalniz-₺ karisik teklif = TL teklif (format yolu, BAYT BAYT) ══
  const TL_KARISIK = [{
    ...ELEKTRIK,
    // Izgaranin urettigi gibi: kapsam × %5 → malzeme 125, iscilik 25, ikisi de hucrede (inceleme)
    rowData: ELEKTRIK.rowData.map((r: any) => (r._fitting ? {
      ...r, _matBirim: '25', _matToplam: '125', _labBirim: '5', _labToplam: '25',
      _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 125 }], lab: [{ pb: 'TRY', toplam: 25 }] },
    } : r)),
  }, ESASLAR];
  const soy = (sayfalar: any[]) => sayfalar.map((sh) => ({
    ...sh, rowData: sh.rowData.map(({ _matPB, _labPB, _fittingBirimli, ...r }: any) => r),
  }));
  const parcalar = async (buf: Buffer) => {
    const z = await JSZip.loadAsync(buf);
    const o: Record<string, string> = {};
    for (const ad of Object.keys(z.files).sort()) if (!z.files[ad].dir && ad !== 'docProps/core.xml') o[ad] = await z.files[ad].async('string');
    return o;
  };
  const USD_GORUNUM = { kod: 'USD', katsayi: 1 / 40, not: 'Fiyatlar USD' };
  for (const [ad, fmt, ek] of [
    ['yerlesik', 'yerlesik', {}], ['yerlesik USD gorunum', 'yerlesik', { birim: USD_GORUNUM }],
    ['musteri formati (birimli etiketli)', 'musteri', {}], ['musteri formati USD', 'musteri', { birim: USD_GORUNUM }],
  ] as const) {
    const fA = fmt === 'yerlesik' ? 'yerlesik' as const : musteriFormati({ birimli: true });
    const fB = fmt === 'yerlesik' ? 'yerlesik' as const : musteriFormati({ birimli: true });
    const a = await cikti(TL_KARISIK, fA, ek as any);
    const b = await cikti(soy(TL_KARISIK), fB, ek as any);
    const pa = await parcalar(Buffer.from(await a.s.wb.xlsx.writeBuffer()));
    const pb = await parcalar(Buffer.from(await b.s.wb.xlsx.writeBuffer()));
    const farkli = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].filter((x) => pa[x] !== pb[x]);
    const { wb: _wa, ...ustA } = a.s; const { wb: _wb, ...ustB } = b.s;
    check(`EK9 ${ad}: yalniz-₺ karisik = TL (parcalar + ust bilgi)`, Object.keys(pa).length > 5 && farkli.length === 0 && js(ustA) === js(ustB),
      `${Object.keys(pa).length} parca · farkli: ${farkli.join(', ')}${js(ustA) === js(ustB) ? '' : ' · ust bilgi farkli'}`);
  }

  // ══ EK0 KONTROL — yalniz-TL teklif ══════════════════════════════════════
  const { s: sE, wb: wE } = await cikti([TL_SAYFA], 'yerlesik');
  const ie = wE.getWorksheet('İCMAL')!;
  check('EK0a TL: İCMAL adi simgesiz, toplam etiketleri eksiz', hucreMetni(ie.getCell('B3')) === 'Mekanik' && satirBul(ie, 'GENEL TOPLAM') === 8 && !satirBul(ie, 'GENEL TOPLAM ₺'),
    js([hucreMetni(ie.getCell('B3')), satirBul(ie, 'GENEL TOPLAM')]));
  check('EK0b TL: GENEL TOPLAM 226.512 eski formulle', yakin(sayi(ie.getCell('E8')), 226512) && formulu(ie.getCell('E8')) === "(SUM('İCMAL'!C3:C3)+SUM('İCMAL'!D3:D3))*1.2", formulu(ie.getCell('E8')));
  check('EK0c TL: birimli ozet yok', sE.birimliGenelToplam === undefined);
  const { wb: wE2 } = await cikti([TL_SAYFA], musteriFormati({ birimli: true }));
  const e2 = wE2.getWorksheet('Icmal Sayfasi')!;
  check('EK0d TL teklif + birimli etiket: ₺ tum toplam, $ ve € 0', yakin(sayi(e2.getCell('F19')), 226512) && sayi(e2.getCell('F16')) === 0 && e2.getCell('F16').numFmt === USD
    && e2.getCell('F11').numFmt === '#,##0.00 "TL"', js([e2.getCell('F19').value, e2.getCell('F16').value, e2.getCell('F11').numFmt]));
  const { wb: wE3 } = await cikti([TL_SAYFA], musteriFormati({ birimli: true }), { birim: { kod: 'USD', katsayi: 1 / 40, not: 'Fiyatlar USD' } });
  const e3 = wE3.getWorksheet('Icmal Sayfasi')!;
  check('EK0e TL teklif USD gorunumde: $ etiketi cevrilmis tum toplam, ₺ 0', yakin(sayi(e3.getCell('F16')), 5662.8) && sayi(e3.getCell('F19')) === 0,
    js([e3.getCell('F16').value, e3.getCell('F19').value]));

  // ══ EK7 — servis yolu ══════════════════════════════════════════════════
  const kayit = { numara: 0 };
  const servis = (sheets: any[], displayCurrency = 'TRY', formatBaytlari?: Buffer) => {
    const quote: any = {
      id: 'q1', firmaId: 'f1', title: 'İCMAL', sheets, originalFile: Buffer.from('x'), quoteNo: null, rev: 0,
      musteri: null, proje: null, hazirlayan: null, gecerlilik: null, exportOverrides: null, displayCurrency, formatId: null,
    };
    const prisma: any = {
      $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
      $queryRaw: async () => { kayit.numara++; return [{ kilit: '' }]; },
      quote: { findFirst: async () => quote, findMany: async () => [], count: async () => 0, update: async ({ data }: any) => Object.assign(quote, data) },
      quoteFormat: { findFirst: async () => (formatBaytlari ? { name: 'Müşteri', fileBytes: formatBaytlari, isDefault: true, mapping: null } : null) },
      quoteExport: { create: async () => ({}) },
      firma: { findUnique: async () => null },
    };
    const fx: any = { getRates: async () => ({ usdTry: 40, eurTry: 46, source: 'tcmb', date: '05.10.2026' }) };
    return { svc: new QuotesService(prisma, fx, { onbellekHaritasi: async () => ({}) } as any), quote };
  };
  const KIM: any = { userId: 'u1', firmaId: 'f1', teklifKapsami: 'firma' };
  const yil = new Date().getFullYear(); // teklif no yili — sabit yazilsa 1 Ocak'ta kirmizi (inceleme M2)
  const k1 = servis([MEKANIK, ELEKTRIK], 'USD');
  let hata = '';
  let sonuc: any = null;
  try { sonuc = await k1.svc.exportXlsx(KIM, 'q1'); } catch (e: any) { hata = `${e?.getStatus?.() ?? ''} ${e?.message ?? e}`; }
  check('EK7b karisik teklif format yolunda INER (400 reddi yok), numara + Rev.01', hata === '' && k1.quote.rev === 1 && k1.quote.quoteNo === `MP-${yil}-001` && kayit.numara === 1, hata || js({ rev: k1.quote.rev, no: k1.quote.quoteNo }));
  check('EK7c indirme ozeti birim basina', String(sonuc?.ozet ?? '').includes('toplam ₺212.579,00 + $2.932,13'), String(sonuc?.ozet));
  if (sonuc) {
    const w7 = await ac(sonuc.buffer);
    const i7 = w7.getWorksheet('İCMAL')!;
    const kur = hucreMetni(i7.getRow(satirBul(i7, 'GENEL TOPLAM $') + 2).getCell(2));
    check('EK5d servis kur notu "çevrim yapılmaz", "Fiyatlar USD" YOK', kur.startsWith('Toplamlar para birimi başına ayrıdır; çevrim yapılmaz.') && !kur.includes('Fiyatlar USD') && kur.includes('Kur: 1 USD = 40,00 TL'), kur);
    check('EK5e servis USD gorunumde de cevirmez: Mekanik ₺ 180.180', sayi(i7.getRow(satirBul(i7, 'Mekanik ₺')).getCell(3)) === 180180);
    denetim('EK7 servis', w7);
  }
  // Tutari olmayan karisik teklif USD gorunumde: goruntuleme birimi yine YOK SAYILIR —
  // ozet "₺0,00" (fiyatli yolun ikizi: bos kovada tek ₺), "$0,00" degil
  const bos = servis([{ ...DOVIZ, rowData: [DOVIZ.rowData[2]] }], 'USD');
  const sBos = await bos.svc.exportXlsx(KIM, 'q1');
  check('EK7d tutarsiz karisik teklif USD gorunumde: ozet ₺0,00 (cevrim/simge yok)', String(sBos.ozet).includes('toplam ₺0,00'), String(sBos.ozet));
  const kH = servis([MEKANIK, ELEKTRIK], 'TRY', Buffer.from(await musteriFormati({ formullu: true }).xlsx.writeBuffer()));
  const sKH = await kH.svc.exportXlsx(KIM, 'q1');
  check('EK8d servis: musteri formati uyarisi indirme uyarisinda (X-Export-Warning)', String(sKH.uyari ?? '').includes('Kapak!C10'), String(sKH.uyari));
  // EK9 SERVIS: yalniz-₺ karisik teklif USD gorunumde TL teklif gibi CEVRILIR ("Fiyatlar USD"
  // notu, cevrilmis İCMAL) — servis gorunum birimini yalniz dovizli teklifte yok sayar
  const s9a = await servis(TL_KARISIK, 'USD').svc.exportXlsx(KIM, 'q1');
  const s9b = await servis(soy(TL_KARISIK), 'USD').svc.exportXlsx(KIM, 'q1');
  const p9a = await parcalar(s9a.buffer); const p9b = await parcalar(s9b.buffer);
  const f9 = [...new Set([...Object.keys(p9a), ...Object.keys(p9b)])].filter((x) => p9a[x] !== p9b[x]);
  check('EK9 servis: yalniz-₺ karisik teklif USD gorunumde TL teklifle bayt bayt ayni (+ ozet)', Object.keys(p9a).length > 5 && f9.length === 0 && s9a.ozet === s9b.ozet
    && String(s9a.ozet).includes('toplam $'), `farkli: ${f9.join(', ')} · ${s9a.ozet} | ${s9b.ozet}`);
  const k2 = servis([TL_SAYFA], 'USD');
  const s2 = await k2.svc.exportXlsx(KIM, 'q1');
  const i2 = (await ac(s2.buffer)).getWorksheet('İCMAL')!;
  check('EK0f KONTROL servis: TL teklif USD gorunumde eskisi gibi cevrilir + "Fiyatlar USD" notu', yakin(sayi(i2.getCell('C3')), 171600 / 40)
    && hucreMetni(i2.getCell('B10')).startsWith('Fiyatlar USD') && String(s2.ozet).includes('toplam $4.719,00'), js([i2.getCell('C3').value, hucreMetni(i2.getCell('B10')), s2.ozet]));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
}

bitmezseKirmizi(main().catch((e) => { console.error(e); process.exitCode = 1; }));
