/**
 * Paket gorunum bicimleri — saf, React'siz (DOM'suz test edilebilir).
 */

export interface PaketSurumu {
  paketSurumuId: string;
  /** ⚠ STRING olarak gelir, number DEGIL — sebebi asagida. */
  tutar: string;
  paraBirimi: string;
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
