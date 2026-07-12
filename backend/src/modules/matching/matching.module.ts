import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { TerminologyService } from './terminology.service';
import { ExchangeRatesModule } from '../../exchange-rates/exchange-rates.module';

@Module({
  imports: [PrismaModule, ExchangeRatesModule],
  controllers: [MatchingController],
  providers: [MatchingService, TerminologyService],
  exports: [MatchingService, TerminologyService],
})
export class MatchingModule {}
