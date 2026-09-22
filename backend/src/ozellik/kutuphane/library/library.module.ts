import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { MatchingModule } from '../../eslestirme/matching/matching.module';
import { OdemeModule } from '../../odeme/odeme.module';

@Module({
  imports: [MatchingModule, OdemeModule],
  providers: [LibraryService],
  controllers: [LibraryController],
  exports: [LibraryService],
})
export class LibraryModule {}
