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
/** fileId bazli storage key — her DWG kendi state'ini ayri tutar. */
const STORAGE_KEY_PREFIX = 'metaprice_dwg_ws_';

function _emptyState(fileId: string, scale: number): WorkspaceState {
  return {
    fileId,
    scale,
    selectedLayer: null,
    layerConfigs: {},
    calculatedLayers: {},
    markedEquipments: {},
    editingEquipmentKey: null,
    sprinklerLayers: [],
    hiddenLayers: [],
    dimmedLayers: [],
  };
}

function _loadState(fileId: string, scale: number): WorkspaceState {
  if (typeof window === 'undefined') return _emptyState(fileId, scale);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + fileId);
    if (!raw) return _emptyState(fileId, scale);
    const parsed = JSON.parse(raw);
    // Sanity: fileId eslesmeli, scale uyumlu
    if (parsed?.fileId !== fileId) return _emptyState(fileId, scale);
    return { ..._emptyState(fileId, scale), ...parsed, fileId, scale };
  } catch {
    return _emptyState(fileId, scale);
  }
}

export function useWorkspaceState(fileId: string, scale: number) {
  // Mount'ta localStorage'dan restore et — sayfa yenilenmesi sonrasi
  // hesaplanmis layer'lar, isaretli ekipmanlar, sprinkler/hidden layer'lar
  // korunur. Kullanici tum metraji yeniden yapmaz.
  const [state, setState] = useState<WorkspaceState>(() => _loadState(fileId, scale));

  // fileId degistiginde state'i o fileId'nin local kaydindan yukle
  // (yoksa bos baslat). Eski fileId'nin hesaplamalari yeni dosyaya karismaz.
  useEffect(() => {
    setState(_loadState(fileId, scale));
  }, [fileId, scale]);

  // State degisince localStorage'a kaydet. Refresh sonrasi yukaridaki
  // _loadState bunu okuyup geri restore eder.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!state.fileId) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY_PREFIX + state.fileId,
        JSON.stringify(state),
      );
    } catch {
      // QuotaExceededError veya disabled storage — sessizce gec
    }
  }, [state]);

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
    // Yeni hesaplanan layer her zaman onaysiz baslar — kullanici "Onayla"yi bilerek tiklamali
    const withApproval: CalculatedLayer = { ...calculated, approved: false };
    setState((s) => ({
      ...s,
      calculatedLayers: { ...s.calculatedLayers, [calculated.layer]: withApproval },
      // selectedLayer'i KORU — kullanici onayla butonuna basabilsin. Eskiden null'lanyordu.
    }));
  }, []);

  const removeCalculatedLayer = useCallback((layer: string) => {
    setState((s) => {
      const { [layer]: _, ...rest } = s.calculatedLayers;
      return { ...s, calculatedLayers: rest };
    });
  }, []);

  /** Hesaplanmis bir layer'i onayla — Excel'e dahil olur, baska layer'a gecilebilir. */
  const approveLayer = useCallback((layer: string) => {
    setState((s) => {
      const cl = s.calculatedLayers[layer];
      if (!cl || cl.approved) return s;
      return {
        ...s,
        calculatedLayers: {
          ...s.calculatedLayers,
          [layer]: { ...cl, approved: true, approvedAt: Date.now() },
        },
      };
    });
  }, []);

  /** Onayli bir layer'in onayini geri al — revize moduna gec.
   *  Cap renkleri tekrar gozukur, viewer renklendirir, Excel/finalMetraj'a
   *  dahil edilmez (yeniden onaylanana kadar). */
  const unapproveLayer = useCallback((layer: string) => {
    setState((s) => {
      const cl = s.calculatedLayers[layer];
      if (!cl || !cl.approved) return s;
      return {
        ...s,
        calculatedLayers: {
          ...s.calculatedLayers,
          [layer]: { ...cl, approved: false, approvedAt: undefined },
        },
      };
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

  /** Belirli bir sprinkler layer'i listeden kaldir. */
  const removeSprinklerLayer = useCallback((layer: string) => {
    setState((s) => ({ ...s, sprinklerLayers: s.sprinklerLayers.filter((l) => l !== layer) }));
  }, []);

  /** Layer'i sprinkler listesinde toggle et (panel'den dogrudan, sembol tiklamadan). */
  const toggleSprinklerLayer = useCallback((layer: string) => {
    setState((s) => {
      const has = s.sprinklerLayers.includes(layer);
      return {
        ...s,
        sprinklerLayers: has
          ? s.sprinklerLayers.filter((l) => l !== layer)
          : [...s.sprinklerLayers, layer],
      };
    });
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

  /** Layer'i soluk/normal arasinda toggle et. Soluk layer'lar viewer'da
   *  %25 opacity + gri renkte gosterilir, tiklanamaz. Hidden ile bagimsiz. */
  const toggleLayerDimmed = useCallback((layer: string) => {
    setState((s) => {
      const has = s.dimmedLayers.includes(layer);
      return {
        ...s,
        dimmedLayers: has ? s.dimmedLayers.filter((l) => l !== layer) : [...s.dimmedLayers, layer],
      };
    });
  }, []);

  /** Tum soluklugu kaldir. */
  const showAllDimmed = useCallback(() => {
    setState((s) => (s.dimmedLayers.length === 0 ? s : { ...s, dimmedLayers: [] }));
  }, []);

  return {
    state,
    selectLayer,
    updateLayerConfig,
    addCalculatedLayer,
    approveLayer,
    unapproveLayer,
    removeCalculatedLayer,
    updateEdgeSegmentDiameter,
    beginEditEquipment,
    cancelEditEquipment,
    saveEquipment,
    removeEquipment,
    removeSprinklerLayer,
    toggleSprinklerLayer,
    toggleLayerVisibility,
    showAllLayers,
    toggleLayerDimmed,
    showAllDimmed,
  };
}
