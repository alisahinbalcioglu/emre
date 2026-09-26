'use client';

/**
 * useLayerCalc — tek layer icin SAF geometri + uzunluk hesabi tetikler.
 *
 * OPERASYON FAZ 1-2: eski useProximityCalc'in yerini aldi. Otomatik cap
 * atama (use_proximity_diameter) TAMAMEN KALDIRILDI — backend artik yalniz
 * segment/uzunluk/junction doner, TUM segmentler capsiz (diameter="") gelir.
 * Cap atamasi kullanicinin isidir: Adim 2 cap listesi + tikla-etiketle.
 *
 * 25.09: BIRIM ve 💧 ISARETLERI CAGRI ANINDA verilir. Kanca bunlari render
 * anindaki kapanistan okusaydi, birim penceresinde "Kaydet"ten hemen sonra
 * baslayan yeniden ayirma ESKI birimle kosar ve yanlis `scaleUsed` yazardi.
 * Hesap kaydina ayni degerler damgalanir (bayatlik tespiti bunlari okur).
 *
 * Sonuc: onResult ile calisma alanina verilir; basari bildirimi calisma
 * alaninindir (geri alinabilir islem bildirimi). Kanca yalniz HATA bildirir.
 *
 * ISTEK IPTALI (25.09 inceleme): bilesen kaldirilinca suren istekler iptal
 * edilir ve sonuclari / hatalari HIC islenmez. Eskiden "Yeni DWG" sonrasi
 * gelen eski 404, sokulmus bilesenin `onFileIdInvalid` zincirini calistirip
 * YENI dosyanin yukleme durumunu siliyordu. Ayni yol `iptalEt` ile kullaniciya
 * da acik: birim ayirma surerken degisince eski birimli istek durdurulur.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import type { EdgeSegment } from '@/components/dwg-metraj';
import type { CalculatedLayer } from '@/components/dwg-workspace/types';
import type { MetrajResult, LayerCalcResult } from './types';

interface UseLayerCalcArgs {
  fileId: string;
  onResult: (r: LayerCalcResult) => void;
  /** Engine 404 (file_id gecersiz) algilandiginda cagrilir — parent
   *  uploader'i tekrar acabilir (cache TTL / deploy sonrasi). */
  onFileIdInvalid?: () => void;
}

export interface HesapSecenekleri {
  /** 't' = T noktalarinda bol (varsayilan), 'none' = bolmeden (entity = parca). */
  splitMode: 't' | 'none';
  /** Cizim birimi (metre carpani) — CAGRI ANINDAKI deger. */
  scale: number;
  /** 💧 isaretli layer'lar — CAGRI ANINDAKI deger. */
  sprinklerLayers: string[];
  hatIsmi?: string;
  materialType?: string;
}

export function useLayerCalc({ fileId, onResult, onFileIdInvalid }: UseLayerCalcArgs) {
  /** Hesaplama suren layer adi — UI spinner icin */
  const [calculatingLayer, setCalculatingLayer] = useState<string | null>(null);

  const denetleyicilerRef = useRef(new Set<AbortController>());
  /** Suren istekleri iptal eder — sonuclari / hatalari HIC islenmez. */
  const surenleriIptalEt = useCallback(() => {
    const kume = denetleyicilerRef.current;
    kume.forEach((d) => d.abort());
    kume.clear();
  }, []);
  useEffect(() => surenleriIptalEt, [surenleriIptalEt]);

  /** KULLANICI iptali (birim ayirma surerken degisti): istek durur, gosterge
   *  hemen kapanir. Iptal edilen istegin `finally`si gostergeye DOKUNMAZ —
   *  arkasindan baslayan yeni istegin "ayriliyor" durumunu silmesin. */
  const iptalEt = useCallback(() => {
    surenleriIptalEt();
    setCalculatingLayer(null);
  }, [surenleriIptalEt]);

  const calculateLayer = useCallback(
    async (layer: string, opts: HesapSecenekleri): Promise<boolean> => {
      if (!layer) return false;
      const denetleyici = new AbortController();
      denetleyicilerRef.current.add(denetleyici);
      setCalculatingLayer(layer);
      try {
        const hatTipiMap: Record<string, string> = { [layer]: opts.hatIsmi || layer };
        const materialTypeMap: Record<string, string> = {};
        if (opts.materialType) materialTypeMap[layer] = opts.materialType;

        const params = new URLSearchParams({
          discipline: 'mechanical',
          // Birim %100 kullanici secimi / otomatik tespit; backend tahmin etmez.
          ...(opts.scale && opts.scale > 0 ? { scale: String(opts.scale) } : {}),
          file_id: fileId,
          selected_layers: JSON.stringify([layer]),
          layer_hat_tipi: JSON.stringify(hatTipiMap),
          layer_material_type: JSON.stringify(materialTypeMap),
          sprinkler_layers: JSON.stringify(opts.sprinklerLayers),
          // Bolme modu — yalniz 'none' gonderilir ('t' varsayilan, parametre yok)
          ...(opts.splitMode === 'none' ? { split_mode: 'none' } : {}),
        });

        const formData = new FormData();
        const res = await api.post<MetrajResult>(
          `/dwg-engine/parse?${params.toString()}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000, signal: denetleyici.signal },
        );
        if (denetleyici.signal.aborted) return false;
        const data = res.data as any;
        const edgeSegs: EdgeSegment[] = Array.isArray(data.edge_segments) ? data.edge_segments : [];
        const junctions: [number, number][] = Array.isArray(data.junction_points)
          ? (data.junction_points as [number, number][])
          : [];
        const totalLen = edgeSegs.reduce((sum, e) => sum + (e.length || 0), 0);
        // T modu + hic 💧 isareti yok + motor "su katmanda N sembol borularin
        // USTUNDE" olctu: kullanici isaretlemeyi unutmus olabilir (02.09).
        // Karar degil, olculmus ipucu — Adim 2'de satir ici gosterilir.
        const adaylar: { layer: string; on_pipe: number }[] = Array.isArray(data.sprinkler_candidates)
          ? data.sprinkler_candidates
          : [];

        const calculated: CalculatedLayer = {
          layer,
          hatIsmi: opts.hatIsmi ?? layer,
          materialType: opts.materialType ?? '',
          defaultDiameter: '',
          edgeSegments: edgeSegs,
          junctionPoints: junctions,
          totalLength: totalLen,
          computedAt: Date.now(),
          approved: false,
          // Bayatlik tespiti icin anlik: hesap TAM OLARAK bu isaretlerle ve bu
          // birimle yapildi. Kopya alinir — state guncellenince ayni referans
          // uzerinden "hep guncel" gorunmesin (sprinkler-bayatlik.ts).
          sprinklerLayersUsed: [...opts.sprinklerLayers],
          splitMode: opts.splitMode,
          scaleUsed: opts.scale,
          sprinklerAdaylari: opts.splitMode !== 'none' && opts.sprinklerLayers.length === 0 ? adaylar : [],
        };

        onResult({ layer, calculated, raw: data });
        return true;
      } catch (e: any) {
        // Iptal edilen istek (bilesen kaldirildi): sessiz — geri cagri YOK.
        if (denetleyici.signal.aborted) return false;
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
          return false;
        }

        const rawMsg = detail ?? e?.message ?? 'Hesaplama hatası';
        const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
        const shortMsg = msg.length > 200 ? msg.slice(0, 200) + '... (F12 Console)' : msg;
        toast({ title: 'Parçalara ayrılamadı', description: shortMsg, variant: 'destructive' });
        return false;
      } finally {
        denetleyicilerRef.current.delete(denetleyici);
        if (!denetleyici.signal.aborted) setCalculatingLayer(null);
      }
    },
    [fileId, onResult, onFileIdInvalid],
  );

  return { calculatingLayer, calculateLayer, iptalEt };
}
