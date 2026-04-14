'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ── Types ──

export interface EdgeSegment {
  segment_id: number;
  layer: string;
  diameter: string;
  length: number;
  line_count: number;
  material_type: string;
  coords: number[][];
}

export interface BranchPoint {
  x: number;
  y: number;
  connections: number;
  point_type: string;
}

interface PipeMapViewerProps {
  segments: EdgeSegment[];
  branchPoints: BranchPoint[];
  backgroundLines?: number[][];
  layerName: string;
  onApprove: (correctedSegments: EdgeSegment[]) => void;
  onBack: () => void;
}

// ── Constants ──

const AVAILABLE_DIAMETERS = [
  'Ø25', 'Ø32', 'Ø40', 'Ø50', 'Ø63', 'Ø70', 'Ø75',
  'Ø100', 'Ø110', 'Ø125', 'Ø150', 'Ø200',
  'DN25', 'DN32', 'DN40', 'DN50', 'DN63', 'DN75',
  'DN100', 'DN125', 'DN150', 'DN200',
  '½"', '¾"', '1"', '1¼"', '1½"', '2"', '2½"', '3"', '4"',
] as const;

const DIAMETER_COLORS: Record<string, string> = {
  'Ø200': '#ef4444',   // red-500
  'Ø150': '#f97316',   // orange-500
  'Ø125': '#eab308',   // yellow-500
  'Ø110': '#22c55e',   // green-500
  'Ø100': '#3b82f6',   // blue-500
  'Ø75':  '#8b5cf6',   // violet-500
  'Ø70':  '#ec4899',   // pink-500
  'Ø63':  '#14b8a6',   // teal-500
  'Ø50':  '#f59e0b',   // amber-500
  'Ø40':  '#06b6d4',   // cyan-500
  'Ø32':  '#a855f7',   // purple-500
  'Ø25':  '#10b981',   // emerald-500
  'DN200': '#ef4444',
  'DN150': '#f97316',
  'DN125': '#eab308',
  'DN100': '#3b82f6',
  'DN75':  '#8b5cf6',
  'DN63':  '#14b8a6',
  'DN50':  '#f59e0b',
  'DN40':  '#06b6d4',
  'DN32':  '#a855f7',
  'DN25':  '#10b981',
  '4"':    '#ef4444',   // red-500
  '3"':    '#f97316',   // orange-500
  '2½"':   '#eab308',   // yellow-500
  '2"':    '#22c55e',   // green-500
  '1½"':   '#3b82f6',   // blue-500
  '1¼"':   '#8b5cf6',   // violet-500
  '1"':    '#ec4899',   // pink-500
  '¾"':    '#f59e0b',   // amber-500
  '½"':    '#10b981',   // emerald-500
  'Belirtilmemis': '#94a3b8', // slate-400
};

const STROKE_WIDTH = 28;
const LABEL_FONT_SIZE = 120;
const BRANCH_RADIUS = 40;
const MIN_LABEL_LENGTH = 0.15;
const VIEWBOX_PADDING = 200;

// ── Helpers ──

/** Normalize diameter display: convert O prefix to Ø */
function normalizeDiameter(d: string): string {
  if (!d) return 'Belirtilmemis';
  return d.replace(/^O(\d)/, 'Ø$1');
}

function getColor(diameter: string): string {
  const norm = normalizeDiameter(diameter);
  return DIAMETER_COLORS[norm] ?? '#94a3b8';
}

/** Calculate midpoint of a segment's coordinate lines */
function segmentMidpoint(coords: number[][]): { x: number; y: number } {
  if (coords.length === 0) return { x: 0, y: 0 };
  const mid = Math.floor(coords.length / 2);
  const c = coords[mid];
  return { x: (c[0] + c[2]) / 2, y: (c[1] + c[3]) / 2 };
}

// ── Component ──

export default function PipeMapViewer({
  segments: initialSegments,
  branchPoints,
  backgroundLines = [],
  layerName,
  onApprove,
  onBack,
}: PipeMapViewerProps) {
  // -- Local segment state (for diameter corrections) --
  const [segments, setSegments] = useState<EdgeSegment[]>(() =>
    initialSegments.map((s) => ({ ...s, diameter: normalizeDiameter(s.diameter) })),
  );

  // -- Interaction state --
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [popover, setPopover] = useState<{
    segmentId: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [highlightedDiameters, setHighlightedDiameters] = useState<Set<string>>(new Set());
  const [labelOffsets, setLabelOffsets] = useState<Record<number, { dx: number; dy: number }>>({});

  // -- ViewBox state --
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const seg of segments) {
      for (const c of seg.coords) {
        minX = Math.min(minX, c[0], c[2]);
        minY = Math.min(minY, c[1], c[3]);
        maxX = Math.max(maxX, c[0], c[2]);
        maxY = Math.max(maxY, c[1], c[3]);
      }
    }
    for (const bp of branchPoints) {
      minX = Math.min(minX, bp.x);
      minY = Math.min(minY, bp.y);
      maxX = Math.max(maxX, bp.x);
      maxY = Math.max(maxY, bp.y);
    }
    for (const c of backgroundLines) {
      minX = Math.min(minX, c[0], c[2]);
      minY = Math.min(minY, c[1], c[3]);
      maxX = Math.max(maxX, c[0], c[2]);
      maxY = Math.max(maxY, c[1], c[3]);
    }
    if (!isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 };
    }
    return {
      minX: minX - VIEWBOX_PADDING,
      minY: minY - VIEWBOX_PADDING,
      maxX: maxX + VIEWBOX_PADDING,
      maxY: maxY + VIEWBOX_PADDING,
      width: maxX - minX + VIEWBOX_PADDING * 2,
      height: maxY - minY + VIEWBOX_PADDING * 2,
    };
  }, [segments, branchPoints]);

  const [viewBox, setViewBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0, y: 0, w: 1000, h: 1000,
  });

  // Initialize viewBox ONCE from bounds (not on every bounds change)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && isFinite(bounds.minX)) {
      setViewBox({ x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height });
      initializedRef.current = true;
    }
  }, [bounds]);

  const maxY = bounds.maxY + bounds.minY;// for Y-axis flip: flippedY = maxY - y

  // -- Derived data --
  const legendItems = useMemo(() => {
    const map = new Map<string, number>();
    for (const seg of segments) {
      const d = normalizeDiameter(seg.diameter);
      map.set(d, (map.get(d) ?? 0) + seg.length);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
        const nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
        return nb - na;
      })
      .map(([diameter, totalLength]) => ({ diameter, totalLength, color: getColor(diameter) }));
  }, [segments]);

  const stats = useMemo(() => {
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const totalLines = segments.reduce((sum, s) => sum + s.line_count, 0);
    const unspecified = segments.filter((s) => normalizeDiameter(s.diameter) === 'Belirtilmemis').length;
    return { count: segments.length, totalLength, totalLines, unspecified };
  }, [segments]);

  // -- Fit to view --
  const fitToView = useCallback(() => {
    setViewBox({ x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height });
  }, [bounds]);

  // -- Zoom (mouse wheel) --
  // Wheel zoom — must use native listener with {passive:false} to prevent page scroll
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;

      setViewBox((prev) => {
        const nw = prev.w * factor;
        const nh = prev.h * factor;
        return {
          x: prev.x + (prev.w - nw) * mx,
          y: prev.y + (prev.h - nh) * my,
          w: nw,
          h: nh,
        };
      });
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // -- Pan (drag on empty area) --
  const panState = useRef<{ active: boolean; startX: number; startY: number; startVB: typeof viewBox } | null>(null);

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Middle mouse button (button=1) = pan from anywhere
      if (e.button === 1) {
        e.preventDefault();
        panState.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          startVB: { ...viewBox },
        };
        return;
      }
      // Left click on SVG background = close popover
      if (e.button !== 0) return;
      const target = e.target as SVGElement;
      if (target.tagName !== 'svg' && target.tagName !== 'rect') return;
      setSelectedId(null);
    },
    [viewBox],
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!panState.current?.active) return;
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - panState.current.startX) / rect.width) * panState.current.startVB.w;
      const dy = ((e.clientY - panState.current.startY) / rect.height) * panState.current.startVB.h;

      setViewBox({
        x: panState.current.startVB.x - dx,
        y: panState.current.startVB.y - dy,
        w: panState.current.startVB.w,
        h: panState.current.startVB.h,
      });
    },
    [],
  );

  const handleSvgMouseUp = useCallback(() => {
    panState.current = null;
  }, []);

  // -- Label drag --
  const labelDragState = useRef<{
    segmentId: number;
    startX: number;
    startY: number;
    startDx: number;
    startDy: number;
  } | null>(null);

  const handleLabelMouseDown = useCallback(
    (e: React.MouseEvent, segmentId: number) => {
      e.stopPropagation();
      e.preventDefault();
      const offset = labelOffsets[segmentId] ?? { dx: 0, dy: 0 };
      labelDragState.current = {
        segmentId,
        startX: e.clientX,
        startY: e.clientY,
        startDx: offset.dx,
        startDy: offset.dy,
      };

      const onMove = (ev: MouseEvent) => {
        if (!labelDragState.current) return;
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleFactor = viewBox.w / rect.width;

        const ddx = (ev.clientX - labelDragState.current.startX) * scaleFactor;
        const ddy = (ev.clientY - labelDragState.current.startY) * scaleFactor;

        const drag = labelDragState.current;
        if (!drag) return;
        setLabelOffsets((prev) => ({
          ...prev,
          [drag.segmentId]: {
            dx: drag.startDx + ddx,
            dy: drag.startDy + ddy,
          },
        }));
      };

      const onUp = () => {
        labelDragState.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [labelOffsets, viewBox.w],
  );

  // -- Click pipe --
  const handlePipeClick = useCallback(
    (e: React.MouseEvent, segmentId: number) => {
      e.stopPropagation();
      setSelectedId(segmentId);
      setPopover({
        segmentId,
        screenX: e.clientX,
        screenY: e.clientY,
      });
    },
    [],
  );

  // -- Change diameter --
  const handleDiameterChange = useCallback((segmentId: number, newDiameter: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.segment_id === segmentId ? { ...s, diameter: newDiameter } : s)),
    );
  }, []);

  // -- Close popover --
  const closePopover = useCallback(() => {
    setPopover(null);
    setSelectedId(null);
  }, []);

  // -- Toggle legend filter --
  const toggleDiameter = useCallback((diameter: string) => {
    setHighlightedDiameters((prev) => {
      const next = new Set(prev);
      if (next.has(diameter)) {
        next.delete(diameter);
      } else {
        next.add(diameter);
      }
      return next;
    });
  }, []);

  // -- Approve --
  const handleApprove = useCallback(() => {
    onApprove(segments);
  }, [segments, onApprove]);

  // -- Close popover on outside click --
  useEffect(() => {
    if (!popover) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-popover]')) return;
      closePopover();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [popover, closePopover]);

  // -- Flip Y helper --
  const flipY = useCallback((y: number) => maxY - y, [maxY]);

  // -- Is segment faded? --
  const isFaded = useCallback(
    (diameter: string) => {
      if (highlightedDiameters.size === 0) return false;
      return !highlightedDiameters.has(normalizeDiameter(diameter));
    },
    [highlightedDiameters],
  );

  // -- Popover positioning --
  const popoverStyle = useMemo((): React.CSSProperties => {
    if (!popover) return { display: 'none' };
    const container = containerRef.current;
    if (!container) return { display: 'none' };

    const rect = container.getBoundingClientRect();
    const popWidth = 260;
    const popHeight = 240;

    let left = popover.screenX - rect.left + 12;
    let top = popover.screenY - rect.top + 12;

    // Keep in viewport
    if (left + popWidth > rect.width) left = left - popWidth - 24;
    if (top + popHeight > rect.height) top = top - popHeight - 24;
    if (left < 0) left = 8;
    if (top < 0) top = 8;

    return { position: 'absolute', left, top, zIndex: 50 };
  }, [popover]);

  const selectedSegment = popover
    ? segments.find((s) => s.segment_id === popover.segmentId)
    : null;

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Toolbar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1.5 text-sm text-slate-500">
            <span>DWG Metraj</span>
            <span>/</span>
            <span>{layerName}</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Cap Dogrulama</span>
          </nav>
          {stats.unspecified > 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {stats.unspecified} belirtilmemis
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              Hazir
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fitToView}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <SvgIconFit />
            Sigdir
          </button>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={stats.unspecified > 0}
            className={cn(
              'inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-colors',
              stats.unspecified > 0
                ? 'cursor-not-allowed bg-slate-300'
                : 'bg-emerald-600 hover:bg-emerald-700',
            )}
          >
            Onayla
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        {/* SVG Canvas */}
        <div className="relative flex-1">
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
          >
            {/* Grid pattern */}
            <defs>
              <pattern
                id="pipe-grid"
                width={200}
                height={200}
                patternUnits="userSpaceOnUse"
              >
                <line x1={0} y1={0} x2={200} y2={0} stroke="#e2e8f0" strokeWidth={2} />
                <line x1={0} y1={0} x2={0} y2={200} stroke="#e2e8f0" strokeWidth={2} />
              </pattern>
            </defs>

            {/* Background */}
            <rect
              x={viewBox.x - viewBox.w}
              y={viewBox.y - viewBox.h}
              width={viewBox.w * 3}
              height={viewBox.h * 3}
              fill="url(#pipe-grid)"
            />

            {/* Background lines (other layers — grey, thin) */}
            {backgroundLines.map((c, i) => (
              <line
                key={`bg-${i}`}
                x1={c[0]}
                y1={flipY(c[1])}
                x2={c[2]}
                y2={flipY(c[3])}
                stroke="#cbd5e1"
                strokeWidth={4}
                strokeLinecap="round"
                opacity={0.4}
              />
            ))}

            {/* Pipe segments */}
            {segments.map((seg) => {
              const color = getColor(seg.diameter);
              const faded = isFaded(seg.diameter);
              const isSelected = selectedId === seg.segment_id;

              return (
                <g key={seg.segment_id}>
                  {/* Selection glow */}
                  {isSelected &&
                    seg.coords.map((c, i) => (
                      <line
                        key={`glow-${i}`}
                        x1={c[0]}
                        y1={flipY(c[1])}
                        x2={c[2]}
                        y2={flipY(c[3])}
                        stroke={color}
                        strokeWidth={STROKE_WIDTH * 2.5}
                        strokeLinecap="round"
                        opacity={0.25}
                      />
                    ))}

                  {/* Actual lines */}
                  {seg.coords.map((c, i) => (
                    <line
                      key={`line-${i}`}
                      x1={c[0]}
                      y1={flipY(c[1])}
                      x2={c[2]}
                      y2={flipY(c[3])}
                      stroke={color}
                      strokeWidth={STROKE_WIDTH}
                      strokeLinecap="round"
                      opacity={faded ? 0.15 : 0.85}
                      className="transition-opacity duration-200"
                      style={{ cursor: 'pointer', filter: isSelected ? `drop-shadow(0 0 8px ${color})` : undefined }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        if (!isSelected) el.style.filter = `brightness(1.3) drop-shadow(0 0 6px ${color})`;
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        if (!isSelected) el.style.filter = '';
                      }}
                      onClick={(e) => handlePipeClick(e, seg.segment_id)}
                    />
                  ))}
                </g>
              );
            })}

            {/* Branch points */}
            {branchPoints
              .filter((bp) => bp.point_type === 'tee')
              .map((bp, i) => (
                <circle
                  key={`bp-${i}`}
                  cx={bp.x}
                  cy={flipY(bp.y)}
                  r={BRANCH_RADIUS}
                  fill="white"
                  stroke="#94a3b8"
                  strokeWidth={6}
                />
              ))}

            {/* Labels removed — legend renkleri yeterli */}
          </svg>

          {/* Popover (diameter edit) */}
          {popover && selectedSegment && (
            <div data-popover style={popoverStyle}>
              <div className="w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Segment #{selectedSegment.segment_id}
                  </h4>
                  <button
                    type="button"
                    onClick={closePopover}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Kapat"
                  >
                    &times;
                  </button>
                </div>

                <dl className="mb-3 space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <dt>Uzunluk</dt>
                    <dd className="font-medium text-slate-700">{selectedSegment.length.toFixed(2)} m</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Cizgi sayisi</dt>
                    <dd className="font-medium text-slate-700">{selectedSegment.line_count}</dd>
                  </div>
                </dl>

                <label htmlFor="diameter-select" className="mb-1 block text-xs font-medium text-slate-600">
                  Cap
                </label>
                <select
                  id="diameter-select"
                  value={selectedSegment.diameter}
                  onChange={(e) => handleDiameterChange(selectedSegment.segment_id, e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="Belirtilmemis">Belirtilmemis</option>
                  {AVAILABLE_DIAMETERS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Legend + Stats */}
        <aside className="flex w-64 flex-col border-l border-slate-200 bg-white">
          {/* Stats */}
          <div className="border-b border-slate-200 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Ozet
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Segment</dt>
                <dd className="font-medium text-slate-900">{stats.count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Toplam uzunluk</dt>
                <dd className="font-medium text-slate-900">{stats.totalLength.toFixed(2)} m</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Cizgi sayisi</dt>
                <dd className="font-medium text-slate-900">{stats.totalLines}</dd>
              </div>
            </dl>
          </div>

          {/* Legend */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Caplar
            </h3>
            <ul className="space-y-1" role="list">
              {legendItems.map(({ diameter, totalLength, color }) => {
                const active = highlightedDiameters.has(diameter);
                return (
                  <li key={diameter}>
                    <button
                      type="button"
                      onClick={() => toggleDiameter(diameter)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        active ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50',
                      )}
                    >
                      <span
                        className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="flex-1 text-slate-700">{diameter}</span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {totalLength.toFixed(1)}m
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Inline SVG Icons ──

function SvgIconFit() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" />
      <rect x={4} y={4} width={8} height={8} rx={1} />
    </svg>
  );
}
