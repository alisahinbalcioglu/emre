import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { CeviriService } from './ceviri.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';

/**
 * ── ERİŞİM SAĞLIĞI (10.09.2026) ────────────────────────────────────────
 * `/ai/analyze` her çağrıda Anthropic/OpenRouter'a gerçek para harcıyor ve
 * ödemesi durmuş bir firmaya kapalı DEĞİLDİ. `ErisimGuard` eklendi.
 *
 * ⚠ `translate` ve `translate/correct` BİLEREK yeteneksiz bırakıldı —
 * ErisimGuard yetenek metadata'sı yoksa geçirir, yani bu iki ucun davranışı
 * DEĞİŞMEDİ. Sebep: çeviri kotası Faz 6.2'nin konusu (kademeli satır/dosya
 * tavanı) ve burada tek taraflı kapatmak o tasarımla çelişirdi.
 * ⚠ AYRICA ÖLÇÜLDÜ: bu iki uçta `@RequireTier` de YOK — çeviri bugün her
 * core kullanıcıya açık. Faz 6'ya taşınan bilinen açık.
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, TierGuard, ErisimGuard)
export class AiController {
  constructor(
    private aiService: AiService,
    private ceviriService: CeviriService,
  ) {}

  @Post('analyze')
  @RequireTier('pro') // PDF analiz → minimum Pro paketi
  @GerekliYetenek(Yetenek.AI_ANALIZ) // + aboneliği yürüyor mu?
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
  translate(
    @CurrentUser() user: { id: string; firmaId?: string | null },
    @Body() body: { metinler: string[]; hedefDil?: string },
  ) {
    return this.ceviriService.cevir(body?.metinler ?? [], body?.hedefDil ?? 'en', {
      userId: user?.id ?? null,
      firmaId: user?.firmaId ?? null,
    });
  }

  /** Kullanici duzeltmesi — onbellege 'manual' olarak yazilir, AI ezemez. */
  @Post('translate/correct')
  translateCorrect(@Body() body: { kaynak: string; ceviri: string; hedefDil?: string }) {
    return this.ceviriService.duzelt(body?.kaynak, body?.ceviri, body?.hedefDil ?? 'en');
  }
}
