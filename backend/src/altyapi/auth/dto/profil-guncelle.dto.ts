import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

/**
 * PATCH /auth/profil govdesi (FAZ 4.1 — KISI alanlari).
 *
 * ⚠ E-POSTA BURADA DEGISTIRILEMEZ. `email` bilerek DISARIDA: adres degisimi
 * kimligin kendisini degistirir ve dogrulama zinciri gerektirir (yeni adrese
 * dogrulama baglantisi, eskisine bilgilendirme, `emailVerified` sifirlama).
 * `whitelist: true` sayesinde govdeye `email` konsa bile SESSIZCE atilir —
 * yani bu uc uzerinden hesap devralma yolu yok.
 *
 * ⚠ Alanlarin hepsi OPSIYONEL ve bos gonderilebilir: kullanici girdigi bir
 * bilgiyi geri SILEBILMELI. Bos string -> null (bkz. auth.service.profilGuncelle).
 */
export class ProfilGuncelleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  soyad?: string;

  /// Firma telefonuyla AYNI kural (bkz. FirmaGuncelleDto.telefon).
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+()\s.-]*$/, {
    message: 'Telefon yalnizca rakam ve + - ( ) . bosluk icerebilir.',
  })
  telefon?: string;
}
