import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { detectSheetDiscipline } from './sheet-discipline';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface ColumnDef {
  field: string;
  headerName: string;
  width?: number;
  editable?: boolean;
  cellRenderer?: string;
  pinned?: 'left' | 'right';
  suppressMovable?: boolean;
  // Merge cell destegi icin
  colSpan?: number;
  rowSpan?: number;
}

export interface RowData {
  [key: string]: any;
  _rowIdx: number;
  _isDataRow: boolean;
  _isHeaderRow: boolean;
  _malzKar?: number;
  _iscKar?: number;
  _marka?: string | null;
  _firma?: string | null;
  _matNetPrice?: number;
  // Her hucrenin merge bilgisi icin
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

export interface GridPreparedData {
  columnDefs: ColumnDef[];
  rowData: RowData[];
  columnRoles: ColumnRoles;
  brands: Array<{ id: string; name: string }>;
  headerEndRow: number;
}

export interface SheetData {
  name: string;
  index: number;
  columnDefs: ColumnDef[];
  rowData: RowData[];
  columnRoles: ColumnRoles;
  headerEndRow: number;
  isEmpty: boolean;
  discipline: 'mechanical' | 'electrical' | null; // otomatik tespit, null = bilinmiyor
}

export interface MultiSheetData {
  sheets: SheetData[];
  brands: Array<{ id: string; name: string }>;
}

// ────────────────────────────────────────────
// Service
// ────────────────────────────────────────────

@Injectable()
export class ExcelGridService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(fileBuffer: Buffer, opts?: { stripPrices?: boolean }): Promise<MultiSheetData> {
    const stripPrices = opts?.stripPrices ?? false;
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true });
    } catch (e) {
      throw new BadRequestException('Excel dosyasi okunamadi: ' + (e as Error).message);
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new BadRequestException('Excel dosyasinda sayfa bulunamadi.');
    }

    const sheets: SheetData[] = [];
    const usedNames = new Set<string>();

    for (let i = 0; i < workbook.SheetNames.length; i++) {
      let rawName = workbook.SheetNames[i];
      if (!rawName || !rawName.trim()) rawName = `Sayfa ${i + 1}`;
      // Duplicate isim fallback
      let name = rawName;
      let dupIdx = 1;
      while (usedNames.has(name)) {
        name = `${rawName} (${++dupIdx})`;
      }
      usedNames.add(name);

      const sheet = workbook.Sheets[rawName];
      if (!sheet || !sheet['!ref']) {
        sheets.push({
          name,
          index: i,
          columnDefs: [],
          rowData: [],
          columnRoles: {},
          headerEndRow: 0,
          isEmpty: true,
          discipline: null,
        });
        continue;
      }

      try {
        const parsed = this.parseSingleSheet(sheet);
        // Disiplin tespiti — sheet adi + ilk N data row'unun nameField'i
        let sampleText = '';
        if (parsed.columnRoles.nameField) {
          const nameField = parsed.columnRoles.nameField;
          const dataSample = parsed.rowData
            .filter((r: any) => r._isDataRow)
            .slice(0, 20)
            .map((r: any) => String(r[nameField] ?? ''))
            .join(' ');
          sampleText = dataSample;
        }
        const discipline = detectSheetDiscipline(name, sampleText);

        // stripPrices: teklif akisi icin fiyat kolonlarini temizle
        // Hem role-based hem header-based (fallback)
        if (stripPrices) {
          const fieldsToClean = new Set<string>();
          // 1) Role-based
          const roles = parsed.columnRoles as any;
          ['materialUnitPriceField', 'materialTotalField', 'laborUnitPriceField',
            'laborTotalField', 'grandUnitPriceField', 'grandTotalField'].forEach((r) => {
            if (roles[r]) fieldsToClean.add(roles[r]);
          });
          // 2) Header-based fallback — headerName icinde FIYAT/TUTAR/BEDEL gecen tum data kolonlari
          // (sistem kolonlari haric: _malzKar, _iscKar, _marka, _firma)
          const PRICE_HEADER_RE = /\b(fiyat|tutar|bedel|toplam|birim\s*fiyat)\b/i;
          for (const cd of parsed.columnDefs) {
            if (!cd.field || cd.field.startsWith('_')) continue;
            if (cd.headerName && PRICE_HEADER_RE.test(cd.headerName)) {
              fieldsToClean.add(cd.field);
            }
          }
          // Uygula
          let cleanedCells = 0;
          for (const row of parsed.rowData) {
            if (!row._isDataRow) continue;
            for (const f of fieldsToClean) {
              if (row[f] !== undefined && row[f] !== '') {
                row[f] = '';
                cleanedCells++;
              }
            }
          }
          console.log(`[ExcelGrid] stripPrices "${name}": ${fieldsToClean.size} field, ${cleanedCells} hucre temizlendi`);
        }

        sheets.push({ name, index: i, ...parsed, discipline });
      } catch (e) {
        console.warn(`[ExcelGrid] Sheet "${name}" parse edilemedi:`, (e as Error).message);
        sheets.push({
          name,
          index: i,
          columnDefs: [],
          rowData: [],
          columnRoles: {},
          headerEndRow: 0,
          isEmpty: true,
          discipline: null,
        });
      }
    }

    // En az 1 data'li sheet olmali
    const hasAnyData = sheets.some((s) => !s.isEmpty);
    if (!hasAnyData) {
      throw new BadRequestException('Excel dosyasinda fiyatlandirilacak veri bulunamadi.');
    }

    const brands = await this.prisma.brand.findMany({ select: { id: true, name: true } });
    console.log(`[ExcelGrid] ${sheets.length} sheet parse edildi, ${sheets.filter((s) => !s.isEmpty).length} dolu`);

    return { sheets, brands };
  }

  // ────────────────────────────────────────────
  // Tek sheet parse (her sheet icin bagimsiz cagrilir)
  // ────────────────────────────────────────────
  private parseSingleSheet(sheet: XLSX.WorkSheet): Omit<SheetData, 'name' | 'index' | 'discipline'> {
    if (!sheet['!ref']) {
      return { columnDefs: [], rowData: [], columnRoles: {}, headerEndRow: 0, isEmpty: true };
    }

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;

    // 1. Tum hucreleri ham deger matrisine al (merge expansion icin)
    const rawValues: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const row: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const addr = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
        const cell = sheet[addr];
        row.push(cell && cell.v !== undefined && cell.v !== null ? String(cell.v) : '');
      }
      rawValues.push(row);
    }

    // 2. Merge cells: degerleri sol-ust hucreden tum kapsananlara yay
    const merges = sheet['!merges'] || [];
    const mergeInfo = new Map<string, { rowSpan: number; colSpan: number; hidden: boolean }>();

    for (const merge of merges) {
      const startR = merge.s.r - range.s.r;
      const startC = merge.s.c - range.s.c;
      const endR = merge.e.r - range.s.r;
      const endC = merge.e.c - range.s.c;
      const rowSpan = endR - startR + 1;
      const colSpan = endC - startC + 1;

      const sourceValue = rawValues[startR]?.[startC] ?? '';

      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          const key = `${r}-${c}`;
          if (r === startR && c === startC) {
            mergeInfo.set(key, { rowSpan, colSpan, hidden: false });
          } else {
            // Expanded value for detection + hidden flag for render
            rawValues[r][c] = sourceValue;
            mergeInfo.set(key, { rowSpan: 1, colSpan: 1, hidden: true });
          }
        }
      }
    }

    // 3. Sutun rollerini tespit et
    const { columnRoles, headerEndRow, realHeaderRow, firstDataRow } = this.detectColumnRoles(rawValues, colCount);

    // 4. Column defs olustur — gercek header satirindan + alt satirdan birlestir
    const columnDefs: ColumnDef[] = [];

    for (let c = 0; c < colCount; c++) {
      // Gercek header satirindan ve bir sonraki satirdan degeri al
      const headerValue1 = String(rawValues[realHeaderRow]?.[c] ?? '').trim();
      const headerValue2 = String(rawValues[realHeaderRow + 1]?.[c] ?? '').trim();

      // Multi-row header: "MALZEME" + "BIRIM FIYAT" -> "MALZEME BIRIM FIYAT"
      // Eger 2. satir 1. satir ile ayni ise (merge expansion), sadece 1'i kullan
      let headerName = headerValue1;
      if (headerValue2 && headerValue2 !== headerValue1) {
        headerName = headerValue1 ? `${headerValue1} ${headerValue2}` : headerValue2;
      }
      if (!headerName) headerName = `Sutun ${c + 1}`;

      const field = `col${c}`;
      const colDef: ColumnDef = {
        field,
        headerName,
        editable: true,
        width: this.guessWidth(c, columnRoles),
        suppressMovable: true,
      };
      columnDefs.push(colDef);
    }

    // 5. Sistem sutunlari (en saga)
    columnDefs.push(
      { field: '_malzKar', headerName: 'Malz. Kar %', width: 90, editable: true, pinned: 'right', suppressMovable: true },
      { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer', pinned: 'right', suppressMovable: true },
      { field: '_iscKar', headerName: 'Isc. Kar %', width: 90, editable: true, pinned: 'right', suppressMovable: true },
      { field: '_firma', headerName: 'Isc. Firma', width: 150, cellRenderer: 'firmaRenderer', pinned: 'right', suppressMovable: true },
    );

    // 6. Row data olustur
    const rowData: RowData[] = [];
    const roleFields = this.mapRolesToFields(columnRoles);

    for (let r = 0; r < rowCount; r++) {
      const row: RowData = {
        _rowIdx: r,
        _isDataRow: false,
        _isHeaderRow: r <= headerEndRow,
        _malzKar: 0,
        _iscKar: 0,
        _marka: null,
        _firma: null,
        _matNetPrice: 0,
        _merges: {},
      };

      for (let c = 0; c < colCount; c++) {
        const field = `col${c}`;
        row[field] = rawValues[r][c];

        const mi = mergeInfo.get(`${r}-${c}`);
        if (mi) {
          row._merges![field] = {
            rowSpan: mi.rowSpan > 1 ? mi.rowSpan : undefined,
            colSpan: mi.colSpan > 1 ? mi.colSpan : undefined,
            hidden: mi.hidden,
          };
        }
      }

      // Data satiri mi? Miktar sutununda sayi var mi?
      if (roleFields.quantityField) {
        const qty = parseFloat(String(row[roleFields.quantityField] ?? ''));
        if (!isNaN(qty) && qty > 0 && r > headerEndRow) {
          row._isDataRow = true;
        }
      }

      rowData.push(row);
    }

    const hasDataRows = rowData.some((r) => r._isDataRow);
    console.log(`[ExcelGrid] parseSingleSheet ${rowCount}x${colCount}, ${merges.length} merge, headerEndRow=${headerEndRow}, dataRows=${hasDataRows}`);

    return {
      columnDefs,
      rowData,
      columnRoles: roleFields,
      headerEndRow,
      isEmpty: !hasDataRows,
    };
  }

  // ────────────────────────────────────────────
  // Sutun rol tespiti (deterministik regex)
  // ────────────────────────────────────────────

  private detectColumnRoles(
    rawValues: string[][],
    colCount: number,
  ): { columnRoles: Record<string, number>; headerEndRow: number; realHeaderRow: number; firstDataRow: number } {
    const roles: Record<string, number> = {};

    const norm = (s: any) => String(s ?? '')
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g')
      .toLowerCase().trim();

    const maxSearch = Math.min(20, rawValues.length);

    // Her sutun icin birlesik text
    const colTexts: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const seen = new Set<string>();
      const parts: string[] = [];
      for (let r = 0; r < maxSearch; r++) {
        const val = rawValues[r]?.[c] ?? '';
        const n = norm(val);
        if (n && !seen.has(n)) {
          seen.add(n);
          parts.push(n);
        }
      }
      colTexts.push(parts.join(' ').trim());
    }

    const checks: Array<{ role: string; patterns: RegExp[]; priority: number }> = [
      { role: 'no', patterns: [/\bsira\s*no\b/, /\bsira\b/, /\bposno\b/, /\bpoz\s*no\b/], priority: 1 },
      { role: 'name', patterns: [/cinsi\s*tanim/, /imalat\s*tanim/, /yapilacak\s*imalat/, /malzeme\s*adi/, /aciklama/, /poz\s*adi/], priority: 2 },
      { role: 'brand', patterns: [/\bmarkasi\b/, /\bmarka\b/, /\bbrand\b/], priority: 2 },
      { role: 'quantity', patterns: [/\bmiktar\b/, /\bmik\b/, /\bqty\b/, /\badet\b/, /\bquantity\b/], priority: 2 },
      { role: 'unit', patterns: [/\bbirim\b/, /\bbr\b/, /\bbrm\b/, /\bunit\b/], priority: 2 },
      { role: 'materialUnitPrice', patterns: [/malzeme.*birim\s*fiyat/, /mlz.*birim\s*fiyat/, /malzeme.*b\.?\s*fiyat/, /mlz.*b\.?\s*fiyat/], priority: 3 },
      { role: 'materialTotal', patterns: [/malzeme.*tutar/, /mlz.*tutar/, /malzeme.*toplam/], priority: 3 },
      { role: 'laborUnitPrice', patterns: [/iscilik.*birim\s*fiyat/, /isc.*birim\s*fiyat/, /iscilik.*b\.?\s*fiyat/, /isc.*b\.?\s*fiyat/], priority: 3 },
      { role: 'laborTotal', patterns: [/iscilik.*tutar/, /isc.*tutar/, /iscilik.*toplam/], priority: 3 },
      { role: 'grandUnitPrice', patterns: [/toplam.*birim\s*fiyat/, /genel.*birim/], priority: 3 },
      { role: 'grandTotal', patterns: [/toplam.*tutar/, /^toplam$/, /genel\s*toplam/], priority: 3 },
    ];

    const assignedCols = new Set<number>();
    for (const priority of [3, 2, 1]) {
      for (const check of checks.filter((x) => x.priority === priority)) {
        if (roles[check.role] !== undefined) continue;
        for (let c = 0; c < colCount; c++) {
          if (assignedCols.has(c)) continue;
          const text = colTexts[c];
          if (!text) continue;
          if (check.patterns.some((p) => p.test(text))) {
            roles[check.role] = c;
            assignedCols.add(c);
            break;
          }
        }
      }
    }

    // First data row: ilk miktari olan satir
    let firstDataRow = -1;
    if (roles.quantity !== undefined) {
      const qCol = roles.quantity;
      for (let r = 0; r < Math.min(30, rawValues.length); r++) {
        const val = rawValues[r]?.[qCol];
        const num = parseFloat(String(val).replace(',', '.'));
        if (!isNaN(num) && num > 0) {
          firstDataRow = r;
          break;
        }
      }
    }

    // Gercek header satirini bul: bilinen header kelimelerinden en cok iceren satir
    // (ornegin "sira", "cinsi", "miktar", "birim", "marka", "malzeme", "iscilik", "toplam", "tutar", "fiyat")
    const headerKeywords = [
      'sira', 'cinsi', 'tanim', 'miktar', 'birim', 'marka', 'markasi',
      'malzeme', 'iscilik', 'isc', 'toplam', 'tutar', 'fiyat', 'adet',
      'imalat', 'poz', 'yapilacak',
    ];

    let realHeaderRow = 0;
    let bestScore = 0;
    const searchEnd = firstDataRow >= 0 ? firstDataRow : Math.min(20, rawValues.length);

    for (let r = 0; r < searchEnd; r++) {
      let score = 0;
      for (let c = 0; c < colCount; c++) {
        const cellText = norm(rawValues[r]?.[c] ?? '');
        if (!cellText) continue;
        for (const kw of headerKeywords) {
          if (new RegExp(`\\b${kw}\\b`).test(cellText)) {
            score++;
            break; // her hucre 1 kez sayilsin
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        realHeaderRow = r;
      }
    }

    // headerEndRow: firstDataRow'un bir oncesi (veriyi nereden okuyacagimizi belirler)
    const headerEndRow = firstDataRow >= 0 ? Math.max(0, firstDataRow - 1) : realHeaderRow;

    console.log(`[ExcelGrid] detectColumnRoles: realHeaderRow=${realHeaderRow} (score=${bestScore}), firstDataRow=${firstDataRow}, headerEndRow=${headerEndRow}`);

    return { columnRoles: roles, headerEndRow, realHeaderRow, firstDataRow };
  }

  private mapRolesToFields(roles: Record<string, number>): ColumnRoles {
    const map: ColumnRoles = {};
    if (roles.no !== undefined) map.noField = `col${roles.no}`;
    if (roles.name !== undefined) map.nameField = `col${roles.name}`;
    if (roles.brand !== undefined) map.brandField = `col${roles.brand}`;
    if (roles.quantity !== undefined) map.quantityField = `col${roles.quantity}`;
    if (roles.unit !== undefined) map.unitField = `col${roles.unit}`;
    if (roles.materialUnitPrice !== undefined) map.materialUnitPriceField = `col${roles.materialUnitPrice}`;
    if (roles.materialTotal !== undefined) map.materialTotalField = `col${roles.materialTotal}`;
    if (roles.laborUnitPrice !== undefined) map.laborUnitPriceField = `col${roles.laborUnitPrice}`;
    if (roles.laborTotal !== undefined) map.laborTotalField = `col${roles.laborTotal}`;
    if (roles.grandUnitPrice !== undefined) map.grandUnitPriceField = `col${roles.grandUnitPrice}`;
    if (roles.grandTotal !== undefined) map.grandTotalField = `col${roles.grandTotal}`;
    return map;
  }

  private guessWidth(colIdx: number, roles: Record<string, number>): number {
    if (colIdx === roles.name) return 320;
    if (colIdx === roles.no) return 60;
    if (colIdx === roles.quantity) return 80;
    if (colIdx === roles.unit) return 70;
    if (colIdx === roles.brand) return 130;
    if (
      colIdx === roles.materialUnitPrice ||
      colIdx === roles.materialTotal ||
      colIdx === roles.laborUnitPrice ||
      colIdx === roles.laborTotal ||
      colIdx === roles.grandUnitPrice ||
      colIdx === roles.grandTotal
    ) return 120;
    return 110;
  }
}
