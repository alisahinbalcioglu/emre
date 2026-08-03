import { Module } from '@nestjs/common';
import { LaborService } from './labor.service';
import { LaborController } from './labor.controller';
import { PrismaModule } from '../altyapi/db/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LaborService],
  controllers: [LaborController],
  exports: [LaborService],
})
export class LaborModule {}
