import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { TerminologyService } from './terminology.service';
import { ExchangeRatesModule } from '../../fiyat/exchange-rates/exchange-rates.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [PrismaModule, ExchangeRatesModule, OdemeModule],
  controllers: [MatchingController],
  providers: [MatchingService, TerminologyService],
  exports: [MatchingService, TerminologyService],
})
export class MatchingModule {}
