/**
 * EKİP LİSTESİ — KİŞİ HÜCRESİ metni (saf).
 *
 * ⚠ NEDEN VAR (21.09.2026'da ölçüldü): ekip tablosunun kişi hücresi
 * `gorunenAd(u)` + `{u.eposta}` olmak üzere İKİ parça basıyordu ve
 * `gorunenAd` ad boşken E-POSTAYA DÜŞÜYORDU. Sonuç, ekibe davet edilen ilk
 * kişinin gördüğü satır:
 *
 *     emre.basarann1@gmail.comemre.basarann1@gmail.com
 *
 * Kusur "metin" değil KARAR kusuruydu: iki bağımsız yer (yedek ad kuralı ve
 * ikinci satır) birbirinden habersiz aynı değeri yazıyordu. `koltuk-metinleri.ts`
 * deseni: karar TEK saf fonksiyonda, ekran yalnız çizer.
 *
 * ⚠ Bu dosya KARAR VERMEZ (yetki/koltuk/izin) — yalnız METİN kurar.
 */

/** Kişi hücresinin iki satırı. */
export interface UyeSatirMetni {
  /** Üst satır: ad varsa ad, yoksa e-posta. HER ZAMAN doludur (boş hücre olmaz). */
  baslik: string;
  /**
   * Alt satır: yalnız üst satırdan FARKLI olduğunda e-posta; aynı değeri ikinci
   * kez yazmamak için aynıysa `null`. Ekran `null` gelince span'i ÇİZMEZ.
   */
  altSatir: string | null;
}

/**
 * E-posta karşılaştırması için YALNIZ ASCII A-Z küçültme.
 *
 * ⚠ Kural sunucudan birebir alındı (`backend/src/altyapi/auth/eposta.ts`,
 * `epostaKucult`) ve burada TESTLE ölçüldü: `toLocaleLowerCase('tr')` "I"yı
 * "ı" yapar (GMAIL → gmaıl, yani başka bir adres), yerel ayarsız
 * `toLowerCase()` ise "İ"yi iki karaktere böler. Adres ASCII kurallıdır;
 * Türkçe küçültme burada YANLIŞ sonuç verir.
 */
const ASCII_BUYUK = /[A-Z]/g;
const epostaKucult = (s: string) => s.replace(ASCII_BUYUK, (h) => h.toLowerCase());

/** Ad + soyad birleşimi; boşluk-yalnızca parçalar atılır. */
function tamAd(ad?: string | null, soyad?: string | null): string {
  return [ad, soyad]
    .map((p) => (p ?? '').trim())
    .filter((p) => p !== '')
    .join(' ');
}

/**
 * Kişi hücresinin metni. Dört hâl de burada karara bağlanır:
 *   · ad var            → üstte ad, altta e-posta
 *   · ad boş / null     → yalnız e-posta (BİR kez)
 *   · ad boşluk karakteri → yalnız e-posta (BİR kez)  ← `.trim()` şart
 *   · ad e-postaya eşit → yalnız e-posta (BİR kez)    ← kayıt e-postayı ada yazmışsa
 *
 * ⚠ Karşılaştırma ASCII küçültmeyle yapılır (yukarıdaki not): e-posta adresi
 * Türkçe locale ile küçültülürse "GMAIL" → "gmaıl" olur ve eşitlik KAÇAR.
 */
export function uyeSatirMetni(u: {
  ad?: string | null;
  soyad?: string | null;
  eposta?: string | null;
}): UyeSatirMetni {
  const eposta = (u.eposta ?? '').trim();
  const ad = tamAd(u.ad, u.soyad);

  // E-posta yoksa alt satır diye boş bir span çizilmesin.
  if (eposta === '') return { baslik: ad, altSatir: null };

  const adEpostayaEsit = epostaKucult(ad) === epostaKucult(eposta);

  return ad !== '' && !adEpostayaEsit
    ? { baslik: ad, altSatir: eposta }
    : { baslik: eposta, altSatir: null };
}
