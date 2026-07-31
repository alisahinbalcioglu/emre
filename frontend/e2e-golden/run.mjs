/* E2E ALTIN YOL orkestratoru: playwright kosumu + programatik dogrulama.
 * Playwright kismi FAIL olsa bile verify calisir (matris her kosulda cikar);
 * cikis kodu = ikisinden biri kirmiziysa 1. Kosum: npm run test:e2e-golden */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// PK10 (pano kalem 44): damga BURADA sabitlenir ve iki alt surece de ayni
// deger gecer — Playwright ile verify AYNI dizini gorur. Sonda `latest`
// isaretcisi guncellenir; eski kosumlarin dokumu SILINMEZ.
import { damga, artefaktKok, latestIsaretle } from './artefakt-dizini.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FE = path.resolve(__dirname, '..');
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: FE, stdio: 'inherit', shell: true }).status ?? 1;

const DAMGA = damga();
const KOK = artefaktKok();
console.log(`── 0/3 Artefakt damgasi: ${DAMGA}`);
console.log(`   dizin: ${KOK}`);
console.log('── 1/3 Playwright altin yol kosumu ──');
const pw = sh('npx', ['playwright', 'test', '-c', 'playwright.golden.config.ts']);
console.log(`\n── 2/2 Programatik dogrulama (C1-C11) ──`);
const vf = sh('node', [path.join('e2e-golden', 'verify.mjs')]);
const bag = latestIsaretle(KOK);
console.log(`
── 3/3 latest -> ${bag.hedef} (${bag.tip})`);
console.log(`   Bu kosumun dokumu KALICI: ${KOK}`);
process.exit(pw !== 0 || vf !== 0 ? 1 : 0);
