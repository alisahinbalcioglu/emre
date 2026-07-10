import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MatchingService } from './matching.service';

@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private readonly service: MatchingService) {}

  /** Teklif sirasinda: Excel malzemelerini DB'den esle (AI yok) */
  @Post('bulk-match')
  async bulkMatch(
    @Body() body: { brandId: string; materialNames: string[] },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.bulkMatch(userId, body.brandId, body.materialNames);
  }

  /** OGRENME (PRD Adim 8): secici popup'tan secim yapilinca hafizaya yaz.
   *  Ayni imza ikinci gelisinde secici atlanir, 'oneri' otomatik dolar. */
  @Post('remember')
  async remember(
    @Body() body: { brandId: string; materialName: string; secilenAd: string },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.remember(userId, body.brandId, body.materialName, body.secilenAd);
  }

  /** Admin: Mevcut malzemelere tag at (backfill) */
  @Post('backfill-tags')
  async backfillTags() {
    return this.service.backfillTags();
  }

  /** Admin: Tek malzeme icin tag test et */
  @Post('generate-tags')
  async generateTags(@Body() body: { materialName: string }) {
    return this.service.generateTagsForTest(body.materialName);
  }
}
