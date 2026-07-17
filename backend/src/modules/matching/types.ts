export interface MatchResult {
  netPrice: number;
  listPrice: number;
  discount: number;
  // 'high' = kesin (satir cap+tip+cins tasiyor, tek aday)
  // 'suggestion' = oneri (yalniz cap veya baslik-ipucu ile tek aday bulundu;
  //                fiyat doldurulur AMA gorsel isaretlenir — sessiz hata onlemi)
  // 'multi' = birden cok aday, kullaniciya popup
  // 'none' = cap yok veya kutuphanede aday yok
  confidence: 'high' | 'suggestion' | 'medium' | 'low' | 'none' | 'multi';
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
}

// M3: alternatif marka onerisi — marka+urun+fiyat birlikte secilir
export interface BrandAlternative {
  brandId: string;
  brandName: string;
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
}

export interface MatchCandidate {
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
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
