import { IsIn } from 'class-validator';

export class RolDegistirDto {
  @IsIn(['sahip', 'uye'], { message: "Rol yalnız 'sahip' ya da 'uye' olabilir." })
  firmaRol!: 'sahip' | 'uye';
}
