import { IsIn } from 'class-validator';

/**
 * FAZ 7 F1b (§3.3 son satir) — platform yoneticisi firma rolunu degistirir.
 *
 * ⚠ SINIF DTO: `@Body('firmaRol')` satir ici okuma ValidationPipe'i
 * SESSIZCE atlar (bu depoda olculmus kusur ailesi). Komsu uclar (`role`,
 * `status`, `tier`) o eski desende yazilmis; YENI uc dogru desenle gelir.
 */
export class AdminFirmaRolDto {
  @IsIn(['sahip', 'uye'], { message: "Firma rolü yalnız 'sahip' ya da 'uye' olabilir." })
  firmaRol!: 'sahip' | 'uye';
}
