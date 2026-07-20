import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
// PRD Teklif Formatim: kur notu (T12) icin exchange rates
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [AiModule, PrismaModule, ExchangeRatesModule],
  providers: [QuotesService],
  controllers: [QuotesController],
})
export class QuotesModule {}
