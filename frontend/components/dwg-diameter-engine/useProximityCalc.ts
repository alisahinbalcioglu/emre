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
  /** Engine 404 (file_id gecersiz) algilandiginda cagrilir — parent
   *  uploader'i tekrar acabilir. Cloud Run revision switch sonrasi cache
   *  ephemeral oldugundan file_id eskimis olabilir. */
  onFileIdInvalid?: () => void;
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

export function useProximityCalc({ fileId, scale, sprinklerLayers, onResult, onFileIdInvalid }: UseProximityCalcArgs) {
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
          // max_distance KALDIRILDI — saf 'en yakin text -> cap' mantigi.
          // Filter yok, BFS yok, mesafe limiti yok. Kullanici talimati: 'zor
          // olmamali'. Run'a en yakin ne text varsa cap olur. Yanlissa kullanici
          // DiameterEditPopup ile manuel duzeltir.
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
          approved: false,  // yeni hesaplanan layer onaysiz baslar
        };

        onResult({ layer, calculated, raw: data, summary });

        // Detayli rapor: kac segment proximity'den, kac segment miras, kac segment bos.
        // Backend warning'ler parse edilir: "Inheritance: X segment T-junction komsusundan..."
        const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
        // DEBUG: backend warnings array'ini console'a tam dok — kullanici F12'den
        // root cause'u (regex_no_match, label_reject, layer_off_skip vb.) gorebilsin.
        // Pool 0 / 0 atama senaryolarinda diagnostic mesajlar burada.
        console.warn(`[Proximity ${layer}] backend warnings:`, warnings);
        console.warn(`[Proximity ${layer}] summary:`, summary);
        const inhMatch = warnings.find((w) => w.startsWith('Inheritance:'))?.match(/Inheritance:\s+(\d+)\s+segment/);
        const inheritedCount = inhMatch ? Number(inhMatch[1]) || 0 : 0;
        const emptyCount = edgeSegs.filter((es) => !es.diameter || es.diameter === 'Belirtilmemis').length;
        const proximityCount = (summary?.assignedCount ?? 0) - inheritedCount;

        const descParts = [`${totalLen.toFixed(1)} m`, `${edgeSegs.length} segment`];
        if (proximityCount > 0) descParts.push(`${proximityCount} proximity`);
        if (inheritedCount > 0) descParts.push(`${inheritedCount} miras`);
        if (emptyCount > 0) descParts.push(`${emptyCount} boş`);
        toast({
          title: `Layer hesaplandı: ${layer}`,
          description: descParts.join(' · '),
          variant: emptyCount > 0 ? 'default' : 'default',
        });
        if (emptyCount > 0) {
          toast({
            title: `${emptyCount} segment çapsız`,
            description: 'Manuel çap atayabilirsin (segmente tıkla) veya "Varsayılan Çap" ile toplu uygula.',
          });
        }
      } catch (e: any) {
        const status = e?.response?.status as number | undefined;
        const detail = e?.response?.data?.detail ?? e?.response?.data?.message;
        console.error('[useProximityCalc] HATA:', { status, data: e?.response?.data, message: e?.message });

        // Engine cache invalid: 404 (Dosya bulunamadi) veya 422'lik file_id miss
        // (NestJS proxy 404'u 422'ye dondurebilir). Hem status hem detail metnine bak.
        const isFileIdInvalid =
          status === 404 ||
          (typeof detail === 'string' && /dosya bulunamad/i.test(detail));

        if (isFileIdInvalid && onFileIdInvalid) {
          toast({
            title: 'Sunucu cache resetlendi',
            description: 'Cloud Run engine yeniden baslatildi. DWG dosyasini tekrar yuklemen gerekiyor.',
            variant: 'destructive',
          });
          onFileIdInvalid();
          return;
        }

        const rawMsg = detail ?? e?.message ?? 'Proximity hesaplama hatasi';
        const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
        const shortMsg = msg.length > 200 ? msg.slice(0, 200) + '... (F12 Console)' : msg;
        toast({ title: 'Hata', description: shortMsg, variant: 'destructive' });
      } finally {
        setCalculatingLayer(null);
      }
    },
    [fileId, scale, sprinklerLayers, onResult, onFileIdInvalid],
  );

  return { calculatingLayer, calculateLayer };
}
