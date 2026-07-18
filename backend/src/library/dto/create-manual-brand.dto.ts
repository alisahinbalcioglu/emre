import {
  IsString, IsOptional, IsNumber, IsArray, ValidateNested,
  Min, Max, MaxLength, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Kullanicinin "Marka Ekle" bos tablosunda doldurdugu TEK satir.
 *  Alan adlari ProductIndex 11-kolon kaynak sadakatiyle birebir. */
export class ManualBrandRowDto {
  @IsString()
  @MaxLength(500)
  ad: string; // Malzeme Adi — ZORUNLU (aile bucket'inin kaynagi)

  @IsOptional() @IsString() @MaxLength(200) cins?: string;
  @IsOptional() @IsString() @MaxLength(200) baglanti?: string;
  @IsOptional() @IsString() @MaxLength(120) cap?: string;
  // Boy serbest metin gelebilir ("150", "1,5") — service Float'a cevirir
  @IsOptional() @IsString() @MaxLength(60) boy?: string;
  @IsOptional() @IsString() @MaxLength(60) birim?: string;
  @IsOptional() @IsString() @MaxLength(120) urunKodu?: string;
  @IsOptional() @IsString() @MaxLength(500) not?: string;
  @IsOptional() @IsString() @MaxLength(200) kategori?: string;

  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountRate?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string; // 'TRY' | 'USD' | 'EUR'
}

export class CreateManualBrandDto {
  @IsString()
  @MaxLength(120)
  brandName: string;

  // 'mechanical' | 'electrical' — sayfaya gore FE gonderir, varsayilan mechanical
  @IsOptional()
  @IsString()
  discipline?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ManualBrandRowDto)
  rows: ManualBrandRowDto[];
}
