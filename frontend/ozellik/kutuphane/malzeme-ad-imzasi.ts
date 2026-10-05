/**
 * MALZEME KÜTÜPHANESİ — AD YALNIZ DEĞİŞTİYSE GİDER (P4b Parti 3, 05.10.2026).
 * İşçilik ikizi: `iscilik-ad-imzasi.ts` (01.10).
 *
 * Marka sayfasının kaydı (`save-sheets`) `materialName`i kirli HER satırda
 * gönderiyordu — yalnız fiyatı ya da iskontosu değişse de. Sunucu adı
 * GÖSTERİLEN adla karşılaştırır (C7, P4b 2a), ama ekran yüklendikten sonra ad
 * başka yerde düzeltilmişse (ekip arkadaşı, başka sekme) bu ESKİ ızgaranın
 * gönderdiği ad yeni bir "düzeltme" sayılır ve sonrakini EZERDİ — kullanıcı
 * yalnız iskontoyu değiştirmişken. Ad artık yalnız ad hücresi yüklendiği
 * hâlden farklıysa gönderilir.
 *
 * Anahtar `_libraryItemId` (satır sırası düzenlemede değişebilir, kimlik değişmez).
 */

type Satir = Record<string, unknown>;

const adi = (satir: Satir, nameField: string | null | undefined): string =>
  nameField ? String(satir[nameField] ?? '').trim() : '';

/** Yüklenen satırların ad hücreleri: `_libraryItemId` → kırpılmış ad. */
export function malzemeAdlari(satirlar: ReadonlyArray<Satir>, nameField: string | null | undefined): Map<string, string> {
  const adlar = new Map<string, string>();
  for (const r of satirlar) {
    const id = r._libraryItemId;
    if (typeof id === 'string' && id) adlar.set(id, adi(r, nameField));
  }
  return adlar;
}

/**
 * Kayıt yüküne giden ad: hücre yüklendiği hâlden farklıysa yeni ad, değilse
 * `undefined` (ad gönderilmez). Boş hücre gönderilmez (sunucu da yazmaz).
 * Yüklemede adı olmayan satır için hücredeki ad gider: kullanıcının yazdığı
 * ad sessizce düşmesin (eski davranış).
 */
export function degisenMalzemeAdi(
  satir: Satir, nameField: string | null | undefined, ilk: ReadonlyMap<string, string>,
): string | undefined {
  const ad = adi(satir, nameField);
  if (ad === '') return undefined;
  const id = satir._libraryItemId;
  const yuklenen = typeof id === 'string' ? ilk.get(id) : undefined;
  return yuklenen === ad ? undefined : ad;
}
