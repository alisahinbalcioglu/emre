import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { MfaServisi } from './mfa.servisi';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { KoltukDisiIzinli } from '../decorators/koltuk-disi-izinli.decorator';
import {
  MfaDogrulaDto,
  MfaKapatDto,
  MfaKodDto,
  MfaKurulumBaslatDto,
  MfaMeydanOkumaDto,
  MfaZorunluKurulumOnaylaDto,
} from './dto/mfa.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — IKI ADIMLI GIRIS UCLARI (§4.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── IKI AILE, IKI FARKLI GUARD ──────────────────────────────────────────
 *  1) GUARDSIZ (giris akisinin ikinci adimi): `dogrula`,
 *     `zorunlu-kurulum/baslat|onayla`. Kullanici HENUZ oturumda DEGIL;
 *     kimligi MEYDAN OKUMA token'i tasir. Bu token oturum SAYILMAZ
 *     (§4.5 iki katman) ve bu uclar `KIMLIK_UCLARI`na eklenir ki 401
 *     kullaniciyi 1. adima dondursun.
 *  2) OTURUMLU (`JwtAuthGuard`): kurulum, kapatma, kod yenileme, sirket
 *     girisi ayari. Hepsi `@KoltukDisiIzinli` tasir — kisi sinirini asan
 *     hesap 403 alir ama HESABINI GUVENE ALABILMELIDIR; guvenlik ayarini
 *     odeme durumuna baglamak yanlis olurdu (`GET /auth/me` ve KVKK
 *     uclariyla ayni gerekce).
 *
 *  ⚠ Hiz sinirlari IP kovasidir (§4.8); asil kapi kisi kovasidir
 *  (`mfaHataSayaci`) — IP degistiren saldirgan onu asamaz.
 */
@Controller('auth/mfa')
@UseGuards(ThrottlerGuard)
export class MfaController {
  constructor(private readonly mfa: MfaServisi) {}

  // ── GUARDSIZ: GIRIS AKISININ IKINCI ADIMI ────────────────────────────

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('dogrula')
  @HttpCode(200)
  dogrula(@Body() dto: MfaDogrulaDto) {
    return this.mfa.dogrula(dto.meydanOkuma, {
      kod: dto.kod,
      kurtarmaKodu: dto.kurtarmaKodu,
    });
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('zorunlu-kurulum/baslat')
  @HttpCode(200)
  zorunluKurulumBaslat(@Body() dto: MfaMeydanOkumaDto) {
    return this.mfa.zorunluKurulumBaslat(dto.meydanOkuma);
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('zorunlu-kurulum/onayla')
  @HttpCode(200)
  zorunluKurulumOnayla(@Body() dto: MfaZorunluKurulumOnaylaDto) {
    return this.mfa.zorunluKurulumOnayla(dto.meydanOkuma, dto.kod);
  }

  // ── OTURUMLU: PROFIL → GUVENLIK KARTI ────────────────────────────────

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('kurulum/baslat')
  @UseGuards(JwtAuthGuard)
  @KoltukDisiIzinli()
  @HttpCode(200)
  kurulumBaslat(@CurrentUser() user: any, @Body() dto: MfaKurulumBaslatDto) {
    // ⚠ `authAt` TOKEN'DAN gelir (strateji dondu), govdeden DEGIL: istemci
    // "az once giris yaptim" diye kendi kendini kanitlayamaz.
    return this.mfa.kurulumBaslat(user.id, { parola: dto.parola }, user.authAt ?? null);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('kurulum/onayla')
  @UseGuards(JwtAuthGuard)
  @KoltukDisiIzinli()
  @HttpCode(200)
  kurulumOnayla(@CurrentUser() user: any, @Body() dto: MfaKodDto) {
    return this.mfa.kurulumOnayla(user.id, dto.kod, user.authAt ?? null);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('kapat')
  @UseGuards(JwtAuthGuard)
  @KoltukDisiIzinli()
  @HttpCode(200)
  kapat(@CurrentUser() user: any, @Body() dto: MfaKapatDto) {
    return this.mfa.kapat(
      user.id,
      { parola: dto.parola, kod: dto.kod, kurtarmaKodu: dto.kurtarmaKodu },
      user.authAt ?? null,
    );
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('kurtarma-kodlari/yenile')
  @UseGuards(JwtAuthGuard)
  @KoltukDisiIzinli()
  @HttpCode(200)
  kurtarmaKodlariniYenile(@CurrentUser() user: any, @Body() dto: MfaKodDto) {
    return this.mfa.kurtarmaKodlariniYenile(user.id, dto.kod);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('sirket-girisinde-de-sor')
  @UseGuards(JwtAuthGuard)
  @KoltukDisiIzinli()
  @HttpCode(200)
  sirketGirisindeDeSor(@CurrentUser() user: any, @Body() dto: MfaKodDto) {
    return this.mfa.sirketGirisindeDeSor(user.id, dto.kod);
  }
}
