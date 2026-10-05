/**
 * COKLU PARA BIRIMI F4 (Emre karari 04.10) — GERCEK /quotes/new sayfasi
 * karisik kipi KAYITTAN (taslaktan) turetir.
 *
 * Kayitta ayri kip alani YOK: karisik kip her fiyat yaziminda tarafin birimini
 * (`_matPB`/`_labPB`) yazar, tl kipi hic yazmaz. Taraf birimi tasiyan taslak
 * acildiginda sayfa izgarayi karisik kipte acmali — yoksa dovizli satir ₺
 * sembolüyle, dolar liraya eklenmis toplamlarla gorunurdu.
 *
 * Ag kesik (`/api/**` → `{}`), oturum bicim kapisindan gecer (taslak-fiyat-
 * yazimi.spec.ts ile ayni kalip).
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

const satir = (i: number, ad: string, mik: string, ek: Record<string, unknown> = {}) => ({
  _rowIdx: i, _isDataRow: true, _isHeaderRow: false,
  _malzKar: 0, _iscKar: 0, _marka: null, _firma: null,
  _matNetPrice: 0, _labNetPrice: 0, _merges: {},
  col0: String(i), col1: ad, col2: mik, col3: 'mt',
  _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '', _toplam: '',
  ...ek,
});

function taslak(karisik: boolean) {
  const usd = karisik
    ? { _matBirim: '10.50', _matToplam: '105.00', _matNetPrice: 10.5, _matPB: 'USD', _matKurBilgi: { currency: 'USD', kur: 40, tarih: '2026-10-05' } }
    : { _matBirim: '420.0', _matToplam: '4200.0', _matNetPrice: 420 };
  const tl = karisik ? { _matBirim: '100.0', _matToplam: '400.0', _matNetPrice: 100, _matPB: 'TRY' } : { _matBirim: '100.0', _matToplam: '400.0', _matNetPrice: 100 };
  const sheet = {
    name: 'Mekanik', index: 0, isEmpty: false, headerEndRow: 0,
    columnDefs: KOLONLAR, columnRoles: ROLLER, brands: [],
    rowData: [satir(1, 'Kelebek Vana DN65', '10', usd), satir(2, 'Küresel Vana DN25', '4', tl)],
  };
  return {
    v: TASLAK_SURUMU,
    multiSheet: { sheets: [sheet], brands: [] },
    activeSheetIndex: 0, sheetDisciplines: { 0: 'mechanical' }, title: 'F4 ölçümü',
    allBrands: [], colHiddenBySheet: {}, colWidthsBySheet: {}, colFloorsBySheet: {},
  };
}

async function ac(page: Page, karisik: boolean) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(
    ([jeton, anahtar, veri]) => {
      localStorage.setItem('token', jeton as string);
      localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z', tier: 'pro' }));
      if (!sessionStorage.getItem(anahtar as string)) sessionStorage.setItem(anahtar as string, veri as string);
    },
    [JETON, TASLAK_ANAHTARI, JSON.stringify(taslak(karisik))] as const,
  );
  await page.goto('/quotes/new');
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(/Kelebek Vana DN65/, { timeout: 30_000 });
  // Fiyat kolonlari yatay sanallastirmada ilk cizimde DOM'da olmayabilir.
  await page.locator('.ag-center-cols-viewport').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
}

const hucre = (page: Page, row: number | string, col: string) => page.locator(`[row-index="${row}"] [col-id="${col}"]`);

async function altSatirMetni(page: Page, ad: string, col: string): Promise<string | null> {
  return page.evaluate(([aranan, kolon]) => {
    const satirlar = Array.from(document.querySelectorAll('.ag-floating-bottom [row-index]'));
    const id = satirlar.find((el) => (el.querySelector('[col-id="col1"]')?.textContent ?? '').trim() === aranan)?.getAttribute('row-index');
    if (!id) return null;
    return document.querySelector(`.ag-floating-bottom [row-index="${id}"] [col-id="${kolon}"]`)?.textContent ?? null;
  }, [ad, col] as const);
}

test.describe('F4 — /quotes/new karisik kipi taslaktan turetir', () => {
  test('★★ taraf birimli taslak KARISIK acilir: dolar satiri $, toplamlar birim basina', async ({ page }) => {
    await ac(page, true);
    await expect(hucre(page, 0, '_matBirim')).toHaveText('$10,50');
    await expect(hucre(page, 1, '_matBirim')).toHaveText('₺100,00');
    await expect.poll(() => altSatirMetni(page, 'GENEL TOPLAM $', '_matToplam'), { timeout: 10_000 }).toBe('$105,00');
    expect(await altSatirMetni(page, 'GENEL TOPLAM ₺', '_matToplam')).toBe('₺400,00');
  });

  test('★ KONTROL: birim alani olmayan (eski/yalniz-TL) taslak tl acilir', async ({ page }) => {
    await ac(page, false);
    await expect(hucre(page, 0, '_matBirim')).toHaveText('₺420,00');
    await expect.poll(() => altSatirMetni(page, 'GENEL TOPLAM', '_matToplam'), { timeout: 10_000 }).toBe('₺4.600,00');
  });
});
