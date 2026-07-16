// ════════════════════════════════════════════════════════════════════
// INDEKSLI MOTOR — IC TIPLER (v2)
//
// Bu tipler motorun ICINDE kalir. Disariya cikan sozlesme ../types.ts'tir
// (MatchResult / MatchCandidate) ve DEGISMEZ — outcome-mapper cevirir.
// ════════════════════════════════════════════════════════════════════

import type { SizeInfo, SizeClass } from '../conversion';
import type { ProductIndexFields } from './product-index';

/** Indeksten okunan urun + kullanicinin ekonomisi (UserLibrary join). */
export interface IndexedRow {
  /** UserLibrary satir id'si */
  id: string;
  // ── EKONOMI: kullaniciya ait ──
  listPrice: number;
  customPrice: number | null;
  discountRate: number;
  currency: string;
  // ── URUN: indekse ait (11 kolon + on-hesap) ──
  urun: ProductIndexFields & {
    ad: string;
    cins: string | null;
    baglanti: string | null;
    capRaw: string | null;
    boyMm: number | null;
    kategori: string | null;
    urunKodu: string | null;
    sheetName: string | null;
    price: number;
  };
}

/**
 * Teklif satirinin cozulmus hali.
 * DIKKAT: metin cikarimi YALNIZ burada yasar — musterinin Excel'i serbest
 * metindir. Urun tarafinda (product-index.ts) tahmin YOKTUR, kolon vardir.
 */
export interface LineQuery {
  raw: string;
  /** "FITTINGS ORANI" gibi oran/hizmet satiri — fiyat BEKLENMEZ */
  notProduct: boolean;
  /** Seviye1 aile (sert kilit). null = aile cozulemedi → her zaman soru */
  familySlug: string | null;
  /** Satirin KOK ALINMIS token'lari (hicbiri atilmaz) */
  tokens: string[];
  /**
   * AILEYI COZEN token'lar: kaldirilinca aile cozumu bozulanlar.
   * Bunlar EKSIK KELIME DEGIL, ailenin adidir — kullaniciya "bulunamadı"
   * diye raporlanmazlar. Canli vaka: "FLOW SWİTCH DN 65" → urunun Turkce
   * adi "Akış anahtarı" oldugu icin 'flow'/'switch' urun token'larinda yok;
   * motor dogru bulup soruyordu ama "'flow switch' bu markada bulunamadı"
   * diyordu — YALAN (aileyi zaten o kelimeler cozdu).
   */
  aileKelimeleri: string[];
  capInfo: SizeInfo | null;
  boyTag: string | null;
  /** Satirin ham birimi (I9): 'adet' → boru dayatilamaz */
  unit: string | null;
  /**
   * E2 birim sinyali (on-hesap): metre→boru, adet→ekipman beklentisi.
   * Sorgu motoru CELISKIDE otomatik yazimi kapatir (tek aday → onay listesi).
   */
  unitSignal: 'pipe' | 'equipment' | null;
}

/** Bir token hangi kolonu kisitliyor? Dagarcik marka+aile havuzundan uretilir. */
export interface FamilyVocab {
  ad: Set<string>;
  cins: Set<string>;
  baglanti: Set<string>;
}

/** classifyTokens ciktisi — hangi token hangi kolona gitti. */
export interface RoutedTokens {
  ad: string[];
  cins: string[];
  baglanti: string[];
  /**
   * Hicbir dagarcikta olmayan token'lar.
   * KARAR #3: bunlar KISIT OLARAK UYGULANMAZ — aile sorusuna dusulur ve
   * kullanici secince es anlamli ogrenilir (TerminologyAlias). Sert sifir
   * vermek, yazim hatasinda cikmaz sokak yaratirdi.
   */
  bilinmeyen: string[];
}

export type AskColumn = 'ad' | 'cins' | 'baglanti' | 'boy' | 'urun';

export type NoneReason =
  | 'urun-degil'
  | 'etiket-yok'
  | 'ad-yok'
  | 'cap-yok'
  | 'kriter-yok';

/**
 * Motorun UC sonucu. Dorduncu yol YOKTUR (PRD Bolum 7: fallback yasagi).
 * Bu tip sayesinde "sessiz yazma" yolu YAPISAL OLARAK imkansiz — fiyat
 * yalnizca 'single' dalindan cikar.
 */
export type QueryOutcome =
  | { kind: 'single'; row: IndexedRow; donusum?: string | null }
  | {
      kind: 'ask';
      askColumn: AskColumn;
      rows: IndexedRow[];
      /** Karar #3: bu token'lar tanınmadi → kisit uygulanmadi, soruya dusuldu */
      bilinmeyen?: string[];
      donusum?: string | null;
      /** V4.5: istenen varyant bu capta yok */
      variantMissing?: boolean;
      /** E2: birim celiskisi gibi "tek aday olsa da ONAY iste" notu */
      uyariNot?: string;
    }
  | { kind: 'none'; reason: NoneReason; detail?: string; donusum?: string | null }
  | { kind: 'auto-variant'; row: IndexedRow; donusum?: string | null };

export interface QueryOpts {
  /** V4: kullanicinin grup ici onceki secimi — marka sinyalinden ONCE uygulanir */
  variantTags?: string[];
  sizeClassHint?: SizeClass | null;
  // ── S3: SOZLUK IPUCLARI (TerminologyAlias — matchV2 cozer, motor uygular) ──
  /** Alias impliedType: satirin KENDI ailesi cozulemediyse aile bu olur
   *  (E8: satir ailesi COZULDUYSE hint ASLA dayatilamaz — cagiran temizler) */
  hintFamily?: string | null;
  /** T1: sozluk sinifi YAZILI sayilir → karsit sinif (steel↔plastic) SERT
   *  elenir; 'unknown' urunler gecer (kanit yok, suclama yok) */
  hintClass?: 'steel' | 'plastic' | null;
  /** Taban yuzey beklentisi (siyah|galvaniz): CAKISAN tabani tasiyan aday
   *  elenir, taban tasimayan (kirmizi boyali) VARYANT olarak kalir */
  hintBases?: string[];
  /** none/elenme mesajlarinda gosterilecek sozluk etiketi ("ppr" gibi) */
  hintLabel?: string;
  /** Alias'in KENDI kelimeleri + stripTags — kisit/bilinmeyen SAYILMAZ
   *  (sozluk o kelimeleri zaten tuketti; "bulunamadı" demek yalan olur) */
  ignoreTokens?: string[];
}
