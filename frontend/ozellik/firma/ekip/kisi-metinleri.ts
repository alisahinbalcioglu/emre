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

/**
 * 23.09.2026 — AVATAR BAŞ HARFLERİ (Ekip & İzinler tasarımı: "MM", "AT").
 *
 * Ad varsa ad + soyadın ilk harfleri; yoksa e-postanın `@` öncesi `.`, `_`,
 * `-`, `+` ile bölünür ("mehmet.muhendis" → "MM"). Yönetici avatarı tasarımda
 * TEK harftir ("E") — kenar çubuğundaki kendi avatarınla aynı; `enFazla = 1`.
 *
 * ⚠ Büyütme `tr-TR` ile: "ilker" → "İ". Karşılaştırma değil gösterim olduğu
 * için burada Türkçe kural doğrudur (yukarıdaki ASCII notu KARŞILAŞTIRMA içindir).
 * Harf yoksa (ör. "123@x.com" değil, boş girdi) "?" döner — boş daire çizilmez.
 */
export function basHarfler(
  u: { ad?: string | null; soyad?: string | null; eposta?: string | null },
  enFazla = 2,
): string {
  const ad = tamAd(u.ad, u.soyad);
  const parcalar = ad !== ''
    ? ad.split(/\s+/)
    : (u.eposta ?? '').trim().split('@')[0].split(/[._\-+]+/);
  const harfler = parcalar.map((p) => p.charAt(0)).filter(harfVeyaRakamMi);
  return harfler.slice(0, enFazla).join('').toLocaleUpperCase('tr-TR') || '?';
}

/**
 * 23.09.2026 — Firmanın yöneticileri, listedeki sırayla (birden çok olabilir).
 * Üyenin gördüğü iki ekranın yönetici SEÇİMİ burada: Hesabım › Ekip erişimim
 * hepsini çizer, `yoneticiEpostasi` (kapalı bölüm sayfası, kilitli kart) ilkini
 * alır. İki ekran süzgeci ayrı yazıyordu; biri değişseydi üye iki ekranda iki
 * farklı "yönetici" görürdü. (Ekip sayfasının satır başına "bu satır yönetici
 * mi" sınamaları — `UyeListesi`, `UyeIzinPaneli` — bu seçimin kapsamı dışında.)
 * Liste gelmediyse boş dizi.
 */
export function firmaYoneticileri<T extends { firmaRol: string }>(
  uyeler: readonly T[] | null | undefined,
): T[] {
  return (uyeler ?? []).filter((u) => u.firmaRol === 'sahip');
}

/**
 * 23.09.2026 — Üyenin "Firma yöneticin" adresi: listedeki İLK yönetici.
 * Sunucu listeyi önce yöneticiler olacak şekilde dizer; yine de sıraya
 * GÜVENİLMEZ, rol açıkça aranır (ilk satır her zaman yönetici olmayabilir).
 * Yönetici yoksa ya da liste gelmediyse `null`.
 */
export function yoneticiEpostasi(
  uyeler: readonly { eposta: string; firmaRol: string }[] | null | undefined,
): string | null {
  return firmaYoneticileri(uyeler)[0]?.eposta ?? null;
}

/**
 * Harf ya da rakam mı? ⚠ `/\p{L}/u` KULLANILMADI: tsconfig hedefi ES5 ve `u`
 * bayrağı derlenmiyor (TS1501). Büyük/küçük hâli farklı olan karakter
 * harftir (Latin + Türkçe: ç ğ ı İ ö ş ü); sembol ve boşluk elenir.
 */
function harfVeyaRakamMi(h: string): boolean {
  return /[0-9]/.test(h) || h.toLocaleLowerCase('tr-TR') !== h.toLocaleUpperCase('tr-TR');
}
