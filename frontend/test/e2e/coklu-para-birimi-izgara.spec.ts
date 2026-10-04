/**
 * COKLU PARA BIRIMI F2 (Emre karari 04.10) — izgara KARISIK KIP.
 *
 * Dovizli kalem teklifte KENDI para biriminde kalir; birim TARAF basinadir
 * (malzeme $ + iscilik ₺ ayni satirda olabilir). Motor (F1) TL alanlarina EK
 * olarak `kaynakFiyat` doner; karisik kipte izgara onu yazar:
 *   - tarafin birimi (`_matPB` / `_labPB`), dovizli net, 2 hane YUKARI satis
 *     ve toplam (karar 4), hucrede tarafin sembolu;
 *   - karma satirin Toplam hucresi iki tutar yan yana (karar 1);
 *   - elle yazilan fiyat tarafin birimini korur, "$12" birimi secer (karar 3).
 * Kip teklif duzeyinde bir BAYRAKTIR: kapaliyken (tl) davranis bugunkuyle
 * AYNI — sayfa toplamlari / KAR / fitting F3'e kadar karisik kipi bilmez,
 * bu yuzden uretim sayfasi F6'ya dek bayragi GECIRMEZ.
 *
 * Harness: `?para=karisik` · DOLAR MARKA (kur 40; 6'' tek eslesme $10,50 ·
 * 1'' iki aday $9,25 / $11,13 · 4'' $10) · DOLAR USTA (3'' $0,75) ·
 * satir 2 = 6'' (286) · 3 = 4'' (268) · 4 = 3'' (102) · 6 = 1'' (872).
 */
import { test, expect, Page } from '@playwright/test';

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

const hucre = (page: Page, row: number, col: string) => page.locator(`[row-index="${row}"] [col-id="${col}"]`);

/** Toplam kolonu yatay sanallastirmada ekran DISINDA — kaydir (eslestirme-temizlik.spec ile ayni). */
async function toplamKolonunuGetir(page: Page, row: number) {
  await page.locator('.ag-center-cols-viewport').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(hucre(page, row, '_toplam')).toBeVisible();
}

async function elleYaz(page: Page, row: number, col: string, metin: string) {
  await hucre(page, row, col).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(metin);
  await page.keyboard.press('Enter');
}

test.describe('F2 — KONTROL: tl kipi (bayrak kapali) bugunku gibi', () => {
  test('★★ dolar listeli marka TL olarak yazilir (kaynak fiyat yok sayilir)', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('₺420,00');
    await expect(hucre(page, 2, '_matToplam')).toHaveText('₺120.120,00');
  });
});

test.describe('F2 — karisik kip: taraf kendi para biriminde', () => {
  test('★★ tek eslesme: birim $10,50 · toplam 10,50 × 286 = $3.003,00', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await expect(hucre(page, 2, '_matToplam')).toHaveText('$3.003,00');
  });

  test('★ aday secimi de dovizde yazar: $9,25 × 872 = $8.066,00', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 6, '_marka', 'DOLAR MARKA');
    await page.getByText('vidalı $', { exact: true }).click();
    await expect(hucre(page, 6, '_matBirim')).toHaveText('$9,25');
    await expect(hucre(page, 6, '_matToplam')).toHaveText('$8.066,00');
  });

  test('★ TL listeli marka karisik kipte de ₺ (birim kaynaktan)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 3, '_marka', 'AYVAZ');
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(hucre(page, 3, '_matBirim')).toHaveText('₺400,00');
  });

  test('★★ KARMA SATIR (karar 1): malzeme $ + iscilik ₺ → Toplam iki tutar yan yana', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 3, '_marka', 'DOLAR MARKA');               // 4'' → $10 × 268
    await expect(hucre(page, 3, '_matToplam')).toHaveText('$2.680,00');
    await sec(page, 3, '_firma', 'YASİN USTA');                // 4'' → ₺40 × 268
    await expect(hucre(page, 3, '_labToplam')).toHaveText('₺10.720,00');
    await toplamKolonunuGetir(page, 3);
    await expect(hucre(page, 3, '_toplam')).toHaveText('$2.680,00 + ₺10.720,00');
  });

  test('★ ISCILIK ikizi: dolar firmasi $0,75', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 4, '_firma', 'DOLAR USTA');
    await expect(hucre(page, 4, '_labBirim')).toHaveText('$0,75');
    await expect(hucre(page, 4, '_labToplam')).toHaveText('$76,50'); // 0,75 × 102
  });

  test('★ surukle-doldur dovizi tasir: 6\'\' kaynak → 4\'\' hedef $10,00', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await surukle(page, 2, 3, '_marka');
    await expect(hucre(page, 3, '_matBirim')).toHaveText('$10,00');
    await expect(hucre(page, 3, '_matToplam')).toHaveText('$2.680,00');
  });
});

test.describe('F2 — elle fiyat (karar 3)', () => {
  test('★★ "$12" yazimi birimi secer (bos satirda ₺ yerine $)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await elleYaz(page, 4, '_matBirim', '$12');
    await expect(hucre(page, 4, '_matBirim')).toHaveText('$12,00');
    await expect(hucre(page, 4, '_matToplam')).toHaveText('$1.224,00'); // 12 × 102
  });

  test('★ elle $ fiyatin toplami 2 hane (karar 4): $12,31 × 102 = $1.255,62', async ({ page }) => {
    // Tam sayili ornek ($12 × 102) hane farkini GOSTERMEZ — mutant EG-M9 (toplam
    // 1 hane) o ornekte yasadi. ₺ kurali burada $1.255,70 yazardi.
    await page.goto('/dev/grid-test?para=karisik');
    await elleYaz(page, 4, '_matBirim', '$12,31');
    await expect(hucre(page, 4, '_matToplam')).toHaveText('$1.255,62');
  });

  test('★★ duz sayi tarafin MEVCUT birimini korur ($ satira 15 → $15)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50');
    await elleYaz(page, 2, '_matBirim', '15');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$15,00');
  });

  test('KONTROL: bos satira duz sayi ₺ (birim yoksa TRY)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await elleYaz(page, 4, '_matBirim', '12');
    await expect(hucre(page, 4, '_matBirim')).toHaveText('₺12,00');
  });
});
