'use client';

/**
 * DWG SVG Viewer — backend /geometry/{file_id} endpoint'inden gelen
 * koordinatlari SVG ile render eder. Zoom/pan destekli.
 *
 * Kullanim:
 *   <DxfSvgViewer fileId={...} selectedLayers={[...]} className="h-[600px]" />
 *
 * Tamamen izole: external lib yok, sadece React + native SVG.
 * Bu klasorde (components/dwg-viewer/) baska hicbir sey ile bagi yoktur.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Loader2, ZoomIn, ZoomOut, Maximize2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import type { GeometryResult, EdgeSegment } from './types';
import { aciToColor } from './aci-colors';
import { diameterToColor, buildDiameterPalette } from './diameter-colors';
import { useViewport } from './useViewport';

interface DxfSvgViewerProps {
  /** Backend cache'teki file_id (layers endpoint'ten doner) */
  fileId: string | null;
  /** Opsiyonel layer filtresi — bos/undefined ise tum layer'lar gosterilir */
  selectedLayers?: string[];
  /**
   * Edge segment'leri (cap + koordinat). Verilirse geometry yerine bu cizilir,
   * her cizgi capa gore renklendirilir, tiklanabilir olur.
   */
  edgeSegments?: EdgeSegment[];
  /**
   * Workspace modu: hesaplanmis layer'larin edge_segments'leri.
   * Key = layer adi, value = o layer'in edge'leri. Bu layer'lar
   * cap bazli renkli cizilir. Geometry'deki line'lar da gosterilir ama gri.
   */
  calculatedEdgesByLayer?: Record<string, EdgeSegment[]>;
  /** Workspace modu: secili layer — mavi highlight */
  selectedLayer?: string | null;
  /** Workspace modu: isaretlenmis ekipmanlarin key'leri (layer:insertIndex) — turuncu */
  markedEquipmentKeys?: Set<string>;
  /** Bir edge segment'ine tiklanirsa (cap duzeltme icin) */
  onSegmentClick?: (segment: EdgeSegment) => void;
  /** Herhangi bir line'a tiklanirsa (layer secimi icin) */
  onLineClick?: (line: { layer: string; index: number }) => void;
  /** Bir INSERT'e (ekipman) tiklanirsa */
  onInsertClick?: (insert: { layer: string; insertIndex: number; insertName: string; position: [number, number] }) => void;
  /** Bir CIRCLE'a tiklanirsa (sprinkler layer isaretlemek icin) */
  onCircleClick?: (circle: { layer: string; circleIndex: number; center: [number, number]; radius: number }) => void;
  /** Sprinkler olarak isaretli layer'lar — turkuaz renkte + ring ile vurgulanir */
  sprinklerLayers?: Set<string>;
  /** Highlight edilen layer — renkli cizilir, digerleri gri */
  highlightLayer?: string;
  /** Insert'leri de cek (backend'e sinyal — default: true) */
  includeInserts?: boolean;
  className?: string;
}

export default function DxfSvgViewer({
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
  includeInserts,
  className = '',
}: DxfSvgViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layer filtresini stable key'e cevir — useEffect dep'i icin
  const layersKey = useMemo(
    () => (selectedLayers && selectedLayers.length > 0 ? selectedLayers.slice().sort().join(',') : ''),
    [selectedLayers],
  );

  // Edge segments modunda bounds'u kendimiz hesaplariz (geometry fetch'e gerek yok)
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

  // Geometry lines'tan bounds hesapla (backend bounds'undan daha guvenilir:
  // INSERT outlier'lari haric tutar + percentile-based outlier robust hesap).
  const linesBounds = useMemo<[number, number, number, number] | null>(() => {
    if (!geometry || geometry.lines.length === 0) return null;
    // Tum x ve y koordinatlarini ayri topla
    const xs: number[] = [];
    const ys: number[] = [];
    for (const ln of geometry.lines) {
      xs.push(ln.coords[0], ln.coords[2]);
      ys.push(ln.coords[1], ln.coords[3]);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    // %1-%99 persentil — birkac outlier cizgi bounds'u sismesin
    const pct = (arr: number[], p: number) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p)))];
    const minX = pct(xs, 0.01);
    const maxX = pct(xs, 0.99);
    const minY = pct(ys, 0.01);
    const maxY = pct(ys, 0.99);
    // Eger persentil cok dar kalirsa (duz cizgi gibi), gercek min/max kullan
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) {
      return [xs[0], ys[0], xs[xs.length - 1], ys[ys.length - 1]];
    }
    return [minX, minY, maxX, maxY];
  }, [geometry]);

  // Calculated edges'ten segment_id -> EdgeSegment haritasi (hesaplanmis layer'lar)
  const calculatedSegmentsMap = useMemo(() => {
    const map: Record<string, EdgeSegment[]> = {};
    if (calculatedEdgesByLayer) {
      for (const [layer, segs] of Object.entries(calculatedEdgesByLayer)) {
        map[layer] = segs;
      }
    }
    return map;
  }, [calculatedEdgesByLayer]);

  const hasWorkspace = !!calculatedEdgesByLayer || !!selectedLayer || !!markedEquipmentKeys;

  // Cap paleti — legend icin
  const diameterPalette = useMemo(() => {
    if (!edgeSegments) return [];
    return buildDiameterPalette(edgeSegments.map((s) => s.diameter));
  }, [edgeSegments]);

  // Cap bazli uzunluk toplami (legend yanida gosterim icin)
  const diameterLengths = useMemo(() => {
    const map: Record<string, number> = {};
    if (!edgeSegments) return map;
    for (const s of edgeSegments) {
      const k = s.diameter || 'Belirtilmemis';
      map[k] = (map[k] ?? 0) + s.length;
    }
    return map;
  }, [edgeSegments]);

  // file_id veya selected_layers degisince geometriyi cek (SADECE edgeSegments yoksa)
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

  // Bounds oncelik sirasi: edge_segments > line bazli (outlier-robust) > backend bounds > default
  const bounds: [number, number, number, number] =
    edgeBounds ?? linesBounds ?? (geometry?.bounds as [number, number, number, number] | undefined) ?? [0, 0, 100, 100];
  const { viewport, fitView, zoomIn, zoomOut, onWheelReact, wasDragged, pointerHandlers } = useViewport({
    bounds,
    containerRef,
    autoFit: !!geometry || !!edgeSegments,
  });

  // Workspace modunda: layer bazli line gruplari — tek <path> per layer.
  // Bu 15K+ line'i ~30 DOM node'a indirir. Hesaplanmamis layer'lar pasif gri cizilir.
  const layerPathData = useMemo(() => {
    if (!geometry) return [] as Array<{ layer: string; d: string }>;
    const groups: Record<string, string[]> = {};
    for (const ln of geometry.lines) {
      if (!groups[ln.layer]) groups[ln.layer] = [];
      const [x1, y1, x2, y2] = ln.coords;
      groups[ln.layer].push(`M${x1} ${y1}L${x2} ${y2}`);
    }
    return Object.entries(groups).map(([layer, parts]) => ({ layer, d: parts.join('') }));
  }, [geometry]);

  // ─── Render durumlari ───

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

  // Edge-segment modu varsa ona gore erken donus kontrolu
  const usingEdges = !!edgeSegments && edgeSegments.length > 0;

  if (!usingEdges && (!geometry || (geometry.lines.length === 0 && (!geometry.inserts || geometry.inserts.length === 0)))) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 rounded-xl border text-sm text-muted-foreground ${className}`}>
        Bu dosyada cizilebilir cizgi bulunamadi
      </div>
    );
  }

  // ─── SVG Render ───
  const { panX, panY, zoom } = viewport;
  const hasHighlight = !!highlightLayer;
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
      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ display: 'block' }}
      >
        {/* DWG koordinat sistemi Y yukari; SVG Y asagi — `scale(zoom, -zoom)` ile flip */}
        <g transform={`translate(${panX} ${panY}) scale(${zoom} ${-zoom})`}>
          {/* Workspace modu: layer bazli <path> gruplari + hesaplanmis edges + inserts
              Performance: 15K+ line'i layer basi TEK <path> ile ciziyoruz (~30 DOM node). */}
          {hasWorkspace && geometry && (
            <>
              {/* 1. PASIF/SECILI KATMAN: her layer tek path */}
              {layerPathData.map(({ layer, d }) => {
                const hasCalc = !!calculatedSegmentsMap[layer];
                if (hasCalc) return null; // hesaplanmis layer'lar asagida renkli cizilir
                const isSelected = selectedLayer === layer;
                const stroke = isSelected ? '#60a5fa' : '#475569';
                const strokeWidth = isSelected ? 2 : 1;

                const handlePathClick = onLineClick ? (e: React.MouseEvent) => {
                  if (wasDragged()) return;
                  e.stopPropagation();
                  onLineClick({ layer, index: 0 });
                } : undefined;

                return (
                  <g key={`lp-${layer}`}>
                    {/* Gorunmez kalin hit area — tiklanabilirligi kolaylastirir */}
                    {onLineClick && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={10}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        onClick={handlePathClick}
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                      />
                    )}
                    {/* Gorunur ince stroke */}
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: 'none' }}
                    />
                  </g>
                );
              })}

              {/* 2. HESAPLANMIS EDGES: cap bazli renk, edge basi ayri <line> (tiklama lazim) */}
              {Object.entries(calculatedSegmentsMap).flatMap(([layer, segs]) =>
                segs.map((es) => {
                  const handleSegClick = onSegmentClick ? (e: React.MouseEvent) => {
                    if (wasDragged()) return;
                    e.stopPropagation();
                    onSegmentClick(es);
                  } : undefined;
                  const stroke = diameterToColor(es.diameter);

                  // Gercek cizim sekli: polyline varsa onu kullan (L/Z/U korunur),
                  // yoksa iki-ucu line'a dus (tek edge run)
                  const hasPolyline = Array.isArray(es.polyline) && es.polyline.length >= 2;
                  if (hasPolyline) {
                    const pts = es.polyline!.map((p) => `${p[0]},${p[1]}`).join(' ');
                    return (
                      <g key={`ce-${layer}-${es.segment_id}`}>
                        {onSegmentClick && (
                          <polyline
                            points={pts}
                            stroke="transparent"
                            strokeWidth={10}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            onClick={handleSegClick}
                            style={{ cursor: 'pointer' }}
                          />
                        )}
                        <polyline
                          points={pts}
                          stroke={stroke}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          vectorEffect="non-scaling-stroke"
                          style={{ pointerEvents: 'none' }}
                        />
                      </g>
                    );
                  }

                  // Fallback — tek edge line
                  const [x1, y1, x2, y2] = es.coords;
                  return (
                    <g key={`ce-${layer}-${es.segment_id}`}>
                      {onSegmentClick && (
                        <line
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke="transparent"
                          strokeWidth={10}
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          onClick={handleSegClick}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={stroke}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  );
                })
              )}

              {/* 2b. CIRCLE'lar (sprinkler kafalari, semboller) — layer bazli renk.
                  Tiklanirsa o layer "sprinkler" olarak isaretlenir. */}
              {geometry.circles && geometry.circles.map((c) => {
                const [cx, cy] = c.center;
                const isSprinklerLayer = sprinklerLayers?.has(c.layer);
                const stroke = isSprinklerLayer ? '#22d3ee' : '#94a3b8';
                const strokeWidth = isSprinklerLayer ? 1.6 : 0.8;
                return (
                  <circle
                    key={`circle-${c.circle_index}`}
                    cx={cx} cy={cy} r={c.radius}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    vectorEffect="non-scaling-stroke"
                    onClick={onCircleClick ? (e) => {
                      if (wasDragged()) return;
                      e.stopPropagation();
                      onCircleClick({
                        layer: c.layer,
                        circleIndex: c.circle_index,
                        center: [cx, cy],
                        radius: c.radius,
                      });
                    } : undefined}
                    style={onCircleClick ? { cursor: 'pointer' } : undefined}
                  />
                );
              })}

              {/* 3. INSERT'ler (ekipman noktalari) */}
              {geometry.inserts && geometry.inserts.map((ins) => {
                const [px, py] = ins.position;
                const key = `${ins.layer}:${ins.insert_index}`;
                const isMarked = markedEquipmentKeys?.has(key);
                const fill = isMarked ? '#f97316' : '#64748b';
                const radius = isMarked ? 3.5 : 2;
                return (
                  <circle
                    key={`ins-${ins.insert_index}`}
                    cx={px} cy={py} r={radius}
                    fill={fill}
                    stroke={isMarked ? '#fff' : 'none'}
                    strokeWidth={isMarked ? 0.5 : 0}
                    vectorEffect="non-scaling-stroke"
                    onClick={onInsertClick ? (e) => {
                      if (wasDragged()) return;
                      e.stopPropagation();
                      onInsertClick({ layer: ins.layer, insertIndex: ins.insert_index, insertName: ins.insert_name, position: ins.position });
                    } : undefined}
                    style={onInsertClick ? { cursor: 'pointer' } : undefined}
                  />
                );
              })}

              {/* 4. TEXT / MTEXT — cap etiketleri, olcu, not.
                  AI cap atamasinin dogrulanmasi icin kullanici gorsun.
                  Parent <g>'de scale(zoom, -zoom) var — text icin local scale(1, -1) ile Y flip iptali. */}
              {geometry.texts && geometry.texts.map((t, i) => {
                const [tx, ty] = t.position;
                return (
                  <g
                    key={`txt-${i}`}
                    transform={`translate(${tx} ${ty}) rotate(${-t.rotation})`}
                    style={{ pointerEvents: 'none' }}
                  >
                    <text
                      x={0}
                      y={0}
                      fontSize={t.height}
                      fill="#fbbf24"
                      fontFamily="ui-monospace, monospace"
                      transform="scale(1 -1)"
                    >
                      {t.text}
                    </text>
                  </g>
                );
              })}
            </>
          )}

          {/* Eski mod: edge_segments veya geometry.lines tek renk */}
          {!hasWorkspace && (usingEdges
            ? edgeSegments!.map((es) => {
                const [x1, y1, x2, y2] = es.coords;
                const stroke = diameterToColor(es.diameter);
                const clickable = !!onSegmentClick;
                return (
                  <line
                    key={es.segment_id}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={stroke}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    onClick={clickable ? (e) => { e.stopPropagation(); onSegmentClick!(es); } : undefined}
                    style={clickable ? { cursor: 'pointer' } : undefined}
                  >
                    <title>{`${es.layer} · ${es.diameter || 'Belirtilmemis'} · ${es.length.toFixed(2)} m`}</title>
                  </line>
                );
              })
            : geometry!.lines.map((ln, i) => {
                const [x1, y1, x2, y2] = ln.coords;
                let stroke: string;
                let strokeWidth: number;

                if (hasHighlight) {
                  if (ln.layer === highlightLayer) {
                    stroke = aciToColor(ln.color, '#60a5fa');
                    strokeWidth = 2.5;
                  } else {
                    stroke = '#334155'; // soluk
                    strokeWidth = 1;
                  }
                } else {
                  const layerColor = geometry!.layer_colors[ln.layer] ?? 7;
                  stroke = aciToColor(ln.color === 256 ? layerColor : ln.color, '#e2e8f0');
                  strokeWidth = 1.3;
                }

                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    onClick={onLineClick ? (e) => { e.stopPropagation(); onLineClick({ layer: ln.layer, index: i }); } : undefined}
                    style={onLineClick ? { cursor: 'pointer' } : undefined}
                  />
                );
              }))
          }
        </g>
      </svg>

      {/* Bilgi banner — sol ust (debug detaylari ile) */}
      <div className="absolute top-2 left-2 rounded bg-slate-800/90 px-2.5 py-1 text-[10px] font-mono text-slate-100 border border-slate-600 space-y-0.5 max-w-[320px]">
        <div>
          {lineCount.toLocaleString('tr-TR')} çizgi · zoom {zoom < 0.01 ? zoom.toExponential(2) : zoom.toFixed(2) + 'x'}
        </div>
        {insertCount > 0 && (
          <div className="text-[9px] text-slate-300">{insertCount} INSERT (ekipman)</div>
        )}
        <div className="text-[9px] text-slate-400">
          bounds: [{bounds[0].toFixed(0)}..{bounds[2].toFixed(0)} × {bounds[1].toFixed(0)}..{bounds[3].toFixed(0)}]
        </div>
        <div className="text-[9px] text-slate-400">
          container: {containerRef.current?.getBoundingClientRect().width.toFixed(0) ?? '?'}×{containerRef.current?.getBoundingClientRect().height.toFixed(0) ?? '?'}
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
