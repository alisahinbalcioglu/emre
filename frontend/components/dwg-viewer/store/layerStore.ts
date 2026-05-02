'use client';

/**
 * Zustand layer store — merkezi layer visibility state.
 *
 * Ana fikir: UI (LayerVisibilityPanel), Renderer (Mesh visibility),
 * ContextMenu (Hide/Isolate), ve Worker (filter) hepsi AYNI kaynaktan okur.
 *
 * Davranis:
 *   - Hidden + Isolate ortogonal degil: isolate aktifken sadece o layer
 *     gorunur, hidden set yok sayilir. isolate kapaninca hidden set yine etkin.
 *   - "Show All" hem hidden'i temizler hem isolate'i kapatir.
 *   - selectedEntityIds: tikla edilen entity (varsa group dahil); highlight icin.
 */

import { create } from 'zustand';

interface LayerStore {
  // ─── State ────────────────────────────────────────────────────
  allLayers: string[];
  hiddenLayers: Set<string>;
  isolatedLayer: string | null;
  /** Tiklanan entity'nin highlight'i. Tek entity veya equipment block grubu. */
  selectedEntityIds: Set<string>;
  /** Tiklanan entity'nin layer'i (UI'da "selected layer" gosterimi). */
  selectedLayer: string | null;

  // ─── Actions ──────────────────────────────────────────────────
  setAllLayers(layers: string[]): void;
  hideLayer(layer: string): void;
  showLayer(layer: string): void;
  toggleLayer(layer: string): void;
  isolateLayer(layer: string): void;
  clearIsolation(): void;
  showAll(): void;
  setSelected(layer: string | null, entityIds: string[]): void;
  clearSelection(): void;

  // ─── Computed ────────────────────────────────────────────────
  /** Renderer'a ne gosterilecegi sorulurken kullanilir. */
  isLayerVisible(layer: string): boolean;
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  allLayers: [],
  hiddenLayers: new Set<string>(),
  isolatedLayer: null,
  selectedEntityIds: new Set<string>(),
  selectedLayer: null,

  setAllLayers(layers) {
    set({ allLayers: layers });
  },

  hideLayer(layer) {
    set((s) => {
      if (s.hiddenLayers.has(layer)) return {};
      const next = new Set(s.hiddenLayers);
      next.add(layer);
      return { hiddenLayers: next };
    });
  },

  showLayer(layer) {
    set((s) => {
      if (!s.hiddenLayers.has(layer)) return {};
      const next = new Set(s.hiddenLayers);
      next.delete(layer);
      return { hiddenLayers: next };
    });
  },

  toggleLayer(layer) {
    const s = get();
    if (s.hiddenLayers.has(layer)) s.showLayer(layer);
    else s.hideLayer(layer);
  },

  isolateLayer(layer) {
    set({ isolatedLayer: layer });
  },

  clearIsolation() {
    set({ isolatedLayer: null });
  },

  showAll() {
    set({ hiddenLayers: new Set(), isolatedLayer: null });
  },

  setSelected(layer, entityIds) {
    set({
      selectedLayer: layer,
      selectedEntityIds: new Set(entityIds),
    });
  },

  clearSelection() {
    set({ selectedLayer: null, selectedEntityIds: new Set() });
  },

  isLayerVisible(layer) {
    const s = get();
    if (s.isolatedLayer !== null) return layer === s.isolatedLayer;
    return !s.hiddenLayers.has(layer);
  },
}));
