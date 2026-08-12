/**
 * Teklif kalemi (QuoteItem) payload üreticisi — TEK KAYNAK.
 *
 * NEDEN AYRI MODÜL: bu üretim `handleSave` içinde satır içi yazılıydı ve
 * 9 sayısal alandan 7'si `parseFloat(String(...)) || 0` ile korunurken
 * `materialMargin`/`laborMargin` KORUMASIZDI (`r._malzKar || 0`).
 * Kullanıcı Kar % hücresine elle "50" yazınca AG-Grid değeri STRING saklar
 * (kolonda cellRenderer olduğu için ag-grid sayı çıkarımını kapatır) ve
 * `"50" || 0` boş olmayan string'i aynen geçirir → backend @IsNumber()
 * reddeder → canlıda HTTP 400, üstelik hata mesajı yutulduğu için sebebi
 * görünmezdi. Sözleşme artık burada ve testli (teklif-kalem.test.ts).
 *
 * KURAL: hücre NE TUTARSA TUTSUN (string, boş, virgüllü, çöp), payload'a
 * giden her sayısal alan gerçek `number` ve >= 0 olmak zorundadır —
 * backend DTO'su @IsNumber() + @Min(0) uygular ve NaN/Infinity de reddeder.
 */
// NOT: goreli yol BILEREK — vitest.config.ts'te '@/' alias'i tanimli degil;
// alias'li importlar yalniz `import type` oldugu icin (derlemede silinir)
// bugune kadar sorun cikarmadi. Bu RUNTIME import, goreli olmali.
import { etkinMiktar } from '../fiyat/pricing';
import { sayiAlani } from '../fiyat/sayi-alani';

// Süzgeç `ozellik/fiyat/sayi-alani.ts`e TAŞINDI — ekran yolları (ExcelGrid, fill-down,
// sayfaToplamlari) da aynı fonksiyonu çağırabilsin diye. Buradan yeniden
// dışa verilir: mevcut çağıranlar ve `teklif-kalem.test.ts` bozulmasın.
export { sayiAlani };

export interface KalemRolleri {
  nameField?: string;
  diameterField?: string;
  quantityField?: string;
  unitField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
  laborUnitPriceField?: string;
  laborTotalField?: string;
}

/** Kimlik alanı süzgeci: boş/boşluk/null → undefined.
 *
 *  ⚠ BOŞ STRING GÖNDERİLMEZ: backend `brandId || null` ile null'a çevirse de
 *  DTO'nun `@IsString()`'i boş string'i geçirir ve ileride bir FK'ya bağlanırsa
 *  Prisma P2003 (foreign key) ile 500 üretir. Yok olan alan hiç gönderilmez. */
function kimlikAlani(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
}

export interface TeklifKalemi {
  materialName: string;
  unit: string;
  /** Seçilen malzeme markasının ID'si (grid `_marka` alanı ID taşır). */
  brandId?: string;
  /** Seçilen işçilik firmasının ID'si (grid `_firma` alanı ID taşır —
   *  ExcelGrid'de alan adı "marka" desenini taşısa da değer FİRMA'dır). */
  laborFirmaId?: string;
  quantity: number;
  unitPrice: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  /** Rol tanımlı değilse `undefined` — backend kendi kuralıyla türetir. */
  materialTotalPrice?: number;
  laborTotalPrice?: number;
  materialMargin: number;
  laborMargin: number;
  [k: string]: any;
}

/**
 * Bir grid satırından teklif kalemi üretir. Adı boş satır için `null` döner.
 *
 * Ad = "Çap + Cins" birleşimi (örn "Ø110 PVC BORU") — cins tek başına fiyat
 * listesinde bulunamıyor, eşleştirme tam metni istiyor.
 */
export function kalemUret(
  r: Record<string, any>,
  roles: KalemRolleri,
): TeklifKalemi | null {
  const baseName = roles.nameField ? String(r[roles.nameField] ?? '').trim() : '';
  const diaVal = roles.diameterField ? String(r[roles.diameterField] ?? '').trim() : '';
  const materialName = [diaVal, baseName].filter(Boolean).join(' ');
  if (!materialName) return null;

  const matBirim = roles.materialUnitPriceField ? sayiAlani(r[roles.materialUnitPriceField]) : 0;

  return {
    materialName,
    unit: roles.unitField ? String(r[roles.unitField] ?? '').trim() || 'Adet' : 'Adet',
    // ⚠ İLİŞKİSEL ALANLAR — bu ikisi multiSheet dalında HİÇ GÖNDERİLMİYORDU:
    // ekranda marka/firma seçili olmasına rağmen QuoteItem.brandId NULL
    // kaydediliyor, işçilik firması ise hiçbir yere yazılmıyordu. Bilgi yalnız
    // sheets.rowData JSON'unda kalıyor, ilişkisel alanda değil → markaya göre
    // sorgu/rapor imkânsızdı. (Legacy `items` yolunda brandId vardı; çok-sayfa
    // ikizinde unutulmuştu.)
    brandId: kimlikAlani(r._marka),
    laborFirmaId: kimlikAlani(r._firma),
    // UY2: DB'ye yazılan miktar da ekranın gördüğü miktardır (ters başlıklı
    // tekliflerde düz parse DB'ye 0 yazıyordu).
    quantity: sayiAlani(etkinMiktar(r, roles.quantityField, roles.unitField)),
    unitPrice: matBirim,
    materialUnitPrice: matBirim,
    laborUnitPrice: roles.laborUnitPriceField ? sayiAlani(r[roles.laborUnitPriceField]) : 0,
    // KL P1-b (kalem 64): EKRANDAKI toplam da gönderilir — backend onu yeniden
    // türetmesin. Birim fiyat alanları zaten SATIŞ fiyatıdır (kâr uygulanmış).
    materialTotalPrice: roles.materialTotalField ? sayiAlani(r[roles.materialTotalField]) : undefined,
    laborTotalPrice: roles.laborTotalField ? sayiAlani(r[roles.laborTotalField]) : undefined,
    // ⚠ BURASI 400'ÜN KÖKÜYDÜ: eskiden `r._malzKar || 0` idi (süzgeçsiz).
    materialMargin: sayiAlani(r._malzKar),
    laborMargin: sayiAlani(r._iscKar),
  };
}
