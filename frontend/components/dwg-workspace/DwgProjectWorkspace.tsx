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

import React, { useState, useMemo, useEffect } from 'react';
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
import DiameterPromptPopup from './DiameterPromptPopup';
import { useWorkspaceState } from './useWorkspaceState';
import type { MarkedEquipment, CalculatedLayer } from './types';

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
    addCalculatedLayer, removeCalculatedLayer,
    updateEdgeSegmentDiameter,
    beginEditEquipment, cancelEditEquipment, saveEquipment, removeEquipment,
    setLastClickedLayer, removeSprinklerLayer, toggleSprinklerLayer,
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

  const [calculating, setCalculating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<EdgeSegment | null>(null);
  const [pendingEquipment, setPendingEquipment] = useState<null | {
    key: string; insertIndex: number; layer: string; insertName: string; position: [number, number];
  }>(null);

  /** Layer'a tiklayinca acilan inline cap girme popup'i. AutoCAD-vari workflow:
   *  cizgiye tikla → quick-select Ø20/Ø25/.../Ø160 veya manuel gir → "Hesapla"
   *  yapinca o layer'in defaultDiameter'i kullanilir. */
  const [diameterPopup, setDiameterPopup] = useState<null | {
    layer: string; x: number; y: number;
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

      if (diameterPopup) { setDiameterPopup(null); return; }
      if (pendingEquipment) { setPendingEquipment(null); return; }
      if (state.editingEquipmentKey) { cancelEditEquipment(); return; }
      if (editingSegment) { setEditingSegment(null); return; }
      if (state.selectedLayer) { selectLayer(state.selectedLayer); return; }  // toggle off
      if (hideMode) { setHideMode(false); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diameterPopup, pendingEquipment, state.editingEquipmentKey, editingSegment, state.selectedLayer, hideMode, cancelEditEquipment, selectLayer]);

  const calculatedEdgesByLayer = useMemo(() => {
    const map: Record<string, EdgeSegment[]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      map[layer] = cl.edgeSegments;
    }
    return map;
  }, [state.calculatedLayers]);

  const calculatedJunctionsByLayer = useMemo(() => {
    const map: Record<string, [number, number][]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
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

  const handleCalculate = async (forceLayer?: string, configOverride?: { defaultDiameter?: string; hatIsmi?: string; materialType?: string }) => {
    const layer = forceLayer ?? state.selectedLayer;
    if (!layer) return;
    if (state.calculatedLayers[layer]) {
      if (!forceLayer) {
        toast({ title: 'Bu layer zaten hesaplandı', description: 'Önce özetten kaldırın.' });
      }
      return;
    }
    const baseCfg = state.layerConfigs[layer] ?? { hatIsmi: '', materialType: '', defaultDiameter: '' };
    const cfg = configOverride ? { ...baseCfg, ...configOverride } : baseCfg;
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

      const formData = new FormData();
      const res = await api.post<MetrajResult>(
        `/dwg-engine/parse?${params.toString()}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 },
      );

      const data = res.data as any;
      const edgeSegs: EdgeSegment[] = Array.isArray(data.edge_segments) ? data.edge_segments : [];
      const junctions: [number, number][] = Array.isArray(data.junction_points)
        ? (data.junction_points as [number, number][])
        : [];
      const totalLen = edgeSegs.reduce((sum, e) => sum + (e.length || 0), 0);

      const calcLayer: CalculatedLayer = {
        layer,
        hatIsmi: cfg.hatIsmi,
        materialType: cfg.materialType,
        defaultDiameter: cfg.defaultDiameter,
        edgeSegments: edgeSegs,
        junctionPoints: junctions,
        totalLength: totalLen,
        computedAt: Date.now(),
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

  const handleLineClick = (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => {
    if (calculating) return;
    // Layer Gizle Modu (toolbar toggle) VEYA Shift+click → layer gizle/goster.
    // Normal click → layer sec + inline cap girme popup'i ac.
    if (hideMode || line.shiftKey) {
      toggleLayerVisibility(line.layer);
      toast({
        title: state.hiddenLayers.includes(line.layer) ? 'Layer gosterildi' : 'Layer gizlendi',
        description: line.layer,
      });
      return;
    }
    setLastClickedLayer(line.layer);
    selectLayer(line.layer);
    // Cap popup'ini tiklanan konumda ac.
    setDiameterPopup({ layer: line.layer, x: line.screenX, y: line.screenY });
    // ARKA PLANDA OTOMATIK HESAPLA — kullanici cap girmeden de T noktalarinda
    // bolunme aktif olsun, her segment ayri secilebilir hale gelsin.
    // (Cap popup kapatilirsa bile hesaplama zaten yapilmis olur.)
    if (!state.calculatedLayers[line.layer]) {
      handleCalculate(line.layer);
    }
  };

  const handleInsertClick = (ins: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => {
    const key = `${ins.layer}:${ins.insertIndex}`;
    setLastClickedLayer(ins.layer);
    setPendingEquipment({ ...ins, key });
    beginEditEquipment(key);
  };

  const handleCircleClick = (c: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => {
    // Sembole tiklayinca son tiklanan layer'i kaydet (genel amac).
    // Sprinkler isaretleme artik LayerVisibilityPanel'de damla ikonuyla yapilir.
    setLastClickedLayer(c.layer);
  };

  const handleConfirmAll = () => {
    const layers = Object.values(state.calculatedLayers);
    const equipments = Object.values(state.markedEquipments);
    if (layers.length === 0 && equipments.length === 0) {
      toast({ title: 'Boş', description: 'Hesaplanmış bir şey yok.', variant: 'destructive' });
      return;
    }

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
            {Object.keys(state.calculatedLayers).length} layer hesaplandı · {Object.keys(state.markedEquipments).length} ekipman işaretli
          </p>
        </div>
        <button
          onClick={onReset}
          className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
        >
          Yeni DWG Yükle
        </button>
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
            className="h-[600px] lg:h-[calc(100vh-150px)]"
          />

          {/* Ipucu */}
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
            <p className="text-[11px] text-slate-600">
              <strong>Boru:</strong> Çizgiye tıkla → sağda hat ismi gir → &quot;Hesapla&quot;.
              <strong className="ml-2">Ekipman:</strong> Noktaya tıkla → malzeme adı + birim gir.
              <strong className="ml-2">Layer Gizle:</strong> Sol-üst toolbar&apos;da göz-kapalı butona bas → cizimde layer&apos;a tıkla. Geri getirmek icin sag paneldeki &quot;Layer Goruntusu&quot; listesinden goz ikonu.
            </p>
          </div>
        </div>

        {/* Sag: aktif layer formu + ozetsa ekipman listesi */}
        <div className="space-y-3">
          <LayerInfoSidebar
            selectedLayer={state.selectedLayer}
            config={selectedConfig}
            calculating={calculating}
            onChangeConfig={(patch) => state.selectedLayer && updateLayerConfig(state.selectedLayer, patch)}
            onCalculate={handleCalculate}
            onClearSelection={() => selectLayer(state.selectedLayer!)}
            onHideLayer={() => {
              if (!state.selectedLayer) return;
              const layer = state.selectedLayer;
              toggleLayerVisibility(layer);
              toast({ title: 'Layer gizlendi', description: layer });
              // Secimi de temizle ki sidebar "Cizimde bir boru layer'ina tiklayin" mesajina donsun
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
            onLayerSelect={(layer, x, y) => {
              setLastClickedLayer(layer);
              selectLayer(layer);
              setDiameterPopup({ layer, x, y });
              if (!state.calculatedLayers[layer]) {
                handleCalculate(layer);  // Otomatik hesapla (T'lerde bolunme)
              }
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
            onConfirmAll={handleConfirmAll}
          />
        </div>
      </div>

      {/* Cap duzenleme popup (hesaplanmis segment) */}
      {editingSegment && (
        <DiameterEditPopup
          segment={editingSegment}
          onCancel={() => setEditingSegment(null)}
          onSave={(segmentId, newDiameter) => {
            // Tum hesaplanmis layer'larda segmentId'yi bul ve guncelle
            for (const layer of Object.keys(state.calculatedLayers)) {
              updateEdgeSegmentDiameter(layer, segmentId, newDiameter);
            }
            setEditingSegment(null);
            toast({ title: 'Çap güncellendi', description: `Segment #${segmentId}: ${newDiameter}` });
          }}
        />
      )}

      {/* Layer cap girme popup (cizimde layer'a tıklayinca acilir) */}
      {diameterPopup && (
        <DiameterPromptPopup
          layer={diameterPopup.layer}
          currentDiameter={state.layerConfigs[diameterPopup.layer]?.defaultDiameter}
          hatIsmi={state.layerConfigs[diameterPopup.layer]?.hatIsmi}
          x={diameterPopup.x}
          y={diameterPopup.y}
          onApply={(d) => {
            const layer = diameterPopup.layer;
            updateLayerConfig(layer, { defaultDiameter: d });
            setDiameterPopup(null);
            // Hesaplanmis ise: mevcut segment'lerden cap'i bos olanlara apply et
            // (kullanicinin yeni atadigi segment'leri ezme).
            // Hesaplanmamis ise: arka planda hesaplama baslat (otomatik).
            if (state.calculatedLayers[layer]) {
              // Segment-level cap update (frontend-only, backend tetiklenmez)
              const cl = state.calculatedLayers[layer];
              let updatedCount = 0;
              cl.edgeSegments.forEach((es) => {
                if (!es.diameter || es.diameter === 'Belirtilmemis') {
                  updateEdgeSegmentDiameter(layer, es.segment_id, d);
                  updatedCount += 1;
                }
              });
              toast({
                title: 'Çap atandı',
                description: `${layer}: ${d} → ${updatedCount} segment guncellendi`,
              });
            } else {
              toast({ title: 'Çap atandı', description: `${layer}: ${d} — hesaplaniyor...` });
              handleCalculate(layer, { defaultDiameter: d });
            }
          }}
          onClose={() => setDiameterPopup(null)}
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
