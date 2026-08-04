import { Controller, Get } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';

/** Canli kur — PUBLIC endpoint (hassas veri degil; login sayfasi dahil her
 *  yerden cekilebilsin diye guard YOK). Kaynak: TCMB, fallback: er-api. */
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  @Get()
  getRates() {
    return this.service.getRates();
  }
}
