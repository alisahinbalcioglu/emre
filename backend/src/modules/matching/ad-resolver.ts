// ────────────────────────────────────────────
// AD COZUCU (3 Etiket Modeli — Excel sozluk seed'i uzerinde)
// Regex TYPE_PATTERNS tip cozemediginde ('diger') devreye girer:
// normalize contains + EN UZUN desen kazanir (TerminologyAlias S2 ile ayni).
// AD_SOZLUGU'ndaki YENI aile slug'lari MATERIAL_TYPE_TAGS'e katilir —
// boylece AD kilidi (must) sozluk aileleri icin de calisir.
// ────────────────────────────────────────────

import { AD_SOZLUGU, AD_ZENGINLESTIRME, AdSozlukGirdisi } from './ad-cins-sozlugu';
import { normalizeText } from './normalizer';

const ALL: AdSozlukGirdisi[] = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME];

// Desen → slug, uzunluk sirali (en uzun once — "klima santrali" > "klima")
const PATTERNS: { p: string; slug: string }[] = ALL
  .flatMap((e) => e.patterns.filter((p) => p.length >= 3).map((p) => ({ p, slug: e.slug })))
  .sort((a, b) => b.p.length - a.p.length);

/** Yanlis-pozitif korumalari: desen → metinde gecmemesi gereken kelime. */
const NEGATIVE_GUARDS: Record<string, RegExp> = {
  // "kanalizasyon" hava kanali DEGILDIR (pis su regex/alias'i sahibi)
  kanal: /kanalizasyon/,
};

/** Yeni aile slug'lari (regex disinda sozlukten gelenler) — tip=must kilidi. */
export const AD_YENI_SLUGS: ReadonlySet<string> = new Set(AD_SOZLUGU.map((e) => e.slug));

/** DN'li sozluk aileleri — celik DN↔inc cevrimi uygulanir (metalTypeClass). */
export const AD_DNLI_SLUGS: ReadonlySet<string> = new Set(
  AD_SOZLUGU.filter((e) => e.dnli).map((e) => e.slug),
);

/** slug → gosterim adi (3-Etiket onizleme AD kolonu). */
export const AD_DISPLAY: ReadonlyMap<string, string> = new Map(
  AD_SOZLUGU.map((e) => [e.slug, e.ad]),
);

export function resolveAd(text: string): string | null {
  const norm = normalizeText(text);
  for (const { p, slug } of PATTERNS) {
    if (!norm.includes(p)) continue;
    const guard = NEGATIVE_GUARDS[slug];
    if (guard && guard.test(norm)) continue;
    return slug;
  }
  return null;
}
