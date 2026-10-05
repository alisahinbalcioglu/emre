/**
 * KUTUPHANE DOVIZ NETI (05.10, P2 notu) — BAGLANTI kapisi: kutuphane ekraninin
 * "Net Fiyat" kolonu (`_draftNetPrice`) satirin biriminde yuvarlar.
 *
 * Harness `?kutuphaneDoviz=1`: kutuphane modunda satir 2 USD, liste fiyati 10,55.
 * ₺ kurali (1 hane yukari) "$10,60" gosterirdi; dovizde 2 hane → "$10,55".
 * KONTROL: ₺ satiri (satir 3, liste 400) bugunku gibi.
 */
import { test, expect, Page } from '@playwright/test';

async function kutuphane(page: Page, bayrak: boolean) {
  await page.goto(`/dev/grid-test${bayrak ? '?kutuphaneDoviz=1' : ''}`);
  await expect(page.locator('[row-index="2"] [col-id="col1"]')).toHaveText(/6'' Siyah Boru/, { timeout: 20_000 });
  await page.getByTestId('mod-toggle').click();
  await expect(page.getByTestId('mod-state')).toHaveText('library');
}

const net = (page: Page, satir: number) => page.locator(`[row-index="${satir}"] [col-id="_draftNetPrice"]`);

test('KDN1 ★ dolar satirinin neti 2 hane: $10,55 ($10,60 DEGIL)', async ({ page }) => {
  await kutuphane(page, true);
  await expect(net(page, 2)).toHaveText('$10,55', { timeout: 10_000 });
});

test('KDN2 KONTROL: ₺ satiri bugunku gibi, bayraksiz harness degismedi', async ({ page }) => {
  await kutuphane(page, true);
  await expect(net(page, 3)).toHaveText('₺400,00');
  await kutuphane(page, false);
  await expect(net(page, 2)).toHaveText('₺600,00');
});
