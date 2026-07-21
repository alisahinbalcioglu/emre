import {
  Controller, Get, Post, Delete, Patch, Put,
  Body, Param, UseGuards,
  UseInterceptors, UploadedFile,
  Res, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { memoryStorage } from 'multer';

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private quotesService: QuotesService) {}

  // ── Literal routes MUST come BEFORE :id catch-all ──

  @Post('upload-excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  parseExcel(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.quotesService.parseExcel(user.id, file.buffer);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.quotesService.findAll(user.id);
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
    @Body() body: { musteri?: string; proje?: string; hazirlayan?: string; gecerlilik?: string; formatId?: string | null },
  ) {
    return this.quotesService.updateInfo(user.id, id, body ?? {});
  }

  /** Cikti Onizleme verisi (doldurulmus kapak/icmal + otomatik alan haritasi) */
  @Get(':id/export-preview')
  exportPreview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.exportPreview(user.id, id);
  }

  /** T13: teklif-bazli onizleme duzenlemeleri (ana format DEGISMEZ) */
  @Put(':id/export-overrides')
  saveOverrides(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { overrides: Record<string, Record<string, { value: string | number; manual?: boolean }>> },
  ) {
    return this.quotesService.saveOverrides(user.id, id, body?.overrides ?? {});
  }

  /** .xlsx uret (rev artar, arsivlenir — T10) ve indir */
  @Post(':id/export')
  async exportXlsx(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.quotesService.exportXlsx(user.id, id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** T9: ayni icerigin PDF'i (rev degistirmez) */
  @Get(':id/export-pdf')
  async exportPdf(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.quotesService.exportPdfPro(user.id, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** T10 arsivi */
  @Get(':id/exports')
  listExports(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.listExports(user.id, id);
  }

  @Get(':id/exports/:rev')
  async downloadExport(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('rev') rev: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.quotesService.downloadExport(user.id, id, parseInt(rev, 10) || 0);
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
    return this.quotesService.findOne(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quotesService.remove(user.id, id);
  }
}
