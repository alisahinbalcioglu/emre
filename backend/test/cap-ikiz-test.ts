/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CAP OKUYUCU IKIZI  (`npm run test:cap-ikiz`) — extractCapFromText (05.10)
 *
 *  Baslik baglaminin cap korumasi IKI yerde calisir: arka uc
 *  (eslestirme/utils/build-material-context.ts, eslestirme istegi) ve on yuz
 *  (ozellik/tablo/excel-grid/build-material-context.ts, ExcelGrid sorgu adi).
 *  Ikisi ayristiginda ayni satir ekranda ve motorda FARKLI baslikla sorgulanir.
 *  Olculdu (P3, 05.10): 13 gercek kesif dosyasinin 3.142 adinin 154'unde
 *  ayrisiyorlardi (coklu DN ilk/son, bilesik unicode kesir, tipografik inc).
 *  P2-ek tek kurali yazdi (arka uc); on yuz onu SATIR SATIR kopyalar.
 *
 *  KORUNAN SOZLESME:
 *   C1 kaynak metni BIREBIR (INCH_TO_DN … extractCapFromText; satir sonu ve
 *      bas/son bosluk normalize) — kopya kayarsa davranis farki cikmadan yakalanir.
 *   C2 13 gercek kesif dosyasinin TUM satir adlari: iki fonksiyon AYNI sonuc.
 *   C3 kenar durumlari: AYNI sonuc ve beklenen deger (P2 kurali).
 *   C0 olcut kontrolu: kulliyat bos degil ve kurallari ayiran adlar iceriyor.
 *  DB GEREKMEZ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractCapFromText as arka } from '../src/ozellik/eslestirme/utils/build-material-context';
import { ExcelGridService } from '../src/ozellik/giris/excel-grid/excel-grid.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

const { extractCapFromText: on } = require('../../frontend/ozellik/tablo/excel-grid/build-material-context');

let pass = 0; let fail = 0;
const check = (ad: string, kosul: boolean, kanit = '') => {
  if (kosul) { pass++; console.log(`PASS: ${ad}${kanit ? ' — ' + kanit : ''}`); }
  else { fail++; console.log(`FAIL: ${ad}${kanit ? ' — ' + kanit : ''}`); }
};

const KOK = path.resolve(__dirname, '../..');
function blok(dosya: string): string {
  const s = fs.readFileSync(path.join(KOK, dosya), 'utf8').replace(/\r\n/g, '\n');
  const bas = s.indexOf('const INCH_TO_DN: Record<string, string> = {');
  const fbas = s.indexOf('export function extractCapFromText(text: string): string | null {');
  const son = s.indexOf('\n}\n', fbas);
  if (bas < 0 || fbas < 0 || son < 0) return '';
  return s.slice(bas, son + 2).split('\n').map((l) => l.trimEnd()).join('\n');
}

const KENAR: Array<[string, string | null]> = [
  ['3/4"', 'dn20'], ['1/2"', 'dn15'], ['1 1/4"', 'dn32'], ['2 1/2"', 'dn65'], ['Civata 5/16"', null],
  ['¾"', 'dn20'], ['1¼"', 'dn32'], ['1½"', 'dn40'], ['2½"', 'dn65'], ['1 ½"', 'dn40'],
  ["1''", 'dn25'], ['1”', 'dn25'], ['DN 25 ve DN 50', 'dn25'], ['DN150 Kollektör (2xDN100+1xDN15)', 'dn150'],
  ['TE 1" x 3/4"', 'dn25'], ['3/4" x 1"', 'dn20'], ['Boru 3/4', 'dn20'], ['Tehlike sınıfı 1\'e uygun', null],
  ['Boru DN25 (1”) Yukarıdaki gibi ancak Çap: DN50', 'dn50'], ['1.8" kalınlık', null], ['olcusuz satir', null], ['', null],
];

async function main() {
  // C1 — kaynak metni
  const a = blok('backend/src/ozellik/eslestirme/utils/build-material-context.ts');
  const o = blok('frontend/ozellik/tablo/excel-grid/build-material-context.ts');
  check('C1a iki dosyada da blok bulundu', a.length > 500 && o.length > 500, `${a.length}/${o.length}`);
  check('C1 kaynak metni BIREBIR (INCH_TO_DN … extractCapFromText)', a === o,
    a === o ? '' : `ilk fark satiri: ${a.split('\n').findIndex((l, i) => l !== o.split('\n')[i]) + 1}`);

  // C2 — gercek kulliyat
  const svc = new ExcelGridService({ brand: { findMany: async () => [] } } as any);
  const FIX = path.join(KOK, 'test-fixtures/e2e');
  const adlar = new Set<string>();
  let dosya = 0;
  for (const d of fs.readdirSync(FIX).filter((x) => /\.xls[xm]$/i.test(x))) {
    const p = await svc.prepare(fs.readFileSync(path.join(FIX, d)), { fixedSchema: true });
    dosya++;
    for (const sh of p.sheets) for (const r of (sh.rowData ?? []) as any[]) { const x = String(r._ad ?? '').trim(); if (x) adlar.add(x); }
  }
  const fark: string[] = [];
  for (const x of adlar) if (on(x) !== arka(x)) fark.push(`${JSON.stringify(x).slice(0, 60)} on=${on(x)} arka=${arka(x)}`);
  // C0 olcut kontrolu: kulliyat dolu ve eski kurallari ayiran adlar iceriyor
  const ayirici = Array.from(adlar).filter((x) => (x.toLowerCase().match(/dn\s*\d+/g) ?? []).length >= 2).length;
  check('C0 kulliyat dolu (13 dosya, 3.000+ ad, coklu DN iceren 50+ ad)', dosya >= 13 && adlar.size >= 3000 && ayirici >= 50,
    `${dosya} dosya · ${adlar.size} ad · coklu DN ${ayirici}`);
  check(`C2 ${adlar.size} gercek adda iki kopya AYNI`, fark.length === 0, fark.slice(0, 3).join(' ; '));

  // C3 — kenar durumlari
  const kFark = KENAR.filter(([x]) => on(x) !== arka(x)).map(([x]) => `${x} on=${on(x)} arka=${arka(x)}`);
  check(`C3a ${KENAR.length} kenar durumda iki kopya AYNI`, kFark.length === 0, kFark.join(' ; '));
  const yanlis = KENAR.filter(([x, b]) => arka(x) !== b).map(([x, b]) => `${x} → ${arka(x)} (beklenen ${b})`);
  check('C3b kenar durumlar P2 kuralinin beklenen degeri', yanlis.length === 0, yanlis.join(' ; '));

  console.log(`\nCAP IKIZI: ${pass} PASS · ${fail} FAIL`);
  process.exitCode = fail > 0 ? 1 : 0;
}

bitmezseKirmizi(main().catch((e) => { console.error(e); process.exitCode = 1; }));
