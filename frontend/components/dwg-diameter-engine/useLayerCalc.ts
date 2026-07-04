'use client';

/**
 * useLayerCalc — tek layer icin SAF geometri + uzunluk hesabi tetikler.
 *
 * OPERASYON FAZ 1-2: eski useProximityCalc'in yerini aldi. Otomatik cap
 * atama (use_proximity_diameter) TAMAMEN KALDIRILDI — backend artik yalniz
 * segment/uzunluk/junction doner, TUM segmentler capsiz (diameter="") gelir.
 * Cap atamasi kullanicinin isidir: Cap Kalemleri (BucketPanel) + tikla-etiketle.
 *
 * Sonuc: edge_segments → onResult callback ile DwgProjectWorkspace state'ine
 * (calculatedLayers) yazilir; capsiz segmentler viewer'da NEON gorunur.
 */

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { EdgeSegment } from '@/components/dwg-metraj';
import type { CalculatedLayer } from '@/components/dwg-workspace/types';
import type { MetrajResult, LayerCalcResult } from './types';

interface UseLayerCalcArgs {
  fileId: string;
  scale: number;
  sprinklerLayers: string[];
  onResult: (r: LayerCalcResult) => void;
  /** Engine 404 (file_id gecersiz) algilandiginda cagrilir — parent
   *  uploader'i tekrar acabilir (cache TTL 15dk / deploy sonrasi). */
  onFileIdInvalid?: () => void;
}

export function useLayerCalc({ fileId, scale, sprinklerLayers, onResult, onFileIdInvalid }: UseLayerCalcArgs) {
  /** Hesaplama suren layer adi — UI spinner icin */
  const [calculatingLayer, setCalculatingLayer] = useState<string | null>(null);

  const calculateLayer = useCallback(
    async (layer: string, opts?: { hatIsmi?: string; materialType?: string }) => {
      if (!layer) return;
      setCalculatingLayer(layer);
      try {
        const hatTipiMap: Record<string, string> = { [layer]: opts?.hatIsmi || layer };
        const materialTypeMap: Record<string, string> = {};
        if (opts?.materialType) materialTypeMap[layer] = opts.materialType;

        const params = new URLSearchParams({
          discipline: 'mechanical',
          // Birim %100 kullanici secimi (upload dialogu); backend tahmin etmez.
          ...(scale && scale > 0 ? { scale: String(scale) } : {}),
          file_id: fileId,
          selected_layers: JSON.stringify([layer]),
          layer_hat_tipi: JSON.stringify(hatTipiMap),
          layer_material_type: JSON.stringify(materialTypeMap),
          sprinkler_layers: JSON.stringify(sprinklerLayers),
          // use_proximity_diameter + layer_default_diameter KALDIRILDI —
          // backend'de otomatik cap atama motoru artik yok (operasyon Faz 2).
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

        const calculated: CalculatedLayer = {
          layer,
          hatIsmi: opts?.hatIsmi ?? layer,
          materialType: opts?.materialType ?? '',
          defaultDiameter: '',
          edgeSegments: edgeSegs,
          junctionPoints: junctions,
          totalLength: totalLen,
          computedAt: Date.now(),
          approved: false,
        };

        onResult({ layer, calculated, raw: data });

        toast({
          title: `Layer hesaplandı: ${layer}`,
          description: `${totalLen.toFixed(1)} m · ${edgeSegs.length} segment — hepsi etiket bekliyor (neon)`,
        });
        toast({
          title: 'Çap ataması manuel',
          description: 'Sağdaki "Çap Kalemleri" panelinden kalem seç, çizimde borulara tıkla.',
        });
      } catch (e: any) {
        const status = e?.response?.status as number | undefined;
        const detail = e?.response?.data?.detail ?? e?.response?.data?.message;
        console.error('[useLayerCalc] HATA:', { status, data: e?.response?.data, message: e?.message });

        // Engine cache invalid: 404 (Dosya bulunamadi) veya NestJS'in 422'ye
        // cevirdigi file_id miss. Hem status hem detail metnine bak.
        const isFileIdInvalid =
          status === 404 ||
          (typeof detail === 'string' && /dosya bulunamad/i.test(detail));

        if (isFileIdInvalid && onFileIdInvalid) {
          toast({
            title: 'Sunucu dosya önbelleği süresi doldu',
            description: 'Aynı DWG\'yi tekrar yükle — etiketlerin kayıtlı, otomatik geri gelecek.',
            variant: 'destructive',
          });
          onFileIdInvalid();
          return;
        }

        const rawMsg = detail ?? e?.message ?? 'Hesaplama hatası';
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
