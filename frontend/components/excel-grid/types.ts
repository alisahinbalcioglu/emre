export interface ExcelColumnDef {
  field: string;
  headerName: string;
  width?: number;
  editable?: boolean;
  cellRenderer?: string;
  pinned?: 'left' | 'right';
  suppressMovable?: boolean;
}

export interface ExcelRowData {
  [key: string]: any;
  _rowIdx: number;
  _isDataRow: boolean;
  _isHeaderRow: boolean;
  _malzKar?: number;
  _iscKar?: number;
  _marka?: string | null;
  _firma?: string | null;
  _matNetPrice?: number;
  _merges?: Record<string, { rowSpan?: number; colSpan?: number; hidden?: boolean }>;
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
}
