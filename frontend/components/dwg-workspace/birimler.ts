/**
 * Cizim birimi secenekleri (saf). Birim penceresi, baslik dugmesi ve
 * bildirimler ayni tablodan okur.
 *
 * Tasarim dort birim gosteriyor (mm/cm/dm/m); motor inc ve fit de uretebiliyor
 * ve gercek projede dogru cevap tablo DISINDA kalabiliyordu ("dm" eskiden
 * listede yoktu, duzeltmek imkansizdi — DwgUploader notu). Alti birim kalir.
 */

export interface BirimSecenegi {
  scale: number;
  /** Dugmedeki kisa ad. */
  kisa: string;
  /** Cumle icindeki ad: "desimetre (dm)". */
  ad: string;
  /** "1 çizim birimi = 10 cm" cumlesinin sag tarafi. */
  karsilik: string;
}

export const BIRIMLER: readonly BirimSecenegi[] = [
  { scale: 0.001, kisa: 'mm', ad: 'milimetre', karsilik: '1 mm' },
  { scale: 0.01, kisa: 'cm', ad: 'santimetre', karsilik: '1 cm' },
  { scale: 0.1, kisa: 'dm', ad: 'desimetre', karsilik: '10 cm' },
  { scale: 1, kisa: 'm', ad: 'metre', karsilik: '1 m' },
  { scale: 0.0254, kisa: 'inç', ad: 'inç', karsilik: '2,54 cm' },
  { scale: 0.3048, kisa: 'fit', ad: 'fit', karsilik: '30,48 cm' },
];

/** Metre carpanina karsilik gelen secenek (goreli tolerans); yoksa null. */
export function birimBul(scale: number): BirimSecenegi | null {
  return BIRIMLER.find((b) => Math.abs(scale - b.scale) / b.scale < 1e-6) ?? null;
}

/** Dugme metni: "dm" — tabloda yoksa carpan ("×0.5"). */
export function birimKisa(scale: number): string {
  return birimBul(scale)?.kisa ?? `×${scale}`;
}

/** Otomatik tespitin guven etiketi → pencerede alt satir. */
export function guvenAciklamasi(guven: string): string {
  switch (guven) {
    case 'kesin':
      return 'İki bağımsız kontrol aynı sonucu verdi.';
    case 'yuksek':
      return 'Bir kontrol doğruladı.';
    case 'orta':
      return 'Yalnız dosya başlığına dayanıyor — doğrulayın.';
    default:
      return 'Kanıt zayıf — birimi doğrulayın.';
  }
}

/** Guvenilir tespit mi (yesil dugme / yesil kutu)? */
export function guvenilirMi(guven: string | null | undefined): boolean {
  return guven === 'kesin' || guven === 'yuksek';
}

/** Birim penceresinin ayirma notu. Ayirma surmuyorsa YOK. Secili birim
 *  degismediyse (ayni birimle Kaydet = yalniz dogrulama, hicbir sey durmaz)
 *  "durdurulur" DENMEZ — 25.09 inceleme: not bu durumda da soyluyordu. */
export function ayirmaNotu(ayirmaSuruyor: boolean, birimDegisti: boolean): string | null {
  if (!ayirmaSuruyor) return null;
  return birimDegisti
    ? 'Şu an parçalara ayırma sürüyor. Kaydederseniz durdurulur ve yeni birimle yeniden başlar.'
    : 'Şu an parçalara ayırma sürüyor. Başka bir birim seçip kaydederseniz yeni birimle yeniden başlar.';
}
