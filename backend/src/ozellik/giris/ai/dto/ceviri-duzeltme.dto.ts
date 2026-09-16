import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * FİRMA ÇEVİRİ DÜZELTMESİ UÇLARININ GÖVDELERİ (Faz 6.9, 16.09.2026).
 *
 * ⚠ SINIF DTO ZORUNLU (`ceviri.dto.ts` dersi): satır-içi tip literali
 * ValidationPipe'ı SESSİZCE atlar.
 * ⚠ `firmaId` ALANI BİLEREK YOK: global ValidationPipe `whitelist: true` —
 * istemcinin eklediği `firmaId` atılır; firma her zaman oturumdan gelir (K9).
 * ⚠ `quoteId` ZORUNLU (Revizyon 1, R1-B1): düzeltme yalnız seçili teklifin
 * kayıtlı metinleri için yazılır — rastgele metinle sözlük ya da olay üretilemez.
 */

/** Tek karşılığın (ve kaynağın) azami uzunluğu — canlıdaki en uzun ad ölçülemedi (§8). */
export const DUZELTME_AZAMI = 2000;

export class CeviriDuzeltmeSorgusuDto {
  @IsUUID()
  quoteId!: string;

  @IsOptional()
  @IsIn(['en'])
  hedefDil?: string;
}

export class CeviriFirmaDuzeltmeDto {
  @IsUUID()
  quoteId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(DUZELTME_AZAMI)
  kaynak!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(DUZELTME_AZAMI)
  ceviri!: string;

  @IsOptional()
  @IsIn(['en'])
  hedefDil?: string;
}
