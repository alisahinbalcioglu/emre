/**
 * BANT (30.09, P1) — "⚠ N satır seçim bekliyor" SAYACI TAZELENMİYOR
 *
 * Bu bant kullanıcının GÜVEN KAPISIDIR: fiyatsız/belirsiz kalan satırları
 * sayar. Sayı yanlışsa kullanıcı "her şey tamam" sanıp teklifi fiyatsız
 * kalemle gönderir.
 *
 * KUSUR: sayıyı yalnız `recountPending` hesaplar ve iki yerden çağrılır —
 * (a) `data.rowData` prop'u değişince (sayfa/sekme geçişi), (b)
 * `handleCellValueChanged`in SON satırı, yani yalnız GERÇEK bir grid kolonu
 * değişince. İşaret alanları (`_matStatus` / `_labStatus`) grid kolonu DEĞİL:
 * `yazVeri`/`yazVeriLab` ile yazılıyorlar ve olay ATEŞLEMİYOR.
 *
 * Sıra şöyle: marka seçilir → `setDataValue('_marka')` olay ateşler →
 * `recountPending` EŞZAMANLI koşar (o anda `_matStatus` hâlâ ESKİ) → await →
 * `fiyatiTemizle()` para kolonlarını yazar, olay yine ateşler, sayaç yine ESKİ
 * durumla koşar → EN SON `_matStatus='yok'` yazılır, olay YOK. Bant satırı
 * HİÇ saymaz.
 *
 * ⚠ KOORDİNATÖRÜN UYARDIĞI TUZAK: bu kusur çoğu senaryoda TESADÜFEN doğru
 * görünür — başka bir işlem (ikinci bir hücre yazımı, sekme geçişi, sürükleme
 * sonrası prop değişimi) sayacı sonradan koşturur. Bu yüzden senaryo BANDI TEK
 * BAŞINA tetikler: tek satır, tek marka seçimi, başka hiçbir işlem yok.
 *
 * Ölçüt SAYIDIR, "görünür mü" değil: gevşek bir regex başka satırdan gelen
 * tesadüfi sayımı yeşil bırakırdı.
 */
import { test, expect, Page } from '@playwright/test';

/** Bandın tam metni (ExcelGrid.tsx: "⚠ {pendingCount} satır seçim bekliyor"). */
const bant = (page: Page, n: number) => page.getByText(`⚠ ${n} satır seçim bekliyor`, { exact: true });

/** Projenin kanitlanmis surukleme gesture'u (grid.spec.ts:12 ile birebir):
 *  hucrenin ORTA x'inden, ALT kenarindan baslar ve adim adim iner. Kendi
 *  yazdigim "sag-alt kose + tek move" denemesi HIC doldurmadi (olculdu). */
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

async function ac(page: Page) {
  await page.goto('/dev/grid-test');
  await expect(page.locator('[row-index="2"] [col-id="_marka"]')).toBeVisible();
}

test.describe('BANT — "N satır seçim bekliyor" sayacı', () => {
  test('★ FİKSTÜR KANITI: başlangıçta bant YOK (sayaç 0)', async ({ page }) => {
    // Bu olmadan aşağıdaki testler "bant göründü" diye yanlış sebepten geçebilir.
    await ac(page);
    await expect(page.getByText(/satır seçim bekliyor/)).toHaveCount(0);
  });

  test('★★ TEK İŞLEM: markada ürün yok → bant 1 sayar (başka hiçbir işlem yapılmaz)', async ({ page }) => {
    await ac(page);
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('SARDOĞAN', { exact: true }).click();

    // 1) İŞARET yazıldı ve EKRANDA görünür — karşılaştırma tabanı (bugün yeşil).
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]'))
      .toHaveCSS('background-color', 'rgb(254, 226, 226)');

    // 2) ★ BANT da aynı satırı sayar. Kusurlu hâlde bant HİÇ görünmüyordu.
    await expect(bant(page, 1)).toBeVisible();
  });

  test('★★ İKİZ işçilik: firmada kalem yok → bant 1 sayar', async ({ page }) => {
    await ac(page);
    // Satır 5 = 2'' — HAKAN USTA bu çapta YAVAŞ "bu firmada yok" döner.
    // ⚠ YAVAŞ DAL ŞART: hızlı cevapta React kolon olayının sayımını durum
    // yazımıyla aynı tike toplar ve bant TESADÜFEN doğru görünür — kapı
    // ölçmez olur (mutant BANT-M2 hızlı dalda YAŞIYORDU, ölçüldü).
    await page.locator('[row-index="5"] [col-id="_firma"] button').click();
    await page.getByText('HAKAN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="5"] [col-id="_labBirim"]'))
      .toHaveCSS('background-color', 'rgb(254, 226, 226)');
    await expect(bant(page, 1)).toBeVisible();
  });

  test('★ SATIR BİR KEZ SAYILIR: aynı satır iki tarafta da beklerken bant 1 der', async ({ page }) => {
    // Sayaç SATIR sayar (isaret.ts `secimBekliyor` sözleşmesi: iki taraf OR'lanır).
    await ac(page);
    await page.locator('[row-index="5"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();      // 2'' → markada yok
    await page.locator('[row-index="5"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();  // 2'' → firmada yok
    await expect(bant(page, 1)).toBeVisible();
  });

  test('★ FİYAT GELİNCE bant söner (sayaç iki yöne de çalışır)', async ({ page }) => {
    await ac(page);
    // Önce beklemeye düşür
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('SARDOĞAN', { exact: true }).click();
    await expect(bant(page, 1)).toBeVisible();
    // Sonra fiyatla
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
    await expect(page.getByText(/satır seçim bekliyor/)).toHaveCount(0);
  });

  test('★★ SURUKLE-DOLDUR: fiyatsiz kalan satirlar da banda yansir', async ({ page }) => {
    // Doldurma yolu isareti fill-down'in kendi `yaz`i ile yazar — kolon
    // olmadigi icin orada da olay atesmez. Hic fiyatlanmamis satirda
    // `fiyatiTemizle` ayni (bos) degeri yazdigi icin AG Grid degisim bile
    // gormez: tek olay kaynagi kapanir.
    await ac(page);
    // Kaynak satir 2'yi AYVAZ ile fiyatla, sonra 9'a kadar surukle.
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);

    await surukle(page, 2, 9);

    // FIKSTUR KANITI: doldurma GERCEKTEN kostu mu? (ilk denememde gesture
    // hicbir satiri doldurmamisti ve bant testi YANLIS sebepten kirmizi yandi.)
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
    await expect(page.locator('[row-index="7"] [col-id="_matBirim"]')).toHaveText(/75/);
    // Satir 5 (2'' — markada yok) ve satir 6 (1'' — secim bekliyor) = 2 satir.
    await expect(page.locator('[row-index="5"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(bant(page, 2)).toBeVisible();
  });

  test('★ İKİ SATIR → bant 2 sayar (sayı gerçekten sayıyor, sabit değil)', async ({ page }) => {
    await ac(page);
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('SARDOĞAN', { exact: true }).click();
    await expect(bant(page, 1)).toBeVisible();
    await page.locator('[row-index="5"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();       // 2'' → yok
    await expect(bant(page, 2)).toBeVisible();
  });
});
