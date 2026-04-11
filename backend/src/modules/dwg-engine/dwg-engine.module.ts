import { Module } from '@nestjs/common';
import { DwgEngineController } from './dwg-engine.controller';
import { DwgEngineService } from './dwg-engine.service';

@Module({
  controllers: [DwgEngineController],
  providers: [DwgEngineService],
  exports: [DwgEngineService],
})
export class DwgEngineModule {}
