import { IsString, IsNumber, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { MALZEME_ADI_AZAMI } from './create-manual-brand.dto';

export class CreateLibraryItemDto {
  @IsOptional()
  @IsString()
  materialId?: string;

  // P4b 2b guvenlik incelemesi: indekssiz satirin adi eslestirmede HER istekte
  // indekslenir (karesel) — urun olusturma ve ad duzeltmesiyle AYNI sinir.
  @IsOptional()
  @IsString()
  @MaxLength(MALZEME_ADI_AZAMI)
  materialName?: string;

  @IsString()
  brandId: string;

  @IsOptional()
  @IsNumber()
  customPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  listPrice?: number;

  // NOT: `specs` ve `category` alanlari 10.08'de KALDIRILDI — ekipman
  // isaretleme ozelligi cikarildi. DB kolonlari DURUYOR (mevcut veri
  // kaybolmasin diye); yalnizca yazma yolu kapatildi.
}
