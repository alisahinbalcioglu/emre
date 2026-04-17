import { Module } from '@nestjs/common';
import { LaborMatchingService } from './labor-matching.service';
import { LaborMatchingController } from './labor-matching.controller';

@Module({
  providers: [LaborMatchingService],
  controllers: [LaborMatchingController],
  exports: [LaborMatchingService],
})
export class LaborMatchingModule {}
