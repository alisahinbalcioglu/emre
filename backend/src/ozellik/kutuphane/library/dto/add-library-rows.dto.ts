import {
  IsString, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ManualBrandRowDto } from './create-manual-brand.dto';
import { KUTUPHANE_EKLEME_SATIR_TAVANI } from '../../../../altyapi/http/dizi-tavani';

/** Kutuphanedeki MEVCUT markaya satir ekleme — hedef liste secilir.
 *  listId 'new' → yeni LibraryList olusturulur (iscilik "+ Yeni Liste" ikizi);
 *  aksi halde satirlar o listeye katilir. */
export class AddLibraryRowsDto {
  @IsString()
  @MaxLength(64)
  listId: string; // 'new' | LibraryList.id

  @IsArray()
  @ArrayMinSize(1)
  // Tavan tek kaynaktan; uçtaki `@DiziTavani` aynı sayıyla pipe'tan ÖNCE keser.
  @ArrayMaxSize(KUTUPHANE_EKLEME_SATIR_TAVANI)
  @ValidateNested({ each: true })
  @Type(() => ManualBrandRowDto)
  rows: ManualBrandRowDto[];
}
