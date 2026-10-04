import type { KanitKapisi } from './index/types';

/**
 * KUR DONMASI (kullanici karari 06.08: "dovizli maliyetin kuru teklife
 * donsun"). Dovizli (USD/EUR) kutuphane satirindan fiyat yazildiginda,
 * TRY'ye cevrimde KULLANILAN kur sonucla birlikte tasinir; FE bunu satira
 * (`_matKurBilgi`/`_labKurBilgi`) yazar ve teklif JSON'uyla KAYDEDILIR.
 * Boylece cuma acilan teklif pazartesinin sayisini VE o sayinin hangi
 * kurla dogdugunu soyler. TRY satirlarda alan HIC uretilmez (kur kavrami
 * yok); kur metaverisi olmayan ceviricide de uretilmez — uydurma tarih/kur
 * YASAK (kapi: test/kur-donmasi-test.ts D1).
 */
export interface KaynakKur {
  currency: 'USD' | 'EUR';
  /** 1 birim doviz = kac TL (TCMB ForexSelling — cevirici bununla carpti) */
  kur: number;
  /** Kurun ait oldugu gun (TCMB Tarih) */
  tarih: string;
  /** C10 (P4 notu 3, Emre karari 01.10): kur son basarili cekimden bu yana
   *  > 2 is gunu eski (`BAYAT_KUR_IS_GUNU`). P4a yalniz sunucuda WARN
   *  yaziyordu; isaret artik eslestirme SONUCUNDA. Taze kurda alan YOK.
   *  (> 5 is gununde kur gecersiz → satir "kur alinamadi", bu alana gelinmez.) */
  bayat?: true;
  /** C10: son basarili cekimden bu yana gecen is gunu (yalniz bayatken). */
  yasIsGunu?: number;
}

/**
 * COKLU PARA BIRIMI F1 (Emre karari 04.10: dovizli kalem teklifte KENDI para
 * biriminde kalir, ayri toplamlar). Fiyatin KAYNAK para birimindeki hali —
 * TL'ye CEVRILMEDEN. TL alanlari (netPrice/listPrice/discount) DEGISMEZ; bu
 * alan onlara EKTIR.
 *
 * Neden motordan gelmeli: TL net, doviz iskonto + yuvarlamadan ONCE TL'ye
 * cevrilip uretiliyor (outcome-mapper `netFiyat`); TL'den geri hesap
 * (net ÷ kur) iki kez yuvarlanmis sayidan kurus fakli doviz uretir.
 *   - net = (custom ?? liste) × (1 − iskonto)
 *   - TRY: 1 hane YUKARI (netPrice ile birebir) · USD/EUR: 2 hane YUKARI
 * Taninmayan para biriminde URETILMEZ (KUR-02: fiyat da yok).
 * Kapi: test/kaynak-fiyat-test.ts (`test:kaynak-fiyat`).
 */
export interface KaynakFiyat {
  currency: 'TRY' | 'USD' | 'EUR';
  net: number;
  list: number;
  /** Iskonto YUZDESI (0-100) — TL alanindaki `discount` ile ayni */
  discount: number;
}

export interface MatchResult {
  netPrice: number;
  listPrice: number;
  discount: number;
  /** Dovizli kaynak satirda cevrimde kullanilan kur — bkz. KaynakKur */
  kaynakKur?: KaynakKur;
  /** Fiyatin kaynak para birimindeki hali — bkz. KaynakFiyat (F1) */
  kaynakFiyat?: KaynakFiyat;
  // 'high' = kesin (satir cap+tip+cins tasiyor, tek aday)
  // 'suggestion' = oneri (yalniz cap veya baslik-ipucu ile tek aday bulundu;
  //                fiyat doldurulur AMA gorsel isaretlenir — sessiz hata onlemi)
  // 'multi' = birden cok aday, kullaniciya popup
  // 'none' = cap yok veya kutuphanede aday yok
  confidence: 'high' | 'suggestion' | 'medium' | 'low' | 'none' | 'multi';
  /** KARAR (b) (04.10): motorun I6 kapi listesi TOPLUCA. Hafiza otoyazisi
   *  (matching.service) `HAFIZA_OTOYAZ_ENGELI`ndeki bir kapi aciksa YAZMAZ.
   *
   *  Onceden uc ayri boolean vardi (yuzeyGenisletildi · capCevrilemedi ·
   *  dnKoprusu, hepsi 27.08) ve otoyaz kapilarin yalnizca ucunu gorebiliyordu
   *  — kayitli "DESEN BORCU": "dogru cozum kapilarin TOPLUCA tasinmasidir;
   *  kapsami ayri olcum turu ister". Olcum (Pimtas, 04.10): tek adayli 123
   *  sorunun 122'si aile-yok, engel kumesindeki kapilarin hicbiri yok.
   *  Bedeli odenmeyen ornek: 373.825 TL'lik makine (aile zayif + capsiz) tek
   *  onaydan sonra 'high' yaziliyordu. */
  kapilar?: KanitKapisi[];
  // URUN DEGIL (spec): "FITTINGS ORANI" gibi oran/hizmet satirlari — fiyat
  // BEKLENMEZ. Hucre bos + gri isaretlenir ('yok' kirmizisindan farkli).
  notProduct?: boolean;
  /** KUR-01 (14.09): urun bu markada VAR ama dovizli fiyat TL'ye cevrilemedi
   *  (TCMB + yedek kaynak yok, onbellek bos). Fiyat 0, `reason` nedeni soyler.
   *  On yuz satiri "hata" isaretler — kur donunce yeniden eslestirme fiyatlar.
   *  Taninmayan para birimi bu bayragi TASIMAZ (yeniden denemek duzeltmez). */
  kurAlinamadi?: boolean;
  matchedName?: string;
  reason?: string;
  matchedTags?: string[];
  // Birden fazla aday varsa
  candidates?: MatchCandidate[];
  // U2 seffaf cevrim rozeti: "DN 25 → 1\" (çelik)" — cevrim yapildiysa dolu
  donusum?: string;
  // V4 (PRD v1.3): variantTags filtresi tek adaya indi — grup ici otomatik atama
  autoVariant?: boolean;
  // V4.5: istenen varyant bu capta kutuphanede yok — secim bekliyor
  variantMissing?: boolean;
  // M3: secilen markada bu urun ailesi+boyut YOK — kullanicinin kutuphanesinde
  // ayni urunu sunan DIGER markalar (net fiyatlariyla, tiklanabilir)
  alternatives?: BrandAlternative[];
  // Faz 2b: satirin YAZILI ama bu markada DOGRULANAMAYAN kelimeleri
  // ('kuresel', 'dogalgaz'...) — doluysa M3 alternatif taramasi multi'de de
  // kosulur (istenen sey baska markada olabilir). FE icin bilgilendirici.
  dogrulanamadi?: string[];
  /** I6 kanit rozeti (kullanici sarti 18.07): fiyat GECMIS SECIMDEN otomatik
   *  yazildi — FE hucrede "Geçmiş seçiminizden atandı" rozeti gosterir,
   *  marka menusu yeniden acilarak tek tikla cozulur (oto-kacis). */
  hafizaOtoyaz?: boolean;
  /** Otoyazan adayin VARYANT KIMLIGI (canli bulgu 18.07): otoyaz "son secim"
   *  zincirini beslemiyordu — ayni gruptaki sonraki satirlar otomatik
   *  DOLMUYORDU. FE bunu groupVariants'a yazar ve yayilimi tetikler. */
  variantTags?: string[];
}

// M3: alternatif marka onerisi — marka+urun+fiyat birlikte secilir
export interface BrandAlternative {
  brandId: string;
  brandName: string;
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
  /** Kur donmasi: oneri secilirse FE bu kuru satira yazar (bkz. KaynakKur) */
  kaynakKur?: KaynakKur;
  /** Onerinin kaynak para birimindeki fiyati — bkz. KaynakFiyat (F1) */
  kaynakFiyat?: KaynakFiyat;
  /** S2 (06.08.2026): bu ONERI KESIN DEGIL — aday, ana ekranda otomatik
   *  yazilmasini engelleyen bir I6 kapisindan gecemedi ve o kapinin
   *  gerekcesini beraberinde tasiyor ("'paslanmaz' doğrulanamadı").
   *  BOS ise oneri kesindir (motor o markada 'single' buldu).
   *
   *  Neden alan: bu bilgi motorda VARDI ama tasima tipinde YOKTU; FE de
   *  cekinceli adayi kesin adayla ayni "su markalarda var" basligiyla
   *  ciziyordu. Yani ana ekranda ASLA otomatik yazilmayacak bir aday,
   *  oneri kutusunda tek secenek ve kesin gibi goruluyordu. */
  uyariNot?: string;
  /** S2: satirda YAZILI ama bu markanin/firmanin dagarciginda bulunmayan
   *  kelimeler. uyariNot cumleyi verir, bu liste kelimeleri — FE hangi
   *  niteligin dogrulanmadigini ayrica vurgulayabilir. */
  bilinmeyen?: string[];
}

export interface MatchCandidate {
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
  /** Kur donmasi: aday secilirse FE bu kuru satira yazar (bkz. KaynakKur) */
  kaynakKur?: KaynakKur;
  /** Adayin kaynak para birimindeki fiyati — bkz. KaynakFiyat (F1) */
  kaynakFiyat?: KaynakFiyat;
  tags: string[];
  popular: boolean;
  // Bu adayi digerlerinden ayiran ozellik (Galvanizli, Siyah, Kirmizi vb.)
  label: string;
  // Sadece malzeme cinsi/yuzey farki mi (asama 1)? Yoksa baglanti vs farki mi (asama 2)?
  surfaceLevel: boolean;
  // V4: bu adayi kardeslerinden ayiran ANLAMLI tag'ler (cins/yuzey/baglanti/PN/
  // subtype) — grup ici otomatik atamada varyant kimligi olarak kullanilir
  variantTags?: string[];
  // V5 (PRD v1.3): hesabin gecmis tercihine uyan aday — liste basinda on-secili
  preferred?: boolean;
  // E3 (Boru Disi Kalemler PRD): istenen nitelikten farkli deger tasiyan aday
  // isaretlenir ("68°C istendi — bu ürün 141°C")
  uyari?: string;
}

export interface TaggedMaterial {
  tags: string[];
  normalizedName: string;
  materialType: string;
}
