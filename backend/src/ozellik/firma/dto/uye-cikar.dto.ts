import { IsString, MaxLength } from 'class-validator';

/**
 * ⚠ E-POSTA ONAYI: yanlis satira basip bir calisani cikarmak geri donusu ZOR
 * bir zarardir. Kullanici hedefin adresini ELLE yazar.
 */
export class UyeCikarDto {
  @IsString()
  @MaxLength(254)
  epostaOnayi!: string;
}
