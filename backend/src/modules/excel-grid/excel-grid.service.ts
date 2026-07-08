import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { detectSheetDiscipline } from './sheet-discipline';

// ────────────────────────────────────────────
// Icerik-tabanli sutun tespiti sabitleri
// ────────────────────────────────────────────
// Bir hucrenin MALZEME tanimi mi oldugunu anlamak icin: cap notasyonu veya
// tesisat malzeme kelimesi geciyor mu? Marka sutununu ("...VEYA MUADILI")
// isim rolunden ayirmak icin de BRAND_HINT kullanilir.
const MATERIAL_TOKEN_RE = /(\bdn\s?\d)|(ø|Ø)|(\bod[\s-]?\d)|(\d\s?["″′'])|(\b\d+\/\d+\s?["″])|\b(boru|vana|fitting|dirsek|te|reduksiyon|reduksiyon|flans|flan[sş]|celik|çelik|pvc|ppr|hdpe|\bpe\b|bakir|bak[iı]r|galvaniz|kablo|kesici|salter|[sş]alter|pano|sprink|kelepce|kelep[cç]e|vidali|vidal[iı]|kaynakli|kaynakl[iı]|manson|man[sş]on|rakor|nipel|kolektor|kolekt[oö]r|radyator|radyat[oö]r|pompa|kombi|vitrifiye|lavabo|klozet|batarya|sifon|rekor|dirsek|te\b|kanal|izolasyon)/i;
const BRAND_HINT_RE = /muad[iı]l|veya\s+muad|\bmuadili\b/i;
const UNIT_VOCAB = new Set<string>([
  'metre', 'mt', 'm', 'adet', 'ad', 'takim', 'tk', 'm2', 'm3', 'kg', 'ton',
  'paket', 'pk', 'rulo', 'boy', 'litre', 'lt', 'cift', 'kutu', 'set', 'gr',
]);

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

  async prepare(fileBuffer: Buffer, opts?: { stripPrices?: boolean; fixedSchema?: boolean }): Promise<MultiSheetData> {
    const stripPrices = opts?.stripPrices ?? false;
    // fixedSchema: teklif akisi — Excel'in fiyat/tutar sutunlari ATILIR,
    // yerine SABIT sistem sutunlari (Malz/Isc Birim+Toplam+Toplam) konur.
    // Admin malzeme-import akisi bunu KULLANMAZ (ham sutunlar korunur).
    const fixedSchema = opts?.fixedSchema ?? false;
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
        const parsed = this.parseSingleSheet(sheet, fixedSchema);
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
  private parseSingleSheet(sheet: XLSX.WorkSheet, fixedSchema = false): Omit<SheetData, 'name' | 'index' | 'discipline'> {
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

    // ── FIXED SCHEMA: Excel'in fiyat/tutar sutunlarini ATILACAK isaretle ──
    // Rol tespitinden gelen fiyat kolonlari + basligi fiyat/tutar/toplam olan
    // her kolon. Yerlerine asagida SABIT sistem sutunlari eklenir.
    const dropCols = new Set<number>();
    if (fixedSchema) {
      for (const rk of ['materialUnitPrice', 'materialTotal', 'laborUnitPrice', 'laborTotal', 'grandUnitPrice', 'grandTotal']) {
        if (columnRoles[rk] !== undefined) dropCols.add(columnRoles[rk]);
      }
      const normHdr = (s: any) => String(s ?? '')
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c').replace(/[üÜ]/g, 'u')
        .replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g').toLowerCase();
      for (let c = 0; c < colCount; c++) {
        const h = `${normHdr(rawValues[realHeaderRow]?.[c])} ${normHdr(rawValues[realHeaderRow + 1]?.[c])}`;
        if (/\b(fiyat|tutar|bedel|toplam)\b/.test(h)) dropCols.add(c);
      }
      // BOS SUTUN COPU: basligi yok VE hicbir veri satirinda deger yok
      // ("Sutun 11" gibi placeholder'lar). Rol sutunlari (ad/miktar/birim)
      // dolu oldugundan buraya dusmez.
      const roleIdx = new Set(Object.values(columnRoles));
      for (let c = 0; c < colCount; c++) {
        if (dropCols.has(c) || roleIdx.has(c)) continue;
        const hdr = String(rawValues[realHeaderRow]?.[c] ?? '').trim();
        let hasData = false;
        for (let r = realHeaderRow + 1; r < rawValues.length; r++) {
          if (String(rawValues[r]?.[c] ?? '').trim()) { hasData = true; break; }
        }
        if (!hdr && !hasData) dropCols.add(c);
      }
    }

    // 4. Column defs olustur — gercek header satirindan + alt satirdan birlestir
    const columnDefs: ColumnDef[] = [];

    for (let c = 0; c < colCount; c++) {
      if (dropCols.has(c)) continue; // fixedSchema: fiyat/tutar + bos sutunlar atilir
      // Gercek header satirindan ve bir sonraki satirdan degeri al
      const headerValue1 = String(rawValues[realHeaderRow]?.[c] ?? '').trim();
      const headerValue2 = String(rawValues[realHeaderRow + 1]?.[c] ?? '').trim();

      // Header adi. fixedSchema'da TEK satir kullanilir — cunku realHeaderRow+1
      // cogu keşifte MERGE edilmis bolum basligidir ("YANGIN TESİSATI") ve
      // iki-satir birlestirmesi tum basliklara bulasir. Non-fixed'de multi-row
      // header birlestirmesi korunur (fiyat sutunlari icin gerekliydi).
      let headerName: string;
      if (fixedSchema) {
        headerName = headerValue1 || `Sütun ${c + 1}`;
      } else {
        headerName = headerValue1;
        if (headerValue2 && headerValue2 !== headerValue1) {
          headerName = headerValue1 ? `${headerValue1} ${headerValue2}` : headerValue2;
        }
        if (!headerName) headerName = `Sutun ${c + 1}`;
      }

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
    if (fixedSchema) {
      // SABIT HESAP BLOGU — her Excel'de ayni, kaymaz. Fiyat/tutarlar bu
      // sistem alanlarina yazilir; frontend rol-tabanli formulle hesaplar.
      columnDefs.push(
        { field: '_malzKar', headerName: 'Malz. Kar %', width: 85, editable: true, suppressMovable: true },
        { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer', suppressMovable: true },
        { field: '_matBirim', headerName: 'Malz. Birim Fiyat', width: 120, editable: true, suppressMovable: true },
        { field: '_matToplam', headerName: 'Malz. Toplam', width: 120, editable: false, suppressMovable: true },
        { field: '_iscKar', headerName: 'İşç. Kar %', width: 85, editable: true, suppressMovable: true },
        { field: '_firma', headerName: 'İşç. Firma', width: 150, cellRenderer: 'firmaRenderer', suppressMovable: true },
        { field: '_labBirim', headerName: 'İşç. Birim Fiyat', width: 120, editable: true, suppressMovable: true },
        { field: '_labToplam', headerName: 'İşç. Toplam', width: 120, editable: false, suppressMovable: true },
        { field: '_toplam', headerName: 'Toplam', width: 130, editable: false, suppressMovable: true },
      );
    } else {
      columnDefs.push(
        { field: '_malzKar', headerName: 'Malz. Kar %', width: 90, editable: true, pinned: 'right', suppressMovable: true },
        { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer', pinned: 'right', suppressMovable: true },
        { field: '_iscKar', headerName: 'Isc. Kar %', width: 90, editable: true, pinned: 'right', suppressMovable: true },
        { field: '_firma', headerName: 'Isc. Firma', width: 150, cellRenderer: 'firmaRenderer', pinned: 'right', suppressMovable: true },
      );
    }

    // 6. Row data olustur
    const rowData: RowData[] = [];
    const roleFields = this.mapRolesToFields(columnRoles);

    // FIXED SCHEMA: fiyat/tutar rollerini SABIT sistem alanlarina yonlendir.
    // Boylece frontend'in rol-tabanli yazma/hesaplama mantigi (writePrice,
    // recalcGrand) Excel sutunu yerine sabit sisteme yazar — kayma imkansiz.
    if (fixedSchema) {
      roleFields.materialUnitPriceField = '_matBirim';
      roleFields.materialTotalField = '_matToplam';
      roleFields.laborUnitPriceField = '_labBirim';
      roleFields.laborTotalField = '_labToplam';
      roleFields.grandTotalField = '_toplam';
      delete roleFields.grandUnitPriceField;
    }

    // fixedSchema'da baslik gercek header satirinda biter; firstDataRow-1
    // KULLANILMAZ (ekipman satirlari miktar=0 oldugundan firstDataRow onlari
    // atlayip basliga katiyordu → fiyatlandirilamiyorlardi).
    const effHeaderEndRow = fixedSchema ? realHeaderRow : headerEndRow;
    const nameColIdx = columnRoles.name;

    for (let r = 0; r < rowCount; r++) {
      const row: RowData = {
        _rowIdx: r,
        _isDataRow: false,
        _isHeaderRow: r <= effHeaderEndRow,
        _malzKar: 0,
        _iscKar: 0,
        _marka: null,
        _firma: null,
        _matNetPrice: 0,
        _merges: {},
      };
      if (fixedSchema) {
        row._matBirim = '';
        row._matToplam = '';
        row._labBirim = '';
        row._labToplam = '';
        row._toplam = '';
        row._labNetPrice = 0;
      }

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

      // Data satiri tespiti
      if (fixedSchema) {
        // Malzeme adi VAR ve (birim VAR veya miktar>0). Ekipman (miktar=0 ama
        // birim var) DAHIL; bolum basliklari (sadece ad, birim/miktar yok VEYA
        // merge ile ad=birim ayni deger) HARIC.
        const nameVal = roleFields.nameField ? String(row[roleFields.nameField] ?? '').trim() : '';
        const unitVal = roleFields.unitField ? String(row[roleFields.unitField] ?? '').trim() : '';
        const qtyNum = roleFields.quantityField ? parseFloat(String(row[roleFields.quantityField] ?? '').replace(',', '.')) : NaN;
        const hasQty = !isNaN(qtyNum) && qtyNum > 0;
        // Merge ile yayilmis bolum basligi: ad hucresi gizli-merge VEYA
        // ad===birim (ayni merge kaynagi) → satir baslik, veri degil.
        const nameMerge = nameColIdx !== undefined ? mergeInfo.get(`${r}-${nameColIdx}`) : undefined;
        const isMergedSection =
          nameMerge?.hidden === true ||
          (nameMerge?.colSpan ?? 1) > 2 ||
          (!!nameVal && nameVal === unitVal);
        if (r > effHeaderEndRow && nameVal && (unitVal || hasQty) && !isMergedSection) {
          row._isDataRow = true;
        }
      } else if (roleFields.quantityField) {
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
      headerEndRow: effHeaderEndRow,
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

    // Bir kolonda (header sonrasi olabilecek satirlarda) sayisal deger var mi?
    // quantity dogrulamasi icin: "Miktar" kolonu sayi icermeli.
    const hasNumericValue = (c: number): boolean => {
      const limit = Math.min(40, rawValues.length);
      for (let r = 0; r < limit; r++) {
        const num = parseFloat(String(rawValues[r]?.[c] ?? '').replace(',', '.'));
        if (!isNaN(num) && num > 0) return true;
      }
      return false;
    };

    const assignedCols = new Set<number>();
    for (const priority of [3, 2, 1]) {
      for (const check of checks.filter((x) => x.priority === priority)) {
        if (roles[check.role] !== undefined) continue;
        // PATTERN-ONCELIKLI TARAMA (multi-sheet bug fix):
        // Eski kod kolon-oncelikliydi: soldaki kolon zayif bir pattern'le
        // (orn quantity icin /\badet\b/) eslesince gercek "Miktar" kolonunun
        // /\bmiktar\b/ eslesmesine hic sira gelmiyordu. Ornek felaket:
        // "Birim" kolonunda 'adet' DEGERI var diye Miktar rolu Birim'e
        // atandi -> parseFloat('metre')=NaN -> firstDataRow=-1 -> sheet
        // isEmpty sayildi -> 5 sayfalik dosyada 4 sekme "kayboldu".
        // Yeni kod: GUCLU pattern TUM kolonlarda once aranir; zayif pattern
        // ancak guclusu hic eslesmezse devreye girer.
        outer:
        for (const pattern of check.patterns) {
          const candidates: number[] = [];
          for (let c = 0; c < colCount; c++) {
            if (assignedCols.has(c)) continue;
            const text = colTexts[c];
            if (text && pattern.test(text)) candidates.push(c);
          }
          if (candidates.length === 0) continue;
          // quantity icin ek dogrulama: secilen kolon SAYI icermeli
          // (header'da 'miktar' yazan ama bos kolon yerine dolu olani sec)
          let pick = candidates[0];
          if (check.role === 'quantity') {
            const numeric = candidates.find((c) => hasNumericValue(c));
            if (numeric === undefined) continue; // adaylarin hicbirinde sayi yok — sonraki pattern'e dus
            pick = numeric;
          }
          roles[check.role] = pick;
          assignedCols.add(pick);
          break outer;
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

    // ── ICERIK-TABANLI MALZEME ADI TESPITI (kok fix) ────────────────
    // Eski regex tespiti "Aciklama/Marka" basligini /aciklama/ ile isim
    // rolune atiyordu; ama o sutun MARKA metni ("...VEYA MUADILI") tasiyor,
    // gercek malzeme "Isin Tanimi"nda. Eslestirmeye marka metni gidince
    // cap/tip cikmiyor -> fiyat atanmiyordu.
    // Cozum: her sutunu ICERIGINE gore puanla (cap/malzeme kelimesi geciyor
    // mu?), marka-ipuclu ("muadili") sutunu DISLA, en yuksek puanli sutunu
    // malzeme adi sec. Baslikta "tanim/imalat/cinsi" varsa bonus.
    {
      const dataStart = firstDataRow >= 0 ? firstDataRow : Math.min(2, rawValues.length - 1);
      const dataEnd = Math.min(dataStart + 40, rawValues.length);
      let bestCol = -1;
      let bestScore = -1;
      for (let c = 0; c < colCount; c++) {
        // sayisal roller (miktar/birim) isim olamaz
        if (c === roles.quantity) continue;
        let material = 0;
        let brand = 0;
        let nonEmpty = 0;
        for (let r = dataStart; r < dataEnd; r++) {
          const v = String(rawValues[r]?.[c] ?? '').trim();
          if (!v) continue;
          nonEmpty++;
          if (BRAND_HINT_RE.test(v)) brand++;
          if (MATERIAL_TOKEN_RE.test(v)) material++;
        }
        if (nonEmpty === 0) continue;
        // Marka sutunu: cogunlukla "muadili" tasiyor VE malzeme kelimesi az → disla
        if (brand > material && brand >= nonEmpty * 0.3) continue;
        // Baslik ipucu
        const ht = colTexts[c] ?? '';
        let headerBonus = 0;
        if (/tanim|imalat|cinsi|malzeme\s*ad|yapilacak|poz\s*ad|urun/.test(ht)) headerBonus = 4;
        else if (/aciklama/.test(ht)) headerBonus = 1;
        if (/marka/.test(ht)) headerBonus -= 3;
        const score = material + headerBonus;
        if (score > bestScore) {
          bestScore = score;
          bestCol = c;
        }
      }
      // Guclu bir aday bulunduysa isim rolunu ONA ata (regex tahminini ez).
      // Hicbir sutunda malzeme sinyali yoksa (bestScore<=0) eski regex tercihini koru.
      if (bestCol >= 0 && bestScore > 0) {
        if (roles.name !== bestCol) {
          console.log(`[ExcelGrid] Malzeme adi icerikten: col${bestCol} (score=${bestScore}), eski regex col${roles.name}`);
        }
        roles.name = bestCol;
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
