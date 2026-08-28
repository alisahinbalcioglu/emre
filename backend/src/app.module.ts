import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { BootstrapController } from './bootstrap.controller';
import { PrismaModule } from './altyapi/db/prisma.module';
import { AuthModule } from './altyapi/auth/auth.module';
import { BrandsModule } from './ozellik/kutuphane/brands/brands.module';
import { MaterialsModule } from './ozellik/kutuphane/materials/materials.module';
import { LibraryModule } from './ozellik/kutuphane/library/library.module';
import { QuotesModule } from './ozellik/teklif/quotes/quotes.module';
import { AdminModule } from './ozellik/kutuphane/admin/admin.module';
import { AiModule } from './ozellik/giris/ai/ai.module';
import { LaborModule } from './ozellik/kutuphane/labor/labor.module';
import { LaborFirmsModule } from './ozellik/kutuphane/labor-firms/labor-firms.module';
import { ExcelEngineModule } from './ozellik/giris/excel-engine/excel-engine.module';
import { ExcelGridModule } from './ozellik/giris/excel-grid/excel-grid.module';
import { MatchingModule } from './ozellik/eslestirme/matching/matching.module';
import { LaborMatchingModule } from './ozellik/eslestirme/labor-matching/labor-matching.module';
import { DwgEngineModule } from './modules/dwg-engine/dwg-engine.module';
import { ExchangeRatesModule } from './ozellik/fiyat/exchange-rates/exchange-rates.module';
import { QuoteFormatsModule } from './ozellik/cikti/quote-formats/quote-formats.module';
import { OdemeModule } from './ozellik/odeme/odeme.module';

@Module({
  imports: [
    // ADIM 2 (28.08): @nestjs/config KOK'te bir kez kurulur.
    // `isGlobal: true` OLMADAN ConfigService yalnizca ConfigModule'u ACIKCA
    // import eden modullerde cozulur; OdemeModule icindeki `imports:
    // [ConfigModule]` satiri forRoot cagrilmadigi surece SAGLAYICI URETMEZ
    // ve butun odeme saglayicilari onyuklemede "Nest can't resolve
    // dependencies of IyzicoClient (?)" ile patlar.
    ConfigModule.forRoot({ isGlobal: true }),
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
    ExchangeRatesModule,
    QuoteFormatsModule,
    OdemeModule,
  ],
  controllers: [HealthController, BootstrapController],
})
export class AppModule {}
