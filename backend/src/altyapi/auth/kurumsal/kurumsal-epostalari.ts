import type { EpostaTalebi } from '../../../ozellik/odeme/eposta/eposta.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F3b — KURUMSAL GIRIS BILGI E-POSTALARI (§5.8, §5.10)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Hepsi BILGILENDIRMEDIR (best-effort `gonder`): hicbiri bir akisi
 *  BLOKLAMAZ. ⚠ IKINCI GONDERICI YOK — `EpostaServisi` uzerinden gider.
 *
 *  ── NEDEN VAR (R1-O3) ───────────────────────────────────────────────────
 *  Bir sirket hesabinin baglanmasi, hesaba KALICI ve PAROLASIZ bir giris
 *  yolu eklemek demektir. Kullanici "ben yapmadim" diyebilmeli ve kendi
 *  baslatmadigi baglantiyi Profil'den kaldirabilmeli.
 *
 *  ⚠ SAF: bu dosya e-posta GONDERMEZ, yalniz `EpostaTalebi` URETIR —
 *  metinler SMTP olmadan olculebilir.
 */

const DESTEK_CUMLESI =
  'Bu işlemi siz yapmadıysanız hemen destek ekibimize yazın.';

export function kurumsalBaglandiEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'Hesabınız şirket hesabınıza bağlandı',
    baslik: 'Hesabınız şirket hesabınıza bağlandı',
    paragraflar: [
      'Bundan sonra giriş ekranında "Şirket hesabımla giriş yap" ile ' +
        'parolanızı yazmadan girebilirsiniz.',
      'Bu bağlantıyı istediğiniz zaman Profil → Şirket hesabı → ' +
        '"Bağlantıyı kaldır" ile kaldırabilirsiniz.',
      DESTEK_CUMLESI,
    ],
  };
}

export function kurumsalBaglantiKaldirildiEpostasi(kime: string): EpostaTalebi {
  return {
    kime,
    konu: 'Şirket hesabı bağlantınız kaldırıldı',
    baslik: 'Şirket hesabı bağlantınız kaldırıldı',
    paragraflar: [
      'Artık "Şirket hesabımla giriş yap" ile giremezsiniz; girişte ' +
        'parolanız istenecek.',
      DESTEK_CUMLESI,
    ],
  };
}

/**
 * Istemci sirrinin bitisine 14 gun kala firma sahibine gider (gunde en
 * fazla bir kez). Kilitlenme kurtarmasinin BIRINCI adimi budur (§5.10):
 * sirri suresi dolmus bir saglayiciyla zorunlu giris acik kalirsa firmadaki
 * herkes disarida kalir.
 */
export function sirBitiyorEpostasi(kime: string, bitis: Date | null): EpostaTalebi {
  const gun = bitis ? bitis.toLocaleDateString('tr-TR') : 'yakında';
  return {
    kime,
    konu: 'Şirket girişi anahtarınızın süresi doluyor',
    baslik: 'Şirket girişi anahtarınızın süresi doluyor',
    paragraflar: [
      `Firmanızın kurumsal giriş ayarındaki istemci anahtarının süresi ${gun} tarihinde doluyor.`,
      'Süresi dolduğunda ekibiniz şirket hesabıyla giriş yapamaz. ' +
        'Kimlik sağlayıcınızın panelinden yeni bir anahtar oluşturup ' +
        'Ekip → Kurumsal giriş sayfasından güncelleyin.',
      'Kurumsal girişi zorunlu kıldıysanız ve kimse giremezse destek ' +
        'ekibimiz zorunluluğu geçici olarak kaldırabilir.',
    ],
  };
}
