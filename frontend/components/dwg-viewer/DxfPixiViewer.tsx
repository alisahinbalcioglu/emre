'use client';

/**
 * DWG PixiJS Viewer — gorunru duzeni (canvas WebGL renderer).
 *
 * Mimari:
 *   - Render motoru: PixiJS v8 (WebGL). Tek <canvas>, binlerce element 60fps.
 *   - Pan/zoom: useViewport.ts hook'u; transform PixiJS world container'a uygular.
 *   - Y-flip: DWG Y↑ / canvas Y↓ — world.scale.y = -zoom ile cozulur.
 *
 * Layer katmanlari (z-sirasi alttan uste):
 *   1. backgroundLines — geometry.lines layer bazli batch
 *   2. calculatedEdges — edge_segments cap bazli batch + hit-test (metraj)
 *   3. circles         — sprinkler/sembol cemberleri
 *   4. inserts         — ekipman noktalari
 *   5. texts           — TEXT/MTEXT (zoom>=0.3 LOD)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { Application } from 'pixi.js';
import api from '@/lib/api';
import type { GeometryResult } from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { buildDiameterPalette } from '@/components/dwg-metraj/diameter-colors';
import { useViewport } from './useViewport';
import { createPixiStage, destroyPixiStage } from './pixi/stage';
import { applyViewport, createWorld, type WorldLayers } from './pixi/world';
import { createBackgroundLines, type BackgroundLinesHandle } from './pixi/layers/backgroundLines';
import { createCalculatedEdges, type CalculatedEdgesHandle } from './pixi/layers/calculatedEdges';
import { createCircles, type CirclesHandle } from './pixi/layers/circles';
import { createInserts, type InsertsHandle } from './pixi/layers/inserts';
import { createTexts, type TextsHandle } from './pixi/layers/texts';
import { createGrid, type GridHandle } from './pixi/layers/grid';
import ViewerStatusBar from './ViewerStatusBar';
import ViewerToolbar from './ViewerToolbar';
import ViewerContextMenu, { buildDefaultMenuItems } from './ViewerContextMenu';
import { useViewerKeyboard } from './useViewerKeyboard';

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
  /** Esc tusu / context menu'den "Secimi temizle" tetiklendiginde cagirilir.
   *  Genelde parent'in selectedLayer state'ini null'a cekecek. */
  onClearSelection?: () => void;
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
  onClearSelection,
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
  const gridHandleRef = useRef<GridHandle | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);
  /** Mouse'un dunya-uzayindaki konumu — status bar'da gosterilir. null =
   *  fare viewer'in disinda. */
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  /** Arka plan grid acik mi? localStorage'dan ilk degeri oku, kullanici
   *  tercihi oturumlar arasinda hatirlanir. Default: kapali (sade). */
  const [gridVisible, setGridVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('dwg-viewer-grid') === '1';
  });
  const toggleGrid = useCallback(() => {
    setGridVisible((v) => {
      const nv = !v;
      try { window.localStorage.setItem('dwg-viewer-grid', nv ? '1' : '0'); } catch {}
      return nv;
    });
  }, []);

  /** Context menu state — sag-tikla acilan menu. */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // NOTE: useViewerKeyboard cagrisini useViewport'tan SONRA yapiyoruz
  // (fitView/zoomIn/zoomOut o hook'tan geliyor). Asagida 'use' kismina bak.

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

    // Mount-effect tetiklendigini her durumda kayit et (early return bile
    // olsa bilelim — debug global undefined kalmasin).
    if (typeof window !== 'undefined') {
      (window as any).__dwgDebug = {
        effectFired: true,
        hasCanvas: !!canvas,
        hasContainer: !!container,
        canvas,
        container,
        initStarted: false,
        initCompleted: false,
        initError: null as unknown,
        earlyReturned: !canvas || !container,
      };
    }
    if (!canvas || !container) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    // Init basliyor — flag'i guncelle
    if (typeof window !== 'undefined') {
      (window as any).__dwgDebug.initStarted = true;
    }

    (async () => {
      let app: Awaited<ReturnType<typeof createPixiStage>> | null = null;
      try {
        app = await createPixiStage({
          canvas,
          background: 0x0b1220,
          resizeTo: container,
        });
      } catch (err) {
        console.error('[DxfPixiViewer] createPixiStage failed:', err);
        if (typeof window !== 'undefined') {
          (window as any).__dwgDebug.initError = err;
        }
        setError('PixiJS baslatilamadi: ' + (err instanceof Error ? err.message : String(err)));
        return;
      }

      if (cancelled) {
        destroyPixiStage(app);
        return;
      }
      const layers = createWorld();
      app.stage.addChild(layers.world);
      appRef.current = app;
      layersRef.current = layers;

      // Init basarili — debug global'i app/world ile genislet
      if (typeof window !== 'undefined') {
        (window as any).__dwgDebug = {
          ...(window as any).__dwgDebug,
          initCompleted: true,
          app,
          world: layers.world,
          layers,
          get geometry() { return geometry; },
          get viewport() { return viewport; },
          get bounds() { return bounds; },
        };
      }

      // PixiJS resizeTo, container'in boyutu mount aninda 0'dan farkli olsa
      // bile bazen ilk resize callback'ini tetiklemiyor — sonuc: canvas
      // 300x150 default'unda kaliyor, tum cizim kucuk buffer'a sıkışır.
      // 1) Hemen app.resize() — Pixi'nin kendi resizeTo logic'ini calistir
      // 2) RAF'ta tekrar — layout settled olmasi icin
      // 3) ResizeObserver ile her boyut degisikligini yakala
      app.resize();
      requestAnimationFrame(() => {
        if (!cancelled && appRef.current) appRef.current.resize();
      });
      resizeObserver = new ResizeObserver(() => {
        if (!cancelled && appRef.current) appRef.current.resize();
      });
      resizeObserver.observe(container);

      setStageReady(true);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
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

  /** Klavye kisayollari — F/Esc/+/-/G/Ctrl+Home (useViewport'tan SONRA
   *  cunku fitView/zoomIn/zoomOut o hook'tan geliyor). */
  useViewerKeyboard({
    enabled: !!fileId,
    onFit: fitView,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onToggleGrid: toggleGrid,
    onClearSelection: () => {
      // 1) Acik context menu varsa once onu kapat
      setContextMenu(null);
      // 2) Parent'in selection'ini temizle (varsa)
      onClearSelection?.();
    },
    onReset: () => { fitView(); },
  });

  // Stage ready olunca layer handle'larını kur
  useEffect(() => {
    if (!stageReady) return;
    const layers = layersRef.current;
    if (!layers) return;

    gridHandleRef.current = createGrid(layers.grid);
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
      gridHandleRef.current?.destroy();
      bgHandleRef.current?.destroy();
      edgesHandleRef.current?.destroy();
      circlesHandleRef.current?.destroy();
      insertsHandleRef.current?.destroy();
      textsHandleRef.current?.destroy();
      gridHandleRef.current = null;
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

  // Background lines update — zoom dependency eklendi cunku stroke width
  // zoom-aware (dunya birimi cinsinden hesaplaniyor backgroundLines'da).
  useEffect(() => {
    if (!stageReady) return;
    bgHandleRef.current?.update({
      geometry,
      selectedLayer,
      highlightLayer,
      skipLayers,
      zoom: viewport.zoom,
    });
  }, [stageReady, geometry, selectedLayer, highlightLayer, skipLayers, viewport.zoom]);

  // Grid update — zoom + bounds + visibility degisince yeniden ciz.
  // bounds null ise (geometry henuz fetch edilmedi) grid de cizilmez.
  useEffect(() => {
    if (!stageReady) return;
    gridHandleRef.current?.update({
      bounds: geometry || edgeSegments?.length ? bounds : null,
      zoom: viewport.zoom,
      visible: gridVisible,
    });
  }, [stageReady, gridVisible, viewport.zoom, bounds, geometry, edgeSegments]);

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

  // KRITIK: erken return YAPMA — yoksa canvas/container ref'ler null kalir
  // ve PixiJS init mount-effect'inde early return yapar (bos ekran bug'i).
  // Her durumda container + canvas DOM'da kalmali, conditional icerikler
  // overlay olarak gosterilmeli.
  const usingEdges = !!edgeSegments && edgeSegments.length > 0;
  const hasNoData = !usingEdges && (!geometry || (geometry.lines.length === 0 && (!geometry.inserts || geometry.inserts.length === 0)));
  const { zoom } = viewport;
  const lineCount = usingEdges ? edgeSegments!.length : (geometry?.lines.length ?? 0);
  const insertCount = geometry?.inserts?.length ?? 0;
  const layerCount = geometry?.layer_colors ? Object.keys(geometry.layer_colors).length : 0;

  /** Mouse hareketinde dunya-uzayi koordinatini hesapla — AutoCAD
   *  status bar gibi real-time gosterim. Y-flip dahil edilir. */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Once mevcut pan/drag handler'i (sürükleme algilamasi)
      pointerHandlers.onPointerMove(e);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Dunya koordinatina cevir (Y-flip: world Y yukari, screen Y asagi)
      const worldX = (mx - viewport.panX) / viewport.zoom;
      const worldY = (viewport.panY - my) / viewport.zoom;
      setCursorWorld({ x: worldX, y: worldY });
    },
    [pointerHandlers, viewport.panX, viewport.panY, viewport.zoom],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerHandlers.onPointerCancel(e);
      setCursorWorld(null);
    },
    [pointerHandlers],
  );

  /** Sag-tik context menu — drag yapilmissa atla (yanlislikla acilmasin). */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (wasDragged()) return; // pan sonrasi sag-tik click sayilmasin
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [wasDragged],
  );

  /** Cift tikla → tum cizimi cerceveye sigdir. AutoCAD'de cift-tik MMB
   *  zoom-extents'tir; biz default'u boyle yapiyoruz. */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      fitView();
    },
    [fitView],
  );

  return (
    <div className={`flex flex-col rounded-xl border border-slate-700 overflow-hidden bg-slate-950 ${className}`}>
      {/* ─── Viewer alani (canvas + overlay'ler + toolbar) ─── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none', backgroundColor: '#0b1220', cursor: 'crosshair' }}
        onWheel={onWheelReact}
        onPointerDown={pointerHandlers.onPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={pointerHandlers.onPointerUp}
        onPointerCancel={pointerHandlers.onPointerCancel}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: 'block' }}
        />

        {/* Toolbar — sol ust */}
        <div className="absolute top-2 left-2 z-10">
          <ViewerToolbar
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onFit={fitView}
            gridVisible={gridVisible}
            onGridToggle={toggleGrid}
          />
        </div>

        {/* Conditional overlay'ler — canvas DOM'dan cikmadan goster */}
        {!fileId && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-sm text-slate-300">
            Cizim icin once DWG yukleyin
          </div>
        )}
        {fileId && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <p className="text-xs text-slate-300">Cizim hazirlaniyor...</p>
            </div>
          </div>
        )}
        {fileId && !loading && error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4">
            <div className="flex items-start gap-2 max-w-md">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Cizim yuklenemedi</p>
                <p className="text-xs text-slate-300 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
        {fileId && !loading && !error && hasNoData && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-sm text-slate-300">
            Bu dosyada cizilebilir cizgi bulunamadi
          </div>
        )}

        {/* Cap legend — edge segments modunda sag ust */}
        {usingEdges && diameterPalette.length > 0 && (
          <div className="absolute top-2 right-2 z-10 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 px-2.5 py-2 text-[11px] text-slate-100 max-w-[280px]">
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

        {/* Kullanim ipucu — sag alt (eski) */}
        <div className="absolute bottom-2 right-2 z-10 rounded bg-slate-900/80 backdrop-blur-sm px-2 py-1 text-[9px] text-slate-400 border border-slate-700">
          {onSegmentClick ? 'Çizgi: çap düzelt · ' : ''}Tekerle zoom · Sürükle pan
        </div>
      </div>

      {/* ─── Status bar (alt sticky) ─── */}
      <ViewerStatusBar
        cursorWorld={cursorWorld}
        zoom={zoom}
        lineCount={lineCount}
        insertCount={insertCount}
        layerCount={layerCount}
        unit="mm"
        renderer="WebGL"
      />

      {/* ─── Sag-tik context menu (portal benzeri, fixed pos) ─── */}
      {contextMenu && (
        <ViewerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildDefaultMenuItems({
            onFit: fitView,
            onReset: () => { fitView(); },
            gridVisible,
            onGridToggle: toggleGrid,
          })}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
