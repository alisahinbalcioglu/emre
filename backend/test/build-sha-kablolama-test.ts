/**
 * PK2 — `/api/health` GERCEK COMMIT HASH DONER  (`npm run test:build-sha`)
 *
 * Iki turdur ayni soru soruluyor: "canlida hangi surum var?" Cevap her seferinde
 * konsola girip `git log -1` okumakla veriliyor — 31.07 turunda o bile
 * yapilamadi ve 4 commit "sozlu teyide" kaldi (pano kalem 34).
 *
 * `health.controller.ts` zaten `process.env.BUILD_SHA` okuyor; EKSIK OLAN
 * imaja hash'i GECIREN kablolamaydi. Bu suite o kabloyu kilitler:
 *   1. backend/Dockerfile        → ARG + ENV BUILD_SHA
 *   2. docker-compose.yml        → backend.build.args.BUILD_SHA
 *   3. scripts/deploy.sh         → hash'i git'ten okur ve export eder
 *   4. health.controller.ts      → BUILD_SHA'yi okur (regresyon korumasi)
 *
 * NEDEN DEPLOY SCRIPTI: Hetzner web konsolunda TR klavye `$` `>` `|` `_`
 * karakterlerini YAZAMIYOR (27.07 + 31.07'de iki kez yasandi). Yani kullanici
 * `BUILD_SHA=$(git rev-parse HEAD)` yazamaz. Tek cozum: butun ozel karakterler
 * repodaki scriptin ICINDE olsun, kullanici yalnizca `bash scripts/deploy.sh`
 * yazsin — bu satirda ozel karakter YOK.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import * as fs from 'fs';
import * as path from 'path';

const kok = path.resolve(__dirname, '..');
const repo = path.resolve(kok, '..');
const oku = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '');

const hatalar: string[] = [];
const gecen: string[] = [];
const sina = (ad: string, kosul: boolean, mesaj: string) => {
  if (kosul) gecen.push(ad);
  else hatalar.push(`${ad}: ${mesaj}`);
};

const dockerfile = oku(path.join(kok, 'Dockerfile'));
const compose = oku(path.join(repo, 'docker-compose.yml'));
const deploy = oku(path.join(repo, 'scripts', 'deploy.sh'));
const health = oku(path.join(kok, 'src', 'health.controller.ts'));

// ── PK2-1: Dockerfile build ARG'i alir ve ENV'e yazar ────────────────────────
sina('PK2-1a Dockerfile ARG', /^\s*ARG\s+BUILD_SHA/m.test(dockerfile),
  'backend/Dockerfile icinde `ARG BUILD_SHA` yok — imaj hash bilgisini ALAMAZ.');
sina('PK2-1b Dockerfile ENV', /ENV\s+BUILD_SHA=\$\{?BUILD_SHA\}?/.test(dockerfile),
  'backend/Dockerfile icinde `ENV BUILD_SHA=$BUILD_SHA` yok — ARG calisma zamanina GECMEZ.');

// ── PK2-2: compose ARG'i backend imajina gecirir ─────────────────────────────
{
  const backendBlok = compose.split(/^\s{2}backend:/m)[1]?.split(/^\s{2}\w[\w-]*:/m)[0] ?? '';
  sina('PK2-2 compose args', /args:[\s\S]*BUILD_SHA:\s*\$\{BUILD_SHA/.test(backendBlok),
    'docker-compose.yml backend servisinde `build.args.BUILD_SHA` yok — ARG hic doldurulmaz.');
}

// ── PK2-3: deploy scripti hash'i git'ten okur ────────────────────────────────
sina('PK2-3a deploy.sh var', deploy.length > 0,
  'scripts/deploy.sh YOK — kullanici konsolda `$` yazamadigi icin hash elle gecirilemez.');
sina('PK2-3b deploy.sh hash okur', /git\s+rev-parse/.test(deploy) && /BUILD_SHA/.test(deploy),
  'scripts/deploy.sh `git rev-parse` ile BUILD_SHA uretmiyor.');
sina('PK2-3c deploy.sh export eder', /export\s+BUILD_SHA/.test(deploy),
  'scripts/deploy.sh BUILD_SHA export etmiyor — `docker compose build` degiskeni GORMEZ.');

// ── PK2-4: controller regresyon korumasi ─────────────────────────────────────
sina('PK2-4 controller BUILD_SHA okur', /process\.env\.BUILD_SHA/.test(health),
  'health.controller.ts artik BUILD_SHA okumuyor — kablo kopmus.');

// ── PK2-5: hash "local" olmamali (yalniz env varsa) ──────────────────────────
// Yerelde env yok → "local" DOGRU cevaptir. Bu yuzden burada davranis sinanir:
// env verilince controller onu dondurmeli.
{
  const eski = process.env.BUILD_SHA;
  process.env.BUILD_SHA = 'deadbeefcafe1234';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { HealthController } = require('../src/health.controller');
  const cikti = new HealthController().check();
  if (eski === undefined) delete process.env.BUILD_SHA; else process.env.BUILD_SHA = eski;
  sina('PK2-5 env → yanit', cikti.build_sha === 'deadbeefcafe1234',
    `BUILD_SHA env verildi ama /health "${cikti.build_sha}" dondu.`);
}

console.log('── PK2 BUILD_SHA KABLOLAMASI ──');
for (const g of gecen) console.log(`  ✅ ${g}`);
if (hatalar.length) {
  for (const h of hatalar) console.log(`  ❌ ${h}`);
  console.log(`\nPK2 FAIL — ${hatalar.length}/${gecen.length + hatalar.length} sart karsilanmadi.`);
  process.exit(1);
}
console.log(`\nPK2 PASS — ${gecen.length} sartin tamami karsilandi.`);
