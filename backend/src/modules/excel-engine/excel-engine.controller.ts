import {
  Controller, Post, UseGuards, UseInterceptors, UploadedFile, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExcelEngineService } from './excel-engine.service';

@Controller('excel-engine')
@UseGuards(JwtAuthGuard)
export class ExcelEngineController {
  constructor(private readonly service: ExcelEngineService) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async analyze(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.analyze(userId, file.buffer);
  }
}
