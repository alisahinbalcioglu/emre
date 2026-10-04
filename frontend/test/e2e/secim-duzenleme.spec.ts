import { test, expect, Page } from '@playwright/test';

/**
 * KP2 — HUCRE SECIMI VE DUZENLEME (29.08.2026 kullanici istegi)
 *
 * Kullanicinin iki cumlesi:
 *   (1) "300 tl girdik, hemen alt satira yon tuslari ile gecmek istiyorum
 *        ancak olmuyor; hucreden ciktigimda calisiyor."
 *   (2) "kullanici fazla hucre secmek isteyebilir. suan tek tek secilip
 *        kopyala yapistir yapilabiliyor. exceldeki gibi coklu secilip coklu
 *        yapistirma yapilabilmeli."
 *
 * ⚠ NEDEN AYRI DOSYA: kopyalama zincirinin kilitleriyle birlikte 29 test tek
 * kosumda ~29 tarayici baglami aciyordu ve Next DEV sunucusu son testlerde
 * takilip sayfayi bos servis ediyordu (olculdu: ayni testler kucuk gruplarda
 * gecerken tam pakette her kosumda BASKA bir test kirmiziya donuyordu — urun
 * kusuru degil, olcum ortaminin siniri). Bolme, her dosyanin yukunu yariya
 * indirir. Uretim sunucusuyla kosulamaz: harness `NODE_ENV=production`
 * altinda kendini kapatir.
 */

// Gercek pano gerekiyor: Chromium'da okuma/yazma izni acikca verilir.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const NET = '_draftNetPrice';

/** Secim tulu cizilmis hucre sayisi.
 *  ⚠ SINIF DEGIL GORSEL olculur: tul artik AG Grid hucre sinifiyla degil,
 *  ExcelGrid'in urettigi bir CSS kuraliyla ciziliyor (satir/kolon
 *  ozniteliklerini hedefler). Sinif yolu KARARSIZDI — grid kendi yeniden
 *  ciziminde sinifi dusuruyordu; CSS kurali satir yeniden yaratilsa bile
 *  uygulanir. Test de kullanicinin GORDUGU seyi olcer, ic isaretlemeyi degil. */
async function tulSayisi(page: Page): Promise<number> {
  return page.evaluate(() => Array.from(document.querySelectorAll('.ag-cell'))
    .filter((e) => getComputedStyle(e).outlineColor === 'rgb(37, 99, 235)'
      && getComputedStyle(e).outlineStyle === 'solid').length);
}

async function moduAyarla(page: Page, hedef: 'quote' | 'library') {
  const durum = page.getByTestId('mod-state');
  if ((await durum.textContent())?.trim() !== hedef) {
    await page.getByTestId('mod-toggle').click();
  }
  await expect(durum).toHaveText(hedef);
}

/** Kutuphane modunda Net Fiyat hucresine tiklar.
 *  ⚠ ONCE HUCRENIN DOLMASINI BEKLER: mod degisimi gridi REMOUNT eder
 *  (`key={mod}`) ve secim durumu component ref'lerinde yasar. Remount bitmeden
 *  atilan tik eski ornege gider, yeni ornek anchor'siz dogar ve ilk Shift+Ok
 *  "secim buyumuyor" gibi gorunur — testin kendi yaris kosulu, urun kusuru
 *  DEGIL (ayni tuzak elle kullanimda yok: insan moda gectikten sonra tiklar). */
async function netFiyatinaTikla(page: Page, satir: number) {
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/, { timeout: 15_000 });
  await page.locator(`[row-index="${satir}"] [col-id="${NET}"]`).click();
  // ⚠ ODAGIN KURULMASINI BEKLE: Playwright'in click auto-wait'i DOM'u bekler,
  // AG Grid'in IC odak durumunu degil. Yuklu makinede (paralel is varken)
  // arada onlarca ms olabiliyor ve hemen ardindan gelen Shift+Ok anchor'siz
  // kaliyordu — testi kararsiz yapan sey buydu, urun degil.
  await expect(page.locator(`[row-index="${satir}"] [col-id="${NET}"]`)).toHaveClass(/ag-cell-focus/);
}

/** Kutuphane modunda Net Fiyat sutunundan `adet` satirlik blok kopyalar.
 *  Donen deger PANO SATIRLARIdir: Windows Chromium panoya yazarken satir
 *  sonunu CRLF'e cevirir (olculdu — uretilen metin '\n' idi, panodan
 *  '\r\n' geri geldi). Bu bir kusur DEGIL, hedeflenen davranis: Excel de
 *  CRLF bekler ve yapistirma tarafi `panoMatrisi` ile '\r'i zaten temizler.
 *  Test bu yuzden ham metni degil SATIRLARI olcer — platformun satir sonu
 *  tercihi kilitlenirse test yanlis sebeple kirmiziya donerdi. */
async function netFiyatSatirlariniKopyala(page: Page, adet: number): Promise<string[]> {
  await netFiyatinaTikla(page, 2);
  for (let i = 1; i < adet; i++) await page.keyboard.press('Shift+ArrowDown');
  // Secim GORUNUR olmali — kullanici ne kopyaladigini gormeden guvenemez.
  // TEK hucrede tul CIZILMEZ: orada AG Grid'in kendi odak cercevesi vardir,
  // ustune ikinci bir isaret koymak gurultu olurdu.
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(adet > 1 ? adet : 0);
  await page.keyboard.press('Control+c');
  // .first(): toast metni hem baslik hem sarmalayici dugumde gecer — cift
  // eslesme Playwright strict mode'da HATA verir (testin kendi tuzagi).
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const ham = await page.evaluate(() => navigator.clipboard.readText());
  return ham.split(/\r?\n/);
}

test.beforeEach(async ({ page }) => {
  // ⚠ YENIDEN DENEME ORTAM ICIN, URUN ICIN DEGIL: bu dosya tek koşumda ~29
  // tarayici baglami acar ve Next DEV sunucusu son testlerde takilip sayfayi
  // bos servis edebiliyor (olculdu: ayni test tek basina gecerken grupta
  // "hucre bos" diye kirmiziya donuyordu; sunucu 200 doner, grid cizilir ama
  // veri gelmez). Uretim sunucusuyla kosulamaz — harness `NODE_ENV=production`
  // altinda kendini kapatir. Yukleme adiminin yeniden denenmesi olcumu
  // kurtarir; ASIL davranis assert'leri tek denemeli kalir.
  const hucre = page.locator('[row-index="2"] [col-id="col1"]');
  for (let deneme = 1; deneme <= 3; deneme++) {
    await page.goto('/dev/grid-test');
    try {
      await expect(hucre).toHaveText(/6'' Siyah Boru/, { timeout: 10_000 });
      return;
    } catch (e) {
      if (deneme === 3) throw e;
      await page.waitForTimeout(500);
    }
  }
});

/** Fare ile hucreden hucreye surukler (Excel'in asil secim yolu). */
async function surukleSec(page: Page, colId: string, basSatir: number, bitSatir: number) {
  const bas = await page.locator(`[row-index="${basSatir}"] [col-id="${colId}"]`).boundingBox();
  const bit = await page.locator(`[row-index="${bitSatir}"] [col-id="${colId}"]`).boundingBox();
  if (!bas || !bit) throw new Error('hucre koordinati alinamadi');
  const x = bas.x + bas.width / 2;
  // ⚠ Hucrenin ORTASINDAN baslar: alt 10px surukle-doldur TUTAMAGININ bolgesi.
  await page.mouse.move(x, bas.y + bas.height / 2);
  await page.mouse.down();
  const adim = Math.max(4, Math.abs(bitSatir - basSatir) * 2);
  const yBas = bas.y + bas.height / 2;
  const yBit = bit.y + bit.height / 2;
  for (let i = 1; i <= adim; i++) await page.mouse.move(x, yBas + ((yBit - yBas) * i) / adim);
  await page.mouse.up();
}

/** Panoya library modundan tek bir Net Fiyat alir (₺600,00) ve quote'a gecer. */
async function tekFiyatiPanoyaAlVeTeklifeGec(page: Page) {
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/, { timeout: 15_000 });
  await page.locator(`[row-index="2"] [col-id="${NET}"]`).click();
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺600,00');
  await moduAyarla(page, 'quote');
}

// ⚠ KARANTINA (04.10, koordinator karari — kararsiz test kurali: adiyla).
// OLCUM (kapinin kendi komutu, `--repeat-each`): mevcut kodda 16'da 1, 8'de 1;
// D14 degisikligi OLMADAN (HEAD) da dustu — P3 duzeltmelerinden bagimsiz.
// Belirti: ↓ ile alt satira gectikten sonra yazilan degerin TAMAMI kayboluyor
// ("400" ya da "500" hucrede bos); eski "ilk karakter kaybi" sinifinin agir
// hali. Kok adres: ExcelGrid.tsx editor ↓/↑ gezinmesi (~2404: stopEditing →
// ensureIndexVisible → setFocusedCell + rAF ikinci odak). Kok duzeltme AYRI
// IS (sahibi Emre'nin kararinda). CI Playwright kosmuyor; karantina yalniz
// yerel e2e kapisinin anlamli kalmasi icin. Duzeltilince `test.fixme` → `test`.
test.fixme('KP17 ★ EDITORDE ↓ ile alt satira gecis — "300 ↓ 400 ↓ 500" ritmi', async ({ page }) => {
  // Kullanicinin cumlesi: "300 tl girdik, hemen alt satira yon tuslari ile
  // gecmek istiyorum ancak olmuyor; hucreden ciktigimda calisiyor."
  await moduAyarla(page, 'quote');
  const h2 = page.locator('[row-index="2"] [col-id="_matBirim"]');
  const h3 = page.locator('[row-index="3"] [col-id="_matBirim"]');
  const h4 = page.locator('[row-index="4"] [col-id="_matBirim"]');

  await h2.dblclick();
  await page.keyboard.type('300');
  await page.keyboard.press('ArrowDown');          // editor ACIKKEN
  // Deger KAYDEDILDI (editorden cikilmadan) ve odak bir alt VERI satirinda
  await expect(h2).toHaveText(/300/);
  await expect(h3).toHaveClass(/ag-cell-focus/);

  // Yeni hucrede editor acilmaz ama YAZMAYA baslayinca ilk karakter kaybolmaz
  await page.keyboard.type('400');
  await page.keyboard.press('ArrowDown');
  await expect(h3).toHaveText(/400/);
  await expect(h4).toHaveClass(/ag-cell-focus/);

  await page.keyboard.type('500');
  await page.keyboard.press('Enter');
  await expect(h4).toHaveText(/500/);

  // ★ Toplamlar zincirden gecti: 286×300 · 268×400 · 102×500
  await expect(page.locator('[row-index="2"] [col-id="_matToplam"]')).toHaveText(/85\.800/);
  await expect(page.locator('[row-index="3"] [col-id="_matToplam"]')).toHaveText(/107\.200/);
  await expect(page.locator('[row-index="4"] [col-id="_matToplam"]')).toHaveText(/51\.000/);
});

test('KP18 ★ EDITORDE ↑ yukari gider; ←/→ metin imlecinde KALIR', async ({ page }) => {
  await moduAyarla(page, 'quote');
  const h4 = page.locator('[row-index="4"] [col-id="_matBirim"]');

  await h4.dblclick();
  await page.keyboard.type('750');
  await page.keyboard.press('ArrowUp');
  await expect(h4).toHaveText(/750/);
  await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveClass(/ag-cell-focus/);

  // ← / → editorden CIKARMAZ: yazilani duzeltmek icin imlec metinde kalmali.
  const h2 = page.locator('[row-index="2"] [col-id="_matBirim"]');
  await h2.dblclick();
  await page.keyboard.type('120');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('9');                   // "1" ile "2" arasina
  await page.keyboard.press('Enter');
  await expect(h2).toHaveText(/1\.920/);           // 1920 — editorden CIKILMADI
});

test('KP19 ★ EDITORDE ok VERI OLMAYAN satira gecmez (grup bandi/baslik atlanir)', async ({ page }) => {
  // Harness'te satir 0 ve 1 baslik satiridir (`_isDataRow:false`); gercek
  // kutuphane/teklifte bunlar grup bandi ve bolum basliklaridir. Editorde ↑
  // basildiginda imlec oraya DUSMEMELI — o hucreler duzenlenemez, kullanici
  // yazmaya devam edemez ve girdigi deger havada kalirdi.
  await moduAyarla(page, 'quote');
  const h2 = page.locator('[row-index="2"] [col-id="_matBirim"]');
  await h2.dblclick();
  await page.keyboard.type('999');
  await page.keyboard.press('ArrowUp');            // ustte VERI satiri YOK

  // Odak baslik satirina KAYMADI
  await expect(page.locator('[row-index="1"] [col-id="_matBirim"]')).not.toHaveClass(/ag-cell-focus/);
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).not.toHaveClass(/ag-cell-focus/);
  // Yazilan deger de kaybolmadi
  await page.keyboard.press('Enter');
  await expect(h2).toHaveText(/999/);
});

test('KP20 ★ FAREYLE SURUKLEYEREK secim (Excel yolu) — tutamaga dokunmadan', async ({ page }) => {
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/, { timeout: 15_000 });

  await surukleSec(page, NET, 2, 4);
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(3);

  // Surukleme sonrasi gelen `click` secimi SILMEMELI (bayrak kapisi)
  await page.waitForTimeout(150);
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(3);

  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const ham = await page.evaluate(() => navigator.clipboard.readText());
  expect(ham.split(/\r?\n/)).toEqual(['₺600,00', '₺400,00', '₺300,00']);
});

test('KP21 ★ SECILI ARALIGA yapistirma — bir fiyat N satira dagilir', async ({ page }) => {
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/, { timeout: 15_000 });
  await page.locator(`[row-index="2"] [col-id="${NET}"]`).click();
  await page.keyboard.press('Control+c');                    // TEK hucre: ₺600,00
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();

  await moduAyarla(page, 'quote');
  await surukleSec(page, '_matBirim', 2, 5);                 // 4 satirlik hedef
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(4);
  await page.keyboard.press('Control+v');

  for (const r of [2, 3, 4, 5]) {
    await expect(page.locator(`[row-index="${r}"] [col-id="_matBirim"]`)).toHaveText(/600/);
  }
  // Zincir her satirda kosmus olmali: 286×600 · 268×600 · 102×600 · 564×600
  await expect(page.locator('[row-index="2"] [col-id="_matToplam"]')).toHaveText(/171\.600/);
  await expect(page.locator('[row-index="5"] [col-id="_matToplam"]')).toHaveText(/338\.400/);
});

test('KP22 ★ SURUKLE-DOLDUR TUTAMAGI bozulmadi (alt kenar hala doldurur)', async ({ page }) => {
  // KP20'nin bedeli olmamali: tutamak yalniz 4 kolonda ve yalniz alt 10px'te.
  // Iskonto kolonunun tutamagindan surukleyince DOLDURMA olmali, secim DEGIL.
  await moduAyarla(page, 'library');
  const isk = page.locator('[row-index="2"] [col-id="_draftDiscount"]');
  await isk.dblclick();
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/480/);   // 600×0,8

  const kutu = await isk.boundingBox();
  const hedef = await page.locator('[row-index="4"] [col-id="_draftDiscount"]').boundingBox();
  if (!kutu || !hedef) throw new Error('koordinat yok');
  const x = kutu.x + kutu.width / 2;
  await page.mouse.move(x, kutu.y + kutu.height - 3);        // ALT KENAR = tutamak
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x, (kutu.y + kutu.height - 3) + ((hedef.y + hedef.height / 2 - (kutu.y + kutu.height - 3)) * i) / 8);
  }
  await page.mouse.up();

  // Iskonto DOLDU (secim degil): net fiyatlar %20 dustu
  await expect(page.locator(`[row-index="3"] [col-id="${NET}"]`)).toHaveText(/320/);   // 400×0,8
  await expect(page.locator(`[row-index="4"] [col-id="${NET}"]`)).toHaveText(/240/);   // 300×0,8
});

test('KP23 ★ Suruklerken KENARA dayaninca liste akar (983 satirlik listede sart)', async ({ page }) => {
  // Grid yuksekligi 80vh; gorunumu kucultunce harness'in 11 satiri tasar ve
  // gercek bir kaydirma dogar. Kaydirma olmasaydi kullanici yalniz EKRANDA
  // GORDUGU kadarini secebilirdi — kutuphanede 983 satir var.
  await page.setViewportSize({ width: 1280, height: 400 });
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/, { timeout: 15_000 });

  const bas = await page.locator(`[row-index="2"] [col-id="${NET}"]`).boundingBox();
  const govde = await page.locator('.ag-body-viewport').boundingBox();
  if (!bas || !govde) throw new Error('koordinat yok');
  const x = bas.x + bas.width / 2;

  await page.mouse.move(x, bas.y + bas.height / 2);
  await page.mouse.down();
  // ⚠ KADEMELI hareket (steps): tek sicrayista giden fare ara hucrelerde
  // `cellMouseOver` uretmez ve secim hic kurulmaz — gercek kullanici da fareyi
  // kademeli suruklerler. Tek adimlik hareket testin kendi yapayligiydi.
  await page.mouse.move(x, govde.y + govde.height - 6, { steps: 12 });   // ALT KENAR
  await page.waitForTimeout(800);                          // zamanlayici aksin
  await page.mouse.up();

  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const satirlar = (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/);

  // Kenarda beklemek secimi BUYUTMUS olmali: ilk ekranda gorunenden fazlasi.
  // (Fare hic hareket etmedi — kaydirma yalniz zamanlayiciyla oldu.)
  expect(satirlar.length).toBeGreaterThan(5);
  expect(satirlar[0]).toBe('₺600,00');                     // anchor yerinde
});

test('KP24 ★★ YUKARI secime yapistirma SECIM DISINA YAZMAZ (sessiz para hatasi)', async ({ page }) => {
  // ⚠ Bu, cok ajanli incelemenin KRITIK bulgusu — gercek tarayicida olculmustu:
  // sayim secimden (normalize aralik), yazim ODAKTAN geliyordu. Yukari yonlu
  // secimde odak ALT uctadir; kullanicinin MAVI GORDUGU satirlar bos kalir,
  // hic secmedigi ALTTAKI satirlara fiyat yazilirdi (872 × 600 = 523.200 TL
  // uydurulmus tutar genel toplama giriyordu).
  await tekFiyatiPanoyaAlVeTeklifeGec(page);

  await surukleSec(page, '_matBirim', 5, 2);          // YUKARI yon: odak satir 5
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(4);
  await page.keyboard.press('Control+v');

  // Secilen satirlar DOLDU
  for (const r of [2, 3, 4, 5]) {
    await expect(page.locator(`[row-index="${r}"] [col-id="_matBirim"]`)).toHaveText(/600/);
  }
  // ★ Secim DISINDAKI satirlara DOKUNULMADI — asil kilit bu
  for (const r of [6, 7, 8]) {
    await expect(page.locator(`[row-index="${r}"] [col-id="_matBirim"]`)).toHaveText(/^\s*$/);
    await expect(page.locator(`[row-index="${r}"] [col-id="_matToplam"]`)).toHaveText(/^\s*$/);
  }
});

test('KP25 ★ Shift+TIK ile aralik secimi (fare kodunun bozmadigi kanit)', async ({ page }) => {
  // Regresyon: yeni `onCellMouseDown` anchor'i KOSULSUZ yaziyordu; tarayici
  // sirasi mousedown → click oldugu icin Shift+tikta anchor tiklanan hucreye
  // eziliyor ve aralik 1×1'e cokuyordu.
  await netFiyatinaTikla(page, 2);
  await page.locator(`[row-index="5"] [col-id="${NET}"]`).click({ modifiers: ['Shift'] });
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(4);

  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const satirlar = (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/);
  expect(satirlar).toEqual(['₺600,00', '₺400,00', '₺300,00', '']);   // satir 5 = 2'' (fiyatsiz)
});

test('KP26 ★ Shift+TIK ile secip yapistirma da secim DISINA yazmaz', async ({ page }) => {
  // Ayni kok, ucuncu yol: Shift+tikta da odak ALT uctadir.
  await tekFiyatiPanoyaAlVeTeklifeGec(page);
  await page.locator('[row-index="2"] [col-id="_matBirim"]').click();
  await page.locator('[row-index="4"] [col-id="_matBirim"]').click({ modifiers: ['Shift'] });
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(3);
  await page.keyboard.press('Control+v');

  for (const r of [2, 3, 4]) {
    await expect(page.locator(`[row-index="${r}"] [col-id="_matBirim"]`)).toHaveText(/600/);
  }
  await expect(page.locator('[row-index="5"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);
});

test('KP27 ★ COK KOLONLU secimde deger TUM secili kolonlara dagilir (tul yalan soylemez)', async ({ page }) => {
  // Tul N×2 boyanip yalniz N×1 yazilsaydi isaret, yazilan kumenin UST KUMESI
  // olurdu. Malz. Birim Fiyat + Malz. Toplam bitisik degil; Kar % ile Marka
  // arasi da dropdown. Bu yuzden IKI SAYISAL kolon secilir: Malz. ve Isc.
  // Birim Fiyat bitisik olmadigi icin burada Kar % + Marka yerine
  // _matBirim'den SAGA bir kolon (Malz. Toplam) secilir — o editable DEGIL,
  // yani ozette `atlananKolon` beklenir ve YAZILMAZ.
  // ⚠ OLCUM TUL DEGIL SONUC: tul sayisi yuklu makinede kararsiz olabiliyor
  // (ardisik iki Shift tusu + yeniden cizim yarisi). Burada olculmesi gereken
  // sey zaten dagitimin KOLON boyutunu tasiyip tasimadigi — bunun dogrudan
  // kaniti, ikinci kolonun "duzenlenemez" diye ozete girmesidir. Tulun kendisi
  // KP13/KP20'de olculuyor.
  // ⚠ MOD DEGISIMI YOK (29.09): pano onceden kutuphaneden aliniyordu ve test
  // quote→library→quote yapiyordu; iki REMOUNT yuklu makinede zaman asimina
  // ugruyor ve test %50 kararsiz kaliyordu. Bu testin konusu DAGITIM, panonun
  // KAYNAGI degil — deger quote modunda elle yazilip kopyalanir. (Kutuphane
  // kaynakli zincir KP3/KP4'te zaten olculuyor.)
  await moduAyarla(page, 'quote');
  const kaynak = page.locator('[row-index="2"] [col-id="_matBirim"]');
  await kaynak.dblclick();
  await page.keyboard.type('600');
  await page.keyboard.press('Enter');
  await expect(kaynak).toHaveText(/600/, { timeout: 15_000 });
  await kaynak.click();
  await expect(kaynak).toHaveClass(/ag-cell-focus/);
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');     // _matBirim + _matToplam
  await page.keyboard.press('Control+v');

  // Duzenlenebilir kolon doldu (satir boyutu tasindi)
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/600/);
  // ★ KOLON boyutu da tasindi: ikinci kolon (Malz. Toplam) hedeflendi ama
  //   HESAPLANAN oldugu icin YAZILMADI — ozet bunu bildirir. Kolon boyutu hic
  //   tasinmasaydi bu satir toast'ta HIC gorunmezdi.
  await expect(page.getByText(/düzenlenemeyen kolona denk geldi/).first()).toBeVisible();
  // Toplam FORMULDEN dogdu, el yazisiyla degil (286×600 · 268×600)
  await expect(page.locator('[row-index="2"] [col-id="_matToplam"]')).toHaveText(/171\.600/);
  await expect(page.locator('[row-index="3"] [col-id="_matToplam"]')).toHaveText(/160\.800/);
});

test('KP28 ★ KUTUPHANE IKIZI: secili araliga dagitim orada da calisir', async ({ page }) => {
  // Kullanicinin cumlesi "her iki taraftan da" idi; dagitim once yalniz teklif
  // dalina eklenmisti.
  //
  // ⚠ HARNESS SINIRI — NEDEN FIYAT KOLONU DEGIL: kutuphanenin blok yapistirma
  // yolu hedefleri `!field.startsWith('_')` ile suzer (sistem kolonlari
  // Iskonto/Net Fiyat hedef olmasin diye). Harness fiyat rolunu `_matBirim`e
  // bagli — quote testleriyle ayni veriyi paylastigi icin. GERCEK kutuphanede
  // bu kolon `col3`tur (olculdu: backend/src/ozellik/kutuphane/library/
  // library-sheet-builder.ts:59 `{ field: 'col3', headerName: 'Liste Fiyat',
  // editable: true }`), yani onek suzgecine TAKILMAZ. Burada dagitim
  // MEKANIZMASI oneksiz bir kolonda (Birim) olculur; kolon adi disinda yol
  // birebir aynidir.
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/, { timeout: 15_000 });
  await page.locator('[row-index="2"] [col-id="col3"]').click();     // Birim: "mt"
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('mt');

  await surukleSec(page, 'col3', 4, 6);                              // 3 satirlik hedef
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(3);
  await page.keyboard.press('Control+v');

  for (const r of [4, 5, 6]) {
    await expect(page.locator(`[row-index="${r}"] [col-id="col3"]`)).toHaveText('mt');
  }
});

test('KP29 ★ EDITORDE son veri satirinda ↓ — rakamlar AYNI hucrede birlesmez', async ({ page }) => {
  // Sinirda editor acik birakilsaydi kullanici ↓ basip yazmaya devam edince
  // yeni rakamlar eski degerin ucuna eklenirdi (300 ↓ 400 → "300400").
  await moduAyarla(page, 'quote');
  // ── SON VERI SATIRI KIMLIKLE BULUNUR (30.09) ──────────────────────────
  // Bu test "altta gidilecek satir YOK" halini olcer. Eskiden indeks SABIT
  // yazilmisti (`row-index="11"`); harness'e satir eklendigi gun test sessizce
  // ORTADAKI bir satiri olcmeye baslar, altinda satir OLDUGU icin ↓ normal
  // calisir ve assert gecer — yani kapi KIRMIZI YANMADAN curur. (Satir 29.09'da
  // zaten bir kez eklendi: "KURSUZ 10'' Boru".)
  //
  // Simdi: en buyuk row-index DOM'dan okunur + FIKSTUR KANITI olarak o satirin
  // gercekten harness'in son satiri oldugu dogrulanir. Harness buyurse once
  // kimlik assert'i kirmizi yanar, sessiz kayma olmaz.
  //
  // ⚠ BU KAPI ZATEN BIR KEZ IS GORDU (30.09): D3 icin harness'e uc satir
  // eklendi (baslik + "DN 100" + "DN 150") ve bu assert KIRMIZI yandi —
  // "Expected /KURSUZ/, Received 'DN 150'". Eski sabit-indeks hali ayni
  // degisiklikte SESSIZCE ortadaki bir satiri olcmeye baslayacakti.
  const sonIndeks = await page.evaluate(() => Math.max(
    ...Array.from(document.querySelectorAll('.ag-row[row-index]'))
      .map((r) => Number(r.getAttribute('row-index')))
      .filter((n) => Number.isFinite(n)),
  ));
  await expect(
    page.locator(`[row-index="${sonIndeks}"] [col-id="col1"]`),
    'FIKSTUR KANITI: olculen satir harness\'in SON veri satiri olmali',
  ).toHaveText(/KAR HEDEF B Boru/);
  const son = page.locator(`[row-index="${sonIndeks}"] [col-id="_matBirim"]`);
  await son.dblclick();
  await page.keyboard.type('300');
  await page.keyboard.press('ArrowDown');            // altta VERI satiri yok
  await page.keyboard.type('400');
  await page.keyboard.press('Enter');
  await expect(son).toHaveText(/400/);
  await expect(son).not.toHaveText(/300400/);
});

test('KP7 ★ Shift+Ok ODAGI TASIMAZ — anchor sabit kalir (Excel davranisi)', async ({ page }) => {
  // Regresyon kilidi: keydown bubble fazinda dinlenirse AG Grid'in kendi ok
  // navigasyonu ONCE kosar ve odak secimle birlikte kayar. O halde Shift+Ok
  // sonrasi Ctrl+V hedefi kullanicinin BASLADIGI hucre olmaktan cikar.
  await netFiyatinaTikla(page, 2);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  const odak = await page.evaluate(() => {
    const e = document.querySelector('.ag-cell-focus');
    return e ? { satir: e.closest('[row-index]')?.getAttribute('row-index'), kolon: e.getAttribute('col-id') } : null;
  });
  expect(odak).toEqual({ satir: '2', kolon: NET });
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(3);
});

// ════════════════════════════════════════════════════════════════════════════
// KP2 × FITTING — CAKISMA KURALLARI (29.09.2026, KP2'nin guncel master'a
// uyarlanmasi sirasinda kondu ve TARAYICIDA gozle dogrulandi)
//
// Fitting kapsam kipi 02.09'da geldi: kullanici fitting satirinin kapsamini
// Ctrl+tik ile secer (CLAUDE.md "Fitting Satiri"). KP2 ise fareyle SURUKLEYEREK
// kopya secimi getiriyor. Ikisi ayni fare olaylarini dinledigi icin kural
// ACIKCA yazilmali, yoksa iki tul (mavi kopya / sari kapsam) yarisir ve
// kullanicinin "ne secili?" sorusu belirsizlesir.
//
// ⚠ Harness bu turda `enableStructureEdit` ile GERCEK teklif gridine hizalandi
// (`quotes/new` onu veriyor); fitting kipi `fittingDuzenlenebilir =
// enableStructureEdit` oldugu icin oncesinde harness'te HIC acilamiyordu —
// yani bu cakisma sinifi olculemiyordu.
// ════════════════════════════════════════════════════════════════════════════

/** Satir 10'un birim hucresine "%" yazarak fitting kapsam kipini acar. */
async function fittingKipiniAc(page: Page) {
  await moduAyarla(page, 'quote');
  const birim = page.locator('[row-index="10"] [col-id="col3"]');
  await birim.dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('%');
  await page.keyboard.press('Enter');
  // Kip acildi: ad hucresinde "Σ satır seç" rozeti ve ustte kapsam seridi
  await expect(page.getByText(/Fitting kapsamı/i).first()).toBeVisible({ timeout: 10_000 });
}

test('KP30 ★ FITTING kipi acikken fareyle SURUKLEME secim kurmaz', async ({ page }) => {
  // Kapsam secme kipinde kullanicinin tek isi satir isaretlemektir; surukleme
  // tulu `fittingTulu`nun uzerine biner. Kip `Tamam`/Esc ile kapaninca geri gelir.
  await fittingKipiniAc(page);
  await surukleSec(page, '_matBirim', 2, 5);
  await expect.poll(() => tulSayisi(page), { timeout: 5_000 }).toBe(0);
  // Kip DE bozulmadi
  await expect(page.getByText(/Fitting kapsamı/i).first()).toBeVisible();
});

test('KP31 ★ CTRL+TIK fitting kapsamina gider, kopya secimi KURMAZ', async ({ page }) => {
  // Ctrl/Meta basiliyken surukleme secimi HIC baslamaz — o tus fitting'e aittir.
  // Anchor kosulsuz kurulsaydi mousedown, Ctrl+tik'in kapsam degisiminden ONCE
  // kopya secimini sifirlar ve iki tul yarisirdi.
  await fittingKipiniAc(page);
  await page.locator('[row-index="2"] [col-id="col1"]').click({ modifiers: ['Control'] });

  // Kapsam SARI tulle isaretlendi (fitting kuralinin kendi rengi)
  await expect.poll(async () => page.evaluate(() =>
    Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('').includes('245,158,11'),
  ), { timeout: 5_000 }).toBe(true);
  // ...ve kopya secimi HIC kurulmadi
  expect(await tulSayisi(page)).toBe(0);
});

test('KP32 ★ Kip KAPANINCA fare secimi geri gelir (kural gecici)', async ({ page }) => {
  // Kural "surekli kapali" degil: kip bitince normal secim calismali.
  await fittingKipiniAc(page);
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Fitting kapsamı/i)).toHaveCount(0, { timeout: 10_000 });

  await surukleSec(page, '_matBirim', 2, 4);
  await expect.poll(() => tulSayisi(page), { timeout: 10_000 }).toBe(3);
});
