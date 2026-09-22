import { Module } from '@nestjs/common';
import { LaborFirmsService } from './labor-firms.service';
import { LaborFirmsController } from './labor-firms.controller';
import { ExcelGridModule } from '../../giris/excel-grid/excel-grid.module';
// L2 index-at-creation: ice aktarim v2 indeksleyiciyi MatchingService'ten alir
import { MatchingModule } from '../../eslestirme/matching/matching.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [ExcelGridModule, MatchingModule, OdemeModule],
  providers: [LaborFirmsService],
  controllers: [LaborFirmsController],
  exports: [LaborFirmsService],
})
export class LaborFirmsModule {}
