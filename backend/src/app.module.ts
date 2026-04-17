import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { MaterialsModule } from './materials/materials.module';
import { LibraryModule } from './library/library.module';
import { QuotesModule } from './quotes/quotes.module';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { LaborModule } from './labor/labor.module';
import { LaborFirmsModule } from './labor-firms/labor-firms.module';
import { ExcelEngineModule } from './modules/excel-engine/excel-engine.module';
import { ExcelGridModule } from './modules/excel-grid/excel-grid.module';
import { MatchingModule } from './modules/matching/matching.module';
import { LaborMatchingModule } from './modules/labor-matching/labor-matching.module';
import { DwgEngineModule } from './modules/dwg-engine/dwg-engine.module';
import { PdfToExcelModule } from './modules/pdf-to-excel/pdf-to-excel.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BrandsModule,
    MaterialsModule,
    LibraryModule,
    QuotesModule,
    AdminModule,
    AiModule,
    LaborModule,
    LaborFirmsModule,
    ExcelEngineModule,
    ExcelGridModule,
    MatchingModule,
    LaborMatchingModule,
    DwgEngineModule,
    PdfToExcelModule,
  ],
})
export class AppModule {}
