import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import * as XLSX from 'xlsx';
import * as puppeteer from 'puppeteer';
import * as ExcelJS from 'exceljs';

@Injectable()
export class QuotesService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async parseExcel(userId: string, fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) return { headers: [], rows: [], brands: [] };

    const headers = Object.keys(rows[0]);
    console.log(`[Excel] ${rows.length} satır, ${headers.length} sütun: [${headers.join(', ')}]`);

    const brands = await this.prisma.brand.findMany({ select: { id: true, name: true } });

    return { headers, rows, brands };
  }

  async create(userId: string, dto: CreateQuoteDto) {
    const items = dto.items.map((item) => {
      const qty = item.quantity ?? 1;
      const matUp = item.materialUnitPrice ?? item.unitPrice ?? 0;
      const labUp = item.laborUnitPrice ?? 0;
      const matMargin = item.materialMargin ?? 0;
      const labMargin = item.laborMargin ?? 0;

      // Malzeme hesaplama (marja dahil)
      const matWithMargin = matUp * (1 + matMargin / 100);
      const materialTotalPrice = matWithMargin * qty;

      // İşçilik hesaplama (marja dahil)
      const labWithMargin = labUp * (1 + labMargin / 100);
      const laborTotalPrice = labWithMargin * qty;

      // Toplamlar
      const totalUnitPrice = matWithMargin + labWithMargin;
      const totalPrice = materialTotalPrice + laborTotalPrice;

      // Eski alan geriye uyum
      const discount = item.discount ?? 0;
      const profitMargin = item.profitMargin ?? matMargin;
      const netPrice = matUp * (1 - discount / 100);
      const finalPrice = totalPrice;

      return {
        materialName: item.materialName,
        unit: item.unit ?? 'Adet',
        brandId: item.brandId || null,
        quantity: qty,
        materialUnitPrice: matUp,
        materialTotalPrice,
        materialMargin: matMargin,
        laborUnitPrice: labUp,
        laborTotalPrice,
        laborMargin: labMargin,
        totalUnitPrice,
        totalPrice,
        // Geriye uyumluluk
        unitPrice: matUp,
        discount,
        netPrice,
        profitMargin,
        finalPrice,
      };
    });

    // Orijinal dosya binary'si (base64 → Buffer)
    let originalFile: Buffer | undefined;
    if (dto.originalFileBase64) {
      try {
        originalFile = Buffer.from(dto.originalFileBase64, 'base64');
      } catch {}
    }

    return this.prisma.quote.create({
      data: {
        userId,
        title: dto.title || `Teklif ${new Date().toLocaleDateString('tr-TR')}`,
        sheets: dto.sheets ? (dto.sheets as any) : undefined,
        originalFile: originalFile ?? undefined,
        originalName: dto.originalFileName ?? undefined,
        items: { create: items },
      },
      include: {
        items: { include: { brand: true } },
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.quote.findMany({
      where: { userId },
      include: {
        items: { include: { brand: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      include: {
        items: { include: { brand: true } },
        user: { select: { email: true } },
      },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async remove(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    return this.prisma.quote.delete({ where: { id } });
  }

  /**
   * Orijinal Excel dosyasini acar, fiyat hucrelerini doldurur, dondurur.
   * Orijinal format (renkler, fontlar, merge cells, GENEL TOPLAM) %100 korunur.
   */
  async generateExcel(userId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      select: { originalFile: true, originalName: true, sheets: true, title: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');

    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    const filename = quote.originalName ?? `${quote.title ?? 'teklif'}.xlsx`;

    // Orijinal dosya yoksa (eski teklif) → sheets JSON'dan basit export (format kotu ama en azindan indirilir)
    if (!quote.originalFile) {
      const wb = XLSX.utils.book_new();
      for (const sheetData of sheetsArr) {
        if (sheetData.isEmpty) continue;
        const colDefs = (sheetData.columnDefs ?? []) as any[];
        const allRows = (sheetData.rowData ?? []) as any[];
        const EXCLUDE = new Set(['_malzKar', '_marka', '_iscKar', '_firma']);
        const visibleCols = colDefs.filter((c: any) => c.field && !EXCLUDE.has(c.field) && !c.field.startsWith('_'));
        const aoa: any[][] = [visibleCols.map((c: any) => c.headerName ?? '')];
        for (const row of allRows) {
          aoa.push(visibleCols.map((c: any) => row[c.field] ?? ''));
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, (sheetData.name ?? 'Sayfa').slice(0, 31));
      }
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      return { buffer: Buffer.from(buf), filename };
    }

    // ── ExcelJS ile orijinal dosyayi ac, stiller korunur, fiyat hucreleri doldur ──
    const ejsWorkbook = new ExcelJS.Workbook();
    await ejsWorkbook.xlsx.load(Buffer.from(quote.originalFile) as any);

    for (let si = 0; si < sheetsArr.length; si++) {
      const sheetData = sheetsArr[si];
      if (!sheetData || sheetData.isEmpty) continue;
      const roles = sheetData.columnRoles ?? {};
      const rowData = sheetData.rowData ?? [];

      // ExcelJS worksheet (1-based index)
      const ws = ejsWorkbook.worksheets[si];
      if (!ws) continue;

      // field → Excel kolon index (col0 → 1, col1 → 2, ...) — ExcelJS 1-based
      const fieldToCol: Record<string, number> = {};
      for (const key of Object.keys(roles)) {
        const field = roles[key];
        if (!field || !field.startsWith('col')) continue;
        const idx = parseInt(field.replace('col', ''), 10);
        if (!isNaN(idx)) fieldToCol[field] = idx + 1; // ExcelJS 1-based
      }

      // Fiyat field'lari
      const priceFields = [
        roles.materialUnitPriceField,
        roles.materialTotalField,
        roles.laborUnitPriceField,
        roles.laborTotalField,
        roles.grandUnitPriceField,
        roles.grandTotalField,
      ].filter(Boolean) as string[];

      // Her row icin fiyat hucreleri doldur
      for (let ri = 0; ri < rowData.length; ri++) {
        const row = rowData[ri];
        if (!row) continue;

        const excelRow = ri + 1; // ExcelJS 1-based

        for (const field of priceFields) {
          const val = row[field];
          if (val === undefined || val === null || val === '' || val === '0' || val === '0.00') continue;
          const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
          if (isNaN(num) || num === 0) continue;

          const col = fieldToCol[field];
          if (!col) continue;

          const cell = ws.getCell(excelRow, col);
          cell.value = num; // ExcelJS stili korur, sadece degeri degistirir
        }
      }
    }

    // ExcelJS ile buffer'a yaz (stiller korunur)
    const outputBuffer = await ejsWorkbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(outputBuffer), filename };
  }

  async generatePdf(userId: string, id: string): Promise<Buffer> {
    const quote = await this.findOne(userId, id);

    const grandTotal = quote.items.reduce((sum, item) => sum + item.finalPrice, 0);

    // Multi-sheet render: quote.sheets varsa her sheet'i ayri tablo olarak goster
    // PDF — dinamik sutunlar (Excel'de ne varsa o), ic bilgi yok
    const fmtTR = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sheetsArray = Array.isArray((quote as any).sheets) ? ((quote as any).sheets as any[]) : null;
    let pdfTotalMat = 0;
    let pdfTotalLab = 0;
    const multiSheetBlocks = sheetsArray && sheetsArray.length > 0
      ? sheetsArray.filter((s: any) => !s.isEmpty && Array.isArray(s.rowData) && s.rowData.length > 0).map((s: any) => {
          const dataRows = (s.rowData as any[]).filter((r) => r._isDataRow);
          const roles = s.columnRoles || {};
          const nameF = roles.nameField;
          const qtyF = roles.quantityField;
          const unitF = roles.unitField;
          const matUpF = roles.materialUnitPriceField;
          const matTotF = roles.materialTotalField;
          const labUpF = roles.laborUnitPriceField;
          const labTotF = roles.laborTotalField;
          const grandUpF = roles.grandUnitPriceField;
          const grandTotF = roles.grandTotalField;

          const hasMat = !!matUpF;
          const hasLab = !!labUpF;
          const hasGrandU = !!grandUpF;
          const hasGrandT = !!grandTotF;

          const rowsHtml = dataRows.map((r: any, i: number) => {
            const matUp = matUpF ? parseFloat(String(r[matUpF] ?? '')) || 0 : 0;
            const matTot = matTotF ? parseFloat(String(r[matTotF] ?? '')) || 0 : 0;
            const labUp = labUpF ? parseFloat(String(r[labUpF] ?? '')) || 0 : 0;
            const labTot = labTotF ? parseFloat(String(r[labTotF] ?? '')) || 0 : 0;
            const grandUp = grandUpF ? parseFloat(String(r[grandUpF] ?? '')) || 0 : 0;
            const grandTot = grandTotF ? parseFloat(String(r[grandTotF] ?? '')) || 0 : (matTot + labTot);
            return `<tr>
              <td>${i + 1}</td>
              <td>${(nameF ? r[nameF] : '') ?? ''}</td>
              <td>${(unitF ? r[unitF] : '') ?? ''}</td>
              <td>${(qtyF ? r[qtyF] : '') ?? ''}</td>
              ${hasMat ? `<td style="text-align:right">${matUp ? fmtTR(matUp) : '-'}</td>` : ''}
              ${hasMat ? `<td style="text-align:right">${matTot ? fmtTR(matTot) : '-'}</td>` : ''}
              ${hasLab ? `<td style="text-align:right">${labUp ? fmtTR(labUp) : '-'}</td>` : ''}
              ${hasLab ? `<td style="text-align:right">${labTot ? fmtTR(labTot) : '-'}</td>` : ''}
              ${hasGrandU ? `<td style="text-align:right">${grandUp ? fmtTR(grandUp) : '-'}</td>` : ''}
              ${hasGrandT ? `<td style="text-align:right;font-weight:bold">${grandTot ? fmtTR(grandTot) : '-'}</td>` : ''}
            </tr>`;
          }).join('');
          const sumMat = dataRows.reduce((sum: number, r: any) => sum + (matTotF ? parseFloat(String(r[matTotF] ?? '')) || 0 : 0), 0);
          const sumLab = dataRows.reduce((sum: number, r: any) => sum + (labTotF ? parseFloat(String(r[labTotF] ?? '')) || 0 : 0), 0);
          pdfTotalMat += sumMat;
          pdfTotalLab += sumLab;
          return `
            <section style="margin-bottom:28px">
              <h2 style="font-size:16px;margin-bottom:8px;padding:6px 10px;background:#1a1a1a;color:#fff">${s.name || ''}</h2>
              <table>
                <thead><tr>
                  <th>#</th><th>Malzeme</th><th>Birim</th><th>Miktar</th>
                  ${hasMat ? '<th>Malz. Br.</th><th>Malz. Top.</th>' : ''}
                  ${hasLab ? '<th>Isc. Br.</th><th>Isc. Top.</th>' : ''}
                  ${hasGrandU ? '<th>Top. Br.</th>' : ''}
                  ${hasGrandT ? '<th>Top. Tutar</th>' : ''}
                </tr></thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot><tr style="font-weight:bold;background:#f3f4f6">
                  <td colspan="4" style="text-align:right">Sayfa Toplami</td>
                  ${hasMat ? `<td></td><td style="text-align:right">${fmtTR(sumMat)}</td>` : ''}
                  ${hasLab ? `<td></td><td style="text-align:right">${fmtTR(sumLab)}</td>` : ''}
                  ${hasGrandU ? '<td></td>' : ''}
                  ${hasGrandT ? `<td style="text-align:right;font-weight:bold">${fmtTR(sumMat + sumLab)}</td>` : ''}
                </tr></tfoot>
              </table>
            </section>`;
        }).join('')
      : null;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 40px; }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
    .header h1 { font-size: 28px; font-weight: 700; letter-spacing: 2px; }
    .header p { color: #555; margin-top: 4px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #1a1a1a; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 9px 12px; border-bottom: 1px solid #e5e5e5; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .total-row td { font-weight: 700; border-top: 2px solid #1a1a1a; background: #f0f0f0; font-size: 14px; }
    .footer { text-align: center; color: #888; font-size: 11px; margin-top: 32px; }
    .badge { display: inline-block; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>METAPRICE</h1>
    <p>Mechanical Pricing Quotation</p>
  </div>

  <div class="meta">
    <div>
      <strong>Quote Title:</strong> ${quote.title || 'N/A'}<br/>
      <strong>Quote ID:</strong> ${quote.id.slice(0, 8).toUpperCase()}
    </div>
    <div style="text-align:right">
      <strong>Date:</strong> ${new Date(quote.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br/>
      <strong>Prepared by:</strong> ${quote.user.email}
    </div>
  </div>

  ${multiSheetBlocks ?? ''}
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Material</th>
        <th>Brand</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Discount %</th>
        <th>Net Price</th>
        <th>Margin %</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${quote.items.map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.materialName}</td>
        <td>${item.brand?.name || '-'}</td>
        <td>${item.quantity}</td>
        <td>${item.unitPrice.toFixed(2)}</td>
        <td>${item.discount}%</td>
        <td>${item.netPrice.toFixed(2)}</td>
        <td>${item.profitMargin}%</td>
        <td><strong>${item.finalPrice.toFixed(2)}</strong></td>
      </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="8" style="text-align:right">GRAND TOTAL</td>
        <td>${grandTotal.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Generated by MetaPrice &bull; ${new Date().toISOString()}
  </div>
</body>
</html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
