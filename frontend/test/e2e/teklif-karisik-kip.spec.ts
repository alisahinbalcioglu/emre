/**
 * COKLU PARA BIRIMI F6b — YENI TEKLIF KARISIK ACILIR (tasarim varsayilani, 04.10;
 * Emre'nin onerilen onayi 05.10). Gercek /quotes/new sayfasi, API taklit.
 *
 *  Y1 ★★ YENI teklif (gosterge paneli ice aktarmasi): "$12" birimi secer; kayit
 *        yuku sayfada `paraKipi: karisik`, satirda `_matPB: USD`; iliskisel kalem
 *        TL karsiligi (12 × 40 = 480).
 *  Y2 ★★ ESKI TL teklif revizyonu (isaretsiz, birimsiz satirlar): TL kalir —
 *        yukte isaret ve birim alani YOK (tasarim: "eski teklif TL kalir").
 *  Y3 ★  FIYATSIZ kaydedilmis karisik teklifin revizyonu (yalniz sayfa isareti):
 *        karisik acilir.
 *  Y4 ★★ KUR YOK (karar, 06.10): dovizli kalem fiyatsiz SAYILMAZ (onay sorulmaz);
 *        ayri, bloklamayan "Döviz kuru alınamadı" uyarisi; kalem TL karsiligi 0.
 *  Y4k  KONTROL: kur varken uyari yok.
 *  Y5 ★★ fiyatlanmamis YENI teklif sayfa yenilenince karisik KALIR (taslak kipi tasir).
 *  Y13 ★★ gercek sayfada "$12 ↓ 400": ₺ fiyatli sayfaya ilk $ alt satirlari 2 → 4 yapar —
 *        ikinci hucrenin acik editoru KESILMEMELI (400 kayboluyordu; F3'ten beri, F6b ile her gun).
 *  ⚠ Tohum yalniz ILK yuklemede: addInitScript yenilemede de kosar — yeniden tohumlasa
 *  ice aktarma taslagin yerine gecerdi (bilinen tuzak).
 *
 *  F6c (karar K2) — GORUNUM ANAHTARI, iki sayfa (ikiz):
 *  Y6 ★★ dovizli yeni teklif: anahtar [Karisik | TL | USD | EUR], Karisik secili; TL
 *        "Tumu ₺" (12 × 40 = ₺480), fiyat hucresi SALT OKUNUR; Karisik'e donunce $12.
 *  Y7 ★  yalniz-₺ karisik teklif: anahtar bugunku [TL | USD | EUR] (Karisik YOK).
 *  Y8 ★★ gorunum KAYDA girmez: Tumu ₺ secili kayit yuku Karisik'tekiyle ayni ($ satir).
 *  D1 ★★ DETAY sayfasi ikizi: kayitli goruntuleme USD olsa da dovizli teklif Karisik
 *        ACILIR; TL donuk kurla cevirir (10,50 × 38 = ₺399) ve secim kaydedilir (PATCH);
 *        Karisik secimi kaydedilmez (KH8 yalniz tek birim).
 *  Y9 ★★ (inceleme H1) KAYITLI $ satirli taslak acilinca anahtar Karisik'i gosterir —
 *        izgara dovizi yalniz DEGISIMDE bildiriyordu, ilk olcum bildirilmiyordu.
 *  Y10 ★★ (inceleme H1-B) iki sayfa: ₺ sayfada Tumu TL secilir, $ sayfaya gecince
 *        Tumu DUSMEZ (yeni sayfanin dovizi kayitli satirlarindan, bildirim beklenmeden).
 *  Y11 ★★ (inceleme M1) "$12 ↓ 400" ritmi: dovizin ilk gelisi sayfayi yeniden
 *        cizdirir — ikinci hucrenin acik editoru KESILMEMELI (KP17 ailesi).
 *  Y12 ★ (inceleme L5) teklif dovizsiz kalinca tercih Karisik'e doner: $ yeniden
 *        gelince kullanici istemeden salt okunur Tumu'ye dusmez.
 */
import { test, expect, Page } from '@playwright/test';
import { TASLAK_ANAHTARI, TASLAK_SURUMU } from '../../ozellik/teklif/taslak';

const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.imzaYok_test';

const ROLLER = {
  nameField: 'col1', noField: 'col0', quantityField: 'col2', unitField: 'col3',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam', grandTotalField: '_toplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};
const KOLONLAR = [
  { field: 'col0', headerName: 'No', width: 60, editable: true },
  { field: 'col1', headerName: 'Malzeme Adı', width: 260, editable: true },
  { field: 'col2', headerName: 'Miktar', width: 80, editable: true },
  { field: 'col3', headerName: 'Birim', width: 70, editable: true },
  { field: '_malzKar', headerName: 'Malz. Kar %', width: 85, editable: true },
  { field: '_matBirim', headerName: 'Malz. Birim Fiyat', width: 120, editable: true },
  { field: '_matToplam', headerName: 'Malz. Toplam', width: 120, editable: false },
  { field: '_iscKar', headerName: 'İşç. Kar %', width: 80, editable: true },
  { field: '_labBirim', headerName: 'İşç. Birim Fiyat', width: 120, editable: true },
  { field: '_labToplam', headerName: 'İşç. Toplam', width: 120, editable: false },
  { field: '_toplam', headerName: 'Toplam', width: 120, editable: false },
];
/** Fiyatsiz tek veri satiri (yeni teklif / fiyatlanmamis revizyon). */
const SATIR = {
  _rowIdx: 0, _isDataRow: true, _isHeaderRow: false, _malzKar: 0, _iscKar: 0, _marka: null, _firma: null,
  _matNetPrice: 0, _labNetPrice: 0, _merges: {}, col0: '1', col1: 'Kelebek Vana DN65', col2: '2', col3: 'ad',
  _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '', _toplam: '',
};
const sayfa = (ek: Record<string, unknown> = {}) => ({
  name: 'Mekanik', index: 0, isEmpty: false, headerEndRow: 0, columnDefs: KOLONLAR, columnRoles: ROLLER, rowData: [SATIR], ...ek,
});
const taslak = (quoteId: string, sayfaEki: Record<string, unknown> = {}) => ({
  v: TASLAK_SURUMU,
  multiSheet: { sheets: [sayfa(sayfaEki)], brands: [] },
  activeSheetIndex: 0, sheetDisciplines: { 0: 'mechanical' }, title: 'F6b', quoteId,
  allBrands: [], colHiddenBySheet: {}, colWidthsBySheet: {}, colFloorsBySheet: {},
});

async function ac(page: Page, yol: { taslak?: unknown; iceAktarma?: unknown }, kur: 'var' | 'yok' = 'var') {
  const govdeler: any[] = [];
  await page.route('**/api/**', async (route) => {
    const istek = route.request();
    const url = istek.url();
    if (/\/api\/exchange-rates/.test(url)) {
      return kur === 'var'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usdTry: 40, eurTry: 46, source: 'tcmb', date: '06.10.2026', gecerli: true }) })
        : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    if ((istek.method() === 'POST' && /\/api\/quotes\/?$/.test(url)) || (istek.method() === 'PUT' && /\/api\/quotes\/[^/]+$/.test(url))) {
      govdeler.push(istek.postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'q-f6b' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(
    ([jeton, anahtar, veri, ice]) => {
      localStorage.setItem('token', jeton as string);
      localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z', tier: 'pro' }));
      if (sessionStorage.getItem('__f6b_tohum')) return; // yenileme: tohum TEKRARLANMAZ
      sessionStorage.setItem('__f6b_tohum', '1');
      if (veri) sessionStorage.setItem(anahtar as string, veri as string);
      if (ice) sessionStorage.setItem('metaprice_upload_result', ice as string);
    },
    [JETON, TASLAK_ANAHTARI, yol.taslak ? JSON.stringify(yol.taslak) : '', yol.iceAktarma ? JSON.stringify(yol.iceAktarma) : ''] as const,
  );
  await page.goto(yol.iceAktarma ? '/quotes/new?from=dashboard' : '/quotes/new');
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Kelebek Vana DN65/, { timeout: 30_000 });
  return { govdeler };
}

async function fiyatYaz(page: Page, metin: string) {
  const hucre = page.locator('[row-index="0"] [col-id="_matBirim"]');
  await hucre.dblclick();
  const girdi = page.locator('.ag-cell-inline-editing input');
  await expect(girdi).toBeVisible();
  await girdi.fill(metin);
  await page.keyboard.press('Enter');
}

async function kaydet(page: Page, govdeler: any[]) {
  await page.getByRole('button', { name: /Teklifi (Kaydet|Güncelle)/ }).click();
  await expect.poll(() => govdeler.length, { timeout: 15_000 }).toBeGreaterThan(0);
  return govdeler[0];
}

const ICE_AKTARMA = { fileName: 'yeni.xlsx', multiSheetData: { sheets: [sayfa()], brands: [] } };

test('Y1 ★★ YENI teklif karisik acilir: "$12" birimi secer, kayit yuku isaret + birim + TL karsiligi tasir', async ({ page }) => {
  const { govdeler } = await ac(page, { iceAktarma: ICE_AKTARMA });
  await fiyatYaz(page, '$12');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$12,00');
  await expect(page.locator('[row-index="0"] [col-id="_matToplam"]')).toHaveText('$24,00');
  const govde = await kaydet(page, govdeler);
  expect(govde.sheets[0].paraKipi).toBe('karisik');
  const r = govde.sheets[0].rowData.find((x: any) => x.col1 === 'Kelebek Vana DN65');
  expect(r._matPB).toBe('USD');
  expect(govde.items[0].materialUnitPrice).toBe(480); // 12 × 40 (kayit anindaki kur)
});

test('Y2 ★★ ESKI TL teklif revizyonu TL kalir: yukte isaret ve birim alani YOK', async ({ page }) => {
  const { govdeler } = await ac(page, { taslak: taslak('q-eski-tl') });
  await fiyatYaz(page, '100');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('₺100,00');
  const govde = await kaydet(page, govdeler);
  expect('paraKipi' in govde.sheets[0]).toBe(false);
  const r = govde.sheets[0].rowData.find((x: any) => x.col1 === 'Kelebek Vana DN65');
  expect('_matPB' in r).toBe(false);
});

test('Y3 ★ fiyatsiz kaydedilmis KARISIK teklifin revizyonu (yalniz sayfa isareti) karisik acilir', async ({ page }) => {
  const { govdeler } = await ac(page, { taslak: taslak('q-karisik', { paraKipi: 'karisik' }) });
  await fiyatYaz(page, '$12');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$12,00');
  const govde = await kaydet(page, govdeler);
  expect(govde.sheets[0].paraKipi).toBe('karisik');
  expect(govde.sheets[0].rowData[0]._matPB).toBe('USD');
});

test('Y4 ★★ KUR YOK: dovizli kalem fiyatsiz sayilmaz, durust uyari, kalem TL karsiligi 0', async ({ page }) => {
  const { govdeler } = await ac(page, { iceAktarma: ICE_AKTARMA }, 'yok');
  await fiyatYaz(page, '$12');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$12,00');
  const govde = await kaydet(page, govdeler); // fiyatsiz onayi cikarsa kayit beklemede kalir → bu adim duser
  await expect(page.getByText(/Güncel döviz kuru yok: 1 dövizli kalemin TL karşılığı/).first()).toBeVisible();
  expect(govde.items[0].materialUnitPrice).toBe(0);
  expect(govde.sheets[0].rowData[0]._matPB).toBe('USD'); // teklifin kendisi $ olarak dogru
});

test('Y4k KONTROL: kur varken kur uyarisi YOK', async ({ page }) => {
  const { govdeler } = await ac(page, { iceAktarma: ICE_AKTARMA });
  await fiyatYaz(page, '$12');
  await kaydet(page, govdeler);
  await expect(page.getByText(/Teklif kaydedildi/).first()).toBeVisible();
  await expect(page.getByText(/Güncel döviz kuru yok/)).toHaveCount(0);
});

test('Y5 ★★ fiyatlanmamis YENI teklif yenilemede karisik KALIR (taslak kipi tasir)', async ({ page }) => {
  await ac(page, { iceAktarma: ICE_AKTARMA });
  // Taslak yazimi effect ile — yenilemeden once yazilmis olsun
  await expect.poll(() => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k as string) ?? '{}').paraKipi, TASLAK_ANAHTARI), { timeout: 10_000 }).toBe('karisik');
  await page.reload();
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Kelebek Vana DN65/, { timeout: 30_000 });
  await fiyatYaz(page, '$12');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$12,00');
});

// ── F6c: gorunum anahtari (karar K2) ──────────────────────────────────────────
const anahtar = (page: Page) => page.getByRole('group', { name: 'Para birimi görünümü' });

test('Y6 ★★ dovizli yeni teklif: anahtar Karisik + TL/USD/EUR; Tumu ₺ salt okunur, Karisik geri getirir', async ({ page }) => {
  await ac(page, { iceAktarma: ICE_AKTARMA });
  await expect(anahtar(page).getByRole('button')).toHaveText(['TL', 'USD', 'EUR']); // fiyatsiz: yalniz-₺
  await fiyatYaz(page, '$12');
  await expect(anahtar(page).getByRole('button')).toHaveText(['Karışık', 'TL', 'USD', 'EUR']);
  await expect(anahtar(page).getByRole('button', { name: 'Karışık' })).toHaveAttribute('aria-pressed', 'true');
  await anahtar(page).getByRole('button', { name: 'TL' }).click();
  const hucre = page.locator('[row-index="0"] [col-id="_matBirim"]');
  await expect(hucre).toHaveText('₺480,00'); // 12 × 40 (canli; elle fiyatin donuk kuru yok)
  await expect(page.locator('[row-index="0"] [col-id="_matToplam"]')).toHaveText('₺960,00');
  await hucre.dblclick();
  await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(0);
  await anahtar(page).getByRole('button', { name: 'Karışık' }).click();
  await expect(hucre).toHaveText('$12,00');
});

test('Y7 ★ yalniz-₺ karisik teklif: anahtarda Karisik YOK (bugunku TL/USD/EUR)', async ({ page }) => {
  await ac(page, { iceAktarma: ICE_AKTARMA });
  await fiyatYaz(page, '100');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('₺100,00');
  await expect(anahtar(page).getByRole('button')).toHaveText(['TL', 'USD', 'EUR']);
});

test('Y8 ★★ gorunum KAYDA girmez: Tumu ₺ seciliyken yuk $ satiri ve TL karsiligini aynen tasir', async ({ page }) => {
  const { govdeler } = await ac(page, { iceAktarma: ICE_AKTARMA });
  await fiyatYaz(page, '$12');
  await anahtar(page).getByRole('button', { name: 'TL' }).click();
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('₺480,00');
  const govde = await kaydet(page, govdeler);
  const r = govde.sheets[0].rowData.find((x: any) => x.col1 === 'Kelebek Vana DN65');
  expect(r._matPB).toBe('USD');
  expect(Number(r._matBirim)).toBe(12);
  expect(govde.items[0].materialUnitPrice).toBe(480);
});

test('D1 ★★ DETAY ikizi: dovizli teklif Karisik acilir (kayitli birim USD olsa da); TL donuk kurla, secim kaydedilir', async ({ page }) => {
  const patchler: any[] = [];
  const satir = {
    ...SATIR, _matPB: 'USD', _matKurBilgi: { currency: 'USD', kur: 38, tarih: '01.10.2026' }, _matNetPrice: 10.5,
    _matBirim: '10.50', _matToplam: '21.00',
  };
  await page.route('**/api/**', async (route) => {
    const istek = route.request();
    const url = istek.url();
    if (/\/api\/exchange-rates/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usdTry: 40, eurTry: 46, source: 'tcmb', date: '06.10.2026', gecerli: true }) });
    }
    if (istek.method() === 'PATCH' && /\/api\/quotes\/q-d\/info/.test(url)) {
      patchler.push(istek.postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (istek.method() === 'GET' && /\/api\/quotes\/q-d(\?|$)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'q-d', title: 'F6c detay', createdAt: '2026-10-06T00:00:00Z', quoteNo: null, user: { email: 'x@y.z' },
        items: [], displayCurrency: 'USD', displayLanguage: 'tr', status: 'TASLAK',
        sheets: [sayfa({ paraKipi: 'karisik', rowData: [satir] })],
      }) });
    }
    if (/\/api\/(library\/brands|labor-firms)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(([jeton]) => {
    localStorage.setItem('token', jeton as string);
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z', tier: 'pro' }));
  }, [JETON] as const);
  await page.goto('/quotes/q-d');
  const hucre = page.locator('[row-index="0"] [col-id="_matBirim"]');
  await expect(hucre).toHaveText('$10,50', { timeout: 30_000 });
  await expect(anahtar(page).getByRole('button', { name: 'Karışık' })).toHaveAttribute('aria-pressed', 'true');
  // inceleme L5: Karisik'te kayitli USD'nin kur etiketi gosterilmez (cevrim yok)
  await expect(page.getByText(/^1 USD = ₺/)).toHaveCount(0);
  await anahtar(page).getByRole('button', { name: 'TL' }).click();
  await expect(hucre).toHaveText('₺399,00'); // 10,50 × 38 (DONUK kur; canli 40 ₺420 olurdu)
  await expect.poll(() => patchler.length).toBe(1);
  expect(patchler[0].displayCurrency).toBe('TRY');
  await anahtar(page).getByRole('button', { name: 'Karışık' }).click();
  await expect(hucre).toHaveText('$10,50');
  expect(patchler.length).toBe(1); // Karisik secimi kaydedilmez
});

// ── F6c inceleme (H1, M1) ─────────────────────────────────────────────────────
const DOLAR_SATIR = {
  ...SATIR, _matPB: 'USD', _matKurBilgi: { currency: 'USD', kur: 38, tarih: '01.10.2026' }, _matNetPrice: 10.5,
  _matBirim: '10.50', _matToplam: '21.00',
};
const IKINCI_SATIR = { ...SATIR, _rowIdx: 1, col0: '2', col1: 'Küresel Vana DN50' };

test('Y9 ★★ (H1) kayitli $ satirli taslak acilinca anahtar Karisik secenegini gosterir', async ({ page }) => {
  await ac(page, { taslak: taslak('q-dolar', { paraKipi: 'karisik', rowData: [DOLAR_SATIR] }) });
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$10,50');
  await expect(anahtar(page).getByRole('button')).toHaveText(['Karışık', 'TL', 'USD', 'EUR']);
  await anahtar(page).getByRole('button', { name: 'TL' }).click();
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('₺399,00'); // donuk 38
});

test('Y10 ★★ (H1-B) iki sayfa: ₺ sayfada Tumu TL secili, $ sayfaya gecince Tumu DUSMEZ', async ({ page }) => {
  const iki = {
    v: TASLAK_SURUMU,
    multiSheet: { sheets: [
      sayfa({ name: 'Mekanik', index: 0, paraKipi: 'karisik', rowData: [{ ...SATIR, _matBirim: '100.0', _matToplam: '200.0' }] }),
      sayfa({ name: 'Elektrik', index: 1, paraKipi: 'karisik', rowData: [DOLAR_SATIR] }),
    ], brands: [] },
    activeSheetIndex: 0, sheetDisciplines: { 0: 'mechanical', 1: 'electrical' }, title: 'F6c', quoteId: 'q-iki',
    allBrands: [], colHiddenBySheet: {}, colWidthsBySheet: {}, colFloorsBySheet: {},
  };
  await ac(page, { taslak: iki });
  await expect(anahtar(page).getByRole('button')).toHaveText(['Karışık', 'TL', 'USD', 'EUR']); // diger sayfada $
  await anahtar(page).getByRole('button', { name: 'TL' }).click();
  await page.getByTitle('Elektrik', { exact: true }).click();
  const hucre = page.locator('[row-index="0"] [col-id="_matBirim"]');
  await expect(hucre).toHaveText('₺399,00');
  await expect(anahtar(page).getByRole('button', { name: 'TL' })).toHaveAttribute('aria-pressed', 'true');
  await hucre.dblclick();
  await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(0); // Tumu salt okunur kaldi
});

test('Y11 ★★ (M1) "$12 ↓ 400" ritmi: dovizin ilk gelisi ikinci hucrenin editorunu KESMEZ', async ({ page }) => {
  const ICE = { fileName: 'iki.xlsx', multiSheetData: { sheets: [sayfa({ rowData: [SATIR, IKINCI_SATIR] })], brands: [] } };
  await ac(page, { iceAktarma: ICE });
  await page.locator('[row-index="0"] [col-id="_matBirim"]').dblclick();
  await expect(page.locator('.ag-cell-inline-editing input')).toBeVisible();
  await page.keyboard.type('$12');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('400', { delay: 40 });
  await page.keyboard.press('Enter');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$12,00');
  await expect(page.locator('[row-index="1"] [col-id="_matBirim"]')).toHaveText('₺400,00');
  await expect(anahtar(page).getByRole('button')).toHaveText(['Karışık', 'TL', 'USD', 'EUR']);
});

test('Y11k KONTROL: ayni ritim dovizsiz (12) — ikinci hucre yazilir', async ({ page }) => {
  const ICE = { fileName: 'iki.xlsx', multiSheetData: { sheets: [sayfa({ rowData: [SATIR, IKINCI_SATIR] })], brands: [] } };
  await ac(page, { iceAktarma: ICE });
  await page.locator('[row-index="0"] [col-id="_matBirim"]').dblclick();
  await expect(page.locator('.ag-cell-inline-editing input')).toBeVisible();
  await page.keyboard.type('12');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('400', { delay: 40 });
  await page.keyboard.press('Enter');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('₺12,00');
  await expect(page.locator('[row-index="1"] [col-id="_matBirim"]')).toHaveText('₺400,00');
});

test('Y12 ★ (L5) Tumu seciliyken teklif dovizsiz kalirsa tercih Karisik e doner; $ yeniden gelince Tumu acilmaz', async ({ page }) => {
  const ICE = { fileName: 'iki.xlsx', multiSheetData: { sheets: [sayfa({ rowData: [SATIR, IKINCI_SATIR] })], brands: [] } };
  await ac(page, { iceAktarma: ICE });
  await fiyatYaz(page, '$12');
  await anahtar(page).getByRole('button', { name: 'TL' }).click();
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('₺480,00');
  // Tumu'de fiyat salt okunur: teklifi dovizsiz birakmanin yolu satiri silmek
  await page.locator('[row-index="0"] [col-id="col1"]').click({ button: 'right' });
  await page.getByRole('button', { name: /Satırı sil/ }).click();
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Küresel Vana DN50/);
  await expect(anahtar(page).getByRole('button')).toHaveText(['TL', 'USD', 'EUR']);
  await fiyatYaz(page, '$5');
  await expect(anahtar(page).getByRole('button', { name: 'Karışık' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText('$5,00');
});

test('Y13 ★★ "$12 ↓ 400": ilk $ alt satir sayisini degistirir — ikinci hucrenin editoru KESILMEZ', async ({ page }) => {
  const UC = [
    { ...SATIR, _matBirim: '100.0', _matToplam: '200.0' },
    { ...SATIR, _rowIdx: 1, col0: '2', col1: 'Küresel Vana DN50' },
    { ...SATIR, _rowIdx: 2, col0: '3', col1: 'Çekvalf DN40' },
  ];
  const ICE = { fileName: 'uc.xlsx', multiSheetData: { sheets: [sayfa({ rowData: UC })], brands: [] } };
  await ac(page, { iceAktarma: ICE });
  await page.locator('[row-index="1"] [col-id="_matBirim"]').dblclick();
  await expect(page.locator('.ag-cell-inline-editing input')).toBeVisible();
  await page.keyboard.type('$12');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('400', { delay: 40 });
  await page.keyboard.press('Enter');
  await expect(page.locator('[row-index="1"] [col-id="_matBirim"]')).toHaveText('$12,00');
  await expect(page.locator('[row-index="2"] [col-id="_matBirim"]')).toHaveText('₺400,00');
});
