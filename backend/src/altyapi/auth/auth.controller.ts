import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  // 15 dakikada 5 kayit denemesi — otomatik hesap uretimini engeller.
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // 15 dakikada 5 giris denemesi — sozluk saldirisini pratik olmaktan cikarir.
  // Sunucuya gunde binlerce SSH parola denemesi geliyor; ayni sey uygulama
  // giris ucu icin de gecerlidir ve burada hicbir kapi yoktu.
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id);
  }
}
