import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExcelEngineService } from './excel-engine.service';
import { ExcelEngineController } from './excel-engine.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ExcelEngineController],
  providers: [ExcelEngineService],
  exports: [ExcelEngineService],
})
export class ExcelEngineModule {}
