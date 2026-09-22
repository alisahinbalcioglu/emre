import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { ExcelGridService } from './excel-grid.service';
import { ExcelGridController } from './excel-grid.controller';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [PrismaModule, OdemeModule],
  controllers: [ExcelGridController],
  providers: [ExcelGridService],
  exports: [ExcelGridService],
})
export class ExcelGridModule {}
