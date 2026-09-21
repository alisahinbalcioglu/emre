import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { KurumsalGirisServisi } from './kurumsal-giris.servisi';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { EpostaHizSiniriGuard } from '../guards/eposta-hiz-siniri.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { KoltukDisiIzinli } from '../decorators/koltuk-disi-izinli.decorator';
import {
  SsoBaglantiKaldirDto,
  SsoBaslatDto,
  SsoDegisDto,
  SsoKatilDto,
  SsoKesfetDto,
  SsoNiyetDto,
} from './dto/kurumsal.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS UCLARI (§5.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── UC UC AILESI ────────────────────────────────────────────────────────
 *  1) GUARDSIZ (giris akisi): `kesfet`, `baslat`, `donus`, `degis`, `katil`.
 *     Kullanici HENUZ oturumda degil; kimligi akis satiri + SEKME SIRRI
 *     tasir. `degis` ve `katil` `KIMLIK_UCLARI`na eklenir ki 401 sayfayi
 *     yeniden yuklemek yerine "yeniden deneyin" desin.
 *  2) OTURUMLU: `niyet` (sina/bagla baslatma) ve `DELETE baglanti`.
 *     ⚠ `DELETE baglanti` `@KoltukDisiIzinli` TASIR (mutant #38): kisi
 *     sinirini asip durdurulmus bir uye hesabinin giris yolunu
 *     kaldirabilmeli — guvenlik ayari odeme/koltuk durumuna baglanamaz.
 *
 *  ⚠ CEREZ YOK: `donus` yalniz `res.redirect` cagirir. `res.cookie` ya da
 *  `Set-Cookie` bu dosyada (ve `backend/src`in tamaminda) YOKTUR — hukuki
 *  metinlerdeki "hicbir yerde cerez yazmiyoruz" beyaninin kapisi K28'dir.
 */
@Controller('auth/sso')
@UseGuards(ThrottlerGuard)
export class KurumsalGirisController {
  constructor(private readonly kurumsal: KurumsalGirisServisi) {}

  /**
   * Giris ekrani, e-posta yazilinca bunu sorar. ⚠ Bilinmeyen alan adi ile
   * ETKIN olmayan saglayici BIREBIR AYNI yaniti verir (K20): bu uc bir
   * "kimler kayitli" oracle'i DEGILDIR.
   */
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  @UseGuards(EpostaHizSiniriGuard)
  @Post('kesfet')
  @HttpCode(200)
  kesfet(@Body() dto: SsoKesfetDto) {
    return this.kurumsal.kesfet(dto.email);
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('baslat')
  @HttpCode(200)
  baslat(@Body() dto: SsoBaslatDto) {
    return this.kurumsal.baslat(dto.saglayiciId, dto.tarayiciBagi);
  }

  /** Oturumdaki kisinin "sina"/"bagla" akisi — YENIDEN KIMLIK DOGRULAMALI. */
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @UseGuards(JwtAuthGuard)
  @Post('niyet')
  @HttpCode(200)
  niyet(
    @CurrentUser() user: { id: string; authAt: number | null },
    @Body() dto: SsoNiyetDto,
  ) {
    return this.kurumsal.niyet(user, dto.amac, dto.tarayiciBagi, dto.parola, user.authAt);
  }

  /**
   * IdP donusu — UST DUZEY GET, YAN ETKISIZ (§5.6).
   * `@Res()` yalniz 302 icindir; gövde yazilmaz, CEREZ yazilmaz.
   */
  @Throttle({ default: { ttl: 900_000, limit: 30 } })
  @Get('donus')
  async donus(
    @Query() sorgu: { code?: string; state?: string; error?: string },
    @Res() res: Response,
  ): Promise<void> {
    const { yonlendirme } = await this.kurumsal.donus(sorgu);
    res.redirect(302, yonlendirme);
  }

  /** Butun kararlar burada — sekme sirri gövdede gelir (§5.4). */
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  @Post('degis')
  @HttpCode(200)
  degis(@Body() dto: SsoDegisDto) {
    return this.kurumsal.degis(dto.kod, dto.tarayiciSirri);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('katil')
  @HttpCode(200)
  katil(@Body() dto: SsoKatilDto) {
    return this.kurumsal.katil({
      bilet: dto.bilet,
      tarayiciSirri: dto.tarayiciSirri,
      ticariIletiOnayi: dto.ticariIletiOnayi,
    });
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @KoltukDisiIzinli()
  @Delete('baglanti')
  @HttpCode(200)
  baglantiKaldir(
    @CurrentUser() user: { id: string; authAt: number | null },
    @Body() dto: SsoBaglantiKaldirDto,
  ) {
    return this.kurumsal.baglantiKaldir(user.id, dto?.parola, user.authAt);
  }
}
