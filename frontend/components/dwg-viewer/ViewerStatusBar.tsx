'use client';

/**
 * AutoCAD-vari status bar — viewer'in alt tarafinda sticky band.
 *
 * Sol: Mouse'un dunya-uzayindaki koordinati (real-time, pointermove)
 * Orta: Zoom yuzdesi + entity sayilari (cizgi, ekipman, layer)
 * Sag: Birim (mm/cm/m), durum (WebGL/SVG fallback)
 */

import { Crosshair, Layers, Zap } from 'lucide-react';

interface ViewerStatusBarProps {
  /** Mouse'un dunya koordinati. null ise viewer'in disinda. */
  cursorWorld: { x: number; y: number } | null;
  /** Mevcut zoom (1.0 = %100, 0.03 = %3). */
  zoom: number;
  /** Cizgi sayisi (geometry.lines.length veya edgeSegments.length). */
  lineCount: number;
  /** Ekipman/INSERT sayisi. */
  insertCount?: number;
  /** Aktif/secili layer adedi. */
  layerCount?: number;
  /** Birim ('mm' | 'cm' | 'm'). DWG'den auto-detect, kullanici override edebilir. */
  unit?: string;
  /** Renderer adi — 'WebGL' | 'SVG'. */
  renderer?: 'WebGL' | 'SVG';
}

/**
 * Sayilari binlik ayrac ile bicimle (15.034 cizgi).
 */
function fmt(n: number): string {
  return n.toLocaleString('tr-TR');
}

/**
 * Zoom -> yuzde stringi. 0.0648 -> "%6.5", 1.0 -> "%100", 0.0001 -> "%0.01".
 */
function zoomPct(z: number): string {
  if (!Number.isFinite(z) || z <= 0) return '—';
  const pct = z * 100;
  if (pct < 0.1) return `%${pct.toFixed(3)}`;
  if (pct < 1) return `%${pct.toFixed(2)}`;
  if (pct < 10) return `%${pct.toFixed(1)}`;
  return `%${Math.round(pct)}`;
}

/**
 * Dunya koordinatini insanlar icin formatla.
 * Olcek: 0–10000 arasi 1 ondalik, 10000+ tam sayi (cok hassas olmaya gerek yok).
 */
function fmtCoord(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs < 100) return v.toFixed(2);
  if (abs < 10000) return v.toFixed(1);
  return Math.round(v).toString();
}

export function ViewerStatusBar({
  cursorWorld,
  zoom,
  lineCount,
  insertCount = 0,
  layerCount,
  unit = 'mm',
  renderer = 'WebGL',
}: ViewerStatusBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-700 bg-slate-900/95 px-3 py-1.5 font-mono text-[10px] text-slate-300">
      {/* Sol: Koordinat */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 tabular-nums">
          <Crosshair className="h-3 w-3 text-slate-500" />
          {cursorWorld ? (
            <>
              <span className="text-slate-500">X</span>
              <span className="text-slate-100 min-w-[64px] inline-block">{fmtCoord(cursorWorld.x)}</span>
              <span className="text-slate-500">Y</span>
              <span className="text-slate-100 min-w-[64px] inline-block">{fmtCoord(cursorWorld.y)}</span>
              <span className="text-slate-500 ml-0.5">{unit}</span>
            </>
          ) : (
            <span className="text-slate-500">koordinat yok</span>
          )}
        </div>
      </div>

      {/* Orta: Sayilar */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-slate-500">Zoom</span>
          <span className="tabular-nums text-slate-100 min-w-[48px] inline-block">{zoomPct(zoom)}</span>
        </div>
        <div className="text-slate-700">·</div>
        <div className="flex items-center gap-1">
          <span className="tabular-nums text-slate-100">{fmt(lineCount)}</span>
          <span className="text-slate-500">cizgi</span>
        </div>
        {insertCount > 0 && (
          <>
            <div className="text-slate-700">·</div>
            <div className="flex items-center gap-1">
              <span className="tabular-nums text-slate-100">{fmt(insertCount)}</span>
              <span className="text-slate-500">ekipman</span>
            </div>
          </>
        )}
        {typeof layerCount === 'number' && layerCount > 0 && (
          <>
            <div className="text-slate-700">·</div>
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3 text-slate-500" />
              <span className="tabular-nums text-slate-100">{fmt(layerCount)}</span>
              <span className="text-slate-500">layer</span>
            </div>
          </>
        )}
      </div>

      {/* Sag: Renderer + Birim */}
      <div className="flex items-center gap-2">
        <div className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
          {unit}
        </div>
        <div className="flex items-center gap-1">
          <Zap className={`h-3 w-3 ${renderer === 'WebGL' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className={renderer === 'WebGL' ? 'text-emerald-400' : 'text-amber-400'}>{renderer}</span>
        </div>
      </div>
    </div>
  );
}

export default ViewerStatusBar;
