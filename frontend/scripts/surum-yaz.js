/**
 * PK11 — FE surum damgasi, DERLEME aninda gomulur.
 *
 * `public/surum.json` uretilir; `next build` bunu statik varlık olarak servis
 * eder. Kapi `http://localhost:3005/surum.json` ile okur.
 *
 * NEDEN public/: Next.js `public/` icerigini BUILD ciktisiyla birlikte tasir.
 * Yani dosya, o derlemenin parcasidir — sunucu yeniden baslatilsa da eski
 * derleme servis ediliyorsa ESKI sha doner. Istenen tam olarak budur:
 * 31.07'de `next start` 16:29 derlemesini servis ederken kaynak 18:33'tu ve
 * hicbir sey bunu soylemiyordu.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const kok = path.resolve(__dirname, '..');
const calistir = (cmd) => {
  try {
    return execSync(cmd, { cwd: kok, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
};

const sha = process.env.BUILD_SHA || calistir('git rev-parse --short=12 HEAD') || 'local';
const kirli = calistir('git status --porcelain').length > 0;

const hedef = path.join(kok, 'public');
fs.mkdirSync(hedef, { recursive: true });
fs.writeFileSync(path.join(hedef, 'surum.json'),
  JSON.stringify({ build_sha: sha, tree_dirty: kirli, build_time: new Date().toISOString() }, null, 2),
  'utf-8');
console.log(`[surum-yaz] FE BUILD_SHA=${sha} kirli=${kirli}`);
