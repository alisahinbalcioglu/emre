import { IsArray, IsString, IsNumber, Min, Max } from 'class-validator';

export class BulkUpdateItemsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsNumber()
  @Min(0)
  @Max(100)
  discountRate: number;
}
