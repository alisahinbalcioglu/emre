import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { AiModule } from '../../giris/ai/ai.module';
import { ExcelGridModule } from '../../giris/excel-grid/excel-grid.module';
import { MatchingModule } from '../../eslestirme/matching/matching.module';

@Module({
  imports: [PrismaModule, AiModule, ExcelGridModule, MatchingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
