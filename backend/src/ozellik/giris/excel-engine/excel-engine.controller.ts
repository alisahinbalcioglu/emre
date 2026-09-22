import {
  Controller, Post, UseGuards, UseInterceptors, UploadedFile, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { ExcelEngineService } from './excel-engine.service';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';

@Controller('excel-engine')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class ExcelEngineController {
  constructor(private readonly service: ExcelEngineService) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  @GerekliYetenek(Yetenek.EXCEL_YUKLE)
  async analyze(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const userId: string = req.user?.id ?? req.user?.sub;
    return this.service.analyze(userId, file.buffer);
  }
}
