import { Module } from '@nestjs/common';
import { LaborFirmsService } from './labor-firms.service';
import { LaborFirmsController } from './labor-firms.controller';
import { ExcelGridModule } from '../modules/excel-grid/excel-grid.module';
// L2 index-at-creation: ice aktarim v2 indeksleyiciyi MatchingService'ten alir
import { MatchingModule } from '../modules/matching/matching.module';

@Module({
  imports: [ExcelGridModule, MatchingModule],
  providers: [LaborFirmsService],
  controllers: [LaborFirmsController],
  exports: [LaborFirmsService],
})
export class LaborFirmsModule {}
