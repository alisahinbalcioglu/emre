/**
 * Y5 (30.09, P3) — ELLE FİYAT GİRİLİNCE "⚡ OTOMATİK" ROZETİ KALIYOR
 *
 * Sürükle-doldur (ya da grup yayılımı) hedef satırı varyant etiketiyle
 * fiyatlar: `_matAutoVariant` dolar, hücre MAVİ boyanır ve ipucu "⚡ otomatik:
 * <varyant> — farklı varyant için marka menüsünü yeniden açın" der.
 * Kullanıcı o hücreye fiyatı ELLE yazınca elle-giriş dalı durumu, sebebi, aday
 * sayısını ve öneriyi temizliyor ama `_matAutoVariant`ı BIRAKIYORDU: hücre
 * mavi kalıyor, ipucu kullanıcının yazdığı fiyatı "otomatik atandı" diye
 * gösteriyordu (`isaret.ts` sırası: otoVaryant her şeyin önünde).
 *
 * Düzeltmenin kendi tuzağı: rozeti silmek tek başına YETMEZ. Marka menüsüne
 * yeniden tıklamak bugün TAM LİSTE açıyor (V4.2 oto-kaçış: `escapeAuto =
 * !!_matAutoVariant`). Rozet silinip satır 'auto' kipinde kalırsa aynı tık
 * GRUP VARYANTIYLA sorgulanır ve elle yazılan fiyatın üstüne sessizce otomatik
 * fiyat yazılırdı. Elle fiyat = MANUEL satır (aday seçimi ve alternatif marka
 * seçimiyle aynı kural, `handleCandidateSelect`).
 *
 * Harness: satır 2 = 6'' (AYVAZ iki gruplu aday, "Su ve Yangın…" 600) ·
 * satır 3 = 4'' (sürükleyince varyantla 400) · satır 12-14 BAŞLIKLI aile
 * ("Yükselen Milli Vana" + DN 100 / DN 150; flanşlı 1000 / 1500).
 */
import { test, expect, Page } from '@playwright/test';

const MAVI = 'rgb(224, 242, 254)'; // isaret.ts MAVI (#e0f2fe)
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

const olaylar = (page: Page): Promise<string[]> => page.evaluate(() => window.__olay ?? []);
const sonSorgu = async (page: Page, row: number) =>
  [...(await olaylar(page))].reverse().find((o) => o.includes(`sorgu: satir=${row} `)) ?? '';

/** Satır 3'ü sürükle-doldurla OTOMATİK (mavi) fiyatlar. */
async function otomatikSatir(page: Page) {
  await page.goto('/dev/grid-test');
  await page.locator('[row-index="2"] [col-id="_marka"] button').click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.getByText(SU_YANGIN).click();
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  await surukle(page, 2, 3, '_marka');
  await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
  // FİKSTÜR KANITI: satır gerçekten OTOMATİK rozetli (yoksa "mavi değil"
  // yanlış sebepten geçer).
  await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveCSS('background-color', MAVI);
}

async function elleYaz(page: Page, row: number, deger: string, gorunen: RegExp) {
  await page.locator(`[row-index="${row}"] [col-id="_matBirim"]`).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(deger);
  await page.keyboard.press('Enter');
  await expect(page.locator(`[row-index="${row}"] [col-id="_matBirim"]`)).toHaveText(gorunen);
}

test.describe('Y5 — elle fiyat otomatik rozetini kaldırır', () => {
  test('FİKSTÜR KANITI: sürükle-doldur hedefi mavi (otomatik) olur', async ({ page }) => {
    await otomatikSatir(page);
  });

  test('★★ elle yazılan fiyatın hücresi MAVİ kalmaz', async ({ page }) => {
    await otomatikSatir(page);
    await elleYaz(page, 3, '450', /450/);
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).not.toHaveCSS('background-color', MAVI);
  });

  test('★★ elle fiyatlanan satıra GRUP ATAMASI sessizce otomatik fiyat yazmaz', async ({ page }) => {
    // ⚠ BAŞLIKLI AİLE ŞART: grup varyantı yalnız başlık bağlamı olan satırda
    // kaydedilir. Boru satırları (2-11) kendi kendine yeterli — orada grup
    // ataması HİÇ yok ve yarım düzeltme (rozet silinir, kip 'auto' kalır) o
    // satırlarda YAŞIYORDU (ölçüldü). Satır 12 = başlık "Yükselen Milli Vana",
    // 13 = DN 100, 14 = DN 150.
    // ⚠ `?oto=acik` ŞART: grup ataması yalnız oto-varyant anahtarı AÇIKKEN
    // koşar ve marka hücresi anahtarı yalnız İLK değerinden görür (columnDefs
    // memo'su onu bağımlılık olarak taşımaz). Üretim sayfası sabit `false`
    // geçirir — bu test ExcelGrid SÖZLEŞMESİNİ (varsayılan `true`) ölçer.
    //
    // MEKANİZMA (ölçüldü): aday seçimi `/matching/remember` isteğini BEKLER,
    // grup atamasını ONDAN SONRA yapar. İstek tutulup doğru anda bırakılınca
    // atama, satır 14 elle fiyatlanıp menüsü yeniden açıldıktan SONRA koşar.
    // Atama yalnız FİYATSIZ ve MANUEL OLMAYAN satırlara gider; menü yeniden
    // açılınca aday dalı fiyatı siler → satırı koruyan tek şey 'manual' kipi.
    // Yarım düzeltmede (yalnız rozet silinir) satır 14 sessizce 1500 + mavi oldu.
    let tutulan: (() => Promise<void>) | null = null;
    await page.route('**/matching/remember', (route) => {
      tutulan = () => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/dev/grid-test?oto=acik');
    await page.locator('[row-index="13"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByText('flanşlı', { exact: true }).click();
    await expect(page.locator('[row-index="13"] [col-id="_matBirim"]')).toHaveText(/1\.000/); // para bicimi: ₺1.000,00
    await expect.poll(() => tutulan !== null, { timeout: 10_000 }).toBe(true); // istek TUTULDU
    await surukle(page, 13, 14, '_marka');
    // FİKSTÜR KANITI: hedef GRUP VARYANTIYLA sorgulandı ve otomatik (mavi) doldu.
    await expect(page.locator('[row-index="14"] [col-id="_matBirim"]')).toHaveText(/1\.500/);
    expect(await sonSorgu(page, 14)).toContain('varyant=[v:flansli]');
    await expect(page.locator('[row-index="14"] [col-id="_matBirim"]')).toHaveCSS('background-color', MAVI);

    await elleYaz(page, 14, '1600', /1\.600/);
    await page.locator('[row-index="14"] [col-id="_marka"] button').click();
    // "AYVAZ" satırlarda seçili etiket olarak da yazılı: menü SEÇENEĞİ ilk span
    // ve sınıfı yalnız "flex-1" (CustomDropdown: "ETIKET ILK SPAN").
    await page.locator('span[class="flex-1"]', { hasText: /^AYVAZ$/ }).click();
    await expect(page.getByText('yivli', { exact: true })).toBeVisible(); // seçim bekliyor
    const yayilimOnce = (await olaylar(page)).filter((o) => o.includes('YAYILIM')).length;

    // Satır 13'ün bekleyen grup ataması şimdi koşar.
    const yanit = page.waitForResponse('**/matching/remember');
    await tutulan!();
    await yanit;
    // Atama yalnız taklit sorgusu kadar sürer (gecikmesiz); 1 sn bol pay.
    await page.waitForTimeout(1_000);
    const yayilimSonra = (await olaylar(page)).filter((o) => o.includes('YAYILIM')).length;
    expect(yayilimSonra, 'grup ataması satır 14\'e yazdı').toBe(yayilimOnce);
    await expect(page.locator('[row-index="14"] [col-id="_matBirim"]')).not.toHaveText(/1\.500/);
    await expect(page.locator('[row-index="14"] [col-id="_matBirim"]')).not.toHaveCSS('background-color', MAVI);
  });
});
