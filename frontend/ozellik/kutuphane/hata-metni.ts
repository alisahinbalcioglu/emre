/**
 * K1 — SUNUCU HATA METNI (karar fonksiyonu)
 *
 * NEDEN AYRI DOSYA: bu karar bugun `app/admin/brands/page.tsx:229`'da
 * (`e?.response?.data?.message ?? '...'`) tek satirlik bir ifade olarak
 * yasiyor ve JSX icine gomulu oldugu icin test edilemiyor (jsdom KURULU
 * DEGIL, vitest ortami `node`). `lib/silme-onay-metni.ts` ve
 * `lib/indeks-sagligi.ts` ile ayni desen — refactor degil, test edilebilirlik
 * icin en kucuk ayirma.
 *
 * ── ★ NEDEN ONEMLI: SESSIZ BASARISIZLIK ────────────────────────────────────
 * Backend `brands.service.ts:202` ekonomi (iskonto/ozel fiyat) tasiyan
 * kutuphane satirlari varken onaysiz marka silmeyi 409 ile durdurur. O 409'un
 * govdesinde kullanicinin gormesi gereken HER SEY vardir: kac satir, kac
 * kullanici, kac iskonto ve nasil onaylanacagi. `catch { ... 'Hata olustu.' }`
 * yazan bir sayfa bu metni hicbir yere ulastirmaz — silme dogru sekilde durur
 * ama kullanici sebebi de cikis yolunu da goremez.
 *
 * KURALLAR (hepsi `ozellik/kutuphane/hata-metni.test.ts`'te AYRI AYRI sinanir):
 *  1. Sunucu bir metin yazdiysa AYNEN gosterilir — ozetlenmez, kirpilmaz.
 *  2. Nest ValidationPipe mesaji DIZI doner; " · " ile birlestirilir
 *     (birlestirilmezse ekrana "[object Object]" duser).
 *  3. Bos/boslukla dolu mesaj mesaj SAYILMAZ — bos toast gostermek, hatayi
 *     yutmakla ayni sey.
 *  4. Mesaj yoksa (ag koptu, proxy HTML dondu, alan baska tipte) varsayilan
 *     metin kullanilir; ASLA sayi ya da sebep UYDURULMAZ.
 */

/** Sunucudan gelen mesaji metne cevirir; mesaj yoksa `null`. */
function sunucuMesaji(hata: unknown): string | null {
  const ham = (hata as any)?.response?.data?.message;

  if (Array.isArray(ham)) {
    const parcalar = ham
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return parcalar.length > 0 ? parcalar.join(' · ') : null;
  }

  if (typeof ham === 'string') {
    const kirpilmis = ham.trim();
    return kirpilmis.length > 0 ? kirpilmis : null;
  }

  // Sayi, nesne, undefined… — metin gibi davranmayan hicbir seye guvenme.
  return null;
}

/**
 * Kullaniciya gosterilecek hata aciklamasini uretir.
 *
 * @param hata      axios/fetch hatasi (tip bilincli olarak `unknown`)
 * @param varsayilan sunucu bir sey soylemediyse gosterilecek metin
 */
export function hataMetni(hata: unknown, varsayilan: string): string {
  return sunucuMesaji(hata) ?? varsayilan;
}
