import { IsString, IsNumber, IsPositive } from 'class-validator';

export class CreateMaterialPriceDto {
  @IsString()
  materialId: string;

  @IsString()
  brandId: string;

  @IsNumber()
  @IsPositive()
  price: number;
}
