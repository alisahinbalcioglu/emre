// E2E ALTIN YOL global setup — dev JWT uret (backend/.env JWT_SECRET ile),
// yigin sagligini dogrula. Sifre ile UI login YAPILMAZ: yerel test hesabinin
// plaintext sifresi yok; auth bootstrap localStorage token enjeksiyonu
// (ortam reçetesi 22.07). Dosya akisinin tamami (yukle/fiyatla/indir)
// GERCEK tarayicidan kosulur — API kisayolu yok.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '../../backend');
const require = createRequire(path.join(BACKEND, 'package.json'));

export default async function globalSetup() {
  // 1) JWT
  const env = fs.readFileSync(path.join(BACKEND, '.env'), 'utf8');
  const m = env.match(/JWT_SECRET\s*=\s*"?([^"\r\n]+)"?/);
  if (!m) throw new Error('backend/.env icinde JWT_SECRET bulunamadi');
  const jwt = require('jsonwebtoken');
  const USER = {
    id: 'e0f3cd46-28cf-42b1-b6c3-73738a97cac8',
    email: 'basaran.emre1@hotmail.com',
    role: 'user',
    tier: 'pro',
  };
  const token = jwt.sign({ sub: USER.id, email: USER.email, role: USER.role }, m[1], { expiresIn: '24h' });
  fs.mkdirSync(path.join(__dirname, '../e2e-artifacts/golden'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.auth.json'), JSON.stringify({ token, user: USER }, null, 2));

  // 2) Yigin sagligi — backend + frontend ayakta olmali
  for (const [ad, url] of [
    ['backend', 'http://localhost:3001/api/health'],
    ['frontend', 'http://localhost:3005/'],
  ]) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      throw new Error(`${ad} ayakta degil (${url}): ${e.message}\nOnce yerel yigini baslatin (bkz playwright.golden.config.ts).`);
    }
  }

  // 3) Onceki kosumun tekliflerini temizle (determinism — yalniz fixture
  //    adiyla birebir eslesen basliklar silinir, kullanicinin baska verisine
  //    dokunulmaz). Localhost test hesabi (gorev §0.1).
  const fixtures = fs.readdirSync(path.resolve(__dirname, '../../test-fixtures/e2e'))
    .filter((f) => /\.xls[xm]$/i.test(f))
    .map((f) => f.replace(/\.[^.]+$/, ''));
  const H = { Authorization: `Bearer ${token}` };
  const list = await (await fetch('http://localhost:3001/api/quotes', { headers: H })).json();
  const quotes = Array.isArray(list) ? list : list?.data ?? [];
  let silinen = 0;
  for (const q of quotes) {
    if (fixtures.includes(q.title)) {
      const del = await fetch(`http://localhost:3001/api/quotes/${q.id}`, { method: 'DELETE', headers: H });
      if (del.ok) silinen++;
    }
  }
  if (silinen) console.log(`[golden-setup] onceki kosumdan ${silinen} teklif temizlendi`);
}
