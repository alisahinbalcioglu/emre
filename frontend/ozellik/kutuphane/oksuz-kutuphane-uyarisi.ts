/**
 * K2 — OKSUZ KALAN KUTUPHANE SATIRI UYARISI (karar fonksiyonu)
 *
 * Backend kaynagi: `backend/src/ozellik/kutuphane/admin/admin.service.ts`
 *   `saveBulkMaterials` → `oksuzKutuphaneSatiri: { satir, iskontolu } | null`
 *
 * NE OLUYOR (KALEM 59, olculdu — CAYIROVA vakasi): kullanici bir fiyat
 * listesini yukluyor, kalemleri kutuphanesine aktariyor, bir kismina ISKONTO
 * giriyor; sonra AYNI listeyi yeniden yukluyor. Y7 geregi eski MaterialPrice
 * satirlari siliniyor ve LEGACY (materialId tabanli) kutuphane satirlari
 * silinmis kayitlara isaret etmeye devam ediyor — oksuz kaliyor.
 *
 * ⚠ INDEKSLI satirlar bagisik (`productIndexId` rowKey ile korunur); kayip
 * yalniz legacy satirlarda olusur.
 *
 * ★ NEDEN ONARIM DEGIL UYARI: backend geriye donuk baglamayi BILEREK yapmiyor
 * — guvenli anahtar yok ve yanlis eslesme kullanicinin iskontosunu YANLIS
 * urune yazar (mukerrer satirdan beter). Yapilabilecek tek dogru sey kaybi
 * GORUNUR kilmak. Bu fonksiyon o gorunurlugu uretir; onarim VAAT ETMEZ.
 *
 * KURALLAR (hepsi `ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts`'te AYRI AYRI sinanir):
 *  1. Sayim yoksa / 0 ise uyari YOK — `lib/indeks-sagligi.ts` ile ayni kural:
 *     sifirdan rozet dogmaz, bos korku uretmek yanlis rakam kadar zararli.
 *  2. Iskontolu satir varsa kullanicinin ELLE girdigi emek acikca anilir.
 *  3. Iskonto yoksa iskonto cumlesi HIC kurulmaz (olmayan kaybi anlatma).
 */

export type OksuzSayim = { satir: number; iskontolu: number } | null | undefined;

export type OksuzUyarisi = {
  /** Toast basligi — kaybin buyuklugu. */
  baslik: string;
  /** Toast aciklamasi — ne oldu, ne yapilmadi, kullanici ne yapabilir. */
  aciklama: string;
};

export function oksuzKutuphaneUyarisi(sayim: OksuzSayim): OksuzUyarisi | null {
  // 1. Sayim yok ya da bicimsiz (eski surum backend, proxy yaniti) → sessiz.
  if (!sayim || typeof sayim.satir !== 'number' || !(sayim.satir > 0)) return null;

  const iskontolu = typeof sayim.iskontolu === 'number' && sayim.iskontolu > 0
    ? sayim.iskontolu
    : 0;

  // 2/3. Iskonto cumlesi YALNIZ gercekten iskonto varken kurulur.
  const emekCumlesi = iskontolu > 0
    ? ` Bunların ${iskontolu} tanesinde kullanıcıların elle girdiği iskonto var ve bu bilgi geri getirilemez.`
    : '';

  return {
    baslik: `${sayim.satir} kütüphane satırı bu listeyle bağını kaybetti`,
    aciklama:
      `Liste baştan yazıldığı için bu satırlar artık silinmiş kalemlere işaret ediyor.` +
      `${emekCumlesi}` +
      ` Satırlara dokunulmadı; güvenli eşleştirme anahtarı olmadığı için yeniden bağlama yapılmıyor —` +
      ` yanlış eşleşme girilmiş fiyat bilgisini yanlış ürüne yazardı.` +
      ` İlgili kullanıcıların kütüphanelerini gözden geçirmesi gerekir.`,
  };
}
