/**
 * D11 (30.09, P2) — İŞÇİLİK YETKİSİ KAPALIYKEN İşç. Kâr TUTAMAĞI ÇALIŞIYORDU
 *
 * Yetki kapalıyken (Pro yok / askıda / sayfanın disiplini electrical ve firmada
 * electrical.labor yok) "İşç. Kâr %" kolonu SOLUK ve "Pro pakete dahildir"
 * ipuçlu çiziliyor, elle yazılamıyor (`editable = laborEnabled`). Ama kâr
 * hücresinin sarmalayıcısı `.fill-handle-cell` taşıdığı ve `FILLABLE_FIELDS`
 * yetkiyi okumadığı için SÜRÜKLE-DOLDUR çalışıyordu:
 *   1) hedeflere `setDataValue('_iscKar', 25)` — AG Grid `editable`a BAKMAZ;
 *   2) `handleCellValueChanged`in `_iscKar` dalı yetkiyle korunmadığı için
 *      işçilik birim/toplamını kâr uygulanmış fiyatla YENİDEN YAZIYOR (100 → 125);
 *   3) GENEL TOPLAM sessizce değişiyor ve teklif o hâliyle KAYDEDİLİYOR.
 * Gerçek senaryolar: Pro iken fiyatlanmış teklifte abonelik düşer/askıya alınır;
 * sayfa disiplini mechanical→electrical çevrilir.
 *
 * ⚠ BAYAT CLOSURE RİSKİ (düzeltmenin kendi riski): yetenekler `/auth/me` ile
 * ASENKRON gelir. `laborEnabled` bir bağımlılık dizisine yazılmazsa kapı ilk
 * değerde (false) takılı kalır ve Pro kullanıcının işçilik kârı SESSİZCE
 * çalışmaz. `?iscilik=gec` kipi tam bunu ölçer: yetki kapalı başlar, 300 ms
 * sonra açılır; sürükleme yine çalışmalı.
 *
 * Harness satırları: 15 = kaynak (%25), 16-17 = hedef (%0, işçilik birim 100).
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

/** Satırı ve kolonu görünür yapar: dikey (satır 15-17 alt kısımda) + yatay
 *  sanallaştırma (işçilik/toplam kolonları ilk çizimde DOM'da olmayabilir). */
async function goster(page: Page, row: number, colId: string) {
  const bul = () => page.locator(`[row-index="${row}"] [col-id="${colId}"]`);
  await page.locator('.ag-body-viewport').first().evaluate((el, r) => {
    const satir = el.querySelector(`[row-index="${r}"]`) as HTMLElement | null;
    if (satir) satir.scrollIntoView({ block: 'center' });
    else el.scrollTop = el.scrollHeight;
  }, row);
  for (let i = 0; i < 12 && (await bul().count()) === 0; i++) {
    await page.locator('.ag-center-cols-viewport').first().evaluate((el) => { el.scrollLeft += 250; });
  }
  await expect(bul()).toBeVisible({ timeout: 10_000 });
  return bul();
}

const genelToplam = (page: Page) => page.locator('.ag-floating-bottom [row-index="b-0"] [col-id="_toplam"]');

test.describe('D11 — işçilik yetkisi KAPALIYKEN İşç. Kâr sürüklenemez', () => {
  test('★ FİKSTÜR KANITI: yetki gerçekten kapalı, hedefte 100\'lük işçilik var', async ({ page }) => {
    await page.goto('/dev/grid-test?iscilik=kapali');
    // Yetki kapalıyken firma hücresi açılır liste ÇİZMEZ ("Pro gerekli" kilidi).
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(0);
    await expect(await goster(page, 16, '_labBirim')).toHaveText(/100/);
    await expect(await goster(page, 15, '_iscKar')).toHaveText(/25/);
  });

  test('★★ sürükleme hedeflere kâr YAZMAZ ve işçilik fiyatını EZMEZ', async ({ page }) => {
    await page.goto('/dev/grid-test?iscilik=kapali');
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(0);
    await goster(page, 15, '_iscKar');
    await surukle(page, 15, 17, '_iscKar');
    await page.waitForTimeout(400);
    await expect(await goster(page, 16, '_iscKar'), 'hedef kâr').not.toHaveText(/25/);
    // Kusurlu hâlde: 125 — kâr uygulanıp işçilik fiyatı yeniden yazılıyordu.
    await expect(await goster(page, 16, '_labBirim'), 'işçilik birim').toHaveText(/100/);
    await expect(await goster(page, 17, '_labBirim'), 'işçilik birim (2)').toHaveText(/100/);
  });

  test('★★ GENEL TOPLAM sessizce DEĞİŞMEZ', async ({ page }) => {
    await page.goto('/dev/grid-test?iscilik=kapali');
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(0);
    await goster(page, 16, '_toplam');
    const once = await genelToplam(page).innerText();
    await goster(page, 15, '_iscKar');
    await surukle(page, 15, 17, '_iscKar');
    await page.waitForTimeout(400);
    await goster(page, 16, '_toplam');
    expect(await genelToplam(page).innerText(), 'genel toplam').toBe(once);
  });

  test('★ kilitli kâr hücresinde tutamak SARMALAYICISI yok (yanıltıcı görsel ipucu)', async ({ page }) => {
    await page.goto('/dev/grid-test?iscilik=kapali');
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(0);
    const h = await goster(page, 15, '_iscKar');
    await expect(h.locator('.fill-handle-cell')).toHaveCount(0);
  });
});

test.describe('D11 KONTROL — yetki açıkken (ve GEÇ açılınca) sürükleme ÇALIŞIR', () => {
  test('★ yetki baştan açık: hedefe %25 yazılır, işçilik 125 olur', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await goster(page, 15, '_iscKar');
    await surukle(page, 15, 17, '_iscKar');
    await expect(await goster(page, 16, '_iscKar')).toHaveText(/25/);
    await expect(await goster(page, 16, '_labBirim')).toHaveText(/125/);
  });

  test('★★ BAYAT CLOSURE YOK: yetki GEÇ açılınca sürükleme yine çalışır', async ({ page }) => {
    // Yetenekler /auth/me ile asenkron gelir; kapı ilk değerde (false)
    // takılı kalsaydı Pro kullanıcının işçilik kârı sessizce çalışmazdı.
    await page.goto('/dev/grid-test?iscilik=gec');
    // Yetki açıldı mı? Firma hücresi açılır listeye döner.
    await expect(page.locator('[row-index="2"] [col-id="_firma"] button')).toHaveCount(1, { timeout: 5_000 });
    await goster(page, 15, '_iscKar');
    await surukle(page, 15, 17, '_iscKar');
    await expect(await goster(page, 16, '_iscKar')).toHaveText(/25/);
    await expect(await goster(page, 16, '_labBirim')).toHaveText(/125/);
  });
});
