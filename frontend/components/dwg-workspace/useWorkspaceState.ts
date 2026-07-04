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
 *
 * EMEK KAYBI SIGORTASI (UX/TTL): state artik oncelikle DOSYA ICERIK HASH'i
 * ile anahtarlanir (fileHash = sha256 ilk 16 hex, DwgUploader hesaplar).
 * Sunucu cache'i dusse ve ayni dosya YENIDEN yuklense bile (yeni file_id!)
 * kullanicinin tum etiketlemeleri hash key'inden geri gelir — saatlerce
 * suren manuel etiketleme emegi file_id omrune bagli degildir.
 * fileHash yoksa (eski oturum / hash hesaplanamadi) file_id key'ine duser.
 */
/** fileId bazli LEGACY storage key — geriye uyum icin okunur. */
const STORAGE_KEY_PREFIX = 'metaprice_dwg_ws_';
/** Icerik-hash bazli KALICI storage key — birincil. */
const HASH_KEY_PREFIX = 'metaprice_dwg_ws_h_';

function _storageKey(fileId: string, fileHash?: string | null): string {
  return fileHash ? HASH_KEY_PREFIX + fileHash : STORAGE_KEY_PREFIX + fileId;
}

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

function _loadState(fileId: string, scale: number, fileHash?: string | null): WorkspaceState {
  if (typeof window === 'undefined') return _emptyState(fileId, scale);
  try {
    // 1) Birincil: hash key (ayni dosya = ayni state, file_id degisse bile)
    let raw = fileHash ? window.localStorage.getItem(HASH_KEY_PREFIX + fileHash) : null;
    let hashKeyed = !!raw;
    // 2) Legacy: file_id key (hash'ten onceki kayitlar — migrasyon okumasi)
    if (!raw) {
      raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + fileId);
      hashKeyed = false;
    }
    if (!raw) return _emptyState(fileId, scale);
    const parsed = JSON.parse(raw);
    // Hash-keyed kayitta fileId FARKLI olabilir (sunucu yeni id verdi) — state
    // gecerlidir, fileId guncellenir. Legacy kayitta eski sanity korunur.
    if (!hashKeyed && parsed?.fileId !== fileId) return _emptyState(fileId, scale);
    return { ..._emptyState(fileId, scale), ...parsed, fileId, scale };
  } catch {
    return _emptyState(fileId, scale);
  }
}

export function useWorkspaceState(fileId: string, scale: number, fileHash?: string | null) {
  // Mount'ta localStorage'dan restore et — sayfa yenilenmesi VEYA ayni
  // dosyanin yeniden yuklenmesi (yeni file_id) sonrasi hesaplanmis layer'lar,
  // etiketler, ekipmanlar korunur. Kullanici metraji yeniden yapmaz.
  const [state, setState] = useState<WorkspaceState>(() => _loadState(fileId, scale, fileHash));

  // fileId/hash degistiginde ilgili kayittan yukle (yoksa bos baslat).
  useEffect(() => {
    setState(_loadState(fileId, scale, fileHash));
  }, [fileId, scale, fileHash]);

  // State degisince localStorage'a kaydet (hash key birincil).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!state.fileId) return;
    try {
      window.localStorage.setItem(
        _storageKey(state.fileId, fileHash),
        JSON.stringify(state),
      );
    } catch {
      // QuotaExceededError veya disabled storage — sessizce gec
    }
  }, [state, fileHash]);

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

  /**
   * PRD §3 (manuel override propagation): Kullanici bir boruya cap atayinca,
   * AYNI LAYER'da endpoint paylasan ve cap'i null/Belirtilmemis olan KOMSU
   * borulara o cap'i otomatik dagit (1-HOP, zincirleme yok).
   *
   * Backend'in layer-aware 1-HOP inheritance mantiginin frontend karsiligidir.
   * DWG re-parse etmeden, lokal state guncelleme ile.
   *
   * Tolerance: 5 world unit (mm DWG'de 5mm — AutoCAD snap toleransi).
   *
   * Returns: { target, propagated } — kullanici toast'inda gosterilebilir.
   */
  const applyDiameterWithPropagation = useCallback((
    layer: string,
    segmentId: number,
    newDiameter: string,
  ): { target: boolean; propagated: number } => {
    let propagated = 0;
    let target = false;
    setState((s) => {
      const cl = s.calculatedLayers[layer];
      if (!cl) return s;
      const targetSeg = cl.edgeSegments.find((es) => es.segment_id === segmentId);
      if (!targetSeg) return s;
      target = true;

      // Hedef segment endpoint'leri (coords[0..3] veya polyline ilk/son)
      const endpointsOf = (es: typeof targetSeg): [number, number][] => {
        const c = es.coords;
        if (c && c.length >= 4) return [[c[0], c[1]], [c[2], c[3]]];
        const pl = es.polyline;
        if (pl && pl.length >= 2) {
          const first = pl[0];
          const last = pl[pl.length - 1];
          return [[first[0], first[1]], [last[0], last[1]]];
        }
        return [];
      };

      const TOL = 5;        // world unit (mm DWG: 5mm)
      const TOL_SQ = TOL * TOL;
      const targetEps = endpointsOf(targetSeg);

      const shareEndpoint = (es: typeof targetSeg): boolean => {
        const eps = endpointsOf(es);
        for (const [ax, ay] of targetEps) {
          for (const [bx, by] of eps) {
            const dx = ax - bx;
            const dy = ay - by;
            if (dx * dx + dy * dy <= TOL_SQ) return true;
          }
        }
        return false;
      };

      const updatedSegs = cl.edgeSegments.map((es) => {
        if (es.segment_id === segmentId) {
          return { ...es, diameter: newDiameter };
        }
        // Sadece ayni layer + null cap + endpoint paylasimi
        if (es.layer !== targetSeg.layer) return es;
        const cap = es.diameter || '';
        if (cap && cap !== 'Belirtilmemis') return es;
        if (!shareEndpoint(es)) return es;
        propagated += 1;
        return { ...es, diameter: newDiameter };
      });

      return {
        ...s,
        calculatedLayers: {
          ...s.calculatedLayers,
          [layer]: { ...cl, edgeSegments: updatedSegs },
        },
      };
    });
    return { target, propagated };
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
    applyDiameterWithPropagation,
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
