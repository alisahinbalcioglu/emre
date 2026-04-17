import {
  Controller, Post, UseGuards, UseInterceptors, UploadedFile,
  Body, Res, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PdfToExcelService } from './pdf-to-excel.service';

@Controller('pdf-to-excel')
@UseGuards(JwtAuthGuard)
export class PdfToExcelController {
  constructor(private readonly service: PdfToExcelService) {}

  /**
   * PDF yukle, AI ile malzeme ayikla, Excel olarak dondur.
   * Admin yetkisi gerektirmez — her kullanici kullanabilir.
   */
  @Post('convert')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  }))
  async convert(
    @UploadedFile() file: Express.Multer.File,
    @Body('brandName') brandName: string | undefined,
    @Res() res: Response,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Dosya bulunamadi.');
    }

    const excelBuffer = await this.service.convert(file.buffer, brandName);

    const safeName = (brandName?.trim() || 'fiyat-listesi')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .slice(0, 64);
    const fileName = `${safeName}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': excelBuffer.length.toString(),
    });
    res.send(excelBuffer);
  }
}
