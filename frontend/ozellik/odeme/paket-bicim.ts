/**
 * Paket gorunum bicimleri — saf, React'siz (DOM'suz test edilebilir).
 */

export interface PaketSurumu {
  paketSurumuId: string;
  /**
   * SOZLESME TUTARI — karttan cekilen, faturaya yazilan tutar (TL, KDV dahil).
   * ⚠ STRING olarak gelir, number DEGIL — sebebi asagida.
   */
  tutar: string;
  paraBirimi: string;
  /**
   * VITRIN (capa) — musteriye buyuk puntoyla gosterilen dolar tutari.
   *
   * ⚠ BU BIR FIYAT DEGIL, BIR ETIKETTIR. Hicbir tahsilat, fatura ya da
   * erisim karari bunu okumaz; sozlesme tutari daima `tutar`dir (TL).
   * Ayrim kasitli: doviz cinsinden BEDEL BELIRLEMEK ile doviz cinsinden
   * FIYAT GOSTERMEK ayri seylerdir.
   *
   * null olabilir (eski surumler, havale paketleri) — o durumda ekran
   * yalnizca TL gosterir.
   */
  referansTutar: string | null;
  referansParaBirimi: string | null;
  periyot: string;
  periyotAdedi: number;
  denemeGunu: number;
}

export interface Paket {
  paketId: string;
  kod: string;
  ad: string;
  aciklama: string | null;
  kapsam: 'mechanical' | 'electrical' | 'mep' | string;
  seviye: 'core' | 'pro' | string;
  kullaniciHakki: number;
  aylikTeklifHakki: number | null;
  dwgAktif: boolean;
  surum: PaketSurumu;
}

export const KAPSAM_ETIKET: Record<string, string> = {
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
  mep: 'Mekanik + Elektrik',
};

export const SEVIYE_ETIKET: Record<string, string> = {
  core: 'Core — malzeme',
  pro: 'Pro — malzeme + iscilik + DWG',
};

/**
 * Para bicimleme.
 *
 * ⚠ TUTAR SUNUCUDAN STRING GELIR (`Decimal.toFixed(2)`), number DEGIL.
 * Bu bilincli: Prisma `Decimal` degerini JSON'a cevirirken float'a dusurmek
 * kurus kaybina yol acar ve bu depoda para hatalarinin bilinen bir kaynagi
 * (P2 turu, "para 2 ondalik" dersi). Burada da `Number()` ile geri
 * dondurulmez; ondalik ayraci degistirilerek METIN olarak bicimlenir.
 */
export function tutarYaz(tutar: string, paraBirimi: string): string {
  const sembol = paraBirimi === 'TRY' ? '₺' : paraBirimi === 'USD' ? '$' : paraBirimi === 'EUR' ? '€' : '';
  const [tam, kesir = '00'] = String(tutar).split('.');
  // Binlik ayraci — TR bicimi: 12.345,67
  const binlikli = tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sembol}${binlikli},${kesir.padEnd(2, '0').slice(0, 2)}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VITRIN — musteriye ne gosterilecek
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kullanici karari (29.08): fiyat DOLAR olarak sunulur, tahsilat TL yapilir.
 *  Ticari gerekce: "$24" kucuk bir tutar gibi durur, "1.250 TL" buyuk bir
 *  para gibi. Ayvaz'in euro fiyat listesi + TL fatura kesmesiyle ayni kalip.
 *
 *  ⚠ SOZLESME TUTARI DAIMA TL'DIR. Dolar yalnizca capadir; bu fonksiyon
 *  ikisini AYRI dondurur ki ekran hangisinin baglayici oldugunu saklamasin.
 *  "≈" isareti ve "olarak tahsil edilir" ifadesi bilincli: musteri neyin
 *  cekilecegini net gormeli, sonradan surpriz olmamali.
 *
 *  Capa YOKSA (null) yalnizca TL doner — uydurma dolar URETILMEZ.
 */
export interface VitrinFiyati {
  /** Buyuk puntoyla gosterilecek — capa varsa dolar, yoksa TL. */
  ana: string;
  /** Altinda kucuk punto — capa varsa TL aciklamasi, yoksa null. */
  alt: string | null;
}

export function vitrinFiyati(s: PaketSurumu): VitrinFiyati {
  const sozlesme = tutarYaz(s.tutar, s.paraBirimi);

  if (!s.referansTutar || !s.referansParaBirimi) {
    // Capa yok → yalniz sozlesme tutari. Dolar UYDURULMAZ.
    return { ana: sozlesme, alt: null };
  }

  return {
    ana: tutarYaz(s.referansTutar, s.referansParaBirimi),
    alt: `≈ ${sozlesme} olarak tahsil edilir (KDV dahil)`,
  };
}
