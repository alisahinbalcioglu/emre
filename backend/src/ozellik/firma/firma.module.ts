import { Module } from '@nestjs/common';
import { FirmaServisi } from './firma.servisi';
import { FirmaController } from './firma.controller';
import { UyelikServisi } from './uyelik.servisi';
import { UyelikController } from './uyelik.controller';
import { DavetKabulController } from './davet-kabul.controller';
import { OdemeModule } from '../odeme/odeme.module';
import { AuthModule } from '../../altyapi/auth/auth.module';

/**
 * FIRMA MODULU (FAZ 4 · FAZ 7 F1b ekip).
 *
 * ⚠ FAZ 7 F1b: `OdemeModule` ARTIK GEREKLI — ekip uclari `ErisimGuard`
 * (kisitli firma davet edemez) ve `EpostaServisi` (davet e-postasi)
 * kullaniyor. `ScheduleModule.forRoot()` iki kez kosmaz: Nest statik
 * modulleri TEKILLESTIRIR ve OdemeModule zaten AuthModule'den de import
 * ediliyor.
 *
 * ⚠ `AuthModule` import EDILIR (OturumServisi — davet kabulu token basar).
 * DONGU YOK: AuthModule FirmaModule'u import ETMEZ (olculdu:
 * `auth.module.ts` imports = PassportModule, JwtModule, OdemeModule).
 *
 * `PrismaModule` global oldugu icin (app.module) ayrica import gerekmez.
 */
@Module({
  imports: [OdemeModule, AuthModule],
  providers: [FirmaServisi, UyelikServisi],
  controllers: [FirmaController, UyelikController, DavetKabulController],
  exports: [FirmaServisi, UyelikServisi],
})
export class FirmaModule {}
