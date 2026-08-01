/* E2E ALTIN YOL — programatik dogrulayici (C1-C10).
 * Girdi: e2e-artifacts/golden/<slug>/ (spec ciktilari) + test-fixtures/e2e/ orijinalleri.
 * Cikti: matrix.json + report.md + konsol tablosu. Exit 1 = en az bir FAIL.
 * exceljs backend node_modules'tan (frontend'e bagimlilik eklemeden). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// PK6: `num`/`numHam` AYRI dosyaya alindi — burada gomulu kaldiklari surece
// test edilemiyorlardi ve "hangi girdi hangi fonksiyon" kurali yalniz yorumda
// yaziliydi. Artik `lib/sayi-ayristirma.test.ts` hem davranisi hem KAYNAGI
// (payload alani num() ile okunuyor mu) kilitliyor.
import { num, numHam } from './sayi-ayristirma.mjs';
// PK10: artefaktlar artik damgali dizinde (pano kalem 44).
import { GOLDEN_KOK, damga } from './artefakt-dizini.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireB = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const ExcelJS = requireB('exceljs');

/** KD6: matriste basilacak anahtarlarin SOZLESMESI — tek kaynak. */
const KEYS_SOZLESME = ['C1', 'C2', 'C3', 'C4', 'C5', 'C5b', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C11b'];

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
// PK10: bu kosumun damgali dizini. `E2E_DAMGA` varsa (run.mjs / playwright
// config onu koyar) O kosum okunur; yoksa `latest` isaretcisi izlenir. Boylece
// verify TEK BASINA calistirildiginda da EN SON kosumu olcer, eski bir
// artefakti degil.
const ROOT = (() => {
  if (process.env.E2E_DAMGA) return path.join(GOLDEN_KOK, process.env.E2E_DAMGA);
  const junction = path.join(GOLDEN_KOK, 'latest');
  if (fs.existsSync(junction)) return junction;
  const metin = path.join(GOLDEN_KOK, 'latest.txt');
  if (fs.existsSync(metin)) return path.join(GOLDEN_KOK, fs.readFileSync(metin, 'utf-8').trim());
  return path.join(GOLDEN_KOK, damga()); // hic kosum yok — bos dizin
})();
// ⚠ ROOT VAR OLMAK ZORUNDA: verify sonda matrix.json + report.md yazar.
// Ilk PK10 kablolamasinda bu satir YOKTU ve verify ENOENT ile coktu
// (`matrix.json` yazilamadi) — yani C1-C11 matrisi yine uretilemedi.
// Bu, kalem 31'deki "verify.mjs C6'da cokuyordu" hatasinin AYNI SINIFI:
// dogrulayicinin kendisi sessizce olursa butun iddialar bosa duser.
fs.mkdirSync(ROOT, { recursive: true });

// ── KD6 OZ DENETIM — EN BASTA KOSAR (pano kalem 49) ─────────────────────
// `set(...)` ile yazilan her anahtar KEYS listesinde OLMALI. Degilse o blok
// matriste HIC BASILMAZ ve sessizce yok sayilir: `C5b` ve `C11b` tam boyleydi,
// KE16 · KG2 · KF1'in "kaniti" oralarda duruyordu. Tehlike somut — biri
// dosyada `KE16` diye arar, bulur, "kapsanmis" sanir (I7 ailesi).
//
// ⚠ EN BASTA olmasi SART: sonda dururken HIC ATESLEMEDI (olculdu). Kapinin
// kendisi de "hic gecilmeyen kapi" olacakti.
// Cikis kodu 4 — 0 da 2 de DEGIL; 2 bu projede "atlandi" demek (KD8 dersi).
{
  const oz = fs.readFileSync(new URL('./verify.mjs', import.meta.url), 'utf-8');
  const yazilan = [...new Set([...oz.matchAll(/set\(\s*'([^']+)'/g)].map((m) => m[1]))];
  const eksik = yazilan.filter((k) => !KEYS_SOZLESME.includes(k)).sort();
  if (eksik.length) {
    console.error('');
    console.error('KD6: set() ile yazilan ama KEYS listesinde OLMAYAN anahtar(lar):');
    for (const k of eksik) console.error(`   - ${k}  => matriste HIC BASILMIYOR, sessizce yok sayiliyor`);
    console.error('   Karar sart: ya KEYS listesine gir (N/A olarak gorunsun) ya da SIL.');
    console.error('   Ucuncu secenek (dosyada durup basilmamak) artik mumkun degil.');
    process.exit(4);
  }
}

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

// ── C11 (KE21) yardimcilari: "fazladan kolon yok" ────────────────────────
/** Sayfadaki SON dolu kolon (1-tabanli). ws.columnCount stil tanimli BOS
 *  kolonlari da sayar (Aksa: 119) — olcut GERCEK doluluktur. */
const sonDoluKolon = (ws) => {
  let m = 0;
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c, cn) => {
    if (txt(c.value).trim() !== '' && cn > m) m = cn;
  }));
  return m;
};
/** Bir kolonun ilk N satirdaki metinleri birlestirilmis hali. KE15 iki
 *  katmanli baslikta ust satir "MALZEME" + alt satir "BİRİM FİYAT" AYNI
 *  kolonda durur; anlam ancak BIRLESIK metinden okunur. */
const kolonYiginMetni = (ws, c, sonSatir) => {
  const p = [];
  for (let r = 1; r <= sonSatir; r++) {
    const t = txt(ws.getCell(r, c).value).trim();
    if (t && !/^=/.test(t)) p.push(t);
  }
  return p.join(' ').replace(/\s+/g, ' ').toLocaleLowerCase('tr');
};
/** Kolondaki SAYISAL deger sayisi — KE8 "verisiz kolon" olcutu. Baslik bandi
 *  cikarilmaz: basliklar METIN, sayisalHucre onlari zaten saymaz (band ile
 *  kirpmak Skychem'de R12-R13'teki gercek degerleri gorunmez yapiyordu). */
const kolondaVeriVar = (ws, c) => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const v = row.getCell(c).value;
    if (v != null && v !== '' && sayisalHucre(v)) n++;
  });
  return n;
};
/** Export'un ekledigi kolonun basligindan ROL cikar (kolonAta fallback
 *  basliklari: "Malz. Birim Fiyat" · "Malz. Toplam" · "İşç. Birim Fiyat" …) */
const rolTani = (bas) => {
  const b = String(bas ?? '').toLocaleLowerCase('tr');
  const malz = /malz/.test(b), isc = /i̇şç|isc|işç/.test(b);
  const birim = /birim/.test(b), toplam = /toplam|tutar/.test(b);
  if (malz && birim) return 'matUnit';
  if (malz && toplam) return 'matTot';
  if (isc && birim) return 'labUnit';
  if (isc && toplam) return 'labTot';
  if (/toplam birim/.test(b)) return 'grandUnit';
  if (/toplam tutar/.test(b)) return 'grandTot';
  return null;
};
/** Sablonun KENDI basliginda bu rolun anlamsal karsiligi var mi?
 *  BAGIMSIZ olcut — backend'in basligaUyar'i cagirilmaz (cagirilsaydi
 *  kontrol totoloji olurdu: export ne derse dogrulayici da onu derdi). */
const ROL_DESEN = {
  matUnit: (t) => /malz/.test(t) && /(birim|br\.?\s*f|b\.?\s*f\.?)/.test(t),
  matTot: (t) => /malz/.test(t) && /(tutar|toplam|t\.?\s*f\.?)/.test(t),
  labUnit: (t) => /(i̇şç|işç|isc)/.test(t) && /(birim|br\.?\s*f|b\.?\s*f\.?)/.test(t),
  labTot: (t) => /(i̇şç|işç|isc)/.test(t) && /(tutar|toplam|t\.?\s*f\.?)/.test(t),
  grandUnit: (t) => /(satış|toplam|genel)/.test(t) && /(birim|br\.?\s*f)/.test(t),
  grandTot: (t) => /(satış|toplam|genel)/.test(t) && /(tutar|toplam)/.test(t),
};
const rolBasligiVar = (ws, sonKolon, baslikSonu, rol) => {
  const test = ROL_DESEN[rol];
  if (!test) return null;
  for (let c = 1; c <= sonKolon; c++) if (test(kolonYiginMetni(ws, c, baslikSonu))) return c;
  return null;
};
const KOLON_ADI = (c) => { let s = '', n = c; while (n > 0) { const k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = (n - k - 1) / 26; } return s; };

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
const matBirim = (row) => numHam(row?._matBirim) || numHam(row?._matNetPrice);
const labBirim = (row) => numHam(row?._labBirim) || numHam(row?._labNetPrice);

/** UY2 etkinMiktar: quantity saf sayi degilse unit icindeki sayi miktar. */
function etkinMiktar(row, qF, uF) {
  const q = row?.[qF];
  if (q != null && /^-?[0-9.,]+$/.test(String(q).trim()) && String(q).trim() !== '') return numHam(q);
  const u = row?.[uF];
  const m = String(u ?? '').match(/-?[\d.,]+/);
  return m ? num(m[0]) : null;
}

const results = [];
// ALTIN YOL artefaktlari: `screen.json` URETEN kosumlar. Kriter-ozel spec'ler
// (or. 12-gs-kalicilik → GS6/GS8/GS9) altin yol adimlarini kosmaz, kendi
// artefaktini yazar; matrise girerse 11 kriter birden sahte KIRMIZI olur.
const slugs = fs.existsSync(ROOT)
  ? fs.readdirSync(ROOT)
    .filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory())
    .filter((d) => fs.existsSync(path.join(ROOT, d, 'screen.json')))
  : [];

for (const slug of slugs.sort()) {
  const dir = path.join(ROOT, slug);
  const J = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  const screen = J('screen.json');
  const payload = J('save-payload.json');
  const saved = J('saved-quote.json');
  const popups = J('popups.json') ?? [];
  // Bölüm D senaryosu (11. test): hedefli tek aile fiyatlandırılır — "tüm
  // ailelere marka atandı mı" (C2) ölçütü bu koşum için ANLAMSIZ, senaryonun
  // kendi şartları spec'te expect ile sınanır (senaryo.json = kanıt).
  const senaryo = J('senaryo.json');
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
    if (senaryo) {
      const h = senaryo.SD?.hedefler ?? [];
      const fy = h.filter((x) => x.fiyat).length, is = h.filter((x) => !x.fiyat && x.isaret).length;
      set('C2', null, `Bölüm D senaryosu — hedefli tek aile: ${fy}/${h.length} hedef fiyat aldı, ${is} eylemli işaret, sessiz boş 0 (senaryo.json; şartlar spec'te expect ile sınandı)`);
    } else set('C2', ok, `aile ${famAtandi}/${famToplam} marka atandi; popup=${popups.length} satir (popups.json)`);
  }

  // ── C3: satir hesap + genel toplam (bagimsiz yeniden hesap, payload'dan)
  {
    let satirHata = 0, kontrol = 0, ilkHata = '';
    let dosyadanSapan = 0; // dosyadan gelen (bizim hesaplamadigimiz) fiyat cifti
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
        // ⚠ 31.07: filtre YOKTU — grup/ara-toplam satirlari da toplaniyordu.
        // 03-bursa Mekanik'te hesap 2.747.107.059 cikiyordu, ekranda 74.350.566
        // (37 kat). Uygulamanin kurali (ExcelGrid.updatePinnedBottom ve
        // backend GS14c testi): YALNIZ veri satirlari, ozet satirlari HARIC.
        // Dogrulayici ucuncu bir kural kullanamaz.
        if (!row?._isDataRow || row?._ozet) continue;
        const mik = etkinMiktar(row, qF, uF) ?? 1;
        const bp = matBirim(row);
        const tp = numHam(row._matToplam);
        // ⚠ TOPLAM, CARPIM KONTROLUNDEN BAGIMSIZ TOPLANIR (31.07).
        // Eskiden `matT += tp` YALNIZ `bp && tp` dalinin icindeydi: birim
        // fiyati olmayan ama tutari olan satirlar toplama HIC girmiyordu.
        // Boylece "hesap" kismi bir toplam oluyor, ekranin TAM toplamiyla
        // karsilastirilinca sahte SAPMA veriyordu (Mekanik 21.617.198 vs
        // 74.350.566). Uygulama ve cikti tum veri satirlarini toplar.
        // ⚠ CARPIM KONTROLU YALNIZ **BIZIM** HESABIMIZI SINAR (31.07).
        // `_matKaynak/_labKaynak === 'dosya'` ise deger MUSTERININ dosyasindan
        // gelmistir; orada birim × miktar = toplam sart DEGILDIR. 06-skychem
        // R26/R74 "Support imalatı & Askılama": birim 50.000, toplam 29.400
        // (goturu bedel). Bunu bizim aritmetik hatamiz saymak YANLIS kirmizi.
        // Sessizce atlanmaz — kanit metninde sayisi gorunur.
        if (bp && tp) {
          if (row._matKaynak === 'dosya') dosyadanSapan++;
          else {
            kontrol++;
            if (Math.abs(mik * bp - tp) > 0.05 * Math.max(1, tp)) {
              satirHata++;
              if (!ilkHata) ilkHata = `satir${row._rowIdx}: ${mik}×${bp}≠${tp}`;
            }
          }
        }
        if (tp) matT += tp;
        const lbp = labBirim(row), lt = numHam(row._labToplam);
        if (lbp && lt) {
          if (row._labKaynak === 'dosya') dosyadanSapan++;
          else {
            kontrol++;
            if (Math.abs(mik * lbp - lt) > 0.05 * Math.max(1, lt)) {
              satirHata++;
              if (!ilkHata) ilkHata = `satir${row._rowIdx} (isc): ${mik}×${lbp}≠${lt}`;
            }
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
        `fiyatlı hücre-çifti=${kontrol}, hesap-hatası=${satirHata}${dosyadanSapan ? `, dosyadan ${dosyadanSapan} çift (çarpım sınanmaz)` : ''}${ilkHata ? ' (' + ilkHata + ')' : ''}; sayfa hesap/ekran → ${detay}${sapan.length ? ` · SAPAN: ${sapan.map((s) => s.ad).join(',')}` : ''}; Σ=${toplamHesap.toFixed(1)}`);
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

  // ── C5: VERI KORUNUMU — hicbir malzeme satiri ve fiyat degeri dusmez ────
  //
  // ⚠ YENIDEN TANIMLANDI (31.07.2026, kullanici karari).
  // ESKI HALI: "fiyatli.xlsx musterinin dosya DUZENINI birebir korur"
  // (hucre hucre orijinalle karsilastirma). Bu, ciktinin musterinin dosyasina
  // YAZILDIGI mimarinin sartiydi. `d0597ea` ile o yaklasim BIRAKILDI —
  // kullanici karari 30.07: "fiyatli cikti standart 9 kolon olsun, musterinin
  // sablonuna yazmayi birak". Cikti artik SIFIRDAN uretilen yeni bir dosya,
  // dolayisiyla "duzen birebir" sorusu urunun bilerek terk ettigi bir sozu
  // olcuyordu (11 artefaktta 33 FAIL'in kaynagi buydu).
  //
  // KORUNAN CEKIRDEK: kriterin gercek degeri "duzen" degil, KAYIP YOK'tu.
  // Yeni olcut bunu dogrudan sinar: ekranda (kaydedilen grid'de) duran HER
  // malzeme satiri ve HER fiyat degeri ciktida BULUNUR. Boylece ileride
  // gercekten satir/deger dusersek yine KIRMIZI olur.
  {
    if (!payload || !fiyatli) set('C5', false, 'dosya/payload okunamadi');
    else {
      const kanitlar = [];
      let ok = true;
      // Ciktidaki tum metin ve sayilar (sayfa bazinda)
      const ciktiMetin = new Map(); // sayfaAdi → Set(metin)
      const ciktiSayi = new Map();  // sayfaAdi → Set(sayi.toFixed(2))
      for (const w of fiyatli.worksheets) {
        const m = new Set(); const s = new Set();
        w.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
          const t = txt(c.value).replace(/\s+/g, ' ').trim();
          if (t) m.add(t);
          const v = num(c.value); if (v) s.add(v.toFixed(2));
        }));
        ciktiMetin.set(w.name, m); ciktiSayi.set(w.name, s);
      }
      for (const sh of payload.sheets ?? []) {
        const satirlar = (sh.rowData ?? []).filter((r) => r?._isDataRow && !r?._ozet);
        // BOS sayfa ciktiya yazilmaz (standart-cikti.ts:245 `if (sh.isEmpty) continue`)
        // — KAPAK/İCMAL/KAYIT gibi veri satiri olmayan sayfalarda kaybolacak
        // bir sey de yoktur. Bunlari "sayfa yok" diye saymak YANLIS kirmizidir.
        if (sh.isEmpty || satirlar.length === 0) continue;
        const mSet = ciktiMetin.get(sh.name); const sSet = ciktiSayi.get(sh.name);
        if (!mSet) { ok = false; kanitlar.push(`çıktıda sayfa yok: ${sh.name} (${satirlar.length} veri satırı)`); continue; }
        // (a) malzeme adlari
        const kayipAd = [];
        for (const r of satirlar) {
          const ad = String(r._ad ?? '').replace(/\s+/g, ' ').trim();
          if (ad && !mSet.has(ad)) kayipAd.push(ad.slice(0, 26));
        }
        if (kayipAd.length) {
          ok = false;
          kanitlar.push(`${sh.name}: ${kayipAd.length} malzeme adı çıktıda YOK (ör. "${kayipAd[0]}")`);
        }
        // (b) fiyat/tutar degerleri — KUR ETKISI HESABA KATILIR.
        // Cikti USD/EUR secilmisse degerler TEK bir katsayiyla bolunmus olur
        // (EX6). Ham TL degerini aramak 04-aksa ve 11-sahinkul'de sahte
        // "veri kaybi" veriyordu. Katsayi sayfanin kendi toplamlarindan
        // TURETILIR, disaridan varsayilmaz.
        const payloadToplam = satirlar.reduce((a, r) =>
          // PK6: payload alani = MAKINE degeri → numHam. `num` burada
          // "323308.125"i 323 MILYON okuyup kur katsayisini bozuyordu.
          a + (numHam(r._matToplam) ?? 0) + (numHam(r._labToplam) ?? 0), 0);
        let ciktiToplam = 0;
        const fw = fiyatli.getWorksheet(sh.name);
        fw?.eachRow({ includeEmpty: false }, (row, rn) => {
          if (rn === 1) return;
          if (/toplam/i.test(txt(row.getCell(2).value))) return;
          const g = row.getCell(9).value;
          if (typeof g === 'number') ciktiToplam += g;
        });
        // Kur YALNIZ cikti TL DISI bir birimdeyse turetilir. Ozetteki para
        // isareti otoritedir ("genel toplam ₺28.080,0" vs "$1.224,0").
        // Kor turetme 03-bursa'da kur≈51 gibi sacma bir katsayi uretiyordu:
        // payload/cikti orani kur degil, YAZILMAYAN satirlarin etkisiydi.
        const ozetMetni = headers?.priced?.['x-export-summary']
          ? decodeURIComponent(headers.priced['x-export-summary']) : '';
        const tlCikti = ozetMetni.includes('₺') || !/[$€]/.test(ozetMetni);
        const kur = (!tlCikti && payloadToplam > 0 && ciktiToplam > 0) ? payloadToplam / ciktiToplam : 1;
        const varMi = (v) => {
          const hedef = v / kur;
          if (sSet.has(hedef.toFixed(2))) return true;
          // 1 kurus tolerans (yuvarlama) — set'te yakin deger ara
          for (const s of sSet) if (Math.abs(parseFloat(s) - hedef) <= Math.max(0.01, Math.abs(hedef) * 0.001)) return true;
          return false;
        };
        // Fiyat alanlari ROL uzerinden okunur — yazicinin yaptigi gibi
        // (standart-cikti.ts: `A('materialTotalField', '_matToplam')`).
        // Sabit alandan okumak, rolu DOSYA kolonuna (colN) bagli sayfalarda
        // yazicinin hic bakmadigi bir hucreyi "kayip" gosteriyordu.
        const rolAlan = (rol, vars) => {
          const v = sh.columnRoles?.[rol];
          return (typeof v === 'string' && v) ? v : vars;
        };
        const alanlar = [
          rolAlan('materialUnitPriceField', '_matBirim'),
          rolAlan('materialTotalField', '_matToplam'),
          rolAlan('laborUnitPriceField', '_labBirim'),
          rolAlan('laborTotalField', '_labToplam'),
        ];
        const kayipDeger = [];
        for (const r of satirlar) {
          for (const f of alanlar) {
            const v = numHam(r?.[f]);
            if (v && !varMi(v)) kayipDeger.push(`${f}=${v}`);
          }
        }
        if (kayipDeger.length) {
          ok = false;
          kanitlar.push(`${sh.name}: ${kayipDeger.length} fiyat değeri çıktıda YOK`
            + `${kur !== 1 ? ` (kur≈${kur.toFixed(3)})` : ''} (ör. ${kayipDeger[0]})`);
        }
      }
      set('C5', ok, ok
        ? `veri korunumu tam (${(payload.sheets ?? []).length} sayfa; ad + fiyat değerleri çıktıda)`
        : 'VERİ KAYBI: ' + kanitlar.slice(0, 4).join(' · '));
    }
  }

  // ── C5b: orijinal dosyayla DUZEN farki — YALNIZ BILGI, kriter DEGIL ─────
  // Eski C5 buydu ve KRITERDI. Standart ciktiya gecince (d0597ea) "duzen
  // birebir" sarti anlamini yitirdi: cikti artik musterinin dosyasi degil.
  // Olcum silinmedi ama N/A'ya alindi — fark GORUNUR kalsin, kapi olmasin.
  {
    if (!orj || !fiyatli) set('C5b', null, 'dosya okunamadi');
    else {
      const ov = visibleSheets(orj);
      let ok = true; const kanitlar = [];
      // Grid'de dolu TUM fiyat/toplam degerleri — dosyada yazilan her yeni sayi
      // bunlardan biri OLMALI (C5: "grid'de dolu her deger dosyada, dogru
      // kolonda"). Fiyatlandirma zaten mevcut fiyat kolonunu gunceller (KG
      // serisi); bozulma = grid'de KARSILIGI OLMAYAN sayi.
      const gridDegerleri = new Set();
      for (const sh of payload?.sheets ?? []) for (const row of sh.rowData ?? []) {
        for (const f of ['_matBirim', '_matToplam', '_labBirim', '_labToplam', '_toplam', '_matNetPrice', '_labNetPrice']) {
          // PK6: payload alani = MAKINE degeri → numHam. Asagidaki `gridde(s)`
          // ise DOSYA metnini okur (insan yazimi) ve `num` ile dogrudur —
          // ayni satirda iki farkli girdi sinifi var, ikisi ayri fonksiyon.
          const v = numHam(row?.[f]); if (v) gridDegerleri.add(v.toFixed(2));
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
      set('C5b', null, (ok ? `düzen birebir (${ov.length} sayfa)` : 'düzen farkı (BEKLENEN — standart çıktı): ')
        + (kanitlar.length ? kanitlar.slice(0, 3).join(' · ') : ''));
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
      // İCMAL bazen YALNIZ KDV'li toplami tasir (formatin GENEL TOPLAM satiri
      // KDV ekliyor). 31.07 olcumu: 103.525.586,6 ÷ 1,2 = 86.271.322,2 =
      // ekran toplami TAM. Eski olcut yalniz KDV'siz degeri ariyordu ve
      // "eslesme yok" diyordu. KDV'li karsilik da MESRU sayilir.
      const KDV = 1.2;
      const yakinMi = (v, hedef) => Math.abs(v - hedef) <= Math.max(1, Math.abs(hedef) * 0.01);
      const icmalHit = hedefGenel != null && icmalDegerler.some((v) =>
        yakinMi(v, hedefGenel) || yakinMi(v, hedefGenel * KDV));
      // liste sayfalari enjekte: orijinal gorunur sayfa adlarinin en az biri teklifte
      const enjekte = orj ? visibleSheets(orj).some((w) => teklif.getWorksheet(w.name)) : false;
      const ok = !!kapak && musteriOk && !!icmal && (hedefGenel == null || hedefGenel === 0 ? true : icmalHit) && enjekte;
      set('C6', ok, `kapak=${!!kapak} müşteri=${musteriOk} icmal=${!!icmal} icmalToplamEşleşme=${icmalHit}`
        // ⚠ HARNESS COKMESI (31.07): `ekranGenel` null iken `hedefGenel` de
        // null olur (satir 426) ama bu ifadede optional-chain YOKTU — USD
        // artefaktinda (kur !== 1) dal calisip TypeError atiyor, dogrulayici
        // C6'da olup C1-C11 MATRISI HIC URETILMIYORDU. Kriter degil, rapor
        // metni cokuyordu; null artik acikca yaziliyor.
        + ` (ekran=${ekranGenel?.toFixed(1) ?? '?'}${kur !== 1 ? ` → ${hedefGenel?.toFixed(1) ?? '?'} @kur ${kur}` : ''}, icmalMax=${icmalMax.toFixed(1)})`
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
    // ⚠ YENIDEN TANIMLANDI (31.07.2026). ESKI HALI eski export-engine'in yazma
    // mantigini payload'dan TAKLIT ediyordu; standart yazici (standart-cikti.ts)
    // baska sayiyor → 11 artefaktta tutmuyordu.
    // Yeni olcut ARTEFAKTTAN sayar (gercekten bagimsiz): yazici `yazilan`i,
    // veri satirlarinda 5-9. kolonlardaki SAYISAL hucreler olarak artiriyor
    // (standart-cikti.ts:199-202); sayfa alti TOPLAM satiri sayilmaz.
    let beklenenDeger = 0;
    for (const fw of fiyatli?.worksheets ?? []) {
      if (txt(fw.getRow(1).getCell(1).value).trim() !== 'No') continue; // ozet sayfasi
      fw.eachRow({ includeEmpty: false }, (row, rn) => {
        if (rn === 1) return;                                    // baslik
        if (/toplam/i.test(txt(row.getCell(2).value))) return;   // sayfa alti toplam
        for (let c = 5; c <= 9; c++) {
          if (typeof row.getCell(c).value === 'number') beklenenDeger++;
        }
      });
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

  // ── C11 (KE21): FAZLADAN KOLON YOK ────────────────────────────────────
  // 28-29.07 kosumu C1-C10'u YESIL verdi ama SAHINKUL ciktisinda sablon
  // disina M/N ("Malz. Birim Fiyat" / "Malz. Toplam") kolonlari eklenmisti —
  // hicbir kriter kolon SAYISINA bakmiyordu. KE16: anlamsal eslesme varken
  // kolon eklemek YASAK. KF2: eslesme GERCEKTEN yoksa (sablonda o rolun
  // basligi hic yoksa) dolu veri icin ekleme MESRU. KE8: verisiz kolon
  // hicbir kosulda eklenemez.
  //
  // ⚠ YENIDEN TANIMLANDI (31.07.2026, kullanici karari: "cikti aynen bu
  // sekilde olacak, ilave sutun yok"). ESKI HALI ciktiyi ORIJINAL sablonla
  // karsilastiriyordu ("sablon disina kolon eklenmis mi"). Standart ciktida
  // sablon YOK — dosya sifirdan uretiliyor. Yeni olcut dogrudan kullanicinin
  // cumlesi: her VERI sayfasi TAM OLARAK 9 standart kolondur, 10. kolonda
  // hicbir sey olamaz.
  {
    if (!fiyatli) set('C11', false, 'fiyatli.xlsx okunamadi');
    else {
      // Kaynak: backend/src/quotes/standart-cikti.ts → STANDART_CIKTI_KOLONLARI
      const STD = ['No', 'Malzeme Adı', 'Miktar', 'Birim', 'Malz. Birim Fiyat',
        'Malz. Toplam', 'İşç. Birim Fiyat', 'İşç. Toplam', 'Genel Toplam'];
      const ihlal = [];
      let veriSayfa = 0;
      for (const fw of fiyatli.worksheets) {
        const bas = [];
        fw.getRow(1).eachCell({ includeEmpty: false }, (c) => bas.push(txt(c.value).replace(/\s+/g, ' ').trim()));
        if (bas[0] !== 'No') continue; // ozet/GENEL TOPLAM sayfasi — kendi duzeni
        veriSayfa++;
        if (JSON.stringify(bas) !== JSON.stringify(STD)) {
          ihlal.push(`${fw.name}: başlık standart 9 kolon DEĞİL → [${bas.join('|').slice(0, 60)}]`);
          continue;
        }
        // 10. kolon ve sonrasinda TEK BIR DOLU HUCRE bile olamaz
        let fazla = 0; let ornek = '';
        fw.eachRow({ includeEmpty: false }, (row, rn) => row.eachCell({ includeEmpty: false }, (c, cn) => {
          if (cn <= STD.length) return;
          if (!txt(c.value).trim()) return;
          fazla++;
          if (!ornek) ornek = `R${rn}C${cn}="${txt(c.value).slice(0, 14)}"`;
        }));
        if (fazla) ihlal.push(`${fw.name}: 9. kolondan SONRA ${fazla} dolu hücre (${ornek})`);
      }
      set('C11', veriSayfa > 0 && ihlal.length === 0,
        ihlal.length ? 'İLAVE SÜTUN: ' + ihlal.slice(0, 3).join(' · ')
          : `${veriSayfa} veri sayfası tam 9 standart kolon, ilave sütun yok`);
    }
  }

  // ── C11b: eski sablon-kiyaslamasi — YALNIZ BILGI (kriter DEGIL) ─────────
  {
    if (!orj || !fiyatli) set('C11b', null, 'dosya okunamadi');
    else {
      const ihlaller = [], mesrular = [];
      for (const ws of visibleSheets(orj)) {
        const fw = fiyatli.getWorksheet(ws.name);
        if (!fw) continue;
        const orjSon = sonDoluKolon(ws), ciktiSon = sonDoluKolon(fw);
        if (ciktiSon <= orjSon) continue;
        // Baslik bandi: en az ilk 12 satir. DAR band tuzagi: headerEndRow=2
        // ile YALNIZ R1-R3 okununca SAHINKUL'un R4 alt basligi ("BİRİM
        // FİYAT") gorunmuyor, iki katmanli baslik "MALZEME"de kesiliyor ve
        // ihlal MESRU EKLEME sanilıyordu.
        const sh = (payload?.sheets ?? []).find((s) => s.name === ws.name);
        const baslikSonu = Math.min(30, Math.max(12, (sh?.headerEndRow ?? 0) + 2));
        for (let c = orjSon + 1; c <= ciktiSon; c++) {
          const bas = kolonYiginMetni(fw, c, baslikSonu);
          if (!bas) continue; // baslik yok → salt bicim artigi
          const rol = rolTani(bas);
          const veri = kolondaVeriVar(fw, c);
          const yer = `${ws.name}!${KOLON_ADI(c)} "${bas.slice(0, 22)}"`;
          if (veri === 0) { ihlaller.push(`${yer} → VERİSİZ kolon eklendi (KE8)`); continue; }
          const mevcut = rol ? rolBasligiVar(ws, orjSon, baslikSonu, rol) : null;
          if (mevcut) ihlaller.push(`${yer} → şablonda ${KOLON_ADI(mevcut)} zaten bu anlamda (KE16 ihlali, ${veri} değer)`);
          else mesrular.push(`${yer} (KF2 meşru: şablonda ${rol ?? '?'} başlığı yok, ${veri} değer)`);
        }
      }
      set('C11b', null,
        (ihlaller.length ? 'şablona göre fark (BEKLENEN — standart çıktı): ' + ihlaller.slice(0, 3).join(' · ')
          : mesrular.length ? 'şablon dışına kolon eklenmedi: ' + mesrular.slice(0, 2).join(' · ')
            : 'şablon dışına kolon eklenmedi'));
    }
  }

  if (senaryo) {
    const h = senaryo.SD?.hedefler ?? [];
    R.notlar.push(`BÖLÜM D · KG10: ${senaryo.KG10?.iscilikDoluSatir} satırda dosyanın işçilik fiyatı yüklemede görünür`);
    R.notlar.push(`BÖLÜM D · SD: kaynak ${senaryo.kaynak?.birim} → ${h.map((x) => `${x.cap}=${x.birim || (x.isaret ? 'İŞARET' : 'BOŞ')}`).join(' ')}`);
    R.notlar.push(`BÖLÜM D · KG13: kur etiketi "${senaryo.KG13?.kurEtiketi}" · malzeme+işçilik oran aralığı ${JSON.stringify(senaryo.KG13?.kurAraligi)}`);
  }
  results.push(R);
}

// ── Rapor ──────────────────────────────────────────────────────────────
// KD6: C5b ve C11b ARTIK MATRISTE. Onceden dosyada duruyor ama `KEYS`'te
// olmadiklari icin HIC BASILMIYORLARDI — KE16 · KG2 · KF1'in "kaniti" tam
// olarak oralardaydi. Tehlike somut: biri verify.mjs'te `KE16` diye arar,
// bulur, "kapsanmis" sanir. Kod var, cikti yok, kimse fark etmiyor (I7 ailesi).
// Ikisi de N/A doner ("–"); gorunur olmalari, N/A olduklarinin GORULMESI icin.
const KEYS = KEYS_SOZLESME;

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
