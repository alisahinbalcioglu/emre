/**
 * ADAY AYIRT EDICILIGI + NITELIK BAGLAMI — PU1-PU7
 * PRD: PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md §Bolum D
 *
 * ⚠ BU DOSYA SU AN "BUGUNKU DAVRANIS" ISKELETIDIR (KIRMIZI TABAN).
 * Kok neden raporunda (FAZ0_STANDART_SEMA_KOK_NEDEN.md §B) OLCULEN iki hata
 * burada BILEREK yeniden uretilir ki kabul testleri once KIRMIZI kossun:
 *
 *   B.1 — `niteliklerdenBaglam`: bugun satirin ALTINDAKI nitelik satirlari
 *         sorgu baglamina HIC girmiyor (ExcelGrid.tsx:1040 yalniz yukari
 *         tarar) → bos baglam doner.
 *   B.2 — `adayEtiketleri`: bugun aday adi 60 karakterde kesiliyor
 *         (ExcelGrid.tsx:568) → ayirt edici alan (DN) gorunmez.
 *
 * Duzeltme bu iki govdeyi degistirecek; testler DEGISMEYECEK.
 */

export interface SatirGirdi {
  /** Malzeme adi sutunundaki metin */
  ad: string;
  /** Satir bir VERI (malzeme) satiri mi? */
  veri: boolean;
}

export interface NitelikBaglami {
  /** "Çap : DN 250" → "DN 250" (yoksa null) */
  cap: string | null;
  /** { "Basınç Sınıfı": "175 psi", "Bağlantı Türü": "Flanşlı", … } */
  nitelikler: Record<string, string>;
  /** Toplamanin bittigi son nitelik satirinin indeksi (yoksa -1) */
  sonNitelikSatiri: number;
}

export interface AdayGirdi {
  materialName: string;
  netPrice: number;
}

export interface AdayEtiketi {
  /** PU3: ONDE gosterilecek ayirt edici alan ("DN100 · PN16 · flanşlı") */
  ayirtEdici: string;
  /** PU3b: urun tam adi — KESILMEZ */
  ad: string;
  netPrice: number;
  /** PU7: ayni gorunum + farkli fiyat → veri sorunu isareti */
  veriSorunu: boolean;
}

/** "Çap : DN 250" → { anahtar: 'Çap', deger: 'DN 250' } (nitelik degilse null) */
function nitelikAyristir(metin: string): { anahtar: string; deger: string } | null {
  const s = String(metin ?? '').replace(/\s+/g, ' ').trim();
  // Anahtar : Deger — anahtar kisa (<=24) ve harfle baslar; deger bos olamaz.
  const m = /^([^:]{2,24}?)\s*:\s*(.+)$/.exec(s);
  if (!m) return null;
  const anahtar = m[1].trim();
  // "- Vana Gövdesi : Dökme Demir" gibi ic-anahtarli devamlarda bas tireyi at
  const deger = m[2].replace(/^[-–—\s]+/, '').trim();
  if (!anahtar || !deger) return null;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(anahtar)) return null;
  return { anahtar, deger };
}

const CAP_ANAHTARI = /^(çap|cap|ölçü|olcu|boyut|dn)$/i;

/**
 * PU1: Bir malzeme satirinin ALTINDAKI nitelik satirlarindan sorgu baglamini
 * kurar (cap · basinc · baglanti · govde …).
 *
 * KOK NEDEN (FAZ0 §B.1): YILDIZ'da malzeme satiri "Yükselen Milli Vana (OS&Y
 * Valve)" iken CAP bir ALT satirdadir ("Çap : DN 250"). Eski baglam kurucu
 * yalniz YUKARI (baslik) bakiyordu → sorguda cap yok → sert cap filtresinin
 * filtreleyecek verisi yok → urunun TUM caplari aday kaliyordu.
 */
export function niteliklerdenBaglam(satirlar: SatirGirdi[], idx: number): NitelikBaglami {
  const nitelikler: Record<string, string> = {};
  let cap: string | null = null;
  let sonNitelikSatiri = -1;

  for (let i = idx + 1; i < satirlar.length; i++) {
    const s = satirlar[i];
    if (!s) break;
    // Bir sonraki MALZEME satirinda dur — nitelikler komsu kaleme SIZAMAZ
    if (s.veri) break;
    const n = nitelikAyristir(s.ad);
    if (!n) continue; // nitelik kalibina uymayan devam metni atlanir
    sonNitelikSatiri = i;
    if (cap === null && CAP_ANAHTARI.test(n.anahtar)) { cap = n.deger; continue; }
    if (nitelikler[n.anahtar] === undefined) nitelikler[n.anahtar] = n.deger;
  }
  return { cap, nitelikler, sonNitelikSatiri };
}

/** Urun adini bilesenlerine ayir: "A · B · DN100" → ['A','B','DN100'] */
const parcala = (ad: string): string[] =>
  String(ad ?? '').split(/\s*[·|]\s*|\s{2,}/).map((p) => p.trim()).filter(Boolean);

/** Cap benzeri bilesen mi? (DN100 · 4" · Ø50 · 1 1/4") */
const capParcasiMi = (p: string): boolean =>
  /^(dn\s*\d+|ø\s*\d+|\d+\s*\/\s*\d+\s*["']?|\d+\s*["']|\d+\s*mm)$/i.test(p.trim());

/**
 * PU2/PU3/PU7: Aday listesi etiketleri — iki satir asla ayni gorunemez.
 *
 * KOK NEDEN (FAZ0 §B.2): kutuphane adlari capi SONA koyuyor
 * ("… · flanşlı · DN100", 80 karakter) ama popup adi 60 KARAKTERDE kesiyordu
 * → DN65/DN80/DN100 ekranda BIREBIR AYNI goruniyordu.
 *
 * Yeni kural: adaylarin FARKLILASTIGI bilesenler one cikarilir (cap once),
 * ad KESILMEZ. Fark hic bulunamiyorsa (ayni ad + farkli fiyat) satir "veri
 * sorunu" olarak isaretlenir — PU7: aciklanamayan fark ayri aday olarak
 * sunulmaz.
 */
export function adayEtiketleri(adaylar: AdayGirdi[]): AdayEtiketi[] {
  const parcalar = adaylar.map((a) => parcala(a.materialName));
  // Konum bazli degil, KUME bazli fark: bir bilesen tum adaylarda ayni ise
  // ayirt edici degildir.
  const tumu = new Map<string, number>();
  // NOT: Set spread/iterasyon YASAK — frontend tsconfig'inde `target` yok,
  // TS2802 verir ve CI'daki `tsc --noEmit` kapisi kirilir.
  for (const p of parcalar) for (const x of Array.from(new Set(p))) tumu.set(x, (tumu.get(x) ?? 0) + 1);
  const ortak = (x: string) => (tumu.get(x) ?? 0) === adaylar.length;

  return adaylar.map((a, i) => {
    const farkli = parcalar[i].filter((x) => !ortak(x));
    // PU3: ayirt edici nitelik BUYUK ve ONDE — cap her zaman ilk sirada
    const cap = farkli.filter(capParcasiMi);
    const digerleri = farkli.filter((x) => !capParcasiMi(x));
    const ayirtEdici = [...cap, ...digerleri].join(' · ');
    // PU7: ayni ad + farkli fiyat → fark aciklanamiyor
    const ikizi = adaylar.some((b, j) => j !== i && b.materialName === a.materialName && b.netPrice !== a.netPrice);
    return {
      ayirtEdici: ayirtEdici || (ikizi ? '⚠ fark açıklanamıyor' : ''),
      ad: a.materialName, // PU3b: KESILMEZ
      netPrice: a.netPrice,
      veriSorunu: ikizi,
    };
  });
}

// ── PU4: aday popup genislik tercihi ────────────────────────────────────
// KOK NEDEN (31.07): ExcelGrid anahtari yalnizca OKUYORDU, yazan tek satir
// yoktu — kullanici popup'i genisletse de bir sonraki popup yine 520px
// aciliyordu. Okuma/yazma buraya alindi ki sozlesme sinanabilsin.

export const PU4_ANAHTAR = 'metaprice.adayPopupGenislik';
export const PU4_VARSAYILAN = 520;
/** Bundan dar bir tercih kaydedilmez (popup okunamaz hale gelirdi). */
export const PU4_ASGARI = 360;

type Depo = Pick<Storage, 'getItem' | 'setItem'>;
const varsayilanDepo = (): Depo | null =>
  (typeof window === 'undefined' ? null : window.localStorage);

/** Kayitli genislik tercihi; yoksa/bozuksa/dar ise varsayilan. */
export function popupGenisligiOku(depo: Depo | null = varsayilanDepo()): number {
  if (!depo) return PU4_VARSAYILAN;
  try {
    const k = Number(depo.getItem(PU4_ANAHTAR));
    return Number.isFinite(k) && k >= PU4_ASGARI ? k : PU4_VARSAYILAN;
  } catch {
    return PU4_VARSAYILAN; // private mode
  }
}

/** Tercihi kaydeder. Yazildiysa true — asgarinin alti SESSIZCE atilmaz, false doner. */
export function popupGenisligiYaz(genislik: number, depo: Depo | null = varsayilanDepo()): boolean {
  if (!depo || !Number.isFinite(genislik) || genislik < PU4_ASGARI) return false;
  try {
    depo.setItem(PU4_ANAHTAR, String(Math.round(genislik)));
    return true;
  } catch {
    return false; // private mode / kota
  }
}
