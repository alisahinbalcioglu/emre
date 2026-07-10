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
}

export interface TaggedMaterial {
  tags: string[];
  normalizedName: string;
  materialType: string;
}
