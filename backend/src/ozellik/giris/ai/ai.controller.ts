import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { CeviriService } from './ceviri.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard, TierGuard)
export class AiController {
  constructor(
    private aiService: AiService,
    private ceviriService: CeviriService,
  ) {}

  @Post('analyze')
  @RequireTier('pro') // PDF analiz → minimum Pro paketi
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  analyze(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.aiService.analyze(user.id, file.buffer, file.mimetype);
  }

  /**
   * Teknik metin cevirisi. Govde: benzersizlestirilmis, DOKUNULMAZLARI
   * elenmis metin listesi (frontend ozellik/teklif/ceviri.ts uretir).
   * Onbellekte olanlar icin API'ye HIC gidilmez.
   */
  @Post('translate')
  translate(@Body() body: { metinler: string[]; hedefDil?: string }) {
    return this.ceviriService.cevir(body?.metinler ?? [], body?.hedefDil ?? 'en');
  }

  /** Kullanici duzeltmesi — onbellege 'manual' olarak yazilir, AI ezemez. */
  @Post('translate/correct')
  translateCorrect(@Body() body: { kaynak: string; ceviri: string; hedefDil?: string }) {
    return this.ceviriService.duzelt(body?.kaynak, body?.ceviri, body?.hedefDil ?? 'en');
  }
}
