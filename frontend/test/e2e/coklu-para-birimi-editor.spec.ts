/**
 * COKLU PARA BIRIMI — ALT SATIR SAYISI DEGISIMI ACIK EDITORU KESMEZ (06.10, F6c
 * kod incelemesi M1; olculdu, F3'ten beri, F6b ile yeni teklif karisik acildigi
 * icin her gun).
 *
 * Karisik kipte ₺ fiyatli sayfaya ilk $ girilince alt satirlar 2'den 4'e cikar
 * (GENEL TOPLAM ₺/$ + KÂR ₺/$). Satir SAYISI degisince `setPinnedBottomRow` (React
 * durumu) AG Grid govdesini bastan cizer ve ACIK EDITORU keser: "$12 ↓ 400"te 400
 * KAYBOLUYORDU (dovizsiz ayni ritim yaziliyordu). Duzeltme: editor acikken sayi
 * degisimi ERTELENIR, editor kapaninca (`duzenlemeBitti`) toplamlar kurulur;
 * sayi aynıysa (setData) bugunku gibi aninda.
 *
 * Harness: `?para=karisik` · satir 3 = 4'' (AYVAZ ₺400) · satir 4 = 3'' (102) ·
 * satir 5 = sonraki veri satiri.
 *  R1 ★★ "$12 ↓ 400": ikinci hucre YAZILIR, alt satirlar sonra 4 olur.
 *  R2 ★  ertelenen alt satirlar editor Escape ile iptal edilse de kurulur (Tab: erteleme kesin).
 *  R3   KONTROL: ayni ritim dovizsiz (alt satir sayisi degismez) — bugunku gibi.
 */
import { test, expect, Page } from '@playwright/test';

const hucre = (page: Page, row: number | string, col: string) => page.locator(`[row-index="${row}"] [col-id="${col}"]`);

async function ayvaz(page: Page) {
  await hucre(page, 3, '_marka').locator('button').click();
  await page.locator('span[class="flex-1"]', { hasText: /^AYVAZ$/ }).click();
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
  await expect(hucre(page, 3, '_matBirim')).toHaveText('₺400,00');
}

/** Alt satir adlari, EKRAN sirasiyla (row-index b-N; DOM sirasi degil — F6a olcumu). */
const altAdlar = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('.ag-floating-bottom .ag-row'))
  .map((el) => ({ no: Number(String(el.getAttribute('row-index') ?? '').replace(/\D/g, '')), ad: (el.querySelector('[col-id="col1"]')?.textContent ?? '').trim() }))
  .filter((x) => x.ad).sort((a, b) => a.no - b.no).map((x) => x.ad));

async function ritim(page: Page, ilk: string) {
  await hucre(page, 4, '_matBirim').dblclick();
  await expect(page.locator('.ag-cell-inline-editing input')).toBeVisible();
  await page.keyboard.type(ilk);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('400', { delay: 40 });
  await page.keyboard.press('Enter');
}

test.describe('Alt satir sayisi degisimi acik editoru kesmez', () => {
  test('R1 ★★ "$12 ↓ 400": ikinci hucre yazilir, alt satirlar sonra 4 olur', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await ayvaz(page);
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM', 'KÂR']);
    await ritim(page, '$12');
    await expect(hucre(page, 5, '_matBirim')).toHaveText('₺400,00');
    await expect(hucre(page, 4, '_matBirim')).toHaveText('$12,00');
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM ₺', 'GENEL TOPLAM $', 'KÂR ₺', 'KÂR $']);
  });

  test('R2 ★ ertelenen alt satirlar editor Escape ile iptal edilse de kurulur', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await ayvaz(page);
    // Tab sonraki duzenlenebilir hucrenin (Isc. Kar %) editorunu HEMEN acar: alt satir
    // guncellemesi editor ACIKKEN gelir — erteleme KESIN kurulur (↓ + yazim zamanlamaya bagli)
    await hucre(page, 4, '_matBirim').dblclick();
    await page.keyboard.type('$12');
    await page.keyboard.press('Tab');
    await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(1);
    await expect(hucre(page, 4, '_matBirim')).toHaveText('$12,00');
    await page.waitForTimeout(300); // ertelenmis olmali: editor acikken sayi DEGISMEZ
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM', 'KÂR']);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(0);
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM ₺', 'GENEL TOPLAM $', 'KÂR ₺', 'KÂR $']);
  });

  test('R3 KONTROL: ayni ritim dovizsiz — ikinci hucre yazilir, alt satirlar 2', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await ayvaz(page);
    await ritim(page, '12');
    await expect(hucre(page, 5, '_matBirim')).toHaveText('₺400,00');
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM', 'KÂR']);
  });
});
