import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../auth/guards/tier.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard, TierGuard)
export class AiController {
  constructor(private aiService: AiService) {}

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
}
