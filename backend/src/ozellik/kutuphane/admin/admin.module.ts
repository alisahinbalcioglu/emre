import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminKurumsalGirisController } from './admin-kurumsal-giris.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { AiModule } from '../../giris/ai/ai.module';
import { ExcelGridModule } from '../../giris/excel-grid/excel-grid.module';
import { MatchingModule } from '../../eslestirme/matching/matching.module';
// FAZ 7 F1b (E-1): yonetici silmesi hesap kapatmanin ikizi — tek kullanicili
// firmada abonelik de iptal edilir, bu yuzden `SatinAlmaServisi` gerekir.
// ⚠ DONGU YOK (olculdu): `odeme.module.ts:45` yalniz ConfigModule ve
// ScheduleModule.forRoot() import eder; AdminModule'u gormez. Nest statik
// modulleri tekillestirir — `ScheduleModule.forRoot()` iki kez kosmaz.
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [PrismaModule, AiModule, ExcelGridModule, MatchingModule, OdemeModule],
  controllers: [AdminController, AdminKurumsalGirisController],
  providers: [AdminService],
})
export class AdminModule {}
