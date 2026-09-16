import { Equals, IsBoolean, IsObject, IsString } from 'class-validator';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  POST /abonelik/basla govdesi — FAZ 6.4 (16.09)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NEDEN SINIF, NEDEN SATIR-ICI TIP DEGIL: `@Body()` bir SATIR-ICI TIP
 *  LITERALI oldugunda global `ValidationPipe` devreye GIRMEZ (metatype
 *  `Object` olur) — yani govdeye yazilan hicbir dekorator calismaz ve kapi
 *  SESSIZCE acik kalir. Bu depoda daha once olctuk (02.09, fatura kimligi
 *  kapisi). Onay kutusu bir HUKUKI ISPAT unsuru oldugu icin kapinin
 *  gercekten kosuyor olmasi sart.
 *
 *  ⚠ `whitelist: true` acik (main.ts:37): dekoratorsuz alanlar govdeden
 *  ATILIR. `musteri` bu yuzden `@IsObject()` tasir — icerigi burada
 *  dogrulanmaz (o is `eksikMusteriAlanlari` kapisinin, mesajlari musteriye
 *  gorunur), ama alan govdede KALIR.
 */
export class AbonelikBaslaDto {
  @IsString()
  paketSurumuId: string;

  /**
   * ON BILGILENDIRME FORMU + MESAFELI SATIS SOZLESMESI ONAYI — ZORUNLU.
   *
   * ⚠ `@Equals(true)` KULLANILIYOR, `@IsBoolean()` DEGIL (5.3 deseni):
   * yalniz "boolean mi" diye bakmak `false` degerini de GECERLI sayardi ve
   * sunucu, onay vermemis bir musteriye odeme formu acardi. On yuzdeki
   * `disabled` dugme yalnizca tarayici kolayligidir; istegi elle atan biri
   * onu HIC gormez. Ispat yuku SATICIDA oldugu icin kapi SUNUCUDA.
   */
  @IsBoolean({ message: 'Ön bilgilendirme ve mesafeli satış sözleşmesi onayı gereklidir.' })
  @Equals(true, {
    message:
      'Devam edebilmek için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayını işaretlemelisiniz.',
  })
  sozlesmeOnayi: boolean;

  @IsObject()
  musteri: {
    ad: string;
    soyad: string;
    eposta: string;
    telefon: string;
    kimlikNo: string;
    sehir: string;
    adres: string;
    postaKodu?: string;
  };
}
