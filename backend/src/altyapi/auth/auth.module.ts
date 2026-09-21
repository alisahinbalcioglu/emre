import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ParolaServisi } from './parola.servisi';
import { EpostaDogrulamaServisi } from './eposta-dogrulama.servisi';
import { HesapServisi } from './hesap.servisi';
import { OturumServisi } from './oturum.servisi';
import { MfaServisi } from './mfa/mfa.servisi';
import { MfaController } from './mfa/mfa.controller';
import { KurumsalGirisServisi } from './kurumsal/kurumsal-giris.servisi';
import { KurumsalGirisController } from './kurumsal/kurumsal-giris.controller';
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
    // FAZ 7 F1b — token veren TEK kapi (§3.11). F2b (MFA) ve F3b (kurumsal
    // giris) de bunu kullanacak; her yol kendi kapisini yazarsa biri mutlaka
    // ban ya da yumusak silme kontrolunu unutur.
    OturumServisi,
    // FAZ 7 F2b — iki adimli giris (§4.4). `EpostaServisi`yi OdemeModule
    // disa aciyor; ikinci bir gonderici YOK.
    MfaServisi,
    // FAZ 7 F3b — kurumsal giris (§5.4). ⚠ AuthModule FirmaModule'u
    // import ETMEZ: koltuk ve kilit SAF fonksiyonlari `uyelik-kurallari.ts`ten
    // dosya duzeyinde alinir (ters yon dairesel bagimlilik uretirdi).
    KurumsalGirisServisi,
  ],
  controllers: [AuthController, MfaController, KurumsalGirisController],
  // ⚠ `ParolaServisi` F3b'de disa acilir: sirket girisi kapatilinca
  // parolasiz uyelere parola belirleme baglantisi gider (§5.11).
  exports: [AuthService, OturumServisi, MfaServisi, KurumsalGirisServisi, ParolaServisi],
})
export class AuthModule {}
