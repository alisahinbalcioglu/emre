// ════════════════════════════════════════════════════════════════════
// URUN INDEKSLEYICI (Indeksli + Ad-Kilitli TEK Motor — Faz 1)
//
// SAF: DB yok, I/O yok, global durum yok. Girdi = 11 kolon, cikti = indeks
// alanlari. Hem import hattinin hem testlerin URETIM yolu burasidir.
//
// TEMEL ILKE (Karar #1): urunun ailesi/cinsi/baglantisi METINDEN TAHMIN
// EDILMEZ — kolonlardan OKUNUR. Serbest metin cikarimi yalnizca TEKLIF
// satirinda kalir (musterinin Excel'i yapilandirilmis degildir).
//
// Bu dosya conversion.ts / normalizer.ts / ad-resolver.ts primitiflerini
// YENIDEN YAZMAZ — yalnizca YAZMA ANINDA BIR KEZ cagirir. Bugun ayni is
// her eslestirme isteginde, her aday icin tekrar tekrar yapiliyor
// (matching.service.ts:171).
// ════════════════════════════════════════════════════════════════════

import { createHash } from 'crypto';
import { normalizeText, extractMaterialType } from '../normalizer';
import { resolveAd, AD_DNLI_SLUGS } from '../ad-resolver';
import { extractSizeInfo, sizeEquivalents, SizeClass } from '../conversion';

/** Fiyat listesi Excel'inin 11 kolonu (kaynak sadakati — hicbiri dusmez). */
export interface ProductColumns {
  kategori?: string | null; // Kategori (PDF Bolumu)
  ad: string; // Malzeme Adi        ← ZORUNLU
  cins?: string | null; // Malzeme Cinsi
  baglanti?: string | null; // Baglanti Sekli
  cap?: string | null; // Cap
  boy?: number | string | null; // Boy (mm)
  birim?: string | null; // Birim
  price: number; // Birim Fiyat
  paraBirimi?: string | null; // Para Birimi
  urunKodu?: string | null; // Urun Kodu (Art.No)
  not?: string | null; // Not
  sheetName?: string | null;
  sourceRow?: number;
  sortOrder?: number;
  extra?: Record<string, any> | null;
}

/** buildProductIndex ciktisi — ProductIndex tablosunun on-hesap alanlari. */
export interface ProductIndexFields {
  adSlug: string;
  adBucket: string;
  adTokens: string[];
  cinsNorm: string | null;
  cinsTokens: string[];
  baglantiNorm: string | null;
  baglantiTokens: string[];
  sizeClass: SizeClass;
  capTags: string[];
  capNorm: string | null;
  boyTag: string | null;
  displayName: string;
  rowKey: string;
  belirsiz: boolean;
  indexVersion: number;
}

/**
 * INDEKS SURUMU — tokenize/kok alma/alan uretimi HER DEGISTIGINDE ARTTIR.
 *
 * Neden hayati: adTokens VERITABANINDA saklidir, teklif satiri ise CANLI
 * kodla cozulur. Ikisi farkli surumdense motor SESSIZCE yanlis cevap uretir.
 * Canli vaka (15.07): tokenizer "aile kelimesini dus"ten "kok al"a gecti;
 * indeks eski surumde kaldi:
 *   indeks:  "İzlenebilir kelebek vana" → {izlenebilir,kelebek}   ('vana' ATILMIS)
 *   satir:   "İZLENEBİLİR KELEBEK VANA" → {izlenebilir,kelebek,vana}
 * → 'vana' hicbir urunun adinda yok → Cins kisiti sanildi → "bu markada
 *   'vana' tasiyan urun yok" (oysa 23 tane vardi).
 *
 * v2: aile kelimesi artik ATILMIYOR · v3: bas-isim aile cozumu (sondan)
 * v4: KOK ALMA KALDIRILDI → onek toleransi (bkz. tokenEsit) — Turkcede -lı
 *     eki ile govde-sonu -l sozluksuz ayirt edilemiyordu ('kanalı'→'kana').
 *
 * Dispatch bu surumu KONTROL EDER (matching.service): bayat indekste v2
 * CALISMAZ, v1'e duser ve uyarir. Sessiz yanlis cevap yerine gorunur uyari.
 */
export const INDEX_VERSION = 4;

/** adSlug cozulemeyen satirin tasidigi isaret — eslestirmeye ADAY OLAMAZ. */
export const BELIRSIZ_SLUG = 'belirsiz';

/**
 * Gurultu kelimeleri: ayirt edici olmadiklari halde token kumesine girip
 * K1 alt-kume testini bozabilecekler. COMERT tutuldu (Karar #3 sayesinde
 * tanınmayan token zaten sert eleme yapmiyor — bu liste yalnizca sinyali
 * temizler, kapi degildir).
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  've', 'ile', 'icin', 'veya', 'vb', 'vs', 'adet', 'takim', 'komple', 'dahil',
  'haric', 'montaj', 'montaji', 'tip', 'tipi', 'model', 'modeli', 'no', 'nolu',
  'seri', 'serisi', 'urun', 'urunu', 'malzeme', 'malzemesi', 'olcu', 'olcusu',
  'mm', 'cm', 'metre', 'mt', 'adeti',
]);

/** Turkce ekini ONEK TOLERANSIYLA karsilastirmak icin en kisa govde. */
const ONEK_MIN = 4;

/**
 * IKI TOKEN AYNI KELIME MI? — Turkce eki ONEK TOLERANSIYLA gecilir.
 *
 * ⚠ Once KOK ALMAYA calistim ve TEMELDEN cikmaza girdi: Turkcede -lı eki ile
 * govde-sonu -l + iyelik -ı SOZLUKSUZ AYIRT EDILEMEZ:
 *     galvaniz + li  → 'galvanizli'   (ek)
 *     kanal    + ı   → 'kanalı'       (govdenin KENDI l'si)
 * Kural '-lı'yi keserse 'kanalı' → 'kana' olur (govde parcalanir); kesmezse
 * 'galvanizli' → 'galvanizl' kalir ve 'galvaniz' ile eslesmez. Ikisi de
 * canli vakada kirildi (biri "galvaniz yazilmasina ragmen siyah onerildi",
 * digeri "boru kanalı, çelik boru satirina aday oldu").
 *
 * ONEK TOLERANSI belirsizligi TAMAMEN kaldirir — tahmin YOK, kesme YOK:
 *     'galvaniz' ⊂ 'galvanizli' ✓   'kanal' ⊂ 'kanalı' ✓   'boru' ⊂ 'borusu' ✓
 *     'cekvalf' ⊄ 'kuresel' ✓        'disli' ⊄ 'disko' ✓ (ikisi de digerinin
 *                                     oneki DEGIL — 'dis' 4 karakterin altinda)
 * ONEK_MIN kisa govdelerin birbirini yutmasini engeller.
 */
export function tokenEsit(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= ONEK_MIN && b.startsWith(a)) return true;
  if (b.length >= ONEK_MIN && a.startsWith(b)) return true;
  return false;
}

/** istenen ⊆ varolan (onek toleransli) */
export function altKumeMi(istenen: string[], varolan: string[]): boolean {
  return istenen.every((t) => varolan.some((v) => tokenEsit(t, v)));
}

/** Metni token'lara ayirir: normalize → bol → gurultuyu at. KOK ALINMAZ. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  // TIRELI KELIME TEK TOKEN: "V-Flex" → 'vflex'.
  // Yoksa ['v','flex'] olur, 'v' tek harf diye gurultuye gider ve "Omega
  // V-Flex" ile "Omega U-Flex" AYIRT EDILEMEZ hale gelir (canli vaka).
  const norm = normalizeText(String(text)).replace(/([a-z0-9])-([a-z0-9])/gi, '$1$2');
  const raw = norm.split(/[^a-z0-9°%]+/i).filter(Boolean);
  const out: string[] = [];
  for (const t of raw) {
    if (t.length < 2) continue; // tek harf ayirt etmez ("x,y,z" gurultusu)
    if (STOPWORDS.has(t)) continue;
    // KOK ALINMAZ — kelime OLDUGU GIBI saklanir. Ek toleransi karsilastirma
    // aninda (tokenEsit) onek ile gecilir; boylece hicbir govde parcalanmaz.
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Aile cozumu: ONCE "Malzeme Adi" (otorite), cozulmezse KATEGORI baglami.
 *
 * Neden kategori fallback'i — 12 gercek dosyada olculdu:
 *   Armaş satir 179: Kategori="İzlenebilir Kelebek VANA" | Ad="ARMAŞ
 *   İZLENEBİLİR KELEBEK"  → 'vana' kelimesi ADda YOK, KATEGORIde var.
 * Ad'i tek kaynak yapinca 12 dosyada %20 satir 'belirsiz' (= eslestirmeye
 * GIREMEZ) oluyordu; kategori fallback'i bunu %11'e indirdi (Armaş %20→%0,
 * ECA %38→%3). Kategori = PDF'in bolum basligi, yani ailenin ta kendisi.
 * Eski motor da bunu yapiyordu: tagText = kategori + ad (admin.service.ts:882).
 *
 * CINS kolonu BILEREK kaynak DEGIL: "kauçuk (titreşim yutucu)" gibi bir cins
 * degeri sozlukte kompansator deseni tasir → aileyi kacirtir.
 */
export function resolveFamily(ad: string, kategori?: string | null): string | null {
  const bas = basIsimAilesi(ad);
  if (bas) return bas;
  if (!kategori?.trim()) return null;
  // Ad + kategori birlikte: kategori TEK BASINA cozulmez (baska satirin
  // ailesini bu satira dayatabilir) — ad ile birlikte deger tasir.
  return basIsimAilesi(`${ad} ${kategori}`);
}

/**
 * TURKCEDE BAS ISIM SONDADIR — aileyi SONDAN cozeriz.
 *
 * ⚠ Once bastan tariyordum (extractMaterialType(tumMetin)) ve canli vakada
 * kirildi: "Dekoratif boru kompansatörü" icinde /boru/ gectigi icin aile
 * 'boru' cikiyordu → bir KOMPANSATOR, boru satirina aday oluyordu.
 * Sozluge ('kompansator') hic sira gelmiyordu.
 *
 * Dogru kural: en KISA sondan-parcadan baslayip uzat, ILK cozuleni al.
 *   "Dekoratif boru kompansatörü" → "kompansatörü" → kompansator ✓
 *   "Sprinkler borusu"            → "borusu"       → boru        ✓ (gercekten boru)
 *   "Akış anahtarı"               → "anahtarı"(∅) → "akış anahtarı" → akis-anahtari ✓
 *   "Otomatik hava atma pürjörü"  → hicbiri       → null         ✓ (sozlukte yok)
 *
 * Boylece "en uzun desen kazanir" sozluk kurali da dogru calisir: aile
 * kelimesi ADIN SONUNDA arandigi icin bastaki nitelemeler ("dekoratif boru")
 * aileyi kacirtmaz.
 */
function basIsimAilesi(text: string): string | null {
  const kelimeler = normalizeText(text).split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const byRegex = extractMaterialType(parca);
    if (byRegex && byRegex !== 'diger') return byRegex;
    const byDict = resolveAd(parca);
    if (byDict) return byDict;
  }
  return null;
}

/**
 * Urunun olcu sinifi KENDI kolonlarindan cozulur — markadan/baslıktan DEGIL.
 * (Bugunku motor bunu marka cikarimindan tahmin ediyor: "ÇAYIROVA → çelik".
 * Urun kendi cinsini soyluyorsa tahmine gerek yok.)
 * Cozulemezse 'unknown' → sizeEquivalents union dondurur → sorgu tarafi iki
 * yoruma yayilan adayi gorunce ASLA otomatik yazmaz (P4 korumasi).
 */
export function resolveProductSizeClass(ad: string, cins?: string | null, kategori?: string | null): SizeClass {
  const text = `${cins ?? ''} ${ad}`;
  const norm = normalizeText(text);
  if (/\b(ppr|pe-?100|pe-?80|pex|pvc|hdpe|polietilen|plastik)\b/.test(norm)) return 'plastic';
  if (/\b(celik|paslanmaz|pirinc|dokum|bronz|bakir|galvaniz|siyah|st\s*37)\b/.test(norm)) return 'steel';
  const slug = resolveFamily(ad, kategori);
  if (slug && (AD_DNLI_SLUGS.has(slug) || slug === 'boru' || slug === 'vana' || slug === 'fitting')) {
    return 'steel';
  }
  return 'unknown';
}

/** Boy (mm) → 'len-500'. Excel'de sayi da metin de gelebilir. */
export function buildBoyTag(boy: number | string | null | undefined): string | null {
  if (boy === null || boy === undefined || boy === '') return null;
  const n = typeof boy === 'number' ? boy : parseFloat(String(boy).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `len-${Math.round(n)}`;
}

function sha1_16(s: string): string {
  return createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 16);
}

/**
 * rowKey — K7'nin ve iskonto korumasinin tasiyicisi.
 *
 * Kimlik = SAYFA + TUM AYIRT EDICI KOLONLARIN DEMETI. Urun Kodu bu demetin
 * yalnizca BIR BILESENIDIR — anahtar DEGIL.
 *
 * ⚠ Bunu once yanlis yaptim: kod varsa kimligi KODA baglamistim. 12 gercek
 * dosyada olcunce coktu — PRD'nin "Urun Kodu tekil anahtar DEGILDIR, yalniz
 * mukerrer onleme/izleme icindir" cumlesi birebir hakliydi:
 *   Armaş 240-242: ad="El" · cins="Pik Döküm" · Flanşlı · 50/65/80 mm
 *                  → UCUNUN DE Urun Kodu = "EL"  (SKU degil, MODEL/TIP kodu:
 *                    notta "Vana tip kodu: EL" yaziyor)
 * Koda baglayinca uc ayri cap TEK kayda cokuyordu. 15487 satirin 5506'si
 * boyle yutuluyordu; demet kimligiyle 1969'a indi (kalan = dosyada gercekten
 * ayni demete sahip satirlar → import katmani #2/#3 soneki verir + raporlar).
 *
 *  - K7: ayni kod farkli SAYFADA → farkli sheetKey → IKI AYRI kayit ✓
 *  - K7: ayni kod ayni sayfada farkli CAP → farkli capNorm → AYRI kayit ✓
 *  - Idempotent yeniden yukleme: ayni satir → ayni rowKey → UPDATE (create
 *    degil) → ProductIndex.id KORUNUR → UserLibrary.productIndexId FK'si
 *    ayakta kalir → KULLANICININ ISKONTOSU HIC KAYBOLMAZ.
 *  - rowKey FIYATTAN bagimsizdir (fiyat degisir, kimlik ayni kalir).
 */
export function buildRowKey(c: ProductColumns, f: Pick<ProductIndexFields, 'adBucket' | 'cinsNorm' | 'baglantiNorm' | 'capNorm' | 'boyTag'>): string {
  const sheetKey = normalizeText(c.sheetName ?? c.kategori ?? '');
  const kod = normalizeText((c.urunKodu ?? '').trim());
  return sha1_16(
    [sheetKey, f.adBucket, f.cinsNorm ?? '', f.baglantiNorm ?? '', f.capNorm ?? '', f.boyTag ?? '', kod].join('|'),
  );
}

/**
 * 11 kolon → indeks alanlari. Tek giris noktasi: import hatti da testler de
 * BURAYI cagirir (test fixture'i sahte tag uretmez, uretim yolunu kullanir).
 */
export function buildProductIndex(c: ProductColumns): ProductIndexFields {
  const ad = (c.ad ?? '').trim();
  const familySlug = ad ? resolveFamily(ad, c.kategori) : null;
  const belirsiz = !ad || familySlug === null;
  const adSlug = familySlug ?? BELIRSIZ_SLUG;

  // Seviye2 bucket: Ad kolonunun normalize hali = ALT-AD.
  // (Karar #1'in dogal sonucu: Ad kolonu standart olunca alt-adlar zaten
  // veridir — ayri bir alt-ad sozlugu KURMAYA GEREK YOK.)
  const adBucket = normalizeText(ad);

  // Ad kolonunun token'lari — KOK ALINMIS, hicbiri atilmaz.
  // ("kompansatörü" → 'kompansator'; 'cekvalf' AYIRT EDICI olarak yasar)
  const adTokens = tokenize(ad);

  const cinsNorm = c.cins?.trim() ? normalizeText(c.cins) : null;
  const cinsTokens = tokenize(c.cins);

  // Baglanti KANONIKLESTIRILMEZ, ham normalize saklanir.
  // Sebep: extractConnection("döner flanşlı") → 'flans' doner "döner"i
  // KAYBEDER; PRD K3 tam da "döner flanşlı — X TL / sabit flanşlı — Y TL"
  // ayrimini istiyor. Eslestirme token ALT-KUMESI ile yapilir:
  //   teklif {flansli} ⊆ {doner,flansli} ✓ ve ⊆ {sabit,flansli} ✓ → K3 sorusu
  //   teklif {doner,flansli} ⊄ {sabit,flansli} ✗ → K4 sert filtre
  // Ayrica extractConnection "kaynak boyunlu"yu HIC tanimiyor (null doner) —
  // ham deger saklamak o kolonu da kurtarir.
  const baglantiNorm = c.baglanti?.trim() ? normalizeText(c.baglanti) : null;
  const baglantiTokens = tokenize(c.baglanti);

  const sizeClass = resolveProductSizeClass(ad, c.cins, c.kategori);
  const sizeInfo = c.cap?.trim() ? extractSizeInfo(c.cap) : null;
  // ON-HESAP: cevrim YAZMA aninda BIR KEZ. Sorgu aninda cevrim aranmaz.
  // 'DN65' ve '2 1/2"' ayni kanonik tabana iner (['dn65']) — teklif hangi
  // gosterimi kullanirsa kullansin indekste bulusurlar.
  const capTags = sizeInfo ? sizeEquivalents(sizeClass, sizeInfo).tags : [];
  const capNorm = sizeInfo?.display ?? (c.cap?.trim() ? normalizeText(c.cap) : null);

  const boyTag = buildBoyTag(c.boy);

  const displayName = [ad, c.cins?.trim(), c.baglanti?.trim(), c.cap?.trim()]
    .filter((p) => !!p)
    .join(' · ');

  const partial = { adBucket, cinsNorm, baglantiNorm, capNorm, boyTag };
  const rowKey = buildRowKey(c, partial);

  return {
    adSlug,
    adBucket,
    adTokens,
    cinsNorm,
    cinsTokens,
    baglantiNorm,
    baglantiTokens,
    sizeClass,
    capTags,
    capNorm,
    boyTag,
    displayName,
    rowKey,
    belirsiz,
    indexVersion: INDEX_VERSION,
  };
}
