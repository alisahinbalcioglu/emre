/* E2E ALTIN YOL orkestratoru: playwright kosumu + programatik dogrulama.
 * Playwright kismi FAIL olsa bile verify calisir (matris her kosulda cikar);
 * cikis kodu = ikisinden biri kirmiziysa 1. Kosum: npm run test:e2e-golden */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FE = path.resolve(__dirname, '..');
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: FE, stdio: 'inherit', shell: true }).status ?? 1;

console.log('── 1/2 Playwright altin yol kosumu ──');
const pw = sh('npx', ['playwright', 'test', '-c', 'playwright.golden.config.ts']);
console.log(`\n── 2/2 Programatik dogrulama (C1-C10) ──`);
const vf = sh('node', [path.join('e2e-golden', 'verify.mjs')]);
process.exit(pw !== 0 || vf !== 0 ? 1 : 0);
