/**
 * PK11 — SURUM KAPISI (pano kalem 45)
 *
 * Kosum baslamadan once UC surumu karsilastirir:
 *   1. Calisan agacin HEAD'i          (git)
 *   2. FE derlemesinin sha'si          (http://localhost:3005/surum.json)
 *   3. Backend'in sha'si               (http://localhost:3001/api/health)
 *
 * NEDEN VAR: 31.07'de AYNI GUN IKI KEZ uyumsuz katman olculdu.
 *   · Once FE derlemesi PK8 duzeltmesinden 2 saat eskiydi -> GS6b yalanci kirmizi.
 *   · Sonra taze FE + 18 SAATLIK backend -> 14 FAIL, ortam hatasi urun hatasi
 *     sanilacakti. Code'un baslattigi backend MODULE_NOT_FOUND ile oldu, ESKI
 *     surec portu tutmaya devam etti, sistem SESSIZCE cevap verdi.
 * Bu, I7'nin (sessiz bos yasagi) surec seviyesindeki hali. Kapi onu kapatir.
 *
 * KRITER HARITASI:
 *   PK11a  uc sha uyusmuyorsa kosum BASLAMAZ (cikis kodu 0 ve 2 DISINDA)
 *   PK11b  backend cevap vermiyorsa da BASLAMAZ (hatayi yutan catch YOK)
 *   PK11c  BAGIMSIZ ikinci kontrol: backend surecinin baslangici, dist'in
 *          mtime'indan eskiyse RED. Bugunku hatayi sha olmadan da yakalardi.
 *   PK11d  agac kirliyse RED DEGIL — damgali dizin `-KIRLI` eki alir
 *   PK11e  SURUM_KAPISI=kapali ile gecilebilir AMA dizin `-GECERSIZ` eki alir
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const BE = 'http://localhost:3001/api/health';
const FE = 'http://localhost:3005/surum.json';

const kisalt = (s) => String(s ?? '').slice(0, 12);

function agacSurumu(kok) {
  const sha = execSync('git rev-parse --short=12 HEAD', {
    cwd: kok, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const kirli = execSync('git status --porcelain', {
    cwd: kok, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim().length > 0;
  return { sha, kirli };
}

/** ⚠ HATA YUTULMAZ (PK11b). Cevap yoksa `hata` alani dolar ve kapi reddeder. */
async function getir(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { hata: `HTTP ${r.status}` };
    return { veri: await r.json() };
  } catch (e) {
    return { hata: e.message || String(e) };
  }
}

/** PK11c — backend sureci, derlenmis dist'ten SONRA mi basladi? */
function surecTazeMi(backendKok) {
  const main = path.join(backendKok, 'dist', 'main.js');
  if (!fs.existsSync(main)) return { sonuc: 'BILINMIYOR', not: 'dist/main.js yok' };
  const distZaman = fs.statSync(main).mtime;
  let baslangic = null;
  try {
    // Windows: 3001'i dinleyen surecin baslangic zamani
    const ps = 'powershell -NoProfile -Command "'
      + '$c=Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue;'
      + 'if($c){$p=Get-Process -Id $c[0].OwningProcess -ErrorAction SilentlyContinue;'
      + 'if($p){$p.StartTime.ToString(\'o\')}}"';
    const cikti = execSync(ps, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (cikti) baslangic = new Date(cikti);
  } catch { /* PowerShell yoksa asagida BILINMIYOR doner */ }
  if (!baslangic || isNaN(baslangic.getTime())) {
    return { sonuc: 'BILINMIYOR', not: 'surec baslangic zamani okunamadi' };
  }
  return {
    sonuc: baslangic >= distZaman ? 'TAZE' : 'BAYAT',
    not: `surec=${baslangic.toISOString()} dist=${distZaman.toISOString()}`,
  };
}

/**
 * @returns {Promise<{gecti:boolean, ek:string, rapor:string}>}
 *   `ek` damgali dizin adina eklenecek sonek ('' | '-KIRLI' | '-GECERSIZ' ...)
 */
async function kapiyiCalistir(feKok) {
  const repoKok = path.resolve(feKok, '..');
  const backendKok = path.join(repoKok, 'backend');
  const kapali = String(process.env.SURUM_KAPISI ?? '').toLowerCase() === 'kapali';

  const agac = agacSurumu(repoKok);
  const be = await getir(BE);
  const fe = await getir(FE);
  const taze = surecTazeMi(backendKok);

  const beSha = kisalt(be.veri?.build_sha);
  const feSha = kisalt(fe.veri?.build_sha);
  const agacSha = kisalt(agac.sha);

  const satirlar = [];
  satirlar.push('── SURUM KAPISI (PK11) ──');
  satirlar.push(`  agac    HEAD : ${agacSha}${agac.kirli ? '  (agac KIRLI)' : ''}`);
  satirlar.push(`  frontend     : ${fe.hata ? `OKUNAMADI (${fe.hata})` : feSha}`);
  satirlar.push(`  backend      : ${be.hata ? `OKUNAMADI (${be.hata})` : beSha}`);
  satirlar.push(`  surec tazeligi: ${taze.sonuc} — ${taze.not}`);

  const sorunlar = [];
  if (be.hata) sorunlar.push(`PK11b: backend /api/health cevap vermiyor — ${be.hata}`);
  if (fe.hata) sorunlar.push(`PK11b: frontend /surum.json cevap vermiyor — ${fe.hata}`);
  if (!be.hata && beSha === 'local') sorunlar.push('PK11a: backend "local" diyor — sha derlemeye GOMULMEMIS, kapi kor olurdu');
  if (!fe.hata && feSha === 'local') sorunlar.push('PK11a: frontend "local" diyor — sha derlemeye GOMULMEMIS');
  if (!be.hata && beSha !== 'local' && beSha !== agacSha) sorunlar.push(`PK11a: backend ${beSha} != agac ${agacSha}`);
  if (!fe.hata && feSha !== 'local' && feSha !== agacSha) sorunlar.push(`PK11a: frontend ${feSha} != agac ${agacSha}`);
  if (taze.sonuc === 'BAYAT') sorunlar.push(`PK11c: backend sureci dist'ten ESKI — ${taze.not}`);

  let ek = '';
  if (agac.kirli) ek += '-KIRLI'; // PK11d: red DEGIL, isaret

  if (sorunlar.length === 0) {
    satirlar.push('  ✅ UC SURUM DE UYUSUYOR — kosum GECERLI sayilir.');
    return { gecti: true, ek, rapor: satirlar.join('\n') };
  }

  for (const s of sorunlar) satirlar.push(`  ❌ ${s}`);
  if (kapali) {
    // PK11e: kacis serbest, ama kosum KANIT OLARAK ALINTILANAMAZ.
    ek += '-GECERSIZ';
    satirlar.push('  ⚠ SURUM_KAPISI=kapali — kosuluyor ama cikti GECERSIZ damgali.');
    satirlar.push('    Bu kosum kanit olarak alintilanamaz.');
    return { gecti: true, ek, rapor: satirlar.join('\n') };
  }
  satirlar.push('  ⛔ KOSUM REDDEDILDI. Uyumsuz surumle olcum YALAN URETIR.');
  satirlar.push('    Duzeltme: backend/frontend yeniden derleyip yeniden baslatin.');
  satirlar.push('    Kesif icin: SURUM_KAPISI=kapali (cikti -GECERSIZ damgalanir).');
  return { gecti: false, ek, rapor: satirlar.join('\n') };
}

exports.kapiyiCalistir = kapiyiCalistir;
