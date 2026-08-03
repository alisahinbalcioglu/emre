import { IsString, IsNumber, IsOptional, Min, Max, IsObject } from 'class-validator';

export class CreateLibraryItemDto {
  @IsOptional()
  @IsString()
  materialId?: string;

  @IsOptional()
  @IsString()
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

  // Ekipman ozellikleri (guc, kapasite, voltaj vs) — serbest key-value
  @IsOptional()
  @IsObject()
  specs?: Record<string, string>;

  // "ekipman" | "boru" | "fitting" | null
  @IsOptional()
  @IsString()
  category?: string;
}
