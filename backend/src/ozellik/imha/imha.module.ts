import { Module } from '@nestjs/common';
import { ImhaServisi } from './imha.servisi';
import { ImhaJob } from './imha.job';

/**
 * VERI IMHASI MODULU (plan 5.8 · §5).
 *
 * ⚠ BU MODUL `app.module.ts`e BAGLANMAZSA IS HIC KOSMAZ. Bu depoda olculmus
 *   hata sinifi: "mekanizma var, baglanti yok" — fonksiyon dogru, cagiran
 *   yok. Kapisi `imha-test.ts` · bolum J'dir: `app.module.ts` kaynagi
 *   okunur ve `ImhaModule` orada ARANIR. Baglanti koparsa test KIRMIZI.
 *
 * ⚠ `ScheduleModule.forRoot()` BURADA CAGIRILMAZ: `odeme.module.ts`te
 *   zaten var ve Nest statik modulleri tekillestirir (ayni not
 *   `firma.module.ts:17` ve `admin.module.ts:12`te de yazili). `@Cron`
 *   kesfi kureseldir; ikinci `forRoot` gereksizdir.
 *
 * `PrismaModule` `@Global` oldugu icin ayrica import edilmez.
 */
@Module({
  providers: [ImhaServisi, ImhaJob],
  exports: [ImhaServisi],
})
export class ImhaModule {}
