/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  NET FIYAT IKIZI  (`npm run test:net-fiyat-ikiz`) — kutuphane doviz neti (05.10)
 *
 *  Kutuphane ekraninin "Net Fiyat" kolonu (on yuz ExcelGrid `_draftNetPrice`)
 *  dovizli satirda ₺ kuraliyla (1 hane yukari) yuvarliyordu; arka ucun kaynak
 *  neti (F1 `kaynakFiyat`) ve TL neti (P2 C6) dovizde 2 hane. Ayni liste ve
 *  iskontodan ekran ile motor FARKLI net uretiyordu ($10,55 → ekran $10,60).
 *
 *  KORUNAN SOZLESME: on yuz `pricing.ts` hesaplaNetFiyat / hesaplaNetFiyatDoviz
 *  arka uc ikizleriyle HER girdide ayni; on yuz `netFiyatBiriminde` satirin
 *  birimine gore arka ucun sectigi kurali secer (TRY → 1 hane, USD/EUR → 2 hane).
 *  DB GEREKMEZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { hesaplaNetFiyat, hesaplaNetFiyatDoviz } from '../src/ozellik/fiyat/matching/pricing';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

const FE = require('../../frontend/ozellik/fiyat/pricing');
const { netFiyatBiriminde } = require('../../frontend/ozellik/fiyat/taraf-para-birimi');

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};

async function main() {
  // Belirlenimci girdi kumesi: kurus alti kesirler, kayan nokta tuzaklari, sinirlar
  const listeler = [0, 0.001, 0.01, 0.105, 1.001, 2.675, 10.55, 10.551, 99.995, 100, 1234.565, 3354.64, 47.57, 0.333];
  const iskontolar = [-5, 0, 0.5, 3, 10, 12.5, 33.3, 50, 99.99, 100, 150];
  let tl = 0; let doviz = 0; const farkTl: string[] = []; const farkDoviz: string[] = [];
  for (const l of listeler) for (const i of iskontolar) {
    if (FE.hesaplaNetFiyat(l, i) === hesaplaNetFiyat(l, i)) tl++; else farkTl.push(`${l}/${i}: on ${FE.hesaplaNetFiyat(l, i)} arka ${hesaplaNetFiyat(l, i)}`);
    const onD = typeof FE.hesaplaNetFiyatDoviz === 'function' ? FE.hesaplaNetFiyatDoviz(l, i) : NaN;
    if (onD === hesaplaNetFiyatDoviz(l, i)) doviz++; else farkDoviz.push(`${l}/${i}: on ${onD} arka ${hesaplaNetFiyatDoviz(l, i)}`);
  }
  const n = listeler.length * iskontolar.length;
  check(`NI1 ₺ net ikizi ${n} girdide ayni`, tl === n, farkTl.slice(0, 3).join(' ; '));
  check(`NI2 doviz net ikizi ${n} girdide ayni`, doviz === n, farkDoviz.slice(0, 3).join(' ; '));

  // NI3: kutuphane kurali satirin birimine gore arka ucun kuralini secer
  let secim = 0; const farkSecim: string[] = [];
  for (const pb of ['TRY', 'USD', 'EUR', undefined, 'GBP']) for (const l of listeler) for (const i of [0, 10, 33.3]) {
    const bek = pb === 'USD' || pb === 'EUR' ? hesaplaNetFiyatDoviz(l, i) : hesaplaNetFiyat(l, i);
    const on = netFiyatBiriminde(l, i, pb);
    if (on === bek) secim++; else farkSecim.push(`${pb}/${l}/${i}: on ${on} arka ${bek}`);
  }
  check('NI3 kutuphane neti satirin biriminde arka ucla ayni', secim === 5 * listeler.length * 3, farkSecim.slice(0, 3).join(' ; '));
  // OLCUT KONTROLU: girdi kumesi iki kurali gercekten ayiriyor mu (yoksa NI3 ayirt etmez)
  check('NI0 girdi kumesi iki kurali ayiriyor (10,55: ₺ 10,6 · $ 10,55)', hesaplaNetFiyat(10.55, 0) === 10.6 && hesaplaNetFiyatDoviz(10.55, 0) === 10.55);

  console.log(`\nNET FIYAT IKIZI: ${pass} PASS · ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
}

bitmezseKirmizi(main().catch((e) => { console.error(e); process.exitCode = 1; }));
