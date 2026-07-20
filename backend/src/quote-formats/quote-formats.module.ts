import { Module } from '@nestjs/common';
import { QuoteFormatsService } from './quote-formats.service';
import { QuoteFormatsController } from './quote-formats.controller';

@Module({
  providers: [QuoteFormatsService],
  controllers: [QuoteFormatsController],
  exports: [QuoteFormatsService],
})
export class QuoteFormatsModule {}
