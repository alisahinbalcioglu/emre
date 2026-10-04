/**
 * Y3 (30.09, P2) — ESKİ MARKANIN VARYANT KİMLİĞİ YENİ MARKANIN SORGUSUNA FİLTRE OLMAZ
 *
 * Satır marka A ile bir varyant seçilerek fiyatlanınca A'nın varyant kimliği
 * (`_matVariantTags`) satıra yazılır. Kullanıcı aynı satırda marka B'yi seçer,
 * B'de ürün yoktur: D1 fiyatı ve rozetleri siler — ama kimliği BIRAKIYORDU.
 * Kullanıcı sonra o satırdan aşağı sürükleyince (B'yi tüm gruba uygulamak
 * için) `handleFillComplete` bayat kimliği KAYNAK varyant sayıyor ve bütün
 * hedefler B altında A'nın varyantıyla SERT FİLTRELİ sorgulanıyordu.
 *
 * Ölçüt motora GİDEN istektir: harness mock'u her sorgunun varyant filtresini
 * loglar (`varyant=[...]`). Harness'ta SARDOĞAN 6''yı bilmez (D1 için eklendi),
 * diğer çaplarda filtreli sorguya doğrudan fiyat, filtresize aday döner — yani
 * bayat filtre hedeflere KULLANICININ SEÇMEDİĞİ varyantın fiyatını yazdırır.
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

const olaylar = (page: Page) => page.evaluate(() => window.__olay ?? []);
/** Bir satır için GİDEN SON malzeme sorgusunun log satırı. */
const sonSorgu = (kayit: string[], row: number) =>
  [...kayit].reverse().find((o) => o.includes(` sorgu: satir=${row} `) && !o.includes('ISC'));

async function hazirla(page: Page) {
  await page.goto('/dev/grid-test');
  // 1) Satır 2'yi AYVAZ + "Su ve Yangın" (v:10255) ile fiyatla — kimlik yazılır.
  await page.locator('[row-index="2"] [col-id="_marka"] button').click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  // 2) Aynı satıra SARDOĞAN: 6'' yok → fiyat silinir, satır kırmızı.
  await page.locator('[row-index="2"] [col-id="_marka"] button').click();
  await page.getByText('SARDOĞAN', { exact: true }).click();
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]'))
    .toHaveCSS('background-color', 'rgb(254, 226, 226)');
}

test.describe('Y3 — eski markanın varyant kimliği filtre olmaz', () => {
  test('★★ SARDOĞAN\'ı aileye sürüklerken hedef sorguları AYVAZ\'ın varyantıyla FİLTRELENMEZ', async ({ page }) => {
    await hazirla(page);
    await surukle(page, 2, 4);
    await expect.poll(async () => sonSorgu(await olaylar(page), 3) ?? '', { timeout: 10_000 }).toContain('satir=3');
    const s3 = sonSorgu(await olaylar(page), 3)!;
    // Kusurlu hâlde: varyant=[v:10255] — AYVAZ'ın seçimi SARDOĞAN sorgusuna gidiyordu.
    expect(s3, 'satır 3 sorgusu').toContain('varyant=[-]');
    const s4 = sonSorgu(await olaylar(page), 4)!;
    expect(s4, 'satır 4 sorgusu').toContain('varyant=[-]');
  });

  test('★★ hedeflere kullanıcının SEÇMEDİĞİ varyantın fiyatı yazılmaz', async ({ page }) => {
    await hazirla(page);
    await surukle(page, 2, 4);
    await page.waitForTimeout(800);
    // Filtresiz sorguda mock iki grup sorar → satır "seçim bekliyor" kalır.
    // Kusurlu hâlde: bayat filtre doğrudan fiyat döndürüyordu (4'' → 400, 3'' → 300).
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
  });

  test('KONTROL: kimlik GEÇERLİYKEN (marka değişmedi) sürükleme filtreyi taşır', async ({ page }) => {
    // Satır 2 AYVAZ+v:10255 ile fiyatlıyken sürükleme kimliği taşımalı — silme
    // fiyatı olan satıra karışırsa grup varyantı yayılımı bozulurdu.
    await page.goto('/dev/grid-test');
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
    await surukle(page, 2, 4);
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
    expect(sonSorgu(await olaylar(page), 3), 'kaynak kimliği taşındı').toContain('varyant=[v:10255]');
  });
});

test.describe('Y3 İKİZİ — eski firmanın kalem kimliği filtre olmaz', () => {
  const iscSon = (kayit: string[], row: number) =>
    [...kayit].reverse().find((o) => o.includes(`ISC sorgu: satir=${row} `));

  test("★★ HAKAN'ı sürüklerken hedef işçilik sorgusu YASİN'in kaynaklı kimliğiyle FİLTRELENMEZ", async ({ page }) => {
    await page.goto('/dev/grid-test');
    // 1) Satır 6 (1'') YASİN → iki aday → "kaynaklı" seç: _labVariantTags = [v:kaynak]
    await page.locator('[row-index="6"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    // Popup adayın ETİKETİNİ gösterir (`c.label`), malzeme adını değil.
    await page.getByText('kaynaklı', { exact: true }).click();
    await expect(page.locator('[row-index="6"] [col-id="_labBirim"]')).toHaveText(/9/);
    // 2) Aynı satıra HAKAN: yine aday sorar → D1 fiyatı siler (ve Y3 kimliği).
    await page.locator('[row-index="6"] [col-id="_firma"] button').click();
    await page.getByText('HAKAN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="6"] [col-id="_labBirim"]')).toHaveText(/^\s*$/);
    // Popup açıkken sürüklüyoruz (tutamağın üstünü örtmüyor). "İptal" (D15)
    // burada KULLANILMAZ: firmayı boşaltır, sürüklenecek kaynak kalmazdı.
    // 3) HAKAN'ı satır 7'ye sürükle.
    await surukle(page, 6, 7, '_firma');
    await expect.poll(async () => iscSon(await olaylar(page), 7) ?? '', { timeout: 10_000 }).toContain('satir=7');
    // Kusurlu hâlde: varyant=[v:kaynak] — YASİN'in seçimi HAKAN sorgusuna gidiyordu.
    expect(iscSon(await olaylar(page), 7), 'satır 7 işçilik sorgusu').toContain('varyant=[-]');
  });
});
