import { Controller, Post, Get, Body, HttpCode, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ParolaServisi } from './parola.servisi';
import { EpostaDogrulamaServisi } from './eposta-dogrulama.servisi';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ParolaSifirlamaIsteDto } from './dto/parola-sifirlama-iste.dto';
import { ParolaSifirlaDto } from './dto/parola-sifirla.dto';
import { ParolaDegistirDto } from './dto/parola-degistir.dto';
import { EpostaDogrulaDto } from './dto/eposta-dogrula.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EpostaHizSiniriGuard } from './guards/eposta-hiz-siniri.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private parola: ParolaServisi,
    private epostaDogrulama: EpostaDogrulamaServisi,
  ) {}

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

  // ── FAZ 3.3 · PAROLA SIFIRLAMA ────────────────────────────────────────
  //
  // ⚠ İKİ GUARD, İKİ AYRI KOVA (3.6). Sınıf düzeyindeki `ThrottlerGuard`
  // IP'ye göre sayar; `EpostaHizSiniriGuard` aynı @Throttle ayarını HEDEF
  // E-POSTA'ya göre sayar. Yalnız IP olsaydı, bot ağı olan biri TEK bir
  // kullanıcının gelen kutusunu bombalayabilirdi (hesabı ele geçmez ama
  // kutusu kullanılamaz hâle gelir ve gönderen itibarımız yanar).
  // Anahtarlar tracker'ı içerdiği için iki kova ÇAKIŞMAZ.
  //
  // 200 (201 değil): burada bir kaynak YARATILMIYOR ve yaratılıp
  // yaratılmadığını söylemek zaten numaralandırma sızıntısı olurdu.
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @UseGuards(EpostaHizSiniriGuard)
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ParolaSifirlamaIsteDto) {
    return this.parola.sifirlamaIste(dto.email);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ParolaSifirlaDto) {
    return this.parola.sifirla(dto.token, dto.yeniParola);
  }

  // ── FAZ 3.5 · PAROLA DEĞİŞTİRME (oturum açık) ─────────────────────────
  // Yanıt TAZE bir token taşır: `passwordChangedAt` damgası kullanıcının
  // elindeki token'ı da öldürür, ön yüz yenisini yazmazsa kullanıcı kendi
  // işlemiyle dışarı atılır.
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ParolaDegistirDto,
  ) {
    return this.parola.degistir(user.id, dto.mevcutParola, dto.yeniParola);
  }

  // ── FAZ 3.4 · E-POSTA DOĞRULAMA ───────────────────────────────────────
  // Guard YOK: bağlantıya tıklayan kullanıcı oturum açmamış olabilir
  // (başka bir tarayıcıdan/telefondan gelir). Kimlik token'ın kendisidir.
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: EpostaDogrulaDto) {
    return this.epostaDogrulama.dogrula(dto.token);
  }

  // Yeniden gönderim DAR sınırlı: her istek bir mail üretir ve Brevo ücretsiz
  // katmanı günde 300 mail.
  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: { id: string }) {
    return this.epostaDogrulama.yenidenGonder(user.id);
  }
}
