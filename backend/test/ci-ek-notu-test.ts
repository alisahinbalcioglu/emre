/**
 * CI EK NOTU KAPISI (04.10.2026, koordinator; `npm run test:ci-ek-notu`,
 * DB/AG GEREKTIRMEZ). Regresyon kosucusu GitHub Actions'ta kirmizi nedenini
 * `::error` ek notu olarak yazar (`test/yardimci/ci-ek-notu.ts`); gunluk
 * girissiz 403 iken dusen paketin adi ancak bu notlardan okunur.
 *
 * S · SAF KURALLAR: kacis (@actions/core escapeData/escapeProperty), paket
 *     tavani + TEK ozet, kapaliyken susma, dusus nedeni secimi (gecen
 *     kontrolun adindaki "FAILED" SECILMEZ), kesinti (sinyal/ENOBUFS), kirpma.
 * B · BAGLANTI: `regression-all.ts`in KIRPILMIS kopyasi kosulur — yalniz SUITES
 *     dizisi ve yardimci import yolu degisir, kapi kodu bayt bayt aynidir (B1
 *     14.09 yontemi). Cagrinin silinmesi, ortamin yok sayilmasi, SKIP
 *     defterinin ozetten dusmesi burada kirmizi olur.
 *
 * ⚠ Bu kapi ham `::error` satirini KENDI ciktisina asla basmaz: CI'da GitHub
 * onu gercek ek not sanardi (kosucu dusen paketin FAIL satirlarini aktarir).
 * Ayrintilar `gosterim()` ile etkisizlestirilir.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CiEkNotu, PAKET_TAVANI, dususNedeni, ghOzellik, ghVeri, hataNotu, kesintiNotu,
} from './yardimci/ci-ek-notu';

let passed = 0;
let failed = 0;
const failures: string[] = [];
/** Satir basindaki (bosluk sonrasi dahil) `::` etkisizlesir: GitHub is komutu sanmaz. */
const gosterim = (s: unknown): string => String(s).replace(/^(\s*)::/gm, '$1: :');
function check(ad: string, kosul: boolean, detay: unknown = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    const d = detay === '' ? '' : ` — ${gosterim(detay).slice(0, 300)}`;
    failures.push(`${ad}${d}`);
    console.log(`  ✗ ${ad}${d}`);
  }
}
const topla = (etkin: boolean): { not: CiEkNotu; satirlar: string[] } => {
  const satirlar: string[] = [];
  return { not: new CiEkNotu(etkin, (s) => satirlar.push(s)), satirlar };
};

// ── S · SAF KURALLAR ─────────────────────────────────────────────────────
console.log('\n── S · SAF KURALLAR ──────────────────────────────────────');
check('S1 veri kacisi % \\r \\n', ghVeri('a%b\r\nc') === 'a%25b%0D%0Ac', ghVeri('a%b\r\nc'));
check('S2 ozellik kacisi : , %', ghOzellik('test:x,y%') === 'test%3Ax%2Cy%25', ghOzellik('test:x,y%'));
check('S3 veride : ve , KACISSIZ', ghVeri('a:b,c') === 'a:b,c');
const n = hataNotu('Regresyon: test:x dustu', 'ad — 1 FAIL\nikinci');
check('S4 tam satir bicimi', n === '::error title=Regresyon%3A test%3Ax dustu::ad — 1 FAIL%0Aikinci', n);
check('S5 baslikta ham ":" yok (ilk "::" ayirici kalir)', !n.slice('::error '.length, n.indexOf('::', 2)).includes(':'));

{ const { not, satirlar } = topla(false);
  not.paketDustu('test:a', 'A', '[Z0] (1s)', 'neden');
  not.ozet('0 PASS · 1 FAIL · 0 SKIP', ['test:a'], ['test:b'], []);
  check('S6 GITHUB_ACTIONS yokken HIC satir yok', satirlar.length === 0, satirlar.length); }

{ const { not, satirlar } = topla(true);
  for (let i = 1; i <= 10; i++) not.paketDustu(`test:p${i}`, `P${i}`, '[Z0] (1s)');
  check(`S7 paket notu tavani ${PAKET_TAVANI} (10 dusus → ${PAKET_TAVANI} satir)`, satirlar.length === PAKET_TAVANI, satirlar.length);
  check('S8 paket notu adi ve script\'i tasir', satirlar[0] === '::error title=Regresyon%3A test%3Ap1 dustu::P1 [Z0] (1s)', satirlar[0]);
  not.ozet('0 PASS · 10 FAIL · 0 SKIP', Array.from({ length: 10 }, (_, i) => `test:p${i + 1}`), [], []);
  const ozet = satirlar[satirlar.length - 1];
  check('S9 ozet tavandan SONRA da yazilir (tek satir)', satirlar.length === PAKET_TAVANI + 1, satirlar.length);
  check('S10 ozet dusenlerin HEPSINI sayar', ozet.includes('10 paket dustu') && ozet.includes('test:p9') && ozet.includes('test:p10'), ozet);
  check('S11 ozet basligi sayaci tasir', ozet.startsWith('::error title=Regresyon kirmizi (0 PASS · 10 FAIL · 0 SKIP)::'), ozet); }

{ const { not, satirlar } = topla(true);
  not.ozet('5 PASS · 0 FAIL · 0 SKIP', [], [], []);
  check('S12 yesil kosuda ozet YOK', satirlar.length === 0, satirlar.length);
  not.ozet('5 PASS · 0 FAIL · 1 SKIP', [], ['test:yeni'], ['test:eski']);
  check('S13 yalniz SKIP sapmasi da ozet yazar', satirlar.length === 1
    && satirlar[0].includes('BEKLENMEYEN SKIP: test:yeni') && satirlar[0].includes('DEFTER BAYAT: test:eski'), satirlar[0]); }

const gecen = '  ✓ S6 iyzico orderStatus FAILED → tahsilat yok';
check('S14 neden: dusen assert satiri (gecen kontrolun adindaki FAILED SECILMEZ)',
  dususNedeni(`${gecen}\n  ✗ I2 iptal ama odenmis donem — 403\nOZET: 30 PASS, 4 FAIL`, '') === '✗ I2 iptal ama odenmis donem — 403',
  dususNedeni(`${gecen}\n  ✗ I2 iptal ama odenmis donem — 403\nOZET: 30 PASS, 4 FAIL`, ''));
check('S15 neden: "FAIL:" bicimli dusen satir', dususNedeni(`${gecen}\nFAIL: A0-OLCUT 1.7 MB`, '') === 'FAIL: A0-OLCUT 1.7 MB');
check('S16 neden: dusen satir yoksa SIFIRDAN BUYUK sayac', dususNedeni(`${gecen}\nX: 3 PASS, 0 FAIL\nY: 3 PASS, 2 FAIL`, '') === 'Y: 3 PASS, 2 FAIL');
check('S17 neden: assert yoksa stderr istisnasi (kaynak/yigin satiri degil)',
  dususNedeni(gecen, 'C:\\x.ts:75\n    throw new UnauthorizedException(\'Hesabiniz kapatilmis.\');\n    ^\nUnauthorizedException: Hesabiniz kapatilmis.\n    at hesapKapisi (x.ts:75:11)')
    === 'UnauthorizedException: Hesabiniz kapatilmis.');
check('S18 neden: hicbiri yoksa tanimsiz (gecen satirdaki FAILED dahil)', dususNedeni(gecen, 'uyari: x') === undefined);
check('S19 neden 300 kod noktasina kirpilir, emoji bolunmez', (() => {
  const r = dususNedeni(`FAIL ${'😀'.repeat(400)}`, '') ?? '';
  return Array.from(r).length === 300 && !/[\uD800-\uDBFF]$/.test(r);
})());
check('S20 kesinti: cikis kodu varsa bos', kesintiNotu(1, null) === '');
check('S21 kesinti: sinyal', kesintiNotu(null, 'SIGKILL') === ' sinyal=SIGKILL', kesintiNotu(null, 'SIGKILL'));
const enobufs = Object.assign(new Error('spawnSync npm ENOBUFS'), { code: 'ENOBUFS' });
check('S22 kesinti: spawnSync hatasi (cikti tavani)', kesintiNotu(null, 'SIGTERM', enobufs) === ' sinyal=SIGTERM hata=ENOBUFS',
  kesintiNotu(null, 'SIGTERM', enobufs));

// ── B · BAGLANTI: kirpilmis kosucu kopyasi ───────────────────────────────
console.log('\n── B · BAGLANTI (kirpilmis regression-all kopyasi) ──────');
const asil = readFileSync(join(__dirname, 'regression-all.ts'), 'utf8');
const defterBas = asil.indexOf('const BEKLENEN_SKIP_DB_YOK');
const defter = [...asil.slice(defterBas, asil.indexOf('];', defterBas)).matchAll(/'(test:[^']+)'/g)].map((m) => m[1]);
const suitesBas = asil.indexOf('const SUITES: Suite[] = [');
const suitesSon = asil.indexOf('\n];', suitesBas);
const IMPORT = "from './yardimci/ci-ek-notu'";
check('B-FIXTURE kosucu kaynagi okundu: SUITES sinirlari, SKIP defteri, tek yardimci import',
  suitesBas > 0 && suitesSon > suitesBas && defter.length > 0 && asil.split(IMPORT).length === 2,
  `suites=${suitesBas}/${suitesSon} defter=${defter.length} import=${asil.split(IMPORT).length - 1}`);

const gecici = mkdtempSync(join(tmpdir(), 'ci-ek-notu-'));
const kopya = join(gecici, 'regression-kirpik.ts');
const yardimci = join(__dirname, 'yardimci', 'ci-ek-notu').replace(/\\/g, '/');
const tsNode = require.resolve('ts-node/dist/bin.js');
function kos(suites: string[], githubActions: boolean): { cikis: number | null; notlar: string[]; kaynak: string } {
  const kaynak = (asil.slice(0, suitesBas) + `const SUITES: Suite[] = [\n  ${suites.join(',\n  ')},` + asil.slice(suitesSon))
    .replace(IMPORT, `from '${yardimci}'`);
  writeFileSync(kopya, kaynak);
  const ortam: NodeJS.ProcessEnv = { ...process.env };
  delete ortam.PG_REGRESSION; // DB paketleri SKIP kalsin (defter)
  delete ortam.GITHUB_ACTIONS;
  if (githubActions) ortam.GITHUB_ACTIONS = 'true';
  const r = spawnSync(process.execPath, [tsNode, '-T', '-O', '{"module":"commonjs"}', kopya],
    { cwd: join(__dirname, '..'), encoding: 'utf8', env: ortam, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  const notlar = (r.stdout ?? '').split(/\r?\n/).filter((l) => l.startsWith('::error'));
  if (r.status !== 0 && r.status !== 1) console.log(`  (beklenmedik cikis ${r.status}) ${gosterim((r.stderr ?? '').slice(0, 400))}`);
  return { cikis: r.status, notlar, kaynak };
}
const DB = defter.map((s) => `{ ad: 'DB ${s}', script: '${s}', zincir: 'Z0', db: true }`);
const GECEN = "{ ad: 'Klasor gecer', script: 'test:klasor', zincir: 'Z0' }";
const yok = (i: number) => `{ ad: 'Yok ${i}', script: 'test:ci-ek-notu-yok-${i}', zincir: 'Z9' }`;
const ON = Array.from({ length: 10 }, (_, i) => yok(i + 1));

try {
  const b1 = kos([GECEN, ...DB], true);
  check('B-FIXTURE2 kopya KIRPILDI (gercek SUITES yok, import yerel yola cevrildi)',
    b1.kaynak.includes("script: 'test:klasor'") && !b1.kaynak.includes("script: 'test:govde-dogrulama'")
      && b1.kaynak.includes(`from '${yardimci}'`));
  check('B1 yesil kosu cikis 0', b1.cikis === 0, `cikis=${b1.cikis}`);
  check('B2 yesil kosuda ek not YOK', b1.notlar.length === 0, b1.notlar.join(' | '));

  const b3 = kos([GECEN, ...ON], true);
  const paket = b3.notlar.filter((x) => x.startsWith('::error title=Regresyon%3A '));
  const ozet = b3.notlar.filter((x) => x.startsWith('::error title=Regresyon kirmizi'));
  check('B3 kirmizi kosu cikis 1', b3.cikis === 1, `cikis=${b3.cikis}`);
  check(`B4 ⭐ dusen paket basina not, tavan ${PAKET_TAVANI}`, paket.length === PAKET_TAVANI, paket.length);
  check('B5 ⭐ ilk not dusen paketin SCRIPT\'ini ve ADINI tasir',
    /^::error title=Regresyon%3A test%3Aci-ek-notu-yok-1 dustu::Yok 1 \[Z9\] \(\d+\.\d+s\)/.test(paket[0] ?? ''), paket[0]);
  check('B6 ⭐ TEK ozet, en sonda', ozet.length === 1 && b3.notlar[b3.notlar.length - 1] === ozet[0], b3.notlar.length);
  check('B7 ozet 10 dusenin HEPSINI ve SKIP defteri sapmasini sayar',
    (ozet[0] ?? '').includes('10 paket dustu') && (ozet[0] ?? '').includes('test:ci-ek-notu-yok-10')
      && defter.every((s) => (ozet[0] ?? '').includes(`DEFTER BAYAT: ${s}`)), ozet[0]);
  check('B8 toplam not tavan + 1 (adim basina 10 sinirinin altinda)', b3.notlar.length === PAKET_TAVANI + 1, b3.notlar.length);

  const b9 = kos([GECEN, ...ON], false);
  check('B9 GITHUB_ACTIONS yokken ek not YOK (yerel cikti degismez)', b9.notlar.length === 0, b9.notlar.length);
  check('B10 kapi davranisi degismedi: yine cikis 1', b9.cikis === 1, `cikis=${b9.cikis}`);

  // Ciktisi spawnSync tavanini (1 MiB) asan paket: kosucu onu cikis kodsuz
  // oldurur (ENOBUFS) — not KESINTIYI tasimali, yoksa "neden yok" der.
  const tasan = `ci-ek-notu-yok-tasan || node -e "process.stdout.write('x'.repeat(2e6))"`;
  const b11 = kos([GECEN, ...DB, `{ ad: 'Tasan cikti', script: ${JSON.stringify(tasan)}, zincir: 'Z9' }`], true);
  const tasanNot = b11.notlar.find((x) => x.includes('Tasan cikti'));
  check('B11 ⭐ cikti tavanini asan paketin notu kesintiyi tasir (hata=ENOBUFS)',
    b11.cikis === 1 && /hata=ENOBUFS/.test(tasanNot ?? ''), `cikis=${b11.cikis} not=${tasanNot}`);
} finally {
  rmSync(gecici, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(64)}`);
console.log(`CI EK NOTU: ${passed} PASS, ${failed} FAIL`);
console.log('='.repeat(64));
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log(`  · ${f}`));
}
if (failed > 0) process.exitCode = 1;
