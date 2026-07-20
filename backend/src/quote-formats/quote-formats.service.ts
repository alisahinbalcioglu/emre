import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { scanWorkbook, buildSampleFormat, sheetToGrid, FormatMapping } from './format-engine';

/**
 * PRD Teklif Formatim — kullanicinin teklif sablonlari (KAPAK+ICMAL).
 * Yukleme aninda taranir (T3 onizlemesi mapping'e yazilir); bytes oldugu
 * gibi saklanir — cikti uretimi (quotes.service) kapak/icmal'i BURADAN
 * kopyalar. Format guncellemesi yalniz YENI ciktilari etkiler (T11).
 */
@Injectable()
export class QuoteFormatsService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(id: string, userId: string) {
    const f = await (this.prisma as any).quoteFormat.findUnique({ where: { id } });
    if (!f || f.userId !== userId) throw new NotFoundException('Format bulunamadi');
    return f;
  }

  /** Yukle + tara. Ilk format otomatik varsayilan olur. */
  async upload(userId: string, fileBuffer: Buffer, fileName: string, name?: string) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer as any);
    } catch {
      throw new BadRequestException('Dosya .xlsx olarak okunamadi');
    }
    if (wb.worksheets.length === 0) {
      throw new BadRequestException('Dosyada sayfa yok');
    }
    const mapping = scanWorkbook(wb);
    const count = await (this.prisma as any).quoteFormat.count({ where: { userId } });
    const created = await (this.prisma as any).quoteFormat.create({
      data: {
        userId,
        name: (name?.trim() || fileName.replace(/\.(xlsx|xls)$/i, '')).slice(0, 80),
        fileName,
        fileBytes: fileBuffer,
        mapping: mapping as any,
        isDefault: count === 0,
      },
      select: { id: true, name: true, fileName: true, isDefault: true, mapping: true, createdAt: true },
    });
    return created;
  }

  /** Mevcut formatin DOSYASINI degistir (T11: eski ciktilar etkilenmez). */
  async replaceFile(userId: string, id: string, fileBuffer: Buffer, fileName: string) {
    await this.assertOwnership(id, userId);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer as any);
    } catch {
      throw new BadRequestException('Dosya .xlsx olarak okunamadi');
    }
    const mapping = scanWorkbook(wb);
    return (this.prisma as any).quoteFormat.update({
      where: { id },
      data: { fileBytes: fileBuffer, fileName, mapping: mapping as any },
      select: { id: true, name: true, fileName: true, isDefault: true, mapping: true },
    });
  }

  async list(userId: string) {
    return (this.prisma as any).quoteFormat.findMany({
      where: { userId },
      select: { id: true, name: true, fileName: true, isDefault: true, mapping: true, createdAt: true, updatedAt: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** FE onizleme: sayfalar ExcelGrid SheetData olarak + tarama sonucu. */
  async preview(userId: string, id: string) {
    const f = await this.assertOwnership(id, userId);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(f.fileBytes) as any);
    return {
      id: f.id,
      name: f.name,
      mapping: (f.mapping ?? scanWorkbook(wb)) as FormatMapping,
      sheets: wb.worksheets.map((ws) => sheetToGrid(ws, false)),
    };
  }

  async update(userId: string, id: string, dto: { name?: string; isDefault?: boolean }) {
    await this.assertOwnership(id, userId);
    if (dto.isDefault === true) {
      // Tek varsayilan: digerleri dusurulur
      await (this.prisma as any).$transaction([
        (this.prisma as any).quoteFormat.updateMany({ where: { userId }, data: { isDefault: false } }),
        (this.prisma as any).quoteFormat.update({ where: { id }, data: { isDefault: true } }),
      ]);
    }
    if (dto.name?.trim()) {
      await (this.prisma as any).quoteFormat.update({ where: { id }, data: { name: dto.name.trim().slice(0, 80) } });
    }
    return (this.prisma as any).quoteFormat.findUnique({
      where: { id },
      select: { id: true, name: true, isDefault: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(id, userId);
    await (this.prisma as any).quoteFormat.delete({ where: { id } });
    return { ok: true };
  }

  /** Indirilebilir ornek format (yer tutuculu sade KAPAK+ICMAL — T8 ikizi). */
  async sample(): Promise<{ buffer: Buffer; filename: string }> {
    const wb = buildSampleFormat();
    const buf = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buf), filename: 'MetaPrice-Ornek-Teklif-Formati.xlsx' };
  }
}
