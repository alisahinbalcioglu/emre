/* E2E ALTIN YOL — programatik dogrulayici (C1-C10).
 * Girdi: e2e-artifacts/golden/<slug>/ (spec ciktilari) + test-fixtures/e2e/ orijinalleri.
 * Cikti: matrix.json + report.md + konsol tablosu. Exit 1 = en az bir FAIL.
 * exceljs backend node_modules'tan (frontend'e bagimlilik eklemeden). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireB = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const ExcelJS = requireB('exceljs');

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
const ROOT = path.resolve(__dirname, '../e2e-artifacts/golden');

const txt = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.result !== undefined) return txt(v.result);
    if (v.error) return String(v.error);
    if (v instanceof Date) return v.toISOString();
    if (v.text) return String(v.text);
  }
  return String(v);
};
const num = (s) => {
  if (typeof s === 'number') return s;
  const m = String(s ?? '').replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const f = parseFloat(m);
  return isNaN(f) ? null : f;
};
const errCells = (ws) => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
    if (c.value && typeof c.value === 'object' && c.value.error) n++;
  }));
  return n;
};

async function loadWb(p) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  return wb;
}
const visibleSheets = (wb) => wb.worksheets.filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden');

/** Satirin malzeme/iscilik birim fiyati. DIKKAT: `_matNetPrice ?? _matBirim`
 *  YANLIS — _matNetPrice cogu satirda 0 gelir (nullish DEGIL) ve gercek fiyati
 *  tasiyan _matBirim hic okunmaz. Once gorunen deger, sonra net. */
const matBirim = (row) => num(row?._matBirim) || num(row?._matNetPrice);
const labBirim = (row) => num(row?._labBirim) || num(row?._labNetPrice);

/** UY2 etkinMiktar: quantity saf sayi degilse unit icindeki sayi miktar. */
function etkinMiktar(row, qF, uF) {
  const q = row?.[qF];
  if (q != null && /^-?[0-9.,]+$/.test(String(q).trim()) && String(q).trim() !== '') return num(q);
  const u = row?.[uF];
  const m = String(u ?? '').match(/-?[\d.,]+/);
  return m ? num(m[0]) : null;
}

const results = [];
const slugs = fs.existsSync(ROOT) ? fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory()) : [];

for (const slug of slugs.sort()) {
  const dir = path.join(ROOT, slug);
  const J = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  const screen = J('screen.json');
  const payload = J('save-payload.json');
  const saved = J('saved-quote.json');
  const popups = J('popups.json') ?? [];
  const consoleErrs = (J('console.json') ?? []).filter((e) => !/favicon|manifest|Failed to load resource.*40[34]/.test(e));
  const timing = J('timing.json') ?? {};
  const headers = J('export-headers.json') ?? {};
  const R = { slug, file: screen?.file ?? '?', checks: {}, notlar: [] };
  const set = (k, ok, kanit) => { R.checks[k] = { sonuc: ok === null ? 'N/A' : ok ? 'PASS' : 'FAIL', kanit }; };

  if (!screen) { set('C1', false, 'screen.json yok — kosum tamamlanmadi'); results.push(R); continue; }
  const orjPath = path.join(FIXTURES, screen.file);
  let orj = null, fiyatli = null, teklif = null, fiyatli2 = null;
  try { orj = await loadWb(orjPath); } catch (e) { R.notlar.push('orijinal okunamadi: ' + e.message); }
  try { fiyatli = await loadWb(path.join(dir, 'fiyatli.xlsx')); } catch { /* C5 FAIL eder */ }
  try { teklif = await loadWb(path.join(dir, 'teklif.xlsx')); } catch { /* C6 FAIL eder */ }
  try { fiyatli2 = await loadWb(path.join(dir, 'fiyatli-2.xlsx')); } catch { /* C9 FAIL eder */ }

  // ── C1: yukleme + sekme tutarliligi + console
  {
    const orjVis = orj ? visibleSheets(orj).length : -1;
    const shown = (screen.sheetNames ?? []).length;
    const okSheets = orjVis < 0 ? shown > 0 : shown <= orjVis && shown > 0;
    const ok = okSheets && consoleErrs.length === 0 && (screen.sheets ?? []).some((s) => s.harvest.rowCount > 0);
    set('C1', ok, `sekme ekran=${shown}/orijinal-gorunur=${orjVis}; console-hata=${consoleErrs.length}${consoleErrs.length ? ' → ' + consoleErrs[0].slice(0, 80) : ''}`);
  }

  // ── C2: politika uygulanabildi + popup listesi
  {
    let famToplam = 0, famAtandi = 0;
    for (const s of screen.sheets ?? []) {
      const rows = (s.harvest.rows ?? []).filter((r) => r.hasMarka);
      let prev = -99;
      let famFirst = null;
      for (const r of rows) {
        if (r.idx !== prev + 1) { famFirst = r; famToplam++; if (r.markaLabel && !/Marka sec/i.test(r.markaLabel)) famAtandi++; }
        prev = r.idx;
      }
    }
    const ok = famToplam > 0 ? famAtandi / famToplam >= 0.9 : null;
    set('C2', ok, `aile ${famAtandi}/${famToplam} marka atandi; popup=${popups.length} satir (popups.json)`);
  }

  // ── C3: satir hesap + genel toplam (bagimsiz yeniden hesap, payload'dan)
  {
    let satirHata = 0, matT = 0, labT = 0, kontrol = 0, ilkHata = '';
    const sheets = payload?.sheets ?? [];
    for (const sh of sheets) {
      const qF = sh.columnRoles?.quantityField, uF = sh.columnRoles?.unitField;
      for (const row of sh.rowData ?? []) {
        const mik = etkinMiktar(row, qF, uF) ?? 1;
        const bp = matBirim(row);
        const tp = num(row._matToplam);
        if (bp && tp) {
          kontrol++;
          if (Math.abs(mik * bp - tp) > 0.05 * Math.max(1, tp)) {
            satirHata++;
            if (!ilkHata) ilkHata = `satir${row._rowIdx}: ${mik}×${bp}≠${tp}`;
          }
          matT += tp;
        }
        const lbp = labBirim(row), lt = num(row._labToplam);
        if (lbp && lt) {
          kontrol++;
          if (Math.abs(mik * lbp - lt) > 0.05 * Math.max(1, lt)) {
            satirHata++;
            if (!ilkHata) ilkHata = `satir${row._rowIdx} (isc): ${mik}×${lbp}≠${lt}`;
          }
        }
        if (lt) labT += lt;
      }
    }
    const ekranGenel = num(screen.sheets?.at(-1)?.harvest.genelToplam ?? screen.reopen?.harvest.genelToplam);
    const hesap = matT + labT;
    const genelOk = ekranGenel == null ? kontrol === 0 : Math.abs(hesap - ekranGenel) <= Math.max(1, hesap * 0.005);
    const ok = !!payload && satirHata === 0 && genelOk && kontrol > 0;
    set('C3', ok, `fiyatli hucre-cifti=${kontrol}, hesap-hatasi=${satirHata}${ilkHata ? ' (' + ilkHata + ')' : ''}; Σ=${hesap.toFixed(1)} vs ekran=${ekranGenel ?? '?'}`);
  }

  // ── C4: kalicilik — kaydedilen == geri okunan (tum sheet'ler, fiyat alanlari)
  {
    let ok = !!(payload?.sheets && saved?.sheets);
    let kanit = '';
    if (ok) {
      const a = payload.sheets, b = saved.sheets;
      if (a.length !== b.length) { ok = false; kanit = `sheet sayisi ${a.length}≠${b.length}`; }
      else {
        let dif = 0, toplamRow = 0;
        for (let i = 0; i < a.length; i++) {
          const ra = a[i].rowData ?? [], rb = b[i].rowData ?? [];
          if (ra.length !== rb.length) { dif += Math.abs(ra.length - rb.length); continue; }
          for (let j = 0; j < ra.length; j++) {
            toplamRow++;
            for (const f of ['_marka', '_matNetPrice', '_matToplam', '_firma', '_labNetPrice', '_labToplam']) {
              const va = ra[j]?.[f] ?? null, vb = rb[j]?.[f] ?? null;
              if (String(va ?? '') !== String(vb ?? '')) { dif++; break; }
            }
          }
        }
        ok = dif === 0;
        kanit = `${toplamRow} satir karsilastirildi, fark=${dif}`;
      }
      const curOk = screen.usd ? (saved.displayCurrency === 'USD' && screen.reopen?.currency === 'USD') : true;
      if (!curOk) { ok = false; kanit += `; para birimi persist FAIL (saved=${saved.displayCurrency}, ekran=${screen.reopen?.currency})`; }
      else if (screen.usd) kanit += `; USD persist ✓`;
    } else kanit = 'payload/saved eksik';
    set('C4', ok, kanit);
  }

  // ── C5: fiyatli.xlsx musteri duzeni birebir + degerler dogru kolonda
  {
    if (!orj || !fiyatli) set('C5', false, 'dosya okunamadi');
    else {
      const kanitlar = [];
      let ok = true;
      const ov = visibleSheets(orj);
      // Grid'de dolu TUM fiyat/toplam degerleri — dosyada yazilan her yeni sayi
      // bunlardan biri OLMALI (C5: "grid'de dolu her deger dosyada, dogru
      // kolonda"). Fiyatlandirma zaten mevcut fiyat kolonunu gunceller (KG
      // serisi); bozulma = grid'de KARSILIGI OLMAYAN sayi.
      const gridDegerleri = new Set();
      for (const sh of payload?.sheets ?? []) for (const row of sh.rowData ?? []) {
        for (const f of ['_matBirim', '_matToplam', '_labBirim', '_labToplam', '_toplam', '_matNetPrice', '_labNetPrice']) {
          const v = num(row?.[f]); if (v) gridDegerleri.add(v.toFixed(2));
        }
      }
      const gridde = (s) => { const v = num(s); return v != null && gridDegerleri.has(v.toFixed(2)); };
      for (const ws of ov) {
        const fw = fiyatli.getWorksheet(ws.name);
        if (!fw) { ok = false; kanitlar.push(`sayfa yok: ${ws.name}`); continue; }
        // satir sayisi
        if (fw.rowCount < ws.rowCount) { ok = false; kanitlar.push(`${ws.name}: satir ${fw.rowCount}<${ws.rowCount}`); }
        let farkli = 0, ornek = '';
        ws.eachRow({ includeEmpty: false }, (row, rn) => {
          row.eachCell({ includeEmpty: false }, (cell, cn) => {
            const o = txt(cell.value).trim();
            if (!o) return;
            const f = txt(fw.getRow(rn).getCell(cn).value).trim();
            if (o === f) return;
            // Mesru degisim: hucreye grid'deki bir fiyat/toplam yazilmis.
            // Metin kaybi veya karsiliksiz sayi = VERI KAYBI (KF1).
            if (gridde(f)) return;
            farkli++;
            if (!ornek) ornek = `${ws.name}!R${rn}C${cn} "${o.slice(0, 18)}"→"${f.slice(0, 18)}"`;
          });
        });
        if (farkli > 0) { ok = false; kanitlar.push(`${ws.name}: ${farkli} hucre grid'de karsiligi olmadan degisti (${ornek})`); }
        // merge korunumu
        const om = Object.keys(ws._merges ?? {}).length, fm = Object.keys(fw._merges ?? {}).length;
        if (fm < om) { ok = false; kanitlar.push(`${ws.name}: merge ${fm}<${om}`); }
        // formul hatasi artmamis
        const oe = errCells(ws), fe = errCells(fw);
        if (fe > oe) { ok = false; kanitlar.push(`${ws.name}: formul hatasi ${oe}→${fe}`); }
      }
      // fazladan sayfa yok (fiyatli cikti = musterinin dosyasi)
      const ekstra = visibleSheets(fiyatli).filter((w) => !orj.getWorksheet(w.name)).map((w) => w.name);
      if (ekstra.length) { ok = false; kanitlar.push('fazladan sayfa: ' + ekstra.join(',')); }
      set('C5', ok, kanitlar.length ? kanitlar.slice(0, 4).join(' · ') : `duzen birebir (${ov.length} sayfa, merge+deger+formul korunumu)`);
    }
  }

  // ── C6: teklif formati — kapak dolu + icmal toplami == ekran
  {
    if (!teklif) set('C6', false, 'teklif.xlsx okunamadi');
    else {
      const adlar = teklif.worksheets.map((w) => w.name);
      const kapak = teklif.worksheets.find((w) => /kapak/i.test(w.name));
      let musteriOk = false;
      kapak?.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        if (/E2E Test Müşterisi/.test(txt(c.value))) musteriOk = true;
      }));
      const icmal = teklif.worksheets.find((w) => /i̇cmal|icmal|İCMAL/i.test(w.name));
      const ekranGenel = num(screen.sheets?.at(-1)?.harvest.genelToplam ?? '');
      let icmalHit = false, icmalMax = 0;
      icmal?.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        const v = num(txt(c.value));
        if (v != null) { icmalMax = Math.max(icmalMax, v); if (ekranGenel != null && Math.abs(v - ekranGenel) <= Math.max(1, ekranGenel * 0.005)) icmalHit = true; }
      }));
      // liste sayfalari enjekte: orijinal gorunur sayfa adlarinin en az biri teklifte
      const enjekte = orj ? visibleSheets(orj).some((w) => teklif.getWorksheet(w.name)) : false;
      const ok = !!kapak && musteriOk && !!icmal && (ekranGenel == null || ekranGenel === 0 ? true : icmalHit) && enjekte;
      set('C6', ok, `kapak=${!!kapak} musteri=${musteriOk} icmal=${!!icmal} icmalToplamEslesme=${icmalHit}(ekran=${ekranGenel ?? '?'}, icmalMax=${icmalMax.toFixed(1)}) enjekte=${enjekte} [${adlar.slice(0, 6).join('|')}]`);
    }
  }

  // ── C7: para birimi — ekranda secili birim dosyada
  {
    if (!fiyatli) set('C7', false, 'fiyatli.xlsx yok');
    else if (screen.usd) {
      let dolarFmt = 0, kurNotu = '';
      for (const ws of fiyatli.worksheets) ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        if (/"\$"/.test(c.numFmt ?? '')) dolarFmt++;
        const t = txt(c.value);
        if (/1 USD = ₺/.test(t)) kurNotu = t.slice(0, 60);
      }));
      set('C7', dolarFmt > 0 && !!kurNotu, `$-bicimli hucre=${dolarFmt}; kur notu="${kurNotu}"`);
    } else {
      // TL teklif: metaprice'in yazdigi hucrelerde $ bicimi OLMAMALI (orijinalin kendi $ hucreleri sayilmaz)
      const oDolar = orj ? (() => { let n = 0; for (const ws of orj.worksheets) ws.eachRow({ includeEmpty: false }, (r) => r.eachCell({ includeEmpty: false }, (c) => { if (/"\$"/.test(c.numFmt ?? '')) n++; })); return n; })() : 0;
      let fDolar = 0;
      for (const ws of fiyatli.worksheets) ws.eachRow({ includeEmpty: false }, (r) => r.eachCell({ includeEmpty: false }, (c) => { if (/"\$"/.test(c.numFmt ?? '')) fDolar++; }));
      set('C7', fDolar <= oDolar, `TL teklif: $-bicim orijinal=${oDolar} fiyatli=${fDolar}`);
    }
  }

  // ── C8: self-check ozeti goruldu + bagimsiz sayimla tutarli
  {
    const oz = headers?.priced?.['x-export-summary'] ? decodeURIComponent(headers.priced['x-export-summary']) : '';
    let beklenenDeger = 0;
    for (const sh of payload?.sheets ?? []) for (const row of sh.rowData ?? []) {
      if (matBirim(row) && num(row._matToplam)) beklenenDeger += 2;
      if (labBirim(row) && num(row._labToplam)) beklenenDeger += 2;
    }
    const m = oz.match(/(\d+) değer aktarıldı/);
    const n = m ? parseInt(m[1], 10) : -1;
    const ok = !!oz && (beklenenDeger === 0 ? true : n === beklenenDeger);
    set('C8', ok, `ozet="${oz.slice(0, 70)}" bagimsiz-sayim=${beklenenDeger}`);
  }

  // ── C9: art arda ikinci indirme
  {
    const ok = !!fiyatli2 && !!headers['priced-2']?.['x-export-summary'] && fiyatli2.worksheets.length === (fiyatli?.worksheets.length ?? -1);
    set('C9', ok, `fiyatli-2.xlsx sayfa=${fiyatli2?.worksheets.length ?? 0}, ozet-2=${!!headers['priced-2']}`);
  }

  // ── C10: sureler kaydedildi (bilgi)
  set('C10', Object.keys(timing).length >= 5, Object.entries(timing).map(([k, v]) => `${k}=${(v / 1000).toFixed(1)}s`).join(' '));

  results.push(R);
}

// ── Rapor ──────────────────────────────────────────────────────────────
const KEYS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'];
let failCount = 0;
const lines = [];
lines.push('| Dosya | ' + KEYS.join(' | ') + ' |');
lines.push('|---|' + KEYS.map(() => '---').join('|') + '|');
for (const r of results) {
  const row = KEYS.map((k) => {
    const c = r.checks[k];
    if (!c) { failCount++; return '✗?'; }
    if (c.sonuc === 'FAIL') failCount++;
    return c.sonuc === 'PASS' ? '✓' : c.sonuc === 'N/A' ? '–' : '✗';
  });
  lines.push(`| ${r.slug} | ${row.join(' | ')} |`);
}
const md = ['# E2E Altın Yol — Sonuç Matrisi', '', ...lines, '', '## Kanıtlar', ''];
for (const r of results) {
  md.push(`### ${r.slug} — ${r.file}`);
  for (const k of KEYS) md.push(`- **${k}**: ${r.checks[k]?.sonuc ?? '?'} — ${r.checks[k]?.kanit ?? ''}`);
  if (r.notlar.length) md.push(`- Notlar: ${r.notlar.join('; ')}`);
  md.push('');
}
fs.writeFileSync(path.join(ROOT, 'matrix.json'), JSON.stringify(results, null, 1));
fs.writeFileSync(path.join(ROOT, 'report.md'), md.join('\n'));
console.log(lines.join('\n'));
console.log(`\nToplam FAIL: ${failCount} — detay: e2e-artifacts/golden/report.md`);
process.exit(failCount > 0 ? 1 : 0);
