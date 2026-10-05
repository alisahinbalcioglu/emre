/**
 * COKLU PARA BIRIMI F3 (Emre karari 04.10) — karisik kipte SAYFA TOPLAMI,
 * KAR ve FITTING para birimi basina.
 *
 *  - Her birim kendi "GENEL TOPLAM" ve "KÂR" satirini alir; dolar liraya
 *    EKLENMEZ (F2'de karisik kipte alt satir dolari lira gibi topluyordu —
 *    bu yuzden kip uretimde kapali).
 *  - Fitting kapsami karisiksa her birim icin AYRI tutar (karar 2); fitting
 *    hucresi "₺x + $y", tutarlar kendi toplamlarina girer.
 *  - Doviz 2 hane yukari (karar 4).
 *
 * Senaryo (harness `?para=karisik`): satir 2 (6'', 286) %10 kar + DOLAR MARKA
 * → $11,55 × 286 = $3.303,30 (maliyet $3.003,00, kar $300,30) · satir 3 (4'',
 * 268) AYVAZ "Su ve Yangın" → ₺400 × 268 = ₺107.200,00 · satir 10 fitting
 * %5, kapsam satir 2 + 3 → $165,17 (3.303,30 × %5 = 165,165 ↑) + ₺5.360,00.
 */
import { test, expect, Page } from '@playwright/test';

const hucre = (page: Page, row: number | string, col: string) => page.locator(`[row-index="${row}"] [col-id="${col}"]`);

async function sec(page: Page, row: number, col: '_marka' | '_firma', ad: string) {
  await hucre(page, row, col).locator('button').click();
  await page.locator('span[class="flex-1"]', { hasText: new RegExp(`^${ad}$`) }).click();
}

async function elleYaz(page: Page, row: number, col: string, metin: string) {
  await hucre(page, row, col).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(metin);
  await page.keyboard.press('Enter');
}

/** Alt (pinned) satirlardan adi verilen satirin row-index'i. */
async function altSatir(page: Page, ad: string): Promise<string> {
  const id = await page.evaluate((aranan) => {
    const satirlar = Array.from(document.querySelectorAll('.ag-floating-bottom [row-index]'));
    const s = satirlar.find((el) => (el.querySelector('[col-id="col1"]')?.textContent ?? '').trim() === aranan);
    return s?.getAttribute('row-index') ?? null;
  }, ad);
  if (!id) throw new Error(`alt satir yok: ${ad}`);
  return id;
}

async function senaryo(page: Page) {
  await page.goto('/dev/grid-test?para=karisik');
  await elleYaz(page, 2, '_malzKar', '10');
  await sec(page, 2, '_marka', 'DOLAR MARKA');
  await expect(hucre(page, 2, '_matToplam')).toHaveText('$3.303,30');
  await sec(page, 3, '_marka', 'AYVAZ');
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
  await expect(hucre(page, 3, '_matToplam')).toHaveText('₺107.200,00');
}

test.describe('F3 — karisik kip: toplamlar para birimi basina', () => {
  test('★★ GENEL TOPLAM ₺ ve GENEL TOPLAM $ AYRI satirlar (dolar liraya eklenmez)', async ({ page }) => {
    await senaryo(page);
    await expect.poll(() => altSatir(page, 'GENEL TOPLAM ₺').catch(() => null), { timeout: 10_000 }).not.toBeNull();
    expect(await hucre(page, await altSatir(page, 'GENEL TOPLAM ₺'), '_matToplam').textContent()).toBe('₺107.200,00');
    expect(await hucre(page, await altSatir(page, 'GENEL TOPLAM $'), '_matToplam').textContent()).toBe('$3.303,30');
  });

  test('★★ KÂR para birimi basina: KÂR $ = $300,30 (2 hane), KÂR ₺ = ₺0,00', async ({ page }) => {
    await senaryo(page);
    await expect.poll(() => altSatir(page, 'KÂR $').catch(() => null), { timeout: 10_000 }).not.toBeNull();
    expect(await hucre(page, await altSatir(page, 'KÂR $'), '_matToplam').textContent()).toBe('$300,30');
    expect(await hucre(page, await altSatir(page, 'KÂR ₺'), '_matToplam').textContent()).toBe('₺0,00');
  });

  test('★★ FITTING (karar 2): karisik kapsam iki ayri tutar, her biri kendi toplamina', async ({ page }) => {
    await senaryo(page);
    // Satir 10 fitting (%5): birim "%" kipi acar, kapsam Ctrl+tik
    await elleYaz(page, 10, 'col3', '%');
    await expect(page.getByText(/Fitting kapsamı/i).first()).toBeVisible({ timeout: 10_000 });
    await hucre(page, 2, 'col1').click({ modifiers: ['Control'] });
    await hucre(page, 3, 'col1').click({ modifiers: ['Control'] });
    await page.keyboard.press('Escape');
    await expect(hucre(page, 10, '_matToplam')).toHaveText('₺5.360,00 + $165,17', { timeout: 10_000 });
    expect(await hucre(page, await altSatir(page, 'GENEL TOPLAM ₺'), '_matToplam').textContent()).toBe('₺112.560,00');
    expect(await hucre(page, await altSatir(page, 'GENEL TOPLAM $'), '_matToplam').textContent()).toBe('$3.468,47');
  });
});

test.describe('F3 — KONTROL: tl kipi alt satirlari bugunku gibi', () => {
  test('★ tek GENEL TOPLAM + KÂR satiri, birim eki YOK', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await sec(page, 3, '_marka', 'AYVAZ');
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect.poll(() => altSatir(page, 'GENEL TOPLAM').catch(() => null), { timeout: 10_000 }).not.toBeNull();
    expect(await hucre(page, await altSatir(page, 'GENEL TOPLAM'), '_matToplam').textContent()).toBe('₺107.200,00');
    await expect(page.locator('.ag-floating-bottom [row-index]')).toHaveCount(2);
  });
});
