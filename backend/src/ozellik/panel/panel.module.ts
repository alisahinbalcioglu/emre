import { Module } from '@nestjs/common';
import { PanelServisi } from './panel.servisi';
import { PanelController } from './panel.controller';

@Module({
  providers: [PanelServisi],
  controllers: [PanelController],
  exports: [PanelServisi],
})
export class PanelModule {}
