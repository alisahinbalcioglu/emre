// ────────────────────────────────────────────
// Kutuphane sentetik sheet uretici (Kutuphane Aktarim Sadakati L1/L2/L3)
// SAF fonksiyon — DB'siz test edilir (test/library-transfer-test.ts).
//
// L1: havuzdaki yapi BIREBIR — ayni kategori gruplari, ayni sira, ayni
//     alanlar (Cinsi/Cap yalniz veri varsa). Kutuphane yalniz Iskonto %/
//     Net Fiyat islevlerini EKLER (ExcelGrid library modu cizer).
// L2: kolon basligi satiri URUN DEGILDIR — sentetik header satiri artik
//     uretilmez ("No | Malzeme Adi | Birim" urun gibi gorunuyordu).
//     Kategori basliklari _isGroupRow bandi olarak cizilir, sayaca girmez.
// L3: kategori her data satirinda _groupKey olarak da tasinir (daralt/
//     genislet + grup bazli toplu iskonto icin).
// ────────────────────────────────────────────

export interface LibrarySheetItem {
  id: string;
  materialName: string | null;
  adRaw?: string | null;
  unit?: string | null;
  /** Gosterilecek liste fiyati (customPrice ?? listPrice — cagiran hesaplar) */
  listPrice: number;
  discountRate?: number | null;
  currency?: string | null;
  kategori?: string | null;
  cins?: string | null;
  cap?: string | null;
}

export interface LibrarySheet {
  columnDefs: { field: string; headerName: string; width: number; editable: boolean }[];
  columnRoles: { noField: string; nameField: string; unitField: string; materialUnitPriceField: string };
  rowData: any[];
}

export function buildLibrarySheetRows(items: LibrarySheetItem[]): LibrarySheet {
  const hasCins = items.some((i) => i.cins);
  const hasCap = items.some((i) => i.cap);

  // L1: havuz gorunumuyle ayni alan sirasi — No / Malzeme / (Cinsi) / (Cap) / Birim / Fiyat
  const columnDefs: LibrarySheet['columnDefs'] = [
    { field: 'col0', headerName: 'No', width: 60, editable: false },
    { field: 'col1', headerName: 'Malzeme Adi', width: 400, editable: true },
  ];
  if (hasCins) columnDefs.push({ field: 'col_cins', headerName: 'Cinsi', width: 160, editable: false });
  if (hasCap) columnDefs.push({ field: 'col_cap', headerName: 'Cap', width: 90, editable: false });
  columnDefs.push(
    { field: 'col2', headerName: 'Birim', width: 100, editable: true },
    { field: 'col3', headerName: 'Liste Fiyat', width: 130, editable: true },
  );

  const columnRoles = {
    noField: 'col0',
    nameField: 'col1',
    unitField: 'col2',
    materialUnitPriceField: 'col3',
  };

  const rowData: any[] = [];
  let rowIdx = 0;
  let dataNo = 0;
  let aktifKategori: string | null | undefined; // undefined = henuz baslamadi

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const kategori = item.kategori ?? null;

    // Kategori degisti → grup bandi (yalniz kategorisi OLAN gruplara)
    if (kategori !== aktifKategori) {
      aktifKategori = kategori;
      if (kategori) {
        // Ardisik ayni-kategori kosusunun uzunlugu (grup sayaci)
        let count = 0;
        for (let j = i; j < items.length && (items[j].kategori ?? null) === kategori; j++) count++;
        rowData.push({
          _rowIdx: rowIdx++,
          _isDataRow: false,
          _isHeaderRow: false,
          _isGroupRow: true,
          _groupLabel: kategori,
          _groupCount: count,
        });
      }
    }

    dataNo++;
    const row: any = {
      _rowIdx: rowIdx++,
      _isDataRow: true,
      _isHeaderRow: false,
      _libraryItemId: item.id,
      _libraryDiscountRate: item.discountRate ?? 0,
      // Z4: satirin para birimi — fiyat/net kolonlari kendi sembolunu basar
      _currency: item.currency ?? 'TRY',
      // L3: grup uyeligi (daralt/genislet + grup bazli toplu iskonto)
      _groupKey: kategori ?? '',
      col0: String(dataNo),
      // Y3 ikizi: kaynak metin BIREBIR (adRaw varsa o gosterilir)
      col1: item.adRaw ?? item.materialName ?? '',
      col2: item.unit ?? 'Adet',
      col3: item.listPrice,
    };
    if (hasCins) row.col_cins = item.cins ?? '';
    if (hasCap) row.col_cap = item.cap ?? '';
    rowData.push(row);
  }

  return { columnDefs, columnRoles, rowData };
}
