import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { ExcelGridService } from './excel-grid.service';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';

@Controller('excel-grid')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class ExcelGridController {
  constructor(private readonly service: ExcelGridService) {}

  @Post('prepare')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  @GerekliYetenek(Yetenek.EXCEL_YUKLE)
  async prepare(@UploadedFile() file: Express.Multer.File) {
    // SABIT SEMA (2026-07-08 kullanici karari): Excel'in KENDI fiyat/tutar
    // sutunlari ATILIR, yerine sabit sistem sutunlari (Malz/Isc Birim+Toplam+
    // Toplam) gelir. Marka secilince netFiyat×(1+kar%) HEP bu sabit sutuna
    // yazilir → farkli Excel'de sutun kaymasi imkansiz. Malzeme adi sutunu
    // artik icerikten tespit edilir (marka metni degil).
    return this.service.prepare(file.buffer, { fixedSchema: true });
  }
}
