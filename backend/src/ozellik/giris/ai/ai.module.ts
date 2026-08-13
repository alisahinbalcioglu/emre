import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CeviriService } from './ceviri.service';
import { PrismaModule } from '../../../altyapi/db/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiService, CeviriService],
  exports: [AiService, CeviriService],
})
export class AiModule {}
