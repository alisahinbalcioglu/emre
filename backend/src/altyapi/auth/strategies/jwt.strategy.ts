import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../db/prisma.service';
import { jwtSecret } from '../jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // KL P1-a: dogrulama anahtari da TEK kaynaktan — imzalayan ve dogrulayan
      // ayni degeri okur; yedek deger yok.
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException();
    // ADIM 1 (firma): kimligin DAR BOGAZI burasi — 55 tuketici bu sekli okur.
    // firmaId EKLENIR (var olan alanlar aynen kalir, hicbir tuketici kirilmaz):
    // teklif/kutuphane suzgecleri artik kisiyi degil FIRMAYI temel alacak.
    // Sorgu zaten kullaniciyi cekiyordu — ek maliyet YOK.
    return { id: user.id, email: user.email, role: user.role, firmaId: user.firmaId };
  }
}
