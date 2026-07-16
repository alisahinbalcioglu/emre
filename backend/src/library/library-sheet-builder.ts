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
  // 16.07: Excel'in KALAN kolonlari (ProductIndex'ten) — dolu olan gorunur
  baglanti?: string | null;
  boy?: number | null;
  urunKodu?: string | null;
  not?: string | null;
}

export interface LibrarySheet {
  columnDefs: { field: string; headerName: string; width: number; editable: boolean }[];
  columnRoles: { noField: string; nameField: string; unitField: string; materialUnitPriceField: string };
  rowData: any[];
}

export function buildLibrarySheetRows(items: LibrarySheetItem[]): LibrarySheet {
  const hasCins = items.some((i) => i.cins);
  const hasCap = items.some((i) => i.cap);
  const hasBaglanti = items.some((i) => i.baglanti);
  const hasBoy = items.some((i) => i.boy != null);
  const hasKod = items.some((i) => i.urunKodu);
  const hasNot = items.some((i) => i.not);

  // L1: havuz gorunumuyle ayni alan sirasi — No / Malzeme / (Cinsi) /
  // (Baglanti) / (Cap) / (Boy) / (Kod) / (Not) / Birim / Fiyat.
  // Kod+Not BILEREK Birim'den ONCE: ExcelGrid library modu Iskonto/Net'i
  // fiyatin ARKASINA cizer — fiyat blogu bolunmesin.
  const columnDefs: LibrarySheet['columnDefs'] = [
    { field: 'col0', headerName: 'No', width: 60, editable: false },
    { field: 'col1', headerName: 'Malzeme Adi', width: 400, editable: true },
  ];
  if (hasCins) columnDefs.push({ field: 'col_cins', headerName: 'Cinsi', width: 160, editable: false });
  if (hasBaglanti) columnDefs.push({ field: 'col_baglanti', headerName: 'Bağlantı Şekli', width: 130, editable: false });
  if (hasCap) columnDefs.push({ field: 'col_cap', headerName: 'Cap', width: 90, editable: false });
  if (hasBoy) columnDefs.push({ field: 'col_boy', headerName: 'Boy (mm)', width: 90, editable: false });
  if (hasKod) columnDefs.push({ field: 'col_kod', headerName: 'Ürün Kodu', width: 120, editable: false });
  if (hasNot) columnDefs.push({ field: 'col_not', headerName: 'Not', width: 200, editable: false });
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
    if (hasBaglanti) row.col_baglanti = item.baglanti ?? '';
    if (hasCap) row.col_cap = item.cap ?? '';
    if (hasBoy) row.col_boy = item.boy ?? '';
    if (hasKod) row.col_kod = item.urunKodu ?? '';
    if (hasNot) row.col_not = item.not ?? '';
    rowData.push(row);
  }

  return { columnDefs, columnRoles, rowData };
}
