import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { AiModule } from '../../giris/ai/ai.module';
import { PrismaModule } from '../../../altyapi/db/prisma.module';
// PRD Teklif Formatim: kur notu (T12) icin exchange rates
import { ExchangeRatesModule } from '../../fiyat/exchange-rates/exchange-rates.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [AiModule, PrismaModule, ExchangeRatesModule, OdemeModule],
  providers: [QuotesService],
  controllers: [QuotesController],
})
export class QuotesModule {}
