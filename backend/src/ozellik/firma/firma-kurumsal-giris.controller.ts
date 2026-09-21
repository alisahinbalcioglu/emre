import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
import { FirmaRolGuard } from '../../altyapi/auth/guards/firma-rol.guard';
import { FirmaRolu } from '../../altyapi/auth/decorators/firma-rolu.decorator';
import { CurrentUser } from '../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../altyapi/auth/kimlik';
import { KurumsalGirisAyarServisi } from './kurumsal-giris-ayar.servisi';
import {
  KurumsalGirisEtkinlestirDto,
  KurumsalGirisKaydetDto,
  SilOnayDto,
} from '../../altyapi/auth/kurumsal/dto/kurumsal.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS AYAR UCLARI (yalniz FIRMA SAHIBI)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ `@FirmaRolu('sahip')` SINIF DUZEYINDE: yeni bir metot eklendiginde
 *  dekoratoru unutmak imkansiz olsun. K25 prototip tablosu HER metodun
 *  `FIRMA_ROL_KEY = ['sahip']` aldigini olcer — tabloya yazilmayan yeni
 *  metot testi KIRMIZI yapar (R1-Y3 deseni).
 *
 *  ⚠ `@RequireTier` YOK: kurumsal giris paket seviyesine DEGIL, firmanin
 *  kendi kimlik saglayicisina baglidir. `TIER_KEY` tasiyan kurumsal uc
 *  olmadigini da K25 olcer.
 *
 *  ⚠ `ErisimGuard` YOK (bilerek): odemesi geciken bir firma sirket girisini
 *  KAPATABILMELI ve zorunluluktan cikabilmeli — aksi hâlde odeme sorunu
 *  kimlik kilitlenmesine donusurdu.
 */
@Controller('firma')
@UseGuards(JwtAuthGuard, FirmaRolGuard)
@FirmaRolu('sahip')
export class FirmaKurumsalGirisController {
  constructor(private readonly ayar: KurumsalGirisAyarServisi) {}

  @Get('kurumsal-giris')
  durum(@CurrentUser() user: unknown) {
    return this.ayar.durum(kimlikCoz(user));
  }

  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Put('kurumsal-giris')
  kaydet(@CurrentUser() user: unknown, @Body() dto: KurumsalGirisKaydetDto) {
    return this.ayar.kaydet(kimlikCoz(user), dto);
  }

  @Post('kurumsal-giris/etkinlestir')
  @HttpCode(200)
  etkinlestir(@CurrentUser() user: unknown, @Body() dto: KurumsalGirisEtkinlestirDto) {
    return this.ayar.etkinlestir(kimlikCoz(user), dto);
  }

  @Post('kurumsal-giris/kapat')
  @HttpCode(200)
  kapat(@CurrentUser() user: unknown) {
    return this.ayar.kapat(kimlikCoz(user));
  }

  @Delete('kurumsal-giris')
  @HttpCode(200)
  sil(@CurrentUser() user: unknown, @Body() dto: SilOnayDto) {
    return this.ayar.sil(kimlikCoz(user), dto?.onay);
  }

  /** R1-O3: sahibin bir uyenin sirket baglantisini kaldirmasi. */
  @Delete('uyeler/:id/kurumsal-baglanti')
  @HttpCode(200)
  uyeBaglantisiKaldir(@CurrentUser() user: unknown, @Param('id') id: string) {
    return this.ayar.uyeBaglantisiKaldir(kimlikCoz(user), id);
  }
}
