import { IsString, IsNumber, Min, Max } from 'class-validator';

export class BulkDiscountDto {
  @IsString()
  brandId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountRate: number;
}
