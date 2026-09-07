import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /admin/users sorgu parametreleri (2.1 — sunucu tarafi arama/suzgec).
 *
 * ⚠ @Query() SINIF tipiyle kullanildiginda global ValidationPipe DEVREYE GIRER
 * (main.ts: whitelist + transform). Bu, `@Body('x')` tek-ozellik cikariminin
 * ATLADIGI dogrulamanin tersidir — orada metatype String olur ve pipe susar.
 *
 * `transform: true` oldugu icin sayilar @Type(() => Number) ile cevrilir;
 * aksi halde querystring'den gelen "2" bir STRING kalir ve @IsInt patlar.
 */
export class KullanicilarSorgusuDto {
  /// E-posta icinde gecen metin. Bos birakilirsa suzgec uygulanmaz.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  arama?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  rol?: 'admin' | 'user';

  @IsOptional()
  @IsIn(['core', 'pro', 'suite'])
  paket?: 'core' | 'pro' | 'suite';

  @IsOptional()
  @IsIn(['active', 'banned'])
  durum?: 'active' | 'banned';

  /// Sayfa 1'den baslar. Tavan 500: sinirsiz `take` bir yonetici hatasiyla
  /// tum tabloyu belege cekebilir.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sayfa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  adet?: number;
}
