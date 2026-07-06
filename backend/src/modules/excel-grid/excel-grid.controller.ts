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
    // KULLANICI KARARI (2026-07-07): dosyadaki fiyatlar SILINMEZ, oldugu gibi
    // gelir. Eski davranis (stripPrices:true) "orijinal Excel'de fiyatlar dolu
    // ama grid'de bos" sikayetine yol acti. Marka eslestirme fiyatlari yine
    // uzerine yazabilir; merge'de kullanici emegi korunur.
    return this.service.prepare(file.buffer, { stripPrices: false });
  }
}
