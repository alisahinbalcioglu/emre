import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
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
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
