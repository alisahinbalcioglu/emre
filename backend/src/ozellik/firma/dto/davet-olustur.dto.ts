import { IsEmail, MaxLength } from 'class-validator';

/**
 * ⚠ SINIF DTO (satir ici tip literali DEGIL): `@Body()` satir ici tip
 * ValidationPipe'i SESSIZCE atlar (bu depoda olculmus bir kusur ailesi).
 */
export class DavetOlusturDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(254)
  eposta!: string;
}
