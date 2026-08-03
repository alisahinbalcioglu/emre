import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { jwtSecret } from './jwt-secret';

@Module({
  imports: [
    PassportModule,
    // KL P1-a: anahtar TEK kaynaktan (jwt-secret.ts); yedek deger YOK —
    // tanimsizsa uygulama burada, acilista, gurultuyle olur.
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
