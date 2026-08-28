import {
  Controller, Post, Body, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './altyapi/db/prisma.service';

/**
 * Tek seferlik kullanim icin "make-admin" endpoint'i.
 *
 * AdminController @Roles('admin') ile korunuyor — ilk admin'i nasil
 * olusturacaksin? Burasi onun cikis kapisi: BOOTSTRAP_SECRET env'i
 * Render'da set edilmisse bu endpoint aktif. Set degilse 403.
 *
 * Kullanim sonrasi BOOTSTRAP_SECRET env'i Render'dan SIL — endpoint
 * tekrar 403'e dussun.
 */
@Controller('bootstrap')
export class BootstrapController {
  constructor(private prisma: PrismaService) {}

  /**
   * ── G6 GUVENLIK TURU (28.08): IKI YETKI DARALTILDI ────────────────────
   *
   * Ucun MESRU amaci "ilk admin'i yarat"tir. Ama uygulamasi bu amactan iki
   * yonde TASIYORDU ve bu tasma hesap devralmaya aciliyordu:
   *
   *  (a) SIFRE SIFIRLAMA. `newPassword` govdede kabul ediliyor ve HERHANGI
   *      bir hesabin parolasi degistiriliyordu. Yani BOOTSTRAP_SECRET'i
   *      bilen biri, kurulum coktan bitmis olsa bile, istedigi kullanicinin
   *      (orn. baska bir yoneticinin) parolasini sifirlayip hesabina
   *      girebilirdi. Ilk admin'i yaratmak icin parola degistirmek GEREKMEZ
   *      — kisi zaten kayitli ve kendi parolasini biliyor. Bu yetenek
   *      TAMAMEN KALDIRILDI (yok sayilmadi: alan sozlesmeden cikarildi ki
   *      cagiran gonderdigi degerin islendigini SANMASIN).
   *
   *  (b) SURESIZ ACIKLIK. Uc, sir ortamda durdugu SURECE calisiyordu ve
   *      kendi yorumu "kullanim sonrasi env'i SIL" diyordu — yani guvenlik
   *      bir INSAN HATIRLAMASINA baglanmisti. Unutulan tek bir degisken
   *      kalici arka kapiya donusuyordu. Artik uc KENDINI KAPATIR: sistemde
   *      ZATEN bir admin varsa 403 doner. "Bootstrap" tanimi geregi yalnizca
   *      hic admin yokken anlamlidir.
   *
   * Ayrica `status: 'active'` yazimi kaldirildi: banli bir hesabi bu uc
   * uzerinden geri acmak bootstrap'in isi degildir (G1 ile birlikte
   * dusunuldugunde ban'i dolanma yolu olurdu).
   */
  @Post('make-admin')
  async makeAdmin(@Body() body: { email?: string; secret?: string }) {
    const expected = process.env.BOOTSTRAP_SECRET?.trim();
    if (!expected) {
      throw new ForbiddenException('Bootstrap endpoint disabled (BOOTSTRAP_SECRET env not set)');
    }
    if (!body?.secret || body.secret !== expected) {
      throw new ForbiddenException('Invalid bootstrap secret');
    }
    if (!body?.email) {
      throw new BadRequestException('email required');
    }

    // (b) Sistemde admin VARSA bootstrap'in isi bitmistir.
    const mevcutAdmin = await this.prisma.user.count({ where: { role: 'admin' } });
    if (mevcutAdmin > 0) {
      throw new ForbiddenException(
        'Bootstrap kapali: sistemde zaten bir yonetici var. ' +
          'Yeni yonetici atamak icin yonetici panelini kullanin.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      throw new NotFoundException(`User ${body.email} not found — register first`);
    }

    const updated = await this.prisma.user.update({
      where: { email: body.email },
      data: { role: 'admin', tier: 'suite' },
      select: { email: true, role: true, tier: true, status: true },
    });
    return {
      ok: true,
      user: updated,
      hint: 'Now remove BOOTSTRAP_SECRET env to disable this endpoint.',
    };
  }
}
