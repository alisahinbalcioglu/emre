import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CeviriService } from './ceviri.service';
import { CeviriDuzeltmeController } from './ceviri-duzeltme.controller';
import { CeviriDuzeltmeServisi } from './ceviri-duzeltme.servisi';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  // ⚠ OdemeModule ZORUNLU: ErisimGuard `ErisimServisi`yi enjekte eder.
  imports: [PrismaModule, OdemeModule],
  // Faz 6.9: firma çeviri düzeltmesi (firma katmanı uçları + iş kuralları).
  controllers: [AiController, CeviriDuzeltmeController],
  providers: [AiService, CeviriService, CeviriDuzeltmeServisi],
  exports: [AiService, CeviriService],
})
export class AiModule {}
