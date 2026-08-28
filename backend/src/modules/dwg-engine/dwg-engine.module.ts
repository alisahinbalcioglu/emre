import { Module } from '@nestjs/common';
import { DwgEngineController } from './dwg-engine.controller';
import { DwgEngineService } from './dwg-engine.service';
import { OdemeModule } from '../../ozellik/odeme/odeme.module';

@Module({
  imports: [OdemeModule],
  controllers: [DwgEngineController],
  providers: [DwgEngineService],
  exports: [DwgEngineService],
})
export class DwgEngineModule {}
