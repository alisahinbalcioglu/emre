/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ERISIM DURUMU — on yuz tarafi (saf mantik, React YOK)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Sunucudaki `ErisimServisi` kararinin on yuzdeki karsiligi. Karar SUNUCUDA
 *  verilir; burasi yalnizca o karari EKRANA cevirir.
 *
 *  ⚠ BU DOSYA KAPI DEGILDIR. On yuzde butonu gizlemek KAPATMAK DEGILDIR:
 *  uclar dogrudan cagrilabilir. Gercek kapi `ErisimGuard`tadir (backend).
 *  Buradaki mantik yalnizca KULLANICIYA NEDEN oldugunu anlatmak ve bosuna
 *  tiklatmamak icindir.
 *
 *  React'ten AYRI tutuldu ki DOM olmadan test edilebilsin — kisitli modun
 *  hangi durumda neyi kapattigi, bilesen render etmeden olculur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AbonelikDurumu =
  | 'DENEME'
  | 'AKTIF'
  | 'ODEME_BEKLIYOR'
  | 'KISITLI'
  | 'ASKIDA'
  | 'IPTAL'
  | 'SONA_ERDI';

export interface ErisimUyarisi {
  seviye: 'bilgi' | 'uyari' | 'kritik';
  baslik: string;
  metin: string;
  eylem?: { etiket: string; yol: string };
}

/** Sunucudan (`GET /auth/me` → `erisim`) gelen karar nesnesi. */
export interface ErisimKarari {
  erisimVar: boolean;
  saltOkunur: boolean;
  durum: AbonelikDurumu;
  uyari: ErisimUyarisi | null;
  kalanGun: number | null;
  paketKodu: string;
  kullaniciHakki: number;
  dwgAktif: boolean;
}

/** Urun icindeki yetenekler — backend'deki `Yetenek` enum'unun aynisi. */
export enum Yetenek {
  TEKLIF_GORUNTULE = 'teklif.goruntule',
  TEKLIF_OLUSTUR = 'teklif.olustur',
  TEKLIF_DUZENLE = 'teklif.duzenle',
  EXCEL_YUKLE = 'excel.yukle',
  DWG_YUKLE = 'dwg.yukle',
  CIKTI_INDIR = 'cikti.indir',
  KUTUPHANE_GORUNTULE = 'kutuphane.goruntule',
  KUTUPHANE_DUZENLE = 'kutuphane.duzenle',
  KULLANICI_DAVET = 'kullanici.davet',
  ABONELIK_YONET = 'abonelik.yonet',
}

/**
 * Salt-okunur modda ACIK kalanlar.
 * ⚠ Backend'deki `KISITLI_MODDA_ACIK` ile BIREBIR AYNI olmali; ayrisirsa
 * kullanici acik gorunen bir dugmeye basip 403 yer. Test bu esligi olcer.
 */
const KISITLI_MODDA_ACIK: ReadonlySet<Yetenek> = new Set([
  Yetenek.TEKLIF_GORUNTULE,
  Yetenek.KUTUPHANE_GORUNTULE,
  Yetenek.ABONELIK_YONET,
]);

const ASKIDA_ACIK: ReadonlySet<Yetenek> = new Set([Yetenek.ABONELIK_YONET]);

/**
 * Bir yetenegin su an acik olup olmadigini soyler.
 *
 * ⚠ KILITLENME YASAGI: `ABONELIK_YONET` HER durumda acik doner. Kapanirsa
 * askidaki firma odeme sayfasina giremez, odeyemez ve askidan CIKAMAZ.
 */
export function yetenekAcikMi(
  karar: ErisimKarari | null,
  yetenek: Yetenek,
): boolean {
  if (yetenek === Yetenek.ABONELIK_YONET) return true;
  // Karar HENUZ YUKLENMEDIYSE kapatma: /auth/me donmeden once her seyi
  // kilitlemek, sayfa her acilisinda bir anlik "erisiminiz yok" yanip
  // sonmesi demektir. Sunucu zaten gercek kapidir.
  if (!karar) return true;
  if (!karar.erisimVar) return ASKIDA_ACIK.has(yetenek);
  if (karar.saltOkunur) return KISITLI_MODDA_ACIK.has(yetenek);
  if (yetenek === Yetenek.DWG_YUKLE && !karar.dwgAktif) return false;
  return true;
}

/** Serit gosterilmeli mi? (uyari yoksa gosterilmez) */
export function seritGosterilsinMi(karar: ErisimKarari | null): boolean {
  return !!karar?.uyari;
}

/** Serit rengi/vurgusu — seviyeden turetilir. */
export function seritSinifi(seviye: ErisimUyarisi['seviye']): string {
  switch (seviye) {
    case 'kritik':
      return 'border-red-200 bg-red-50 text-red-900';
    case 'uyari':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-900';
  }
}
