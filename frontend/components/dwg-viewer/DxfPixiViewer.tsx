'use client';

/**
 * DWG Viewer 2.0 — Renderer-First, Worker-Powered, AutoCAD UX.
 *
 * Mimari (Phase 1 plan'a uygun):
 *   - Pixi v8 + pixi-viewport (mature pan/zoom)
 *   - Web Worker: DXF parse + RBush spatial index + hit-test
 *   - R-Tree culling: viewport degisince visible ID set → renderer'lar
 *   - Per-layer batched Graphics (Pixi internal GPU batching)
 *   - Zustand layerStore: merkezi visibility state, "Show All" tek tikla
 *   - Right-click context menu: Hide/Isolate/Show All Layer
 *   - Equipment butunsel selection: parent_block_id grubu birlikte highlight
 *   - Cold-start UX (B2): "Servis uyandiriliyor..." + 3-retry exponential backoff
 *
 * 1M-ready extension point'ler (tasarımda, simdi yok):
 *   - Renderer'lar bagimsiz interface (FullLayer; gelecek TiledLayer aynı)
 *   - Worker API streaming-aware (loadTile'a hazir)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { Application } from 'pixi.js';
import api from '@/lib/api';
import type { GeometryResult } from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { useLayerStore } from './store/layerStore';
import { GeometryWorkerClient } from './workers/client';
import { createPixiStage, destroyPixiStage } from './pixi/stage';
import { createScene, fitViewportToBounds, getViewportDwgBounds, viewportToDwg, type SceneLayers } from './pixi/sceneGraph';
import { createLineRenderer, type LineRendererHandle } from './pixi/lineRenderer';
import { createCircleRenderer, createArcRenderer, createInsertRenderer, createTextRenderer,
  type CircleRendererHandle, type ArcRendererHandle, type InsertRendererHandle, type TextRendererHandle,
} from './pixi/symbolRenderer';
import { createEdgeRenderer, type EdgeRendererHandle } from './pixi/edgeRenderer';
import { createHighlightRenderer, type HighlightRendererHandle } from './pixi/highlightRenderer';
import ViewerContextMenu from './ViewerContextMenu';

interface DxfPixiViewerProps {
  fileId: string | null;
  edgeSegments?: EdgeSegment[];
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  selectedLayer?: string | null;
  markedEquipmentKeys?: Set<string>;
  onSegmentClick?: (segment: EdgeSegment) => void;
  onLineClick?: (line: { layer: string; index: number; shiftKey: boolean }) => void;
  onInsertClick?: (insert: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void;
  onCircleClick?: (circle: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void;
  sprinklerLayers?: Set<string>;
  className?: string;
  onClearSelection?: () => void;
  onLayersAvailable?: (layers: string[]) => void;
  /** Kullanicinin "goz" ile gizledigi layer'lar — Zustand store'a sync edilir. */
  hiddenLayers?: Set<string>;
}

export default function DxfPixiViewer({
  fileId,
  edgeSegments,
  calculatedEdgesByLayer,
  markedEquipmentKeys,
  onSegmentClick,
  onLineClick,
  onInsertClick,
  onCircleClick,
  sprinklerLayers,
  className = '',
  onClearSelection,
  onLayersAvailable,
  hiddenLayers,
}: DxfPixiViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<SceneLayers | null>(null);
  const workerRef = useRef<GeometryWorkerClient | null>(null);

  // Renderer handle'lari
  const lineHandleRef = useRef<LineRendererHandle | null>(null);
  const circleHandleRef = useRef<CircleRendererHandle | null>(null);
  const arcHandleRef = useRef<ArcRendererHandle | null>(null);
  const insertHandleRef = useRef<InsertRendererHandle | null>(null);
  const textHandleRef = useRef<TextRendererHandle | null>(null);
  const edgeHandleRef = useRef<EdgeRendererHandle | null>(null);
  const highlightHandleRef = useRef<HighlightRendererHandle | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'loading' | 'waking'>('idle');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; layerName: string | null; entityType?: string;
  } | null>(null);

  // Zustand store hooks (subscribed)
  const setAllLayersStore = useLayerStore((s) => s.setAllLayers);
  const hideLayerStore = useLayerStore((s) => s.hideLayer);
  const isolateLayerStore = useLayerStore((s) => s.isolateLayer);
  const showAllStore = useLayerStore((s) => s.showAll);
  const setSelectedStore = useLayerStore((s) => s.setSelected);
  const clearSelectionStore = useLayerStore((s) => s.clearSelection);
  const storeHidden = useLayerStore((s) => s.hiddenLayers);
  const storeIsolated = useLayerStore((s) => s.isolatedLayer);
  const storeSelectedIds = useLayerStore((s) => s.selectedEntityIds);

  // Workspace'ten gelen hiddenLayers prop'unu Zustand'a sync et (one-way)
  useEffect(() => {
    if (!hiddenLayers) return;
    // Mevcut store ile karsilastir, farkliysa update
    const cur = useLayerStore.getState().hiddenLayers;
    if (cur.size === hiddenLayers.size) {
      let same = true;
      hiddenLayers.forEach((l) => { if (!cur.has(l)) same = false; });
      if (same) return;
    }
    useLayerStore.setState({ hiddenLayers: new Set(hiddenLayers) });
  }, [hiddenLayers]);

  // Callback ref'leri — closure stale olmasin diye
  const onLineClickRef = useRef(onLineClick);
  const onInsertClickRef = useRef(onInsertClick);
  const onCircleClickRef = useRef(onCircleClick);
  const onSegmentClickRef = useRef(onSegmentClick);
  useEffect(() => { onLineClickRef.current = onLineClick; }, [onLineClick]);
  useEffect(() => { onInsertClickRef.current = onInsertClick; }, [onInsertClick]);
  useEffect(() => { onCircleClickRef.current = onCircleClick; }, [onCircleClick]);
  useEffect(() => { onSegmentClickRef.current = onSegmentClick; }, [onSegmentClick]);

  /** Manuel "Tekrar Dene" trigger — error sonrasi kullanici tikla. */
  const [retryNonce, setRetryNonce] = useState(0);

  // ─── Pre-warm — workspace mount'unda Render servislerini uyandir ──
  // /api/health (auth-less) NestJS'i, fetch ile dogrudan Python /health
  // (auth-less) Python'i uyandirir. Kullanici dosya secip tikla yapacagi
  // ana kadar her iki service warm.
  useEffect(() => {
    // NestJS health (axios baseURL: https://metaprice-api.onrender.com/api)
    api.get('/health').catch(() => {});
    // Python health — direkt URL (auth gerektirmez, public endpoint)
    const pythonUrl = 'https://metaprice-dwg-engine.onrender.com/health';
    fetch(pythonUrl, { method: 'GET' }).catch(() => {});
  }, []);

  // ─── Geometry fetch + B2 cold-start retry ─────────────────────────
  useEffect(() => {
    if (!fileId || edgeSegments) {
      setGeometry(null);
      return;
    }
    let cancelled = false;
    // 5 deneme, exponential backoff: toplam max ~80 saniye
    // (Render free tier cold start 50+ saniye olabilir).
    const RETRY_DELAYS = [2000, 5000, 10000, 20000, 40000];
    const MAX_ATTEMPTS = RETRY_DELAYS.length;
    setLoading(true);
    setLoadingPhase('loading');
    setRetryAttempt(0);
    setError(null);

    const isTransient = (e: any): boolean => {
      const status = e?.response?.status;
      if (status === 503 || status === 502 || status === 504) return true;
      // 500 de cold-start sirasinda olabilir (worker crash). Retry et.
      if (status === 500) return true;
      const code = e?.code;
      if (code === 'ECONNABORTED' || code === 'ERR_NETWORK') return true;
      if (!e?.response) return true;
      return false;
    };

    (async () => {
      let lastErr: any = null;
      for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          const res = await api.get<GeometryResult>(`/dwg-engine/geometry/${fileId}`);
          if (cancelled) return;
          setGeometry(res.data);
          setLoading(false);
          setLoadingPhase('idle');
          const layerNames = Object.keys(res.data.layer_colors ?? {});
          if (layerNames.length > 0) {
            onLayersAvailable?.(layerNames);
            setAllLayersStore(layerNames);
          }
          return;
        } catch (e: any) {
          lastErr = e;
          if (!isTransient(e)) break;
          if (attempt >= MAX_ATTEMPTS) break;
          if (cancelled) return;
          setLoadingPhase('waking');
          setRetryAttempt(attempt + 1);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      if (!cancelled) {
        const status = lastErr?.response?.status;
        const serverMsg = lastErr?.response?.data?.message;
        const msg = status
          ? `${status}: ${serverMsg ?? 'Sunucu yaniti alinamadi'}`
          : (lastErr?.message ?? 'Geometri alinamadi');
        setError(msg);
        setLoading(false);
        setLoadingPhase('idle');
      }
    })();
    return () => { cancelled = true; };
  }, [fileId, edgeSegments, onLayersAvailable, setAllLayersStore, retryNonce]);

  // ─── Pixi stage init (mount-once) ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      let app: Awaited<ReturnType<typeof createPixiStage>> | null = null;
      try {
        app = await createPixiStage({
          canvas, background: 0x0b1220, resizeTo: container,
        });
      } catch (err) {
        console.error('[DxfPixiViewer] Pixi init failed:', err);
        setError('Cizim motoru baslatilamadi');
        return;
      }
      if (cancelled) {
        destroyPixiStage(app);
        return;
      }
      const scene = createScene(app);
      appRef.current = app;
      sceneRef.current = scene;

      // Worker
      workerRef.current = new GeometryWorkerClient();

      // Resize handling
      app.resize();
      requestAnimationFrame(() => { if (!cancelled && appRef.current) appRef.current.resize(); });
      resizeObserver = new ResizeObserver(() => {
        if (!cancelled && appRef.current) {
          appRef.current.resize();
          // pixi-viewport'i da yeni boyuta ayarla
          if (sceneRef.current) {
            sceneRef.current.viewport.resize(app.screen.width, app.screen.height);
          }
        }
      });
      resizeObserver.observe(container);

      setStageReady(true);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      setStageReady(false);
      lineHandleRef.current?.destroy();
      circleHandleRef.current?.destroy();
      arcHandleRef.current?.destroy();
      insertHandleRef.current?.destroy();
      textHandleRef.current?.destroy();
      edgeHandleRef.current?.destroy();
      highlightHandleRef.current?.destroy();
      lineHandleRef.current = null;
      circleHandleRef.current = null;
      arcHandleRef.current = null;
      insertHandleRef.current = null;
      textHandleRef.current = null;
      edgeHandleRef.current = null;
      highlightHandleRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
      sceneRef.current = null;
      destroyPixiStage(appRef.current);
      appRef.current = null;
    };
  }, []);

  // ─── Geometry yuklendiginde renderer'lari kur, Worker'a feed et ──
  useEffect(() => {
    if (!stageReady) return;
    const scene = sceneRef.current;
    const worker = workerRef.current;
    if (!scene) return;

    // Once eski handle'lari temizle
    lineHandleRef.current?.destroy();
    circleHandleRef.current?.destroy();
    arcHandleRef.current?.destroy();
    insertHandleRef.current?.destroy();
    textHandleRef.current?.destroy();
    highlightHandleRef.current?.destroy();
    lineHandleRef.current = null;
    circleHandleRef.current = null;
    arcHandleRef.current = null;
    insertHandleRef.current = null;
    textHandleRef.current = null;
    highlightHandleRef.current = null;

    if (!geometry) return;

    const skipLayers = calculatedEdgesByLayer
      ? new Set(Object.keys(calculatedEdgesByLayer))
      : undefined;

    // Renderer'lari kur
    lineHandleRef.current = createLineRenderer(scene.lineLayer, {
      lines: geometry.lines,
      layerColors: geometry.layer_colors,
      skipLayers,
    });
    circleHandleRef.current = createCircleRenderer(scene.circleLayer, {
      circles: geometry.circles,
      sprinklerLayers,
    });
    arcHandleRef.current = createArcRenderer(scene.arcLayer, {
      arcs: geometry.arcs,
    });
    insertHandleRef.current = createInsertRenderer(scene.insertLayer, {
      inserts: geometry.inserts,
    });
    textHandleRef.current = createTextRenderer(scene.textLayer, {
      texts: geometry.texts,
    });
    highlightHandleRef.current = createHighlightRenderer(scene.highlightLayer, {
      lines: geometry.lines,
      circles: geometry.circles,
      arcs: geometry.arcs,
      inserts: geometry.inserts,
      texts: geometry.texts,
    });

    // Worker'a yukle
    if (worker) {
      worker.load(geometry).catch((e) => {
        console.error('[DxfPixiViewer] Worker load failed:', e);
      });
    }

    // Bounds'a sigdir
    if (geometry.bounds) {
      fitViewportToBounds(scene.viewport, geometry.bounds);
    }
  }, [stageReady, geometry, sprinklerLayers, calculatedEdgesByLayer]);

  // ─── Calculated edges renderer (boru segmentleri) ─────────────────
  useEffect(() => {
    if (!stageReady) return;
    const scene = sceneRef.current;
    if (!scene) return;
    if (!edgeHandleRef.current) {
      edgeHandleRef.current = createEdgeRenderer(scene.calculatedEdgesLayer);
    }
    edgeHandleRef.current.update(edgeSegments);
  }, [stageReady, edgeSegments]);

  // ─── R-Tree culling: viewport degisince visible ID set, renderer'lara feed ─
  // pixi-viewport 'moved' / 'zoomed' event'lerinde RAF-debounced.
  useEffect(() => {
    if (!stageReady) return;
    const scene = sceneRef.current;
    const worker = workerRef.current;
    if (!scene || !worker || !geometry) return;

    let scheduled = false;
    const recompute = async () => {
      scheduled = false;
      try {
        const bbox = getViewportDwgBounds(scene.viewport);
        const ids = await worker.queryViewport(bbox);
        const idSet = new Set(ids);
        lineHandleRef.current?.setVisibleIds(idSet);
        circleHandleRef.current?.setVisibleIds(idSet);
        arcHandleRef.current?.setVisibleIds(idSet);
      } catch (e) {
        // Worker race / cancelled — yutuluyor
      }
    };

    const onChange = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(recompute);
    };

    scene.viewport.on('moved', onChange);
    scene.viewport.on('zoomed', onChange);
    // Ilk render — initial visible set
    onChange();

    // Text LOD update on zoom
    const onZoomTextLod = () => {
      const z = scene.viewport.scale.x;
      textHandleRef.current?.setZoom(z);
    };
    scene.viewport.on('zoomed', onZoomTextLod);
    onZoomTextLod();

    return () => {
      scene.viewport.off('moved', onChange);
      scene.viewport.off('zoomed', onChange);
      scene.viewport.off('zoomed', onZoomTextLod);
    };
  }, [stageReady, geometry]);

  // ─── Layer visibility (Zustand) → renderer'lara uygula ─────────────
  useEffect(() => {
    if (!stageReady) return;
    const isVisible = (layer: string): boolean => {
      if (storeIsolated !== null) return layer === storeIsolated;
      return !storeHidden.has(layer);
    };
    lineHandleRef.current?.applyLayerVisibility(isVisible);
    circleHandleRef.current?.applyLayerVisibility(isVisible);
    arcHandleRef.current?.applyLayerVisibility(isVisible);
    textHandleRef.current?.applyLayerVisibility(isVisible);

    // Worker'a sync — yeni hit-test sonuclari hidden filter'i kullansin
    workerRef.current?.setHidden(storeHidden).catch(() => {});
    workerRef.current?.setIsolated(storeIsolated).catch(() => {});
  }, [stageReady, storeHidden, storeIsolated]);

  // ─── Marked equipment update ──────────────────────────────────────
  useEffect(() => {
    if (!stageReady || !insertHandleRef.current) return;
    insertHandleRef.current.setMarkedKeys(markedEquipmentKeys ?? new Set());
  }, [stageReady, markedEquipmentKeys]);

  // ─── Highlight (selectedEntityIds Zustand'tan) ────────────────────
  useEffect(() => {
    if (!stageReady) return;
    highlightHandleRef.current?.setSelected(storeSelectedIds);
  }, [stageReady, storeSelectedIds]);

  // ─── Click + RightClick handlers ──────────────────────────────────
  const handlePointerEvent = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>, isRightClick: boolean) => {
      const scene = sceneRef.current;
      const worker = workerRef.current;
      const containerEl = containerRef.current;
      if (!scene || !worker || !containerEl) return;

      const rect = containerEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const dwg = viewportToDwg(scene.viewport, screenX, screenY);

      try {
        const result = await worker.pick(dwg.x, dwg.y, scene.viewport.scale.x);

        if (isRightClick) {
          // Sag tik: context menu, entity yoksa "layer null" ile sadece "Show All"
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            layerName: result?.layer_name ?? null,
            entityType: result?.type,
          });
          return;
        }

        // Sol tik
        if (!result) {
          clearSelectionStore();
          onClearSelection?.();
          return;
        }

        // Highlight: equipment grup veya tek
        setSelectedStore(result.layer_name, result.group_entity_ids);

        // Workspace handler dispatch (existing API)
        const shiftKey = e.shiftKey;
        switch (result.type) {
          case 'line':
            onLineClickRef.current?.({ layer: result.layer_name, index: 0, shiftKey });
            break;
          case 'arc':
            onLineClickRef.current?.({ layer: result.layer_name, index: 0, shiftKey });
            break;
          case 'text':
            onLineClickRef.current?.({ layer: result.layer_name, index: 0, shiftKey });
            break;
          case 'circle': {
            const idx = Number(result.canonical_entity_id.slice(7));
            const c = geometry?.circles[idx];
            if (c) {
              onCircleClickRef.current?.({
                layer: c.layer,
                circleIndex: c.circle_index,
                center: c.center,
                radius: c.radius,
              });
            }
            break;
          }
          case 'insert': {
            const idx = Number(result.canonical_entity_id.slice(7));
            const ins = geometry?.inserts[idx];
            if (ins) {
              onInsertClickRef.current?.({
                layer: ins.layer,
                insertIndex: ins.insert_index,
                insertName: ins.insert_name,
                position: ins.position,
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error('[DxfPixiViewer] pick failed:', err);
      }
    },
    [clearSelectionStore, onClearSelection, setSelectedStore, geometry],
  );

  const handleClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return; // sadece sol tik
      handlePointerEvent(e, false);
    },
    [handlePointerEvent],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      // pointer event'inin ozelliklerine ihtiyac yok; React.MouseEvent yeterli
      handlePointerEvent(e as unknown as React.PointerEvent<HTMLDivElement>, true);
    },
    [handlePointerEvent],
  );

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col rounded-xl border border-slate-700 overflow-hidden bg-slate-950 ${className}`}>
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none', backgroundColor: '#0b1220', cursor: 'crosshair' }}
        onPointerUp={handleClick}
        onContextMenu={handleContextMenu}
      >
        <canvas ref={canvasRef} className="h-full w-full" style={{ display: 'block' }} />

        {!fileId && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-sm text-slate-300">
            Cizim icin once DWG yukleyin
          </div>
        )}

        {fileId && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
            <div className="flex flex-col items-center gap-2 max-w-sm text-center px-4">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              {loadingPhase === 'waking' ? (
                <>
                  <p className="text-xs font-medium text-amber-300">Servis uyandiriliyor...</p>
                  <p className="text-[10px] text-slate-400">
                    Render free tier soguk baslangic. Deneme {retryAttempt}/5
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Toplam ~80 saniye yetebilir. Lutfen bekleyin.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-300">Cizim hazirlaniyor...</p>
              )}
            </div>
          </div>
        )}

        {fileId && !loading && error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4">
            <div className="flex flex-col items-center gap-3 max-w-md text-center">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-medium text-red-300">Cizim yuklenemedi</p>
                  <p className="text-xs text-slate-300 mt-1">{error}</p>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Render free tier servis uyandirma 50sn surebilir. Tekrar dene'ye basarak yeni denemeyi baslat.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
              >
                Tekrar Dene
              </button>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ViewerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          layerName={contextMenu.layerName}
          entityType={contextMenu.entityType}
          hasIsolation={storeIsolated !== null}
          onHideLayer={(layer) => hideLayerStore(layer)}
          onIsolateLayer={(layer) => isolateLayerStore(layer)}
          onShowAll={() => showAllStore()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
