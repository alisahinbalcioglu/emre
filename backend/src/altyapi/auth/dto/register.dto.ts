import { IsEmail, IsString, MinLength, IsBoolean, IsOptional, Equals } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
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
