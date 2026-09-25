import { Equals, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * POST /abonelik/degistir govdesi (23.09.2026 — paket degisimi).
 *
 * ⚠ SINIF, SATIR-ICI TIP DEGIL — `AbonelikBaslaDto` ile ayni gerekce: satir-ici
 * tip literalinde global `ValidationPipe` devreye GIRMEZ ve asagidaki kapilar
 * SESSIZCE acik kalir.
 *
 * ⚠ ONAY BURADA DA ZORUNLU: paket degisimi sozlesme BEDELINI degistirir (yeni
 * paketin fiyati). Satin almadaki onay yeni tutari kapsamaz; musteri yeni
 * paketi ve fiyatini gorup ayni metni YENIDEN onaylar. Onayin izi (zaman +
 * metin surumu) olay kaydina SUNUCUDA yazilir.
 */
export class AbonelikDegistirDto {
  @IsString()
  paketSurumuId: string;

  @IsBoolean({ message: 'Ön bilgilendirme ve mesafeli satış sözleşmesi onayı gereklidir.' })
  @Equals(true, {
    message:
      'Devam edebilmek için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayını işaretlemelisiniz.',
  })
  sozlesmeOnayi: boolean;

  /**
   * Yonetici onerisinin kabulu (A2 Blok 2). Verilirse oneri kuyrukta,
   * iyzico'dan ONCE denetlenir (bekliyor mu, bu firmanin mi, ayni paket mi);
   * onay kapisi YUKARIDAKIYLE AYNI — oneri sozlesme onayinin yerini TUTMAZ.
   */
  @IsOptional()
  @IsUUID()
  oneriId?: string;
}
