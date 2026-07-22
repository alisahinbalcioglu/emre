import { test, expect, Page } from '@playwright/test';

/**
 * K9 (K-B) + K15-K19 e2e — /dev/grid-test mock harness'i (auth/API yok).
 * Fiyatlar mock'tan: 6''→600(10255)/555(10217) · 4''→400 · 3''→300 ·
 * 2''→markada yok · 1''→2 aday · 3/4''→75 · 5''→500 · 8''→800 ·
 * HATALI→sorgu firlatir (D14 ag hatasi).
 * D9-D15 testleri: GOREV_Derin_Denetim (22.07) Adim 2 kanitlari.
 */

/** Kaynak satirin verilen sutununun (_marka/_firma) ALT KENARINDAN hedef satira surukler. */
async function surukle(page: Page, kaynakRow: number, hedefRow: number, colId: string = '_marka') {
  const kaynak = await page.locator(`[row-index="${kaynakRow}"] [col-id="${colId}"]`).boundingBox();
  const hedef = await page.locator(`[row-index="${hedefRow}"] [col-id="${colId}"]`).boundingBox();
  if (!kaynak || !hedef) throw new Error('hucre koordinati alinamadi');
  const x = kaynak.x + kaynak.width / 2;
  const yBas = kaynak.y + kaynak.height - 3;
  const yBit = hedef.y + hedef.height / 2;
  await page.mouse.move(x, yBas);
  await page.mouse.down();
  const adim = Math.max(6, (hedefRow - kaynakRow) * 2);
  for (let i = 1; i <= adim; i++) {
    await page.mouse.move(x, yBas + ((yBit - yBas) * i) / adim);
  }
  await page.mouse.up();
}

/** Kaynak satirda AYVAZ + "Su ve Yangın" grubunu secer (fiyat 600 yazilir). */
async function kaynakSec(page: Page) {
  await page.locator('[row-index="2"] [col-id="_marka"] button').click();
  await page.getByText('AYVAZ', { exact: true }).click();
  await page.getByRole('button', { name: /Su ve Yangın/ }).click();
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
}

test.describe('ExcelGrid — popup baglama + surukle-doldur', () => {
  test('K9/K-B: popup ogesi URUN NESNESIYLE bagli — tiklanan grubun fiyati yazilir', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    // Iki grup secenegi acilir; IKINCIYE tiklaniyor. Liste-index baglamasi
    // olsaydi ILK grubun 600'u yazilirdi — nesne baglamasi 555 yazar.
    await page.getByRole('button', { name: /Basınçlı Borular/ }).click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/555/);
  });

  test('K15-K17 + K19: surukle-doldur kendi cap fiyatlari + tek adim Ctrl+Z', async ({ page }) => {
    await page.goto('/dev/grid-test');

    // Kaynak satir: 6'' → "Su ve Yangın" grubu (600) secilir; anahtar KAPALI
    await page.locator('[row-index="2"] [col-id="_marka"] button').click();
    await page.getByText('AYVAZ', { exact: true }).click();
    await page.getByRole('button', { name: /Su ve Yangın/ }).click();
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
    await expect(page.getByTestId('switch-state')).toContainText('KAPALI'); // K13 taban

    // SURUKLE: kaynak hucrenin ALT KENARINDAN 3/4'' satirina
    const kaynak = await page.locator('[row-index="2"] [col-id="_marka"]').boundingBox();
    const hedef = await page.locator('[row-index="7"] [col-id="_marka"]').boundingBox();
    if (!kaynak || !hedef) throw new Error('hucre koordinati alinamadi');
    const x = kaynak.x + kaynak.width / 2;
    const yBas = kaynak.y + kaynak.height - 3;
    const yBit = hedef.y + hedef.height / 2;
    await page.mouse.move(x, yBas);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(x, yBas + ((yBit - yBas) * i) / 6);
    }
    // Canli onizleme: sayac rozeti gorunur (§4.6)
    await expect(page.locator('.fill-handle-count-badge')).toContainText('satır');
    await page.mouse.up();

    await expect(page.getByTestId('switch-state')).toContainText('AÇIK'); // K15: anahtar oto-ACILDI
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/); // K17: KENDI fiyati
    await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/300/);
    await expect(page.locator('[row-index="7"] [col-id="_matBirim"]')).toHaveText(/75/);
    await expect(page.locator('[row-index="5"] [col-id="_matBirim"]')).toHaveText(/^\s*$/); // K16: yok → fiyatsiz
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).toHaveText(/^\s*$/); // >1 urun → secim bekliyor

    // K19: Ctrl+Z — TUM surukleme tek adimda geri (fiyatlar + anahtar)
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('switch-state')).toContainText('KAPALI');
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="7"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/); // kaynak KORUNUR
  });

  // ── D9 (K15/K17): 8 SATIR surukleme — her satir KENDI cap fiyati ──
  test('D9: 8 satirlik surukleme — satir satir kendi fiyati, kaynak kopyasi YOK', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await kaynakSec(page); // 6'' → 600
    await surukle(page, 2, 9); // hedefler: 4'',3'',2'',1'',3/4'',5'',8'' (7 satir) + kaynak = 8

    await expect(page.getByTestId('switch-state')).toContainText('AÇIK'); // K15
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
    await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/300/);
    await expect(page.locator('[row-index="5"] [col-id="_matBirim"]')).toHaveText(/^\s*$/); // 2'' yok (K16)
    await expect(page.locator('[row-index="6"] [col-id="_matBirim"]')).toHaveText(/^\s*$/); // 1'' secim
    await expect(page.locator('[row-index="7"] [col-id="_matBirim"]')).toHaveText(/75/);
    await expect(page.locator('[row-index="8"] [col-id="_matBirim"]')).toHaveText(/500/);
    await expect(page.locator('[row-index="9"] [col-id="_matBirim"]')).toHaveText(/800/);
    // K17 kaniti: hedeflerin HICBIRI kaynak 600'u tasimiyor (kopya yok) —
    // 400/300/75/500/800 hepsi kendi capinin mock fiyati.
    const olay: string[] = await page.evaluate(() => (window as any).__olay ?? []);
    console.log('[D9 KANIT] satir satir sorgu dokumu:\n  ' + olay.join('\n  '));
    await page.screenshot({ path: 'e2e-artifacts/d9-8satir.png', fullPage: true });
  });

  // ── D11 (K13): anahtar KAPALI — tek secim baska satira YAZMAZ ──
  test('D11: anahtar KAPALI iken tek secim yalniz kendi satirini doldurur', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await kaynakSec(page); // row2 = 600, anahtar hala KAPALI
    await expect(page.getByTestId('switch-state')).toContainText('KAPALI');
    for (const r of [3, 4, 5, 6, 7, 8, 9]) {
      await expect(page.locator(`[row-index="${r}"] [col-id="_matBirim"]`)).toHaveText(/^\s*$/);
    }
    await page.screenshot({ path: 'e2e-artifacts/d11-tek-satir.png', fullPage: true });
  });

  // ── D13: surukleme MANUEL satirin uzerinden gecer — uzerine yazar, geri alinabilir ──
  test('D13: manuel fiyatli satiri surukleme ezer, Ctrl+Z eski degeri getirir', async ({ page }) => {
    await page.goto('/dev/grid-test');
    // Once satir 3'e (4'') ELLE fiyat gir
    const hucre = page.locator('[row-index="3"] [col-id="_matBirim"]');
    await hucre.dblclick();
    await page.keyboard.type('999');
    await page.keyboard.press('Enter');
    await expect(hucre).toHaveText(/999/);

    await kaynakSec(page);
    await surukle(page, 2, 3);
    await expect(hucre).toHaveText(/400/); // acik niyet: manuel deger EZILDI (kendi cap fiyatiyla)

    await page.keyboard.press('Control+z');
    await expect(hucre).toHaveText(/999/); // geri alinabilir: eski manuel deger dondu
  });

  // ── D14: sorgu AG HATASI firlatirsa — yarim atama kalmaz, tamami geri alinabilir ──
  test('D14: ag hatasi alan satir fiyatsiz kalir, Ctrl+Z tum kapsami geri alir', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await kaynakSec(page);
    await surukle(page, 2, 10); // kapsam HATALI satiri (row 10) da icerir

    // Hata ONCESI satirlar normal islendi (dongu try/catch per-satir, kirilmadi)
    await expect(page.locator('[row-index="8"] [col-id="_matBirim"]')).toHaveText(/500/);
    await expect(page.locator('[row-index="9"] [col-id="_matBirim"]')).toHaveText(/800/);
    // HATALI satir: fiyat YOK (yarim fiyat yazilmadi)
    await expect(page.locator('[row-index="10"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    const olay: string[] = await page.evaluate(() => (window as any).__olay ?? []);
    expect(olay.some((o) => o.includes('AG HATASI'))).toBeTruthy();

    // Geri alinabilirlik: Ctrl+Z TUM kapsami (hata satiri dahil) eski haline getirir
    await page.keyboard.press('Control+z');
    await expect(page.locator('[row-index="8"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="9"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="10"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.getByTestId('switch-state')).toContainText('KAPALI');
  });

  // ── D15: hizli ardisik iki surukleme — son durum tutarli, cift yazim yok ──
  test('D15: ardisik iki surukleme tutarli, iki Ctrl+Z tam geri', async ({ page }) => {
    await page.goto('/dev/grid-test');
    await kaynakSec(page);
    await surukle(page, 2, 3); // op1: row3 = 400
    await surukle(page, 3, 4); // op2 HEMEN: kaynak row3 → row4 = 300 (kendi capi)
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
    await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/300/); // 400 kopyalanmadi
    await page.keyboard.press('Control+z'); // op2 geri
    await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
    await page.keyboard.press('Control+z'); // op1 geri
    await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  });

  // ── DL: ISCILIK firma fill + K19 FIRMA UNDO PARITESI (denetim fix 22.07) ──
  // Firma sureklemesi malzeme _marka dalinin ikizi ama undo ATLANMISTI —
  // Ctrl+Z firma fiyatlarini geri ALMIYORDU. Bu test hem fill'i (satir satir
  // kendi cap iscilik fiyati, kaynak kopyasi yok) hem YENI undo'yu dogrular.
  test('DL: firma surukle kendi cap iscilik fiyati + Ctrl+Z firma parite', async ({ page }) => {
    await page.goto('/dev/grid-test');
    // Kaynak satir 2 (6''): firma sec → tek eslesme, iscilik 60 yazilir
    await page.locator('[row-index="2"] [col-id="_firma"] button').click();
    await page.getByText('YASİN USTA', { exact: true }).click();
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/60/);

    // SURUKLE _firma: 2 → 9 (hedefler 4'',3'',2'',1'',3/4'',5'',8'')
    await surukle(page, 2, 9, '_firma');
    await expect(page.locator('[row-index="3"] [col-id="_labBirim"]')).toHaveText(/40/); // 4''
    await expect(page.locator('[row-index="4"] [col-id="_labBirim"]')).toHaveText(/30/); // 3''
    await expect(page.locator('[row-index="7"] [col-id="_labBirim"]')).toHaveText(/7/);  // 3/4''
    await expect(page.locator('[row-index="8"] [col-id="_labBirim"]')).toHaveText(/50/); // 5''
    await expect(page.locator('[row-index="9"] [col-id="_labBirim"]')).toHaveText(/80/); // 8''
    await expect(page.locator('[row-index="5"] [col-id="_labBirim"]')).toHaveText(/^\s*$/); // 2'' firmada yok
    await expect(page.locator('[row-index="6"] [col-id="_labBirim"]')).toHaveText(/^\s*$/); // 1'' secim bekliyor
    // K17 paritesi: kaynak 60 HICBIR hedefe kopyalanmadi (40/30/7/50/80 = kendi cap)

    // K19 PARITE FIX: Ctrl+Z firma sureklemesini de BUTUN olarak geri alir
    await page.keyboard.press('Control+z');
    await expect(page.locator('[row-index="3"] [col-id="_labBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="8"] [col-id="_labBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="9"] [col-id="_labBirim"]')).toHaveText(/^\s*$/);
    await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/60/); // kaynak KORUNUR
  });
});
