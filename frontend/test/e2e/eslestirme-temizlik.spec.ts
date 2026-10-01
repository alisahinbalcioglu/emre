/**
 * D1 (30.09, P0) — FİYAT YAZMAYAN DAL ESKİ FİYATI SİLER · ETKİLEŞİMLİ YOL
 *
 * `fill-down.test.ts`'teki D1 paketi SÜRÜKLEME yolunu ölçer; bu dosya
 * ExcelGrid'in ETKİLEŞİMLİ yolunu ölçer (marka menüsünden seçim, aday
 * popup'ı, "Kapat (fiyatsız bırak)"). O yol jsdom'suz koşulamadığı için
 * gerçek tarayıcı tek ölçüm yeridir.
 *
 * KUSUR: satır marka A ile fiyatlanmışken kullanıcı marka B'yi seçer ve B'de
 * ürün yoktur. Eski hâl: hücreye 'yok' işareti yazılır ama A'NIN FİYATI
 * HÜCREDE DURUR. Satır `brandId=B` + A'nın parasıyla kaydedilir; fiyatsız
 * kalem uyarısı onu yakalamaz (fiyat dolu görünüyor). Aynı şey aday popup'ı
 * açılınca ve popup "fiyatsız bırak" ile kapatılınca da oluyordu.
 *
 * Harness: SARDOĞAN markasında 6'' YOKTUR (page.tsx mock'u), diğer çaplarda
 * normal davranır — böylece 'yok' ve 'belirsiz' dalları ayrı ölçülür.
 */
import { test, expect, Page } from '@playwright/test';

const BOS = /^\s*$/;

async function ac(page: Page) {
  await page.goto('/dev/grid-test');
  await expect(page.locator('[row-index="2"] [col-id="_marka"]')).toBeVisible();
}

/** Genel Toplam kolonu yatay sanallaştırmanın DIŞINDA kalıyor: hücre DOM'da
 *  yok, locator "element(s) not found" der. Gride sağa kaydırıp getiriyoruz. */
async function toplamKolonunuGetir(page: Page) {
  await page.locator('.ag-center-cols-viewport').first().evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(page.locator('[row-index="2"] [col-id="_toplam"]')).toBeVisible();
}

/** Marka menüsünü açıp verilen markayı seçer. */
async function markaSec(page: Page, row: number, marka: string) {
  await page.locator(`[row-index="${row}"] [col-id="_marka"] button`).click();
  await page.getByText(marka, { exact: true }).click();
}

/** Satır 2'yi (6'' Siyah Boru) AYVAZ + "Su ve Yangın" ile 600'e fiyatlar. */
async function ayvazIle600(page: Page) {
  await markaSec(page, 2, 'AYVAZ');
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  await expect(page.locator('[row-index="2"] [col-id="_matToplam"]')).not.toHaveText(BOS);
}

test.describe('D1 — fiyat yazmayan dal eski fiyatı siler (etkileşimli)', () => {
  test('D1-E1 ★ marka değişti, yeni markada ürün YOK → A\'nın fiyatı hücrede KALMAZ', async ({ page }) => {
    await ac(page);
    await ayvazIle600(page);

    await markaSec(page, 2, 'SARDOĞAN');

    // Para hücrelerinin ÜÇÜ de temizlenir — biri kalsa satır "fiyatlı" sayılır.
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(BOS);
    await expect(page.locator('[row-index="2"] [col-id="_matToplam"]')).toHaveText(BOS);
    // Genel Toplam: ₺171.600,00 → boş. (recalcGrand veriye '0.00' yazar;
    // para biçimlendiricisi sıfırı boş gösterir — hiç fiyatlanmamış satırla
    // AYNI görünüm. Ölçüldü: fiyatlı "₺171.600,00", fiyatsız "".)
    await toplamKolonunuGetir(page);
    await expect(page.locator('[row-index="2"] [col-id="_toplam"]')).toHaveText(BOS);
  });

  test('D1-E1b ★ hücre KIRMIZI görünür — önceki markanın rozeti maskelemez', async ({ page }) => {
    await ac(page);
    await ayvazIle600(page);
    await markaSec(page, 2, 'SARDOĞAN');

    // isaret.ts: 'yok' → #fee2e2. Mavi (#e0f2fe) görünürse oto-varyant rozeti
    // temizlenmemiş demektir (D1b MAVİ MASKE).
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]'))
      .toHaveCSS('background-color', 'rgb(254, 226, 226)');
  });

  test('D1-E2 ★ aday popup\'ı açılınca eski fiyat hücrede DURMAZ (belirsiz dalı)', async ({ page }) => {
    await ac(page);
    // Satır 6 = 1'' Siyah Boru: her markada 2 aday sorar.
    await markaSec(page, 6, 'AYVAZ');
    await page.getByText('düz uçlu', { exact: false }).first().click();
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).not.toHaveText(BOS);

    // Aynı satıra başka marka: yine aday sorulur — seçim BEKLERKEN satır
    // eski fiyatla dolu duramaz, yoksa kullanıcı seçmeyi unutur ve teklif
    // önceki markanın parasıyla gider.
    await markaSec(page, 6, 'SARDOĞAN');
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).toHaveText(BOS);
    await expect(page.locator('[row-index="6"] [col-id="_matToplam"]')).toHaveText(BOS);
  });

  test('D1-E3 ★ aday popup\'ı "İptal" ile kapanınca eski fiyat da gider', async ({ page }) => {
    await ac(page);
    await markaSec(page, 6, 'AYVAZ');
    await page.getByText('düz uçlu', { exact: false }).first().click();
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).not.toHaveText(BOS);

    await markaSec(page, 6, 'SARDOĞAN');
    await page.getByRole('button', { name: 'İptal', exact: true }).click();

    // handleCancel markayı boşaltır; fiyat da gitmiş olmalı.
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).toHaveText(BOS);
    await expect(page.locator('[row-index="6"] [col-id="_matToplam"]')).toHaveText(BOS);
    // ★ Ve satır İŞARETSİZ kalır: markasız satır "seçim bekliyor" sayılamaz.
    // İşaret kalsaydı hücre pembe (#fee2e2) durur, üst sayaç şişerdi.
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]'))
      .not.toHaveCSS('background-color', 'rgb(254, 226, 226)');
  });

  test('D2-E1 ★ YARIŞ: yavaş markanın geç cevabı yeni seçimin fiyatını EZMEZ', async ({ page }) => {
    // Kullanıcı SARDOĞAN'ı seçer (harness'ta 500 ms), beklemeden AYVAZ'a
    // geçip fiyatı yazdırır. Eski hâl: SARDOĞAN'ın geç gelen "bu markada yok"
    // cevabı sonradan düşüp AYVAZ'ın 600'ünü SİLİYOR ve satırı kırmızıya
    // boyuyordu — ekranda marka AYVAZ, hücre boş ve kırmızı.
    await ac(page);
    await markaSec(page, 2, 'SARDOĞAN');      // yavaş sorgu başlar
    await markaSec(page, 2, 'AYVAZ');          // beklemeden marka değiştirilir
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);

    // Geç cevabın gelmesi için SARDOĞAN'ın gecikmesinden uzun bekle.
    await page.waitForTimeout(900);
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]'), 'geç cevap fiyatı silmedi').toHaveText(/600/);
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]'), 'geç cevap kırmızıya boyamadı')
      .not.toHaveCSS('background-color', 'rgb(254, 226, 226)');
  });

  test('D2-E2 ★ İKİZ YARIŞ: geç gelen FİRMA cevabı da yeni seçimin fiyatını ezmez', async ({ page }) => {
    // Malzeme ikizinin işçilik karşılığı. Harness'ta HAKAN USTA 6'' için yavaş
    // (500 ms) ve 999 döner; YASİN USTA hızlı ve 60 döner. Kullanıcı HAKAN'ı
    // seçip beklemeden YASİN'e geçer. Eski hâl: HAKAN'ın geç cevabı sonradan
    // düşüp hücreye 999 yazıyordu — ekranda firma YASİN, fiyat HAKAN'ınki.
    await ac(page);
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('HAKAN USTA', { exact: true }).click();
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/60/);

    await page.waitForTimeout(900); // HAKAN'ın geç cevabı bu sürede düşer
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]'), 'geç cevap ezmedi').toHaveText(/60/);
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]'), '999 yazılmadı').not.toHaveText(/999/);
  });

  test('D1-E4 ★ FİYATLI yol bozulmadı: marka seçimi hâlâ fiyat yazıyor', async ({ page }) => {
    // Temizleme yolu fiyatlı dala karışsaydı bu test kırmızı olurdu.
    await ac(page);
    await ayvazIle600(page);
    await toplamKolonunuGetir(page);
    await expect(page.locator('[row-index="2"] [col-id="_toplam"]')).toHaveText(/171\.600,00/);
  });
});
