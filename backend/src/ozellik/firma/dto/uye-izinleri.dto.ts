import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn } from 'class-validator';
import { UYE_IZINLERI, type UyeIzni } from '../uye-izinleri';

/**
 * 23.09.2026 — `PATCH /firma/uyeler/:id/izinler` govdesi.
 *
 * ⚠ SINIF DTO: `@Body()` satir-ici tip literali `ValidationPipe`i SESSIZCE
 * atlar (bu depoda olculmus hata sinifi). Servis ayrica `izinleriSuz` +
 * `yetkiSecimiGecerli` ile ikinci kez suzer — DTO'yu atlayan bir yol
 * bilinmeyen ya da bos yetkiyi yazamasin.
 * 06.10.2026 (ekip/yetki B): iki yetki (`fiyat`, `dwg`) ve EN AZ BIR yetki
 * zorunlu. Eski izin adi (`excel`, `kutuphane`...) bayat sekmeden gelir →
 * 400 "sayfayi yenileyin".
 */
export class UyeIzinleriDto {
  @IsArray({ message: 'Yetkiler bir liste olmalı.' })
  @ArrayMinSize(1, { message: 'En az bir yetki seçin.' })
  @ArrayMaxSize(UYE_IZINLERI.length)
  @IsIn(UYE_IZINLERI as UyeIzni[], {
    each: true,
    message: 'Bilinmeyen yetki. Sayfayı yenileyip tekrar deneyin.',
  })
  izinler!: UyeIzni[];
}
