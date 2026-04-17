import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExcelGridService } from './excel-grid.service';

@Controller('excel-grid')
@UseGuards(JwtAuthGuard)
export class ExcelGridController {
  constructor(private readonly service: ExcelGridService) {}

  @Post('prepare')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async prepare(@UploadedFile() file: Express.Multer.File) {
    // Teklif akisi — dosyadaki fiyatlari temizle (kullanici marka/firma secene kadar bos kalsin)
    return this.service.prepare(file.buffer, { stripPrices: true });
  }
}
