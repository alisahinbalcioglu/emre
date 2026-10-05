/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KARISIK PARA BIRIMLI FIYATLI CIKTI  (`npm run test:ex-karisik`) — coklu para
 *  birimi F5 (Emre karari 04.10, Excel prototipi onayi 05.10 "uygula").
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  Teklif karisik kipteyse (satirlarda taraf birimi `_matPB`/`_labPB` var —
 *  on yuz `karisikKipMi` ikizi) fiyatli Excel:
 *    - Her taraf KENDI biriminde yazilir: hucre bicimi tarafin birimi ($/€ basta,
 *      ₺ sonda); doviz cevrimi YAPILMAZ (goruntuleme birimi yok sayilir).
 *    - Karma satirin (malzeme $, iscilik ₺) Genel Toplam hucresi iki tutari
 *      yan yana METIN olarak gosterir (karar 1).
 *    - Gizli J/K sutunlari taraf birimini (TRY/USD/EUR) tasir; baski alani A:I.
 *    - SAYFA TOPLAMI birim BASINA ayri satir: SUMIF(J/K, birim) — ARA TOPLAM
 *      satirinin birim hucresi bostur, toplama girmez (13.09 "3 kat" dersi).
 *    - Fitting kapsam karisiksa birim basina AYRI satir ("— ₺ kısmı") (karar 2).
 *    - Doviz tarafi 2 hane YUKARI: formul ROUNDUP(C*E,2) (karar 4).
 *    - GENEL TOPLAM sekmesi: sayfa × birim satirlari + birim basina TEKLİF
 *      GENEL TOPLAMI; "çevrim yapılmaz" notu.
 *    - "Teklif formatında aktar" yolu tek birimli İCMAL'e yazar ($ + ₺
 *      toplardi) → karisik teklifte numara YAKMADAN acik mesajla reddedilir.
 *  KONTROL: birim alani olmayan (yalniz-TL) teklif 9 sutun, tek SAYFA TOPLAMI
 *  (ayrintisi `test:ex` / `test:export`te, dokunulmadi).
 *  DB GEREKMEZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as ExcelJS from 'exceljs';
import { standartCiktiUret } from '../src/ozellik/teklif/quotes/standart-cikti';
import { karisikKipMi, paraMetni } from '../src/ozellik/teklif/quotes/cikti-karisik';
import { paraBicimi } from '../src/ozellik/teklif/quotes/cikti-stil';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { formulDegerlendir, formulDenetimi } from './cikti-test-yardimci';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};
const js = (x: unknown) => JSON.stringify(x);

const TARIH = new Date('2026-10-05T10:00:00Z');
const BASLIK = 4; // antetsiz duzende tablo basligi
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

/** Onayli prototipin rakamlari (Excel COM ile dogrulanmisti, 05.10). */
const MEKANIK = {
  name: 'Mekanik', isEmpty: false, columnRoles: ROLLER,
  rowData: [
    { _isHeaderRow: true, _ad: 'CİNSİ' },
    // Dolar satiri ILK: toplam satirlari ekleme sirasina degil SABIT siraya (₺, $, €) uymali
    kalem('2', 'Kelebek Vana DN65', 10, 'ad', ['10.5', '105'], ['0.75', '7.5'], { _matPB: 'USD', _labPB: 'USD' }),
    kalem('1', 'Siyah Çelik Boru 6"', 286, 'mt', ['600', '171600'], ['60', '17160'], { _matPB: 'TRY', _labPB: 'TRY' }),
    kalem('3', 'Küresel Vana 4"', 268, 'ad', ['10', '2680'], ['40', '10720'], { _matPB: 'USD', _labPB: 'TRY' }),
    // Musterinin ARA TOPLAM'i: gorunur, toplama GIRMEZ — birim hucresi bos kalmali
    kalem('', 'ARA TOPLAM', 0, '', ['', '174385'], ['', '27887.5'], {}, { _ozet: true, _miktar: '' }),
    kalem('4', 'Fitting bedeli', 5, '%', ['', ''], ['', ''], {}, {
      _fitting: { kapsam: [1, 2, 3] },
      // 0 tutarli € girdisi parca ACMAZ (€ satiri ve € toplami cikmamali)
      _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 8580 }, { pb: 'USD', toplam: 139.25 }, { pb: 'EUR', toplam: 0 }], lab: [{ pb: 'TRY', toplam: 1394 }, { pb: 'USD', toplam: 0.38 }] },
    }),
    kalem('5', 'Manometre', 2, 'ad', ['', ''], ['', '']),
  ],
};
const ELEKTRIK = {
  name: 'Elektrik', isEmpty: false, columnRoles: ROLLER,
  rowData: [
    kalem('1', 'Kablo NYM 3x2,5', 100, 'mt', ['25', '2500'], ['5', '500'], { _matPB: 'TRY', _labPB: 'TRY' }),
    // Kapsam tek birimli: tek satir, ad eksiz ("— ₺ kısmı" yok)
    kalem('2', 'Fitting %5', 5, '%', ['', ''], ['', ''], {}, { _fitting: { kapsam: [0] }, _fittingBirimli: { mat: [{ pb: 'TRY', toplam: 125 }], lab: [] } }),
  ],
};
/** Buyuk tutarli karma satir: 26'lik sutunda da kaydirilir, satir yuksekligi metne gore. */
const BUYUK = {
  name: 'Büyük', isEmpty: false, columnRoles: ROLLER,
  rowData: [kalem('1', 'Büyük Karma', 1, 'ad', ['1234567.89', '1234567.89'], ['98765432.1', '98765432.1'], { _matPB: 'USD', _labPB: 'TRY' })],
};
const DOVIZ = {
  name: 'Döviz', isEmpty: false, columnRoles: ROLLER,
  rowData: [
    // 3 × 10,551 = 31,653 → ekran 2 hane YUKARI 31,66 (1 hane kurali 31,70 derdi)
    kalem('1', 'Çekvalf', 3, 'ad', ['10.551', '31.66'], ['', ''], { _matPB: 'USD' }),
    kalem('2', 'Montaj', 2, 'ad', ['', ''], ['12.5', '25'], { _labPB: 'EUR' }),
    // Birimleri farkli, iki tarafi da bos (fiyatlar silinmis): Genel Toplam bos kalir
    kalem('3', 'Boş Karma', 1, 'ad', ['', ''], ['', ''], { _matPB: 'USD', _labPB: 'TRY' }),
  ],
};
const TL_SAYFA = {
  name: 'Mekanik', isEmpty: false, columnRoles: ROLLER,
  rowData: [kalem('1', 'Siyah Çelik Boru 6"', 286, 'mt', ['600', '171600'], ['60', '17160'])],
};

const ac = async (buf: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
};
const satirBul = (ws: ExcelJS.Worksheet, metin: string, kolon = 2): number => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row, rn) => { if (!n && String(row.getCell(kolon).value ?? '').trim() === metin) n = rn; });
  return n;
};
const sayisal = (v: any): number => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof v.result === 'number' ? v.result : NaN);
const formulu = (v: any): string => (v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : '');
const hucre = (ws: ExcelJS.Worksheet, r: number, c: number) => ws.getRow(r).getCell(c);
const deger = (ws: ExcelJS.Worksheet, r: number, c: number) => hucre(ws, r, c).value;
const bicim = (ws: ExcelJS.Worksheet, r: number, c: number) => hucre(ws, r, c).numFmt;
const yakin = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  // ── KR0: kip kurali (on yuz karisikKipMi ikizi) ──
  check('KR0a karisik: _labPB tasiyan satir', karisikKipMi([{ rowData: [{ _labPB: 'TRY' }] }]) === true);
  check('KR0b yalniz-TL: birim alani yok', karisikKipMi([{ rowData: [{ _matBirim: '5' }] }, { rowData: null } as any]) === false);

  const s = await standartCiktiUret({ sheetsArr: [MEKANIK, ELEKTRIK], baslik: 'F5', tarih: TARIH });
  const wb = await ac(s.buffer);
  const ws = wb.getWorksheet('Mekanik')!;

  // ── KR1: gizli birim sutunlari ──
  check('KR1a baslik J/K "PB malz."/"PB işç."', deger(ws, BASLIK, 10) === 'PB malz.' && deger(ws, BASLIK, 11) === 'PB işç.',
    `${js(deger(ws, BASLIK, 10))} ${js(deger(ws, BASLIK, 11))}`);
  check('KR1b J ve K gizli', ws.getColumn(10).hidden === true && ws.getColumn(11).hidden === true);
  const baski = String(ws.pageSetup.printArea ?? '');
  check('KR1c baski alani A:I (gizli sutunlar disinda)', /^A1:I\d+$/.test(baski) && baski === `A1:I${ws.rowCount}`, baski);

  const boru = satirBul(ws, 'Siyah Çelik Boru 6"');
  const kelebek = satirBul(ws, 'Kelebek Vana DN65');
  const kuresel = satirBul(ws, 'Küresel Vana 4"');
  const ara = satirBul(ws, 'ARA TOPLAM');
  const mano = satirBul(ws, 'Manometre');
  check('KR2a satirlar bulundu', boru > 0 && kelebek > 0 && kuresel > 0 && ara > 0 && mano > 0, js({ boru, kelebek, kuresel, ara, mano }));
  const kod = (r: number) => `${deger(ws, r, 10) ?? ''}/${deger(ws, r, 11) ?? ''}`;
  check('KR2b taraf birimleri J/K', kod(boru) === 'TRY/TRY' && kod(kelebek) === 'USD/USD' && kod(kuresel) === 'USD/TRY',
    `${kod(boru)} ${kod(kelebek)} ${kod(kuresel)}`);
  check('KR2c ARA TOPLAM birim hucresi BOS (SUMIF disi)', kod(ara) === '/', kod(ara));
  check('KR2d fiyatsiz satir TRY (birim alani yok)', kod(mano) === 'TRY/TRY', kod(mano));

  // ── KR3: hucre bicimi tarafin biriminde ──
  check('KR3a dolar satiri E-I $', [5, 6, 7, 8, 9].every((c) => bicim(ws, kelebek, c) === USD), [5, 6, 7, 8, 9].map((c) => bicim(ws, kelebek, c)).join(' | '));
  check('KR3b karma satir E/F $, G/H ₺', bicim(ws, kuresel, 5) === USD && bicim(ws, kuresel, 6) === USD && bicim(ws, kuresel, 7) === TRY && bicim(ws, kuresel, 8) === TRY);
  check('KR3c TL satiri ₺', [5, 6, 7, 8, 9].every((c) => bicim(ws, boru, c) === TRY));
  check('KR3d dolar toplam onbellegi cevrilmedi (105)', sayisal(deger(ws, kelebek, 6)) === 105, js(deger(ws, kelebek, 6)));

  // ── KR4/KR5: Genel Toplam hucresi ──
  check('KR4 karma satir iki tutar yan yana', deger(ws, kuresel, 9) === '$2.680,00 + 10.720,00 ₺', js(deger(ws, kuresel, 9)));
  // 18'lik sutunda PDF'te iki kenardan kesiliyordu (05.10, Excel COM ciktisi) — prototipin 26'si + kaydirma
  const wb4 = await ac((await standartCiktiUret({ sheetsArr: [BUYUK], baslik: 'F5', tarih: TARIH })).buffer);
  const w4 = wb4.getWorksheet('Büyük')!;
  const b4 = satirBul(w4, 'Büyük Karma');
  check('KR4c uzun karma metin iki satira kayar (yukseklik > 18)', deger(w4, b4, 9) === '$1.234.567,89 + 98.765.432,10 ₺' && Number(w4.getRow(b4).height) > 18,
    `${js(deger(w4, b4, 9))} h=${w4.getRow(b4).height}`);
  check('KR4b karma metin sigar: I genisligi 26, kaydirmali', ws.getColumn(9).width === 26 && hucre(ws, kuresel, 9).alignment?.wrapText === true,
    `${ws.getColumn(9).width} ${js(hucre(ws, kuresel, 9).alignment)}`);
  check('KR5 ayni birimde formul + $ bicimi', formulu(deger(ws, kelebek, 9)) === `IF(COUNT(F${kelebek},H${kelebek})=0,"",SUM(F${kelebek},H${kelebek}))`
    && sayisal(deger(ws, kelebek, 9)) === 112.5, js(deger(ws, kelebek, 9)));

  // ── KR6: fitting birim basina ayri satir ──
  const fTl = satirBul(ws, 'Fitting bedeli — ₺ kısmı');
  const fUsd = satirBul(ws, 'Fitting bedeli — $ kısmı');
  check('KR6a fitting iki satira bolundu (₺ once)', fTl > 0 && fUsd === fTl + 1, js({ fTl, fUsd }));
  check('KR6b ₺ kismi 8.580 / 1.394, TRY/TRY', sayisal(deger(ws, fTl, 6)) === 8580 && sayisal(deger(ws, fTl, 8)) === 1394 && kod(fTl) === 'TRY/TRY'
    && bicim(ws, fTl, 6) === TRY, `${js(deger(ws, fTl, 6))} ${js(deger(ws, fTl, 8))} ${kod(fTl)}`);
  check('KR6c $ kismi 139,25 / 0,38, USD/USD', sayisal(deger(ws, fUsd, 6)) === 139.25 && sayisal(deger(ws, fUsd, 8)) === 0.38 && kod(fUsd) === 'USD/USD'
    && bicim(ws, fUsd, 8) === USD, `${js(deger(ws, fUsd, 6))} ${js(deger(ws, fUsd, 8))} ${kod(fUsd)}`);
  check('KR6d oran ve "%" iki satirda, birim fiyat bos', deger(ws, fTl, 3) === 5 && deger(ws, fUsd, 3) === 5 && deger(ws, fTl, 4) === '%'
    && deger(ws, fTl, 5) == null && deger(ws, fUsd, 7) == null);
  check('KR6e No yalniz ilk parcada', deger(ws, fTl, 1) === 4 && deger(ws, fUsd, 1) == null, `${js(deger(ws, fTl, 1))} ${js(deger(ws, fUsd, 1))}`);

  // ── KR7/KR8: SAYFA TOPLAMI birim basina ──
  const stTl = satirBul(ws, 'SAYFA TOPLAMI ₺');
  const stUsd = satirBul(ws, 'SAYFA TOPLAMI $');
  check('KR7a ₺ ve $ toplam satirlari, € yok, birimsiz yok', stTl > 0 && stUsd === stTl + 1 && !satirBul(ws, 'SAYFA TOPLAMI €') && !satirBul(ws, 'SAYFA TOPLAMI'),
    js({ stTl, stUsd }));
  const ilk = BASLIK + 1;
  check('KR7b ₺ malzeme formulu SUMIF(J,"TRY",F)', formulu(deger(ws, stTl, 6)) === `SUMIF(J${ilk}:J${mano},"TRY",F${ilk}:F${mano})`, formulu(deger(ws, stTl, 6)));
  check('KR7c $ iscilik formulu SUMIF(K,"USD",H)', formulu(deger(ws, stUsd, 8)) === `SUMIF(K${ilk}:K${mano},"USD",H${ilk}:H${mano})`, formulu(deger(ws, stUsd, 8)));
  const uc = (r: number) => [6, 8, 9].map((c) => sayisal(deger(ws, r, c)));
  check('KR7d ₺ onbellek 180.180 / 29.274 / 209.454', js(uc(stTl)) === js([180180, 29274, 209454]), js(uc(stTl)));
  check('KR7e $ onbellek 2.924,25 / 7,88 / 2.932,13', uc(stUsd).every((v, i) => yakin(v, [2924.25, 7.88, 2932.13][i])), js(uc(stUsd)));
  check('KR7f bicimler birimde', [6, 8, 9].every((c) => bicim(ws, stTl, c) === TRY && bicim(ws, stUsd, c) === USD));
  const el = wb.getWorksheet('Elektrik')!;
  check('KR8 tek birimli sayfa: yalniz SAYFA TOPLAMI ₺', satirBul(el, 'SAYFA TOPLAMI ₺') > 0 && !satirBul(el, 'SAYFA TOPLAMI $'));
  const elFit = satirBul(el, 'Fitting %5');
  check('KR8b tek birimli fitting tek satir, ad eksiz, 125 ₺', elFit > 0 && !satirBul(el, 'Fitting %5 — ₺ kısmı') && sayisal(deger(el, elFit, 6)) === 125
    && deger(el, elFit, 11) === 'TRY', `${elFit} ${js(deger(el, elFit, 6))}`);
  check('KR8c 0 tutarli € fitting girdisi satir acmaz', !satirBul(ws, 'Fitting bedeli — € kısmı') && satirBul(ws, 'Fitting bedeli — $ kısmı') + 1 === mano);

  // ── KR9: tum formul onbellekleri = Excel'in yeniden hesabi (SUMIF dahil) ──
  const d = formulDenetimi(wb);
  check('KR9 formul denetimi temiz', d.sayi > 0 && d.sorun.length === 0, `${d.sayi} formul; ${d.sorun.slice(0, 3).join(' ; ')}`);
  // Degerlendiricinin SUMIF'i kendisi de olculur (olcutu once dogrula)
  const elle = formulDegerlendir(wb, 'Mekanik', `SUMIF(J${kelebek}:J${kuresel},"usd",F${kelebek}:F${kuresel})`);
  check('KR9b degerlendirici SUMIF (buyuk/kucuk harf duyarsiz) 105 + 2.680', elle.v === 2785, js(elle));

  // ── KR10: GENEL TOPLAM sekmesi ──
  const oz = wb.getWorksheet('GENEL TOPLAM')!;
  const ozBas = satirBul(oz, 'Sayfa', 1);
  const basliklar = [1, 2, 3, 4, 5].map((c) => deger(oz, ozBas, c));
  check('KR10a basliklar Sayfa · Para birimi · Malzeme · İşçilik · Genel Toplam', js(basliklar) === js(['Sayfa', 'Para birimi', 'Malzeme', 'İşçilik', 'Genel Toplam']), js(basliklar));
  const ozSatirlari: string[] = [];
  for (let r = ozBas + 1; r <= oz.rowCount; r++) {
    const a = String(deger(oz, r, 1) ?? '');
    if (a) ozSatirlari.push(`${a}|${deger(oz, r, 2) ?? ''}`);
  }
  check('KR10b sayfa × birim satirlari', js(ozSatirlari.slice(0, 3)) === js(['Mekanik|₺ (TL)', 'Mekanik|$ (USD)', 'Elektrik|₺ (TL)']), js(ozSatirlari));
  const mUsd = ozBas + 2;
  check('KR10c $ satiri Mekanik SAYFA TOPLAMI $ satirina bagli', formulu(deger(oz, mUsd, 3)) === `'Mekanik'!F${stUsd}` && formulu(deger(oz, mUsd, 5)) === `'Mekanik'!I${stUsd}`
    && bicim(oz, mUsd, 3) === USD, `${formulu(deger(oz, mUsd, 3))} ${bicim(oz, mUsd, 3)}`);
  const gtTl = satirBul(oz, 'TEKLİF GENEL TOPLAMI ₺', 1);
  const gtUsd = satirBul(oz, 'TEKLİF GENEL TOPLAMI $', 1);
  const ozUc = (r: number) => [3, 4, 5].map((c) => sayisal(deger(oz, r, c)));
  check('KR10d TEKLİF GENEL TOPLAMI ₺ 182.805 / 29.774 / 212.579', gtTl > 0 && js(ozUc(gtTl)) === js([182805, 29774, 212579]) && bicim(oz, gtTl, 5) === TRY, js(ozUc(gtTl)));
  check('KR10e TEKLİF GENEL TOPLAMI $ 2.924,25 / 7,88 / 2.932,13', gtUsd > 0 && ozUc(gtUsd).every((v, i) => yakin(v, [2924.25, 7.88, 2932.13][i])) && bicim(oz, gtUsd, 5) === USD, js(ozUc(gtUsd)));
  check('KR10f ₺ genel toplam yalniz ₺ satirlarini toplar', formulu(deger(oz, gtTl, 3)) === `SUM(C${ozBas + 1},C${ozBas + 3})`, formulu(deger(oz, gtTl, 3)));
  check('KR10g "çevrim yapılmaz" notu', satirBul(oz, 'Toplamlar para birimi başına ayrıdır; çevrim yapılmaz.', 1) > 0);
  check('KR11 indirme ozeti iki birimi soyler', s.ozet.includes('genel toplam ₺212.579,00 + $2.932,13'), s.ozet);
  check('KR11b genelToplam YALNIZ ₺ kovasi, birimli liste ayri', s.genelToplam === 212579
    && js(s.birimliGenelToplam) === js([{ pb: 'TRY', toplam: 212579 }, { pb: 'USD', toplam: 2932.13 }]), `${s.genelToplam} ${js(s.birimliGenelToplam)}`);
  check('KR11c fiyatsiz satir yalniz Manometre (fitting parcalari fiyatli)', s.fiyatsizSatir === 1, String(s.fiyatsizSatir));

  // ── KR12: goruntuleme birimi karisik kipte YOK SAYILIR (cevrim yapilmaz) ──
  const c12 = await ac((await standartCiktiUret({
    sheetsArr: [MEKANIK], baslik: 'F5', tarih: TARIH, birim: { kod: 'USD', katsayi: 1 / 40, not: 'Fiyatlar USD — 1 USD = ₺40,00' },
  })).buffer);
  const w12 = c12.getWorksheet('Mekanik')!;
  check('KR12a birim verilse de dolar 105, lira 171.600', sayisal(deger(w12, kelebek, 6)) === 105 && sayisal(deger(w12, boru, 6)) === 171600,
    `${js(deger(w12, kelebek, 6))} ${js(deger(w12, boru, 6))}`);
  check('KR12b "Fiyatlar USD" notu yazilmaz', !satirBul(c12.getWorksheet('GENEL TOPLAM')!, 'Fiyatlar USD — 1 USD = ₺40,00', 1));

  // ── KR13: doviz 2 hane yukari + € kovasi ──
  // Doviz ILK sayfa: ozetin birim sirasi ekleme sirasindan ($, €, ₺) degil SABIT siradan (₺, $, €)
  const s13 = await standartCiktiUret({ sheetsArr: [DOVIZ, ELEKTRIK], baslik: 'F5', tarih: TARIH });
  const wb13 = await ac(s13.buffer);
  const w13 = wb13.getWorksheet('Döviz')!;
  const cek = satirBul(w13, 'Çekvalf');
  check('KR13a dolar tarafi ROUNDUP(C*E,2) = 31,66', formulu(deger(w13, cek, 6)) === `IF(E${cek}="","",ROUNDUP(C${cek}*E${cek},2))` && sayisal(deger(w13, cek, 6)) === 31.66,
    `${formulu(deger(w13, cek, 6))} = ${js(deger(w13, cek, 6))}`);
  check('KR13b yeniden hesaplanan sayilmadi', s13.yenidenHesaplanan === 0, String(s13.yenidenHesaplanan));
  const t13 = satirBul(w13, 'SAYFA TOPLAMI $'); const e13 = satirBul(w13, 'SAYFA TOPLAMI €');
  check('KR13c $ sonra € (sabit sira), ₺ yok', t13 > 0 && e13 === t13 + 1 && !satirBul(w13, 'SAYFA TOPLAMI ₺') && bicim(w13, e13, 8) === EUR
    && sayisal(deger(w13, e13, 8)) === 25, js({ t13, e13, v: deger(w13, e13, 8) }));
  const montaj = satirBul(w13, 'Montaj');
  const kod13 = (r: number) => `${deger(w13, r, 10) ?? ''}/${deger(w13, r, 11) ?? ''}`;
  check('KR13e malzemesi fiyatsiz satirin Genel Toplami iscilik biriminde (€)', bicim(w13, montaj, 9) === EUR && sayisal(deger(w13, montaj, 9)) === 25, bicim(w13, montaj, 9));
  // Inceleme (05.10): birimler farkli, yalniz bir taraf dolu → I YALNIZ o taraf. SUM(F,H)
  // musteri bos tarafi Excel'de doldurunca $ ile ₺'yi toplardi.
  check('KR16a malzeme $ dolu, iscilik bos: I = yalniz F, $', formulu(deger(w13, cek, 9)) === `IF(F${cek}="","",F${cek})`
    && sayisal(deger(w13, cek, 9)) === 31.66 && bicim(w13, cek, 9) === USD, `${formulu(deger(w13, cek, 9))} ${bicim(w13, cek, 9)}`);
  check('KR16b malzeme bos, iscilik € dolu: I = yalniz H', formulu(deger(w13, montaj, 9)) === `IF(H${montaj}="","",H${montaj})`, formulu(deger(w13, montaj, 9)));
  const bosKarma = satirBul(w13, 'Boş Karma');
  check('KR16c birimler farkli, iki taraf bos: I bos', bosKarma > 0 && deger(w13, bosKarma, 9) == null && kod13(bosKarma) === 'USD/TRY', `${js(deger(w13, bosKarma, 9))}`);
  check('KR16d negatif doviz/₺ metni hucre bicimiyle ayni yon', paraMetni(-5, 'USD') === '-$5,00' && paraMetni(-1234.5, 'TRY') === '-1.234,50 ₺' && paraMetni(7.5, 'EUR') === '€7,50',
    `${paraMetni(-5, 'USD')} | ${paraMetni(-1234.5, 'TRY')} | ${paraMetni(7.5, 'EUR')}`);
  const oz13 = wb13.getWorksheet('GENEL TOPLAM')!;
  const g13 = ['₺', '$', '€'].map((x) => satirBul(oz13, `TEKLİF GENEL TOPLAMI ${x}`, 1));
  check('KR13f GENEL TOPLAM birim sirasi ₺ < $ < €', g13[0] > 0 && g13[1] === g13[0] + 1 && g13[2] === g13[1] + 1, js(g13));
  const en = await ac((await standartCiktiUret({ sheetsArr: [DOVIZ], baslik: 'F5', tarih: TARIH, dil: 'en' })).buffer);
  check('KR13d en: "PAGE TOTAL $"', satirBul(en.getWorksheet('Döviz')!, 'PAGE TOTAL $') > 0);

  // ── KR14: KONTROL — yalniz-TL teklif eski duzende ──
  const tl = await ac((await standartCiktiUret({ sheetsArr: [TL_SAYFA], baslik: 'F5', tarih: TARIH })).buffer);
  const wTl = tl.getWorksheet('Mekanik')!;
  check('KR14a 9 sutun, gizli sutun yok', wTl.getRow(BASLIK).cellCount === 9 && !wTl.getColumn(10).hidden, String(wTl.getRow(BASLIK).cellCount));
  check('KR14b tek "SAYFA TOPLAMI"', satirBul(wTl, 'SAYFA TOPLAMI') > 0 && !satirBul(wTl, 'SAYFA TOPLAMI ₺'));
  const ozTl = tl.getWorksheet('GENEL TOPLAM')!;
  check('KR14c GENEL TOPLAM 4 sutun', deger(ozTl, satirBul(ozTl, 'Sayfa', 1), 2) === 'Malzeme');

  // ── KR15: servis yollari ──
  const kayit = { numara: 0 };
  const servis = (sheets: any[], displayCurrency = 'TRY') => {
    const quote: any = {
      id: 'q1', firmaId: 'f1', title: 'F5', sheets, originalFile: Buffer.from('x'), quoteNo: null, rev: 0,
      musteri: null, proje: null, hazirlayan: null, gecerlilik: null, exportOverrides: null, displayCurrency, formatId: null,
    };
    const prisma: any = {
      $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
      $queryRaw: async () => { kayit.numara++; return [{ kilit: '' }]; },
      quote: { findFirst: async () => quote, findMany: async () => [], count: async () => 0, update: async ({ data }: any) => Object.assign(quote, data) },
      quoteFormat: { findFirst: async () => null },
      quoteExport: { create: async () => ({}) },
      firma: { findUnique: async () => null },
    };
    const fx: any = { getRates: async () => ({ usdTry: 40, eurTry: 46, source: 'tcmb', date: '05.10.2026' }) };
    return { svc: new QuotesService(prisma, fx, { onbellekHaritasi: async () => ({}) } as any), quote };
  };
  const KIM: any = { userId: 'u1', firmaId: 'f1', teklifKapsami: 'firma' };
  const k1 = servis([MEKANIK]);
  let hata = '';
  try { await k1.svc.exportXlsx(KIM, 'q1'); } catch (e: any) { hata = `${e?.getStatus?.() ?? ''} ${e?.message ?? e}`; }
  check('KR15a format yolu karisik teklifi 400 ile reddeder', hata.startsWith('400 ') && hata.includes('Fiyatlandırılmış Excel'), hata);
  check('KR15b reddedilen indirme numara YAKMAZ', kayit.numara === 0 && k1.quote.quoteNo === null && k1.quote.rev === 0, js({ n: kayit.numara, no: k1.quote.quoteNo }));
  const k2 = servis([TL_SAYFA]);
  let tlHata = '';
  try { await k2.svc.exportXlsx(KIM, 'q1'); } catch (e: any) { tlHata = String(e?.message ?? e); }
  check('KR15c KONTROL: yalniz-TL teklif format yolunda iner', tlHata === '' && k2.quote.rev === 1, tlHata);
  const k3 = servis([MEKANIK], 'USD');
  const p3 = await k3.svc.exportPricedXlsx(KIM, 'q1');
  const w3 = (await ac(p3.buffer)).getWorksheet('Mekanik')!;
  check('KR15d fiyatli yol USD gorunumde de cevirmez', sayisal(deger(w3, kelebek, 6)) === 105 && sayisal(deger(w3, boru, 6)) === 171600, `${js(deger(w3, kelebek, 6))}`);
  check('KR15e fiyatli yol ozeti iki birim', String(p3.ozet ?? '').includes('₺209.454,00 + $2.932,13'), String(p3.ozet));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
}

bitmezseKirmizi(main().catch((e) => { console.error(e); process.exitCode = 1; }));
