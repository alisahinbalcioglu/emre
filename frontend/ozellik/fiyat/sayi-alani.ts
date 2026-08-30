/**
 * SAYI HÜCRESİ SÜZGECİ — grid hücresinden sayıya giden TEK yol.
 *
 * NEDEN AYRI (VE BAĞIMSIZ) MODÜL: bu süzgeç `ozellik/teklif/teklif-kalem.ts` içinde
 * doğmuştu ama oradan yalnız KAYIT yolu besleniyordu; EKRAN yolları
 * (ExcelGrid, fill-down, sayfaToplamlari) kendi `parseFloat(String(x)) || 0`
 * kopyalarını taşıyordu. İki okuyucu AYNI hücreden FARKLI sayı üretiyordu:
 *
 *   hücre "12,5"  → ekran 12    (parseFloat virgülü keser)
 *                 → kayıt 12,5  (bu süzgeç virgülü çözer)
 *
 * Yani Türk klavyesinde "12,5" yazan kullanıcının ekranda gördüğü kâr ile
 * veritabanına yazılan kâr farklıydı. Süzgeç tek yerde olmalı ki bu iki
 * sayı ASLA ayrışamasın; modül `teklif-kalem`den ayrıldı çünkü o modül
 * `pricing`i import ediyor ve ExcelGrid/fill-down'a taşınması gereksiz
 * bağımlılık (ve vitest'te alias'sız çözülemeyen bir zincir) yaratırdı.
 *
 * ⚠ NEGATİF KELEPÇESİ DAVRANIŞ DEĞİŞTİRMEZ — ölçüldü, varsayılmadı. Üç
 * tüketicinin ÜÇÜ de negatifi zaten sıfır gibi ele alıyordu:
 * `hesaplaSatisBirimFiyat` → `Math.max(0, karYuzde)` ·
 * `maliyetiGeriTuret` → `k <= 0 ? s` · `sayfaToplamlari` → `kar <= 0` dalı.
 * Kelepçe DTO sözleşmesini (@Min(0)) ekranda da yazılı kılar; birleştirmenin
 * TEK gerçek davranış farkı virgüllü ondalıktır.
 *
 * SÖZLEŞME: hücre NE TUTARSA TUTSUN (string, boş, virgüllü, çöp, NaN,
 * Infinity, negatif) sonuç her zaman SONLU ve NEGATİF OLMAYAN bir `number`.
 * Backend DTO'su (@IsNumber + @Min(0)) bunu zaten şart koşuyor; ekranın da
 * aynı kuralı uygulaması "ekranda gördüğün = kaydedilen" demektir.
 *
 * ⚠ `x || 0` YETMEZ: boş olmayan string truthy'dir, aynen geçer ("50" → "50").
 * ⚠ `parseFloat` tek başına yetmez: NaN ve negatif değer DTO'yu düşürür.
 */
export function sayiAlani(v: unknown): number {
  const n = sayiOku(v);
  if (n === null || n < 0) return 0;
  return n;
}

/**
 * HAM OKUMA — virgüllü ondalık çözülür, İŞARET KORUNUR, sayı değilse `null`.
 *
 * NEDEN AYRI: `sayiAlani`nın negatif kelepçesi GÖSTERİM yollarına uymaz.
 * Ekrandaki para hücresi biçimlendiricisi (`ExcelGrid` valueFormatter)
 * kendi `parseFloat(String(v))` kopyasını taşıyordu ve TR klavyede yazılan
 * "1875,5" hücrede STRING olarak durduğu için ekranda ₺1.875,00 görünüyordu —
 * oysa satır toplamı 1875,5 ile hesaplanmıştı (286 × 1875,5 = 536.393).
 * Yani kullanıcı ekranda ÇARPIMI TUTMAYAN iki sayı görüyordu: bu, süzgecin
 * doğduğu "ekran ≠ kayıt" kusurunun GÖSTERİM ikiziydi.
 *
 * Biçimlendirici `sayiAlani` kullanamaz: negatifi 0 göstermek gerçeği gizler
 * (KÂR satırı zarar da yazabilir). Bu yüzden ayrıştırma buraya çıkarıldı;
 * `sayiAlani` yalnızca KELEPÇE katmanı olarak üstünde durur. Böylece virgül
 * kuralı TEK yerde kalır ve iki okuyucu ASLA ayrışamaz.
 */
export function sayiOku(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
