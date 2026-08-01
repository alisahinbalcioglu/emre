/**
 * PK3-REPO — FIXTURE KAPSAMA KAPISI  (`npm run test:pk3-repo`)
 *
 * PANO KALEM 36'NIN TA KENDISI: fixture'lar `.gitignore` yuzunden repoda
 * degildi; `test:kd11`, `test:kd12` ve `verify.mjs` CI'da "ON KOSUL YOK"
 * deyip SESSIZCE atlaniyordu. "Regresyon yesil" cumlesi o suite'leri
 * KAPSAMIYORDU — yani CI dekoratifti. `.gitignore` bir gun tekrar
 * kapatilirsa (ya da yeni bir fixture eklenip commit'lenmezse) ayni
 * sessizlik geri gelir. Bu kapi onu KIRMIZI yapar.
 *
 * ⚠ NEDEN AYRI PAKET: bu olcum `git`e ihtiyac duyar, `test:pk3` (kimlik
 * haritasi sozlesmesi) duymaz. Ikisi ayni dosyadayken, git'siz bir dizinde
 * (`git archive` ile cikarilmis CI taklidi) `git ls-files` firlatti ve
 * haritanin 15 assert'ini de birlikte goturdu. Iki ayri on kosul → iki ayri
 * paket; birinin on kosulu yoksa digeri kosmaya devam eder.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · 2 = ON KOSUL YOK · diger = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const KOK = path.resolve(__dirname, '../..');
const DIZINLER = ['test-fixtures/e2e', 'backend/test/fixtures'];

/** NFC esitleme: Windows/macOS readdir NFD verebilir, git NFC tutar. */
const nfc = (s: string) => s.normalize('NFC');

function izlenenler(): string[] | null {
  try {
    // ⚠ `-z` ZORUNLU: `git ls-files` varsayilan olarak ASCII-disi yollari
    // kacis dizisiyle yazar ("in\305\237ai"); duz karsilastirma Turkce adli
    // 7 dosyayi "izlenmiyor" saniyordu (olculdu). `-z` ham UTF-8 verir.
    return execFileSync('git', ['ls-files', '-z', ...DIZINLER],
      { cwd: KOK, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean).map(nfc);
  } catch {
    return null;
  }
}

console.log('── PK3-REPO: FIXTURE KAPSAMA KAPISI ──\n');

const izlenen = izlenenler();
if (izlenen === null) {
  console.log('ON KOSUL YOK — git deposu degil (veya git yok); izlenme olculemez.');
  process.exit(2);
}

const beklenen: string[] = [];
for (const rel of DIZINLER) {
  const d = path.join(KOK, rel);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (/\.(xlsx|xlsm)$/i.test(f)) beklenen.push(nfc(`${rel}/${f}`));
}

if (beklenen.length === 0) {
  console.log('ON KOSUL YOK — diskte hic fixture yok.');
  process.exit(2);
}

const kume = new Set(izlenen);
const disarida = beklenen.filter((f) => !kume.has(f));

for (const rel of DIZINLER) {
  const n = beklenen.filter((f) => f.startsWith(rel + '/')).length;
  const d = disarida.filter((f) => f.startsWith(rel + '/')).length;
  console.log(`  ${d === 0 ? '✅' : '❌'} ${rel}: ${n - d}/${n} izleniyor`);
}

if (disarida.length) {
  console.log('\n  İZLENMEYEN DOSYALAR (CI bunları göremez → bağlı testler sessizce atlanır):');
  disarida.forEach((f) => console.log(`    · ${f}`));
  console.log(`\nSONUC: 0 PASS, 1 FAIL — ${disarida.length}/${beklenen.length} fixture repoda değil.`);
  process.exit(1);
}

console.log(`\nSONUC: 1 PASS, 0 FAIL — ${beklenen.length} fixture'ın tamamı repoda.`);
