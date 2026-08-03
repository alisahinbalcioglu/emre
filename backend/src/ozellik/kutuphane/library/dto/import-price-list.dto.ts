import { IsString } from 'class-validator';

export class ImportPriceListDto {
  @IsString()
  brandId: string;

  @IsString()
  priceListId: string;
}
