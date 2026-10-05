import {
  IsString, IsOptional, IsNumber, IsArray, ValidateNested,
  Min, Max, MaxLength, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Malzeme adinin azami uzunlugu — urun olusturma (bu DTO), tekil kutuphane
 *  kalemi (`CreateLibraryItemDto`) ve kutuphane izgarasindaki ad duzeltmesi
 *  (`saveBrandSheets`) AYNI sinir. Ad urun
 *  indeksine gider: `buildProductIndex` adin uzunluguyla karesel buyur
 *  (P4b guvenlik incelemesi 05.10: 10 bin karakter 3-4 sn, 20 bin 12-16 sn
 *  olay dongusu). */
export const MALZEME_ADI_AZAMI = 500;

/** Kullanicinin "Marka Ekle" bos tablosunda doldurdugu TEK satir.
 *  Alan adlari ProductIndex 11-kolon kaynak sadakatiyle birebir. */
export class ManualBrandRowDto {
  @IsString()
  @MaxLength(MALZEME_ADI_AZAMI)
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
  // 'TRY' | 'USD' | 'EUR' — yazim kurali serviste (`paraBirimleriniDogrula`, KUR-02):
  // bos/taninmayan kod satir adiyla 400. Burada yalniz tip; mesaj ayni dilde.
  @IsOptional()
  @IsString({ message: 'para birimi metin olmalı — TRY, USD ya da EUR yazın' })
  @MaxLength(8, { message: 'para birimi tanınmadı — TRY, USD ya da EUR yazın' })
  currency?: string;
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
