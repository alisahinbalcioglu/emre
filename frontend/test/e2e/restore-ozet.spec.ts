/**
 * D8 (30.09, P2) — GERİ YÜKLEME SONRASI ÖZET ŞERİDİ BAYAT KALIYOR
 *
 * Sayfa yenilenince (ya da kayıtlı teklif yeniden açılınca) taslak geri
 * yüklenir; 500 ms sonra `restoreRematch` markası atanmış ama fiyatı kayıp
 * satırları kütüphaneye sorar ve fiyatı SATIR NESNESİNE YERİNDE yazar. Sonra
 * sayfa `setLiveRowDataBySheet({ ...live })` çağırır — DIŞ obje yeni, İÇ DİZİ
 * AYNI referans.
 *
 * ExcelGrid'in alt sabit şeridini (GENEL TOPLAM + KÂR) tazeleyen TEK efekt
 * `[data.rowData, updatePinnedBottom]`a bağlı; iç dizi değişmediği için efekt
 * KOŞMAZ. Sonuç: satırlarda yeni fiyat görünür, ama GENEL TOPLAM mount anındaki
 * (fiyatsız) rakamda donar. Kullanıcı teklifin büyüklüğüne bakıp kâr/indirim
 * kararı veriyorsa YANLIŞ rakama bakar.
 *
 * Para KAYDA yanlış gitmez (pinned satır rowData'ya ve çıktıya YAPISAL olarak
 * giremez) — kusur ekran katmanında. Ama "ekranda gördüğün ≠ gerçek" sınıfı.
 *
 * GERÇEK `/quotes/new` sayfası ölçülür (restore kodu yalnız orada). Fikstür
 * kurgusu `taslak-fiyat-yazimi.spec.ts` ile aynı: (protected) kapısı istemci
 * tarafı, `/api/**` kesilir; burada ayrıca `matching/bulk-match` fiyat döner.
 */
import { test, expect, Page } from '@playwright/test';
import { TASLAK_ANAHTARI, TASLAK_SURUMU } from '../../ozellik/teklif/taslak';

const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.imzaYok_test';
const AD = 'Siyah Boru DN25';

const ROLLER = {
  nameField: 'col1', noField: 'col0', quantityField: 'col2', unitField: 'col3',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  grandTotalField: '_toplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};

// ⚠ brandRenderer/firmaRenderer kolonu YOK — `allBrands: []` ile grid altağacını
// düşürüyor (taslak-fiyat-yazimi.spec.ts'te ölçüldü). `restoreRematch` markayı
// satır verisinden (`_marka`) okur, kolona ihtiyacı yoktur.
const KOLONLAR = [
  { field: 'col0', headerName: 'No', width: 60, editable: true },
  { field: 'col1', headerName: 'Malzeme Adı', width: 260, editable: true },
  { field: 'col2', headerName: 'Miktar', width: 80, editable: true },
  { field: 'col3', headerName: 'Birim', width: 70, editable: true },
  { field: '_malzKar', headerName: 'Malz. Kar %', width: 85, editable: true },
  { field: '_matBirim', headerName: 'Malz. Birim Fiyat', width: 120, editable: true },
  { field: '_matToplam', headerName: 'Malz. Toplam', width: 120, editable: false },
  { field: '_toplam', headerName: 'Toplam', width: 120, editable: false },
];

/** Markası atanmış, fiyatı KAYIP satır — restore'un tamamlayacağı tam durum. */
const satir = () => ({
  _rowIdx: 1, _isDataRow: true, _isHeaderRow: false,
  _malzKar: 0, _iscKar: 0, _marka: 'B1', _firma: null,
  _matNetPrice: 0, _labNetPrice: 0, _merges: {},
  col0: '1', col1: AD, col2: '10', col3: 'mt',
  _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '', _toplam: '',
});

const taslak = () => ({
  v: TASLAK_SURUMU,
  multiSheet: {
    sheets: [{
      name: 'Mekanik', index: 0, isEmpty: false, headerEndRow: 0,
      columnDefs: KOLONLAR, columnRoles: ROLLER, brands: [],
      rowData: [satir()],
    }],
    brands: [],
  },
  activeSheetIndex: 0, sheetDisciplines: { 0: 'mechanical' }, title: 'D8 ölçümü',
  allBrands: [], colHiddenBySheet: {}, colWidthsBySheet: {}, colFloorsBySheet: {},
});

async function ac(page: Page) {
  // ⚠ Playwright eşleşen route'ları KAYIT SIRASININ TERSİNE koşar: genel kesici
  // ÖNCE, özel `bulk-match` SONRA kaydedilir ki özel olan kazansın.
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/matching/bulk-match', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ [AD]: { netPrice: 100, confidence: 'high' } }),
  }));
  await page.addInitScript(([j, k, v]) => {
    localStorage.setItem('token', j as string);
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z', tier: 'pro' }));
    // Tek seferlik tohum: addInitScript yenilemede de koşar (D5 dersi).
    if (!sessionStorage.getItem(k as string)) sessionStorage.setItem(k as string, v as string);
  }, [JETON, TASLAK_ANAHTARI, JSON.stringify(taslak())] as const);
  await page.goto('/quotes/new');
  await expect(page.locator('[row-index="0"] [col-id="col1"]')).toHaveText(new RegExp(AD), { timeout: 30_000 });
}

/** Grid'i en sağa kaydırır (fiyat/toplam kolonları ilk çizimde DOM'da değil). */
async function sagaKaydir(page: Page) {
  await page.locator('.ag-center-cols-viewport').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  // Alt sabit şeridin kendi kaydırma kabı var; aynı konuma getir.
  await page.locator('.ag-floating-bottom-viewport, .ag-floating-bottom .ag-center-cols-viewport')
    .first().evaluate((el) => { (el as HTMLElement).scrollLeft = (el as HTMLElement).scrollWidth; })
    .catch(() => { /* kap yoksa grid tek kaydirma kabi kullaniyor */ });
}

/** Alt sabit şeridin GENEL TOPLAM hücresi (pinned bottom ilk satır = "b-0"). */
const genelToplam = (page: Page) =>
  page.locator('.ag-floating-bottom [row-index="b-0"] [col-id="_toplam"]');

test.describe('D8 — geri yükleme sonrası özet şeridi', () => {
  test('★ FİKSTÜR KANITI: restore satıra fiyatı GERÇEKTEN yazdı', async ({ page }) => {
    // Bu olmadan aşağıdaki test "özet tazelenmedi" diye yanlış sebepten
    // kırmızı yanabilirdi: restore hiç koşmamışsa özet zaten doğru boştur.
    await ac(page);
    await sagaKaydir(page);
    await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText(/100/, { timeout: 10_000 });
    await expect(page.locator('[row-index="0"] [col-id="_toplam"]')).toHaveText(/1\.000/, { timeout: 10_000 });
  });

  test('★★ GENEL TOPLAM şeridi restore\'un yazdığı fiyatı İÇERİR (bayat kalmaz)', async ({ page }) => {
    await ac(page);
    await sagaKaydir(page);
    await expect(page.locator('[row-index="0"] [col-id="_matBirim"]')).toHaveText(/100/, { timeout: 10_000 });
    // Kusurlu hâlde: şerit mount anındaki (fiyatsız) rakamda donuyordu.
    await expect(genelToplam(page), 'özet şeridi bayat').toHaveText(/1\.000/, { timeout: 10_000 });
  });
});
