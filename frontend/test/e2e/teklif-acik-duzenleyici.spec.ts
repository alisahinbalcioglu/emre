/**
 * TEKLIF — ACIK DUZENLEYICIDEKI DEGER KAYITTA / SEKME DEGISIMINDE KAYBOLMAZ
 * (05.10, koordinator karari).
 *
 * OLCULDU (gercek Chromium, insan hizi 80-150 ms): son satirda "300 ↓ 400 Enter"
 * akisinda 150'de 4 kez duzenleyici Enter'dan sonra ACIK, icinde "400", odak
 * ONDA DEGIL kaldi; baska hucreye tiklamak da islemedi. /quotes/new kayit yolu
 * satirlari `getRowData()` ile okuyordu ama ONCESINDE `stopEditing()`
 * CAGIRMIYORDU (ikizleri — kutuphane marka sayfasi, iscilik firmasi —
 * cagiriyor): duzenleyicide kalan deger teklife GITMIYORDU.
 *
 * ⚠ YETIM DUZENLEYICI YENIDEN URETILEMEDI (sonraki 750 denemede 0). Odagi izgara
 * DISINA tasimak (`stopEditingWhenCellsLoseFocus`) normal duzenleyiciyi zaten
 * isliyor. Bu kapi MEKANIZMAYI olcer: eylem duzenleyici ACIKKEN, odak
 * TASINMADAN tetiklenir (JS `button.click()` odagi tasimaz). Kayit / sekme
 * degisimi satirlari duzenleme BITIRILMEDEN okursa yazilan deger kaybolur.
 *
 * Ag kesik (`/api/**` → `{}`; POST /api/quotes yakalanir), oturum bicim
 * kapisindan gecer (coklu-para-birimi-kayit.spec.ts ile ayni kalip).
 */
import { test, expect, Page } from '@playwright/test';
import { TASLAK_ANAHTARI, TASLAK_SURUMU } from '../../ozellik/teklif/taslak';

const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.imzaYok_test';

const ROLLER = {
  nameField: 'col1', noField: 'col0', quantityField: 'col2', unitField: 'col3',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  grandTotalField: '_toplam',
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

const satir = (i: number, ad: string, mik: string, fiyat: string) => ({
  _rowIdx: i, _isDataRow: true, _isHeaderRow: false,
  _malzKar: 0, _iscKar: 0, _marka: null, _firma: null,
  _matNetPrice: Number(fiyat), _labNetPrice: 10, _merges: {},
  col0: String(i), col1: ad, col2: mik, col3: 'mt',
  _matBirim: fiyat, _matToplam: String(Number(fiyat) * Number(mik)),
  _labBirim: '10', _labToplam: String(10 * Number(mik)), _toplam: '',
});

const TASLAK = {
  v: TASLAK_SURUMU,
  multiSheet: {
    sheets: [{
      name: 'Mekanik', index: 0, isEmpty: false, headerEndRow: 0,
      columnDefs: KOLONLAR, columnRoles: ROLLER, brands: [],
      rowData: [satir(1, 'Kelebek Vana DN65', '10', '100'), satir(2, 'Küresel Vana DN25', '4', '50')],
    }, {
      name: 'Elektrik', index: 1, isEmpty: false, headerEndRow: 0,
      columnDefs: KOLONLAR, columnRoles: ROLLER, brands: [],
      rowData: [satir(1, 'Kablo NYM 3x2,5', '100', '25')],
    }],
    brands: [],
  },
  activeSheetIndex: 0, sheetDisciplines: { 0: 'mechanical', 1: 'electrical' }, title: 'Açık düzenleyici',
  allBrands: [], colHiddenBySheet: {}, colWidthsBySheet: {}, colFloorsBySheet: {},
};

async function ac(page: Page): Promise<{ govdeler: any[] }> {
  const govdeler: any[] = [];
  await page.route('**/api/**', async (route) => {
    const istek = route.request();
    if (istek.method() === 'POST' && /\/api\/quotes\/?$/.test(istek.url())) {
      govdeler.push(istek.postDataJSON());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'q-acik' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(
    ([jeton, anahtar, veri]) => {
      localStorage.setItem('token', jeton as string);
      localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z', tier: 'pro' }));
      if (!sessionStorage.getItem(anahtar as string)) sessionStorage.setItem(anahtar as string, veri as string);
    },
    [JETON, TASLAK_ANAHTARI, JSON.stringify(TASLAK)] as const,
  );
  await page.goto('/quotes/new');
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Kelebek Vana DN65/, { timeout: 30_000 });
  return { govdeler };
}

/** Fiyat hucresinde duzenleyiciyi acar, 777 yazar; duzenleyici ACIK kalir. */
async function duzenleyiciAcik(page: Page) {
  await page.locator('[row-index="0"] [col-id="_matBirim"]').dblclick();
  const girdi = page.locator('.ag-cell-inline-editing input');
  await expect(girdi).toBeVisible();
  await girdi.fill('777');
  // FIKSTUR KANITI: duzenleyici acik, deger yalniz ONDA (satira islenmemis)
  await expect(page.locator('.ag-cell-inline-editing')).toHaveCount(1);
  await expect(girdi).toHaveValue('777');
}

/** Dugmeyi ODAK TASIMADAN tetikler (JS click) — duzenleyici acik kalir. */
async function odaksizTikla(page: Page, ad: RegExp) {
  await page.getByRole('button', { name: ad }).evaluate((el) => (el as HTMLButtonElement).click());
}

test('AD1 ★ duzenleyici ACIKKEN "Teklifi Kaydet": yazilan deger kayda gider', async ({ page }) => {
  const { govdeler } = await ac(page);
  await duzenleyiciAcik(page);
  await odaksizTikla(page, /Teklifi Kaydet/);
  await expect.poll(() => govdeler.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const satirlar = govdeler[0].sheets[0].rowData as Array<Record<string, unknown>>;
  expect(String(satirlar.find((r) => r.col1 === 'Kelebek Vana DN65')?._matBirim)).toMatch(/^777/);
});

test('AD2 ★ duzenleyici ACIKKEN sayfa sekmesi degisir: yazilan deger kaybolmaz', async ({ page }) => {
  await ac(page);
  await duzenleyiciAcik(page);
  await odaksizTikla(page, /Elektrik/);
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Kablo/);
  await page.getByRole('button', { name: /Mekanik/ }).click();
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Kelebek Vana DN65/);
  await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText(/777/);
});
