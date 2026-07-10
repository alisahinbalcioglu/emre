import { Controller, Post, Get, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MatchingService } from './matching.service';
import { TerminologyService } from './terminology.service';

@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(
    private readonly service: MatchingService,
    private readonly terminology: TerminologyService,
  ) {}

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

  // ── TERMINOLOJI SOZLUGU (PRD §5) ─────────────────────────────

  /** Sozluk listesi: seed + kullanicinin kendi alias'lari */
  @Get('aliases')
  async listAliases(@Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.terminology.listAliases(userId);
  }

  /** S4: kullanici alias'i kaydet (popup seciminden ogrenme veya elle).
   *  Ayni alias tekrar gelirse GUNCELLENIR (S5: tekil cozumleme). */
  @Post('aliases')
  async saveAlias(
    @Body() body: { alias: string; canonical?: string; kinds?: string[]; impliedType?: string | null; sizeClass?: string | null },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.terminology.saveUserAlias(userId, body);
  }

  /** Alias sil (kullanici kaydi) / pasife al (seed — silinemez, S3) */
  @Delete('aliases/:id')
  async deleteAlias(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.terminology.deactivateAlias(userId, id);
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
