import { Module } from '@nestjs/common';
import { DwgEngineController } from './dwg-engine.controller';
import { DwgEngineService } from './dwg-engine.service';
import { DwgSahiplikServisi } from './dwg-sahiplik.servisi';
import { OdemeModule } from '../../ozellik/odeme/odeme.module';

@Module({
  imports: [OdemeModule],
  controllers: [DwgEngineController],
  providers: [DwgEngineService, DwgSahiplikServisi],
  exports: [DwgEngineService],
})
export class DwgEngineModule {}
