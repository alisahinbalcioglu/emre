import { Module } from '@nestjs/common';
import { LaborMatchingService } from './labor-matching.service';
import { LaborMatchingController } from './labor-matching.controller';
// PRD Iscilik L9: tek motor — MatchingService buradan enjekte edilir
import { MatchingModule } from '../matching/matching.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [MatchingModule, OdemeModule],
  providers: [LaborMatchingService],
  controllers: [LaborMatchingController],
  exports: [LaborMatchingService],
})
export class LaborMatchingModule {}
