'use client';

/**
 * DWG Project Workspace — tek ekran metraj akisi.
 * Sol: buyuk SVG cizim | Sag: aktif layer formu + hesaplanmis metraj ozeti.
 *
 * Kullanici:
 *  - Cizimde boru layer'ina tiklar → secilir, sagda form acilir
 *  - Hat ismi/malzeme/cap girer, "Bu Layer'i Hesapla" → /parse cagrilir
 *  - Hesaplanan layer cap bazli renklenir, ozete eklenir
 *  - Ekipman (INSERT) noktasina tiklar → popup, ad+birim girer, turuncu isaretlenir
 *  - Birden fazla layer + ekipman ekleye ekleye onaylar
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { DxfCanvasViewer } from '@/components/dwg-viewer';
import { DiameterEditPopup, type EdgeSegment } from '@/components/dwg-metraj';
import type { MetrajResult } from '@/components/dwg-metraj/types';
import LayerInfoSidebar from './LayerInfoSidebar';
import LayerVisibilityPanel from './LayerVisibilityPanel';
import MetrajSummaryPanel from './MetrajSummaryPanel';
import EquipmentDetailPopup from './EquipmentDetailPopup';
import { useWorkspaceState } from './useWorkspaceState';
import type { MarkedEquipment, CalculatedLayer } from './types';
import {
  useProximityCalc,
  useOriginalColorState,
  DiameterLegendPanel,
} from '@/components/dwg-diameter-engine';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import { exportMetrajToExcel, type MetrajSheet } from '@/lib/metraj-excel';

interface DwgProjectWorkspaceProps {
  fileId: string;
  scale: number;
  fileName: string;
  onReset: () => void;
  onApproved: (metraj: MetrajResult, fileName: string) => void;
}

export default function DwgProjectWorkspace({
  fileId, scale, fileName, onReset, onApproved,
}: DwgProjectWorkspaceProps) {
  const {
    state,
    selectLayer, updateLayerConfig,
    addCalculatedLayer, approveLayer, unapproveLayer, removeCalculatedLayer,
    updateEdgeSegmentDiameter,
    applyDiameterWithPropagation,
    beginEditEquipment, cancelEditEquipment, saveEquipment, removeEquipment,
    removeSprinklerLayer, toggleSprinklerLayer,
    toggleLayerVisibility, showAllLayers,
    toggleLayerDimmed, showAllDimmed,
  } = useWorkspaceState(fileId, scale);

  /** Geometry'den cikan layer isimleri — DxfCanvasViewer onLayersAvailable
   *  callback'inden gelir. Layer goruntusu paneli icin kullanilir. */
  const [availableLayers, setAvailableLayers] = useState<string[]>([]);
  const hiddenLayersSet = useMemo(() => new Set(state.hiddenLayers), [state.hiddenLayers]);
  const dimmedLayersSet = useMemo(() => new Set(state.dimmedLayers), [state.dimmedLayers]);

  /** AutoCAD-vari "Layer Gizle Modu". Toolbar'daki goz-kapali butonu ile toggle.
   *  Aktif iken cizimde tikla = o layer'i cizimden cikar. Geri getirmek icin
   *  sag panel "Layer Goruntusu" listesinden goz ikonuyla gosterirsin. */
  const [hideMode, setHideMode] = useState(false);

  /** SILGI MODU — AutoCAD'in Erase komutu mantigi.
   *  Aktif iken: tik = entity sil, drag = marquee select + sil.
   *  Silinen entity'ler hidden* set'lerinde tutulur, render skip eder.
   *  hesaplama yapilirken backend'e gonderilir (excluded_lines), metraj
   *  hesabindan da cikar. */
  const [eraseMode, setEraseMode] = useState(false);
  /** "x1,y1,x2,y2" formatinda LINE key set (round 1dp) */
  const [hiddenLineKeys, setHiddenLineKeys] = useState<Set<string>>(new Set());
  /** insert_index set (geometry.inserts array index) */
  const [hiddenInsertKeys, setHiddenInsertKeys] = useState<Set<number>>(new Set());
  /** geometry.texts[] array index set */
  const [hiddenTextKeys, setHiddenTextKeys] = useState<Set<number>>(new Set());

  /** PENDING ERASE — kullanici tikladi/marquee yapti ama henuz silmedi.
   *  "Sil (Enter)" butonuna basinca veya Enter tuşuna basinca hidden'a aktarilir.
   *  Esc veya "Iptal" ile temizlenir. AutoCAD'in seç-onayla-sil flow'u. */
  const [pendingErase, setPendingErase] = useState<{
    lines: string[];
    inserts: number[];
    texts: number[];
  } | null>(null);

  /** Undo history — son N erase action'i (her action = ne silindi) */
  const [eraseHistory, setEraseHistory] = useState<
    Array<{ lines: string[]; inserts: number[]; texts: number[] }>
  >([]);
  const MAX_ERASE_HISTORY = 10;

  /** Marquee'de tespit edilen veya tek tikla secilen entity'leri PENDING'e ekle.
   *  Hala silmiyor — confirm aksiyonu bekliyor. */
  const handleSelectForErase = useCallback(
    (lines: string[], inserts: number[], texts: number[]) => {
      if (lines.length === 0 && inserts.length === 0 && texts.length === 0) return;
      setPendingErase((prev) => {
        if (!prev) return { lines, inserts, texts };
        // Birikme — eski pending'e ekle (multi-select)
        return {
          lines: Array.from(new Set([...prev.lines, ...lines])),
          inserts: Array.from(new Set([...prev.inserts, ...inserts])),
          texts: Array.from(new Set([...prev.texts, ...texts])),
        };
      });
    },
    [],
  );

  /** Pending'i onayla — hidden'a aktar + history'e ekle. Enter veya "Sil" butonu. */
  const handleConfirmErase = useCallback(() => {
    if (!pendingErase) return;
    const { lines, inserts, texts } = pendingErase;
    setHiddenLineKeys((prev) => {
      const next = new Set(prev);
      for (const k of lines) next.add(k);
      return next;
    });
    setHiddenInsertKeys((prev) => {
      const next = new Set(prev);
      for (const k of inserts) next.add(k);
      return next;
    });
    setHiddenTextKeys((prev) => {
      const next = new Set(prev);
      for (const k of texts) next.add(k);
      return next;
    });
    setEraseHistory((prev) => {
      const next = [...prev, { lines, inserts, texts }];
      return next.length > MAX_ERASE_HISTORY ? next.slice(-MAX_ERASE_HISTORY) : next;
    });
    setPendingErase(null);
  }, [pendingErase]);

  /** Pending'i iptal et — secimi sifirla (silme yapilmaz). Esc veya "Iptal" butonu. */
  const handleCancelPendingErase = useCallback(() => {
    setPendingErase(null);
  }, []);

  const handleUndoErase = useCallback(() => {
    setEraseHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setHiddenLineKeys((s) => {
        const next = new Set(s);
        for (const k of last.lines) next.delete(k);
        return next;
      });
      setHiddenInsertKeys((s) => {
        const next = new Set(s);
        for (const k of last.inserts) next.delete(k);
        return next;
      });
      setHiddenTextKeys((s) => {
        const next = new Set(s);
        for (const k of last.texts) next.delete(k);
        return next;
      });
      return prev.slice(0, -1);
    });
  }, []);

  const handleRestoreAllErased = useCallback(() => {
    setHiddenLineKeys(new Set());
    setHiddenInsertKeys(new Set());
    setHiddenTextKeys(new Set());
    setEraseHistory([]);
    setPendingErase(null);
  }, []);

  const [calculating, setCalculating] = useState(false);

  // ── PRD: deterministic proximity caplandirma + dinamik renk save flow ───
  // useProximityCalc: tek layer icin /parse?use_proximity_diameter=true tetikle.
  // useOriginalColorState: save sonrasi viewer'da cap-renk kapat (PRD §5).
  const { useDiameterColors, enableDiameterColors, restoreOriginalColors } = useOriginalColorState();
  const { calculatingLayer, calculateLayer: calculateLayerByProximity } = useProximityCalc({
    fileId,
    scale,
    sprinklerLayers: state.sprinklerLayers,
    onResult: ({ calculated }) => {
      addCalculatedLayer(calculated);
      enableDiameterColors();  // Yeni hesaplama -> cap renkleri aktif
    },
    // Engine cache resetlendiginde (Cloud Run revision switch, TTL 15dk asimi):
    // localStorage'daki file_id artik gecersiz. Parent onReset() ile DwgUploader'a
    // donerek kullaniciya dosyayi yeniden yukletir. Toast useProximityCalc icinde.
    onFileIdInvalid: () => {
      onReset();
    },
  });

  const [editingSegment, setEditingSegment] = useState<EdgeSegment | null>(null);

  // Cap Renkleri legend'i SADECE onaysiz layer'larin caplarini gosterir.
  // Onaylanan layer kullanici icin "bitti" sayilir; cap listesi karismasin.
  // Hesaplanmis Metraj panelinde gerekirse o layer'a tiklayinca onay kalkar
  // ve renkler geri gelir (revize modu).
  const pendingCalculatedLayers = useMemo(() => {
    const map: Record<string, CalculatedLayer> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (!cl.approved) map[layer] = cl;
    }
    return map;
  }, [state.calculatedLayers]);

  // ── CAP RENKLERI LISTE NAVIGATION ──────────────────────────────────────
  // Legend'da bir cap'e tiklayinca o cap'in segment'leri arasinda dolas.
  // activeDiameter: aktif cap key ("Ø50", "Belirtilmemis", ...). null = kapali.
  // activeIndex: o cap icin gecerli segment index (0-based, modulo segment sayisi).
  // focusVersion: ayni segment'e tekrar basildiginda zoom+halo'yu yeniden tetikleme
  //   icin monoton artan token. Parent her cycle tikinda increment eder.
  const [activeDiameter, setActiveDiameter] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [focusVersion, setFocusVersion] = useState<number>(0);

  // Aktif cap icin onaysiz layer'lardaki eslesen segment'leri duzlestir.
  // Onayli layer'lar Cap Renkleri'nde gozukmuyor; cycle'da da olmamali.
  const activeDiameterSegments = useMemo<EdgeSegment[]>(() => {
    if (!activeDiameter) return [];
    const out: EdgeSegment[] = [];
    for (const cl of Object.values(pendingCalculatedLayers)) {
      for (const seg of cl.edgeSegments) {
        const segKey = seg.diameter || 'Belirtilmemis';
        if (segKey === activeDiameter) out.push(seg);
      }
    }
    out.sort((a, b) => a.segment_id - b.segment_id);
    return out;
  }, [activeDiameter, pendingCalculatedLayers]);

  // Tiklanan cap segment listesi degisirse (cap eklendi/silindi/duzeltildi) index'i
  // guvenle clamp et — out-of-bounds focus'u onler.
  useEffect(() => {
    if (activeDiameter && activeIndex >= activeDiameterSegments.length) {
      setActiveIndex(activeDiameterSegments.length > 0 ? 0 : 0);
    }
  }, [activeDiameter, activeIndex, activeDiameterSegments.length]);

  const handleCycleDiameter = useCallback((diameter: string) => {
    if (activeDiameter !== diameter) {
      // Yeni cap'e gec — basa al
      setActiveDiameter(diameter);
      setActiveIndex(0);
    } else {
      // Ayni cap'e tekrar tikla — sonraki segmente atla (modulo cycle)
      setActiveIndex((prev) => {
        const count = activeDiameterSegments.length;
        if (count <= 1) return 0;
        return (prev + 1) % count;
      });
    }
    setFocusVersion((v) => v + 1);  // Tek-segment cap'lerde bile zoom + halo yeniden tetiklensin
  }, [activeDiameter, activeDiameterSegments.length]);

  const handleClearActiveDiameter = useCallback(() => {
    setActiveDiameter(null);
    setActiveIndex(0);
  }, []);

  // Aktif segment ve halo rengini DxfCanvasViewer'a propagate et
  const focusedSegmentId = activeDiameter && activeDiameterSegments.length > 0
    ? activeDiameterSegments[Math.min(activeIndex, activeDiameterSegments.length - 1)].segment_id
    : null;
  const focusedHaloColor = activeDiameter ? diameterToColor(activeDiameter) : null;
  const [pendingEquipment, setPendingEquipment] = useState<null | {
    key: string; insertIndex: number; layer: string; insertName: string; position: [number, number];
  }>(null);

  const selectedConfig = state.selectedLayer ? state.layerConfigs[state.selectedLayer] ?? null : null;

  // ─── Global Esc: en ust katmandan baslayip tek tek geri al ─────────
  // Priority: acik popup'lar > duzenlenen ogeler > secim/mod. Her Esc tek
  // katman geri gider — kullanici uretici akisi kaybetmez.
  // Input'a focus iken Esc form temizleme yapsin (preventDefault yok).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (pendingEquipment) { setPendingEquipment(null); return; }
      if (state.editingEquipmentKey) { cancelEditEquipment(); return; }
      if (editingSegment) { setEditingSegment(null); return; }
      // Pending erase silgi modundan ONCE — Esc bir kademe geri gider:
      // pending varsa once pending iptal, sonraki Esc silgi modunu kapatir.
      if (pendingErase) { handleCancelPendingErase(); return; }
      if (eraseMode) { setEraseMode(false); return; }  // silgi modunu kapat
      if (activeDiameter) { handleClearActiveDiameter(); return; }  // cap-focus halo'yu kapat
      if (state.selectedLayer) { selectLayer(state.selectedLayer); return; }  // toggle off
      if (hideMode) { setHideMode(false); return; }
    };
    // Ctrl+Z undo erase
    const onUndoKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && eraseHistory.length > 0) {
        e.preventDefault();
        handleUndoErase();
      }
    };
    // Enter → pending erase'i onayla (AutoCAD-style: sec sonra Enter)
    // Input/textarea focus iken Enter form submit edebilir → atla.
    const onEnterKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !pendingErase) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      handleConfirmErase();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onUndoKey);
    window.addEventListener('keydown', onEnterKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onUndoKey);
      window.removeEventListener('keydown', onEnterKey);
    };
  }, [pendingEquipment, state.editingEquipmentKey, editingSegment, state.selectedLayer, hideMode, eraseMode, eraseHistory.length, pendingErase, activeDiameter, cancelEditEquipment, selectLayer, handleUndoErase, handleConfirmErase, handleCancelPendingErase, handleClearActiveDiameter]);

  // Pending erase Set'leri — viewer turuncu highlight icin (immutable Set)
  const pendingLineKeysSet = useMemo(
    () => (pendingErase ? new Set(pendingErase.lines) : undefined),
    [pendingErase],
  );
  const pendingInsertKeysSet = useMemo(
    () => (pendingErase ? new Set(pendingErase.inserts) : undefined),
    [pendingErase],
  );
  const pendingTextKeysSet = useMemo(
    () => (pendingErase ? new Set(pendingErase.texts) : undefined),
    [pendingErase],
  );

  // Onayli layer'lar cap-renkli edge listesinden DUSER — viewer onlara dokunmaz,
  // layer orijinal AutoCAD rengiyle kalir. Kullanici kurali: "onayla = bu layer
  // bitti, dikkati basa cek". T-junction marker'lari da onayli layer'larda gizli.
  const calculatedEdgesByLayer = useMemo(() => {
    const map: Record<string, EdgeSegment[]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (cl.approved) continue;  // onayli -> cap renksiz, orijinal
      map[layer] = cl.edgeSegments;
    }
    return map;
  }, [state.calculatedLayers]);

  const calculatedJunctionsByLayer = useMemo(() => {
    const map: Record<string, [number, number][]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      if (cl.approved) continue;  // onayli -> T-junction marker da kapali
      if (cl.junctionPoints && cl.junctionPoints.length > 0) {
        map[layer] = cl.junctionPoints;
      }
    }
    return map;
  }, [state.calculatedLayers]);

  const markedEquipmentKeys = useMemo(
    () => new Set(Object.keys(state.markedEquipments)),
    [state.markedEquipments]
  );

  /** Layer panelinde her layer adının yanında atanmış çapı rozet olarak
   *  göstermek için lookup map. */
  const layerDiametersMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [layer, cfg] of Object.entries(state.layerConfigs)) {
      if (cfg.defaultDiameter?.trim()) m[layer] = cfg.defaultDiameter;
    }
    return m;
  }, [state.layerConfigs]);

  const calculatedLayerNames = useMemo(
    () => new Set(Object.keys(state.calculatedLayers)),
    [state.calculatedLayers],
  );

  // BULK auto-calc KALDIRILDI: Kullanici 142 layer'in hepsini hesaplama
  // istemiyor. Yeni akis: kullanici layer'a tikla, sag panel acilir, "Hesapla"
  // butonuna basinca SADECE o layer parse edilir. Engine load minimize, kontrol
  // kullanicida.

  const handleBulkCalculate = async (layers: string[]) => {
    if (layers.length === 0) return;
    console.log('[handleBulkCalculate] START', { count: layers.length });
    setCalculating(true);

    // BATCH SIRALI: Render free tier 512MB RAM single worker. 27 layer'i
    // tek request'te gondermek OOM-kill'e neden oluyor (ilk parse OK,
    // sonrakiler engine crash). 5 layer'lik batch'lere bol, sirali await.
    // Toplam sure: 5-6 batch x 15-30sn = 1.5-3 dakika (acik gostergeyle).
    const BATCH_SIZE = 5;
    const batches: string[][] = [];
    for (let i = 0; i < layers.length; i += BATCH_SIZE) {
      batches.push(layers.slice(i, i + BATCH_SIZE));
    }

    toast({
      title: '🔄 Tum layer\'lar hesaplaniyor',
      description: `${layers.length} layer ${batches.length} batch'te islenecek (1.5-3 dk)`,
    });

    const allEdges: EdgeSegment[] = [];
    const allJunctions: [number, number][] = [];
    let failedBatches = 0;
    let successBatches = 0;

    try {
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        console.log(`[handleBulkCalculate] BATCH ${bIdx + 1}/${batches.length}`, { layers: batch });

        try {
          const params = new URLSearchParams({
            discipline: 'mechanical',
            // scale=0 (Auto) durumda parametreyi HIC gondermiyoruz -> backend $INSUNITS+geometri ile karar verir
            ...(scale && scale > 0 ? { scale: String(scale) } : {}),
            file_id: fileId,
            selected_layers: JSON.stringify(batch),
            layer_hat_tipi: '{}',
            layer_material_type: '{}',
            layer_default_diameter: '{}',
            sprinkler_layers: JSON.stringify(state.sprinklerLayers),
          });
          const formData = new FormData();
          const res = await api.post<MetrajResult>(
            `/dwg-engine/parse?${params.toString()}`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 },
          );
          const data = res.data as any;
          const batchEdges: EdgeSegment[] = Array.isArray(data.edge_segments) ? data.edge_segments : [];
          const batchJunctions: [number, number][] = Array.isArray(data.junction_points)
            ? data.junction_points : [];
          allEdges.push(...batchEdges);
          allJunctions.push(...batchJunctions);
          successBatches++;
          console.log(`[handleBulkCalculate] BATCH ${bIdx + 1} OK`, {
            segments: batchEdges.length, junctions: batchJunctions.length,
          });
        } catch (batchErr: any) {
          failedBatches++;
          console.warn(`[handleBulkCalculate] BATCH ${bIdx + 1} FAIL:`, {
            status: batchErr?.response?.status,
            msg: batchErr?.message,
          });
          // Devam et — diger batch'ler calismaya devam etsin
        }

        // Engine'e nefes aldir — sonraki batch'ten once kisa bekleme
        // (memory cleanup + worker idle olsun)
        if (bIdx < batches.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      // Edge segment'leri layer'a gore grupla
      const segsByLayer: Record<string, EdgeSegment[]> = {};
      for (const es of allEdges) {
        const lyr = es.layer;
        if (!segsByLayer[lyr]) segsByLayer[lyr] = [];
        segsByLayer[lyr].push(es);
      }
      const layerNames = Object.keys(segsByLayer);
      console.log('[handleBulkCalculate] DONE', {
        successBatches, failedBatches,
        totalSegs: allEdges.length, junctions: allJunctions.length, layerCount: layerNames.length,
      });

      let totalSegCount = 0;
      for (const lyr of layerNames) {
        const segs = segsByLayer[lyr];
        const totalLen = segs.reduce((s, e) => s + (e.length || 0), 0);
        const cfg = state.layerConfigs[lyr] ?? { hatIsmi: '', materialType: '', defaultDiameter: '' };
        const calcLayer: CalculatedLayer = {
          layer: lyr,
          hatIsmi: cfg.hatIsmi || lyr,
          materialType: cfg.materialType || '',
          defaultDiameter: cfg.defaultDiameter || '',
          edgeSegments: segs,
          junctionPoints: lyr === layerNames[0] ? allJunctions : [],
          totalLength: totalLen,
          computedAt: Date.now(),
          approved: false,  // bulk hesap layer'lari da onaysiz baslar
        };
        addCalculatedLayer(calcLayer);
        totalSegCount += segs.length;
      }

      const failedNote = failedBatches > 0 ? ` (${failedBatches} batch fail)` : '';
      toast({
        title: '✓ Hesaplandi',
        description: `${layerNames.length} layer, ${totalSegCount} segment, ${allJunctions.length} T-noktasi${failedNote}`,
        variant: failedBatches > 0 ? 'destructive' : 'default',
      });
    } catch (e: any) {
      console.error('[handleBulkCalculate] HATA:', {
        status: e?.response?.status,
        data: e?.response?.data,
        message: e?.message,
      });
      const msg = e?.response?.data?.message ?? e?.message ?? 'Bulk hesaplama hatasi';
      toast({ title: 'Hata', description: String(msg).slice(0, 200), variant: 'destructive' });
    } finally {
      setCalculating(false);
    }
  };

  const handleCalculate = async (forceLayer?: string) => {
    const layer = forceLayer ?? state.selectedLayer;
    console.log('[handleCalculate] START', { layer, forceLayer, selectedLayer: state.selectedLayer });
    if (!layer) {
      console.warn('[handleCalculate] EARLY EXIT: layer yok');
      return;
    }
    if (state.calculatedLayers[layer]) {
      console.warn('[handleCalculate] EARLY EXIT: zaten hesaplandi', layer);
      return;
    }
    const cfg = state.layerConfigs[layer] ?? { hatIsmi: '', materialType: '', defaultDiameter: '' };
    setCalculating(true);
    try {
      const hatTipiMap: Record<string, string> = { [layer]: cfg.hatIsmi || layer };
      const materialTypeMap: Record<string, string> = {};
      if (cfg.materialType) materialTypeMap[layer] = cfg.materialType;
      const defaultDiameterMap: Record<string, string> = {};
      if (cfg.defaultDiameter.trim()) defaultDiameterMap[layer] = cfg.defaultDiameter.trim();

      const params = new URLSearchParams({
        discipline: 'mechanical',
        scale: String(scale),
        file_id: fileId,
        selected_layers: JSON.stringify([layer]),
        layer_hat_tipi: JSON.stringify(hatTipiMap),
        layer_material_type: JSON.stringify(materialTypeMap),
        layer_default_diameter: JSON.stringify(defaultDiameterMap),
        sprinkler_layers: JSON.stringify(state.sprinklerLayers),
      });

      console.log('[handleCalculate] POST /dwg-engine/parse', { url: `/dwg-engine/parse?${params.toString()}` });
      const formData = new FormData();
      const res = await api.post<MetrajResult>(
        `/dwg-engine/parse?${params.toString()}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 },
      );
      console.log('[handleCalculate] RESPONSE OK', { status: res.status });

      const data = res.data as any;
      const edgeSegs: EdgeSegment[] = Array.isArray(data.edge_segments) ? data.edge_segments : [];
      const junctions: [number, number][] = Array.isArray(data.junction_points)
        ? (data.junction_points as [number, number][])
        : [];
      const totalLen = edgeSegs.reduce((sum, e) => sum + (e.length || 0), 0);
      console.log('[handleCalculate] PARSED', { edgeSegsCount: edgeSegs.length, junctionsCount: junctions.length, totalLen });

      const calcLayer: CalculatedLayer = {
        layer,
        hatIsmi: cfg.hatIsmi,
        materialType: cfg.materialType,
        defaultDiameter: cfg.defaultDiameter,
        edgeSegments: edgeSegs,
        junctionPoints: junctions,
        totalLength: totalLen,
        computedAt: Date.now(),
        approved: false,
      };
      addCalculatedLayer(calcLayer);

      toast({
        title: 'Layer hesaplandı',
        description: `${layer}: ${totalLen.toFixed(1)} m, ${edgeSegs.length} segment, ${junctions.length} T-noktası`,
      });
    } catch (e: any) {
      // Tam error context'i console'a — toast kesiyor, F12 → Console'da tüm detay
      console.error('[Hesapla] HATA:', {
        status: e?.response?.status,
        data: e?.response?.data,
        message: e?.message,
        url: e?.config?.url,
      });
      const rawMsg = e?.response?.data?.message ?? e?.response?.data?.detail ?? e?.message ?? 'Metraj hesaplanamadı';
      const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      // Toast'a uzunsa truncate ama tam mesaj console'da
      const shortMsg = msg.length > 200 ? msg.slice(0, 200) + '... (F12 Console\'da tam mesaj)' : msg;
      toast({ title: 'Hata', description: shortMsg, variant: 'destructive' });
    } finally {
      setCalculating(false);
    }
  };

  /** Layer secimi degisikligini onaysiz-hesaplama korumasiyla yap.
   *  Mevcut secili layer hesaplandi ama onaylanmadi ise uyari ver, secimi
   *  degistirme. Ayni layer'a tekrar tiklama (toggle off) serbest.
   *  Returns: true -> secim degisti, false -> bloklandi. */
  const tryChangeLayer = (target: string): boolean => {
    const prev = state.selectedLayer;
    if (prev && prev !== target) {
      const cl = state.calculatedLayers[prev];
      if (cl && !cl.approved) {
        toast({
          title: 'Once mevcut layer\'i onaylayin',
          description: `"${prev}" hesaplandi ama onaylanmadi. Onayla butonuna basip sonra baska layer'a gec.`,
          variant: 'destructive',
        });
        return false;
      }
    }
    selectLayer(target);
    return true;
  };

  const handleLineClick = (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => {
    // LINE click -> SADECE layer secimi. Hesaplama "Hesapla" butonuyla manuel
    // tetiklenir (LayerInfoSidebar'da).
    console.log('[handleLineClick] FIRED', { layer: line.layer });
    if (hideMode || line.shiftKey) {
      toggleLayerVisibility(line.layer);
      toast({
        title: state.hiddenLayers.includes(line.layer) ? 'Layer gosterildi' : 'Layer gizlendi',
        description: line.layer,
      });
      return;
    }
    tryChangeLayer(line.layer);
  };

  const handleInsertClick = (ins: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => {
    // EKIPMAN AKISI SIMDILIK KAPALI. INSERT'in layer'ini sec.
    tryChangeLayer(ins.layer);
  };

  const handleCircleClick = (_c: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => {
    // Sprinkler/sembol isaretleme LayerVisibilityPanel damla ikonuyla yapilir.
    // CIRCLE tik su an no-op.
  };

  /** Hesaplanmis ve onaylanmis layer'lardan Excel sheet'leri kur.
   *  Her layer ayri sheet — Cap'lere groupBy, malzeme adi config.materialType. */
  const buildExcelSheets = (approvedLayers: CalculatedLayer[]): MetrajSheet[] => {
    return approvedLayers
      .slice()
      .sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0))
      .map((cl) => {
        const byDia = new Map<string, number>();
        for (const seg of cl.edgeSegments) {
          const cap = seg.diameter || 'Belirtilmemis';
          byDia.set(cap, (byDia.get(cap) || 0) + (seg.length || 0));
        }
        const rows = Array.from(byDia.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([diameter, length]) => ({
            name: cl.materialType || '-',
            diameter,
            unit: 'm',
            qty: Math.round(length * 100) / 100,
          }));
        return {
          sheetName: cl.hatIsmi || cl.layer,
          rows,
          totalLength: cl.totalLength,
          materialType: cl.materialType || undefined,
        };
      });
  };

  const handleConfirmAll = async () => {
    const allLayers = Object.values(state.calculatedLayers);
    const approvedLayers = allLayers.filter((l) => l.approved);
    const equipments = Object.values(state.markedEquipments);

    if (approvedLayers.length === 0 && equipments.length === 0) {
      toast({
        title: 'Onayli layer yok',
        description: 'Once hesaplanan layer\'lari "Onayla" butonuyla onayla, sonra finallestir.',
        variant: 'destructive',
      });
      return;
    }

    // Onaylanmamis layer kalmis mi? Uyari ver ama bloklamadan devam (kullanici karari)
    const pendingCount = allLayers.length - approvedLayers.length;
    if (pendingCount > 0) {
      toast({
        title: `${pendingCount} layer hala onaylanmadi`,
        description: 'Onaysiz layer\'lar Excel\'e ve fiyatlandirmaya DAHIL EDILMEYECEK.',
      });
    }

    // Excel indirimi (sadece onayli layer'lar)
    if (approvedLayers.length > 0) {
      try {
        const sheets = buildExcelSheets(approvedLayers);
        const result = await exportMetrajToExcel(sheets, fileName);
        if (result.success) {
          toast({
            title: 'Excel olusturuldu',
            description: `${result.sheetCount} layer · ${result.totalItems} satir`,
          });
        }
      } catch (e: any) {
        console.error('[handleConfirmAll] Excel hatasi:', e);
        toast({ title: 'Excel hatasi', description: String(e?.message ?? e), variant: 'destructive' });
      }
    }

    // FinalMetraj sadece ONAYLI layer'lardan kurulur — onaysizlar dahil degil
    const layers = approvedLayers;

    const finalMetraj: MetrajResult = {
      layers: layers.map((cl) => ({
        layer: cl.hatIsmi || cl.layer,
        length: cl.totalLength,
        line_count: cl.edgeSegments.length,
        hat_tipi: cl.hatIsmi || cl.layer,
        segments: cl.edgeSegments.map((es) => ({
          segment_id: es.segment_id,
          layer: cl.hatIsmi || cl.layer,
          length: es.length,
          line_count: 1,
          material_type: cl.materialType,
          diameter: es.diameter,
        })),
      })),
      total_length: layers.reduce((sum, cl) => sum + cl.totalLength, 0),
      total_layers: layers.length,
      warnings: [],
    };

    // Ekipmanlari ayni isim+marka+birim ile grupla — adet topla, fiyatlandir
    type EqGroup = {
      label: string;
      brandName: string | null;
      unit: string;
      unitPrice: number | null;
      specs: Record<string, string> | null;
      libraryItemId: string | null;
      layer: string;
      count: number;
    };
    const eqGroups: Record<string, EqGroup> = {};
    for (const eq of equipments) {
      const k = `${eq.libraryItemId ?? eq.userLabel}__${eq.unit}`;
      if (!eqGroups[k]) {
        eqGroups[k] = {
          label: eq.userLabel,
          brandName: eq.brandName ?? null,
          unit: eq.unit,
          unitPrice: eq.unitPrice ?? null,
          specs: eq.specs ?? null,
          libraryItemId: eq.libraryItemId ?? null,
          layer: eq.layer,
          count: 0,
        };
      }
      eqGroups[k].count += 1;
    }

    // (1) Structured equipments — quotes/Excel/PDF için
    finalMetraj.equipments = Object.values(eqGroups).map((g) => ({
      name: g.label,
      brandName: g.brandName,
      unit: g.unit,
      quantity: g.count,
      unitPrice: g.unitPrice,
      totalPrice: g.unitPrice != null ? g.unitPrice * g.count : null,
      specs: g.specs,
      layer: g.layer,
      libraryItemId: g.libraryItemId,
    }));

    // (2) Legacy fake-layer satırı — mevcut MetrajTable görünümü için
    //     material_type'a marka + specs özetini koy ki tabloda görünsün
    for (const g of Object.values(eqGroups)) {
      const specsSummary = g.specs && Object.keys(g.specs).length > 0
        ? Object.entries(g.specs).map(([k, v]) => `${k}:${v}`).join(', ')
        : '';
      const matType = [
        `Ekipman · ${g.unit}`,
        g.brandName && `(${g.brandName})`,
        specsSummary && `[${specsSummary}]`,
      ].filter(Boolean).join(' ');
      finalMetraj.layers.push({
        layer: g.label,
        length: g.count,
        line_count: g.count,
        hat_tipi: g.label,
        segments: [{
          segment_id: 0,
          layer: g.label,
          length: g.count,
          line_count: g.count,
          material_type: matType,
          diameter: g.unitPrice != null ? `₺${g.unitPrice.toFixed(2)}/${g.unit}` : '',
        }],
      });
    }

    onApproved(finalMetraj, fileName);
    // PRD §5: Save sonrasi viewer'da cap renkleri kaldirilir, layer orijinal
    // ACI rengine donulur. calculatedLayers state'i SAKLI tutulur (kullanici
    // dondukten sonra cap duzeltmesi yapabilsin). Sadece RENDER bayragi false.
    restoreOriginalColors();
    // Cap-renkleri legend navigation halo'su da kapansin — kaydet sonrasi cizim
    // orijinal goruntuye doner, halo'nun kalmasi gorsel kirlilik olur.
    handleClearActiveDiameter();
  };

  const editingEquipmentExisting = state.editingEquipmentKey
    ? state.markedEquipments[state.editingEquipmentKey]
    : undefined;

  return (
    <div>
      {/* Ust bar */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Proje: {fileName}</h3>
          <p className="text-xs text-muted-foreground">
            {Object.keys(state.calculatedLayers).length} layer hesaplandı ·{' '}
            {Object.values(state.calculatedLayers).filter((l) => l.approved).length} onaylı ·{' '}
            {Object.keys(state.markedEquipments).length} ekipman işaretli
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Final buton: en az 1 onayli layer varsa enabled */}
          <button
            onClick={handleConfirmAll}
            disabled={!Object.values(state.calculatedLayers).some((l) => l.approved)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            title="Excel olustur + fiyatlandirmaya gec (sadece onayli layer'lar dahil)"
          >
            Tümünü Onayla & Fiyatlandırmaya Geç
          </button>
          <button
            onClick={onReset}
            className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
          >
            Yeni DWG Yükle
          </button>
        </div>
      </div>

      {/* Ana grid: sol buyuk cizim + sag panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-3">
        {/* Sol: Canvas2D Viewer */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <DxfCanvasViewer
            fileId={fileId}
            calculatedEdgesByLayer={calculatedEdgesByLayer}
            calculatedJunctionsByLayer={calculatedJunctionsByLayer}
            selectedLayer={state.selectedLayer}
            markedEquipmentKeys={markedEquipmentKeys}
            sprinklerLayers={new Set(state.sprinklerLayers)}
            onLineClick={handleLineClick}
            onInsertClick={handleInsertClick}
            onCircleClick={handleCircleClick}
            onSegmentClick={(seg) => setEditingSegment(seg)}
            onClearSelection={() => {
              // selectLayer ayni layer ile cagrilinca toggle off yapiyor
              if (state.selectedLayer) selectLayer(state.selectedLayer);
            }}
            onLayersAvailable={setAvailableLayers}
            hiddenLayers={hiddenLayersSet}
            dimmedLayers={dimmedLayersSet}
            scale={scale}
            // SILGI MODU props
            eraseMode={eraseMode}
            onToggleEraseMode={() => setEraseMode((v) => !v)}
            hiddenLineKeys={hiddenLineKeys}
            hiddenInsertKeys={hiddenInsertKeys}
            hiddenTextKeys={hiddenTextKeys}
            // Tek tik / marquee → pending'e ekler (henuz silmez); confirm gerekir
            onEraseEntities={(lines, inserts, texts) => handleSelectForErase(lines, inserts, texts)}
            onUndoErase={handleUndoErase}
            canUndoErase={eraseHistory.length > 0}
            onRestoreAllErased={handleRestoreAllErased}
            // PENDING ERASE — viewer turuncu highlight + sag-ust onay/iptal toolbar
            pendingLineKeys={pendingLineKeysSet}
            pendingInsertKeys={pendingInsertKeysSet}
            pendingTextKeys={pendingTextKeysSet}
            onConfirmPendingErase={handleConfirmErase}
            onCancelPendingErase={handleCancelPendingErase}
            // PRD §3 + §5: cap-bazli dinamik renk; save sonrasi false -> layer ACI
            useDiameterColors={useDiameterColors}
            // Cap renkleri legend tiklama navigation
            focusedSegmentId={focusedSegmentId}
            focusedHaloColor={focusedHaloColor}
            focusVersion={focusVersion}
            className="h-[600px] lg:h-[calc(100vh-150px)]"
          />

          {/* Ipucu */}
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
            <p className="text-[11px] text-slate-600">
              <strong>Boru:</strong> Çizgiye tıkla → otomatik cap ataması (en yakin text → cap).
              <strong className="ml-2">Manuel:</strong> Sağ panelden hat ismi gir + &quot;Hesapla&quot; (default cap atar).
              <strong className="ml-2">Ekipman:</strong> Noktaya tıkla → malzeme adı + birim gir.
              <strong className="ml-2">Layer Gizle:</strong> Sol-üst toolbar&apos;da göz-kapalı butona bas → çizimde layer&apos;a tıkla.
            </p>
          </div>
        </div>

        {/* Sag: aktif layer formu + cap renk legend + ozet ekipman listesi */}
        <div className="space-y-3">
          {/* PRD §3: Dinamik renk legend — cizimle birebir esles
              Cap satirina tikla -> o cap'in segment'leri arasinda cycle */}
          <DiameterLegendPanel
            calculatedLayers={pendingCalculatedLayers}
            diameterColorsActive={useDiameterColors}
            activeDiameter={activeDiameter}
            activeIndex={activeDiameter ? activeIndex : 0}
            activeCount={activeDiameterSegments.length}
            onDiameterClick={handleCycleDiameter}
            onClearActive={handleClearActiveDiameter}
          />
          <LayerInfoSidebar
            selectedLayer={state.selectedLayer}
            config={selectedConfig}
            calculating={calculating || (!!state.selectedLayer && calculatingLayer === state.selectedLayer)}
            calculatedLayer={state.selectedLayer ? state.calculatedLayers[state.selectedLayer] ?? null : null}
            onCalculate={(layer) => {
              if (calculating || calculatingLayer === layer) {
                toast({ title: 'Devam eden hesaplama var', description: 'Bitince tekrar dene.', variant: 'destructive' });
                return;
              }
              if (state.calculatedLayers[layer]) {
                toast({ title: 'Zaten hesaplandi', description: layer });
                return;
              }
              // "Hesapla" butonu -> proximity hesaplama (en yakin cap-text -> cap).
              // Onceden bu callback eski handleCalculate (manuel default cap) idi —
              // auto-calc kaldirildigi icin "Hesapla" tetigi artik proximity'ye baglandi.
              const cfg = state.layerConfigs[layer];
              calculateLayerByProximity(layer, {
                hatIsmi: cfg?.hatIsmi,
                materialType: cfg?.materialType,
                defaultDiameter: cfg?.defaultDiameter,
              });
            }}
            onChangeConfig={(patch) => state.selectedLayer && updateLayerConfig(state.selectedLayer, patch)}
            onApplyDefaultDiameter={(d) => {
              if (!state.selectedLayer) return;
              const layer = state.selectedLayer;
              updateLayerConfig(layer, { defaultDiameter: d });
              // Hesaplanmis ise: bos diameter'li segment'lere apply et
              const cl = state.calculatedLayers[layer];
              if (cl) {
                let updatedCount = 0;
                cl.edgeSegments.forEach((es) => {
                  if (!es.diameter || es.diameter === 'Belirtilmemis') {
                    updateEdgeSegmentDiameter(layer, es.segment_id, d);
                    updatedCount += 1;
                  }
                });
                toast({
                  title: 'Çap uygulandı',
                  description: `${updatedCount} boş segment → ${d}`,
                });
              } else {
                toast({ title: 'Çap kaydedildi', description: 'Layer hesaplanınca uygulanacak.' });
              }
            }}
            onClearSelection={() => selectLayer(state.selectedLayer!)}
            onHideLayer={() => {
              if (!state.selectedLayer) return;
              const layer = state.selectedLayer;
              toggleLayerVisibility(layer);
              toast({ title: 'Layer gizlendi', description: layer });
              selectLayer(layer);
            }}
          />

          <LayerVisibilityPanel
            availableLayers={availableLayers}
            hiddenLayers={state.hiddenLayers}
            dimmedLayers={state.dimmedLayers}
            selectedLayer={state.selectedLayer}
            calculatedLayers={calculatedLayerNames}
            layerDiameters={layerDiametersMap}
            sprinklerLayers={state.sprinklerLayers}
            onToggle={toggleLayerVisibility}
            onToggleDimmed={toggleLayerDimmed}
            onToggleSprinkler={toggleSprinklerLayer}
            onShowAll={showAllLayers}
            onShowAllDimmed={showAllDimmed}
            onLayerSelect={(layer, _x, _y) => {
              // Layer panel'den layer adina tikla = SADECE sec.
              // tryChangeLayer onaysiz-hesaplama korumasi yapar.
              tryChangeLayer(layer);
            }}
          />

          <MetrajSummaryPanel
            calculatedLayers={state.calculatedLayers}
            markedEquipments={state.markedEquipments}
            onRemoveLayer={removeCalculatedLayer}
            onRemoveEquipment={removeEquipment}
            onEditEquipment={(key) => {
              const eq = state.markedEquipments[key];
              if (eq) {
                setPendingEquipment({
                  key: eq.key,
                  insertIndex: eq.insertIndex,
                  layer: eq.layer,
                  insertName: eq.insertName,
                  position: eq.position,
                });
                beginEditEquipment(key);
              }
            }}
            onApproveLayer={approveLayer}
            onSelectLayerCard={(layer) => {
              // Hesaplanmis Metraj kartina tikla:
              //  - Layer onayli ise onayi kaldir (revize moduna gec, cap renkleri donsun)
              //  - tryChangeLayer guard'indan gec (mevcut onaysiz layer varsa uyari)
              const cl = state.calculatedLayers[layer];
              if (cl?.approved) {
                unapproveLayer(layer);
              }
              // Onaysizlasinca tryChangeLayer (selectedLayer'da onaysiz mevcut var mi)
              // mantigini bozmamak icin direkt selectLayer cagiriyoruz: bu layer'in
              // kendisi zaten artik "onaysiz" durumda ve seciliyor.
              selectLayer(layer);
            }}
          />
        </div>
      </div>

      {/* Cap duzenleme popup (hesaplanmis segment) */}
      {editingSegment && (
        <DiameterEditPopup
          segment={editingSegment}
          onCancel={() => setEditingSegment(null)}
          onSave={(segmentId, newDiameter) => {
            // PRD §3: manuel cap ataminda AYNI LAYER'da endpoint paylasan
            // null komsulara da otomatik dagit (1-HOP). Hedef segmentin hangi
            // layer'a ait oldugunu bulup, sadece o layer'da propagation yap.
            let totalPropagated = 0;
            let hitLayer: string | null = null;
            for (const layer of Object.keys(state.calculatedLayers)) {
              const { target, propagated } = applyDiameterWithPropagation(layer, segmentId, newDiameter);
              if (target) {
                hitLayer = layer;
                totalPropagated = propagated;
                break;  // segment_id global unique; tek layer'da olur
              }
            }
            setEditingSegment(null);
            const desc = totalPropagated > 0
              ? `Segment #${segmentId}: ${newDiameter} · ${totalPropagated} komşuya yayıldı`
              : `Segment #${segmentId}: ${newDiameter}`;
            toast({ title: 'Çap güncellendi', description: desc });
            // Defensive: hicbir layer'da bulunamadiysa eski davranisi koru
            if (!hitLayer) {
              for (const layer of Object.keys(state.calculatedLayers)) {
                updateEdgeSegmentDiameter(layer, segmentId, newDiameter);
              }
            }
          }}
        />
      )}

      {/* Ekipman popup */}
      {pendingEquipment && state.editingEquipmentKey && (
        <EquipmentDetailPopup
          pending={pendingEquipment}
          existing={editingEquipmentExisting}
          onCancel={() => { cancelEditEquipment(); setPendingEquipment(null); }}
          onSave={(eq) => {
            saveEquipment(eq);
            setPendingEquipment(null);
            toast({ title: 'Ekipman kaydedildi', description: `${eq.userLabel} (${eq.unit})` });
          }}
          onDelete={editingEquipmentExisting ? () => {
            removeEquipment(editingEquipmentExisting.key);
            setPendingEquipment(null);
          } : undefined}
        />
      )}
    </div>
  );
}
