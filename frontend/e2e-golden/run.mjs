/* E2E ALTIN YOL orkestratoru: playwright kosumu + programatik dogrulama.
 * Playwright kismi FAIL olsa bile verify calisir (matris her kosulda cikar);
 * cikis kodu = ikisinden biri kirmiziysa 1. Kosum: npm run test:e2e-golden */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// PK10 (pano kalem 44): damga BURADA sabitlenir ve iki alt surece de ayni
// deger gecer — Playwright ile verify AYNI dizini gorur. Sonda `latest`
// isaretcisi guncellenir; eski kosumlarin dokumu SILINMEZ.
import { damgaUret, artefaktKok, latestIsaretle } from './artefakt-dizini.cjs';
// PK11: SURUM KAPISI — kosumdan ONCE. "backend'i yeniden derledim" bir
// CIKARIMDIR ve 31.07'de iki kez yanlis cikti. Kapi, kosumun gecerliligini
// kosumun KENDI ciktisiyla kanitlar.
import { kapiyiCalistir } from './surum-kapisi.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FE = path.resolve(__dirname, '..');
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: FE, stdio: 'inherit', shell: true }).status ?? 1;

console.log('── 0/4 Surum kapisi (PK11) ──');
const kapi = await kapiyiCalistir(FE);
console.log(kapi.rapor);
if (!kapi.gecti) {
  // PK11a: cikis kodu 0 VE 2 DISINDA. 2 "on kosul yok/SKIP" demektir ve
  // SKIP'in yanindan gecilebilir; surum uyusmazligi gecilecek bir sey degil
  // — YALAN URETECEK bir kosumdur.
  console.log('\n⛔ Kosum baslatilmadi (surum uyusmazligi).');
  process.exit(3);
}
// Damga kapidan SONRA sabitlenir ki `-KIRLI` / `-GECERSIZ` ekleri dizin adina
// girsin. Alt surecler (Playwright config + verify) bunu ortamdan miras alir.
process.env.E2E_DAMGA = damgaUret() + kapi.ek;
const DAMGA = process.env.E2E_DAMGA;
const KOK = artefaktKok();
console.log(`
── 1/4 Artefakt damgasi: ${DAMGA}`);
console.log(`   dizin: ${KOK}`);
console.log('── 2/4 Playwright altin yol kosumu ──');
const pw = sh('npx', ['playwright', 'test', '-c', 'playwright.golden.config.ts']);
console.log(`\n── 2/2 Programatik dogrulama (C1-C11) ──`);
const vf = sh('node', [path.join('e2e-golden', 'verify.mjs')]);
const bag = latestIsaretle(KOK);
console.log(`
── 4/4 latest -> ${bag.hedef} (${bag.tip})`);
console.log(`   Bu kosumun dokumu KALICI: ${KOK}`);
process.exit(pw !== 0 || vf !== 0 ? 1 : 0);
