import {
  Controller, Get, Patch, Post, Delete,
  Body, UseGuards, UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { FirmaServisi, LOGO_AZAMI_BAYT } from './firma.servisi';
import { FirmaGuncelleDto } from './dto/firma-guncelle.dto';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../altyapi/auth/kimlik';

/**
 * FIRMA PROFILI UCLARI (FAZ 4.1 / 4.3).
 *
 * ⚠ `ErisimGuard` / `@GerekliYetenek` BILEREK YOK: odemesi geciken (KISITLI)
 * bir firma, ODEYEBILMEK icin fatura bilgisini duzeltebilmeli. Kapi koymak
 * "odemek icin duzelt, duzeltmek icin once ode" dongusu uretirdi.
 * (Ayrintili gerekce: firma.servisi.ts sinif notu.)
 */
@Controller('firma')
@UseGuards(JwtAuthGuard)
export class FirmaController {
  constructor(private servis: FirmaServisi) {}

  @Get()
  getir(@CurrentUser() user: any) {
    return this.servis.getir(kimlikCoz(user));
  }

  @Patch()
  guncelle(@CurrentUser() user: any, @Body() dto: FirmaGuncelleDto) {
    return this.servis.guncelle(kimlikCoz(user), dto);
  }

  /**
   * ⚠ `limits` YAZILMASI SART. `main.ts`teki 50mb'lik `express.json` limiti
   * multipart'i KAPSAMAZ; multer'in varsayilani SINIRSIZDIR ve tek istekle
   * bellek tuketilebilir. Depodaki iki mevcut yukleme ucu (quote-formats)
   * limitsiz — bu bir ORNEK DEGIL, kopyalanmamasi gereken bir KUSURDUR.
   */
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: LOGO_AZAMI_BAYT, files: 1 },
    }),
  )
  logoYukle(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.servis.logoYaz(kimlikCoz(user), file);
  }

  /**
   * Logoyu IKILI olarak servis eder — JSON icinde base64 tasimamak icin ayri uc.
   * Kimlik kapisi serviste: sorgu `kimlik.firmaId` ile yapilir, id tahminiyle
   * baska firmanin logosu cekilemez.
   *
   * `Cache-Control: private` — ortak (proxy) onbellege girmemeli; logo firmaya
   * ozel ve kimlik dogrulamali bir kaynaktir.
   */
  @Get('logo')
  async logoGetir(@CurrentUser() user: any, @Res() res: Response) {
    const { bytes, tur } = await this.servis.logoOku(kimlikCoz(user));
    res.set({
      'Content-Type': tur,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=60',
      // Tur beyani serviste magic-number ile dogrulanmis olsa da, tarayicinin
      // icerigi baska bir sey sanip yorumlamasini engelle.
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(bytes);
  }

  @Delete('logo')
  logoSil(@CurrentUser() user: any) {
    return this.servis.logoSil(kimlikCoz(user));
  }
}
