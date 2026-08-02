#!/usr/bin/env node
/**
 * HR1 — KOD HARİTASI OTOMATİK KATMAN ÜRETİCİSİ
 *   node scripts/harita-uret.mjs            → KOD_HARITASI_OTOMATIK.md yazar
 *   node scripts/harita-uret.mjs --agac      → yalnız dizin ağacını basar (HR1c)
 *   node scripts/harita-uret.mjs --kontrol   → yazmaz, yalnız özet basar
 *
 * Bu katman KODDAN üretilir ve YORUM İÇERMEZ. Yorum üst katmanın
 * (KOD_HARITASI.md) işidir. Buradaki hiçbir satır elle yazılmaz.
 *
 * Kaynak: `git ls-files` — yani repoda GERÇEKTEN izlenen dosyalar.
 * Diskteki izlenmeyen dosyalar bilerek dışarıdadır: harita "repoda ne var"
 * sorusunu cevaplar, "bu makinede ne var" sorusunu değil.
 *
 * Kapsam tanımı betiğin içinde DEĞİL: `harita-kapsam-disi.txt`.
 *
 * Çıkış kodu sözleşmesi: 0 = üretildi · 2 = ön koşul yok (git deposu değil).
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KAPSAM_DOSYASI = path.join(KOK, 'harita-kapsam-disi.txt');
const CIKTI = path.join(KOK, 'KOD_HARITASI_OTOMATIK.md');

// ── kapsam tanımını oku ───────────────────────────────────────────────────
export function kapsamOku(dosya = KAPSAM_DOSYASI) {
  if (!fs.existsSync(dosya)) return null;
  const satirlar = fs.readFileSync(dosya, 'utf8').split(/\r?\n/);
  const uzantilar = [];
  const disi = [];
  let bolum = '';
  for (const ham of satirlar) {
    const s = ham.trim();
    if (!s || s.startsWith('#')) continue;
    if (s.startsWith('[')) { bolum = s; continue; }
    if (bolum === '[KOD UZANTILARI]') { uzantilar.push(s); continue; }
    if (bolum === '[KAPSAM DISI]') {
      const [desen, gerekce] = s.split('::').map((x) => (x ?? '').trim());
      if (!desen) continue;
      disi.push({ desen, gerekce: gerekce ?? '' });
    }
  }
  return { uzantilar, disi };
}

const eslesir = (yol, desen) => desen.endsWith('/') ? yol.startsWith(desen)
  : desen.startsWith('*') ? yol.endsWith(desen.slice(1))
    : yol === desen;

export function kodDosyalari(kapsam, kok = KOK) {
  const ham = execFileSync('git', ['ls-files', '-z'], { cwd: kok, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean).map((s) => s.normalize('NFC'));
  return ham.filter((y) => kapsam.uzantilar.some((u) => y.endsWith(u))
    && !kapsam.disi.some((d) => eslesir(y, d.desen)));
}

// ── ölçümler ──────────────────────────────────────────────────────────────
const satirSay = (tam) => {
  try { return fs.readFileSync(tam, 'utf8').split('\n').length; } catch { return -1; }
};

/** import/require hedefleri — ham dize olarak (çözümleme YAPILMAZ; çözümleme
 *  bir yorumdur, bu katmanda yorum yok). */
function importlar(tam) {
  let m;
  try { m = fs.readFileSync(tam, 'utf8'); } catch { return []; }
  const out = new Set();
  for (const r of m.matchAll(/^\s*import\s[^;\n]*?from\s+['"]([^'"]+)['"]/gm)) out.add(r[1]);
  for (const r of m.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.add(r[1]);
  for (const r of m.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) out.add(r[1]);
  for (const r of m.matchAll(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s/gm)) out.add(r[1]);
  return [...out];
}

/** NestJS controller/route ve Next.js route dosyaları. */
function ucNoktalar(yol, tam) {
  let m;
  try { m = fs.readFileSync(tam, 'utf8'); } catch { return []; }
  const out = [];
  const ctrl = /@Controller\(\s*['"]?([^'")]*)['"]?\s*\)/.exec(m);
  const taban = ctrl ? ctrl[1] : null;
  for (const r of m.matchAll(/@(Get|Post|Put|Patch|Delete|All)\(\s*['"]?([^'")]*)['"]?\s*\)/g)) {
    const alt = (r[2] ?? '').replace(/^\/+/, '');
    out.push(`${r[1].toUpperCase()} /${[taban, alt].filter(Boolean).join('/')}`);
  }
  if (/\/route\.(ts|tsx|js)$/.test(yol)) {
    for (const r of m.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      out.push(`${r[1]} ${yol}`);
    }
  }
  return out;
}

function testScriptleri(kok = KOK) {
  const out = [];
  for (const p of ['backend/package.json', 'frontend/package.json', 'package.json']) {
    const tam = path.join(kok, p);
    if (!fs.existsSync(tam)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(tam, 'utf8')); } catch { continue; }
    for (const [ad, komut] of Object.entries(j.scripts ?? {})) {
      if (ad.startsWith('test:')) out.push({ paket: p, ad, komut });
    }
  }
  return out;
}

/** git ls-files çıktısından dizin ağacı (HR1c). */
export function agacKur(yollar) {
  const kok = {};
  for (const y of yollar) {
    let d = kok;
    const parcalar = y.split('/');
    for (let i = 0; i < parcalar.length; i++) {
      const son = i === parcalar.length - 1;
      if (son) { (d.__dosya ??= []).push(parcalar[i]); }
      else { d = (d[parcalar[i]] ??= {}); }
    }
  }
  const satirlar = [];
  let dizinSayisi = 0;
  const yaz = (dugum, onek) => {
    const altlar = Object.keys(dugum).filter((k) => k !== '__dosya').sort();
    const dosyalar = (dugum.__dosya ?? []).sort();
    const hepsi = [...altlar.map((a) => ({ ad: a, dizin: true })), ...dosyalar.map((f) => ({ ad: f, dizin: false }))];
    hepsi.forEach((e, i) => {
      const sonMu = i === hepsi.length - 1;
      satirlar.push(`${onek}${sonMu ? '└── ' : '├── '}${e.ad}${e.dizin ? '/' : ''}`);
      if (e.dizin) { dizinSayisi++; yaz(dugum[e.ad], onek + (sonMu ? '    ' : '│   ')); }
    });
  };
  yaz(kok, '');
  return { satirlar, dizinSayisi };
}

// ── ana akış ──────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: KOK, stdio: 'ignore' }); }
  catch { console.log('ON KOSUL YOK — git deposu degil.'); process.exit(2); }

  const kapsam = kapsamOku();
  if (!kapsam) { console.log(`ON KOSUL YOK — ${path.basename(KAPSAM_DOSYASI)} yok.`); process.exit(2); }

  if (argv.includes('--agac')) {
    // HR1c: TUM izlenen dosyalar (yalniz kod degil) — mevcut duzenin fotografi.
    const hepsi = execFileSync('git', ['ls-files', '-z'], { cwd: KOK, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean).map((s) => s.normalize('NFC'))
      .filter((y) => !kapsam.disi.some((d) => eslesir(y, d.desen)));
    const { satirlar, dizinSayisi } = agacKur(hepsi);
    console.log(satirlar.join('\n'));
    console.log(`\n${dizinSayisi} dizin, ${hepsi.length} dosya`);
    process.exit(0);
  }

  const dosyalar = kodDosyalari(kapsam);
  const olcum = dosyalar.map((y) => {
    const tam = path.join(KOK, y);
    return { yol: y, satir: satirSay(tam), imp: importlar(tam), uc: ucNoktalar(y, tam) };
  });
  const testler = testScriptleri();

  const L = [];
  L.push('# KOD HARİTASI — OTOMATİK KATMAN');
  L.push('');
  L.push('<!-- URETILMIS DOSYA — ELLE DUZENLENMEZ. Uretici: scripts/harita-uret.mjs -->');
  L.push('<!-- Kapsam tanimi: harita-kapsam-disi.txt -->');
  L.push('');
  L.push(`Kod dosyasi: ${olcum.length}`);
  L.push(`Toplam satir: ${olcum.reduce((a, b) => a + Math.max(0, b.satir), 0)}`);
  L.push(`Uc nokta: ${olcum.reduce((a, b) => a + b.uc.length, 0)}`);
  L.push(`test:* scripti: ${testler.length}`);
  L.push('');
  L.push('## 1 · Dosyalar ve satir sayilari');
  L.push('');
  L.push('| Dosya | Satir |');
  L.push('|---|---|');
  for (const o of olcum) L.push(`| \`${o.yol}\` | ${o.satir} |`);
  L.push('');
  L.push('## 2 · Import bagliliklari');
  L.push('');
  L.push('| Dosya | Import ettigi (ham) |');
  L.push('|---|---|');
  for (const o of olcum) if (o.imp.length) L.push(`| \`${o.yol}\` | ${o.imp.map((x) => `\`${x}\``).join(' ')} |`);
  L.push('');
  L.push('## 3 · Uc noktalar');
  L.push('');
  if (olcum.every((o) => !o.uc.length)) L.push('(yok)');
  else {
    L.push('| Dosya | Uc |');
    L.push('|---|---|');
    for (const o of olcum) for (const u of o.uc) L.push(`| \`${o.yol}\` | \`${u}\` |`);
  }
  L.push('');
  L.push('## 4 · test:* scriptleri (package.json`dan)');
  L.push('');
  L.push('| Paket | Script | Komut |');
  L.push('|---|---|---|');
  for (const t of testler) L.push(`| \`${t.paket}\` | \`${t.ad}\` | \`${t.komut}\` |`);
  L.push('');
  L.push('## 5 · Kapsam disi birakilanlar');
  L.push('');
  L.push('| Desen | Gerekce |');
  L.push('|---|---|');
  for (const d of kapsam.disi) L.push(`| \`${d.desen}\` | ${d.gerekce} |`);
  L.push('');

  const metin = L.join('\n');
  if (argv.includes('--kontrol')) {
    console.log(`kod dosyasi=${olcum.length} · uc nokta=${L.length && olcum.reduce((a, b) => a + b.uc.length, 0)} · test:*=${testler.length}`);
    process.exit(0);
  }
  fs.writeFileSync(CIKTI, metin);
  console.log(`YAZILDI: ${path.relative(KOK, CIKTI).replace(/\\/g, '/')}`);
  console.log(`  kod dosyasi : ${olcum.length}`);
  console.log(`  toplam satir: ${olcum.reduce((a, b) => a + Math.max(0, b.satir), 0)}`);
  console.log(`  uc nokta    : ${olcum.reduce((a, b) => a + b.uc.length, 0)}`);
  console.log(`  test:* adedi: ${testler.length}`);
  process.exit(0);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
