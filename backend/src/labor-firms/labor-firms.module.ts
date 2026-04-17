import { Module } from '@nestjs/common';
import { LaborFirmsService } from './labor-firms.service';
import { LaborFirmsController } from './labor-firms.controller';
import { ExcelGridModule } from '../modules/excel-grid/excel-grid.module';

@Module({
  imports: [ExcelGridModule],
  providers: [LaborFirmsService],
  controllers: [LaborFirmsController],
  exports: [LaborFirmsService],
})
export class LaborFirmsModule {}
