/**
 * COKLU PARA BIRIMI F6c — "TUMU X" GORUNUMU (karar K2, 05.10; C10 serit
 * kurali 06.10, koordinator onayi).
 *
 * Dovizli karisik teklif varsayilan KARISIK gorunur; anahtar [Karisik | TL |
 * USD | EUR]. "Tumu X" her tarafi X'e CEVIREREK gosterir (yalniz gorunum),
 * kur QuoteItem TL karsiligiyla ayni: once satirin DONUK kuru, yoksa canli.
 *
 * Harness: `?para=karisik&tumu=TRY|USD` · canli kur 1 $ = ₺41 · DOLAR MARKA
 * donuk kuru 40 (bilerek farkli) · `tumu-dongu` canli gecis (karisik → TRY →
 * USD → karisik) · satir 2 = 6'' (286) · 3 = 4'' (268).
 *
 *  T1 ★★ Tumu ₺: $ taraf DONUK kurla (10,50 × 40 = ₺420; canli 41 DEGIL), ₺ taraf
 *        aynen; alt satirlar TEK "GENEL TOPLAM" + "KÂR" (birim basina degil).
 *  T2 ★★ Tumu USD: $ taraf CEVRILMEZ, ₺ taraf canli kurla (₺400 / 41 = $9,76).
 *  T3 ★★ SALT OKUNUR: fiyat hucresinde editor acilmaz, yapistirma yazmaz; miktar
 *        duzenlenir ve cevrilmis toplam yenilenir (satir verisi $ kalir).
 *  T4 ★  canli gecis ve geri: Karisik'e donunce birim basina satirlar ve $ geri gelir.
 *  (Alt satir sayisi degisiminin acik editoru kesmemesi: `coklu-para-birimi-editor.spec` R1-R3.)
 *  T5 ★★ C10 (sayi kurdan gectiyse serit): bayat donuk kurla cevrilen $ taraf Tumu
 *        ₺'de SERIT + eylemsiz not alir; cevrilmeyen $ (Tumu USD) ve Karisik'te seritsiz.
 */
import { test, expect, Page } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

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

/** Alt satir adlari, EKRAN sirasiyla (row-index b-N; DOM sirasi degil — F6a olcumu). */
const altAdlar = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('.ag-floating-bottom .ag-row'))
  .map((el) => ({ no: Number(String(el.getAttribute('row-index') ?? '').replace(/\D/g, '')), ad: (el.querySelector('[col-id="col1"]')?.textContent ?? '').trim() }))
  .filter((x) => x.ad).sort((a, b) => a.no - b.no).map((x) => x.ad));

async function ayvaz(page: Page) {
  await sec(page, 3, '_marka', 'AYVAZ');
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
}

/** Hucrenin ipucu metni (AG Grid varsayilan gecikmesi 2 sn). */
async function ipucu(page: Page, row: number, col: string): Promise<string> {
  await page.mouse.move(0, 0);
  await hucre(page, row, col).hover();
  const t = page.locator('.ag-tooltip');
  await expect(t).toBeVisible({ timeout: 6_000 });
  return (await t.textContent()) ?? '';
}

const serit = (page: Page, row: number, col: string) => hucre(page, row, col).evaluate((el) => getComputedStyle(el).backgroundImage);

test.describe('F6c — Tumu X gorunumu (izgara)', () => {
  test('T1 ★★ Tumu ₺: $ taraf DONUK kurla (₺420, canli kurla ₺430,50 olurdu); tek GENEL TOPLAM', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&tumu=TRY');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await expect(hucre(page, 2, '_matToplam')).toHaveText('₺120.120,00'); // $3.003 × 40
    await ayvaz(page);
    await expect(hucre(page, 3, '_matBirim')).toHaveText('₺400,00');
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM', 'KÂR']);
    await expect(hucre(page, 'b-0', '_matToplam')).toHaveText('₺227.320,00'); // 120.120 + 107.200
  });

  test('T2 ★★ Tumu USD: $ taraf CEVRILMEZ, ₺ taraf canli kurla ($9,76)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&tumu=USD');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await ayvaz(page);
    await expect(hucre(page, 3, '_matBirim')).toHaveText('$9,76'); // 400 / 41
    await expect(hucre(page, 3, '_matToplam')).toHaveText('$2.614,63'); // 107.200 / 41
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM', 'KÂR']);
    await expect(hucre(page, 'b-0', '_matToplam')).toHaveText('$5.617,63'); // 3.003 + 2.614,63
  });

  test('T3 ★★ SALT OKUNUR: fiyat hucresi duzenlenmez ve yapistirilmaz; miktar duzenlenir', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&tumu=TRY');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await hucre(page, 2, '_matBirim').dblclick();
    await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(0);
    await page.keyboard.type('15');
    await page.keyboard.press('Enter');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await hucre(page, 2, '_matBirim').click();
    await page.evaluate(() => navigator.clipboard.writeText('$12'));
    await page.keyboard.press('Control+v');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await elleYaz(page, 2, 'col2', '10');
    await expect(hucre(page, 2, '_matToplam')).toHaveText('₺4.200,00'); // $105 × 40
    // POZITIF KONTROL (inceleme L3): ayni yapistirma Karisik'te YAZAR — yukaridaki ret
    // olayin hic ulasmamasindan degil, kilitten (tumu-dongu: TRY → USD → karisik)
    await page.getByTestId('tumu-dongu').click();
    await page.getByTestId('tumu-dongu').click();
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await hucre(page, 2, '_matBirim').click();
    await page.evaluate(() => navigator.clipboard.writeText('$12'));
    await page.keyboard.press('Control+v');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$12,00');
  });

  test('T4 ★ canli gecis: Karisik → Tumu ₺ → Tumu USD → Karisik', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await expect.poll(() => altAdlar(page)).toContain('GENEL TOPLAM $');
    await page.getByTestId('tumu-dongu').click();
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await expect.poll(() => altAdlar(page)).toEqual(['GENEL TOPLAM', 'KÂR']);
    await page.getByTestId('tumu-dongu').click();
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await expect(hucre(page, 'b-0', '_matToplam')).toHaveText('$3.003,00');
    await page.getByTestId('tumu-dongu').click();
    await expect.poll(() => altAdlar(page)).toContain('GENEL TOPLAM $');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
  });

  test('T5 ★★ C10: bayat donuk kurla cevrilen $ taraf SERIT alir (Tumu ₺), not eylemsiz', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&kur=bayat&tumu=TRY');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await expect.poll(() => serit(page, 2, '_matBirim')).toContain('linear-gradient');
    const not = await ipucu(page, 2, '_matBirim');
    expect(not).toContain('Fiyatlandırıldığında kur 3 iş günü eskiydi');
    expect(not).not.toContain('menüsünden yeniden seçin');
  });

  test('T5b ★ C10 KONTROL: cevrilmeyen $ (Tumu USD) ve Karisik gorunumde $ taraf seritsiz', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&kur=bayat&tumu=USD');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    expect(await serit(page, 2, '_matBirim')).not.toContain('linear-gradient');
    await page.getByTestId('tumu-dongu').click(); // USD → karisik
    await expect.poll(() => altAdlar(page)).toContain('GENEL TOPLAM $');
    expect(await serit(page, 2, '_matBirim')).not.toContain('linear-gradient');
  });
});

