import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS DTO'LARI (§5.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ HEPSI SINIF: `@Body()` satir-ici tip literali ValidationPipe'i SESSIZCE
 *  ATLAR (bu depoda olculmus hata: "yolu uctan uca kostur"). Sinif olmayan
 *  bir gövde tipi, `whitelist`/`forbidNonWhitelisted` kurallarini da
 *  devre disi birakirdi.
 *
 *  ⚠ `tarayiciBagi`/`tarayiciSirri` ASLA sirrin KENDISI degildir: gövdede
 *  giden 64 haneli hex bir SHA-256 OZETIDIR (§5.4). Sir yalniz sekmenin
 *  `sessionStorage`inda durur.
 */

/** 64 haneli kucuk harf hex — `sha256hex(sekme sirri)`. */
const OZET_DESENI = /^[0-9a-f]{64}$/;

export class SsoKesfetDto {
  // ⚠ Alan adi `email` (Ingilizce): `EpostaHizSiniriGuard` gövdede TAM bu
  // adi ariyor (`eposta-hiz-siniri.guard.ts`). `eposta` yazilsaydi hiz
  // siniri SESSIZCE devre disi kalirdi.
  @IsEmail()
  email!: string;
}

export class SsoBaslatDto {
  @IsUUID()
  saglayiciId!: string;

  @Matches(OZET_DESENI, { message: 'tarayiciBagi 64 haneli hex olmalı.' })
  tarayiciBagi!: string;
}

export class SsoNiyetDto {
  @IsIn(['sinama', 'bagla'])
  amac!: 'sinama' | 'bagla';

  @Matches(OZET_DESENI, { message: 'tarayiciBagi 64 haneli hex olmalı.' })
  tarayiciBagi!: string;

  /** Parolali hesapta ZORUNLU (servis 400 `PAROLA_HATALI` doner, R1-O3). */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  parola?: string;
}

export class SsoDegisDto {
  @IsString()
  @Length(40, 60)
  kod!: string;

  @IsString()
  @Length(40, 60)
  tarayiciSirri!: string;
}

export class SsoKatilDto {
  @IsString()
  @Length(40, 60)
  bilet!: string;

  @IsString()
  @Length(40, 60)
  tarayiciSirri!: string;

  // ⚠ ONAY ZORUNLU ve ONCEDEN ISARETLI DEGIL (faz5 B6 deseni): kayit
  // ekraniyla AYNI iki kutu, AYNI metin.
  @IsBoolean()
  @Equals(true, { message: 'Kullanım koşullarını onaylamanız gerekiyor.' })
  sozlesmeOnayi!: boolean;

  @IsOptional()
  @IsBoolean()
  ticariIletiOnayi?: boolean;
}

export class SsoBaglantiKaldirDto {
  /** Parolali hesapta zorunlu; parolasiz hesapta `authAt ≤ 600 sn` aranir. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  parola?: string;
}

export class KurumsalGirisKaydetDto {
  @IsIn(['entra', 'google'])
  tip!: 'entra' | 'google';

  @IsOptional()
  @IsString()
  @Length(1, 100)
  entraKiraciId?: string;

  @IsString()
  @Length(1, 200)
  clientId!: string;

  /** Guncellemede BOS birakilirsa mevcut sir KORUNUR (yanitlarda ASLA donmez). */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  istemciSirri?: string;

  @IsOptional()
  @IsISO8601()
  istemciSirriSonGecerlilik?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  beyanAlanAdlari!: string[];
}

export class KurumsalGirisEtkinlestirDto {
  @IsBoolean()
  jitKatilim!: boolean;

  @IsBoolean()
  zorunlu!: boolean;
}

/** Geri donusu olmayan islemlerde yazarak onay (§5.5). */
export class SilOnayDto {
  @Equals('SİL', { message: 'Silmek için kutuya SİL yazın.' })
  onay!: string;
}
