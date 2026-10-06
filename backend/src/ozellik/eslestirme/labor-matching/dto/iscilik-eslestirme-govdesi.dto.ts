import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MetinSozlugu } from '../../matching/dto/eslestirme-govdesi.dto';

/**
 * ISCILIK ESLESTIRME UCLARININ GOVDESI (C11, Paket 4a, 01.10.2026) — malzeme
 * ikizi `../../matching/dto/eslestirme-govdesi.dto.ts` (gerekce orada). Her
 * alan dekoratorlu (`whitelist` dekoratorsuz alani siler). Boyut tavani DTO'da
 * degil, uctaki `@DiziTavani`da (malzeme ikiziyle ayni kurallar, 06.10).
 */

/** POST /labor-matching/bulk-match */
export class IscilikTopluEslestirmeDto {
  @IsString()
  @IsNotEmpty()
  firmaId!: string;

  @IsArray()
  @IsString({ each: true })
  laborNames!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variantTags?: string[];

  @IsOptional()
  @MetinSozlugu()
  units?: Record<string, string>;
}

/** POST /labor-matching/remember */
export class IscilikHafizasiDto {
  @IsString()
  @IsNotEmpty()
  firmaId!: string;

  @IsString()
  laborName!: string;

  @IsString()
  secilenAd!: string;
}
