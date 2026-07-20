import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
  UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { QuoteFormatsService } from './quote-formats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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
    return this.service.upload(user.id, file.buffer, file.originalname, body?.name);
  }

  @Get()
  list(@CurrentUser() user: any) {
    return this.service.list(user.id);
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
    return this.service.preview(user.id, id);
  }

  /** Dosya guncelle (T11: eski uretilmis ciktilar etkilenmez). */
  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  replaceFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.replaceFile(user.id, id, file.buffer, file.originalname);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { name?: string; isDefault?: boolean; sheetRoles?: Record<string, 'sabit' | 'liste'> },
  ) {
    return this.service.update(user.id, id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
