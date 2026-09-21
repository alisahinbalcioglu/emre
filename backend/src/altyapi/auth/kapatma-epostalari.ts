import type { EpostaTalebi } from '../../ozellik/odeme/eposta/eposta.servisi';
import { trTarih } from '../../ozellik/odeme/abonelik/ceviri-kotasi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HESAP KAPATMA E-POSTALARI (plan 5.8 §3.4 · 21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ TARIH GUN OLARAK YAZILIR, "30 gun sonra" DEGIL (Emre karari). "30 gun"
 *  yazan bir e-posta, musteri onu iki hafta sonra actiginda SAYMAYA baslar
 *  ve yanlis tarihi hatirlar. `trTarih` gg.aa.yyyy uretir ve Turkiye saatini
 *  (UTC+3) hesaba katar — UTC tarihi yazmak gece yarisina yakin kapatmalarda
 *  musteriye BIR GUN ERKEN bir son tarih soylerdi.
 *
 *  ⚠ `trTarih` KOPYALANMAZ, `ceviri-kotasi.ts`ten ALINIR: ayni bicimi ikinci
 *  kez yazmak, birinin gun/ay sirasini degistirdigi gun iki farkli tarih
 *  bicimi uretirdi. O dosya yalniz `@nestjs/common`a baglidir, bagimlilik
 *  yuku yok.
 *
 *  ⚠ SIR YOK: bu e-postalar baglanti/token TASIMAZ. Geri donmek isteyen
 *  musteri normal giris ekranini kullanir; "Parolamı unuttum" akisi zaten
 *  kendi e-postasini gonderir. Kapatma bildirimine bir oturum baglantisi
 *  koymak, kapatmayi bir hesap ele gecirme yuzeyi yapardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * KENDI KAPATAN MUSTERIYE — geri donus yolu ACIK (K1).
 *
 * ⚠ "Verileriniz silindi" DEMEZ: 30 gun boyunca silinmiyor. Bu dosyanin ve
 * `hesap.servisi.ts` basliginin ortak kurali — kapatma ile imhayi ayni
 * kelimeyle anlatmak yanlis beyandir.
 */
export function kendiKapatmaEpostasi(kime: string, imhaTarihi: Date): EpostaTalebi {
  const gun = trTarih(imhaTarihi);
  return {
    kime,
    konu: 'MetaPriceX — hesabınız kapatıldı',
    baslik: 'Hesabınız kapatıldı',
    paragraflar: [
      `Hesabınız kapatıldı. Geri dönebilmeniz için verilerinizi ${gun} tarihine kadar saklıyoruz.`,
      `Bu tarihe kadar aynı e-posta ve parolanızla giriş yapıp bir paket seçerek hesabınızı kaldığınız yerden açabilirsiniz. Parolanızı unuttuysanız giriş ekranındaki "Parolamı unuttum" bağlantısını kullanabilirsiniz.`,
      `Bu tarihten sonra teklifleriniz, kütüphaneniz ve yüklediğiniz belgeler kalıcı olarak silinir.`,
    ],
    altNot:
      'Fatura ve ödeme kayıtları, hesabınız kapatılsa bile vergi mevzuatı gereği saklanır.',
  };
}

/**
 * FIRMASI KAPANAN UYEYE — KISA (§3.4).
 *
 * ⚠ Uyeye "paket secerek geri acabilirsiniz" DENMEZ: karar SAHIBINDIR, uye
 * odeme yapamaz. Yanlis vaat, musteri hizmetlerine donen bir sorudur.
 * ⚠ Sahibin ADI ya da e-postasi YAZILMAZ: uye zaten biliyor, yazmak
 * gereksiz kisisel veri dolasimi olurdu.
 */
export function firmaKapandiEpostasi(kime: string, imhaTarihi: Date): EpostaTalebi {
  const gun = trTarih(imhaTarihi);
  return {
    kime,
    konu: 'MetaPriceX — firmanızın hesabı kapatıldı',
    baslik: 'Firmanızın MetaPriceX hesabı kapatıldı',
    paragraflar: [
      'Firmanızın MetaPriceX hesabı kapatıldı ve erişiminiz durduruldu.',
      `Firma sahibiniz ${gun} tarihine kadar bir paket seçerek hesabı geri açarsa erişiminiz kendiliğinden geri gelir.`,
      `Bu tarihten sonra firmanın teklifleri, kütüphanesi ve yüklenen belgeleri kalıcı olarak silinir.`,
    ],
    altNot: 'Bu süre boyunca kendi verilerinizi indirme hakkınız açık kalır.',
  };
}
