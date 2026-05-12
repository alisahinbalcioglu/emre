'use client';

/**
 * DWG Viewer — native HTML5 Canvas2D rendering.
 *
 * Mimari:
 *   - HTML <canvas> + 2d context
 *   - useViewport pan/zoom state (native wheel listener)
 *   - Y-flip transform: canvas Y-asagi, DWG Y-yukari → ctx.scale(zoom, -zoom)
 *   - Adaptive grid (log10 step) + viewport culling + selection glow
 *   - Per-layer batched stroke (single beginPath + multi moveTo/lineTo + stroke)
 *
 * Performans (28K cizgi):
 *   - Pan/zoom: 60FPS (viewport culling sayesinde sadece ekrandakiler cizilir)
 *   - Anında zoomToFit (geometry geldigi anda)
 *
 * Hit-test: point-to-segment distance, layer click → onLineClick.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import api from '@/lib/api';
import type { GeometryResult } from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { useViewport } from './useViewport';
import { aciToColor } from './aci-colors';

interface DxfCanvasViewerProps {
  fileId: string | null;
  selectedLayers?: string[];
  edgeSegments?: EdgeSegment[];
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  selectedLayer?: string | null;
  markedEquipmentKeys?: Set<string>;
  onSegmentClick?: (segment: EdgeSegment) => void;
  onLineClick?: (line: { layer: string; index: number; shiftKey: boolean; screenX: number; screenY: number }) => void;
  onInsertClick?: (insert: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void;
  onCircleClick?: (circle: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void;
  sprinklerLayers?: Set<string>;
  highlightLayer?: string;
  className?: string;
  onClearSelection?: () => void;
  onLayersAvailable?: (layers: string[]) => void;
  hiddenLayers?: Set<string>;
}

const COLOR_BG = '#0b1220';
const COLOR_PASSIVE = '#94a3b8';
const COLOR_SELECTED = '#60a5fa';
const COLOR_TEXT = '#fbbf24';
const COLOR_SPRINKLER = '#22d3ee';
const COLOR_MARKED_EQUIPMENT = '#f97316';

export default function DxfCanvasViewer({
  fileId,
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
  onLayersAvailable,
  hiddenLayers,
}: DxfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);

  // Bounds (DWG world)
  const bounds = useMemo<[number, number, number, number]>(() => {
    if (edgeSegments && edgeSegments.length > 0) {
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const es of edgeSegments) {
        const [x1, y1, x2, y2] = es.coords;
        if (x1 < mnx) mnx = x1; if (y1 < mny) mny = y1;
        if (x2 < mnx) mnx = x2; if (y2 < mny) mny = y2;
        if (x1 > mxx) mxx = x1; if (y1 > mxy) mxy = y1;
        if (x2 > mxx) mxx = x2; if (y2 > mxy) mxy = y2;
      }
      return [mnx, mny, mxx, mxy];
    }
    if (geometry?.bounds) return geometry.bounds;
    return [0, 0, 100, 100];
  }, [geometry, edgeSegments]);

  // Native wheel listener useViewport icinde — passive: false ile preventDefault yapar.
  // onWheelReact React fallback'i; ana akis native listener uzerinden.
  const { viewport, fitView, zoomIn, zoomOut, wasDragged, pointerHandlers } = useViewport({
    bounds,
    containerRef,
    autoFit: !!geometry || !!edgeSegments,
  });

  // ─── Geometry fetch + retry (Render free tier cold-start) ─────────
  useEffect(() => {
    if (!fileId || edgeSegments) {
      setGeometry(null);
      return;
    }
    let cancelled = false;
    const RETRY_DELAYS = [2000, 5000, 10000, 20000, 40000];
    setLoading(true);
    setError(null);

    const isTransient = (e: any): boolean => {
      const status = e?.response?.status;
      if (status === 503 || status === 502 || status === 504 || status === 500) return true;
      const code = e?.code;
      if (code === 'ECONNABORTED' || code === 'ERR_NETWORK') return true;
      if (!e?.response) return true;
      return false;
    };

    (async () => {
      let lastErr: any = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        if (cancelled) return;
        try {
          const res = await api.get<GeometryResult>(`/dwg-engine/geometry/${fileId}`);
          if (cancelled) return;
          setGeometry(res.data);
          setLoading(false);
          const layerNames = Object.keys(res.data.layer_colors ?? {});
          if (layerNames.length > 0) onLayersAvailable?.(layerNames);
          return;
        } catch (e: any) {
          lastErr = e;
          if (!isTransient(e)) break;
          if (attempt >= RETRY_DELAYS.length) break;
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
      if (!cancelled) {
        const status = lastErr?.response?.status;
        const msg = status
          ? `${status}: Servis cevap vermedi (Render free tier cold-start). Sayfayi yenile.`
          : (lastErr?.message ?? 'Geometri alinamadi');
        setError(msg);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileId, edgeSegments, onLayersAvailable]);

  // ─── Canvas init + DPR ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // DPR scale
        ctxRef.current = ctx;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ─── Render — geometry/viewport/state degisince RAF ile ──────────
  useEffect(() => {
    let rafId = 0;
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(render);
    };

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Background
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);

      // A3 — Adaptive grid (screen space, transform oncesi)
      // OCERP pattern (DxfViewer.tsx:389-436): log10 step, minor=1x, major=10x,
      // threshold 8px. Zoom'a gore sıklasir/seyrelir → AutoCAD hissi.
      const rawStep = 50 / viewport.zoom;
      const exponent = Math.floor(Math.log10(rawStep));
      const minorStep = Math.pow(10, exponent);
      const majorStep = minorStep * 10;
      const minorPx = minorStep * viewport.zoom;
      const majorPx = majorStep * viewport.zoom;
      const drawGrid = (stepPx: number, alpha: string) => {
        if (stepPx <= 8) return;
        ctx.strokeStyle = alpha;
        ctx.lineWidth = 1;
        const startX = Math.floor(-viewport.panX / stepPx) * stepPx + viewport.panX;
        const startY = Math.floor(-viewport.panY / stepPx) * stepPx + viewport.panY;
        ctx.beginPath();
        for (let x = startX; x < w; x += stepPx) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = startY; y < h; y += stepPx) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
      };
      drawGrid(minorPx, 'rgba(255,255,255,0.03)');
      drawGrid(majorPx, 'rgba(255,255,255,0.07)');

      // A2 — Viewport culling: world-space bbox (margin 50px ekran ki edge case yumusak)
      // Y-flip: canvas y-down, world y-up → world y = (panY - screenY) / zoom
      const marginPx = 50;
      const worldMinX = (-marginPx - viewport.panX) / viewport.zoom;
      const worldMaxX = (w + marginPx - viewport.panX) / viewport.zoom;
      const worldMinY = (viewport.panY - (h + marginPx)) / viewport.zoom;
      const worldMaxY = (viewport.panY + marginPx) / viewport.zoom;
      const inView = (x: number, y: number) => x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY;
      const lineInView = (x1: number, y1: number, x2: number, y2: number) => {
        // Hızlı bbox-bbox: line bbox viewport bbox'la kesişiyor mu?
        const lnMinX = Math.min(x1, x2), lnMaxX = Math.max(x1, x2);
        const lnMinY = Math.min(y1, y2), lnMaxY = Math.max(y1, y2);
        return lnMaxX >= worldMinX && lnMinX <= worldMaxX && lnMaxY >= worldMinY && lnMinY <= worldMaxY;
      };

      // Pan + zoom + Y-flip transform
      ctx.save();
      ctx.translate(viewport.panX, viewport.panY);
      ctx.scale(viewport.zoom, -viewport.zoom);

      const strokeWidth = 1 / viewport.zoom; // 1 ekran piksel
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';

      // ─── Background lines (per layer) ────────────────────────────
      if (geometry && !edgeSegments) {
        const layerColors = geometry.layer_colors || {};
        const skipLayers = calculatedEdgesByLayer ? new Set(Object.keys(calculatedEdgesByLayer)) : null;

        // Group lines by layer + viewport culling
        const linesByLayer = new Map<string, Array<[number, number, number, number]>>();
        for (const ln of geometry.lines) {
          if (hiddenLayers?.has(ln.layer)) continue;
          if (skipLayers?.has(ln.layer)) continue;
          const [x1, y1, x2, y2] = ln.coords;
          if (!lineInView(x1, y1, x2, y2)) continue;  // A2 culling
          let arr = linesByLayer.get(ln.layer);
          if (!arr) {
            arr = [];
            linesByLayer.set(ln.layer, arr);
          }
          arr.push(ln.coords);
        }

        linesByLayer.forEach((coordsList, layer) => {
          const isSelected = selectedLayer === layer;
          const isHighlighted = highlightLayer === layer;
          let color: string;
          let alpha = 1;
          let lw = strokeWidth;

          if (isSelected) {
            color = COLOR_SELECTED;
            lw = strokeWidth * 2.5;
          } else if (highlightLayer && !isHighlighted) {
            color = COLOR_PASSIVE;
            alpha = 0.3;
          } else {
            const aci = layerColors[layer] ?? 7;
            color = aciToColor(aci);
          }

          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = lw;
          // A4 — Selection glow (shadowBlur). OCERP pattern (dxf-renderer.ts:171-186).
          if (isSelected) {
            ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
            ctx.shadowBlur = 8;
          }
          ctx.beginPath();
          for (const [x1, y1, x2, y2] of coordsList) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          if (isSelected) {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
          }
        });
        ctx.globalAlpha = 1;

        // ─── Arcs (culled by bounding box of full circle) ────────
        if (geometry.arcs.length > 0) {
          ctx.strokeStyle = COLOR_PASSIVE;
          ctx.lineWidth = strokeWidth;
          ctx.beginPath();
          for (const a of geometry.arcs) {
            if (hiddenLayers?.has(a.layer)) continue;
            // A2 culling: arc bbox = (cx ± r, cy ± r) — viewport ile kesisiyor mu?
            const r = a.radius;
            if (!lineInView(a.center[0] - r, a.center[1] - r, a.center[0] + r, a.center[1] + r)) continue;
            const sa = (a.start_angle * Math.PI) / 180;
            const ea = (a.end_angle * Math.PI) / 180;
            ctx.moveTo(a.center[0] + r * Math.cos(sa), a.center[1] + r * Math.sin(sa));
            ctx.arc(a.center[0], a.center[1], r, sa, ea, false);
          }
          ctx.stroke();
        }

        // ─── Circles (sprinkler vs normal) — A2 culled ───────────
        if (geometry.circles.length > 0) {
          const circleInView = (cx: number, cy: number, r: number) =>
            lineInView(cx - r, cy - r, cx + r, cy + r);

          // Sprinkler (turkuaz, kalin)
          ctx.strokeStyle = COLOR_SPRINKLER;
          ctx.lineWidth = strokeWidth * 1.6;
          ctx.beginPath();
          for (const c of geometry.circles) {
            if (hiddenLayers?.has(c.layer)) continue;
            if (!sprinklerLayers?.has(c.layer)) continue;
            if (!circleInView(c.center[0], c.center[1], c.radius)) continue;
            ctx.moveTo(c.center[0] + c.radius, c.center[1]);
            ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI * 2);
          }
          ctx.stroke();

          // Normal (gri)
          ctx.strokeStyle = COLOR_PASSIVE;
          ctx.lineWidth = strokeWidth * 0.8;
          ctx.beginPath();
          for (const c of geometry.circles) {
            if (hiddenLayers?.has(c.layer)) continue;
            if (sprinklerLayers?.has(c.layer)) continue;
            if (!circleInView(c.center[0], c.center[1], c.radius)) continue;
            ctx.moveTo(c.center[0] + c.radius, c.center[1]);
            ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI * 2);
          }
          ctx.stroke();
        }

        // ─── Marked equipment (turuncu nokta) ──────────────────────
        if (markedEquipmentKeys && markedEquipmentKeys.size > 0) {
          ctx.fillStyle = COLOR_MARKED_EQUIPMENT;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = strokeWidth * 0.5;
          for (const ins of geometry.inserts) {
            const key = `${ins.layer}:${ins.insert_index}`;
            if (!markedEquipmentKeys.has(key)) continue;
            ctx.beginPath();
            ctx.arc(ins.position[0], ins.position[1], 3.5 / viewport.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        // ─── Texts (LOD: zoom >= 0.3) — A2 culled ─────────────────
        if (viewport.zoom >= 0.3 && geometry.texts.length > 0) {
          ctx.fillStyle = COLOR_TEXT;
          ctx.textBaseline = 'alphabetic';
          for (const t of geometry.texts) {
            if (hiddenLayers?.has(t.layer)) continue;
            if (!t.text) continue;
            if (!inView(t.position[0], t.position[1])) continue;  // A2 culling
            ctx.save();
            ctx.translate(t.position[0], t.position[1]);
            ctx.scale(1, -1); // text Y-flip için
            if (t.rotation) ctx.rotate(-t.rotation * Math.PI / 180);
            ctx.font = `${Math.max(t.height, 1)}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
          }
        }
      }

      // ─── Calculated edges (boru segments — cap bazli renkli) ─────
      if (edgeSegments && edgeSegments.length > 0) {
        // Cap bazinda grupla
        const byDiameter = new Map<string, EdgeSegment[]>();
        for (const seg of edgeSegments) {
          const key = seg.diameter || 'Belirtilmemis';
          let arr = byDiameter.get(key);
          if (!arr) { arr = []; byDiameter.set(key, arr); }
          arr.push(seg);
        }
        ctx.lineWidth = strokeWidth * 1.8;
        byDiameter.forEach((segs, diameter) => {
          // Basit renk: diameter hash → hue
          const hash = diameter.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
          ctx.strokeStyle = `hsl(${(hash * 47) % 360}, 70%, 60%)`;
          ctx.beginPath();
          for (const seg of segs) {
            if (seg.polyline && seg.polyline.length >= 2) {
              ctx.moveTo(seg.polyline[0][0], seg.polyline[0][1]);
              for (let i = 1; i < seg.polyline.length; i++) {
                ctx.lineTo(seg.polyline[i][0], seg.polyline[i][1]);
              }
            } else {
              ctx.moveTo(seg.coords[0], seg.coords[1]);
              ctx.lineTo(seg.coords[2], seg.coords[3]);
            }
          }
          ctx.stroke();
        });
      }

      ctx.restore();
    };

    schedule();
    return () => cancelAnimationFrame(rafId);
  }, [geometry, edgeSegments, viewport, selectedLayer, highlightLayer, hiddenLayers, sprinklerLayers, markedEquipmentKeys, calculatedEdgesByLayer]);

  // ─── Mouse pozisyonu → world coord (status bar) ──────────────────
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerHandlers.onPointerMove(e);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - viewport.panX) / viewport.zoom;
      const worldY = (viewport.panY - my) / viewport.zoom;
      setCursorWorld({ x: worldX, y: worldY });
    },
    [pointerHandlers, viewport.panX, viewport.panY, viewport.zoom],
  );

  // ─── Click hit-test (line/circle/insert) ─────────────────────────
  const handleClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (wasDragged()) return;
      const el = containerRef.current;
      if (!el || !geometry) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - viewport.panX) / viewport.zoom;
      const worldY = (viewport.panY - my) / viewport.zoom;
      const tol = 5 / viewport.zoom;

      // Insert/circle önce (sembol > çizgi)
      for (const ins of geometry.inserts) {
        const dx = worldX - ins.position[0];
        const dy = worldY - ins.position[1];
        if (Math.hypot(dx, dy) <= tol + 2) {
          onInsertClick?.({ layer: ins.layer, insertIndex: ins.insert_index, insertName: ins.insert_name, position: ins.position });
          return;
        }
      }

      for (const c of geometry.circles) {
        const dx = worldX - c.center[0];
        const dy = worldY - c.center[1];
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - c.radius) <= tol || d <= c.radius) {
          onCircleClick?.({ layer: c.layer, circleIndex: c.circle_index, center: c.center, radius: c.radius });
          return;
        }
      }

      // Lines — point-to-segment distance
      for (const ln of geometry.lines) {
        if (hiddenLayers?.has(ln.layer)) continue;
        const [x1, y1, x2, y2] = ln.coords;
        const d = pointToSegmentDistance(worldX, worldY, x1, y1, x2, y2);
        if (d <= tol) {
          onLineClick?.({ layer: ln.layer, index: 0, shiftKey: e.shiftKey, screenX: e.clientX, screenY: e.clientY });
          return;
        }
      }

      // Edge segments
      if (edgeSegments) {
        for (const seg of edgeSegments) {
          let d = Infinity;
          if (seg.polyline && seg.polyline.length >= 2) {
            for (let i = 0; i < seg.polyline.length - 1; i++) {
              const di = pointToSegmentDistance(worldX, worldY, seg.polyline[i][0], seg.polyline[i][1], seg.polyline[i + 1][0], seg.polyline[i + 1][1]);
              if (di < d) d = di;
            }
          } else {
            d = pointToSegmentDistance(worldX, worldY, seg.coords[0], seg.coords[1], seg.coords[2], seg.coords[3]);
          }
          if (d <= tol) {
            onSegmentClick?.(seg);
            return;
          }
        }
      }

      // Hicbir sey tikla yutmadi → clear
      onClearSelection?.();
    },
    [geometry, edgeSegments, viewport, wasDragged, onLineClick, onCircleClick, onInsertClick, onSegmentClick, onClearSelection, hiddenLayers],
  );

  const usingEdges = !!edgeSegments && edgeSegments.length > 0;
  const lineCount = usingEdges ? edgeSegments!.length : (geometry?.lines.length ?? 0);
  const insertCount = geometry?.inserts?.length ?? 0;
  const layerCount = geometry?.layer_colors ? Object.keys(geometry.layer_colors).length : 0;

  return (
    <div className={`flex flex-col rounded-xl border border-slate-700 overflow-hidden bg-slate-950 ${className}`}>
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none', backgroundColor: COLOR_BG, cursor: 'crosshair' }}
        onPointerDown={pointerHandlers.onPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => {
          pointerHandlers.onPointerUp(e);
          handleClick(e);
        }}
        onPointerCancel={pointerHandlers.onPointerCancel}
        onPointerLeave={() => setCursorWorld(null)}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* Toolbar */}
        <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-md bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1">
          <button type="button" onClick={zoomIn} className="rounded p-1.5 text-slate-300 hover:bg-slate-700" title="Yakinlas">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={zoomOut} className="rounded p-1.5 text-slate-300 hover:bg-slate-700" title="Uzaklas">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={fitView} className="rounded p-1.5 text-slate-300 hover:bg-slate-700" title="Cerceveye sigdir (F)">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* States */}
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
              <p className="text-[10px] text-slate-500">Render free tier cold-start: ~80sn'ye kadar surebilir</p>
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
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-slate-700 bg-slate-900/95 px-3 py-1.5 text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          {cursorWorld ? (
            <span className="font-mono tabular-nums">
              X: {cursorWorld.x.toFixed(2)} · Y: {cursorWorld.y.toFixed(2)}
            </span>
          ) : (
            <span>koordinat yok</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums">Zoom: {(viewport.zoom * 100).toFixed(1)}%</span>
          <span>·</span>
          <span className="tabular-nums">{lineCount} cizgi</span>
          <span>·</span>
          <span className="tabular-nums">{insertCount} ekipman</span>
          <span>·</span>
          <span className="tabular-nums">{layerCount} layer</span>
          <span className="ml-2 rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-400">Canvas2D</span>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
