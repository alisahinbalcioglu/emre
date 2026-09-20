import { IsBoolean } from 'class-validator';

/**
 * FAZ 7 F2b — `PATCH /firma/guvenlik` govdesi (§4.6).
 *
 * ⚠ SINIF DTO: `@Body()` satir-ici tip literali `ValidationPipe`i SESSIZCE
 * atlar (bu depoda olculmus hata sinifi). `"evet"` dizgesi `Boolean()` ile
 * true olurdu; burada 400 doner.
 */
export class FirmaGuvenlikDto {
  @IsBoolean({ message: 'Zorunluluk degeri true ya da false olmali.' })
  mfaZorunlu: boolean;
}
