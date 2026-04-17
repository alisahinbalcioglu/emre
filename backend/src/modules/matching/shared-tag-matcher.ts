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
}

export function splitExcelTags(excelTags: string[]): SplitExcelTags {
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

    // Zorunlu etiketler: TAMAMI eslesmeli
    let mustMatched = 0;
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
 */
export function narrowTopCandidates<T>(
  topCandidates: ScoredCandidate<T>[],
  excelTags: string[],
  getTags: (item: T) => string[],
  subtypeKeys: Set<string> = MATERIAL_SUBTYPE_KEYS,
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

  // 2. Yuzey/cins farki yoksa → otomatik Disli (yoksa ilki)
  const hasSurfaceKindDiff = diffTagsPerCandidate.some((diff) =>
    diff.some((t) => SURFACE_KIND_KEYS.has(t)),
  );

  let autoPickedDisli = false;
  if (!hasSurfaceKindDiff) {
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
}

export function buildCandidateList<T>(
  topCandidates: ScoredCandidate<T>[],
  opts: BuildCandidatesOptions<T>,
): MatchCandidate[] {
  const { calcPrice, getName, getTags, useSurfaceLevelLabels } = opts;

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
      const surfaceKinds = diffTags.filter((t) => SURFACE_KIND_KEYS.has(t));
      const connections = diffTags.filter((t) => CONNECTION_TAGS.has(t));
      surfaceLevel = surfaceKinds.length > 0;
      const labelParts = [
        ...surfaceKinds.map((t) => TAG_LABELS[t] ?? t),
        ...connections.map((t) => TAG_LABELS[t] ?? t),
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
    };
  });

  candidates.sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  return candidates;
}
