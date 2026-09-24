import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * POST /yonetim/abonelik/:firmaId/dusur govdesi (24.09.2026, A2).
 *
 * ⚠ SINIF, SATIR-ICI TIP DEGIL: satir-ici tip literalinde global
 * `ValidationPipe` devreye GIRMEZ (A1 dersi: "`@Body()` literali
 * ValidationPipe'i atlar") ve asagidaki kapilar SESSIZCE acik kalir.
 *
 * `gerekce` DENETIM icindir, musteriye GITMEZ. Musteriye bir metin gidecekse
 * yonetici onu `musteriNotu`na ayrica yazar.
 */
export class YoneticiDusurDto {
  @IsUUID()
  paketSurumuId: string;

  @IsString()
  @MinLength(5, { message: 'Düşürme gerekçesi en az 5 karakter olmalı.' })
  @MaxLength(500, { message: 'Düşürme gerekçesi en fazla 500 karakter olabilir.' })
  gerekce: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Müşteri notu en fazla 500 karakter olabilir.' })
  musteriNotu?: string;
}
