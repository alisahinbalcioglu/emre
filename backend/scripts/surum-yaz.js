/**
 * PK11 — SURUM DAMGASINI DERLEME ANINDA GOM
 *
 * Kapinin ise yaramasi tek sarta bagli: sha ARTEFAKTIN ICINDE olmali.
 * Backend `/api/health` istegi geldiginde `git rev-parse HEAD` calistirsaydi
 * kapi HER ZAMAN gecerdi — calisan surec eski koddan olsa bile agac ilerlemis
 * olur ve iki taraf ayni sha'yi soylerdi. 31.07'de olan tam buydu: 18 saatlik
 * surec, ilerlemis bir agacin yaninda sessizce cevap verdi.
 *
 * Bu script `prebuild`ta kosar ve `src/surum.generated.ts` uretir; dosya
 * derlemeye girer, yani sha DERLENEN KODA yapisir.
 *
 * Uretilen dosya git-ignore'ludur: her commit'te degisip agaci kirletmesi
 * istenmez. Yoklugunda `src/surum.ts` "local" der ve KAPI BUNU REDDEDER —
 * sessizce gecmez.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const kok = path.resolve(__dirname, '..');
let sha = process.env.BUILD_SHA || '';
if (!sha) {
  try {
    sha = execSync('git rev-parse --short=12 HEAD', {
      cwd: kok, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    sha = '';
  }
}
let kirli = false;
try {
  kirli = execSync('git status --porcelain', {
    cwd: kok, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim().length > 0;
} catch { /* git yok */ }

const hedef = path.join(kok, 'src', 'surum.generated.ts');
fs.writeFileSync(hedef,
  `// URETILMIS DOSYA — elle duzenlemeyin. Kaynak: scripts/surum-yaz.js (PK11)\n`
  + `export const BUILD_SHA = ${JSON.stringify(sha || 'local')};\n`
  + `export const AGAC_KIRLI = ${kirli};\n`
  + `export const DERLEME_ZAMANI = ${JSON.stringify(new Date().toISOString())};\n`,
  'utf-8');
console.log(`[surum-yaz] BUILD_SHA=${sha || 'local'} kirli=${kirli}`);
