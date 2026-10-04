/**
 * D14 (30.09, P3) — MALZEME "SEÇİM BEKLİYOR" İŞARETİ SEBEPSİZ VE SAYISIZ
 *
 * SD6 sözleşmesi: işaret EYLEMLİ olmalı — pembe hücrenin ipucu SEBEBİ ve KAÇ
 * ADAY olduğunu söyler, kullanıcı ne yapacağını bilir (`isaret.ts`
 * `isaretTooltip`: "<sebep> · N aday var — marka menüsünü açıp seçin").
 * İşçilik ikizi (FirmaDropdown) aday dalında `_labAdaySayisi` + `_labSebep`
 * yazıyor; malzeme ikizi (BrandDropdown) yalnız `_matStatus='belirsiz'`
 * yazıyordu:
 *   - aday sayısı HİÇ gösterilmiyordu ("N aday var" yerine jenerik metin),
 *   - sebep yazılmadığı için ÖNCEKİ markanın sebebi ipucunda KALIYORDU:
 *     A "bu markada 6'' yok" → B iki aday döner → ipucu hâlâ "Bu markada 6'' yok"
 *     der (kullanıcı yanlış markayı suçlar).
 * Alternatif-marka dalı (bu markada yok, başka markalarda var) da aynı
 * kusurlu: sebep yazılmıyor, önceki aday dalının sayısı kalıyordu.
 *
 * Ölçüt kullanıcının gördüğü ipucu metni (AG Grid `.ag-tooltip`).
 * Harness: satır 2 = 6'' (SARDOĞAN'da YOK, 500 ms; AYVAZ'da 2 GRUPLU aday) ·
 * satır 6 = 1'' (her markada 2 aday, "2 seçenek") · ÇAYIROVA her ürüne
 * "bu markada yok — AYVAZ'da var" der.
 */
import { test, expect, Page } from '@playwright/test';

const PEMBE = 'rgb(254, 226, 226)';

async function markaSec(page: Page, row: number, marka: string) {
  await page.locator(`[row-index="${row}"] [col-id="_marka"] button`).click();
  await page.getByText(marka, { exact: true }).click();
}

async function firmaSec(page: Page, row: number, firma: string) {
  await page.locator(`[row-index="${row}"] [col-id="_firma"] button`).click();
  await page.getByText(firma, { exact: true }).click();
}

/** Hücrenin ipucu metni (AG Grid varsayılan gecikmesi 2 sn). */
async function ipucu(page: Page, row: number, col: string): Promise<string> {
  await page.mouse.move(0, 0); // önceki ipucu kapansın
  await page.locator(`[row-index="${row}"] [col-id="${col}"]`).hover();
  const t = page.locator('.ag-tooltip');
  await expect(t).toBeVisible({ timeout: 6_000 });
  return (await t.textContent()) ?? '';
}

test.describe('D14 — malzeme seçim-bekliyor işareti sebep + aday sayısı taşır', () => {
  test('FİKSTÜR KANITI: "yok" ipucu sebebi gösterir (ipucu ölçülebilir)', async ({ page }) => {
    // Bu olmadan aşağıdakiler "ipucu hiç açılmadı" diye yanlış sebepten düşer/geçer.
    await page.goto('/dev/grid-test');
    await markaSec(page, 2, 'SARDOĞAN');
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveCSS('background-color', PEMBE);
    expect(await ipucu(page, 2, '_matBirim')).toContain('Bu markada 6" yok.');
  });

  test('★★ aday dalı KAÇ ADAY olduğunu söyler', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await markaSec(page, 6, 'AYVAZ');
    await expect(page.getByText('düz uçlu', { exact: false }).first()).toBeVisible();
    expect(await ipucu(page, 6, '_matBirim')).toBe('2 seçenek · 2 aday var — marka menüsünü açıp seçin');
  });

  test('★★ önceki markanın "yok" sebebi aday dalında KALMAZ', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await markaSec(page, 2, 'SARDOĞAN');
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveCSS('background-color', PEMBE);
    await markaSec(page, 2, 'AYVAZ');
    await expect(page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)')).toBeVisible();
    const metin = await ipucu(page, 2, '_matBirim');
    expect(metin).not.toContain('6" yok');
    expect(metin).toContain('2 grup');
  });

  test('★ alternatif-marka dalı kendi sebebini yazar, önceki aday sayısını taşımaz', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await markaSec(page, 6, 'AYVAZ'); // 2 aday — seçilmeden marka değiştirilir
    await expect(page.getByText('düz uçlu', { exact: false }).first()).toBeVisible();
    await markaSec(page, 6, 'ÇAYIROVA');
    await expect(page.getByText(/Başka markalarda|AYVAZ —/).first()).toBeVisible();
    const metin = await ipucu(page, 6, '_matBirim');
    expect(metin).not.toContain('2 aday var');
    expect(metin).toContain('Bu markada bu ürün ailesi yok.');
  });

  test('İKİZ KONTROL: işçilik aday dalı zaten sayı + sebep gösteriyor', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await firmaSec(page, 6, 'YASİN USTA');
    await expect(page.getByText(/⚠ İşçilik Seç/)).toBeVisible();
    expect(await ipucu(page, 6, '_labBirim')).toBe('2 seçenek · 2 aday var — firma menüsünü açıp seçin');
  });
});
