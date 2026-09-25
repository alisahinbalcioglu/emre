/**
 * ONAY ↔ REVIZYON KARARLARI (saf — DOM'suz, React'siz, test edilir).
 *
 * KULLANICI BILDIRIMI (07.08, ekran goruntusuyle): "daha once yukledigim dwg yi
 * tekrar yukledigimde segmentlerine ayiramiyorum ve segmentlerine ayrilmis olan
 * cizimlerin uzerinde revize isler yapamiyorum. onaylandi butonunu bozabilmeli
 * ve parcalanmis segmentler geri gelmeli."
 *
 * 07.08'de olculen kok: onayi geri alma MEKANIZMASI vardi, ona ulasan YOL
 * yoktu (devre disi kart dugmesi tiklama uretmiyordu; `selectLayer` toggle
 * oldugu icin revizyon secimi NULL'a cekiyordu; sag panelde onayli layer
 * aksiyonsuz kaliyordu). Bu kusurlarin yasadigi uc bilesen 25.09 yeni DWG
 * tasariminda KALDIRILDI; o sozlesmeler artik adim panelinde yasar ve
 * `adim-durumu.test.ts` ile `calisma-kaydi.test.ts` kilitler:
 *  - onayli layer'in cikisi her zaman gorunur ("Geri al" onayi kaldirir),
 *  - onay / onay kaldirma layer secimini DEGISTIRMEZ,
 *  - ayni layer'i yeniden secmek secimi KAPATMAZ (toggle yok; "Degistir" var).
 *
 * Bu modul yalniz KARARLARI tasir; render ve state yazimi cagiranlarda kalir.
 */

/**
 * Bir layer cizimde CAP RENKLERIYLE (parcalara ayrilmis) gorunur mu?
 *
 * Onayli ve SECILI OLMAYAN layer bilerek ham AutoCAD rengine doner ("bu layer
 * bitti, dikkati basa cek" kurali). 25.09 tasarimi: onaylanan layer SECILI
 * kaldikca cap renkleriyle gorunur ve duzenlenebilir ("Onaylandi ·
 * fiyatlandirmaya hazir"; bir parcanin capi degisirse onay kalkar).
 */
export function capRenkliGorunur(durum: {
  hesaplandi: boolean;
  onayli: boolean;
  secili?: boolean;
}): boolean {
  return durum.hesaplandi && (!durum.onayli || !!durum.secili);
}

/**
 * FIYATLANDIRMAYA GIDEN LAYER SIRASI — kullanicinin ONAYLADIGI sira.
 *
 * `approvedAt` alaninin tek tuketicisi buildExcelSheets'in sheet siralamasiydi;
 * 11.08'de otomatik Excel indirmesiyle birlikte o tuketici silindi ve alan
 * yalniz-yazilir kaldi. finalMetraj ise `Object.values(calculatedLayers)`
 * ekleme sirasina (= hesaplama sirasina) dusmustu — teklif grup bantlari
 * keyfi dizilirdi. Bu fonksiyon eski kullanici-gorunur sirayi yeni yolda
 * geri getirir: bantlar onay sirasinda.
 *
 * approvedAt yoksa (alan eklenmeden onceki localStorage kayitlari) computedAt'e
 * duser — legacy layer sirasiz kalmaz. Girdi dizisi mutate edilmez.
 */
export function onaySirasi<T extends { approvedAt?: number; computedAt?: number }>(
  layers: T[],
): T[] {
  const zaman = (l: T) => l.approvedAt ?? l.computedAt ?? 0;
  return [...layers].sort((a, b) => zaman(a) - zaman(b));
}
