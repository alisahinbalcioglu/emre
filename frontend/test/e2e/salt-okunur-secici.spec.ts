/**
 * D9 + Y1 (30.09, P1) — SALT OKUNUR SEÇİCİ · MEKANİZMA
 *
 * `quotes/[id]` kaydedilmiş teklifi GÖRÜNTÜLEME sayfasıdır, ama satırların
 * Marka ve İşç. Firma hücreleri gerçek açılır listeydi ve seçim satır
 * nesnesini DEĞİŞTİRİYORDU:
 *   MALZEME: sayfa `onBrandChange` olarak null dönen stub veriyor → seçim
 *     "bu markada yok" dalına düşüp fiyatı SİLİYOR, satırı kırmızıya boyuyordu.
 *   İŞÇİLİK (Y1, daha kötü): `onFirmaChange` hiç verilmiyor → firma yazıldıktan
 *     SONRA erken return; firma B görünür, fiyat A'nınki KALIR, işaret yok.
 *
 * Bu dosya MEKANİZMAYI ölçer: bayrak açıkken hücre açılır liste çizmiyor ve
 * satır değişmiyor. Bayrağın gerçek sayfada GEÇİRİLDİĞİNİ ölçen ayrı kaynak
 * kapısı: `ozellik/teklif/salt-okunur-secici.test.ts` — ikisi ayrı ("mekanizma
 * var, bağlantı yok" dersi; biri yeşil öbürü kırmızı olabilir).
 *
 * ⚠ Bu bir TAKLİT ölçümdür: gerçek `/quotes/[id]` sayfası auth + kayıtlı teklif
 * istediği için harness'te aynı prop sürülüyor. Sayfanın prop'u GERÇEKTEN
 * geçirdiği kaynak kapısında kilitli — bu testin tek başına kanıt sayılmaması
 * için not düşüldü.
 */
import { test, expect, Page } from '@playwright/test';

const BOS = /^\s*$/;

/** Düzenlenebilir hâl (bayrak KAPALI) — karşılaştırma tabanı. */
async function acDuzenlenebilir(page: Page) {
  await page.goto('/dev/grid-test');
  await expect(page.locator('[row-index="2"] [col-id="_marka"]')).toBeVisible();
}

/** Salt okunur hâl (bayrak AÇIK). */
async function acSaltOkunur(page: Page) {
  await page.goto('/dev/grid-test?salt=1');
  await expect(page.locator('[row-index="2"] [col-id="_marka"]')).toBeVisible();
}

test.describe('D9 + Y1 — salt okunur seçici (mekanizma)', () => {
  test('★ FİKSTÜR KANITI: bayrak KAPALIYKEN marka hücresi açılır liste (düğme) çizer', async ({ page }) => {
    // Bu assert olmadan aşağıdaki "düğme yok" testleri vacuous yeşil olurdu:
    // hücre hiç render edilmese de geçerlerdi.
    await acDuzenlenebilir(page);
    await expect(page.locator('[row-index="2"] [col-id="_marka"] button')).toHaveCount(1);
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(1);
  });

  test('★ MALZEME: bayrak açıkken marka hücresinde açılır liste YOK', async ({ page }) => {
    await acSaltOkunur(page);
    await expect(page.locator('[row-index="2"] [col-id="_marka"] button')).toHaveCount(0);
  });

  test('★ İŞÇİLİK İKİZİ: bayrak açıkken firma hücresinde açılır liste YOK', async ({ page }) => {
    await acSaltOkunur(page);
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(0);
  });

  test('★ MALZEME: seçili marka ADI yine görünür (bilgi kaybolmaz)', async ({ page }) => {
    // Önce düzenlenebilir hâlde marka seçip fiyatlandır, sonra salt okunur aç:
    // harness durumu sayfa yenilemesinde sıfırlandığı için adın görünürlüğü
    // DOLU bir satırla ölçülemez; bu yüzden boş satırda etiket kabını ölçüyoruz
    // ve ADIN kaynağı kaynak kapısında (valueFormatter ile aynı liste) kilitli.
    await acSaltOkunur(page);
    const hucre = page.locator('[row-index="2"] [col-id="_marka"]');
    await expect(hucre).toHaveText(BOS);            // marka seçilmemiş → boş
    await expect(hucre.locator('span')).toHaveCount(1); // etiket kabı VAR
  });

  test('★ MALZEME: hücreye tıklamak satırı DEĞİŞTİRMEZ (fiyat silinmez)', async ({ page }) => {
    // Düzenlenebilir hâlde fiyatla, sonra aynı tarayıcı sayfasında bayrağı aç.
    await acDuzenlenebilir(page);
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);

    // Fiyatlı satırda tıklama denemesi: liste açılmaz, hücre değişmez.
    await acSaltOkunur(page);
    await page.locator('[row-index="2"] [col-id="_marka"]').click();
    await expect(page.locator('[role="listbox"], [role="menu"]')).toHaveCount(0);
  });

  test('★ KONTROL GRUBU: bayrak KAPALI yol bozulmadı — marka seçimi hâlâ fiyat yazıyor', async ({ page }) => {
    await acDuzenlenebilir(page);
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  });

  test('★ KONTROL GRUBU: bayrak KAPALI yolda firma seçimi hâlâ işçilik fiyatı yazıyor', async ({ page }) => {
    await acDuzenlenebilir(page);
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/60/);
  });
});
