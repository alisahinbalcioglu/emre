// ────────────────────────────────────────────
// 3-ETIKET MODELI — gosterim turetici (Basitlestirilmis Nihai Kural §2)
// Her urun/satir 3 etikete ayristirilir: AD (aile+tip) · CINS (nitelik/
// varyant) · CAP (olcu). Ice aktarim onizlemesi bu etiketleri gosterir;
// AD cozulemezse satir isaretlenir, admin elle duzeltebilir (adOverride).
// ────────────────────────────────────────────

import { generateTags } from '../modules/matching/tag-generator';
import {
  TAG_LABELS, attrLabel, isAttrTag,
  KIND_TAGS, SURFACE_TAGS, CONNECTION_TAGS, MATERIAL_SUBTYPE_KEYS,
  MATERIAL_TYPE_TAGS,
} from '../modules/matching/shared-tag-matcher';
import { AD_DISPLAY } from '../modules/matching/ad-resolver';

/** AD (malzeme adi/ailesi) Turkce etiketleri — admin duzeltme dropdown'u da
 *  bu listeden secer. */
export const TYPE_LABELS_TR: Record<string, string> = {
  boru: 'Boru', vana: 'Vana', fitting: 'Fitting', flans: 'Flanş',
  izolasyon: 'İzolasyon', pompa: 'Pompa', radyator: 'Radyatör',
  kombi: 'Kombi', vitrifiye: 'Vitrifiye', armatur: 'Armatür',
  kablo: 'Kablo', pano: 'Pano', sigorta: 'Sigorta', kazan: 'Kazan',
  'dogalgaz-boru': 'Doğalgaz Borusu', montaj: 'Montaj',
  sprinkler: 'Sprinkler', hortum: 'Hortum',
  'akis-anahtari': 'Akış Anahtarı', 'akis-olcer': 'Akış Ölçer',
};

export interface Etiketler {
  /** AD gosterimi ("Küresel Vana", "Sprinkler") — cozulemezse null */
  ad: string | null;
  /** AD slug'i (materialType) — adOverride dogrulamasi da bu kumeden */
  adSlug: string | null;
  /** CINS gosterimi ("Doğalgaz · Dişli · 68°C · Pendent") — bos olabilir */
  cins: string;
  /** CAP gosterimi ("DN20", "32 mm", "500 mm") — yoksa null */
  cap: string | null;
}

export function deriveEtiketler(text: string): Etiketler {
  const tagged = generateTags(text);
  const vt = tagged.tags.filter((t) => t.startsWith('vt-'));

  const adSlug = tagged.materialType !== 'diger' ? tagged.materialType : null;
  const ad = adSlug
    ? (adSlug === 'vana' && vt.length > 0
        ? `${vt.map((t) => attrLabel(t)).join('/')} Vana`
        : TYPE_LABELS_TR[adSlug] ?? AD_DISPLAY.get(adSlug) ?? adSlug)
    : null;

  const sizeTag = tagged.tags.find((t) => /^dn\d+$/.test(t) || t.startsWith('od-'));
  const lenTag = tagged.tags.find((t) => t.startsWith('len-'));
  const cap = sizeTag
    ? (sizeTag.startsWith('od-') ? `${sizeTag.slice(3)} mm` : sizeTag.toUpperCase())
    : (lenTag ? attrLabel(lenTag) : null);

  const cinsParts = tagged.tags
    .filter((t) =>
      KIND_TAGS.has(t) || SURFACE_TAGS.has(t) || CONNECTION_TAGS.has(t)
      || /^pn\d+$/.test(t) || MATERIAL_SUBTYPE_KEYS.has(t)
      || (isAttrTag(t) && !t.startsWith('vt-') && !t.startsWith('len-')))
    .map((t) => TAG_LABELS[t] ?? attrLabel(t));

  return { ad, adSlug, cins: Array.from(new Set(cinsParts)).join(' · '), cap };
}

/** adOverride guvenli mi? (yalniz bilinen AD slug'lari) */
export function isValidAdOverride(slug: unknown): slug is string {
  return typeof slug === 'string' && MATERIAL_TYPE_TAGS.has(slug);
}
