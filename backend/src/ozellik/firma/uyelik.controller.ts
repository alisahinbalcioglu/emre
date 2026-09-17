import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
import { FirmaRolGuard } from '../../altyapi/auth/guards/firma-rol.guard';
import { FirmaRolu } from '../../altyapi/auth/decorators/firma-rolu.decorator';
import { CurrentUser } from '../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../odeme/abonelik/erisim.guard';
import { Yetenek } from '../odeme/abonelik/erisim.servisi';
import { UyelikServisi } from './uyelik.servisi';
import { DavetOlusturDto } from './dto/davet-olustur.dto';
import { RolDegistirDto } from './dto/rol-degistir.dto';
import { UyeCikarDto } from './dto/uye-cikar.dto';

/**
 * FAZ 7 F1b — EKIP UCLARI (§3.3).
 *
 * ⚠ `@RequireTier` YOK ve olmamali: paket kapisi KOLTUK SAYISIYLA uygulanir
 * (`PAKET_EKIP_YOK`), seviyeyle degil. Basic bir firma ekip sayfasini GORUR
 * (listede tek kisi vardir) ve davet dugmesi sunucunun verdigi neden koduyla
 * kapalidir — "Pro pakete gecin" metni bu yuzden ekranda cikar.
 *
 * ⚠ `ErisimGuard` SINIFTA: odemesi geciken firma yeni kisi DAVET EDEMEZ
 * (yetenek `KULLANICI_DAVET`), ama listeyi gorur ve davet IPTAL edebilir —
 * iptal ucunda yetenek BILEREK yok (kisitli firma koltuk bosaltabilsin).
 */
@Controller('firma')
@UseGuards(JwtAuthGuard, FirmaRolGuard, ErisimGuard)
export class UyelikController {
  constructor(private readonly uyelik: UyelikServisi) {}

  /** Uye de gorur (salt okunur) — dekoratorsuz. */
  @Get('uyeler')
  uyeleriGetir(@CurrentUser() user: unknown) {
    return this.uyelik.uyeleriGetir(kimlikCoz(user));
  }

  @Post('davetler')
  @FirmaRolu('sahip')
  @GerekliYetenek(Yetenek.KULLANICI_DAVET)
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  davetOlustur(@CurrentUser() user: unknown, @Body() dto: DavetOlusturDto) {
    return this.uyelik.davetOlustur(kimlikCoz(user), dto.eposta);
  }

  @Post('davetler/:id/yeniden-gonder')
  @FirmaRolu('sahip')
  @GerekliYetenek(Yetenek.KULLANICI_DAVET)
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  davetYenidenGonder(@CurrentUser() user: unknown, @Param('id') id: string) {
    return this.uyelik.davetYenidenGonder(kimlikCoz(user), id);
  }

  /** ⚠ Yetenek YOK: kisitli firma da koltuk bosaltabilmeli. */
  @Delete('davetler/:id')
  @FirmaRolu('sahip')
  davetIptal(@CurrentUser() user: unknown, @Param('id') id: string) {
    return this.uyelik.davetIptal(kimlikCoz(user), id);
  }

  @Patch('uyeler/:id/rol')
  @FirmaRolu('sahip')
  rolDegistir(
    @CurrentUser() user: unknown,
    @Param('id') id: string,
    @Body() dto: RolDegistirDto,
  ) {
    return this.uyelik.rolDegistir(kimlikCoz(user), id, dto.firmaRol);
  }

  @Delete('uyeler/:id')
  @FirmaRolu('sahip')
  uyeCikar(
    @CurrentUser() user: unknown,
    @Param('id') id: string,
    @Body() dto: UyeCikarDto,
  ) {
    return this.uyelik.uyeCikar(kimlikCoz(user), id, dto.epostaOnayi);
  }
}
