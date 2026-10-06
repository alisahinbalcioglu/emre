import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';
import { UYE_IZINLERI, type UyeIzni } from '../uye-izinleri';

/**
 * ⚠ SINIF DTO (satir ici tip literali DEGIL): `@Body()` satir ici tip
 * ValidationPipe'i SESSIZCE atlar (bu depoda olculmus bir kusur ailesi).
 */
export class DavetOlusturDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(254)
  eposta!: string;

  /**
   * 23.09.2026 — davet edilen kisinin ACILACAK modulleri (Ekip & Izinler).
   * ⚠ OPSIYONEL: alanı gondermeyen eski bir sekme (bayat JS) davetini
   * bozmasin; yoksa servis `TUM_IZINLER` yazar — ozellikten onceki davranis.
   * 06.10.2026 (ekip/yetki B): iki yetki (`fiyat`, `dwg`); GONDERILIRSE en
   * az bir yetki ZORUNLU (yetkisiz uye hicbir isi yapamaz, koltugu bos yere
   * doldurur). Eski izin adi bayat sekmeden gelir → 400 "sayfayi yenileyin".
   */
  @IsOptional()
  @IsArray({ message: 'Yetkiler bir liste olmalı.' })
  @ArrayMinSize(1, { message: 'En az bir yetki seçin.' })
  @ArrayMaxSize(UYE_IZINLERI.length)
  @IsIn(UYE_IZINLERI as UyeIzni[], {
    each: true,
    message: 'Bilinmeyen yetki. Sayfayı yenileyip tekrar deneyin.',
  })
  izinler?: UyeIzni[];
}
