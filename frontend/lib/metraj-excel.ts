/**
 * Metraj → Excel çıktı helper'ı
 * Çoklu sheet desteği: her hat/malzeme ayrı sheet.
 */

export interface MetrajExcelRow {
  name: string;
  diameter: string;
  qty: string | number;
  unit: string;
  materialType?: string;
}

export interface MetrajSheet {
  /** Sheet adı (hat_tipi || layer adı). 31 karaktere otomatik kırpılır. */
  sheetName: string;
  rows: MetrajExcelRow[];
  /** O sheet'in toplam metresi (m cinsinden) */
  totalLength: number;
  /** Malzeme tipi — başlıkta gösterilir */
  materialType?: string;
}

/**
 * XLSX sheet adı kısıtı: max 31 karakter, bazı karakterler (\/?*[]) yasak.
 * Sanitize eder ve kırpar.
 */
function sanitizeSheetName(name: string): string {
  const cleaned = (name || 'Sheet')
    .replace(/[\\\/\?\*\[\]]/g, '_')
    .trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned || 'Sheet';
}

/**
 * Çoklu sheet Excel dosyası oluştur ve indir.
 * Her sheet = bir layer/hat.
 */
export async function exportMetrajToExcel(
  sheets: MetrajSheet[],
  fileName: string,
): Promise<{ success: boolean; sheetCount: number; totalItems: number }> {
  if (sheets.length === 0) {
    return { success: false, sheetCount: 0, totalItems: 0 };
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  let totalItems = 0;

  for (const sheet of sheets) {
    const wsData: (string | number)[][] = [];

    // Başlık: Malzeme Tipi Metrajı
    const headerTitle = sheet.materialType
      ? `${sheet.materialType} Metrajı`
      : `${sheet.sheetName} Metrajı`;
    wsData.push([headerTitle]);
    wsData.push([]);
    wsData.push(['Malzeme Adı', 'Çap', 'Birim', 'Miktar']);

    for (const row of sheet.rows) {
      const qty = typeof row.qty === 'string' ? parseFloat(row.qty) || 0 : row.qty;
      wsData.push([row.name, row.diameter, row.unit, qty]);
      totalItems++;
    }

    wsData.push([]);
    wsData.push(['', '', 'Toplam:', Math.round(sheet.totalLength * 100) / 100]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];

    // Sheet adı benzersiz olmalı
    let baseName = sanitizeSheetName(sheet.sheetName);
    let uniqueName = baseName;
    let suffix = 2;
    while (usedNames.has(uniqueName)) {
      const tail = `_${suffix}`;
      uniqueName = (baseName.length + tail.length > 31
        ? baseName.slice(0, 31 - tail.length)
        : baseName) + tail;
      suffix++;
    }
    usedNames.add(uniqueName);

    XLSX.utils.book_append_sheet(wb, ws, uniqueName);
  }

  const exportName = fileName.replace(/\..+$/, '') + '-metraj.xlsx';
  XLSX.writeFile(wb, exportName);

  return { success: true, sheetCount: sheets.length, totalItems };
}
