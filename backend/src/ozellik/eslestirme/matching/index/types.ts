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
    /** Kalem birimi (mt/adet/takim) — ISCILIK L6 sert filtresi okur.
     *  Opsiyonel: malzeme yollari spread ile zaten tasir; eski fixture'lar
     *  belirtmese de derlenir (birimsiz kalem elenmez kurali). */
    birim?: string | null;
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

/** 'kategori' = GRUP KADEMESI (kullanici karari 17.07): ayni urun adi birden
 *  fazla bolum basligindan geliyorsa ("Tesisat Boruları" / "Basınçlı Borular")
 *  ILK soru grup olur; grup secilince mevcut kademeler aynen devam eder. */
export type AskColumn = 'ad' | 'kategori' | 'cins' | 'baglanti' | 'boy' | 'urun';

export type NoneReason =
  | 'urun-degil'
  | 'etiket-yok'
  | 'ad-yok'
  | 'cap-yok'
  | 'kriter-yok'
  // IS 3-B: satirda birlikte bulunamayan yuzeyler yazili ("galvaniz siyah")
  // VE bu markada o yuzeylerin HICBIRINI tasiyan urun yok. 'kriter-yok'tan
  // AYRI kod: neden tek bir niteligin yoklugu degil, yazilanlarin celiskisi.
  | 'yuzey-celiskisi'
  // ISCILIK L6: satir birimi ile kalem birimleri celisti (birimSert)
  | 'birim-uyumsuz';

/**
 * I6 KAPILARI — tek adayin OTOMATIK yazilmasini engelleyen gerekceler.
 *
 * `uyariNot` bu kapilarin KULLANICIYA gorunen (tek, oncelikli) cumlesidir;
 * bu liste ise KARAR VERENLERE gorunen yapisal halidir. Ikisi ayri sey:
 * metin sirali bir secim yapar ("once yuzey celiskisi, sonra birim..."),
 * karar mercii ise HANGI kanitlarin eksik oldugunu bilmek zorundadir.
 *
 * Neden lazim (S3, 06.08.2026): capraz-marka oneri kutusu "ask + tek aday"i
 * secenek sayiyordu. Ama tek adayin NEDEN onaya dustugu onemlidir — capi
 * dogrulanamamis bir aday ile "ek niteligi dogrulanamamis" bir aday ayni
 * kanit gucunde DEGILDIR. uyariNot metnini regex'le ayirmak kirilgan olurdu
 * (metin kullaniciya aittir, degisir); kapi kimligi ise sozlesmedir.
 */
export type KanitKapisi =
  /** Satirda birlikte bulunamayan yuzeyler yazili (galvaniz+siyah) */
  | 'yuzey-celiskisi'
  /** E2/I9: satir birimi ile aday ailesi celisiyor (mt ↔ ekipman) */
  | 'birim-celiskisi'
  /** R1b: tek aday sozluk taban beklentisiyle cakisiyor (galvaniz↔siyah) */
  | 'taban-celiskisi'
  /** S5: tek aday sozluk MALZEME beklentisiyle cakisiyor (pis su=PVC ↔ PP) */
  | 'malzeme-celiskisi'
  /** Ç-vakasi: satir capli ama adayin capi YOK — cap dogrulanamadi */
  | 'capsiz-dusum'
  /** S4 (06.08): capsiz istisnasindan gecen adayin ailesi yalniz KATEGORI
   *  basligindan turedi (aileZayif) — hem aile hem cap dogrulanmamis.
   *  ELEME DEGIL, EK KAPI: aday listede kalir, fiyat otomatik yazilmaz. */
  | 'aile-zayif'
  /** S-vakasi: ad daraltmasi gevsetildi — ad birebir eslesmedi */
  | 'ad-gevsetildi'
  /** Karar #3: satirda yazili ama bu havuzun dagarciginda olmayan kelime */
  | 'bilinmeyen-kelime'
  /** H6: aile hic cozulemedi — eslesme yalniz olcu benzerligiyle bulundu */
  | 'aile-yok'
  /**
   * S6 (06.08): SATIRIN ailesi ile ADAYIN ailesi FARKLI. Aday yalnizca aile
   * kilidi GECICI olarak kaldirilarak bulundu.
   *
   * NEDEN VAR — NORM KELEPÇE vakasi: satir "Sprinkler Boru Askisi, DN150"
   * icindeki "Boru" yuzunden 'boru' ailesine cozuluyordu; urunler 'kelepce'
   * ailesindeydi. Sonuc `none/ad-yok` idi ve bu, "bu markada gercekten yok"
   * ile BIT BIT AYNI gorunuyordu. Kullanicinin gordugu cumle
   * `Bu markada "boru" bulunamadi.` — motorun kendi urettigi slug.
   *
   * Aile kilidi KALKMIYOR (bir kompansator satirina vana yine aday olamaz);
   * yalniz "kilit yanlis kapandi mi" sorusu SORULUR hale geliyor. Bu kapi
   * atesledigi anda fiyat OTOMATIK YAZILMAZ — kullanici onaylar.
   */
  | 'aile-uyusmazligi';

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
      /** S3: uyariNot'un yapisal hali — hangi I6 kapilari atesledi.
       *  Capraz-marka oneri kutusu bu listeye BAKARAK zayif adayi eler. */
      kapilar?: KanitKapisi[];
    }
  | { kind: 'none'; reason: NoneReason; detail?: string; donusum?: string | null;
      /** PANO 20: cap-yok'ta markadaki MEVCUT caplar (en yakin sirali) —
       *  sessiz bos yasak, kullanici eylemli bilgi gorur */
      mevcutCaplar?: string[];
      /** E4 (26.08): 'cap-yok'ta GERCEKTEN eleyen kriter YUZEY ise burada
       *  durur. Yuzey filtresi hicbir zaman 'none' donmez, yalniz daraltir —
       *  bu yuzden sonuc kodunu HER ZAMAN sonraki (cap) filtre yaziyor ve
       *  mesaj `Bu markada 2" yok` diyordu; oysa markada 2" siyah boru
       *  DURUYORDU (olculdu). `mevcutCaplar` da bu yuzey-suzulmus kumeden
       *  gelir — mesaj ikisini birlikte durustce anlatir. */
      yaziliYuzey?: string[] }
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
  /**
   * S5 — MALZEME BEKLENTISI (sozluk `kinds`inden turer: pis su → ['pvc','pe'],
   * hidrant → ['pe'], temiz su → ['ppr','pp']).
   *
   * SIRALAR, ELEMEZ — 16.07'de muhurlenen "TABAN YUZEY SIRALAR, ELEMEZ"
   * kararinin malzeme eksenine dogal genislemesi. Beklenen malzemeyi tasiyan
   * aday ONE, cakisan malzeme tasiyan SONA gider; cakisan TEK aday kalirsa
   * fiyat otomatik YAZILMAZ ('malzeme-celiskisi' kapisi).
   *
   * ⛔ SERT FILTRE OLARAK KULLANILMAZ. Eleyen surum acikca reddedildi:
   * malzemesi cozulemeyen (etiketsiz) urunler toptan elenir ve kullanici
   * "kutuphanemde var ama yok diyor" regresyonunu yasardi — projenin daha
   * once bedelini odedigi "sessiz bos" sinifi. Satirda malzeme ACIKCA
   * yaziliysa K4 zaten sert filtredir; bu alan yalniz SOZLUK VARSAYIMIDIR.
   */
  hintMalzeme?: string[];
  /** none/elenme mesajlarinda gosterilecek sozluk etiketi ("ppr" gibi) */
  hintLabel?: string;
  /** Alias'in KENDI kelimeleri + stripTags — kisit/bilinmeyen SAYILMAZ
   *  (sozluk o kelimeleri zaten tuketti; "bulunamadı" demek yalan olur) */
  ignoreTokens?: string[];
  /** ISCILIK L6 (PRD Iscilik): birim uyumu SERTTIR — satir birimi ile kalem
   *  birimi celisirse aday HAVUZA GIREMEZ (malzemedeki E2 yumusak-onay yerine).
   *  Birimsiz kalem ELENMEZ (kanit yok, suclama yok). catalog='iscilik' acar. */
  birimSert?: boolean;
  /**
   * S6 (06.08) — AILE KILIDINI GECICI OLARAK KAPAT. YALNIZ TESHIS ICINDIR.
   *
   * ⛔ NORMAL SORGU YOLUNDA ASLA KULLANILMAZ. Aile SERT KILITTIR ve oyle
   * kalir; bu bayrak yalnizca sonuc ZATEN `none/ad-yok` olduktan SONRA,
   * "kilit yanlis aileye mi kapandi?" sorusunu sormak icin ikinci bir
   * gecise acilir (bkz. `aileUyusmazligiTeshisi`). Ikinci gecisin bulduğu
   * aday KESIN sayilmaz — `aile-uyusmazligi` kapisiyla ONAYA duser.
   *
   * Bayrak acikken diger TUM kilitler (cap, sinif, yuzey, baglanti, birim,
   * malzeme) AYNEN calisir — tek fark aile suzgecidir. Boylece "yalnizca
   * aile yuzunden mi elendi" sorusuna kanitli cevap verilir.
   */
  aileKilidiKapali?: boolean;
}
