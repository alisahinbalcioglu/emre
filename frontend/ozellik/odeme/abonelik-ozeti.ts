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

export interface AbonelikOzeti {
  /** Paket kodu (orn. "pro-mek"); abonelik yoksa null. */
  paketKodu: string | null;
  /** Ekranda gosterilecek paket adi. */
  baslik: string;
  /** Durum rozeti metni (AKTIF · DENEME · ASKIDA · ...). */
  durum: string;
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
      kalanGun: null,
      altMetin: 'Abonelik bilgisi yukleniyor',
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
      kalanGun: null,
      altMetin: 'Devam etmek icin bir paket secin',
      iptalEdilebilir: false,
    };
  }

  const kalanGun = karar.kalanGun ?? null;

  return {
    paketKodu,
    // Goc paketi musteriye teknik kodla gosterilmez.
    baslik: mirasMi(paketKodu) ? 'Gecis paketi' : paketKodu,
    durum,
    kalanGun,
    altMetin:
      kalanGun === null
        ? 'Yenileme tarihi belirtilmemis'
        : `${kalanGun} gun kaldi`,
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
