import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { alanAdiNormalize } from '../../../altyapi/auth/kurumsal/saglayici-kurallari';
import { SilOnayDto } from '../../../altyapi/auth/kurumsal/dto/kurumsal.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS: PLATFORM YONETICISI UCLARI (§5.5, §5.10)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ── NEDEN VAR: IKI KILITLENME KURTARMASI ────────────────────────────────
 *  1) Sahip, suresi dolmus bir istemci anahtariyla zorunlulugu acarsa
 *     FIRMADAKI HERKES disarida kalir. `zorunlu-kapat` tek cikis yoludur.
 *  2) Bir alan adi YANLIS firmada dogrulanmis olabilir (ornegin ayni alan
 *     adinda ikinci bir sirket, ya da devredilmis bir alan adi). PK tekil
 *     oldugu icin gercek sahibi ASLA dogrulayamaz; yonetici kaldirmali
 *     (R1-D6).
 *
 *  ⚠ HER IKI UC DA `YoneticiOlayi` + ilgili firmaya `FirmaOlayi` yazar —
 *  AYNI transaction'da. Bir tarafi yazip digerini yazmayan bir islem,
 *  "yonetici mudahalesi" izini yalniz bir yerde birakirdi.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminKurumsalGirisController {
  constructor(private readonly prisma: PrismaService) {}

  /** Kilitlenme kurtarmasi 1: firmanin zorunlulugunu kaldir. */
  @Post('firmalar/:firmaId/kurumsal-giris/zorunlu-kapat')
  @HttpCode(200)
  async zorunluKapat(
    @CurrentUser() yonetici: { id: string; email: string },
    @Param('firmaId') firmaId: string,
  ) {
    const s = await this.prisma.firmaKimlikSaglayici.findUnique({ where: { firmaId } });
    if (!s) throw new NotFoundException({ kod: 'SAGLAYICI_YOK', mesaj: 'Bu firmada kurumsal giriş yok.' });
    await this.prisma.$transaction(async (tx: any) => {
      await tx.firmaKimlikSaglayici.update({ where: { id: s.id }, data: { zorunlu: false } });
      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId: yonetici.id,
          yoneticiEpsta: yonetici.email,
          tip: 'kurumsal-giris.zorunlu-kapatildi',
          oncekiDeger: String(s.zorunlu),
          yeniDeger: 'false',
        },
      });
      await tx.firmaOlayi.create({
        data: {
          firmaId,
          aktorId: yonetici.id,
          aktorEposta: yonetici.email,
          tip: 'kurumsal-giris.zorunlu-degisti',
          oncekiDeger: String(s.zorunlu),
          yeniDeger: 'false',
        },
      });
    });
    return { zorunlu: false };
  }

  /**
   * Kilitlenme kurtarmasi 2: yanlis sahiplenilmis alan adini kaldir (R1-D6).
   *
   * ⚠ Saglayicida DOGRULANMIS alan kalmazsa `durum: TASLAK` ve
   * `zorunlu: false`: kanitsiz bir saglayicinin ETKIN kalmasi, kimsenin
   * giremedigi bir zorunluluk demektir.
   */
  @Delete('alan-adlari/:alanAdi')
  @HttpCode(200)
  async alanAdiKaldir(
    @CurrentUser() yonetici: { id: string; email: string },
    @Param('alanAdi') hamAlanAdi: string,
    @Body() dto: SilOnayDto,
  ) {
    if (dto?.onay !== 'SİL') {
      throw new BadRequestException({ kod: 'ONAY_GEREKLI', mesaj: 'Silmek için gövdeye SİL yazın.' });
    }
    const alanAdi = alanAdiNormalize(hamAlanAdi);
    const satir = alanAdi
      ? await this.prisma.dogrulanmisAlanAdi.findUnique({ where: { alanAdi } })
      : null;
    if (!satir || !alanAdi) {
      throw new NotFoundException({ kod: 'ALAN_ADI_YOK', mesaj: 'Bu alan adı doğrulanmış değil.' });
    }
    const kalan = await this.prisma.$transaction(async (tx: any) => {
      await tx.dogrulanmisAlanAdi.delete({ where: { alanAdi } });
      const kalanSayi = await tx.dogrulanmisAlanAdi.count({
        where: { saglayiciId: satir.saglayiciId },
      });
      if (kalanSayi === 0) {
        await tx.firmaKimlikSaglayici.update({
          where: { id: satir.saglayiciId },
          data: { durum: 'TASLAK', zorunlu: false },
        });
      }
      await tx.yoneticiOlayi.create({
        data: {
          yoneticiId: yonetici.id,
          yoneticiEpsta: yonetici.email,
          tip: 'alan-adi.kaldirildi',
          oncekiDeger: alanAdi,
          yeniDeger: null,
        },
      });
      await tx.firmaOlayi.create({
        data: {
          firmaId: satir.firmaId,
          aktorId: yonetici.id,
          aktorEposta: yonetici.email,
          tip: 'yonetici.alan-adi-kaldirdi',
          oncekiDeger: alanAdi,
          veri: { kalanDogrulanmisAlan: kalanSayi } as never,
        },
      });
      return kalanSayi;
    });
    return { silindi: true, alanAdi, kalanDogrulanmisAlan: kalan };
  }
}
