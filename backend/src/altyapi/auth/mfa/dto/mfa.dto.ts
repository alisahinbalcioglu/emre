import {
  IsJWT,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * FAZ 7 F2b — MFA uclarinin gövde sözlesmeleri (§4.4).
 *
 * ⚠ SINIF DTO ZORUNLU: `@Body()` satir-ici tip literali `ValidationPipe`i
 * SESSIZCE atlar (bu depoda olculmus hata sinifi — "Yolu uctan uca kostur"
 * dersi). Tip literali yazarsak 6 hane kurali HIC kosmaz.
 */

/** 6 hane; bosluklar on yuzde temizlenir, sunucu yine de kati davranir. */
const KOD_DESENI = /^\d{6}$/;
const KOD_MESAJI = 'Doğrulama kodu 6 haneli olmalı.';

export class MfaDogrulaDto {
  @IsJWT({ message: 'Doğrulama oturumu geçersiz. Yeniden giriş yapın.' })
  meydanOkuma: string;

  // ⚠ IKISI DE OPSIYONEL ama BIRI ZORUNLU: "tam olarak biri" kurali
  // servistedir (`MFA_DOGRULAMA_YOK`) cunku DTO duzeyinde capraz kosul
  // yazmak mesaji kullaniciya anlasilmaz kilardi.
  @IsOptional()
  @IsString({ message: KOD_MESAJI })
  @Matches(KOD_DESENI, { message: KOD_MESAJI })
  kod?: string;

  @IsOptional()
  @IsString({ message: 'Kurtarma kodu geçersiz.' })
  @Length(10, 12, { message: 'Kurtarma kodu 10 karakterdir (ABCDE-FGHJK).' })
  kurtarmaKodu?: string;
}

export class MfaMeydanOkumaDto {
  @IsJWT({ message: 'Doğrulama oturumu geçersiz. Yeniden giriş yapın.' })
  meydanOkuma: string;
}

export class MfaZorunluKurulumOnaylaDto {
  @IsJWT({ message: 'Doğrulama oturumu geçersiz. Yeniden giriş yapın.' })
  meydanOkuma: string;

  @IsString({ message: KOD_MESAJI })
  @Matches(KOD_DESENI, { message: KOD_MESAJI })
  kod: string;
}

export class MfaKurulumBaslatDto {
  // Parolasiz hesapta (F3b) govde BOS gelir: alan opsiyonel, kural serviste
  // (`PAROLA_HATALI` / `YENIDEN_GIRIS_GEREKLI`).
  @IsOptional()
  @IsString({ message: 'Parolanızı girin.' })
  @MinLength(1, { message: 'Parolanızı girin.' })
  @MaxLength(72)
  parola?: string;
}

export class MfaKodDto {
  @IsString({ message: KOD_MESAJI })
  @Matches(KOD_DESENI, { message: KOD_MESAJI })
  kod: string;
}

export class MfaKapatDto {
  @IsOptional()
  @IsString({ message: 'Parolanızı girin.' })
  @MinLength(1, { message: 'Parolanızı girin.' })
  @MaxLength(72)
  parola?: string;

  @IsOptional()
  @IsString({ message: KOD_MESAJI })
  @Matches(KOD_DESENI, { message: KOD_MESAJI })
  kod?: string;

  @IsOptional()
  @IsString({ message: 'Kurtarma kodu geçersiz.' })
  @Length(10, 12, { message: 'Kurtarma kodu 10 karakterdir (ABCDE-FGHJK).' })
  kurtarmaKodu?: string;
}
