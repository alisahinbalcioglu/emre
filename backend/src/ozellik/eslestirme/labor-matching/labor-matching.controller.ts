import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LaborMatchingService } from './labor-matching.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { UyeIzniGerekli } from '../../../altyapi/auth/decorators/uye-izni.decorator';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { IscilikHafizasiDto, IscilikTopluEslestirmeDto } from './dto/iscilik-eslestirme-govdesi.dto';
import { DiziTavani, eslestirmeKurallari } from '../../../altyapi/http/dizi-tavani';

@Controller('labor-matching')
@UseGuards(JwtAuthGuard, TierGuard, ErisimGuard)
export class LaborMatchingController {
  constructor(private service: LaborMatchingService) {}

  /** PRD Iscilik: malzeme bulk-match ile AYNI sozlesme (variantTags = grup/
   *  surukleme varyant tasimasi, units = satir birimleri → L6 sert filtre). */
  @Post('bulk-match')
  @RequireTier('pro')
  @GerekliYetenek(Yetenek.TEKLIF_DUZENLE)
  // 23.09: iscilik fiyati KUTUPHANEDEN (iscilik firmalari) gelir.
  @UyeIzniGerekli('kutuphane')
  // 06.10: malzeme ikiziyle AYNI dizi tavani (tek tanim — dizi-tavani.ts).
  @DiziTavani(...eslestirmeKurallari('laborNames', 'işçilik adı'))
  bulkMatch(
    @CurrentUser() user: any,
    // C11 (P4a, 01.10.2026): SINIF DTO — satir ici tip ValidationPipe'i atliyordu.
    @Body() body: IscilikTopluEslestirmeDto,
  ) {
    return this.service.bulkMatch(kimlikCoz(user), body.firmaId, body.laborNames, body.variantTags, body.units);
  }

  /** Secici popup'tan kalem secildi — iscilik hafizasina yaz (L4 ogrenme). */
  @Post('remember')
  @RequireTier('pro')
  @GerekliYetenek(Yetenek.TEKLIF_DUZENLE)
  @UyeIzniGerekli('kutuphane')
  remember(
    @CurrentUser() user: any,
    @Body() body: IscilikHafizasiDto,
  ) {
    return this.service.remember(kimlikCoz(user), body.firmaId, body.laborName, body.secilenAd);
  }

  /** L2 kalicilik: kullanicinin firma kalemlerini v2 ile yeniden indeksle. */
  @Post('reindex')
  @RequireTier('pro')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  @UyeIzniGerekli('kutuphane')
  reindex(@CurrentUser() user: any) {
    return this.service.reindex(kimlikCoz(user));
  }

  @Post('backfill-tags')
  @UseGuards(RolesGuard)
  @Roles('admin')
  backfillTags() {
    return this.service.backfillTags();
  }
}
