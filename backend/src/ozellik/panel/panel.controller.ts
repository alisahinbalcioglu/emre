import { Controller, Get, UseGuards } from '@nestjs/common';
import { PanelServisi } from './panel.servisi';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../altyapi/auth/kimlik';

/**
 * PANO UCLARI — oturum sahibinin KENDI sayilari (t.3, 21.09.2026).
 *
 * ⚠ `@Roles` YOK, `RolesGuard` YOK: bu ucun tamami kullanicinin kendi
 * verisidir ve HER oturum acmis kisi cagirabilmelidir. Panonun dort kutusu
 * tam da bu yuzden bugune kadar musteride hic gorunmuyordu — okudugu uc
 * (`/admin/stats`) yoneticiye kilitliydi.
 *
 * ⚠ Yetenek kapisi (`ErisimGuard`) de YOK: sayac okumak satilan bir ozellik
 * degil, kullanicinin zaten gorebildigi listelerin adedidir. Kapi koymak,
 * paketi bitmis kullanicinin panosunu yeniden bosaltirdi.
 */
@Controller('panel')
@UseGuards(JwtAuthGuard)
export class PanelController {
  constructor(private readonly panel: PanelServisi) {}

  @Get('ozet')
  ozet(@CurrentUser() user: any) {
    return this.panel.ozet(kimlikCoz(user));
  }
}
