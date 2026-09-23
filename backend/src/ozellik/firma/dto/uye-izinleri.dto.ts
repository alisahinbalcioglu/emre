import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';
import { UYE_IZINLERI, type UyeIzni } from '../uye-izinleri';

/**
 * 23.09.2026 — `PATCH /firma/uyeler/:id/izinler` govdesi.
 *
 * ⚠ SINIF DTO: `@Body()` satir-ici tip literali `ValidationPipe`i SESSIZCE
 * atlar (bu depoda olculmus hata sinifi). Servis ayrica `izinleriSuz` ile
 * ikinci kez suzer — DTO'yu atlayan bir yol bilinmeyen izni yazamasin.
 * Bos dizi GECERLIDIR: "bu kisi hicbir modulu gormesin".
 */
export class UyeIzinleriDto {
  @IsArray({ message: 'İzinler bir liste olmalı.' })
  @ArrayMaxSize(UYE_IZINLERI.length)
  @IsIn(UYE_IZINLERI as UyeIzni[], { each: true, message: 'Bilinmeyen izin.' })
  izinler!: UyeIzni[];
}
