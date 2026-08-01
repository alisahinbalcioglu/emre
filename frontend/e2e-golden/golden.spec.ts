/* E2E ALTIN YOL — 10 gercek dosya: yukle → fiyatla → kaydet → yeniden ac →
 * 2 export → artifacts. Dogrulama (C1-C10) ayri: verify.mjs (programatik).
 * Gorev: GOREV_E2E_10_Dosya_Altin_Yol_Kosumu.md (test-fixtures/e2e/). */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { artefaktKok } from './artefakt-dizini.cjs';
import {
  harvestGrid, selectDropdown, fillFamilyDown, waitForPricesToSettle,
  resolvePopupIfAny, listDropdownOptions, policyBrand, PopupLogEntry, Harvest,
} from './helpers';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');

/** Fixture'in DISKTEKI gercek adini bul. Windows'ta Turkce adlar NFD
 *  (ayrik birlestirici) saklanabilir; spec'teki NFC string ENOENT verir
 *  ("F _ G ... işleri ..." vakasi, 09 dosyasi hic kosmamisti). */
const gercekYol = (ad: string) => {
  const tam = path.join(FIXTURES, ad);
  if (fs.existsSync(tam)) return tam;
  const hedef = ad.normalize('NFC');
  const bulunan = fs.readdirSync(FIXTURES).find((f) => f.normalize('NFC') === hedef);
  if (!bulunan) throw new Error(`Fixture bulunamadi: ${ad}`);
  return path.join(FIXTURES, bulunan);
};
// PK10: her kosum kendi damgali dizinine yazar (uzerine yazma yok)
const ARTIFACTS = artefaktKok();
const AUTH = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8'));

interface FileCase { file: string; slug: string; usd?: boolean }
// 10 dosya — usd: gorev §1 "bir teklif USD gorunumune cevrilip kaydedilir"
const CASES: FileCase[] = [
  { file: 'FIRMA-B MÜHENDİSLİK-SAHA-DORT OKUL PROJESİ SAHA-BES.xlsx', slug: '01-firma-b-okul' },
  { file: 'FIRMA-E Mobilya Metraj - Copy.xlsx', slug: '02-firma-e-mobilya' },
  { file: '0_Bursa SAHA-BIR inşai işler - Revize Keşif (1).xlsx', slug: '03-bursa-saha-bir' },
  { file: '2024-0001-FIRMA-F_SAHA-IKI_YSS -R003 -FIRMA-B.xlsx', slug: '04-firma-f-saha-iki-yss', usd: true },
  { file: 'İşçilik_Hangar Yangın Keşif Özeti_R02 (1).xlsx', slug: '05-hangar-yangin' },
  { file: 'FIRMA-B-2024-0063-R1-FIRMA-G-altnf 1-R1.xlsm', slug: '06-firma-g' },
  { file: '2024-0001-FIRMA-F Enerji-SAHA-IKI Algılama - İŞÇİLİK.xlsm', slug: '07-firma-f-algilama-iscilik' },
  { file: 'FIRMA-A KEŞİF ÖZETİ 251224 R1 - FIRMA-B MÜHENDİSLİK.xlsx', slug: '08-firma-a' },
  { file: 'F _ G mekanik-elektrik işleri FIRMA-H müh. 14.04.2026 teklif.xlsx', slug: '09-fg-firma-h' },
  { file: 'yangin-temin-montaj.xlsx', slug: '10-yangin-temin-montaj' },
];

// NOT: serial mode KULLANILMAZ — bir dosyanin FAIL'i digerlerini iptal
// ederse "10 dosya x C1-C10" matrisi olusmaz (ilk kosumda 03 timeout'a
// dustu, 7 dosya HIC kosmadi). workers:1 zaten sirali koşturur.

for (const c of CASES) {
  test(`altin yol — ${c.slug}`, async ({ page }) => {
    const dir = path.join(ARTIFACTS, c.slug);
    fs.mkdirSync(dir, { recursive: true });
    const timing: Record<string, number> = {};
    const t0 = () => Date.now();
    const consoleErrors: string[] = [];
    const popupLog: PopupLogEntry[] = [];
    let savePayload: any = null;
    let savedQuote: any = null;
    let createdId = '';
    const exportHeaders: Record<string, Record<string, string>> = {};

    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 300)));
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/quotes$/.test(req.url())) {
        try { savePayload = req.postDataJSON(); } catch { /* buyuk payload */ }
      }
    });
    page.on('response', async (res) => {
      const u = res.url();
      if (/\/api\/quotes$/.test(u) && res.request().method() === 'POST') {
        try { createdId = (await res.json())?.id ?? ''; } catch { /* no-op */ }
      }
      if (/export-priced|\/export$/.test(u)) {
        const h = res.headers();
        const key = /export-priced/.test(u) ? 'priced' : 'format';
        // ard arda indirmede son basligi tut + C9 icin ikinciyi ayri anahtara
        exportHeaders[exportHeaders[key] ? key + '-2' : key] = {
          'x-export-summary': h['x-export-summary'] ?? '',
          'x-export-warning': h['x-export-warning'] ?? '',
          'content-disposition': h['content-disposition'] ?? '',
        };
      }
    });
    await page.addInitScript((auth) => {
      localStorage.setItem('token', auth.token);
      localStorage.setItem('user', JSON.stringify(auth.user));
    }, AUTH);

    // ── 1) YUKLE ─────────────────────────────────────────────────────
    let t = t0();
    await page.goto('/quotes/new');
    await page.locator('#quote-excel-upload').setInputFiles(gercekYol(c.file));
    await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
    // "N sayfa yuklendi" bilgisi
    const sayfaInfo = await page.getByText(/sayfa yuklendi/).first().textContent().catch(() => '');
    timing.yukleme_ms = t0() - t;
    await page.screenshot({ path: path.join(dir, 'ss-1-yuklendi.png') });

    // ── 2) FIYATLAMA POLITIKASI (her sekme) ──────────────────────────
    t = t0();
    // sekme listesi (SheetTabs, alttaki sticky bar; title=sheet adi)
    const tabBtns = page.locator('.sticky.bottom-0 button[title]');
    const tabCount = await tabBtns.count();
    const sheetNames: string[] = [];
    for (let i = 0; i < Math.max(1, tabCount); i++) sheetNames.push(tabCount ? (await tabBtns.nth(i).getAttribute('title')) ?? `Sayfa ${i + 1}` : 'tek-sayfa');
    const sheetsScreen: { name: string; harvest: Harvest }[] = [];
    let brandOptions: string[] = [];

    for (let si = 0; si < sheetNames.length; si++) {
      if (tabCount > 1) { await tabBtns.nth(si).click(); await page.waitForTimeout(700); }
      const pre = await harvestGrid(page);
      const dataRows = pre.rows.filter((r) => r.hasMarka);
      if (dataRows.length === 0) { sheetsScreen.push({ name: sheetNames[si], harvest: pre }); continue; }
      // isim = alt-cizgisiz kolonlar arasindaki en uzun metin
      const nameOf = (r: (typeof dataRows)[number]) => {
        let best = '';
        for (const [k, v] of Object.entries(r.cells)) if (!k.startsWith('_') && v.length > best.length) best = v;
        return best;
      };
      if (brandOptions.length === 0) brandOptions = await listDropdownOptions(page, dataRows[0].idx, '_marka');
      // dosya marka kolonu: hucre metni mevcut markalardan birine benziyorsa
      // dosya marka kolonu sezgiseli: en az 4 harfli metin + iki yonde ANLAMLI
      // kapsama (kisa "1"/"mt" hucrelerinin marka adiyla eslesmesi YASAK —
      // ilk kosumda "__KL_MARKA_1784..." coplerini secmisti)
      const brandNorm = brandOptions.map((b) => b.toLocaleLowerCase('tr'));
      const fileBrandOf = (r: (typeof dataRows)[number]) => {
        for (const [k, v] of Object.entries(r.cells)) {
          if (k.startsWith('_') || !v || v.length > 30) continue;
          const n = v.toLocaleLowerCase('tr').trim();
          if (n.length < 4 || !/[a-zçğıöşü]{3,}/.test(n)) continue;
          if (brandNorm.some((b) => b === n || (b.includes(n) && n.length >= 4) || (n.includes(b) && b.length >= 4))) return v;
        }
        return '';
      };
      // aileler: ardisik data satirlari (aralarindaki bosluk/baslik boler)
      const families: { rows: typeof dataRows }[] = [];
      let cur: typeof dataRows = [];
      let prevIdx = -99;
      for (const r of dataRows) {
        if (r.idx !== prevIdx + 1 && cur.length) { families.push({ rows: cur }); cur = []; }
        cur.push(r); prevIdx = r.idx;
      }
      if (cur.length) families.push({ rows: cur });

      for (const fam of families) {
        const head = fam.rows[0];
        const marka = policyBrand(fileBrandOf(head), nameOf(head), brandOptions);
        if (!marka) continue;
        const ok = await selectDropdown(page, head.idx, '_marka', marka);
        if (ok) {
          await resolvePopupIfAny(page, head.idx, nameOf(head), popupLog);
          if (fam.rows.length > 1) {
            await fillFamilyDown(page, head.idx, '_marka');
            await waitForPricesToSettle(page);
            // doldurma sonrasi acik popup kalmis olabilir
            await resolvePopupIfAny(page, head.idx, nameOf(head) + ' (fill)', popupLog);
          } else {
            await waitForPricesToSettle(page, 30_000);
          }
        }
      }
      // iscilik: sayfanin ilk ailesinde firma sec + aileyi doldur (17a)
      const firmaOpts = await listDropdownOptions(page, dataRows[0].idx, '_firma');
      if (firmaOpts.length > 0) {
        const okF = await selectDropdown(page, dataRows[0].idx, '_firma', firmaOpts[0]);
        if (okF) {
          await resolvePopupIfAny(page, dataRows[0].idx, nameOf(dataRows[0]) + ' (iscilik)', popupLog);
          if (families[0].rows.length > 1) { await fillFamilyDown(page, dataRows[0].idx, '_firma'); await waitForPricesToSettle(page, 60_000); }
        }
      }
      sheetsScreen.push({ name: sheetNames[si], harvest: await harvestGrid(page) });
      console.log(`  [${c.slug}] sayfa ${si + 1}/${sheetNames.length} "${sheetNames[si]}" — ${families.length} aile, ${dataRows.length} data satiri, ${Math.round((t0() - t) / 1000)}s`);
      // navigasyon korumasi: yanlislikla sayfadan dusulduyse ERKEN ve NET hata
      expect(page.url(), 'fiyatlama sirasinda /quotes/new terk edildi').toContain('/quotes/new');
    }
    timing.fiyatlama_ms = t0() - t;
    await page.screenshot({ path: path.join(dir, 'ss-2-fiyatli.png'), fullPage: false });

    // ── 3) USD (yalniz isaretli dosya) + kapak alanlari ──────────────
    if (c.usd) {
      await page.getByRole('button', { name: 'USD', exact: true }).click();
      await page.waitForTimeout(1200);
    }
    await page.getByPlaceholder('Müşteri (kapak için)').fill('E2E Test Müşterisi');
    await page.getByPlaceholder('Proje').fill('Altın Yol Koşumu');

    // ── 4) KAYDET ────────────────────────────────────────────────────
    t = t0();
    await page.getByRole('button', { name: 'Teklifi Kaydet' }).click();
    await page.waitForURL('**/quotes', { timeout: 120_000 });
    timing.kaydet_ms = t0() - t;
    expect(createdId, 'POST /quotes id donmeli').toBeTruthy();

    // ── 5) YENIDEN AC (kalicilik) ────────────────────────────────────
    t = t0();
    const respPromise = page.waitForResponse((r) => r.url().includes(`/api/quotes/${createdId}`) && r.request().method() === 'GET', { timeout: 60_000 });
    await page.goto(`/quotes/${createdId}`);
    try { savedQuote = await (await respPromise).json(); } catch { savedQuote = null; }
    await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1000);
    const reopenHarvest = await harvestGrid(page);
    const activeCurrency = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter((b) => ['TL', 'USD', 'EUR'].includes((b.textContent ?? '').trim()));
      const act = btns.find((b) => (b.className ?? '').includes('bg-background'));
      return act ? (act.textContent ?? '').trim() : '';
    });
    timing.yeniden_acma_ms = t0() - t;
    await page.screenshot({ path: path.join(dir, 'ss-3-yeniden-acildi.png') });

    // ── 6) IKI EXPORT + C9 (ikinci indirme) ──────────────────────────
    const indir = async (btnAd: string, hedef: string) => {
      const ti = t0();
      const dl = page.waitForEvent('download', { timeout: 180_000 });
      await page.getByRole('button', { name: btnAd }).click();
      const d = await dl;
      await d.saveAs(path.join(dir, hedef));
      return t0() - ti;
    };
    timing.export_fiyatli_ms = await indir('Fiyatlandırılmış Excel', 'fiyatli.xlsx');
    await page.waitForTimeout(800);
    timing.export_teklif_ms = await indir('Teklif Formatında Aktar', 'teklif.xlsx');
    await page.waitForTimeout(800);
    timing.export_fiyatli_2_ms = await indir('Fiyatlandırılmış Excel', 'fiyatli-2.xlsx'); // C9

    // ── 7) EKRAN VERISI + LOGLAR → artifacts ─────────────────────────
    fs.writeFileSync(path.join(dir, 'screen.json'), JSON.stringify({
      file: c.file, usd: !!c.usd, sayfaInfo, sheetNames,
      sheets: sheetsScreen, reopen: { harvest: reopenHarvest, currency: activeCurrency },
      createdId,
    }, null, 1));
    fs.writeFileSync(path.join(dir, 'save-payload.json'), JSON.stringify(savePayload, null, 1));
    fs.writeFileSync(path.join(dir, 'saved-quote.json'), JSON.stringify(savedQuote, null, 1));
    fs.writeFileSync(path.join(dir, 'popups.json'), JSON.stringify(popupLog, null, 1));
    fs.writeFileSync(path.join(dir, 'console.json'), JSON.stringify(consoleErrors, null, 1));
    fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify(timing, null, 1));
    fs.writeFileSync(path.join(dir, 'export-headers.json'), JSON.stringify(exportHeaders, null, 1));

    // asgari canlilik kontrolleri (derin dogrulama verify.mjs'te)
    expect(fs.statSync(path.join(dir, 'fiyatli.xlsx')).size).toBeGreaterThan(1000);
    expect(fs.statSync(path.join(dir, 'teklif.xlsx')).size).toBeGreaterThan(1000);
    expect(fs.statSync(path.join(dir, 'fiyatli-2.xlsx')).size).toBeGreaterThan(1000);
  });
}
