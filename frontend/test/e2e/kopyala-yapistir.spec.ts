import { test, expect, Page } from '@playwright/test';

/**
 * KP — KUTUPHANEDEN TEKLIFE FIYAT TASIMA (28.08.2026 kullanici istegi)
 *
 * Kullanicinin cumlesi: "kutuphane net fiyatindan aldigim bir fiyati kendi
 * fiyatlandirmak istedigim excele yapistirabilmeliyim... hem malzeme
 * tarafinda hem iscilik tarafi icin de gecerli."
 *
 * Zincir IKI halkadir ve ikisi de burada, GERCEK tarayicida, GERCEK pano
 * uzerinden olculur:
 *   1. KOPYALA — kutuphane gridinde Net Fiyat hucrelerini sec (Shift+Ok) ve
 *      Ctrl+C ile panoya al. Bu halka 28.08'e kadar HIC YOKTU: AG Grid'in
 *      clipboard ve hucre-araligi modulleri ENTERPRISE'dir, projede
 *      `AllCommunityModule` kayitli — yani kullanicinin ekranda gordugu
 *      ₺53,30'u alacak bir yol yoktu.
 *   2. YAPISTIR — teklif gridinde Malz./Isc. Birim Fiyat hucresine Ctrl+V.
 *
 * ⚠ NEDEN E2E: iki halka da AG Grid'in ODAK durumuna baglidir
 * (`api.getFocusedCell()`), jsdom'da ve gizli sekmede kurulmaz. Birim
 * testleri (kopyala.test.ts / yapistir.test.ts) yalniz PLANLAYICILARI olcer;
 * "tus gercekten bagli mi, pano gercekten yaziliyor mu" sorusunun tek
 * olculebilir yeri burasi.
 *
 * Harness: /dev/grid-test — "moda geç" dugmesi quote ↔ library gecisi yapar.
 * Library modunda liste fiyatlari doludur (6''→600 · 4''→400 · 3''→300),
 * iskonto %0 oldugu icin Net Fiyat = liste fiyati.
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
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/);
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
  await expect.poll(() => tulSayisi(page)).toBe(adet > 1 ? adet : 0);
  await page.keyboard.press('Control+c');
  // .first(): toast metni hem baslik hem sarmalayici dugumde gecer — cift
  // eslesme Playwright strict mode'da HATA verir (testin kendi tuzagi).
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const ham = await page.evaluate(() => navigator.clipboard.readText());
  return ham.split(/\r?\n/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/grid-test');
  await expect(page.locator('[row-index="2"] [col-id="col1"]')).toHaveText(/6'' Siyah Boru/);
});

test('KP1 ★ tek Net Fiyat hucresi panoya GORUNEN bicimiyle gider', async ({ page }) => {
  const satirlar = await netFiyatSatirlariniKopyala(page, 1);
  // Ham sayi degil ekrandaki metin: yapistiran taraf `insanSayi` ile cozer ve
  // ayni metin TR yerelli gercek Excel'e de para olarak yapisir.
  expect(satirlar).toEqual(['₺600,00']);
});

test('KP2 ★ Shift+Ok ile blok secimi — satirlar TSV olarak alt alta', async ({ page }) => {
  const satirlar = await netFiyatSatirlariniKopyala(page, 3);
  expect(satirlar).toEqual(['₺600,00', '₺400,00', '₺300,00']);
});

test('KP3 ★ ZINCIR: kutuphaneden kopyala → teklifte MALZEME birim fiyatina yapistir', async ({ page }) => {
  await netFiyatSatirlariniKopyala(page, 3);
  await moduAyarla(page, 'quote');

  // Teklif modunda fiyat kolonlari BOS baslar (harness quote verisi fiyatsiz)
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/^\s*$/);

  await page.locator('[row-index="2"] [col-id="_matBirim"]').click();
  await page.keyboard.press('Control+v');

  // ⚠ BIN KAT TUZAGI: "₺600,00" metni 600 olarak cozulmeli (0,6 veya 60000 degil)
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText(/600/);
  await expect(page.locator('[row-index="3"] [col-id="_matBirim"]')).toHaveText(/400/);
  await expect(page.locator('[row-index="4"] [col-id="_matBirim"]')).toHaveText(/300/);

  // Yapistirma ELLE GIRIS zincirinden gecmeli: toplam formulden dogmali.
  // 286 mt × 600 = 171.600 — sayi tam olarak olculur, "dolu mu" diye bakilmaz.
  await expect(page.locator('[row-index="2"] [col-id="_matToplam"]')).toHaveText(/171\.600/);
});

test('KP4 ★ ZINCIR: ayni pano ISCILIK birim fiyatina da yapisir (ikiz)', async ({ page }) => {
  await netFiyatSatirlariniKopyala(page, 3);
  await moduAyarla(page, 'quote');

  await page.locator('[row-index="2"] [col-id="_labBirim"]').click();
  await page.keyboard.press('Control+v');

  await expect(page.locator('[row-index="2"] [col-id="_labBirim"]')).toHaveText(/600/);
  await expect(page.locator('[row-index="3"] [col-id="_labBirim"]')).toHaveText(/400/);
  await expect(page.locator('[row-index="4"] [col-id="_labBirim"]')).toHaveText(/300/);
  await expect(page.locator('[row-index="2"] [col-id="_labToplam"]')).toHaveText(/171\.600/);
});

test('KP5 ★ MANUEL GIRIS yolu acik kalir (kullanici elle de yazabilmeli)', async ({ page }) => {
  await moduAyarla(page, 'quote');
  const hucre = page.locator('[row-index="3"] [col-id="_matBirim"]');
  await hucre.dblclick();
  await page.keyboard.type('1250');
  await page.keyboard.press('Enter');
  await expect(hucre).toHaveText(/1\.250/);
  // 268 mt × 1250 = 335.000 — elle girisin de toplami surdugu kaniti
  await expect(page.locator('[row-index="3"] [col-id="_matToplam"]')).toHaveText(/335\.000/);
});

test('KP6 ★ Shift\'siz gezinme secimi DUSURUR (Ctrl+C tek hucreye doner)', async ({ page }) => {
  await netFiyatinaTikla(page, 2);
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => tulSayisi(page)).toBe(2);

  await page.keyboard.press('ArrowDown');           // Shift'siz gezinme
  await expect.poll(() => tulSayisi(page)).toBe(0);

  await page.keyboard.press('Control+c');
  // Secim dustu → ODAKLI TEK hucre kopyalanir. Odak, Shift+Ok'ta ANCHOR'DA
  // KALDIGI icin (keydown capture fazinda yakalanir, AG Grid'in navigasyonu
  // calismaz) hala satir 2'dedir; Shift'siz ArrowDown onu satir 3'e tasidi.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺400,00');
});

test('KP8 ★ VERI OLMAYAN SATIR (grup bandi/baslik) panoda YER TUTMAZ', async ({ page }) => {
  // Gercek kutuphanede malzemeler Teknik Sinif bantlariyla ayrilir. Bant icin
  // bos TSV satiri uretilseydi, yapistirmada TUM degerler bir satir kayardi —
  // sessiz para hatasi. Harness'te satir 1 bir baslik satiridir (_isDataRow:false).
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/);
  await page.locator(`[row-index="1"] [col-id="${NET}"]`).click();   // BASLIK satiri
  await expect(page.locator(`[row-index="1"] [col-id="${NET}"]`)).toHaveClass(/ag-cell-focus/);
  await page.keyboard.press('Shift+ArrowDown');                       // 1..2
  await page.keyboard.press('Shift+ArrowDown');                       // 1..3
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const ham = await page.evaluate(() => navigator.clipboard.readText());
  // Uc satirlik aralik, IKI satirlik kopya: baslik atlandi, ARADA BOS SATIR YOK
  expect(ham.split(/\r?\n/)).toEqual(['₺600,00', '₺400,00']);
});

test('KP9 ★ COK KOLONLU secim (Shift+Sag) — kolonlar TAB ile ayrilir', async ({ page }) => {
  // Excel'e cok sutunlu blok yapistirabilmek icin TSV kolon ayiricisi sart.
  await netFiyatinaTikla(page, 2);
  await page.keyboard.press('Shift+ArrowLeft');    // Net Fiyat + Iskonto %
  await page.keyboard.press('Shift+ArrowDown');    // iki satir
  await expect.poll(() => tulSayisi(page)).toBe(4);
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  const ham = await page.evaluate(() => navigator.clipboard.readText());

  // ⚠ OLCULEN SINIRLAMA — Iskonto hucresi ekranda "%0" gorunur ama panoya
  // "0" gider. Sebep: o kolon degeri `cellRenderer` ile cizilir, `valueFormatter`
  // ile DEGIL; `getCellValue({useFormatter:true})` renderer'i calistiramaz
  // (renderer React dugumu doner, metin degil). Ayni durum teklif gridindeki
  // "Kar %" kolonlari icin de gecerlidir.
  //
  // BILEREK DUZELTILMEDI: yapistiran taraf `insanSayi` ile okur ve "%0" da "0"
  // da 0 verir — para sonucu AYNI. Renderer'li her kolona ikinci bir metin
  // uretici yazmak, ekran ile pano arasinda AYRISABILEN ikinci bir bicimlendirme
  // katmani dogururdu (ikiz kaynak = zamanla sapan kaynak).
  // Net Fiyat / birim fiyat / toplam kolonlarinin HEPSI valueFormatter kullanir;
  // yani PARA kolonlarinda pano ekranin birebir aynisidir — kullanicinin
  // istegi olan sinif budur.
  expect(ham.split(/\r?\n/)).toEqual(['0\t₺600,00', '0\t₺400,00']);
});

test('KP10 ★ TEKLIF GRIDINDEN de kopyalanir (kullanici: "her iki taraftan da")', async ({ page }) => {
  // Kopyalama moda bagli DEGILDIR: kutuphane KAYNAK, teklif hem KAYNAK hem HEDEF.
  // Senaryo: kullanici bir satira fiyati elle girer, ayni fiyati baska satirlara
  // tasimak ister — kutuphaneye ugramadan.
  await moduAyarla(page, 'quote');
  const kaynak = page.locator('[row-index="2"] [col-id="_matBirim"]');
  await kaynak.dblclick();
  await page.keyboard.type('1875,5');
  await page.keyboard.press('Enter');
  await expect(kaynak).toHaveText(/1\.875,5/);

  await kaynak.click();
  await expect(kaynak).toHaveClass(/ag-cell-focus/);
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺1.875,50');

  // Ayni panoyu ISCILIK kolonuna yapistir — ondalik ve binlik BOZULMADAN
  const hedef = page.locator('[row-index="4"] [col-id="_labBirim"]');
  await hedef.click();
  await page.keyboard.press('Control+v');
  await expect(hedef).toHaveText(/1\.875,5/);
  // 102 mt × 1875,5 = 191.301 — binlik ayirici YUTULMAMIS olmali (PK6 sinifi)
  await expect(page.locator('[row-index="4"] [col-id="_labToplam"]')).toHaveText(/191\.301/);
});

test('KP11 ★ Ctrl+C ODAGI CALMAZ — kopyala/ok/kopyala ritmi (Excel)', async ({ page }) => {
  // Regresyon kilidi: kopyalamadan sonra odak sarmalayiciya tasinirsa AG Grid'in
  // ok navigasyonu OLUR. Olculen bozulma: ArrowDown hucreyi hic oynatmiyor,
  // ikinci Ctrl+C AYNI (bayat) fiyati kopyaliyor ve toast yine "kopyalandi"
  // diyor — kullanici bir alt malzemeye indigini sanip YANLIS fiyat yapistirir.
  await netFiyatinaTikla(page, 2);
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/hücre kopyalandı/).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺600,00');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`[row-index="3"] [col-id="${NET}"]`)).toHaveClass(/ag-cell-focus/);
  await page.keyboard.press('Control+c');
  // Odak gercekten tasindiysa IKINCI kopya BIR ALT satirin fiyatidir
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺400,00');
});

test('KP12 ★ Toolbar iskonto kutusunda Ctrl+Z gridi GERI ALMAZ (capture kalkani)', async ({ page }) => {
  // Bu turun capture fazina gecisi, input'larin kendi `stopPropagation`
  // kalkanini yapisal olarak delmisti. Olculen bozulma: kullanici "İskonto %"
  // kutusuna yazarken Ctrl+Z'ye basinca TUM LISTENIN toplu iskontosu sessizce
  // geri aliniyordu (odak kutuda, toast yok, net fiyatlar degisir).
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/);

  const kutu = page.getByPlaceholder(/örn 30/);
  await kutu.click();
  await kutu.fill('30');
  await page.getByRole('button', { name: /Tüm listeye uygula/ }).click();
  // Toplu iskonto uygulandi: net fiyat 600 → 420
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/420/);

  await kutu.click();
  await page.keyboard.type('35');
  await page.keyboard.press('Control+z');          // kutudaki METNI geri almak icin
  // ⚠ Grid DOKUNULMAMIS olmali — iskonto hala uygulanmis
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/420/);
});

test('KP13 ★ Secim tulu ile kopyalanan hucreler AYNI kumedir (veri olmayan satir boyanmaz)', async ({ page }) => {
  // "Gordugunu kopyaladin" guveni: tul kopyalanacak hucrelerin USTKUMESI olamaz.
  // Harness'te satir 0 ve 1 veri satiri DEGIL (baslik) — yukari secimde onlar
  // boyanirsa kullanici "3 hucre mavi" gorup "1 hucre kopyalandi" toast'i alir.
  await netFiyatinaTikla(page, 2);
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => tulSayisi(page)).toBe(1);   // yalniz satir 2
  await page.keyboard.press('Control+c');
  await expect(page.getByText(/1 hücre kopyalandı/).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺600,00');
});

test('KP14 ★ Tumu BOS secim PANOYU EZMEZ ve yalan toast atmaz', async ({ page }) => {
  // Harness quote modunda fiyat kolonlari bostur. Iki bos hucre secilince
  // uretilen metin "\n" olur — bos string DEGILDIR; kapi sadece `!metin`
  // baksaydi pano silinir ve "2 hücre kopyalandı" denirdi.
  await moduAyarla(page, 'library');
  await expect(page.locator(`[row-index="2"] [col-id="${NET}"]`)).toHaveText(/600/);
  await page.locator(`[row-index="2"] [col-id="${NET}"]`).click();
  await page.keyboard.press('Control+c');            // panoda gecerli bir deger birak
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺600,00');

  await moduAyarla(page, 'quote');
  const bos = page.locator('[row-index="2"] [col-id="_matBirim"]');
  await expect(bos).toHaveText(/^\s*$/);
  await bos.click();
  await expect(bos).toHaveClass(/ag-cell-focus/);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c');

  await expect(page.getByText(/Kopyalanacak değer yok/).first()).toBeVisible();
  // ⚠ PANO KIRLETILMEDI: onceki gecerli deger yerinde
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('₺600,00');
});

test('KP15 ★ Dovizli metin teklife YAPISTIRILAMAZ (sessiz ~34 kat hata kapisi)', async ({ page }) => {
  // `insanSayi` $ ve € sembolunu suzer: "$1.500,00" ile "1500" ayni sayiyi verir.
  // Teklif alanlari TL tabanlidir; dovizli metin ham girerse kalem kur kati
  // kadar yanlis fiyatlanir ve EKRANDA DOGRU GORUNUR.
  await moduAyarla(page, 'quote');
  const hedef = page.locator('[row-index="2"] [col-id="_matBirim"]');
  await hedef.click();
  await expect(hedef).toHaveClass(/ag-cell-focus/);
  await page.evaluate(() => navigator.clipboard.writeText('$1.500,00'));
  await page.keyboard.press('Control+v');

  await expect(page.getByText(/Dövizli tutar yapıştırılamaz/).first()).toBeVisible();
  await expect(hedef).toHaveText(/^\s*$/);            // hucre DOKUNULMADI
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
  await expect.poll(() => tulSayisi(page)).toBe(3);
});
