/**
 * PK10 — ARTEFAKT DAMGASI (pano kalem 44)
 *
 * SORUN: `e2e-artifacts/golden/` her kosumda UZERINE YAZILIYORDU. 31.07'de
 * 13 testlik kosumun `playwright-report.json` dokumu, sonraki TEK TESTLIK
 * `pu4` kosumuyla silindi. Bedeli somut: ° isaretini kaldiracak olan
 * "kriter bazinda PASS/FAIL" sorusu, kosum sonucuyla degil KAYNAK ANALIZIYLE
 * cevaplanmak zorunda kaldi — yani ° hala duruyordu.
 *
 * COZUM: her kosum kendi dizinine yazar:
 *     e2e-artifacts/golden/<ISO-tarih>-<kisa-hash>/
 * ve en son kosum `e2e-artifacts/golden/latest` ile gosterilir.
 *
 * DAMGA KOSUM BASINA TEKTIR. Playwright spec'leri AYRI islemlerde kosar;
 * her biri kendi zaman damgasini uretse artefaktlar dagilirdi. Bu yuzden
 * damga `E2E_DAMGA` ortam degiskeninde tasinir: `global-setup.mjs` (ana
 * islem, worker'lardan ONCE kosar) bir kez uretir, worker'lar miras alir.
 * `run.mjs` de kendi adimlari icin ayni degiskeni kullanir.
 *
 * Damgali dizinler git-ignore'lu KALIR — mesele git degil, ayni oturum
 * icinde uzerine yazilmamasi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ⚠ `import.meta.url` KULLANILMAZ. Playwright config'i bu modulu kendi TS
// yukleyicisiyle alir ve CJS'e cevirir; orada `import.meta` SOZDIZIMI HATASI
// verir ("Cannot use 'import.meta' outside a module") ve TUM kosum baslamaz.
// Bu yuzden kok, calisma dizininden turetilir: Playwright cwd'yi config
// dizinine (frontend/) kurar, `run.mjs` de alt surecleri orada calistirir.
const FE_KOK = (() => {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'test', 'e2e-golden'))) return cwd;
  if (fs.existsSync(path.join(cwd, 'frontend', 'test', 'e2e-golden'))) return path.join(cwd, 'frontend');
  return cwd;
})();
const GOLDEN_KOK = path.resolve(FE_KOK, 'e2e-artifacts/golden');
exports.GOLDEN_KOK = GOLDEN_KOK;

/** `2026-07-31T18-42-05-07213d4` — dosya sisteminde guvenli ISO + kisa hash. */
function damgaUret() {
  const t = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  let hash = 'nogit';
  try {
    hash = execSync('git rev-parse --short=7 HEAD', {
      cwd: FE_KOK, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* git yoksa damga yine benzersiz — zaman damgasi tasiyor */ }
  return `${t}-${hash}`;
}

/** Bu KOSUMUN damgasi. Yoksa uretir ve ortama yazar (ilk cagiran sabitler). */
function damga() {
  if (!process.env.E2E_DAMGA) process.env.E2E_DAMGA = damgaUret();
  return process.env.E2E_DAMGA;
}

/** Bu kosumun artefakt koku — `golden/<damga>/`. Olusturulur. */
function artefaktKok() {
  const d = path.join(GOLDEN_KOK, damga());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/**
 * `latest` isaretcisi. Windows'ta symlink YONETICI hakki ister; junction
 * denenir, olmazsa `latest` adinda DUZ METIN dosyasi yazilir (icinde damga).
 * Ikisi de "en son kosum hangisi" sorusunu cevaplar — kritik olan budur.
 */
function latestIsaretle(kok = artefaktKok()) {
  const bag = path.join(GOLDEN_KOK, 'latest');
  const ad = path.basename(kok);
  try {
    if (fs.existsSync(bag) || fs.lstatSync(bag, { throwIfNoEntry: false })) {
      fs.rmSync(bag, { recursive: true, force: true });
    }
  } catch { /* yoktu */ }
  try {
    fs.symlinkSync(kok, bag, 'junction');
    return { tip: 'junction', hedef: ad };
  } catch {
    fs.writeFileSync(`${bag}.txt`, `${ad}\n`, 'utf-8');
    return { tip: 'metin', hedef: ad };
  }
}

// CJS export'lari ISIMLI yazilir (`exports.x = ...`): Node'un cjs-module-lexer'i
// bu kalibi tanir, boylece ESM tarafi (`verify.mjs` · `run.mjs` ·
// `global-setup.mjs`) da `import { damga } from './artefakt-dizini.cjs'`
// yazabilir. `module.exports = {...}` kalibi bunu SAGLAMAZ.
//
// NEDEN .cjs: Playwright, config'i ve spec'leri kendi TS yukleyicisiyle CJS'e
// cevirir. ESM (.mjs) yardimci ordan cagrilinca once `import.meta` sozdizimi
// hatasi, sonra "does not provide an export named" interop hatasi verdi ve
// KOSUM HIC BASLAMADI. .cjs her iki taraftan da sorunsuz yuklenir.
exports.damgaUret = damgaUret;
exports.damga = damga;
exports.artefaktKok = artefaktKok;
exports.latestIsaretle = latestIsaretle;
