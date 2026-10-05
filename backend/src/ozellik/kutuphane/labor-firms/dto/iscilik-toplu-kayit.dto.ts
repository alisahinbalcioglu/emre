import { Type } from 'class-transformer';
import { Allow, IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * ISCILIK TOPLU KAYIT GOVDESI (POST /labor-firms/:id/save-bulk; P4b, S1
 * incelemesi 05.10.2026).
 *
 * Eskiden satir ici tip: genel ValidationPipe (main.ts) sinif olmayan tipi
 * DOGRULAMAZ, `whitelist` de silmez — `items: "abc"` ya da `[null]` servisi
 * TypeError ile 500'e dusuruyordu (`[5]` sessizce suzuluyordu); `priceListId:
 * { not: '' }` findFirst kosulunu dusurup kaydi firmanin RASTGELE listesine
 * yaziyordu (P1 takibi servis kapisiyla kapatti; bu DTO birinci kilit, servis
 * ikinci).
 *
 * SATIR duzeyinde HOSGORULU: bos ya da yarim satir (ad < 2 harf, fiyat <= 0)
 * SERVISTE suzulur, burada 400 OLMAZ — on yuz yarim doldurulmus izgarayi
 * oldugu gibi gonderir. Para birimi serviste dogrulanir (KUR-02: satir adiyla
 * Turkce mesaj); burada yalniz gecirilir.
 * ⚠ `whitelist: true` DEKORATORSUZ alani SESSIZCE siler: her alan dekoratorlu.
 */
export class IscilikFiyatSatiriDto {
  @IsOptional()
  @IsString()
  laborName?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  discountRate?: number;

  /** KUR-02 serviste (satir adiyla Turkce mesaj); tipi burada denetlenmez. */
  @Allow()
  currency?: unknown;
}

export class IscilikTopluKayitDto {
  /** 'new' ya da liste kimligi; kimlik BICIMI serviste (`satirKimligiGecerli`,
   *  ayni metin). Metin olmayan deger (eksik, nesne, sayi) burada 400. */
  @IsString({ message: 'Gecersiz fiyat listesi kimligi' })
  priceListId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IscilikFiyatSatiriDto)
  items!: IscilikFiyatSatiriDto[];

  /** Sabit-format HAM izgara (InlineFirmEntry): yalniz nesne olmasi denetlenir,
   *  icerik dogrulanmadan sheet JSON'una yazilir (Cinsi/Çap/Para/Not sutunlari).
   *  class-transformer kopyalarken prototip adli anahtarlari (`__proto__`,
   *  `constructor`, `toString`…) atar — bugunku arayuz bu adlari uretmez. */
  @IsOptional()
  @IsObject()
  sheet?: { columnDefs: any[]; rowData: any[]; columnRoles: any; headerEndRow?: number };
}
