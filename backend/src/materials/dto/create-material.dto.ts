import { IsString, MinLength } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  @MinLength(1)
  name: string;
}
