/**
 * D3 (30.09, P1) — İŞÇİLİK SÜRÜKLE-DOLDUR BAŞLIK BAĞLAMI KURMUYOR
 *
 * Eşleştirme sorgusu "grup başlığı + satırın kendi adı" olmalı: yetim bir satır
 * ("DN 100") tek başına hangi aileye ait olduğunu söylemez. Üç çağrı yerinden
 * İKİSİ bağlam kuruyor, biri kurmuyordu:
 *   ExcelGrid.tsx MALZEME fill  → buildMaterialContextDetailed  ✓
 *   ExcelGrid.tsx ELLE işçilik  → buildMaterialContext          ✓
 *   ExcelGrid.tsx İŞÇİLİK fill  → lookupNameOf (düz ad)         ✗
 *
 * Sonuç: kullanıcı aynı satıra işçilik firmasını ELLE seçerse eşleşiyor,
 * SÜRÜKLEYİP doldurursa aynı satır başlıksız sorgulanıyor. İyi hâlde satır
 * "bu firmada yok" kalır (görünür); kötü hâlde motor yanlış aileden tek aday
 * bulup fiyatı SESSİZCE yazar — malzeme tarafında bu sınıfın canlı bir vakası
 * kayıtlı (ExcelGrid.tsx:674-679, Çayırova'ya PP vana fiyatı).
 *
 * `fill-down.ts` sözleşmesi bunu zaten yazılı kılıyor:
 *   "sorguMetni?: ... Baglam kurucu: hedef satirin sorgu metni (grup basligi
 *    mirasi dahil)."
 * İşçilik çağrı yeri bu sözleşmeyi karşılamıyordu.
 *
 * ⚠ ÖLÇÜM ÖNKOŞULU: harness'in ilk 12 satırının adı "Boru" içeriyor ve
 * `isSelfSufficientRow` (TYPE_WORD_RE) onları kendi kendine yeterli sayıp
 * başlık mirasını HİÇ eklemiyor — yani bu kusur eski harness'te ÜRETİLEMİYORDU.
 * Bu yüzden sona yetim bir aile eklendi: başlık "Yükselen Milli Vana" +
 * "DN 100" / "DN 150". Sorgu metni harness mock'unun logundan (window.__olay)
 * okunur: ölçülen şey motora GİDEN istektir, kaynak kodu değil.
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

const olaylar = (page: Page) => page.evaluate(() => window.__olay ?? []);

/** Mock'un logladığı sorgu metni: `#N ISC sorgu: satir=<i> "<ad>" varyant=[...]`. */
const iscSorgusu = (kayit: string[], rowIdx: number) =>
  kayit.find((o) => o.includes(`ISC sorgu: satir=${rowIdx}`));
const malzSorgusu = (kayit: string[], rowIdx: number) =>
  kayit.find((o) => o.includes(`sorgu: satir=${rowIdx}`) && !o.includes('ISC'));

async function ac(page: Page) {
  await page.goto('/dev/grid-test');
  await expect(page.locator('[row-index="13"] [col-id="col1"]')).toHaveText(/DN 100/);
}

test.describe('D3 — işçilik sürükle-doldur başlık bağlamı', () => {
  test('★ FİKSTÜR KANITI: yetim satır GERÇEKTEN yetim (adı tip sözcüğü taşımıyor)', async ({ page }) => {
    // Bu olmadan aşağıdaki testler "başlık eklendi" diye yanlış sebepten
    // geçebilir: adı "Boru" içeren satırda başlık HİÇ eklenmez, yani
    // "başlık var mı?" sorusu ölçülemez.
    await ac(page);
    await expect(page.locator('[row-index="13"] [col-id="col1"]')).toHaveText('DN 100');
    await expect(page.locator('[row-index="12"] [col-id="col1"]')).toHaveText(/Yükselen Milli Vana/);
  });

  test('★ ELLE işçilik seçimi başlığı sorguya KOYAR (karşılaştırma tabanı)', async ({ page }) => {
    await ac(page);
    await page.locator('[row-index="13"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    const sorgu = iscSorgusu(await olaylar(page), 13);
    expect(sorgu, 'işçilik sorgusu loglanmadı').toBeTruthy();
    expect(sorgu).toContain('Yükselen Milli Vana');
  });

  test('★★ SÜRÜKLE-DOLDUR da başlığı sorguya koyar (kusurlu hâlde düz ad gidiyordu)', async ({ page }) => {
    await ac(page);
    await page.locator('[row-index="13"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="13"] [col-id="_firma"]')).toHaveText(/YASİN/);

    await surukle(page, 13, 14, '_firma');
    const sorgu = iscSorgusu(await olaylar(page), 14);
    expect(sorgu, 'hedef satır için işçilik sorgusu gitmedi').toBeTruthy();
    // Kusurlu hâlde: `"DN 150"` — başlık YOK.
    expect(sorgu).toContain('Yükselen Milli Vana');
  });

  test('★ İKİZ KONTROLÜ: malzeme ELLE seçimi de başlığı koyuyor (bozulmadı)', async ({ page }) => {
    // ⚠ Malzeme SÜRÜKLE-DOLDUR yolu bu harness geometrisinde ölçülemedi:
    // satır 14 tablonun en altında ve `_marka` kolonunda 13→14 sürüklemesi
    // tutamağı hiç tetiklemiyor (ölçüldü: ikinci sorgu HİÇ gitmiyor; aynı
    // gesture `_firma` kolonunda çalışıyor). Uydurma assert yazmak yerine
    // ölçülebileni ölçüyoruz: malzemenin ELLE yolu.
    // Malzeme FILL yolunun bağlam kurduğu ayrıca iki yerde kilitli:
    //   (1) bu commit'in diff'i o satıra DOKUNMUYOR (zaten
    //       buildMaterialContextDetailed kullanıyordu),
    //       (2) grid.spec K-testleri her hedef satıra KENDİ çapının fiyatının
    //       düştüğünü ölçüyor — yanlış sorguyla bu olamaz.
    await ac(page);
    await page.locator('[row-index="13"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    const sorgu = malzSorgusu(await olaylar(page), 13);
    expect(sorgu, 'malzeme sorgusu gitmedi').toBeTruthy();
    expect(sorgu).toContain('Yükselen Milli Vana');
  });

  test('★ KONTROL GRUBU: kendi kendine yeterli satırda başlık EKLENMEZ', async ({ page }) => {
    // C3 kısa devresi: adı tip sözcüğü taşıyan satır başlık mirasına ihtiyaç
    // duymaz. Düzeltme bu davranışı değiştirmemeli, yoksa sorgular şişer.
    await ac(page);
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/60/);
    await surukle(page, 2, 3, '_firma');
    const sorgu = iscSorgusu(await olaylar(page), 3);
    expect(sorgu).toBeTruthy();
    expect(sorgu).toContain("4''");
    expect(sorgu).not.toContain('Yükselen Milli Vana');
  });
});
