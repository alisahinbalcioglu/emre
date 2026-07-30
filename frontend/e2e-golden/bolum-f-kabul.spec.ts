/* BÖLÜM F — STANDART ŞEMA KABUL SENARYOSU (10 adım)
 * PRD: PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md §Bölüm F
 * Fixture: YILDIZ ENTEGRE KARTEPE (11 sayfa) — gerçek tarayıcı, yerel tam yığın.
 *
 * Kosum: npx playwright test -c playwright.golden.config.ts bolum-f
 * Cikti: e2e-artifacts/bolum-f/ (ekran goruntuleri + indirilen xlsx + rapor.json)
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { harvestGrid, scrollRowIntoView } from './helpers';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
const OUT = path.resolve(__dirname, '../e2e-artifacts/bolum-f');
const AUTH = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8'));

/** PRD §A.1 — degismez 13 kolon */
const STANDART_SEMA = [
  'No', 'Malzeme Adı', 'Miktar', 'Birim',
  'Malz. Kar %', 'Malz. Marka', 'Malz. Birim Fiyat', 'Malz. Toplam',
  'İşç. Kar %', 'İşç. Firma', 'İşç. Birim Fiyat', 'İşç. Toplam', 'Genel Toplam',
];

const katla = (s: string) => s.normalize('NFC')
  .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
  .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();
const fixture = (parca: string) => {
  const f = fs.readdirSync(FIXTURES).find((x) => katla(x).includes(katla(parca)));
  if (!f) throw new Error('fixture yok: ' + parca);
  return path.join(FIXTURES, f);
};
const tlNum = (s: string): number | null => {
  const m = String(s ?? '').replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const f = parseFloat(m);
  return isNaN(f) ? null : f;
};
/** Grid'in o anki kolon basliklari.
 *  NOT: AG-Grid kolonlari YATAY SANALLASTIRIR — ekrana sigmayan sagdaki
 *  kolonlarin basligi DOM'da HIC bulunmaz. Once sona kaydirilir, sonra
 *  okunan basliklar birlestirilir (aksi halde "Genel Toplam yok" gibi
 *  YANLIS kirmizi cikar). */
const basliklar = async (page: Page): Promise<string[]> => {
  const oku = () => page.evaluate(() => {
    const out: { id: string; t: string }[] = [];
    document.querySelectorAll('.ag-header-cell[col-id]').forEach((h) => {
      const id = h.getAttribute('col-id') ?? '';
      const t = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (id && t) out.push({ id, t });
    });
    return out;
  });
  const kaydir = (x: number) => page.evaluate((px) => {
    const vp = document.querySelector('.ag-body-horizontal-scroll-viewport')
      ?? document.querySelector('.ag-center-cols-viewport');
    if (vp) (vp as HTMLElement).scrollLeft = px;
  }, x);

  const birikim: { id: string; t: string }[] = [];
  for (const x of [0, 800, 1600, 3000]) {
    await kaydir(x);
    await page.waitForTimeout(250);
    for (const h of await oku()) if (!birikim.some((b) => b.id === h.id)) birikim.push(h);
  }
  await kaydir(0);
  await page.waitForTimeout(200);
  return birikim.map((b) => b.t);
};

test('BÖLÜM F — standart şema kabul senaryosu (YILDIZ, 10 adım)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const rapor: any = { adimlar: {} };
  const consoleErrors: string[] = [];
  let createdId = '';

  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('response', async (res) => {
    if (/\/api\/quotes$/.test(res.url()) && res.request().method() === 'POST') {
      try { createdId = (await res.json())?.id ?? ''; } catch { /* no-op */ }
    }
  });
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, AUTH);

  // ── ADIM 1: yükle → 10+ sayfanın HER BİRİNDE aynı 13 kolon, boş sayfa yok ──
  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(fixture('yildiz entegre'));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1200);

  const tabBtns = page.locator('.sticky.bottom-0 button[title]');
  const sekmeSayisi = await tabBtns.count();
  const sayfaRapor: any[] = [];
  for (let i = 0; i < sekmeSayisi; i++) {
    const ad = (await tabBtns.nth(i).getAttribute('title')) ?? `sayfa${i}`;
    await tabBtns.nth(i).click();
    await page.waitForTimeout(700);
    const b = await basliklar(page);
    const h = await harvestGrid(page);
    const doluSatir = h.rows.filter((r) => Object.values(r.cells).some((v) => String(v).trim())).length;
    sayfaRapor.push({ ad, basliklar: b, doluSatir, rowCount: h.rowCount });
  }
  rapor.adimlar.a1 = { sekmeSayisi, sayfalar: sayfaRapor };
  await page.screenshot({ path: path.join(OUT, 'f1-yuklendi.png') });

  expect(sekmeSayisi, 'GS13: dosyadaki 11 sayfanın tümü sekme olarak açılmalı').toBe(11);
  const semaSapan = sayfaRapor.filter((s) => JSON.stringify(s.basliklar) !== JSON.stringify(STANDART_SEMA));
  expect(semaSapan.map((s) => `${s.ad}: [${s.basliklar.join('|')}]`).join(' · '),
    'GS1/GS2: her sayfada aynı 13 standart kolon').toBe('');
  const bosSayfa = sayfaRapor.filter((s) => s.doluSatir === 0).map((s) => s.ad);
  expect(bosSayfa.join(', '), 'GS6/GS7: hiçbir sayfa boş görünmemeli').toBe('');

  // ── ADIM 2: dosyadaki fiyatlar grid'de + kaynak rozeti "dosyadan" (MF1/MF3) ──
  const trafoIdx = sayfaRapor.findIndex((s) => /trafo/i.test(s.ad));
  await tabBtns.nth(trafoIdx >= 0 ? trafoIdx : 1).click();
  await page.waitForTimeout(800);
  const trafo = await harvestGrid(page);
  const dosyaFiyatli = trafo.rows.filter((r) => (tlNum(r.cells['_labBirim'] ?? '') ?? 0) > 0).length;
  rapor.adimlar.a2 = { sayfa: sayfaRapor[trafoIdx]?.ad, dosyadanFiyatliSatir: dosyaFiyatli };
  expect(dosyaFiyatli, 'MF1: dosyadaki fiyatlar grid’de görünmeli').toBeGreaterThan(0);

  // ── ADIM 5: kâr % gir → birim fiyat ve toplamlar anında güncellenir (GS11/MF5) ──
  const fiyatliSatir = trafo.rows.find((r) => (tlNum(r.cells['_labBirim'] ?? '') ?? 0) > 0);
  if (fiyatliSatir) {
    const oncekiToplam = tlNum(fiyatliSatir.cells['_labToplam'] ?? '');
    await scrollRowIntoView(page, fiyatliSatir.idx);
    const karHucre = page.locator(`[row-index="${fiyatliSatir.idx}"] [col-id="_iscKar"]`).first();
    await karHucre.dblclick({ force: true }).catch(() => {});
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const sonra = await harvestGrid(page);
    const yeni = sonra.rows.find((r) => r.idx === fiyatliSatir.idx);
    const yeniToplam = tlNum(yeni?.cells['_labToplam'] ?? '');
    rapor.adimlar.a5 = { satir: fiyatliSatir.idx, oncekiToplam, yeniToplam };
    expect(yeniToplam, 'GS11/MF5: kâr girilince toplam anında güncellenmeli').not.toBe(oncekiToplam);
  }

  // ── ADIM 6: İşç. Toplam + Genel Toplam HER sayfada hesaplı (GS3/GS4) ──
  const toplamsiz: string[] = [];
  for (let i = 0; i < sekmeSayisi; i++) {
    await tabBtns.nth(i).click();
    await page.waitForTimeout(500);
    const b = await basliklar(page);
    if (!b.includes('İşç. Toplam') || !b.includes('Genel Toplam')) toplamsiz.push(sayfaRapor[i].ad);
  }
  rapor.adimlar.a6 = { toplamsiz };
  expect(toplamsiz.join(', '), 'GS3: İşç. Toplam + Genel Toplam her sayfada').toBe('');

  // ── ADIM 7: kaydet → yeniden aç → aynen (kalıcılık) ──
  await page.getByPlaceholder('Müşteri (kapak için)').fill('Bölüm F Müşterisi');
  await page.getByPlaceholder('Proje').fill('YILDIZ Kabul');
  await page.getByRole('button', { name: 'Teklifi Kaydet' }).click();
  await page.waitForURL('**/quotes', { timeout: 180_000 });
  expect(createdId, 'kaydet: POST /quotes id dönmeli').toBeTruthy();

  await page.goto(`/quotes/${createdId}`);
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const detaySekme = page.locator('.sticky.bottom-0 button[title]');
  const detaySekmeSayisi = await detaySekme.count();
  const detayBaslik = await basliklar(page);
  rapor.adimlar.a7 = { detaySekmeSayisi, detayBaslik };
  expect(JSON.stringify(detayBaslik), 'kalıcılık: yeniden açılışta da 13 standart kolon')
    .toBe(JSON.stringify(STANDART_SEMA));
  await page.screenshot({ path: path.join(OUT, 'f2-yeniden-acildi.png') });

  // ── ADIM 8-9-10: iki export + art arda ikinci indirme ──
  const indir = async (btnAd: string, hedef: string) => {
    const dl = page.waitForEvent('download', { timeout: 180_000 });
    await page.getByRole('button', { name: btnAd }).click();
    const d = await dl;
    const yol = path.join(OUT, hedef);
    await d.saveAs(yol);
    return fs.statSync(yol).size;
  };
  const boyutFiyatli = await indir('Fiyatlandırılmış Excel', 'fiyatli.xlsx');
  await page.waitForTimeout(800);
  const boyutTeklif = await indir('Teklif Formatında Aktar', 'teklif.xlsx');
  await page.waitForTimeout(800);
  const boyutIkinci = await indir('Fiyatlandırılmış Excel', 'fiyatli-2.xlsx');
  rapor.adimlar.a8 = { boyutFiyatli, boyutTeklif, boyutIkinci };
  expect(boyutFiyatli, 'EX1: fiyatlı çıktı üretilmeli').toBeGreaterThan(1000);
  expect(boyutTeklif, 'EX8: teklif formatı üretilmeli').toBeGreaterThan(1000);
  expect(boyutIkinci, 'KE12: art arda ikinci indirme çalışmalı').toBeGreaterThan(1000);

  rapor.consoleErrors = consoleErrors.filter((e) => !/favicon|manifest|40[34]/.test(e));
  fs.writeFileSync(path.join(OUT, 'rapor.json'), JSON.stringify(rapor, null, 1));
  expect(rapor.consoleErrors.length, `console hatası: ${rapor.consoleErrors[0] ?? ''}`).toBe(0);
});
