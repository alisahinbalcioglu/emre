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
  /** K1 ayrismis fiyat (tur 3 A4c) — `havuzFiyatAyrisimi`; yoksa null/undefined. */
  fiyatAyrisik?: { ozel: number; havuz: number } | null;
}

/** Satirin havuz iliskisi (UserLibrary + `product` / `sourcePriceList` include'lari). */
export interface HavuzBagi {
  customPrice?: number | null;
  listPrice?: number | null;
  productIndexId?: string | null;
  sourcePriceList?: { ownerUserId?: string | null; ownerFirmaId?: string | null } | null;
  product?: { ownerUserId?: string | null; ownerFirmaId?: string | null } | null;
}

/**
 * K1 AYRISMIS FIYAT (tur 3 A4c, 14.09) — HAVUZA BAGLI satirda ozel fiyat (C)
 * liste fiyatindan (L) FARKLI. Migration 20260914180000_k1_donmus_ozel_fiyat'in
 * "ayrismis" tanimiyla AYNI: kaynak fiyat listesi sahipsiz (havuz) VE urun
 * indeksi yok ya da sahipsiz; C ve L dolu; |C − L| >= 1e-6. Kisisel liste ve
 * yetim satir havuza bagli DEGILDIR (indeksi sahipli ama listesi sahipsiz eski
 * kisisel liste de degil). Hangisinin gecerli oldugu TAHMIN EDILMEZ: havuz
 * guncellenip yeniden aktarilmis ve ozel fiyat eski havuz fiyatinda donmus
 * olabilir — ya da kullanici bilerek yazmistir. Ekran iki fiyati isaretle
 * gosterir, karar kullanicinin.
 */
export function havuzFiyatAyrisimi(s: HavuzBagi): { ozel: number; havuz: number } | null {
  const liste = s.sourcePriceList;
  if (!liste || liste.ownerUserId != null || liste.ownerFirmaId != null) return null;
  if (s.productIndexId != null && (!s.product || s.product.ownerUserId != null || s.product.ownerFirmaId != null)) return null;
  if (s.customPrice == null || s.listPrice == null) return null;
  if (Math.abs(s.customPrice - s.listPrice) < 0.000001) return null;
  return { ozel: s.customPrice, havuz: s.listPrice };
}

export interface LibrarySheet {
  columnDefs: { field: string; headerName: string; width: number; editable: boolean }[];
  columnRoles: { noField: string; nameField: string; unitField: string; materialUnitPriceField: string };
  rowData: any[];
}

export function buildLibrarySheetRows(items: LibrarySheetItem[]): LibrarySheet {
  // TEK TIP DUZEN: TUM markalar ayni kolon setini gosterir (kullanici istegi —
  // olusturulan marka ile iceri aktarilan marka birebir ayni gorunur). Bos olsa
  // bile Cinsi/Baglanti/Cap/Boy/Urun Kodu/Not kolonlari cizilir.
  //
  // Yapisal kolonlar (cins/baglanti/cap/boy/kod/not) editable=false: mevcut
  // satirlarda salt-okunur. FE (marka-detay) YENI (bos) satirlar icin bunlari
  // editable yapar (inline malzeme girisi). Ad/Birim/Fiyat her zaman editable
  // (save-sheets bunlari kalici yazar).
  const columnDefs: LibrarySheet['columnDefs'] = [
    { field: 'col0', headerName: 'No', width: 60, editable: false },
    { field: 'col1', headerName: 'Malzeme Adı', width: 400, editable: true },
    { field: 'col_cins', headerName: 'Cinsi', width: 160, editable: false },
    { field: 'col_baglanti', headerName: 'Bağlantı Şekli', width: 130, editable: false },
    { field: 'col_cap', headerName: 'Çap', width: 90, editable: false },
    { field: 'col_boy', headerName: 'Boy (mm)', width: 90, editable: false },
    { field: 'col_kod', headerName: 'Ürün Kodu', width: 120, editable: false },
    { field: 'col_not', headerName: 'Not', width: 200, editable: false },
    { field: 'col2', headerName: 'Birim', width: 100, editable: true },
    { field: 'col3', headerName: 'Liste Fiyat', width: 130, editable: true },
  ];

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
      // TEK TIP: yapisal kolonlar her satirda (bos olsa da) — kolon setiyle esles
      col_cins: item.cins ?? '',
      col_baglanti: item.baglanti ?? '',
      col_cap: item.cap ?? '',
      col_boy: item.boy ?? '',
      col_kod: item.urunKodu ?? '',
      col_not: item.not ?? '',
      // K1 (tur 3 A4c): ozel fiyat havuz liste fiyatindan ayrismis — ekran isaretler
      ...(item.fiyatAyrisik ? { _fiyatAyrisik: item.fiyatAyrisik } : {}),
    };
    rowData.push(row);
  }

  return { columnDefs, columnRoles, rowData };
}
