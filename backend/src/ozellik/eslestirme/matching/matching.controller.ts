import { Controller, Post, Get, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { MatchingService } from './matching.service';
import { TerminologyService } from './terminology.service';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { UyeIzniGerekli } from '../../../altyapi/auth/decorators/uye-izni.decorator';

@Controller('matching')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class MatchingController {
  constructor(
    private readonly service: MatchingService,
    private readonly terminology: TerminologyService,
  ) {}

  /** Teklif sirasinda: Excel malzemelerini DB'den esle (AI yok).
   *  variantTags (V4): grup ici otomatik atama — secili varyantin tag'leri.
   *  units (E2): satir birimleri (ad→birim) — aile cozumunde sinyal
   *  (metre→boru, adet→ekipman); opsiyonel, eski istemciler etkilenmez. */
  @Post('bulk-match')
  @GerekliYetenek(Yetenek.TEKLIF_DUZENLE)
  // 23.09: fiyat KUTUPHANEDEN gelir — Kutuphanem izni olmayan uye fiyat cekemez.
  @UyeIzniGerekli('kutuphane')
  async bulkMatch(
    @Body() body: { brandId: string; materialNames: string[]; variantTags?: string[]; units?: Record<string, string> },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.bulkMatch(kimlikCoz(req.user), body.brandId, body.materialNames, body.variantTags, body.units);
  }

  /** OGRENME (PRD Adim 8): secici popup'tan secim yapilinca hafizaya yaz.
   *  Ayni imza ikinci gelisinde secici atlanir, 'oneri' otomatik dolar. */
  @Post('remember')
  @GerekliYetenek(Yetenek.TEKLIF_DUZENLE)
  @UyeIzniGerekli('kutuphane')
  async remember(
    @Body() body: { brandId: string; materialName: string; secilenAd: string },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.remember(userId, body.brandId, body.materialName, body.secilenAd);
  }

  /** I7 (kullanici sarti 18.07): BAYAT INDEKS gorunurlugu — kutuphanede
   *  guncel INDEX_VERSION'da olmayan / hic indekslenmemis satir sayisi.
   *  FE teklif ekraninda kucuk sari rozetle gosterir (yalniz log YETMEZ). */
  @Get('index-health')
  async indexHealth(@Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.indexHealth(kimlikCoz(req.user));
  }

  // ── TERMINOLOJI SOZLUGU (PRD §5) ─────────────────────────────

  /** Sozluk listesi: seed + kullanicinin kendi alias'lari */
  @Get('aliases')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  @UyeIzniGerekli('kutuphane')
  async listAliases(@Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.terminology.listAliases(userId);
  }

  /** S4: kullanici alias'i kaydet (popup seciminden ogrenme veya elle).
   *  Ayni alias tekrar gelirse GUNCELLENIR (S5: tekil cozumleme). */
  @Post('aliases')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  @UyeIzniGerekli('kutuphane')
  async saveAlias(
    @Body() body: { alias: string; canonical?: string; kinds?: string[]; impliedType?: string | null; sizeClass?: string | null },
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.terminology.saveUserAlias(userId, body);
  }

  /** Alias sil (kullanici kaydi) / pasife al (seed — silinemez, S3) */
  @Delete('aliases/:id')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  @UyeIzniGerekli('kutuphane')
  async deleteAlias(@Param('id') id: string, @Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.terminology.deactivateAlias(userId, id);
  }

  /** Admin: Mevcut malzemelere tag at (backfill).
   *  ⚠ Koruma UC (metot) duzeyinde: bu controller'daki alti uc NORMAL
   *  kullanici ucudur (bulk-match, remember, index-health, aliases x3);
   *  @Roles SINIF duzeyine konursa onlarin HEPSI kirilir.
   *  Desen kardes controller ile ayni: labor-matching.controller.ts:43-45. */
  @Post('backfill-tags')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async backfillTags() {
    return this.service.backfillTags();
  }

  /** Admin: Tek malzeme icin tag test et (koruma yine UC duzeyinde). */
  @Post('generate-tags')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async generateTags(@Body() body: { materialName: string }) {
    return this.service.generateTagsForTest(body.materialName);
  }
}
