import {
  Controller, Get, Post, Delete, Patch,
  Body, Param, Query, Put, UseGuards,
  UseInterceptors, UploadedFile,
  Res, HttpCode, HttpException, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { memoryStorage } from 'multer';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';

@Controller('quotes')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class QuotesController {
  constructor(private quotesService: QuotesService) {}

  // ── Literal routes MUST come BEFORE :id catch-all ──

  @Post('upload-excel')
  @GerekliYetenek(Yetenek.EXCEL_YUKLE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  parseExcel(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.quotesService.parseExcel(user.id, file.buffer);
  }

  @Post()
  @GerekliYetenek(Yetenek.TEKLIF_OLUSTUR)
  create(@CurrentUser() user: any, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(kimlikCoz(user), dto);
  }

  /**
   * REVIZYON — mevcut teklifi ayni kimlikle gunceller (14.08).
   *
   * `create` ile AYNI govdeyi alir ve AYNI hazirliktan gecer (iliskisel alan
   * suzgeci + kalem uretimi + P2003 geri dususu); yalniz son adim UPDATE olur.
   * Ayri bir DTO/servis yolu acilmadi — iki kayit yolu zamanla ayrilir ve biri
   * duzeltilirken oteki unutulur.
   *
   * ⚠ `quoteNo` ve `rev` DOKUNULMAZ: export arsivinin kimligi onlara bagli
   * (T10). Revizyon rev ARTIRMAZ; rev yalnizca "Teklif Formatinda Aktar"
   * uretiminde artar.
   */
  @Put(':id')
  @GerekliYetenek(Yetenek.TEKLIF_DUZENLE)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(kimlikCoz(user), dto, id);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.quotesService.findAll(kimlikCoz(user));
  }

  // NOT (Bulgu Raporu 21.07): eski GET :id/pdf ve GET :id/excel rotalari
  // SILINDI — grid'den uretim yolu kaldirildi, tek cikti yolu PRD motoru
  // (POST :id/export + GET :id/export-pdf). Iki yol yan yana KALMAZ.

  // ── PRD Teklif Formatim: profesyonel cikti rotalari ──

  /** Teklif bilgileri (kapak alanlari) + format secimi */
  @Patch(':id/info')
  updateInfo(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: {
      musteri?: string; proje?: string; hazirlayan?: string; gecerlilik?: string; formatId?: string | null;
      displayCurrency?: string; displayRate?: number | null; displayRateDate?: string | null;
      displayLanguage?: string;
    },
  ) {
    return this.quotesService.updateInfo(kimlikCoz(user), id, body ?? {});
  }

  // ARINMA Faz 2 (A+B): export-preview + export-overrides rotalari SILINDI
  // (Onizleme sayfasi c947983'te kalkmisti; FE'de 0 cagri).

  /** KH2 (SORUN 14): export HICBIR girdiyle 500 donemez — beklenmeyen hata
   *  yakalanir, sunucuda stack loglanir, kullaniciya neden + kod gider. */
  private exportHatasi(kod: string, e: unknown): never {
    if (e instanceof HttpException) throw e; // bilinen hatalar (400/404) aynen
    console.error(`[Export] ⚠ ${kod} BEKLENMEYEN HATA:`, e);
    const mesaj = e instanceof Error && e.message ? e.message : 'bilinmeyen hata';
    throw new BadRequestException(`Dışa aktarım başarısız: ${mesaj} (${kod})`);
  }

  /** .xlsx uret (rev artar, arsivlenir — T10) ve indir */
  @Post(':id/export')
  @GerekliYetenek(Yetenek.CIKTI_INDIR)
  async exportXlsx(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
    // 13.08: `{dil:'en'}` → sayfa metinleri onbellekteki ceviriyle iner.
    // Gonderilmezse davranis DEGISMEZ (Turkce) — eski istemciler etkilenmez.
    @Body() body?: { dil?: string },
  ) {
    try {
      const { buffer, filename, uyari, ozet } = await this.quotesService.exportXlsx(kimlikCoz(user), id, body?.dil);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length,
      });
      if (uyari) res.set('X-Export-Warning', encodeURIComponent(uyari)); // KF6
      if (ozet) res.set('X-Export-Summary', encodeURIComponent(ozet)); // PANO 21a
      res.end(buffer);
    } catch (e) {
      this.exportHatasi('EXP-FORMAT', e);
    }
  }

  /** Fiyatlandirilmis kesif Excel'i — teklif formati YOK, rev ARTMAZ
   *  (kullanici karari 24.07: cikti ikiye ayrildi). */
  @Get(':id/export-priced')
  @GerekliYetenek(Yetenek.CIKTI_INDIR)
  async exportPriced(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('dil') dil?: string,
  ) {
    try {
      const { buffer, filename, uyari, ozet } = await this.quotesService.exportPricedXlsx(kimlikCoz(user), id, dil);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length,
      });
      if (uyari) res.set('X-Export-Warning', encodeURIComponent(uyari)); // KF6
      if (ozet) res.set('X-Export-Summary', encodeURIComponent(ozet)); // PANO 21a
      res.end(buffer);
    } catch (e) {
      this.exportHatasi('EXP-PRICED', e);
    }
  }

  // ARINMA Faz 2C: teklif export-pdf rotasi SILINDI (kullanici karari 24.07
  // "pdf olmasin"; FE'de 0 cagri). Format karti PDF onizlemesi
  // (/quote-formats/:id/preview-pdf, LibreOffice) CANLI ve KORUNDU.

  /** T10 arsivi */
  @Get(':id/exports')
  listExports(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.listExports(kimlikCoz(user), id);
  }

  @Get(':id/exports/:rev')
  @GerekliYetenek(Yetenek.CIKTI_INDIR)
  async downloadExport(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('rev') rev: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.quotesService.downloadExport(kimlikCoz(user), id, parseInt(rev, 10) || 0);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ── Parameterized routes AFTER literals ──

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.findOne(kimlikCoz(user), id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.remove(kimlikCoz(user), id);
  }
}
