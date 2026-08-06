import {
  IsString, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ManualBrandRowDto } from './create-manual-brand.dto';

/** Kutuphanedeki MEVCUT markaya satir ekleme — hedef liste secilir.
 *  listId 'new' → yeni LibraryList olusturulur (iscilik "+ Yeni Liste" ikizi);
 *  aksi halde satirlar o listeye katilir. */
export class AddLibraryRowsDto {
  @IsString()
  @MaxLength(64)
  listId: string; // 'new' | LibraryList.id

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ManualBrandRowDto)
  rows: ManualBrandRowDto[];
}
