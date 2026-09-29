import { test, expect, Page } from '@playwright/test';

/**
 * IY — ISARET ALANLARI GERCEKTEN YAZILIYOR MU? (29.09.2026)
 *
 * ── NEDEN BU DOSYA ──────────────────────────────────────────────────────────
 * Marka/firma eslestirme yolu satira ISARET yazar: `_matStatus` ('yok',
 * 'belirsiz', 'urun_degil', 'hata'), `_matSuggestion`, `_matAutoVariant`,
 * `_matVariantMode`. Bu isaretler ekrandaki RENGI ve "N satır seçim bekliyor"
 * sayacini surer (isaret.ts).
 *
 * ⚠ HICBIRI GRID KOLONU DEGIL. Kolon listesi olculdu — sabit sema yalniz
 * `_no _ad _miktar _birim _malzKar _marka _matBirim _matToplam _iscKar _firma
 * _labBirim _labToplam _toplam` tasir (backend/.../standart-sema.ts) ve
 * ExcelGrid yalniz `_draftDiscount`/`_draftNetPrice` ekler. AG Grid
 * `setDataValue` cagrisini kolon bulamayinca SESSIZCE dusurur; dosyanin kendi
 * yorumu bunu zaten belgeliyor (fill-down yolu icin duzeltilmisti):
 *   "_matStatus grid KOLONU OLMADIGI icin AG-Grid cagriyi sessizce yok
 *    sayiyordu (141 satirin 131'i isaretsiz bos kaldi)"
 *
 * ── NEDEN BAGLANTI TESTI (yardimciyi sinamak YETMEZ) ────────────────────────
 * `yazVeriHucre`in kendisi dogru calisiyor olabilir; soru ONUN CAGRILIP
 * cagrilmadigidir. Bu yuzden test gercek kullanici yolunu surer: marka sec →
 * eslesmeyen satirin isareti YAZILMIS MI, ekranda GORUNUYOR MU.
 *
 * ⚠ EN PAHALI HALI — `kurAlinamadi`: doviz kuru alinamayinca satir 'hata'
 * isareti alir ve TURUNCU boyanir. Isaret dusuyorsa fiyati 0 kalan satir
 * sessizce siradan gorunur; kullanici teklifi eksik fiyatla gonderir.
 */

/** Kaynak satirda AYVAZ + "Su ve Yangın" secer (fiyat 600 yazilir). */
async function markaSec(page: Page, satir = 2) {
  await page.locator(`[row-index="${satir}"] [col-id="_marka"] button`).click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.getByRole('button', { name: /Su ve Yangın/ }).click();
  await expect(page.locator(`[row-index="${satir}"] [col-id="_matBirim"]`)).toHaveText(/600/, { timeout: 15_000 });
}

/** Satirin ISARET alanlarini AG Grid'in satir verisinden okur. */
async function isaretler(page: Page, satir: number) {
  return page.evaluate((r) => {
    const el = document.querySelector(`[row-index="${r}"]`);
    const g = (window as any).__gridApi;
    const node = g?.getDisplayedRowAtIndex?.(r);
    const d = node?.data ?? {};
    const hucre = document.querySelector(`[row-index="${r}"] [col-id="_matBirim"]`);
    return {
      matStatus: d._matStatus ?? null,
      matSuggestion: d._matSuggestion ?? null,
      zemin: hucre ? getComputedStyle(hucre).backgroundColor : null,
      satirVar: !!el,
    };
  }, satir);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/grid-test');
  await expect(page.locator('[row-index="2"] [col-id="col1"]')).toHaveText(/6'' Siyah Boru/, { timeout: 20_000 });
});

test('IY1 ★ ESLESMEYEN satir isaret ALIR ve kirmizi gorunur', async ({ page }) => {
  // 2'' Siyah Boru (satir 5) bu markada YOK → `_matStatus='yok'` yazilmali ve
  // hucre kirmizi olmali. Isaret dusuyorsa satir bos ama NOTR gorunur.
  // DOGRUDAN o satira marka secilir: baska satira once secmek gerekmiyor —
  // olculdu, akis tek adim (marka listesi acilir, AYVAZ secilir, eslesme yoksa
  // grup popup'i HIC acilmaz).
  await page.locator('[row-index="5"] [col-id="_marka"] button').click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.waitForTimeout(2500);

  const hucre = page.locator('[row-index="5"] [col-id="_matBirim"]');
  await expect(hucre).toHaveText(/^\s*$/);                 // fiyat YOK
  // ★ Fiyatsizligin GORUNUR olmasi: isaret zemini (isaret.ts kirmizi/sari/gri)
  // ⚠ TAM RENK olculur, "seffaf degil" DEGIL: satirin kendi zebra zemini de
  // seffaf degildir ve gevsek assert'i gecer (olculdu — iki mutant hayatta
  // kalmisti). `isaret.ts` eslesme YOK durumunda KIRMIZI verir.
  await expect.poll(async () => hucre.evaluate((e) => getComputedStyle(e).backgroundColor),
    { timeout: 10_000 }).toBe('rgb(254, 226, 226)');
  // Ust bantta sayac da gorunur olmali (isaret EYLEMLI — SD6)
  await expect(page.getByText(/satır seçim bekliyor/).first()).toBeVisible();
});

test('IY2 ★ SURUKLE-DOLDUR yolunda isaret yaziliyor (kanitli yol — regresyon)', async ({ page }) => {
  // Bu yol `fill-down.ts` uzerinden gecer ve isareti `yazVeri` ile yazar
  // (FAZ 0 §A'da duzeltilmisti). Karsilastirma tabani: burasi YESIL kalmali.
  await markaSec(page, 2);
  const kaynak = await page.locator('[row-index="2"] [col-id="_marka"]').boundingBox();
  const hedef = await page.locator('[row-index="7"] [col-id="_marka"]').boundingBox();
  if (!kaynak || !hedef) throw new Error('koordinat yok');
  const x = kaynak.x + kaynak.width / 2;
  const yBas = kaynak.y + kaynak.height - 3;
  const yBit = hedef.y + hedef.height / 2;
  await page.mouse.move(x, yBas);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, yBas + ((yBit - yBas) * i) / 10);
  await page.mouse.up();
  await page.waitForTimeout(1500);

  // 2'' (satir 5) bu markada yok → surukleme sonrasi KIRMIZI olmali
  await expect.poll(async () => page.locator('[row-index="5"] [col-id="_matBirim"]')
    .evaluate((e) => getComputedStyle(e).backgroundColor), { timeout: 10_000 })
    .toBe('rgb(254, 226, 226)');
});


test('IY3 ★★ KUR ALINAMADI → TURUNCU "hata" isareti (en pahali dal)', async ({ page }) => {
  // KUR-01: urun VAR, eksik olan doviz kuru. Satir 'hata' isareti alir ve
  // TURUNCU boyanir ("tekrar deneyin"). 'yok' YAZILMAZ — taslak geri
  // yuklemesi 'yok'u cevaplanmis sayar ve kur donunce satiri yeniden
  // fiyatlamazdi.
  //
  // ⚠ BU TEST TAZELEMEYI OLCER: isaret alanlari grid KOLONU degildir; veri
  // yazilip hucre yeniden cizilmezse satir NOTR gorunur. Bu dalda ekranda
  // baska hicbir islem olmadigi icin cizim SADECE `yazVeri`nin acik
  // tazelemesinden gelir. Tarayicida olculdu: tazeleme kaldirilinca turuncu
  // HIC gorunmuyordu — fiyati 0 kalan satir siradan gorunup teklife giderdi.
  await page.locator('[row-index="11"] [col-id="_marka"] button').click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.waitForTimeout(2500);

  const hucre = page.locator('[row-index="11"] [col-id="_matBirim"]');
  await expect(hucre).toHaveText(/^\s*$/);                   // fiyat uretilmedi
  await expect.poll(async () => hucre.evaluate((e) => getComputedStyle(e).backgroundColor),
    { timeout: 10_000 }).toBe('rgb(255, 237, 213)');          // isaret.ts TURUNCU
});
