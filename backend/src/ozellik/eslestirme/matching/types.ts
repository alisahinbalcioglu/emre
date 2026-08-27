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
}

export interface MatchResult {
  netPrice: number;
  listPrice: number;
  discount: number;
  /** Dovizli kaynak satirda cevrimde kullanilan kur — bkz. KaynakKur */
  kaynakKur?: KaynakKur;
  // 'high' = kesin (satir cap+tip+cins tasiyor, tek aday)
  // 'suggestion' = oneri (yalniz cap veya baslik-ipucu ile tek aday bulundu;
  //                fiyat doldurulur AMA gorsel isaretlenir — sessiz hata onlemi)
  // 'multi' = birden cok aday, kullaniciya popup
  // 'none' = cap yok veya kutuphanede aday yok
  confidence: 'high' | 'suggestion' | 'medium' | 'low' | 'none' | 'multi';
  /** K4 (27.08): aday satirda YAZILI olan yuzeyi TASIMIYOR — yuzey suzgeci
   *  havuzu bosalttigi icin genisletilmis kumeden geldi. Motorun ic
   *   listesi bu sozlesmeye tasinmiyor; hafiza otoyazisi kapisi
   *  (matching.service) bu bayragi okur: bir kez onaylanan secim ikinci
   *  kosumda uyariyi SILIP fiyati high olarak yazmasin. Diger kapilardan
   *  FARKI: burada aday YAZILI bir kisiti IHLAL ediyor. */
  yuzeyGenisletildi?: boolean;
  /** K2/CC IKIZI (27.08): SATIRIN capi cevrim tablosunda YOK — cap suzgeci
   *  hicbir adayi dogrulayamadi. 26.08'de motor tarafinda kapatilan kapinin
   *  (`cap-cevrilemedi`) sozlesme karsiligi.
   *
   *  NEDEN GEREKLI: kapi motorun ic `kapilar` listesindeydi ama MatchResult'a
   *  TASINMIYORDU, dolayisiyla hafiza otoyazisi (matching.service) onu
   *  GOREMIYORDU. Olculdu: satirda bir kez secim yapilinca otoyaz kapinin
   *  UYARI CUMLESINI SILIP fiyati 'high' yaziyordu — yani 26.08'de kapatilan
   *  kapi hafiza yolundan aynen geri aciliyordu (3/8" satirina 1/2" fiyati).
   *  `yuzeyGenisletildi` ile ayni gerekce: bir kez onaylanan secim, ikinci
   *  kosumda dogrulanmamis bir olcuyu dogrulanmis gibi gosteremez. */
  capCevrilemedi?: boolean;
  // URUN DEGIL (spec): "FITTINGS ORANI" gibi oran/hizmet satirlari — fiyat
  // BEKLENMEZ. Hucre bos + gri isaretlenir ('yok' kirmizisindan farkli).
  notProduct?: boolean;
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
