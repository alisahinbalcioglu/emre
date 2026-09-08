import { IsString, MaxLength, MinLength } from 'class-validator';
import { PAROLA_MESAJI, PAROLA_MIN } from '../parola-kurali';

/** POST /auth/reset-password gövdesi (Faz 3.3). */
export class ParolaSifirlaDto {
  @IsString({ message: 'Sıfırlama bağlantısı geçersiz.' })
  @MinLength(20, { message: 'Sıfırlama bağlantısı geçersiz.' })
  token: string;

  @IsString({ message: PAROLA_MESAJI })
  @MinLength(PAROLA_MIN, { message: PAROLA_MESAJI })
  // bcrypt 72 BAYTTAN sonrasını sessizce yok sayar; sınırsız uzunluk kabul
  // etmek hem bu sessiz kesmeyi gizler hem gereksiz CPU harcatır.
  @MaxLength(72, { message: 'Parola en fazla 72 karakter olabilir.' })
  yeniParola: string;
}
