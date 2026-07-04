'use client';

/**
 * useTaggingStore — Manuel Etiketleme (User-Driven Layer Tagging) Zustand store'u.
 *
 * PRD/Operasyon karari: otomatik cap atama (proximity) KALDIRILDI. Kullanici
 * "cap kalemi" (bucket) tanimlar, aktif kalemi secer, cizimde boruya tiklar —
 * o segmentin diameter'i dogrudan kalemin capiyla guncellenir.
 *
 * NEDEN ZUSTAND (Context/Redux degil):
 *  - Canvas viewer yuksek frekansli etkilesim alani: Context her tiklamada
 *    47KB'lik workspace agacini re-render ederdi. Zustand selector aboneligi
 *    ile yalniz bucket paneli guncellenir.
 *  - persist middleware localStorage senkronunu bedavaya verir (mevcut
 *    metaprice_dwg_ws_* deseninin kardesi).
 *
 * MIMARI KARAR: bucket ATAMASI ayri bir map'te TUTULMAZ — dogrudan mevcut
 * calculatedLayers[].edgeSegments[].diameter alanina yazilir (workspace
 * updateEdgeSegmentDiameter ile). Boylece lejant, metraj, Excel, quote ve
 * renklendirme SIFIR degisiklikle calisir. Bucket = "eldeki aktif kalem".
 *
 * RENK: bucket rengi diameterToColor'dan turetilir — lejant ve viewer ile
 * birebir ayni palet. Kullaniciya ozel renk secimi bilerek yok: ayni cap
 * her yerde ayni renk olmali (gorsel tutarlilik).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { diameterToColor, canonicalizeDiameter } from '@/components/dwg-metraj/diameter-colors';

export interface DiameterBucket {
  id: string;
  /** Canonical cap etiketi — '1 1/4"' ve '1¼"' tek kaleme normalize edilir. */
  diameter: string;
  /** diameterToColor(diameter) — lejant/viewer paletiyle birebir ayni. */
  color: string;
  createdAt: number;
}

interface TaggingStore {
  buckets: DiameterBucket[];
  activeBucketId: string | null;
  /** Kalem ekle (dedupe canonical form ile). Basarili olursa yeni kalem AKTIF olur. */
  addBucket: (rawDiameter: string) => { ok: boolean; reason?: string };
  removeBucket: (id: string) => void;
  /** Ayni kaleme tekrar tiklaninca deaktive olur (toggle). */
  toggleActiveBucket: (id: string) => void;
  clearActiveBucket: () => void;
}

function _newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useTaggingStore = create<TaggingStore>()(
  persist(
    (set, get) => ({
      buckets: [],
      activeBucketId: null,

      addBucket: (rawDiameter: string) => {
        const trimmed = rawDiameter.trim();
        if (!trimmed) return { ok: false, reason: 'Çap boş olamaz' };
        const canonical = canonicalizeDiameter(trimmed);
        if (get().buckets.some((b) => b.diameter === canonical)) {
          return { ok: false, reason: `"${canonical}" kalemi zaten var` };
        }
        const bucket: DiameterBucket = {
          id: _newId(),
          diameter: canonical,
          color: diameterToColor(canonical),
          createdAt: Date.now(),
        };
        set((s) => ({ buckets: [...s.buckets, bucket], activeBucketId: bucket.id }));
        return { ok: true };
      },

      removeBucket: (id: string) => {
        set((s) => ({
          buckets: s.buckets.filter((b) => b.id !== id),
          activeBucketId: s.activeBucketId === id ? null : s.activeBucketId,
        }));
      },

      toggleActiveBucket: (id: string) => {
        set((s) => ({ activeBucketId: s.activeBucketId === id ? null : id }));
      },

      clearActiveBucket: () => set({ activeBucketId: null }),
    }),
    {
      name: 'metaprice_dwg_buckets',
      // SSR guard: Next.js client component'leri server'da da pre-render eder,
      // Node'da localStorage yok — no-op storage ile hydration client'a kalir.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? window.localStorage
          : ({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage),
      ),
    },
  ),
);

/** Aktif kalemi (bucket) selector ile al — yalniz ilgili bilesen re-render olur. */
export function useActiveBucket(): DiameterBucket | null {
  return useTaggingStore(
    (s) => s.buckets.find((b) => b.id === s.activeBucketId) ?? null,
  );
}
