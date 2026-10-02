import { Controller, Get } from '@nestjs/common';
import { ExchangeRatesService, kurGecerli } from './exchange-rates.service';

/** Canli kur — PUBLIC endpoint (hassas veri degil; login sayfasi dahil her
 *  yerden cekilebilsin diye guard YOK). Kaynak: TCMB, fallback: er-api. */
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  /** C10 (Paket 4a, 01.10.2026): `gecerli` = eslestirme ve teklif ciktisinin
   *  kullandigi `kurGecerli` kurali (5 is gununden eski kur gecersiz). On yuz
   *  gosterimi esigi kendisi TUTMAZ, bu alani okur (frontend
   *  `ozellik/fiyat/para-gosterim.ts` `kurKullanilabilir`) — ekran ve dosya
   *  ayni karari verir (inceleme: bayat kurla "ekran $, dosya ₺"). */
  @Get()
  async getRates() {
    const r = await this.service.getRates();
    return { ...r, gecerli: kurGecerli(r, 'USD') && kurGecerli(r, 'EUR') };
  }
}
