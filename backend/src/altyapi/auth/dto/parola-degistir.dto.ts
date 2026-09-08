import { IsString, MaxLength, MinLength } from 'class-validator';
import { PAROLA_MESAJI, PAROLA_MIN } from '../parola-kurali';

/** POST /auth/change-password gövdesi (Faz 3.5) — oturum açık kullanıcı. */
export class ParolaDegistirDto {
  @IsString({ message: 'Mevcut parolanızı girin.' })
  @MinLength(1, { message: 'Mevcut parolanızı girin.' })
  mevcutParola: string;

  @IsString({ message: PAROLA_MESAJI })
  @MinLength(PAROLA_MIN, { message: PAROLA_MESAJI })
  @MaxLength(72, { message: 'Parola en fazla 72 karakter olabilir.' })
  yeniParola: string;
}
