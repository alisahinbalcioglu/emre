// E2E ALTIN YOL global setup — dev JWT uret (backend/.env JWT_SECRET ile),
// yigin sagligini dogrula. Sifre ile UI login YAPILMAZ: yerel test hesabinin
// plaintext sifresi yok; auth bootstrap localStorage token enjeksiyonu
// (ortam reçetesi 22.07). Dosya akisinin tamami (yukle/fiyatla/indir)
// GERCEK tarayicidan kosulur — API kisayolu yok.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// PK10: damgayi ERKEN sabitle — global-setup ANA iSLEMDE, worker'lardan ONCE
// kosar; `damga()` degeri `process.env.E2E_DAMGA`ya yazar ve worker'lar miras
// alir. Boylece tum spec'ler AYNI dizine yazar.
import { damga, artefaktKok } from './artefakt-dizini.cjs';
// PK11: dogrudan `npx playwright test` ile kosulursa run.mjs'in kapisi
// atlanir — kapi BURADA da calisir. globalSetup'ta atilan hata TUM kosumu
// durdurur, yani "reddetme" gercekten reddetmedir.
import { kapiyiCalistir } from './surum-kapisi.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '../../backend');
const require = createRequire(path.join(BACKEND, 'package.json'));

export default async function globalSetup() {
  // 0) SURUM KAPISI (PK11) — her seyden once
  const kapi = await kapiyiCalistir(path.resolve(__dirname, '..'));
  console.log(kapi.rapor);
  if (!kapi.gecti) {
    // ⚠ HATA YUTULMAZ (PK11b): burada bir try/catch koymak kapinin tamamini
    // degersiz kilar. Atilan hata Playwright'i baslatmadan durdurur.
    throw new Error('SURUM KAPISI: kosum reddedildi — uyumsuz surum, olcum yalan uretir.');
  }

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
  console.log(`[golden-setup] artefakt damgasi: ${damga()}`);
  artefaktKok();
  fs.writeFileSync(path.join(__dirname, '.auth.json'), JSON.stringify({ token, user: USER }, null, 2));

  // 2) Yigin sagligi — backend + frontend ayakta olmali
  //
  // ⚠ ECONNRESET SIGORTASI (02.08.2026, PK13 sirasinda OLCULDU): surum
  // kapisi (PK11, yukarida) ayni adreslere `AbortSignal.timeout(5000)` ile
  // fetch atiyor; o istekler undici baglanti HAVUZUNDA yari-olu soket
  // birakabiliyor ve buradaki ilk fetch ayni soketi yeniden kullaninca
  // `fetch failed / cause: ECONNRESET` aliyor. Deterministik uretildi:
  // kapi ✅ dedigi halde bir sonraki fetch ayni surecte ECONNRESET dustu;
  // AYNI kabukta taze node sureciyle ayni adres 200 dondu — yani sunucu
  // degil, HAVUZ sucluydu. Tek yeniden deneme taze soketle acilir ve
  // gecer. 3 deneme siniri: sunucu GERCEKTEN kapaliysa yine kirmizi.
  for (const [ad, url] of [
    ['backend', 'http://localhost:3001/api/health'],
    ['frontend', 'http://localhost:3005/'],
  ]) {
    let sonHata = null;
    let gecti = false;
    for (let deneme = 1; deneme <= 3 && !gecti; deneme++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        gecti = true;
      } catch (e) {
        sonHata = e;
        console.log(`[golden-setup] ${ad} saglik denemesi ${deneme}/3 basarisiz: ${e.cause?.code ?? e.message}`);
        await new Promise((coz) => setTimeout(coz, 500));
      }
    }
    if (!gecti) {
      throw new Error(`${ad} ayakta degil (${url}): ${sonHata.message}\nOnce yerel yigini baslatin (bkz playwright.golden.config.ts).`);
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
