/**
 * DWG metrajından teklif grid'ine geçişte kullanılan SABİT ŞEMA.
 *
 * NEDEN AYRI MODÜL: Bu şema quotes/new sayfasının içinde elle kuruluyken
 * İŞÇİLİK kolonları unutuldu (ikizi unutma: malzeme tarafı vardı, işçilik
 * tarafı yoktu). Kolon columnDefs'te tanımlı değilken ExcelGrid'in
 * `setDataValue` çağrısı SESSİZCE düşer — işçilik fiyatı hiç yazılmaz ve
 * hata da görünmez. Şema artık burada, testle mühürlü
 * (ozellik/teklif/dwg-teklif-sema.test.ts).
 *
 * Referans sözleşme: Excel yolunun sabit sistem kolonları
 * (app/dev/grid-test/page.tsx) — alan adları birebir aynı tutuldu ki
 * ExcelGrid'in marka/firma/kâr yazım yolları iki akışta da tek kod olsun.
 *
 * NOT: 'Birim Fiyat' ve 'Tutar' ALAN adları tarihsel (ilk DWG şemasından);
 * sessionStorage draft'ları ve kayıtlı teklif sheet'leri bu anahtarlarla
 * duruyor, yeniden adlandırmak eski taslakları kırar. Başlıklar ise
 * "Malz." önekiyle netleştirildi — yanına işçilik fiyat kolonları gelince
 * çıplak "Birim Fiyat" hangi fiyat, belli olmuyordu.
 */
import type { ColumnRoles, ExcelColumnDef } from '@/ozellik/tablo/excel-grid/types';

/** Veri satırlarının sistem alanı varsayılanları.
 *  ExcelGrid yazım yolları bunları okur/yazar:
 *   - marka fill: _matNetPrice, 'Birim Fiyat', 'Tutar' (roller üzerinden)
 *   - firma fill: _iscKar okur; _labNetPrice, _labBirim, _labToplam yazar
 *  Tümü '_' ile başlar: autoAppendRow "son satır dolu mu" kararını
 *  underscore'suz alanlardan verir — sistem alanları veri sayılmamalı. */
export const DWG_SISTEM_ALANLARI = {
  _malzKar: 0,
  _iscKar: 0,
  _marka: null as string | null,
  _firma: null as string | null,
  _matNetPrice: 0,
  _labNetPrice: 0,
  _labBirim: '',
  _labToplam: '',
  _toplam: '',
} as const;

export interface DwgTeklifSemasi {
  columnDefs: ExcelColumnDef[];
  columnRoles: ColumnRoles;
}

/** DWG akışının teklif grid şeması — kolonlar + roller tek yerden. */
export function dwgTeklifSemasi(): DwgTeklifSemasi {
  const columnDefs: ExcelColumnDef[] = [
    { field: 'Malzeme Cinsi', headerName: 'Malzeme Cinsi', width: 240, editable: true },
    { field: 'Çapı', headerName: 'Çapı', width: 90, editable: true },
    { field: 'Birim', headerName: 'Birim', width: 70, editable: true },
    { field: 'Miktar', headerName: 'Miktar', width: 90, editable: true },
    // ── MALZEME ──────────────────────────────────────────────
    { field: '_malzKar', headerName: 'Malz. Kar %', width: 90, editable: true },
    { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer' },
    { field: 'Birim Fiyat', headerName: 'Malz. Birim Fiyat', width: 110, editable: true },
    { field: 'Tutar', headerName: 'Malz. Toplam', width: 110 },
    // ── İŞÇİLİK (Excel yoluyla birebir aynı alan adları) ─────
    { field: '_iscKar', headerName: 'İşç. Kar %', width: 80, editable: true },
    { field: '_firma', headerName: 'İşç. Firma', width: 150, cellRenderer: 'firmaRenderer' },
    { field: '_labBirim', headerName: 'İşç. Birim Fiyat', width: 110, editable: true },
    { field: '_labToplam', headerName: 'İşç. Toplam', width: 110 },
    // ── GENEL ────────────────────────────────────────────────
    { field: '_toplam', headerName: 'Toplam', width: 120 },
  ];

  // nameField=Cins, diameterField=Çap: marka eşleştirme adı grid içinde
  // "Çap + Cins" (örn "Ø110 PVC BORU") olarak birleştirilir — cins tek
  // başına fiyat listesinde bulunamaz.
  const columnRoles: ColumnRoles = {
    nameField: 'Malzeme Cinsi',
    diameterField: 'Çapı',
    quantityField: 'Miktar',
    unitField: 'Birim',
    materialUnitPriceField: 'Birim Fiyat',
    materialTotalField: 'Tutar',
    laborUnitPriceField: '_labBirim',
    laborTotalField: '_labToplam',
    grandTotalField: '_toplam',
  };

  return { columnDefs, columnRoles };
}
