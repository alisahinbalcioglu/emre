import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

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
}
