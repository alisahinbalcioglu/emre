/* FAZ 0 / GS7 + GS1 TESHIS — YILDIZ dosyasi GERCEK uygulamada nasil goruniyor?
 * Ciktilar: e2e-artifacts/faz0-gs7/ (sayfa basi ekran goruntusu + gs7.json)
 * Kosum: npx playwright test -c playwright.golden.config.ts faz0-gs7
 * NOT: bu bir KABUL testi degil, OLCUM aracidir (assert yok, kanit uretir). */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/e2e');
const OUT = path.resolve(__dirname, '../e2e-artifacts/faz0-gs7');
const AUTH = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8'));
const katla = (s: string) => s.normalize('NFC')
  .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
  .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();
const bul = (parca: string) => {
  const f = fs.readdirSync(FIXTURES).find((x) => katla(x).includes(katla(parca)));
  if (!f) throw new Error('fixture yok: ' + parca);
  return path.join(FIXTURES, f);
};

test('FAZ0 GS7 teşhis — YILDIZ 11 sayfa', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const rapor: any = { dosya: 'YILDIZ ENTEGRE KARTEPE', sayfalar: [] };
  await page.addInitScript((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, AUTH);
  await page.goto('/quotes/new');
  await page.locator('#quote-excel-upload').setInputFiles(bul('yildiz entegre'));
  await page.locator('.ag-root').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForTimeout(1500);

  const tabBtns = page.locator('.sticky.bottom-0 button[title]');
  const n = await tabBtns.count();
  rapor.sekmeSayisi = n;
  for (let i = 0; i < n; i++) {
    const ad = (await tabBtns.nth(i).getAttribute('title')) ?? `sayfa${i}`;
    await tabBtns.nth(i).click();
    await page.waitForTimeout(900);
    const olcum = await page.evaluate(() => {
      const basliklar: string[] = [];
      document.querySelectorAll('.ag-header-cell[col-id]').forEach((h) => {
        const id = h.getAttribute('col-id') ?? '';
        const t = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (id) basliklar.push(`${id}="${t}"`);
      });
      // gorunur satirlarda DOLU hucre var mi (bos grid teshisi)
      let satir = 0, doluSatir = 0;
      document.querySelectorAll('.ag-center-cols-container .ag-row').forEach((r) => {
        satir++;
        let dolu = false;
        r.querySelectorAll('.ag-cell').forEach((c) => { if ((c.textContent ?? '').trim()) dolu = true; });
        if (dolu) doluSatir++;
      });
      const secici = document.querySelector('select.h-7') as HTMLSelectElement | null;
      const secim = secici ? { deger: secici.value, etiket: secici.selectedOptions[0]?.textContent ?? '', secenekler: Array.from(secici.options).map((o) => `${o.value}="${o.textContent}"`) } : null;
      return { basliklar, satir, doluSatir, secim };
    });
    rapor.sayfalar.push({ ad, ...olcum });
    await page.screenshot({ path: path.join(OUT, `sayfa-${String(i).padStart(2, '0')}-${ad.replace(/[^a-zA-Z0-9]/g, '_')}.png`) });
    console.log(`[GS7] ${ad}: görünür satır=${olcum.satir}, dolu=${olcum.doluSatir}, seçici="${olcum.secim?.etiket}" (${olcum.secim?.deger})`);
  }
  // ── GS6 sınaması: seçici DEĞİŞİNCE grid ne oluyor? ────────────────────
  // PRD kanıtı "3. ekran görüntüsü: tüm satırlar boş". Yükleme anında hiçbir
  // sayfa boş gelmediğine göre boşalma SEÇİCİ DEĞİŞİNCE oluşuyor olmalı.
  const trafoIdx = rapor.sayfalar.findIndex((s: any) => /trafo/i.test(s.ad));
  if (trafoIdx >= 0) {
    await tabBtns.nth(trafoIdx).click();
    await page.waitForTimeout(800);
    const secici = page.locator('select.h-7').first();
    const secenekler = await secici.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? '' })));
    const oncesi = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('.ag-center-cols-container .ag-row').forEach((r) => {
        const c = r.querySelector('[col-id="col1"]');
        if (c) out.push((c.textContent ?? '').trim().slice(0, 30));
      });
      return out.filter(Boolean).slice(0, 5);
    });
    // "No" kolonuna (col0) çevir — kullanıcının yanlış sütun seçmesi senaryosu
    const hedef = secenekler.find((o) => o.v !== 'col1') ?? secenekler[0];
    await secici.selectOption(hedef.v);
    await page.waitForTimeout(1500);
    const sonrasi = await page.evaluate(() => {
      let satir = 0, dolu = 0;
      document.querySelectorAll('.ag-center-cols-container .ag-row').forEach((r) => {
        satir++;
        let d = false;
        r.querySelectorAll('.ag-cell').forEach((c) => { if ((c.textContent ?? '').trim()) d = true; });
        if (d) dolu++;
      });
      return { satir, dolu };
    });
    await page.screenshot({ path: path.join(OUT, 'gs6-secici-degisti.png') });
    rapor.gs6 = { secenekler, secilen: hedef, oncesiOrnek: oncesi, sonrasi };
    console.log(`[GS6] seçici "${hedef.t}" (${hedef.v}) yapıldı → görünür satır=${sonrasi.satir}, dolu=${sonrasi.dolu}`);
  }
  fs.writeFileSync(path.join(OUT, 'gs7.json'), JSON.stringify(rapor, null, 1));
});
