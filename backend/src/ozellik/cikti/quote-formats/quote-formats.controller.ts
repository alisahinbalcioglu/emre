import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
  UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { QuoteFormatsService } from './quote-formats.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';

@Controller('quote-formats')
@UseGuards(JwtAuthGuard)
export class QuoteFormatsController {
  constructor(private service: QuoteFormatsService) {}

  /** Format yukle → tarama sonucu (T3 onizlemesi) doner. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string },
  ) {
    return this.service.upload(kimlikCoz(user), file.buffer, file.originalname, body?.name);
  }

  @Get()
  list(@CurrentUser() user: any) {
    return this.service.list(kimlikCoz(user));
  }

  /** Ornek format indir (yer tutuculu sade KAPAK+ICMAL). */
  @Get('sample')
  async sample(@Res() res: Response) {
    const { buffer, filename } = await this.service.sample();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id/preview')
  preview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.preview(kimlikCoz(user), id);
  }

  /** GERCEK gorunum (LibreOffice xlsx→pdf). 404 = donusturucu yok →
   *  FE hucre tablosu geri dususu. inline gosterim icin attachment DEGIL. */
  @Get(':id/preview-pdf')
  async previewPdf(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.service.previewPdf(kimlikCoz(user), id);
    if (!pdf) {
      res.status(404).json({ message: 'PDF donusumu bu sunucuda kullanilamiyor' });
      return;
    }
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdf.length });
    res.end(pdf);
  }

  /** Dosya guncelle (T11: eski uretilmis ciktilar etkilenmez). */
  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  replaceFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.replaceFile(kimlikCoz(user), id, file.buffer, file.originalname);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { name?: string; isDefault?: boolean; sheetRoles?: Record<string, 'sabit' | 'liste'> },
  ) {
    return this.service.update(kimlikCoz(user), id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(kimlikCoz(user), id);
  }
}
