import { IsEmail, IsString, MinLength, IsBoolean, IsOptional, Equals } from 'class-validator';
import { PAROLA_MESAJI, PAROLA_MIN } from '../parola-kurali';

export class RegisterDto {
  @IsEmail()
  email: string;

  /**
   * ⚠ CIPLAK SAYI YAZMAYIN. Burada `@MinLength(6)` yaziyordu; parola
   * degistirme/sifirlama/davet ise `parola-kurali.ts`ten 8 okuyordu. Ayni
   * urunde iki politika vardi ve kayit ekrani da ayrica "En az 6 karakter."
   * diye ucuncu bir yerde tekrar ediyordu. Kural TEK yerde.
   */
  @IsString({ message: PAROLA_MESAJI })
  @MinLength(PAROLA_MIN, { message: PAROLA_MESAJI })
  password: string;

  // ── FAZ 5.3 · ONAY KUTULARI ─────────────────────────────────────────────
  /**
   * KULLANIM KOSULLARI ONAYI — ZORUNLU.
   *
   * ⚠ `@Equals(true)` KULLANILIYOR, `@IsBoolean()` DEGIL: yalniz "boolean mi"
   * diye bakmak `false` degerini de GECERLI sayardi ve sunucu, onay
   * vermemis bir kullaniciyi kaydederdi. On yuzdeki `required` isareti
   * yalnizca tarayici kolayligidir; istegi elle atan biri onu HIC gormez.
   * Ispat yuku bizde oldugu icin kapi SUNUCUDA olmak zorunda.
   *
   * ⚠ ESKI ISTEMCI NOTU: bu alan zorunlu oldugu icin, alanı gondermeyen eski
   * bir kayit ekrani 400 alir. Bilincli: onaysiz kayit kabul etmek, kaydin
   * kendisini hukuken dayanaksiz birakirdi. Kayit ekrani AYNI turda
   * guncellendi.
   */
  @IsBoolean({ message: 'Kullanım koşulları onayı gereklidir.' })
  @Equals(true, {
    message: 'Devam edebilmek için kullanım koşullarını ve gizlilik metnini onaylamalısınız.',
  })
  sozlesmeOnayi: boolean;

  /**
   * TICARI ILETI (pazarlama) IZNI — OPSIYONEL ve ONCEDEN ISARETSIZ.
   *
   * ⚠ SOZLESME ONAYINDAN AYRI OLMAK ZORUNDA (ETK/IYS): "kabul ediyorum"
   * kutusuna pazarlama iznini yedirmek, izni gecersiz kilar. Gonderilmezse
   * izin VERILMEMIS sayilir — varsayilan `true` OLAMAZ.
   */
  @IsOptional()
  @IsBoolean()
  ticariIletiOnayi?: boolean;
}
