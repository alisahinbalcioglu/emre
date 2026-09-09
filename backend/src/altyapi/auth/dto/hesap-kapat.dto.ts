import { IsString, MinLength } from 'class-validator';

/**
 * POST /auth/hesabimi-kapat govdesi (FAZ 5.5).
 *
 * ⚠ PAROLA ZORUNLU: hesap kapatmanin GERI ALMA YOLU YOK (olculdu —
 * `deletedAt`i null'a ceviren tek bir satir bile yok). Calinmis bir token'la
 * yapilabilen, geri alinamayan bir islem birakilamaz; parola, token'i olan
 * ama parolayi bilmeyen birini durduran tek kapidir.
 */
export class HesapKapatDto {
  @IsString({ message: 'Parola gereklidir.' })
  @MinLength(1, { message: 'Parola gereklidir.' })
  parola: string;
}
