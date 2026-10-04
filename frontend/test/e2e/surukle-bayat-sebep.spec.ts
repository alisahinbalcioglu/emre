/**
 * D14b (04.10, P3 — D14'ün sürükle-doldur İKİZİ)
 *
 * D14 etkileşimli yolu düzeltti: "seçim bekliyor" yazan her dal sebebi ve
 * aday sayısını KENDİSİ yazıyor. Sürükle-doldur (`fill-down.ts`) aynı işaret
 * alanlarını yazıyor ama iki dalda sebebi YAZMIYORDU — satırda ÖNCEKİ bir
 * sorgunun sebebi kalıyor ve ipucu yanlış şeyi söylüyordu:
 *   - 'hata' dalı (motor/ağ hatası fırlattı): sebep yazılmaz → ipucu
 *     "Eşleştirme hatası: <eski sebep> — tekrar deneyin".
 *   - sebepsiz sonuç (`if (r?.reason)`): `null` cevapta eski sebep kalır →
 *     'yok' ipucu önceki "2 seçenek" metnini gösterir.
 * İki kaynak da GERÇEK: sürüklemede sarmalayıcı hatayı fırlatır (quotes/new
 * `if (opts?.silent === true) throw e`), işçilik sarmalayıcısı motor kaydı
 * yoksa `null` döner (`if (!match) return null`). Gerçek motor "yok/aday"
 * dallarında her zaman sebep döner (outcome-mapper) — sebepsiz MALZEME 'yok'
 * motordan üretilemez, ölçülmedi.
 *
 * Harness: satır 9 = 8'' · satır 10 = "HATALI 7''" (ÇAYIROVA dışında her
 * markada fırlatır) · satır 5 = 2'' · satır 6 = 1'' (iki işçilik adayı,
 * "2 seçenek") · ÖZKAN USTA → `null`.
 */
import { test, expect, Page } from '@playwright/test';

const SU_YANGIN = 'Su ve Yangın Tesisat Boruları (TS EN 10255)';

/** Projenin kanıtlanmış sürükleme gesture'u (grid.spec.ts:12 ile birebir). */
async function surukle(page: Page, kaynakRow: number, hedefRow: number, colId: string) {
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

async function sec(page: Page, row: number, col: '_marka' | '_firma', ad: string) {
  await page.locator(`[row-index="${row}"] [col-id="${col}"] button`).click();
  await page.locator('span[class="flex-1"]', { hasText: new RegExp(`^${ad}$`) }).click();
}

/** Hücrenin ipucu metni (AG Grid varsayılan gecikmesi 2 sn). */
async function ipucu(page: Page, row: number, col: string): Promise<string> {
  await page.mouse.move(0, 0);
  // ⚠ ÖNCEKİ ipucu DOM'dan gitmeden okunursa ESKİ metin döner (ölçüldü: aynı
  // hücreye ikinci hover, kaybolma animasyonundaki ilk öğeyi yakaladı).
  await expect(page.locator('.ag-tooltip')).toHaveCount(0, { timeout: 6_000 });
  await page.locator(`[row-index="${row}"] [col-id="${col}"]`).hover();
  const t = page.locator('.ag-tooltip');
  await expect(t).toBeVisible({ timeout: 6_000 });
  return (await t.textContent()) ?? '';
}

const olaylar = (page: Page): Promise<string[]> => page.evaluate(() => window.__olay ?? []);

test.describe('D14b — sürükle-doldur önceki sebebi ipucunda bırakmaz', () => {
  test('★★ MALZEME hata dalı: önceki "bu markada yok" sebebi "Eşleştirme hatası"na karışmaz', async ({ page }) => {
    await page.goto('/dev/grid-test');
    // 1) Satır 10'a bir SEBEP yaz (ÇAYIROVA → alternatif dalı).
    await sec(page, 10, '_marka', 'ÇAYIROVA');
    expect(await ipucu(page, 10, '_matBirim')).toContain('Bu markada bu ürün ailesi yok.'); // FİKSTÜR KANITI
    // 2) Satır 9'u AYVAZ ile fiyatla, 10'a sürükle: sorgu FIRLATIR → 'hata'.
    await sec(page, 9, '_marka', 'AYVAZ');
    await page.getByText(SU_YANGIN).click();
    await expect(page.locator('[row-index="9"] [col-id="_matBirim"]')).toHaveText(/800/);
    await surukle(page, 9, 10, '_marka');
    await expect.poll(async () => (await olaylar(page)).some((o) => o.includes('AG HATASI')), { timeout: 10_000 }).toBe(true);
    const metin = await ipucu(page, 10, '_matBirim');
    expect(metin).toContain('Eşleştirme hatası'); // FİKSTÜR KANITI: hata dalı koştu
    expect(metin).not.toContain('ürün ailesi yok');
  });

  test('★★ İŞÇİLİK sebepsiz sonuç: önceki "2 seçenek" sebebi "yok" ipucunda kalmaz', async ({ page }) => {
    await page.goto('/dev/grid-test');
    // 1) Satır 6 (1'') YASİN → iki aday, sebep "2 seçenek" (pencere açık kalır).
    await sec(page, 6, '_firma', 'YASİN USTA');
    expect(await ipucu(page, 6, '_labBirim')).toContain('2 seçenek'); // FİKSTÜR KANITI
    // 2) Satır 5'e ÖZKAN (motor kaydı yok → null), 6'ya sürükle.
    await sec(page, 5, '_firma', 'ÖZKAN USTA');
    await surukle(page, 5, 6, '_firma');
    await expect(page.locator('[row-index="6"] [col-id="_firma"]')).toContainText('ÖZKAN');
    const metin = await ipucu(page, 6, '_labBirim');
    expect(metin).not.toContain('2 seçenek');
    expect(metin).toBe('Kütüphanede eşleşme yok');
  });
});
