/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DWG KAPISI — "Pro'da aktif, Core'da sonuk"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (02.09'da olculdu)
 *
 *  ADIM 2, DWG uclarina `@GerekliYetenek(Yetenek.DWG_YUKLE)` koydu — ONCESINDE
 *  o uclar korumasizdi. Sunucu tarafi dogru calisiyor: `Paket.dwgAktif`
 *  false ise 403 doner (`basic-mek`/`basic-elk`/`miras-core` → false,
 *  `pro-*` → true).
 *
 *  Ama ON YUZ bunu HIC OKUMUYORDU. `CapabilitiesContext` icinde `hasAnyDwg`
 *  TANIMLI, sadece profil sayfasindaki rozette gosteriliyor; DWG yukleme
 *  girisleri (dashboard kutusu, /dwg-workspace) yetenege BAKMIYORDU.
 *
 *  Sonuc en kotu hali: kutu acik gorunuyor, kullanici dosyayi surukluyor,
 *  403 yiyor. Ne calisiyor ne de NEDEN calismadigi soyleniyor.
 *
 *  Kullanici karari (02.09): "dwg pro modelde aktif olacak, core modelde
 *  sonuk kalacak." Yani GIZLEME degil SONUKLESTIRME — ozelligin varligi
 *  gorunur kalsin, erisilemedigi de belli olsun.
 *
 *  ── NEDEN UC DURUM (ikisi degil) ────────────────────────────────────────
 *  `loading` ayri bir durum olmak ZORUNDA. Yetenekler `/auth/me`'den
 *  geliyor ve ilk render'da HENUZ YOK; iki durumlu bir kapi o anda
 *  "yetenek yok" okur ve kutu bir an "Pro paket gerekli" YAZIP sonra
 *  acilir — Pro musteriye yalan soyleyen bir titreme. `yukleniyor`
 *  durumu tiklamayi kapatir ama SUCLAYICI ETIKETI GOSTERMEZ.
 */

export type DwgKapiDurumu =
  /** Yetenekler daha gelmedi: tiklama kapali, etiket YOK (yaniltmasin). */
  | 'yukleniyor'
  /** Pro: tam islevsel. */
  | 'acik'
  /** Core: gorunur ama sonuk + "Pro paket gerekli". */
  | 'sonuk';

export interface DwgKapiGirdisi {
  /** `useCapabilities().loading` */
  loading: boolean;
  /** `useCapabilities().hasAnyDwg()` — iki disiplinden biri bile yeterli. */
  dwgVar: boolean;
}

/**
 * DWG giris noktalarinin gorunumunu belirler. SAF fonksiyon.
 *
 * ⚠ `loading` ONCE bakilir. Sirasi degisirse yukleme aninda `dwgVar`
 * (henuz false) okunur ve Pro musteri bir an "Pro paket gerekli" gorur.
 */
export function dwgKapisi({ loading, dwgVar }: DwgKapiGirdisi): DwgKapiDurumu {
  if (loading) return 'yukleniyor';
  return dwgVar ? 'acik' : 'sonuk';
}

/** Kutu tiklanabilir mi? Yalniz `acik` durumunda. */
export function dwgTiklanabilir(durum: DwgKapiDurumu): boolean {
  return durum === 'acik';
}

/**
 * Rozet metni. `acik` → "PRO" (ozelligin hangi pakete ait oldugunu soyler),
 * `sonuk` → "Pro paket gerekli" (NEDEN kapali oldugunu soyler),
 * `yukleniyor` → null (hicbir sey iddia etme).
 */
export function dwgRozetMetni(durum: DwgKapiDurumu): string | null {
  if (durum === 'acik') return 'PRO';
  if (durum === 'sonuk') return 'Pro paket gerekli';
  return null;
}

/** Fare uzerine gelince cikan aciklama. `acik`ta yok. */
export function dwgIpucu(durum: DwgKapiDurumu): string | undefined {
  if (durum !== 'sonuk') return undefined;
  return 'DWG metraj Pro pakete dahildir. Yukseltmek icin Abonelik sayfasina gidin.';
}
