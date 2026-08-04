/**
 * "Malzeme Adı sütunu" seçicisinin ETİKETİ — tek kaynak.
 *
 * KULLANICI KARARI (02.08.2026, canlı gözlem): bu kutu tek bir soruyu
 * cevaplar — "malzeme isimleri hangi sütunda?". O sütunun adı `MALZEME ADI`
 * ise kutuda yalnız **MALZEME ADI** yazmalıdır. Eskiden
 * `MALZEME ADI — ör: 2000 GPM 9,5 bar 1 E+ 1 D` yazıyordu; örnek değer,
 * sütunun adını okumayı zorlaştıran gürültüydü.
 *
 * ⚠ ÖRNEK KOŞULSUZ SİLİNEMEZ. Backend `basligi()` gerçek başlık bulamazsa
 * SÜTUN KİMLİĞİNE düşer (`standart-sema.ts:298-299`: `headerName ?? f`).
 * Bu projede başlıksız dosya istisna değil kural: "demontaj-sefa: HİÇ başlık
 * yok", "yangin: NO/AD/MIKTAR/BIRIM başlıksız". Örnek koşulsuz silinseydi o
 * dosyalarda seçici `col1 / col4` yazar, kullanıcı hangi sütunu seçeceğini
 * ayırt EDEMEZDİ. Bu yüzden örnek yalnız GERÇEK BAŞLIK YOKKEN kalır.
 *
 * Ayırt etme kuralı tahmin değil, backend'in kendi geri-düşüş kuralının
 * tersidir: `headerName === field` ise başlık yok demektir.
 */
export interface KaynakKolon {
  field: string;
  headerName: string;
  ornek?: string;
}

export function kaynakKolonEtiketi(k: KaynakKolon): string {
  const baslik = String(k.headerName ?? '').trim();
  const ornek = String(k.ornek ?? '').trim();
  const gercekBaslikVar = baslik !== '' && baslik !== k.field;
  if (gercekBaslikVar) return baslik;
  // Başlık yok — ayırt edilebilmesi için tek ipucu örnek değerdir.
  return ornek ? `${baslik || k.field} — ör: ${ornek}` : (baslik || k.field);
}
