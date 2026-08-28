import { Module } from '@nestjs/common';
import { QuoteFormatsService } from './quote-formats.service';
import { QuoteFormatsController } from './quote-formats.controller';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [OdemeModule],
  providers: [QuoteFormatsService],
  controllers: [QuoteFormatsController],
  exports: [QuoteFormatsService],
})
export class QuoteFormatsModule {}
