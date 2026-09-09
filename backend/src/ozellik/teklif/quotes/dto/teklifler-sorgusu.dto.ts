import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /quotes sorgu parametreleri (FAZ 4.6 — satis takibi).
 *
 * ⚠ @Query() SINIF tipiyle kullanildiginda global ValidationPipe DEVREYE
 * GIRER (main.ts: whitelist + transform). Satir-ici tip literali kullanmak
 * pipe'i SESSIZCE atlar — bu depoda odeme yolu tam olarak bu yuzden kirilmisti.
 * Desen `KullanicilarSorgusuDto`dan birebir alindi.
 *
 * ⚠ ALAN ADI `adet` (`limit` DEGIL): `RecentQuotes.tsx:22` bugune kadar
 * `params: { limit: 3 }` gonderiyordu ama backend HIC `@Query` almadigi icin
 * bu parametre SESSIZCE dusuyordu; bilesen `.slice(0, 3)` ile telafi ediyordu.
 * Yani dashboard 3 teklif gostermek icin TUM teklifleri (her biri `sheets` +
 * ham .xlsx binary'siyle) indiriyordu. Ad `adet` secildi ki admin DTO'suyla
 * ayni dili konussun; `RecentQuotes` cagrisi da AYNI turda guncelleniyor —
 * yoksa parametre yine sessizce duserdi (bu sefer ad uyusmazligindan).
 */
export class TekliflerSorgusuDto {
  /// Teklif basligi / musteri / proje icinde gecen metin.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  arama?: string;

  /// ⚠ Degerler `TeklifDurumu` enum'uyla BIREBIR. Buraya yeni bir durum
  /// eklemeyi unutmak, o durumun suzgecte SESSIZCE calismamasi demektir
  /// (400 doner, ama ancak deneyen gorur).
  @IsOptional()
  @IsIn(['HAZIRLANIYOR', 'GONDERILDI', 'KAZANILDI', 'KAYBEDILDI'])
  durum?: 'HAZIRLANIYOR' | 'GONDERILDI' | 'KAZANILDI' | 'KAYBEDILDI';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sayfa?: number;

  /// Tavan 200: sinirsiz `take` tek istekle butun tabloyu bellege ceker.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  adet?: number;
}
