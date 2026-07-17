import { test, expect } from '@playwright/test';

/**
 * K9 (K-B) + K15-K19 e2e — /dev/grid-test mock harness'i (auth/API yok).
 * Fiyatlar mock'tan: 6''→600(10255)/555(10217) · 4''→400 · 3''→300 ·
 * 2''→markada yok · 1''→2 aday · 3/4''→75.
 */

test.describe('ExcelGrid — popup baglama + surukle-doldur', () => {
  test('K9/K-B: popup ogesi URUN NESNESIYLE bagli — tiklanan grubun fiyati yazilir', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    // Iki grup secenegi acilir; IKINCIYE tiklaniyor. Liste-index baglamasi
    // olsaydi ILK grubun 600'u yazilirdi — nesne baglamasi 555 yazar.
    await page.getByRole('button', { name: /Basınçlı Borular/ }).click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/555/);
  });

  test('K15-K17 + K19: surukle-doldur kendi cap fiyatlari + tek adim Ctrl+Z', async ({ page }) => {
    await page.goto('/dev/grid-test');

    // Kaynak satir: 6'' → "Su ve Yangın" grubu (600) secilir; anahtar KAPALI
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByRole('button', { name: /Su ve Yangın/ }).click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
    await expect(page.getByTestId('switch-state')).toContainText('KAPALI'); // K13 taban

    // SURUKLE: kaynak hucrenin ALT KENARINDAN 3/4'' satirina
    const kaynak = await page.locator('[row-index="2"] [col-id="_marka"]').boundingBox();
    const hedef = await page.locator('[row-index="7"] [col-id="_marka"]').boundingBox();
    if (!kaynak || !hedef) throw new Error('hucre koordinati alinamadi');
    const x = kaynak.x + kaynak.width / 2;
    const yBas = kaynak.y + kaynak.height - 3;
    const yBit = hedef.y + hedef.height / 2;
    await page.mouse.move(x, yBas);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(x, yBas + ((yBit - yBas) * i) / 6);
    }
    // Canli onizleme: sayac rozeti gorunur (§4.6)
    await expect(page.locator('.fill-handle-count-badge')).toContainText('satır');
    await page.mouse.up();

    await expect(page.getByTestId('switch-state')).toContainText('AÇIK'); // K15: anahtar oto-ACILDI
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/); // K17: KENDI fiyati
    await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/300/);
    await expect(page.locator('[row-index="7"] [col-id="_matBirim"]')).toHaveText(/75/);
    await expect(page.locator('[row-index="5"] [col-id="_matBirim"]')).toHaveText(/^\s*$/); // K16: yok → fiyatsiz
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).toHaveText(/^\s*$/); // >1 urun → secim bekliyor

    // K19: Ctrl+Z — TUM surukleme tek adimda geri (fiyatlar + anahtar)
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('switch-state')).toContainText('KAPALI');
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="7"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/); // kaynak KORUNUR
  });
});
