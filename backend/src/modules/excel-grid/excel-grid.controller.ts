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
    // SABIT SEMA (2026-07-08 kullanici karari): Excel'in KENDI fiyat/tutar
    // sutunlari ATILIR, yerine sabit sistem sutunlari (Malz/Isc Birim+Toplam+
    // Toplam) gelir. Marka secilince netFiyat×(1+kar%) HEP bu sabit sutuna
    // yazilir → farkli Excel'de sutun kaymasi imkansiz. Malzeme adi sutunu
    // artik icerikten tespit edilir (marka metni degil).
    return this.service.prepare(file.buffer, { fixedSchema: true });
  }
}
