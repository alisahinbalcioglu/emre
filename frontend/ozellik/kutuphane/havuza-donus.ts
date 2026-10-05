/**
 * «HAVUZ FİYATINA DÖN» (P4b Parti 3, 05.10.2026 — C3 takibi).
 *
 * Kütüphane satırında özel fiyat havuz liste fiyatından ayrışınca (havuz
 * güncellenip yeniden aktarıldı ya da özel fiyat başka birimde) hücre SARI
 * işaretlenir; hangisinin geçerli olduğu TAHMİN EDİLMEZ (`isaret.ts`
 * `kutuphaneFiyatAyrisimi`). Aynı birimde kullanıcı geçerli fiyatı hücreye
 * yazabilir; ama o da bir ÖZEL fiyattır, sonraki havuz güncellemesinde yine
 * donar. Farklı birimde hücreye yazılan sayı özel fiyatın biriminde kalır —
 * ayrışma kapanmaz. Havuzu izlemenin tek yolu özel fiyatı SİLMEKTİR:
 * `PUT /library/:id { customPrice: null }` (sunucu birimini de siler —
 * `library.service.update`, test:p4b-kutuphane F3b). Satır bundan sonra liste
 * fiyatını kendi biriminde gösterir; iskonto DEĞİŞMEZ.
 *
 * Karar satır satır kullanıcının: liste yalnız AYRIŞAN satırları sunar, hiçbiri
 * önceden seçili değildir.
 */
import { fiyatAyrisimiOku } from '../tablo/excel-grid/isaret';

type Satir = Record<string, unknown>;

export interface HavuzaDonusAdayi {
  id: string;
  ad: string;
  /** Cins · çap · ürün kodu — aynı adlı satırları (1/2", 3/4", 1") ayırır. */
  ayrinti: string;
  /** Simgeli tutar ("₺2.400,00"). */
  ozel: string;
  havuz: string;
  birimFarkli: boolean;
}

/** Kütüphane ızgarasının yapısal kolonları (library-sheet-builder — sabit şema). */
const AYRINTI_ALANLARI = ['col_cins', 'col_cap', 'col_kod'] as const;

/** Izgaranın AYRIŞAN kayıtlı satırları — sinyal okunamıyorsa satır aday değil. */
export function havuzaDonusAdaylari(satirlar: ReadonlyArray<Satir>, nameField: string | null | undefined): HavuzaDonusAdayi[] {
  const adaylar: HavuzaDonusAdayi[] = [];
  for (const r of satirlar) {
    const id = r._libraryItemId;
    if (!r._isDataRow || typeof id !== 'string' || !id) continue;
    const a = fiyatAyrisimiOku(r);
    if (!a) continue;
    const ad = nameField ? String(r[nameField] ?? '').trim() : '';
    const ayrinti = AYRINTI_ALANLARI.map((k) => String(r[k] ?? '').trim()).filter(Boolean).join(' · ');
    adaylar.push({ id, ad: ad || 'Adsız malzeme', ayrinti, ozel: a.ozelMetni, havuz: a.havuzMetni, birimFarkli: a.birimFarkli });
  }
  return adaylar;
}

export interface HavuzaDonusSonucu {
  donen: number;
  donmeyen: number;
  /** İlk başarısız isteğin hatası (bildirimde sunucu metni gösterilir). */
  ilkHata: unknown;
}

/**
 * Seçilen satırların özel fiyatını SIRAYLA siler (tek tek istek; toplu uç yok —
 * satır sayısı ayrışanlarla sınırlı). Bir satırın hatası diğerlerini durdurmaz,
 * YUTULMAZ: sayılır ve ilk sebep döner.
 */
export async function havuzFiyatinaDondur(
  idler: ReadonlyArray<string>, ozelFiyatiSil: (id: string) => Promise<unknown>,
): Promise<HavuzaDonusSonucu> {
  const sonuc: HavuzaDonusSonucu = { donen: 0, donmeyen: 0, ilkHata: undefined };
  for (const id of idler) {
    try {
      await ozelFiyatiSil(id);
      sonuc.donen++;
    } catch (e) {
      if (sonuc.donmeyen === 0) sonuc.ilkHata = e;
      sonuc.donmeyen++;
    }
  }
  return sonuc;
}
