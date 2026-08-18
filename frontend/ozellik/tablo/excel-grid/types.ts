export interface ExcelColumnDef {
  field: string;
  headerName: string;
  width?: number;
  editable?: boolean;
  cellRenderer?: string;
  pinned?: 'left' | 'right';
  suppressMovable?: boolean;
  // PRD v3.0 Bolum A: sutun gizle/goster — hide=true ise AG-Grid kolonu cizmez
  // (VERI DURUR, toplama dahil kalir; "kaldir"dan farkli).
  hide?: boolean;
  /** GS8: uzun malzeme adlari kesilmez — hucre sarar + tooltip */
  wrapText?: boolean;
}

export interface ExcelRowData {
  [key: string]: any;
  _rowIdx: number;
  _isDataRow: boolean;
  _isHeaderRow: boolean;
  /**
   * Kâr yüzdeleri. ⚠ TİP BİLEREK `number | string`: bu alanlar ÇALIŞMA
   * ZAMANINDA STRING OLABİLİR ve tip bunu daha önce YALAN söylüyordu.
   *
   * Kolonda `cellRenderer` var → AG-Grid `cellDataType` çıkarımını kapatır,
   * sayı `valueParser`'ı enjekte edilmez; kullanıcı hücreye "50" yazınca
   * değer STRING olarak saklanır. `_malzKar?: number` diyen tip yüzünden
   * okuma noktaları güvenle `r._malzKar || 0` yazıyordu ve `"50" || 0`
   * string'i aynen geçiriyordu → 12.08'de canlıda HTTP 400 (@IsNumber).
   * Derleyici uyarmadı çünkü okuma noktalarının satır tipi `any` idi.
   *
   * KURAL: bu iki alan HER OKUNDUĞUNDA `sayiAlani()` (ozellik/fiyat/sayi-alani)
   * süzgecinden geçer — ekranın hesabı ile kaydedilen değer ayrışmasın.
   */
  _malzKar?: number | string;
  _iscKar?: number | string;
  _marka?: string | null;
  _firma?: string | null;
  /**
   * İCMAL (özet) sayfasından gelen satır. Backend `standart-sema.ts:244`
   * üretir: sayfada miktar/birim kaynak kolonu yoksa sayfa özet sayılır,
   * satırlar `_isDataRow=true` KALIR ama para YALNIZ genel toplam hücresinde
   * durur. Bu satırlar fiyatlandırılamaz — `pricing.ts:318` toplama almaz
   * (30.07 çift-sayım yasağı), ExcelGrid marka/firma açılırı yerine gri
   * "özet" yazar, `uyariyaGirerMi` fiyatsız uyarısından dışlar.
   * ⚠ Alan çalışma zamanında VARDI ama hiçbir tipte İLAN EDİLMEMİŞTİ.
   */
  _ozet?: boolean;
  _matNetPrice?: number;
  _merges?: Record<string, { rowSpan?: number; colSpan?: number; hidden?: boolean }>;
  /** Excel-vari GRUP BANDI satiri (orn "Hat / Sistem" basligi). Full-width
   *  render edilir, edit/toplam/kayit disindadir (_isDataRow=false ile). */
  _isGroupRow?: boolean;
  _groupLabel?: string;
  _groupCount?: number;
  /** En alttaki her-zaman-bos satir — kullanici yazinca gercek satira donusur
   *  ve yenisi eklenir. Kayitta filtrelenir. */
  _isSpareRow?: boolean;
  /** V4 (PRD v1.3): satirin varyant durumu — 'auto' = grup seciminden otomatik
   *  atandi (grup degisirse guncellenir), 'manuel' = kullanici secti (uzerine
   *  YAZILMAZ, V4.2). Bos = henuz varyant karari yok. */
  _matVariantMode?: 'auto' | 'manual';
  /** V4.1 rozeti: otomatik atanan varyantin etiketi ("Kırmızı Boyalı") */
  _matAutoVariant?: string | null;
}

export interface ColumnRoles {
  noField?: string;
  nameField?: string;
  brandField?: string;
  quantityField?: string;
  unitField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
  laborUnitPriceField?: string;
  laborTotalField?: string;
  grandUnitPriceField?: string;
  grandTotalField?: string;
  /** "Çapı" sutunu (DWG akisi). Varsa eslestirme/kayit adi = Çap + Cins birlesimi. */
  diameterField?: string;
}

export interface ExcelGridData {
  columnDefs: ExcelColumnDef[];
  rowData: ExcelRowData[];
  columnRoles: ColumnRoles;
  brands: Array<{ id: string; name: string }>;
  headerEndRow: number;
}

export interface SheetData {
  name: string;
  index: number;
  columnDefs: ExcelColumnDef[];
  rowData: ExcelRowData[];
  columnRoles: ColumnRoles;
  headerEndRow: number;
  isEmpty: boolean;
  discipline?: 'mechanical' | 'electrical' | null;
}

export interface MultiSheetData {
  sheets: SheetData[];
  brands: Array<{ id: string; name: string }>;
}

export interface MatchCandidate {
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
  tags: string[];
  popular: boolean;
  label: string;
  surfaceLevel: boolean;
  // V4: adayi kardeslerinden ayiran anlamli tag'ler (grup varyant kimligi)
  variantTags?: string[];
  // V5: hesabin gecmis tercihi — liste basinda on-secili gosterilir
  preferred?: boolean;
  // E3 (Boru Disi Kalemler PRD): istenen nitelikten farkli deger tasiyan aday
  // isaretlenir ("68°C istendi — bu ürün 141°C")
  uyari?: string;
}

// M3: secilen markada urun yok — alternatif marka onerisi (marka+fiyat birlikte secilir)
export interface BrandAlternative {
  brandId: string;
  brandName: string;
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
  // N5-lite: kesif dosyasindaki "MARKA VEYA MUADILI" metnine uyan marka (★ onde)
  onerilen?: boolean;
  // S2: bu oneri KESIN DEGIL — backend'de aday, ana ekranda otomatik yazimi
  // engelleyen I6 kapisindan gecemedi ve gerekcesini beraberinde tasiyor.
  // Bos ise oneri kesindir. (backend BrandAlternative ile AYNI alanlar.)
  uyariNot?: string;
  // S2: satirda yazili ama o markanin/firmanin dagarciginda bulunmayan kelimeler
  bilinmeyen?: string[];
}

/**
 * IZGARA SATIR YUKSEKLIGI (px) — TEK KAYNAK.
 *
 * ⚠ 14.08'e kadar bu deger IKI YERDE ayri ayri sabitti: AG-Grid'e verilen
 * `rowHeight={28}` (ExcelGrid.tsx) ve surukle-doldur'un hedef satiri hesabi
 * `const rowHeight = 28` (useFillHandle.tsx). Ikisi paylasilmiyordu.
 *
 * Neden tehlikeli: surukleme hedefi `Math.floor(relativeY / rowHeight)` ile
 * bulunur. Biri degistirilip digeri unutulsaydi surukleme YANLIS SATIRLARA
 * marka/iskonto/kar doldururdu — hata gorunur bir cokme degil, SESSIZ bir
 * kaydirma olurdu: kullanici 10 satir surukler, deger 9. veya 11. satirdan
 * baslardi ve o satirlarin fiyati yeniden hesaplanirdi. Bu projede satir
 * yuksekligi bir GORSEL tercih degil, PARA yolunun girdisidir.
 */
/* 19.08 hedef tasarim (%100 istegi): 28 → 40. Cipler 27-29px oldugu icin 28'de
   hucreye yapisiyordu; teslim edilen onizlemede satir ritmi ~40px olculdu
   (6px dikey dolgu + cip). ⚠ TEK KAYNAK: AG Grid rowHeight VE surukle-doldur
   geometrisi (useFillHandle `Math.floor(relativeY / SATIR_YUKSEKLIGI)`) buradan
   okur — birlikte kayarlar. e2e-golden/helpers.ts:20'deki ROW_H kopyasi AYNI
   commit'te esitlendi; o dosya bu sabiti import EDEMIYOR (Playwright paketi). */
export const SATIR_YUKSEKLIGI = 40;
