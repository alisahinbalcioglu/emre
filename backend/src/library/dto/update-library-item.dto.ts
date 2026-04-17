import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateLibraryItemDto {
  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
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
