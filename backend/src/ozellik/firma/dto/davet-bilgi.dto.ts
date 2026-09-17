import { IsString, Length } from 'class-validator';

export class DavetBilgiDto {
  @IsString()
  @Length(20, 100)
  token!: string;
}
