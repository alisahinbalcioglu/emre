/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ABONELIK OZETI — hesap sayfasindaki TEK dogru kaynak
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (03.09'da olculdu)
 *
 *  Abonelik bilgisi IKI ekranda, IKI FARKLI KAYNAKTAN gosteriliyordu ve
 *  ikisi CELISIYORDU:
 *    · `/abonelik`  → gercek `Abonelik` satiri  → "miras-pro · AKTIF"
 *    · `/profile`   → ESKI `UserSubscription`   → "MEP (Her Ikisi) · Suresiz"
 *  (`auth.service.ts:89` hala `prisma.userSubscription.findMany` okuyor.)
 *
 *  ADIM 2'den beri yetenekler `Abonelik`ten TURETILIYOR; eski tablo bir
 *  KALINTI. Yani profildeki kutu, sistemin karar vermek icin kullanmadigi
 *  bir veriyi "aktif aboneliginiz" diye gosteriyordu. Kullanici istegi
 *  "abonelik bilgisini komple hesap sayfasina tasi" oldugu icin, tasirken
 *  DOGRU kaynaga baglanmasi sart — yoksa yanlis veri TEK kaynak olurdu.
 *
 *  Bu modul `ErisimKarari`ni (yani `/auth/me` → `erisim`) ekrana cevirir.
 */

import type { AbonelikDurumu } from './erisim-durumu';

export interface AbonelikOzeti {
  /** Paket kodu (orn. "pro-mek"); abonelik yoksa null. */
  paketKodu: string | null;
  /** Ekranda gosterilecek paket adi. */
  baslik: string;
  /** Durum KODU (AKTIF · DENEME · ASKIDA · ...) — karar icin; ekrana BASILMAZ. */
  durum: string;
  /** Durum rozetinin ekran metni ("Aktif", "Askıda" ...); kod yoksa bos. */
  durumEtiketi: string;
  /** Kalan gun; bilinmiyorsa null. */
  kalanGun: number | null;
  /** Ikincil satir: "23 gun kaldi" / "Abonelik yok" gibi. */
  altMetin: string;
  /** Iptal edilebilir mi? Yalniz YASAYAN abonelikte anlamli. */
  iptalEdilebilir: boolean;
}

/** Iptalin anlamli oldugu durumlar. */
const YASAYAN_DURUMLAR = new Set(['AKTIF', 'DENEME']);

/**
 * ADIM 2 gocunun actigi paketler. Musteriye "miras-pro" yazmak anlamsiz —
 * o bir goc etiketi, satin alinmis bir paket degil.
 */
const MIRAS_ONEKI = 'miras-';

export function mirasMi(paketKodu: string | null | undefined): boolean {
  return !!paketKodu && paketKodu.startsWith(MIRAS_ONEKI);
}

/**
 * Durum kodunun ekran adi (Faz 6.1 kapanis, 15.09). Hesap sayfasi rozeti
 * kodu OLDUGU GIBI basiyordu: musteri "AKTIF", "SONA_ERDI" goruyordu.
 * `Record<AbonelikDurumu, …>`: sunucuya yeni durum eklenip buraya eklenmezse
 * tip denetimi kirilir. Tanimsiz bir kod gelirse kod aynen gosterilir —
 * bos rozet "durum yok" gibi okunurdu.
 */
export const DURUM_ETIKET: Record<AbonelikDurumu, string> = {
  DENEME: 'Deneme',
  AKTIF: 'Aktif',
  ODEME_BEKLIYOR: 'Ödeme bekliyor',
  KISITLI: 'Kısıtlı',
  ASKIDA: 'Askıda',
  IPTAL: 'İptal edildi',
  SONA_ERDI: 'Sona erdi',
};

export function durumEtiketi(durum: string): string {
  if (!durum) return '';
  return (DURUM_ETIKET as Record<string, string>)[durum] ?? durum;
}

/**
 * `ErisimKarari`ni hesap sayfasi ozetine cevirir. SAF fonksiyon.
 *
 * ⚠ `karar` null olabilir (yetenekler henuz gelmedi ya da saglayici yok).
 * O durumda "abonelik yok" DEMEYIZ — bilmiyoruz demektir; yanlis bilgi
 * vermektense bos birakiriz.
 */
export function abonelikOzeti(
  karar: {
    paketKodu?: string | null;
    durum?: string | null;
    kalanGun?: number | null;
  } | null | undefined,
): AbonelikOzeti {
  if (!karar) {
    return {
      paketKodu: null,
      baslik: '—',
      durum: '',
      durumEtiketi: '',
      kalanGun: null,
      altMetin: 'Abonelik bilgisi yükleniyor',
      iptalEdilebilir: false,
    };
  }

  const paketKodu = karar.paketKodu ?? null;
  const durum = karar.durum ?? '';

  if (!paketKodu) {
    return {
      paketKodu: null,
      baslik: 'Abonelik yok',
      durum,
      durumEtiketi: durumEtiketi(durum),
      kalanGun: null,
      altMetin: 'Devam etmek için bir paket seçin',
      iptalEdilebilir: false,
    };
  }

  const kalanGun = karar.kalanGun ?? null;

  return {
    paketKodu,
    // Goc paketi musteriye teknik kodla gosterilmez.
    baslik: mirasMi(paketKodu) ? 'Geçiş paketi' : paketKodu,
    durum,
    durumEtiketi: durumEtiketi(durum),
    kalanGun,
    altMetin:
      kalanGun === null
        ? 'Yenileme tarihi belirtilmemiş'
        : `${kalanGun} gün kaldı`,
    // ⚠ Goc paketi de iptal EDILEBILIR sayilir: musteri isterse cikabilmeli.
    iptalEdilebilir: YASAYAN_DURUMLAR.has(durum),
  };
}

/**
 * ── IPTAL YOLU: EN AZ UC TIKLAMA (03.09 kullanici karari) ───────────────
 *
 * "Aboneligi iptal et secenegi minimum 3 tiklama ile gorulebilsin."
 * Gerekce ticari: iptal, musterinin gozune sokulacak bir eylem degil.
 *
 * Adimlar SAYILABILIR olsun diye burada ILAN EDILIYOR; test bu sayiyi
 * ekrandaki gercek adimlarla karsilastirir. Sadece "gizledim" demek
 * olcum degildir.
 *
 *   1. Hesabim sayfasini ac
 *   2. "Abonelik yonetimi" bolumunu ac
 *   3. "Aboneligi iptal et" bagini tikla
 *   4. Onay kutusunda dogrula   ← dorduncu emniyet
 */
export const IPTAL_ADIMLARI = [
  'hesap-sayfasi',
  'abonelik-yonetimi-ac',
  'iptal-bagini-tikla',
  'onayla',
] as const;

export const ASGARI_IPTAL_TIKLAMASI = 3;

/** Ilan edilen adim sayisi kurali sagliyor mu? SAF fonksiyon. */
export function iptalYoluYeterinceDerinMi(
  adimlar: readonly string[] = IPTAL_ADIMLARI,
): boolean {
  return adimlar.length >= ASGARI_IPTAL_TIKLAMASI;
}
