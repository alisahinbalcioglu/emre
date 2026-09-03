/**
 * VERI SATIRI TERFISI (03.09, canli kullanim bulgusu) — TEK KURAL.
 *
 * ── SORUN ───────────────────────────────────────────────────────────────────
 * Dosyadan gelen BOS satirin `_isDataRow` degeri `false`'tur (backend
 * `standart-sema.ts` olcutu: ad VAR + (sira no VAR veya tutar VAR) — bos
 * satirda ad yok). Kullanici o satira ELLE ad + miktar yazinca bu siniflandirma
 * HIC GUNCELLENMIYORDU.
 *
 * Bedeli buyuktu cunku `ExcelGrid.handleCellValueChanged` ilk satirinda
 * `if (!row || !row._isDataRow) return;` kapisi var: satir veri satiri
 * sayilmayinca o hucrenin ARDINDAN HICBIR SEY kosmuyor —
 *   · fitting rozeti/kapsam modu acilmiyor ("Ctrl ile isaretlenmiyor")
 *   · kar yuzdesi, birim fiyat, satir toplami hesaplanmiyor
 *   · sayfa toplamina girmiyor
 * Kullanici satiri EKRANDA gorur ama satir "olu"dur. Canli turda tam olarak
 * bu yasandi: boru blogunun altindaki bos satira "fitting bedeli" + "%35"
 * yazildi, hicbir sey olmadi.
 *
 * ── KURAL ───────────────────────────────────────────────────────────────────
 * `quotes/new/page.tsx`'in kolon-rolu degisiminde ZATEN uyguladigi olcutun
 * AYNISI (orada satir ici yaziliydi; buraya alindi ki iki yer AYRISAMASIN):
 *
 *     ad VAR  &&  (birim VAR  ||  (miktar VAR && miktar !== '0'))
 *
 * Neden "miktar !== '0'": Excel'den gelen bos hucreler 0 olarak inebiliyor;
 * yalniz sifir miktar bir kalem TANIMLAMAZ. Birim varsa miktar aranmaz
 * (kullanici once birimi yazip miktari sonra girebilir).
 *
 * ⚠ TERFI YALNIZ YUKARI YONLUDUR: bir satir veri satiri OLDUKTAN sonra bu
 * modul onu geri DUSURMEZ. Kullanici adi silerse satir bos kalir ama
 * siniflandirmasi korunur — aksi halde ad hucresini temizleyen kullanicinin
 * o satirdaki fiyati/fitting bagi sessizce olurdu.
 */

export interface TerfiRolleri {
  nameField?: string;
  quantityField?: string;
  unitField?: string;
}

/** Satirin metni bir KALEM tanimliyor mu? (siniflandirma olcutu — tek kaynak) */
export function kalemTanimliyorMu(
  r: Record<string, any> | null | undefined,
  roller: TerfiRolleri,
): boolean {
  if (!r) return false;
  const oku = (f?: string) => (f ? String(r[f] ?? '').trim() : '');
  const ad = oku(roller.nameField);
  if (!ad) return false;
  const birim = oku(roller.unitField);
  if (birim) return true;
  const miktar = oku(roller.quantityField);
  return !!miktar && miktar !== '0';
}

/**
 * Bu satir, elle yazim sonrasi VERI SATIRINA terfi etmeli mi?
 *
 * Yapisal satirlar (baslik, grup bandi, ozet) ve zaten veri olanlar HARIC.
 * `_isSpareRow` haric TUTULMAZ: en alttaki bos satirin gercek satira
 * donusmesi zaten beklenen davranistir (auto-append onu ayrica isler).
 */
export function veriSatirinaTerfiEtmeliMi(
  r: Record<string, any> | null | undefined,
  roller: TerfiRolleri,
): boolean {
  if (!r || r._isDataRow) return false;
  if (r._isHeaderRow || r._isGroupRow || r._ozet) return false;
  return kalemTanimliyorMu(r, roller);
}
