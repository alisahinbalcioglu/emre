'use client';

/**
 * useProximityCalc — tek layer icin deterministic proximity diameter
 * (en yakin text -> cap) hesaplamasi tetikler.
 *
 * Mevcut /dwg-engine/parse endpoint'i kullanir, sadece use_proximity_diameter=true
 * query param'i ekler. Backend AI'yi calistirmaz, sadece geometry text'leri ile
 * Euclidean nearest text. PRD karari.
 *
 * Sonuc: edge_segments dolu diameter field'i ile gelir → onResult callback ile
 * DwgProjectWorkspace state'ine (calculatedLayers) yazilir.
 */

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { EdgeSegment } from '@/components/dwg-metraj';
import type {
  CalculatedLayer,
  MetrajResult,
  ProximityCalcResult,
  ProximitySummary,
} from './types';

interface UseProximityCalcArgs {
  fileId: string;
  scale: number;
  sprinklerLayers: string[];
  onResult: (r: ProximityCalcResult) => void;
}

const PROXIMITY_WARN_PREFIX = 'Proximity:';

function parseProximitySummary(layer: string, totalSegments: number, warnings: string[] | undefined): ProximitySummary | undefined {
  if (!warnings || warnings.length === 0) return undefined;
  // Backend warning ornegi: "Proximity: 142/142 segment cap aldi (38 text havuzdan)"
  const proxLine = warnings.find((w) => w.startsWith(PROXIMITY_WARN_PREFIX));
  if (!proxLine) return undefined;
  const m = proxLine.match(/Proximity:\s+(\d+)\/(\d+)\s+segment.*\((\d+)\s+text/);
  if (!m) return { layer, assignedCount: 0, totalSegments, textPoolSize: 0, warnings };
  return {
    layer,
    assignedCount: Number(m[1]) || 0,
    totalSegments: Number(m[2]) || totalSegments,
    textPoolSize: Number(m[3]) || 0,
    warnings: warnings.filter((w) => w !== proxLine),
  };
}

export function useProximityCalc({ fileId, scale, sprinklerLayers, onResult }: UseProximityCalcArgs) {
  /** Hesaplama suren layer adi — UI spinner icin */
  const [calculatingLayer, setCalculatingLayer] = useState<string | null>(null);

  const calculateLayer = useCallback(
    async (layer: string, opts?: { hatIsmi?: string; materialType?: string; defaultDiameter?: string }) => {
      if (!layer) return;
      setCalculatingLayer(layer);
      try {
        // Layer-level default cap ZATEN proximity'nin atayamadiklarini doldurur.
        // Yani proximity onceliklidir; default cap fallback'tir.
        const hatTipiMap: Record<string, string> = { [layer]: opts?.hatIsmi || layer };
        const materialTypeMap: Record<string, string> = {};
        if (opts?.materialType) materialTypeMap[layer] = opts.materialType;
        const defaultDiameterMap: Record<string, string> = {};
        if (opts?.defaultDiameter?.trim()) defaultDiameterMap[layer] = opts.defaultDiameter.trim();

        const params = new URLSearchParams({
          discipline: 'mechanical',
          scale: String(scale),
          file_id: fileId,
          selected_layers: JSON.stringify([layer]),
          layer_hat_tipi: JSON.stringify(hatTipiMap),
          layer_material_type: JSON.stringify(materialTypeMap),
          layer_default_diameter: JSON.stringify(defaultDiameterMap),
          sprinkler_layers: JSON.stringify(sprinklerLayers),
          use_proximity_diameter: 'true',   // PRD kritik flag
          // 500mm = 50cm: cap text borunun BITISIK noktasinda olur. Daha uzak
          // text'ler (sayfa basligi, kapasite degeri, sembol etiketi) atanmasin.
          // Sihhi tesisat planlarinda "25", "50" gibi pure sayilar yazildigi
          // icin sıkı mesafe esigi yanlis atamayi onler.
          proximity_max_distance: '500',
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

        const summary = parseProximitySummary(layer, edgeSegs.length, data.warnings);

        const calculated: CalculatedLayer = {
          layer,
          hatIsmi: opts?.hatIsmi ?? layer,
          materialType: opts?.materialType ?? '',
          defaultDiameter: opts?.defaultDiameter ?? '',
          edgeSegments: edgeSegs,
          junctionPoints: junctions,
          totalLength: totalLen,
          computedAt: Date.now(),
        };

        onResult({ layer, calculated, raw: data, summary });

        const descParts = [`${totalLen.toFixed(1)} m`, `${edgeSegs.length} segment`];
        if (summary) descParts.push(`${summary.assignedCount}/${summary.totalSegments} cap atandi`);
        toast({ title: `Layer hesaplandı: ${layer}`, description: descParts.join(' · ') });
      } catch (e: any) {
        console.error('[useProximityCalc] HATA:', {
          status: e?.response?.status,
          data: e?.response?.data,
          message: e?.message,
        });
        const rawMsg = e?.response?.data?.message ?? e?.response?.data?.detail ?? e?.message ?? 'Proximity hesaplama hatasi';
        const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
        const shortMsg = msg.length > 200 ? msg.slice(0, 200) + '... (F12 Console)' : msg;
        toast({ title: 'Hata', description: shortMsg, variant: 'destructive' });
      } finally {
        setCalculatingLayer(null);
      }
    },
    [fileId, scale, sprinklerLayers, onResult],
  );

  return { calculatingLayer, calculateLayer };
}
