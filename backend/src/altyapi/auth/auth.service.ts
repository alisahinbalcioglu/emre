import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../db/prisma.service';
import { jwtSecret } from './jwt-secret';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { getFirmaCapabilities } from './capabilities.helper';
import { ErisimServisi } from '../../ozellik/odeme/abonelik/erisim.servisi';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private erisim: ErisimServisi,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    // ADIM 1 (firma): hesap artik KISI degil FIRMA. Her yeni kayit KENDI
    // firmasini acar ve o firmanin SAHIBI olur. Ic ice create tek islemdir —
    // kullanici olusup firma olusmazsa ortada suzgeclerin hicbir satiri
    // gormedigi "firmasiz hesap" kalirdi. Firma adi simdilik e-postanin @
    // oncesi parcasi (backfill ile ayni kural); sahibi ADIM 2'de degistirecek.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        firmaRol: 'sahip',
        firma: { create: { ad: dto.email.split('@')[0] } },
      },
    });

    const token = this.signToken(user.id, user.email, user.role);
    return { token, user: { id: user.id, email: user.email, role: user.role, tier: user.tier } };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.signToken(user.id, user.email, user.role);
    return { token, user: { id: user.id, email: user.email, role: user.role, tier: user.tier } };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        tier: true,
        createdAt: true,
        firmaId: true,
      },
    });
    if (!user) return null;

    const capabilities = await getFirmaCapabilities(this.prisma, user.firmaId);
    const subscriptions = await this.prisma.userSubscription.findMany({
      where: { userId, active: true },
      select: { id: true, level: true, scope: true, startsAt: true, endsAt: true },
    });

    // ADIM 2: YETENEK ile ERISIM ayri iki sorudur (bkz. capabilities.helper.ts).
    // `capabilities` = ne satin alindi · `erisim` = su an kullanilabilir mi.
    // Ikisi de BURADAN doner cunku on yuzun tek besleme noktasi /auth/me'dir
    // (login yaniti bunlari TASIMAZ — olculdu: auth.service.ts:55 yalniz
    // {id,email,role,tier} doner). Serit, kilitli butonlar ve "kalan gun"
    // sayaci bu tek yanittan beslenir.
    const erisim = user.firmaId
      ? await this.erisim.karar(user.firmaId)
      : null;

    return { ...user, capabilities, subscriptions, erisim };
  }

  private signToken(id: string, email: string, role: string) {
    return this.jwtService.sign(
      { sub: id, email, role },
      {
        // KL P1-a: yedek deger yok — anahtar tek kaynaktan (jwt-secret.ts).
        // Sure kurali DEGISMEDI (JWT_EXPIRES_IN ?? 7d).
        secret: jwtSecret(),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      },
    );
  }
}
