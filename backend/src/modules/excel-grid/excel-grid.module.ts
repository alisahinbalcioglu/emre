import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExcelGridService } from './excel-grid.service';
import { ExcelGridController } from './excel-grid.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ExcelGridController],
  providers: [ExcelGridService],
  exports: [ExcelGridService],
})
export class ExcelGridModule {}
