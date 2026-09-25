import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * POST /yonetim/abonelik/:firmaId/oneri govdesi (24.09.2026, A2 Blok 2).
 *
 * ⚠ SINIF, SATIR-ICI TIP DEGIL: satir-ici tip literalinde global
 * `ValidationPipe` devreye GIRMEZ (A1 dersi) ve kapilar SESSIZCE acik kalir.
 *
 * `gerekce` DENETIM icindir, musteriye GITMEZ. Musteriye gidecek metin
 * `musteriNotu`dur — e-postada ve abonelik sayfasinda yalniz SAHIBE gorunur.
 */
export class YoneticiOneriDto {
  @IsUUID()
  paketSurumuId: string;

  @IsString()
  @MinLength(5, { message: 'Öneri gerekçesi en az 5 karakter olmalı.' })
  @MaxLength(500, { message: 'Öneri gerekçesi en fazla 500 karakter olabilir.' })
  gerekce: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Müşteri notu en fazla 500 karakter olabilir.' })
  musteriNotu?: string;
}
