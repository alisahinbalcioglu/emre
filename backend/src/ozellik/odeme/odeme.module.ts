import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IyzicoHataSuzgeci } from './iyzico/iyzico-hata.filter';
import { IyzicoDonusController } from './abonelik/iyzico-donus.controller';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { IyzicoClient } from './iyzico/iyzico.client';
import { IyzicoWebhookController } from './webhook/webhook.controller';
import { WebhookIsleyici } from './webhook/webhook.isleyici';
import { AbonelikServisi } from './abonelik/abonelik.servisi';
import { ErisimServisi } from './abonelik/erisim.servisi';
import { SatinAlmaServisi } from './abonelik/satinalma.servisi';
import { DenemeHakkiServisi } from './abonelik/deneme-hakki.servisi';
import { PaketDegisimiServisi } from './abonelik/paket-degisimi.servisi';
import { AbonelikController } from './abonelik/abonelik.controller';
import { YoneticiAbonelikController } from './abonelik/yonetici/yonetici-abonelik.controller';
import { YoneticiAbonelikServisi } from './abonelik/yonetici/yonetici-abonelik.servisi';
import { YoneticiDusurmeServisi } from './abonelik/yonetici/yonetici-dusurme.servisi';
import { FiyatController } from './abonelik/fiyat.controller';
import { CeviriKotaServisi } from './abonelik/ceviri-kota.servisi';
import { MutabakatJob } from './abonelik/mutabakat.job';
import { DunningServisi } from './dunning/dunning.servisi';
import { FaturaServisi } from './fatura/fatura.servisi';
import {
  ElleMuhasebeAdaptoru,
  MUHASEBE_ADAPTORU_SAGLAYICISI,
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
  controllers: [
    // ⚠ Guard'siz: iyzico'nun donus POST'u capraz-site gelir, cerez
    // tasimaz. Kimlik token'in kendisidir (bkz. controller notu).
    IyzicoDonusController,
    IyzicoWebhookController,
    HavaleController,
    AbonelikController,
    // 24.09 (A2): yonetici paket islemleri — sinif duzeyinde @Roles('admin').
    YoneticiAbonelikController,
    // ⚠ JWT'siz (Faz 6.1): fiyat sayfası girişsiz ziyaretçiye açıktır. Yalnız
    // OKUR, ThrottlerGuard ile IP başına sınırlı (bkz. controller notu).
    FiyatController,
  ],
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
    // Faz 6.12a: deneme bir kez — satin alma ve JWT'li paket ucu kullanir.
    DenemeHakkiServisi,
    // 23.09: paket degisimi + 10 dk'lik planli gecis taramasi (@Cron).
    PaketDegisimiServisi,
    // 24.09 (A2): yonetici paneli — ayni cekirdegi (islemciyleDegistir) kullanir.
    YoneticiAbonelikServisi,
    YoneticiDusurmeServisi,
    ErisimServisi,
    CeviriKotaServisi,
    MutabakatJob,
    DunningServisi,
    FaturaServisi,
    HavaleServisi,
    EpostaServisi,
    ParasutAdaptoru,
    SahteMuhasebeAdaptoru,
    ElleMuhasebeAdaptoru,
    // MUHASEBE_SAGLAYICI: "elle" (canlı varsayılanı, compose) → yöneticiye
    // NES kesim talebi e-postası · "parasut" → Paraşüt · boş/"sahte" → sahte
    // (geliştirme/test; yalnız günlüğe yazar). Seçim ve kapısı:
    // `muhasebe.adaptor.ts` → MUHASEBE_ADAPTORU_SAGLAYICISI.
    MUHASEBE_ADAPTORU_SAGLAYICISI,
  ],
  // ErisimServisi'ni dışa açıyoruz: teklif/metraj modülleriniz
  // yetenek kontrolü için bunu kullanacak.
  //
  // EpostaServisi de dışa açık (Faz 3.2): parola sıfırlama ve e-posta
  // doğrulama AuthModule'de yaşar ama AYNI göndericiyi kullanmak ZORUNDA —
  // ikinci bir gönderici, gönderen adresini ve şablonu ikiye bölerdi.
  // AuthModule zaten OdemeModule'ü import ediyor (ErisimServisi için), yani
  // yeni bir modül bağı ya da dairesel bağımlılık OLUŞMUYOR.
  exports: [
    ErisimServisi,
    // Faz 6.2: AiModule çeviri kotasını buradan ayırır/sonuçlandırır.
    CeviriKotaServisi,
    AbonelikServisi,
    SatinAlmaServisi,
    // 23.09: yonetici paneli (A2) musteriyle AYNI degisim yolunu kullanir —
    // ikinci bir "paket degistir" yazilmaz (Emre karari: tek yol).
    PaketDegisimiServisi,
    IyzicoClient,
    EpostaServisi,
  ],
})
export class OdemeModule {}
