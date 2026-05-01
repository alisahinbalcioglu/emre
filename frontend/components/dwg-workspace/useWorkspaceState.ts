'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  WorkspaceState,
  LayerConfig,
  CalculatedLayer,
  MarkedEquipment,
} from './types';

const emptyConfig = (): LayerConfig => ({
  hatIsmi: '',
  materialType: '',
  defaultDiameter: '',
});

/**
 * Workspace state yonetimi — layer secimleri, hesaplanmis metrajlar,
 * isaretlenmis ekipmanlar.
 */
export function useWorkspaceState(fileId: string, scale: number) {
  const [state, setState] = useState<WorkspaceState>({
    fileId,
    scale,
    selectedLayer: null,
    layerConfigs: {},
    calculatedLayers: {},
    markedEquipments: {},
    editingEquipmentKey: null,
    sprinklerLayers: [],
    lastClickedLayer: null,
    useAiDiameter: false,
    hiddenLayers: [],
  });

  // fileId degistiginde tum workspace state'i sifirla — eski dosyanin hesaplamalari
  // yeni dosyaya karismasin.
  useEffect(() => {
    setState({
      fileId, scale,
      selectedLayer: null,
      layerConfigs: {},
      calculatedLayers: {},
      markedEquipments: {},
      editingEquipmentKey: null,
      sprinklerLayers: [],
      lastClickedLayer: null,
      useAiDiameter: false,
      hiddenLayers: [],
    });
  }, [fileId, scale]);

  const selectLayer = useCallback((layer: string) => {
    setState((s) => {
      // Zaten seciliyse (tekrar tikla), secimi temizle (toggle)
      if (s.selectedLayer === layer) {
        return { ...s, selectedLayer: null };
      }
      // Ilk kez tikliyorsa config bas
      const configs = s.layerConfigs[layer] ? s.layerConfigs : { ...s.layerConfigs, [layer]: emptyConfig() };
      return { ...s, selectedLayer: layer, layerConfigs: configs };
    });
  }, []);

  const updateLayerConfig = useCallback((layer: string, patch: Partial<LayerConfig>) => {
    setState((s) => ({
      ...s,
      layerConfigs: {
        ...s.layerConfigs,
        [layer]: { ...(s.layerConfigs[layer] ?? emptyConfig()), ...patch },
      },
    }));
  }, []);

  const addCalculatedLayer = useCallback((calculated: CalculatedLayer) => {
    setState((s) => ({
      ...s,
      calculatedLayers: { ...s.calculatedLayers, [calculated.layer]: calculated },
      selectedLayer: null,  // hesaplama bitince secimi serbest birak
    }));
  }, []);

  const removeCalculatedLayer = useCallback((layer: string) => {
    setState((s) => {
      const { [layer]: _, ...rest } = s.calculatedLayers;
      return { ...s, calculatedLayers: rest };
    });
  }, []);

  const updateEdgeSegmentDiameter = useCallback((layer: string, segmentId: number, newDiameter: string) => {
    setState((s) => {
      const cl = s.calculatedLayers[layer];
      if (!cl) return s;
      return {
        ...s,
        calculatedLayers: {
          ...s.calculatedLayers,
          [layer]: {
            ...cl,
            edgeSegments: cl.edgeSegments.map((es) =>
              es.segment_id === segmentId ? { ...es, diameter: newDiameter } : es
            ),
          },
        },
      };
    });
  }, []);

  const beginEditEquipment = useCallback((key: string) => {
    setState((s) => ({ ...s, editingEquipmentKey: key }));
  }, []);

  const cancelEditEquipment = useCallback(() => {
    setState((s) => ({ ...s, editingEquipmentKey: null }));
  }, []);

  const saveEquipment = useCallback((eq: MarkedEquipment) => {
    setState((s) => ({
      ...s,
      markedEquipments: { ...s.markedEquipments, [eq.key]: eq },
      editingEquipmentKey: null,
    }));
  }, []);

  const removeEquipment = useCallback((key: string) => {
    setState((s) => {
      const { [key]: _, ...rest } = s.markedEquipments;
      return { ...s, markedEquipments: rest };
    });
  }, []);

  const toggleAiDiameter = useCallback((v: boolean) => {
    setState((s) => ({ ...s, useAiDiameter: v }));
  }, []);

  /** Kullanici viewer'da bir sembole tikladiginda (herhangi tip), aday olarak kaydet. */
  const setLastClickedLayer = useCallback((layer: string | null) => {
    setState((s) => s.lastClickedLayer === layer ? s : { ...s, lastClickedLayer: layer });
  }, []);

  /** Aday layer'i (lastClickedLayer) sprinkler listesine ekle/cikar (toggle). */
  const confirmSprinklerLayer = useCallback(() => {
    setState((s) => {
      const layer = s.lastClickedLayer;
      if (!layer) return s;
      const has = s.sprinklerLayers.includes(layer);
      const next = has
        ? s.sprinklerLayers.filter((l) => l !== layer)
        : [...s.sprinklerLayers, layer];
      return { ...s, sprinklerLayers: next };
    });
  }, []);

  /** Belirli bir sprinkler layer'i listeden kaldir. */
  const removeSprinklerLayer = useCallback((layer: string) => {
    setState((s) => ({ ...s, sprinklerLayers: s.sprinklerLayers.filter((l) => l !== layer) }));
  }, []);

  /** Backend auto_detect_sprinklers'un bulduğu sprinkler sayisini state'e yaz.
   *  /parse response'undan handleCalculate icinde cagrilir; UI'da bilgi
   *  satirinda gosterilir. */
  const setAiDetectedSprinklerCount = useCallback((count: number | undefined) => {
    setState((s) => ({ ...s, aiDetectedSprinklerCount: count }));
  }, []);

  /** Layer'i gosterimden cikar/geri al. Sadece viewer goruntusunu etkiler;
   *  hesaplanmis metrajlar ve config korunur. */
  const toggleLayerVisibility = useCallback((layer: string) => {
    setState((s) => {
      const has = s.hiddenLayers.includes(layer);
      return {
        ...s,
        hiddenLayers: has ? s.hiddenLayers.filter((l) => l !== layer) : [...s.hiddenLayers, layer],
      };
    });
  }, []);

  /** Tum layer'lari geri goster (filtre temizle). */
  const showAllLayers = useCallback(() => {
    setState((s) => (s.hiddenLayers.length === 0 ? s : { ...s, hiddenLayers: [] }));
  }, []);

  return {
    state,
    selectLayer,
    updateLayerConfig,
    addCalculatedLayer,
    removeCalculatedLayer,
    updateEdgeSegmentDiameter,
    beginEditEquipment,
    cancelEditEquipment,
    saveEquipment,
    removeEquipment,
    toggleAiDiameter,
    setLastClickedLayer,
    confirmSprinklerLayer,
    removeSprinklerLayer,
    setAiDetectedSprinklerCount,
    toggleLayerVisibility,
    showAllLayers,
  };
}
