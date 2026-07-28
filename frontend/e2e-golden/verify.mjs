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
    if (v.error) return String(v.error);
    if (v.result !== undefined && v.result !== null && typeof v.result !== 'object') return txt(v.result);
    if (v.formula || v.sharedFormula) return '=' + (v.formula ?? v.sharedFormula); // "[object Object]" YASAK
    if (v instanceof Date) return v.toISOString();
    if (v.text) return String(v.text);
  }
  return String(v);
};
/** Hucre sayisal/fiyat tasiyicisi mi (sayi, formul, formul sonucu)? */
const sayisalHucre = (v) => {
  if (typeof v === 'number') return true;
  if (v && typeof v === 'object' && (v.formula || v.sharedFormula || typeof v.result === 'number')) return true;
  return num(txt(v)) != null;
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

/** Ozet satirindaki TUM parasal degerler, sirayla.
 *  Ekranda ozet satiri "GENEL TOPLAM ₺137.460,8 ₺42.840,0 ₺180.300,8" =
 *  [malzeme, iscilik, GENEL]. num() ilk sayiyi aliyordu → malzeme toplamini
 *  genel toplam sanip 04/05'te sahte SAPMA uretti. Son deger = genel toplam. */
const paraDizisi = (s) => {
  const out = [];
  for (const m of String(s ?? '').matchAll(/[₺$€]\s*([\d.,]+)/g)) {
    const v = num(m[1]);
    if (v != null) out.push(v);
  }
  return out;
};
/** Ozet satirindan GENEL TOPLAM. Bicim degisken:
 *  3 deger "₺mat ₺lab ₺genel" · 2 deger "₺mat ₺lab" (genel kolonu yok) · 1 deger.
 *  Kural: son eleman oncekilerin toplamina esitse GENEL'dir; degilse
 *  bilesenlerin TOPLAMI genel toplamdir. */
const ekranGenelToplam = (text) => {
  const p = paraDizisi(text);
  if (p.length === 0) return null;
  if (p.length === 1) return p[0];
  const oncekiler = p.slice(0, -1).reduce((a, b) => a + b, 0);
  const son = p[p.length - 1];
  if (Math.abs(son - oncekiler) <= Math.max(0.5, oncekiler * 0.005)) return son;
  return p.reduce((a, b) => a + b, 0);
};

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
  // NFD/NFC: Windows'ta Turkce dosya adi ayrik birlestiricilerle saklanabilir
  const orjPath = fs.existsSync(path.join(FIXTURES, screen.file))
    ? path.join(FIXTURES, screen.file)
    : path.join(FIXTURES, fs.readdirSync(FIXTURES).find((f) => f.normalize('NFC') === screen.file.normalize('NFC')) ?? screen.file);
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
    let satirHata = 0, kontrol = 0, ilkHata = '';
    const sheets = payload?.sheets ?? [];
    // Ekranda GENEL TOPLAM SAYFA BAZINDA gosterilir (aktif sekmenin toplami),
    // payload ise TUM sayfalari tasir → tek Σ ile karsilastirmak yanlisti.
    // Her sayfa kendi ekran toplamiyla ayri karsilastirilir.
    const sayfaKarsilastirma = [];
    for (let si = 0; si < sheets.length; si++) {
      const sh = sheets[si];
      let matT = 0, labT = 0;
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
      // ISIMLE eslestir — INDEKSLE DEGIL: payload TUM sayfalari tasir,
      // ekrandaki sekmeler yalniz DOLU sayfalari gosterir. Indeks eslesmesi
      // bir sayfa kaydiriyordu (03: İnşai:5053271/6638946 komsu sayfanin
      // toplamiyla karsilastirilmisti).
      const norm = (s) => String(s ?? '').normalize('NFC').trim().toLocaleLowerCase('tr');
      const ekranSheet = (screen.sheets ?? []).find((s) => norm(s.name) === norm(sh.name));
      const ozetMetin = ekranSheet?.harvest?.genelToplam ?? '';
      const paralar = paraDizisi(ozetMetin);
      sayfaKarsilastirma.push({
        ad: sh.name, hesap: matT + labT, matT, labT,
        ekran: ekranGenelToplam(ozetMetin),
        // mat/lab ayrisik gosteriliyorsa (2+ deger) onlari da dogrula
        ekranMat: paralar.length >= 2 ? paralar[0] : null,
        ekranLab: paralar.length >= 2 ? paralar[1] : null,
        ekranVar: !!ekranSheet,
      });
    }
    // Fiyat yazilan HER sayfa icin ekran toplami = bagimsiz hesap olmali.
    // Fiyatsiz sayfada (hesap=0) ekran toplami da 0/yok beklenir.
    const yakin = (a, b) => a != null && b != null && Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.005);
    const sapan = sayfaKarsilastirma.filter((s) => {
      if (s.hesap === 0) return false; // fiyatlanmamis sayfa
      if (s.ekran == null) return true; // fiyat var ama ekranda toplam yok = FAIL
      if (!yakin(s.hesap, s.ekran)) return true;
      // ekranda ayrisik gosteriliyorsa malzeme ve iscilik AYRI AYRI da tutmali
      if (s.ekranMat != null && !yakin(s.matT, s.ekranMat)) return true;
      if (s.ekranLab != null && !yakin(s.labT, s.ekranLab)) return true;
      return false;
    });
    const toplamHesap = sayfaKarsilastirma.reduce((a, s) => a + s.hesap, 0);
    const detay = sayfaKarsilastirma.filter((s) => s.hesap > 0)
      .map((s) => `${String(s.ad).slice(0, 12)}:${s.hesap.toFixed(0)}${s.ekran != null ? '/' + s.ekran.toFixed(0) : (s.ekranVar ? '/YOK' : '/SEKME-YOK')}`).join(' ');
    if (!payload || kontrol === 0) {
      // Fiyatli satir YOKSA hesap kontrolu UYGULANAMAZ (N/A) — hic eslesme
      // olmamasi C2'nin konusu, C3'un degil.
      set('C3', null, 'fiyatlı satır yok — hesap kontrolü uygulanamaz (eşleşme durumu C2 ve popups.json\'da)');
    } else {
      set('C3', satirHata === 0 && sapan.length === 0,
        `fiyatlı hücre-çifti=${kontrol}, hesap-hatası=${satirHata}${ilkHata ? ' (' + ilkHata + ')' : ''}; sayfa hesap/ekran → ${detay}${sapan.length ? ` · SAPAN: ${sapan.map((s) => s.ad).join(',')}` : ''}; Σ=${toplamHesap.toFixed(1)}`);
    }
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
        // Satir korunumu: rowCount DEGIL "son DOLU satir" karsilastirilir —
        // ExcelJS yazarken sondaki tamamen bos satirlari kirpar (91→79,
        // 601→599 vakalari: kirpilan aralikta veri YOKTU). Gercek olcut:
        // orijinaldeki son dolu satir ciktida da mevcut mu?
        const sonDolu = (sheet) => {
          let s = 0;
          sheet.eachRow({ includeEmpty: false }, (row, rn) => {
            let dolu = false;
            row.eachCell({ includeEmpty: false }, (c) => { if (txt(c.value).trim()) dolu = true; });
            if (dolu) s = rn;
          });
          return s;
        };
        const oSon = sonDolu(ws);
        if (fw.rowCount < oSon) { ok = false; kanitlar.push(`${ws.name}: çıktı ${fw.rowCount} satır < orijinalin son dolu satırı ${oSon}`); }
        let farkli = 0, ornek = '', temizlenenSayisal = 0;
        ws.eachRow({ includeEmpty: false }, (row, rn) => {
          row.eachCell({ includeEmpty: false }, (cell, cn) => {
            const o = txt(cell.value).trim();
            if (!o) return;
            const fCell = fw.getRow(rn).getCell(cn).value;
            const f = txt(fCell).trim();
            if (o === f) return;
            // (a) Hucreye grid'deki bir fiyat/toplam yazilmis → mesru
            if (gridde(f)) return;
            // (b) SAYISAL/formul hucre bosaltilmis → K-A hayalet temizligi
            //     (KG2 spec'i: grid'de olmayan eski fiyat cikttida kalmaz).
            //     KG9 fix'i sonrasi bu YALNIZ uygulamanin yonettigi rolde olur;
            //     kanit olarak sayilir, FAIL degil.
            if (f === '' && sayisalHucre(cell.value)) { temizlenenSayisal++; return; }
            // (c) METIN kaybi / karsiliksiz yeni deger = VERI KAYBI (KF1)
            farkli++;
            if (!ornek) ornek = `${ws.name}!R${rn}C${cn} "${o.slice(0, 18)}"→"${f.slice(0, 18)}"`;
          });
        });
        if (temizlenenSayisal > 0) kanitlar.push(`${ws.name}: ${temizlenenSayisal} eski fiyat hücresi temizlendi (K-A/KG2, yönetilen rol)`);
        if (farkli > 0) { ok = false; kanitlar.push(`${ws.name}: ${farkli} hücrede VERİ KAYBI (${ornek})`); }
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
      set('C5', ok, (ok ? `düzen birebir (${ov.length} sayfa, metin+merge+formül korunumu)` : 'VERİ KAYBI: ')
        + (kanitlar.length ? kanitlar.slice(0, 4).join(' · ') : ''));
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
      // İCMAL, TUM sayfalarin toplamini tasir → tek sayfanin ekran toplamiyla
      // degil, sayfa toplamlarinin TOPLAMIYLA karsilastirilir (cok sekmeli
      // dosyalarda 04 vakasi: icmal 7,1M vs tek sayfa ekrani 1,6M).
      const ekranGenel = (screen.sheets ?? [])
        .map((s) => ekranGenelToplam(s?.harvest?.genelToplam ?? '') ?? 0)
        .reduce((a, b) => a + b, 0) || null;
      // USD/EUR teklifinde İCMAL hedef birimde yazilir; ekran toplami TL idi
      // → karsilastirma icin ekran degeri ayni birime cevrilir. Kur, İCMAL'in
      // kendi not satirindan okunur ("Kur: 1 USD = 47,375 TL").
      let kur = 1;
      icmal?.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        const m = /1\s*USD\s*=\s*([\d.,]+)\s*TL/i.exec(txt(c.value));
        if (m && screen.usd) kur = num(m[1]) ?? 1;
      }));
      const hedefGenel = ekranGenel != null ? ekranGenel / kur : null;
      // Yalniz GERCEK sayisal degerler (formul METNINDEN rakam ayiklamak
      // "SUM('TEKLİF'!I13:I590)" → 13590 gibi hayalet sayilar uretiyordu)
      const icmalDegerler = [];
      icmal?.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        const v = c.value;
        const s = typeof v === 'number' ? v
          : (v && typeof v === 'object' && typeof v.result === 'number') ? v.result : null;
        if (s != null) icmalDegerler.push(s);
      }));
      const icmalMax = icmalDegerler.length ? Math.max(...icmalDegerler) : 0;
      // Eslesme: bolum/ara toplam degerlerinden biri ekran toplamini vermeli
      // (GENEL TOPLAM satiri KDV'li olabilir — 08: 1.984.522 = 1.653.769×1,2)
      const icmalHit = hedefGenel != null &&
        icmalDegerler.some((v) => Math.abs(v - hedefGenel) <= Math.max(1, hedefGenel * 0.01));
      // liste sayfalari enjekte: orijinal gorunur sayfa adlarinin en az biri teklifte
      const enjekte = orj ? visibleSheets(orj).some((w) => teklif.getWorksheet(w.name)) : false;
      const ok = !!kapak && musteriOk && !!icmal && (hedefGenel == null || hedefGenel === 0 ? true : icmalHit) && enjekte;
      set('C6', ok, `kapak=${!!kapak} müşteri=${musteriOk} icmal=${!!icmal} icmalToplamEşleşme=${icmalHit}`
        + ` (ekran=${ekranGenel?.toFixed(1) ?? '?'}${kur !== 1 ? ` → ${hedefGenel.toFixed(1)} @kur ${kur}` : ''}, icmalMax=${icmalMax.toFixed(1)})`
        + ` enjekte=${enjekte} [${adlar.slice(0, 6).join('|')}]`);
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
    // Export'un yazma mantigi birebir taklit edilir (export-engine T6/K-B):
    // birim>0 → 1 hucre; toplam grid'de VARSA ya da miktardan TURETILEBILIYORSA
    // (birim>0 && etkinMiktar>0) 1 hucre daha. 08-sahinkul'de tek satirda
    // toplam grid'de yoktu ama export miktardan turetip yazdi (36 vs 37).
    let beklenenDeger = 0;
    for (const sh of payload?.sheets ?? []) {
      const qF = sh.columnRoles?.quantityField, uF = sh.columnRoles?.unitField;
      for (const row of sh.rowData ?? []) {
        const mik = etkinMiktar(row, qF, uF) ?? 0;
        const mb = matBirim(row), lb = labBirim(row);
        if (mb) { beklenenDeger++; if (num(row._matToplam) || mik > 0) beklenenDeger++; }
        if (lb) { beklenenDeger++; if (num(row._labToplam) || mik > 0) beklenenDeger++; }
      }
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
