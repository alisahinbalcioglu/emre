import { Equals, IsBoolean, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { PAROLA_MESAJI, PAROLA_MIN } from '../../../altyapi/auth/parola-kurali';

/**
 * ⚠ ONAY ALANLARI `register.dto.ts` ile BIREBIR AYNI kurallarda: davet
 * kabulu de bir KAYITTIR ve onaysiz kayit hukuken dayanaksizdir.
 * Ticari ileti izni AYRI ve onceden isaretsiz (ETK/IYS).
 */
export class DavetKabulDto {
  @IsString()
  @Length(20, 100)
  token!: string;

  @IsString()
  @MinLength(PAROLA_MIN, { message: PAROLA_MESAJI })
  parola!: string;

  @IsBoolean({ message: 'Kullanım koşulları onayı gereklidir.' })
  @Equals(true, {
    message: 'Devam edebilmek için kullanım koşullarını ve gizlilik metnini onaylamalısınız.',
  })
  sozlesmeOnayi!: boolean;

  @IsOptional()
  @IsBoolean()
  ticariIletiOnayi?: boolean;
}
