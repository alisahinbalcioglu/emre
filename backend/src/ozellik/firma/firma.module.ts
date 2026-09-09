import { Module } from '@nestjs/common';
import { FirmaServisi } from './firma.servisi';
import { FirmaController } from './firma.controller';

/**
 * FIRMA MODULU (FAZ 4).
 *
 * ⚠ `OdemeModule` import EDILMIYOR — quote-formats/library gibi modullerden
 * farkli olarak bu modul `ErisimGuard` kullanmiyor (gerekce: firma.controller
 * sinif notu). Gereksiz import, `ScheduleModule.forRoot()` tasiyan
 * OdemeModule'u bir kez daha grafige sokar.
 *
 * `PrismaModule` global oldugu icin (app.module) ayrica import gerekmez.
 */
@Module({
  providers: [FirmaServisi],
  controllers: [FirmaController],
  exports: [FirmaServisi],
})
export class FirmaModule {}
