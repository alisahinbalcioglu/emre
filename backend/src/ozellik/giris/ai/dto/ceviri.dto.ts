import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * ÇEVİRİ UÇLARININ GÖVDELERİ (Faz 6.2/6.8, 14.09.2026).
 *
 * ⚠ SINIF DTO ZORUNLU: 13.08'den 14.09'a kadar `@Body() body: { metinler: … }`
 * satır-içi tip literaliydi. ValidationPipe tipi çalışma anında göremediği için
 * gövdeyi HİÇ doğrulamıyordu; 50 MB'lık bir metin listesi olduğu gibi geçiyordu.
 *
 * ⚠ SATIR SAYISI ALANI BİLEREK YOK: global ValidationPipe `whitelist: true` —
 * istemcinin eklediği `satirSayisi` gibi alanlar sessizce atılır. Kotadan
 * düşecek satırı sunucu kayıtlı tekliften kendisi hesaplar.
 */
export class CeviriIstegiDto {
  @IsUUID()
  quoteId!: string;

  @IsOptional()
  @IsIn(['en'])
  hedefDil?: string;
}

export class CeviriOnizlemeSorgusuDto {
  @IsUUID()
  quoteId!: string;
}

/** Yönetici düzeltmesi — global önbelleğe `kaynak='manual'` yazar. */
export class CeviriDuzeltmeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  kaynak!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  ceviri!: string;

  @IsOptional()
  @IsIn(['en'])
  hedefDil?: string;
}
