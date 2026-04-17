import { Module } from '@nestjs/common';
import { PdfToExcelController } from './pdf-to-excel.controller';
import { PdfToExcelService } from './pdf-to-excel.service';
import { AiModule } from '../../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [PdfToExcelController],
  providers: [PdfToExcelService],
})
export class PdfToExcelModule {}
