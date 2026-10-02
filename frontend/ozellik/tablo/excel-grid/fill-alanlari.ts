/**
 * SURUKLE-DOLDUR ALANLARI — HANGI KOLON TUTAMAKLA DOLDURULABILIR (D11, 02.10).
 *
 * Bu kume eskiden ExcelGrid icinde BOS bagimlilikli bir `useMemo` idi ve
 * iscilik YETKISINI hic okumuyordu. Yetki kapaliyken "İşç. Kâr %" kolonu
 * soluk ve elle yazilamaz cizilirken surukle-doldur onu yine dolduruyordu:
 * hedeflere kar yaziliyor, iscilik birim/toplami YENIDEN hesaplaniyor ve GENEL
 * TOPLAM sessizce degisiyordu (olculdu: ₺650 → ₺750, iki hedef satirda).
 *
 * Kural TEK yerde ve saf: yetki yoksa iscilik alanlari (`_iscKar`, `_firma`)
 * kumeye GIRMEZ. Malzeme alanlari ve iskonto her zaman doldurulabilir.
 *
 * ⚠ Cagiran bu fonksiyonu `laborEnabled` BAGIMLILIGIYLA cagirmali: yetenekler
 * `/auth/me` ile ASENKRON gelir; ilk degerde (false) donmus bir kume Pro
 * kullanicinin iscilik karini SESSIZCE kilitlerdi.
 */
export function fillAlanlari(laborEnabled: boolean): Set<string> {
  const alanlar = new Set(['_malzKar', '_marka', '_draftDiscount']);
  if (laborEnabled) {
    alanlar.add('_iscKar');
    alanlar.add('_firma');
  }
  return alanlar;
}
