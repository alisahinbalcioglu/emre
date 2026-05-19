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
 *   - rbush spatial index: 26K+ cizgide hover/click O(log N)
 *   - Hover overlay: cursor pointer + glow
 *   - Per-line selection + tooltip (layer + uzunluk)
 *
 * Layer durumlari (her biri bagimsiz):
 *   - hidden:  hic cizilmez, hit-test'te atlanır
 *   - dimmed:  %25 opacity gri, hit-test'te atlanır (referans)
 *   - normal:  ACI renkli, etkilesime acik
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RBush from 'rbush';
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import api from '@/lib/api';
import type { GeometryResult } from './types';
import type { EdgeSegment } from '@/components/dwg-metraj/types';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import { useViewport } from './useViewport';
import { aciToColor } from './aci-colors';

interface DxfCanvasViewerProps {
  fileId: string | null;
  selectedLayers?: string[];
  edgeSegments?: EdgeSegment[];
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  /** Layer adi -> T-junction noktalari ([x,y] listesi). Canvas2D'de marker olarak cizilir. */
  calculatedJunctionsByLayer?: Record<string, [number, number][]>;
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
  dimmedLayers?: Set<string>;
  /** Birim donusturucu (DWG birimi → metre). mm=0.001, cm=0.01, m=1.0. Tooltip uzunluk hesabi icin. */
  scale?: number;
}

const COLOR_BG = '#0b1220';
const COLOR_PASSIVE = '#94a3b8';
const COLOR_SELECTED = '#60a5fa';
const COLOR_TEXT = '#fbbf24';
const COLOR_SPRINKLER = '#22d3ee';
const COLOR_MARKED_EQUIPMENT = '#f97316';
const COLOR_DIMMED = '#475569';            // slate-600
const COLOR_HOVER = '#fde68a';             // amber-200 glow
const COLOR_LINE_SELECTED = '#3b82f6';     // brand blue
const DIMMED_ALPHA = 0.45;
const HOVER_TOL_PX = 6;

interface SpatialEntry {
  minX: number; minY: number; maxX: number; maxY: number;
  type: 'line' | 'edge';
  layer: string;
  /** geometry.lines[] icindeki index ya da edgeSegments[] icindeki index */
  index: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
  /** Sadece type='edge' icin: cap ve miras durumu (tooltip + renk icin) */
  diameter?: string;
  isInherited?: boolean;
}

interface HoveredEntity {
  type: 'line' | 'edge';
  layer: string;
  index: number;
  coords: [number, number, number, number];
  polyline?: Array<[number, number]>;
  /** Metre cinsinden hesaplanmis uzunluk (scale uygulanmis). */
  length: number;
  /** Sadece edge tipi icin: cap ve BFS miras durumu */
  diameter?: string;
  isInherited?: boolean;
}

export default function DxfCanvasViewer({
  fileId,
  edgeSegments,
  calculatedEdgesByLayer,
  calculatedJunctionsByLayer,
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
  dimmedLayers,
  scale = 0.001,
}: DxfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<HoveredEntity | null>(null);
  const [selectedLine, setSelectedLine] = useState<HoveredEntity | null>(null);

  // Hesaplanmis tum edge segment'leri tek bir array'e flatten et.
  // edgeSegments prop'u verilirse onu, yoksa calculatedEdgesByLayer'daki tum
  // layer'larin segment'lerini birlestir. Boylece render path + spatial index
  // + bounds tek bir kaynak kullanir.
  const allEdgeSegments = useMemo<EdgeSegment[] | null>(() => {
    if (edgeSegments && edgeSegments.length > 0) return edgeSegments;
    if (calculatedEdgesByLayer) {
      const flat = Object.values(calculatedEdgesByLayer).flat();
      if (flat.length > 0) return flat;
    }
    return null;
  }, [edgeSegments, calculatedEdgesByLayer]);

  // Bounds (DWG world)
  const bounds = useMemo<[number, number, number, number]>(() => {
    if (allEdgeSegments && allEdgeSegments.length > 0) {
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const es of allEdgeSegments) {
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
  }, [geometry, allEdgeSegments]);

  const { viewport, fitView, zoomIn, zoomOut, wasDragged, pointerHandlers } = useViewport({
    bounds,
    containerRef,
    autoFit: !!geometry || !!allEdgeSegments,
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
      if (status === 429 || status === 422) return true;
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
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxRef.current = ctx;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ─── Spatial index (rbush) ────────────────────────────────────────
  // 26K cizgide hover/click O(log N). Build O(N) — geometry degisince yeniden.
  const spatialIndex = useMemo<RBush<SpatialEntry>>(() => {
    const tree = new RBush<SpatialEntry>();
    const items: SpatialEntry[] = [];
    if (geometry) {
      geometry.lines.forEach((ln, i) => {
        const [x1, y1, x2, y2] = ln.coords;
        items.push({
          minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
          minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
          type: 'line', layer: ln.layer, index: i, coords: ln.coords,
        });
      });
    }
    if (allEdgeSegments) {
      allEdgeSegments.forEach((seg, i) => {
        const meta = {
          type: 'edge' as const, layer: seg.layer, index: i,
          coords: seg.coords,
          diameter: seg.diameter || undefined,
          isInherited: seg.is_inherited || false,
        };
        if (seg.polyline && seg.polyline.length >= 2) {
          let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
          for (const [x, y] of seg.polyline) {
            if (x < mnx) mnx = x; if (x > mxx) mxx = x;
            if (y < mny) mny = y; if (y > mxy) mxy = y;
          }
          items.push({
            minX: mnx, minY: mny, maxX: mxx, maxY: mxy,
            ...meta, polyline: seg.polyline,
          });
        } else {
          const [x1, y1, x2, y2] = seg.coords;
          items.push({
            minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
            minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
            ...meta,
          });
        }
      });
    }
    tree.load(items);
    return tree;
  }, [geometry, allEdgeSegments]);

  // Hidden/dimmed layer degisince hover/selected gecersiz olabilir, temizle
  useEffect(() => {
    if (hovered && (hiddenLayers?.has(hovered.layer) || dimmedLayers?.has(hovered.layer))) {
      setHovered(null);
    }
    if (selectedLine && (hiddenLayers?.has(selectedLine.layer) || dimmedLayers?.has(selectedLine.layer))) {
      setSelectedLine(null);
    }
  }, [hiddenLayers, dimmedLayers, hovered, selectedLine]);

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

      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);

      // Adaptive grid (screen space, transform oncesi)
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

      // Viewport culling
      const marginPx = 50;
      const worldMinX = (-marginPx - viewport.panX) / viewport.zoom;
      const worldMaxX = (w + marginPx - viewport.panX) / viewport.zoom;
      const worldMinY = (viewport.panY - (h + marginPx)) / viewport.zoom;
      const worldMaxY = (viewport.panY + marginPx) / viewport.zoom;
      const inView = (x: number, y: number) => x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY;
      const lineInView = (x1: number, y1: number, x2: number, y2: number) => {
        const lnMinX = Math.min(x1, x2), lnMaxX = Math.max(x1, x2);
        const lnMinY = Math.min(y1, y2), lnMaxY = Math.max(y1, y2);
        return lnMaxX >= worldMinX && lnMinX <= worldMaxX && lnMaxY >= worldMinY && lnMinY <= worldMaxY;
      };

      ctx.save();
      ctx.translate(viewport.panX, viewport.panY);
      ctx.scale(viewport.zoom, -viewport.zoom);

      const strokeWidth = 1 / viewport.zoom;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';

      if (geometry && !edgeSegments) {
        const layerColors = geometry.layer_colors || {};
        const skipLayers = calculatedEdgesByLayer ? new Set(Object.keys(calculatedEdgesByLayer)) : null;

        // Layer bazinda 3 grup: normal, dimmed (skip render path is hidden)
        const normalByLayer = new Map<string, Array<[number, number, number, number]>>();
        const dimmedByLayer = new Map<string, Array<[number, number, number, number]>>();

        for (const ln of geometry.lines) {
          if (hiddenLayers?.has(ln.layer)) continue;
          if (skipLayers?.has(ln.layer)) continue;
          const [x1, y1, x2, y2] = ln.coords;
          if (!lineInView(x1, y1, x2, y2)) continue;
          const bucket = dimmedLayers?.has(ln.layer) ? dimmedByLayer : normalByLayer;
          let arr = bucket.get(ln.layer);
          if (!arr) {
            arr = [];
            bucket.set(ln.layer, arr);
          }
          arr.push(ln.coords);
        }

        // ─── Dimmed layers (önce, arka plana otursun) ─────────────
        if (dimmedByLayer.size > 0) {
          ctx.globalAlpha = DIMMED_ALPHA;
          ctx.strokeStyle = COLOR_DIMMED;
          ctx.lineWidth = strokeWidth;
          ctx.beginPath();
          dimmedByLayer.forEach((coordsList) => {
            for (const [x1, y1, x2, y2] of coordsList) {
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
            }
          });
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // ─── Normal layers (ACI renkli) ───────────────────────────
        normalByLayer.forEach((coordsList, layer) => {
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

        // ─── Arcs (normal + dimmed iki pass) ──────────────────────
        if (geometry.arcs.length > 0) {
          const drawArcs = (filterDim: boolean, color: string, alpha: number) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = strokeWidth;
            ctx.beginPath();
            for (const a of geometry.arcs) {
              if (hiddenLayers?.has(a.layer)) continue;
              const isDim = !!dimmedLayers?.has(a.layer);
              if (filterDim !== isDim) continue;
              const r = a.radius;
              if (!lineInView(a.center[0] - r, a.center[1] - r, a.center[0] + r, a.center[1] + r)) continue;
              const sa = (a.start_angle * Math.PI) / 180;
              const ea = (a.end_angle * Math.PI) / 180;
              ctx.moveTo(a.center[0] + r * Math.cos(sa), a.center[1] + r * Math.sin(sa));
              ctx.arc(a.center[0], a.center[1], r, sa, ea, false);
            }
            ctx.stroke();
          };
          drawArcs(false, COLOR_PASSIVE, 1);
          if (dimmedLayers && dimmedLayers.size > 0) {
            drawArcs(true, COLOR_DIMMED, DIMMED_ALPHA);
          }
          ctx.globalAlpha = 1;
        }

        // ─── Circles (sprinkler/normal × normal/dimmed = 4 pass) ──
        if (geometry.circles.length > 0) {
          const circleInView = (cx: number, cy: number, r: number) =>
            lineInView(cx - r, cy - r, cx + r, cy + r);

          const drawCircles = (
            filterSprinkler: boolean,
            filterDim: boolean,
            color: string,
            lw: number,
            alpha: number,
          ) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.beginPath();
            for (const c of geometry.circles) {
              if (hiddenLayers?.has(c.layer)) continue;
              const isSprink = !!sprinklerLayers?.has(c.layer);
              if (filterSprinkler !== isSprink) continue;
              const isDim = !!dimmedLayers?.has(c.layer);
              if (filterDim !== isDim) continue;
              if (!circleInView(c.center[0], c.center[1], c.radius)) continue;
              ctx.moveTo(c.center[0] + c.radius, c.center[1]);
              ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI * 2);
            }
            ctx.stroke();
          };

          // Normal pass'lar
          drawCircles(true, false, COLOR_SPRINKLER, strokeWidth * 1.6, 1);
          drawCircles(false, false, COLOR_PASSIVE, strokeWidth * 0.8, 1);
          // Dimmed pass'lar (sprinkler ya da normal fark etmez, hepsi gri+%25)
          if (dimmedLayers && dimmedLayers.size > 0) {
            drawCircles(true, true, COLOR_DIMMED, strokeWidth * 0.8, DIMMED_ALPHA);
            drawCircles(false, true, COLOR_DIMMED, strokeWidth * 0.8, DIMMED_ALPHA);
          }
          ctx.globalAlpha = 1;
        }

        // ─── Marked equipment (hidden = atla; dimmed = %25 alpha) ─
        if (markedEquipmentKeys && markedEquipmentKeys.size > 0) {
          ctx.fillStyle = COLOR_MARKED_EQUIPMENT;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = strokeWidth * 0.5;
          for (const ins of geometry.inserts) {
            const key = `${ins.layer}:${ins.insert_index}`;
            if (!markedEquipmentKeys.has(key)) continue;
            if (hiddenLayers?.has(ins.layer)) continue;
            ctx.globalAlpha = dimmedLayers?.has(ins.layer) ? DIMMED_ALPHA : 1;
            ctx.beginPath();
            ctx.arc(ins.position[0], ins.position[1], 3.5 / viewport.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // ─── Texts (dimmed = gri + %25 alpha, fillText per-text) ──
        if (viewport.zoom >= 0.3 && geometry.texts.length > 0) {
          ctx.textBaseline = 'alphabetic';
          for (const t of geometry.texts) {
            if (hiddenLayers?.has(t.layer)) continue;
            if (!t.text) continue;
            if (!inView(t.position[0], t.position[1])) continue;
            const isDim = !!dimmedLayers?.has(t.layer);
            ctx.fillStyle = isDim ? COLOR_DIMMED : COLOR_TEXT;
            ctx.globalAlpha = isDim ? DIMMED_ALPHA : 1;
            ctx.save();
            ctx.translate(t.position[0], t.position[1]);
            ctx.scale(1, -1);
            if (t.rotation) ctx.rotate(-t.rotation * Math.PI / 180);
            ctx.font = `${Math.max(t.height, 1)}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
      }

      // ─── Calculated edges (hidden = atla, dimmed = ayri gri pass) ─
      if (allEdgeSegments && allEdgeSegments.length > 0) {
        const drawSegPath = (seg: EdgeSegment) => {
          if (seg.polyline && seg.polyline.length >= 2) {
            ctx.moveTo(seg.polyline[0][0], seg.polyline[0][1]);
            for (let i = 1; i < seg.polyline.length; i++) {
              ctx.lineTo(seg.polyline[i][0], seg.polyline[i][1]);
            }
          } else {
            ctx.moveTo(seg.coords[0], seg.coords[1]);
            ctx.lineTo(seg.coords[2], seg.coords[3]);
          }
        };

        // Normal pass: layer-bazli filtrele, cap-bazli renkli grupla
        const byDiameter = new Map<string, EdgeSegment[]>();
        const dimmedSegs: EdgeSegment[] = [];
        for (const seg of allEdgeSegments) {
          if (hiddenLayers?.has(seg.layer)) continue;
          if (dimmedLayers?.has(seg.layer)) {
            dimmedSegs.push(seg);
            continue;
          }
          const key = seg.diameter || 'Belirtilmemis';
          let arr = byDiameter.get(key);
          if (!arr) { arr = []; byDiameter.set(key, arr); }
          arr.push(seg);
        }

        ctx.lineWidth = strokeWidth * 1.8;
        ctx.globalAlpha = 1;
        byDiameter.forEach((segs, diameter) => {
          // Sabit cap->renk haritasi (MetrajSummaryPanel ile tutarli)
          ctx.strokeStyle = diameterToColor(diameter);
          ctx.beginPath();
          for (const seg of segs) drawSegPath(seg);
          ctx.stroke();
        });

        // Dimmed pass: hepsi gri + %25
        if (dimmedSegs.length > 0) {
          ctx.globalAlpha = DIMMED_ALPHA;
          ctx.strokeStyle = COLOR_DIMMED;
          ctx.beginPath();
          for (const seg of dimmedSegs) drawSegPath(seg);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ─── T-junction marker'lari (>=3 segment buluştugu noktalar) ──
      // Kullanici "burada T noktası var, 3 segment ayri" diye gorsel ipucu.
      // Beyaz bordurlu mavi nokta — zoom-bagimsiz piksel cinsinden boyut.
      if (calculatedJunctionsByLayer) {
        const allJunctions: [number, number][] = [];
        for (const [layer, pts] of Object.entries(calculatedJunctionsByLayer)) {
          if (hiddenLayers?.has(layer) || dimmedLayers?.has(layer)) continue;
          allJunctions.push(...pts);
        }
        if (allJunctions.length > 0) {
          const markerRadius = 4 / viewport.zoom;  // 4px ekranda
          const borderWidth = 1.5 / viewport.zoom;
          ctx.globalAlpha = 1;
          for (const [jx, jy] of allJunctions) {
            // Beyaz border
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(jx, jy, markerRadius + borderWidth, 0, Math.PI * 2);
            ctx.fill();
            // Ic mavi
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(jx, jy, markerRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ─── HOVER overlay (amber glow + 2x stroke) ───────────────────
      if (hovered) {
        ctx.strokeStyle = COLOR_HOVER;
        ctx.lineWidth = strokeWidth * 2.2;
        ctx.shadowColor = 'rgba(253, 230, 138, 0.7)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        if (hovered.polyline && hovered.polyline.length >= 2) {
          ctx.moveTo(hovered.polyline[0][0], hovered.polyline[0][1]);
          for (let i = 1; i < hovered.polyline.length; i++) {
            ctx.lineTo(hovered.polyline[i][0], hovered.polyline[i][1]);
          }
        } else {
          ctx.moveTo(hovered.coords[0], hovered.coords[1]);
          ctx.lineTo(hovered.coords[2], hovered.coords[3]);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      // ─── SELECTED overlay (brand blue + 2.5x stroke + bigger glow) ──
      if (selectedLine) {
        ctx.strokeStyle = COLOR_LINE_SELECTED;
        ctx.lineWidth = strokeWidth * 3;
        ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        if (selectedLine.polyline && selectedLine.polyline.length >= 2) {
          ctx.moveTo(selectedLine.polyline[0][0], selectedLine.polyline[0][1]);
          for (let i = 1; i < selectedLine.polyline.length; i++) {
            ctx.lineTo(selectedLine.polyline[i][0], selectedLine.polyline[i][1]);
          }
        } else {
          ctx.moveTo(selectedLine.coords[0], selectedLine.coords[1]);
          ctx.lineTo(selectedLine.coords[2], selectedLine.coords[3]);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      ctx.restore();
    };

    schedule();
    return () => cancelAnimationFrame(rafId);
  }, [geometry, allEdgeSegments, calculatedJunctionsByLayer, viewport, selectedLayer, highlightLayer, hiddenLayers, dimmedLayers, sprinklerLayers, markedEquipmentKeys, hovered, selectedLine]);

  // ─── Hover detection (rbush ile O(log N)) ────────────────────────
  const computeHovered = useCallback(
    (worldX: number, worldY: number): HoveredEntity | null => {
      const tol = HOVER_TOL_PX / viewport.zoom;
      const candidates = spatialIndex.search({
        minX: worldX - tol, minY: worldY - tol,
        maxX: worldX + tol, maxY: worldY + tol,
      });
      let best: SpatialEntry | null = null;
      let bestDist = Infinity;
      for (const c of candidates) {
        if (hiddenLayers?.has(c.layer)) continue;
        if (dimmedLayers?.has(c.layer)) continue;
        let d: number;
        if (c.polyline && c.polyline.length >= 2) {
          d = Infinity;
          for (let i = 0; i < c.polyline.length - 1; i++) {
            const di = pointToSegmentDistance(
              worldX, worldY,
              c.polyline[i][0], c.polyline[i][1],
              c.polyline[i + 1][0], c.polyline[i + 1][1],
            );
            if (di < d) d = di;
          }
        } else {
          d = pointToSegmentDistance(worldX, worldY, c.coords[0], c.coords[1], c.coords[2], c.coords[3]);
        }
        if (d <= tol && d < bestDist) {
          best = c;
          bestDist = d;
        }
      }
      if (!best) return null;
      return {
        type: best.type,
        layer: best.layer,
        index: best.index,
        coords: best.coords,
        polyline: best.polyline,
        length: computeEntityLength(best, scale),
        diameter: best.diameter,
        isInherited: best.isInherited,
      };
    },
    [spatialIndex, viewport.zoom, hiddenLayers, dimmedLayers, scale],
  );

  // ─── Mouse pozisyonu → world coord + hover ──────────────────────
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
      setCursorScreen({ x: mx, y: my });

      // Hover detection — pan/drag esnasinda atla (yanlis hover gosterimi olmasin)
      const newHover = computeHovered(worldX, worldY);
      // Aynı entity ise re-render tetiklememek için referans karşılaştırması
      if (newHover?.type !== hovered?.type || newHover?.index !== hovered?.index || newHover?.layer !== hovered?.layer) {
        setHovered(newHover);
      }
    },
    [pointerHandlers, viewport.panX, viewport.panY, viewport.zoom, computeHovered, hovered],
  );

  // ─── Click hit-test ──────────────────────────────────────────────
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
      const tol = HOVER_TOL_PX / viewport.zoom;

      // Insert/circle önce (sembol > çizgi). Dimmed/hidden atlanir.
      for (const ins of geometry.inserts) {
        if (hiddenLayers?.has(ins.layer)) continue;
        if (dimmedLayers?.has(ins.layer)) continue;
        const dx = worldX - ins.position[0];
        const dy = worldY - ins.position[1];
        if (Math.hypot(dx, dy) <= tol + 2) {
          setSelectedLine(null);
          onInsertClick?.({ layer: ins.layer, insertIndex: ins.insert_index, insertName: ins.insert_name, position: ins.position });
          return;
        }
      }

      for (const c of geometry.circles) {
        if (hiddenLayers?.has(c.layer)) continue;
        if (dimmedLayers?.has(c.layer)) continue;
        const dx = worldX - c.center[0];
        const dy = worldY - c.center[1];
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - c.radius) <= tol || d <= c.radius) {
          setSelectedLine(null);
          onCircleClick?.({ layer: c.layer, circleIndex: c.circle_index, center: c.center, radius: c.radius });
          return;
        }
      }

      // Line/edge: spatial index ile en yakini bul
      const target = computeHovered(worldX, worldY);
      if (target) {
        setSelectedLine(target);
        if (target.type === 'line') {
          onLineClick?.({ layer: target.layer, index: target.index, shiftKey: e.shiftKey, screenX: e.clientX, screenY: e.clientY });
        } else if (target.type === 'edge' && allEdgeSegments) {
          onSegmentClick?.(allEdgeSegments[target.index]);
        }
        return;
      }

      // Hicbir sey tutmadi → clear selection
      setSelectedLine(null);
      onClearSelection?.();
    },
    [geometry, allEdgeSegments, viewport, wasDragged, computeHovered, hiddenLayers, dimmedLayers, onLineClick, onCircleClick, onInsertClick, onSegmentClick, onClearSelection],
  );

  // Esc → clear selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedLine(null);
        setHovered(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const usingEdges = !!edgeSegments && edgeSegments.length > 0;
  const lineCount = usingEdges ? edgeSegments!.length : (geometry?.lines.length ?? 0);
  const insertCount = geometry?.inserts?.length ?? 0;
  const layerCount = geometry?.layer_colors ? Object.keys(geometry.layer_colors).length : 0;

  const cursorClass = hovered ? 'cursor-pointer' : 'cursor-crosshair';

  return (
    <div className={`flex flex-col rounded-xl border border-slate-700 overflow-hidden bg-slate-950 ${className}`}>
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-hidden ${cursorClass}`}
        style={{ touchAction: 'none', backgroundColor: COLOR_BG }}
        onPointerDown={pointerHandlers.onPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => {
          pointerHandlers.onPointerUp(e);
          handleClick(e);
        }}
        onPointerCancel={pointerHandlers.onPointerCancel}
        onPointerLeave={() => {
          setCursorWorld(null);
          setCursorScreen(null);
          setHovered(null);
        }}
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

        {/* Tooltip — hover ya da selected uzerinde */}
        {(selectedLine || hovered) && cursorScreen && (
          <Tooltip
            entity={selectedLine ?? hovered!}
            screenX={cursorScreen.x}
            screenY={cursorScreen.y}
            pinned={!!selectedLine}
          />
        )}

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

function computeEntityLength(entry: SpatialEntry, scale: number): number {
  if (entry.polyline && entry.polyline.length >= 2) {
    let total = 0;
    for (let i = 0; i < entry.polyline.length - 1; i++) {
      total += Math.hypot(
        entry.polyline[i + 1][0] - entry.polyline[i][0],
        entry.polyline[i + 1][1] - entry.polyline[i][1],
      );
    }
    return total * scale;
  }
  const [x1, y1, x2, y2] = entry.coords;
  return Math.hypot(x2 - x1, y2 - y1) * scale;
}

// ─── Tooltip subcomponent ───────────────────────────────────────────

interface TooltipProps {
  entity: HoveredEntity;
  screenX: number;
  screenY: number;
  /** Selected ise (tıklanmıs), hover ise false. Pinned tooltip biraz daha belirgin. */
  pinned: boolean;
}

function Tooltip({ entity, screenX, screenY, pinned }: TooltipProps) {
  // Farenin sag-altinda (+14, +14) — PRD'ye uygun. Ekran kenarina tasarsa ayarla.
  const offsetX = 14;
  const offsetY = 14;
  return (
    <div
      className={`pointer-events-none absolute z-20 rounded-lg border px-3 py-1.5 shadow-xl backdrop-blur-sm transition-opacity ${
        pinned
          ? 'border-blue-400 bg-blue-900/95 text-white'
          : 'border-amber-400/60 bg-slate-900/95 text-amber-100'
      }`}
      style={{
        left: `${screenX + offsetX}px`,
        top: `${screenY + offsetY}px`,
        maxWidth: '320px',
      }}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        {entity.type === 'edge' ? 'Hesaplanmis Segment' : 'Ham Cizgi (hesaplanmadi)'}
      </div>
      <div className="mt-0.5 text-sm font-semibold truncate" title={entity.layer}>
        {entity.layer}
      </div>
      {entity.diameter && entity.diameter !== 'Belirtilmemis' && (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-xs opacity-70">Cap:</span>
          <span className="font-mono text-sm font-bold tabular-nums">
            {entity.diameter}
          </span>
          {entity.isInherited && (
            <span
              className="ml-1 text-[10px] opacity-75 italic"
              title="Cap, komsu segmentten graph BFS ile miras alindi"
            >
              ↳ miras
            </span>
          )}
        </div>
      )}
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xs opacity-70">Uzunluk:</span>
        <span className="font-mono text-sm font-bold tabular-nums">
          {entity.length.toFixed(2)}
        </span>
        <span className="text-xs opacity-70">m</span>
      </div>
      {entity.type === 'line' && (
        <div className="mt-2 rounded bg-amber-500/20 border border-amber-400/40 px-2 py-1 text-[11px] text-amber-100">
          T noktalarinda bolunme icin <strong>"Bu Layer'i Hesapla"</strong> butonuna bas.
        </div>
      )}
      {pinned && (
        <div className="mt-1 text-[10px] opacity-60">Esc ile kaldir</div>
      )}
    </div>
  );
}
