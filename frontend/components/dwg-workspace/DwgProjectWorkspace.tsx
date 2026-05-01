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

import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { DxfPixiViewer, DiameterEditPopup, type EdgeSegment } from '@/components/dwg-viewer';
import type { MetrajResult } from '@/components/dwg-metraj/MetrajTable';
import LayerInfoSidebar from './LayerInfoSidebar';
import MetrajSummaryPanel from './MetrajSummaryPanel';
import EquipmentDetailPopup from './EquipmentDetailPopup';
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
    toggleAiDiameter,
    setLastClickedLayer, confirmSprinklerLayer, removeSprinklerLayer,
    setAiDetectedSprinklerCount,
  } = useWorkspaceState(fileId, scale);

  const [calculating, setCalculating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<EdgeSegment | null>(null);
  const [pendingEquipment, setPendingEquipment] = useState<null | {
    key: string; insertIndex: number; layer: string; insertName: string; position: [number, number];
  }>(null);

  const selectedConfig = state.selectedLayer ? state.layerConfigs[state.selectedLayer] ?? null : null;

  const calculatedEdgesByLayer = useMemo(() => {
    const map: Record<string, EdgeSegment[]> = {};
    for (const [layer, cl] of Object.entries(state.calculatedLayers)) {
      map[layer] = cl.edgeSegments;
    }
    return map;
  }, [state.calculatedLayers]);

  const markedEquipmentKeys = useMemo(
    () => new Set(Object.keys(state.markedEquipments)),
    [state.markedEquipments]
  );

  const handleCalculate = async () => {
    if (!state.selectedLayer) return;
    if (state.calculatedLayers[state.selectedLayer]) {
      toast({ title: 'Bu layer zaten hesaplandı', description: 'Önce özetten kaldırın.' });
      return;
    }
    const layer = state.selectedLayer;
    const cfg = selectedConfig ?? { hatIsmi: '', materialType: '', defaultDiameter: '' };
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
        use_ai_diameter: String(state.useAiDiameter),
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
      const totalLen = edgeSegs.reduce((sum, e) => sum + (e.length || 0), 0);

      const calcLayer: CalculatedLayer = {
        layer,
        hatIsmi: cfg.hatIsmi,
        materialType: cfg.materialType,
        defaultDiameter: cfg.defaultDiameter,
        edgeSegments: edgeSegs,
        totalLength: totalLen,
        computedAt: Date.now(),
      };
      addCalculatedLayer(calcLayer);

      // Backend auto_detect_sprinklers ozeti — bilgi satirinda gosterilir.
      const sd = data.sprinkler_detection;
      if (sd && typeof sd.center_count === 'number') {
        setAiDetectedSprinklerCount(sd.center_count);
      }

      toast({
        title: 'Layer hesaplandı',
        description: `${layer}: ${totalLen.toFixed(1)} m, ${edgeSegs.length} segment`,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.detail ?? 'Metraj hesaplanamadı';
      toast({ title: 'Hata', description: msg, variant: 'destructive' });
    } finally {
      setCalculating(false);
    }
  };

  const handleLineClick = (line: { layer: string; index: number }) => {
    if (calculating) return;
    setLastClickedLayer(line.layer);
    selectLayer(line.layer);
  };

  const handleInsertClick = (ins: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => {
    const key = `${ins.layer}:${ins.insertIndex}`;
    setLastClickedLayer(ins.layer);
    setPendingEquipment({ ...ins, key });
    beginEditEquipment(key);
  };

  const handleCircleClick = (c: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => {
    // Sadece aday olarak kaydet — kullanici sag panel'deki "Sprinkler Yap" butonu ile onaylar.
    setLastClickedLayer(c.layer);
  };

  const handleConfirmSprinkler = () => {
    const layer = state.lastClickedLayer;
    if (!layer) {
      toast({ title: 'Once bir sembole tikla', description: 'Ekrandan herhangi bir sprinkler sembolune tiklayin.', variant: 'destructive' });
      return;
    }
    const wasIn = state.sprinklerLayers.includes(layer);
    confirmSprinklerLayer();
    toast({
      title: wasIn ? 'Sprinkler layer kaldirildi' : 'Sprinkler layer eklendi',
      description: `${layer}${!wasIn ? ' — hesaplamada sprinkler olarak kullanilacak.' : ''}`,
    });
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

    // Ekipmanlari da ayri "layer" gibi ekle (adet bazli)
    const eqGroups = equipments.reduce<Record<string, { count: number; unit: string; label: string }>>((acc, eq) => {
      const k = `${eq.userLabel}__${eq.unit}`;
      if (!acc[k]) acc[k] = { count: 0, unit: eq.unit, label: eq.userLabel };
      acc[k].count += 1;
      return acc;
    }, {});
    for (const g of Object.values(eqGroups)) {
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
          material_type: `Ekipman · ${g.unit}`,
          diameter: '',
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
        {/* Sol: PixiJS (WebGL) Viewer */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <DxfPixiViewer
            fileId={fileId}
            calculatedEdgesByLayer={calculatedEdgesByLayer}
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
            onCacheMiss={() => {
              // Backend cache'inde fileId yok (TTL doldu / Render free tier
              // worker restart oldu). Workspace'i upload zone'a sifirla.
              toast({
                title: 'Dosya suresi doldu',
                description: 'DWG motoru cache\'inden dustu, lutfen tekrar yukleyin.',
                variant: 'destructive',
              });
              onReset();
            }}
            className="h-[600px] lg:h-[calc(100vh-150px)]"
          />

          {/* Ipucu */}
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
            <p className="text-[11px] text-slate-600">
              <strong>Boru:</strong> Çizgiye tıkla → sağda hat ismi gir → &quot;Hesapla&quot;.
              <strong className="ml-2">Ekipman:</strong> Noktaya tıkla → malzeme adı + birim gir.
            </p>
          </div>
        </div>

        {/* Sag: aktif layer formu + ozetsa ekipman listesi */}
        <div className="space-y-3">
          <LayerInfoSidebar
            selectedLayer={state.selectedLayer}
            config={selectedConfig}
            useAiDiameter={state.useAiDiameter}
            calculating={calculating}
            onChangeConfig={(patch) => state.selectedLayer && updateLayerConfig(state.selectedLayer, patch)}
            onToggleAi={toggleAiDiameter}
            onCalculate={handleCalculate}
            onClearSelection={() => selectLayer(state.selectedLayer!)}
          />

          {/* Sprinkler tespit info — AI otomatik bulduğunda gösterilir.
              Manuel layer secim panel kaldirildi: sprinkler tespit artik
              backend'de otomatik (auto_detect_sprinklers, AI block sınıflandırma
              + entity type filtre). Kullanici fark ederse viewer'da tıklayarak
              ekle/cikar yapabilir (mevcut handleCircleClick / handleInsertClick). */}
          {state.aiDetectedSprinklerCount !== undefined && state.aiDetectedSprinklerCount > 0 && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-cyan-400" />
                <p className="text-xs text-slate-700">
                  <span className="font-semibold text-cyan-700">{state.aiDetectedSprinklerCount}</span>
                  <span className="text-slate-600"> sprinkler AI ile tespit edildi.</span>
                </p>
              </div>
              <p className="mt-1 pl-4 text-[10px] text-slate-500">
                Yanlissa: viewer'da yanlis simgeyi tıkla, sağ panelden "Sprinkler degil" işaretle.
              </p>
            </div>
          )}

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
