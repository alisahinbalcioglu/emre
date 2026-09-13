import { Module } from '@nestjs/common';
import { LaborService } from './labor.service';
import { LaborController } from './labor.controller';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  // ⚠ OdemeModule ZORUNLU: ErisimGuard `ErisimServisi`yi enjekte eder.
  // Unutulursa hata DERLEMEDE değil AÇILIŞTA çıkar ve uygulama hiç kalkmaz.
  imports: [PrismaModule, OdemeModule],
  providers: [LaborService],
  controllers: [LaborController],
  exports: [LaborService],
})
export class LaborModule {}
