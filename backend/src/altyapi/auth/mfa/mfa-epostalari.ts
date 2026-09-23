import type { EpostaTalebi } from '../../../ozellik/odeme/eposta/eposta.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — IKI ADIMLI GIRIS BILGI E-POSTALARI (§4.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Hepsi BILGILENDIRMEDIR (best-effort `gonder`): hicbiri bir akisi
 *  BLOKLAMAZ. Gonderilemezse islem yine tamamlanir, hata loglanir.
 *
 *  ── NEDEN VAR (R1-Y1c) ──────────────────────────────────────────────────
 *  Iki adimli girisi acan/kapatan/sifirlayan islem, hesabi DEVRALMANIN da
 *  yoludur. Kullanici "ben yapmadim" diyebilmeli; bu yuzden "acildi" ve
 *  "kapatildi" metinlerinde destek cumlesi ZORUNLU.
 *
 *  ⚠ SAF: bu dosya e-posta GONDERMEZ, yalniz `EpostaTalebi` URETIR. Boylece
 *  metinler SMTP olmadan olculebilir.
 */

const DESTEK_CUMLESI =
  'Bu işlemi siz yapmadıysanız hemen destek ekibimize yazın; yönetici iki ' +
  'adımlı girişi sıfırlayıp hesabınızı size geri verebilir.';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YONETICI GIRIS KODU (23.09.2026, Emre karari)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU POSTA "BILGILENDIRME" DEGIL, AKISIN KENDISIDIR. Yukaridaki bloguN
 *  "hicbiri bir akisi BLOKLAMAZ" kurali BUNA UYMAZ: bu posta gitmezse
 *  yonetici GIREMEZ. Cagiran taraf `gonder`in sonucunu OKUMAK ve
 *  gonderilemediyse kullaniciya soylemek zorundadir.
 *
 *  ⚠ DESTEK CUMLESI YOK, cunku bu posta bir islemi haber vermiyor; kodun
 *  kendisini tasiyor. Yerine "siz istemediyseniz" uyarisi konuldu: kod
 *  isteyen kisi kullanici degilse, parolasi baskasinin elinde demektir.
 *
 *  ⚠ KOD KONUYA YAZILMAZ. Konu satiri bildirim onizlemelerinde kilitli
 *  ekranda gorunur; kodu oraya koymak, telefonu eline alan herkese vermek
 *  olurdu.
 */
export function mfaGirisKoduEpostasi(kime: string, kod: string, dakika: number): EpostaTalebi {
  return {
    kime,
    konu: 'Giriş doğrulama kodunuz',
    baslik: 'Giriş doğrulama kodunuz',
    paragraflar: [
      `Kodunuz: <strong style="font-size:22px;letter-spacing:3px">${kod}</strong>`,
      `Kod ${dakika} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
      'Bu kodu kimseyle paylaşmayın. MetaPriceX çalışanları sizden bu kodu ' +
        'asla istemez.',
      'Giriş yapmayı siz denemediyseniz parolanız başkasının elinde olabilir: ' +
        'hemen parolanızı değiştirin.',
    ],
  };
}

export function mfaAcildiEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'İki adımlı giriş açıldı',
    baslik: 'Hesabınızda iki adımlı giriş açıldı',
    paragraflar: [
      'Bundan sonra giriş yaparken parolanızın yanında doğrulama ' +
        'uygulamanızın ürettiği 6 haneli kod istenecek.',
      'Kurtarma kodlarınızı güvenli bir yerde sakladığınızdan emin olun: ' +
        'telefonunuzu kaybederseniz hesabınıza girmenin tek yolu onlardır.',
      DESTEK_CUMLESI,
    ],
  };
}

export function mfaKapatildiEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'İki adımlı giriş kapatıldı',
    baslik: 'Hesabınızda iki adımlı giriş kapatıldı',
    paragraflar: [
      'Artık giriş yaparken yalnızca parolanız istenecek. Güvenlik için ' +
        'diğer cihazlardaki oturumlar kapatıldı.',
      DESTEK_CUMLESI,
    ],
  };
}

export function mfaSifirlandiEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'İki adımlı giriş sıfırlandı',
    baslik: 'İki adımlı girişiniz yönetici tarafından sıfırlandı',
    paragraflar: [
      'Hesabınızdaki iki adımlı giriş kaldırıldı ve kurtarma kodlarınız ' +
        'silindi. Şimdi yalnızca parolanızla girebilirsiniz.',
      'Güvenlik için diğer cihazlardaki oturumlar kapatıldı. Girdikten ' +
        'sonra iki adımlı girişi yeniden kurmanızı öneririz.',
      DESTEK_CUMLESI,
    ],
  };
}

export function mfaKurtarmaKoduKullanildiEpostasi(
  kime: string,
  kalan: number,
): EpostaTalebi {
  return {
    kime,
    konu: 'Hesabınıza kurtarma koduyla giriş yapıldı',
    baslik: 'Kurtarma koduyla giriş yapıldı',
    paragraflar: [
      `Hesabınıza doğrulama uygulaması yerine bir kurtarma koduyla giriş ` +
        `yapıldı. Kalan kurtarma kodu sayısı: ${kalan}.`,
      'Kodlarınız azaldıysa profil sayfanızdan yenileyebilirsiniz.',
      DESTEK_CUMLESI,
    ],
  };
}

export function mfaBesHataliEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'Hesabınızda art arda hatalı doğrulama kodu denendi',
    baslik: 'Parolanız doğru girildi, kod 5 kez yanlış girildi',
    paragraflar: [
      'Hesabınıza girilirken parola DOĞRU girildi ama iki adımlı giriş kodu ' +
        'art arda 5 kez yanlış girildi.',
      'Bu siz değilseniz parolanız başkasının elinde olabilir: parolanızı ' +
        'HEMEN değiştirin.',
    ],
  };
}

export function mfaKilitlendiEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'İki adımlı giriş geçici olarak kilitlendi',
    baslik: 'Çok fazla hatalı kod: doğrulama adımı kilitlendi',
    paragraflar: [
      'Art arda 20 hatalı deneme sonrasında iki adımlı giriş adımı ' +
        'kilitlendi. Şu an kod ya da kurtarma kodu kabul edilmiyor.',
      'Kilidi açmanın iki yolu var: "Parolamı unuttum" ile parolanızı ' +
        'sıfırlamak ya da yöneticinizin iki adımlı girişi sıfırlaması.',
    ],
  };
}
