/**
 * D10 (30.09, P2) — BOŞ KAYNAKTAN SÜRÜKLEME HİÇBİR ŞEY YAPMAZ · GERÇEK TARAYICI
 *
 * Kullanıcı marka hücresi BOŞ bir satırın tutamağından aşağı sürükler. Tutamaç
 * dolu hücredekiyle aynı görünüyor, imleçte "N satır" rozeti çıkıyor — her şey
 * normal görünüyor. Eski hâl: hedeflerin markası ve FİYATI siliniyor, satırlar
 * "bu markada yok" diye KIRMIZIYA boyanıyor (satırda marka yokken — yanlış
 * suçlama), ve hedef başına bir boş eşleştirme isteği gidiyordu.
 *
 * KARAR (Emre, 02.10): reddedilir — istek gitmez, hedeflere DOKUNULMAZ.
 *
 * Saf modül (`fill-down.ts`) `fill-down.test.ts` D10 bloğunda ölçülüyor; bu
 * dosya ExcelGrid'in o sonucu nasıl karşıladığını ölçer — özellikle GERİ-ALMA:
 * boş sürükleme yığına kayıt itseydi Ctrl+Z bir adımı "yutardı" ve kullanıcı
 * asıl geri almak istediği önceki doldurmayı geri alamazdı.
 */
import { test, expect, Page } from '@playwright/test';

/** Projenin kanıtlanmış sürükleme gesture'u (grid.spec.ts:12 ile birebir). */
async function surukle(page: Page, kaynakRow: number, hedefRow: number, colId = '_marka') {
  const kaynak = await page.locator(`[row-index="${kaynakRow}"] [col-id="${colId}"]`).boundingBox();
  const hedef = await page.locator(`[row-index="${hedefRow}"] [col-id="${colId}"]`).boundingBox();
  if (!kaynak || !hedef) throw new Error('hucre koordinati alinamadi');
  const x = kaynak.x + kaynak.width / 2;
  const yBas = kaynak.y + kaynak.height - 3;
  const yBit = hedef.y + hedef.height / 2;
  await page.mouse.move(x, yBas);
  await page.mouse.down();
  const adim = Math.max(6, (hedefRow - kaynakRow) * 2);
  for (let i = 1; i <= adim; i++) await page.mouse.move(x, yBas + ((yBit - yBas) * i) / adim);
  await page.mouse.up();
}

const birim = (page: Page, row: number) => page.locator(`[row-index="${row}"] [col-id="_matBirim"]`);
const sorguSayisi = (page: Page) =>
  page.evaluate(() => (window.__olay ?? []).filter((o) => o.includes(' sorgu: satir=')).length);

/** Satır 2'yi AYVAZ ile fiyatlar, 2→4 sürükleyip 3 (400) ve 4 (300)'ü doldurur,
 *  sonra satır 2'nin markasını "Seçimi kaldır" ile BOŞALTIR. */
async function hazirla(page: Page) {
  await page.goto('/dev/grid-test');
  await page.locator('[row-index="2"] [col-id="_marka"] button').click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
  await expect(birim(page, 2)).toHaveText(/600/);

  await surukle(page, 2, 4);
  await expect(birim(page, 3)).toHaveText(/400/);
  await expect(birim(page, 4)).toHaveText(/300/);

  await page.locator('[row-index="2"] [col-id="_marka"] button').click();
  await page.getByText('Secimi kaldir').click();
  // FİKSTÜR KANITI: kaynak GERÇEKTEN boş — yoksa test boş-kaynak dalını sürmez.
  await expect(page.locator('[row-index="2"] [col-id="_marka"]')).not.toHaveText(/AYVAZ/);
  await expect(birim(page, 2)).toHaveText(/^\s*$/);
}

test.describe('D10 — boş kaynaktan sürükleme (gerçek tarayıcı)', () => {
  test('★★ hedeflerin FİYATI ve MARKASI dokunulmadan kalır', async ({ page }) => {
    await hazirla(page);
    await surukle(page, 2, 4);
    await page.waitForTimeout(500); // doldurma asenkron — olsaydı bu sürede yazardı
    await expect(birim(page, 3), 'satır 3 fiyatı').toHaveText(/400/);
    await expect(birim(page, 4), 'satır 4 fiyatı').toHaveText(/300/);
    await expect(page.locator('[row-index="3"] [col-id="_marka"]'), 'satır 3 markası').toHaveText(/AYVAZ/);
  });

  test('★★ YANLIŞ SUÇLAMA YOK: hedef satırlar kırmızıya boyanmaz', async ({ page }) => {
    await hazirla(page);
    await surukle(page, 2, 4);
    await page.waitForTimeout(500);
    await expect(birim(page, 3)).not.toHaveCSS('background-color', 'rgb(254, 226, 226)');
    await expect(birim(page, 4)).not.toHaveCSS('background-color', 'rgb(254, 226, 226)');
  });

  test('★ boş kimlikle eşleştirme isteği GİTMEZ', async ({ page }) => {
    await hazirla(page);
    const once = await sorguSayisi(page);
    await surukle(page, 2, 4);
    await page.waitForTimeout(500);
    expect(await sorguSayisi(page), 'yeni sorgu sayısı').toBe(once);
  });

  test('★★ Ctrl+Z bir adım YUTMAZ: önceki doldurma hâlâ geri alınabilir', async ({ page }) => {
    await hazirla(page);
    await surukle(page, 2, 4);
    await page.waitForTimeout(500);
    // Boş sürükleme yığına kayıt itmediyse bu Ctrl+Z, 2→4 DOLDURMASINI geri alır.
    await page.keyboard.press('Control+z');
    await expect(birim(page, 3), 'önceki doldurma geri alınmalıydı').toHaveText(/^\s*$/);
    await expect(birim(page, 4)).toHaveText(/^\s*$/);
  });
});

test.describe('D10 İKİZİ — boş FİRMA kaynağından sürükleme', () => {
  const lab = (page: Page, row: number) => page.locator(`[row-index="${row}"] [col-id="_labBirim"]`);

  /** Satır 2'ye YASİN USTA (60), 2→4 sürükleyip 3 (40) ve 4 (30)'ü doldurur,
   *  sonra satır 2'nin firmasını "Seçimi kaldır" ile BOŞALTIR. */
  async function hazirlaLab(page: Page) {
    await page.goto('/dev/grid-test');
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    await expect(lab(page, 2)).toHaveText(/60/);
    await surukle(page, 2, 4, '_firma');
    await expect(lab(page, 3)).toHaveText(/40/);
    await expect(lab(page, 4)).toHaveText(/30/);
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('Secimi kaldir').click();
    // FİKSTÜR KANITI: kaynak GERÇEKTEN boş.
    await expect(page.locator('[row-index="2"] [col-id="_firma"]')).not.toHaveText(/YASİN/);
  }

  test('★★ işçilik fiyatları dokunulmadan kalır', async ({ page }) => {
    await hazirlaLab(page);
    await surukle(page, 2, 4, '_firma');
    await page.waitForTimeout(500);
    await expect(lab(page, 3)).toHaveText(/40/);
    await expect(lab(page, 4)).toHaveText(/30/);
  });

  test('★★ Ctrl+Z bir adım YUTMAZ: önceki firma doldurması geri alınabilir', async ({ page }) => {
    await hazirlaLab(page);
    await surukle(page, 2, 4, '_firma');
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    await expect(lab(page, 3), 'önceki firma doldurması geri alınmalıydı').toHaveText(/^\s*$/);
  });
});
