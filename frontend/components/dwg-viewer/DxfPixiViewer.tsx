'use client';

/**
 * DWG PixiJS Viewer — SVG renderer'ın WebGL muadili.
 *
 * Mimari:
 *   - Prop interface birebir DxfSvgViewer ile aynı → DwgProjectWorkspace'te
 *     tek satır import değiştirilerek geçiş yapılır.
 *   - Render motoru: PixiJS v8 (WebGL). SVG DOM yerine tek <canvas>, binlerce
 *     element 60fps — "binlerce eşzamanlı kullanıcı" hedefi için kritik.
 *   - Pan/zoom: mevcut useViewport.ts hook'u aynen kullanılır; transform
 *     uygulama hedefi SVG <g> yerine PixiJS world container.
 *   - Y-flip: DWG Y↑ / canvas Y↓ — world.scale.y = -zoom ile çözülür.
 *
 * Layer katmanları (z-sırası alttan üste):
 *   1. backgroundLines — geometry.lines layer bazlı batch
 *   2. calculatedEdges — edge_segments çap bazlı batch + hit-test
 *   3. circles         — sprinkler/sembol çemberleri
 *   4. inserts         — ekipman noktaları
 *   5. texts           — TEXT/MTEXT (zoom>=0.3 LOD)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut, Maximize2, AlertCircle } from 'lucide-react';
import type { Application } from 'pixi.js';
import api from '@/lib/api';
import type { EdgeSegment, GeometryResult } from './types';
import { buildDiameterPalette } from './diameter-colors';
import { useViewport } from './useViewport';
import { createPixiStage, destroyPixiStage } from './pixi/stage';
import { applyViewport, createWorld, type WorldLayers } from './pixi/world';
import { createBackgroundLines, type BackgroundLinesHandle } from './pixi/layers/backgroundLines';
import { createCalculatedEdges, type CalculatedEdgesHandle } from './pixi/layers/calculatedEdges';
import { createCircles, type CirclesHandle } from './pixi/layers/circles';
import { createInserts, type InsertsHandle } from './pixi/layers/inserts';
import { createTexts, type TextsHandle } from './pixi/layers/texts';

interface DxfPixiViewerProps {
  fileId: string | null;
  selectedLayers?: string[];
  edgeSegments?: EdgeSegment[];
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  selectedLayer?: string | null;
  markedEquipmentKeys?: Set<string>;
  onSegmentClick?: (segment: EdgeSegment) => void;
  onLineClick?: (line: { layer: string; index: number }) => void;
  onInsertClick?: (insert: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void;
  onCircleClick?: (circle: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void;
  sprinklerLayers?: Set<string>;
  highlightLayer?: string;
  includeInserts?: boolean;
  className?: string;
}

export default function DxfPixiViewer({
  fileId,
  selectedLayers,
  edgeSegments,
  calculatedEdgesByLayer,
  selectedLayer,
  markedEquipmentKeys,
  onSegmentClick,
  onLineClick,
  onInsertClick,
  onCircleClick,
  sprinklerLayers,
  highlightLayer,
  className = '',
}: DxfPixiViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<WorldLayers | null>(null);

  const bgHandleRef = useRef<BackgroundLinesHandle | null>(null);
  const edgesHandleRef = useRef<CalculatedEdgesHandle | null>(null);
  const circlesHandleRef = useRef<CirclesHandle | null>(null);
  const insertsHandleRef = useRef<InsertsHandle | null>(null);
  const textsHandleRef = useRef<TextsHandle | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);

  // ─── Callback ref'leri (closure stale olmasın) ───
  const onLineClickRef = useRef(onLineClick);
  const onSegmentClickRef = useRef(onSegmentClick);
  const onCircleClickRef = useRef(onCircleClick);
  const onInsertClickRef = useRef(onInsertClick);
  useEffect(() => { onLineClickRef.current = onLineClick; }, [onLineClick]);
  useEffect(() => { onSegmentClickRef.current = onSegmentClick; }, [onSegmentClick]);
  useEffect(() => { onCircleClickRef.current = onCircleClick; }, [onCircleClick]);
  useEffect(() => { onInsertClickRef.current = onInsertClick; }, [onInsertClick]);

  const layersKey = useMemo(
    () => (selectedLayers && selectedLayers.length > 0 ? selectedLayers.slice().sort().join(',') : ''),
    [selectedLayers],
  );

  // Bounds — edge segments öncelikli, sonra line bazlı outlier-robust
  const edgeBounds = useMemo<[number, number, number, number] | null>(() => {
    if (!edgeSegments || edgeSegments.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const es of edgeSegments) {
      const [x1, y1, x2, y2] = es.coords;
      if (x1 < minX) minX = x1; if (y1 < minY) minY = y1;
      if (x2 < minX) minX = x2; if (y2 < minY) minY = y2;
      if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1;
      if (x2 > maxX) maxX = x2; if (y2 > maxY) maxY = y2;
    }
    return [minX, minY, maxX, maxY];
  }, [edgeSegments]);

  const linesBounds = useMemo<[number, number, number, number] | null>(() => {
    if (!geometry || geometry.lines.length === 0) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const ln of geometry.lines) {
      xs.push(ln.coords[0], ln.coords[2]);
      ys.push(ln.coords[1], ln.coords[3]);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const pct = (arr: number[], p: number) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p)))];
    const minX = pct(xs, 0.01);
    const maxX = pct(xs, 0.99);
    const minY = pct(ys, 0.01);
    const maxY = pct(ys, 0.99);
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return [xs[0], ys[0], xs[xs.length - 1], ys[ys.length - 1]];
    return [minX, minY, maxX, maxY];
  }, [geometry]);

  const diameterPalette = useMemo(() => {
    if (!edgeSegments) return [];
    return buildDiameterPalette(edgeSegments.map((s) => s.diameter));
  }, [edgeSegments]);

  const diameterLengths = useMemo(() => {
    const map: Record<string, number> = {};
    if (!edgeSegments) return map;
    for (const s of edgeSegments) {
      const k = s.diameter || 'Belirtilmemis';
      map[k] = (map[k] ?? 0) + s.length;
    }
    return map;
  }, [edgeSegments]);

  // calculatedEdgesByLayer'ı olan layer'lar background'da çizilmez
  const skipLayers = useMemo(() => {
    if (!calculatedEdgesByLayer) return undefined;
    return new Set(Object.keys(calculatedEdgesByLayer));
  }, [calculatedEdgesByLayer]);

  // ─── Geometry fetch ───
  useEffect(() => {
    if (!fileId || edgeSegments) {
      setGeometry(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const qs = layersKey ? `?layers=${encodeURIComponent(layersKey)}` : '';
        const res = await api.get<GeometryResult>(`/dwg-engine/geometry/${fileId}${qs}`);
        if (!cancelled) {
          setGeometry(res.data);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.response?.data?.message ?? e?.message ?? 'Geometri alinamadi';
          setError(msg);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [fileId, layersKey, edgeSegments]);

  // ─── PixiJS Stage init (mount-once) ───
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    (async () => {
      const app = await createPixiStage({
        canvas,
        background: 0x0b1220,
        resizeTo: container,
      });
      if (cancelled) {
        destroyPixiStage(app);
        return;
      }
      const layers = createWorld();
      app.stage.addChild(layers.world);
      appRef.current = app;
      layersRef.current = layers;
      // PixiJS resizeTo bazen ilk mount'ta tetiklenmiyor (container o anda
      // 0 boyutlu olabilir). Container boyutu hazirsa manuel resize at;
      // degilse ResizeObserver bekle.
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        app.renderer.resize(w, h);
      }
      // Bir frame sonra container'in nihai boyutu icin tekrar resize at.
      requestAnimationFrame(() => {
        if (cancelled || !appRef.current) return;
        const fw = container.clientWidth;
        const fh = container.clientHeight;
        if (fw > 0 && fh > 0) {
          appRef.current.renderer.resize(fw, fh);
        }
      });
      setStageReady(true);
    })();

    return () => {
      cancelled = true;
      setStageReady(false);
      bgHandleRef.current?.destroy();
      edgesHandleRef.current?.destroy();
      circlesHandleRef.current?.destroy();
      insertsHandleRef.current?.destroy();
      textsHandleRef.current?.destroy();
      bgHandleRef.current = null;
      edgesHandleRef.current = null;
      circlesHandleRef.current = null;
      insertsHandleRef.current = null;
      textsHandleRef.current = null;
      layersRef.current = null;
      destroyPixiStage(appRef.current);
      appRef.current = null;
    };
  }, []);

  // ─── useViewport (pan/zoom hook) ───
  const bounds: [number, number, number, number] =
    edgeBounds ?? linesBounds ?? (geometry?.bounds as [number, number, number, number] | undefined) ?? [0, 0, 100, 100];

  const { viewport, fitView, zoomIn, zoomOut, onWheelReact, wasDragged, pointerHandlers } = useViewport({
    bounds,
    containerRef,
    autoFit: !!geometry || !!edgeSegments,
  });

  // Stage ready olunca layer handle'larını kur
  useEffect(() => {
    if (!stageReady) return;
    const layers = layersRef.current;
    if (!layers) return;

    bgHandleRef.current = createBackgroundLines(
      layers.backgroundLines,
      () => onLineClickRef.current,
      wasDragged,
    );
    edgesHandleRef.current = createCalculatedEdges(
      layers.calculatedEdges,
      () => onSegmentClickRef.current,
      wasDragged,
    );
    circlesHandleRef.current = createCircles(
      layers.circles,
      () => onCircleClickRef.current,
      wasDragged,
    );
    insertsHandleRef.current = createInserts(
      layers.inserts,
      () => onInsertClickRef.current,
      wasDragged,
    );
    textsHandleRef.current = createTexts(layers.texts);

    return () => {
      bgHandleRef.current?.destroy();
      edgesHandleRef.current?.destroy();
      circlesHandleRef.current?.destroy();
      insertsHandleRef.current?.destroy();
      textsHandleRef.current?.destroy();
      bgHandleRef.current = null;
      edgesHandleRef.current = null;
      circlesHandleRef.current = null;
      insertsHandleRef.current = null;
      textsHandleRef.current = null;
    };
  }, [stageReady, wasDragged]);

  // Viewport state → world transform
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !stageReady) return;
    applyViewport(layers.world, viewport.panX, viewport.panY, viewport.zoom);
  }, [viewport.panX, viewport.panY, viewport.zoom, stageReady]);

  // Background lines update
  useEffect(() => {
    if (!stageReady) return;
    bgHandleRef.current?.update({
      geometry,
      selectedLayer,
      highlightLayer,
      skipLayers,
    });
  }, [stageReady, geometry, selectedLayer, highlightLayer, skipLayers]);

  // Calculated edges update
  useEffect(() => {
    if (!stageReady) return;
    edgesHandleRef.current?.update({ calculatedEdgesByLayer });
  }, [stageReady, calculatedEdgesByLayer]);

  // Circles update
  useEffect(() => {
    if (!stageReady) return;
    circlesHandleRef.current?.update({ geometry, sprinklerLayers });
  }, [stageReady, geometry, sprinklerLayers]);

  // Inserts update
  useEffect(() => {
    if (!stageReady) return;
    insertsHandleRef.current?.update({ geometry, markedEquipmentKeys });
  }, [stageReady, geometry, markedEquipmentKeys]);

  // Texts update (LOD: zoom'a bağlı)
  useEffect(() => {
    if (!stageReady) return;
    textsHandleRef.current?.update({ geometry, zoom: viewport.zoom });
  }, [stageReady, geometry, viewport.zoom]);

  // ─── Erken dönüşler ───
  if (!fileId) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border text-sm text-muted-foreground ${className}`}>
        Cizim icin once DWG yukleyin
      </div>
    );
  }
  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-xs text-muted-foreground">Cizim hazirlaniyor...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border p-4 ${className}`}>
        <div className="flex items-start gap-2 max-w-md">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-600">Cizim yuklenemedi</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const usingEdges = !!edgeSegments && edgeSegments.length > 0;
  if (!usingEdges && (!geometry || (geometry.lines.length === 0 && (!geometry.inserts || geometry.inserts.length === 0)))) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border text-sm text-muted-foreground ${className}`}>
        Bu dosyada cizilebilir cizgi bulunamadi
      </div>
    );
  }

  const { zoom } = viewport;
  const lineCount = usingEdges ? edgeSegments!.length : geometry!.lines.length;
  const insertCount = geometry?.inserts?.length ?? 0;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl border border-slate-700 ${className}`}
      style={{ touchAction: 'none', backgroundColor: '#0b1220' }}
      onWheel={onWheelReact}
      {...pointerHandlers}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ display: 'block' }}
      />

      {/* Bilgi banner — sol ust */}
      <div className="absolute top-2 left-2 rounded bg-slate-800/90 px-2.5 py-1 text-[10px] font-mono text-slate-100 border border-slate-600 space-y-0.5 max-w-[320px]">
        <div>
          {lineCount.toLocaleString('tr-TR')} çizgi · zoom {zoom < 0.01 ? zoom.toExponential(2) : zoom.toFixed(2) + 'x'} · <span className="text-emerald-400">WebGL</span>
        </div>
        {insertCount > 0 && (
          <div className="text-[9px] text-slate-300">{insertCount} INSERT (ekipman)</div>
        )}
        <div className="text-[9px] text-slate-400">
          bounds: [{bounds[0].toFixed(0)}..{bounds[2].toFixed(0)} × {bounds[1].toFixed(0)}..{bounds[3].toFixed(0)}]
        </div>
      </div>

      {/* Cap legend — edge segments modunda sol alt */}
      {usingEdges && diameterPalette.length > 0 && (
        <div className="absolute bottom-3 left-3 rounded-lg bg-slate-800/95 border border-slate-600 px-2.5 py-2 text-[11px] text-slate-100 max-w-[280px]">
          <div className="mb-1 text-[10px] font-semibold text-slate-300 uppercase tracking-wide">Çaplar</div>
          <div className="flex flex-col gap-1">
            {diameterPalette
              .sort((a, b) => (diameterLengths[b.diameter] ?? 0) - (diameterLengths[a.diameter] ?? 0))
              .map((p) => (
                <div key={p.label} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-5 rounded-sm"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="font-mono tabular-nums">{p.label}</span>
                  <span className="text-slate-400 ml-auto tabular-nums">
                    {(diameterLengths[p.diameter] ?? 0).toFixed(1)} m
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Kullanim ipucu — sag ust */}
      <div className="absolute top-2 right-2 rounded bg-slate-800/90 px-2.5 py-1 text-[10px] text-slate-300 border border-slate-600">
        {onSegmentClick ? 'Çizgi tıkla: çap düzelt · ' : ''}Tekerle zoom · Surukle ile kaydir
      </div>

      {/* Zoom butonlari — sag alt */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={zoomIn}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/90 border border-slate-600 shadow-sm hover:bg-slate-700 text-slate-100"
          title="Yakinlastir"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={zoomOut}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/90 border border-slate-600 shadow-sm hover:bg-slate-700 text-slate-100"
          title="Uzaklastir"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={fitView}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/90 border border-slate-600 shadow-sm hover:bg-slate-700 text-slate-100"
          title="Tumunu goster"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
