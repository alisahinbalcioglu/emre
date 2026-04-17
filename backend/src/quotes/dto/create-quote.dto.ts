import { IsArray, IsOptional, IsString, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteItemDto {
  @IsString()
  materialName: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  materialUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  materialMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  profitMargin?: number;
}

export class CreateQuoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  // Multi-sheet Excel raw state — opsiyonel, ExcelGrid akisi doldurur
  @IsOptional()
  sheets?: any[];

  // Orijinal Excel dosya binary'si (base64 encoded)
  @IsOptional()
  @IsString()
  originalFileBase64?: string;

  @IsOptional()
  @IsString()
  originalFileName?: string;
}
