import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';
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
   * Bos dizi GECERLIDIR (hicbir modul acik degil; kisi yine kendi
   * tekliflerini hazirlayabilir).
   */
  @IsOptional()
  @IsArray({ message: 'İzinler bir liste olmalı.' })
  @ArrayMaxSize(UYE_IZINLERI.length)
  @IsIn(UYE_IZINLERI as UyeIzni[], { each: true, message: 'Bilinmeyen izin.' })
  izinler?: UyeIzni[];
}
