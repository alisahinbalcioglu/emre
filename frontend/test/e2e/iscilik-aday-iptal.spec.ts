/**
 * D15 (30.09, P3) — İŞÇİLİK ADAY PENCERESİNDE KAPATMA YOK
 *
 * Firma seçilince işçilik motoru birden çok kalem dönerse "⚠ İşçilik Seç
 * (N aday)" penceresi açılır. Malzeme ikizinde pencerenin altında "İptal"
 * düğmesi var (BrandDropdown `handleCancel`): markayı boşaltır, işareti
 * kaldırır. İşçilik penceresinde HİÇBİR kapatma yolu yoktu — pencere ancak
 * bir aday seçilerek ya da firma değiştirilerek kapanıyordu. Kullanıcı
 * "bu firmayı istemiyorum" diyemiyor; vazgeçmek için ya istemediği bir kalemi
 * seçiyor (yanlış fiyat teklife girer) ya da başka bir firmaya geçiyordu.
 * Pencere sabit konumda ve altındaki satırları örtüyor.
 *
 * Beklenen (malzeme ikiziyle aynı sözleşme): "İptal" pencereyi kapatır,
 * firmayı boşaltır, satır işaretsiz kalır (firmasız satır "seçim bekliyor"
 * sayılamaz), fiyat yazılmaz.
 *
 * Harness: satır 6 = 1'' Siyah Boru — her firma iki işçilik adayı sorar
 * ("kaynaklı" 9 · "dişli" 10).
 */
import { test, expect, Page } from '@playwright/test';

const BOS = /^\s*$/;
const PEMBE = 'rgb(254, 226, 226)'; // isaret.ts: 'yok' / 'belirsiz' zemini
const bant = (page: Page, n: number) => page.getByText(`⚠ ${n} satır seçim bekliyor`, { exact: true });
const pencere = (page: Page) => page.getByText(/⚠ İşçilik Seç \(\d+ aday\)/);

async function firmaSec(page: Page, row: number, firma: string) {
  await page.locator(`[row-index="${row}"] [col-id="_firma"] button`).click();
  await page.getByText(firma, { exact: true }).click();
}

test.describe('D15 — işçilik aday penceresi İptal ile kapanır', () => {
  test('FİKSTÜR KANITI: pencere açılır ve satır seçim bekler', async ({ page }) => {
    // Bu olmadan aşağıdakiler "pencere hiç açılmadı" diye yanlış sebepten geçebilir.
    await page.goto('/dev/grid-test');
    await firmaSec(page, 6, 'YASİN USTA');
    await expect(pencere(page)).toBeVisible();
    await expect(bant(page, 1)).toBeVisible();
  });

  test('★★ pencerede "İptal" düğmesi var ve pencereyi kapatır', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await firmaSec(page, 6, 'YASİN USTA');
    await expect(pencere(page)).toBeVisible();
    await page.getByRole('button', { name: 'İptal', exact: true }).click();
    await expect(pencere(page)).toHaveCount(0);
  });

  test('★ İptal firmayı boşaltır ve satırı İŞARETSİZ bırakır (sayaç şişmez)', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await firmaSec(page, 6, 'YASİN USTA');
    await page.getByRole('button', { name: 'İptal', exact: true }).click();
    // Firma hücresi yer tutucuya döner (malzeme ikizi markayı boşaltır).
    await expect(page.locator('[row-index="6"] [col-id="_firma"]')).toContainText('Firma seç');
    // Firmasız satır "seçim bekliyor" sayılamaz: pembe zemin ve bant gider.
    await expect(page.locator('[row-index="6"] [col-id="_labBirim"]')).not.toHaveCSS('background-color', PEMBE);
    await expect(page.getByText(/satır seçim bekliyor/)).toHaveCount(0);
  });

  test('★ önceki firmanın fiyatı İptal sonrası geri GELMEZ (fiyat yazılmaz)', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await firmaSec(page, 6, 'YASİN USTA');
    await page.getByText('kaynaklı', { exact: true }).click();
    await expect(page.locator('[row-index="6"] [col-id="_labBirim"]')).toHaveText(/9/);
    // Aynı satıra HAKAN: yine iki aday — vazgeç.
    await firmaSec(page, 6, 'HAKAN USTA');
    await expect(pencere(page)).toBeVisible();
    await page.getByRole('button', { name: 'İptal', exact: true }).click();
    await expect(page.locator('[row-index="6"] [col-id="_firma"]')).toContainText('Firma seç');
    await expect(page.locator('[row-index="6"] [col-id="_labBirim"]')).toHaveText(BOS);
    await expect(page.locator('[row-index="6"] [col-id="_labToplam"]')).toHaveText(BOS);
  });
});
