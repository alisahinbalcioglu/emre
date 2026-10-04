/**
 * İŞÇİLİK SATIRI AD İMZASI (inceleme 2. tur, 01.10.2026).
 *
 * Kaydette `laborItemName` YALNIZ satırın ad hücreleri (ad · cins · çap · ad
 * sütunu) yüklendiği hâlden farklıysa gönderilir. Eskiden kirli HER satırda
 * (yalnız fiyatı değişse de) ad hücrelerinin birleşimi gidiyordu; birleşim
 * kayıtlı addan farklı yazılmışsa (boşluk, büyük/küçük harf, içe aktarımda
 * bölünmüş ad) sunucu bunu ad değişikliği sayıp satırı başka kaleme
 * taşıyordu — kullanıcı yalnız fiyatı düzeltmişken.
 *
 * Anahtar `_laborPriceId`: satır sırası/numarası düzenlemede değişebilir,
 * fiyat satırının kimliği değişmez.
 */

type Satir = Record<string, unknown>;

/** Satırın ad hücrelerinin imzası (kırpılmış ad · cins · çap · ad sütunu). */
export function adImzasi(satir: Satir, nameField?: string | null): string {
  return JSON.stringify(
    [satir.ad, satir.cins, satir.cap, nameField ? satir[nameField] : ''].map((x) => String(x ?? '').trim()),
  );
}

/** Yüklenen satırların imzaları: `_laborPriceId` → imzalar (aynı kimlik iki satırda geçebilir). */
export function adImzalari(satirlar: ReadonlyArray<Satir>, nameField?: string | null): Map<string, Set<string>> {
  const imzalar = new Map<string, Set<string>>();
  for (const r of satirlar) {
    const id = r._laborPriceId;
    if (typeof id !== 'string' || !id) continue;
    imzalar.set(id, new Set(Array.from(imzalar.get(id) ?? [])).add(adImzasi(r, nameField)));
  }
  return imzalar;
}

/**
 * Ad hücreleri yüklendiği hâlden farklı mı? Yüklemede imzası olmayan satır
 * için EVET: kullanıcının yazdığı ad sessizce düşmesin (eski davranış).
 */
export function adDegistiMi(satir: Satir, nameField: string | null | undefined, ilk: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const id = satir._laborPriceId;
  const imzalar = typeof id === 'string' ? ilk.get(id) : undefined;
  if (!imzalar) return true;
  return !imzalar.has(adImzasi(satir, nameField));
}
