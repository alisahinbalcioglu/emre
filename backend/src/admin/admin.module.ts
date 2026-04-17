import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ExcelGridModule } from '../modules/excel-grid/excel-grid.module';

@Module({
  imports: [PrismaModule, AiModule, ExcelGridModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
