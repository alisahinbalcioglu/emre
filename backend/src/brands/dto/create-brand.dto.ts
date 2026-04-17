import { IsString, IsOptional, MinLength, IsIn } from 'class-validator';

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(['mechanical', 'electrical'])
  discipline?: string;
}
