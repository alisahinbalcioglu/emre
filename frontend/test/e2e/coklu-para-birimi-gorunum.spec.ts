/**
 * COKLU PARA BIRIMI F6a — GORUNUM KURALI (karar K1, 05.10; Emre'nin onerilen
 * onayi koordinator uzerinden).
 *
 * Karisik kip YAZIM yetenegidir ($ liste fiyati $ kalir); birim basina GORUNUM
 * (alt satirlar "GENEL TOPLAM ₺/$", fitting "₺x + $y") YALNIZ $/€ taraf varken.
 * Yalniz-₺ karisik teklif TL teklifle AYNI gorunur: "yeni teklif karisik" ile
 * "yalniz-TL teklifin ekrani bayt bayt ayni" ancak boyle birlikte tutar.
 *
 *  G1 ★★ ayni ₺ adimlari TL ve karisik kipte: izgaradaki HER hucrenin metni
 *        (veri + alt satirlar, fitting dahil) AYNI.
 *  G2 ★★ $ gelince gorunum CANLI birim basina doner (alt satirlar ₺/$ ayri,
 *        fitting "₺x + $y").
 *  G5 ★  baska sayfanin dovizi izgara KURULDUKTAN sonra degisince (sayfa gecisi) gorunum
 *        yeniden yazmadan doner — ve geri.
 *  G6 ★★ ekran USD iken: yalniz-₺ karisik TL gibi CEVRILIR (K1); $ gelince birim basina
 *        gorunum cevirmez ve yazilmamis ₺ satirlari da tazelenir (F6a; F6c anahtarla yeniden ele alir).
 *  G7 ★★ son $ silinince TL gorunumune GERI doner; taraf birimi fiyatla gider (inceleme M1)
 *        ve fitting hucreleri TL degeriyle yeniden dolar.
 *  G8 ★  toplam sutunsuz sayfa: $ fiyat $ gorunur (inceleme H1 — olcum erken donusun altindaydi).
 *  G1u ★★ G1 ekran USD iken de (TL gorunumu cevirir; karisik da aynisini yapmali).
 *  G3 ★  baska sayfada doviz varsa (sayfa `digerSayfalardaDoviz` gecirir)
 *        yalniz-₺ sayfa da birim basina gorunur — teklif genelinde tek duzen.
 */
import { test, expect, Page } from '@playwright/test';

const hucre = (page: Page, row: number | string, col: string) => page.locator(`[row-index="${row}"] [col-id="${col}"]`);

async function sec(page: Page, row: number, col: '_marka' | '_firma', ad: string) {
  await hucre(page, row, col).locator('button').click();
  await page.locator('span[class="flex-1"]', { hasText: new RegExp(`^${ad}$`) }).click();
}

async function elleYaz(page: Page, row: number, col: string, metin: string) {
  await hucre(page, row, col).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(metin);
  await page.keyboard.press('Enter');
}

/** Alt (pinned) satirlarin adlari, EKRAN sirasiyla. ⚠ DOM sirasi DEGIL: AG Grid satirlari
 *  CSS ile konumlar, DOM sirasi ekrandakinden farkli olabilir (olculdu) — `row-index` (b-N) sirasi. */
const altAdlar = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('.ag-floating-bottom .ag-row'))
  .map((el) => ({ no: Number(String(el.getAttribute('row-index') ?? '').replace(/\D/g, '')), ad: (el.querySelector('[col-id="col1"]')?.textContent ?? '').trim() }))
  .filter((x) => x.ad).sort((a, b) => a.no - b.no).map((x) => x.ad));

/** Izgaradaki her hucrenin metni: bolum:satir:kolon → metin (sanal satirlar sabit; harness kucuk). */
const izgaraGoruntusu = (page: Page) => page.evaluate(() => {
  const o: Record<string, string> = {};
  for (const satir of Array.from(document.querySelectorAll('.ag-row'))) {
    const bolum = satir.closest('.ag-floating-bottom') ? 'alt' : 'govde';
    const no = satir.getAttribute('row-index');
    for (const h of Array.from(satir.querySelectorAll('[col-id]'))) {
      o[`${bolum}:${no}:${h.getAttribute('col-id')}`] = (h.textContent ?? '').trim();
    }
  }
  return o;
});

/** Yalniz ₺: satir 2 elle ₺100 × 286, satir 3 AYVAZ listesi (₺400 × 268), satir 10 fitting %5 (kapsam 2 + 3).
 *  Sira F3 senaryosunun (coklu-para-birimi-toplam) — fitting'den hemen once liste secimi. */
async function tlAdimlari(page: Page, url: string, _x?: string, fitting = '₺6.790,00') {
  const usd = url.includes('gorunumUSD=1');
  await page.goto(url);
  // Elle yazilan deger TL tabanidir (harness duzenleme yolu); ekran USD'de 28.600 / 40 = $715
  await elleYaz(page, 2, '_matBirim', '100');
  await expect(hucre(page, 2, '_matToplam')).toHaveText(usd ? '$715,00' : '₺28.600,00');
  await sec(page, 3, '_marka', 'AYVAZ');
  await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
  await expect(hucre(page, 3, '_matToplam')).toHaveText(usd ? '$2.680,00' : '₺107.200,00');
  await elleYaz(page, 10, 'col3', '%');
  await expect(page.getByText(/Fitting kapsamı/i).first()).toBeVisible({ timeout: 10_000 });
  await hucre(page, 2, 'col1').click({ modifiers: ['Control'] });
  await hucre(page, 3, 'col1').click({ modifiers: ['Control'] });
  // Kapsam canli hesaplanir: ikinci Ctrl+tik islenmeden Escape basilirsa kapsam tek
  // satirda kalir (olculdu: 1.430 = %5 × 28.600) — once tutar yerine otursun
  await expect(hucre(page, 10, '_matToplam')).toHaveText(fitting, { timeout: 10_000 });
  await page.keyboard.press('Escape');
}

test.describe('F6a — yalniz-₺ karisik teklif TL gibi gorunur', () => {
  for (const [ad, ek, fitting] of [['G1', '', '₺6.790,00'], ['G1u (ekran USD)', '&gorunumUSD=1', '$169,75']] as const) {
    test(`${ad} ★★ ayni ₺ adimlari: TL ve karisik kipte izgaradaki HER hucre ayni`, async ({ page }) => {
      await tlAdimlari(page, `/dev/grid-test?x=1${ek}`, ek ? undefined : '₺6.790,00', fitting);
      await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM', 'KÂR']);
      const tl = await izgaraGoruntusu(page);
      await tlAdimlari(page, `/dev/grid-test?para=karisik${ek}`, ek ? undefined : '₺6.790,00', fitting);
      await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM', 'KÂR']);
      const karisik = await izgaraGoruntusu(page);
      // Olcut kendisi: goruntu bos degil, fitting ve alt satir hucreleri icinde
      expect(Object.keys(tl).length).toBeGreaterThan(50);
      expect(tl['govde:10:_matToplam']).toBe(fitting);
      const farklar = Object.keys({ ...tl, ...karisik }).filter((k) => tl[k] !== karisik[k]).map((k) => `${k}: TL=${tl[k]} | karisik=${karisik[k]}`);
      expect(farklar).toEqual([]);
    });
  }

  test('G2 ★★ $ gelince birim basina gorunume CANLI doner', async ({ page }) => {
    await tlAdimlari(page, '/dev/grid-test?para=karisik');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matToplam')).toHaveText('$3.003,00');
    await expect(hucre(page, 10, '_matToplam')).toHaveText('₺5.360,00 + $150,15', { timeout: 10_000 });
    await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM ₺', 'GENEL TOPLAM $', 'KÂR ₺', 'KÂR $']);
  });

  test('G3 ★ baska sayfada doviz: yalniz-₺ sayfa da birim basina (teklif geneli tek duzen)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&digerDoviz=1');
    await sec(page, 3, '_marka', 'AYVAZ');
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(hucre(page, 3, '_matToplam')).toHaveText('₺107.200,00');
    await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM ₺', 'KÂR ₺']);
  });

  test('G5 ★ baska sayfanin dovizi sonradan degisince gorunum YAZIM OLMADAN doner (ve geri)', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik');
    await sec(page, 3, '_marka', 'AYVAZ');
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(hucre(page, 3, '_matToplam')).toHaveText('₺107.200,00');
    await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM', 'KÂR']);
    await page.getByTestId('diger-doviz').click();
    await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM ₺', 'KÂR ₺']);
    await page.getByTestId('diger-doviz').click();
    await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM', 'KÂR']);
  });

  test('G6 ★★ ekran USD: yalniz-₺ karisik TL gibi cevrilir; $ gelince birim basina (cevrimsiz) tum hucrelerde', async ({ page }) => {
    for (const url of ['/dev/grid-test?gorunumUSD=1', '/dev/grid-test?para=karisik&gorunumUSD=1']) {
      await page.goto(url);
      await sec(page, 3, '_marka', 'AYVAZ');
      await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
      // 107.200 TL / 40 = $2.680 — TL kipiyle AYNI (karar K1)
      await expect(hucre(page, 3, '_matToplam'), url).toHaveText('$2.680,00');
    }
    // F6a: dovizli taraf gelince birim basina gorunum cevirmez (F3 davranisi) — ₺ satiri da
    // YAZILMADAN yeniden bicimlenir (gorunum donusunde tum hucreler tazelenir)
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matToplam')).toHaveText('$3.003,00');
    await expect(hucre(page, 3, '_matToplam')).toHaveText('₺107.200,00', { timeout: 10_000 });
  });

  test('G7 ★★ son $ silinince TL gorunumune geri doner; fitting hucreleri TL degeriyle dolar', async ({ page }) => {
    await tlAdimlari(page, '/dev/grid-test?para=karisik');
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 10, '_matToplam')).toHaveText('₺5.360,00 + $150,15', { timeout: 10_000 });
    // Fiyat ELLE silinir (0): taraf birimi de gider (F2 kurali, inceleme M1) — yalniz ₺ kalir
    await elleYaz(page, 2, '_matBirim', '0');
    await expect.poll(() => altAdlar(page), { timeout: 10_000 }).toEqual(['GENEL TOPLAM', 'KÂR']);
    // Fitting kapsami artik yalniz ₺: hucre TL degerini tasir (bos degil) — %5 × 107.200
    await expect(hucre(page, 10, '_matToplam')).toHaveText('₺5.360,00', { timeout: 10_000 });
  });

  test('G8 ★ toplam sutunsuz sayfa: $ fiyat $ gorunur, ekran USD iken de cevrilmez', async ({ page }) => {
    await page.goto('/dev/grid-test?para=karisik&toplamsiz=1&gorunumUSD=1');
    // Yalniz ₺: TL gorunumu ekran birimine cevirir (₺400 / 40 = $10)
    await sec(page, 3, '_marka', 'AYVAZ');
    await page.getByText('Su ve Yangın Tesisat Boruları (TS EN 10255)').click();
    await expect(hucre(page, 3, '_matBirim')).toHaveText('$10,00', { timeout: 10_000 });
    await sec(page, 2, '_marka', 'DOLAR MARKA');
    await expect(hucre(page, 2, '_matBirim')).toHaveText('$10,50', { timeout: 10_000 });
    // Sayfa olcumu (erken donusten ONCE) gorunumu birim basina cevirdi: ₺ satiri da cevrimsiz —
    // satirin kendi dovizine bakan yedek bunu YAPAMAZ, yalniz sayfa olcumu yapar
    await expect(hucre(page, 3, '_matBirim')).toHaveText('₺400,00', { timeout: 10_000 });
  });
});
