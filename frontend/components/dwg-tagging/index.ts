/**
 * dwg-tagging — Manuel Etiketleme (User-Driven Layer Tagging) modulu.
 *
 * Otomatik cap atama (proximity) kaldirildi; bu modul yerine gecti:
 * kullanici cap kalemi tanimlar, boruya tiklar, cap dogrudan atanir.
 * DwgProjectWorkspace tek tuketici (composition root).
 *
 * 25.09: kalem paneli (BucketPanel) kaldirildi — kalemler artik Adim 2'nin
 * gruplu cap listesinde (dwg-workspace/Adim2CapAta.tsx). Store aynen kalir.
 */

export { useTaggingStore, useActiveBucket } from './useTaggingStore';
export type { DiameterBucket } from './useTaggingStore';
