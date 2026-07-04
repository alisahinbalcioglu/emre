/**
 * dwg-tagging — Manuel Etiketleme (User-Driven Layer Tagging) modulu.
 *
 * Otomatik cap atama (proximity) kaldirildi; bu modul yerine gecti:
 * kullanici cap kalemi tanimlar, boruya tiklar, cap dogrudan atanir.
 * DwgProjectWorkspace tek tuketici (composition root).
 */

export { default as BucketPanel } from './BucketPanel';
export { useTaggingStore, useActiveBucket } from './useTaggingStore';
export type { DiameterBucket } from './useTaggingStore';
