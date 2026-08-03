import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LaborMatchingService } from './labor-matching.service';
import { JwtAuthGuard } from '../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../altyapi/auth/decorators/current-user.decorator';
import { RolesGuard } from '../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../altyapi/auth/decorators/roles.decorator';

@Controller('labor-matching')
@UseGuards(JwtAuthGuard)
export class LaborMatchingController {
  constructor(private service: LaborMatchingService) {}

  /** PRD Iscilik: malzeme bulk-match ile AYNI sozlesme (variantTags = grup/
   *  surukleme varyant tasimasi, units = satir birimleri → L6 sert filtre). */
  @Post('bulk-match')
  bulkMatch(
    @CurrentUser() user: any,
    @Body() body: {
      firmaId: string;
      laborNames: string[];
      variantTags?: string[];
      units?: Record<string, string>;
    },
  ) {
    return this.service.bulkMatch(user.id, body.firmaId, body.laborNames, body.variantTags, body.units);
  }

  /** Secici popup'tan kalem secildi — iscilik hafizasina yaz (L4 ogrenme). */
  @Post('remember')
  remember(
    @CurrentUser() user: any,
    @Body() body: { firmaId: string; laborName: string; secilenAd: string },
  ) {
    return this.service.remember(user.id, body.firmaId, body.laborName, body.secilenAd);
  }

  /** L2 kalicilik: kullanicinin firma kalemlerini v2 ile yeniden indeksle. */
  @Post('reindex')
  reindex(@CurrentUser() user: any) {
    return this.service.reindex(user.id);
  }

  @Post('backfill-tags')
  @UseGuards(RolesGuard)
  @Roles('admin')
  backfillTags() {
    return this.service.backfillTags();
  }
}
