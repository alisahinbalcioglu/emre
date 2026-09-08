import { IsString, MinLength } from 'class-validator';

/** POST /auth/verify-email gövdesi (Faz 3.4). */
export class EpostaDogrulaDto {
  @IsString({ message: 'Doğrulama bağlantısı geçersiz.' })
  @MinLength(20, { message: 'Doğrulama bağlantısı geçersiz.' })
  token: string;
}
