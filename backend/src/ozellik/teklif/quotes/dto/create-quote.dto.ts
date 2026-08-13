import { IsArray, IsOptional, IsString, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteItemDto {
  @IsString()
  materialName: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  /** Secilen iscilik firmasinin ID'si. Sema'da QuoteItem.laborFirmaId ZATEN
   *  vardi (prisma/schema.prisma) ama DTO'da alan YOKTU: ekranda firma secili
   *  olmasina ragmen hicbir yere yazilmiyordu — malzeme markasinin ikizi
   *  unutulmustu. whitelist:true oldugu icin alan tanimlanmadan gelen deger
   *  SESSIZCE siliniyordu. */
  @IsOptional()
  @IsString()
  laborFirmaId?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  materialUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborUnitPrice?: number;

  // ── KL P1-b: EKRANIN hesapladigi satir toplamlari (tek kaynak) ─────────
  // Ekran hucresinde ne yaziyorsa o kaydedilir; backend yeniden turetmez.
  // Gonderilmezse (eski istemci) backend yukariYuvarla(birim × miktar) ile
  // ayni kurali uygular — quotes.service.ts satirToplami().
  @IsOptional()
  @IsNumber()
  @Min(0)
  materialTotalPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborTotalPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  materialMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  profitMargin?: number;
}

export class CreateQuoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  // Multi-sheet Excel raw state — opsiyonel, ExcelGrid akisi doldurur
  @IsOptional()
  sheets?: any[];

  // Orijinal Excel dosya binary'si (base64 encoded)
  @IsOptional()
  @IsString()
  originalFileBase64?: string;

  @IsOptional()
  @IsString()
  originalFileName?: string;

  /** Teklifin dili ('tr' | 'en') — Duzenle ekraninda ceviri yapilip
   *  kaydedildiginde 'en' gelir.
   *
   *  ⚠ DTO'ya EKLENMESI SART: `whitelist:true` oldugu icin burada tanimli
   *  olmayan alan SESSIZCE silinir — marka/firma ikizinde yasanan hatanin
   *  aynisi (yukaridaki `laborFirmaId` notu). */
  @IsOptional()
  @IsString()
  displayLanguage?: string;
}
