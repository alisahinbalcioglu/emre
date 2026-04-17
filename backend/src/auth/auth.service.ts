import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { getUserCapabilities } from './capabilities.helper';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: hashed },
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
      select: { id: true, email: true, role: true, tier: true, createdAt: true },
    });
    if (!user) return null;
    const capabilities = await getUserCapabilities(this.prisma, userId);
    const subscriptions = await this.prisma.userSubscription.findMany({
      where: { userId, active: true },
      select: { id: true, level: true, scope: true, startsAt: true, endsAt: true },
    });
    return { ...user, capabilities, subscriptions };
  }

  private signToken(id: string, email: string, role: string) {
    return this.jwtService.sign(
      { sub: id, email, role },
      {
        secret: process.env.JWT_SECRET || 'metaprice-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      },
    );
  }
}
