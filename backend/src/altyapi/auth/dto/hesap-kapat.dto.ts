import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * POST /auth/hesabimi-kapat govdesi (FAZ 5.5 · FAZ 7 F3b).
 *
 * ⚠ PAROLA HALA ZORUNLU — ama SERVISTE, DTO'da DEGIL. Hesap kapatmanin
 * GERI ALMA YOLU YOK (olculdu: `deletedAt`i null'a ceviren tek satir bile
 * yok); calinmis bir token'la yapilabilen, geri alinamayan bir islem
 * birakilamaz.
 *
 * ⚠ FAZ 7 F3b (§5.11): KURUMSAL GIRISLE ACILMIS hesabin parolasi YOKTUR.
 * DTO zorunlu tutsaydi o kisi KVKK m.11 hakkini HIC kullanamazdi. Alan
 * `IsOptional` oldu; kapiyi `hesap.servisi.ts` koruyor: parolali hesapta
 * parola ZORUNLU (yanlissa 401), parolasiz hesapta "son 10 dakikada sirket
 * hesabiyla girildi" (`authAt`) kaniti aranir.
 */
export class HesapKapatDto {
  @IsOptional()
  @IsString({ message: 'Parola gereklidir.' })
  @MinLength(1, { message: 'Parola gereklidir.' })
  parola?: string;
}
