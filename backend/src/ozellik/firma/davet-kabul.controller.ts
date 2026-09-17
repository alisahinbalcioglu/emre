import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UyelikServisi } from './uyelik.servisi';
import { DavetBilgiDto } from './dto/davet-bilgi.dto';
import { DavetKabulDto } from './dto/davet-kabul.dto';

/**
 * FAZ 7 F1b — DAVET KABUL (GUARDSIZ, §3.3).
 *
 * ⚠ Bu iki uc GIRIS YAPMAMIS kisiye acik olmak ZORUNDA: davet edilen kisinin
 * henuz hesabi yoktur. Kimlik, e-postayla giden 256 bitlik token'in
 * kendisidir (`parola.servisi.ts` sifirlama deseni).
 *
 * ⚠ `@Controller('auth')`: adres `/api/auth/davet-*`. Boylece on yuzun
 * korumasiz sayfalarindan cagrilir ve `KIMLIK_UCLARI` mantigina uymaz
 * (401 DONMEZ, bu yuzden o listeye YAZILMAZ).
 *
 * ⚠ HIZ SINIRI DAR: `davet-kabul` 5/15dk — token tahmini pratikte imkansiz
 * ama sinir, sizan bir token listesini toplu denemeyi de yavaslatir.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class DavetKabulController {
  constructor(private readonly uyelik: UyelikServisi) {}

  @Post('davet-bilgi')
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  davetBilgi(@Body() dto: DavetBilgiDto) {
    return this.uyelik.davetBilgi(dto.token);
  }

  @Post('davet-kabul')
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  davetKabul(@Body() dto: DavetKabulDto) {
    return this.uyelik.davetKabul(dto);
  }
}
