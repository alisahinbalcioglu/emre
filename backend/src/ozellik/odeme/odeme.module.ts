import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IyzicoHataSuzgeci } from './iyzico/iyzico-hata.filter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { IyzicoClient } from './iyzico/iyzico.client';
import { IyzicoWebhookController } from './webhook/webhook.controller';
import { WebhookIsleyici } from './webhook/webhook.isleyici';
import { AbonelikServisi } from './abonelik/abonelik.servisi';
import { ErisimServisi } from './abonelik/erisim.servisi';
import { SatinAlmaServisi } from './abonelik/satinalma.servisi';
import { AbonelikController } from './abonelik/abonelik.controller';
import { MutabakatJob } from './abonelik/mutabakat.job';
import { DunningServisi } from './dunning/dunning.servisi';
import { FaturaServisi } from './fatura/fatura.servisi';
import {
  MUHASEBE_ADAPTORU,
  ParasutAdaptoru,
  SahteMuhasebeAdaptoru,
} from './fatura/muhasebe.adaptor';
import { HavaleServisi } from './havale/havale.servisi';
import { HavaleController } from './havale/havale.controller';
import { EpostaServisi } from './eposta/eposta.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Ödeme modülü
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  AppModule'e ekleyin:
 *      imports: [ …, OdemeModule ]
 *
 *  ScheduleModule.forRoot() zaten AppModule'de varsa buradakini silin —
 *  iki kez çağrılırsa zamanlanmış işler iki kez çalışır.
 *
 *  PrismaModule'ünüz global değilse imports'a ekleyin.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [IyzicoWebhookController, HavaleController, AbonelikController],
  providers: [
    {
      // ⚠ APP_FILTER burada tanimlansa da NEST'TE GLOBALDIR. Bilerek:
      // `IyzicoHatasi` yalniz odeme modulunden cikar, kural da odeme
      // klasorunde dursun (Grup N izolasyonu). 02.09'da bu suzgec
      // YOKKEN iyzico'nun reddi kullaniciya duz `500 Internal server
      // error` olarak donuyordu ve hangi alanin hatali oldugu
      // GORUNMUYORDU.
      provide: APP_FILTER,
      useClass: IyzicoHataSuzgeci,
    },
    IyzicoClient,
    WebhookIsleyici,
    AbonelikServisi,
    SatinAlmaServisi,
    ErisimServisi,
    MutabakatJob,
    DunningServisi,
    FaturaServisi,
    HavaleServisi,
    EpostaServisi,
    ParasutAdaptoru,
    SahteMuhasebeAdaptoru,
    {
      // Geliştirmede sahte adaptör, üretimde Paraşüt.
      // MUHASEBE_SAGLAYICI=parasut olmadıkça hiçbir yere fatura gitmez.
      provide: MUHASEBE_ADAPTORU,
      inject: [ConfigService, ParasutAdaptoru, SahteMuhasebeAdaptoru],
      useFactory: (
        config: ConfigService,
        parasut: ParasutAdaptoru,
        sahte: SahteMuhasebeAdaptoru,
      ) =>
        config.get('MUHASEBE_SAGLAYICI') === 'parasut' ? parasut : sahte,
    },
  ],
  // ErisimServisi'ni dışa açıyoruz: teklif/metraj modülleriniz
  // yetenek kontrolü için bunu kullanacak.
  exports: [ErisimServisi, AbonelikServisi, SatinAlmaServisi, IyzicoClient],
})
export class OdemeModule {}
