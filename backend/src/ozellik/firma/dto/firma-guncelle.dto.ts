import { IsOptional, IsString, MaxLength, IsEmail, Matches } from 'class-validator';

/**
 * PATCH /firma govdesi (FAZ 4.1/4.3).
 *
 * ⚠ NEDEN GERCEK BIR DTO SINIFI: bu depoda `@Body()` SATIR-ICI TIP LITERALI
 * global ValidationPipe'i SESSIZCE atlar (metatype `Object` olur, pipe susar)
 * ve bu tuzak daha once ODEME YOLUNU kirmisti — `abonelik.controller.ts:57`
 * hala o desende yazili ve KOPYALANMAMALI. Sinif tipi verildiginde
 * `main.ts`teki `whitelist: true` + `transform: true` DEVREYE GIRER.
 *
 * ⚠ `whitelist: true` SESSIZ SILER: burada TANIMLANMAYAN bir alan istekten
 * atilir, istek yine 200 doner ve veri kaybolur. Yeni bir firma alani
 * eklerken semaya eklemek YETMEZ, buraya da eklenmeli (bu depoda ayni tuzak
 * CreateQuoteDto'da iki kez yasandi: `laborFirmaId` ve `displayLanguage`).
 *
 * ALAN ADLARI SEMAYLA BIREBIR: on yuzun odeme formundaki `FaturaKimligi` tipi
 * (ad/soyad/sehir/adres/postaKodu) BASKA bir sozluk kullaniyor ve
 * `satinalma.servisi.ts:344-348` onu Firma alanlarina ESLESTIRIYOR. Burada o
 * esleme YAPILMAZ — bu uc dogrudan Firma alanlarini konusur, yoksa ayni bilgi
 * icin ucuncu bir adlandirma dili dogar.
 */
export class FirmaGuncelleDto {
  /// Gorunen ad. Kayit aninda e-postanin @ oncesinden turetilir ("acme");
  /// kullanicinin duzeltebilecegi ILK yer burasi.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ad?: string;

  /// Faturaya yazilan RESMI unvan. `ad` ile AYNI SEY DEGIL — fatura servisi
  /// `unvan ?? ad` okur, yani unvan bossa faturaya "acme" yazilir.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  unvan?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Yetkili e-posta adresi gecerli degil.' })
  @MaxLength(200)
  yetkiliEposta?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Fatura e-posta adresi gecerli degil.' })
  @MaxLength(200)
  faturaEposta?: string;

  /// ⚠ BICIM DAYATILMIYOR (yalniz uzunluk): vergi no 10 hane, TCKN 11 hane,
  /// ama sahis sirketi/yabanci ortakli yapilarda istisnalar var. Kati bir
  /// regex, gecerli musteriyi fatura bilgisini GIREMEZ hale getirir; bos
  /// birakilmasi zaten serbest (fatura ELLE_MUDAHALE'ye duser, tahsilat
  /// BLOKLANMAZ).
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vergiNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  vergiDairesi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tcKimlikNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  faturaAdresi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  il?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ilce?: string;

  /// Telefon: rakam, bosluk, `+`, `-`, parantez. Uluslararasi bicimler ve
  /// dahili numaralar icin bilerek genis.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+()\s.-]*$/, {
    message: 'Telefon yalnizca rakam ve + - ( ) . bosluk icerebilir.',
  })
  telefon?: string;
}
