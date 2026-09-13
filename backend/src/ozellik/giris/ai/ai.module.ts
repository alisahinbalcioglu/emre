import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CeviriService } from './ceviri.service';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  // ⚠ OdemeModule ZORUNLU: ErisimGuard `ErisimServisi`yi enjekte eder.
  imports: [PrismaModule, OdemeModule],
  controllers: [AiController],
  providers: [AiService, CeviriService],
  exports: [AiService, CeviriService],
})
export class AiModule {}
