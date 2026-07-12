/**
 * Shared tag-matching utility.
 * MatchingService (malzeme) ve LaborMatchingService (iscilik) tarafindan kullanilir.
 * Ortak tag kumelerini, aday filtreleme ve subtype elemesi mantigini toplar.
 */

import type { MatchCandidate } from './types';

// ═══════════════════════════════════════════
// TAG KUMELERI
// ═══════════════════════════════════════════

export const REFINE_TAGS = new Set<string>([
  // Yuzey
  'galvaniz', 'siyah', 'kirmizi', 'boyali',
  // Baglanti
  'disli', 'kaynakli', 'flans', 'pres', 'duz-uclu',
  // Malzeme cinsi
  'celik', 'pirinc', 'dokum', 'paslanmaz', 'bronz', 'aluminyum',
  'bakir', 'ppr', 'pvc', 'pe', 'hdpe',
]);

export const IGNORE_TAGS = new Set<string>([
  'diger', 'su', 'yangin', 'dogalgaz', 'steel',
]);

export const SURFACE_TAGS = new Set<string>([
  'galvaniz', 'siyah', 'kirmizi', 'boyali',
]);

export const KIND_TAGS = new Set<string>([
  'celik', 'pirinc', 'dokum', 'paslanmaz', 'bronz', 'aluminyum',
  'bakir', 'ppr', 'pvc', 'pe', 'hdpe',
]);

export const SURFACE_KIND_KEYS = new Set<string>([
  'galvaniz', 'siyah', 'kirmizi', 'boyali',
  'celik', 'pirinc', 'dokum', 'paslanmaz', 'bronz',
  'pvc', 'ppr', 'pe', 'hdpe', 'bakir', 'aluminyum',
]);

export const CONNECTION_TAGS = new Set<string>([
  'disli', 'kaynakli', 'flans', 'pres', 'duz-uclu',
]);

/** Baz subtype kumesi — material tarafi ek EN/DIN kodlari ekler. */
export const BASE_SUBTYPE_KEYS = new Set<string>([
  'basincli', 'kazan', 'sessiz', 'drenaj', 'pe-kapli',
  'folyo', 'kaucuk', 'camyunu', 'tasyunu', 'sprink',
  'yangin-dayanim', 'gofrajli', 'aluminyum-sac',
]);

export const MATERIAL_SUBTYPE_KEYS = new Set<string>([
  ...BASE_SUBTYPE_KEYS,
  'en10217', 'iso3183', 'din30670', 'en10255', 'din2605',
]);

export const POPULAR_MATERIALS = new Set<string>([
  'celik', 'pirinc', 'dokum', 'paslanmaz', 'galvaniz', 'siyah',
  'ppr', 'pvc', 'pe', 'bakir',
]);

/** V4 (PRD v1.3): varyant kimligi sayilan tag'ler — cins/yuzey/baglanti/PN/
 *  subtype. Grup ici otomatik atamada "ayni varyanti farkli capta bul" bu
 *  tag'lerle yapilir. Cap/tip tag'leri varyant DEGILDIR. */
export function isVariantTag(t: string): boolean {
  // E3: ekipman nitelikleri de varyant kimligidir (pendent+68°C sprinkler'i
  // farkli capta ararken korunur) — UZUNLUK haric (len satir bazli degisir,
  // cap gibi davranir; varyanta dahil edilirse grup yayilimi kilitlenir).
  const attrVariant = isAttrTag(t) && !/^len-\d+$/.test(t);
  return SURFACE_KIND_KEYS.has(t) || CONNECTION_TAGS.has(t) || /^pn\d+$/.test(t) || MATERIAL_SUBTYPE_KEYS.has(t) || attrVariant;
}

export const TAG_LABELS: Record<string, string> = {
  galvaniz: 'Galvanizli', siyah: 'Siyah', kirmizi: 'Kırmızı Boyalı', boyali: 'Boyalı',
  celik: 'Çelik', pirinc: 'Pirinç', dokum: 'Döküm', paslanmaz: 'Paslanmaz',
  bronz: 'Bronz', pvc: 'PVC', ppr: 'PPR', pe: 'PE', hdpe: 'HDPE',
  bakir: 'Bakır', aluminyum: 'Alüminyum',
  disli: 'Dişli Manşonlu', kaynakli: 'Kaynaklı', flans: 'Flanşlı',
  pres: 'Press', 'duz-uclu': 'Düz Uçlu',
};

// ═══════════════════════════════════════════
// HELPER: Excel tag'lerini parcala
// ═══════════════════════════════════════════

export interface SplitExcelTags {
  mustMatchTags: string[];
  refineTags: string[];
  excelSurfaces: string[];
  excelKinds: string[];
  /** CAP ESDEGERLIK KUMESI (PRD §6-7): doluysa aday bu tag'lerden EN AZ
   *  BIRINI tasimali. Celik DN↔inc / PPR DN↔mm cevrimi bu kumede birlesir
   *  (orn PPR "1\"" → ['od-32','dn32']). mustMatchTags'teki tekil cap tag'inin
   *  yerini alir — yalniz material matcher doldurur, labor 'legacy' etkilenmez. */
  sizeAnyOf?: string[];
}

/** Malzeme TIPI tag degerleri (extractMaterialType ciktilari) — must'ta kalir:
 *  tip uyusmazligi sessiz-yanlis eslesme uretir (boru yerine vana).
 *  E1 (Boru Disi Kalemler PRD): ekipman aileleri de tip=must ile KILITLENIR —
 *  sprinkler satirina Fan-Coil hortumu hicbir skorla aday olamaz. */
export const MATERIAL_TYPE_TAGS = new Set<string>([
  'boru', 'vana', 'fitting', 'flans', 'izolasyon', 'pompa', 'radyator',
  'kombi', 'vitrifiye', 'armatur', 'kablo', 'pano', 'sigorta', 'kazan',
  'dogalgaz-boru', 'montaj',
  'sprinkler', 'hortum', 'akis-anahtari', 'akis-olcer',
]);

/** E1: ekipman aileleri — cap zorunlulugu gevser (H3: uzunlukla eslesir),
 *  DN cevrimi celik tablosuyla yapilir (H4: DN 65 → 2 1/2"). */
export const EQUIPMENT_TYPE_TAGS = new Set<string>([
  'sprinkler', 'hortum', 'akis-anahtari', 'akis-olcer',
]);

// ── E3: EKIPMAN NITELIK TAG'LERI (temp-68, k-80, pendent, len-500, aks-*) ──

export function isAttrTag(t: string): boolean {
  return /^temp-\d+$/.test(t) || /^k-\d+$/.test(t) || /^len-\d+$/.test(t)
    || t === 'pendent' || t === 'upright' || t === 'sidewall' || t.startsWith('aks-');
}

/** Nitelik tag'inin kullaniciya gosterilecek hali. */
export function attrLabel(t: string): string {
  if (t.startsWith('temp-')) return `${t.slice(5)}°C`;
  if (t.startsWith('k-')) return `K=${t.slice(2)}`;
  if (t.startsWith('len-')) return `${t.slice(4)} mm`;
  if (t === 'pendent') return 'Pendent (asma tavan)';
  if (t === 'upright') return 'Upright (dik)';
  if (t === 'sidewall') return 'Sidewall (duvar)';
  if (t === 'aks-rozet') return 'Rozetli';
  return t;
}

/** E3: nitelik KATEGORISI — ayni kategoride farkli deger = fark uyarisi
 *  ("68°C istendi — bu ürün 141°C"). */
function attrCategory(t: string): string | null {
  if (/^temp-\d+$/.test(t)) return 'temp';
  if (/^k-\d+$/.test(t)) return 'k';
  if (/^len-\d+$/.test(t)) return 'len';
  if (t === 'pendent' || t === 'upright' || t === 'sidewall') return 'mount';
  return null;
}

/** Aday, istenen niteligi FARKLI degerle tasiyorsa uyari metni uretir. */
export function buildAttrUyari(excelTags: string[], candidateTags: string[]): string | null {
  const wanted = new Map<string, string>();
  for (const t of excelTags) {
    const cat = attrCategory(t);
    if (cat && !wanted.has(cat)) wanted.set(cat, t);
  }
  if (wanted.size === 0) return null;
  const notes: string[] = [];
  for (const t of candidateTags) {
    const cat = attrCategory(t);
    if (!cat) continue;
    const want = wanted.get(cat);
    if (want && want !== t) {
      notes.push(`${attrLabel(want)} istendi — bu ürün ${attrLabel(t)}`);
    }
  }
  return notes.length > 0 ? notes.join(' · ') : null;
}

/**
 * PRD Adim 4 (material modu): SERT FILTRE = OLCU + TIP.
 * Geri kalan HER tag (et kalinligi, dis cap, standart, PN, subtype, cins,
 * baglanti, yuzey) REFINE'a gider — "eksik kriter = filtre degil, fazla
 * kriter = bonus". Eski davranista et-2.6 gibi kaynak-ozel tag'ler adayda
 * bulunmayinca SESSIZCE eliyordu.
 * mode 'legacy' (default): eski davranis — labor matcher bunu kullanir.
 */
export function splitExcelTags(excelTags: string[], mode: 'legacy' | 'material' = 'legacy'): SplitExcelTags {
  if (mode === 'material') {
    const isMust = (t: string) =>
      t.startsWith('dn') || t.startsWith('od-') || MATERIAL_TYPE_TAGS.has(t);
    return {
      mustMatchTags: excelTags.filter((t) => isMust(t) && !IGNORE_TAGS.has(t)),
      refineTags: excelTags.filter((t) => !isMust(t) && !IGNORE_TAGS.has(t)),
      excelSurfaces: excelTags.filter((t) => SURFACE_TAGS.has(t)),
      excelKinds: excelTags.filter((t) => KIND_TAGS.has(t)),
    };
  }
  return {
    mustMatchTags: excelTags.filter((t) => !REFINE_TAGS.has(t) && !IGNORE_TAGS.has(t)),
    refineTags: excelTags.filter((t) => REFINE_TAGS.has(t)),
    excelSurfaces: excelTags.filter((t) => SURFACE_TAGS.has(t)),
    excelKinds: excelTags.filter((t) => KIND_TAGS.has(t)),
  };
}

// ═══════════════════════════════════════════
// HELPER: Aday skorlama
// ═══════════════════════════════════════════

export interface ScoredCandidate<T> {
  priceItem: T;
  mustScore: number;
  refineScore: number;
  totalScore: number;
}

/**
 * priceItem listesini Excel tag'leriyle filtreler ve skorlar.
 * `getTags` fonksiyonu her priceItem icin DB tag dizisini dondurur.
 * Tag yok veya must-match tamamlanmamissa ele.
 */
export function scoreCandidates<T>(
  priceItems: T[],
  getTags: (item: T) => string[] | undefined,
  split: SplitExcelTags,
): ScoredCandidate<T>[] {
  const { mustMatchTags, refineTags, excelSurfaces, excelKinds } = split;
  const out: ScoredCandidate<T>[] = [];

  for (const priceItem of priceItems) {
    const dbTags = getTags(priceItem);
    if (!dbTags || dbTags.length === 0) continue;

    // CAP ESDEGERLIGI (PRD §6-7): kume doluysa aday en az birini tasimali.
    let sizeMatched = 0;
    if (split.sizeAnyOf && split.sizeAnyOf.length > 0) {
      if (!split.sizeAnyOf.some((t) => dbTags.includes(t))) continue;
      sizeMatched = 1;
    }

    // Zorunlu etiketler: TAMAMI eslesmeli
    let mustMatched = sizeMatched;
    let mustMissing = 0;
    for (const tag of mustMatchTags) {
      if (dbTags.includes(tag)) mustMatched++;
      else mustMissing++;
    }
    if (mustMissing > 0) continue;

    // Yuzey: Excel'de yuzey varsa DB'de FARKLI yuzey olmamali
    if (excelSurfaces.length > 0) {
      const dbSurfaces = dbTags.filter((t) => SURFACE_TAGS.has(t));
      if (dbSurfaces.length > 0) {
        const hasMatchingSurface = excelSurfaces.some((s) => dbSurfaces.includes(s));
        if (!hasMatchingSurface) continue;
      }
    }

    // Cins: ayni mantik
    if (excelKinds.length > 0) {
      const dbKinds = dbTags.filter((t) => KIND_TAGS.has(t));
      if (dbKinds.length > 0) {
        const hasMatchingKind = excelKinds.some((k) => dbKinds.includes(k));
        if (!hasMatchingKind) continue;
      }
    }

    // Refine etiketler: bonus
    let refineMatched = 0;
    for (const tag of refineTags) {
      if (dbTags.includes(tag)) refineMatched++;
    }

    out.push({
      priceItem,
      mustScore: mustMatched,
      refineScore: refineMatched,
      totalScore: mustMatched + refineMatched,
    });
  }

  return out;
}

// ═══════════════════════════════════════════
// HELPER: Subtype elemesi + otomatik Disli
// ═══════════════════════════════════════════

/**
 * Top aday listesini alir, subtype elemesi + otomatik-Disli mantigini uygular.
 * Donen liste 1 kisa veya devam eden coklu adaylari icerir.
 *
 * autoPick=false (Duzeltme Talebi K1/K2, material matcher): yuzey/cins farki
 * olmasa bile OTOMATIK SECIM YASAK — baglanti (disli/duz-uclu) ve ad-farki
 * varyantlari da kullaniciya fiyatli listeyle sorulur. Labor matcher eski
 * davranisi (autoPick=true) korur.
 */
export function narrowTopCandidates<T>(
  topCandidates: ScoredCandidate<T>[],
  excelTags: string[],
  getTags: (item: T) => string[],
  subtypeKeys: Set<string> = MATERIAL_SUBTYPE_KEYS,
  autoPick: boolean = true,
): { narrowed: ScoredCandidate<T>[]; autoPickedDisli: boolean } {
  if (topCandidates.length <= 1) {
    return { narrowed: topCandidates, autoPickedDisli: false };
  }

  const allTags = topCandidates.map((c) => new Set(getTags(c.priceItem)));
  const commonTags = new Set<string>(allTags[0]);
  for (const ts of allTags) {
    for (const t of Array.from(commonTags)) {
      if (!ts.has(t)) commonTags.delete(t);
    }
  }
  const diffTagsPerCandidate = topCandidates.map((c) =>
    getTags(c.priceItem).filter((t) => !commonTags.has(t)),
  );

  // 1. Excel'de subtype yoksa → subtype'li adaylari ele
  let narrowed = topCandidates;
  const excelHasSubtype = excelTags.some((t) => subtypeKeys.has(t));
  if (!excelHasSubtype) {
    const filtered = narrowed.filter((c) => !getTags(c.priceItem).some((t) => subtypeKeys.has(t)));
    if (filtered.length > 0 && filtered.length < narrowed.length) {
      narrowed = filtered;
    }
  }

  // 2. Yuzey/cins farki yoksa → otomatik Disli (yoksa ilki).
  // YALNIZ autoPick=true iken (labor). Material tarafinda K2: belirsizken
  // otomatik fiyat yazmak YASAK — coklu aday popup'a gider.
  const hasSurfaceKindDiff = diffTagsPerCandidate.some((diff) =>
    diff.some((t) => SURFACE_KIND_KEYS.has(t)),
  );

  let autoPickedDisli = false;
  if (autoPick && !hasSurfaceKindDiff) {
    const disliCandidate = narrowed.find((c) => getTags(c.priceItem).includes('disli'));
    if (disliCandidate) {
      narrowed = [disliCandidate];
      autoPickedDisli = true;
    } else {
      narrowed = [narrowed[0]];
    }
  }

  return { narrowed, autoPickedDisli };
}

// ═══════════════════════════════════════════
// HELPER: Multi-candidate label olusturma
// ═══════════════════════════════════════════

export interface BuildCandidatesOptions<T> {
  /** Her priceItem icin net/list/discount hesaplar. */
  calcPrice: (item: T) => { netPrice: number; listPrice: number; discount: number };
  /** Her priceItem icin gosterilecek malzeme adi. */
  getName: (item: T) => string;
  /** Her priceItem icin tag listesi. */
  getTags: (item: T) => string[];
  /** Label uretirken yuzey/cins seviyesi surfaceLevel=true yapilsin mi (material=true, labor=false). */
  useSurfaceLevelLabels: boolean;
  /** E3: satirin tag'leri — aday nitelik FARKI tasiyorsa uyari uretilir
   *  ("68°C istendi — bu ürün 141°C"). */
  excelTags?: string[];
}

export function buildCandidateList<T>(
  topCandidates: ScoredCandidate<T>[],
  opts: BuildCandidatesOptions<T>,
): MatchCandidate[] {
  const { calcPrice, getName, getTags, useSurfaceLevelLabels, excelTags } = opts;

  const allTagSets = topCandidates.map((c) => new Set(getTags(c.priceItem)));
  const commonTags = new Set<string>(allTagSets[0]);
  for (const ts of allTagSets) {
    for (const t of Array.from(commonTags)) {
      if (!ts.has(t)) commonTags.delete(t);
    }
  }

  const candidates: MatchCandidate[] = topCandidates.map((c) => {
    const tags = getTags(c.priceItem);
    const diffTags = tags.filter((t) => !commonTags.has(t));
    const popular = tags.some((t) => POPULAR_MATERIALS.has(t));
    const price = calcPrice(c.priceItem);
    const name = getName(c.priceItem);

    let label: string;
    let surfaceLevel = false;

    if (useSurfaceLevelLabels) {
      // N6: "Kirmizi Boyali" + "Boyali" ayni etikette TEKRARLIYORDU
      // ("Kırmızı Boyalı Boyalı") — kirmizi zaten boyayi soyler, boyali dusulur.
      let surfaceKinds = diffTags.filter((t) => SURFACE_KIND_KEYS.has(t));
      if (surfaceKinds.includes('kirmizi')) {
        surfaceKinds = surfaceKinds.filter((t) => t !== 'boyali');
      }
      const connections = diffTags.filter((t) => CONNECTION_TAGS.has(t));
      // E3: ekipman nitelik farklari da etikette gorunur ("141°C Pendent")
      const attrs = diffTags.filter((t) => isAttrTag(t));
      surfaceLevel = surfaceKinds.length > 0;
      const labelParts = [
        ...surfaceKinds.map((t) => TAG_LABELS[t] ?? t),
        ...connections.map((t) => TAG_LABELS[t] ?? t),
        ...attrs.map((t) => attrLabel(t)),
      ];
      label = labelParts.length > 0 ? labelParts.join(' ') : name.slice(0, 40);
    } else {
      label = diffTags.join(' ') || name.slice(0, 40);
    }

    return {
      materialName: name,
      netPrice: price.netPrice,
      listPrice: price.listPrice,
      discount: price.discount,
      tags,
      popular,
      label,
      surfaceLevel,
      // V4: varyant kimligi — diff tag'lerin anlamli alt kumesi (kutuphaneden
      // dinamik turetilir, sabit liste yok — PRD v1.3 V0 genellik ilkesi)
      variantTags: diffTags.filter(isVariantTag),
      // E3: istenen nitelikten FARKLI deger tasiyan aday isaretlenir
      uyari: excelTags ? buildAttrUyari(excelTags, tags) ?? undefined : undefined,
    };
  });

  candidates.sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  return candidates;
}
