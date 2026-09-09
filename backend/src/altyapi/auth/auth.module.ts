import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ParolaServisi } from './parola.servisi';
import { EpostaDogrulamaServisi } from './eposta-dogrulama.servisi';
import { HesapServisi } from './hesap.servisi';
import { jwtSecret } from './jwt-secret';
import { OdemeModule } from '../../ozellik/odeme/odeme.module';

@Module({
  imports: [
    PassportModule,
    // KL P1-a: anahtar TEK kaynaktan (jwt-secret.ts); yedek deger YOK —
    // tanimsizsa uygulama burada, acilista, gurultuyle olur.
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    // ADIM 2: /auth/me yaniti artik ERISIM kararini da tasiyor, bu yuzden
    // AuthModule ErisimServisi'ne ihtiyac duyar.
    // ⚠ Yon TEK: Auth → Odeme. OdemeModule AuthModule'u import ETMEZ
    // (guard'lari dosya duzeyinde import eder; `AuthGuard('jwt')` passport'un
    // kuresel strateji kaydini okur, modul bagi gerektirmez). Ters yon
    // eklenirse dairesel bagimlilik olusur ve Nest onyuklemede coker.
    OdemeModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    // FAZ 3: parola akışları ve e-posta doğrulama. İkisi de OdemeModule'ün
    // dışa açtığı EpostaServisi'ni kullanır — ikinci bir gönderici YOK.
    ParolaServisi,
    EpostaDogrulamaServisi,
    // FAZ 5.5 — KVKK m.11 uclari. `SatinAlmaServisi`ye ihtiyac duyar
    // (hesap kapatilinca abonelik de iptal edilmeli); o servis zaten
    // OdemeModule tarafindan disa aciliyor.
    HesapServisi,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
